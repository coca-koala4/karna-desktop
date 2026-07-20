import { useEffect, useRef, useState, useCallback } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

import { useAgentFlow, isBuiltinAgentId, NODE_DEFINITIONS, type WorkflowNodeType } from './store'
import { AgentAvatar } from './agent-avatars'

export type DrawerType = 'saved' | 'agents' | 'control' | 'io' | 'history'

type DrawerTab = DrawerType

interface ResourceDrawerProps {
  activeTab: DrawerType
  onTabChange: (tab: DrawerType) => void
}

const DRAWER_WIDTH_KEY = 'karna-flow-drawer-width'
const DRAWER_DEFAULT_WIDTH = 240
const DRAWER_MIN_WIDTH = 180
const DRAWER_MAX_WIDTH = 480

const DRAWER_TABS: Array<{ key: DrawerTab; label: string; icon: string }> = [
  { key: 'saved', label: '流程', icon: 'file-code' },
  { key: 'io', label: '输入输出', icon: 'arrow-both' },
  { key: 'agents', label: '智能体', icon: 'robot' },
  { key: 'control', label: '控制', icon: 'git-branch' },
  { key: 'history', label: '历史', icon: 'history' }
]

function LeftResizeHandle({ onResize }: { onResize: (w: number) => void }) {
  const handleRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)
  const [isHovering, setIsHovering] = useState(false)

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = e.clientX - startX.current
      onResize(startW.current + delta)
    }
    const onMouseUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onResize])

  return (
    <div
      ref={handleRef}
      className="group absolute right-0 top-0 z-20 flex h-full w-3 translate-x-1/2 cursor-col-resize items-center justify-center"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseDown={e => {
        dragging.current = true
        startX.current = e.clientX
        const parent = handleRef.current?.parentElement
        startW.current = parent?.getBoundingClientRect().width || DRAWER_DEFAULT_WIDTH
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
      }}
    >
      <div
        className={cn(
          'h-10 w-0.5 rounded-full transition-all duration-150',
          (isHovering || dragging.current)
            ? 'w-1 bg-violet-500 shadow-lg shadow-violet-500/50'
            : 'bg-slate-300 dark:bg-slate-600'
        )}
      />
    </div>
  )
}

export function ResourceDrawer({ activeTab, onTabChange }: ResourceDrawerProps) {
  const [width, setWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(DRAWER_WIDTH_KEY)
      return saved ? Math.min(DRAWER_MAX_WIDTH, Math.max(DRAWER_MIN_WIDTH, Number(saved))) : DRAWER_DEFAULT_WIDTH
    } catch {
      return DRAWER_DEFAULT_WIDTH
    }
  })

  const handleResize = useCallback((w: number) => {
    const clamped = Math.min(DRAWER_MAX_WIDTH, Math.max(DRAWER_MIN_WIDTH, w))
    setWidth(clamped)
    try { localStorage.setItem(DRAWER_WIDTH_KEY, String(clamped)) } catch {}
  }, [])

  return (
    <aside
      className="relative z-10 flex shrink-0 border-r border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/50"
      style={{ width }}
    >
      <nav className="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-slate-200/70 py-2 dark:border-white/10">
        {DRAWER_TABS.map(tab => (
          <button
            className={cn(
              'group relative flex w-9 flex-col items-center gap-0.5 rounded-lg py-1.5 text-[9px] font-medium transition-all',
              activeTab === tab.key
                ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200'
            )}
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            title={tab.label}
          >
            <Codicon name={tab.icon} size={16} />
            <span>{tab.label}</span>
            {activeTab === tab.key && (
              <div className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-violet-500" />
            )}
          </button>
        ))}
      </nav>

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-slate-200/70 px-3 py-2.5 dark:border-white/10">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            {DRAWER_TABS.find(t => t.key === activeTab)?.label}
          </h3>
        </div>

        <div className="flex-1 overflow-auto p-2.5">
          {activeTab === 'saved' && <SavedTab />}
          {activeTab === 'agents' && <AgentsTab />}
          {activeTab === 'control' && <NodeTab category="control" />}
          {activeTab === 'io' && <NodeTab category="io" />}
          {activeTab === 'history' && <HistoryTab />}
        </div>
      </div>

      <LeftResizeHandle onResize={handleResize} />
    </aside>
  )
}

const CONTROL_ALLOWLIST = new Set(['fanout', 'barrier', 'condition', 'loop_controller', 'human_confirm', 'consensus', 'scheduler', 'save_snapshot'])
const IO_ALLOWLIST = new Set(['input_text', 'input_file', 'input_variable', 'input_constant', 'text_merge', 'merge', 'final_output'])

const CONTROL_NODE_ICON: Record<string, string> = {
  fanout: 'git-branch',
  barrier: 'circle-slash',
  condition: 'question',
  loop_controller: 'sync',
  human_confirm: 'person',
  consensus: 'thumbsup',
  scheduler: 'calendar',
  save_snapshot: 'save'
}

const IO_NODE_ICON: Record<string, string> = {
  input_text: 'arrow-right',
  input_file: 'file',
  input_variable: 'symbol-variable',
  input_constant: 'pin',
  text_merge: 'fold',
  merge: 'fold-down',
  final_output: 'check'
}

const PINNED_KEY = 'karna_flow_pinned_agents'

function loadPinnedAgents(): Set<string> {
  try {
    const raw = localStorage.getItem(PINNED_KEY)
    if (raw) return new Set(JSON.parse(raw))
  } catch {}
  return new Set()
}

function savePinnedAgents(ids: Set<string>) {
  try {
    localStorage.setItem(PINNED_KEY, JSON.stringify([...ids]))
  } catch {}
}

function IconTile({ icon, active = false }: { icon: string; active?: boolean }) {
  return (
    <div
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-lg transition-colors',
        active
          ? 'bg-violet-500/20 text-violet-700 dark:bg-violet-500/30 dark:text-violet-200'
          : 'bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400'
      )}
    >
      <Codicon name={icon} size={18} />
    </div>
  )
}

function AddIconTile() {
  return (
    <div className="grid size-11 shrink-0 place-items-center rounded-lg border-2 border-dashed border-violet-400 bg-white text-violet-500 dark:border-violet-400/50 dark:bg-violet-500/10 dark:text-violet-300">
      <Codicon name="add" size={20} />
    </div>
  )
}

function DraggableCard({
  children,
  onClick,
  onDragStart,
  onContextMenu,
  active = false,
  accent = false
}: {
  children: React.ReactNode
  onClick?: () => void
  onDragStart?: (e: React.DragEvent) => void
  onContextMenu?: (e: React.MouseEvent) => void
  active?: boolean
  accent?: boolean
}) {
  return (
    <div
      className={cn(
        'cursor-grab active:cursor-grabbing rounded-xl border-2 border-dashed p-3 transition-all hover:shadow-sm',
        active
          ? 'border-violet-400 bg-violet-50/60 dark:border-violet-400/60 dark:bg-violet-500/10'
          : accent
            ? 'border-violet-300 bg-violet-50/40 hover:border-violet-400 hover:bg-violet-50 dark:border-violet-500/30 dark:bg-violet-500/5 dark:hover:border-violet-400/50 dark:hover:bg-violet-500/10'
            : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 dark:hover:bg-white/10'
      )}
      draggable
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
    >
      {children}
    </div>
  )
}

function SavedTab() {
  const { applyTemplate, applyEmptyTemplate, applyBuiltinTemplate, applyWorkflow, savedWorkflows, deleteWorkflow, currentWorkflow } = useAgentFlow()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; workflowId: string } | null>(null)

  const builtinWorkflows = savedWorkflows.filter(wf => wf.builtin === true || String(wf.id || '').startsWith('builtin.'))
  const userWorkflows = savedWorkflows.filter(wf => !builtinWorkflows.includes(wf))

  const getTemplateIcon = (wf: any) => {
    const id = String(wf.id || '')
    if (id.includes('basic-writing')) return 'edit'
    if (id.includes('critic-revision') || id.includes('critique')) return 'comment-discussion'
    return 'file-code'
  }

  useEffect(() => {
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [])

  return (
    <div className="space-y-2">
      <button
        className="group flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 px-3 py-3 text-sm font-medium text-slate-600 transition-all hover:border-violet-400 hover:bg-violet-50 hover:text-violet-700 dark:border-white/20 dark:text-slate-400 dark:bg-transparent dark:hover:border-violet-500/50 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
        onClick={() => applyEmptyTemplate()}
      >
        <Codicon name="new-file" size={16} />
        新建白板
      </button>

      {userWorkflows.length > 0 && (
        <>
          <div className="pt-1 pb-1 px-1 text-[0.65rem] font-medium text-slate-500 dark:text-slate-400">
            我的工作流
          </div>

          {userWorkflows.map(wf => {
            const selected = currentWorkflow.id === wf.id
            if (!wf.id) return null
            return (
              <div
                className={cn(
                  'cursor-pointer rounded-xl border bg-white p-3 transition-all duration-200 hover:shadow-md dark:bg-white/5',
                  selected
                    ? 'border-violet-400 bg-violet-50/50 shadow-md shadow-violet-500/10 dark:border-violet-400/50 dark:bg-violet-500/10'
                    : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50 dark:border-white/10 dark:hover:border-violet-500/30 dark:hover:bg-white/10'
                )}
                key={wf.id}
                onClick={() => applyWorkflow(wf)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setContextMenu({ x: e.clientX, y: e.clientY, workflowId: wf.id! })
                }}
              >
                <div className="flex items-start gap-2.5">
                  <IconTile icon="file-code" active={selected} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{wf.name}</span>
                      {selected && <Codicon className="text-violet-500 shrink-0" name="check" size={14} />}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {wf.nodes?.length || 0} 节点 · {wf.edges?.length || 0} 连线
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </>
      )}

      {builtinWorkflows.length > 0 && (
        <>
          <div className="pt-1 pb-1 px-1 text-[0.65rem] font-medium text-slate-500 dark:text-slate-400">
            内置流程模板
          </div>

          {builtinWorkflows.map(wf => {
            const isCurrent = currentWorkflow.name === wf.name && !currentWorkflow.id
            return (
              <div
                className={cn(
                  'cursor-pointer rounded-xl border bg-white p-3 transition-all duration-200 hover:shadow-md dark:bg-white/5',
                  isCurrent
                    ? 'border-violet-400 bg-violet-50/50 shadow-md shadow-violet-500/10 dark:border-violet-400/50 dark:bg-violet-500/10'
                    : 'border-slate-200 hover:border-violet-300 hover:bg-slate-50 dark:border-white/10 dark:hover:border-violet-500/30 dark:hover:bg-white/10'
                )}
                key={wf.id || wf.name}
                onClick={() => applyBuiltinTemplate(wf)}
              >
                <div className="flex items-start gap-2.5">
                  <IconTile icon={getTemplateIcon(wf)} active={isCurrent} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{wf.name}</span>
                      <span className="rounded bg-slate-100 px-1 py-px text-[0.55rem] text-slate-500 shrink-0 dark:bg-white/10 dark:text-slate-400">内置</span>
                      {isCurrent && <Codicon className="text-violet-500" name="check" size={14} />}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{wf.description}</div>
                    <div className="mt-1.5">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.6rem] text-slate-600 dark:bg-white/10 dark:text-slate-300">
                        {wf.nodes?.length || 0} 节点
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </>
      )}

      {contextMenu && (() => {
        const wf = savedWorkflows.find(w => w.id === contextMenu.workflowId)
        if (!wf || !wf.id) return null
        const isBuiltin = wf.builtin === true || String(wf.id).startsWith('builtin.')
        return (
          <div
            className="fixed z-50 min-w-[140px] rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            onClick={e => e.stopPropagation()}
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <ContextMenuItem
              icon="file"
              label="打开"
              onClick={() => { applyWorkflow(wf); setContextMenu(null) }}
            />
            {!isBuiltin && (
              <>
                <div className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
                <ContextMenuItem
                  icon="trash"
                  label="删除"
                  danger
                  onClick={() => { setContextMenu(null); void deleteWorkflow(wf.id!) }}
                />
              </>
            )}
          </div>
        )
      })()}
    </div>
  )
}

function AgentsTab() {
  const { agents, selectedAgentId, builtinAgentIds, createAgent, createNodeAt, deleteAgent, setSelectedAgentId, setSelectedNodeId, setSelectedEdgeId } = useAgentFlow()
  const [search, setSearch] = useState('')
  const [pinned, setPinned] = useState<Set<string>>(() => loadPinnedAgents())
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; agentId: string } | null>(null)

  const selectAgent = (id: string) => {
    setSelectedNodeId('')
    setSelectedEdgeId('')
    setSelectedAgentId(id)
  }

  useEffect(() => {
    const close = () => setContextMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [])

  const togglePin = (id: string) => {
    setPinned(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      savePinnedAgents(next)
      return next
    })
  }


  const filtered = agents.filter(agent => {
    if (!search) return true
    const term = search.toLowerCase()
    return agent.name.toLowerCase().includes(term) || (agent.tagline || '').toLowerCase().includes(term)
  })

  const agentOrderMap = new Map(agents.map((a, i) => [a.id, i]))

  const sortedAgents = [...filtered].sort((a, b) => {
    const pa = pinned.has(a.id) ? 0 : 1
    const pb = pinned.has(b.id) ? 0 : 1
    if (pa !== pb) return pa - pb
    const aIsBuiltin = isBuiltinAgentId(a.id)
    const bIsBuiltin = isBuiltinAgentId(b.id)
    if (aIsBuiltin && bIsBuiltin) {
      return (agentOrderMap.get(a.id) ?? 0) - (agentOrderMap.get(b.id) ?? 0)
    }
    if (aIsBuiltin) return -1
    if (bIsBuiltin) return 1
    return a.name.localeCompare(b.name, 'zh-CN')
  })

  const dragPayload = (payload: Record<string, any>) => (event: React.DragEvent) => {
    event.dataTransfer.setData('application/karna-workflow-node', JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
          <Codicon name="search" size={14} />
        </span>
        <input
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:bg-white focus:outline-none transition-all dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-violet-500/50 dark:focus:bg-white/10"
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索智能体..."
          type="text"
          value={search}
        />
      </div>

      <DraggableCard
        accent
        onDragStart={dragPayload({ type: 'agent', label: '空白Agent' })}
      >
        <div className="flex items-center gap-3">
          <AddIconTile />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">空白 Agent</div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">拖拽到画布创建全新的智能体节点</div>
          </div>
        </div>
      </DraggableCard>

      {sortedAgents.length > 0 && (
        <div className="space-y-1.5">
          {sortedAgents.map(agent => {
            const isSelected = selectedAgentId === agent.id
            const builtin = builtinAgentIds.has(agent.id) || isBuiltinAgentId(agent.id)
            const isPinned = pinned.has(agent.id)
            return (
              <DraggableCard
                active={isSelected}
                key={agent.id}
                onClick={() => selectAgent(agent.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setContextMenu({ x: e.clientX, y: e.clientY, agentId: agent.id })
                }}
                onDragStart={dragPayload({ type: 'agent', label: agent.name, agentId: agent.id, presetId: agent.id })}
              >
                <div className="flex items-center gap-3">
                  {agent.avatar ? (
                    <div className="size-11 shrink-0 overflow-hidden rounded-lg shadow-sm ring-1 ring-violet-200/50 dark:ring-violet-500/20">
                      <img src={agent.avatar} alt={agent.name} className="size-full object-cover" />
                    </div>
                  ) : (
                    <AgentAvatar agentId={agent.id} size={44} className="shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {isPinned && <Codicon className="text-amber-500 shrink-0" name="pin" size={11} />}
                      <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{agent.name}</span>
                      {builtin && (
                        <span className="rounded bg-slate-100 px-1 py-px text-[0.55rem] text-slate-500 shrink-0 dark:bg-white/10 dark:text-slate-400">内置</span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{agent.tagline || agent.role}</div>
                  </div>
                  <Codicon className="text-slate-300 shrink-0 dark:text-slate-600" name="gripper" size={14} />
                </div>
              </DraggableCard>
            )
          })}
        </div>
      )}

      <button
        className="group flex w-full items-center justify-center gap-1.5 rounded-xl border border-violet-300 bg-violet-50/50 px-3 py-2.5 text-sm font-medium text-violet-600 transition-all hover:bg-violet-50 hover:border-violet-400 hover:shadow-md dark:border-violet-500/30 dark:text-violet-400 dark:bg-transparent dark:hover:border-violet-500/50 dark:hover:bg-violet-500/10"
        onClick={() => void createAgent().catch(() => undefined)}
      >
        <Codicon className="transition-transform group-hover:rotate-90" name="add" size={14} />
        新建智能体
      </button>

      {contextMenu && (() => {
        const agent = agents.find(a => a.id === contextMenu.agentId)
        if (!agent) return null
        const isBuiltinAgent = builtinAgentIds.has(agent.id) || isBuiltinAgentId(agent.id)
        const isPinned = pinned.has(agent.id)
        return (
          <div
            className="fixed z-50 min-w-[160px] rounded-lg border border-slate-200 bg-white p-1 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            onClick={e => e.stopPropagation()}
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <ContextMenuItem
              icon={isPinned ? 'pinned' : 'pin'}
              label={isPinned ? '取消置顶' : '置顶'}
              onClick={() => { togglePin(agent.id); setContextMenu(null) }}
            />
            <ContextMenuItem
              icon="edit"
              label="编辑"
              onClick={() => { setContextMenu(null); setTimeout(() => selectAgent(agent.id), 10) }}
            />
            <div className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
            <ContextMenuItem
              icon="trash"
              label="删除"
              danger
              onClick={() => { setContextMenu(null); setTimeout(() => deleteAgent(agent.id), 10) }}
            />
          </div>
        )
      })()}
    </div>
  )
}

function ContextMenuItem({ icon, label, onClick, danger, disabled }: { icon: string; label: string; onClick?: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors',
        disabled
          ? 'text-slate-400 cursor-not-allowed dark:text-slate-600'
          : danger
            ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'
            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10'
      )}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
    >
      <Codicon name={icon} size={13} />
      <span>{label}</span>
    </button>
  )
}

function NodeTab({ category }: { category: 'control' | 'io' }) {
  const allowlist = category === 'control' ? CONTROL_ALLOWLIST : IO_ALLOWLIST
  const iconMap = category === 'control' ? CONTROL_NODE_ICON : IO_NODE_ICON

  const nodes = NODE_DEFINITIONS.filter(n => allowlist.has(n.classType) && !(n as any).isDeprecated)

  const dragPayload = (nodeType: WorkflowNodeType, label: string) => (event: React.DragEvent) => {
    event.dataTransfer.setData('application/karna-workflow-node', JSON.stringify({ type: nodeType, label }))
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div className="space-y-1.5">
      {nodes.map(node => (
        <DraggableCard
          key={node.classType}
          onDragStart={dragPayload(node.classType as WorkflowNodeType, node.displayName)}
        >
          <div className="flex items-center gap-3">
            <IconTile icon={iconMap[node.classType] || 'circle'} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{node.displayName}</div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{node.description}</div>
            </div>
            <Codicon className="text-slate-300 shrink-0 dark:text-slate-600" name="gripper" size={14} />
          </div>
        </DraggableCard>
      ))}
    </div>
  )
}

function HistoryTab() {
  const { lastRun, currentWorkflow } = useAgentFlow()

  const statusLabel = (status: string) => {
    const labels: Record<string, string> = {
      pending: '等待中', running: '运行中', success: '已完成', failed: '失败', cancelled: '已取消', paused: '待确认'
    }
    return labels[status] || status
  }

  const statusBadgeClass = (status: string) => {
    if (status === 'success' || status === 'done' || status === 'accepted') return 'bg-emerald-500 text-white dark:bg-emerald-600'
    if (status === 'running') return 'animate-pulse bg-violet-500 text-white dark:bg-violet-600'
    if (status === 'paused' || status === 'waiting_human') return 'bg-amber-400 text-white dark:bg-amber-500'
    if (status === 'failed' || status === 'blocked' || status === 'rejected') return 'bg-red-500 text-white dark:bg-red-600'
    return 'bg-slate-400 text-white dark:bg-slate-500'
  }

  return (
    <div className="space-y-3">
      <div className="px-1 text-[0.65rem] font-medium text-slate-500 dark:text-slate-400">
        当前工作流
      </div>
      <div
        className="cursor-pointer rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 transition-all dark:border-emerald-400/30 dark:bg-emerald-500/5"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{currentWorkflow.name}</span>
          {lastRun && (
            <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-medium', statusBadgeClass(lastRun.status))}>
              {lastRun.status === 'running' && <span className="size-1 animate-ping rounded-full bg-white" />}
              {statusLabel(lastRun.status)}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[0.65rem] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <span className="text-violet-500 dark:text-violet-400"><Codicon name="circle-filled" size={10} /></span>
            {currentWorkflow.nodes.length} 节点
          </span>
          <span className="flex items-center gap-1">
            <span className="text-cyan-500 dark:text-cyan-400"><Codicon name="dash" size={10} /></span>
            {currentWorkflow.edges.length} 连线
          </span>
        </div>
      </div>

      <div className="px-1 pt-2 text-[0.65rem] font-medium text-slate-500 dark:text-slate-400">
        最近运行记录
      </div>

      {lastRun ? (
        <div className="space-y-1.5">
          <div
            className={cn(
              'rounded-xl border p-3 bg-white dark:bg-white/5',
              lastRun.status === 'running' ? 'border-amber-200 bg-amber-50/50 dark:border-amber-400/30 dark:bg-amber-500/5' :
              lastRun.status === 'paused' ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-400/30 dark:bg-emerald-500/5' :
              'border-slate-200 dark:border-white/10'
            )}
          >
            <div className="flex items-center justify-between">
              <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-medium', statusBadgeClass(lastRun.status))}>
                {lastRun.status === 'running' && <span className="size-1 animate-ping rounded-full bg-white" />}
                {statusLabel(lastRun.status)}
              </span>
              <span className="text-[0.6rem] text-slate-500 dark:text-slate-400">
                {lastRun.cost_estimate?.tokens || 0} tokens
              </span>
            </div>
            <div className="mt-1.5 text-[0.65rem] text-slate-500 dark:text-slate-400">
              {lastRun.started_at ? new Date(lastRun.started_at).toLocaleString() : '未知时间'}
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-transparent p-6 text-center dark:border-white/10 dark:from-white/5">
          <Codicon className="mx-auto mb-2 text-slate-300 dark:text-slate-600" name="inbox" size={32} />
          <div className="text-xs font-medium text-slate-800 dark:text-slate-200">暂无运行记录</div>
          <div className="mt-1 text-[0.65rem] text-slate-500">运行流程后会在这里显示历史记录</div>
        </div>
      )}
    </div>
  )
}
