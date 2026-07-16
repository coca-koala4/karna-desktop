const adapter = require('../electron/karna-adapter.cjs')
const { bootstrapWriterOsProject, resolveWriterOsProject } = require('./writer-os-test-helpers.cjs')
const fs = require('node:fs')
const path = require('node:path')

async function main() {
  const { project, ref } = await resolveWriterOsProject(adapter)
  await bootstrapWriterOsProject(adapter, ref)

  const delivery = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/artifacts`,
    method: 'POST',
    body: { action: 'delivery', zip: true }
  })
  const manifestRel = delivery.delivery?.manifest_rel
  if (!manifestRel) throw new Error('Delivery manifest was not returned.')

  const firstVerify = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/artifacts`,
    method: 'POST',
    body: { action: 'verify-delivery', manifest_rel: manifestRel }
  })
  if (firstVerify.ok !== true) throw new Error(`Fresh delivery package did not verify: ${JSON.stringify(firstVerify.verification || firstVerify.report)}`)

  const manifestFile = path.join(project.folder, manifestRel)
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  const deliveryRoot = path.dirname(manifestFile)
  const target = (manifest.files || []).find(row => row.rel && row.rel !== 'DELIVERY_MANIFEST.json')
  if (!target) throw new Error('No delivery file available for corruption probe.')
  const targetFile = path.join(deliveryRoot, target.rel)
  const original = fs.readFileSync(targetFile)

  let failedAsExpected = false
  try {
    fs.appendFileSync(targetFile, '\ncorruption-probe\n', 'utf8')
    const broken = await adapter.handleKarnaApiRequest({
      path: `/api/writer/projects/${ref}/artifacts`,
      method: 'POST',
      body: { action: 'verify-delivery', manifest_rel: manifestRel }
    })
    failedAsExpected = broken.ok === false && (broken.verification?.changed || 0) > 0
    console.log(JSON.stringify({
      project: project.slug || project.id,
      manifest: manifestRel,
      corrupted_file: target.rel,
      corruption_detected: failedAsExpected,
      broken_ok: broken.ok,
      changed: broken.verification?.changed || 0,
      missing: broken.verification?.missing || 0,
      failures: broken.verification?.failures?.length || 0
    }, null, 2))
  } finally {
    fs.writeFileSync(targetFile, original)
  }

  const restored = await adapter.handleKarnaApiRequest({
    path: `/api/writer/projects/${ref}/artifacts`,
    method: 'POST',
    body: { action: 'verify-delivery', manifest_rel: manifestRel }
  })
  const restoredOk = restored.ok === true && restored.verification?.missing === 0 && restored.verification?.changed === 0
  console.log(JSON.stringify({
    restored: restoredOk,
    passed: restored.verification?.passed || 0,
    files: restored.verification?.files || 0,
    missing: restored.verification?.missing || 0,
    changed: restored.verification?.changed || 0
  }, null, 2))

  if (!failedAsExpected || !restoredOk) process.exit(1)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
