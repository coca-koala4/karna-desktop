import { useCallback, useEffect, useMemo, useState } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'
import { getWriterOsModuleData, WRITER_OS_MODULES } from '@/lib/writer-os-api'

import { resolveWriterOsProfile } from './lib/writer-os-profile'
import { BenchmarkView } from './modules/benchmark-view'
import { CriticCouncilView } from './modules/critic-council-view'
import { KnowledgeGraphView } from './modules/knowledge-graph-view'
import { LivingWikiView } from './modules/living-wiki-view'
import { StoryBibleView } from './modules/story-bible-view'

interface WriterOsPanelProps {
  projectRef: string
  projectName: string
  documentType?: string | null
  formId?: string | null
}

const MODULE_META: Record<string, { icon: string; label: string; description: string }> = {
  'story-bible': { icon: 'book', label: '故事圣经', description: '人物、地点、设定管理' },
  'living-wiki': { icon: 'library', label: '活跃维基', description: '可回写的项目知识库' },
  'knowledge-graph': { icon: 'organization', label: '知识图谱', description: '实体关系可视化' },
  'narrative-state': { icon: 'pulse', label: '叙事状态', description: '角色关系与状态追踪' },
  'critic-council': { icon: 'comment-discussion', label: '批评委员会', description: '多视角审稿建议' },
  safety: { icon: 'shield', label: '安全检测', description: '内容安全与版权检测' },
  'creative-memory': { icon: 'history', label: '创作记忆', description: '历史创作经验库' },
  'creative-search': { icon: 'search', label: '创作搜索', description: '全文+向量+图谱检索' },
  documents: { icon: 'files', label: '文档管理', description: '稿件与章节管理' },
  rag: { icon: 'database', label: 'RAG 引擎', description: '检索增强生成状态' },
  benchmark: { icon: 'checklist', label: '基准测试', description: '项目成熟度评测' },
  guide: { icon: 'lightbulb', label: '引导向导', description: '项目初始化与修复' },
  delivery: { icon: 'package', label: '交付打包', description: '导出与发布' },
  verify: { icon: 'verified', label: '验证循环', description: '一致性校验' }
}

export function WriterOsPanel({ projectRef, projectName, documentType, formId }: WriterOsPanelProps) {
  const profile = useMemo(() => resolveWriterOsProfile(documentType, formId), [documentType, formId])

  const availableModules = useMemo(
    () => WRITER_OS_MODULES.filter(module => profile.moduleIds.includes(module.id)),
    [profile]
  )

  const [activeModule, setActiveModule] = useState<string | null>(availableModules[0]?.id || null)
  const [moduleData, setModuleData] = useState<unknown>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadModuleData = useCallback(async (moduleId: string) => {
    setLoading(true)
    setError(null)

    try {
      const data = await getWriterOsModuleData(projectRef, moduleId)

      setModuleData(data)
    } catch (err: any) {
      setError(err?.message || '加载失败')
      setModuleData(null)
    } finally {
      setLoading(false)
    }
  }, [projectRef])

  useEffect(() => {
    if (activeModule) {
      void loadModuleData(activeModule)
    }
  }, [activeModule, loadModuleData])

  useEffect(() => {
    setActiveModule(current => availableModules.some(module => module.id === current)
      ? current
      : availableModules[0]?.id || null)
    setModuleData(null)
  }, [projectRef, profile.documentType, formId, availableModules])

  return (
    <div className="flex h-full flex-col bg-(--ui-surface-secondary)">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-(--ui-stroke-secondary) px-3">
        <Codicon className="text-(--ui-color-accent)" name="circuit-board" size="0.875rem" />
        <span className="text-xs font-medium text-(--ui-text-secondary)">{profile.title}</span>
        <span className="ml-auto text-[10px] text-(--ui-text-quaternary)">
          {projectName}
        </span>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-44 shrink-0 overflow-auto border-r border-(--ui-stroke-secondary)">
          <div className="space-y-0.5 p-1">
            {availableModules.map(mod => {
              const baseMeta = MODULE_META[mod.id] || { icon: 'symbol-keyword', label: mod.id, description: '' }
              const meta = { ...baseMeta, label: profile.labels[mod.id] || baseMeta.label }

              return (
                <button
                  className={cn(
                    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors',
                    activeModule === mod.id
                      ? 'bg-(--ui-control-active-background) text-foreground'
                      : 'text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
                  )}
                  key={mod.id}
                  onClick={() => setActiveModule(mod.id)}
                  title={meta.description}
                  type="button"
                >
                  <Codicon name={meta.icon} size="0.875rem" />
                  <span className="flex-1 truncate text-xs">{meta.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex-1 min-w-0 overflow-auto">
          {loading && (
            <div className="flex h-full items-center justify-center p-4">
              <div className="flex items-center gap-2 text-xs text-(--ui-text-quaternary)">
                <Codicon className="codicon-modifier-spin" name="loading" />
                加载中...
              </div>
            </div>
          )}

          {error && (
            <div className="p-4">
              <div className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
                {error}
              </div>
            </div>
          )}

          {!loading && !error && moduleData !== null && (
            <div className="p-3">
              <ModuleDataView
                data={moduleData}
                labelOverride={activeModule ? profile.labels[activeModule] : undefined}
                moduleId={activeModule || ''}
              />
            </div>
          )}

          {!loading && !error && moduleData === null && (
            <div className="flex h-full items-center justify-center p-4 text-xs text-(--ui-text-quaternary)">
              暂无数据
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ModuleDataView({ data, moduleId, labelOverride }: { data: unknown; moduleId: string; labelOverride?: string }) {
  if (moduleId === 'story-bible' || moduleId === 'bible') {
    return <StoryBibleView data={data} />
  }

  if (moduleId === 'living-wiki' || moduleId === 'wiki') {
    return <LivingWikiView data={data} />
  }

  if (moduleId === 'knowledge-graph' || moduleId === 'graph') {
    return <KnowledgeGraphView data={data} />
  }

  if (moduleId === 'critic-council' || moduleId === 'critic') {
    return <CriticCouncilView data={data} />
  }

  if (moduleId === 'benchmark') {
    return <BenchmarkView data={data} />
  }

  const meta = MODULE_META[moduleId]
  const title = labelOverride || meta?.label || moduleId

  if (typeof data === 'object' && data !== null) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {meta && <Codicon name={meta.icon} size="1rem" />}
          <h3 className="text-sm font-medium">{title}</h3>
        </div>
        <JsonDataView data={data} />
      </div>
    )
  }

  return <pre className="rounded bg-(--ui-surface-tertiary) p-3 text-xs">{String(data)}</pre>
}

function JsonDataView({ data }: { data: unknown }) {
  const jsonStr = JSON.stringify(data, null, 2)

  return (
    <pre className="max-h-[500px] overflow-auto rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-tertiary) p-3 font-mono text-xs leading-relaxed">
      <code className="text-(--ui-text-secondary)">{jsonStr}</code>
    </pre>
  )
}
