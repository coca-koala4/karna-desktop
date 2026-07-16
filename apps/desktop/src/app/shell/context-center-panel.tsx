import { useState, useEffect, useCallback } from 'react'
import {
  getContextMemories,
  getContextPins,
  getContextDecisions,
  getContextNodeSummaries,
  getContextStats,
  deleteContextMemory,
  resolveContextMemory,
  confirmContextMemory,
  deleteContextPin,
  toggleContextPin,
  createContextPin,
  deleteContextDecision,
  getContextSnapshot,
  getContextToolOutputs,
  getContextToolOutputContent,
  getContextPromptPreview,
  compactContext,
  getTokenUsage,
  getTokenPolicy,
  setTokenPolicy,
  getCacheStats,
  getReuseRecords,
  getTokenEvents,
  type ContextMemoryItem,
  type PinnedContextItem,
  type DecisionLogItem,
  type NodeSummaryItem,
  type ContextStats,
  type ContextEnvelope,
  type CompressionEvent,
  type ToolOutputItem,
  type PromptPreviewResult,
  type TokenUsageSummary,
  type TokenPolicy,
  type CacheStats,
  type ReuseRecord,
  type TokenEvent,
} from '../../hermes'
import { getCurrentEnvelopeState } from '../writer-ide/lib/use-context-envelope'

interface SnapshotData {
  envelope: ContextEnvelope | null
  summary: any
  counts: { memories: number; pins: number; decisions: number }
  recent_memories: ContextMemoryItem[]
  recent_pins: PinnedContextItem[]
  recent_decisions: DecisionLogItem[]
  recent_compressions: CompressionEvent[]
  recent_nodes: NodeSummaryItem[]
}

type Tab = 'overview' | 'memories' | 'pins' | 'decisions' | 'nodes' | 'tool-outputs' | 'prompt-preview' | 'compression' | 'tokens'

const TYPE_LABELS: Record<string, string> = {
  constraint: 'Constraint',
  preference: 'Preference',
  fact: 'Fact',
  decision: 'Decision',
  file_path: 'File Path',
  code_pattern: 'Code Pattern',
  error_pattern: 'Error Pattern',
  ui_rule: 'UI Rule',
  writing_style: 'Writing Style',
  plot_point: 'Plot Point',
  character: 'Character',
  worldbuilding: 'Worldbuilding',
  context: 'Context',
  task: 'Task',
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-300 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  normal: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  low: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
}

const PROMPT_MODES = [
  'agent_chat',
  'longform_writing',
  'edit_review',
  'research',
  'multi_agent_flow',
  'soul_workshop',
  'codex_dev',
  'academic',
  'technical_writing',
  'translation',
]

const WRITING_DOMAINS = [
  'general',
  'fiction',
  'screenplay',
  'academic',
  'journalism',
  'legal_policy',
  'marketing_brand',
  'translation',
  'technical_writing',
  'poetry',
]

function formatTime(iso: string) {
  try {
    const d = new Date(iso)
    return d.toLocaleString()
  } catch {
    return iso
  }
}

function PriorityBadge({ priority }: { priority: string }) {
  const cls = PRIORITY_COLORS[priority] || PRIORITY_COLORS.normal
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cls}`}>
      {priority}
    </span>
  )
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-700/60 text-zinc-300 border border-zinc-600/40">
      {TYPE_LABELS[type] || type}
    </span>
  )
}

export function ContextCenterPanel({ onClose }: { onClose?: () => void }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState<ContextStats | null>(null)
  const [snapshot, setSnapshot] = useState<SnapshotData | null>(null)
  const [memories, setMemories] = useState<ContextMemoryItem[]>([])
  const [pins, setPins] = useState<PinnedContextItem[]>([])
  const [decisions, setDecisions] = useState<DecisionLogItem[]>([])
  const [nodes, setNodes] = useState<NodeSummaryItem[]>([])
  const [toolOutputs, setToolOutputs] = useState<ToolOutputItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newPinContent, setNewPinContent] = useState('')
  const [newPinPriority, setNewPinPriority] = useState('high')

  const [selectedToolOutput, setSelectedToolOutput] = useState<ToolOutputItem | null>(null)
  const [toolOutputContent, setToolOutputContent] = useState<string | null>(null)
  const [toolOutputLoading, setToolOutputLoading] = useState(false)

  const [promptQuery, setPromptQuery] = useState('')
  const [promptMode, setPromptMode] = useState('agent_chat')
  const [promptWritingDomain, setPromptWritingDomain] = useState('general')
  const [promptPreview, setPromptPreview] = useState<PromptPreviewResult | null>(null)
  const [promptPreviewLoading, setPromptPreviewLoading] = useState(false)
  const [promptPreviewError, setPromptPreviewError] = useState<string | null>(null)

  const [compactLoading, setCompactLoading] = useState(false)
  const [compactResult, setCompactResult] = useState<string | null>(null)

  const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary | null>(null)
  const [tokenPolicy, setTokenPolicyState] = useState<TokenPolicy | null>(null)
  const [cacheStatsData, setCacheStatsData] = useState<CacheStats | null>(null)
  const [reuseRecords, setReuseRecords] = useState<ReuseRecord[]>([])
  const [tokenEvents, setTokenEvents] = useState<TokenEvent[]>([])
  const [tokenSaving, setTokenSaving] = useState(false)
  const [policyMode, setPolicyMode] = useState<'balanced' | 'saving' | 'quality'>('balanced')
  const [hardBudget, setHardBudget] = useState<number | ''>('')
  const [inputPrice, setInputPrice] = useState<number | ''>('')
  const [cachedInputPrice, setCachedInputPrice] = useState<number | ''>('')
  const [outputPrice, setOutputPrice] = useState<number | ''>('')
  const [reasoningPrice, setReasoningPrice] = useState<number | ''>('')
  const [modelSlots, setModelSlots] = useState<Record<string, string>>({})
  const [providerSlots, setProviderSlots] = useState<Record<string, string>>({})

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const activeEnvelope = getCurrentEnvelopeState()
      const scopeId = activeEnvelope.project_id || activeEnvelope.workspace_id
      const activeModule = activeEnvelope.module
      const sessionId = activeEnvelope.session_id
      const [s, m, p, d, n, snap, to, tu, pol, cs, rr, te] = await Promise.all([
        getContextStats().catch(() => null),
        getContextMemories(scopeId, activeModule, undefined, 100, null).catch(() => ({ memories: [], count: 0 })),
        getContextPins(scopeId, activeModule, 100).catch(() => ({ pins: [], count: 0 })),
        getContextDecisions(scopeId, activeModule, 100).catch(() => ({ decisions: [], count: 0 })),
        getContextNodeSummaries(undefined, 50, scopeId, sessionId).catch(() => ({ summaries: [], count: 0 })),
        getContextSnapshot(scopeId, sessionId).catch(() => null),
        getContextToolOutputs(50, scopeId, sessionId).catch(() => ({ outputs: [], count: 0 })),
        getTokenUsage(sessionId, activeEnvelope.project_id).catch(() => null),
        getTokenPolicy(sessionId, activeEnvelope.project_id, scopeId).catch(() => null),
        getCacheStats(sessionId).catch(() => null),
        getReuseRecords(sessionId, 30).catch(() => ({ records: [] })),
        getTokenEvents(sessionId, undefined, 50).catch(() => ({ events: [] })),
      ])
      if (s) setStats(s)
      setMemories(m.memories || [])
      setPins(p.pins || [])
      setDecisions(d.decisions || [])
      setNodes(n.summaries || [])
      if (snap) setSnapshot({ ...(snap as SnapshotData), envelope: activeEnvelope as ContextEnvelope })
      setToolOutputs(to.outputs || [])
      if (tu) setTokenUsage(tu)
      if (pol?.policy) {
        setTokenPolicyState(pol.policy)
        if (pol.policy.mode) setPolicyMode(pol.policy.mode)
        if (pol.policy.total_token_budget) setHardBudget(pol.policy.total_token_budget)
        setInputPrice(pol.policy.input_price_per_million ?? '')
        setCachedInputPrice(pol.policy.cached_input_price_per_million ?? '')
        setOutputPrice(pol.policy.output_price_per_million ?? '')
        setReasoningPrice(pol.policy.reasoning_price_per_million ?? '')
        setModelSlots(pol.policy.model_slots || {})
        setProviderSlots(pol.policy.provider_slots || {})
      }
      if (cs) setCacheStatsData(cs)
      setReuseRecords(rr.records || [])
      setTokenEvents(te.events || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load context data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDeleteMemory = async (id: string) => {
    await deleteContextMemory(id)
    setMemories(prev => prev.filter(m => m.id !== id))
  }

  const handleResolveMemory = async (id: string) => {
    await resolveContextMemory(id)
    setMemories(prev => prev.map(m => m.id === id ? { ...m, status: 'resolved' } : m))
  }

  const handleConfirmMemory = async (id: string) => {
    await confirmContextMemory(id)
    setMemories(prev => prev.map(m => m.id === id ? { ...m, status: 'active' } : m))
  }

  const handleDeletePin = async (id: string) => {
    await deleteContextPin(id)
    setPins(prev => prev.filter(p => p.id !== id))
  }

  const handleTogglePin = async (id: string, active: boolean) => {
    await toggleContextPin(id, !active)
    setPins(prev => prev.map(p => p.id === id ? { ...p, is_active: active ? 0 : 1 } : p))
  }

  const handleAddPin = async () => {
    if (!newPinContent.trim()) return
    const res = await createContextPin(newPinContent.trim(), newPinPriority)
    if (res.ok) {
      setNewPinContent('')
      loadData()
    }
  }

  const handleDeleteDecision = async (id: string) => {
    await deleteContextDecision(id)
    setDecisions(prev => prev.filter(d => d.id !== id))
  }

  const handleViewToolOutput = async (output: ToolOutputItem) => {
    setSelectedToolOutput(output)
    setToolOutputContent(null)
    setToolOutputLoading(true)
    try {
      const res = await getContextToolOutputContent(output.id)
      setToolOutputContent(res.content)
    } catch (e: any) {
      setToolOutputContent(`Error loading content: ${e?.message || 'Unknown error'}`)
    } finally {
      setToolOutputLoading(false)
    }
  }

  const handlePreviewPrompt = async () => {
    if (!promptQuery.trim()) return
    setPromptPreviewLoading(true)
    setPromptPreviewError(null)
    setPromptPreview(null)
    try {
      const res = await getContextPromptPreview(promptQuery.trim(), {
        mode: promptMode,
        writing_domain: promptWritingDomain,
      })
      setPromptPreview(res)
    } catch (e: any) {
      setPromptPreviewError(e?.message || 'Failed to generate preview')
    } finally {
      setPromptPreviewLoading(false)
    }
  }

  const handleRunCompaction = async () => {
    setCompactLoading(true)
    setCompactResult(null)
    try {
      const res = await compactContext([])
      if (res.ok) {
        const before = res.before_tokens || 0
        const after = res.after_tokens || 0
        const ratio = before > 0 ? Math.round((1 - after / before) * 100) : 0
        setCompactResult(`Demo compaction complete! Before: ${before} tokens, After: ${after} tokens (${ratio}% reduction)${res.quality_score ? `, Quality: ${(res.quality_score * 100).toFixed(0)}%` : ''}`)
      } else {
        setCompactResult('Compaction completed (no active messages to compact)')
      }
      loadData()
    } catch (e: any) {
      setCompactResult(`Compaction failed: ${e?.message || 'Unknown error'}`)
    } finally {
      setCompactLoading(false)
    }
  }

  const handleSavePolicy = async () => {
    setTokenSaving(true)
    try {
      const policyPatch: Partial<TokenPolicy> & { mode: string; budget_mode: string } = {
        ...(tokenPolicy || {}),
        mode: policyMode,
        budget_mode: hardBudget ? 'hard' : 'advisory',
      }
      const activeEnvelope = getCurrentEnvelopeState()
      if (activeEnvelope.project_id) {
        policyPatch.scope = 'project'
        policyPatch.scope_id = activeEnvelope.project_id
      } else if (activeEnvelope.session_id) {
        policyPatch.scope = 'session'
        policyPatch.scope_id = activeEnvelope.session_id
      } else {
        policyPatch.scope = 'global'
      }
      if (hardBudget && typeof hardBudget === 'number') {
        policyPatch.total_token_budget = hardBudget
      }
      if ([inputPrice, cachedInputPrice, outputPrice, reasoningPrice].some(value => typeof value === 'number')) {
        if (typeof inputPrice === 'number') policyPatch.input_price_per_million = inputPrice
        if (typeof cachedInputPrice === 'number') policyPatch.cached_input_price_per_million = cachedInputPrice
        if (typeof outputPrice === 'number') policyPatch.output_price_per_million = outputPrice
        if (typeof reasoningPrice === 'number') policyPatch.reasoning_price_per_million = reasoningPrice
        policyPatch.price_source = 'user'
        policyPatch.price_version = 'manual'
      }
      policyPatch.model_routing_policy = 'auto'
      policyPatch.model_slots = Object.fromEntries(Object.entries(modelSlots).filter(([, value]) => value.trim()))
      policyPatch.provider_slots = Object.fromEntries(Object.entries(providerSlots).filter(([, value]) => value.trim()))
      await setTokenPolicy(policyPatch as TokenPolicy)
      loadData()
    } catch (e: any) {
      // ignore
    } finally {
      setTokenSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-zinc-900 text-zinc-100">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
            <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z" />
          </svg>
          <h2 className="text-sm font-semibold tracking-wide">Context Center</h2>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      <div className="flex gap-0.5 px-3 pt-2 border-b border-zinc-800 bg-zinc-900/50 overflow-x-auto">
        {([
          ['overview', 'Overview'],
          ['memories', 'Memory'],
          ['pins', 'Pins'],
          ['decisions', 'Decisions'],
          ['nodes', 'Nodes'],
          ['tool-outputs', 'Tool Outputs'],
          ['prompt-preview', 'Prompt Preview'],
          ['compression', 'Compression'],
          ['tokens', 'Token / Cost'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
              tab === key
                ? 'text-violet-300 border-violet-500'
                : 'text-zinc-500 border-transparent hover:text-zinc-300'
            }`}
          >
            {label}
            {key === 'memories' && stats && <span className="ml-1 text-[10px] text-zinc-500">({stats.context_memory})</span>}
            {key === 'pins' && stats && <span className="ml-1 text-[10px] text-zinc-500">({stats.pinned_context})</span>}
            {key === 'tool-outputs' && stats && <span className="ml-1 text-[10px] text-zinc-500">({stats.tool_output_records})</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="w-5 h-5 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" />
          </div>
        )}

        {error && (
          <div className="p-4 m-3 rounded bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
            {error}
          </div>
        )}

        {!loading && !error && tab === 'overview' && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {[
                ['Memory', (snapshot?.counts.memories ?? stats?.context_memory ?? 0), 'bg-violet-500/10 border-violet-500/20 text-violet-300'],
                ['Pinned', (snapshot?.counts.pins ?? stats?.pinned_context ?? 0), 'bg-orange-500/10 border-orange-500/20 text-orange-300'],
                ['Decisions', (snapshot?.counts.decisions ?? stats?.decision_log ?? 0), 'bg-blue-500/10 border-blue-500/20 text-blue-300'],
                ['Tool Outputs', stats?.tool_output_records ?? 0, 'bg-green-500/10 border-green-500/20 text-green-300'],
                ['Node Runs', stats?.agent_node_run_summaries ?? 0, 'bg-pink-500/10 border-pink-500/20 text-pink-300'],
              ].map(([label, count, cls]) => (
                <div key={label as string} className={`rounded-lg border p-3 ${cls as string}`}>
                  <div className="text-xl font-bold">{count as number}</div>
                  <div className="text-[11px] opacity-70">{label}</div>
                </div>
              ))}
            </div>

            {snapshot?.envelope && (
              <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-3 space-y-2">
                <h3 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Active Context Envelope</h3>
                {snapshot.envelope.writing_domain && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-500">Writing Domain:</span>
                    <span className="text-zinc-300">{snapshot.envelope.writing_domain}</span>
                  </div>
                )}
                {snapshot.envelope.runtime_profile && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-500">Runtime Profile:</span>
                    <span className="text-zinc-300">{snapshot.envelope.runtime_profile}</span>
                  </div>
                )}
                {snapshot.envelope.active_artifact_path && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-500">Active Artifact:</span>
                    <span className="text-zinc-300 font-mono text-[11px] truncate">{snapshot.envelope.active_artifact_path}</span>
                  </div>
                )}
                {snapshot.envelope.module && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-zinc-500">Module:</span>
                    <span className="text-zinc-300">{snapshot.envelope.module}</span>
                  </div>
                )}
              </div>
            )}

            {stats?.by_type && Object.keys(stats.by_type).length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Memory by Type</h3>
                <div className="space-y-1">
                  {Object.entries(stats.by_type)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <div key={type} className="flex items-center gap-2 text-xs">
                        <TypeBadge type={type} />
                        <span className="text-zinc-400">{count}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-3">
              <h3 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">How It Works</h3>
              <ul className="text-[11px] text-zinc-500 space-y-1 leading-relaxed">
                <li>Context OS automatically extracts key facts, constraints, and decisions from your conversation</li>
                <li>Critical constraints are pinned and always included in context</li>
                <li>Long tool outputs are externalized to disk to save context window space</li>
                <li>Multi-agent flows produce structured node summaries for cross-context continuity</li>
                <li>Memories are relevance-ranked before injection, not dumped wholesale</li>
              </ul>
            </div>
          </div>
        )}

        {!loading && !error && tab === 'memories' && (
          <div className="p-3 space-y-2">
            {memories.length === 0 && (
              <div className="text-center text-xs text-zinc-500 py-8">No memories yet. Context OS extracts them automatically.</div>
            )}
            {memories.map(mem => (
              <div key={mem.id} className={`rounded-lg border p-3 ${mem.status === 'resolved' ? 'bg-zinc-800/30 border-zinc-800 opacity-60' : 'bg-zinc-800/50 border-zinc-700/50'}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <TypeBadge type={mem.type} />
                    <PriorityBadge priority={mem.priority} />
                    <span className="text-[10px] text-zinc-500">{mem.scope}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {mem.status === 'candidate' && (
                      <button
                        onClick={() => handleConfirmMemory(mem.id)}
                        className="px-1.5 py-1 rounded bg-violet-500/15 hover:bg-violet-500/25 text-[10px] text-violet-300 transition-colors"
                        title="Confirm this inferred memory"
                      >
                        Confirm
                      </button>
                    )}
                    {mem.status !== 'resolved' && (
                      <button
                        onClick={() => handleResolveMemory(mem.id)}
                        className="p-1 rounded hover:bg-green-500/20 text-green-400/70 hover:text-green-300 transition-colors"
                        title="Mark resolved"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteMemory(mem.id)}
                      className="p-1 rounded hover:bg-red-500/20 text-red-400/70 hover:text-red-300 transition-colors"
                      title="Delete"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                </div>
                <p className={`text-xs leading-relaxed ${mem.status === 'resolved' ? 'line-through text-zinc-600' : 'text-zinc-300'}`}>
                  {mem.content}
                </p>
                <div className="text-[10px] text-zinc-600 mt-1.5">{formatTime(mem.created_at)}</div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && tab === 'pins' && (
          <div className="p-3 space-y-3">
            <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-3 space-y-2">
              <h3 className="text-xs font-semibold text-zinc-400">Pin New Constraint</h3>
              <textarea
                value={newPinContent}
                onChange={e => setNewPinContent(e.target.value)}
                placeholder="Enter a rule, constraint, or fact to always keep in context..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:border-violet-500/50"
                rows={2}
              />
              <div className="flex items-center gap-2">
                <select
                  value={newPinPriority}
                  onChange={e => setNewPinPriority(e.target.value)}
                  className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                >
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
                <button
                  onClick={handleAddPin}
                  disabled={!newPinContent.trim()}
                  className="px-3 py-1 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
                >
                  Pin It
                </button>
              </div>
            </div>

            {pins.length === 0 && (
              <div className="text-center text-xs text-zinc-500 py-6">No pinned contexts yet.</div>
            )}
            {pins.map(pin => (
              <div key={pin.id} className={`rounded-lg border p-3 ${pin.is_active ? 'bg-orange-500/5 border-orange-500/20' : 'bg-zinc-800/30 border-zinc-800 opacity-50'}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5">
                    <PriorityBadge priority={pin.priority} />
                    <span className="text-[10px] text-zinc-500">{pin.scope}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => handleTogglePin(pin.id, !!pin.is_active)}
                      className={`p-1 rounded transition-colors ${pin.is_active ? 'hover:bg-zinc-700 text-zinc-400' : 'hover:bg-green-500/20 text-green-400/70'}`}
                      title={pin.is_active ? 'Unpin' : 'Repin'}
                    >
                      {pin.is_active ? (
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14"/></svg>
                      ) : (
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                      )}
                    </button>
                    <button
                      onClick={() => handleDeletePin(pin.id)}
                      className="p-1 rounded hover:bg-red-500/20 text-red-400/70 hover:text-red-300 transition-colors"
                      title="Delete"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                </div>
                <p className="text-xs leading-relaxed text-zinc-300">{pin.content}</p>
                <div className="text-[10px] text-zinc-600 mt-1.5">{formatTime(pin.created_at)}</div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && tab === 'decisions' && (
          <div className="p-3 space-y-2">
            {decisions.length === 0 && (
              <div className="text-center text-xs text-zinc-500 py-8">No decisions logged yet.</div>
            )}
            {decisions.map(dec => (
              <div key={dec.id} className="rounded-lg border bg-zinc-800/50 border-zinc-700/50 p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5">
                    <TypeBadge type="decision" />
                  </div>
                  <button
                    onClick={() => handleDeleteDecision(dec.id)}
                    className="p-1 rounded hover:bg-red-500/20 text-red-400/70 hover:text-red-300 transition-colors"
                    title="Delete"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                  </button>
                </div>
                <p className="text-xs font-medium text-zinc-200 leading-relaxed">{dec.decision}</p>
                {dec.reason && (
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed italic">Reason: {dec.reason}</p>
                )}
                <div className="text-[10px] text-zinc-600 mt-1.5">{formatTime(dec.created_at)}</div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && tab === 'nodes' && (
          <div className="p-3 space-y-2">
            {nodes.length === 0 && (
              <div className="text-center text-xs text-zinc-500 py-8">No multi-agent node runs yet. Run a multi-agent flow to see summaries here.</div>
            )}
            {nodes.map(node => (
              <div key={node.id} className="rounded-lg border bg-zinc-800/50 border-zinc-700/50 p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-500/20 text-pink-300 border border-pink-500/30">
                      {node.node_id}
                    </span>
                    {node.agent_id && (
                      <span className="text-[10px] text-zinc-500">{node.agent_id}</span>
                    )}
                  </div>
                  {node.token_usage > 0 && (
                    <span className="text-[10px] text-zinc-500">~{node.token_usage} tok</span>
                  )}
                </div>
                {node.task && <p className="text-xs text-zinc-300 font-medium">{node.task}</p>}
                {node.output_summary && (
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{node.output_summary}</p>
                )}
                {node.key_findings && node.key_findings.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {node.key_findings.slice(0, 3).map((f, i) => (
                      <p key={i} className="text-[11px] text-zinc-500 pl-3 relative">
                        <span className="absolute left-0 text-zinc-600">-</span>
                        {f}
                      </p>
                    ))}
                  </div>
                )}
                {node.errors && node.errors.length > 0 && (
                  <div className="mt-1.5">
                    {node.errors.map((e, i) => (
                      <p key={i} className="text-[11px] text-red-400/80">{e}</p>
                    ))}
                  </div>
                )}
                <div className="text-[10px] text-zinc-600 mt-1.5">{formatTime(node.created_at)}</div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && tab === 'tool-outputs' && (
          <div className="p-3 space-y-2">
            {toolOutputs.length === 0 && (
              <div className="text-center text-xs text-zinc-500 py-8">No tool outputs stored yet.</div>
            )}
            {toolOutputs.map(output => (
              <div key={output.id} className="rounded-lg border bg-zinc-800/50 border-zinc-700/50 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-300 border border-green-500/30">
                        {output.tool_name}
                      </span>
                      <span className="text-[10px] text-zinc-500">{output.char_count.toLocaleString()} chars</span>
                    </div>
                    <div className="text-[10px] text-zinc-600">{formatTime(output.created_at)}</div>
                  </div>
                  <button
                    onClick={() => handleViewToolOutput(output)}
                    className="px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-[11px] font-medium transition-colors shrink-0"
                  >
                    View Content
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && tab === 'prompt-preview' && (
          <div className="p-3 space-y-3">
            <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-3 space-y-3">
              <h3 className="text-xs font-semibold text-zinc-400">Context Preview Configuration</h3>
              <textarea
                value={promptQuery}
                onChange={e => setPromptQuery(e.target.value)}
                placeholder="Enter your query or user message to preview the assembled context..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none focus:border-violet-500/50"
                rows={4}
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-1">Mode</label>
                  <select
                    value={promptMode}
                    onChange={e => setPromptMode(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                  >
                    {PROMPT_MODES.map(mode => (
                      <option key={mode} value={mode}>{mode.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-1">Writing Domain</label>
                  <select
                    value={promptWritingDomain}
                    onChange={e => setPromptWritingDomain(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                  >
                    {WRITING_DOMAINS.map(domain => (
                      <option key={domain} value={domain}>{domain.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <div className="mb-1 text-[10px] text-zinc-500">Optional BYOK price override ($ / 1M tokens)</div>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    ['Input', inputPrice, setInputPrice],
                    ['Cached input', cachedInputPrice, setCachedInputPrice],
                    ['Output', outputPrice, setOutputPrice],
                    ['Reasoning', reasoningPrice, setReasoningPrice],
                  ].map(([label, value, setter]) => (
                    <label className="text-[10px] text-zinc-500" key={String(label)}>
                      {String(label)}
                      <input
                        className="mt-1 w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
                        min="0"
                        onChange={event => (setter as typeof setInputPrice)(event.target.value ? Number(event.target.value) : '')}
                        placeholder="unknown"
                        step="0.01"
                        type="number"
                        value={value as number | ''}
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="rounded border border-zinc-700/60 bg-zinc-900/40 p-2 space-y-2">
                <div className="text-[10px] font-medium text-zinc-400">BYOK price override (USD / 1M tokens)</div>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['Input', inputPrice, setInputPrice],
                    ['Cached input', cachedInputPrice, setCachedInputPrice],
                    ['Output', outputPrice, setOutputPrice],
                    ['Reasoning', reasoningPrice, setReasoningPrice],
                  ] as const).map(([label, value, setter]) => (
                    <label className="text-[10px] text-zinc-500" key={label}>
                      {label}
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={value}
                        onChange={event => setter(event.target.value ? Number(event.target.value) : '')}
                        placeholder="unknown"
                        className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none"
                      />
                    </label>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-600">Leave blank for token-only accounting when Karna has no verified price.</p>
              </div>
              <div className="rounded border border-zinc-700/60 bg-zinc-900/40 p-2 space-y-2">
                <div className="text-[10px] font-medium text-zinc-400">Workflow model routing (optional)</div>
                <div className="grid grid-cols-[80px_1fr_1fr] gap-1 text-[10px] text-zinc-600">
                  <span>Node slot</span><span>Provider</span><span>Model</span>
                </div>
                {['lightweight', 'research', 'critic', 'final', 'default'].map(slot => (
                  <div className="grid grid-cols-[80px_1fr_1fr] gap-1 items-center" key={slot}>
                    <span className="text-[10px] text-zinc-500 capitalize">{slot}</span>
                    <input
                      value={providerSlots[slot] || ''}
                      onChange={event => setProviderSlots(current => ({ ...current, [slot]: event.target.value }))}
                      placeholder="inherit"
                      className="min-w-0 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-200 placeholder-zinc-700 focus:outline-none"
                    />
                    <input
                      value={modelSlots[slot] || ''}
                      onChange={event => setModelSlots(current => ({ ...current, [slot]: event.target.value }))}
                      placeholder="inherit"
                      className="min-w-0 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-[10px] text-zinc-200 placeholder-zinc-700 focus:outline-none"
                    />
                  </div>
                ))}
                <p className="text-[10px] text-zinc-600">Cheap models can handle lightweight nodes; final and critic slots can retain stronger models.</p>
              </div>
              <button
                onClick={handlePreviewPrompt}
                disabled={!promptQuery.trim() || promptPreviewLoading}
                className="w-full px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
              >
                {promptPreviewLoading ? 'Generating Preview...' : 'Preview Context'}
              </button>
            </div>

            {promptPreviewError && (
              <div className="p-3 rounded bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
                {promptPreviewError}
              </div>
            )}

            {promptPreview && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-2">
                  <div className="rounded-lg border bg-violet-500/10 border-violet-500/20 p-2 text-center">
                    <div className="text-lg font-bold text-violet-300">{promptPreview.estimated_tokens.toLocaleString()}</div>
                    <div className="text-[10px] text-zinc-500">Est. Tokens</div>
                  </div>
                  <div className="rounded-lg border bg-blue-500/10 border-blue-500/20 p-2 text-center">
                    <div className="text-lg font-bold text-blue-300">{promptPreview.memory_count}</div>
                    <div className="text-[10px] text-zinc-500">Memories</div>
                  </div>
                  <div className="rounded-lg border bg-orange-500/10 border-orange-500/20 p-2 text-center">
                    <div className="text-lg font-bold text-orange-300">{promptPreview.pin_count}</div>
                    <div className="text-[10px] text-zinc-500">Pins</div>
                  </div>
                  <div className="rounded-lg border bg-green-500/10 border-green-500/20 p-2 text-center">
                    <div className="text-lg font-bold text-green-300">{promptPreview.decision_count}</div>
                    <div className="text-[10px] text-zinc-500">Decisions</div>
                  </div>
                </div>

                <div className="rounded-lg border bg-zinc-800/50 border-zinc-700/50">
                  <div className="px-3 py-2 border-b border-zinc-700/50">
                    <h3 className="text-xs font-semibold text-zinc-400">Assembled Context Text</h3>
                  </div>
                  <pre className="p-3 text-[11px] text-zinc-300 whitespace-pre-wrap overflow-auto max-h-96 font-mono leading-relaxed">
                    {promptPreview.context_text}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && !error && tab === 'compression' && (
          <div className="p-3 space-y-3">
            <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-3 space-y-2">
              <h3 className="text-xs font-semibold text-zinc-400">Manual Compaction</h3>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Run a context compaction to summarize older messages and free up context window space. This is a demo/test action and will not modify your active conversation.
              </p>
              <button
                onClick={handleRunCompaction}
                disabled={compactLoading}
                className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-medium transition-colors"
              >
                {compactLoading ? 'Running Compaction...' : 'Run Manual Compaction'}
              </button>
              {compactResult && (
                <p className="text-[11px] text-cyan-300 mt-2">{compactResult}</p>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Recent Compression Events</h3>
              {(!snapshot?.recent_compressions || snapshot.recent_compressions.length === 0) ? (
                <div className="text-center text-xs text-zinc-500 py-6">No compression events recorded yet.</div>
              ) : (
                <div className="space-y-2">
                  {snapshot.recent_compressions.map(event => (
                    <div key={event.id} className={`rounded-lg border p-3 ${event.aborted ? 'bg-red-500/5 border-red-500/20' : 'bg-zinc-800/50 border-zinc-700/50'}`}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {event.profile_name && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                              {event.profile_name}
                            </span>
                          )}
                          {event.aborted && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-500/20 text-red-300 border border-red-500/30">
                              Aborted
                            </span>
                          )}
                          {typeof event.quality_score === 'number' && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-zinc-700/60 text-zinc-300 border border-zinc-600/40">
                              Q: {(event.quality_score * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-zinc-500">Before: <span className="text-zinc-300">{event.before_tokens.toLocaleString()} tok</span></span>
                        <span className="text-zinc-500">After: <span className="text-zinc-300">{event.after_tokens.toLocaleString()} tok</span></span>
                        <span className="text-zinc-500">
                          Saved: <span className="text-green-300">
                            {event.before_tokens > 0 ? `${Math.round((1 - event.after_tokens / event.before_tokens) * 100)}%` : '-'}
                          </span>
                        </span>
                      </div>
                      <div className="text-[10px] text-zinc-600 mt-1.5">{formatTime(event.created_at)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && !error && tab === 'tokens' && (
          <div className="p-3 space-y-4">
            <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-3 space-y-2">
              <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Token Policy</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-1">Mode</label>
                  <select
                    value={policyMode}
                    onChange={e => setPolicyMode(e.target.value as any)}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none"
                  >
                    <option value="balanced">Balanced (Default)</option>
                    <option value="saving">Aggressive Saving</option>
                    <option value="quality">Quality First</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-1">Hard Token Budget (blank=advisory)</label>
                  <input
                    type="number"
                    value={hardBudget}
                    onChange={e => setHardBudget(e.target.value ? Number(e.target.value) : '')}
                    placeholder="e.g. 100000"
                    className="w-full bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none"
                  />
                </div>
              </div>
              <button
                onClick={handleSavePolicy}
                disabled={tokenSaving}
                className="w-full px-3 py-1.5 rounded bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-xs font-medium transition-colors"
              >
                {tokenSaving ? 'Saving...' : 'Save Policy'}
              </button>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                Balanced mode protects requested output length while reducing repeated context. Hard budget pauses execution before a call would exceed the set limit. Final output is never auto-truncated.
              </p>
            </div>

            {tokenEvents.some(event => event.event_type === 'token.warning' || event.event_type === 'token.budget.blocked') && (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-300">Budget Events</h3>
                <div className="mt-2 space-y-2">
                  {tokenEvents
                    .filter(event => event.event_type === 'token.warning' || event.event_type === 'token.budget.blocked')
                    .slice(0, 8)
                    .map(event => (
                      <div className="rounded border border-zinc-700/60 bg-zinc-900/60 p-2 text-[11px]" key={event.id}>
                        <div className="flex justify-between gap-2">
                          <strong className={event.event_type === 'token.budget.blocked' ? 'text-red-300' : 'text-amber-300'}>{event.event_type}</strong>
                          <span className="text-zinc-600">{formatTime(event.created_at)}</span>
                        </div>
                        <p className="mt-1 text-zinc-400">{String(event.payload.reason || event.payload.message || 'Token budget notification')}</p>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {tokenUsage && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border bg-violet-500/10 border-violet-500/20 p-3">
                    <div className="text-lg font-bold text-violet-300">{tokenUsage.calls}</div>
                    <div className="text-[10px] text-zinc-500">Model Calls</div>
                  </div>
                  <div className="rounded-lg border bg-cyan-500/10 border-cyan-500/20 p-3">
                    <div className="text-lg font-bold text-cyan-300">{(tokenUsage.input_tokens / 1000).toFixed(1)}k</div>
                    <div className="text-[10px] text-zinc-500">Input Tokens</div>
                  </div>
                  <div className="rounded-lg border bg-green-500/10 border-green-500/20 p-3">
                    <div className="text-lg font-bold text-green-300">{(tokenUsage.cached_input_tokens / 1000).toFixed(1)}k</div>
                    <div className="text-[10px] text-zinc-500">Cached Input (Saved)</div>
                  </div>
                  <div className="rounded-lg border bg-orange-500/10 border-orange-500/20 p-3">
                    <div className="text-lg font-bold text-orange-300">{(tokenUsage.output_tokens / 1000).toFixed(1)}k</div>
                    <div className="text-[10px] text-zinc-500">Output Tokens</div>
                  </div>
                  <div className="rounded-lg border bg-blue-500/10 border-blue-500/20 p-3">
                    <div className="text-lg font-bold text-blue-300">{(tokenUsage.total_tokens / 1000).toFixed(1)}k</div>
                    <div className="text-[10px] text-zinc-500">Total Tokens</div>
                  </div>
                  <div className="rounded-lg border bg-yellow-500/10 border-yellow-500/20 p-3">
                    <div className="text-lg font-bold text-yellow-300">
                      {tokenUsage.estimated_cost_usd > 0 ? `$${tokenUsage.estimated_cost_usd.toFixed(4)}` : 'N/A'}
                    </div>
                    <div className="text-[10px] text-zinc-500">Est. Cost (USD)</div>
                  </div>
                </div>

                <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-3 space-y-2">
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Context Breakdown (Input)</h3>
                  {Object.entries(tokenUsage.breakdown || {}).length > 0 ? (
                    <div className="space-y-1.5">
                      {(() => {
                        const bd = tokenUsage.breakdown
                        const total = tokenUsage.input_tokens - tokenUsage.cached_input_tokens
                        const items = [
                          ['System Prompt', bd.system_prompt || 0, 'bg-blue-500/20'],
                          ['Tool Schemas', bd.tool_schema || 0, 'bg-purple-500/20'],
                          ['Memory & Pins', bd.memory || 0, 'bg-orange-500/20'],
                          ['RAG / Retrieval', bd.rag || 0, 'bg-pink-500/20'],
                          ['Artifact / Selection', bd.artifact || 0, 'bg-cyan-500/20'],
                          ['Upstream / Nodes', bd.upstream || 0, 'bg-green-500/20'],
                        ]
                        return items.map(([label, val, cls]) => {
                          const pct = total > 0 ? Math.round((val as number) / total * 100) : 0
                          return (
                            <div key={label as string} className="flex items-center gap-2 text-xs">
                              <span className="text-zinc-400 w-32 shrink-0">{label}</span>
                              <div className="flex-1 h-4 bg-zinc-900 rounded overflow-hidden">
                                <div className={`h-full ${cls as string}`} style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-zinc-500 w-16 text-right font-mono text-[10px]">{(val as number).toLocaleString()}t</span>
                              <span className="text-zinc-500 w-10 text-right text-[10px]">{pct}%</span>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  ) : (
                    <p className="text-[11px] text-zinc-500">No breakdown data yet. Make a model call to see input composition.</p>
                  )}
                </div>

                <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-3 space-y-2">
                  <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Savings</h3>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center p-2 rounded bg-green-500/10 border border-green-500/20">
                      <div className="text-sm font-bold text-green-300">{(tokenUsage.savings.cache_hit_tokens / 1000).toFixed(1)}k</div>
                      <div className="text-[10px] text-zinc-500">Cache Hits</div>
                    </div>
                    <div className="text-center p-2 rounded bg-cyan-500/10 border border-cyan-500/20">
                      <div className="text-sm font-bold text-cyan-300">{(tokenUsage.savings.reuse_tokens / 1000).toFixed(1)}k</div>
                      <div className="text-[10px] text-zinc-500">Result Reuse</div>
                    </div>
                    <div className="text-center p-2 rounded bg-violet-500/10 border border-violet-500/20">
                      <div className="text-sm font-bold text-violet-300">{(tokenUsage.savings.externalized_tokens_estimate / 1000).toFixed(1)}k</div>
                      <div className="text-[10px] text-zinc-500">Externalized Outputs</div>
                    </div>
                  </div>
                </div>

                {cacheStatsData && cacheStatsData.total_calls > 0 && (
                  <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-3 space-y-2">
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Prompt Cache</h3>
                    <div className="flex items-center gap-4 text-xs">
                      <span className="text-zinc-500">Hit Rate: <span className="text-green-300 font-bold">{(cacheStatsData.hit_rate * 100).toFixed(1)}%</span></span>
                      <span className="text-zinc-500">Saved: <span className="text-green-300">{(cacheStatsData.cached_tokens_read / 1000).toFixed(1)}k t</span></span>
                    </div>
                    <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400" style={{ width: `${Math.min(cacheStatsData.hit_rate * 100, 100)}%` }} />
                    </div>
                  </div>
                )}

                {Object.keys(tokenUsage.by_model || {}).length > 0 && (
                  <div className="rounded-lg bg-zinc-800/50 border border-zinc-700/50 p-3 space-y-2">
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Usage by Model</h3>
                    <div className="space-y-1">
                      {Object.entries(tokenUsage.by_model).map(([model, data]) => (
                        <div key={model} className="flex items-center gap-2 text-xs">
                          <span className="font-mono text-[10px] text-zinc-400 w-32 truncate">{model}</span>
                          <span className="text-zinc-500">{data.calls} calls</span>
                          <span className="text-cyan-400">in:{(data.input / 1000).toFixed(1)}k</span>
                          <span className="text-orange-400">out:{(data.output / 1000).toFixed(1)}k</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {!tokenUsage && (
              <div className="text-center text-xs text-zinc-500 py-8">
                No token usage recorded for this session yet. Start a conversation to see real-time usage stats.
              </div>
            )}
          </div>
        )}
      </div>

      {selectedToolOutput && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setSelectedToolOutput(null)}>
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-lg w-full max-w-3xl max-h-[80vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-500/20 text-green-300 border border-green-500/30">
                  {selectedToolOutput.tool_name}
                </span>
                <span className="text-[10px] text-zinc-500">{selectedToolOutput.char_count.toLocaleString()} chars</span>
              </div>
              <button
                onClick={() => setSelectedToolOutput(null)}
                className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {toolOutputLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="w-5 h-5 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" />
                </div>
              ) : (
                <pre className="text-[11px] text-zinc-300 whitespace-pre-wrap font-mono leading-relaxed">
                  {toolOutputContent || 'No content'}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
