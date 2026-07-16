import type { CapabilityPackDefinition, WorkbenchModuleDefinition, MetricDefinition } from './workbench-types'
import { CORE_MODULES, CORE_METRICS } from './core-modules'

const narrativeModules: WorkbenchModuleDefinition[] = [
  {
    id: 'story-bible',
    version: 1,
    title: '故事圣经',
    description: '人物、地点、世界观、伏笔和时间线管理',
    icon: 'book',
    group: 'narrative',
    applicableDocumentTypes: ['narrative_prose'],
    capabilityPackId: 'narrative',
    phase: 'build',
    rendererKey: 'story-bible',
    actions: [
      { id: 'get', label: '获取圣经', method: 'GET' },
      { id: 'upsert', label: '添加/更新条目', method: 'POST' },
      { id: 'delete', label: '删除条目', method: 'POST' },
      { id: 'analyze', label: 'AI分析重建', method: 'POST' }
    ],
    metricIds: ['char_count', 'chapter_count', 'foreshadow_count', 'timeline_events'],
    isCore: false,
    navOrder: 100
  },
  {
    id: 'narrative-state',
    version: 1,
    title: '叙事状态',
    description: '故事线索、节奏曲线和当前叙事状态',
    icon: 'activity',
    group: 'narrative',
    applicableDocumentTypes: ['narrative_prose', 'script_dialogue'],
    capabilityPackId: 'narrative',
    phase: 'write',
    rendererKey: 'narrative-state',
    actions: [
      { id: 'get', label: '获取状态', method: 'GET' },
      { id: 'update', label: '更新状态', method: 'POST' }
    ],
    metricIds: ['thread_count', 'tension_level'],
    isCore: false,
    navOrder: 101
  },
  {
    id: 'critic-council',
    version: 1,
    title: '评审委员会',
    description: '多角色审阅反馈和改进建议',
    icon: 'checklist',
    group: 'narrative',
    applicableDocumentTypes: ['narrative_prose', 'script_dialogue'],
    capabilityPackId: 'narrative',
    phase: 'review',
    rendererKey: 'critic-council',
    actions: [
      { id: 'get', label: '获取评审', method: 'GET' },
      { id: 'review', label: '运行评审', method: 'POST' }
    ],
    metricIds: ['critic_reports'],
    isCore: false,
    navOrder: 102
  },
  {
    id: 'continuity',
    version: 1,
    title: '连续性检查',
    description: '章节间情节、人物、时间线连续性校对',
    icon: 'link',
    group: 'narrative',
    applicableDocumentTypes: ['narrative_prose'],
    capabilityPackId: 'narrative',
    phase: 'review',
    rendererKey: 'continuity',
    actions: [
      { id: 'check', label: '检查连续性', method: 'POST' }
    ],
    metricIds: ['continuity_issues'],
    isCore: false,
    navOrder: 103
  }
]

const narrativeMetrics: MetricDefinition[] = [
  { id: 'char_count', label: '角色', icon: 'person', sourceModuleId: 'story-bible', applicableDocumentTypes: ['narrative_prose'], valueType: 'number', format: 'count' },
  { id: 'chapter_count', label: '章节', icon: 'file', sourceModuleId: 'story-bible', applicableDocumentTypes: ['narrative_prose'], valueType: 'number', format: 'count' },
  { id: 'foreshadow_count', label: '伏笔', icon: 'eye', sourceModuleId: 'story-bible', applicableDocumentTypes: ['narrative_prose'], valueType: 'number', format: 'count' },
  { id: 'timeline_events', label: '时间线事件', icon: 'clock', sourceModuleId: 'story-bible', applicableDocumentTypes: ['narrative_prose'], valueType: 'number', format: 'count' },
  { id: 'thread_count', label: '叙事线索', icon: 'link', sourceModuleId: 'narrative-state', applicableDocumentTypes: ['narrative_prose', 'script_dialogue'], valueType: 'number', format: 'count' },
  { id: 'tension_level', label: '张力指数', icon: 'pulse', sourceModuleId: 'narrative-state', applicableDocumentTypes: ['narrative_prose', 'script_dialogue'], valueType: 'string', format: 'text' },
  { id: 'critic_reports', label: '评审报告', icon: 'comment', sourceModuleId: 'critic-council', applicableDocumentTypes: ['narrative_prose', 'script_dialogue'], valueType: 'number', format: 'count' },
  { id: 'continuity_issues', label: '连续性问题', icon: 'warning', sourceModuleId: 'continuity', applicableDocumentTypes: ['narrative_prose'], valueType: 'number', format: 'count' }
]

const scriptModules: WorkbenchModuleDefinition[] = [
  {
    id: 'scene-list',
    version: 1,
    title: '场次表',
    description: '分场大纲、节拍表和场景管理',
    icon: 'list-ordered',
    group: 'script',
    applicableDocumentTypes: ['script_dialogue'],
    capabilityPackId: 'script',
    phase: 'build',
    rendererKey: 'scene-list',
    actions: [
      { id: 'list', label: '场次列表', method: 'GET' },
      { id: 'generate', label: '生成分场', method: 'POST' }
    ],
    metricIds: ['scene_count', 'beat_count'],
    isCore: false,
    navOrder: 110
  },
  {
    id: 'character-dossier',
    version: 1,
    title: '人物小传',
    description: '角色人物小传和对白风格',
    icon: 'person',
    group: 'script',
    applicableDocumentTypes: ['script_dialogue'],
    capabilityPackId: 'script',
    phase: 'build',
    rendererKey: 'character-dossier',
    actions: [
      { id: 'list', label: '人物列表', method: 'GET' },
      { id: 'upsert', label: '编辑人物', method: 'POST' }
    ],
    metricIds: ['character_count_script'],
    isCore: false,
    navOrder: 111
  },
  {
    id: 'script-format',
    version: 1,
    title: '剧本格式',
    description: '剧本格式检查和规范化',
    icon: 'symbol-misc',
    group: 'script',
    applicableDocumentTypes: ['script_dialogue'],
    capabilityPackId: 'script',
    phase: 'review',
    rendererKey: 'script-format',
    actions: [
      { id: 'check', label: '格式检查', method: 'POST' },
      { id: 'fix', label: '自动修正', method: 'POST' }
    ],
    metricIds: ['format_issues', 'int_ext_count'],
    isCore: false,
    navOrder: 112
  }
]

const scriptMetrics: MetricDefinition[] = [
  { id: 'scene_count', label: '场次', icon: 'film', sourceModuleId: 'scene-list', applicableDocumentTypes: ['script_dialogue'], valueType: 'number', format: 'count' },
  { id: 'beat_count', label: '节拍', icon: 'pulse', sourceModuleId: 'scene-list', applicableDocumentTypes: ['script_dialogue'], valueType: 'number', format: 'count' },
  { id: 'character_count_script', label: '角色', icon: 'person', sourceModuleId: 'character-dossier', applicableDocumentTypes: ['script_dialogue'], valueType: 'number', format: 'count' },
  { id: 'format_issues', label: '格式问题', icon: 'warning', sourceModuleId: 'script-format', applicableDocumentTypes: ['script_dialogue'], valueType: 'number', format: 'count' },
  { id: 'int_ext_count', label: '内外景', icon: 'home', sourceModuleId: 'script-format', applicableDocumentTypes: ['script_dialogue'], valueType: 'string', format: 'text' }
]

const interactiveModules: WorkbenchModuleDefinition[] = [
  {
    id: 'branch-map',
    version: 1,
    title: '分支图',
    description: '剧情分支、选项和路径可视化',
    icon: 'git-branch',
    group: 'interactive',
    applicableDocumentTypes: ['interactive_narrative'],
    capabilityPackId: 'interactive',
    phase: 'build',
    rendererKey: 'branch-map',
    actions: [
      { id: 'map', label: '获取分支图', method: 'GET' },
      { id: 'validate', label: '验证分支', method: 'POST' }
    ],
    metricIds: ['branch_count', 'ending_count'],
    isCore: false,
    navOrder: 120
  },
  {
    id: 'state-vars',
    version: 1,
    title: '状态变量',
    description: '游戏状态变量、条件表达式和标记',
    icon: 'database',
    group: 'interactive',
    applicableDocumentTypes: ['interactive_narrative'],
    capabilityPackId: 'interactive',
    phase: 'build',
    rendererKey: 'state-vars',
    actions: [
      { id: 'list', label: '变量列表', method: 'GET' },
      { id: 'validate', label: '校验变量', method: 'POST' }
    ],
    metricIds: ['variable_count', 'deadend_count'],
    isCore: false,
    navOrder: 121
  }
]

const interactiveMetrics: MetricDefinition[] = [
  { id: 'branch_count', label: '分支点', icon: 'git-branch', sourceModuleId: 'branch-map', applicableDocumentTypes: ['interactive_narrative'], valueType: 'number', format: 'count' },
  { id: 'ending_count', label: '结局数', icon: 'flag', sourceModuleId: 'branch-map', applicableDocumentTypes: ['interactive_narrative'], valueType: 'number', format: 'count' },
  { id: 'variable_count', label: '状态变量', icon: 'database', sourceModuleId: 'state-vars', applicableDocumentTypes: ['interactive_narrative'], valueType: 'number', format: 'count' },
  { id: 'deadend_count', label: '死路数', icon: 'alert', sourceModuleId: 'state-vars', applicableDocumentTypes: ['interactive_narrative'], valueType: 'number', format: 'count' }
]

const marketingModules: WorkbenchModuleDefinition[] = [
  {
    id: 'brief',
    version: 1,
    title: '营销Brief',
    description: '品牌Brief、受众画像和传播目标',
    icon: 'file-text',
    group: 'marketing',
    applicableDocumentTypes: ['marketing_copy'],
    capabilityPackId: 'marketing',
    phase: 'prepare',
    rendererKey: 'brief',
    actions: [
      { id: 'get', label: '获取Brief', method: 'GET' },
      { id: 'update', label: '更新Brief', method: 'POST' }
    ],
    metricIds: ['brief_status'],
    isCore: false,
    navOrder: 130
  },
  {
    id: 'ab-variants',
    version: 1,
    title: 'A/B变体',
    description: '多版本文案变体生成和测试方案',
    icon: 'split-horizontal',
    group: 'marketing',
    applicableDocumentTypes: ['marketing_copy'],
    capabilityPackId: 'marketing',
    phase: 'write',
    rendererKey: 'ab-variants',
    actions: [
      { id: 'list', label: '变体列表', method: 'GET' },
      { id: 'generate', label: '生成变体', method: 'POST' }
    ],
    metricIds: ['variant_count'],
    isCore: false,
    navOrder: 131
  },
  {
    id: 'claims-check',
    version: 1,
    title: '功效声明核查',
    description: '事实声明、数据引用和功效承诺合规检查',
    icon: 'shield-check',
    group: 'marketing',
    applicableDocumentTypes: ['marketing_copy'],
    capabilityPackId: 'marketing',
    phase: 'review',
    rendererKey: 'claims-check',
    actions: [
      { id: 'check', label: '核查声明', method: 'POST' }
    ],
    metricIds: ['claim_issues'],
    isCore: false,
    navOrder: 132
  }
]

const marketingMetrics: MetricDefinition[] = [
  { id: 'brief_status', label: 'Brief状态', icon: 'file-text', sourceModuleId: 'brief', applicableDocumentTypes: ['marketing_copy'], valueType: 'string', format: 'text' },
  { id: 'variant_count', label: 'A/B变体', icon: 'copy', sourceModuleId: 'ab-variants', applicableDocumentTypes: ['marketing_copy'], valueType: 'number', format: 'count' },
  { id: 'claim_issues', label: '声明风险', icon: 'alert', sourceModuleId: 'claims-check', applicableDocumentTypes: ['marketing_copy'], valueType: 'number', format: 'count' }
]

const informationalModules: WorkbenchModuleDefinition[] = [
  {
    id: 'sources',
    version: 1,
    title: '来源管理',
    description: '新闻来源、资料台和引用出处',
    icon: 'link',
    group: 'informational',
    applicableDocumentTypes: ['informational_article'],
    capabilityPackId: 'informational',
    phase: 'prepare',
    rendererKey: 'sources',
    actions: [
      { id: 'list', label: '来源列表', method: 'GET' },
      { id: 'add', label: '添加来源', method: 'POST' },
      { id: 'verify', label: '验证来源', method: 'POST' }
    ],
    metricIds: ['source_count', 'verified_sources'],
    isCore: false,
    navOrder: 140
  },
  {
    id: 'fact-check',
    version: 1,
    title: '事实核查',
    description: '系统性事实核查和交叉验证',
    icon: 'search-check',
    group: 'informational',
    applicableDocumentTypes: ['informational_article', 'argumentative_document'],
    capabilityPackId: 'informational',
    phase: 'review',
    rendererKey: 'fact-check',
    actions: [
      { id: 'check', label: '事实核查', method: 'POST' }
    ],
    metricIds: ['fact_issues', 'citations_count'],
    isCore: false,
    navOrder: 141
  }
]

const informationalMetrics: MetricDefinition[] = [
  { id: 'source_count', label: '来源', icon: 'link', sourceModuleId: 'sources', applicableDocumentTypes: ['informational_article'], valueType: 'number', format: 'count' },
  { id: 'verified_sources', label: '已验证', icon: 'check-circle', sourceModuleId: 'sources', applicableDocumentTypes: ['informational_article'], valueType: 'number', format: 'count' },
  { id: 'fact_issues', label: '事实问题', icon: 'warning', sourceModuleId: 'fact-check', applicableDocumentTypes: ['informational_article', 'argumentative_document'], valueType: 'number', format: 'count' },
  { id: 'citations_count', label: '引用数', icon: 'quote', sourceModuleId: 'fact-check', applicableDocumentTypes: ['informational_article', 'argumentative_document'], valueType: 'number', format: 'count' }
]

const argumentativeModules: WorkbenchModuleDefinition[] = [
  {
    id: 'argument-tree',
    version: 1,
    title: '论证树',
    description: '核心论点、分论点和论证结构',
    icon: 'git-merge',
    group: 'argumentative',
    applicableDocumentTypes: ['argumentative_document'],
    capabilityPackId: 'argumentative',
    phase: 'build',
    rendererKey: 'argument-tree',
    actions: [
      { id: 'tree', label: '论证树', method: 'GET' },
      { id: 'analyze', label: '分析论证', method: 'POST' }
    ],
    metricIds: ['thesis_count', 'evidence_count'],
    isCore: false,
    navOrder: 150
  },
  {
    id: 'evidence-matrix',
    version: 1,
    title: '证据矩阵',
    description: '论点-证据对应和来源可信度评估',
    icon: 'layout-grid',
    group: 'argumentative',
    applicableDocumentTypes: ['argumentative_document'],
    capabilityPackId: 'argumentative',
    phase: 'build',
    rendererKey: 'evidence-matrix',
    actions: [
      { id: 'matrix', label: '证据矩阵', method: 'GET' },
      { id: 'validate', label: '验证证据', method: 'POST' }
    ],
    metricIds: ['evidence_quality'],
    isCore: false,
    navOrder: 151
  },
  {
    id: 'counter-arguments',
    version: 1,
    title: '反方审阅',
    description: '反方视角和逻辑谬误识别',
    icon: 'scale',
    group: 'argumentative',
    applicableDocumentTypes: ['argumentative_document', 'structured_business_doc'],
    capabilityPackId: 'argumentative',
    phase: 'review',
    rendererKey: 'counter-arguments',
    actions: [
      { id: 'review', label: '反方审阅', method: 'POST' }
    ],
    metricIds: ['fallacy_count', 'weak_points'],
    isCore: false,
    navOrder: 152
  },
  {
    id: 'citations',
    version: 1,
    title: '引文格式',
    description: '引用格式校验和规范检查',
    icon: 'quote',
    group: 'argumentative',
    applicableDocumentTypes: ['argumentative_document'],
    capabilityPackId: 'argumentative',
    phase: 'review',
    rendererKey: 'citations',
    actions: [
      { id: 'check', label: '格式校验', method: 'POST' },
      { id: 'fix', label: '自动修正', method: 'POST' }
    ],
    metricIds: ['citation_issues'],
    isCore: false,
    navOrder: 153
  }
]

const argumentativeMetrics: MetricDefinition[] = [
  { id: 'thesis_count', label: '论点', icon: 'lightbulb', sourceModuleId: 'argument-tree', applicableDocumentTypes: ['argumentative_document'], valueType: 'number', format: 'count' },
  { id: 'evidence_count', label: '证据项', icon: 'file-binary', sourceModuleId: 'argument-tree', applicableDocumentTypes: ['argumentative_document'], valueType: 'number', format: 'count' },
  { id: 'evidence_quality', label: '证据质量', icon: 'star', sourceModuleId: 'evidence-matrix', applicableDocumentTypes: ['argumentative_document'], valueType: 'string', format: 'text' },
  { id: 'fallacy_count', label: '逻辑谬误', icon: 'alert', sourceModuleId: 'counter-arguments', applicableDocumentTypes: ['argumentative_document'], valueType: 'number', format: 'count' },
  { id: 'weak_points', label: '薄弱环节', icon: 'warning', sourceModuleId: 'counter-arguments', applicableDocumentTypes: ['argumentative_document', 'structured_business_doc'], valueType: 'number', format: 'count' },
  { id: 'citation_issues', label: '引用问题', icon: 'quote', sourceModuleId: 'citations', applicableDocumentTypes: ['argumentative_document'], valueType: 'number', format: 'count' }
]

const businessModules: WorkbenchModuleDefinition[] = [
  {
    id: 'stakeholders',
    version: 1,
    title: '利益相关者',
    description: '需求方、干系人和审批人管理',
    icon: 'organization',
    group: 'business',
    applicableDocumentTypes: ['structured_business_doc'],
    capabilityPackId: 'business',
    phase: 'prepare',
    rendererKey: 'stakeholders',
    actions: [
      { id: 'list', label: '相关者列表', method: 'GET' }
    ],
    metricIds: ['stakeholder_count'],
    isCore: false,
    navOrder: 160
  },
  {
    id: 'milestones',
    version: 1,
    title: '里程碑',
    description: '项目里程碑、时间节点和交付物',
    icon: 'flag',
    group: 'business',
    applicableDocumentTypes: ['structured_business_doc', 'outline'],
    capabilityPackId: 'business',
    phase: 'build',
    rendererKey: 'milestones',
    actions: [
      { id: 'list', label: '里程碑列表', method: 'GET' },
      { id: 'generate', label: '生成计划', method: 'POST' }
    ],
    metricIds: ['milestone_count', 'deliverable_count'],
    isCore: false,
    navOrder: 161
  },
  {
    id: 'risk-assessment',
    version: 1,
    title: '风险评估',
    description: '风险识别、分析和应对策略',
    icon: 'alert-triangle',
    group: 'business',
    applicableDocumentTypes: ['structured_business_doc'],
    capabilityPackId: 'business',
    phase: 'review',
    rendererKey: 'risk-assessment',
    actions: [
      { id: 'assess', label: '风险评估', method: 'POST' }
    ],
    metricIds: ['risk_count', 'high_risks'],
    isCore: false,
    navOrder: 162
  }
]

const businessMetrics: MetricDefinition[] = [
  { id: 'stakeholder_count', label: '利益相关者', icon: 'organization', sourceModuleId: 'stakeholders', applicableDocumentTypes: ['structured_business_doc'], valueType: 'number', format: 'count' },
  { id: 'milestone_count', label: '里程碑', icon: 'flag', sourceModuleId: 'milestones', applicableDocumentTypes: ['structured_business_doc', 'outline'], valueType: 'number', format: 'count' },
  { id: 'deliverable_count', label: '交付物', icon: 'package', sourceModuleId: 'milestones', applicableDocumentTypes: ['structured_business_doc'], valueType: 'number', format: 'count' },
  { id: 'risk_count', label: '风险项', icon: 'alert-triangle', sourceModuleId: 'risk-assessment', applicableDocumentTypes: ['structured_business_doc'], valueType: 'number', format: 'count' },
  { id: 'high_risks', label: '高风险', icon: 'error', sourceModuleId: 'risk-assessment', applicableDocumentTypes: ['structured_business_doc'], valueType: 'number', format: 'count' }
]

const regulatedModules: WorkbenchModuleDefinition[] = [
  {
    id: 'clause-matrix',
    version: 1,
    title: '条款矩阵',
    description: '条款结构、关键条款和法规依据',
    icon: 'list-flat',
    group: 'regulated',
    applicableDocumentTypes: ['regulated_document'],
    capabilityPackId: 'regulated',
    phase: 'build',
    rendererKey: 'clause-matrix',
    actions: [
      { id: 'matrix', label: '条款矩阵', method: 'GET' },
      { id: 'analyze', label: '分析条款', method: 'POST' }
    ],
    metricIds: ['clause_count'],
    isCore: false,
    navOrder: 170
  },
  {
    id: 'compliance-check',
    version: 1,
    title: '合规审查',
    description: '法规依据、风险责任和审计追踪',
    icon: 'shield',
    group: 'regulated',
    applicableDocumentTypes: ['regulated_document'],
    capabilityPackId: 'regulated',
    phase: 'review',
    rendererKey: 'compliance-check',
    actions: [
      { id: 'check', label: '合规检查', method: 'POST' }
    ],
    metricIds: ['compliance_issues', 'approval_status'],
    isCore: false,
    requiresSetup: true,
    navOrder: 171
  },
  {
    id: 'audit-log',
    version: 1,
    title: '审计日志',
    description: '版本追踪、审批记录和变更历史',
    icon: 'history',
    group: 'regulated',
    applicableDocumentTypes: ['regulated_document'],
    capabilityPackId: 'regulated',
    phase: 'deliver',
    rendererKey: 'audit-log',
    actions: [
      { id: 'log', label: '审计日志', method: 'GET' }
    ],
    metricIds: ['approval_chain'],
    isCore: false,
    navOrder: 172
  }
]

const regulatedMetrics: MetricDefinition[] = [
  { id: 'clause_count', label: '条款数', icon: 'list-flat', sourceModuleId: 'clause-matrix', applicableDocumentTypes: ['regulated_document'], valueType: 'number', format: 'count' },
  { id: 'compliance_issues', label: '合规问题', icon: 'shield', sourceModuleId: 'compliance-check', applicableDocumentTypes: ['regulated_document'], valueType: 'number', format: 'count' },
  { id: 'approval_status', label: '审批状态', icon: 'workflow', sourceModuleId: 'compliance-check', applicableDocumentTypes: ['regulated_document'], valueType: 'string', format: 'text' },
  { id: 'approval_chain', label: '审批链', icon: 'git-commit', sourceModuleId: 'audit-log', applicableDocumentTypes: ['regulated_document'], valueType: 'string', format: 'text' }
]

const technicalModules: WorkbenchModuleDefinition[] = [
  {
    id: 'api-reference',
    version: 1,
    title: 'API/接口',
    description: '接口定义、参数和Schema管理',
    icon: 'code',
    group: 'technical',
    applicableDocumentTypes: ['technical_document'],
    capabilityPackId: 'technical',
    phase: 'build',
    rendererKey: 'api-reference',
    actions: [
      { id: 'list', label: '接口列表', method: 'GET' },
      { id: 'extract', label: '提取接口', method: 'POST' }
    ],
    metricIds: ['api_count', 'param_count'],
    isCore: false,
    navOrder: 180
  },
  {
    id: 'code-validation',
    version: 1,
    title: '代码示例验证',
    description: '代码示例正确性和实现一致性检查',
    icon: 'play',
    group: 'technical',
    applicableDocumentTypes: ['technical_document'],
    capabilityPackId: 'technical',
    phase: 'review',
    rendererKey: 'code-validation',
    actions: [
      { id: 'validate', label: '验证代码', method: 'POST' }
    ],
    metricIds: ['code_examples', 'validation_issues'],
    isCore: false,
    navOrder: 181
  },
  {
    id: 'changelog',
    version: 1,
    title: '变更日志',
    description: '版本变更记录和Changelog管理',
    icon: 'diff',
    group: 'technical',
    applicableDocumentTypes: ['technical_document', 'revision_artifact'],
    capabilityPackId: 'technical',
    phase: 'deliver',
    rendererKey: 'changelog',
    actions: [
      { id: 'generate', label: '生成Changelog', method: 'POST' }
    ],
    metricIds: ['changelog_entries'],
    isCore: false,
    navOrder: 182
  }
]

const technicalMetrics: MetricDefinition[] = [
  { id: 'api_count', label: '接口数', icon: 'code', sourceModuleId: 'api-reference', applicableDocumentTypes: ['technical_document'], valueType: 'number', format: 'count' },
  { id: 'param_count', label: '参数项', icon: 'symbol-parameter', sourceModuleId: 'api-reference', applicableDocumentTypes: ['technical_document'], valueType: 'number', format: 'count' },
  { id: 'code_examples', label: '代码示例', icon: 'code', sourceModuleId: 'code-validation', applicableDocumentTypes: ['technical_document'], valueType: 'number', format: 'count' },
  { id: 'validation_issues', label: '验证问题', icon: 'warning', sourceModuleId: 'code-validation', applicableDocumentTypes: ['technical_document'], valueType: 'number', format: 'count' },
  { id: 'changelog_entries', label: '变更条目', icon: 'diff', sourceModuleId: 'changelog', applicableDocumentTypes: ['technical_document', 'revision_artifact'], valueType: 'number', format: 'count' }
]

const knowledgeModules: WorkbenchModuleDefinition[] = [
  {
    id: 'glossary',
    version: 1,
    title: '术语表',
    description: '术语定义、概念解释和词汇表',
    icon: 'book',
    group: 'knowledge',
    applicableDocumentTypes: ['knowledge_asset'],
    capabilityPackId: 'knowledge',
    phase: 'build',
    rendererKey: 'glossary',
    actions: [
      { id: 'list', label: '术语列表', method: 'GET' },
      { id: 'extract', label: '提取术语', method: 'POST' }
    ],
    metricIds: ['term_count'],
    isCore: false,
    navOrder: 190
  },
  {
    id: 'knowledge-graph',
    version: 1,
    title: '知识图谱',
    description: '实体关系网络和知识关联可视化',
    icon: 'git-branch',
    group: 'knowledge',
    applicableDocumentTypes: ['knowledge_asset'],
    capabilityPackId: 'knowledge',
    phase: 'build',
    rendererKey: 'knowledge-graph',
    actions: [
      { id: 'graph', label: '获取图谱', method: 'GET' },
      { id: 'build', label: '构建图谱', method: 'POST' }
    ],
    metricIds: ['kg_nodes', 'kg_edges'],
    isCore: false,
    navOrder: 191
  },
  {
    id: 'ingest-quality',
    version: 1,
    title: '摄取质量',
    description: '知识源摄取质量、索引状态和冲突检测',
    icon: 'check',
    group: 'knowledge',
    applicableDocumentTypes: ['knowledge_asset'],
    capabilityPackId: 'knowledge',
    phase: 'review',
    rendererKey: 'ingest-quality',
    actions: [
      { id: 'status', label: '索引状态', method: 'GET' }
    ],
    metricIds: ['index_coverage', 'conflict_count'],
    isCore: false,
    navOrder: 192
  }
]

const knowledgeMetrics: MetricDefinition[] = [
  { id: 'term_count', label: '术语', icon: 'book', sourceModuleId: 'glossary', applicableDocumentTypes: ['knowledge_asset'], valueType: 'number', format: 'count' },
  { id: 'kg_nodes', label: '图谱节点', icon: 'circle-large-outline', sourceModuleId: 'knowledge-graph', applicableDocumentTypes: ['knowledge_asset'], valueType: 'number', format: 'count' },
  { id: 'kg_edges', label: '图谱关系', icon: 'git-pull-request', sourceModuleId: 'knowledge-graph', applicableDocumentTypes: ['knowledge_asset'], valueType: 'number', format: 'count' },
  { id: 'index_coverage', label: '索引覆盖', icon: 'database', sourceModuleId: 'ingest-quality', applicableDocumentTypes: ['knowledge_asset'], valueType: 'string', format: 'text' },
  { id: 'conflict_count', label: '知识冲突', icon: 'warning', sourceModuleId: 'ingest-quality', applicableDocumentTypes: ['knowledge_asset'], valueType: 'number', format: 'count' }
]

export const CAPABILITY_PACKS: CapabilityPackDefinition[] = [
  {
    id: 'core',
    name: '核心能力',
    description: '所有项目共享的基础模块',
    icon: 'settings',
    color: 'gray',
    applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document','knowledge_asset','outline','research_material','review_feedback','revision_artifact'],
    moduleIds: CORE_MODULES.filter(m => m.isCore).map(m => m.id),
    metricIds: CORE_METRICS.map(m => m.id),
    labels: { contentUnit: '内容单元', knowledgeHub: '知识中心', entities: '实体', reviewCenter: '审阅中心', delivery: '交付' }
  },
  {
    id: 'narrative',
    name: '叙事散文',
    description: '小说、故事、散文等叙事类创作能力',
    icon: 'book',
    color: 'indigo',
    applicableDocumentTypes: ['narrative_prose'],
    moduleIds: narrativeModules.map(m => m.id),
    metricIds: narrativeMetrics.map(m => m.id),
    labels: { contentUnit: '章节', knowledgeHub: '故事圣经', entities: '人物', reviewCenter: '评审委员会', delivery: '定稿' }
  },
  {
    id: 'script',
    name: '剧本对白',
    description: '影视剧本、舞台剧本、音频剧本',
    icon: 'device-camera-video',
    color: 'rose',
    applicableDocumentTypes: ['script_dialogue'],
    moduleIds: scriptModules.map(m => m.id),
    metricIds: scriptMetrics.map(m => m.id),
    labels: { contentUnit: '场次', knowledgeHub: '剧集圣经', entities: '角色', reviewCenter: '剧本审阅', delivery: '剧本定稿' }
  },
  {
    id: 'interactive',
    name: '互动叙事',
    description: '游戏剧情、互动小说、分支故事',
    icon: 'gamepad',
    color: 'cyan',
    applicableDocumentTypes: ['interactive_narrative'],
    moduleIds: interactiveModules.map(m => m.id),
    metricIds: interactiveMetrics.map(m => m.id),
    labels: { contentUnit: '剧情节点', knowledgeHub: '世界设定', entities: 'NPC', reviewCenter: '分支验证', delivery: '剧情包' }
  },
  {
    id: 'marketing',
    name: '营销文案',
    description: '品牌、广告、电商、社媒文案',
    icon: 'megaphone',
    color: 'orange',
    applicableDocumentTypes: ['marketing_copy'],
    moduleIds: marketingModules.map(m => m.id),
    metricIds: marketingMetrics.map(m => m.id),
    labels: { contentUnit: '文案', knowledgeHub: '品牌资产', entities: '卖点', reviewCenter: '合规审阅', delivery: '投放包' }
  },
  {
    id: 'informational',
    name: '资讯文章',
    description: '新闻报道、科普文章、白皮书',
    icon: 'newspaper',
    color: 'blue',
    applicableDocumentTypes: ['informational_article'],
    moduleIds: informationalModules.map(m => m.id),
    metricIds: informationalMetrics.map(m => m.id),
    labels: { contentUnit: '文章', knowledgeHub: '资料台', entities: '来源', reviewCenter: '事实核查', delivery: '发布' }
  },
  {
    id: 'argumentative',
    name: '论证文档',
    description: '学术论文、研究报告、论证性文章',
    icon: 'library',
    color: 'emerald',
    applicableDocumentTypes: ['argumentative_document'],
    moduleIds: argumentativeModules.map(m => m.id),
    metricIds: argumentativeMetrics.map(m => m.id),
    labels: { contentUnit: '章节', knowledgeHub: '文献库', entities: '论点', reviewCenter: '同行审阅', delivery: '投稿定稿' }
  },
  {
    id: 'business',
    name: '结构化商务',
    description: '商业计划、项目方案、标书、管理文档',
    icon: 'briefcase',
    color: 'amber',
    applicableDocumentTypes: ['structured_business_doc'],
    moduleIds: businessModules.map(m => m.id),
    metricIds: businessMetrics.map(m => m.id),
    labels: { contentUnit: '章节', knowledgeHub: '项目资料', entities: '干系人', reviewCenter: '风险评审', delivery: '提交' }
  },
  {
    id: 'regulated',
    name: '受监管文档',
    description: '合同、法律文书、合规文档、政务公文',
    icon: 'shield',
    color: 'red',
    applicableDocumentTypes: ['regulated_document'],
    moduleIds: regulatedModules.map(m => m.id),
    metricIds: regulatedMetrics.map(m => m.id),
    labels: { contentUnit: '条款', knowledgeHub: '法规依据', entities: '责任方', reviewCenter: '合规审查', delivery: '签署定稿' }
  },
  {
    id: 'technical',
    name: '技术文档',
    description: 'API文档、技术方案、用户手册',
    icon: 'code',
    color: 'violet',
    applicableDocumentTypes: ['technical_document'],
    moduleIds: technicalModules.map(m => m.id),
    metricIds: technicalMetrics.map(m => m.id),
    labels: { contentUnit: '章节', knowledgeHub: '技术资料', entities: '接口', reviewCenter: '一致性检查', delivery: '发布' }
  },
  {
    id: 'knowledge',
    name: '知识资产',
    description: 'Wiki、知识库、术语表、RAG库',
    icon: 'database',
    color: 'teal',
    applicableDocumentTypes: ['knowledge_asset'],
    moduleIds: knowledgeModules.map(m => m.id),
    metricIds: knowledgeMetrics.map(m => m.id),
    labels: { contentUnit: '页面', knowledgeHub: '知识管理', entities: '概念', reviewCenter: '质量检查', delivery: '发布' }
  }
]

export const ALL_MODULES: WorkbenchModuleDefinition[] = [
  ...CORE_MODULES,
  ...narrativeModules,
  ...scriptModules,
  ...interactiveModules,
  ...marketingModules,
  ...informationalModules,
  ...argumentativeModules,
  ...businessModules,
  ...regulatedModules,
  ...technicalModules,
  ...knowledgeModules
]

export const ALL_METRICS: MetricDefinition[] = [
  ...CORE_METRICS,
  ...narrativeMetrics,
  ...scriptMetrics,
  ...interactiveMetrics,
  ...marketingMetrics,
  ...informationalMetrics,
  ...argumentativeMetrics,
  ...businessMetrics,
  ...regulatedMetrics,
  ...technicalMetrics,
  ...knowledgeMetrics
]
