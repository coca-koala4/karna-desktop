'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { execFileSync } = require('node:child_process')

const { createConnectorBridge } = require('./connector-bridge.cjs')

const findPython = () => {
  for (const command of ['python', 'python3', 'py']) {
    try {
      execFileSync(command, ['--version'], { stdio: 'ignore' })

      return command
    } catch {
      // Try the next launcher.
    }
  }

  return 'python'
}

test('connector bridge imports hermes_cli from the repository root', async () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-connector-bridge-'))
  const projectRoot = path.resolve(__dirname, '..', '..', '..', '..')
  const run = createConnectorBridge({
    dataRoot,
    findPython,
    notConfigured: (capability, error, extra = {}) => ({ ok: false, capability, error, ...extra }),
    projectRoot
  })

  try {
    const result = await run('definitions')

    assert.ok(Array.isArray(result.items))
    assert.ok(result.items.length > 0)

    const created = await run('create_instance', { body: { auth: { api_key: 'test-secret-value' }, connectorId: 'web_search', displayName: 'Credential test' } })
    assert.equal(created.credentialStored, true)
    const credentialFile = path.join(dataRoot, 'connector-workshop', 'credentials.json')
    assert.equal(fs.readFileSync(credentialFile, 'utf8').includes('test-secret-value'), false)

    const cleared = await run('delete_credential', { ref: created.id })
    assert.equal(cleared.credentialStored, false)
    assert.equal(fs.readFileSync(credentialFile, 'utf8').includes(created.authRef), false)
  } finally {
    fs.rmSync(dataRoot, { force: true, recursive: true })
  }
})
