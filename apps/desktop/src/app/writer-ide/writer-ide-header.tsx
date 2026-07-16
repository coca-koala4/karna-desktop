import { useRef, useState, useEffect } from 'react'
import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'
import { revealDesktopPath } from '@/lib/desktop-fs'
import { DOC_TYPE_LABELS, type DocumentObjectType } from '@/lib/writer-catalog/types'

interface WriterIDEHeaderProps {
  projectName: string
  rootPath: string | null
  documentType?: DocumentObjectType | null
  activeFileName?: string | null
  activeFilePath?: string | null
  fileDirty?: boolean
  fileState?: 'clean' | 'dirty' | 'saving' | 'conflict' | 'error'
  rightPanelVisible: boolean
  rightPanelTab: 'agent' | 'writer-os'
  onToggleRightPanel: () => void
  onToggleRightPanelTab: (tab: 'agent' | 'writer-os') => void
  onToggleFilePanel?: () => void
  filePanelVisible?: boolean
  onSwapPanels?: () => void
  panelsSwapped?: boolean
  onBack?: () => void
  onSave?: () => void
  onOpenMoreMenu?: () => void
}

export function WriterIDEHeader({
  projectName,
  rootPath,
  documentType,
  activeFileName,
  activeFilePath,
  fileDirty = false,
  fileState = 'clean',
  rightPanelVisible,
  rightPanelTab,
  onToggleRightPanel,
  onToggleRightPanelTab,
  onToggleFilePanel,
  filePanelVisible = true,
  onSwapPanels,
  panelsSwapped = false,
  onBack,
  onSave,
  onOpenMoreMenu
}: WriterIDEHeaderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [showDocType, setShowDocType] = useState(true)
  const [showFilePath, setShowFilePath] = useState(true)
  const [showSaveButton, setShowSaveButton] = useState(true)

  const handleRevealInFolder = () => {
    if (rootPath) {
      void revealDesktopPath(rootPath)
    }
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const checkOverflow = () => {
      const leftSection = container.querySelector('[data-section="left"]')
      const rightSection = container.querySelector('[data-section="right"]')
      const middleSection = container.querySelector('[data-section="middle"]')

      if (!leftSection || !rightSection || !middleSection) return

      const leftWidth = leftSection.getBoundingClientRect().width
      const rightWidth = rightSection.getBoundingClientRect().width
      const containerWidth = container.getBoundingClientRect().width
      const middleAvailable = containerWidth - leftWidth - rightWidth - 32

      if (middleAvailable < 80) {
        setShowFilePath(false)
        setShowDocType(false)
        setShowSaveButton(false)
      } else if (middleAvailable < 150) {
        setShowFilePath(false)
        setShowDocType(false)
        setShowSaveButton(true)
      } else if (middleAvailable < 250) {
        setShowFilePath(false)
        setShowDocType(true)
        setShowSaveButton(true)
      } else {
        setShowFilePath(true)
        setShowDocType(true)
        setShowSaveButton(true)
      }
    }

    checkOverflow()
    const observer = new ResizeObserver(checkOverflow)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      className="grid h-10 shrink-0 items-center gap-2 border-b border-(--ui-stroke-secondary) bg-(--ui-surface)"
      style={{ gridTemplateColumns: 'minmax(0, auto) minmax(2rem, 1fr) auto' }}
    >
      <div data-section="left" className="flex min-w-0 max-w-[42vw] items-center gap-2 overflow-hidden [-webkit-app-region:no-drag]">
        {onBack && (
          <button
            className="ml-[calc(var(--titlebar-controls-left)+0.5rem)] flex shrink-0 items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
            onClick={onBack}
            title="返回当前项目对话"
            type="button"
          >
            <Codicon name="home" size="0.8rem" />
            <span>返回主页</span>
          </button>
        )}
        <div className="flex min-w-0 items-center gap-1.5">
          <Codicon className="text-(--ui-text-secondary)" name="root-folder" size="0.875rem" />
          <span
            className="min-w-0 truncate text-sm font-medium"
            title={projectName}
          >
            {projectName}
          </span>
        </div>
      </div>

      <div data-section="middle" className="flex min-w-0 items-center gap-2 overflow-hidden">
        {showDocType && documentType && (
          <>
            <div className="h-4 w-px shrink-0 bg-(--ui-stroke-secondary)" />
            <span
              className="inline-flex shrink-0 items-center gap-1 rounded-full border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-2 py-0.5 text-[10px] text-(--ui-text-secondary)"
              title={DOC_TYPE_LABELS[documentType] || documentType}
            >
              <Codicon name="tag" size="0.625rem" />
              {DOC_TYPE_LABELS[documentType] || documentType}
            </span>
          </>
        )}

        {showFilePath && activeFileName && (
          <>
            <div className="h-4 w-px shrink-0 bg-(--ui-stroke-secondary)" />
            <div className="flex min-w-0 items-center gap-1">
              {fileDirty && (
                <Codicon
                  className="shrink-0 text-(--ui-color-accent)"
                  name="circle-filled"
                  size="0.5rem"
                />
              )}
              <span
                className="truncate text-xs text-(--ui-text-secondary)"
                title={activeFilePath || activeFileName}
              >
                {activeFileName}
              </span>
              {fileState === 'saving' && (
                <span className="shrink-0 text-[10px] text-(--ui-text-tertiary)">保存中...</span>
              )}
            </div>
          </>
        )}
      </div>

      <div data-section="right" className="pointer-events-auto relative z-20 flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
        {showSaveButton && fileDirty && (
          <button
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
              'text-(--ui-color-accent) hover:bg-(--ui-color-accent)/10'
            )}
            onClick={onSave}
            title="保存 (Ctrl+S)"
            type="button"
          >
            <Codicon name="save" size="0.7rem" />
            <span>保存</span>
          </button>
        )}

        <button
          className={cn(
            'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
            filePanelVisible
              ? 'bg-(--ui-control-active-background) text-foreground'
              : 'text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
          )}
          onClick={onToggleFilePanel}
          title={filePanelVisible ? '隐藏文件面板' : '显示文件面板'}
          type="button"
        >
          <Codicon name="files" size="0.7rem" />
        </button>

        {onSwapPanels && (
          <button
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
              panelsSwapped
                ? 'bg-(--ui-control-active-background) text-foreground'
                : 'text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
            )}
            onClick={onSwapPanels}
            title="交换文件树和智能体面板位置"
            type="button"
          >
            <Codicon name="arrow-swap" size="0.7rem" />
          </button>
        )}

        <div className="flex items-center overflow-hidden rounded border border-(--ui-stroke-secondary)">
          <button
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-[11px] transition-colors',
              rightPanelVisible && rightPanelTab === 'agent'
                ? 'bg-(--ui-control-active-background) text-foreground'
                : 'text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
            )}
            onClick={() => {
              if (rightPanelVisible && rightPanelTab === 'agent') onToggleRightPanel()
              else {
                onToggleRightPanelTab('agent')
                if (!rightPanelVisible) onToggleRightPanel()
              }
            }}
            title="Agent 面板"
            type="button"
          >
            <Codicon name="hubot" size="0.7rem" />
          </button>
          <div className="h-4 w-px bg-(--ui-stroke-secondary)" />
          <button
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-[11px] transition-colors',
              rightPanelVisible && rightPanelTab === 'writer-os'
                ? 'bg-(--ui-control-active-background) text-foreground'
                : 'text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
            )}
            onClick={() => {
              if (rightPanelVisible && rightPanelTab === 'writer-os') onToggleRightPanel()
              else {
                onToggleRightPanelTab('writer-os')
                if (!rightPanelVisible) onToggleRightPanel()
              }
            }}
            title="Writer OS 面板"
            type="button"
          >
            <Codicon name="symbol-misc" size="0.7rem" />
          </button>
        </div>

        <div className="h-4 w-px bg-(--ui-stroke-secondary) mx-1" />

        <button
          className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
          onClick={handleRevealInFolder}
          title="在文件管理器中显示"
          type="button"
        >
          <Codicon name="folder-opened" size="0.7rem" />
        </button>

        {onOpenMoreMenu && (
          <button
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
            onClick={onOpenMoreMenu}
            title="更多"
            type="button"
          >
            <Codicon name="more" size="0.7rem" />
          </button>
        )}
      </div>
    </div>
  )
}
