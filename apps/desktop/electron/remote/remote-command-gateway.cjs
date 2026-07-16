'use strict'

const { CAPABILITIES } = require('./remote-authorization.cjs')

const COMMAND_TYPES = Object.freeze({
  CONVERSATION_CREATE: 'conversation.create',
  MESSAGE_SEND: 'message.send',
  RUN_PAUSE: 'run.pause',
  RUN_RESUME: 'run.resume',
  RUN_CANCEL: 'run.cancel',
  INTERACTION_RESPOND: 'interaction.respond',
  APPROVAL_RESPOND: 'approval.respond'
})

const IDEMPOTENCY_EXPIRY_MS = 24 * 60 * 60 * 1000

function createCommandGateway(deps = {}) {
  const {
    runtimeBridge,
    interactionService,
    authorizationManager,
    projectFacade,
    auditLogger,
    eventStore
  } = deps

  const handlers = new Map()
  const idempotencyCache = new Map()
  let commandSeq = 0

  function generateCommandId() {
    commandSeq += 1
    return `cmd_${Date.now()}_${commandSeq}`
  }

  function pruneIdempotencyCache() {
    const now = Date.now()
    for (const [key, entry] of idempotencyCache.entries()) {
      if (now - entry.ts > IDEMPOTENCY_EXPIRY_MS) {
        idempotencyCache.delete(key)
      }
    }
  }

  function registerHandler(commandType, handler) {
    handlers.set(commandType, handler)
  }

  function validateEnvelope(envelope) {
    if (!envelope || typeof envelope !== 'object') {
      return { valid: false, error: 'invalid_envelope' }
    }
    if (!envelope.type || typeof envelope.type !== 'string') {
      return { valid: false, error: 'missing_command_type' }
    }
    if (!Object.values(COMMAND_TYPES).includes(envelope.type)) {
      return { valid: false, error: `unknown_command_type: ${envelope.type}` }
    }
    return { valid: true }
  }

  function checkIdempotency(idempotencyKey) {
    if (!idempotencyKey) return null
    pruneIdempotencyCache()
    return idempotencyCache.get(idempotencyKey) || null
  }

  function recordIdempotency(idempotencyKey, result) {
    if (!idempotencyKey) return
    idempotencyCache.set(idempotencyKey, {
      ts: Date.now(),
      result
    })
  }

  function requireCapability(deviceId, capability, context = {}) {
    if (!authorizationManager) return { allowed: true }
    return authorizationManager.checkCapability(deviceId, capability, context)
  }

  async function handleCommand(envelope, context = {}) {
    const { deviceId, sessionId } = context
    const validation = validateEnvelope(envelope)
    if (!validation.valid) {
      return { ok: false, error: validation.error, commandId: envelope?.commandId || generateCommandId() }
    }

    const commandId = envelope.commandId || generateCommandId()
    const { type, payload = {}, idempotencyKey } = envelope

    if (auditLogger) {
      auditLogger.log('command_received', { commandId, type, deviceId, sessionId })
    }

    const cached = checkIdempotency(idempotencyKey)
    if (cached) {
      if (eventStore) {
        eventStore.append('command.idempotent_replay', { commandId, type, idempotencyKey })
      }
      return { ...cached.result, _replayed: true }
    }

    let result
    try {
      const handler = handlers.get(type)
      if (!handler) {
        result = { ok: false, error: `no_handler_for: ${type}`, commandId }
      } else {
        result = await handler(payload, { deviceId, sessionId, commandId })
      }
    } catch (err) {
      result = { ok: false, error: err.message || 'command_failed', commandId }
      if (auditLogger) {
        auditLogger.error('command_failed', { commandId, type, error: err.message })
      }
    }

    recordIdempotency(idempotencyKey, result)

    if (eventStore) {
      eventStore.append(result.ok ? 'command.completed' : 'command.failed', {
        commandId,
        type,
        success: result.ok,
        error: result.error || null
      })
    }

    return result
  }

  function defaultConversationCreate(payload, context) {
    const { deviceId } = context
    const auth = requireCapability(deviceId, CAPABILITIES.CHAT, { projectId: payload.projectId || payload.project_id })
    if (!auth.allowed) {
      return { ok: false, error: auth.reason }
    }

    if (payload.projectId || payload.project_id) {
      const pid = payload.projectId || payload.project_id
      if (projectFacade) {
        const access = projectFacade.verifyProjectAccess(deviceId, pid)
        if (!access.allowed) {
          return { ok: false, error: access.reason }
        }
      }
    }

    if (!runtimeBridge) {
      return { ok: false, error: 'runtime_bridge_unavailable' }
    }

    return runtimeBridge.sessionCreate(payload).then(
      session => ({ ok: true, sessionId: session?.session_id || session?.id, session }),
      err => ({ ok: false, error: err.message })
    )
  }

  function defaultMessageSend(payload, context) {
    const { deviceId } = context
    const auth = requireCapability(deviceId, CAPABILITIES.CHAT, { projectId: payload.projectId || payload.project_id })
    if (!auth.allowed) {
      return { ok: false, error: auth.reason }
    }

    if (!runtimeBridge) {
      return { ok: false, error: 'runtime_bridge_unavailable' }
    }

    const sessionId = payload.sessionId || payload.session_id || context.sessionId || context.session_id
    if (!sessionId) {
      return { ok: false, error: 'session_id_required' }
    }

    const message = payload.message || payload.prompt || payload.content
    if (!message) {
      return { ok: false, error: 'message_required' }
    }

    return runtimeBridge.promptSubmit(sessionId, message, payload).then(
      result => ({ ok: true, result }),
      err => ({ ok: false, error: err.message })
    )
  }

  function defaultRunControl(action) {
    return async (payload, context) => {
      const { deviceId } = context
      const auth = requireCapability(deviceId, CAPABILITIES.COMMAND_EXECUTE, { projectId: payload.projectId })
      if (!auth.allowed) {
        return { ok: false, error: auth.reason }
      }

      if (!runtimeBridge) {
        return { ok: false, error: 'runtime_bridge_unavailable' }
      }

      const sessionId = payload.sessionId || context.sessionId
      return runtimeBridge.sessionInterrupt(sessionId, { action, ...payload }).then(
        result => ({ ok: true, result }),
        err => ({ ok: false, error: err.message })
      )
    }
  }

  function defaultInteractionRespond(payload, context) {
    const { deviceId } = context
    const auth = requireCapability(deviceId, CAPABILITIES.CHAT, { projectId: payload.projectId || payload.project_id })
    if (!auth.allowed) {
      return { ok: false, error: auth.reason }
    }

    if (interactionService) {
      return interactionService.respond(
        payload.interactionId || payload.interaction_id,
        payload.response,
        {
          deviceId,
          sessionId: payload.sessionId || payload.session_id || context.sessionId,
          approved: payload.approved,
          ...payload
        }
      )
    }

    if (!runtimeBridge) {
      return { ok: false, error: 'runtime_bridge_unavailable' }
    }

    const sessionId = payload.sessionId || payload.session_id || context.sessionId
    const interactionId = payload.interactionId || payload.interaction_id
    const interactionType = payload.interactionType || payload.interaction_type

    if (!sessionId || !interactionId) {
      return { ok: false, error: 'session_id_and_interaction_id_required' }
    }

    if (interactionType === 'clarify') {
      return runtimeBridge.clarifyRespond(sessionId, interactionId, payload.response, payload).then(
        result => ({ ok: true, result }),
        err => ({ ok: false, error: err.message })
      )
    }

    return runtimeBridge.approvalRespond(sessionId, interactionId, payload.approved, payload).then(
      result => ({ ok: true, result }),
      err => ({ ok: false, error: err.message })
    )
  }

  function defaultApprovalRespond(payload, context) {
    return defaultInteractionRespond({ ...payload, interactionType: 'approval' }, context)
  }

  registerHandler(COMMAND_TYPES.CONVERSATION_CREATE, defaultConversationCreate)
  registerHandler(COMMAND_TYPES.MESSAGE_SEND, defaultMessageSend)
  registerHandler(COMMAND_TYPES.RUN_PAUSE, defaultRunControl('pause'))
  registerHandler(COMMAND_TYPES.RUN_RESUME, defaultRunControl('resume'))
  registerHandler(COMMAND_TYPES.RUN_CANCEL, defaultRunControl('cancel'))
  registerHandler(COMMAND_TYPES.INTERACTION_RESPOND, defaultInteractionRespond)
  registerHandler(COMMAND_TYPES.APPROVAL_RESPOND, defaultApprovalRespond)

  function getStats() {
    pruneIdempotencyCache()
    return {
      registeredHandlers: handlers.size,
      cachedIdempotencyKeys: idempotencyCache.size,
      supportedCommands: Array.from(handlers.keys())
    }
  }

  function initialize() {
    idempotencyCache.clear()
    commandSeq = 0
  }

  return Object.freeze({
    initialize,
    handleCommand,
    registerHandler,
    getStats,
    COMMAND_TYPES
  })
}

module.exports = {
  createCommandGateway,
  COMMAND_TYPES
}
