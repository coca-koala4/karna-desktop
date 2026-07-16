/* eslint-disable no-unused-vars, no-empty, no-control-regex, no-useless-escape, no-undef */
'use strict'

function createWriterMemoryArtifactsService(deps = {}) {
  const {
    fs,
    path,
    crypto,
    ensureWriterProjectMetadata,
    readJsonFile,
    writeJsonFile,
    writerProjectCreativeMemoryPath,
    writerProjectManifestPath,
    writerProjectArtifactsPath,
    readWriterProjectStoryBible,
    readLivingWikiStore,
    readNarrativeStateStore,
    readCriticCouncilStore,
    uniqueBy,
    textHash,
    enrichWriterProject,
    findWriterProject,
    appendWriterProjectVersion,
    writeLivingWikiStore,
    writeNarrativeStateStore,
    workflowRunSummaryText
  } = deps

const readCreativeMemoryStore = project => {
  ensureWriterProjectMetadata(project)
  return readJsonFile(writerProjectCreativeMemoryPath(project), { version: 1, project_id: project.id, memories: [], decisions: [], preferences: [], stats: { memories: 0 }, updated_at: null })
}
const writeCreativeMemoryStore = (project, store) => {
  const memories = (store.memories || []).slice(0, 300)
  const next = { ...store, version: 1, project_id: project.id, updated_at: new Date().toISOString(), memories, decisions: (store.decisions || []).slice(0, 120), preferences: (store.preferences || []).slice(0, 120), stats: { memories: memories.length, pinned: memories.filter(row => row.pinned).length, decisions: (store.decisions || []).length, preferences: (store.preferences || []).length, types: memories.reduce((acc, row) => { acc[row.type] = (acc[row.type] || 0) + 1; return acc }, {}) } }
  writeJsonFile(writerProjectCreativeMemoryPath(project), next)
  return next
}
const normalizeCreativeMemory = (row, source = 'manual') => {
  const type = String(row?.type || 'note').trim() || 'note'
  const title = String(row?.title || row?.name || type).trim().slice(0, 120)
  const content = String(row?.content || row?.summary || row?.note || row?.text || '').trim()
  const evidence = String(row?.evidence || row?.source || '').trim()
  const id = String(row?.id || `mem_${textHash(`${type}:${title}:${content}:${evidence}`).slice(0, 12)}`)
  return { id, type, title, content, evidence, source: String(row?.source || source), confidence: Number(row?.confidence || 0.75), pinned: Boolean(row?.pinned), created_at: row?.created_at || new Date().toISOString(), updated_at: new Date().toISOString() }
}
const buildCreativeMemoryCandidates = project => {
  const story = readWriterProjectStoryBible(project.id).story_bible || {}
  const wiki = readLivingWikiStore(project)
  const state = readNarrativeStateStore(project)
  const critics = readCriticCouncilStore(project)
  const rows = []
  for (const row of story.characters || []) rows.push(normalizeCreativeMemory({ type: 'character', title: row.name, content: row.note || 'Character exists in Story Bible.', evidence: row.evidence, source: 'story_bible', confidence: 0.86 }))
  for (const row of story.world_rules || []) rows.push(normalizeCreativeMemory({ type: 'world_rule', title: row.rule, content: row.snippet || row.rule, evidence: row.evidence, source: 'story_bible', confidence: 0.82 }))
  for (const row of story.foreshadows || []) rows.push(normalizeCreativeMemory({ type: 'foreshadow', title: row.clue, content: `status: ${row.status || 'open'}`, evidence: row.evidence, source: 'story_bible', confidence: 0.8 }))
  for (const row of wiki.pages || []) rows.push(normalizeCreativeMemory({ type: `wiki_${row.type || 'page'}`, title: row.title, content: row.summary || '', evidence: row.evidence || row.rel, source: 'living_wiki', confidence: 0.9, pinned: true }))
  for (const row of state.characters || []) rows.push(normalizeCreativeMemory({ type: 'character_state', title: row.name || row.title, content: [row.status, row.goal, row.tension, row.note].filter(Boolean).join(' / '), evidence: row.evidence || row.last_seen, source: 'narrative_state', confidence: 0.78 }))
  for (const row of state.threads || []) rows.push(normalizeCreativeMemory({ type: 'thread', title: row.title || row.clue || row.id, content: [row.type, row.status, row.resolved_at].filter(Boolean).join(' / '), evidence: row.evidence || row.opened_at, source: 'narrative_state', confidence: 0.76 }))
  const latestCritic = (critics.reports || [])[0]
  for (const row of latestCritic?.findings || []) rows.push(normalizeCreativeMemory({ type: 'critic_finding', title: row.title, content: row.suggestion || '', evidence: (row.evidence || []).join('; '), source: 'critic_council', confidence: 0.7 }))
  return uniqueBy(rows.filter(row => row.title || row.content), row => row.id).slice(0, 260)
}
const rebuildCreativeMemory = project => {
  const store = readCreativeMemoryStore(project)
  const manual = (store.memories || []).filter(row => row.source === 'manual' || row.pinned)
  const candidates = buildCreativeMemoryCandidates(project)
  const merged = uniqueBy([...manual, ...candidates], row => row.id)
  const next = writeCreativeMemoryStore(project, { ...store, memories: merged })
  const manifestFile = writerProjectManifestPath(project)
  const manifest = readJsonFile(manifestFile, {})
  writeJsonFile(manifestFile, { ...manifest, project_memory: { ...(manifest.project_memory || {}), creative_memory: 'memory/creative_memory.json', isolated: true }, updated_at: new Date().toISOString() })
  appendWriterProjectVersion(project, 'creative-memory-build', `Built Creative Memory with ${next.memories.length} memories`, { memories: next.memories.length })
  return { ok: true, project: enrichWriterProject(project), memory: next, memories: next.memories, updated_at: next.updated_at }
}
const addCreativeMemory = (project, input = {}) => {
  const store = readCreativeMemoryStore(project)
  const memory = normalizeCreativeMemory({ ...input, source: 'manual', confidence: Number(input.confidence || 1), pinned: input.pinned !== false }, 'manual')
  const next = writeCreativeMemoryStore(project, { ...store, memories: [memory, ...(store.memories || []).filter(row => row.id !== memory.id)] })
  appendWriterProjectVersion(project, 'creative-memory-add', `Pinned Creative Memory: ${memory.title}`, { memory: memory.id })
  return { ok: true, project: enrichWriterProject(project), memory: next, memories: next.memories, added: memory, updated_at: next.updated_at }
}
const forgetCreativeMemory = (project, input = {}) => {
  const id = String(input.id || input.memory_id || '').trim()
  if (!id) throw new Error('Creative Memory id is required.')
  const store = readCreativeMemoryStore(project)
  const next = writeCreativeMemoryStore(project, { ...store, memories: (store.memories || []).filter(row => row.id !== id) })
  appendWriterProjectVersion(project, 'creative-memory-forget', `Forgot Creative Memory: ${id}`, { memory: id })
  return { ok: true, project: enrichWriterProject(project), memory: next, memories: next.memories, forgotten: id, updated_at: next.updated_at }
}
const readWriterProjectCreativeMemory = ref => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const store = readCreativeMemoryStore(project)
  return { ok: true, project: enrichWriterProject(project), memory: store, memories: store.memories || [], updated_at: store.updated_at || null }
}
const handleWriterProjectCreativeMemory = (ref, body = {}) => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const action = String(body.action || 'build').toLowerCase()
  if (action === 'add') return addCreativeMemory(project, body)
  if (action === 'forget' || action === 'delete') return forgetCreativeMemory(project, body)
  return rebuildCreativeMemory(project)
}

const readProjectArtifactStore = project => {
  ensureWriterProjectMetadata(project)
  return readJsonFile(writerProjectArtifactsPath(project), { version: 1, project_id: project.id, artifacts: [], stats: { artifacts: 0 }, updated_at: null })
}
const writeProjectArtifactStore = (project, store) => {
  const artifacts = (store.artifacts || []).slice(0, 300)
  const next = { ...store, version: 1, project_id: project.id, updated_at: new Date().toISOString(), artifacts, stats: { artifacts: artifacts.length, types: artifacts.reduce((acc, row) => { acc[row.type] = (acc[row.type] || 0) + 1; return acc }, {}), sources: artifacts.reduce((acc, row) => { acc[row.source] = (acc[row.source] || 0) + 1; return acc }, {}) } }
  const artifactPath = writerProjectArtifactsPath(project)
  if (fs.existsSync(artifactPath)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupPath = path.join(path.dirname(artifactPath), `artifacts.backup.${ts}.json`)
    try { fs.copyFileSync(artifactPath, backupPath) } catch {}
  }
  writeJsonFile(artifactPath, next)
  return next
}
const projectArtifactFromFile = (project, file, source = 'file') => {
  const rel = path.relative(project.folder, file)
  const stat = fs.statSync(file)
  const ext = path.extname(file).toLowerCase()
  const type = ext === '.json' ? 'json' : ['.md', '.markdown'].includes(ext) ? 'markdown' : ext === '.txt' ? 'text' : 'file'
  let preview = ''
  if (['.md', '.markdown', '.txt', '.json'].includes(ext)) {
    try { preview = fs.readFileSync(file, 'utf8').slice(0, 800) } catch {}
  }
  return { id: `artifact_${textHash(rel).slice(0, 12)}`, type, title: path.basename(file), source, rel, path: file, bytes: stat.size, updated_at: stat.mtime.toISOString(), preview }
}
const isArtifactExcludedPath = (project, filePath) => {
  const rel = path.relative(project.folder, filePath).replace(/\\/g, '/')
  if (!rel || rel.startsWith('..')) return true
  if (/writer-os-delivery-/.test(rel)) return true
  if (/DELIVERY_MANIFEST\.json$/i.test(rel)) return true
  if (/DELIVERY_VERIFY\.json$/i.test(rel)) return true
  if (/\.zip$/i.test(rel)) return true
  if (/\/exports\//.test(rel) && /writer-os-delivery-/.test(rel)) return true
  return false
}

const scanWriterProjectArtifacts = project => {
  const roots = [
    ['exports', path.join(project.folder, 'exports')],
    ['workflow', path.join(project.folder, 'workflow_artifacts')],
    ['draft', path.join(project.folder, 'drafts')],
    ['safety', path.join(project.folder, 'safety')],
    ['critics', path.join(project.folder, 'critics')],
    ['memory', path.join(project.folder, 'memory')]
  ]
  const rows = []
  const deliveryPackages = new Map()
  for (const [source, dir] of roots) {
    if (!fs.existsSync(dir)) continue
    const files = []
    const walk = folder => {
      let entries = []
      try { entries = fs.readdirSync(folder, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        const full = path.join(folder, entry.name)
        if (entry.isDirectory()) {
          if (/^writer-os-delivery-/.test(entry.name)) {
            const manifestPath = path.join(full, entry.name, 'DELIVERY_MANIFEST.json')
            if (fs.existsSync(manifestPath)) {
              const pkgRel = path.relative(project.folder, path.join(folder, entry.name)).replace(/\\/g, '/')
              deliveryPackages.set(pkgRel, { path: path.join(folder, entry.name), manifest: manifestPath, source })
            }
            continue
          }
          walk(full)
        }
        if (entry.isFile() && /\.(md|markdown|txt|json)$/i.test(entry.name)) files.push(full)
      }
    }
    walk(dir)
    for (const file of uniqueBy(files, row => row)) {
      if (path.basename(file) === 'artifacts.json') continue
      if (isArtifactExcludedPath(project, file)) continue
      try { rows.push(projectArtifactFromFile(project, file, source)) } catch {}
    }
  }
  for (const [rel, pkg] of deliveryPackages) {
    try {
      const stat = fs.statSync(pkg.path)
      rows.push({
        id: `artifact_${textHash(`delivery:${rel}`).slice(0, 12)}`,
        type: 'delivery_package',
        title: `${path.basename(rel)}`,
        source: pkg.source,
        rel,
        path: pkg.path,
        bytes: stat.size,
        updated_at: stat.mtime.toISOString(),
        preview: '',
        metadata: { manifest: path.join(rel, 'DELIVERY_MANIFEST.json'), is_delivery_package: true }
      })
    } catch {}
  }
  return rows
}
const recordProjectArtifact = (project, artifact = {}) => {
  const store = readProjectArtifactStore(project)
  const row = {
    id: artifact.id || `artifact_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    type: artifact.type || 'file',
    title: artifact.title || path.basename(String(artifact.path || artifact.url || 'artifact')),
    source: artifact.source || 'manual',
    rel: artifact.rel || (artifact.path ? path.relative(project.folder, artifact.path) : ''),
    path: artifact.path || artifact.url || '',
    bytes: Number(artifact.bytes || (artifact.path && fs.existsSync(artifact.path) ? fs.statSync(artifact.path).size : 0)),
    updated_at: artifact.updated_at || new Date().toISOString(),
    preview: String(artifact.preview || artifact.content || '').slice(0, 1200),
    metadata: artifact.metadata || {}
  }
  const next = writeProjectArtifactStore(project, { ...store, artifacts: [row, ...(store.artifacts || []).filter(item => item.id !== row.id && item.path !== row.path)] })
  return row
}
const persistWorkflowRunWritebacks = (project, workflow, run, finalArtifact = null) => {
  const now = new Date().toISOString()
  const writeback = { artifacts: 0, wiki_pending: 0, narrative_threads: 0, errors: [] }
  try {
    const artifacts = []
    for (const artifact of run.artifacts || []) {
      if (!artifact?.path) continue
      artifacts.push(recordProjectArtifact(project, {
        id: `artifact_${textHash(`${run.run_id}:${artifact.id}:${artifact.path}`).slice(0, 12)}`,
        type: 'markdown',
        title: artifact.title || `${workflow.name} artifact`,
        source: 'workflow',
        path: artifact.path,
        content: artifact.content || '',
        metadata: { workflow_id: workflow.id, run_id: run.run_id, node_id: artifact.node_id, kind: artifact.kind, rag_contexts: run.rag_contexts || [] }
      }))
    }
    writeback.artifacts = artifacts.length
  } catch (err) { writeback.errors.push(`artifact: ${err instanceof Error ? err.message : String(err)}`) }
  try {
    const wiki = readLivingWikiStore(project)
    const evidence = finalArtifact?.path ? path.relative(project.folder, finalArtifact.path) : `workflow_runs.json#${run.run_id}`
    const pending = {
      id: `wiki_up_${textHash(`workflow:${run.run_id}:${workflow.id}`).slice(0, 12)}`,
      type: 'workflow_result',
      title: `${workflow.name} / ${run.run_id}`,
      summary: String(finalArtifact?.content || workflowRunSummaryText(run) || '').slice(0, 1200),
      evidence,
      source: { type: 'workflow_run', workflow_id: workflow.id, run_id: run.run_id, rag_contexts: run.rag_contexts || [] },
      status: 'pending',
      created_at: now
    }
    const exists = new Set([...(wiki.pending_updates || []), ...(wiki.pages || [])].map(row => row.id))
    if (!exists.has(pending.id)) {
      writeLivingWikiStore(project, { ...wiki, pending_updates: [pending, ...(wiki.pending_updates || [])].slice(0, 200) })
      writeback.wiki_pending = 1
    }
  } catch (err) { writeback.errors.push(`wiki: ${err instanceof Error ? err.message : String(err)}`) }
  try {
    const state = readNarrativeStateStore(project)
    const thread = {
      id: `thread_${textHash(`workflow:${run.run_id}`).slice(0, 12)}`,
      type: 'workflow_result',
      title: `${workflow.name} run`,
      status: run.status,
      opened_at: run.started_at,
      resolved_at: run.finished_at,
      evidence: finalArtifact?.path ? path.relative(project.folder, finalArtifact.path) : `workflow_runs.json#${run.run_id}`,
      note: String(finalArtifact?.content || workflowRunSummaryText(run) || '').slice(0, 800),
      rag_contexts: run.rag_contexts || []
    }
    const threads = [thread, ...(state.threads || []).filter(row => row.id !== thread.id)].slice(0, 200)
    writeNarrativeStateStore(project, { ...state, threads })
    writeback.narrative_threads = 1
  } catch (err) { writeback.errors.push(`state: ${err instanceof Error ? err.message : String(err)}`) }
  appendWriterProjectVersion(project, 'workflow-writeback', `Workflow run writeback: ${workflow.name}`, { run_id: run.run_id, workflow_id: workflow.id, ...writeback })
  return writeback
}
const syncWriterProjectArtifacts = project => {
  const store = readProjectArtifactStore(project)
  const scanned = scanWriterProjectArtifacts(project)
  const merged = uniqueBy([...scanned, ...(store.artifacts || [])], row => row.path || row.id)
  const next = writeProjectArtifactStore(project, { ...store, artifacts: merged })
  appendWriterProjectVersion(project, 'artifact-index-sync', `Synced ${next.artifacts.length} project artifacts`, { artifacts: next.artifacts.length })
  return { ok: true, project: enrichWriterProject(project), artifacts: next.artifacts, stats: next.stats, updated_at: next.updated_at }
}
const readWriterProjectArtifacts = ref => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const store = readProjectArtifactStore(project)
  return { ok: true, project: enrichWriterProject(project), artifacts: store.artifacts || [], stats: store.stats || {}, updated_at: store.updated_at || null }
}


  return {
    readCreativeMemoryStore,
    writeCreativeMemoryStore,
    normalizeCreativeMemory,
    buildCreativeMemoryCandidates,
    rebuildCreativeMemory,
    addCreativeMemory,
    forgetCreativeMemory,
    readWriterProjectCreativeMemory,
    handleWriterProjectCreativeMemory,
    readProjectArtifactStore,
    writeProjectArtifactStore,
    projectArtifactFromFile,
    scanWriterProjectArtifacts,
    recordProjectArtifact,
    persistWorkflowRunWritebacks,
    syncWriterProjectArtifacts,
    readWriterProjectArtifacts
  }
}

module.exports = { createWriterMemoryArtifactsService }
