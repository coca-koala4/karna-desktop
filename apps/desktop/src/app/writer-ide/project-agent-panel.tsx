import { useCallback, useEffect, useRef } from 'react'
import { Codicon } from '@/components/ui/codicon'
import { useStore } from '@nanostores/react'
import {
  $activeSessionId,
  $sessions
} from '@/store/session'
import { useWriterProject } from './project-context'

interface ProjectAgentPanelProps {
  activeFile: string | null
  selectedText?: string
  chatView: React.ReactNode | null
}

export function ProjectAgentPanel({
  activeFile,
  selectedText,
  chatView
}: ProjectAgentPanelProps) {
  const { writerProjectId, mainSessionId, setMainSessionId, status: projectStatus } = useWriterProject()
  const sessions = useStore($sessions)
  const activeSessionId = useStore($activeSessionId)
  const boundRef = useRef(false)

  useEffect(() => {
    if (projectStatus !== 'ready' || !writerProjectId || !activeSessionId || boundRef.current) {
      return
    }

    if (mainSessionId === activeSessionId) {
      boundRef.current = true
      return
    }

    const newSession = sessions.find(s => s.id === activeSessionId || s._lineage_root_id === activeSessionId)
    if (newSession && (newSession.writer_project_id === writerProjectId || newSession.project_id === writerProjectId)) {
      if (!mainSessionId) {
        boundRef.current = true
        void setMainSessionId(activeSessionId)
      }
    }
  }, [activeSessionId, sessions, writerProjectId, mainSessionId, projectStatus, setMainSessionId])

  useEffect(() => {
    boundRef.current = false
  }, [writerProjectId])

  const hasContext = activeFile || selectedText

  return (
    <div className="flex h-full flex-col bg-(--ui-surface-secondary)">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-(--ui-stroke-secondary) px-3">
        <Codicon name="hubot" size="0.875rem" />
        <span className="text-xs font-medium text-(--ui-text-secondary)">项目 Agent</span>
        {mainSessionId && (
          <span className="ml-auto rounded-full bg-(--ui-color-accent)/10 px-2 py-0.5 text-[10px] text-(--ui-color-accent)">
            已绑定
          </span>
        )}
        {!mainSessionId && projectStatus === 'ready' && (
          <span className="ml-auto rounded-full bg-(--ui-surface-tertiary) px-2 py-0.5 text-[10px] text-(--ui-text-secondary)">
            新对话
          </span>
        )}
      </div>

      {hasContext && !mainSessionId && (
        <div className="flex shrink-0 items-center gap-2 border-b border-(--ui-stroke-secondary) bg-(--ui-surface-tertiary) px-3 py-1.5">
          <Codicon name="info" size="0.75rem" className="text-(--ui-color-accent)" />
          <div className="min-w-0 flex-1 text-[10px] text-(--ui-text-tertiary">
            {activeFile && (
              <div className="truncate">
                <span className="text-(--ui-text-secondary)">文档：</span>
                {activeFile.split(/[/\\]/).pop()}
              </div>
            )}
            {selectedText && (
              <div className="truncate">
                <span className="text-(--ui-text-secondary)">选区：</span>
                {selectedText.slice(0, 30)}{selectedText.length > 30 ? '...' : ''}
                <span className="text-(--ui-text-quaternary)"> ({selectedText.length} 字)</span>
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
