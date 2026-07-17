import '@xyflow/react/dist/style.css'

import {
  addEdge,
  type Connection,
  MarkerType,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow
} from '@xyflow/react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type * as React from 'react'

import {
  WriterWorkflow,
  FlowNode,
  FlowEdge,
  WorkflowAgent,
  WorkflowRun,
  NODE_DEFINITIONS,
  NODE_DEF_MAP,
  getNodeDefinition,
  NODE_COLOR_MAP,
  STATUS_LABEL,
  NODE_TYPE_LABEL,
  migrateWorkflow,
  validateWorkflow,
  createWorkflowTemplate,
  getBuiltinAgents,
  DEFAULT_LIMITS,
  DEFAULT_RUNTIME_CONFIG,
  NodeRunStatus,
  WorkflowValidationResult,
  NodeResourceConfig,
  NodeResourceItem,
  NodeResourceMcpItem,
  FlowNodeData,
  WorkflowNodeType,
  normalizeWorkflowAgent,
  WorkflowNodeRecord,
  WorkflowEdgeRecord
} from '@/app/karna-workshop/workflow-schema'
import { notify, notifyError } from '@/store/notifications'

export type {
  WriterWorkflow,
  FlowNode,
  FlowEdge,
  WorkflowAgent,
  WorkflowRun,
  NodeRunStatus,
  WorkflowValidationResult,
  NodeResourceConfig,
  NodeResourceItem,
  NodeResourceMcpItem,
  FlowNodeData,
  WorkflowNodeType
}

type WorkflowState = 'loading' | 'ready' | 'error'

type RunPanelTab = 'input' | 'output' | 'logs' | 'review'
type InputMode = 'manual' | 'current_file' | 'selection' | 'project_context'
type FlowMode = 'edit' | 'debug' | 'run'
type EdgeType = FlowEdge

interface AgentFlowContextValue {
  state: WorkflowState
  selectedWorkflowId: string
  workflowName: string
  currentWorkflow: WriterWorkflow

  nodes: FlowNode[]
  edges: FlowEdge[]
  selectedNodeId: string
  selectedEdgeId: string
  selectedNode: FlowNode | null
  selectedEdge: FlowEdge | null

  agents: WorkflowAgent[]
  selectedAgentId: string
  selectedAgent: WorkflowAgent | null
  builtinAgentIds: Set<string>

  lastRun: WorkflowRun | undefined
  running: boolean
  saving: boolean
  hasUnsavedChanges: boolean
  lastSavedAt: string | null
  validation: WorkflowValidationResult

  inputText: string
  humanReviewText: string
  pendingReviewNode: FlowNode | null
  runPanelVisible: boolean
  runPanelTab: RunPanelTab
  inputMode: InputMode

  mode: FlowMode
  sidebarCollapsed: boolean
  workshopTheme: string

  nodeResources: NodeResourceConfig
  savedWorkflows: WriterWorkflow[]

  load: () => Promise<void>
  saveWorkflow: () => Promise<string>
  runWorkflow: (nodeId?: string) => Promise<void>
  stopWorkflow: () => Promise<void>
  continueWorkflow: () => Promise<void>
  markNodeAction: (nodeId: string, action: 'accept' | 'reject' | 'skip' | 'edit') => Promise<void>

  applyWorkflow: (workflow: WriterWorkflow) => void
  applyTemplate: (kind: 'basic_writing' | 'critique_loop' | 'chapter' | 'polish' | 'foreshadow' | 'unstuck' | 'empty' | 'simple' | 'critique') => void
  applyEmptyTemplate: () => void

  createNodeAt: (type: WorkflowNodeType, x: number, y: number, label?: string, resourceData?: any) => void
  deleteNode: (nodeId: string) => void
  deleteSelectedEdge: () => void

  copyNode: (nodeId?: string) => void
  toggleNodeLock: (nodeId?: string) => void
  setStartNode: (nodeId?: string) => void
  focusNode: (nodeId: string) => void
  arrangeNodes: () => void

  patchNode: (patch: Partial<FlowNodeData>) => void
  patchEdge: (patch: Partial<FlowEdge>) => void
  patchAgent: (patch: Partial<WorkflowAgent>) => void
  patchRuntimeConfig: (patch: Partial<typeof DEFAULT_RUNTIME_CONFIG>) => void
  patchLimits: (patch: Partial<typeof DEFAULT_LIMITS>) => void

  createAgent: (template?: Partial<WorkflowAgent>) => Promise<void>
  deleteAgent: (agentId: string) => void
  deleteWorkflow: (workflowId: string) => void

  onNodesChange: (changes: any) => void
  onEdgesChange: (changes: any) => void
  onConnect: (connection: Connection) => void
  setNodes: (nodes: FlowNode[] | ((prev: FlowNode[]) => FlowNode[])) => void
  setEdges: (edges: FlowEdge[] | ((prev: FlowEdge[]) => FlowEdge[])) => void
  onDrop: (event: React.DragEvent) => void

  startEdgeFrom: (nodeId: string) => void
  cancelPendingEdge: () => void
  pendingEdgeSource: string

  setSelectedNodeId: (id: string) => void
  setSelectedAgentId: (id: string) => void
  setSelectedEdgeId: (id: string) => void
  setInputText: (text: string) => void
  setHumanReviewText: (text: string) => void
  setRunPanelVisible: (visible: boolean) => void
  setRunPanelTab: (tab: RunPanelTab) => void
  setInputMode: (mode: InputMode) => void
  setMode: (mode: FlowMode) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setWorkflowName: (name: string) => void

  reloadResources: () => Promise<void>
  openInNewWindow: () => void
}

const AgentFlowContext = createContext<AgentFlowContextValue | null>(null)

const BUILTIN_AGENT_ICON: Record<string, string> = {
  outline_planner: 'list-ordered',
  chapter_writer: 'edit',
  style_polisher: 'sparkles',
  plot_critic: 'git-commit',
  character_critic: 'person',
  style_critic: 'symbol-misc',
  worldbuilding_critic: 'globe',
  critique_aggregator: 'organization',
  revision_agent: 'refresh'
}

const LEGACY_BUILTIN_AGENT_IDS = new Set([
  'outline_architect', 'foreshadow_manager', 'logic_reviewer',
  'compliance_guard', 'critic_editor', 'setting_keeper', 'plot_continuation'
])

export function getBuiltinAgentIcon(id: string): string {
  return BUILTIN_AGENT_ICON[id] || 'robot'
}

export function isBuiltinAgentId(id: string): boolean {
  return id in BUILTIN_AGENT_ICON || LEGACY_BUILTIN_AGENT_IDS.has(id)
}

function resolveAgentIcon(agent: { id: string; avatar?: string }): string {
  if (agent.avatar) return 'account'
  return getBuiltinAgentIcon(agent.id)
}

export function useAgentFlow(): AgentFlowContextValue {
  const ctx = useContext(AgentFlowContext)
  if (!ctx) throw new Error('useAgentFlow must be used within AgentFlowProvider')
  return ctx
}

const STORAGE_KEY = 'karna_flow_workflow'
const WORKFLOW_ID_PREFIX = 'local_'
const HIDDEN_BUILTIN_KEY = 'karna_flow_hidden_builtin_agents'
const BUILTIN_OVERRIDES_KEY = 'karna_flow_builtin_agent_overrides'

function loadHiddenBuiltins(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_BUILTIN_KEY)
    if (raw) return new Set(JSON.parse(raw))
  } catch {}
  return new Set()
}

function saveHiddenBuiltins(ids: Set<string>) {
  try { localStorage.setItem(HIDDEN_BUILTIN_KEY, JSON.stringify([...ids])) } catch {}
}

function loadBuiltinOverrides(): Record<string, Partial<WorkflowAgent>> {
  try {
    const raw = localStorage.getItem(BUILTIN_OVERRIDES_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {}
}

function saveBuiltinOverrides(overrides: Record<string, Partial<WorkflowAgent>>) {
  try { localStorage.setItem(BUILTIN_OVERRIDES_KEY, JSON.stringify(overrides)) } catch {}
}

function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (typeof window !== 'undefined' && (window as any).karnaDesktop?.api) {
    return (window as any).karnaDesktop.api({ path, method, body }) as Promise<T>
  }
  console.log(`[Mock API] ${method} ${path}`, body)
  return new Promise(resolve => setTimeout(() => resolve({ ok: true } as T), 100))
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
}

function edgeStatus(edge: { source: string; target: string }, run?: WorkflowRun): NodeRunStatus | '' {
  const sourceStatus = run?.node_statuses?.[edge.source]?.status as NodeRunStatus | undefined
  const targetStatus = run?.node_statuses?.[edge.target]?.status as NodeRunStatus | undefined

  if (sourceStatus === 'running' || targetStatus === 'running') return 'running'
  if (sourceStatus === 'failed' || targetStatus === 'failed') return 'failed'
  if (sourceStatus === 'waiting_human' || targetStatus === 'waiting_human') return 'waiting_human'
  if ((sourceStatus as string) === 'success' && ((targetStatus as string) === 'success' || targetStatus === 'queued' || targetStatus === 'idle')) return 'running'
  if ((sourceStatus as string) === 'success') return 'success'
  if ((targetStatus as string) === 'success' && (sourceStatus as string) === 'success') return 'success'
  return ''
}

function edgeStyleFor(status: NodeRunStatus | '' = ''): React.CSSProperties {
  if (status === 'running') return { stroke: '#fbbf24', strokeWidth: 3 }
  if (status === 'success') return { stroke: '#34d399', strokeWidth: 2.5 }
  if (status === 'failed') return { stroke: '#f87171', strokeWidth: 3 }
  if (status === 'waiting_human') return { stroke: '#f59e0b', strokeWidth: 2.5 }
  return { stroke: '#64748b', strokeWidth: 1.8 }
}

function toFlowNodes(workflow: WriterWorkflow, agents: WorkflowAgent[], run?: WorkflowRun): FlowNode[] {
  const agentMap = new Map(agents.map(agent => [agent.id, agent]))

  return workflow.nodes.map(node => {
    const def = getNodeDefinition(node.type as WorkflowNodeType)
    const agent = node.data.agent_id ? agentMap.get(String(node.data.agent_id)) : null
    const runRow = run?.node_statuses?.[node.id]
    const locked = Boolean(node.data.locked)
    const nodeType = node.type as WorkflowNodeType
    const color = node.data.color || agent?.color || NODE_COLOR_MAP[nodeType] || def?.color || '#6366f1'

    return {
      id: node.id,
      type: 'custom',
      position: node.position,
      size: node.size,
      draggable: !locked,
      selected: false,
      data: {
        ...node.data,
        ...def?.defaultConfig,
        label: String(node.data.label || agent?.name || def?.displayName || node.type),
        nodeType,
        agent_name: agent?.name || node.data.agent_name,
        color,
        icon: def?.icon,
        runStatus: runRow?.status as NodeRunStatus | undefined,
        summary: runRow?.summary,
        progress: run?.progress?.total ? Math.round(((run.progress.completed || 0) / run.progress.total) * 100) : undefined,
        isStart: Boolean(node.data.isStart),
        locked
      }
    }
  })
}

function fromFlowNodes(nodes: FlowNode[]): WorkflowNodeRecord[] {
  return nodes.map(node => {
    const { runStatus, summary, progress, color, icon, ...restData } = node.data
    return {
      id: node.id,
      type: String(node.data.nodeType || 'agent'),
      position: node.position,
      size: (node as any).size,
      data: restData as any
    }
  })
}

function toFlowEdges(workflow: WriterWorkflow, run?: WorkflowRun): FlowEdge[] {
  return workflow.edges.map(edge => {
    const status = edgeStatus(edge, run)
    const style = edgeStyleFor(status)
    const edgeType = edge.type
    const flowEdgeType = !edgeType || edgeType === 'normal' ? 'smoothstep' : edgeType === 'condition' || edgeType === 'loop' || edgeType === 'human_approval' ? 'smoothstep' : edgeType
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle || 'out',
      targetHandle: edge.targetHandle || 'in',
      label: edge.label,
      type: flowEdgeType,
      animated: status === 'running' || edgeType === 'loop',
      style,
      data: { status, ...edge.condition, edgeType: edgeType || 'normal' }
    }
  })
}

function fromFlowEdges(edges: FlowEdge[]): WorkflowEdgeRecord[] {
  return edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle as string | undefined,
    targetHandle: edge.targetHandle as string | undefined,
    label: typeof edge.label === 'string' ? edge.label : undefined,
    type: (edge.type as WorkflowEdgeRecord['type']) || 'normal',
    animated: edge.animated,
    style: edge.style as Record<string, unknown> | undefined
  }))
}

function createEmptyNodeResources(): NodeResourceConfig {
  return {
    skills: [],
    mcp: [],
    knowledge: [],
    plugins: [],
    models: [],
    souls: [],
    connectors: [],
    providers: []
  }
}

function AgentFlowInner({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WorkflowState>('loading')
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('')
  const [workflowName, setWorkflowName] = useState('章节创作流')
  const [agents, setAgents] = useState<WorkflowAgent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [selectedEdgeId, setSelectedEdgeId] = useState('')

  const [nodeResources, setNodeResources] = useState<NodeResourceConfig>(createEmptyNodeResources())
  const [savedWorkflows, setSavedWorkflows] = useState<WriterWorkflow[]>([])

  const [inputText, setInputText] = useState('')
  const [humanReviewText, setHumanReviewText] = useState('')
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [lastRun, setLastRun] = useState<WorkflowRun | undefined>()
  const [runPanelVisible, setRunPanelVisible] = useState(false)
  const [runPanelTab, setRunPanelTab] = useState<RunPanelTab>('input')
  const [inputMode, setInputMode] = useState<InputMode>('manual')
  const [mode, setMode] = useState<FlowMode>('edit')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [workshopTheme] = useState('karna')
  const [runtimeConfig, setRuntimeConfig] = useState(DEFAULT_RUNTIME_CONFIG)
  const [limits, setLimits] = useState(DEFAULT_LIMITS)
  const [savedSnapshot, setSavedSnapshot] = useState<string>('')
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)

  const initializedRef = useRef(false)
  const pollTimerRef = useRef<number | null>(null)
  const pausedNoticeRef = useRef('')
  const runActiveInSessionRef = useRef(false)
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<FlowEdge>([])
  const flow = useReactFlow<FlowNode, FlowEdge>()
  const [pendingEdgeSource, setPendingEdgeSourceState] = useState('')

  const builtinAgents = useMemo(() => getBuiltinAgents(), [])
  const builtinAgentIds = useMemo(() => new Set(builtinAgents.map(a => a.id)), [builtinAgents])

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId) || null, [nodes, selectedNodeId])
  const selectedEdge = useMemo(() => edges.find(e => e.id === selectedEdgeId) || null, [edges, selectedEdgeId])
  const selectedAgent = useMemo(() => agents.find(a => a.id === selectedAgentId) || agents[0] || null, [agents, selectedAgentId])
  const pendingReviewNode = useMemo(
    () => (lastRun?.status === 'paused' && lastRun.paused_at_node_id ? nodes.find(n => n.id === lastRun.paused_at_node_id) || null : null),
    [lastRun, nodes]
  )

  const currentWorkflow = useMemo<WriterWorkflow>(() => ({
    id: selectedWorkflowId || undefined,
    name: workflowName || '未命名创作工作流',
    mode: 'canvas',
    nodes: fromFlowNodes(nodes),
    edges: fromFlowEdges(edges),
    limits,
    runtimeConfig,
    knowledge_binding: { enabled: false },
    schema_version: 2
  }), [edges, nodes, selectedWorkflowId, workflowName, limits, runtimeConfig])

  const currentSnapshot = useMemo(() => JSON.stringify({
    name: workflowName,
    nodes: currentWorkflow.nodes,
    edges: currentWorkflow.edges,
    limits,
    runtimeConfig
  }), [workflowName, currentWorkflow.nodes, currentWorkflow.edges, limits, runtimeConfig])

  const hasUnsavedChanges = useMemo(() => {
    if (!savedSnapshot) return nodes.length > 0 || edges.length > 0
    return currentSnapshot !== savedSnapshot
  }, [currentSnapshot, savedSnapshot, nodes.length, edges.length])

  const validation = useMemo<WorkflowValidationResult>(() => validateWorkflow(currentWorkflow), [currentWorkflow])

  const applyRunToCanvas = useCallback((run?: WorkflowRun) => {
    setLastRun(run)
    setNodes(currentNodes =>
      currentNodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          runStatus: run?.node_statuses?.[node.id]?.status as NodeRunStatus | undefined,
          summary: run?.node_statuses?.[node.id]?.summary,
          errorMessage: run?.node_statuses?.[node.id]?.status === 'failed' ? run?.node_statuses?.[node.id]?.summary : undefined,
          progress: run?.progress?.total ? Math.round(((run.progress.completed || 0) / run.progress.total) * 100) : undefined
        }
      }))
    )
    setEdges(currentEdges =>
      currentEdges.map(edge => {
        const status = edgeStatus(edge, run)
        return {
          ...edge,
          animated: status === 'running',
          style: edgeStyleFor(status),
          markerEnd: { type: MarkerType.ArrowClosed, color: (edgeStyleFor(status).stroke as string) || '#64748b' },
          data: { ...(edge.data || {}), status }
        }
      })
    )
  }, [setEdges, setNodes])

  const reloadResources = useCallback(async () => {
    try {
      const result = await api<{
        ok?: boolean
        skills?: NodeResourceItem[]
        mcp?: Array<NodeResourceItem & { tools?: any[] }>
        knowledge?: NodeResourceItem[]
        models?: NodeResourceItem[]
        souls?: NodeResourceItem[]
        plugins?: NodeResourceItem[]
        connectors?: NodeResourceItem[]
      }>('/api/writer/resources')

      const normalizeItem = (item: any, defaults: Partial<NodeResourceItem>): NodeResourceItem => ({
        id: item?.id || '',
        name: item?.name || item?.id || '未知',
        description: item?.description || '',
        scope: item?.scope || 'global',
        enabled: item?.enabled !== false,
        available: item?.available !== false,
        status: item?.status || 'ready',
        icon: item?.icon,
        source: item?.source,
        category: item?.category,
        documentCount: item?.documentCount ?? item?.documents,
        provider: item?.provider,
        contextWindow: item?.contextWindow,
        tagline: item?.tagline,
        path: item?.path,
        ...defaults
      })

      setNodeResources({
        skills: Array.isArray(result.skills) ? result.skills.map(s => normalizeItem(s, { icon: 'code', source: 'skill-registry' })) : [],
        mcp: Array.isArray(result.mcp) ? result.mcp.map(m => {
          const base = normalizeItem(m, { icon: 'plug', source: 'mcp-server' })
          return {
            ...base,
            tools: Array.isArray(m.tools) ? m.tools.map((t: any) => ({
              id: t.id || t.name || '',
              name: t.name || t.id || '',
              description: t.description
            })) : []
          } as NodeResourceMcpItem
        }) : [],
        knowledge: Array.isArray(result.knowledge) ? result.knowledge.map(k => normalizeItem(k, { icon: 'database', source: 'knowledge-base' })) : [],
        plugins: Array.isArray(result.plugins) ? result.plugins.map(p => normalizeItem(p, { icon: 'extensions', source: 'plugin-registry' })) : [],
        models: Array.isArray(result.models) ? result.models.map(m => normalizeItem(m, { icon: 'server', source: 'model-provider' })) : [],
        souls: Array.isArray(result.souls) ? result.souls.map(s => normalizeItem(s, { icon: 'heart', source: 'soul-workshop' })) : [],
        connectors: Array.isArray(result.connectors) ? result.connectors.map(c => normalizeItem(c, { icon: 'plug', source: 'connector' })) : [],
        providers: []
      })
    } catch (err) {
      console.error('[reloadResources] 加载资源失败:', err)
      notifyError(err, '加载资源失败，请检查网络连接后重试')
      setNodeResources(prev => ({
        ...createEmptyNodeResources(),
        skills: prev.skills.map(s => ({ ...s, status: 'error' as const, available: false })),
        mcp: prev.mcp.map(m => ({ ...m, status: 'error' as const, available: false })),
        knowledge: prev.knowledge.map(k => ({ ...k, status: 'error' as const, available: false })),
        models: prev.models.map(m => ({ ...m, status: 'error' as const, available: false })),
        souls: prev.souls.map(s => ({ ...s, status: 'error' as const, available: false })),
        plugins: prev.plugins.map(p => ({ ...p, status: 'error' as const, available: false }))
      }))
    }
  }, [])

  const load = useCallback(async () => {
    if (!initializedRef.current) {
      setState('loading')
    }

    try {
      const hiddenBuiltins = loadHiddenBuiltins()
      const overrides = loadBuiltinOverrides()
      let allAgents = builtinAgents
        .filter(a => !hiddenBuiltins.has(a.id))
        .map(a => normalizeWorkflowAgent({ ...a, ...(overrides[a.id] || {}) }))
      let workflows: WriterWorkflow[] = []
      let runs: WorkflowRun[] = []

      try {
        const result = await api<{
          workflows?: WriterWorkflow[]
          agents?: WorkflowAgent[]
          runs?: WorkflowRun[]
        }>('/api/writer/workflows')

        if (result.agents?.length) {
          const customAgents = result.agents.map(a => normalizeWorkflowAgent(a))
          allAgents = [...allAgents, ...customAgents.filter(a => !builtinAgentIds.has(a.id) && !hiddenBuiltins.has(a.id))]
        }
        workflows = (result.workflows || []).map(w => migrateWorkflow(w))
        runs = result.runs || []
      } catch (err) {
        console.log('[load] API unavailable, trying localStorage', err)
      }

      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        try {
          const parsed = JSON.parse(saved)
          if (parsed.workflow) {
            workflows = [migrateWorkflow(parsed.workflow), ...workflows.filter(w => w.id !== parsed.workflow.id)]
          }
        } catch {}
      }

      setAgents(allAgents)
      setSavedWorkflows(workflows)
      if (!selectedAgentId && allAgents[0]) {
        setSelectedAgentId(allAgents[0].id)
      }

      const activeWorkflow = selectedWorkflowId
        ? workflows.find(w => w.id === selectedWorkflowId)
        : undefined

      if (activeWorkflow) {
        const latestRun = runs
          .filter(r => r.workflow_id === activeWorkflow.id)
          .sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''))[0]

        if (!initializedRef.current) {
          initializedRef.current = true
          setSelectedWorkflowId(activeWorkflow.id || '')
          setWorkflowName(activeWorkflow.name)
          setLimits(activeWorkflow.limits || DEFAULT_LIMITS)
          setRuntimeConfig(activeWorkflow.runtimeConfig || DEFAULT_RUNTIME_CONFIG)
          const isStaleRun = latestRun && (latestRun.status === 'running' || latestRun.status === 'pending')
          const runForInit = isStaleRun ? undefined : latestRun
          setNodes(toFlowNodes(activeWorkflow, allAgents, runForInit))
          setEdges(toFlowEdges(activeWorkflow, runForInit))
          setLastRun(isStaleRun ? { ...latestRun, status: 'cancelled' as const } : latestRun)
          runActiveInSessionRef.current = false
          const snapshot = JSON.stringify({
            name: activeWorkflow.name,
            nodes: activeWorkflow.nodes,
            edges: activeWorkflow.edges,
            limits: activeWorkflow.limits || DEFAULT_LIMITS,
            runtimeConfig: activeWorkflow.runtimeConfig || DEFAULT_RUNTIME_CONFIG
          })
          setSavedSnapshot(snapshot)
          setLastSavedAt(activeWorkflow.updated_at || new Date().toISOString())
        } else {
          if (latestRun && latestRun.status === 'running' && runActiveInSessionRef.current) {
            applyRunToCanvas(latestRun)
          } else if (latestRun && latestRun.status !== 'running') {
            applyRunToCanvas(latestRun)
            if (lastRun?.status === 'running') {
              runActiveInSessionRef.current = false
            }
          }
        }
      } else if (!initializedRef.current) {
        initializedRef.current = true
        const template = createWorkflowTemplate('empty')
        setSelectedWorkflowId('')
        setWorkflowName('未命名工作流')
        setLimits(template.limits || DEFAULT_LIMITS)
        setRuntimeConfig(template.runtimeConfig || DEFAULT_RUNTIME_CONFIG)
        setNodes([])
        setEdges([])
        setLastRun(undefined)
        runActiveInSessionRef.current = false
        setSavedSnapshot('')
        setLastSavedAt(null)
      }

      setState('ready')
    } catch (err) {
      console.error('[load] Failed:', err)
      setState('error')
      notifyError(err, '加载工作流失败')
    }
  }, [builtinAgents, builtinAgentIds, selectedAgentId, selectedWorkflowId, setEdges, setNodes, applyRunToCanvas])

  useEffect(() => {
    void load()
    void reloadResources()
  }, [load, reloadResources])

  useEffect(() => {
    const shouldPoll = running || (lastRun?.status === 'running' && runActiveInSessionRef.current)
    if (shouldPoll) {
      pollTimerRef.current = window.setInterval(() => {
        void load()
      }, 2000)
    }
    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [running, lastRun?.status, load])

  useEffect(() => {
    if (lastRun?.status !== 'paused' || !lastRun.paused_at_node_id) return
    const pausedNode = nodes.find(n => n.id === lastRun.paused_at_node_id)
    if (!pausedNode?.data?.requiresReview) return
    const key = `${lastRun.run_id}:${lastRun.paused_at_node_id}`
    if (pausedNoticeRef.current === key) return
    pausedNoticeRef.current = key
    notify({ kind: 'warning', title: '等待人工确认', message: '工作流已暂停，请在右侧填写意见后继续。' })
    setRunPanelVisible(true)
    setRunPanelTab('review')
  }, [lastRun, nodes])

  const applyWorkflow = useCallback((workflow: WriterWorkflow) => {
    const migrated = migrateWorkflow(workflow)
    setSelectedWorkflowId(migrated.id || '')
    setWorkflowName(migrated.name)
    setLimits(migrated.limits || DEFAULT_LIMITS)
    setRuntimeConfig(migrated.runtimeConfig || DEFAULT_RUNTIME_CONFIG)
    setLastRun(undefined)
    runActiveInSessionRef.current = false
    setNodes(toFlowNodes(migrated, agents))
    setEdges(toFlowEdges(migrated))
    setSelectedNodeId('')
    setSelectedEdgeId('')
    setSavedSnapshot('')
    setLastSavedAt(null)
  }, [agents, setEdges, setNodes])

  const applyTemplate = useCallback((kind: 'basic_writing' | 'critique_loop' | 'chapter' | 'polish' | 'foreshadow' | 'unstuck' | 'empty' | 'simple' | 'critique') => {
    const template = createWorkflowTemplate(kind)
    const agentMap = new Map(agents.map(agent => [agent.id, agent]))
    template.nodes = template.nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        agent_name: node.data.agent_id ? agentMap.get(String(node.data.agent_id))?.name : undefined
      }
    }))
    setSelectedWorkflowId('')
    setWorkflowName(template.name)
    setLimits(template.limits || DEFAULT_LIMITS)
    setRuntimeConfig(template.runtimeConfig || DEFAULT_RUNTIME_CONFIG)
    setLastRun(undefined)
    runActiveInSessionRef.current = false
    setSelectedNodeId('')
    setSelectedEdgeId('')
    setNodes(toFlowNodes(template, agents))
    setEdges(toFlowEdges(template))
    setSavedSnapshot('')
    setLastSavedAt(null)
  }, [agents, setEdges, setNodes])

  const applyEmptyTemplate = useCallback(() => {
    applyTemplate('empty')
  }, [applyTemplate])

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return
    if (connection.source === connection.target) {
      notify({ kind: 'warning', title: '无法连接', message: '节点不能连接到自己' })
      return
    }

    setEdges(current => addEdge({
      ...connection,
      id: generateId('edge'),
      sourceHandle: connection.sourceHandle || 'out',
      targetHandle: connection.targetHandle || 'in',
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed, color: '#c4b5fd' },
      style: { stroke: '#c4b5fd', strokeWidth: 2.5 },
      animated: false
    }, current))
    setPendingEdgeSourceState('')
  }, [setEdges])

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const raw = event.dataTransfer.getData('application/karna-workflow-node')
    if (!raw) return

    try {
      const item = JSON.parse(raw) as any
      const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      createNodeAt(item.type, position.x, position.y, item.label || item.agent?.name, item)
    } catch (err) {
      console.error('[onDrop] Failed:', err)
    }
  }, [flow])

  const createNodeAt = useCallback((type: WorkflowNodeType, x: number, y: number, label?: string, resourceData?: any) => {
    const def = getNodeDefinition(type)
    const id = generateId(type)
    const color = NODE_COLOR_MAP[type] || def?.color || '#6366f1'
    const isInputType = type.startsWith('input')
    const defaultConfig = def?.defaultConfig || {}

    const hasStartNode = nodes.some(n => n.data.isStart)
    const isStart = isInputType && !hasStartNode

    const data: FlowNodeData = {
      ...defaultConfig,
      label: label || def?.displayName || type,
      nodeType: type,
      color,
      icon: def?.icon,
      isStart,
      locked: false,
      runStatus: 'idle' as NodeRunStatus
    }

    if (type === 'agent' && !data.promptConfig) {
      data.promptConfig = {
        mode: 'explicit',
        rolePrompt: '你是一个通用AI助手，根据任务提示完成相应工作。',
        taskPromptTemplate: '请完成以下任务：\n\n{{input}}',
        variables: [{ name: 'input' }],
        missingVariablePolicy: 'empty',
        mergeMode: 'append',
        version: 1
      }
    }

    const CONTROL_NODE_DEFAULTS: Record<string, { description: string; promptConfig?: any }> = {
      fanout: { description: '并行分发：将输入分发到多个下游分支并行执行。' },
      barrier: { description: '同步屏障：等待所有上游分支到达后再继续向下执行。' },
      condition: { description: '条件判断：根据配置的条件表达式决定走哪个分支。' },
      loop_controller: { description: '循环控制：按设定次数或条件反复执行循环体。' },
      human_confirm: { description: '人工确认：暂停执行，等待用户确认后继续。' },
      consensus: {
        description: '共识节点：汇总多个观点，输出最终共识结论。',
        promptConfig: {
          mode: 'explicit',
          rolePrompt: '你是一个共识裁决者，负责汇总多方意见，输出最合理的结论。',
          taskPromptTemplate: '请阅读以下多方意见，给出综合判断与最终结论：\n\n{{input}}',
          variables: [{ name: 'input' }],
          missingVariablePolicy: 'empty',
          mergeMode: 'append',
          version: 1
        }
      },
      scheduler: { description: '调度器：根据规则将任务调度到合适的下游节点。' },
      save_snapshot: { description: '保存快照：将当前节点的输入输出保存为版本快照。' }
    }
    if (CONTROL_NODE_DEFAULTS[type]) {
      if (!data.description) data.description = CONTROL_NODE_DEFAULTS[type].description
      if (CONTROL_NODE_DEFAULTS[type].promptConfig && !data.promptConfig) {
        data.promptConfig = CONTROL_NODE_DEFAULTS[type].promptConfig
      }
    }

    if (resourceData) {
      if (resourceData.agentId) {
        (data as any).agent_id = resourceData.agentId
        const agent = agents.find(a => a.id === resourceData.agentId)
        if (agent) {
          (data as any).agent_name = agent.name
          data.color = agent.color || '#8b5cf6'
          data.icon = resolveAgentIcon(agent)
          const rolePrompt = [
            agent.role ? `# 角色\n${agent.role}` : '',
            agent.tagline ? `\n# 定位\n${agent.tagline}` : '',
            agent.duties ? `\n# 职责\n${agent.duties}` : '',
            Array.isArray(agent.constraints) && agent.constraints.length
              ? `\n# 约束\n${agent.constraints.map((c: string) => `- ${c}`).join('\n')}`
              : ''
          ].filter(Boolean).join('\n')
          const taskPromptTemplate = data.promptConfig?.taskPromptTemplate ||
            `请根据输入内容完成你的任务，遵循角色设定的职责与约束。\n\n输入内容：{{input}}`
          data.promptConfig = {
            mode: 'explicit',
            rolePrompt,
            taskPromptTemplate,
            variables: [{ name: 'input' }],
            missingVariablePolicy: 'empty',
            mergeMode: 'append',
            version: 1
          }
          if (!data.label || data.label === '空白Agent') data.label = agent.name
          if (!data.description) data.description = agent.tagline || agent.duties?.slice(0, 80) || ''
        }
      }
      if (resourceData.knowledge) {
        (data as any).knowledge_id = resourceData.knowledge
        (data as any).rag_collection = resourceData.knowledge
      }
      if (resourceData.mcp) {
        (data as any).mcp_server_id = resourceData.mcp
        if (resourceData.toolName) {
          (data as any).mcp_tool_name = resourceData.toolName
        }
      }
      if (resourceData.skill) {
        (data as any).skill_id = resourceData.skill
      }
      if (resourceData.plugin) {
        (data as any).plugin_id = resourceData.plugin
      }
    }

    const newNode: FlowNode = {
      id,
      type: 'custom',
      position: { x, y },
      draggable: true,
      selected: false,
      data
    }

    setNodes(current => [...current, newNode])
    setSelectedNodeId(id)
    setSelectedEdgeId('')

    setTimeout(() => {
      flow.setCenter(x + 120, y + 60, { zoom: 1, duration: 200 })
    }, 50)
  }, [flow, nodes, agents, setNodes])

  const deleteNode = useCallback((nodeId: string) => {
    setNodes(current => current.filter(n => n.id !== nodeId))
    setEdges(current => current.filter(e => e.source !== nodeId && e.target !== nodeId))
    if (selectedNodeId === nodeId) setSelectedNodeId('')
  }, [selectedNodeId, setEdges, setNodes])

  const deleteSelectedEdge = useCallback(() => {
    if (!selectedEdge) return
    setEdges(current => current.filter(edge => edge.id !== selectedEdge.id))
    setSelectedEdgeId('')
  }, [selectedEdge, setEdges])

  const startEdgeFrom = useCallback((nodeId: string) => {
    setPendingEdgeSourceState(nodeId)
    if (nodeId) {
      notify({ kind: 'info', title: '新建连线', message: '请点击目标节点完成连线' })
    }
  }, [])

  const cancelPendingEdge = useCallback(() => {
    setPendingEdgeSourceState('')
  }, [])

  const copyNode = useCallback((nodeId?: string) => {
    const targetId = nodeId || selectedNodeId
    const source = nodes.find(n => n.id === targetId)
    if (!source) return

    const newId = generateId(String(source.data.nodeType || 'agent'))
    setNodes(current => [...current, {
      ...source,
      id: newId,
      position: { x: source.position.x + 40, y: source.position.y + 40 },
      data: { ...source.data, label: `${source.data.label} 副本`, isStart: false, locked: false },
      draggable: true,
      selected: false
    }])
    setSelectedNodeId(newId)
    notify({ kind: 'success', title: '节点已复制', message: source.data.label })
  }, [nodes, selectedNodeId, setNodes])

  const toggleNodeLock = useCallback((nodeId?: string) => {
    const targetId = nodeId || selectedNodeId
    setNodes(current => current.map(node => {
      if (node.id !== targetId) return node
      const next = !node.data.locked
      notify({ kind: 'info', title: next ? '节点已锁定' : '节点已解锁', message: node.data.label })
      return { ...node, data: { ...node.data, locked: next }, draggable: !next }
    }))
  }, [selectedNodeId, setNodes])

  const setStartNode = useCallback((nodeId?: string) => {
    const targetId = nodeId || selectedNodeId
    setNodes(current => current.map(node => ({
      ...node,
      data: { ...node.data, isStart: node.id === targetId }
    })))
    if (targetId) {
      const node = nodes.find(n => n.id === targetId)
      notify({ kind: 'success', title: '设置起始节点', message: node?.data.label || targetId })
    }
  }, [nodes, selectedNodeId, setNodes])

  const focusNode = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId)
    setSelectedEdgeId('')
    const node = nodes.find(n => n.id === nodeId)
    if (node && flow) {
      flow.setCenter(node.position.x + 120, node.position.y + 60, { zoom: 1, duration: 350 })
    }
  }, [nodes, flow])

  const arrangeNodes = useCallback(() => {
    const nodeIds = nodes.map(n => n.id)
    const indegree = new Map(nodeIds.map(id => [id, 0]))
    const outgoing = new Map(nodeIds.map(id => [id, [] as string[]]))

    for (const edge of edges) {
      if (!indegree.has(edge.source) || !indegree.has(edge.target)) continue
      indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1)
      outgoing.get(edge.source)?.push(edge.target)
    }

    const queue = nodeIds.filter(id => (indegree.get(id) || 0) === 0)
    const ordered: string[] = []

    while (queue.length) {
      const id = queue.shift()!
      if (ordered.includes(id)) continue
      ordered.push(id)
      for (const next of outgoing.get(id) || []) {
        indegree.set(next, (indegree.get(next) || 0) - 1)
        if ((indegree.get(next) || 0) <= 0) queue.push(next)
      }
    }

    for (const id of nodeIds) {
      if (!ordered.includes(id)) ordered.push(id)
    }

    const columns = Math.max(1, Math.ceil(Math.sqrt(ordered.length)))
    const spacingX = 280
    const spacingY = 180

    setNodes(current => current.map(node => {
      const index = ordered.indexOf(node.id)
      const col = index % columns
      const row = Math.floor(index / columns)
      return { ...node, position: { x: 80 + col * spacingX, y: 110 + row * spacingY } }
    }))

    notify({ kind: 'success', title: '自动排版', message: `已排列 ${ordered.length} 个节点` })
  }, [edges, nodes, setNodes])

  const saveWorkflow = useCallback(async (): Promise<string> => {
    if (!validation.valid) {
      const error = validation.errors[0]
      if (error) {
        notify({ kind: 'error', title: '校验失败', message: error.userMessage })
        if (error.relatedNodeId) {
          focusNode(error.relatedNodeId)
        }
        return ''
      }
    }

    setSaving(true)
    try {
      const workflowToSave = {
        ...currentWorkflow,
        id: currentWorkflow.id || `${WORKFLOW_ID_PREFIX}${Date.now()}`,
        updated_at: new Date().toISOString()
      }

      const result = await api<{ ok: boolean; workflow?: WriterWorkflow; error?: string }>(
        '/api/writer/workflows',
        'POST',
        workflowToSave
      )

      if (!result.ok || !result.workflow) {
        throw new Error(result.error || '保存失败')
      }

      setSelectedWorkflowId(result.workflow.id || '')
      const snapshot = JSON.stringify({
        name: workflowToSave.name,
        nodes: workflowToSave.nodes,
        edges: workflowToSave.edges,
        limits: workflowToSave.limits,
        runtimeConfig: workflowToSave.runtimeConfig
      })
      setSavedSnapshot(snapshot)
      setLastSavedAt(workflowToSave.updated_at)
      notify({ kind: 'success', title: '工作流已保存', message: result.workflow.name })
      return result.workflow.id || ''
    } catch (err) {
      notifyError(err, '保存工作流失败')
      return ''
    } finally {
      setSaving(false)
    }
  }, [currentWorkflow, validation, focusNode])

  const runWorkflow = useCallback(async (nodeId?: string) => {
    let id = selectedWorkflowId
    if (!id) {
      id = await saveWorkflow()
    }
    if (!id) {
      notify({ kind: 'error', title: '请先保存工作流', message: '运行前需要先保存当前工作流。' })
      return
    }

    setRunning(true)
    setRunPanelVisible(true)
    setRunPanelTab('output')
    setMode('run')
    runActiveInSessionRef.current = true

    const initialStatus = (index: number, n: FlowNode): NodeRunStatus => {
      if (nodeId) return n.id === nodeId ? 'running' : (n.data.runStatus || 'idle') as NodeRunStatus
      return index === 0 ? 'running' : 'queued'
    }

    setNodes(current => current.map((node, index) => ({
      ...node,
      data: {
        ...node.data,
        runStatus: initialStatus(index, node),
        summary: undefined,
        errorMessage: undefined
      }
    })))

    try {
      const path = nodeId
        ? `/api/writer/workflows/${encodeURIComponent(id)}/nodes/${encodeURIComponent(nodeId)}/rerun`
        : `/api/writer/workflows/${encodeURIComponent(id)}/run`

      const result = await api<{ ok: boolean; run?: WorkflowRun; error?: string }>(path, 'POST', {
        input: inputText
      })

      if (!result.ok || !result.run) {
        throw new Error(result.error || '运行失败')
      }

      applyRunToCanvas(result.run)
      notify({ kind: 'success', title: nodeId ? '节点已重跑' : '工作流已运行', message: STATUS_LABEL[result.run.status] || result.run.status })
    } catch (err) {
      notifyError(err, '运行工作流失败')
    } finally {
      setRunning(false)
    }
  }, [inputMode, inputText, nodes, saveWorkflow, selectedWorkflowId, setNodes, applyRunToCanvas])

  const stopWorkflow = useCallback(async () => {
    const id = selectedWorkflowId
    const run = lastRun
    if (!id || !run) return

    try {
      const result = await api<{ ok: boolean; error?: string }>(
        `/api/writer/workflows/${encodeURIComponent(id)}/stop`,
        'POST',
        { runId: run.run_id }
      )

      if (!result.ok) {
        throw new Error(result.error || '停止失败')
      }

      setRunning(false)
      runActiveInSessionRef.current = false
      notify({ kind: 'info', title: '已发送停止信号', message: '工作流将在当前节点完成后停止' })
    } catch (err) {
      notifyError(err, '停止工作流失败')
    }
  }, [selectedWorkflowId, lastRun])

  const continueWorkflow = useCallback(async () => {
    const run = lastRun
    if (!selectedWorkflowId || !run) return
    setRunning(true)
    runActiveInSessionRef.current = true

    try {
      const result = await api<{ ok: boolean; run?: WorkflowRun; error?: string }>(
        `/api/writer/workflows/${encodeURIComponent(selectedWorkflowId)}/continue`,
        'POST',
        { runId: run.run_id, humanInput: humanReviewText }
      )

      if (!result.ok || !result.run) throw new Error(result.error || '继续运行失败')
      setLastRun(result.run)
      setHumanReviewText('')
      applyRunToCanvas(result.run)
      notify({ kind: 'success', title: '工作流已继续', message: STATUS_LABEL[result.run.status] || result.run.status })
    } catch (err) {
      notifyError(err, '继续工作流失败')
    } finally {
      setRunning(false)
    }
  }, [humanReviewText, lastRun, nodes.length, selectedWorkflowId, applyRunToCanvas])

  const markNodeAction = useCallback(async (nodeId: string, action: 'accept' | 'reject' | 'skip' | 'edit') => {
    if (!selectedWorkflowId || !lastRun) return

    try {
      const result = await api<{ ok: boolean; run?: WorkflowRun; error?: string }>(
        `/api/writer/workflows/${encodeURIComponent(selectedWorkflowId)}/runs/${encodeURIComponent(lastRun.run_id)}/nodes/${encodeURIComponent(nodeId)}/${action}`,
        'POST',
        { humanReviewText }
      )

      if (!result.ok || !result.run) throw new Error(result.error || '更新失败')
      setLastRun(result.run)
      applyRunToCanvas(result.run)

      const actionLabels: Record<string, string> = { accept: '通过', reject: '驳回', skip: '跳过', edit: '编辑后继续' }
      notify({ kind: 'success', title: '操作已提交', message: actionLabels[action] || action })
    } catch (err) {
      notifyError(err, '更新节点状态失败')
    }
  }, [humanReviewText, lastRun, selectedWorkflowId, applyRunToCanvas])

  const patchNode = useCallback((patch: Partial<FlowNodeData>) => {
    if (!selectedNode) return
    setNodes(current => current.map(node =>
      node.id === selectedNode.id ? { ...node, data: { ...node.data, ...patch } } : node
    ))
  }, [selectedNode, setNodes])

  const patchEdge = useCallback((patch: Partial<FlowEdge>) => {
    if (!selectedEdge) return
    setEdges(current => current.map(edge =>
      edge.id === selectedEdge.id ? { ...edge, ...patch } : edge
    ))
  }, [selectedEdge, setEdges])

  const patchAgent = useCallback(async (patch: Partial<WorkflowAgent> & { id?: string }) => {
    const targetId = patch.id || selectedAgent?.id
    const base = targetId ? agents.find(a => a.id === targetId) : selectedAgent
    if (!base) return
    const next = normalizeWorkflowAgent({ ...base, ...patch, id: base.id })

    if (builtinAgentIds.has(base.id)) {
      const overrides = loadBuiltinOverrides()
      const baseAgent = builtinAgents.find(a => a.id === base.id)
      const baseOverrides: Partial<WorkflowAgent> = {}
      if (baseAgent) {
        for (const key of Object.keys(next) as (keyof WorkflowAgent)[]) {
          if (JSON.stringify((next as any)[key]) !== JSON.stringify((baseAgent as any)[key])) {
            (baseOverrides as any)[key] = (next as any)[key]
          }
        }
      } else {
        Object.assign(baseOverrides, next)
      }
      overrides[base.id] = baseOverrides
      saveBuiltinOverrides(overrides)
      setAgents(current => current.map(agent => agent.id === base.id ? next : agent))
      notify({ kind: 'success', title: '智能体已保存', message: next.name })
      return
    }

    try {
      const result = await api<{ ok: boolean; agent?: WorkflowAgent; error?: string }>(
        `/api/writer/agents/library/${encodeURIComponent(next.id)}`,
        'PATCH',
        next
      )
      if (!result.ok) {
        throw new Error(result.error || '保存失败')
      }
      setAgents(current => current.map(agent => agent.id === next.id ? (result.agent ? normalizeWorkflowAgent(result.agent) : next) : agent))
      notify({ kind: 'success', title: '智能体已保存', message: next.name })
    } catch (err) {
      notifyError(err, '保存智能体失败')
    }
  }, [selectedAgent, agents, builtinAgents, builtinAgentIds])

  const patchRuntimeConfig = useCallback((patch: Partial<typeof DEFAULT_RUNTIME_CONFIG>) => {
    setRuntimeConfig(current => ({ ...current, ...patch }))
  }, [])

  const patchLimits = useCallback((patch: Partial<typeof DEFAULT_LIMITS>) => {
    setLimits(current => ({ ...current, ...patch }))
  }, [])

  const createAgent = useCallback(async (template?: Partial<WorkflowAgent>) => {
    const next = normalizeWorkflowAgent({
      ...(template || {}),
      id: `custom_${Date.now()}`,
      name: template?.name ? `${template.name} 副本` : '我的自定义智能体',
      isBuiltin: false
    })

    try {
      const result = await api<{ ok: boolean; agents?: WorkflowAgent[]; error?: string }>(
        '/api/writer/agents/library',
        'POST',
        next
      )
      if (!result.ok || !result.agents) {
        throw new Error(result.error || '创建失败')
      }
      const customAgents = result.agents.map(a => normalizeWorkflowAgent(a))
      setAgents([...builtinAgents, ...customAgents.filter(a => !builtinAgentIds.has(a.id))])
      setSelectedAgentId(next.id)
      notify({ kind: 'success', title: '智能体已创建', message: next.name })
    } catch (err) {
      notifyError(err, '创建智能体失败')
    }
  }, [builtinAgents, builtinAgentIds])

  const deleteAgent = useCallback(async (agentId: string) => {
    const agent = agents.find(a => a.id === agentId)
    const isBuiltin = builtinAgentIds.has(agentId)
    const ok = window.confirm(
      isBuiltin
        ? `确定删除内置智能体「${agent?.name || agentId}」吗？删除后可通过重置恢复。`
        : `确定删除「${agent?.name || agentId}」吗？引用它的节点会保留，但需要重新绑定智能体。`
    )
    if (!ok) return

    if (isBuiltin) {
      const hidden = loadHiddenBuiltins()
      hidden.add(agentId)
      saveHiddenBuiltins(hidden)
      setAgents(current => current.filter(a => a.id !== agentId))
      if (selectedAgentId === agentId) {
        const remaining = agents.filter(a => a.id !== agentId)
        setSelectedAgentId(remaining[0]?.id || '')
      }
      notify({ kind: 'success', title: '智能体已删除', message: agent?.name || agentId })
      return
    }

    try {
      const result = await api<{ ok: boolean; error?: string }>(
        `/api/writer/agents/library/${encodeURIComponent(agentId)}`,
        'DELETE'
      )
      if (!result.ok) {
        throw new Error(result.error || '删除失败')
      }
    } catch (err) {
      notifyError(err, '删除智能体失败')
      return
    }

    setAgents(current => current.filter(a => a.id !== agentId))
    if (selectedAgentId === agentId) {
      const remaining = agents.filter(a => a.id !== agentId)
      setSelectedAgentId(remaining[0]?.id || '')
    }
    notify({ kind: 'success', title: '智能体已删除', message: agent?.name || agentId })
  }, [agents, builtinAgentIds, selectedAgentId])

  const deleteWorkflow = useCallback(async (workflowId: string) => {
    const wf = savedWorkflows.find(w => w.id === workflowId) || (currentWorkflow.id === workflowId ? currentWorkflow : null)
    const ok = window.confirm(`确定删除「${wf?.name || workflowId}」吗？此操作不可恢复。`)
    if (!ok) return

    try {
      const result = await api<{ ok: boolean; error?: string }>(
        `/api/writer/workflows/${encodeURIComponent(workflowId)}`,
        'DELETE'
      )
      if (!result.ok) {
        throw new Error(result.error || '删除失败')
      }
    } catch (err) {
      notifyError(err, '删除工作流失败')
      return
    }

    localStorage.removeItem(STORAGE_KEY)

    if (selectedWorkflowId === workflowId) {
      applyEmptyTemplate()
    }
    notify({ kind: 'success', title: '工作流已删除', message: wf?.name || workflowId })
    await load()
  }, [savedWorkflows, currentWorkflow, load, selectedWorkflowId, applyEmptyTemplate])

  const openInNewWindow = useCallback(() => {
    const url = `${window.location.origin}/karna/flow?workflow=${selectedWorkflowId || 'new'}`
    window.open(url, '_blank', 'width=1400,height=900')
  }, [selectedWorkflowId])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        void saveWorkflow()
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          e.preventDefault()
          deleteNode(selectedNodeId)
        } else if (selectedEdgeId) {
          e.preventDefault()
          deleteSelectedEdge()
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault()
        copyNode()
      }

      if (e.key === 'Escape') {
        if (pendingEdgeSource) {
          cancelPendingEdge()
        }
        setSelectedNodeId('')
        setSelectedEdgeId('')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [saveWorkflow, selectedNodeId, selectedEdgeId, deleteNode, deleteSelectedEdge, copyNode, pendingEdgeSource, cancelPendingEdge])

  const value: AgentFlowContextValue = {
    state,
    selectedWorkflowId,
    workflowName,
    currentWorkflow,

    nodes,
    edges,
    selectedNodeId,
    selectedEdgeId,
    selectedNode,
    selectedEdge,

    agents,
    selectedAgentId,
    selectedAgent,
    builtinAgentIds,

    lastRun,
    running,
    saving,
    hasUnsavedChanges,
    lastSavedAt,
    validation,

    inputText,
    humanReviewText,
    pendingReviewNode,
    runPanelVisible,
    runPanelTab,
    inputMode,

    mode,
    sidebarCollapsed,
    workshopTheme,

    nodeResources,
    savedWorkflows,

    load,
    saveWorkflow,
    runWorkflow,
    stopWorkflow,
    continueWorkflow,
    markNodeAction,

    applyWorkflow,
    applyTemplate,
    applyEmptyTemplate,

    createNodeAt,
    deleteNode,
    deleteSelectedEdge,

    copyNode,
    toggleNodeLock,
    setStartNode,
    focusNode,
    arrangeNodes,

    patchNode,
    patchEdge,
    patchAgent,
    patchRuntimeConfig,
    patchLimits,

    createAgent,
    deleteAgent,
    deleteWorkflow,

    onNodesChange,
    onEdgesChange,
    onConnect,
    setNodes,
    setEdges,
    onDrop,

    startEdgeFrom,
    cancelPendingEdge,
    pendingEdgeSource,

    setSelectedNodeId,
    setSelectedAgentId,
    setSelectedEdgeId,
    setInputText,
    setHumanReviewText,
    setRunPanelVisible,
    setRunPanelTab,
    setInputMode,
    setMode,
    setSidebarCollapsed,
    setWorkflowName,

    reloadResources,
    openInNewWindow
  }

  return <AgentFlowContext.Provider value={value}>{children}</AgentFlowContext.Provider>
}

export function AgentFlowProvider({ children }: { children: React.ReactNode }) {
  return (
    <ReactFlowProvider>
      <AgentFlowInner>{children}</AgentFlowInner>
    </ReactFlowProvider>
  )
}

export {
  NODE_DEFINITIONS,
  NODE_DEF_MAP,
  getNodeDefinition,
  NODE_COLOR_MAP,
  STATUS_LABEL,
  NODE_TYPE_LABEL,
  edgeStyleFor,
  toFlowNodes,
  fromFlowNodes,
  toFlowEdges,
  fromFlowEdges,
  DEFAULT_LIMITS,
  DEFAULT_RUNTIME_CONFIG
}
