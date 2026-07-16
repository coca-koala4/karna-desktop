import { useMemo, useState } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

interface BenchmarkCheck {
  id: string
  title: string
  ok: boolean
  score: number
  detail?: string
}

interface BenchmarkRun {
  id: string
  project_id?: string
  at: string
  score?: number
  readiness_score?: number
  maturity_score?: number
  maturity_gaps?: string[]
  passed: number
  total: number
  checks?: BenchmarkCheck[]
}

interface BenchmarkData {
  version?: number
  project_id?: string
  runs?: BenchmarkRun[]
}

type BenchmarkTab = 'overview' | 'checks' | 'history' | 'raw'

export function BenchmarkView({ data }: { data: unknown }) {
  const benchmark = (data as { runs?: BenchmarkRun[] }) || (data as BenchmarkData)
  const runs = benchmark.runs || []
  const latestRun = runs[0]
  const [activeTab, setActiveTab] = useState<BenchmarkTab>('overview')

  const passedChecks = useMemo(() => {
    return latestRun?.checks?.filter(c => c.ok) || []
  }, [latestRun])

  const failedChecks = useMemo(() => {
    return latestRun?.checks?.filter(c => !c.ok) || []
  }, [latestRun])

  const tabs: Array<{ id: BenchmarkTab; label: string; icon: string }> = [
    { id: 'overview', label: '概览', icon: 'dashboard' },
    { id: 'checks', label: '检查项', icon: 'checklist' },
    { id: 'history', label: '历史', icon: 'history' },
    { id: 'raw', label: '原始', icon: 'json' }
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Codicon name="checklist" size="1rem" />
        <h3 className="text-sm font-medium">基准测试</h3>
        {latestRun && (
          <span className="ml-auto text-xs text-(--ui-text-quaternary)">
            {new Date(latestRun.at).toLocaleString()}
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
          </button>
        ))}
      </div>

      <div className="max-h-[350px] overflow-auto">
        {activeTab === 'overview' && <Overview run={latestRun} />}
        {activeTab === 'checks' && <ChecksView passed={passedChecks} failed={failedChecks} />}
        {activeTab === 'history' && <HistoryView runs={runs} />}
        {activeTab === 'raw' && <RawJsonView data={data} />}
      </div>
    </div>
  )
}

function Overview({ run }: { run: BenchmarkRun | undefined }) {
  if (!run) {
    return <EmptyState text="暂无测试数据" />
  }

  const passRate = run.total > 0 ? Math.round((run.passed / run.total) * 100) : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="总分"
          value={run.score !== undefined ? run.score.toFixed(2) : '-'}
          icon="star"
          color="text-amber-400"
        />
        <StatCard
          label="就绪度"
          value={run.readiness_score !== undefined ? `${Math.round(run.readiness_score * 100)}%` : '-'}
          icon="check"
          color="text-green-400"
        />
        <StatCard
          label="成熟度"
          value={run.maturity_score !== undefined ? `${Math.round(run.maturity_score * 100)}%` : '-'}
          icon="trophy"
          color="text-blue-400"
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium text-(--ui-text-secondary)">通过率</span>
          <span className="text-[11px] text-(--ui-text-quaternary">
            {run.passed} / {run.total}
          </span>
        </div>
        <div className="h-3 rounded bg-(--ui-surface-tertiary)">
          <div
            className="h-full rounded bg-gradient-to-r from-green-400 to-emerald-400 transition-all"
            style={{ width: `${passRate}%` }}
          />
        </div>
      </div>

      {run.maturity_gaps && run.maturity_gaps.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] font-medium text-(--ui-text-secondary)">成熟度差距</div>
          <div className="space-y-1">
            {run.maturity_gaps.slice(0, 5).map((gap, idx) => (
              <div
                className="flex items-center gap-2 rounded bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-400"
                key={idx}
              >
                <Codicon name="warning" size="0.75rem" />
                <span className="truncate">{gap}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: string; color?: string }) {
  return (
    <div className="rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-tertiary) p-3 text-center">
      <Codicon className={cn('mx-auto mb-1', color || 'text-(--ui-text-quaternary)')} name={icon} size="1.125rem" />
      <div className={cn('text-lg font-bold', color || 'text-foreground')}>{value}</div>
      <div className="text-[10px] text-(--ui-text-quaternary)">{label}</div>
    </div>
  )
}

function ChecksView({ passed, failed }: { passed: BenchmarkCheck[]; failed: BenchmarkCheck[] }) {
  const [showPassed, setShowPassed] = useState(true)

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button
          className={cn(
            'flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-[11px] transition-colors',
            !showPassed
              ? 'bg-(--ui-control-active-background) text-foreground'
              : 'text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)'
          )}
          onClick={() => setShowPassed(false)}
          type="button"
        >
          <Codicon name="error" size="0.75rem" />
          未通过 ({failed.length})
        </button>
        <button
          className={cn(
            'flex flex-1 items-center justify-center gap-1 rounded px-2 py-1.5 text-[11px] transition-colors',
            showPassed
              ? 'bg-(--ui-control-active-background) text-foreground'
              : 'text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background)'
          )}
          onClick={() => setShowPassed(true)}
          type="button"
        >
          <Codicon name="check" size="0.75rem" />
          已通过 ({passed.length})
        </button>
      </div>

      <div className="space-y-1">
        {(showPassed ? passed : failed).map(check => (
          <div
            key={check.id}
            className={cn(
              'flex items-start gap-2 rounded p-2',
              check.ok ? 'bg-green-500/10' : 'bg-red-500/10'
            )}
          >
            <Codicon
              className={cn(
                'mt-0.5 shrink-0',
                check.ok ? 'text-green-400' : 'text-red-400'
              )}
              name={check.ok ? 'check' : 'error'}
              size="0.75rem"
            />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-(--ui-text-primary)">
                {check.title}
              </div>
              {check.detail && (
                <div className="mt-0.5 text-[10px] text-(--ui-text-secondary)">
                  {check.detail}
                </div>
              )}
            </div>
            <div className="shrink-0 text-[10px] text-(--ui-text-quaternary">
              {check.score.toFixed(1)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function HistoryView({ runs }: { runs: BenchmarkRun[] }) {
  if (runs.length === 0) {
    return <EmptyState text="暂无历史记录" />
  }

  return (
    <div className="space-y-1">
      {runs.map(run => (
        <div
          key={run.id}
          className="flex items-center gap-3 rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-tertiary) p-2"
        >
          <div className="text-center">
            <div className="text-lg font-bold text-(--ui-text-primary)">
              {run.total > 0 ? Math.round((run.passed / run.total) * 100) : 0}%
            </div>
            <div className="text-[10px] text-(--ui-text-quaternary)">
              {run.passed}/{run.total}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs text-(--ui-text-primary)">
              {run.id}
            </div>
            <div className="text-[10px] text-(--ui-text-quaternary)">
              {new Date(run.at).toLocaleString()}
            </div>
          </div>
        </div>
      ))}
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
