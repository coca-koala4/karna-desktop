'use strict'

function createModeResourceBridge({ modeService, skillsService, soulService, writerServices, documentSearch, ragService }) {
  const modeRuntimeBindings = new Map()

  function attachRuntime({ modeSessionId, bindingSnapshot }) {
    if (!modeSessionId) return null
    const effective = bindingSnapshot || modeService?.getBinding?.(modeSessionId)
    if (!effective) return null
    modeRuntimeBindings.set(modeSessionId, {
      binding: effective,
      attachedAt: new Date().toISOString(),
      cache: { skills: null, souls: null, tools: null, documents: null }
    })
    return effective
  }

  function detachRuntime(modeSessionId) {
    if (!modeSessionId) return
    modeRuntimeBindings.delete(modeSessionId)
  }

  function getRuntimeBinding(modeSessionId) {
    const bound = modeRuntimeBindings.get(modeSessionId)
    if (bound) return bound.binding
    if (modeService?.getBinding) {
      return modeService.getBinding(modeSessionId) || null
    }
    return null
  }

  function resolveModeSkills(modeSessionId, nodeSkills) {
    const binding = getRuntimeBinding(modeSessionId)
    const modeSkills = (binding?.skills) || []
    if (!Array.isArray(modeSkills) || modeSkills.length === 0) return nodeSkills || { mode: 'auto', selectedIds: [], localInstructions: null }

    const modeSkillIds = modeSkills
      .filter(s => s && (s.skillId || s.id))
      .map(s => s.skillId || s.id)

    const nodeIds = nodeSkills?.selectedIds || []
    const merged = nodeSkills?.mode === 'explicit' && nodeIds.length > 0
      ? Array.from(new Set([...modeSkillIds, ...nodeIds]))
      : modeSkillIds

    return {
      mode: 'explicit',
      selectedIds: merged,
      localInstructions: nodeSkills?.localInstructions || null,
      source: modeSessionId ? `mode:${modeSessionId}` : 'binding',
      modePolicy: binding?.modelPolicy || null,
      permissionPolicy: binding?.permissionPolicy || null
    }
  }

  function resolveModeSouls(modeSessionId, nodeSoulConfig) {
    const binding = getRuntimeBinding(modeSessionId)
    const modeSouls = (binding?.souls) || []
    if (!Array.isArray(modeSouls) || modeSouls.length === 0) {
      if (nodeSoulConfig && nodeSoulConfig.soulId) return nodeSoulConfig
      return null
    }

    const primary = modeSouls[0]
    const soulId = primary?.soulId || primary?.id
    if (!soulId) return nodeSoulConfig || null

    return {
      mode: 'explicit',
      soulId,
      soulRef: primary?.soulRef || `soul://${soulId}`,
      enabledAttributes: primary?.enabledAttributes || ['voice', 'method', 'critical_perspective'],
      allowDirectImitation: false,
      boundSouls: modeSouls.map(s => ({ id: s.soulId || s.id, ref: s.soulRef, weight: s.weight || 1 })),
      source: modeSessionId ? `mode:${modeSessionId}` : 'binding'
    }
  }

  function resolveModeTools(modeSessionId, nodeTools) {
    const binding = getRuntimeBinding(modeSessionId)
    const modeTools = (binding?.tools) || []
    const permPolicy = binding?.permissionPolicy

    let allowedTools = null
    let deniedTools = []

    if (Array.isArray(modeTools) && modeTools.length > 0) {
      allowedTools = modeTools
        .filter(t => t && (t.toolId || t.id || t.name))
        .map(t => t.toolId || t.id || t.name)
    }

    if (permPolicy) {
      if (permPolicy.deniedTools && Array.isArray(permPolicy.deniedTools)) {
        deniedTools = permPolicy.deniedTools
      }
      if (permPolicy.toolScope === 'none') {
        return { mode: 'disabled', selectedIds: [], allowed: [], denied: ['*'], policy: permPolicy }
      }
      if (permPolicy.toolScope === 'allowlist' && allowedTools === null) {
        allowedTools = []
      }
    }

    const nodeIds = nodeTools?.selectedIds || []
    const merged = allowedTools !== null
      ? Array.from(new Set([...allowedTools, ...nodeIds])).filter(id => !deniedTools.includes(id))
      : nodeIds

    return {
      mode: allowedTools !== null ? 'explicit' : (nodeTools?.mode || 'auto'),
      selectedIds: merged,
      allowed: allowedTools,
      denied: deniedTools,
      permissionPolicy: permPolicy || null,
      source: modeSessionId ? `mode:${modeSessionId}` : 'binding'
    }
  }

  async function buildModeContextPackage({ modeSessionId, query, project, services }) {
    const binding = getRuntimeBinding(modeSessionId)
    if (!binding) return { excerpts: [], citations: [], warnings: [], sourceSummary: {}, tokenEstimate: 0 }

    const excerpts = []
    const citations = []
    const warnings = []
    const sourceSummary = {}

    const docs = Array.isArray(binding.documents) ? binding.documents : []
    for (const doc of docs) {
      try {
        const docId = doc.documentId || doc.id || doc.ref
        if (!docId) continue
        const result = await resolveDocumentContext({ doc, query, services })
        if (result.excerpts) excerpts.push(...result.excerpts)
        if (result.citations) citations.push(...result.citations)
        if (result.warnings) warnings.push(...result.warnings)
        sourceSummary[docId] = { type: 'document', entries: (result.excerpts || []).length }
      } catch (err) {
        warnings.push(`Failed to resolve document ${doc?.documentId || doc?.id}: ${err.message}`)
      }
    }

    const sources = Array.isArray(binding.knowledgeSources) ? binding.knowledgeSources : []
    for (const src of sources) {
      try {
        const srcId = src.sourceId || src.id || src.ref
        if (!srcId) continue
        const result = await resolveKnowledgeSource({ source: src, query, services })
        if (result.excerpts) excerpts.push(...result.excerpts)
        if (result.citations) citations.push(...result.citations)
        if (result.warnings) warnings.push(...result.warnings)
        sourceSummary[srcId] = { type: src.type || 'knowledge', entries: (result.excerpts || []).length }
      } catch (err) {
        warnings.push(`Failed to resolve knowledge source ${src?.sourceId || src?.id}: ${err.message}`)
      }
    }

    const projCtx = binding.projectContext
    if (projCtx) {
      const projLines = []
      if (projCtx.projectName) projLines.push(`Project: ${projCtx.projectName}`)
      if (projCtx.storyBibleRef) {
        projLines.push(`Story Bible: ${projCtx.storyBibleRef}`)
        sourceSummary.storyBible = { type: 'story_bible', ref: projCtx.storyBibleRef }
      }
      if (projCtx.livingWikiRef) {
        projLines.push(`Living Wiki: ${projCtx.livingWikiRef}`)
        sourceSummary.livingWiki = { type: 'living_wiki', ref: projCtx.livingWikiRef }
      }
      if (projCtx.narrativeStateRef) {
        projLines.push(`Narrative State: ${projCtx.narrativeStateRef}`)
        sourceSummary.narrativeState = { type: 'narrative_state', ref: projCtx.narrativeStateRef }
      }
      if (projCtx.genre) projLines.push(`Genre: ${projCtx.genre}`)
      if (projCtx.audience) projLines.push(`Audience: ${projCtx.audience}`)
      if (projLines.length > 0) {
        excerpts.push({
          sourceType: 'project_context',
          sourceId: 'project',
          title: 'Project Context',
          text: projLines.join('\n'),
          priority: 'high'
        })
      }
    }

    const seen = new Set()
    const dedupedExcerpts = excerpts.filter(e => {
      const key = `${e.sourceType}:${e.sourceId}:${String(e.text || '').slice(0, 200)}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    return {
      excerpts: dedupedExcerpts,
      citations,
      warnings,
      sourceSummary,
      tokenEstimate: dedupedExcerpts.reduce((sum, e) => sum + (e.tokenEstimate || Math.ceil(String(e.text || '').length * 0.5)), 0)
    }
  }

  async function resolveDocumentContext({ doc, query, services }) {
    const docPath = doc.path || doc.uri || doc.documentId
    const svc = services || writerServices || {}
    const docSearch = svc.documentSearch || documentSearch
    if (docSearch && typeof docSearch.searchDocument === 'function' && docPath) {
      try {
        const results = await docSearch.searchDocument({
          path: docPath,
          query,
          maxExcerpts: doc.maxExcerpts || 5
        })
        const items = results?.excerpts || results?.items || []
        return {
          excerpts: items.map(it => ({
            sourceType: 'document',
            sourceId: docPath,
            title: doc.label || doc.name || docPath,
            text: it.text || it.excerpt || it.content || '',
            score: it.score,
            metadata: it.metadata
          })).filter(e => e.text),
          citations: items.map(it => ({ sourceType: 'document', sourceId: docPath, title: doc.label || docPath, ref: docPath })),
          warnings: []
        }
      } catch (err) {
        return { excerpts: [], citations: [], warnings: [`Document search failed for ${docPath}: ${err.message}`] }
      }
    }

    if (doc.content) {
      return {
        excerpts: [{ sourceType: 'document', sourceId: docPath || 'embedded', title: doc.label || 'Document', text: String(doc.content).slice(0, 8000) }],
        citations: [{ sourceType: 'document', sourceId: docPath || 'embedded', title: doc.label || 'Document', ref: docPath }],
        warnings: []
      }
    }

    return { excerpts: [], citations: [], warnings: [`Document service unavailable for ${docPath || '(unknown)'}`] }
  }

  async function resolveKnowledgeSource({ source, query, services }) {
    const svc = services || writerServices || {}
    const srcType = String(source.type || '').toLowerCase()
    const srcId = source.sourceId || source.id

    if (srcType === 'vector_collection' || srcType === 'vector') {
      const rag = svc.ragService || ragService
      if (rag && typeof rag.search === 'function') {
        try {
          const results = await rag.search({
            collectionId: srcId,
            query,
            topK: source.topK || 5,
            minScore: source.minScore || 0.7
          })
          const items = results?.items || results || []
          return {
            excerpts: items.map(it => ({
              sourceType: 'vector_collection',
              sourceId: srcId,
              title: it.title || it.metadata?.title || srcId,
              text: it.text || it.content || it.excerpt || '',
              score: it.score,
              metadata: it.metadata
            })).filter(e => e.text),
            citations: items.map(it => ({ sourceType: 'vector_collection', sourceId: srcId, title: it.title || srcId, ref: it.metadata?.path || srcId })),
            warnings: []
          }
        } catch (err) {
          return { excerpts: [], citations: [], warnings: [`Vector search failed for ${srcId}: ${err.message}`] }
        }
      }
      return { excerpts: [], citations: [], warnings: [`RAG service unavailable for ${srcId}`] }
    }

    if (srcType === 'living_wiki' || srcType === 'wiki') {
      const wiki = svc.wikiService || svc.narrativeService
      if (wiki && typeof wiki.queryWiki === 'function') {
        try {
          const results = await wiki.queryWiki({
            wikiId: srcId,
            query,
            maxItems: source.maxItems || 10
          })
          const items = results?.entities || results?.pages || results || []
          return {
            excerpts: items.map(e => ({
              sourceType: 'living_wiki',
              sourceId: srcId,
              title: e.name || e.title || srcId,
              text: e.summary || e.description || JSON.stringify(e, null, 2).slice(0, 1000),
              metadata: e
            })).filter(e => e.text),
            citations: items.map(e => ({ sourceType: 'living_wiki', sourceId: srcId, title: e.name || srcId, ref: e.id || srcId })),
            warnings: []
          }
        } catch (err) {
          return { excerpts: [], citations: [], warnings: [`Wiki query failed for ${srcId}: ${err.message}`] }
        }
      }
      return { excerpts: [], citations: [], warnings: [`Wiki service unavailable for ${srcId}`] }
    }

    if (srcType === 'story_bible' || srcType === 'bible') {
      const bible = svc.storyBibleService || svc.bibleService
      if (bible && typeof bible.queryBible === 'function') {
        try {
          const results = await bible.queryBible({ bibleRef: srcId, query, maxItems: source.maxItems || 10 })
          const items = results?.entries || results?.items || results || []
          return {
            excerpts: items.map(e => ({
              sourceType: 'story_bible',
              sourceId: srcId,
              title: e.name || e.title || 'Story Bible Entry',
              text: e.content || e.summary || e.description || '',
              metadata: e
            })).filter(e => e.text),
            citations: items.map(e => ({ sourceType: 'story_bible', sourceId: srcId, title: e.name || 'Entry', ref: e.id || srcId })),
            warnings: []
          }
        } catch (err) {
          return { excerpts: [], citations: [], warnings: [`Story Bible query failed for ${srcId}: ${err.message}`] }
        }
      }
    }

    if (source.content) {
      return {
        excerpts: [{ sourceType: 'knowledge', sourceId: srcId, title: source.label || srcId, text: String(source.content).slice(0, 8000) }],
        citations: [{ sourceType: 'knowledge', sourceId: srcId, title: source.label || srcId, ref: srcId }],
        warnings: []
      }
    }

    return { excerpts: [], citations: [], warnings: [`Unknown knowledge source type: ${srcType} (${srcId})`] }
  }

  function resolveWritebackPermission(modeSessionId, targetType, proposedChanges) {
    const binding = getRuntimeBinding(modeSessionId)
    const perm = binding?.permissionPolicy
    if (!perm) return { allowed: true, requiresApproval: false }

    if (targetType === 'soul') {
      return { allowed: false, reason: 'Soul modification is permanently forbidden across all modes' }
    }

    if (perm.denyWriteback && Array.isArray(perm.denyWriteback) && perm.denyWriteback.includes(targetType)) {
      return { allowed: false, reason: `Writeback to ${targetType} is denied by mode permission policy` }
    }

    const mode = binding.modeSessionId ? (modeService?.getSession?.(binding.modeSessionId || modeSessionId)?.mode) : null
    if (mode === 'plan') {
      return { allowed: false, reason: 'Plan mode is read-only; all write operations are blocked' }
    }

    if (mode === 'living_work' || mode === 'creative') {
      return { allowed: true, requiresApproval: true, reason: 'Creative/living_work mode requires proposal approval before writeback' }
    }

    if (mode === 'goal') {
      const allowedTargets = perm.writebackScope === 'workspace' ? ['artifact', 'file'] : ['artifact']
      if (perm.allowArtifactWriteback !== false && (targetType === 'artifact' || targetType === 'file')) {
        return { allowed: true, requiresApproval: false }
      }
      if (allowedTargets.includes(targetType)) {
        return { allowed: true, requiresApproval: false }
      }
      return { allowed: false, reason: `Goal mode does not allow writeback to ${targetType}` }
    }

    return { allowed: true, requiresApproval: false }
  }

  function applyModeContextToNode({ modeSessionId, prepared }) {
    if (!modeSessionId || !prepared) return prepared
    const binding = getRuntimeBinding(modeSessionId)
    if (!binding) return prepared

    const resolvedSkills = resolveModeSkills(modeSessionId, prepared.resolvedSkills)
    const resolvedSouls = resolveModeSouls(modeSessionId, prepared.config?.soulConfig)
    const resolvedTools = resolveModeTools(modeSessionId, prepared.resolvedTools)

    const modelPolicy = binding.modelPolicy || {}
    let resolvedModel = prepared.resolvedModel
    if (modelPolicy.enforceModel && modelPolicy.modelId) {
      resolvedModel = modelPolicy.modelId
    } else if (modelPolicy.reasoningEffort === 'high' && !prepared.resolvedModel) {
      resolvedModel = null
    }

    return {
      ...prepared,
      resolvedSkills,
      resolvedTools,
      resolvedModel,
      modeSoul: resolvedSouls,
      modeBinding: {
        modeSessionId,
        bindingId: binding.id,
        version: binding.version,
        permissionPolicy: binding.permissionPolicy,
        modelPolicy: binding.modelPolicy,
        budgetPolicy: binding.budgetPolicy,
        projectContext: binding.projectContext
      }
    }
  }

  function formatModeContextForPrompt(modeContext) {
    if (!modeContext || !modeContext.excerpts || modeContext.excerpts.length === 0) return ''
    const lines = []
    lines.push('=== Mode Context (bound documents & knowledge) ===')
    for (const excerpt of modeContext.excerpts.slice(0, 30)) {
      lines.push(`\n--- ${excerpt.title} (${excerpt.sourceType}:${excerpt.sourceId}) ---`)
      lines.push(String(excerpt.text || '').slice(0, 2000))
    }
    if (modeContext.warnings && modeContext.warnings.length > 0) {
      lines.push('\n--- Context Warnings ---')
      for (const w of modeContext.warnings) lines.push(`- ${w}`)
    }
    return lines.join('\n')
  }

  return {
    attachRuntime,
    detachRuntime,
    getRuntimeBinding,
    resolveModeSkills,
    resolveModeSouls,
    resolveModeTools,
    buildModeContextPackage,
    resolveWritebackPermission,
    applyModeContextToNode,
    formatModeContextForPrompt
  }
}

module.exports = { createModeResourceBridge }
