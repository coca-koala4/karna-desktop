'use strict'

const crypto = require('node:crypto')

const MODE_REQUIRED_CAPABILITIES = {
  direct: [],
  plan: [
    { capability: 'context', reason: '计划模式需要读取项目上下文' },
    { capability: 'rag', reason: '计划模式需要检索研究材料' },
    { capability: 'output_schema', reason: '计划模式需要输出结构化PlanDocument' }
  ],
  goal: [
    { capability: 'context', reason: '目标模式需要项目上下文' },
    { capability: 'model', reason: '目标模式需要执行任务的Agent' },
    { capability: 'output_schema', reason: '目标模式需要输出结构化结果和证据' },
    { capability: 'checkpoint', reason: '目标模式需要检查点来支持暂停/恢复', optional: true }
  ],
  living_work: [
    { capability: 'context', reason: '作品演化需要作品上下文' },
    { capability: 'model', reason: '作品演化需要创作Agent' },
    { capability: 'story_bible', reason: '作品演化需要Story Bible访问', optional: true },
    { capability: 'narrative_state', reason: '作品演化需要叙事状态访问', optional: true },
    { capability: 'output_schema', reason: '作品演化需要输出候选行动和影响分析' },
    { capability: 'human_review', reason: '作品演化需要人工审批节点' }
  ]
}

const MODE_REQUIRED_NODE_TYPES = {
  direct: [],
  plan: [
    { type: 'agent', reason: '需要至少一个调查/分析Agent' },
    { type: 'final_output', reason: '需要输出来源节点', optional: true }
  ],
  goal: [
    { type: 'agent', reason: '需要至少一个执行Agent' },
    { type: 'llm_judge', reason: '需要验证节点来检查成功标准', optional: true },
    { type: 'final_output', reason: '需要输出来源节点', optional: true }
  ],
  living_work: [
    { type: 'agent', reason: '需要创作Agent' },
    { type: 'human_confirm', reason: '需要人工确认节点' },
    { type: 'checkpoint', reason: '需要检查点节点', optional: true }
  ]
}

const MODE_CAPABILITIES_MAP = {
  investigate: ['context', 'rag', 'wiki_query', 'bible_query', 'filesystem'],
  plan_document: ['model', 'prompt', 'output_schema', 'text_merge'],
  execute: ['model', 'prompt', 'tools', 'mcp', 'filesystem'],
  verify: ['model', 'llm_judge', 'boolean_judge', 'score_judge'],
  creative_analyze: ['context', 'story_bible', 'narrative_state', 'soul', 'model'],
  candidate_generate: ['model', 'prompt', 'output_schema'],
  impact_analyze: ['model', 'prompt', 'story_bible', 'narrative_state'],
  artifact_diff: ['model', 'filesystem', 'writeback', 'diff'],
  knowledge_proposal: ['model', 'living_wiki', 'story_bible', 'narrative_state', 'writeback', 'human_review']
}

function contentHash(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16)
}

function getWorkflowNodeTypes(workflow) {
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : []
  return new Set(nodes.map(n => n?.type || n?.classType || 'unknown'))
}

function getWorkflowCapabilities(workflow, nodeCapabilities) {
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : []
  const caps = new Set()
  for (const node of nodes) {
    const nodeType = node?.type || node?.classType
    if (nodeCapabilities && nodeCapabilities[nodeType]) {
      for (const c of nodeCapabilities[nodeType]) {
        caps.add(c)
      }
    }
    if (Array.isArray(node?.capabilities)) {
      for (const c of node.capabilities) {
        caps.add(c)
      }
    }
  }
  return caps
}

function inferWorkflowModeCompatibility(workflow, nodeCapabilities) {
  const nodeTypes = getWorkflowNodeTypes(workflow)
  const capabilities = getWorkflowCapabilities(workflow, nodeCapabilities)
  const results = {}

  for (const mode of ['direct', 'plan', 'goal', 'living_work']) {
    const missingCaps = []
    const warnings = []
    const missingTypes = []

    for (const req of (MODE_REQUIRED_CAPABILITIES[mode] || [])) {
      if (!capabilities.has(req.capability)) {
        if (req.optional) {
          warnings.push(`缺少可选能力: ${req.capability} - ${req.reason}`)
        } else {
          missingCaps.push({ capability: req.capability, reason: req.reason })
        }
      }
    }

    for (const req of (MODE_REQUIRED_NODE_TYPES[mode] || [])) {
      if (!nodeTypes.has(req.type)) {
        if (req.optional) {
          warnings.push(`缺少可选节点类型: ${req.type} - ${req.reason}`)
        } else {
          missingTypes.push({ nodeType: req.type, reason: req.reason })
        }
      }
    }

    let modeCapabilities = []
    for (const [cap, required] of Object.entries(MODE_CAPABILITIES_MAP)) {
      const hasAll = required.every(c => capabilities.has(c))
      if (hasAll) {
        modeCapabilities.push(cap)
      }
    }

    results[mode] = {
      compatible: missingCaps.length === 0 && missingTypes.length === 0,
      missingCapabilities: missingCaps,
      missingNodeTypes: missingTypes,
      warnings,
      availableCapabilities: modeCapabilities,
      detectedNodeTypes: Array.from(nodeTypes),
      detectedCapabilities: Array.from(capabilities)
    }
  }

  return results
}

function createWorkflowBindingSnapshot(workflow, agents, source, compatibilityResult) {
  const resolvedAgentIds = Array.isArray(agents)
    ? agents.map(a => a?.id).filter(Boolean)
    : []

  return {
    workflowId: workflow.id,
    workflowVersion: workflow.version || Date.now(),
    contentHash: contentHash({ nodes: workflow.nodes, edges: workflow.edges }),
    source: source || 'mode_default',
    resolvedAgentIds,
    compiledPlanRef: `compiled://${workflow.id}/${Date.now()}`,
    modeCompatibility: compatibilityResult
  }
}

function buildExecutionPlan(workflow) {
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : []
  const edges = Array.isArray(workflow?.edges) ? workflow.edges : []
  const nodeById = new Map(nodes.map(n => [n.id, n]))
  const inDegree = new Map()
  const outgoing = new Map()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    outgoing.set(node.id, [])
  }

  for (const edge of edges) {
    const from = edge.source || edge.from
    const to = edge.target || edge.to
    if (from && to && nodeById.has(from) && nodeById.has(to)) {
      outgoing.get(from).push(to)
      inDegree.set(to, (inDegree.get(to) || 0) + 1)
    }
  }

  const queue = []
  const steps = []
  for (const [nodeId, deg] of inDegree) {
    if (deg === 0) queue.push(nodeId)
  }

  const entryNodeId = queue.length > 0 ? queue[0] : (nodes[0]?.id || null)
  const visited = new Set()

  while (queue.length > 0) {
    const nodeId = queue.shift()
    if (visited.has(nodeId)) continue
    visited.add(nodeId)
    const node = nodeById.get(nodeId)
    const deps = edges.filter(e => (e.target || e.to) === nodeId).map(e => e.source || e.from)
    steps.push({
      nodeId,
      agentId: node?.agent_id || node?.agentId || null,
      dependencies: deps.filter(d => visited.has(d)),
      type: node?.type || node?.classType || 'unknown'
    })
    for (const next of (outgoing.get(nodeId) || [])) {
      inDegree.set(next, (inDegree.get(next) || 1) - 1)
      if (inDegree.get(next) <= 0 && !visited.has(next)) {
        queue.push(next)
      }
    }
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      steps.push({
        nodeId: node.id,
        agentId: node?.agent_id || node?.agentId || null,
        dependencies: [],
        type: node?.type || node?.classType || 'unknown'
      })
    }
  }

  return {
    workflowId: workflow.id,
    steps,
    entryNodeId
  }
}

function createModeCompatibilityCompiler({ nodeCapabilities } = {}) {
  const caps = nodeCapabilities || {}

  return {
    inferWorkflowModeCompatibility: (workflow) => inferWorkflowModeCompatibility(workflow, caps),
    createWorkflowBindingSnapshot: (workflow, agents, source, mode) => {
      const allCompat = inferWorkflowModeCompatibility(workflow, caps)
      const compat = mode ? (allCompat[mode] || { compatible: false, missingCapabilities: [], warnings: ['Unknown mode'] }) : null
      return createWorkflowBindingSnapshot(workflow, agents, source, compat ? { [mode]: compat } : allCompat)
    },
    buildExecutionPlan,
    checkModeCompatibility: (workflow, mode) => {
      const allCompat = inferWorkflowModeCompatibility(workflow, caps)
      return allCompat[mode] || { compatible: false, missingCapabilities: [], warnings: ['Unknown mode'] }
    }
  }
}

module.exports = {
  createModeCompatibilityCompiler,
  MODE_REQUIRED_CAPABILITIES,
  MODE_REQUIRED_NODE_TYPES,
  MODE_CAPABILITIES_MAP
}
