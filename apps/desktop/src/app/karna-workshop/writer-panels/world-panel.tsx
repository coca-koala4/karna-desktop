import { useEffect, useState } from 'react'

import { WorkshopEmpty, WorkshopMetric, WorkshopPanel, WorkshopStatus } from '@/components/karna/workshop'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { notify, notifyError } from '@/store/notifications'

import { api, projectRef, type WriterProject } from '../workshop-state'

interface StoryBible {
  updated_at?: string | null
  chapters?: unknown[]
  characters?: unknown[]
  locations?: unknown[]
  world_rules?: unknown[]
  foreshadows?: unknown[]
  timeline?: unknown[]
}
interface StoryBibleResponse { ok: boolean; story_bible?: StoryBible }
interface KnowledgeGraphNode { id: string; type: string; title: string; summary?: string; note?: string; rel?: string; evidence?: string[] | string }
interface KnowledgeGraphEdge { id: string; from: string; to: string; type: string; evidence?: string }
interface KnowledgeGraphStore { updated_at?: string | null; nodes?: KnowledgeGraphNode[]; edges?: KnowledgeGraphEdge[]; stats?: { nodes?: number; edges?: number; types?: Record<string, number> } }
interface KnowledgeGraphResponse { ok: boolean; graph?: KnowledgeGraphStore }
interface NarrativeStateStore { updated_at?: string | null; characters?: Array<Record<string, string>>; threads?: Array<Record<string, string>>; timeline?: Array<Record<string, string | number | boolean>>; continuity_checks?: Array<Record<string, string | number>> }
interface NarrativeStateResponse { ok: boolean; state?: NarrativeStateStore }
interface CreativeMemoryStore { memories?: unknown[]; updated_at?: string | null }
interface LivingWikiPage { id: string; type: string; title: string; summary?: string; evidence?: string; source?: unknown; rel?: string; updated_at?: string }
interface LivingWikiUpdate { id: string; type: string; title: string; summary?: string; evidence?: string; source?: unknown; status?: string; created_at?: string; review_kind?: string; guard_id?: string | null; context_id?: string | null; source_type?: string }
interface LivingWikiStore { updated_at?: string | null; pages?: LivingWikiPage[]; pending_updates?: LivingWikiUpdate[] }
interface LivingWikiResponse { ok: boolean; wiki?: LivingWikiStore; graph?: KnowledgeGraphStore; memory?: CreativeMemoryStore; generated?: number; confirmed?: number; rejected?: number; queue?: LivingWikiUpdate[]; stats?: { total?: number; by_kind?: Record<string, number>; by_type?: Record<string, number> }; refresh?: { graph?: boolean; creative_memory?: boolean; errors?: string[] } }

const NODE_TYPE_TONE: Record<string, 'info' | 'success' | 'warning' | 'neutral'> = {
  character: 'info', location: 'info', world_rule: 'info', chapter: 'success', foreshadow: 'warning',
  timeline_event: 'warning', project: 'neutral', wiki_page: 'neutral'
}

export function WorldPanel({ active, busy, setBusy }: { active: WriterProject | null; busy: string; setBusy: (v: string) => void }) {
  const [story, setStory] = useState<StoryBible | null>(null)
  const [graph, setGraph] = useState<KnowledgeGraphStore | null>(null)
  const [state, setNarrativeState] = useState<NarrativeStateStore | null>(null)
  const [wiki, setWiki] = useState<LivingWikiStore | null>(null)
  const [reviewStats, setReviewStats] = useState<LivingWikiResponse['stats'] | null>(null)
  const [selected, setSelected] = useState('')

  const ref = projectRef(active)

  const refresh = async () => {
    if (!active) {return}

    try {
      const [s, g, n, w, q] = await Promise.all([
        api<StoryBibleResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/story-bible`),
        api<KnowledgeGraphResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/knowledge-graph`),
        api<NarrativeStateResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/narrative-state`),
        api<LivingWikiResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/living-wiki`),
        api<LivingWikiResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/living-wiki`, 'POST', { action: 'queue' })
      ])

      setStory(s.story_bible || null)
      setGraph(g.graph || null)
      setNarrativeState(n.state || null)
      setWiki(q.wiki ? { ...q.wiki, pending_updates: q.queue || q.wiki.pending_updates || [] } : (w.wiki || null))
      setReviewStats(q.stats || null)
    } catch (err) { notifyError(err, '世界观 / 图谱加载失败') }
  }

  useEffect(() => {
    setStory(null); setGraph(null); setNarrativeState(null); setWiki(null); setReviewStats(null)

    if (!active) {return}
    void refresh()
  }, [ref, active?.id])

  const rebuildStoryBible = async () => {
    if (!active) {return}
    setBusy('story-bible')

    try {
      const result = await api<StoryBibleResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/story-bible`, 'POST', {})
      setStory(result.story_bible || null)
      notify({ kind: 'success', title: 'Story Bible 已重建', message: 'Story Bible 已重建' })
      void refresh()
    } catch (err) { notifyError(err, 'Story Bible 重建失败') } finally { setBusy('') }
  }

  const rebuildGraph = async () => {
    if (!active) {return}
    setBusy('knowledge-graph')

    try {
      const result = await api<KnowledgeGraphResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/knowledge-graph`, 'POST', {})
      setGraph(result.graph || null)
      notify({ kind: 'success', title: '知识图谱已重建', message: '知识图谱已重建' })
    } catch (err) { notifyError(err, '图谱重建失败') } finally { setBusy('') }
  }

  const rebuildState = async () => {
    if (!active) {return}
    setBusy('narrative-state')

    try {
      const result = await api<NarrativeStateResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/narrative-state`, 'POST', {})
      setNarrativeState(result.state || null)
      notify({ kind: 'success', title: '叙事状态已重建', message: '叙事状态已重建' })
    } catch (err) { notifyError(err, '状态重建失败') } finally { setBusy('') }
  }

  const generateWiki = async () => {
    if (!active) {return}
    setBusy('living-wiki-generate')

    try {
      const result = await api<LivingWikiResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/living-wiki`, 'POST', { action: 'generate' })
      setWiki(result.wiki || null)
      notify({ kind: 'success', title: '已生成 Living Wiki 候选', message: `${result.wiki?.pending_updates?.length || 0} 条待审` })
    } catch (err) { notifyError(err, '生成 Wiki 候选失败') } finally { setBusy('') }
  }

  const confirmWiki = async (ids?: string[]) => {
    if (!active) {return}
    setBusy('living-wiki-confirm')

    try {
      const targetIds = ids && ids.length ? ids : (wiki?.pending_updates || []).map(u => u.id)
      const result = await api<LivingWikiResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/living-wiki`, 'POST', { action: 'confirm', ids: targetIds, autoRefresh: true })
      setWiki(result.wiki || null)

      if (result.graph) {setGraph(result.graph)}
      notify({ kind: 'success', title: 'Living Wiki confirmed', message: `${targetIds.length} updates; Graph ${result.refresh?.graph ? 'refreshed' : 'not refreshed'}; Memory ${result.refresh?.creative_memory ? 'refreshed' : 'not refreshed'}` })
    } catch (err) { notifyError(err, 'Confirm Wiki failed') } finally { setBusy('') }
  }

  const rejectWiki = async (ids: string[]) => {
    if (!active || !ids.length) {return}
    setBusy('living-wiki-reject')

    try {
      const result = await api<LivingWikiResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/living-wiki`, 'POST', { action: 'reject', ids, reason: 'Rejected from Canon Review Queue' })
      setWiki(result.wiki || null)
      notify({ kind: 'success', title: 'Canon updates rejected', message: `${result.rejected || ids.length} updates removed from queue` })
      await refresh()
    } catch (err) { notifyError(err, 'Reject Wiki failed') } finally { setBusy('') }
  }

  const confirmWikiKind = async (kind: string) => {
    if (!active) {return}
    setBusy(`living-wiki-confirm-${kind}`)

    try {
      const result = await api<LivingWikiResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/living-wiki`, 'POST', { action: 'accept-kind', kind, refresh: true })
      setWiki(result.wiki || null)

      if (result.graph) {setGraph(result.graph)}
      notify({ kind: 'success', title: `Accepted ${kind}`, message: `${result.confirmed || 0} updates; Graph ${result.refresh?.graph ? 'refreshed' : 'not refreshed'}` })
      await refresh()
    } catch (err) { notifyError(err, `Accept ${kind} failed`) } finally { setBusy('') }
  }


  if (!active) {return <WorkshopEmpty>先在项目中心选中项目，再进入世界观 / 图谱面板。</WorkshopEmpty>}

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-4">
        <WorkshopMetric accent="emerald" hint={`${story?.characters?.length || 0} 人物 · ${story?.world_rules?.length || 0} 规则`} label="Story Bible" value={(story?.characters?.length || 0) + (story?.world_rules?.length || 0)} />
        <WorkshopMetric accent="violet" hint={`${graph?.edges?.length || 0} 条边`} label="图谱节点" value={graph?.nodes?.length || 0} />
        <WorkshopMetric accent="sky" hint={`${state?.continuity_checks?.length || 0} 续接检查`} label="叙事状态" value={(state?.characters?.length || 0) + (state?.threads?.length || 0)} />
        <WorkshopMetric accent="amber" hint={`${wiki?.pages?.length || 0} 已落 / ${wiki?.pending_updates?.length || 0} 待审`} label="Living Wiki" value={(wiki?.pages?.length || 0) + (wiki?.pending_updates?.length || 0)} />
      </div>

      <WorkshopPanel
        actions={<Button disabled={busy === 'story-bible'} onClick={() => void rebuildStoryBible()} size="sm"><Codicon name="refresh" /> 重建</Button>}
        description="结构化人物 / 地点 / 设定 / 伏笔 / 时间线入口；其它模块从这里取数据。"
        title="Story Bible"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <SubList empty="尚无人物" items={story?.characters || []} title="人物" />
          <SubList empty="尚无地点" items={story?.locations || []} title="地点" />
          <SubList empty="尚无规则" items={story?.world_rules || []} title="世界观 / 规则" />
          <SubList empty="尚无事件" items={story?.timeline || []} title="时间线事件" />
        </div>
      </WorkshopPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <WorkshopPanel
          actions={<Button disabled={busy === 'knowledge-graph'} onClick={() => void rebuildGraph()} size="sm"><Codicon name="refresh" /> 重建</Button>}
          description="人物 / 事件 / 地点 / 伏笔 / 时间线之间的有向关系；时态边（valid_from / valid_to）由白皮书 V0.4 定义。"
          title="创作知识图谱"
        >
          <div className="grid gap-2">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {(graph?.nodes || []).slice(0, 12).map(n => (
                <button className={`rounded-[2px] border px-2 py-1.5 text-left text-xs transition-colors ${selected === n.id ? 'border-(--ui-accent) bg-(--ui-accent)/10' : 'border-(--ui-stroke-tertiary) bg-background/70 hover:border-(--ui-stroke-secondary)'}`} key={n.id} onClick={() => setSelected(n.id)}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate font-medium">{n.title}</span>
                    <WorkshopStatus tone={NODE_TYPE_TONE[n.type] || 'neutral'}>{n.type}</WorkshopStatus>
                  </div>
                  {n.summary || n.note ? <p className="mt-0.5 line-clamp-2 text-[0.65rem] text-muted-foreground">{n.summary || n.note}</p> : null}
                </button>
              ))}
            </div>
            <div className="border-t border-(--ui-stroke-tertiary) pt-2 text-xs text-muted-foreground">
              {selected ? <>已选节点：<span className="font-mono">{selected}</span> · 关联边 {countEdges(graph, selected)} 条</> : '点击节点查看关联边'}
            </div>
          </div>
        </WorkshopPanel>

        <WorkshopPanel
          actions={<Button disabled={busy === 'narrative-state'} onClick={() => void rebuildState()} size="sm"><Codicon name="refresh" /> 重建</Button>}
          description="人物 / 关系 / 伏笔 / 冲突的当前状态；续接检查包括 OOC、伏笔遗忘、目标漂移、世界规则矛盾等。"
          title="叙事状态 + 续接检查"
        >
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {(state?.continuity_checks || []).map((c, idx) => (
                <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 p-2 text-xs" key={idx}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate font-medium">{c.title as string}</span>
                    <WorkshopStatus tone={c.severity === 'high' ? 'danger' : c.severity === 'medium' ? 'warning' : 'info'}>{c.severity as string}</WorkshopStatus>
                  </div>
                  <p className="mt-1 text-[0.7rem] text-muted-foreground">{c.suggestion as string}</p>
                </div>
              ))}
            </div>
            <div className="grid max-h-48 gap-1 overflow-auto">
              {(state?.threads || []).map((t, idx) => (
                <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 px-2 py-1.5 text-xs" key={idx}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate">{t.title as string}</span>
                    <WorkshopStatus tone={t.status === 'resolved' ? 'success' : 'warning'}>{t.status as string}</WorkshopStatus>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </WorkshopPanel>
      </div>

      <WorkshopPanel
        actions={
          <div className="flex items-center gap-2">
            <Button disabled={busy === 'living-wiki-generate'} onClick={() => void generateWiki()} size="sm" variant="outline"><Codicon name="wand" /> 生成候选</Button>
            <Button disabled={busy === 'living-wiki-confirm' || !(wiki?.pending_updates?.length)} onClick={() => void confirmWiki()} size="sm"><Codicon name="check" /> 确认 {wiki?.pending_updates?.length || 0} 条</Button>
          </div>
        }
        description="auto_write / suggested_write / blocked_write 三级写回；先点「生成候选」再批量「确认」。"
        title="Living Wiki"
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <div>
            <h4 className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">已落 Wiki（{wiki?.pages?.length || 0}）</h4>
            <div className="grid max-h-64 gap-1.5 overflow-auto">
              {(wiki?.pages || []).map(p => (
                <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 px-2 py-1.5 text-xs" key={p.id}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate font-medium">{p.title}</span>
                    <WorkshopStatus tone="info">{p.type}</WorkshopStatus>
                  </div>
                  {p.summary ? <p className="mt-0.5 line-clamp-2 text-[0.7rem] text-muted-foreground">{p.summary}</p> : null}
                  {p.rel ? <div className="mt-0.5 truncate font-mono text-[0.6rem] text-muted-foreground/80">{p.rel}</div> : null}
                </div>
              ))}
              {wiki?.pages?.length === 0 ? <WorkshopEmpty>还没有已落 Wiki 页。</WorkshopEmpty> : null}
            </div>
          </div>
          <div>
            <h4 className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">待审候选（{wiki?.pending_updates?.length || 0}）</h4>
            <div className="grid max-h-64 gap-1.5 overflow-auto">
              {(wiki?.pending_updates || []).map(p => (
                <div className="rounded-[2px] border border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-xs" key={p.id}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate font-medium">{p.title}</span>
                    <div className="flex items-center gap-1">
                      <WorkshopStatus tone="warning">{p.type}</WorkshopStatus>
                      <Button disabled={busy === 'living-wiki-confirm'} onClick={() => void confirmWiki([p.id])} size="xs" variant="outline">确认</Button>
                    </div>
                  </div>
                  {p.summary ? <p className="mt-0.5 line-clamp-2 text-[0.7rem] text-muted-foreground">{p.summary}</p> : null}
                  {p.evidence ? <div className="mt-0.5 truncate font-mono text-[0.6rem] text-muted-foreground/80">{p.evidence}</div> : null}
                  {(p.guard_id || p.context_id || p.source_type) ? <div className="mt-0.5 truncate font-mono text-[0.6rem] text-muted-foreground/70">{p.source_type || 'source'} ? {p.guard_id || p.context_id || ''}</div> : null}
                  {(p.guard_id || p.context_id || p.source_type) ? <div className="mt-0.5 truncate font-mono text-[0.6rem] text-muted-foreground/70">{p.source_type || 'source'} ? {p.guard_id || p.context_id || ''}</div> : null}
                </div>
              ))}
              {wiki?.pending_updates?.length === 0 ? <WorkshopEmpty>无待审候选。点上方「生成候选」。</WorkshopEmpty> : null}
            </div>
          </div>
        </div>
      </WorkshopPanel>
    </div>
  )
}

function SubList({ items, title, empty }: { items: unknown[]; title: string; empty: string }) {
  return (
    <div>
      <h4 className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">{title}（{items.length}）</h4>
      <div className="grid max-h-48 gap-1 overflow-auto">
        {items.length === 0 ? <WorkshopEmpty>{empty}</WorkshopEmpty> : null}
        {items.slice(0, 12).map((it, idx) => {
          const row = it as Record<string, unknown>

          return (
            <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 px-2 py-1.5 text-xs" key={idx}>
              <div className="truncate font-medium">{(row.title || row.name || row.rule || row.event || row.clue) as string}</div>
              {row.note || row.snippet ? <p className="mt-0.5 line-clamp-2 text-[0.7rem] text-muted-foreground">{((row.note || row.snippet) as string)}</p> : null}
              {row.evidence ? <div className="mt-0.5 truncate font-mono text-[0.6rem] text-muted-foreground/80">{row.evidence as string}</div> : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function countEdges(graph: KnowledgeGraphStore | null, nodeId: string): number {
  if (!graph) {return 0}

  return (graph.edges || []).filter(e => e.from === nodeId || e.to === nodeId).length
}
