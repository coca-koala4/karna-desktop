const { BrowserWindow } = require('electron')

const eventListeners = new Map()
let nextListenerId = 1

const WRITER_EVENTS = [
  'writer:project.changed',
  'writer:module.stale',
  'writer:module.building',
  'writer:module.updated',
  'writer:module.failed',
  'writer:session.project-bound',
  'writer:file.changed'
]

const broadcastToAllWindows = (event, payload) => {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      try {
        win.webContents.send(event, payload)
      } catch (e) {
        console.warn(`[writer-events] Failed to send to window ${win.id}:`, e.message)
      }
    }
  }
}

const emitWriterEvent = (event, payload) => {
  if (!WRITER_EVENTS.includes(event) && !event.startsWith('writer:')) {
    console.warn(`[writer-events] Unknown event type: ${event}`)
  }
  broadcastToAllWindows(event, payload)
  const listeners = eventListeners.get(event) || []
  for (const listener of listeners) {
    try {
      listener.callback(payload)
    } catch (e) {
      console.warn(`[writer-events] Listener error for ${event}:`, e.message)
    }
  }
}

const onWriterEvent = (event, callback) => {
  if (!eventListeners.has(event)) {
    eventListeners.set(event, [])
  }
  const id = nextListenerId++
  eventListeners.get(event).push({ id, callback })
  return () => {
    const listeners = eventListeners.get(event)
    if (listeners) {
      const idx = listeners.findIndex(l => l.id === id)
      if (idx >= 0) listeners.splice(idx, 1)
    }
  }
}

const notifyProjectChanged = (project) => {
  emitWriterEvent('writer:project.changed', {
    workspace_id: project.workspace_id || '',
    writer_project_id: project.id || '',
    title: project.title || '',
    folder: project.folder || '',
    timestamp: new Date().toISOString()
  })
}

const notifyModuleStale = (project, module, reasons = [], revision = 0) => {
  emitWriterEvent('writer:module.stale', {
    workspace_id: project.workspace_id || '',
    writer_project_id: project.id || '',
    module,
    reasons,
    revision,
    timestamp: new Date().toISOString()
  })
}

const notifyModuleBuilding = (project, module, buildId) => {
  emitWriterEvent('writer:module.building', {
    workspace_id: project.workspace_id || '',
    writer_project_id: project.id || '',
    module,
    build_id: buildId,
    timestamp: new Date().toISOString()
  })
}

const notifyModuleUpdated = (project, module, revision, buildId) => {
  emitWriterEvent('writer:module.updated', {
    workspace_id: project.workspace_id || '',
    writer_project_id: project.id || '',
    module,
    revision,
    build_id: buildId,
    timestamp: new Date().toISOString()
  })
}

const notifyModuleFailed = (project, module, error, buildId) => {
  emitWriterEvent('writer:module.failed', {
    workspace_id: project.workspace_id || '',
    writer_project_id: project.id || '',
    module,
    error: error?.message || String(error),
    error_code: error?.code || 'BUILD_FAILED',
    build_id: buildId,
    timestamp: new Date().toISOString()
  })
}

const notifySessionProjectBound = (sessionId, workspaceId, writerProjectId) => {
  emitWriterEvent('writer:session.project-bound', {
    session_id: sessionId,
    workspace_id: workspaceId || '',
    writer_project_id: writerProjectId || '',
    timestamp: new Date().toISOString()
  })
}

const notifyFileChanged = (project, changes) => {
  emitWriterEvent('writer:file.changed', {
    workspace_id: project.workspace_id || '',
    writer_project_id: project.id || '',
    files: changes.files || [],
    modules: changes.modules || [],
    timestamp: changes.timestamp || new Date().toISOString()
  })
}

module.exports = {
  WRITER_EVENTS,
  emitWriterEvent,
  onWriterEvent,
  notifyProjectChanged,
  notifyModuleStale,
  notifyModuleBuilding,
  notifyModuleUpdated,
  notifyModuleFailed,
  notifySessionProjectBound,
  notifyFileChanged
}
