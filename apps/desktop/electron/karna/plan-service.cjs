'use strict'

const crypto = require('node:crypto')

const PLAN_PHASES = [
  'draft',
  'investigating',
  'structuring',
  'validating',
  'ready_for_review',
  'revised',
  'converted'
]

function createPlanService({ logRequest, modeService }) {
  const planDocuments = new Map()
  const planVersions = new Map()
  const investigationEvidence = new Map()

  function generateId(prefix = 'plan') {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`
  }

  function nowIso() {
    return new Date().toISOString()
  }

  function createEmptyPlanDocument(objective) {
    return {
      objective: objective || '',
      explanation: '',
      confirmedFacts: [],
      evidenceRefs: [],
      assumptions: [],
      constraints: [],
      outOfScope: [],
      affectedAreas: [],
      steps: [],
      risks: [],
      validationStrategy: [],
      unresolvedQuestions: [],
      executionReadiness: 'not_ready'
    }
  }

  function getPlan(modeSessionId) {
    return planDocuments.get(modeSessionId) || null
  }

  function getVersions(modeSessionId) {
    return planVersions.get(modeSessionId) || []
  }

  function getEvidence(modeSessionId) {
    return investigationEvidence.get(modeSessionId) || []
  }

  function saveVersion(modeSessionId, plan, author = 'system', message = '') {
    const versions = planVersions.get(modeSessionId) || []
    const version = versions.length + 1
    const planVersion = {
      id: generateId('planv'),
      modeSessionId,
      version,
      plan: JSON.parse(JSON.stringify(plan)),
      author,
      message,
      createdAt: nowIso()
    }
    versions.push(planVersion)
    planVersions.set(modeSessionId, versions)
    return planVersion
  }

  function createPlan(modeSessionId, { objective, context }) {
    const session = modeService.getSession(modeSessionId)
    if (!session) return { ok: false, error: 'Mode session not found' }
    if (session.mode !== 'plan') {
      return { ok: false, error: `Cannot create plan for ${session.mode} mode session` }
    }

    const plan = createEmptyPlanDocument(objective)
    if (context) plan.context = context

    const docId = generateId('plandoc')
    const document = {
      id: docId,
      modeSessionId,
      version: 1,
      ...plan,
      createdAt: nowIso(),
      updatedAt: nowIso()
    }

    planDocuments.set(modeSessionId, document)
    planVersions.set(modeSessionId, [])
    investigationEvidence.set(modeSessionId, [])
    saveVersion(modeSessionId, document, 'system', 'Initial plan creation')

    modeService.transitionPhase(modeSessionId, 'draft', session.stateVersion)
    logRequest?.('plan', 'create', `Created plan for session ${modeSessionId}`)

    return { ok: true, plan: document }
  }

  function updatePlan(modeSessionId, updates, expectedVersion, author = 'user', message = 'Manual edit') {
    const plan = planDocuments.get(modeSessionId)
    if (!plan) return { ok: false, error: 'Plan not found' }
    if (plan.version !== expectedVersion) {
      return { ok: false, error: 'Version conflict', code: 'VERSION_CONFLICT' }
    }

    const allowedFields = [
      'objective', 'explanation', 'assumptions', 'constraints', 'outOfScope',
      'affectedAreas', 'risks', 'validationStrategy', 'unresolvedQuestions', 'executionReadiness'
    ]

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        plan[field] = updates[field]
      }
    }

    if (Array.isArray(updates.steps)) {
      plan.steps = updates.steps.map((step, idx) => ({
        id: step.id || `step_${idx + 1}`,
        description: step.description || '',
        dependencies: step.dependencies || [],
        required: step.required !== false
      }))
    }

    plan.version++
    plan.updatedAt = nowIso()
    planDocuments.set(modeSessionId, plan)
    const savedVersion = saveVersion(modeSessionId, plan, author, message)

    return { ok: true, plan, version: savedVersion }
  }

  function addEvidence(modeSessionId, evidence) {
    const plan = planDocuments.get(modeSessionId)
    if (!plan) return { ok: false, error: 'Plan not found' }
    const evidenceList = investigationEvidence.get(modeSessionId) || []
    const evidenceItem = {
      id: generateId('ev'),
      source: evidence.source || 'unknown',
      sourceRef: evidence.sourceRef || '',
      content: evidence.content || '',
      relevance: evidence.relevance || '',
      supportsFacts: Array.isArray(evidence.supportsFacts) ? evidence.supportsFacts : [],
      createdAt: nowIso()
    }
    evidenceList.push(evidenceItem)
    investigationEvidence.set(modeSessionId, evidenceList)
    return { ok: true, evidence: evidenceItem }
  }

  function addFact(modeSessionId, fact, evidenceRefs) {
    const plan = planDocuments.get(modeSessionId)
    if (!plan) return { ok: false, error: 'Plan not found' }
    const factItem = {
      id: generateId('fact'),
      statement: fact,
      evidenceRefs: Array.isArray(evidenceRefs) ? evidenceRefs : [],
      confirmedAt: nowIso()
    }
    plan.confirmedFacts.push(factItem)
    plan.updatedAt = nowIso()
    planDocuments.set(modeSessionId, plan)
    return { ok: true, fact: factItem }
  }

  function startInvestigation(modeSessionId) {
    const session = modeService.getSession(modeSessionId)
    if (!session) return { ok: false, error: 'Session not found' }
    return modeService.transitionPhase(modeSessionId, 'investigating', session.stateVersion)
  }

  function startStructuring(modeSessionId) {
    const session = modeService.getSession(modeSessionId)
    if (!session) return { ok: false, error: 'Session not found' }
    return modeService.transitionPhase(modeSessionId, 'structuring', session.stateVersion)
  }

  function startValidating(modeSessionId) {
    const session = modeService.getSession(modeSessionId)
    if (!session) return { ok: false, error: 'Session not found' }
    const plan = getPlan(modeSessionId)
    if (!plan) return { ok: false, error: 'Plan not found' }

    const issues = []
    if (!plan.objective) issues.push('Missing objective')
    if (plan.steps.length === 0) issues.push('No steps defined')
    if (plan.unresolvedQuestions.length > 0) issues.push(`Has ${plan.unresolvedQuestions.length} unresolved questions`)

    const result = modeService.transitionPhase(modeSessionId, 'validating', session.stateVersion)
    return { ok: true, ...result, validationIssues: issues, ready: issues.length === 0 }
  }

  function markReadyForReview(modeSessionId) {
    const session = modeService.getSession(modeSessionId)
    if (!session) return { ok: false, error: 'Session not found' }
    const plan = getPlan(modeSessionId)
    if (plan) {
      plan.executionReadiness = 'ready'
      plan.updatedAt = nowIso()
      planDocuments.set(modeSessionId, plan)
    }
    return modeService.transitionPhase(modeSessionId, 'ready_for_review', session.stateVersion)
  }

  function revise(modeSessionId, feedback) {
    const session = modeService.getSession(modeSessionId)
    if (!session) return { ok: false, error: 'Session not found' }
    const plan = getPlan(modeSessionId)
    if (plan) {
      plan.executionReadiness = 'needs_revision'
      plan.updatedAt = nowIso()
      planDocuments.set(modeSessionId, plan)
    }
    const result = modeService.transitionPhase(modeSessionId, 'revised', session.stateVersion)
    return { ok: true, ...result, feedback }
  }

  function convert(modeSessionId, toMode, mapping) {
    const plan = getPlan(modeSessionId)
    if (!plan) return { ok: false, error: 'Plan not found' }

    const transitionResult = modeService.createTransition(modeSessionId, toMode, {
      ...mapping,
      planObjective: plan.objective,
      planConstraints: plan.constraints,
      planSteps: plan.steps,
      planRisks: plan.risks,
      planFacts: plan.confirmedFacts,
      planValidationStrategy: plan.validationStrategy
    })

    if (transitionResult.ok) {
      const session = modeService.getSession(modeSessionId)
      if (session) {
        modeService.transitionPhase(modeSessionId, 'converted', session.stateVersion)
      }
    }

    return transitionResult
  }

  function getPlanSnapshot(modeSessionId) {
    const plan = getPlan(modeSessionId)
    if (!plan) return null
    return {
      plan,
      versions: getVersions(modeSessionId),
      evidence: getEvidence(modeSessionId),
      totalVersions: getVersions(modeSessionId).length
    }
  }

  return {
    createPlan,
    getPlan,
    updatePlan,
    addEvidence,
    addFact,
    startInvestigation,
    startStructuring,
    startValidating,
    markReadyForReview,
    revise,
    convert,
    getVersions,
    getEvidence,
    getPlanSnapshot,
    PLAN_PHASES
  }
}

module.exports = {
  createPlanService,
  PLAN_PHASES
}
