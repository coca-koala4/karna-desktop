'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..')
const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-workflow-resolve-'))
const globalDir = path.join(dataRoot, 'global-workflows')
fs.mkdirSync(globalDir, { recursive: true })

const workflows = ['basic-writing', 'critic-revision'].map(name =>
  JSON.parse(fs.readFileSync(path.join(repoRoot, 'karna-builtin', 'workflows', `${name}.json`), 'utf8'))
)
fs.writeFileSync(path.join(globalDir, 'workflows.json'), JSON.stringify({ version: 2, project_id: 'global-workflows', workflows }), 'utf8')

process.env.KARNA_DATA_DIR = dataRoot
const { handleKarnaApiRequest } = require('../karna-adapter.cjs')

async function resolve(id) {
  return handleKarnaApiRequest({
    path: '/api/writer/workflows/resolve',
    method: 'POST',
    body: { workflow_id: id, workspace_id: null, session_id: null }
  })
}

test('basic built-in workflow resolves without unresolved nodes', async () => {
  const result = await resolve('builtin.basic-writing')
  assert.equal(result.ok, true)
  assert.equal(result.executionPlan.steps.length, 5)
  assert.deepEqual(result.executionPlan.unresolvedNodeIds, [])
})

test('complex loop workflow resolves without blocking the event loop', async () => {
  const result = await resolve('builtin.critic-revision')
  assert.equal(result.ok, true)
  assert.equal(result.executionPlan.steps.length, 11)
  assert.equal(result.executionPlan.loopEdges.length, 2)
  assert.deepEqual(result.executionPlan.unresolvedNodeIds, [])
})
