'use strict'

const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { installOfflineRuntime, installOfflineRuntimeAsync, verifyBundle } = require('./offline-runtime.cjs')

function writeBundle(root, version = '1') {
  const bundle = path.join(root, 'bundle')
  const payload = path.join(bundle, 'hermes-agent', 'hermes_cli', '__init__.py')
  fs.mkdirSync(path.dirname(payload), { recursive: true })
  fs.writeFileSync(payload, '# clean runtime\n')
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(payload)).digest('hex')
  fs.writeFileSync(
    path.join(bundle, 'runtime-manifest.json'),
    JSON.stringify({ schemaVersion: 1, desktopVersion: version, files: [{ path: 'hermes-agent/hermes_cli/__init__.py', sha256 }] })
  )
  return { bundle, payload }
}

test('verified offline runtime installs under versioned runtime home', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-offline-runtime-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const { bundle } = writeBundle(root, '1.2.3')

  verifyBundle(bundle, '1.2.3')
  const installed = installOfflineRuntime({ bundleRoot: bundle, runtimeHome: path.join(root, 'runtime'), version: '1.2.3' })
  assert.equal(installed, path.join(root, 'runtime', 'versions', '1.2.3'))
  assert.equal(fs.existsSync(path.join(installed, 'hermes-agent', 'hermes_cli', '__init__.py')), true)
  assert.equal(fs.readFileSync(path.join(root, 'runtime', 'active-version'), 'utf8'), '1.2.3\n')
})

test('offline runtime rejects tampered files', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-offline-runtime-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.writeFileSync(path.join(root, 'payload.txt'), 'tampered')
  fs.writeFileSync(
    path.join(root, 'runtime-manifest.json'),
    JSON.stringify({ schemaVersion: 1, desktopVersion: '1', files: [{ path: 'payload.txt', sha256: '0'.repeat(64) }] })
  )
  assert.throws(() => verifyBundle(root, '1'), /校验失败/)
})

test('offline runtime skips full bundle verification when installed marker is current', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-offline-runtime-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const { bundle, payload } = writeBundle(root, '1')
  const runtimeHome = path.join(root, 'runtime')
  const installed = installOfflineRuntime({ bundleRoot: bundle, runtimeHome, version: '1' })
  fs.writeFileSync(payload, 'tampered after install')
  assert.equal(installOfflineRuntime({ bundleRoot: bundle, runtimeHome, version: '1' }), installed)
})

test('offline runtime async worker installs without blocking caller API', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-offline-runtime-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const { bundle } = writeBundle(root, '1')
  const installed = await installOfflineRuntimeAsync({ bundleRoot: bundle, runtimeHome: path.join(root, 'runtime'), version: '1' })
  assert.equal(fs.existsSync(path.join(installed, 'hermes-agent', 'hermes_cli', '__init__.py')), true)
})
