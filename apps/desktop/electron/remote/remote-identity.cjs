'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const KEY_TYPE = 'ec'
const KEY_CURVE = 'prime256v1'
const IDENTITY_FILE = 'remote-identity.enc'

function createIdentityManager(deps = {}) {
  const {
    safeStorage,
    paths,
    app,
    fs: fsDep = fs,
    cryptoDep = crypto
  } = deps

  let keyPair = null
  let identityPath = null

  if (paths) {
    const dataRoot = typeof paths.dataRoot === 'function' ? paths.dataRoot({ app }) : paths.dataRoot
    identityPath = path.join(dataRoot, 'remote', IDENTITY_FILE)
  }

  function isAvailable() {
    if (!safeStorage) return false
    try {
      return safeStorage.isEncryptionAvailable()
    } catch (_) {
      return false
    }
  }

  function generateKeyPair() {
    const pair = cryptoDep.generateKeyPairSync(KEY_TYPE, {
      namedCurve: KEY_CURVE
    })
    return {
      privateKey: pair.privateKey.export({ type: 'sec1', format: 'pem' }),
      publicKey: pair.publicKey.export({ type: 'spki', format: 'pem' })
    }
  }

  function loadIdentity() {
    if (!identityPath || !fsDep.existsSync(identityPath)) return null
    try {
      const encrypted = fsDep.readFileSync(identityPath)
      if (!safeStorage || !isAvailable()) return null
      const decrypted = safeStorage.decryptString(encrypted)
      const keys = JSON.parse(decrypted)
      return {
        privateKey: cryptoDep.createPrivateKey(keys.privateKey),
        publicKey: cryptoDep.createPublicKey(keys.publicKey),
        privateKeyPem: keys.privateKey,
        publicKeyPem: keys.publicKey,
        publicKeyFingerprint: cryptoDep.createHash('sha256').update(keys.publicKey).digest('hex').slice(0, 16)
      }
    } catch (_) {
      return null
    }
  }

  function saveIdentity(keys) {
    if (!identityPath) return false
    if (!safeStorage || !isAvailable()) return false
    try {
      fsDep.mkdirSync(path.dirname(identityPath), { recursive: true })
      const plaintext = JSON.stringify(keys)
      const encrypted = safeStorage.encryptString(plaintext)
      fsDep.writeFileSync(identityPath, encrypted)
      return true
    } catch (_) {
      return false
    }
  }

  function initialize() {
    if (!isAvailable()) {
      throw new Error('safeStorage is not available; Remote Gateway cannot start')
    }

    let existing = loadIdentity()
    if (existing) {
      keyPair = existing
      return keyPair
    }

    const newKeys = generateKeyPair()
    saveIdentity(newKeys)
    keyPair = {
      privateKey: cryptoDep.createPrivateKey(newKeys.privateKey),
      publicKey: cryptoDep.createPublicKey(newKeys.publicKey),
      privateKeyPem: newKeys.privateKey,
      publicKeyPem: newKeys.publicKey,
      publicKeyFingerprint: cryptoDep.createHash('sha256').update(newKeys.publicKey).digest('hex').slice(0, 16)
    }
    return keyPair
  }

  function getKeyPair() {
    if (!keyPair) throw new Error('Identity not initialized')
    return keyPair
  }

  function sign(data) {
    if (!keyPair) throw new Error('Identity not initialized')
    const sign = cryptoDep.createSign('SHA256')
    sign.update(data)
    sign.end()
    return sign.sign(keyPair.privateKey, 'base64')
  }

  function verify(data, signature, publicKeyPem) {
    try {
      const verify = cryptoDep.createVerify('SHA256')
      verify.update(data)
      verify.end()
      const pubKey = publicKeyPem ? cryptoDep.createPublicKey(publicKeyPem) : keyPair.publicKey
      return verify.verify(pubKey, signature, 'base64')
    } catch (_) {
      return false
    }
  }

  function getPublicFingerprint() {
    if (!keyPair) return null
    return keyPair.publicKeyFingerprint
  }

  return Object.freeze({
    initialize,
    isAvailable,
    getKeyPair,
    sign,
    verify,
    getPublicFingerprint
  })
}

module.exports = { createIdentityManager, KEY_CURVE }
