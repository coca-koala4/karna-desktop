'use strict'

const { positiveInteger, resolveModelContextBudget } = require('../../shared/model-context-budget.cjs')

const SENSITIVE_KEY_PATTERNS = /(api[_-]?key|token|secret|password|credential|auth)/i

function hasSensitiveKeys(obj, path = '') {
  if (!obj || typeof obj !== 'object') return []
  const findings = []
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key
    if (SENSITIVE_KEY_PATTERNS.test(key) && typeof value === 'string' && value.length > 0) {
      findings.push({ path: currentPath, key })
    }
    if (value && typeof value === 'object') {
      findings.push(...hasSensitiveKeys(value, currentPath))
    }
  }
  return findings
}

function autoPickModel({ node, workflow, agent, availableModels, taskComplexity }) {
  const modelList = Array.isArray(availableModels) ? availableModels : []
  if (modelList.length === 0) return null

  const complexity = String(taskComplexity || 'medium')
  const capabilityNeed = complexity === 'high' ? 'reasoning' : complexity === 'low' ? 'fast' : 'balanced'

  const scored = modelList.map(m => {
    let score = 0
    const name = String(m.name || m.id || '').toLowerCase()
    if (capabilityNeed === 'reasoning' && /deepseek-r1|o1|o3|reasoner|claude-3-7|thinking/i.test(name)) score += 10
    if (capabilityNeed === 'fast' && /flash|mini|haiku|fast|quick/i.test(name)) score += 8
    if (capabilityNeed === 'balanced' && /(gpt-4o|claude-3-5|deepseek-v3|qwen2\.5)/i.test(name)) score += 6
    if (m.authenticated !== false) score += 5
    return { model: m, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.model?.id || scored[0]?.model?.name || null
}

function resolveNodeModel({ node, workflow, group, systemDefault, agent, input, availableModels }) {
  const nodeData = node?.data || {}
  const config = nodeData.modelConfig

  if (!config) {
    const legacy = String(nodeData.model || '').trim()
    if (legacy && legacy !== '默认模型' && legacy !== 'default') {
      return legacy
    }
    return agent?.model || input?.model || systemDefault || null
  }

  if (config.mode === 'disabled') return null

  if (config.mode === 'explicit' && config.modelId) {
    return config.modelId
  }

  if (config.mode === 'auto') {
    return autoPickModel({
      node, workflow, agent, availableModels,
      taskComplexity: config.reasoningEffort || 'medium'
    })
  }

  if (config.mode === 'inherit') {
    return group?.modelConfig?.modelId
      || workflow?.runtimeConfig?.defaultModel
      || agent?.model
      || input?.model
      || systemDefault
      || null
  }

  return agent?.model || input?.model || systemDefault || null
}

function resolveNodeSkills({ node, workflow, group }) {
  const nodeData = node?.data || {}
  const config = nodeData.skillsConfig

  if (!config) {
    const legacy = nodeData.skill
    if (legacy && legacy !== '自动' && legacy !== 'auto') {
      return { mode: 'explicit', selectedIds: [legacy], localInstructions: null }
    }
    return { mode: 'auto', selectedIds: [], localInstructions: null }
  }

  if (config.mode === 'disabled') return { mode: 'disabled', selectedIds: [], localInstructions: null }
  if (config.mode === 'explicit') {
    return { mode: 'explicit', selectedIds: Array.isArray(config.selectedIds) ? config.selectedIds : [], localInstructions: config.localInstructions || null }
  }
  if (config.mode === 'auto') return { mode: 'auto', selectedIds: [], localInstructions: config.localInstructions || null }

  const inherited = group?.skillsConfig?.selectedIds
    || workflow?.runtimeConfig?.defaultSkills
    || []
  return { mode: 'inherit', selectedIds: Array.isArray(inherited) ? inherited : [], localInstructions: config.localInstructions || null }
}

function resolveNodePlugins({ node, workflow, group }) {
  const nodeData = node?.data || {}
  const config = nodeData.pluginsConfig

  if (!config) {
    const legacy = nodeData.plugin
    if (legacy && legacy !== '自动' && legacy !== 'auto') {
      return { mode: 'explicit', selectedIds: [legacy] }
    }
    return { mode: 'auto', selectedIds: [] }
  }

  if (config.mode === 'disabled') return { mode: 'disabled', selectedIds: [] }
  if (config.mode === 'explicit') {
    return { mode: 'explicit', selectedIds: Array.isArray(config.selectedIds) ? config.selectedIds : [] }
  }
  if (config.mode === 'auto') return { mode: 'auto', selectedIds: [] }

  const inherited = group?.pluginsConfig?.selectedIds || []
  return { mode: 'inherit', selectedIds: Array.isArray(inherited) ? inherited : [] }
}

function resolveNodeMcp({ node, workflow, group }) {
  const nodeData = node?.data || {}
  const config = nodeData.mcpConfig

  if (!config) {
    const legacy = nodeData.mcp
    if (legacy && legacy !== '自动' && legacy !== 'auto') {
      return { mode: 'explicit', selectedIds: [legacy] }
    }
    return { mode: 'auto', selectedIds: [] }
  }

  if (config.mode === 'disabled') return { mode: 'disabled', selectedIds: [] }
  if (config.mode === 'explicit') {
    return { mode: 'explicit', selectedIds: Array.isArray(config.selectedIds) ? config.selectedIds : [] }
  }
  if (config.mode === 'auto') return { mode: 'auto', selectedIds: [] }

  const inherited = group?.mcpConfig?.selectedIds
    || workflow?.runtimeConfig?.defaultMcp
    || []
  return { mode: 'inherit', selectedIds: Array.isArray(inherited) ? inherited : [] }
}

function resolveNodeTools({ node, workflow, group }) {
  const nodeData = node?.data || {}
  const config = nodeData.toolsConfig

  if (!config) return { mode: 'auto', selectedIds: [] }
  if (config.mode === 'disabled') return { mode: 'disabled', selectedIds: [] }
  if (config.mode === 'explicit') {
    return { mode: 'explicit', selectedIds: Array.isArray(config.selectedIds) ? config.selectedIds : [] }
  }
  if (config.mode === 'auto') return { mode: 'auto', selectedIds: [] }

  const inherited = group?.toolsConfig?.selectedIds || []
  return { mode: 'inherit', selectedIds: Array.isArray(inherited) ? inherited : [] }
}

function resolveNodeBudget({ node, workflow, model, systemDefault, systemContextLength }) {
  const nodeData = node?.data || {}
  const budgetConfig = nodeData.budgetConfig || {}
  const workflowLimits = workflow?.limits || workflow?.runtimeConfig?.limits || {}
  const sameAsSystemModel = !model || !systemDefault || String(model) === String(systemDefault)
  const contextBudget = resolveModelContextBudget({
    model,
    configuredContextLength: sameAsSystemModel ? systemContextLength : 0,
    outputReserveTokens: budgetConfig.maxOutputTokens || workflowLimits.max_output_tokens,
    workflowContextRatio: workflow?.runtimeConfig?.workflowContextRatio
  })

  const explicitOutput = positiveInteger(budgetConfig.maxOutputTokens || workflowLimits.max_output_tokens)
  const maxOutputTokens = explicitOutput || contextBudget.outputReserveTokens
  const explicitInput = positiveInteger(budgetConfig.maxInputTokens || workflowLimits.max_input_tokens)
  const maxInputTokens = explicitInput || Math.max(1_000, contextBudget.effectiveContextTokens - maxOutputTokens - contextBudget.safetyReserveTokens)

  const rawContextLimit = positiveInteger(
    budgetConfig.maxContextTokens
      || nodeData.contextConfig?.maxContextTokens
      || workflowLimits.max_context_tokens
  )
  const explicitlyManual = budgetConfig.contextBudgetMode === 'manual'
    || nodeData.contextConfig?.contextBudgetMode === 'manual'
  // 16K was the historical implicit default. Treat it as automatic unless a
  // workflow explicitly marks it manual, so existing nodes gain model-aware
  // budgets without requiring users to recreate them.
  const explicitContext = rawContextLimit === 16_000 && !explicitlyManual ? 0 : rawContextLimit
  const maxContextTokens = Math.min(
    maxInputTokens,
    explicitContext || Math.floor(maxInputTokens * 0.6)
  )

  return {
    maxInputTokens,
    maxOutputTokens,
    maxContextTokens,
    maxToolCalls: budgetConfig.maxToolCalls || workflowLimits.max_tool_calls || 10,
    maxRetries: budgetConfig.maxRetries || 2,
    contextBudgetMode: explicitContext ? 'manual' : 'auto',
    modelContextLength: contextBudget.effectiveContextTokens,
    modelContextSource: contextBudget.source
  }
}

function resolveRetryConfig({ node }) {
  const nodeData = node?.data || {}
  const retry = nodeData.retryConfig || {}
  return {
    maxRetries: typeof retry.maxRetries === 'number' ? retry.maxRetries : 2,
    retryOnRecoverable: retry.retryOnRecoverable !== false,
    backoffMs: retry.backoffMs || 1000
  }
}

function resolveTimeoutConfig({ node }) {
  const nodeData = node?.data || {}
  const timeout = nodeData.timeoutConfig || {}
  return {
    timeoutMs: timeout.timeoutMs || 300000,
    onTimeout: timeout.onTimeout || 'fail'
  }
}

function resolveReviewConfig({ node }) {
  const nodeData = node?.data || {}
  const review = nodeData.reviewConfig || {}
  return {
    requiresReview: review.requiresReview !== false,
    reviewPrompt: review.reviewPrompt || nodeData.reviewPrompt || '',
    autoApproveOnTimeout: review.autoApproveOnTimeout || false,
    timeoutMs: review.timeoutMs || 300000
  }
}

function migrateLegacyNodeConfig(nodeData) {
  if (!nodeData || typeof nodeData !== 'object') return { data: nodeData, legacyConfig: {}, migrated: false }

  const legacyConfig = {}
  const migrated = { ...nodeData }
  let hadMigration = false

  if (nodeData.model && !nodeData.modelConfig) {
    legacyConfig.model = nodeData.model
    const modelVal = String(nodeData.model).trim()
    if (modelVal && modelVal !== '默认模型' && modelVal !== 'default') {
      migrated.modelConfig = { mode: 'explicit', modelId: modelVal, streaming: true }
    } else {
      migrated.modelConfig = { mode: 'inherit', streaming: true }
    }
    hadMigration = true
  }

  if (nodeData.skill && !nodeData.skillsConfig) {
    legacyConfig.skill = nodeData.skill
    const skillVal = String(nodeData.skill).trim()
    if (skillVal && skillVal !== '自动' && skillVal !== 'auto') {
      migrated.skillsConfig = { mode: 'explicit', selectedIds: [skillVal] }
    } else {
      migrated.skillsConfig = { mode: 'auto', selectedIds: [] }
    }
    hadMigration = true
  }

  if (nodeData.plugin && !nodeData.pluginsConfig) {
    legacyConfig.plugin = nodeData.plugin
    const pluginVal = String(nodeData.plugin).trim()
    if (pluginVal && pluginVal !== '自动' && pluginVal !== 'auto') {
      migrated.pluginsConfig = { mode: 'explicit', selectedIds: [pluginVal] }
    } else {
      migrated.pluginsConfig = { mode: 'auto', selectedIds: [] }
    }
    hadMigration = true
  }

  if (nodeData.mcp && !nodeData.mcpConfig) {
    legacyConfig.mcp = nodeData.mcp
    const mcpVal = String(nodeData.mcp).trim()
    if (mcpVal && mcpVal !== '自动' && mcpVal !== 'auto') {
      migrated.mcpConfig = { mode: 'explicit', selectedIds: [mcpVal] }
    } else {
      migrated.mcpConfig = { mode: 'auto', selectedIds: [] }
    }
    hadMigration = true
  }

  if (nodeData.knowledge && !nodeData.contextConfig) {
    legacyConfig.knowledge = nodeData.knowledge
    const knowledgeVal = String(nodeData.knowledge).trim()
    migrated.contextConfig = {
      inheritWorkflowContext: true,
      inheritGroupContext: true,
      bindings: knowledgeVal ? [{
        id: `ctx_legacy_${Date.now()}`,
        sourceType: 'vector_collection',
        sourceId: knowledgeVal,
        enabled: true,
        priority: 0,
        injectAs: 'system_context',
        retrieval: { topK: 5, minScore: 0.7, searchMode: 'hybrid', rerank: true }
      }] : [],
      mergePolicy: 'priority',
      conflictPolicy: 'prefer_verified',
      maxContextTokens: 0,
      contextBudgetMode: 'auto'
    }
    hadMigration = true
  }

  if (nodeData.soul && !nodeData.soulConfig) {
    legacyConfig.soul = nodeData.soul
    const soulVal = String(nodeData.soul).trim()
    if (soulVal) {
      migrated.soulConfig = {
        mode: 'explicit',
        soulId: soulVal,
        usageMode: 'method_reference',
        enabledAttributes: ['narrative_methods', 'critic_lens'],
        influenceStrength: 0.5,
        blockDirectImitation: true,
        blockSignaturePhrases: true,
        blockCharacterReplication: true
      }
    }
    hadMigration = true
  }

  if (nodeData.requiresReview !== undefined && !nodeData.reviewConfig) {
    legacyConfig.requiresReview = nodeData.requiresReview
    migrated.reviewConfig = {
      requiresReview: Boolean(nodeData.requiresReview),
      reviewPrompt: nodeData.reviewPrompt || '',
      autoApproveOnTimeout: false,
      timeoutMs: 300000
    }
    hadMigration = true
  }

  if (hadMigration) {
    migrated.legacyConfig = legacyConfig
  }

  return { data: migrated, legacyConfig, migrated: hadMigration }
}

function scanForCredentials(nodeData) {
  return hasSensitiveKeys(nodeData)
}

module.exports = {
  resolveNodeModel,
  resolveNodeSkills,
  resolveNodePlugins,
  resolveNodeMcp,
  resolveNodeTools,
  resolveNodeBudget,
  resolveRetryConfig,
  resolveTimeoutConfig,
  resolveReviewConfig,
  migrateLegacyNodeConfig,
  scanForCredentials,
  autoPickModel,
  hasSensitiveKeys
}
