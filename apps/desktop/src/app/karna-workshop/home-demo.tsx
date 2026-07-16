import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

import { PAGE_INSET_X } from '../layout-constants'

// Pure-shape proposal for the home sidebar redesign. No Karna stores, no
// SidebarSessionsSection, no liveSessionProjectId — just two independent
// stacked panels with their own open/close state. If this view looks right
// to the user, the same pattern is ported to the real ChatSidebar.
//
// Mounted at /karna/home-demo. Delete this file + its route entry when the
// redesign lands in ChatSidebar.

interface MockSession {
  id: string
  title: string
  preview: string
  ageMinutes: number
  cwd: null | string
}

interface MockProject {
  id: string
  name: string
  folder: string
  status: 'active' | 'paused' | 'archived'
  recentSessionTitle: null | string
}

const MOCK_SESSIONS: MockSession[] = [
  {
    ageMinutes: 4,
    cwd: null,
    id: 's1',
    preview: '用第一人称重写这场戏的开头，避免开头介绍',
    title: '重写：第三章开头'
  },
  {
    ageMinutes: 22,
    cwd: null,
    id: 's2',
    preview: '陀氏《罪与罚》拉斯科尔尼科夫的地下室独白段落分析',
    title: '陀氏地下室研究'
  },
  {
    ageMinutes: 95,
    cwd: null,
    id: 's3',
    preview: '把"列车"那一段三万字压到八千——保留意象，删内心独白',
    title: '删改：列车'
  },
  {
    ageMinutes: 240,
    cwd: null,
    id: 's4',
    preview: '下一章时间线问题：男主是 9 月 3 日到站还是 9 月 5 日到站？',
    title: '时间线核对'
  }
]

const MOCK_PROJECTS: MockProject[] = [
  {
    folder: 'D:\\Writer\\new-cathedral',
    id: 'p1',
    name: '新大教堂',
    recentSessionTitle: '改写第四章',
    status: 'active'
  },
  {
    folder: 'D:\\Writer\\archive-2019\\quiet-river',
    id: 'p2',
    name: '静河（存档）',
    recentSessionTitle: '重读第三幕',
    status: 'archived'
  },
  {
    folder: 'D:\\Writer\\essays\\mood-and-prose',
    id: 'p3',
    name: '随笔：语气与节奏',
    recentSessionTitle: null,
    status: 'paused'
  }
]

const STATUS_BADGE: Record<MockProject['status'], { label: string; tone: string }> = {
  active: { label: '进行中', tone: 'text-emerald-600 dark:text-emerald-400' },
  archived: { label: '已存档', tone: 'text-zinc-500' },
  paused: { label: '暂停', tone: 'text-amber-600 dark:text-amber-400' }
}

function ageLabel(minutes: number): string {
  if (minutes < 60) {return `${minutes} 分钟前`}

  if (minutes < 60 * 24) {return `${Math.round(minutes / 60)} 小时前`}

  return `${Math.round(minutes / 60 / 24)} 天前`
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <Codicon
      className={cn('size-3.5 text-zinc-500 transition-transform duration-150', open && 'rotate-90')}
      name="chevron-right"
    />
  )
}

interface PanelHeaderProps {
  count: number
  meta?: string
  open: boolean
  title: string
  onToggle: () => void
  primaryAction?: { label: string; onClick: () => void; icon?: string }
}

function PanelHeader({ count, meta, onToggle, open, primaryAction, title }: PanelHeaderProps) {
  return (
    <div className="flex items-center gap-2 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
      <button
        aria-expanded={open}
        aria-label={`${open ? '折叠' : '展开'} ${title}`}
        className="-ml-1 flex size-6 shrink-0 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        onClick={onToggle}
        type="button"
      >
        <ChevronIcon open={open} />
      </button>
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <span className="truncate text-[0.8125rem] font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </span>
        <span className="shrink-0 text-[0.6875rem] text-zinc-500 tabular-nums">
          {count}
          {meta ? ` · ${meta}` : ''}
        </span>
      </div>
      {primaryAction ? (
        <Button
          aria-label={primaryAction.label}
          className="size-6 shrink-0"
          onClick={event => {
            event.stopPropagation()
            primaryAction.onClick()
          }}
          size="icon-xs"
          variant="ghost"
        >
          <Codicon name={primaryAction.icon ?? 'add'} size="0.75rem" />
        </Button>
      ) : null}
    </div>
  )
}

export function KarnaHomeDemoView() {
  const [sessionsOpen, setSessionsOpen] = useState(true)
  const [projectsOpen, setProjectsOpen] = useState(true)

  return (
    <div
      className="flex h-full w-full flex-col gap-4 overflow-y-auto bg-zinc-50 py-6 dark:bg-zinc-950"
      style={{ paddingInline: PAGE_INSET_X }}
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          主页改造预览 · 会话 / 项目独立折叠
        </h1>
        <p className="text-[0.8125rem] text-zinc-600 dark:text-zinc-400">
          两个面板上下排列，各自独立展开与收回。下方只显示不在项目中的对话（即"独立对话"）。
          这是给真实 sidebar 改造前的低保真预览；点击面板标题 / "+" / 切换按钮互不干扰。
        </p>
      </header>

      <section
        aria-label="会话预览面板"
        className="flex flex-col rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <PanelHeader
          count={MOCK_SESSIONS.length}
          meta="不在项目内"
          onToggle={() => setSessionsOpen(!sessionsOpen)}
          open={sessionsOpen}
          primaryAction={{
            label: '新建独立会话',
            onClick: () => {
              // demo: no-op
            }
          }}
          title="会话"
        />
        {sessionsOpen ? (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {MOCK_SESSIONS.map(session => (
              <li
                className="flex cursor-pointer flex-col gap-0.5 px-3 py-2.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                key={session.id}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[0.8125rem] font-medium text-zinc-900 dark:text-zinc-100">
                    {session.title}
                  </span>
                  <span className="shrink-0 text-[0.6875rem] text-zinc-500 tabular-nums">
                    {ageLabel(session.ageMinutes)}
                  </span>
                </div>
                <span className="truncate text-[0.75rem] text-zinc-500">{session.preview}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section
        aria-label="项目预览面板"
        className="flex flex-col rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <PanelHeader
          count={MOCK_PROJECTS.length}
          meta="1 进行中"
          onToggle={() => setProjectsOpen(!projectsOpen)}
          open={projectsOpen}
          primaryAction={{
            label: '新建项目',
            onClick: () => {
              // demo: no-op
            }
          }}
          title="项目"
        />
        {projectsOpen ? (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {MOCK_PROJECTS.map(project => (
              <li
                className="flex cursor-pointer flex-col gap-0.5 px-3 py-2.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                key={project.id}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[0.8125rem] font-medium text-zinc-900 dark:text-zinc-100">
                    {project.name}
                  </span>
                  <span
                    className={cn(
                      'shrink-0 text-[0.6875rem] tabular-nums',
                      STATUS_BADGE[project.status].tone
                    )}
                  >
                    {STATUS_BADGE[project.status].label}
                  </span>
                </div>
                <span className="truncate text-[0.6875rem] text-zinc-500">{project.folder}</span>
                <span className="truncate text-[0.75rem] text-zinc-600 dark:text-zinc-400">
                  最近：{project.recentSessionTitle ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <footer className="text-[0.75rem] text-zinc-500">
        预览说明：此页面只用于展示折叠 / 视觉布局，不连接到任何后端 store。
        真实 sidebar 改造会复用此布局 + ChatSidebar 现有的 session / project 数据源。
      </footer>
    </div>
  )
}
