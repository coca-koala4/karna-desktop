'use strict'

const crypto = require('node:crypto')
const { EventEmitter } = require('node:events')

const PUSH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000
const WAKE_NOTIFICATION_TTL_MS = 5 * 60 * 1000

class PushRegistrationService extends EventEmitter {
  constructor(options = {}) {
    super()
    this.storage = options.storage || new Map()
    this.relayClient = options.relayClient || null
    this.fcmConfigured = false
    this.tokens = new Map()
    this.pendingNotifications = new Map()
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 60 * 1000)

    this.loadTokens()
  }

  loadTokens() {
    try {
      for (const [key, value] of this.storage.entries()) {
        if (key.startsWith('push_token:')) {
          const token = JSON.parse(value)
          if (token.expiresAt > Date.now()) {
            this.tokens.set(token.deviceId, token)
          }
        }
      }
    } catch (_) {}
  }

  saveToken(token) {
    try {
      this.storage.set(`push_token:${token.deviceId}`, JSON.stringify(token))
    } catch (_) {}
  }

  deleteToken(deviceId) {
    this.tokens.delete(deviceId)
    try {
      this.storage.delete(`push_token:${deviceId}`)
    } catch (_) {}
  }

  getStatus() {
    const registeredDevices = this.tokens.size
    const now = Date.now()
    const activeTokens = Array.from(this.tokens.values()).filter(t => t.expiresAt > now)

    return {
      configured: this.fcmConfigured,
      available: true,
      registeredDevices: activeTokens.length,
      pendingNotifications: this.pendingNotifications.size,
      message: this.fcmConfigured
        ? `Push notifications active (${activeTokens.length} devices)`
        : '后台推送未配置 (FCM not configured)'
    }
  }

  async registerToken(fcmToken, options = {}) {
    if (!fcmToken || typeof fcmToken !== 'string') {
      return { success: false, error: 'invalid_token' }
    }

    const deviceId = options.deviceId || crypto.randomUUID()
    const platform = options.platform || 'android'

    const existing = this.tokens.get(deviceId)
    const token = {
      deviceId,
      platform,
      fcmToken,
      registeredAt: Date.now(),
      lastSeenAt: Date.now(),
      expiresAt: Date.now() + PUSH_TOKEN_TTL_MS,
      previousToken: existing?.fcmToken || null
    }

    this.tokens.set(deviceId, token)
    this.saveToken(token)

    this.emit('tokenRegistered', { deviceId, platform })

    return {
      success: true,
      deviceId,
      registered: true,
      renewed: Boolean(existing),
      expiresAt: token.expiresAt
    }
  }

  async rotateToken(oldToken, newToken, options = {}) {
    for (const [deviceId, token] of this.tokens.entries()) {
      if (token.fcmToken === oldToken) {
        token.fcmToken = newToken
        token.lastSeenAt = Date.now()
        token.expiresAt = Date.now() + PUSH_TOKEN_TTL_MS
        this.saveToken(token)
        this.emit('tokenRotated', { deviceId })
        return { success: true, deviceId }
      }
    }
    return { success: false, error: 'token_not_found' }
  }

  async revokeToken(deviceId) {
    this.deleteToken(deviceId)
    this.emit('tokenRevoked', { deviceId })
    return { success: true }
  }

  async sendWakeNotification(deviceId, eventSummary = {}) {
    const token = this.tokens.get(deviceId)
    if (!token) {
      return { success: false, error: 'device_not_registered' }
    }

    if (!this.fcmConfigured) {
      return this.sendViaRelay(deviceId, eventSummary)
    }

    token.lastSeenAt = Date.now()
    this.saveToken(token)

    const notificationId = crypto.randomUUID()
    const notification = {
      id: notificationId,
      deviceId,
      type: 'wake',
      summary: {
        eventType: eventSummary.type || 'new_event',
        timestamp: Date.now(),
        projectId: eventSummary.projectId,
        hasPendingInteractions: eventSummary.hasPendingInteractions || false
      },
      createdAt: Date.now(),
      expiresAt: Date.now() + WAKE_NOTIFICATION_TTL_MS
    }

    this.pendingNotifications.set(notificationId, notification)

    try {
      await this.sendFCM(token.fcmToken, notification)
      this.emit('wakeSent', { deviceId, notificationId })
      return { success: true, notificationId, via: 'fcm' }
    } catch (fcmError) {
      return this.sendViaRelay(deviceId, eventSummary, notification)
    }
  }

  async sendViaRelay(deviceId, eventSummary, existingNotification = null) {
    if (!this.relayClient) {
      return { success: false, error: 'relay_unavailable' }
    }

    const notificationId = existingNotification?.id || crypto.randomUUID()
    const wakeMessage = {
      type: 'push.wake',
      notificationId,
      timestamp: Date.now(),
      summary: {
        eventType: eventSummary.type || 'new_event',
        hasPendingInteractions: eventSummary.hasPendingInteractions || false,
        projectId: eventSummary.projectId
      }
    }

    const routingId = this.getRoutingIdForDevice(deviceId)
    if (!routingId) {
      return { success: false, error: 'routing_id_not_found' }
    }

    const sent = this.relayClient.sendToPeer(routingId, wakeMessage)
    return {
      success: sent,
      notificationId,
      via: 'relay',
      queued: !sent
    }
  }

  async sendFCM(fcmToken, notification) {
    return new Promise((resolve, reject) => {
      if (!this.fcmConfigured) {
        reject(new Error('FCM not configured'))
        return
      }
      setTimeout(() => reject(new Error('FCM not implemented in this version')), 10)
    })
  }

  setFCMConfigured(configured) {
    this.fcmConfigured = configured
    this.emit('configChanged', { fcmConfigured: configured })
  }

  setRelayClient(client) {
    this.relayClient = client
  }

  setRoutingIdForDevice(deviceId, routingId) {
    try {
      this.storage.set(`device_routing:${deviceId}`, routingId)
    } catch (_) {}
  }

  getRoutingIdForDevice(deviceId) {
    try {
      return this.storage.get(`device_routing:${deviceId}`)
    } catch (_) {
      return null
    }
  }

  getPendingNotifications(deviceId) {
    const now = Date.now()
    return Array.from(this.pendingNotifications.values())
      .filter(n => n.deviceId === deviceId && n.expiresAt > now)
  }

  acknowledgeNotification(notificationId) {
    return this.pendingNotifications.delete(notificationId)
  }

  cleanup() {
    const now = Date.now()

    for (const [deviceId, token] of this.tokens.entries()) {
      if (token.expiresAt < now) {
        this.deleteToken(deviceId)
        this.emit('tokenExpired', { deviceId })
      }
    }

    for (const [id, notification] of this.pendingNotifications.entries()) {
      if (notification.expiresAt < now) {
        this.pendingNotifications.delete(id)
      }
    }
  }

  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    this.tokens.clear()
    this.pendingNotifications.clear()
    this.removeAllListeners()
  }
}

function createPushRegistrationService(options = {}) {
  return new PushRegistrationService(options)
}

module.exports = {
  createPushRegistrationService,
  PushRegistrationService
}
