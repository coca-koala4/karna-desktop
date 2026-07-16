'use strict'

function createKnowledgeService({ path, karnaPaths, storage }) {
  const knowledgeBaseFile = () => path.join(karnaPaths.dataRoot, 'knowledge_base.json')

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

  function getIndexStatus() {
    const libraries = listLibraries()
    const total = libraries.length
    const indexed = libraries.filter(lib => lib.vectorized || lib.indexed).length
    return {
      total,
      indexed,
      lastIndexed: null
    }
  }

  return { listLibraries, getLibrary, getIndexStatus }
}

module.exports = { createKnowledgeService }
