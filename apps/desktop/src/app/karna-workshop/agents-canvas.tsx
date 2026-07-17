import '@xyflow/react/dist/style.css'

import {
  addEdge,
  Background,
  type Connection,
  Controls,
  type Edge,
  Handle,
  MarkerType,
  MiniMap,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow
} from '@xyflow/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type * as React from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'

import {
  createWorkflowTemplate,
  DEFAULT_LIMITS,
  DEFAULT_RUNTIME_CONFIG,
  migrateWorkflow,
  normalizeWorkflowAgent,
  validateWorkflow,
  type WorkflowAgent,
  type WorkflowNodeRecord,
  type WorkflowNodeType,
  type WriterWorkflow
} from './workflow-schema'

interface WriterProject { id: string; title: string; slug: string; folder: string; type: string }
interface WorkflowRun { run_id: string; workflow_id: string; status: string; paused_at_node_id?: string; node_statuses?: Record<string, { status: string; label?: string; summary?: string; agent_name?: string; action_note?: string; branch?: string; score?: number; threshold?: number; reused?: boolean }>; artifacts?: Array<{ id: string; title: string; path?: string; content?: string }>; started_at?: string; finished_at?: string; token_plan?: { estimated_calls?: number; estimated_input_tokens?: number; estimated_output_tokens?: number; estimated_cost_usd?: number; reusable_nodes?: string[]; warnings?: string[]; blocked?: boolean; block_reason?: string }; cost_estimate?: { calls?: number; tokens?: number }; progress?: { total?: number; completed?: number } }
interface WorkflowState { ok?: boolean; project?: WriterProject; workflows?: WriterWorkflow[]; agents?: WorkflowAgent[]; templates?: WorkflowAgent[]; runs?: WorkflowRun[]; error?: string }

type FlowNodeData = WorkflowNodeRecord['data'] & { label: string; nodeType: WorkflowNodeType | string; color?: string; runStatus?: string; summary?: string }

type FlowNode = Node<FlowNodeData>

type PaletteItem = { type: WorkflowNodeType; label: string; desc: string }

const NODE_PALETTE: PaletteItem[] = [
  { type: 'input', label: '输入材料', desc: '需求、章节、设定、人设' },
  { type: 'parallel', label: '并行分支', desc: '多个智能体同步处理' },
  { type: 'condition', label: '判定分支', desc: '低分重写、达标进入下一步' },
  { type: 'loop', label: '循环修订', desc: '最多 3-5 轮' },
  { type: 'human_review', label: '人工确认', desc: '作者改完再继续' },
  { type: 'archive', label: '归档版本', desc: '保存到项目文档库' },
  { type: 'output', label: '最终输出', desc: '调度器统一汇总' }
]

const CONSTRAINTS = ['不得改动主线剧情', '仅标注问题不修改正文', '必须严格遵循本书世界观', '修改篇幅不能超过原文30%', '贴合网文读者审美', '给出多个方案供作者选择']

const nodeTone: Record<string, string> = {
  input: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/95 text-[var(--theme-foreground)] shadow-sm border-l-[3px] border-l-[var(--theme-accent-soft)]',
  agent: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/95 text-[var(--theme-foreground)] shadow-sm border-l-[3px] border-l-[var(--theme-primary)]',
  parallel: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/95 text-[var(--theme-foreground)] shadow-sm border-l-[3px] border-l-[var(--theme-primary)]/70',
  condition: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/95 text-[var(--theme-foreground)] shadow-sm border-l-[3px] border-l-[var(--theme-secondary)]',
  loop: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/95 text-[var(--theme-foreground)] shadow-sm border-l-[3px] border-l-[var(--theme-secondary)]/70',
  human_review: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/95 text-[var(--theme-foreground)] shadow-sm border-l-[3px] border-l-[var(--theme-primary)]/60',
  archive: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/95 text-[var(--theme-foreground)] shadow-sm border-l-[3px] border-l-[var(--theme-foreground)]/30',
  output: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/95 text-[var(--theme-foreground)] shadow-sm border-l-[3px] border-l-[var(--dt-destructive)]/60'
}

const STATUS_LABEL: Record<string, string> = {
  queued: '\u6392\u961f\u4e2d',
  running: '\u8fd0\u884c\u4e2d',
  done: '\u5df2\u5b8c\u6210',
  paused: '\u5f85\u786e\u8ba4',
  blocked: '\u5df2\u963b\u585e',
  accepted: '\u5df2\u63a5\u53d7',
  rejected: '\u5df2\u9a73\u56de',
  skipped: '\u5df2\u8df3\u8fc7'
}

const NODE_TYPE_LABEL: Record<string, string> = {
  input: '输入',
  agent: '智能体',
  parallel: '并行',
  condition: '判定',
  loop: '循环',
  human_review: '人工确认',
  archive: '归档',
  output: '输出'
}

const statusBadgeClass = (status = '') => cn(
  'rounded-full px-1.5 py-0.5 text-[0.62rem]',
  status === 'done' || status === 'accepted' ? 'bg-[var(--theme-primary)]/15 text-[var(--theme-primary)]' :
    status === 'blocked' || status === 'rejected' ? 'bg-[var(--dt-destructive)]/12 text-[var(--dt-destructive)]' :
      status === 'running' ? 'animate-pulse bg-[var(--theme-primary)]/20 text-[var(--theme-primary)]' :
        status === 'paused' ? 'animate-pulse bg-[var(--theme-secondary)]/15 text-[var(--theme-secondary)]' :
          status === 'skipped' ? 'bg-[var(--theme-foreground)]/10 text-[var(--theme-foreground)]/60' : 'bg-[var(--theme-foreground)]/10 text-[var(--theme-foreground)]/60'
)

const statusLabel = (status = '') => STATUS_LABEL[status] || status || '\u672a\u8fd0\u884c'


type WorkshopThemeKey = 'star' | 'paper' | 'midnight' | 'sunset' | 'karna'

const WORKSHOP_THEMES: Record<WorkshopThemeKey, { label: string; root: string; panel: string; card: string; field: string; canvas: string; text: string; muted: string }> = {
  karna: { label: 'Karna 星瀑', root: 'bg-[var(--dt-background)]', panel: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/95 text-[var(--theme-foreground)] shadow-lg', card: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 text-[var(--theme-foreground)] hover:border-[var(--theme-primary)]/40', field: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)] text-[var(--theme-foreground)] focus:border-[var(--theme-primary)]', canvas: 'bg-[linear-gradient(rgba(128,128,128,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(128,128,128,0.06)_1px,transparent_1px)] bg-[size:24px_24px]', text: 'text-[var(--theme-foreground)]', muted: 'text-[var(--theme-foreground)]/60' },
  star: { label: '星轨夜航', root: 'bg-[var(--dt-background)]', panel: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/95 text-[var(--theme-foreground)] shadow-lg', card: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 text-[var(--theme-foreground)] hover:border-[var(--theme-primary)]/40', field: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)] text-[var(--theme-foreground)] focus:border-[var(--theme-primary)]', canvas: 'bg-[linear-gradient(rgba(128,128,128,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(128,128,128,0.06)_1px,transparent_1px)] bg-[size:24px_24px]', text: 'text-[var(--theme-foreground)]', muted: 'text-[var(--theme-foreground)]/60' },
  paper: { label: '稿纸暖光', root: 'bg-[var(--dt-background)]', panel: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/95 text-[var(--theme-foreground)] shadow-lg', card: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 text-[var(--theme-foreground)] hover:border-[var(--theme-primary)]/40', field: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)] text-[var(--theme-foreground)] focus:border-[var(--theme-primary)]', canvas: 'bg-[linear-gradient(rgba(128,128,128,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(128,128,128,0.06)_1px,transparent_1px)] bg-[size:24px_24px]', text: 'text-[var(--theme-foreground)]', muted: 'text-[var(--theme-foreground)]/60' },
  midnight: { label: '墨蓝专业', root: 'bg-[var(--dt-background)]', panel: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/95 text-[var(--theme-foreground)] shadow-lg', card: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 text-[var(--theme-foreground)] hover:border-[var(--theme-primary)]/40', field: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)] text-[var(--theme-foreground)] focus:border-[var(--theme-primary)]', canvas: 'bg-[linear-gradient(rgba(128,128,128,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(128,128,128,0.06)_1px,transparent_1px)] bg-[size:24px_24px]', text: 'text-[var(--theme-foreground)]', muted: 'text-[var(--theme-foreground)]/60' },
  sunset: { label: '落日剧场', root: 'bg-[var(--dt-background)]', panel: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/95 text-[var(--theme-foreground)] shadow-lg', card: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 text-[var(--theme-foreground)] hover:border-[var(--theme-primary)]/40', field: 'border-[var(--dt-border)] bg-[var(--theme-card-seed)] text-[var(--theme-foreground)] focus:border-[var(--theme-primary)]', canvas: 'bg-[linear-gradient(rgba(128,128,128,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(128,128,128,0.06)_1px,transparent_1px)] bg-[size:24px_24px]', text: 'text-[var(--theme-foreground)]', muted: 'text-[var(--theme-foreground)]/60' }
}

const UI = {
  conditionWhen: '\u5982\u679c\u4ec0\u4e48\u60c5\u51b5\u53d1\u751f',
  conditionPlaceholder: '\u4f8b\u5982\uff1a\u8bc4\u8bba\u5bb6\u8bc4\u5206\u4f4e\u4e8e 60 \u5206',
  passScore: '\u8fbe\u6807\u5206\u6570\u7ebf',
  passTarget: '\u8fbe\u6807\u540e\u53bb\u54ea\u91cc',
  retryTarget: '\u672a\u8fbe\u6807\u53bb\u54ea\u91cc',
  defaultNext: '\u9ed8\u8ba4\u4e0b\u4e00\u6b65',
  branch: '\u5206\u652f',
  score: '\u8bc4\u5206',
  accept: '\u63a5\u53d7',
  reject: '\u9a73\u56de',
  skip: '\u8df3\u8fc7',
  rerun: '\u91cd\u8dd1'
}

function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  return window.karnaDesktop.api<T>({ path, method, body })
}

function CustomNode({ data, selected }: NodeProps<FlowNode>) {
  const status = data.runStatus
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editNote, setEditNote] = useState('')

  const handleNodeAction = async (action: 'retry' | 'skip', nodeId: string) => {
    try {
      await api(`/api/writer/workflows/${encodeURIComponent(window.__karnaSelectedWorkflowId || '')}/runs/${encodeURIComponent(window.__karnaLastRunId || '')}/nodes/${encodeURIComponent(nodeId)}/${action}`, 'POST')
      window.__karnaRefreshCanvas?.()
    } catch (err) {
      notifyError(err, `${action === 'retry' ? '重试' : '跳过'}节点失败`)
    }
  }

  const handleEditAndResume = async (nodeId: string) => {
    try {
      await api(`/api/writer/workflows/${encodeURIComponent(window.__karnaSelectedWorkflowId || '')}/runs/${encodeURIComponent(window.__karnaLastRunId || '')}/nodes/${encodeURIComponent(nodeId)}/retry`, 'POST', { note: editNote })
      await api(`/api/writer/workflows/${encodeURIComponent(window.__karnaSelectedWorkflowId || '')}/continue`, 'POST', { runId: window.__karnaLastRunId, humanInput: editNote })
      setShowEditDialog(false)
      setEditNote('')
      window.__karnaRefreshCanvas?.()
    } catch (err) {
      notifyError(err, '编辑后继续失败')
    }
  }

  return (
    <div className={cn('relative min-w-48 rounded-2xl border p-3 shadow-lg backdrop-blur transition', nodeTone[String(data.nodeType)] || nodeTone.agent, selected && 'ring-2 ring-[var(--theme-primary)]')}>
      <Handle className="!h-3 !w-3 !border-2 !border-[var(--theme-card-seed)] !bg-[var(--theme-primary)]" id="in" position={Position.Left} type="target" />
      <Handle className="!h-3 !w-3 !border-2 !border-[var(--theme-card-seed)] !bg-[var(--theme-primary)]" id="out" position={Position.Right} type="source" />
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-[var(--theme-foreground)]/8 px-2 py-0.5 text-[0.68rem] font-semibold tracking-wide opacity-90">{NODE_TYPE_LABEL[String(data.nodeType)] || String(data.nodeType)}</span>
        {status ? <span className={statusBadgeClass(status)}>{statusLabel(status)}</span> : null}
      </div>
      <div className="mt-1 text-sm font-semibold">{data.label}</div>
      {data.agent_name ? <div className="mt-1 text-xs opacity-80">{String(data.agent_name)}</div> : null}
      {status === 'running' ? <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--theme-foreground)]/10"><div className="h-full w-2/3 animate-pulse rounded-full bg-current opacity-80" /></div> : null}
      {(status === 'blocked' || status === 'paused') && data.nodeId ? (
        <div className="mt-2 flex flex-wrap gap-1">
          <button className="rounded border border-[var(--theme-primary)]/40 bg-[var(--theme-primary)]/8 px-1.5 py-0.5 text-[0.62rem] text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/15" onClick={() => handleNodeAction('retry', data.nodeId as string)} type="button">重试</button>
          <button className="rounded border border-[var(--dt-border)] px-1.5 py-0.5 text-[0.62rem] text-[var(--theme-foreground)]/60 hover:bg-[var(--theme-foreground)]/8" onClick={() => handleNodeAction('skip', data.nodeId as string)} type="button">跳过</button>
          <button className="rounded border border-[var(--theme-secondary)]/40 bg-[var(--theme-secondary)]/8 px-1.5 py-0.5 text-[0.62rem] text-[var(--theme-secondary)] hover:bg-[var(--theme-secondary)]/15" onClick={() => setShowEditDialog(true)} type="button">编辑后续跑</button>
        </div>
      ) : null}
      {showEditDialog && (
        <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)] p-3 shadow-xl">
          <textarea className="mb-2 w-full rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)] p-2 text-xs outline-none focus:border-[var(--theme-primary)]" onChange={e => setEditNote(e.target.value)} placeholder="输入编辑意见后继续..." rows={3} value={editNote} />
          <div className="flex gap-1">
            <button className="flex-1 rounded border border-[var(--theme-primary)]/40 bg-[var(--theme-primary)] px-2 py-1 text-[0.62rem] text-white hover:opacity-90" onClick={() => handleEditAndResume(data.nodeId as string)} type="button">确认继续</button>
            <button className="rounded border border-[var(--dt-border)] px-2 py-1 text-[0.62rem] text-[var(--theme-foreground)]/60 hover:bg-[var(--theme-foreground)]/8" onClick={() => { setShowEditDialog(false); setEditNote('') }} type="button">取消</button>
          </div>
        </div>
      )}
    </div>
  )
}

const nodeTypes = { custom: CustomNode }

function toFlowNodes(workflow: WriterWorkflow, agents: WorkflowAgent[], run?: WorkflowRun): FlowNode[] {
  const agentMap = new Map(agents.map(agent => [agent.id, agent]))

  return workflow.nodes.map(node => {
    const agent = node.data.agent_id ? agentMap.get(String(node.data.agent_id)) : null
    const runRow = run?.node_statuses?.[node.id]
    const nodeType = (node.type || node.data.nodeType || 'agent') as WorkflowNodeType

    return {
      id: node.id,
      type: 'custom',
      position: node.position,
      data: {
        ...node.data,
        label: String(node.data.label || agent?.name || node.type),
        nodeType,
        nodeId: node.id,
        agent_name: agent?.name || node.data.agent_name,
        color: agent?.color,
        runStatus: runRow?.status,
        summary: runRow?.summary
      }
    }
  })
}

function fromFlowNodes(nodes: FlowNode[]): WorkflowNodeRecord[] {
  return nodes.map(node => {
    const nodeType = (node.data.nodeType || 'agent') as WorkflowNodeType
    const filteredData = Object.fromEntries(
      Object.entries(node.data).filter(([key]) => !['runStatus', 'summary', 'color', 'nodeId'].includes(key))
    )
    return {
      id: node.id,
      type: nodeType,
      position: node.position,
      data: {
        ...filteredData,
        nodeType
      }
    }
  })
}

function edgeStatus(edge: { source: string; target: string }, run?: WorkflowRun) {
  const source = run?.node_statuses?.[edge.source]?.status
  const target = run?.node_statuses?.[edge.target]?.status

  if (source === 'running' || target === 'running') {return 'running'}

  if (source === 'blocked' || target === 'blocked') {return 'blocked'}

  if ((source === 'done' || source === 'accepted') && (target === 'done' || target === 'accepted')) {return 'done'}

  if (source === 'done' || source === 'accepted') {return 'active'}

  return ''
}

function edgeStyleFor(status = '') {
  if (status === 'running') {return { stroke: '#fbbf24', strokeWidth: 3 }}

  if (status === 'done') {return { stroke: '#34d399', strokeWidth: 2.5 }}

  if (status === 'blocked') {return { stroke: '#f87171', strokeWidth: 3 }}

  if (status === 'active') {return { stroke: '#a78bfa', strokeWidth: 2.5 }}

  return { stroke: '#64748b', strokeWidth: 1.8 }
}

function toFlowEdges(workflow: WriterWorkflow, run?: WorkflowRun): Edge[] {
  return workflow.edges.map(edge => {
    const status = edgeStatus(edge, run)

    return { id: edge.id, source: edge.source, target: edge.target, label: edge.label, sourceHandle: 'out', targetHandle: 'in', markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyleFor(status).stroke }, animated: status === 'running', style: edgeStyleFor(status), data: { status } }
  })
}

function fromFlowEdges(edges: Edge[]) {
  return edges.map(edge => ({ id: edge.id, source: edge.source, target: edge.target, label: typeof edge.label === 'string' ? edge.label : '' }))
}

function WorkflowsCanvas() {
  const [state, setState] = useState<WorkflowState>({})
  const [selectedWorkflowId, setSelectedWorkflowId] = useState('')
  const [workflowName, setWorkflowName] = useState('章节创作流')
  const [agents, setAgents] = useState<WorkflowAgent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState('')
  const [selectedEdgeId, setSelectedEdgeId] = useState('')
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [runMode, setRunMode] = useState<'manual' | 'semi-auto' | 'auto'>('semi-auto')
  const [runHistory, setRunHistory] = useState<WorkflowRun[]>([])
  const [selectedHistoryRunId, setSelectedHistoryRunId] = useState('')

  const [workshopTheme, setWorkshopTheme] = useState<WorkshopThemeKey>(() => {
    const saved = window.localStorage.getItem('karna-workshop-theme') as WorkshopThemeKey | null

    if (saved === 'star') {return 'karna'}

    return saved && saved in WORKSHOP_THEMES ? saved : 'karna'
  })

  const theme = WORKSHOP_THEMES[workshopTheme]
  const [nodeResources, setNodeResources] = useState<{ skills: Array<{ id: string; name: string }>; mcp: Array<{ id: string; name: string }>; knowledge: Array<{ id: string; name: string }>; plugins: Array<{ id: string; name: string }>; models: string[]; souls: string[] }>({ skills: [], mcp: [], knowledge: [], plugins: [], models: ['默认', 'deepseek-chat', 'qwen-long', 'glm-4'], souls: ['不使用 Soul 样板', '鲁迅式锋利批评', '王小波式幽默理性', '金庸式章回叙事'] })
  const [inputText, setInputText] = useState('')
  const [humanReviewText, setHumanReviewText] = useState('')
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [lastRun, setLastRun] = useState<WorkflowRun | undefined>()
  const initializedRef = useRef(false)
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const flow = useReactFlow<FlowNode, Edge>()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; flowX: number; flowY: number; nodeId?: string } | null>(null)
  const [workflowMenu, setWorkflowMenu] = useState<{ x: number; y: number; workflowId: string; name: string } | null>(null)
  const [agentMenu, setAgentMenu] = useState<{ x: number; y: number; agentId: string; name: string; builtin: boolean } | null>(null)
  const [pendingEdgeSource, setPendingEdgeSource] = useState('')
  const pausedNoticeRef = useRef('')

  const selectedNode = useMemo(() => nodes.find(node => node.id === selectedNodeId) || null, [nodes, selectedNodeId])
  const selectedEdge = useMemo(() => edges.find(edge => edge.id === selectedEdgeId) || null, [edges, selectedEdgeId])
  const selectedAgent = useMemo(() => agents.find(agent => agent.id === selectedAgentId) || agents[0] || null, [agents, selectedAgentId])
  const pendingReviewNode = useMemo(() => lastRun?.status === 'paused' && lastRun.paused_at_node_id ? nodes.find(node => node.id === lastRun.paused_at_node_id) || null : null, [lastRun, nodes])
  const builtinAgentIds = useMemo(() => new Set((state.templates || []).map(agent => agent.id)), [state.templates])

  const currentWorkflow = useMemo<WriterWorkflow>(() => ({
    id: selectedWorkflowId || undefined,
    name: workflowName || '未命名创作工作流',
    mode: 'canvas',
    nodes: fromFlowNodes(nodes),
    edges: fromFlowEdges(edges),
    limits: DEFAULT_LIMITS,
    runtimeConfig: DEFAULT_RUNTIME_CONFIG,
    knowledge_binding: { enabled: true, ids: state.project ? [state.project.id] : [] },
    schema_version: 2
  }), [edges, nodes, selectedWorkflowId, state.project, workflowName])

  const workflowNodeById = useMemo(() => new Map(currentWorkflow.nodes.map(node => [node.id, node])), [currentWorkflow.nodes])
  const validation = useMemo(() => validateWorkflow(currentWorkflow), [currentWorkflow])

  const applyRunToCanvas = useCallback((workflow: WriterWorkflow, run?: WorkflowRun) => {
    setLastRun(run)
    setNodes(current => current.map(node => ({ ...node, data: { ...node.data, runStatus: run?.node_statuses?.[node.id]?.status, summary: run?.node_statuses?.[node.id]?.summary } })))
    setEdges(current => current.map(edge => {
      const status = edgeStatus(edge, run)

      return { ...edge, animated: status === 'running', style: edgeStyleFor(status), data: { ...(edge.data || {}), status } }
    }))
  }, [setEdges, setNodes])

  const load = useCallback(async () => {
    const result = await api<WorkflowState>('/api/writer/workflows')

    if (result.error) {throw new Error(result.error)}
    setState(result)
    Promise.all([window.karnaDesktop.api<{ skills?: Array<{ id: string; name: string }>; mcp?: Array<{ id: string; name: string }>; knowledge?: Array<{ id: string; name: string }>; plugins?: Array<{ id: string; name: string }> }>({ path: '/api/writer/resources' }), window.karnaDesktop.api<{ providers?: Array<{ models?: string[] }>; model?: string }>({ path: '/api/model/options' }).catch(() => ({ providers: [], model: '' }))]).then(([resources, modelOptions]) => { const models = Array.from(new Set(['默认', modelOptions.model || '', ...((modelOptions.providers || []).flatMap(provider => provider.models || []))])).filter(Boolean); setNodeResources(current => ({ ...current, skills: resources.skills || [], mcp: resources.mcp || [], knowledge: resources.knowledge || [], plugins: resources.plugins || [], models })) }).catch(() => undefined)
    const nextAgents = (result.agents || result.templates || []).map(normalizeWorkflowAgent)
    setAgents(nextAgents)

    if (selectedWorkflowId) {
      const history = (result.runs || []).filter(row => row.workflow_id === selectedWorkflowId).slice(-5).reverse()
      setRunHistory(history)
    }

    if (!selectedAgentId && nextAgents[0]) {setSelectedAgentId(nextAgents[0].id)}
    const first = result.workflows?.[0] ? migrateWorkflow(result.workflows[0]) : undefined
    const activeWorkflow = selectedWorkflowId ? result.workflows?.find(row => row.id === selectedWorkflowId) : null
    const migratedActiveWorkflow = activeWorkflow ? migrateWorkflow(activeWorkflow) : null

    if (migratedActiveWorkflow && initializedRef.current && !selectedHistoryRunId) {
      const run = result.runs?.filter(row => row.workflow_id === migratedActiveWorkflow.id).at(-1)
      applyRunToCanvas(migratedActiveWorkflow, run)
    } else if (first && !selectedWorkflowId && !initializedRef.current) {
      initializedRef.current = true
      const run = result.runs?.filter(row => row.workflow_id === first.id).at(-1)
      setSelectedWorkflowId(first.id || '')
      setWorkflowName(first.name)
      setNodes(toFlowNodes(first, nextAgents, run))
      setEdges(toFlowEdges(first, run))
      setLastRun(run)
    } else if (!first && !initializedRef.current) {
      initializedRef.current = true
      applyTemplate('chapter', nextAgents)
    }
  }, [applyRunToCanvas, selectedAgentId, selectedWorkflowId, setEdges, setNodes, selectedHistoryRunId])

  const refreshCanvas = useCallback(() => {
    void load().catch(() => undefined)
  }, [load])

  useEffect(() => {
    (window as any).__karnaSelectedWorkflowId = selectedWorkflowId
    ;(window as any).__karnaLastRunId = lastRun?.run_id
    ;(window as any).__karnaRefreshCanvas = refreshCanvas

    return () => {
      delete (window as any).__karnaSelectedWorkflowId
      delete (window as any).__karnaLastRunId
      delete (window as any).__karnaRefreshCanvas
    }
  }, [selectedWorkflowId, lastRun?.run_id, refreshCanvas])

  useEffect(() => { void load().catch(err => notifyError(err, '多智能体工坊加载失败')) }, [load])
  useEffect(() => {
    if (!running && lastRun?.status !== 'running') {return}

    const timer = window.setInterval(() => {
      void load().catch(() => undefined)
    }, 2000)

    return () => window.clearInterval(timer)
  }, [load, running, lastRun?.status])
  useEffect(() => {
    if (lastRun?.status !== 'paused' || !lastRun.paused_at_node_id) {return}
    const pausedNode = nodes.find(node => node.id === lastRun.paused_at_node_id)

    if (!pausedNode?.data?.requiresReview) {return}
    const key = `${lastRun.run_id}:${lastRun.paused_at_node_id}`

    if (pausedNoticeRef.current === key) {return}
    pausedNoticeRef.current = key
    notify({ kind: 'warning', title: '等待人工确认', message: '工作流已暂停，请在右侧填写意见后继续。' })
  }, [lastRun, nodes])


  const applyWorkflow = (workflow: WriterWorkflow) => {
    const migrated = migrateWorkflow(workflow)
    setWorkflowMenu(null)
    setAgentMenu(null)
    setSelectedWorkflowId(migrated.id || '')
    setWorkflowName(migrated.name)
    setSelectedHistoryRunId('')
    const run = state.runs?.filter(row => row.workflow_id === migrated.id).at(-1)
    setLastRun(run)
    setNodes(toFlowNodes(migrated, agents, run))
    setEdges(toFlowEdges(migrated, run))
  }

  const stopWorkflow = async () => {
    if (!selectedWorkflowId || !lastRun) {return}

    try {
      await api(`/api/writer/workflows/${encodeURIComponent(selectedWorkflowId)}/runs/${encodeURIComponent(lastRun.run_id)}/stop`, 'POST')
      setRunning(false)
      notify({ kind: 'info', title: '已发送停止信号', message: '工作流将在当前节点完成后停止' })
      await load()
    } catch (err) {
      setRunning(false)
    }
  }

  const loadHistoryRun = (run: WorkflowRun) => {
    setSelectedHistoryRunId(run.run_id)
    setLastRun(run)
    const workflow = state.workflows?.find(w => w.id === selectedWorkflowId)

    if (workflow) {
      const migrated = migrateWorkflow(workflow)
      setNodes(toFlowNodes(migrated, agents, run))
      setEdges(toFlowEdges(migrated, run))
    }
  }

  const resumeFromHistory = () => {
    setSelectedHistoryRunId('')
    void load()
  }

  const deleteWorkflow = async (workflowId: string, name: string) => {
    setWorkflowMenu(null)
    const ok = window.confirm(`确定删除「${name}」吗？这只会删除这个已保存流程，不会删除项目正文。`)

    if (!ok) {return}

    try {
      const result = await api<{ ok: boolean; workflows?: WriterWorkflow[]; error?: string }>(`/api/writer/workflows/${encodeURIComponent(workflowId)}`, 'DELETE')

      if (!result.ok) {throw new Error(result.error || '删除失败')}
      notify({ kind: 'success', title: '流程已删除', message: name })

      if (selectedWorkflowId === workflowId) {
        setSelectedWorkflowId('')
        setLastRun(undefined)
        setNodes([])
        setEdges([])
      }

      await load()
    } catch (err) {
      notifyError(err, '删除工作流失败')
    }
  }

  const deleteAgent = async (agentId: string, name: string, builtin: boolean) => {
    setAgentMenu(null)

    if (builtin) {
      notify({ kind: 'warning', title: '内置智能体不能直接删除', message: '请先复制成自定义智能体，再删除或修改副本。' })

      return
    }

    const ok = window.confirm(`确定删除「${name}」吗？引用它的节点会保留，但需要重新绑定智能体。`)

    if (!ok) {return}

    try {
      const result = await api<{ ok: boolean; agents?: WorkflowAgent[]; error?: string }>(`/api/writer/agents/library/${encodeURIComponent(agentId)}`, 'DELETE')

      if (!result.ok) {throw new Error(result.error || '删除失败')}
      const nextAgents = (result.agents || []).map(normalizeWorkflowAgent)
      setAgents(nextAgents)

      if (selectedAgentId === agentId) {setSelectedAgentId(nextAgents[0]?.id || '')}
      notify({ kind: 'success', title: '智能体已删除', message: name })
      await load()
    } catch (err) {
      notifyError(err, '删除智能体失败')
    }
  }

  const applyEmptyTemplate = () => {
    setSelectedWorkflowId('')
    setWorkflowName('空白工作流')
    setLastRun(undefined)
    setSelectedNodeId('')
    setSelectedEdgeId('')
    setNodes([])
    setEdges([])
  }

  const applyTemplate = (kind: 'chapter' | 'polish' | 'foreshadow' | 'unstuck', sourceAgents = agents) => {
    const template = createWorkflowTemplate(kind)
    const agentMap = new Map(sourceAgents.map(agent => [agent.id, agent]))
    template.nodes = template.nodes.map(node => ({ ...node, data: { ...node.data, agent_name: node.data.agent_id ? agentMap.get(String(node.data.agent_id))?.name : undefined } }))
    setSelectedWorkflowId('')
    setWorkflowName(template.name)
    setLastRun(undefined)
    setNodes(toFlowNodes(template, sourceAgents))
    setEdges(toFlowEdges(template))
  }

  const onConnect = useCallback((connection: Connection) => {
    setEdges(current => addEdge({ ...connection, sourceHandle: connection.sourceHandle || 'out', targetHandle: connection.targetHandle || 'in', markerEnd: { type: MarkerType.ArrowClosed, color: '#c4b5fd' }, style: { stroke: '#c4b5fd', strokeWidth: 2.5 }, animated: false }, current))
  }, [setEdges])

  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    const raw = event.dataTransfer.getData('application/karna-workflow-node')

    if (!raw) {return}
    const item = JSON.parse(raw) as { type: WorkflowNodeType; label: string; agent?: WorkflowAgent }
    const position = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const id = `${item.type}_${Date.now()}`
    const data: FlowNodeData = { label: item.agent?.name || item.label, nodeType: item.type, agent_id: item.agent?.id, agent_name: item.agent?.name, model: '默认模型', skill: '自动', plugin: '自动', mcp: '自动' }
    setNodes(current => [...current, { id, type: 'custom', position, data }])
  }, [flow, setNodes])

  const createNodeAt = (type: WorkflowNodeType, x: number, y: number, label?: string) => {
    const id = `${type}_${Date.now()}`
    setNodes(current => [...current, { id, type: 'custom', position: { x, y }, data: { label: label || NODE_PALETTE.find(item => item.type === type)?.label || type, nodeType: type, model: '默认模型', skill: '自动', plugin: '自动', mcp: '自动' } }])
    setContextMenu(null)
  }

  const deleteNode = (nodeId: string) => {
    setNodes(current => current.filter(node => node.id !== nodeId))
    setEdges(current => current.filter(edge => edge.source !== nodeId && edge.target !== nodeId))

    if (selectedNodeId === nodeId) {setSelectedNodeId('')}
    setContextMenu(null)
  }

  const startEdgeFrom = (nodeId: string) => {
    setPendingEdgeSource(nodeId)
    setContextMenu(null)
    notify({ kind: 'info', title: '新建有向边', message: '请点击目标节点完成连线。' })
  }

  const arrangeNodes = () => {
    const ids = nodes.map(node => node.id)
    const indegree = new Map(ids.map(id => [id, 0]))
    const outgoing = new Map(ids.map(id => [id, [] as string[]]))

    for (const edge of edges) {
      if (!indegree.has(edge.source) || !indegree.has(edge.target)) {continue}
      indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1)
      outgoing.get(edge.source)?.push(edge.target)
    }

    const queue = ids.filter(id => (indegree.get(id) || 0) === 0)
    const ordered: string[] = []

    while (queue.length) {
      const id = queue.shift()!

      if (ordered.includes(id)) {continue}
      ordered.push(id)

      for (const next of outgoing.get(id) || []) {
        indegree.set(next, (indegree.get(next) || 0) - 1)

        if ((indegree.get(next) || 0) <= 0) {queue.push(next)}
      }
    }

    for (const id of ids) {if (!ordered.includes(id)) {ordered.push(id)}}
    const orderIndex = new Map(ordered.map((id, index) => [id, index]))
    setNodes(current => current.map(node => {
      const index = orderIndex.get(node.id) ?? 0

      return { ...node, position: { x: 80 + (index % 4) * 260, y: 110 + Math.floor(index / 4) * 170 } }
    }))
  }

  const saveWorkflow = async (): Promise<string> => {
    if (!validation.valid) {
      const firstError = validation.errors[0]
      notify({ kind: 'error', title: '工作流校验失败', message: firstError?.userMessage || firstError?.message || '校验失败' })

 return ''
    }

    setSaving(true)

    try {
      const result = await api<{ ok: boolean; workflow?: WriterWorkflow; error?: string }>('/api/writer/workflows', 'POST', currentWorkflow)

      if (!result.ok || !result.workflow) {throw new Error(result.error || '保存失败')}
      notify({ kind: 'success', title: '工作流已保存', message: result.workflow.name })
      setSelectedWorkflowId(result.workflow.id || '')
      await load()

      return result.workflow.id || ''
    } catch (err) { notifyError(err, '保存工作流失败');

 return '' } finally { setSaving(false) }
  }

  const runWorkflow = async (nodeId?: string) => {
    let id = selectedWorkflowId

    if (!id) {
      id = await saveWorkflow()
    }

    const runId = id || selectedWorkflowId

    if (!runId) { notify({ kind: 'error', title: '请先保存工作流', message: '运行或重跑节点前，需要先保存当前工作流。' });

 return }

    setRunning(true)
    setNodes(current => current.map((node, index) => ({ ...node, data: { ...node.data, runStatus: nodeId ? (node.id === nodeId ? 'running' : node.data.runStatus) : (index === 0 ? 'running' : 'queued'), summary: nodeId && node.id !== nodeId ? node.data.summary : node.data.summary } })))

    try {
      const path = nodeId ? `/api/writer/workflows/${encodeURIComponent(runId)}/nodes/${encodeURIComponent(nodeId)}/rerun` : `/api/writer/workflows/${encodeURIComponent(runId)}/run`
      const result = await api<{ ok: boolean; run?: WorkflowRun; error?: string }>(path, 'POST', { input: inputText })

      if (!result.ok || !result.run) {throw new Error(result.error || '运行失败')}
      setLastRun(result.run)
      setNodes(current => current.map(node => ({ ...node, data: { ...node.data, runStatus: result.run?.node_statuses?.[node.id]?.status, summary: result.run?.node_statuses?.[node.id]?.summary } })))
      setEdges(current => current.map(edge => { const status = edgeStatus(edge, result.run);

 return { ...edge, animated: status === 'running', style: edgeStyleFor(status), data: { ...(edge.data || {}), status } } }))
      notify({ kind: 'success', title: nodeId ? '节点已重跑' : '工作流已运行', message: statusLabel(result.run.status) })
      await load()
    } catch (err) { notifyError(err, '运行工作流失败') } finally { setRunning(false) }
  }

  const continueWorkflow = async () => {
    const run = lastRun

    if (!selectedWorkflowId || !run) {return}
    setRunning(true)

    try {
      const result = await api<{ ok: boolean; run?: WorkflowRun; error?: string }>(`/api/writer/workflows/${encodeURIComponent(selectedWorkflowId)}/continue`, 'POST', { runId: run.run_id, humanInput: humanReviewText })

      if (!result.ok || !result.run) {throw new Error(result.error || '继续运行失败')}
      setLastRun(result.run)
      setHumanReviewText('')
      setNodes(current => current.map(node => ({ ...node, data: { ...node.data, runStatus: result.run?.node_statuses?.[node.id]?.status, summary: result.run?.node_statuses?.[node.id]?.summary } })))
      notify({ kind: 'success', title: '工作流已继续', message: statusLabel(result.run.status) })
      await load()
    } catch (err) { notifyError(err, '继续工作流失败') } finally { setRunning(false) }
  }

  const markNodeAction = async (nodeId: string, action: 'accept' | 'reject' | 'skip') => {
    if (!selectedWorkflowId || !lastRun) {return}

    try {
      const result = await api<{ ok: boolean; run?: WorkflowRun; error?: string }>(`/api/writer/workflows/${encodeURIComponent(selectedWorkflowId)}/runs/${encodeURIComponent(lastRun.run_id)}/nodes/${encodeURIComponent(nodeId)}/${action}`, 'POST')

      if (!result.ok || !result.run) {throw new Error(result.error || '更新失败')}
      setLastRun(result.run)
      setNodes(current => current.map(node => node.id === nodeId ? { ...node, data: { ...node.data, runStatus: result.run?.node_statuses?.[node.id]?.status, summary: result.run?.node_statuses?.[node.id]?.summary } } : node))
    } catch (err) { notifyError(err, '更新节点状态失败') }
  }

  const patchEdge = (patch: Partial<Edge>) => {
    if (!selectedEdge) {return}
    setEdges(current => current.map(edge => edge.id === selectedEdge.id ? { ...edge, ...patch } : edge))
  }

  const deleteSelectedEdge = () => {
    if (!selectedEdge) {return}
    setEdges(current => current.filter(edge => edge.id !== selectedEdge.id))
    setSelectedEdgeId('')
  }

  const patchNode = (patch: Partial<FlowNodeData>) => {
    if (!selectedNode) {return}
    setNodes(current => current.map(node => node.id === selectedNode.id ? { ...node, data: { ...node.data, ...patch } } : node))
  }

  const patchAgent = async (patch: Partial<WorkflowAgent>) => {
    if (!selectedAgent) {return}
    const next = normalizeWorkflowAgent({ ...selectedAgent, ...patch })
    setAgents(current => current.map(agent => agent.id === next.id ? next : agent))

    try {
      await api('/api/writer/agents/library/' + encodeURIComponent(next.id), 'PATCH', next)
      notify({ kind: 'success', title: 'Agent 已保存', message: next.name })
    } catch (err) { notifyError(err, '保存智能体失败') }
  }

  const createAgent = async (template?: WorkflowAgent) => {
    const next = normalizeWorkflowAgent({ ...(template || {}), id: `custom_${Date.now()}`, name: template ? `${template.name} 副本` : '我的自定义智能体' })
    const result = await api<{ ok: boolean; agents?: WorkflowAgent[]; error?: string }>('/api/writer/agents/library', 'POST', next)

    if (!result.ok) {throw new Error(result.error || '创建失败')}
    setAgents((result.agents || []).map(normalizeWorkflowAgent))
    setSelectedAgentId(next.id)
  }

  const dragPayload = (payload: unknown) => (event: React.DragEvent) => {
    event.dataTransfer.setData('application/karna-workflow-node', JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'move'
  }

  const totalCount = Object.keys(lastRun?.node_statuses || {}).length || nodes.length
  const completedCount = Object.values(lastRun?.node_statuses || {}).filter(row => row.status === 'done' || row.status === 'accepted').length

  if (state.error) {
    return <div className="grid h-full place-items-center bg-[var(--dt-background)] p-8 text-center"><div><h2 className="text-lg font-semibold text-[var(--theme-foreground)]">多智能体工坊暂不可用</h2><p className="mt-2 text-sm text-[var(--theme-foreground)]/60">{state.error}</p><p className="mt-4 text-xs text-[var(--theme-foreground)]/60">请先创建或打开一个写作项目。</p></div></div>
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col pt-(--titlebar-height) font-sans antialiased', theme.root, theme.text, '[&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-55')}>
      <header className={cn('flex items-center justify-between gap-4 border-b px-5 py-4 backdrop-blur-xl', theme.panel)}>
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/90 text-sm font-black tracking-[0.18em]">K</div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Karna 多智能体流程工坊</h1>
            <p className="mt-0.5 text-sm font-medium text-[var(--theme-foreground)]/60">{state.project ? `${state.project.title} · ${state.project.type}` : '为写作、改稿和审查搭建可视化协作流'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input className={cn('w-64 rounded-xl border px-3 py-2 text-sm font-medium outline-none', theme.field)} onChange={event => setWorkflowName(event.target.value)} value={workflowName} />
          <select className={cn('rounded-xl border px-3 py-2 text-sm font-medium outline-none', theme.field)} onChange={event => setWorkshopTheme(event.target.value as WorkshopThemeKey)} value={workshopTheme}>{(Object.entries(WORKSHOP_THEMES) as Array<[WorkshopThemeKey, typeof WORKSHOP_THEMES[WorkshopThemeKey]]>).map(([key, row]) => <option key={key} value={key}>{row.label}</option>)}</select>
          <Button className="border-[var(--dt-border)] bg-[var(--theme-card-seed)] text-[var(--theme-foreground)] hover:border-[var(--theme-primary)]/40 hover:bg-[var(--theme-primary)]/5 disabled:text-[var(--theme-foreground)]/30" onClick={arrangeNodes} size="sm" variant="outline">整理节点</Button>
          <Button className={cn(theme.card, "disabled:text-[var(--theme-foreground)]/30")} disabled={saving} onClick={() => void saveWorkflow()} size="sm" variant="outline">{saving ? '保存中...' : '保存流程'}</Button>
          <Button disabled={running || !validation.valid} onClick={() => void runWorkflow()} size="sm">{running ? '运行中...' : '运行工作流'}</Button>
        </div>
      </header>

      <main className={cn('relative grid min-h-0 flex-1', leftOpen && rightOpen ? 'grid-cols-[320px_minmax(0,1fr)_440px]' : leftOpen ? 'grid-cols-[320px_minmax(0,1fr)]' : rightOpen ? 'grid-cols-[minmax(0,1fr)_440px]' : 'grid-cols-1')} onClick={() => setWorkflowMenu(null)}>
        <button aria-label={leftOpen ? '隐藏左侧栏' : '显示左侧栏'} className={cn('absolute left-2 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-lg border text-base shadow-sm backdrop-blur', theme.panel)} onClick={() => setLeftOpen(v => !v)} title={leftOpen ? '隐藏左侧栏' : '显示左侧栏'} type="button">{leftOpen ? '◧' : '◨'}</button>
        <button aria-label={rightOpen ? '隐藏右侧栏' : '显示右侧栏'} className={cn('absolute right-2 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-lg border text-base shadow-sm backdrop-blur', theme.panel)} onClick={() => setRightOpen(v => !v)} title={rightOpen ? '隐藏右侧栏' : '显示右侧栏'} type="button">{rightOpen ? '◨' : '◧'}</button>

        {leftOpen ? <aside className={cn("min-h-0 overflow-auto border-r p-4 backdrop-blur-xl", theme.panel)}>
          <Section title="极简模板">
            <div className="grid gap-2">
              <button className={cn("rounded-xl border px-3 py-2 text-left text-sm", theme.card)} onClick={applyEmptyTemplate} type="button">新建空模板</button>
              {([
                ['chapter', '章节创作流'], ['polish', '单章润色点评流'], ['foreshadow', '伏笔回收流'], ['unstuck', '卡文救援流']
              ] as const).map(([kind, label]) => <button className={cn("rounded-xl border px-3 py-2 text-left text-sm", theme.card)} key={kind} onClick={() => applyTemplate(kind)} type="button">{label}</button>)}
            </div>
          </Section>

          <Section title="已保存流程">
            <div className="grid gap-2">
              {(state.workflows || []).length ? state.workflows!.map(workflow => {
                const run = state.runs?.filter(row => row.workflow_id === workflow.id).at(-1)
                const busy = run?.status === 'running'
                const reviewWaiting = run?.status === 'paused'

                return (
                  <button className={cn('grid min-w-0 gap-1 overflow-hidden rounded-2xl border px-3 py-3 text-left text-sm transition', selectedWorkflowId === workflow.id ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 text-[var(--theme-foreground)] shadow-sm' : busy ? 'border-[var(--theme-primary)]/40 bg-[var(--theme-primary)]/8 text-[var(--theme-foreground)]' : reviewWaiting ? 'border-[var(--theme-secondary)]/40 bg-[var(--theme-secondary)]/8 text-[var(--theme-foreground)]' : theme.card)} key={workflow.id} onClick={() => applyWorkflow(workflow)} onContextMenu={event => { event.preventDefault(); event.stopPropagation();

 if (workflow.id) {setWorkflowMenu({ x: event.clientX, y: event.clientY, workflowId: workflow.id, name: workflow.name })} }} title="右键可删除此流程" type="button">
                    <span className="flex min-w-0 items-center gap-2 font-semibold">
                      <span className="min-w-0 flex-1 truncate">{workflow.name}</span>
                      {busy ? <span className="shrink-0 animate-pulse rounded-full bg-[var(--theme-primary)]/20 px-2 py-0.5 text-[0.66rem] text-[var(--theme-primary)]">运行中</span> : reviewWaiting ? <span className="shrink-0 rounded-full bg-[var(--theme-secondary)]/20 px-2 py-0.5 text-[0.66rem] text-[var(--theme-secondary)]">待确认</span> : run ? <span className="shrink-0 rounded-full bg-[var(--theme-foreground)]/8 px-2 py-0.5 text-[0.66rem] text-[var(--theme-foreground)]/70">{statusLabel(run.status)}</span> : null}
                    </span>
                    <span className="block truncate text-xs font-medium text-[var(--theme-foreground)]/60">{workflow.nodes.length} 个节点 · {workflow.edges.length} 条连线{run ? ` · ${statusLabel(run.status)}` : ''}</span>
                  </button>
                )
              }) : <p className="rounded-xl border border-dashed border-[var(--dt-border)] p-3 text-xs font-medium text-[var(--theme-foreground)]/50">暂无已保存流程</p>}
            </div>
          </Section>

          <Section action={<Button onClick={() => void createAgent().catch(err => notifyError(err, '创建智能体失败'))} size="sm" variant="ghost">新增</Button>} title="智能体库">
            <div className="grid gap-2">
              {agents.map(agent => {
                const builtin = builtinAgentIds.has(agent.id)

                return (
                  <button className={cn('grid min-w-0 gap-1 overflow-hidden rounded-xl border px-3 py-2 text-left text-sm', selectedAgentId === agent.id ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)]/10 text-[var(--theme-foreground)]' : theme.card)} draggable key={agent.id} onClick={() => setSelectedAgentId(agent.id)} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); setSelectedAgentId(agent.id); setAgentMenu({ x: event.clientX, y: event.clientY, agentId: agent.id, name: agent.name, builtin }) }} onDragStart={dragPayload({ type: 'agent', label: agent.name, agent })} title={builtin ? '内置智能体：右键可复制，不能直接删除' : '右键可复制或删除此智能体'} type="button">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: agent.color }} />
                      <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                      {builtin ? <span className="shrink-0 rounded-full bg-[var(--theme-foreground)]/8 px-1.5 py-0.5 text-[0.62rem]">内置</span> : null}
                    </span>
                    <span className="block truncate text-xs opacity-85">{agent.tagline || agent.role}</span>
                  </button>
                )
              })}
            </div>
          </Section>

          <Section title="控制节点">
            <div className="grid gap-2">
              {NODE_PALETTE.map(item => <button className={cn("rounded-xl border border-dashed px-3 py-2 text-left text-sm", theme.card)} draggable key={item.type} onDragStart={dragPayload(item)} type="button"><span className="block font-medium">{item.label}</span><span className="text-xs opacity-85">{item.desc}</span></button>)}
            </div>
          </Section>
        </aside> : null}

        {workflowMenu ? <div className={cn('fixed z-[70] min-w-44 rounded-xl border p-1 text-sm shadow-2xl backdrop-blur', theme.panel)} onClick={event => event.stopPropagation()} onContextMenu={event => event.preventDefault()} style={{ left: workflowMenu.x, top: workflowMenu.y }}>
          <div className="max-w-56 truncate px-3 py-2 text-xs text-[var(--theme-foreground)]/60">{workflowMenu.name}</div>
          <button className="block w-full rounded-lg px-3 py-2 text-left text-[var(--dt-destructive)] hover:bg-[var(--dt-destructive)]/10" onClick={() => void deleteWorkflow(workflowMenu.workflowId, workflowMenu.name)} type="button">删除此流程</button>
        </div> : null}
        {agentMenu ? <div className={cn('fixed z-[70] min-w-44 rounded-xl border p-1 text-sm shadow-2xl backdrop-blur', theme.panel)} onClick={event => event.stopPropagation()} onContextMenu={event => event.preventDefault()} style={{ left: agentMenu.x, top: agentMenu.y }}>
          <div className="max-w-56 truncate px-3 py-2 text-xs text-[var(--theme-foreground)]/60">{agentMenu.name}</div>
          <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--theme-foreground)]/8" onClick={() => { const agent = agents.find(row => row.id === agentMenu.agentId); setAgentMenu(null);

 if (agent) {void createAgent(agent).catch(err => notifyError(err, '复制智能体失败'))} }} type="button">复制此智能体</button>
          <button className={cn('block w-full rounded-lg px-3 py-2 text-left', agentMenu.builtin ? 'text-[var(--theme-foreground)]/40' : 'text-[var(--dt-destructive)] hover:bg-[var(--dt-destructive)]/10')} onClick={() => void deleteAgent(agentMenu.agentId, agentMenu.name, agentMenu.builtin)} type="button">{agentMenu.builtin ? '内置智能体不能删除' : '删除此智能体'}</button>
        </div> : null}

        <section className="min-h-0">
          <ReactFlow className={theme.canvas} defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: '#a78bfa', strokeWidth: 2 }, animated: true }} edges={edges} fitView nodes={nodes} nodeTypes={nodeTypes} onConnect={onConnect} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'move' }} onDrop={onDrop} onEdgeClick={(_, edge) => { setContextMenu(null); setSelectedEdgeId(edge.id); setSelectedNodeId('') }} onEdgesChange={onEdgesChange} onNodeClick={(_, node) => { setContextMenu(null);

 if (pendingEdgeSource && pendingEdgeSource !== node.id) { setEdges(current => addEdge({ id: `edge_${pendingEdgeSource}_${node.id}_${Date.now()}`, source: pendingEdgeSource, target: node.id, sourceHandle: 'out', targetHandle: 'in', markerEnd: { type: MarkerType.ArrowClosed, color: '#c4b5fd' }, style: { stroke: '#c4b5fd', strokeWidth: 2.5 } }, current)); setPendingEdgeSource('') } setSelectedNodeId(node.id); setSelectedEdgeId('') }} onNodeContextMenu={(event, node) => { event.preventDefault(); setSelectedNodeId(node.id); setSelectedEdgeId(''); setContextMenu({ x: event.clientX, y: event.clientY, flowX: node.position.x, flowY: node.position.y, nodeId: node.id }) }} onNodesChange={onNodesChange} onPaneClick={() => { setContextMenu(null); setWorkflowMenu(null); setAgentMenu(null) }} onPaneContextMenu={event => { event.preventDefault(); const pos = flow.screenToFlowPosition({ x: event.clientX, y: event.clientY }); setContextMenu({ x: event.clientX, y: event.clientY, flowX: pos.x, flowY: pos.y }) }}>
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
            <Panel position="top-left">
              <div className={cn("rounded-xl border p-2 text-xs shadow-sm backdrop-blur", theme.panel)}>
                Karna 调度器已锁定：子智能体不互聊，所有输出先汇总再下发。
              </div>
            </Panel>
            <Panel position="top-center">
              <div className={cn("flex items-center gap-3 rounded-xl border px-4 py-2 shadow-lg backdrop-blur-xl", theme.panel)}>
                <select className={cn("min-w-40 rounded-lg border px-3 py-1.5 text-sm outline-none", theme.field)} onChange={event => { const wf = state.workflows?.find(w => w.id === event.target.value);

 if (wf) {applyWorkflow(wf)} }} value={selectedWorkflowId}>
                  {(state.workflows || []).map(wf => <option key={wf.id} value={wf.id}>{wf.name}</option>)}
                </select>
                <div className="flex rounded-lg border overflow-hidden">
                  {[
                    { key: 'manual', label: '手动' },
                    { key: 'semi-auto', label: '半自动' },
                    { key: 'auto', label: '全自动' }
                  ].map(mode => (
                    <button className={cn("px-3 py-1.5 text-xs font-medium transition-colors", runMode === mode.key ? "bg-[var(--theme-primary)] text-white" : "bg-[var(--theme-card-seed)] hover:bg-[var(--theme-foreground)]/5")} key={mode.key} onClick={() => setRunMode(mode.key as any)} type="button">{mode.label}</button>
                  ))}
                </div>
                {(running || lastRun?.status === 'running') ? (
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-medium text-[var(--theme-foreground)]/70">
                      已完成 {completedCount}/{totalCount} 节点
                    </div>
                    <div className="h-2 w-24 rounded-full bg-[var(--theme-foreground)]/10 overflow-hidden">
                      <div className="h-full bg-[var(--theme-primary)] transition-all duration-500" style={{ width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : '0%' }} />
                    </div>
                    <Button aria-label="停止工作流" className="border-[var(--dt-destructive)]/40 bg-[var(--dt-destructive)]/90 text-white hover:bg-[var(--dt-destructive)]" onClick={() => void stopWorkflow()} size="sm" variant="outline"><Codicon className="h-3.5 w-3.5" name="debug-stop" /></Button>
                  </div>
                ) : (
                  <Button className="border-[var(--theme-secondary)]/40 bg-emerald-500 text-white hover:bg-emerald-600" disabled={running || !validation.valid || !nodes.length} onClick={() => void runWorkflow()} size="sm"><Codicon className="h-3.5 w-3.5" name="play" />运行</Button>
                )}
                {selectedHistoryRunId ? (
                  <Button className="border-[var(--dt-border)]" onClick={resumeFromHistory} size="sm" variant="outline">返回实时</Button>
                ) : null}
              </div>
            </Panel>
          </ReactFlow>
          {contextMenu ? <div className={cn('fixed z-50 min-w-44 rounded-xl border p-1 text-sm shadow-2xl backdrop-blur', theme.panel)} onContextMenu={event => event.preventDefault()} style={{ left: contextMenu.x, top: contextMenu.y }}>
            {contextMenu.nodeId ? <>
              <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--theme-foreground)]/8" onClick={() => startEdgeFrom(contextMenu.nodeId!)} type="button">新建有向边</button>
              <button className="block w-full rounded-lg px-3 py-2 text-left text-[var(--dt-destructive)] hover:bg-[var(--dt-destructive)]/10" onClick={() => deleteNode(contextMenu.nodeId!)} type="button">删除此节点</button>
            </> : <>
              {NODE_PALETTE.map(item => <button className="block w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--theme-foreground)]/8" key={item.type} onClick={() => createNodeAt(item.type, contextMenu.flowX, contextMenu.flowY, item.label)} type="button">新建：{item.label}</button>)}
            </>}
          </div> : null}
        </section>

        {rightOpen ? <aside className={cn("min-h-0 overflow-auto border-l p-4 backdrop-blur-xl", theme.panel)}>
          <Section title="运行输入">
            <textarea className={cn("min-h-28 w-full rounded-xl border p-3 text-sm outline-none", theme.field)} onChange={event => setInputText(event.target.value)} placeholder="把本次写作需求、章节正文或卡文点放在这里。" value={inputText} />
            {validation.errors.length ? <div className="mt-2 rounded-lg border border-[var(--dt-destructive)]/30 bg-[var(--dt-destructive)]/5 p-2 text-xs text-[var(--dt-destructive)]">{validation.errors.map(e => e.userMessage || e.message).join('；')}</div> : <div className="mt-2 text-xs font-medium text-[var(--theme-foreground)]/50">校验通过：最多 10 个智能体、单向连线、循环必须走循环节点。</div>}
          </Section>

          {runHistory.length > 0 ? <Section title="运行历史">
            <div className="grid gap-2">
              {runHistory.map(run => {
                const doneCount = Object.values(run.node_statuses || {}).filter(s => s.status === 'done').length
                const isSelected = selectedHistoryRunId === run.run_id || (!selectedHistoryRunId && lastRun?.run_id === run.run_id)

                return (
                  <button className={cn("rounded-lg border p-2 text-left text-sm transition-colors", isSelected ? "border-[var(--theme-primary)]/40 bg-[var(--theme-primary)]/8" : "hover:bg-[var(--theme-foreground)]/5")} key={run.run_id} onClick={() => loadHistoryRun(run)} type="button">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium text-[var(--theme-foreground)]/70">{String(run.run_id).slice(0, 8)}</span>
                      <Badge className={cn("text-xs", statusBadgeClass(run.status))}>{statusLabel(run.status)}</Badge>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 text-xs text-[var(--theme-foreground)]/60">
                      <span>节点 {doneCount}/{Object.keys(run.node_statuses || {}).length}</span>
                      <span>{run.started_at ? new Date(run.started_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </Section> : null}

          {pendingReviewNode ? <Section title="等待确认">
            <div className="grid gap-2 rounded-xl border border-[var(--theme-secondary)]/30 bg-[var(--theme-secondary)]/8 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <strong className="min-w-0 truncate text-[var(--theme-foreground)]/80">暂停节点：{pendingReviewNode.data.label}</strong>
                <Badge className="shrink-0 bg-[var(--theme-secondary)]/20 text-[var(--theme-secondary)]">待确认</Badge>
              </div>
              <p className="text-xs font-medium text-[var(--theme-foreground)]/60">在这里填写你的修改意见或直接点"确认并继续"。确认后会调用继续接口，不再只停在列表里显示待确认。</p>
              <textarea className={cn('min-h-20 rounded-xl border p-3 text-sm outline-none', theme.field)} onChange={event => setHumanReviewText(event.target.value)} placeholder="例如：接受当前结果，继续下一步；或写下需要重写的意见。" value={humanReviewText} />
              <div className="grid grid-cols-3 gap-2">
                <Button className="border-[var(--theme-primary)]/40 bg-[var(--theme-primary)] text-[var(--theme-card-seed)] hover:opacity-90" disabled={running} onClick={() => void continueWorkflow()} size="sm">确认并继续</Button>
                <Button className="border-[var(--dt-destructive)]/40 bg-[var(--dt-destructive)]/90 text-white hover:bg-[var(--dt-destructive)]" disabled={running} onClick={() => void markNodeAction(pendingReviewNode.id, 'reject')} size="sm" variant="outline">驳回节点</Button>
                <Button className="border-[var(--dt-border)] bg-[var(--theme-card-seed)] text-[var(--theme-foreground)] hover:border-[var(--theme-primary)]/40" disabled={running} onClick={() => void markNodeAction(pendingReviewNode.id, 'skip')} size="sm" variant="outline">跳过节点</Button>
              </div>
            </div>
          </Section> : null}

          <Section title="节点配置">
            {selectedNode ? <div className="grid gap-2 text-sm">
              <label className="grid gap-1"><span className="text-xs font-medium text-[var(--theme-foreground)]/50">节点名称</span><input className={cn("rounded-lg border px-3 py-2 outline-none", theme.field)} onChange={event => patchNode({ label: event.target.value })} value={selectedNode.data.label} /></label>
              {selectedNode.data.nodeType === 'agent' ? <label className="grid gap-1"><span className="text-xs font-medium text-[var(--theme-foreground)]/50">选择智能体</span><select className={cn("rounded-lg border px-3 py-2", theme.field)} onChange={event => { const agent = agents.find(row => row.id === event.target.value); patchNode({ agent_id: event.target.value, agent_name: agent?.name }) }} value={String(selectedNode.data.agent_id || '')}>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label> : null}
              {selectedNode.data.nodeType === 'condition' ? <div className="grid gap-2 rounded-xl border border-[var(--theme-secondary)]/30 bg-[var(--theme-secondary)]/8 p-2"><label className="grid gap-1"><span className="text-xs text-[var(--theme-secondary)]">{UI.conditionWhen}</span><input className={cn("rounded-lg border px-3 py-2 outline-none", theme.field)} onChange={event => patchNode({ condition: event.target.value })} placeholder={UI.conditionPlaceholder} value={String(selectedNode.data.condition || '')} /></label><label className="grid gap-1"><span className="text-xs text-[var(--theme-secondary)]">{UI.passScore}</span><input className={cn("rounded-lg border px-3 py-2 outline-none", theme.field)} max={100} min={0} onChange={event => patchNode({ threshold: Number(event.target.value) })} type="number" value={Number(selectedNode.data.threshold || 60)} /></label><div className="grid grid-cols-2 gap-2"><label className="grid gap-1"><span className="text-xs text-[var(--theme-secondary)]">{UI.passTarget}</span><select className={cn("rounded-lg border px-2 py-2", theme.field)} onChange={event => patchNode({ passTargetId: event.target.value })} value={String(selectedNode.data.passTargetId || '')}><option value="">{UI.defaultNext}</option>{nodes.filter(node => node.id !== selectedNode.id).map(node => <option key={node.id} value={node.id}>{node.data.label}</option>)}</select></label><label className="grid gap-1"><span className="text-xs text-[var(--theme-secondary)]">{UI.retryTarget}</span><select className={cn("rounded-lg border px-2 py-2", theme.field)} onChange={event => patchNode({ retryTargetId: event.target.value })} value={String(selectedNode.data.retryTargetId || '')}><option value="">{UI.defaultNext}</option>{nodes.filter(node => node.id !== selectedNode.id).map(node => <option key={node.id} value={node.id}>{node.data.label}</option>)}</select></label></div></div> : null}
              {selectedNode.data.nodeType === 'loop' ? <label className="grid gap-1"><span className="text-xs font-medium text-[var(--theme-foreground)]/50">最多循环轮数</span><input className={cn("rounded-lg border px-3 py-2", theme.field)} max={5} min={1} onChange={event => patchNode({ rounds: Math.min(5, Math.max(1, Number(event.target.value))) })} type="number" value={Number(selectedNode.data.rounds || 3)} /></label> : null}
              <label className="flex items-center gap-2 rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/50 px-3 py-2 text-xs"><input checked={Boolean(selectedNode.data.requiresReview)} onChange={event => patchNode({ requiresReview: event.target.checked })} type="checkbox" />需要用户审查时暂停，确认后再继续</label>
              <div className="grid gap-2 rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/50 p-2">
                <div className="text-xs font-medium opacity-80">节点资源配置（运行时真实注入）</div>
                {([['model', '节点模型', '默认', nodeResources.models], ['skill', 'Skill 技能', '自动', nodeResources.skills.map(row => row.name)], ['plugin', '插件', '自动', nodeResources.plugins.map(row => row.name)], ['knowledge', '知识库', '', nodeResources.knowledge.map(row => row.name)], ['mcp', 'MCP / 工具', '自动', nodeResources.mcp.map(row => row.name)], ['soul', 'Soul 样板', '', nodeResources.souls]] as const).map(([key, label, defaultValue, options]) => <label className="grid gap-1" key={key}><span className="text-xs opacity-85">{label}</span><select className={cn('rounded-lg border px-3 py-2 text-sm outline-none', theme.field)} onChange={event => patchNode({ [key]: event.target.value })} value={String(selectedNode.data[key] ?? defaultValue)}><option value={defaultValue}>{defaultValue || '不绑定'}</option>{options.filter(option => option !== defaultValue).map(option => <option key={option} value={option}>{option}</option>)}</select></label>)}
              </div>
              <Button disabled={running || !selectedWorkflowId} onClick={() => void runWorkflow(selectedNode.id)} size="sm" variant="outline">重跑当前节点</Button>
            </div> : <p className="text-sm font-medium text-[var(--theme-foreground)]/50">点击画布节点后，可在这里配置名称、条件、循环轮数或绑定智能体。</p>}
          </Section>

          <Section title="连线配置">
            {selectedEdge ? <div className="grid gap-2 text-sm">
              <label className="grid gap-1"><span className="text-xs font-medium text-[var(--theme-foreground)]/50">连线说明 / 分支名</span><input className={cn('rounded-lg border px-3 py-2 outline-none', theme.field)} onChange={event => patchEdge({ label: event.target.value })} placeholder="例如：达标、重写、并行汇总" value={typeof selectedEdge.label === 'string' ? selectedEdge.label : ''} /></label>
              <label className="grid gap-1"><span className="text-xs font-medium text-[var(--theme-foreground)]/50">从哪个节点出发</span><select className={cn('rounded-lg border px-3 py-2 outline-none', theme.field)} onChange={event => patchEdge({ source: event.target.value, sourceHandle: 'out' })} value={selectedEdge.source}>{nodes.map(node => <option key={node.id} value={node.id}>{node.data.label}</option>)}</select></label>
              <label className="grid gap-1"><span className="text-xs font-medium text-[var(--theme-foreground)]/50">流向哪个节点</span><select className={cn('rounded-lg border px-3 py-2 outline-none', theme.field)} onChange={event => patchEdge({ target: event.target.value, targetHandle: 'in' })} value={selectedEdge.target}>{nodes.map(node => <option key={node.id} value={node.id}>{node.data.label}</option>)}</select></label>
              <Button onClick={deleteSelectedEdge} size="sm" variant="outline">删除这条边</Button>
            </div> : <p className="text-sm font-medium text-[var(--theme-foreground)]/50">点击画布上的箭头连线后，可以修改流向、分支名或删除。</p>}
          </Section>

          <Section title="智能体设定">
            {selectedAgent ? <AgentForm agent={selectedAgent} onClone={() => void createAgent(selectedAgent).catch(err => notifyError(err, '\u590d\u5236\u667a\u80fd\u4f53\u5931\u8d25'))} onPatch={patchAgent} /> : <p className="text-sm font-medium text-[var(--theme-foreground)]/50">\u8bf7\u9009\u62e9\u4e00\u4e2a\u667a\u80fd\u4f53\u3002</p>}
          </Section>

          <Section title="运行记录">
            {lastRun ? <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between"><Badge>{lastRun.status}</Badge><span className="text-xs font-medium text-[var(--theme-foreground)]/50">{lastRun.cost_estimate?.calls || 0} 次调用 · {lastRun.cost_estimate?.tokens || 0} Token 估算</span></div>
              {lastRun.token_plan ? <div className="rounded-lg border border-[var(--theme-primary)]/20 bg-[var(--theme-primary)]/5 p-2 text-[0.68rem] text-[var(--theme-foreground)]/60"><strong className="text-[var(--theme-primary)]">Token 计划</strong> · {lastRun.token_plan.estimated_calls || 0} 次调用 · {((lastRun.token_plan.estimated_input_tokens || 0) + (lastRun.token_plan.estimated_output_tokens || 0)).toLocaleString()} Token{typeof lastRun.token_plan.estimated_cost_usd === 'number' ? ` · $${lastRun.token_plan.estimated_cost_usd.toFixed(4)}` : ''}{lastRun.token_plan.reusable_nodes?.length ? ` · ${lastRun.token_plan.reusable_nodes.length} 个可复用节点` : ''}</div> : null}
              {Object.entries(lastRun.node_statuses || {}).map(([id, row]) => <div className="rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)] p-2" key={id}><div className="flex items-center justify-between gap-2"><strong className="text-xs">{row.label || id}</strong><span className={cn('text-[0.68rem]', row.status === 'running' && 'animate-pulse text-[var(--theme-primary)]')}>{statusLabel(row.status)}</span></div>{row.branch ? <div className="mt-1 text-[0.68rem] text-[var(--theme-secondary)]">{UI.branch}：{row.branch}{typeof row.score === 'number' ? ` · ${UI.score} ${row.score}/${row.threshold ?? 60}` : ''}</div> : null}<p className="mt-1 line-clamp-5 text-xs leading-relaxed text-[var(--theme-foreground)]/50">{row.summary}</p>{(() => { const node = workflowNodeById.get(id); const needsReview = row.status === 'paused' || node?.data?.nodeType === 'human_review' || Boolean(node?.data?.requiresReview);

 return needsReview ? <div className="mt-2 flex flex-wrap gap-1"><button className="rounded border border-[var(--theme-primary)]/40 px-1.5 py-0.5 text-[0.66rem] text-[var(--theme-primary)]" onClick={() => void markNodeAction(id, 'accept')} type="button">{UI.accept}</button><button className="rounded border border-[var(--dt-destructive)]/40 px-1.5 py-0.5 text-[0.66rem] text-[var(--dt-destructive)]" onClick={() => void markNodeAction(id, 'reject')} type="button">{UI.reject}</button><button className="rounded border border-[var(--dt-border)] px-1.5 py-0.5 text-[0.66rem] text-[var(--theme-foreground)]/60" onClick={() => void markNodeAction(id, 'skip')} type="button">{UI.skip}</button><button className="rounded border border-[var(--theme-primary)]/40 bg-[var(--theme-primary)]/8 px-1.5 py-0.5 text-[0.66rem] text-[var(--theme-primary)]" onClick={() => void runWorkflow(id)} type="button">{UI.rerun}</button></div> : null })()}</div>)}
            </div> : <p className="text-sm font-medium text-[var(--theme-foreground)]/50">运行后这里会展示每个节点的状态、产出摘要和归档路径。</p>}
          </Section>
        </aside> : null}
      </main>
    </div>
  )
}

function AgentForm({ agent, onPatch, onClone }: { agent: WorkflowAgent; onPatch: (patch: Partial<WorkflowAgent>) => void; onClone: () => void }) {
  const patchPermission = (key: keyof WorkflowAgent['permissions'], value: boolean) => onPatch({ permissions: { ...agent.permissions, [key]: value } })

  const toggleConstraint = (value: string) => {
    const next = agent.constraints.includes(value) ? agent.constraints.filter(item => item !== value) : [...agent.constraints, value]
    onPatch({ constraints: next })
  }

  return <div className="grid gap-2 text-sm">
    <div className="flex items-center gap-2"><input className="h-8 w-10 rounded border border-[var(--dt-border)] bg-[var(--theme-card-seed)]" onChange={event => onPatch({ color: event.target.value })} type="color" value={agent.color} /><Button className="border-[var(--dt-border)] bg-[var(--theme-primary)]/8 text-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/15" onClick={onClone} size="sm" variant="outline">复制此智能体</Button></div>
    <label className="grid gap-1"><span className="text-xs font-medium text-[var(--theme-foreground)]/50">名称</span><input className="rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)] px-3 py-2" defaultValue={agent.name} onBlur={event => onPatch({ name: event.target.value, role: event.target.value })} /></label>
    <label className="grid gap-1"><span className="text-xs font-medium text-[var(--theme-foreground)]/50">一句话定位</span><input className="rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)] px-3 py-2" defaultValue={agent.tagline} onBlur={event => onPatch({ tagline: event.target.value })} /></label>
    <label className="grid gap-1"><span className="text-xs font-medium text-[var(--theme-foreground)]/50">这个智能体该干什么</span><textarea className="min-h-20 rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)] px-3 py-2" defaultValue={agent.duties} onBlur={event => onPatch({ duties: event.target.value })} /></label>
    <label className="grid gap-1"><span className="text-xs font-medium text-[var(--theme-foreground)]/50">禁止事项</span><textarea className="min-h-16 rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)] px-3 py-2" defaultValue={agent.forbidden} onBlur={event => onPatch({ forbidden: event.target.value })} /></label>
    <label className="grid gap-1"><span className="text-xs font-medium text-[var(--theme-foreground)]/50">输出样式</span><select className="rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)] px-3 py-2" onChange={event => onPatch({ output_format: event.target.value })} value={agent.output_format}>{['分段说明', '分层大纲', '问题清单', '润色后文本+修改说明', '风险等级+替代方案', '伏笔表', '编辑评语'].map(row => <option key={row}>{row}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-2"><label className="grid gap-1"><span className="text-xs font-medium text-[var(--theme-foreground)]/50">temperature</span><input className="rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)] px-3 py-2" max={2} min={0} onChange={event => onPatch({ temperature: Number(event.target.value) })} step={0.1} type="number" value={agent.temperature} /></label><label className="grid gap-1"><span className="text-xs font-medium text-[var(--theme-foreground)]/50">top_p</span><input className="rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)] px-3 py-2" max={1} min={0} onChange={event => onPatch({ top_p: Number(event.target.value) })} step={0.05} type="number" value={agent.top_p} /></label></div>
    <div className="grid gap-1"><span className="text-xs font-medium text-[var(--theme-foreground)]/50">硬性约束</span><div className="flex flex-wrap gap-1">{CONSTRAINTS.map(row => <button className={cn('rounded-full border px-2 py-1 text-[0.68rem]', agent.constraints.includes(row) ? 'border-[var(--theme-primary)]/40 bg-[var(--theme-primary)]/10 text-[var(--theme-primary)]' : 'border-[var(--dt-border)]')} key={row} onClick={() => toggleConstraint(row)} type="button">{row}</button>)}</div></div>
    <div className="grid grid-cols-2 gap-2 text-xs">{([
      ['canEditDraft', '允许改正文'], ['canComment', '允许批注'], ['canUseKnowledge', '读取知识库'], ['canReadUpstream', '读取上游结果']
    ] as const).map(([key, label]) => <label className="flex items-center gap-2 rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)] px-2 py-2" key={key}><input checked={agent.permissions[key]} onChange={event => patchPermission(key, event.target.checked)} type="checkbox" />{label}</label>)}</div>
  </div>
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="mb-4 rounded-2xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/50 p-3 shadow-sm"><div className="mb-2 flex items-center justify-between gap-2"><h2 className="text-sm font-semibold tracking-wide text-[var(--theme-foreground)]">{title}</h2>{action}</div>{children}</section>
}

export function KarnaAgentsCanvasWorkshopView() {
  return <ReactFlowProvider><WorkflowsCanvas /></ReactFlowProvider>
}


