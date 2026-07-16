'use strict'

const CAPABILITIES = Object.freeze({
  CAPABILITIES: 'capabilities',
  PAIR_INIT: 'pair_init',
  PAIR_CONFIRM: 'pair_confirm',
  SESSION_CREATE: 'session_create',
  CHAT: 'chat',
  PROJECT_READ: 'project_read',
  PROJECT_WRITE: 'project_write',
  COMMAND_EXECUTE: 'command_execute',
  SETTINGS_READ: 'settings_read',
  SETTINGS_WRITE: 'settings_write',
  EVENTS_READ: 'events_read',
  DEVICE_LIST: 'device_list',
  DEVICE_REVOKE: 'device_revoke',
  FILE_READ: 'file_read',
  FILE_WRITE: 'file_write',
  RUN_CONTROL: 'run_control',
  INTERACTION_RESPOND: 'interaction_respond',
  ARTIFACT_READ: 'artifact_read',
  ARTIFACT_WRITE: 'artifact_write',
  RESOURCE_SNAPSHOT: 'resource_snapshot'
})

const CAPABILITY_PERMISSION_MAP = Object.freeze({
  [CAPABILITIES.PAIR_INIT]: null,
  [CAPABILITIES.PAIR_CONFIRM]: null,
  [CAPABILITIES.CAPABILITIES]: null,
  [CAPABILITIES.SESSION_CREATE]: null,
  [CAPABILITIES.CHAT]: 'chat',
  [CAPABILITIES.PROJECT_READ]: 'read_projects',
  [CAPABILITIES.PROJECT_WRITE]: 'write_projects',
  [CAPABILITIES.COMMAND_EXECUTE]: 'execute_commands',
  [CAPABILITIES.SETTINGS_READ]: 'manage_settings',
  [CAPABILITIES.SETTINGS_WRITE]: 'manage_settings',
  [CAPABILITIES.EVENTS_READ]: 'read_projects',
  [CAPABILITIES.DEVICE_LIST]: 'manage_settings',
  [CAPABILITIES.DEVICE_REVOKE]: 'manage_settings',
  [CAPABILITIES.FILE_READ]: 'read_projects',
  [CAPABILITIES.FILE_WRITE]: 'write_projects',
  [CAPABILITIES.RUN_CONTROL]: 'execute_commands',
  [CAPABILITIES.INTERACTION_RESPOND]: 'chat',
  [CAPABILITIES.ARTIFACT_READ]: 'read_projects',
  [CAPABILITIES.ARTIFACT_WRITE]: 'write_projects',
  [CAPABILITIES.RESOURCE_SNAPSHOT]: 'read_projects'
})

function createAuthorizationManager(deps = {}) {
  const {
    deviceTrustStore,
    auditLogger,
    eventStore,
    sessionManager
  } = deps

  function getCapabilities() {
    return Object.values(CAPABILITIES)
  }

  function getPublicCapabilities() {
    return [
      CAPABILITIES.CAPABILITIES,
      CAPABILITIES.PAIR_INIT,
      CAPABILITIES.PAIR_CONFIRM
    ]
  }

  function checkCapability(deviceId, capability, context = {}) {
    if (!capability || !CAPABILITY_PERMISSION_MAP.hasOwnProperty(capability)) {
      if (auditLogger) auditLogger.permissionDenied({ deviceId, capability: 'unknown', reason: 'unknown_capability' })
      return { allowed: false, reason: 'unknown_capability' }
    }

    const requiredPermission = CAPABILITY_PERMISSION_MAP[capability]

    if (requiredPermission === null) {
      return { allowed: true }
    }

    if (!deviceId) {
      if (auditLogger) auditLogger.permissionDenied({ capability, reason: 'no_device' })
      return { allowed: false, reason: 'authentication_required' }
    }

    if (!deviceTrustStore) {
      return { allowed: false, reason: 'trust_store_unavailable' }
    }

    const device = deviceTrustStore.getDevice(deviceId)
    if (!device) {
      if (auditLogger) auditLogger.permissionDenied({ deviceId, capability, reason: 'device_not_found' })
      return { allowed: false, reason: 'device_not_trusted' }
    }

    if (!device.trusted) {
      if (auditLogger) auditLogger.permissionDenied({ deviceId, capability, reason: 'device_revoked' })
      if (sessionManager && sessionManager.terminateDeviceSessions) {
        try { sessionManager.terminateDeviceSessions(deviceId) } catch (_) {}
      }
      return { allowed: false, reason: 'device_revoked' }
    }

    if (context.projectId && !isProjectAllowed(device, context.projectId)) {
      if (auditLogger) auditLogger.permissionDenied({ deviceId, capability, projectId: context.projectId, reason: 'project_not_allowed' })
      return { allowed: false, reason: 'project_access_denied' }
    }

    if (!deviceTrustStore.checkPermission(deviceId, requiredPermission)) {
      if (auditLogger) auditLogger.permissionDenied({ deviceId, capability, requiredPermission, reason: 'permission_missing' })
      return { allowed: false, reason: 'insufficient_permissions', requiredPermission }
    }

    return { allowed: true }
  }

  function isProjectAllowed(device, projectId) {
    if (!device.allowedProjects || device.allowedProjects.length === 0) {
      return true
    }
    return device.allowedProjects.includes(projectId)
  }

  function canAccessProject(deviceId, projectId) {
    if (!deviceTrustStore) return false
    const device = deviceTrustStore.getDevice(deviceId)
    if (!device || !device.trusted) return false
    return isProjectAllowed(device, projectId)
  }

  function setProjectPermissions(deviceId, projectIds) {
    if (!deviceTrustStore) return null
    return deviceTrustStore.updateDevice(deviceId, {
      metadata: { allowedProjects: projectIds }
    })
  }

  function getRequiredPermission(capability) {
    return CAPABILITY_PERMISSION_MAP[capability] || null
  }

  function revokeDeviceAndTerminateSessions(deviceId) {
    if (deviceTrustStore) {
      deviceTrustStore.revokeDevice(deviceId)
    }
    if (sessionManager && sessionManager.terminateDeviceSessions) {
      sessionManager.terminateDeviceSessions(deviceId)
    }
    if (auditLogger) {
      auditLogger.deviceRevoke({ deviceId, reason: 'explicit_revocation' })
    }
    return true
  }

  function initialize() {
  }

  return Object.freeze({
    initialize,
    getCapabilities,
    getPublicCapabilities,
    checkCapability,
    canAccessProject,
    setProjectPermissions,
    getRequiredPermission,
    revokeDeviceAndTerminateSessions,
    CAPABILITIES
  })
}

module.exports = {
  createAuthorizationManager,
  CAPABILITIES,
  CAPABILITY_PERMISSION_MAP
}
