// Keep this public façade stable while the implementation avoids the Tabler
// barrel entry point (which has thousands of re-exports and bloats builds).
export * from './tabler-icons'
export type { Icon as IconComponent } from '@tabler/icons-react'

/** Shared Tailwind size scale for SVG icons. */
export const iconSize = {
  xs: 'size-3',
  sm: 'size-3.5',
  md: 'size-4',
  lg: 'size-5',
  xl: 'size-6'
} as const

export type IconSize = keyof typeof iconSize
