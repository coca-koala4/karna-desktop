import * as React from 'react'

import { cn } from '@/lib/utils'

/**
 * Karna Writer OS — shared workshop primitives.
 *
 * Style goal: VSCode-grade square radius (≈3px), generous padding, hairline
 * borders, single muted gradient background, no emoji, no decoration. Reads
 * like a tool, not a landing page. All primitives honour `data-slot` so
 * future E2E selectors stay stable.
 */

// --- Page shell --------------------------------------------------------------

interface WorkshopShellProps {
  children: React.ReactNode
  description?: React.ReactNode
  right?: React.ReactNode
  title: string
}

export function WorkshopShell({ children, description, right, title }: WorkshopShellProps) {
  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--theme-background-seed)] text-[var(--theme-foreground)]">
      <header className="relative flex flex-wrap items-start justify-between gap-4 border-b border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 px-6 py-5 backdrop-blur-md before:absolute before:inset-x-0 before:bottom-0 before:h-px before:opacity-70">
        <div className="relative pl-3">
          <span className="absolute inset-y-0 left-0 w-[3px] rounded-r-sm bg-[var(--theme-primary)]" />
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--theme-foreground)]/60">{description}</p> : null}
        </div>
        {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
      </header>
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </main>
  )
}

// --- Tabs --------------------------------------------------------------------

export interface WorkshopTab {
  badge?: React.ReactNode
  count?: number
  id: string
  label: string
}

interface WorkshopTabsProps {
  active: string
  onChange: (id: string) => void
  right?: React.ReactNode
  tabs: WorkshopTab[]
}

export function WorkshopTabs({ active, onChange, right, tabs }: WorkshopTabsProps) {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 px-6 py-1.5 backdrop-blur">
      <div className="flex items-center gap-0.5 overflow-x-auto" role="tablist">
        {tabs.map(tab => {
          const isActive = active === tab.id

          return (
            <button
              aria-selected={isActive}
              className={cn(
                'group relative flex shrink-0 items-center gap-1.5 rounded-t-[3px] px-3 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'text-[var(--theme-foreground)] after:absolute after:inset-x-0 after:-bottom-px after:h-[2px] after:bg-[var(--theme-primary)] after:content-[""]'
                  : 'text-[var(--theme-foreground)]/60 hover:text-[var(--theme-foreground)]'
              )}
              key={tab.id}
              onClick={() => onChange(tab.id)}
              role="tab"
            >
              {tab.label}
              {typeof tab.count === 'number' && tab.count > 0 ? (
                <span className="rounded-sm bg-[var(--theme-secondary)]/50 px-1 py-px text-[0.6rem] font-mono leading-none text-[var(--theme-foreground)]/60">
                  {tab.count}
                </span>
              ) : null}
              {tab.badge}
            </button>
          )
        })}
      </div>
      {right ? <div className="flex items-center gap-2">{right}</div> : null}
    </div>
  )
}

// --- Panel -------------------------------------------------------------------

interface WorkshopPanelProps {
  actions?: React.ReactNode
  children: React.ReactNode
  description?: React.ReactNode
  meta?: React.ReactNode
  title: React.ReactNode
  variant?: 'default' | 'ghost' | 'success' | 'warning' | 'danger'
}

const PANEL_VARIANT: Record<NonNullable<WorkshopPanelProps['variant']>, string> = {
  default: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/85',
  ghost: 'border-[var(--dt-border)] bg-transparent',
  success: 'border-[var(--theme-primary)]/25 bg-[var(--theme-primary)]/5',
  warning: 'border-[var(--theme-secondary)]/30 bg-[var(--theme-secondary)]/5',
  danger: 'border-[var(--dt-destructive)]/30 bg-[var(--dt-destructive)]/5'
}

export function WorkshopPanel({ actions, children, description, meta, title, variant = 'default' }: WorkshopPanelProps) {
  return (
    <section
      className={cn(
        'rounded-[3px] border shadow-sm backdrop-blur-sm',
        PANEL_VARIANT[variant]
      )}
      data-slot="karna-panel"
    >
      <header className="flex items-start justify-between gap-3 border-b border-[var(--dt-border)]/60 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-[0.78rem] font-semibold uppercase tracking-wide text-[var(--theme-foreground)]/80">
            {title}
          </h2>
          {description ? <p className="mt-1 text-xs text-[var(--theme-foreground)]/60">{description}</p> : null}
        </div>
        {(actions || meta) ? <div className="flex shrink-0 items-center gap-2">{meta}{actions}</div> : null}
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  )
}

// --- Metric tile -------------------------------------------------------------

export function WorkshopMetric({ accent, hint, label, value }: { accent?: 'emerald' | 'amber' | 'rose' | 'sky' | 'violet'; hint?: React.ReactNode; label: string; value: React.ReactNode }) {
  const dot: Record<NonNullable<typeof accent>, string> = {
    emerald: 'bg-[var(--theme-primary)]/80',
    amber: 'bg-[var(--theme-secondary)]/80',
    rose: 'bg-[var(--dt-destructive)]/80',
    sky: 'bg-[var(--theme-accent-soft)]/80',
    violet: 'bg-[var(--theme-primary)]/70'
  }

  return (
    <div className="flex flex-col gap-1 rounded-[3px] border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/85 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[0.65rem] font-medium uppercase tracking-wider text-[var(--theme-foreground)]/60">
        {accent ? <span className={cn('inline-block size-1.5 rounded-full', dot[accent])} /> : null}
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums text-[var(--theme-foreground)]">{value}</div>
      {hint ? <div className="text-[0.65rem] text-[var(--theme-foreground)]/60">{hint}</div> : null}
    </div>
  )
}

// --- Empty state -------------------------------------------------------------

export function WorkshopEmpty({ action, children, icon }: { action?: React.ReactNode; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-[3px] border border-dashed border-[var(--dt-border)] bg-[var(--theme-card-seed)]/30 px-6 py-10 text-center text-sm text-[var(--theme-foreground)]/60">
      {icon ? <div className="text-[var(--theme-foreground)]/40 [&_svg]:size-6">{icon}</div> : null}
      <p className="max-w-md text-balance leading-5">{children}</p>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  )
}

// --- Status pill -------------------------------------------------------------

export type WorkshopStatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'busy'

const STATUS_TONE: Record<WorkshopStatusTone, string> = {
  neutral: 'bg-[var(--theme-secondary)]/40 text-[var(--theme-foreground)]/65 ring-[var(--dt-border)]',
  info: 'bg-[var(--theme-accent-soft)]/12 text-[var(--theme-foreground)]/80 ring-[var(--theme-accent-soft)]/30',
  success: 'bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] ring-[var(--theme-primary)]/25',
  warning: 'bg-[var(--theme-secondary)]/15 text-[var(--theme-foreground)]/80 ring-[var(--theme-secondary)]/30',
  danger: 'bg-[var(--dt-destructive)]/10 text-[var(--dt-destructive)] ring-[var(--dt-destructive)]/30',
  busy: 'bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] ring-[var(--theme-primary)]/25 animate-pulse'
}

export function WorkshopStatus({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: WorkshopStatusTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-[2px] px-1.5 py-0.5 text-[0.65rem] font-medium ring-1 ring-inset',
        STATUS_TONE[tone]
      )}
      data-slot="karna-status"
      data-tone={tone}
    >
      {children}
    </span>
  )
}

// --- Inline editor row (label + control + meta) -----------------------------

export function FieldRow({ children, description, htmlFor, label, required }: { children: React.ReactNode; description?: React.ReactNode; htmlFor?: string; label: React.ReactNode; required?: boolean }) {
  return (
    <label className="grid gap-1" htmlFor={htmlFor}>
      <span className="text-[0.65rem] font-medium uppercase tracking-wider text-[var(--theme-foreground)]/60">
        {label}{required ? <span className="ml-1 text-[var(--dt-destructive)]">*</span> : null}
      </span>
      {children}
      {description ? <span className="text-[0.65rem] leading-4 text-[var(--theme-foreground)]/50">{description}</span> : null}
    </label>
  )
}

// --- Section header inside a tab --------------------------------------------

export function SectionHeader({ action, children, hint }: { action?: React.ReactNode; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-1 pt-1">
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-[var(--theme-foreground)]">{children}</h3>
        {hint ? <p className="text-[0.7rem] text-[var(--theme-foreground)]/60">{hint}</p> : null}
      </div>
      {action}
    </div>
  )
}
