'use strict'

const DEFAULT_LOCAL_VECTOR_DIMENSIONS = 384

function createWriterVectorUtils({ textHash, dimensions = DEFAULT_LOCAL_VECTOR_DIMENSIONS } = {}) {
  if (typeof textHash !== 'function') throw new Error('createWriterVectorUtils requires textHash(text).')

  const ragTokenize = text => String(text || '').toLowerCase().match(/[a-z0-9_]{2,}|[\u4e00-\u9fff]{1,4}/g) || []
  const ragTermFreq = text => ragTokenize(text).reduce((acc, token) => { acc[token] = (acc[token] || 0) + 1; return acc }, {})
  const ragChunkText = chunk => [chunk.title, chunk.summary, chunk.text].filter(Boolean).join('\n')
  const ragChunkHash = chunk => textHash(ragChunkText(chunk))

  const localHashVector = text => {
    const vec = new Array(dimensions).fill(0)
    for (const token of ragTokenize(text)) {
      const h = parseInt(textHash(token).slice(0, 8), 16)
      const idx = h % dimensions
      const sign = (h & 1) ? 1 : -1
      vec[idx] += sign * (1 + Math.log(1 + token.length))
    }
    const norm = Math.sqrt(vec.reduce((sum, x) => sum + x * x, 0)) || 1
    return vec.map(x => Number((x / norm).toFixed(6)))
  }

  const vectorHealthFor = (index = {}, vectorStore = {}) => {
    const chunks = index.chunks || []
    const vectors = vectorStore.vectors || []
    const byChunk = new Map(vectors.map(row => [row.chunk_id, row]))
    const chunkIds = new Set(chunks.map(chunk => chunk.id))
    let missing = 0
    let stale = 0
    for (const chunk of chunks) {
      const row = byChunk.get(chunk.id)
      if (!row) { missing += 1; continue }
      if (row.text_hash && row.text_hash !== ragChunkHash(chunk)) stale += 1
    }
    const orphaned = vectors.filter(row => !chunkIds.has(row.chunk_id)).length
    const current = Math.max(0, chunks.length - missing - stale)
    const coverage = chunks.length ? Number((current / chunks.length).toFixed(3)) : 0
    return { chunks: chunks.length, vectors: vectors.length, current, missing, stale, orphaned, coverage, ready: chunks.length > 0 && current === chunks.length && orphaned === 0 }
  }

  return { localVectorDimensions: dimensions, ragTokenize, ragTermFreq, ragChunkText, ragChunkHash, localHashVector, vectorHealthFor }
}

module.exports = { DEFAULT_LOCAL_VECTOR_DIMENSIONS, createWriterVectorUtils }
