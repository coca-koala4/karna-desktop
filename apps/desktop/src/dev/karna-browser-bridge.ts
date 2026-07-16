import type { HermesApiRequest } from '@/global'
import { canonicalWriterOsModule } from '@/lib/writer-os-contract'

const now = () => new Date().toISOString()
const key = 'karna.browser.dev.state.v1'

type Row = Record<string, any>

interface DevState {
  auditLogs: Row[]
  authors: Row[]
  connectorInstances: Row[]
  knowledge: Row[]
  mcpServers: Row[]
  projects: Row[]
  runs: Row[]
  workflows: Row[]
}

const starterProject = () => ({
  id: 'writer-os-smoke-lab',
  slug: 'writer-os-smoke-lab',
  title: 'Writer OS Smoke Lab',
  type: 'novel',
  genre: '验收样例',
  status: 'active',
  folder: 'D:/Agent/projects/karna-hermes/karna-data/writer-projects/writer-os-smoke-lab',
  word_count: 0,
  agents: [],
  knowledge_ids: [],
  sources: []
})

const demoConnectorDefinitions = [
  {
    id: 'writer_workspace',
    name: 'writer.workspace',
    displayName: '本地 Workspace',
    description: '读取和管理当前写作项目文件、章节、选区与版本 diff。',
    category: 'creative_core',
    provider: 'Writer OS',
    type: 'builtin',
    priority: 'S',
    status: 'available',
    auth: { mode: 'none', fields: [] },
    permissions: [
      { id: 'workspace.read', label: '读取项目文件', riskLevel: 'low' },
      { id: 'workspace.write', label: '写入项目文件', riskLevel: 'high' }
    ],
    toolsPreview: [
      { name: 'list_projects', description: '列出所有写作项目', riskLevel: 'low' },
      { name: 'get_project_info', description: '获取项目详细信息', riskLevel: 'low' }
    ],
    dataPolicy: { localOnly: true, uploadsUserData: false, storesCredential: false, riskLevel: 'medium' }
  },
  {
    id: 'living_wiki',
    name: 'writer.living_wiki',
    displayName: 'Living Wiki',
    description: '维护作品百科条目，支持候选生成、确认和检索。',
    category: 'creative_core',
    provider: 'Writer OS',
    type: 'builtin',
    priority: 'S',
    status: 'available',
    auth: { mode: 'none', fields: [] },
    permissions: [{ id: 'wiki.write', label: '读写作品百科', riskLevel: 'medium' }],
    toolsPreview: [
      { name: 'list_articles', description: '列出百科文章', riskLevel: 'low' },
      { name: 'create_article', description: '创建百科文章', riskLevel: 'low' }
    ],
    dataPolicy: { localOnly: true, uploadsUserData: false, storesCredential: false, riskLevel: 'low' }
  },
  {
    id: 'browser_reader',
    name: 'browser.reader',
    displayName: 'Browser Reader',
    description: '读取网页正文并抽取公开资料证据。',
    category: 'research',
    provider: 'Karna',
    type: 'preview',
    priority: 'A',
    status: 'beta',
    auth: { mode: 'none', fields: [] },
    permissions: [{ id: 'browser.read', label: '读取公开网页', riskLevel: 'medium' }],
    toolsPreview: [
      { name: 'read_webpage', description: '读取网页正文', riskLevel: 'medium' },
      { name: 'extract_evidence', description: '抽取证据片段', riskLevel: 'medium' }
    ],
    dataPolicy: { localOnly: false, uploadsUserData: true, storesCredential: false, riskLevel: 'medium' }
  }
]

const starterConnectorInstances = () => [
  {
    id: 'dev_conn_browser_reader',
    connectorId: 'browser_reader',
    displayName: 'Browser Reader',
    enabled: true,
    connectionStatus: 'connected',
    discoveredTools: [
      { id: 'dev_tool_read_webpage', connectorInstanceId: 'dev_conn_browser_reader', name: 'read_webpage', description: '读取网页正文', inputSchema: {}, riskLevel: 'medium', enabled: true, source: 'preview' },
      { id: 'dev_tool_extract_evidence', connectorInstanceId: 'dev_conn_browser_reader', name: 'extract_evidence', description: '抽取证据片段', inputSchema: {}, riskLevel: 'medium', enabled: true, source: 'preview' }
    ],
    lastConnectedAt: now(),
    lastHealthCheckAt: now(),
    errorMessage: null,
    createdAt: now(),
    updatedAt: now()
  },
  {
    id: 'dev_conn_living_wiki',
    connectorId: 'living_wiki',
    displayName: 'Living Wiki',
    enabled: true,
    connectionStatus: 'connected',
    discoveredTools: [
      { id: 'dev_tool_list_articles', connectorInstanceId: 'dev_conn_living_wiki', name: 'list_articles', description: '列出所有百科文章', inputSchema: {}, riskLevel: 'low', enabled: true, source: 'preview' },
      { id: 'dev_tool_create_article', connectorInstanceId: 'dev_conn_living_wiki', name: 'create_article', description: '创建新百科文章', inputSchema: {}, riskLevel: 'low', enabled: true, source: 'preview' }
    ],
    lastConnectedAt: now(),
    lastHealthCheckAt: now(),
    errorMessage: null,
    createdAt: now(),
    updatedAt: now()
  }
]

const starterState = (): DevState => ({
  auditLogs: [],
  authors: [],
  connectorInstances: starterConnectorInstances(),
  knowledge: [{ id: 'demo-knowledge', name: '示例知识库', folder: 'D:/Agent/projects/karna-hermes/karna-data/knowledge', documents: 0, chunks: 0, vectorized: false }],
  mcpServers: [{ name: 'karna-writer', description: 'Karna 内置写作 MCP 工具', transport: 'builtin', enabled: true, tools: ['knowledge_search', 'list_writer_skills', 'project_list'] }],
  projects: [starterProject()],
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
      // An explicit empty array is a valid test/first-run state. Keeping the
      // demo instances in that case masks the empty-connector regression path.
      connectorInstances: Array.isArray(parsed.connectorInstances) ? parsed.connectorInstances : base.connectorInstances,
      knowledge: Array.isArray(parsed.knowledge) && parsed.knowledge.length ? parsed.knowledge : base.knowledge,
      mcpServers: Array.isArray(parsed.mcpServers) && parsed.mcpServers.length ? parsed.mcpServers : base.mcpServers,
      projects: Array.isArray(parsed.projects) && parsed.projects.length ? parsed.projects : base.projects
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
  { name: 'karna.rag.search', description: '检索 Soul 工坊中的知识库与作者样本。', category: 'knowledge', enabled: true, path: 'browser-dev://skills/rag-search' }
]

const demoToolsets = [
  { name: 'karna-writer-tools', label: 'Karna 写作工具', description: '项目、知识库、Soul 与 MCP 工具集合。', enabled: true, available: true, tools: ['project_list', 'knowledge_search', 'soul_preview'] }
]

const withDefinition = (instance: Row) => ({
  ...instance,
  definition: demoConnectorDefinitions.find(def => def.id === instance.connectorId)
})

const routeConnectorTools = (text: string, state: DevState) => {
  const lower = text.toLowerCase()

  const enabledTools = state.connectorInstances
    .filter(instance => instance.enabled !== false && instance.connectionStatus === 'connected')
    .flatMap(instance => (instance.discoveredTools || []).filter((tool: Row) => tool.enabled !== false).map((tool: Row) => ({
      ...tool,
      connectorId: instance.connectorId,
      connectorDisplayName: instance.displayName,
      category: demoConnectorDefinitions.find(def => def.id === instance.connectorId)?.category || 'creative_core'
    })))

  const intent = /搜索|检索|网页|资料|research|web/i.test(lower) ? 'research' : /百科|wiki|设定|世界观/i.test(lower) ? 'knowledge' : 'general'

  return { intent, tools: enabledTools.slice(0, 8) }
}

async function api<T = unknown>(request: HermesApiRequest): Promise<T> {
  const state = readState()
  const path = request.path || ''
  const method = request.method || 'GET'
  const body = (request.body || {}) as Row

  if (path === '/api/config') {
    if (method === 'PUT') {return ok({ config: body.config || { display: { language: 'zh' } } }) as T}

    return { display: { language: 'zh' } } as T
  }

  if (path === '/api/config/defaults') {return { display: { language: 'zh' } } as T}

  // ConfigSettings expects the production endpoint shape `{ fields: Record }`.
  // Returning an empty object leaves `schema` undefined and makes the settings
  // overlay spin forever in browser-dev mode.
  if (path === '/api/config/schema') {return { fields: {} } as T}

  if (path === '/api/skills') {return demoSkills as T}

  if (path === '/api/skills/catalog') {
    return {
      ok: true,
      skills: demoSkills,
      diagnostics: {
        scannedAt: new Date().toISOString(), logicalCount: demoSkills.length, sourceCount: demoSkills.length,
        conflictCount: 0, unavailableCount: 0, uninstalledCount: 0, excludedCount: 0,
        previousLogicalCount: demoSkills.length, countDelta: 0, driftDetected: false,
        roots: [], errors: [], excluded: []
      }
    } as T
  }

  if (path === '/api/toolsets' || path === '/api/tools/toolsets') {return demoToolsets as T}

  if (path === '/api/skills/install') {return ok({ name: body.name, installed: true }) as T}

  if (path === '/api/skills/uninstall') {return ok({ name: body.name, installed: false }) as T}

  if (path === '/api/skills/toggle') {return ok({ name: body.name, enabled: body.enabled !== false }) as T}

  if (path === '/api/toolsets/toggle') {return ok({ name: body.name, enabled: body.enabled !== false }) as T}

  if (path.startsWith('/api/tools/toolsets/')) {return ok({ name: decodeURIComponent(path.split('/').pop() || ''), enabled: body.enabled !== false }) as T}

  if (path === '/api/profiles') {return { profiles: [{ name: 'default', path: 'browser-dev', is_default: true, has_env: false, model: null, provider: 'browser-dev', skill_count: demoSkills.length }] } as T}

  if (path === '/api/profiles/active') {return { profile: 'default', name: 'default' } as T}

  if (path.startsWith('/api/profiles/sessions')) {return { sessions: [], total: 0, offset: 0, limit: 0, truncated: false, profile_totals: {} } as T}

  const demoModelProvider = {
    authenticated: true,
    is_current: true,
    models: ['default', 'deepseek-chat', 'qwen-long', 'glm-4'],
    name: 'Karna 演示模型',
    slug: 'browser-dev'
  }

  if (path === '/api/model/info') {return { model: 'default', provider: 'browser-dev' } as T}

  if (path === '/api/model/options' || path.startsWith('/api/model/options?')) {
    return { model: 'default', provider: 'browser-dev', providers: [demoModelProvider] } as T
  }

  if (path === '/api/model/auxiliary') {return { main: { model: 'default', provider: 'browser-dev' }, tasks: [] } as T}

  if (path === '/api/model/moa') {
    const slot = { model: 'default', provider: 'browser-dev' }

    const preset = {
      aggregator: slot,
      aggregator_temperature: 0.2,
      enabled: false,
      max_tokens: 2048,
      reference_models: [],
      reference_temperature: 0.2
    }

    return { active_preset: 'default', default_preset: 'default', ...preset, presets: { default: preset } } as T
  }

  if (path.startsWith('/api/model/recommended-default')) {return { free_tier: null, model: 'default', provider: 'browser-dev' } as T}

  if (path === '/api/model/set') {return ok({ model: body.model || 'default', provider: body.provider || 'browser-dev' }) as T}

  if (path === '/api/connectors/definitions') {return { items: demoConnectorDefinitions } as T}

  if (path === '/api/connectors/advanced-definitions') {return { items: [] } as T}

  if (path === '/api/connectors/instances') {
    if (method === 'POST') {
      const connectorId = String(body.connectorId || 'custom_mcp')
      const definition = (body.customDefinition as Row | undefined) || demoConnectorDefinitions.find(def => def.id === connectorId)

      const instance = {
        id: id('dev_conn'),
        connectorId,
        displayName: String(body.displayName || definition?.displayName || connectorId),
        enabled: true,
        connectionStatus: 'connected',
        auth: body.auth || {},
        credentialStored: !!body.auth,
        discoveredTools: definition?.toolsPreview?.map((tool: Row, index: number) => ({ ...tool, id: id(`dev_tool_${index}`), connectorInstanceId: connectorId, enabled: true, source: 'preview' })) || [],
        customDefinition: body.customDefinition || null,
        createdAt: now(),
        updatedAt: now(),
        lastConnectedAt: now(),
        lastHealthCheckAt: now(),
        errorMessage: null
      }

      state.connectorInstances.push(instance)
      writeState(state)

      return withDefinition(instance) as T
    }

    return { items: state.connectorInstances.map(withDefinition) } as T
  }

  const connectorInstanceMatch = path.match(/^\/api\/connectors\/instances\/([^/?]+)(?:\/(test|credential))?$/)

  if (connectorInstanceMatch) {
    const instanceId = decodeURIComponent(connectorInstanceMatch[1])
    const action = connectorInstanceMatch[2] || ''
    const instance = state.connectorInstances.find(row => row.id === instanceId)

    if (method === 'DELETE') {
      if (action === 'credential') {
        const updated = { ...(instance || {}), auth: {}, credentialStored: false, updatedAt: now() }
        state.connectorInstances = state.connectorInstances.map(row => row.id === instanceId ? updated : row)
        writeState(state)

        return withDefinition(updated) as T
      }

      state.connectorInstances = state.connectorInstances.filter(row => row.id !== instanceId)
      writeState(state)

      return ok({ deleted: instanceId }) as T
    }

    if (method === 'PATCH') {
      const updated = { ...(instance || {}), ...body, updatedAt: now() }
      state.connectorInstances = state.connectorInstances.map(row => row.id === instanceId ? updated : row)
      writeState(state)

      return withDefinition(updated) as T
    }

    if (action === 'test' && method === 'POST') {
      const tested: Row = { ...(instance || {}), connectionStatus: 'connected', lastHealthCheckAt: now(), errorMessage: null }
      state.connectorInstances = state.connectorInstances.map(row => row.id === instanceId ? tested : row)
      writeState(state)

      return { ok: true, status: 'connected', tools: tested.discoveredTools || [], instance: withDefinition(tested) } as T
    }

    return withDefinition(instance || {}) as T
  }

  const connectorToolMatch = path.match(/^\/api\/connectors\/tools\/([^/?]+)(?:\/(call))?$/)

  if (connectorToolMatch) {
    const toolId = decodeURIComponent(connectorToolMatch[1])
    const action = connectorToolMatch[2] || ''
    const tools = state.connectorInstances.flatMap(instance => (instance.discoveredTools || []).map((tool: Row) => ({ tool, instance })))
    const found = tools.find(row => row.tool.id === toolId)

    if (action === 'call' && method === 'POST') {
      state.auditLogs.unshift({
        id: id('audit'),
        createdAt: now(),
        connectorInstanceId: found?.instance.id,
        projectId: body.project_id || body.projectId || null,
        toolName: found?.tool.name || toolId,
        inputSummary: JSON.stringify(body.arguments || {}).slice(0, 240),
        outputSummary: '浏览器预览调用成功',
        status: 'success'
      })
      state.auditLogs = state.auditLogs.slice(0, 500)
      writeState(state)

      return { ok: true, tool: found?.tool || { id: toolId, name: toolId }, output: { preview: true, arguments: body.arguments || {}, message: '浏览器预览模式已模拟 tools/call。' } } as T
    }

    if (method === 'PATCH' && found) {
      found.tool.enabled = body.enabled !== false
      found.instance.updatedAt = now()
      writeState(state)

      return { ok: true, tool: found.tool } as T
    }
  }

  if (path.startsWith('/api/connectors/audit-logs')) {
    const url = new URL(path, 'http://karna.local')
    const instanceId = url.searchParams.get('instance_id') || url.searchParams.get('instanceId')
    const projectId = url.searchParams.get('project_id') || url.searchParams.get('projectId')
    const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || 80)))

    const items = state.auditLogs
      .filter(row => !instanceId || row.connectorInstanceId === instanceId)
      .filter(row => !projectId || row.projectId === projectId)
      .slice(0, limit)

    return { items } as T
  }

  if (path === '/api/connectors/health-check' && method === 'POST') {
    state.connectorInstances = state.connectorInstances.map(instance => ({ ...instance, connectionStatus: 'connected', lastHealthCheckAt: now(), errorMessage: null }))
    writeState(state)

    return ok({ checked: state.connectorInstances.length }) as T
  }

  if (path === '/api/connectors/router/candidates' && method === 'POST') {
    return routeConnectorTools(String(body.text || body.intent || ''), state) as T
  }

  if (path === '/api/writer/resources') {
    return ok({
      skills: demoSkills,
      mcp: state.mcpServers,
      plugins: [],
      knowledge: state.knowledge,
      models: [
        { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'deepseek', description: '旗舰级通用模型' },
        { id: 'deepseek/deepseek-r1-0528', name: 'DeepSeek R1', provider: 'deepseek', description: '推理增强模型' },
        { id: 'anthropic/claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic', description: '平衡型通用模型' },
        { id: 'anthropic/claude-opus-4-5', name: 'Claude Opus 4.5', provider: 'anthropic', description: '高性能旗舰模型' },
        { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'openai', description: 'OpenAI 通用多模态' },
        { id: 'qwen/qwen3-235b', name: 'Qwen3 235B', provider: 'qwen', description: '通义千问旗舰' }
      ],
      souls: [
        { id: 'soul_default', name: '默认助手', provider: 'karna', description: '通用助手人格' },
        { id: 'soul_writer', name: '文学创作者', provider: 'karna', description: '擅长文学创作' }
      ]
    }) as T
  }

  if (path === '/api/writer/agents/library') {
    if (method === 'POST') {return ok({ agents: [body] }) as T}

    return ok({ agents: [{ id: 'outline_architect', name: '大纲规划', role: '大纲规划' }, { id: 'chapter_writer', name: '章节撰写', role: '章节撰写' }] }) as T
  }

  const writerOsMatch = path.match(/^\/api\/writer\/projects\/([^/?]+)\/os\/([^/?]+)(?:\/([^/?]+))?$/)

  if (writerOsMatch) {
    const projectId = decodeURIComponent(writerOsMatch[1])
    const module = canonicalWriterOsModule(writerOsMatch[2])
    const project = state.projects.find(p => p.id === projectId || p.slug === projectId) || state.projects[0]

    const bible = project?.bible || {
      characters: [{ id: 'dev-character', name: '主角', role: '用于验证 Writer OS 面板会显示真实数据。', traits: ['目标明确'] }],
      locations: [],
      chapters: [{ id: 'dev-chapter', title: '第一章', summary: '浏览器预览模式的章节摘要。' }],
      world_rules: [],
      foreshadows: [],
      timeline: [{ id: 'dev-event', event: '故事开端', chapter: '第一章' }]
    }

    if (module === 'story-bible') {
      if (method === 'POST') {
        if (project) {project.bible = bible}
        writeState(state)
      }

      return ok({ story_bible: bible }) as T
    }

    if (module === 'living-wiki') {return ok({ wiki: { pages: [{ id: 'dev-wiki', title: '示例百科', summary: '浏览器预览模式数据。' }] } }) as T}

    if (module === 'knowledge-graph') {return ok({ nodes: [{ id: '主角', label: '主角', type: 'character' }], edges: [], stats: { nodes: 1, edges: 0 } }) as T}

    if (module === 'narrative-state') {return ok({ state: { threads: [{ id: 'dev-thread', title: '主线', status: 'open' }] } }) as T}

    if (module === 'documents') {return ok({ stats: { documents: 1, nodes: 1 }, documents: [{ id: 'browser-preview.md', title: '浏览器预览稿件' }] }) as T}

    if (module === 'critic-council') {return ok({ council: { reports: [{ id: 'dev-report', title: '节奏建议' }] } }) as T}

    if (module === 'safety') {return ok({ report: { level: 'low', blocked: false } }) as T}

    if (module === 'creative-memory') {return ok({ memories: [{ id: 'dev-memory', text: '浏览器预览创作记忆。' }] }) as T}

    if (module === 'creative-search') {return ok({ query: body.query || project?.title || '', results: [{ id: 'dev-result', title: '预览检索结果', score: 1 }] }) as T}

    if (module === 'rag') {return ok({ status: 'ready', chunks: 1, vectorized: false }) as T}

    if (module === 'benchmark') {return ok({ runs: [{ id: 'dev-benchmark', passed: 25, total: 25 }] }) as T}

    if (module === 'guide') {return ok({ checklist: [{ id: 'dev-guide', title: '浏览器预览修复', status: 'done' }] }) as T}

    if (module === 'delivery') {return ok({ artifacts: [{ id: 'dev-writer-delivery', type: 'delivery_package', title: '浏览器演示 Writer 交付包', source: 'browser-demo', path: 'https://example.invalid/karna-browser-demo/writer-delivery.zip', bytes: 4096, updated_at: now(), preview: '浏览器演示样例；桌面版显示真实 Writer OS 交付索引。' }], package: { id: 'dev-delivery', artifacts: 1 } }) as T}

    if (module === 'verify') {return ok({ status: 'green', checks: [{ id: 'dev-loop', ok: true }] }) as T}

    return ok({ module, preview: true }) as T
  }

  const writerOpsMatch = path.match(/^\/api\/writer\/projects\/([^/?]+)\/(import|analyze|check-consistency|rewrite-preview|bible|sources|export)$/)

  if (writerOpsMatch) {
    const projectId = decodeURIComponent(writerOpsMatch[1])
    const action = writerOpsMatch[2]
    const project = state.projects.find(p => p.id === projectId || p.slug === projectId) || state.projects[0]

    if (action === 'import' && method === 'POST') {
      const source = { file: 'browser-preview.md', title: '浏览器预览稿件', chars: 1280, lines: 42, preview: '这里显示导入后的真实文件预览。浏览器模式不会访问本地文件。' }

      if (project) {project.sources = [...(project.sources || []), source]}
      writeState(state)

      return ok({ imported: [source], message: '浏览器预览模式已记录导入动作' }) as T
    }

    if (action === 'sources') {return ok({ sources: project?.sources || [] }) as T}

    if (action === 'bible' || action === 'analyze') {
      const bible = {
        updated_at: now(),
        chapters: [{ id: 'c1', title: '第一章', file: 'browser-preview.md', summary: '主角目标、冲突和悬念入口被整理出来。', chars: 1280 }],
        characters: [{ name: '主角', evidence: '第一章出现', note: '目标明确，但动机需要继续补强。' }],
        world: [{ rule: '世界观硬规则', evidence: '来自项目稿件与设定片段。' }],
        foreshadows: [{ clue: '未解释的物件', status: '待回收', evidence: '第一章结尾' }],
        timeline: [{ event: '故事开端', evidence: '第一章' }]
      }

      if (project) {project.bible = bible}
      writeState(state)

      return ok({ bible, versions: [{ kind: action, summary: '浏览器预览版本记录', at: now() }], calls: [{ operation: action, at: now(), scope: '片段/摘要' }] }) as T
    }

    if (action === 'check-consistency' && method === 'POST') {return ok({ report: { checked_at: now(), issues: [{ id: 'issue-1', title: '人物动机需要补证据', severity: 'medium', evidence: ['第一章：目标出现但原因不充分'], suggestion: '补一处早期经历或对话证据。' }] } }) as T}

    if (action === 'rewrite-preview' && method === 'POST') {return ok({ preview: { mode: body.mode || 'pace', instruction: '仅生成预览，不覆盖原稿', original: body.text || '', suggested: `${body.text || ''}\n\n[节奏建议：压缩重复句，增强动作承接。]`, diff: `- ${body.text || ''}\n+ ${body.text || ''}\n+ [建议：压缩重复句，增强动作承接。]`, reason: '保留剧情与人设，只给编辑建议。', at: now() } }) as T}

    if (action === 'export' && method === 'POST') {return ok({ export: { json: 'browser-dev://writer-project-export.json', sources: project?.sources?.length || 0 } }) as T}
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

    if (action === 'sessions') {return ok({ session: { id: id('session'), project_id: projectId } }) as T}

    if (action === 'open' || action === 'open-folder') {return ok({ project: state.projects.find(p => p.id === projectId) || null }) as T}

    if (method === 'PATCH') { state.projects = state.projects.map(p => p.id === projectId ? { ...p, ...body } : p); writeState(state);

 return ok({ project: state.projects.find(p => p.id === projectId) }) as T }

    if (method === 'DELETE') { state.projects = state.projects.filter(p => p.id !== projectId); writeState(state);

 return ok({ deleted: projectId }) as T }
  }

  if (path === '/api/knowledge') {return { config: { top_k: 5, chunk_size: 1200, embedding_model_id: '' }, libraries: state.knowledge } as T}

  if (path === '/api/knowledge/libraries') {return ok({ libraries: state.knowledge }) as T}
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

  if (path === '/api/knowledge/reindex') {return ok({ results: state.knowledge.map(k => ok({ folder: k.folder, files: k.documents || 0, chunks: k.chunks || 0 })) }) as T}

  if (path === '/api/knowledge/search') {return ok({ query: body.query || body.q || '', vectorized: false, results: state.knowledge.map(k => ({ id: k.id, title: k.name, path: k.folder, text: `浏览器预览模式下的检索结果：${body.query || body.q || ''}`, score: 1 })) }) as T}

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

    const stopMatch = path.match(/\/runs\/([^/?]+)\/(?:stop|cancel)(?:\?|$)/)

    if (stopMatch && method === 'POST') {
      const runId = decodeURIComponent(stopMatch[1])
      const existing = state.runs.find(run => run.run_id === runId)
      const run = { ...(existing || { run_id: runId, workflow_id: workflowId, progress: { total: 1, completed: 0 } }), status: 'cancelled', stop_requested_at: now(), finished_at: now() }
      state.runs = [...state.runs.filter(item => item.run_id !== runId), run]
      writeState(state)

      return ok({ run }) as T
    }

    const nodeActionMatch = path.match(/\/runs\/([^/?]+)\/nodes\/([^/?]+)\/(accept|reject|skip|retry)(?:\?|$)/)

    if (nodeActionMatch && method === 'POST') {
      const runId = decodeURIComponent(nodeActionMatch[1])
      const nodeId = decodeURIComponent(nodeActionMatch[2])
      const action = nodeActionMatch[3]
      const existing = state.runs.find(run => run.run_id === runId) || { run_id: runId, workflow_id: workflowId, status: 'paused', progress: { total: 1, completed: 0 }, node_statuses: {} }
      const run = { ...existing, node_statuses: { ...(existing.node_statuses || {}), [nodeId]: { action, status: action === 'retry' ? 'queued' : action === 'accept' ? 'accepted' : action === 'reject' ? 'rejected' : 'skipped', updated_at: now() } } }
      state.runs = [...state.runs.filter(item => item.run_id !== runId), run]
      writeState(state)

      return ok({ run }) as T
    }

    if (/\/run(?:\?|$)/.test(path)) { const run = { run_id: id('run'), workflow_id: workflowId, status: 'done', progress: { total: 2, completed: 2 }, started_at: now(), finished_at: now() }; state.runs.push(run); writeState(state);

 return ok({ run }) as T }

    if (method === 'DELETE') { state.workflows = state.workflows.filter(w => w.id !== workflowId); writeState(state);

 return ok({ workflows: state.workflows }) as T }
  }

  if (path === '/api/soul/authors') {
    if (method === 'POST') { const authorId = id('author'); const author = { id: authorId, slug: authorId, name: body.name || '示例作者', folder: `browser-dev://soul/${authorId}`, texts_count: 0, chunks_count: 0, web_evidence_count: 0, profile_version: 0, texts: [], chunks: [], profile: {} }; state.authors.push(author); writeState(state);

 return ok({ author }) as T }

    return ok({ authors: state.authors, active_author_id: state.authors[0]?.id || '' }) as T
  }

  const authorMatch = path.match(/^\/api\/soul\/authors\/([^/?]+)(?:\/(import|process|search|web-research|distill|critic|risk-check|export-skill|export|governance|purge|detail))?$/)

  if (authorMatch) {
    const authorId = decodeURIComponent(authorMatch[1])
    const action = authorMatch[2] || 'detail'
    const author = state.authors.find(a => a.id === authorId || a.slug === authorId) || state.authors[0]

    if (action === 'detail' && method === 'DELETE') { state.authors = state.authors.filter(a => a.id !== authorId); writeState(state);

 return ok({ deleted: authorId }) as T }

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

    if (action === 'search' && method === 'POST') {return ok({ query: body.query || '', vectorized: false, message: '未配置 embedding，使用关键词 fallback', results: (author?.chunks || [{ chunk_id: id('soul_result'), title: author?.name || '示例作者', chapter: '', scene: '', text: `Soul 检索预览：${body.query || ''}`, summary: `Soul 检索预览：${body.query || ''}`, embedding_type: 'paragraph', source_file: 'browser-dev', line_start: 1, tags: [], score: 1 }]) }) as T}

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

    if (action === 'critic' && method === 'POST') {return ok({ report: { policy: '只给批评和方法迁移建议', issues: ['冲突启动偏慢'], suggestions: ['把人物选择提前到段落前半部分'], safe_transfer_principles: ['保留方法论，移除可识别表达'] } }) as T}

    if (action === 'risk-check' && method === 'POST') {return ok({ report: { level: 'low', blocked: false, scores: { vocabulary_similarity: 0.12, sentence_similarity: 0.18 }, reductions: ['替换可识别意象', '改变段落节奏'] } }) as T}

    if (action === 'export-skill' && method === 'POST') {return ok({ skill_dir: `browser-dev://skills/${authorId}` }) as T}

    if (action === 'export' && method === 'POST') {return ok({ file: `browser-dev://${authorId}.json` }) as T}

    if (action === 'governance' && method === 'PUT') {
      const retentionDays = body.retention_days === 'forever' ? 'forever' : Number(body.retention_days || 30)
      state.authors = state.authors.map(a => a.id === authorId || a.slug === authorId ? { ...a, governance: { retention_days: retentionDays, updated_at: now() } } : a)
      writeState(state)

      return ok({ governance: { retention_days: retentionDays, updated_at: now() } }) as T
    }

    if (action === 'purge' && method === 'DELETE') {
      state.authors = state.authors.map(a => a.id === authorId || a.slug === authorId ? { ...a, chunks: [], chunks_count: 0, texts: [], texts_count: 0, web: { sources: [], claims: [], conflicts: [] }, web_evidence_count: 0 } : a)
      writeState(state)

      return ok({ usage: { bytes: 0, files: 0, folders: [] } }) as T
    }

    return ok({ author, governance: author?.governance || { retention_days: 30 }, usage: { bytes: 0, files: (author?.texts || []).length, folders: [] }, metadata: { texts: author?.texts || [] }, chunks: author?.chunks || [], profile: author?.profile || {}, web: author?.web || { sources: [], claims: [], conflicts: [] }, risk_profile: { checks: [] } }) as T
  }

  if (path === '/api/soul/fusion/preview') {
    const selected = Array.isArray(body.authors) ? body.authors.join('、') : '无'

    return ok({ preview: `融合结果只作为方法参考，不直接替代作者判断。\n已选择：${selected}` }) as T
  }

  if (path === '/api/prompt/enhance') {return ok({ text: `Karna 增强提示\n${body.text || ''}` }) as T}

  if (path === '/api/mcp/reload') {return ok({ servers: state.mcpServers.length, enabled: state.mcpServers.filter(s => s.enabled !== false).length }) as T}

  if (path === '/api/mcp/servers') {
    if (method === 'POST') { const server = { name: body.name, description: body.description || '', url: body.url || '', command: body.command || '', enabled: body.enabled !== false, tools: [] }; state.mcpServers.push(server); writeState(state);

 return ok({ server }) as T }

    return { servers: state.mcpServers, config_path: 'browser-dev://mcp_servers.json' } as T
  }

  const mcpMatch = path.match(/^\/api\/mcp\/servers\/([^/?]+)(?:\/(test|tools))?$/)

  if (mcpMatch) {
    const serverName = decodeURIComponent(mcpMatch[1])
    const action = mcpMatch[2] || ''
    const server = state.mcpServers.find(s => s.name === serverName)

    if (action === 'test' && method === 'POST') {return ok({ message: `${serverName} 测试通过`, transport: server?.transport || body.transport || 'custom' }) as T}

    if (action === 'tools') {return ok({ server: serverName, tools: server?.tools || [] }) as T}

    if (method === 'PATCH') { state.mcpServers = state.mcpServers.map(s => s.name === serverName ? { ...s, ...body } : s); writeState(state);

 return ok({ server: state.mcpServers.find(s => s.name === serverName) }) as T }

    if (method === 'DELETE') { state.mcpServers = state.mcpServers.filter(s => s.name !== serverName); writeState(state);

 return ok({ deleted: serverName }) as T }

    return (server || ok({ error: `MCP server not found: ${serverName}` })) as T
  }

  if (path === '/api/sessions') {return { sessions: [], total: 0, page: 1, page_size: 0 } as T}

  if (path === '/api/models') {return { models: [], current_model: '', provider: 'browser-dev' } as T}

  if (path === '/api/status') {return { gateway_state: 'browser-dev', gateway_running: false, version: 'browser-dev' } as T}

  return ok({}) as T
}

export const karnaBrowserDevApiForTest = api

export function installKarnaBrowserBridge() {
  if (typeof window === 'undefined' || window.hermesDesktop) {return}

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
