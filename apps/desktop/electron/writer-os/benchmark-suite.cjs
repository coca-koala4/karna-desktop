/* eslint-disable no-unused-vars, no-empty, no-control-regex, no-useless-escape, no-undef */
'use strict'

function createWriterBenchmarkService(deps = {}) {
  const {
    fs,
    path,
    ensureWriterProjectMetadata,
    writerProjectMilestonesPath,
    writerProjectBenchmarkRunsPath,
    writerProjectDataModelPath,
    writerProjectGuidePath,
    readJsonFile,
    writeJsonFile,
    inspectWriterOsProjectSchema,
    readWriterProjectDocumentEngine,
    readWriterProjectStoryBible,
    readLivingWikiStore,
    readKnowledgeGraphStore,
    readNarrativeStateStore,
    readWriterProjectRagIndexStore,
    readCreativeSearchStore,
    creativeSearchRows,
    readCriticCouncilStore,
    readCreativeMemoryStore,
    readProjectArtifactStore,
    readWriterProjectSafetyStore,
    readWorkflows,
    readCapabilityPackStore,
    readWriterProjectVectorStore,
    readWriterProjectVectorDatabase,
    readWriterProjectRetrievalContextStore,
    readWorkflowRuns,
    livingWikiReviewQueue,
    benchmarkCheck,
    maturityGapsForChecks,
    findWriterProject,
    enrichWriterProject,
    appendWriterProjectVersion
  } = deps

const writerOsMilestoneTemplates = () => [
  { id: 'foundation', title: 'Project Foundation', status: 'done', deliverables: ['project_schema.json', 'required folders', 'module health panel'] },
  { id: 'documents', title: 'Document Engine', status: 'done', deliverables: ['documents/documents.json', 'documents/document_nodes.json'] },
  { id: 'creative_search', title: 'Creative Search Engine', status: 'done', deliverables: ['search/creative_search.json', 'cross-module evidence search'] },
  { id: 'story_bible', title: 'Story Bible', status: 'done', deliverables: ['bible/story_bible.json', 'formalized canon index'] },
  { id: 'living_wiki', title: 'Living Wiki', status: 'done', deliverables: ['wiki/living_wiki.json', 'confirmed markdown pages'] },
  { id: 'knowledge_graph', title: 'Knowledge Graph', status: 'done', deliverables: ['graph/knowledge_graph.json', 'nodes and edges'] },
  { id: 'narrative_state', title: 'Narrative State Engine', status: 'done', deliverables: ['narrative-state/narrative_state.json'] },
  { id: 'critic_council', title: 'Critic Council', status: 'done', deliverables: ['critics/critic_council.json', 'multi-lens critique reports'] },
  { id: 'creative_memory', title: 'Creative Memory', status: 'done', deliverables: ['memory/creative_memory.json', 'pinned project memory'] },
  { id: 'artifact_registry', title: 'Artifact / Export Registry', status: 'done', deliverables: ['artifacts/artifacts.json', 'exports and workflow artifact index'] },
  { id: 'data_model', title: 'Database / Data Model', status: 'done', deliverables: ['database/data_model.json', 'entity and store inspector'] },
  { id: 'writer_os_guide', title: 'Writer OS Command Center', status: 'done', deliverables: ['roadmap/writer_os_guide.json', 'guided next-action panel'] },
  { id: 'agent_workflow', title: 'Agent Workflow', status: 'done', deliverables: ['workflow_agents.json', 'workflows.json', 'workflow_runs.json'] },
  { id: 'capability_packs', title: 'Skill / Capability Packs', status: 'done', deliverables: ['capabilities/capability_packs.json'] },
  { id: 'rag_pipeline', title: 'RAG Pipeline', status: 'done', deliverables: ['rag/rag_index.json', 'rag/vector_store.json', 'rag/vector_db/manifest.json', 'rag/retrieval_contexts.json'] },
  { id: 'soul_workshop', title: 'Soul Workshop Bridge', status: 'done', deliverables: ['safe method profile bridge'] },
  { id: 'safety', title: 'Safety & Copyright', status: 'done', deliverables: ['safety/safety_reports.json'] },
  { id: 'benchmarks', title: 'Testing & Benchmark', status: 'in_progress', deliverables: ['benchmarks/benchmark_runs.json', 'one-click benchmark panel'] }
]
const readWriterProjectMilestonesStore = project => {
  ensureWriterProjectMetadata(project)
  const current = readJsonFile(writerProjectMilestonesPath(project), { version: 1, project_id: project.id, milestones: [], updated_at: null })
  if (!Array.isArray(current.milestones) || !current.milestones.length) return writeJsonFile(writerProjectMilestonesPath(project), { version: 1, project_id: project.id, milestones: writerOsMilestoneTemplates(), updated_at: new Date().toISOString() })
  return current
}
const readWriterProjectBenchmarkStore = project => {
  ensureWriterProjectMetadata(project)
  return readJsonFile(writerProjectBenchmarkRunsPath(project), { version: 1, project_id: project.id, runs: [], updated_at: null })
}
const writeWriterProjectBenchmarkStore = (project, store) => {
  const next = { ...store, version: 1, project_id: project.id, updated_at: new Date().toISOString(), runs: (store.runs || []).slice(0, 100) }
  writeJsonFile(writerProjectBenchmarkRunsPath(project), next)
  return next
}

const runWriterProjectBenchmark = project => {
  ensureWriterProjectMetadata(project)
  const schema = inspectWriterOsProjectSchema(project, { repair: false })
  const docs = readWriterProjectDocumentEngine(project.id)
  const story = readWriterProjectStoryBible(project.id).story_bible
  const wiki = readLivingWikiStore(project)
  const graph = readKnowledgeGraphStore(project)
  const state = readNarrativeStateStore(project)
  const rag = readWriterProjectRagIndexStore(project)
  const search = readCreativeSearchStore(project)
  const searchSources = creativeSearchRows(project)
  const critics = readCriticCouncilStore(project)
  const memory = readCreativeMemoryStore(project)
  const artifacts = readProjectArtifactStore(project)
  const dataModel = readJsonFile(writerProjectDataModelPath(project), { entities: [], stores: [], snapshots: [] })
  const guide = readJsonFile(writerProjectGuidePath(project), { steps: [], progress: { done: 0, total: 0, score: 0 } })
  const safety = readWriterProjectSafetyStore(project)
  const workflows = readWorkflows(project)
  const caps = readCapabilityPackStore(project)
  const vectors = readWriterProjectVectorStore(project)
  const contexts = readWriterProjectRetrievalContextStore(project)
  const workflowRuns = readWorkflowRuns(project).runs || []
  const reviewQueue = livingWikiReviewQueue(project)
  const reviewStats = reviewQueue.stats || { total: 0, by_kind: {}, by_type: {} }
  const draftGuardInputRuns = workflowRuns.filter(row => row.draft_guard && !row.draft_guard.error)
  const draftGuardOutputRows = workflowRuns.flatMap(row => row.draft_guard_outputs || [])
  const draftGuardBlockedOutputs = draftGuardOutputRows.filter(row => row.blocked)
  const workflowRagRuns = workflowRuns.filter(row => (row.rag_contexts || []).length > 0)
  const workflowWritebackRuns = workflowRuns.filter(row => row.writeback && (row.writeback.artifacts || row.writeback.wiki_pending || row.writeback.narrative_threads))
  const workflowWritebackErrors = workflowRuns.flatMap(row => row.writeback?.errors || [])
  const soulMethodWorkflowRuns = workflowRuns.filter(row => (row.soul_method_packs || []).length > 0 || Object.values(row.node_statuses || {}).some(status => (status.soul_method_pack_ids || []).length > 0))
  const confirmedWorkflowWiki = (wiki.pages || []).filter(row => row.source?.type === 'workflow_run' || row.source?.type === 'draft_guard' || row.type === 'workflow_result')
  const workflowMemory = (memory.memories || []).filter(row => String(row.source || '').includes('living_wiki') && String(row.type || '').includes('workflow'))
  const checks = [
    benchmarkCheck('schema_ready', 'Project schema ready', schema.ready, `${schema.missing_files.length} missing files`, schema.ready ? 1 : 0),
    benchmarkCheck('documents_indexed', 'Documents indexed', (docs.documents || []).length > 0 || (docs.nodes || []).length > 0, `${docs.documents?.length || 0} documents / ${docs.nodes?.length || 0} nodes`, Math.min(1, ((docs.nodes || []).length || 0) / 10)),
    benchmarkCheck('story_bible', 'Story Bible available', Boolean(story?.updated_at || (story?.characters || []).length || (story?.chapters || []).length), `${story?.characters?.length || 0} characters`, story?.characters?.length ? 1 : 0.4),
    benchmarkCheck('creative_search', 'Creative search ready', searchSources.length > 0, `${searchSources.length} searchable items / ${search.queries?.length || 0} queries`, Math.min(1, searchSources.length / 20)),
    benchmarkCheck('living_wiki', 'Living Wiki available', (wiki.pages || []).length > 0 || (wiki.pending_updates || []).length > 0, `${wiki.pages?.length || 0} pages / ${wiki.pending_updates?.length || 0} pending`, Math.min(1, ((wiki.pages || []).length + (wiki.pending_updates || []).length) / 8)),
    benchmarkCheck('knowledge_graph', 'Knowledge graph built', (graph.nodes || []).length > 0, `${graph.nodes?.length || 0} nodes / ${graph.edges?.length || 0} edges`, Math.min(1, ((graph.nodes || []).length || 0) / 20)),
    benchmarkCheck('narrative_state', 'Narrative state built', (state.characters || []).length > 0 || (state.threads || []).length > 0, `${state.characters?.length || 0} characters / ${state.threads?.length || 0} threads`, Math.min(1, (((state.characters || []).length + (state.threads || []).length) || 0) / 10)),
    benchmarkCheck('critic_council', 'Critic Council report exists', (critics.reports || []).length > 0, `${critics.reports?.length || 0} reports`, (critics.reports || []).length ? 1 : 0),
    benchmarkCheck('creative_memory', 'Creative Memory built', (memory.memories || []).length > 0, `${memory.memories?.length || 0} memories`, Math.min(1, ((memory.memories || []).length || 0) / 20)),
    benchmarkCheck('artifact_registry', 'Artifact registry synced', (artifacts.artifacts || []).length > 0, `${artifacts.artifacts?.length || 0} artifacts`, Math.min(1, ((artifacts.artifacts || []).length || 0) / 8)),
    benchmarkCheck('data_model', 'Data model inspected', (dataModel.entities || []).length > 0 && (dataModel.stores || []).length > 0, `${dataModel.entities?.length || 0} entities / ${dataModel.stores?.length || 0} stores`, Math.min(1, ((dataModel.entities || []).length || 0) / 12)),
    benchmarkCheck('writer_os_guide', 'Writer OS guide generated', (guide.steps || []).length > 0, `${guide.progress?.done || 0}/${guide.progress?.total || guide.steps?.length || 0} guide steps`, guide.progress?.score || 0),
    benchmarkCheck('rag_index', 'RAG index built', (rag.chunks || []).length > 0, `${rag.chunks?.length || 0} chunks`, Math.min(1, ((rag.chunks || []).length || 0) / 20)),
    benchmarkCheck('vector_store', 'Vector database built', (vectors.vectors || []).length > 0 && (readWriterProjectVectorDatabase(project).vectors || 0) > 0, `${vectors.vectors?.length || 0} vectors / DB ${readWriterProjectVectorDatabase(project).vectors || 0} / ${vectors.stats?.dimensions || 0} dims`, Math.min(1, ((vectors.vectors || []).length || 0) / 20)),
    benchmarkCheck('rag_context_pack', 'RAG context pack assembled', (contexts.contexts || []).length > 0 && (contexts.contexts || []).some(ctx => (ctx.citations || []).length > 0), `${contexts.contexts?.length || 0} contexts / ${Math.max(0, ...(contexts.contexts || []).map(ctx => ctx.citations?.length || 0))} max citations`, Math.min(1, ((contexts.contexts || []).length || 0) / 3)),
    benchmarkCheck('workflow_ready', 'Agent workflow ready', (workflows.workflows || []).length > 0, `${workflows.workflows?.length || 0} workflows`, (workflows.workflows || []).length ? 1 : 0),
    benchmarkCheck('workflow_rag_injection', 'Workflow uses RAG context', workflowRagRuns.length > 0, `${workflowRagRuns.length} runs with RAG context`, workflowRagRuns.length ? 1 : 0),
    benchmarkCheck('workflow_writeback', 'Workflow writeback stored', workflowWritebackRuns.length > 0 && workflowWritebackErrors.length === 0, `${workflowWritebackRuns.length} writeback runs / ${workflowWritebackErrors.length} errors`, workflowWritebackRuns.length && !workflowWritebackErrors.length ? 1 : workflowWritebackRuns.length ? 0.5 : 0),
    benchmarkCheck('wiki_confirm_refresh', 'Wiki confirmation refreshed graph and memory', confirmedWorkflowWiki.length > 0 && workflowMemory.length > 0 && (graph.nodes || []).length > 0, `${confirmedWorkflowWiki.length} workflow/guard wiki pages / ${workflowMemory.length} workflow memories / ${graph.nodes?.length || 0} graph nodes`, confirmedWorkflowWiki.length && workflowMemory.length ? 1 : confirmedWorkflowWiki.length ? 0.5 : 0),
    benchmarkCheck('canon_review_queue', 'Canon Review Queue under control', (reviewStats.total || 0) <= 25, `${reviewStats.total || 0} pending / ${reviewStats.by_kind?.draft_guard || 0} guard / ${reviewStats.by_kind?.workflow || 0} workflow`, (reviewStats.total || 0) <= 10 ? 1 : Math.max(0, Number((1 - Math.min(100, reviewStats.total || 0) / 100).toFixed(3)))),
    benchmarkCheck('draft_guard_input_gate', 'Workflow input Draft Guard ran', draftGuardInputRuns.length > 0, `${draftGuardInputRuns.length} workflow runs with preflight guard`, draftGuardInputRuns.length ? 1 : 0),
    benchmarkCheck('draft_guard_output_gate', 'Agent output Draft Guard ran', draftGuardOutputRows.length > 0 && draftGuardBlockedOutputs.length === 0, `${draftGuardOutputRows.length} output guards / ${draftGuardBlockedOutputs.length} blocked`, draftGuardOutputRows.length ? (draftGuardBlockedOutputs.length ? 0.5 : 1) : 0),
    benchmarkCheck('capability_packs', 'Capability packs synced', (caps.packs || []).length > 0, `${caps.packs?.length || 0} packs`, Math.min(1, ((caps.packs || []).length || 0) / 6)),
    benchmarkCheck('soul_method_workflow', 'Soul Method Pack used by workflow', soulMethodWorkflowRuns.length > 0, `${soulMethodWorkflowRuns.length} workflow runs with selected Soul Method Pack`, soulMethodWorkflowRuns.length ? 1 : 0),
    benchmarkCheck('safety_report', 'Safety report exists', (safety.reports || []).length > 0, `${safety.reports?.length || 0} reports`, (safety.reports || []).length ? 1 : 0)
  ]
  const passed = checks.filter(row => row.ok).length
  const total = checks.length
  const maturity_score = Number((checks.reduce((sum, row) => sum + row.score, 0) / total).toFixed(3))
  const maturity_gaps = maturityGapsForChecks(checks)
  const readiness_score = Number((passed / total).toFixed(3))
  const score = readiness_score
  const recommendation = readiness_score === 1 && maturity_score >= 0.85
    ? 'production_ready_for_deep_ui_verification'
    : readiness_score === 1
      ? 'all_gates_passed_continue_maturity_depth'
      : readiness_score >= 0.75
        ? 'repair_remaining_gates'
        : 'run_writer_os_guide_repair_first'
  const run = { id: `bench_${Date.now()}`, project_id: project.id, at: new Date().toISOString(), score, readiness_score, maturity_score, maturity_gaps, passed, total, checks, recommendation, scoring: { score: 'readiness_score', readiness_score: 'passed gate ratio', maturity_score: 'average depth score across checks' } }
  const store = readWriterProjectBenchmarkStore(project)
  const next = writeWriterProjectBenchmarkStore(project, { ...store, runs: [run, ...(store.runs || [])] })
  appendWriterProjectVersion(project, 'benchmark-run', `Benchmark readiness ${readiness_score}, maturity ${maturity_score}`, { run: run.id, score, readiness_score, maturity_score })
  return { ok: true, project: enrichWriterProject(project), run, runs: next.runs, milestones: readWriterProjectMilestonesStore(project).milestones, updated_at: next.updated_at }
}

const readWriterProjectBenchmarks = ref => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const benchmarks = readWriterProjectBenchmarkStore(project)
  const milestones = readWriterProjectMilestonesStore(project)
  return { ok: true, project: enrichWriterProject(project), runs: benchmarks.runs || [], milestones: milestones.milestones || [], updated_at: benchmarks.updated_at || milestones.updated_at || null }
}
const handleWriterProjectBenchmarks = (ref, body = {}) => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  return runWriterProjectBenchmark(project)
}

  return {
    writerOsMilestoneTemplates,
    readWriterProjectMilestonesStore,
    readWriterProjectBenchmarkStore,
    writeWriterProjectBenchmarkStore,
    runWriterProjectBenchmark,
    readWriterProjectBenchmarks,
    handleWriterProjectBenchmarks
  }
}

module.exports = { createWriterBenchmarkService }
