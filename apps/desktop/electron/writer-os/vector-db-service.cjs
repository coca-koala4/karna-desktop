/* eslint-disable no-unused-vars, no-empty, no-control-regex, no-useless-escape, no-undef */
'use strict'

const path = require('node:path')
const fs = require('node:fs')
const { createSqliteVectorDbModule } = require('./sqlite-vector-db.cjs')
const { createWriterVectorUtils, DEFAULT_LOCAL_VECTOR_DIMENSIONS } = require('./vector-utils.cjs')

function createVectorDbService(deps) {
  const { karnaPaths, textHash } = deps
  const initSqlJs = require(path.join(deps.nodeModulesRoot || path.resolve(__dirname, '..', '..', '..'), 'node_modules', 'sql.js', 'dist', 'sql-asm.js'))

  const vectorUtils = createWriterVectorUtils({ textHash, dimensions: DEFAULT_LOCAL_VECTOR_DIMENSIONS })

  const sqlModule = createSqliteVectorDbModule({
    fs,
    path,
    initSqlJs,
    textHash
  })

  const dbCache = new Map()

  const knowledgeDbPath = () => path.join(karnaPaths.dataRoot(), 'knowledge.db')
  const projectDbPath = project => path.join(project.folder, 'rag', 'vectors.db')

  const getDb = async dbPath => {
    if (dbCache.has(dbPath)) return dbCache.get(dbPath)
    const db = await sqlModule.openDatabase(dbPath)
    dbCache.set(dbPath, db)
    return db
  }

  const saveDb = async dbPath => {
    const db = dbCache.get(dbPath)
    if (db) sqlModule.saveDatabase(db, dbPath)
  }

  const saveAll = () => {
    for (const [dbPath, db] of dbCache.entries()) {
      sqlModule.saveDatabase(db, dbPath)
    }
  }

  const getKnowledgeDb = () => getDb(knowledgeDbPath())
  const getProjectDb = project => getDb(projectDbPath(project))

  const saveKnowledgeDb = () => saveDb(knowledgeDbPath())
  const saveProjectDb = project => saveDb(projectDbPath(project))

  const closeDb = dbPath => {
    const db = dbCache.get(dbPath)
    if (db) {
      db.close()
      dbCache.delete(dbPath)
    }
  }

  const closeAll = () => {
    saveAll()
    for (const [dbPath, db] of dbCache.entries()) {
      db.close()
    }
    dbCache.clear()
  }

  return {
    ...sqlModule,
    ...vectorUtils,
    getDb,
    saveDb,
    saveAll,
    getKnowledgeDb,
    getProjectDb,
    saveKnowledgeDb,
    saveProjectDb,
    closeDb,
    closeAll,
    knowledgeDbPath,
    projectDbPath
  }
}

module.exports = { createVectorDbService }
