import { useCallback, useEffect, useRef } from 'react'
import { setContextEnvelope, type ContextEnvelope } from '@/hermes'

const DOMAIN_TO_WRITING_DOMAIN: Record<string, string> = {
  literature: 'fiction',
  'film-theater': 'screenplay',
  'games-interactive': 'fiction',
  'marketing-brand': 'marketing_brand',
  'news-publishing': 'journalism',
  'academic-research': 'academic',
  'business-enterprise': 'technical_writing',
  'legal-government': 'legal_policy',
  'technical-docs': 'technical_writing',
  'knowledge-assets': 'general'
}

const DOCUMENT_TYPE_TO_WRITING_DOMAIN: Record<string, string> = {
  narrative_prose: 'fiction',
  script_dialogue: 'screenplay',
  interactive_narrative: 'fiction',
  marketing_copy: 'marketing_brand',
  informational_article: 'journalism',
  argumentative_document: 'academic',
  structured_business_doc: 'technical_writing',
  regulated_document: 'legal_policy',
  technical_document: 'technical_writing',
  knowledge_asset: 'general',
  outline: 'fiction',
  research_material: 'academic',
  review_feedback: 'edit_review',
  revision_artifact: 'edit_review'
}

const FILE_EXT_TO_KIND: Record<string, string> = {
  md: 'markdown',
  markdown: 'markdown',
  txt: 'text',
  docx: 'document',
  pdf: 'pdf',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  py: 'code',
  js: 'code',
  ts: 'code',
  tsx: 'code',
  jsx: 'code',
  html: 'code',
  css: 'code',
  csv: 'csv'
}

let currentEnvelopeState: Partial<ContextEnvelope> = {}
let pendingUpdate: Promise<{ ok: boolean; envelope?: ContextEnvelope }> | null = null
let pendingData: Partial<ContextEnvelope> | null = null

export function resolveRuntimeProfile(writingDomain: string): string {
  switch (writingDomain) {
    case 'fiction':
    case 'screenplay':
    case 'poetry':
      return 'longform_writing'
    case 'academic':
      return 'academic'
    case 'technical_writing':
    case 'legal_policy':
      return 'technical_writing'
    case 'journalism':
    case 'marketing_brand':
      return 'edit_review'
    case 'translation':
      return 'translation'
    default:
      return 'longform_writing'
  }
}

export function resolveWritingDomain(domainId?: string, documentType?: string): string {
  if (documentType && DOCUMENT_TYPE_TO_WRITING_DOMAIN[documentType]) {
    return DOCUMENT_TYPE_TO_WRITING_DOMAIN[documentType]
  }
  if (domainId && DOMAIN_TO_WRITING_DOMAIN[domainId]) {
    return DOMAIN_TO_WRITING_DOMAIN[domainId]
  }
  return 'fiction'
}

export function resolveArtifactKind(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return FILE_EXT_TO_KIND[ext] || 'text'
}

async function flushEnvelopeUpdate(): Promise<{ ok: boolean; envelope?: ContextEnvelope }> {
  if (!pendingData) {
    return pendingUpdate || Promise.resolve({ ok: true })
  }

  const dataToSend = { ...currentEnvelopeState, ...pendingData }
  pendingData = null

  try {
    const result = await setContextEnvelope(dataToSend)
    if (result.ok) {
      currentEnvelopeState = dataToSend
    }
    return result
  } catch (err) {
    console.warn('Failed to update context envelope:', err)
    return { ok: false }
  }
}

function scheduleEnvelopeUpdate(partial: Partial<ContextEnvelope>): Promise<{ ok: boolean; envelope?: ContextEnvelope }> {
  pendingData = { ...pendingData, ...partial }
  if (!pendingUpdate) {
    pendingUpdate = Promise.resolve().then(() => {
      pendingUpdate = null
      return flushEnvelopeUpdate()
    })
  }
  return pendingUpdate
}

export function enterWriterMode(params: {
  workspaceId: string
  projectId?: string
  domainId?: string
  documentType?: string
}): Promise<{ ok: boolean; envelope?: ContextEnvelope }> {
  const writingDomain = resolveWritingDomain(params.domainId, params.documentType)
  const runtimeProfile = resolveRuntimeProfile(writingDomain)

  currentEnvelopeState = {}

  return scheduleEnvelopeUpdate({
    module: 'writer_ide',
    writing_domain: writingDomain,
    runtime_profile: runtimeProfile,
    workspace_id: params.workspaceId,
    project_id: params.projectId,
    // The submitted composer text remains the user instruction. Selected
    // manuscript content is transported in selection_text and rendered by the
    // rebuilder as a separately labelled reference block.
    source_kind: 'user_instruction'
  })
}

export function updateWriterArtifact(filePath: string, documentType?: string): Promise<{ ok: boolean; envelope?: ContextEnvelope }> {
  const writingDomain = documentType && DOCUMENT_TYPE_TO_WRITING_DOMAIN[documentType]
    ? DOCUMENT_TYPE_TO_WRITING_DOMAIN[documentType]
    : currentEnvelopeState.writing_domain || 'fiction'
  const runtimeProfile = resolveRuntimeProfile(writingDomain)

  return scheduleEnvelopeUpdate({
    active_artifact_path: filePath,
    active_artifact_kind: resolveArtifactKind(filePath),
    writing_domain: writingDomain,
    runtime_profile: runtimeProfile
  })
}

export function updateWriterSelection(text: string | null, start?: number, end?: number): Promise<{ ok: boolean; envelope?: ContextEnvelope }> {
  return scheduleEnvelopeUpdate({
    selection_text: text || undefined,
    selection_start: start,
    selection_end: end
  })
}

export function getCurrentEnvelopeState(): Partial<ContextEnvelope> {
  return { ...currentEnvelopeState }
}

export function getEnvelopeMetadata(): Record<string, unknown> {
  const state = currentEnvelopeState
  if (!state.enabled && state.enabled !== undefined) return {}
  // Send one versioned object instead of a handful of loose metadata fields.
  // The gateway binds this object to exactly one turn/session.
  return {
    context_envelope: {
      version: state.version || 1,
      enabled: state.enabled ?? true,
      ...state
    }
  }
}

export interface WriterContextState {
  workspaceId: string
  projectId?: string
  domainId?: string
  documentType?: string
  activeFilePath?: string
  selectionText?: string
}

export function useWriterContextEnvelope(params: {
  workspaceId: string
  projectId?: string
  domainId?: string
  documentType?: string
  activeFilePath?: string
  selectionText?: string
  enabled?: boolean
}) {
  const initializedRef = useRef(false)
  const { workspaceId, projectId, domainId, documentType, activeFilePath, selectionText, enabled = true } = params

  const stableEnter = useCallback(() => {
    if (!enabled || !workspaceId) return
    initializedRef.current = true
    void enterWriterMode({ workspaceId, projectId, domainId, documentType })
  }, [enabled, workspaceId, projectId, domainId, documentType])

  useEffect(() => {
    if (enabled && workspaceId && !initializedRef.current) {
      stableEnter()
    }
    return () => {
      if (!enabled) {
        initializedRef.current = false
      }
    }
  }, [enabled, workspaceId, stableEnter])

  useEffect(() => {
    if (enabled && workspaceId && activeFilePath) {
      void updateWriterArtifact(activeFilePath, documentType)
    }
  }, [enabled, workspaceId, activeFilePath, documentType])

  useEffect(() => {
    if (enabled && workspaceId) {
      void updateWriterSelection(selectionText || null)
    }
  }, [enabled, workspaceId, selectionText])
}
