import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { revealDesktopPath } from '@/lib/desktop-fs'

import type { EditorProps } from './editor-registry'
import { getFileExtension, getFileName } from './editor-registry'

export function BinaryViewer({ filePath }: EditorProps) {
  const ext = getFileExtension(filePath).toUpperCase().slice(1)
  const name = getFileName(filePath)

  const handleReveal = () => {
    void revealDesktopPath(filePath)
  }

  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md space-y-4 text-center p-8">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-(--ui-surface-secondary)">
          <Codicon className="text-3xl text-(--ui-text-quaternary)" name="file-binary" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-medium">{name}</h3>
          <p className="text-sm text-(--ui-text-secondary)">{ext || '二进制'} 文件</p>
        </div>
        <p className="text-xs text-(--ui-text-quaternary)">
          此类型的文件无法在内置编辑器中打开。你可以在系统文件管理器中查看，或使用外部应用程序打开。
        </p>
        <div className="flex justify-center gap-2">
          <Button onClick={handleReveal} size="sm" variant="secondary">
            <Codicon name="folder-opened" size="0.875rem" />
            <span>在文件管理器中显示</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
