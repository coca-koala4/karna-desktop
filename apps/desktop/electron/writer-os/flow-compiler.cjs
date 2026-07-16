'use strict'

const { compileWorkflow, validateWorkflow } = require('./workflow-validation.cjs')
const { migrateLegacyNodeConfig, resolveNodeModel, resolveNodeSkills, resolveNodeMcp, resolveNodeTools, resolveNodeBudget, resolveRetryConfig, resolveTimeoutConfig, resolveReviewConfig, scanForCredentials } = require('./node-resource-resolvers.cjs')
const { buildNodeContextPackage, formatContextForPrompt, estimateTokens } = require('./node-context-builder.cjs')
const { checkToolPermission, checkWritebackPermission, createWritebackProposal, recordAudit, getAuditLog } = require('./tool-permission-gateway.cjs')
const { getNodeDefinition, isArchiveNode, isAgentNode, getNodeCapabilities } = require('./node-capabilities.cjs')
const { renderPrompt, renderPromptWithFallback, estimateTokens: estimatePromptTokens, substituteVariables } = require('./prompt-renderer.cjs')

function prepareNodeForExecution({ node, workflow, project, agent, input, upstream, group, systemDefault, systemContextLength, availableModels, services }) {
  const nodeData = node?.data || {}
  const nodeType = String(nodeData.nodeType || node.type || '')
  const nodeDef = getNodeDefinition(nodeType)

  const { data: migratedData, migrated, legacyConfig } = migrateLegacyNodeConfig(nodeData)

  const resolvedModel = resolveNodeModel({
    node: { ...node, data: migratedData }, workflow, group, systemDefault, agent, input, availableModels
  })

  const resolvedSkills = resolveNodeSkills({ node: { ...node, data: migratedData }, workflow, group })
  const resolvedPlugins = resolveNodePlugins({ node: { ...node, data: migratedData }, workflow, group })
  const resolvedMcp = resolveNodeMcp({ node: { ...node, data: migratedData }, workflow, group })
  const resolvedTools = resolveNodeTools({ node: { ...node, data: migratedData }, workflow, group })
  const resolvedBudget = resolveNodeBudget({
    node: { ...node, data: migratedData },
    workflow,
    model: resolvedModel,
    systemDefault,
    systemContextLength
  })
  const retryConfig = resolveRetryConfig({ node: { ...node, data: migratedData } })
  const timeoutConfig = resolveTimeoutConfig({ node: { ...node, data: migratedData } })
  const reviewConfig = resolveReviewConfig({ node: { ...node, data: migratedData } })

  return {
    nodeId: node.id,
    nodeType,
    nodeLabel: migratedData.label || node.id,
    capabilities: nodeDef.capabilities,
    isArchive: nodeDef.isArchive,
    isAgent: nodeDef.isAgent,
    isHuman: nodeDef.isHuman,
    config: migratedData,
    legacyConfig,
    migrated,
    resolvedModel,
    resolvedSkills,
    resolvedPlugins,
    resolvedMcp,
    resolvedTools,
    resolvedBudget,
    retryConfig,
    timeoutConfig,
    reviewConfig
  }
}

async function buildNodeExecutionContext({ prepared, project, workflow, node, agent, input, upstream, services }) {
  if (prepared.isArchive) {
    return {
      contextPackage: { excerpts: [], citations: [], tokenEstimate: 0, warnings: [], sourceSummary: {} },
      contextText: '',
      warnings: []
    }
  }

  const query = String(input?.input || input?.text || input?.prompt || '').slice(0, 2000)
  const contextPackage = await buildNodeContextPackage({
    project,
    workflow,
    node: {
      ...node,
      data: {
        ...prepared.config,
        contextConfig: {
          ...(prepared.config.contextConfig || {}),
          maxContextTokens: prepared.resolvedBudget.maxContextTokens,
          contextBudgetMode: prepared.resolvedBudget.contextBudgetMode
        }
      }
    },
    agent,
    input,
    upstream,
    services,
    query
  })

  const contextText = formatContextForPrompt(contextPackage)

  return {
    contextPackage,
    contextText,
    warnings: contextPackage.warnings || []
  }
}

function resolveNodePlugins({ node, workflow, group }) {
  const nodeData = node?.data || {}
  const config = nodeData.pluginsConfig
  if (!config) return { mode: 'auto', selectedIds: [] }
  if (config.mode === 'disabled') return { mode: 'disabled', selectedIds: [] }
  if (config.mode === 'explicit') return { mode: 'explicit', selectedIds: Array.isArray(config.selectedIds) ? config.selectedIds : [] }
  if (config.mode === 'auto') return { mode: 'auto', selectedIds: [] }
  const inherited = group?.pluginsConfig?.selectedIds || []
  return { mode: 'inherit', selectedIds: Array.isArray(inherited) ? inherited : [] }
}

function buildNodePrompt({ prepared, project, workflow, node, agent, upstream, input, contextText, contextPackage, artifactState, reviewState, loopState }) {
  try {
    const nodeData = prepared.config
    const promptConfig = nodeData.promptConfig

    const nodeInputs = {
      text: typeof input === 'string' ? input : (input?.input || input?.text || input?.prompt || '')
    }

    const nodeInfo = {
      name: prepared.nodeLabel,
      task: nodeData.description || nodeData.task || agent?.duties || agent?.tagline || ''
    }

    const workflowInfo = {
      name: workflow?.name || workflow?.id || '',
      variables: workflow?.variables || {}
    }

    let upstreamOutputs = {}
    if (upstream) {
      if (typeof upstream === 'string') {
        upstreamOutputs = { default: upstream }
      } else if (typeof upstream === 'object') {
        upstreamOutputs = upstream
      }
    }

    const runtimeState = {
      date: new Date().toISOString(),
      workspaceName: project?.name || project?.title || ''
    }

    let renderResult
    if (promptConfig && Object.keys(promptConfig).length > 0) {
      renderResult = renderPrompt({
        promptConfig,
        nodeInputs,
        workflowVariables: workflowInfo.variables,
        contextPackage,
        runtimeState,
        upstreamOutputs,
        loopState,
        artifactState,
        reviewState,
        node: nodeInfo,
        workflow: workflowInfo
      })
    } else {
      renderResult = renderPromptWithFallback({
        promptConfig: null,
        nodeInputs,
        workflowVariables: workflowInfo.variables,
        contextPackage,
        runtimeState,
        upstreamOutputs,
        loopState,
        artifactState,
        reviewState,
        node: nodeInfo,
        workflow: workflowInfo
      })
    }

    const fullPrompt = [renderResult.systemPrompt, renderResult.taskPrompt].filter(Boolean).join('\n\n')

    return {
      systemPrompt: renderResult.systemPrompt,
      taskPrompt: renderResult.taskPrompt,
      fullPrompt,
      tokenEstimate: renderResult.estimatedTokens,
      renderedVariables: renderResult.resolvedVariables,
      missingVariables: renderResult.missingVariables,
      sourceSections: renderResult.sourceSections
    }
  } catch (err) {
    const fallbackText = buildNodePromptLegacy({ prepared, project, workflow, node, agent, upstream, input, contextText })
    return {
      systemPrompt: '',
      taskPrompt: fallbackText,
      fullPrompt: fallbackText,
      tokenEstimate: estimatePromptTokens(fallbackText),
      renderedVariables: {},
      missingVariables: [],
      sourceSections: {
        systemPrompt: { template: 'fallback', tokenEstimate: 0 },
        taskPrompt: { template: 'legacy', tokenEstimate: estimatePromptTokens(fallbackText) },
        context: { hasContent: Boolean(contextText), tokenEstimate: 0 },
        outputInstruction: { hasContent: false, tokenEstimate: 0 }
      },
      error: err.message
    }
  }
}

function buildNodePromptLegacy({ prepared, project, workflow, node, agent, upstream, input, contextText }) {
  const nodeData = prepared.config
  const permissions = normalizePermissions(agent?.permissions || {})
  const resourceLines = []

  if (prepared.resolvedModel) {
    resourceLines.push(`Node model: ${prepared.resolvedModel}`)
  } else {
    resourceLines.push('Node model: disabled')
  }

  if (prepared.resolvedSkills.mode === 'explicit' && prepared.resolvedSkills.selectedIds.length > 0) {
    resourceLines.push(`Bound skills: ${prepared.resolvedSkills.selectedIds.join(', ')}`)
  } else if (prepared.resolvedSkills.mode === 'auto') {
    resourceLines.push('Skill selection: auto')
  } else if (prepared.resolvedSkills.mode === 'disabled') {
    resourceLines.push('Skills: disabled')
  } else {
    resourceLines.push('Skills: inherited')
  }

  if (prepared.resolvedMcp.mode === 'explicit' && prepared.resolvedMcp.selectedIds.length > 0) {
    resourceLines.push(`Bound MCP/tools: ${prepared.resolvedMcp.selectedIds.join(', ')}`)
  } else if (prepared.resolvedMcp.mode === 'disabled') {
    resourceLines.push('MCP/tools: disabled')
  }

  const soulConfig = nodeData.soulConfig
  if (soulConfig && soulConfig.mode !== 'disabled' && soulConfig.soulId) {
    const attrs = (soulConfig.enabledAttributes || []).join(', ')
    resourceLines.push(`Soul reference: ${soulConfig.soulId} (attributes: ${attrs}) - method reference only, do not imitate`)
  }

  const promptConfig = nodeData.promptConfig || {}
  const rolePrompt = promptConfig.rolePrompt || agent?.role || ''
  const taskPrompt = promptConfig.taskPromptTemplate || agent?.duties || agent?.tagline || ''

  const lines = [
    `Project: ${project?.title || project?.id || ''}`,
    `Workflow: ${workflow?.name || workflow?.id || ''}`,
    `Current node: ${prepared.nodeLabel}`,
    `Agent: ${agent?.name || 'Unnamed Agent'} / ${agent?.role || ''}`,
    rolePrompt ? `Role: ${rolePrompt}` : '',
    taskPrompt ? `Task: ${taskPrompt}` : `Duties: ${agent?.duties || agent?.tagline || ''}`,
    agent?.forbidden ? `Forbidden: ${agent.forbidden}` : '',
    agent?.constraints?.length ? `Hard constraints: ${agent.constraints.join('; ')}` : '',
    resourceLines.length ? `Node resources:\n${resourceLines.join('\n')}` : '',
    `Permissions: ${permissions.canEditDraft ? 'may edit draft' : 'must not edit prose; comments or suggestions only'}; ${permissions.canUseKnowledge ? 'may use knowledge base' : 'do not use knowledge base'}; ${permissions.canReadUpstream ? 'may read upstream output' : 'ignore upstream output'}`,
    `Output format: ${nodeData.outputFormat || agent?.output_format || 'Segmented response'}`,
    `Budget: max output tokens = ${prepared.resolvedBudget.maxOutputTokens}`,
    `User input: ${String(input?.input || input?.text || input?.prompt || '').slice(0, 6000)}`,
    permissions.canReadUpstream && upstream ? `Upstream output: ${String(upstream).slice(0, 8000)}` : permissions.canReadUpstream ? '' : 'Upstream output is not provided',
    contextText ? `\n${contextText}` : '',
    prepared.resolvedSkills.localInstructions ? `\nNode-specific skill instructions: ${prepared.resolvedSkills.localInstructions}` : '',
    soulConfig?.blockDirectImitation !== false ? '\nIMPORTANT: Soul references are for method/critical perspective only. Do NOT directly copy or imitate the Soul\'s writing style, signature phrases, or character voice.' : '',
    'Only complete this node responsibility. Do not talk to other Agents; return everything to the hidden dispatcher.'
  ]
  return lines.filter(Boolean).join('\n')
}

function renderNodePrompt(options) {
  return buildNodePrompt(options)
}

function normalizePermissions(p) {
  return {
    canEditDraft: Boolean(p?.canEditDraft),
    canComment: p?.canComment !== false,
    canUseKnowledge: p?.canUseKnowledge !== false,
    canReadUpstream: p?.canReadUpstream !== false
  }
}

function generateNodeWarnings({ prepared, contextWarnings, credentialFindings }) {
  const warnings = []
  if (prepared.migrated) {
    warnings.push({ severity: 'info', message: '节点配置已从旧版本迁移', code: 'config_migrated' })
  }
  for (const w of contextWarnings || []) {
    warnings.push({ severity: 'warning', message: w, code: 'context_warning' })
  }
  for (const finding of credentialFindings || []) {
    warnings.push({ severity: 'error', message: `配置中包含疑似凭证: ${finding.key}`, code: 'credential_found', path: finding.path })
  }
  if (!prepared.resolvedModel && prepared.isAgent) {
    warnings.push({ severity: 'error', message: 'Agent 节点未配置模型', code: 'no_model' })
  }
  return warnings
}

module.exports = {
  compileWorkflow,
  validateWorkflow,
  prepareNodeForExecution,
  buildNodeExecutionContext,
  buildNodePrompt,
  buildNodePromptLegacy,
  renderNodePrompt,
  estimatePromptTokens,
  checkToolPermission,
  checkWritebackPermission,
  createWritebackProposal,
  recordAudit,
  getAuditLog,
  migrateLegacyNodeConfig,
  resolveNodeModel,
  buildNodeContextPackage,
  formatContextForPrompt,
  estimateTokens,
  generateNodeWarnings,
  getNodeDefinition,
  isArchiveNode,
  isAgentNode,
  getNodeCapabilities,
  scanForCredentials
}
