import { useCallback, useEffect, useRef, useState } from 'react'
import type * as React from 'react'
import { Codicon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  type NodeCapability,
  type KarnaNodeDefinition,
  type InspectorFieldSchema,
  type InspectorSectionSchema,
  type NodeResourceBinding,
  type NodeModelConfig,
  type NodePromptConfig,
  type NodeContextConfig,
  type NodeBudgetConfig,
  type SoulBindingConfig,
  type NodeContextBinding,
  type ResourceBindingMode,
  type NodeWarning,
  type NodePermissionDeclaration,
  type NodeResourceConfig
} from '../karna-workshop/workflow-schema'
import { AgentAvatar } from './agent-avatars'
import { SearchableSelect, MultiSearchableSelect } from './searchable-select'
import { useAgentFlow } from './store'

const inputBaseClass =
  'w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none transition-all focus:border-violet-500/50 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-white/10'

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc != null ? acc[key] : undefined), obj)
}

function setNestedValue(obj: any, path: string, value: any): any {
  const keys = path.split('.')
  const result = { ...obj }
  let current = result
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    current[key] = current[key] != null ? { ...current[key] } : {}
    current = current[key]
  }
  current[keys[keys.length - 1]] = value
  return result
}

export interface InspectorTab {
  id: string
  label: string
  icon: string
  capability?: NodeCapability
  always?: boolean
  capabilities?: NodeCapability[]
}

function SectionTitle({ icon, title, description }: { icon?: string; title: string; description?: string }) {
  return (
    <div className="mb-3 mt-4 first:mt-0">
      <div className="flex items-center gap-2">
        {icon && <Codicon name={icon} size={14} className="text-violet-500" />}
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h4>
      </div>
      {description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
    </div>
  )
}

export const INSPECTOR_TABS: InspectorTab[] = [
  { id: 'basic', label: '基础', icon: 'tag', always: true },
  { id: 'model', label: '模型', icon: 'settings-gear', capability: 'model' },
  { id: 'context', label: '上下文与知识', icon: 'layers', capability: 'context' },
  { id: 'capabilities', label: '能力', icon: 'tools', capabilities: ['skills', 'tools', 'mcp', 'plugins', 'permissions'] },
  { id: 'soul', label: 'Soul', icon: 'heart', capability: 'soul' },
  { id: 'runtime', label: '运行', icon: 'play-circle', capabilities: ['model', 'flow_control', 'retry', 'timeout', 'budget', 'human_review'] },
  { id: 'output', label: '输出与调试', icon: 'bug', capabilities: ['output_schema', 'writeback', 'archive', 'debug'] }
]

export function getVisibleTabs(capabilities: NodeCapability[], schema: InspectorSectionSchema[]): InspectorTab[] {
  const schemaIds = new Set(schema.map(s => s.id))
  return INSPECTOR_TABS.filter(tab => {
    if (tab.always) return true
    if (tab.capability && capabilities.includes(tab.capability)) return true
    if (tab.capabilities && tab.capabilities.some(c => capabilities.includes(c))) return true
    return schemaIds.has(tab.id)
  })
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

function TextField({ value, onChange, placeholder, type = 'text' }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return <input className={inputBaseClass} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} value={value} />
}

function TextareaField({ value, onChange, onBlur, placeholder, minRows = 3 }: { value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string; minRows?: number }) {
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

function NumberField({ value, onChange, min, max, step }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input
      className={inputBaseClass}
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

function SelectField({ value, onChange, options, searchable = false }: { value: string; onChange: (v: string) => void; options: Array<{ value: string; label: string; description?: string }>; searchable?: boolean }) {
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
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform', value ? 'left-[calc(100%-1.375rem)]' : 'left-0.5')} />
    </button>
  )
}

function SliderField({ value, onChange, min = 0, max = 100, step = 1 }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex items-center gap-3">
      <input
        className="flex-1 accent-violet-500"
        max={max} min={min} onChange={e => onChange(Number(e.target.value))} step={step}
        style={{ background: `linear-gradient(to right, rgb(139 92 246) 0%, rgb(139 92 246) ${pct}%, rgb(203 213 225) ${pct}%, rgb(203 213 225) 100%)` }}
        type="range" value={value}
      />
      <span className="w-12 text-right text-sm font-mono text-slate-600 dark:text-slate-300">{value}</span>
    </div>
  )
}

function TagsField({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [input, setInput] = useState('')
  const tags = Array.isArray(value) ? value : []
  const addTag = () => {
    const t = input.trim()
    if (t && !tags.includes(t)) { onChange([...tags, t]); setInput('') }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-1 text-xs text-violet-700 dark:text-violet-300">
            {tag}
            <button onClick={() => onChange(tags.filter(t => t !== tag))} type="button"><Codicon name="close" size={12} /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input className={inputBaseClass} onBlur={addTag} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }} placeholder={placeholder || '输入标签后回车'} value={input} />
      </div>
    </div>
  )
}

function JsonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [error, setError] = useState<string | null>(null)
  const format = () => {
    try { const parsed = JSON.parse(value || '{}'); onChange(JSON.stringify(parsed, null, 2)); setError(null) } catch (e: any) { setError(e.message) }
  }
  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <button className="flex items-center gap-1 rounded px-2 py-1 text-xs text-violet-600 hover:bg-violet-500/10 dark:text-violet-400" onClick={format} type="button">
          <Codicon name="wand" size={12} /> 格式化
        </button>
      </div>
      <textarea className={cn(inputBaseClass, 'resize-none font-mono text-xs leading-relaxed', error && 'border-red-500/50 focus:border-red-500')} onChange={e => { onChange(e.target.value); setError(null) }} placeholder="{}" rows={6} spellCheck={false} value={value} />
      {error && <div className="text-xs text-red-500">{error}</div>}
    </div>
  )
}

function useLocalEdit<T>(initialValue: T, onCommit: (v: T) => void) {
  const [local, setLocal] = useState<T>(initialValue)
  useEffect(() => { setLocal(initialValue) }, [initialValue])
  const commit = useCallback(() => { onCommit(local) }, [local, onCommit])
  return { value: local, set: setLocal, commit }
}

function SchemaField({ field, data, onPatch }: { field: InspectorFieldSchema; data: Record<string, any>; onPatch: (patch: Record<string, any>) => void }) {
  const rawValue = getNestedValue(data, field.key)
  const value = rawValue !== undefined ? rawValue : field.defaultValue
  const commit = useCallback((v: any) => {
    const keys = field.key.split('.')
    if (keys.length === 1) { onPatch({ [field.key]: v }) } else { onPatch(setNestedValue({}, field.key, v)) }
  }, [field.key, onPatch])
  const editor = useLocalEdit(value, commit)
  useEffect(() => { editor.set(value) }, [value])
  const handleBlur = () => editor.commit()

  const renderField = () => {
    switch (field.type) {
      case 'text': return <TextField onChange={editor.set} placeholder={field.placeholder} value={String(editor.value ?? '')} />
      case 'textarea': return <div onBlur={handleBlur}><TextareaField onChange={editor.set} placeholder={field.placeholder} value={String(editor.value ?? '')} /></div>
      case 'number': return <div onBlur={handleBlur}><NumberField max={field.max} min={field.min} onChange={editor.set} step={field.step} value={Number(editor.value ?? 0)} /></div>
      case 'select': { const options = field.options || [{ value: '', label: '无' }]; return <SelectField onChange={v => commit(v)} options={options} value={String(editor.value ?? '')} /> }
      case 'boolean': return <BooleanField onChange={v => commit(v)} value={Boolean(editor.value)} />
      case 'slider': return <SliderField max={field.max} min={field.min} onChange={v => { editor.set(v); commit(v) }} step={field.step} value={Number(editor.value ?? field.min ?? 0)} />
      case 'tags': return <TagsField onChange={v => commit(v)} placeholder={field.placeholder} value={Array.isArray(editor.value) ? editor.value : []} />
      case 'json': return <div onBlur={handleBlur}><JsonField onChange={editor.set} value={typeof editor.value === 'string' ? editor.value : JSON.stringify(editor.value ?? {}, null, 2)} /></div>
      default: return <div className="text-xs text-slate-400">不支持的字段类型: {field.type}</div>
    }
  }
  return <div className="mb-4 last:mb-0"><FieldLabel helpText={field.helpText} label={field.label} />{renderField()}</div>
}

function ModeSelector({ value, onChange, label = '绑定模式' }: { value: ResourceBindingMode; onChange: (v: ResourceBindingMode) => void; label?: string }) {
  const options = [
    { value: 'inherit' as const, label: '继承工作流/分组设置' },
    { value: 'auto' as const, label: '自动选择' },
    { value: 'explicit' as const, label: '指定资源' },
    { value: 'disabled' as const, label: '此节点不使用' }
  ]
  return (
    <div>
      <FieldLabel label={label} />
      <SearchableSelect onChange={v => onChange(v as ResourceBindingMode)} options={options} value={value} />
    </div>
  )
}

function ResourceBindingEditor({
  title, bindingKey, data, onPatch, options, multiple = false, showMode = true
}: {
  title: string; bindingKey: string; data: Record<string, any>; onPatch: (p: Record<string, any>) => void;
  options: Array<{ value: string; label: string; description?: string }>; multiple?: boolean; showMode?: boolean
}) {
  const effectiveMode = showMode ? ((data[bindingKey] as NodeResourceBinding)?.mode || 'inherit') : 'explicit'
  const binding: NodeResourceBinding = (data[bindingKey] as NodeResourceBinding) || { mode: effectiveMode as ResourceBindingMode, selectedIds: [] }
  const finalBinding = { ...binding, mode: effectiveMode as ResourceBindingMode }
  const updateBinding = (patch: Partial<NodeResourceBinding>) => onPatch({ [bindingKey]: { ...finalBinding, ...patch } })

  const selectedVals = finalBinding.selectedIds || []

  return (
    <div className="space-y-3">
      {showMode && <ModeSelector value={finalBinding.mode} onChange={v => updateBinding({ mode: v })} />}
      {finalBinding.mode === 'explicit' && (
        multiple ? (
          <MultiSearchableSelect
            values={selectedVals}
            onChange={vs => updateBinding({ selectedIds: vs })}
            options={options}
            placeholder="+ 点击选择添加..."
            emptyHint="没有更多可选项"
          />
        ) : (
          <SearchableSelect
            value={selectedVals[0] || ''}
            onChange={v => updateBinding({ selectedIds: v ? [v] : [] })}
            options={[{ value: '', label: '不选择' }, ...options]}
            searchable={options.length > 8}
          />
        )
      )}
    </div>
  )
}

function BasicTab({ data, onPatch, nodeId }: { data: Record<string, any>; onPatch: (p: Record<string, any>) => void; nodeId: string }) {
  const { agents } = useAgentFlow()
  const agentId = (data as any).agent_id
  const linkedAgent = agentId ? agents.find(a => a.id === agentId) : null

  const defaultRolePrompt = linkedAgent
    ? [
        `你是${linkedAgent.name}：${linkedAgent.role || ''}`.trim(),
        linkedAgent.duties ? `\n## 职责\n${linkedAgent.duties}` : '',
        (linkedAgent.constraints || []).length ? `\n## 约束\n${linkedAgent.constraints.map(c => `- ${c}`).join('\n')}` : ''
      ].filter(Boolean).join('\n')
    : ''

  const rawPrompt = data.promptConfig as NodePromptConfig | undefined
  const hasExplicitPrompt = !!(rawPrompt && (rawPrompt.rolePrompt || rawPrompt.taskPromptTemplate))
  const effectivePrompt: NodePromptConfig = hasExplicitPrompt
    ? rawPrompt!
    : {
        mode: 'explicit',
        rolePrompt: defaultRolePrompt,
        taskPromptTemplate: linkedAgent
          ? `请根据你的角色定位和职责完成任务：\n\n{{input || '请接收上游输入'}}\n\n请输出符合要求的结果。`
          : '',
        variables: [{ name: 'input' }],
        missingVariablePolicy: 'empty',
        mergeMode: 'append',
        version: 1
      }

  const updatePrompt = (patch: Partial<NodePromptConfig>) => {
    const next = { ...effectivePrompt, mode: 'explicit' as const, ...patch }
    onPatch({ promptConfig: next })
  }

  return (
    <div className="space-y-4">
      <div><FieldLabel label="节点名称" /><TextField onChange={v => onPatch({ label: v })} value={String(data.label || '')} /></div>
      <div><FieldLabel label="节点 ID" /><div className="rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">{nodeId}</div></div>
      <div><FieldLabel label="标签" /><TagsField onChange={v => onPatch({ tags: v })} value={Array.isArray(data.tags) ? data.tags : []} /></div>
      <div><FieldLabel label="描述" /><TextareaField minRows={2} onChange={v => onPatch({ description: v })} placeholder="节点描述..." value={String(data.description || '')} /></div>
      <div className="border-t border-slate-200/70 pt-3 dark:border-white/10">
        <SectionTitle icon="note" title="指令" description={linkedAgent ? `默认继承自「${linkedAgent.name}」的提示词，可在此处单独修改本节点` : '角色设定与任务提示词'} />
        <div className="space-y-3">
          <div><FieldLabel label="角色设定" helpText="定义这个节点/Agent的角色身份" /><TextareaField minRows={4} onChange={v => updatePrompt({ rolePrompt: v })} placeholder="例如：你是一位资深文学评论家..." value={effectivePrompt.rolePrompt || ''} /></div>
          <div><FieldLabel label="任务提示词" helpText="具体任务指令，支持 {{变量名}} 占位符" /><TextareaField minRows={5} onChange={v => updatePrompt({ taskPromptTemplate: v })} placeholder="请分析以下内容，从{{维度}}角度进行评价..." value={effectivePrompt.taskPromptTemplate || ''} /></div>
        </div>
      </div>
    </div>
  )
}

function PromptTab({ data, onPatch }: { data: Record<string, any>; onPatch: (p: Record<string, any>) => void }) {
  const promptConfig: NodePromptConfig = (data.promptConfig as NodePromptConfig) || { mode: 'inherit', variables: [], missingVariablePolicy: 'empty', mergeMode: 'append', version: 1 }
  const updatePrompt = (patch: Partial<NodePromptConfig>) => onPatch({ promptConfig: { ...promptConfig, ...patch } })
  const [showPreview, setShowPreview] = useState(false)
  const modeOptions = [
    { value: 'inherit', label: '继承项目/上游' }, { value: 'explicit', label: '显式配置' }, { value: 'preset', label: '使用预设模板' }
  ]
  const variableList = promptConfig.variables || []
  return (
    <div className="space-y-4">
      <div><FieldLabel label="Prompt 模式" /><SelectField onChange={v => updatePrompt({ mode: v as NodePromptConfig['mode'] })} options={modeOptions} value={promptConfig.mode} /></div>
      {promptConfig.mode === 'explicit' && (
        <>
          <div><FieldLabel label="角色设定" helpText="定义这个节点/Agent的角色身份" /><TextareaField minRows={4} onChange={v => updatePrompt({ rolePrompt: v })} placeholder="例如：你是一位资深文学评论家..." value={promptConfig.rolePrompt || ''} /></div>
          <div><FieldLabel label="任务提示词" helpText="具体任务指令，支持 {{变量名}} 占位符" /><TextareaField minRows={5} onChange={v => updatePrompt({ taskPromptTemplate: v })} placeholder="请分析以下内容，从{{维度}}角度进行评价..." value={promptConfig.taskPromptTemplate || ''} /></div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-400">变量列表</span>
              <button className="text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400" onClick={() => updatePrompt({ variables: [...variableList, { name: '' }] })} type="button"><Codicon name="add" size={12} /> 添加</button>
            </div>
            <div className="space-y-2">
              {variableList.map((v, i) => (
                <div key={i} className="flex gap-2">
                  <input className={cn(inputBaseClass, 'flex-1')} onChange={e => { const next = [...variableList]; next[i] = { ...v, name: e.target.value }; updatePrompt({ variables: next }) }} placeholder="变量名" value={v.name} />
                  <button className="rounded-lg p-2 text-red-500 hover:bg-red-500/10" onClick={() => updatePrompt({ variables: variableList.filter((_, idx) => idx !== i) })} type="button"><Codicon name="trash" size={14} /></button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
      <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-700 transition-all hover:bg-violet-500/20 dark:text-violet-300" onClick={() => setShowPreview(true)} type="button"><Codicon name="eye" size={14} /> 预览最终 Prompt</button>
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8" onClick={() => setShowPreview(false)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Prompt 预览</h3><button onClick={() => setShowPreview(false)} type="button"><Codicon name="close" size={20} /></button></div>
            <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700 dark:bg-white/5 dark:text-slate-300">{[`【角色设定】\n${promptConfig.rolePrompt || '(继承)'}`, '', `【任务提示】\n${promptConfig.taskPromptTemplate || '(继承)'}`].join('\n')}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

function ModelTab({ data, onPatch, resources }: { data: Record<string, any>; onPatch: (p: Record<string, any>) => void; resources: Pick<NodeResourceConfig, 'models'> }) {
  const modelConfig: NodeModelConfig = (data.modelConfig as NodeModelConfig) || { mode: 'inherit', fallbackModelIds: [], streaming: true, temperature: 0.7, maxOutputTokens: 4096 }
  const updateModel = (patch: Partial<NodeModelConfig>) => onPatch({ modelConfig: { ...modelConfig, ...patch } })
  const modelModeOptions = [
    { value: 'inherit', label: '项目默认' },
    { value: 'auto', label: '自动选择' },
    { value: 'explicit', label: '指定模型' },
    { value: 'disabled', label: '禁用模型' }
  ]
  const reasoningOptions = [{ value: 'low', label: '低 - 快速响应' }, { value: 'medium', label: '中 - 平衡' }, { value: 'high', label: '高 - 深度思考' }]
  const modelOptions = resources.models.map(m => ({ value: m.id, label: m.name, description: m.provider }))
  return (
    <div className="space-y-4">
      <div>
        <FieldLabel label="模型选择模式" />
        <SearchableSelect
          value={modelConfig.mode || 'inherit'}
          onChange={v => updateModel({ mode: v as NodeModelConfig['mode'] })}
          options={modelModeOptions}
        />
      </div>
      {modelConfig.mode === 'explicit' && (
        <div>
          <FieldLabel label="模型选择" helpText={modelOptions.length === 0 ? '未加载到模型列表，请检查 Karna 连接' : undefined} />
          <SearchableSelect
            value={modelConfig.modelId || ''}
            onChange={v => updateModel({ modelId: v })}
            options={modelOptions}
            placeholder={modelOptions.length === 0 ? '无可用模型' : '搜索模型...'}
            searchable
            emptyHint="没有匹配的模型"
          />
        </div>
      )}
      {modelConfig.mode !== 'disabled' && (
        <>
          <div><FieldLabel label="温度 Temperature" helpText="0=确定性，2=创造性" /><SliderField max={2} min={0} onChange={v => updateModel({ temperature: v })} step={0.1} value={modelConfig.temperature ?? 0.7} /></div>
          <div><FieldLabel label="Top P" helpText="核采样阈值" /><SliderField max={1} min={0} onChange={v => updateModel({ topP: v })} step={0.05} value={modelConfig.topP ?? 0.9} /></div>
          <div><FieldLabel label="最大输出 Token" /><NumberField max={32000} min={256} onChange={v => updateModel({ maxOutputTokens: v })} step={256} value={modelConfig.maxOutputTokens ?? 4096} /></div>
          <div>
            <FieldLabel label="推理强度" />
            <SearchableSelect
              value={modelConfig.reasoningEffort || 'medium'}
              onChange={v => updateModel({ reasoningEffort: v as NodeModelConfig['reasoningEffort'] })}
              options={reasoningOptions}
            />
          </div>
          <div className="flex items-center justify-between"><FieldLabel label="流式输出" helpText="实时显示生成内容" /><BooleanField onChange={v => updateModel({ streaming: v })} value={modelConfig.streaming !== false} /></div>
        </>
      )}
    </div>
  )
}

function ContextTab({ data, onPatch, resources }: { data: Record<string, any>; onPatch: (p: Record<string, any>) => void; resources: Pick<NodeResourceConfig, 'knowledge'> }) {
  const contextConfig: any = (data.contextConfig as any) || { inheritWorkflowContext: true, inheritGroupContext: true, bindings: [], mergePolicy: 'priority', conflictPolicy: 'prefer_verified', maxContextTokens: 0, contextBudgetMode: 'auto', includeSourceMetadata: true, includeEvidenceReferences: true, writebackPolicy: 'disabled' }
  const updateContext = (patch: Record<string, any>) => onPatch({ contextConfig: { ...contextConfig, ...patch } })
  const injectAsOptions = [{ value: 'system_context', label: '系统上下文' }, { value: 'task_context', label: '任务上下文' }, { value: 'evidence', label: '证据' }, { value: 'reference', label: '参考' }]
  const searchModeOptions = [{ value: 'vector', label: '向量检索' }, { value: 'keyword', label: '关键词' }, { value: 'hybrid', label: '混合模式' }]
  const conflictOptions = [{ value: 'prefer_verified', label: '优先已验证' }, { value: 'prefer_node', label: '优先节点配置' }, { value: 'prefer_workspace', label: '优先工作区' }, { value: 'prefer_latest', label: '优先最新' }, { value: 'ask_user', label: '询问用户' }]
  const wikiOptions = [
    { value: 'wiki', label: 'Wiki' }, { value: 'character_profiles', label: '人物档案' }, { value: 'timeline', label: '时间线' },
    { value: 'narrative_state', label: '叙事状态' }, { value: 'story_bible', label: '故事圣经' }
  ]
  const addBinding = () => {
    const newBinding: NodeContextBinding = { id: `ctx_${Date.now()}`, sourceType: 'vector_collection', sourceId: '', enabled: true, priority: contextConfig.bindings.length, injectAs: 'system_context', retrieval: { topK: 5, minScore: 0.7, searchMode: 'hybrid', rerank: true } }
    updateContext({ bindings: [...contextConfig.bindings, newBinding] })
  }
  const updateBindingItem = (id: string, patch: Partial<NodeContextBinding>) => updateContext({ bindings: contextConfig.bindings.map((b: NodeContextBinding) => (b.id === id ? { ...b, ...patch } : b)) })
  const deleteBinding = (id: string) => updateContext({ bindings: contextConfig.bindings.filter((b: NodeContextBinding) => b.id !== id) })
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle icon="inheritance" title="上下文继承" description="控制是否继承上层上下文" />
        <div className="space-y-3 rounded-lg border border-slate-200/70 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between"><FieldLabel label="继承项目上下文" helpText="使用项目级别的上下文配置" /><BooleanField onChange={v => updateContext({ inheritWorkflowContext: v })} value={contextConfig.inheritWorkflowContext !== false} /></div>
          <div className="flex items-center justify-between"><FieldLabel label="继承上游节点输出" helpText="自动包含上游节点的输出作为上下文" /><BooleanField onChange={v => updateContext({ inheritUpstreamOutput: v })} value={contextConfig.inheritUpstreamOutput !== false} /></div>
        </div>
      </div>
      <div>
        <SectionTitle icon="file" title="当前上下文" description="当前工作区相关内容" />
        <div className="space-y-3 rounded-lg border border-slate-200/70 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between"><FieldLabel label="当前文件或选区" helpText="包含用户当前正在编辑的文件内容或选中的文本" /><BooleanField onChange={v => updateContext({ includeCurrentFile: v })} value={contextConfig.includeCurrentFile !== false} /></div>
          <div className="flex items-center justify-between"><FieldLabel label="项目相关文件" helpText="自动检索与任务相关的项目文件" /><BooleanField onChange={v => updateContext({ includeProjectFiles: v })} value={contextConfig.includeProjectFiles !== false} /></div>
        </div>
      </div>
      <div>
        <SectionTitle icon="book" title="知识库" description="项目和全局知识库" />
        <div className="space-y-4">
          <ResourceBindingEditor bindingKey="projectKnowledge" data={data} onPatch={onPatch} options={resources.knowledge.map(k => ({ value: k.id, label: k.name, description: k.description }))} showMode={false} title="项目知识库" multiple />
        </div>
      </div>
      <div>
        <SectionTitle icon="library" title="Writer OS 资料" description="选择要加载的 Writer OS 内部资料" />
        <div className="space-y-2 rounded-lg border border-slate-200/70 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-white/5">
          {wikiOptions.map(opt => {
            const checked = Array.isArray(contextConfig.enabledWikiSources) ? contextConfig.enabledWikiSources.includes(opt.value) : false
            return (
              <label key={opt.value} className="flex cursor-pointer items-center gap-2">
                <input checked={checked} className="accent-violet-500" onChange={e => {
                  const next = e.target.checked ? [...(contextConfig.enabledWikiSources || []), opt.value] : (contextConfig.enabledWikiSources || []).filter((s: string) => s !== opt.value)
                  updateContext({ enabledWikiSources: next })
                }} type="checkbox" />
                <span className="text-sm text-slate-700 dark:text-slate-200">{opt.label}</span>
              </label>
            )
          })}
        </div>
      </div>
      <div>
        <SectionTitle icon="edit" title="手动上下文" description="额外手动添加的上下文文本" />
        <div><TextareaField minRows={3} onChange={v => updateContext({ manualContext: v })} placeholder="输入额外的上下文信息..." value={String(contextConfig.manualContext || '')} /></div>
      </div>
      <div>
        <SectionTitle icon="settings" title="高级设置" description="上下文冲突和Token限制" />
        <div className="space-y-4">
          <div><FieldLabel label="冲突策略" /><SelectField onChange={v => updateContext({ conflictPolicy: v })} options={conflictOptions} value={contextConfig.conflictPolicy || 'prefer_verified'} /></div>
          <div><FieldLabel helpText="0 表示根据当前节点模型的上下文窗口自动分配；填写正数才会固定限制。" label="最大上下文 Token" /><NumberField min={0} onChange={v => updateContext({ maxContextTokens: v, contextBudgetMode: v > 0 ? 'manual' : 'auto' })} step={1000} value={contextConfig.maxContextTokens ?? 0} /></div>
        </div>
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">自定义上下文源</span>
          <button className="flex items-center gap-1 text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400" onClick={addBinding} type="button"><Codicon name="add" size={12} /> 添加</button>
        </div>
        <div className="space-y-3">
          {contextConfig.bindings.map((b: NodeContextBinding) => (
            <div key={b.id} className="rounded-lg border border-slate-200/70 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="mb-2 flex items-center justify-between">
                <BooleanField onChange={v => updateBindingItem(b.id, { enabled: v })} value={b.enabled} />
                <button className="text-red-500 hover:text-red-600" onClick={() => deleteBinding(b.id)} type="button"><Codicon name="trash" size={14} /></button>
              </div>
              <div className="space-y-2">
                <TextField onChange={v => updateBindingItem(b.id, { sourceId: v })} placeholder="来源ID/名称" value={b.sourceId} />
                <SelectField onChange={v => updateBindingItem(b.id, { injectAs: v as NodeContextBinding['injectAs'] })} options={injectAsOptions} value={b.injectAs} />
                {b.retrieval && (
                  <div className="space-y-2 pt-2">
                    <div className="flex gap-2">
                      <div className="flex-1"><FieldLabel label="Top K" /><NumberField max={50} min={1} onChange={v => updateBindingItem(b.id, { retrieval: { ...b.retrieval!, topK: v } })} value={b.retrieval.topK} /></div>
                      <div className="flex-1"><FieldLabel label="最低分(%)" /><NumberField max={100} min={0} onChange={v => updateBindingItem(b.id, { retrieval: { ...b.retrieval!, minScore: v / 100 } })} value={Math.round((b.retrieval.minScore || 0) * 100)} /></div>
                    </div>
                    <SelectField onChange={v => updateBindingItem(b.id, { retrieval: { ...b.retrieval!, searchMode: v as any } })} options={searchModeOptions} value={b.retrieval.searchMode} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SoulTab({ data, onPatch, resources }: { data: Record<string, any>; onPatch: (p: Record<string, any>) => void; resources: Pick<NodeResourceConfig, 'souls'> }) {
  const soulConfig: any = (data.soulConfig as any) || { usageMode: 'method_reference', enabledAttributes: [], influenceStrength: 0.5, blockDirectImitation: true, blockSignaturePhrases: true, blockCharacterReplication: true, soulId: '' }
  const updateSoul = (patch: Record<string, any>) => onPatch({ soulConfig: { ...soulConfig, ...patch } })
  const usageOptions = [
    { value: 'method_reference', label: '方法参考' },
    { value: 'critic', label: '批评视角' },
    { value: 'style_reference', label: '写作风格参考' }
  ]
  const attributeOptions: Array<{ value: string; label: string }> = [
    { value: 'narrative_methods', label: '叙事方法' }, { value: 'character_design', label: '人物处理' }, { value: 'dialogue_features', label: '对白' },
    { value: 'imagery_system', label: '意象' }, { value: 'pacing_preference', label: '节奏' }, { value: 'critic_lens', label: '批评视角' },
    { value: 'safety_shield', label: '安全护盾' }
  ]
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle icon="heart" title="Soul 选择" description="选择要应用的创作灵魂" />
        <div className="space-y-4">
          <div>
            <FieldLabel label="选择 Soul" />
            <SearchableSelect
              value={soulConfig.soulId || ''}
              onChange={v => updateSoul({ soulId: v })}
              options={[{ value: '', label: '不选择' }, ...resources.souls.map(s => ({ value: s.id, label: s.name, description: s.description }))]}
              placeholder="搜索 Soul..."
              searchable
              emptyHint="没有匹配的 Soul"
            />
            {soulConfig.soulId && resources.souls.find(s => s.id === soulConfig.soulId)?.description && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{resources.souls.find(s => s.id === soulConfig.soulId)?.description}</p>
            )}
          </div>
        </div>
      </div>
      {soulConfig.soulId && (
        <>
          <div>
            <SectionTitle icon="settings" title="使用配置" description="控制 Soul 的影响方式和强度" />
            <div className="space-y-4">
              <div>
                <FieldLabel label="使用方式" />
                <SearchableSelect value={soulConfig.usageMode || 'method_reference'} onChange={v => updateSoul({ usageMode: v })} options={usageOptions} />
              </div>
              <div><FieldLabel label="影响强度" helpText="0-100，数值越高 Soul 影响越强" /><SliderField max={100} min={0} onChange={v => updateSoul({ influenceStrength: v / 100 })} step={5} value={Math.round((soulConfig.influenceStrength || 0.5) * 100)} /></div>
            </div>
          </div>
          <div>
            <SectionTitle icon="list-selection" title="使用属性" description="选择启用 Soul 的哪些方面" />
            <div className="space-y-2 rounded-lg border border-slate-200/70 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-white/5">
              {attributeOptions.map(opt => {
                const checked = (soulConfig.enabledAttributes || []).includes(opt.value)
                return (<label key={opt.value} className="flex cursor-pointer items-center gap-2">
                  <input checked={checked} className="accent-violet-500" onChange={e => { const next = e.target.checked ? [...(soulConfig.enabledAttributes || []), opt.value] : (soulConfig.enabledAttributes || []).filter((a: string) => a !== opt.value); updateSoul({ enabledAttributes: next }) }} type="checkbox" />
                  <span className="text-sm text-slate-700 dark:text-slate-200">{opt.label}</span>
                </label>)
              })}
            </div>
          </div>
          <div>
            <SectionTitle icon="shield" title="保护设置" description="防止过度模仿" />
            <div className="space-y-3 rounded-lg border border-slate-200/70 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-center justify-between"><FieldLabel label="DO_NOT_COPY 保护" helpText="启用防止直接复制保护" /><BooleanField onChange={v => updateSoul({ blockDirectImitation: v })} value={soulConfig.blockDirectImitation !== false} /></div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function CapabilitiesTab({ data, onPatch, resources }: { data: Record<string, any>; onPatch: (p: Record<string, any>) => void; resources: Pick<NodeResourceConfig, 'mcp' | 'skills' | 'connectors' | 'plugins'> }) {
  const permissions: NodePermissionDeclaration = (data.permissions as NodePermissionDeclaration) || {}
  const updatePermissions = (patch: Partial<NodePermissionDeclaration>) => onPatch({ permissions: { ...permissions, ...patch } })
  const connectorOptions = (resources.connectors || []).map(c => ({ value: c.id, label: c.name, description: c.description }))
  const pluginOptions = (resources.plugins || []).map(p => ({ value: p.id, label: p.name, description: p.description }))
  const filesystemOptions = [
    { value: 'none', label: '无访问权限' }, { value: 'read_project', label: '读取项目文件' }, { value: 'read_workspace', label: '读取工作区' },
    { value: 'write_project', label: '读写项目文件' }, { value: 'write_workspace', label: '读写工作区' }
  ]
  const networkOptions = [
    { value: 'none', label: '无网络访问' }, { value: 'http_get', label: '仅 HTTP GET' }, { value: 'http_post', label: 'HTTP GET/POST' }, { value: 'full', label: '完整网络访问' }
  ]
  const shellOptions = [
    { value: 'none', label: '禁止 Shell' }, { value: 'allowlisted', label: '仅白名单命令' }, { value: 'full', label: '完整 Shell 权限' }
  ]
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle icon="tools" title="Skill" description="选择此节点可使用的技能" />
        <ResourceBindingEditor bindingKey="skillsConfig" data={data} onPatch={onPatch} options={resources.skills.map(s => ({ value: s.id, label: s.name, description: s.description }))} showMode={false} title="技能" multiple />
      </div>
      <div>
        <SectionTitle icon="plug" title="MCP" description="选择 MCP 服务器及具体工具" />
        <ResourceBindingEditor bindingKey="mcpConfig" data={data} onPatch={onPatch} options={resources.mcp.flatMap(s => (s.tools || [{ id: s.id, name: s.name }]).map(t => ({ value: `${s.id}/${t.id}`, label: t.name, description: `${s.name}` })))} showMode={false} title="MCP 工具" multiple />
      </div>
      <div>
        <SectionTitle icon="wrench" title="工具" description="外部服务连接器工具" />
        <ResourceBindingEditor bindingKey="connectorsConfig" data={data} onPatch={onPatch} options={connectorOptions} showMode={false} title="工具" multiple />
      </div>
      <div>
        <SectionTitle icon="extensions" title="插件" description="扩展功能插件" />
        <ResourceBindingEditor bindingKey="pluginsConfig" data={data} onPatch={onPatch} options={pluginOptions} showMode={false} title="插件" multiple />
      </div>
      <div>
        <SectionTitle icon="shield" title="权限、审批要求和网络访问" description="配置节点的安全权限边界" />
        <div className="space-y-4 rounded-lg border border-slate-200/70 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-white/5">
          <div><FieldLabel label="文件系统访问" /><SearchableSelect onChange={v => updatePermissions({ filesystem: v as NodePermissionDeclaration['filesystem'] })} options={filesystemOptions} value={permissions.filesystem || 'none'} /></div>
          <div><FieldLabel label="网络访问" /><SearchableSelect onChange={v => updatePermissions({ network: v as NodePermissionDeclaration['network'] })} options={networkOptions} value={permissions.network || 'none'} /></div>
          <div><FieldLabel label="Shell 执行" /><SearchableSelect onChange={v => updatePermissions({ shell: v as NodePermissionDeclaration['shell'] })} options={shellOptions} value={permissions.shell || 'none'} /></div>
          <div className="flex items-center justify-between"><FieldLabel label="高风险操作需审批" helpText="执行敏感操作前请求人工确认" /><BooleanField onChange={v => updatePermissions({ requireApprovalFor: v ? ['*'] : [] })} value={(permissions.requireApprovalFor?.length || 0) > 0} /></div>
        </div>
      </div>
    </div>
  )
}

function RuntimeTab({ data, onPatch, nodeType }: { data: Record<string, any>; onPatch: (p: Record<string, any>) => void; nodeType: string }) {
  const budgetConfig: any = (data.budgetConfig as any) || { maxInputTokens: 0, maxOutputTokens: 0, maxCost: 0, maxRetries: 2, timeoutSeconds: 120 }
  const updateBudget = (patch: Record<string, any>) => onPatch({ budgetConfig: { ...budgetConfig, ...patch } })
  const failureOptions = [
    { value: 'stop', label: '停止工作流' }, { value: 'continue', label: '继续执行' }, { value: 'retry', label: '自动重试' }, { value: 'jump', label: '跳转到指定节点' }
  ]
  const humanConfirmOptions = [
    { value: 'none', label: '无' }, { value: 'before_run', label: '运行前确认' }, { value: 'after_output', label: '输出后确认' }, { value: 'always', label: '始终需要确认' }
  ]
  const isControlNode = ['fanout', 'parallel', 'barrier', 'loop_controller', 'loop', 'condition', 'boolean_judge', 'score_judge', 'llm_judge', 'consensus', 'human_confirm', 'human_edit', 'human_review'].includes(nodeType)

  const renderControlConfig = () => {
    if (nodeType === 'fanout' || nodeType === 'parallel') {
      const config = (data.fanoutConfig as any) || { mode: 'broadcast', maxConcurrency: 3 }
      const update = (patch: any) => onPatch({ fanoutConfig: { ...config, ...patch } })
      return (
        <div className="space-y-4">
          <SectionTitle icon="git-branch" title="并行配置" description="并行节点的分发与并发控制" />
          <div><FieldLabel label="分发模式" /><SelectField onChange={v => update({ mode: v })} options={[{ value: 'broadcast', label: '广播 - 所有分支' }, { value: 'round_robin', label: '轮询分发' }, { value: 'partition', label: '分区' }, { value: 'custom', label: '自定义' }]} value={config.mode} /></div>
          <div><FieldLabel label="最大并发数" /><NumberField max={10} min={1} onChange={v => update({ maxConcurrency: v })} value={config.maxConcurrency || 3} /></div>
        </div>
      )
    }
    if (nodeType === 'barrier') {
      const config = (data.barrierConfig as any) || { waitMode: 'all', timeoutSeconds: 300, onTimeout: 'fail' }
      const update = (patch: any) => onPatch({ barrierConfig: { ...config, ...patch } })
      return (
        <div className="space-y-4">
          <SectionTitle icon="circle-slash" title="屏障配置" description="同步等待多个分支完成" />
          <div><FieldLabel label="等待模式" /><SelectField onChange={v => update({ waitMode: v })} options={[{ value: 'all', label: '等待所有' }, { value: 'minimum_count', label: '等待指定数量' }, { value: 'minimum_ratio', label: '等待指定比例' }, { value: 'first_success', label: '首个成功' }, { value: 'first_complete', label: '首个完成' }]} value={config.waitMode} /></div>
          {config.waitMode === 'minimum_count' && <div><FieldLabel label="最小等待数" /><NumberField min={1} onChange={v => update({ minimumCount: v })} value={config.minimumCount || 2} /></div>}
          {config.waitMode === 'minimum_ratio' && <div><FieldLabel label="等待比例(%)" /><NumberField max={100} min={1} onChange={v => update({ minimumRatio: v / 100 })} value={Math.round((config.minimumRatio || 0.5) * 100)} /></div>}
          <div><FieldLabel label="超时(秒)" /><NumberField min={0} onChange={v => update({ timeoutSeconds: v })} value={config.timeoutSeconds || 300} /></div>
        </div>
      )
    }
    if (nodeType === 'loop_controller' || nodeType === 'loop') {
      const config = (data.loopConfig as any) || { maxRounds: 3, onLimitReached: 'continue_to_output' }
      const update = (patch: any) => onPatch({ loopConfig: { ...config, ...patch } })
      return (
        <div className="space-y-4">
          <SectionTitle icon="sync" title="循环配置" description="循环执行控制" />
          <div><FieldLabel label="最大轮数" /><NumberField max={20} min={1} onChange={v => update({ maxRounds: v })} value={config.maxRounds || 3} /></div>
          <div><FieldLabel label="退出条件表达式" /><TextField onChange={v => update({ exitExpression: v })} placeholder="例如：score >= 80" value={config.exitExpression || ''} /></div>
          <div><FieldLabel label="达到轮数上限时" /><SelectField onChange={v => update({ onLimitReached: v })} options={[{ value: 'pause', label: '暂停等待' }, { value: 'fail', label: '失败终止' }, { value: 'continue_to_output', label: '跳到输出' }, { value: 'ask_user', label: '询问用户' }]} value={config.onLimitReached} /></div>
        </div>
      )
    }
    if (nodeType === 'condition' || nodeType === 'boolean_judge' || nodeType === 'score_judge' || nodeType === 'llm_judge') {
      return (
        <div className="space-y-4">
          <SectionTitle icon="question" title="条件判断配置" description="分支条件设置" />
          <div><FieldLabel label="条件表达式" /><TextareaField minRows={2} onChange={v => onPatch({ condition: v })} placeholder="例如：score >= 60" value={String(data.condition || '')} /></div>
          {nodeType === 'score_judge' && <div><FieldLabel label="通过分数线" /><NumberField max={100} min={0} onChange={v => onPatch({ threshold: v })} value={Number(data.threshold || 60)} /></div>}
        </div>
      )
    }
    if (nodeType === 'consensus') {
      const config = (data.consensusConfig as any) || { mode: 'quorum', requireAllResponses: true, quorumRatio: 0.5, passingScore: 60 }
      const update = (patch: any) => onPatch({ consensusConfig: { ...config, ...patch } })
      return (
        <div className="space-y-4">
          <SectionTitle icon="people" title="共识配置" description="多Agent投票/共识设置" />
          <div><FieldLabel label="共识模式" /><SelectField onChange={v => update({ mode: v })} options={[{ value: 'all_pass', label: '全部通过' }, { value: 'quorum', label: '比例通过' }, { value: 'weighted', label: '加权投票' }, { value: 'veto', label: '一票否决' }]} value={config.mode} /></div>
          {config.mode === 'quorum' && <div><FieldLabel label="通过比例(%)" /><SliderField max={100} min={0} onChange={v => update({ quorumRatio: v / 100 })} step={5} value={Math.round((config.quorumRatio || 0.5) * 100)} /></div>}
          <div><FieldLabel label="通过分数线" /><NumberField max={100} min={0} onChange={v => update({ passingScore: v })} value={config.passingScore || 60} /></div>
        </div>
      )
    }
    if (nodeType === 'human_confirm' || nodeType === 'human_edit' || nodeType === 'human_review') {
      return (
        <div className="space-y-4">
          <SectionTitle icon="person" title="人工审核配置" description="人工介入设置" />
          <div className="flex items-center justify-between"><FieldLabel label="需要人工确认" /><BooleanField onChange={v => onPatch({ requiresReview: v })} value={data.requiresReview !== false} /></div>
          <div><FieldLabel label="确认提示" /><TextareaField minRows={2} onChange={v => onPatch({ reviewPrompt: v })} placeholder="告知用户需要确认什么..." value={String(data.reviewPrompt || '')} /></div>
          <div><FieldLabel label="超时(毫秒)" /><NumberField min={0} onChange={v => onPatch({ timeoutConfig: { ...(data.timeoutConfig || {}), timeoutMs: v } })} value={data.timeoutConfig?.timeoutMs || 300000} step={1000} /></div>
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-6">
      {isControlNode && renderControlConfig()}
      {!isControlNode && (
        <>
          <div>
            <SectionTitle icon="clock" title="超时与重试" description="节点执行的超时和失败重试策略" />
            <div className="space-y-4">
              <div><FieldLabel label="超时时间(秒)" helpText="节点执行最长时间，0为不限制" /><NumberField min={0} onChange={v => updateBudget({ timeoutSeconds: v })} value={budgetConfig.timeoutSeconds ?? 120} /></div>
              <div><FieldLabel label="重试次数" helpText="失败后自动重试次数" /><NumberField max={10} min={0} onChange={v => updateBudget({ maxRetries: v })} value={budgetConfig.maxRetries ?? 2} /></div>
            </div>
          </div>
          <div>
            <SectionTitle icon="pulse" title="Token与费用预算" description="限制节点资源消耗" />
            <div className="space-y-4">
              <div><FieldLabel label="最大输入 Token" helpText="0为使用项目默认" /><NumberField min={0} onChange={v => updateBudget({ maxInputTokens: v })} step={1000} value={budgetConfig.maxInputTokens ?? 0} /></div>
              <div><FieldLabel label="最大输出 Token" helpText="0为使用项目默认" /><NumberField min={0} onChange={v => updateBudget({ maxOutputTokens: v })} step={1000} value={budgetConfig.maxOutputTokens ?? 0} /></div>
              <div><FieldLabel label="最大费用(分)" helpText="0为不限制" /><NumberField min={0} onChange={v => updateBudget({ maxCost: v })} value={budgetConfig.maxCost ?? 0} /></div>
            </div>
          </div>
          <div>
            <SectionTitle icon="error" title="失败策略" description="节点执行失败时的处理方式" />
            <div className="space-y-4">
              <div><FieldLabel label="失败处理" /><SelectField onChange={v => onPatch({ failurePolicy: v })} options={failureOptions} value={String(data.failurePolicy || 'stop')} /></div>
            </div>
          </div>
        </>
      )}
      <div>
        <SectionTitle icon="comment" title="人工确认要求" description="设置节点执行前后是否需要人工审核" />
        <div className="space-y-4">
          <div><FieldLabel label="确认时机" /><SelectField onChange={v => onPatch({ humanConfirmMode: v })} options={humanConfirmOptions} value={String(data.humanConfirmMode || 'none')} /></div>
        </div>
      </div>
    </div>
  )
}

function OutputTab({ data, onPatch }: { data: Record<string, any>; onPatch: (p: Record<string, any>) => void }) {
  const formatOptions = [{ value: 'text', label: '纯文本' }, { value: 'markdown', label: 'Markdown' }, { value: 'json', label: 'JSON' }, { value: 'file', label: '保存到文件' }]
  const archiveFormatOptions = [
    { value: 'markdown', label: 'Markdown' }, { value: 'docx', label: 'Word 文档' }, { value: 'pdf', label: 'PDF' }, { value: 'html', label: 'HTML' }, { value: 'json', label: 'JSON' }
  ]
  const logOptions = [{ value: 'none', label: '无' }, { value: 'error', label: '仅错误' }, { value: 'warn', label: '警告' }, { value: 'info', label: '信息' }, { value: 'debug', label: '调试' }, { value: 'trace', label: '追踪' }]
  const [showPreview, setShowPreview] = useState(false)
  return (
    <div className="space-y-6">
      <div>
        <SectionTitle icon="arrow-up" title="输出配置" description="节点输出格式和目标设置" />
        <div className="space-y-4">
          <div><FieldLabel label="输出格式" /><SelectField onChange={v => onPatch({ outputFormat: v })} options={formatOptions} value={String(data.outputFormat || 'markdown')} /></div>
          <div><FieldLabel label="输出 Schema" helpText="JSON Schema 定义输出结构" /><JsonField onChange={v => { try { onPatch({ outputSchema: JSON.parse(v) }) } catch {} }} value={JSON.stringify(data.outputSchema || {}, null, 2)} /></div>
          <div><FieldLabel label="输出目标" /><TextField onChange={v => onPatch({ outputTarget: v })} placeholder="文件路径或下游端口" value={String(data.outputTarget || '')} /></div>
        </div>
      </div>
      <div>
        <SectionTitle icon="save" title="写回项目" description="是否将输出写回项目文件" />
        <div className="space-y-4 rounded-lg border border-slate-200/70 bg-slate-50/50 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center justify-between"><FieldLabel label="写回项目文件" helpText="将节点输出写入项目" /><BooleanField onChange={v => onPatch({ writebackEnabled: v })} value={Boolean(data.writebackEnabled)} /></div>
          <div className="flex items-center justify-between"><FieldLabel label="写回前确认" helpText="写回前请求用户确认" /><BooleanField onChange={v => onPatch({ writebackRequireApproval: v })} value={data.writebackRequireApproval !== false} /></div>
        </div>
      </div>
      <div>
        <SectionTitle icon="archive" title="归档配置" description="输出版本归档设置" />
        <div className="space-y-4">
          <div><FieldLabel label="版本标签" /><TextField onChange={v => onPatch({ versionTag: v })} placeholder="例如：v1.0、初稿、润色后" value={String(data.versionTag || '')} /></div>
          <div><FieldLabel label="归档格式" /><SelectField onChange={v => onPatch({ archiveFormat: v })} options={archiveFormatOptions} value={String(data.archiveFormat || 'markdown')} /></div>
          <div><FieldLabel label="归档路径" /><TextField onChange={v => onPatch({ archivePath: v })} placeholder="相对项目路径，留空使用默认" value={String(data.archivePath || '')} /></div>
          <div className="flex items-center justify-between"><FieldLabel label="归档前确认" helpText="需要用户确认后才执行归档" /><BooleanField onChange={v => onPatch({ archiveRequireApproval: v })} value={data.archiveRequireApproval !== false} /></div>
          <div className="flex items-center justify-between"><FieldLabel label="包含版本历史" /><BooleanField onChange={v => onPatch({ archiveIncludeHistory: v })} value={Boolean(data.archiveIncludeHistory)} /></div>
          <div><FieldLabel label="归档说明" /><TextareaField minRows={2} onChange={v => onPatch({ archiveNote: v })} placeholder="此版本的变更说明..." value={String(data.archiveNote || '')} /></div>
        </div>
      </div>
      <div>
        <SectionTitle icon="bug" title="调试" description="调试相关设置与工具" />
        <div className="space-y-4">
          <div className="flex items-center justify-between"><FieldLabel label="断点" helpText="运行到此节点暂停" /><BooleanField onChange={v => onPatch({ breakpoint: v })} value={Boolean(data.breakpoint)} /></div>
          <div><FieldLabel label="日志级别" /><SelectField onChange={v => onPatch({ logLevel: v })} options={logOptions} value={String(data.logLevel || 'info')} /></div>
          <div className="flex items-center justify-between"><FieldLabel label="保存输入输出快照" /><BooleanField onChange={v => onPatch({ saveSnapshots: v })} value={Boolean(data.saveSnapshots)} /></div>
          <button className="flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-700 transition-all hover:bg-violet-500/20 dark:text-violet-300" onClick={() => setShowPreview(true)} type="button"><Codicon name="eye" size={14} /> 预览最终 Prompt 与上下文</button>
        </div>
      </div>
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8" onClick={() => setShowPreview(false)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">预览</h3><button onClick={() => setShowPreview(false)} type="button"><Codicon name="close" size={20} /></button></div>
            <div className="space-y-4">
              <div>
                <h4 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">最终 Prompt</h4>
                <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-700 dark:bg-white/5 dark:text-slate-300">{String(data.promptConfig?.rolePrompt || '')}\n\n{String(data.promptConfig?.taskPromptTemplate || '(运行时生成)')}</pre>
              </div>
              <div>
                <h4 className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">上下文来源</h4>
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-400">运行时显示已加载的上下文资源列表</div>
              </div>
              <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-500 px-3 py-2 text-sm font-medium text-white hover:bg-violet-600" type="button"><Codicon name="play" size={14} /> 单节点测试运行</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function NodeSummary({ data, nodeDef, color, icon }: { data: Record<string, any>; nodeDef?: KarnaNodeDefinition; color: string; icon: string }) {
  const warnings: NodeWarning[] = Array.isArray(data.warnings) ? data.warnings : []
  const isAgentNode = data.nodeType === 'agent' && data.agent_id
  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-slate-200/70 bg-white/50 dark:border-white/10 dark:bg-white/5">
      <div className="h-1.5" style={{ backgroundColor: color }} />
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {isAgentNode ? (
              <div className="size-10 shrink-0 overflow-hidden rounded-xl">
                <AgentAvatar agentId={String(data.agent_id)} size={40} />
              </div>
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}20` }}>
                <Codicon name={icon} size={20} style={{ color }} />
              </div>
            )}
            <div>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{data.label || nodeDef?.displayName || '节点'}</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{nodeDef?.displayName || '节点'}</div>
            </div>
          </div>
        </div>
        {(data.locked || data.isStart || warnings.length > 0) && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.locked && <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400"><Codicon name="lock" size={12} /> 已锁定</span>}
            {data.isStart && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-600 dark:text-emerald-400"><Codicon name="play" size={12} /> 起始节点</span>}
            {warnings.filter(w => w.severity === 'error').map((w, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-600 dark:text-red-400"><Codicon name="error" size={12} /> {w.message}</span>)}
            {warnings.filter(w => w.severity === 'warning').slice(0, 2).map((w, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400"><Codicon name="warning" size={12} /> {w.message}</span>)}
          </div>
        )}
      </div>
    </div>
  )
}

export interface NodeInspectorTabsProps {
  node: { id: string; data: Record<string, any> }
  definition?: KarnaNodeDefinition
  schema: InspectorSectionSchema[]
  capabilities: NodeCapability[]
  data: Record<string, any>
  onPatch: (patch: Record<string, any>) => void
  resources: NodeResourceConfig
  nodeType: string
  color: string
  icon: string
}

export function NodeInspectorTabs({ node, definition, schema, capabilities, data, onPatch, resources, nodeType, color, icon }: NodeInspectorTabsProps) {
  const [activeTab, setActiveTab] = useState('basic')
  const visibleTabs = getVisibleTabs(capabilities, schema)

  useEffect(() => {
    if (!visibleTabs.find(t => t.id === activeTab)) {
      setActiveTab(visibleTabs[0]?.id || 'basic')
    }
  }, [node.id, visibleTabs, activeTab])

  const renderTabContent = () => {
    switch (activeTab) {
      case 'basic': return <BasicTab data={data} nodeId={node.id} onPatch={onPatch} />
      case 'model': return <ModelTab data={data} onPatch={onPatch} resources={resources} />
      case 'capabilities': return <CapabilitiesTab data={data} onPatch={onPatch} resources={resources} />
      case 'context': return <ContextTab data={data} onPatch={onPatch} resources={resources} />
      case 'soul': return <SoulTab data={data} onPatch={onPatch} resources={resources} />
      case 'runtime': return <RuntimeTab data={data} nodeType={nodeType} onPatch={onPatch} />
      case 'output': return <OutputTab data={data} onPatch={onPatch} />
      default: {
        const customSection = schema.find(s => s.id === activeTab)
        if (customSection) {
          return (
            <div className="space-y-4">
              {customSection.description && <div className="text-xs text-slate-500 dark:text-slate-400">{customSection.description}</div>}
              {customSection.fields.map(field => <SchemaField key={field.key} data={data} field={field} onPatch={onPatch} />)}
            </div>
          )
        }
        return null
      }
    }
  }

  return (
    <div className="flex flex-col">
      <NodeSummary color={color} data={data} icon={icon} nodeDef={definition} />
      <div className="mb-3 -mx-1 flex shrink-0 gap-0.5 overflow-x-auto border-b border-slate-200/70 pb-2 dark:border-white/10">
        {visibleTabs.map(tab => (
          <button
            key={tab.id}
            className={cn(
              'flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-200'
            )}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            <Codicon name={tab.icon} size={12} />
            {tab.label}
          </button>
        ))}
      </div>
      <div className="pr-1">
        {renderTabContent()}
      </div>
    </div>
  )
}
