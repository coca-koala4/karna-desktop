'use strict'

const ROUGH_TOKENS_PER_CHAR = 0.5

function estimateTokens(text) {
  if (!text) return 0
  return Math.ceil(String(text).length * ROUGH_TOKENS_PER_CHAR)
}

function deduplicateExcerpts(excerpts) {
  const seen = new Set()
  return excerpts.filter(e => {
    const key = `${e.sourceType}:${e.sourceId}:${String(e.text || '').slice(0, 100)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function truncateToTokenBudget(excerpts, maxTokens) {
  const result = []
  let totalTokens = 0
  for (const excerpt of excerpts) {
    const tokens = excerpt.tokenEstimate || estimateTokens(excerpt.text)
    if (totalTokens + tokens > maxTokens) {
      const remaining = maxTokens - totalTokens
      if (remaining > 100) {
        const ratio = remaining / tokens
        const truncated = {
          ...excerpt,
          text: String(excerpt.text || '').slice(0, Math.floor(String(excerpt.text || '').length * ratio)),
          tokenEstimate: remaining,
          truncated: true
        }
        result.push(truncated)
        totalTokens += remaining
      }
      break
    }
    result.push({ ...excerpt, tokenEstimate: tokens })
    totalTokens += tokens
  }
  return { excerpts: result, tokenEstimate: totalTokens, truncated: totalTokens >= maxTokens }
}

async function queryVectorCollection({ sourceId, query, retrieval, services }) {
  const topK = retrieval?.topK || 5
  const minScore = typeof retrieval?.minScore === 'number' ? retrieval.minScore : 0.7
  const searchMode = retrieval?.searchMode || 'hybrid'
  try {
    const rag = services?.ragService || services?.vectorDb
    if (!rag || typeof rag.search !== 'function') {
      return { excerpts: [], citations: [], warnings: [`向量库服务不可用，无法查询: ${sourceId}`] }
    }
    const results = await rag.search({
      collectionId: sourceId,
      query,
      topK,
      minScore,
      mode: searchMode
    })
    const excerpts = (results?.items || results || []).map(item => ({
      sourceType: 'vector_collection',
      sourceId,
      title: item.title || item.metadata?.title || sourceId,
      text: item.text || item.content || item.excerpt || '',
      score: item.score,
      metadata: item.metadata
    })).filter(e => e.text)
    const citations = excerpts.map(e => ({
      sourceType: 'vector_collection',
      sourceId,
      title: e.title,
      ref: e.metadata?.path || sourceId
    }))
    return { excerpts, citations, warnings: [] }
  } catch (err) {
    return { excerpts: [], citations: [], warnings: [`查询向量库「${sourceId}」失败: ${err.message}`] }
  }
}

async function queryLivingWiki({ sourceId, binding, query, services }) {
  try {
    const wiki = services?.wikiService || services?.narrativeService
    if (!wiki || typeof wiki.queryWiki !== 'function') {
      return { excerpts: [], citations: [], warnings: [`Living Wiki 服务不可用，无法查询: ${sourceId}`] }
    }
    const results = await wiki.queryWiki({
      wikiId: sourceId,
      query,
      namespaces: binding.config?.namespaces,
      entityTypes: binding.config?.entityTypes,
      maxItems: binding.config?.maxItems || 10,
      relationDepth: binding.config?.relationDepth || 1,
      includeDrafts: binding.config?.includeDraftEntries || false
    })
    const excerpts = (results?.entities || results?.pages || results || []).map(e => ({
      sourceType: 'living_wiki',
      sourceId,
      title: e.name || e.title || sourceId,
      text: e.summary || e.content || e.description || '',
      metadata: { entityType: e.type, tags: e.tags }
    })).filter(e => e.text)
    const citations = excerpts.map(e => ({
      sourceType: 'living_wiki',
      sourceId,
      title: e.title,
      ref: e.id || sourceId
    }))
    return { excerpts, citations, warnings: [] }
  } catch (err) {
    return { excerpts: [], citations: [], warnings: [`查询 Living Wiki「${sourceId}」失败: ${err.message}`] }
  }
}

async function queryStoryBible({ sourceId, binding, query, services }) {
  try {
    const bible = services?.bibleService || services?.dataModel
    if (!bible || (typeof bible.queryBible !== 'function' && typeof bible.getBible !== 'function')) {
      return { excerpts: [], citations: [], warnings: [`剧情圣经服务不可用，无法查询: ${sourceId}`] }
    }
    const results = bible.queryBible
      ? await bible.queryBible({ bibleId: sourceId, query, sections: binding.config?.sections, maxItems: binding.config?.maxItems || 10 })
      : await bible.getBible(sourceId)
    const items = results?.sections || results?.entries || (results && results.content ? [results] : [])
    const excerpts = items.map(section => ({
      sourceType: 'story_bible',
      sourceId,
      title: section.title || section.name || sourceId,
      text: section.content || section.summary || section.text || '',
      metadata: { section: section.id || section.title }
    })).filter(e => e.text)
    const citations = excerpts.map(e => ({
      sourceType: 'story_bible',
      sourceId,
      title: e.title,
      ref: e.metadata?.section || sourceId
    }))
    return { excerpts, citations, warnings: [] }
  } catch (err) {
    return { excerpts: [], citations: [], warnings: [`查询剧情圣经「${sourceId}」失败: ${err.message}`] }
  }
}

async function queryNarrativeState({ sourceId, binding, query, services }) {
  try {
    const narrative = services?.narrativeService || services?.dataModel
    if (!narrative || typeof narrative.getNarrativeState !== 'function') {
      return { excerpts: [], citations: [], warnings: [`叙事状态服务不可用，无法查询: ${sourceId}`] }
    }
    const results = await narrative.getNarrativeState({
      stateId: sourceId,
      stateTypes: binding.config?.stateTypes,
      characterIds: binding.config?.characterIds,
      sceneIds: binding.config?.sceneIds,
      maxItems: binding.config?.maxItems || 20
    })
    const states = results?.states || results?.events || results || []
    const excerpts = states.map(s => ({
      sourceType: 'narrative_state',
      sourceId,
      title: s.title || s.event_type || s.type || sourceId,
      text: s.description || s.content || s.summary || JSON.stringify(s),
      metadata: { timestamp: s.timestamp, character: s.character_id, scene: s.scene_id }
    })).filter(e => e.text)
    const citations = excerpts.map(e => ({
      sourceType: 'narrative_state',
      sourceId,
      title: e.title,
      ref: e.metadata?.timestamp || sourceId
    }))
    return { excerpts, citations, warnings: [] }
  } catch (err) {
    return { excerpts: [], citations: [], warnings: [`查询叙事状态「${sourceId}」失败: ${err.message}`] }
  }
}

async function querySoulProfile({ sourceId, binding, soulConfig, services }) {
  try {
    const soulSvc = services?.soulService || services?.soulPrompts
    if (!soulSvc) {
      return { excerpts: [], citations: [], warnings: [`Soul 服务不可用，无法查询: ${sourceId}`] }
    }
    const enabledAttrs = soulConfig?.enabledAttributes || ['narrative_methods', 'critic_lens']
    const soul = await (soulSvc.getSoul ? soulSvc.getSoul(sourceId) : Promise.resolve(null))
    if (!soul) {
      return { excerpts: [], citations: [], warnings: [`Soul「${sourceId}」不存在或已删除`] }
    }
    const attrMap = {
      narrative_methods: { title: '叙事手法', text: soul.narrative_methods || soul.narrativeMethods },
      character_design: { title: '人物设计', text: soul.character_design || soul.characterDesign },
      dialogue_features: { title: '对话特征', text: soul.dialogue_features || soul.dialogueFeatures },
      imagery_system: { title: '意象系统', text: soul.imagery_system || soul.imagerySystem },
      pacing_preference: { title: '节奏偏好', text: soul.pacing_preference || soul.pacingPreference },
      critic_lens: { title: '评论视角', text: soul.critic_lens || soul.criticLens },
      safety_shield: { title: '安全护盾', text: soul.safety_shield || soul.safetyShield }
    }
    const excerpts = []
    const citations = []
    for (const attr of enabledAttrs) {
      const attrData = attrMap[attr]
      if (attrData && attrData.text) {
        excerpts.push({
          sourceType: 'soul_profile',
          sourceId,
          title: `Soul 参考: ${attrData.title}`,
          text: String(attrData.text),
          metadata: { attribute: attr, usageMode: soulConfig?.usageMode || 'method_reference' }
        })
        citations.push({ sourceType: 'soul_profile', sourceId, title: attrData.title, ref: attr })
      }
    }
    const warnings = []
    if (soulConfig?.blockDirectImitation !== false) {
      warnings.push('soul_imitation_blocked: Soul内容仅作为方法参考，禁止直接模仿风格')
    }
    return { excerpts, citations, warnings }
  } catch (err) {
    return { excerpts: [], citations: [], warnings: [`查询 Soul「${sourceId}」失败: ${err.message}`] }
  }
}

function buildUpstreamContext(upstream, binding) {
  if (!upstream) return { excerpts: [], citations: [], warnings: [] }
  const text = typeof upstream === 'string' ? upstream : JSON.stringify(upstream)
  const maxLen = (binding?.config?.maxTokens || 8000) * 2
  const truncated = text.slice(0, maxLen)
  return {
    excerpts: [{
      sourceType: 'upstream_output',
      sourceId: 'upstream',
      title: '上游节点输出',
      text: truncated,
      truncated: truncated.length < text.length
    }],
    citations: [{ sourceType: 'upstream_output', sourceId: 'upstream', title: '上游输出' }],
    warnings: truncated.length < text.length ? ['上游输出过长，已截断'] : []
  }
}

function buildManualContext(binding) {
  const text = binding.config?.manualText || ''
  if (!text) return { excerpts: [], citations: [], warnings: [] }
  return {
    excerpts: [{
      sourceType: 'manual_context',
      sourceId: binding.id || 'manual',
      title: binding.config?.title || '手动输入上下文',
      text
    }],
    citations: [{ sourceType: 'manual_context', sourceId: binding.id || 'manual', title: '手动上下文' }],
    warnings: []
  }
}

async function buildNodeContextPackage({
  project,
  workflow,
  node,
  agent,
  input,
  upstream,
  services,
  query
}) {
  const nodeData = node?.data || {}
  const contextConfig = nodeData.contextConfig || {}
  const warnings = []
  const allExcerpts = []
  const allCitations = []

  const bindings = Array.isArray(contextConfig.bindings) ? contextConfig.bindings : []
  const enabledBindings = bindings.filter(b => b.enabled !== false)

  if (contextConfig.inheritWorkflowContext && workflow?.runtimeConfig?.globalContext) {
    const globalCtx = workflow.runtimeConfig.globalContext
    allExcerpts.push({
      sourceType: 'workflow_context',
      sourceId: workflow.id,
      title: '工作流全局上下文',
      text: typeof globalCtx === 'string' ? globalCtx : JSON.stringify(globalCtx),
      priority: -1
    })
    allCitations.push({ sourceType: 'workflow_context', sourceId: workflow.id, title: '工作流上下文' })
  }

  const queryText = String(query || input?.input || input?.text || input?.prompt || '').slice(0, 2000)

  for (const binding of enabledBindings) {
    let result = { excerpts: [], citations: [], warnings: [] }
    switch (binding.sourceType) {
      case 'vector_collection':
        result = await queryVectorCollection({ sourceId: binding.sourceId, query: queryText, retrieval: binding.retrieval, services })
        break
      case 'living_wiki':
        result = await queryLivingWiki({ sourceId: binding.sourceId, binding, query: queryText, services })
        break
      case 'story_bible':
        result = await queryStoryBible({ sourceId: binding.sourceId, binding, query: queryText, services })
        break
      case 'narrative_state':
        result = await queryNarrativeState({ sourceId: binding.sourceId, binding, query: queryText, services })
        break
      case 'soul_profile':
        result = await querySoulProfile({ sourceId: binding.sourceId, binding, soulConfig: nodeData.soulConfig, services })
        break
      case 'upstream_output':
        result = buildUpstreamContext(upstream, binding)
        break
      case 'manual_context':
        result = buildManualContext(binding)
        break
      default:
        warnings.push(`不支持的上下文来源类型: ${binding.sourceType}`)
    }
    allExcerpts.push(...result.excerpts.map(e => ({ ...e, priority: binding.priority || 0, injectAs: binding.injectAs || 'system_context' })))
    allCitations.push(...result.citations)
    warnings.push(...result.warnings)
  }

  const soulConfig = nodeData.soulConfig
  if (soulConfig && soulConfig.mode !== 'disabled' && soulConfig.soulId && !enabledBindings.some(b => b.sourceType === 'soul_profile')) {
    const soulResult = await querySoulProfile({ sourceId: soulConfig.soulId, binding: {}, soulConfig, services })
    allExcerpts.push(...soulResult.excerpts.map(e => ({ ...e, priority: 1, injectAs: 'reference' })))
    allCitations.push(...soulResult.citations)
    warnings.push(...soulResult.warnings)
  }

  if (contextConfig.includeSourceMetadata === false) {
    allExcerpts.forEach(e => { delete e.metadata })
  }

  const deduped = deduplicateExcerpts(allExcerpts)
  deduped.sort((a, b) => (a.priority || 0) - (b.priority || 0))

  // The compiler injects a model-aware limit. Standalone callers may still
  // provide an explicit value; 16K remains only a defensive last resort.
  const maxTokens = contextConfig.maxContextTokens || 16000
  const { excerpts: finalExcerpts, tokenEstimate, truncated } = truncateToTokenBudget(deduped, maxTokens)

  if (truncated) {
    warnings.push(`上下文超出Token预算(${maxTokens})，已截断部分内容`)
  }

  return {
    excerpts: finalExcerpts,
    citations: allCitations,
    tokenEstimate,
    warnings,
    truncated,
    sourceSummary: {
      totalBindings: bindings.length,
      enabledBindings: enabledBindings.length,
      sourceCounts: enabledBindings.reduce((acc, b) => {
        acc[b.sourceType] = (acc[b.sourceType] || 0) + 1
        return acc
      }, {})
    }
  }
}

function formatContextForPrompt(contextPackage) {
  if (!contextPackage?.excerpts?.length) return ''
  const lines = ['--- 上下文参考 ---']
  for (const excerpt of contextPackage.excerpts) {
    lines.push(`\n### [${excerpt.sourceType}] ${excerpt.title}`)
    lines.push(excerpt.text)
    if (excerpt.truncated) lines.push('(内容已截断)')
  }
  if (contextPackage.citations?.length) {
    lines.push('\n--- 引用来源 ---')
    const uniqueCites = []
    const seen = new Set()
    for (const c of contextPackage.citations) {
      const key = `${c.sourceType}:${c.sourceId}`
      if (!seen.has(key)) { seen.add(key); uniqueCites.push(c) }
    }
    for (const cite of uniqueCites) {
      lines.push(`- [${cite.sourceType}] ${cite.title}`)
    }
  }
  return lines.join('\n')
}

module.exports = {
  buildNodeContextPackage,
  formatContextForPrompt,
  estimateTokens,
  deduplicateExcerpts,
  truncateToTokenBudget
}
