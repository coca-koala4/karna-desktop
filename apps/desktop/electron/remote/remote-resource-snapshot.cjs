'use strict'

const crypto = require('node:crypto')

const SNAPSHOT_VERSION = 'v1'
const RESOURCE_TYPES = Object.freeze({
  SKILL: 'skill',
  MCP_SERVER: 'mcp_server',
  SOUL: 'soul',
  CAPABILITY: 'capability'
})

function createResourceSnapshotService(initialDeps = {}) {
  const deps = { ...initialDeps }

  function getDeps() {
    return deps
  }

  function setDeps(newDeps = {}) {
    Object.assign(deps, newDeps)
  }

  function hashResource(resource) {
    const data = JSON.stringify(resource)
    return (deps.cryptoDep || crypto).createHash('sha256').update(data).digest('hex')
  }

  function sanitizeSkill(skill) {
    if (!skill) return null
    return {
      id: skill.id || skill.name,
      name: skill.name || skill.id,
      description: skill.description || '',
      version: skill.version || '1.0.0',
      enabled: skill.enabled !== false,
      source: skill.source || 'system',
      requiresApproval: skill.requiresApproval === true,
      category: skill.category || 'general'
    }
  }

  function sanitizeMcpServer(server) {
    if (!server) return null
    return {
      id: server.id || server.name,
      name: server.name || server.id,
      description: server.description || '',
      enabled: server.enabled !== false,
      transport: server.transport || 'stdio',
      tools: Array.isArray(server.tools) ? server.tools : []
    }
  }

  function sanitizeSoul(soul) {
    if (!soul) return null
    return {
      id: soul.id || 'default',
      name: soul.name || 'Default',
      description: soul.description || '',
      version: soul.version || '1.0.0',
      enabled: soul.enabled !== false,
      isDefault: soul.isDefault === true
    }
  }

  function sanitizeCapability(capability) {
    if (!capability) return null
    return {
      id: capability.id || capability.name,
      name: capability.name || capability.id,
      description: capability.description || '',
      enabled: capability.enabled !== false,
      category: capability.category || 'general'
    }
  }

  function filterByProjectScope(resources, projectId) {
    if (!projectId) return resources
    return resources.filter(r => {
      if (!r.projectScope || r.projectScope.length === 0) return true
      return r.projectScope.includes(projectId)
    })
  }

  async function getSkills() {
    const { skillsService, auditLogger } = getDeps()
    let skills = []
    if (skillsService && typeof skillsService.scanSkills === 'function') {
      try {
        skills = await skillsService.scanSkills()
      } catch (err) {
        if (auditLogger) auditLogger.error('resource_skills_scan_failed', { error: err.message })
        skills = []
      }
    } else if (skillsService && typeof skillsService.listSkills === 'function') {
      try {
        skills = skillsService.listSkills()
      } catch (err) {
        if (auditLogger) auditLogger.error('resource_skills_list_failed', { error: err.message })
        skills = []
      }
    }
    return (skills || []).map(sanitizeSkill).filter(s => s && s.enabled)
  }

  function getMcpServers() {
    const { mcpService, auditLogger } = getDeps()
    let servers = []
    if (mcpService) {
      const listFn = mcpService.listServers || mcpService.listMcpServers
      if (typeof listFn === 'function') {
        try {
          servers = listFn.call(mcpService)
        } catch (err) {
          if (auditLogger) auditLogger.error('resource_mcp_list_failed', { error: err.message })
          servers = []
        }
      }
    }
    return (servers || []).map(sanitizeMcpServer).filter(s => s && s.enabled)
  }

  function getSouls() {
    const { soulService, auditLogger } = getDeps()
    let souls = []
    if (soulService) {
      if (typeof soulService.listSoulAuthors === 'function') {
        try {
          souls = soulService.listSoulAuthors()
        } catch (err) {
          if (auditLogger) auditLogger.error('resource_soul_list_failed', { error: err.message })
          souls = []
        }
      } else if (typeof soulService.listSouls === 'function') {
        try {
          souls = soulService.listSouls()
        } catch (err) {
          if (auditLogger) auditLogger.error('resource_soul_list_failed', { error: err.message })
          souls = []
        }
      } else {
        souls = [{ id: 'default', name: 'Default', enabled: true, isDefault: true }]
      }
    }
    return souls.map(sanitizeSoul).filter(s => s && s.enabled)
  }

  function getCapabilities() {
    const { capabilitiesService, auditLogger } = getDeps()
    let capabilities = []
    if (capabilitiesService) {
      const listFn = capabilitiesService.toolsetRows || capabilitiesService.getCapabilities
      if (typeof listFn === 'function') {
        try {
          const result = listFn.call(capabilitiesService)
          capabilities = Array.isArray(result) ? result : []
        } catch (err) {
          if (auditLogger) auditLogger.error('resource_capabilities_list_failed', { error: err.message })
          capabilities = []
        }
      }
    }
    return capabilities.map(sanitizeCapability).filter(c => c && c.enabled)
  }

  async function createSnapshot(options = {}) {
    const { authorizationManager, projectFacade, eventStore, auditLogger } = getDeps()
    const { deviceId, projectId } = options

    if (authorizationManager) {
      const auth = authorizationManager.checkCapability(deviceId, 'settings_read', projectId ? { projectId } : {})
      if (!auth.allowed) {
        return { ok: false, error: auth.reason }
      }
    }

    if (projectId && projectFacade) {
      const access = projectFacade.verifyProjectAccess(deviceId, projectId)
      if (!access.allowed) {
        return { ok: false, error: access.reason }
      }
    }

    const [skills, mcpServers, souls, capabilities] = await Promise.all([
      getSkills(),
      Promise.resolve(getMcpServers()),
      Promise.resolve(getSouls()),
      Promise.resolve(getCapabilities())
    ])

    const filteredSkills = filterByProjectScope(skills, projectId)
    const filteredMcp = filterByProjectScope(mcpServers, projectId)
    const filteredSouls = filterByProjectScope(souls, projectId)
    const filteredCapabilities = filterByProjectScope(capabilities, projectId)

    const resources = {
      skills: filteredSkills,
      mcpServers: filteredMcp,
      souls: filteredSouls,
      capabilities: filteredCapabilities
    }

    const hash = hashResource(resources)
    const snapshot = {
      v: SNAPSHOT_VERSION,
      id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      projectId: projectId || null,
      deviceId: deviceId || null,
      hash,
      resources,
      counts: {
        skills: filteredSkills.length,
        mcpServers: filteredMcp.length,
        souls: filteredSouls.length,
        capabilities: filteredCapabilities.length
      }
    }

    if (eventStore) {
      eventStore.append('resource.snapshot_created', {
        snapshotId: snapshot.id,
        hash,
        projectId,
        counts: snapshot.counts
      })
    }

    return { ok: true, snapshot }
  }

  function createVerifiedContext(snapshot, verified = {}) {
    if (!snapshot || !snapshot.hash) {
      return null
    }
    return {
      v: SNAPSHOT_VERSION,
      snapshotId: snapshot.id,
      snapshotHash: snapshot.hash,
      ts: Date.now(),
      verified,
      resources: snapshot.resources
    }
  }

  function verifySnapshotHash(snapshot, expectedHash) {
    if (!snapshot) return false
    const computedHash = hashResource(snapshot.resources)
    return computedHash === expectedHash
  }

  function validateResourceVersion(resource, minVersion) {
    if (!resource || !resource.version) return false
    if (!minVersion) return true
    const versionParts = String(resource.version).split('.').map(Number)
    const minParts = String(minVersion).split('.').map(Number)
    for (let i = 0; i < Math.max(versionParts.length, minParts.length); i++) {
      const v = versionParts[i] || 0
      const m = minParts[i] || 0
      if (v > m) return true
      if (v < m) return false
    }
    return true
  }

  function getStats() {
    return {
      version: SNAPSHOT_VERSION,
      supportedResourceTypes: Object.values(RESOURCE_TYPES)
    }
  }

  function initialize() {
  }

  return Object.freeze({
    initialize,
    setDeps,
    getDeps,
    createSnapshot,
    createVerifiedContext,
    verifySnapshotHash,
    validateResourceVersion,
    hashResource,
    getStats,
    RESOURCE_TYPES,
    SNAPSHOT_VERSION
  })
}

module.exports = {
  createResourceSnapshotService,
  RESOURCE_TYPES,
  SNAPSHOT_VERSION
}
