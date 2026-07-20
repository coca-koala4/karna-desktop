'use strict'

const INDEX_META_FILE = 'index_meta.json'
const INDEX_HEALTHY = 'healthy'
const INDEX_DEGRADED = 'degraded'
const INDEX_CORRUPT = 'corrupt'
const INDEX_REBUILDING = 'rebuilding'
const SINGLE_DOC_TIMEOUT_MS = 30_000

function createKnowledgeService({ fs, path, karnaPaths, storage }) {
  const knowledgeBaseFile = () => path.join(karnaPaths.dataRoot, 'knowledge_base.json')
  const indexDir = () => path.join(karnaPaths.dataRoot, 'knowledge-index')
  const indexMetaFile = () => path.join(indexDir(), INDEX_META_FILE)

  function readIndexMeta() {
    try {
      return storage.readJsonFile(indexMetaFile(), { libraries: {}, globalStats: { totalDocs: 0, totalLibraries: 0, lastOptimizedAt: null, created_at: null } })
    } catch {
      return { libraries: {}, globalStats: { totalDocs: 0, totalLibraries: 0, lastOptimizedAt: null, created_at: null } }
    }
  }

  function writeIndexMeta(meta) {
    storage.writeJsonFile(indexMetaFile(), meta)
  }

  function libraryIndexDir(libraryId) {
    return path.join(indexDir(), libraryId)
  }

  function libraryDocsFile(libraryId) {
    return path.join(libraryIndexDir(libraryId), 'documents.json')
  }

  function listLibraries() {
    try {
      const data = storage.readJsonFile(knowledgeBaseFile(), { libraries: [] })
      return data.libraries || []
    } catch {
      return []
    }
  }

  function getLibrary(id) {
    const libraries = listLibraries()
    return libraries.find(lib => lib.id === id) || null
  }

  function getIndexStatus(libraryId) {
    const meta = readIndexMeta()
    const lib = getLibrary(libraryId)
    if (!lib) {
      return {
        libraryId,
        exists: false,
        docCount: 0,
        progress: 0,
        lastUpdatedAt: null,
        health: INDEX_CORRUPT,
        errors: ['Library not found']
      }
    }
    const libMeta = meta.libraries[libraryId] || { docCount: 0, lastUpdatedAt: null, health: INDEX_DEGRADED, errors: [] }
    const totalDocs = lib.documents?.length || 0
    const indexedDocs = libMeta.docCount || 0
    const progress = totalDocs > 0 ? Math.min(100, Math.round((indexedDocs / totalDocs) * 100)) : 0
    return {
      libraryId,
      exists: true,
      docCount: indexedDocs,
      totalDocs,
      progress,
      lastUpdatedAt: libMeta.lastUpdatedAt || null,
      health: libMeta.health || (indexedDocs === totalDocs ? INDEX_HEALTHY : INDEX_DEGRADED),
      errors: libMeta.errors || []
    }
  }

  async function reindexLibrary(libraryId, onProgress) {
    const lib = getLibrary(libraryId)
    if (!lib) {
      throw new Error(`Library not found: ${libraryId}`)
    }
    const meta = readIndexMeta()
    const libDir = libraryIndexDir(libraryId)
    const backupDir = `${libDir}.backup-${Date.now()}`
    if (fs.existsSync(libDir)) {
      try {
        fs.renameSync(libDir, backupDir)
      } catch {
      }
    }
    fs.mkdirSync(libDir, { recursive: true })
    const documents = lib.documents || []
    const errors = []
    let indexedCount = 0
    meta.libraries[libraryId] = {
      docCount: 0,
      lastUpdatedAt: new Date().toISOString(),
      health: INDEX_REBUILDING,
      errors: []
    }
    writeIndexMeta(meta)
    if (onProgress) {
      onProgress({ libraryId, current: 0, total: documents.length, percent: 0 })
    }
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i]
      try {
        const result = await withTimeout(indexDocument(doc), SINGLE_DOC_TIMEOUT_MS, `Document ${doc.id} indexing timed out`)
        indexedCount++
      } catch (err) {
        errors.push({ docId: doc.id, error: err.message || String(err) })
      }
      meta.libraries[libraryId].docCount = indexedCount
      meta.libraries[libraryId].lastUpdatedAt = new Date().toISOString()
      writeIndexMeta(meta)
      if (onProgress) {
        onProgress({
          libraryId,
          current: i + 1,
          total: documents.length,
          percent: Math.round(((i + 1) / documents.length) * 100),
          docId: doc.id
        })
      }
    }
    const docsFile = libraryDocsFile(libraryId)
    storage.writeJsonFile(docsFile, { documents: documents.slice(0, indexedCount), indexedAt: new Date().toISOString() })
    const health = errors.length === 0 ? INDEX_HEALTHY : INDEX_DEGRADED
    meta.libraries[libraryId].health = health
    meta.libraries[libraryId].errors = errors
    meta.libraries[libraryId].lastUpdatedAt = new Date().toISOString()
    meta.globalStats.totalLibraries = Object.keys(meta.libraries).length
    meta.globalStats.totalDocs = Object.values(meta.libraries).reduce((sum, l) => sum + (l.docCount || 0), 0)
    writeIndexMeta(meta)
    if (fs.existsSync(backupDir)) {
      try {
        fs.rmSync(backupDir, { recursive: true, force: true })
      } catch {
      }
    }
    return {
      libraryId,
      docCount: indexedCount,
      total: documents.length,
      errors,
      health,
      completedAt: new Date().toISOString()
    }
  }

  async function indexDocument(doc) {
    return { id: doc.id, indexed: true, indexedAt: new Date().toISOString() }
  }

  function withTimeout(promise, ms, timeoutMessage) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(timeoutMessage || 'Operation timed out')), ms))
    ])
  }

  function validateIndex(libraryId) {
    const lib = getLibrary(libraryId)
    if (!lib) {
      return { valid: false, errors: ['Library not found'], warnings: [] }
    }
    const meta = readIndexMeta()
    const libMeta = meta.libraries[libraryId]
    const errors = []
    const warnings = []
    if (!libMeta) {
      errors.push('No index metadata found')
      return { valid: false, errors, warnings }
    }
    const libDir = libraryIndexDir(libraryId)
    if (!fs.existsSync(libDir)) {
      errors.push('Index directory missing')
    }
    const docsFile = libraryDocsFile(libraryId)
    let indexedDocs = []
    if (fs.existsSync(docsFile)) {
      try {
        const data = storage.readJsonFile(docsFile, { documents: [] })
        indexedDocs = data.documents || []
      } catch (err) {
        errors.push(`Documents file corrupt: ${err.message}`)
      }
    } else {
      warnings.push('Documents index file not found')
    }
    const sourceDocs = lib.documents || []
    if (indexedDocs.length !== libMeta.docCount) {
      errors.push(`Index meta doc count (${libMeta.docCount}) doesn't match actual indexed docs (${indexedDocs.length})`)
    }
    const sourceIds = new Set(sourceDocs.map(d => d.id))
    const indexedIds = new Set(indexedDocs.map(d => d.id))
    const missing = [...sourceIds].filter(id => !indexedIds.has(id))
    const extra = [...indexedIds].filter(id => !sourceIds.has(id))
    if (missing.length) {
      warnings.push(`${missing.length} source documents not in index`)
    }
    if (extra.length) {
      warnings.push(`${extra.length} indexed documents not in source`)
    }
    const valid = errors.length === 0
    return {
      valid,
      health: valid ? (warnings.length === 0 ? INDEX_HEALTHY : INDEX_DEGRADED) : INDEX_CORRUPT,
      errors,
      warnings,
      sourceDocCount: sourceDocs.length,
      indexedDocCount: indexedDocs.length,
      missingDocuments: missing.slice(0, 20),
      extraDocuments: extra.slice(0, 20)
    }
  }

  function optimizeIndex(libraryId) {
    const lib = getLibrary(libraryId)
    if (!lib) {
      throw new Error(`Library not found: ${libraryId}`)
    }
    const meta = readIndexMeta()
    const libMeta = meta.libraries[libraryId] || { docCount: 0, errors: [] }
    const docsFile = libraryDocsFile(libraryId)
    let documents = []
    if (fs.existsSync(docsFile)) {
      try {
        const data = storage.readJsonFile(docsFile, { documents: [] })
        documents = data.documents || []
      } catch {
        documents = []
      }
    }
    const seen = new Set()
    const deduped = []
    for (const doc of documents) {
      if (!seen.has(doc.id)) {
        seen.add(doc.id)
        deduped.push(doc)
      }
    }
    const removedCount = documents.length - deduped.length
    storage.writeJsonFile(docsFile, { documents: deduped, optimizedAt: new Date().toISOString() })
    meta.libraries[libraryId] = {
      ...libMeta,
      docCount: deduped.length,
      lastOptimizedAt: new Date().toISOString(),
      health: deduped.length > 0 ? INDEX_HEALTHY : INDEX_DEGRADED
    }
    meta.globalStats.totalDocs = Object.values(meta.libraries).reduce((sum, l) => sum + (l.docCount || 0), 0)
    meta.globalStats.lastOptimizedAt = new Date().toISOString()
    writeIndexMeta(meta)
    return {
      libraryId,
      beforeCount: documents.length,
      afterCount: deduped.length,
      duplicatesRemoved: removedCount,
      optimizedAt: new Date().toISOString()
    }
  }

  function getIndexStats() {
    const meta = readIndexMeta()
    const libraries = listLibraries()
    let totalDocs = 0
    let healthyCount = 0
    let degradedCount = 0
    let corruptCount = 0
    const libraryStats = libraries.map(lib => {
      const status = getIndexStatus(lib.id)
      totalDocs += status.docCount
      if (status.health === INDEX_HEALTHY) healthyCount++
      else if (status.health === INDEX_DEGRADED) degradedCount++
      else corruptCount++
      return {
        libraryId: lib.id,
        name: lib.name,
        docCount: status.docCount,
        health: status.health,
        lastUpdatedAt: status.lastUpdatedAt
      }
    })
    return {
      totalLibraries: libraries.length,
      totalIndexedDocuments: totalDocs,
      health: {
        healthy: healthyCount,
        degraded: degradedCount,
        corrupt: corruptCount
      },
      lastOptimizedAt: meta.globalStats.lastOptimizedAt || null,
      libraries: libraryStats
    }
  }

  function getGlobalIndexStatus() {
    const libraries = listLibraries()
    const total = libraries.length
    const indexed = libraries.filter(lib => lib.vectorized || lib.indexed).length
    return {
      total,
      indexed,
      lastIndexed: null
    }
  }

  return {
    listLibraries,
    getLibrary,
    getIndexStatus: getIndexStatus,
    reindexLibrary,
    validateIndex,
    optimizeIndex,
    getIndexStats
  }
}

module.exports = { createKnowledgeService, INDEX_HEALTHY, INDEX_DEGRADED, INDEX_CORRUPT, INDEX_REBUILDING }
