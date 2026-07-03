export const WORKFLOW_NODE_TYPES = ['input', 'agent', 'parallel', 'condition', 'loop', 'human_review', 'archive', 'output'] as const
export type WorkflowNodeType = typeof WORKFLOW_NODE_TYPES[number]

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
}

export interface WorkflowNodeData {
  label?: string
  agent_id?: string
  agent_name?: string
  content?: string
  prompt?: string
  condition?: string
  rounds?: number
  [key: string]: unknown
}

export interface WorkflowNodeRecord {
  id: string
  type: WorkflowNodeType | string
  position: { x: number; y: number }
  data: WorkflowNodeData
}

export interface WorkflowEdgeRecord {
  id: string
  source: string
  target: string
  label?: string
}

export interface WorkflowLimits {
  max_agents: number
  max_parallel: number
  max_loop: number
}

export interface WriterWorkflow {
  id?: string
  project_id?: string
  name: string
  mode: 'simple' | 'canvas'
  nodes: WorkflowNodeRecord[]
  edges: WorkflowEdgeRecord[]
  limits: WorkflowLimits
  knowledge_binding: { enabled: boolean; ids?: string[] }
  created_at?: string
  updated_at?: string
}

export const DEFAULT_LIMITS: WorkflowLimits = { max_agents: 10, max_parallel: 3, max_loop: 3 }

export function clampWorkflowLimits(limits: Partial<WorkflowLimits> = {}): WorkflowLimits {
  return {
    max_agents: Math.min(10, Math.max(1, Number(limits.max_agents || DEFAULT_LIMITS.max_agents))),
    max_parallel: Math.min(5, Math.max(1, Number(limits.max_parallel || DEFAULT_LIMITS.max_parallel))),
    max_loop: Math.min(5, Math.max(1, Number(limits.max_loop || DEFAULT_LIMITS.max_loop)))
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
    enabled: input.enabled !== false
  }
}

export function validateWorkflow(workflow: Pick<WriterWorkflow, 'nodes' | 'edges'> & { limits?: Partial<WorkflowLimits> }): string[] {
  const errors: string[] = []
  const limits = clampWorkflowLimits(workflow.limits)
  const ids = new Set(workflow.nodes.map(node => node.id))
  const agentCount = workflow.nodes.filter(node => node.type === 'agent').length
  if (agentCount > limits.max_agents) errors.push(`单条工作流最多 ${limits.max_agents} 个 Agent`)
  for (const edge of workflow.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) errors.push('连线包含不存在的节点')
    if (edge.source === edge.target) errors.push('节点不能连接到自己')
  }
  const adjacency = new Map<string, string[]>(workflow.nodes.map(node => [node.id, []]))
  for (const edge of workflow.edges) adjacency.get(edge.source)?.push(edge.target)
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const dfs = (id: string) => {
    if (visiting.has(id)) {
      errors.push('工作流不允许形成环路；请使用循环节点并设置上限')
      return
    }
    if (visited.has(id)) return
    visiting.add(id)
    for (const next of adjacency.get(id) || []) dfs(next)
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of ids) dfs(id)
  return Array.from(new Set(errors))
}

export function createWorkflowTemplate(kind: 'chapter' | 'polish' | 'foreshadow' | 'unstuck'): WriterWorkflow {
  const specs: Record<typeof kind, Array<{ type: WorkflowNodeType; label: string; agent_id?: string }>> = {
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
    ]
  }
  const rows = specs[kind]
  const nodes = rows.map((row, index) => ({
    id: `${row.type}_${index + 1}`,
    type: row.type,
    position: { x: 80 + index * 190, y: index % 2 ? 260 : 110 },
    data: { label: row.label, agent_id: row.agent_id, rounds: row.type === 'loop' ? 3 : undefined }
  }))
  const edges = nodes.slice(0, -1).map((node, index) => ({ id: `edge_${node.id}_${nodes[index + 1].id}`, source: node.id, target: nodes[index + 1].id }))
  const names = { chapter: '章节创作流', polish: '单章润色点评流', foreshadow: '伏笔回收流', unstuck: '卡文救援流' }
  return { name: names[kind], mode: 'canvas', nodes, edges, limits: DEFAULT_LIMITS, knowledge_binding: { enabled: true } }
}
