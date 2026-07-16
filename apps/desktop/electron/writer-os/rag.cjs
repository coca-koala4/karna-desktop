/* eslint-disable no-unused-vars, no-empty, no-control-regex, no-useless-escape, no-undef */
'use strict'

function createWriterRagService(deps) {
  const {
    fs,
    path,
    textHash,
    fileHash,
    readJsonFile,
    writeJsonFile,
    ensureWriterProjectMetadata,
    enrichWriterProject,
    findWriterProject,
    appendWriterProjectVersion,
    readWriterProjectDocumentEngine,
    syncWriterProjectDocuments,
    summarizeText,
    getEmbeddingModelRow,
    embedTexts,
    cosineSimilarity,
    localVectorDimensions,
    ragTokenize,
    ragTermFreq,
    ragChunkText,
    ragChunkHash,
    localHashVector,
    vectorHealthFor
  } = deps

const writerProjectRagIndexPath = project => path.join(project.folder, 'rag', 'rag_index.json')
const writerProjectVectorStorePath = project => path.join(project.folder, 'rag', 'vector_store.json')
const writerProjectVectorDbDir = project => path.join(project.folder, 'rag', 'vector_db')
const writerProjectVectorDbManifestPath = project => path.join(writerProjectVectorDbDir(project), 'manifest.json')
const writerProjectRetrievalContextsPath = project => path.join(project.folder, 'rag', 'retrieval_contexts.json')
const readWriterProjectVectorStore = project => {
  ensureWriterProjectMetadata(project)
  return readJsonFile(writerProjectVectorStorePath(project), { version: 1, project_id: project.id, provider: { id: 'local-hash-vector', kind: 'local', model: 'local-hash-vector-384', dimensions: localVectorDimensions }, vectors: [], stats: { vectors: 0, dimensions: localVectorDimensions, mode: 'local-hash-vector', coverage: 0 }, updated_at: null })
}
const writeWriterProjectVectorStore = (project, store) => {
  const vectors = store.vectors || []
  const inferredDimensions = vectors.find(row => Array.isArray(row.vector))?.vector?.length || store.provider?.dimensions || store.stats?.dimensions || localVectorDimensions
  const next = { ...store, version: 1, project_id: project.id, updated_at: new Date().toISOString(), stats: { ...(store.stats || {}), vectors: vectors.length, dimensions: inferredDimensions, mode: store.mode || store.stats?.mode || store.provider?.id || 'local-hash-vector', documents: new Set(vectors.map(row => row.project_rel)).size } }
  writeJsonFile(writerProjectVectorStorePath(project), next)
  return next
}
const readWriterProjectVectorDatabase = project => {
  ensureWriterProjectMetadata(project)
  return readJsonFile(writerProjectVectorDbManifestPath(project), { version: 1, project_id: project.id, engine: 'karna-local-vector-db', storage: 'jsonl-segment', vectors: 0, dimensions: 0, segments: [], updated_at: null })
}
const verifyWriterProjectVectorDatabase = (project, input = {}) => {
  ensureWriterProjectMetadata(project)
  const manifest = readWriterProjectVectorDatabase(project)
  const vectorStore = readWriterProjectVectorStore(project)
  const index = readWriterProjectRagIndexStore(project)
  const dbDir = writerProjectVectorDbDir(project)
  const segmentResults = (manifest.segments || []).map(segment => {
    const rel = String(segment.rel || '').replace(/^[\/]+/, '')
    const file = path.join(dbDir, rel)
    const exists = fs.existsSync(file) && fs.statSync(file).isFile()
    const bytes = exists ? fs.statSync(file).size : 0
    const sha1 = exists ? fileHash(file) : ''
    const rows = exists ? fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).length : 0
    return {
      rel,
      exists,
      bytes,
      expected_bytes: segment.bytes || 0,
      sha1,
      expected_sha1: segment.sha1 || '',
      rows,
      expected_rows: segment.rows || 0,
      ok: exists && sha1 === segment.sha1 && (!segment.bytes || bytes === segment.bytes) && rows === (segment.rows || 0)
    }
  })
  const expectedVectors = vectorStore.vectors?.length || 0
  const dbVectors = manifest.vectors || 0
  const segmentRows = segmentResults.reduce((sum, row) => sum + (row.rows || 0), 0)
  const health = vectorHealthFor(index, vectorStore)
  const failures = segmentResults.filter(row => !row.ok)
  if (!manifest.segments?.length) failures.push({ rel: 'rag/vector_db/segments/vectors.jsonl', exists: false, rows: 0, expected_rows: expectedVectors, ok: false, reason: 'missing segment manifest' })
  const ok = failures.length === 0 && dbVectors === expectedVectors && segmentRows === expectedVectors && health.ready
  const report = {
    id: `vector_db_verify_${Date.now()}`,
    at: new Date().toISOString(),
    ok,
    manifest_rel: path.relative(project.folder, writerProjectVectorDbManifestPath(project)),
    engine: manifest.engine || 'karna-local-vector-db',
    vectors: expectedVectors,
    db_vectors: dbVectors,
    segment_rows: segmentRows,
    chunks: index.chunks?.length || 0,
    coverage: health.coverage,
    segments: segmentResults,
    failures,
    repair_action: ok ? null : 'Run RAG -> Build Vector DB to refresh vector_store.json and rag/vector_db segments.'
  }
  if (input.record !== false) appendWriterProjectVersion(project, ok ? 'vector-db-verify-pass' : 'vector-db-verify-fail', `Vector DB verification ${ok ? 'passed' : 'failed'} ${segmentRows}/${expectedVectors}`, report)
  return { ok, project: enrichWriterProject(project), vector_database: manifest, vector_db_verification: report, vector_health: health, updated_at: report.at }
}
const writeWriterProjectVectorDatabase = (project, vectorStore, index = {}, health = null) => {
  const dbDir = writerProjectVectorDbDir(project)
  const segmentDir = path.join(dbDir, 'segments')
  fs.mkdirSync(segmentDir, { recursive: true })
  const activeSegment = path.join('segments', 'vectors.jsonl')
  const segmentFile = path.join(dbDir, activeSegment)
  const vectors = vectorStore.vectors || []
  const now = new Date().toISOString()
  const lines = vectors.map(row => JSON.stringify({
    id: row.id,
    chunk_id: row.chunk_id,
    node_id: row.node_id,
    document_id: row.document_id,
    project_rel: row.project_rel,
    title: row.title,
    start_line: row.start_line,
    end_line: row.end_line,
    text_hash: row.text_hash,
    provider: row.provider,
    model: row.model,
    vector: row.vector || []
  }))
  fs.writeFileSync(segmentFile, lines.length ? `${lines.join('\n')}\n` : '', 'utf8')
  const stat = fs.statSync(segmentFile)
  const dimensions = vectorStore.stats?.dimensions || vectorStore.provider?.dimensions || vectors.find(row => row.vector?.length)?.vector?.length || localVectorDimensions
  const manifest = {
    version: 1,
    project_id: project.id,
    engine: 'karna-local-vector-db',
    storage: 'jsonl-segment',
    purpose: 'Durable local vector database for Writer OS RAG retrieval; vector_store.json is the API snapshot, this directory is the DB segment store.',
    provider: vectorStore.provider || { id: 'local-hash-vector', kind: 'local', model: 'local-hash-vector-384', dimensions },
    dimensions,
    vectors: vectors.length,
    chunks: (index.chunks || []).length,
    health: health || vectorHealthFor(index, vectorStore),
    segments: [{ rel: activeSegment.replace(/\\/g, '/'), rows: vectors.length, bytes: stat.size, sha1: fileHash(segmentFile) }],
    updated_at: now
  }
  writeJsonFile(writerProjectVectorDbManifestPath(project), manifest)
  return manifest
}
const writerProjectVectorProvider = (input = {}) => {
  const requested = String(input.provider || input.vector_provider || input.embedding_provider || '').trim().toLowerCase()
  const allowEmbedding = ['embedding', 'custom', 'api', 'auto'].includes(requested) || input.useEmbedding === true || input.use_embedding === true
  if (allowEmbedding) {
    const row = getEmbeddingModelRow(String(input.embedding_model_id || input.model_id || ''))
    if (row) return { id: `custom:${row.id}`, kind: 'embedding', model: row.model_name, dimensions: 0, row }
    if (requested && requested !== 'auto') throw new Error('No usable embedding model configured. Add an Embedding model in Model settings, or choose local vector provider.')
  }
  return { id: 'local-hash-vector', kind: 'local', model: 'local-hash-vector-384', dimensions: localVectorDimensions }
}
const embedWriterProjectTexts = async (texts, provider) => {
  if (provider.kind === 'embedding') {
    const result = await embedTexts(texts, provider.row?.id || provider.id || '')
    const vectors = result.vectors || []
    const dimensions = vectors.find(Array.isArray)?.length || 0
    return { vectors, provider: { id: result.model?.id ? `custom:${result.model.id}` : provider.id, kind: 'embedding', model: result.model?.model_name || provider.model, dimensions } }
  }
  return { vectors: texts.map(localHashVector), provider: { id: 'local-hash-vector', kind: 'local', model: 'local-hash-vector-384', dimensions: localVectorDimensions } }
}
const readWriterProjectRagIndexStore = project => {
  ensureWriterProjectMetadata(project)
  return readJsonFile(writerProjectRagIndexPath(project), { version: 1, project_id: project.id, chunks: [], stats: { chunks: 0, documents: 0, mode: 'lexical-local' }, updated_at: null })
}
const writeWriterProjectRagIndexStore = (project, store) => {
  const vectors = readWriterProjectVectorStore(project)
  const health = vectorHealthFor(store, vectors)
  const dims = vectors.stats?.dimensions || vectors.provider?.dimensions || localVectorDimensions
  const mode = health.ready ? `${vectors.provider?.kind === 'embedding' ? 'embedding' : 'local-vector'}+lexical` : 'lexical-local'
  const next = { ...store, version: 1, project_id: project.id, updated_at: new Date().toISOString(), stats: { chunks: store.chunks?.length || 0, documents: new Set((store.chunks || []).map(row => row.project_rel)).size, vectorized: health.current, vector_total: health.vectors, vector_dimensions: dims, vector_provider: vectors.provider?.id || vectors.stats?.mode || 'local-hash-vector', vector_model: vectors.provider?.model || '', vector_missing: health.missing, vector_stale: health.stale, vector_orphaned: health.orphaned, vector_coverage: health.coverage, mode } }
  writeJsonFile(writerProjectRagIndexPath(project), next)
  return next
}
const buildWriterProjectRagIndex = project => {
  const docs = readWriterProjectDocumentEngine(project.id)
  let nodes = docs.nodes || []
  if (!nodes.length) nodes = syncWriterProjectDocuments(project, { recordVersion: false }).nodes || []
  const chunks = nodes.map(node => {
    const text = [node.title, node.summary, node.text].filter(Boolean).join('\n')
    return { id: `rag_${textHash(`${node.id}:${text}`).slice(0, 12)}`, node_id: node.id, document_id: node.document_id, project_rel: node.project_rel, title: node.title, start_line: node.start_line, end_line: node.end_line, chars: node.chars, summary: node.summary || summarizeText(text, 220), text: String(node.text || node.summary || '').slice(0, 1800), terms: ragTermFreq(text) }
  })
  const index = writeWriterProjectRagIndexStore(project, { chunks })
  appendWriterProjectVersion(project, 'rag-index-build', `Built local RAG index with ${chunks.length} chunks`, { chunks: chunks.length })
  return { ok: true, project: enrichWriterProject(project), index, chunks: index.chunks, stats: index.stats, updated_at: index.updated_at }
}
const buildWriterProjectVectorStore = async (project, input = {}) => {
  let index = readWriterProjectRagIndexStore(project)
  if (!(index.chunks || []).length || input.rebuildIndex === true) index = buildWriterProjectRagIndex(project).index
  let provider = writerProjectVectorProvider(input)
  const texts = (index.chunks || []).map(ragChunkText)
  let embedded
  let fallback_reason = null
  try {
    embedded = await embedWriterProjectTexts(texts, provider)
  } catch (err) {
    if (input.fallbackLocal === false || input.fallback_local === false) throw err
    fallback_reason = err instanceof Error ? err.message : String(err)
    provider = writerProjectVectorProvider({ provider: 'local' })
    embedded = await embedWriterProjectTexts(texts, provider)
  }
  const vectors = (index.chunks || []).map((chunk, i) => ({ id: `vec_${chunk.id}`, chunk_id: chunk.id, node_id: chunk.node_id, document_id: chunk.document_id, project_rel: chunk.project_rel, title: chunk.title, start_line: chunk.start_line, end_line: chunk.end_line, vector: embedded.vectors[i] || [], text_hash: ragChunkHash(chunk), model: embedded.provider.model, provider: embedded.provider.id }))
  const health = vectorHealthFor(index, { vectors })
  const mode = embedded.provider.kind === 'embedding' ? 'embedding-vector' : 'local-hash-vector'
  const vectorStore = writeWriterProjectVectorStore(project, { mode, provider: embedded.provider, source_rag_updated_at: index.updated_at || null, fallback_reason, vectors, stats: { coverage: health.coverage, current: health.current, missing: health.missing, stale: health.stale, orphaned: health.orphaned, dimensions: embedded.provider.dimensions || vectors.find(row => row.vector?.length)?.vector?.length || localVectorDimensions } })
  const vectorDatabase = writeWriterProjectVectorDatabase(project, vectorStore, index, health)
  index = writeWriterProjectRagIndexStore(project, index)
  appendWriterProjectVersion(project, 'vector-store-build', `Built ${mode} store with ${vectors.length} vectors and refreshed local vector DB`, { vectors: vectors.length, dimensions: vectorStore.stats?.dimensions || 0, coverage: health.coverage, provider: embedded.provider.id, fallback_reason, vector_database: 'rag/vector_db/manifest.json' })
  return { ok: true, project: enrichWriterProject(project), index, vector_store: vectorStore, vector_database: vectorDatabase, vector_health: health, chunks: index.chunks || [], stats: { ...(index.stats || {}), vectorized: health.current, vector_total: vectors.length, vector_dimensions: vectorStore.stats?.dimensions || localVectorDimensions, vector_provider: embedded.provider.id, vector_model: embedded.provider.model, vector_coverage: health.coverage, mode: health.ready ? `${embedded.provider.kind === 'embedding' ? 'embedding' : 'local-vector'}+lexical` : 'lexical-local' }, updated_at: vectorStore.updated_at, fallback_reason }
}
const queryVectorForStore = async (query, vectorStore, input = {}) => {
  const provider = vectorStore.provider || { id: 'local-hash-vector', kind: 'local', model: 'local-hash-vector-384', dimensions: localVectorDimensions }
  if (provider.kind === 'embedding') {
    const result = await embedTexts([query], String(provider.id || '').replace(/^custom:/, ''))
    return { vector: result.vectors[0] || [], provider }
  }
  return { vector: localHashVector(query), provider }
}
const searchWriterProjectRag = async (project, input = {}) => {
  const query = String(input.query || input.q || '').trim()
  const limit = Math.max(1, Math.min(30, Number(input.limit || 8)))
  let index = readWriterProjectRagIndexStore(project)
  if (!(index.chunks || []).length && input.autoBuild !== false) index = buildWriterProjectRagIndex(project).index
  let vectorStore = readWriterProjectVectorStore(project)
  let health = vectorHealthFor(index, vectorStore)
  if ((!health.ready || !(vectorStore.vectors || []).length) && input.autoVector !== false) {
    const built = await buildWriterProjectVectorStore(project, input)
    vectorStore = built.vector_store
    index = built.index
    health = vectorHealthFor(index, vectorStore)
  }
  const chunkById = new Map((index.chunks || []).map(chunk => [chunk.id, chunk]))
  if (health.ready && (vectorStore.vectors || []).length && query) {
    try {
      const q = await queryVectorForStore(query, vectorStore, input)
      const dims = vectorStore.stats?.dimensions || q.vector.length || localVectorDimensions
      const retrievalMode = `${vectorStore.provider?.kind === 'embedding' ? 'embedding' : 'local-vector'}+lexical`
      const vectorRows = (vectorStore.vectors || []).map(row => {
        const chunk = chunkById.get(row.chunk_id) || {}
        const vectorScore = cosineSimilarity(q.vector, row.vector || [])
        const lexicalScore = ragTokenize(query).reduce((sum, token) => sum + (`${chunk.title || ''}\n${chunk.summary || ''}\n${chunk.text || ''}`.toLowerCase().includes(token) ? 0.05 : 0), 0)
        return { ...chunk, vector_id: row.id, score: Number((vectorScore + lexicalScore).toFixed(4)), score_detail: { vector: Number(vectorScore.toFixed(4)), lexical: Number(lexicalScore.toFixed(4)) }, retrieval: { mode: retrievalMode, vector_id: row.id, dimensions: dims, provider: vectorStore.provider?.id || 'local-hash-vector', model: vectorStore.provider?.model || '' } }
      }).sort((a, b) => b.score - a.score).slice(0, limit)
      return { ok: true, project: enrichWriterProject(project), query, results: vectorRows, stats: { ...(index.stats || {}), vectorized: health.current, vector_total: vectorStore.vectors.length, vector_dimensions: dims, vector_provider: vectorStore.provider?.id || 'local-hash-vector', vector_model: vectorStore.provider?.model || '', vector_coverage: health.coverage, mode: retrievalMode }, updated_at: vectorStore.updated_at || index.updated_at || null, mode: retrievalMode, vectorized: true, vector_health: health }
    } catch (err) {
      if (input.fallbackLocal === false || input.fallback_local === false) throw err
      const built = await buildWriterProjectVectorStore(project, { ...input, provider: 'local' })
      return searchWriterProjectRag(project, { ...input, autoVector: false, provider: 'local', fallbackLocal: false, _fallback_reason: err instanceof Error ? err.message : String(err) })
    }
  }
  const qTerms = ragTermFreq(query)
  const qKeys = Object.keys(qTerms)
  const results = (index.chunks || []).map(chunk => {
    const terms = chunk.terms || {}
    const score = qKeys.reduce((sum, token) => sum + (terms[token] || 0) * (1 + Math.log(1 + (qTerms[token] || 1))), 0)
    const hay = `${chunk.title || ''}\n${chunk.summary || ''}\n${chunk.text || ''}`.toLowerCase()
    const bonus = qKeys.reduce((sum, token) => sum + (hay.includes(token) ? 0.25 : 0), 0)
    return { ...chunk, score: Number((score + bonus).toFixed(4)), retrieval: { mode: 'lexical-local' } }
  }).filter(row => row.score > 0 || !query).sort((a, b) => b.score - a.score).slice(0, limit)
  return { ok: true, project: enrichWriterProject(project), query, results, stats: { ...(index.stats || {}), vectorized: health.current, vector_total: health.vectors, vector_dimensions: vectorStore.stats?.dimensions || localVectorDimensions, vector_provider: vectorStore.provider?.id || vectorStore.stats?.mode || 'local-hash-vector', vector_coverage: health.coverage, vector_missing: health.missing, vector_stale: health.stale, mode: 'lexical-local' }, updated_at: index.updated_at || null, mode: 'lexical-local', vectorized: false, vector_health: health }
}
const readWriterProjectRag = ref => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const index = readWriterProjectRagIndexStore(project)
  const vectorStore = readWriterProjectVectorStore(project)
  const contextStore = readWriterProjectRetrievalContextStore(project)
  const vectorDatabase = readWriterProjectVectorDatabase(project)
  const health = vectorHealthFor(index, vectorStore)
  const dims = vectorStore.stats?.dimensions || vectorStore.provider?.dimensions || localVectorDimensions
  const mode = health.ready ? `${vectorStore.provider?.kind === 'embedding' ? 'embedding' : 'local-vector'}+lexical` : (index.stats?.mode || 'lexical-local')
  return { ok: true, project: enrichWriterProject(project), index, vector_store: vectorStore, vector_database: vectorDatabase, vector_health: health, contexts: (contextStore.contexts || []).slice(0, 20), chunks: index.chunks || [], stats: { ...(index.stats || {}), vectorized: health.current, vector_total: health.vectors, vector_dimensions: dims, vector_provider: vectorStore.provider?.id || vectorStore.stats?.mode || 'local-hash-vector', vector_model: vectorStore.provider?.model || '', vector_coverage: health.coverage, vector_missing: health.missing, vector_stale: health.stale, vector_orphaned: health.orphaned, contexts: contextStore.contexts?.length || 0, mode }, updated_at: vectorStore.updated_at || index.updated_at || contextStore.updated_at || null }
}
const readWriterProjectRetrievalContextStore = project => {
  ensureWriterProjectMetadata(project)
  return readJsonFile(writerProjectRetrievalContextsPath(project), { version: 1, project_id: project.id, contexts: [], updated_at: null })
}
const writeWriterProjectRetrievalContextStore = (project, store) => {
  const next = { ...store, version: 1, project_id: project.id, contexts: (store.contexts || []).slice(0, 80), updated_at: new Date().toISOString() }
  writeJsonFile(writerProjectRetrievalContextsPath(project), next)
  return next
}
const citationMarkdown = citation => `[^${citation.id}]: ${citation.title || citation.source_rel || 'source'} — ${citation.source_rel || ''}:${citation.line_start || 1}-${citation.line_end || ''}; score ${Number(citation.score || 0).toFixed(3)}.`
const buildWriterProjectRagContext = async (project, input = {}) => {
  const query = String(input.query || input.q || '').trim()
  if (!query) throw new Error('RAG context requires a query.')
  const limit = Math.max(1, Math.min(16, Number(input.limit || input.top_k || 6)))
  const maxChars = Math.max(1200, Math.min(24000, Number(input.max_chars || 8000)))
  const ragPolicy = String(input.rag_policy || input.ragPolicy || 'adaptive').toLowerCase()
  const initialLimit = ragPolicy === 'adaptive' ? Math.min(3, limit) : limit
  let search = await searchWriterProjectRag(project, { ...input, query, limit: initialLimit })
  let retrievalStages = 1
  const firstScore = Number(search.results?.[0]?.score || 0)
  const confidenceThreshold = Number(input.confidence_threshold || input.confidenceThreshold || 0.18)
  if (
    ragPolicy === 'adaptive'
    && limit > initialLimit
    && ((search.results || []).length < Math.min(2, initialLimit) || firstScore < confidenceThreshold)
  ) {
    search = await searchWriterProjectRag(project, { ...input, query, limit })
    retrievalStages = 2
  }
  const results = search.results || []
  let usedChars = 0
  const citations = []
  const evidence_blocks = []
  for (const row of results) {
    const raw = String(row.text || row.summary || '').trim()
    if (!raw) continue
    const remaining = maxChars - usedChars
    if (remaining <= 0) break
    const excerpt = raw.slice(0, Math.min(raw.length, remaining, 1800))
    usedChars += excerpt.length
    const id = `C${citations.length + 1}`
    const citation = {
      id,
      chunk_id: row.id,
      vector_id: row.vector_id || row.retrieval?.vector_id || null,
      title: row.title || row.project_rel || '',
      source_rel: row.project_rel || '',
      line_start: row.start_line || 1,
      line_end: row.end_line || row.start_line || 1,
      score: row.score || 0,
      score_detail: row.score_detail || null,
      retrieval: row.retrieval || { mode: search.mode || 'lexical-local' },
      excerpt
    }
    citations.push(citation)
    evidence_blocks.push(`### [${id}] ${citation.title}\nSource: ${citation.source_rel}:${citation.line_start}-${citation.line_end}\nScore: ${Number(citation.score || 0).toFixed(3)} · Mode: ${citation.retrieval?.mode || search.mode || 'unknown'}\n\n${excerpt}`)
  }
  const prompt_context = [
    `# RAG Context Pack`,
    ``,
    `Question: ${query}`,
    `Project: ${project.title}`,
    `Retrieval mode: ${search.mode || search.stats?.mode || 'unknown'}`,
    `Vector provider: ${search.stats?.vector_provider || 'local-hash-vector'}`,
    ``,
    `Use the evidence below as project-grounded context. When making factual claims about the manuscript/canon, cite the bracketed citation id such as [C1]. If evidence is missing, say it is not found in the current project index.`,
    ``,
    `## Evidence`,
    evidence_blocks.join('\n\n'),
    ``,
    `## Citation notes`,
    ...citations.map(citationMarkdown)
  ].join('\n')
  const context = {
    id: `ctx_${Date.now()}_${textHash(`${project.id}:${query}:${usedChars}`).slice(0, 8)}`,
    project_id: project.id,
    query,
    created_at: new Date().toISOString(),
    mode: search.mode || search.stats?.mode || 'unknown',
    provider: search.stats?.vector_provider || 'local-hash-vector',
    model: search.stats?.vector_model || '',
    citations,
    prompt_context,
    stats: { citations: citations.length, chars: prompt_context.length, estimated_tokens: Math.ceil(prompt_context.length / 4), source_results: results.length, max_chars: maxChars, rag_policy: ragPolicy, retrieval_stages: retrievalStages, initial_limit: initialLimit, final_limit: retrievalStages === 2 ? limit : initialLimit }
  }
  const store = readWriterProjectRetrievalContextStore(project)
  const next = writeWriterProjectRetrievalContextStore(project, { ...store, contexts: [context, ...(store.contexts || [])] })
  appendWriterProjectVersion(project, 'rag-context-pack', `Assembled RAG context with ${citations.length} citations`, { context_id: context.id, query, citations: citations.length })
  return { ok: true, project: enrichWriterProject(project), context, contexts: next.contexts, results, search, updated_at: next.updated_at }
}
const handleWriterProjectRag = async (ref, body = {}) => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const action = String(body.action || '').toLowerCase()
  if (action === 'search') return searchWriterProjectRag(project, body)
  if (action === 'context' || action === 'context-pack' || action === 'assemble-context') return buildWriterProjectRagContext(project, body)
  if (action === 'vectorize' || action === 'build-vector' || action === 'vector') return buildWriterProjectVectorStore(project, body || {})
  if (action === 'verify-vector-db' || action === 'verify-vector' || action === 'vector-db-verify') return verifyWriterProjectVectorDatabase(project, body || {})
  return buildWriterProjectRagIndex(project)
}

  return {
    writerProjectRagIndexPath,
    writerProjectVectorStorePath,
    writerProjectVectorDbDir,
    writerProjectVectorDbManifestPath,
    writerProjectRetrievalContextsPath,
    readWriterProjectVectorStore,
    writeWriterProjectVectorStore,
    readWriterProjectVectorDatabase,
    verifyWriterProjectVectorDatabase,
    writeWriterProjectVectorDatabase,
    writerProjectVectorProvider,
    embedWriterProjectTexts,
    readWriterProjectRagIndexStore,
    writeWriterProjectRagIndexStore,
    buildWriterProjectRagIndex,
    buildWriterProjectVectorStore,
    queryVectorForStore,
    searchWriterProjectRag,
    readWriterProjectRag,
    readWriterProjectRetrievalContextStore,
    writeWriterProjectRetrievalContextStore,
    buildWriterProjectRagContext,
    handleWriterProjectRag
  }
}

module.exports = { createWriterRagService }
