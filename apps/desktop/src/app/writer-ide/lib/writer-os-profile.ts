import { resolveProfile } from '@/lib/writer-catalog'
import type { DocumentObjectType } from '@/lib/writer-catalog/types'

export interface WriterOsProfile {
  documentType: DocumentObjectType
  title: string
  moduleIds: string[]
  labels: Record<string, string>
}

const DEFAULT_TYPE: DocumentObjectType = 'narrative_prose'

const MODULES_BY_TYPE: Record<DocumentObjectType, string[]> = {
  narrative_prose: ['story-bible', 'living-wiki', 'knowledge-graph', 'narrative-state', 'critic-council', 'creative-memory', 'creative-search', 'documents', 'rag', 'benchmark', 'guide', 'delivery', 'verify'],
  script_dialogue: ['story-bible', 'living-wiki', 'knowledge-graph', 'narrative-state', 'critic-council', 'creative-memory', 'creative-search', 'documents', 'safety', 'benchmark', 'delivery', 'verify'],
  interactive_narrative: ['story-bible', 'living-wiki', 'knowledge-graph', 'narrative-state', 'critic-council', 'creative-memory', 'creative-search', 'documents', 'rag', 'benchmark', 'delivery', 'verify'],
  marketing_copy: ['documents', 'living-wiki', 'knowledge-graph', 'critic-council', 'safety', 'creative-memory', 'creative-search', 'rag', 'benchmark', 'delivery', 'verify'],
  informational_article: ['documents', 'living-wiki', 'knowledge-graph', 'critic-council', 'safety', 'creative-memory', 'creative-search', 'rag', 'benchmark', 'delivery', 'verify'],
  argumentative_document: ['documents', 'living-wiki', 'knowledge-graph', 'critic-council', 'safety', 'creative-memory', 'creative-search', 'rag', 'benchmark', 'delivery', 'verify'],
  structured_business_doc: ['documents', 'living-wiki', 'knowledge-graph', 'critic-council', 'safety', 'creative-memory', 'creative-search', 'rag', 'benchmark', 'delivery', 'verify'],
  regulated_document: ['documents', 'living-wiki', 'knowledge-graph', 'critic-council', 'safety', 'creative-memory', 'creative-search', 'rag', 'benchmark', 'delivery', 'verify'],
  technical_document: ['documents', 'living-wiki', 'knowledge-graph', 'critic-council', 'safety', 'creative-memory', 'creative-search', 'rag', 'benchmark', 'delivery', 'verify'],
  knowledge_asset: ['documents', 'living-wiki', 'knowledge-graph', 'creative-memory', 'creative-search', 'rag', 'benchmark', 'delivery', 'verify'],
  outline: ['documents', 'living-wiki', 'knowledge-graph', 'creative-memory', 'creative-search', 'verify'],
  research_material: ['documents', 'living-wiki', 'knowledge-graph', 'creative-search', 'rag', 'verify'],
  review_feedback: ['documents', 'critic-council', 'safety', 'benchmark', 'verify'],
  revision_artifact: ['documents', 'creative-memory', 'critic-council', 'delivery', 'verify']
}

const LABELS_BY_TYPE: Partial<Record<DocumentObjectType, Record<string, string>>> = {
  script_dialogue: { 'story-bible': '剧集圣经', 'narrative-state': '场次与角色状态', 'critic-council': '剧本审阅' },
  interactive_narrative: { 'story-bible': '世界设定', 'knowledge-graph': '分支与实体图', 'narrative-state': '变量与剧情状态', 'critic-council': '分支验证' },
  marketing_copy: { 'living-wiki': '品牌资产', 'knowledge-graph': '受众与卖点', 'critic-council': '文案评审', safety: '声明与合规' },
  informational_article: { 'living-wiki': '资料台', 'knowledge-graph': '来源关系', 'critic-council': '编辑审阅', safety: '事实核查' },
  argumentative_document: { 'living-wiki': '文献库', 'knowledge-graph': '论证与证据图', 'critic-council': '同行审阅', safety: '引文与事实核查' },
  structured_business_doc: { 'living-wiki': '项目资料', 'knowledge-graph': '利益相关方', 'critic-council': '风险评审', safety: '风险检查' },
  regulated_document: { 'living-wiki': '法规依据', 'knowledge-graph': '条款关系', 'critic-council': '合规复核', safety: '合规审查', delivery: '签署与交付' },
  technical_document: { 'living-wiki': '技术资料', 'knowledge-graph': '接口与依赖', 'critic-council': '技术审阅', safety: '示例验证' },
  knowledge_asset: { 'living-wiki': '知识管理', 'knowledge-graph': '知识图谱', benchmark: '摄取质量' }
}

const DOCUMENT_TYPES = new Set(Object.keys(MODULES_BY_TYPE))

export function resolveWriterOsProfile(documentType?: string | null, formId?: string | null): WriterOsProfile {
  const normalized = documentType && DOCUMENT_TYPES.has(documentType)
    ? documentType as DocumentObjectType
    : DEFAULT_TYPE

  const workbench = resolveProfile(normalized, formId || undefined)

  return {
    documentType: normalized,
    title: workbench.labels.workbenchTitle || 'Writer OS',
    moduleIds: MODULES_BY_TYPE[normalized],
    labels: LABELS_BY_TYPE[normalized] || {}
  }
}
