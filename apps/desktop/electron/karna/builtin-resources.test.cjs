'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { installBuiltinWorkflowResources, loadBuiltinWorkflows } = require('./builtin-resources.cjs')

const appRoot = path.resolve(__dirname, '..', '..')

test('release contains exactly the simple and complex built-in workflows', () => {
  const result = loadBuiltinWorkflows({ appRoot, fs, isPackaged: false, path, resourcesPath: '' })
  assert.equal(result.workflows.length, 2)
  assert.deepEqual(result.workflows.map(row => row.id), ['builtin.basic-writing', 'builtin.critic-revision'])
  assert.deepEqual(result.workflows.map(row => row.nodes.length), [5, 11])
})

test('fresh profiles are seeded but existing user workflows are preserved', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-builtins-'))
  try {
    const first = installBuiltinWorkflowResources({ appRoot, dataRoot: root, fs, isPackaged: false, path, resourcesPath: '' })
    assert.equal(first.workflowCount, 2)
    const custom = { version: 1, project_id: 'global-workflows', workflows: [{ id: 'mine', name: '我的流程' }] }
    fs.writeFileSync(first.userWorkflowsPath, JSON.stringify(custom), 'utf8')
    installBuiltinWorkflowResources({ appRoot, dataRoot: root, fs, isPackaged: false, path, resourcesPath: '' })
    assert.deepEqual(JSON.parse(fs.readFileSync(first.userWorkflowsPath, 'utf8')), custom)
    assert.equal(JSON.parse(fs.readFileSync(first.registryPath, 'utf8')).workflows.length, 2)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
