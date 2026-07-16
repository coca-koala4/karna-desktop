const path = require('path')
const fs = require('fs')

const WRITER_MODULES = [
  'files',
  'documents',
  'bible',
  'wiki',
  'graph',
  'rag',
  'narrative_state',
  'creative_memory',
  'critic_council',
  'artifacts',
  'search',
  'delivery'
]

const MODULE_DEPENDENCIES = {
  files: [],
  documents: ['files'],
  bible: ['files'],
  wiki: ['bible'],
  graph: ['bible', 'wiki'],
  rag: ['documents'],
  narrative_state: ['graph', 'bible'],
  creative_memory: ['wiki', 'graph'],
  critic_council: ['bible', 'narrative_state'],
  artifacts: ['files', 'workflow'],
  search: ['rag', 'graph'],
  delivery: ['bible', 'wiki', 'graph', 'rag', 'artifacts', 'critic_council']
}

const writerProjectModuleStatusPath = project =>
  path.join(project.folder, '.writer-os', 'module-status.json')

const readModuleStatusStore = project => {
  const filePath = writerProjectModuleStatusPath(project)
  const defaults = {
    schemaVersion: 1,
    project_id: project.id,
    project_revision: 0,
    modules: {},
    build_queue: [],
    active_builds: [],
    updated_at: null
  }
  if (!fs.existsSync(filePath)) return defaults
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return { ...defaults, ...raw }
  } catch {
    return defaults
  }
}

const writeModuleStatusStore = (project, status) => {
  const filePath = writerProjectModuleStatusPath(project)
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const next = {
    ...status,
    schemaVersion: 1,
    project_id: project.id,
    updated_at: new Date().toISOString()
  }
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), 'utf8')
  return next
}

const initModuleStatus = project => {
  const store = readModuleStatusStore(project)
  const now = new Date().toISOString()
  let changed = false
  for (const moduleId of WRITER_MODULES) {
    if (!store.modules[moduleId]) {
      store.modules[moduleId] = {
        module: moduleId,
        revision: 0,
        source_revision: 0,
        status: 'missing',
        updated_at: null,
        stale_since: null,
        stale_reasons: [],
        last_build_id: null,
        last_error: null
      }
      changed = true
    }
  }
  if (changed) {
    store.updated_at = now
    return writeModuleStatusStore(project, store)
  }
  return store
}

const getDownstreamModules = moduleId => {
  const downstream = []
  for (const [mod, deps] of Object.entries(MODULE_DEPENDENCIES)) {
    if (deps.includes(moduleId)) downstream.push(mod)
  }
  return downstream
}

const markModuleStale = (project, moduleId, reason = '') => {
  const store = initModuleStatus(project)
  const module = store.modules[moduleId]
  if (!module) return store
  if (module.status === 'building') return store
  const now = new Date().toISOString()
  module.status = 'stale'
  module.stale_since = module.stale_since || now
  if (reason && !module.stale_reasons.includes(reason)) {
    module.stale_reasons.push(reason)
  }
  return writeModuleStatusStore(project, store)
}

const propagateStale = (project, sourceModule, reason = '') => {
  const store = initModuleStatus(project)
  const visited = new Set()
  const queue = [sourceModule]
  const now = new Date().toISOString()
  while (queue.length) {
    const current = queue.shift()
    if (visited.has(current)) continue
    visited.add(current)
    const mod = store.modules[current]
    if (mod && mod.status !== 'building') {
      mod.status = 'stale'
      mod.stale_since = mod.stale_since || now
      if (reason && !mod.stale_reasons.includes(reason)) {
        mod.stale_reasons.push(reason)
      }
    }
    const downstream = getDownstreamModules(current)
    for (const next of downstream) {
      if (!visited.has(next)) queue.push(next)
    }
  }
  return writeModuleStatusStore(project, store)
}

const markModuleBuilding = (project, moduleId, buildId) => {
  const store = initModuleStatus(project)
  const module = store.modules[moduleId]
  if (!module) return store
  module.status = 'building'
  module.last_build_id = buildId
  module.last_error = null
  return writeModuleStatusStore(project, store)
}

const markModuleReady = (project, moduleId, buildId, sourceRevision) => {
  const store = initModuleStatus(project)
  const module = store.modules[moduleId]
  if (!module) return store
  const now = new Date().toISOString()
  module.status = 'ready'
  module.revision = (module.revision || 0) + 1
  module.source_revision = sourceRevision || store.project_revision || 0
  module.updated_at = now
  module.stale_since = null
  module.stale_reasons = []
  module.last_build_id = buildId
  module.last_error = null
  return writeModuleStatusStore(project, store)
}

const markModuleFailed = (project, moduleId, buildId, error) => {
  const store = initModuleStatus(project)
  const module = store.modules[moduleId]
  if (!module) return store
  module.status = 'failed'
  module.last_build_id = buildId
  module.last_error = {
    code: error?.code || 'BUILD_FAILED',
    message: error?.message || String(error),
    at: new Date().toISOString()
  }
  return writeModuleStatusStore(project, store)
}

const incrementProjectRevision = (project, reason = '') => {
  const store = initModuleStatus(project)
  store.project_revision = (store.project_revision || 0) + 1
  return writeModuleStatusStore(project, store)
}

const getModuleStatus = (project, moduleId) => {
  const store = initModuleStatus(project)
  return store.modules[moduleId] || null
}

const getAllModuleStatuses = project => {
  const store = initModuleStatus(project)
  return {
    project_revision: store.project_revision,
    modules: store.modules,
    build_queue: store.build_queue,
    active_builds: store.active_builds,
    updated_at: store.updated_at
  }
}

const getStaleModules = project => {
  const store = initModuleStatus(project)
  return Object.entries(store.modules)
    .filter(([_, mod]) => mod.status === 'stale')
    .map(([id, mod]) => ({ module: id, ...mod }))
}

module.exports = {
  WRITER_MODULES,
  MODULE_DEPENDENCIES,
  writerProjectModuleStatusPath,
  readModuleStatusStore,
  writeModuleStatusStore,
  initModuleStatus,
  getDownstreamModules,
  markModuleStale,
  propagateStale,
  markModuleBuilding,
  markModuleReady,
  markModuleFailed,
  incrementProjectRevision,
  getModuleStatus,
  getAllModuleStatuses,
  getStaleModules
}
