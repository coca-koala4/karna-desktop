import type { DocumentObjectType } from './types'

export type WorkbenchPhase = 'prepare' | 'build' | 'write' | 'review' | 'deliver'

export type ModuleActionDefinition = {
  id: string
  label: string
  description?: string
  icon?: string
  method?: 'GET' | 'POST'
  confirmRequired?: boolean
}

export type WorkbenchModuleDefinition = {
  id: string
  version: number
  title: string
  description: string
  icon: string
  group: string
  applicableDocumentTypes: DocumentObjectType[]
  applicableFormIds?: string[]
  capabilityPackId: string
  phase: WorkbenchPhase
  rendererKey: string
  actions: ModuleActionDefinition[]
  metricIds: string[]
  isCore: boolean
  navOrder: number
  requiresSetup?: boolean
}

export type CapabilityPackDefinition = {
  id: string
  name: string
  description: string
  icon: string
  color: string
  applicableDocumentTypes: DocumentObjectType[]
  moduleIds: string[]
  metricIds: string[]
  labels: {
    contentUnit: string
    knowledgeHub: string
    entities: string
    reviewCenter: string
    delivery: string
  }
}

export type WorkbenchNavigationGroup = {
  id: string
  label: string
  icon: string
  moduleIds: string[]
}

export type MetricDefinition = {
  id: string
  label: string
  icon: string
  sourceModuleId: string
  applicableDocumentTypes: DocumentObjectType[]
  valueType: 'number' | 'string'
  format?: 'count' | 'percent' | 'text'
}

export type PhaseDefinition = {
  id: WorkbenchPhase
  label: string
  description: string
  suggestedModuleIds: string[]
  completionCheck: {
    requiredMetrics?: string[]
    minModulesReady?: number
  }
}

export type WorkbenchProfile = {
  id: string
  name: string
  description: string
  applicableDocumentTypes: DocumentObjectType[]
  applicableFormIds: string[]
  phases: PhaseDefinition[]
  navigation: WorkbenchNavigationGroup[]
  dashboardMetricIds: string[]
  capabilityPackIds: string[]
  recommendedWorkflowIds: string[]
  labels: {
    contentUnit: string
    knowledgeHub: string
    reviewCenter: string
    delivery: string
    workbenchTitle: string
  }
}

export type ProjectWorkModeV3 = {
  schemaVersion: 3
  primaryDocumentType: DocumentObjectType
  enabledDocumentTypes: DocumentObjectType[]
  domainId: string
  familyId: string
  formId: string
  customFormLabel?: string
  workbenchProfileId: string
  capabilityPackIds: string[]
  promptOverlayId?: string
  outputSchemaOverlayId?: string
  workflowProfileIds: string[]
  enabledModuleIds: string[]
  disabledModuleIds: string[]
}

export type ResolvedWritingContext = {
  projectId: string
  workMode: ProjectWorkModeV3
  activeDocument?: {
    id: string
    documentType: DocumentObjectType
    formId?: string
  }
  enabledCapabilities: string[]
  enabledModuleIds: string[]
  workflowRecommendations: string[]
}
