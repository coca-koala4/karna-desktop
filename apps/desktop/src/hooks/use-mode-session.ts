import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '@nanostores/react'
import { modeApi } from '@/lib/mode-api'
import {
  $activeModeSession,
  $activeModeEvents,
  $modeEventSequence,
  $modeLoading,
  $modeError,
  setActiveModeSession,
  updateModeSession,
  appendModeEvents,
  clearModeState,
  isModeActive
} from '@/store/mode'
import type { AgentModeId, AgentModeSession, CreateModeSessionRequest } from '@/types/mode'

export function useModeSession(conversationId?: string | null, workspaceId?: string, projectId?: string) {
  const activeSession = useStore($activeModeSession)
  const events = useStore($activeModeEvents)
  const eventSequence = useStore($modeEventSequence)
  const loading = useStore($modeLoading)
  const error = useStore($modeError)
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentSession = 'id' in activeSession ? activeSession : null
  const mode = currentSession?.mode || ('direct' as AgentModeId)

  const loadActiveSession = useCallback(async () => {
    if (!conversationId) {
      clearModeState()
      return
    }
    try {
      $modeLoading.set(true)
      $modeError.set(null)
      const session = await modeApi.getActiveForConversation(conversationId)
      if (session) {
        setActiveModeSession(session)
      } else {
        clearModeState()
      }
    } catch (err) {
      $modeError.set(err instanceof Error ? err.message : String(err))
    } finally {
      $modeLoading.set(false)
    }
  }, [conversationId])

  const createSession = useCallback(async (mode: AgentModeId, options: Partial<CreateModeSessionRequest> = {}) => {
    if (!conversationId) return null
    try {
      $modeLoading.set(true)
      $modeError.set(null)
      const request: CreateModeSessionRequest = {
        mode,
        workspaceId: workspaceId || 'default',
        conversationId,
        projectId: projectId || undefined,
        initialContract: options.initialContract,
        resourceSelection: options.resourceSelection || {
          soulIds: [],
          skillIds: [],
          mcpServerIds: [],
          connectorInstanceIds: [],
          knowledgeSourceIds: [],
          attachmentResultIds: [],
          projectDocumentIds: []
        }
      }
      const session = await modeApi.create(request)
      setActiveModeSession(session)
      return session
    } catch (err) {
      $modeError.set(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      $modeLoading.set(false)
    }
  }, [conversationId, workspaceId, projectId])

  const startMode = useCallback(async () => {
    if (!currentSession) return null
    try {
      $modeLoading.set(true)
      const result = await modeApi.startRunning(currentSession.id, {
        expectedVersion: currentSession.stateVersion
      })
      if (result.ok && result.session) {
        updateModeSession(result.session)
        return result.session
      }
      return null
    } catch (err) {
      $modeError.set(err instanceof Error ? err.message : String(err))
      return null
    } finally {
      $modeLoading.set(false)
    }
  }, [currentSession])

  const pauseMode = useCallback(async (reason = '') => {
    if (!currentSession) return null
    try {
      const result = await modeApi.pause(currentSession.id, {
        expectedVersion: currentSession.stateVersion,
        reason
      })
      if (result.ok && result.session) {
        updateModeSession(result.session)
        return result.session
      }
      return null
    } catch (err) {
      $modeError.set(err instanceof Error ? err.message : String(err))
      return null
    }
  }, [currentSession])

  const resumeMode = useCallback(async () => {
    if (!currentSession) return null
    try {
      const result = await modeApi.resume(currentSession.id, {
        expectedVersion: currentSession.stateVersion
      })
      if (result.ok && result.session) {
        updateModeSession(result.session)
        return result.session
      }
      return null
    } catch (err) {
      $modeError.set(err instanceof Error ? err.message : String(err))
      return null
    }
  }, [currentSession])

  const cancelMode = useCallback(async (reason = '') => {
    if (!currentSession) return null
    try {
      const result = await modeApi.cancel(currentSession.id, {
        expectedVersion: currentSession.stateVersion,
        reason
      })
      if (result.ok && result.session) {
        updateModeSession(result.session)
        return result.session
      }
      return null
    } catch (err) {
      $modeError.set(err instanceof Error ? err.message : String(err))
      return null
    }
  }, [currentSession])

  const pollEvents = useCallback(async () => {
    if (!currentSession || !isModeActive()) return
    try {
      const newEvents = await modeApi.getEvents(currentSession.id, eventSequence, 50)
      if (newEvents.length > 0) {
        appendModeEvents(newEvents)
        const latest = newEvents[newEvents.length - 1]
        if (latest.stateVersion > currentSession.stateVersion) {
          const refreshed = await modeApi.get(currentSession.id)
          if (refreshed && 'id' in refreshed) {
            updateModeSession(refreshed as AgentModeSession)
          }
        }
      }
    } catch {
      // silent poll failure
    }
  }, [currentSession, eventSequence])

  useEffect(() => {
    void loadActiveSession()
  }, [loadActiveSession])

  useEffect(() => {
    if (currentSession && isModeActive()) {
      pollTimerRef.current = setInterval(() => {
        void pollEvents()
      }, 2000)
    }
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current)
        pollTimerRef.current = null
      }
    }
  }, [currentSession, pollEvents])

  return {
    activeSession: currentSession,
    mode,
    events,
    loading,
    error,
    isActive: currentSession ? isModeActive() : false,
    createSession,
    startMode,
    pauseMode,
    resumeMode,
    cancelMode,
    refresh: loadActiveSession,
    clear: clearModeState
  }
}
