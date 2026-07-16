'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const TRUST_STORE_FILE = 'trusted-devices.json'

const DEFAULT_PERMISSIONS = Object.freeze({
  chat: false,
  read_projects: false,
  write_projects: false,
  execute_commands: false,
  manage_settings: false
})

function createDeviceTrustStore(deps = {}) {
  const {
    paths,
    app,
    fs: fsDep = fs,
    cryptoDep = crypto
  } = deps

  let devices = new Map()
  let storePath = null
  let initialized = false

  if (paths) {
    const dataRoot = typeof paths.dataRoot === 'function' ? paths.dataRoot({ app }) : paths.dataRoot
    storePath = path.join(dataRoot, 'remote', TRUST_STORE_FILE)
  }

  function load() {
    if (!storePath || !fsDep.existsSync(storePath)) {
      devices = new Map()
      return
    }
    try {
      const raw = fsDep.readFileSync(storePath, 'utf8')
      const data = JSON.parse(raw)
      devices = new Map(Object.entries(data.devices || {}))
    } catch (_) {
      devices = new Map()
    }
  }

  function persist() {
    if (!storePath) return
    try {
      fsDep.mkdirSync(path.dirname(storePath), { recursive: true })
      const data = {
        version: 1,
        updatedAt: Date.now(),
        devices: Object.fromEntries(devices)
      }
      fsDep.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8')
    } catch (_) {
    }
  }

  function initialize() {
    load()
    initialized = true
  }

  function generateDeviceId() {
    return cryptoDep.randomUUID()
  }

  function addDevice(deviceInfo) {
    if (!initialized) initialize()
    const id = deviceInfo.id || generateDeviceId()
    const device = {
      id,
      name: deviceInfo.name || 'Unknown Device',
      publicKey: deviceInfo.publicKey,
      fingerprint: deviceInfo.fingerprint,
      permissions: { ...DEFAULT_PERMISSIONS, ...(deviceInfo.permissions || {}) },
      pairedAt: Date.now(),
      lastSeenAt: Date.now(),
      trusted: true,
      metadata: deviceInfo.metadata || {}
    }
    devices.set(id, device)
    persist()
    return device
  }

  function getDevice(id) {
    if (!initialized) initialize()
    return devices.get(id) || null
  }

  function getDeviceByFingerprint(fingerprint) {
    if (!initialized) initialize()
    for (const device of devices.values()) {
      if (device.fingerprint === fingerprint) return device
    }
    return null
  }

  function listDevices() {
    if (!initialized) initialize()
    return Array.from(devices.values())
  }

  function updateDevice(id, updates) {
    if (!initialized) initialize()
    const device = devices.get(id)
    if (!device) return null
    if (updates.permissions) {
      device.permissions = { ...device.permissions, ...updates.permissions }
    }
    if (updates.name) device.name = updates.name
    if (updates.lastSeenAt !== undefined) device.lastSeenAt = updates.lastSeenAt
    if (updates.metadata) device.metadata = { ...device.metadata, ...updates.metadata }
    devices.set(id, device)
    persist()
    return device
  }

  function revokeDevice(id) {
    if (!initialized) initialize()
    const device = devices.get(id)
    if (!device) return false
    device.trusted = false
    device.revokedAt = Date.now()
    devices.set(id, device)
    persist()
    return true
  }

  function removeDevice(id) {
    if (!initialized) initialize()
    const existed = devices.delete(id)
    if (existed) persist()
    return existed
  }

  function touchDevice(id) {
    return updateDevice(id, { lastSeenAt: Date.now() })
  }

  function checkPermission(deviceId, permission) {
    const device = getDevice(deviceId)
    if (!device || !device.trusted) return false
    return Boolean(device.permissions[permission])
  }

  return Object.freeze({
    initialize,
    addDevice,
    getDevice,
    getDeviceByFingerprint,
    listDevices,
    updateDevice,
    revokeDevice,
    removeDevice,
    touchDevice,
    checkPermission,
    DEFAULT_PERMISSIONS
  })
}

module.exports = { createDeviceTrustStore, DEFAULT_PERMISSIONS }
