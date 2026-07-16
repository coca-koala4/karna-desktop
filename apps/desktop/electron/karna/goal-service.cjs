'use strict'

const crypto = require('node:crypto')

function createGoalService({ logRequest, modeService }) {
  const contracts = new Map()
  const actions = new Map()
  const evidence = new Map()
  const failedApproaches = new Map()

  function generateId(prefix = 'goal') {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`
  }

  function nowIso() {
    return new Date().toISOString()
  }

  function getContract(modeSessionId) {
    return contracts.get(modeSessionId) || null
  }

  function getActions(modeSessionId) {
    return actions.get(modeSessionId) || []
  }

  function getEvidence(modeSessionId) {
    return evidence.get(modeSessionId) || []
  }

  function getFailedApproaches(modeSessionId) {
    return failedApproaches.get(modeSessionId) || []
  }

  function validateContract(draft) {
    const issues = []
    if (!draft.objective) issues.push('Objective is required')
    if (!Array.isArray(draft.successCriteria) || draft.successCriteria.length === 0) {
      issues.push('At least one success criterion is required')
    } else {
      const hasRequired = draft.successCriteria.some(c => c.required !== false)
      if (!hasRequired) issues.push('At least one required success criterion is needed')
      for (const c of draft.successCriteria) {
        if (!c.description) issues.push('Criterion missing description')
        if (!c.verificationMethod) issues.push(`Criterion "${c.description || 'unknown'}" missing verificationMethod`)
      }
    }
    if (draft.budget) {
      if (draft.budget.maxTokens !== undefined && draft.budget.maxTokens <= 0) {
        issues.push('maxTokens must be positive')
      }
      if (draft.budget.maxTurns !== undefined && draft.budget.maxTurns <= 0) {
        issues.push('maxTurns must be positive')
      }
    }
    return issues
  }

  function createContract(modeSessionId, draft) {
    const session = modeService.getSession(modeSessionId)
    if (!session) return { ok: false, error: 'Mode session not found' }
    if (session.mode !== 'goal') {
      return { ok: false, error: `Cannot create goal contract for ${session.mode} mode` }
    }

    const issues = validateContract(draft)
    if (issues.length > 0) {
      return { ok: false, error: 'Invalid contract', issues }
    }

    const contractId = generateId('goalctr')
    const contract = {
      id: contractId,
      modeSessionId,
      version: 1,
      objective: draft.objective,
      successCriteria: (draft.successCriteria || []).map((c, idx) => ({
        id: c.id || `crit_${idx + 1}`,
        description: c.description,
        verificationMethod: c.verificationMethod,
        required: c.required !== false,
        status: 'pending',
        evidenceRefs: [],
        lastVerifiedAt: null,
        verificationResult: null
      })),
      constraints: Array.isArray(draft.constraints) ? draft.constraints : [],
      scope: draft.scope || '',
      verificationPolicy: draft.verificationPolicy || {
        requireEvidenceForAll: true,
        judgeBlockedAsDone: false,
        judgeWaitingAsDone: false
      },
      autonomyPolicy: draft.autonomyPolicy || {
        allowedTools: [],
        requiresApprovalFor: ['file_write', 'shell', 'knowledge_writeback'],
        autoContinue: true
      },
      budget: draft.budget || { maxTokens: undefined, maxCost: undefined, maxTurns: 50, maxTimeMinutes: undefined },
      stopConditions: Array.isArray(draft.stopConditions) ? draft.stopConditions : ['all_criteria_met', 'budget_exceeded', 'user_cancelled'],
      humanGates: Array.isArray(draft.humanGates) ? draft.humanGates : [],
      currentStrategy: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }

    contracts.set(modeSessionId, contract)
    actions.set(modeSessionId, [])
    evidence.set(modeSessionId, [])
    failedApproaches.set(modeSessionId, [])

    modeService.transitionPhase(modeSessionId, 'planning', session.stateVersion)
    logRequest?.('goal', 'create', `Created goal contract ${contractId} for ${modeSessionId}`)

    return { ok: true, contract }
  }

  function recordAction(modeSessionId, action) {
    const contract = getContract(modeSessionId)
    if (!contract) return { ok: false, error: 'Contract not found' }

    const actionRecord = {
      id: generateId('act'),
      modeSessionId,
      type: action.type || 'general',
      description: action.description || '',
      supportsCriteria: Array.isArray(action.supportsCriteria) ? action.supportsCriteria : [],
      flowRunId: action.flowRunId || null,
      input: action.input || null,
      output: action.output || null,
      status: action.status || 'pending',
      startedAt: nowIso(),
      completedAt: null,
      tokenUsage: 0,
      error: null
    }

    const list = getActions(modeSessionId)
    list.push(actionRecord)
    actions.set(modeSessionId, list)
    return { ok: true, action: actionRecord }
  }

  function completeAction(modeSessionId, actionId, result) {
    const list = getActions(modeSessionId)
    const action = list.find(a => a.id === actionId)
    if (!action) return { ok: false, error: 'Action not found' }

    action.status = result?.status || 'completed'
    action.output = result?.output || null
    action.completedAt = nowIso()
    action.tokenUsage = result?.tokenUsage || 0
    action.error = result?.error || null

    if (action.status === 'failed') {
      recordFailedApproach(modeSessionId, {
        actionSignature: actionSignature(action),
        actionId: action.id,
        input: action.input,
        output: action.output,
        failureReason: result?.error || 'Unknown failure',
        relatedEvidence: [],
        retryable: result?.retryable !== false,
        requiredStateChange: result?.requiredStateChange || null
      })
    }

    return { ok: true, action }
  }

  function actionSignature(action) {
    const sig = {
      type: action.type,
      description: action.description?.slice(0, 200),
      inputKeys: action.input ? Object.keys(action.input).sort().join(',') : ''
    }
    return crypto.createHash('md5').update(JSON.stringify(sig)).digest('hex').slice(0, 12)
  }

  function recordFailedApproach(modeSessionId, approach) {
    const list = getFailedApproaches(modeSessionId)
    list.push({
      id: generateId('fail'),
      ...approach,
      recordedAt: nowIso()
    })
    failedApproaches.set(modeSessionId, list)
  }

  function isApproachFailed(modeSessionId, candidateAction) {
    const failed = getFailedApproaches(modeSessionId)
    const sig = actionSignature(candidateAction)
    return failed.some(f => f.actionSignature === sig && f.requiredStateChange === null)
  }

  function addEvidence(modeSessionId, criterionId, evidenceItem) {
    const contract = getContract(modeSessionId)
    if (!contract) return { ok: false, error: 'Contract not found' }

    const criterion = contract.successCriteria.find(c => c.id === criterionId)
    if (!criterion) return { ok: false, error: 'Criterion not found' }

    const evidenceRecord = {
      id: generateId('ev'),
      modeSessionId,
      criterionId,
      source: evidenceItem.source || 'action',
      sourceRef: evidenceItem.sourceRef || '',
      content: evidenceItem.content || '',
      artifactRefs: Array.isArray(evidenceItem.artifactRefs) ? evidenceItem.artifactRefs : [],
      actionId: evidenceItem.actionId || null,
      supportsPassing: evidenceItem.supportsPassing !== false,
      createdAt: nowIso()
    }

    const evList = getEvidence(modeSessionId)
    evList.push(evidenceRecord)
    evidence.set(modeSessionId, evList)

    if (!criterion.evidenceRefs.includes(evidenceRecord.id)) {
      criterion.evidenceRefs.push(evidenceRecord.id)
    }
    contract.updatedAt = nowIso()
    contracts.set(modeSessionId, contract)

    return { ok: true, evidence: evidenceRecord }
  }

  function performAlignmentCheck(modeSessionId, proposedAction) {
    const contract = getContract(modeSessionId)
    if (!contract) return { ok: false, passed: false, reason: 'Contract not found' }

    const issues = []

    if (proposedAction.description && proposedAction.description.length > 0) {
      const objectiveLower = contract.objective.toLowerCase()
      const actionLower = proposedAction.description.toLowerCase()
      if (!actionLower.includes(' ') && objectiveLower.length > 10) {
        // not a hard fail, just note
      }
    }

    if (Array.isArray(proposedAction.supportsCriteria) && proposedAction.supportsCriteria.length > 0) {
      for (const critId of proposedAction.supportsCriteria) {
        const found = contract.successCriteria.find(c => c.id === critId)
        if (!found) {
          issues.push(`Action references unknown criterion: ${critId}`)
        }
      }
    } else {
      issues.push('Action does not state which success criteria it supports')
    }

    if (Array.isArray(contract.constraints)) {
      for (const constraint of contract.constraints) {
        if (typeof constraint === 'string' && constraint.toLowerCase().includes('scope')) {
          if (proposedAction.description) {
          }
        }
      }
    }

    if (isApproachFailed(modeSessionId, proposedAction)) {
      issues.push('This approach has already failed without a state change; repeating it is prohibited')
    }

    const failedList = getFailedApproaches(modeSessionId)
    const session = modeService.getSession(modeSessionId)
    if (session && contract.budget?.maxTurns && session.turnCount >= contract.budget.maxTurns) {
      issues.push(`Budget exceeded: ${session.turnCount}/${contract.budget.maxTurns} turns`)
    }

    return {
      ok: issues.length === 0,
      passed: issues.length === 0,
      issues,
      supportsCriteria: proposedAction.supportsCriteria || []
    }
  }

  function verifyCriterion(modeSessionId, criterionId, result, verifierType = 'agent_judge') {
    const contract = getContract(modeSessionId)
    if (!contract) return { ok: false, error: 'Contract not found' }

    const criterion = contract.successCriteria.find(c => c.id === criterionId)
    if (!criterion) return { ok: false, error: 'Criterion not found' }

    const isBlocked = result?.status === 'blocked' || result?.blocked === true
    const isWaiting = result?.status === 'waiting_user' || result?.waiting === true
    const isDone = result?.passed === true || result?.status === 'passed'

    if (isBlocked) {
      criterion.status = 'blocked'
      criterion.verificationResult = { status: 'blocked', reason: result?.reason || 'Blocked' }
    } else if (isWaiting) {
      criterion.status = 'waiting_user'
      criterion.verificationResult = { status: 'waiting_user', prompt: result?.prompt || 'Waiting for user input' }
    } else if (isDone) {
      criterion.status = 'passed'
      criterion.verificationResult = { status: 'passed', summary: result?.summary || 'Passed' }
    } else {
      criterion.status = 'failed'
      criterion.verificationResult = { status: 'failed', reason: result?.reason || 'Not met' }
    }

    criterion.lastVerifiedAt = nowIso()
    contract.updatedAt = nowIso()
    contracts.set(modeSessionId, contract)

    return { ok: true, criterion }
  }

  function evaluateGoalCompletion(modeSessionId) {
    const contract = getContract(modeSessionId)
    if (!contract) return { completed: false, reason: 'Contract not found' }

    const requiredCriteria = contract.successCriteria.filter(c => c.required !== false)
    const allPassed = requiredCriteria.every(c => c.status === 'passed')
    const anyBlocked = contract.successCriteria.some(c => c.status === 'blocked')
    const anyWaiting = contract.successCriteria.some(c => c.status === 'waiting_user')

    if (anyBlocked) {
      return {
        completed: false,
        shouldBlock: true,
        shouldWait: false,
        reason: 'One or more criteria are blocked',
        blockedCriteria: contract.successCriteria.filter(c => c.status === 'blocked').map(c => c.id)
      }
    }

    if (anyWaiting) {
      return {
        completed: false,
        shouldBlock: false,
        shouldWait: true,
        reason: 'Waiting for user input',
        waitingCriteria: contract.successCriteria.filter(c => c.status === 'waiting_user').map(c => c.id)
      }
    }

    if (allPassed) {
      return {
        completed: true,
        shouldBlock: false,
        shouldWait: false,
        reason: 'All required criteria passed',
        passedCount: requiredCriteria.length,
        totalCriteria: contract.successCriteria.length
      }
    }

    return {
      completed: false,
      shouldBlock: false,
      shouldWait: false,
      reason: 'Not all required criteria passed',
      passedCriteria: requiredCriteria.filter(c => c.status === 'passed').map(c => c.id),
      pendingCriteria: requiredCriteria.filter(c => c.status === 'pending').map(c => c.id),
      failedCriteria: requiredCriteria.filter(c => c.status === 'failed').map(c => c.id)
    }
  }

  function start(modeSessionId) {
    const session = modeService.getSession(modeSessionId)
    if (!session) return { ok: false, error: 'Session not found' }
    const contract = getContract(modeSessionId)
    if (!contract) return { ok: false, error: 'Contract not found' }

    modeService.transitionPhase(modeSessionId, 'executing', session.stateVersion)
    return { ok: true, contract }
  }

  function replan(modeSessionId, reason) {
    const session = modeService.getSession(modeSessionId)
    if (!session) return { ok: false, error: 'Session not found' }
    modeService.transitionPhase(modeSessionId, 'replanning', session.stateVersion)
    logRequest?.('goal', 'replan', `Replanning ${modeSessionId}: ${reason}`)
    return { ok: true, reason }
  }

  function checkpoint(modeSessionId, label) {
    return modeService.createCheckpoint(modeSessionId, `goal://${modeSessionId}/state`, label, {
      goalContractVersion: getContract(modeSessionId)?.version
    })
  }

  function getGoalSnapshot(modeSessionId) {
    const contract = getContract(modeSessionId)
    if (!contract) return null
    return {
      contract,
      actions: getActions(modeSessionId),
      evidence: getEvidence(modeSessionId),
      failedApproaches: getFailedApproaches(modeSessionId),
      completionStatus: evaluateGoalCompletion(modeSessionId),
      actionCount: getActions(modeSessionId).length,
      evidenceCount: getEvidence(modeSessionId).length,
      failedCount: getFailedApproaches(modeSessionId).length
    }
  }

  return {
    createContract,
    getContract,
    recordAction,
    completeAction,
    addEvidence,
    performAlignmentCheck,
    verifyCriterion,
    evaluateGoalCompletion,
    start,
    replan,
    checkpoint,
    isApproachFailed,
    getActions,
    getEvidence,
    getFailedApproaches,
    getGoalSnapshot
  }
}

module.exports = { createGoalService }
