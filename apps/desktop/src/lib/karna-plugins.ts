export type PluginHealthStatus = 'ready' | 'degraded' | 'missing_dependency' | 'permission_required' | 'unsupported_platform' | 'error' | 'unknown'
export type PluginStatus = 'installing' | 'active' | 'disabled' | 'update_available' | 'error' | 'rolled_back'
export type InstallJobState = 'pending' | 'running' | 'awaiting_confirmation' | 'completed' | 'failed' | 'rolled_back'
export type InstallJobPhase = 'resolving' | 'downloading' | 'quarantined' | 'preflighted' | 'awaiting_confirmation' | 'installing' | 'registering' | 'verifying' | 'active' | 'blocked' | 'failed' | 'rolled_back'
export type SecuritySeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export interface SecurityIssue {
  severity: SecuritySeverity
  code: string
  message: string
  file?: string
}

export interface PluginPreflightSkill {
  id: string
  path: string
  license: string
  enabled: boolean
  domains: string[]
  tags: string[]
  already_exists: boolean
}

export interface PreflightReport {
  plugin_id: string
  name: string
  version: string
  publisher: { id: string; name: string }
  description: string
  source_type: string
  source_url: string
  files_count: number
  total_size: number
  permissions: string[]
  platforms: string[]
  entrypoints: Record<string, string[]>
  capabilities: string[]
  category: string
  license_id: string
  is_compatible_platform: boolean
  is_codex_converted: boolean
  security_issues: SecurityIssue[]
  security_verdict: 'pass' | 'warn' | 'block'
  conflicts: string[]
  duplicate_skills: string[]
  is_skill_pack: boolean
  skills: PluginPreflightSkill[]
  sha256: string
  warnings: string[]
}

export interface InstallJob {
  job_id: string
  source: string
  operation: string
  state: InstallJobState
  phase: InstallJobPhase
  progress: number
  error?: string
  created_at: number
  updated_at: number
  plugin_id?: string
  plugin_name?: string
  version?: string
  preflight?: PreflightReport
}

export interface KarnaPlugin {
  id: string
  name: string
  version: string
  publisher_id: string
  publisher_name: string
  description: string
  category: string
  status: PluginStatus
  health_status: PluginHealthStatus
  is_builtin: boolean
  is_active: boolean
  permissions: string[]
  permissions_granted: string[]
  platforms: string[]
  source_type: string
  source_url: string
  sha256: string
  installed_at?: number
  updated_at?: number
  last_health_check?: number
  rollback_version: string
  capabilities: string[]
  entrypoints: Record<string, string[]>
  install_path: string
  skills: KarnaSkill[]
  mcp_servers: Array<{ path: string; full_path: string; exists: boolean }>
  has_update: boolean
  update_version?: string
  health_report?: {
    plugin_id: string
    status: PluginHealthStatus
    checks: Array<{ name: string; status: 'pass' | 'warn' | 'fail'; message?: string }>
    checked_at: number
  }
}

export interface KarnaSkillPack {
  id: string
  version: string
  category: string
  name: string
  description: string
  skills_count: number
  size_bytes: number
  installed_at?: number
  source_type: string
  source_url: string
  is_active: boolean
  skills: KarnaSkill[]
}

export interface KarnaSkill {
  id: string
  name: string
  version: string
  description: string
  category: string
  domains: string[]
  tags: string[]
  language: string
  risk_level: string
  license: string
  is_enabled: boolean
  is_builtin: boolean
  source_pack: string
  source_plugin: string
  plugin_id: string
  install_path: string
  variants: string[]
  active_variant?: string
  confidence: number
}

export interface PluginListResponse {
  plugins: KarnaPlugin[]
}

export interface SkillPackListResponse {
  skill_packs: KarnaSkillPack[]
}

export interface SkillListResponse {
  skills: KarnaSkill[]
}

const api = <T>(path: string, options: { body?: unknown; method?: string } = {}): Promise<T & { ok?: boolean; error?: string }> =>
  window.karnaDesktop.api<T & { ok?: boolean; error?: string }>({ body: options.body, method: options.method || 'GET', path })

export async function listKarnaPlugins(): Promise<PluginListResponse> {
  return api<PluginListResponse>('/api/karna/plugins') as Promise<PluginListResponse>
}

export async function getKarnaPlugin(id: string): Promise<KarnaPlugin> {
  return api<KarnaPlugin>(`/api/karna/plugins/${encodeURIComponent(id)}`) as Promise<KarnaPlugin>
}

export async function preflightPlugin(source: string): Promise<InstallJob> {
  return api<InstallJob>('/api/karna/plugins/preflight', {
    method: 'POST',
    body: { source }
  }) as Promise<InstallJob>
}

export async function installPlugin(source: string, autoConfirm = false, grantedPermissions?: string[]): Promise<InstallJob> {
  return api<InstallJob>('/api/karna/plugins/install', {
    method: 'POST',
    body: { source, auto_confirm: autoConfirm, granted_permissions: grantedPermissions }
  }) as Promise<InstallJob>
}

export async function confirmPluginInstall(jobId: string, grantedPermissions?: string[]): Promise<{ ok: boolean; job_id: string }> {
  return api<{ ok: boolean; job_id: string }>(`/api/karna/plugins/install/${encodeURIComponent(jobId)}/confirm`, {
    method: 'POST',
    body: { granted_permissions: grantedPermissions }
  }) as Promise<{ ok: boolean; job_id: string }>
}

export async function getPluginJob(jobId: string): Promise<InstallJob> {
  return api<InstallJob>(`/api/karna/plugins/jobs/${encodeURIComponent(jobId)}`) as Promise<InstallJob>
}

export async function setPluginEnabled(id: string, enabled: boolean): Promise<{ ok: boolean; plugin_id: string; enabled: boolean }> {
  return api<{ ok: boolean; plugin_id: string; enabled: boolean }>(`/api/karna/plugins/${encodeURIComponent(id)}/enable`, {
    method: 'POST',
    body: { enabled }
  }) as Promise<{ ok: boolean; plugin_id: string; enabled: boolean }>
}

export async function setPluginPermissions(id: string, permissions: string[]): Promise<{ ok: boolean; plugin_id: string; permissions: string[] }> {
  return api<{ ok: boolean; plugin_id: string; permissions: string[] }>(`/api/karna/plugins/${encodeURIComponent(id)}/permissions`, {
    method: 'POST',
    body: { permissions }
  }) as Promise<{ ok: boolean; plugin_id: string; permissions: string[] }>
}

export async function checkPluginUpdate(id: string): Promise<{ has_update: boolean; plugin_id: string; update?: { version: string; changelog?: string; new_permissions?: string[]; size_bytes?: number; sha256?: string; source_url?: string } }> {
  return api(`/api/karna/plugins/${encodeURIComponent(id)}/check-update`, {
    method: 'POST'
  }) as Promise<{ has_update: boolean; plugin_id: string; update?: { version: string; changelog?: string; new_permissions?: string[]; size_bytes?: number; sha256?: string; source_url?: string } }>
}

export async function updatePlugin(id: string): Promise<{ ok: boolean; plugin_id: string }> {
  return api(`/api/karna/plugins/${encodeURIComponent(id)}/update`, {
    method: 'POST'
  }) as Promise<{ ok: boolean; plugin_id: string }>
}

export async function rollbackPlugin(id: string): Promise<{ ok: boolean; plugin_id: string }> {
  return api(`/api/karna/plugins/${encodeURIComponent(id)}/rollback`, {
    method: 'POST'
  }) as Promise<{ ok: boolean; plugin_id: string }>
}

export async function uninstallPlugin(id: string): Promise<{ ok: boolean; plugin_id: string }> {
  return api(`/api/karna/plugins/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  }) as Promise<{ ok: boolean; plugin_id: string }>
}

export async function listSkillPacks(): Promise<SkillPackListResponse> {
  return api<SkillPackListResponse>('/api/karna/skill-packs') as Promise<SkillPackListResponse>
}

export async function installSkillPack(source: string, autoConfirm = false, grantedPermissions?: string[]): Promise<InstallJob> {
  return api<InstallJob>('/api/karna/skill-packs/install', {
    method: 'POST',
    body: { source, auto_confirm: autoConfirm, granted_permissions: grantedPermissions }
  }) as Promise<InstallJob>
}

export async function listKarnaSkills(category?: string, tag?: string, enabledOnly?: boolean): Promise<SkillListResponse> {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (tag) params.set('tag', tag)
  if (enabledOnly) params.set('enabled_only', 'true')
  const queryString = params.toString()
  return api<SkillListResponse>(`/api/karna/skills${queryString ? `?${queryString}` : ''}`) as Promise<SkillListResponse>
}

export async function setSkillEnabled(id: string, enabled: boolean): Promise<{ ok: boolean; skill_id: string; enabled: boolean }> {
  return api(`/api/karna/skills/${encodeURIComponent(id)}/enable?enabled=${enabled}`, {
    method: 'POST'
  }) as Promise<{ ok: boolean; skill_id: string; enabled: boolean }>
}

export async function activateSkillVariant(skillId: string, variantId: string): Promise<{ ok: boolean; skill_id: string; active_variant: string }> {
  return api(`/api/karna/skills/${encodeURIComponent(skillId)}/activate-variant`, {
    method: 'POST',
    body: { variant_id: variantId }
  }) as Promise<{ ok: boolean; skill_id: string; active_variant: string }>
}

export const PLUGIN_CATEGORIES = [
  'writing',
  'research',
  'documents',
  'productivity',
  'knowledge-management',
  'browser-automation',
  'communication',
  'creative',
  'data',
  'development',
  'system',
  'uncategorized'
] as const

export const CATEGORY_LABELS: Record<string, string> = {
  writing: '写作',
  research: '研究',
  documents: '文档',
  productivity: '生产力',
  'knowledge-management': '知识管理',
  'browser-automation': '浏览器自动化',
  communication: '通信',
  creative: '创意',
  data: '数据',
  development: '开发',
  system: '系统',
  uncategorized: '未分类',
  '内置插件': '内置插件',
  'Karna 官方': 'Karna 官方'
}

export const HEALTH_STATUS_LABELS: Record<PluginHealthStatus, string> = {
  ready: '就绪',
  degraded: '降级',
  missing_dependency: '缺少依赖',
  permission_required: '需要授权',
  unsupported_platform: '不支持平台',
  error: '错误',
  unknown: '未知'
}

export const HEALTH_STATUS_COLORS: Record<PluginHealthStatus, string> = {
  ready: 'text-emerald-500',
  degraded: 'text-amber-500',
  missing_dependency: 'text-orange-500',
  permission_required: 'text-blue-500',
  unsupported_platform: 'text-gray-500',
  error: 'text-red-500',
  unknown: 'text-gray-400'
}

export const PERMISSION_LABELS: Record<string, string> = {
  'filesystem:project': '项目文件读写',
  'filesystem:read': '读取文件',
  'filesystem:write': '写入文件',
  'process:bundled-runtime': '内置运行时进程',
  'desktop:control': '桌面控制',
  'screen:capture': '屏幕截图',
  'browser:login': '浏览器登录会话',
  'browser:isolated': '隔离浏览器',
  'browser:login-session': '登录浏览器会话',
  'email:read': '读取邮件',
  'email:send': '发送邮件',
  'email:modify': '修改邮件',
  'calendar:read': '读取日历',
  'calendar:write': '写入日历',
  'network:request': '网络访问',
  'network:local': '本地网络访问',
  'oauth:desktop': '桌面 OAuth 授权',
  'zotero:local': '本地 Zotero',
  network: '网络访问',
  shell: 'Shell 执行',
  ocr: 'OCR 识别',
  clipboard: '剪贴板访问'
}
