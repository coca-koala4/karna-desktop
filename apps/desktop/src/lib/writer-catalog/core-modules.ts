import type { WorkbenchModuleDefinition, MetricDefinition, CapabilityPackDefinition } from './workbench-types'

export const CORE_MODULES: WorkbenchModuleDefinition[] = [
  {
    id: 'dashboard',
    version: 1,
    title: '概览',
    description: '项目主页，查看统计指标和推荐操作',
    icon: 'layout',
    group: 'core',
    applicableDocumentTypes: [],
    capabilityPackId: 'core',
    phase: 'prepare',
    rendererKey: 'dashboard',
    actions: [],
    metricIds: [],
    isCore: true,
    navOrder: 0
  },
  {
    id: 'documents',
    version: 1,
    title: '文件与资料',
    description: '项目文件管理、导入和统一文档解析',
    icon: 'files',
    group: 'core',
    applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document','knowledge_asset','outline','research_material','review_feedback','revision_artifact'],
    capabilityPackId: 'core',
    phase: 'prepare',
    rendererKey: 'documents',
    actions: [
      { id: 'list', label: '列出文件', method: 'GET' },
      { id: 'import', label: '导入文件', method: 'POST' },
      { id: 'parse', label: '解析文档', method: 'POST' }
    ],
    metricIds: ['doc_count', 'doc_nodes'],
    isCore: true,
    navOrder: 10
  },
  {
    id: 'knowledge',
    version: 1,
    title: '知识源',
    description: '项目知识、术语、引用来源管理',
    icon: 'book',
    group: 'core',
    applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document','knowledge_asset'],
    capabilityPackId: 'core',
    phase: 'prepare',
    rendererKey: 'knowledge',
    actions: [
      { id: 'list', label: '列出知识源', method: 'GET' },
      { id: 'add-source', label: '添加知识源', method: 'POST' },
      { id: 'reindex', label: '重建索引', method: 'POST' }
    ],
    metricIds: ['knowledge_sources', 'rag_status'],
    isCore: true,
    navOrder: 11
  },
  {
    id: 'structure',
    version: 1,
    title: '项目结构',
    description: '文档结构、章节、目录和大纲',
    icon: 'list-tree',
    group: 'core',
    applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document','knowledge_asset','outline'],
    capabilityPackId: 'core',
    phase: 'build',
    rendererKey: 'structure',
    actions: [
      { id: 'analyze', label: '分析结构', method: 'POST' },
      { id: 'generate-outline', label: '生成大纲', method: 'POST' }
    ],
    metricIds: ['sections', 'words_total'],
    isCore: true,
    navOrder: 20
  },
  {
    id: 'entities',
    version: 1,
    title: '实体关系',
    description: '实体、关系网络和术语表',
    icon: 'git-branch',
    group: 'core',
    applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','knowledge_asset'],
    capabilityPackId: 'core',
    phase: 'build',
    rendererKey: 'entities',
    actions: [
      { id: 'extract', label: '提取实体', method: 'POST' },
      { id: 'graph', label: '获取图谱', method: 'GET' }
    ],
    metricIds: ['entity_count', 'relation_count'],
    isCore: true,
    navOrder: 21
  },
  {
    id: 'editor',
    version: 1,
    title: '文档编辑',
    description: 'Writer IDE 文档编辑器',
    icon: 'edit',
    group: 'core',
    applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document','knowledge_asset','outline','research_material','review_feedback','revision_artifact'],
    capabilityPackId: 'core',
    phase: 'write',
    rendererKey: 'editor',
    actions: [
      { id: 'write', label: 'AI写作', method: 'POST' },
      { id: 'continue', label: '续写', method: 'POST' },
      { id: 'polish', label: '润色', method: 'POST' }
    ],
    metricIds: [],
    isCore: true,
    navOrder: 30
  },
  {
    id: 'review',
    version: 1,
    title: '审阅中心',
    description: '通用审阅、问题追踪和修改建议',
    icon: 'checklist',
    group: 'core',
    applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document','knowledge_asset','review_feedback'],
    capabilityPackId: 'core',
    phase: 'review',
    rendererKey: 'review',
    actions: [
      { id: 'list', label: '审阅问题列表', method: 'GET' },
      { id: 'run', label: '运行审阅', method: 'POST' },
      { id: 'resolve', label: '解决问题', method: 'POST' }
    ],
    metricIds: ['review_issues', 'review_resolved'],
    isCore: true,
    navOrder: 40
  },
  {
    id: 'versions',
    version: 1,
    title: '版本记录',
    description: '版本历史、差异对比和回滚',
    icon: 'history',
    group: 'core',
    applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document','knowledge_asset','revision_artifact'],
    capabilityPackId: 'core',
    phase: 'review',
    rendererKey: 'versions',
    actions: [
      { id: 'list', label: '版本列表', method: 'GET' },
      { id: 'diff', label: '对比差异', method: 'GET' },
      { id: 'snapshot', label: '创建快照', method: 'POST' }
    ],
    metricIds: ['version_count'],
    isCore: true,
    navOrder: 41
  },
  {
    id: 'delivery',
    version: 1,
    title: '交付导出',
    description: '导出、交付包和发布前检查',
    icon: 'package',
    group: 'core',
    applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document','knowledge_asset'],
    capabilityPackId: 'core',
    phase: 'deliver',
    rendererKey: 'delivery',
    actions: [
      { id: 'status', label: '交付状态', method: 'GET' },
      { id: 'build', label: '构建交付包', method: 'POST' },
      { id: 'check', label: '发布前检查', method: 'POST' }
    ],
    metricIds: ['delivery_status'],
    isCore: true,
    navOrder: 50
  },
  {
    id: 'memory',
    version: 1,
    title: '创作记忆',
    description: '项目记忆、决策记录和灵感收集',
    icon: 'database',
    group: 'core',
    applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','knowledge_asset'],
    capabilityPackId: 'core',
    phase: 'write',
    rendererKey: 'memory',
    actions: [
      { id: 'list', label: '记忆列表', method: 'GET' },
      { id: 'add', label: '添加记忆', method: 'POST' }
    ],
    metricIds: ['memories_count'],
    isCore: true,
    navOrder: 31
  },
  {
    id: 'search',
    version: 1,
    title: '创意检索',
    description: '项目全文检索和知识问答',
    icon: 'search',
    group: 'core',
    applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document','knowledge_asset','research_material'],
    capabilityPackId: 'core',
    phase: 'write',
    rendererKey: 'search',
    actions: [
      { id: 'query', label: '搜索', method: 'POST' }
    ],
    metricIds: [],
    isCore: true,
    navOrder: 32
  },
  {
    id: 'guide',
    version: 1,
    title: '引导修复',
    description: '项目设置引导和问题修复',
    icon: 'wrench',
    group: 'core',
    applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document','knowledge_asset'],
    capabilityPackId: 'core',
    phase: 'prepare',
    rendererKey: 'guide',
    actions: [
      { id: 'checklist', label: '检查清单', method: 'GET' },
      { id: 'bootstrap', label: '一键初始化', method: 'POST' },
      { id: 'repair', label: '修复', method: 'POST' }
    ],
    metricIds: [],
    isCore: true,
    navOrder: 2
  }
]

export const CORE_METRICS: MetricDefinition[] = [
  { id: 'doc_count', label: '文档数', icon: 'files', sourceModuleId: 'documents', applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document','knowledge_asset'], valueType: 'number', format: 'count' },
  { id: 'doc_nodes', label: '段落节点', icon: 'list-tree', sourceModuleId: 'documents', applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative'], valueType: 'number', format: 'count' },
  { id: 'knowledge_sources', label: '知识源', icon: 'book', sourceModuleId: 'knowledge', applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document','knowledge_asset'], valueType: 'number', format: 'count' },
  { id: 'rag_status', label: 'RAG索引', icon: 'book-open', sourceModuleId: 'knowledge', applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document','knowledge_asset'], valueType: 'string', format: 'text' },
  { id: 'sections', label: '章节/段落', icon: 'list-tree', sourceModuleId: 'structure', applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','technical_document'], valueType: 'number', format: 'count' },
  { id: 'words_total', label: '总字数', icon: 'text-size', sourceModuleId: 'structure', applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document'], valueType: 'number', format: 'count' },
  { id: 'entity_count', label: '实体', icon: 'circle-large-outline', sourceModuleId: 'entities', applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','knowledge_asset'], valueType: 'number', format: 'count' },
  { id: 'relation_count', label: '关系', icon: 'git-pull-request', sourceModuleId: 'entities', applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','knowledge_asset'], valueType: 'number', format: 'count' },
  { id: 'review_issues', label: '待解决问题', icon: 'warning', sourceModuleId: 'review', applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document'], valueType: 'number', format: 'count' },
  { id: 'review_resolved', label: '已解决', icon: 'check', sourceModuleId: 'review', applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document'], valueType: 'number', format: 'count' },
  { id: 'version_count', label: '版本', icon: 'history', sourceModuleId: 'versions', applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document','knowledge_asset'], valueType: 'number', format: 'count' },
  { id: 'delivery_status', label: '交付状态', icon: 'package', sourceModuleId: 'delivery', applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document','knowledge_asset'], valueType: 'string', format: 'text' },
  { id: 'memories_count', label: '记忆条目', icon: 'database', sourceModuleId: 'memory', applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','knowledge_asset'], valueType: 'number', format: 'count' }
]
