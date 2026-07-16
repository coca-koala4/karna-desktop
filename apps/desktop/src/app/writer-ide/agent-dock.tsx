import type React from 'react'

import { Codicon } from '@/components/ui/codicon'
import { getFileName } from './editors/editor-registry'

interface AgentDockProps {
  workspaceId: string
  projectName: string
  activeFile: string | null
  activeFileContent?: string
  rootPath: string | null
  selectedText?: string
  selectionRange?: { from: number; to: number }
  onClose?: () => void
  chatView?: React.ReactNode
}

export function AgentDock({
  workspaceId: _workspaceId,
  projectName,
  activeFile,
  activeFileContent: _activeFileContent,
  rootPath: _rootPath,
  selectedText,
  selectionRange: _selectionRange,
  onClose,
  chatView
}: AgentDockProps) {
  const hasContext = activeFile || selectedText

  return (
    <div className="flex h-full flex-col bg-(--ui-surface-secondary)">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-(--ui-stroke-secondary) px-3">
        <Codicon name="hubot" size="0.875rem" />
        <span className="text-xs font-medium text-(--ui-text-secondary)">项目 Agent</span>
        {onClose && (
          <button
            className="ml-auto rounded p-1 text-(--ui-text-quaternary) hover:bg-(--ui-control-hover-background) hover:text-foreground"
            onClick={onClose}
            title="隐藏面板"
            type="button"
          >
            <Codicon name="close" size="0.75rem" />
          </button>
        )}
      </div>

      {hasContext && (
        <div className="flex shrink-0 items-center gap-2 border-b border-(--ui-stroke-secondary) bg-(--ui-surface-tertiary) px-3 py-1.5">
          <Codicon name="info" size="0.75rem" className="text-(--ui-color-accent)" />
          <div className="min-w-0 flex-1 text-[10px] text-(--ui-text-tertiary)">
            {activeFile && (
              <div className="truncate">
                <span className="text-(--ui-text-secondary)">文档：</span>
                {getFileName(activeFile)}
              </div>
            )}
            {selectedText && (
              <div className="truncate">
                <span className="text-(--ui-text-secondary)">选区：</span>
                {selectedText.slice(0, 30)}{selectedText.length > 30 ? '...' : ''}
                <span className="text-(--ui-text-quaternary)">({selectedText.length} 字)</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden">
        {chatView}
      </div>
    </div>
  )
}
