import type { HermesApiRequest } from '@/global'

const now = () => new Date().toISOString()
const key = 'karna.browser.dev.state.v1'

type Row = Record<string, any>

interface DevState {
  authors: Row[]
  knowledge: Row[]
  mcpServers: Row[]
  projects: Row[]
  runs: Row[]
  workflows: Row[]
}

const starterState = (): DevState => ({
  authors: [],
  knowledge: [{ id: 'demo-knowledge', name: '示例知识库', folder: 'D:/Agent/projects/karna-hermes/karna-data/knowledge', documents: 0, chunks: 0, vectorized: false }],
  mcpServers: [{ name: 'karna-writer', description: 'Karna 内置写作 MCP 工具', transport: 'builtin', enabled: true, tools: ['knowledge_search', 'list_writer_skills', 'project_list'] }],
  projects: [],
  runs: [],
  workflows: []
})

const readState = (): DevState => {
  try {
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : {}
    const base = starterState()
    return {
      ...base,
      ...parsed,
      knowledge: Array.isArray(parsed.knowledge) && parsed.knowledge.length ? parsed.knowledge : base.knowledge,
      mcpServers: Array.isArray(parsed.mcpServers) && parsed.mcpServers.length ? parsed.mcpServers : base.mcpServers
    }
  } catch {
    return starterState()
  }
}

const writeState = (state: DevState) => window.localStorage.setItem(key, JSON.stringify(state))
const id = (prefix: string) => `${prefix}_${Math.random().toString(16).slice(2, 10)}`
const ok = (extra: Row = {}) => ({ ok: true, ...extra })

function createStarterWorkflow(input: Row = {}) {
  return {
    id: input.id || id('workflow'),
    name: input.name || 'Karna 起步工作流',
    mode: input.mode || 'canvas',
    nodes: input.nodes || [
      { id: 'node_outline', type: 'agent', position: { x: 120, y: 120 }, data: { label: '大纲规划', agent_id: 'outline_architect' } },
      { id: 'node_write', type: 'agent', position: { x: 360, y: 120 }, data: { label: '章节撰写', agent_id: 'chapter_writer' } }
    ],
    edges: input.edges || [{ id: 'edge_outline_write', source: 'node_outline', target: 'node_write', label: '交给' }],
    limits: input.limits || { max_agents: 10, max_parallel: 3, max_loop: 3 },
    updated_at: now()
  }
}

const demoSkills = [
  { name: 'karna.writer.outline', description: '生成作品大纲、章节目标和角色线索。', category: 'writer', enabled: true, path: 'browser-dev://skills/writer-outline' },
  { name: 'karna.rag.search', description: '检索灵魂工坊中的知识库与作者样本。', category: 'knowledge', enabled: true, path: 'browser-dev://skills/rag-search' }
]

const demoToolsets = [
  { name: 'karna-writer-tools', label: 'Karna 写作工具', description: '项目、知识库、Soul 与 MCP 工具集合。', enabled: true, available: true, tools: ['project_list', 'knowledge_search', 'soul_preview'] }
]

async function api<T = unknown>(request: HermesApiRequest): Promise<T> {
  const state = readState()
  const path = request.path || ''
  const method = request.method || 'GET'
  const body = (request.body || {}) as Row

  if (path === '/api/config') {
    if (method === 'PUT') return ok({ config: body.config || { display: { language: 'zh' } } }) as T
    return { display: { language: 'zh' } } as T
  }
  if (path === '/api/config/defaults') return { display: { language: 'zh' } } as T
  if (path === '/api/config/schema') return {} as T
  if (path === '/api/skills') return demoSkills as T
  if (path === '/api/toolsets' || path === '/api/tools/toolsets') return demoToolsets as T
  if (path === '/api/skills/toggle') return ok({ name: body.name, enabled: body.enabled !== false }) as T
  if (path === '/api/toolsets/toggle') return ok({ name: body.name, enabled: body.enabled !== false }) as T
  if (path.startsWith('/api/tools/toolsets/')) return ok({ name: decodeURIComponent(path.split('/').pop() || ''), enabled: body.enabled !== false }) as T

  if (path === '/api/profiles') return { profiles: [{ name: 'default', path: 'browser-dev', is_default: true, has_env: false, model: null, provider: 'browser-dev', skill_count: demoSkills.length }] } as T
  if (path === '/api/profiles/active') return { profile: 'default', name: 'default' } as T
  if (path.startsWith('/api/profiles/sessions')) return { sessions: [], total: 0, offset: 0, limit: 0, truncated: false, profile_totals: {} } as T
  if (path === '/api/model/options') return { model: '默认', providers: [{ name: 'browser-dev', models: ['默认', 'deepseek-chat', 'qwen-long', 'glm-4'] }] } as T

  if (path === '/api/writer/resources') return ok({ skills: demoSkills, mcp: state.mcpServers, plugins: [], knowledge: state.knowledge }) as T
  if (path === '/api/writer/agents/library') {
    if (method === 'POST') return ok({ agents: [body] }) as T
    return ok({ agents: [{ id: 'outline_architect', name: '大纲规划', role: '大纲规划' }, { id: 'chapter_writer', name: '章节撰写', role: '章节撰写' }] }) as T
  }
  const writerOpsMatch = path.match(/^\/api\/writer\/projects\/([^/?]+)\/(import|analyze|check-consistency|rewrite-preview|bible|sources|export)$/)
  if (writerOpsMatch) {
    const projectId = decodeURIComponent(writerOpsMatch[1])
    const action = writerOpsMatch[2]
    const project = state.projects.find(p => p.id === projectId || p.slug === projectId) || state.projects[0]
    if (action === 'import' && method === 'POST') {
      const source = { file: 'browser-preview.md', title: '浏览器预览稿件', chars: 1280, lines: 42, preview: '这里显示导入后的真实文件预览。浏览器模式不会访问本地文件。' }
      if (project) project.sources = [...(project.sources || []), source]
      writeState(state)
      return ok({ imported: [source], message: '浏览器预览模式已记录导入动作' }) as T
    }
    if (action === 'sources') return ok({ sources: project?.sources || [] }) as T
    if (action === 'bible' || action === 'analyze') {
      const bible = {
        updated_at: now(),
        chapters: [{ id: 'c1', title: '第一章', file: 'browser-preview.md', summary: '主角目标、冲突和悬念入口被整理出来。', chars: 1280 }],
        characters: [{ name: '主角', evidence: '第一章出现', note: '目标明确，但动机需要继续补强。' }],
        world: [{ rule: '世界观硬规则', evidence: '来自项目稿件与设定片段。' }],
        foreshadows: [{ clue: '未解释的物件', status: '待回收', evidence: '第一章结尾' }],
        timeline: [{ event: '故事开端', evidence: '第一章' }]
      }
      if (project) project.bible = bible
      writeState(state)
      return ok({ bible, versions: [{ kind: action, summary: '浏览器预览版本记录', at: now() }], calls: [{ operation: action, at: now(), scope: '片段/摘要' }] }) as T
    }
    if (action === 'check-consistency' && method === 'POST') return ok({ report: { checked_at: now(), issues: [{ id: 'issue-1', title: '人物动机需要补证据', severity: 'medium', evidence: ['第一章：目标出现但原因不充分'], suggestion: '补一处早期经历或对话证据。' }] } }) as T
    if (action === 'rewrite-preview' && method === 'POST') return ok({ preview: { mode: body.mode || 'pace', instruction: '仅生成预览，不覆盖原稿', original: body.text || '', suggested: `${body.text || ''}\n\n[节奏建议：压缩重复句，增强动作承接。]`, diff: `- ${body.text || ''}\n+ ${body.text || ''}\n+ [建议：压缩重复句，增强动作承接。]`, reason: '保留剧情与人设，只给编辑建议。', at: now() } }) as T
    if (action === 'export' && method === 'POST') return ok({ export: { json: 'browser-dev://writer-project-export.json', sources: project?.sources?.length || 0 } }) as T
  }
  if (path.startsWith('/api/writer/projects')) {
    const projectMatch = path.match(/^\/api\/writer\/projects\/([^/?]+)(?:\/(open|open-folder|sessions))?/)
    if (!projectMatch) {
      if (method === 'POST') {
        const projectId = id('project')
        const project = { id: projectId, slug: projectId, title: body.title || 'Karna 示例项目', type: body.type || 'novel', status: 'active', folder: body.folder || 'D:/Agent/projects/karna-hermes/karna-data/writer-projects/demo', agents: [], knowledge_ids: body.knowledge_ids || [], sources: [] }
        state.projects.push(project); writeState(state)
        return ok({ project }) as T
      }
      return { version: 1, active_project_id: state.projects[0]?.id || '', projects: state.projects } as T
    }
    const projectId = decodeURIComponent(projectMatch[1])
    const action = projectMatch[2] || ''
    if (action === 'sessions') return ok({ session: { id: id('session'), project_id: projectId } }) as T
    if (action === 'open' || action === 'open-folder') return ok({ project: state.projects.find(p => p.id === projectId) || null }) as T
    if (method === 'PATCH') { state.projects = state.projects.map(p => p.id === projectId ? { ...p, ...body } : p); writeState(state); return ok({ project: state.projects.find(p => p.id === projectId) }) as T }
    if (method === 'DELETE') { state.projects = state.projects.filter(p => p.id !== projectId); writeState(state); return ok({ deleted: projectId }) as T }
  }

  if (path === '/api/knowledge') return { config: { top_k: 5, chunk_size: 1200, embedding_model_id: '' }, libraries: state.knowledge } as T
  if (path === '/api/knowledge/libraries') return ok({ libraries: state.knowledge }) as T
  const knowledgeLibraryMatch = path.match(/^\/api\/knowledge\/libraries\/([^/?]+)$/)
  if (knowledgeLibraryMatch && method === 'DELETE') {
    const libraryId = decodeURIComponent(knowledgeLibraryMatch[1])
    state.knowledge = state.knowledge.filter(k => k.id !== libraryId); writeState(state)
    return ok({ deleted: libraryId, libraries: state.knowledge }) as T
  }
  if (path === '/api/knowledge/import-folder') {
    const row = { id: id('kb'), name: body.name || String(body.path || '未命名知识库').split(/[\\/]/).pop(), folder: body.path, documents: 0, chunks: 0, vectorized: false, updated_at: now() }
    state.knowledge.push(row); writeState(state)
    return ok({ library: row, libraries: state.knowledge, files: 0, chunks: 0 }) as T
  }
  if (path === '/api/knowledge/reindex') return ok({ results: state.knowledge.map(k => ok({ folder: k.folder, files: k.documents || 0, chunks: k.chunks || 0 })) }) as T
  if (path === '/api/knowledge/search') return ok({ query: body.query || body.q || '', vectorized: false, results: state.knowledge.map(k => ({ id: k.id, title: k.name, path: k.folder, text: `浏览器预览模式下的检索结果：${body.query || body.q || ''}`, score: 1 })) }) as T

  if (path.startsWith('/api/writer/workflows')) {
    const workflowMatch = path.match(/^\/api\/writer\/workflows\/([^/?]+)(?:\/run)?/)
    if (!workflowMatch) {
      if (method === 'POST') {
        const workflow = createStarterWorkflow(body)
        state.workflows = [...state.workflows.filter(w => w.id !== workflow.id), workflow]; writeState(state)
        return ok({ workflow, workflows: state.workflows }) as T
      }
      return ok({ workflows: state.workflows, agents: [{ id: 'outline_architect', name: '大纲规划' }, { id: 'chapter_writer', name: '章节撰写' }], runs: state.runs }) as T
    }
    const workflowId = decodeURIComponent(workflowMatch[1])
    if (path.includes('/run')) { const run = { run_id: id('run'), workflow_id: workflowId, status: 'done', progress: { total: 2, completed: 2 }, started_at: now(), finished_at: now() }; state.runs.push(run); writeState(state); return ok({ run }) as T }
    if (method === 'DELETE') { state.workflows = state.workflows.filter(w => w.id !== workflowId); writeState(state); return ok({ workflows: state.workflows }) as T }
  }

  if (path === '/api/soul/authors') {
    if (method === 'POST') { const authorId = id('author'); const author = { id: authorId, slug: authorId, name: body.name || '示例作者', folder: `browser-dev://soul/${authorId}`, texts_count: 0, chunks_count: 0, web_evidence_count: 0, profile_version: 0, texts: [], chunks: [], profile: {} }; state.authors.push(author); writeState(state); return ok({ author }) as T }
    return ok({ authors: state.authors, active_author_id: state.authors[0]?.id || '' }) as T
  }
  const authorMatch = path.match(/^\/api\/soul\/authors\/([^/?]+)(?:\/(import|process|search|web-research|distill|critic|risk-check|export-skill|export|detail))?$/)
  if (authorMatch) {
    const authorId = decodeURIComponent(authorMatch[1])
    const action = authorMatch[2] || 'detail'
    const author = state.authors.find(a => a.id === authorId || a.slug === authorId) || state.authors[0]
    if (method === 'DELETE') { state.authors = state.authors.filter(a => a.id !== authorId); writeState(state); return ok({ deleted: authorId }) as T }
    if (action === 'import' && method === 'POST') {
      const text = { id: id('text'), title: body.title || '浏览器预览文本', chars: 1200, copyright_status: body.copyright_status || 'user_provided', cleaned_file: 'browser-dev://cleaned/sample.md', imported_at: now() }
      state.authors = state.authors.map(a => a.id === authorId || a.slug === authorId ? { ...a, texts: [...(a.texts || []), text], texts_count: (a.texts_count || 0) + 1 } : a); writeState(state)
      return ok({ imported: [text] }) as T
    }
    if (action === 'process' && method === 'POST') {
      const chunks = [{ chunk_id: id('chunk'), title: '浏览器预览文本', chapter: '第一章', scene: '开端', text: '浏览器预览模式下的真实交互占位。', summary: '这里会展示真实分块、证据位置和标签。', embedding_type: 'paragraph', source_file: 'sample.md', line_start: 1, tags: ['方法', '证据'], score: 1 }]
      state.authors = state.authors.map(a => a.id === authorId || a.slug === authorId ? { ...a, chunks, chunks_count: chunks.length } : a); writeState(state)
      return ok({ stats: { total: chunks.length, paragraph: chunks.length } }) as T
    }
    if (action === 'search' && method === 'POST') return ok({ query: body.query || '', vectorized: false, message: '未配置 embedding，使用关键词 fallback', results: (author?.chunks || [{ chunk_id: id('soul_result'), title: author?.name || '示例作者', chapter: '', scene: '', text: `Soul 检索预览：${body.query || ''}`, summary: `Soul 检索预览：${body.query || ''}`, embedding_type: 'paragraph', source_file: 'browser-dev', line_start: 1, tags: [], score: 1 }]) }) as T
    if (action === 'web-research' && method === 'POST') {
      const claim = { claim: `${body.query || author?.name || '作者'} 的公开资料会以观点摘要保存，不保存盗版全文。`, confidence: 0.76, source_url: 'https://example.com/research' }
      state.authors = state.authors.map(a => a.id === authorId || a.slug === authorId ? { ...a, web_evidence_count: (a.web_evidence_count || 0) + 1, web: { sources: [{ title: '公开访谈/评论来源', url: claim.source_url, credibility: 0.76 }], claims: [claim], conflicts: [] } } : a); writeState(state)
      return ok({ sources: [claim], claims: [claim] }) as T
    }
    if (action === 'distill' && method === 'POST') {
      const profile = { updated_at: now(), narrative_methods: ['用冲突推动信息揭示'], dialogue_features: ['对白服务人物关系变化'], imagery_system: ['意象只作为方法参考'], safe_transfer_principles: ['学习方法，不复制表达'], do_not_copy: ['不复制可识别句式与情节桥段'], evidence_refs: ['browser-dev:chunk:1'] }
      state.authors = state.authors.map(a => a.id === authorId || a.slug === authorId ? { ...a, profile, profile_version: (a.profile_version || 0) + 1, profile_updated_at: now() } : a); writeState(state)
      return ok({ profile }) as T
    }
    if (action === 'critic' && method === 'POST') return ok({ report: { policy: '只给批评和方法迁移建议', issues: ['冲突启动偏慢'], suggestions: ['把人物选择提前到段落前半部分'], safe_transfer_principles: ['保留方法论，移除可识别表达'] } }) as T
    if (action === 'risk-check' && method === 'POST') return ok({ report: { level: 'low', blocked: false, scores: { vocabulary_similarity: 0.12, sentence_similarity: 0.18 }, reductions: ['替换可识别意象', '改变段落节奏'] } }) as T
    if (action === 'export-skill' && method === 'POST') return ok({ skill_dir: `browser-dev://skills/${authorId}` }) as T
    if (action === 'export' && method === 'POST') return ok({ file: `browser-dev://${authorId}.json` }) as T
    return ok({ author, metadata: { texts: author?.texts || [] }, chunks: author?.chunks || [], profile: author?.profile || {}, web: author?.web || { sources: [], claims: [], conflicts: [] }, risk_profile: { checks: [] } }) as T
  }
  if (path === '/api/soul/fusion/preview') {
    const selected = Array.isArray(body.authors) ? body.authors.join('、') : '无'
    return ok({ preview: `融合结果只作为方法参考，不直接替代作者判断。\n已选择：${selected}` }) as T
  }
  if (path === '/api/prompt/enhance') return ok({ text: `Karna 增强提示\n${body.text || ''}` }) as T

  if (path === '/api/mcp/reload') return ok({ servers: state.mcpServers.length, enabled: state.mcpServers.filter(s => s.enabled !== false).length }) as T
  if (path === '/api/mcp/servers') {
    if (method === 'POST') { const server = { name: body.name, description: body.description || '', url: body.url || '', command: body.command || '', enabled: body.enabled !== false, tools: [] }; state.mcpServers.push(server); writeState(state); return ok({ server }) as T }
    return { servers: state.mcpServers, config_path: 'browser-dev://mcp_servers.json' } as T
  }
  const mcpMatch = path.match(/^\/api\/mcp\/servers\/([^/?]+)(?:\/(test|tools))?$/)
  if (mcpMatch) {
    const serverName = decodeURIComponent(mcpMatch[1])
    const action = mcpMatch[2] || ''
    const server = state.mcpServers.find(s => s.name === serverName)
    if (action === 'test' && method === 'POST') return ok({ message: `${serverName} 测试通过`, transport: server?.transport || body.transport || 'custom' }) as T
    if (action === 'tools') return ok({ server: serverName, tools: server?.tools || [] }) as T
    if (method === 'PATCH') { state.mcpServers = state.mcpServers.map(s => s.name === serverName ? { ...s, ...body } : s); writeState(state); return ok({ server: state.mcpServers.find(s => s.name === serverName) }) as T }
    if (method === 'DELETE') { state.mcpServers = state.mcpServers.filter(s => s.name !== serverName); writeState(state); return ok({ deleted: serverName }) as T }
    return (server || ok({ error: `MCP server not found: ${serverName}` })) as T
  }

  if (path === '/api/sessions') return { sessions: [], total: 0, page: 1, page_size: 0 } as T
  if (path === '/api/models') return { models: [], current_model: '', provider: 'browser-dev' } as T
  if (path === '/api/status') return { gateway_state: 'browser-dev', gateway_running: false, version: 'browser-dev' } as T
  return ok({}) as T
}

export function installKarnaBrowserBridge() {
  if (typeof window === 'undefined' || window.hermesDesktop) return
  const bridge = {
    __karnaBrowserDevBridge: true,
    api,
    applyConnectionConfig: async () => ok(),
    getConnection: async () => null,
    getConnectionConfig: async () => ({ mode: 'browser-dev' }),
    getVersion: async () => ({ version: 'browser-dev' }),
    onBootstrapProgress: () => () => {},
    onClosePreviewRequested: () => () => {},
    onDeepLink: () => () => {},
    onFocusSession: () => () => {},
    onNotificationAction: () => () => {},
    onOpenUpdatesRequested: () => () => {},
    openExternal: async () => {},
    revealLogs: async () => {},
    selectPaths: async () => [],
    setNativeTheme: () => {},
    setPreviewShortcutActive: () => {},
    setTitleBarTheme: () => {},
    setTranslucency: () => {},
    signalDeepLinkReady: () => {},
    touchBackend: () => {}
  } as unknown as Window['hermesDesktop'] & { __karnaBrowserDevBridge: true }
  window.hermesDesktop = bridge
  window.karnaDesktop = bridge
}
