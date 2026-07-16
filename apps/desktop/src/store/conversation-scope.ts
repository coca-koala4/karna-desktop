import { atom } from 'nanostores'
import type { ConversationScope, PermissionMode } from '@/types/karna'

export type DraftConversationScope =
  | {
      type: 'standalone'
    }
  | {
      type: 'project'
      workspaceId: string
      writerProjectId: string
      projectName: string
      cwd: string
    }

export const $draftConversationScope = atom<DraftConversationScope>({ type: 'standalone' })
export const $draftPermissionMode = atom<PermissionMode>('restricted')
export const $scopeLocked = atom(false)

export function setDraftConversationScope(scope: DraftConversationScope, options?: { force?: boolean }): void {
  if ($scopeLocked.get() && !options?.force) {
    return
  }
  $draftConversationScope.set(scope)
}

export function forceDraftConversationScope(scope: DraftConversationScope): void {
  setDraftConversationScope(scope, { force: true })
}

export function setDraftPermissionMode(mode: PermissionMode): void {
  $draftPermissionMode.set(mode)
}

export function lockScope(): void {
  $scopeLocked.set(true)
}

export function unlockScope(): void {
  $scopeLocked.set(false)
}

export function resetDraftScope(): void {
  $draftConversationScope.set({ type: 'standalone' })
  $draftPermissionMode.set('restricted')
  $scopeLocked.set(false)
}
