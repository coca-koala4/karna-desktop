import type {
  AgentModeSession,
  CancelModeRequest,
  CompleteModeRequest,
  CreateCheckpointRequest,
  CreateModeSessionRequest,
  FailModeRequest,
  BlockModeRequest,
  ModeCheckpoint,
  ModeEvent,
  ModeFlowRunRequest,
  ModeListQuery,
  ModeWaitingUserRequest,
  PauseModeRequest,
  ReadyModeRequest,
  ResumeModeRequest,
  StartRunningRequest,
  TransitionPhaseRequest,
  ModeExecutionBinding,
  ModeCompatibilityCheckResponse,
  ModeTransitionRequest,
  ModeTransitionResponse,
  UpdateBindingWorkflowRequest,
  CompleteFlowRunRequest,
  EffectiveNodeResources
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

export const modeApi = {
  create(data: CreateModeSessionRequest): Promise<AgentModeSession> {
    return getDesktopApi()({
      path: '/api/karna/modes',
      method: 'POST',
      body: data
    }) as Promise<AgentModeSession>
  },

  get(sessionId: string): Promise<AgentModeSession> {
    return getDesktopApi()({ path: `/api/karna/modes/${sessionId}` }) as Promise<AgentModeSession>
  },

  list(query: ModeListQuery = {}): Promise<AgentModeSession[]> {
    const params = new URLSearchParams()
    if (query.conversationId) params.set('conversationId', query.conversationId)
    if (query.workspaceId) params.set('workspaceId', query.workspaceId)
    if (query.projectId) params.set('projectId', query.projectId)
    if (query.mode) params.set('mode', query.mode)
    if (query.status) params.set('status', query.status)
    if (query.limit) params.set('limit', String(query.limit))
    if (query.offset) params.set('offset', String(query.offset))
    const qs = params.toString()
    return getDesktopApi()({ path: `/api/karna/modes${qs ? `?${qs}` : ''}` }) as Promise<AgentModeSession[]>
  },

  getActiveForConversation(conversationId: string): Promise<AgentModeSession | null> {
    return getDesktopApi()({ path: `/api/karna/modes/active/${encodeURIComponent(conversationId)}` }) as Promise<AgentModeSession | null>
  },

  pause(sessionId: string, data: PauseModeRequest): Promise<{ ok: boolean; session?: AgentModeSession }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/pause`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; session?: AgentModeSession }>
  },

  resume(sessionId: string, data: ResumeModeRequest): Promise<{ ok: boolean; session?: AgentModeSession }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/resume`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; session?: AgentModeSession }>
  },

  cancel(sessionId: string, data: CancelModeRequest): Promise<{ ok: boolean; session?: AgentModeSession }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/cancel`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; session?: AgentModeSession }>
  },

  ready(sessionId: string, data: ReadyModeRequest): Promise<{ ok: boolean; session?: AgentModeSession }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/ready`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; session?: AgentModeSession }>
  },

  startRunning(sessionId: string, data: StartRunningRequest): Promise<{ ok: boolean; session?: AgentModeSession }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/start`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; session?: AgentModeSession }>
  },

  waitForUser(sessionId: string, data: ModeWaitingUserRequest): Promise<{ ok: boolean; session?: AgentModeSession }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/wait-user`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; session?: AgentModeSession }>
  },

  complete(sessionId: string, data: CompleteModeRequest): Promise<{ ok: boolean; session?: AgentModeSession }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/complete`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; session?: AgentModeSession }>
  },

  fail(sessionId: string, data: FailModeRequest): Promise<{ ok: boolean; session?: AgentModeSession }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/fail`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; session?: AgentModeSession }>
  },

  block(sessionId: string, data: BlockModeRequest): Promise<{ ok: boolean; session?: AgentModeSession }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/block`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; session?: AgentModeSession }>
  },

  transitionPhase(sessionId: string, data: TransitionPhaseRequest): Promise<{ ok: boolean; session?: AgentModeSession }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/phase`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; session?: AgentModeSession }>
  },

  createCheckpoint(sessionId: string, data: CreateCheckpointRequest): Promise<ModeCheckpoint> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/checkpoints`,
      method: 'POST',
      body: data
    }) as Promise<ModeCheckpoint>
  },

  getEvents(sessionId: string, sinceSequence = 0, limit = 100): Promise<ModeEvent[]> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/events?since=${sinceSequence}&limit=${limit}`
    }) as Promise<ModeEvent[]>
  },

  requestFlowRun(sessionId: string, data: ModeFlowRunRequest): Promise<Record<string, unknown>> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/flow-runs`,
      method: 'POST',
      body: data
    }) as Promise<Record<string, unknown>>
  },

  completeFlowRun(sessionId: string, runId: string, data: CompleteFlowRunRequest): Promise<{ ok: boolean; session?: AgentModeSession }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/flow-runs/${runId}/complete`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; session?: AgentModeSession }>
  },

  getBinding(sessionId: string): Promise<ModeExecutionBinding | { error: string }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/binding`
    }) as Promise<ModeExecutionBinding | { error: string }>
  },

  updateBindingWorkflow(sessionId: string, data: UpdateBindingWorkflowRequest): Promise<{ ok: boolean; binding?: ModeExecutionBinding; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/binding/workflow`,
      method: 'PUT',
      body: data
    }) as Promise<{ ok: boolean; binding?: ModeExecutionBinding; error?: string }>
  },

  checkWorkflowCompatibility(sessionId: string, workflowId: string): Promise<ModeCompatibilityCheckResponse> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/check-compatibility`,
      method: 'POST',
      body: { workflowId }
    }) as Promise<ModeCompatibilityCheckResponse>
  },

  transition(sessionId: string, data: ModeTransitionRequest): Promise<ModeTransitionResponse | { ok: boolean; error: string }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/transition`,
      method: 'POST',
      body: data
    }) as Promise<ModeTransitionResponse | { ok: boolean; error: string }>
  },

  getEffectiveResources(sessionId: string): Promise<EffectiveNodeResources[]> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/effective-resources`
    }) as Promise<EffectiveNodeResources[]>
  },

  attachRuntime(sessionId: string, binding?: Partial<ModeExecutionBinding>): Promise<{ ok: boolean; binding?: ModeExecutionBinding }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/runtime/attach`,
      method: 'POST',
      body: { binding }
    }) as Promise<{ ok: boolean; binding?: ModeExecutionBinding }>
  },

  detachRuntime(sessionId: string): Promise<{ ok: boolean }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/runtime/detach`,
      method: 'POST'
    }) as Promise<{ ok: boolean }>
  },

  buildRuntimeContext(sessionId: string, query: string, project?: unknown): Promise<{
    ok: boolean
    context: { excerpts: unknown[]; citations: unknown[]; warnings: string[]; sourceSummary: Record<string, unknown>; tokenEstimate: number }
    formattedText: string
  }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/runtime/context`,
      method: 'POST',
      body: { query, project }
    }) as Promise<{
      ok: boolean
      context: { excerpts: unknown[]; citations: unknown[]; warnings: string[]; sourceSummary: Record<string, unknown>; tokenEstimate: number }
      formattedText: string
    }>
  },

  checkWritebackPermission(sessionId: string, targetType: string, changes?: unknown): Promise<{
    ok: boolean
    allowed: boolean
    requiresApproval?: boolean
    reason?: string
  }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/runtime/writeback-check`,
      method: 'POST',
      body: { targetType, changes }
    }) as Promise<{ ok: boolean; allowed: boolean; requiresApproval?: boolean; reason?: string }>
  },

  getRuntimeEffectiveResources(sessionId: string): Promise<{
    ok: boolean
    modeSessionId: string
    bindingId: string
    version: number
    skills: Array<{ id: string; ref?: string; weight?: number }>
    souls: Array<{ id: string; ref?: string; weight?: number }>
    tools: Array<{ id: string; scope?: string }>
    documents: Array<{ id: string; label?: string; path?: string }>
    knowledgeSources: Array<{ id: string; type?: string }>
    permissionPolicy: unknown
    modelPolicy: unknown
  } | { ok: false; error: string }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/runtime/effective-resources`
    }) as Promise<{
      ok: boolean
      modeSessionId: string
      bindingId: string
      version: number
      skills: Array<{ id: string; ref?: string; weight?: number }>
      souls: Array<{ id: string; ref?: string; weight?: number }>
      tools: Array<{ id: string; scope?: string }>
      documents: Array<{ id: string; label?: string; path?: string }>
      knowledgeSources: Array<{ id: string; type?: string }>
      permissionPolicy: unknown
      modelPolicy: unknown
    } | { ok: false; error: string }>
  },

  ingestDocument(sessionId: string, data: {
    documentId?: string
    label?: string
    path?: string
    uri?: string
    content?: string
    maxExcerpts?: number
  }): Promise<{ ok: boolean; document?: unknown; bindingVersion?: number; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/bindings/documents`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; document?: unknown; bindingVersion?: number; error?: string }>
  },

  ingestKnowledgeSource(sessionId: string, data: {
    sourceId?: string
    type?: string
    label?: string
    config?: Record<string, unknown>
    topK?: number
    minScore?: number
    content?: string
  }): Promise<{ ok: boolean; source?: unknown; bindingVersion?: number; error?: string }> {
    return getDesktopApi()({
      path: `/api/karna/modes/${sessionId}/bindings/knowledge-sources`,
      method: 'POST',
      body: data
    }) as Promise<{ ok: boolean; source?: unknown; bindingVersion?: number; error?: string }>
  }
}
