/* ------------------------------------------------------------------ */
/*  Karna Flow Studio - Complete Schema Definition                       */
/* ------------------------------------------------------------------ */

export type KarnaPortType =
  | 'TEXT'
  | 'MARKDOWN'
  | 'DOCUMENT'
  | 'CHAPTER'
  | 'SCENE'
  | 'ARTIFACT'
  | 'ARTIFACT_VERSION'
  | 'PROMPT'
  | 'CONTEXT'
  | 'EVIDENCE_SET'
  | 'SEARCH_RESULT'
  | 'WIKI_ENTITY_SET'
  | 'STORY_BIBLE'
  | 'NARRATIVE_STATE'
  | 'SOUL_PROFILE'
  | 'AGENT_RESULT'
  | 'TOOL_RESULT'
  | 'CRITIQUE_RESULT'
  | 'CRITIQUE_SET'
  | 'REVISION_BRIEF'
  | 'CONSENSUS_DECISION'
  | 'DIFF'
  | 'FILE_REF'
  | 'WORKSPACE_REF'
  | 'BOOLEAN'
  | 'NUMBER'
  | 'JSON'
  | 'ANY'

export type NodeCapability =
  | 'prompt'
  | 'model'
  | 'skills'
  | 'plugins'
  | 'context'
  | 'rag'
  | 'living_wiki'
  | 'story_bible'
  | 'narrative_state'
  | 'soul'
  | 'tools'
  | 'mcp'
  | 'human_review'
  | 'retry'
  | 'timeout'
  | 'output_schema'
  | 'writeback'
  | 'archive'
  | 'budget'
  | 'debug'
  | 'filesystem'
  | 'network'
  | 'shell'
  | 'permissions'
  | 'input_schema'
  | 'flow_control'
  | 'artifact'

export type ResourceBindingMode = 'inherit' | 'auto' | 'explicit' | 'disabled'

export type NodeRunStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'waiting_human'
  | 'cached'

export type WorkflowNodeType =
  | 'input_text'
  | 'input_file'
  | 'input_variable'
  | 'input_constant'
  | 'agent'
  | 'critic'
  | 'scheduler'
  | 'tool_agent'
  | 'prompt_template'
  | 'prompt_merge'
  | 'context_merge'
  | 'context_trim'
  | 'rag_search'
  | 'wiki_query'
  | 'bible_query'
  | 'narrative_query'
  | 'soul_query'
  | 'mcp_tool'
  | 'workspace_read'
  | 'workspace_write'
  | 'web_search'
  | 'fanout'
  | 'merge'
  | 'barrier'
  | 'condition'
  | 'switch_node'
  | 'wait'
  | 'retry'
  | 'loop_controller'
  | 'loop_back'
  | 'checkpoint'
  | 'subflow'
  | 'boolean_judge'
  | 'score_judge'
  | 'llm_judge'
  | 'consensus'
  | 'text_merge'
  | 'critique_aggregate'
  | 'human_confirm'
  | 'human_edit'
  | 'artifact'
  | 'save_snapshot'
  | 'archive_version'
  | 'text_output'
  | 'file_output'
  | 'final_output'
  | 'parallel'
  | 'loop'
  | 'human_review'
  | 'archive'
  | 'output'
  | 'input'

export interface PortDefinition {
  id: string
  name: string
  type: KarnaPortType
  description?: string
  required?: boolean
  multiple?: boolean
}

export interface InspectorFieldSchema {
  key: string
  label: string
  type: 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'slider' | 'tags' | 'json'
  options?: Array<{ value: string; label: string }>
  placeholder?: string
  defaultValue?: unknown
  min?: number
  max?: number
  step?: number
  helpText?: string
  section: string
  capability?: NodeCapability
}

export interface InspectorSectionSchema {
  id: string
  label: string
  icon?: string
  description?: string
  fields: InspectorFieldSchema[]
}

export interface NodePermissionDeclaration {
  allowedTools?: string[]
  deniedTools?: string[]
  allowedMcpServers?: string[]
  deniedMcpServers?: string[]
  filesystem?: 'none' | 'read_project' | 'read_workspace' | 'write_project' | 'write_workspace'
  network?: 'none' | 'http_get' | 'http_post' | 'full'
  shell?: 'none' | 'allowlisted' | 'full'
  requireApprovalFor?: string[]
}

export interface KarnaNodeDefinition {
  classType: WorkflowNodeType
  version: string
  category: string
  displayName: string
  description: string
  icon: string
  color: string
  capabilities: NodeCapability[]
  inputs: PortDefinition[]
  outputs: PortDefinition[]
  inspectorSchema: InspectorSectionSchema[]
  defaultConfig: Record<string, unknown>
  runtimeHandler?: string
  permissions?: NodePermissionDeclaration
  isDeprecated?: boolean
  deprecated?: boolean
  migration?: {
    fromVersions: string[]
    migrateHandler: string
  }
}

export interface NodePromptConfig {
  mode: 'inherit' | 'explicit' | 'preset'
  presetId?: string
  systemPrompt?: string
  rolePrompt?: string
  taskPromptTemplate?: string
  createPromptTemplate?: string
  continuePromptTemplate?: string
  revisionPromptTemplate?: string
  evaluationPromptTemplate?: string
  aggregationPromptTemplate?: string
  contextInjectionTemplate?: string
  outputInstructionTemplate?: string
  repairPromptTemplate?: string
  variables: Array<{ name: string; defaultValue?: string; description?: string }>
  missingVariablePolicy: 'error' | 'empty' | 'keep_placeholder'
  mergeMode: 'replace' | 'prepend' | 'append' | 'sections'
  version: number
}

export interface NodeResourceBinding<T = string> {
  mode: ResourceBindingMode
  selectedIds: T[]
  autoSelection?: {
    enabled: boolean
    maxItems: number
    allowedCategories?: string[]
  }
  localInstructions?: string
}

export interface NodeModelConfig {
  mode: ResourceBindingMode
  providerId?: string
  modelId?: string
  fallbackModelIds: string[]
  temperature?: number
  topP?: number
  maxOutputTokens?: number
  reasoningEffort?: 'low' | 'medium' | 'high'
  streaming: boolean
}

export interface NodeBudgetConfig {
  maxInputTokens?: number
  maxOutputTokens?: number
  maxCost?: number
  cachePolicy: 'none' | 'by_input_hash' | 'manual'
  onBudgetExceeded: 'fail' | 'skip' | 'fallback_model' | 'ask_user'
}

export interface NodeContextBinding {
  id: string
  sourceType:
    | 'vector_collection'
    | 'living_wiki'
    | 'story_bible'
    | 'narrative_state'
    | 'soul_profile'
    | 'workspace_files'
    | 'markdown_folder'
    | 'current_document'
    | 'current_chapter'
    | 'current_selection'
    | 'upstream_output'
    | 'manual_context'
    | 'mcp_context'
  sourceId: string
  enabled: boolean
  priority: number
  injectAs: 'system_context' | 'task_context' | 'evidence' | 'reference' | 'tool_only'
  retrieval?: {
    topK: number
    minScore: number
    searchMode: 'vector' | 'keyword' | 'hybrid'
    rerank: boolean
    metadataFilter?: Record<string, unknown>
  }
}

export interface NodeContextConfig {
  inheritWorkflowContext: boolean
  inheritGroupContext: boolean
  bindings: NodeContextBinding[]
  mergePolicy: 'priority' | 'append' | 'deduplicate' | 'rerank'
  conflictPolicy: 'prefer_verified' | 'prefer_node' | 'prefer_workspace' | 'prefer_latest' | 'ask_user'
  maxContextTokens: number
  includeSourceMetadata: boolean
  includeEvidenceReferences: boolean
  writebackPolicy: 'disabled' | 'draft_only' | 'require_approval'
}

export interface SoulBindingConfig {
  mode: ResourceBindingMode
  soulId?: string
  usageMode: 'critic' | 'planner' | 'method_reference' | 'diagnostic' | 'style_risk_check'
  enabledAttributes: Array<
    | 'narrative_methods'
    | 'character_design'
    | 'dialogue_features'
    | 'imagery_system'
    | 'pacing_preference'
    | 'critic_lens'
    | 'safety_shield'
    | 'do_not_copy'
  >
  influenceStrength: number
  localInstruction?: string
  blockDirectImitation: boolean
  blockSignaturePhrases: boolean
  blockCharacterReplication: boolean
}

export interface RAGBindingConfig {
  provider: 'lancedb' | 'qdrant' | 'chroma' | 'pgvector' | 'custom'
  collectionId: string
  namespace?: string
  querySource: 'user_input' | 'node_task' | 'upstream_output' | 'custom_template'
  queryTemplate?: string
  searchMode: 'vector' | 'keyword' | 'hybrid'
  topK: number
  minScore: number
  metadataFilters: Record<string, unknown>
  rerank: boolean
  rerankerId?: string
  maxTokens: number
  deduplicate: boolean
  writePermission: 'read_only' | 'append_with_approval' | 'update_with_approval'
}

export interface LivingWikiBindingConfig {
  wikiId: string
  namespaces: string[]
  entityTypes: string[]
  pageIds?: string[]
  tags?: string[]
  relationDepth: number
  queryMode: 'exact' | 'semantic' | 'hybrid'
  maxItems: number
  maxTokens: number
  includeDraftEntries: boolean
  includeConflictedEntries: boolean
  writePermission: 'read_only' | 'suggest_changes' | 'write_with_approval'
}

export interface StoryBibleBindingConfig {
  storyBibleId: string
  sections: string[]
  entityIds?: string[]
  tags?: string[]
  maxItems: number
  maxTokens: number
  writePermission: 'read_only' | 'suggest_changes' | 'write_with_approval'
}

export interface NarrativeStateBindingConfig {
  narrativeStateId: string
  stateTypes: string[]
  characterIds?: string[]
  sceneIds?: string[]
  maxItems: number
  maxTokens: number
  writePermission: 'read_only' | 'suggest_changes' | 'write_with_approval'
}

export interface KnowledgeWritebackProposal {
  id: string
  workflowId: string
  runId: string
  nodeId: string
  sourceType: 'living_wiki' | 'story_bible' | 'narrative_state' | 'soul_profile' | 'rag'
  sourceId: string
  operation: 'append' | 'update' | 'delete' | 'suggest'
  diff: unknown
  reason: string
  riskLevel: 'low' | 'medium' | 'high'
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  reviewedAt?: string
  reviewedBy?: string
}

export interface NodeWarning {
  code: string
  message: string
  severity: 'error' | 'warning' | 'info'
  relatedResourceId?: string
  fixSuggestion?: string
}

export interface FanOutConfig {
  mode: 'broadcast' | 'round_robin' | 'partition' | 'custom'
  maxConcurrency?: number
  partitionKey?: string
}

export interface BarrierConfig {
  waitMode: 'all' | 'minimum_count' | 'minimum_ratio' | 'first_success' | 'first_complete'
  expectedInputs?: number
  minimumCount?: number
  minimumRatio?: number
  timeoutSeconds?: number
  onTimeout: 'continue' | 'fail' | 'partial_output' | 'ask_user'
}

export interface JudgeConfig {
  mode: 'boolean' | 'score' | 'json_path' | 'expression' | 'llm'
  expression?: string
  scoreThreshold?: number
  jsonPath?: string
  prompt?: NodePromptConfig
  outputSchema?: Record<string, unknown>
}

export type ConsensusMode = 'all_pass' | 'quorum' | 'weighted' | 'veto' | 'custom'

export interface ConsensusPolicy {
  mode: ConsensusMode
  requireAllResponses: boolean
  quorumRatio?: number
  minimumPassCount?: number
  passingScore?: number
  weights?: Record<string, number>
  vetoInputIds?: string[]
  customExpression?: string
}

export interface LoopGuardConfig {
  maxRounds?: number
  maxTokens?: number
  maxCost?: number
  maxDurationSeconds?: number
  exitExpression?: string
  stagnation?: {
    enabled: boolean
    roundsWithoutImprovement: number
    minimumImprovement: number
  }
  onLimitReached: 'pause' | 'fail' | 'continue_to_output' | 'ask_user'
}

export interface CritiqueResult {
  artifactId: string
  artifactVersion: number
  artifactHash: string
  criticNodeId: string
  verdict: 'pass' | 'fail' | 'abstain' | 'error'
  overallScore?: number
  confidence?: number
  criteria: Array<{ name: string; score: number; passed: boolean; comment: string }>
  blockingIssues: Array<{ severity: 'critical' | 'major' | 'minor'; description: string; suggestion?: string }>
  suggestions: Array<{ description: string; priority: 'high' | 'medium' | 'low' }>
  strengths: string[]
  summary: string
}

export interface WorkflowAgentPermissions {
  canEditDraft: boolean
  canComment: boolean
  canUseKnowledge: boolean
  canReadUpstream: boolean
}

export interface WorkflowAgent {
  id: string
  name: string
  role: string
  color: string
  tagline: string
  duties: string
  forbidden: string
  output_format: string
  model: string
  temperature: number
  top_p: number
  constraints: string[]
  permissions: WorkflowAgentPermissions
  enabled?: boolean
  isBuiltin?: boolean
  avatar?: string
}

export interface WorkflowNodeData {
  label?: string
  subtitle?: string
  agent_id?: string
  agent_name?: string
  content?: string
  prompt?: string
  condition?: string
  threshold?: number
  rounds?: number
  locked?: boolean
  isStart?: boolean
  requiresReview?: boolean
  color?: string
  icon?: string
  nodeType: WorkflowNodeType
  model?: string
  skill?: string
  plugin?: string
  mcp?: string
  knowledge?: string
  soul?: string
  modelConfig?: NodeModelConfig
  budgetConfig?: NodeBudgetConfig
  promptConfig?: NodePromptConfig
  contextConfig?: NodeContextConfig
  soulConfig?: SoulBindingConfig
  skillsConfig?: NodeResourceBinding
  mcpConfig?: NodeResourceBinding
  toolsConfig?: NodeResourceBinding
  pluginsConfig?: NodeResourceBinding
  knowledgeConfig?: NodeResourceBinding
  ragConfig?: RAGBindingConfig
  wikiConfig?: LivingWikiBindingConfig
  bibleConfig?: StoryBibleBindingConfig
  narrativeConfig?: NarrativeStateBindingConfig
  reviewConfig?: { requireApproval: boolean; approvalMessage?: string; autoApprove?: boolean }
  fanoutConfig?: FanOutConfig
  barrierConfig?: BarrierConfig
  judgeConfig?: JudgeConfig
  consensusConfig?: ConsensusPolicy
  loopConfig?: LoopGuardConfig
  retryConfig?: { maxRetries: number; delaySeconds: number; backoffMultiplier: number }
  timeoutConfig?: { timeoutMs: number; onTimeout: 'fail' | 'skip' | 'retry' }
  outputSchema?: Record<string, unknown>
  inputText?: string
  variableName?: string
  constantValue?: string
  filePath?: string
  searchQuery?: string
  wikiNamespace?: string
  bibleScope?: string[]
  narrativeAspects?: string[]
  mergeStrategy?: string
  trimTokens?: number
  warnings?: NodeWarning[]
  legacyConfig?: Record<string, unknown>
  [key: string]: unknown
}

export interface WorkflowNodeRecord {
  id: string
  type: WorkflowNodeType | string
  position: { x: number; y: number }
  size?: { width: number; height: number }
  data: WorkflowNodeData
  selected?: boolean
  dragging?: boolean
}

export interface WorkflowEdgeRecord {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  label?: string
  type?: 'normal' | 'condition' | 'loop' | 'human_approval'
  condition?: {
    expression?: string
    description?: string
    maxRounds?: number
    onLimitReached?: string
  }
  animated?: boolean
  style?: Record<string, unknown>
}

export interface WorkflowLimits {
  max_agents: number
  max_parallel: number
  max_loop: number
}

export interface WorkflowRuntimeConfig {
  defaultModel: string
  maxNodesPerRun: number
  allowLoop: boolean
  allowParallel: boolean
  timeoutMs: number
  finalOutputNodeId?: string
  saveRunHistory: boolean
  maxConcurrency: number
}

export interface WorkflowValidationError {
  code: string
  message: string
  userMessage: string
  relatedNodeId?: string
  relatedEdgeId?: string
  fixSuggestions?: Array<{ label: string; action: string }>
  severity: 'error' | 'warning' | 'info'
}

export interface WorkflowValidationResult {
  valid: boolean
  errors: WorkflowValidationError[]
  warnings: WorkflowValidationError[]
}

export interface WriterWorkflow {
  id?: string
  project_id?: string
  workspaceId?: string
  name: string
  description?: string
  mode: 'simple' | 'canvas'
  nodes: WorkflowNodeRecord[]
  edges: WorkflowEdgeRecord[]
  limits: WorkflowLimits
  runtimeConfig: WorkflowRuntimeConfig
  knowledge_binding: { enabled: boolean; ids?: string[] }
  schema_version?: number
  created_at?: string
  updated_at?: string
  version?: number
  tags?: string[]
  builtin?: boolean
}

export interface NodeRunRecord {
  id: string
  workflowRunId: string
  nodeId: string
  status: NodeRunStatus
  input?: unknown
  output?: unknown
  prompt?: string
  context?: string[]
  toolCalls?: Array<{ tool: string; args: unknown; result?: unknown; status: string }>
  error?: {
    code: string
    message: string
    userMessage: string
    stack?: string
  }
  startedAt?: string
  endedAt?: string
  tokenUsage?: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  durationMs?: number
}

export interface WorkflowRun {
  run_id: string
  workflow_id: string
  workspaceId: string
  status: 'pending' | 'running' | 'success' | 'failed' | 'cancelled' | 'paused'
  paused_at_node_id?: string
  node_statuses?: Record<
    string,
    {
      status: string
      label?: string
      summary?: string
      agent_name?: string
      action_note?: string
      branch?: string
      score?: number
      threshold?: number
      input?: unknown
      output?: unknown
      errorMessage?: string
    }
  >
  nodeRuns?: NodeRunRecord[]
  artifacts?: Array<{ id: string; title: string; path?: string; content?: string; version: number }>
  started_at?: string
  finished_at?: string
  cost_estimate?: {
    calls?: number
    tokens?: number
    input_tokens?: number
    output_tokens?: number
    cost?: number
    by_model?: Array<{ model: string; tokens: number; percent: number }>
    by_node?: Array<{ name: string; tokens: number; percent: number }>
  }
  progress?: { total?: number; completed?: number }
  error?: WorkflowValidationError
  input?: {
    mode: 'manual' | 'current_file' | 'selection' | 'project_context'
    text?: string
    fileId?: string
  }
  finalOutput?: string
}

export interface NodeResourceItem {
  id: string
  name: string
  description?: string
  scope?: 'project' | 'global'
  enabled?: boolean
  available?: boolean
  status?: 'ready' | 'error' | 'loading' | 'disabled'
  icon?: string
  source?: string
  unavailableReason?: string
  category?: string
  documentCount?: number
  provider?: string
  contextWindow?: number
  tagline?: string
  path?: string
}

export interface NodeResourceMcpItem extends NodeResourceItem {
  tools?: Array<{ id: string; name: string; description?: string }>
}

export interface NodeResourceConfig {
  skills: NodeResourceItem[]
  mcp: NodeResourceMcpItem[]
  knowledge: NodeResourceItem[]
  plugins: NodeResourceItem[]
  models: NodeResourceItem[]
  souls: NodeResourceItem[]
  connectors?: NodeResourceItem[]
  providers?: Array<{ id: string; name: string; models: string[] }>
}

export type FlowNodeData = WorkflowNodeData & {
  label: string
  nodeType: WorkflowNodeType | string
  color?: string
  runStatus?: NodeRunStatus | string
  summary?: string
  isStart?: boolean
  locked?: boolean
  progress?: number
  errorMessage?: string
}

export type FlowNode = import('@xyflow/react').Node<FlowNodeData>
export type FlowEdge = import('@xyflow/react').Edge

export const DEFAULT_LIMITS: WorkflowLimits = { max_agents: 20, max_parallel: 5, max_loop: 10 }

export const DEFAULT_RUNTIME_CONFIG: WorkflowRuntimeConfig = {
  defaultModel: 'deepseek-chat',
  maxNodesPerRun: 50,
  allowLoop: true,
  allowParallel: true,
  timeoutMs: 300000,
  saveRunHistory: true,
  maxConcurrency: 3
}

export const PORT_COMPATIBILITY: Partial<Record<KarnaPortType, KarnaPortType[]>> = {
  ANY: ['TEXT', 'MARKDOWN', 'DOCUMENT', 'CHAPTER', 'SCENE', 'JSON', 'PROMPT', 'CONTEXT', 'AGENT_RESULT'],
  TEXT: ['TEXT', 'MARKDOWN', 'ANY'],
  MARKDOWN: ['MARKDOWN', 'TEXT', 'ANY'],
  DOCUMENT: ['DOCUMENT', 'CHAPTER', 'SCENE', 'TEXT', 'ANY'],
  CHAPTER: ['CHAPTER', 'DOCUMENT', 'TEXT', 'ANY'],
  PROMPT: ['PROMPT', 'TEXT', 'ANY'],
  CONTEXT: ['CONTEXT', 'TEXT', 'ANY'],
  AGENT_RESULT: ['AGENT_RESULT', 'TEXT', 'MARKDOWN', 'ANY'],
  CRITIQUE_RESULT: ['CRITIQUE_RESULT', 'CRITIQUE_SET', 'JSON', 'ANY'],
  CRITIQUE_SET: ['CRITIQUE_SET', 'JSON', 'ANY'],
  JSON: ['JSON', 'TEXT', 'ANY'],
  BOOLEAN: ['BOOLEAN', 'ANY'],
  NUMBER: ['NUMBER', 'ANY']
}

export const NODE_CATEGORIES: Array<{ id: string; label: string; icon: string; color: string }> = [
  { id: 'input', label: '输入', icon: 'arrow-down', color: 'sky' },
  { id: 'agent', label: 'Agent', icon: 'robot', color: 'violet' },
  { id: 'prompt', label: 'Prompt', icon: 'note', color: 'pink' },
  { id: 'context', label: '上下文', icon: 'layers', color: 'teal' },
  { id: 'knowledge', label: '知识', icon: 'book', color: 'cyan' },
  { id: 'tools', label: '工具', icon: 'tools', color: 'amber' },
  { id: 'control', label: '控制', icon: 'git-branch', color: 'orange' },
  { id: 'judge', label: '判断评估', icon: 'checklist', color: 'yellow' },
  { id: 'aggregate', label: '聚合', icon: 'merge', color: 'indigo' },
  { id: 'human', label: '人工', icon: 'account', color: 'emerald' },
  { id: 'version', label: '版本', icon: 'archive', color: 'slate' },
  { id: 'output', label: '输出', icon: 'arrow-up', color: 'fuchsia' }
]

export const NODE_DEFINITIONS: KarnaNodeDefinition[] = [
  {
    classType: 'input_text',
    version: '1.0',
    category: 'input',
    displayName: '文本输入',
    description: '手动输入文本内容作为流程起点',
    icon: 'arrow-down',
    color: '#0ea5e9',
    capabilities: [],
    inputs: [],
    outputs: [{ id: 'out', name: '文本', type: 'TEXT', required: true }],
    inspectorSchema: [
      {
        id: 'basic', label: '基础', icon: 'tag',
        fields: [
          { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '文本输入' },
          { key: 'inputText', label: '默认文本', type: 'textarea', section: 'basic', placeholder: '在此输入默认文本内容...' },
          { key: 'variableName', label: '变量名', type: 'text', section: 'basic', placeholder: 'input_text' }
        ]
      }
    ],
    defaultConfig: { label: '文本输入', inputText: '' }
  },
  {
    classType: 'agent',
    version: '1.0',
    category: 'agent',
    displayName: '通用 Agent',
    description: '核心智能体节点，可配置角色、提示词、模型和资源',
    icon: 'robot',
    color: '#8b5cf6',
    capabilities: ['prompt', 'model', 'skills', 'plugins', 'context', 'rag', 'living_wiki', 'story_bible', 'narrative_state', 'soul', 'tools', 'mcp', 'human_review', 'retry', 'timeout', 'output_schema', 'writeback', 'budget', 'debug', 'network'],
    inputs: [
      { id: 'in', name: '输入', type: 'ANY', multiple: true },
      { id: 'context_in', name: '上下文', type: 'CONTEXT', multiple: true }
    ],
    outputs: [
      { id: 'out', name: '输出', type: 'AGENT_RESULT' },
      { id: 'text_out', name: '文本', type: 'TEXT' }
    ],
    inspectorSchema: [
      {
        id: 'basic', label: '基础', icon: 'tag',
        fields: [
          { key: 'label', label: '节点名称', type: 'text', section: 'basic', defaultValue: '通用 Agent' },
          { key: 'agent_id', label: '绑定智能体', type: 'select', section: 'basic', helpText: '选择预设智能体配置' }
        ]
      },
      {
        id: 'prompt', label: '提示词', icon: 'note',
        fields: [
          { key: 'rolePrompt', label: '角色设定', type: 'textarea', section: 'prompt', placeholder: '定义这个智能体的角色和职责...' },
          { key: 'taskPromptTemplate', label: '任务提示词', type: 'textarea', section: 'prompt', placeholder: '描述具体任务要求，支持{{variable}}变量...' }
        ]
      },
      {
        id: 'model', label: '模型', icon: 'settings-gear',
        fields: [
          { key: 'model', label: '模型选择', type: 'select', section: 'model' },
          { key: 'temperature', label: '温度', type: 'slider', section: 'model', min: 0, max: 2, step: 0.1, defaultValue: 0.7 }
        ]
      }
    ],
    defaultConfig: { label: '通用 Agent', temperature: 0.7 }
  },
  {
    classType: 'critic',
    version: '1.0',
    category: 'agent',
    displayName: '评论家 Agent',
    description: '专门用于评审和评分的智能体，输出结构化评论结果',
    icon: 'comment',
    color: '#ec4899',
    capabilities: ['prompt', 'model', 'context', 'rag', 'living_wiki', 'story_bible', 'narrative_state', 'soul', 'output_schema', 'budget', 'debug', 'human_review'],
    inputs: [
      { id: 'artifact_in', name: '待评审作品', type: 'ARTIFACT', required: true },
      { id: 'criteria_in', name: '评审标准', type: 'TEXT' }
    ],
    outputs: [
      { id: 'critique_out', name: '评论结果', type: 'CRITIQUE_RESULT' }
    ],
    inspectorSchema: [
      {
        id: 'basic', label: '基础', icon: 'tag',
        fields: [
          { key: 'label', label: '节点名称', type: 'text', section: 'basic', defaultValue: '评论家' },
          { key: 'rolePrompt', label: '评审视角', type: 'textarea', section: 'basic', placeholder: '例如：文学评论家、商业编辑、人物逻辑审核...' }
        ]
      },
      {
        id: 'criteria', label: '评审标准', icon: 'checklist',
        fields: [
          { key: 'passingScore', label: '通过分数线', type: 'number', section: 'criteria', min: 0, max: 100, defaultValue: 60 }
        ]
      }
    ],
    defaultConfig: { label: '评论家', passingScore: 60 }
  },
  {
    classType: 'fanout',
    version: '1.0',
    category: 'control',
    displayName: 'FanOut 并行分发',
    description: '将输入分发给多个下游节点并行处理',
    icon: 'git-merge',
    color: '#06b6d4',
    capabilities: ['flow_control'],
    inputs: [{ id: 'in', name: '输入', type: 'ANY', required: true }],
    outputs: [{ id: 'out', name: '分发输出', type: 'ANY', multiple: true }],
    inspectorSchema: [
      {
        id: 'basic', label: '基础', icon: 'tag',
        fields: [
          { key: 'label', label: '节点名称', type: 'text', section: 'basic', defaultValue: '并行分发' },
          { key: 'fanoutConfig.mode', label: '分发模式', type: 'select', section: 'basic', options: [
            { value: 'broadcast', label: '广播（复制给所有下游）' },
            { value: 'round_robin', label: '轮询分发' },
            { value: 'partition', label: '按键分区' }
          ], defaultValue: 'broadcast' },
          { key: 'fanoutConfig.maxConcurrency', label: '最大并发数', type: 'number', section: 'basic', min: 1, max: 10, defaultValue: 3 }
        ]
      }
    ],
    defaultConfig: { label: '并行分发', fanoutConfig: { mode: 'broadcast', maxConcurrency: 3 } }
  },
  {
    classType: 'barrier',
    version: '1.0',
    category: 'control',
    displayName: 'Barrier 屏障',
    description: '等待多个上游节点完成后再继续',
    icon: 'primitive-square',
    color: '#f97316',
    capabilities: ['retry', 'timeout', 'flow_control'],
    inputs: [{ id: 'in', name: '输入', type: 'ANY', required: true, multiple: true }],
    outputs: [{ id: 'out', name: '汇总输出', type: 'ANY' }],
    inspectorSchema: [
      {
        id: 'basic', label: '基础', icon: 'tag',
        fields: [
          { key: 'label', label: '节点名称', type: 'text', section: 'basic', defaultValue: '屏障同步' },
          { key: 'barrierConfig.waitMode', label: '等待模式', type: 'select', section: 'basic', options: [
            { value: 'all', label: '等待所有输入' },
            { value: 'minimum_count', label: '等待指定数量' },
            { value: 'minimum_ratio', label: '等待指定比例' },
            { value: 'first_success', label: '第一个成功即继续' },
            { value: 'first_complete', label: '第一个完成即继续' }
          ], defaultValue: 'all' },
          { key: 'barrierConfig.minimumCount', label: '最小等待数', type: 'number', section: 'basic', min: 1, defaultValue: 2 },
          { key: 'barrierConfig.timeoutSeconds', label: '超时（秒）', type: 'number', section: 'basic', min: 0, defaultValue: 300 }
        ]
      }
    ],
    defaultConfig: { label: '屏障同步', barrierConfig: { waitMode: 'all', timeoutSeconds: 300, onTimeout: 'fail' } }
  },
  {
    classType: 'condition',
    version: '1.0',
    category: 'control',
    displayName: '条件分支',
    description: '根据条件判断走不同分支',
    icon: 'git-branch',
    color: '#f59e0b',
    capabilities: ['flow_control'],
    inputs: [{ id: 'in', name: '输入', type: 'ANY', required: true }],
    outputs: [
      { id: 'true_out', name: '条件成立', type: 'ANY' },
      { id: 'false_out', name: '条件不成立', type: 'ANY' }
    ],
    inspectorSchema: [
      {
        id: 'basic', label: '基础', icon: 'tag',
        fields: [
          { key: 'label', label: '节点名称', type: 'text', section: 'basic', defaultValue: '条件判断' },
          { key: 'condition', label: '条件表达式', type: 'textarea', section: 'basic', placeholder: '例如：score >= 60' }
        ]
      }
    ],
    defaultConfig: { label: '条件判断', condition: '' }
  },
  {
    classType: 'loop_controller',
    version: '1.0',
    category: 'control',
    displayName: '循环控制器',
    description: '控制循环执行，设置轮数上限和退出条件',
    icon: 'sync',
    color: '#f97316',
    capabilities: ['timeout', 'flow_control'],
    inputs: [{ id: 'in', name: '输入', type: 'ANY', required: true }],
    outputs: [{ id: 'out', name: '循环体', type: 'ANY' }, { id: 'exit_out', name: '退出循环', type: 'ANY' }],
    inspectorSchema: [
      {
        id: 'basic', label: '基础', icon: 'tag',
        fields: [
          { key: 'label', label: '节点名称', type: 'text', section: 'basic', defaultValue: '循环控制' },
          { key: 'loopConfig.maxRounds', label: '最大轮数', type: 'number', section: 'basic', min: 1, max: 20, defaultValue: 3 },
          { key: 'loopConfig.exitExpression', label: '退出条件', type: 'text', section: 'basic', placeholder: '例如：score >= 80' }
        ]
      }
    ],
    defaultConfig: { label: '循环控制', loopConfig: { maxRounds: 3, onLimitReached: 'continue_to_output' } }
  },
  {
    classType: 'human_confirm',
    version: '1.0',
    category: 'human',
    displayName: '人工确认',
    description: '暂停流程等待人工审核确认后继续',
    icon: 'account',
    color: '#10b981',
    capabilities: ['human_review', 'timeout', 'flow_control'],
    inputs: [{ id: 'in', name: '待确认内容', type: 'ANY', required: true }],
    outputs: [
      { id: 'approve_out', name: '通过', type: 'ANY' },
      { id: 'reject_out', name: '驳回', type: 'ANY' },
      { id: 'edit_out', name: '修改后', type: 'ANY' }
    ],
    inspectorSchema: [
      {
        id: 'basic', label: '基础', icon: 'tag',
        fields: [
          { key: 'label', label: '节点名称', type: 'text', section: 'basic', defaultValue: '人工确认' },
          { key: 'requiresReview', label: '需要人工确认', type: 'boolean', section: 'basic', defaultValue: true },
          { key: 'reviewPrompt', label: '确认提示', type: 'textarea', section: 'basic', placeholder: '告知用户需要确认什么内容...' }
        ]
      }
    ],
    defaultConfig: { label: '人工确认', requiresReview: true }
  },
  {
    classType: 'text_merge',
    version: '1.0',
    category: 'aggregate',
    displayName: '文本合并',
    description: '将多个文本输入合并为一个输出',
    icon: 'merge',
    color: '#6366f1',
    capabilities: [],
    inputs: [{ id: 'in', name: '输入文本', type: 'TEXT', multiple: true, required: true }],
    outputs: [{ id: 'out', name: '合并文本', type: 'TEXT' }],
    inspectorSchema: [
      {
        id: 'basic', label: '基础', icon: 'tag',
        fields: [
          { key: 'label', label: '节点名称', type: 'text', section: 'basic', defaultValue: '文本合并' },
          { key: 'mergeStrategy', label: '合并策略', type: 'select', section: 'basic', options: [
            { value: 'concat', label: '简单拼接' },
            { value: 'separator', label: '分隔符分隔' },
            { value: 'llm_summarize', label: 'LLM 智能聚合' }
          ], defaultValue: 'concat' },
          { key: 'separator', label: '分隔符', type: 'text', section: 'basic', defaultValue: '\n\n---\n\n' }
        ]
      }
    ],
    defaultConfig: { label: '文本合并', mergeStrategy: 'concat', separator: '\n\n---\n\n' }
  },
  {
    classType: 'consensus',
    version: '1.0',
    category: 'judge',
    displayName: '共识判断',
    description: '根据多个评论家结果计算共识是否通过',
    icon: 'check-all',
    color: '#eab308',
    capabilities: [],
    inputs: [{ id: 'critiques_in', name: '评论结果集', type: 'CRITIQUE_SET', required: true, multiple: true }],
    outputs: [
      { id: 'pass_out', name: '通过', type: 'CONSENSUS_DECISION' },
      { id: 'fail_out', name: '未通过', type: 'CONSENSUS_DECISION' }
    ],
    inspectorSchema: [
      {
        id: 'basic', label: '基础', icon: 'tag',
        fields: [
          { key: 'label', label: '节点名称', type: 'text', section: 'basic', defaultValue: '共识判断' },
          { key: 'consensusConfig.mode', label: '共识模式', type: 'select', section: 'basic', options: [
            { value: 'all_pass', label: '全部通过' },
            { value: 'quorum', label: '比例通过' },
            { value: 'weighted', label: '加权投票' },
            { value: 'veto', label: '一票否决' }
          ], defaultValue: 'quorum' },
          { key: 'consensusConfig.quorumRatio', label: '通过比例', type: 'slider', section: 'basic', min: 0, max: 100, step: 5, defaultValue: 50 },
          { key: 'consensusConfig.passingScore', label: '通过分数线', type: 'number', section: 'basic', min: 0, max: 100, defaultValue: 60 }
        ]
      }
    ],
    defaultConfig: { label: '共识判断', consensusConfig: { mode: 'quorum', requireAllResponses: true, quorumRatio: 0.5, passingScore: 60 } }
  },
  {
    classType: 'critique_aggregate',
    version: '1.0',
    category: 'aggregate',
    displayName: '意见聚合',
    description: '聚合多个评论家意见生成修订摘要',
    icon: 'feedback',
    color: '#8b5cf6',
    capabilities: ['prompt', 'model'],
    inputs: [{ id: 'critiques_in', name: '评论结果', type: 'CRITIQUE_SET', required: true, multiple: true }],
    outputs: [{ id: 'brief_out', name: '修订摘要', type: 'REVISION_BRIEF' }],
    inspectorSchema: [
      {
        id: 'basic', label: '基础', icon: 'tag',
        fields: [
          { key: 'label', label: '节点名称', type: 'text', section: 'basic', defaultValue: '意见聚合' },
          { key: 'aggregationMode', label: '聚合模式', type: 'select', section: 'basic', options: [
            { value: 'rules', label: '规则聚合' },
            { value: 'llm', label: 'LLM 智能聚合' },
            { value: 'hybrid', label: '混合模式' }
          ], defaultValue: 'hybrid' }
        ]
      }
    ],
    defaultConfig: { label: '意见聚合', aggregationMode: 'hybrid', preserveSources: true, mergeDuplicates: true }
  },
  {
    classType: 'rag_search',
    version: '1.0',
    category: 'knowledge',
    displayName: 'RAG 检索',
    description: '从向量知识库检索相关内容',
    icon: 'search',
    color: '#06b6d4',
    capabilities: ['rag', 'context', 'output_schema', 'debug'],
    inputs: [{ id: 'query_in', name: '查询', type: 'TEXT', required: true }],
    outputs: [{ id: 'results_out', name: '检索结果', type: 'EVIDENCE_SET' }, { id: 'context_out', name: '上下文', type: 'CONTEXT' }],
    inspectorSchema: [
      {
        id: 'basic', label: '基础', icon: 'tag',
        fields: [
          { key: 'label', label: '节点名称', type: 'text', section: 'basic', defaultValue: 'RAG 检索' },
          { key: 'knowledge', label: '知识库', type: 'select', section: 'basic' },
          { key: 'topK', label: 'Top K', type: 'number', section: 'basic', min: 1, max: 20, defaultValue: 5 },
          { key: 'minScore', label: '最低相似度', type: 'slider', section: 'basic', min: 0, max: 100, step: 5, defaultValue: 70 }
        ]
      }
    ],
    defaultConfig: { label: 'RAG 检索', topK: 5, minScore: 0.7, searchMode: 'hybrid', rerank: true }
  },
  {
    classType: 'mcp_tool',
    version: '1.0',
    category: 'tools',
    displayName: 'MCP 工具',
    description: '调用 MCP 服务器提供的工具',
    icon: 'plug',
    color: '#f59e0b',
    capabilities: ['tools', 'mcp', 'human_review', 'permissions', 'debug'],
    inputs: [
      { id: 'args_in', name: '参数', type: 'JSON' },
      { id: 'context_in', name: '上下文', type: 'CONTEXT', multiple: true }
    ],
    outputs: [
      { id: 'result_out', name: '工具结果', type: 'ANY' },
      { id: 'text_out', name: '文本输出', type: 'TEXT' }
    ],
    inspectorSchema: [
      {
        id: 'basic', label: '基础', icon: 'tag',
        fields: [
          { key: 'label', label: '节点名称', type: 'text', section: 'basic', defaultValue: 'MCP 工具' },
          { key: 'mcpServer', label: 'MCP 服务器', type: 'select', section: 'basic' },
          { key: 'toolName', label: '工具名称', type: 'select', section: 'basic' },
          { key: 'requireApproval', label: '需要审批', type: 'boolean', section: 'basic', defaultValue: true }
        ]
      }
    ],
    defaultConfig: { label: 'MCP 工具', requireApproval: true }
  },
  {
    classType: 'save_snapshot',
    version: '1.0',
    category: 'version',
    displayName: '保存快照',
    description: '保存当前作品版本',
    icon: 'save',
    color: '#64748b',
    capabilities: ['archive', 'filesystem', 'human_review', 'permissions', 'artifact'],
    inputs: [{ id: 'content_in', name: '内容', type: 'TEXT' }, { id: 'artifact_in', name: '作品', type: 'ARTIFACT' }],
    outputs: [{ id: 'artifact_out', name: '版本化作品', type: 'ARTIFACT_VERSION' }],
    inspectorSchema: [
      {
        id: 'basic', label: '基础', icon: 'tag',
        fields: [
          { key: 'label', label: '节点名称', type: 'text', section: 'basic', defaultValue: '保存快照' },
          { key: 'versionTag', label: '版本标签', type: 'text', section: 'basic', placeholder: '例如：v1.0、初稿、润色后' }
        ]
      }
    ],
    defaultConfig: { label: '保存快照' }
  },
  {
    classType: 'final_output',
    version: '1.0',
    category: 'output',
    displayName: '最终输出',
    description: '流程最终输出节点',
    icon: 'arrow-up',
    color: '#d946ef',
    capabilities: [],
    inputs: [{ id: 'in', name: '输入', type: 'ANY', required: true, multiple: true }],
    outputs: [],
    inspectorSchema: [
      {
        id: 'basic', label: '基础', icon: 'tag',
        fields: [
          { key: 'label', label: '节点名称', type: 'text', section: 'basic', defaultValue: '最终输出' },
          { key: 'outputFormat', label: '输出格式', type: 'select', section: 'basic', options: [
            { value: 'text', label: '纯文本' },
            { value: 'markdown', label: 'Markdown' },
            { value: 'file', label: '保存到文件' }
          ], defaultValue: 'markdown' }
        ]
      }
    ],
    defaultConfig: { label: '最终输出', outputFormat: 'markdown', isFinalOutput: true }
  },
  {
    classType: 'input_file',
    version: '1.0',
    category: 'input',
    displayName: '文件输入',
    description: '从工作区读取文件作为输入',
    icon: 'file',
    color: '#0284c7',
    capabilities: ['filesystem'],
    inputs: [],
    outputs: [{ id: 'out', name: '文件内容', type: 'DOCUMENT', required: true }, { id: 'text_out', name: '文本', type: 'TEXT' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '文件输入' },
        { key: 'filePath', label: '文件路径', type: 'text', section: 'basic', placeholder: '相对工作区路径' }
      ]}
    ],
    defaultConfig: { label: '文件输入' }
  },
  {
    classType: 'input_variable',
    version: '1.0',
    category: 'input',
    displayName: '变量输入',
    description: '定义可在运行时传入的变量',
    icon: 'symbol-variable',
    color: '#38bdf8',
    capabilities: ['input_schema'],
    inputs: [],
    outputs: [{ id: 'out', name: '变量值', type: 'ANY', required: true }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '变量' },
        { key: 'variableName', label: '变量名', type: 'text', section: 'basic', placeholder: 'var_name' },
        { key: 'defaultValue', label: '默认值', type: 'text', section: 'basic' }
      ]}
    ],
    defaultConfig: { label: '变量' }
  },
  {
    classType: 'input_constant',
    version: '1.0',
    category: 'input',
    displayName: '常量',
    description: '定义固定常量值',
    icon: 'circle-large',
    color: '#7dd3fc',
    capabilities: [],
    inputs: [],
    outputs: [{ id: 'out', name: '常量值', type: 'ANY', required: true }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '常量' },
        { key: 'constantValue', label: '常量值', type: 'textarea', section: 'basic' }
      ]}
    ],
    defaultConfig: { label: '常量' }
  },
  {
    classType: 'tool_agent',
    version: '1.0',
    category: 'agent',
    displayName: '工具 Agent',
    description: '专门调用工具的智能体，可绑定MCP和工具集',
    icon: 'tools',
    color: '#f59e0b',
    capabilities: ['prompt', 'model', 'tools', 'mcp', 'context', 'human_review', 'retry', 'timeout', 'output_schema', 'budget', 'debug', 'network', 'permissions'],
    inputs: [
      { id: 'in', name: '任务', type: 'TEXT', required: true },
      { id: 'context_in', name: '上下文', type: 'CONTEXT', multiple: true }
    ],
    outputs: [
      { id: 'out', name: '结果', type: 'AGENT_RESULT' },
      { id: 'tool_out', name: '工具结果', type: 'TOOL_RESULT' }
    ],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '节点名称', type: 'text', section: 'basic', defaultValue: '工具 Agent' }
      ]}
    ],
    defaultConfig: { label: '工具 Agent' }
  },
  {
    classType: 'scheduler',
    version: '1.0',
    category: 'control',
    displayName: '调度器',
    description: '工作流调度入口，协调各节点执行顺序',
    icon: 'dashboard',
    color: '#a855f7',
    capabilities: ['flow_control'],
    inputs: [{ id: 'in', name: '输入', type: 'ANY', multiple: true }],
    outputs: [{ id: 'out', name: '调度输出', type: 'ANY', multiple: true }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '调度器' }
      ]}
    ],
    defaultConfig: { label: '调度器' }
  },
  {
    classType: 'prompt_template',
    version: '1.0',
    category: 'prompt',
    displayName: 'Prompt 模板',
    description: '可复用的提示词模板节点',
    icon: 'note',
    color: '#ec4899',
    capabilities: ['prompt'],
    inputs: [{ id: 'vars_in', name: '变量', type: 'ANY', multiple: true }],
    outputs: [{ id: 'prompt_out', name: 'Prompt', type: 'PROMPT', required: true }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: 'Prompt 模板' },
        { key: 'content', label: '模板内容', type: 'textarea', section: 'basic', placeholder: '支持 {{变量}} 占位符' }
      ]}
    ],
    defaultConfig: { label: 'Prompt 模板' }
  },
  {
    classType: 'prompt_merge',
    version: '1.0',
    category: 'prompt',
    displayName: 'Prompt 合并',
    description: '合并多个 Prompt 片段',
    icon: 'combine',
    color: '#f472b6',
    capabilities: ['prompt'],
    inputs: [{ id: 'in', name: 'Prompt 片段', type: 'PROMPT', multiple: true, required: true }],
    outputs: [{ id: 'out', name: '合并 Prompt', type: 'PROMPT' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: 'Prompt 合并' },
        { key: 'mergeStrategy', label: '合并策略', type: 'select', section: 'basic', options: [
          { value: 'concat', label: '顺序拼接' },
          { value: 'sections', label: '分段标记' }
        ], defaultValue: 'concat' }
      ]}
    ],
    defaultConfig: { label: 'Prompt 合并', mergeStrategy: 'concat' }
  },
  {
    classType: 'context_merge',
    version: '1.0',
    category: 'context',
    displayName: '上下文合并',
    description: '合并多个上下文来源并去重',
    icon: 'layers',
    color: '#14b8a6',
    capabilities: ['context'],
    inputs: [{ id: 'in', name: '上下文', type: 'CONTEXT', multiple: true, required: true }],
    outputs: [{ id: 'out', name: '合并上下文', type: 'CONTEXT' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '上下文合并' },
        { key: 'deduplicate', label: '去重', type: 'boolean', section: 'basic', defaultValue: true },
        { key: 'maxTokens', label: '最大 Token', type: 'number', section: 'basic', min: 1000, defaultValue: 16000 }
      ]}
    ],
    defaultConfig: { label: '上下文合并', deduplicate: true, maxTokens: 16000 }
  },
  {
    classType: 'context_trim',
    version: '1.0',
    category: 'context',
    displayName: '上下文裁剪',
    description: '按 Token 预算裁剪上下文',
    icon: 'cut',
    color: '#2dd4bf',
    capabilities: ['context'],
    inputs: [{ id: 'in', name: '上下文', type: 'CONTEXT', required: true }],
    outputs: [{ id: 'out', name: '裁剪后上下文', type: 'CONTEXT' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '上下文裁剪' },
        { key: 'trimTokens', label: '目标 Token 数', type: 'number', section: 'basic', min: 500, defaultValue: 8000 },
        { key: 'strategy', label: '裁剪策略', type: 'select', section: 'basic', options: [
          { value: 'tail', label: '保留尾部（最新）' },
          { value: 'head', label: '保留头部' },
          { value: 'relevance', label: '按相关性' }
        ], defaultValue: 'relevance' }
      ]}
    ],
    defaultConfig: { label: '上下文裁剪', trimTokens: 8000, strategy: 'relevance' }
  },
  {
    classType: 'wiki_query',
    version: '1.0',
    category: 'knowledge',
    displayName: 'Living Wiki 查询',
    description: '从 Living Wiki 中查询实体和关系',
    icon: 'book',
    color: '#22d3ee',
    capabilities: ['living_wiki', 'context', 'output_schema', 'debug'],
    inputs: [{ id: 'query_in', name: '查询', type: 'TEXT', required: true }],
    outputs: [{ id: 'results_out', name: '查询结果', type: 'WIKI_ENTITY_SET' }, { id: 'context_out', name: '上下文', type: 'CONTEXT' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: 'Wiki 查询' },
        { key: 'wikiNamespace', label: '命名空间', type: 'text', section: 'basic' },
        { key: 'maxItems', label: '最大条目数', type: 'number', section: 'basic', min: 1, max: 20, defaultValue: 5 }
      ]}
    ],
    defaultConfig: { label: 'Wiki 查询', maxItems: 5, queryMode: 'hybrid' }
  },
  {
    classType: 'bible_query',
    version: '1.0',
    category: 'knowledge',
    displayName: '剧情圣经查询',
    description: '从 Story Bible 中查询世界观设定',
    icon: 'book',
    color: '#06b6d4',
    capabilities: ['story_bible', 'context', 'output_schema', 'debug'],
    inputs: [{ id: 'query_in', name: '查询', type: 'TEXT', required: true }],
    outputs: [{ id: 'results_out', name: '查询结果', type: 'STORY_BIBLE' }, { id: 'context_out', name: '上下文', type: 'CONTEXT' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '剧情圣经查询' },
        { key: 'bibleScope', label: '查询范围', type: 'tags', section: 'basic', placeholder: '世界观/人物/势力...' },
        { key: 'maxItems', label: '最大条目数', type: 'number', section: 'basic', min: 1, max: 20, defaultValue: 5 }
      ]}
    ],
    defaultConfig: { label: '剧情圣经查询', maxItems: 5 }
  },
  {
    classType: 'narrative_query',
    version: '1.0',
    category: 'knowledge',
    displayName: '叙事状态查询',
    description: '查询当前叙事状态（剧情进度、人物状态等）',
    icon: 'git-commit',
    color: '#0891b2',
    capabilities: ['narrative_state', 'context', 'output_schema', 'debug'],
    inputs: [{ id: 'query_in', name: '查询', type: 'TEXT', required: true }],
    outputs: [{ id: 'results_out', name: '状态结果', type: 'NARRATIVE_STATE' }, { id: 'context_out', name: '上下文', type: 'CONTEXT' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '叙事状态查询' },
        { key: 'narrativeAspects', label: '查询维度', type: 'tags', section: 'basic', placeholder: '剧情/人物/伏笔...' },
        { key: 'maxItems', label: '最大条目数', type: 'number', section: 'basic', min: 1, max: 20, defaultValue: 5 }
      ]}
    ],
    defaultConfig: { label: '叙事状态查询', maxItems: 5 }
  },
  {
    classType: 'soul_query',
    version: '1.0',
    category: 'knowledge',
    displayName: 'Soul 属性查询',
    description: '查询 Soul 档案中的创作方法和批评视角',
    icon: 'heart',
    color: '#8b5cf6',
    capabilities: ['soul', 'context', 'debug'],
    inputs: [{ id: 'query_in', name: '查询', type: 'TEXT', required: true }],
    outputs: [{ id: 'results_out', name: 'Soul 属性', type: 'SOUL_PROFILE' }, { id: 'context_out', name: '上下文', type: 'CONTEXT' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: 'Soul 查询' }
      ]}
    ],
    defaultConfig: { label: 'Soul 查询' }
  },
  {
    classType: 'workspace_read',
    version: '1.0',
    category: 'tools',
    displayName: '工作区读取',
    description: '读取工作区文件内容',
    icon: 'file-code',
    color: '#84cc16',
    capabilities: ['filesystem', 'permissions'],
    inputs: [{ id: 'path_in', name: '文件路径', type: 'TEXT', required: true }],
    outputs: [{ id: 'content_out', name: '文件内容', type: 'TEXT' }, { id: 'doc_out', name: '文档', type: 'DOCUMENT' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '工作区读取' },
        { key: 'filePath', label: '默认路径', type: 'text', section: 'basic' }
      ]}
    ],
    permissions: { filesystem: 'read_workspace' },
    defaultConfig: { label: '工作区读取' }
  },
  {
    classType: 'workspace_write',
    version: '1.0',
    category: 'tools',
    displayName: '工作区写入',
    description: '写入文件到工作区（需审批）',
    icon: 'file-symlink-file',
    color: '#65a30d',
    capabilities: ['filesystem', 'human_review', 'permissions', 'writeback'],
    inputs: [
      { id: 'path_in', name: '文件路径', type: 'TEXT', required: true },
      { id: 'content_in', name: '内容', type: 'TEXT', required: true }
    ],
    outputs: [{ id: 'result_out', name: '写入结果', type: 'FILE_REF' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '工作区写入' },
        { key: 'filePath', label: '默认路径', type: 'text', section: 'basic' },
        { key: 'requireApproval', label: '需要审批', type: 'boolean', section: 'basic', defaultValue: true }
      ]}
    ],
    permissions: { filesystem: 'write_workspace', requireApprovalFor: ['filesystem_write'] },
    defaultConfig: { label: '工作区写入', requireApproval: true }
  },
  {
    classType: 'web_search',
    version: '1.0',
    category: 'tools',
    displayName: '网络搜索',
    description: '搜索互联网获取参考资料',
    icon: 'globe',
    color: '#f97316',
    capabilities: ['network', 'tools', 'permissions'],
    inputs: [{ id: 'query_in', name: '搜索词', type: 'TEXT', required: true }],
    outputs: [{ id: 'results_out', name: '搜索结果', type: 'SEARCH_RESULT' }, { id: 'text_out', name: '文本摘要', type: 'TEXT' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '网络搜索' },
        { key: 'maxResults', label: '最大结果数', type: 'number', section: 'basic', min: 1, max: 10, defaultValue: 5 }
      ]}
    ],
    permissions: { network: 'http_get' },
    defaultConfig: { label: '网络搜索', maxResults: 5 }
  },
  {
    classType: 'merge',
    version: '1.0',
    category: 'aggregate',
    displayName: '合并',
    description: '通用合并节点，合并多个输入',
    icon: 'merge',
    color: '#6366f1',
    capabilities: ['flow_control'],
    inputs: [{ id: 'in', name: '输入', type: 'ANY', multiple: true, required: true }],
    outputs: [{ id: 'out', name: '合并输出', type: 'ANY' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '合并' },
        { key: 'mergeStrategy', label: '合并策略', type: 'select', section: 'basic', options: [
          { value: 'first', label: '取第一个' },
          { value: 'concat', label: '拼接' },
          { value: 'json_array', label: 'JSON 数组' }
        ], defaultValue: 'concat' }
      ]}
    ],
    defaultConfig: { label: '合并', mergeStrategy: 'concat' }
  },
  {
    classType: 'switch_node',
    version: '1.0',
    category: 'control',
    displayName: 'Switch 多路分支',
    description: '根据表达式值选择多个分支之一',
    icon: 'symbol-case',
    color: '#eab308',
    capabilities: ['flow_control'],
    inputs: [{ id: 'in', name: '输入', type: 'ANY', required: true }],
    outputs: [
      { id: 'case_1', name: '分支1', type: 'ANY' },
      { id: 'case_2', name: '分支2', type: 'ANY' },
      { id: 'case_default', name: '默认', type: 'ANY' }
    ],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: 'Switch' },
        { key: 'condition', label: '判断表达式', type: 'text', section: 'basic', placeholder: 'e.g., result.type' }
      ]}
    ],
    defaultConfig: { label: 'Switch' }
  },
  {
    classType: 'wait',
    version: '1.0',
    category: 'control',
    displayName: '等待',
    description: '等待指定时间后继续',
    icon: 'clock',
    color: '#94a3b8',
    capabilities: ['timeout', 'flow_control'],
    inputs: [{ id: 'in', name: '输入', type: 'ANY' }],
    outputs: [{ id: 'out', name: '输出', type: 'ANY' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '等待' },
        { key: 'waitSeconds', label: '等待秒数', type: 'number', section: 'basic', min: 1, defaultValue: 5 }
      ]}
    ],
    defaultConfig: { label: '等待', waitSeconds: 5 }
  },
  {
    classType: 'retry',
    version: '1.0',
    category: 'control',
    displayName: '重试',
    description: '失败时自动重试上游节点',
    icon: 'refresh',
    color: '#fb923c',
    capabilities: ['retry', 'flow_control'],
    inputs: [{ id: 'in', name: '输入', type: 'ANY', required: true }],
    outputs: [{ id: 'out', name: '输出', type: 'ANY' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '重试' },
        { key: 'retryConfig.maxRetries', label: '最大重试次数', type: 'number', section: 'basic', min: 1, max: 5, defaultValue: 3 },
        { key: 'retryConfig.delaySeconds', label: '重试延迟(秒)', type: 'number', section: 'basic', min: 1, defaultValue: 2 }
      ]}
    ],
    defaultConfig: { label: '重试', retryConfig: { maxRetries: 3, delaySeconds: 2, backoffMultiplier: 2 } }
  },
  {
    classType: 'loop_back',
    version: '1.0',
    category: 'control',
    displayName: '循环回边',
    description: '标记循环返回路径',
    icon: 'arrow-swap',
    color: '#ea580c',
    capabilities: ['flow_control'],
    inputs: [{ id: 'in', name: '输入', type: 'ANY' }],
    outputs: [{ id: 'out', name: '回到循环头', type: 'ANY' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '循环回边' }
      ]}
    ],
    defaultConfig: { label: '循环回边' }
  },
  {
    classType: 'checkpoint',
    version: '1.0',
    category: 'control',
    displayName: '检查点',
    description: '保存流程执行状态，支持从此处恢复',
    icon: 'pin',
    color: '#64748b',
    capabilities: ['debug', 'filesystem'],
    inputs: [{ id: 'in', name: '输入', type: 'ANY' }],
    outputs: [{ id: 'out', name: '输出', type: 'ANY' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '检查点' }
      ]}
    ],
    defaultConfig: { label: '检查点' }
  },
  {
    classType: 'subflow',
    version: '1.0',
    category: 'control',
    displayName: '子流程',
    description: '嵌套调用另一个工作流',
    icon: 'references',
    color: '#7c3aed',
    capabilities: ['flow_control', 'debug'],
    inputs: [{ id: 'in', name: '输入', type: 'ANY', multiple: true }],
    outputs: [{ id: 'out', name: '输出', type: 'ANY' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '子流程' },
        { key: 'subflowId', label: '子流程ID', type: 'text', section: 'basic' }
      ]}
    ],
    defaultConfig: { label: '子流程' }
  },
  {
    classType: 'boolean_judge',
    version: '1.0',
    category: 'judge',
    displayName: '布尔判断',
    description: '根据布尔表达式判断真假',
    icon: 'check',
    color: '#84cc16',
    capabilities: ['flow_control'],
    inputs: [{ id: 'in', name: '输入', type: 'ANY', required: true }],
    outputs: [
      { id: 'true_out', name: '真', type: 'BOOLEAN' },
      { id: 'false_out', name: '假', type: 'BOOLEAN' }
    ],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '布尔判断' },
        { key: 'condition', label: '判断表达式', type: 'textarea', section: 'basic', placeholder: 'e.g., score >= 60' }
      ]}
    ],
    defaultConfig: { label: '布尔判断' }
  },
  {
    classType: 'score_judge',
    version: '1.0',
    category: 'judge',
    displayName: '评分判断',
    description: '根据分数阈值判断是否通过',
    icon: 'star-full',
    color: '#eab308',
    capabilities: ['flow_control'],
    inputs: [{ id: 'score_in', name: '分数', type: 'NUMBER', required: true }],
    outputs: [
      { id: 'pass_out', name: '通过', type: 'BOOLEAN' },
      { id: 'fail_out', name: '未通过', type: 'BOOLEAN' }
    ],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '评分判断' },
        { key: 'threshold', label: '通过分数线', type: 'number', section: 'basic', min: 0, max: 100, defaultValue: 60 }
      ]}
    ],
    defaultConfig: { label: '评分判断', threshold: 60 }
  },
  {
    classType: 'llm_judge',
    version: '1.0',
    category: 'judge',
    displayName: 'LLM 判断',
    description: '使用大模型进行语义判断',
    icon: 'copilot',
    color: '#a3e635',
    capabilities: ['prompt', 'model', 'context', 'output_schema', 'budget', 'debug'],
    inputs: [
      { id: 'artifact_in', name: '待判断内容', type: 'ANY', required: true },
      { id: 'criteria_in', name: '评判标准', type: 'TEXT' }
    ],
    outputs: [
      { id: 'pass_out', name: '通过', type: 'BOOLEAN' },
      { id: 'fail_out', name: '未通过', type: 'BOOLEAN' },
      { id: 'reason_out', name: '判断理由', type: 'TEXT' }
    ],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: 'LLM 判断' },
        { key: 'passingScore', label: '通过分数线', type: 'number', section: 'basic', min: 0, max: 100, defaultValue: 60 }
      ]}
    ],
    defaultConfig: { label: 'LLM 判断', passingScore: 60 }
  },
  {
    classType: 'human_edit',
    version: '1.0',
    category: 'human',
    displayName: '人工编辑',
    description: '暂停流程等待人工编辑修改内容',
    icon: 'edit',
    color: '#059669',
    capabilities: ['human_review', 'timeout', 'flow_control'],
    inputs: [{ id: 'in', name: '待编辑内容', type: 'ANY', required: true }],
    outputs: [
      { id: 'edited_out', name: '编辑后', type: 'ANY' },
      { id: 'skip_out', name: '跳过', type: 'ANY' }
    ],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '人工编辑' },
        { key: 'reviewPrompt', label: '编辑提示', type: 'textarea', section: 'basic', placeholder: '提示用户需要编辑什么...' }
      ]}
    ],
    defaultConfig: { label: '人工编辑' }
  },
  {
    classType: 'artifact',
    version: '1.0',
    category: 'version',
    displayName: '作品节点',
    description: '代表一个作品/文档工件',
    icon: 'file-media',
    color: '#64748b',
    capabilities: ['artifact'],
    inputs: [{ id: 'content_in', name: '内容', type: 'TEXT' }],
    outputs: [{ id: 'artifact_out', name: '作品', type: 'ARTIFACT' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '作品' },
        { key: 'artifactType', label: '作品类型', type: 'select', section: 'basic', options: [
          { value: 'chapter', label: '章节' },
          { value: 'outline', label: '大纲' },
          { value: 'character', label: '人设' },
          { value: 'worldview', label: '世界观' }
        ], defaultValue: 'chapter' }
      ]}
    ],
    defaultConfig: { label: '作品', artifactType: 'chapter' }
  },
  {
    classType: 'archive_version',
    version: '1.0',
    category: 'version',
    displayName: '归档版本',
    description: '将作品归档为版本',
    icon: 'archive',
    color: '#475569',
    capabilities: ['archive', 'filesystem', 'human_review', 'permissions', 'artifact', 'writeback'],
    inputs: [{ id: 'artifact_in', name: '作品', type: 'ARTIFACT', required: true }],
    outputs: [{ id: 'version_out', name: '归档版本', type: 'ARTIFACT_VERSION' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '归档版本' },
        { key: 'versionTag', label: '版本标签', type: 'text', section: 'basic', placeholder: 'v1.0/初稿/润色后' },
        { key: 'requireApproval', label: '归档前确认', type: 'boolean', section: 'basic', defaultValue: false }
      ]}
    ],
    defaultConfig: { label: '归档版本' }
  },
  {
    classType: 'text_output',
    version: '1.0',
    category: 'output',
    displayName: '文本输出',
    description: '输出文本结果',
    icon: 'output',
    color: '#d946ef',
    capabilities: ['output_schema'],
    inputs: [{ id: 'in', name: '输入', type: 'TEXT', required: true, multiple: true }],
    outputs: [],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '文本输出' },
        { key: 'outputFormat', label: '输出格式', type: 'select', section: 'basic', options: [
          { value: 'text', label: '纯文本' },
          { value: 'markdown', label: 'Markdown' }
        ], defaultValue: 'markdown' }
      ]}
    ],
    defaultConfig: { label: '文本输出', outputFormat: 'markdown' }
  },
  {
    classType: 'file_output',
    version: '1.0',
    category: 'output',
    displayName: '文件输出',
    description: '将结果保存为文件',
    icon: 'file-symlink-file',
    color: '#c026d3',
    capabilities: ['filesystem', 'output_schema', 'permissions', 'writeback'],
    inputs: [{ id: 'in', name: '内容', type: 'ANY', required: true }],
    outputs: [{ id: 'file_out', name: '文件引用', type: 'FILE_REF' }],
    inspectorSchema: [
      { id: 'basic', label: '基础', icon: 'tag', fields: [
        { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '文件输出' },
        { key: 'filePath', label: '输出路径', type: 'text', section: 'basic' },
        { key: 'requireApproval', label: '保存前确认', type: 'boolean', section: 'basic', defaultValue: true }
      ]}
    ],
    permissions: { filesystem: 'write_workspace', requireApprovalFor: ['filesystem_write'] },
    defaultConfig: { label: '文件输出', requireApproval: true }
  },
  {
    classType: 'input',
    version: '1.0',
    category: 'input',
    displayName: '输入材料',
    description: '[兼容旧版] 需求、章节、设定、人设',
    icon: 'arrow-down',
    color: '#0ea5e9',
    capabilities: [],
    inputs: [],
    outputs: [{ id: 'out', name: '输出', type: 'TEXT' }],
    inspectorSchema: [
      {
        id: 'basic', label: '基础', icon: 'tag',
        fields: [
          { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '输入材料' },
          { key: 'inputText', label: '输入内容', type: 'textarea', section: 'basic' }
        ]
      }
    ],
    defaultConfig: { label: '输入材料' },
    isDeprecated: true
  },
  {
    classType: 'parallel',
    version: '1.0',
    category: 'control',
    displayName: '并行分支',
    description: '[兼容旧版] 多个智能体同步处理',
    icon: 'git-merge',
    color: '#06b6d4',
    capabilities: [],
    inputs: [{ id: 'in', name: '输入', type: 'ANY' }],
    outputs: [{ id: 'out', name: '输出', type: 'ANY', multiple: true }],
    inspectorSchema: [{ id: 'basic', label: '基础', icon: 'tag', fields: [{ key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '并行分支' }] }],
    defaultConfig: { label: '并行分支' },
    isDeprecated: true
  },
  {
    classType: 'loop',
    version: '1.0',
    category: 'control',
    displayName: '循环修订',
    description: '[兼容旧版] 最多3-5轮修订',
    icon: 'sync',
    color: '#f97316',
    capabilities: [],
    inputs: [{ id: 'in', name: '输入', type: 'ANY' }],
    outputs: [{ id: 'out', name: '输出', type: 'ANY' }],
    inspectorSchema: [
      {
        id: 'basic', label: '基础', icon: 'tag',
        fields: [
          { key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '循环修订' },
          { key: 'rounds', label: '循环轮数', type: 'number', section: 'basic', min: 1, max: 5, defaultValue: 3 }
        ]
      }
    ],
    defaultConfig: { label: '循环修订', rounds: 3 },
    isDeprecated: true
  },
  {
    classType: 'human_review',
    version: '1.0',
    category: 'human',
    displayName: '人工确认',
    description: '[兼容旧版] 作者改完再继续',
    icon: 'account',
    color: '#10b981',
    capabilities: ['human_review'],
    inputs: [{ id: 'in', name: '输入', type: 'ANY' }],
    outputs: [{ id: 'out', name: '输出', type: 'ANY' }],
    inspectorSchema: [{ id: 'basic', label: '基础', icon: 'tag', fields: [{ key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '作者确认' }, { key: 'requiresReview', label: '需要审查', type: 'boolean', section: 'basic', defaultValue: true }] }],
    defaultConfig: { label: '作者确认', requiresReview: true },
    isDeprecated: true
  },
  {
    classType: 'archive',
    version: '1.0',
    category: 'version',
    displayName: '归档版本',
    description: '[兼容旧版] 保存到项目文档库',
    icon: 'archive',
    color: '#64748b',
    capabilities: ['archive'],
    inputs: [{ id: 'in', name: '输入', type: 'ANY' }],
    outputs: [{ id: 'out', name: '输出', type: 'ANY' }],
    inspectorSchema: [{ id: 'basic', label: '基础', icon: 'tag', fields: [{ key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '归档版本' }] }],
    defaultConfig: { label: '归档版本' },
    isDeprecated: true
  },
  {
    classType: 'output',
    version: '1.0',
    category: 'output',
    displayName: '最终输出',
    description: '[兼容旧版] 调度器统一汇总',
    icon: 'arrow-up',
    color: '#d946ef',
    capabilities: [],
    inputs: [{ id: 'in', name: '输入', type: 'ANY', multiple: true }],
    outputs: [],
    inspectorSchema: [{ id: 'basic', label: '基础', icon: 'tag', fields: [{ key: 'label', label: '名称', type: 'text', section: 'basic', defaultValue: '最终输出' }] }],
    defaultConfig: { label: '最终输出', isFinalOutput: true },
    isDeprecated: true
  }
]

export const NODE_DEF_MAP = new Map(NODE_DEFINITIONS.map(n => [n.classType, n]))

export function getNodeDefinition(type: WorkflowNodeType | string): KarnaNodeDefinition | undefined {
  return NODE_DEF_MAP.get(type as WorkflowNodeType)
}

export const NODE_COLOR_MAP: Record<string, string> = {
  input_text: '#0ea5e9', input: '#0ea5e9', input_file: '#0284c7', input_variable: '#38bdf8', input_constant: '#7dd3fc',
  agent: '#8b5cf6', critic: '#ec4899', scheduler: '#a855f7', tool_agent: '#f59e0b',
  prompt_template: '#ec4899', prompt_merge: '#f472b6',
  context_merge: '#14b8a6', context_trim: '#2dd4bf',
  rag_search: '#06b6d4', wiki_query: '#22d3ee', bible_query: '#06b6d4', narrative_query: '#0891b2', soul_query: '#8b5cf6',
  mcp_tool: '#f59e0b', workspace_read: '#84cc16', workspace_write: '#65a30d', web_search: '#f97316',
  fanout: '#06b6d4', merge: '#6366f1', barrier: '#f97316', condition: '#f59e0b', switch_node: '#eab308',
  wait: '#94a3b8', retry: '#fb923c', loop_controller: '#f97316', loop_back: '#ea580c', loop: '#f97316',
  checkpoint: '#64748b', subflow: '#7c3aed',
  boolean_judge: '#84cc16', score_judge: '#eab308', llm_judge: '#a3e635', consensus: '#eab308',
  text_merge: '#6366f1', critique_aggregate: '#8b5cf6',
  human_confirm: '#10b981', human_edit: '#059669', human_review: '#10b981',
  artifact: '#64748b', save_snapshot: '#64748b', archive_version: '#475569', archive: '#64748b',
  text_output: '#d946ef', file_output: '#c026d3', final_output: '#d946ef', output: '#d946ef',
  parallel: '#06b6d4'
}

export const STATUS_LABEL: Record<string, string> = {
  idle: '未运行', queued: '排队中', running: '运行中', success: '已完成',
  done: '已完成', failed: '失败', skipped: '已跳过', waiting_human: '待确认',
  paused: '待确认', blocked: '已阻塞', accepted: '已接受', rejected: '已驳回',
  cached: '缓存命中'
}

export const NODE_TYPE_LABEL: Record<string, string> = {}
for (const def of NODE_DEFINITIONS) {
  NODE_TYPE_LABEL[def.classType] = def.displayName
}

export function clampWorkflowLimits(limits: Partial<WorkflowLimits> = {}): WorkflowLimits {
  return {
    max_agents: Math.min(50, Math.max(1, Number(limits.max_agents || DEFAULT_LIMITS.max_agents))),
    max_parallel: Math.min(10, Math.max(1, Number(limits.max_parallel || DEFAULT_LIMITS.max_parallel))),
    max_loop: Math.min(20, Math.max(1, Number(limits.max_loop || DEFAULT_LIMITS.max_loop)))
  }
}

const LEGACY_NODE_TYPE_MAP: Record<string, WorkflowNodeType> = {
  'input': 'input_text',
  'output': 'final_output',
  'human_review': 'human_confirm',
  'loop': 'loop_controller',
  'archive': 'save_snapshot',
  'text_output': 'final_output',
  'file_output': 'final_output',
  'parallel': 'fanout',
  'merge': 'text_merge'
}

const LEGACY_EDGE_TYPE_MAP: Record<string, 'normal' | 'condition' | 'loop' | 'human_approval'> = {
  'default': 'normal',
  'straight': 'normal',
  'step': 'normal',
  'smoothstep': 'normal',
  'bezier': 'normal',
  'approval': 'human_approval'
}

function getNodeInputHandles(nodeType: WorkflowNodeType | string): Set<string> {
  const def = getNodeDefinition(nodeType as WorkflowNodeType)
  const handles = new Set<string>(['in'])
  if (def?.inputs) {
    for (const port of def.inputs) {
      handles.add(port.id)
    }
  }
  if (nodeType === 'agent') {
    handles.add('context_in')
  }
  return handles
}

function getNodeOutputHandles(nodeType: WorkflowNodeType | string): Set<string> {
  const def = getNodeDefinition(nodeType as WorkflowNodeType)
  const handles = new Set<string>(['out', 'text_out'])
  if (def?.outputs) {
    for (const port of def.outputs) {
      handles.add(port.id)
    }
  }
  return handles
}

function migrateNodeType(type: string | undefined): WorkflowNodeType {
  if (!type) return 'agent' as WorkflowNodeType
  if (LEGACY_NODE_TYPE_MAP[type]) return LEGACY_NODE_TYPE_MAP[type]
  if (getNodeDefinition(type as WorkflowNodeType)) return type as WorkflowNodeType
  return 'agent' as WorkflowNodeType
}

function migrateEdgeType(type: string | undefined): 'normal' | 'condition' | 'loop' | 'human_approval' {
  if (!type) return 'normal'
  if (type === 'normal' || type === 'condition' || type === 'loop' || type === 'human_approval') return type
  if (LEGACY_EDGE_TYPE_MAP[type]) return LEGACY_EDGE_TYPE_MAP[type]
  return 'normal'
}

export function migrateWorkflow(workflow: any): WriterWorkflow {
  if (!workflow || typeof workflow !== 'object') {
    return {
      name: '未命名工作流',
      mode: 'canvas',
      nodes: [],
      edges: [],
      limits: DEFAULT_LIMITS,
      runtimeConfig: DEFAULT_RUNTIME_CONFIG,
      knowledge_binding: { enabled: false },
      schema_version: 2
    }
  }

  const nodes: WorkflowNodeRecord[] = Array.isArray(workflow.nodes)
    ? workflow.nodes.map((n: any, i: number) => {
        const nodeType = migrateNodeType(n?.type || n?.data?.nodeType)
        return {
          id: String(n?.id || `node_${Date.now()}_${i}`),
          type: nodeType,
          position: {
            x: Number(n?.position?.x ?? 80 + i * 220),
            y: Number(n?.position?.y ?? 110)
          },
          size: n?.size,
          data: {
            ...n?.data,
            label: n?.data?.label || n?.label || getNodeDefinition(nodeType)?.displayName || nodeType,
            nodeType,
            agent_id: n?.data?.agent_id || n?.agent_id,
            agent_name: n?.data?.agent_name || n?.agent_name,
            content: n?.data?.content || n?.content,
            prompt: n?.data?.prompt || n?.prompt,
            condition: n?.data?.condition || n?.condition,
            rounds: n?.data?.rounds ?? n?.rounds,
            locked: n?.data?.locked,
            isStart: n?.data?.isStart,
            requiresReview: nodeType === 'human_confirm' ? (n?.data?.requiresReview ?? true) : n?.data?.requiresReview
          }
        }
      })
    : []

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const edges: WorkflowEdgeRecord[] = Array.isArray(workflow.edges)
    ? workflow.edges.map((e: any, i: number) => {
        const sourceId = String(e?.source || '')
        const targetId = String(e?.target || '')
        if (!sourceId || !targetId || !nodeMap.has(sourceId) || !nodeMap.has(targetId)) {
          return null
        }
        const sourceNode = nodeMap.get(sourceId)!
        const targetNode = nodeMap.get(targetId)!
        const validSourceHandles = getNodeOutputHandles(sourceNode.type)
        const validTargetHandles = getNodeInputHandles(targetNode.type)
        
        let sourceHandle = e?.sourceHandle || 'out'
        let targetHandle = e?.targetHandle || 'in'
        let edgeType = migrateEdgeType(e?.type)
        
        if (!validSourceHandles.has(sourceHandle)) {
          if (validSourceHandles.has('out')) sourceHandle = 'out'
          else sourceHandle = Array.from(validSourceHandles)[0] || 'out'
        }
        if (!validTargetHandles.has(targetHandle)) {
          if (validTargetHandles.has('in')) targetHandle = 'in'
          else targetHandle = Array.from(validTargetHandles)[0] || 'in'
        }

        let edgeCondition = e?.condition
        if (edgeType === 'loop' && !edgeCondition?.maxRounds) {
          edgeCondition = {
            maxRounds: Number(workflow?.limits?.max_loop || 3),
            onLimitReached: edgeCondition?.onLimitReached || 'continue',
            ...(edgeCondition || {})
          }
        }

        return {
          id: String(e?.id || `edge_${Date.now()}_${i}`),
          source: sourceId,
          target: targetId,
          sourceHandle,
          targetHandle,
          label: e?.label,
          type: edgeType,
          condition: edgeCondition,
          animated: e?.animated !== undefined ? e.animated : (edgeType === 'loop'),
          style: e?.style
        }
      }).filter(Boolean) as WorkflowEdgeRecord[]
    : []

  return {
    id: workflow.id,
    project_id: workflow.project_id,
    workspaceId: workflow.workspaceId,
    name: String(workflow.name || '未命名工作流'),
    description: workflow.description,
    mode: workflow.mode === 'simple' ? 'simple' : 'canvas',
    nodes,
    edges,
    limits: clampWorkflowLimits(workflow.limits || {}),
    runtimeConfig: { ...DEFAULT_RUNTIME_CONFIG, ...workflow.runtimeConfig },
    knowledge_binding: {
      enabled: Boolean(workflow.knowledge_binding?.enabled ?? false),
      ids: Array.isArray(workflow.knowledge_binding?.ids) ? workflow.knowledge_binding.ids : undefined
    },
    schema_version: 2,
    created_at: workflow.created_at,
    updated_at: workflow.updated_at || new Date().toISOString(),
    version: workflow.version || 1,
    tags: workflow.tags
  }
}

export function defaultPermissions(role = ''): WorkflowAgentPermissions {
  const text = role.toLowerCase()
  const edit = /正文|写作|续写|润色|writer|polish/.test(text)
  return {
    canEditDraft: edit,
    canComment: !/正文写作|chapter writer/.test(text),
    canUseKnowledge: !/合规|润色/.test(text),
    canReadUpstream: true
  }
}

export function normalizeWorkflowAgent(input: Partial<WorkflowAgent>, index = 0): WorkflowAgent {
  const role = String(input.role || input.name || `创作 Agent ${index + 1}`)
  return {
    id: String(input.id || `local_agent_${Date.now()}_${index}`),
    name: String(input.name || role),
    role,
    color: String(input.color || '#7c3aed'),
    tagline: String(input.tagline || ''),
    duties: String(input.duties || ''),
    forbidden: String(input.forbidden || ''),
    output_format: String(input.output_format || '分段说明'),
    model: String(input.model || ''),
    temperature: Math.min(2, Math.max(0, Number(input.temperature ?? 0.6))),
    top_p: Math.min(1, Math.max(0, Number(input.top_p ?? 0.9))),
    constraints: Array.isArray(input.constraints) ? input.constraints.map(String).filter(Boolean) : [],
    permissions: input.permissions || defaultPermissions(role),
    enabled: input.enabled !== false,
    isBuiltin: input.isBuiltin,
    avatar: input.avatar
  }
}

export function validateWorkflow(workflow: any): WorkflowValidationResult {
  const errors: WorkflowValidationError[] = []
  const warnings: WorkflowValidationError[] = []

  if (!workflow || typeof workflow !== 'object') {
    return {
      valid: false,
      errors: [{ code: 'INVALID_WORKFLOW', message: 'Invalid workflow', userMessage: '工作流数据无效', severity: 'error' }],
      warnings: []
    }
  }

  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes.filter((n: any) => n && n.id) : []
  const edges = Array.isArray(workflow.edges) ? workflow.edges.filter((e: any) => e && e.source && e.target) : []
  const limits = clampWorkflowLimits(workflow.limits || {})
  const nodeMap = new Map<string, any>(nodes.map((node: any) => [String(node.id), node]))
  const ids: Set<string> = new Set(nodes.map((node: any) => String(node.id)))
  const agentCount = nodes.filter((node: any) => node.type === 'agent' || node.data?.nodeType === 'agent').length

  if (agentCount > limits.max_agents) {
    errors.push({
      code: 'TOO_MANY_AGENTS',
      message: `Too many agents: ${agentCount} > ${limits.max_agents}`,
      userMessage: `单条工作流最多 ${limits.max_agents} 个 Agent（当前 ${agentCount} 个）`,
      severity: 'error'
    })
  }

  const startNodes = nodes.filter((n: any) => n.data?.isStart || n.type === 'input_text' || n.data?.nodeType === 'input_text')
  const outputNodes = nodes.filter((n: any) => n.type === 'final_output' || n.data?.nodeType === 'final_output' || n.data?.isFinalOutput)

  if (nodes.length > 0 && startNodes.length === 0) {
    warnings.push({
      code: 'NO_START_NODE',
      message: 'No start node marked',
      userMessage: '建议设置一个入口节点（右键节点→设为起始节点）',
      severity: 'warning'
    })
  }

  if (nodes.length > 0 && outputNodes.length === 0) {
    warnings.push({
      code: 'NO_OUTPUT_NODE',
      message: 'No final output node',
      userMessage: '建议添加最终输出节点',
      severity: 'warning'
    })
  }

  for (const edge of edges) {
    const source = String(edge.source)
    const target = String(edge.target)
    if (!ids.has(source) || !ids.has(target)) {
      errors.push({
        code: 'INVALID_EDGE',
        message: `Edge references non-existent node: ${source} -> ${target}`,
        userMessage: '连线包含不存在的节点',
        relatedEdgeId: edge.id,
        severity: 'error',
        fixSuggestions: [{ label: '删除无效连线', action: 'delete_edge' }]
      })
      continue
    }
    if (source === target) {
      errors.push({
        code: 'SELF_LOOP',
        message: 'Node connects to itself',
        userMessage: '节点不能连接到自己',
        relatedNodeId: source,
        severity: 'error'
      })
      continue
    }

    const sourceNode = nodeMap.get(source)!
    const targetNode = nodeMap.get(target)!
    const sourceType = sourceNode.type || sourceNode.data?.nodeType
    const targetType = targetNode.type || targetNode.data?.nodeType
    const validSourceHandles = getNodeOutputHandles(sourceType)
    const validTargetHandles = getNodeInputHandles(targetType)

    const sourceHandle = edge.sourceHandle || 'out'
    const targetHandle = edge.targetHandle || 'in'

    if (!validSourceHandles.has(sourceHandle)) {
      errors.push({
        code: 'INVALID_SOURCE_HANDLE',
        message: `Invalid source handle ${sourceHandle} on node ${source} (type ${sourceType})`,
        userMessage: `连线起点「${sourceNode.data?.label || source}」的端口「${sourceHandle}」不存在，已自动修正为默认端口`,
        relatedEdgeId: edge.id,
        relatedNodeId: source,
        severity: 'error',
        fixSuggestions: [{ label: '自动修复端口', action: 'migrate_workflow' }]
      })
    }

    if (!validTargetHandles.has(targetHandle)) {
      errors.push({
        code: 'INVALID_TARGET_HANDLE',
        message: `Invalid target handle ${targetHandle} on node ${target} (type ${targetType})`,
        userMessage: `连线终点「${targetNode.data?.label || target}」的端口「${targetHandle}」不存在，已自动修正为默认端口`,
        relatedEdgeId: edge.id,
        relatedNodeId: target,
        severity: 'error',
        fixSuggestions: [{ label: '自动修复端口', action: 'migrate_workflow' }]
      })
    }

    if (sourceType === 'condition') {
      if (sourceHandle !== 'true_out' && sourceHandle !== 'false_out') {
        errors.push({
          code: 'INVALID_CONDITION_BRANCH',
          message: `Condition node must use true_out/false_out handles`,
          userMessage: '条件判断节点的输出端口必须是「条件成立」或「条件不成立」',
          relatedEdgeId: edge.id,
          relatedNodeId: source,
          severity: 'error'
        })
      }
    }

    if (sourceType === 'human_confirm') {
      if (sourceHandle !== 'approve_out' && sourceHandle !== 'reject_out' && sourceHandle !== 'edit_out') {
        errors.push({
          code: 'INVALID_HUMAN_CONFIRM_BRANCH',
          message: `Human confirm node must use approve_out/reject_out/edit_out handles`,
          userMessage: '人工确认节点的输出端口必须是「通过」「驳回」或「修改后」',
          relatedEdgeId: edge.id,
          relatedNodeId: source,
          severity: 'error'
        })
      }
    }

    if (sourceType === 'loop_controller') {
      if (sourceHandle !== 'out' && sourceHandle !== 'exit_out') {
        errors.push({
          code: 'INVALID_LOOP_BRANCH',
          message: `Loop controller must use out/exit_out handles`,
          userMessage: '循环控制器的输出端口必须是「循环体」或「退出循环」',
          relatedEdgeId: edge.id,
          relatedNodeId: source,
          severity: 'error'
        })
      }
    }
  }

  for (const node of nodes) {
    const nodeType = node.type || node.data?.nodeType
    if (nodeType === 'agent' && !node.data?.agent_id) {
      const hasInputEdges = edges.some((e: any) => e.target === node.id)
      if (!hasInputEdges && !node.data?.isStart) {
        warnings.push({
          code: 'AGENT_NOT_CONNECTED',
          message: `Agent node ${node.id} has no input`,
          userMessage: `节点「${node.data?.label || node.id}」没有输入连接`,
          relatedNodeId: node.id,
          severity: 'warning'
        })
      }
    }
  }

  const adjacency = new Map<string, Array<{ target: string; edge: any }>>()
  const loopEdgesList: any[] = []
  for (const node of nodes) adjacency.set(String(node.id), [])
  for (const edge of edges) {
    const source = String(edge.source)
    const target = String(edge.target)
    if (ids.has(source) && ids.has(target)) {
      if (edge.type === 'loop') {
        loopEdgesList.push(edge)
      } else {
        adjacency.get(source)?.push({ target, edge })
      }
    }
  }

  const invalidCycles: Array<{ nodes: string[] }> = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const pathMap = new Map<string, number>()

  const dfs = (id: string, path: string[]) => {
    if (visiting.has(id)) {
      const cycleStart = pathMap.get(id) ?? path.indexOf(id)
      const cycleNodes = path.slice(cycleStart)
      invalidCycles.push({ nodes: cycleNodes })
      return
    }
    if (visited.has(id)) return
    visiting.add(id)
    pathMap.set(id, path.length)
    const newPath = [...path, id]
    for (const { target } of (adjacency.get(id) || [])) {
      dfs(target, newPath)
    }
    visiting.delete(id)
    pathMap.delete(id)
    visited.add(id)
  }

  for (const id of ids) dfs(id, [])

  for (const cycle of invalidCycles) {
    const cycleDesc = cycle.nodes.map(nid => {
      const n = nodes.find((nd: any) => String(nd.id) === nid)
      return n?.data?.label || nid
    }).join(' → ')
    errors.push({
      code: 'INVALID_CYCLE',
      message: `Invalid cycle: ${cycleDesc}`,
      userMessage: `该工作流包含非法闭环：${cycleDesc}。请使用loop类型的连线创建受控循环并设置轮数上限。`,
      severity: 'error',
      relatedNodeId: cycle.nodes[0]
    })
  }

  const maxLoop = Number(limits.max_loop || 3)
  for (const loopEdge of loopEdgesList) {
    const sourceId = String(loopEdge.source)
    const targetId = String(loopEdge.target)
    const source = nodeMap.get(sourceId)
    const target = nodeMap.get(targetId)
    if (!source || !target) {
      errors.push({
        code: 'INVALID_LOOP_EDGE',
        message: `Loop edge references non-existent node`,
        userMessage: '循环连线引用了不存在的节点',
        relatedEdgeId: loopEdge.id,
        severity: 'error'
      })
      continue
    }
    if (sourceId === targetId) {
      errors.push({
        code: 'LOOP_SELF_TARGET',
        message: 'Loop edge cannot target itself',
        userMessage: '循环连线的起点和终点不能是同一个节点',
        relatedNodeId: sourceId,
        relatedEdgeId: loopEdge.id,
        severity: 'error'
      })
      continue
    }
    const sourceLabel = source?.data?.label || sourceId
    const targetLabel = target?.data?.label || targetId
    const loopMax = Math.max(1, Math.min(10, maxLoop || 3))
    if (!maxLoop || maxLoop < 1 || maxLoop > 10) {
      warnings.push({
        code: 'LOOP_LIMIT_INVALID',
        message: `Invalid max_loop: ${maxLoop}`,
        userMessage: `循环轮数设置异常(${maxLoop})，已自动设为默认值3轮`,
        severity: 'warning',
        fixSuggestions: [{ label: '调整循环上限', action: 'set_max_loop' }]
      })
    }
    warnings.push({
      code: 'CONTROLLED_LOOP',
      message: `Controlled loop: ${sourceLabel} -> ${targetLabel}, max ${loopMax} rounds`,
      userMessage: `检测到受控循环：${sourceLabel} → ${targetLabel}，最多 ${loopMax} 轮。`,
      severity: 'info' as any,
      relatedEdgeId: loopEdge.id
    })
  }

  return {
    valid: errors.filter(e => e.severity === 'error').length === 0,
    errors,
    warnings
  }
}

export function createWorkflowTemplate(kind: 'empty' | 'simple' | 'chapter' | 'polish' | 'foreshadow' | 'unstuck' | 'critique'): WriterWorkflow {
  const makeNode = (type: WorkflowNodeType, label: string, x: number, y: number, extra?: Partial<WorkflowNodeData>, index?: number): WorkflowNodeRecord => ({
    id: `${type}_${index ?? Date.now()}`,
    type,
    position: { x, y },
    data: { label, nodeType: type, ...extra }
  })

  if (kind === 'empty') {
    return {
      name: '空白工作流',
      mode: 'canvas',
      nodes: [],
      edges: [],
      limits: DEFAULT_LIMITS,
      runtimeConfig: DEFAULT_RUNTIME_CONFIG,
      knowledge_binding: { enabled: false },
      schema_version: 2
    }
  }

  if (kind === 'simple') {
    const nodes: WorkflowNodeRecord[] = [
      makeNode('input_text', '文本输入', 80, 150, { isStart: true, inputText: '' }, 1),
      makeNode('agent', '通用 Agent', 360, 150, { rolePrompt: '你是一个 helpful 的写作助手' }, 2),
      makeNode('final_output', '最终输出', 640, 150, {}, 3)
    ]
    return {
      name: '最简写作示例',
      description: '输入→Agent→输出，最简单的流程',
      mode: 'canvas',
      nodes,
      edges: [
        { id: 'e1', source: nodes[0].id, target: nodes[1].id, sourceHandle: 'out', targetHandle: 'in' },
        { id: 'e2', source: nodes[1].id, target: nodes[2].id, sourceHandle: 'out', targetHandle: 'in' }
      ],
      limits: DEFAULT_LIMITS,
      runtimeConfig: DEFAULT_RUNTIME_CONFIG,
      knowledge_binding: { enabled: true },
      schema_version: 2
    }
  }

  if (kind === 'critique') {
    const nodes: WorkflowNodeRecord[] = [
      makeNode('input_text', '输入作品', 80, 200, { isStart: true }, 1),
      makeNode('agent', '写作 Agent', 340, 200, {}, 2),
      makeNode('fanout', '并行分发', 600, 200, {}, 3),
      makeNode('critic', '商业编辑', 860, 50, {}, 4),
      makeNode('critic', '文学评论家', 860, 200, {}, 5),
      makeNode('critic', '人物逻辑', 860, 350, {}, 6),
      makeNode('barrier', '屏障等待', 1120, 200, {}, 7),
      makeNode('consensus', '共识判断', 1380, 200, {}, 8),
      makeNode('critique_aggregate', '意见聚合', 1380, 400, {}, 9),
      makeNode('agent', '修订 Agent', 1640, 300, {}, 10),
      makeNode('loop_controller', '循环控制', 1900, 300, {}, 11),
      makeNode('save_snapshot', '保存版本', 2160, 200, {}, 12),
      makeNode('final_output', '最终输出', 2420, 200, {}, 13)
    ]
    return {
      name: '多评论家共识修订示例',
      description: 'FanOut→多评论家并行→Barrier→Consensus→修订→Loop→Archive→Output',
      mode: 'canvas',
      nodes,
      edges: [
        { id: 'e1', source: nodes[0].id, target: nodes[1].id, sourceHandle: 'out', targetHandle: 'in' },
        { id: 'e2', source: nodes[1].id, target: nodes[2].id, sourceHandle: 'out', targetHandle: 'in' },
        { id: 'e3', source: nodes[2].id, target: nodes[3].id, sourceHandle: 'out', targetHandle: 'in' },
        { id: 'e4', source: nodes[2].id, target: nodes[4].id, sourceHandle: 'out', targetHandle: 'in' },
        { id: 'e5', source: nodes[2].id, target: nodes[5].id, sourceHandle: 'out', targetHandle: 'in' },
        { id: 'e6', source: nodes[3].id, target: nodes[6].id, sourceHandle: 'critique_out', targetHandle: 'in' },
        { id: 'e7', source: nodes[4].id, target: nodes[6].id, sourceHandle: 'critique_out', targetHandle: 'in' },
        { id: 'e8', source: nodes[5].id, target: nodes[6].id, sourceHandle: 'critique_out', targetHandle: 'in' },
        { id: 'e9', source: nodes[6].id, target: nodes[7].id, sourceHandle: 'out', targetHandle: 'critiques_in' },
        { id: 'e10', source: nodes[7].id, target: nodes[11].id, sourceHandle: 'pass_out', targetHandle: 'in' },
        { id: 'e11', source: nodes[7].id, target: nodes[8].id, sourceHandle: 'fail_out', targetHandle: 'critiques_in' },
        { id: 'e12', source: nodes[8].id, target: nodes[9].id, sourceHandle: 'brief_out', targetHandle: 'in' },
        { id: 'e13', source: nodes[9].id, target: nodes[10].id, sourceHandle: 'out', targetHandle: 'in' },
        { id: 'e14', source: nodes[10].id, target: nodes[2].id, sourceHandle: 'out', targetHandle: 'in', label: '继续循环', type: 'loop' },
        { id: 'e15', source: nodes[10].id, target: nodes[11].id, sourceHandle: 'exit_out', targetHandle: 'content_in' },
        { id: 'e16', source: nodes[11].id, target: nodes[12].id, sourceHandle: 'artifact_out', targetHandle: 'in' }
      ],
      limits: DEFAULT_LIMITS,
      runtimeConfig: DEFAULT_RUNTIME_CONFIG,
      knowledge_binding: { enabled: true },
      schema_version: 2
    }
  }

  const specs: Record<string, Array<{ type: WorkflowNodeType; label: string; agent_id?: string }>> = {
    chapter: [
      { type: 'input', label: '导入需求与章节材料' },
      { type: 'agent', label: '大纲拆解', agent_id: 'outline_architect' },
      { type: 'agent', label: '正文写作', agent_id: 'chapter_writer' },
      { type: 'parallel', label: '并行检查' },
      { type: 'agent', label: '伏笔核查', agent_id: 'foreshadow_manager' },
      { type: 'agent', label: '逻辑审核', agent_id: 'logic_reviewer' },
      { type: 'agent', label: '文笔润色', agent_id: 'style_polisher' },
      { type: 'agent', label: '合规避雷', agent_id: 'compliance_guard' },
      { type: 'human_review', label: '作者确认' },
      { type: 'archive', label: '归档版本' },
      { type: 'output', label: '最终输出' }
    ],
    polish: [
      { type: 'input', label: '导入单章正文' },
      { type: 'agent', label: '文笔润色', agent_id: 'style_polisher' },
      { type: 'agent', label: '剧评挑刺', agent_id: 'critic_editor' },
      { type: 'human_review', label: '作者取舍' },
      { type: 'output', label: '润色结果' }
    ],
    foreshadow: [
      { type: 'input', label: '导入前文与当前章' },
      { type: 'agent', label: '设定核查', agent_id: 'setting_keeper' },
      { type: 'agent', label: '伏笔回收', agent_id: 'foreshadow_manager' },
      { type: 'archive', label: '保存伏笔表' },
      { type: 'output', label: '伏笔方案' }
    ],
    unstuck: [
      { type: 'input', label: '输入卡文点' },
      { type: 'agent', label: '剧情续写方案', agent_id: 'plot_continuation' },
      { type: 'agent', label: '读者视角点评', agent_id: 'critic_editor' },
      { type: 'condition', label: '评分是否达标' },
      { type: 'loop', label: '最多三轮微调' },
      { type: 'human_review', label: '作者决定' },
      { type: 'output', label: '续写方向' }
    ],
    empty: [],
    simple: [],
    critique: []
  }

  const rows = specs[kind] || specs.chapter
  const nodes = rows.map((row, index) =>
    makeNode(row.type, row.label, 80 + index * 220, index % 2 ? 280 : 120, {
      agent_id: row.agent_id,
      rounds: row.type === 'loop' ? 3 : undefined,
      isStart: index === 0
    }, index + 1)
  )
  const edges = nodes.slice(0, -1).map((node, index) => ({
    id: `edge_${node.id}_${nodes[index + 1].id}`,
    source: node.id,
    target: nodes[index + 1].id,
    sourceHandle: 'out',
    targetHandle: 'in'
  }))
  const names: Record<string, string> = { chapter: '章节创作流', polish: '单章润色点评流', foreshadow: '伏笔回收流', unstuck: '卡文救援流', empty: '空白', simple: '最简写作', critique: '共识修订' }

  return {
    name: names[kind] || '章节创作流',
    mode: 'canvas',
    nodes,
    edges,
    limits: DEFAULT_LIMITS,
    runtimeConfig: DEFAULT_RUNTIME_CONFIG,
    knowledge_binding: { enabled: true },
    schema_version: 2
  }
}

export function getBuiltinAgents(): WorkflowAgent[] {
  return [
    normalizeWorkflowAgent({
      id: 'outline_planner', name: '大纲规划师', role: '大纲规划师',
      color: '#8b5cf6', tagline: '规划章节结构与写作大纲',
      duties: '根据输入的创作需求，规划清晰的章节大纲、情节点安排和节奏设计，为后续写作提供明确指引',
      constraints: ['不得直接写正文', '大纲需逻辑清晰、结构完整', '明确标注每个场景的核心事件'],
      isBuiltin: true
    }),
    normalizeWorkflowAgent({
      id: 'chapter_writer', name: '章节撰写师', role: '章节撰写师',
      color: '#6366f1', tagline: '根据大纲创作章节正文',
      duties: '根据大纲和设定创作章节正文，注意节奏、人物塑造和画面感',
      constraints: ['不得偏离大纲', '保持人物一致性', '遵循世界观设定'],
      isBuiltin: true
    }),
    normalizeWorkflowAgent({
      id: 'plot_critic', name: '情节评审师', role: '情节评审师',
      color: '#f97316', tagline: '评审情节架构与节奏',
      duties: '从情节完整性、结构合理性、节奏把控、悬念设置、冲突设计等角度评审文稿，指出情节漏洞、节奏拖沓、逻辑断裂等问题',
      constraints: ['只指出问题和给出改进建议，不直接修改正文', '评分采用百分制', '重点关注三幕结构、起承转合、高潮设计'],
      isBuiltin: true
    }),
    normalizeWorkflowAgent({
      id: 'character_critic', name: '人物评审师', role: '人物评审师',
      color: '#db2777', tagline: '评审人物塑造与行为逻辑',
      duties: '从人物性格一致性、行为动机合理性、人物弧光、对话风格、人物关系等角度评审，指出OOC、动机不足、关系混乱等问题',
      constraints: ['只指出问题和给出改进建议，不直接修改正文', '评分采用百分制', '重点关注人物言行是否符合设定'],
      isBuiltin: true
    }),
    normalizeWorkflowAgent({
      id: 'style_critic', name: '文风评审师', role: '文风评审师',
      color: '#06b6d4', tagline: '评审文笔风格与语言表达',
      duties: '从语言流畅度、修辞运用、描写质感、对话自然度、文风统一性等角度评审，指出文笔粗糙、表达冗余、对话生硬等问题',
      constraints: ['只指出问题和给出改进建议，不直接修改正文', '评分采用百分制', '尊重作者原有风格，不强行改变文风'],
      isBuiltin: true
    }),
    normalizeWorkflowAgent({
      id: 'worldbuilding_critic', name: '设定评审师', role: '设定评审师',
      color: '#10b981', tagline: '评审世界观一致性与前后连贯',
      duties: '从世界观设定一致性、时间线连贯性、伏笔回收、设定矛盾、细节前后呼应等角度评审，指出设定崩坏、时间线混乱、伏笔遗忘等问题',
      constraints: ['只指出问题和给出改进建议，不直接修改正文', '评分采用百分制', '严格对照已有设定检查'],
      isBuiltin: true
    }),
    normalizeWorkflowAgent({
      id: 'critique_aggregator', name: '意见汇总师', role: '意见汇总师',
      color: '#7c3aed', tagline: '整合多位评审师意见',
      duties: '将多位评审师的评审意见进行整合、去重、排序，提炼出核心问题、优先级排序的修改建议，形成清晰的修订方案',
      constraints: ['客观汇总各方意见，不偏向某一评审师', '按问题严重程度排序：阻塞性问题>重要问题>改进建议', '给出整体评分和是否达标的判断'],
      isBuiltin: true
    }),
    normalizeWorkflowAgent({
      id: 'revision_agent', name: '文稿修订师', role: '文稿修订师',
      color: '#eab308', tagline: '根据评审意见修订文稿',
      duties: '根据评论汇总的修订方案，对文稿进行针对性修改，解决评审师指出的问题，同时尽量保持作者原有风格和核心剧情',
      constraints: ['只修改指出的问题，不随意改动其他部分', '修改需有明确依据对应评审意见', '保持人物和剧情核心设定不变'],
      isBuiltin: true
    }),
    normalizeWorkflowAgent({
      id: 'style_polisher', name: '文词润色师', role: '文词润色师',
      color: '#ec4899', tagline: '优化文笔和表达',
      duties: '润色文字，增强表现力，保持作者风格',
      constraints: ['不得改变剧情走向', '修改篇幅不超过30%'],
      isBuiltin: true
    })
  ]
}
