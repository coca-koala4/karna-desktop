'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { createDocumentPreviewService, FILE_TYPES, detectFileType } = require('./document-preview-service.cjs')

test('detects XMind, presentations and spreadsheets without treating them as text', () => {
  assert.equal(detectFileType('story.xmind'), FILE_TYPES.BINARY)
  assert.equal(detectFileType('pitch.pptx'), FILE_TYPES.PRESENTATION)
  assert.equal(detectFileType('pitch.ppt'), FILE_TYPES.PRESENTATION)
  assert.equal(detectFileType('budget.xlsx'), FILE_TYPES.SPREADSHEET)
  assert.equal(detectFileType('budget.xls'), FILE_TYPES.SPREADSHEET)
})

test('binary preview streams all bytes and release invalidates the preview', async t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-preview-test-'))
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))
  const filePath = path.join(tempDir, 'map.xmind')
  const source = Buffer.alloc(700_000, 0x5a)
  fs.writeFileSync(filePath, source)

  const service = createDocumentPreviewService({ tempDir })
  service.initialize()
  t.after(() => service.shutdown())

  const created = await service.createPreview({
    fileId: 'file-1',
    filename: 'map.xmind',
    realPath: filePath,
    size: source.length
  })
  assert.equal(created.ok, true)

  const manifest = service.getPreviewManifest(created.previewId)
  assert.equal(manifest.ok, true)
  assert.equal(manifest.format, 'binary')
  assert.ok(manifest.totalChunks > 1)

  const chunks = []
  for (let index = 0; index < manifest.totalChunks; index += 1) {
    const chunk = await service.getPreviewChunk(created.previewId, index)
    assert.equal(chunk.ok, true)
    chunks.push(Buffer.from(chunk.data, 'base64'))
  }
  assert.deepEqual(Buffer.concat(chunks), source)
  assert.equal(service.releasePreview(created.previewId), true)
  assert.deepEqual(service.getPreviewManifest(created.previewId), { ok: false, error: 'preview_not_found' })
})
