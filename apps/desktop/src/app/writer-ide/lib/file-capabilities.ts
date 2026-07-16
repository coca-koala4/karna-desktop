import type { ComponentType } from 'react'

export type IngestMediaType = 'text' | 'image' | 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'audio' | 'video' | 'archive'

export type ViewerType =
  | 'text'
  | 'markdown'
  | 'code'
  | 'rich-document'
  | 'spreadsheet'
  | 'presentation'
  | 'pdf'
  | 'image'
  | 'media'
  | 'archive'
  | 'mindmap'
  | 'binary'

export type EditStrategy = 'in_place' | 'safe_copy' | 'read_only'
export type SaveStrategy = 'text_atomic' | 'structured_export' | 'external'
export type PreviewStrategy = 'native_editor' | 'office_pdf' | 'pdf_stream' | 'image_stream' | 'media_stream' | 'structured' | 'external'
export type ExtractStrategy = 'ingest' | 'none'

export interface FileCapabilityDescriptor {
  id: string
  extensions: string[]
  mimeTypes?: string[]
  viewer: ViewerType
  editable: boolean
  editStrategy: EditStrategy
  saveStrategy: SaveStrategy
  supportedActions: string[]
  ingestMediaType?: IngestMediaType
  runtimeLanguage?: 'python' | 'javascript' | 'typescript'
  validationProvider?: string
  previewStrategy?: PreviewStrategy
  extractStrategy?: ExtractStrategy
  supportsVisualPreview?: boolean
  supportsSafeCopy?: boolean
}

export interface DocumentSession {
  filePath: string
  relativePath: string
  capabilityId: string
  documentType?: string
  loadState: 'idle' | 'loading' | 'ready' | 'error'
  saveState: 'clean' | 'dirty' | 'saving' | 'conflict' | 'error'
  sourceVersion?: {
    mtime: number
    size: number
    hash?: string
  }
  diagnostics: EditorDiagnostic[]
  ingestResultId?: string
  runtimeSessionId?: string
}

export interface EditorDiagnostic {
  severity: 'error' | 'warning' | 'info' | 'hint'
  message: string
  line?: number
  column?: number
  endLine?: number
  endColumn?: number
  source?: string
  code?: string | number
}

export interface EditorSelection {
  text: string
  start: number
  end: number
}

export const CAPABILITIES: FileCapabilityDescriptor[] = [
  {
    id: 'markdown',
    extensions: ['.md', '.markdown'],
    viewer: 'markdown',
    editable: true,
    editStrategy: 'in_place',
    saveStrategy: 'text_atomic',
    supportedActions: [
      'file.save',
      'file.revert',
      'edit.undo',
      'edit.redo',
      'document.format',
      'ai.explain',
      'ai.rewrite',
      'ai.review',
    ],
    ingestMediaType: 'text'
  },
  {
    id: 'plaintext',
    extensions: ['.txt', '.log'],
    viewer: 'text',
    editable: true,
    editStrategy: 'in_place',
    saveStrategy: 'text_atomic',
    supportedActions: [
      'file.save',
      'file.revert',
      'edit.undo',
      'edit.redo',
      'ai.explain',
      'ai.rewrite'
    ],
    ingestMediaType: 'text'
  },
  {
    id: 'csv',
    extensions: ['.csv', '.tsv'],
    viewer: 'spreadsheet',
    editable: true,
    editStrategy: 'in_place',
    saveStrategy: 'text_atomic',
    supportedActions: [
      'file.save',
      'ai.explain'
    ],
    ingestMediaType: 'text'
  },
  {
    id: 'json',
    extensions: ['.json'],
    viewer: 'code',
    editable: true,
    editStrategy: 'in_place',
    saveStrategy: 'text_atomic',
    supportedActions: [
      'file.save',
      'file.revert',
      'edit.undo',
      'edit.redo',
      'document.format',
      'document.validate'
    ],
    validationProvider: 'json',
    ingestMediaType: 'text'
  },
  {
    id: 'yaml',
    extensions: ['.yaml', '.yml'],
    viewer: 'code',
    editable: true,
    editStrategy: 'in_place',
    saveStrategy: 'text_atomic',
    supportedActions: [
      'file.save',
      'file.revert',
      'edit.undo',
      'edit.redo',
      'document.format',
    ],
    ingestMediaType: 'text'
  },
  {
    id: 'xml',
    extensions: ['.xml'],
    viewer: 'code',
    editable: true,
    editStrategy: 'in_place',
    saveStrategy: 'text_atomic',
    supportedActions: [
      'file.save',
      'document.format',
      'document.validate'
    ],
    validationProvider: 'xml',
    ingestMediaType: 'text'
  },
  {
    id: 'toml',
    extensions: ['.toml'],
    viewer: 'code',
    editable: true,
    editStrategy: 'in_place',
    saveStrategy: 'text_atomic',
    supportedActions: [
      'file.save',
      'document.format',
    ],
    ingestMediaType: 'text'
  },
  {
    id: 'html',
    extensions: ['.html', '.htm'],
    viewer: 'code',
    editable: true,
    editStrategy: 'in_place',
    saveStrategy: 'text_atomic',
    supportedActions: [
      'file.save',
      'document.format'
    ],
    ingestMediaType: 'text'
  },
  {
    id: 'python',
    extensions: ['.py'],
    viewer: 'code',
    editable: true,
    editStrategy: 'in_place',
    saveStrategy: 'text_atomic',
    supportedActions: [
      'file.save',
      'file.revert',
      'edit.undo',
      'edit.redo',
      'document.format',
      'code.run',
      'code.stop',
      'ai.explain',
      'ai.review'
    ],
    runtimeLanguage: 'python',
    ingestMediaType: 'text'
  },
  {
    id: 'javascript',
    extensions: ['.js', '.mjs', '.cjs', '.jsx'],
    viewer: 'code',
    editable: true,
    editStrategy: 'in_place',
    saveStrategy: 'text_atomic',
    supportedActions: [
      'file.save',
      'file.revert',
      'edit.undo',
      'edit.redo',
      'document.format',
      'code.run',
      'code.stop',
      'ai.explain',
      'ai.review'
    ],
    runtimeLanguage: 'javascript',
    ingestMediaType: 'text'
  },
  {
    id: 'typescript',
    extensions: ['.ts', '.tsx'],
    viewer: 'code',
    editable: true,
    editStrategy: 'in_place',
    saveStrategy: 'text_atomic',
    supportedActions: [
      'file.save',
      'file.revert',
      'edit.undo',
      'edit.redo',
      'document.format',
      'ai.explain',
      'ai.review'
    ],
    ingestMediaType: 'text'
  },
  {
    id: 'code',
    extensions: [
      '.c', '.cpp', '.h', '.hpp',
      '.css', '.scss', '.less',
      '.rs', '.go', '.java', '.rb', '.php',
      '.sh', '.bash', '.zsh', '.sql',
      '.vue', '.svelte', '.swift', '.kt'
    ],
    viewer: 'code',
    editable: true,
    editStrategy: 'in_place',
    saveStrategy: 'text_atomic',
    supportedActions: [
      'file.save',
      'file.revert',
      'edit.undo',
      'edit.redo',
      'document.format',
      'ai.explain',
      'ai.review'
    ],
    ingestMediaType: 'text'
  },
  {
    id: 'pdf',
    extensions: ['.pdf'],
    viewer: 'pdf',
    editable: false,
    editStrategy: 'read_only',
    saveStrategy: 'external',
    supportedActions: [
      'file.openExternal',
      'ai.summarize',
      'ai.explain'
    ],
    ingestMediaType: 'pdf'
  },
  {
    id: 'docx',
    extensions: ['.docx', '.doc', '.wps'],
    viewer: 'rich-document',
    editable: false,
    editStrategy: 'read_only',
    saveStrategy: 'external',
    supportedActions: [
      'file.openExternal',
      'ai.summarize',
      'ai.explain'
    ],
    ingestMediaType: 'docx'
  },
  {
    id: 'xlsx',
    extensions: ['.xlsx', '.xls', '.et'],
    viewer: 'spreadsheet',
    editable: false,
    editStrategy: 'read_only',
    saveStrategy: 'external',
    supportedActions: [
      'file.openExternal',
      'ai.explain'
    ],
    ingestMediaType: 'xlsx'
  },
  {
    id: 'pptx',
    extensions: ['.pptx', '.ppt', '.dps'],
    viewer: 'presentation',
    editable: false,
    editStrategy: 'read_only',
    saveStrategy: 'external',
    supportedActions: [
      'file.openExternal',
      'ai.explain'
    ],
    ingestMediaType: 'pptx'
  },
  {
    id: 'image',
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'],
    viewer: 'image',
    editable: false,
    editStrategy: 'read_only',
    saveStrategy: 'external',
    supportedActions: [
      'file.openExternal',
      'ai.describe'
    ],
    ingestMediaType: 'image'
  },
  {
    id: 'audio',
    extensions: ['.mp3', '.wav', '.ogg', '.flac', '.m4a'],
    viewer: 'media',
    editable: false,
    editStrategy: 'read_only',
    saveStrategy: 'external',
    supportedActions: [
      'file.openExternal',
      'ai.transcribe'
    ],
    ingestMediaType: 'audio'
  },
  {
    id: 'video',
    extensions: ['.mp4', '.avi', '.mkv', '.mov', '.webm'],
    viewer: 'media',
    editable: false,
    editStrategy: 'read_only',
    saveStrategy: 'external',
    supportedActions: [
      'file.openExternal',
    ],
    ingestMediaType: 'video'
  },
  {
    id: 'xmind',
    extensions: ['.xmind'],
    viewer: 'mindmap',
    editable: false,
    editStrategy: 'read_only',
    saveStrategy: 'external',
    supportedActions: ['file.openExternal', 'ai.explain'],
    ingestMediaType: 'archive'
  },
  {
    id: 'archive',
    extensions: ['.zip', '.rar', '.7z', '.tar', '.gz'],
    viewer: 'archive',
    editable: false,
    editStrategy: 'read_only',
    saveStrategy: 'external',
    supportedActions: ['file.openExternal'],
    ingestMediaType: 'archive'
  },
  {
    id: 'binary',
    extensions: ['.exe', '.dll', '.so', '.dylib', '.ttf', '.otf', '.woff', '.woff2'],
    viewer: 'binary',
    editable: false,
    editStrategy: 'read_only',
    saveStrategy: 'external',
    supportedActions: ['file.openExternal']
  }
]

const extensionMap = new Map<string, FileCapabilityDescriptor>()
const idMap = new Map<string, FileCapabilityDescriptor>()

function withDerivedCapabilities(capability: FileCapabilityDescriptor): FileCapabilityDescriptor {
  const previewStrategy: PreviewStrategy =
    capability.viewer === 'rich-document' || capability.viewer === 'presentation' ? 'office_pdf'
      : capability.viewer === 'pdf' ? 'pdf_stream'
        : capability.viewer === 'image' ? 'image_stream'
          : capability.viewer === 'media' ? 'media_stream'
            : capability.viewer === 'spreadsheet' || capability.viewer === 'mindmap' ? 'structured'
              : capability.viewer === 'binary' || capability.viewer === 'archive' ? 'external'
                : 'native_editor'
  return {
    ...capability,
    previewStrategy,
    extractStrategy: capability.ingestMediaType ? 'ingest' : 'none',
    supportsVisualPreview: previewStrategy !== 'external',
    supportsSafeCopy: capability.editStrategy === 'safe_copy'
  }
}

for (const sourceCapability of CAPABILITIES) {
  const cap = withDerivedCapabilities(sourceCapability)
  Object.assign(sourceCapability, cap)
  idMap.set(cap.id, cap)
  for (const ext of cap.extensions) {
    extensionMap.set(ext.toLowerCase(), cap)
  }
}

export function getCapabilityForFile(filePath: string): FileCapabilityDescriptor {
  const lower = filePath.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot < 0) return idMap.get('plaintext')!
  const ext = lower.slice(dot)
  return extensionMap.get(ext) || idMap.get('plaintext')!
}

export function getCapabilityById(id: string): FileCapabilityDescriptor | undefined {
  return idMap.get(id)
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

export function getRelativePath(filePath: string, rootPath: string | null): string {
  if (!rootPath) return filePath
  const normalizedRoot = rootPath.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedPath = filePath.replace(/\\/g, '/')
  if (normalizedPath.startsWith(normalizedRoot + '/')) {
    return normalizedPath.slice(normalizedRoot.length + 1)
  }
  return getFileName(filePath)
}

export interface EditorCommand {
  id: string
  label: string
  icon?: string
  enabled: boolean
  visible: boolean
  execute: () => void | Promise<void>
  pending?: boolean
  error?: string | null
  shortcut?: string
}

export function getCommandLabel(id: string): string {
  const labels: Record<string, string> = {
    'file.save': '保存',
    'file.saveAs': '另存为',
    'file.revert': '还原',
    'file.openExternal': '外部打开',
    'edit.undo': '撤销',
    'edit.redo': '重做',
    'edit.find': '查找',
    'edit.replace': '替换',
    'document.format': '格式化',
    'document.validate': '验证',
    'document.comment': '批注',
    'document.export': '导出',
    'code.run': '运行',
    'code.debug': '调试',
    'code.stop': '停止',
    'ai.explain': '解释',
    'ai.rewrite': '改写',
    'ai.review': '审阅',
    'ai.summarize': '总结',
    'ai.describe': '描述',
    'ai.transcribe': '转写',
    'knowledge.index': '加入知识库'
  }
  return labels[id] || id
}

export function getCommandIcon(id: string): string {
  const icons: Record<string, string> = {
    'file.save': 'save',
    'file.saveAs': 'save-as',
    'file.revert': 'discard',
    'file.openExternal': 'link-external',
    'edit.undo': 'undo',
    'edit.redo': 'redo',
    'edit.find': 'search',
    'edit.replace': 'replace',
    'document.format': 'wand',
    'document.validate': 'check',
    'document.comment': 'comment',
    'document.export': 'export',
    'code.run': 'play',
    'code.debug': 'bug',
    'code.stop': 'debug-stop',
    'ai.explain': 'lightbulb',
    'ai.rewrite': 'edit',
    'ai.review': 'comment-discussion',
    'ai.summarize': 'book',
    'ai.describe': 'eye',
    'ai.transcribe': 'mic',
    'knowledge.index': 'database'
  }
  return icons[id] || 'symbol-keyword'
}

export function getCommandShortcut(id: string): string | undefined {
  const shortcuts: Record<string, string> = {
    'file.save': 'Ctrl+S',
    'edit.find': 'Ctrl+F',
    'edit.replace': 'Ctrl+H',
    'edit.undo': 'Ctrl+Z',
    'edit.redo': 'Ctrl+Y',
    'code.run': 'Ctrl+F5',
    'code.debug': 'F5',
    'code.stop': 'Shift+F5'
  }
  return shortcuts[id]
}
