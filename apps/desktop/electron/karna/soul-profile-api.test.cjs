'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-soul-api-'))
process.env.KARNA_DESKTOP_DATA_DIR = dataRoot
process.env.KARNA_DATA_DIR = dataRoot

const adapter = require('../karna-adapter.cjs')

test('/api/profiles/default/soul persists editable Soul on disk with safety validation', async () => {
  try {
    const initial = await adapter.handleKarnaApiRequest({ path: '/api/profiles/default/soul', method: 'GET' })
    assert.equal(initial.profile, 'default')
    assert.equal(initial.editable, true)
    assert.match(initial.content, /Karna/)
    assert.doesNotMatch(initial.content, /Hermes Agent|Nous Research/)
    assert.equal(fs.existsSync(initial.path), true)

    const saved = await adapter.handleKarnaApiRequest({
      path: '/api/profiles/default/soul',
      method: 'PUT',
      body: { content: 'Karna should answer with concise evidence.' }
    })
    assert.equal(saved.ok, true)

    const after = await adapter.handleKarnaApiRequest({ path: '/api/profiles/default/soul', method: 'GET' })
    assert.equal(after.content, 'Karna should answer with concise evidence.')
    assert.equal(fs.readFileSync(path.join(dataRoot, 'SOUL.md'), 'utf8'), after.content)

    await assert.rejects(
      () => adapter.handleKarnaApiRequest({
        path: '/api/profiles/default/soul',
        method: 'PUT',
        body: { content: 'token = sk-test123456789012345678901234' }
      }),
      /credential|secret/i
    )

    const globalKnowledgeSearch = await adapter.handleKarnaApiRequest({
      path: '/api/mcp/builtin/knowledge_search',
      method: 'POST',
      body: { query: 'anything' }
    })
    assert.equal(globalKnowledgeSearch.ok, false)
    assert.match(globalKnowledgeSearch.error, /explicit project_id or library_id/)
  } finally {
    adapter.stopKarnaAdapter()
    fs.rmSync(dataRoot, { force: true, recursive: true })
  }
})
