import type * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PageLoader } from '@/components/page-loader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Switch } from '@/components/ui/switch'
import { TextTab, TextTabMeta } from '@/components/ui/text-tab'
import { getSkillsCatalog, getToolsets, installSkill, toggleSkill, toggleToolset, uninstallSkill } from '@/hermes'
import { useI18n } from '@/i18n'
import { isDesktopToolsetVisible } from '@/lib/desktop-toolsets'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import type { SkillCatalogDiagnostics, SkillInfo, ToolsetInfo } from '@/types/hermes'

import { useRefreshHotkey } from '../hooks/use-refresh-hotkey'
import { useRouteEnumParam } from '../hooks/use-route-enum-param'
import { PAGE_INSET_X } from '../layout-constants'
import { PageSearchShell } from '../page-search-shell'
import { ComputerUsePanel } from '../settings/computer-use-panel'
import { asText, includesQuery, toolNames, toolsetDisplayLabel } from '../settings/helpers'
import { ToolsetConfigPanel } from '../settings/toolset-config-panel'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'
import { AddSkillWizard } from './add-skill-wizard'

const SKILLS_MODES = ['skills', 'toolsets'] as const
type SkillsMode = (typeof SKILLS_MODES)[number]

function skillDisplayName(skill: SkillInfo): string {
  return skill.name
}

function skillDisplayDescription(skill: SkillInfo): string {
  return skill.displayDescription || asText(skill.description) || ''
}

function skillDisplayCategory(skill: SkillInfo): string {
  return skill.displayCategory || asText(skill.category) || 'general'
}

function categoryFor(skill: SkillInfo): string {
  return asText(skill.category) || 'general'
}

function filteredSkills(skills: SkillInfo[], query: string, category: string | null, onlyEnabled: boolean, onlyOfficial: boolean): SkillInfo[] {
  const q = query.trim().toLowerCase()

  return skills
    .filter(skill => {
      if (onlyEnabled && !skill.enabled) {return false}

      if (onlyOfficial && !skill.isKarnaOfficial) {return false}

      if (category && categoryFor(skill) !== category) {return false}

      if (!q) {return true}

      return (
        includesQuery(skill.name, q) ||
        includesQuery(skill.description, q) ||
        includesQuery(skill.category, q) ||
        includesQuery(skill.displayDescription || '', q) ||
        includesQuery(skill.displayCategory || '', q)
      )
    })
}

function filteredToolsets(toolsets: ToolsetInfo[], query: string): ToolsetInfo[] {
  const q = query.trim().toLowerCase()

  return toolsets
    .filter(toolset => {
      if (!isDesktopToolsetVisible(toolset.name)) {
        return false
      }

      if (!q) {
        return true
      }

      const label = toolsetDisplayLabel(toolset)

      return (
        includesQuery(toolset.name, q) ||
        includesQuery(label, q) ||
        includesQuery(toolset.label, q) ||
        includesQuery(toolset.description, q) ||
        toolNames(toolset).some(name => includesQuery(name, q))
      )
    })
    .sort((a, b) => toolsetDisplayLabel(a).localeCompare(toolsetDisplayLabel(b)))
}

interface SkillsViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
}

export function SkillsView({ setStatusbarItemGroup: _setStatusbarItemGroup, ...props }: SkillsViewProps) {
  const { t } = useI18n()
  const [mode, setMode] = useRouteEnumParam('tab', SKILLS_MODES, 'skills')

  const [query, setQuery] = useState('')
  const [skills, setSkills] = useState<SkillInfo[] | null>(null)
  const [skillDiagnostics, setSkillDiagnostics] = useState<SkillCatalogDiagnostics | null>(null)
  const [diagnosticsView, setDiagnosticsView] = useState<'excluded' | 'conflicts' | 'missing' | null>(null)
  const [toolsets, setToolsets] = useState<ToolsetInfo[] | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [savingSkill, setSavingSkill] = useState<string | null>(null)
  const [savingToolset, setSavingToolset] = useState<string | null>(null)
  const [expandedToolset, setExpandedToolset] = useState<string | null>(null)
  const [onlyEnabled, setOnlyEnabled] = useState(false)
  const [onlyOfficial, setOnlyOfficial] = useState(false)
  const [addSkillWizardOpen, setAddSkillWizardOpen] = useState(false)

  const refreshCapabilities = useCallback(async () => {
    setRefreshing(true)

    try {
      const [catalog, nextToolsets] = await Promise.all([getSkillsCatalog(), getToolsets()])
      setSkills(catalog.skills)
      setSkillDiagnostics(catalog.diagnostics)
      setToolsets(nextToolsets)
    } catch (err) {
      notifyError(err, t.skills.skillsLoadFailed)
    } finally {
      setRefreshing(false)
    }
  }, [t])

  const refreshToolsets = useCallback(() => {
    getToolsets()
      .then(setToolsets)
      .catch(err => notifyError(err, t.skills.toolsetsRefreshFailed))
  }, [t])

  useRefreshHotkey(refreshCapabilities)

  useEffect(() => {
    void refreshCapabilities()
  }, [refreshCapabilities])

  const categories = useMemo(() => {
    if (!skills) {
      return []
    }

    const counts = new Map<string, { count: number; displayName: string }>()

    for (const skill of skills) {
      const key = categoryFor(skill)
      const existing = counts.get(key)

      if (existing) {
        existing.count += 1
      } else {
        counts.set(key, { count: 1, displayName: skillDisplayCategory(skill) })
      }
    }

    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => ({ key, count: data.count, displayName: data.displayName }))
  }, [skills])

  const visibleSkills = useMemo(
    () => (skills ? filteredSkills(skills, query, mode === 'skills' ? activeCategory : null, onlyEnabled, onlyOfficial) : []),
    [activeCategory, mode, query, skills, onlyEnabled, onlyOfficial]
  )

  const visibleToolsets = useMemo(() => (toolsets ? filteredToolsets(toolsets, query) : []), [query, toolsets])

  const skillGroups = useMemo(() => {
    const groups = new Map<string, { displayName: string; skills: SkillInfo[] }>()

    for (const skill of visibleSkills) {
      const key = categoryFor(skill)
      const existing = groups.get(key)

      if (existing) {
        existing.skills.push(skill)
      } else {
        groups.set(key, { displayName: skillDisplayCategory(skill), skills: [skill] })
      }
    }

    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => [key, data.displayName, data.skills] as const)
  }, [visibleSkills])

  const totalSkills = skills?.length || 0
  const enabledSkills = skills?.filter(s => s.enabled).length || 0
  const officialSkills = skills?.filter(s => s.isKarnaOfficial).length || 0
  const enabledToolsets = toolsets?.filter(toolset => toolset.enabled).length || 0

  async function handleToggleSkill(skill: SkillInfo, enabled: boolean) {
    const identifier = skill.id || skill.name
    setSavingSkill(identifier)

    try {
      await toggleSkill(identifier, enabled)
      setSkills(current => current?.map(row => ((row.id || row.name) === identifier ? { ...row, enabled } : row)) ?? current)
      notify({
        kind: 'success',
        title: enabled ? t.skills.skillEnabled : t.skills.skillDisabled,
        message: t.skills.appliesToNewSessions(skillDisplayName(skill))
      })
    } catch (err) {
      notifyError(err, t.skills.failedToUpdate(skillDisplayName(skill)))
    } finally {
      setSavingSkill(null)
    }
  }

  async function handleInstallSkill(skill: SkillInfo) {
    const identifier = skill.id || skill.name
    setSavingSkill(identifier)

    try {
      await installSkill(identifier)
      await refreshCapabilities()
      notify({
        kind: 'success',
        title: '技能已安装',
        message: t.skills.appliesToNewSessions(skillDisplayName(skill))
      })
    } catch (err) {
      notifyError(err, `安装失败：${skillDisplayName(skill)}`)
    } finally {
      setSavingSkill(null)
    }
  }

  async function handleUninstallSkill(skill: SkillInfo) {
    const identifier = skill.id || skill.name
    setSavingSkill(identifier)

    try {
      await uninstallSkill(identifier)
      await refreshCapabilities()
      notify({
        kind: 'success',
        title: '技能已卸载',
        message: `${skillDisplayName(skill)} 已移入本地禁用区，可从未安装条目恢复。`
      })
    } catch (err) {
      notifyError(err, `卸载失败：${skillDisplayName(skill)}`)
    } finally {
      setSavingSkill(null)
    }
  }

  async function handleToggleToolset(toolset: ToolsetInfo, enabled: boolean) {
    setSavingToolset(toolset.name)

    try {
      await toggleToolset(toolset.name, enabled)
      setToolsets(
        current =>
          current?.map(row => (row.name === toolset.name ? { ...row, enabled, available: enabled } : row)) ?? current
      )
      notify({
        kind: 'success',
        title: enabled ? t.skills.toolsetEnabled : t.skills.toolsetDisabled,
        message: t.skills.appliesToNewSessions(toolsetDisplayLabel(toolset))
      })
    } catch (err) {
      notifyError(err, t.skills.failedToUpdate(toolsetDisplayLabel(toolset)))
    } finally {
      setSavingToolset(null)
    }
  }

  return (
    <>
    <PageSearchShell
      {...props}
      filters={
        mode === 'skills' && categories.length > 0 ? (
          <>
            <TextTab active={activeCategory === null} onClick={() => setActiveCategory(null)}>
              全部 <TextTabMeta>{totalSkills}</TextTabMeta>
            </TextTab>
            {categories.map(category => (
              <TextTab
                active={activeCategory === category.key}
                key={category.key}
                onClick={() => setActiveCategory(activeCategory === category.key ? null : category.key)}
              >
                {category.displayName} <TextTabMeta>{category.count}</TextTabMeta>
              </TextTab>
            ))}
          </>
        ) : undefined
      }
      onSearchChange={setQuery}
      searchHidden={mode === 'skills' ? (skills?.length ?? 0) === 0 : (toolsets?.length ?? 0) === 0}
      searchPlaceholder={mode === 'skills' ? '搜索技能名称、描述或分类…' : t.skills.searchToolsets}
      searchTrailingAction={
        <div className="flex items-center gap-1">
          {mode === 'skills' ? (
            <>
              <Button
                disabled={refreshing}
                onClick={() => setAddSkillWizardOpen(true)}
                size="sm"
                type="button"
                variant="secondary"
              >
                <Codicon name="add" size="0.875rem" />
                添加技能
              </Button>
              <Button
                aria-label={onlyOfficial ? '显示全部' : '仅显示官方'}
                className={cn(
                  'h-7 w-7',
                  onlyOfficial ? 'bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent)]' : 'text-(--ui-text-tertiary) hover:text-foreground'
                )}
                disabled={refreshing}
                onClick={() => setOnlyOfficial(v => !v)}
                size="icon-xs"
                title={onlyOfficial ? '显示全部技能' : '仅显示Karna官方技能'}
                type="button"
                variant="ghost"
              >
                <Codicon name="verified" size="0.875rem" />
              </Button>
              <Button
                aria-label={onlyEnabled ? '显示全部' : '仅显示已启用'}
                className={cn(
                  'h-7 w-7',
                  onlyEnabled ? 'bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent)]' : 'text-(--ui-text-tertiary) hover:text-foreground'
                )}
                disabled={refreshing}
                onClick={() => setOnlyEnabled(v => !v)}
                size="icon-xs"
                title={onlyEnabled ? '显示全部技能' : '仅显示已启用技能'}
                type="button"
                variant="ghost"
              >
                <Codicon name="check" size="0.875rem" />
              </Button>
            </>
          ) : null}
          <Button
            aria-label={refreshing ? t.skills.refreshing : t.skills.refresh}
            className="text-(--ui-text-tertiary) hover:bg-transparent hover:text-foreground"
            disabled={refreshing}
            onClick={() => void refreshCapabilities()}
            size="icon-xs"
            title={refreshing ? t.skills.refreshing : t.skills.refresh}
            type="button"
            variant="ghost"
          >
            <Codicon name="refresh" size="0.875rem" spinning={refreshing} />
          </Button>
        </div>
      }
      searchValue={query}
      tabs={
        <>
          <TextTab active={mode === 'skills'} onClick={() => setMode('skills')}>
            技能库
          </TextTab>
          <TextTab active={mode === 'toolsets'} onClick={() => setMode('toolsets')}>
            {t.skills.tabToolsets}
          </TextTab>
        </>
      }
    >
      {!skills || !toolsets ? (
        <PageLoader label={t.skills.loading} />
      ) : mode === 'skills' ? (
        <div className={cn('h-full overflow-y-auto py-3', PAGE_INSET_X)}>
          {mode === 'skills' && (
            <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">
              <div className="rounded-[10px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-3">
                <div className="text-[11px] text-muted-foreground">总技能数</div>
                <div className="mt-1 text-lg font-semibold text-[var(--theme-foreground)]">{totalSkills}</div>
              </div>
              <div className="rounded-[10px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-3">
                <div className="text-[11px] text-muted-foreground">已启用</div>
                <div className="mt-1 text-lg font-semibold text-emerald-500">{enabledSkills}</div>
              </div>
              <div className="rounded-[10px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-3">
                <div className="text-[11px] text-muted-foreground">官方技能</div>
                <div className="mt-1 text-lg font-semibold text-sky-500">{officialSkills}</div>
              </div>
              <div className="rounded-[10px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-3">
                <div className="text-[11px] text-muted-foreground">技能来源</div>
                <div className="mt-1 text-lg font-semibold text-violet-500">{skillDiagnostics?.sourceCount ?? totalSkills}</div>
              </div>
              <button className="rounded-[10px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-3 text-left hover:border-violet-500/40" onClick={() => setDiagnosticsView(diagnosticsView === 'conflicts' ? null : 'conflicts')} type="button">
                <div className="text-[11px] text-muted-foreground">同名冲突</div>
                <div className="mt-1 text-lg font-semibold text-amber-500">{skillDiagnostics?.conflictCount ?? 0}</div>
              </button>
              <button className="rounded-[10px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-3 text-left hover:border-violet-500/40" onClick={() => setDiagnosticsView(diagnosticsView === 'missing' ? null : 'missing')} type="button">
                <div className="text-[11px] text-muted-foreground">暂不可用 / 已卸载</div>
                <div className="mt-1 text-lg font-semibold text-orange-500">{(skillDiagnostics?.unavailableCount ?? 0) + (skillDiagnostics?.uninstalledCount ?? 0)}</div>
              </button>
            </div>
          )}
          {skillDiagnostics?.driftDetected ? (
            <div className="mb-3 rounded-[10px] border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
              <div className="font-semibold">技能目录数量发生变化，Karna 已保留上一次清单，没有静默删除技能。</div>
              <div className="mt-1 opacity-80">当前 {skillDiagnostics.logicalCount} 个，上次 {skillDiagnostics.previousLogicalCount || '无基线'} 个；暂不可用 {skillDiagnostics.unavailableCount} 个，扫描错误 {skillDiagnostics.errors.length} 个。</div>
            </div>
          ) : null}
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <Button onClick={() => setDiagnosticsView(diagnosticsView === 'excluded' ? null : 'excluded')} size="sm" type="button" variant="ghost">
              查看被排除项 ({skillDiagnostics?.excludedCount ?? 0})
            </Button>
            <Button onClick={() => setDiagnosticsView(diagnosticsView === 'conflicts' ? null : 'conflicts')} size="sm" type="button" variant="ghost">
              查看同名来源 ({skillDiagnostics?.conflictCount ?? 0})
            </Button>
            <Button onClick={() => void refreshCapabilities()} size="sm" type="button" variant="ghost">
              重新扫描并恢复可用项
            </Button>
          </div>
          {diagnosticsView ? (
            <div className="mb-4 max-h-56 overflow-auto rounded-[10px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 p-3 text-xs">
              {diagnosticsView === 'excluded' ? (
                <div className="space-y-1">
                  {(skillDiagnostics?.excluded || []).length ? skillDiagnostics?.excluded.map(item => <div className="break-all font-mono" key={`${item.path}:${item.reason}`}><span className="text-muted-foreground">{item.reason}</span> · {item.path}</div>) : <div className="text-muted-foreground">没有被排除的目录。</div>}
                </div>
              ) : diagnosticsView === 'conflicts' ? (
                <div className="space-y-3">
                  {skills?.filter(skill => skill.conflict).map(skill => <div key={skill.id || skill.name}><div className="font-semibold">{skill.name} · {skill.sourceCount} 个来源</div>{skill.sources?.map(source => <div className="break-all font-mono text-muted-foreground" key={source.id}>{source.selected ? '当前：' : '备选：'}{source.path}</div>)}</div>)}
                  {!skills?.some(skill => skill.conflict) ? <div className="text-muted-foreground">没有同名来源。</div> : null}
                </div>
              ) : (
                <div className="space-y-1">
                  {skills?.filter(skill => skill.missing || skill.installed === false).map(skill => <div className="break-all" key={skill.id || skill.name}><span className="font-semibold">{skill.name}</span> · {skill.missing ? '源目录暂不可用，已保留清单' : '已显式卸载，可重新安装'}</div>)}
                  {!skills?.some(skill => skill.missing || skill.installed === false) ? <div className="text-muted-foreground">没有暂不可用或已卸载技能。</div> : null}
                </div>
              )}
            </div>
          ) : null}
          {visibleSkills.length === 0 ? (
            <EmptyState description="尝试更换关键词或分类；也可以创建本地技能、导入技能目录，或检查技能是否尚未安装。" title="未找到技能" />
          ) : (
            <div className="space-y-5">
              {skillGroups.map(([category, displayName, list]) => (
                <div className="space-y-1.5" key={category}>
                  {activeCategory === null && (
                    <div className="flex items-center gap-2 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      <span>{displayName}</span>
                      <span className="text-[0.6rem] normal-case tracking-normal opacity-60">({list.length})</span>
                    </div>
                  )}
                  <div className="space-y-1">
                    {list.map(skill => {
                      const source = skill.source || (skill.isKarnaOfficial ? 'builtin' : 'local')
                      const permissions = skill.permissions || []
                      const dependencies = skill.dependencies || []
                      const platforms = skill.platforms || []

                      const sourceLabels: Record<string, { label: string; className: string }> = {
                        builtin: { label: '内置', className: 'bg-sky-500/10 text-sky-500' },
                        local: { label: '本地', className: 'bg-emerald-500/10 text-emerald-500' },
                        community: { label: '社区', className: 'bg-violet-500/10 text-violet-500' }
                      }

                      const sourceInfo = sourceLabels[source] || sourceLabels.local

                      return (
                        <div
                          className="grid gap-3 rounded-[8px] border border-transparent px-3 py-2.5 transition-colors hover:border-[var(--dt-border)] hover:bg-[var(--theme-card-seed)]/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                          key={skill.id || skill.name}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="truncate text-sm font-medium text-[var(--theme-foreground)] font-mono">
                                {skillDisplayName(skill)}
                              </span>
                              {skill.isKarnaOfficial ? (
                                <Badge className="h-4 px-1 text-[9px] font-medium bg-sky-500/10 text-sky-500 border-0">
                                  官方
                                </Badge>
                              ) : null}
                              <Badge className={cn('h-4 px-1 text-[9px] font-medium border-0', sourceInfo.className)}>
                                {sourceInfo.label}
                              </Badge>
                              {skill.isHot ? (
                                <Badge className="h-4 px-1 text-[9px] font-medium bg-amber-500/10 text-amber-500 border-0">
                                  热门
                                </Badge>
                              ) : null}
                              {skill.installed === false && (
                                <Badge className="h-4 px-1 text-[9px] font-medium bg-orange-500/10 text-orange-500 border-0">
                                  未安装
                                </Badge>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                              {skillDisplayDescription(skill) || '暂无描述'}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1">
                              {permissions.slice(0, 3).map(perm => (
                                <span
                                  className="rounded bg-(--ui-bg-quinary) px-1 py-px text-[9px] font-mono text-(--ui-text-tertiary)"
                                  key={perm}
                                >
                                  {perm}
                                </span>
                              ))}
                              {permissions.length > 3 && (
                                <span className="text-[9px] text-(--ui-text-tertiary)">+{permissions.length - 3}</span>
                              )}
                              {skill.missing ? (
                                <Badge className="h-4 border-0 bg-red-500/10 px-1 text-[9px] font-medium text-red-500">暂不可用</Badge>
                              ) : null}
                              {skill.conflict ? (
                                <Badge className="h-4 border-0 bg-amber-500/10 px-1 text-[9px] font-medium text-amber-500">{skill.sourceCount} 个来源</Badge>
                              ) : null}
                              {dependencies.slice(0, 3).map(dependency => <span className="rounded bg-amber-500/10 px-1 py-px text-[9px] font-mono text-amber-600" key={dependency}>依赖 {dependency}</span>)}
                              {platforms.length > 0 ? <span className="text-[9px] text-(--ui-text-tertiary)/70">平台: {platforms.join('/')}</span> : null}
                              {skill.lastUsed && (
                                <span className="ml-1 text-[9px] text-(--ui-text-tertiary)/70">
                                  最近调用: {new Date(skill.lastUsed).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {skill.installed === false ? (
                              <Button
                                disabled={savingSkill === (skill.id || skill.name)}
                                onClick={() => void handleInstallSkill(skill)}
                                size="sm"
                                variant="secondary"
                              >
                                安装
                              </Button>
                            ) : source === 'local' && !skill.isKarnaOfficial ? (
                              <Button
                                disabled={savingSkill === (skill.id || skill.name)}
                                onClick={() => void handleUninstallSkill(skill)}
                                size="sm"
                                variant="ghost"
                              >
                                卸载
                              </Button>
                            ) : null}
                            <Switch
                              checked={skill.enabled}
                              disabled={savingSkill === (skill.id || skill.name) || skill.installed === false || skill.available === false}
                              onCheckedChange={checked => void handleToggleSkill(skill, checked)}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={cn('h-full overflow-y-auto py-3', PAGE_INSET_X)}>
          {visibleToolsets.length === 0 ? (
            <EmptyState description={t.skills.noToolsetsDesc} title={t.skills.noToolsetsTitle} />
          ) : (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">
                {t.skills.toolsetsEnabled(enabledToolsets, toolsets.length)}
              </div>
              <div>
                {visibleToolsets.map(toolset => {
                  const tools = toolNames(toolset)
                  const label = toolsetDisplayLabel(toolset)
                  const expanded = expandedToolset === toolset.name

                  return (
                    <div className="px-0 py-2.5" key={toolset.name}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-medium">{label}</div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            aria-expanded={expanded}
                            aria-label={t.skills.configureToolset(label)}
                            className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                            onClick={() =>
                              setExpandedToolset(current => (current === toolset.name ? null : toolset.name))
                            }
                            type="button"
                          >
                            <StatusPill active={toolset.configured}>
                              {toolset.configured ? t.skills.configured : t.skills.needsKeys}
                            </StatusPill>
                          </button>
                          <Switch
                            aria-label={t.skills.toggleToolset(label)}
                            checked={toolset.enabled}
                            disabled={savingToolset === toolset.name}
                            onCheckedChange={checked => void handleToggleToolset(toolset, checked)}
                          />
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {asText(toolset.description) || t.skills.noDescription}
                      </p>
                      {tools.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {tools.map(name => (
                            <span
                              className="rounded-md bg-(--ui-bg-quinary) px-1.5 py-0.5 font-mono text-[0.65rem] text-(--ui-text-tertiary)"
                              key={name}
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                      {expanded && toolset.name === 'computer_use' && (
                        <ComputerUsePanel onConfiguredChange={refreshToolsets} />
                      )}
                      {expanded && <ToolsetConfigPanel onConfiguredChange={refreshToolsets} toolset={toolset.name} />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </PageSearchShell>

    <AddSkillWizard
      onOpenChange={setAddSkillWizardOpen}
      onSkillsChanged={() => void refreshCapabilities()}
      open={addSkillWizardOpen}
    />
    </>
  )
}

function StatusPill({ active, children }: { active: boolean; children: string }) {
  return (
    <Badge
      className={
        active ? 'bg-(--ui-bg-tertiary) text-(--ui-text-secondary)' : 'bg-(--ui-bg-quinary) text-(--ui-text-tertiary)'
      }
    >
      {children}
    </Badge>
  )
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="grid min-h-52 place-items-center text-center">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-1 text-xs text-muted-foreground">{description}</div>
      </div>
    </div>
  )
}
