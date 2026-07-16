/* eslint-disable no-unused-vars, no-empty, no-control-regex, no-useless-escape, no-undef */
'use strict'

function createWriterNarrativeService(deps = {}) {
  const required = [
    'fs', 'path', 'slugify', 'textHash', 'uniqueBy',
    'ensureWriterProjectMetadata', 'readJsonFile', 'writeJsonFile',
    'writerProjectLivingWikiPath', 'writerProjectKnowledgeGraphPath', 'writerProjectNarrativeStatePath',
    'readWriterProjectStoryBible', 'findWriterProject', 'enrichWriterProject',
    'appendWriterProjectVersion', 'rebuildCreativeMemory'
  ]
  for (const name of required) {
    if (!deps[name]) throw new Error(`createWriterNarrativeService requires ${name}.`)
  }

  const {
    fs,
    path,
    slugify,
    textHash,
    uniqueBy,
    ensureWriterProjectMetadata,
    readJsonFile,
    writeJsonFile,
    writerProjectLivingWikiPath,
    writerProjectKnowledgeGraphPath,
    writerProjectNarrativeStatePath,
    readWriterProjectStoryBible,
    findWriterProject,
    enrichWriterProject,
    appendWriterProjectVersion,
    rebuildCreativeMemory
  } = deps

  const wikiSlug = text => slugify(String(text || 'page').slice(0, 80)) || `page-${textHash(text).slice(0, 8)}`
  const livingWikiTypeFolder = type => ({ character: 'characters', location: 'locations', world_rule: 'world', foreshadow: 'foreshadows', timeline: 'timeline' }[type] || 'pages')
  const livingWikiCandidateRows = storyBible => {
    const rows = []
    const push = (type, title, summary, evidence, source) => {
      const cleanTitle = String(title || '').trim()
      if (!cleanTitle) return
      rows.push({ id: `wiki_up_${textHash(`${type}:${cleanTitle}:${evidence || ''}`).slice(0, 12)}`, type, title: cleanTitle, summary: String(summary || '').trim(), evidence: evidence || '', source })
    }
    for (const row of storyBible.characters || []) push('character', row.name, row.note || row.evidence || '', row.evidence, row)
    for (const row of storyBible.locations || []) push('location', row.name, row.snippet || '', row.evidence, row)
    for (const row of storyBible.world_rules || []) push('world_rule', row.rule, row.snippet || row.rule || '', row.evidence, row)
    for (const row of storyBible.foreshadows || []) push('foreshadow', row.clue, row.status || 'open', row.evidence, row)
    for (const row of storyBible.timeline || []) push('timeline', row.event, row.snippet || row.event || '', row.evidence, row)
    return rows
  }

  const readLivingWikiStore = project => {
    ensureWriterProjectMetadata(project)
    return readJsonFile(writerProjectLivingWikiPath(project), { version: 1, project_id: project.id, pages: [], pending_updates: [], updated_at: null })
  }
  const writeLivingWikiStore = (project, store) => {
    const next = { ...store, version: 1, project_id: project.id, updated_at: new Date().toISOString() }
    writeJsonFile(writerProjectLivingWikiPath(project), next)
    return next
  }
  const writeLivingWikiMarkdownPage = (project, page) => {
    const folder = path.join(project.folder, 'wiki', livingWikiTypeFolder(page.type))
    fs.mkdirSync(folder, { recursive: true })
    const file = path.join(folder, `${wikiSlug(page.title)}.md`)
    const text = [`# ${page.title}`, '', `- Type: ${page.type}`, `- Evidence: ${page.evidence || 'none'}`, `- Updated: ${page.updated_at || ''}`, '', page.summary || '', '', '## Source notes', '', 'This page is generated from confirmed Living Wiki updates.'].join('\n')
    fs.writeFileSync(file, text, 'utf8')
    return path.relative(project.folder, file)
  }
  const generateLivingWikiCandidates = project => {
    const story = readWriterProjectStoryBible(project.id).story_bible
    const store = readLivingWikiStore(project)
    const existingKeys = new Set([...(store.pages || []), ...(store.pending_updates || [])].map(row => `${row.type}:${String(row.title || '').toLowerCase()}`))
    const candidates = livingWikiCandidateRows(story).filter(row => !existingKeys.has(`${row.type}:${row.title.toLowerCase()}`))
    const pending = [...(store.pending_updates || []), ...candidates.map(row => ({ ...row, status: 'pending', created_at: new Date().toISOString() }))]
    const next = writeLivingWikiStore(project, { ...store, pending_updates: pending })
    appendWriterProjectVersion(project, 'living-wiki-candidates', `Generated ${candidates.length} Living Wiki candidate updates`, { candidates: candidates.length })
    return { ok: true, project: enrichWriterProject(project), wiki: next, generated: candidates.length }
  }

  const graphNodeId = (type, title) => `${type}_${textHash(`${type}:${String(title || '').toLowerCase()}`).slice(0, 12)}`
  const graphPushNode = (map, type, title, props = {}) => {
    const cleanTitle = String(title || '').trim()
    if (!cleanTitle) return null
    const id = graphNodeId(type, cleanTitle)
    const current = map.get(id) || { id, type, title: cleanTitle, evidence: [], sources: [] }
    const evidence = props.evidence ? uniqueBy([...(current.evidence || []), props.evidence], item => item).slice(0, 12) : (current.evidence || [])
    const sources = props.source ? uniqueBy([...(current.sources || []), props.source], item => item).slice(0, 12) : (current.sources || [])
    map.set(id, { ...current, ...props, id, type, title: cleanTitle, evidence, sources })
    return id
  }
  const graphPushEdge = (edges, from, to, type, props = {}) => {
    if (!from || !to || from === to) return
    const id = `edge_${textHash(`${from}:${to}:${type}`).slice(0, 12)}`
    if (edges.some(edge => edge.id === id)) return
    edges.push({ id, from, to, type, ...props })
  }
  const readKnowledgeGraphStore = project => {
    ensureWriterProjectMetadata(project)
    const graphPath = writerProjectKnowledgeGraphPath(project)
    const raw = readJsonFile(graphPath, null)
    if (!raw) {
      return { schemaVersion: 2, version: 2, project_id: project.id, nodes: [], edges: [], stats: { nodes: 0, edges: 0 }, updated_at: null }
    }
    const schemaVersion = raw.schemaVersion || raw.version || 1
    if (schemaVersion >= 2) {
      return {
        schemaVersion: 2,
        version: 2,
        project_id: raw.project_id || project.id,
        nodes: raw.nodes || [],
        edges: raw.edges || [],
        stats: raw.stats || { nodes: (raw.nodes || []).length, edges: (raw.edges || []).length },
        updated_at: raw.updated_at || null,
        metadata: raw.metadata || {}
      }
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupPath = path.join(path.dirname(graphPath), `knowledge_graph.v1.backup.${ts}.json`)
    try { fs.copyFileSync(graphPath, backupPath) } catch {}
    const v1Nodes = raw.nodes || []
    const v1Edges = raw.edges || []
    const v2Nodes = v1Nodes.map((node, idx) => {
      const id = node.id || `migrated_node_${idx}`
      const origin = node.origin || (node.source === 'manual_edit' ? 'manual' : 'imported')
      return {
        id,
        project_id: raw.project_id || project.id,
        entity_key: node.entity_key || node.name || node.title || id,
        type: node.type || 'entity',
        title: node.title || node.name || 'Untitled',
        name: node.name || node.title || 'Untitled',
        description: node.description || node.summary || node.note || '',
        summary: node.summary || node.description || '',
        origin,
        source_module: node.source_module || node.source || (origin === 'generated' ? 'bible' : 'imported'),
        source_entity_id: node.source_entity_id || undefined,
        aliases: node.aliases || [],
        properties: node.properties || {},
        provenance: node.provenance || node.evidence || (node.sources ? node.sources.map(s => typeof s === 'string' ? { sourceType: 'file', excerpt: s } : { sourceType: s.type || 'file', ...s }) : []).map(e => ({ sourceType: e.sourceType || e.type || 'file', sourceId: e.source_id || e.sourceId, relativePath: e.relative_path || e.relativePath, excerpt: e.excerpt || e.text, lineStart: e.line_start || e.lineStart, lineEnd: e.line_end || e.lineEnd })),
        layout: node.layout || { x: node.x, y: node.y, pinned: node.pinned || false },
        x: node.x,
        y: node.y,
        pinned: node.pinned || false,
        overrides: node.overrides || {},
        source_revision: node.source_revision || undefined,
        created_at: node.created_at || raw.updated_at || new Date().toISOString(),
        updated_at: node.updated_at || raw.updated_at || new Date().toISOString()
      }
    })
    const v2Edges = v1Edges.map((edge, idx) => {
      const source = edge.source || edge.from
      const target = edge.target || edge.to
      const id = edge.id || `migrated_edge_${idx}`
      const origin = edge.origin || (edge.source_module === 'manual_edit' ? 'manual' : 'imported')
      return {
        id,
        project_id: raw.project_id || project.id,
        source,
        from: source,
        target,
        to: target,
        type: edge.type || edge.relation || 'related',
        label: edge.label || edge.type || 'related',
        description: edge.description || '',
        origin,
        source_module: edge.source_module || (origin === 'generated' ? 'bible' : 'imported'),
        source_entity_id: edge.source_entity_id || undefined,
        weight: edge.weight || 1,
        properties: edge.properties || {},
        provenance: edge.provenance || edge.evidence || [],
        source_revision: edge.source_revision || undefined,
        created_at: edge.created_at || raw.updated_at || new Date().toISOString(),
        updated_at: edge.updated_at || raw.updated_at || new Date().toISOString()
      }
    })
    const migrated = {
      schemaVersion: 2,
      version: 2,
      project_id: raw.project_id || project.id,
      nodes: v2Nodes,
      edges: v2Edges,
      stats: { nodes: v2Nodes.length, edges: v2Edges.length, types: v2Nodes.reduce((acc, node) => { acc[node.type] = (acc[node.type] || 0) + 1; return acc }, {}) },
      updated_at: new Date().toISOString(),
      metadata: { migrated_from_v1: true, migration_timestamp: new Date().toISOString(), v1_backup: backupPath }
    }
    writeJsonFile(graphPath, migrated)
    return migrated
  }
  const writeKnowledgeGraphStore = (project, graph) => {
    const next = { ...graph, schemaVersion: 2, version: 2, project_id: project.id, updated_at: new Date().toISOString(), stats: { nodes: graph.nodes?.length || 0, edges: graph.edges?.length || 0, types: (graph.nodes || []).reduce((acc, node) => { acc[node.type] = (acc[node.type] || 0) + 1; return acc }, {}) } }
    const graphPath = writerProjectKnowledgeGraphPath(project)
    if (fs.existsSync(graphPath)) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const backupPath = path.join(path.dirname(graphPath), `knowledge_graph.backup.${ts}.json`)
      try { fs.copyFileSync(graphPath, backupPath) } catch {}
    }
    writeJsonFile(graphPath, next)
    return next
  }
  const buildWriterProjectKnowledgeGraph = project => {
    const story = readWriterProjectStoryBible(project.id).story_bible
    const wiki = readLivingWikiStore(project)
    const existingGraph = readKnowledgeGraphStore(project)

    const existingManualNodes = (existingGraph.nodes || []).filter(n => n.origin === 'manual' || n.origin === 'imported')
    const existingManualEdges = (existingGraph.edges || []).filter(e => e.origin === 'manual' || e.origin === 'imported')
    const nodeLayoutMap = new Map()
    const nodeOverrideMap = new Map()
    for (const node of existingGraph.nodes || []) {
      if (node.x !== undefined || node.y !== undefined || node.pinned || node.layout) {
        nodeLayoutMap.set(node.id, {
          x: node.x,
          y: node.y,
          pinned: node.pinned,
          layout: node.layout
        })
      }
      if (node.overrides && Object.keys(node.overrides).length) {
        nodeOverrideMap.set(node.id, node.overrides)
      }
    }

    const nodeMap = new Map()
    const edges = []
    const projectNode = graphPushNode(nodeMap, 'project', project.title, { project_id: project.id, source: 'story_bible', origin: 'generated' })
    for (const chapter of story.chapters || []) {
      const chapterId = graphPushNode(nodeMap, 'chapter', chapter.title || chapter.id, { summary: chapter.summary || '', rel: chapter.file || '', evidence: chapter.evidence || chapter.file || '', source: 'story_bible', origin: 'generated' })
      graphPushEdge(edges, projectNode, chapterId, 'HAS_CHAPTER', { evidence: chapter.evidence || chapter.file || '', origin: 'generated' })
    }
    const chapterNodes = [...nodeMap.values()].filter(node => node.type === 'chapter')
    const linkEvidence = (nodeId, evidence, edgeType = 'MENTIONED_IN') => {
      const ev = String(evidence || '')
      const target = chapterNodes.find(ch => ev && (ev.includes(ch.rel || '::no-rel::') || ev.includes(ch.title || '::no-title::')))
      if (target) graphPushEdge(edges, nodeId, target.id, edgeType, { evidence: ev, origin: 'generated' })
    }
    for (const row of story.characters || []) {
      const id = graphPushNode(nodeMap, 'character', row.name, { note: row.note || '', evidence: row.evidence || '', source: 'story_bible', origin: 'generated' })
      graphPushEdge(edges, projectNode, id, 'HAS_CHARACTER', { evidence: row.evidence || '', origin: 'generated' })
      linkEvidence(id, row.evidence)
    }
    for (const row of story.locations || []) {
      const id = graphPushNode(nodeMap, 'location', row.name, { summary: row.snippet || '', evidence: row.evidence || '', source: 'story_bible', origin: 'generated' })
      graphPushEdge(edges, projectNode, id, 'HAS_LOCATION', { evidence: row.evidence || '', origin: 'generated' })
      linkEvidence(id, row.evidence)
    }
    for (const row of story.world_rules || []) {
      const id = graphPushNode(nodeMap, 'world_rule', row.rule, { summary: row.snippet || row.rule || '', evidence: row.evidence || '', source: 'story_bible', origin: 'generated' })
      graphPushEdge(edges, projectNode, id, 'HAS_RULE', { evidence: row.evidence || '', origin: 'generated' })
      linkEvidence(id, row.evidence, 'SUPPORTED_BY')
    }
    for (const row of story.foreshadows || []) {
      const id = graphPushNode(nodeMap, 'foreshadow', row.clue, { status: row.status || 'open', evidence: row.evidence || '', source: 'story_bible', origin: 'generated' })
      graphPushEdge(edges, projectNode, id, 'HAS_FORESHADOW', { evidence: row.evidence || '', origin: 'generated' })
      linkEvidence(id, row.evidence, 'SEEDED_IN')
    }
    for (const row of story.timeline || []) {
      const id = graphPushNode(nodeMap, 'timeline_event', row.event, { summary: row.snippet || row.event || '', evidence: row.evidence || '', source: 'story_bible', origin: 'generated' })
      graphPushEdge(edges, projectNode, id, 'HAS_EVENT', { evidence: row.evidence || '', origin: 'generated' })
      linkEvidence(id, row.evidence, 'HAPPENS_IN')
    }
    for (const page of wiki.pages || []) {
      const pageId = graphPushNode(nodeMap, 'wiki_page', page.title, { wiki_type: page.type, rel: page.rel || '', summary: page.summary || '', evidence: page.evidence || '', source: 'living_wiki', origin: 'generated' })
      const entityId = graphNodeId(page.type === 'timeline' ? 'timeline_event' : page.type, page.title)
      if (nodeMap.has(entityId)) graphPushEdge(edges, pageId, entityId, 'DESCRIBES', { evidence: page.evidence || page.rel || '', origin: 'generated' })
    }

    for (const node of nodeMap.values()) {
      if (nodeLayoutMap.has(node.id)) {
        const layout = nodeLayoutMap.get(node.id)
        node.x = layout.x
        node.y = layout.y
        node.pinned = layout.pinned
        node.layout = layout.layout
      }
      if (nodeOverrideMap.has(node.id)) {
        node.overrides = nodeOverrideMap.get(node.id)
      }
    }

    const allNodes = [...nodeMap.values(), ...existingManualNodes].sort((a, b) => String(a.type).localeCompare(String(b.type)) || String(a.title).localeCompare(String(b.title)))
    const allEdges = [...edges, ...existingManualEdges]

    const graph = writeKnowledgeGraphStore(project, { nodes: allNodes, edges: allEdges })
    appendWriterProjectVersion(project, 'knowledge-graph-build', `Built knowledge graph with ${graph.nodes.length} nodes (${nodeMap.size} generated, ${existingManualNodes.length} manual) and ${graph.edges.length} edges (${edges.length} generated, ${existingManualEdges.length} manual)`, { nodes: graph.nodes.length, edges: graph.edges.length, generated_nodes: nodeMap.size, manual_nodes: existingManualNodes.length, generated_edges: edges.length, manual_edges: existingManualEdges.length })
    return { ok: true, project: enrichWriterProject(project), graph, rebuild_stats: { generated_nodes: nodeMap.size, manual_nodes: existingManualNodes.length, generated_edges: edges.length, manual_edges: existingManualEdges.length, preserved_layouts: nodeLayoutMap.size } }
  }

  const confirmLivingWikiUpdates = (project, input = {}) => {
    const store = readLivingWikiStore(project)
    const ids = Array.isArray(input.ids) ? new Set(input.ids.map(String)) : null
    const selected = (store.pending_updates || []).filter(row => !ids || ids.has(row.id))
    const now = new Date().toISOString()
    const existingPages = store.pages || []
    const pageMap = new Map(existingPages.map(page => [`${page.type}:${String(page.title || '').toLowerCase()}`, page]))
    for (const update of selected) {
      const key = `${update.type}:${String(update.title || '').toLowerCase()}`
      const current = pageMap.get(key) || { id: `wiki_${textHash(key).slice(0, 12)}`, type: update.type, title: update.title, history: [] }
      const page = { ...current, source: update.source || current.source || null, summary: update.summary || current.summary || '', evidence: update.evidence || current.evidence || '', updated_at: now, history: [...(current.history || []), { at: now, update_id: update.id, evidence: update.evidence || '', summary: update.summary || '' }].slice(-20) }
      page.rel = writeLivingWikiMarkdownPage(project, page)
      pageMap.set(key, page)
    }
    const accepted = new Set(selected.map(row => row.id))
    const next = writeLivingWikiStore(project, { ...store, pages: [...pageMap.values()].sort((a, b) => String(a.title).localeCompare(String(b.title))), pending_updates: (store.pending_updates || []).filter(row => !accepted.has(row.id)) })
    let graph = null
    let memory = null
    const refresh = { graph: false, creative_memory: false, errors: [] }
    if (input.refresh !== false && input.autoRefresh !== false) {
      try { graph = buildWriterProjectKnowledgeGraph(project).graph; refresh.graph = true } catch (err) { refresh.errors.push(`graph: ${err instanceof Error ? err.message : String(err)}`) }
      try { memory = rebuildCreativeMemory(project).memory; refresh.creative_memory = true } catch (err) { refresh.errors.push(`memory: ${err instanceof Error ? err.message : String(err)}`) }
    }
    appendWriterProjectVersion(project, 'living-wiki-confirm', `Confirmed ${selected.length} Living Wiki updates`, { confirmed: selected.length, refresh })
    return { ok: true, project: enrichWriterProject(project), wiki: next, graph, memory, confirmed: selected.length, refresh }
  }

  const livingWikiReviewQueue = project => {
    const wiki = readLivingWikiStore(project)
    const pending = wiki.pending_updates || []
    const sourceType = row => typeof row.source === 'object' && row.source ? String(row.source.type || '') : String(row.source || '')
    const rows = pending.map(row => ({
      ...row,
      review_kind: sourceType(row) === 'draft_guard' ? 'draft_guard' : sourceType(row) === 'workflow_run' || row.type === 'workflow_result' ? 'workflow' : 'wiki_candidate',
      guard_id: typeof row.source === 'object' && row.source ? row.source.guard_id || null : null,
      context_id: typeof row.source === 'object' && row.source ? row.source.context_id || null : null,
      source_type: sourceType(row) || 'manual'
    }))
    const stats = rows.reduce((acc, row) => {
      acc.total += 1
      acc.by_kind[row.review_kind] = (acc.by_kind[row.review_kind] || 0) + 1
      acc.by_type[row.type || 'page'] = (acc.by_type[row.type || 'page'] || 0) + 1
      return acc
    }, { total: 0, by_kind: {}, by_type: {} })
    return { ok: true, project: enrichWriterProject(project), queue: rows, stats, wiki }
  }
  const rejectLivingWikiUpdates = (project, input = {}) => {
    const store = readLivingWikiStore(project)
    const ids = Array.isArray(input.ids) ? new Set(input.ids.map(String)) : null
    if (!ids || !ids.size) throw new Error('Reject requires ids.')
    const now = new Date().toISOString()
    const rejected = []
    const kept = []
    for (const row of store.pending_updates || []) {
      if (ids.has(row.id)) rejected.push({ ...row, status: 'rejected', rejected_at: now, rejection_reason: input.reason || 'Rejected in Canon Review Queue' })
      else kept.push(row)
    }
    const auditFile = path.join(project.folder, 'wiki', 'rejected_updates.json')
    const audit = readJsonFile(auditFile, { version: 1, project_id: project.id, rejected: [] })
    writeJsonFile(auditFile, { ...audit, version: 1, project_id: project.id, rejected: [...rejected, ...(audit.rejected || [])].slice(0, 500), updated_at: now })
    const next = writeLivingWikiStore(project, { ...store, pending_updates: kept })
    appendWriterProjectVersion(project, 'living-wiki-reject', `Rejected ${rejected.length} Living Wiki updates`, { rejected: rejected.map(row => row.id), reason: input.reason || '' })
    return { ok: true, project: enrichWriterProject(project), wiki: next, rejected: rejected.length, rejected_updates: rejected, queue: livingWikiReviewQueue(project).queue }
  }
  const acceptReviewQueueByKind = (project, input = {}) => {
    const queue = livingWikiReviewQueue(project).queue
    const kind = String(input.kind || input.review_kind || '').trim()
    const ids = queue.filter(row => !kind || row.review_kind === kind).map(row => row.id)
    return ids.length ? confirmLivingWikiUpdates(project, { ids, refresh: input.refresh !== false, autoRefresh: input.autoRefresh }) : { ok: true, project: enrichWriterProject(project), wiki: readLivingWikiStore(project), confirmed: 0, refresh: { graph: false, creative_memory: false, errors: [] } }
  }

  const readWriterProjectLivingWiki = ref => {
    const project = findWriterProject(ref)
    if (!project) throw new Error(`Project not found: ${ref}`)
    return { ok: true, project: enrichWriterProject(project), wiki: readLivingWikiStore(project) }
  }
  const handleWriterProjectLivingWiki = (ref, body = {}) => {
    const project = findWriterProject(ref)
    if (!project) throw new Error(`Project not found: ${ref}`)
    const action = String(body.action || 'generate')
    if (action === 'queue' || action === 'review-queue') return livingWikiReviewQueue(project)
    if (action === 'reject' || action === 'dismiss') return rejectLivingWikiUpdates(project, body)
    if (action === 'accept-kind' || action === 'confirm-kind') return acceptReviewQueueByKind(project, body)
    if (action === 'confirm' || action === 'accept' || action === 'accept-all') return confirmLivingWikiUpdates(project, body)
    return generateLivingWikiCandidates(project)
  }

  const readWriterProjectKnowledgeGraph = ref => {
    const project = findWriterProject(ref)
    if (!project) throw new Error(`Project not found: ${ref}`)
    return { ok: true, project: enrichWriterProject(project), graph: readKnowledgeGraphStore(project) }
  }

  const addGraphNode = (project, node) => {
    ensureWriterProjectMetadata(project)
    const graph = readKnowledgeGraphStore(project)
    const id = node.id || `manual_${textHash(`node:${Date.now()}:${node.title || node.name || 'node'}`).slice(0, 12)}`
    const now = new Date().toISOString()
    const newNode = {
      id,
      type: node.type || 'entity',
      title: node.title || node.name || 'Untitled',
      name: node.title || node.name || 'Untitled',
      description: node.description || node.summary || '',
      summary: node.description || node.summary || '',
      origin: 'manual',
      source: 'manual_edit',
      evidence: node.evidence || [],
      properties: node.properties || {},
      x: node.x,
      y: node.y,
      pinned: node.pinned || false,
      layout: node.layout || null,
      created_at: now,
      updated_at: now
    }
    const nodes = [...(graph.nodes || []), newNode]
    const next = writeKnowledgeGraphStore(project, { ...graph, nodes })
    appendWriterProjectVersion(project, 'graph-node-add', `Added manual graph node: ${newNode.title}`, { node_id: id, type: newNode.type })
    return { ok: true, node: newNode, graph: next }
  }

  const updateGraphNode = (project, nodeId, patch) => {
    ensureWriterProjectMetadata(project)
    const graph = readKnowledgeGraphStore(project)
    const nodes = graph.nodes || []
    const idx = nodes.findIndex(n => n.id === nodeId)
    if (idx < 0) throw new Error(`Node not found: ${nodeId}`)
    const now = new Date().toISOString()
    const existing = nodes[idx]
    const updated = { ...existing, updated_at: now }
    if (patch.title !== undefined || patch.name !== undefined) {
      updated.title = patch.title || patch.name || updated.title
      updated.name = patch.title || patch.name || updated.name
    }
    if (patch.type !== undefined) updated.type = patch.type
    if (patch.description !== undefined || patch.summary !== undefined) {
      updated.description = patch.description || patch.summary || updated.description
      updated.summary = patch.description || patch.summary || updated.summary
    }
    if (patch.properties !== undefined) updated.properties = { ...(updated.properties || {}), ...patch.properties }
    if (patch.x !== undefined) updated.x = patch.x
    if (patch.y !== undefined) updated.y = patch.y
    if (patch.pinned !== undefined) updated.pinned = patch.pinned
    if (patch.layout !== undefined) updated.layout = patch.layout
    if (!updated.origin) updated.origin = existing.source === 'manual_edit' ? 'manual' : 'generated'
    if (updated.origin === 'generated') {
      updated.overrides = { ...(existing.overrides || {}), ...(patch.overrides || {}) }
      Object.keys(patch || {}).forEach(k => {
        if (['title', 'name', 'description', 'summary', 'type', 'x', 'y', 'pinned'].includes(k)) {
          updated.overrides = updated.overrides || {}
          updated.overrides[k] = updated[k]
        }
      })
    }
    const newNodes = [...nodes]
    newNodes[idx] = updated
    const next = writeKnowledgeGraphStore(project, { ...graph, nodes: newNodes })
    appendWriterProjectVersion(project, 'graph-node-update', `Updated graph node: ${updated.title || nodeId}`, { node_id: nodeId, type: updated.type })
    return { ok: true, node: updated, graph: next }
  }

  const deleteGraphNode = (project, nodeId) => {
    ensureWriterProjectMetadata(project)
    const graph = readKnowledgeGraphStore(project)
    const nodes = (graph.nodes || []).filter(n => n.id !== nodeId)
    const edges = (graph.edges || []).filter(e => {
      const sid = typeof e.source === 'object' ? e.source.id : e.source
      const tid = typeof e.target === 'object' ? e.target.id : e.target
      return sid !== nodeId && tid !== nodeId
    })
    const next = writeKnowledgeGraphStore(project, { ...graph, nodes, edges })
    appendWriterProjectVersion(project, 'graph-node-delete', `Deleted graph node: ${nodeId}`, { node_id: nodeId })
    return { ok: true, graph: next, deleted_node: nodeId, deleted_edges: (graph.edges || []).length - edges.length }
  }

  const addGraphEdge = (project, edge) => {
    ensureWriterProjectMetadata(project)
    const graph = readKnowledgeGraphStore(project)
    const source = typeof edge.source === 'object' ? edge.source.id : edge.source
    const target = typeof edge.target === 'object' ? edge.target.id : edge.target
    if (!source || !target || source === target) throw new Error('Invalid edge source or target')
    const nodeIds = new Set((graph.nodes || []).map(n => n.id))
    if (!nodeIds.has(source) || !nodeIds.has(target)) throw new Error('Edge source or target node does not exist')
    const id = edge.id || `manual_edge_${textHash(`edge:${source}:${target}:${Date.now()}`).slice(0, 12)}`
    const now = new Date().toISOString()
    const newEdge = {
      id,
      source,
      from: source,
      target,
      to: target,
      type: edge.type || edge.relation || 'related',
      label: edge.label || edge.type || 'related',
      description: edge.description || '',
      weight: edge.weight || 1,
      origin: 'manual',
      source_module: 'manual_edit',
      evidence: edge.evidence || [],
      properties: edge.properties || {},
      created_at: now,
      updated_at: now
    }
    const edges = [...(graph.edges || []), newEdge]
    const next = writeKnowledgeGraphStore(project, { ...graph, edges })
    appendWriterProjectVersion(project, 'graph-edge-add', `Added manual graph edge: ${source} -> ${target}`, { edge_id: id, type: newEdge.type })
    return { ok: true, edge: newEdge, graph: next }
  }

  const updateGraphEdge = (project, edgeId, patch) => {
    ensureWriterProjectMetadata(project)
    const graph = readKnowledgeGraphStore(project)
    const edges = graph.edges || []
    const idx = edges.findIndex(e => e.id === edgeId)
    if (idx < 0) throw new Error(`Edge not found: ${edgeId}`)
    const now = new Date().toISOString()
    const existing = edges[idx]
    const updated = { ...existing, updated_at: now }
    if (patch.label !== undefined || patch.type !== undefined) {
      updated.label = patch.label || patch.type || updated.label
      updated.type = patch.type || patch.label || updated.type
    }
    if (patch.description !== undefined) updated.description = patch.description
    if (patch.weight !== undefined) updated.weight = patch.weight
    if (patch.properties !== undefined) updated.properties = { ...(updated.properties || {}), ...patch.properties }
    if (patch.source !== undefined) { updated.source = patch.source; updated.from = patch.source }
    if (patch.target !== undefined) { updated.target = patch.target; updated.to = patch.target }
    const newEdges = [...edges]
    newEdges[idx] = updated
    const next = writeKnowledgeGraphStore(project, { ...graph, edges: newEdges })
    appendWriterProjectVersion(project, 'graph-edge-update', `Updated graph edge: ${edgeId}`, { edge_id: edgeId })
    return { ok: true, edge: updated, graph: next }
  }

  const deleteGraphEdge = (project, edgeId) => {
    ensureWriterProjectMetadata(project)
    const graph = readKnowledgeGraphStore(project)
    const edges = (graph.edges || []).filter(e => e.id !== edgeId)
    const next = writeKnowledgeGraphStore(project, { ...graph, edges })
    appendWriterProjectVersion(project, 'graph-edge-delete', `Deleted graph edge: ${edgeId}`, { edge_id: edgeId })
    return { ok: true, graph: next, deleted_edge: edgeId }
  }

  const handleWriterProjectKnowledgeGraph = (ref, body = {}) => {
    const project = findWriterProject(ref)
    if (!project) throw new Error(`Project not found: ${ref}`)
    const action = String(body.action || 'build').toLowerCase()
    if (action === 'add-node' || action === 'create-node') return addGraphNode(project, body.node || body)
    if (action === 'update-node' || action === 'patch-node') return updateGraphNode(project, body.node_id || body.id, body.patch || body)
    if (action === 'delete-node' || action === 'remove-node') return deleteGraphNode(project, body.node_id || body.id)
    if (action === 'add-edge' || action === 'create-edge') return addGraphEdge(project, body.edge || body)
    if (action === 'update-edge' || action === 'patch-edge') return updateGraphEdge(project, body.edge_id || body.id, body.patch || body)
    if (action === 'delete-edge' || action === 'remove-edge') return deleteGraphEdge(project, body.edge_id || body.id)
    return buildWriterProjectKnowledgeGraph(project)
  }

  const readNarrativeStateStore = project => {
    ensureWriterProjectMetadata(project)
    return readJsonFile(writerProjectNarrativeStatePath(project), { version: 1, project_id: project.id, characters: [], threads: [], timeline: [], continuity_checks: [], updated_at: null })
  }
  const writeNarrativeStateStore = (project, state) => {
    const next = { ...state, version: 1, project_id: project.id, updated_at: new Date().toISOString(), stats: { characters: state.characters?.length || 0, threads: state.threads?.length || 0, timeline: state.timeline?.length || 0, continuity_checks: state.continuity_checks?.length || 0 } }
    writeJsonFile(writerProjectNarrativeStatePath(project), next)
    return next
  }
  const buildWriterProjectNarrativeState = project => {
    const story = readWriterProjectStoryBible(project.id).story_bible
    const graph = readKnowledgeGraphStore(project)
    const characters = (story.characters || []).map(row => ({ id: graphNodeId('character', row.name), name: row.name, status: 'active', location: '', goal: '', tension: '', last_seen: row.evidence || '', evidence: row.evidence || '', note: row.note || '' }))
    const threads = [
      ...(story.foreshadows || []).map(row => ({ id: graphNodeId('foreshadow', row.clue), type: 'foreshadow', title: row.clue, status: row.status || 'open', opened_at: row.evidence || '', resolved_at: '', evidence: row.evidence || '' })),
      ...(story.world_rules || []).map(row => ({ id: graphNodeId('world_rule', row.rule), type: 'world_rule', title: row.rule, status: 'canon', opened_at: row.evidence || '', resolved_at: '', evidence: row.evidence || '' }))
    ]
    const timeline = (story.timeline || []).map((row, index) => ({ id: graphNodeId('timeline_event', row.event), order: index + 1, event: row.event, chapter: row.evidence || '', evidence: row.evidence || '', locked: false }))
    const continuity_checks = []
    const openForeshadows = threads.filter(row => row.type === 'foreshadow' && row.status !== 'resolved')
    if (openForeshadows.length) continuity_checks.push({ id: 'open_foreshadows', severity: openForeshadows.length > 20 ? 'medium' : 'info', title: 'Open foreshadows', count: openForeshadows.length, suggestion: 'Review unresolved clues before major rewrite or ending generation.' })
    if (!characters.length) continuity_checks.push({ id: 'no_characters', severity: 'warning', title: 'No character state', count: 0, suggestion: 'Run project analysis and rebuild Story Bible before state tracking.' })
    if (!timeline.length) continuity_checks.push({ id: 'no_timeline', severity: 'info', title: 'No timeline events', count: 0, suggestion: 'Add explicit time markers or chapter headings to improve narrative state.' })
    const state = writeNarrativeStateStore(project, { characters, threads, timeline, continuity_checks, upstream: { story_bible_updated_at: story.updated_at || null, graph_updated_at: graph.updated_at || null } })
    appendWriterProjectVersion(project, 'narrative-state-build', `Built narrative state with ${characters.length} characters, ${threads.length} threads and ${timeline.length} timeline events`, { characters: characters.length, threads: threads.length, timeline: timeline.length })
    return { ok: true, project: enrichWriterProject(project), state }
  }
  const readWriterProjectNarrativeState = ref => {
    const project = findWriterProject(ref)
    if (!project) throw new Error(`Project not found: ${ref}`)
    return { ok: true, project: enrichWriterProject(project), state: readNarrativeStateStore(project) }
  }
  const handleWriterProjectNarrativeState = (ref, body = {}) => {
    const project = findWriterProject(ref)
    if (!project) throw new Error(`Project not found: ${ref}`)
    return buildWriterProjectNarrativeState(project)
  }

  return {
    wikiSlug,
    livingWikiTypeFolder,
    livingWikiCandidateRows,
    readLivingWikiStore,
    writeLivingWikiStore,
    writeLivingWikiMarkdownPage,
    generateLivingWikiCandidates,
    confirmLivingWikiUpdates,
    livingWikiReviewQueue,
    rejectLivingWikiUpdates,
    acceptReviewQueueByKind,
    readWriterProjectLivingWiki,
    handleWriterProjectLivingWiki,
    graphNodeId,
    graphPushNode,
    graphPushEdge,
    readKnowledgeGraphStore,
    writeKnowledgeGraphStore,
    buildWriterProjectKnowledgeGraph,
    readWriterProjectKnowledgeGraph,
    handleWriterProjectKnowledgeGraph,
    addGraphNode,
    updateGraphNode,
    deleteGraphNode,
    addGraphEdge,
    updateGraphEdge,
    deleteGraphEdge,
    readNarrativeStateStore,
    writeNarrativeStateStore,
    buildWriterProjectNarrativeState,
    readWriterProjectNarrativeState,
    handleWriterProjectNarrativeState
  }
}

module.exports = { createWriterNarrativeService }
