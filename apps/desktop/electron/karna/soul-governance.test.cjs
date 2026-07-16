'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-soul-governance-'))
process.env.KARNA_DESKTOP_DATA_DIR = dataRoot
process.env.KARNA_DATA_DIR = dataRoot

const adapter = require('../karna-adapter.cjs')

test('Soul governance persists retention, exports before purge, and preserves the author', async () => {
  const source = path.join(dataRoot, 'source.md')
  fs.writeFileSync(source, '# Sample\nGoverned local evidence.', 'utf8')

  try {
    const created = await adapter.handleKarnaApiRequest({ path: '/api/soul/authors', method: 'POST', body: { name: 'Governance Test' } })
    const ref = created.author.id
    const imported = await adapter.handleKarnaApiRequest({ path: `/api/soul/authors/${ref}/import`, method: 'POST', body: { paths: [source] } })
    const governance = await adapter.handleKarnaApiRequest({ path: `/api/soul/authors/${ref}/governance`, method: 'PUT', body: { retention_days: 90 } })
    const exported = await adapter.handleKarnaApiRequest({ path: `/api/soul/authors/${ref}/export`, method: 'POST' })
    const purged = await adapter.handleKarnaApiRequest({ path: `/api/soul/authors/${ref}/purge`, method: 'DELETE' })
    const detail = await adapter.handleKarnaApiRequest({ path: `/api/soul/authors/${ref}`, method: 'GET' })

    assert.equal(imported.imported.length, 1)
    assert.equal(governance.governance.retention_days, 90)
    assert.equal(fs.existsSync(exported.file), true)
    assert.equal(purged.ok, true)
    assert.equal(detail.author.id, ref)
    assert.equal(detail.metadata.texts.length, 0)
    assert.equal(detail.chunks.length, 0)
    assert.equal(detail.governance.retention_days, 90)
    assert.equal(fs.existsSync(exported.file), true)
  } finally {
    adapter.stopKarnaAdapter()
    fs.rmSync(dataRoot, { force: true, recursive: true })
  }
})
