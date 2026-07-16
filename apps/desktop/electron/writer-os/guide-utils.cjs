'use strict'

function createWriterGuideService(deps = {}) {
  const {
    fs,
    path,
    ensureWriterProjectMetadata,
    inspectWriterOsProjectSchema,
    syncWriterProjectDocuments,
    readWriterProjectDocumentEngine,
    analyzeWriterProject,
    buildStoryBible,
    readWriterProjectStoryBible,
    readLivingWikiStore,
    generateLivingWikiCandidates,
    confirmLivingWikiUpdates,
    livingWikiReviewQueue,
    readKnowledgeGraphStore,
    buildWriterProjectKnowledgeGraph,
    readNarrativeStateStore,
    buildWriterProjectNarrativeState,
    readCreativeSearchStore,
    runCreativeSearch,
    readCriticCouncilStore,
    runCriticCouncil,
    readCreativeMemoryStore,
    rebuildCreativeMemory,
    readProjectArtifactStore,
    syncWriterProjectArtifacts,
    writerProjectDataModelPath,
    buildWriterProjectDataModel,
    readWriterProjectRagIndexStore,
    buildWriterProjectRagIndex,
    readWriterProjectVectorStore,
    readWriterProjectVectorDatabase,
    buildWriterProjectVectorStore,
    readWorkflows,
    normalizeWorkflow,
    writeWorkflows,
    readWorkflowRuns,
    readCapabilityPackStore,
    syncWriterCapabilityPacks,
    readWriterProjectSafetyStore,
    buildWriterSafetyReport,
    runWriterProjectBenchmark,
    runWriterOsLoopVerification,
    runWriterOsWritingLoop,
    writerProjectGuidePath,
    readJsonFile,
    writeJsonFile,
    findWriterProject,
    enrichWriterProject,
    appendWriterProjectVersion
  } = deps

const guideStep = (id, title, ok, action, detail, endpoint = '') => ({ id, title, ok: Boolean(ok), status: ok ? 'done' : 'todo', action, detail, endpoint })
const buildWriterProjectGuide = project => {
  ensureWriterProjectMetadata(project)
  const schema = inspectWriterOsProjectSchema(project, { repair: false })
  const docs = readWriterProjectDocumentEngine(project.id)
  const story = readWriterProjectStoryBible(project.id).story_bible || {}
  const wiki = readLivingWikiStore(project)
  const graph = readKnowledgeGraphStore(project)
  const state = readNarrativeStateStore(project)
  const search = readCreativeSearchStore(project)
  const critics = readCriticCouncilStore(project)
  const memory = readCreativeMemoryStore(project)
  const artifacts = readProjectArtifactStore(project)
  const model = readJsonFile(writerProjectDataModelPath(project), { entities: [], stores: [] })
  const rag = readWriterProjectRagIndexStore(project)
  const vectors = readWriterProjectVectorStore(project)
  const vectorDb = readWriterProjectVectorDatabase(project)
  const workflows = readWorkflows(project)
  const caps = readCapabilityPackStore(project)
  const safety = readWriterProjectSafetyStore(project)
  const reviewQueue = livingWikiReviewQueue(project)
  const steps = [
    guideStep('schema', 'Project Foundation', schema.ready, 'Repair project structure', `${schema.missing_files.length} missing files`, 'schema'),
    guideStep('documents', 'Document Engine', (docs.documents || []).length > 0, 'Sync document index', `${docs.documents?.length || 0} documents`, 'documents'),
    guideStep('story_bible', 'Story Bible', (story.chapters || []).length > 0 || (story.characters || []).length > 0, 'Rebuild Story Bible', `${story.chapters?.length || 0} chapters / ${story.characters?.length || 0} characters`, 'story-bible'),
    guideStep('living_wiki', 'Living Wiki', (wiki.pages || []).length > 0 || (wiki.pending_updates || []).length > 0, 'Generate wiki candidates', `${wiki.pages?.length || 0} pages / ${wiki.pending_updates?.length || 0} pending`, 'living-wiki'),
    guideStep('knowledge_graph', 'Knowledge Graph', (graph.nodes || []).length > 0, 'Rebuild knowledge graph', `${graph.nodes?.length || 0} nodes / ${graph.edges?.length || 0} edges`, 'knowledge-graph'),
    guideStep('narrative_state', 'Narrative State', (state.characters || []).length > 0 || (state.threads || []).length > 0, 'Rebuild narrative state', `${state.characters?.length || 0} characters / ${state.threads?.length || 0} threads`, 'narrative-state'),
    guideStep('creative_search', 'Creative Search', (search.last_results || []).length > 0 || (search.stats?.searchable_items || 0) > 0, 'Run creative search', `${search.stats?.searchable_items || 0} searchable items`, 'creative-search'),
    guideStep('critic_council', 'Critic Council', (critics.reports || []).length > 0, 'Run critic council', `${critics.reports?.length || 0} reports`, 'critic-council'),
    guideStep('creative_memory', 'Creative Memory', (memory.memories || []).length > 0, 'Rebuild creative memory', `${memory.memories?.length || 0} memories`, 'creative-memory'),
    guideStep('artifacts', 'Artifact Registry', (artifacts.artifacts || []).length > 0, 'Sync artifact registry', `${artifacts.artifacts?.length || 0} artifacts`, 'artifacts'),
    guideStep('data_model', 'Data Model', (model.entities || []).length > 0, 'Inspect data model', `${model.entities?.length || 0} entities / ${model.stores?.length || 0} stores`, 'data-model'),
    guideStep('rag', 'RAG Pipeline', (rag.chunks || []).length > 0, 'Build RAG index', `${rag.chunks?.length || 0} chunks`, 'rag'),
    guideStep('vector_store', 'Vector DB / Store', (vectors.vectors || []).length > 0 && (vectorDb.vectors || 0) > 0, 'Build vector store', `${vectors.vectors?.length || 0} vectors / DB ${vectorDb.vectors || 0}`, 'rag'),
    guideStep('workflow', 'Agent Workflow', (workflows.workflows || []).length > 0, 'Create standard workflow', `${workflows.workflows?.length || 0} workflows`, 'workflow'),
    guideStep('capabilities', 'Capability Packs', (caps.packs || []).length > 0, 'Sync capability packs', `${caps.packs?.length || 0} packs`, 'capability-packs'),
    guideStep('safety', 'Safety & Copyright', (safety.reports || []).length > 0, 'Run safety check', `${safety.reports?.length || 0} reports`, 'safety'),
    guideStep('canon_review', 'Canon Review Queue', (reviewQueue.stats?.total || 0) <= 10, 'Review pending canon changes', `${reviewQueue.stats?.total || 0} pending / ${reviewQueue.stats?.by_kind?.draft_guard || 0} guard / ${reviewQueue.stats?.by_kind?.workflow || 0} workflow`, 'living-wiki'),
    guideStep('writing_loop', 'One-click Writing Loop', (readWorkflowRuns(project).runs || []).some(row => row.writeback && (row.rag_contexts || []).length > 0 && (row.draft_guard_outputs || []).length > 0), 'Run guarded RAG workflow with writeback', `${(readWorkflowRuns(project).runs || []).length} workflow runs`, 'guide')
  ]
  const done = steps.filter(row => row.ok).length
  const next_action = steps.find(row => !row.ok) || null
  const guide = { version: 1, project_id: project.id, updated_at: new Date().toISOString(), progress: { done, total: steps.length, score: Number((done / steps.length).toFixed(3)) }, steps, next_action }
  writeJsonFile(writerProjectGuidePath(project), guide)
  return { ok: true, project: enrichWriterProject(project), guide, steps, next_action, progress: guide.progress, updated_at: guide.updated_at }
}
const readWriterProjectGuide = ref => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const guide = readJsonFile(writerProjectGuidePath(project), null)
  if (!guide) return buildWriterProjectGuide(project)
  return { ok: true, project: enrichWriterProject(project), guide, steps: guide.steps || [], next_action: guide.next_action || null, progress: guide.progress || { done: 0, total: 0, score: 0 }, updated_at: guide.updated_at || null }
}
const maturitySeedChapterText = (project, index) => {
  const n = index + 1
  const names = ['Lin An', 'Mira Vale', 'Qiao Sen', 'Helena Frost', 'Noah Crane', 'Yun Shi', 'Ada North', 'Viktor Ash', 'Rin Grey', 'Saul River']
  const name = names[index % names.length]
  const place = ['Archive City', 'Glass Harbor', 'Old Observatory', 'Rain Market', 'North Station'][index % 5]
  return [
    `# Maturity Seed Chapter ${n}`,
    '',
    `Chapter ${n}: ${name} enters ${place} with a visible goal and a private contradiction.`,
    `Character: ${name}`,
    `Location: ${place}`,
    `Rule: In ${project.title}, every major choice must leave an observable cost in the next scene.`,
    `Worldbuilding: ${place} records promises as physical light, so broken vows dim the streets.`,
    `Foreshadow: the brass key in chapter ${n} opens a door that nobody admits exists.`,
    `Clue: ${name} notices the same three-note signal before each betrayal.`,
    `Timeline: Chapter ${n} morning - ${name} discovers a cost attached to the last decision.`,
    '',
    `## Scene ${n}.1 - pressure`,
    `${name} said the plan was simple, but the room answered with silence. The conflict is concrete: save the witness, lose the map, or keep the map and let the witness vanish.`,
    `Canon: promises cannot be edited after midnight; they can only be paid, transferred, or broken.`,
    `Foreshadow: a scar-shaped reflection appears on the window whenever someone hides the truth.`,
    '',
    `## Scene ${n}.2 - consequence`,
    `${name} walked toward ${place} and realized that the earlier clue was not decoration but a deadline. The chapter ends on a decision, not a summary.`,
    `Timeline: Chapter ${n} night - the brass key becomes warm when the hidden door is mentioned.`,
    `Character: ${names[(index + 1) % names.length]}`,
    `Location: ${['Mirror Bridge', 'East Library', 'Signal Tower', 'Salt Chapel', 'Engine Room'][index % 5]}`,
    ''
  ].join('\n')
}
const generateWriterOsMaturitySeedDocuments = (project, input = {}) => {
  ensureWriterProjectMetadata(project)
  const count = Math.max(10, Math.min(30, Number(input.count || 10)))
  const dir = path.join(project.folder, 'manuscript', 'writer-os-maturity-seed')
  fs.mkdirSync(dir, { recursive: true })
  const files = []
  for (let i = 0; i < count; i += 1) {
    const file = path.join(dir, `seed-chapter-${String(i + 1).padStart(2, '0')}.md`)
    if (!fs.existsSync(file) || input.overwrite === true) fs.writeFileSync(file, maturitySeedChapterText(project, i), 'utf8')
    files.push(path.relative(project.folder, file))
  }
  const docs = syncWriterProjectDocuments(project, { recordVersion: false })
  const analyzed = analyzeWriterProject(project.id, input)
  const wiki = generateLivingWikiCandidates(project)
  const graph = buildWriterProjectKnowledgeGraph(project)
  const state = buildWriterProjectNarrativeState(project)
  appendWriterProjectVersion(project, 'maturity-seed-documents', `Generated ${files.length} Writer OS maturity seed documents`, { files: files.length, nodes: docs.nodes?.length || 0 })
  return { ok: true, project: enrichWriterProject(project), files, documents: docs.documents, nodes: docs.nodes, story_bible: buildStoryBible(project, analyzed.bible), wiki: wiki.wiki, graph: graph.graph, state: state.state, updated_at: new Date().toISOString() }
}
const ensureWriterOsStandardWorkflow = project => {
  const workflowIdText = 'writer_os_standard_chapter_flow'
  const store = readWorkflows(project)
  const existing = (store.workflows || []).find(row => row.id === workflowIdText)
  if (existing) return existing
  const workflow = normalizeWorkflow(project, {
    id: workflowIdText,
    name: 'Writer OS standard chapter flow',
    mode: 'canvas',
    knowledge_binding: { enabled: true, ids: project.knowledge_ids || [] },
    nodes: [
      { id: 'outline', type: 'agent', position: { x: 120, y: 120 }, data: { label: 'Outline with evidence', agent_id: 'outline_architect', knowledge: 'chapter goal conflict pacing canon foreshadow' } },
      { id: 'canon_review', type: 'agent', position: { x: 360, y: 120 }, data: { label: 'Canon and state review', agent_id: 'setting_keeper', knowledge: 'world rules character state relationship timeline' } },
      { id: 'critic', type: 'agent', position: { x: 600, y: 120 }, data: { label: 'Editorial critique', agent_id: 'critic_editor', knowledge: 'reader experience pacing stakes safety' } },
      { id: 'archive', type: 'archive', position: { x: 840, y: 120 }, data: { label: 'Archive workflow output' } },
      { id: 'output', type: 'output', position: { x: 1080, y: 120 }, data: { label: 'Final plan' } }
    ],
    edges: [
      { id: 'e_outline_canon', source: 'outline', target: 'canon_review' },
      { id: 'e_canon_critic', source: 'canon_review', target: 'critic' },
      { id: 'e_critic_archive', source: 'critic', target: 'archive' },
      { id: 'e_archive_output', source: 'archive', target: 'output' }
    ],
    limits: { max_agents: 6, max_parallel: 3, max_loop: 2 }
  })
  writeWorkflows(project, [...(store.workflows || []), workflow])
  appendWriterProjectVersion(project, 'standard-workflow-create', 'Created Writer OS standard chapter workflow', { workflow_id: workflow.id })
  return workflow
}
const runWriterProjectGuideAction = async (project, stepId, input = {}) => {
  const id = String(stepId || '').toLowerCase().replace(/-/g, '_')
  switch (id) {
    case 'schema': return { id, result: inspectWriterOsProjectSchema(project, { repair: true }) }
    case 'documents': return { id, result: syncWriterProjectDocuments(project, { recordVersion: true }) }
    case 'seed_documents': return { id, result: generateWriterOsMaturitySeedDocuments(project, input) }
    case 'story_bible': {
      const analyzed = analyzeWriterProject(project.id, input)
      return { id, result: { ok: true, story_bible: buildStoryBible(analyzed.project, analyzed.bible), files: analyzed.files } }
    }
    case 'living_wiki': return { id, result: generateLivingWikiCandidates(project) }
    case 'knowledge_graph': return { id, result: buildWriterProjectKnowledgeGraph(project) }
    case 'narrative_state': return { id, result: buildWriterProjectNarrativeState(project) }
    case 'creative_search': return { id, result: runCreativeSearch(project, { query: input.query || project.title || 'main character conflict foreshadow setting', limit: input.limit || 12 }) }
    case 'critic_council': return { id, result: runCriticCouncil(project, { text: input.text || '' }) }
    case 'creative_memory': return { id, result: rebuildCreativeMemory(project) }
    case 'artifacts': return { id, result: syncWriterProjectArtifacts(project) }
    case 'data_model': return { id, result: buildWriterProjectDataModel(project) }
    case 'rag': return { id, result: buildWriterProjectRagIndex(project) }
    case 'vector_store': return { id, result: await buildWriterProjectVectorStore(project, { provider: input.provider || input.vectorProvider || 'local', rebuildIndex: input.rebuildIndex !== false }) }
    case 'workflow': return { id, result: { ok: true, workflow: ensureWriterOsStandardWorkflow(project), workflows: readWorkflows(project).workflows || [] } }
    case 'capabilities': return { id, result: syncWriterCapabilityPacks(project) }
    case 'safety': return { id, result: buildWriterSafetyReport(project, { text: input.text || '' }) }
    case 'benchmark': return { id, result: runWriterProjectBenchmark(project) }
    case 'closed_loop': return { id, result: await runWriterOsLoopVerification(project, input) }
    case 'writing_loop': return { id, result: await runWriterOsWritingLoop(project, input) }
    case 'wiki_confirm': {
      const wiki = readLivingWikiStore(project)
      const ids = (wiki.pending_updates || []).filter(row => input.all || row.source?.type === 'workflow_run' || row.type === 'workflow_result').map(row => row.id)
      return { id, result: ids.length ? confirmLivingWikiUpdates(project, { ids, refresh: true }) : { ok: true, confirmed: 0, refresh: { graph: false, creative_memory: false, errors: [] } } }
    }
    case 'canon_review': {
      const queue = livingWikiReviewQueue(project).queue || []
      const safeKinds = new Set(input.all === true ? ['draft_guard', 'workflow', 'wiki_candidate'] : ['draft_guard', 'workflow'])
      const ids = queue.filter(row => safeKinds.has(row.review_kind)).map(row => row.id)
      return { id, result: ids.length ? confirmLivingWikiUpdates(project, { ids, refresh: true }) : { ok: true, confirmed: 0, queue: livingWikiReviewQueue(project), refresh: { graph: false, creative_memory: false, errors: [] } } }
    }
    default: throw new Error(`Unknown guide action: ${stepId}`)
  }
}
const runWriterProjectGuideRepair = async (project, input = {}) => {
  const sequence = Array.isArray(input.steps) && input.steps.length ? input.steps : ['schema', 'documents', 'story_bible', 'living_wiki', 'knowledge_graph', 'narrative_state', 'creative_search', 'critic_council', 'creative_memory', 'artifacts', 'data_model', 'rag', 'vector_store', 'workflow', 'capabilities', 'safety', 'canon_review', 'writing_loop']
  const results = []
  for (const step of sequence) {
    try { results.push({ step, ok: true, ...(await runWriterProjectGuideAction(project, step, input)) }) }
    catch (err) { results.push({ step, ok: false, error: err instanceof Error ? err.message : String(err) }) }
  }
  if (input.confirmWiki === true) {
    try { results.push({ step: 'wiki_confirm', ok: true, ...(await runWriterProjectGuideAction(project, 'wiki_confirm', { ...input, all: true })) }) }
    catch (err) { results.push({ step: 'wiki_confirm', ok: false, error: err instanceof Error ? err.message : String(err) }) }
  }
  const guide = buildWriterProjectGuide(project)
  const benchmark = runWriterProjectBenchmark(project)
  appendWriterProjectVersion(project, 'guide-repair', `Writer OS guide repair ran ${results.length} actions`, { ok: results.filter(row => row.ok).length, failed: results.filter(row => !row.ok).length, benchmark: benchmark.run?.id })
  return { ok: results.every(row => row.ok), project: enrichWriterProject(project), results, guide: guide.guide, steps: guide.steps, next_action: guide.next_action, progress: guide.progress, benchmark: benchmark.run, updated_at: new Date().toISOString() }
}
const handleWriterProjectGuide = async (ref, body = {}) => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const action = String(body.action || 'build').toLowerCase()
  if (action === 'repair' || action === 'repair-all' || action === 'bootstrap') return runWriterProjectGuideRepair(project, body)
  if (action === 'run-step' || action === 'step') {
    const result = await runWriterProjectGuideAction(project, body.step || body.id || body.target, body)
    const guide = buildWriterProjectGuide(project)
    return { ok: true, project: enrichWriterProject(project), action_result: result, guide: guide.guide, steps: guide.steps, next_action: guide.next_action, progress: guide.progress, updated_at: guide.updated_at }
  }
  if (action === 'next') {
    const guide = buildWriterProjectGuide(project)
    const next = guide.next_action
    if (!next?.id) return guide
    const result = await runWriterProjectGuideAction(project, next.id, body)
    const updated = buildWriterProjectGuide(project)
    return { ok: true, project: enrichWriterProject(project), action_result: result, guide: updated.guide, steps: updated.steps, next_action: updated.next_action, progress: updated.progress, updated_at: updated.updated_at }
  }
  return buildWriterProjectGuide(project)
}


  return {
    guideStep,
    buildWriterProjectGuide,
    readWriterProjectGuide,
    maturitySeedChapterText,
    generateWriterOsMaturitySeedDocuments,
    ensureWriterOsStandardWorkflow,
    runWriterProjectGuideAction,
    runWriterProjectGuideRepair,
    handleWriterProjectGuide
  }
}

module.exports = { createWriterGuideService }
