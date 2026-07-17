'use strict'

const fs = require('node:fs')
const path = require('node:path')

function createModelCredentialStore({ safeStorage, userDataPath }) {
  const file = path.join(userDataPath, 'credentials', 'model-credentials.json')

  function readRows() {
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'))
      return value?.schemaVersion === 1 && value.credentials && typeof value.credentials === 'object'
        ? value.credentials
        : {}
    } catch {
      return {}
    }
  }

  function decrypt(encoded) {
    if (!encoded || !safeStorage?.isEncryptionAvailable()) return ''
    try {
      return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
    } catch {
      return ''
    }
  }

  function get(key) {
    return decrypt(readRows()[String(key)])
  }

  function list() {
    return Object.fromEntries(Object.entries(readRows()).map(([key, value]) => [key, decrypt(value)]).filter(([, value]) => value))
  }

  function set(key, value) {
    if (!safeStorage?.isEncryptionAvailable()) throw new Error('系统凭据加密不可用，Karna 已拒绝保存明文 API Key。')
    const rows = readRows()
    const normalized = String(value || '').replace(/[\r\n]/g, '')
    if (normalized) rows[String(key)] = safeStorage.encryptString(normalized).toString('base64')
    else delete rows[String(key)]
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${JSON.stringify({ schemaVersion: 1, credentials: rows }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  }

  function remove(key) {
    set(key, '')
  }

  return { file, get, list, remove, set }
}

module.exports = { createModelCredentialStore }
