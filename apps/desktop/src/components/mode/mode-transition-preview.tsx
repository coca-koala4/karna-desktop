import { useState, useEffect } from 'react'
import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'
import { modeApi } from '@/lib/mode-api'
import type { AgentModeId, AgentModeSession } from '@/types/mode'

const MODE_META: Record<AgentModeId, { label: string; icon: string; color: string; desc: string; capabilities: string[] }> = {
  direct: {
    label: '直接模式', icon: 'zap', color: 'text-(--ui-color-accent)',
    desc: '即时问答，无需结构化流程',
    capabilities: ['即时响应', '自由对话', '无状态', '快速迭代']
  },
  plan: {
    label: '计划模式', icon: 'circuit-board', color: 'text-blue-400',
    desc: '先制定详细计划再执行，支持调查、结构化、审阅',
    capabilities: ['7阶段计划流程', '只读调查', '事实核实', '风险识别', '可审阅可修订', '可转为Goal/Living Work']
  },
  goal: {
    label: '目标模式', icon: 'target', color: 'text-emerald-400',
    desc: '定义可验证成功标准，自主执行直到目标达成',
    capabilities: ['Goal Contract契约', '5类验证方法', 'Evidence证据台账', 'Failed Approaches抑制', 'Alignment Check防漂移', 'Blocked/Waiting状态正确处理']
  },
  living_work: {
    label: '作品演化', icon: 'edit', color: 'text-purple-400',
    desc: 'Creative作品持续演化，保护留白、尊重不可违背约束',
    capabilities: ['黑板协作模型', '8 维影响分析', '不可妥协约束保护', '受保护的歧义留白', '提案审批写回', '交还作者', '三档自治级别']
  }
}

const TRANSITION_COMPATIBILITY: Record<AgentModeId, Partial<Record<AgentModeId, { compatible: boolean; notes: string[]; dataMigration: string[] }>>> = {
  direct: {
    plan: { compatible: true, notes: ['对话上下文将作为调查输入'], dataMigration: ['保留消息历史'] },
    goal: { compatible: true, notes: ['从当前对话推断目标'], dataMigration: ['保留消息历史'] },
    living_work: { compatible: true, notes: ['将作为作品初始状态'], dataMigration: ['保留消息历史'] }
  },
  plan: {
    direct: { compatible: true, notes: ['计划文档将保留作为参考'], dataMigration: ['PlanDocument归档', '保留绑定资源'] },
    goal: { compatible: true, notes: ['从计划步骤生成Success Criteria'], dataMigration: ['PlanDocument转为GoalContract', 'confirmedFacts作为假设', 'steps作为初始行动列表'] },
    living_work: { compatible: true, notes: ['计划将作为作品演化方向'], dataMigration: ['objective转为creativeIntent', 'constraints转为nonNegotiables'] }
  },
  goal: {
    direct: { compatible: true, notes: ['Goal契约作为参考保留'], dataMigration: ['GoalContract归档', '保留evidence'] },
    plan: { compatible: true, notes: ['重新规划，目标作为约束'], dataMigration: ['objective保留', 'failedApproaches作为风险'] },
    living_work: { compatible: false, notes: ['Goal模式强调确定性验证，Living Work是创造性演化'], dataMigration: [] }
  },
  living_work: {
    direct: { compatible: true, notes: ['作品状态将保留'], dataMigration: ['Blackboard快照归档', '保留checkpoint'] },
    plan: { compatible: true, notes: ['对当前作品状态做规划'], dataMigration: ['workIdentity作为上下文', 'openQuestions作为调查目标'] },
    goal: { compatible: false, notes: ['作品演化不适合确定性Goal模式（会破坏留白）'], dataMigration: [] }
  }
}

export interface ModeTransitionPreviewProps {
  fromSessionId?: string | null
  fromMode?: AgentModeId | null
  toMode: AgentModeId | null
  open: boolean
  onClose: () => void
  onConfirm: (toMode: AgentModeId) => void
}

export function ModeTransitionPreview({ fromSessionId, fromMode, toMode, open, onClose, onConfirm }: ModeTransitionPreviewProps) {
  const [session, setSession] = useState<AgentModeSession | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open || !fromSessionId) { setSession(null); return }
    setLoading(true)
    modeApi.get(fromSessionId).then(s => {
      if (!('error' in s)) setSession(s)
    }).finally(() => setLoading(false))
  }, [open, fromSessionId])

  if (!open || !toMode) return null

  const effectiveFromMode = fromMode || session?.mode || 'direct'
  const fromMeta = MODE_META[effectiveFromMode]
  const toMeta = MODE_META[toMode]
  const compat = TRANSITION_COMPATIBILITY[effectiveFromMode]?.[toMode]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-[560px] max-w-[90vw] rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-surface) shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-(--ui-stroke-secondary) p-4">
          <h3 className="text-sm font-semibold">模式转换预览</h3>
          <button type="button" className="text-(--ui-text-secondary) hover:text-foreground" onClick={onClose}>
            <Codicon name="close" size="1rem" />
          </button>
        </div>

        <div className="p-5">
          <div className="mb-5 flex items-center justify-center gap-4">
            <ModeBadge meta={fromMeta} />
            <div className="flex flex-col items-center">
              <Codicon name="arrow-right" size="1.2rem" className="text-(--ui-text-secondary)" />
              <span className="text-[10px] text-(--ui-text-secondary) mt-1">转换</span>
            </div>
            <ModeBadge meta={toMeta} highlight />
          </div>

          {compat && (
            <div className={cn(
              'mb-4 rounded border p-3',
              compat.compatible
                ? 'border-emerald-400/30 bg-emerald-500/5'
                : 'border-red-400/30 bg-red-500/5'
            )}>
              <div className="flex items-center gap-2 mb-2">
                <Codicon
                  name={compat.compatible ? 'check' : 'warning'}
                  size="0.9rem"
                  className={compat.compatible ? 'text-emerald-400' : 'text-red-400'}
                />
                <span className={cn('text-xs font-medium', compat.compatible ? 'text-emerald-300' : 'text-red-300')}>
                  {compat.compatible ? '转换可行' : '不推荐转换'}
                </span>
              </div>
              {compat.notes.map((note, i) => (
                <p key={i} className="text-[11px] text-(--ui-text-secondary) mb-1">• {note}</p>
              ))}
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-4">
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase text-(--ui-text-secondary)">当前模式能力</p>
              <ul className="space-y-1">
                {fromMeta.capabilities.map(cap => (
                  <li key={cap} className="flex items-center gap-1.5 text-[11px] text-(--ui-text-secondary)">
                    <Codicon name="check" size="0.7rem" className="text-(--ui-text-secondary)" />
                    {cap}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-medium uppercase text-(--ui-text-secondary)">目标模式能力</p>
              <ul className="space-y-1">
                {toMeta.capabilities.map(cap => (
                  <li key={cap} className="flex items-center gap-1.5 text-[11px]">
                    <Codicon name="add" size="0.7rem" className="text-(--ui-color-accent)" />
                    {cap}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {compat && compat.dataMigration.length > 0 && (
            <div className="mb-4 rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) p-3">
              <p className="mb-2 text-[10px] font-medium uppercase text-(--ui-text-secondary)">
                <Codicon name="file-symlink-file" size="0.7rem" className="mr-1 inline" />
                数据迁移
              </p>
              <ul className="space-y-1">
                {compat.dataMigration.map((item, i) => (
                  <li key={i} className="text-[11px] text-(--ui-text-secondary)">
                    <Codicon name="chevron-right" size="0.7rem" className="mr-1 inline" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {session && (
            <div className="mb-4 rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) p-2">
              <p className="mb-1 text-[10px] text-(--ui-text-secondary)">源会话</p>
              <p className="text-[11px] font-mono">{session.id.slice(0, 20)} · v{session.stateVersion}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-(--ui-stroke-secondary) p-4">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-xs text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            disabled={!compat?.compatible}
            className={cn(
              'rounded px-4 py-1.5 text-xs font-medium text-white transition-colors',
              compat?.compatible
                ? 'bg-(--ui-color-accent) hover:opacity-90'
                : 'bg-(--ui-text-disabled) cursor-not-allowed'
            )}
            onClick={() => { onConfirm(toMode); onClose() }}
          >
            确认转换
          </button>
        </div>
      </div>
    </div>
  )
}

function ModeBadge({ meta, highlight }: { meta: { label: string; icon: string; color: string; desc: string }; highlight?: boolean }) {
  return (
    <div className={cn(
      'flex w-40 flex-col items-center rounded-lg border p-3 text-center transition-colors',
      highlight ? 'border-(--ui-color-accent)/40 bg-(--ui-color-accent)/5' : 'border-(--ui-stroke-secondary) bg-(--ui-surface-secondary)'
    )}>
      <Codicon name={meta.icon as any} size="1.4rem" className={cn('mb-2', meta.color)} />
      <p className="text-xs font-medium">{meta.label}</p>
      <p className="mt-1 text-[10px] text-(--ui-text-secondary) line-clamp-2">{meta.desc}</p>
    </div>
  )
}
