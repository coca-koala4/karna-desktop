'use strict'

const crypto = require('node:crypto')

const SESSION_KEY_LENGTH = 32
const SESSION_TOKEN_LENGTH = 32
const HMAC_ALGORITHM = 'SHA256'
const MAX_SEQ_GAP = 100
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

function createSessionManager(deps = {}) {
  const {
    cryptoDep = crypto,
    identityManager,
    eventStore,
    auditLogger
  } = deps

  const sessions = new Map()
  const tokenToSession = new Map()

  function generateSessionId() {
    return cryptoDep.randomUUID()
  }

  function generateSessionKey() {
    return cryptoDep.randomBytes(SESSION_KEY_LENGTH)
  }

  function generateSessionToken() {
    return cryptoDep.randomBytes(SESSION_TOKEN_LENGTH).toString('base64url')
  }

  function generateEphemeralKeyPair() {
    const ecdh = cryptoDep.createECDH('prime256v1')
    const publicKey = ecdh.generateKeys()
    return {
      publicKey: ecdh.getPublicKey('pem'),
      privateKey: ecdh.getPrivateKey('pem'),
      ecdh
    }
  }

  function deriveSharedSecret(serverPrivateKey, clientPublicKey) {
    const ecdh = cryptoDep.createECDH('prime256v1')
    ecdh.setPrivateKey(serverPrivateKey, 'pem')
    const sharedSecret = ecdh.computeSecret(clientPublicKey, 'pem')
    return cryptoDep.createHash('sha256').update(sharedSecret).digest()
  }

  function createSession(deviceId, devicePublicKey, options = {}) {
    const sessionId = generateSessionId()
    const sessionKey = generateSessionKey()
    const sessionToken = generateSessionToken()

    const ephemeral = generateEphemeralKeyPair()

    const session = {
      id: sessionId,
      deviceId,
      devicePublicKey,
      sessionKey,
      sessionToken,
      ephemeralPublicKey: ephemeral.publicKey,
      ephemeralPrivateKey: ephemeral.privateKey,
      ecdh: ephemeral.ecdh,
      clientEphemeralPublicKey: null,
      sharedSecret: null,
      seqIn: 0,
      seqOut: 0,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
      remoteAddress: options.remoteAddress || null,
      closed: false,
      metadata: options.metadata || {}
    }
    sessions.set(sessionId, session)
    tokenToSession.set(sessionToken, sessionId)
    if (eventStore) eventStore.append('session_created', { sessionId, deviceId })
    if (auditLogger) auditLogger.sessionStart({ sessionId, deviceId })
    return {
      id: sessionId,
      deviceId: session.deviceId,
      sessionKey: sessionKey.toString('base64'),
      sessionToken,
      ephemeralPublicKey: ephemeral.publicKey,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt
    }
  }

  function openSession(deviceId, devicePublicKey, clientEphemeralPublicKey, options = {}) {
    const sessionId = generateSessionId()
    const sessionToken = generateSessionToken()
    const ephemeral = generateEphemeralKeyPair()

    let sharedSecret
    try {
      sharedSecret = ephemeral.ecdh.computeSecret(clientEphemeralPublicKey, 'pem')
    } catch (e) {
      throw new Error('invalid_client_ephemeral_key')
    }

    const sessionKey = cryptoDep.createHmac(HMAC_ALGORITHM, sharedSecret)
      .update('session-key-derivation')
      .update(sessionId)
      .digest()

    const session = {
      id: sessionId,
      deviceId,
      devicePublicKey,
      sessionKey,
      sessionToken,
      ephemeralPublicKey: ephemeral.publicKey,
      ephemeralPrivateKey: ephemeral.privateKey,
      ecdh: ephemeral.ecdh,
      clientEphemeralPublicKey,
      sharedSecret,
      seqIn: 0,
      seqOut: 0,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
      remoteAddress: options.remoteAddress || null,
      closed: false,
      metadata: options.metadata || {}
    }
    sessions.set(sessionId, session)
    tokenToSession.set(sessionToken, sessionId)
    if (eventStore) eventStore.append('session_created', { sessionId, deviceId })
    if (auditLogger) auditLogger.sessionStart({ sessionId, deviceId })

    return {
      id: sessionId,
      deviceId,
      sessionToken,
      serverEphemeralPublicKey: ephemeral.publicKey,
      expiresAt: session.expiresAt,
      createdAt: session.createdAt
    }
  }

  function getSessionByToken(token) {
    const sessionId = tokenToSession.get(token)
    if (!sessionId) return null
    const session = sessions.get(sessionId)
    if (!session) {
      tokenToSession.delete(token)
      return null
    }
    if (session.closed || Date.now() > session.expiresAt) {
      tokenToSession.delete(token)
      return null
    }
    return session
  }

  function refreshSession(sessionId) {
    const session = sessions.get(sessionId)
    if (!session || session.closed) return null

    const newToken = generateSessionToken()
    tokenToSession.delete(session.sessionToken)
    session.sessionToken = newToken
    session.expiresAt = Date.now() + SESSION_TTL_MS
    session.lastActiveAt = Date.now()
    tokenToSession.set(newToken, sessionId)

    return {
      id: session.id,
      deviceId: session.deviceId,
      sessionToken: newToken,
      expiresAt: session.expiresAt
    }
  }

  function getSession(sessionId) {
    return sessions.get(sessionId) || null
  }

  function closeSession(sessionId, reason = 'closed') {
    const session = sessions.get(sessionId)
    if (!session) return false
    session.closed = true
    session.closedAt = Date.now()
    session.closeReason = reason
    if (session.sessionToken) {
      tokenToSession.delete(session.sessionToken)
    }
    if (eventStore) eventStore.append('session_closed', { sessionId, deviceId: session.deviceId, reason })
    if (auditLogger) auditLogger.sessionEnd({ sessionId, deviceId: session.deviceId, reason })
    return true
  }

  function closeSessionByToken(token, reason = 'closed') {
    const session = getSessionByToken(token)
    if (!session) return false
    return closeSession(session.id, reason)
  }

  function terminateDeviceSessions(deviceId) {
    let count = 0
    for (const [id, session] of sessions) {
      if (session.deviceId === deviceId && !session.closed) {
        closeSession(id, 'device_revoked')
        count++
      }
    }
    return count
  }

  function signMessage(sessionId, message) {
    const session = sessions.get(sessionId)
    if (!session || session.closed) throw new Error('Invalid session')
    const seq = ++session.seqOut
    const data = `${seq}:${message}`
    const hmac = cryptoDep.createHmac(HMAC_ALGORITHM, session.sessionKey)
    hmac.update(data)
    return {
      seq,
      hmac: hmac.digest('base64')
    }
  }

  function verifyMessage(sessionId, message, seq, hmac) {
    const session = sessions.get(sessionId)
    if (!session || session.closed) return { valid: false, reason: 'invalid_session' }
    if (typeof seq !== 'number' || seq <= 0) return { valid: false, reason: 'invalid_sequence' }
    if (seq <= session.seqIn) return { valid: false, reason: 'replay_detected' }
    if (seq - session.seqIn > MAX_SEQ_GAP) return { valid: false, reason: 'sequence_too_far_ahead' }

    const data = `${seq}:${message}`
    const expected = cryptoDep.createHmac(HMAC_ALGORITHM, session.sessionKey)
    expected.update(data)
    const expectedDigest = expected.digest()

    let receivedDigest
    try {
      receivedDigest = Buffer.from(hmac, 'base64')
    } catch (_) {
      return { valid: false, reason: 'invalid_hmac_encoding' }
    }

    if (!cryptoDep.timingSafeEqual(expectedDigest, receivedDigest)) {
      return { valid: false, reason: 'hmac_mismatch' }
    }

    session.seqIn = seq
    session.lastActiveAt = Date.now()
    return { valid: true }
  }

  function listActiveSessions() {
    return Array.from(sessions.values())
      .filter(s => !s.closed)
      .map(s => ({
        id: s.id,
        deviceId: s.deviceId,
        createdAt: s.createdAt,
        lastActiveAt: s.lastActiveAt,
        remoteAddress: s.remoteAddress
      }))
  }

  function touchSession(sessionId) {
    const session = sessions.get(sessionId)
    if (session) session.lastActiveAt = Date.now()
  }

  function initialize() {
    sessions.clear()
    tokenToSession.clear()
  }

  function getActiveSessionCount() {
    let count = 0
    for (const session of sessions.values()) {
      if (!session.closed) count++
    }
    return count
  }

  function verifyToken(token) {
    const session = getSessionByToken(token)
    if (!session) return { valid: false, reason: 'invalid_token' }
    return { valid: true, session, deviceId: session.deviceId, sessionId: session.id }
  }

  return Object.freeze({
    initialize,
    createSession,
    openSession,
    getSession,
    getSessionByToken,
    refreshSession,
    closeSession,
    closeSessionByToken,
    terminateDeviceSessions,
    signMessage,
    verifyMessage,
    verifyToken,
    listActiveSessions,
    touchSession,
    getActiveSessionCount,
    SESSION_TTL_MS
  })
}

module.exports = { createSessionManager, HMAC_ALGORITHM, SESSION_KEY_LENGTH, SESSION_TTL_MS }
