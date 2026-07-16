'use strict'

const INTERACTION_TYPES = Object.freeze({
  CLARIFY: 'clarify',
  APPROVAL: 'approval'
})

const INTERACTION_STATUS = Object.freeze({
  PENDING: 'pending',
  RESPONDED: 'responded',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
})

const DESKTOP_REQUIRED_TYPES = new Set(['sudo', 'secret', 'password', 'credential'])
const INTERACTION_TTL_MS = 15 * 60 * 1000

function createInteractionService(deps = {}) {
  const {
    runtimeBridge,
    auditLogger,
    eventStore
  } = deps

  const interactions = new Map()
  let interactionSeq = 0

  function generateInteractionId() {
    interactionSeq += 1
    return `ia_${Date.now()}_${interactionSeq}`
  }

  function pruneExpired() {
    const now = Date.now()
    for (const [id, interaction] of interactions.entries()) {
      if (now - interaction.createdAt > INTERACTION_TTL_MS && interaction.status === INTERACTION_STATUS.PENDING) {
        interaction.status = INTERACTION_STATUS.EXPIRED
        if (eventStore) {
          eventStore.append('interaction.expired', { interactionId: id, type: interaction.type })
        }
      }
    }
  }

  function createClarificationRequest(params = {}) {
    pruneExpired()
    const id = params.interactionId || generateInteractionId()
    const interaction = {
      id,
      type: INTERACTION_TYPES.CLARIFY,
      status: INTERACTION_STATUS.PENDING,
      prompt: params.prompt || params.question || '',
      options: Array.isArray(params.options) ? params.options : [],
      defaultValue: params.defaultValue,
      multiSelect: params.multiSelect === true,
      sessionId: params.sessionId || null,
      projectId: params.projectId || null,
      desktopRequired: DESKTOP_REQUIRED_TYPES.has(params.inputType),
      inputType: params.inputType || 'text',
      createdAt: Date.now(),
      respondedBy: null,
      response: null,
      respondedAt: null,
      expectedVersion: 1
    }
    interactions.set(id, interaction)

    if (eventStore) {
      eventStore.append('interaction.created', {
        interactionId: id,
        type: interaction.type,
        desktopRequired: interaction.desktopRequired,
        sessionId: interaction.sessionId
      })
    }

    return interaction
  }

  function createApprovalRequest(params = {}) {
    pruneExpired()
    const id = params.interactionId || generateInteractionId()
    const interaction = {
      id,
      type: INTERACTION_TYPES.APPROVAL,
      status: INTERACTION_STATUS.PENDING,
      title: params.title || 'Approval Required',
      description: params.description || '',
      toolName: params.toolName || null,
      toolArgs: params.toolArgs || null,
      sessionId: params.sessionId || null,
      projectId: params.projectId || null,
      desktopRequired: DESKTOP_REQUIRED_TYPES.has(params.approvalType),
      approvalType: params.approvalType || 'general',
      createdAt: Date.now(),
      respondedBy: null,
      approved: null,
      respondedAt: null,
      expectedVersion: 1
    }
    interactions.set(id, interaction)

    if (eventStore) {
      eventStore.append('interaction.created', {
        interactionId: id,
        type: interaction.type,
        desktopRequired: interaction.desktopRequired,
        toolName: interaction.toolName,
        sessionId: interaction.sessionId
      })
    }

    return interaction
  }

  function getInteraction(interactionId) {
    pruneExpired()
    return interactions.get(interactionId) || null
  }

  function listPendingInteractions(filter = {}) {
    pruneExpired()
    const result = []
    for (const interaction of interactions.values()) {
      if (interaction.status !== INTERACTION_STATUS.PENDING) continue
      if (filter.sessionId && interaction.sessionId !== filter.sessionId) continue
      if (filter.projectId && interaction.projectId !== filter.projectId) continue
      if (filter.type && interaction.type !== filter.type) continue
      if (filter.desktopOnly && !interaction.desktopRequired) continue
      if (filter.remoteOnly && interaction.desktopRequired) continue
      result.push(interaction)
    }
    return result
  }

  function respond(interactionId, response, context = {}) {
    pruneExpired()
    const interaction = interactions.get(interactionId)

    if (!interaction) {
      return { ok: false, error: 'interaction_not_found' }
    }

    if (interaction.status !== INTERACTION_STATUS.PENDING) {
      return { ok: false, error: `interaction_already_${interaction.status}` }
    }

    const expectedVersion = context.expectedVersion || interaction.expectedVersion
    if (expectedVersion !== interaction.expectedVersion) {
      return { ok: false, error: 'version_conflict', currentVersion: interaction.expectedVersion }
    }

    if (interaction.desktopRequired && !context.isDesktop) {
      return { ok: false, error: 'desktop_required', reason: 'This interaction requires desktop handling' }
    }

    interaction.expectedVersion += 1
    interaction.status = INTERACTION_STATUS.RESPONDED
    interaction.respondedBy = context.deviceId || context.respondedBy || null
    interaction.respondedAt = Date.now()

    if (interaction.type === INTERACTION_TYPES.CLARIFY) {
      interaction.response = response
      if (runtimeBridge) {
        runtimeBridge.clarifyRespond(
          interaction.sessionId,
          interactionId,
          response,
          context
        ).catch(err => {
          if (auditLogger) auditLogger.error('clarify_respond_failed', { interactionId, error: err.message })
        })
      }
    } else if (interaction.type === INTERACTION_TYPES.APPROVAL) {
      const approved = Boolean(response === true || response?.approved === true || response === 'approve')
      interaction.approved = approved
      if (runtimeBridge) {
        runtimeBridge.approvalRespond(
          interaction.sessionId,
          interactionId,
          approved,
          context
        ).catch(err => {
          if (auditLogger) auditLogger.error('approval_respond_failed', { interactionId, error: err.message })
        })
      }
    }

    if (eventStore) {
      eventStore.append('interaction.responded', {
        interactionId,
        type: interaction.type,
        approved: interaction.approved,
        respondedBy: interaction.respondedBy
      })
    }

    return {
      ok: true,
      interaction: {
        id: interaction.id,
        type: interaction.type,
        status: interaction.status,
        response: interaction.response,
        approved: interaction.approved,
        version: interaction.expectedVersion
      }
    }
  }

  function cancelInteraction(interactionId, reason = 'cancelled') {
    const interaction = interactions.get(interactionId)
    if (!interaction) {
      return { ok: false, error: 'interaction_not_found' }
    }
    if (interaction.status !== INTERACTION_STATUS.PENDING) {
      return { ok: false, error: `interaction_already_${interaction.status}` }
    }
    interaction.status = INTERACTION_STATUS.CANCELLED
    if (eventStore) {
      eventStore.append('interaction.cancelled', { interactionId, type: interaction.type, reason })
    }
    return { ok: true }
  }

  function handleRuntimeEvent(event) {
    if (!event || !event.type) return

    if (event.type === 'clarify.request' || event.type === 'runtime.clarify.request') {
      return createClarificationRequest(event.payload || event)
    }
    if (event.type === 'approval.request' || event.type === 'runtime.approval.request') {
      return createApprovalRequest(event.payload || event)
    }
    return null
  }

  function getStats() {
    pruneExpired()
    let pending = 0
    let desktopRequired = 0
    for (const ia of interactions.values()) {
      if (ia.status === INTERACTION_STATUS.PENDING) {
        pending += 1
        if (ia.desktopRequired) desktopRequired += 1
      }
    }
    return {
      total: interactions.size,
      pending,
      desktopRequired,
      ttlMs: INTERACTION_TTL_MS
    }
  }

  function initialize() {
    interactions.clear()
    interactionSeq = 0
  }

  return Object.freeze({
    initialize,
    createClarificationRequest,
    createApprovalRequest,
    getInteraction,
    listPendingInteractions,
    respond,
    cancelInteraction,
    handleRuntimeEvent,
    getStats,
    INTERACTION_TYPES,
    INTERACTION_STATUS,
    DESKTOP_REQUIRED_TYPES
  })
}

module.exports = {
  createInteractionService,
  INTERACTION_TYPES,
  INTERACTION_STATUS,
  DESKTOP_REQUIRED_TYPES
}
