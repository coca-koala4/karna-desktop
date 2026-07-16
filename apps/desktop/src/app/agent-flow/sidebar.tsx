import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

export type DrawerType = 'template' | 'nodes' | 'agents' | 'knowledge' | 'tools' | 'history'

interface AgentFlowSidebarProps {
  activeDrawer: DrawerType | null
  onToggleDrawer: (drawer: DrawerType) => void
}

interface SidebarItem {
  key: DrawerType
  icon: string
  label: string
  color: string
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  {
    key: 'template',
    icon: 'file-code',
    label: '模板库',
    color: 'text-sky-500'
  },
  {
    key: 'nodes',
    icon: 'graph',
    label: '节点库',
    color: 'text-violet-500'
  },
  {
    key: 'agents',
    icon: 'robot',
    label: 'Agent库',
    color: 'text-indigo-500'
  },
  {
    key: 'knowledge',
    icon: 'book',
    label: '知识库',
    color: 'text-emerald-500'
  },
  {
    key: 'tools',
    icon: 'tools',
    label: '工具箱',
    color: 'text-amber-500'
  },
  {
    key: 'history',
    icon: 'history',
    label: '历史/工作流',
    color: 'text-cyan-500'
  }
]

export function AgentFlowSidebar({ activeDrawer, onToggleDrawer }: AgentFlowSidebarProps) {
  return (
    <aside className="relative z-10 flex w-16 shrink-0 flex-col items-center gap-1 border-r border-slate-200/60 bg-white/70 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/60">
      <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-blue-500/30 to-transparent dark:via-blue-500/50" />

      {SIDEBAR_ITEMS.map(item => {
        const isActive = activeDrawer === item.key

        return (
          <button
            className={cn(
              'group relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200',
              isActive
                ? 'bg-blue-500/15 text-blue-600 shadow-sm dark:bg-blue-500/25 dark:text-blue-400'
                : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-300'
            )}
            key={item.key}
            onClick={() => onToggleDrawer(item.key)}
            title={item.label}
          >
            {isActive && (
              <div className="absolute -right-3 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-l-full bg-blue-500 dark:bg-blue-400" />
            )}
            <Codicon name={item.icon} size={20} />

            <span className="pointer-events-none absolute left-full z-50 ml-2 flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 opacity-0 shadow-lg backdrop-blur-xl transition-all duration-150 group-hover:opacity-100 group-hover:translate-x-0 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200">
              {item.label}
            </span>
          </button>
        )
      })}

      <div className="mt-auto flex flex-col items-center gap-1 pt-2">
        <button
          className="group relative flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-all duration-200 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-300"
          title="设置"
        >
          <Codicon name="settings-gear" size={20} />
          <span className="pointer-events-none absolute left-full z-50 ml-2 flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 opacity-0 shadow-lg backdrop-blur-xl transition-all duration-150 group-hover:opacity-100 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200">
            设置
          </span>
        </button>

        <button
          className="group relative flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 transition-all duration-200 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-300"
          title="帮助 / 快捷键"
        >
          <Codicon name="question" size={20} />
          <span className="pointer-events-none absolute left-full z-50 ml-2 flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 opacity-0 shadow-lg backdrop-blur-xl transition-all duration-150 group-hover:opacity-100 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200">
            帮助 / 快捷键
          </span>
        </button>
      </div>
    </aside>
  )
}
