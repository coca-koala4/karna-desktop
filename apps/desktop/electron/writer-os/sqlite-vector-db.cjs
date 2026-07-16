/* eslint-disable no-unused-vars, no-empty, no-control-regex, no-useless-escape, no-undef */
'use strict'

const SCHEMA_VERSION = 1

function createSqliteVectorDbModule(deps) {
  const { fs, path, initSqlJs, textHash } = deps

  let sqlJsReady = null
  const getSqlJs = () => {
    if (sqlJsReady) return sqlJsReady
    sqlJsReady = initSqlJs().catch(err => {
      sqlJsReady = null
      throw err
    })
    return sqlJsReady
  }

  const ensureDirForFile = filePath => {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  }

  const isPathWithin = (candidate, root) => {
    const resolvedCandidate = path.resolve(String(candidate || ''))
    const resolvedRoot = path.resolve(String(root || ''))
    const rel = path.relative(resolvedRoot, resolvedCandidate)
    return rel === '' || (rel && !rel.startsWith('..') && !path.isAbsolute(rel))
  }

  const openDatabase = async dbPath => {
    const SQL = await getSqlJs()
    ensureDirForFile(dbPath)
    let db
    if (fs.existsSync(dbPath)) {
      const buf = fs.readFileSync(dbPath)
      db = new SQL.Database(new Uint8Array(buf))
    } else {
      db = new SQL.Database()
    }
    runMigrations(db)
    return db
  }

  const saveDatabase = (db, dbPath) => {
    ensureDirForFile(dbPath)
    const data = db.export()
    fs.writeFileSync(dbPath, Buffer.from(data))
  }

  const runMigrations = db => {
    db.run(`CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )`)

    const currentVersion = db.exec("SELECT MAX(version) as v FROM _migrations")[0]?.values?.[0]?.[0] || 0

    if (currentVersion < 1) {
      db.run(`CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        dimensions INTEGER NOT NULL DEFAULT 384,
        vector_provider TEXT,
        vector_model TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`)

      db.run(`CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        collection_id TEXT NOT NULL,
        chunk_id TEXT,
        node_id TEXT,
        document_id TEXT,
        project_rel TEXT,
        path TEXT,
        title TEXT,
        start_line INTEGER,
        end_line INTEGER,
        chars INTEGER,
        summary TEXT,
        text TEXT,
        text_hash TEXT,
        terms TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
      )`)

      db.run(`CREATE TABLE IF NOT EXISTS vectors (
        id TEXT PRIMARY KEY,
        chunk_id TEXT NOT NULL,
        collection_id TEXT NOT NULL,
        provider TEXT,
        model TEXT,
        dimensions INTEGER NOT NULL,
        vector BLOB NOT NULL,
        text_hash TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE,
        FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE
      )`)

      db.run(`CREATE INDEX IF NOT EXISTS idx_chunks_collection ON chunks(collection_id)`)
      db.run(`CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id)`)
      db.run(`CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path)`)
      db.run(`CREATE INDEX IF NOT EXISTS idx_chunks_text_hash ON chunks(text_hash)`)
      db.run(`CREATE INDEX IF NOT EXISTS idx_vectors_chunk ON vectors(chunk_id)`)
      db.run(`CREATE INDEX IF NOT EXISTS idx_vectors_collection ON vectors(collection_id)`)
      db.run(`CREATE INDEX IF NOT EXISTS idx_vectors_text_hash ON vectors(text_hash)`)

      db.run("INSERT INTO _migrations (version, applied_at) VALUES (?, ?)", [1, new Date().toISOString()])
    }
  }

  const vectorToBlob = vector => {
    const arr = new Float32Array(vector)
    return Buffer.from(arr.buffer)
  }

  const blobToVector = blob => {
    if (!blob) return null
    const arr = new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4)
    return Array.from(arr)
  }

  const cosineSimilarity = (a, b) => {
    if (!a || !b || a.length !== b.length) return 0
    let dot = 0, na = 0, nb = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      na += a[i] * a[i]
      nb += b[i] * b[i]
    }
    return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
  }

  const getCollection = (db, collectionId) => {
    const result = db.exec("SELECT * FROM collections WHERE id = ?", [collectionId])
    if (!result.length || !result[0].values.length) return null
    const row = result[0].values[0]
    const cols = result[0].columns
    const obj = {}
    cols.forEach((col, i) => { obj[col] = row[i] })
    if (obj.metadata) obj.metadata = JSON.parse(obj.metadata)
    return obj
  }

  const createCollection = (db, { id, name, dimensions = 384, vectorProvider = null, vectorModel = null, metadata = null }) => {
    const now = new Date().toISOString()
    const existing = getCollection(db, id)
    if (existing) return existing
    db.run(
      "INSERT INTO collections (id, name, dimensions, vector_provider, vector_model, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [id, name, dimensions, vectorProvider, vectorModel, metadata ? JSON.stringify(metadata) : null, now, now]
    )
    return getCollection(db, id)
  }

  const upsertChunk = (db, { id, collectionId, chunkId = null, nodeId = null, documentId = null, projectRel = null, path = null, title = null, startLine = null, endLine = null, chars = null, summary = null, text = null, textHash = null, terms = null }) => {
    const now = new Date().toISOString()
    const existing = db.exec("SELECT id FROM chunks WHERE id = ?", [id])
    if (existing.length && existing[0].values.length) {
      db.run(
        `UPDATE chunks SET collection_id = ?, chunk_id = ?, node_id = ?, document_id = ?, project_rel = ?, path = ?, title = ?, start_line = ?, end_line = ?, chars = ?, summary = ?, text = ?, text_hash = ?, terms = ?, updated_at = ? WHERE id = ?`,
        [collectionId, chunkId, nodeId, documentId, projectRel, path, title, startLine, endLine, chars, summary, text, textHash, terms ? JSON.stringify(terms) : null, now, id]
      )
    } else {
      db.run(
        `INSERT INTO chunks (id, collection_id, chunk_id, node_id, document_id, project_rel, path, title, start_line, end_line, chars, summary, text, text_hash, terms, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, collectionId, chunkId, nodeId, documentId, projectRel, path, title, startLine, endLine, chars, summary, text, textHash, terms ? JSON.stringify(terms) : null, now, now]
      )
    }
  }

  const upsertVector = (db, { id, chunkId, collectionId, provider = null, model = null, vector, textHash = null }) => {
    const now = new Date().toISOString()
    const dimensions = vector.length
    const blob = vectorToBlob(vector)
    const existing = db.exec("SELECT id FROM vectors WHERE id = ?", [id])
    if (existing.length && existing[0].values.length) {
      db.run(
        `UPDATE vectors SET chunk_id = ?, collection_id = ?, provider = ?, model = ?, dimensions = ?, vector = ?, text_hash = ?, updated_at = ? WHERE id = ?`,
        [chunkId, collectionId, provider, model, dimensions, blob, textHash, now, id]
      )
    } else {
      db.run(
        `INSERT INTO vectors (id, chunk_id, collection_id, provider, model, dimensions, vector, text_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, chunkId, collectionId, provider, model, dimensions, blob, textHash, now, now]
      )
    }
  }

  const deleteChunkAndVector = (db, chunkId) => {
    db.run("DELETE FROM vectors WHERE chunk_id = ?", [chunkId])
    db.run("DELETE FROM chunks WHERE id = ?", [chunkId])
  }

  const deleteCollection = (db, collectionId) => {
    db.run("DELETE FROM vectors WHERE collection_id = ?", [collectionId])
    db.run("DELETE FROM chunks WHERE collection_id = ?", [collectionId])
    db.run("DELETE FROM collections WHERE id = ?", [collectionId])
  }

  const getCollectionStats = (db, collectionId) => {
    const chunkCount = db.exec("SELECT COUNT(*) FROM chunks WHERE collection_id = ?", [collectionId])[0]?.values?.[0]?.[0] || 0
    const vectorCount = db.exec("SELECT COUNT(*) FROM vectors WHERE collection_id = ?", [collectionId])[0]?.values?.[0]?.[0] || 0
    const docCount = db.exec("SELECT COUNT(DISTINCT document_id) FROM chunks WHERE collection_id = ? AND document_id IS NOT NULL", [collectionId])[0]?.values?.[0]?.[0] || 0
    const collection = getCollection(db, collectionId)
    let missing = 0, stale = 0, orphaned = 0
    const chunks = db.exec("SELECT id, text_hash FROM chunks WHERE collection_id = ?", [collectionId])
    const vectors = db.exec("SELECT chunk_id, text_hash FROM vectors WHERE collection_id = ?", [collectionId])
    if (chunks.length && vectors.length) {
      const vecMap = new Map(vectors[0].values.map(row => [row[0], row[1]]))
      const chunkIds = new Set(chunks[0].values.map(row => row[0]))
      for (const [chunkId, hash] of chunks[0].values) {
        const vecHash = vecMap.get(chunkId)
        if (!vecHash) missing++
        else if (hash && vecHash !== hash) stale++
      }
      for (const [vecChunkId] of vectors[0].values) {
        if (!chunkIds.has(vecChunkId)) orphaned++
      }
    }
    const current = Math.max(0, chunkCount - missing - stale)
    const coverage = chunkCount ? Number((current / chunkCount).toFixed(3)) : 0
    return {
      id: collectionId,
      name: collection?.name || collectionId,
      dimensions: collection?.dimensions || 384,
      vector_provider: collection?.vector_provider || null,
      vector_model: collection?.vector_model || null,
      chunks: chunkCount,
      vectors: vectorCount,
      documents: docCount,
      current,
      missing,
      stale,
      orphaned,
      coverage,
      ready: chunkCount > 0 && current === chunkCount && orphaned === 0
    }
  }

  const updateCollectionMetadata = (db, collectionId, updates = {}) => {
    const collection = getCollection(db, collectionId)
    if (!collection) return null
    const next = {
      ...collection,
      dimensions: updates.dimensions ?? collection.dimensions,
      vector_provider: updates.vectorProvider ?? updates.vector_provider ?? collection.vector_provider,
      vector_model: updates.vectorModel ?? updates.vector_model ?? collection.vector_model,
      metadata: updates.metadata ?? collection.metadata,
      updated_at: new Date().toISOString()
    }
    db.run(
      "UPDATE collections SET dimensions = ?, vector_provider = ?, vector_model = ?, metadata = ?, updated_at = ? WHERE id = ?",
      [next.dimensions, next.vector_provider, next.vector_model, next.metadata ? JSON.stringify(next.metadata) : null, next.updated_at, collectionId]
    )
    return getCollection(db, collectionId)
  }

  const searchVectors = (db, { collectionId, queryVector, limit = 5, filter = {} }) => {
    const result = db.exec(`
      SELECT v.id, v.chunk_id, v.provider, v.model, v.text_hash, v.vector,
             c.id as c_id, c.chunk_id as c_chunk_id, c.node_id, c.document_id, c.project_rel, c.path, c.title, c.start_line, c.end_line, c.chars, c.summary, c.text
      FROM vectors v
      JOIN chunks c ON v.chunk_id = c.id
      WHERE v.collection_id = ?
    `, [collectionId])

    if (!result.length || !result[0].values.length) return []

    const cols = result[0].columns
    const rows = result[0].values.map(row => {
      const obj = {}
      cols.forEach((col, i) => { obj[col] = row[i] })
      obj.vector = blobToVector(obj.vector)
      obj.score = cosineSimilarity(queryVector, obj.vector)
      return obj
    })

    let filtered = rows
    if (filter.path) {
      const prefix = String(filter.path)
      filtered = filtered.filter(r => r.path && isPathWithin(r.path, prefix))
    }
    if (filter.documentId) {
      filtered = filtered.filter(r => r.document_id === filter.documentId)
    }
    if (filter.projectRel) {
      filtered = filtered.filter(r => r.project_rel === filter.projectRel)
    }

    return filtered
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, limit))
      .map(r => ({
        id: r.chunk_id,
        chunk_id: r.c_chunk_id,
        node_id: r.node_id,
        document_id: r.document_id,
        project_rel: r.project_rel,
        path: r.path,
        title: r.title,
        start_line: r.start_line,
        end_line: r.end_line,
        chars: r.chars,
        summary: r.summary,
        text: r.text,
        score: r.score,
        provider: r.provider,
        model: r.model
      }))
  }

  const lexicalSearch = (db, { collectionId, query, limit = 5, filter = {} }) => {
    const q = String(query || '').toLowerCase().match(/[a-z0-9_]{2,}|[\u4e00-\u9fff]{1,4}/g) || []
    if (!q.length) return []

    const result = db.exec(`
      SELECT id, chunk_id, node_id, document_id, project_rel, path, title, start_line, end_line, chars, summary, text, terms
      FROM chunks WHERE collection_id = ? AND text IS NOT NULL
    `, [collectionId])

    if (!result.length || !result[0].values.length) return []

    const cols = result[0].columns
    const rows = result[0].values.map(row => {
      const obj = {}
      cols.forEach((col, i) => { obj[col] = row[i] })
      if (obj.terms) {
        try { obj.terms = JSON.parse(obj.terms) } catch { obj.terms = {} }
      } else {
        obj.terms = {}
      }
      const text = String(obj.text || '').toLowerCase()
      let score = 0
      for (const token of q) {
        if (text.includes(token)) score += 1
      }
      obj.score = q.length ? score / q.length : 0
      return obj
    })

    let filtered = rows.filter(r => r.score > 0)
    if (filter.path) {
      const prefix = String(filter.path)
      filtered = filtered.filter(r => r.path && isPathWithin(r.path, prefix))
    }

    return filtered
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, limit))
      .map(r => ({ ...r, terms: undefined, score: r.score }))
  }

  const bulkUpsertChunksAndVectors = (db, { collectionId, items }) => {
    const createdChunks = []
    const createdVectors = []
    for (const item of items) {
      const chunkId = item.chunk.id
      upsertChunk(db, {
        id: chunkId,
        collectionId,
        chunkId: item.chunk.chunkId || null,
        nodeId: item.chunk.nodeId || null,
        documentId: item.chunk.documentId || null,
        projectRel: item.chunk.projectRel || null,
        path: item.chunk.path || null,
        title: item.chunk.title || null,
        startLine: item.chunk.startLine || null,
        endLine: item.chunk.endLine || null,
        chars: item.chunk.chars || null,
        summary: item.chunk.summary || null,
        text: item.chunk.text || null,
        textHash: item.chunk.textHash || null,
        terms: item.chunk.terms || null
      })
      createdChunks.push(chunkId)

      if (item.vector && Array.isArray(item.vector.vector)) {
        const vecId = item.vector.id || `vec_${chunkId}`
        upsertVector(db, {
          id: vecId,
          chunkId,
          collectionId,
          provider: item.vector.provider || null,
          model: item.vector.model || null,
          vector: item.vector.vector,
          textHash: item.vector.textHash || item.chunk.textHash || null
        })
        createdVectors.push(vecId)
      }
    }
    return { chunks: createdChunks.length, vectors: createdVectors.length }
  }

  const clearCollection = (db, collectionId) => {
    db.run("DELETE FROM vectors WHERE collection_id = ?", [collectionId])
    db.run("DELETE FROM chunks WHERE collection_id = ?", [collectionId])
  }

  const listCollections = db => {
    const result = db.exec("SELECT id FROM collections ORDER BY created_at")
    if (!result.length || !result[0].values.length) return []
    return result[0].values.map(row => getCollection(db, row[0]))
  }

  const migrateFromJsonStore = async (db, { collectionId, ragIndexJson, vectorStoreJson, dbPath }) => {
    const chunks = ragIndexJson?.chunks || []
    const vectors = vectorStoreJson?.vectors || []
    const provider = vectorStoreJson?.provider || { id: 'local-hash-vector', kind: 'local', model: 'local-hash-vector-384', dimensions: 384 }
    const dimensions = provider.dimensions || vectorStoreJson?.stats?.dimensions || 384

    createCollection(db, {
      id: collectionId,
      name: collectionId,
      dimensions,
      vectorProvider: provider.id,
      vectorModel: provider.model
    })

    const vecMap = new Map(vectors.map(v => [v.chunk_id, v]))

    const items = chunks.map(chunk => {
      const vec = vecMap.get(chunk.id)
      return {
        chunk: {
          id: chunk.id,
          chunkId: chunk.id,
          nodeId: chunk.node_id || null,
          documentId: chunk.document_id || null,
          projectRel: chunk.project_rel || null,
          path: chunk.path || null,
          title: chunk.title || null,
          startLine: chunk.start_line || null,
          endLine: chunk.end_line || null,
          chars: chunk.chars || null,
          summary: chunk.summary || null,
          text: chunk.text || null,
          textHash: chunk.text_hash || null,
          terms: chunk.terms || null
        },
        vector: vec ? {
          id: vec.id || `vec_${chunk.id}`,
          provider: vec.provider || provider.id,
          model: vec.model || provider.model,
          vector: vec.vector,
          textHash: vec.text_hash || chunk.text_hash || null
        } : null
      }
    })

    const result = bulkUpsertChunksAndVectors(db, { collectionId, items })
    if (dbPath) saveDatabase(db, dbPath)
    return result
  }

  return {
    SCHEMA_VERSION,
    openDatabase,
    saveDatabase,
    runMigrations,
    getCollection,
    createCollection,
    updateCollectionMetadata,
    upsertChunk,
    upsertVector,
    deleteChunkAndVector,
    deleteCollection,
    getCollectionStats,
    searchVectors,
    lexicalSearch,
    bulkUpsertChunksAndVectors,
    clearCollection,
    listCollections,
    migrateFromJsonStore,
    cosineSimilarity,
    vectorToBlob,
    blobToVector
  }
}

module.exports = { createSqliteVectorDbModule, SCHEMA_VERSION }
