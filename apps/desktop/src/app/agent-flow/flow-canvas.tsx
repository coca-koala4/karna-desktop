import '@xyflow/react/dist/style.css'

import {
  Background,
  BackgroundVariant,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  type EdgeProps,
  getBezierPath,
  Handle,
  MarkerType,
  MiniMap,
  type NodeProps,
  Position,
  ReactFlow,
  useReactFlow,
  type Connection
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type * as React from 'react'

import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

import {
  FlowNode,
  FlowEdge,
  NODE_COLOR_MAP,
  STATUS_LABEL,
  getNodeDefinition,
  PortDefinition,
  WorkflowNodeType,
  NODE_DEFINITIONS,
  NODE_CATEGORIES,
  PORT_COMPATIBILITY,
  KarnaPortType
} from '../karna-workshop/workflow-schema'
import { useAgentFlow } from './store'
import { AgentAvatar } from './agent-avatars'

const PORT_TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  TEXT: { bg: 'bg-slate-400', border: 'border-slate-500', text: 'text-slate-600' },
  MARKDOWN: { bg: 'bg-slate-400', border: 'border-slate-500', text: 'text-slate-600' },
  DOCUMENT: { bg: 'bg-slate-500', border: 'border-slate-600', text: 'text-slate-700' },
  CHAPTER: { bg: 'bg-amber-400', border: 'border-amber-500', text: 'text-amber-600' },
  PROMPT: { bg: 'bg-pink-400', border: 'border-pink-500', text: 'text-pink-600' },
  CONTEXT: { bg: 'bg-teal-400', border: 'border-teal-500', text: 'text-teal-600' },
  AGENT_RESULT: { bg: 'bg-violet-400', border: 'border-violet-500', text: 'text-violet-600' },
  CRITIQUE_RESULT: { bg: 'bg-pink-400', border: 'border-pink-500', text: 'text-pink-600' },
  CRITIQUE_SET: { bg: 'bg-pink-500', border: 'border-pink-600', text: 'text-pink-700' },
  EVIDENCE_SET: { bg: 'bg-cyan-400', border: 'border-cyan-500', text: 'text-cyan-600' },
  BOOLEAN: { bg: 'bg-yellow-400', border: 'border-yellow-500', text: 'text-yellow-600' },
  NUMBER: { bg: 'bg-blue-400', border: 'border-blue-500', text: 'text-blue-600' },
  JSON: { bg: 'bg-indigo-400', border: 'border-indigo-500', text: 'text-indigo-600' },
  ANY: { bg: 'bg-gray-400', border: 'border-gray-500', text: 'text-gray-600' },
  ARTIFACT: { bg: 'bg-slate-400', border: 'border-slate-500', text: 'text-slate-600' },
  ARTIFACT_VERSION: { bg: 'bg-slate-500', border: 'border-slate-600', text: 'text-slate-700' },
  CONSENSUS_DECISION: { bg: 'bg-yellow-400', border: 'border-yellow-500', text: 'text-yellow-600' },
  REVISION_BRIEF: { bg: 'bg-violet-400', border: 'border-violet-500', text: 'text-violet-600' },
  FILE_REF: { bg: 'bg-emerald-400', border: 'border-emerald-500', text: 'text-emerald-600' },
  WORKSPACE_REF: { bg: 'bg-lime-400', border: 'border-lime-500', text: 'text-lime-600' }
}

function getPortColor(portType: string) {
  return PORT_TYPE_COLORS[portType] || PORT_TYPE_COLORS.ANY
}

function getStatusIcon(status?: string) {
  switch (status) {
    case 'idle': return <Codicon name="circle" size={12} />
    case 'queued': return <Codicon name="clock" size={12} />
    case 'running': return <Codicon className="codicon-modifier-spin" name="loading" size={12} />
    case 'success': return <Codicon name="pass-filled" size={12} />
    case 'failed': return <Codicon name="error" size={12} />
    case 'waiting_human': return <Codicon name="person" size={12} />
    case 'cached': return <Codicon name="database" size={12} />
    case 'skipped': return <Codicon name="skip" size={12} />
    default: return <Codicon name="circle-outline" size={12} />
  }
}

function getStatusColor(status?: string): string {
  switch (status) {
    case 'idle':
      return 'text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-400'
    case 'queued':
      return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400 animate-pulse'
    case 'running':
      return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 animate-pulse'
    case 'success':
      return 'text-green-600 bg-green-100 dark:bg-green-900/30 dark:text-green-400'
    case 'failed':
      return 'text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400'
    case 'waiting_human':
      return 'text-orange-600 bg-orange-100 dark:bg-orange-900/30 dark:text-orange-400 animate-pulse'
    case 'cached':
      return 'text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30 dark:text-cyan-400'
    case 'skipped':
      return 'text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-400'
    default:
      return 'text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-400'
  }
}

function CustomNode({ data, selected, id }: NodeProps<FlowNode>) {
  const nodeType = String(data.nodeType) as WorkflowNodeType
  const def = getNodeDefinition(nodeType)
  const accent = data.color || NODE_COLOR_MAP[nodeType] || def?.color || '#8b5cf6'
  const runStatus = data.runStatus as string | undefined
  const isDeprecated = def?.isDeprecated
  const isLocked = Boolean(data.locked)
  const isStart = Boolean(data.isStart)
  const [hovered, setHovered] = useState(false)

  const inputs = def?.inputs || [{ id: 'in', name: '输入', type: 'ANY' as KarnaPortType }]
  const outputs = def?.outputs || [{ id: 'out', name: '输出', type: 'ANY' as KarnaPortType }]

  const iconName = data.icon || def?.icon || 'circle-large-outline'

  const showBody = data.summary || (data.content && String(data.content).trim()) || (data.prompt && String(data.prompt).trim())
  const bodyText = data.summary || (data.content ? String(data.content).slice(0, 80) : data.prompt ? String(data.prompt).slice(0, 80) : '')

  const isRunning = runStatus === 'running'
  const isFailed = runStatus === 'failed'

  const portColorVar = (portType: string) => {
    const c = PORT_TYPE_COLORS[portType] || PORT_TYPE_COLORS.ANY
    const hexMap: Record<string, string> = {
      'bg-slate-400': '#94a3b8', 'bg-slate-500': '#64748b',
      'bg-amber-400': '#fbbf24', 'bg-pink-400': '#f472b6',
      'bg-teal-400': '#2dd4bf', 'bg-violet-400': '#a78bfa', 'bg-violet-500': '#8b5cf6',
      'bg-cyan-400': '#22d3ee', 'bg-yellow-400': '#facc15', 'bg-blue-400': '#60a5fa',
      'bg-indigo-400': '#818cf8', 'bg-gray-400': '#9ca3af', 'bg-gray-500': '#6b7280',
      'bg-emerald-400': '#34d399', 'bg-lime-400': '#a3e635'
    }
    return hexMap[c.bg] || '#94a3b8'
  }

  return (
    <div
      className={cn(
        'relative w-[220px] rounded-xl border bg-white shadow-sm transition-all duration-150 dark:bg-slate-900',
        selected
          ? 'border-violet-400 shadow-[0_0_0_2px_rgba(139,92,246,0.25)] dark:border-violet-500/60'
          : hovered
            ? 'border-slate-300 shadow-md dark:border-slate-600'
            : 'border-slate-200 dark:border-slate-700/70',
        isLocked && 'opacity-60',
        isDeprecated && 'grayscale italic'
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className="h-1 w-full rounded-t-xl"
        style={{ background: accent }}
      />

      <div className="px-3 py-2.5 flex items-center gap-2.5">
        {nodeType === 'agent' && (data as any).agent_id ? (
          <AgentAvatar agentId={String((data as any).agent_id)} size={32} className="shrink-0" />
        ) : (
          <div
            className="grid size-8 shrink-0 place-items-center rounded-lg"
            style={{ background: `${accent}15`, color: accent }}
          >
            <Codicon name={iconName} size={15} />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold leading-tight text-slate-800 dark:text-slate-100 truncate">
            {data.label}
          </div>
          {data.agent_name && (
            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 truncate flex items-center gap-1">
              <Codicon name="person" size={10} />
              {String(data.agent_name)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isStart && (
            <span className="size-1.5 rounded-full bg-emerald-500" title="起始节点" />
          )}
          {isLocked && (
            <Codicon className="text-slate-400" name="lock" size={12} title="已锁定" />
          )}
          {runStatus && runStatus !== 'idle' && (
            <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[0.55rem] font-medium ${getStatusColor(runStatus)}`}>
              {getStatusIcon(runStatus)}
            </span>
          )}
        </div>
      </div>

      {showBody && (
        <div className="px-3 pb-2">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 leading-snug">
            {bodyText}
          </div>
        </div>
      )}

      {isRunning && typeof data.progress === 'number' && (
        <div className="px-3 pb-2">
          <div className="h-0.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-300"
              style={{ width: `${data.progress}%` }}
            />
          </div>
        </div>
      )}

      {isRunning && (typeof data.progress !== 'number') && (
        <div className="px-3 pb-2">
          <div className="h-0.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-violet-500 rounded-full animate-pulse" />
          </div>
        </div>
      )}

      {isFailed && data.errorMessage && (
        <div className="px-3 pb-2">
          <div className="text-[11px] text-red-500 dark:text-red-400 flex items-start gap-1">
            <Codicon className="mt-0.5 shrink-0" name="error" size={11} />
            <span className="line-clamp-2">{String(data.errorMessage)}</span>
          </div>
        </div>
      )}

      {isDeprecated && (
        <div className="px-3 pb-2">
          <span className="text-[0.6rem] text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            deprecated
          </span>
        </div>
      )}

      {inputs.map((port, idx) => {
        const yOffset = inputs.length === 1 ? 50 : 24 + (idx * 52) / Math.max(1, inputs.length - 1)
        const pc = portColorVar(port.type)
        return (
          <Handle
            key={port.id}
            id={port.id}
            type="target"
            position={Position.Left}
            className="!-left-1.5 !size-2.5 !rounded-full !border-2 !border-white dark:!border-slate-900 transition-transform hover:!scale-150"
            style={{ top: `${yOffset}%`, background: pc }}
          >
            <span className="absolute right-full mr-1.5 top-1/2 -translate-y-1/2 text-[10px] whitespace-nowrap text-slate-400 dark:text-slate-500 pointer-events-none font-medium">
              {port.name}
            </span>
          </Handle>
        )
      })}

      {outputs.map((port, idx) => {
        const yOffset = outputs.length === 1 ? 50 : 24 + (idx * 52) / Math.max(1, outputs.length - 1)
        const pc = portColorVar(port.type)
        return (
          <Handle
            key={port.id}
            id={port.id}
            type="source"
            position={Position.Right}
            className="!-right-1.5 !size-2.5 !rounded-full !border-2 !border-white dark:!border-slate-900 transition-transform hover:!scale-150"
            style={{ top: `${yOffset}%`, background: pc }}
          >
            <span className="absolute left-full ml-1.5 top-1/2 -translate-y-1/2 text-[10px] whitespace-nowrap text-slate-400 dark:text-slate-500 pointer-events-none font-medium">
              {port.name}
            </span>
          </Handle>
        )
      })}
    </div>
  )
}

const nodeTypes = { custom: CustomNode }

function getEdgeStyle(edge: FlowEdge) {
  const status = edge.data?.status as string | undefined
  const sourceHandle = edge.sourceHandle
  const edgeType = edge.data?.edgeType as string | undefined

  let stroke = '#94a3b8'
  let strokeWidth = 1.8
  let strokeDasharray: string | undefined = undefined
  let animated = false

  if (sourceHandle === 'true_out' || sourceHandle === 'approve_out' || sourceHandle === 'pass_out') {
    stroke = '#22c55e'
    strokeWidth = 2.2
  } else if (sourceHandle === 'false_out' || sourceHandle === 'reject_out' || sourceHandle === 'fail_out') {
    stroke = '#ef4444'
    strokeWidth = 2.2
    strokeDasharray = '6 3'
  } else if (sourceHandle === 'loop_back' || edgeType === 'loop') {
    stroke = '#f97316'
    strokeWidth = 2
    strokeDasharray = '5 3'
    animated = true
  } else if (sourceHandle === 'edit_out' || edgeType === 'human_approval') {
    stroke = '#10b981'
    strokeWidth = 2
    strokeDasharray = '4 4'
  }

  if (status === 'running') {
    stroke = '#3b82f6'
    strokeWidth = 3
    animated = true
  } else if (status === 'success') {
    stroke = '#22c55e'
    strokeWidth = 2.5
  } else if (status === 'failed') {
    stroke = '#ef4444'
    strokeWidth = 3
  } else if (status === 'waiting_human') {
    stroke = '#f59e0b'
    strokeWidth = 2.5
  }

  return { stroke, strokeWidth, strokeDasharray, animated }
}

function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  label,
  selected,
  data,
  markerEnd,
  sourceHandle,
  targetHandle
}: EdgeProps<FlowEdge> & { sourceHandle?: string; targetHandle?: string }) {
  const { setSelectedEdgeId } = useAgentFlow()
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  })

  const { stroke, strokeWidth, strokeDasharray, animated } = getEdgeStyle({ id, sourceHandle, data } as FlowEdge)
  const showLabel = label || sourceHandle === 'true_out' || sourceHandle === 'false_out'
  let displayLabel = label
  if (!displayLabel) {
    if (sourceHandle === 'true_out' || sourceHandle === 'approve_out' || sourceHandle === 'pass_out') displayLabel = '是'
    else if (sourceHandle === 'false_out' || sourceHandle === 'reject_out' || sourceHandle === 'fail_out') displayLabel = '否'
  }

  return (
    <>
      {animated && (
        <path
          d={edgePath}
          fill="none"
          opacity={0.3}
          stroke={stroke}
          strokeLinecap="round"
          strokeWidth={strokeWidth + 6}
          style={{ filter: 'blur(8px)' }}
        />
      )}
      <BaseEdge
        id={id}
        markerEnd={MarkerType.ArrowClosed}
        path={edgePath}
        style={{
          ...style,
          stroke,
          strokeWidth: selected ? strokeWidth + 1 : strokeWidth,
          strokeDasharray
        }}
      />
      {animated && (
        <circle r="4" fill={stroke} opacity={0.9}>
          <animateMotion dur="1.2s" path={edgePath} repeatCount="indefinite" />
        </circle>
      )}
      <path
        d={edgePath}
        fill="none"
        onClick={() => setSelectedEdgeId(id)}
        onContextMenu={(event) => {
          event.preventDefault()
          setSelectedEdgeId(id)
        }}
        stroke="transparent"
        strokeWidth={selected ? 28 : 22}
        style={{ cursor: 'pointer' }}
      />
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-auto"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              zIndex: 10
            }}
          >
            <span
              className={`px-2 py-0.5 rounded-md text-[0.65rem] font-medium shadow-sm backdrop-blur-sm border ${
                sourceHandle === 'true_out' || sourceHandle === 'approve_out' || sourceHandle === 'pass_out'
                  ? 'bg-green-50/90 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800'
                  : sourceHandle === 'false_out' || sourceHandle === 'reject_out' || sourceHandle === 'fail_out'
                    ? 'bg-red-50/90 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800'
                    : 'bg-white/90 text-slate-600 border-slate-200 dark:bg-slate-800/90 dark:text-slate-300 dark:border-slate-700'
              }`}
            >
              {displayLabel}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const edgeTypes = { default: CustomEdge, smoothstep: CustomEdge }

interface ContextMenuState {
  x: number
  y: number
  flowX: number
  flowY: number
  nodeId?: string
  edgeId?: string
}

function MenuItem({
  icon,
  label,
  shortcut,
  danger,
  disabled,
  onClick
}: {
  icon: string
  label: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
        disabled
          ? 'opacity-40 cursor-not-allowed text-slate-400 dark:text-slate-600'
          : danger
            ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50'
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Codicon name={icon} size={14} />
      <span className="flex-1 text-left">{label}</span>
      {shortcut && (
        <span className="text-[0.65rem] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
          {shortcut}
        </span>
      )}
    </button>
  )
}

function MenuDivider() {
  return <div className="my-1 h-px bg-slate-200 dark:bg-slate-700" />
}

export function FlowCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect: storeOnConnect,
    setSelectedNodeId,
    setSelectedEdgeId,
    selectedNodeId,
    selectedEdgeId,
    createNodeAt,
    deleteNode,
    deleteSelectedEdge,
    copyNode,
    toggleNodeLock,
    setStartNode,
    arrangeNodes,
    runWorkflow,
    selectedWorkflowId,
    running,
    setNodes,
    setEdges,
    onDrop,
    mode
  } = useAgentFlow()

  const flowInstance = useReactFlow<FlowNode, FlowEdge>()
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [snapToGrid, setSnapToGrid] = useState(true)

  useEffect(() => {
    if (!contextMenu) return
    const close = () => setContextMenu(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [contextMenu])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        return
      }

      if (e.key === 'Escape') {
        setContextMenu(null)
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedEdgeId) {
          e.preventDefault()
          deleteSelectedEdge()
        } else if (selectedNodeId) {
          e.preventDefault()
          deleteNode(selectedNodeId)
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selectedNodeId) {
        e.preventDefault()
        copyNode(selectedNodeId)
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        setNodes(nodes.map(n => ({ ...n, selected: true })))
      }

      if (e.altKey) {
        setSnapToGrid(false)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Alt') {
        setSnapToGrid(true)
      }
    }

    window.addEventListener('keydown', handler)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [selectedEdgeId, selectedNodeId, deleteNode, deleteSelectedEdge, copyNode, setNodes, nodes])

  const checkPortCompatibility = useCallback(
    (connection: Connection): boolean => {
      if (!connection.source || !connection.target) return false
      if (connection.source === connection.target) return false

      const sourceNode = nodes.find(n => n.id === connection.source)
      const targetNode = nodes.find(n => n.id === connection.target)
      if (!sourceNode || !targetNode) return false

      const sourceDef = getNodeDefinition(String(sourceNode.data.nodeType))
      const targetDef = getNodeDefinition(String(targetNode.data.nodeType))

      const sourceHandle = connection.sourceHandle || 'out'
      const targetHandle = connection.targetHandle || 'in'

      const sourcePort = sourceDef?.outputs.find(p => p.id === sourceHandle) || { type: 'ANY' as KarnaPortType }
      const targetPort = targetDef?.inputs.find(p => p.id === targetHandle) || { type: 'ANY' as KarnaPortType }

      const compatible = PORT_COMPATIBILITY[sourcePort.type as KarnaPortType]
      if (!compatible) return true
      return compatible.includes(targetPort.type as KarnaPortType) || targetPort.type === 'ANY'
    },
    [nodes]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!checkPortCompatibility(connection)) {
        return
      }
      storeOnConnect(connection)
    },
    [checkPortCompatibility, storeOnConnect]
  )

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: FlowNode) => {
      setContextMenu(null)
      setSelectedNodeId(node.id)
      setSelectedEdgeId('')
    },
    [setSelectedEdgeId, setSelectedNodeId]
  )

  const handleEdgeClick = useCallback(
    (_: React.MouseEvent, edge: FlowEdge) => {
      setContextMenu(null)
      setSelectedEdgeId(edge.id)
      setSelectedNodeId('')
    },
    [setSelectedEdgeId, setSelectedNodeId]
  )

  const handlePaneClick = useCallback(() => {
    setContextMenu(null)
  }, [])

  const handlePaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault()
      const mouseEvent = event as React.MouseEvent
      const pos = flowInstance.screenToFlowPosition({ x: mouseEvent.clientX, y: mouseEvent.clientY })
      setSelectedNodeId('')
      setSelectedEdgeId('')
      setContextMenu({ x: mouseEvent.clientX, y: mouseEvent.clientY, flowX: pos.x, flowY: pos.y })
    },
    [flowInstance, setSelectedEdgeId, setSelectedNodeId]
  )

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: FlowNode) => {
      event.preventDefault()
      setSelectedNodeId(node.id)
      setSelectedEdgeId('')
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        flowX: node.position.x,
        flowY: node.position.y,
        nodeId: node.id
      })
    },
    [setSelectedEdgeId, setSelectedNodeId]
  )

  const handleEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: FlowEdge) => {
      event.preventDefault()
      setSelectedEdgeId(edge.id)
      setSelectedNodeId('')
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        flowX: event.clientX,
        flowY: event.clientY,
        edgeId: edge.id
      })
    },
    [setSelectedEdgeId, setSelectedNodeId]
  )

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const contextNode = useMemo(
    () => (contextMenu?.nodeId ? nodes.find(n => n.id === contextMenu.nodeId) : null),
    [contextMenu, nodes]
  )

  const groupedNodeDefs = useMemo(() => {
    const groups: Record<string, typeof NODE_DEFINITIONS> = {}
    for (const cat of NODE_CATEGORIES) {
      groups[cat.id] = NODE_DEFINITIONS.filter(n => n.category === cat.id && !n.isDeprecated)
    }
    return groups
  }, [])

  const disconnectNodeEdges = useCallback(
    (nodeId: string) => {
      setEdges(current => current.filter(e => e.source !== nodeId && e.target !== nodeId))
    },
    [setEdges]
  )

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onEdgeClick={handleEdgeClick}
        onPaneClick={handlePaneClick}
        onPaneContextMenu={handlePaneContextMenu}
        onNodeContextMenu={handleNodeContextMenu}
        onEdgeContextMenu={handleEdgeContextMenu}
        onDragOver={handleDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        snapToGrid={snapToGrid}
        snapGrid={[20, 20]}
        selectNodesOnDrag={false}
        multiSelectionKeyCode={['Shift', 'Meta']}
        defaultEdgeOptions={{
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' },
          style: { stroke: '#94a3b8', strokeWidth: 1.8 }
        }}
        connectionLineStyle={{
          stroke: '#6366f1',
          strokeWidth: 2.5,
          strokeDasharray: '6 3'
        }}
        className="bg-slate-50 dark:bg-slate-900"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(148,163,184,0.3)"
          className="dark:!color-slate-700"
        />

        <Controls
          className="!bg-white dark:!bg-slate-800 !border-slate-200 dark:!border-slate-700 !shadow-lg !rounded-lg overflow-hidden [&>button]:!border-slate-200 dark:[&>button]:!border-slate-700 [&>button]:!bg-white dark:[&>button]:!bg-slate-800 [&>button]:!text-slate-600 dark:[&>button]:!text-slate-300 [&>button:hover]:!bg-slate-100 dark:[&>button:hover]:!bg-slate-700"
          position="bottom-right"
        />

        <MiniMap
          className="!bg-white/90 dark:!bg-slate-800/90 !border-slate-200 dark:!border-slate-700 !shadow-lg !rounded-lg overflow-hidden"
          position="bottom-right"
          maskColor="rgba(248,250,252,0.7)"
          style={{ bottom: 52 }}
          nodeColor={(node: FlowNode) => {
            const type = String(node.data?.nodeType || 'agent')
            return NODE_COLOR_MAP[type] || '#6366f1'
          }}
          pannable
          zoomable
        />
      </ReactFlow>

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[200px] max-h-[80vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 shadow-2xl"
          onClick={e => e.stopPropagation()}
          onContextMenu={e => e.preventDefault()}
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.nodeId && contextNode && (
            <>
              <div className="px-3 py-2 text-[0.65rem] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {contextNode.data.label}
              </div>
              <MenuDivider />
              <MenuItem
                icon="copy"
                label="复制节点"
                shortcut="Ctrl+D"
                onClick={() => {
                  copyNode(contextMenu.nodeId)
                  closeContextMenu()
                }}
              />
              <MenuDivider />
              <MenuItem
                icon={contextNode.data.isStart ? 'circle-slash' : 'play'}
                label={contextNode.data.isStart ? '取消起始标记' : '设为起始节点'}
                onClick={() => {
                  setStartNode(contextMenu.nodeId)
                  closeContextMenu()
                }}
              />
              <MenuItem
                icon={contextNode.data.locked ? 'unlock' : 'lock'}
                label={contextNode.data.locked ? '解锁节点' : '锁定节点'}
                onClick={() => {
                  toggleNodeLock(contextMenu.nodeId)
                  closeContextMenu()
                }}
              />
              <MenuItem
                icon="debug-disconnect"
                label="断开连接"
                onClick={() => {
                  disconnectNodeEdges(contextMenu.nodeId!)
                  closeContextMenu()
                }}
              />
              {selectedWorkflowId && (
                <MenuItem
                  icon="debug-step-over"
                  label="运行到此处"
                  disabled={running}
                  onClick={() => {
                    void runWorkflow(contextMenu.nodeId)
                    closeContextMenu()
                  }}
                />
              )}
              <MenuDivider />
              <MenuItem
                icon="trash"
                label="删除节点"
                danger
                onClick={() => {
                  deleteNode(contextMenu.nodeId!)
                  closeContextMenu()
                }}
              />
            </>
          )}

          {contextMenu.edgeId && (
            <>
              <div className="px-3 py-2 text-[0.65rem] font-medium text-slate-500 dark:text-slate-400">
                连线操作
              </div>
              <MenuDivider />
              <MenuItem
                icon="edit"
                label="编辑标签"
                onClick={() => {
                  const edge = edges.find(e => e.id === contextMenu.edgeId)
                  const currentLabel = typeof edge?.label === 'string' ? edge.label : ''
                  const newLabel = window.prompt('输入新的连线标签：', currentLabel)
                  if (newLabel !== null) {
                    setEdges(current => current.map(e =>
                      e.id === contextMenu.edgeId
                        ? { ...e, label: newLabel }
                        : e
                    ))
                  }
                  closeContextMenu()
                }}
              />
              <MenuItem
                icon="trash"
                label="删除连线"
                danger
                onClick={() => {
                  deleteSelectedEdge()
                  closeContextMenu()
                }}
              />
            </>
          )}

          {!contextMenu.nodeId && !contextMenu.edgeId && (
            <>
              <MenuItem
                icon="add"
                label="添加节点"
                onClick={() => {
                  createNodeAt('agent', contextMenu.flowX, contextMenu.flowY)
                  closeContextMenu()
                }}
              />
              <MenuDivider />
              {NODE_CATEGORIES.map(cat => {
                const items = groupedNodeDefs[cat.id] || []
                if (items.length === 0) return null
                return (
                  <div key={cat.id} className="px-1">
                    <div className="px-2 py-1 text-[0.6rem] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                      <Codicon name={cat.icon} size={10} />
                      {cat.label}
                    </div>
                    {items.map(def => (
                      <button
                        key={def.classType}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors"
                        onClick={() => {
                          createNodeAt(def.classType, contextMenu.flowX, contextMenu.flowY, def.displayName)
                          closeContextMenu()
                        }}
                        type="button"
                      >
                        <div
                          className="w-5 h-5 rounded flex items-center justify-center"
                          style={{ background: `${def.color}18`, color: def.color }}
                        >
                          <Codicon name={def.icon} size={11} />
                        </div>
                        <span className="flex-1 text-left">{def.displayName}</span>
                      </button>
                    ))}
                  </div>
                )
              })}
              <MenuDivider />
              <MenuItem
                icon="paste"
                label="粘贴"
                disabled
                onClick={() => { closeContextMenu() }}
              />
              <MenuItem
                icon="select-all"
                label="全选"
                shortcut="Ctrl+A"
                onClick={() => {
                  setNodes(nodes.map(n => ({ ...n, selected: true })))
                  closeContextMenu()
                }}
              />
              <MenuItem
                icon="layout"
                label="整理布局"
                onClick={() => {
                  arrangeNodes()
                  closeContextMenu()
                }}
              />
            </>
          )}
        </div>
      )}

      {!nodes.length && (
        <div className="pointer-events-none absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg text-sm text-slate-600 dark:text-slate-400">
          <Codicon name="add" size={14} className="text-blue-500" />
          右键点击画布添加节点，或从左侧拖拽节点到画布
        </div>
      )}

      <div className="absolute bottom-4 left-4 flex items-center gap-3 px-3 py-1.5 rounded-lg bg-white/80 dark:bg-slate-800/80 backdrop-blur border border-slate-200 dark:border-slate-700 shadow text-[0.65rem] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <Codicon name="trash" size={11} />
          Delete 删除
        </span>
        <span className="w-px h-3 bg-slate-300 dark:bg-slate-600" />
        <span className="flex items-center gap-1">
          <Codicon name="copy" size={11} />
          Ctrl+D 复制
        </span>
        <span className="w-px h-3 bg-slate-300 dark:bg-slate-600" />
        <span className="flex items-center gap-1">
          <Codicon name="selection" size={11} />
          Shift 多选
        </span>
        <span className="w-px h-3 bg-slate-300 dark:bg-slate-600" />
        <span>Alt 自由拖动</span>
      </div>
    </div>
  )
}
