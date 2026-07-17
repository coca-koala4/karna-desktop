import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force'
import React, { useCallback, useEffect, useRef, useState } from 'react'

export interface GraphNode {
  id: string
  name: string
  type: string
  description?: string
  properties?: Record<string, any>
  x?: number
  y?: number
  vx?: number
  vy?: number
  fx?: number | null
  fy?: number | null
}

export interface GraphEdge {
  id: string
  source: string | GraphNode
  target: string | GraphNode
  label?: string
  type?: string
  weight?: number
  properties?: Record<string, any>
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface NodeEditorProps {
  node: GraphNode | null
  edge: GraphEdge | null
  onSave: (data: Partial<GraphNode> | Partial<GraphEdge>, isEdge: boolean) => void
  onDelete: (isEdge: boolean) => void
  onClose: () => void
}

const nodeTypeColors: Record<string, string> = {
  character: '#f59e0b',
  person: '#f59e0b',
  location: '#10b981',
  place: '#10b981',
  event: '#8b5cf6',
  object: '#06b6d4',
  item: '#06b6d4',
  concept: '#ec4899',
  theme: '#ec4899',
  chapter: '#3b82f6',
  plot_point: '#ef4444',
  foreshadow: '#f97316',
  faction: '#14b8a6',
  organization: '#14b8a6',
  entity: '#6b7280',
}

const getNodeColor = (type: string) => {
  const t = (type || 'entity').toLowerCase().replace(/\s+/g, '_')

  return nodeTypeColors[t] || '#6366f1'
}

const getNodeRadius = (degree: number = 0) => {
  return Math.min(18, 6 + degree * 1.5)
}

interface ForceGraphProps {
  data: GraphData
  width?: number
  height?: number
  onNodeAdd?: (node: Partial<GraphNode>) => Promise<any>
  onNodeUpdate?: (nodeId: string, patch: Partial<GraphNode>) => Promise<any>
  onNodeDelete?: (nodeId: string) => Promise<any>
  onEdgeAdd?: (edge: Partial<GraphEdge>) => Promise<any>
  onEdgeUpdate?: (edgeId: string, patch: Partial<GraphEdge>) => Promise<any>
  onEdgeDelete?: (edgeId: string) => Promise<any>
  onRefresh?: () => void
  filterTypes?: string[]
  readOnly?: boolean
  searchTerm?: string
  selectedNodeId?: string | null
  onNodeSelect?: (node: GraphNode | null) => void
}

const DefaultNodeEditor: React.FC<NodeEditorProps> = ({ node, edge, onSave, onDelete, onClose }) => {
  const [name, setName] = useState(node?.name || edge?.label || '')
  const [type, setType] = useState(node?.type || edge?.type || 'entity')
  const [description, setDescription] = useState(node?.description || edge?.properties?.description || '')
  const isEdge = !!edge

  useEffect(() => {
    setName(node?.name || edge?.label || '')
    setType(node?.type || edge?.type || 'entity')
    setDescription(node?.description || edge?.properties?.description || '')
  }, [node?.id, edge?.id])

  const handleSave = () => {
    if (isEdge) {
      onSave({ label: name, type, properties: { ...edge?.properties, description } }, true)
    } else {
      onSave({ name, type, description }, false)
    }
  }

  return (
    <div className="absolute top-4 right-4 w-80 bg-slate-800 rounded-lg border border-slate-600 shadow-2xl z-20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-700/50 border-b border-slate-600">
        <h3 className="font-semibold text-sm text-slate-200">
          {isEdge ? ' 编辑关系' : ' 编辑节点'}
        </h3>
        <button className="text-slate-400 hover:text-white transition-colors" onClick={onClose} aria-label="关闭">×</button>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">{isEdge ? '关系标签' : '名称'}</label>
          <input
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
            onChange={e => setName(e.target.value)}
            placeholder={isEdge ? '例如：是朋友' : '例如：张三'}
            value={name}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">类型</label>
          <select
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
            onChange={e => setType(e.target.value)}
            value={type}
          >
            {isEdge ? (
              <>
                <option value="related">相关</option>
                <option value="friend">朋友</option>
                <option value="enemy">敌对</option>
                <option value="family">家人</option>
                <option value="lover">恋人</option>
                <option value="mentor">师徒</option>
                <option value="located_at">位于</option>
                <option value="participates">参与</option>
                <option value="causes">导致</option>
                <option value="owns">拥有</option>
              </>
            ) : (
              <>
                <option value="character">人物</option>
                <option value="location">地点</option>
                <option value="event">事件</option>
                <option value="object">物品</option>
                <option value="concept">概念/主题</option>
                <option value="faction">组织/势力</option>
                <option value="plot_point">情节点</option>
                <option value="foreshadow">伏笔</option>
                <option value="chapter">章节</option>
                <option value="entity">其他实体</option>
              </>
            )}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">描述</label>
          <textarea
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500 resize-none"
            onChange={e => setDescription(e.target.value)}
            placeholder="添加描述..."
            rows={3}
            value={description}
          />
        </div>
        <div className="flex gap-2 pt-2">
          <button
            className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded transition-colors"
            onClick={handleSave}
          >
            保存
          </button>
          <button
            className="px-4 py-2 bg-red-600/80 hover:bg-red-500 text-white text-sm font-medium rounded transition-colors"
            onClick={() => onDelete(!!edge)}
          >
            删除
          </button>
        </div>
      </div>
    </div>
  )
}

const AddEdgePanel: React.FC<{
  sourceId: string
  nodes: GraphNode[]
  onAdd: (targetId: string, label: string, type: string) => void
  onCancel: () => void
}> = ({ sourceId, nodes, onAdd, onCancel }) => {
  const [targetId, setTargetId] = useState('')
  const [label, setLabel] = useState('相关')
  const [type, setType] = useState('related')

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-96 bg-slate-800 rounded-lg border border-amber-500/50 shadow-2xl z-20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-amber-600/20 border-b border-amber-500/30">
        <h3 className="font-semibold text-sm text-amber-300"> 添加关系连接</h3>
        <button className="text-slate-400 hover:text-white transition-colors" onClick={onCancel} aria-label="关闭">×</button>
      </div>
      <div className="p-4 space-y-3">
        <div className="text-xs text-slate-400">从节点: <span className="text-amber-300">{nodes.find(n => n.id === sourceId)?.name || sourceId}</span></div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">连接到</label>
          <select
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
            onChange={e => setTargetId(e.target.value)}
            value={targetId}
          >
            <option value="">选择目标节点...</option>
            {nodes.filter(n => n.id !== sourceId).map(n => (
              <option key={n.id} value={n.id}>{n.name} ({n.type})</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-slate-400 mb-1">关系类型</label>
            <select
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
              onChange={e => setType(e.target.value)}
              value={type}
            >
              <option value="related">相关</option>
              <option value="friend">朋友</option>
              <option value="enemy">敌对</option>
              <option value="family">家人</option>
              <option value="lover">恋人</option>
              <option value="mentor">师徒</option>
              <option value="located_at">位于</option>
              <option value="participates">参与</option>
              <option value="causes">导致</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">标签</label>
            <input
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
              onChange={e => setLabel(e.target.value)}
              value={label}
            />
          </div>
        </div>
        <button
          className="w-full px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
          disabled={!targetId}
          onClick={() => targetId && onAdd(targetId, label, type)}
        >
          创建连接
        </button>
      </div>
    </div>
  )
}

const AddNodePanel: React.FC<{
  onAdd: (name: string, type: string, description: string) => void
  onCancel: () => void
}> = ({ onAdd, onCancel }) => {
  const [name, setName] = useState('')
  const [type, setType] = useState('character')
  const [description, setDescription] = useState('')

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-80 bg-slate-800 rounded-lg border border-emerald-500/50 shadow-2xl z-20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-emerald-600/20 border-b border-emerald-500/30">
        <h3 className="font-semibold text-sm text-emerald-300"> 添加新节点</h3>
        <button className="text-slate-400 hover:text-white transition-colors" onClick={onCancel} aria-label="关闭">×</button>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">名称</label>
          <input
            autoFocus
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-emerald-500"
            onChange={e => setName(e.target.value)}
            placeholder="输入节点名称..."
            value={name}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">类型</label>
          <select
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-emerald-500"
            onChange={e => setType(e.target.value)}
            value={type}
          >
            <option value="character"> 人物</option>
            <option value="location"> 地点</option>
            <option value="event"> 事件</option>
            <option value="object"> 物品</option>
            <option value="concept"> 概念/主题</option>
            <option value="faction"> 组织/势力</option>
            <option value="plot_point"> 情节点</option>
            <option value="foreshadow"> 伏笔</option>
            <option value="entity"> 其他实体</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">描述（可选）</label>
          <textarea
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-emerald-500 resize-none"
            onChange={e => setDescription(e.target.value)}
            placeholder="添加简短描述..."
            rows={2}
            value={description}
          />
        </div>
        <button
          className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
          disabled={!name.trim()}
          onClick={() => name.trim() && onAdd(name, type, description)}
        >
          添加节点
        </button>
      </div>
    </div>
  )
}

export const ForceGraph: React.FC<ForceGraphProps> = ({
  data,
  width: initialWidth = 800,
  height: initialHeight = 600,
  onNodeAdd,
  onNodeUpdate,
  onNodeDelete,
  onEdgeAdd,
  onEdgeDelete,
  onEdgeUpdate,
  onRefresh,
  filterTypes,
  readOnly = false,
  searchTerm = '',
  selectedNodeId: externalSelectedId,
  onNodeSelect,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const simRef = useRef<any>(null)
  const nodesRef = useRef<GraphNode[]>([])
  const edgesRef = useRef<any[]>([])
  const rafRef = useRef<number | null>(null)
  const transformRef = useRef({ x: 0, y: 0, k: 1 })
  const savePositionTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [viewSize, setViewSize] = useState({ width: initialWidth, height: initialHeight })
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 })
  const [, forceRender] = useState(0)
  const [internalSelectedNode, setInternalSelectedNode] = useState<GraphNode | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<any>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [addMode, setAddMode] = useState<'node' | 'edge' | null>(null)
  const [edgeSource, setEdgeSource] = useState<string | null>(null)
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const dragStart = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 })
  const isPanning = useRef(false)
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 })

  const selectedNode = externalSelectedId != null
    ? nodesRef.current.find(n => n.id === externalSelectedId) || internalSelectedNode
    : internalSelectedNode

  const computeDegrees = useCallback((nodeList: GraphNode[], edgeList: GraphEdge[]) => {
    const deg: Record<string, number> = {}
    const inDeg: Record<string, number> = {}
    const outDeg: Record<string, number> = {}
    nodeList.forEach(n => { deg[n.id] = 0; inDeg[n.id] = 0; outDeg[n.id] = 0 })
    edgeList.forEach(e => {
      const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
      const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id
      deg[sid] = (deg[sid] || 0) + 1
      deg[tid] = (deg[tid] || 0) + 1
      outDeg[sid] = (outDeg[sid] || 0) + 1
      inDeg[tid] = (inDeg[tid] || 0) + 1
    })

    return { deg, inDeg, outDeg }
  }, [])

  const getNeighbors = useCallback((nodeId: string) => {
    const neighbors = new Set<string>()
    edgesRef.current.forEach(e => {
      const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
      const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id

      if (sid === nodeId) {neighbors.add(tid)}

      if (tid === nodeId) {neighbors.add(sid)}
    })

    return neighbors
  }, [])

  useEffect(() => {
    const filteredNodes = filterTypes && filterTypes.length > 0
      ? data.nodes.filter(n => filterTypes.includes(n.type))
      : data.nodes

    const nodeIds = new Set(filteredNodes.map(n => n.id))

    const filteredEdges = data.edges.filter(e => {
      const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
      const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id

      return nodeIds.has(sid) && nodeIds.has(tid)
    })

    const nodeMap: Record<string, GraphNode> = {}

    const ns = filteredNodes.map(n => {
      const existing = nodesRef.current.find(nn => nn.id === n.id)
      const merged = { ...existing, ...n }
      if (merged.fx != null && merged.fy != null) {
        merged.x = merged.fx
        merged.y = merged.fy
      }
      nodeMap[n.id] = merged

      return merged
    })

    const es = filteredEdges.map(e => ({
      ...e,
      source: nodeMap[typeof e.source === 'string' ? e.source : (e.source as GraphNode).id] || e.source,
      target: nodeMap[typeof e.target === 'string' ? e.target : (e.target as GraphNode).id] || e.target,
    })).filter(e => e.source && e.target && typeof e.source !== 'string' && typeof e.target !== 'string') as any

    nodesRef.current = ns
    edgesRef.current = es

    const cx = viewSize.width / 2
    const cy = viewSize.height / 2

    if (simRef.current) {simRef.current.stop()}
    if (rafRef.current) {cancelAnimationFrame(rafRef.current); rafRef.current = null}

    const { deg } = computeDegrees(ns, filteredEdges)

    const hasFixedPositions = ns.some(n => n.fx != null && n.fy != null)

    const sim = forceSimulation(ns as any)
      .force('link', forceLink(es as any).id((d: any) => d.id).distance(120).strength(0.4))
      .force('charge', forceManyBody().strength(-400).distanceMax(500))
      .force('center', forceCenter(cx, cy))
      .force('collide', forceCollide().radius((d: any) => getNodeRadius(deg[d.id] || 0) + 15).strength(0.8))
      .force('x', forceX(cx).strength(0.05))
      .force('y', forceY(cy).strength(0.05))
      .alpha(hasFixedPositions ? 0.3 : 0.8)
      .alphaDecay(0.03)

    let ticking = false
    sim.on('tick', () => {
      if (ticking) return
      ticking = true
      rafRef.current = requestAnimationFrame(() => {
        ticking = false
        forceRender(v => v + 1)
      })
    })
    simRef.current = sim

    return () => {
      sim.stop()
      if (rafRef.current) {cancelAnimationFrame(rafRef.current)}
    }
  }, [data, viewSize.width, viewSize.height, filterTypes, computeDegrees])

  const screenToSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current

    if (!svg) {return { x: 0, y: 0 }}
    const rect = svg.getBoundingClientRect()

    return {
      x: (clientX - rect.left - transformRef.current.x) / transformRef.current.k,
      y: (clientY - rect.top - transformRef.current.y) / transformRef.current.k,
    }
  }, [])

  const schedulePositionSave = useCallback((nodeId: string, x: number, y: number) => {
    if (!onNodeUpdate) return
    if (savePositionTimer.current) {clearTimeout(savePositionTimer.current)}
    savePositionTimer.current = setTimeout(() => {
      void onNodeUpdate(nodeId, { x, y, fx: x, fy: y })
    }, 500)
  }, [onNodeUpdate])

  const handleMouseDown = useCallback((e: React.MouseEvent, node?: GraphNode) => {
    if (e.button !== 0) {return}
    e.stopPropagation()

    if (node) {
      if (addMode === 'edge' && !edgeSource) {
        setEdgeSource(node.id)

        return
      }

      if (addMode === 'edge' && edgeSource && edgeSource !== node.id) {
        return
      }

      setDragging(node.id)
      dragStart.current = {
        x: e.clientX, y: e.clientY,
        nodeX: node.x || 0, nodeY: node.y || 0,
      }
      simRef.current?.alphaTarget(0.3).restart()
      node.fx = node.x
      node.fy = node.y
    } else {
      isPanning.current = true
      panStart.current = { x: e.clientX, y: e.clientY, tx: transformRef.current.x, ty: transformRef.current.y }
    }
  }, [addMode, edgeSource])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging) {
      const node = nodesRef.current.find(n => n.id === dragging)

      if (!node) {return}
      const dx = (e.clientX - dragStart.current.x) / transformRef.current.k
      const dy = (e.clientY - dragStart.current.y) / transformRef.current.k
      node.fx = dragStart.current.nodeX + dx
      node.fy = dragStart.current.nodeY + dy
      simRef.current?.alpha(0.3).restart()
    } else if (isPanning.current) {
      const dx = e.clientX - panStart.current.x
      const dy = e.clientY - panStart.current.y
      const newT = { x: panStart.current.tx + dx, y: panStart.current.ty + dy, k: transformRef.current.k }
      transformRef.current = newT
      setTransform(newT)
    }
  }, [dragging])

  const handleMouseUp = useCallback((e: React.MouseEvent, node?: GraphNode) => {
    if (dragging) {
      const n = nodesRef.current.find(nn => nn.id === dragging)

      if (n && Math.abs((e.clientX - dragStart.current.x)) < 5 && Math.abs((e.clientY - dragStart.current.y)) < 5) {
        setInternalSelectedNode(n)
        setSelectedEdge(null)
        onNodeSelect?.(n)
      }

      if (n) {
        const finalX = n.fx ?? n.x ?? 0
        const finalY = n.fy ?? n.y ?? 0
        schedulePositionSave(n.id, finalX, finalY)
      }

      setDragging(null)
      simRef.current?.alphaTarget(0)
    }

    isPanning.current = false
  }, [dragging, onNodeSelect, schedulePositionSave])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const svg = svgRef.current

    if (!svg) {return}
    const rect = svg.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newK = Math.max(0.2, Math.min(4, transformRef.current.k * delta))
    const newX = mx - (mx - transformRef.current.x) * (newK / transformRef.current.k)
    const newY = my - (my - transformRef.current.y) * (newK / transformRef.current.k)
    const newT = { x: newX, y: newY, k: newK }
    transformRef.current = newT
    setTransform(newT)
  }, [])

  const handleNodeDoubleClick = useCallback((e: React.MouseEvent, node: GraphNode) => {
    e.stopPropagation()

    if (readOnly) {return}
    setInternalSelectedNode(node)
    setSelectedEdge(null)
    onNodeSelect?.(node)
  }, [readOnly, onNodeSelect])

  const handleEdgeClick = useCallback((e: React.MouseEvent, edge: any) => {
    e.stopPropagation()
    setSelectedEdge(edge)
    setInternalSelectedNode(null)
    onNodeSelect?.(null)
  }, [onNodeSelect])

  const handleBgClick = useCallback(() => {
    if (!isPanning.current) {
      setInternalSelectedNode(null)
      setSelectedEdge(null)
      setEdgeSource(null)
      onNodeSelect?.(null)
    }
  }, [onNodeSelect])

  const fitToView = useCallback(() => {
    const nodes = nodesRef.current
    if (nodes.length === 0 || !svgRef.current) return

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    nodes.forEach(n => {
      if (n.x != null && n.y != null) {
        minX = Math.min(minX, n.x)
        minY = Math.min(minY, n.y)
        maxX = Math.max(maxX, n.x)
        maxY = Math.max(maxY, n.y)
      }
    })

    if (!isFinite(minX)) return

    const padding = 80
    const dataWidth = maxX - minX + padding * 2
    const dataHeight = maxY - minY + padding * 2
    const viewWidth = viewSize.width
    const viewHeight = viewSize.height

    const k = Math.min(viewWidth / dataWidth, viewHeight / dataHeight, 1.5)
    const x = (viewWidth - (minX + maxX) * k) / 2
    const y = (viewHeight - (minY + maxY) * k) / 2

    const newT = { x, y, k }
    transformRef.current = newT
    setTransform(newT)
  }, [viewSize.width, viewSize.height])

  useEffect(() => {
    if (!containerRef.current) return

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect
        if (width > 0 && height > 0) {
          setViewSize({ width, height })
        }
      }
    })

    ro.observe(containerRef.current)

    return () => { ro.disconnect() }
  }, [])

  const { deg, inDeg, outDeg } = computeDegrees(nodesRef.current, data.edges)

  const handleAddNode = async (name: string, type: string, description: string) => {
    if (onNodeAdd) {
      await onNodeAdd({ name, type, description })
      setAddMode(null)
      onRefresh?.()
    }
  }

  const handleAddEdge = async (targetId: string, label: string, type: string) => {
    if (onEdgeAdd && edgeSource) {
      await onEdgeAdd({ source: edgeSource, target: targetId, label, type })
      setEdgeSource(null)
      setAddMode(null)
      onRefresh?.()
    }
  }

  const handleSaveNode = async (patch: Partial<GraphNode>) => {
    if (selectedNode && onNodeUpdate) {
      await onNodeUpdate(selectedNode.id, patch)
      setInternalSelectedNode(null)
      onNodeSelect?.(null)
      onRefresh?.()
    }
  }

  const handleSaveEdge = async (patch: any) => {
    if (selectedEdge && onEdgeUpdate) {
      const { id, source, target, ...restPatch } = patch
      await onEdgeUpdate(selectedEdge.id, restPatch)
      setSelectedEdge(null)
      onRefresh?.()
    } else if (selectedEdge && !onEdgeUpdate && onEdgeAdd) {
      onRefresh?.()
      setSelectedEdge(null)
    }
  }

  const handleDeleteNode = async () => {
    if (selectedNode && onNodeDelete) {
      await onNodeDelete(selectedNode.id)
      setInternalSelectedNode(null)
      onNodeSelect?.(null)
      onRefresh?.()
    }
  }

  const handleDeleteEdge = async () => {
    if (selectedEdge && onEdgeDelete) {
      await onEdgeDelete(selectedEdge.id)
      setSelectedEdge(null)
      onRefresh?.()
    }
  }

  const neighbors = selectedNode ? getNeighbors(selectedNode.id) : new Set<string>()
  const searchLower = searchTerm.toLowerCase().trim()

  const searchMatches = searchLower
    ? new Set(nodesRef.current.filter(n => n.name.toLowerCase().includes(searchLower)).map(n => n.id))
    : null

  return (
    <div ref={containerRef} className="relative w-full h-full bg-slate-900/50 rounded-lg overflow-hidden border border-slate-700">
      <svg
        className="w-full h-full cursor-grab active:cursor-grabbing"
        height={viewSize.height}
        onClick={handleBgClick}
        onMouseDown={e => handleMouseDown(e)}
        onMouseLeave={handleMouseUp}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        ref={svgRef}
        style={{ cursor: isPanning.current ? 'grabbing' : 'grab' }}
        width={viewSize.width}
      >
        <defs>
          <marker id="arrowhead" markerHeight="7" markerWidth="10" orient="auto" refX="20" refY="3.5">
            <polygon fill="#64748b" points="0 0, 10 3.5, 0 7" />
          </marker>
          <marker id="arrowhead-hl" markerHeight="7" markerWidth="10" orient="auto" refX="20" refY="3.5">
            <polygon fill="#f59e0b" points="0 0, 10 3.5, 0 7" />
          </marker>
          <filter id="glow">
            <feGaussianBlur result="coloredBlur" stdDeviation="3" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient cx="50%" cy="50%" id="nodeGlow" r="50%">
            <stop offset="0%" stopColor="white" stopOpacity="0.3" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect fill="transparent" height="100%" width="100%" />
        <g ref={gRef} transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}>
          {edgesRef.current.map(edge => {
            const s = edge.source as GraphNode
            const t = edge.target as GraphNode

            if (!s || !t || s.x == null || t.x == null || s.y == null || t.y == null) {return null}
            const isSelectedEdge = selectedEdge?.id === edge.id
            const isHoveredEdge = hoveredNode && (s.id === hoveredNode || t.id === hoveredNode)
            const isSelectedNodeEdge = selectedNode && (s.id === selectedNode.id || t.id === selectedNode.id)
            const isSearchMatchEdge = searchMatches && (searchMatches.has(s.id) || searchMatches.has(t.id))
            const isHighlightedEdge = isSelectedEdge || isHoveredEdge || isSelectedNodeEdge || isSearchMatchEdge

            let edgeOpacity = 1

            if (selectedNode && !isSelectedNodeEdge) {edgeOpacity = 0.15}
            else if (searchMatches && !isSearchMatchEdge) {edgeOpacity = 0.15}

            const midX = (s.x + t.x) / 2
            const midY = (s.y + t.y) / 2
            const r1 = getNodeRadius(deg[s.id] || 0)
            const r2 = getNodeRadius(deg[t.id] || 0)
            const dx = t.x - s.x
            const dy = t.y - s.y
            const dist = Math.sqrt(dx * dx + dy * dy) || 1
            const x1 = s.x + (dx / dist) * r1
            const y1 = s.y + (dy / dist) * r1
            const x2 = t.x - (dx / dist) * (r2 + 5)
            const y2 = t.y - (dy / dist) * (r2 + 5)

            return (
              <g key={edge.id} opacity={edgeOpacity}>
                <line
                  className="transition-all duration-150 cursor-pointer" markerEnd={isHighlightedEdge ? 'url(#arrowhead-hl)' : 'url(#arrowhead)'} onClick={e => handleEdgeClick(e, edge)} stroke={isHighlightedEdge ? '#f59e0b' : '#475569'}
                  strokeWidth={isHighlightedEdge ? 2.5 : 1.2}
                  x1={x1}
                  x2={x2}
                  y1={y1}
                  y2={y2}
                />
                {edge.label && (
                  <g>
                    <rect
                      className="pointer-events-none"
                      fill={isHighlightedEdge ? '#f59e0b' : '#1e293b'}
                      height={16}
                      rx={3}
                      stroke={isHighlightedEdge ? '#fbbf24' : '#334155'}
                      strokeWidth={1}
                      width={edge.label.length * 8 + 8}
                      x={midX - edge.label.length * 4 - 4}
                      y={midY - 8}
                    />
                    <text
                      className="pointer-events-none select-none"
                      fill={isHighlightedEdge ? '#000' : '#94a3b8'}
                      fontSize={10}
                      fontWeight={500}
                      textAnchor="middle"
                      x={midX}
                      y={midY + 4}
                    >
                      {edge.label}
                    </text>
                  </g>
                )}
              </g>
            )
          })}
          {nodesRef.current.map(node => {
            if (node.x == null || node.y == null) {return null}
            const r = getNodeRadius(deg[node.id] || 0)
            const isSelected = selectedNode?.id === node.id
            const isHovered = hoveredNode === node.id
            const isEdgeSource = edgeSource === node.id
            const isNeighbor = neighbors.has(node.id)
            const color = getNodeColor(node.type)
            const isSearchMatch = searchMatches ? searchMatches.has(node.id) : true

            let nodeOpacity = 1

            if (selectedNode && !isSelected && !isNeighbor) {nodeOpacity = 0.3}
            else if (searchMatches && !isSearchMatch) {nodeOpacity = 0.3}

            const isRelated = hoveredNode && edgesRef.current.some((e: any) => {
              const sid = typeof e.source === 'string' ? e.source : (e.source as GraphNode).id
              const tid = typeof e.target === 'string' ? e.target : (e.target as GraphNode).id

              return (sid === hoveredNode && tid === node.id) || (tid === hoveredNode && sid === node.id)
            })

            return (
              <g key={node.id} opacity={nodeOpacity}>
                {(isSelected || isHovered || isEdgeSource || isSearchMatch) && (
                  <circle
                    cx={node.x} cy={node.y}
                    fill="none"
                    opacity={0.6}
                    r={r + (isSelected ? 10 : isSearchMatch ? 6 : 8)}
                    stroke={isEdgeSource ? '#fbbf24' : isSelected ? '#f59e0b' : isSearchMatch ? '#22c55e' : color}
                    strokeDasharray={isEdgeSource ? '4 3' : isSearchMatch && !isSelected ? '3 2' : 'none'}
                    strokeWidth={isSelected ? 3 : 2}
                  />
                )}
                <circle
                  className="cursor-pointer transition-all duration-150" cx={node.x} cy={node.y}
                  fill={color}
                  onDoubleClick={e => handleNodeDoubleClick(e, node)}
                  onMouseDown={e => handleMouseDown(e, node)}
                  onMouseEnter={() => setHoveredNode(node.id)}
                  onMouseLeave={() => setHoveredNode(null)}
                  onMouseUp={e => handleMouseUp(e, node)}
                  r={r}
                  stroke={isSelected ? '#fbbf24' : isEdgeSource ? '#fbbf24' : isNeighbor ? '#fff' : isSearchMatch ? '#22c55e' : 'rgba(255,255,255,0.3)'}
                  strokeWidth={isSelected || isEdgeSource ? 3 : isNeighbor || isSearchMatch ? 2 : 1.5}
                  style={{
                    filter: isHovered || isSelected || isSearchMatch ? 'url(#glow)' : 'none',
                    cursor: addMode === 'edge' ? 'crosshair' : dragging === node.id ? 'grabbing' : 'pointer',
                  }}
                />
                <circle
                  className="pointer-events-none" cx={node.x} cy={node.y}
                  fill="url(#nodeGlow)"
                  r={r * 0.6}
                />
                <circle className="pointer-events-none" cx={node.x} cy={node.y} fill="currentColor" r={Math.max(2, r * 0.12)} />
                <text
                  className="pointer-events-none select-none"
                  fill={isSelected ? '#fbbf24' : isNeighbor || isSearchMatch ? '#fff' : '#cbd5e1'}
                  fontSize={11}
                  fontWeight={isSelected || isHovered || isSearchMatch ? 600 : 400}
                  style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
                  textAnchor="middle"
                  x={node.x}
                  y={node.y + r + 14}
                >
                  {node.name.length > 10 ? node.name.slice(0, 10) + '…' : node.name}
                </text>
                {isHovered && (
                  <g>
                    {(() => {
                      const tooltipLines: string[] = []
                      tooltipLines.push(`${node.name}`)
                      tooltipLines.push(`类型: ${node.type}`)

                      if (node.description) {
                        const desc = node.description.slice(0, 50) + (node.description.length > 50 ? '...' : '')
                        tooltipLines.push(desc)
                      }

                      tooltipLines.push(`连接: ${deg[node.id] || 0} (入:${inDeg[node.id]||0} 出:${outDeg[node.id]||0})`)
                      const lineHeight = 14

                      const boxWidth = Math.max(
                        180,
                        ...tooltipLines.map(l => l.length * 7 + 20)
                      )

                      const boxHeight = tooltipLines.length * lineHeight + 12

                      return (
                        <>
                          <rect
                            fill="#1e293b"
                            height={boxHeight}
                            rx={6}
                            stroke="#475569"
                            strokeWidth={1}
                            width={boxWidth}
                            x={(node.x ?? 0) + r + 8}
                            y={(node.y ?? 0) - 10}
                          />
                          {tooltipLines.map((line, i) => (
                            <text
                              className="pointer-events-none select-none"
                              fill={i === 0 ? '#fbbf24' : i === 1 ? '#94a3b8' : '#e2e8f0'}
                              fontSize={i === 0 ? 12 : 10}
                              fontWeight={i === 0 ? 600 : 400}
                              key={i}
                              x={(node.x ?? 0) + r + 16}
                              y={(node.y ?? 0) + 6 + i * lineHeight}
                            >
                              {line}
                            </text>
                          ))}
                        </>
                      )
                    })()}
                  </g>
                )}
              </g>
            )
          })}
        </g>
      </svg>

      <div className="absolute top-3 left-3 flex gap-2">
        {!readOnly && (
          <>
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${addMode === 'node' ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              onClick={() => { setAddMode(addMode === 'node' ? null : 'node'); setEdgeSource(null); setInternalSelectedNode(null); setSelectedEdge(null); onNodeSelect?.(null) }}
            >
               添加节点
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${addMode === 'edge' ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'}`}
              onClick={() => { setAddMode(addMode === 'edge' ? null : 'edge'); setEdgeSource(null); setInternalSelectedNode(null); setSelectedEdge(null); onNodeSelect?.(null) }}
            >
               连接节点
            </button>
          </>
        )}
        <button
          className="px-3 py-1.5 bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs font-medium rounded-md transition-colors"
          onClick={fitToView}
          title="适应视图"
        >
           适应视图
        </button>
        {onRefresh && (
          <button
            className="px-3 py-1.5 bg-slate-700 text-slate-300 hover:bg-slate-600 text-xs font-medium rounded-md transition-colors"
            onClick={onRefresh}
          >
             重新布局
          </button>
        )}
      </div>

      <div className="absolute bottom-3 left-3 flex items-center gap-3 text-xs text-slate-400 bg-slate-800/80 backdrop-blur px-3 py-1.5 rounded-md">
        <span> 拖拽移动（自动保存） · 滚轮缩放 · 双击编辑 · 点击节点选中{addMode === 'edge' ? ' · 选择起点后再点终点' : ''}</span>
      </div>

      <div className="absolute top-3 right-3 flex flex-col gap-1 text-xs bg-slate-800/80 backdrop-blur px-3 py-2 rounded-md">
        <div className="text-slate-400 font-medium mb-1">图例</div>
        {[
          ['character', ' 人物'],
          ['location', ' 地点'],
          ['event', ' 事件'],
          ['object', ' 物品'],
          ['concept', ' 概念'],
          ['faction', ' 组织'],
        ].map(([type, label]) => (
          <div className="flex items-center gap-2" key={type}>
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getNodeColor(type) }} />
            <span className="text-slate-300">{label}</span>
          </div>
        ))}
      </div>

      {addMode === 'edge' && edgeSource && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs px-4 py-2 rounded-md">
          已选择起点，请点击目标节点完成连接（或点击空白取消）
        </div>
      )}

      {(internalSelectedNode || selectedEdge) && !readOnly && !externalSelectedId && (
        <DefaultNodeEditor
          edge={selectedEdge}
          node={internalSelectedNode}
          onClose={() => { setInternalSelectedNode(null); setSelectedEdge(null); onNodeSelect?.(null) }}
          onDelete={(isEdge: boolean) => { void (isEdge ? handleDeleteEdge() : handleDeleteNode()) }}
          onSave={(data, isEdge: boolean) => { void (isEdge ? handleSaveEdge(data) : handleSaveNode(data as Partial<GraphNode>)) }}
        />
      )}

      {addMode === 'node' && !readOnly && (
        <AddNodePanel
          onAdd={handleAddNode}
          onCancel={() => setAddMode(null)}
        />
      )}

      {addMode === 'edge' && edgeSource && !readOnly && (
        <AddEdgePanel
          nodes={nodesRef.current}
          onAdd={handleAddEdge}
          onCancel={() => { setAddMode(null); setEdgeSource(null) }}
          sourceId={edgeSource}
        />
      )}

      {nodesRef.current.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-500 pointer-events-none">
          <div className="text-5xl mb-3"></div>
          <div className="text-lg font-medium text-slate-400">暂无图谱数据</div>
          <div className="text-sm mt-1">点击「分析构建」生成图谱，或手动添加节点</div>
        </div>
      )}
    </div>
  )
}
