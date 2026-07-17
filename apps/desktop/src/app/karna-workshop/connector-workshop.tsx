import { SiArxiv, SiObsidian, SiWechat, SiZotero } from '@icons-pack/react-simple-icons'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { FieldRow, WorkshopEmpty, WorkshopMetric, WorkshopShell, WorkshopStatus, WorkshopTabs } from '@/components/karna/workshop'
import { PageLoader } from '@/components/page-loader'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { useDialogFocus } from '@/lib/use-dialog-focus'
import { cn } from '@/lib/utils'
import { BUILT_IN_MCPS, MCP_CATEGORIES, type BuiltInMcp } from './built-in-mcps'

type Category = 'all' | 'creative_core' | 'docs_storage' | 'research' | 'collaboration' | 'scene_reality' | 'publishing' | 'finance' | 'legal' | 'dev_tools' | 'marketing' | 'health' | 'travel'
type RiskLevel = 'low' | 'medium' | 'high'
type ConnectorStatus = 'available' | 'beta' | 'coming_soon' | 'experimental'
type AuthFieldType = 'text' | 'password' | 'url' | 'select' | 'file_path' | 'directory_path'
type Transport = 'stdio' | 'sse' | 'http'

interface AuthField {
  key: string
  label: string
  type: AuthFieldType
  required?: boolean
  placeholder?: string
  helpText?: string
  options?: string[]
}

interface ConnectorDefinition {
  id: string
  name: string
  displayName: string
  description: string
  category: Exclude<Category, 'all'>
  icon?: string
  provider: string
  type: string
  priority: 'S' | 'A' | 'B' | 'C'
  status: ConnectorStatus
  auth: { mode: string; fields: AuthField[] }
  permissions: Array<{ id: string; label: string; riskLevel?: RiskLevel }>
  toolsPreview: ConnectorTool[]
  dataPolicy: { localOnly: boolean; uploadsUserData: boolean; storesCredential: boolean; riskLevel: RiskLevel }
  docsUrl?: string
  phase?: string
  interfaceStatus?: string
  connected?: boolean
  instances?: ConnectorInstance[]
}

interface ConnectorTool {
  id?: string
  connectorInstanceId?: string
  name: string
  description: string
  inputSchema?: Record<string, unknown>
  riskLevel?: RiskLevel
  enabled?: boolean
  source?: string
}

interface ConnectorInstance {
  id: string
  connectorId: string
  displayName: string
  enabled: boolean
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  auth?: Record<string, unknown>
  credentialStored?: boolean
  discoveredTools: ConnectorTool[]
  lastConnectedAt?: string | null
  lastHealthCheckAt?: string | null
  errorMessage?: string | null
  definition?: ConnectorDefinition
  createdAt: string
  updatedAt: string
}

interface AuditLog {
  id: string
  createdAt: string
  connectorInstanceId?: string
  projectId?: string | null
  toolName: string
  inputSummary?: string
  input?: unknown
  outputSummary?: string
  status: string
  errorMessage?: string | null
}

const CATEGORIES: Array<{ id: Category; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'creative_core', label: '创作核心' },
  { id: 'docs_storage', label: '文档与网盘' },
  { id: 'research', label: '研究资料' },
  { id: 'collaboration', label: '协作办公' },
  { id: 'finance', label: '金融财经' },
  { id: 'legal', label: '法律合规' },
  { id: 'dev_tools', label: '开发工具' },
  { id: 'marketing', label: '营销增长' },
  { id: 'health', label: '健康医疗' },
  { id: 'travel', label: '旅行出行' },
  { id: 'scene_reality', label: '场景现实' },
  { id: 'publishing', label: '发布平台' }
]

const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(item => [item.id, item.label])) as Record<Category, string>

const STATUS_LABEL: Record<ConnectorStatus, string> = {
  available: '可用',
  beta: 'Beta',
  coming_soon: '规划中',
  experimental: '实验'
}

const RISK_LABEL: Record<RiskLevel, string> = { low: '低风险', medium: '中风险', high: '高风险' }
const RISK_TONE: Record<RiskLevel, 'success' | 'warning' | 'danger'> = { low: 'success', medium: 'warning', high: 'danger' }

const CATEGORY_COLORS: Record<string, { primary: string; gradient: string; from: string; to: string }> = {
  creative_core: { primary: '#5b6ee1', from: '#5b6ee1', to: '#8b5cf6', gradient: 'linear-gradient(135deg, #5b6ee1, #8b5cf6)' },
  docs_storage: { primary: '#23a36f', from: '#23a36f', to: '#14b8a6', gradient: 'linear-gradient(135deg, #23a36f, #14b8a6)' },
  research: { primary: '#d97706', from: '#d97706', to: '#ea580c', gradient: 'linear-gradient(135deg, #d97706, #ea580c)' },
  collaboration: { primary: '#db2777', from: '#db2777', to: '#e11d48', gradient: 'linear-gradient(135deg, #db2777, #e11d48)' },
  scene_reality: { primary: '#0891b2', from: '#0891b2', to: '#2563eb', gradient: 'linear-gradient(135deg, #0891b2, #2563eb)' },
  publishing: { primary: '#9333ea', from: '#9333ea', to: '#c026d3', gradient: 'linear-gradient(135deg, #9333ea, #c026d3)' },
}

const CATEGORY_LABELS: Record<string, string> = {
  creative_core: '创作核心',
  docs_storage: '文档与网盘',
  research: '研究资料',
  collaboration: '协作办公',
  scene_reality: '场景现实',
  publishing: '发布平台',
}

type ConnectorAvatarIconKind = 'writer' | 'story' | 'state' | 'wiki' | 'search' | 'soul' | 'obsidian' | 'zotero' | 'arxiv' | 'wechat' | 'wps' | 'baidu_netdisk' | 'web' | 'browser' | 'mcp' | 'location'
type ConnectorAvatarConfig = {
  label: string
  gradient: string
  glow: string
  icon: ConnectorAvatarIconKind
  imageSrc?: string
  sourceUrl?: string
}

const CONNECTOR_AVATARS: Record<string, ConnectorAvatarConfig> = {
  writer_workspace: { label: 'Writer Workspace', icon: 'writer', gradient: 'linear-gradient(135deg, #2563eb, #7c3aed)', glow: 'rgba(37, 99, 235, 0.22)' },
  story_bible: { label: 'Story Bible', icon: 'story', gradient: 'linear-gradient(135deg, #7c3aed, #db2777)', glow: 'rgba(124, 58, 237, 0.22)' },
  narrative_state: { label: 'Narrative State', icon: 'state', gradient: 'linear-gradient(135deg, #0891b2, #2563eb)', glow: 'rgba(8, 145, 178, 0.22)' },
  living_wiki: { label: 'Living Wiki', icon: 'wiki', gradient: 'linear-gradient(135deg, #059669, #0d9488)', glow: 'rgba(5, 150, 105, 0.22)' },
  creative_search: { label: 'Creative Search', icon: 'search', gradient: 'linear-gradient(135deg, #f59e0b, #ef4444)', glow: 'rgba(245, 158, 11, 0.22)' },
  soul_workshop: { label: 'Soul Workshop', icon: 'soul', gradient: 'linear-gradient(135deg, #ec4899, #8b5cf6)', glow: 'rgba(236, 72, 153, 0.22)' },
  obsidian_vault: { label: 'Obsidian', icon: 'obsidian', gradient: 'linear-gradient(135deg, #4c1d95, #8b5cf6)', glow: 'rgba(109, 40, 217, 0.24)', sourceUrl: 'https://obsidian.md/' },
  wps_docs: { label: 'WPS Office', icon: 'wps', imageSrc: '/connector-icons/wps-office.webp', gradient: 'linear-gradient(135deg, #dc2626, #f97316)', glow: 'rgba(220, 38, 38, 0.20)', sourceUrl: 'https://play.google.com/store/apps/details?id=cn.wps.moffice_eng' },
  baidu_netdisk: { label: 'Baidu Netdisk', icon: 'baidu_netdisk', imageSrc: '/connector-icons/baidu-netdisk.webp', gradient: 'linear-gradient(135deg, #1d4ed8, #38bdf8)', glow: 'rgba(37, 99, 235, 0.20)', sourceUrl: 'https://play.google.com/store/apps/details?id=com.baidu.drive.app' },
  web_search: { label: 'Web Search', icon: 'web', gradient: 'linear-gradient(135deg, #0ea5e9, #22c55e)', glow: 'rgba(14, 165, 233, 0.20)' },
  browser_reader: { label: 'Browser Reader', icon: 'browser', imageSrc: '/connector-icons/chrome.png', gradient: 'linear-gradient(135deg, #f97316, #f59e0b)', glow: 'rgba(249, 115, 22, 0.20)', sourceUrl: 'https://play.google.com/store/apps/details?id=com.android.chrome' },
  feishu_docs: { label: 'Feishu Docs', icon: 'browser', imageSrc: '/connector-icons/feishu.jpg', gradient: 'linear-gradient(135deg, #2563eb, #60a5fa)', glow: 'rgba(37, 99, 235, 0.20)', sourceUrl: 'https://apps.apple.com/app/id1401729613' },
  tencent_docs: { label: 'Tencent Docs', icon: 'browser', imageSrc: '/connector-icons/tencent-docs.jpg', gradient: 'linear-gradient(135deg, #2563eb, #38bdf8)', glow: 'rgba(37, 99, 235, 0.20)', sourceUrl: 'https://apps.apple.com/app/id1370780836' },
  wechat_reading: { label: 'WeChat Reading', icon: 'browser', imageSrc: '/connector-icons/wechat-reading.jpg', gradient: 'linear-gradient(135deg, #16a34a, #22c55e)', glow: 'rgba(34, 197, 94, 0.20)', sourceUrl: 'https://apps.apple.com/app/id952059546' },
  zotero_library: { label: 'Zotero', icon: 'zotero', gradient: 'linear-gradient(135deg, #b91c1c, #ef4444)', glow: 'rgba(185, 28, 28, 0.20)', sourceUrl: 'https://www.zotero.org/' },
  arxiv_search: { label: 'arXiv', icon: 'arxiv', gradient: 'linear-gradient(135deg, #991b1b, #7f1d1d)', glow: 'rgba(153, 27, 27, 0.20)', sourceUrl: 'https://arxiv.org/' },
  feishu: { label: 'Feishu', icon: 'browser', imageSrc: '/connector-icons/feishu.jpg', gradient: 'linear-gradient(135deg, #2563eb, #60a5fa)', glow: 'rgba(37, 99, 235, 0.20)', sourceUrl: 'https://apps.apple.com/app/id1401729613' },
  dingtalk: { label: 'DingTalk', icon: 'browser', imageSrc: '/connector-icons/dingtalk.png', gradient: 'linear-gradient(135deg, #0ea5e9, #2563eb)', glow: 'rgba(14, 165, 233, 0.20)', sourceUrl: 'https://play.google.com/store/apps/details?id=com.alibaba.android.rimet' },
  wechat_work_bot: { label: 'WeCom', icon: 'browser', imageSrc: '/connector-icons/wecom.png', gradient: 'linear-gradient(135deg, #0ea5e9, #22c55e)', glow: 'rgba(14, 165, 233, 0.20)', sourceUrl: 'https://play.google.com/store/apps/details?id=com.tencent.wework' },
  mail: { label: 'Mail', icon: 'browser', imageSrc: '/connector-icons/gmail.png', gradient: 'linear-gradient(135deg, #dc2626, #f97316)', glow: 'rgba(220, 38, 38, 0.18)', sourceUrl: 'https://play.google.com/store/apps/details?id=com.google.android.gm' },
  calendar: { label: 'Calendar', icon: 'browser', imageSrc: '/connector-icons/google-calendar.png', gradient: 'linear-gradient(135deg, #2563eb, #22c55e)', glow: 'rgba(37, 99, 235, 0.18)', sourceUrl: 'https://play.google.com/store/apps/details?id=com.google.android.calendar' },
  baidu_map: { label: 'Baidu Map', icon: 'browser', imageSrc: '/connector-icons/baidu-map.png', gradient: 'linear-gradient(135deg, #2563eb, #60a5fa)', glow: 'rgba(37, 99, 235, 0.20)', sourceUrl: 'https://play.google.com/store/apps/details?id=com.baidu.BaiduMap' },
  amap: { label: 'Amap', icon: 'browser', imageSrc: '/connector-icons/amap.jpg', gradient: 'linear-gradient(135deg, #2563eb, #38bdf8)', glow: 'rgba(37, 99, 235, 0.20)', sourceUrl: 'https://play.google.com/store/apps/details?id=com.autonavi.minimap' },
  tencent_location: { label: '腾讯位置服务', icon: 'location', gradient: 'linear-gradient(135deg, #0ea5e9, #2563eb)', glow: 'rgba(14, 165, 233, 0.20)', sourceUrl: 'https://sj.qq.com/appdetail/com.tencent.map' },
  wechat_official: { label: 'WeChat Official Account', icon: 'wechat', gradient: 'linear-gradient(135deg, #16a34a, #22c55e)', glow: 'rgba(34, 197, 94, 0.20)', sourceUrl: 'https://weixin.qq.com/' },
  zhihu: { label: 'Zhihu', icon: 'browser', imageSrc: '/connector-icons/zhihu.png', gradient: 'linear-gradient(135deg, #2563eb, #0ea5e9)', glow: 'rgba(37, 99, 235, 0.20)', sourceUrl: 'https://play.google.com/store/apps/details?id=com.zhihu.android' },
  xiaohongshu: { label: 'Xiaohongshu', icon: 'browser', imageSrc: '/connector-icons/xiaohongshu.png', gradient: 'linear-gradient(135deg, #dc2626, #ef4444)', glow: 'rgba(220, 38, 38, 0.20)', sourceUrl: 'https://play.google.com/store/apps/details?id=com.xingin.xhs' },
  wordpress: { label: 'WordPress', icon: 'browser', imageSrc: '/connector-icons/wordpress.png', gradient: 'linear-gradient(135deg, #1e40af, #0f172a)', glow: 'rgba(30, 64, 175, 0.18)', sourceUrl: 'https://play.google.com/store/apps/details?id=org.wordpress.android' },
  substack: { label: 'Substack', icon: 'browser', imageSrc: '/connector-icons/substack.png', gradient: 'linear-gradient(135deg, #f97316, #ea580c)', glow: 'rgba(249, 115, 22, 0.20)', sourceUrl: 'https://play.google.com/store/apps/details?id=com.substack.app' },
  custom_mcp: { label: 'Custom MCP', icon: 'mcp', gradient: 'linear-gradient(135deg, #111827, #4b5563)', glow: 'rgba(17, 24, 39, 0.16)' },
}

const FALLBACK_COLOR = { primary: '#888888', from: '#888888', to: '#666666', gradient: 'linear-gradient(135deg, #888888, #666666)' }

function getCategoryColor(category: string) {
  return CATEGORY_COLORS[category] || FALLBACK_COLOR
}

const connectorApi = {
  definitions: () => window.karnaDesktop.api<{ items: ConnectorDefinition[] }>({ path: '/api/connectors/definitions' }),
  advancedDefinitions: () => window.karnaDesktop.api<{ items: ConnectorDefinition[] }>({ path: '/api/connectors/advanced-definitions' }),
  instances: () => window.karnaDesktop.api<{ items: ConnectorInstance[] }>({ path: '/api/connectors/instances' }),
  create: (body: Record<string, unknown>) => window.karnaDesktop.api<ConnectorInstance>({ path: '/api/connectors/instances', method: 'POST', body }),
  update: (id: string, body: Record<string, unknown>) => window.karnaDesktop.api<ConnectorInstance>({ path: `/api/connectors/instances/${encodeURIComponent(id)}`, method: 'PATCH', body }),
  remove: (id: string) => window.karnaDesktop.api<{ ok: boolean }>({ path: `/api/connectors/instances/${encodeURIComponent(id)}`, method: 'DELETE' }),
  deleteCredential: (id: string) => window.karnaDesktop.api<ConnectorInstance>({ path: `/api/connectors/instances/${encodeURIComponent(id)}/credential`, method: 'DELETE' }),
  test: (id: string) => window.karnaDesktop.api<{ ok: boolean; status: string; error?: string | null; tools: ConnectorTool[]; instance: ConnectorInstance }>({ path: `/api/connectors/instances/${encodeURIComponent(id)}/test`, method: 'POST' }),
  toggleTool: (id: string, enabled: boolean) => window.karnaDesktop.api<{ ok: boolean; tool: ConnectorTool }>({ path: `/api/connectors/tools/${encodeURIComponent(id)}`, method: 'PATCH', body: { enabled } }),
  callTool: (id: string, argumentsValue: Record<string, unknown>, confirmed = false, projectId = '') => window.karnaDesktop.api<{ ok: boolean; tool: ConnectorTool; output: unknown }>({ path: `/api/connectors/tools/${encodeURIComponent(id)}/call`, method: 'POST', body: { arguments: argumentsValue, confirmed, project_id: projectId || undefined } }),
  audit: (instanceId?: string, projectId?: string) => window.karnaDesktop.api<{ items: AuditLog[] }>({ path: `/api/connectors/audit-logs?limit=80${instanceId ? `&instance_id=${encodeURIComponent(instanceId)}` : ''}${projectId ? `&project_id=${encodeURIComponent(projectId)}` : ''}` }),
  healthAll: () => window.karnaDesktop.api<{ ok: boolean }>({ path: '/api/connectors/health-check', method: 'POST' }),
  route: (text: string) => window.karnaDesktop.api<{ intent: string; tools: ConnectorTool[] }>({ path: '/api/connectors/router/candidates', method: 'POST', body: { text } })
}

export function normalizeConnectorTools(value: unknown): ConnectorTool[] {
  if (!Array.isArray(value)) {return []}

  return value
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const row = item as Record<string, unknown>

      return {
        id: typeof row.id === 'string' ? row.id : undefined,
        connectorInstanceId: typeof row.connectorInstanceId === 'string' ? row.connectorInstanceId : undefined,
        name: typeof row.name === 'string' ? row.name : 'unnamed_tool',
        description: typeof row.description === 'string' ? row.description : '',
        inputSchema: row.inputSchema && typeof row.inputSchema === 'object' ? row.inputSchema as Record<string, unknown> : undefined,
        riskLevel: row.riskLevel === 'high' || row.riskLevel === 'medium' || row.riskLevel === 'low' ? row.riskLevel : 'low',
        enabled: row.enabled === false ? false : true,
        source: typeof row.source === 'string' ? row.source : undefined
      }
    })
}

export function normalizeRouterResult(value: unknown): { intent: string; tools: ConnectorTool[] } {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {}

  return {
    intent: typeof row.intent === 'string' ? row.intent : 'general',
    tools: normalizeConnectorTools(row.tools ?? row.candidates)
  }
}

export function ConnectorWorkshopView() {
  const [definitions, setDefinitions] = useState<ConnectorDefinition[]>([])
  const [instances, setInstances] = useState<ConnectorInstance[]>([])
  const [audits, setAudits] = useState<AuditLog[]>([])
  const [category, setCategory] = useState<Category>('all')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [authTarget, setAuthTarget] = useState<ConnectorDefinition | null>(null)
  const [detail, setDetail] = useState<ConnectorInstance | null>(null)
  const [customOpen, setCustomOpen] = useState(false)
  const [routerText, setRouterText] = useState('帮我检索 12 世纪欧洲市集动物与人物动作')
  const [routerResult, setRouterResult] = useState<{ intent: string; tools: ConnectorTool[] } | null>(null)
  const [demoCalloutDismissed, setDemoCalloutDismissed] = useState(false)
  const isBrowserMode = typeof window !== 'undefined' && !window.karnaDesktop

  const refresh = useCallback(async () => {
    setError(null)

    try {
      const [defs, inst, logs, advancedResult] = await Promise.all([connectorApi.definitions(), connectorApi.instances(), connectorApi.audit(), connectorApi.advancedDefinitions().catch(() => ({ items: [] as ConnectorDefinition[] }))])
      const baseItems = defs.items || []
      const advancedItems = advancedResult.items || []
      const seen = new Set<string>()

      const merged = [...baseItems, ...advancedItems].filter(definition => {
        if (seen.has(definition.id)) {return false}
        seen.add(definition.id)

        return true
      })

      const builtInDefs: ConnectorDefinition[] = BUILT_IN_MCPS.map(mcp => ({
        id: `builtin_${mcp.id}`,
        name: mcp.name,
        displayName: mcp.displayName,
        description: mcp.description,
        category: mcp.category as Exclude<Category, 'all'>,
        icon: mcp.icon,
        provider: mcp.provider,
        type: 'builtin_mcp',
        priority: mcp.priority,
        status: mcp.status,
        auth: {
          mode: mcp.authMode,
          fields: mcp.authMode === 'api_key'
            ? [{ key: 'api_key', label: 'API Key', type: 'password' as const, required: true, placeholder: '请输入 API Key' }]
            : mcp.authMode === 'oauth'
              ? [{ key: 'oauth', label: 'OAuth 授权', type: 'text' as const, required: false, helpText: '点击下方按钮跳转授权页面' }]
              : []
        },
        permissions: [],
        toolsPreview: mcp.toolsPreview.map(t => ({ name: t.name, description: t.description })),
        dataPolicy: { localOnly: false, uploadsUserData: true, storesCredential: true, riskLevel: 'medium' as const },
        docsUrl: mcp.docsUrl,
        phase: 'built-in',
      }))

      const allDefs = [...builtInDefs, ...merged].filter(def => {
        if (seen.has(def.id)) return false
        seen.add(def.id)
        return true
      })

      setDefinitions(allDefs)
      setInstances(inst.items || [])
      setAudits(logs.items || [])

      if (detail) {
        setDetail((inst.items || []).find(item => item.id === detail.id) || null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [detail])

  useEffect(() => { void refresh() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const instanceByConnector = useMemo(() => {
    const map = new Map<string, ConnectorInstance[]>()

    for (const instance of instances) {
      const arr = map.get(instance.connectorId) || []
      arr.push(instance)
      map.set(instance.connectorId, arr)
    }

    return map
  }, [instances])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()

    return definitions.filter(def => {
      if (def.status === 'coming_soon') {return false}

      if (category !== 'all' && def.category !== category) {return false}

      if (!needle) {return true}

      return [def.id, def.name, def.displayName, def.description, def.provider].join(' ').toLowerCase().includes(needle)
    })
  }, [category, definitions, query])

  const stats = useMemo(() => {
    const connected = instances.filter(i => i.connectionStatus === 'connected').length
    const enabledTools = instances.flatMap(i => i.discoveredTools || []).filter(t => t.enabled !== false).length
    const errors = instances.filter(i => i.connectionStatus === 'error').length

    return { connected, enabledTools, errors }
  }, [instances])

  const runHealthAll = async () => {
    setBusy('health')

    try {
      await connectorApi.healthAll()
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  const runRouter = async () => {
    setBusy('router')

    try {
      setRouterResult(normalizeRouterResult(await connectorApi.route(routerText)))
    } finally {
      setBusy(null)
    }
  }

  if (loading) {return <PageLoader label="正在加载连接器工坊" />}

  return (
    <WorkshopShell
      description="Writer OS 的能力连接面板：统一接入创作资料、文档网盘、研究资源、浏览器阅读与 MCP Server，并集中管理授权、工具发现和调用权限。"
      right={
        <>
          <Button disabled={busy === 'health'} onClick={() => void runHealthAll()} size="xs" variant="outline"><Codicon name="pulse" /> 全部检查</Button>
          <Button onClick={() => setCustomOpen(true)} size="xs"><Codicon name="plug" /> 自定义连接器</Button>
          <Button onClick={() => void refresh()} size="xs" variant="text"><Codicon name="refresh" /> 刷新</Button>
        </>
      }
      title="连接器工坊"
    >
      <style>{`
        .field {
          width: 100%;
          border-radius: 3px;
          border: 1px solid var(--ui-stroke-tertiary);
          background: color-mix(in srgb, var(--ui-bg-primary) 88%, #0f0f10);
          padding: 0.45rem 0.55rem;
          font-size: 0.78rem;
          outline: none;
        }
        .field:focus { border-color: var(--ui-accent); }
      `}</style>
      {isBrowserMode && !demoCalloutDismissed && (
        <div className="mx-6 mt-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
          <Codicon className="mt-0.5 flex-shrink-0 text-amber-500" name="globe" size={18} />
          <div className="flex-1 text-amber-700 dark:text-amber-200">
            🌐 浏览器演示模式：当前仅显示 3 个示例连接器。安装桌面版可管理真实 MCP 服务器、配置认证和权限。
          </div>
          <button
            className="flex-shrink-0 rounded-md p-1 text-amber-600 hover:bg-amber-500/20 hover:text-amber-700 dark:text-amber-300 dark:hover:text-amber-200"
            onClick={() => setDemoCalloutDismissed(true)}
            type="button"
          >
            <Codicon name="close" size={16} />
          </button>
        </div>
      )}
      <WorkshopTabs
        active={category}
        onChange={id => setCategory(id as Category)}
        tabs={CATEGORIES.map(tab => ({ id: tab.id, label: tab.label, count: tab.id === 'all' ? definitions.filter(d => d.status !== 'coming_soon').length : definitions.filter(d => d.status !== 'coming_soon' && d.category === tab.id).length }))}
      />

      <div className="grid gap-5 px-6 py-5">
        {error ? <div className="rounded-[3px] border border-[var(--dt-destructive)]/30 bg-[var(--dt-destructive)]/8 px-3 py-2 text-xs text-[var(--dt-destructive)]">加载失败：{error}</div> : null}

        <div className="grid gap-3 md:grid-cols-4">
          <WorkshopMetric accent="emerald" label="已连接" value={stats.connected} />
          <WorkshopMetric accent="sky" label="启用工具" value={stats.enabledTools} />
          <WorkshopMetric accent="rose" label="异常连接" value={stats.errors} />
          <WorkshopMetric accent="amber" hint="基础与扩展接口已合并" label="连接器" value={definitions.length} />
        </div>

        <div className="grid gap-3 rounded-[14px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-3 shadow-sm md:grid-cols-[1fr_auto]">
          <div className="relative">
            <Codicon className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" name="search" />
            <input className="w-full rounded-[10px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/90 py-2 pl-9 pr-3 text-sm text-[var(--theme-foreground)] outline-none transition-colors placeholder:text-[var(--theme-foreground)]/40 focus:border-[var(--theme-primary)] focus:bg-[var(--theme-card-seed)]" onChange={event => setQuery(event.target.value)} placeholder="搜索连接器、提供商或能力说明" value={query} />
          </div>
          <div className="flex items-center gap-2 text-[0.7rem] text-muted-foreground">
            <WorkshopStatus tone="info">权限控权</WorkshopStatus>
            <WorkshopStatus tone="warning">凭据加密存储</WorkshopStatus>
            <WorkshopStatus tone="success">Tool Discovery</WorkshopStatus>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visible.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3 2xl:col-span-4">
              <WorkshopEmpty>{definitions.length === 0 ? '连接器接口暂未返回数据，可先添加自定义 MCP，或在桌面模式下刷新真实连接器注册表。' : '没有匹配的连接器'}</WorkshopEmpty>
            </div>
          ) : visible.map(def => (
              <ConnectorCard
                definition={def}
                instances={instanceByConnector.get(def.id) || []}
                key={def.id}
                onAdd={() => setAuthTarget(def)}
                onDetail={instance => setDetail(instance)}
              />
            ))}
          <CustomMcpCard onAdd={() => setCustomOpen(true)} />
        </div>

        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <section className="rounded-[3px] border border-(--ui-stroke-tertiary) bg-background/80 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Tool Router 基础验证</h2>
                <p className="text-[0.7rem] text-muted-foreground">规则路由会根据创作意图返回当前已启用连接器工具候选。</p>
              </div>
              <Button disabled={busy === 'router'} onClick={() => void runRouter()} size="xs"><Codicon name="type-hierarchy" /> 路由</Button>
            </div>
            <textarea className="min-h-20 w-full rounded-[3px] border border-(--ui-stroke-tertiary) bg-background px-2 py-2 text-xs outline-none focus:border-(--ui-accent)" onChange={event => setRouterText(event.target.value)} value={routerText} />
            {routerResult ? (
              <div className="mt-2 rounded-[3px] border border-(--ui-stroke-tertiary) bg-background/70 p-2 text-xs">
                <div className="mb-1 text-muted-foreground">Intent: <span className="font-mono text-foreground">{routerResult.intent}</span></div>
                <div className="flex flex-wrap gap-1">
                  {(routerResult.tools || []).length === 0 ? <span className="text-muted-foreground">暂无候选工具；先连接对应连接器。</span> : routerResult.tools.map(tool => <WorkshopStatus key={tool.id || tool.name} tone="info">{tool.name}</WorkshopStatus>)}
                </div>
              </div>
            ) : null}
          </section>
          <section className="rounded-[3px] border border-(--ui-stroke-tertiary) bg-background/80 p-3">
            <h2 className="mb-2 text-sm font-semibold">最近调用日志</h2>
            <AuditList rows={audits.slice(0, 6)} />
          </section>
        </div>
      </div>

      {authTarget ? (
        <ConnectorAuthModal
          definition={authTarget}
          onClose={() => setAuthTarget(null)}
          onSaved={async instance => {
            setAuthTarget(null)
            await refresh()
            setDetail(instance)
          }}
        />
      ) : null}
      {detail ? <ConnectorDetailDrawer instance={detail} onChanged={refresh} onClose={() => setDetail(null)} /> : null}
      {customOpen ? <CustomConnectorModal onClose={() => setCustomOpen(false)} onSaved={async instance => { setCustomOpen(false); await refresh(); setDetail(instance) }} /> : null}
    </WorkshopShell>
  )
}

function ConnectorCard({ definition, instances, onAdd, onDetail }: { definition: ConnectorDefinition; instances: ConnectorInstance[]; onAdd: () => void; onDetail: (instance: ConnectorInstance) => void }) {
  const primary = instances[0]
  const risk = definition.dataPolicy.riskLevel
  const isConnected = primary?.connectionStatus === 'connected'
  const needsCheck = !!primary && primary.connectionStatus !== 'connected'
  const tools = primary?.discoveredTools?.length ? primary.discoveredTools : definition.toolsPreview
  const visibleTools = tools.slice(0, 3)
  const extraTools = Math.max(0, tools.length - visibleTools.length)
  const toolCount = primary?.discoveredTools?.length || definition.toolsPreview.length
  const avatar = CONNECTOR_AVATARS[definition.id] || { label: definition.displayName || definition.id, icon: 'mcp' as const, gradient: '', glow: '' }

  const builtInMcp = definition.type === 'builtin_mcp'
    ? BUILT_IN_MCPS.find(m => `builtin_${m.id}` === definition.id)
    : null

  const handleConnect = () => {
    if (builtInMcp && builtInMcp.authMode === 'oauth' && builtInMcp.loginUrl) {
      window.open(builtInMcp.loginUrl, '_blank', 'noopener,noreferrer')
      return
    }
    onAdd()
  }

  return (
    <article className="group relative flex min-h-[240px] flex-col rounded-[3px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/90 p-4 transition-colors hover:border-[var(--theme-primary)]/30">

      <div className="relative grid flex-1 gap-3">
        <header className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {builtInMcp ? (
              <BuiltInMcpAvatar mcp={builtInMcp} />
            ) : (
              <ConnectorAvatar avatar={avatar} />
            )}
            <div className="min-w-0">
              <h3 className="truncate text-[13px] font-medium tracking-tight text-[var(--theme-foreground)]">{definition.displayName}</h3>
              <p className="mt-0.5 truncate text-[10.5px] text-[var(--theme-foreground)]/55">{definition.provider} · {builtInMcp ? '内置 MCP' : definition.type}</p>
            </div>
          </div>
          {primary ? <ConnectionDot status={primary.connectionStatus} /> : <WorkshopStatus tone={definition.status === 'beta' ? 'info' : 'neutral'}>{STATUS_LABEL[definition.status]}</WorkshopStatus>}
        </header>

        <p className="min-h-[36px] text-[11.5px] leading-[1.55] text-[var(--theme-foreground)]/65 line-clamp-2">{definition.description}</p>

        <div className="flex flex-wrap gap-1">
          <span className="rounded-[2px] bg-[var(--theme-secondary)]/30 px-1.5 py-0.5 text-[10px] font-medium text-[var(--theme-foreground)]/70 ring-1 ring-[var(--dt-border)]">{CATEGORY_LABELS[definition.category] || CATEGORY_LABEL[definition.category]}</span>
          <WorkshopStatus tone={RISK_TONE[risk]}>{RISK_LABEL[risk]}</WorkshopStatus>
          {builtInMcp?.authMode === 'oauth' && <WorkshopStatus tone="success">一键授权</WorkshopStatus>}
          {primary?.enabled === false ? <WorkshopStatus tone="warning">已禁用</WorkshopStatus> : null}
        </div>

        {visibleTools.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {visibleTools.map(tool => (
            <span className="max-w-[140px] truncate rounded-[2px] bg-[var(--theme-secondary)]/20 px-1.5 py-0.5 text-[10px] font-medium text-[var(--theme-foreground)]/60" key={tool.name}>
              {tool.name}
            </span>
          ))}
          {extraTools > 0 ? <span className="rounded-[2px] bg-[var(--theme-secondary)]/25 px-1.5 py-0.5 text-[10px] font-medium text-[var(--theme-foreground)]/55">+{extraTools}</span> : null}
          </div>
        ) : null}
      </div>

      <ConnectorCardFooter
        isConnected={isConnected}
        needsCheck={needsCheck}
        onAdd={handleConnect}
        onDetail={primary ? () => onDetail(primary) : undefined}
        toolCount={toolCount}
        isOauthBuiltIn={builtInMcp?.authMode === 'oauth'}
      />
    </article>
  )
}

function BuiltInMcpAvatar({ mcp }: { mcp: BuiltInMcp }) {
  const [imgError, setImgError] = useState(false)
  const showImage = mcp.iconImage && !imgError

  return (
    <div
      aria-label={mcp.displayName}
      className={cn(
        "relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[3px] ring-1 ring-black/10 dark:ring-white/10",
        showImage ? "bg-[var(--theme-card-seed)]" : "text-lg"
      )}
      style={!showImage ? { backgroundColor: mcp.bgColor, color: mcp.textColor } : undefined}
      title={mcp.displayName}
    >
      {showImage ? (
        <img
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          onError={() => setImgError(true)}
          src={mcp.iconImage}
        />
      ) : (
        <img alt="" className="h-full w-full object-cover" draggable={false} src="/connector-icons/karna-connector.svg" />
      )}
    </div>
  )
}

function ConnectorAvatar({ avatar }: { avatar: ConnectorAvatarConfig }) {
  const [imgError, setImgError] = useState(false)
  const showImage = avatar.imageSrc && !imgError

  return (
    <div aria-label={avatar.label} className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[3px] text-[12px] font-bold ring-1 ring-[var(--dt-border)] text-[var(--theme-primary)]", showImage ? "bg-[var(--theme-card-seed)]" : "bg-[var(--theme-primary)]/10")} title={avatar.sourceUrl ? `${avatar.label} - official icon` : avatar.label}>
      {showImage ? (
        <img
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          onError={() => setImgError(true)}
          src={avatar.imageSrc}
        />
      ) : (
        <ConnectorAvatarIcon icon={avatar.icon} />
      )}
    </div>
  )
}

function ConnectorAvatarIcon({ icon }: { icon: ConnectorAvatarIconKind }) {
  if (icon === 'obsidian') {return <SiObsidian aria-hidden="true" className="h-5 w-5" />}

  if (icon === 'zotero') {return <SiZotero aria-hidden="true" className="h-5 w-5" />}

  if (icon === 'arxiv') {return <SiArxiv aria-hidden="true" className="h-5 w-5" />}

  if (icon === 'wechat') {return <SiWechat aria-hidden="true" className="h-5 w-5" />}

  if (icon === 'writer') {return <Codicon className="text-[18px]" name="files" />}

  if (icon === 'story') {return <Codicon className="text-[18px]" name="book" />}

  if (icon === 'state') {return <Codicon className="text-[18px]" name="git-branch" />}

  if (icon === 'wiki') {return <Codicon className="text-[18px]" name="repo" />}

  if (icon === 'search') {return <Codicon className="text-[18px]" name="search" />}

  if (icon === 'soul') {return <Codicon className="text-[18px]" name="sparkle" />}

  if (icon === 'web') {return <Codicon className="text-[19px]" name="globe" />}

  if (icon === 'browser') {return <Codicon className="text-[19px]" name="browser" />}

  if (icon === 'wps') {return <Codicon className="text-[19px]" name="file" />}

  if (icon === 'baidu_netdisk') {return <Codicon className="text-[19px]" name="cloud" />}

  if (icon === 'location') {return <Codicon className="text-[19px]" name="location" />}

  return <Codicon className="text-[19px]" name="server" />
}

function ConnectorCardFooter({ isConnected, needsCheck, onAdd, onDetail, toolCount, isOauthBuiltIn }: { isConnected: boolean; needsCheck: boolean; onAdd: () => void; onDetail?: () => void; toolCount: number; isOauthBuiltIn?: boolean }) {
// Static UI copy sample: 工具 · 未连接
  const statusText = isConnected ? '已连接' : needsCheck ? '需检查' : '未连接'

  return (
    <div className="relative mt-3 flex shrink-0 items-center justify-between gap-3 border-t border-[var(--dt-border)] pt-3">
      <span className="min-w-0 truncate text-[10.5px] text-[var(--theme-foreground)]/60">{toolCount} 工具 · {statusText}</span>
      {onDetail ? (
        <button className="shrink-0 rounded-[2px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/90 px-3.5 py-1.5 text-[11px] font-medium text-[var(--theme-foreground)] transition-colors hover:border-[var(--theme-primary)]/50 focus:outline-none" onClick={onDetail} type="button">
          详情
        </button>
      ) : (
        <button className="shrink-0 rounded-[2px] border border-[var(--theme-primary)]/40 bg-[var(--theme-primary)]/8 px-3.5 py-1.5 text-[11px] font-medium text-[var(--theme-primary)] transition-colors hover:bg-[var(--theme-primary)]/15 hover:border-[var(--theme-primary)]/60 focus:outline-none" onClick={onAdd} type="button">
          {isOauthBuiltIn ? '一键授权' : '连接'}
        </button>
      )}
    </div>
  )
}

function CustomMcpCard({ onAdd }: { onAdd: () => void }) {
  const avatar = CONNECTOR_AVATARS.custom_mcp

  return (
    <article className="group relative flex min-h-[240px] flex-col rounded-[3px] border border-dashed border-[var(--dt-border)] bg-[var(--theme-card-seed)]/70 p-4 transition-colors hover:border-[var(--theme-primary)]/50">
      <div className="relative grid flex-1 gap-3">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <ConnectorAvatar avatar={avatar} />
            <div className="min-w-0">
              <h3 className="truncate text-[13px] font-medium tracking-tight text-[var(--theme-foreground)]">自定义 MCP Server</h3>
              <p className="mt-0.5 text-[10.5px] text-[var(--theme-foreground)]/55">stdio · SSE · HTTP</p>
            </div>
          </div>
          <WorkshopStatus tone="info">扩展</WorkshopStatus>
        </header>
        <p className="min-h-[36px] text-[11.5px] leading-[1.55] text-[var(--theme-foreground)]/65">接入你自己的 MCP 服务，发现工具后加入 Writer OS 能力路由。</p>
        <div className="flex flex-wrap gap-1">
          <span className="rounded-[2px] bg-[var(--theme-secondary)]/30 px-1.5 py-0.5 text-[10px] font-medium text-[var(--theme-foreground)]/70 ring-1 ring-[var(--dt-border)]">自定义连接器</span>
          <span className="rounded-[2px] bg-[var(--theme-secondary)]/20 px-1.5 py-0.5 text-[10px] font-medium text-[var(--theme-foreground)]/60">tools/list</span>
          <span className="rounded-[2px] bg-[var(--theme-secondary)]/20 px-1.5 py-0.5 text-[10px] font-medium text-[var(--theme-foreground)]/60">tools/call</span>
        </div>
      </div>
      <div className="relative mt-3 flex shrink-0 items-center justify-between gap-3 border-t border-[var(--dt-border)] pt-3">
        <span className="min-w-0 truncate text-[10.5px] text-[var(--theme-foreground)]/60">粘贴 JSON · 不占用 registry</span>
        <button className="shrink-0 rounded-[2px] border border-[var(--theme-primary)]/40 bg-[var(--theme-primary)]/8 px-3.5 py-1.5 text-[11px] font-medium text-[var(--theme-primary)] transition-colors hover:bg-[var(--theme-primary)]/15 hover:border-[var(--theme-primary)]/60 focus:outline-none" onClick={onAdd} type="button">
          添加
        </button>
      </div>
    </article>
  )
}

function ConnectionDot({ status }: { status: ConnectorInstance['connectionStatus'] }) {
  const tone = status === 'connected' ? 'success' : status === 'error' ? 'danger' : status === 'connecting' ? 'busy' : 'neutral'
  const label = status === 'connected' ? '已连接' : status === 'error' ? '异常' : status === 'connecting' ? '连接中' : '未连接'

  return <WorkshopStatus tone={tone}>{label}</WorkshopStatus>
}

function ConnectorAuthModal({ definition, onClose, onSaved }: { definition: ConnectorDefinition; onClose: () => void; onSaved: (instance: ConnectorInstance) => void }) {
  const initial = Object.fromEntries((definition.auth.fields || []).map(field => [field.key, '']))
  const [auth, setAuth] = useState<Record<string, string>>(initial)
  const [displayName, setDisplayName] = useState(definition.displayName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const missing = (definition.auth.fields || []).find(field => field.required && !String(auth[field.key] || '').trim())

    if (missing) {
      setError(`请填写：${missing.label}`)

      return
    }

    setSaving(true)
    setError(null)

    try {
      const instance = await connectorApi.create({ connectorId: definition.id, displayName, auth })
      await connectorApi.test(instance.id).catch(() => null)
      onSaved(instance)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal onClose={onClose} title={`${definition.displayName} 授权`} width="max-w-2xl">
      <div className="grid gap-4">
        <p className="text-sm leading-6 text-muted-foreground">{definition.description}</p>
        <FieldRow label="连接名称"><input className="field" onChange={event => setDisplayName(event.target.value)} value={displayName} /></FieldRow>
        {(definition.auth.fields || []).length === 0 ? <WorkshopEmpty>该连接器不需要额外授权，保存后可直接发现工具。</WorkshopEmpty> : (
          <div className="grid gap-3">
            {definition.auth.fields.map(field => <AuthInput field={field} key={field.key} onChange={value => setAuth(prev => ({ ...prev, [field.key]: value }))} value={auth[field.key] || ''} />)}
          </div>
        )}
        <SecurityBox definition={definition} />
        {error ? <p className="text-xs text-[var(--dt-destructive)]">{error}</p> : null}
        <div className="flex justify-end gap-2"><Button onClick={onClose} variant="text">取消</Button><Button disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存并测试'}</Button></div>
      </div>
    </Modal>
  )
}

function AuthInput({ field, onChange, value }: { field: AuthField; onChange: (value: string) => void; value: string }) {
  if (field.type === 'select') {
    return <FieldRow description={field.helpText} label={field.label} required={field.required}><select className="field" onChange={event => onChange(event.target.value)} value={value}> <option value="">请选择</option>{(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}</select></FieldRow>
  }

  return <FieldRow description={field.helpText || field.placeholder} label={field.label} required={field.required}><input className="field" onChange={event => onChange(event.target.value)} placeholder={field.placeholder} type={field.type === 'password' ? 'password' : field.type === 'url' ? 'url' : 'text'} value={value} /></FieldRow>
}

function SecurityBox({ credentialStored = false, definition, onDeleteCredential }: { credentialStored?: boolean; definition: ConnectorDefinition; onDeleteCredential?: () => void }) {
  return (
    <div className="grid gap-2 rounded-[3px] border border-(--ui-stroke-tertiary) bg-background/60 p-3 text-xs">
      <div className="flex flex-wrap gap-1.5">
        <WorkshopStatus tone={RISK_TONE[definition.dataPolicy.riskLevel]}>{RISK_LABEL[definition.dataPolicy.riskLevel]}</WorkshopStatus>
        {definition.dataPolicy.localOnly ? <WorkshopStatus tone="success">本地处理</WorkshopStatus> : <WorkshopStatus tone="warning">可能访问外部服务</WorkshopStatus>}
        {definition.dataPolicy.storesCredential ? <WorkshopStatus tone="warning">存储凭据</WorkshopStatus> : <WorkshopStatus tone="neutral">无凭据</WorkshopStatus>}
      </div>
      <div>
        <div className="mb-1 font-medium">权限</div>
        <ul className="grid gap-1 text-muted-foreground">
          {definition.permissions.map(permission => <li key={permission.id}>- {permission.label}</li>)}
        </ul>
      </div>
      {definition.dataPolicy.storesCredential ? <div className="grid gap-2 rounded bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-300"><p>凭据加密保存在本机 `karna-data/connector-workshop/credentials.json`，不会上传；界面只显示是否已保存，不返回明文。</p>{credentialStored && onDeleteCredential ? <Button className="justify-self-start" onClick={onDeleteCredential} size="xs" variant="outline">删除已保存凭据</Button> : null}</div> : null}
    </div>
  )
}

function ConnectorDetailDrawer({ instance, onChanged, onClose }: { instance: ConnectorInstance; onChanged: () => Promise<void> | void; onClose: () => void }) {
  const dialogRef = useDialogFocus<HTMLElement>(onClose)
  const [current, setCurrent] = useState(instance)
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [logFilter, setLogFilter] = useState('all')
  const [logTimeFilter, setLogTimeFilter] = useState('all')
  const [logProjectFilter, setLogProjectFilter] = useState('all')
  const [logSearch, setLogSearch] = useState('')
  const [projects, setProjects] = useState<Array<{ id: string; title?: string }>>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [callTarget, setCallTarget] = useState<ConnectorTool | null>(null)
  const definition = current.definition

  const filteredLogs = useMemo(() => {
    return logs.filter(row => {
      if (logFilter !== 'all' && row.status !== logFilter) {return false}

      if (logProjectFilter !== 'all' && (row.projectId || 'global') !== logProjectFilter) {return false}

      if (logTimeFilter !== 'all') {
        const ageMs = Date.now() - Date.parse(row.createdAt || '')
        const limitMs = logTimeFilter === 'today' ? 24 * 60 * 60 * 1000 : logTimeFilter === '7d' ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000

        if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > limitMs) {return false}
      }

      if (logSearch && !row.toolName.toLowerCase().includes(logSearch.toLowerCase())) {return false}

      return true
    })
  }, [logs, logFilter, logProjectFilter, logSearch, logTimeFilter])

  const exportLogs = (rows: AuditLog[]) => {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `connector-logs-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  useEffect(() => {
    setCurrent(instance)
    void connectorApi.audit(instance.id).then(res => setLogs(res.items || [])).catch(() => setLogs([]))
    void window.karnaDesktop.api<{ projects?: Array<{ id: string; title?: string }> }>({ path: '/api/writer/projects?includeArchived=1' })
      .then(result => setProjects(result.projects || []))
      .catch(() => setProjects([]))
  }, [instance])

  const test = async () => {
    setBusy('test')

    try {
      const result = await connectorApi.test(current.id)
      setCurrent(result.instance)
      await onChanged()
    } finally { setBusy(null) }
  }

  const toggle = async () => {
    setBusy('toggle')

    try {
      const next = await connectorApi.update(current.id, { enabled: !current.enabled })
      setCurrent(next)
      await onChanged()
    } finally { setBusy(null) }
  }

  const remove = async () => {
    if (!confirm(`删除连接器「${current.displayName}」？`)) {return}
    setBusy('remove')

    try {
      await connectorApi.remove(current.id)
      await onChanged()
      onClose()
    } finally { setBusy(null) }
  }

  const clearCredential = async () => {
    if (!confirm(`删除连接器「${current.displayName}」保存在本机的凭据？连接器将保留。`)) {return}

    setBusy('credential')

    try {
      const next = await connectorApi.deleteCredential(current.id)
      setCurrent(next)
      await onChanged()
    } finally { setBusy(null) }
  }

  const toggleTool = async (tool: ConnectorTool) => {
    if (!tool.id) {return}
    await connectorApi.toggleTool(tool.id, tool.enabled === false)
    const result = await connectorApi.test(current.id).catch(() => null)

    if (result?.instance) {setCurrent(result.instance)}
    await onChanged()
  }

  return (
    <div className="fixed inset-0 z-[80] flex justify-end bg-black/45" onClick={event => event.target === event.currentTarget && onClose()}>
      <aside aria-labelledby="connector-detail-title" aria-modal="true" className="grid h-full w-full max-w-2xl grid-rows-[auto_1fr] border-l border-(--ui-stroke-tertiary) bg-background shadow-2xl" ref={dialogRef} role="dialog" tabIndex={-1}>
        <header className="flex items-start justify-between gap-3 border-b border-(--ui-stroke-tertiary) px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold" id="connector-detail-title">{current.displayName}</h2>
            <p className="text-xs text-muted-foreground">{definition?.description || current.connectorId}</p>
            <div className="mt-2 flex gap-1.5"><ConnectionDot status={current.connectionStatus} />{current.enabled ? <WorkshopStatus tone="success">已启用</WorkshopStatus> : <WorkshopStatus tone="warning">已禁用</WorkshopStatus>}</div>
          </div>
          <Button aria-label="Close connector details" onClick={onClose} size="icon-xs" variant="ghost"><Codicon name="close" /></Button>
        </header>
        <div className="min-h-0 overflow-auto p-5">
          <div className="mb-4 flex flex-wrap gap-2">
            <Button disabled={busy === 'test'} onClick={() => void test()} size="xs"><Codicon name="pulse" /> 重新检测</Button>
            <Button disabled={busy === 'toggle'} onClick={() => void toggle()} size="xs" variant="outline">{current.enabled ? '禁用' : '启用'}</Button>
            <Button disabled={busy === 'remove'} onClick={() => void remove()} size="xs" variant="destructive">删除连接</Button>
          </div>
          {current.errorMessage ? <div className="mb-4 rounded-[3px] border border-[var(--dt-destructive)]/30 bg-[var(--dt-destructive)]/8 p-2 text-xs text-[var(--dt-destructive)]">{current.errorMessage}</div> : null}
          <div className="grid gap-4">
            {definition ? <SecurityBox credentialStored={current.credentialStored} definition={definition} onDeleteCredential={() => void clearCredential()} /> : null}
            <section>
              <h3 className="mb-2 text-sm font-semibold">可用工具</h3>
              <div className="grid gap-2">
                {(current.discoveredTools || []).length === 0 ? <WorkshopEmpty>还没有发现工具。</WorkshopEmpty> : current.discoveredTools.map(tool => (
                  <div className="grid grid-cols-[1fr_auto] gap-3 rounded-[3px] border border-(--ui-stroke-tertiary) bg-background/70 p-2 text-xs" key={tool.id || tool.name}>
                    <div><div className="font-mono text-foreground">{tool.name}</div><p className="mt-0.5 text-muted-foreground">{tool.description}</p></div>
                    <div className="flex items-center gap-2">
                      <WorkshopStatus tone={RISK_TONE[tool.riskLevel || 'low']}>{RISK_LABEL[tool.riskLevel || 'low']}</WorkshopStatus>
                      <Button disabled={!tool.id || tool.enabled === false} onClick={() => setCallTarget(tool)} size="xs" variant="outline">调用</Button>
                      <Button onClick={() => void toggleTool(tool)} size="xs" variant="outline">{tool.enabled === false ? '启用' : '禁用'}</Button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">调用日志</h3>
                <div className="flex items-center gap-1">
                  <select
                    className="rounded border border-(--ui-stroke-tertiary) bg-background px-1.5 py-0.5 text-[0.65rem]"
                    defaultValue="all"
                    onChange={e => setLogFilter(e.target.value)}
                  >
                    <option value="all">全部</option>
                    <option value="success">成功</option>
                    <option value="error">失败</option>
                  </select>
                   <select
                     aria-label="Filter log time range"
                     className="rounded border border-(--ui-stroke-tertiary) bg-background px-1.5 py-0.5 text-[0.65rem]"
                     defaultValue="all"
                     onChange={e => setLogTimeFilter(e.target.value)}
                   >
                     <option value="all">All time</option>
                     <option value="today">Today</option>
                     <option value="7d">7 days</option>
                     <option value="30d">30 days</option>
                   </select>
                   <select
                     aria-label="Filter logs by project"
                     className="max-w-36 rounded border border-(--ui-stroke-tertiary) bg-background px-1.5 py-0.5 text-[0.65rem]"
                     onChange={event => setLogProjectFilter(event.target.value)}
                     value={logProjectFilter}
                   >
                     <option value="all">全部项目</option>
                     <option value="global">无项目上下文</option>
                     {projects.map(project => <option key={project.id} value={project.id}>{project.title || project.id}</option>)}
                   </select>
                   <input
                     aria-label="Search connector tools"
                    className="w-24 rounded border border-(--ui-stroke-tertiary) bg-background px-1.5 py-0.5 text-[0.65rem]"
                    onChange={e => setLogSearch(e.target.value)}
                    placeholder="搜索工具..."
                  />
                  <Button onClick={() => exportLogs(logs)} size="xs" title="导出日志" variant="ghost">
                    <Codicon name="cloud-download" size={12} />
                  </Button>
                </div>
              </div>
              <AuditList rows={filteredLogs} />
            </section>
          </div>
        </div>
      </aside>
      {callTarget ? (
        <ToolCallModal
          onCalled={async () => {
            const [auditResult, testResult] = await Promise.all([
              connectorApi.audit(current.id).catch(() => ({ items: [] as AuditLog[] })),
              connectorApi.test(current.id).catch(() => null)
            ])

            setLogs(auditResult.items || [])

            if (testResult?.instance) {setCurrent(testResult.instance)}
            await onChanged()
          }}
          onClose={() => setCallTarget(null)}
          projects={projects}
          tool={callTarget}
        />
      ) : null}
    </div>
  )
}

function ToolCallModal({ tool, projects, onCalled, onClose }: { tool: ConnectorTool; projects: Array<{ id: string; title?: string }>; onCalled: () => Promise<void> | void; onClose: () => void }) {
  const example = useMemo(() => JSON.stringify(defaultArgumentsForTool(tool), null, 2), [tool])
  const [raw, setRaw] = useState(example)
  const [confirmed, setConfirmed] = useState(false)
  const [calling, setCalling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [output, setOutput] = useState<unknown>(null)
  const [projectId, setProjectId] = useState('')
  const highRisk = tool.riskLevel === 'high'

  const call = async () => {
    if (!tool.id) {return}

    if (highRisk && !confirmed) {
      setError('高风险工具需要勾选确认。')

      return
    }

    let args: Record<string, unknown>

    try {
      const parsed = raw.trim() ? JSON.parse(raw) : {}

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {throw new Error('参数必须是 JSON object')}
      args = parsed as Record<string, unknown>
    } catch (err) {
      setError(`JSON 参数错误：${err instanceof Error ? err.message : String(err)}`)

      return
    }

    setCalling(true)
    setError(null)

    try {
      const result = await connectorApi.callTool(tool.id, args, confirmed, projectId)
      setOutput(result.output)
      await onCalled()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCalling(false)
    }
  }

  return (
    <Modal onClose={onClose} title={`调用工具：${tool.name}`} width="max-w-3xl">
      <div className="grid gap-3">
        <div className="rounded-[3px] border border-(--ui-stroke-tertiary) bg-background/60 p-3 text-xs text-muted-foreground">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-mono text-foreground">{tool.name}</span>
            <WorkshopStatus tone={RISK_TONE[tool.riskLevel || 'low']}>{RISK_LABEL[tool.riskLevel || 'low']}</WorkshopStatus>
            <WorkshopStatus tone="info">{tool.source || 'connector'}</WorkshopStatus>
          </div>
          {tool.description}
        </div>
        <FieldRow description="用于演示和验收 tools/call；实际 Agent 调用也走同一后端入口。" label="Arguments JSON">
          <textarea className="field min-h-40 font-mono text-xs" onChange={event => setRaw(event.target.value)} spellCheck={false} value={raw} />
        </FieldRow>
        <FieldRow description="写入审计日志，便于按作品追踪外部工具调用。" label="项目上下文">
          <select className="field" onChange={event => setProjectId(event.target.value)} value={projectId}>
            <option value="">无项目上下文</option>
            {projects.map(project => <option key={project.id} value={project.id}>{project.title || project.id}</option>)}
          </select>
        </FieldRow>
        {highRisk ? (
          <label className="flex items-center gap-2 rounded-[3px] border border-[var(--theme-secondary)]/30 bg-[var(--theme-secondary)]/8 p-2 text-xs text-[var(--theme-foreground)]/80">
            <input checked={confirmed} onChange={event => setConfirmed(event.target.checked)} type="checkbox" />
            我确认这是高风险工具，允许本次调用。
          </label>
        ) : null}
        {error ? <p className="text-xs text-[var(--dt-destructive)]">{error}</p> : null}
        {output !== null ? (
          <pre className="max-h-72 overflow-auto rounded-[3px] border border-(--ui-stroke-tertiary) bg-black/30 p-3 text-xs text-foreground">{JSON.stringify(output, null, 2)}</pre>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button onClick={onClose} variant="text">关闭</Button>
          <Button disabled={calling || (highRisk && !confirmed)} onClick={() => void call()}>{calling ? '调用中…' : '调用工具'}</Button>
        </div>
      </div>
    </Modal>
  )
}

function CustomConnectorModal({ onClose, onSaved }: { onClose: () => void; onSaved: (instance: ConnectorInstance) => void }) {
  const [displayName, setDisplayName] = useState('我的本地 MCP')
  const [transport, setTransport] = useState<Transport>('stdio')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [env, setEnv] = useState('')
  const [jsonImport, setJsonImport] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const applyJsonImport = () => {
    setError(null)

    try {
      const imported = parseCustomMcpJson(jsonImport)

      if (imported.displayName) {setDisplayName(imported.displayName)}
      setTransport(imported.transport)
      setCommand(imported.command || '')
      setArgs((imported.args || []).join(' '))
      setUrl(imported.url || '')
      setEnv(formatEnv(imported.env || {}))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const save = async () => {
    setError(null)

    if (!displayName.trim()) { setError('请填写连接器名称');

 return }

    if (transport === 'stdio' && !command.trim()) { setError('stdio 模式需要 command');

 return }

    if (transport !== 'stdio' && !url.trim()) { setError('SSE/HTTP 模式需要 URL');

 return }

    setSaving(true)

    try {
      const id = `custom_${Date.now()}`
      const envMap = parseEnv(env)

      const def: ConnectorDefinition = {
        id,
        name: `custom.${id}`,
        displayName,
        description: '用户自定义 MCP Server。保存后会尝试 initialize + tools/list。',
        category: 'creative_core',
        icon: 'plug',
        provider: 'Custom',
        type: transport === 'stdio' ? 'mcp_stdio' : transport === 'sse' ? 'mcp_sse' : 'mcp_http',
        priority: 'B',
        status: 'experimental',
        auth: { mode: 'server_url', fields: [] },
        server: undefined,
        permissions: [{ id: 'custom.mcp.call', label: '调用自定义 MCP 工具', riskLevel: 'medium' }],
        toolsPreview: [],
        dataPolicy: { localOnly: transport === 'stdio', uploadsUserData: transport !== 'stdio', storesCredential: Object.keys(envMap).length > 0, riskLevel: 'medium' }
      } as ConnectorDefinition

      const auth = transport === 'stdio' ? { command, args: parseArgs(args), env: envMap } : { url, serverUrl: url, env: envMap }
      const server = transport === 'stdio' ? { transport, command, args: parseArgs(args), env: envMap, autoStart: true } : { transport, url, env: envMap, autoStart: true }
      const instance = await connectorApi.create({ connectorId: id, displayName, auth, customDefinition: { ...def, server } })
      const tested = await connectorApi.test(instance.id).catch(() => null)
      onSaved(tested?.instance || instance)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally { setSaving(false) }
  }

  return (
    <Modal onClose={onClose} title="自定义 MCP Server" width="max-w-3xl">
      <div className="grid gap-4">
        <section className="rounded-[10px] border border-[#eadfce] bg-[#fffaf2]/70 p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">JSON 粘贴导入</h3>
              <p className="text-[0.72rem] text-muted-foreground">支持 Claude Desktop mcpServers、stdio、SSE、HTTP 配置。</p>
            </div>
            <Button onClick={applyJsonImport} size="xs" variant="outline">解析 JSON</Button>
          </div>
          <textarea className="field min-h-28 font-mono text-xs" onChange={event => setJsonImport(event.target.value)} placeholder={'{\n  "mcpServers": {\n    "my-server": {\n      "command": "python",\n      "args": ["server.py"],\n      "env": {}\n    }\n  }\n}'} spellCheck={false} value={jsonImport} />
        </section>

        <FieldRow label="连接器名称" required><input className="field" onChange={event => setDisplayName(event.target.value)} value={displayName} /></FieldRow>
        <FieldRow label="传输方式"><select className="field" onChange={event => setTransport(event.target.value as Transport)} value={transport}><option value="stdio">stdio</option><option value="sse">SSE</option><option value="http">HTTP</option></select></FieldRow>
        {transport === 'stdio' ? <><FieldRow label="Command" required><input className="field" onChange={event => setCommand(event.target.value)} placeholder="python / npx / node" value={command} /></FieldRow><FieldRow label="Args"><input className="field" onChange={event => setArgs(event.target.value)} placeholder="-m my_server 或 -y package" value={args} /></FieldRow></> : <FieldRow label="URL" required><input className="field" onChange={event => setUrl(event.target.value)} placeholder={transport === 'sse' ? 'http://127.0.0.1:8000/sse' : 'http://127.0.0.1:8000/mcp'} value={url} /></FieldRow>}
        <FieldRow label="Env"><textarea className="field min-h-24" onChange={event => setEnv(event.target.value)} placeholder={'API_KEY=...\nBASE_URL=...'} value={env} /></FieldRow>
        {error ? <p className="text-xs text-[var(--dt-destructive)]">{error}</p> : null}
        <div className="flex justify-end gap-2"><Button onClick={onClose} variant="text">取消</Button><Button disabled={saving} onClick={() => void save()}>{saving ? '保存中…' : '保存并测试'}</Button></div>
      </div>
    </Modal>
  )
}

function AuditList({ rows }: { rows: AuditLog[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (rows.length === 0) {return <WorkshopEmpty>暂无调用日志。</WorkshopEmpty>}

  return <div className="grid gap-1.5">{rows.map(row => {
    const isOpen = expanded === row.id
    const detail = row.errorMessage || row.outputSummary || ''
    const hasDetail = (row.input || detail) && detail.length > 20

    return (
      <div className="cursor-pointer rounded-[3px] border border-(--ui-stroke-tertiary) bg-background/60 px-2 py-1.5 text-xs" key={row.id} onClick={() => setExpanded(isOpen ? null : row.id)}>
        <div className="flex justify-between gap-2"><span className="font-mono">{row.toolName}</span><div className="flex items-center gap-1"><WorkshopStatus tone={row.status === 'success' || row.status === 'connected' ? 'success' : row.status === 'error' ? 'danger' : 'neutral'}>{row.status}</WorkshopStatus>{hasDetail ? <Codicon name={isOpen ? 'chevron-up' : 'chevron-down'} size={10} /> : null}</div></div>
        <div className="mt-0.5 text-[0.65rem] text-muted-foreground">{new Date(row.createdAt).toLocaleString()} · 项目 {row.projectId || '无'} {detail ? ` · ${detail.slice(0, 60)}${detail.length > 60 ? '...' : ''}` : ''}</div>
        {isOpen && hasDetail ? (
          <div className="mt-1.5 rounded bg-black/5 p-1.5 font-mono text-[0.6rem] text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-auto">
            {row.input ? <div className="mb-1"><span className="text-[var(--theme-primary)]">输入:</span> {typeof row.input === 'string' ? row.input : JSON.stringify(row.input, null, 2)}</div> : null}
            {detail ? <div><span className={row.status === 'error' ? 'text-red-500' : 'text-green-600'}>{row.status === 'error' ? '错误:' : '输出:'}</span> {detail}</div> : null}
          </div>
        ) : null}
      </div>
    )
  })}</div>
}

function Modal({ children, onClose, title, width = 'max-w-xl' }: { children: ReactNode; onClose: () => void; title: string; width?: string }) {
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose)

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/55 p-4" onClick={event => event.target === event.currentTarget && onClose()}>
      <div aria-labelledby="connector-modal-title" aria-modal="true" className={cn('max-h-[88vh] w-full overflow-auto rounded-[8px] border border-(--ui-stroke-tertiary) bg-background p-5 shadow-2xl', width)} ref={dialogRef} role="dialog" tabIndex={-1}>
        <header className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold" id="connector-modal-title">{title}</h2><Button aria-label="关闭对话框" onClick={onClose} size="icon-xs" variant="ghost"><Codicon name="close" /></Button></header>
        {children}
      </div>
    </div>
  )
}

function parseArgs(raw: string): string[] {
  return raw.split(/[\s,]+/).map(part => part.trim()).filter(Boolean)
}

function defaultArgumentsForTool(tool: ConnectorTool): Record<string, unknown> {
  const name = tool.name

  if (name === 'search_notes' || name === 'search_web' || name === 'unified_search') {return { query: '莫言 写作 访谈' }}

  if (name === 'search_documents' || name === 'search_files') {return { query: '人物设定' }}

  if (name === 'import_document') {return { path: 'demo.md', maxChars: 20000 }}

  if (name === 'download_file') {return { path: '/写作资料/示例.pdf' }}

  if (name === 'read_webpage') {return { url: 'data:text/html,<html><title>访谈材料</title><body>作家在访谈中谈到写作要关注现实生活细节。</body></html>', maxChars: 12000 }}

  if (name === 'extract_evidence') {return { url: 'data:text/html,<html><title>访谈材料</title><body>作家在访谈中谈到写作要关注现实生活细节。</body></html>', keywords: ['写作', '现实'] }}

  if (name === 'get_backlinks') {return { path: 'clueA.md' }}

  if (name === 'read_file') {return { project_id: 'proj_sample_001', file_path: 'chapters/chapter1.md' }}

  if (name === 'write_file') {return { project_id: 'proj_sample_001', file_path: 'notes/demo.md', content: '示例写作资料' }}

  if (name === 'delete_file') {return { project_id: 'proj_sample_001', file_path: 'notes/demo.md' }}

  if (name === 'extract_story_bible_from_chapter') {return { chapter_title: '第十二章', chapter_text: '暴雨夜发生在旧街口。林桐发现一封信，随后决定离开小城。' }}

  if (name.includes('list') || name.includes('get')) {return {}}
  const schema = tool.inputSchema
  const props = schema && typeof schema === 'object' ? (schema.properties as Record<string, unknown> | undefined) : undefined

  if (!props) {return {}}

  return Object.fromEntries(Object.keys(props).slice(0, 6).map(key => [key, '']))
}

function parseEnv(raw: string): Record<string, string> {
  const env: Record<string, string> = {}
  raw.split('\n').map(line => line.trim()).filter(Boolean).forEach(line => {
    const idx = line.indexOf('=')

    if (idx > 0) {env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()}
  })

  return env
}

function formatEnv(env: Record<string, unknown>): string {
  return Object.entries(env).map(([key, value]) => `${key}=${String(value)}`).join('\n')
}

function parseCustomMcpJson(raw: string): { displayName?: string; transport: Transport; command?: string; args?: string[]; url?: string; env?: Record<string, unknown> } {
  const text = raw.trim()

  if (!text) {throw new Error('请先粘贴 MCP JSON 配置')}
  const parsed = JSON.parse(text) as Record<string, unknown>

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {throw new Error('JSON 根节点必须是对象')}

  const mcpServers = parsed.mcpServers

  if (mcpServers && typeof mcpServers === 'object' && !Array.isArray(mcpServers)) {
    const entries = Object.entries(mcpServers as Record<string, unknown>)

    if (entries.length === 0) {throw new Error('mcpServers 里没有 server 配置')}
    const [name, serverValue] = entries[0]
    const server = normalizeServerConfig(serverValue)

    return { displayName: String((serverValue as Record<string, unknown>)?.displayName || name), ...server }
  }

  const config = normalizeServerConfig(parsed)

  return { displayName: typeof parsed.displayName === 'string' ? parsed.displayName : typeof parsed.name === 'string' ? parsed.name : undefined, ...config }
}

function normalizeServerConfig(value: unknown): { transport: Transport; command?: string; args?: string[]; url?: string; env?: Record<string, unknown> } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {throw new Error('server 配置必须是对象')}
  const server = value as Record<string, unknown>
  const rawTransport = typeof server.transport === 'string' ? server.transport.toLowerCase() : ''
  const url = typeof server.url === 'string' ? server.url : typeof server.serverUrl === 'string' ? server.serverUrl : undefined
  const transport: Transport = rawTransport === 'sse' || rawTransport === 'http' ? rawTransport : url ? (url.includes('/sse') ? 'sse' : 'http') : 'stdio'
  const rawArgs = Array.isArray(server.args) ? server.args : []
  const args = rawArgs.map(item => String(item))
  const env = server.env && typeof server.env === 'object' && !Array.isArray(server.env) ? server.env as Record<string, unknown> : {}

  if (transport === 'stdio') {
    const command = typeof server.command === 'string' ? server.command : ''

    if (!command) {throw new Error('stdio 配置缺少 command')}

    return { transport, command, args, env }
  }

  if (!url) {throw new Error('SSE/HTTP 配置缺少 url 或 serverUrl')}

  return { transport, url, env }
}
