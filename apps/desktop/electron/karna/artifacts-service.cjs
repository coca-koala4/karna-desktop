'use strict'

const DEFAULT_ARTIFACT_SETTINGS = Object.freeze({
  code_block: true,
  download_link: true,
  file: true,
  image: true,
  markdown: true
})

function createArtifactsService({ crypto, readJsonState, writeJsonState }) {
  const defaultStore = () => ({ version: 1, artifacts: [], settings: { ...DEFAULT_ARTIFACT_SETTINGS } })

  function readArtifacts() {
    const store = readJsonState('artifacts.json', defaultStore())

    return {
      ...store,
      version: 1,
      settings: { ...DEFAULT_ARTIFACT_SETTINGS, ...(store.settings || {}) },
      artifacts: Array.isArray(store.artifacts) ? store.artifacts : []
    }
  }

  function writeArtifacts(store) {
    return writeJsonState('artifacts.json', {
      version: 1,
      settings: { ...DEFAULT_ARTIFACT_SETTINGS, ...(store.settings || {}) },
      artifacts: Array.isArray(store.artifacts) ? store.artifacts : []
    })
  }

  function recordArtifact(artifact) {
    const store = readArtifacts()
    const now = new Date().toISOString()
    const row = {
      id: artifact.id || `art_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
      type: artifact.type || 'file',
      title: artifact.title || artifact.type || 'Artifact',
      url: artifact.url || null,
      content: artifact.content || null,
      created_at: artifact.created_at || now,
      updated_at: now,
      metadata: artifact.metadata || {}
    }

    writeArtifacts({ ...store, artifacts: [row, ...store.artifacts].slice(0, 500) })

    return row
  }

  function updateArtifactSettings(settings) {
    const store = readArtifacts()

    writeArtifacts({ ...store, settings: { ...store.settings, ...(settings || {}) } })

    return { ok: true, settings: { ...store.settings, ...(settings || {}) } }
  }

  function deleteArtifact(id) {
    const artifactId = String(id || '').trim()
    const store = readArtifacts()

    writeArtifacts({ ...store, artifacts: store.artifacts.filter(item => item.id !== artifactId) })

    return { ok: true, deleted: artifactId }
  }

  return { deleteArtifact, readArtifacts, recordArtifact, updateArtifactSettings, writeArtifacts }
}

module.exports = { DEFAULT_ARTIFACT_SETTINGS, createArtifactsService }
