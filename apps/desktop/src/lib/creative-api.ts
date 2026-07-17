import type {
  CreateCreativeContractRequest,
  CreativeSnapshot,
  CreativeContract,
  CreativeBlackboard,
  CreativeEvent,
  RecordOpportunitiesRequest,
  GenerateCandidatesRequest,
  CreativeCandidate,
  PerformImpactRequest,
  ImpactAnalysis,
  CreateProposalRequest,
  CreativeProposal,
  DecideProposalRequest,
  CompleteExecuteRequest,
  HandoffRequest,
  CreativeCheckpoint
} from '@/types/mode'

interface HermesApiRequest {
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: unknown
}

interface HermesDesktop {
  api: <T>(request: HermesApiRequest) => Promise<T>
}

function getDesktopApi(): HermesDesktop['api'] {
  if (typeof window === 'undefined') {
    throw new Error('当前窗口不可用')
  }
  const desktop = (window as unknown as { hermesDesktop?: HermesDesktop; karnaDesktop?: HermesDesktop }).karnaDesktop
    || (window as unknown as { hermesDesktop?: HermesDesktop }).hermesDesktop
  if (!desktop) {
    throw new Error('Karna desktop API not available')
  }
  return desktop.api.bind(desktop)
}

export const creativeApi = {
  createContract(data: CreateCreativeContractRequest): Promise<{ ok: boolean; contract?: CreativeContract; error?: string; issues?: string[] }> {
    return getDesktopApi()({
      path: '/api/karna/creative/contracts',
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; contract?: CreativeContract; error?: string; issues?: string[] }>
  },

  get(modeSessionId: string): Promise<CreativeSnapshot | { error: string }> {
    return getDesktopApi()({
      path: `/api/karna/creative/${modeSessionId}`
    }) as Promise<CreativeSnapshot | { error: string }>
  },

  confirmContract(modeSessionId: string, version: number): Promise<{ ok: boolean; contract?: CreativeContract; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/creative/${modeSessionId}/confirm`,
      method: 'POST',
      body: { version }
    }) as Promise<{ ok: boolean; contract?: CreativeContract; error?: string }>
  },

  getBlackboard(modeSessionId: string): Promise<CreativeBlackboard | { error: string }> {
    return getDesktopApi()({
      path: `/api/karna/creative/${modeSessionId}/blackboard`
    }) as Promise<CreativeBlackboard | { error: string }>
  },

  getEvents(modeSessionId: string, since = 0, limit = 100): Promise<CreativeEvent[]> {
    return getDesktopApi()({
      path: `/api/karna/creative/${modeSessionId}/events?since=${since}&limit=${limit}`
    }) as Promise<CreativeEvent[]>
  },

  recordOpportunities(modeSessionId: string, data: RecordOpportunitiesRequest): Promise<{ ok: boolean; blackboard?: CreativeBlackboard; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/creative/${modeSessionId}/opportunities`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; blackboard?: CreativeBlackboard; error?: string }>
  },

  generateCandidates(modeSessionId: string, data: GenerateCandidatesRequest): Promise<{ ok: boolean; candidates?: CreativeCandidate[]; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/creative/${modeSessionId}/candidates`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; candidates?: CreativeCandidate[]; error?: string }>
  },

  performImpactAnalysis(modeSessionId: string, candidateId: string, data: PerformImpactRequest): Promise<{ ok: boolean; impact?: ImpactAnalysis; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/creative/${modeSessionId}/candidates/${candidateId}/impact`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; impact?: ImpactAnalysis; error?: string }>
  },

  selectCandidate(modeSessionId: string, candidateId: string, authorChoice = true): Promise<{ ok: boolean; candidate?: CreativeCandidate; impact?: ImpactAnalysis; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/creative/${modeSessionId}/candidates/${candidateId}/select`,
      method: 'POST',
      body: { authorChoice }
    }) as Promise<{ ok: boolean; candidate?: CreativeCandidate; impact?: ImpactAnalysis; error?: string }>
  },

  rejectCandidate(modeSessionId: string, candidateId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/creative/${modeSessionId}/candidates/${candidateId}/reject`,
      method: 'POST',
      body: { reason }
    }) as Promise<{ ok: boolean; error?: string }>
  },

  completeExecution(modeSessionId: string, data: CompleteExecuteRequest): Promise<{ ok: boolean; milestoneReached?: boolean; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/creative/${modeSessionId}/execute-complete`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; milestoneReached?: boolean; error?: string }>
  },

  createProposal(modeSessionId: string, data: CreateProposalRequest): Promise<{ ok: boolean; proposal?: CreativeProposal; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/creative/${modeSessionId}/proposals`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; proposal?: CreativeProposal; error?: string }>
  },

  decideProposal(modeSessionId: string, proposalId: string, data: DecideProposalRequest): Promise<{ ok: boolean; proposal?: CreativeProposal; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/creative/${modeSessionId}/proposals/${proposalId}/decide`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; proposal?: CreativeProposal; error?: string }>
  },

  handoffToAuthor(modeSessionId: string, data: HandoffRequest): Promise<{ ok: boolean; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/creative/${modeSessionId}/handoff`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; error?: string }>
  },

  createCheckpoint(modeSessionId: string, label?: string): Promise<{ ok: boolean; checkpoint?: CreativeCheckpoint; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/creative/${modeSessionId}/checkpoint`,
      method: 'POST',
      body: { label }
    }) as Promise<{ ok: boolean; checkpoint?: CreativeCheckpoint; error?: string }>
  },

  rebuildBlackboard(modeSessionId: string): Promise<{ ok: boolean; blackboard?: CreativeBlackboard }> {
    return getDesktopApi()({
      path: `/api/karna/creative/${modeSessionId}/rebuild-blackboard`,
      method: 'POST'
    }) as Promise<{ ok: boolean; blackboard?: CreativeBlackboard }>
  }
}
