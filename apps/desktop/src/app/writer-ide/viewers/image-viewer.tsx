import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCw,
  RotateCcw,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { createWriterPreviewBlob } from '@/lib/writer-preview'

interface ImageViewerProps {
  filePath: string
  onOpenExternal?: () => void
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

export function ImageViewer({ filePath, onOpenExternal }: ImageViewerProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [zoom, setZoom] = useState(100)
  const [rotation, setRotation] = useState(0)
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 })
  const [fileSize, setFileSize] = useState<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const fileName = getFileName(filePath)

  useEffect(() => {
    let cancelled = false
    let releasePreview: (() => Promise<void>) | undefined

    async function loadImage() {
      setLoading(true)
      setError(null)
      setZoom(100)
      setRotation(0)

      try {
        const ext = filePath.split('.').pop()?.toLowerCase()
        const mimeByExtension: Record<string, string> = {
          svg: 'image/svg+xml',
          png: 'image/png',
          gif: 'image/gif',
          webp: 'image/webp',
          bmp: 'image/bmp',
          ico: 'image/x-icon',
          jpg: 'image/jpeg',
          jpeg: 'image/jpeg'
        }
        const mime = mimeByExtension[ext || ''] || 'application/octet-stream'
        const preview = await createWriterPreviewBlob(filePath, mime)
        releasePreview = preview.release

        if (!cancelled) {
          setDataUrl(preview.url)
          setFileSize(preview.size)
        } else {
          await preview.release()
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '无法加载图片')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadImage()

    return () => {
      cancelled = true
      if (releasePreview) void releasePreview()
    }
  }, [filePath])

  const handleImageLoad = useCallback(() => {
    if (imgRef.current) {
      setImageDimensions({
        width: imgRef.current.naturalWidth,
        height: imgRef.current.naturalHeight,
      })
    }
  }, [])

  const handleZoomIn = () => {
    setZoom((z) => Math.min(z + 25, 400))
  }

  const handleZoomOut = () => {
    setZoom((z) => Math.max(z - 25, 25))
  }

  const handleZoomReset = () => {
    setZoom(100)
    setRotation(0)
  }

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360)
  }

  const handleRotateReset = () => {
    setRotation(0)
  }

  const handleOpenExternal = () => {
    if (onOpenExternal) {
      onOpenExternal()
      return
    }
    const normalized = filePath.replace(/\\/g, '/')
    const fileUrl = `file:///${normalized.replace(/^\//, '')}`
    void window.hermesDesktop?.openExternal?.(fileUrl)
  }

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? -10 : 10
      setZoom((z) => Math.min(Math.max(z + delta, 25), 400))
    }
  }, [])

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-4 py-2">
          <div className="flex items-center gap-2">
            <ImageIcon className="size-4 text-(--ui-text-secondary)" />
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
            <ImageIcon className="size-4 text-(--ui-text-secondary)" />
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

  return (
    <div className="flex h-full flex-col bg-(--ui-editor-surface-background)">
      <div className="flex items-center justify-between border-b border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-3 py-1.5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="size-4 text-(--ui-text-secondary)" />
            <div className="flex flex-col">
              <span className="text-sm font-medium leading-tight">{fileName}</span>
              <span className="text-[11px] text-(--ui-text-quaternary)">
                {imageDimensions.width > 0 && `${imageDimensions.width} × ${imageDimensions.height} | `}
                {formatFileSize(fileSize)}
              </span>
            </div>
          </div>
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

          <Button onClick={handleZoomReset} size="icon-xs" title="适应窗口" variant="ghost">
            <Maximize2 />
          </Button>

          <Button onClick={handleOpenExternal} size="icon-xs" title="外部打开" variant="ghost">
            <ExternalLink />
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-(--ui-surface-tertiary) p-4"
        onWheel={handleWheel}
      >
        <div className="flex min-h-full items-start justify-center">
          {dataUrl && (
            <img
              ref={imgRef}
              alt={fileName}
              className="max-w-full object-contain shadow-xl transition-transform duration-150"
              src={dataUrl}
              style={{
                transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                transformOrigin: 'top center',
                marginBottom: rotation !== 0 ? '200px' : '0',
              }}
              onLoad={handleImageLoad}
            />
          )}
        </div>
      </div>
    </div>
  )
}
