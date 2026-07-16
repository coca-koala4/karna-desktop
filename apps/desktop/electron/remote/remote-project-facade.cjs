'use strict'

const { CAPABILITIES } = require('./remote-authorization.cjs')

function createProjectFacade(initialDeps = {}) {
  const deps = { ...initialDeps }

  function getDepsSafe() {
    return deps
  }

  function sanitizeProject(project) {
    if (!project) return null
    return {
      id: project.id,
      title: project.title || project.name || project.id,
      description: project.description || '',
      type: project.type || 'general',
      folder: project.folder || null,
      createdAt: project.createdAt || project.created_at || null,
      updatedAt: project.updatedAt || project.updated_at || null,
      metadata: project.metadata || {}
    }
  }

  function sanitizeConversation(conversation) {
    if (!conversation) return null
    return {
      id: conversation.id,
      projectId: conversation.projectId || conversation.project_id,
      title: conversation.title || 'Untitled Conversation',
      createdAt: conversation.createdAt || conversation.created_at || null,
      updatedAt: conversation.updatedAt || conversation.updated_at || null,
      messageCount: conversation.messageCount || (conversation.messages ? conversation.messages.length : 0),
      metadata: conversation.metadata || {}
    }
  }

  function sanitizeMessage(message) {
    if (!message) return null
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp || message.created_at || Date.now(),
      metadata: message.metadata || {}
    }
  }

  function verifyProjectAccess(deviceId, projectId) {
    const { authorizationManager } = getDepsSafe()
    if (!authorizationManager) {
      return { allowed: true }
    }
    return authorizationManager.canAccessProject(deviceId, projectId)
      ? { allowed: true }
      : { allowed: false, reason: 'project_access_denied' }
  }

  function getProjects(deviceId) {
    const { authorizationManager, writerProjectsService, auditLogger, eventStore } = getDepsSafe()

    if (authorizationManager) {
      const auth = authorizationManager.checkCapability(deviceId, CAPABILITIES.PROJECT_READ)
      if (!auth.allowed) {
        if (auditLogger) auditLogger.permissionDenied({ deviceId, capability: CAPABILITIES.PROJECT_READ })
        return { ok: false, error: auth.reason, projects: [] }
      }
    }

    let projects = []
    if (writerProjectsService) {
      const listFn = writerProjectsService.listWriterProjects || writerProjectsService.listProjects
      if (typeof listFn === 'function') {
        try {
          projects = listFn.call(writerProjectsService)
        } catch (err) {
          if (auditLogger) auditLogger.error('project_list_failed', { error: err.message })
          return { ok: false, error: 'project_list_failed', projects: [] }
        }
      }
    }

    const device = authorizationManager?.deviceTrustStore?.getDevice?.(deviceId)
    if (device && device.allowedProjects && device.allowedProjects.length > 0) {
      const allowed = new Set(device.allowedProjects)
      projects = projects.filter(p => allowed.has(p.id))
    }

    const sanitized = projects.map(sanitizeProject).filter(Boolean)

    if (eventStore) {
      eventStore.append('project.listed', { deviceId, count: sanitized.length })
    }

    return { ok: true, projects: sanitized }
  }

  function getProject(deviceId, projectId) {
    const { authorizationManager, writerProjectsService, auditLogger, eventStore } = getDepsSafe()

    if (authorizationManager) {
      const auth = authorizationManager.checkCapability(deviceId, CAPABILITIES.PROJECT_READ, { projectId })
      if (!auth.allowed) {
        if (auditLogger) auditLogger.permissionDenied({ deviceId, capability: CAPABILITIES.PROJECT_READ, projectId })
        return { ok: false, error: auth.reason }
      }
    }

    const accessCheck = verifyProjectAccess(deviceId, projectId)
    if (!accessCheck.allowed) {
      return { ok: false, error: accessCheck.reason }
    }

    let project = null
    if (writerProjectsService) {
      const getFn = writerProjectsService.getWriterProject || writerProjectsService.getProject
      if (typeof getFn === 'function') {
        try {
          project = getFn.call(writerProjectsService, projectId)
        } catch (err) {
          if (auditLogger) auditLogger.error('project_get_failed', { projectId, error: err.message })
          return { ok: false, error: 'project_get_failed' }
        }
      }
    }

    if (!project) {
      return { ok: false, error: 'project_not_found' }
    }

    const sanitized = sanitizeProject(project)

    if (eventStore) {
      eventStore.append('project.retrieved', { deviceId, projectId })
    }

    return { ok: true, project: sanitized }
  }

  function getProjectConversations(deviceId, projectId) {
    const { authorizationManager, writerProjectsService, auditLogger, eventStore } = getDepsSafe()

    if (authorizationManager) {
      const auth = authorizationManager.checkCapability(deviceId, CAPABILITIES.PROJECT_READ, { projectId })
      if (!auth.allowed) {
        return { ok: false, error: auth.reason, conversations: [] }
      }
    }

    const accessCheck = verifyProjectAccess(deviceId, projectId)
    if (!accessCheck.allowed) {
      return { ok: false, error: accessCheck.reason, conversations: [] }
    }

    let conversations = []

    if (writerProjectsService) {
      const getFn = writerProjectsService.getWriterProject || writerProjectsService.getProject
      const project = getFn?.call(writerProjectsService, projectId)
      if (project) {
        if (Array.isArray(project.conversations)) {
          conversations = project.conversations
        } else if (typeof writerProjectsService.getProjectTree === 'function') {
          try {
            const tree = writerProjectsService.getProjectTree(projectId)
            conversations = (tree || []).filter(item => item.type === 'conversation' || item.type === 'session')
          } catch (err) {
            if (auditLogger) auditLogger.error('project_conversations_failed', { projectId, error: err.message })
          }
        }
      }
    }

    const sanitized = conversations.map(sanitizeConversation).filter(Boolean)

    if (eventStore) {
      eventStore.append('project.conversations_listed', { deviceId, projectId, count: sanitized.length })
    }

    return { ok: true, conversations: sanitized }
  }

  function getConversationMessages(deviceId, projectId, conversationId) {
    const { authorizationManager, writerProjectsService, auditLogger, eventStore } = getDepsSafe()

    if (authorizationManager) {
      const auth = authorizationManager.checkCapability(deviceId, CAPABILITIES.PROJECT_READ, { projectId })
      if (!auth.allowed) {
        return { ok: false, error: auth.reason, messages: [] }
      }
    }

    const accessCheck = verifyProjectAccess(deviceId, projectId)
    if (!accessCheck.allowed) {
      return { ok: false, error: accessCheck.reason, messages: [] }
    }

    let messages = []
    if (writerProjectsService) {
      try {
        const getFn = writerProjectsService.getWriterProject || writerProjectsService.getProject
        const project = getFn?.call(writerProjectsService, projectId)
        if (project) {
          if (Array.isArray(project.conversations)) {
            const conv = project.conversations.find(c => c.id === conversationId)
            if (conv && Array.isArray(conv.messages)) {
              messages = conv.messages
            }
          } else if (project.sessions && typeof project.sessions === 'object') {
            const session = project.sessions[conversationId]
            if (session && Array.isArray(session.messages)) {
              messages = session.messages
            }
          }
        }
      } catch (err) {
        if (auditLogger) auditLogger.error('conversation_messages_failed', { projectId, conversationId, error: err.message })
      }
    }

    const sanitized = messages.map(sanitizeMessage).filter(Boolean)

    if (eventStore) {
      eventStore.append('conversation.messages_retrieved', { deviceId, projectId, conversationId, count: sanitized.length })
    }

    return { ok: true, messages: sanitized }
  }

  function getProjectVersions(deviceId, projectId) {
    const { authorizationManager, writerProjectsService, auditLogger } = getDepsSafe()

    if (authorizationManager) {
      const auth = authorizationManager.checkCapability(deviceId, CAPABILITIES.PROJECT_READ, { projectId })
      if (!auth.allowed) {
        return { ok: false, error: auth.reason, versions: [] }
      }
    }

    const accessCheck = verifyProjectAccess(deviceId, projectId)
    if (!accessCheck.allowed) {
      return { ok: false, error: accessCheck.reason, versions: [] }
    }

    let versions = []
    if (writerProjectsService && typeof writerProjectsService.getProjectVersions === 'function') {
      try {
        versions = writerProjectsService.getProjectVersions(projectId)
      } catch (err) {
        if (auditLogger) auditLogger.error('project_versions_failed', { projectId, error: err.message })
      }
    }

    return { ok: true, versions }
  }

  function getResources(deviceId) {
    const { authorizationManager, soulService, mcpService, skillsService, capabilitiesService, auditLogger, eventStore } = getDepsSafe()

    if (authorizationManager) {
      const auth = authorizationManager.checkCapability(deviceId, CAPABILITIES.RESOURCE_READ)
      if (!auth.allowed) {
        return { ok: false, error: auth.reason }
      }
    }

    const resources = {
      souls: [],
      skills: [],
      mcpServers: [],
      capabilities: {}
    }

    try {
      if (soulService && typeof soulService.listSoulAuthors === 'function') {
        resources.souls = soulService.listSoulAuthors()
      } else if (soulService && typeof soulService.listSouls === 'function') {
        resources.souls = soulService.listSouls()
      }
    } catch (err) {
      if (auditLogger) auditLogger.error('resource_soul_list_failed', { error: err.message })
    }

    try {
      if (skillsService && typeof skillsService.listSkills === 'function') {
        resources.skills = skillsService.listSkills()
      }
    } catch (err) {
      if (auditLogger) auditLogger.error('resource_skill_list_failed', { error: err.message })
    }

    try {
      if (mcpService && typeof mcpService.listMcpServers === 'function') {
        resources.mcpServers = mcpService.listMcpServers()
      }
    } catch (err) {
      if (auditLogger) auditLogger.error('resource_mcp_list_failed', { error: err.message })
    }

    try {
      if (capabilitiesService && typeof capabilitiesService.getCapabilities === 'function') {
        resources.capabilities = capabilitiesService.getCapabilities()
      }
    } catch (err) {
      if (auditLogger) auditLogger.error('resource_capabilities_failed', { error: err.message })
    }

    if (eventStore) {
      eventStore.append('resource.snapshot', { deviceId })
    }

    return { ok: true, resources }
  }

  function initialize() {
  }

  function setDeps(newDeps = {}) {
    const current = getDepsSafe()
    Object.assign(current, newDeps)
  }

  return Object.freeze({
    initialize,
    setDeps,
    getProjects,
    getProject,
    getProjectConversations,
    getConversationMessages,
    getProjectVersions,
    getResources,
    verifyProjectAccess
  })
}

module.exports = { createProjectFacade }
