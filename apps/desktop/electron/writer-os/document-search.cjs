/* eslint-disable no-unused-vars, no-empty, no-control-regex, no-useless-escape, no-undef */
'use strict'

function createWriterDocumentSearchService(deps = {}) {
  const {
    fs,
    path,
    textHash,
    summarizeText,
    ensureWriterProjectMetadata,
    readProjectDocuments,
    readJsonFile,
    writeJsonFile,
    writerProjectDocumentsPath,
    writerProjectDocumentNodesPath,
    writerProjectCreativeSearchPath,
    appendWriterProjectVersion,
    enrichWriterProject,
    findWriterProject,
    readWriterProjectStoryBible,
    readLivingWikiStore,
    readKnowledgeGraphStore,
    readNarrativeStateStore,
    ragTermFreq
  } = deps

const classifyWriterDocumentKind = rel => {
  const text = String(rel || '').replace(/\\/g, '/')
  if (text.startsWith('manuscript/')) return 'manuscript'
  if (text.startsWith('imports/')) return 'import'
  if (text.startsWith('characters/')) return 'character-note'
  if (text.startsWith('world/')) return 'world-note'
  if (text.startsWith('research/')) return 'research'
  if (text.startsWith('notes/')) return 'note'
  return 'source'
}
const splitDocumentNodes = doc => {
  const lines = String(doc.text || '').split(/\r?\n/)
  const nodes = []
  let current = { start: 1, heading: doc.title, lines: [] }
  const push = endLine => {
    const text = current.lines.join('\n').trim()
    if (!text) return
    const idx = nodes.length + 1
    nodes.push({
      id: `node_${textHash(`${doc.rel}:${current.start}:${idx}`).slice(0, 12)}`,
      document_id: doc.id,
      project_rel: doc.rel,
      index: idx,
      title: current.heading || doc.title,
      start_line: current.start,
      end_line: Math.max(current.start, endLine),
      chars: text.length,
      text: text.slice(0, 1600),
      summary: summarizeText(text, 240)
    })
  }
  lines.forEach((line, index) => {
    const heading = /^\s{0,3}#{1,4}\s+(.+?)\s*$/.exec(line)
    if (heading && current.lines.length) {
      push(index)
      current = { start: index + 1, heading: heading[1].trim().slice(0, 100), lines: [line] }
      return
    }
    current.lines.push(line)
  })
  push(lines.length)
  if (!nodes.length && doc.text.trim()) nodes.push({ id: `node_${textHash(doc.rel).slice(0, 12)}`, document_id: doc.id, project_rel: doc.rel, index: 1, title: doc.title, start_line: 1, end_line: doc.lines, chars: doc.text.length, text: doc.text.slice(0, 1600), summary: summarizeText(doc.text, 240) })
  return nodes
}
const syncWriterProjectDocuments = (project, opts = {}) => {
  ensureWriterProjectMetadata(project)
  const now = new Date().toISOString()
  const rawDocs = readProjectDocuments(project)
  const documents = rawDocs.map(doc => {
    const stat = fs.statSync(doc.file)
    const id = `doc_${textHash(`${project.id}:${doc.rel}`).slice(0, 12)}`
    return { id, project_id: project.id, title: doc.title, rel: doc.rel, path: doc.file, kind: classifyWriterDocumentKind(doc.rel), chars: doc.chars, lines: doc.lines, mtime: stat.mtime.toISOString(), preview: summarizeText(doc.text, 180) }
  })
  const byRel = new Map(documents.map(doc => [doc.rel, doc]))
  const nodes = rawDocs.flatMap(doc => splitDocumentNodes({ ...doc, id: byRel.get(doc.rel)?.id || `doc_${textHash(doc.rel).slice(0, 12)}` }))
  const payload = { version: 1, project_id: project.id, updated_at: now, documents }
  const nodePayload = { version: 1, project_id: project.id, updated_at: now, nodes }
  writeJsonFile(writerProjectDocumentsPath(project), payload)
  writeJsonFile(writerProjectDocumentNodesPath(project), nodePayload)
  if (opts.recordVersion !== false) appendWriterProjectVersion(project, 'documents-sync', `Synced ${documents.length} documents and ${nodes.length} document nodes`, { documents: documents.length, nodes: nodes.length })
  return { ok: true, project: enrichWriterProject(project), documents, nodes, updated_at: now }
}
const readWriterProjectDocumentEngine = ref => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  ensureWriterProjectMetadata(project)
  const documentsStore = readJsonFile(writerProjectDocumentsPath(project), { version: 1, project_id: project.id, documents: [], updated_at: null })
  const nodesStore = readJsonFile(writerProjectDocumentNodesPath(project), { version: 1, project_id: project.id, nodes: [], updated_at: null })
  return { ok: true, project: enrichWriterProject(project), documents: documentsStore.documents || [], nodes: nodesStore.nodes || [], updated_at: documentsStore.updated_at || nodesStore.updated_at || null }
}

const readCreativeSearchStore = project => {
  ensureWriterProjectMetadata(project)
  return readJsonFile(writerProjectCreativeSearchPath(project), { version: 1, project_id: project.id, queries: [], last_results: [], stats: { searchable_items: 0 }, updated_at: null })
}
const writeCreativeSearchStore = (project, store) => {
  const next = { ...store, version: 1, project_id: project.id, updated_at: new Date().toISOString(), queries: (store.queries || []).slice(0, 80), last_results: (store.last_results || []).slice(0, 50) }
  writeJsonFile(writerProjectCreativeSearchPath(project), next)
  return next
}
const creativeSearchRows = project => {
  const rows = []
  const push = (kind, title, text, evidence = '', meta = {}) => {
    const cleanTitle = String(title || '').trim()
    const cleanText = String(text || '').trim()
    if (!cleanTitle && !cleanText) return
    rows.push({ id: `cs_${textHash(`${kind}:${cleanTitle}:${evidence}:${cleanText}`).slice(0, 12)}`, kind, title: cleanTitle || kind, text: cleanText, evidence: String(evidence || ''), meta })
  }
  const docs = readWriterProjectDocumentEngine(project.id)
  for (const doc of docs.documents || []) push('document', doc.title || doc.rel, [doc.preview, doc.rel].filter(Boolean).join('\n'), doc.rel, { rel: doc.rel, chars: doc.chars, lines: doc.lines })
  for (const node of docs.nodes || []) push('document_node', node.title || node.project_rel, [node.summary, node.text].filter(Boolean).join('\n'), `${node.project_rel}:${node.start_line || 1}`, { rel: node.project_rel, start_line: node.start_line, end_line: node.end_line })
  const story = readWriterProjectStoryBible(project.id).story_bible || {}
  for (const row of story.chapters || []) push('chapter', row.title, row.summary || row.evidence || '', row.evidence || row.file || '', row)
  for (const row of story.characters || []) push('character', row.name, row.note || row.evidence || '', row.evidence, row)
  for (const row of story.locations || []) push('location', row.name, row.snippet || row.evidence || '', row.evidence, row)
  for (const row of story.world_rules || []) push('world_rule', row.rule, row.snippet || row.rule || '', row.evidence, row)
  for (const row of story.foreshadows || []) push('foreshadow', row.clue, row.status || row.snippet || '', row.evidence, row)
  for (const row of story.timeline || []) push('timeline', row.event, row.snippet || row.event || '', row.evidence, row)
  const wiki = readLivingWikiStore(project)
  for (const row of [...(wiki.pages || []), ...(wiki.pending_updates || [])]) push(`wiki_${row.type || 'page'}`, row.title, row.summary || '', row.evidence || row.rel || '', row)
  const graph = readKnowledgeGraphStore(project)
  for (const row of graph.nodes || []) push(`graph_${row.type || 'node'}`, row.title, row.summary || row.note || '', Array.isArray(row.evidence) ? row.evidence.join('; ') : row.evidence || '', row)
  const state = readNarrativeStateStore(project)
  for (const row of state.characters || []) push('state_character', row.name, [row.state, row.goal, row.emotion].filter(Boolean).join(' / '), row.evidence || '', row)
  for (const row of state.threads || []) push('state_thread', row.title || row.clue, [row.status, row.payoff, row.evidence].filter(Boolean).join(' / '), row.evidence || '', row)
  return rows
}
const scoreCreativeSearchRow = (row, qKeys, qTerms) => {
  const hay = `${row.kind}\n${row.title}\n${row.text}\n${row.evidence}`.toLowerCase()
  const title = String(row.title || '').toLowerCase()
  let score = 0
  for (const token of qKeys) {
    if (title.includes(token)) score += 3 * (qTerms[token] || 1)
    if (hay.includes(token)) score += 1 * (qTerms[token] || 1)
  }
  return Number(score.toFixed(4))
}
const runCreativeSearch = (project, input = {}) => {
  const query = String(input.query || input.q || '').trim()
  const limit = Math.max(1, Math.min(60, Number(input.limit || 20)))
  const kinds = Array.isArray(input.kinds) ? new Set(input.kinds.map(String)) : null
  const rows = creativeSearchRows(project)
  const qTerms = ragTermFreq(query)
  const qKeys = Object.keys(qTerms)
  const results = rows
    .filter(row => !kinds || kinds.has(row.kind))
    .map(row => ({ ...row, score: qKeys.length ? scoreCreativeSearchRow(row, qKeys, qTerms) : 0.1 }))
    .filter(row => row.score > 0 || !query)
    .sort((a, b) => b.score - a.score || String(a.kind).localeCompare(String(b.kind)))
    .slice(0, limit)
  const store = readCreativeSearchStore(project)
  const queryRow = { id: `query_${Date.now()}`, query, at: new Date().toISOString(), results: results.length, source_count: rows.length }
  const next = writeCreativeSearchStore(project, { ...store, queries: query ? [queryRow, ...(store.queries || [])] : (store.queries || []), last_results: results, stats: { searchable_items: rows.length, result_count: results.length, kinds: rows.reduce((acc, row) => { acc[row.kind] = (acc[row.kind] || 0) + 1; return acc }, {}) } })
  appendWriterProjectVersion(project, 'creative-search', `Creative search returned ${results.length} results`, { query, results: results.length })
  return { ok: true, project: enrichWriterProject(project), query, results, queries: next.queries, stats: next.stats, updated_at: next.updated_at, mode: 'creative-search-local' }
}
const readWriterProjectCreativeSearch = ref => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const store = readCreativeSearchStore(project)
  const sourceCount = creativeSearchRows(project).length
  return { ok: true, project: enrichWriterProject(project), queries: store.queries || [], results: store.last_results || [], stats: { ...(store.stats || {}), searchable_items: sourceCount }, updated_at: store.updated_at || null, mode: 'creative-search-local' }
}
const handleWriterProjectCreativeSearch = (ref, body = {}) => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  return runCreativeSearch(project, body)
}

  return {
    classifyWriterDocumentKind,
    splitDocumentNodes,
    syncWriterProjectDocuments,
    readWriterProjectDocumentEngine,
    readCreativeSearchStore,
    writeCreativeSearchStore,
    creativeSearchRows,
    scoreCreativeSearchRow,
    runCreativeSearch,
    readWriterProjectCreativeSearch,
    handleWriterProjectCreativeSearch
  }
}

module.exports = { createWriterDocumentSearchService }
