'use strict'

const { getNodeDefinition, isArchiveNode, ARCHIVE_NODE_TYPES } = require('./node-capabilities.cjs')
const { scanForCredentials, migrateLegacyNodeConfig } = require('./node-resource-resolvers.cjs')

function makeWarning(severity, message, relatedNodeId, fixSuggestions) {
  return {
    severity,
    userMessage: message,
    relatedNodeId,
    fixSuggestions: fixSuggestions || []
  }
}

const AI_RESOURCE_CAPABILITIES = new Set(['model', 'skills', 'rag', 'living_wiki', 'story_bible', 'narrative_state', 'soul', 'mcp', 'tools'])

function nodeHasAIRole(nodeType, capabilities) {
  const aiTypes = ['agent', 'critic', 'scheduler', 'tool_agent', 'llm_judge']
  return aiTypes.includes(nodeType) || capabilities.some(c => AI_RESOURCE_CAPABILITIES.has(c))
}

function validateWorkflow(workflow, context = {}) {
  const errors = []
  const warnings = []
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : []
  const edges = Array.isArray(workflow?.edges) ? workflow.edges : []

  const nodeById = new Map(nodes.map(n => [n.id, n]))
  const nodeTypes = new Map()
  for (const n of nodes) {
    const type = String(n.data?.nodeType || n.type || '')
    nodeTypes.set(n.id, type)
  }

  let startNodeCount = 0
  let outputNodeCount = 0
  const incoming = new Map()
  const outgoing = new Map()
  for (const n of nodes) {
    incoming.set(n.id, [])
    outgoing.set(n.id, [])
    if (n.data?.isStart) startNodeCount++
    const t = String(n.data?.nodeType || n.type || '')
    if (['output', 'final_output', 'text_output', 'file_output', 'archive', 'archive_version'].includes(t) || ARCHIVE_NODE_TYPES.has(t)) {
      outputNodeCount++
    }
  }
  for (const e of edges) {
    if (!incoming.has(e.target)) incoming.set(e.target, [])
    if (!outgoing.has(e.source)) outgoing.set(e.source, [])
    incoming.get(e.target).push(e)
    outgoing.get(e.source).push(e)
  }

  if (nodes.length === 0) {
    errors.push(makeWarning('error', '工作流中没有节点，请先添加节点', null, [{ label: '添加 Agent 节点' }]))
  }

  if (startNodeCount === 0 && nodes.length > 0) {
    warnings.push(makeWarning('warning', '工作流没有标记起始节点，将尝试从没有入边的节点开始执行', null, [{ label: '设置起始节点' }]))
  }

  if (outputNodeCount === 0 && nodes.length > 0) {
    warnings.push(makeWarning('warning', '工作流没有输出/归档节点，结果可能不会被保存', null, [{ label: '添加输出节点' }]))
  }

  for (const node of nodes) {
    const nodeData = node.data || {}
    const nodeType = String(nodeData.nodeType || node.type || '')
    const nodeLabel = nodeData.label || nodeData.name || node.id

    const nodeDef = getNodeDefinition ? getNodeDefinition(nodeType) : null
    const capabilities = nodeDef?.capabilities || []
    const hasLegacy = nodeData.legacyConfig && Object.keys(nodeData.legacyConfig).length > 0
    if (hasLegacy) {
      warnings.push(makeWarning('warning',
        `节点「${nodeLabel}」包含旧版本配置，建议重新保存以完成迁移`,
        node.id,
        [{ label: '查看节点' }]
      ))
    }

    const credFindings = scanForCredentials(nodeData)
    if (credFindings.length > 0) {
      errors.push(makeWarning('error',
        `节点「${nodeLabel}」配置中包含疑似凭证信息（${credFindings.map(f => f.key).join(', ')}），工作流不应保存 API Key 或密码`,
        node.id,
        [{ label: '移除凭证字段' }]
      ))
    }

    if (capabilities.length > 0 && !nodeHasAIRole(nodeType, capabilities)) {
      const boundModel = nodeData.modelConfig?.mode === 'explicit' || (nodeData.model && nodeData.model !== '默认模型')
      if (boundModel && !capabilities.includes('model')) {
        warnings.push(makeWarning('warning',
          `节点「${nodeLabel}」类型为「${nodeType}」，不需要绑定模型，但检测到模型配置`,
          node.id,
          [{ label: '移除模型配置' }]
        ))
      }

      const boundRAG = nodeData.contextConfig?.bindings?.some(b => b.sourceType === 'vector_collection' && b.enabled !== false)
      if (boundRAG && !capabilities.includes('rag') && !capabilities.includes('context')) {
        warnings.push(makeWarning('warning',
          `节点「${nodeLabel}」不需要 RAG 知识库配置，但检测到已绑定`,
          node.id,
          [{ label: '移除RAG配置' }]
        ))
      }

      const boundSoul = nodeData.soulConfig?.mode === 'explicit' && nodeData.soulConfig?.soulId
      if (boundSoul && !capabilities.includes('soul')) {
        warnings.push(makeWarning('warning',
          `节点「${nodeLabel}」不需要 Soul 配置，但检测到已绑定`,
          node.id,
          [{ label: '移除Soul配置' }]
        ))
      }

      const boundMCP = (nodeData.mcpConfig?.mode === 'explicit' && nodeData.mcpConfig?.selectedIds?.length > 0)
        || (nodeData.mcp && nodeData.mcp !== '自动')
      if (boundMCP && !capabilities.includes('mcp') && !capabilities.includes('tools')) {
        warnings.push(makeWarning('warning',
          `节点「${nodeLabel}」不需要 MCP/工具配置，但检测到已绑定`,
          node.id,
          [{ label: '移除工具配置' }]
        ))
      }
    }

    if (capabilities.includes('model') || ['agent', 'critic', 'tool_agent', 'llm_judge'].includes(nodeType)) {
      const modelConfig = nodeData.modelConfig
      if (modelConfig?.mode === 'explicit' && !modelConfig.modelId) {
        errors.push(makeWarning('error',
          `节点「${nodeLabel}」设置为指定模型但未选择模型，请选择一个模型或改为继承模式`,
          node.id,
          [{ label: '选择模型' }, { label: '改为继承' }]
        ))
      }
    }

    const contextBindings = Array.isArray(nodeData.contextConfig?.bindings) ? nodeData.contextConfig.bindings : []
    for (const binding of contextBindings) {
      if (binding.enabled === false) continue
      if (!binding.sourceId && binding.sourceType !== 'upstream_output' && binding.sourceType !== 'manual_context') {
        warnings.push(makeWarning('warning',
          `节点「${nodeLabel}」的上下文绑定「${binding.sourceType}」未指定来源ID`,
          node.id,
          [{ label: '指定来源' }, { label: '禁用此绑定' }]
        ))
      }
      if (binding.retrieval?.topK && binding.retrieval.topK > 50) {
        warnings.push(makeWarning('warning',
          `节点「${nodeLabel}」的上下文检索 Top K 设置过大(${binding.retrieval.topK})，可能导致上下文超长`,
          node.id
        ))
      }
    }

    const manualContextTokens = Number(nodeData.contextConfig?.maxContextTokens || 0)
    const knownModelContext = Number(nodeData.budgetConfig?.modelContextLength || 0)
    if (manualContextTokens > 0 && knownModelContext > 0 && manualContextTokens > knownModelContext) {
      warnings.push(makeWarning('warning',
        `节点「${nodeLabel}」的上下文预算(${manualContextTokens})超过模型窗口(${knownModelContext})，运行时将自动收缩`,
        node.id
      ))
    }

    if (capabilities.includes('soul') && nodeData.soulConfig?.mode === 'explicit') {
      if (!nodeData.soulConfig.soulId) {
        errors.push(makeWarning('error',
          `节点「${nodeLabel}」设置为指定 Soul 但未选择 Soul 档案`,
          node.id,
          [{ label: '选择Soul' }]
        ))
      }
      if (nodeData.soulConfig.enabledAttributes?.length === 0) {
        warnings.push(makeWarning('warning',
          `节点「${nodeLabel}」已绑定 Soul 但未选择任何属性，Soul 内容不会被注入`,
          node.id,
          [{ label: '选择属性' }]
        ))
      }
    }

    if (isArchiveNode(nodeType)) {
      const forbiddenCaps = ['model', 'skills', 'rag', 'living_wiki', 'story_bible', 'narrative_state', 'soul', 'mcp']
      const foundForbidden = forbiddenCaps.filter(c => capabilities.includes(c))
      if (foundForbidden.length > 0) {
        errors.push(makeWarning('error',
          `归档节点「${nodeLabel}」不应包含 AI 资源能力(${foundForbidden.join(', ')})`,
          node.id
        ))
      }
    }

    if (nodeType === 'human_confirm' || nodeType === 'human_review' || nodeData.reviewConfig?.requiresReview) {
      const outEdges = outgoing.get(node.id) || []
      if (outEdges.length === 0) {
        warnings.push(makeWarning('warning',
          `人工确认节点「${nodeLabel}」没有输出连线，确认结果无法传递到后续节点`,
          node.id
        ))
      }
    }
  }

  for (const edge of edges) {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source) {
      errors.push(makeWarning('error', `连线引用了不存在的源节点: ${edge.source}`, null))
    }
    if (!target) {
      errors.push(makeWarning('error', `连线引用了不存在的目标节点: ${edge.target}`, null))
    }
  }

  const visited = new Set()
  const inStack = new Set()
  function hasCycle(nodeId, path = []) {
    if (inStack.has(nodeId)) return true
    if (visited.has(nodeId)) return false
    visited.add(nodeId)
    inStack.add(nodeId)
    const out = outgoing.get(nodeId) || []
    for (const e of out) {
      if (hasCycle(e.target, [...path, nodeId])) return true
    }
    inStack.delete(nodeId)
    return false
  }
  for (const n of nodes) {
    if (hasCycle(n.id)) {
      errors.push(makeWarning('error', '工作流中检测到循环依赖，请检查连线是否形成环路', n.id))
      break
    }
  }

  const orphanNodes = nodes.filter(n => (incoming.get(n.id) || []).length === 0 && (outgoing.get(n.id) || []).length === 0 && !n.data?.isStart)
  for (const orphan of orphanNodes) {
    warnings.push(makeWarning('warning',
      `节点「${orphan.data?.label || orphan.id}」没有任何连线连接，将不会被执行`,
      orphan.id,
      [{ label: '连接节点' }, { label: '设为起始' }]
    ))
  }

  const writebackBindings = []
  for (const node of nodes) {
    const ctx = node.data?.contextConfig?.bindings || []
    for (const b of ctx) {
      if (b.config?.writePermission && b.config.writePermission !== 'read_only') {
        writebackBindings.push({ nodeId: node.id, sourceType: b.sourceType, permission: b.config.writePermission })
      }
    }
  }
  if (writebackBindings.length > 0) {
    const hasConfirmNode = nodes.some(n => ['human_confirm', 'human_review', 'human_edit'].includes(String(n.data?.nodeType || n.type || '')))
    if (!hasConfirmNode && writebackBindings.some(wb => wb.permission.includes('approval') || wb.permission.includes('write'))) {
      warnings.push(makeWarning('warning',
        `工作流配置了可写回知识源的节点，但没有人工确认节点，写回将进入待定队列等待审批`,
        null,
        [{ label: '添加人工确认节点' }]
      ))
    }
  }

  const errorList = errors.map(e => ({ ...e, severity: 'error' }))
  const warningList = [...warnings]
  const valid = errorList.length === 0

  return {
    valid,
    errors: errorList,
    warnings: warningList,
    stats: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      startNodeCount,
      outputNodeCount,
      orphanCount: orphanNodes.length,
      writebackBindingCount: writebackBindings.length,
      credentialFindings: nodes.reduce((acc, n) => acc + scanForCredentials(n.data || {}).length, 0)
    }
  }
}

function compileWorkflow(workflow, context = {}) {
  const migratedNodes = Array.isArray(workflow?.nodes)
    ? workflow.nodes.map(n => {
        const { data, migrated, legacyConfig } = migrateLegacyNodeConfig(n.data)
        return { ...n, data }
      })
    : []

  const validation = validateWorkflow({ ...workflow, nodes: migratedNodes }, context)

  const compiled = {
    id: workflow.id,
    schema_version: workflow.schema_version || 3,
    compiled_at: new Date().toISOString(),
    valid: validation.valid,
    nodes: migratedNodes.map(n => {
      const nodeData = n.data || {}
      return {
        id: n.id,
        type: String(nodeData.nodeType || n.type || ''),
        label: nodeData.label || n.id,
        position: n.position,
        capabilities: getNodeDefinition?.(String(nodeData.nodeType || n.type || ''))?.capabilities || [],
        data: nodeData
      }
    }),
    edges: Array.isArray(workflow.edges) ? workflow.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: e.type || 'normal',
      label: e.label,
      data: e.data
    })) : [],
    entryNodes: migratedNodes.filter(n => n.data?.isStart || (validation.stats.startNodeCount === 0 && !workflow.edges?.some(e => e.target === n.id))).map(n => n.id),
    validation
  }

  return compiled
}

module.exports = {
  validateWorkflow,
  compileWorkflow,
  makeWarning
}
