import { useMemo } from 'react'
import { Codicon } from '@/components/ui/codicon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { WorkbenchProfile } from '@/lib/writer-catalog/workbench-types'
import { DOC_TYPE_LABELS } from '@/lib/writer-catalog/types'

interface MetricResult {
  id: string
  label: string
  value: number | string | null
  status: 'ready' | 'not_configured' | 'not_applicable'
  sourceModuleId: string
  icon?: string
}

interface WorkbenchHomeProps {
  workbench: any
  profile?: WorkbenchProfile | null
  osData?: Record<string, any>
  onNavigate: (tab: string, entityId?: string) => void
}

const PHASE_LABELS: Record<string, { label: string; desc: string }> = {
  prepare: { label: '准备素材', desc: '整理资料' },
  build: { label: '建立框架', desc: '搭建结构' },
  write: { label: '持续创作', desc: '撰写内容' },
  review: { label: '校验修订', desc: '检查修复' },
  deliver: { label: '交付发布', desc: '导出交付' }
}

const PHASE_ORDER = ['prepare', 'build', 'write', 'review', 'deliver']

const METRIC_ICONS: Record<string, string> = {
  char_count: 'person',
  chapter_count: 'file-text',
  words_total: 'pencil',
  foreshadow_count: 'eye',
  timeline_events: 'clock',
  review_issues: 'alert',
  version_count: 'history',
  scene_count: 'file-media',
  character_count_script: 'person',
  beat_count: 'pulse',
  format_issues: 'warning',
  int_ext_count: 'home',
  branch_count: 'git-branch',
  ending_count: 'flag',
  variable_count: 'database',
  deadend_count: 'alert',
  entity_count: 'circle-large-outline',
  variant_count: 'copy',
  claim_issues: 'alert',
  source_count: 'link',
  verified_sources: 'check-circle',
  citations_count: 'quote',
  fact_issues: 'warning',
  thesis_count: 'lightbulb',
  evidence_count: 'file-binary',
  fallacy_count: 'alert',
  citation_issues: 'quote',
  stakeholder_count: 'organization',
  milestone_count: 'flag',
  deliverable_count: 'package',
  risk_count: 'alert-triangle',
  high_risks: 'error',
  clause_count: 'list-flat',
  compliance_issues: 'shield',
  approval_status: 'workflow',
  api_count: 'code',
  param_count: 'symbol-parameter',
  code_examples: 'code',
  validation_issues: 'warning',
  changelog_entries: 'diff',
  term_count: 'book',
  kg_nodes: 'circle-large-outline',
  kg_edges: 'git-pull-request',
  knowledge_sources: 'book',
  conflict_count: 'warning',
  doc_count: 'files',
  doc_nodes: 'list-tree',
  sections: 'list-tree',
  relation_count: 'git-pull-request',
  review_resolved: 'check',
  delivery_status: 'package',
  memories_count: 'database',
  thread_count: 'link',
  critic_reports: 'comment',
  continuity_issues: 'warning',
  tension_level: 'pulse'
}

const METRIC_LABELS: Record<string, string> = {
  char_count: '角色',
  chapter_count: '章节',
  words_total: '总字数',
  foreshadow_count: '伏笔',
  timeline_events: '时间线事件',
  review_issues: '待解决问题',
  version_count: '版本',
  scene_count: '场次',
  character_count_script: '角色',
  beat_count: '节拍',
  format_issues: '格式问题',
  int_ext_count: '内外景',
  branch_count: '分支点',
  ending_count: '结局数',
  variable_count: '状态变量',
  deadend_count: '死路数',
  entity_count: '实体',
  variant_count: 'A/B变体',
  claim_issues: '声明风险',
  source_count: '来源',
  verified_sources: '已验证',
  citations_count: '引用数',
  fact_issues: '事实问题',
  thesis_count: '论点',
  evidence_count: '证据项',
  fallacy_count: '逻辑谬误',
  citation_issues: '引用问题',
  stakeholder_count: '利益相关者',
  milestone_count: '里程碑',
  deliverable_count: '交付物',
  risk_count: '风险项',
  high_risks: '高风险',
  clause_count: '条款数',
  compliance_issues: '合规问题',
  approval_status: '审批状态',
  api_count: '接口数',
  param_count: '参数项',
  code_examples: '代码示例',
  validation_issues: '验证问题',
  changelog_entries: '变更条目',
  term_count: '术语',
  kg_nodes: '图谱节点',
  kg_edges: '图谱关系',
  knowledge_sources: '知识源',
  conflict_count: '知识冲突',
  doc_count: '文档数',
  doc_nodes: '段落节点',
  sections: '章节/段落',
  relation_count: '关系',
  review_resolved: '已解决',
  delivery_status: '交付状态',
  memories_count: '记忆条目',
  thread_count: '叙事线索',
  critic_reports: '评审报告',
  continuity_issues: '连续性问题',
  tension_level: '张力指数'
}

function formatMetricValue(value: number | string | null): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'number') {
    if (value >= 10000) return (value / 10000).toFixed(1) + '万'
    return value.toLocaleString()
  }
  return String(value)
}

export function WorkbenchHome({ workbench, profile, osData, onNavigate }: WorkbenchHomeProps) {
  const currentPhase = workbench?.phase?.current || 'prepare'
  const phaseProgress = workbench?.phase?.progress || 0
  const nextAction = workbench?.nextAction
  const attention = workbench?.attention || []
  const recentItems = workbench?.recentItems || []
  const counts = workbench?.counts || {}
  const project = workbench?.project || {}
  const summaryMetrics: MetricResult[] = workbench?.metrics || []

  const docType = project?.taxonomy?.primaryDocumentType || 'narrative_prose'
  const docTypeLabel = (DOC_TYPE_LABELS as any)[docType] || '叙事散文'
  const labels = profile?.labels || {
    contentUnit: '章节',
    knowledgeHub: '故事圣经',
    reviewCenter: '评审委员会',
    delivery: '定稿',
    workbenchTitle: '作品工坊'
  }

  const displayMetrics = useMemo(() => {
    if (summaryMetrics && summaryMetrics.length > 0) {
      return summaryMetrics.map((m: any) => ({
        ...m,
        label: METRIC_LABELS[m.id] || m.label || m.id,
        icon: METRIC_ICONS[m.id] || 'circle-outline'
      })).filter((m: any) => m.value !== null && m.status !== 'not_applicable').slice(0, 6)
    }

    const profileMetricIds = profile?.dashboardMetricIds || ['chapter_count','char_count','words_total','review_issues','version_count']
    return profileMetricIds.slice(0, 6).map(id => ({
      id,
      label: METRIC_LABELS[id] || id,
      value: counts[id] !== undefined ? counts[id] : null,
      status: counts[id] !== undefined ? 'ready' : 'not_configured',
      sourceModuleId: 'core',
      icon: METRIC_ICONS[id] || 'circle-outline'
    })).filter((m: any) => m.value !== null)
  }, [summaryMetrics, counts, profile])

  const getItemIcon = (type: string): string => {
    if (type === 'chapter') return 'file-text'
    if (type === 'character') return 'person'
    if (type === 'version') return 'history'
    if (type === 'scene') return 'file-media'
    if (type === 'document') return 'file'
    return 'history'
  }

  const getItemTypeLabel = (type: string): string => {
    if (type === 'chapter') return labels.contentUnit || '章节'
    if (type === 'character') return profile?.capabilityPackIds?.includes('narrative') ? '人物' : '实体'
    if (type === 'version') return '版本'
    if (type === 'scene') return '场次'
    if (type === 'document') return '文档'
    return '项目'
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-8 space-y-8">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{project?.title || '项目'}</h1>
            <span className="text-xs px-2 py-1 rounded-full bg-[var(--theme-primary)]/10 text-[var(--theme-primary)]">
              {docTypeLabel}
            </span>
          </div>
          <p className="text-muted-foreground text-sm">{workbench?.phase?.reason || ''}</p>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>项目进度</span>
            <span>{phaseProgress}%</span>
          </div>
          <div className="flex items-center gap-2">
            {PHASE_ORDER.map((phaseId, idx) => {
              const phase = PHASE_LABELS[phaseId]
              const isCurrent = phaseId === currentPhase
              const isPast = PHASE_ORDER.indexOf(currentPhase) > idx
              return (
                <div key={phaseId} className="flex-1">
                  <div className={cn(
                  'h-2 rounded-full overflow-hidden',
                  isPast ? 'bg-[var(--theme-primary)]/60' : isCurrent ? 'bg-muted' : 'bg-muted/50'
                )}>
                    {isCurrent && (
                      <div
                        className="h-full bg-[var(--theme-primary)] transition-all"
                        style={{ width: Math.min(100, Math.max(0, (phaseProgress - idx * 20) * 5)) + '%' }}
                      />
                    )}
                    {isPast && <div className="h-full w-full bg-[var(--theme-primary)]" />}
                  </div>
                  <div className={cn(
                  'mt-2 text-xs',
                  isCurrent ? 'text-[var(--theme-primary)] font-medium' : isPast ? 'text-foreground' : 'text-muted-foreground'
                  )}>
                    {phase.label}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Codicon name="dashboard" size={14} />
            项目统计
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {displayMetrics.map((stat: any, idx: number) => (
              <div
                key={stat.id || idx}
                className="bg-card border border-border rounded-lg p-4 hover:border-[var(--theme-primary)]/30 transition"
              >
                <div className="flex items-center justify-between mb-2">
                  <Codicon
                    name={stat.icon as any}
                    size={16}
                    className="text-[var(--theme-primary)]/70"
                  />
                  {stat.status === 'not_configured' && (
                    <span className="text-xs text-muted-foreground">未配置</span>
                  )}
                </div>
                <div className="text-2xl font-bold text-foreground">
                  {formatMetricValue(stat.value)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {nextAction && (
          <div className="bg-card border border-border rounded-lg p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-lg bg-[var(--theme-primary)]/10 flex items-center justify-center flex-shrink-0">
                <Codicon name="play" size={20} className="text-[var(--theme-primary)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-muted-foreground mb-1">下一步</div>
                <h2 className="text-xl font-semibold">{nextAction.title}</h2>
                {nextAction.description && (
                  <p className="text-sm text-muted-foreground mt-1">{nextAction.description}</p>
                )}
              </div>
              <Button
                onClick={() => onNavigate(nextAction.route, nextAction.entityId)}
                className="flex-shrink-0"
              >
                开始
              </Button>
            </div>
          </div>
        )}

        {attention.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Codicon name="alert" size={14} />
              需要处理
            </h3>
            <div className="space-y-2">
              {attention.map((item: any) => (
                <div
                  key={item.id}
                  className="bg-card border border-border rounded-md p-4 flex items-start gap-3 cursor-pointer hover:bg-muted/50"
                  onClick={() => onNavigate(item.route)}
                >
                  <div className={cn(
                    'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                    item.severity === 'critical' || item.blocking ? 'bg-red-500' :
                    item.severity === 'warning' ? 'bg-yellow-500' : 'bg-blue-500'
                  )} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{item.title}</div>
                    {item.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">来源：{item.source}</div>
                  </div>
                  <Codicon name="chevron-right" size={14} className="text-muted-foreground flex-shrink-0 mt-1" />
                </div>
              ))}
            </div>
          </div>
        )}

        {recentItems.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Codicon name="clock" size={14} />
              最近内容
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {recentItems.map((item: any) => (
                <div
                  key={item.id}
                  className="bg-card border border-border rounded-md p-3 cursor-pointer hover:bg-muted/50"
                  onClick={() => onNavigate(item.route)}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Codicon
                      name={getItemIcon(item.type) as any}
                      size={12}
                      className="text-muted-foreground"
                    />
                    <span className="text-xs text-muted-foreground">
                      {getItemTypeLabel(item.type)}
                    </span>
                  </div>
                  <div className="text-sm font-medium truncate">{item.title}</div>
                  {item.subtitle && (
                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.subtitle}</div>
                  )}
                  {item.updatedAt && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(item.updatedAt).toLocaleDateString('zh-CN')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-border">
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            {counts.words_total !== undefined && (
              <span>{counts.words_total.toLocaleString?.() || counts.words_total} 字</span>
            )}
            {counts.review_issues !== undefined && counts.review_issues > 0 && (
              <>
                <span className="text-border">·</span>
                <span>{counts.review_issues} 条待处理</span>
              </>
            )}
            {counts.version_count !== undefined && (
              <>
                <span className="text-border">·</span>
                <span>{counts.version_count} 个版本</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
