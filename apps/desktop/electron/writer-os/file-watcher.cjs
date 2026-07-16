const path = require('path')
const fs = require('fs')

const projectWatchers = new Map()
const projectDebounceTimers = new Map()
const projectPendingChanges = new Map()

const DEFAULT_IGNORE_PATTERNS = [
  /^\.git\b/,
  /\bnode_modules\b/,
  /^\.cache\b/,
  /\btmp\b/,
  /\blogs\b/,
  /exports\/writer-os-delivery-/,
  /\/exports\//,
  /artifacts\/artifacts\.json$/,
  /\bversions\b/,
  /vector_db/,
  /\.tmp$/,
  /\.temp$/,
  /\.swp$/,
  /~$/,
  /\.DS_Store$/,
  /\.writer-os\/module-status\.json$/,
  /knowledge_graph\.backup\./,
  /artifacts\.backup\./,
  /knowledge_graph\.v1\.backup\./
]

const WATCHED_EXTENSIONS = new Set([
  '.md', '.markdown', '.txt', '.json', '.docx', '.pdf',
  '.html', '.htm', '.csv', '.yaml', '.yml', '.toml'
])

const isPathIgnored = (relPath, baseDir) => {
  const cleanRel = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  if (!cleanRel) return true
  for (const pattern of DEFAULT_IGNORE_PATTERNS) {
    if (pattern.test(cleanRel)) return true
  }
  return false
}

const isWatchedFile = (filePath) => {
  const ext = path.extname(filePath).toLowerCase()
  return WATCHED_EXTENSIONS.has(ext) || !ext
}

const detectChangedModules = (relPath) => {
  const cleanRel = String(relPath || '').replace(/\\/g, '/').replace(/^\/+/, '')
  const modules = new Set(['files'])

  if (/^bible\//i.test(cleanRel) || /story_bible\.json$/i.test(cleanRel)) {
    modules.add('bible')
  }
  if (/^wiki\//i.test(cleanRel) || /living_wiki\.json$/i.test(cleanRel)) {
    modules.add('wiki')
  }
  if (/^graph\//i.test(cleanRel) || /knowledge_graph\.json$/i.test(cleanRel)) {
    modules.add('graph')
  }
  if (/^manuscript\//i.test(cleanRel) || /^documents\//i.test(cleanRel) || /canon\.md$/i.test(cleanRel)) {
    modules.add('documents')
  }
  if (/^narrative-state\//i.test(cleanRel) || /narrative_state\.json$/i.test(cleanRel)) {
    modules.add('narrative_state')
  }
  if (/^memory\//i.test(cleanRel) || /creative_memory\.json$/i.test(cleanRel)) {
    modules.add('creative_memory')
  }
  if (/^critics\//i.test(cleanRel) || /critic_council\.json$/i.test(cleanRel)) {
    modules.add('critic_council')
  }
  if (/^artifacts\//i.test(cleanRel) || /artifacts\.json$/i.test(cleanRel)) {
    modules.add('artifacts')
  }
  if (/\.docx$/i.test(cleanRel) || /\.pdf$/i.test(cleanRel)) {
    modules.add('documents')
  }

  return Array.from(modules)
}

const collectFilesRecursive = (dir, baseDir, results = []) => {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name)
      const relPath = path.relative(baseDir, fullPath)
      if (isPathIgnored(relPath, baseDir)) continue
      if (entry.isDirectory()) {
        collectFilesRecursive(fullPath, baseDir, results)
      } else if (entry.isFile() && isWatchedFile(fullPath)) {
        results.push({ path: fullPath, rel: relPath })
      }
    }
  } catch {}
  return results
}

const setupProjectWatcher = (project, onChange) => {
  if (!project || !project.folder) return null
  const projectId = project.id || project.workspace_id || project.folder

  if (projectWatchers.has(projectId)) {
    return projectWatchers.get(projectId)
  }

  if (!fs.existsSync(project.folder)) return null

  let watcher = null
  try {
    watcher = fs.watch(project.folder, { recursive: true }, (eventType, filename) => {
      if (!filename) return
      const filePath = path.join(project.folder, filename)
      const relPath = path.relative(project.folder, filePath)

      if (isPathIgnored(relPath, project.folder)) return
      if (!isWatchedFile(filePath)) return

      const changedModules = detectChangedModules(relPath)
      if (!projectPendingChanges.has(projectId)) {
        projectPendingChanges.set(projectId, { files: new Set(), modules: new Set() })
      }
      const pending = projectPendingChanges.get(projectId)
      pending.files.add(relPath)
      for (const mod of changedModules) pending.modules.add(mod)

      if (projectDebounceTimers.has(projectId)) {
        clearTimeout(projectDebounceTimers.get(projectId))
      }

      projectDebounceTimers.set(projectId, setTimeout(() => {
        projectDebounceTimers.delete(projectId)
        const changes = projectPendingChanges.get(projectId)
        projectPendingChanges.delete(projectId)
        if (changes && onChange) {
          try {
            onChange({
              project_id: projectId,
              workspace_id: project.workspace_id || '',
              files: Array.from(changes.files),
              modules: Array.from(changes.modules),
              timestamp: new Date().toISOString()
            })
          } catch (e) {
            console.warn('[file-watcher] onChange error:', e.message)
          }
        }
      }, 800))
    })

    const watcherInfo = {
      id: projectId,
      project,
      folder: project.folder,
      watcher,
      created_at: new Date().toISOString()
    }

    projectWatchers.set(projectId, watcherInfo)
    return watcherInfo
  } catch (err) {
    console.warn(`[file-watcher] Failed to setup watcher for ${project.folder}:`, err.message)
    return null
  }
}

const stopProjectWatcher = (projectId) => {
  const watcherInfo = projectWatchers.get(projectId)
  if (watcherInfo && watcherInfo.watcher) {
    try { watcherInfo.watcher.close() } catch {}
  }
  projectWatchers.delete(projectId)
  if (projectDebounceTimers.has(projectId)) {
    clearTimeout(projectDebounceTimers.get(projectId))
    projectDebounceTimers.delete(projectId)
  }
  projectPendingChanges.delete(projectId)
}

const getProjectWatcherStatus = (projectId) => {
  const watcherInfo = projectWatchers.get(projectId)
  if (!watcherInfo) return { active: false }
  return {
    active: true,
    folder: watcherInfo.folder,
    created_at: watcherInfo.created_at,
    pending_changes: projectPendingChanges.has(projectId) ? {
      files: Array.from(projectPendingChanges.get(projectId).files),
      modules: Array.from(projectPendingChanges.get(projectId).modules)
    } : null
  }
}

const listActiveWatchers = () => {
  const result = []
  for (const [id, info] of projectWatchers.entries()) {
    result.push({
      id,
      folder: info.folder,
      project_title: info.project?.title,
      created_at: info.created_at
    })
  }
  return result
}

const stopAllWatchers = () => {
  for (const projectId of projectWatchers.keys()) {
    stopProjectWatcher(projectId)
  }
}

const buildQueue = []
const activeBuilds = new Map()

const enqueueBuild = (projectId, module, priority = 'normal') => {
  const existing = buildQueue.find(b => b.project_id === projectId && b.module === module)
  if (existing) {
    existing.priority = priority === 'high' ? 'high' : existing.priority
    existing.requested_at = new Date().toISOString()
    return { queued: false, updated: true, build: existing }
  }
  const build = {
    id: `build_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    project_id: projectId,
    module,
    priority,
    status: 'queued',
    requested_at: new Date().toISOString(),
    started_at: null,
    completed_at: null
  }
  buildQueue.push(build)
  sortBuildQueue()
  return { queued: true, updated: false, build }
}

const sortBuildQueue = () => {
  buildQueue.sort((a, b) => {
    const priorityOrder = { high: 0, normal: 1, low: 2 }
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    }
    return new Date(a.requested_at) - new Date(b.requested_at)
  })
}

const getNextBuild = () => {
  return buildQueue.shift() || null
}

const startBuild = (build) => {
  if (!build) return null
  activeBuilds.set(build.id, { ...build, status: 'running', started_at: new Date().toISOString() })
  return activeBuilds.get(build.id)
}

const completeBuild = (buildId, success = true, error = null) => {
  const build = activeBuilds.get(buildId)
  if (!build) return null
  build.status = success ? 'completed' : 'failed'
  build.completed_at = new Date().toISOString()
  build.error = error
  activeBuilds.delete(buildId)
  return build
}

const getBuildQueue = () => [...buildQueue]
const getActiveBuilds = () => Array.from(activeBuilds.values())

const clearBuildQueue = (projectId = null) => {
  if (projectId) {
    const filtered = buildQueue.filter(b => b.project_id !== projectId)
    buildQueue.length = 0
    buildQueue.push(...filtered)
  } else {
    buildQueue.length = 0
  }
}

module.exports = {
  setupProjectWatcher,
  stopProjectWatcher,
  getProjectWatcherStatus,
  listActiveWatchers,
  stopAllWatchers,
  isPathIgnored,
  isWatchedFile,
  detectChangedModules,
  collectFilesRecursive,
  enqueueBuild,
  getNextBuild,
  startBuild,
  completeBuild,
  getBuildQueue,
  getActiveBuilds,
  clearBuildQueue,
  sortBuildQueue
}
