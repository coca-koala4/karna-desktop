import type { WorkbenchProfile, PhaseDefinition, WorkbenchNavigationGroup } from './workbench-types'
import type { DocumentObjectType } from './types'
import { CAPABILITY_PACKS, ALL_MODULES } from './capability-packs'

const phasePrepare: PhaseDefinition = {
  id: 'prepare',
  label: '准备',
  description: '收集资料、导入文件、确定方向',
  suggestedModuleIds: ['guide', 'documents', 'knowledge'],
  completionCheck: { minModulesReady: 2 }
}

const phaseBuild: PhaseDefinition = {
  id: 'build',
  label: '建立',
  description: '构建结构、设定、实体和框架',
  suggestedModuleIds: ['structure', 'entities'],
  completionCheck: { minModulesReady: 1 }
}

const phaseWrite: PhaseDefinition = {
  id: 'write',
  label: '创作',
  description: '内容创作、AI协作和编辑',
  suggestedModuleIds: ['editor', 'memory', 'search'],
  completionCheck: { minModulesReady: 1 }
}

const phaseReview: PhaseDefinition = {
  id: 'review',
  label: '校验',
  description: '审阅、修订、质量检查',
  suggestedModuleIds: ['review', 'versions'],
  completionCheck: { minModulesReady: 1 }
}

const phaseDeliver: PhaseDefinition = {
  id: 'deliver',
  label: '交付',
  description: '导出、发布、交付',
  suggestedModuleIds: ['delivery'],
  completionCheck: { minModulesReady: 1 }
}

const CORE_PHASES: PhaseDefinition[] = [phasePrepare, phaseBuild, phaseWrite, phaseReview, phaseDeliver]

function coreNav(labels: { knowledgeHub: string; entities: string }): WorkbenchNavigationGroup[] {
  return [
    { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
    { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge'] },
    { id: 'build', label: '建立', icon: 'list-tree', moduleIds: ['structure', 'entities'] },
    { id: 'write', label: '创作', icon: 'edit', moduleIds: ['editor', 'memory', 'search'] },
    { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['review', 'versions'] },
    { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['delivery'] }
  ]
}

export const WORKBENCH_PROFILES: WorkbenchProfile[] = [
  {
    id: 'narrative-prose',
    name: '叙事散文',
    description: '小说、散文、故事等叙事类创作',
    applicableDocumentTypes: ['narrative_prose'],
    applicableFormIds: ['web-novel','literary-novel','short-story','biography','prose-essay','poetry-collection','childrens-story','book-publishing'],
    phases: CORE_PHASES,
    navigation: [
      { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
      { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge'] },
      { id: 'build', label: '设定', icon: 'book', moduleIds: ['story-bible', 'structure', 'entities'] },
      { id: 'write', label: '创作', icon: 'edit', moduleIds: ['editor', 'narrative-state', 'memory', 'search'] },
      { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['critic-council', 'continuity', 'review', 'versions'] },
      { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['delivery'] }
    ],
    dashboardMetricIds: ['char_count','chapter_count','words_total','foreshadow_count','timeline_events','review_issues','version_count'],
    capabilityPackIds: ['core', 'narrative'],
    recommendedWorkflowIds: ['narrative-long-form','narrative-chapter-continuity','narrative-pacing-assessment','narrative-character-consistency'],
    labels: { contentUnit: '章节', knowledgeHub: '故事圣经', reviewCenter: '评审委员会', delivery: '定稿', workbenchTitle: '作品工坊' }
  },
  {
    id: 'script-dialogue',
    name: '剧本对白',
    description: '影视剧本、舞台剧本、音频剧本',
    applicableDocumentTypes: ['script_dialogue'],
    applicableFormIds: ['feature-film','tv-script','animation-script','documentary-script','stage-play','audio-drama','video-live'],
    phases: CORE_PHASES,
    navigation: [
      { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
      { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge'] },
      { id: 'build', label: '剧本结构', icon: 'list-ordered', moduleIds: ['scene-list', 'character-dossier', 'structure'] },
      { id: 'write', label: '创作', icon: 'edit', moduleIds: ['editor', 'narrative-state', 'memory', 'search'] },
      { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['script-format', 'critic-council', 'review', 'versions'] },
      { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['delivery'] }
    ],
    dashboardMetricIds: ['scene_count','character_count_script','words_total','beat_count','format_issues','int_ext_count','version_count'],
    capabilityPackIds: ['core', 'narrative', 'script'],
    recommendedWorkflowIds: ['script-development','script-dialogue-polish','script-scene-pacing','script-scene-outline'],
    labels: { contentUnit: '场次', knowledgeHub: '剧集圣经', reviewCenter: '剧本审阅', delivery: '剧本定稿', workbenchTitle: '剧本工坊' }
  },
  {
    id: 'interactive-narrative',
    name: '互动叙事',
    description: '游戏剧情、互动小说、分支故事',
    applicableDocumentTypes: ['interactive_narrative'],
    applicableFormIds: ['game-main-story','interactive-fiction','murder-mystery'],
    phases: CORE_PHASES,
    navigation: [
      { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
      { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge'] },
      { id: 'build', label: '分支设计', icon: 'git-branch', moduleIds: ['branch-map', 'state-vars', 'entities'] },
      { id: 'write', label: '创作', icon: 'edit', moduleIds: ['editor', 'memory', 'search'] },
      { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['review', 'versions'] },
      { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['delivery'] }
    ],
    dashboardMetricIds: ['branch_count','ending_count','variable_count','entity_count','words_total','deadend_count','version_count'],
    capabilityPackIds: ['core', 'interactive'],
    recommendedWorkflowIds: ['interactive-branch-design','interactive-branch-consistency','interactive-npc-dialogue','interactive-state-validation'],
    labels: { contentUnit: '剧情节点', knowledgeHub: '世界设定', reviewCenter: '分支验证', delivery: '剧情包', workbenchTitle: '互动工坊' }
  },
  {
    id: 'marketing-copy',
    name: '营销文案',
    description: '品牌、广告、电商、社媒文案',
    applicableDocumentTypes: ['marketing_copy'],
    applicableFormIds: ['brand-copywriting','ad-copywriting','ecommerce-copy','social-media','sales-copy','video-live'],
    phases: CORE_PHASES,
    navigation: [
      { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
      { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge', 'brief'] },
      { id: 'build', label: '策略', icon: 'lightbulb', moduleIds: ['structure', 'entities'] },
      { id: 'write', label: '创作', icon: 'edit', moduleIds: ['editor', 'ab-variants', 'memory', 'search'] },
      { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['claims-check', 'review', 'versions'] },
      { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['delivery'] }
    ],
    dashboardMetricIds: ['words_total','variant_count','claim_issues','review_issues','version_count'],
    capabilityPackIds: ['core', 'marketing'],
    recommendedWorkflowIds: ['marketing-copy-workflow','marketing-ab-variants','marketing-fact-check','marketing-channel-adaptation'],
    labels: { contentUnit: '文案', knowledgeHub: '品牌资产', reviewCenter: '合规审阅', delivery: '投放包', workbenchTitle: '文案工坊' }
  },
  {
    id: 'informational-article',
    name: '资讯文章',
    description: '新闻报道、科普文章、白皮书',
    applicableDocumentTypes: ['informational_article'],
    applicableFormIds: ['content-marketing','news-reporting','press-release'],
    phases: CORE_PHASES,
    navigation: [
      { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
      { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge', 'sources'] },
      { id: 'build', label: '结构', icon: 'list-tree', moduleIds: ['structure'] },
      { id: 'write', label: '创作', icon: 'edit', moduleIds: ['editor', 'memory', 'search'] },
      { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['fact-check', 'review', 'versions'] },
      { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['delivery'] }
    ],
    dashboardMetricIds: ['words_total','source_count','verified_sources','citations_count','fact_issues','review_issues','version_count'],
    capabilityPackIds: ['core', 'informational'],
    recommendedWorkflowIds: ['informational-article-workflow','informational-fact-check','informational-structure-optimization','informational-multi-version'],
    labels: { contentUnit: '文章', knowledgeHub: '资料台', reviewCenter: '事实核查', delivery: '发布', workbenchTitle: '写作工坊' }
  },
  {
    id: 'argumentative-document',
    name: '论证文档',
    description: '学术论文、研究报告、论证性文章',
    applicableDocumentTypes: ['argumentative_document'],
    applicableFormIds: ['academic-paper','research-report'],
    phases: CORE_PHASES,
    navigation: [
      { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
      { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge', 'sources'] },
      { id: 'build', label: '论证', icon: 'git-merge', moduleIds: ['argument-tree', 'evidence-matrix', 'structure'] },
      { id: 'write', label: '创作', icon: 'edit', moduleIds: ['editor', 'memory', 'search'] },
      { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['counter-arguments', 'citations', 'fact-check', 'review', 'versions'] },
      { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['delivery'] }
    ],
    dashboardMetricIds: ['words_total','thesis_count','evidence_count','citations_count','fallacy_count','citation_issues','version_count'],
    capabilityPackIds: ['core', 'informational', 'argumentative'],
    recommendedWorkflowIds: ['argumentative-paper-workflow','argumentative-logic-check','argumentative-citation-check','argumentative-counter-review','informational-fact-check'],
    labels: { contentUnit: '章节', knowledgeHub: '文献库', reviewCenter: '同行审阅', delivery: '投稿定稿', workbenchTitle: '学术工坊' }
  },
  {
    id: 'structured-business',
    name: '结构化商务',
    description: '商业计划、项目方案、标书、管理文档',
    applicableDocumentTypes: ['structured_business_doc'],
    applicableFormIds: ['grant-writing','business-plan','proposal-bid','internal-docs','book-proposal','government-report'],
    phases: CORE_PHASES,
    navigation: [
      { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
      { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge', 'stakeholders'] },
      { id: 'build', label: '规划', icon: 'flag', moduleIds: ['milestones', 'structure'] },
      { id: 'write', label: '撰写', icon: 'edit', moduleIds: ['editor', 'memory', 'search'] },
      { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['risk-assessment', 'counter-arguments', 'review', 'versions'] },
      { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['delivery'] }
    ],
    dashboardMetricIds: ['words_total','stakeholder_count','milestone_count','deliverable_count','risk_count','high_risks','version_count'],
    capabilityPackIds: ['core', 'business', 'argumentative'],
    recommendedWorkflowIds: ['business-proposal-workflow','business-risk-assessment','business-milestone-planning','argumentative-counter-review'],
    labels: { contentUnit: '章节', knowledgeHub: '项目资料', reviewCenter: '风险评审', delivery: '提交', workbenchTitle: '商务工坊' }
  },
  {
    id: 'regulated-document',
    name: '受监管文档',
    description: '合同、法律文书、合规文档、政务公文',
    applicableDocumentTypes: ['regulated_document'],
    applicableFormIds: ['legal-docs','government-docs','compliance-docs'],
    phases: CORE_PHASES,
    navigation: [
      { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
      { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge'] },
      { id: 'build', label: '条款', icon: 'list-flat', moduleIds: ['clause-matrix', 'structure'] },
      { id: 'write', label: '起草', icon: 'edit', moduleIds: ['editor', 'memory', 'search'] },
      { id: 'review', label: '校验', icon: 'shield', moduleIds: ['compliance-check', 'review', 'versions'] },
      { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['audit-log', 'delivery'] }
    ],
    dashboardMetricIds: ['clause_count','words_total','compliance_issues','approval_status','review_issues','version_count'],
    capabilityPackIds: ['core', 'regulated'],
    recommendedWorkflowIds: ['legal-review'],
    labels: { contentUnit: '条款', knowledgeHub: '法规依据', reviewCenter: '合规审查', delivery: '签署定稿', workbenchTitle: '法务工坊' }
  },
  {
    id: 'technical-document',
    name: '技术文档',
    description: 'API文档、技术方案、用户手册',
    applicableDocumentTypes: ['technical_document'],
    applicableFormIds: ['software-docs','product-docs','testing-docs'],
    phases: CORE_PHASES,
    navigation: [
      { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
      { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge'] },
      { id: 'build', label: '结构', icon: 'code', moduleIds: ['api-reference', 'structure'] },
      { id: 'write', label: '编写', icon: 'edit', moduleIds: ['editor', 'memory', 'search'] },
      { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['code-validation', 'review', 'versions'] },
      { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['changelog', 'delivery'] }
    ],
    dashboardMetricIds: ['api_count','param_count','code_examples','words_total','validation_issues','changelog_entries','version_count'],
    capabilityPackIds: ['core', 'technical'],
    recommendedWorkflowIds: ['tech-documentation','qa-testing','product-documentation'],
    labels: { contentUnit: '章节', knowledgeHub: '技术资料', reviewCenter: '一致性检查', delivery: '发布', workbenchTitle: '文档工坊' }
  },
  {
    id: 'knowledge-asset',
    name: '知识资产',
    description: 'Wiki、知识库、术语表、RAG库',
    applicableDocumentTypes: ['knowledge_asset'],
    applicableFormIds: ['knowledge-base','creative-workspace'],
    phases: CORE_PHASES,
    navigation: [
      { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
      { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge'] },
      { id: 'build', label: '构建', icon: 'git-branch', moduleIds: ['glossary', 'knowledge-graph', 'entities'] },
      { id: 'write', label: '编写', icon: 'edit', moduleIds: ['editor', 'memory', 'search'] },
      { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['ingest-quality', 'review', 'versions'] },
      { id: 'deliver', label: '发布', icon: 'package', moduleIds: ['delivery'] }
    ],
    dashboardMetricIds: ['term_count','kg_nodes','kg_edges','entity_count','knowledge_sources','conflict_count','version_count'],
    capabilityPackIds: ['core', 'knowledge'],
    recommendedWorkflowIds: ['knowledge-management','creative-process'],
    labels: { contentUnit: '页面', knowledgeHub: '知识管理', reviewCenter: '质量检查', delivery: '发布', workbenchTitle: '知识工坊' }
  }
]

export function findProfileForDocumentType(docType: DocumentObjectType): WorkbenchProfile | undefined {
  return WORKBENCH_PROFILES.find(p => p.applicableDocumentTypes.includes(docType))
}

export function findProfileForForm(formId: string): WorkbenchProfile | undefined {
  return WORKBENCH_PROFILES.find(p => p.applicableFormIds.includes(formId))
}

export function getProfileById(id: string): WorkbenchProfile | undefined {
  return WORKBENCH_PROFILES.find(p => p.id === id)
}

export function resolveProfile(primaryDocumentType: DocumentObjectType, formId?: string): WorkbenchProfile {
  if (formId) {
    const byForm = findProfileForForm(formId)
    if (byForm) return byForm
  }
  return findProfileForDocumentType(primaryDocumentType) || WORKBENCH_PROFILES[0]
}

export function resolveModulesForProfile(profile: WorkbenchProfile, enabledModuleIds?: string[], disabledModuleIds?: string[]): typeof ALL_MODULES {
  const packModuleIds = new Set<string>()
  for (const packId of profile.capabilityPackIds) {
    const pack = CAPABILITY_PACKS.find(p => p.id === packId)
    if (pack) {
      for (const mid of pack.moduleIds) packModuleIds.add(mid)
    }
  }
  for (const nav of profile.navigation) {
    for (const mid of nav.moduleIds) packModuleIds.add(mid)
  }
  const disabled = new Set(disabledModuleIds || [])
  const extraEnabled = new Set(enabledModuleIds || [])
  return ALL_MODULES.filter(m => (packModuleIds.has(m.id) || extraEnabled.has(m.id)) && !disabled.has(m.id))
    .sort((a, b) => a.navOrder - b.navOrder)
}
