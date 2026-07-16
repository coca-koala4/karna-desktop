'use strict'

const crypto = require('node:crypto')

const DEFAULT_PERMISSION_POLICIES = {
  direct: {
    readWorkspaceFiles: true,
    writeWorkspaceFiles: false,
    executeShell: false,
    networkAccess: false,
    modifySoul: false,
    modifyKnowledge: false,
    modeSpecificRestrictions: []
  },
  plan: {
    readWorkspaceFiles: true,
    writeWorkspaceFiles: false,
    executeShell: false,
    networkAccess: false,
    modifySoul: false,
    modifyKnowledge: false,
    modeSpecificRestrictions: ['plan_read_only', 'no_file_write', 'no_shell_execution']
  },
  goal: {
    readWorkspaceFiles: true,
    writeWorkspaceFiles: true,
    executeShell: false,
    networkAccess: false,
    modifySoul: false,
    modifyKnowledge: false,
    modeSpecificRestrictions: ['scope_limited_writes', 'require_evidence', 'alignment_check_required']
  },
  living_work: {
    readWorkspaceFiles: true,
    writeWorkspaceFiles: false,
    executeShell: false,
    networkAccess: false,
    modifySoul: false,
    modifyKnowledge: false,
    modeSpecificRestrictions: ['proposal_only_writes', 'candidate_actions_required', 'impact_analysis_required', 'protected_ambiguities_immutable', 'handoff_on_high_risk']
  }
}

function createModeService({ logRequest, modeCompatibilityCompiler }) {
  const sessions = new Map()
  const events = new Map()
  const checkpoints = new Map()
  const bindings = new Map()
  let eventSequenceCounter = 0

  function generateId(prefix = 'mode') {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`
  }

  function nowIso() {
    return new Date().toISOString()
  }

  function addEvent(modeSessionId, mode, eventType, payload = {}) {
    const sessionEvents = events.get(modeSessionId) || []
    eventSequenceCounter++
    const session = sessions.get(modeSessionId)
    const event = {
      id: generateId('evt'),
      modeSessionId,
      mode,
      sequence: eventSequenceCounter,
      stateVersion: session?.stateVersion || 1,
      type: eventType,
      payload,
      createdAt: nowIso()
    }
    sessionEvents.push(event)
    events.set(modeSessionId, sessionEvents)
    return event
  }

  function getSession(id) {
    return sessions.get(id) || null
  }

  function getBinding(modeSessionId) {
    return bindings.get(modeSessionId) || null
  }

  function createDefaultBinding(mode, modeSessionId, projectContext) {
    return {
      id: generateId('bind'),
      modeSessionId,
      workflow: null,
      souls: [],
      skills: [],
      tools: [],
      knowledgeSources: [],
      documents: [],
      projectContext: projectContext || null,
      modelPolicy: {
        reasoningEffort: 'medium'
      },
      permissionPolicy: { ...DEFAULT_PERMISSION_POLICIES[mode] },
      budgetPolicy: {},
      version: 1,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }
  }

  function createSession({ mode, workspaceId, conversationId, projectId, parentSessionId, metadata, workflowSelection, resourceSelection, initialContract }) {
    const id = generateId('mode')
    const now = nowIso()
    const projectContext = projectId ? {
      projectId,
      projectType: metadata?.projectType || 'general',
      capabilityProfile: metadata?.capabilityProfile || [],
      rootPath: metadata?.projectRootPath || ''
    } : null

    const session = {
      id,
      conversationId: conversationId || null,
      workspaceId,
      projectId: projectId || null,
      mode,
      status: mode === 'direct' ? 'running' : 'draft',
      stateRef: `state://${id}/v1`,
      activeFlowId: null,
      activeRunId: null,
      parentSessionId: parentSessionId || null,
      forkedFromCheckpointId: null,
      currentPhase: mode === 'direct' ? 'direct' : 'initializing',
      stateVersion: 1,
      expectedVersion: 1,
      tokenUsage: 0,
      costEstimate: 0,
      turnCount: 0,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      failedAt: null,
      cancelledAt: null,
      errorMessage: null,
      errorCode: null,
      metadata: {
        ...(metadata || {}),
        initialContract: initialContract || null,
        workflowSelection: workflowSelection || null,
        resourceSelection: resourceSelection || null
      }
    }

    const binding = createDefaultBinding(mode, id, projectContext)

    if (resourceSelection) {
      if (Array.isArray(resourceSelection.soulIds)) {
        binding.souls = resourceSelection.soulIds.map(sid => ({
          soulId: sid,
          soulVersion: 1,
          contentHash: '',
          enabledAttributes: [],
          usageMode: 'method_reference',
          influenceStrength: 0.5,
          blockDirectImitation: true
        }))
      }
      if (Array.isArray(resourceSelection.skillIds)) {
        binding.skills = resourceSelection.skillIds.map(sid => ({
          skillId: sid,
          resolvedName: sid,
          source: 'session',
          contentHash: '',
          rootRef: '',
          requirements: [],
          allowedLinkedFiles: []
        }))
      }
    }

    sessions.set(id, session)
    events.set(id, [])
    checkpoints.set(id, [])
    bindings.set(id, binding)

    addEvent(id, mode, 'mode.created', { conversationId, projectId, mode })
    logRequest?.('mode', 'create', `Created ${mode} session ${id}`)

    if (initialContract) {
      addEvent(id, mode, 'mode.contract.initialized', { contractType: mode, hasContract: true })
    }

    return { ...session, binding }
  }

  function listSessions({ conversationId, workspaceId, projectId, mode, status, limit = 50, offset = 0 } = {}) {
    let result = Array.from(sessions.values())
    if (conversationId) result = result.filter(s => s.conversationId === conversationId)
    if (workspaceId) result = result.filter(s => s.workspaceId === workspaceId)
    if (projectId) result = result.filter(s => s.projectId === projectId)
    if (mode) result = result.filter(s => s.mode === mode)
    if (status) result = result.filter(s => s.status === status)
    result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return result.slice(offset, offset + limit)
  }

  function getActiveForConversation(conversationId) {
    const terminalStates = ['completed', 'failed', 'cancelled']
    const active = Array.from(sessions.values())
      .filter(s => s.conversationId === conversationId && !terminalStates.includes(s.status))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    const session = active[0] || null
    if (session) {
      const binding = getBinding(session.id)
      return { ...session, binding }
    }
    return null
  }

  function updateStatus(id, status, expectedVersion, extra = {}) {
    const session = sessions.get(id)
    if (!session) return { ok: false, error: 'Session not found' }
    if (session.stateVersion !== expectedVersion) {
      return { ok: false, error: 'Version conflict', code: 'VERSION_CONFLICT' }
    }
    const now = nowIso()
    session.status = status
    session.updatedAt = now
    session.stateVersion++
    if (status === 'completed') session.completedAt = now
    if (status === 'failed') {
      session.failedAt = now
      session.errorMessage = extra.errorMessage || null
      session.errorCode = extra.errorCode || null
    }
    if (status === 'cancelled') session.cancelledAt = now
    sessions.set(id, session)
    addEvent(id, session.mode, 'mode.status_changed', { to: status, ...extra })
    return { ok: true, session: { ...session, binding: getBinding(id) } }
  }

  function updatePhase(id, phase, expectedVersion, { activeFlowId, activeRunId } = {}) {
    const session = sessions.get(id)
    if (!session) return { ok: false, error: 'Session not found' }
    if (session.stateVersion !== expectedVersion) {
      return { ok: false, error: 'Version conflict', code: 'VERSION_CONFLICT' }
    }
    session.currentPhase = phase
    session.updatedAt = nowIso()
    session.stateVersion++
    if (activeFlowId !== undefined) session.activeFlowId = activeFlowId
    if (activeRunId !== undefined) session.activeRunId = activeRunId
    sessions.set(id, session)
    addEvent(id, session.mode, 'mode.phase_changed', { phase, activeFlowId, activeRunId })
    return { ok: true, session: { ...session, binding: getBinding(id) } }
  }

  function pause(id, expectedVersion, reason) {
    return updateStatus(id, 'paused', expectedVersion, { reason })
  }

  function resume(id, expectedVersion) {
    return updateStatus(id, 'running', expectedVersion)
  }

  function cancel(id, expectedVersion, reason) {
    return updateStatus(id, 'cancelled', expectedVersion, { reason })
  }

  function ready(id, expectedVersion) {
    return updateStatus(id, 'ready', expectedVersion)
  }

  function startRunning(id, expectedVersion) {
    return updateStatus(id, 'running', expectedVersion)
  }

  function waitForUser(id, expectedVersion, prompt, options) {
    return updateStatus(id, 'waiting_user', expectedVersion, { prompt, options: options || [] })
  }

  function complete(id, expectedVersion, summary) {
    return updateStatus(id, 'completed', expectedVersion, { summary })
  }

  function fail(id, expectedVersion, errorCode, errorMessage) {
    return updateStatus(id, 'failed', expectedVersion, { errorCode, errorMessage })
  }

  function block(id, expectedVersion, reason, requiredAction) {
    return updateStatus(id, 'blocked', expectedVersion, { reason, requiredAction })
  }

  function transitionPhase(id, phase, expectedVersion, activeFlowId, activeRunId) {
    return updatePhase(id, phase, expectedVersion, { activeFlowId, activeRunId })
  }

  function updateBindingWorkflow(modeSessionId, workflowSnapshot, expectedBindingVersion) {
    const binding = bindings.get(modeSessionId)
    if (!binding) return { ok: false, error: 'Binding not found' }
    if (binding.version !== expectedBindingVersion) {
      return { ok: false, error: 'Binding version conflict', code: 'VERSION_CONFLICT' }
    }
    binding.workflow = workflowSnapshot
    binding.version++
    binding.updatedAt = nowIso()
    bindings.set(modeSessionId, binding)
    addEvent(modeSessionId, sessions.get(modeSessionId)?.mode || 'direct', 'mode.binding.updated', {
      field: 'workflow', workflowId: workflowSnapshot?.workflowId
    })
    return { ok: true, binding }
  }

  function checkWorkflowCompatibility(modeSessionId, workflow, agents, source) {
    const session = sessions.get(modeSessionId)
    if (!session) return { ok: false, error: 'Session not found' }
    if (!modeCompatibilityCompiler) {
      return { ok: true, compatible: true, warning: 'Compatibility compiler not available' }
    }
    const result = modeCompatibilityCompiler.checkModeCompatibility(workflow, session.mode)
    return { ok: true, ...result }
  }

  function createCheckpoint(id, stateRef, label, metadata) {
    const session = sessions.get(id)
    if (!session) return null
    const checkpointId = generateId('ckpt')
    const checkpoint = {
      id: checkpointId,
      modeSessionId: id,
      stateRef,
      stateVersion: session.stateVersion,
      bindingVersion: bindings.get(id)?.version || 1,
      label: label || null,
      createdAt: nowIso(),
      metadata: metadata || {}
    }
    const sessionCheckpoints = checkpoints.get(id) || []
    sessionCheckpoints.push(checkpoint)
    checkpoints.set(id, sessionCheckpoints)
    addEvent(id, session.mode, 'mode.checkpoint.created', { checkpointId, label })
    return checkpoint
  }

  function getEvents(id, sinceSequence = 0, limit = 100) {
    const sessionEvents = events.get(id) || []
    return sessionEvents
      .filter(e => e.sequence > sinceSequence)
      .slice(0, limit)
  }

  function getSessionBinding(modeSessionId) {
    return bindings.get(modeSessionId) || null
  }

  function requestFlowRun(id, { workflowId, workflowVersion, phase, inputRefs, permissionEnvelope, budgetSnapshot, projectId }) {
    const session = sessions.get(id)
    if (!session) return { error: 'Session not found' }
    const binding = bindings.get(id)
    const runId = generateId('run')
    const commandId = generateId('cmd')

    if (binding?.workflow && binding.workflow.workflowId !== workflowId) {
      addEvent(id, session.mode, 'mode.flow_run.binding_mismatch', {
        requestedWorkflowId: workflowId, boundWorkflowId: binding.workflow.workflowId
      })
    }

    updatePhase(id, phase, session.stateVersion, workflowId, runId)
    addEvent(id, session.mode, 'mode.flow_run.requested', {
      commandId, runId, workflowId, phase
    })
    return {
      commandId,
      runId,
      modeSessionId: id,
      mode: session.mode,
      phase,
      workflowId,
      workflowVersion: workflowVersion || binding?.workflow?.workflowVersion || 1,
      inputRefs: inputRefs || [],
      permissionPolicy: binding?.permissionPolicy,
      status: 'requested'
    }
  }

  function completeFlowRun(id, runId, status, outputRefs, evidenceRefs, proposalRefs, tokenUsage, error) {
    const session = sessions.get(id)
    if (!session) return { ok: false, error: 'Session not found' }
    session.tokenUsage += tokenUsage || 0
    session.updatedAt = nowIso()
    session.activeRunId = null
    sessions.set(id, session)
    addEvent(id, session.mode, 'mode.flow_run.completed', {
      runId, status, outputRefs, evidenceRefs, proposalRefs, tokenUsage, error
    })
    return { ok: true, session: { ...session, binding: getBinding(id) } }
  }

  function incrementUsage(id, tokens = 0, cost = 0, turns = 0) {
    const session = sessions.get(id)
    if (!session) return
    session.tokenUsage += tokens
    session.costEstimate += cost
    session.turnCount += turns
    session.updatedAt = nowIso()
    sessions.set(id, session)
  }

  function createTransition(fromSessionId, toMode, mapping) {
    const fromSession = sessions.get(fromSessionId)
    if (!fromSession) return { ok: false, error: 'Source session not found' }

    const transitionId = generateId('trans')
    const toSession = createSession({
      mode: toMode,
      workspaceId: fromSession.workspaceId,
      conversationId: fromSession.conversationId,
      projectId: fromSession.projectId,
      parentSessionId: fromSessionId,
      metadata: {
        transitionId,
        transitionedFrom: fromSessionId,
        fromMode: fromSession.mode,
        mapping: mapping || {}
      }
    })

    addEvent(fromSessionId, fromSession.mode, 'mode.transitioned', {
      transitionId, toMode, toSessionId: toSession.id
    })

    return {
      ok: true,
      transitionId,
      fromSession: { ...fromSession, binding: getBinding(fromSessionId) },
      toSession
    }
  }

  function getEffectiveNodeResources(modeSessionId) {
    const binding = bindings.get(modeSessionId)
    if (!binding) return []

    const effective = []
    const workflow = binding.workflow
    if (workflow?.resolvedAgentIds) {
      effective.push({
        nodeId: 'workflow_default',
        souls: binding.souls.map(s => s.soulId),
        skills: binding.skills.map(s => s.skillId),
        tools: binding.tools.map(t => t.toolName),
        knowledgeSources: binding.knowledgeSources.map(k => k.sourceId),
        documentBindings: binding.documents.map(d => d.bindingId),
        overriddenResources: [],
        blockedResources: []
      })
    }
    return effective
  }

  function updateBinding(modeSessionId, updated, expectedVersion) {
    const session = sessions.get(modeSessionId)
    if (!session) return { ok: false, error: 'Session not found' }
    const cur = bindings.get(modeSessionId)
    if (!cur) return { ok: false, error: 'Binding not found' }
    if (expectedVersion && cur.version !== expectedVersion) {
      return { ok: false, error: 'Binding version conflict', code: 'VERSION_CONFLICT' }
    }
    const next = { ...cur, ...updated, id: cur.id, modeSessionId: cur.modeSessionId, version: cur.version + 1, updatedAt: nowIso() }
    bindings.set(modeSessionId, next)
    session.stateVersion = (session.stateVersion || 1) + 1
    session.updatedAt = next.updatedAt
    sessions.set(modeSessionId, session)
    return { ok: true, binding: next, session }
  }

  return {
    createSession,
    getSession: id => {
      const s = sessions.get(id)
      if (!s) return null
      return { ...s, binding: getBinding(id) }
    },
    listSessions,
    getActiveForConversation,
    pause,
    resume,
    cancel,
    ready,
    startRunning,
    waitForUser,
    complete,
    fail,
    block,
    transitionPhase,
    createCheckpoint,
    getEvents,
    getSessionBinding,
    getBinding,
    updateBinding,
    updateBindingWorkflow,
    checkWorkflowCompatibility,
    requestFlowRun,
    completeFlowRun,
    incrementUsage,
    createTransition,
    getEffectiveNodeResources
  }
}

module.exports = {
  createModeService,
  DEFAULT_PERMISSION_POLICIES
}
