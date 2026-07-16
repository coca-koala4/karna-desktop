import type { DocumentObjectType, WritingDomain, WritingForm, DocumentPreset } from '@/types/writer-project-catalog'

export type NewWizardStep = 'domain' | 'form' | 'doctype' | 'documents' | 'confirm'

export interface SelectedDocument {
  presetId?: string
  title: string
  relativePath: string
  documentType: DocumentObjectType
  templateId?: string
  kind: 'file' | 'directory'
  selected: boolean
}

export interface NewWizardState {
  step: NewWizardStep
  selectedDomainId: string | null
  selectedFamilyId: string | null
  selectedFormId: string | null
  customFormLabel: string
  customFormDocType: DocumentObjectType | null
  selectedDocuments: SelectedDocument[]
  projectName: string
  projectDescription: string
  locationMode: 'karna' | 'documents' | 'custom'
  customPath: string
  creating: boolean
  catalogLoaded: boolean
  searchQuery: string
}

export function buildSelectedDocuments(form: WritingForm | null, presets: DocumentPreset[]): SelectedDocument[] {
  if (!form) return []
  return form.documentPresetIds
    .map(id => presets.find(p => p.id === id))
    .filter((p): p is DocumentPreset => Boolean(p))
    .map(preset => ({
      presetId: preset.id,
      title: preset.label,
      relativePath: preset.defaultPath,
      documentType: preset.documentType,
      templateId: preset.templateId,
      kind: preset.kind,
      selected: false
    }))
}

export function validateRelativePath(relPath: string): { valid: boolean; error?: string } {
  if (!relPath.trim()) return { valid: false, error: '路径不能为空' }
  if (relPath.startsWith('/') || relPath.startsWith('\\')) return { valid: false, error: '不能使用绝对路径' }
  if (/^[a-zA-Z]:/.test(relPath)) return { valid: false, error: '不能使用绝对路径' }
  if (/\.\./.test(relPath)) return { valid: false, error: '不能包含路径逃逸字符' }
  if (relPath.startsWith('.karna') || relPath.startsWith('.git')) return { valid: false, error: '不能使用系统保留目录' }
  if (/[\x00-\x1f]/.test(relPath)) return { valid: false, error: '路径包含非法字符' }
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i
  const parts = relPath.split(/[/\\]/)
  for (const part of parts) {
    if (reserved.test(part)) return { valid: false, error: `文件名 "${part}" 是 Windows 保留名` }
  }
  const lastPart = parts[parts.length - 1]
  if (!lastPart && !relPath.endsWith('/')) return { valid: false, error: '文件名为空' }
  return { valid: true }
}
