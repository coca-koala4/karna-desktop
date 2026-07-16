const adapter = require('../electron/karna-adapter.cjs')
const { bootstrapWriterOsProject, resolveWriterOsProject } = require('./writer-os-test-helpers.cjs')
const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const { project, ref } = await resolveWriterOsProject(adapter)
  await bootstrapWriterOsProject(adapter, ref)

  const built = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/rag`,
    method: 'POST',
    body: { action: 'vectorize', provider: 'local', rebuildIndex: true }
  })
  const manifest = built.vector_database
  const segmentRel = manifest?.segments?.[0]?.rel
  if (!segmentRel) throw new Error('Vector DB segment missing after build.')
  const segmentFile = path.join(project.folder, 'rag', 'vector_db', segmentRel)
  const original = fs.readFileSync(segmentFile, 'utf8')

  let failedAsExpected = false
  try {
    fs.appendFileSync(segmentFile, JSON.stringify({ id: 'corruption_probe', vector: [1, 2, 3] }) + '\n', 'utf8')
    const broken = await adapter.handleKarnaApiRequest({
      path: `/api/writer/projects/${ref}/rag`,
      method: 'POST',
      body: { action: 'verify-vector-db', record: false }
    })
    failedAsExpected = broken.ok === false && (broken.vector_db_verification?.failures || []).length > 0
    console.log(JSON.stringify({
      project: project.slug || project.id,
      corruption_detected: failedAsExpected,
      broken_ok: broken.ok,
      broken_failures: broken.vector_db_verification?.failures?.length || 0,
      broken_rows: broken.vector_db_verification?.segment_rows || 0,
      expected_vectors: broken.vector_db_verification?.vectors || 0
    }, null, 2))
  } finally {
    fs.writeFileSync(segmentFile, original, 'utf8')
  }

  const restored = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/rag`,
    method: 'POST',
    body: { action: 'vectorize', provider: 'local', rebuildIndex: true }
  })
  const verified = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/rag`,
    method: 'POST',
    body: { action: 'verify-vector-db', record: false }
  })
  const restoredOk = verified.ok === true && verified.vector_db_verification?.failures?.length === 0
  console.log(JSON.stringify({
    restored: restoredOk,
    vectors: restored.vector_database?.vectors || 0,
    rows: verified.vector_db_verification?.segment_rows || 0,
    failures: verified.vector_db_verification?.failures?.length || 0
  }, null, 2))

  if (!failedAsExpected || !restoredOk) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
