'use strict'

function createWriterDeliveryService(deps) {
  const {
    fs,
    path,
    execFileSync,
    textHash,
    fileHash,
    readJsonFile,
    writeJsonFile,
    ensureWriterProjectMetadata,
    enrichWriterProject,
    exportWriterProject,
    acceptanceAudit,
    syncWriterProjectArtifacts,
    readBenchmarkStore,
    recordProjectArtifact,
    readProjectArtifactStore,
    appendWriterProjectVersion,
    trackAnalytics = () => {},
    flushAnalytics = () => {}
  } = deps

  const isDeliveryExcludedPath = rel => {
    const cleanRel = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '')
    if (!cleanRel) return true
    if (cleanRel.startsWith('exports/')) return true
    if (/\/exports\//.test(cleanRel)) return true
    if (/writer-os-delivery-/.test(cleanRel)) return true
    if (/DELIVERY_MANIFEST\.json$/i.test(cleanRel)) return true
    if (/DELIVERY_VERIFY\.json$/i.test(cleanRel)) return true
    if (/\.zip$/i.test(cleanRel)) return true
    return false
  }

  const safeCopyProjectFile = (project, deliveryRoot, rel, manifest) => {
    const cleanRel = String(rel || '').replace(/^[\\/]+/, '')
    if (!cleanRel || cleanRel.includes('..')) return false
    if (isDeliveryExcludedPath(cleanRel)) return false
    const src = path.join(project.folder, cleanRel)
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) return false
    const dst = path.join(deliveryRoot, cleanRel)
    fs.mkdirSync(path.dirname(dst), { recursive: true })
    fs.copyFileSync(src, dst)
    const stat = fs.statSync(dst)
    manifest.files.push({ rel: cleanRel.replace(/\\/g, '/'), bytes: stat.size, sha1: fileHash(dst) })
    return true
  }

  const findLatestDeliveryManifest = project => {
    const exportsDir = path.join(project.folder, 'exports')
    if (!fs.existsSync(exportsDir)) return ''
    const rows = fs.readdirSync(exportsDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith('writer-os-delivery-'))
      .map(entry => path.join(exportsDir, entry.name, 'DELIVERY_MANIFEST.json'))
      .filter(file => fs.existsSync(file))
      .map(file => ({ file, mtime: fs.statSync(file).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    return rows[0]?.file || ''
  }

  const verifyDeliveryPackage = (project, input = {}) => {
    ensureWriterProjectMetadata(project)
    const manifestInput = String(input.manifest || input.manifest_rel || '').trim()
    const manifestFile = manifestInput
      ? path.join(project.folder, manifestInput.replace(/^[\\/]+/, ''))
      : findLatestDeliveryManifest(project)
    if (!manifestFile || !fs.existsSync(manifestFile)) throw new Error('Delivery manifest not found. Create a delivery package first.')
    const deliveryRoot = path.dirname(manifestFile)
    const manifest = readJsonFile(manifestFile, null)
    if (!manifest || !Array.isArray(manifest.files)) throw new Error('Invalid delivery manifest.')
    const results = manifest.files.map(row => {
      const rel = String(row.rel || '').replace(/^[\\/]+/, '')
      const file = path.join(deliveryRoot, rel)
      const exists = fs.existsSync(file) && fs.statSync(file).isFile()
      const sha1 = exists ? fileHash(file) : ''
      const bytes = exists ? fs.statSync(file).size : 0
      return { rel, exists, bytes, expected_bytes: row.bytes || 0, sha1, expected_sha1: row.sha1 || '', ok: exists && sha1 === row.sha1 && (!row.bytes || bytes === row.bytes) }
    })
    const missing = results.filter(row => !row.exists)
    const changed = results.filter(row => row.exists && !row.ok)
    const ok = missing.length === 0 && changed.length === 0
    const report = { id: `delivery_verify_${Date.now()}`, at: new Date().toISOString(), ok, manifest_rel: path.relative(project.folder, manifestFile), files: results.length, passed: results.filter(row => row.ok).length, missing: missing.length, changed: changed.length, failures: [...missing, ...changed].slice(0, 50) }
    const reportRel = path.join('exports', path.basename(deliveryRoot), 'DELIVERY_VERIFY.json')
    writeJsonFile(path.join(project.folder, reportRel), report)
    recordProjectArtifact(project, { id: `artifact_${textHash(report.id).slice(0, 12)}`, type: 'delivery_verify', title: `${project.title} delivery verification`, source: 'exports', path: path.join(project.folder, reportRel), content: `ok=${ok}\npassed=${report.passed}/${report.files}\nmissing=${missing.length}\nchanged=${changed.length}`, metadata: { manifest: report.manifest_rel } })
    appendWriterProjectVersion(project, ok ? 'delivery-verify-pass' : 'delivery-verify-fail', `Delivery package verification ${ok ? 'passed' : 'failed'} ${report.passed}/${report.files}`, report)
    trackAnalytics('delivery_verified', {
      project_id: project.id,
      ok,
      files: report.files,
      passed: report.passed,
      missing: report.missing,
      changed: report.changed
    })
    flushAnalytics()
    return { ok, project: enrichWriterProject(project), verification: report, report, updated_at: report.at }
  }

  const createDeliveryPackage = (project, input = {}) => {
    ensureWriterProjectMetadata(project)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const deliveryName = `writer-os-delivery-${project.slug || project.id}-${stamp}`
    const deliveryRoot = path.join(project.folder, 'exports', deliveryName)
    fs.mkdirSync(deliveryRoot, { recursive: true })
    const manifest = { version: 1, project_id: project.id, project_title: project.title, created_at: new Date().toISOString(), files: [], sections: [], audit: null, benchmark: null }
    const addSection = (id, title, files = []) => { manifest.sections.push({ id, title, files: files.map(f => String(f).replace(/\\/g, '/')) }) }

    const exported = exportWriterProject(project.id)
    const exportRels = [path.relative(project.folder, exported.file), path.relative(project.folder, exported.json)]
    exportRels.forEach(rel => safeCopyProjectFile(project, deliveryRoot, rel, manifest))
    addSection('manuscript_export', 'Manuscript and project data export', exportRels)

    let audit = null
    try {
      audit = acceptanceAudit(project)
      manifest.audit = { score: audit.audit?.score, status: audit.audit?.status, markdown_rel: audit.markdown_rel, json_rel: audit.json_rel }
      ;[audit.markdown_rel, audit.json_rel].forEach(rel => safeCopyProjectFile(project, deliveryRoot, rel, manifest))
      addSection('acceptance_audit', 'Writer OS acceptance audit', [audit.markdown_rel, audit.json_rel])
    } catch (err) { manifest.audit_error = err instanceof Error ? err.message : String(err) }

    const coreFiles = [
      'project_schema.json', 'workflow_agents.json', 'workflows.json', 'workflow_runs.json',
      'documents/documents.json', 'documents/document_nodes.json',
      'bible/story_bible.json', 'wiki/living_wiki.json', 'graph/knowledge_graph.json', 'narrative-state/narrative_state.json',
      'rag/rag_index.json', 'rag/vector_store.json', 'rag/vector_db/manifest.json', 'rag/vector_db/segments/vectors.jsonl', 'rag/retrieval_contexts.json',
      'capabilities/capability_packs.json', 'safety/safety_reports.json', 'benchmarks/benchmark_runs.json',
      'artifacts/artifacts.json', 'memory/creative_memory.json', 'database/data_model.json', 'roadmap/writer_os_guide.json'
    ]
    const copiedCore = coreFiles.filter(rel => safeCopyProjectFile(project, deliveryRoot, rel, manifest))
    addSection('core_stores', 'Core Writer OS JSON stores', copiedCore)

    const wikiDir = path.join(project.folder, 'wiki')
    const wikiFiles = []
    if (fs.existsSync(wikiDir)) {
      for (const name of fs.readdirSync(wikiDir)) {
        if (/\.md$/i.test(name)) {
          const rel = path.join('wiki', name)
          if (safeCopyProjectFile(project, deliveryRoot, rel, manifest)) wikiFiles.push(rel)
        }
      }
    }
    if (wikiFiles.length) addSection('wiki_pages', 'Living Wiki markdown pages', wikiFiles)

    const artifactStore = syncWriterProjectArtifacts(project)
    const artifactFiles = (artifactStore.artifacts || []).filter(row => row.path && fs.existsSync(row.path) && /\.(md|json|txt)$/i.test(row.path)).slice(0, 40)
    const artifactRels = []
    for (const row of artifactFiles) {
      const rel = path.relative(project.folder, row.path)
      if (safeCopyProjectFile(project, deliveryRoot, rel, manifest)) artifactRels.push(rel)
    }
    if (artifactRels.length) addSection('artifacts', 'Recent indexed artifacts', artifactRels)

    const bench = (readBenchmarkStore(project).runs || [])[0] || null
    manifest.benchmark = bench ? { id: bench.id, readiness_score: bench.readiness_score, maturity_score: bench.maturity_score, score: bench.score, passed: bench.passed, total: bench.total } : null
    const manifestRel = path.join('exports', deliveryName, 'DELIVERY_MANIFEST.json')
    const manifestFile = path.join(project.folder, manifestRel)
    const readmeRel = path.join('exports', deliveryName, 'README.md')
    const readmeFile = path.join(project.folder, readmeRel)
    fs.writeFileSync(readmeFile, [`# Writer OS Delivery Package`, '', `Project: ${project.title}`, `Created: ${manifest.created_at}`, '', `Audit: ${manifest.audit ? `${manifest.audit.status} / ${manifest.audit.score}` : 'not available'}`, `Benchmark: ${manifest.benchmark ? `readiness ${manifest.benchmark.readiness_score ?? manifest.benchmark.score}, maturity ${manifest.benchmark.maturity_score ?? manifest.benchmark.score}` : 'not available'}`, '', `## Sections`, '', ...manifest.sections.map(sec => `- ${sec.title}: ${sec.files.length} files`), '', `See DELIVERY_MANIFEST.json for checksums.`].join('\n'), 'utf8')
    manifest.files.push({ rel: 'README.md', bytes: fs.statSync(readmeFile).size, sha1: fileHash(readmeFile) })
    manifest.meta = { ...(manifest.meta || {}), manifest_rel: 'DELIVERY_MANIFEST.json', note: 'DELIVERY_MANIFEST.json is the checksum authority and is intentionally not self-hashed.' }
    writeJsonFile(manifestFile, manifest)

    let zip = ''
    if (input.zip !== false) {
      zip = `${deliveryRoot}.zip`
      try {
        fs.rmSync(zip, { force: true })
        execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `Compress-Archive -Path ${JSON.stringify(path.join(deliveryRoot, '*'))} -DestinationPath ${JSON.stringify(zip)} -Force`], { stdio: 'ignore', timeout: 120_000 })
      } catch (err) {
        manifest.zip_error = err instanceof Error ? err.message : String(err)
        writeJsonFile(manifestFile, manifest)
        zip = ''
      }
    }
    const packageArtifact = recordProjectArtifact(project, { id: `artifact_${textHash(deliveryName).slice(0, 12)}`, type: 'delivery_package', title: `${project.title} Writer OS delivery package`, source: 'exports', path: zip || deliveryRoot, content: `files=${manifest.files.length}\naudit=${manifest.audit?.status || 'n/a'}\nbenchmark=${manifest.benchmark?.readiness_score ?? manifest.benchmark?.score ?? 'n/a'}`, metadata: { delivery_name: deliveryName, manifest: manifestRel, zip } })
    appendWriterProjectVersion(project, 'delivery-package', `Created Writer OS delivery package ${deliveryName}`, { delivery: path.relative(project.folder, deliveryRoot), zip: zip ? path.relative(project.folder, zip) : '', files: manifest.files.length, audit: manifest.audit })
    trackAnalytics('delivery_package_built', { project_id: project.id, files: manifest.files.length, zip: Boolean(zip) })
    flushAnalytics()
    return { ok: true, project: enrichWriterProject(project), delivery: { name: deliveryName, folder: deliveryRoot, rel: path.relative(project.folder, deliveryRoot), zip, zip_rel: zip ? path.relative(project.folder, zip) : '', manifest, manifest_rel: manifestRel, readme_rel: readmeRel, artifact: packageArtifact }, artifacts: readProjectArtifactStore(project).artifacts, updated_at: new Date().toISOString() }
  }

  const buildWriterDeliveryPackage = (project, input = {}) => {
    const action = String(input.action || '').toLowerCase()
    if (action === 'verify' || action === 'verify-delivery' || action === 'verify-package') {
      return verifyDeliveryPackage(project, input)
    }
    return createDeliveryPackage(project, input)
  }

  return { safeCopyProjectFile, findLatestDeliveryManifest, verifyDeliveryPackage, createDeliveryPackage, buildWriterDeliveryPackage }
}

module.exports = { createWriterDeliveryService }
