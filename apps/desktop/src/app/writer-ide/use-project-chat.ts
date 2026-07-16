import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '@nanostores/react'
import {
  $activeSessionId,
  $sessions,
  setActiveWriterProject
} from '@/store/session'
import { forceDraftConversationScope, lockScope, unlockScope } from '@/store/conversation-scope'
import { useWriterProject } from './project-context'

export type ProjectChatBindingState =
  | 'resolving'
  | 'bound'
  | 'new'
  | 'missing'
  | 'error'

export interface ProjectChatBinding {
  state: ProjectChatBindingState
  sessionId: string | null
  message: string | null
}

export interface UseProjectChatResult {
  binding: ProjectChatBinding
  createAndBindSession: (initialMessage?: string) => Promise<string | null>
  rebindSession: (sessionId: string) => Promise<boolean>
  unbindSession: () => Promise<void>
  retryResolve: () => Promise<void>
}

export function useProjectChat(): UseProjectChatResult {
  const { writerProjectId, workspaceId, rootPath, projectName, mainSessionId, setMainSessionId, status: projectStatus } = useWriterProject()

  const sessions = useStore($sessions)
  const activeSessionId = useStore($activeSessionId)

  const [binding, setBinding] = useState<ProjectChatBinding>({
    state: 'resolving',
    sessionId: null,
    message: null
  })

  const generationRef = useRef(0)

  const resolveBinding = useCallback(async () => {
    const generation = ++generationRef.current

    if (projectStatus !== 'ready') {
      setBinding({ state: 'resolving', sessionId: null, message: null })
      return
    }

    if (!writerProjectId) {
      setBinding({ state: 'error', sessionId: null, message: '项目ID无效' })
      return
    }

    if (!mainSessionId) {
      setBinding({ state: 'new', sessionId: null, message: null })
      return
    }

    const sessionExists = sessions.some(s => s.id === mainSessionId || s._lineage_root_id === mainSessionId)

    if (sessionExists) {
      setBinding({ state: 'bound', sessionId: mainSessionId, message: null })
    } else {
      setBinding({ state: 'missing', sessionId: mainSessionId, message: '绑定的对话不存在，可能已被删除' })
    }
  }, [projectStatus, writerProjectId, mainSessionId, sessions])

  useEffect(() => {
    void resolveBinding()
  }, [resolveBinding])

  useEffect(() => {
    if (binding.state === 'bound' && binding.sessionId) {
      setActiveWriterProject({
        id: writerProjectId,
        title: projectName,
        folder: rootPath
      })
    } else if (binding.state === 'new') {
      setActiveWriterProject(null)
    }

    return () => {
      setActiveWriterProject(null)
    }
  }, [binding.state, binding.sessionId, writerProjectId, projectName, rootPath])

  useEffect(() => {
    if (projectStatus !== 'ready' || !writerProjectId || !rootPath) {
      return
    }

    forceDraftConversationScope({
      type: 'project',
      workspaceId,
      writerProjectId,
      projectName,
      cwd: rootPath
    })
    lockScope()

    return () => {
      unlockScope()
    }
  }, [projectStatus, writerProjectId, workspaceId, projectName, rootPath])

  const createAndBindSession = useCallback(async (initialMessage?: string): Promise<string | null> => {
    if (!writerProjectId || !workspaceId) {
      return null
    }

    const generation = ++generationRef.current
    setBinding(prev => ({ ...prev, state: 'resolving', message: null }))

    try {
      const result = await window.karnaDesktop.api<any>({
        method: 'POST',
        path: `/api/writer/projects/${writerProjectId}/sessions`,
        body: {
          setPrimary: true,
          workspaceId,
          initialMessage
        }
      })

      if (generation !== generationRef.current) {
        return null
      }

      if (!result?.ok || !result?.sessionId) {
        setBinding({ state: 'error', sessionId: null, message: result?.error || '创建会话失败' })
        return null
      }

      const sessionId = result.sessionId
      await setMainSessionId(sessionId)
      setBinding({ state: 'bound', sessionId, message: null })
      return sessionId
    } catch (err: any) {
      if (generation !== generationRef.current) {
        return null
      }
      setBinding({ state: 'error', sessionId: null, message: err?.message || '创建会话失败' })
      return null
    }
  }, [writerProjectId, workspaceId, setMainSessionId])

  const rebindSession = useCallback(async (sessionId: string): Promise<boolean> => {
    if (!writerProjectId) {
      return false
    }

    const generation = ++generationRef.current

    try {
      const result = await window.karnaDesktop.api<any>({
        method: 'POST',
        path: `/api/writer/projects/${writerProjectId}/main-session`,
        body: { sessionId }
      })

      if (generation !== generationRef.current) {
        return false
      }

      if (!result?.ok) {
        if (result?.code === 'CONFLICT') {
          setBinding({ state: 'error', sessionId: null, message: '该对话属于其他项目，无法绑定' })
        } else {
          setBinding({ state: 'error', sessionId: null, message: result?.error || '绑定失败' })
        }
        return false
      }

      await setMainSessionId(sessionId)
      setBinding({ state: 'bound', sessionId, message: null })
      return true
    } catch (err: any) {
      if (generation !== generationRef.current) {
        return false
      }
      setBinding({ state: 'error', sessionId: null, message: err?.message || '绑定失败' })
      return false
    }
  }, [writerProjectId, setMainSessionId])

  const unbindSession = useCallback(async (): Promise<void> => {
    if (!writerProjectId) {
      return
    }

    const generation = ++generationRef.current

    try {
      await window.karnaDesktop.api<any>({
        method: 'DELETE',
        path: `/api/writer/projects/${writerProjectId}/main-session`
      })

      if (generation !== generationRef.current) {
        return
      }

      setBinding({ state: 'new', sessionId: null, message: null })
    } catch {
      // ignore unbind errors
    }
  }, [writerProjectId])

  const retryResolve = useCallback(async (): Promise<void> => {
    const generation = ++generationRef.current
    setBinding({ state: 'resolving', sessionId: null, message: null })

    await resolveBinding()

    if (generation !== generationRef.current) {
      return
    }
  }, [resolveBinding])

  return {
    binding,
    createAndBindSession,
    rebindSession,
    unbindSession,
    retryResolve
  }
}
