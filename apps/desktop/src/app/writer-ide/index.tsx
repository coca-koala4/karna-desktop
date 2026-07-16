import type React from 'react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { NEW_CHAT_ROUTE, sessionRoute } from '@/app/routes'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  setCurrentCwd,
  setActiveSessionId,
  setSelectedStoredSessionId,
  setMessages,
  setBusy,
  setAwaitingResponse,
  setFreshDraftReady
} from '@/store/session'
import { forceDraftConversationScope, lockScope, unlockScope, resetDraftScope } from '@/store/conversation-scope'

import { useWriterProject, WriterProjectProvider } from './project-context'

const WriterIDEView = lazy(async () => {
  const module = await import('./writer-ide-view')

  return { default: module.WriterIDEView }
})

type IdeState = 'idle' | 'resolving' | 'binding' | 'ready' | 'error' | 'not_found' | 'leaving'

function WriterIDEContent({ workspaceId, chatView }: { workspaceId: string; chatView?: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const projectCtx = useWriterProject()
  const [ideState, setIdeState] = useState<IdeState>('idle')
  const [sessionError, setSessionError] = useState<string | null>(null)
  const generationRef = useRef(0)
  const prevCwdRef = useRef<string | null>(null)
  const hasUnsavedChangesRef = useRef(false)

  const setHasUnsavedChanges = useCallback((value: boolean) => {
    hasUnsavedChangesRef.current = value
  }, [])

  useEffect(() => {
    const generation = ++generationRef.current

    if (projectCtx.status === 'resolving' || projectCtx.status === 'idle') {
      setIdeState('resolving')
      setSessionError(null)
      return
    }

    if (projectCtx.status === 'not_found') {
      setIdeState('not_found')
      return
    }

    if (projectCtx.status === 'error') {
      setIdeState('error')
      setSessionError(projectCtx.error)
      return
    }

    if (projectCtx.status === 'ready') {
      setIdeState('binding')
      setSessionError(null)

      if (prevCwdRef.current === null) {
        prevCwdRef.current = ''
      }

      try {
        if (projectCtx.rootPath) {
          setCurrentCwd(projectCtx.rootPath)
        }
      } catch {
        // ignore cwd errors
      }

      setActiveSessionId(null)
      setSelectedStoredSessionId(null)
      setMessages([])
      setBusy(false)
      setAwaitingResponse(false)
      setFreshDraftReady(true)

      if (projectCtx.rootPath && projectCtx.writerProjectId) {
        forceDraftConversationScope({
          type: 'project',
          workspaceId,
          writerProjectId: projectCtx.writerProjectId,
          projectName: projectCtx.projectName,
          cwd: projectCtx.rootPath
        })
        lockScope()
      }

      if (projectCtx.mainSessionId) {
        const targetSessionId = projectCtx.mainSessionId
        void (async () => {
          try {
            const [sessionResult, messagesResult] = await Promise.all([
              window.karnaDesktop.api<any>({
                method: 'GET',
                path: `/api/sessions/${encodeURIComponent(targetSessionId)}`
              }),
              window.karnaDesktop.api<any>({
                method: 'GET',
                path: `/api/sessions/${encodeURIComponent(targetSessionId)}/messages`
              })
            ])

            if (generation !== generationRef.current) return

            const sessionInfo = sessionResult?.ok === false ? null : (sessionResult?.session || sessionResult)
            const sessionArchived = Boolean(sessionInfo?.archived || sessionInfo?.is_archived || sessionInfo?.status === 'archived')
            const sessionExists = Boolean(sessionInfo && (sessionInfo.id === targetSessionId || sessionInfo.session_id === targetSessionId))
            if (sessionExists && messagesResult?.ok !== false && !sessionArchived) {
              setSelectedStoredSessionId(targetSessionId)
              setMessages(Array.isArray(messagesResult.messages) ? messagesResult.messages : [])
              setFreshDraftReady(false)
            } else {
              await projectCtx.clearMainSessionId().catch(() => undefined)
              setSelectedStoredSessionId(null)
              setActiveSessionId(null)
              setMessages([])
              setFreshDraftReady(true)
            }
          } catch {
            // Bound session no longer exists (deleted/archived/tombstoned). Clear the
            // project pointer so a fresh IDE chat cannot revive the stale thread.
            if (generation === generationRef.current) {
              await projectCtx.clearMainSessionId?.().catch(() => undefined)
              setSelectedStoredSessionId(null)
              setActiveSessionId(null)
              setMessages([])
              setFreshDraftReady(true)
            }
          }
        })()
      }

      setIdeState('ready')
      return
    }

    return () => {
      if (generation === generationRef.current) {
        unlockScope()
      }
    }
  }, [projectCtx.status, projectCtx.rootPath, projectCtx.writerProjectId, projectCtx.projectName, workspaceId])

  useEffect(() => {
    return () => {
      generationRef.current++
      setIdeState('leaving')
      unlockScope()
      resetDraftScope()
    }
  }, [])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  const projectDraftRoute = useCallback(() => {
    const params = new URLSearchParams({ scope: 'project', workspace_id: workspaceId })
    return `${NEW_CHAT_ROUTE}?${params.toString()}`
  }, [workspaceId])

  const handleBackToAgentMode = useCallback(async () => {
    if (hasUnsavedChangesRef.current) {
      if (!window.confirm('有未保存的更改，确定要离开吗？')) {
        return
      }
    }

    const sessionId = projectCtx.mainSessionId
    if (sessionId) {
      try {
        const result = await window.karnaDesktop.api<any>({
          method: 'GET',
          path: `/api/sessions/${encodeURIComponent(sessionId)}`
        })
        const session = result?.ok === false ? null : (result?.session || result)
        const archived = Boolean(session?.archived || session?.is_archived || session?.status === 'archived')
        const sessionExists = Boolean(session && (session.id === sessionId || session.session_id === sessionId))
        if (sessionExists && !archived) {
          navigate(sessionRoute(sessionId))
          return
        }
      } catch {
        // The project pointer is stale; clear it before returning to a fresh,
        // project-scoped composer so a deleted conversation cannot reappear.
      }
      await projectCtx.clearMainSessionId().catch(() => undefined)
    }

    navigate(projectDraftRoute())
  }, [navigate, projectCtx, projectDraftRoute])

  const handleGoToChat = useCallback(() => {
    navigate(NEW_CHAT_ROUTE)
  }, [navigate])

  const handleRetry = useCallback(() => {
    void projectCtx.reload()
  }, [projectCtx])

  if (ideState === 'resolving' || ideState === 'binding') {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-(--ui-text-secondary)">
          <Codicon className="animate-spin text-2xl" name="loading" />
          <span className="text-sm">{ideState === 'resolving' ? '加载项目中...' : '初始化工作区...'}</span>
        </div>
      </div>
    )
  }

  if (ideState === 'not_found') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <Codicon className="text-4xl text-(--ui-text-quaternary)" name="search-stop" />
        <div className="text-center">
          <h2 className="text-lg font-medium mb-2">项目未找到</h2>
          <p className="text-sm text-(--ui-text-tertiary) max-w-md">
            找不到工作区 "{workspaceId}" 对应的写作项目。该项目可能已被删除或移动。
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleBackToAgentMode} variant="outline">
            返回主页
          </Button>
          <Button onClick={handleRetry} variant="secondary">
            <Codicon name="refresh" size="0.875rem" />
            重试
          </Button>
        </div>
      </div>
    )
  }

  if (ideState === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <Codicon className="text-4xl text-destructive" name="error" />
        <div className="text-center">
          <h2 className="text-lg font-medium mb-2">加载项目失败</h2>
          <p className="text-sm text-(--ui-text-tertiary) max-w-md">
            {sessionError || '发生未知错误'}
          </p>
        </div>
        <div className="flex gap-3">
          <Button onClick={handleRetry} variant="default">
            <Codicon name="refresh" size="0.875rem" />
            重试
          </Button>
          <Button onClick={handleGoToChat} variant="secondary">
            返回聊天
          </Button>
        </div>
      </div>
    )
  }

  if (ideState !== 'ready' || !projectCtx.rootPath) {
    return null
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center">
          <div className="flex items-center gap-2 text-(--ui-text-secondary)">
            <Codicon className="animate-spin" name="loading" />
            <span>加载中...</span>
          </div>
        </div>
      }
    >
      <WriterIDEView
        chatView={chatView}
        onBack={handleBackToAgentMode}
        onHasUnsavedChangesChange={setHasUnsavedChanges}
        projectName={projectCtx.projectName}
        rootPath={projectCtx.rootPath}
        workspaceId={workspaceId}
      />
    </Suspense>
  )
}

export function WriterIDEShell({ workspaceId, chatView }: { workspaceId: string; chatView?: React.ReactNode }) {
  const navigate = useNavigate()

  if (!workspaceId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
        <Codicon className="text-4xl text-(--ui-text-quaternary)" name="error" />
        <h2 className="text-lg font-medium">未指定工作区</h2>
        <Button onClick={() => navigate(NEW_CHAT_ROUTE)} variant="secondary">
          返回聊天
        </Button>
      </div>
    )
  }

  return (
    <WriterProjectProvider workspaceId={workspaceId}>
      <WriterIDEContent workspaceId={workspaceId} chatView={chatView} />
    </WriterProjectProvider>
  )
}
