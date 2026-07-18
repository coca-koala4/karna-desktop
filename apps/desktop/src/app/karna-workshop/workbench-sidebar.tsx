import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'
import type { WorkbenchProfile, WorkbenchNavigationGroup } from '@/lib/writer-catalog/workbench-types'

interface WorkbenchSidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  profile?: WorkbenchProfile | null
  currentPhase?: string
  phaseProgress?: number
}

const PHASE_ICONS: Record<string, string> = {
  overview: 'home',
  prepare: 'folder-opened',
  build: 'list-tree',
  write: 'edit',
  review: 'checklist',
  deliver: 'package'
}

const MODULE_ICONS: Record<string, string> = {
  dashboard: 'layout',
  guide: 'wrench',
  documents: 'files',
  knowledge: 'book',
  'story-bible': 'book',
  structure: 'list-tree',
  entities: 'git-branch',
  editor: 'edit',
  'narrative-state': 'pulse',
  memory: 'database',
  search: 'search',
  'critic-council': 'checklist',
  continuity: 'link',
  review: 'checklist',
  versions: 'history',
  delivery: 'package',
  wiki: 'globe',
  graph: 'git-branch',
  'character-graph': 'git-pull-request',
  timeline: 'clock',
  state: 'pulse',
  critic: 'checklist',
  safety: 'shield',
  rag: 'book-open',
  benchmark: 'zap',
  images: 'device-camera',
  'scene-list': 'list-ordered',
  'character-dossier': 'person',
  'script-format': 'symbol-misc',
  'branch-map': 'git-branch',
  'state-vars': 'database',
  brief: 'file-text',
  'ab-variants': 'split-horizontal',
  'claims-check': 'shield-check',
  sources: 'link',
  'fact-check': 'search-check',
  'argument-tree': 'git-merge',
  'evidence-matrix': 'layout-grid',
  'counter-arguments': 'scale',
  citations: 'quote',
  stakeholders: 'organization',
  milestones: 'flag',
  'risk-assessment': 'alert-triangle',
  'clause-matrix': 'list-flat',
  'compliance-check': 'shield',
  'audit-log': 'history',
  'api-reference': 'code',
  'code-validation': 'play',
  changelog: 'diff',
  glossary: 'book',
  'knowledge-graph': 'git-branch',
  'ingest-quality': 'check'
}

const MODULE_LABELS: Record<string, string> = {
  dashboard: '\u9879\u76ee\u4e3b\u9875', guide: '\u5f15\u5bfc\u4fee\u590d', documents: '\u6587\u4ef6\u4e0e\u8d44\u6599', knowledge: '\u77e5\u8bc6\u6e90',
  'story-bible': '\u6545\u4e8b\u5723\u7ecf', structure: '\u9879\u76ee\u7ed3\u6784', entities: '\u5b9e\u4f53\u5173\u7cfb', editor: '\u6587\u6863\u7f16\u8f91',
  'narrative-state': '\u53d9\u4e8b\u72b6\u6001', memory: '\u521b\u4f5c\u8bb0\u5fc6', search: '\u521b\u610f\u68c0\u7d22', 'critic-council': '\u8bc4\u5ba1\u59d4\u5458\u4f1a',
  continuity: '\u8fde\u7eed\u6027\u68c0\u67e5', review: '\u5ba1\u9605\u4e2d\u5fc3', versions: '\u7248\u672c\u8bb0\u5f55', delivery: '\u4ea4\u4ed8\u5bfc\u51fa',
  wiki: '\u52a8\u6001\u767e\u79d1', graph: '\u77e5\u8bc6\u56fe\u8c31', 'character-graph': '\u4eba\u7269\u5173\u7cfb\u56fe', timeline: '\u65f6\u95f4\u7ebf',
  state: '\u53d9\u4e8b\u72b6\u6001', critic: '\u8bc4\u5ba1', safety: '\u5b89\u5168\u4e0e\u7248\u6743', rag: 'RAG \u7d22\u5f15', benchmark: '\u57fa\u51c6\u6d4b\u8bd5', images: '\u63d2\u56fe',
  'scene-list': '\u573a\u6b21\u8868', 'character-dossier': '\u4eba\u7269\u5c0f\u4f20', 'script-format': '\u5267\u672c\u683c\u5f0f', 'branch-map': '\u5206\u652f\u56fe',
  'state-vars': '\u72b6\u6001\u53d8\u91cf', brief: '\u8425\u9500 Brief', 'ab-variants': 'A/B \u53d8\u4f53', 'claims-check': '\u58f0\u660e\u6838\u67e5',
  sources: '\u6765\u6e90\u7ba1\u7406', 'fact-check': '\u4e8b\u5b9e\u6838\u67e5', 'argument-tree': '\u8bba\u8bc1\u6811', 'evidence-matrix': '\u8bc1\u636e\u77e9\u9635',
  'counter-arguments': '\u53cd\u65b9\u5ba1\u9605', citations: '\u5f15\u6587\u683c\u5f0f', stakeholders: '\u5229\u76ca\u76f8\u5173\u8005', milestones: '\u91cc\u7a0b\u7891',
  'risk-assessment': '\u98ce\u9669\u8bc4\u4f30', 'clause-matrix': '\u6761\u6b3e\u77e9\u9635', 'compliance-check': '\u5408\u89c4\u5ba1\u67e5', 'audit-log': '\u5ba1\u8ba1\u65e5\u5fd7',
  'api-reference': 'API/\u63a5\u53e3', 'code-validation': '\u4ee3\u7801\u9a8c\u8bc1', changelog: '\u53d8\u66f4\u65e5\u5fd7', glossary: '\u672f\u8bed\u8868',
  'knowledge-graph': '\u77e5\u8bc6\u56fe\u8c31', 'ingest-quality': '\u6444\u53d6\u8d28\u91cf'
}

export function WorkbenchSidebar({ activeTab, onTabChange, profile, currentPhase, phaseProgress }: WorkbenchSidebarProps) {
  const navigation: WorkbenchNavigationGroup[] = profile?.navigation || [
    { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
    { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge'] },
    { id: 'build', label: '建立', icon: 'book', moduleIds: ['story-bible', 'structure', 'entities'] },
    { id: 'write', label: '创作', icon: 'edit', moduleIds: ['editor', 'narrative-state', 'memory', 'search'] },
    { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['critic-council', 'continuity', 'review', 'versions'] },
    { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['delivery'] }
  ]

  const getModuleIcon = (moduleId: string): string => {
    return MODULE_ICONS[moduleId] || 'circle-outline'
  }

  const getModuleLabel = (moduleId: string): string => {
    return MODULE_LABELS[moduleId] || moduleId
  }

  return (
    <aside className="w-[240px] h-full flex flex-col border-r border-border bg-card/30">
      <div className="p-4 border-b border-border">
        <button
          onClick={() => onTabChange('dashboard')}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors',
            activeTab === 'dashboard'
              ? 'bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] font-medium'
              : 'hover:bg-muted text-foreground'
          )}
        >
          <Codicon name="home" size={16} />
          <span>{profile?.labels?.contentUnit ? `${profile.labels.workbenchTitle || '作品工坊'}主页` : '项目主页'}</span>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {navigation.map((group) => {
          if (group.id === 'overview') return null
          const isActive = group.moduleIds.some(mid => mid === activeTab || LEGACY_TAB_TO_MODULE[activeTab] === mid)
          const isCurrentPhase = group.id === currentPhase
          return (
            <div key={group.id} className="mb-2">
              <div className="px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isCurrentPhase && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--theme-primary)] animate-pulse" />
                  )}
                  <span className={cn(
                    'text-xs font-medium tracking-wide',
                    isCurrentPhase ? 'text-[var(--theme-primary)]' : 'text-muted-foreground'
                  )}>
                    {group.label}
                  </span>
                </div>
                {isCurrentPhase && phaseProgress != null && (
                  <span className="text-xs text-muted-foreground">{phaseProgress}%</span>
                )}
              </div>
              <div className="space-y-0.5 px-2">
                {group.moduleIds.map((moduleId) => {
                  const isTabActive = activeTab === moduleId || LEGACY_TAB_TO_MODULE[activeTab] === moduleId
                  return (
                    <button
                      key={moduleId}
                      onClick={() => onTabChange(MODULE_TO_LEGACY_TAB[moduleId] || moduleId)}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-left transition-colors',
                        isTabActive
                          ? 'bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] font-medium'
                          : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Codicon name={getModuleIcon(moduleId) as any} size={14} />
                      <span>{getModuleLabel(moduleId)}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-border p-2 space-y-0.5">
        <button
          onClick={() => onTabChange('search')}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-left transition-colors',
            activeTab === 'search'
              ? 'bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] font-medium'
              : 'hover:bg-muted text-muted-foreground hover:text-foreground'
          )}
        >
          <Codicon name="search" size={14} />
          <span>创意检索</span>
        </button>
        <button
          onClick={() => onTabChange('diagnostics')}
          className={cn(
            'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm text-left transition-colors',
            activeTab === 'diagnostics'
              ? 'bg-[var(--theme-primary)]/10 text-[var(--theme-primary)] font-medium'
              : 'hover:bg-muted text-muted-foreground hover:text-foreground'
          )}
        >
          <Codicon name="settings" size={14} />
          <span>项目诊断</span>
        </button>
      </div>
    </aside>
  )
}

const LEGACY_TAB_TO_MODULE: Record<string, string> = {
  bible: 'story-bible',
  wiki: 'knowledge',
  graph: 'entities',
  'character-graph': 'entities',
  timeline: 'story-bible',
  state: 'narrative-state',
  critic: 'critic-council',
  safety: 'review',
  rag: 'knowledge',
  benchmark: 'review',
  documents: 'documents',
  memory: 'memory',
  search: 'search',
  guide: 'guide',
  delivery: 'delivery',
  versions: 'versions',
  structure: 'bible',
  editor: 'bible',
  continuity: 'critic',
  images: 'images'
}

const MODULE_TO_LEGACY_TAB: Record<string, string> = {
  'story-bible': 'bible',
  knowledge: 'wiki',
  entities: 'graph',
  'narrative-state': 'state',
  'critic-council': 'critic',
  review: 'safety',
  documents: 'documents',
  memory: 'memory',
  search: 'search',
  guide: 'guide',
  delivery: 'delivery',
  versions: 'versions',
  structure: 'bible',
  continuity: 'critic',
  wiki: 'wiki',
  graph: 'graph',
  'character-graph': 'character-graph',
  timeline: 'timeline',
  state: 'state',
  critic: 'critic',
  safety: 'safety',
  rag: 'rag',
  benchmark: 'benchmark',
  images: 'images'
}
