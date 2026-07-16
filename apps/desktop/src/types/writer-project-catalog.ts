export type DeliverableDocumentType =
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

export type ProcessDocumentType =
  | 'outline'
  | 'research_material'
  | 'review_feedback'
  | 'revision_artifact'

export type DocumentObjectType = DeliverableDocumentType | ProcessDocumentType

export const DOCUMENT_OBJECT_TYPES: DocumentObjectType[] = [
  'narrative_prose',
  'script_dialogue',
  'interactive_narrative',
  'marketing_copy',
  'informational_article',
  'argumentative_document',
  'structured_business_doc',
  'regulated_document',
  'technical_document',
  'knowledge_asset',
  'outline',
  'research_material',
  'review_feedback',
  'revision_artifact'
]

export const DOCUMENT_TYPE_LABELS: Record<DocumentObjectType, string> = {
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
  outline: '大纲规划',
  research_material: '研究资料',
  review_feedback: '审阅反馈',
  revision_artifact: '修订产物'
}

export interface WritingDomain {
  id: string
  label: string
  description: string
  icon: string
  order: number
}

export interface WritingFormFamily {
  id: string
  domainId: string
  label: string
  description?: string
  order: number
}

export interface WritingForm {
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
  searchableText: string
}

export interface DocumentPreset {
  id: string
  label: string
  description: string
  documentType: DocumentObjectType
  defaultPath: string
  templateId?: string
  kind: 'file' | 'directory'
}

export interface WritingProjectTaxonomy {
  schemaVersion: 2
  catalogVersion: string
  domainId: string
  familyId: string
  formId: string
  customFormLabel?: string
  primaryDocumentType: DocumentObjectType
  capabilityProfileId: string
}

export interface SelectedProjectDocument {
  presetId?: string
  title: string
  relativePath: string
  documentType: DocumentObjectType
  templateId?: string
}

export interface CreatedProjectDocument {
  relative_path: string
  document_type: DocumentObjectType
  created_at: string
}

export interface ProjectCatalog {
  version: string
  domains: WritingDomain[]
  families: WritingFormFamily[]
  forms: WritingForm[]
  presets: DocumentPreset[]
  capabilityProfiles: string[]
  promptProfiles: string[]
  outputSchemaProfiles: string[]
  workflowProfiles: string[]
  knowledgeProfiles: string[]
}

export interface WriterProjectCatalogResponse {
  ok: boolean
  catalog: ProjectCatalog
}

export interface WriterProjectPreflightRequest {
  title: string
  description?: string
  folder: string
  workspace_id?: string
  taxonomy: Omit<WritingProjectTaxonomy, 'schemaVersion' | 'catalogVersion'> & {
    schemaVersion?: 2
    catalogVersion?: string
  }
  selected_documents: SelectedProjectDocument[]
}

export interface WriterProjectPreflightResponse {
  ok: boolean
  valid: boolean
  errors: PreflightError[]
  warnings: PreflightWarning[]
  pathConflicts: string[]
}

export interface PreflightError {
  code: string
  message: string
  field?: string
}

export interface PreflightWarning {
  code: string
  message: string
}
