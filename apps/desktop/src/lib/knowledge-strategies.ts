import type { DocumentObjectType } from '@/types/writer-project-catalog'

export interface KnowledgeStrategy {
  id: string
  docType: DocumentObjectType
  name: string
  description: string
  retrieval: {
    topK: number
    similarityThreshold: number
    rerank: boolean
    includeMetadata: boolean
  }
  ranking: {
    recencyWeight: number
    sourceCredibilityWeight: number
    relevanceWeight: number
  }
  sourcePriority: string[]
  metadataFields: string[]
  citationStyle: 'inline' | 'footnote' | 'reference-list' | 'none'
  factVerification: 'required' | 'recommended' | 'optional'
  knowledgeBindingTypes: string[]
}

const DEFAULT_STRATEGY: Omit<KnowledgeStrategy, 'id' | 'docType' | 'name' | 'description'> = {
  retrieval: {
    topK: 5,
    similarityThreshold: 0.1,
    rerank: false,
    includeMetadata: true
  },
  ranking: {
    recencyWeight: 0.1,
    sourceCredibilityWeight: 0.2,
    relevanceWeight: 0.7
  },
  sourcePriority: [],
  metadataFields: ['title', 'path', 'source', 'created_at', 'updated_at'],
  citationStyle: 'none',
  factVerification: 'optional',
  knowledgeBindingTypes: []
}

export const KNOWLEDGE_STRATEGIES: KnowledgeStrategy[] = [
  {
    id: 'narrative-prose',
    docType: 'narrative_prose',
    name: '叙事散文策略',
    description: '人物/世界观/时间线优先，中等召回，不强调引用',
    retrieval: {
      topK: 6,
      similarityThreshold: 0.15,
      rerank: false,
      includeMetadata: true
    },
    ranking: {
      recencyWeight: 0.15,
      sourceCredibilityWeight: 0.15,
      relevanceWeight: 0.7
    },
    sourcePriority: ['人物设定', '世界观设定', '时间线', '故事大纲', '正文章节'],
    metadataFields: ['title', 'path', 'source', 'character_tags', 'location_tags'],
    citationStyle: 'none',
    factVerification: 'optional',
    knowledgeBindingTypes: ['character', 'location', 'timeline', 'worldbuilding']
  },
  {
    id: 'script-dialogue',
    docType: 'script_dialogue',
    name: '剧本对白策略',
    description: '角色/场景/设定优先，按场景组织',
    retrieval: {
      topK: 8,
      similarityThreshold: 0.12,
      rerank: true,
      includeMetadata: true
    },
    ranking: {
      recencyWeight: 0.1,
      sourceCredibilityWeight: 0.2,
      relevanceWeight: 0.7
    },
    sourcePriority: ['人物小传', '场景列表', '剧集圣经', '场景剧本', '分场大纲'],
    metadataFields: ['title', 'path', 'scene_id', 'characters', 'location'],
    citationStyle: 'none',
    factVerification: 'optional',
    knowledgeBindingTypes: ['character', 'scene', 'setting', 'episode']
  },
  {
    id: 'interactive-narrative',
    docType: 'interactive_narrative',
    name: '互动叙事策略',
    description: '状态/分支/角色对话优先，强调一致性',
    retrieval: {
      topK: 10,
      similarityThreshold: 0.1,
      rerank: true,
      includeMetadata: true
    },
    ranking: {
      recencyWeight: 0.05,
      sourceCredibilityWeight: 0.25,
      relevanceWeight: 0.7
    },
    sourcePriority: ['世界观设定', 'NPC对话', '主线剧情', '任务文本', '分支剧情'],
    metadataFields: ['title', 'path', 'branch_id', 'state_variables', 'npc_name'],
    citationStyle: 'none',
    factVerification: 'recommended',
    knowledgeBindingTypes: ['character', 'branch', 'state', 'quest', 'worldbuilding']
  },
  {
    id: 'marketing-copy',
    docType: 'marketing_copy',
    name: '营销文案策略',
    description: '品牌资料/产品信息/竞品分析优先，事实核查必须',
    retrieval: {
      topK: 6,
      similarityThreshold: 0.2,
      rerank: true,
      includeMetadata: true
    },
    ranking: {
      recencyWeight: 0.2,
      sourceCredibilityWeight: 0.35,
      relevanceWeight: 0.45
    },
    sourcePriority: ['品牌故事', '品牌语调', '产品信息', '竞品分析', '广告文案'],
    metadataFields: ['title', 'path', 'source', 'audience', 'campaign', 'updated_at'],
    citationStyle: 'inline',
    factVerification: 'required',
    knowledgeBindingTypes: ['brand', 'product', 'campaign', 'audience']
  },
  {
    id: 'informational-article',
    docType: 'informational_article',
    name: '资讯文章策略',
    description: '事实来源/数据/专家观点优先，引用列表格式',
    retrieval: {
      topK: 8,
      similarityThreshold: 0.18,
      rerank: true,
      includeMetadata: true
    },
    ranking: {
      recencyWeight: 0.3,
      sourceCredibilityWeight: 0.35,
      relevanceWeight: 0.35
    },
    sourcePriority: ['研究资料', '数据报告', '专家访谈', '新闻稿', '白皮书'],
    metadataFields: ['title', 'path', 'source', 'author', 'date', 'publication'],
    citationStyle: 'reference-list',
    factVerification: 'required',
    knowledgeBindingTypes: ['source', 'data', 'expert', 'event']
  },
  {
    id: 'argumentative-document',
    docType: 'argumentative_document',
    name: '论证文档策略',
    description: '证据/引用/反方观点优先，高事实核查要求',
    retrieval: {
      topK: 12,
      similarityThreshold: 0.15,
      rerank: true,
      includeMetadata: true
    },
    ranking: {
      recencyWeight: 0.2,
      sourceCredibilityWeight: 0.45,
      relevanceWeight: 0.35
    },
    sourcePriority: ['学术论文', '文献综述', '研究报告', '数据来源', '权威观点'],
    metadataFields: ['title', 'path', 'source', 'citation', 'author', 'journal', 'year'],
    citationStyle: 'footnote',
    factVerification: 'required',
    knowledgeBindingTypes: ['citation', 'evidence', 'data', 'study']
  },
  {
    id: 'structured-business-doc',
    docType: 'structured_business_doc',
    name: '结构化商务文档策略',
    description: '案例/模板/行业数据优先，来源可信度权重高',
    retrieval: {
      topK: 8,
      similarityThreshold: 0.2,
      rerank: true,
      includeMetadata: true
    },
    ranking: {
      recencyWeight: 0.25,
      sourceCredibilityWeight: 0.4,
      relevanceWeight: 0.35
    },
    sourcePriority: ['商业计划书', '项目方案', '投标书', '行业报告', '成功案例'],
    metadataFields: ['title', 'path', 'source', 'industry', 'company', 'year'],
    citationStyle: 'reference-list',
    factVerification: 'recommended',
    knowledgeBindingTypes: ['case', 'template', 'industry', 'metric']
  },
  {
    id: 'regulated-document',
    docType: 'regulated_document',
    name: '受监管文档策略',
    description: '法规/标准/先例优先，事实核查必须，来源必须可追溯',
    retrieval: {
      topK: 10,
      similarityThreshold: 0.25,
      rerank: true,
      includeMetadata: true
    },
    ranking: {
      recencyWeight: 0.35,
      sourceCredibilityWeight: 0.5,
      relevanceWeight: 0.15
    },
    sourcePriority: ['法律法规', '国家标准', '行业规范', '司法判例', '政策文件'],
    metadataFields: ['title', 'path', 'source', 'issuing_authority', 'effective_date', 'version'],
    citationStyle: 'footnote',
    factVerification: 'required',
    knowledgeBindingTypes: ['law', 'regulation', 'standard', 'precedent', 'policy']
  },
  {
    id: 'technical-document',
    docType: 'technical_document',
    name: '技术文档策略',
    description: 'API文档/规范/示例优先，版本匹配权重高',
    retrieval: {
      topK: 8,
      similarityThreshold: 0.15,
      rerank: true,
      includeMetadata: true
    },
    ranking: {
      recencyWeight: 0.3,
      sourceCredibilityWeight: 0.3,
      relevanceWeight: 0.4
    },
    sourcePriority: ['API文档', '架构设计', '技术方案', '用户手册', '代码示例'],
    metadataFields: ['title', 'path', 'version', 'api_endpoint', 'language', 'framework'],
    citationStyle: 'inline',
    factVerification: 'recommended',
    knowledgeBindingTypes: ['api', 'function', 'class', 'module', 'version']
  },
  {
    id: 'knowledge-asset',
    docType: 'knowledge_asset',
    name: '知识资产策略',
    description: '全量召回，实体关系优先，置信度标注必须',
    retrieval: {
      topK: 15,
      similarityThreshold: 0.08,
      rerank: true,
      includeMetadata: true
    },
    ranking: {
      recencyWeight: 0.1,
      sourceCredibilityWeight: 0.3,
      relevanceWeight: 0.6
    },
    sourcePriority: ['Wiki首页', '术语表', '实体关系', '概念定义', '证据库'],
    metadataFields: ['title', 'path', 'entity_type', 'confidence', 'related_entities', 'source_count'],
    citationStyle: 'reference-list',
    factVerification: 'required',
    knowledgeBindingTypes: ['entity', 'concept', 'relation', 'term', 'definition']
  },
  {
    id: 'outline',
    docType: 'outline',
    name: '大纲规划策略',
    description: '相关案例/结构模板优先',
    retrieval: {
      topK: 6,
      similarityThreshold: 0.18,
      rerank: false,
      includeMetadata: true
    },
    ranking: {
      recencyWeight: 0.15,
      sourceCredibilityWeight: 0.25,
      relevanceWeight: 0.6
    },
    sourcePriority: ['故事大纲', '分场大纲', '研究方案', '内容排期', '结构模板'],
    metadataFields: ['title', 'path', 'structure_type', 'sections_count', 'template_id'],
    citationStyle: 'none',
    factVerification: 'optional',
    knowledgeBindingTypes: ['structure', 'template', 'section', 'chapter']
  },
  {
    id: 'research-material',
    docType: 'research_material',
    name: '研究资料策略',
    description: '全量高召回，来源信息必须完整',
    retrieval: {
      topK: 15,
      similarityThreshold: 0.08,
      rerank: true,
      includeMetadata: true
    },
    ranking: {
      recencyWeight: 0.2,
      sourceCredibilityWeight: 0.4,
      relevanceWeight: 0.4
    },
    sourcePriority: ['学术论文', '研究报告', '数据来源', '权威资料', '调查结果'],
    metadataFields: ['title', 'path', 'source', 'author', 'publication_date', 'reliability_score', 'citation_count'],
    citationStyle: 'reference-list',
    factVerification: 'required',
    knowledgeBindingTypes: ['source', 'study', 'data', 'finding', 'methodology']
  },
  {
    id: 'review-feedback',
    docType: 'review_feedback',
    name: '审阅反馈策略',
    description: '相关审稿标准/质量基准优先',
    retrieval: {
      topK: 6,
      similarityThreshold: 0.2,
      rerank: false,
      includeMetadata: true
    },
    ranking: {
      recencyWeight: 0.2,
      sourceCredibilityWeight: 0.35,
      relevanceWeight: 0.45
    },
    sourcePriority: ['审稿标准', '质量基准', '编辑规范', '会议纪要', '评审意见'],
    metadataFields: ['title', 'path', 'review_type', 'criteria', 'reviewer', 'date'],
    citationStyle: 'none',
    factVerification: 'recommended',
    knowledgeBindingTypes: ['criteria', 'standard', 'feedback', 'review']
  },
  {
    id: 'revision-artifact',
    docType: 'revision_artifact',
    name: '修订产物策略',
    description: '历史版本/变更记录优先',
    retrieval: {
      topK: 8,
      similarityThreshold: 0.15,
      rerank: false,
      includeMetadata: true
    },
    ranking: {
      recencyWeight: 0.5,
      sourceCredibilityWeight: 0.2,
      relevanceWeight: 0.3
    },
    sourcePriority: ['修订稿', '版本对比', '变更日志', '修改记录', '历史版本'],
    metadataFields: ['title', 'path', 'version', 'revision_date', 'change_type', 'author'],
    citationStyle: 'none',
    factVerification: 'optional',
    knowledgeBindingTypes: ['version', 'revision', 'change', 'diff']
  }
]

export function getKnowledgeStrategy(docType: DocumentObjectType): KnowledgeStrategy {
  const strategy = KNOWLEDGE_STRATEGIES.find(s => s.docType === docType)
  if (strategy) return strategy
  return {
    ...DEFAULT_STRATEGY,
    id: `default-${docType}`,
    docType,
    name: '默认策略',
    description: '通用知识库检索策略'
  }
}

export function buildRetrievalParams(
  docType: DocumentObjectType,
  overrides?: Partial<KnowledgeStrategy['retrieval']>
): KnowledgeStrategy['retrieval'] {
  const strategy = getKnowledgeStrategy(docType)
  return {
    ...strategy.retrieval,
    ...overrides
  }
}
