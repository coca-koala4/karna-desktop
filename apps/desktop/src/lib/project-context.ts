import type {
  DocumentObjectType,
  WritingProjectTaxonomy as CatalogWritingProjectTaxonomy,
  ProjectCatalog
} from '@/types/writer-project-catalog'

// 旧项目分类体系（schemaVersion: 1）
export interface LegacyProjectTaxonomy {
  schemaVersion: 1
  legacyType: string
  primaryDocumentType: DocumentObjectType
}

// 新项目分类体系（schemaVersion: 2）
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

// 项目分类联合类型
export type ProjectTaxonomy = WritingProjectTaxonomy | LegacyProjectTaxonomy

// 项目能力矩阵
export interface ProjectCapabilities {
  // 故事圣经
  hasStoryBible: boolean
  // 人物角色
  hasCharacters: boolean
  // 世界观设定
  hasWorldbuilding: boolean
  // 时间线
  hasTimeline: boolean
  // 叙事状态
  hasNarrativeState: boolean
  // 场景
  hasScenes: boolean
  // 分支选择
  hasBranching: boolean
  // 品牌语调
  hasBrandVoice: boolean
  // 事实核查
  hasFactChecking: boolean
  // 合规审查
  hasComplianceReview: boolean
  // 技术规范
  hasTechnicalSpec: boolean
  // 知识图谱
  hasKnowledgeGraph: boolean
  // 多智能体协作
  hasMultiAgent: boolean
}

// 项目完整上下文
export interface ProjectContext {
  // 项目 ID
  projectId: string
  // 工作区 ID
  workspaceId: string
  // 项目标题
  title: string
  // 项目分类
  taxonomy: ProjectTaxonomy
  // 是否为旧项目
  isLegacy: boolean
  // 主要文档类型
  primaryDocumentType: DocumentObjectType
  // 能力矩阵
  capabilities: ProjectCapabilities
  // 提示词配置 ID
  promptProfileId: string
  // 输出 Schema 配置 ID
  outputSchemaProfileId: string
  // 工作流配置 ID 列表
  workflowProfileIds: string[]
  // 知识库配置 ID
  knowledgeProfileId: string
  // 能力配置 ID
  capabilityProfileId: string
  // 已选文档列表
  selectedDocuments: Array<{
    relative_path: string
    document_type: DocumentObjectType
    title?: string
  }>
}

// 旧项目类型到文档类型的映射
const LEGACY_TYPE_TO_DOC_TYPE: Record<string, DocumentObjectType> = {
  // 小说类 → 叙事散文
  novel: 'narrative_prose',
  'web-novel': 'narrative_prose',
  poetry: 'narrative_prose',
  // 剧本类 → 剧本对白
  screenplay: 'script_dialogue',
  // 论文类 → 论证文档
  paper: 'argumentative_document',
  // 文案类 → 营销文案
  copywriting: 'marketing_copy',
  // 编辑类 → 资讯文章
  editorial: 'informational_article'
}

// 默认能力矩阵（全部关闭）
const DEFAULT_CAPABILITIES: ProjectCapabilities = {
  hasStoryBible: false,
  hasCharacters: false,
  hasWorldbuilding: false,
  hasTimeline: false,
  hasNarrativeState: false,
  hasScenes: false,
  hasBranching: false,
  hasBrandVoice: false,
  hasFactChecking: false,
  hasComplianceReview: false,
  hasTechnicalSpec: false,
  hasKnowledgeGraph: false,
  hasMultiAgent: false
}

// 解析项目分类
export function resolveProjectTaxonomy(project: any): ProjectTaxonomy {
  // 检查是否有 schemaVersion: 2 的新分类体系
  if (project?.taxonomy?.schemaVersion === 2) {
    const taxonomy = project.taxonomy as CatalogWritingProjectTaxonomy
    return {
      schemaVersion: 2,
      catalogVersion: taxonomy.catalogVersion || '2026.07',
      domainId: taxonomy.domainId,
      familyId: taxonomy.familyId,
      formId: taxonomy.formId,
      customFormLabel: taxonomy.customFormLabel,
      primaryDocumentType: taxonomy.primaryDocumentType,
      capabilityProfileId: taxonomy.capabilityProfileId
    }
  }

  // 旧项目，从 type 字段推断
  const legacyType = project?.type || 'novel'
  const primaryDocumentType = LEGACY_TYPE_TO_DOC_TYPE[legacyType] || 'narrative_prose'

  return {
    schemaVersion: 1,
    legacyType,
    primaryDocumentType
  }
}

// 根据文档类型获取能力矩阵
export function getCapabilitiesForDocType(
  docType: DocumentObjectType,
  isLegacy: boolean
): ProjectCapabilities {
  const capabilities: ProjectCapabilities = { ...DEFAULT_CAPABILITIES }

  // 旧项目兼容：所有 narrative 相关的能力都开启
  if (isLegacy) {
    capabilities.hasStoryBible = true
    capabilities.hasCharacters = true
    capabilities.hasWorldbuilding = true
    capabilities.hasTimeline = true
    capabilities.hasNarrativeState = true
    capabilities.hasScenes = true
    return capabilities
  }

  switch (docType) {
    case 'narrative_prose':
      // 叙事散文：故事/人物/世界观/时间线/叙事状态 全有
      capabilities.hasStoryBible = true
      capabilities.hasCharacters = true
      capabilities.hasWorldbuilding = true
      capabilities.hasTimeline = true
      capabilities.hasNarrativeState = true
      break

    case 'script_dialogue':
      // 剧本对白：有场景，有角色，无世界观/时间线
      capabilities.hasScenes = true
      capabilities.hasCharacters = true
      break

    case 'interactive_narrative':
      // 互动叙事：有分支，有状态，有角色
      capabilities.hasBranching = true
      capabilities.hasNarrativeState = true
      capabilities.hasCharacters = true
      break

    case 'marketing_copy':
      // 营销文案：有品牌语调，有事实核查
      capabilities.hasBrandVoice = true
      capabilities.hasFactChecking = true
      break

    case 'informational_article':
      // 资讯文章：有事实核查
      capabilities.hasFactChecking = true
      break

    case 'argumentative_document':
      // 论证文档：有事实核查
      capabilities.hasFactChecking = true
      break

    case 'structured_business_doc':
      // 结构化商务文档：有项目管理（多智能体）
      capabilities.hasMultiAgent = true
      break

    case 'regulated_document':
      // 受监管文档：有合规审查，有事实核查
      capabilities.hasComplianceReview = true
      capabilities.hasFactChecking = true
      break

    case 'technical_document':
      // 技术文档：有技术规范
      capabilities.hasTechnicalSpec = true
      break

    case 'knowledge_asset':
      // 知识资产：有知识图谱
      capabilities.hasKnowledgeGraph = true
      break

    // 过程型对象（outline / research_material / review_feedback / revision_artifact）：
    // 只有基础能力，不开启特殊功能
    default:
      break
  }

  return capabilities
}

// 构建完整项目上下文
export function buildProjectContext(
  project: any,
  catalog?: ProjectCatalog
): ProjectContext {
  const taxonomy = resolveProjectTaxonomy(project)
  const isLegacy = taxonomy.schemaVersion === 1
  const primaryDocumentType = taxonomy.primaryDocumentType
  const capabilities = getCapabilitiesForDocType(primaryDocumentType, isLegacy)

  // 基础信息
  const projectId = project?.id || ''
  const workspaceId = project?.workspace_id || ''
  const title = project?.title || '未命名项目'

  // 默认配置值
  let promptProfileId = 'default'
  let outputSchemaProfileId = 'default'
  let workflowProfileIds: string[] = []
  let knowledgeProfileId = 'default'
  let capabilityProfileId = 'default'

  // 新项目：从 catalog 查找 form 对应的配置
  if (!isLegacy && catalog) {
    const formId = (taxonomy as WritingProjectTaxonomy).formId
    const form = catalog.forms.find(f => f.id === formId)

    if (form) {
      promptProfileId = form.promptProfileId
      outputSchemaProfileId = form.outputSchemaProfileId
      workflowProfileIds = [...form.workflowProfileIds]
      knowledgeProfileId = form.knowledgeProfileId
      capabilityProfileId = form.capabilityProfileId
    }
  }

  // 旧项目兼容：设置合理的默认值
  if (isLegacy) {
    capabilityProfileId = 'legacy'
    switch (primaryDocumentType) {
      case 'narrative_prose':
        promptProfileId = 'narrative.novel.web'
        outputSchemaProfileId = 'narrative.chapters'
        workflowProfileIds = ['narrative.long-form', 'narrative.continuity']
        knowledgeProfileId = 'story-bible'
        break
      case 'script_dialogue':
        promptProfileId = 'script.feature'
        outputSchemaProfileId = 'script.standard'
        workflowProfileIds = ['script.development']
        knowledgeProfileId = 'story-bible'
        break
      case 'marketing_copy':
        promptProfileId = 'marketing.brand'
        outputSchemaProfileId = 'marketing.brand'
        workflowProfileIds = ['marketing.brand-development']
        knowledgeProfileId = 'brand-knowledge'
        break
      case 'informational_article':
        promptProfileId = 'journalism.news'
        outputSchemaProfileId = 'article.news'
        workflowProfileIds = ['journalism.investigative']
        knowledgeProfileId = 'research-heavy'
        break
      case 'argumentative_document':
        promptProfileId = 'academic.paper'
        outputSchemaProfileId = 'academic.paper'
        workflowProfileIds = ['academic.research']
        knowledgeProfileId = 'research-heavy'
        break
      default:
        break
    }
  }

  // 已选文档列表
  const selectedDocuments: Array<{
    relative_path: string
    document_type: DocumentObjectType
    title?: string
  }> = (project?.selected_documents || []).map((doc: any) => ({
    relative_path: doc.relative_path || '',
    document_type: doc.document_type || primaryDocumentType,
    title: doc.title
  }))

  return {
    projectId,
    workspaceId,
    title,
    taxonomy,
    isLegacy,
    primaryDocumentType,
    capabilities,
    promptProfileId,
    outputSchemaProfileId,
    workflowProfileIds,
    knowledgeProfileId,
    capabilityProfileId,
    selectedDocuments
  }
}
