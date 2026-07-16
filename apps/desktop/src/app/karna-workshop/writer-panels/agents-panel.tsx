import { useEffect, useState } from 'react'

import { FieldRow, WorkshopEmpty, WorkshopMetric, WorkshopPanel, WorkshopStatus } from '@/components/karna/workshop'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { notify, notifyError } from '@/store/notifications'

import { api, projectRef, type WriterProject } from '../workshop-state'

interface WorkflowAgent { id: string; name: string; role: string; tagline?: string; duties?: string; color?: string; enabled?: boolean }
interface WorkflowNode { id: string; type: string; data?: Record<string, unknown>; position?: { x: number; y: number } }
interface WorkflowEdge { id: string; source: string; target: string; label?: string }
interface WriterWorkflow { id: string; name: string; mode?: string; nodes?: WorkflowNode[]; edges?: WorkflowEdge[]; updated_at?: string }
interface WorkflowRun {
  run_id: string; workflow_id: string; status: string;
  node_statuses?: Record<string, { label?: string; status?: string; summary?: string; agent_name?: string; rag_context_id?: string | null; rag_citations?: number; draft_guard_id?: string | null; draft_guard_blocked?: boolean; draft_guard_issues?: number; draft_guard_citations?: number; llm_fallback?: boolean; llm_error?: string | null; soul_method_pack_ids?: string[]; soul_method_author_ids?: string[] }>;
  artifacts?: Array<{ id: string; title: string; path?: string }>;
  rag_contexts?: Array<{ node_id?: string; context_id?: string; query?: string; citations?: number; provider?: string; mode?: string }>;
  writeback?: { artifacts?: number; wiki_pending?: number; narrative_threads?: number; errors?: string[] };
  draft_guard?: { id?: string; blocked?: boolean; context_id?: string | null; error?: string; summary?: { issues?: number; high?: number; medium?: number; citations?: number } };
  draft_guard_outputs?: Array<{ node_id?: string; agent_id?: string; id?: string; blocked?: boolean; context_id?: string | null; summary?: { issues?: number; high?: number; medium?: number; citations?: number }; writeback?: { wiki_pending?: number; narrative_threads?: number } }>;
  soul_method_packs?: Array<{ id?: string; name?: string; soul_author_id?: string | null; soul_author_slug?: string | null; node_ids?: string[] }>;
  started_at?: string; finished_at?: string; cost_estimate?: { calls?: number; tokens?: number }
}
interface WorkflowsResponse { ok: boolean; agents?: WorkflowAgent[]; workflows?: WriterWorkflow[]; runs?: WorkflowRun[]; workflow?: WriterWorkflow; run?: WorkflowRun }
interface CapabilityPack { id: string; name: string; category?: string; purpose?: string; source?: string; agents?: string[]; matched_skills?: Array<{ name: string; description?: string; path?: string; enabled?: boolean }>; safe_transfer_principles?: string[]; narrative_methods?: string[]; safety_rules?: string[]; profile_updated_at?: string | null }
interface CapabilityPacksResponse { ok: boolean; packs?: CapabilityPack[]; updated_at?: string | null }
interface WritingLoopResponse { ok: boolean; steps?: Array<{ id: string; ok: boolean; detail?: string }>; run?: WorkflowRun; benchmark?: { readiness_score?: number; maturity_score?: number; score?: number }; command_center?: { status?: string; health_score?: number } }

const STATUS_TONE: Record<string, 'info' | 'success' | 'warning' | 'danger' | 'busy' | 'neutral'> = {
  queued: 'info', running: 'busy', done: 'success', paused: 'warning', blocked: 'danger',
  accepted: 'success', rejected: 'danger', skipped: 'neutral'
}

export function AgentsPanel({ active, busy, setBusy }: { active: WriterProject | null; busy: string; setBusy: (v: string) => void }) {
  const [agents, setAgents] = useState<WorkflowAgent[]>([])
  const [workflows, setWorkflows] = useState<WriterWorkflow[]>([])
  const [runs, setRuns] = useState<WorkflowRun[]>([])
  const [packs, setPacks] = useState<CapabilityPack[]>([])
  const [packsAt, setPacksAt] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [input, setInput] = useState('')
  const [selectedSoulPackId, setSelectedSoulPackId] = useState('')
  const [lastWritingLoop, setLastWritingLoop] = useState<WritingLoopResponse | null>(null)

  const ref = projectRef(active)

  const refresh = async () => {
    if (!active) {return}

    try {
      const [w, c] = await Promise.all([
        api<WorkflowsResponse>(`/api/writer/workflows?project=${encodeURIComponent(ref)}`),
        api<CapabilityPacksResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/capability-packs`)
      ])

      setAgents(w.agents || [])
      setWorkflows(w.workflows || [])
      setRuns(w.runs || [])
      const nextPacks = c.packs || []
      setPacks(nextPacks)
      setPacksAt(c.updated_at || null)

      if (!selectedSoulPackId && nextPacks.some(pack => pack.source === 'soul_workshop')) {setSelectedSoulPackId(nextPacks.find(pack => pack.source === 'soul_workshop')?.id || '')}
    } catch (err) { notifyError(err, '加载工作流失败') }
  }

  useEffect(() => {
    setAgents([]); setWorkflows([]); setRuns([]); setPacks([]); setSelectedSoulPackId(''); setLastWritingLoop(null)

    if (!active) {return}
    void refresh()
  }, [ref, active?.id])

  const ensureDefault = async () => {
    if (!active) {return}
    setBusy('workflow-create')

    try {
      const nodes = [
        { id: 'n1', type: 'agent', position: { x: 120, y: 80 }, data: { label: '大纲', agent_id: 'outline_architect' } },
        { id: 'n2', type: 'agent', position: { x: 360, y: 80 }, data: { label: '写作', agent_id: 'chapter_writer' } },
        { id: 'n3', type: 'human_review', position: { x: 600, y: 80 }, data: { label: '人审', requiresReview: true } }
      ] as WorkflowNode[]

      const edges = [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' }
      ] as WorkflowEdge[]

      const result = await api<WorkflowsResponse>(`/api/writer/workflows?project=${encodeURIComponent(ref)}`, 'POST', { projectRef: ref, name: '章节开发标准工作流', mode: 'canvas', nodes, edges, limits: { max_agents: 6, max_parallel: 3, max_loop: 2 }, knowledge_binding: { enabled: true, ids: [] } })
      setWorkflows(result.workflows || workflows)
      notify({ kind: 'success', title: '工作流已创建', message: '已写入 workflows.json' })
      await refresh()
    } catch (err) { notifyError(err, '创建工作流失败') } finally { setBusy('') }
  }

  const runSelected = async () => {
    if (!active) {return}
    const target = workflows.find(w => w.id === selectedId) || workflows[0]

    if (!target) {return}
    setBusy('workflow-run')

    try {
      const result = await api<WorkflowsResponse>(`/api/writer/workflows/${encodeURIComponent(target.id)}/run`, 'POST', { projectRef: ref, input: input || 'Please generate the next chapter development plan from the current project context.', ragContext: true, draftGuard: true, draftGuardOutputs: true, draftGuardOutputWriteback: true, vectorProvider: 'auto', soulPackId: selectedSoulPackId || undefined, soulMode: selectedSoulPackId ? 'selected' : 'auto' })

      if (result.run) {setRuns(rows => [result.run!, ...rows.filter(row => row.run_id !== result.run!.run_id)].slice(0, 20))}
      notify({ kind: 'success', title: '工作流已运行', message: result.run?.status || 'done' })
      await refresh()
    } catch (err) { notifyError(err, '运行工作流失败') } finally { setBusy('') }
  }

  const runWritingLoop = async () => {
    if (!active) {return}
    setBusy('writing-loop')

    try {
      const result = await api<WritingLoopResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/guide`, 'POST', {
        action: 'run-step',
        step: 'writing_loop',
        input: input || 'Please run the full Writer OS writing loop for the next chapter.',
        text: input,
        ragContext: true,
        draftGuard: true,
        draftGuardOutputs: true,
        draftGuardOutputWriteback: true,
        vectorProvider: 'local',
        soulPackId: selectedSoulPackId || undefined,
        soulMode: selectedSoulPackId ? 'selected' : 'auto'
      })

      setLastWritingLoop(result)

      if (result.run) {setRuns(rows => [result.run!, ...rows.filter(row => row.run_id !== result.run!.run_id)].slice(0, 20))}
      const ok = result.steps?.filter(step => step.ok).length || 0
      notify({ kind: result.ok === false ? 'warning' : 'success', title: 'Writer Loop finished', message: `${ok}/${result.steps?.length || 0} steps` })
      await refresh()
    } catch (err) { notifyError(err, 'Writer Loop failed') } finally { setBusy('') }
  }

  const syncPacks = async () => {
    if (!active) {return}
    setBusy('capability-packs')

    try {
      const result = await api<CapabilityPacksResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/capability-packs`, 'POST', { action: 'sync' })
      setPacks(result.packs || [])
      setPacksAt(result.updated_at || null)
      notify({ kind: 'success', title: '能力包已同步', message: `${result.packs?.length || 0} 个` })
    } catch (err) { notifyError(err, '能力包同步失败') } finally { setBusy('') }
  }

  if (!active) {return <WorkshopEmpty>先在项目中心选中项目，再进入多智能体面板。</WorkshopEmpty>}

  const selected = workflows.find(w => w.id === selectedId) || workflows[0] || null
  const lastRun = runs[0]

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-6">
        <WorkshopMetric accent="violet" hint="可拖到工作流" label="智能体" value={agents.length} />
        <WorkshopMetric accent="emerald" hint={selected ? `已选：${selected.name}` : '未选'} label="工作流" value={workflows.length} />
        <WorkshopMetric accent="sky" hint={lastRun ? `最近：${lastRun.status}` : '尚无运行'} label="运行" value={runs.length} />
        <WorkshopMetric accent="rose" hint={lastRun?.rag_contexts?.length ? `${lastRun.rag_contexts.reduce((sum, row) => sum + (row.citations || 0), 0)} citations` : '随工作流注入'} label="RAG 上下文" value={lastRun?.rag_contexts?.length || 0} />
        <WorkshopMetric accent="amber" hint={packsAt ? `更新于 ${formatTime(packsAt)}` : '未同步'} label="能力包" value={packs.length} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <WorkshopPanel
          actions={
            <div className="flex items-center gap-2">
              <Button disabled={busy === 'workflow-create'} onClick={() => void ensureDefault()} size="sm" variant="outline"><Codicon name="add" /> 创建标准</Button>
              <Button disabled={!workflows.length || busy === 'workflow-run'} onClick={() => void runSelected()} size="sm"><Codicon name="play" /> 运行</Button>
              <Button disabled={busy === 'writing-loop'} onClick={() => void runWritingLoop()} size="sm" variant="outline"><Codicon name="rocket" /> Writer Loop</Button>
            </div>
          }
          description="用主控 Agent 串起 outline / 写作 / 校对 / 风险 / 归档。需要复杂分支时去「多 Agent 工坊」画布。"
          title="工作流列表"
        >
          <div className="grid gap-1.5">
            {workflows.length === 0 ? <WorkshopEmpty>还没有工作流。点「创建标准」生成 2 节点 + 1 人审。</WorkshopEmpty> : null}
            {workflows.map(w => {
              const last = runs.find(r => r.workflow_id === w.id)
              const isActive = (selected?.id || '') === w.id

              return (
                <button className={`grid grid-cols-[1fr_auto] items-center gap-2 rounded-[2px] border px-2.5 py-2 text-left text-xs transition-colors ${isActive ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)]/10' : 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/70 hover:border-[var(--theme-primary)]/40'}`} key={w.id} onClick={() => setSelectedId(w.id)}>
                  <div>
                    <div className="truncate font-medium">{w.name}</div>
                    <div className="text-[0.65rem] text-muted-foreground">{w.nodes?.length || 0} 节点 / {w.edges?.length || 0} 边</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {last ? <WorkshopStatus tone={STATUS_TONE[last.status] || 'neutral'}>{last.status}</WorkshopStatus> : <WorkshopStatus tone="neutral">未跑</WorkshopStatus>}
                  </div>
                </button>
              )
            })}
          </div>
          <div className="mt-3 grid gap-2">
            <FieldRow label="Run input">
              <textarea className="rounded-[2px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)] px-2 py-1.5 text-sm" onChange={e => setInput(e.target.value)} placeholder="Put this run's writing request, chapter draft, or card note here." rows={3} value={input} />
            </FieldRow>
            <FieldRow label="Soul Method">
              <select className="rounded-[2px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)] px-2 py-1.5 text-sm" onChange={e => setSelectedSoulPackId(e.target.value)} value={selectedSoulPackId}>
                <option value="">Auto / no selected Soul pack</option>
                {packs.filter(pack => pack.source === 'soul_workshop').map(pack => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
              </select>
            </FieldRow>
          </div>
        </WorkshopPanel>

        <div className="grid gap-4">
          {lastWritingLoop ? (
            <WorkshopPanel description="One-click path: input snapshot, RAG/vector context, Draft Guard, Agent workflow, writeback, safety and benchmark." title="Writer Loop">
              <div className="grid gap-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <WorkshopStatus tone={lastWritingLoop.ok === false ? 'warning' : 'success'}>{lastWritingLoop.ok === false ? 'needs review' : 'passed'}</WorkshopStatus>
                </div>
                <div className="font-mono text-[0.65rem] text-muted-foreground">
                  health {lastWritingLoop.command_center?.health_score ?? '-'} / benchmark {lastWritingLoop.benchmark?.maturity_score ?? lastWritingLoop.benchmark?.score ?? '-'}
                </div>
                {(lastWritingLoop.steps || []).slice(0, 8).map(step => (
                  <div className="grid grid-cols-[1fr_auto] gap-2 rounded-[2px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/70 px-2 py-1" key={step.id}>
                    <span className="truncate">{step.id}: {step.detail}</span>
                    <WorkshopStatus tone={step.ok ? 'success' : 'warning'}>{step.ok ? 'ok' : 'review'}</WorkshopStatus>
                  </div>
                ))}
              </div>
            </WorkshopPanel>
          ) : null}

          <WorkshopPanel title="Recent Run">
            {!lastRun ? <WorkshopEmpty>跑一次后这里会展示每个节点状态和摘要。</WorkshopEmpty> : (
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="truncate text-muted-foreground">{lastRun.run_id}</span>
                  <WorkshopStatus tone={STATUS_TONE[lastRun.status] || 'neutral'}>{lastRun.status}</WorkshopStatus>
                </div>
                <div className="grid gap-1">
                  {Object.entries(lastRun.node_statuses || {}).slice(0, 6).map(([id, row]) => (
                    <div className="rounded-[2px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/70 px-2 py-1.5 text-xs" key={id}>
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate">{row.label || id}</span>
                        <WorkshopStatus tone={STATUS_TONE[row.status || ''] || 'neutral'}>{row.status}</WorkshopStatus>
                      </div>
                      {row.rag_context_id ? <div className="mt-0.5 font-mono text-[0.6rem] text-muted-foreground">RAG {row.rag_context_id} · {row.rag_citations || 0} citations</div> : null}
                      {row.draft_guard_id ? <div className="mt-0.5 font-mono text-[0.6rem] text-muted-foreground">Guard {row.draft_guard_id} - {row.draft_guard_issues || 0} issues - {row.draft_guard_citations || 0} cites</div> : null}
                      {row.soul_method_pack_ids?.length ? <div className="mt-0.5 font-mono text-[0.6rem] text-[var(--theme-primary)]/80">Soul {row.soul_method_pack_ids.join(', ')}</div> : null}
                      {row.llm_fallback ? <div className="mt-0.5 font-mono text-[0.6rem] text-[var(--theme-secondary)]">{row.llm_error || 'model unavailable'}</div> : null}
                      {row.summary ? <p className="mt-0.5 line-clamp-2 text-[0.65rem] text-muted-foreground">{row.summary}</p> : null}
                    </div>
                  ))}
                </div>
                {lastRun.soul_method_packs?.length ? (
                  <div className="mt-2 rounded-[2px] border border-[var(--theme-primary)]/20 bg-[var(--theme-primary)]/5 px-2 py-1.5 text-[0.65rem]">
                    <div className="font-medium text-[var(--theme-primary)]">Soul Method Packs used</div>
                    <div className="mt-0.5 text-muted-foreground">{lastRun.soul_method_packs.map(pack => pack.name || pack.id).join(' / ')}</div>
                  </div>
                ) : null}
                {lastRun.draft_guard_outputs?.length ? (
                  <div className="mt-2 grid gap-1">
                    <div className="text-[0.65rem] font-medium text-muted-foreground">Draft Guard output gates</div>
                    {lastRun.draft_guard_outputs.slice(0, 4).map(g => (
                      <div className="rounded-[2px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/70 px-2 py-1 text-[0.65rem]" key={`${g.node_id}-${g.id}`}>
                        <div className="truncate font-mono text-muted-foreground">{g.id} ? {g.blocked ? 'blocked' : 'passed'} ? {g.summary?.issues || 0} issues ? {g.summary?.citations || 0} cites</div>
                        {g.writeback ? <div className="text-muted-foreground">wiki pending {g.writeback.wiki_pending || 0} ? state threads {g.writeback.narrative_threads || 0}</div> : null}
                      </div>
                    ))}
                  </div>
                ) : null}
                {lastRun.rag_contexts?.length ? (
                  <div className="mt-2 grid gap-1">
                    <div className="text-[0.65rem] font-medium text-muted-foreground">工作流证据上下文</div>
                    {lastRun.rag_contexts.slice(0, 4).map(ctx => (
                      <div className="rounded-[2px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/70 px-2 py-1 text-[0.65rem]" key={`${ctx.node_id}-${ctx.context_id}`}>
                        <div className="truncate font-mono text-muted-foreground">{ctx.context_id} · {ctx.mode || 'rag'} · {ctx.citations || 0} cites</div>
                        <div className="line-clamp-1">{ctx.query}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
                {lastRun.writeback ? (
                  <div className="mt-2 rounded-[2px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/70 px-2 py-1.5 text-[0.65rem]">
                    <div className="font-medium text-muted-foreground">长期记忆回写</div>
                    <div className="mt-0.5 font-mono text-muted-foreground">
                      artifacts {lastRun.writeback.artifacts || 0} · wiki pending {lastRun.writeback.wiki_pending || 0} · state threads {lastRun.writeback.narrative_threads || 0}
                    </div>
                    {lastRun.writeback.errors?.length ? <div className="mt-0.5 text-destructive">{lastRun.writeback.errors.join('; ')}</div> : null}
                  </div>
                ) : null}
              </div>
            )}
          </WorkshopPanel>

          <WorkshopPanel
            actions={<Button disabled={busy === 'capability-packs'} onClick={() => void syncPacks()} size="xs" variant="outline"><Codicon name="sync" /> 同步</Button>}
            description="按 skill_query 自动匹配 skills/ 目录里的 writer skills。"
            title="能力包"
          >
            <div className="grid gap-1.5">
              {packs.length === 0 ? <WorkshopEmpty>尚无能力包。点「同步」从 skills/ 目录拉。</WorkshopEmpty> : null}
              {packs.map(p => (
                <div className="rounded-[2px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/70 px-2 py-1.5 text-xs" key={p.id}>
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate font-medium">{p.name}</span>
                    <WorkshopStatus tone="info">{p.category || '—'}</WorkshopStatus>
                  </div>
                  {p.purpose ? <p className="mt-0.5 line-clamp-2 text-[0.7rem] text-muted-foreground">{p.purpose}</p> : null}
                  {p.source === 'soul_workshop' ? (
                    <div className="mt-1 rounded-[2px] border border-[var(--theme-primary)]/20 bg-[var(--theme-primary)]/5 px-2 py-1 text-[0.62rem] text-muted-foreground">
                      <div className="font-medium text-[var(--theme-primary)]">Soul safe transfer · no style clone</div>
                      {p.safe_transfer_principles?.length ? <div className="mt-0.5 line-clamp-2">{p.safe_transfer_principles.slice(0, 2).join(' / ')}</div> : null}
                    </div>
                  ) : null}
                  <div className="mt-1 text-[0.6rem] text-muted-foreground">{p.matched_skills?.length || 0} skills ? {(p.agents || []).length} agents</div>
                </div>
              ))}
            </div>
          </WorkshopPanel>
        </div>
      </div>

      <WorkshopPanel description="可拖到画布；当前项目内可用。" title="智能体库">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">
          {agents.map(a => (
            <div className="rounded-[2px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/70 px-2 py-1.5 text-xs" key={a.id}>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: a.color || 'var(--theme-primary)' }} />
                <span className="truncate font-medium">{a.name}</span>
              </div>
              <div className="mt-0.5 truncate text-[0.65rem] text-muted-foreground">{a.tagline || a.role}</div>
            </div>
          ))}
        </div>
      </WorkshopPanel>
    </div>
  )
}

function formatTime(iso: string): string {
  const t = new Date(iso).getTime()

  if (Number.isNaN(t)) {return iso}

  return new Date(t).toLocaleString()
}
