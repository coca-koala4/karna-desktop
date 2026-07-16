import type {
  CreateGoalContractRequest,
  GoalSnapshot,
  GoalContract,
  RecordGoalActionRequest,
  GoalAction,
  CompleteGoalActionRequest,
  AddGoalEvidenceRequest,
  GoalEvidence,
  VerifyCriterionRequest,
  GoalCriterion,
  FailedApproach
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
    throw new Error('Window not available')
  }
  const desktop = (window as unknown as { hermesDesktop?: HermesDesktop; karnaDesktop?: HermesDesktop }).karnaDesktop
    || (window as unknown as { hermesDesktop?: HermesDesktop }).hermesDesktop
  if (!desktop) {
    throw new Error('Karna desktop API not available')
  }
  return desktop.api.bind(desktop)
}

export const goalApi = {
  createContract(data: CreateGoalContractRequest): Promise<{ ok: boolean; contract?: GoalContract; error?: string; issues?: string[] }> {
    return getDesktopApi()({
      path: '/api/karna/goals',
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; contract?: GoalContract; error?: string; issues?: string[] }>
  },

  get(modeSessionId: string): Promise<GoalSnapshot | { error: string }> {
    return getDesktopApi()({
      path: `/api/karna/goals/${modeSessionId}`
    }) as Promise<GoalSnapshot | { error: string }>
  },

  start(modeSessionId: string): Promise<{ ok: boolean; contract?: GoalContract; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/goals/${modeSessionId}/start`,
      method: 'POST'
    }) as Promise<{ ok: boolean; contract?: GoalContract; error?: string }>
  },

  recordAction(modeSessionId: string, data: RecordGoalActionRequest): Promise<{ ok: boolean; action?: GoalAction; error?: string; alignment?: unknown }> {
    return getDesktopApi()({
      path: `/api/karna/goals/${modeSessionId}/actions`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; action?: GoalAction; error?: string; alignment?: unknown }>
  },

  completeAction(modeSessionId: string, actionId: string, data: CompleteGoalActionRequest): Promise<{ ok: boolean; action?: GoalAction; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/goals/${modeSessionId}/actions/${actionId}/complete`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; action?: GoalAction; error?: string }>
  },

  addEvidence(modeSessionId: string, data: AddGoalEvidenceRequest): Promise<{ ok: boolean; evidence?: GoalEvidence; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/goals/${modeSessionId}/evidence`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; evidence?: GoalEvidence; error?: string }>
  },

  verifyCriterion(modeSessionId: string, criterionId: string, data: VerifyCriterionRequest): Promise<{ ok: boolean; criterion?: GoalCriterion; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/goals/${modeSessionId}/criteria/${criterionId}/verify`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; criterion?: GoalCriterion; error?: string }>
  },

  getCompletionStatus(modeSessionId: string): Promise<{
    completed: boolean
    shouldBlock?: boolean
    shouldWait?: boolean
    reason: string
    blockedCriteria?: string[]
    waitingCriteria?: string[]
    passedCriteria?: string[]
    pendingCriteria?: string[]
    failedCriteria?: string[]
  }> {
    return getDesktopApi()({
      path: `/api/karna/goals/${modeSessionId}/completion-status`
    }) as Promise<{
      completed: boolean
      shouldBlock?: boolean
      shouldWait?: boolean
      reason: string
      blockedCriteria?: string[]
      waitingCriteria?: string[]
      passedCriteria?: string[]
      pendingCriteria?: string[]
      failedCriteria?: string[]
    }>
  },

  replan(modeSessionId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/goals/${modeSessionId}/replan`,
      method: 'POST',
      body: { reason }
    }) as Promise<{ ok: boolean; error?: string }>
  },

  checkpoint(modeSessionId: string, label?: string): Promise<{ id: string; modeSessionId: string; stateRef: string; stateVersion: number; label?: string; createdAt: string } | { error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/goals/${modeSessionId}/checkpoint`,
      method: 'POST',
      body: { label }
    }) as Promise<{ id: string; modeSessionId: string; stateRef: string; stateVersion: number; label?: string; createdAt: string } | { error?: string }>
  },

  alignmentCheck(modeSessionId: string, action: Partial<RecordGoalActionRequest>): Promise<{ ok: boolean; passed: boolean; issues?: string[]; supportsCriteria?: string[] }> {
    return getDesktopApi()({
      path: `/api/karna/goals/${modeSessionId}/alignment-check`,
      method: 'POST',
      body: action
    }) as Promise<{ ok: boolean; passed: boolean; issues?: string[]; supportsCriteria?: string[] }>
  }
}
