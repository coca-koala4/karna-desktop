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
  'narrative-state': 'activity',
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
  state: 'activity',
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
  dashboard: '项目主页',
  guide: '引导修复',
  documents: '文件与资料',
  knowledge: '知识源',
  'story-bible': '故事圣经',
  structure: '项目结构',
  entities: '实体关系',
  editor: '文档编辑',
  'narrative-state': '叙事状态',
  memory: '创作记忆',
  search: '创意检索',
  'critic-council': '评审委员会',
  continuity: '连续性检查',
  review: '审阅中心',
  versions: '版本记录',
  delivery: '交付导出',
  wiki: '活百科',
  graph: '知识图谱',
  'character-graph': '人物关系图',
  timeline: '时间轴',
  state: '叙事状态',
  critic: '评审',
  safety: '安全与版权',
  rag: 'RAG索引',
  benchmark: '基准测试',
  images: '插图',
  'scene-list': '场次表',
  'character-dossier': '人物小传',
  'script-format': '剧本格式',
  'branch-map': '分支图',
  'state-vars': '状态变量',
  brief: '营销Brief',
  'ab-variants': 'A/B变体',
  'claims-check': '功效声明核查',
  sources: '来源管理',
  'fact-check': '事实核查',
  'argument-tree': '论证树',
  'evidence-matrix': '证据矩阵',
  'counter-arguments': '反方审阅',
  citations: '引文格式',
  stakeholders: '利益相关者',
  milestones: '里程碑',
  'risk-assessment': '风险评估',
  'clause-matrix': '条款矩阵',
  'compliance-check': '合规审查',
  'audit-log': '审计日志',
  'api-reference': 'API/接口',
  'code-validation': '代码示例验证',
  changelog: '变更日志',
  glossary: '术语表',
  'knowledge-graph': '知识图谱',
  'ingest-quality': '摄取质量'
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
