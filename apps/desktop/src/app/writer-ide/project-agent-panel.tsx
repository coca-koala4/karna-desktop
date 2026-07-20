import { useCallback, useEffect, useRef, useState } from 'react'
import { Codicon } from '@/components/ui/codicon'
import { useStore } from '@nanostores/react'
import {
  $activeSessionId,
  $sessions,
  setActiveSessionId
} from '@/store/session'
import { useWriterProject, type ProjectSession } from './project-context'

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
  const {
    writerProjectId,
    mainSessionId,
    setMainSessionId,
    projectSessions,
    status: projectStatus,
    projectName,
    createNewSession,
    switchToSession
  } = useWriterProject()
  const sessions = useStore($sessions)
  const activeSessionId = useStore($activeSessionId)
  const boundRef = useRef(false)
  const [sessionPickerOpen, setSessionPickerOpen] = useState(false)
  const [creatingSession, setCreatingSession] = useState(false)

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

  const handleCreateNewSession = useCallback(async () => {
    if (creatingSession) return
    setCreatingSession(true)
    try {
      const newId = await createNewSession()
      if (newId) {
        setActiveSessionId(newId)
        setSessionPickerOpen(false)
      }
    } finally {
      setCreatingSession(false)
    }
  }, [createNewSession, creatingSession])

  const handleSwitchSession = useCallback(async (sessionId: string) => {
    await switchToSession(sessionId)
    setActiveSessionId(sessionId)
    setSessionPickerOpen(false)
  }, [switchToSession])

  const formatTime = (ts: number) => {
    if (!ts) return ''
    const date = new Date(ts * 1000)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    if (isToday) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
  }

  const controllerSessions = projectSessions.filter(s => s.agent_id === 'controller' || !s.agent_id)
  const agentSessions = projectSessions.filter(s => s.agent_id && s.agent_id !== 'controller')

  const hasContext = activeFile || selectedText

  return (
    <div className="flex h-full flex-col bg-(--ui-surface-secondary)">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-(--ui-stroke-secondary) px-3">
        <Codicon name="hubot" size="0.875rem" />
        <span className="text-xs font-medium text-(--ui-text-secondary)">项目 Agent</span>
        <div className="relative ml-auto">
          <button
            onClick={() => setSessionPickerOpen(!sessionPickerOpen)}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-(--ui-text-secondary) hover:bg-(--ui-surface-tertiary) transition-colors"
            title="选择对话"
          >
            {mainSessionId ? (
              <>
                <span className="text-(--ui-color-accent)">已绑定</span>
                <Codicon name="chevron-down" size="0.75rem" />
              </>
            ) : projectStatus === 'ready' ? (
              <>
                <span>新对话</span>
                <Codicon name="chevron-down" size="0.75rem" />
              </>
            ) : null}
          </button>
          {sessionPickerOpen && projectStatus === 'ready' && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setSessionPickerOpen(false)}
              />
              <div className="absolute right-0 top-full z-50 mt-1 w-72 max-h-80 overflow-y-auto rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-primary) shadow-lg">
                <div className="border-b border-(--ui-stroke-secondary) p-2">
                  <button
                    onClick={handleCreateNewSession}
                    disabled={creatingSession}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-(--ui-color-accent) hover:bg-(--ui-surface-tertiary) disabled:opacity-50"
                  >
                    <Codicon name="add" size="0.875rem" />
                    {creatingSession ? '创建中...' : '新建主控对话'}
                  </button>
                </div>
                {controllerSessions.length > 0 && (
                  <div className="p-1">
                    <div className="px-2 py-1 text-[10px] font-medium text-(--ui-text-quaternary)">主控对话</div>
                    {controllerSessions.map((session: ProjectSession) => (
                      <button
                        key={session.id}
                        onClick={() => handleSwitchSession(session.id)}
                        className={`flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left text-xs hover:bg-(--ui-surface-tertiary) ${
                          session.id === mainSessionId ? 'bg-(--ui-color-accent)/10' : ''
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <span className="truncate font-medium text-(--ui-text-primary)">{session.title || '主控对话'}</span>
                          {session.id === mainSessionId && (
                            <Codicon name="check" size="0.75rem" className="shrink-0 text-(--ui-color-accent)" />
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[10px] text-(--ui-text-tertiary)">
                            {session.preview || '暂无消息'}
                          </span>
                          <span className="shrink-0 text-[10px] text-(--ui-text-quaternary)">
                            {formatTime(session.updated)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {agentSessions.length > 0 && (
                  <div className="border-t border-(--ui-stroke-secondary) p-1">
                    <div className="px-2 py-1 text-[10px] font-medium text-(--ui-text-quaternary)">Agent 对话</div>
                    {agentSessions.map((session: ProjectSession) => (
                      <button
                        key={session.id}
                        onClick={() => handleSwitchSession(session.id)}
                        className={`flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left text-xs hover:bg-(--ui-surface-tertiary) ${
                          session.id === mainSessionId ? 'bg-(--ui-color-accent)/10' : ''
                        }`}
                      >
                        <div className="flex items-center gap-1">
                          <Codicon name="person" size="0.75rem" className="shrink-0 text-(--ui-text-secondary)" />
                          <span className="truncate font-medium text-(--ui-text-primary)">
                            {session.agent_name || session.agent_id}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-[10px] text-(--ui-text-tertiary)">
                            {session.preview || '暂无消息'}
                          </span>
                          <span className="shrink-0 text-[10px] text-(--ui-text-quaternary)">
                            {formatTime(session.updated)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {controllerSessions.length === 0 && agentSessions.length === 0 && (
                  <div className="p-4 text-center text-[11px] text-(--ui-text-quaternary)">
                    暂无已有对话
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {hasContext && !mainSessionId && (
        <div className="flex shrink-0 items-center gap-2 border-b border-(--ui-stroke-secondary) bg-(--ui-surface-tertiary) px-3 py-1.5">
          <Codicon name="info" size="0.75rem" className="text-(--ui-color-accent)" />
          <div className="min-w-0 flex-1 text-[10px] text-(--ui-text-tertiary)">
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