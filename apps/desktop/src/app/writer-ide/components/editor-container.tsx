import { useMemo } from 'react'
import type { FileCapabilityDescriptor } from '../lib/file-capabilities'
import type { DocumentState } from '../lib/use-document-sessions'
import { MarkdownEditor } from '../editors/markdown-editor'
import { TextEditor } from '../editors/text-editor'
import { CodeEditorEnhanced } from '../editors/code-editor-enhanced'
import { CsvEditor } from '../editors/csv-editor'
import { PdfViewer } from '../viewers/pdf-viewer'
import { OfficeViewer } from '../viewers/office-viewer'
import { XmindViewer } from '../viewers/xmind-viewer'
import { ImageViewer } from '../viewers/image-viewer'
import { MediaViewer } from '../viewers/media-viewer'
import { BinaryViewer } from '../viewers/binary-viewer'

interface EditorContainerProps {
  filePath: string
  capability: FileCapabilityDescriptor
  document: DocumentState
  onChange: (content: string) => void
  onSave: () => void
  onSelectionChange?: (selection: { text: string; start: number; end: number } | null) => void
  onCursorPosition?: (pos: { line: number; column: number }) => void
  onToggleBreakpoint?: (line: number) => void
  formatTrigger?: number
  onOpenExternal?: () => void
  onRetryIngest?: (filePath: string) => void
}

function getLanguageForExtension(ext: string): string {
  const map: Record<string, string> = {
    '.py': 'python',
    '.js': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.json': 'json',
    '.html': 'html',
    '.htm': 'html',
    '.css': 'css',
    '.xml': 'xml',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.md': 'markdown',
    '.markdown': 'markdown',
    '.rs': 'rust',
    '.go': 'go',
    '.java': 'java',
    '.rb': 'ruby',
    '.php': 'php',
    '.sh': 'shell',
    '.bash': 'shell',
    '.zsh': 'shell',
    '.sql': 'sql',
    '.c': 'c',
    '.cpp': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.vue': 'javascript',
    '.svelte': 'javascript'
  }
  return map[ext.toLowerCase()] || 'plaintext'
}

function getFileExtension(filePath: string): string {
  const name = filePath.split(/[/\\]/).pop() || ''
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot) : ''
}

export function EditorContainer({
  filePath,
  capability,
  document,
  onChange,
  onSave,
  onSelectionChange,
  onCursorPosition,
  onToggleBreakpoint,
  formatTrigger,
  onOpenExternal,
  onRetryIngest
}: EditorContainerProps) {
  const ext = useMemo(() => getFileExtension(filePath), [filePath])
  const language = useMemo(() => getLanguageForExtension(ext), [ext])

  if (document.loading) {
    return (
      <div className="flex h-full items-center justify-center text-(--ui-text-secondary)">
        <div className="flex items-center gap-2">
          <div className="size-4 animate-spin rounded-full border-2 border-(--ui-color-accent) border-t-transparent" />
          加载中...
        </div>
      </div>
    )
  }

  if (document.error && (!capability.ingestMediaType || capability.ingestMediaType === 'text')) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="text-red-500">无法打开文件</div>
        <div className="max-w-md text-sm text-(--ui-text-secondary)">{document.error}</div>
      </div>
    )
  }

  switch (capability.viewer) {
    case 'markdown':
      return (
        <MarkdownEditor
          content={document.content}
          filePath={filePath}
          onChange={onChange}
          onSave={onSave}
          onSelectionChange={onSelectionChange}
        />
      )

    case 'text':
      return (
        <TextEditor
          content={document.content}
          filePath={filePath}
          onChange={onChange}
          onSave={onSave}
          onSelectionChange={onSelectionChange}
        />
      )

    case 'code':
      return (
        <CodeEditorEnhanced
          content={document.content}
          filePath={filePath}
          language={language}
          onChange={onChange}
          onSave={onSave}
          onSelectionChange={onSelectionChange}
          onCursorPosition={onCursorPosition}
          diagnostics={document.diagnostics}
          breakpoints={document.breakpoints}
          onToggleBreakpoint={onToggleBreakpoint}
          formatTrigger={formatTrigger}
          readOnly={capability.editStrategy === 'read_only'}
        />
      )

    case 'spreadsheet':
      if (capability.id === 'csv') {
        return (
          <CsvEditor
            content={document.content}
            filePath={filePath}
            onChange={onChange}
            onSave={onSave}
            delimiter={ext === '.tsv' ? '\t' : ','}
          />
        )
      }
      return (
        <OfficeViewer
          filePath={filePath}
          fileType="xlsx"
          content={document.content}
          onOpenExternal={onOpenExternal}
          ingestResultId={document.ingestResultId}
          ingestStatus={document.ingestStatus}
          ingestText={document.ingestText}
          ingestWarnings={document.ingestWarnings}
          ingestError={document.error ?? undefined}
          errorType={document.error ? 'ingest_failed' : undefined}
          onRetryIngest={onRetryIngest ? () => onRetryIngest(filePath) : undefined}
        />
      )

    case 'rich-document':
      return (
        <OfficeViewer
          filePath={filePath}
          fileType="docx"
          content={document.content}
          onOpenExternal={onOpenExternal}
          ingestResultId={document.ingestResultId}
          ingestStatus={document.ingestStatus}
          ingestText={document.ingestText}
          ingestWarnings={document.ingestWarnings}
          ingestError={document.error ?? undefined}
          errorType={document.error ? 'ingest_failed' : undefined}
          onRetryIngest={onRetryIngest ? () => onRetryIngest(filePath) : undefined}
        />
      )

    case 'presentation':
      return (
        <OfficeViewer
          filePath={filePath}
          fileType="pptx"
          content={document.content}
          onOpenExternal={onOpenExternal}
          ingestResultId={document.ingestResultId}
          ingestStatus={document.ingestStatus}
          ingestText={document.ingestText}
          ingestWarnings={document.ingestWarnings}
          ingestError={document.error ?? undefined}
          errorType={document.error ? 'ingest_failed' : undefined}
          onRetryIngest={onRetryIngest ? () => onRetryIngest(filePath) : undefined}
        />
      )

    case 'pdf':
      return (
        <PdfViewer
          filePath={filePath}
          onOpenExternal={onOpenExternal}
          ingestResultId={document.ingestResultId}
          ingestStatus={document.ingestStatus}
        />
      )

    case 'image':
      return <ImageViewer filePath={filePath} onOpenExternal={onOpenExternal} />

    case 'media':
      return (
        <MediaViewer
          filePath={filePath}
          mediaType={capability.ingestMediaType === 'audio' ? 'audio' : 'video'}
          onOpenExternal={onOpenExternal}
          ingestResultId={document.ingestResultId}
          ingestStatus={document.ingestStatus}
        />
      )

    case 'archive':
      return (
        <BinaryViewer
          filePath={filePath}
          viewerType="archive"
          onOpenExternal={onOpenExternal}
        />
      )

    case 'mindmap':
      return <XmindViewer filePath={filePath} onOpenExternal={onOpenExternal} />

    case 'binary':
    default:
      return (
        <BinaryViewer
          filePath={filePath}
          viewerType="binary"
          onOpenExternal={onOpenExternal}
        />
      )
  }
}
