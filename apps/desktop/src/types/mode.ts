export type AgentModeId = 'direct' | 'plan' | 'goal' | 'living_work'

export type ModeStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'paused'
  | 'waiting_user'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ModeEventType =
  | 'mode.created'
  | 'mode.status_changed'
  | 'mode.phase_changed'
  | 'mode.flow_run.requested'
  | 'mode.flow_run.completed'
  | 'mode.flow_run.failed'
  | 'mode.checkpoint.created'
  | 'mode.transitioned'
  | 'mode.budget.warning'
  | 'mode.budget.exceeded'
  | 'mode.permission.denied'
  | 'mode.waiting_user'
  | 'mode.user_input_received'
  | 'mode.error'

export interface AgentModeSession {
  id: string
  conversationId?: string
  workspaceId: string
  projectId?: string
  mode: AgentModeId
  status: ModeStatus
  stateRef: string
  activeFlowId?: string
  activeRunId?: string
  parentSessionId?: string
  forkedFromCheckpointId?: string
  currentPhase: string
  stateVersion: number
  expectedVersion: number
  tokenUsage: number
  costEstimate: number
  turnCount: number
  createdAt: string
  updatedAt: string
  completedAt?: string
  failedAt?: string
  cancelledAt?: string
  errorMessage?: string
  errorCode?: string
  metadata: Record<string, unknown>
  binding?: ModeExecutionBinding
}

export interface ModeEvent {
  id: string
  modeSessionId: string
  mode: AgentModeId
  sequence: number
  stateVersion: number
  type: ModeEventType
  payload: Record<string, unknown>
  createdAt: string
}

export interface ModeCheckpoint {
  id: string
  modeSessionId: string
  stateRef: string
  stateVersion: number
  label?: string
  createdAt: string
  metadata: Record<string, unknown>
}

export interface CreateModeSessionRequest {
  mode: AgentModeId
  workspaceId: string
  conversationId?: string
  projectId?: string
  parentSessionId?: string
  metadata?: Record<string, unknown>
  workflowSelection?: {
    workflowId: string
    expectedVersion?: number
  }
  resourceSelection?: {
    soulIds: string[]
    skillIds: string[]
    mcpServerIds: string[]
    connectorInstanceIds: string[]
    knowledgeSourceIds: string[]
    attachmentResultIds: string[]
    projectDocumentIds: string[]
  }
  initialContract?: Record<string, unknown> | PlanRequest | GoalContractDraft | CreativeContractDraft
}

export interface PlanRequest {
  objective: string
  context?: string
}

export interface GoalContractDraft {
  objective: string
  successCriteria: Array<{
    id: string
    description: string
    verificationMethod: string
    required: boolean
  }>
  constraints?: string[]
  scope?: string
  budget?: {
    maxTokens?: number
    maxCost?: number
    maxTurns?: number
    maxTimeMinutes?: number
  }
}

export interface CreativeContractDraft {
  workIdentity: string
  creativeIntent: string
  nonNegotiables: string[]
  protectedAmbiguities: string[]
  explorationSpace: string[]
  currentMilestone: string
  autonomyLevel: 'navigator' | 'co_creator' | 'milestone_autonomous'
  handoffConditions: string[]
  budget?: {
    maxTokens?: number
    maxCost?: number
    maxTurns?: number
    maxTimeMinutes?: number
  }
}

export interface ModeListQuery {
  conversationId?: string
  workspaceId?: string
  projectId?: string
  mode?: AgentModeId
  status?: ModeStatus
  limit?: number
  offset?: number
}

export interface PauseModeRequest {
  expectedVersion: number
  reason?: string
}

export interface ResumeModeRequest {
  expectedVersion: number
}

export interface CancelModeRequest {
  expectedVersion: number
  reason?: string
}

export interface ModeWaitingUserRequest {
  expectedVersion: number
  prompt: string
  options?: string[]
}

export interface CompleteModeRequest {
  expectedVersion: number
  summary?: string
}

export interface FailModeRequest {
  expectedVersion: number
  errorCode: string
  errorMessage: string
}

export interface BlockModeRequest {
  expectedVersion: number
  reason: string
  requiredAction?: string
}

export interface TransitionPhaseRequest {
  expectedVersion: number
  phase: string
  activeFlowId?: string
  activeRunId?: string
}

export interface ReadyModeRequest {
  expectedVersion: number
}

export interface StartRunningRequest {
  expectedVersion: number
}

export interface CreateCheckpointRequest {
  stateRef: string
  label?: string
  metadata?: Record<string, unknown>
}

export interface ModeFlowRunRequest {
  workflowId: string
  workflowVersion: number
  phase: string
  inputRefs?: string[]
  permissionEnvelope?: Record<string, unknown>
  budgetSnapshot?: Record<string, unknown>
  projectId?: string
}

export type ResourceBindingPolicy = 'pinned' | 'pinned_version' | 'latest_with_change_detection'

export interface WorkflowBindingSnapshot {
  workflowId: string
  workflowVersion: number
  contentHash: string
  source: 'global' | 'project' | 'mode_default'
  resolvedAgentIds: string[]
  compiledPlanRef: string
  modeCompatibility: ModeCompatibilityResult
}

export interface ModeCompatibilityResult {
  compatible: boolean
  missingCapabilities: Array<{ capability: string; reason: string }>
  missingNodeTypes: Array<{ nodeType: string; reason: string }>
  warnings: string[]
  availableCapabilities: string[]
  detectedNodeTypes: string[]
  detectedCapabilities: string[]
}

export interface ModeCompatibilityCheckResponse {
  ok: boolean
  error?: string
  code?: string
  workflow?: {
    id: string
    name: string
    version: number
  }
  source?: string
  compatibility?: ModeCompatibilityResult
}

export interface ModeTransitionRequest {
  toMode: AgentModeId
  mapping?: Record<string, unknown>
}

export interface ModeTransitionResponse {
  ok: boolean
  error?: string
  transitionId: string
  fromSession: AgentModeSession
  toSession: AgentModeSession
}

export interface UpdateBindingWorkflowRequest {
  expectedBindingVersion: number
  workflowSnapshot: WorkflowBindingSnapshot
}

export interface CompleteFlowRunRequest {
  status: 'completed' | 'failed' | 'paused' | 'waiting_approval'
  outputRefs?: string[]
  evidenceRefs?: string[]
  proposalRefs?: string[]
  tokenUsage?: number
  error?: Record<string, unknown> | null
}

export interface SoulBindingSnapshot {
  soulId: string
  soulVersion: number
  contentHash: string
  enabledAttributes: string[]
  usageMode: 'planner' | 'critic' | 'method_reference' | 'diagnostic' | 'style_risk_check'
  influenceStrength: number
  blockDirectImitation: boolean
}

export interface SkillBindingSnapshot {
  skillId: string
  resolvedName: string
  source: 'session' | 'workflow' | 'node' | 'auto'
  version?: string
  contentHash: string
  rootRef: string
  requirements: string[]
  allowedLinkedFiles: string[]
}

export interface ToolBindingSnapshot {
  mcpServerId?: string
  connectorInstanceId?: string
  toolName: string
  connectionStatus: 'connected' | 'disconnected' | 'unknown'
  credentialRef?: string
  allowedOperations: string[]
  nodeScope?: string[]
  modePolicyRestrictions: string[]
}

export interface ModeDocumentBinding {
  bindingId: string
  sourceType: 'attachment' | 'project_document' | 'current_document' | 'current_chapter' | 'current_selection' | 'workspace_file' | 'knowledge_document'
  ingestResultId?: string
  projectDocumentId?: string
  contentHash: string
  revision?: number
  bindingPolicy: ResourceBindingPolicy
  required: boolean
  parseStatus: 'parsed' | 'partial' | 'failed'
  warnings: string[]
}

export interface ModeSourceBinding {
  sourceId: string
  sourceType: 'knowledge_library' | 'rag_collection' | 'wiki' | 'story_bible' | 'narrative_state'
  bindingPolicy: ResourceBindingPolicy
  enabled: boolean
}

export interface ProjectContextSnapshot {
  projectId: string
  projectType: string
  capabilityProfile: string[]
  rootPath: string
}

export interface ModeModelPolicy {
  defaultModel?: string
  auxiliaryModels?: Record<string, string>
  reasoningEffort: 'low' | 'medium' | 'high'
}

export interface ModePermissionPolicy {
  readWorkspaceFiles: boolean
  writeWorkspaceFiles: boolean
  executeShell: boolean
  networkAccess: boolean
  modifySoul: boolean
  modifyKnowledge: boolean
  modeSpecificRestrictions: string[]
}

export interface ModeBudgetPolicy {
  maxTokens?: number
  maxCost?: number
  maxTurns?: number
  maxTimeMinutes?: number
  warningThreshold?: number
}

export interface ModeExecutionBinding {
  id: string
  modeSessionId: string
  workflow?: WorkflowBindingSnapshot
  souls: SoulBindingSnapshot[]
  skills: SkillBindingSnapshot[]
  tools: ToolBindingSnapshot[]
  knowledgeSources: ModeSourceBinding[]
  documents: ModeDocumentBinding[]
  projectContext?: ProjectContextSnapshot
  modelPolicy: ModeModelPolicy
  permissionPolicy: ModePermissionPolicy
  budgetPolicy: ModeBudgetPolicy
  version: number
  createdAt: string
  updatedAt: string
}

export interface EffectiveNodeResources {
  nodeId: string
  agentId?: string
  model?: string
  souls: string[]
  skills: string[]
  tools: string[]
  knowledgeSources: string[]
  documentBindings: string[]
  overriddenResources: ResourceConflict[]
  blockedResources: ResourceConflict[]
}

export interface ResourceConflict {
  resourceType: string
  resourceId: string
  reason: string
  resolvedBy: string
}

export interface ModeTransitionSnapshot {
  id: string
  fromModeSessionId: string
  toModeSessionId: string
  fromMode: AgentModeId
  toMode: AgentModeId
  objectives: string[]
  constraints: string[]
  artifactRefs: string[]
  evidenceRefs: string[]
  decisions: string[]
  unresolvedItems: string[]
  excludedContext: string[]
  createdAt: string
}

export type PlanPhase =
  | 'draft'
  | 'investigating'
  | 'structuring'
  | 'validating'
  | 'ready_for_review'
  | 'revised'
  | 'converted'

export interface PlanStep {
  id: string
  description: string
  dependencies: string[]
  required: boolean
}

export interface PlanFact {
  id: string
  statement: string
  evidenceRefs: string[]
  confirmedAt: string
}

export interface PlanEvidence {
  id: string
  source: string
  sourceRef: string
  content: string
  relevance: string
  supportsFacts: string[]
  createdAt: string
}

export interface PlanDocument {
  id: string
  modeSessionId: string
  version: number
  objective: string
  explanation: string
  confirmedFacts: PlanFact[]
  evidenceRefs: string[]
  assumptions: string[]
  constraints: string[]
  outOfScope: string[]
  affectedAreas: string[]
  steps: PlanStep[]
  risks: string[]
  validationStrategy: string[]
  unresolvedQuestions: string[]
  executionReadiness: 'not_ready' | 'needs_revision' | 'ready'
  context?: string
  createdAt: string
  updatedAt: string
}

export interface PlanVersion {
  id: string
  modeSessionId: string
  version: number
  plan: PlanDocument
  author: string
  message: string
  createdAt: string
}

export interface PlanSnapshot {
  plan: PlanDocument
  versions: PlanVersion[]
  evidence: PlanEvidence[]
  totalVersions: number
}

export interface CreatePlanRequest {
  modeSessionId: string
  objective: string
  context?: string
}

export interface UpdatePlanRequest {
  expectedVersion: number
  objective?: string
  explanation?: string
  assumptions?: string[]
  constraints?: string[]
  outOfScope?: string[]
  affectedAreas?: string[]
  steps?: Partial<PlanStep>[]
  risks?: string[]
  validationStrategy?: string[]
  unresolvedQuestions?: string[]
  executionReadiness?: 'not_ready' | 'needs_revision' | 'ready'
  message?: string
}

export interface AddPlanEvidenceRequest {
  source: string
  sourceRef?: string
  content: string
  relevance?: string
  supportsFacts?: string[]
}

export interface AddPlanFactRequest {
  fact: string
  evidenceRefs?: string[]
}

export interface ConvertPlanRequest {
  toMode: 'goal' | 'living_work' | 'flow_studio'
  mapping?: Record<string, unknown>
}

export type VerificationMethod = 'deterministic' | 'tool_result' | 'artifact_review' | 'agent_judge' | 'human'

export type CriterionStatus = 'pending' | 'passed' | 'failed' | 'blocked' | 'waiting_user'

export interface GoalCriterion {
  id: string
  description: string
  verificationMethod: VerificationMethod
  required: boolean
  status: CriterionStatus
  evidenceRefs: string[]
  lastVerifiedAt: string | null
  verificationResult: {
    status: CriterionStatus
    summary?: string
    reason?: string
    prompt?: string
  } | null
}

export interface GoalAction {
  id: string
  modeSessionId: string
  type: string
  description: string
  supportsCriteria: string[]
  flowRunId: string | null
  input: Record<string, unknown> | null
  output: Record<string, unknown> | null
  status: 'pending' | 'running' | 'completed' | 'failed'
  startedAt: string
  completedAt: string | null
  tokenUsage: number
  error: { message: string; code?: string } | null
}

export interface GoalEvidence {
  id: string
  modeSessionId: string
  criterionId: string
  source: string
  sourceRef: string
  content: string
  artifactRefs: string[]
  actionId: string | null
  supportsPassing: boolean
  createdAt: string
}

export interface FailedApproach {
  id: string
  actionSignature: string
  actionId: string
  input: unknown
  output: unknown
  failureReason: string
  relatedEvidence: string[]
  retryable: boolean
  requiredStateChange: string | null
  recordedAt: string
}

export interface GoalContract {
  id: string
  modeSessionId: string
  version: number
  objective: string
  successCriteria: GoalCriterion[]
  constraints: string[]
  scope: string
  verificationPolicy: {
    requireEvidenceForAll: boolean
    judgeBlockedAsDone: boolean
    judgeWaitingAsDone: boolean
  }
  autonomyPolicy: {
    allowedTools: string[]
    requiresApprovalFor: string[]
    autoContinue: boolean
  }
  budget: {
    maxTokens?: number
    maxCost?: number
    maxTurns?: number
    maxTimeMinutes?: number
  }
  stopConditions: string[]
  humanGates: string[]
  currentStrategy: unknown
  createdAt: string
  updatedAt: string
}

export interface GoalSnapshot {
  contract: GoalContract
  actions: GoalAction[]
  evidence: GoalEvidence[]
  failedApproaches: FailedApproach[]
  completionStatus: {
    completed: boolean
    shouldBlock?: boolean
    shouldWait?: boolean
    reason: string
    passedCount?: number
    totalCriteria?: number
    blockedCriteria?: string[]
    waitingCriteria?: string[]
    passedCriteria?: string[]
    pendingCriteria?: string[]
    failedCriteria?: string[]
  }
  actionCount: number
  evidenceCount: number
  failedCount: number
}

export interface CreateGoalContractRequest {
  modeSessionId: string
  objective: string
  successCriteria: Array<{
    id?: string
    description: string
    verificationMethod: VerificationMethod
    required?: boolean
  }>
  constraints?: string[]
  scope?: string
  verificationPolicy?: Partial<GoalContract['verificationPolicy']>
  autonomyPolicy?: Partial<GoalContract['autonomyPolicy']>
  budget?: GoalContract['budget']
  stopConditions?: string[]
  humanGates?: string[]
}

export interface RecordGoalActionRequest {
  type?: string
  description: string
  supportsCriteria: string[]
  flowRunId?: string
  input?: Record<string, unknown>
}

export interface CompleteGoalActionRequest {
  status?: 'completed' | 'failed'
  output?: Record<string, unknown>
  tokenUsage?: number
  error?: { message: string; code?: string }
  retryable?: boolean
  requiredStateChange?: string
}

export interface AddGoalEvidenceRequest {
  criterionId: string
  source: string
  sourceRef?: string
  content: string
  artifactRefs?: string[]
  actionId?: string
  supportsPassing?: boolean
}

export interface VerifyCriterionRequest {
  passed: boolean
  status?: CriterionStatus
  summary?: string
  reason?: string
  prompt?: string
  blocked?: boolean
  waiting?: boolean
  verifier?: VerificationMethod
}

export type AutonomyLevel = 'navigator' | 'co_creator' | 'milestone_autonomous'

export interface CreativeContract {
  id: string
  modeSessionId: string
  version: number
  workIdentity: string
  creativeIntent: string
  nonNegotiables: string[]
  protectedAmbiguities: string[]
  explorationSpace: string[]
  currentMilestone: string
  autonomyLevel: AutonomyLevel
  handoffConditions: string[]
  budget: Record<string, unknown>
  references: {
    storyBibleRef: string | null
    livingWikiRef: string | null
    narrativeStateRef: string | null
    soulRefs: string[]
  }
  createdAt: string
  updatedAt: string
  authorConfirmedAt: string | null
}

export interface CreativeCandidate {
  id: string
  description: string
  actionType: string
  targetArea: string
  riskLevel: 'low' | 'medium' | 'high'
  reversibility: 'reversible' | 'semi_reversible' | 'irreversible'
  addressesTension: string | null
  milestoneContribution: string
  touchedEntities: string[]
  affectsProtectedAmbiguity: boolean
  violatesNonNegotiable: boolean
  createdAt: string
}

export interface ImpactAnalysis {
  candidateId: string
  dimensions: {
    characters: { affected: string[]; changes: string }
    plot: { affected: string[]; changes: string }
    continuity: { issues: string[]; assessment: string }
    timeline: { affected: string[]; changes: string }
    foreshadowing: { added: string[]; resolved: string[]; broken: string[] }
    theme: { reinforced: string[]; weakened: string[] }
    style: { consistency: string; drift: string }
    workIdentity: { preserved: boolean; concerns: string[] }
  }
  contractConsistency: { consistent: boolean; violations: string[] }
  reversible: boolean
  tokenEstimate: number
  requiresAuthorDecision: boolean
  overallRecommendation: 'approve' | 'consider' | 'reject'
  createdAt: string
}

export interface CreativeBlackboard {
  modeSessionId: string
  workVersionRef: string | null
  workStatus: string
  openQuestions: string[]
  currentTensions: string[]
  gaps: string[]
  opportunities: Array<{ description: string }>
  candidateActions: CreativeCandidate[]
  impactAnalyses: ImpactAnalysis[]
  acceptedDecisions: Array<{ candidateId: string; description: string; selectedAt: string }>
  rejectedDirections: string[]
  conflicts: unknown[]
  critiqueRefs: string[]
  pendingProposals: string[]
  currentCheckpointId: string | null
  currentMilestone: string
  version: number
  updatedAt: string
}

export interface CreativeEvent {
  id: string
  modeSessionId: string
  sequence: number
  type: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface CreativeProposal {
  id: string
  type: 'contract_change' | 'knowledge_writeback'
  targetType?: string
  proposedChanges?: unknown
  reason?: string
  candidateId?: string
  changes?: unknown
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  decidedAt?: string
  decision?: string
  rejectionReason?: string
}

export interface CreativeRejectedDirection {
  id: string
  direction: string
  candidateId?: string
  reason: string
  canRetryIfStateChanges: boolean
  recordedAt: string
}

export interface CreativeCheckpoint {
  id: string
  modeSessionId: string
  label: string
  blackboardVersion: number
  eventCount: number
  createdAt: string
}

export interface CreativeSnapshot {
  contract: CreativeContract
  blackboard: CreativeBlackboard
  events: CreativeEvent[]
  proposals: CreativeProposal[]
  rejectedDirections: CreativeRejectedDirection[]
  checkpoints: CreativeCheckpoint[]
}

export interface CreateCreativeContractRequest {
  modeSessionId: string
  workIdentity: string
  creativeIntent: string
  nonNegotiables: string[]
  protectedAmbiguities?: string[]
  explorationSpace?: string[]
  currentMilestone: string
  autonomyLevel?: AutonomyLevel
  handoffConditions?: string[]
  budget?: Record<string, unknown>
  storyBibleRef?: string
  livingWikiRef?: string
  narrativeStateRef?: string
  soulRefs?: string[]
}

export interface RecordOpportunitiesRequest {
  opportunities: Array<{ description: string }>
  tensions?: string[]
  gaps?: string[]
}

export interface GenerateCandidatesRequest {
  candidates: Array<{
    description: string
    actionType?: string
    targetArea?: string
    riskLevel?: 'low' | 'medium' | 'high'
    reversibility?: 'reversible' | 'semi_reversible' | 'irreversible'
    addressesTension?: string
    milestoneContribution?: string
    touchedEntities?: string[]
  }>
}

export interface PerformImpactRequest {
  characters?: { affected?: string[]; changes?: string }
  plot?: { affected?: string[]; changes?: string }
  continuity?: { issues?: string[]; assessment?: string }
  timeline?: { affected?: string[]; changes?: string }
  foreshadowing?: { added?: string[]; resolved?: string[]; broken?: string[] }
  theme?: { reinforced?: string[]; weakened?: string[] }
  style?: { consistency?: string; drift?: string }
  workIdentity?: { preserved?: boolean; concerns?: string[] }
  contractConsistency?: { consistent?: boolean; violations?: string[] }
  tokenEstimate?: number
  recommendation?: 'approve' | 'consider' | 'reject'
}

export interface CreateProposalRequest {
  targetType: 'story_bible' | 'living_wiki' | 'narrative_state' | 'soul' | 'artifact'
  changes: Record<string, unknown>
  candidateId?: string
}

export interface DecideProposalRequest {
  decision: 'approve' | 'reject'
}

export interface CompleteExecuteRequest {
  artifactRefs?: string[]
  diffRefs?: string[]
}

export interface HandoffRequest {
  reason: string
  candidates?: Array<{ description: string }>
}

