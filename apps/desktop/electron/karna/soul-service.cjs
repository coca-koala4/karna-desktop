/* eslint-disable no-unused-vars -- service factory signature is intentionally uniform. */
'use strict'

function createSoulService({ fs, path, karnaPaths, storage }) {
  const soulWorkshopFile = () => path.join(karnaPaths.dataRoot, 'soul_workshop.json')

  function listAuthors() {
    try {
      const data = storage.readJsonFile(soulWorkshopFile(), { authors: [] })
      return data.authors || []
    } catch {
      return []
    }
  }

  function getAuthor(id) {
    const authors = listAuthors()
    return authors.find(a => a.id === id) || null
  }

  function getRiskProfile(authorId) {
    return {
      level: 'low',
      checks: []
    }
  }

  return { listAuthors, getAuthor, getRiskProfile }
}

module.exports = { createSoulService }
