import { useEffect, useRef, useState } from 'react'
import {
  FileText,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Printer,
  ExternalLink,
  Loader2,
  AlertCircle,
  FileSpreadsheet,
  RotateCcw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createWriterPreviewBlob } from '@/lib/writer-preview'

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

interface PdfViewerProps {
  filePath: string
  onOpenExternal?: () => void
  ingestResultId?: string
  ingestStatus?: 'idle' | 'queued' | 'parsing' | 'parsed' | 'failed'
}

type IngestStatus = 'idle' | 'processing' | 'completed' | 'failed'

export function PdfViewer({ filePath, onOpenExternal, ingestResultId, ingestStatus: externalIngestStatus }: PdfViewerProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<number>(0)
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [ingestStatus, setIngestStatus] = useState<IngestStatus>('idle')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const fileName = getFileName(filePath)

  useEffect(() => {
    let cancelled = false
    let releasePreview: (() => Promise<void>) | undefined

    async function loadPdf() {
      setLoading(true)
      setError(null)

      try {
        const preview = await createWriterPreviewBlob(filePath, 'application/pdf')
        releasePreview = preview.release

        if (!cancelled) {
          setDataUrl(preview.url)
          setFileSize(preview.size)
        } else {
          await preview.release()
        }
      } catch {
        if (!cancelled) {
          setError('无法加载 PDF 文件')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadPdf()

    return () => {
      cancelled = true
      if (releasePreview) void releasePreview()
    }
  }, [filePath])

  useEffect(() => {
    if (externalIngestStatus === 'queued' || externalIngestStatus === 'parsing') setIngestStatus('processing')
    else if (externalIngestStatus === 'parsed') setIngestStatus('completed')
    else if (externalIngestStatus === 'failed') setIngestStatus('failed')
    else setIngestStatus('idle')
  }, [externalIngestStatus])

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 25, 400))
  }

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 25, 50))
  }

  const handleZoomReset = () => {
    setZoom(100)
  }

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360)
  }

  const handleRotateReset = () => {
    setRotation(0)
  }

  const handlePrint = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.print()
    }
  }

  const handleOpenExternal = () => {
    if (onOpenExternal) {
      onOpenExternal()
    } else {
      const fileUrl = `file:///${filePath.replace(/\\/g, '/').replace(/^\//, '')}`
      void window.hermesDesktop?.openExternal?.(fileUrl)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-4 py-2">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-red-500" />
            <span className="text-sm font-medium">{fileName}</span>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center gap-2 text-(--ui-text-quaternary)">
          <Loader2 className="size-5 animate-spin" />
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-4 py-2">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-red-500" />
            <span className="text-sm font-medium">{fileName}</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-(--ui-text-quaternary)">
          <AlertCircle className="size-12 text-red-400" />
          <span className="text-sm">{error}</span>
          <Button onClick={handleOpenExternal} size="sm" variant="secondary">
            <ExternalLink className="size-3.5" />
            尝试用外部程序打开
          </Button>
        </div>
      </div>
    )
  }

  const ingestStatusConfig = {
    idle: { label: '', color: '', icon: null },
    processing: { label: '文档解析中...', color: 'text-blue-400', icon: Loader2 },
    completed: { label: '文档解析完成', color: 'text-green-400', icon: FileSpreadsheet },
    failed: { label: '文档解析失败', color: 'text-red-400', icon: AlertCircle }
  }

  const currentIngestStatus = ingestStatusConfig[ingestStatus]
  const StatusIcon = currentIngestStatus.icon

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-(--ui-editor-surface-background)">
      <div className="flex items-center justify-between border-b border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-3 py-1.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-red-500" />
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-tight">{fileName}</span>
              <span className="text-[11px] text-(--ui-text-quaternary)">{formatFileSize(fileSize)}</span>
            </div>
          </div>

          {ingestResultId && StatusIcon && (
            <div className={`flex items-center gap-1 rounded-full bg-(--ui-surface-tertiary) px-2 py-0.5 ${currentIngestStatus.color}`}>
              <StatusIcon className={`size-3 ${ingestStatus === 'processing' ? 'animate-spin' : ''}`} />
              <span className="text-[11px]">{currentIngestStatus.label}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <div className="mr-1 flex items-center gap-0.5 rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-primary) px-0.5">
            <Button onClick={handleZoomOut} size="icon-xs" title="缩小" variant="ghost">
              <ZoomOut />
            </Button>
            <button
              className="min-w-10 px-1 text-center text-[11px] text-(--ui-text-secondary) hover:text-(--ui-text-primary)"
              onClick={handleZoomReset}
              title="重置缩放"
            >
              {zoom}%
            </button>
            <Button onClick={handleZoomIn} size="icon-xs" title="放大" variant="ghost">
              <ZoomIn />
            </Button>
          </div>

          <div className="mr-1 flex items-center gap-0.5 rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-primary) px-0.5">
            <Button onClick={handleRotate} size="icon-xs" title="顺时针旋转" variant="ghost">
              <RotateCw />
            </Button>
            {rotation !== 0 && (
              <Button onClick={handleRotateReset} size="icon-xs" title="重置旋转" variant="ghost">
                <RotateCcw />
              </Button>
            )}
          </div>

          <Button onClick={handlePrint} size="icon-xs" title="打印" variant="ghost">
            <Printer />
          </Button>

          <Button onClick={handleOpenExternal} size="icon-xs" title="外部打开" variant="ghost">
            <ExternalLink />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-(--ui-surface-tertiary) p-4">
        <div className="flex min-h-full min-w-max items-start justify-center pb-16">
          {dataUrl && (
            <div
              className="bg-white shadow-xl transition-transform duration-150"
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transformOrigin: 'top center',
                marginBottom: rotation !== 0 ? '200px' : '0'
              }}
            >
              <iframe
                ref={iframeRef}
                className="block border-0"
                src={dataUrl}
                style={{
                  width: '816px',
                  height: '1056px'
                }}
                title={fileName}
              />
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-3 py-1">
        <p className="text-center text-[11px] text-(--ui-text-quaternary)">
          提示：可使用 PDF 阅读器内置工具栏进行翻页、文本选择和复制等操作
        </p>
      </div>
    </div>
  )
}
