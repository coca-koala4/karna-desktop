'use strict'

const CHINESE_TOKEN_RATIO = 1.5
const ENGLISH_TOKEN_RATIO = 0.25
const MIXED_TOKEN_RATIO = 0.7

const CREDENTIAL_PATTERNS = [
  /(api[_-]?key|apikey|secret[_-]?key|sk[_-]?|password|passwd|pwd|token|auth[_-]?token|access[_-]?token|private[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_\-]{8,}["']?/gi,
  /(sk-[A-Za-z0-9]{20,})/gi,
  /(Bearer\s+[A-Za-z0-9_\-\.]{20,})/gi,
  /(-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----)/gi
]

const DEFAULT_PROMPT_CONFIG = {
  mode: 'inherit',
  systemPrompt: '',
  rolePrompt: '',
  taskPromptTemplate: '',
  createPromptTemplate: '',
  continuePromptTemplate: '',
  revisionPromptTemplate: '',
  evaluationPromptTemplate: '',
  aggregationPromptTemplate: '',
  contextInjectionTemplate: '',
  outputInstructionTemplate: '',
  repairPromptTemplate: '',
  variables: [],
  missingVariablePolicy: 'empty',
  mergeMode: 'sections',
  version: 1
}

const DEFAULT_CONTEXT_TEMPLATE = `--- 上下文参考 ---
{{#each excerpts}}
### [{{sourceType}}] {{title}}
{{text}}
{{#if truncated}}(内容已截断){{/if}}
{{/each}}
{{#if citations.length}}
--- 引用来源 ---
{{#each citations}}
- [{{sourceType}}] {{title}}
{{/each}}
{{/if}}`

function estimateTokens(text) {
  if (!text) return 0
  const str = String(text)
  if (!str.length) return 0

  let chineseCount = 0
  let englishCount = 0
  let otherCount = 0

  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i)
    if (code >= 0x4e00 && code <= 0x9fff) {
      chineseCount++
    } else if ((code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      englishCount++
    } else {
      otherCount++
    }
  }

  const chineseTokens = chineseCount * CHINESE_TOKEN_RATIO
  const englishTokens = englishCount * ENGLISH_TOKEN_RATIO
  const otherTokens = otherCount * MIXED_TOKEN_RATIO

  return Math.ceil(chineseTokens + englishTokens + otherTokens)
}

function detectAndRedactCredentials(value) {
  if (typeof value !== 'string') return value
  let result = value
  for (const pattern of CREDENTIAL_PATTERNS) {
    result = result.replace(pattern, (match) => {
      return '[REDACTED]'
    })
  }
  return result
}

function isSensitiveVariable(name) {
  const lowerName = String(name).toLowerCase()
  const sensitiveKeywords = ['key', 'token', 'secret', 'password', 'pwd', 'credential', 'auth', 'private']
  return sensitiveKeywords.some(kw => lowerName.includes(kw))
}

function safeGet(obj, path, defaultValue) {
  if (obj == null) return defaultValue
  const parts = String(path).split('.')
  let current = obj
  for (const part of parts) {
    if (current == null) return defaultValue
    current = current[part]
  }
  return current === undefined ? defaultValue : current
}

function extractVariableNames(template) {
  if (!template) return []
  const regex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g
  const names = []
  let match
  while ((match = regex.exec(template)) !== null) {
    if (!names.includes(match[1])) {
      names.push(match[1])
    }
  }
  return names
}

function buildVariableMap({ nodeInputs, workflowVariables, contextPackage, runtimeState, upstreamOutputs, loopState, artifactState, reviewState, node, workflow }) {
  const varMap = {}

  varMap['input'] = nodeInputs?.text || nodeInputs?.input || ''
  varMap['input.text'] = nodeInputs?.text || nodeInputs?.input || ''
  varMap['input.document'] = nodeInputs?.document || nodeInputs?.text || ''

  if (node) {
    varMap['node.name'] = node.name || node.label || node.id || ''
    varMap['node.task'] = node.task || node.description || ''
    varMap['node.id'] = node.id || ''
  }

  if (upstreamOutputs && typeof upstreamOutputs === 'object') {
    for (const [nodeId, output] of Object.entries(upstreamOutputs)) {
      varMap[`node.upstream.${nodeId}.output`] = typeof output === 'string' ? output : JSON.stringify(output)
    }
  }

  if (workflow) {
    varMap['workflow.name'] = workflow.name || workflow.id || ''
    varMap['workflow.id'] = workflow.id || ''
  }

  if (workflowVariables && typeof workflowVariables === 'object') {
    for (const [key, value] of Object.entries(workflowVariables)) {
      varMap[`workflow.variables.${key}`] = value
    }
  }

  if (contextPackage) {
    varMap['context.rag'] = formatContextExcerpts(contextPackage, 'vector_collection')
    varMap['context.living_wiki'] = formatContextExcerpts(contextPackage, 'living_wiki')
    varMap['context.story_bible'] = formatContextExcerpts(contextPackage, 'story_bible')
    varMap['context.narrative_state'] = formatContextExcerpts(contextPackage, 'narrative_state')
    varMap['context.soul'] = formatContextExcerpts(contextPackage, 'soul_profile')
  }

  if (artifactState) {
    varMap['artifact.content'] = artifactState.content || ''
    varMap['artifact.version'] = artifactState.version || 1
    varMap['artifact.title'] = artifactState.title || ''
  }

  if (reviewState) {
    varMap['review.criteria'] = reviewState.criteria || ''
    varMap['review.revision_brief'] = reviewState.revisionBrief || ''
    varMap['review.previous_report'] = reviewState.previousReport || ''
  }

  if (loopState) {
    varMap['loop.round'] = loopState.round || 1
    varMap['loop.max_rounds'] = loopState.maxRounds || loopState.max_rounds || 1
  }

  if (runtimeState) {
    varMap['runtime.date'] = runtimeState.date || new Date().toISOString().split('T')[0]
    varMap['runtime.workspace_name'] = runtimeState.workspaceName || runtimeState.workspace_name || ''
  }

  return varMap
}

function formatContextExcerpts(contextPackage, sourceType) {
  if (!contextPackage?.excerpts?.length) return ''
  const filtered = contextPackage.excerpts.filter(e => e.sourceType === sourceType)
  if (!filtered.length) return ''
  const lines = []
  for (const excerpt of filtered) {
    lines.push(`### [${excerpt.sourceType}] ${excerpt.title}`)
    lines.push(excerpt.text)
    if (excerpt.truncated) lines.push('(内容已截断)')
    lines.push('')
  }
  return lines.join('\n').trim()
}

function formatContextPackage(contextPackage, template) {
  if (!contextPackage?.excerpts?.length) return ''
  const tmpl = template || DEFAULT_CONTEXT_TEMPLATE

  const excerpts = contextPackage.excerpts || []
  const citations = contextPackage.citations || []

  let result = tmpl

  const excerptSections = []
  for (const excerpt of excerpts) {
    let section = `### [${excerpt.sourceType}] ${excerpt.title}\n${excerpt.text}`
    if (excerpt.truncated) section += '\n(内容已截断)'
    excerptSections.push(section)
  }
  result = result.replace(/\{\{#each excerpts\}\}[\s\S]*?\{\{\/each\}\}/g, excerptSections.join('\n\n'))

  const citationLines = []
  const seen = new Set()
  for (const c of citations) {
    const key = `${c.sourceType}:${c.sourceId}`
    if (!seen.has(key)) {
      seen.add(key)
      citationLines.push(`- [${c.sourceType}] ${c.title}`)
    }
  }
  result = result.replace(/\{\{#if citations\.length\}\}[\s\S]*?\{\{\/if\}\}/g, citationLines.length ? citationLines.join('\n') : '')

  return result.trim()
}

function substituteVariables(template, variableMap, options = {}) {
  if (!template) return { text: '', missingVariables: [] }

  const policy = options.missingVariablePolicy || 'empty'
  const missingVariables = []
  let result = template

  const regex = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g

  result = result.replace(regex, (match, varName) => {
    let value = variableMap[varName]

    if (value === undefined || value === null) {
      const pathParts = varName.split('.')
      let current = variableMap
      let found = true
      for (const part of pathParts) {
        if (current && typeof current === 'object' && part in current) {
          current = current[part]
        } else {
          found = false
          break
        }
      }
      if (found) value = current
    }

    if (value === undefined || value === null) {
      if (!missingVariables.includes(varName)) {
        missingVariables.push(varName)
      }
      switch (policy) {
        case 'error':
          throw new Error(`Missing required variable: ${varName}`)
        case 'keep_placeholder':
          return match
        case 'empty':
        default:
          return ''
      }
    }

    let strValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)

    if (options.enableSecurityCheck !== false) {
      if (isSensitiveVariable(varName)) {
        strValue = detectAndRedactCredentials(strValue)
      }
    }

    return strValue
  })

  return { text: result, missingVariables }
}

function mergePrompts(sections, mergeMode) {
  const validSections = sections.filter(s => s && String(s).trim().length > 0)

  if (!validSections.length) return ''

  switch (mergeMode) {
    case 'replace':
      return validSections[validSections.length - 1]

    case 'prepend':
      return validSections.reverse().join('\n\n')

    case 'append':
      return validSections.join('\n\n')

    case 'sections':
    default:
      return validSections.map((s, i) => {
        const label = getSectionLabel(i, validSections.length)
        return label ? `--- ${label} ---\n${s}` : s
      }).join('\n\n')
  }
}

function getSectionLabel(index, total) {
  const labels = ['平台规则', '工作流配置', '分组配置', '节点配置', '上下文注入', '任务指令', '输出要求']
  if (total <= 3) return ''
  return labels[index] || ''
}

function collectPromptSections(promptConfig, inheritedConfigs = []) {
  const allConfigs = [...inheritedConfigs, promptConfig].filter(Boolean)

  const systemSections = []
  const taskSections = []

  for (const config of allConfigs) {
    if (config.systemPrompt) systemSections.push(config.systemPrompt)
    if (config.rolePrompt) systemSections.push(config.rolePrompt)
  }

  for (const config of allConfigs) {
    if (config.taskPromptTemplate) taskSections.push(config.taskPromptTemplate)
    if (config.createPromptTemplate) taskSections.push(config.createPromptTemplate)
    if (config.continuePromptTemplate) taskSections.push(config.continuePromptTemplate)
    if (config.revisionPromptTemplate) taskSections.push(config.revisionPromptTemplate)
    if (config.evaluationPromptTemplate) taskSections.push(config.evaluationPromptTemplate)
    if (config.aggregationPromptTemplate) taskSections.push(config.aggregationPromptTemplate)
  }

  const nodeConfig = allConfigs[allConfigs.length - 1] || {}
  const mergeMode = nodeConfig.mergeMode || 'sections'

  return { systemSections, taskSections, mergeMode, outputInstruction: nodeConfig.outputInstructionTemplate, repairPrompt: nodeConfig.repairPromptTemplate }
}

function renderPrompt(request) {
  const {
    promptConfig,
    nodeInputs,
    workflowVariables,
    contextPackage,
    runtimeState,
    upstreamOutputs,
    loopState,
    artifactState,
    reviewState,
    node,
    workflow,
    inheritedPromptConfigs = [],
    executionMode = 'create'
  } = request || {}

  const config = promptConfig || DEFAULT_PROMPT_CONFIG
  const variableMap = buildVariableMap({
    nodeInputs,
    workflowVariables,
    contextPackage,
    runtimeState,
    upstreamOutputs,
    loopState,
    artifactState,
    reviewState,
    node,
    workflow
  })

  const declaredVariables = config.variables || []
  const resolvedVariables = {}
  const missingVariables = []

  const combinedVarMap = { ...variableMap }

  if (workflowVariables && typeof workflowVariables === 'object') {
    for (const [key, value] of Object.entries(workflowVariables)) {
      if (!(key in combinedVarMap)) {
        combinedVarMap[key] = value
      }
    }
  }

  for (const varDef of declaredVariables) {
    const name = varDef.name
    let value = combinedVarMap[name]
    if (value === undefined || value === null) {
      if (varDef.defaultValue !== undefined) {
        value = varDef.defaultValue
      } else {
        missingVariables.push(name)
      }
    }
    resolvedVariables[name] = value
    combinedVarMap[name] = value
  }

  const { systemSections, taskSections, mergeMode, outputInstruction, repairPrompt } = collectPromptSections(config, inheritedPromptConfigs)

  const contextText = formatContextPackage(contextPackage, config.contextInjectionTemplate)

  const systemParts = [...systemSections]
  if (contextText) systemParts.push(contextText)

  const taskParts = [...taskSections]
  if (outputInstruction) taskParts.push(outputInstruction)

  const systemTemplate = mergePrompts(systemParts, mergeMode)
  const taskTemplate = mergePrompts(taskParts, mergeMode)

  const subOptions = {
    missingVariablePolicy: config.missingVariablePolicy || 'empty',
    enableSecurityCheck: true
  }

  let systemResult
  let taskResult

  try {
    systemResult = substituteVariables(systemTemplate, combinedVarMap, subOptions)
  } catch (err) {
    systemResult = { text: systemTemplate, missingVariables: [err.message] }
  }

  try {
    taskResult = substituteVariables(taskTemplate, combinedVarMap, subOptions)
  } catch (err) {
    taskResult = { text: taskTemplate, missingVariables: [err.message] }
  }

  const allMissing = [...new Set([...missingVariables, ...systemResult.missingVariables, ...taskResult.missingVariables])]

  const systemPrompt = systemResult.text
  const taskPrompt = taskResult.text

  const estimatedTokens = estimateTokens(systemPrompt) + estimateTokens(taskPrompt)

  const sourceSections = {
    systemPrompt: { template: systemTemplate, tokenEstimate: estimateTokens(systemPrompt) },
    taskPrompt: { template: taskTemplate, tokenEstimate: estimateTokens(taskPrompt) },
    context: { hasContent: Boolean(contextText), tokenEstimate: estimateTokens(contextText) },
    outputInstruction: { hasContent: Boolean(outputInstruction), tokenEstimate: estimateTokens(outputInstruction) }
  }

  return {
    systemPrompt,
    taskPrompt,
    resolvedVariables,
    missingVariables: allMissing,
    estimatedTokens,
    sourceSections
  }
}

function renderPromptWithFallback(request) {
  const fallbackConfig = {
    ...DEFAULT_PROMPT_CONFIG,
    taskPromptTemplate: '请处理以下输入：\n{{input}}',
    systemPrompt: '你是一个专业的AI助手。',
    mergeMode: 'sections'
  }

  const mergedRequest = {
    ...request,
    promptConfig: request?.promptConfig || fallbackConfig
  }

  try {
    return renderPrompt(mergedRequest)
  } catch (err) {
    const input = request?.nodeInputs?.text || request?.nodeInputs?.input || ''
    return {
      systemPrompt: '你是一个专业的AI助手。',
      taskPrompt: input ? `请处理以下输入：\n${input}` : '请继续。',
      resolvedVariables: {},
      missingVariables: [],
      estimatedTokens: estimateTokens(input) + 50,
      sourceSections: {
        systemPrompt: { template: 'fallback', tokenEstimate: 20 },
        taskPrompt: { template: 'fallback', tokenEstimate: estimateTokens(input) + 30 },
        context: { hasContent: false, tokenEstimate: 0 },
        outputInstruction: { hasContent: false, tokenEstimate: 0 }
      },
      error: err.message
    }
  }
}

module.exports = {
  renderPrompt,
  renderPromptWithFallback,
  estimateTokens,
  substituteVariables,
  mergePrompts,
  formatContextPackage,
  buildVariableMap,
  detectAndRedactCredentials,
  extractVariableNames,
  DEFAULT_PROMPT_CONFIG,
  DEFAULT_CONTEXT_TEMPLATE
}
