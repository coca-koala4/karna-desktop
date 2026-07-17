import { useState, useEffect } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

import { useAgentFlow } from './store'

type RunPanelTab = 'input' | 'output' | 'nodes' | 'prompt' | 'context' | 'tools' | 'logs' | 'errors' | 'cost'

interface FlowRunPanelProps {
  onClose: () => void
}

const TABS: Array<{ key: RunPanelTab; label: string; icon: string }> = [
  { key: 'input', label: '输入', icon: 'arrow-down' },
  { key: 'output', label: '总输出', icon: 'arrow-up' },
  { key: 'nodes', label: '节点', icon: 'list-tree' },
  { key: 'prompt', label: 'Prompt', icon: 'note' },
  { key: 'context', label: '上下文', icon: 'layers' },
  { key: 'tools', label: '工具', icon: 'tools' },
  { key: 'logs', label: '日志', icon: 'output' },
  { key: 'errors', label: '错误', icon: 'warning' },
  { key: 'cost', label: '成本', icon: 'dashboard' }
]

const INPUT_MODES = [
  { key: 'manual', label: '手动输入', icon: 'edit' },
  { key: 'current_file', label: '当前文件', icon: 'file' },
  { key: 'selection', label: '当前选区', icon: 'selection' },
  { key: 'project_context', label: '项目上下文', icon: 'folder' }
]

const statusLabel = (status: string) => {
  const labels: Record<string, string> = {
    idle: '未运行', queued: '排队中', running: '运行中', success: '已完成',
    done: '已完成', failed: '失败', skipped: '已跳过', waiting_human: '待确认',
    paused: '待确认', blocked: '已阻塞', accepted: '已接受', rejected: '已驳回',
    cached: '缓存命中', pending: '等待中', cancelled: '已取消'
  }
  return labels[status] || status
}

const statusBadgeClass = (status: string) => {
  if (status === 'success' || status === 'done' || status === 'accepted') return 'bg-emerald-500 text-white dark:bg-emerald-600'
  if (status === 'running' || status === 'queued') return 'animate-pulse bg-violet-500 text-white dark:bg-violet-600'
  if (status === 'paused' || status === 'waiting_human') return 'bg-amber-400 text-white dark:bg-amber-500'
  if (status === 'failed' || status === 'blocked' || status === 'rejected') return 'bg-red-500 text-white dark:bg-red-600'
  if (status === 'skipped' || status === 'cached') return 'bg-slate-400 text-white dark:bg-slate-500'
  return 'bg-slate-400 text-white dark:bg-slate-500'
}

const logLevelConfig = {
  info: { color: 'text-slate-600 dark:text-slate-400', icon: 'info', label: 'INFO' },
  warn: { color: 'text-amber-600 dark:text-amber-400', icon: 'warning', label: 'WARN' },
  error: { color: 'text-red-600 dark:text-red-400', icon: 'error', label: 'ERROR' }
}

export function FlowRunPanel({ onClose }: FlowRunPanelProps) {
  const { running, lastRun } = useAgentFlow()
  const [activeTab, setActiveTab] = useState<RunPanelTab>('input')

  useEffect(() => {
    if (running && activeTab !== 'logs') {
      setActiveTab('logs')
    }
  }, [running])

  useEffect(() => {
    if (lastRun?.status === 'success' && activeTab === 'logs') {
      setActiveTab('output')
    }
  }, [lastRun?.status])

  return (
    <div className="relative z-10 flex h-96 shrink-0 flex-col border-t border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/60">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent dark:via-violet-500/50" />

      <div className="flex items-center justify-between border-b border-slate-200/70 px-2 dark:border-white/10">
        <div className="flex items-center overflow-x-auto scrollbar-hide">
          {TABS.map(tab => (
            <button
              className={cn(
                'relative flex items-center gap-1.5 whitespace-nowrap px-3 py-3 text-xs font-medium transition-all',
                activeTab === tab.key
                  ? 'text-violet-700 dark:text-violet-200'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
              )}
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
            >
              <Codicon name={tab.icon} size={13} />
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-gradient-to-r from-violet-500 to-cyan-500" />
              )}
            </button>
          ))}
        </div>

        <button
          className="rounded-lg p-2 text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200 shrink-0"
          onClick={onClose}
          title="关闭"
        >
          <Codicon name="close" size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'input' && <InputTab />}
        {activeTab === 'output' && <OutputTab />}
        {activeTab === 'nodes' && <NodesTab />}
        {activeTab === 'prompt' && <PromptTab />}
        {activeTab === 'context' && <ContextTab />}
        {activeTab === 'tools' && <ToolsTab />}
        {activeTab === 'logs' && <LogsTab />}
        {activeTab === 'errors' && <ErrorsTab />}
        {activeTab === 'cost' && <CostTab />}
      </div>

      <HumanReviewDialog />
    </div>
  )
}

function InputTab() {
  const { inputText, setInputText, runWorkflow, stopWorkflow, running, validation, inputMode, setInputMode } = useAgentFlow()

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400 shrink-0">输入来源：</span>
        <div className="flex gap-1.5 flex-wrap">
          {INPUT_MODES.map(mode => (
            <button
              className={cn(
                'flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all',
                inputMode === mode.key
                  ? 'border-violet-500/50 bg-violet-500/20 text-violet-700 shadow-sm dark:text-violet-200'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-800 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:border-white/20 dark:hover:text-slate-200 dark:hover:bg-white/5'
              )}
              key={mode.key}
              onClick={() => setInputMode(mode.key as any)}
            >
              <Codicon name={mode.icon} size={12} />
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        className="flex-1 min-h-[120px] w-full resize-none rounded-xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-violet-500/50 focus:bg-white focus:shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:bg-white/10"
        onChange={e => setInputText(e.target.value)}
        placeholder="把本次写作需求、章节正文或卡文点放在这里..."
        value={inputText}
      />

      {validation.errors.length > 0 || validation.warnings.length > 0 ? (
        <div className={cn(
          'rounded-xl border p-2.5',
          validation.errors.length > 0
            ? 'border-red-500/30 bg-red-500/10'
            : 'border-amber-500/30 bg-amber-500/10'
        )}>
          <div className="flex items-start gap-2">
            <Codicon className={cn('mt-0.5', validation.errors.length > 0 ? 'text-red-500 dark:text-red-400' : 'text-amber-500 dark:text-amber-400')} name="warning" size={14} />
            <div className="text-xs space-y-1">
              {validation.errors.map((err, i) => (
                <div key={i} className="text-red-700 dark:text-red-300">{err.userMessage}</div>
              ))}
              {validation.warnings.map((warn, i) => (
                <div key={i} className="text-amber-700 dark:text-amber-300">{warn.userMessage}</div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <Codicon name="check" size={12} />
          校验通过，可以开始运行
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
          disabled
          title="暂未开放"
        >
          <Codicon name="attach" size={12} />
          附加文件
        </button>
        <div className="flex items-center gap-2">
          {running && (
            <button
              className="flex items-center gap-1.5 rounded-lg bg-red-500 px-4 py-2 text-xs font-semibold text-white transition-all hover:bg-red-600 shadow-sm"
              onClick={() => void stopWorkflow()}
            >
              <Codicon name="debug-stop" size={12} />
              停止
            </button>
          )}
          <button
            className={cn(
              'group relative flex items-center gap-1.5 rounded-lg px-5 py-2 text-xs font-semibold text-white transition-all',
              running
                ? 'cursor-not-allowed bg-slate-400 opacity-60 dark:bg-slate-600'
                : 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-md shadow-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/30 hover:scale-[1.02] active:scale-[0.98]'
            )}
            disabled={running}
            onClick={() => void runWorkflow()}
          >
            <Codicon className={cn(running && 'animate-spin')} name={running ? 'loading' : 'play'} size={12} />
            <span>{running ? '运行中...' : '开始运行'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

function OutputTab() {
  const { lastRun, runWorkflow, running } = useAgentFlow()

  const outputSummaries = lastRun?.node_statuses
    ? Object.entries(lastRun.node_statuses)
        .filter(([, row]) => row.summary)
        .map(([id, row]) => ({ id, ...row }))
    : []

  const finalOutput = lastRun?.finalOutput || outputSummaries.find(s => s.label?.includes('输出') || s.label?.includes('归档'))?.summary || outputSummaries[outputSummaries.length - 1]?.summary

  const copyOutput = () => {
    if (finalOutput) {
      navigator.clipboard.writeText(finalOutput).catch(() => {})
    }
  }

  if (!lastRun) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-slate-500">
        <Codicon className="mb-3 opacity-40" name="inbox" size={36} />
        <div className="text-sm">运行后会在这里显示最终输出结果</div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={cn('flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.65rem] font-medium', statusBadgeClass(lastRun.status))}>
            {lastRun.status === 'running' && <span className="size-1.5 animate-ping rounded-full bg-white" />}
            {statusLabel(lastRun.status)}
          </span>
          {lastRun.cost_estimate && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {lastRun.cost_estimate.tokens || 0} tokens · {lastRun.cost_estimate.calls || 0} 次调用
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition-all hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
            onClick={copyOutput}
            title="复制"
          >
            <Codicon name="copy" size={12} />
            复制
          </button>
          <button
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
            disabled
            title="导出（暂未开放）"
          >
            <Codicon name="save" size={12} />
            导出
          </button>
          <button
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 transition-all hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
            disabled={running}
            onClick={() => void runWorkflow()}
            title="重新运行"
          >
            <Codicon name="refresh" size={12} />
            重跑
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-slate-200/70 bg-gradient-to-br from-slate-50/80 to-transparent p-4 dark:border-white/10 dark:from-white/5">
        {finalOutput ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800 dark:text-slate-200">
            {finalOutput}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            {lastRun.status === 'running' ? (
              <div className="flex items-center gap-2">
                <Codicon className="animate-pulse text-violet-500" name="zap" size={16} />
                正在生成输出...
              </div>
            ) : '暂无最终输出'}
          </div>
        )}
      </div>
    </div>
  )
}

function NodesTab() {
  const { nodes, lastRun, focusNode, runWorkflow, running } = useAgentFlow()
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  return (
    <div className="h-full flex gap-3">
      <div className="w-48 shrink-0 space-y-1 overflow-auto">
        {nodes.map(node => {
          const nodeStatus = lastRun?.node_statuses?.[node.id]
          const isExpanded = expandedNodes.has(node.id)
          const isSelected = selectedNodeId === node.id
          const hasFailed = nodeStatus?.status === 'failed' || nodeStatus?.status === 'blocked'

          return (
            <div key={node.id}>
              <div
                className={cn(
                  'flex items-center gap-1.5 cursor-pointer rounded-lg border px-2.5 py-2 text-xs transition-all',
                  isSelected
                    ? 'border-violet-500/50 bg-violet-500/15'
                    : 'border-slate-200 bg-white/60 hover:border-slate-300 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20 dark:hover:bg-white/10'
                )}
                onClick={() => {
                  setSelectedNodeId(node.id)
                  focusNode(node.id)
                }}
              >
                <button
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  onClick={(e) => { e.stopPropagation(); toggleExpand(node.id) }}
                >
                  <Codicon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={12} />
                </button>
                <span className={cn(
                  'shrink-0',
                  nodeStatus?.status === 'running' && 'animate-spin text-violet-500',
                  nodeStatus?.status === 'success' && 'text-emerald-500',
                  nodeStatus?.status === 'failed' && 'text-red-500',
                  nodeStatus?.status === 'waiting_human' && 'text-amber-500'
                )}>
                  {nodeStatus ? (
                    <Codicon name={
                      nodeStatus.status === 'running' ? 'loading' :
                      nodeStatus.status === 'success' || nodeStatus.status === 'done' ? 'pass' :
                      nodeStatus.status === 'failed' ? 'error' :
                      nodeStatus.status === 'waiting_human' ? 'debug-pause' : 'circle-outline'
                    } size={12} />
                  ) : (
                    <span className="size-2 rounded-full bg-slate-400 dark:bg-slate-500" />
                  )}
                </span>
                <span className="flex-1 truncate text-slate-800 font-medium dark:text-slate-200">{node.data.label}</span>
                {hasFailed && (
                  <button
                    className="text-[0.6rem] text-red-500 hover:text-red-600 px-1 rounded bg-red-50 dark:bg-red-500/20 disabled:opacity-50"
                    disabled={running}
                    onClick={(e) => {
                      e.stopPropagation()
                      void runWorkflow(node.id)
                    }}
                  >
                    重试
                  </button>
                )}
              </div>

              {isExpanded && nodeStatus && (
                <div className="ml-5 mt-1 space-y-0.5 text-[0.65rem]">
                  {nodeStatus.input !== undefined && (
                    <div className="rounded px-2 py-1 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/5">
                      <span className="text-sky-500">输入</span>: {typeof nodeStatus.input === 'string' ? nodeStatus.input.slice(0, 50) + '...' : '[对象]'}
                    </div>
                  )}
                  {nodeStatus.output !== undefined && (
                    <div className="rounded px-2 py-1 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/5">
                      <span className="text-emerald-500">输出</span>: {typeof nodeStatus.output === 'string' ? nodeStatus.output.slice(0, 80) + '...' : '[对象]'}
                    </div>
                  )}
                  {nodeStatus.summary && (
                    <div className="rounded px-2 py-1 text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-white/5">
                      <span className="text-violet-500">摘要</span>: {nodeStatus.summary.slice(0, 80)}...
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex-1 overflow-auto rounded-xl border border-slate-200/70 bg-gradient-to-br from-slate-50/80 to-transparent p-4 dark:border-white/10 dark:from-white/5">
        {selectedNodeId ? (
          <NodeDetail nodeId={selectedNodeId} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-500 gap-1.5">
            <Codicon name="arrow-left" size={12} />
            选择左侧节点查看详细输出
          </div>
        )}
      </div>
    </div>
  )
}

function NodeDetail({ nodeId }: { nodeId: string }) {
  const { nodes, lastRun, runWorkflow, running } = useAgentFlow()
  const node = nodes.find(n => n.id === nodeId)
  const nodeStatus = lastRun?.node_statuses?.[nodeId]
  const [activeSection, setActiveSection] = useState<'output' | 'input' | 'prompt' | 'context' | 'tools'>('output')

  if (!node) return null

  const sections = [
    { key: 'output' as const, label: '输出', icon: 'arrow-up' },
    { key: 'input' as const, label: '输入', icon: 'arrow-down' },
    { key: 'prompt' as const, label: '提示词', icon: 'note' },
    { key: 'context' as const, label: '上下文', icon: 'layers' },
    { key: 'tools' as const, label: '工具调用', icon: 'tools' }
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{node.data.label}</span>
        {nodeStatus && (
          <span className={cn('flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-medium', statusBadgeClass(nodeStatus.status))}>
            {statusLabel(nodeStatus.status)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        {nodeStatus?.score !== undefined && <span>评分: {nodeStatus.score}</span>}
        {nodeStatus?.threshold !== undefined && <span>阈值: {nodeStatus.threshold}</span>}
        {nodeStatus?.branch && <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><Codicon name="git-branch" size={10} /> 分支: {nodeStatus.branch}</span>}
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-white/10">
        {sections.map(s => (
          <button
            className={cn(
              'flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border-b-2 -mb-px transition-all',
              activeSection === s.key
                ? 'border-violet-500 text-violet-700 dark:text-violet-300'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
            )}
            key={s.key}
            onClick={() => setActiveSection(s.key)}
          >
            <Codicon name={s.icon} size={11} />
            {s.label}
          </button>
        ))}
      </div>

      <div className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300 leading-relaxed">
        {activeSection === 'output' && (nodeStatus?.summary || nodeStatus?.output ? String(nodeStatus.summary || nodeStatus.output) : '暂无输出')}
        {activeSection === 'input' && (nodeStatus?.input ? (typeof nodeStatus.input === 'string' ? nodeStatus.input : JSON.stringify(nodeStatus.input, null, 2)) : '暂无输入')}
        {activeSection === 'prompt' && '暂无提示词数据（运行后显示）'}
        {activeSection === 'context' && '暂无上下文数据（运行后显示）'}
        {activeSection === 'tools' && '暂无工具调用数据（运行后显示）'}
      </div>

      {nodeStatus?.status === 'failed' && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <div className="flex items-start gap-2">
            <Codicon className="text-red-500 mt-0.5" name="error" size={14} />
            <div className="flex-1">
              <div className="text-xs font-semibold text-red-700 dark:text-red-300">执行失败</div>
              <div className="mt-1 text-xs text-red-600/80 dark:text-red-400/80">{nodeStatus.summary || '未知错误'}</div>
              <button
                className="mt-2 flex items-center gap-1 rounded bg-red-500 px-2.5 py-1 text-[0.65rem] font-medium text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={running}
                onClick={() => void runWorkflow(nodeId)}
              >
                <Codicon name="refresh" size={10} />
                重试此节点
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PromptTab() {
  const { selectedNode, lastRun, nodes, setSelectedNodeId } = useAgentFlow()
  const [showPreview, setShowPreview] = useState(true)
  const [selectedPromptNodeId, setSelectedPromptNodeId] = useState('')

  const node = nodes.find(n => n.id === selectedPromptNodeId) || selectedNode || nodes[0]
  const systemPrompt = String(node?.data?.rolePrompt || '你是一个专业的写作助手。')
  const userPrompt = String(node?.data?.taskPromptTemplate || '请根据以下内容完成任务：\n\n{{input}}')

  const handleCopy = () => {
    const fullPrompt = `System:\n${systemPrompt}\n\nUser:\n${userPrompt}`
    navigator.clipboard.writeText(fullPrompt).catch(() => {})
  }

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">当前节点：</span>
          <select
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-white/10 dark:bg-white/10 dark:text-slate-200"
            value={node?.id || ''}
            onChange={e => {
              setSelectedPromptNodeId(e.target.value)
              setSelectedNodeId(e.target.value)
            }}
          >
            {nodes.map(n => (
              <option key={n.id} value={n.id}>{n.data.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <button
            className={cn(
              'flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition-all',
              showPreview
                ? 'border-violet-500/50 bg-violet-500/10 text-violet-700 dark:text-violet-300'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5'
            )}
            onClick={() => setShowPreview(!showPreview)}
          >
            <Codicon name="eye" size={12} />
            变量预览
          </button>
          <button
            className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
            onClick={handleCopy}
          >
            <Codicon name="copy" size={12} />
            复制
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1">
              <Codicon name="shield" size={12} />
              系统提示词
            </span>
            <span className="text-[0.65rem] text-slate-400">~{systemPrompt.length} 字符</span>
          </div>
          <div className="rounded-xl border border-sky-200/60 bg-sky-50/50 p-3 dark:border-sky-500/20 dark:bg-sky-500/5">
            <pre className="whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300 font-mono leading-relaxed">
              {systemPrompt}
            </pre>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-violet-600 dark:text-violet-400 flex items-center gap-1">
              <Codicon name="person" size={12} />
              用户提示词
            </span>
            <span className="text-[0.65rem] text-slate-400">~{userPrompt.length} 字符</span>
          </div>
          <div className="rounded-xl border border-violet-200/60 bg-violet-50/50 p-3 dark:border-violet-500/20 dark:bg-violet-500/5">
            <pre className="whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-300 font-mono leading-relaxed">
              {showPreview ? userPrompt.replace(/\{\{(\w+)\}\}/g, (_: string, v: string) => `[${v}]`) : userPrompt}
            </pre>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2 dark:bg-white/5">
          <span className="text-xs text-slate-600 dark:text-slate-400">预估 Token 数</span>
          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">~{Math.round((systemPrompt.length + userPrompt.length) / 4)} tokens</span>
        </div>
      </div>
    </div>
  )
}

function ContextTab() {
  const { lastRun } = useAgentFlow()

  const contexts = (lastRun as any)?.context_hits || []

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">本次运行使用的上下文</span>
        <div className="flex items-center gap-3 text-[0.65rem] text-slate-500 dark:text-slate-400">
          <span>命中 {contexts.length} 条</span>
          {contexts.length > 0 && <span>共 ~{contexts.reduce((sum: number, c: any) => sum + (c.tokens || 0), 0)} tokens</span>}
        </div>
      </div>

      <div className="flex-1 overflow-auto space-y-2">
        {contexts.length > 0 && contexts.map((ctx: any, idx: number) => (
          <div key={idx} className="rounded-xl border border-slate-200 bg-white p-3 transition-all hover:border-teal-300 hover:shadow-sm dark:border-white/10 dark:bg-white/5 dark:hover:border-teal-500/30 cursor-pointer">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-medium text-slate-800 dark:text-slate-200">
                <Codicon className="text-teal-500" name="file" size={12} />
                {ctx.source || ctx.name || '未知来源'}
              </span>
              {typeof ctx.score === 'number' && (
                <span className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[0.6rem] font-medium text-teal-700 dark:bg-teal-500/20 dark:text-teal-300">
                  <Codicon name="star-full" size={10} />
                  {Math.round(ctx.score * 100)}
                </span>
              )}
            </div>
            {ctx.preview && (
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{ctx.preview}</div>
            )}
            {ctx.content && (
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{ctx.content}</div>
            )}
          </div>
        ))}

        {contexts.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-slate-500">
            <Codicon className="mb-2 opacity-40" name="layers" size={32} />
            <div className="text-sm">运行后显示上下文命中结果</div>
          </div>
        )}
      </div>
    </div>
  )
}

function ToolsTab() {
  const { lastRun } = useAgentFlow()

  const toolCalls = (lastRun as any)?.tool_calls || []

  return (
    <div className="h-full overflow-auto">
      <div className="space-y-2">
        {toolCalls.length > 0 && toolCalls.map((call: any, idx: number) => (
          <div key={idx} className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-slate-100 text-[0.6rem] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-400">
                  {idx + 1}
                </span>
                <span className="flex items-center gap-1">
                  <Codicon
                    name={call.status === 'success' ? 'check' : call.status === 'error' ? 'error' : 'watch'}
                    size={12}
                    className={
                      call.status === 'success'
                        ? 'text-emerald-500'
                        : call.status === 'error'
                          ? 'text-red-500'
                          : 'text-amber-500'
                    }
                  />
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{call.name || call.tool}</span>
                </span>
              </div>
              {typeof call.duration === 'number' && (
                <span className="text-[0.65rem] text-slate-400">{call.duration}ms</span>
              )}
            </div>

            <div className="mt-2 space-y-2">
              {call.args && (
                <div>
                  <div className="text-[0.6rem] font-medium text-slate-500 dark:text-slate-400 mb-1">参数</div>
                  <pre className="rounded bg-slate-50 p-2 text-[0.65rem] text-slate-600 font-mono dark:bg-white/5 dark:text-slate-400 overflow-x-auto">
                    {JSON.stringify(call.args, null, 2)}
                  </pre>
                </div>
              )}
              {(call.result !== undefined || call.output !== undefined) && (
                <div>
                  <div className="text-[0.6rem] font-medium text-slate-500 dark:text-slate-400 mb-1">结果</div>
                  <div className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                    {typeof (call.result || call.output) === 'string'
                      ? (call.result || call.output)
                      : JSON.stringify(call.result || call.output, null, 2)}
                  </div>
                </div>
              )}
              {call.error && (
                <div>
                  <div className="text-[0.6rem] font-medium text-red-500 mb-1">错误</div>
                  <div className="text-xs text-red-500 whitespace-pre-wrap">{call.error}</div>
                </div>
              )}
            </div>
          </div>
        ))}

        {toolCalls.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-slate-500">
            <Codicon className="mb-2 opacity-40" name="tools" size={32} />
            <div className="text-sm">暂无工具调用记录</div>
          </div>
        )}
      </div>
    </div>
  )
}

function LogsTab() {
  const { lastRun, nodes } = useAgentFlow()
  const [filter, setFilter] = useState<'all' | 'error' | 'warn'>('all')

  const nodeMap = new Map(nodes.map(n => [n.id, n.data.label]))

  const mockLogs = lastRun ? [
    { time: lastRun.started_at, level: 'info' as const, node: null, message: '流程开始运行' },
    ...Object.entries(lastRun.node_statuses || {}).map(([id, row]) => ({
      time: lastRun.started_at,
      level: (row.status === 'failed' ? 'error' : row.status === 'waiting_human' ? 'warn' : 'info') as 'info' | 'warn' | 'error',
      node: id,
      message: `节点「${row.label || nodeMap.get(id) || id}」${statusLabel(row.status)}`
    })),
    ...(lastRun.status === 'success' ? [{ time: lastRun.finished_at, level: 'info' as const, node: null, message: '流程运行完成' }] : [])
  ] : []

  const filteredLogs = mockLogs.filter(log => {
    if (filter === 'error') return log.level === 'error'
    if (filter === 'warn') return log.level === 'warn' || log.level === 'error'
    return true
  })

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-400">运行日志</span>
        <div className="flex gap-1">
          {([['all', '全部'], ['error', '错误'], ['warn', '警告']] as const).map(([key, label]) => (
            <button
              className={cn(
                'rounded px-2 py-1 text-[0.65rem] font-medium transition-all',
                filter === key
                  ? 'bg-violet-500/20 text-violet-700 dark:text-violet-300'
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10'
              )}
              key={key}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto font-mono text-xs space-y-1 bg-slate-950/5 dark:bg-black/20 rounded-lg p-3">
        {filteredLogs.length > 0 ? filteredLogs.map((log, idx) => {
          const cfg = logLevelConfig[log.level]
          return (
            <div key={idx} className={cn('flex items-start gap-2', cfg.color)}>
              <span className="text-slate-500 shrink-0">[{log.time ? new Date(log.time).toLocaleTimeString() : '--:--:--'}]</span>
              <span className="shrink-0">
                <Codicon name={cfg.icon} size={11} />
              </span>
              <span className="shrink-0 font-semibold">[{cfg.label}]</span>
              {log.node && nodeMap.has(log.node) && (
                <span className="text-violet-500 shrink-0">{nodeMap.get(log.node)}:</span>
              )}
              <span>{log.message}</span>
            </div>
          )
        }) : (
          <div className="flex h-full flex-col items-center justify-center text-slate-500 font-sans">
            <Codicon className="mb-2 opacity-40" name="file-text" size={32} />
            <div className="text-sm">运行后会在这里显示执行日志</div>
          </div>
        )}
      </div>
    </div>
  )
}

function ErrorsTab() {
  const { lastRun, runWorkflow } = useAgentFlow()

  const failedNodes = lastRun?.node_statuses
    ? Object.entries(lastRun.node_statuses).filter(([, row]) =>
        row.status === 'failed' || row.status === 'blocked' || row.status === 'rejected'
      )
    : []

  if (failedNodes.length === 0 && (!lastRun || lastRun.status !== 'failed')) {
    return (
      <div className="h-full">
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <div className="flex items-center gap-3">
            <Codicon className="text-emerald-500 dark:text-emerald-400" name="check" size={24} />
            <div>
              <div className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">暂无错误</div>
              <div className="mt-1 text-xs text-emerald-600/70 dark:text-emerald-400/70">
                {lastRun ? '流程运行正常，没有发现错误' : '运行流程后检查错误'}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto space-y-3">
      {failedNodes.map(([id, row]) => (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4" key={id}>
          <div className="flex items-start gap-2">
            <Codicon className="text-red-500 dark:text-red-400 mt-0.5" name="warning" size={18} />
            <div className="flex-1">
              <div className="text-sm font-semibold text-red-700 dark:text-red-300">
                节点「{row.label || id}」{statusLabel(row.status)}
              </div>
              {(row.summary || row.errorMessage) && (
                <div className="mt-2 text-xs text-red-600/80 dark:text-red-400/80 leading-relaxed">
                  {row.summary || row.errorMessage}
                </div>
              )}
              <div className="mt-3 flex items-center gap-2">
                <button
                  className="flex items-center gap-1 rounded bg-red-500/20 px-2 py-1 text-[0.65rem] font-medium text-red-700 hover:bg-red-500/30 dark:text-red-300"
                  onClick={() => runWorkflow(id)}
                >
                  <Codicon name="refresh" size={10} />
                  重试此节点
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function CostTab() {
  const { lastRun } = useAgentFlow()

  const duration = lastRun?.started_at && lastRun?.finished_at
    ? Math.round((new Date(lastRun.finished_at).getTime() - new Date(lastRun.started_at).getTime()) / 1000)
    : lastRun?.status === 'running' ? '...' : null

  const costEstimate = lastRun?.cost_estimate
  const calls = costEstimate?.calls || 0
  const tokens = costEstimate?.tokens || 0
  const inputTokens = costEstimate?.input_tokens || 0
  const outputTokens = costEstimate?.output_tokens || 0
  const estimatedCost = costEstimate?.cost || null

  const modelUsage: Array<{ model: string; tokens: number; percent: number }> = costEstimate?.by_model || []
  const nodeTokenUsage: Array<{ name: string; tokens: number; percent: number }> = costEstimate?.by_node || []

  const stats = [
    { label: '总耗时', value: duration ? `${duration}s` : '—', icon: 'watch', color: 'emerald' },
    { label: 'API 调用', value: calls, icon: 'link', color: 'violet' },
    { label: '总 Token', value: tokens.toLocaleString(), icon: 'target', color: 'cyan' },
    { label: '预估成本', value: estimatedCost ? `¥${estimatedCost}` : '—', icon: 'circle-slice', color: 'amber' }
  ]

  const colorClasses: Record<string, string> = {
    emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    violet: 'border-violet-500/20 bg-violet-500/10 text-violet-700 dark:text-violet-300',
    cyan: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300',
    amber: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  }

  const iconColorClasses: Record<string, string> = {
    emerald: 'opacity-70 text-emerald-600 dark:text-emerald-400',
    violet: 'opacity-70 text-violet-600 dark:text-violet-400',
    cyan: 'opacity-70 text-cyan-600 dark:text-cyan-400',
    amber: 'opacity-70 text-amber-600 dark:text-amber-400'
  }

  const hasTokenBreakdown = inputTokens > 0 || outputTokens > 0
  const hasModelBreakdown = modelUsage.length > 0
  const hasNodeBreakdown = nodeTokenUsage.length > 0

  return (
    <div className="h-full overflow-auto space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {stats.map(item => (
          <div
            className={cn('rounded-xl border p-4 text-center transition-all hover:shadow-sm', colorClasses[item.color])}
            key={item.label}
          >
            <Codicon className={cn('mb-1.5 mx-auto', iconColorClasses[item.color])} name={item.icon} size={20} />
            <div className="text-xl font-bold">{item.value}</div>
            <div className="mt-0.5 text-[0.65rem] text-slate-500 dark:text-slate-400">{item.label}</div>
          </div>
        ))}
      </div>

      {hasTokenBreakdown && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-3">Token 分布</div>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-[0.65rem] mb-1">
                <span className="text-sky-600 dark:text-sky-400">输入 Token</span>
                <span className="text-slate-600 dark:text-slate-400">{inputTokens.toLocaleString()}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-sky-400 to-sky-500 rounded-full" style={{ width: `${Math.round((inputTokens / Math.max(tokens, 1)) * 100)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[0.65rem] mb-1">
                <span className="text-fuchsia-600 dark:text-fuchsia-400">输出 Token</span>
                <span className="text-slate-600 dark:text-slate-400">{outputTokens.toLocaleString()}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-fuchsia-400 to-fuchsia-500 rounded-full" style={{ width: `${Math.round((outputTokens / Math.max(tokens, 1)) * 100)}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {hasModelBreakdown && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-3">模型使用分布</div>
          <div className="space-y-2">
            {modelUsage.map(m => (
              <div key={m.model}>
                <div className="flex justify-between text-[0.65rem] mb-1">
                  <span className="text-slate-700 dark:text-slate-300">{m.model}</span>
                  <span className="text-slate-500">{m.tokens.toLocaleString()} tokens</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-violet-400 to-violet-500 rounded-full" style={{ width: `${m.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasNodeBreakdown && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/5">
          <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-3">各节点 Token 消耗</div>
          <div className="space-y-2">
            {nodeTokenUsage.map(n => (
              <div key={n.name} className="flex items-center gap-3">
                <span className="w-20 text-[0.65rem] text-slate-600 dark:text-slate-400 truncate">{n.name}</span>
                <div className="flex-1 h-4 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-400 to-teal-500 rounded-full flex items-center justify-end pr-2" style={{ width: `${Math.max(n.percent, 8)}%` }}>
                    <span className="text-[0.6rem] text-white font-medium">{n.percent}%</span>
                  </div>
                </div>
                <span className="w-16 text-[0.65rem] text-slate-500 text-right">{n.tokens.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!lastRun && (
        <div className="text-center text-xs text-slate-500 py-4">
          运行流程后会在这里显示 Token 使用量和耗时统计
        </div>
      )}

      {lastRun && !hasTokenBreakdown && !hasModelBreakdown && !hasNodeBreakdown && tokens === 0 && (
        <div className="text-center text-xs text-slate-500 py-4">
          本次运行暂无详细的 Token 统计数据
        </div>
      )}
    </div>
  )
}

function HumanReviewDialog() {
  const { pendingReviewNode, humanReviewText, setHumanReviewText, continueWorkflow, markNodeAction, running } = useAgentFlow()
  const [editMode, setEditMode] = useState(false)

  if (!pendingReviewNode) return null

  return (
    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-end z-50">
      <div className="w-full bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-white/10 rounded-t-2xl p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              <Codicon name="account" size={18} />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">等待人工确认</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">节点「{pendingReviewNode.data.label}」需要您的确认</div>
            </div>
          </div>
        </div>

        {editMode && (
          <div className="mb-4">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2 block">编辑后提交</label>
            <textarea
              className="w-full h-24 rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 placeholder:text-slate-400 outline-none focus:border-violet-500/50 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 resize-none"
              onChange={e => setHumanReviewText(e.target.value)}
              placeholder="输入您的修改意见..."
              value={humanReviewText}
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <button
            className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs font-medium text-red-600 transition-all hover:bg-red-100 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-400 dark:hover:bg-red-500/20"
            disabled={running}
            onClick={() => void markNodeAction(pendingReviewNode.id, 'reject')}
          >
            <Codicon name="chrome-close" size={12} />
            驳回
          </button>
          <button
            className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-600 transition-all hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
            onClick={() => setEditMode(!editMode)}
          >
            <Codicon name="edit" size={12} />
            {editMode ? '取消编辑' : '编辑后通过'}
          </button>
          <button
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-5 py-2 text-xs font-semibold text-white transition-all',
              running
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:shadow-md'
            )}
            disabled={running}
            onClick={() => void (editMode ? markNodeAction(pendingReviewNode.id, 'edit') : markNodeAction(pendingReviewNode.id, 'accept'))}
          >
            <Codicon name="check" size={12} />
            {editMode ? '提交修改' : '通过'}
          </button>
        </div>
      </div>
    </div>
  )
}
