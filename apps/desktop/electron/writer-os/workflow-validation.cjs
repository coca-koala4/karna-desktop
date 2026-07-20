'use strict'

const { getNodeDefinition, isArchiveNode, ARCHIVE_NODE_TYPES } = require('./node-capabilities.cjs')
const { scanForCredentials, migrateLegacyNodeConfig } = require('./node-resource-resolvers.cjs')

function makeWarning(severity, message, relatedNodeId, fixSuggestions, relatedEdgeId) {
  return {
    severity,
    userMessage: message,
    relatedNodeId,
    relatedEdgeId,
    fixSuggestions: fixSuggestions || []
  }
}

const AI_RESOURCE_CAPABILITIES = new Set(['model', 'skills', 'rag', 'living_wiki', 'story_bible', 'narrative_state', 'soul', 'mcp', 'tools'])

const LEGACY_NODE_TYPE_MAP = {
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

const LEGACY_EDGE_TYPE_MAP = {
  'default': 'normal',
  'straight': 'normal',
  'step': 'normal',
  'smoothstep': 'normal',
  'bezier': 'normal',
  'approval': 'human_approval'
}

const NODE_INPUT_HANDLES = {
  'input_text': [],
  'input_file': [],
  'input_variable': [],
  'input_constant': [],
  'agent': ['in', 'context_in'],
  'critic': ['artifact_in', 'criteria_in'],
  'scheduler': ['in'],
  'tool_agent': ['in', 'context_in'],
  'prompt_template': ['vars_in'],
  'prompt_merge': ['in'],
  'context_merge': ['in'],
  'context_trim': ['in'],
  'rag_search': ['query_in'],
  'wiki_query': ['query_in'],
  'bible_query': ['query_in'],
  'narrative_query': ['query_in'],
  'soul_query': ['query_in'],
  'mcp_tool': ['args_in', 'context_in'],
  'workspace_read': ['path_in'],
  'workspace_write': ['path_in', 'content_in'],
  'web_search': ['query_in'],
  'fanout': ['in'],
  'barrier': ['in'],
  'condition': ['in'],
  'switch_node': ['in'],
  'wait': ['in'],
  'retry': ['in'],
  'loop_controller': ['in'],
  'checkpoint': ['in'],
  'subflow': ['in'],
  'boolean_judge': ['in'],
  'score_judge': ['in'],
  'llm_judge': ['in'],
  'consensus': ['critiques_in'],
  'text_merge': ['in'],
  'critique_aggregate': ['critiques_in'],
  'human_confirm': ['in'],
  'human_edit': ['in'],
  'artifact': ['in'],
  'save_snapshot': ['content_in', 'artifact_in'],
  'archive_version': ['in'],
  'final_output': ['in'],
  'text_output': ['in'],
  'file_output': ['in']
}

const NODE_OUTPUT_HANDLES = {
  'input_text': ['out'],
  'input_file': ['out', 'text_out'],
  'input_variable': ['out'],
  'input_constant': ['out'],
  'agent': ['out', 'text_out'],
  'critic': ['critique_out'],
  'scheduler': ['out'],
  'tool_agent': ['out', 'tool_out'],
  'prompt_template': ['prompt_out'],
  'prompt_merge': ['out'],
  'context_merge': ['out'],
  'context_trim': ['out'],
  'rag_search': ['results_out', 'context_out'],
  'wiki_query': ['results_out', 'context_out'],
  'bible_query': ['results_out', 'context_out'],
  'narrative_query': ['results_out', 'context_out'],
  'soul_query': ['results_out', 'context_out'],
  'mcp_tool': ['result_out', 'text_out'],
  'workspace_read': ['content_out', 'doc_out'],
  'workspace_write': ['out'],
  'web_search': ['results_out'],
  'fanout': ['out'],
  'barrier': ['out'],
  'condition': ['true_out', 'false_out'],
  'switch_node': ['out'],
  'wait': ['out'],
  'retry': ['out'],
  'loop_controller': ['out', 'exit_out'],
  'checkpoint': ['out'],
  'subflow': ['out'],
  'boolean_judge': ['true_out', 'false_out'],
  'score_judge': ['pass_out', 'fail_out'],
  'llm_judge': ['pass_out', 'fail_out'],
  'consensus': ['pass_out', 'fail_out'],
  'text_merge': ['out'],
  'critique_aggregate': ['brief_out'],
  'human_confirm': ['approve_out', 'reject_out', 'edit_out'],
  'human_edit': ['approve_out', 'reject_out', 'edit_out'],
  'artifact': ['artifact_out'],
  'save_snapshot': ['artifact_out'],
  'archive_version': ['out'],
  'final_output': [],
  'text_output': ['out'],
  'file_output': ['out']
}

function migrateNodeType(type) {
  if (!type) return 'agent'
  if (LEGACY_NODE_TYPE_MAP[type]) return LEGACY_NODE_TYPE_MAP[type]
  return type
}

function migrateEdgeType(type) {
  if (!type) return 'normal'
  if (['normal', 'condition', 'loop', 'human_approval'].includes(type)) return type
  if (LEGACY_EDGE_TYPE_MAP[type]) return LEGACY_EDGE_TYPE_MAP[type]
  return 'normal'
}

function getNodeInputHandles(nodeType) {
  const type = migrateNodeType(nodeType)
  const handles = new Set(NODE_INPUT_HANDLES[type] || ['in'])
  handles.add('in')
  if (type === 'agent') handles.add('context_in')
  return handles
}

function getNodeOutputHandles(nodeType) {
  const type = migrateNodeType(nodeType)
  const handles = new Set(NODE_OUTPUT_HANDLES[type] || ['out'])
  handles.add('out')
  handles.add('text_out')
  return handles
}

function migrateWorkflow(workflow) {
  if (!workflow || typeof workflow !== 'object') {
    return {
      name: '未命名工作流',
      mode: 'canvas',
      nodes: [],
      edges: [],
      limits: { max_agents: 20, max_parallel: 5, max_loop: 10 },
      runtimeConfig: {
        defaultModel: 'deepseek-chat',
        maxNodesPerRun: 50,
        allowLoop: true,
        allowParallel: true,
        timeoutMs: 300000,
        saveRunHistory: true,
        maxConcurrency: 3
      },
      knowledge_binding: { enabled: false },
      schema_version: 2
    }
  }

  const nodes = Array.isArray(workflow.nodes)
    ? workflow.nodes.map((n, i) => {
        const rawType = n?.data?.nodeType || n?.type || 'agent'
        const nodeType = migrateNodeType(rawType)
        return {
          ...n,
          id: String(n?.id || `node_${Date.now()}_${i}`),
          type: nodeType,
          position: {
            x: Number(n?.position?.x ?? 80 + i * 220),
            y: Number(n?.position?.y ?? 110)
          },
          data: {
            ...n?.data,
            label: n?.data?.label || n?.label || nodeType,
            nodeType,
            agent_id: n?.data?.agent_id || n?.agent_id,
            agent_name: n?.data?.agent_name || n?.agent_name,
            requiresReview: nodeType === 'human_confirm' ? (n?.data?.requiresReview ?? true) : n?.data?.requiresReview
          }
        }
      })
    : []

  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const edges = Array.isArray(workflow.edges)
    ? workflow.edges.map((e, i) => {
        const sourceId = String(e?.source || '')
        const targetId = String(e?.target || '')
        if (!sourceId || !targetId || !nodeMap.has(sourceId) || !nodeMap.has(targetId)) {
          return null
        }
        const sourceNode = nodeMap.get(sourceId)
        const targetNode = nodeMap.get(targetId)
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

        let edgeData = { ...(e?.data || {}) }
        if (edgeType === 'loop') {
          const existingMaxRounds = Number(edgeData?.condition?.maxRounds || e?.condition?.maxRounds || 0)
          if (!existingMaxRounds || existingMaxRounds < 1 || existingMaxRounds > 10) {
            edgeData.condition = {
              maxRounds: Number(workflow?.limits?.max_loop || 3),
              onLimitReached: e?.condition?.onLimitReached || edgeData?.condition?.onLimitReached || 'continue'
            }
          } else if (!edgeData.condition) {
            edgeData.condition = e?.condition
          }
        }

        return {
          ...e,
          id: String(e?.id || `edge_${Date.now()}_${i}`),
          source: sourceId,
          target: targetId,
          sourceHandle,
          targetHandle,
          type: edgeType,
          data: edgeData,
          animated: e?.animated !== undefined ? e.animated : (edgeType === 'loop')
        }
      }).filter(Boolean)
    : []

  const limits = {
    max_agents: Number(workflow?.limits?.max_agents || 20),
    max_parallel: Number(workflow?.limits?.max_parallel || 5),
    max_loop: Number(workflow?.limits?.max_loop || 3)
  }

  return {
    ...workflow,
    nodes,
    edges,
    limits,
    schema_version: 2
  }
}

function nodeHasAIRole(nodeType, capabilities) {
  const aiTypes = ['agent', 'critic', 'scheduler', 'tool_agent', 'llm_judge']
  return aiTypes.includes(nodeType) || capabilities.some(c => AI_RESOURCE_CAPABILITIES.has(c))
}

function validateWorkflow(workflow, context = {}) {
  const errors = []
  const warnings = []
  const migratedWorkflow = migrateWorkflow(workflow)
  const nodes = Array.isArray(migratedWorkflow?.nodes) ? migratedWorkflow.nodes : []
  const edges = Array.isArray(migratedWorkflow?.edges) ? migratedWorkflow.edges : []

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
    if (['final_output', 'text_output', 'file_output', 'save_snapshot', 'archive_version'].includes(t) || ARCHIVE_NODE_TYPES.has(t)) {
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
      errors.push(makeWarning('error', `连线引用了不存在的源节点: ${edge.source}`, null, null, edge.id))
      continue
    }
    if (!target) {
      errors.push(makeWarning('error', `连线引用了不存在的目标节点: ${edge.target}`, null, null, edge.id))
      continue
    }
    if (edge.source === edge.target) {
      errors.push(makeWarning('error', '节点不能连接到自己', edge.source, null, edge.id))
      continue
    }

    const sourceType = String(source.data?.nodeType || source.type || '')
    const targetType = String(target.data?.nodeType || target.type || '')
    const validSourceHandles = getNodeOutputHandles(sourceType)
    const validTargetHandles = getNodeInputHandles(targetType)

    const sourceHandle = edge.sourceHandle || 'out'
    const targetHandle = edge.targetHandle || 'in'

    if (!validSourceHandles.has(sourceHandle)) {
      errors.push(makeWarning('error',
        `连线起点「${source.data?.label || source.id}」的端口「${sourceHandle}」不存在，已自动修正为默认端口`,
        source.id,
        [{ label: '自动修复端口', action: 'migrate_workflow' }],
        edge.id
      ))
    }

    if (!validTargetHandles.has(targetHandle)) {
      errors.push(makeWarning('error',
        `连线终点「${target.data?.label || target.id}」的端口「${targetHandle}」不存在，已自动修正为默认端口`,
        target.id,
        [{ label: '自动修复端口', action: 'migrate_workflow' }],
        edge.id
      ))
    }

    if (sourceType === 'condition') {
      if (sourceHandle !== 'true_out' && sourceHandle !== 'false_out') {
        errors.push(makeWarning('error',
          '条件判断节点的输出端口必须是「条件成立」或「条件不成立」',
          source.id,
          null,
          edge.id
        ))
      }
    }

    if (sourceType === 'human_confirm' || sourceType === 'human_review' || sourceType === 'human_edit') {
      if (sourceHandle !== 'approve_out' && sourceHandle !== 'reject_out' && sourceHandle !== 'edit_out') {
        errors.push(makeWarning('error',
          '人工确认节点的输出端口必须是「通过」「驳回」或「修改后」',
          source.id,
          null,
          edge.id
        ))
      }
    }

    if (sourceType === 'loop_controller' || sourceType === 'loop') {
      if (sourceHandle !== 'out' && sourceHandle !== 'exit_out') {
        errors.push(makeWarning('error',
          '循环控制器的输出端口必须是「循环体」或「退出循环」',
          source.id,
          null,
          edge.id
        ))
      }
    }
  }

  const visited = new Set()
  const inStack = new Set()
  const invalidCycles = []
  const loopEdges = []
  const normalEdges = []
  for (const e of edges) {
    if (e.type === 'loop') {
      loopEdges.push(e)
    } else {
      normalEdges.push(e)
    }
  }

  const loopSet = new Set(loopEdges.map(e => `${e.source}->${e.target}`))
  function hasCycle(nodeId, path = [], edgePath = []) {
    if (inStack.has(nodeId)) {
      const cycleStart = path.indexOf(nodeId)
      const cycleNodes = path.slice(cycleStart)
      const cycleEdges = []
      for (let i = 0; i < cycleNodes.length; i++) {
        const from = cycleNodes[i]
        const to = cycleNodes[(i + 1) % cycleNodes.length]
        const edgeId = `${from}->${to}`
        if (!loopSet.has(edgeId)) {
          cycleEdges.push({ from, to })
        }
      }
      if (cycleEdges.length > 0) {
        invalidCycles.push({ nodes: cycleNodes, edges: cycleEdges })
        return true
      }
      return false
    }
    if (visited.has(nodeId)) return false
    visited.add(nodeId)
    inStack.add(nodeId)
    const out = (outgoing.get(nodeId) || []).filter(e => e.type !== 'loop')
    for (const e of out) {
      if (hasCycle(e.target, [...path, nodeId], [...edgePath, e.id])) return true
    }
    inStack.delete(nodeId)
    return false
  }
  for (const n of nodes) {
    hasCycle(n.id)
  }

  for (const cycle of invalidCycles) {
    const cycleDesc = cycle.nodes.map(nid => {
      const n = nodeById.get(nid)
      return n?.data?.label || nid
    }).join(' → ')
    errors.push(makeWarning('error',
      `该工作流包含非法闭环：${cycleDesc}。请使用loop类型的连线创建受控循环并设置轮数上限。`,
      cycle.nodes[0]
    ))
  }

  const maxLoop = Number(migratedWorkflow?.limits?.max_loop || 3)
  for (const loopEdge of loopEdges) {
    const source = nodeById.get(loopEdge.source)
    const target = nodeById.get(loopEdge.target)
    if (!source || !target) {
      errors.push(makeWarning('error', `循环连线引用了不存在的节点`, null, null, loopEdge.id))
      continue
    }
    if (loopEdge.source === loopEdge.target) {
      errors.push(makeWarning('error', '循环连线的起点和终点不能是同一个节点', loopEdge.source, null, loopEdge.id))
      continue
    }
    const sourceLabel = source?.data?.label || source.id
    const targetLabel = target?.data?.label || target.id
    const edgeMaxRounds = Number(
      loopEdge?.condition?.maxRounds
      || loopEdge?.data?.condition?.maxRounds
      || maxLoop
      || 3
    )
    if (!edgeMaxRounds || edgeMaxRounds < 1 || edgeMaxRounds > 10) {
      warnings.push(makeWarning('warning',
        `循环连线 ${sourceLabel}→${targetLabel} 的轮数设置异常(${edgeMaxRounds})，已自动设为默认值3轮`,
        source.id,
        [{ label: '调整循环上限' }],
        loopEdge.id
      ))
    }
    const validatedRounds = Math.max(1, Math.min(10, edgeMaxRounds || maxLoop || 3))
    warnings.push(makeWarning('info',
      `检测到受控循环：${sourceLabel} → ${targetLabel}，最多 ${validatedRounds} 轮。`,
      source.id,
      null,
      loopEdge.id
    ))
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
      loopEdgeCount: loopEdges.length,
      maxLoop: Math.max(1, Math.min(10, maxLoop || 3)),
      startNodeCount,
      outputNodeCount,
      orphanCount: orphanNodes.length,
      writebackBindingCount: writebackBindings.length,
      credentialFindings: nodes.reduce((acc, n) => acc + scanForCredentials(n.data || {}).length, 0)
    },
    migratedWorkflow
  }
}

function compileWorkflow(workflow, context = {}) {
  const validation = validateWorkflow(workflow, context)
  const migratedWorkflow = validation.migratedWorkflow || migrateWorkflow(workflow)

  const migratedNodes = Array.isArray(migratedWorkflow?.nodes)
    ? migratedWorkflow.nodes.map(n => {
        const { data, migrated, legacyConfig } = migrateLegacyNodeConfig(n.data)
        return { ...n, data }
      })
    : []

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
    edges: Array.isArray(migratedWorkflow.edges) ? migratedWorkflow.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: e.type || 'normal',
      label: e.label,
      data: e.data,
      animated: e.animated
    })) : [],
    entryNodes: migratedNodes.filter(n => n.data?.isStart || (validation.stats.startNodeCount === 0 && !migratedWorkflow.edges?.some(e => e.target === n.id))).map(n => n.id),
    validation
  }

  return compiled
}

module.exports = {
  validateWorkflow,
  compileWorkflow,
  migrateWorkflow,
  makeWarning,
  getNodeInputHandles,
  getNodeOutputHandles,
  migrateNodeType,
  migrateEdgeType
}
