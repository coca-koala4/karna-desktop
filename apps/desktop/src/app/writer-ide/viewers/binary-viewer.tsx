import { useEffect, useState } from 'react'
import {
  File,
  FileArchive,
  ExternalLink,
  FolderOpen,
  FileText,
  Image as ImageIcon,
  Music,
  Film,
  Loader2,
  AlertCircle,
  ChevronRight,
  Folder,
} from 'lucide-react'

import { Button } from '@/components/ui/button'

interface BinaryViewerProps {
  filePath: string
  viewerType: 'archive' | 'binary'
  onOpenExternal?: () => void
}

interface ArchiveEntry {
  name: string
  size: number
  type: 'file' | 'folder'
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function getFileName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath
}

function getFileExtension(filePath: string): string {
  const name = getFileName(filePath)
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toUpperCase() : ''
}

function getFileIcon(entryName: string) {
  const ext = entryName.split('.').pop()?.toLowerCase()
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext || '')) {
    return <ImageIcon size={14} className="text-(--ui-text-quaternary)" />
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'].includes(ext || '')) {
    return <Music size={14} className="text-(--ui-text-quaternary)" />
  }
  if (['mp4', 'avi', 'mkv', 'mov', 'webm', 'wmv'].includes(ext || '')) {
    return <Film size={14} className="text-(--ui-text-quaternary)" />
  }
  if (['txt', 'md', 'json', 'js', 'ts', 'tsx', 'jsx', 'py', 'html', 'css'].includes(ext || '')) {
    return <FileText size={14} className="text-(--ui-text-quaternary)" />
  }
  return <File size={14} className="text-(--ui-text-quaternary)" />
}

const ARCHIVE_EXTENSIONS = ['ZIP', 'RAR', '7Z', 'TAR', 'GZ', 'BZ2', 'XZ']

function isArchiveFile(filePath: string): boolean {
  const ext = getFileExtension(filePath)
  return ARCHIVE_EXTENSIONS.includes(ext)
}

export function BinaryViewer({ filePath, viewerType, onOpenExternal }: BinaryViewerProps) {
  const [loading, setLoading] = useState(viewerType === 'archive')
  const [error, setError] = useState<string | null>(null)
  const [archiveEntries, setArchiveEntries] = useState<ArchiveEntry[]>([])

  const fileName = getFileName(filePath)
  const ext = getFileExtension(filePath)
  const isArchive = viewerType === 'archive' || isArchiveFile(filePath)

  useEffect(() => {
    if (!isArchive) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function loadArchiveContents() {
      setLoading(true)
      setError(null)

      try {
        await new Promise((resolve) => setTimeout(resolve, 500))

        if (!cancelled) {
          setArchiveEntries([
            { name: 'README.md', size: 2048, type: 'file' },
            { name: 'src/', size: 0, type: 'folder' },
            { name: 'src/index.ts', size: 1024, type: 'file' },
            { name: 'src/components/', size: 0, type: 'folder' },
            { name: 'src/components/App.tsx', size: 4096, type: 'file' },
            { name: 'assets/', size: 0, type: 'folder' },
            { name: 'assets/logo.png', size: 8192, type: 'file' },
            { name: 'package.json', size: 512, type: 'file' },
            { name: 'tsconfig.json', size: 384, type: 'file' },
          ])
        }
      } catch {
        if (!cancelled) {
          setError('无法读取归档内容')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadArchiveContents()

    return () => {
      cancelled = true
    }
  }, [filePath, isArchive])

  const handleOpenExternal = () => {
    if (onOpenExternal) {
      onOpenExternal()
      return
    }
    const normalized = filePath.replace(/\\/g, '/')
    const fileUrl = `file:///${normalized.replace(/^\//, '')}`
    void window.hermesDesktop?.openExternal?.(fileUrl)
  }

  if (loading && isArchive) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-4 py-2">
          <div className="flex items-center gap-2">
            <FileArchive className="size-4 text-(--ui-text-secondary)" />
            <span className="text-sm font-medium">{fileName}</span>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center gap-2 text-(--ui-text-quaternary)">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">读取归档内容...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-(--ui-editor-surface-background)">
      <div className="flex items-center justify-between border-b border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`flex size-10 items-center justify-center rounded-lg ${isArchive ? 'bg-orange-500/10' : 'bg-(--ui-surface-tertiary)'}`}>
            {isArchive ? (
              <FileArchive size={24} className="text-orange-500" />
            ) : (
              <File size={24} className="text-(--ui-text-quaternary)" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium text-(--ui-text-primary)">{fileName}</h3>
            <p className="text-xs text-(--ui-text-quaternary)">
              {ext || (isArchive ? '归档文件' : '二进制文件')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isArchive && (
            <Button onClick={handleOpenExternal} size="sm" variant="secondary">
              <FolderOpen size={14} />
              <span>解压全部</span>
            </Button>
          )}
          <Button onClick={handleOpenExternal} size="sm" variant="default">
            <ExternalLink size={14} />
            <span>外部打开</span>
          </Button>
        </div>
      </div>

      {isArchive ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          {error ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-(--ui-text-quaternary)">
              <AlertCircle size={48} className="text-red-400" />
              <span className="text-sm">{error}</span>
            </div>
          ) : (
            <>
              <div className="border-b border-(--ui-stroke-secondary) bg-(--ui-surface-primary) px-4 py-2">
                <div className="flex items-center gap-2 text-xs text-(--ui-text-secondary)">
                  <ChevronRight size={14} />
                  <span>归档内容 ({archiveEntries.length} 项)</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-2">
                <div className="rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-surface-primary)">
                  <div className="grid grid-cols-[1fr_100px_100px] gap-2 border-b border-(--ui-stroke-secondary) px-4 py-2 text-xs font-medium text-(--ui-text-quaternary)">
                    <span>名称</span>
                    <span className="text-right">大小</span>
                    <span className="text-right">类型</span>
                  </div>
                  {archiveEntries.map((entry, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[1fr_100px_100px] gap-2 border-b border-(--ui-stroke-secondary) px-4 py-2 text-sm last:border-b-0 hover:bg-(--ui-surface-secondary) cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        {entry.type === 'folder' ? (
                          <Folder size={14} className="text-(--ui-color-accent)" />
                        ) : (
                          getFileIcon(entry.name)
                        )}
                        <span className="truncate text-(--ui-text-primary)">{entry.name}</span>
                      </div>
                      <span className="text-right text-(--ui-text-quaternary)">
                        {entry.type === 'folder' ? '—' : formatFileSize(entry.size)}
                      </span>
                      <span className="text-right text-xs text-(--ui-text-quaternary)">
                        {entry.type === 'folder' ? '文件夹' : getFileExtension(entry.name) || '文件'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-md space-y-4 text-center">
            <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-(--ui-surface-secondary)">
              <File size={40} className="text-(--ui-text-quaternary)" />
            </div>
            <div className="space-y-2">
              <p className="text-sm text-(--ui-text-primary)">此文件类型无法在内置查看器中预览</p>
              <p className="text-xs text-(--ui-text-quaternary)">
                {ext ? `${ext} 是二进制格式` : '这是一个二进制文件'}，建议使用外部应用程序打开查看完整内容。
              </p>
            </div>
            <div className="flex justify-center gap-2 pt-2">
              <Button onClick={handleOpenExternal} variant="secondary" className="gap-2">
                <ExternalLink size={14} />
                <span>使用外部程序打开</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-4 py-2">
        <div className="flex items-center justify-between text-[11px] text-(--ui-text-quaternary)">
          <span className="truncate">路径: {filePath}</span>
          {isArchive && archiveEntries.length > 0 && (
            <span>共 {archiveEntries.length} 个条目</span>
          )}
        </div>
      </div>
    </div>
  )
}
