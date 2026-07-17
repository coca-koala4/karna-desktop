
import type * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PageLoader } from '@/components/page-loader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Switch } from '@/components/ui/switch'
import { TextTab, TextTabMeta } from '@/components/ui/text-tab'
import { getSkillsCatalog, getToolsets, installSkill, toggleSkill, toggleToolset, uninstallSkill } from '@/hermes'
import {
  CATEGORY_LABELS,
  HEALTH_STATUS_COLORS,
  HEALTH_STATUS_LABELS,
  PERMISSION_LABELS,
  type InstallJob,
  type KarnaPlugin,
  type KarnaSkill,
  type KarnaSkillPack,
  checkPluginUpdate,
  confirmPluginInstall,
  getPluginJob,
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

const MODES = ['skills', 'toolsets', 'plugins', 'installed', 'plugin-skills', 'packs'] as const
type Mode = (typeof MODES)[number]

const S = {
  tabs: { skills: '\u6280\u80fd\u5e93', toolsets: '\u5de5\u5177\u96c6', plugins: '\u5185\u7f6e\u63d2\u4ef6', installed: '\u5df2\u5b89\u88c5', pluginSkills: '\u63d2\u4ef6 Skill', packs: '\u6269\u5c55\u5305' },
  search: '\u641c\u7d22\u6280\u80fd\u3001\u5de5\u5177\u3001\u63d2\u4ef6\u3001Skill \u6216\u6269\u5c55\u5305...',
  merged: '\u63d2\u4ef6\u5e73\u53f0\u5df2\u5408\u5e76\u5230\u6280\u80fd\u4e0e\u5de5\u5177\u5de5\u574a\uff1a\u5185\u7f6e\u63d2\u4ef6\u3001\u5df2\u5b89\u88c5\u63d2\u4ef6\u3001\u63d2\u4ef6 Skill \u548c\u6269\u5c55\u5305\u90fd\u5728\u8fd9\u91cc\u7edf\u4e00\u7ba1\u7406\u3002',
  addSkill: '\u6dfb\u52a0\u6280\u80fd', installPlugin: '\u5b89\u88c5\u63d2\u4ef6/\u6269\u5c55\u5305', refresh: '\u5237\u65b0', loading: '\u6b63\u5728\u52a0\u8f7d\u5de5\u574a...', all: '\u5168\u90e8',
  enabledOnly: '\u53ea\u770b\u5df2\u542f\u7528', officialOnly: '\u53ea\u770b Karna \u5b98\u65b9', showAll: '\u663e\u793a\u5168\u90e8',
  total: '\u603b\u6570', enabled: '\u5df2\u542f\u7528', official: '\u5b98\u65b9', sources: '\u6765\u6e90', conflicts: '\u51b2\u7a81', unavailable: '\u4e0d\u53ef\u7528',
  builtin: '\u5185\u7f6e', local: '\u672c\u5730', community: '\u793e\u533a', notInstalled: '\u672a\u5b89\u88c5', install: '\u5b89\u88c5', uninstall: '\u5378\u8f7d', detail: '\u8be6\u60c5',
  version: '\u7248\u672c', status: '\u72b6\u6001', category: '\u5206\u7c7b', publisher: '\u53d1\u5e03\u8005', size: '\u5927\u5c0f', permission: '\u6743\u9650', noDesc: '\u6682\u65e0\u8bf4\u660e',
  checkUpdate: '\u68c0\u67e5\u66f4\u65b0', update: '\u66f4\u65b0', rollback: '\u56de\u6eda', noData: '\u6ca1\u6709\u627e\u5230\u5185\u5bb9', hint: '\u8bf7\u66f4\u6362\u5173\u952e\u8bcd\u6216\u5207\u6362\u5206\u7c7b\u3002',
  ok: '\u64cd\u4f5c\u5b8c\u6210', fail: '\u64cd\u4f5c\u5931\u8d25', applies: '\u5c06\u5e94\u7528\u4e8e\u65b0\u4f1a\u8bdd\u548c\u65b0\u5de5\u4f5c\u6d41\u3002', sourcePrompt: '\u8bf7\u8f93\u5165\u63d2\u4ef6\u6216\u6269\u5c55\u5305\u6765\u6e90 URL/\u8def\u5f84'
}
const BUILTIN = new Set(['karna.computer-use','karna.chrome','karna.pdf','karna.documents','karna.spreadsheets','karna.presentations','karna.web-research','karna.local-files','karna.ocr','karna.email','karna.calendar','karna.zotero'])

const fmtSize = (n: number) => !n ? '-' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : n < 1073741824 ? `${(n/1048576).toFixed(1)} MB` : `${(n/1073741824).toFixed(2)} GB`
const labelCat = (v: string) => CATEGORY_LABELS[v] || v || S.category
const healthLabel = (v: string) => HEALTH_STATUS_LABELS[v as keyof typeof HEALTH_STATUS_LABELS] || v || '-'
const healthColor = (v: string) => HEALTH_STATUS_COLORS[v as keyof typeof HEALTH_STATUS_COLORS] || 'text-muted-foreground'
const match = (q: string, xs: Array<string | undefined | null>) => !q.trim() || xs.some(x => includesQuery(x || '', q.trim().toLowerCase()))
const skillId = (s: SkillInfo) => s.id || s.name
const skillName = (s: SkillInfo) => s.displayName || s.name
const skillDesc = (s: SkillInfo) => s.displayDescription || asText(s.description) || S.noDesc
const skillCat = (s: SkillInfo) => asText(s.category) || 'general'
const skillCatLabel = (s: SkillInfo) => s.displayCategory || asText(s.category) || 'general'
const isBuiltinPlugin = (p: KarnaPlugin) => p.is_builtin || BUILTIN.has(p.id)

interface SkillsViewProps extends React.ComponentProps<'section'> { setStatusbarItemGroup?: SetStatusbarItemGroup }

export function SkillsView({ setStatusbarItemGroup: _setStatusbarItemGroup, ...props }: SkillsViewProps) {
  const [mode, setMode] = useRouteEnumParam('tab', MODES, 'skills')
  const [query, setQuery] = useState('')
  const [skills, setSkills] = useState<SkillInfo[] | null>(null)
  const [diag, setDiag] = useState<SkillCatalogDiagnostics | null>(null)
  const [toolsets, setToolsets] = useState<ToolsetInfo[] | null>(null)
  const [plugins, setPlugins] = useState<KarnaPlugin[]>([])
  const [pluginSkills, setPluginSkills] = useState<KarnaSkill[]>([])
  const [packs, setPacks] = useState<KarnaSkillPack[]>([])
  const [category, setCategory] = useState<string | null>(null)
  const [onlyEnabled, setOnlyEnabled] = useState(false)
  const [onlyOfficial, setOnlyOfficial] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [expandedToolset, setExpandedToolset] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [detail, setDetail] = useState<KarnaPlugin | null>(null)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const [catalog, nextToolsets, pluginRows, packRows, skillRows] = await Promise.all([getSkillsCatalog(), getToolsets(), listKarnaPlugins(), listSkillPacks(), listKarnaSkills()])
      setSkills(catalog.skills || []); setDiag(catalog.diagnostics || null); setToolsets(nextToolsets || [])
      setPlugins(pluginRows.plugins || []); setPacks(packRows.skill_packs || []); setPluginSkills(skillRows.skills || [])
    } catch (err) { notifyError(err, '\u52a0\u8f7d\u5de5\u574a\u5931\u8d25') } finally { setRefreshing(false) }
  }, [])
  useRefreshHotkey(refresh)
  useEffect(() => { void refresh() }, [refresh])

  const cats = useMemo(() => {
    const m = new Map<string, { label: string; count: number }>()
    for (const s of skills || []) { const k = skillCat(s); const e = m.get(k); e ? e.count++ : m.set(k, { label: skillCatLabel(s), count: 1 }) }
    return Array.from(m.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([key, v]) => ({ key, ...v }))
  }, [skills])
  const visibleSkills = useMemo(() => (skills || []).filter(s => (!onlyEnabled || s.enabled) && (!onlyOfficial || s.isKarnaOfficial) && (!category || skillCat(s) === category) && match(query, [s.name, s.displayName, s.description, s.displayDescription, s.category, s.displayCategory])), [skills, onlyEnabled, onlyOfficial, category, query])
  const groupedSkills = useMemo(() => { const m = new Map<string, SkillInfo[]>(); for (const s of visibleSkills) { const k = skillCatLabel(s); m.set(k, [...(m.get(k) || []), s]) } return Array.from(m.entries()) }, [visibleSkills])
  const visibleToolsets = useMemo(() => (toolsets || []).filter(t => isDesktopToolsetVisible(t.name)).filter(t => match(query, [t.name, t.label, t.description, toolsetDisplayLabel(t), ...toolNames(t)])).sort((a,b) => toolsetDisplayLabel(a).localeCompare(toolsetDisplayLabel(b))), [toolsets, query])
  const builtinPlugins = useMemo(() => plugins.filter(isBuiltinPlugin), [plugins])
  const installedPlugins = useMemo(() => plugins.filter(p => !isBuiltinPlugin(p)), [plugins])
  const visiblePlugins = (mode === 'installed' ? installedPlugins : builtinPlugins).filter(p => match(query, [p.id, p.name, p.description, p.category, p.publisher_name]))
  const visiblePluginSkills = pluginSkills.filter(s => match(query, [s.id, s.name, s.description, s.category, s.source_pack, s.source_plugin, ...s.tags, ...s.domains]))
  const visiblePacks = packs.filter(p => match(query, [p.id, p.name, p.description, p.category, p.source_url]))

  async function run(id: string, fn: () => Promise<unknown>, title = S.ok) { setSaving(id); try { await fn(); notify({ kind: 'success', title, message: S.applies }); await refresh() } catch (err) { notifyError(err, S.fail) } finally { setSaving(null) } }
  async function addPlugin() {
    const source = window.prompt(S.sourcePrompt)
    if (!source?.trim()) return
    await run('install-plugin', async () => {
      const job = await preflightPlugin(source.trim())
      let current: InstallJob = job
      for (let i = 0; i < 180 && !['awaiting_confirmation','completed','failed'].includes(current.state); i++) { await new Promise(r => setTimeout(r, 500)); current = await getPluginJob(job.job_id) }
      if (current.state === 'failed') throw new Error(current.error || S.fail)
      if (current.state === 'awaiting_confirmation') await confirmPluginInstall(current.job_id, current.preflight?.permissions || [])
    }, S.ok)
  }

  return <>
    <PageSearchShell {...props} className="flex h-full min-h-0 flex-col overflow-hidden" filters={mode === 'skills' && cats.length ? <><TextTab active={!category} onClick={() => setCategory(null)}>{S.all} <TextTabMeta>{skills?.length || 0}</TextTabMeta></TextTab>{cats.map(c => <TextTab active={category === c.key} key={c.key} onClick={() => setCategory(category === c.key ? null : c.key)}>{c.label} <TextTabMeta>{c.count}</TextTabMeta></TextTab>)}</> : undefined} onSearchChange={setQuery} searchPlaceholder={S.search} searchTrailingAction={<div className="flex items-center gap-1">{mode === 'skills' ? <Button disabled={refreshing} onClick={() => setAddOpen(true)} size="sm" type="button" variant="secondary"><Codicon name="add" />{S.addSkill}</Button> : null}{['plugins','installed','packs'].includes(mode) ? <Button disabled={refreshing || saving === 'install-plugin'} onClick={() => void addPlugin()} size="sm" type="button" variant="secondary"><Codicon name="cloud-download" />{S.installPlugin}</Button> : null}{mode === 'skills' ? <IconButton active={onlyOfficial} icon="verified" label={onlyOfficial ? S.showAll : S.officialOnly} onClick={() => setOnlyOfficial(v => !v)} /> : null}{mode === 'skills' ? <IconButton active={onlyEnabled} icon="check" label={onlyEnabled ? S.showAll : S.enabledOnly} onClick={() => setOnlyEnabled(v => !v)} /> : null}<Button disabled={refreshing} onClick={() => void refresh()} size="icon-xs" title={S.refresh} type="button" variant="ghost"><Codicon name="refresh" spinning={refreshing} /></Button></div>} searchValue={query} tabs={<><TextTab active={mode === 'skills'} onClick={() => setMode('skills')}>{S.tabs.skills} <TextTabMeta>{skills?.length || 0}</TextTabMeta></TextTab><TextTab active={mode === 'toolsets'} onClick={() => setMode('toolsets')}>{S.tabs.toolsets} <TextTabMeta>{toolsets?.length || 0}</TextTabMeta></TextTab><TextTab active={mode === 'plugins'} onClick={() => setMode('plugins')}>{S.tabs.plugins} <TextTabMeta>{builtinPlugins.length}</TextTabMeta></TextTab><TextTab active={mode === 'installed'} onClick={() => setMode('installed')}>{S.tabs.installed} <TextTabMeta>{installedPlugins.length}</TextTabMeta></TextTab><TextTab active={mode === 'plugin-skills'} onClick={() => setMode('plugin-skills')}>{S.tabs.pluginSkills} <TextTabMeta>{pluginSkills.length}</TextTabMeta></TextTab><TextTab active={mode === 'packs'} onClick={() => setMode('packs')}>{S.tabs.packs} <TextTabMeta>{packs.length}</TextTabMeta></TextTab></>}>
      {!skills || !toolsets ? <PageLoader label={S.loading} /> : <div className={cn('h-full min-h-0 overflow-y-auto py-3', PAGE_INSET_X)}><div className="mb-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-muted-foreground">{S.merged}</div>{mode === 'skills' ? <SkillsPane diag={diag} groups={groupedSkills} onInstall={s => void run(skillId(s), () => installSkill(skillId(s)), S.ok)} onToggle={(s,e) => void run(skillId(s), () => toggleSkill(skillId(s), e), e ? '\u6280\u80fd\u5df2\u542f\u7528' : '\u6280\u80fd\u5df2\u7981\u7528')} onUninstall={s => void run(skillId(s), () => uninstallSkill(skillId(s)), S.ok)} saving={saving} skills={skills} /> : null}{mode === 'toolsets' ? <ToolsetsPane expanded={expandedToolset} onConfigure={() => getToolsets().then(setToolsets).catch(err => notifyError(err, S.fail))} onExpand={setExpandedToolset} onToggle={(t,e) => void run(t.name, () => toggleToolset(t.name, e), S.ok)} saving={saving} toolsets={visibleToolsets} total={toolsets.length} /> : null}{(mode === 'plugins' || mode === 'installed') ? <PluginsPane onRefresh={refresh} onSelect={setDetail} onToggle={(p,e) => void run(p.id, () => setPluginEnabled(p.id, e), e ? '\u63d2\u4ef6\u5df2\u542f\u7528' : '\u63d2\u4ef6\u5df2\u7981\u7528')} plugins={visiblePlugins} saving={saving} /> : null}{mode === 'plugin-skills' ? <PluginSkillsPane onToggle={(s,e) => void run(s.id, () => setSkillEnabled(s.id, e), S.ok)} saving={saving} skills={visiblePluginSkills} /> : null}{mode === 'packs' ? <PacksPane packs={visiblePacks} /> : null}</div>}
    </PageSearchShell>
    <AddSkillWizard onOpenChange={setAddOpen} onSkillsChanged={() => void refresh()} open={addOpen} />
    {detail ? <PluginDetail plugin={detail} onClose={() => setDetail(null)} /> : null}
  </>
}

function IconButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) { return <Button aria-label={label} className={cn('h-7 w-7', active && 'bg-[var(--ui-accent)] text-white hover:bg-[var(--ui-accent)]')} onClick={onClick} size="icon-xs" title={label} type="button" variant="ghost"><Codicon name={icon} /></Button> }
function Metric({ label, value }: { label: string; value: React.ReactNode }) { return <div className="rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-3"><div className="text-[11px] text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold">{value}</div></div> }
function Tags({ tags }: { tags: string[] }) { const rows = tags.filter(Boolean).slice(0, 6); return rows.length ? <div className="mt-2 flex flex-wrap gap-1">{rows.map(t => <span className="rounded bg-(--ui-bg-quinary) px-1 py-px text-[9px] font-mono text-(--ui-text-tertiary)" key={t}>{t}</span>)}</div> : null }
function Empty() { return <div className="grid min-h-52 place-items-center text-center"><div><div className="text-sm font-medium">{S.noData}</div><div className="mt-1 text-xs text-muted-foreground">{S.hint}</div></div></div> }

function SkillsPane({ diag, groups, onInstall, onToggle, onUninstall, saving, skills }: { diag: SkillCatalogDiagnostics | null; groups: Array<[string, SkillInfo[]]>; onInstall: (s: SkillInfo) => void; onToggle: (s: SkillInfo, e: boolean) => void; onUninstall: (s: SkillInfo) => void; saving: string | null; skills: SkillInfo[] }) {
  if (!groups.length) return <Empty />
  return <div className="space-y-5"><div className="grid grid-cols-2 gap-3 lg:grid-cols-6"><Metric label={S.total} value={skills.length} /><Metric label={S.enabled} value={skills.filter(s => s.enabled).length} /><Metric label={S.official} value={skills.filter(s => s.isKarnaOfficial).length} /><Metric label={S.sources} value={diag?.sourceCount ?? skills.length} /><Metric label={S.conflicts} value={diag?.conflictCount ?? 0} /><Metric label={S.unavailable} value={(diag?.unavailableCount ?? 0) + (diag?.uninstalledCount ?? 0)} /></div>{groups.map(([cat, rows]) => <div className="space-y-1" key={cat}><div className="text-xs font-semibold text-muted-foreground">{cat} ({rows.length})</div>{rows.map(s => <div className="grid gap-3 rounded-lg border border-transparent px-3 py-2.5 hover:border-[var(--dt-border)] hover:bg-[var(--theme-card-seed)]/50 sm:grid-cols-[1fr_auto]" key={skillId(s)}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-sm font-medium font-mono">{skillName(s)}</span>{s.isKarnaOfficial ? <Badge className="border-0 bg-sky-500/10 text-sky-500">Karna</Badge> : null}<Badge variant="outline">{s.source === 'builtin' ? S.builtin : s.source === 'community' ? S.community : S.local}</Badge>{s.installed === false ? <Badge className="border-0 bg-orange-500/10 text-orange-500">{S.notInstalled}</Badge> : null}</div><p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{skillDesc(s)}</p><Tags tags={[...(s.permissions || []), ...(s.dependencies || []), ...(s.platforms || [])]} /></div><div className="flex items-center gap-2">{s.installed === false ? <Button disabled={saving === skillId(s)} onClick={() => onInstall(s)} size="sm" variant="secondary">{S.install}</Button> : s.source === 'local' && !s.isKarnaOfficial ? <Button disabled={saving === skillId(s)} onClick={() => onUninstall(s)} size="sm" variant="ghost">{S.uninstall}</Button> : null}<Switch checked={s.enabled} disabled={saving === skillId(s) || s.installed === false || s.available === false} onCheckedChange={e => onToggle(s, e)} /></div></div>)}</div>)}</div>
}

function ToolsetsPane({ expanded, onConfigure, onExpand, onToggle, saving, toolsets, total }: { expanded: string | null; onConfigure: () => void; onExpand: (v: string | null) => void; onToggle: (t: ToolsetInfo, e: boolean) => void; saving: string | null; toolsets: ToolsetInfo[]; total: number }) {
  if (!toolsets.length) return <Empty />
  return <div className="space-y-2"><div className="text-xs text-muted-foreground">{toolsets.filter(t => t.enabled).length} / {total} {S.enabled}</div>{toolsets.map(t => { const label = toolsetDisplayLabel(t); const open = expanded === t.name; return <div className="py-2.5" key={t.name}><div className="flex justify-between gap-2"><button className="truncate text-left text-sm font-medium" onClick={() => onExpand(open ? null : t.name)} type="button">{label}</button><div className="flex items-center gap-2"><Badge>{t.configured ? '\u5df2\u914d\u7f6e' : '\u9700\u8981 Key'}</Badge><Switch checked={t.enabled} disabled={saving === t.name} onCheckedChange={e => onToggle(t, e)} /></div></div><p className="mt-1 text-xs text-muted-foreground">{asText(t.description) || S.noDesc}</p><Tags tags={toolNames(t)} />{open && t.name === 'computer_use' ? <ComputerUsePanel onConfiguredChange={onConfigure} /> : null}{open ? <ToolsetConfigPanel onConfiguredChange={onConfigure} toolset={t.name} /> : null}</div> })}</div>
}

function PluginsPane({ onRefresh, onSelect, onToggle, plugins, saving }: { onRefresh: () => void; onSelect: (p: KarnaPlugin) => void; onToggle: (p: KarnaPlugin, e: boolean) => void; plugins: KarnaPlugin[]; saving: string | null }) {
  if (!plugins.length) return <Empty />
  const act = async (id: string, fn: () => Promise<unknown>, title = S.ok) => { try { await fn(); notify({ kind: 'success', title, message: S.applies }); await onRefresh() } catch (e) { notifyError(e, S.fail) } }
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{plugins.map(p => <div className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-chat-bubble-background) p-4" key={p.id}><div className="flex justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className={cn('h-2 w-2 rounded-full', p.health_status === 'ready' ? 'bg-emerald-500' : p.health_status === 'error' ? 'bg-red-500' : 'bg-amber-500')} /><span className="truncate font-medium">{p.name}</span>{p.is_builtin ? <Badge>{S.builtin}</Badge> : null}</div><p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.description || S.noDesc}</p></div><Switch checked={p.status === 'active' || p.is_active} disabled={saving === p.id} onCheckedChange={e => onToggle(p, e)} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground"><div>{S.version}: {p.version}</div><div>{S.status}: <span className={healthColor(p.health_status)}>{healthLabel(p.health_status)}</span></div><div>{S.category}: {labelCat(p.category)}</div><div>{S.publisher}: {p.publisher_name || '-'}</div><div>Skill: {p.skills?.length || 0}</div><div>MCP: {p.mcp_servers?.length || 0}</div></div><Tags tags={(p.permissions || []).map(x => PERMISSION_LABELS[x] || x)} /><div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => onSelect(p)} size="sm" variant="secondary">{S.detail}</Button>{!p.is_builtin ? <><Button onClick={() => void act(p.id, () => checkPluginUpdate(p.id), S.checkUpdate)} size="sm" variant="ghost">{S.checkUpdate}</Button>{p.has_update ? <Button onClick={() => void act(p.id, () => updatePlugin(p.id), S.update)} size="sm" variant="ghost">{S.update}</Button> : null}{p.rollback_version ? <Button onClick={() => void act(p.id, () => rollbackPlugin(p.id), S.rollback)} size="sm" variant="ghost">{S.rollback}</Button> : null}<Button className="text-red-500" onClick={() => window.confirm(`${S.uninstall} ${p.name}?`) && void act(p.id, () => uninstallPlugin(p.id), S.uninstall)} size="sm" variant="ghost">{S.uninstall}</Button></> : null}</div></div>)}</div>
}

function PluginSkillsPane({ onToggle, saving, skills }: { onToggle: (s: KarnaSkill, e: boolean) => void; saving: string | null; skills: KarnaSkill[] }) { if (!skills.length) return <Empty />; return <div className="space-y-2">{skills.map(s => <div className="flex items-center justify-between gap-3 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-chat-bubble-background) p-3" key={s.id}><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate font-medium">{s.name}</span>{s.is_builtin ? <Badge>{S.builtin}</Badge> : null}<Badge variant="outline">{labelCat(s.category)}</Badge>{s.source_pack ? <Badge variant="outline">{s.source_pack}</Badge> : null}</div><p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{s.description || S.noDesc}</p><Tags tags={[...s.domains, ...s.tags]} /></div><Switch checked={s.is_enabled} disabled={saving === s.id} onCheckedChange={e => onToggle(s, e)} /></div>)}</div> }
function PacksPane({ packs }: { packs: KarnaSkillPack[] }) { if (!packs.length) return <Empty />; return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{packs.map(p => <div className="rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-chat-bubble-background) p-4" key={p.id}><div className="font-medium">{p.name}</div><p className="mt-1 text-sm text-muted-foreground">{p.description || labelCat(p.category)}</p><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground"><div>Skill: {p.skills_count}</div><div>{S.size}: {fmtSize(p.size_bytes)}</div><div>{S.version}: {p.version}</div><div>{S.category}: {labelCat(p.category)}</div></div><Tags tags={p.skills?.slice(0, 8).map(s => s.name || s.id) || []} /></div>)}</div> }
function PluginDetail({ onClose, plugin }: { onClose: () => void; plugin: KarnaPlugin }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-background shadow-xl"><div className="flex items-start justify-between gap-3 border-b p-6"><div><h2 className="text-xl font-semibold">{plugin.name}</h2><p className="mt-1 text-sm text-muted-foreground">{plugin.description}</p></div><Button onClick={onClose} size="sm" variant="ghost">\u5173\u95ed</Button></div><div className="space-y-4 p-6"><div className="grid grid-cols-2 gap-4 text-sm"><Info label="ID" value={plugin.id} /><Info label={S.version} value={plugin.version} /><Info className={healthColor(plugin.health_status)} label={S.status} value={healthLabel(plugin.health_status)} /><Info label={S.publisher} value={plugin.publisher_name} /><Info label={S.category} value={labelCat(plugin.category)} /><Info label="SHA-256" value={plugin.sha256 || '-'} /></div>{plugin.health_report?.checks?.length ? <div><div className="mb-2 text-sm font-medium">\u5065\u5eb7\u68c0\u67e5</div>{plugin.health_report.checks.map((c, i) => <div className="text-xs" key={i}>{c.status} ? {c.name} {c.message ? `- ${c.message}` : ''}</div>)}</div> : null}<Tags tags={[...(plugin.skills || []).map(s => s.name || s.id), ...(plugin.permissions || []).map(p => PERMISSION_LABELS[p] || p)]} /></div></div></div> }
function Info({ className, label, value }: { className?: string; label: string; value: React.ReactNode }) { return <div><div className="text-muted-foreground">{label}</div><div className={className}>{value || '-'}</div></div> }

