import type { ComponentType } from 'react'

export type EditorType = 'markdown' | 'code' | 'text' | 'image' | 'office' | 'binary'

export interface EditorSelection {
  text: string
  start: number
  end: number
}

export interface EditorProps {
  filePath: string
  content: string
  onChange: (content: string) => void
  onSave?: () => void
  readOnly?: boolean
  onSelectionChange?: (selection: EditorSelection | null) => void
}

const OFFICE_EXTENSIONS = new Set([
  '.doc',
  '.docx',
  '.wps',
  '.xls',
  '.xlsx',
  '.et',
  '.ppt',
  '.pptx',
  '.dps',
  '.pdf'
])

const EXTENSION_MAP: Record<string, EditorType> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'text',
  '.log': 'text',
  '.csv': 'text',
  '.json': 'code',
  '.py': 'code',
  '.js': 'code',
  '.ts': 'code',
  '.tsx': 'code',
  '.jsx': 'code',
  '.c': 'code',
  '.cpp': 'code',
  '.h': 'code',
  '.hpp': 'code',
  '.css': 'code',
  '.html': 'code',
  '.xml': 'code',
  '.yaml': 'code',
  '.yml': 'code',
  '.toml': 'code',
  '.rs': 'code',
  '.go': 'code',
  '.java': 'code',
  '.rb': 'code',
  '.php': 'code',
  '.sh': 'code',
  '.bash': 'code',
  '.zsh': 'code',
  '.sql': 'code',
  '.vue': 'code',
  '.svelte': 'code',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.svg': 'image',
  '.bmp': 'image',
  '.ico': 'image',
  '.doc': 'office',
  '.docx': 'office',
  '.wps': 'office',
  '.xls': 'office',
  '.xlsx': 'office',
  '.et': 'office',
  '.ppt': 'office',
  '.pptx': 'office',
  '.dps': 'office',
  '.pdf': 'office',
  '.zip': 'binary',
  '.rar': 'binary',
  '.7z': 'binary',
  '.exe': 'binary',
  '.dll': 'binary',
  '.so': 'binary',
  '.dylib': 'binary',
  '.mp3': 'binary',
  '.mp4': 'binary',
  '.wav': 'binary',
  '.avi': 'binary',
  '.mkv': 'binary',
  '.mov': 'binary',
  '.ttf': 'binary',
  '.otf': 'binary',
  '.woff': 'binary',
  '.woff2': 'binary'
}

export function getEditorTypeForFile(filePath: string): EditorType {
  const lower = filePath.toLowerCase()
  const ext = lower.slice(lower.lastIndexOf('.'))

  return EXTENSION_MAP[ext] || 'text'
}

export function getFileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/)

  return parts[parts.length - 1] || filePath
}

export function getFileExtension(filePath: string): string {
  const name = getFileName(filePath)
  const dot = name.lastIndexOf('.')

  return dot >= 0 ? name.slice(dot) : ''
}

export function isEditableFileType(type: EditorType): boolean {
  return type === 'markdown' || type === 'code' || type === 'text'
}

export function isImageFileType(type: EditorType): boolean {
  return type === 'image'
}

export function isOfficeFileType(type: EditorType): boolean {
  return type === 'office'
}

export function isOfficeFileExtension(ext: string): boolean {
  return OFFICE_EXTENSIONS.has(ext.toLowerCase())
}

const editorComponents = new Map<EditorType, ComponentType<EditorProps>>()

export function registerEditor(type: EditorType, component: ComponentType<EditorProps>) {
  editorComponents.set(type, component)
}

export function getEditorComponent(type: EditorType): ComponentType<EditorProps> | null {
  return editorComponents.get(type) || null
}
