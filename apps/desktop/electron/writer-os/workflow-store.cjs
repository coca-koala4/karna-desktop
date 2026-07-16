'use strict'

function createWriterWorkflowStoreService(deps = {}) {
  const required = ['fs', 'path', 'crypto', 'getBackendDataDir', 'readWriterProjects', 'findWriterProject', 'readJsonFile', 'writeJsonFile', 'normalizeWorkflowPermissions']
  for (const name of required) if (!deps[name]) throw new Error(`createWriterWorkflowStoreService requires ${name}.`)
  const { fs, path, crypto, getBackendDataDir, readWriterProjects, findWriterProject, readJsonFile, writeJsonFile } = deps

const WORKFLOW_AGENT_TEMPLATES = [
  { id: 'setting_keeper', name: '设定库 Agent', role: '设定核查', color: '#7c3aed', tagline: '守住世界观、人设、时间线和能力规则', duties: '管理世界观、年代、势力、人物性格、能力规则，并核查新内容是否吃设定。', forbidden: '不负责写正文，不擅自新增破坏主设定的大规则。', output_format: '设定核查报告', permissions: { canEditDraft: false, canComment: true, canUseKnowledge: true, canReadUpstream: true }, model: '', temperature: 0.3, top_p: 0.8, constraints: ['必须严格遵循本书世界观', '仅标注问题不修改正文'] },
  { id: 'outline_architect', name: '大纲 Agent', role: '大纲设计', color: '#2563eb', tagline: '搭建主线、分卷和章节节拍', duties: '生成长篇总纲、分卷纲、章节梗概和阶段目标。', forbidden: '不直接撰写完整正文。', output_format: '分层大纲', permissions: { canEditDraft: false, canComment: true, canUseKnowledge: true, canReadUpstream: true }, model: '', temperature: 0.7, top_p: 0.9, constraints: ['不得改动用户指定主线剧情'] },
  { id: 'character_designer', name: '人设 Agent', role: '人设塑造', color: '#db2777', tagline: '塑造身世、动机、口头禅和行为逻辑', duties: '设计人物小传、性格、口头禅、行为逻辑、情绪变化和成长弧。', forbidden: '不推翻主线，不随意黑化角色。', output_format: '人物卡', permissions: { canEditDraft: false, canComment: true, canUseKnowledge: true, canReadUpstream: true }, model: '', temperature: 0.65, top_p: 0.9, constraints: ['保持人物动机一致'] },
  { id: 'chapter_writer', name: '正文写作 Agent', role: '正文写作', color: '#16a34a', tagline: '根据梗概和指令落地码字', duties: '根据用户需求、章节梗概和上游材料写章节初稿。', forbidden: '未经允许不改变大纲和核心情节。', output_format: '章节正文', permissions: { canEditDraft: true, canComment: false, canUseKnowledge: true, canReadUpstream: true }, model: '', temperature: 0.75, top_p: 0.95, constraints: ['贴合用户文风锚点'] },
  { id: 'plot_continuation', name: '剧情续写 Agent', role: '剧情续写', color: '#0891b2', tagline: '卡文时生成矛盾、转折和下一步方案', duties: '为卡文场景生成冲突、反转、突发事件和后续走向方案。', forbidden: '不替作者决定最终剧情方向。', output_format: '续写方案', permissions: { canEditDraft: true, canComment: true, canUseKnowledge: true, canReadUpstream: true }, model: '', temperature: 0.85, top_p: 0.95, constraints: ['给出多个方案供作者选择'] },
  { id: 'style_polisher', name: '文笔润色 Agent', role: '文笔润色', color: '#ea580c', tagline: '优化句式、氛围、节奏和对话质感', duties: '优化句式流畅度、节奏、氛围、对话和可读性。', forbidden: '不改变剧情走向和核心事件。', output_format: '润色后文本+修改说明', permissions: { canEditDraft: true, canComment: true, canUseKnowledge: false, canReadUpstream: true }, model: '', temperature: 0.55, top_p: 0.85, constraints: ['修改篇幅不能超过原文30%', '不得改动主线剧情'] },
  { id: 'logic_reviewer', name: '剧情逻辑 Agent', role: '逻辑审核', color: '#9333ea', tagline: '排查剧情漏洞、时间线冲突和动机问题', duties: '检查剧情漏洞、时间线冲突、因果薄弱和人物行为动机不合理。', forbidden: '只标注问题和修复方案，不大段改写正文。', output_format: '问题清单', permissions: { canEditDraft: false, canComment: true, canUseKnowledge: true, canReadUpstream: true }, model: '', temperature: 0.25, top_p: 0.8, constraints: ['仅标注问题不修改正文'] },
  { id: 'foreshadow_manager', name: '伏笔 Agent', role: '伏笔埋坑', color: '#4f46e5', tagline: '自然埋设新伏笔并回收旧伏笔', duties: '检索前文材料，自然埋设新伏笔，回收旧伏笔，并记录线索表。', forbidden: '不制造无关悬念。', output_format: '伏笔表', permissions: { canEditDraft: false, canComment: true, canUseKnowledge: true, canReadUpstream: true }, model: '', temperature: 0.45, top_p: 0.85, constraints: ['引用前文证据'] },
  { id: 'compliance_guard', name: '合规风控 Agent', role: '合规避雷', color: '#dc2626', tagline: '筛查敏感、低俗、暴力和平台风险', duties: '检查敏感剧情、暴力、低俗、三观风险和平台擦边风险，并提供更安全替代方案。', forbidden: '不扩写敏感内容，不评价文学质量。', output_format: '风险等级+替代方案', permissions: { canEditDraft: false, canComment: true, canUseKnowledge: false, canReadUpstream: true }, model: '', temperature: 0.2, top_p: 0.75, constraints: ['优先平台安全'] },
  { id: 'critic_editor', name: '剧评批判 Agent', role: '剧评批判', color: '#64748b', tagline: '站在读者和编辑视角挑短板', duties: '指出节奏拖沓、桥段老套、冲突不足、看点匮乏，并给出改进方向。', forbidden: '只评论和建议，不私自改写正文。', output_format: '编辑评语', permissions: { canEditDraft: false, canComment: true, canUseKnowledge: true, canReadUpstream: true }, model: '', temperature: 0.5, top_p: 0.85, constraints: ['贴合网文读者审美'] }
]
const workflowAgentsPath = project => path.join(project.folder, 'workflow_agents.json')
const workflowsPath = project => path.join(project.folder, 'workflows.json')
const workflowRunsPath = project => path.join(project.folder, 'workflow_runs.json')
const workflowArtifactsDir = project => path.join(project.folder, 'workflow_artifacts')
const workflowNow = () => new Date().toISOString()
const workflowId = prefix => `${prefix}_${crypto.randomBytes(5).toString('hex')}`
const globalWorkflowProject = () => {
  const folder = path.join(getBackendDataDir(), 'global-workflows')
  const project = { id: 'global-workflows', slug: 'global-workflows', title: 'Karna 多智能体工坊', type: 'workflow', folder, root: folder, status: 'active', knowledge_ids: [] }
  fs.mkdirSync(folder, { recursive: true })
  fs.mkdirSync(path.join(folder, 'workflow_artifacts'), { recursive: true })
  return project
}
const activeWriterProject = () => {
  const store = readWriterProjects()
  const rows = Array.isArray(store.projects) ? store.projects : []
  return rows.find(project => project.id === store.active_project_id) || rows.find(project => project.status !== 'archived') || rows[0] || null
}
const workflowProjectFromRef = ref => {
  const text = String(ref || '').trim()
  if (text && text !== 'global' && text !== 'global-workflows') return findWriterProject(text) || globalWorkflowProject()
  return globalWorkflowProject()
}
const normalizeWorkflowPermissions = deps.normalizeWorkflowPermissions
const normalizeWorkflowAgent = (agent, index = 0) => ({
  id: String(agent?.id || workflowId('wf_agent')).trim(),
  name: String(agent?.name || agent?.role || `Creative Agent ${index + 1}`).trim(),
  role: String(agent?.role || agent?.name || `Creative Agent ${index + 1}`).trim(),
  color: String(agent?.color || WORKFLOW_AGENT_TEMPLATES[index % WORKFLOW_AGENT_TEMPLATES.length]?.color || '#7c3aed'),
  tagline: String(agent?.tagline || agent?.brief || '').trim(),
  duties: String(agent?.duties || agent?.brief || agent?.description || '').trim(),
  forbidden: String(agent?.forbidden || '').trim(),
  output_format: String(agent?.output_format || agent?.outputFormat || 'Segmented response').trim(),
  model: String(agent?.model || '').trim(),
  temperature: Math.max(0, Math.min(2, Number(agent?.temperature ?? 0.6))),
  top_p: Math.max(0, Math.min(1, Number(agent?.top_p ?? agent?.topP ?? 0.9))),
  constraints: Array.isArray(agent?.constraints) ? agent.constraints.map(String).filter(Boolean).slice(0, 12) : [],
  permissions: normalizeWorkflowPermissions(agent?.permissions || {}),
  enabled: agent?.enabled !== false,
  updated_at: workflowNow()
})
const defaultWorkflowAgents = () => WORKFLOW_AGENT_TEMPLATES.map((agent, index) => normalizeWorkflowAgent(agent, index))
const workflowTemplateById = () => new Map(defaultWorkflowAgents().map(agent => [agent.id, agent]))
const maybeUpgradeBuiltinWorkflowAgent = (agent, index = 0) => {
  const normalized = normalizeWorkflowAgent(agent, index)
  const template = workflowTemplateById().get(normalized.id)
  if (!template) return normalized
  const oldEnglish = /Setting Keeper|Outline Agent|Character Agent|Chapter Writer|Plot Continuation|Style Polisher|Logic Reviewer|Foreshadow Agent|Compliance Agent|Critic Agent/i.test(`${normalized.name} ${normalized.role} ${normalized.tagline}`)
  if (!oldEnglish) return normalized
  return normalizeWorkflowAgent({
    ...template,
    model: normalized.model || template.model,
    temperature: normalized.temperature ?? template.temperature,
    top_p: normalized.top_p ?? template.top_p,
    enabled: normalized.enabled
  }, index)
}
const readWorkflowAgents = project => {
  const fallback = { version: 1, project_id: project?.id || 'global', agents: defaultWorkflowAgents() }
  const data = readJsonFile(workflowAgentsPath(project), fallback)
  const rows = Array.isArray(data.agents) && data.agents.length ? data.agents : fallback.agents
  return { ...fallback, ...data, agents: rows.map(maybeUpgradeBuiltinWorkflowAgent) }
}
const writeWorkflowAgents = (project, agents) => writeJsonFile(workflowAgentsPath(project), { version: 1, project_id: project.id, updated_at: workflowNow(), agents: agents.map(normalizeWorkflowAgent).slice(0, 10) })
const readWorkflows = project => readJsonFile(workflowsPath(project), { version: 1, project_id: project.id, workflows: [] })
const writeWorkflows = (project, workflows) => writeJsonFile(workflowsPath(project), { version: 1, project_id: project.id, updated_at: workflowNow(), workflows })
const readWorkflowRuns = project => readJsonFile(workflowRunsPath(project), { version: 1, project_id: project.id, runs: [] })
const writeWorkflowRuns = (project, runs) => writeJsonFile(workflowRunsPath(project), { version: 1, project_id: project.id, updated_at: workflowNow(), runs: runs.slice(-100) })
const defaultWorkflowLimits = limits => ({ max_agents: Math.min(10, Math.max(1, Number(limits?.max_agents || 10))), max_parallel: Math.min(5, Math.max(1, Number(limits?.max_parallel || 3))), max_loop: Math.min(5, Math.max(1, Number(limits?.max_loop || 3))) })
const normalizeWorkflowNode = (node, index = 0) => ({
  id: String(node?.id || workflowId('node')).trim(),
  type: String(node?.type || 'agent').trim(),
  position: node?.position && typeof node.position === 'object' ? { x: Number(node.position.x || 0), y: Number(node.position.y || 0) } : { x: 120 + index * 160, y: 140 },
  data: node?.data && typeof node.data === 'object' ? node.data : {}
})
const normalizeWorkflowEdge = edge => ({ id: String(edge?.id || `${edge?.source || ''}-${edge?.target || ''}` || workflowId('edge')), source: String(edge?.source || ''), target: String(edge?.target || ''), label: edge?.label ? String(edge.label) : '' })
const validateWorkflowGraph = workflow => {
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : []
  const edges = Array.isArray(workflow.edges) ? workflow.edges : []
  const ids = new Set(nodes.map(node => node.id))
  const agentCount = nodes.filter(node => node.type === 'agent').length
  const limits = defaultWorkflowLimits(workflow.limits)
  if (agentCount > limits.max_agents) throw new Error(`At most ${limits.max_agents} Agent nodes are allowed in one workflow`)
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) throw new Error('An edge references a missing node')
    if (edge.source === edge.target) throw new Error('A node cannot connect to itself')
  }
  const adjacency = new Map(nodes.map(node => [node.id, []]))
  for (const edge of edges) adjacency.get(edge.source)?.push(edge.target)
  const visiting = new Set(); const visited = new Set()
  const dfs = id => {
    if (visiting.has(id)) throw new Error('Workflow cycles are not allowed; use a loop node with an explicit cap')
    if (visited.has(id)) return
    visiting.add(id)
    for (const next of adjacency.get(id) || []) dfs(next)
    visiting.delete(id); visited.add(id)
  }
  for (const id of ids) dfs(id)
  return true
}
const normalizeWorkflow = (project, input = {}, existing = null) => {
  const now = workflowNow()
  const workflow = {
    id: String(existing?.id || input.id || workflowId('workflow')),
    project_id: project.id,
    name: String(input.name || existing?.name || 'Upstream output is not provided').trim(),
    mode: ['simple', 'canvas'].includes(input.mode || existing?.mode) ? String(input.mode || existing?.mode) : 'canvas',
    nodes: (Array.isArray(input.nodes) ? input.nodes : existing?.nodes || []).map(normalizeWorkflowNode),
    edges: (Array.isArray(input.edges) ? input.edges : existing?.edges || []).map(normalizeWorkflowEdge).filter(edge => edge.source && edge.target),
    limits: defaultWorkflowLimits(input.limits || existing?.limits),
    knowledge_binding: input.knowledge_binding || input.knowledgeBinding || existing?.knowledge_binding || { enabled: true, ids: project.knowledge_ids || [] },
    created_at: existing?.created_at || now,
    updated_at: now
  }
  validateWorkflowGraph(workflow)
  return workflow
}
const upsertWorkflowAgent = (project, patch = {}, targetId = '') => {
  const store = readWorkflowAgents(project)
  const next = normalizeWorkflowAgent({ ...patch, id: targetId || patch.id || workflowId('wf_agent') })
  const exists = store.agents.some(agent => agent.id === next.id)
  const agents = exists ? store.agents.map(agent => agent.id === next.id ? next : agent) : [...store.agents, next]
  return writeWorkflowAgents(project, agents.slice(0, 10))
}
const deleteWorkflowAgent = (project, targetId = '') => {
  const id = String(targetId || '').trim()
  if (!id) throw new Error('Agent id is required')
  const builtinIds = new Set(WORKFLOW_AGENT_TEMPLATES.map(agent => agent.id))
  if (builtinIds.has(id)) throw new Error('\u5185\u7f6e\u667a\u80fd\u4f53\u4e0d\u80fd\u5220\u9664\uff0c\u53ef\u4ee5\u5148\u590d\u5236\u518d\u6539\u3002')
  const store = readWorkflowAgents(project)
  const agents = (store.agents || []).filter(agent => agent.id !== id)
  const saved = writeWorkflowAgents(project, agents)
  return { ...saved, deleted_id: id }
}
const listWorkflowsForProject = project => ({ ok: true, project, agents: readWorkflowAgents(project).agents, ...readWorkflows(project), runs: readWorkflowRuns(project).runs })
const saveWorkflowForProject = (project, input = {}) => {
  const store = readWorkflows(project)
  const existing = (store.workflows || []).find(row => row.id === input.id)
  const workflow = normalizeWorkflow(project, input, existing)
  const workflows = existing ? (store.workflows || []).map(row => row.id === workflow.id ? workflow : row) : [...(store.workflows || []), workflow]
  writeWorkflows(project, workflows)
  return { ok: true, workflow, workflows }
}
const deleteWorkflowForProject = (project, workflowIdText) => {
  const store = readWorkflows(project)
  const workflows = (store.workflows || []).filter(row => row.id !== workflowIdText)
  writeWorkflows(project, workflows)
  return { ok: true, workflows }
}

  return {
    WORKFLOW_AGENT_TEMPLATES,
    workflowAgentsPath,
    workflowsPath,
    workflowRunsPath,
    workflowArtifactsDir,
    workflowNow,
    workflowId,
    globalWorkflowProject,
    activeWriterProject,
    workflowProjectFromRef,
    normalizeWorkflowPermissions,
    normalizeWorkflowAgent,
    defaultWorkflowAgents,
    workflowTemplateById,
    maybeUpgradeBuiltinWorkflowAgent,
    readWorkflowAgents,
    writeWorkflowAgents,
    readWorkflows,
    writeWorkflows,
    readWorkflowRuns,
    writeWorkflowRuns,
    defaultWorkflowLimits,
    normalizeWorkflowNode,
    normalizeWorkflowEdge,
    validateWorkflowGraph,
    normalizeWorkflow,
    upsertWorkflowAgent,
    deleteWorkflowAgent,
    listWorkflowsForProject,
    saveWorkflowForProject,
    deleteWorkflowForProject
  }
}

module.exports = { createWriterWorkflowStoreService }
