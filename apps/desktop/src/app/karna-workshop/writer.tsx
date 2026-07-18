import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useDialogFocus } from '@/lib/use-dialog-focus'
import { writerOsApiPath } from '@/lib/writer-os-contract'
import type { WorkbenchProfile } from '@/lib/writer-catalog/workbench-types'
import { ALL_MODULES } from '@/lib/writer-catalog/capability-packs'

import { ForceGraph, type GraphData, type GraphEdge, type GraphNode } from './writer-panels/force-graph'
import { Timeline, type TimelineEvent } from './writer-panels/timeline'
import { WorkbenchSidebar } from './workbench-sidebar'
import { WorkbenchHome } from './workbench-home'
import { NewProjectWizard } from '../projects/new-project-wizard'

type WriterTab = string

interface WriterProject {
  id: string
  slug?: string
  title: string
  genre?: string
  type?: string
  folder: string
  updated_at?: string
  word_count?: number
  status?: string
  pinned?: boolean
}

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  return window.karnaDesktop.api<T>({ path, method, body })
}

const projectRef = (project: WriterProject | null) => project?.slug || project?.id || ''

const ONBOARDING_KEY = 'karna-writer-onboarding-v1'

function WriterWelcomeModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose)

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div aria-labelledby="writer-welcome-title" aria-modal="true" className="bg-card border border-border rounded-2xl w-full max-w-2xl p-8 shadow-2xl" onClick={e => e.stopPropagation()} ref={dialogRef} role="dialog" tabIndex={-1}>
        <div className="text-center mb-6">
          <Codicon className="text-[var(--theme-primary)] mx-auto mb-4" name="pen" size={48} />
          <h2 className="text-2xl font-bold text-[var(--theme-foreground)] mb-2" id="writer-welcome-title">欢迎来到 Karna 作品工坊</h2>
          <p className="text-[var(--theme-foreground)]/70 text-sm">
            你的本地化AI创作操作系统，支持小说、剧本、论文、营销文案等全文字类型创作，从资料整理到一键导出，让创作更高效。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60">
            <Codicon className="text-[var(--theme-primary)] mb-2" name="book" size={24} />
            <div className="font-semibold text-[var(--theme-foreground)] mb-1">项目知识库</div>
            <div className="text-xs text-[var(--theme-foreground)]/60">管理人物、地点、术语、世界观等核心设定</div>
          </div>
          <div className="p-4 rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60">
            <Codicon className="text-[var(--theme-primary)] mb-2" name="git-branch" size={24} />
            <div className="font-semibold text-[var(--theme-foreground)] mb-1">知识图谱</div>
            <div className="text-xs text-[var(--theme-foreground)]/60">可视化实体关系网络，自动提取实体间关联</div>
          </div>
          <div className="p-4 rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60">
            <Codicon className="text-[var(--theme-primary)] mb-2" name="robot" size={24} />
            <div className="font-semibold text-[var(--theme-foreground)] mb-1">AI工作流</div>
            <div className="text-xs text-[var(--theme-foreground)]/60">多智能体协作写作，专业评审提供针对性反馈</div>
          </div>
          <div className="p-4 rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60">
            <Codicon className="text-[var(--theme-primary)] mb-2" name="package" size={24} />
            <div className="font-semibold text-[var(--theme-foreground)] mb-1">产物导出</div>
            <div className="text-xs text-[var(--theme-foreground)]/60">一键导出完整作品包，包含所有资料和内容</div>
          </div>
        </div>
        <div className="flex flex-col items-center gap-3">
          <button
            className="w-full py-3 bg-[var(--theme-primary)] hover:opacity-90 text-white font-medium rounded-xl transition"
            onClick={onClose}
          >
            开始创作
          </button>
          <button
            className="text-sm text-[var(--theme-foreground)]/50 hover:text-[var(--theme-foreground)]/80 transition"
            onClick={onClose}
          >
            跳过
          </button>
        </div>
      </div>
    </div>
  )
}

export function WriterWorkshopFullView() {
  const [projects, setProjects] = useState<WriterProject[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<WriterTab>('dashboard')
  const [loading, setLoading] = useState(true)
  const [projectData, setProjectData] = useState<any>(null)
  const [osData, setOsData] = useState<Record<string, any>>({})
  const [loadingModule, setLoadingModule] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [error, setError] = useState('')
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false)
  const [showWelcome, setShowWelcome] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)
  const [importAfterCreate, setImportAfterCreate] = useState(false)
  const [workbenchData, setWorkbenchData] = useState<any>(null)
  const [workbenchProfile, setWorkbenchProfile] = useState<WorkbenchProfile | null>(null)
  const [workbenchSummary, setWorkbenchSummary] = useState<any>(null)
  const [workbenchLoading, setWorkbenchLoading] = useState(false)

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true)
      const data = await api<{ projects?: WriterProject[]; active_project_id?: string }>('/api/writer/projects')
      setProjects(data.projects || [])

      if (data.active_project_id) {setActiveProjectId(data.active_project_id)}
    } catch (e: any) { setError(e.message || String(e)) } finally { setLoading(false) }
  }, [])

  useEffect(() => { void loadProjects() }, [loadProjects])

  useEffect(() => {
    try {
      const hasOnboarded = localStorage.getItem(ONBOARDING_KEY)

      if (!hasOnboarded) {
        setShowWelcome(true)
      }
    } catch {
      // localStorage may be unavailable in embedded previews.
    }
  }, [])

  const closeWelcome = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDING_KEY, '1')
    } catch {
      // Persisting onboarding state is best effort only.
    }

    setShowWelcome(false)
  }, [])

  const reopenWelcome = useCallback(() => {
    setShowWelcome(true)
    setActiveTab('guide')
  }, [])

  useEffect(() => {
    const handleProjectsChanged = () => {
      void loadProjects()
    }

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        void loadProjects()
      }
    }

    window.addEventListener('karna:projects-changed', handleProjectsChanged)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('karna:projects-changed', handleProjectsChanged)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadProjects])

  const activeProject = useMemo(() => projects.find((p: any) => p.id === activeProjectId) || projects[0] || null, [projects, activeProjectId])

  const loadProjectDetail = useCallback(async (id: string) => {
    try { const data = await api<any>(`/api/writer/projects/${encodeURIComponent(id)}`); setProjectData(data) } catch (e: any) { console.error('load project error:', e) }
  }, [])

  const loadWorkbench = useCallback(async (id: string) => {
    try {
      setWorkbenchLoading(true)
      const encodedId = encodeURIComponent(id)
      const [profileRes, summaryRes, legacyData] = await Promise.allSettled([
        api<any>(`/api/writer/projects/${encodedId}/workbench/profile`),
        api<any>(`/api/writer/projects/${encodedId}/workbench/summary`),
        api<any>(`/api/writer/projects/${encodedId}/workbench`)
      ])
      if (profileRes.status === 'fulfilled' && profileRes.value?.ok) {
        setWorkbenchProfile(profileRes.value.profile || null)
      }
      if (summaryRes.status === 'fulfilled' && summaryRes.value?.ok) {
        setWorkbenchSummary(summaryRes.value.summary || null)
      }
      if (legacyData.status === 'fulfilled') {
        setWorkbenchData(legacyData.value)
      }
    } catch (e: any) { console.error('load workbench error:', e) } finally { setWorkbenchLoading(false) }
  }, [])

  const loadModule = useCallback(async (module: string, action?: string) => {
    if (!activeProject) {return null}
    setLoadingModule(module)

    try {
      const url = writerOsApiPath(projectRef(activeProject), module, action)
      const data = await api<any>(url)
      setOsData(prev => ({ ...prev, [module]: data }))

      return data
    } catch (e: any) { console.error(`load ${module} error:`, e);

 return null } finally { setLoadingModule(null) }
  }, [activeProject])

  const runModule = useCallback(async (module: string, action?: string, body?: any) => {
    if (!activeProject) {return null}
    setLoadingModule(module)

    try {
      const url = writerOsApiPath(projectRef(activeProject), module, action)
      const data = await api<any>(url, 'POST', body)
      setOsData(prev => ({ ...prev, [module]: data }))

      return data
    } catch (e: any) { console.error(`run ${module} error:`, e);

 return null } finally { setLoadingModule(null) }
  }, [activeProject])

  useEffect(() => {
    if (activeProject) {
      void loadProjectDetail(activeProject.id)
      void loadWorkbench(activeProject.id)
      api(`/api/writer/projects/${encodeURIComponent(projectRef(activeProject))}/open`, 'POST').catch(() => {})
      window.dispatchEvent(new CustomEvent('karna:writer-project-changed', {
        detail: { projectId: activeProject.id, title: activeProject.title, folder: activeProject.folder }
      }))
    }
  }, [activeProject, loadProjectDetail, loadWorkbench])

  const LEGACY_BACKEND_MODULES = new Set([
    'bible', 'wiki', 'graph', 'state', 'critic', 'safety', 'memory',
    'search', 'documents', 'versions', 'rag', 'benchmark', 'guide', 'delivery',
    'bootstrap', 'loop', 'images'
  ])

  const TAB_TO_BACKEND_MODULE: Record<string, string> = {
    'character-graph': 'graph',
    'timeline': 'bible',
    'story-bible': 'bible',
    knowledge: 'wiki',
    entities: 'graph',
    'narrative-state': 'state',
    'critic-council': 'critic',
    review: 'safety',
    continuity: 'critic',
    structure: 'bible'
  }

  useEffect(() => {
    if (activeProject && activeTab !== 'dashboard') {
      const backendModule = TAB_TO_BACKEND_MODULE[activeTab] || activeTab

      if (LEGACY_BACKEND_MODULES.has(backendModule) && !osData[backendModule]) {
        void loadModule(backendModule)
      }

      if (activeTab === 'character-graph' && !osData['bible']) {void loadModule('bible')}
      if (activeTab === 'timeline' && !osData['state']) {void loadModule('state')}
      if (activeTab === 'continuity' && !osData['critic']) {void loadModule('critic')}
    }
  }, [activeProject, activeTab, loadModule, osData])

  const handleSelectProject = (id: string) => { setActiveProjectId(id); setOsData({}); setActiveTab('dashboard'); setWorkbenchProfile(null); setWorkbenchSummary(null) }

  const handleDeleteProject = async (id: string) => {
    if (!window.confirm('确定删除项目？')) {return}
    await api(`/api/writer/projects/${encodeURIComponent(id)}`, 'DELETE')

    if (activeProjectId === id) { setActiveProjectId(''); setProjectData(null); setOsData({}); setWorkbenchProfile(null); setWorkbenchSummary(null) }
    void loadProjects()
  }

  const handleCreateSample = async () => {
    try {
      const res = await api<any>('/api/writer/projects', 'POST', {
        title: '示例：星轨纪元',
        genre: '科幻',
        description: '一个AI辅助创作的示例科幻小说项目，包含人物设定、世界观和开篇章节。'
      })

      if (res?.project?.id) {
        setActiveProjectId(res.project.id)
        setOsData({})
        setWorkbenchProfile(null)
        setWorkbenchSummary(null)
        setActiveTab('dashboard')
        await loadProjects()
      }
    } catch (e: any) {
      setError(e.message || String(e))
    }
  }

  const handleNewProject = () => { setShowNewProject(true); setImportAfterCreate(false) }

  const handleImportFlow = () => { setShowNewProject(true); setImportAfterCreate(true) }

  const handleProjectCreated = (project: WriterProject) => {
    setShowNewProject(false)
    setActiveProjectId(project.id)
    setOsData({})
    setWorkbenchProfile(null)
    setWorkbenchSummary(null)
    setActiveTab('dashboard')
    void loadProjects()

    if (importAfterCreate) {
      setTimeout(() => setShowImport(true), 300)
    }
  }

  const tabs: { key: WriterTab; label: string; icon: string }[] = [
    { key: 'dashboard', label: '概览', icon: 'layout' },
    { key: 'bible', label: '故事圣经', icon: 'book' },
    { key: 'wiki', label: '活百科', icon: 'globe' },
    { key: 'graph', label: '知识图谱', icon: 'git-branch' },
    { key: 'character-graph', label: '人物关系图', icon: 'git-pull-request' },
    { key: 'timeline', label: '时间轴', icon: 'clock' },
    { key: 'state', label: '叙事状态', icon: 'pulse' },
    { key: 'critic', label: '评审委员会', icon: 'checklist' },
    { key: 'safety', label: '安全与版权', icon: 'shield' },
    { key: 'memory', label: '创作记忆', icon: 'database' },
    { key: 'search', label: '创意检索', icon: 'search' },
    { key: 'documents', label: '文档引擎', icon: 'files' },
    { key: 'versions', label: '版本', icon: 'history' },
    { key: 'rag', label: 'RAG索引', icon: 'book-open' },
    { key: 'benchmark', label: '基准测试', icon: 'zap' },
    { key: 'guide', label: '引导修复', icon: 'wrench' },
    { key: 'images', label: '插图', icon: 'device-camera' },
    { key: 'delivery', label: '交付', icon: 'package' }
  ]

  if (loading) {return <div className="p-8 text-center text-muted-foreground">加载中...</div>}

  return (
    <div className="h-full flex flex-col bg-background text-foreground pt-(--titlebar-height)">
      <header className="border-b border-border bg-card/50 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Codicon className="text-[var(--theme-primary)]" name="pen" size={20} />
            <span className="text-lg font-bold">{workbenchProfile?.labels?.workbenchTitle || '作品工坊'}</span>
          </div>
          {activeProject && (
            <DropdownMenu onOpenChange={setProjectDropdownOpen} open={projectDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button className="gap-2" size="sm" variant="outline">
                  <span className="font-medium">{activeProject.title}</span>
                  <Codicon name="chevron-down" size={14} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-64">
                <div className="px-2 py-1.5 text-xs text-muted-foreground">切换项目</div>
                {projects.map((p: any) => (
                  <DropdownMenuItem
                    className={activeProjectId === p.id ? 'bg-primary/10' : ''}
                    key={p.id}
                    onSelect={() => handleSelectProject(p.id)}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium text-sm">{p.title}</span>
                      <span className="text-xs text-muted-foreground">{p.genre || p.type || '未分类'}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {activeProject && (
          <div className="flex items-center gap-2">
            <button
              className="w-8 h-8 flex items-center justify-center rounded-full border border-[var(--dt-border)] text-[var(--theme-foreground)]/70 hover:text-[var(--theme-primary)] hover:border-[var(--theme-primary)]/50 transition"
              onClick={reopenWelcome}
              title="帮助与向导"
            >
              ?
            </button>
            <Button onClick={() => setShowImport(true)} size="sm" variant="outline">导入稿件</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Codicon name="more-horizontal" size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => runModule('bootstrap')}>
                  <Codicon className="mr-2" name="settings" size={14} />
                  <span>一键初始化</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-red-500 focus:text-red-500"
                  onSelect={() => handleDeleteProject(activeProject.id)}
                >
                  <Codicon className="mr-2" name="trash" size={14} />
                  <span>删除项目</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </header>

      <main className="flex-1 flex overflow-hidden">
        {!activeProject ? (
          <EmptyState onImport={handleImportFlow} onNewProject={handleNewProject} onSample={handleCreateSample} />
        ) : (
          <>
            <WorkbenchSidebar
              activeTab={activeTab}
              onTabChange={(tab) => setActiveTab(tab as WriterTab)}
              profile={workbenchProfile}
              currentPhase={workbenchSummary?.phase?.current || workbenchData?.phase?.current}
              phaseProgress={workbenchSummary?.phase?.progress || workbenchData?.phase?.progress}
            />

            <div className="flex-1 flex flex-col overflow-hidden">
              {activeTab === 'dashboard' ? (
                workbenchLoading ? (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
                    加载中...
                  </div>
                ) : (
                  <WorkbenchHome
                    workbench={workbenchSummary || workbenchData}
                    profile={workbenchProfile}
                    osData={osData}
                    onNavigate={(tab, entityId) => setActiveTab(tab as WriterTab)}
                  />
                )
              ) : (
                <div className="flex-1 overflow-y-auto p-6">
                  {loadingModule === activeTab && <div className="text-primary text-sm mb-4 flex items-center gap-2"><Codicon name="loading" size={14} className="animate-spin" /> 加载中...</div>}
                  {(() => {
                    const backendModule = TAB_TO_BACKEND_MODULE[activeTab] || activeTab
                    const tabData = LEGACY_BACKEND_MODULES.has(backendModule) ? (osData[backendModule] || osData[activeTab]) : osData[activeTab]
                    return renderTab(activeTab, activeProject, tabData, osData, runModule, loadModule, projectRef(activeProject), reopenWelcome, workbenchProfile)
                  })()}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {showImport && activeProject && <ImportModal onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); void loadProjects(); void loadProjectDetail(activeProject.id) }} project={activeProject} />}
      {showWelcome && <WriterWelcomeModal onClose={closeWelcome} />}
      {showNewProject && <NewProjectWizard onClose={() => { setShowNewProject(false); setImportAfterCreate(false) }} onCreated={handleProjectCreated as any} open={showNewProject} />}
      {error && (
        <div className="fixed bottom-4 right-4 bg-destructive/90 border border-destructive text-destructive-foreground px-4 py-3 rounded-lg text-sm">
          {error}
          <button className="ml-3 opacity-70" onClick={() => setError('')}>×</button>
        </div>
      )}
    </div>
  )
}

function EmptyState({ onNewProject, onImport, onSample }: { onNewProject: () => void; onImport: () => void; onSample: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center max-w-lg">
        <Codicon className="text-[var(--theme-primary)]/60 mb-4 mx-auto" name="pen" size={64} />
        <h2 className="text-2xl font-bold mb-2 text-[var(--theme-foreground)]">欢迎使用 作品工坊</h2>
        <p className="text-[var(--theme-foreground)]/60 mb-8">你的本地化全文字类型创作工坊，支持小说、剧本、论文、营销文案等多种创作形式，内置知识库、知识图谱、AI工作流等辅助功能。</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center mb-4">
          <Button className="bg-[var(--theme-primary)] hover:opacity-90 gap-2" onClick={onNewProject} size="lg">
            <Codicon name="add" size={16} /> 新建作品
          </Button>
          <Button className="gap-2" onClick={onImport} size="lg" variant="outline">
            <Codicon name="cloud-upload" size={16} /> 导入资料
          </Button>
          <Button className="gap-2" onClick={onSample} size="lg" variant="secondary">
            <Codicon name="play-circle" size={16} /> 运行示例
          </Button>
        </div>
        <p className="text-xs text-[var(--theme-foreground)]/40">创建项目后将自动初始化作品工坊目录结构</p>
      </div>
    </div>
  )
}

function ModulePlaceholder({ moduleId, data, onRun, onLoad, allOsData, projectRef: ref, project }: { moduleId: string; data?: any; onRun: (m: string, a?: string, b?: any) => Promise<any>; onLoad: (m: string, a?: string) => Promise<any>; allOsData?: any; projectRef: string; project?: any }) {
  const moduleDef = ALL_MODULES.find(m => m.id === moduleId)

  if (!moduleDef) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center py-16">
        <Codicon className="text-muted-foreground/40 mb-4" name="circle-outline" size={48} />
        <h3 className="text-lg font-medium text-muted-foreground">模块开发中</h3>
        <p className="text-sm text-muted-foreground/70 mt-2">此功能正在建设中，将在后续版本中推出</p>
      </div>
    )
  }

  const reusedView = (() => {
    if (moduleId === 'knowledge-graph' || moduleId === 'glossary') {
      return <GraphView allData={allOsData} data={allOsData?.graph} onLoad={onLoad} onRun={onRun} project={project} projectRef={ref} />
    }
    if (moduleId === 'scene-list' || moduleId === 'branch-map' || moduleId === 'clause-matrix' || moduleId === 'argument-tree' || moduleId === 'evidence-matrix' || moduleId === 'api-reference' || moduleId === 'milestones' || moduleId === 'stakeholders' || moduleId === 'character-dossier') {
      return null
    }
    return null
  })()

  if (reusedView) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold flex items-center gap-2 text-foreground">
            <Codicon className="text-[var(--theme-primary)]" name={moduleDef.icon as any} size={20} />
            {moduleDef.title}
          </h3>
          <div className="flex gap-2">
            {moduleDef.actions.filter(a => a.method === 'POST').map(action => (
              <Button key={action.id} onClick={() => onRun(moduleId, action.id)} size="sm" variant="outline">
                <Codicon className="mr-1" name="sparkles" size={14} />
                {action.label}
              </Button>
            ))}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{moduleDef.description}</p>
        {reusedView}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-xl font-semibold flex items-center gap-2 text-foreground">
            <Codicon className="text-[var(--theme-primary)]" name={moduleDef.icon as any} size={20} />
            {moduleDef.title}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">{moduleDef.description}</p>
        </div>
        <div className="flex gap-2">
          {moduleDef.actions.map(action => (
            <Button
              key={action.id}
              onClick={() => action.method === 'POST' ? onRun(moduleId, action.id) : onLoad(moduleId, action.id)}
              size="sm"
              variant={action.method === 'POST' ? 'default' : 'outline'}
            >
              <Codicon className="mr-1" name={action.method === 'POST' ? 'sparkles' : 'refresh'} size={14} />
              {action.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card/50 p-8 text-center">
        <Codicon className="text-[var(--theme-primary)]/40 mx-auto mb-4" name={moduleDef.icon as any} size={48} />
        <h4 className="text-lg font-medium text-foreground mb-2">{moduleDef.title}</h4>
        <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
          {moduleDef.description}
        </p>
        <div className="flex flex-wrap gap-2 justify-center mb-6">
          {moduleDef.actions.map(action => (
            <span key={action.id} className="text-xs px-3 py-1.5 rounded-full bg-muted text-muted-foreground">
              <Codicon className="inline mr-1" name={action.method === 'POST' ? 'play' : 'file'} size={12} />
              {action.label}
            </span>
          ))}
        </div>
        <p className="text-xs text-muted-foreground/60">
          适用于：{moduleDef.applicableDocumentTypes.join(', ')}
        </p>
      </div>

      {data && (
        <div className="rounded-xl border border-border bg-card/50 p-6">
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <Codicon name="database" size={14} />
            模块数据
          </h4>
          <pre className="text-xs bg-muted/50 rounded-lg p-4 overflow-x-auto text-muted-foreground">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

function renderTab(tab: WriterTab, project: any, data: any, allOsData: any, run: (m: string, a?: string, b?: any) => Promise<any>, load: (m: string, a?: string) => Promise<any>, ref: string, onReopenGuide?: () => void, profile?: WorkbenchProfile | null) {
  switch (tab) {
    case 'dashboard': return <DashboardView onRun={run} osData={allOsData} project={project} projectRef={ref} />

    case 'bible': return <BibleView data={data} onRun={run} project={project} projectRef={ref} />

    case 'wiki': return <WikiView data={data} onLoad={load} onRun={run} />

    case 'graph': return <GraphView allData={allOsData} data={data} onLoad={load} onRun={run} project={project} projectRef={ref} />

    case 'character-graph': return <CharacterGraphView allData={allOsData} data={allOsData['graph']} onLoad={load} onRun={run} project={project} projectRef={ref} />

    case 'timeline': return <TimelineView allData={allOsData} data={allOsData['bible']} onLoad={load} onRun={run} project={project} projectRef={ref} />

    case 'state': return <NarrativeStateView data={data} onRun={run} />

    case 'critic': return <CriticView data={data} onRun={run} />

    case 'safety': return <SafetyView data={data} onRun={run} />

    case 'memory': return <MemoryView data={data} onRun={run} />

    case 'search': return <SearchView data={data} onRun={run} />

    case 'documents': return <DocumentsView data={data} onRun={run} />

    case 'versions': return <VersionsView projectRef={ref} />

    case 'rag': return <RagView data={data} onRun={run} />

    case 'benchmark': return <BenchmarkView data={data} onRun={run} />

    case 'guide': return <GuideView data={data} onReopenGuide={onReopenGuide} onRun={run} />

    case 'images': return <ImageStudioView />

    case 'delivery': return <DeliveryView allOsData={allOsData} data={data} onRun={run} project={project} projectRef={ref} />

    case 'story-bible': return <BibleView data={allOsData?.bible} onRun={run} project={project} projectRef={ref} />
    case 'knowledge': return <WikiView data={allOsData?.wiki} onLoad={load} onRun={run} />
    case 'entities': return <GraphView allData={allOsData} data={allOsData?.graph} onLoad={load} onRun={run} project={project} projectRef={ref} />
    case 'narrative-state': return <NarrativeStateView data={allOsData?.state} onRun={run} />
    case 'critic-council': return <CriticView data={allOsData?.critic} onRun={run} />
    case 'review': return <SafetyView data={allOsData?.safety} onRun={run} />
    case 'continuity': return <CriticView data={allOsData?.critic} onRun={run} />

    default: return <ModulePlaceholder allOsData={allOsData} data={data} moduleId={tab} onLoad={load} onRun={run} project={project} projectRef={ref} />
  }
}

function DashboardView({ project, osData, onRun, projectRef: ref }: any) {
  const [fileTree, setFileTree] = useState<any[]>([])
  const [loadingTree, setLoadingTree] = useState(false)

  useEffect(() => {
    const loadTree = async () => {
      if (!ref) {return}
      setLoadingTree(true)

      try {
        const data = await api<any>(`/api/writer/projects/${encodeURIComponent(ref)}/tree`, 'GET')
        setFileTree(data.tree || [])
      } catch {
        setFileTree([])
      } finally {
        setLoadingTree(false)
      }
    }

    void loadTree()
  }, [ref])

  const stats = useMemo(() => {
    const bible = osData['bible']?.story_bible || {}
    const wiki = osData['wiki']?.wiki || {}
    const graph = osData['graph']?.graph || osData['graph'] || {}
    const state = osData['state']?.state || {}
    const critics = osData['critic']?.council || {}
    const docs = osData['documents']?.stats || {}
    const timeline = bible.timeline || []

    return [
      { label: '角色', value: bible.characters?.length || 0, icon: 'person' },
      { label: '章节', value: bible.chapters?.length || 0, icon: 'file' },
      { label: '时间轴事件', value: timeline.length || 0, icon: 'clock' },
      { label: 'Wiki页面', value: wiki.pages?.length || 0, icon: 'globe' },
      { label: '图谱节点', value: graph.stats?.nodes || graph.nodes?.length || 0, icon: 'circle-large-outline' },
      { label: '图谱关系', value: graph.stats?.edges || graph.edges?.length || 0, icon: 'git-pull-request' },
      { label: '叙事线索', value: state.threads?.length || 0, icon: 'link' },
      { label: '评审报告', value: critics.reports?.length || 0, icon: 'checklist' },
      { label: '文档', value: docs.documents || 0, icon: 'files' },
      { label: '段落节点', value: docs.nodes || 0, icon: 'list-tree' }
    ]
  }, [osData])

  const formatDate = (dateStr?: string) => {
    if (!dateStr) {return null}

    try {
      const d = new Date(dateStr)

      if (isNaN(d.getTime())) {return null}

      return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return null
    }
  }

  const lastModified = formatDate(project?.updated_at)

  const bootstrapAll = async () => {
    await onRun('bootstrap')

    for (const m of ['bible', 'wiki', 'graph', 'state', 'documents', 'rag', 'critic']) {await onRun(m)}
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-5 gap-4">
        {stats.map(s => (
          <div className="rounded-xl p-4 border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80" key={s.label}>
            <div className="flex items-center justify-between mb-2">
              <Codicon className="text-[var(--theme-primary)]/60" name={s.icon as any} size={16} />
            </div>
            <div className="text-3xl font-bold text-[var(--theme-foreground)]">{s.value}</div>
            <div className="text-sm mt-1 text-[var(--theme-foreground)]/60">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-[var(--theme-foreground)]">
          <Codicon className="text-[var(--theme-primary)]" name="rocket" size={18} />
          快速开始
        </h3>
        <div className="grid grid-cols-4 gap-4">
          <button className="p-4 border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 rounded-xl hover:border-[var(--theme-primary)]/40 hover:bg-[var(--theme-card-seed)]/80 transition text-left" onClick={bootstrapAll}>
            <Codicon className="text-[var(--theme-primary)] mb-2" name="zap" size={20} />
            <div className="font-semibold text-[var(--theme-foreground)]">一键初始化所有模块</div>
            <div className="text-xs text-[var(--theme-foreground)]/60 mt-1">自动构建圣经、百科、图谱、状态等</div>
          </button>
          <button className="p-4 border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 rounded-xl hover:border-[var(--theme-primary)]/40 hover:bg-[var(--theme-card-seed)]/80 transition text-left" onClick={() => onRun('loop')}>
            <Codicon className="text-[var(--theme-primary)] mb-2" name="check-circle" size={20} />
            <div className="font-semibold text-[var(--theme-foreground)]">循环完整性验证</div>
            <div className="text-xs text-[var(--theme-foreground)]/60 mt-1">检查所有Writer OS模块状态</div>
          </button>
          <button className="p-4 border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 rounded-xl hover:border-[var(--theme-primary)]/40 hover:bg-[var(--theme-card-seed)]/80 transition text-left" onClick={() => onRun('delivery')}>
            <Codicon className="text-[var(--theme-primary)] mb-2" name="package" size={20} />
            <div className="font-semibold text-[var(--theme-foreground)]">构建交付包</div>
            <div className="text-xs text-[var(--theme-foreground)]/60 mt-1">打包所有作品数据用于交付</div>
          </button>
          <button
            className="p-4 border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 rounded-xl hover:border-[var(--theme-primary)]/40 hover:bg-[var(--theme-card-seed)]/80 transition text-left"
            onClick={() => {
              window.dispatchEvent(new CustomEvent('karna:writer-project-changed', {
                detail: { projectId: project.id, title: project.title, folder: project.folder }
              }))
              window.location.hash = '#/new'
            }}
          >
            <Codicon className="text-[var(--theme-primary)] mb-2" name="comment" size={20} />
            <div className="font-semibold text-[var(--theme-foreground)]">打开项目对话</div>
            <div className="text-xs text-[var(--theme-foreground)]/60 mt-1">在聊天中使用当前项目上下文</div>
          </button>
        </div>
      </div>

      <SpeakPanel />

      <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-[var(--theme-foreground)]">
          <Codicon className="text-[var(--theme-primary)]" name="folder" size={18} />
          项目信息
        </h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-[var(--theme-foreground)]/60">项目ID：</span><code className="text-[var(--theme-foreground)]/80">{project.id}</code></div>
          <div><span className="text-[var(--theme-foreground)]/60">路径：</span><code className="text-[var(--theme-foreground)]/80 break-all">{project.folder}</code></div>
          <div><span className="text-[var(--theme-foreground)]/60">类型：</span>{project.genre || project.type || '未设置'}</div>
          <div><span className="text-[var(--theme-foreground)]/60">字数：</span>{(project.word_count || 0).toLocaleString()}</div>
          {lastModified && (
            <div className="col-span-2 flex items-center gap-2 pt-2 border-t border-[var(--dt-border)]">
              <Codicon className="text-[var(--theme-primary)]/60" name="clock" size={14} />
              <span className="text-[var(--theme-foreground)]/60">最近修改：</span>
              <span className="text-[var(--theme-foreground)]">{lastModified}</span>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-[var(--theme-foreground)]">
          <Codicon className="text-[var(--theme-primary)]" name="files" size={18} />
          项目文件
        </h3>
        {loadingTree ? (
          <div className="text-sm text-[var(--theme-foreground)]/60">加载中...</div>
        ) : fileTree.length > 0 ? (
          <FileTree items={fileTree} />
        ) : (
          <div className="text-sm text-[var(--theme-foreground)]/60">暂无文件</div>
        )}
      </div>
    </div>
  )
}

function BibleView({ project, data, onRun, projectRef: ref }: any) {
  const bible = data?.story_bible || { characters: [], locations: [], chapters: [], world_rules: [], foreshadows: [], timeline: [] }
  const [activeSection, setActiveSection] = useState('characters')
  const [editing, setEditing] = useState<any>(null)
  const [showAdd, setShowAdd] = useState(false)

  const bibleApi = async (action: string, body?: any) => {
    return api(`/api/writer/projects/${encodeURIComponent(ref)}/os/story-bible`, 'POST', { action, ...body })
  }

  const refresh = async () => { window.location.reload() }

  const handleSaveItem = async (section: string, item: any) => {
    await bibleApi('upsert', { section, item })
    setEditing(null); setShowAdd(false)
    await onRun('bible')
  }

  const handleDeleteItem = async (section: string, itemId: string) => {
    if (!window.confirm('确定删除？')) {return}
    await bibleApi('delete', { section, item_id: itemId })
    await onRun('bible')
  }

  const sections = [
    { key: 'characters', label: '人物', icon: 'person' },
    { key: 'locations', label: '地点', icon: 'map' },
    { key: 'chapters', label: '章节', icon: 'file' },
    { key: 'world_rules', label: '世界观', icon: 'globe' },
    { key: 'foreshadows', label: '伏笔', icon: 'eye' },
    { key: 'timeline', label: '时间线', icon: 'clock' },
  ]

  const currentItems = (bible as any)[activeSection] || []

  const getItemName = (item: any) => item.name || item.title || item.event || item.chapter || '未命名'
  const getItemDesc = (item: any) => item.description || item.summary || item.role || ''

  return (
    <div className="space-y-4 h-[calc(100vh-280px)] flex flex-col">
      <div className="flex items-center justify-between flex-shrink-0">
        <h3 className="text-xl font-semibold flex items-center gap-2 text-[var(--theme-foreground)]">
          <Codicon className="text-[var(--theme-primary)]" name="book" size={20} />
          故事圣经
        </h3>
        <div className="flex gap-2">
          <Button className="border-[var(--dt-border)] text-[var(--theme-foreground)] hover:border-[var(--theme-primary)]/50" onClick={() => setShowAdd(true)} size="sm" variant="outline"><Codicon name="plus" size={14} /> 添加</Button>
          <Button className="bg-[var(--theme-primary)] hover:opacity-90" onClick={() => onRun('bible')} size="sm"><Codicon className="mr-1" name="sparkles" size={14} /> AI分析重建</Button>
        </div>
      </div>

      <div className="flex gap-2 flex-shrink-0">
        {sections.map(s => (
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${activeSection === s.key ? 'bg-[var(--theme-primary)] text-[var(--theme-primary-foreground)]' : 'bg-[var(--theme-card-seed)]/60 text-[var(--theme-foreground)]/60 hover:bg-[var(--theme-card-seed)]/80 hover:text-[var(--theme-foreground)] border border-[var(--dt-border)]'}`}
            key={s.key}
            onClick={() => setActiveSection(s.key)}
          >
            <Codicon name={s.icon as any} size={14} />{s.label} <span className="opacity-60">({((bible as any)[s.key] || []).length})</span>
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {currentItems.length ? currentItems.map((item: any, i: number) => (
            <div className="bg-card/60 border border-border rounded-xl p-4 hover:border-indigo-500/30 transition group" key={item.id || i}>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{getItemName(item)}</div>
                  {getItemDesc(item) && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{getItemDesc(item)}</p>}
                  {activeSection === 'characters' && item.traits?.length > 0 && (
                    <div className="flex gap-1 mt-2 flex-wrap">{item.traits.slice(0, 3).map((t: string, j: number) => <span className="text-xs bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] px-2 py-0.5 rounded-full" key={j}>{t}</span>)}</div>
                  )}
                  {activeSection === 'foreshadows' && item.status && (
                    <div className={`text-xs mt-2 flex items-center gap-1 ${item.status === 'resolved' ? 'text-green-500' : 'text-amber-500'}`}>
                      <Codicon name={item.status === 'resolved' ? 'check-circle' : 'clock'} size={12} />
                      {item.status === 'resolved' ? '已回收' : '未回收'}
                    </div>
                  )}
                  {activeSection === 'timeline' && (
                    <div className="text-xs text-[var(--theme-primary)] mt-2 font-mono">{item.time || item.chapter || ''}</div>
                  )}
                  {activeSection === 'characters' && item.relationships?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.relationships.slice(0, 2).map((r: any, j: number) => (
                        <span className="text-xs bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] px-1.5 py-0.5 rounded" key={j}>
                          {r.type || '→'} {(typeof r.target === 'string' ? r.target : r.target?.name) || r.with}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition ml-2">
                  <button className="text-xs px-2 py-1 bg-[var(--theme-card-seed)]/80 border border-[var(--dt-border)] hover:border-[var(--theme-primary)]/50 hover:text-[var(--theme-primary)] rounded transition" onClick={() => setEditing({ ...item, _section: activeSection })}><Codicon name="edit" size={12} /></button>
                  <button className="text-xs px-2 py-1 bg-[var(--theme-card-seed)]/80 border border-[var(--dt-border)] hover:border-red-500/50 hover:text-red-500 rounded transition" onClick={() => handleDeleteItem(activeSection, item.id || item.name)}><Codicon name="trash" size={12} /></button>
                </div>
              </div>
            </div>
          )) : (
            <div className="col-span-full text-center text-[var(--theme-foreground)]/60 py-16">
              <Codicon className="text-[var(--theme-primary)]/40 mb-3" name={sections.find(s => s.key === activeSection)?.icon as any} size={40} />
              <div className="text-sm">暂无{sections.find(s => s.key === activeSection)?.label}记录</div>
              <div className="text-xs mt-1">点击「AI分析重建」从稿件中提取，或手动添加</div>
            </div>
          )}
        </div>
      </div>

      {(editing || showAdd) && (
        <BibleItemEditor
          characters={bible.characters || []}
          item={editing}
          onClose={() => { setEditing(null); setShowAdd(false) }}
          onSave={(item: any) => handleSaveItem(activeSection, item)}
          section={activeSection}
        />
      )}
    </div>
  )
}

function BibleItemEditor({ section, item, onSave, onClose, characters }: any) {
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose)
  const isNew = !item?.id && !item?.name

  const [form, setForm] = useState({
    name: item?.name || item?.title || item?.event || '',
    description: item?.description || item?.summary || item?.role || '',
    chapter: item?.chapter || '',
    time: item?.time || '',
    status: item?.status || (section === 'foreshadows' ? 'open' : ''),
    type: item?.type || (section === 'timeline' ? 'event' : ''),
    traits: item?.traits?.join(', ') || '',
    location: typeof item?.location === 'string' ? item.location : (item?.location?.name || ''),
    relationships: item?.relationships || [],
  })

  const [newRel, setNewRel] = useState({ target: '', type: 'friend' })

  const addRelationship = () => {
    if (!newRel.target) {return}
    setForm(f => ({ ...f, relationships: [...(f.relationships || []), { ...newRel }] }))
    setNewRel({ target: '', type: 'friend' })
  }

  const handleSubmit = () => {
    if (!form.name.trim()) {
      window.alert('名称不能为空')

      return
    }

    const saved: any = { ...form }

    if (item?.id) {saved.id = item.id}

    if (form.traits) {saved.traits = form.traits.split(',').map((t: string) => t.trim()).filter(Boolean)}

    if (section === 'timeline') {
      saved.event = form.name
      saved.chapter = form.chapter || form.time
    }

    onSave(saved)
  }

  const sectionLabels: Record<string, string> = {
    characters: '人物', locations: '地点', chapters: '章节',
    world_rules: '世界观', foreshadows: '伏笔', timeline: '时间线事件',
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div aria-labelledby="bible-editor-title" aria-modal="true" className="bg-card border border-border rounded-xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()} ref={dialogRef} role="dialog" tabIndex={-1}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold flex items-center gap-2 text-[var(--theme-foreground)]" id="bible-editor-title">{isNew ? <><Codicon name="plus" size={16} /> 添加</> : <><Codicon name="edit" size={16} /> 编辑</>}{sectionLabels[section]}</h3>
          <button aria-label="关闭编辑器" className="text-muted-foreground hover:text-foreground text-xl" onClick={onClose}>×</button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-muted-foreground mb-1">名称 *</label>
            <input className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" onChange={e => setForm({ ...form, name: e.target.value })} placeholder={section === 'timeline' ? '发生了什么？' : '输入名称...'} value={form.name} />
          </div>
          {(section === 'timeline' || section === 'chapters') && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">章节/时间</label>
              <input className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" onChange={e => setForm({ ...form, chapter: e.target.value, time: e.target.value })} placeholder="例如：第3章" value={form.chapter || form.time} />
            </div>
          )}
          {section === 'foreshadows' && (
            <div>
              <label className="block text-sm text-muted-foreground mb-1">状态</label>
              <select className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" onChange={e => setForm({ ...form, status: e.target.value })} value={form.status}>
                <option value="open">未回收</option>
                <option value="resolved">已回收</option>
              </select>
            </div>
          )}
          {section === 'characters' && (
            <>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">性格特征（逗号分隔）</label>
                <input className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" onChange={e => setForm({ ...form, traits: e.target.value })} placeholder="勇敢, 机智, 冷漠" value={form.traits} />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">所在地点</label>
                <input className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" onChange={e => setForm({ ...form, location: e.target.value })} placeholder="例如：长安" value={form.location} />
              </div>
              <div>
                <label className="block text-sm text-muted-foreground mb-1">人物关系</label>
                <div className="space-y-2">
                  {form.relationships?.map((r: any, i: number) => (
                    <div className="flex gap-2 items-center" key={i}>
                      <span className="text-xs bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] px-2 py-1 rounded">{r.type}</span>
                      <span className="text-sm flex-1 text-[var(--theme-foreground)]">{typeof r.target === 'string' ? r.target : r.target?.name}</span>
                      <button className="text-red-500 text-xs" onClick={() => setForm(f => ({ ...f, relationships: f.relationships.filter((_: any, j: number) => j !== i) }))}>×</button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <select className="px-2 py-1.5 bg-[var(--theme-card-seed)]/60 border border-[var(--dt-border)] rounded text-sm text-[var(--theme-foreground)]" onChange={e => setNewRel({ ...newRel, type: e.target.value })} value={newRel.type}>
                      <option value="friend">朋友</option>
                      <option value="enemy">敌人</option>
                      <option value="family">家人</option>
                      <option value="lover">恋人</option>
                      <option value="mentor">师徒</option>
                      <option value="rival">对手</option>
                    </select>
                    <input className="flex-1 bg-[var(--theme-card-seed)]/60 border border-[var(--dt-border)] rounded px-2 py-1.5 text-sm text-[var(--theme-foreground)]" list="char-list" onChange={e => setNewRel({ ...newRel, target: e.target.value })} placeholder="对方名字" value={newRel.target} />
                    <datalist id="char-list">
                      {characters.filter((c: any) => c.name !== form.name).map((c: any) => <option key={c.id || c.name} value={c.name} />)}
                    </datalist>
                    <button className="px-3 py-1.5 bg-[var(--theme-primary)] hover:opacity-90 text-white text-sm rounded" onClick={addRelationship}>+</button>
                  </div>
                </div>
              </div>
            </>
          )}
          <div>
            <label className="block text-[var(--theme-foreground)]/60 mb-1 text-sm">描述</label>
            <textarea className="w-full bg-[var(--theme-card-seed)]/60 border border-[var(--dt-border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--theme-primary)] resize-none text-[var(--theme-foreground)]" onChange={e => setForm({ ...form, description: e.target.value })} placeholder="详细描述..." rows={3} value={form.description} />
          </div>
          <div className="flex gap-3 pt-2">
            <button className="flex-1 px-4 py-2 bg-[var(--theme-card-seed)]/60 hover:bg-[var(--theme-card-seed)]/80 border border-[var(--dt-border)] rounded-lg text-sm transition text-[var(--theme-foreground)]" onClick={onClose}>取消</button>
            <button className="flex-1 px-4 py-2 bg-[var(--theme-primary)] hover:opacity-90 disabled:bg-[var(--theme-foreground)]/20 disabled:cursor-not-allowed text-white rounded-lg text-sm transition" disabled={!form.name.trim()} onClick={handleSubmit}>{isNew ? '添加' : '保存'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function WikiView({ data, onRun }: any) {
  const wiki = data?.wiki || { pages: [], pending_updates: [] }
  const queue = wiki.pending_updates || []
  const [activePage, setActivePage] = useState<string | null>(null)
  const currentPage = wiki.pages?.find((p: any) => p.id === activePage) || wiki.pages?.[0]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold flex items-center gap-2 text-[var(--theme-foreground)]">
          <Codicon className="text-[var(--theme-primary)]" name="globe" size={20} />
          活百科 Living Wiki
        </h3>
        <div className="flex gap-2">
          <Button className="border-[var(--dt-border)] text-[var(--theme-foreground)] hover:border-[var(--theme-primary)]/50" onClick={() => onRun('wiki', '', { action: 'generate' })} size="sm" variant="outline"><Codicon className="mr-1" name="search" size={14} /> 生成更新建议</Button>
          {queue.length > 0 && <Button className="bg-[var(--theme-primary)] hover:opacity-90" onClick={() => onRun('wiki', '', { action: 'accept-all' })} size="sm"><Codicon className="mr-1" name="check" size={14} /> 全部接受 ({queue.length})</Button>}
        </div>
      </div>
      {queue.length > 0 && (
        <div className="border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 rounded-xl p-4">
          <h4 className="font-medium text-[var(--theme-foreground)]/80 mb-3 flex items-center gap-2"><Codicon className="text-[var(--theme-primary)]" name="list" size={16} /> 待审核更新 ({queue.length})</h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {queue.slice(0, 10).map((u: any, i: number) => (
              <div className="bg-[var(--theme-card-seed)]/60 rounded-lg p-3 flex items-center justify-between" key={i}>
                <div>
                  <span className="text-xs px-2 py-0.5 rounded bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] mr-2">{u.type || 'update'}</span>
                  <span className="text-sm text-[var(--theme-foreground)]">{u.title || u.entity}</span>
                </div>
                <div className="flex gap-1">
                  <button className="text-xs px-2 py-1 bg-[var(--theme-primary)] hover:opacity-90 rounded" onClick={() => onRun('wiki', '', { action: 'accept', id: u.id })}>接受</button>
                  <button className="text-xs px-2 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded" onClick={() => onRun('wiki', '', { action: 'reject', id: u.id })}>拒绝</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-4 gap-6">
        <div className="col-span-1 rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-3 max-h-[600px] overflow-y-auto">
          <div className="text-xs text-[var(--theme-foreground)]/60 uppercase tracking-wider px-2 mb-2">页面列表 ({wiki.pages?.length || 0})</div>
          <div className="space-y-0.5">
            {wiki.pages?.length ? wiki.pages.map((p: any) => (
              <button className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${currentPage?.id === p.id ? 'bg-[var(--theme-primary)]/10 text-[var(--theme-primary)]' : 'hover:bg-[var(--theme-card-seed)]/60 text-[var(--theme-foreground)]'}`} key={p.id} onClick={() => setActivePage(p.id)}>
                {p.title}
              </button>
            )) : <div className="text-center text-[var(--theme-foreground)]/60 py-8 text-sm">点击上方生成按钮创建百科页面</div>}
          </div>
        </div>
        <div className="col-span-3 rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-6 min-h-[400px]">
          {currentPage ? (
            <article>
              <h2 className="text-2xl font-bold mb-2">{currentPage.title}</h2>
              <div className="text-sm text-muted-foreground mb-4">
                <span className="px-2 py-0.5 bg-accent rounded mr-2">{currentPage.category || currentPage.type || '页面'}</span>
                更新于 {currentPage.updated_at ? new Date(currentPage.updated_at).toLocaleString() : '-'}
              </div>
              <div className="prose prose-invert max-w-none text-foreground/90 whitespace-pre-wrap">
                {currentPage.content || currentPage.summary || currentPage.description || JSON.stringify(currentPage, null, 2)}
              </div>
            </article>
          ) : <div className="text-muted-foreground text-center py-12">选择一个百科页面查看，或先生成更新</div>}
        </div>
      </div>
    </div>
  )
}

function normalizeGraphData(raw: any): GraphData {
  if (!raw) {return { nodes: [], edges: [] }}
  const g = raw.graph || raw

  const nodes: GraphNode[] = (g.nodes || []).map((n: any) => ({
    id: n.id,
    name: n.name || n.title || n.label || '?',
    type: n.type || n.entity_type || 'entity',
    description: n.description || n.summary || '',
    properties: n.properties || n.attributes || {},
    x: n.x, y: n.y,
    fx: n.fx, fy: n.fy,
  }))

  const nodeIds = new Set(nodes.map(n => n.id))

  const edges: GraphEdge[] = (g.edges || g.relations || g.links || []).map((e: any) => ({
    id: e.id,
    source: typeof e.source === 'object' ? e.source.id : (e.source || e.from),
    target: typeof e.target === 'object' ? e.target.id : (e.target || e.to),
    label: e.label || e.type || e.relation || 'related',
    type: e.type || e.relation || 'related',
    weight: e.weight || 1,
  })).filter((e: GraphEdge) => nodeIds.has(e.source as string) && nodeIds.has(e.target as string))

  return { nodes, edges }
}

function GraphView({ project, data, allData, onRun, onLoad, projectRef: ref }: any) {
  const [building, setBuilding] = useState(false)
  const graphData = useMemo(() => normalizeGraphData(data), [data])
  const bible = allData?.bible?.story_bible || {}
  const [activeTypes, setActiveTypes] = useState<string[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [editingNode, setEditingNode] = useState<GraphNode | null>(null)
  const [editDesc, setEditDesc] = useState('')

  const build = async () => { setBuilding(true); await onRun('graph'); setBuilding(false) }

  const refresh = async () => { await onLoad('graph') }

  const graphApi = async (action: string, body?: any) => {
    return api(`/api/writer/projects/${encodeURIComponent(ref)}/os/graph`, 'POST', { action, ...body })
  }

  const handleAddNode = async (node: Partial<GraphNode>) => {
    await graphApi('add-node', node)
    await refresh()
  }

  const handleUpdateNode = async (nodeId: string, patch: Partial<GraphNode>) => {
    await graphApi('update-node', { node_id: nodeId, patch })
    await refresh()
  }

  const handleDeleteNode = async (nodeId: string) => {
    if (!window.confirm('确定删除此节点及其所有连接？')) {return}
    await graphApi('delete-node', { node_id: nodeId })
    setSelectedNodeId(null)
    setEditingNode(null)
    await refresh()
  }

  const handleAddEdge = async (edge: Partial<GraphEdge>) => {
    await graphApi('add-edge', edge)
    await refresh()
  }

  const handleUpdateEdge = async (edgeId: string, patch: Partial<GraphEdge>) => {
    await graphApi('update-edge', { edge_id: edgeId, patch })
    await refresh()
  }

  const handleDeleteEdge = async (edgeId: string) => {
    await graphApi('delete-edge', { edge_id: edgeId })
    await refresh()
  }

  const handleNodeSelect = (node: GraphNode | null) => {
    setSelectedNodeId(node?.id || null)

    if (node) {
      setEditingNode(node)
      setEditDesc(node.description || '')
    } else {
      setEditingNode(null)
    }
  }

  const handleSaveDetail = async () => {
    if (editingNode) {
      await handleUpdateNode(editingNode.id, { description: editDesc })
      setEditingNode(null)
      setSelectedNodeId(null)
    }
  }

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    graphData.nodes.forEach(n => {
      counts[n.type] = (counts[n.type] || 0) + 1
    })

    return counts
  }, [graphData])

  const allTypes = useMemo(() => Object.keys(typeCounts), [typeCounts])

  useEffect(() => {
    if (activeTypes.length === 0 && allTypes.length > 0) {
      setActiveTypes(allTypes)
    }
  }, [allTypes])

  const toggleType = (type: string) => {
    setActiveTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    )
  }

  const nodeColor = (type: string) => {
    const colors: Record<string, string> = {
      character: '#f59e0b', person: '#f59e0b',
      location: '#10b981', place: '#10b981',
      event: '#8b5cf6',
      object: '#06b6d4', item: '#06b6d4',
      concept: '#ec4899', theme: '#ec4899',
      chapter: '#3b82f6',
      plot_point: '#ef4444',
      foreshadow: '#f97316',
      faction: '#14b8a6', organization: '#14b8a6',
    }

    return colors[type] || '#6366f1'
  }

  const nodeTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      character: '人物', person: '人物',
      location: '地点', place: '地点',
      event: '事件',
      object: '物品', item: '物品',
      concept: '概念', theme: '概念',
      chapter: '章节',
      plot_point: '情节点',
      foreshadow: '伏笔',
      faction: '组织', organization: '组织',
      entity: '其他',
    }

    return labels[type] || type
  }

  const selectedNode = graphData.nodes.find(n => n.id === selectedNodeId)

  const degrees = useMemo(() => {
    const inDeg: Record<string, number> = {}
    const outDeg: Record<string, number> = {}
    graphData.nodes.forEach(n => { inDeg[n.id] = 0; outDeg[n.id] = 0 })
    graphData.edges.forEach(e => {
      const sid = typeof e.source === 'string' ? e.source : e.source.id
      const tid = typeof e.target === 'string' ? e.target : e.target.id
      outDeg[sid] = (outDeg[sid] || 0) + 1
      inDeg[tid] = (inDeg[tid] || 0) + 1
    })

    return { inDeg, outDeg }
  }, [graphData])

  const stats = {
    nodes: graphData.nodes.length,
    edges: graphData.edges.length,
    types: new Set(graphData.nodes.map(n => n.type)).size,
    relTypes: new Set(graphData.edges.map(e => e.type)).size,
  }

  return (
    <div className="space-y-4 h-[calc(100vh-280px)] flex flex-col">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h3 className="text-xl font-semibold flex items-center gap-2 text-[var(--theme-foreground)]">
            <Codicon className="text-[var(--theme-primary)]" name="git-branch" size={20} />
            知识图谱
          </h3>
          <p className="text-xs text-[var(--theme-foreground)]/60 mt-1">拖拽移动节点 · 滚轮缩放 · 双击节点编辑 · 点击节点查看详情</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Codicon className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--theme-foreground)]/40" name="search" size={14} />
            <input
              className="pl-9 pr-3 py-1.5 bg-[var(--theme-card-seed)]/60 border border-[var(--dt-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--theme-primary)] w-56 text-[var(--theme-foreground)]"
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="搜索节点名称..."
              value={searchTerm}
            />
          </div>
          <Button className="border-[var(--dt-border)] text-[var(--theme-foreground)] hover:border-[var(--theme-primary)]/50" onClick={refresh} size="sm" variant="outline"><Codicon name="refresh" size={14} /> 刷新</Button>
          <Button className="bg-[var(--theme-primary)] hover:opacity-90" disabled={building} onClick={build} size="sm">{building ? '构建中...' : <><Codicon className="mr-1" name="sparkles" size={14} /> AI分析构建</>}</Button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 flex-shrink-0">
        <StatCard label="节点" value={stats.nodes} />
        <StatCard label="关系" value={stats.edges} />
        <StatCard label="实体类型" value={stats.types} />
        <StatCard label="关系类型" value={stats.relTypes} />
      </div>
      <div className="flex flex-wrap gap-2 flex-shrink-0">
        <span className="text-xs text-[var(--theme-foreground)]/60 flex items-center">类型筛选:</span>
        {allTypes.map(type => (
          <button
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition flex items-center gap-1 ${activeTypes.includes(type) ? 'text-white' : 'bg-[var(--theme-card-seed)]/60 text-[var(--theme-foreground)]/50 border border-[var(--dt-border)]'}`}
            key={type}
            onClick={() => toggleType(type)}
            style={activeTypes.includes(type) ? { backgroundColor: nodeColor(type) } : {}}
          >
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: activeTypes.includes(type) ? 'rgba(255,255,255,0.8)' : nodeColor(type) }} />
            {nodeTypeLabel(type)} ({typeCounts[type]})
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-4 gap-4">
        <div className="col-span-3 min-h-0">
          <ForceGraph
            data={graphData}
            filterTypes={activeTypes}
            onEdgeAdd={handleAddEdge}
            onEdgeDelete={handleDeleteEdge}
            onEdgeUpdate={handleUpdateEdge}
            onNodeAdd={handleAddNode}
            onNodeDelete={handleDeleteNode}
            onNodeSelect={handleNodeSelect}
            onNodeUpdate={handleUpdateNode}
            onRefresh={refresh}
            searchTerm={searchTerm}
            selectedNodeId={selectedNodeId}
          />
        </div>
        <div className="col-span-1 rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-4 overflow-y-auto">
          {selectedNode ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-lg font-bold text-[var(--theme-foreground)]">{selectedNode.name}</h4>
                  <span
                    className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: nodeColor(selectedNode.type) }}
                  >
                    {nodeTypeLabel(selectedNode.type)}
                  </span>
                </div>
                <button className="text-[var(--theme-foreground)]/40 hover:text-[var(--theme-foreground)]" onClick={() => handleNodeSelect(null)} aria-label="关闭">×</button>
              </div>
              <div>
                <label className="block text-xs text-[var(--theme-foreground)]/60 mb-1">描述</label>
                <textarea
                  className="w-full px-3 py-2 bg-[var(--theme-card-seed)]/60 border border-[var(--dt-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--theme-primary)] resize-none text-[var(--theme-foreground)]"
                  onChange={e => setEditDesc(e.target.value)}
                  placeholder="添加节点描述..."
                  rows={4}
                  value={editDesc}
                />
              </div>
              {selectedNode.properties && Object.keys(selectedNode.properties).length > 0 && (
                <div>
                  <label className="block text-xs text-[var(--theme-foreground)]/60 mb-2">属性</label>
                  <div className="space-y-1">
                    {Object.entries(selectedNode.properties).map(([k, v]) => (
                      <div className="flex gap-2 text-sm" key={k}>
                        <span className="text-[var(--theme-primary)] font-medium min-w-[60px]">{k}:</span>
                        <span className="text-[var(--theme-foreground)]/80 break-all">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-[var(--theme-card-seed)]/60 rounded-lg p-2">
                  <div className="text-lg font-bold text-[var(--theme-primary)]">{degrees.inDeg[selectedNode.id] || 0}</div>
                  <div className="text-xs text-[var(--theme-foreground)]/60">入度</div>
                </div>
                <div className="bg-[var(--theme-card-seed)]/60 rounded-lg p-2">
                  <div className="text-lg font-bold text-[var(--theme-primary)]">{degrees.outDeg[selectedNode.id] || 0}</div>
                  <div className="text-xs text-[var(--theme-foreground)]/60">出度</div>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  className="flex-1 px-3 py-2 bg-[var(--theme-primary)] hover:opacity-90 text-white text-sm font-medium rounded-lg transition"
                  onClick={handleSaveDetail}
                >
                  保存
                </button>
                <button
                  className="px-3 py-2 bg-red-500/80 hover:bg-red-500 text-white text-sm font-medium rounded-lg transition"
                  onClick={() => handleDeleteNode(selectedNode.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-12 text-[var(--theme-foreground)]/50">
              <Codicon className="mx-auto mb-2" name="circle-large-outline" size={32} />
              <div className="text-sm">点击图谱中的节点</div>
              <div className="text-xs mt-1">查看和编辑详情</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function CharacterGraphView({ project, data, allData, onRun, onLoad, projectRef: ref }: any) {
  const graphData = useMemo(() => {
    const full = normalizeGraphData(data)

    const charNodes = full.nodes.filter(n => {
      const t = (n.type || '').toLowerCase()

      return t.includes('character') || t.includes('person')
    })

    const charIds = new Set(charNodes.map(n => n.id))
    const connectedIds = new Set(charIds)
    const relevantEdges = full.edges.filter(e => charIds.has(e.source as string) || charIds.has(e.target as string))
    relevantEdges.forEach(e => { connectedIds.add(e.source as string); connectedIds.add(e.target as string) })
    const relevantNodes = full.nodes.filter(n => connectedIds.has(n.id))

    return { nodes: relevantNodes, edges: relevantEdges }
  }, [data])

  const bible = allData?.bible?.story_bible || {}
  const [building, setBuilding] = useState(false)

  const build = async () => { setBuilding(true); await onRun('graph'); setBuilding(false) }

  const refresh = async () => { await onLoad('graph') }

  const graphApi = async (action: string, body?: any) => {
    return api(`/api/writer/projects/${encodeURIComponent(ref)}/os/graph`, 'POST', { action, ...body })
  }

  const handleAddNode = async (node: Partial<GraphNode>) => {
    await graphApi('add-node', { ...node, type: 'character' })
    await refresh()
  }

  const handleUpdateNode = async (nodeId: string, patch: Partial<GraphNode>) => {
    await graphApi('update-node', { node_id: nodeId, patch })
    await refresh()
  }

  const handleDeleteNode = async (nodeId: string) => {
    if (!window.confirm('确定删除此人物及其所有关系？')) {return}
    await graphApi('delete-node', { node_id: nodeId })
    await refresh()
  }

  const handleAddEdge = async (edge: Partial<GraphEdge>) => {
    await graphApi('add-edge', edge)
    await refresh()
  }

  const handleDeleteEdge = async (edgeId: string) => {
    await graphApi('delete-edge', { edge_id: edgeId })
    await refresh()
  }

  const charCount = graphData.nodes.filter(n => { const t = (n.type||'').toLowerCase();

 return t.includes('character')||t.includes('person') }).length

  return (
    <div className="space-y-4 h-[calc(100vh-280px)] flex flex-col">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h3 className="text-xl font-semibold flex items-center gap-2 text-[var(--theme-foreground)]">
            <Codicon className="text-[var(--theme-primary)]" name="git-pull-request" size={20} />
            人物关系图
          </h3>
          <p className="text-xs text-[var(--theme-foreground)]/60 mt-1">专门展示人物之间的关系网络 · 拖拽调整位置 · 双击编辑人物信息</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-sm text-[var(--theme-foreground)]/60 mr-2 flex items-center gap-1"><Codicon name="person" size={14} /> {charCount} 个人物</div>
          <Button className="border-[var(--dt-border)] text-[var(--theme-foreground)] hover:border-[var(--theme-primary)]/50" onClick={refresh} size="sm" variant="outline"><Codicon name="refresh" size={14} /> 刷新</Button>
          <Button className="bg-[var(--theme-primary)] hover:opacity-90" disabled={building} onClick={build} size="sm">{building ? '分析中...' : <><Codicon className="mr-1" name="sparkles" size={14} /> AI分析人物</>}</Button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 flex-shrink-0">
        <StatCard label="人物" value={charCount} />
        <StatCard label="人物关系" value={graphData.edges.length} />
        <StatCard label="关联地点" value={graphData.nodes.filter(n => (n.type||'').toLowerCase().includes('location')).length} />
        <StatCard label="关联事件" value={graphData.nodes.filter(n => (n.type||'').toLowerCase().includes('event')).length} />
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-4 gap-4">
        <div className="col-span-3 min-h-0">
          <ForceGraph
            data={graphData}
            filterTypes={['character', 'person', 'location', 'event', 'faction', 'organization']}
            onEdgeAdd={handleAddEdge}
            onEdgeDelete={handleDeleteEdge}
            onNodeAdd={handleAddNode}
            onNodeDelete={handleDeleteNode}
            onNodeUpdate={handleUpdateNode}
            onRefresh={refresh}
          />
        </div>
        <div className="col-span-1 rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-4 overflow-y-auto">
          <h4 className="font-medium mb-3 text-sm flex items-center gap-2 text-[var(--theme-foreground)]">
            <Codicon className="text-[var(--theme-primary)]" name="person" size={16} /> 人物列表
          </h4>
          <div className="space-y-2">
            {bible.characters?.length ? bible.characters.map((c: any) => (
              <div className="bg-[var(--theme-card-seed)]/60 rounded-lg p-3 border border-[var(--dt-border)]" key={c.id || c.name}>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-[var(--theme-primary)]/10 flex items-center justify-center text-sm"><Codicon className="text-[var(--theme-primary)]" name="person" size={16} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate text-[var(--theme-foreground)]">{c.name}</div>
                    {c.role && <div className="text-xs text-[var(--theme-foreground)]/60 truncate">{c.role}</div>}
                  </div>
                </div>
                {c.description && <p className="text-xs text-[var(--theme-foreground)]/60 mt-2 line-clamp-2">{c.description}</p>}
                {c.relationships && c.relationships.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {c.relationships.slice(0, 3).map((r: any, i: number) => (
                      <span className="text-xs bg-[var(--theme-primary)]/10 text-[var(--theme-primary)]/80 px-1.5 py-0.5 rounded" key={i}>
                        {r.type || '→'} {(typeof r.target === 'string' ? r.target : r.target?.name) || r.with}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )) : graphData.nodes.filter(n => (n.type||'').toLowerCase().includes('character')||(n.type||'').toLowerCase().includes('person')).map((n: any) => (
              <div className="bg-[var(--theme-card-seed)]/60 rounded-lg p-3 border border-[var(--dt-border)]" key={n.id}>
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-full bg-[var(--theme-primary)]/10 flex items-center justify-center text-sm"><Codicon className="text-[var(--theme-primary)]" name="person" size={16} /></span>
                  <div className="font-medium text-sm text-[var(--theme-foreground)]">{n.name}</div>
                </div>
                {n.description && <p className="text-xs text-[var(--theme-foreground)]/60 mt-2 line-clamp-2">{n.description}</p>}
              </div>
            ))}
            {!bible.characters?.length && !graphData.nodes.filter(n => (n.type||'').toLowerCase().includes('character')).length && (
              <div className="text-center text-muted-foreground py-6 text-sm">暂无人物<br />点击「AI分析人物」自动提取</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TimelineView({ project, data, allData, onRun, onLoad, projectRef: ref }: any) {
  const bible = allData?.bible?.story_bible || {}

  const bibleEvents = useMemo(() => (bible.timeline || []).map((e: any, i: number) => ({
    id: e.id || `tl_${i}`,
    event: e.event || e.title || e.name,
    time: e.time || e.chapter || e.order,
    chapter: e.chapter,
    description: e.description || e.summary,
    characters: e.characters || e.people || [],
    location: e.location || e.place,
    type: e.type || e.importance || 'event',
    importance: e.importance || (e.is_major ? 'major' : 'minor'),
    tags: e.tags || [],
  })), [bible])

  const stateTimeline = allData?.state?.state?.timeline || []

  const allEvents = useMemo(() => {
    const combined = [...bibleEvents]
    stateTimeline.forEach((e: any) => {
      if (!combined.find((c: any) => c.event === (e.event || e.title))) {
        combined.push({
          id: e.id || `st_${combined.length}`,
          event: e.event || e.title || e.name,
          time: e.time || e.chapter,
          description: e.description || e.summary,
          characters: e.characters || [],
          location: e.location,
          type: e.type || 'event',
          importance: 'minor',
        })
      }
    })

    return combined
  }, [bibleEvents, stateTimeline])

  const [building, setBuilding] = useState(false)

  const build = async () => { setBuilding(true); await onRun('state'); await onLoad('bible'); setBuilding(false) }

  const refresh = async () => { await onLoad('bible'); await onLoad('state') }

  const bibleApi = async (action: string, body?: any) => {
    return api(`/api/writer/projects/${encodeURIComponent(ref)}/os/story-bible`, 'POST', { action, ...body })
  }

  const handleAddEvent = async (event: Partial<TimelineEvent>) => {
    await bibleApi('add-timeline-event', { event })
    await refresh()
  }

  const handleUpdateEvent = async (eventId: string, patch: Partial<TimelineEvent>) => {
    const updated = bible.timeline?.map((e: any) => e.id === eventId ? { ...e, ...patch } : e) || []
    await bibleApi('update', { section: 'timeline', item: { id: eventId, ...patch } })
    await refresh()
  }

  const handleDeleteEvent = async (eventId: string) => {
    if (!window.confirm('确定删除此时间轴事件？')) {return}
    await bibleApi('delete', { section: 'timeline', item_id: eventId })
    await refresh()
  }

  return (
    <div className="space-y-4 h-[calc(100vh-280px)] flex flex-col">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h3 className="text-xl font-semibold flex items-center gap-2 text-[var(--theme-foreground)]">
            <Codicon className="text-[var(--theme-primary)]" name="clock" size={20} />
            故事时间轴
          </h3>
          <p className="text-xs text-[var(--theme-foreground)]/60 mt-1">可视化展示故事事件的时间顺序 · 支持缩放、过滤、添加编辑事件</p>
        </div>
        <div className="flex items-center gap-2">
          <Button className="border-[var(--dt-border)] text-[var(--theme-foreground)] hover:border-[var(--theme-primary)]/50" onClick={refresh} size="sm" variant="outline"><Codicon name="refresh" size={14} /> 刷新</Button>
          <Button className="bg-[var(--theme-primary)] hover:opacity-90" disabled={building} onClick={build} size="sm">{building ? '分析中...' : <><Codicon className="mr-1" name="sparkles" size={14} /> AI提取事件</>}</Button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3 flex-shrink-0">
        <StatCard label="总事件数" value={allEvents.length} />
        <StatCard label="重大事件" value={allEvents.filter((e: any) => e.importance === 'major' || (e.type||'').toLowerCase().includes('major') || (e.type||'').toLowerCase().includes('plot')).length} />
        <StatCard label="涉及人物" value={new Set(allEvents.flatMap((e: any) => e.characters || [])).size} />
        <StatCard label="涉及地点" value={new Set(allEvents.map((e: any) => e.location).filter(Boolean)).size} />
      </div>
      <div className="flex-1 min-h-0">
        <Timeline
          characters={bible.characters || []}
          events={allEvents}
          onAddEvent={handleAddEvent}
          onDeleteEvent={handleDeleteEvent}
          onRefresh={refresh}
          onUpdateEvent={handleUpdateEvent}
        />
      </div>
    </div>
  )
}

function NarrativeStateView({ data, onRun }: any) {
  const state = data?.state || { characters: [], threads: [], timeline: [], continuity_checks: [] }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold flex items-center gap-2 text-[var(--theme-foreground)]">
          <Codicon className="text-[var(--theme-primary)]" name="pulse" size={20} />
          叙事状态引擎
        </h3>
        <Button className="bg-[var(--theme-primary)] hover:opacity-90" onClick={() => onRun('state')} size="sm"><Codicon className="mr-1" name="refresh" size={14} /> 构建叙事状态</Button>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-5">
          <h4 className="font-medium mb-3 flex items-center gap-2 text-[var(--theme-foreground)]"><Codicon className="text-[var(--theme-primary)]" name="person" size={16} />角色状态</h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {state.characters?.length ? state.characters.map((c: any, i: number) => (
              <div className="bg-accent/40 rounded-lg p-3" key={i}>
                <div className="font-medium">{c.name}</div>
                <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
                  {c.location && <div><span className="text-muted-foreground">位置:</span> <span className="text-foreground/90">{c.location}</span></div>}
                  {c.status && <div><span className="text-muted-foreground">状态:</span> <span className={`${c.status === 'alive' ? 'text-green-400' : c.status === 'dead' ? 'text-red-400' : 'text-yellow-400'}`}>{c.status}</span></div>}
                </div>
              </div>
            )) : <div className="text-muted-foreground text-center py-8 text-sm">暂无角色状态</div>}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-5">
          <h4 className="font-medium mb-3 flex items-center gap-2 text-[var(--theme-foreground)]"><Codicon className="text-[var(--theme-primary)]" name="link" size={16} />叙事线索</h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {state.threads?.length ? state.threads.map((t: any, i: number) => (
              <div className="bg-[var(--theme-card-seed)]/60 rounded-lg p-3" key={i}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-[var(--theme-foreground)]">{t.name || t.title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${t.status === 'active' ? 'bg-green-500/10 text-green-500' : t.status === 'resolved' ? 'bg-[var(--theme-foreground)]/10 text-[var(--theme-foreground)]/60' : 'bg-amber-500/10 text-amber-500'}`}>{t.status || 'active'}</span>
                </div>
                {t.progress != null && <div className="mt-2"><div className="h-1.5 bg-[var(--theme-foreground)]/10 rounded-full overflow-hidden"><div className="h-full bg-[var(--theme-primary)]" style={{ width: `${Math.min(100, Math.max(0, t.progress * 100))}%` }}></div></div></div>}
              </div>
            )) : <div className="text-[var(--theme-foreground)]/60 text-center py-8 text-sm">暂无叙事线索</div>}
          </div>
        </div>
        <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-5">
          <h4 className="font-medium mb-3 flex items-center gap-2 text-[var(--theme-foreground)]"><Codicon className="text-[var(--theme-primary)]" name="alert" size={16} />连续性检查</h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {state.continuity_checks?.length ? state.continuity_checks.map((c: any, i: number) => (
              <div className={`rounded-lg p-3 ${c.severity === 'error' ? 'border border-red-500/30 bg-red-500/5' : c.severity === 'warning' ? 'border border-amber-500/30 bg-amber-500/5' : 'bg-[var(--theme-card-seed)]/60'}`} key={i}>
                <div className="font-medium text-sm text-[var(--theme-foreground)]">{c.title || c.type}</div>
                {c.description && <div className="text-xs text-[var(--theme-foreground)]/60 mt-0.5">{c.description}</div>}
              </div>
            )) : <div className="text-[var(--theme-foreground)]/60 text-center py-8 text-sm">暂无连续性问题 </div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function CriticView({ data, onRun }: any) {
  const council = data?.council || { reports: [] }
  const [running, setRunning] = useState(false)

  const runCritics = async () => { setRunning(true); await onRun('critic'); setRunning(false) }
  const latest = council.reports?.[council.reports.length - 1]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold flex items-center gap-2 text-[var(--theme-foreground)]">
          <Codicon className="text-[var(--theme-primary)]" name="checklist" size={20} />
          评审委员会
        </h3>
        <Button className="bg-[var(--theme-primary)] hover:opacity-90" disabled={running} onClick={runCritics} size="sm">{running ? '评审中...' : <><Codicon className="mr-1" name="search" size={14} /> 启动多镜头评审</>}</Button>
      </div>
      {!latest ? (
        <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-12 text-center">
          <Codicon className="text-[var(--theme-primary)]/40 mb-4" name="checklist" size={48} />
          <h4 className="text-lg font-medium mb-2 text-[var(--theme-foreground)]">还没有评审报告</h4>
          <Button className="mt-4 bg-[var(--theme-primary)] hover:opacity-90" onClick={runCritics} size="lg">开始第一次评审</Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <StatCard label="评审报告" value={council.reports?.length || 0} />
            <StatCard label="问题总数" value={(latest.issues || []).length + (latest.suggestions || []).length} />
            <StatCard label="综合评分" value={latest.score ? `${latest.score}/10` : '-'} />
          </div>
          {latest.overall_summary && <div className="border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 rounded-xl p-6"><p className="text-[var(--theme-foreground)]/80">{latest.overall_summary}</p></div>}
        </>
      )}
    </div>
  )
}

function SafetyView({ data, onRun }: any) {
  const safety = data?.safety || { reports: [] }
  const latest = safety.reports?.[safety.reports.length - 1]
  const checks = data?.checks || latest?.checks || []
  const [running, setRunning] = useState(false)

  const runCheck = async () => { setRunning(true); await onRun('safety'); setRunning(false) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold flex items-center gap-2 text-[var(--theme-foreground)]">
          <Codicon className="text-[var(--theme-primary)]" name="shield" size={20} />
          安全与版权检查
        </h3>
        <Button className="bg-[var(--theme-primary)] hover:opacity-90" disabled={running} onClick={runCheck} size="sm">{running ? '检查中...' : <><Codicon className="mr-1" name="search" size={14} /> 运行安全检查</>}</Button>
      </div>

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-4">
        <div className="flex items-start gap-3">
          <Codicon className="text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" name="shield" size={20} />
          <div>
            <h4 className="font-semibold text-amber-800 dark:text-amber-300 text-sm mb-1">版权防护提示</h4>
            <p className="text-xs text-amber-700 dark:text-amber-400/80 leading-relaxed">
              当前版本中，AI生成内容可能参考资料源，但不会自动生成引用链接。引用功能正在完善中。系统会通过安全护盾（Safety Shield）标记高风险内容，DO_NOT_COPY 清单会明确列出受版权保护的独特表达，建议在使用前人工审核。
            </p>
          </div>
        </div>
      </div>

      {!latest && !checks.length ? (
        <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-12 text-center">
          <Codicon className="text-[var(--theme-primary)]/40 mb-4" name="shield" size={48} />
          <Button className="mt-4 bg-[var(--theme-primary)] hover:opacity-90" onClick={runCheck} size="lg">开始检查</Button>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-6">
          <h4 className="font-medium mb-4 text-[var(--theme-foreground)]">合规性检查</h4>
          <div className="space-y-2">
            {checks.length ? checks.map((c: any, i: number) => (
              <div className={`p-3 rounded-lg flex items-start gap-3 ${c.passed || c.status === 'pass' ? 'border border-[var(--theme-primary)]/30 bg-[var(--theme-primary)]/5' : 'border border-amber-500/30 bg-amber-500/5'}`} key={i}>
                <Codicon className={c.passed || c.status === 'pass' ? 'text-green-500' : 'text-amber-500'} name={c.passed || c.status === 'pass' ? 'check-circle' : 'alert'} size={16} />
                <div><div className="font-medium text-sm text-[var(--theme-foreground)]">{c.name || c.check || c.title}</div>{c.message && <div className="text-xs text-[var(--theme-foreground)]/60 mt-0.5">{c.message}</div>}</div>
              </div>
            )) : <div className="text-[var(--theme-foreground)]/60 text-sm">暂无检查结果</div>}
          </div>
        </div>
      )}
    </div>
  )
}

function MemoryView({ data, onRun }: any) {
  const memory = data?.memory || { memories: [], decisions: [], preferences: [] }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold flex items-center gap-2 text-[var(--theme-foreground)]">
          <Codicon className="text-[var(--theme-primary)]" name="database" size={20} />
          创作记忆
        </h3>
        <Button className="bg-[var(--theme-primary)] hover:opacity-90" onClick={() => onRun('memory')} size="sm"><Codicon className="mr-1" name="refresh" size={14} /> 重建创作记忆</Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="创作记忆" value={memory.memories?.length || 0} />
        <StatCard label="创作决策" value={memory.decisions?.length || 0} />
        <StatCard label="偏好设置" value={memory.preferences?.length || 0} />
      </div>
    </div>
  )
}

function SearchView({ data, onRun }: any) {
  const [query, setQuery] = useState('')
  const results = data?.results || data?.matches || []
  const [searching, setSearching] = useState(false)

  const doSearch = async () => { if (!query.trim()) {return;} setSearching(true); await onRun('search', '', { query, limit: 20 }); setSearching(false) }

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold flex items-center gap-2 text-[var(--theme-foreground)]">
        <Codicon className="text-[var(--theme-primary)]" name="search" size={20} />
        创意检索
      </h3>
      <div className="flex gap-3">
        <input className="flex-1 bg-[var(--theme-card-seed)]/60 border border-[var(--dt-border)] rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-[var(--theme-primary)] text-[var(--theme-foreground)]" onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && doSearch()} placeholder="搜索角色、场景、情节、关键词..." value={query} />
        <Button className="bg-[var(--theme-primary)] hover:opacity-90" disabled={searching} onClick={doSearch}>{searching ? '搜索中...' : '搜索'}</Button>
      </div>
      {results.length > 0 && <div className="space-y-3"><div className="text-sm text-[var(--theme-foreground)]/60">找到 {results.length} 个结果</div>{results.map((r: any, i: number) => (
        <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-4" key={i}>
          <div className="flex items-center gap-2 mb-2"><span className="text-xs px-2 py-0.5 bg-[var(--theme-primary)]/10 rounded text-[var(--theme-primary)]">{r.type || r.category || '片段'}</span>{r.title && <span className="font-medium text-[var(--theme-foreground)]">{r.title}</span>}</div>
          <div className="text-sm text-[var(--theme-foreground)]/80 whitespace-pre-wrap line-clamp-3">{r.content || r.text || r.snippet}</div>
        </div>
      ))}</div>}
    </div>
  )
}

function DocumentsView({ data, onRun }: any) {
  const docs = data?.documents || []
  const stats = data?.stats || { documents: docs.length }
  const [syncing, setSyncing] = useState(false)

  const sync = async () => { setSyncing(true); await onRun('documents'); setSyncing(false) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold flex items-center gap-2 text-[var(--theme-foreground)]">
          <Codicon className="text-[var(--theme-primary)]" name="files" size={20} />
          文档引擎
        </h3>
        <Button className="bg-[var(--theme-primary)] hover:opacity-90" disabled={syncing} onClick={sync} size="sm">{syncing ? '同步中...' : <><Codicon className="mr-1" name="refresh" size={14} /> 同步文档</>}</Button>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="文档数" value={stats.documents || docs.length} />
        <StatCard label="段落节点" value={stats.nodes || 0} />
        <StatCard label="总字数" value={docs.reduce((sum: number, d: any) => sum + (d.chars || 0), 0).toLocaleString()} />
      </div>
    </div>
  )
}

function RagView({ data, onRun }: any) {
  const chunks = data?.chunks || data?.rag?.chunks || []
  const [indexing, setIndexing] = useState(false)

  const buildIndex = async () => { setIndexing(true); await onRun('rag'); setIndexing(false) }

  return (
    <div className="space-y-6">
      <h3 className="text-xl font-semibold flex items-center gap-2 text-[var(--theme-foreground)]">
        <Codicon className="text-[var(--theme-primary)]" name="book" size={20} />
        RAG 向量索引
      </h3>
      <StatCard label="文本分块" value={chunks.length} />
      <Button className="bg-[var(--theme-primary)] hover:opacity-90" disabled={indexing} onClick={buildIndex} size="sm">{indexing ? '索引中...' : <><Codicon className="mr-1" name="edit" size={14} /> 构建文本索引</>}</Button>
    </div>
  )
}

function BenchmarkView({ data, onRun }: any) {
  const runs = data?.runs || []
  const latest = runs[runs.length - 1]
  const [running, setRunning] = useState(false)

  const run = async () => { setRunning(true); await onRun('benchmark'); setRunning(false) }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold flex items-center gap-2 text-[var(--theme-foreground)]">
          <Codicon className="text-[var(--theme-primary)]" name="zap" size={20} />
          基准测试
        </h3>
        <Button className="bg-[var(--theme-primary)] hover:opacity-90" disabled={running} onClick={run} size="sm">{running ? '测试中...' : <><Codicon className="mr-1" name="play" size={14} /> 运行基准测试</>}</Button>
      </div>
      {!latest ? <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-12 text-center"><Codicon className="text-[var(--theme-primary)]/40 mb-4" name="zap" size={48} /><Button className="mt-4 bg-[var(--theme-primary)] hover:opacity-90" onClick={run} size="lg">开始测试</Button></div> : <div className="text-[var(--theme-foreground)]/80"><pre className="whitespace-pre-wrap text-sm bg-[var(--theme-card-seed)]/60 rounded-lg p-4">{JSON.stringify(latest, null, 2)}</pre></div>}
    </div>
  )
}

function GuideView({ data, onRun, onReopenGuide }: any) {
  const [repairing, setRepairing] = useState(false)
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)

  const repair = async () => { setRepairing(true); await onRun('guide', '', { action: 'repair' }); setRepairing(false) }

  const resetOnboarding = () => {
    try {
      localStorage.removeItem(ONBOARDING_KEY)
    } catch {
      // Reset is best effort only when browser storage is unavailable.
    }

    if (onReopenGuide) {
      onReopenGuide()
    }
  }

  const steps = [
    { id: 'documents', name: '同步文档', description: '扫描项目中的markdown文档' },
    { id: 'bible', name: '构建故事圣经', description: '分析稿件提取人物、地点、章节' },
    { id: 'wiki', name: '初始化活百科', description: '生成初始百科页面' },
    { id: 'graph', name: '构建知识图谱', description: '建立实体间关系网络' },
    { id: 'state', name: '构建叙事状态', description: '追踪角色状态和叙事线索' },
    { id: 'rag', name: '构建RAG索引', description: '文本分块与向量化' },
    { id: 'verify', name: '完整性验证', description: '验证所有模块就绪' }
  ]

  const faqs = [
    { q: '如何新建作品？', a: '在 Dashboard（概览）页面点击「新建作品」按钮，填写作品标题和类型即可创建。也可以通过顶部项目下拉菜单切换或创建项目。' },
    { q: '如何导入已有稿件？', a: '在项目页面右上角点击「导入稿件」按钮，支持选择 .md / .txt / .docx 文件或整个文件夹批量导入。导入后可以一键初始化所有模块。' },
    { q: '故事圣经有什么用？', a: '故事圣经用于存储和管理故事中的人物、地点、世界观、章节大纲、伏笔等核心设定。AI可以从稿件中自动提取这些信息，也可以手动添加编辑。' },
    { q: '知识图谱怎么构建？', a: '进入「知识图谱」标签页，点击「AI分析构建」按钮，系统会自动从稿件和故事圣经中提取实体及实体间的关系，生成可视化图谱。你也可以手动添加节点和连接。' },
    { q: '如何使用多Agent工作流？', a: '当前版本可以通过「评审委员会」获取多视角AI反馈。在评审页面点击「启动多镜头评审」，多个AI专家角色会从不同角度对你的作品进行分析点评。' },
    { q: '如何导出作品？', a: '切换到「交付」标签页，支持导出 Markdown 格式（包含人物表、地点设定、世界观、章节大纲、伏笔、时间线等完整内容），也可以构建完整交付包。' },
    { q: '支持哪些文件格式？', a: '导入支持 .md（Markdown）和 .txt 纯文本格式。导出支持 Markdown 格式，可直接用于发布或进一步编辑。所有数据存储在本地 karna-data 目录。' },
    { q: '数据保存在哪里？', a: '所有作品数据都保存在本地 karna-data 目录中，不会上传到云端。你可以随时备份或迁移该目录。版本对比功能可以查看文件修改历史。' },
  ]

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
          e.preventDefault()
        } else if (e.key === 'n') {
          e.preventDefault()
        } else if (e.key === 'r') {
          e.preventDefault()
          window.location.reload()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold flex items-center gap-2 text-[var(--theme-foreground)]">
          <Codicon className="text-[var(--theme-primary)]" name="wrench" size={20} />
          引导与修复
        </h3>
        <Button className="bg-[var(--theme-primary)] hover:opacity-90" disabled={repairing} onClick={repair} size="sm">{repairing ? '修复中...' : <><Codicon className="mr-1" name="settings" size={14} /> 自动修复项目结构</>}</Button>
      </div>
      <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-6">
        <h4 className="font-medium mb-4 text-[var(--theme-foreground)]">Writer OS 初始化引导</h4>
        <div className="space-y-3">
          {steps.map((step: any, i: number) => (
            <div className="p-4 rounded-lg flex items-center gap-4 bg-[var(--theme-card-seed)]/60" key={step.id}>
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-[var(--theme-primary)]/10 text-[var(--theme-primary)]"><span>{i + 1}</span></div>
              <div className="flex-1"><div className="font-medium text-[var(--theme-foreground)]">{step.name}</div><div className="text-xs text-[var(--theme-foreground)]/60 mt-0.5">{step.description}</div></div>
              <button className="text-xs px-3 py-1.5 bg-[var(--theme-primary)] hover:opacity-90 rounded transition" onClick={() => onRun(step.id === 'verify' ? 'loop' : step.id)}>执行</button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-6">
        <h4 className="font-medium mb-4 text-[var(--theme-foreground)] flex items-center gap-2">
          <Codicon className="text-[var(--theme-primary)]" name="question" size={18} />
          帮助文档
        </h4>
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <div className="border border-[var(--dt-border)] rounded-lg overflow-hidden bg-[var(--theme-card-seed)]/40" key={i}>
              <button
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-[var(--theme-card-seed)]/60 transition"
                onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
              >
                <span className="font-medium text-sm text-[var(--theme-foreground)]">{faq.q}</span>
                <Codicon
                  className="text-[var(--theme-foreground)]/50 transition-transform flex-shrink-0"
                  name={expandedFaq === i ? 'chevron-up' : 'chevron-down'}
                  size={16}
                />
              </button>
              {expandedFaq === i && (
                <div className="px-4 pb-3 pt-0">
                  <p className="text-sm text-[var(--theme-foreground)]/70 leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-6">
        <h4 className="font-medium mb-4 text-[var(--theme-foreground)] flex items-center gap-2">
          <Codicon className="text-[var(--theme-primary)]" name="keyboard" size={18} />
          快捷键
        </h4>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex items-center gap-2 text-sm">
            <kbd className="px-2 py-1 bg-[var(--theme-card-seed)]/60 border border-[var(--dt-border)] rounded text-xs font-mono">Ctrl+S</kbd>
            <span className="text-[var(--theme-foreground)]/70">保存</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <kbd className="px-2 py-1 bg-[var(--theme-card-seed)]/60 border border-[var(--dt-border)] rounded text-xs font-mono">Ctrl+N</kbd>
            <span className="text-[var(--theme-foreground)]/70">新建项目</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <kbd className="px-2 py-1 bg-[var(--theme-card-seed)]/60 border border-[var(--dt-border)] rounded text-xs font-mono">Ctrl+R</kbd>
            <span className="text-[var(--theme-foreground)]/70">刷新</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="font-medium text-[var(--theme-foreground)] flex items-center gap-2">
              <Codicon className="text-[var(--theme-primary)]" name="star" size={18} />
              新手引导
            </h4>
            <p className="text-sm text-[var(--theme-foreground)]/60 mt-1">想重新查看欢迎向导？点击下方按钮重置并重新打开。</p>
          </div>
          <button
            className="px-4 py-2 bg-[var(--theme-primary)]/10 hover:bg-[var(--theme-primary)]/20 text-[var(--theme-primary)] text-sm font-medium rounded-lg transition flex items-center gap-2"
            onClick={resetOnboarding}
          >
            <Codicon name="refresh" size={14} />
            重新查看新手引导
          </button>
        </div>
      </div>
    </div>
  )
}

function DeliveryView({ data, onRun, project, allOsData, projectRef: ref }: any) {
  const pkg = data?.package || data
  const [building, setBuilding] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [exports, setExports] = useState<any[]>([])
  const isDesktop = typeof window !== 'undefined' && !!(window as any).karnaDesktop

  const fetchExports = useCallback(async () => {
    if (!isDesktop || !ref) {return}

    try {
      const res = await api<any>(`/api/writer/projects/${encodeURIComponent(ref)}/exports`)
      setExports(res?.exports || [])
    } catch {
      // Delivery history is optional; the current export still remains usable.
    }
  }, [ref, isDesktop])

  useEffect(() => { fetchExports() }, [fetchExports])

  const build = async () => { setBuilding(true); await onRun('delivery'); setBuilding(false); fetchExports() }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) {return bytes + ' B'}

    if (bytes < 1024 * 1024) {return (bytes / 1024).toFixed(1) + ' KB'}

    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const formatTime = (iso: string) => {
    try { return new Date(iso).toLocaleString() } catch { return iso }
  }

  const openInFolder = (filePath: string) => {
    if (isDesktop && (window as any).karnaDesktop?.revealPath) {
      ;(window as any).karnaDesktop.revealPath(filePath)
    }
  }

  const exportMarkdown = async () => {
    setExporting(true)

    try {
      let bible = allOsData?.bible?.story_bible
      let wiki = allOsData?.wiki?.wiki

      if (!bible) {
        try {
          const res = await api<any>(`/api/writer/projects/${encodeURIComponent(ref)}/os/bible`)
          bible = res?.story_bible || res
        } catch {
          // A missing cached Bible should not block a manual export.
        }
      }

      const bibleData = bible || { characters: [], locations: [], chapters: [], world_rules: [], foreshadows: [], timeline: [] }
      const wikiPages = wiki?.pages || []

      const lines: string[] = []

      lines.push(`# ${project?.title || '未命名作品'}`)
      lines.push('')

      if (project?.genre || project?.type) {
        lines.push(`**类型**: ${project.genre || project.type}`)
        lines.push('')
      }

      if (project?.word_count) {
        lines.push(`**总字数**: ${project.word_count.toLocaleString()}`)
        lines.push('')
      }

      lines.push(`**导出时间**: ${new Date().toLocaleString()}`)
      lines.push('')
      lines.push('---')
      lines.push('')

      if (bibleData.chapters?.length) {
        lines.push('## 章节大纲')
        lines.push('')

        for (const ch of bibleData.chapters) {
          const title = ch.title || ch.chapter || '未命名章节'
          lines.push(`### ${title}`)
          lines.push('')

          if (ch.summary) {
            lines.push(ch.summary)
            lines.push('')
          }

          if (ch.chars) {
            lines.push(`*（约 ${ch.chars.toLocaleString()} 字）*`)
            lines.push('')
          }
        }

        lines.push('---')
        lines.push('')
      }

      if (bibleData.characters?.length) {
        lines.push('## 人物表')
        lines.push('')

        for (const c of bibleData.characters) {
          const name = c.name || '未命名'
          lines.push(`### ${name}`)
          lines.push('')

          if (c.role) {lines.push(`**角色**: ${c.role}`)}

          if (c.description) {lines.push(c.description)}

          if (c.note) {lines.push(c.note)}

          if (c.traits?.length) {lines.push(`**特征**: ${c.traits.join(', ')}`)}

          if (c.relationships?.length) {
            lines.push('')
            lines.push('**人物关系**:')

            for (const r of c.relationships) {
              const target = typeof r.target === 'string' ? r.target : (r.target?.name || r.with || '')
              lines.push(`- ${r.type || '关系'}: ${target}`)
            }
          }

          lines.push('')
        }

        lines.push('---')
        lines.push('')
      }

      if (bibleData.locations?.length) {
        lines.push('## 地点设定')
        lines.push('')

        for (const loc of bibleData.locations) {
          const name = loc.name || '未命名地点'
          lines.push(`### ${name}`)
          lines.push('')

          if (loc.description || loc.snippet) {
            lines.push(loc.description || loc.snippet)
            lines.push('')
          }
        }

        lines.push('---')
        lines.push('')
      }

      if (bibleData.world_rules?.length) {
        lines.push('## 世界观设定')
        lines.push('')

        for (const w of bibleData.world_rules) {
          const rule = w.rule || w.title || '设定'
          lines.push(`- **${rule}**`)

          if (w.description || w.evidence) {lines.push(`  ${w.description || w.evidence}`)}
        }

        lines.push('')
        lines.push('---')
        lines.push('')
      }

      if (bibleData.foreshadows?.length) {
        lines.push('## 伏笔列表')
        lines.push('')

        for (const f of bibleData.foreshadows) {
          const clue = f.clue || f.title || '伏笔'
          const statusText = f.status === 'resolved' ? ' 已回收' : '○ 未回收'
          lines.push(`- **${clue}** (${statusText})`)

          if (f.evidence) {lines.push(`  ${f.evidence}`)}
        }

        lines.push('')
        lines.push('---')
        lines.push('')
      }

      if (bibleData.timeline?.length) {
        lines.push('## 时间线')
        lines.push('')

        for (const t of bibleData.timeline) {
          const event = t.event || t.title || '事件'
          const time = t.time || t.chapter || ''
          lines.push(`- **${time ? `${time}: ` : ''}${event}**`)

          if (t.description) {lines.push(`  ${t.description}`)}
        }

        lines.push('')
        lines.push('---')
        lines.push('')
      }

      if (wikiPages.length) {
        lines.push('## 百科条目')
        lines.push('')

        for (const p of wikiPages) {
          lines.push(`### ${p.title || '未命名'}`)
          lines.push('')

          if (p.category) {lines.push(`*分类: ${p.category}*`)}

          if (p.content || p.summary) {
            lines.push('')
            lines.push(p.content || p.summary)
          }

          lines.push('')
        }
      }

      const markdown = lines.join('\n')
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(project?.title || 'novel').replace(/[<>:"/\\|?*]/g, '_')}.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) {
      window.alert('导出失败: ' + (e.message || String(e)))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {!isDesktop && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 flex items-start gap-2">
          <Codicon className="text-yellow-500 mt-0.5 flex-shrink-0" name="warning" size={16} />
          <div className="text-sm text-yellow-700 dark:text-yellow-400">
            浏览器演示模式：导出文件保存至虚拟内存，刷新后丢失。请使用桌面版获得完整导出功能。
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold flex items-center gap-2 text-[var(--theme-foreground)]">
          <Codicon className="text-[var(--theme-primary)]" name="package" size={20} />
          交付与导出
        </h3>
        <div className="flex gap-2">
          <Button className="border-[var(--dt-border)] text-[var(--theme-foreground)]" disabled={exporting} onClick={exportMarkdown} size="sm" variant="outline">
            {exporting ? <><Codicon className="mr-1 animate-spin" name="loading" size={14} /> 导出中...</> : <><Codicon className="mr-1" name="markdown" size={14} /> 导出 Markdown</>}
          </Button>
          <Button className="bg-[var(--theme-primary)] hover:opacity-90" disabled={building} onClick={build} size="sm">{building ? '构建中...' : <><Codicon className="mr-1" name="package" size={14} /> 构建交付包</>}</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-6">
          <h4 className="font-semibold mb-3 flex items-center gap-2 text-[var(--theme-foreground)]">
            <Codicon className="text-[var(--theme-primary)]" name="markdown" size={18} />
            Markdown 导出
          </h4>
          <p className="text-sm text-[var(--theme-foreground)]/60 mb-4">将项目信息、故事圣经、章节大纲、人物设定、世界观、伏笔、时间线等内容导出为单个 Markdown 文件。</p>
          <div className="text-xs text-[var(--theme-foreground)]/50 space-y-1 mb-4">
            <div> 项目基本信息</div>
            <div> 章节大纲</div>
            <div> 人物表</div>
            <div> 地点 & 世界观设定</div>
            <div> 伏笔列表 & 时间线</div>
          </div>
          <Button className="w-full bg-[var(--theme-primary)] hover:opacity-90" disabled={exporting} onClick={exportMarkdown}>
            {exporting ? '导出中...' : '导出 Markdown 文件'}
          </Button>
        </div>

        <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-6">
          <h4 className="font-semibold mb-3 flex items-center gap-2 text-[var(--theme-foreground)]">
            <Codicon className="text-[var(--theme-primary)]" name="package" size={18} />
            完整交付包
          </h4>
          <p className="text-sm text-[var(--theme-foreground)]/60 mb-4">构建包含所有项目数据的完整交付包，用于备份或转移。</p>
          {!pkg?.ready ? (
            <Button className="w-full bg-[var(--theme-primary)] hover:opacity-90" disabled={building} onClick={build}>
              {building ? '构建中...' : '构建交付包'}
            </Button>
          ) : (
            <div className="border border-green-500/30 bg-green-500/10 rounded-lg p-4 text-center">
              <Codicon className="text-green-500 mx-auto mb-2" name="check-circle" size={24} />
              <div className="text-green-600 font-medium">交付包已就绪</div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold flex items-center gap-2 text-[var(--theme-foreground)]">
            <Codicon className="text-[var(--theme-primary)]" name="folder-opened" size={18} />
            已导出文件
            <span className="text-xs text-[var(--theme-foreground)]/60 font-normal">({exports.length})</span>
          </h4>
          {isDesktop && (
            <Button onClick={fetchExports} size="sm" variant="ghost">
              <Codicon className="mr-1" name="refresh" size={14} /> 刷新
            </Button>
          )}
        </div>
        {!isDesktop ? (
          <div className="text-sm text-[var(--theme-foreground)]/50 text-center py-6">
            浏览器演示模式无法访问本地文件
          </div>
        ) : exports.length === 0 ? (
          <div className="text-sm text-[var(--theme-foreground)]/50 text-center py-6">
            暂无导出文件，点击"构建交付包"后文件将显示在这里
          </div>
        ) : (
          <div className="space-y-2">
            {exports.map((file, i) => (
              <div className="flex items-center justify-between rounded-lg border border-[var(--dt-border)] bg-[var(--theme-background)]/50 px-4 py-3" key={i}>
                <div className="flex items-center gap-3 min-w-0">
                  <Codicon className="text-[var(--theme-primary)] flex-shrink-0" name="file" size={16} />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--theme-foreground)] truncate">{file.name}</div>
                    <div className="text-xs text-[var(--theme-foreground)]/50 mt-0.5">
                      {formatTime(file.mtime)} · {formatSize(file.size)}
                    </div>
                  </div>
                </div>
                <Button onClick={() => openInFolder(file.path)} size="sm" variant="outline">
                  <Codicon className="mr-1" name="folder-opened" size={14} /> 打开所在文件夹
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, icon, items, renderItem, emptyText }: any) {
  return (
    <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-5">
      <h4 className="font-medium mb-3 flex items-center gap-2 text-[var(--theme-foreground)]"><Codicon className="text-[var(--theme-primary)]" name={icon} size={16} />{title} <span className="text-xs text-[var(--theme-foreground)]/60 font-normal">({items?.length || 0})</span></h4>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {items?.length ? items.map((item: any, i: number) => <div key={i}>{renderItem(item, i)}</div>) : <div className="text-[var(--theme-foreground)]/60 text-sm text-center py-6">{emptyText}</div>}
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: any }) {
  return <div className="rounded-xl p-4 border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80"><div className="text-2xl font-bold text-[var(--theme-foreground)]">{value}</div><div className="text-sm mt-1 text-[var(--theme-foreground)]/60">{label}</div></div>
}

function Modal({ children, onClose, title }: any) {
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div aria-labelledby="writer-modal-title" aria-modal="true" className="bg-card border border-border rounded-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()} ref={dialogRef} role="dialog" tabIndex={-1}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold" id="writer-modal-title">{title}</h3>
          <button aria-label="关闭对话框" className="text-muted-foreground hover:text-foreground text-xl" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function CreateProjectModal({ onClose, onCreated }: any) {
  const [title, setTitle] = useState('')
  const [genre, setGenre] = useState('')
  const [description, setDescription] = useState('')
  const [folder, setFolder] = useState('')
  const [creating, setCreating] = useState(false)

  const submit = async () => {
    if (!title.trim()) {return}
    setCreating(true)

    try { const res = await api<any>('/api/writer/projects', 'POST', { title, genre, description, folder: folder || undefined }); onCreated(res.project) }
    catch (e: any) { window.alert(e.message || String(e)) } finally { setCreating(false) }
  }

  return (
    <Modal onClose={onClose} title="新建写作项目">
      <div className="space-y-4">
        <div><label className="block text-sm text-muted-foreground mb-1">项目标题 *</label><input className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" onChange={e => setTitle(e.target.value)} placeholder="例如：九州·羽传说" value={title} /></div>
        <div><label className="block text-sm text-muted-foreground mb-1">类型/题材</label><select className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" onChange={e => setGenre(e.target.value)} value={genre}><option value="">请选择</option><option value="玄幻">玄幻</option><option value="奇幻">奇幻</option><option value="仙侠">仙侠</option><option value="都市">都市</option><option value="历史">历史</option><option value="科幻">科幻</option><option value="悬疑">悬疑</option><option value="言情">言情</option></select></div>
        <div><label className="block text-sm text-muted-foreground mb-1">项目简介</label><textarea className="w-full bg-accent border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary" onChange={e => setDescription(e.target.value)} placeholder="一句话描述你的故事..." rows={3} value={description} /></div>
        <div className="flex gap-3 pt-2"><Button className="flex-1" onClick={onClose} variant="secondary">取消</Button><Button className="flex-1" disabled={creating || !title.trim()} onClick={submit}>{creating ? '创建中...' : '创建项目'}</Button></div>
      </div>
    </Modal>
  )
}

interface ImportFile {
  path: string
  name: string
  size: number
  status: 'pending' | 'importing' | 'done' | 'error'
  error?: string
}

function ImportModal({ project, onClose, onImported }: any) {
  const [files, setFiles] = useState<ImportFile[]>([])
  const [importing, setImporting] = useState(false)
  const [currentIndex, setCurrentIndex] = useState(-1)

  const selectFiles = async () => {
    const paths = await window.karnaDesktop.selectPaths({
      directories: false,
      multiple: true,
      title: '选择稿件文件',
      filters: [{ name: 'Markdown/Text', extensions: ['md', 'markdown', 'txt'] }]
    })

    if (paths?.length) {
      const newFiles: ImportFile[] = paths.map((p: string) => ({
        path: p,
        name: p.split(/[\\/]/).pop() || p,
        size: 0,
        status: 'pending'
      }))

      setFiles(prev => [...prev, ...newFiles])
    }
  }

  const selectFolder = async () => {
    const paths = await window.karnaDesktop.selectPaths({
      directories: true,
      multiple: false,
      title: '选择稿件文件夹'
    })

    if (paths?.length) {
      const newFiles: ImportFile[] = paths.map((p: string) => ({
        path: p,
        name: p.split(/[\\/]/).pop() || p,
        size: 0,
        status: 'pending'
      }))

      setFiles(prev => [...prev, ...newFiles])
    }
  }

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const clearFiles = () => setFiles([])

  const submit = async () => {
    if (!files.length) {return}
    setImporting(true)

    let successCount = 0

    for (let i = 0; i < files.length; i++) {
      setCurrentIndex(i)
      setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'importing' } : f))

      try {
        await api(`/api/writer/projects/${encodeURIComponent(projectRef(project))}/import`, 'POST', { path: files[i].path })
        setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'done' } : f))
        successCount++
      } catch (e: any) {
        setFiles(prev => prev.map((f, idx) => idx === i ? { ...f, status: 'error', error: e.message || String(e) } : f))
      }
    }

    setCurrentIndex(-1)
    setImporting(false)

    if (successCount > 0) {
      onImported()
    }
  }

  const pendingCount = files.filter(f => f.status === 'pending').length
  const doneCount = files.filter(f => f.status === 'done').length
  const errorCount = files.filter(f => f.status === 'error').length
  const progress = files.length > 0 ? Math.round((doneCount + errorCount) / files.length * 100) : 0

  return (
    <Modal onClose={onClose} title="导入稿件">
      <div className="space-y-4">
        <p className="text-sm text-[var(--theme-foreground)]/60">选择 .md / .txt 稿件文件或文件夹导入到项目中。</p>

        <div className="flex gap-2">
          <Button className="flex-1" disabled={importing} onClick={selectFiles} size="sm" variant="outline">
            <Codicon className="mr-1" name="file-add" size={14} /> 选择文件
          </Button>
          <Button className="flex-1" disabled={importing} onClick={selectFolder} size="sm" variant="outline">
            <Codicon className="mr-1" name="folder" size={14} /> 选择文件夹
          </Button>
          {files.length > 0 && !importing && (
            <Button onClick={clearFiles} size="sm" variant="ghost">
              <Codicon name="trash" size={14} />
            </Button>
          )}
        </div>

        {files.length > 0 && (
          <div className="rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/40">
            {importing && (
              <div className="px-3 py-2 border-b border-[var(--dt-border)]">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-[var(--theme-foreground)]/60">导入进度</span>
                  <span>{doneCount + errorCount} / {files.length} ({progress}%)</span>
                </div>
                <div className="h-1.5 bg-[var(--theme-foreground)]/10 rounded-full overflow-hidden">
                  <div className="h-full bg-[var(--theme-primary)] transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            <div className="max-h-64 overflow-y-auto">
              {files.map((f, i) => (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--dt-border)] last:border-b-0" key={`${f.path}-${i}`}>
                  <div className="flex-shrink-0">
                    {f.status === 'pending' && <Codicon className="text-[var(--theme-foreground)]/40" name="file" size={16} />}
                    {f.status === 'importing' && <Codicon className="text-[var(--theme-primary)] animate-spin" name="loading" size={16} />}
                    {f.status === 'done' && <Codicon className="text-green-500" name="check-circle" size={16} />}
                    {f.status === 'error' && <Codicon className="text-red-500" name="error" size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{f.name}</div>
                    <div className="text-xs text-[var(--theme-foreground)]/50 truncate font-mono">{f.path}</div>
                    {f.error && <div className="text-xs text-red-500 mt-0.5">{f.error}</div>}
                  </div>
                  {!importing && f.status === 'pending' && (
                    <button className="text-[var(--theme-foreground)]/40 hover:text-red-500 p-1" onClick={() => removeFile(i)}>
                      <Codicon name="close" size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {(doneCount > 0 || errorCount > 0) && !importing && (
              <div className="px-3 py-2 border-t border-[var(--dt-border)] text-xs text-[var(--theme-foreground)]/60 flex gap-3">
                {doneCount > 0 && <span className="text-green-500"> {doneCount} 个成功</span>}
                {errorCount > 0 && <span className="text-red-500"> {errorCount} 个失败</span>}
                {pendingCount > 0 && <span>{pendingCount} 个待导入</span>}
              </div>
            )}
          </div>
        )}

        {files.length === 0 && (
          <div className="text-center py-8 text-[var(--theme-foreground)]/40 text-sm border border-dashed border-[var(--dt-border)] rounded-lg">
            <Codicon className="mx-auto mb-2" name="cloud-upload" size={32} />
            <div>点击上方按钮选择稿件文件或文件夹</div>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button className="flex-1 border-[var(--dt-border)] text-[var(--theme-foreground)]" disabled={importing} onClick={onClose} variant="secondary">
            {doneCount > 0 ? '关闭' : '取消'}
          </Button>
          <Button className="flex-1 bg-[var(--theme-primary)] hover:opacity-90" disabled={importing || files.length === 0} onClick={submit}>
            {importing ? (
              <><Codicon className="mr-1 animate-spin" name="loading" size={14} /> 导入中...</>
            ) : `开始导入 (${files.length})`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

interface FileTreeNode {
  name: string
  type: 'dir' | 'file'
  path: string
  children?: FileTreeNode[]
}

function FileTreeItem({ item, expanded, onToggle, level = 0 }: { item: FileTreeNode; expanded: Set<string>; onToggle: (path: string) => void; level?: number }) {
  const isExpanded = expanded.has(item.path)
  const childCount = item.children?.length || 0

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 px-2 hover:bg-[var(--theme-card-seed)]/60 rounded cursor-pointer text-sm"
        onClick={() => item.type === 'dir' && onToggle(item.path)}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
      >
        {item.type === 'dir' ? (
          <>
            <Codicon className="text-[var(--theme-foreground)]/60 flex-shrink-0" name={isExpanded ? 'chevron-down' : 'chevron-right'} size={14} />
            <Codicon className="text-amber-500 flex-shrink-0" name="folder" size={16} />
            <span className="text-[var(--theme-foreground)] flex-1">{item.name}</span>
            <span className="text-xs text-[var(--theme-foreground)]/40">{childCount}</span>
          </>
        ) : (
          <>
            <span className="w-[14px] flex-shrink-0" />
            <Codicon className="text-[var(--theme-primary)]/60 flex-shrink-0" name="file" size={16} />
            <span className="text-[var(--theme-foreground)]/80 flex-1 truncate">{item.name}</span>
          </>
        )}
      </div>
      {item.type === 'dir' && isExpanded && item.children?.map((child) => (
        <FileTreeItem expanded={expanded} item={child} key={child.path} level={level + 1} onToggle={onToggle} />
      ))}
    </div>
  )
}

function FileTree({ items }: { items: FileTreeNode[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const toggle = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)

      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }

      return next
    })
  }

  return (
    <div className="space-y-0">
      {items.map((item) => (
        <FileTreeItem expanded={expanded} item={item} key={item.path} onToggle={toggle} />
      ))}
    </div>
  )
}

interface VersionFile {
  name: string
  mtime: string
  size: number
  content: string
}

function VersionsView({ projectRef: ref }: { projectRef: string }) {
  const [versions, setVersions] = useState<VersionFile[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedA, setSelectedA] = useState<string>('')
  const [selectedB, setSelectedB] = useState<string>('')
  const [diffLines, setDiffLines] = useState<{ type: 'same' | 'added' | 'removed'; text: string }[]>([])

  const loadVersions = async () => {
    if (!ref) {return}
    setLoading(true)

    try {
      const data = await api<{ versions: VersionFile[] }>(`/api/writer/projects/${encodeURIComponent(ref)}/versions`, 'GET')
      setVersions(data.versions || [])
    } catch {
      setVersions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadVersions()
  }, [ref])

  useEffect(() => {
    if (!selectedA || !selectedB) {
      setDiffLines([])

      return
    }

    const a = versions.find(v => v.name === selectedA)
    const b = versions.find(v => v.name === selectedB)

    if (!a || !b) {
      setDiffLines([])

      return
    }

    const linesA = a.content.split('\n')
    const linesB = b.content.split('\n')
    const maxLen = Math.max(linesA.length, linesB.length)
    const diff: { type: 'same' | 'added' | 'removed'; text: string }[] = []

    for (let i = 0; i < maxLen; i++) {
      const lineA = i < linesA.length ? linesA[i] : undefined
      const lineB = i < linesB.length ? linesB[i] : undefined

      if (lineA === lineB) {
        if (lineA !== undefined) {
          diff.push({ type: 'same', text: lineA })
        }
      } else {
        if (lineA !== undefined) {
          diff.push({ type: 'removed', text: lineA })
        }

        if (lineB !== undefined) {
          diff.push({ type: 'added', text: lineB })
        }
      }
    }

    setDiffLines(diff)
  }, [selectedA, selectedB, versions])

  const formatTime = (t: string) => {
    try { return new Date(t).toLocaleString('zh-CN') } catch { return t }
  }

  const formatSize = (s: number) => {
    if (s < 1024) {return `${s} B`}

    return `${(s / 1024).toFixed(1)} KB`
  }

  return (
    <div className="space-y-4 h-[calc(100vh-280px)] flex flex-col">
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h3 className="text-xl font-semibold flex items-center gap-2 text-[var(--theme-foreground)]">
            <Codicon className="text-[var(--theme-primary)]" name="history" size={20} />
            版本对比
          </h3>
          <p className="text-xs text-[var(--theme-foreground)]/60 mt-1">选择两个版本进行对比查看差异</p>
        </div>
        <Button className="border-[var(--dt-border)] text-[var(--theme-foreground)] hover:border-[var(--theme-primary)]/50" onClick={loadVersions} size="sm" variant="outline"><Codicon name="refresh" size={14} /> 刷新</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 flex-1 min-h-0">
        <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-4 flex flex-col">
          <h4 className="font-medium mb-3 flex items-center gap-2 text-[var(--theme-foreground)] flex-shrink-0">
            <Codicon name="files" size={16} /> 版本列表
          </h4>
          {loading ? (
            <div className="text-sm text-[var(--theme-foreground)]/60 flex-1 flex items-center justify-center">加载中...</div>
          ) : versions.length === 0 ? (
            <div className="text-sm text-[var(--theme-foreground)]/60 flex-1 flex items-center justify-center">暂无版本文件</div>
          ) : (
            <div className="space-y-1 overflow-y-auto flex-1">
              {versions.map(v => (
                <div
                  className={`p-2 rounded-lg border cursor-pointer transition ${selectedA === v.name || selectedB === v.name ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)]/5' : 'border-transparent hover:bg-[var(--theme-card-seed)]/60'}`}
                  key={v.name}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <input checked={selectedA === v.name} name="versionA" onChange={() => setSelectedA(v.name)} type="radio" />
                    <input checked={selectedB === v.name} name="versionB" onChange={() => setSelectedB(v.name)} type="radio" />
                    <span className="text-sm font-medium text-[var(--theme-foreground)] flex-1">{v.name}</span>
                  </div>
                  <div className="text-xs text-[var(--theme-foreground)]/50 pl-8">{formatTime(v.mtime)} · {formatSize(v.size)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-4 flex flex-col">
          <h4 className="font-medium mb-3 flex items-center gap-2 text-[var(--theme-foreground)] flex-shrink-0">
            <Codicon name="diff" size={16} /> 差异对比
          </h4>
          {diffLines.length === 0 ? (
            <div className="text-sm text-[var(--theme-foreground)]/60 flex-1 flex items-center justify-center">请选择两个版本进行对比</div>
          ) : (
            <div className="overflow-y-auto flex-1 font-mono text-sm whitespace-pre-wrap bg-black/20 rounded-lg p-3">
              {diffLines.map((line, i) => (
                <div className={
                  line.type === 'added' ? 'bg-green-500/20 text-green-200' :
                  line.type === 'removed' ? 'bg-red-500/20 text-red-200' :
                  'text-[var(--theme-foreground)]/80'
                } key={i}>
                  <span className="select-none mr-2">{line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}</span>
                  {line.text || ' '}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SpeakPanel() {
  const [text, setText] = useState('夜色渐浓，窗外的雨淅淅沥沥地下着。少年剑客站在屋檐下，手中的长剑泛着清冷的寒光。他望着远处漆黑的街巷，知道今晚注定不会平静。')
  const [speaking, setSpeaking] = useState(false)
  const [paused, setPaused] = useState(false)
  const [supported, setSupported] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSupported(false)
    }
  }, [])

  const speak = () => {
    if (!supported) {return}
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US'
    const voices = window.speechSynthesis.getVoices()
    const zhVoice = voices.find(v => v.lang.startsWith('zh'))

    if (zhVoice) {utterance.voice = zhVoice}

    utterance.onstart = () => { setSpeaking(true); setPaused(false) }

    utterance.onend = () => { setSpeaking(false); setPaused(false) }

    utterance.onerror = () => { setSpeaking(false); setPaused(false) }
    window.speechSynthesis.speak(utterance)
  }

  const pause = () => {
    if (!supported) {return}

    if (paused) {
      window.speechSynthesis.resume()
      setPaused(false)
    } else {
      window.speechSynthesis.pause()
      setPaused(true)
    }
  }

  const stop = () => {
    if (!supported) {return}
    window.speechSynthesis.cancel()
    setSpeaking(false)
    setPaused(false)
  }

  useEffect(() => {
    return () => {
      if (supported) {window.speechSynthesis.cancel()}
    }
  }, [supported])

  if (!supported) {
    return (
      <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-6">
        <h3 className="text-lg font-semibold mb-2 flex items-center gap-2 text-[var(--theme-foreground)]">
          <Codicon className="text-[var(--theme-primary)]" name="unmute" size={18} />
          文本朗读
        </h3>
        <p className="text-sm text-[var(--dt-destructive)]">您的浏览器不支持语音合成</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-6">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-[var(--theme-foreground)]">
        <Codicon className="text-[var(--theme-primary)]" name="unmute" size={18} />
        文本朗读
      </h3>
      <textarea
        className="min-h-24 w-full rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/50 p-3 text-sm outline-none focus:border-[var(--theme-primary)]/40"
        onChange={e => setText(e.target.value)}
        placeholder="输入要朗读的文本..."
        value={text}
      />
      <div className="mt-3 flex gap-2">
        <Button className="bg-blue-500 text-white hover:bg-blue-600" disabled={!text || speaking} onClick={speak} size="sm">
          <Codicon className="mr-1" name="play-circle" size={14} />{paused ? '继续' : '朗读'}
        </Button>
        <Button disabled={!speaking} onClick={pause} size="sm" variant="outline">
          <Codicon className="mr-1" name="debug-pause" size={14} />{paused ? '继续' : '暂停'}
        </Button>
        <Button disabled={!speaking && !paused} onClick={stop} size="sm" variant="outline">
          <Codicon className="mr-1" name="circle-slash" size={14} />停止
        </Button>
      </div>
    </div>
  )
}

function ImageStudioView() {
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState('1:1')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [images, setImages] = useState<string[]>([])

  const generate = async () => {
    if (!prompt.trim()) {return}
    setLoading(true)
    setError('')

    try {
      const sizeMap: Record<string, string> = {
        '1:1': '1024x1024',
        '16:9': '1792x1024',
        '9:16': '1024x1792',
        '4:3': '1024x768'
      }

      const result = await api<any>('/api/image/generate', 'POST', {
        prompt,
        size: sizeMap[size] || size
      })

      if (result.ok && result.path) {
        setImages(prev => [result.path, ...prev])
      } else {
        setError(result.error || result.hint || '图像生成需要配置API Key')
      }
    } catch (e: any) {
      setError(e.message || '生成失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-[var(--theme-foreground)]">
          <Codicon className="text-[var(--theme-primary)]" name="device-camera" size={18} />
          AI 插图生成
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--theme-foreground)]/70 mb-2">画面描述</label>
            <textarea
              className="min-h-28 w-full rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/50 p-3 text-sm outline-none focus:border-[var(--theme-primary)]/40"
              onChange={e => setPrompt(e.target.value)}
              placeholder="描述想要生成的插图，例如：雨夜中少年剑客站在屋檐下"
              value={prompt}
            />
          </div>
          <div className="flex gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-[var(--theme-foreground)]/70 mb-2">尺寸比例</label>
              <select
                className="rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/50 px-3 py-2 text-sm outline-none focus:border-[var(--theme-primary)]/40"
                onChange={e => setSize(e.target.value)}
                value={size}
              >
                <option value="1:1">1:1 方形</option>
                <option value="16:9">16:9 横版</option>
                <option value="9:16">9:16 竖版</option>
                <option value="4:3">4:3 封面</option>
              </select>
            </div>
            <Button className="bg-blue-500 text-white hover:bg-blue-600" disabled={loading || !prompt.trim()} onClick={generate}>
              {loading ? (<><span className="mr-2">⏳</span>生成中...</>) : (<><Codicon className="mr-1" name="sparkles" size={14} />生成插图</>)}
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-6">
          <div className="flex items-start gap-3">
            <Codicon className="text-amber-500 mt-0.5" name="warning" size={20} />
            <div>
              <h4 className="font-medium text-amber-700 dark:text-amber-300">需要配置图像模型</h4>
              <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">{error}</p>
              <p className="text-xs text-amber-500/80 mt-2">图像生成功能需要配置模型API Key。请在「设置」→「模型」中配置DALL-E等图像模型后使用。</p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-[var(--theme-foreground)]">
          <Codicon className="text-[var(--theme-primary)]" name="library" size={18} />
          生成结果
        </h3>
        {images.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {images.map((img, i) => (
              <div className="aspect-square rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/50 flex items-center justify-center overflow-hidden" key={i}>
                <img alt={`生成的插图 ${i + 1}`} className="w-full h-full object-cover" src={img} />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div className="aspect-square rounded-lg border-2 border-dashed border-[var(--dt-border)] bg-[var(--theme-card-seed)]/30 flex flex-col items-center justify-center text-[var(--theme-foreground)]/40" key={i}>
                <Codicon name="device-camera" size={32} />
                <span className="text-xs mt-2">示例占位 {i}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
