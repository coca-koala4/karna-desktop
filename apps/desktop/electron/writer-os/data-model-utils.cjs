/* eslint-disable no-unused-vars, no-empty, no-control-regex, no-useless-escape, no-undef */
'use strict'

function createWriterDataModelService(deps = {}) {
  const required = [
    'fs', 'path', 'ensureWriterProjectMetadata', 'inspectWriterOsProjectSchema',
    'writerOsRequiredFiles', 'writerProjectDataModelPath', 'readJsonFile', 'writeJsonFile',
    'findWriterProject', 'enrichWriterProject', 'appendWriterProjectVersion'
  ]
  for (const name of required) if (!deps[name]) throw new Error(`createWriterDataModelService requires ${name}.`)

  const {
    fs,
    path,
    ensureWriterProjectMetadata,
    inspectWriterOsProjectSchema,
    writerOsRequiredFiles,
    writerProjectDataModelPath,
    readJsonFile,
    writeJsonFile,
    findWriterProject,
    enrichWriterProject,
    appendWriterProjectVersion
  } = deps

  const dataModelEntityTemplates = () => [
    { id: 'workspace', name: 'Workspace', store: 'project_schema.json', role: 'Project root, module readiness and local-first boundaries.', fields: ['project_id', 'title', 'type', 'folder', 'modules'] },
    { id: 'document', name: 'Document', store: 'documents/documents.json', role: 'Imported manuscript, notes and research file metadata.', fields: ['id', 'title', 'rel', 'kind', 'chars', 'lines'] },
    { id: 'document_node', name: 'Document Node', store: 'documents/document_nodes.json', role: 'Chunk-level evidence for RAG and creative search.', fields: ['id', 'document_id', 'project_rel', 'start_line', 'end_line', 'summary'] },
    { id: 'story_bible', name: 'Story Bible', store: 'bible/story_bible.json', role: 'Canon index for characters, locations, rules, foreshadows and timeline.', fields: ['characters', 'locations', 'world_rules', 'foreshadows', 'timeline'] },
    { id: 'wiki_page', name: 'Living Wiki Page', store: 'wiki/living_wiki.json', role: 'Human-confirmed wiki pages and pending updates.', fields: ['pages', 'pending_updates'] },
    { id: 'graph_node', name: 'Knowledge Graph Node', store: 'graph/knowledge_graph.json', role: 'Typed project graph nodes.', fields: ['id', 'type', 'title', 'summary', 'evidence'] },
    { id: 'graph_edge', name: 'Knowledge Graph Edge', store: 'graph/knowledge_graph.json', role: 'Relationships between project graph nodes.', fields: ['from', 'to', 'type', 'evidence'] },
    { id: 'narrative_state', name: 'Narrative State', store: 'narrative-state/narrative_state.json', role: 'Current characters, threads, timeline and continuity checks.', fields: ['characters', 'threads', 'timeline', 'continuity_checks'] },
    { id: 'critic_report', name: 'Critic Report', store: 'critics/critic_council.json', role: 'Multi-lens critique findings and evidence.', fields: ['reports', 'lenses', 'findings'] },
    { id: 'creative_memory', name: 'Creative Memory', store: 'memory/creative_memory.json', role: 'Pinned author decisions and durable project memories.', fields: ['memories', 'decisions', 'preferences'] },
    { id: 'artifact', name: 'Artifact', store: 'artifacts/artifacts.json', role: 'Exported files, workflow artifacts and report index.', fields: ['id', 'type', 'title', 'source', 'path', 'preview'] },
    { id: 'workflow', name: 'Agent Workflow', store: 'workflows.json', role: 'Agent workflow graph definitions.', fields: ['id', 'name', 'nodes', 'edges', 'limits'] },
    { id: 'vector_database', name: 'Vector Database', store: 'rag/vector_db/manifest.json', role: 'Durable local vector database segment manifest for RAG semantic retrieval.', fields: ['engine', 'storage', 'provider', 'dimensions', 'vectors', 'segments'] },
    { id: 'benchmark', name: 'Benchmark Run', store: 'benchmarks/benchmark_runs.json', role: 'Implementation and project-readiness checks.', fields: ['id', 'score', 'passed', 'total', 'checks'] }
  ]

  const dataModelCountForStore = (project, rel) => {
    const data = readJsonFile(path.join(project.folder, rel), null)
    if (!data || typeof data !== 'object') return { exists: false, count: 0, keys: [] }
    const keys = Object.keys(data)
    const candidates = ['documents', 'nodes', 'chunks', 'characters', 'pages', 'pending_updates', 'edges', 'threads', 'reports', 'memories', 'artifacts', 'workflows', 'runs', 'milestones', 'checks']
    let count = 0
    for (const key of candidates) if (Array.isArray(data[key])) count += data[key].length
    if (!count && Array.isArray(data.entries)) count = data.entries.length
    return { exists: true, count, keys }
  }

  const buildWriterProjectDataModel = project => {
    ensureWriterProjectMetadata(project)
    const schema = inspectWriterOsProjectSchema(project, { repair: false })
    const entities = dataModelEntityTemplates().map(entity => {
      const stat = dataModelCountForStore(project, entity.store)
      return { ...entity, exists: stat.exists, rows: stat.count, keys: stat.keys }
    })
    const stores = writerOsRequiredFiles(project).map(item => {
      const rel = item.rel
      const full = path.join(project.folder, rel)
      const stat = fs.existsSync(full) ? fs.statSync(full) : null
      const count = dataModelCountForStore(project, rel)
      return { rel, label: item.label, exists: Boolean(stat), bytes: stat?.size || 0, updated_at: stat ? stat.mtime.toISOString() : null, rows: count.count, keys: count.keys }
    })
    const snapshot = { id: `model_${Date.now()}`, at: new Date().toISOString(), ready: schema.ready, entities: entities.length, stores: stores.length, missing_files: schema.missing_files, total_rows: stores.reduce((sum, row) => sum + (row.rows || 0), 0) }
    const current = readJsonFile(writerProjectDataModelPath(project), { version: 1, project_id: project.id, snapshots: [] })
    const next = { version: 1, project_id: project.id, updated_at: snapshot.at, entities, stores, snapshots: [snapshot, ...(current.snapshots || [])].slice(0, 80), policy: { local_json_database: true, inspectable_files: true, migration_ready: true } }
    writeJsonFile(writerProjectDataModelPath(project), next)
    appendWriterProjectVersion(project, 'data-model-inspect', `Inspected ${entities.length} data entities and ${stores.length} stores`, { entities: entities.length, stores: stores.length })
    return { ok: true, project: enrichWriterProject(project), model: next, entities, stores, snapshots: next.snapshots, updated_at: next.updated_at }
  }

  const readWriterProjectDataModel = ref => {
    const project = findWriterProject(ref)
    if (!project) throw new Error(`Project not found: ${ref}`)
    const model = readJsonFile(writerProjectDataModelPath(project), { version: 1, project_id: project.id, entities: [], stores: [], snapshots: [], updated_at: null })
    return { ok: true, project: enrichWriterProject(project), model, entities: model.entities || [], stores: model.stores || [], snapshots: model.snapshots || [], updated_at: model.updated_at || null }
  }

  const handleWriterProjectDataModel = (ref, body = {}) => {
    const project = findWriterProject(ref)
    if (!project) throw new Error(`Project not found: ${ref}`)
    return buildWriterProjectDataModel(project)
  }

  return { dataModelEntityTemplates, dataModelCountForStore, buildWriterProjectDataModel, readWriterProjectDataModel, handleWriterProjectDataModel }
}

module.exports = { createWriterDataModelService }
