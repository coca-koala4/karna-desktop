'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const CERT_VALIDITY_DAYS = 365
const CERT_KEY_TYPE = 'ec'
const CERT_KEY_CURVE = 'prime256v1'

function generateSelfSignedCert(options = {}) {
  const {
    commonName = 'Karna Remote Gateway',
    organization = 'Karna',
    validityDays = CERT_VALIDITY_DAYS,
    sans = []
  } = options

  const { privateKey, publicKey } = crypto.generateKeyPairSync(CERT_KEY_TYPE, {
    namedCurve: CERT_KEY_CURVE
  })

  const now = new Date()
  const notBefore = new Date(now.getTime() - 60 * 1000)
  const notAfter = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000)

  const sanEntries = sans.length > 0
    ? sans.map(s => `DNS:${s}`).join(', ')
    : 'DNS:localhost, IP:127.0.0.1'

  const cert = crypto.X509Certificate
    ? null
    : (() => {
        const pkey = crypto.createPrivateKey({ key: privateKey.export({ type: 'sec1', format: 'pem' }) })
        const req = crypto.createCertSignRequest({
          key: pkey,
          subject: [{ name: 'commonName', value: commonName }, { name: 'organizationName', value: organization }],
          extensions: [{ name: 'subjectAltName', value: sanEntries }]
        })
        return null
      })()

  const ecdh = crypto.createECDH(CERT_KEY_CURVE)
  ecdh.generateKeys()

  const certPem = privateKey.export({ type: 'sec1', format: 'pem' })
  const keyPem = privateKey.export({ type: 'sec1', format: 'pem' })

  const tlsCert = {
    privateKey,
    publicKey,
    certPem: keyPem,
    keyPem,
    fingerprint: crypto.createHash('sha256').update(certPem).digest('hex'),
    notBefore,
    notAfter,
    commonName,
    sans
  }

  return tlsCert
}

function loadOrCreateCert(certPath, keyPath, options = {}) {
  try {
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      const certPem = fs.readFileSync(certPath, 'utf8')
      const keyPem = fs.readFileSync(keyPath, 'utf8')
      const privateKey = crypto.createPrivateKey(keyPem)
      const publicKey = crypto.createPublicKey(privateKey)
      return {
        privateKey,
        publicKey,
        certPem,
        keyPem,
        loaded: true,
        generated: false
      }
    }
  } catch (e) {
  }

  const generated = generateSelfSignedCert(options)

  fs.mkdirSync(path.dirname(certPath), { recursive: true })
  fs.writeFileSync(certPath, generated.certPem, 'utf8')
  fs.writeFileSync(keyPath, generated.keyPem, 'utf8')

  return {
    ...generated,
    loaded: false,
    generated: true
  }
}

function createTlsCertificateManager(deps = {}) {
  const {
    paths,
    fs: fsDep = fs,
    cryptoDep = crypto
  } = deps

  return Object.freeze({
    generateSelfSignedCert,
    loadOrCreateCert: (certPath, keyPath, options) => loadOrCreateCert(certPath, keyPath, options)
  })
}

module.exports = { createTlsCertificateManager, CERT_VALIDITY_DAYS }
