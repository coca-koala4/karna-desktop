'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { createModelCredentialStore } = require('./model-credential-store.cjs')

const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: value => Buffer.from(`encrypted:${value}`),
  decryptString: value => value.toString().replace(/^encrypted:/, '')
}

test('model credentials are OS-encrypted and never written as plaintext', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-credentials-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const store = createModelCredentialStore({ safeStorage: fakeSafeStorage, userDataPath: root })
  store.set('OPENROUTER_API_KEY', 'secret-value')
  assert.equal(store.get('OPENROUTER_API_KEY'), 'secret-value')
  assert.equal(fs.readFileSync(store.file, 'utf8').includes('secret-value'), false)
  assert.deepEqual(store.list(), { OPENROUTER_API_KEY: 'secret-value' })
  store.remove('OPENROUTER_API_KEY')
  assert.equal(store.get('OPENROUTER_API_KEY'), '')
})

test('credential store refuses plaintext fallback when encryption is unavailable', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-credentials-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const store = createModelCredentialStore({ safeStorage: { isEncryptionAvailable: () => false }, userDataPath: root })
  assert.throws(() => store.set('OPENAI_API_KEY', 'secret'), /拒绝保存明文/)
  assert.equal(fs.existsSync(store.file), false)
})
