import { atom, map } from 'nanostores'
import type { AgentModeId, AgentModeSession, ModeEvent } from '@/types/mode'

export const $activeModeSession = map<AgentModeSession | Record<string, never>>({})
export const $activeModeEvents = atom<ModeEvent[]>([])
export const $modeEventSequence = atom<number>(0)
export const $modeLoading = atom<boolean>(false)
export const $modeError = atom<string | null>(null)

export function setActiveModeSession(session: AgentModeSession | null) {
  if (session) {
    $activeModeSession.set(session)
    $modeEventSequence.set(0)
    $activeModeEvents.set([])
  } else {
    $activeModeSession.set({})
    $activeModeEvents.set([])
    $modeEventSequence.set(0)
  }
}

export function updateModeSession(session: AgentModeSession) {
  const current = $activeModeSession.get()
  if (current && 'id' in current && current.id === session.id) {
    $activeModeSession.set(session)
  }
}

export function appendModeEvents(events: ModeEvent[]) {
  if (!events.length) return
  const current = $activeModeEvents.get()
  const existingIds = new Set(current.map(e => e.id))
  const newEvents = events.filter(e => !existingIds.has(e.id))
  if (newEvents.length) {
    $activeModeEvents.set([...current, ...newEvents])
    const maxSeq = Math.max(...newEvents.map(e => e.sequence))
    const curSeq = $modeEventSequence.get()
    if (maxSeq > curSeq) {
      $modeEventSequence.set(maxSeq)
    }
  }
}

export function getActiveMode(): AgentModeId {
  const session = $activeModeSession.get()
  if (session && 'mode' in session) {
    return session.mode
  }
  return 'direct'
}

export function getActiveModeStatus() {
  const session = $activeModeSession.get()
  if (session && 'status' in session) {
    return session.status
  }
  return null
}

export function isModeActive(): boolean {
  const session = $activeModeSession.get()
  if (!session || !('id' in session)) return false
  return ['draft', 'ready', 'running', 'paused', 'waiting_user', 'blocked'].includes(session.status)
}

export function clearModeState() {
  $activeModeSession.set({})
  $activeModeEvents.set([])
  $modeEventSequence.set(0)
  $modeError.set(null)
}

export const $modeSidebarVisible = atom<boolean>(false)
export const $modeTransitionPreview = atom<{ toMode: AgentModeId | null; open: boolean }>({ toMode: null, open: false })

export function showModeSidebar() { $modeSidebarVisible.set(true) }
export function hideModeSidebar() { $modeSidebarVisible.set(false) }
export function toggleModeSidebar() { $modeSidebarVisible.set(!$modeSidebarVisible.get()) }

export function openModeTransition(toMode: AgentModeId) {
  $modeTransitionPreview.set({ toMode, open: true })
}
export function closeModeTransition() {
  $modeTransitionPreview.set({ toMode: null, open: false })
}
