import { useMemo, useState } from 'react'
import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'
import { normalizeCriticCouncilPayload, type NormalizedCriticCouncil, type NormalizedCriticFinding, type NormalizedCriticLens } from '@/lib/critic-council-normalize'

type CriticTab = 'overview' | 'lenses' | 'findings' | 'raw'

const LEVEL_COLORS: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/20',
  warning: 'text-amber-400 bg-amber-500/20',
  info: 'text-(--ui-text-secondary) bg-(--ui-surface-tertiary)'
}

const LEVEL_LABELS: Record<string, string> = {
  critical: '严重',
  warning: '中等',
  info: '提示'
}

const STATUS_COLORS: Record<string, string> = {
  clear: 'text-green-400',
  ok_with_notes: 'text-blue-400',
  needs_revision: 'text-amber-400',
  critical: 'text-red-400'
}

const STATUS_LABELS: Record<string, string> = {
  clear: '无问题',
  ok_with_notes: '有备注',
  needs_revision: '需修订',
  critical: '严重问题'
}

interface CriticCouncilViewProps {
  data: unknown
}

export function CriticCouncilView({ data }: CriticCouncilViewProps) {
  return (
    <CriticErrorBoundary>
      <CriticCouncilContent data={data} />
    </CriticErrorBoundary>
  )
}

interface CriticErrorBoundaryProps {
  children: ReactNode
}

interface CriticErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class CriticErrorBoundary extends Component<CriticErrorBoundaryProps, CriticErrorBoundaryState> {
  constructor(props: CriticErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): CriticErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[CriticCouncil] Error caught by boundary:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Codicon name="comment-discussion" size="1rem" />
            <h3 className="text-sm font-medium">批评委员会</h3>
          </div>
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <div className="flex items-start gap-3">
              <Codicon className="mt-0.5 text-red-400" name="error" size="1rem" />
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-red-400">加载失败</h4>
                <p className="text-xs text-red-400/80">
                  批评委员会数据格式异常，无法正常显示。
                </p>
                {this.state.error?.message && (
                  <p className="text-xs text-red-400/60 font-mono">
                    {this.state.error.message}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    className="rounded border border-red-500/30 px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"
                    onClick={this.handleRetry}
                    type="button"
                  >
                    重试
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

function CriticCouncilContent({ data }: CriticCouncilViewProps) {
  const council = useMemo(() => normalizeCriticCouncilPayload(data), [data])
  const [activeTab, setActiveTab] = useState<CriticTab>('overview')
  const [activeLens, setActiveLens] = useState<string | null>(null)

  const allFindings = useMemo(() => {
    return council.lenses.flatMap(l => l.findings)
  }, [council])

  const findingsByLevel = useMemo(() => {
    const grouped: Record<string, NormalizedCriticFinding[]> = { critical: [], warning: [], info: [] }
    allFindings.forEach(f => {
      if (grouped[f.level]) {
        grouped[f.level].push(f)
      }
    })
    return grouped
  }, [allFindings])

  const tabs: Array<{ id: CriticTab; label: string; icon: string; count?: number }> = [
    { id: 'overview', label: '概览', icon: 'dashboard' },
    { id: 'lenses', label: '评审视角', icon: 'eye', count: council.lenses.length },
    { id: 'findings', label: '全部发现', icon: 'warning', count: council.summary.findings },
    { id: 'raw', label: '原始', icon: 'json' }
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Codicon name="comment-discussion" size="1rem" />
        <h3 className="text-sm font-medium">批评委员会</h3>
        {council.summary.status && (
          <span className={cn(
            'ml-auto rounded px-2 py-0.5 text-[10px] font-medium',
            STATUS_COLORS[council.summary.status] || 'text-(--ui-text-secondary)'
          )}>
            {STATUS_LABELS[council.summary.status] || council.summary.status}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-(--ui-stroke-secondary) pb-2">
        {tabs.map(tab => (
          <button
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
              activeTab === tab.id
                ? 'bg-(--ui-control-active-background) text-foreground'
                : 'text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
            )}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            <Codicon name={tab.icon} size="0.75rem" />
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className="rounded bg-(--ui-surface-tertiary) px-1 text-[10px] text-(--ui-text-quaternary)">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="max-h-[350px] overflow-auto">
        {activeTab === 'overview' && <Overview council={council} findingsByLevel={findingsByLevel} />}
        {activeTab === 'lenses' && <LensesView lenses={council.lenses} activeLens={activeLens} setActiveLens={setActiveLens} />}
        {activeTab === 'findings' && <FindingsList findings={allFindings} />}
        {activeTab === 'raw' && <RawJsonView data={data} />}
      </div>
    </div>
  )
}

function Overview({ council, findingsByLevel }: { council: NormalizedCriticCouncil; findingsByLevel: Record<string, NormalizedCriticFinding[]> }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-2">
        <StatCard label="总发现" value={council.summary.findings} icon="warning" />
        <StatCard label="严重" value={council.summary.critical} icon="error" color="text-red-400" />
        <StatCard label="中等" value={council.summary.warning} icon="warning" color="text-amber-400" />
        <StatCard label="视角" value={council.lenses.length} icon="eye" />
      </div>

      <div>
        <div className="mb-2 text-[11px] font-medium text-(--ui-text-secondary)">按严重程度</div>
        <div className="space-y-1">
          {(['critical', 'warning', 'info'] as const).map(level => (
            <div key={level} className="flex items-center gap-2">
              <span className={cn(
                'w-12 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px]',
                LEVEL_COLORS[level]
              )}>
                {LEVEL_LABELS[level]}
              </span>
              <div className="flex-1">
                <div className="h-2 rounded bg-(--ui-surface-tertiary)">
                  <div
                    className={cn(
                      'h-full rounded',
                      level === 'critical' && 'bg-red-400',
                      level === 'warning' && 'bg-amber-400',
                      level === 'info' && 'bg-(--ui-text-quaternary)'
                    )}
                    style={{
                      width: `${findingsByLevel[level]?.length ? (findingsByLevel[level].length / Math.max(council.summary.findings, 1)) * 100 : 0}%`
                    }}
                  />
                </div>
              </div>
              <span className="w-6 text-right text-[11px] text-(--ui-text-quaternary">
                {findingsByLevel[level]?.length || 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      {council.lenses.length > 0 && (
        <div>
          <div className="mb-2 text-[11px] font-medium text-(--ui-text-secondary)">评审视角状态</div>
          <div className="space-y-1">
            {council.lenses.map(lens => (
              <div key={lens.id} className="flex items-center gap-2 rounded bg-(--ui-surface-tertiary) p-2">
                <span className="text-xs font-medium text-(--ui-text-primary)">{lens.name}</span>
                <span className="ml-auto text-[10px] text-(--ui-text-quaternary)">
                  {lens.findings.length} 个发现
                </span>
                <span className={cn(
                  'rounded px-1.5 py-0.5 text-[10px]',
                  STATUS_COLORS[lens.status] || 'text-(--ui-text-secondary)'
                )}>
                  {STATUS_LABELS[lens.status] || lens.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: string; color?: string }) {
  return (
    <div className="rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-tertiary) p-2 text-center">
      <Codicon className={cn('mx-auto mb-1', color || 'text-(--ui-text-quaternary)')} name={icon} size="1rem" />
      <div className={cn('text-lg font-bold', color || 'text-foreground')}>{value}</div>
      <div className="text-[10px] text-(--ui-text-quaternary)">{label}</div>
    </div>
  )
}

function LensesView({ lenses, activeLens, setActiveLens }: { lenses: NormalizedCriticLens[]; activeLens: string | null; setActiveLens: (id: string | null) => void }) {
  const selectedLens = lenses.find(l => l.id === activeLens)

  if (lenses.length === 0) {
    return <EmptyState text="暂无评审视角" />
  }

  return (
    <div className="flex gap-2">
      <div className="w-1/3 space-y-1">
        {lenses.map(lens => (
          <button
            className={cn(
              'flex w-full items-center gap-2 rounded p-2 text-left transition-colors',
              activeLens === lens.id
                ? 'bg-(--ui-control-active-background)'
                : 'hover:bg-(--ui-control-hover-background)'
            )}
            key={lens.id}
            onClick={() => setActiveLens(lens.id)}
            type="button"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-(--ui-text-primary)">
                {lens.name}
              </div>
              <div className="truncate text-[10px] text-(--ui-text-quaternary)">
                {lens.findings.length} 个发现
              </div>
            </div>
            <span className={cn(
              'shrink-0 text-[10px]',
              STATUS_COLORS[lens.status] || 'text-(--ui-text-secondary)'
            )}>
              ●
            </span>
          </button>
        ))}
      </div>

      <div className="w-2/3">
        {selectedLens ? (
          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium text-(--ui-text-primary)">{selectedLens.name}</div>
              <div className="text-[11px] text-(--ui-text-secondary)">{selectedLens.focus || '—'}</div>
            </div>

            {selectedLens.findings.length > 0 ? (
              <div className="space-y-2">
                {selectedLens.findings.map(finding => (
                  <FindingCard key={finding.id} finding={finding} />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center py-4 text-xs text-(--ui-text-quaternary)">
                暂无发现
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-(--ui-text-quaternary)">
            选择一个视角查看详情
          </div>
        )}
      </div>
    </div>
  )
}

function FindingsList({ findings }: { findings: NormalizedCriticFinding[] }) {
  if (findings.length === 0) {
    return <EmptyState text="暂无发现" />
  }

  return (
    <div className="space-y-2">
      {findings.map(finding => (
        <FindingCard key={finding.id} finding={finding} />
      ))}
    </div>
  )
}

function FindingCard({ finding }: { finding: NormalizedCriticFinding }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-tertiary)">
      <button
        className="flex w-full items-start gap-2 p-2 text-left"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <span className={cn(
          'mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px]',
          LEVEL_COLORS[finding.level] || LEVEL_COLORS['info']
        )}>
          {LEVEL_LABELS[finding.level] || finding.level}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-(--ui-text-primary)">
            {finding.title}
          </div>
          <div className="text-[10px] text-(--ui-text-quaternary)">
            {finding.lens || finding.description?.slice(0, 50) || ''}
          </div>
        </div>
        <Codicon
          className={cn(
            'mt-0.5 shrink-0 text-(--ui-text-quaternary) transition-transform',
            expanded && 'rotate-90'
          )}
          name="chevron-right"
          size="0.75rem"
        />
      </button>

      {expanded && (
        <div className="border-t border-(--ui-stroke-secondary) p-2">
          {finding.description && (
            <div className="mb-2">
              <p className="text-xs text-(--ui-text-secondary)">{finding.description}</p>
            </div>
          )}

          {finding.suggestion && (
            <div className="mb-2">
              <div className="mb-1 text-[10px] font-medium text-(--ui-text-secondary)">建议</div>
              <p className="text-xs text-(--ui-text-secondary)">{finding.suggestion}</p>
            </div>
          )}

          {finding.evidence && finding.evidence.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-medium text-(--ui-text-secondary)">证据</div>
              <div className="space-y-1">
                {finding.evidence.map((ev, idx) => (
                  <code key={idx} className="block truncate rounded bg-(--ui-surface-secondary) px-2 py-1 text-[10px] text-(--ui-text-quaternary)">
                    {ev}
                  </code>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-xs text-(--ui-text-quaternary)">
      {text}
    </div>
  )
}

function RawJsonView({ data }: { data: unknown }) {
  return (
    <pre className="rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-tertiary) p-3 font-mono text-xs leading-relaxed">
      <code className="text-(--ui-text-secondary)">
        {JSON.stringify(data, null, 2)}
      </code>
    </pre>
  )
}
