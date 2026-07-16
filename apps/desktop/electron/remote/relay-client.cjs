'use strict'

const crypto = require('node:crypto')
const { EventEmitter } = require('node:events')
const WebSocket = require('ws')

const ENVELOPE_VERSION = 'v1'
const MAX_ENVELOPE_SIZE = 1024 * 1024
const DEFAULT_RELAY_URL = 'wss://relay.karna.dev/relay/v1/ws'
const HEARTBEAT_INTERVAL_MS = 30000
const RECONNECT_BASE_DELAY_MS = 1000
const RECONNECT_MAX_DELAY_MS = 60000
const RECONNECT_JITTER_MS = 500
const OFFLINE_MESSAGE_TTL_MS = 24 * 60 * 60 * 1000
const ENVELOPE_DEFAULT_TTL_MS = 5 * 60 * 1000

const ConnectionState = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  AUTHENTICATED: 'authenticated',
  RECONNECTING: 'reconnecting',
  ERROR: 'error'
}

const NetworkMode = {
  LAN: 'lan',
  PEER: 'peer',
  RELAY: 'relay',
  DEGRADED: 'degraded',
  OFFLINE: 'offline'
}

function generateNonce(length = 32) {
  return crypto.randomBytes(length).toString('base64url')
}

function generateRoutingId() {
  return crypto.randomBytes(32).toString('base64url')
}

class EncryptedRelayEnvelope {
  static encrypt(plaintext, sourceRoutingId, targetRoutingId, sessionKey, ttlMs = ENVELOPE_DEFAULT_TTL_MS) {
    const nonce = generateNonce(24)
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', sessionKey, iv)

    let ciphertext = cipher.update(plaintext, 'utf8', 'base64url')
    ciphertext += cipher.final('base64url')
    const authTag = cipher.getAuthTag().toString('base64url')

    const envelope = {
      version: ENVELOPE_VERSION,
      nonce,
      sourceRoutingId,
      targetRoutingId,
      expiresAt: Date.now() + ttlMs,
      ciphertext: `${iv.toString('base64url')}.${authTag}.${ciphertext}`
    }

    return envelope
  }

  static decrypt(envelope, sessionKey) {
    if (envelope.version !== ENVELOPE_VERSION) {
      throw new Error(`Unsupported envelope version: ${envelope.version}`)
    }

    const [ivB64, authTagB64, ciphertextB64] = envelope.ciphertext.split('.')
    if (!ivB64 || !authTagB64 || !ciphertextB64) {
      throw new Error('Invalid ciphertext format')
    }

    const iv = Buffer.from(ivB64, 'base64url')
    const authTag = Buffer.from(authTagB64, 'base64url')
    const ciphertext = Buffer.from(ciphertextB64, 'base64url')

    const decipher = crypto.createDecipheriv('aes-256-gcm', sessionKey, iv)
    decipher.setAuthTag(authTag)

    let plaintext = decipher.update(ciphertext, null, 'utf8')
    plaintext += decipher.final('utf8')

    return plaintext
  }
}

class OfflineMessageCache {
  constructor(ttlMs = OFFLINE_MESSAGE_TTL_MS) {
    this.ttlMs = ttlMs
    this.messages = new Map()
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000)
  }

  push(targetRoutingId, envelope) {
    if (!this.messages.has(targetRoutingId)) {
      this.messages.set(targetRoutingId, [])
    }
    this.messages.get(targetRoutingId).push({
      envelope,
      receivedAt: Date.now()
    })
  }

  drain(targetRoutingId) {
    const msgs = this.messages.get(targetRoutingId) || []
    this.messages.delete(targetRoutingId)
    return msgs.filter(m => Date.now() - m.receivedAt < this.ttlMs).map(m => m.envelope)
  }

  cleanup() {
    const now = Date.now()
    for (const [targetId, msgs] of this.messages.entries()) {
      const valid = msgs.filter(m => now - m.receivedAt < this.ttlMs)
      if (valid.length === 0) {
        this.messages.delete(targetId)
      } else {
        this.messages.set(targetId, valid)
      }
    }
  }

  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.messages.clear()
  }
}

class RelayClient extends EventEmitter {
  constructor(options = {}) {
    super()
    this.relayUrl = options.relayUrl || DEFAULT_RELAY_URL
    this.routingId = options.routingId || generateRoutingId()
    this.authToken = options.authToken || null
    this.sessionKeys = options.sessionKeys || new Map()
    this.autoReconnect = options.autoReconnect !== false
    this.lanAvailable = options.lanAvailable || false
    this.peerAvailable = options.peerAvailable || false

    this.ws = null
    this.state = ConnectionState.DISCONNECTED
    this.networkMode = NetworkMode.OFFLINE
    this.reconnectAttempts = 0
    this.reconnectTimer = null
    this.heartbeatInterval = null
    this.pongReceived = true

    this.offlineCache = new OfflineMessageCache()
    this.pendingNonces = new Set()
    this.messageQueue = []
  }

  getStatus() {
    return {
      state: this.state,
      networkMode: this.networkMode,
      relayUrl: this.relayUrl,
      routingId: this.routingId,
      connected: this.state === ConnectionState.AUTHENTICATED,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
      cachedOfflineMessages: Array.from(this.offlineCache.messages.values()).reduce((sum, arr) => sum + arr.length, 0)
    }
  }

  setLanAvailable(available) {
    const previousMode = this.networkMode
    this.lanAvailable = available
    this.updateNetworkMode()
    if (previousMode !== this.networkMode) {
      this.emit('networkModeChanged', this.networkMode, previousMode)
    }
  }

  setPeerAvailable(available) {
    const previousMode = this.networkMode
    this.peerAvailable = available
    this.updateNetworkMode()
    if (previousMode !== this.networkMode) {
      this.emit('networkModeChanged', this.networkMode, previousMode)
    }
  }

  updateNetworkMode() {
    if (this.lanAvailable) {
      this.networkMode = NetworkMode.LAN
    } else if (this.peerAvailable) {
      this.networkMode = NetworkMode.PEER
    } else if (this.state === ConnectionState.AUTHENTICATED) {
      this.networkMode = NetworkMode.RELAY
    } else if (this.state === ConnectionState.CONNECTING || this.state === ConnectionState.RECONNECTING) {
      this.networkMode = NetworkMode.DEGRADED
    } else {
      this.networkMode = NetworkMode.OFFLINE
    }
  }

  getSessionKey(peerRoutingId) {
    return this.sessionKeys.get(peerRoutingId)
  }

  setSessionKey(peerRoutingId, key) {
    if (Buffer.isBuffer(key) && key.length === 32) {
      this.sessionKeys.set(peerRoutingId, key)
    } else if (typeof key === 'string') {
      const keyBuf = Buffer.from(key, 'base64url')
      if (keyBuf.length === 32) {
        this.sessionKeys.set(peerRoutingId, keyBuf)
      }
    }
  }

  setAuthToken(token) {
    this.authToken = token
    if (this.state === ConnectionState.CONNECTED) {
      this.authenticate()
    }
  }

  connect() {
    if (this.state === ConnectionState.CONNECTED || this.state === ConnectionState.AUTHENTICATED || this.state === ConnectionState.CONNECTING) {
      return
    }

    this.state = ConnectionState.CONNECTING
    this.updateNetworkMode()
    this.emit('stateChanged', this.state)

    const url = new URL(this.relayUrl)
    url.searchParams.set('routingId', this.routingId)

    try {
      this.ws = new WebSocket(url.toString(), {
        perMessageDeflate: false,
        handshakeTimeout: 10000
      })

      this.ws.on('open', () => this.handleOpen())
      this.ws.on('message', (data) => this.handleMessage(data))
      this.ws.on('close', (code, reason) => this.handleClose(code, reason))
      this.ws.on('error', (error) => this.handleError(error))
      this.ws.on('pong', () => { this.pongReceived = true })
    } catch (error) {
      this.handleError(error)
    }
  }

  disconnect(reason = 'client_initiated') {
    this.autoReconnect = false
    this.clearReconnectTimer()
    this.stopHeartbeat()

    if (this.ws) {
      try {
        this.ws.close(1000, reason)
      } catch (_) {}
      this.ws = null
    }

    this.state = ConnectionState.DISCONNECTED
    this.networkMode = this.lanAvailable ? NetworkMode.LAN : (this.peerAvailable ? NetworkMode.PEER : NetworkMode.OFFLINE)
    this.emit('stateChanged', this.state)
    this.emit('disconnected', reason)
  }

  sendToPeer(targetRoutingId, plaintext, options = {}) {
    const sessionKey = this.getSessionKey(targetRoutingId)
    if (!sessionKey) {
      this.messageQueue.push({ targetRoutingId, plaintext, options, attempts: 0 })
      return false
    }

    if (this.state !== ConnectionState.AUTHENTICATED) {
      this.messageQueue.push({ targetRoutingId, plaintext, options, attempts: 0 })
      if (this.state === ConnectionState.DISCONNECTED || this.state === ConnectionState.ERROR) {
        this.connect()
      }
      return false
    }

    try {
      const envelope = EncryptedRelayEnvelope.encrypt(
        typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext),
        this.routingId,
        targetRoutingId,
        sessionKey,
        options.ttlMs || ENVELOPE_DEFAULT_TTL_MS
      )

      if (this.pendingNonces.has(envelope.nonce)) {
        return false
      }
      this.pendingNonces.add(envelope.nonce)
      setTimeout(() => this.pendingNonces.delete(envelope.nonce), 300000)

      const serialized = JSON.stringify(envelope)
      if (Buffer.byteLength(serialized) > MAX_ENVELOPE_SIZE) {
        this.emit('error', new Error('Envelope too large'))
        return false
      }

      this.ws.send(serialized)
      return true
    } catch (error) {
      this.emit('error', error)
      this.messageQueue.push({ targetRoutingId, plaintext, options, attempts: 0 })
      return false
    }
  }

  handleOpen() {
    this.state = ConnectionState.CONNECTED
    this.reconnectAttempts = 0
    this.pongReceived = true
    this.emit('stateChanged', this.state)
    this.emit('connected')

    this.startHeartbeat()

    if (this.authToken) {
      this.authenticate()
    } else {
      this.state = ConnectionState.AUTHENTICATED
      this.updateNetworkMode()
      this.emit('stateChanged', this.state)
      this.emit('authenticated')
      this.flushMessageQueue()
      this.deliverOfflineMessages()
    }
  }

  authenticate() {
    const authMessage = JSON.stringify({
      type: 'auth',
      routingId: this.routingId,
      token: this.authToken,
      timestamp: Date.now()
    })
    this.ws.send(authMessage)
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data.toString())

      if (message.error) {
        this.emit('relayError', message)
        return
      }

      if (message.type === 'auth_ok') {
        this.state = ConnectionState.AUTHENTICATED
        this.updateNetworkMode()
        this.emit('stateChanged', this.state)
        this.emit('authenticated')
        this.flushMessageQueue()
        this.deliverOfflineMessages()
        return
      }

      if (message.type === 'auth_failed') {
        this.state = ConnectionState.ERROR
        this.emit('stateChanged', this.state)
        this.emit('authFailed', message)
        this.scheduleReconnect()
        return
      }

      if (message.version === ENVELOPE_VERSION) {
        this.handleEnvelope(message)
        return
      }

      if (message.type === 'pong') {
        this.pongReceived = true
        return
      }

      this.emit('message', message)
    } catch (error) {
      this.emit('error', error)
    }
  }

  handleEnvelope(envelope) {
    if (envelope.expiresAt < Date.now()) {
      return
    }

    const sessionKey = this.getSessionKey(envelope.sourceRoutingId)
    if (!sessionKey) {
      this.offlineCache.push(envelope.sourceRoutingId, envelope)
      this.emit('envelopeCached', envelope)
      return
    }

    try {
      const plaintext = EncryptedRelayEnvelope.decrypt(envelope, sessionKey)
      let parsed
      try {
        parsed = JSON.parse(plaintext)
      } catch (_) {
        parsed = plaintext
      }
      this.emit('relayMessage', {
        from: envelope.sourceRoutingId,
        to: envelope.targetRoutingId,
        payload: parsed,
        envelope
      })
    } catch (error) {
      this.emit('decryptFailed', { envelope, error })
      this.offlineCache.push(envelope.sourceRoutingId, envelope)
    }
  }

  handleClose(code, reason) {
    this.stopHeartbeat()
    this.ws = null

    const wasAuthenticated = this.state === ConnectionState.AUTHENTICATED
    this.state = ConnectionState.DISCONNECTED
    this.updateNetworkMode()
    this.emit('stateChanged', this.state)
    this.emit('close', { code, reason: reason?.toString() })

    if (wasAuthenticated) {
      this.emit('connectionLost', { code, reason: reason?.toString() })
    }

    if (this.autoReconnect) {
      this.scheduleReconnect()
    }
  }

  handleError(error) {
    this.state = ConnectionState.ERROR
    this.updateNetworkMode()
    this.emit('stateChanged', this.state)
    this.emit('error', error)

    if (this.autoReconnect) {
      this.scheduleReconnect()
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) {
      return
    }

    this.state = ConnectionState.RECONNECTING
    this.updateNetworkMode()
    this.emit('stateChanged', this.state)

    const delay = this.calculateReconnectDelay()
    this.emit('reconnecting', { attempt: this.reconnectAttempts, delayMs: delay })

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  calculateReconnectDelay() {
    const exponentialDelay = RECONNECT_BASE_DELAY_MS * Math.pow(2, Math.min(this.reconnectAttempts, 10))
    const jitter = Math.random() * RECONNECT_JITTER_MS
    this.reconnectAttempts++
    return Math.min(exponentialDelay + jitter, RECONNECT_MAX_DELAY_MS)
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  startHeartbeat() {
    this.stopHeartbeat()
    this.pongReceived = true
    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return
      }
      if (!this.pongReceived) {
        try {
          this.ws.terminate()
        } catch (_) {}
        return
      }
      this.pongReceived = false
      try {
        this.ws.ping()
      } catch (_) {}
    }, HEARTBEAT_INTERVAL_MS)
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  flushMessageQueue() {
    const queue = [...this.messageQueue]
    this.messageQueue = []
    for (const msg of queue) {
      msg.attempts++
      if (msg.attempts > 5) {
        this.emit('messageDropped', msg)
        continue
      }
      this.sendToPeer(msg.targetRoutingId, msg.plaintext, msg.options)
    }
  }

  deliverOfflineMessages() {
    const cached = this.offlineCache.drain(this.routingId)
    for (const envelope of cached) {
      this.handleEnvelope(envelope)
    }
  }

  registerSessionKey(peerRoutingId, key) {
    this.setSessionKey(peerRoutingId, key)
    const pending = this.offlineCache.drain(peerRoutingId)
    for (const envelope of pending) {
      this.handleEnvelope(envelope)
    }
  }

  shutdown() {
    this.autoReconnect = false
    this.disconnect('shutdown')
    this.offlineCache.shutdown()
    this.pendingNonces.clear()
    this.messageQueue = []
    this.removeAllListeners()
  }
}

function createRelayClient(options = {}) {
  return new RelayClient(options)
}

module.exports = {
  createRelayClient,
  RelayClient,
  EncryptedRelayEnvelope,
  OfflineMessageCache,
  ConnectionState,
  NetworkMode,
  ENVELOPE_VERSION,
  DEFAULT_RELAY_URL
}
