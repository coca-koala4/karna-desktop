import { useState, useEffect, useCallback } from 'react'
import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'
import { modeApi } from '@/lib/mode-api'
import { planApi } from '@/lib/plan-api'
import { goalApi } from '@/lib/goal-api'
import { creativeApi } from '@/lib/creative-api'
import type { AgentModeId, AgentModeSession, ModeExecutionBinding } from '@/types/mode'

const MODE_META: Record<AgentModeId, { label: string; icon: string; color: string; description: string }> = {
  direct: { label: '直接模式', icon: 'zap', color: 'text-(--ui-color-accent)', description: '即时问答，无需结构化流程' },
  plan: { label: '计划模式', icon: 'circuit-board', color: 'text-blue-400', description: '先制定详细计划再执行' },
  goal: { label: '目标模式', icon: 'target', color: 'text-emerald-400', description: '定义可验证成功标准，自主执行直到目标达成' },
  living_work: { label: '作品演化', icon: 'edit', color: 'text-purple-400', description: 'Creative作品持续演化，保护留白、尊重不可违背约束' }
}

const STATUS_META: Record<string, { label: string; color: string; dot: string }> = {
  draft: { label: '草稿', color: 'text-(--ui-text-secondary)', dot: 'bg-(--ui-text-secondary)' },
  ready: { label: '就绪', color: 'text-blue-400', dot: 'bg-blue-400' },
  running: { label: '运行中', color: 'text-emerald-400', dot: 'bg-emerald-400 animate-pulse' },
  active: { label: '进行中', color: 'text-emerald-400', dot: 'bg-emerald-400 animate-pulse' },
  paused: { label: '已暂停', color: 'text-yellow-400', dot: 'bg-yellow-400' },
  waiting_user: { label: '等待用户', color: 'text-amber-400', dot: 'bg-amber-400 animate-pulse' },
  blocked: { label: '阻塞', color: 'text-red-400', dot: 'bg-red-400' },
  completed: { label: '已完成', color: 'text-(--ui-text-secondary)', dot: 'bg-emerald-500' },
  failed: { label: '失败', color: 'text-red-500', dot: 'bg-red-500' },
  cancelled: { label: '已取消', color: 'text-(--ui-text-secondary)', dot: 'bg-(--ui-text-secondary)' }
}

const PLAN_PHASE_LABELS: Record<string, string> = {
  draft: '草稿',
  investigating: '调查中',
  structuring: '结构化中',
  validating: '验证中',
  ready_for_review: '待审阅',
  revised: '已修订',
  converted: '已转换'
}

export interface ModeSidebarProps {
  modeSessionId: string | null
  onClose?: () => void
  onModeTransition?: (from: string, to: AgentModeId) => void
  defaultOpen?: boolean
}

interface RuntimeResources {
  skills: Array<{ id: string; ref?: string }>
  souls: Array<{ id: string; ref?: string }>
  tools: Array<{ id: string }>
  documents: Array<{ id: string; label?: string; path?: string }>
  knowledgeSources: Array<{ id: string; type?: string }>
}

export function ModeSidebar({ modeSessionId, onClose, onModeTransition, defaultOpen = true }: ModeSidebarProps) {
  const [expanded, setExpanded] = useState(defaultOpen)
  const [tab, setTab] = useState<'overview' | 'resources' | 'progress' | 'transition'>('overview')
  const [session, setSession] = useState<AgentModeSession | null>(null)
  const [binding, setBinding] = useState<ModeExecutionBinding | null>(null)
  const [runtimeResources, setRuntimeResources] = useState<RuntimeResources | null>(null)
  const [modeDetail, setModeDetail] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!modeSessionId) {
      setSession(null)
      setBinding(null)
      setModeDetail(null)
      setRuntimeResources(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const s = await modeApi.get(modeSessionId) as AgentModeSession | { error: string }
      if ('error' in s) {
        setError(s.error)
        return
      }
      setSession(s)
      setBinding(s.binding || null)

      try {
        const res = await modeApi.getRuntimeEffectiveResources(modeSessionId)
        if (res.ok) {
          setRuntimeResources({
            skills: res.skills || [],
            souls: res.souls || [],
            tools: res.tools || [],
            documents: res.documents || [],
            knowledgeSources: res.knowledgeSources || []
          })
        }
      } catch { /* runtime may not be attached yet */ }

      try {
        if (s.mode === 'plan') {
          const plan = await planApi.get(modeSessionId)
          if (!('error' in plan)) setModeDetail(plan)
        } else if (s.mode === 'goal') {
          const goal = await goalApi.get(modeSessionId)
          if (!('error' in goal)) setModeDetail(goal)
        } else if (s.mode === 'living_work') {
          const creative = await creativeApi.get(modeSessionId)
          if (!('error' in creative)) setModeDetail(creative)
        } else {
          setModeDetail(null)
        }
      } catch { /* detail fetch is best-effort */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [modeSessionId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handleAttach = async () => {
    if (!modeSessionId) return
    await modeApi.attachRuntime(modeSessionId)
    void refresh()
  }

  const handlePause = async () => {
    if (!modeSessionId || !session) return
    await modeApi.pause(modeSessionId, { expectedVersion: session.stateVersion })
    void refresh()
  }

  const handleResume = async () => {
    if (!modeSessionId || !session) return
    await modeApi.resume(modeSessionId, { expectedVersion: session.stateVersion })
    void refresh()
  }

  const handleComplete = async () => {
    if (!modeSessionId || !session) return
    await modeApi.complete(modeSessionId, { expectedVersion: session.stateVersion })
    void refresh()
  }

  const handleCancel = async () => {
    if (!modeSessionId || !session) return
    await modeApi.cancel(modeSessionId, { expectedVersion: session.stateVersion })
    void refresh()
  }

  const handleTransition = async (to: AgentModeId) => {
    if (!modeSessionId || !session) return
    const result = await modeApi.transition(modeSessionId, { toMode: to })
    if ('ok' in result && result.ok && onModeTransition) {
      onModeTransition(modeSessionId, to)
    }
    void refresh()
  }

  if (!modeSessionId) {
    return (
      <div className={cn(
        'flex flex-col border-l border-(--ui-stroke-secondary) bg-(--ui-surface) transition-all duration-200',
        expanded ? 'w-72' : 'w-10'
      )}>
        <button
          type="button"
          className="flex h-10 w-full items-center justify-center border-b border-(--ui-stroke-secondary) text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)"
          onClick={() => setExpanded(e => !e)}
          title={expanded ? '收起模式面板' : '展开模式面板'}
        >
          <Codicon name={expanded ? 'chevron-right' : 'chevron-left'} size="0.875rem" />
        </button>
        {expanded && (
          <div className="flex flex-1 items-center justify-center p-4 text-center text-xs text-(--ui-text-secondary)">
            <div>
              <Codicon name="info" size="1.2rem" className="mx-auto mb-2 opacity-50" />
              <p>没有活跃的模式会话</p>
              <p className="mt-1 opacity-70">开始对话后将显示模式状态</p>
            </div>
          </div>
        )}
      </div>
    )
  }

  const meta = session ? MODE_META[session.mode] : null
  const statusMeta = session ? STATUS_META[session.status] || STATUS_META.draft : null

  return (
    <div className={cn(
      'flex flex-col border-l border-(--ui-stroke-secondary) bg-(--ui-surface) transition-all duration-200',
      expanded ? 'w-80' : 'w-10'
    )}>
      <div className="flex h-10 items-center border-b border-(--ui-stroke-secondary)">
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)"
          onClick={() => setExpanded(e => !e)}
          title={expanded ? '收起模式面板' : '展开模式面板'}
        >
          <Codicon name={expanded ? 'chevron-right' : 'chevron-left'} size="0.875rem" />
        </button>
        {expanded && meta && statusMeta && (
          <>
            <div className="flex flex-1 items-center gap-2 px-1">
              <span className={cn('inline-block h-2 w-2 rounded-full', statusMeta.dot)} />
              <Codicon name={meta.icon as any} size="0.8rem" className={meta.color} />
              <span className="text-xs font-medium">{meta.label}</span>
              <span className={cn('ml-auto text-[10px]', statusMeta.color)}>{statusMeta.label}</span>
            </div>
            {onClose && (
              <button
                type="button"
                className="flex h-10 w-8 items-center justify-center text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)"
                onClick={onClose}
                title="关闭面板"
              >
                <Codicon name="close" size="0.8rem" />
              </button>
            )}
          </>
        )}
      </div>

      {expanded && (
        <>
          <div className="flex border-b border-(--ui-stroke-secondary) text-[11px]">
            {(['overview', 'resources', 'progress', 'transition'] as const).map(t => (
              <button
                key={t}
                type="button"
                className={cn(
                  'flex-1 py-1.5 transition-colors',
                  tab === t
                    ? 'border-b-2 border-(--ui-color-accent) text-foreground'
                    : 'text-(--ui-text-secondary) hover:text-foreground'
                )}
                onClick={() => setTab(t)}
              >
                {t === 'overview' ? '概览' : t === 'resources' ? '资源' : t === 'progress' ? '进度' : '转换'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3 text-xs">
            {loading && (
              <div className="flex items-center justify-center py-8 text-(--ui-text-secondary)">
                <Codicon name="loading" size="1rem" className="animate-spin mr-2" />
                加载中...
              </div>
            )}

            {error && !loading && (
              <div className="rounded border border-red-400/30 bg-red-500/10 p-2 text-red-400">
                <Codicon name="error" size="0.8rem" className="mr-1 inline" />
                {error}
              </div>
            )}

            {!loading && !error && session && meta && tab === 'overview' && (
              <div className="space-y-3">
                <div>
                  <p className={cn('text-sm font-medium', meta.color)}>
                    <Codicon name={meta.icon as any} size="0.8rem" className="mr-1 inline" />
                    {meta.label}
                  </p>
                  <p className="mt-1 text-(--ui-text-secondary)">{meta.description}</p>
                </div>

                <div className="space-y-1.5 rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) p-2">
                  <InfoRow label="状态" value={statusMeta?.label || session.status} />
                  <InfoRow label="会话ID" value={session.id.slice(0, 12)} mono />
                  <InfoRow label="版本" value={`v${session.stateVersion}`} />
                  {session.workspaceId && <InfoRow label="工作区" value={session.workspaceId.slice(0, 16)} mono />}
                  {session.createdAt && <InfoRow label="创建时间" value={formatTime(session.createdAt)} />}
                </div>

                {session.mode === 'plan' && modeDetail && (
                  <PlanOverview detail={modeDetail as any} />
                )}
                {session.mode === 'goal' && modeDetail && (
                  <GoalOverview detail={modeDetail as any} />
                )}
                {session.mode === 'living_work' && modeDetail && (
                  <CreativeOverview detail={modeDetail as any} />
                )}

                <div className="flex flex-wrap gap-1 pt-1">
                  {session.status === 'running' && (
                    <ActionBtn onClick={handlePause} icon="debug-pause">暂停</ActionBtn>
                  )}
                  {session.status === 'paused' && (
                    <ActionBtn onClick={handleResume} icon="play">继续</ActionBtn>
                  )}
                  {(session.status === 'running' || session.status === 'ready' || session.status === 'paused' || session.status === 'waiting_user') && (
                    <ActionBtn onClick={handleComplete} icon="check">完成</ActionBtn>
                  )}
                  {!['completed', 'cancelled', 'failed'].includes(session.status) && (
                    <ActionBtn onClick={handleCancel} icon="stop-circle" variant="danger">取消</ActionBtn>
                  )}
                  {!runtimeResources && (
                    <ActionBtn onClick={handleAttach} icon="plug">绑定运行时</ActionBtn>
                  )}
                </div>
              </div>
            )}

            {!loading && !error && tab === 'resources' && (
              <div className="space-y-3">
                {!runtimeResources && (
                  <div className="rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) p-3 text-center text-(--ui-text-secondary)">
                    <Codicon name="plug" size="1.2rem" className="mx-auto mb-2 opacity-50" />
                    <p>运行时未绑定</p>
                    <button
                      type="button"
                      className="mt-2 rounded bg-(--ui-color-accent) px-3 py-1 text-[11px] text-white hover:opacity-90"
                      onClick={handleAttach}
                    >
                      绑定运行时
                    </button>
                  </div>
                )}

                {runtimeResources && (
                  <>
                    <ResourceSection title="Skills" icon="tools" items={runtimeResources.skills} idKey="id" empty="未绑定技能" />
                    <ResourceSection title="Souls" icon="heart" items={runtimeResources.souls} idKey="id" empty="未绑定灵魂" />
                    <ResourceSection title="Tools" icon="terminal" items={runtimeResources.tools} idKey="id" empty="未绑定工具（使用默认）" />
                    <ResourceSection title="Documents" icon="file" items={runtimeResources.documents} labelKey="label" idKey="id" empty="未绑定文档" />
                    <ResourceSection title="Knowledge" icon="book" items={runtimeResources.knowledgeSources} idKey="id" labelKey="type" empty="未绑定知识源" />
                  </>
                )}

                {binding?.permissionPolicy && (
                  <div className="rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) p-2">
                    <p className="mb-1 text-[10px] font-medium uppercase text-(--ui-text-secondary)">权限策略</p>
                    <pre className="max-h-32 overflow-auto text-[10px] text-(--ui-text-secondary)">
                      {JSON.stringify(binding.permissionPolicy, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {!loading && !error && tab === 'progress' && session && (
              <div className="space-y-3">
                {session.mode === 'goal' && modeDetail && (
                  <GoalProgress detail={modeDetail as any} />
                )}
                {session.mode === 'plan' && modeDetail && (
                  <PlanProgress detail={modeDetail as any} />
                )}
                {session.mode === 'living_work' && modeDetail && (
                  <CreativeProgress detail={modeDetail as any} />
                )}
                {session.mode === 'direct' && (
                  <div className="rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) p-3 text-center text-(--ui-text-secondary)">
                    <p>直接模式无结构化进度</p>
                  </div>
                )}
              </div>
            )}

            {!loading && !error && tab === 'transition' && (
              <div className="space-y-2">
                <p className="text-[11px] text-(--ui-text-secondary)">
                  转换模式将创建当前状态的快照，然后切换到目标模式。上下文、绑定资源和进度将被保留。
                </p>
                {(['direct', 'plan', 'goal', 'living_work'] as AgentModeId[]).filter(m => session && m !== session.mode).map(mode => {
                  const m = MODE_META[mode]
                  return (
                    <button
                      key={mode}
                      type="button"
                      className="flex w-full items-center gap-2 rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) p-2 text-left transition-colors hover:border-(--ui-color-accent) hover:bg-(--ui-control-hover-background)"
                      onClick={() => handleTransition(mode)}
                      disabled={!session || ['completed', 'cancelled', 'failed'].includes(session.status)}
                    >
                      <Codicon name={m.icon as any} size="0.9rem" className={m.color} />
                      <div className="flex-1">
                        <p className="text-xs font-medium">{m.label}</p>
                        <p className="text-[10px] text-(--ui-text-secondary)">{m.description}</p>
                      </div>
                      <Codicon name="arrow-right" size="0.8rem" className="text-(--ui-text-secondary)" />
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-(--ui-text-secondary) text-[10px] uppercase">{label}</span>
      <span className={cn('text-[11px]', mono && 'font-mono')}>{value}</span>
    </div>
  )
}

function ActionBtn({ onClick, icon, children, variant }: { onClick: () => void; icon: string; children: React.ReactNode; variant?: 'danger' }) {
  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-1 rounded px-2 py-1 text-[10px] transition-colors',
        variant === 'danger'
          ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
          : 'bg-(--ui-surface-secondary) text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
      )}
      onClick={onClick}
    >
      <Codicon name={icon as any} size="0.7rem" />
      {children}
    </button>
  )
}

function ResourceSection({ title, icon, items, idKey, labelKey, empty }: {
  title: string; icon: string; items: Array<Record<string, unknown>>; idKey: string; labelKey?: string; empty: string
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1 text-[10px] font-medium uppercase text-(--ui-text-secondary)">
        <Codicon name={icon as any} size="0.7rem" />
        {title}
        <span className="ml-1 text-(--ui-text-disabled)">({items.length})</span>
      </p>
      {items.length === 0 ? (
        <p className="rounded bg-(--ui-surface-secondary) px-2 py-1.5 text-[10px] italic text-(--ui-text-disabled)">{empty}</p>
      ) : (
        <div className="space-y-1">
          {items.slice(0, 8).map((item, i) => {
            const id = String(item[idKey] || `item-${i}`)
            const label = labelKey ? String(item[labelKey] || id) : id
            return (
              <div key={`${id}-${i}`} className="truncate rounded bg-(--ui-surface-secondary) px-2 py-1 font-mono text-[10px]" title={id}>
                {labelKey && label !== id ? `${label}: ` : ''}{id.length > 36 ? id.slice(0, 36) + '...' : id}
              </div>
            )
          })}
          {items.length > 8 && (
            <p className="text-[10px] text-(--ui-text-disabled)">...还有 {items.length - 8} 项</p>
          )}
        </div>
      )}
    </div>
  )
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString()
  } catch { return iso }
}

function PlanOverview({ detail }: { detail: { plan: { objective: string; phase: string; version: number; steps?: unknown[] } } }) {
  const p = detail.plan
  return (
    <div className="rounded border border-blue-400/20 bg-blue-500/5 p-2">
      <p className="mb-1 text-[10px] font-medium uppercase text-blue-400">计划文档</p>
      <p className="text-[11px] line-clamp-3">{p.objective}</p>
      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-(--ui-text-secondary)">
        <span>阶段: {PLAN_PHASE_LABELS[p.phase] || p.phase}</span>
        <span>v{p.version}</span>
      </div>
    </div>
  )
}

function GoalOverview({ detail }: { detail: { contract: { objective: string; successCriteria?: unknown[] }; completionStatus: { passedCount?: number; totalCriteria?: number } } }) {
  const c = detail.contract
  const status = detail.completionStatus
  return (
    <div className="rounded border border-emerald-400/20 bg-emerald-500/5 p-2">
      <p className="mb-1 text-[10px] font-medium uppercase text-emerald-400">目标契约</p>
      <p className="text-[11px] line-clamp-3">{c.objective}</p>
      <div className="mt-1.5 text-[10px] text-(--ui-text-secondary)">
        进度: {status.passedCount || 0}/{status.totalCriteria || (c.successCriteria?.length || 0)} 标准通过
      </div>
    </div>
  )
}

function CreativeOverview({ detail }: { detail: { contract: { workIdentity: string; creativeIntent: string; currentMilestone: string; autonomyLevel: string }; blackboard: { candidateActions?: unknown[] } } }) {
  const c = detail.contract
  return (
    <div className="rounded border border-purple-400/20 bg-purple-500/5 p-2">
      <p className="mb-1 text-[10px] font-medium uppercase text-purple-400">创作契约</p>
      <p className="text-[11px] font-medium">{c.workIdentity}</p>
      <p className="text-[10px] text-(--ui-text-secondary) line-clamp-2">{c.creativeIntent}</p>
      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-(--ui-text-secondary)">
        <span>里程碑: {c.currentMilestone}</span>
        <span>自治: {c.autonomyLevel}</span>
      </div>
    </div>
  )
}

function PlanProgress({ detail }: { detail: { plan: { phase: string; steps?: Array<{ title: string; status?: string }> } } }) {
  const p = detail.plan
  const phases = ['draft', 'investigating', 'structuring', 'validating', 'ready_for_review', 'revised', 'converted']
  const currentIdx = phases.indexOf(p.phase)
  return (
    <div>
      <div className="mb-3 flex items-center gap-1">
        {phases.map((ph, i) => (
          <div key={ph} className="flex flex-1 items-center">
            <div className={cn(
              'h-2 flex-1 rounded-full',
              i < currentIdx ? 'bg-blue-400' : i === currentIdx ? 'bg-blue-400/60 animate-pulse' : 'bg-(--ui-surface-secondary)'
            )} />
          </div>
        ))}
      </div>
      <div className="space-y-1">
        {(p.steps || []).slice(0, 10).map((step, i) => (
          <div key={i} className="flex items-center gap-2 rounded bg-(--ui-surface-secondary) px-2 py-1 text-[11px]">
            <span className={cn(
              'flex h-4 w-4 items-center justify-center rounded-full text-[9px]',
              step.status === 'done' ? 'bg-emerald-500 text-white' : 'bg-(--ui-stroke-secondary)'
            )}>
              {step.status === 'done' ? <Codicon name="check" size="0.6rem" /> : i + 1}
            </span>
            <span className={cn(step.status === 'done' && 'line-through text-(--ui-text-secondary)')}>{step.title}</span>
          </div>
        ))}
        {(!p.steps || p.steps.length === 0) && (
          <p className="text-center text-[11px] text-(--ui-text-secondary) py-2">尚未定义步骤</p>
        )}
      </div>
    </div>
  )
}

function GoalProgress({ detail }: { detail: { contract: { successCriteria: Array<{ description: string; status: string; required?: boolean }>; actionCount?: number; evidenceCount?: number } } }) {
  const c = detail.contract
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 text-center">
        <StatBox label="Actions" value={String(c.actionCount || 0)} />
        <StatBox label="Evidence" value={String(c.evidenceCount || 0)} />
        <StatBox label="Criteria" value={String(c.successCriteria?.length || 0)} />
      </div>
      {(c.successCriteria || []).map((crit, i) => {
        const passed = crit.status === 'passed'
        const failed = crit.status === 'failed'
        const blocked = crit.status === 'blocked'
        const waiting = crit.status === 'waiting_user'
        return (
          <div key={i} className={cn(
            'flex items-start gap-2 rounded border px-2 py-1.5 text-[11px]',
            passed ? 'border-emerald-400/30 bg-emerald-500/5' :
              failed ? 'border-red-400/30 bg-red-500/5' :
                blocked ? 'border-red-400/20 bg-red-500/5' :
                  waiting ? 'border-amber-400/30 bg-amber-500/5' :
                    'border-(--ui-stroke-secondary) bg-(--ui-surface-secondary)'
          )}>
            <Codicon
              name={passed ? 'pass' : failed ? 'error' : blocked ? 'circle-slash' : waiting ? 'clock' : 'circle-large-outline'}
              size="0.8rem"
              className={cn('mt-0.5 shrink-0',
                passed ? 'text-emerald-400' : failed ? 'text-red-400' : blocked ? 'text-red-400' : waiting ? 'text-amber-400' : 'text-(--ui-text-secondary)'
              )}
            />
            <div className="flex-1">
              <p className={cn(passed && 'line-through text-(--ui-text-secondary)')}>{crit.description}</p>
              {crit.required === false && <span className="text-[9px] text-(--ui-text-disabled)">(可选)</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CreativeProgress({ detail }: { detail: { blackboard: { currentTensions?: string[]; openQuestions?: string[]; candidateActions?: Array<{ description?: string; riskLevel?: string }>; acceptedDecisions?: unknown[]; currentMilestone?: string }; contract: { nonNegotiables?: string[]; currentMilestone?: string } } }) {
  const bb = detail.blackboard
  const c = detail.contract
  return (
    <div className="space-y-3">
      <div className="rounded border border-purple-400/20 bg-purple-500/5 p-2 text-center">
        <p className="text-[10px] text-(--ui-text-secondary)">当前里程碑</p>
        <p className="text-xs font-medium text-purple-300">{bb.currentMilestone || c.currentMilestone}</p>
      </div>

      {(bb.currentTensions || []).length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-medium uppercase text-amber-400">张力 ({(bb.currentTensions || []).length})</p>
          {(bb.currentTensions || []).slice(0, 5).map((t, i) => (
            <div key={i} className="mb-1 rounded bg-amber-500/10 px-2 py-1 text-[10px]">{String(t)}</div>
          ))}
        </div>
      )}

      {(bb.candidateActions || []).slice(-3).reverse().map((cand: any, i) => (
        <div key={i} className="rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) p-2 text-[11px]">
          <div className="flex items-center gap-1">
            <span className={cn(
              'rounded px-1 text-[9px]',
              cand.riskLevel === 'high' ? 'bg-red-500/20 text-red-400' :
                cand.riskLevel === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-emerald-500/20 text-emerald-400'
            )}>{cand.riskLevel || 'low'}</span>
            <span className="flex-1 truncate">{cand.description || 'Candidate'}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) p-2">
      <p className="text-lg font-semibold">{value}</p>
      <p className="text-[9px] uppercase text-(--ui-text-secondary)">{label}</p>
    </div>
  )
}
