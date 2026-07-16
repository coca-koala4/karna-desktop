'use strict'

const crypto = require('node:crypto')

const PAIRING_TOKEN_TTL = 5 * 60 * 1000
const SAS_CODE_LENGTH = 6
const TOKEN_BYTES = 32

function generateSasCode(serverPublicKey, clientPublicKey, token) {
  const hash = crypto.createHash('sha256')
    .update(serverPublicKey)
    .update(clientPublicKey)
    .update(token)
    .digest()
  const num = hash.readUInt32BE(0) % 1000000
  return String(num).padStart(SAS_CODE_LENGTH, '0')
}

function createPairingService(deps = {}) {
  const {
    cryptoDep = crypto,
    identityManager,
    deviceTrustStore,
    sessionManager,
    auditLogger,
    eventStore,
    tlsCert
  } = deps

  const pendingPairings = new Map()

  function generateToken() {
    return cryptoDep.randomBytes(TOKEN_BYTES).toString('base64url')
  }

  function cleanupExpired() {
    const now = Date.now()
    for (const [token, pairing] of pendingPairings) {
      if (pairing.expiresAt < now) {
        pendingPairings.delete(token)
      }
    }
  }

  function hello(deviceInfo = {}) {
    cleanupExpired()
    const token = generateToken()
    const serverKeyPair = identityManager ? identityManager.getKeyPair() : null
    const serverPublicKey = serverKeyPair ? serverKeyPair.publicKeyPem : null
    const serverFingerprint = identityManager ? identityManager.getPublicFingerprint() : null

    const pairing = {
      token,
      deviceName: deviceInfo.name || 'New Device',
      devicePublicKey: deviceInfo.publicKey || null,
      deviceFingerprint: deviceInfo.fingerprint || null,
      clientEphemeralPublicKey: deviceInfo.ephemeralPublicKey || null,
      serverEphemeralPublicKey: null,
      expiresAt: Date.now() + PAIRING_TOKEN_TTL,
      sasConfirmed: false,
      finalized: false,
      createdAt: Date.now(),
      deviceInfo: deviceInfo
    }

    if (deviceInfo.ephemeralPublicKey && serverKeyPair) {
      const ecdh = cryptoDep.createECDH('prime256v1')
      ecdh.generateKeys()
      pairing.serverEphemeralPublicKey = ecdh.getPublicKey('pem')
    }

    const sasCode = (serverPublicKey && deviceInfo.publicKey)
      ? generateSasCode(serverPublicKey, deviceInfo.publicKey, token)
      : cryptoDep.randomInt(0, 1000000).toString().padStart(SAS_CODE_LENGTH, '0')

    pairing.sasCode = sasCode
    pendingPairings.set(token, pairing)

    if (eventStore) eventStore.append('pairing_hello', { token: token.slice(0, 8), deviceName: pairing.deviceName })

    return {
      token,
      sasCode,
      serverPublicKey,
      serverFingerprint,
      serverEphemeralPublicKey: pairing.serverEphemeralPublicKey,
      expiresAt: pairing.expiresAt,
      tlsCertFingerprint: tlsCert ? tlsCert.fingerprint : null
    }
  }

  function confirm(token, sasCode, deviceInfo = {}) {
    cleanupExpired()
    const pairing = pendingPairings.get(token)
    if (!pairing) {
      if (auditLogger) auditLogger.authFailure({ reason: 'pairing_token_not_found', tokenPreview: token?.slice(0, 8) })
      return { success: false, reason: 'invalid_token' }
    }
    if (pairing.expiresAt < Date.now()) {
      pendingPairings.delete(token)
      if (auditLogger) auditLogger.authFailure({ reason: 'pairing_token_expired' })
      return { success: false, reason: 'token_expired' }
    }
    if (pairing.sasConfirmed) {
      return { success: false, reason: 'already_confirmed' }
    }
    if (pairing.sasCode !== sasCode) {
      if (auditLogger) auditLogger.authFailure({ reason: 'sas_mismatch' })
      return { success: false, reason: 'invalid_sas' }
    }

    pairing.sasConfirmed = true
    pairing.confirmedAt = Date.now()
    if (deviceInfo.name) pairing.deviceName = deviceInfo.name
    if (deviceInfo.publicKey) pairing.devicePublicKey = deviceInfo.publicKey
    if (deviceInfo.fingerprint) pairing.deviceFingerprint = deviceInfo.fingerprint
    if (deviceInfo.ephemeralPublicKey) pairing.clientEphemeralPublicKey = deviceInfo.ephemeralPublicKey

    if (eventStore) eventStore.append('pairing_confirmed', { token: token.slice(0, 8) })

    return {
      success: true,
      token,
      expiresAt: pairing.expiresAt
    }
  }

  function finalize(token, deviceInfo = {}) {
    cleanupExpired()
    const pairing = pendingPairings.get(token)
    if (!pairing) {
      return { success: false, reason: 'invalid_token' }
    }
    if (pairing.expiresAt < Date.now()) {
      pendingPairings.delete(token)
      return { success: false, reason: 'token_expired' }
    }
    if (!pairing.sasConfirmed) {
      return { success: false, reason: 'sas_not_confirmed' }
    }
    if (pairing.finalized) {
      return { success: false, reason: 'already_finalized' }
    }

    if (deviceInfo.name) pairing.deviceName = deviceInfo.name
    if (deviceInfo.publicKey) pairing.devicePublicKey = deviceInfo.publicKey
    if (deviceInfo.fingerprint) pairing.deviceFingerprint = deviceInfo.fingerprint

    let device = null
    if (deviceTrustStore) {
      const existingDevice = pairing.deviceFingerprint
        ? deviceTrustStore.getDeviceByFingerprint(pairing.deviceFingerprint)
        : null

      if (existingDevice) {
        device = deviceTrustStore.updateDevice(existingDevice.id, {
          name: pairing.deviceName,
          publicKey: pairing.devicePublicKey,
          lastSeenAt: Date.now()
        })
      } else {
        device = deviceTrustStore.addDevice({
          name: pairing.deviceName,
          publicKey: pairing.devicePublicKey,
          fingerprint: pairing.deviceFingerprint || cryptoDep.createHash('sha256').update(pairing.devicePublicKey || '').digest('hex').slice(0, 16)
        })
      }
    }

    pairing.finalized = true
    pairing.finalizedAt = Date.now()
    pairing.deviceId = device?.id
    pendingPairings.delete(token)

    if (eventStore) eventStore.append('pairing_finalized', { deviceId: device?.id })
    if (auditLogger && device) auditLogger.devicePair({ deviceId: device.id, deviceName: pairing.deviceName })

    return {
      success: true,
      device: device ? {
        id: device.id,
        name: device.name,
        fingerprint: device.fingerprint,
        permissions: device.permissions
      } : null
    }
  }

  function startPairing(deviceInfo = {}) {
    return hello(deviceInfo)
  }

  function confirmPairing(token, sasCode, deviceInfo = {}) {
    return confirm(token, sasCode, deviceInfo)
  }

  function getPairing(token) {
    cleanupExpired()
    return pendingPairings.get(token) || null
  }

  function cancelPairing(token) {
    const existed = pendingPairings.delete(token)
    if (existed && eventStore) {
      eventStore.append('pairing_cancelled', { tokenPreview: token.slice(0, 8) })
    }
    return existed
  }

  function generateQrPayload(baseUrl, token) {
    const payload = {
      v: 1,
      url: baseUrl,
      token,
      t: Date.now()
    }
    return JSON.stringify(payload)
  }

  function getPairingOffer(baseUrl, token) {
    const pairing = getPairing(token)
    if (!pairing) return null
    return {
      token,
      baseUrl,
      serverPublicKey: identityManager ? identityManager.getKeyPair().publicKeyPem : null,
      serverFingerprint: identityManager ? identityManager.getPublicFingerprint() : null,
      tlsCertFingerprint: tlsCert ? tlsCert.fingerprint : null,
      expiresAt: pairing.expiresAt,
      qrPayload: generateQrPayload(baseUrl, token)
    }
  }

  function initialize() {
    pendingPairings.clear()
  }

  function getPendingCount() {
    cleanupExpired()
    return pendingPairings.size
  }

  return Object.freeze({
    initialize,
    hello,
    confirm,
    finalize,
    startPairing,
    confirmPairing,
    getPairing,
    cancelPairing,
    generateQrPayload,
    getPairingOffer,
    getPendingCount,
    generateSasCode,
    PAIRING_TOKEN_TTL
  })
}

module.exports = { createPairingService, PAIRING_TOKEN_TTL, SAS_CODE_LENGTH }
