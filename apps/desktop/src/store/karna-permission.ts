import { atom } from 'nanostores'
import type { PermissionMode } from '@/types/karna'

export type KarnaPermissionLevel = PermissionMode

export const $karnaPermissionLevel = atom<KarnaPermissionLevel>('restricted')

export function setKarnaPermissionLevelStore(level: KarnaPermissionLevel): void {
  $karnaPermissionLevel.set(level)
}
