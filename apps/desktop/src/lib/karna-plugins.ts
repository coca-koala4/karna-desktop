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
  writing: '\u5199\u4f5c', research: '\u7814\u7a76', documents: '\u6587\u6863', productivity: '\u751f\u4ea7\u529b',
  'knowledge-management': '\u77e5\u8bc6\u7ba1\u7406', 'browser-automation': '\u6d4f\u89c8\u5668\u81ea\u52a8\u5316', communication: '\u901a\u4fe1',
  creative: '\u521b\u610f', data: '\u6570\u636e', development: '\u5f00\u53d1', system: '\u7cfb\u7edf', uncategorized: '\u672a\u5206\u7c7b',
  builtin: '\u5185\u7f6e', marketplace: '\u6269\u5c55\u5e02\u573a', '\u5185\u7f6e\u63d2\u4ef6': '\u5185\u7f6e\u63d2\u4ef6', 'Karna \u5b98\u65b9': 'Karna \u5b98\u65b9',
  'Karna \u5b98\u65b9\u5185\u7f6e': 'Karna \u5b98\u65b9\u5185\u7f6e', '\u5916\u7f6e Skill \u5e02\u573a': '\u5916\u7f6e Skill \u5e02\u573a'
}

export const HEALTH_STATUS_LABELS: Record<PluginHealthStatus, string> = {
  ready: '\u5c31\u7eea', degraded: '\u964d\u7ea7', missing_dependency: '\u7f3a\u5c11\u4f9d\u8d56', permission_required: '\u9700\u8981\u6388\u6743',
  unsupported_platform: '\u4e0d\u652f\u6301\u5f53\u524d\u5e73\u53f0', error: '\u9519\u8bef', unknown: '\u672a\u77e5'
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
  'filesystem:project': '\u9879\u76ee\u6587\u4ef6\u8bfb\u5199', 'filesystem:read': '\u8bfb\u53d6\u6587\u4ef6', 'filesystem:write': '\u5199\u5165\u6587\u4ef6',
  'process:bundled-runtime': '\u5185\u7f6e\u8fd0\u884c\u65f6\u8fdb\u7a0b', 'desktop:control': '\u684c\u9762\u63a7\u5236', 'screen:capture': '\u5c4f\u5e55\u622a\u56fe',
  'browser:login': '\u6d4f\u89c8\u5668\u767b\u5f55\u4f1a\u8bdd', 'browser:isolated': '\u9694\u79bb\u6d4f\u89c8\u5668', 'browser:login-session': '\u767b\u5f55\u6d4f\u89c8\u5668\u4f1a\u8bdd',
  'email:read': '\u8bfb\u53d6\u90ae\u4ef6', 'email:send': '\u53d1\u9001\u90ae\u4ef6', 'email:modify': '\u4fee\u6539\u90ae\u4ef6', 'calendar:read': '\u8bfb\u53d6\u65e5\u5386',
  'calendar:write': '\u5199\u5165\u65e5\u5386', 'network:request': '\u7f51\u7edc\u8bbf\u95ee', 'network:local': '\u672c\u5730\u7f51\u7edc\u8bbf\u95ee',
  'oauth:desktop': '\u684c\u9762 OAuth \u6388\u6743', 'zotero:local': '\u672c\u5730 Zotero', network: '\u7f51\u7edc\u8bbf\u95ee', shell: 'Shell \u6267\u884c',
  ocr: 'OCR \u8bc6\u522b', clipboard: '\u526a\u8d34\u677f\u8bbf\u95ee'
}
