import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { WorkshopEmpty, WorkshopMetric, WorkshopPanel, WorkshopStatus } from '@/components/karna/workshop'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { notify, notifyError } from '@/store/notifications'

export interface ProjectSummary {
  id: string
  slug?: string
  title: string
  type?: string
  status?: string
  folder?: string
  updated_at?: string
  pinned?: boolean
  knowledge_ids?: string[]
}

export interface GuideStep { id: string; title: string; ok: boolean; status?: string; action?: string; detail?: string; endpoint?: string }
export interface WriterGuide { steps?: GuideStep[]; progress?: { done?: number; total?: number; score?: number }; next_action?: GuideStep | null }

export interface CommandCenterModule { id: string; title: string; status: 'green' | 'yellow' | 'red'; metric?: string; action?: string }
export interface WorkflowIssueNode { node_id: string; label?: string; status?: string; summary?: string; agent_name?: string; rag_context_id?: string | null; rag_citations?: number; draft_guard_id?: string | null; draft_guard_issues?: number; draft_guard_citations?: number; draft_guard_blocked?: boolean }
export interface WorkflowIssue { run_id: string; workflow_id: string; workflow_name?: string; status?: string; paused_at_node_id?: string | null; recommendation?: string; blocked_nodes?: WorkflowIssueNode[] }
export interface CommandCenterStatus { health_score: number; status: 'green' | 'yellow' | 'red'; counts?: { green?: number; yellow?: number; red?: number }; modules?: CommandCenterModule[]; next_action?: CommandCenterModule | null; queue?: { total?: number; by_kind?: Record<string, number> }; workflow_issue?: WorkflowIssue | null; updated_at?: string }

export interface ProjectOverview {
  bible: { characters: number; chapters: number; locations: number; world_rules: number; foreshadows: number; timeline: number; updated_at?: string | null }
  documents: { total: number; chars: number; updated_at?: string | null }
  rag: { chunks: number; mode?: string; updated_at?: string | null }
  graph: { nodes: number; edges: number; updated_at?: string | null }
  state: { characters: number; threads: number; updated_at?: string | null }
  wiki: { pages: number; pending: number; updated_at?: string | null }
  workflow: { total: number; runs: number; last_status?: string | null; updated_at?: string | null }
  artifacts: { total: number; updated_at?: string | null }
  benchmark: { score: number; readiness_score?: number; maturity_score?: number; updated_at?: string | null }
  safety: { high: number; medium: number; updated_at?: string | null }
  schema_ready: boolean
}

const TYPE_LABEL: Record<string, string> = {
  'web-novel': '网文',
  novel: '长篇',
  paper: '论文',
  screenplay: '剧本',
  poetry: '诗歌',
  copywriting: '文案',
  editorial: '编辑',
  essay: '随笔'
}

function typeLabel(type?: string): string {
  if (!type) {return '未分类'}

  return TYPE_LABEL[type] || type
}

function relativeTime(iso?: string | null): string {
  if (!iso) {return '从未更新'}
  const then = new Date(iso).getTime()

  if (Number.isNaN(then)) {return '从未更新'}
  const delta = Date.now() - then
  const min = Math.floor(delta / 60_000)

  if (min < 1) {return '刚刚'}

  if (min < 60) {return `${min} 分钟前`}
  const h = Math.floor(min / 60)

  if (h < 24) {return `${h} 小时前`}
  const d = Math.floor(h / 24)

  if (d < 30) {return `${d} 天前`}
  const mo = Math.floor(d / 30)

  return `${mo} 个月前`
}

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  return window.karnaDesktop.api<T>({ path, method, body })
}

interface PickerProps {
  activeId: string
  onSelect: (project: ProjectSummary) => void
  onProjectsChanged: (rows: ProjectSummary[]) => void
  projects: ProjectSummary[]
}

export function ProjectPicker({ activeId, onProjectsChanged, onSelect, projects }: PickerProps) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('novel')
  const [busy, setBusy] = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  const visible = projects.filter(p => showArchived ? true : p.status !== 'archived')
  const active = visible.find(p => p.id === activeId) || projects.find(p => p.id === activeId) || null

  const refresh = async () => {
    try {
      const result = await api<{ projects?: ProjectSummary[]; active_project_id?: string }>('/api/writer/projects?includeArchived=1')
      onProjectsChanged(result.projects || [])

      if (result.active_project_id && result.active_project_id !== activeId) {
        const next = (result.projects || []).find(p => p.id === result.active_project_id) || null

        if (next) {onSelect(next)}
      }
    } catch (err) { notifyError(err, '加载项目失败') }
  }

  useEffect(() => { void refresh() }, [])

  const create = async () => {
    if (!title.trim()) {return}
    setBusy(true)

    try {
      const result = await api<{ ok: boolean; project?: ProjectSummary; error?: string }>('/api/writer/projects', 'POST', { title: title.trim(), type, multiAgentEnabled: false })

      if (!result.ok || !result.project) {throw new Error(result.error || '创建失败')}
      setTitle('')
      notify({ kind: 'success', title: '项目已创建', message: result.project.title })
      await refresh()
      onSelect(result.project)
    } catch (err) { notifyError(err, '创建项目失败') } finally { setBusy(false) }
  }

  const setStatus = async (project: ProjectSummary, status: 'active' | 'archived') => {
    if (project.status === status) {return}
    setBusy(true)

    try {
      await api(`/api/writer/projects/${encodeURIComponent(project.id)}`, 'PATCH', { status })
      await refresh()
    } catch (err) { notifyError(err, '更新项目状态失败') } finally { setBusy(false) }
  }

  const togglePin = async (project: ProjectSummary) => {
    setBusy(true)

    try {
      await api(`/api/writer/projects/${encodeURIComponent(project.id)}`, 'PATCH', { pinned: !project.pinned })
      await refresh()
    } catch (err) { notifyError(err, '置顶失败') } finally { setBusy(false) }
  }

  const remove = async (project: ProjectSummary) => {
    if (!window.confirm(`确定删除项目「${project.title}」吗？这会清空该项目目录。`)) {return}
    setBusy(true)

    try {
      await api(`/api/writer/projects/${encodeURIComponent(project.id)}`, 'DELETE')
      await refresh()
    } catch (err) { notifyError(err, '删除项目失败') } finally { setBusy(false) }
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-4 px-6 py-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
      <WorkshopPanel
        description="选一个项目作为当前上下文；新建项目会自动初始化 Writer OS 全部目录。"
        meta={
          <div className="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
            <WorkshopStatus tone={active ? 'success' : 'neutral'}>
              {active ? `已选：${active.title}` : '未选项目'}
            </WorkshopStatus>
          </div>
        }
        title="项目"
      >
        <div className="grid gap-2">
          <input
            className="w-full rounded-[2px] border border-(--ui-stroke-tertiary) bg-background px-2.5 py-1.5 text-sm outline-none focus:border-(--ui-accent)"
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') {void create()} }}
            placeholder="新作品标题"
            value={title}
          />
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select
              className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background px-2 py-1.5 text-sm outline-none focus:border-(--ui-accent)"
              onChange={e => setType(e.target.value)}
              value={type}
            >
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <Button disabled={!title.trim() || busy} onClick={() => void create()} size="sm">
              <Codicon name="add" /> 新建
            </Button>
          </div>
          <label className="flex items-center gap-1.5 text-[0.65rem] text-muted-foreground">
            <input
              checked={showArchived}
              className="size-3"
              onChange={e => setShowArchived(e.target.checked)}
              type="checkbox"
            />
            显示已归档
          </label>
        </div>

        <div className="mt-3 grid max-h-[60vh] gap-1.5 overflow-auto pr-1">
          {visible.length === 0 ? (
            <WorkshopEmpty>
              还没有项目。先在上方填一个标题、选个类型，再点「新建」。
            </WorkshopEmpty>
          ) : null}
          {visible
            .slice()
            .sort((a, b) => Number(b.pinned === true) - Number(a.pinned === true) || (b.updated_at || '').localeCompare(a.updated_at || ''))
            .map(p => {
              const isActive = p.id === activeId

              return (
                <button
                  className={`group relative w-full overflow-hidden rounded-[3px] border px-2.5 py-2 text-left transition-colors ${
                    isActive
                      ? 'border-(--ui-accent) bg-(--ui-accent)/8 shadow-sm'
                      : 'border-(--ui-stroke-tertiary) bg-background/85 hover:border-(--ui-stroke-secondary)'
                  }`}
                  data-active={isActive}
                  key={p.id}
                  onClick={() => onSelect(p)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 truncate text-sm font-semibold">
                        {p.pinned ? <Codicon className="text-amber-500" name="pinned" /> : null}
                        <span className="truncate">{p.title}</span>
                      </div>
                      <div className="truncate text-[0.65rem] text-muted-foreground">
                        {typeLabel(p.type)} · {p.knowledge_ids?.length || 0} 知识库 · {relativeTime(p.updated_at)}
                      </div>
                    </div>
                    <WorkshopStatus tone={p.status === 'archived' ? 'neutral' : 'success'}>
                      {p.status === 'archived' ? '归档' : '活跃'}
                    </WorkshopStatus>
                  </div>
                  <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <span
                      className="rounded px-1 py-0.5 text-[0.6rem] text-muted-foreground hover:bg-muted"
                      onClick={e => { e.stopPropagation(); void togglePin(p) }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); void togglePin(p) } }}
                      role="button"
                      tabIndex={0}
                    >
                      {p.pinned ? '取消置顶' : '置顶'}
                    </span>
                    <span
                      className="rounded px-1 py-0.5 text-[0.6rem] text-muted-foreground hover:bg-muted"
                      onClick={e => { e.stopPropagation(); void setStatus(p, p.status === 'archived' ? 'active' : 'archived') }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); void setStatus(p, p.status === 'archived' ? 'active' : 'archived') } }}
                      role="button"
                      tabIndex={0}
                    >
                      {p.status === 'archived' ? '恢复' : '归档'}
                    </span>
                    <span
                      className="rounded px-1 py-0.5 text-[0.6rem] text-rose-600 hover:bg-rose-500/10"
                      onClick={e => { e.stopPropagation(); void remove(p) }}
                      onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); void remove(p) } }}
                      role="button"
                      tabIndex={0}
                    >
                      删除
                    </span>
                  </div>
                </button>
              )
            })}
        </div>
      </WorkshopPanel>

      <div className="min-h-0">
        {active ? (
          <ProjectOverviewCard onRefresh={refresh} project={active} />
        ) : (
          <WorkshopEmpty
            action={
              <Button disabled={!title.trim() || busy} onClick={() => void create()} size="sm">
                <Codicon name="add" /> 新建第一个项目
              </Button>
            }
          >
            选一个左侧项目，或新建一个。所有 Workshop 的写回都会落到这里。
          </WorkshopEmpty>
        )}
      </div>
    </div>
  )
}

function ProjectOverviewCard({ project, onRefresh }: { project: ProjectSummary; onRefresh: () => Promise<void> | void }) {
  const ref = project.slug || project.id
  const [overview, setOverview] = useState<ProjectOverview | null>(null)
  const [busy, setBusy] = useState(false)
  const [benchmarkScore, setBenchmarkScore] = useState<number | null>(null)
  const [guide, setGuide] = useState<WriterGuide | null>(null)
  const [commandCenter, setCommandCenter] = useState<CommandCenterStatus | null>(null)

  const load = async () => {
    setBusy(true)

    try {
      const [schema, docs, rag, graph, state, wiki, workflow, artifacts, bench, safety, bible, story, guideResult, commandResult] = await Promise.all([
        api<{ ready?: boolean; checked_at?: string }>(`/api/writer/projects/${encodeURIComponent(ref)}/schema`).catch(() => null),
        api<{ documents?: Array<{ chars?: number }>; nodes?: unknown[]; updated_at?: string | null }>(`/api/writer/projects/${encodeURIComponent(ref)}/documents`).catch(() => null),
        api<{ chunks?: Array<unknown>; stats?: { chunks?: number; mode?: string }; updated_at?: string | null }>(`/api/writer/projects/${encodeURIComponent(ref)}/rag`).catch(() => null),
        api<{ graph?: { nodes?: unknown[]; edges?: unknown[]; updated_at?: string | null } }>(`/api/writer/projects/${encodeURIComponent(ref)}/knowledge-graph`).catch(() => null),
        api<{ state?: { characters?: unknown[]; threads?: unknown[]; updated_at?: string | null } }>(`/api/writer/projects/${encodeURIComponent(ref)}/narrative-state`).catch(() => null),
        api<{ wiki?: { pages?: unknown[]; pending_updates?: unknown[]; updated_at?: string | null } }>(`/api/writer/projects/${encodeURIComponent(ref)}/living-wiki`).catch(() => null),
        api<{ workflows?: unknown[]; runs?: Array<{ status?: string }> }>(`/api/writer/workflows?project=${encodeURIComponent(ref)}`).catch(() => null),
        api<{ artifacts?: unknown[]; updated_at?: string | null }>(`/api/writer/projects/${encodeURIComponent(ref)}/artifacts`).catch(() => null),
        api<{ runs?: Array<{ score?: number; readiness_score?: number; maturity_score?: number; updated_at?: string | null }> }>(`/api/writer/projects/${encodeURIComponent(ref)}/benchmarks`).catch(() => null),
        api<{ reports?: Array<{ summary?: { high?: number; medium?: number } }>; updated_at?: string | null }>(`/api/writer/projects/${encodeURIComponent(ref)}/safety`).catch(() => null),
        api<{ bible?: { characters?: unknown[]; chapters?: unknown[]; world?: unknown[]; locations?: unknown[]; foreshadows?: unknown[]; timeline?: unknown[]; updated_at?: string | null } }>(`/api/writer/projects/${encodeURIComponent(ref)}/bible`).catch(() => null),
        api<{ story_bible?: { characters?: unknown[]; world_rules?: unknown[]; updated_at?: string | null } }>(`/api/writer/projects/${encodeURIComponent(ref)}/story-bible`).catch(() => null),
        api<WriterGuide>(`/api/writer/projects/${encodeURIComponent(ref)}/guide`).catch(() => null),
        api<CommandCenterStatus>(`/api/writer/projects/${encodeURIComponent(ref)}/command-center`).catch(() => null)
      ])

      const overview: ProjectOverview = {
        bible: {
          characters: (story?.story_bible?.characters as unknown[] | undefined)?.length ?? ((bible?.bible?.characters as unknown[] | undefined)?.length ?? 0),
          chapters: ((bible?.bible?.chapters as unknown[] | undefined)?.length ?? 0),
          locations: ((bible?.bible?.locations as unknown[] | undefined)?.length ?? 0),
          world_rules: (story?.story_bible?.world_rules as unknown[] | undefined)?.length ?? ((bible?.bible?.world as unknown[] | undefined)?.length ?? 0),
          foreshadows: ((bible?.bible?.foreshadows as unknown[] | undefined)?.length ?? 0),
          timeline: ((bible?.bible?.timeline as unknown[] | undefined)?.length ?? 0),
          updated_at: story?.story_bible?.updated_at ?? bible?.bible?.updated_at
        },
        documents: {
          total: (docs?.documents?.length ?? 0),
          chars: (docs?.documents || []).reduce((sum, d) => sum + (d.chars || 0), 0),
          updated_at: docs?.updated_at
        },
        rag: {
          chunks: rag?.stats?.chunks ?? rag?.chunks?.length ?? 0,
          mode: rag?.stats?.mode,
          updated_at: rag?.updated_at
        },
        graph: {
          nodes: (graph?.graph?.nodes as unknown[] | undefined)?.length ?? 0,
          edges: (graph?.graph?.edges as unknown[] | undefined)?.length ?? 0,
          updated_at: graph?.graph?.updated_at
        },
        state: {
          characters: (state?.state?.characters as unknown[] | undefined)?.length ?? 0,
          threads: (state?.state?.threads as unknown[] | undefined)?.length ?? 0,
          updated_at: state?.state?.updated_at
        },
        wiki: {
          pages: (wiki?.wiki?.pages as unknown[] | undefined)?.length ?? 0,
          pending: (wiki?.wiki?.pending_updates as unknown[] | undefined)?.length ?? 0,
          updated_at: wiki?.wiki?.updated_at
        },
        workflow: {
          total: (workflow?.workflows as unknown[] | undefined)?.length ?? 0,
          runs: (workflow?.runs as unknown[] | undefined)?.length ?? 0,
          last_status: workflow?.runs?.[0]?.status,
          updated_at: undefined
        },
        artifacts: { total: (artifacts?.artifacts as unknown[] | undefined)?.length ?? 0, updated_at: artifacts?.updated_at },
        benchmark: { score: bench?.runs?.[0]?.readiness_score ?? bench?.runs?.[0]?.score ?? 0, readiness_score: bench?.runs?.[0]?.readiness_score, maturity_score: bench?.runs?.[0]?.maturity_score, updated_at: bench?.runs?.[0]?.updated_at },
        safety: { high: safety?.reports?.[0]?.summary?.high ?? 0, medium: safety?.reports?.[0]?.summary?.medium ?? 0, updated_at: safety?.updated_at },
        schema_ready: schema?.ready === true
      }

      setOverview(overview)
      setBenchmarkScore(overview.benchmark.score)
      setGuide(guideResult || null)
      setCommandCenter(commandResult || null)
    } catch (err) {
      notifyError(err, '加载项目概览失败')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    setOverview(null)
    setBenchmarkScore(null)
    setGuide(null)
    setCommandCenter(null)
    void load()
  }, [ref])

  const runBenchmark = async () => {
    setBusy(true)

    try {
      const result = await api<{ run?: { score?: number; readiness_score?: number; maturity_score?: number }; runs?: Array<{ score?: number; readiness_score?: number; maturity_score?: number }> }>(`/api/writer/projects/${encodeURIComponent(ref)}/benchmarks`, 'POST', {})
      const score = result.run?.score ?? result.runs?.[0]?.score ?? 0
      setBenchmarkScore(score)
      notify({ kind: 'success', title: 'Benchmark 已跑', message: `score ${Number(score).toFixed(2)}` })
      await load()
      await onRefresh()
    } catch (err) { notifyError(err, '运行 benchmark 失败') } finally { setBusy(false) }
  }

  const repairSchema = async () => {
    setBusy(true)

    try {
      await api(`/api/writer/projects/${encodeURIComponent(ref)}/schema`, 'POST', {})
      notify({ kind: 'success', title: '项目结构已补齐', message: '项目结构已补齐' })
      await load()
    } catch (err) { notifyError(err, '补齐项目结构失败') } finally { setBusy(false) }
  }


  const runCommandCenterAction = async (moduleId?: string) => {
    setBusy(true)

    try {
      const result = await api<{ ok?: boolean; after?: CommandCenterStatus; results?: Array<{ ok?: boolean; step?: string }> }>(`/api/writer/projects/${encodeURIComponent(ref)}/command-center`, 'POST', { action: moduleId ? 'run-module' : 'repair-next', module: moduleId, provider: 'local', all: true })

      if (result.after) {setCommandCenter(result.after)}
      const ok = result.results?.filter(r => r.ok).length || 0
      notify({ kind: result.ok === false ? 'warning' : 'success', title: moduleId ? '模块修复已执行' : '下一项修复已执行', message: `${ok}/${result.results?.length || 0} actions` })
      await load()
      await onRefresh()
    } catch (err) { notifyError(err, '指令中心操作失败') } finally { setBusy(false) }
  }


  const runWorkflowIssueAction = async (nodeAction: 'retry' | 'skip' | 'accept') => {
    const node = commandCenter?.workflow_issue?.blocked_nodes?.[0]

    if (!node) {return}
    setBusy(true)

    try {
      const result = await api<{ ok?: boolean; action?: string; after?: CommandCenterStatus; node_id?: string }>(`/api/writer/projects/${encodeURIComponent(ref)}/command-center`, 'POST', { action: 'repair', nodeAction, nodeId: node.node_id, provider: 'local' })

      if (result.after) {setCommandCenter(result.after)}
      notify({ kind: result.ok === false ? 'warning' : 'success', title: `Workflow ${nodeAction}`, message: result.node_id || node.node_id })
      await load()
      await onRefresh()
    } catch (err) { notifyError(err, `Workflow ${nodeAction} failed`) } finally { setBusy(false) }
  }


  const runGuideNext = async () => {
    setBusy(true)

    try {
      const result = await api<WriterGuide>(`/api/writer/projects/${encodeURIComponent(ref)}/guide`, 'POST', { action: 'next', provider: 'local' })
      setGuide(result)
      notify({ kind: 'success', title: '指南下一步已执行', message: result.next_action?.title || '已更新' })
      await load()
      await onRefresh()
    } catch (err) { notifyError(err, '指南下一步执行失败') } finally { setBusy(false) }
  }

  const repairGuide = async () => {
    setBusy(true)

    try {
      const result = await api<WriterGuide & { benchmark?: { score?: number }; results?: Array<{ ok?: boolean }> }>(`/api/writer/projects/${encodeURIComponent(ref)}/guide`, 'POST', { action: 'repair', provider: 'local' })
      setGuide(result)
      const ok = result.results?.filter(r => r.ok).length || 0
      notify({ kind: 'success', title: 'Writer OS 指南已推进', message: `${ok}/${result.results?.length || 0} actions - score ${Number(result.benchmark?.score || 0).toFixed(2)}` })
      await load()
      await onRefresh()
    } catch (err) { notifyError(err, 'Writer OS 指南修复失败') } finally { setBusy(false) }
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-4">
      <WorkshopPanel
        meta={
          <div className="flex items-center gap-2">
            <WorkshopStatus tone={overview?.schema_ready ? 'success' : 'warning'}>
              {overview?.schema_ready ? '结构就绪' : '结构待补'}
            </WorkshopStatus>
            {typeof benchmarkScore === 'number' ? (
              <WorkshopStatus tone={benchmarkScore >= 0.85 ? 'success' : benchmarkScore >= 0.55 ? 'info' : 'warning'}>
                Benchmark {benchmarkScore.toFixed(2)}
              </WorkshopStatus>
            ) : null}
            <Button disabled={busy} onClick={() => void load()} size="xs" variant="outline">
              <Codicon name="refresh" /> 刷新
            </Button>
          </div>
        }
        title={
          <span className="flex items-center gap-2">
            <Codicon name="notebook" /> {project.title} · 总览
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.7rem] text-muted-foreground">
          <span><strong className="text-foreground/80">{typeLabel(project.type)}</strong></span>
          <span>·</span>
          <span className="font-mono">{project.folder || project.slug}</span>
          <span>·</span>
          <span>最近 {relativeTime(project.updated_at)}</span>
          {project.knowledge_ids?.length ? (<><span>·</span><span>{project.knowledge_ids.length} 个知识库</span></>) : null}
        </div>
      </WorkshopPanel>

      <div className="grid min-h-0 gap-3 overflow-auto pr-1">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <WorkshopMetric accent="emerald" hint={`${overview?.bible.chapters ?? 0} 章 · ${overview?.bible.foreshadows ?? 0} 伏笔`} label="Bible" value={overview?.bible.characters ?? 0} />
          <WorkshopMetric accent="sky" hint={`${overview?.documents.total ?? 0} 份`} label="文档" value={overview ? formatChars(overview.documents.chars) : '—'} />
          <WorkshopMetric accent="violet" hint={overview?.rag.mode || '尚未建索引'} label="RAG" value={overview?.rag.chunks ?? 0} />
          <WorkshopMetric accent="amber" hint={`${overview?.graph.nodes ?? 0} 节点 / ${overview?.graph.edges ?? 0} 边`} label="图谱" value={(overview?.graph.nodes ?? 0) + (overview?.graph.edges ?? 0)} />
          <WorkshopMetric accent="rose" hint={overview?.workflow.last_status ? `最近：${overview.workflow.last_status}` : '尚无运行'} label="工作流" value={overview?.workflow.total ?? 0} />
        </div>

        <WorkshopPanel
          description="One screen for RAG, Guard, Canon Queue, Graph, State, Workflow, Safety and Benchmark health."
          meta={commandCenter ? <WorkshopStatus tone={commandCenter.status === 'green' ? 'success' : commandCenter.status === 'yellow' ? 'warning' : 'danger'}>health {commandCenter.health_score.toFixed(2)}</WorkshopStatus> : null}
          title="Writer OS Status Console"
        >
          <div className="grid gap-2 lg:grid-cols-[14rem_1fr]">
            <div className="grid gap-2 rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 p-3 text-xs">
              <div className="text-[0.65rem] uppercase tracking-wider text-muted-foreground">下一步操作</div>
              <div className="font-medium">{commandCenter?.next_action?.title || '当前无待修复项'}</div>
              <div className="text-[0.7rem] text-muted-foreground">{commandCenter?.next_action?.action || 'Keep writing and rerun benchmark after major changes.'}</div>
              <div className="font-mono text-[0.65rem] text-muted-foreground">green {commandCenter?.counts?.green || 0} ? yellow {commandCenter?.counts?.yellow || 0} ? red {commandCenter?.counts?.red || 0}</div>
              <Button disabled={busy || !commandCenter?.next_action} onClick={() => void runCommandCenterAction()} size="xs" variant="outline"><Codicon name="wrench" /> 执行下一项修复</Button>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {(commandCenter?.modules || []).map(m => (
                <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 px-2 py-1.5 text-xs" key={m.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{m.title}</span>
                    <WorkshopStatus tone={m.status === 'green' ? 'success' : m.status === 'yellow' ? 'warning' : 'danger'}>{m.status}</WorkshopStatus>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[0.6rem] text-muted-foreground">{m.metric}</div>
                  <div className="mt-0.5 truncate text-[0.6rem] text-muted-foreground/80">{m.action}</div>
                  {m.status !== 'green' ? <Button className="mt-1" disabled={busy} onClick={() => void runCommandCenterAction(m.id)} size="xs" variant="outline">Fix</Button> : null}
                </div>
              ))}
              {!commandCenter ? <WorkshopEmpty>正在加载状态控制台…</WorkshopEmpty> : null}
            </div>
          </div>
        </WorkshopPanel>

        {commandCenter?.workflow_issue ? (
          <WorkshopPanel
            actions={
              <div className="flex items-center gap-2">
                <Button disabled={busy} onClick={() => void runWorkflowIssueAction('retry')} size="xs" variant="outline"><Codicon name="refresh" /> 重试节点</Button>
                <Button disabled={busy} onClick={() => void runWorkflowIssueAction('skip')} size="xs" variant="outline">Skip</Button>
                <Button disabled={busy} onClick={() => void runWorkflowIssueAction('accept')} size="xs" variant="outline">接受</Button>
              </div>
            }
            description={commandCenter.workflow_issue.recommendation || 'Inspect the blocked workflow node and choose retry, skip, or accept.'}
            meta={<WorkshopStatus tone="warning">{commandCenter.workflow_issue.status || 'blocked'}</WorkshopStatus>}
            title="Blocked Workflow Review"
          >
            <div className="grid gap-2 text-xs">
              <div className="font-mono text-[0.65rem] text-muted-foreground">
                {commandCenter.workflow_issue.workflow_name || commandCenter.workflow_issue.workflow_id} - {commandCenter.workflow_issue.run_id}
              </div>
              {(commandCenter.workflow_issue.blocked_nodes || []).slice(0, 3).map(node => (
                <div className="rounded-[2px] border border-amber-500/30 bg-amber-500/5 px-2 py-1.5" key={node.node_id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{node.label || node.node_id}</span>
                    <WorkshopStatus tone={node.draft_guard_blocked ? 'danger' : 'warning'}>
                      {node.draft_guard_blocked ? 'guard blocked' : 'blocked'}
                    </WorkshopStatus>
                  </div>
                  {node.summary ? <p className="mt-1 line-clamp-3 text-[0.7rem] text-muted-foreground">{node.summary}</p> : null}
                  <div className="mt-1 font-mono text-[0.6rem] text-muted-foreground">
                    RAG {node.rag_context_id || '-'} / {node.rag_citations || 0} 条引用 - 草稿守卫 {node.draft_guard_id || '-'} / {node.draft_guard_issues || 0} 个问题
                  </div>
                </div>
              ))}
            </div>
          </WorkshopPanel>
        ) : null}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <WorkshopPanel
            description="World Rules · Story Bible · Foreshadows · Timeline"
            meta={<span className="text-[0.65rem] text-muted-foreground">{overview?.bible.updated_at ? `更新于 ${relativeTime(overview.bible.updated_at)}` : '未生成'}</span>}
            title="写作资产"
          >
            <div className="grid grid-cols-2 gap-2 text-xs">
              <AssetRow label="人物" value={overview?.bible.characters ?? 0} />
              <AssetRow label="地点" value={overview?.bible.locations ?? 0} />
              <AssetRow label="设定 / 规则" value={overview?.bible.world_rules ?? 0} />
              <AssetRow label="伏笔" value={overview?.bible.foreshadows ?? 0} />
              <AssetRow label="时间线事件" value={overview?.bible.timeline ?? 0} />
              <AssetRow label="章节摘要" value={overview?.bible.chapters ?? 0} />
            </div>
          </WorkshopPanel>

          <WorkshopPanel
            actions={
              <Button disabled={busy || !overview?.schema_ready} onClick={() => void runBenchmark()} size="xs" variant="outline">
                <Codicon name="rocket" /> 跑 Benchmark
              </Button>
            }
            description="Schema · RAG · Graph · State · Wiki · Safety"
            title="引擎就绪"
          >
            <div className="grid gap-1.5 text-xs">
              <EngineRow label="Schema" ok={overview?.schema_ready} />
              <EngineRow label={`RAG（${overview?.rag.chunks ?? 0} 片段）`} ok={(overview?.rag.chunks ?? 0) > 0} />
              <EngineRow label={`图谱（${overview?.graph.nodes ?? 0}/${overview?.graph.edges ?? 0}）`} ok={(overview?.graph.nodes ?? 0) > 0} />
              <EngineRow label={`叙事状态（${overview?.state.characters ?? 0} 人物）`} ok={(overview?.state.characters ?? 0) > 0} />
              <EngineRow label={`Living Wiki（${overview?.wiki.pages ?? 0} 页 / ${overview?.wiki.pending ?? 0} 待审）`} ok={(overview?.wiki.pages ?? 0) > 0 || (overview?.wiki.pending ?? 0) > 0} />
              <EngineRow label="Safety" ok={(overview?.safety.high ?? 0) === 0} />
            </div>
          </WorkshopPanel>
        </div>

        <WorkshopPanel
          actions={
            <div className="flex items-center gap-2">
              <Button disabled={busy || !overview?.schema_ready} onClick={() => void runGuideNext()} size="xs" variant="outline">
                <Codicon name="play" /> Next
              </Button>
              <Button disabled={busy || !overview?.schema_ready} onClick={() => void repairGuide()} size="xs" variant="outline">
                <Codicon name="wrench" /> Repair
              </Button>
              <Button disabled={busy || !overview?.schema_ready} onClick={() => void runBenchmark()} size="xs" variant="outline">
                <Codicon name="rocket" /> Benchmark
              </Button>
            </div>
          }
          description={guide?.progress ? `Guide ${guide.progress.done || 0}/${guide.progress.total || 0} - next: ${guide.next_action?.title || 'complete'}` : 'Project command center: run the next safe action or advance all automatable modules.'}
          title="Writer OS ??"
          variant={overview?.schema_ready ? 'success' : 'warning'}
        >
          <NextSteps guide={guide} onBenchmark={runBenchmark} onRepair={repairSchema} overview={overview} />
        </WorkshopPanel>
      </div>
    </div>
  )
}

function AssetRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-[2px] border border-(--ui-stroke-tertiary)/60 bg-background/70 px-2 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  )
}

function EngineRow({ label, ok }: { label: string; ok?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-[2px] border border-(--ui-stroke-tertiary)/60 bg-background/70 px-2 py-1.5">
      <span className="text-muted-foreground">{label}</span>
      <WorkshopStatus tone={ok ? 'success' : 'warning'}>{ok ? '就绪' : '待补'}</WorkshopStatus>
    </div>
  )
}

function NextSteps({ guide, overview, onBenchmark, onRepair }: { guide: WriterGuide | null; overview: ProjectOverview | null; onBenchmark: () => void | Promise<void>; onRepair: () => void | Promise<void> }) {
  if (!overview) {return <span className="text-xs text-muted-foreground">Loading...</span>}

  if (guide?.steps?.length) {
    const nextId = guide.next_action?.id

    return (
      <ol className="grid gap-1.5">
        {guide.steps.map((s, idx) => {
          const isNext = nextId === s.id

          return (
            <li className={`grid grid-cols-[1.4rem_1fr_auto] items-center gap-2 rounded-[2px] px-2 py-1.5 text-xs ${isNext ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/30' : 'hover:bg-muted/40'}`} key={s.id}>
              <span className="grid size-5 place-items-center rounded-full border border-(--ui-stroke-tertiary) bg-background text-[0.6rem] font-mono">{s.ok ? '?' : idx + 1}</span>
              <span className={s.ok ? 'text-muted-foreground line-through' : 'text-foreground/90'}>{s.title} ? {s.detail || s.action}</span>
              <WorkshopStatus tone={s.ok ? 'success' : isNext ? 'warning' : 'neutral'}>{s.ok ? 'done' : isNext ? 'next' : 'todo'}</WorkshopStatus>
            </li>
          )
        })}
      </ol>
    )
  }

  type Step = { action: ReactNode; done: boolean; key: string; label: string }

  const steps: Step[] = [
    {
      key: 'schema',
      done: overview.schema_ready,
      label: '补齐项目结构（创建 22 个 Writer OS 目录和 17 个 JSON 索引）',
      action: !overview.schema_ready ? <Button onClick={() => void onRepair()} size="xs"><Codicon name="wrench" /> 一键补齐</Button> : null
    },
    {
      key: 'docs',
      done: overview.documents.total > 0,
      label: '导入作品稿件 / 资料文件夹，让 Document Engine 索引',
      action: null
    },
    {
      key: 'bible',
      done: overview.bible.characters + overview.bible.foreshadows + overview.bible.timeline > 0,
      label: '运行 Story Bible 分析：抽取人物、伏笔、世界观、时间线',
      action: null
    },
    {
      key: 'rag',
      done: overview.rag.chunks > 0,
      label: '建立本地 RAG 索引；启用后 Agent 写作可带证据',
      action: null
    },
    {
      key: 'graph',
      done: overview.graph.nodes > 0,
      label: '构建知识图谱：人物 / 事件 / 伏笔之间的时态关系',
      action: null
    },
    {
      key: 'state',
      done: overview.state.characters > 0,
      label: '构建叙事状态：人物弧、关系变化、冲突生命周期',
      action: null
    },
    {
      key: 'wiki',
      done: overview.wiki.pages + overview.wiki.pending > 0,
      label: '生成 Living Wiki 候选页（character / location / world_rule / foreshadow / timeline）',
      action: null
    },
    {
      key: 'critic',
      done: false,
      label: '让 Critic Council 跑一次，查看多视角审稿报告',
      action: null
    },
    {
      key: 'safety',
      done: overview.safety.high === 0,
      label: '运行 Safety & Copyright 检查；高风险会让 Soul Workshop 自动走降风险模式',
      action: null
    },
    {
      key: 'workflow',
      done: overview.workflow.total > 0,
      label: '编排多 Agent 工作流（章节规划 / 伏笔回收 / 风格润色）',
      action: null
    },
    {
      key: 'benchmark',
      done: overview.benchmark.score >= 0.85,
      label: `运行 Benchmark 验收（当前 ${overview.benchmark.score.toFixed(2)}，目标 ≥ 0.85）`,
      action: overview.benchmark.score < 0.85 ? <Button onClick={() => void onBenchmark()} size="xs" variant="outline"><Codicon name="rocket" /> 跑一次</Button> : null
    }
  ]

  const next = steps.find(s => !s.done)

  return (
    <ol className="grid gap-1.5">
      {steps.map((s, idx) => {
        const isNext = next?.key === s.key

        return (
          <li
            className={`grid grid-cols-[1.4rem_1fr_auto] items-center gap-2 rounded-[2px] px-2 py-1.5 text-xs ${
              isNext ? 'bg-amber-500/10 ring-1 ring-inset ring-amber-500/30' : 'hover:bg-muted/40'
            }`}
            key={s.key}
          >
            <span className="grid size-5 place-items-center rounded-full border border-(--ui-stroke-tertiary) bg-background text-[0.6rem] font-mono">
              {s.done ? <Codicon aria-label="已完成" name="check" size={11} /> : idx + 1}
            </span>
            <span className={s.done ? 'text-muted-foreground line-through' : 'text-foreground/90'}>{s.label}</span>
            {s.action}
          </li>
        )
      })}
    </ol>
  )
}

function formatChars(n: number): string {
  if (n < 1000) {return `${n}`}

  if (n < 1_000_000) {return `${(n / 1000).toFixed(1)}k`}

  return `${(n / 1_000_000).toFixed(2)}M`
}
