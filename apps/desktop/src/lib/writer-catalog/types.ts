export type DocumentObjectType =
  | 'narrative_prose'
  | 'script_dialogue'
  | 'interactive_narrative'
  | 'marketing_copy'
  | 'informational_article'
  | 'argumentative_document'
  | 'structured_business_doc'
  | 'regulated_document'
  | 'technical_document'
  | 'knowledge_asset'
  | 'outline'
  | 'research_material'
  | 'review_feedback'
  | 'revision_artifact'

export const DOCUMENT_OBJECT_TYPES: DocumentObjectType[] = [
  'narrative_prose', 'script_dialogue', 'interactive_narrative',
  'marketing_copy', 'informational_article', 'argumentative_document',
  'structured_business_doc', 'regulated_document', 'technical_document',
  'knowledge_asset', 'outline', 'research_material', 'review_feedback', 'revision_artifact'
]

export const DELIVERY_DOCUMENT_TYPES: DocumentObjectType[] = [
  'narrative_prose', 'script_dialogue', 'interactive_narrative',
  'marketing_copy', 'informational_article', 'argumentative_document',
  'structured_business_doc', 'regulated_document', 'technical_document',
  'knowledge_asset'
]

export const PROCESS_DOCUMENT_TYPES: DocumentObjectType[] = [
  'outline', 'research_material', 'review_feedback', 'revision_artifact'
]

export interface WriterDomain {
  id: string
  label: string
  description: string
  icon: string
  order: number
}

export interface WriterFamily {
  id: string
  domainId: string
  label: string
  description: string
  order: number
}

export interface DocumentPreset {
  id: string
  label: string
  description: string
  documentType: DocumentObjectType
  defaultPath: string
  kind: 'file' | 'directory'
}

export interface WriterForm {
  id: string
  domainId: string
  familyId: string
  label: string
  aliases: string[]
  primaryDocumentType: DocumentObjectType
  capabilityProfileId: string
  documentPresetIds: string[]
  promptProfileId: string
  outputSchemaProfileId: string
  workflowProfileIds: string[]
  knowledgeProfileId: string
  tags: string[]
}

export interface WriterWorkflowTemplate {
  id: string
  name: string
  description: string
  icon: string
  category: 'creation' | 'review' | 'planning' | 'research' | 'revision' | 'publication' | 'analysis' | 'output'
  applicableDocTypes: DocumentObjectType[]
  applicableFormIds?: string[]
  minComplexity: 'simple' | 'medium' | 'complex'
  estimatedSteps: number
  tags: string[]
  recommendedFor: string[]
  nodes: Array<{
    id: string
    type: 'planning' | 'creation' | 'review' | 'revision' | 'research' | 'analysis' | 'output' | 'publication'
    label: string
  }>
}

export const WRITER_CATALOG_VERSION = '2026.07'

export const DOC_TYPE_LABELS: Record<DocumentObjectType, string> = {
  narrative_prose: '叙事散文',
  script_dialogue: '剧本对白',
  interactive_narrative: '互动叙事',
  marketing_copy: '营销文案',
  informational_article: '资讯文章',
  argumentative_document: '论证文档',
  structured_business_doc: '结构化商务文档',
  regulated_document: '受监管文档',
  technical_document: '技术文档',
  knowledge_asset: '知识资产',
  outline: '大纲',
  research_material: '研究资料',
  review_feedback: '评审反馈',
  revision_artifact: '修订产物'
}
