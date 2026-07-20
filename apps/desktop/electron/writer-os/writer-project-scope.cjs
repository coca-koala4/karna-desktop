'use strict'

function createWriterProjectScopeService(deps) {
  const {
    fs, path, crypto,
    readJsonFile, writeJsonFile,
    findWriterProject, listWriterProjects, enrichWriterProject,
    ensureWriterProjectMetadata,
    ensureCreativeIdentityForProject,
    buildReuseGuardContextForProject,
    scanReuseGuardForProject,
    writerProjectStoryBiblePath,
    writerProjectNarrativeStatePath,
    writerProjectCreativeMemoryPath,
    writerProjectDocumentsPath,
    writerProjectCreativeSearchPath,
    writerProjectKnowledgeGraphPath
  } = deps

  const defaultStoryBible = () => ({ version: 1, characters: [], locations: [], factions: [], items: [], plot_threads: [], chapters: [], motifs: [], themes: [], updated_at: new Date().toISOString() })
  const defaultNarrativeState = () => ({ version: 1, characters: [], threads: [], timeline: [], current_chapter: null, current_scene: null, unresolved_threads: [], updated_at: new Date().toISOString() })
  const defaultCreativeMemory = () => ({ version: 1, characters: [], professions: [], chapters: [], style_notes: [], constraints: [], themes: [], motifs: [], updated_at: new Date().toISOString() })
  const defaultDocuments = () => ({ version: 1, documents: [], categories: { outline: [], draft: [], bible: [], memory: [], research: [], note: [], export: [] }, stats: { total_files: 0, total_words: 0, last_scanned: null }, updated_at: new Date().toISOString() })
  const defaultCreativeSearch = () => ({ version: 1, items: [], stats: { searchable_items: 0, total_chunks: 0, last_indexed: null }, updated_at: new Date().toISOString() })
  const defaultKnowledgeGraph = () => ({ version: 1, nodes: [], edges: [], updated_at: new Date().toISOString() })

  const ensureJsonFile = (filePath, defaultContent) => {
    try {
      const dir = path.dirname(filePath)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      if (!fs.existsSync(filePath)) {
        writeJsonFile(filePath, defaultContent())
        return { data: defaultContent(), created: true }
      }
      try {
        const data = readJsonFile(filePath, null)
        if (data) return { data, created: false }
        writeJsonFile(filePath, defaultContent())
        return { data: defaultContent(), created: true }
      } catch {
        writeJsonFile(filePath, defaultContent())
        return { data: defaultContent(), created: true }
      }
    } catch {
      return { data: defaultContent(), created: false }
    }
  }

  const initializeProjectFiles = (project) => {
    ensureWriterProjectMetadata(project)
    const created = {}
    created.story_bible = ensureJsonFile(writerProjectStoryBiblePath(project), defaultStoryBible)
    created.narrative_state = ensureJsonFile(writerProjectNarrativeStatePath(project), defaultNarrativeState)
    created.creative_memory = ensureJsonFile(writerProjectCreativeMemoryPath(project), defaultCreativeMemory)
    created.documents = ensureJsonFile(writerProjectDocumentsPath ? writerProjectDocumentsPath(project) : path.join(project.folder, 'documents', 'documents.json'), defaultDocuments)
    created.creative_search = ensureJsonFile(writerProjectCreativeSearchPath ? writerProjectCreativeSearchPath(project) : path.join(project.folder, 'documents', 'creative_search.json'), defaultCreativeSearch)
    created.knowledge_graph = ensureJsonFile(writerProjectKnowledgeGraphPath ? writerProjectKnowledgeGraphPath(project) : path.join(project.folder, 'graph', 'knowledge_graph.json'), defaultKnowledgeGraph)
    if (ensureCreativeIdentityForProject) {
      try { created.creative_identity = ensureCreativeIdentityForProject(project) } catch {}
    }
    return created
  }

  const resolveWriterProjectScope = (params = {}, sessionRecord = {}) => {
    const candidates = [
      params.writer_project_id,
      params.project_id,
      params.workspace_id,
      sessionRecord.writer_project_id,
      sessionRecord.project_id,
      sessionRecord.workspace_id
    ].filter(Boolean)
    let project = null
    for (const id of candidates) {
      const found = findWriterProject(id)
      if (found) { project = found; break }
    }
    if (!project && params.cwd) {
      const allProjects = listWriterProjects()
      project = allProjects.find(p => p.folder && path.resolve(p.folder) === path.resolve(String(params.cwd))) || null
    }
    if (!project) {
      const allProjects = listWriterProjects()
      const active = allProjects.find(p => p.last_opened_at && !p.archived)
      if (active) project = active
    }
    if (!project) return { ok: false, error: 'project_not_found' }

    initializeProjectFiles(project)

    let identity = null
    try {
      const identityPath = path.join(project.folder, 'identity', 'creative_identity.json')
      if (fs.existsSync(identityPath)) {
        identity = readJsonFile(identityPath, null)
      }
    } catch {}

    let guard = { must_not_reuse_names: [], must_not_reuse_professions: [], must_not_reuse_core_motifs: [], must_not_reuse_story_titles: [], source_project_ids: [] }
    if (buildReuseGuardContextForProject) {
      try { guard = buildReuseGuardContextForProject(project) || guard } catch {}
    }

    const storyBible = ensureJsonFile(writerProjectStoryBiblePath(project), defaultStoryBible).data
    const narrativeState = ensureJsonFile(writerProjectNarrativeStatePath(project), defaultNarrativeState).data
    const creativeMemory = ensureJsonFile(writerProjectCreativeMemoryPath(project), defaultCreativeMemory).data

    return {
      ok: true,
      project: enrichWriterProject ? enrichWriterProject(project) : project,
      project_id: project.id,
      writer_project_id: project.id,
      workspace_id: project.workspace_id || project.id,
      folder: project.folder,
      project_title: project.title,
      creative_identity: identity,
      reuse_guard: guard,
      story_bible: storyBible,
      narrative_state: narrativeState,
      creative_memory: creativeMemory
    }
  }

  const buildProjectSessionContext = (scope) => {
    if (!scope || !scope.ok) return ''
    const lines = []
    lines.push('[karna_project_scope]')
    lines.push(`项目ID：${scope.project_id}`)
    lines.push(`工作区ID：${scope.workspace_id}`)
    lines.push(`项目路径：${scope.folder}`)
    lines.push(`项目标题：${scope.project_title || '未命名'}`)
    lines.push('')
    lines.push('[karna_creative_identity]')
    if (scope.creative_identity?.creative_seed?.seed_text) {
      lines.push(`本项目创作种子：${scope.creative_identity.creative_seed.seed_text}`)
    }
    lines.push('本项目独立性要求：必须为当前项目创建独立的人物姓名、职业身份和核心意象，不得直接复用其它项目的设定。')
    lines.push('')
    if (scope.reuse_guard && (scope.reuse_guard.must_not_reuse_names?.length > 0 || scope.reuse_guard.must_not_reuse_professions?.length > 0)) {
      lines.push('[karna_reuse_guard]')
      lines.push('以下内容来自其它项目，仅用于避免重复，不代表当前项目设定：')
      if (scope.reuse_guard.must_not_reuse_names.length > 0) {
        lines.push(`禁止复用角色名：${scope.reuse_guard.must_not_reuse_names.slice(0, 20).join('、')}`)
      }
      if (scope.reuse_guard.must_not_reuse_professions.length > 0) {
        lines.push(`禁止复用主角职业：${scope.reuse_guard.must_not_reuse_professions.slice(0, 10).join('、')}`)
      }
      if (scope.reuse_guard.must_not_reuse_core_motifs?.length > 0) {
        lines.push(`避免复用核心意象：${scope.reuse_guard.must_not_reuse_core_motifs.slice(0, 15).join('、')}`)
      }
      lines.push('')
    }
    lines.push('[karna_current_project_memory]')
    const currentCharacters = [
      ...(scope.creative_memory?.characters || []),
      ...(scope.story_bible?.characters || []),
      ...(scope.narrative_state?.characters || [])
    ]
    const currentProfessions = scope.creative_memory?.professions || []
    const currentChapters = scope.story_bible?.chapters || []
    if (currentCharacters.length > 0) {
      lines.push(`当前项目已有角色：${currentCharacters.slice(0, 15).map(c => typeof c === 'string' ? c : c.name || c.label).filter(Boolean).join('、')}`)
    } else {
      lines.push('当前项目还没有角色，请为本项目创建全新且与其它项目不重复的角色。')
    }
    if (currentProfessions.length > 0) {
      lines.push(`当前项目已有职业：${currentProfessions.slice(0, 10).join('、')}`)
    }
    if (currentChapters.length > 0) {
      lines.push(`当前项目已有章节：${currentChapters.length}章`)
    }
    lines.push('')
    return lines.join('\n')
  }

  const syncProjectAfterWrite = (project, changedFiles = []) => {
    try {
      initializeProjectFiles(project)
      if (scanReuseGuardForProject) {
        try { scanReuseGuardForProject(project) } catch {}
      }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  }

  const initializeProject = (project, options = {}) => {
    const created = initializeProjectFiles(project)
    let isNew = true
    if (created.creative_identity) {
      isNew = created.creative_identity.isNew !== false
    }
    if (scanReuseGuardForProject) {
      try { scanReuseGuardForProject(project) } catch {}
    }
    return { identity: created.creative_identity?.identity || null, isNew, created }
  }

  const migrateLegacyProject = (project) => {
    const backupDir = path.join(project.folder, '.karna-backups', 'migrations', new Date().toISOString().replace(/[:.]/g, '-'))
    try { fs.mkdirSync(backupDir, { recursive: true }) } catch {}
    const manifestFile = path.join(project.folder, 'project_manifest.json')
    if (fs.existsSync(manifestFile)) {
      try {
        const manifest = readJsonFile(manifestFile, null)
        if (manifest && !manifest.project_memory?.creative_identity) {
          const backup = path.join(backupDir, 'project_manifest.json.bak')
          fs.copyFileSync(manifestFile, backup)
          manifest.project_memory = {
            ...(manifest.project_memory || {}),
            bible: manifest.project_memory?.bible || 'bible/bible.json',
            story_bible: 'bible/story_bible.json',
            creative_identity: 'identity/creative_identity.json',
            creative_memory: 'memory/creative_memory.json',
            isolated: true
          }
          if (!manifest.document_roots) {
            manifest.document_roots = {
              outline: ['大纲', 'outline', '规划'],
              draft: ['正文', '章节', '输出', 'drafts', 'manuscript'],
              bible: ['设定', 'bible', '人物', '世界观'],
              memory: ['记忆', 'memory']
            }
          }
          writeJsonFile(manifestFile, manifest)
        }
      } catch {}
    }
    const result = initializeProject(project, { migrated: true })
    return { ok: true, backupDir, identityCreated: result.isNew }
  }

  return {
    resolveWriterProjectScope,
    buildProjectSessionContext,
    syncProjectAfterWrite,
    initializeProject,
    initializeProjectFiles,
    migrateLegacyProject,
    ensureJsonFile
  }
}

module.exports = { createWriterProjectScopeService }
