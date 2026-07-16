'use strict'

const os = require('node:os')
const { EventEmitter } = require('node:events')
const { exec } = require('node:child_process')

const PRIVATE_IPV4_RANGES = [
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  { start: '127.0.0.1', end: '127.255.255.255' }
]

const NETWORK_CHECK_INTERVAL_MS = 5000
const WAKE_CHECK_INTERVAL_MS = 30000

function ipToInt(ip) {
  return ip.split('.').reduce((int, oct) => (int << 8) + parseInt(oct, 10), 0) >>> 0
}

function isPrivateIPv4(ip) {
  if (!ip || typeof ip !== 'string') return false
  if (ip === '0.0.0.0' || ip === '::' || ip === '0:0:0:0:0:0:0:0') return false
  const parts = ip.split('.')
  if (parts.length !== 4) return false
  const intIp = ipToInt(ip)
  return PRIVATE_IPV4_RANGES.some(range => {
    return intIp >= ipToInt(range.start) && intIp <= ipToInt(range.end)
  })
}

function isPrivateIPv6(ip) {
  if (!ip || typeof ip !== 'string') return false
  if (ip === '::1' || ip === 'fe80::' || ip.startsWith('fe80:')) return true
  return ip.startsWith('fd') || ip.startsWith('fc')
}

function getInterfaceSignature(addrs) {
  if (!addrs) return ''
  return addrs
    .filter(a => !a.internal)
    .map(a => `${a.family}:${a.address}`)
    .sort()
    .join('|')
}

function detectPrivateInterfaces() {
  const interfaces = os.networkInterfaces()
  const result = []

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue
    for (const addr of addrs) {
      if (addr.internal) continue
      if (addr.family === 'IPv4' && isPrivateIPv4(addr.address)) {
        result.push({
          name,
          address: addr.address,
          family: 'IPv4',
          netmask: addr.netmask,
          mac: addr.mac
        })
      } else if (addr.family === 'IPv6' && isPrivateIPv6(addr.address)) {
        result.push({
          name,
          address: addr.address,
          family: 'IPv6',
          netmask: addr.netmask,
          mac: addr.mac
        })
      }
    }
  }

  return result
}

function hasLanConnectivity() {
  const interfaces = detectPrivateInterfaces()
  return interfaces.length > 0 && interfaces.some(i => !i.address.startsWith('127.') && !i.address.startsWith('fe80'))
}

function selectBestBindAddress() {
  const interfaces = detectPrivateInterfaces()
  const ipv4Interfaces = interfaces.filter(i => i.family === 'IPv4' && !i.address.startsWith('127.'))

  if (ipv4Interfaces.length === 0) {
    const v6Interfaces = interfaces.filter(i => i.family === 'IPv6' && i.address !== '::1')
    if (v6Interfaces.length > 0) {
      return v6Interfaces[0].address
    }
    return '127.0.0.1'
  }

  const preferred = ipv4Interfaces.find(i =>
    i.address.startsWith('192.168.') || i.address.startsWith('10.')
  )
  return preferred ? preferred.address : ipv4Interfaces[0].address
}

function validateBindAddress(address) {
  if (!address || typeof address !== 'string') {
    return { valid: false, reason: 'Address is required' }
  }
  if (address === '0.0.0.0' || address === '::') {
    return { valid: false, reason: 'Binding to all interfaces (0.0.0.0/::) is not allowed; use selectBestBindAddress instead' }
  }
  if (isPrivateIPv4(address) || isPrivateIPv6(address)) {
    return { valid: true }
  }
  return { valid: false, reason: 'Only private network addresses are allowed' }
}

function getNetworkFingerprint() {
  const interfaces = os.networkInterfaces()
  const sigParts = []
  for (const [name, addrs] of Object.entries(interfaces)) {
    sigParts.push(`${name}:${getInterfaceSignature(addrs)}`)
  }
  return sigParts.sort().join('||')
}

class NetworkMonitor extends EventEmitter {
  constructor(options = {}) {
    super()
    this.checkInterval = options.checkInterval || NETWORK_CHECK_INTERVAL_MS
    this.wakeCheckInterval = options.wakeCheckInterval || WAKE_CHECK_INTERVAL_MS
    this.checkTimer = null
    this.wakeTimer = null
    this.lastFingerprint = getNetworkFingerprint()
    this.lastCheckTime = Date.now()
    this.running = false
    this.lanAvailable = hasLanConnectivity()
  }

  start() {
    if (this.running) return
    this.running = true
    this.lastCheckTime = Date.now()

    this.checkTimer = setInterval(() => this.checkNetworkChange(), this.checkInterval)
    this.wakeTimer = setInterval(() => this.checkWakeFromSleep(), this.wakeCheckInterval)
  }

  stop() {
    this.running = false
    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }
    if (this.wakeTimer) {
      clearInterval(this.wakeTimer)
      this.wakeTimer = null
    }
  }

  checkNetworkChange() {
    const currentFingerprint = getNetworkFingerprint()
    const currentLan = hasLanConnectivity()

    if (currentFingerprint !== this.lastFingerprint) {
      const previousLan = this.lanAvailable
      this.lastFingerprint = currentFingerprint
      this.lanAvailable = currentLan

      this.emit('networkChanged', {
        type: 'interfacesChanged',
        interfaces: detectPrivateInterfaces(),
        lanAvailable: currentLan,
        previousLanAvailable: previousLan,
        timestamp: Date.now()
      })

      if (currentLan !== previousLan) {
        this.emit('lanConnectivityChanged', {
          available: currentLan,
          timestamp: Date.now()
        })
      }
    }

    this.lastCheckTime = Date.now()
  }

  checkWakeFromSleep() {
    const now = Date.now()
    const timeSinceLastCheck = now - this.lastCheckTime

    if (timeSinceLastCheck > this.wakeCheckInterval * 2) {
      this.emit('resumeFromSleep', {
        sleepDurationMs: timeSinceLastCheck - this.checkInterval,
        timestamp: now
      })
      this.lastFingerprint = ''
      setTimeout(() => this.checkNetworkChange(), 1000)
    }

    this.lastCheckTime = now
  }

  getStatus() {
    return {
      running: this.running,
      lanAvailable: this.lanAvailable,
      interfaces: detectPrivateInterfaces(),
      lastCheckTime: this.lastCheckTime,
      fingerprint: this.lastFingerprint
    }
  }
}

function createNetworkUtils(deps = {}) {
  const monitor = new NetworkMonitor(deps)

  return Object.freeze({
    detectPrivateInterfaces,
    validateBindAddress,
    isPrivateIPv4,
    isPrivateIPv6,
    hasLanConnectivity,
    selectBestBindAddress,
    getNetworkFingerprint,
    createNetworkMonitor: (opts) => new NetworkMonitor(opts),
    monitor
  })
}

module.exports = {
  createNetworkUtils,
  NetworkMonitor,
  hasLanConnectivity,
  selectBestBindAddress,
  getNetworkFingerprint
}

