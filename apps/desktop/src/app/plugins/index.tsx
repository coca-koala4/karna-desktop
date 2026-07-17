import type * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CATEGORY_LABELS,
  HEALTH_STATUS_COLORS,
  HEALTH_STATUS_LABELS,
  PERMISSION_LABELS,
  type InstallJob,
  type KarnaPlugin,
  type KarnaSkill,
  type KarnaSkillPack,
  type PreflightReport,
  checkPluginUpdate,
  confirmPluginInstall,
  getPluginJob,
  installPlugin,
  listKarnaPlugins,
  listKarnaSkills,
  listSkillPacks,
  preflightPlugin,
  rollbackPlugin,
  setPluginEnabled,
  setSkillEnabled,
  uninstallPlugin,
  updatePlugin
} from '@/lib/karna-plugins'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'

import { useRefreshHotkey } from '../hooks/use-refresh-hotkey'
import { PAGE_INSET_X } from '../layout-constants'
import { PageSearchShell } from '../page-search-shell'

type TabMode = 'builtin' | 'installed' | 'available' | 'skills' | 'packs'

const BUILTIN_PLUGIN_IDS = [
  'karna.computer-use',
  'karna.chrome',
  'karna.pdf',
  'karna.documents',
  'karna.spreadsheets',
  'karna.presentations',
  'karna.web-research',
  'karna.local-files',
  'karna.ocr',
  'karna.email',
  'karna.calendar',
  'karna.zotero'
]

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDate(timestamp?: number): string {
  if (!timestamp) return '-'
  return new Date(timestamp * 1000).toLocaleDateString()
}

function StatusDot({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    ready: 'bg-emerald-500',
    active: 'bg-emerald-500',
    degraded: 'bg-amber-500',
    disabled: 'bg-gray-400',
    missing_dependency: 'bg-orange-500',
    permission_required: 'bg-blue-500',
    unsupported_platform: 'bg-gray-500',
    error: 'bg-red-500',
    unknown: 'bg-gray-400'
  }
  return <span className={cn('inline-block h-2 w-2 rounded-full', colorMap[status] || 'bg-gray-400')} />
}

interface PluginCardProps {
  plugin: KarnaPlugin
  onRefresh: () => void
  onSelect?: (plugin: KarnaPlugin) => void
}

function PluginCard({ plugin, onRefresh, onSelect }: PluginCardProps) {
  const [toggling, setToggling] = useState(false)
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [uninstalling, setUninstalling] = useState(false)
  const [rollingBack, setRollingBack] = useState(false)

  const handleToggle = async () => {
    setToggling(true)
    try {
      await setPluginEnabled(plugin.id, plugin.status !== 'active')
      notify({ kind: 'success', message: plugin.status === 'active' ? '插件已禁用' : '插件已启用' })
      onRefresh()
    } catch (err) {
      notifyError(err, '切换插件状态失败')
    } finally {
      setToggling(false)
    }
  }

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true)
    try {
      const result = await checkPluginUpdate(plugin.id)
      if (result.has_update) {
        notify({ kind: 'info', message: `发现新版本: ${result.update?.version}` })
      } else {
        notify({ kind: 'info', message: '已是最新版本' })
      }
      onRefresh()
    } catch (err) {
      notifyError(err, '检查更新失败')
    } finally {
      setCheckingUpdate(false)
    }
  }

  const handleUpdate = async () => {
    setUpdating(true)
    try {
      await updatePlugin(plugin.id)
      notify({ kind: 'success', message: '更新已开始' })
      onRefresh()
    } catch (err) {
      notifyError(err, '更新失败')
    } finally {
      setUpdating(false)
    }
  }

  const handleUninstall = async () => {
    if (!confirm(`确定要卸载插件 "${plugin.name}" 吗？`)) return
    setUninstalling(true)
    try {
      await uninstallPlugin(plugin.id)
      notify({ kind: 'success', message: '插件已卸载' })
      onRefresh()
    } catch (err) {
      notifyError(err, '卸载失败')
    } finally {
      setUninstalling(false)
    }
  }

  const handleRollback = async () => {
    if (!plugin.rollback_version) return
    if (!confirm(`确定要回滚到版本 ${plugin.rollback_version} 吗？`)) return
    setRollingBack(true)
    try {
      await rollbackPlugin(plugin.id)
      notify({ kind: 'success', message: '已回滚' })
      onRefresh()
    } catch (err) {
      notifyError(err, '回滚失败')
    } finally {
      setRollingBack(false)
    }
  }

  return (
    <div className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-chat-bubble-background) p-4 transition-shadow hover:shadow-md">
      <div className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <StatusDot status={plugin.health_status} />
              <span className="truncate text-base font-medium">{plugin.name}</span>
              {plugin.is_builtin && (
                <Badge variant="muted" className="text-xs">内置</Badge>
              )}
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{plugin.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Switch
              checked={plugin.status === 'active'}
              disabled={toggling}
              onCheckedChange={handleToggle}
            />
          </div>
        </div>
      </div>
      <div className="pb-3">
        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>版本: <span className="font-mono">{plugin.version}</span></div>
          <div>状态: <span className={HEALTH_STATUS_COLORS[plugin.health_status]}>{HEALTH_STATUS_LABELS[plugin.health_status]}</span></div>
          <div>分类: {CATEGORY_LABELS[plugin.category] || plugin.category}</div>
          <div>发布者: {plugin.publisher_name}</div>
          {plugin.skills.length > 0 && (
            <div>Skill: {plugin.skills.length} 个</div>
          )}
          {plugin.mcp_servers.length > 0 && (
            <div>MCP: {plugin.mcp_servers.length} 个</div>
          )}
        </div>
        {plugin.permissions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {plugin.permissions.slice(0, 4).map(perm => (
              <Badge key={perm} variant="outline" className="text-[10px]">
                {PERMISSION_LABELS[perm] || perm}
              </Badge>
            ))}
            {plugin.permissions.length > 4 && (
              <Badge variant="outline" className="text-[10px]">+{plugin.permissions.length - 4}</Badge>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 pt-0">
        {onSelect && (
          <Button variant="secondary" size="sm" onClick={() => onSelect(plugin)}>详情</Button>
        )}
        {!plugin.is_builtin && (
          <>
            <Button variant="ghost" size="sm" onClick={handleCheckUpdate} disabled={checkingUpdate}>
              {checkingUpdate ? '检查中...' : '检查更新'}
            </Button>
            {plugin.has_update && (
              <Button variant="default" size="sm" onClick={handleUpdate} disabled={updating}>
                {updating ? '更新中...' : '更新'}
              </Button>
            )}
            {plugin.rollback_version && (
              <Button variant="ghost" size="sm" onClick={handleRollback} disabled={rollingBack}>
                回滚
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleUninstall} disabled={uninstalling} className="text-red-500 hover:text-red-600">
              {uninstalling ? '卸载中...' : '卸载'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

interface PreflightDialogProps {
  job: InstallJob
  onConfirm: (grantedPermissions: string[]) => void
  onCancel: () => void
}

function PreflightDialog({ job, onConfirm, onCancel }: PreflightDialogProps) {
  const preflight = job.preflight
  const [grantedPermissions, setGrantedPermissions] = useState<string[]>(
    preflight?.permissions || []
  )

  if (!preflight) return null

  const criticalIssues = preflight.security_issues.filter(i => i.severity === 'critical')
  const hasBlockingIssues = criticalIssues.length > 0 || preflight.security_verdict === 'block'

  const togglePermission = (perm: string) => {
    setGrantedPermissions(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-background shadow-xl">
        <div className="border-b p-6">
          <h2 className="text-xl font-semibold">安装确认</h2>
          <p className="mt-1 text-sm text-muted-foreground">请检查以下信息后确认安装</p>
        </div>
        <div className="space-y-4 p-6">
          <div>
            <h3 className="font-medium">{preflight.name}</h3>
            <p className="text-sm text-muted-foreground">{preflight.description}</p>
            <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
              <span>版本: {preflight.version}</span>
              <span>发布者: {preflight.publisher.name}</span>
              <span>大小: {formatSize(preflight.total_size)}</span>
            </div>
          </div>

          {!preflight.is_compatible_platform && (
            <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-sm text-orange-800">
              警告: 此插件声明的平台与当前平台不兼容
            </div>
          )}

          {preflight.warnings.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
              <div className="text-sm font-medium text-amber-800">警告</div>
              <ul className="mt-1 list-disc pl-5 text-xs text-amber-700">
                {preflight.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {preflight.security_issues.length > 0 && (
            <div className={cn(
              'rounded-md border p-3',
              hasBlockingIssues ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'
            )}>
              <div className={cn('text-sm font-medium', hasBlockingIssues ? 'text-red-800' : 'text-amber-800')}>
                安全问题 ({preflight.security_issues.length})
              </div>
              <ul className="mt-1 space-y-1">
                {preflight.security_issues.map((issue, i) => (
                  <li key={i} className={cn('text-xs', hasBlockingIssues ? 'text-red-700' : 'text-amber-700')}>
                    [{issue.severity}] {issue.message}
                    {issue.file && <span className="ml-2 font-mono">({issue.file})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {preflight.permissions.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium">请求的权限</h4>
              <div className="space-y-2">
                {preflight.permissions.map(perm => (
                  <label key={perm} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                    <input
                      type="checkbox"
                      checked={grantedPermissions.includes(perm)}
                      onChange={() => togglePermission(perm)}
                      className="h-4 w-4"
                    />
                    <span>{PERMISSION_LABELS[perm] || perm}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {preflight.skills.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium">包含的 Skill ({preflight.skills.length})</h4>
              <div className="flex flex-wrap gap-1">
                {preflight.skills.map(s => (
                  <Badge key={s.id} variant="muted" className="text-xs">
                    {s.id}
                    {s.already_exists && <span className="ml-1 text-amber-600">(已存在)</span>}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="ghost" onClick={onCancel}>取消</Button>
          <Button
            onClick={() => onConfirm(grantedPermissions)}
            disabled={hasBlockingIssues}
          >
            {hasBlockingIssues ? '存在安全问题，无法安装' : '确认安装'}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface InstallWizardProps {
  onClose: () => void
  onInstalled: () => void
}

function InstallWizard({ onClose, onInstalled }: InstallWizardProps) {
  const [source, setSource] = useState('')
  const [step, setStep] = useState<'input' | 'preflighting' | 'preflight' | 'installing' | 'done' | 'error'>('input')
  const [job, setJob] = useState<InstallJob | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePreflight = async () => {
    if (!source.trim()) return
    setStep('preflighting')
    setError(null)
    try {
      const result = await preflightPlugin(source.trim())
      setJob(result)
      const checkJob = async () => {
        try {
          const updated = await getPluginJob(result.job_id)
          setJob(updated)
          if (updated.state === 'awaiting_confirmation' && updated.preflight) {
            setStep('preflight')
            return
          }
          if (updated.state === 'failed') {
            setError(updated.error || '预检失败')
            setStep('error')
            return
          }
          if (updated.state === 'completed') {
            setStep('done')
            return
          }
          setTimeout(checkJob, 500)
        } catch {
          setTimeout(checkJob, 500)
        }
      }
      setTimeout(checkJob, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStep('error')
    }
  }

  const handleConfirm = async (grantedPermissions: string[]) => {
    if (!job) return
    setStep('installing')
    try {
      await confirmPluginInstall(job.job_id, grantedPermissions)
      const checkJob = async () => {
        try {
          const updated = await getPluginJob(job.job_id)
          setJob(updated)
          if (updated.state === 'completed') {
            setStep('done')
            onInstalled()
            return
          }
          if (updated.state === 'failed') {
            setError(updated.error || '安装失败')
            setStep('error')
            return
          }
          setTimeout(checkJob, 500)
        } catch {
          setTimeout(checkJob, 500)
        }
      }
      setTimeout(checkJob, 500)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setStep('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-background shadow-xl">
        <div className="border-b p-6">
          <h2 className="text-xl font-semibold">安装插件</h2>
          <p className="mt-1 text-sm text-muted-foreground">输入插件来源进行安装</p>
        </div>
        <div className="p-6">
          {step === 'input' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">来源 URL/路径</label>
                <Input
                  placeholder="GitHub Release URL, Git URL, 本地ZIP路径, npm包名..."
                  value={source}
                  onChange={e => setSource(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handlePreflight()}
                />
              </div>
              <div className="text-xs text-muted-foreground">
                <p>支持的来源：</p>
                <ul className="mt-1 list-disc pl-5">
                  <li>GitHub Release URL</li>
                  <li>Git 仓库 (HTTPS/SSH)</li>
                  <li>HTTPS URL</li>
                  <li>本地 ZIP 文件路径</li>
                  <li>npm 包名</li>
                  <li>PyPI 包名</li>
                </ul>
              </div>
            </div>
          )}

          {step === 'preflighting' && (
            <div className="py-8 text-center">
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
              <p className="text-sm">正在检查插件...</p>
            </div>
          )}

          {step === 'preflight' && job && (
            <PreflightDialog job={job} onConfirm={handleConfirm} onCancel={onClose} />
          )}

          {step === 'installing' && (
            <div className="py-8 text-center">
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto" />
              <p className="text-sm">正在安装插件...</p>
              {job && (
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${(job.progress || 0) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="py-8 text-center">
              <div className="mb-4 text-4xl text-emerald-500">✓</div>
              <p className="text-sm font-medium">安装成功！</p>
            </div>
          )}

          {step === 'error' && (
            <div className="py-8 text-center">
              <div className="mb-4 text-4xl text-red-500">✕</div>
              <p className="text-sm font-medium text-red-600">{error}</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          {(step === 'input' || step === 'done' || step === 'error') && (
            <Button variant="ghost" onClick={onClose}>
              {step === 'input' ? '取消' : '关闭'}
            </Button>
          )}
          {step === 'input' && (
            <Button onClick={handlePreflight} disabled={!source.trim()}>下一步</Button>
          )}
        </div>
      </div>
    </div>
  )
}

function SkillCard({ skill, onRefresh }: { skill: KarnaSkill; onRefresh: () => void }) {
  const [toggling, setToggling] = useState(false)

  const handleToggle = async () => {
    setToggling(true)
    try {
      await setSkillEnabled(skill.id, !skill.is_enabled)
      notify({ kind: 'success', message: skill.is_enabled ? 'Skill已禁用' : 'Skill已启用' })
      onRefresh()
    } catch (err) {
      notifyError(err, '切换Skill状态失败')
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className="flex items-center justify-between rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-chat-bubble-background) p-3 transition-shadow hover:shadow-sm">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{skill.name}</span>
          {skill.is_builtin && <Badge variant="muted" className="text-xs">内置</Badge>}
          <Badge variant="outline" className="text-xs">{CATEGORY_LABELS[skill.category] || skill.category}</Badge>
        </div>
        {skill.description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{skill.description}</p>
        )}
        <div className="mt-1 flex gap-2 text-[10px] text-muted-foreground">
          {skill.domains.slice(0, 3).map(d => (
            <span key={d}>{d}</span>
          ))}
        </div>
      </div>
      <Switch checked={skill.is_enabled} disabled={toggling} onCheckedChange={handleToggle} />
    </div>
  )
}

export function PluginsView() {
  const [tab, setTab] = useState<TabMode>('builtin')
  const [query, setQuery] = useState('')
  const [plugins, setPlugins] = useState<KarnaPlugin[]>([])
  const [skillPacks, setSkillPacks] = useState<KarnaSkillPack[]>([])
  const [skills, setSkills] = useState<KarnaSkill[]>([])
  const [loading, setLoading] = useState(false)
  const [installWizardOpen, setInstallWizardOpen] = useState(false)
  const [selectedPlugin, setSelectedPlugin] = useState<KarnaPlugin | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [pluginsRes, packsRes, skillsRes] = await Promise.all([
        listKarnaPlugins(),
        listSkillPacks(),
        listKarnaSkills()
      ])
      setPlugins(pluginsRes.plugins)
      setSkillPacks(packsRes.skill_packs)
      setSkills(skillsRes.skills)
    } catch (err) {
      notifyError(err, '加载插件数据失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useRefreshHotkey(refresh)

  useEffect(() => {
    void refresh()
  }, [refresh])

  const builtinPlugins = useMemo(
    () => plugins.filter(p => p.is_builtin || BUILTIN_PLUGIN_IDS.includes(p.id)),
    [plugins]
  )

  const installedPlugins = useMemo(
    () => plugins.filter(p => !p.is_builtin && !BUILTIN_PLUGIN_IDS.includes(p.id)),
    [plugins]
  )

  const filteredBuiltin = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return builtinPlugins
    return builtinPlugins.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    )
  }, [builtinPlugins, query])

  const filteredInstalled = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return installedPlugins
    return installedPlugins.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q)
    )
  }, [installedPlugins, query])

  const filteredSkills = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return skills
    return skills.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.tags.some(t => t.toLowerCase().includes(q))
    )
  }, [skills, query])

  const filteredPacks = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return skillPacks
    return skillPacks.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    )
  }, [skillPacks, query])

  return (
    <PageSearchShell
      searchPlaceholder="搜索插件、Skill..."
      searchValue={query}
      onSearchChange={setQuery}
      searchTrailingAction={
        <Button size="sm" onClick={() => setInstallWizardOpen(true)}>
          安装插件
        </Button>
      }
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ paddingLeft: PAGE_INSET_X, paddingRight: PAGE_INSET_X }}>
        <Tabs value={tab} onValueChange={v => setTab(v as TabMode)} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="builtin">内置插件 ({builtinPlugins.length})</TabsTrigger>
            <TabsTrigger value="installed">已安装 ({installedPlugins.length})</TabsTrigger>
            <TabsTrigger value="skills">所有 Skill ({skills.length})</TabsTrigger>
            <TabsTrigger value="packs">扩展包 ({skillPacks.length})</TabsTrigger>
          </TabsList>

          {tab === 'builtin' && (
            <div className="mt-0">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredBuiltin.map(plugin => (
                  <PluginCard key={plugin.id} plugin={plugin} onRefresh={refresh} onSelect={setSelectedPlugin} />
                ))}
                {filteredBuiltin.length === 0 && !loading && (
                  <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                    {query ? '未找到匹配的内置插件' : '正在加载内置插件...'}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'installed' && (
            <div className="mt-0">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredInstalled.map(plugin => (
                  <PluginCard key={plugin.id} plugin={plugin} onRefresh={refresh} onSelect={setSelectedPlugin} />
                ))}
                {filteredInstalled.length === 0 && !loading && (
                  <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                    {query ? '未找到匹配的插件' : '还没有安装外部插件，点击右上角"安装插件"开始'}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'skills' && (
            <div className="mt-0">
              <div className="space-y-2">
                {filteredSkills.map(skill => (
                  <SkillCard key={skill.id} skill={skill} onRefresh={refresh} />
                ))}
                {filteredSkills.length === 0 && !loading && (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    {query ? '未找到匹配的Skill' : '暂无Skill'}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'packs' && (
            <div className="mt-0">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredPacks.map(pack => (
                  <div key={pack.id} className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-chat-bubble-background) p-4">
                    <div className="pb-2">
                      <span className="text-base font-medium">{pack.name}</span>
                      <p className="mt-1 text-sm text-muted-foreground">{CATEGORY_LABELS[pack.category] || pack.category}</p>
                    </div>
                    <div>
                      <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div>Skill: {pack.skills_count} 个</div>
                        <div>大小: {formatSize(pack.size_bytes)}</div>
                        <div>版本: {pack.version}</div>
                      </div>
                    </div>
                  </div>
                ))}
                {filteredPacks.length === 0 && !loading && (
                  <div className="col-span-full py-12 text-center text-sm text-muted-foreground">
                    {query ? '未找到匹配的扩展包' : '暂无扩展包'}
                  </div>
                )}
              </div>
            </div>
          )}
        </Tabs>
      </div>

      {installWizardOpen && (
        <InstallWizard
          onClose={() => setInstallWizardOpen(false)}
          onInstalled={() => {
            setInstallWizardOpen(false)
            refresh()
          }}
        />
      )}

      {selectedPlugin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-background shadow-xl">
            <div className="border-b p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <StatusDot status={selectedPlugin.health_status} />
                    {selectedPlugin.name}
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">{selectedPlugin.description}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedPlugin(null)}>✕</Button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">ID</div>
                  <div className="font-mono">{selectedPlugin.id}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">版本</div>
                  <div>{selectedPlugin.version}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">状态</div>
                  <div className={HEALTH_STATUS_COLORS[selectedPlugin.health_status]}>
                    {HEALTH_STATUS_LABELS[selectedPlugin.health_status]}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">发布者</div>
                  <div>{selectedPlugin.publisher_name}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">分类</div>
                  <div>{CATEGORY_LABELS[selectedPlugin.category] || selectedPlugin.category}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">安装时间</div>
                  <div>{formatDate(selectedPlugin.installed_at)}</div>
                </div>
              </div>

              {selectedPlugin.health_report && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">健康检查</h4>
                  <div className="space-y-1">
                    {selectedPlugin.health_report.checks.map((check, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={
                          check.status === 'pass' ? 'text-emerald-500' :
                          check.status === 'warn' ? 'text-amber-500' : 'text-red-500'
                        }>
                          {check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✕'}
                        </span>
                        <span>{check.name}</span>
                        {check.message && <span className="text-muted-foreground">- {check.message}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedPlugin.skills.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">包含的 Skill ({selectedPlugin.skills.length})</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedPlugin.skills.map(s => (
                      <Badge key={s.id} variant="muted">{s.name}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {selectedPlugin.permissions.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">已授权权限</h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedPlugin.permissions_granted.map(p => (
                      <Badge key={p} variant="default">{PERMISSION_LABELS[p] || p}</Badge>
                    ))}
                    {selectedPlugin.permissions.filter(p => !selectedPlugin.permissions_granted.includes(p)).map(p => (
                      <Badge key={p} variant="outline" className="text-muted-foreground">{PERMISSION_LABELS[p] || p}</Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </PageSearchShell>
  )
}
