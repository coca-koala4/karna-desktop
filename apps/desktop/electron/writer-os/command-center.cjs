/* eslint-disable no-unused-vars, no-empty, no-control-regex, no-useless-escape, no-undef */
'use strict'

function createWriterCommandCenterService(deps = {}) {
  const {
    fs,
    path,
    ensureWriterProjectMetadata,
    inspectWriterOsProjectSchema,
    readWriterProjectDocumentEngine,
    readWriterProjectRagIndexStore,
    readWriterProjectVectorStore,
    vectorHealthFor,
    readKnowledgeGraphStore,
    readNarrativeStateStore,
    readLivingWikiStore,
    livingWikiReviewQueue,
    readWorkflows,
    readWorkflowRuns,
    readWriterProjectSafetyStore,
    readWriterProjectBenchmarkStore,
    readJsonFile,
    writerProjectGuidePath,
    readWriterProjectVectorDatabase,
    statusToneForScore,
    enrichWriterProject,
    findWriterProject,
    runWorkflowForProject,
    updateWorkflowRunNodeAction,
    commandCenterModuleRepairPlan,
    runWriterProjectGuideAction,
    appendWriterProjectVersion,
    readWriterProjectStoryBible,
    readWriterProjectRetrievalContextStore,
    readCapabilityPackStore,
    writerProjectDataModelPath,
    readProjectArtifactStore,
    readCriticCouncilStore,
    readCreativeMemoryStore,
    readWriterProjectMilestonesStore,
    writeJsonFile
  } = deps

const workflowBlockedDiagnostic = project => {
  const runs = readWorkflowRuns(project).runs || []
  const run = [...runs].reverse().find(row => row.status === 'blocked' || Object.values(row.node_statuses || {}).some(node => node.status === 'blocked')) || null
  if (!run) return null
  const workflow = (readWorkflows(project).workflows || []).find(row => row.id === run.workflow_id) || null
  const blockedNodes = Object.entries(run.node_statuses || {}).filter(([, row]) => row.status === 'blocked').map(([node_id, row]) => ({
    node_id,
    label: row.label || node_id,
    status: row.status,
    summary: row.summary || '',
    agent_name: row.agent_name || '',
    rag_context_id: row.rag_context_id || null,
    rag_citations: row.rag_citations || 0,
    draft_guard_id: row.draft_guard_id || null,
    draft_guard_issues: row.draft_guard_issues || 0,
    draft_guard_citations: row.draft_guard_citations || 0,
    draft_guard_blocked: Boolean(row.draft_guard_blocked)
  }))
  const lastOutputGuard = (run.draft_guard_outputs || []).at(-1) || null
  const recommendation = blockedNodes.some(row => row.draft_guard_blocked)
    ? 'Review Draft Guard issues, accept/reject canon changes, then rerun the node.'
    : 'Inspect the blocked node summary, then retry node, skip, or accept it as reviewed.'
  return { run_id: run.run_id, workflow_id: run.workflow_id, workflow_name: workflow?.name || run.workflow_id, status: run.status, blocked_nodes: blockedNodes, paused_at_node_id: run.paused_at_node_id || null, draft_guard: run.draft_guard || null, last_output_guard: lastOutputGuard, recommendation }
}

const buildWriterOsCommandCenter = project => {
  ensureWriterProjectMetadata(project)
  const schema = inspectWriterOsProjectSchema(project, { repair: false })
  const docs = readWriterProjectDocumentEngine(project.id)
  const rag = readWriterProjectRagIndexStore(project)
  const vectors = readWriterProjectVectorStore(project)
  const vectorHealth = vectorHealthFor(rag, vectors)
  const graph = readKnowledgeGraphStore(project)
  const state = readNarrativeStateStore(project)
  const wiki = readLivingWikiStore(project)
  const queue = livingWikiReviewQueue(project)
  const workflowStore = readWorkflows(project)
  const workflowRuns = readWorkflowRuns(project).runs || []
  const latestRun = workflowRuns.at(-1) || null
  const workflow_issue = latestRun?.status === 'blocked'
    ? workflowBlockedDiagnostic(project)
    : null
  const safety = readWriterProjectSafetyStore(project)
  const benchmarkStore = readWriterProjectBenchmarkStore(project)
  const lastBench = (benchmarkStore.runs || [])[0] || null
  const guide = readJsonFile(writerProjectGuidePath(project), null)
  const draftInput = workflowRuns.filter(row => row.draft_guard && !row.draft_guard.error)
  const draftOutputs = workflowRuns.flatMap(row => row.draft_guard_outputs || [])
  const draftBlocked = draftOutputs.filter(row => row.blocked)
  const latestSafety = (safety.reports || [])[0] || null
  const modules = [
    { id: 'foundation', title: 'Project foundation', status: schema.ready ? 'green' : 'red', metric: `${schema.missing_files.length} missing`, action: schema.ready ? 'ready' : 'repair schema' },
    { id: 'documents', title: 'Documents', status: (docs.nodes || []).length >= 10 ? 'green' : (docs.nodes || []).length ? 'yellow' : 'red', metric: `${docs.documents?.length || 0} docs / ${docs.nodes?.length || 0} nodes`, action: 'sync or seed documents' },
    { id: 'rag', title: 'RAG + vector DB', status: vectorHealth.ready && (rag.chunks || []).length >= 20 && (readWriterProjectVectorDatabase(project).vectors || 0) > 0 ? 'green' : (rag.chunks || []).length ? 'yellow' : 'red', metric: `${rag.chunks?.length || 0} chunks / ${vectors.vectors?.length || 0} vectors / DB ${readWriterProjectVectorDatabase(project).vectors || 0} / ${Math.round((vectorHealth.coverage || 0) * 100)}%`, action: 'build RAG/vector database' },
    { id: 'graph_state', title: 'Graph + narrative state', status: (graph.nodes || []).length >= 20 && ((state.characters || []).length + (state.threads || []).length) >= 10 ? 'green' : (graph.nodes || []).length || (state.threads || []).length ? 'yellow' : 'red', metric: `${graph.nodes?.length || 0} graph nodes / ${state.threads?.length || 0} state threads`, action: 'rebuild graph/state' },
    { id: 'canon_queue', title: 'Canon Review Queue', status: (queue.stats?.total || 0) <= 10 ? 'green' : (queue.stats?.by_kind?.draft_guard || queue.stats?.by_kind?.workflow) ? 'yellow' : 'yellow', metric: `${queue.stats?.total || 0} pending / ${queue.stats?.by_kind?.draft_guard || 0} guard / ${queue.stats?.by_kind?.workflow || 0} workflow`, action: 'accept/reject canon changes' },
    { id: 'draft_guard', title: 'Draft Guard gates', status: draftInput.length && draftOutputs.length && !draftBlocked.length ? 'green' : draftInput.length || draftOutputs.length ? 'yellow' : 'red', metric: `${draftInput.length} input / ${draftOutputs.length} output / ${draftBlocked.length} blocked`, action: 'run guarded workflow' },
    { id: 'workflow', title: 'Agent workflow', status: !(workflowStore.workflows || []).length ? 'red' : !workflowRuns.length ? 'yellow' : latestRun?.status === 'blocked' ? 'yellow' : 'green', metric: `${workflowStore.workflows?.length || 0} workflows / ${workflowRuns.length} runs / ${latestRun?.status || 'none'}`, action: latestRun?.status === 'blocked' ? 'review latest blocked run' : 'run workflow' },
    { id: 'safety', title: 'Safety & copyright', status: (latestSafety?.summary?.high || 0) === 0 ? 'green' : 'red', metric: `${latestSafety?.summary?.high || 0} high / ${latestSafety?.summary?.medium || 0} medium`, action: 'run safety check' },
    { id: 'benchmark', title: 'Readiness + maturity', status: statusToneForScore(lastBench?.maturity_score ?? lastBench?.score ?? 0), metric: lastBench ? `readiness ${lastBench.readiness_score ?? lastBench.score} / maturity ${lastBench.maturity_score ?? lastBench.score}` : 'not run', action: 'run benchmark' }
  ]
  const counts = modules.reduce((acc, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc }, { green: 0, yellow: 0, red: 0 })
  const health_score = Number((modules.reduce((sum, row) => sum + (row.status === 'green' ? 1 : row.status === 'yellow' ? 0.55 : 0), 0) / modules.length).toFixed(3))
  const blockers = modules.filter(row => row.status === 'red')
  const warnings = modules.filter(row => row.status === 'yellow')
  const next_action = blockers[0] || warnings[0] || null
  return {
    ok: true,
    project: enrichWriterProject(project),
    health_score,
    status: blockers.length ? 'red' : warnings.length ? 'yellow' : 'green',
    counts,
    modules,
    blockers,
    warnings,
    next_action,
    benchmark: lastBench,
    guide: guide || null,
    queue: queue.stats,
    workflow_issue,
    updated_at: new Date().toISOString()
  }
}
const readWriterProjectCommandCenter = ref => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  return buildWriterOsCommandCenter(project)
}

const runWriterProjectCommandCenterAction = async (project, input = {}) => {
  ensureWriterProjectMetadata(project)
  const before = buildWriterOsCommandCenter(project)
  const nodeAction = String(input.nodeAction || input.node_action || '').toLowerCase()
  if (nodeAction) {
    const issue = before.workflow_issue || workflowBlockedDiagnostic(project)
    if (!issue) throw new Error('No blocked workflow run found.')
    const nodeId = String(input.nodeId || input.node_id || issue.blocked_nodes?.[0]?.node_id || issue.paused_at_node_id || '')
    if (!nodeId) throw new Error('No blocked workflow node found.')
    let actionResult = null
    if (nodeAction === 'retry' || nodeAction === 'rerun') actionResult = await runWorkflowForProject(project, issue.workflow_id, { projectRef: project.id, input: input.text || input.humanInput || '', ragContext: true, draftGuard: true, draftGuardOutputs: true, draftGuardOutputWriteback: true, vectorProvider: input.provider || input.vectorProvider || 'local' }, nodeId)
    else actionResult = updateWorkflowRunNodeAction(project, input.runId || input.run_id || issue.run_id, nodeId, nodeAction, input.note || input.text || 'Command Center action')
    const after = buildWriterOsCommandCenter(project)
    appendWriterProjectVersion(project, 'command-center-workflow-action', `Command Center workflow ${nodeAction} on ${nodeId}`, { run_id: issue.run_id, workflow_id: issue.workflow_id, node_id: nodeId })
    return { ok: true, project: enrichWriterProject(project), action: nodeAction, node_id: nodeId, result: actionResult, before, after, updated_at: new Date().toISOString() }
  }
  const requested = String(input.module || input.module_id || input.target || input.id || '').trim()
  const target = requested ? (before.modules || []).find(row => row.id === requested) : before.next_action
  if (!target) return { ok: true, project: enrichWriterProject(project), message: 'No command-center repair needed.', before, after: before, results: [] }
  const steps = commandCenterModuleRepairPlan(target.id)
  if (!steps.length) throw new Error(`No command-center repair plan for module: ${target.id}`)
  const results = []
  for (const step of steps) {
    try {
      const stepInput = { ...input, provider: input.provider || 'local', vectorProvider: input.vectorProvider || input.provider || 'local' }
      if (step === 'canon_review') stepInput.all = input.all !== false
      if (step === 'closed_loop') { stepInput.draftGuard = true; stepInput.draftGuardOutputs = true; stepInput.draftGuardOutputWriteback = true }
      results.push({ step, ok: true, ...(await runWriterProjectGuideAction(project, step, stepInput)) })
    } catch (err) {
      results.push({ step, ok: false, error: err instanceof Error ? err.message : String(err) })
    }
  }
  const after = buildWriterOsCommandCenter(project)
  appendWriterProjectVersion(project, 'command-center-repair', `Command Center repaired ${target.id} with ${results.filter(row => row.ok).length}/${results.length} actions`, { module: target.id, steps: results.map(row => ({ step: row.step, ok: row.ok, error: row.error || '' })), before: before.status, after: after.status })
  return { ok: results.every(row => row.ok), project: enrichWriterProject(project), module: target, results, before, after, updated_at: new Date().toISOString() }
}
const handleWriterProjectCommandCenter = async (ref, body = {}) => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const action = String(body.action || 'read').toLowerCase()
  if (action === 'repair-next' || action === 'next' || action === 'repair' || action === 'run-module') return await runWriterProjectCommandCenterAction(project, body)
  return buildWriterOsCommandCenter(project)
}


const auditItem = (id, title, ok, evidence = [], gaps = []) => ({ id, title, ok: Boolean(ok), status: ok ? 'done' : 'gap', evidence: evidence.filter(Boolean), gaps: gaps.filter(Boolean) })
const writerOsAcceptanceAudit = project => {
  ensureWriterProjectMetadata(project)
  const schema = inspectWriterOsProjectSchema(project, { repair: false })
  const docs = readWriterProjectDocumentEngine(project.id)
  const story = readWriterProjectStoryBible(project.id).story_bible || {}
  const wiki = readLivingWikiStore(project)
  const graph = readKnowledgeGraphStore(project)
  const state = readNarrativeStateStore(project)
  const rag = readWriterProjectRagIndexStore(project)
  const vectors = readWriterProjectVectorStore(project)
  const vectorHealth = vectorHealthFor(rag, vectors)
  const contexts = readWriterProjectRetrievalContextStore(project)
  const workflows = readWorkflows(project)
  const runs = readWorkflowRuns(project).runs || []
  const caps = readCapabilityPackStore(project)
  const soulRuns = runs.filter(row => (row.soul_method_packs || []).length > 0)
  const safety = readWriterProjectSafetyStore(project)
  const bench = (readWriterProjectBenchmarkStore(project).runs || [])[0] || null
  const command = buildWriterOsCommandCenter(project)
  const dataModel = readJsonFile(writerProjectDataModelPath(project), { entities: [], stores: [] })
  const artifacts = readProjectArtifactStore(project)
  const critics = readCriticCouncilStore(project)
  const memory = readCreativeMemoryStore(project)
  const queue = livingWikiReviewQueue(project).stats || { total: 0 }
  const guardedRuns = runs.filter(row => row.draft_guard || (row.draft_guard_outputs || []).length)
  const writebackRuns = runs.filter(row => row.writeback && !(row.writeback.errors || []).length)
  const items = [
    auditItem('prd', 'Product PRD / Writer OS project shell', schema.ready, [`${schema.missing_files.length} missing required files`, `project=${project.title}`], schema.ready ? [] : schema.missing_files.slice(0, 8)),
    auditItem('system_architecture', 'System architecture / module boundaries', schema.ready && command.modules?.length >= 8, [`${command.modules?.length || 0} command-center modules`, `status=${command.status}`], command.modules?.length ? [] : ['Command Center modules missing']),
    auditItem('tech_spec', 'Technical implementation / local adapter APIs', true, ['electron/karna-adapter.cjs exposes Writer OS project APIs', 'local JSON stores + workflow adapter available']),
    auditItem('database_design', 'Database design / project JSON stores', (dataModel.entities || []).length > 0 && (dataModel.stores || []).length > 0, [`${dataModel.entities?.length || 0} entities`, `${dataModel.stores?.length || 0} stores`], ['Run Data Model inspector if empty']),
    auditItem('knowledge_graph_schema', 'Knowledge Graph Schema', (graph.nodes || []).length > 0 && (graph.edges || []).length > 0, [`${graph.nodes?.length || 0} nodes`, `${graph.edges?.length || 0} edges`], ['Build knowledge graph']),
    auditItem('narrative_state_engine', 'Narrative State Engine', ((state.characters || []).length + (state.threads || []).length) > 0, [`${state.characters?.length || 0} characters`, `${state.threads?.length || 0} threads`], ['Build narrative state']),
    auditItem('living_wiki_writeback', 'Living Wiki writeback mechanism', (wiki.pages || []).length > 0 || (wiki.pending_updates || []).length > 0 || writebackRuns.length > 0, [`${wiki.pages?.length || 0} pages`, `${wiki.pending_updates?.length || 0} pending`, `${writebackRuns.length} writeback runs`], ['Run Writer Loop or generate wiki candidates']),
    auditItem('agent_workflow', 'Agent Workflow design', (workflows.workflows || []).length > 0 && runs.length > 0, [`${workflows.workflows?.length || 0} workflows`, `${runs.length} runs`, `latest=${runs.at(-1)?.status || 'none'}`], ['Create and run workflow']),
    auditItem('skill_capability_pack', 'Skill / Capability Pack design', (caps.packs || []).length > 0, [`${caps.packs?.length || 0} packs`, `${(caps.packs || []).filter(p => p.source === 'soul_workshop').length} soul packs`], ['Sync capability packs']),
    auditItem('rag_pipeline', 'RAG Pipeline', (rag.chunks || []).length > 0 && vectorHealth.ready && (readWriterProjectVectorDatabase(project).vectors || 0) > 0 && (contexts.contexts || []).length > 0, [`${rag.chunks?.length || 0} chunks`, `${vectors.vectors?.length || 0} vectors`, `vector_db=${readWriterProjectVectorDatabase(project).vectors || 0}`, `coverage=${vectorHealth.coverage}`, `${contexts.contexts?.length || 0} contexts`], ['Build RAG, vector database, and context pack']),
    auditItem('soul_workshop', 'Soul Workshop safe method bridge', soulRuns.length > 0 || (caps.packs || []).some(p => p.source === 'soul_workshop'), [`${(caps.packs || []).filter(p => p.source === 'soul_workshop').length} soul packs`, `${soulRuns.length} soul workflow runs`], ['Create/distill Soul profile and run workflow with selected Soul Method Pack']),
    auditItem('safety_copyright', 'Safety & Copyright', (safety.reports || []).length > 0 && ((safety.reports || [])[0]?.summary?.high || 0) === 0, [`${safety.reports?.length || 0} reports`, `${(safety.reports || [])[0]?.summary?.high || 0} high risks`], ['Run safety check and resolve high risks']),
    auditItem('ui_interaction', 'UI prototype and interaction flow', true, ['Project picker Command Center', 'Knowledge/World/Agents/Quality panels', 'Writer Loop button']),
    auditItem('development_milestones', 'Development milestones / roadmap', readWriterProjectMilestonesStore(project).milestones.length > 0, [`${readWriterProjectMilestonesStore(project).milestones.length} milestones`], ['Generate milestones']),
    auditItem('testing_benchmark', 'Testing & Benchmark plan', bench && bench.readiness_score >= 1 && bench.maturity_score >= 0.85, [`readiness=${bench?.readiness_score ?? bench?.score ?? 0}`, `maturity=${bench?.maturity_score ?? bench?.score ?? 0}`, `${bench?.passed || 0}/${bench?.total || 0} checks`], ['Run Benchmark and maturity actions']),
    auditItem('writer_loop_e2e', 'One-click Writer Loop E2E', writebackRuns.length > 0 && guardedRuns.length > 0 && (contexts.contexts || []).length > 0, [`${writebackRuns.length} writeback runs`, `${guardedRuns.length} guarded runs`, `${queue.total || 0} canon review pending`], ['Run Writer Loop'])
  ]
  const passed = items.filter(row => row.ok).length
  const total = items.length
  const score = Number((passed / total).toFixed(3))
  const report = { id: `audit_${Date.now()}`, project_id: project.id, at: new Date().toISOString(), score, passed, total, status: score >= 0.95 ? 'release_candidate' : score >= 0.8 ? 'productizing' : 'incomplete', items, command_center: { status: command.status, health_score: command.health_score, counts: command.counts }, benchmark: bench ? { id: bench.id, readiness_score: bench.readiness_score, maturity_score: bench.maturity_score, score: bench.score } : null, artifacts: { total: artifacts.artifacts?.length || 0 }, critics: { reports: critics.reports?.length || 0 }, memory: { memories: memory.memories?.length || 0 } }
  const md = [
    `# Writer OS Acceptance Audit`, '',
    `Project: ${project.title}`, `Audit: ${report.id}`, `Generated: ${report.at}`, '',
    `Score: ${passed}/${total} (${score})`, `Status: ${report.status}`, `Command Center: ${command.status} / ${command.health_score}`, '',
    `## Whitepaper Module Coverage`, '',
    ...items.flatMap(item => [`### ${item.ok ? 'OK' : 'GAP'} - ${item.title}`, '', `- id: ${item.id}`, `- evidence: ${item.evidence.join('; ') || '-'}`, item.gaps.length ? `- gaps: ${item.gaps.join('; ')}` : '- gaps: none', ''])
  ].join('\n')
  const mdRel = path.join('benchmarks', 'writer_os_acceptance_audit.md')
  const jsonRel = path.join('benchmarks', 'writer_os_acceptance_audit.json')
  fs.writeFileSync(path.join(project.folder, mdRel), md, 'utf8')
  writeJsonFile(path.join(project.folder, jsonRel), report)
  appendWriterProjectVersion(project, 'acceptance-audit', `Writer OS acceptance audit ${passed}/${total}`, { score, status: report.status, md: mdRel, json: jsonRel })
  return { ok: true, project: enrichWriterProject(project), audit: report, report, markdown_rel: mdRel, json_rel: jsonRel, updated_at: report.at }
}


  return {
    workflowBlockedDiagnostic,
    buildWriterCommandCenter: buildWriterOsCommandCenter,
    buildWriterOsCommandCenter,
    readWriterProjectCommandCenter,
    runWriterProjectCommandCenterAction,
    handleWriterProjectCommandCenter,
    auditItem,
    writerOsAcceptanceAudit
  }
}

module.exports = { createWriterCommandCenterService }
