import { useCallback, useEffect, useRef, useState } from 'react'
import type * as React from 'react'

import { Codicon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

import {
  getNodeDefinition,
  NODE_TYPE_LABEL,
  type WorkflowNodeData
} from '../karna-workshop/workflow-schema'
import { useAgentFlow } from './store'
import { NodeInspectorTabs } from './node-inspector-schema-renderer'
import { SearchableSelect } from './searchable-select'
import { AgentAvatar } from './agent-avatars'

const INSPECTOR_WIDTH_KEY = 'karna-flow-inspector-width'
const DEFAULT_WIDTH = 440
const MIN_WIDTH = 360
const MAX_WIDTH = 760

const inputBaseClass =
  'w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none transition-all focus:border-violet-500/50 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-white/10'

function Section({
  title,
  icon,
  children,
  defaultOpen = true
}: {
  title: string
  icon?: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="mb-4">
      <button
        className="mb-2.5 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center gap-2">
          {icon && <Codicon name={icon} size={14} />}
          {title}
        </span>
        <Codicon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
      </button>
      {open && (
        <div className="rounded-xl border border-slate-200/70 bg-gradient-to-br from-slate-50/80 to-transparent p-4 backdrop-blur-sm dark:border-white/10 dark:from-white/5">
          {children}
        </div>
      )}
    </section>
  )
}

function FieldLabel({ label, helpText, required }: { label: string; helpText?: string; required?: boolean }) {
  return (
    <div className="mb-1.5 flex items-center justify-between">
      <label className="text-xs text-slate-500 dark:text-slate-400">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {helpText && (
        <Tip label={helpText} side="right" sideOffset={8} delayDuration={200}>
          <span className="cursor-help text-[10px] text-slate-400 dark:text-slate-500">
            <Codicon name="info" size={12} />
          </span>
        </Tip>
      )}
    </div>
  )
}

function TextField({
  value,
  onChange,
  placeholder,
  type = 'text',
  readOnly = false
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  readOnly?: boolean
}) {
  return (
    <input
      className={cn(inputBaseClass, readOnly && 'cursor-default bg-slate-50 text-slate-500 dark:bg-white/5')}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      readOnly={readOnly}
      type={type}
      value={value}
    />
  )
}

function TextareaField({
  value,
  onChange,
  onBlur,
  placeholder,
  minRows = 3
}: {
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  placeholder?: string
  minRows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = 'auto'
      ref.current.style.height = Math.max(ref.current.scrollHeight, minRows * 24) + 'px'
    }
  }, [value, minRows])
  return (
    <textarea
      ref={ref}
      className={cn(inputBaseClass, 'resize-none font-mono text-xs leading-relaxed')}
      onChange={e => onChange(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      rows={minRows}
      value={value}
    />
  )
}

function NumberField({
  value,
  onChange,
  min,
  max,
  step,
  disabled = false
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  disabled?: boolean
}) {
  return (
    <input
      className={cn(inputBaseClass, disabled && 'cursor-not-allowed opacity-60')}
      disabled={disabled}
      max={max}
      min={min}
      onChange={e => {
        const n = Number(e.target.value)
        onChange(Number.isNaN(n) ? 0 : n)
      }}
      step={step}
      type="number"
      value={value}
    />
  )
}

function SelectField({
  value,
  onChange,
  options,
  searchable = false
}: {
  value: string
  onChange: (v: string) => void
  options: Array<{ value: string; label: string; description?: string }>
  searchable?: boolean
}) {
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      searchable={searchable || options.length > 8}
      placeholder="请选择..."
    />
  )
}

function BooleanField({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={cn(
        'relative h-6 w-11 rounded-full transition-colors',
        value ? 'bg-gradient-to-r from-violet-500 to-cyan-500' : 'bg-slate-300 dark:bg-slate-600'
      )}
      onClick={() => onChange(!value)}
      type="button"
    >
      <span
        className={cn(
          'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
          value ? 'left-[calc(100%-1.375rem)]' : 'left-0.5'
        )}
      />
    </button>
  )
}

function SliderField({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
}) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex items-center gap-3">
      <input
        className="flex-1 accent-violet-500"
        max={max}
        min={min}
        onChange={e => onChange(Number(e.target.value))}
        step={step}
        style={{
          background: `linear-gradient(to right, rgb(139 92 246) 0%, rgb(139 92 246) ${pct}%, rgb(203 213 225) ${pct}%, rgb(203 213 225) 100%)`
        }}
        type="range"
        value={value}
      />
      <span className="w-12 text-right text-sm font-mono text-slate-600 dark:text-slate-300">{value}</span>
    </div>
  )
}

function ResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const handleRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)
  const [isHovering, setIsHovering] = useState(false)

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = startX.current - e.clientX
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
      className="group absolute left-0 top-0 z-20 flex h-full w-3 -translate-x-1/2 cursor-col-resize items-center justify-center"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onMouseDown={e => {
        dragging.current = true
        startX.current = e.clientX
        const parent = handleRef.current?.parentElement
        startW.current = parent?.getBoundingClientRect().width || DEFAULT_WIDTH
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

export function FlowInspector({ onClose }: { onClose: () => void }) {
  const { selectedNode, selectedEdge, selectedAgent } = useAgentFlow()
  const [width, setWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(INSPECTOR_WIDTH_KEY)
      return saved ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Number(saved))) : DEFAULT_WIDTH
    } catch {
      return DEFAULT_WIDTH
    }
  })

  const handleResize = useCallback((w: number) => {
    const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, w))
    setWidth(clamped)
    try { localStorage.setItem(INSPECTOR_WIDTH_KEY, String(clamped)) } catch {}
  }, [])

  let title = '流程概览'
  let iconName = 'dashboard'
  if (selectedNode) { title = '节点属性'; iconName = 'settings-gear' }
  else if (selectedEdge) { title = '连线属性'; iconName = 'link' }
  else if (selectedAgent) { title = '智能体编辑'; iconName = 'robot' }

  return (
    <aside
      className="relative z-10 flex h-full w-full flex-col border-l border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/50"
      style={{ width }}
    >
      <ResizeHandle onResize={handleResize} />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-fuchsia-500/20 to-transparent dark:via-fuchsia-500/30" />

      <div className="flex items-center justify-between border-b border-slate-200/70 px-5 py-4 dark:border-white/10">
        <div className="flex items-center gap-3">
          <Codicon className="text-violet-500" name={iconName} size={20} />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
        </div>
        <button
          className="rounded-lg p-2 text-slate-500 transition-all hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-200"
          onClick={onClose}
          title="关闭"
        >
          <Codicon name="close" size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {selectedNode && <NodeInspectorPanel />}
        {!selectedNode && selectedEdge && <EdgeInspector />}
        {!selectedNode && !selectedEdge && selectedAgent && <AgentInspectorPanel />}
        {!selectedNode && !selectedEdge && !selectedAgent && <FlowOverview />}
      </div>
    </aside>
  )
}

function AgentInspectorPanel() {
  const { selectedAgent, patchAgent, nodeResources, setSelectedAgentId, deleteAgent } = useAgentFlow()
  const [draft, setDraft] = useState<{
    name: string
    tagline: string
    role: string
    duties: string
    constraints: string
    model: string
    temperature: number
  } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!selectedAgent) { setDraft(null); return }
    setDraft({
      name: selectedAgent.name || '',
      tagline: selectedAgent.tagline || '',
      role: selectedAgent.role || '',
      duties: selectedAgent.duties || '',
      constraints: (selectedAgent.constraints || []).join('\n'),
      model: selectedAgent.model || '',
      temperature: selectedAgent.temperature ?? 0.7
    })
  }, [selectedAgent?.id])

  if (!selectedAgent || !draft) return null

  const isBuiltin = !!selectedAgent.isBuiltin
  const modelOptions = (nodeResources?.models || []).map(m => ({ value: m.id, label: m.name, description: m.provider }))
  const hasChanges = JSON.stringify({
    name: selectedAgent.name, tagline: selectedAgent.tagline, role: selectedAgent.role,
    duties: selectedAgent.duties, constraints: (selectedAgent.constraints || []).join('\n'),
    model: selectedAgent.model, temperature: selectedAgent.temperature
  }) !== JSON.stringify(draft)

  const handleSave = async () => {
    setSaving(true)
    try {
      await patchAgent({
        id: selectedAgent.id,
        name: draft.name.trim() || selectedAgent.name,
        tagline: draft.tagline.trim(),
        role: draft.role.trim(),
        duties: draft.duties,
        constraints: draft.constraints.split('\n').map(s => s.trim()).filter(Boolean),
        model: draft.model,
        temperature: draft.temperature
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-1 overflow-hidden rounded-xl border border-slate-200/70 bg-white/50 dark:border-white/10 dark:bg-white/5">
        <div className="h-1.5" style={{ backgroundColor: selectedAgent.color || '#8b5cf6' }} />
        <div className="p-4">
          <div className="flex items-center gap-3">
            <div className="size-12 shrink-0 overflow-hidden rounded-xl shadow-sm">
              <AgentAvatar agentId={selectedAgent.id} size={48} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-base font-semibold text-slate-800 dark:text-slate-100 truncate">{selectedAgent.name}</div>
                {isBuiltin && <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[0.6rem] text-violet-600 dark:text-violet-300">内置</span>}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate">{selectedAgent.tagline || selectedAgent.role}</div>
            </div>
          </div>
        </div>
      </div>

      <Section title="基础信息" icon="info">
        <div className="space-y-3">
          <div>
            <FieldLabel label="名称" />
            <TextField value={draft.name} onChange={v => setDraft({ ...draft, name: v })} placeholder="智能体名称" />
          </div>
          <div>
            <FieldLabel label="一句话介绍" />
            <TextField value={draft.tagline} onChange={v => setDraft({ ...draft, tagline: v })} placeholder="例如：规划章节结构与写作大纲" />
          </div>
        </div>
      </Section>

      <Section title="角色与提示词" icon="note">
        <div className="space-y-3">
          <div>
            <FieldLabel label="角色定位" />
            <TextareaField value={draft.role} onChange={v => setDraft({ ...draft, role: v })} minRows={2} placeholder="描述这个智能体是谁，扮演什么角色" />
          </div>
          <div>
            <FieldLabel label="职责说明" />
            <TextareaField value={draft.duties} onChange={v => setDraft({ ...draft, duties: v })} minRows={3} placeholder="描述这个智能体的具体工作内容和职责" />
          </div>
          <div>
            <FieldLabel label="约束条件" helpText="每行一条约束规则" />
            <TextareaField value={draft.constraints} onChange={v => setDraft({ ...draft, constraints: v })} minRows={3} placeholder="每行一条约束，例如：&#10;不得直接写正文&#10;保持人物一致性" />
          </div>
        </div>
      </Section>

      <Section title="模型设置" icon="settings-gear">
        <div className="space-y-3">
          <div>
            <FieldLabel label="默认模型" />
            <SearchableSelect
              value={draft.model}
              onChange={v => setDraft({ ...draft, model: v })}
              options={modelOptions}
              placeholder="跟随工作流默认"
              searchable
            />
          </div>
          <div>
            <FieldLabel label={`Temperature：${draft.temperature.toFixed(1)}`} />
            <SliderField value={Math.round(draft.temperature * 10) / 10} min={0} max={2} step={0.1} onChange={v => setDraft({ ...draft, temperature: v })} />
          </div>
        </div>
      </Section>

      <div className="sticky bottom-0 flex gap-2 bg-gradient-to-t from-white via-white/95 to-white/80 pt-3 dark:from-slate-950 dark:via-slate-950/95">
        <button
          type="button"
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
          onClick={() => setSelectedAgentId('')}
        >
          关闭
        </button>
        {!isBuiltin && (
          <button
            type="button"
            className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-500/20 dark:text-red-400"
            onClick={() => {
              if (confirm(`确定删除智能体"${selectedAgent.name}"？`)) {
                void deleteAgent(selectedAgent.id)
              }
            }}
          >
            删除
          </button>
        )}
        <button
          type="button"
          disabled={!hasChanges || saving}
          className="flex-1 rounded-lg bg-gradient-to-r from-violet-500 to-indigo-500 px-3 py-2 text-sm font-medium text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-violet-500/40 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          onClick={() => void handleSave()}
        >
          {saving ? '保存中...' : hasChanges ? '保存修改' : '已保存'}
        </button>
      </div>
    </div>
  )
}

function NodeInspectorPanel() {
  const {
    selectedNode,
    patchNode,
    nodeResources
  } = useAgentFlow()

  if (!selectedNode) return null

  const data = selectedNode.data as Record<string, any>
  const nodeType = String(data.nodeType || selectedNode.type)
  const nodeDef = getNodeDefinition(nodeType)
  const color = String(data.color || nodeDef?.color || '#6366f1')
  const icon = String(data.icon || nodeDef?.icon || 'circle-large-outline')

  const capabilities = nodeDef?.capabilities || []
  const inspectorSchema = nodeDef?.inspectorSchema || []

  const handlePatch = useCallback(
    (patch: Record<string, any>) => {
      patchNode(patch as any)
    },
    [patchNode]
  )

  const showLegacyWarning = data.legacyConfig && Object.keys(data.legacyConfig).length > 0

  return (
    <div className="flex flex-col gap-3">
      {showLegacyWarning && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
          <div className="flex items-start gap-2">
            <Codicon className="mt-0.5 shrink-0" name="warning" size={14} />
            <div>
              <div className="font-medium">配置已迁移</div>
              <div className="mt-0.5 text-amber-600/80 dark:text-amber-400/80">此节点包含旧版本配置，已自动迁移。保存后将使用新格式。</div>
            </div>
          </div>
        </div>
      )}

      <NodeInspectorTabs
        capabilities={capabilities}
        color={color}
        data={data}
        definition={nodeDef}
        icon={icon}
        node={selectedNode}
        nodeType={nodeType}
        onPatch={handlePatch}
        resources={nodeResources}
        schema={inspectorSchema}
      />
    </div>
  )
}

function EdgeInspector() {
  const { selectedEdge, patchEdge, deleteSelectedEdge, nodes, focusNode } = useAgentFlow()

  if (!selectedEdge) return null

  const edgeType = (selectedEdge as any).type || 'normal'
  const animated = (selectedEdge as any).animated !== false

  const sourceNode = nodes.find(n => n.id === selectedEdge.source)
  const targetNode = nodes.find(n => n.id === selectedEdge.target)

  const edgeTypeOptions = [
    { value: 'normal', label: '普通连线' },
    { value: 'condition', label: '条件分支' },
    { value: 'loop', label: '循环回边' },
    { value: 'human_approval', label: '人工审批' }
  ]

  return (
    <div className="space-y-1">
      <Section icon="link" title="连线信息">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200/70 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center gap-2 text-sm">
              <span
                className="cursor-pointer font-medium text-violet-600 hover:underline dark:text-violet-400"
                onClick={() => sourceNode && focusNode(sourceNode.id)}
              >
                {sourceNode?.data?.label || selectedEdge.source}
              </span>
              <Codicon name="arrow-right" size={14} className="text-slate-400" />
              <span
                className="cursor-pointer font-medium text-cyan-600 hover:underline dark:text-cyan-400"
                onClick={() => targetNode && focusNode(targetNode.id)}
              >
                {targetNode?.data?.label || selectedEdge.target}
              </span>
            </div>
            <div className="mt-2 flex gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="rounded bg-slate-200/50 px-1.5 py-0.5 dark:bg-white/10">
                {selectedEdge.sourceHandle || 'out'}
              </span>
              <span className="rounded bg-slate-200/50 px-1.5 py-0.5 dark:bg-white/10">
                {selectedEdge.targetHandle || 'in'}
              </span>
            </div>
          </div>

          <div>
            <FieldLabel label="连线标签 / 分支名" />
            <input
              className={inputBaseClass}
              onChange={e => patchEdge({ label: e.target.value })}
              placeholder="例如：通过、驳回、并行汇总"
              value={typeof selectedEdge.label === 'string' ? selectedEdge.label : ''}
            />
          </div>

          <div>
            <FieldLabel label="连线类型" />
            <SelectField
              value={edgeType}
              onChange={v => patchEdge({ type: v as any })}
              options={edgeTypeOptions}
            />
          </div>

          {edgeType === 'condition' && (
            <div>
              <FieldLabel label="条件表达式" helpText="为真时走这条分支" />
              <TextareaField
                minRows={2}
                onChange={v =>
                  patchEdge({
                    data: { ...((selectedEdge as any).data || {}), condition: { expression: v } }
                  } as any)
                }
                placeholder="例如：score >= 60"
                value={String((selectedEdge as any).data?.condition?.expression || '')}
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <FieldLabel label="动画效果" />
            <BooleanField
              onChange={v => patchEdge({ animated: v } as any)}
              value={animated}
            />
          </div>
        </div>
      </Section>

      <button
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-gradient-to-r from-red-500/20 to-rose-500/20 px-4 py-3 text-sm font-medium text-red-700 transition-all hover:from-red-500/30 hover:to-rose-500/30 dark:text-red-300"
        onClick={deleteSelectedEdge}
        type="button"
      >
        <Codicon name="trash" size={14} />
        删除这条连线
      </button>
    </div>
  )
}

function FlowOverview() {
  const {
    workflowName,
    setWorkflowName,
    currentWorkflow,
    nodes,
    edges,
    validation,
    focusNode,
    saveWorkflow,
    saving,
    patchRuntimeConfig,
    patchLimits,
    nodeResources
  } = useAgentFlow()

  const [description, setDescription] = useState(currentWorkflow.description || '')

  useEffect(() => {
    setDescription(currentWorkflow.description || '')
  }, [currentWorkflow.description])

  const agentCount = nodes.filter(n => {
    const t = String(n.data.nodeType)
    return t === 'agent' || t === 'critic' || t === 'tool_agent' || t === 'scheduler'
  }).length
  const inputCount = nodes.filter(n => String(n.data.nodeType).startsWith('input')).length
  const outputCount = nodes.filter(n => {
    const t = String(n.data.nodeType)
    return t === 'output' || t === 'final_output' || t === 'text_output' || t === 'file_output' || n.data.isFinalOutput
  }).length

  const errors = validation.errors.filter(e => e.severity === 'error')
  const warnings = validation.warnings

  const stats = [
    { label: '节点', value: nodes.length, textClass: 'text-violet-600 dark:text-violet-400' },
    { label: '连线', value: edges.length, textClass: 'text-cyan-600 dark:text-cyan-400' },
    { label: 'Agent', value: agentCount, textClass: 'text-fuchsia-600 dark:text-fuchsia-400' },
    { label: '输入', value: inputCount, textClass: 'text-sky-600 dark:text-sky-400' },
    { label: '输出', value: outputCount, textClass: 'text-emerald-600 dark:text-emerald-400' }
  ]

  return (
    <div className="space-y-1">
      <Section icon="file-text" title="基本信息">
        <div className="space-y-3">
          <div>
            <FieldLabel label="工作流名称" />
            <input
              className={inputBaseClass}
              onChange={e => setWorkflowName(e.target.value)}
              value={workflowName}
            />
          </div>
          <div>
            <FieldLabel label="描述" />
            <TextareaField
              minRows={2}
              onBlur={() => {
                if (description !== currentWorkflow.description) {
                  saveWorkflow()
                }
              }}
              onChange={(v: string) => setDescription(v)}
              placeholder="描述这个工作流的用途..."
              value={description}
            />
          </div>
          <div>
            <FieldLabel label="工作流 ID" />
            <div className="rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
              {currentWorkflow.id || '未保存'}
            </div>
          </div>
        </div>
      </Section>

      <Section icon="graph" title="统计信息">
        <div className="grid grid-cols-3 gap-2">
          {stats.map(s => (
            <div
              key={s.label}
              className="rounded-xl border border-slate-200/70 bg-slate-50/50 p-3 text-center dark:border-white/10 dark:bg-white/5"
            >
              <div className={cn('text-xl font-bold', s.textClass)}>{s.value}</div>
              <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">{s.label}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section icon="settings-gear" title="默认模型设置">
        <div className="space-y-3">
          <div>
            <FieldLabel label="默认模型" />
            <SelectField
              value={currentWorkflow.runtimeConfig.defaultModel}
              onChange={v => patchRuntimeConfig({ defaultModel: v })}
              options={(nodeResources?.models || []).map(m => ({ value: m.id, label: m.name }))}
            />
          </div>
        </div>
      </Section>

      <Section icon="shield" title="限制设置">
        <div className="grid grid-cols-3 gap-2">
          <div>
            <FieldLabel label="最大Agent" />
            <NumberField
              max={50}
              min={1}
              onChange={v => patchLimits({ max_agents: v })}
              value={currentWorkflow.limits.max_agents}
            />
          </div>
          <div>
            <FieldLabel label="最大并行" />
            <NumberField
              max={10}
              min={1}
              onChange={v => patchLimits({ max_parallel: v })}
              value={currentWorkflow.limits.max_parallel}
            />
          </div>
          <div>
            <FieldLabel label="最大循环" />
            <NumberField
              max={20}
              min={1}
              onChange={v => patchLimits({ max_loop: v })}
              value={currentWorkflow.limits.max_loop}
            />
          </div>
        </div>
      </Section>

      <Section icon="checklist" title="验证结果" defaultOpen={!validation.valid}>
        {validation.valid && warnings.length === 0 ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 dark:bg-emerald-500/10">
            <div className="flex items-center gap-2">
              <Codicon className="text-emerald-500 dark:text-emerald-400" name="check" size={20} />
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">校验通过</span>
            </div>
            <div className="mt-2 text-xs text-emerald-600/70 dark:text-emerald-400/70">流程结构完整，可以正常运行</div>
          </div>
        ) : (
          <div className="space-y-3">
            {errors.length > 0 && (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 dark:bg-red-500/10">
                <div className="mb-2 flex items-center gap-2">
                  <Codicon className="text-red-500 dark:text-red-400" name="error" size={16} />
                  <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                    {errors.length} 个错误
                  </span>
                </div>
                <div className="space-y-2">
                  {errors.map((err, i) => (
                    <div key={i} className="rounded-lg bg-red-500/10 p-2">
                      <div
                        className={cn(
                          'flex items-start gap-2 text-xs text-red-600 dark:text-red-400',
                          err.relatedNodeId && 'cursor-pointer hover:underline'
                        )}
                        onClick={() => err.relatedNodeId && focusNode(err.relatedNodeId)}
                      >
                        <Codicon className="mt-0.5 shrink-0" name="circle-filled" size={8} />
                        <div className="flex-1">
                          <div>{err.userMessage}</div>
                          {err.fixSuggestions && err.fixSuggestions.length > 0 && (
                            <div className="mt-1.5 flex gap-1">
                              {err.fixSuggestions.map((fix, fi) => (
                                <span
                                  key={fi}
                                  className="rounded bg-red-500/20 px-2 py-0.5 text-[10px] text-red-700 dark:text-red-300"
                                >
                                  {fix.label}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 dark:bg-amber-500/10">
                <div className="mb-2 flex items-center gap-2">
                  <Codicon className="text-amber-500 dark:text-amber-400" name="warning" size={16} />
                  <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                    {warnings.length} 个警告
                  </span>
                </div>
                <div className="space-y-1.5">
                  {warnings.map((warn, i) => (
                    <div
                      key={i}
                      className={cn(
                        'flex items-start gap-2 rounded bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-400',
                        warn.relatedNodeId && 'cursor-pointer hover:bg-amber-500/20'
                      )}
                      onClick={() => warn.relatedNodeId && focusNode(warn.relatedNodeId)}
                    >
                      <Codicon className="mt-0.5 shrink-0" name="circle-filled" size={8} />
                      <span>{warn.userMessage}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      <Section icon="info" title="版本信息">
        <div className="space-y-2 text-xs">
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">Schema 版本</span>
            <span className="font-mono text-slate-700 dark:text-slate-300">
              v{currentWorkflow.schema_version || 2}
            </span>
          </div>
          {currentWorkflow.created_at && (
            <div className="flex justify-between">
              <span className="text-slate-500 dark:text-slate-400">创建时间</span>
              <span className="text-slate-700 dark:text-slate-300">
                {new Date(currentWorkflow.created_at).toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500 dark:text-slate-400">更新时间</span>
            <span className="text-slate-700 dark:text-slate-300">
              {currentWorkflow.updated_at
                ? new Date(currentWorkflow.updated_at).toLocaleString()
                : '未保存'}
            </span>
          </div>
        </div>
      </Section>

      <button
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/30 bg-gradient-to-r from-violet-500/20 to-cyan-500/20 px-4 py-3 text-sm font-medium text-violet-700 transition-all hover:from-violet-500/30 hover:to-cyan-500/30 dark:text-violet-200 disabled:opacity-50"
        disabled={saving}
        onClick={() => void saveWorkflow()}
        type="button"
      >
        <Codicon className={saving ? 'animate-spin' : ''} name={saving ? 'sync' : 'save'} size={14} />
        {saving ? '保存中...' : '保存工作流'}
      </button>
    </div>
  )
}
