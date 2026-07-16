const adapter = require('../electron/karna-adapter.cjs')
const { bootstrapWriterOsProject, resolveWriterOsProject } = require('./writer-os-test-helpers.cjs')

async function main() {
  const { project, ref } = await resolveWriterOsProject(adapter)
  const bootstrap = await bootstrapWriterOsProject(adapter, ref)

  const vector = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/os/rag`,
    method: 'POST',
    body: { action: 'vectorize', provider: 'local', rebuildIndex: true }
  })
  const verifyVectorDb = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/os/rag`,
    method: 'POST',
    body: { action: 'verify-vector-db' }
  })
  const search = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/os/rag`,
    method: 'POST',
    body: { action: 'search', query: 'character foreshadow world conflict', limit: 5, provider: 'local' }
  })
  const capabilityPacks = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/os/capability-packs`,
    method: 'POST',
    body: {}
  })
  const soulPack = (capabilityPacks.packs || []).find(pack => pack.source === 'soul_workshop')
  const loop = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/os/guide`,
    method: 'POST',
    body: { action: 'run-step', step: 'writing_loop', text: 'Writer OS smoke: a protagonist discovers a hidden promise, a world conflict, and an unresolved clue.', instruction: 'Use RAG, Draft Guard, Workflow, Living Wiki writeback, and Soul Method Pack safely.', soulPackId: soulPack?.id || '', soulMode: soulPack ? 'selected' : '' }
  })
  const canonAfterLoop = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/os/guide`,
    method: 'POST',
    body: { action: 'run-step', step: 'canon_review', all: true }
  })
  const benchmarkAfterLoop = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/os/benchmark`,
    method: 'POST',
    body: {}
  })
  const audit = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/os/benchmark`,
    method: 'POST',
    body: { action: 'audit' }
  })
  const delivery = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/os/artifacts`,
    method: 'POST',
    body: { action: 'delivery', zip: true }
  })
  const verify = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/os/artifacts`,
    method: 'POST',
    body: { action: 'verify-delivery', manifest_rel: delivery.delivery?.manifest_rel }
  })
  const command = await adapter.handleKarnaApiRequest({ path: `/api/writer/projects/${ref}/os/command-center`, method: 'GET' })

  const summary = {
    project: project.slug || project.id,
    vector_db: {
      vectors: vector.vector_store?.vectors?.length || 0,
      db_vectors: vector.vector_database?.vectors || 0,
      engine: vector.vector_database?.engine || '',
      segment_rows: vector.vector_database?.segments?.[0]?.rows || 0,
      coverage: vector.vector_health?.coverage || 0,
      verified: verifyVectorDb.ok === true,
      verify_failures: verifyVectorDb.vector_db_verification?.failures?.length || 0
    },
    retrieval: { mode: search.mode, results: search.results?.length || 0, vectorized: search.vectorized },
    capability_packs: { total: capabilityPacks.packs?.length || 0, soul_pack: soulPack?.id || '' },
    writer_loop: { ok: loop.ok, steps: loop.steps?.length || 0, workflow: loop.summary?.workflow },
    canon_review: { ok: canonAfterLoop.result?.ok !== false, confirmed: (bootstrap.canon.result?.confirmed || 0) + (canonAfterLoop.result?.confirmed || 0) },
    benchmark: { id: benchmarkAfterLoop.run?.id, readiness: benchmarkAfterLoop.run?.readiness_score, maturity: benchmarkAfterLoop.run?.maturity_score, passed: benchmarkAfterLoop.run?.passed, total: benchmarkAfterLoop.run?.total },
    audit: { ok: audit.ok, status: audit.audit?.status, score: audit.audit?.score, passed: audit.audit?.passed, total: audit.audit?.total },
    delivery: { ok: delivery.ok, zip_rel: delivery.delivery?.zip_rel, files: delivery.delivery?.manifest?.files?.length || 0 },
    verify: { ok: verify.ok, passed: verify.verification?.passed || 0, files: verify.verification?.files || 0, missing: verify.verification?.missing || 0, changed: verify.verification?.changed || 0 },
    command: { status: command.status, counts: command.counts }
  }
  console.log(JSON.stringify(summary, null, 2))
  const failed = !summary.vector_db.db_vectors || !summary.vector_db.verified || summary.vector_db.verify_failures !== 0 || !summary.retrieval.results || !summary.capability_packs.soul_pack || !summary.writer_loop.ok || summary.canon_review.ok === false || !summary.benchmark.id || !summary.audit.ok || summary.verify.ok !== true || summary.command.status !== 'green'
  if (failed) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})

