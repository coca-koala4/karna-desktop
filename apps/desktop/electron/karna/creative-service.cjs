'use strict'

const crypto = require('node:crypto')

function createCreativeService({ logRequest, modeService }) {
  const contracts = new Map()
  const blackboards = new Map()
  const events = new Map()
  const proposals = new Map()
  const rejectedDirections = new Map()
  const checkpoints = new Map()

  function generateId(prefix = 'cre') {
    return `${prefix}_${crypto.randomBytes(8).toString('hex')}`
  }

  function nowIso() {
    return new Date().toISOString()
  }

  function appendEvent(modeSessionId, type, payload) {
    const list = events.get(modeSessionId) || []
    const eventId = generateId('crev')
    const seq = list.length + 1
    const ev = {
      id: eventId,
      modeSessionId,
      sequence: seq,
      type,
      payload,
      createdAt: nowIso()
    }
    list.push(ev)
    events.set(modeSessionId, list)
    return ev
  }

  function getContract(modeSessionId) {
    return contracts.get(modeSessionId) || null
  }

  function getBlackboard(modeSessionId) {
    return blackboards.get(modeSessionId) || null
  }

  function getEvents(modeSessionId, sinceSeq = 0, limit = 100) {
    const list = events.get(modeSessionId) || []
    return list.filter(e => e.sequence > sinceSeq).slice(0, limit)
  }

  function getProposals(modeSessionId) {
    return proposals.get(modeSessionId) || []
  }

  function getRejectedDirections(modeSessionId) {
    return rejectedDirections.get(modeSessionId) || []
  }

  function createContract(modeSessionId, draft) {
    const session = modeService.getSession(modeSessionId)
    if (!session) return { ok: false, error: 'Mode session not found' }
    if (session.mode !== 'living_work') {
      return { ok: false, error: `Cannot create creative contract for ${session.mode} mode` }
    }

    const issues = []
    if (!draft.workIdentity) issues.push('workIdentity is required')
    if (!draft.creativeIntent) issues.push('creativeIntent is required')
    if (!Array.isArray(draft.nonNegotiables) || draft.nonNegotiables.length === 0) {
      issues.push('At least one non-negotiable is required')
    }
    if (!draft.currentMilestone) issues.push('currentMilestone is required')

    if (issues.length > 0) {
      return { ok: false, error: 'Invalid contract', issues }
    }

    const contractId = generateId('crectr')
    const contract = {
      id: contractId,
      modeSessionId,
      version: 1,
      workIdentity: draft.workIdentity,
      creativeIntent: draft.creativeIntent,
      nonNegotiables: Array.isArray(draft.nonNegotiables) ? draft.nonNegotiables : [],
      protectedAmbiguities: Array.isArray(draft.protectedAmbiguities) ? draft.protectedAmbiguities : [],
      explorationSpace: Array.isArray(draft.explorationSpace) ? draft.explorationSpace : [],
      currentMilestone: draft.currentMilestone,
      autonomyLevel: draft.autonomyLevel || 'co_creator',
      handoffConditions: Array.isArray(draft.handoffConditions) ? draft.handoffConditions : [],
      budget: draft.budget || {},
      references: {
        storyBibleRef: draft.storyBibleRef || null,
        livingWikiRef: draft.livingWikiRef || null,
        narrativeStateRef: draft.narrativeStateRef || null,
        soulRefs: Array.isArray(draft.soulRefs) ? draft.soulRefs : []
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
      authorConfirmedAt: null
    }

    contracts.set(modeSessionId, contract)
    blackboards.set(modeSessionId, {
      modeSessionId,
      workVersionRef: null,
      workStatus: 'initializing',
      openQuestions: [],
      currentTensions: [],
      gaps: [],
      opportunities: [],
      candidateActions: [],
      impactAnalyses: [],
      acceptedDecisions: [],
      rejectedDirections: [],
      conflicts: [],
      critiqueRefs: [],
      pendingProposals: [],
      currentCheckpointId: null,
      currentMilestone: draft.currentMilestone,
      version: 1,
      updatedAt: nowIso()
    })
    events.set(modeSessionId, [])
    proposals.set(modeSessionId, [])
    rejectedDirections.set(modeSessionId, [])
    checkpoints.set(modeSessionId, [])

    appendEvent(modeSessionId, 'creative.contract_created', { contractId: contract.id })
    modeService.transitionPhase(modeSessionId, 'awaiting_contract_confirmation', session.stateVersion)

    return { ok: true, contract }
  }

  function confirmContract(modeSessionId, version) {
    const contract = getContract(modeSessionId)
    if (!contract) return { ok: false, error: 'Contract not found' }
    if (contract.version !== version) {
      return { ok: false, error: 'Version conflict', code: 'VERSION_CONFLICT' }
    }
    contract.authorConfirmedAt = nowIso()
    contract.updatedAt = nowIso()
    contracts.set(modeSessionId, contract)

    const bb = getBlackboard(modeSessionId)
    if (bb) {
      bb.workStatus = 'analyzing'
      bb.updatedAt = nowIso()
      blackboards.set(modeSessionId, bb)
    }

    appendEvent(modeSessionId, 'creative.contract_confirmed', { version })
    const session = modeService.getSession(modeSessionId)
    modeService.transitionPhase(modeSessionId, 'analyzing', session.stateVersion)

    return { ok: true, contract }
  }

  function proposeContractChange(modeSessionId, proposedChanges, reason) {
    const contract = getContract(modeSessionId)
    if (!contract) return { ok: false, error: 'Contract not found' }

    const proposal = {
      id: generateId('prop'),
      type: 'contract_change',
      proposedChanges,
      reason,
      status: 'pending_author',
      createdAt: nowIso()
    }

    const list = getProposals(modeSessionId)
    list.push(proposal)
    proposals.set(modeSessionId, list)

    appendEvent(modeSessionId, 'creative.contract_change_proposed', { proposalId: proposal.id })
    modeService.waitForUser(modeSessionId, modeService.getSession(modeSessionId)?.stateVersion || 1,
      'Creative contract modification proposed. Author approval required.', ['Approve', 'Reject'])

    return { ok: true, proposal }
  }

  function recordOpportunities(modeSessionId, opportunities, tensions, gaps) {
    const bb = getBlackboard(modeSessionId)
    if (!bb) return { ok: false, error: 'Blackboard not found' }

    bb.opportunities = Array.isArray(opportunities) ? opportunities : []
    bb.currentTensions = Array.isArray(tensions) ? tensions : []
    bb.gaps = Array.isArray(gaps) ? gaps : []
    bb.workStatus = 'generating_candidates'
    bb.updatedAt = nowIso()
    blackboards.set(modeSessionId, bb)

    appendEvent(modeSessionId, 'creative.opportunities_identified', {
      opportunityCount: bb.opportunities.length,
      tensionCount: bb.currentTensions.length,
      gapCount: bb.gaps.length
    })

    return { ok: true, blackboard: bb }
  }

  function generateCandidates(modeSessionId, candidates) {
    const bb = getBlackboard(modeSessionId)
    if (!bb) return { ok: false, error: 'Blackboard not found' }
    const contract = getContract(modeSessionId)
    if (!contract) return { ok: false, error: 'Contract not found' }

    const recorded = candidates.map(c => ({
      id: generateId('cand'),
      description: c.description || '',
      actionType: c.actionType || 'edit',
      targetArea: c.targetArea || '',
      riskLevel: c.riskLevel || 'medium',
      reversibility: c.reversibility || 'reversible',
      addressesTension: c.addressesTension || null,
      milestoneContribution: c.milestoneContribution || '',
      touchedEntities: Array.isArray(c.touchedEntities) ? c.touchedEntities : [],
      affectsProtectedAmbiguity: Array.isArray(contract.protectedAmbiguities) && contract.protectedAmbiguities.some(
        pa => c.description && c.description.toLowerCase().includes(String(pa).toLowerCase())
      ),
      violatesNonNegotiable: Array.isArray(contract.nonNegotiables) && contract.nonNegotiables.some(
        nn => c.description && c.description.toLowerCase().includes(String(nn).toLowerCase().split(' ')[0])
      ) ? false : false,
      createdAt: nowIso()
    }))

    bb.candidateActions = recorded
    bb.workStatus = 'analyzing_impact'
    bb.updatedAt = nowIso()
    blackboards.set(modeSessionId, bb)

    appendEvent(modeSessionId, 'creative.candidates_generated', { count: recorded.length })
    return { ok: true, candidates: recorded }
  }

  function performImpactAnalysis(modeSessionId, candidateId, analysis) {
    const bb = getBlackboard(modeSessionId)
    if (!bb) return { ok: false, error: 'Blackboard not found' }
    const contract = getContract(modeSessionId)
    if (!contract) return { ok: false, error: 'Contract not found' }

    const candidate = bb.candidateActions.find(c => c.id === candidateId)
    if (!candidate) return { ok: false, error: 'Candidate not found' }

    const impact = {
      candidateId,
      dimensions: {
        characters: analysis?.characters || { affected: [], changes: '' },
        plot: analysis?.plot || { affected: [], changes: '' },
        continuity: analysis?.continuity || { issues: [], assessment: '' },
        timeline: analysis?.timeline || { affected: [], changes: '' },
        foreshadowing: analysis?.foreshadowing || { added: [], resolved: [], broken: [] },
        theme: analysis?.theme || { reinforced: [], weakened: [] },
        style: analysis?.style || { consistency: '', drift: '' },
        workIdentity: analysis?.workIdentity || { preserved: true, concerns: [] }
      },
      contractConsistency: analysis?.contractConsistency || { consistent: true, violations: [] },
      reversible: candidate.reversibility === 'reversible',
      tokenEstimate: analysis?.tokenEstimate || 0,
      requiresAuthorDecision: candidate.riskLevel === 'high' || candidate.affectsProtectedAmbiguity || candidate.reversibility === 'irreversible',
      overallRecommendation: analysis?.recommendation || 'consider',
      createdAt: nowIso()
    }

    if (impact.requiresAuthorDecision && contract.autonomyLevel !== 'milestone_autonomous') {
      bb.pendingProposals.push(candidateId)
    }

    bb.impactAnalyses.push(impact)
    bb.updatedAt = nowIso()
    blackboards.set(modeSessionId, bb)

    appendEvent(modeSessionId, 'creative.impact_analyzed', { candidateId, requiresAuthorDecision: impact.requiresAuthorDecision })

    if (impact.requiresAuthorDecision) {
      const session = modeService.getSession(modeSessionId)
      modeService.waitForUser(modeSessionId, session?.stateVersion || 1,
        'High-risk or high-impact creative decision requires author input.', ['Approve candidate', 'Reject candidate', 'Request revision'])
    }

    return { ok: true, impact }
  }

  function selectCandidate(modeSessionId, candidateId, authorChoice = true) {
    const bb = getBlackboard(modeSessionId)
    if (!bb) return { ok: false, error: 'Blackboard not found' }
    const contract = getContract(modeSessionId)
    if (!contract) return { ok: false, error: 'Contract not found' }

    const candidate = bb.candidateActions.find(c => c.id === candidateId)
    if (!candidate) return { ok: false, error: 'Candidate not found' }

    const impact = bb.impactAnalyses.find(i => i.candidateId === candidateId)
    if (candidate.affectsProtectedAmbiguity && !authorChoice) {
      return rejectCandidate(modeSessionId, candidateId, 'Cannot automatically resolve protected ambiguity')
    }

    bb.candidateActions.forEach(c => {
      if (c.id !== candidateId) {
        recordRejectedDirection(modeSessionId, {
          direction: c.description,
          candidateId: c.id,
          reason: 'Not selected',
          canRetryIfStateChanges: true
        })
      }
    })

    bb.acceptedDecisions.push({
      candidateId,
      description: candidate.description,
      selectedAt: nowIso()
    })
    bb.workStatus = 'executing_candidate'
    bb.updatedAt = nowIso()
    blackboards.set(modeSessionId, bb)

    appendEvent(modeSessionId, 'creative.candidate_selected', { candidateId, authorChoice })

    const session = modeService.getSession(modeSessionId)
    modeService.transitionPhase(modeSessionId, 'executing_candidate', session?.stateVersion || 1)

    return { ok: true, candidate, impact }
  }

  function rejectCandidate(modeSessionId, candidateId, reason) {
    recordRejectedDirection(modeSessionId, {
      direction: 'candidate',
      candidateId,
      reason,
      canRetryIfStateChanges: true
    })
    appendEvent(modeSessionId, 'creative.candidate_rejected', { candidateId, reason })
    return { ok: true }
  }

  function recordRejectedDirection(modeSessionId, direction) {
    const list = getRejectedDirections(modeSessionId)
    const entry = {
      id: generateId('rej'),
      ...direction,
      recordedAt: nowIso()
    }
    list.push(entry)
    rejectedDirections.set(modeSessionId, list)

    const bb = getBlackboard(modeSessionId)
    if (bb) {
      bb.rejectedDirections.push(entry.id)
      bb.updatedAt = nowIso()
      blackboards.set(modeSessionId, bb)
    }
    return entry
  }

  function isDirectionRejected(modeSessionId, directionDescription) {
    const rejected = getRejectedDirections(modeSessionId)
    return rejected.some(r => {
      if (!directionDescription) return false
      return r.direction && directionDescription.toLowerCase().includes(String(r.direction).toLowerCase().slice(0, 30))
    })
  }

  function createWritebackProposal(modeSessionId, targetType, changes, candidateId) {
    const proposal = {
      id: generateId('prop'),
      type: 'knowledge_writeback',
      targetType,
      changes,
      candidateId,
      status: 'pending',
      createdAt: nowIso()
    }

    const contract = getContract(modeSessionId)
    if (targetType === 'soul') {
      proposal.status = 'rejected'
      proposal.rejectionReason = 'Direct Soul modification is permanently prohibited'
      appendEvent(modeSessionId, 'creative.proposal.rejected', { proposalId: proposal.id, reason: proposal.rejectionReason })
    }

    const list = getProposals(modeSessionId)
    list.push(proposal)
    proposals.set(modeSessionId, list)

    const bb = getBlackboard(modeSessionId)
    if (bb) {
      bb.pendingProposals.push(proposal.id)
      bb.updatedAt = nowIso()
      blackboards.set(modeSessionId, bb)
    }

    appendEvent(modeSessionId, 'creative.proposal.created', { proposalId: proposal.id, targetType })
    return { ok: true, proposal }
  }

  function approveProposal(modeSessionId, proposalId, decision) {
    const list = getProposals(modeSessionId)
    const proposal = list.find(p => p.id === proposalId)
    if (!proposal) return { ok: false, error: 'Proposal not found' }

    proposal.status = decision === 'approve' ? 'approved' : 'rejected'
    proposal.decidedAt = nowIso()
    proposal.decision = decision
    proposals.set(modeSessionId, list)

    const bb = getBlackboard(modeSessionId)
    if (bb) {
      bb.pendingProposals = bb.pendingProposals.filter(id => id !== proposalId)
      bb.updatedAt = nowIso()
      blackboards.set(modeSessionId, bb)
    }

    appendEvent(modeSessionId, 'creative.proposal.decided', { proposalId, decision })

    return { ok: true, proposal }
  }

  function completeCandidateExecution(modeSessionId, artifactRefs, diffRefs) {
    const bb = getBlackboard(modeSessionId)
    if (!bb) return { ok: false, error: 'Blackboard not found' }
    const contract = getContract(modeSessionId)
    if (!contract) return { ok: false, error: 'Contract not found' }

    bb.workStatus = 'checking_milestone'
    bb.workVersionRef = artifactRefs?.[0] || bb.workVersionRef
    bb.updatedAt = nowIso()
    blackboards.set(modeSessionId, bb)

    appendEvent(modeSessionId, 'creative.candidate_executed', { artifactRefs, diffRefs })

    const milestoneMet = false
    if (milestoneMet) {
      const session = modeService.getSession(modeSessionId)
      modeService.waitForUser(modeSessionId, session?.stateVersion || 1,
        `Milestone "${contract.currentMilestone}" appears complete. Author review required.`,
        ['Approve milestone', 'Request revisions', 'Continue working'])
      appendEvent(modeSessionId, 'creative.milestone_reached', { milestone: contract.currentMilestone })
      return { ok: true, milestoneReached: true }
    }

    bb.workStatus = 'analyzing'
    bb.candidateActions = []
    bb.impactAnalyses = []
    bb.updatedAt = nowIso()
    blackboards.set(modeSessionId, bb)

    return { ok: true, milestoneReached: false }
  }

  function handoffToAuthor(modeSessionId, reason, candidates) {
    const session = modeService.getSession(modeSessionId)
    if (!session) return { ok: false, error: 'Session not found' }

    appendEvent(modeSessionId, 'creative.handoff', { reason, candidateCount: candidates?.length || 0 })
    return modeService.waitForUser(modeSessionId, session.stateVersion, reason,
      (candidates || []).map((c, i) => `Option ${i + 1}: ${c.description?.slice(0, 60)}`).concat(['Provide direction', 'Pause']))
  }

  function createCheckpoint(modeSessionId, label) {
    const ckptId = generateId('cckpt')
    const bb = getBlackboard(modeSessionId)
    const ckpt = {
      id: ckptId,
      modeSessionId,
      label,
      blackboardVersion: bb?.version,
      eventCount: getEvents(modeSessionId).length,
      createdAt: nowIso()
    }
    const list = checkpoints.get(modeSessionId) || []
    list.push(ckpt)
    checkpoints.set(modeSessionId, list)

    if (bb) {
      bb.currentCheckpointId = ckptId
      blackboards.set(modeSessionId, bb)
    }

    appendEvent(modeSessionId, 'creative.checkpoint_created', { checkpointId: ckptId, label })
    modeService.createCheckpoint(modeSessionId, `creative://${modeSessionId}/${ckptId}`, label)
    return { ok: true, checkpoint: ckpt }
  }

  function rebuildBlackboard(modeSessionId) {
    const evts = getEvents(modeSessionId)
    const newBb = {
      modeSessionId,
      workVersionRef: null,
      workStatus: 'initializing',
      openQuestions: [],
      currentTensions: [],
      gaps: [],
      opportunities: [],
      candidateActions: [],
      impactAnalyses: [],
      acceptedDecisions: [],
      rejectedDirections: getRejectedDirections(modeSessionId).map(r => r.id),
      conflicts: [],
      critiqueRefs: [],
      pendingProposals: [],
      currentCheckpointId: null,
      currentMilestone: getContract(modeSessionId)?.currentMilestone || '',
      version: 1,
      updatedAt: nowIso()
    }

    for (const ev of evts) {
      switch (ev.type) {
        case 'creative.contract_confirmed':
          newBb.workStatus = 'analyzing'
          break
        case 'creative.opportunities_identified':
          newBb.workStatus = 'generating_candidates'
          break
        case 'creative.candidates_generated':
          newBb.workStatus = 'analyzing_impact'
          break
        case 'creative.candidate_selected':
          newBb.workStatus = 'executing_candidate'
          break
        case 'creative.candidate_executed':
          newBb.workStatus = 'checking_milestone'
          break
        case 'creative.checkpoint_created':
          newBb.currentCheckpointId = ev.payload?.checkpointId
          break
      }
    }

    blackboards.set(modeSessionId, newBb)
    return newBb
  }

  function getCreativeSnapshot(modeSessionId) {
    const contract = getContract(modeSessionId)
    if (!contract) return null
    return {
      contract,
      blackboard: getBlackboard(modeSessionId),
      events: getEvents(modeSessionId),
      proposals: getProposals(modeSessionId),
      rejectedDirections: getRejectedDirections(modeSessionId),
      checkpoints: checkpoints.get(modeSessionId) || []
    }
  }

  return {
    createContract,
    confirmContract,
    proposeContractChange,
    recordOpportunities,
    generateCandidates,
    performImpactAnalysis,
    selectCandidate,
    rejectCandidate,
    createWritebackProposal,
    approveProposal,
    completeCandidateExecution,
    handoffToAuthor,
    createCheckpoint,
    rebuildBlackboard,
    isDirectionRejected,
    getContract,
    getBlackboard,
    getEvents,
    getProposals,
    getRejectedDirections,
    getCreativeSnapshot
  }
}

module.exports = { createCreativeService }
