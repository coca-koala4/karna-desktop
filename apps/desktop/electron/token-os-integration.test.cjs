const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const adapter = require('./karna-adapter.cjs')

async function main() {
  const calls = []
  adapter.setHermesApiBridge(async request => {
    calls.push(request)
    return { ok: true, event_id: 'evt-1' }
  })

  const response = await adapter._tokenOsTest.contextBackendFetch('/api/context/token-usage', {
    method: 'POST',
    body: { session_id: 'session-1', input_tokens: 100 }
  })
  assert.equal(response.status, 200)
  assert.equal(response.data.event_id, 'evt-1')
  assert.deepEqual(calls[0], {
    path: '/api/context/token-usage',
    method: 'POST',
    body: { session_id: 'session-1', input_tokens: 100 },
    timeoutMs: undefined
  })

  assert.equal(adapter._tokenOsTest.extractRequestedOutputTokens({ text: '请写一篇2万字的长篇终稿' }), 20_000)
  assert.equal(adapter._tokenOsTest.extractRequestedOutputTokens({ prompt: 'output 12k tokens' }), 12_000)
  assert.equal(adapter._tokenOsTest.extractRequestedOutputTokens({ requestedOutputTokens: 9_000 }), 9_000)

  const source = fs.readFileSync(path.join(__dirname, 'karna-adapter.cjs'), 'utf8')
  assert.doesNotMatch(source, /karnaBackendFetch\('\/api\/context\//)
  assert.match(source, /runSegmentedWorkflowWrite/)
  assert.match(source, /contextBackendFetch\('\/api\/context\/reuse-records'/)
  assert.match(source, /chatBackendFetch/)

  adapter.setHermesApiBridge(null)
  console.log('TOKEN OS ELECTRON INTEGRATION TEST PASSED')
}

main().catch(error => {
  adapter.setHermesApiBridge(null)
  console.error(error)
  process.exitCode = 1
})
