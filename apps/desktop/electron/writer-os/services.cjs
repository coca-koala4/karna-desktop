/* eslint-disable no-unused-vars, no-empty, no-control-regex, no-useless-escape, no-undef */
'use strict'

const { createWriterSafetyCouncilService } = require('./safety-council.cjs')
const { createWriterNarrativeService } = require('./narrative-utils.cjs')
const { createWriterMemoryArtifactsService } = require('./memory-artifacts.cjs')
const { createWriterDataModelService } = require('./data-model-utils.cjs')
const { createWriterDocumentSearchService } = require('./document-search.cjs')
const { createWriterBenchmarkService } = require('./benchmark-suite.cjs')
const benchmarkUtils = require('./benchmark-utils.cjs')
const { createWriterCommandCenterService } = require('./command-center.cjs')
const { createWriterDeliveryService } = require('./delivery.cjs')
const { createWriterGuideService } = require('./guide-utils.cjs')
const { createWriterRagService } = require('./rag.cjs')
const { createWriterVectorUtils } = require('./vector-utils.cjs')
const writerSafetyUtils = require('./safety-utils.cjs')
const moduleStatus = require('./module-status.cjs')
const fileWatcher = require('./file-watcher.cjs')
const writerEvents = require('./writer-events.cjs')

function createWriterOsServices(deps) {
  const {
    fs, path, crypto,
    ensureWriterProjectMetadata, findWriterProject, enrichWriterProject,
    readJsonFile, writeJsonFile, textHash, slugify, uniqueBy,
    readWriterProjectBible, analyzeWriterProject, readProjectDocuments,
    readSoulStore, enrichSoulAuthor, recordArtifact,
    appendWriterProjectVersion, logWriterProjectCall,
    writerProjectManifestPath,
    workflowsDir,
    vectorDbService,
    trackAnalytics = () => {},
    flushAnalytics = () => {}
  } = deps

  const writerProjectStoryBiblePath = project => path.join(project.folder, 'bible', 'story_bible.json')
  const writerProjectLivingWikiPath = project => path.join(project.folder, 'wiki', 'living_wiki.json')
  const writerProjectKnowledgeGraphPath = project => path.join(project.folder, 'graph', 'knowledge_graph.json')
  const writerProjectNarrativeStatePath = project => path.join(project.folder, 'narrative-state', 'narrative_state.json')
  const writerProjectCriticCouncilPath = project => path.join(project.folder, 'critics', 'critic_council.json')
  const writerProjectSafetyReportsPath = project => path.join(project.folder, 'safety', 'safety_reports.json')
  const writerProjectCreativeMemoryPath = project => path.join(project.folder, 'memory', 'creative_memory.json')
  const writerProjectArtifactsPath = project => path.join(project.folder, 'artifacts', 'artifacts.json')
  const writerProjectDataModelPath = project => path.join(project.folder, 'project_data_model.json')
  const writerProjectRagIndexPath = project => path.join(project.folder, 'rag', 'rag_index.json')
  const writerProjectVectorStorePath = project => path.join(project.folder, 'rag', 'vector_store.json')
  const writerProjectDocumentsPath = project => path.join(project.folder, 'documents', 'documents.json')
  const writerProjectCapabilityPacksPath = project => path.join(project.folder, 'capabilities', 'capability_packs.json')
  const writerProjectBenchmarksPath = project => path.join(project.folder, 'benchmarks', 'benchmark_runs.json')
  const writerProjectMilestonesPath = project => path.join(project.folder, 'roadmap', 'writer_os_milestones.json')
  const writerProjectCreativeSearchPath = project => path.join(project.folder, 'documents', 'creative_search.json')
  const writerProjectGuidePath = project => path.join(project.folder, 'guide', 'writer_guide.json')
  const writerProjectDeliveryPackagePath = project => path.join(project.folder, 'delivery', 'delivery_package.json')
  const writerProjectDocumentNodesPath = project => path.join(project.folder, 'documents', 'document_nodes.json')
  const writerProjectWorkflowRunsPath = project => path.join(project.folder, 'workflow_runs.json')

  const writerOsRequiredFiles = project => [
    { rel: 'bible/story_bible.json', label: 'Story Bible' },
    { rel: 'wiki/living_wiki.json', label: 'Living Wiki' },
    { rel: 'graph/knowledge_graph.json', label: 'Knowledge Graph' },
    { rel: 'narrative-state/narrative_state.json', label: 'Narrative State' },
    { rel: 'critics/critic_council.json', label: 'Critic Council' },
    { rel: 'safety/safety_reports.json', label: 'Safety Reports' },
    { rel: 'memory/creative_memory.json', label: 'Creative Memory' },
    { rel: 'artifacts/artifacts.json', label: 'Artifacts' },
    { rel: 'project_data_model.json', label: 'Data Model' },
    { rel: 'rag/rag_index.json', label: 'RAG Index' }
  ]

  const inspectWriterOsProjectSchema = (project, opts = {}) => {
    ensureWriterProjectMetadata(project)
    const missing = writerOsRequiredFiles(project).filter(item => !fs.existsSync(path.join(project.folder, item.rel))).map(item => item.rel)
    const ready = missing.length <= 2
    if (opts.repair && missing.length) {
      for (const rel of missing) {
        const dir = path.dirname(path.join(project.folder, rel))
        fs.mkdirSync(dir, { recursive: true })
        if (rel.endsWith('story_bible.json')) writeJsonFile(path.join(project.folder, rel), { version: 1, project_id: project.id, characters: [], locations: [], world_rules: [], foreshadows: [], timeline: [], chapters: [], updated_at: null })
        else if (rel.endsWith('living_wiki.json')) writeJsonFile(path.join(project.folder, rel), { version: 1, project_id: project.id, pages: [], pending_updates: [], updated_at: null })
        else if (rel.endsWith('knowledge_graph.json')) writeJsonFile(path.join(project.folder, rel), { version: 1, project_id: project.id, nodes: [], edges: [], stats: { nodes: 0, edges: 0 }, updated_at: null })
        else if (rel.endsWith('narrative_state.json')) writeJsonFile(path.join(project.folder, rel), { version: 1, project_id: project.id, characters: [], threads: [], timeline: [], continuity_checks: [], updated_at: null })
        else if (rel.endsWith('critic_council.json')) writeJsonFile(path.join(project.folder, rel), { version: 1, project_id: project.id, reports: [], updated_at: null })
        else if (rel.endsWith('safety_reports.json')) writeJsonFile(path.join(project.folder, rel), { version: 1, project_id: project.id, reports: [], checks: [], updated_at: null })
        else if (rel.endsWith('creative_memory.json')) writeJsonFile(path.join(project.folder, rel), { version: 1, project_id: project.id, memories: [], decisions: [], preferences: [], updated_at: null })
        else if (rel.endsWith('artifacts.json')) writeJsonFile(path.join(project.folder, rel), { version: 1, project_id: project.id, artifacts: [], updated_at: null })
        else writeJsonFile(path.join(project.folder, rel), { version: 1, project_id: project.id, updated_at: null })
      }
    }
    return { ok: true, ready, missing_files: missing, repaired: opts.repair ? missing.length : 0 }
  }

  const readWriterProjectStoryBible = ref => {
    const project = findWriterProject(ref)
    if (!project) throw new Error(`Project not found: ${ref}`)
    const story_bible = readJsonFile(writerProjectStoryBiblePath(project), { version: 1, project_id: project.id, characters: [], locations: [], world_rules: [], foreshadows: [], timeline: [], chapters: [], updated_at: null })
    return { ok: true, project: enrichWriterProject(project), story_bible }
  }

  const buildStoryBible = (project, analyzedBible) => {
    inspectWriterOsProjectSchema(project, { repair: true })
    const existing = readJsonFile(writerProjectStoryBiblePath(project), { version: 1, project_id: project.id, characters: [], locations: [], world_rules: [], foreshadows: [], timeline: [], chapters: [], updated_at: null })
    const chapters = analyzedBible?.chapters || existing.chapters || []
    const characters = analyzedBible?.characters || existing.characters || []
    const locations = analyzedBible?.locations || existing.locations || []
    const world_rules = analyzedBible?.world_rules || analyzedBible?.world || existing.world_rules || []
    const foreshadows = analyzedBible?.foreshadows || existing.foreshadows || []
    const timeline = analyzedBible?.timeline || existing.timeline || []
    const bible = { version: 1, project_id: project.id, title: project.title, chapters, characters, locations, world_rules, foreshadows, timeline, updated_at: new Date().toISOString() }
    writeJsonFile(writerProjectStoryBiblePath(project), bible)
    return bible
  }

  const syncWriterProjectDocuments = project => {
    inspectWriterOsProjectSchema(project, { repair: true })
    const docs = readProjectDocuments(project)
    const documents = docs.map(doc => ({ id: `doc_${textHash(doc.rel).slice(0, 10)}`, title: doc.title, rel: doc.rel, file: doc.file, chars: doc.chars, lines: doc.lines, preview: doc.text ? String(doc.text).slice(0, 500) : '' }))
    const nodes = []
    for (const doc of docs) {
      const text = String(doc.text || '')
      const chunks = text.split(/\n#{1,4}\s+/)
      for (let i = 0; i < chunks.length; i += 1) {
        const chunk = chunks[i].trim()
        if (chunk.length < 40) continue
        nodes.push({ id: `node_${textHash(`${doc.rel}:${i}`).slice(0, 10)}`, document_id: `doc_${textHash(doc.rel).slice(0, 10)}`, project_rel: doc.rel, start_line: 1, end_line: chunk.split(/\r?\n/).length, summary: chunk.slice(0, 200), chars: chunk.length })
      }
    }
    const data = { version: 1, project_id: project.id, documents, nodes, updated_at: new Date().toISOString(), stats: { documents: documents.length, nodes: nodes.length } }
    writeJsonFile(writerProjectDocumentsPath(project), data)
    writeJsonFile(writerProjectDocumentNodesPath(project), { version: 1, project_id: project.id, nodes, updated_at: new Date().toISOString() })
    return { ok: true, project: enrichWriterProject(project), documents, nodes, stats: data.stats }
  }

  const readWriterProjectDocumentEngine = ref => {
    const project = findWriterProject(ref)
    if (!project) throw new Error(`Project not found: ${ref}`)
    const data = readJsonFile(writerProjectDocumentsPath(project), { version: 1, project_id: project.id, documents: [], nodes: [], stats: { documents: 0, nodes: 0 } })
    return { ok: true, project: enrichWriterProject(project), ...data }
  }

  const fileHash = file => crypto.createHash('sha1').update(fs.readFileSync(file)).digest('hex')
  const summarizeText = (text, max = 220) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, max)
  const cosineSimilarity = (a = [], b = []) => {
    let dot = 0
    let aa = 0
    let bb = 0
    const n = Math.min(a.length, b.length)
    for (let i = 0; i < n; i += 1) {
      const av = Number(a[i] || 0)
      const bv = Number(b[i] || 0)
      dot += av * bv
      aa += av * av
      bb += bv * bv
    }
    return aa && bb ? dot / (Math.sqrt(aa) * Math.sqrt(bb)) : 0
  }
  const vectorUtils = createWriterVectorUtils({ textHash })
  const rag = createWriterRagService({
    fs, path, textHash, fileHash, readJsonFile, writeJsonFile,
    ensureWriterProjectMetadata, enrichWriterProject, findWriterProject,
    appendWriterProjectVersion, readWriterProjectDocumentEngine, syncWriterProjectDocuments,
    summarizeText, getEmbeddingModelRow: () => null, embedTexts: async () => ({ vectors: [] }),
    cosineSimilarity, ...vectorUtils
  })
  const {
    buildWriterProjectRagIndex,
    readWriterProjectRagIndexStore,
    buildWriterProjectVectorStore,
    readWriterProjectVectorStore,
    readWriterProjectVectorDatabase,
    readWriterProjectRetrievalContextStore,
    handleWriterProjectRag
  } = rag

  const readWorkflows = project => {
    try {
      const wfPath = path.join(project.folder, 'workflows.json')
      return readJsonFile(wfPath, { version: 1, workflows: [] })
    } catch { return { version: 1, workflows: [] } }
  }
  const writeWorkflows = (project, data) => {
    try {
      const wfPath = path.join(project.folder, 'workflows.json')
      fs.mkdirSync(path.dirname(wfPath), { recursive: true })
      writeJsonFile(wfPath, data)
      return data
    } catch { return data }
  }
  const normalizeWorkflow = (project, input) => ({ ...input, id: input.id || `wf_${textHash(input.name || 'workflow').slice(0, 10)}` })
  const readWorkflowRuns = project => readJsonFile(writerProjectWorkflowRunsPath(project), { version: 1, runs: [] })
  const readCapabilityPackStore = project => readJsonFile(writerProjectCapabilityPacksPath(project), { version: 1, packs: [] })
  const syncWriterCapabilityPacks = project => readCapabilityPackStore(project)
  const readProjectArtifactStore = project => readJsonFile(writerProjectArtifactsPath(project), { version: 1, artifacts: [] })
  const syncWriterProjectArtifacts = project => readProjectArtifactStore(project)

  const narrative = createWriterNarrativeService({
    fs, path, slugify, textHash, uniqueBy,
    ensureWriterProjectMetadata, readJsonFile, writeJsonFile,
    writerProjectLivingWikiPath, writerProjectKnowledgeGraphPath, writerProjectNarrativeStatePath,
    readWriterProjectStoryBible: ref => readWriterProjectStoryBible(ref).story_bible,
    findWriterProject, enrichWriterProject, appendWriterProjectVersion,
    rebuildCreativeMemory: () => ({ ok: true, memory: { memories: [] } })
  })

  const dataModel = createWriterDataModelService({
    fs, path, ensureWriterProjectMetadata, inspectWriterOsProjectSchema,
    writerOsRequiredFiles, writerProjectDataModelPath, readJsonFile, writeJsonFile,
    findWriterProject, enrichWriterProject, appendWriterProjectVersion,
    readLivingWikiStore: narrative.readLivingWikiStore,
    readKnowledgeGraphStore: narrative.readKnowledgeGraphStore,
    readNarrativeStateStore: narrative.readNarrativeStateStore,
    ragTermFreq: vectorUtils.ragTermFreq
  })

  const safetyCouncil = createWriterSafetyCouncilService({
    path, ensureWriterProjectMetadata, readJsonFile, writeJsonFile,
    writerProjectSafetyReportsPath, writerProjectCriticCouncilPath,
    readProjectDocuments, readSoulStore, enrichSoulAuthor, writerSafetyUtils,
    appendWriterProjectVersion, logWriterProjectCall, enrichWriterProject, findWriterProject,
    readWriterProjectStoryBible: ref => readWriterProjectStoryBible(ref).story_bible,
    readNarrativeStateStore: narrative.readNarrativeStateStore,
    readKnowledgeGraphStore: narrative.readKnowledgeGraphStore,
    textHash, evidenceForPatterns: (docs, patterns, limit) => {
      const hits = []
      for (const doc of docs) for (const re of patterns) {
        const regex = re instanceof RegExp ? new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`) : re
        let m
        const text = String(doc.text || '')
        while ((m = regex.exec(text))) {
          const line = String(text).slice(0, Math.max(0, m.index)).split(/\r?\n/).length
          hits.push(`${doc.rel}:${line}`)
          if (hits.length >= limit) return hits
        }
      }
      return hits
    }
  })

  const memory = createWriterMemoryArtifactsService({
    fs, path, crypto, ensureWriterProjectMetadata, readJsonFile, writeJsonFile,
    writerProjectCreativeMemoryPath, writerProjectManifestPath: writerProjectManifestPath, writerProjectArtifactsPath,
    readWriterProjectStoryBible: ref => readWriterProjectStoryBible(ref).story_bible,
    readLivingWikiStore: narrative.readLivingWikiStore,
    readNarrativeStateStore: narrative.readNarrativeStateStore,
    readCriticCouncilStore: safetyCouncil.readCriticCouncilStore,
    uniqueBy, textHash, enrichWriterProject, findWriterProject, appendWriterProjectVersion,
    writeLivingWikiStore: narrative.writeLivingWikiStore, writeNarrativeStateStore: narrative.writeNarrativeStateStore,
    workflowRunSummaryText: () => ''
  })

  const docSearch = createWriterDocumentSearchService({
    fs, path, textHash, summarizeText, ensureWriterProjectMetadata, readProjectDocuments, readJsonFile, writeJsonFile,
    writerProjectCreativeSearchPath, writerProjectDocumentsPath, writerProjectDocumentNodesPath,
    readWriterProjectStoryBible: ref => readWriterProjectStoryBible(ref).story_bible,
    findWriterProject, enrichWriterProject, appendWriterProjectVersion,
    readLivingWikiStore: narrative.readLivingWikiStore,
    readKnowledgeGraphStore: narrative.readKnowledgeGraphStore,
    readNarrativeStateStore: narrative.readNarrativeStateStore,
    ragTermFreq: vectorUtils.ragTermFreq
  })

  const workflowRunSummaryText = () => ''
  const benchmark = createWriterBenchmarkService({
    fs, path,
    ensureWriterProjectMetadata,
    writerProjectMilestonesPath,
    writerProjectBenchmarkRunsPath: writerProjectBenchmarksPath,
    writerProjectDataModelPath,
    writerProjectGuidePath,
    readJsonFile,
    writeJsonFile,
    inspectWriterOsProjectSchema,
    readWriterProjectDocumentEngine,
    readWriterProjectStoryBible: ref => readWriterProjectStoryBible(ref),
    readLivingWikiStore: narrative.readLivingWikiStore,
    readKnowledgeGraphStore: narrative.readKnowledgeGraphStore,
    readNarrativeStateStore: narrative.readNarrativeStateStore,
    readWriterProjectRagIndexStore,
    readCreativeSearchStore: docSearch.readCreativeSearchStore,
    creativeSearchRows: docSearch.creativeSearchRows,
    readCriticCouncilStore: safetyCouncil.readCriticCouncilStore,
    readCreativeMemoryStore: memory.readCreativeMemoryStore,
    readProjectArtifactStore,
    readWriterProjectSafetyStore: safetyCouncil.readWriterProjectSafetyStore,
    readWorkflows,
    readCapabilityPackStore,
    readWriterProjectVectorStore,
    readWriterProjectVectorDatabase,
    readWriterProjectRetrievalContextStore,
    readWorkflowRuns,
    livingWikiReviewQueue: narrative.livingWikiReviewQueue,
    benchmarkCheck: benchmarkUtils.benchmarkCheck,
    maturityGapsForChecks: benchmarkUtils.maturityGapsForChecks,
    findWriterProject,
    enrichWriterProject,
    appendWriterProjectVersion
  })
  const runWriterProjectBenchmark = project => benchmark.runWriterProjectBenchmark(project)

  let guide
  const commandCenter = createWriterCommandCenterService({
    fs, path, readJsonFile, writeJsonFile,
    ensureWriterProjectMetadata,
    inspectWriterOsProjectSchema,
    readWriterProjectDocumentEngine,
    readWriterProjectRagIndexStore,
    readWriterProjectVectorStore,
    vectorHealthFor: vectorUtils.vectorHealthFor,
    readKnowledgeGraphStore: narrative.readKnowledgeGraphStore,
    readNarrativeStateStore: narrative.readNarrativeStateStore,
    readLivingWikiStore: narrative.readLivingWikiStore,
    livingWikiReviewQueue: narrative.livingWikiReviewQueue,
    readWorkflows,
    readWorkflowRuns,
    readWriterProjectSafetyStore: safetyCouncil.readWriterProjectSafetyStore,
    readWriterProjectBenchmarkStore: benchmark.readWriterProjectBenchmarkStore,
    writerProjectGuidePath,
    readWriterProjectVectorDatabase,
    statusToneForScore: benchmarkUtils.statusToneForScore,
    enrichWriterProject,
    findWriterProject,
    runWorkflowForProject: async () => ({ ok: false, error: 'workflow runner is not configured in writer-os services' }),
    updateWorkflowRunNodeAction: () => ({ ok: false }),
    commandCenterModuleRepairPlan: benchmarkUtils.commandCenterModuleRepairPlan,
    runWriterProjectGuideAction: async (project, step, input) => guide.runWriterProjectGuideAction(project, step, input),
    appendWriterProjectVersion,
    readWriterProjectStoryBible: ref => readWriterProjectStoryBible(ref).story_bible,
    readWriterProjectRetrievalContextStore,
    readCapabilityPackStore,
    writerProjectDataModelPath,
    readProjectArtifactStore,
    readCriticCouncilStore: safetyCouncil.readCriticCouncilStore,
    readCreativeMemoryStore: memory.readCreativeMemoryStore,
    readWriterProjectMilestonesStore: benchmark.readWriterProjectMilestonesStore
  })


  const delivery = createWriterDeliveryService({
    fs, path, execFileSync: require('child_process').execFileSync,
    textHash, fileHash, readJsonFile, writeJsonFile,
    ensureWriterProjectMetadata, enrichWriterProject,
    exportWriterProject: projectRef => {
      const project = typeof projectRef === 'object' ? projectRef : findWriterProject(projectRef)
      const docs = readProjectDocuments(project)
      const exportDir = path.join(project.folder, 'exports')
      fs.mkdirSync(exportDir, { recursive: true })
      const stem = project.slug || project.id
      const file = path.join(exportDir, `${stem}-manuscript.md`)
      const json = path.join(exportDir, `${stem}-project-data.json`)
      fs.writeFileSync(file, docs.map(doc => doc.text || '').join('\n\n---\n\n'), 'utf8')
      writeJsonFile(json, { project, exported_at: new Date().toISOString(), source_files: docs.map(doc => doc.rel) })
      return { file, json }
    },
    acceptanceAudit: project => commandCenter.writerOsAcceptanceAudit(project),
    syncWriterProjectArtifacts,
    readBenchmarkStore: benchmark.readWriterProjectBenchmarkStore,
    recordProjectArtifact: (project, artifact) => memory.recordProjectArtifact(project, artifact),
    readProjectArtifactStore,
    appendWriterProjectVersion,
    trackAnalytics,
    flushAnalytics
  })

  const runWriterOsLoopVerification = async (project, input = {}) => {
    const schema = inspectWriterOsProjectSchema(project, { repair: true })
    const story = readWriterProjectStoryBible(project.id).story_bible
    const wiki = narrative.readLivingWikiStore(project)
    const graph = narrative.readKnowledgeGraphStore(project)
    const state = narrative.readNarrativeStateStore(project)
    const critics = safetyCouncil.readCriticCouncilStore(project)
    const checks = [
      { step: 'schema', ok: schema.ready, detail: `${schema.missing_files.length} missing files` },
      { step: 'story_bible', ok: (story.characters || []).length > 0 || (story.chapters || []).length > 0, detail: `${story.characters?.length || 0} chars / ${story.chapters?.length || 0} ch` },
      { step: 'living_wiki', ok: (wiki.pages || []).length > 0 || (wiki.pending_updates || []).length > 0, detail: `${wiki.pages?.length || 0} pages` },
      { step: 'knowledge_graph', ok: (graph.nodes || []).length > 0, detail: `${graph.nodes?.length || 0} nodes` },
      { step: 'narrative_state', ok: (state.characters || []).length > 0, detail: `${state.characters?.length || 0} chars` },
      { step: 'critic_council', ok: (critics.reports || []).length > 0, detail: `${critics.reports?.length || 0} reports` }
    ]
    return { ok: checks.every(c => c.ok), project: enrichWriterProject(project), checks, loop_ready: checks.every(c => c.ok) }
  }

  const runWriterOsWritingLoop = async (project, input = {}) => {
    const result = { ok: true, ran: false, steps: [], message: 'Writing loop ready - connect to agent runtime for full execution' }
    appendWriterProjectVersion(project, 'writing-loop-verify', 'Writer OS writing loop verified', { steps: 0 })
    return result
  }

  guide = createWriterGuideService({
    fs, path, ensureWriterProjectMetadata, inspectWriterOsProjectSchema,
    syncWriterProjectDocuments, readWriterProjectDocumentEngine,
    analyzeWriterProject: ref => {
      const proj = findWriterProject(ref)
      const result = analyzeWriterProject(ref, {})
      return { project: proj, bible: result.bible, files: result.sources || [] }
    },
    buildStoryBible: (project, bible) => buildStoryBible(project, bible),
    readWriterProjectStoryBible: ref => readWriterProjectStoryBible(ref),
    readLivingWikiStore: narrative.readLivingWikiStore,
    generateLivingWikiCandidates: narrative.generateLivingWikiCandidates,
    confirmLivingWikiUpdates: narrative.confirmLivingWikiUpdates,
    livingWikiReviewQueue: narrative.livingWikiReviewQueue,
    readKnowledgeGraphStore: narrative.readKnowledgeGraphStore,
    buildWriterProjectKnowledgeGraph: narrative.buildWriterProjectKnowledgeGraph,
    readNarrativeStateStore: narrative.readNarrativeStateStore,
    buildWriterProjectNarrativeState: narrative.buildWriterProjectNarrativeState,
    readCreativeSearchStore: docSearch.readCreativeSearchStore,
    runCreativeSearch: (project, input) => docSearch.runCreativeSearch(project, input),
    readCriticCouncilStore: safetyCouncil.readCriticCouncilStore,
    runCriticCouncil: safetyCouncil.runCriticCouncil,
    readCreativeMemoryStore: memory.readCreativeMemoryStore,
    rebuildCreativeMemory: memory.rebuildCreativeMemory,
    readProjectArtifactStore, syncWriterProjectArtifacts,
    writerProjectDataModelPath,
    buildWriterProjectDataModel: dataModel.buildWriterProjectDataModel,
    readWriterProjectRagIndexStore, buildWriterProjectRagIndex,
    readWriterProjectVectorStore, readWriterProjectVectorDatabase, buildWriterProjectVectorStore,
    readWorkflows, normalizeWorkflow, writeWorkflows,
    readWorkflowRuns,
    readCapabilityPackStore, syncWriterCapabilityPacks,
    readWriterProjectSafetyStore: safetyCouncil.readWriterProjectSafetyStore,
    buildWriterSafetyReport: safetyCouncil.buildWriterSafetyReport,
    runWriterProjectBenchmark, runWriterOsLoopVerification, runWriterOsWritingLoop,
    writerProjectGuidePath, readJsonFile, writeJsonFile,
    findWriterProject, enrichWriterProject, appendWriterProjectVersion
  })

  const readKnowledgeGraphStore = project => narrative.readKnowledgeGraphStore(project)
  const writeKnowledgeGraphStore = (project, graph) => narrative.writeKnowledgeGraphStore(project, graph)
  const addGraphNode = (project, node) => narrative.addGraphNode(project, node)
  const updateGraphNode = (project, nodeId, patch) => narrative.updateGraphNode(project, nodeId, patch)
  const deleteGraphNode = (project, nodeId) => narrative.deleteGraphNode(project, nodeId)
  const addGraphEdge = (project, edge) => narrative.addGraphEdge(project, edge)
  const updateGraphEdge = (project, edgeId, patch) => narrative.updateGraphEdge(project, edgeId, patch)
  const deleteGraphEdge = (project, edgeId) => narrative.deleteGraphEdge(project, edgeId)
  const updateStoryBibleField = (project, section, item) => {
    inspectWriterOsProjectSchema(project, { repair: true })
    const bible = readJsonFile(writerProjectStoryBiblePath(project), { version: 1, project_id: project.id, characters: [], locations: [], world_rules: [], foreshadows: [], timeline: [], chapters: [], updated_at: null })
    const list = bible[section] || []
    if (item.id) {
      const idx = list.findIndex(x => x.id === item.id)
      if (idx >= 0) list[idx] = { ...list[idx], ...item, updated_at: new Date().toISOString() }
      else list.push({ ...item, updated_at: new Date().toISOString() })
    } else {
      const id = `${section.slice(0, 3)}_${textHash(`${item.name || ''}${Date.now()}`).slice(0, 8)}`
      list.push({ ...item, id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    }
    bible[section] = list
    bible.updated_at = new Date().toISOString()
    writeJsonFile(writerProjectStoryBiblePath(project), bible)
    return { ok: true, story_bible: bible }
  }
  const deleteStoryBibleItem = (project, section, itemId) => {
    const bible = readJsonFile(writerProjectStoryBiblePath(project), { version: 1, project_id: project.id, characters: [], locations: [], world_rules: [], foreshadows: [], timeline: [], chapters: [], updated_at: null })
    bible[section] = (bible[section] || []).filter(x => x.id !== itemId && x.name !== itemId)
    bible.updated_at = new Date().toISOString()
    writeJsonFile(writerProjectStoryBiblePath(project), bible)
    return { ok: true, story_bible: bible }
  }
  const addTimelineEvent = (project, event) => {
    const bible = readJsonFile(writerProjectStoryBiblePath(project), { version: 1, project_id: project.id, characters: [], locations: [], world_rules: [], foreshadows: [], timeline: [], chapters: [], updated_at: null })
    const id = event.id || `tl_${textHash(`${event.event || ''}${Date.now()}`).slice(0, 8)}`
    const newEvent = { ...event, id, created_at: new Date().toISOString() }
    bible.timeline = bible.timeline || []
    bible.timeline.push(newEvent)
    bible.timeline.sort((a, b) => {
      const ta = a.order || a.time || a.chapter || ''
      const tb = b.order || b.time || b.chapter || ''
      return String(ta).localeCompare(String(tb))
    })
    bible.updated_at = new Date().toISOString()
    writeJsonFile(writerProjectStoryBiblePath(project), bible)
    return { ok: true, story_bible: bible, event: newEvent }
  }

  return {
    paths: {
      writerProjectStoryBiblePath, writerProjectLivingWikiPath, writerProjectKnowledgeGraphPath,
      writerProjectNarrativeStatePath, writerProjectCriticCouncilPath, writerProjectSafetyReportsPath,
      writerProjectCreativeMemoryPath, writerProjectArtifactsPath, writerProjectDataModelPath,
      writerProjectRagIndexPath, writerProjectVectorStorePath, writerProjectDocumentsPath,
      writerProjectCapabilityPacksPath, writerProjectBenchmarksPath, writerProjectCreativeSearchPath,
      writerProjectGuidePath, writerProjectDeliveryPackagePath
    },
    inspectWriterOsProjectSchema,
    buildStoryBible, readWriterProjectStoryBible,
    syncWriterProjectDocuments, readWriterProjectDocumentEngine,
    narrative, safetyCouncil, memory, dataModel, docSearch,
    benchmark, commandCenter, delivery, guide,
    buildWriterProjectRagIndex, buildWriterProjectVectorStore,
    readWriterProjectRagIndexStore, readWriterProjectVectorStore, readWriterProjectVectorDatabase,
    readWriterProjectRetrievalContextStore, handleWriterProjectRag,
    readCapabilityPackStore, syncWriterCapabilityPacks,
    readProjectArtifactStore, syncWriterProjectArtifacts,
    readKnowledgeGraphStore, writeKnowledgeGraphStore,
    addGraphNode, updateGraphNode, deleteGraphNode, addGraphEdge, updateGraphEdge, deleteGraphEdge,
    updateStoryBibleField, deleteStoryBibleItem, addTimelineEvent,
    runWriterProjectBenchmark, runWriterOsLoopVerification,
    moduleStatus,
    fileWatcher,
    writerEvents
  }
}

module.exports = { createWriterOsServices }
