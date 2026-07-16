import { useEffect, useState } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { readDesktopFileDataUrl } from '@/lib/desktop-fs'

import type { EditorProps } from './editor-registry'
import { getFileName } from './editor-registry'

export function ImageViewer({ filePath }: EditorProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadImage() {
      setLoading(true)
      setError(null)

      try {
        const url = await readDesktopFileDataUrl(filePath)

        if (!cancelled) {
          setDataUrl(url)
        }
      } catch {
        if (!cancelled) {
          setError('无法加载图片')
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
    }
  }, [filePath])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-(--ui-text-quaternary)">
        <Codicon className="animate-spin" name="loading" size="1rem" />
        <span className="text-sm">加载中...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-(--ui-text-quaternary)">
        <Codicon className="text-4xl" name="error" />
        <span className="text-sm">{error}</span>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center overflow-auto bg-(--ui-editor-surface-background) p-8">
      {dataUrl && (
        <div className="flex flex-col items-center gap-3">
          <img
            alt={getFileName(filePath)}
            className="max-h-full max-w-full rounded-lg object-contain shadow-lg"
            src={dataUrl}
          />
          <span className="text-xs text-(--ui-text-quaternary)">{getFileName(filePath)}</span>
        </div>
      )}
    </div>
  )
}
