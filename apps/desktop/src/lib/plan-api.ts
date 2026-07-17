import type {
  CreatePlanRequest,
  UpdatePlanRequest,
  AddPlanEvidenceRequest,
  AddPlanFactRequest,
  ConvertPlanRequest,
  PlanSnapshot,
  PlanDocument,
  PlanVersion,
  PlanEvidence
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

export const planApi = {
  create(data: CreatePlanRequest): Promise<{ ok: boolean; plan?: PlanDocument; error?: string }> {
    return getDesktopApi()({
      path: '/api/karna/plans',
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; plan?: PlanDocument; error?: string }>
  },

  get(modeSessionId: string): Promise<PlanSnapshot | { error: string }> {
    return getDesktopApi()({
      path: `/api/karna/plans/${modeSessionId}`
    }) as Promise<PlanSnapshot | { error: string }>
  },

  update(modeSessionId: string, data: UpdatePlanRequest): Promise<{ ok: boolean; plan?: PlanDocument; version?: PlanVersion; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/plans/${modeSessionId}`,
      method: 'PUT',
      body: data
    }) as Promise<{ ok: boolean; plan?: PlanDocument; version?: PlanVersion; error?: string }>
  },

  addEvidence(modeSessionId: string, data: AddPlanEvidenceRequest): Promise<{ ok: boolean; evidence?: PlanEvidence; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/plans/${modeSessionId}/evidence`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; evidence?: PlanEvidence; error?: string }>
  },

  addFact(modeSessionId: string, data: AddPlanFactRequest): Promise<{ ok: boolean; fact?: { id: string; statement: string; evidenceRefs: string[]; confirmedAt: string }; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/plans/${modeSessionId}/facts`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; fact?: { id: string; statement: string; evidenceRefs: string[]; confirmedAt: string }; error?: string }>
  },

  startInvestigation(modeSessionId: string): Promise<{ ok: boolean; session?: unknown; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/plans/${modeSessionId}/investigate`,
      method: 'POST'
    }) as Promise<{ ok: boolean; session?: unknown; error?: string }>
  },

  startStructuring(modeSessionId: string): Promise<{ ok: boolean; session?: unknown; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/plans/${modeSessionId}/structure`,
      method: 'POST'
    }) as Promise<{ ok: boolean; session?: unknown; error?: string }>
  },

  validate(modeSessionId: string): Promise<{ ok: boolean; validationIssues?: string[]; ready?: boolean; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/plans/${modeSessionId}/validate`,
      method: 'POST'
    }) as Promise<{ ok: boolean; validationIssues?: string[]; ready?: boolean; error?: string }>
  },

  markReady(modeSessionId: string): Promise<{ ok: boolean; session?: unknown; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/plans/${modeSessionId}/ready`,
      method: 'POST'
    }) as Promise<{ ok: boolean; session?: unknown; error?: string }>
  },

  revise(modeSessionId: string, feedback: string): Promise<{ ok: boolean; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/plans/${modeSessionId}/revise`,
      method: 'POST',
      body: { feedback }
    }) as Promise<{ ok: boolean; error?: string }>
  },

  convert(modeSessionId: string, data: ConvertPlanRequest): Promise<{ ok: boolean; transitionId?: string; fromSession?: unknown; toSession?: unknown; action?: string; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/plans/${modeSessionId}/convert`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; transitionId?: string; fromSession?: unknown; toSession?: unknown; action?: string; error?: string }>
  }
}
