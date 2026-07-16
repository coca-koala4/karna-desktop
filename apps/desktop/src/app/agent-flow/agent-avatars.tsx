import { cn } from '@/lib/utils'
import type { ReactElement } from 'react'

interface AvatarProps {
  agentId: string
  size?: number
  className?: string
  mode?: 'card' | 'node'
}

const SW = 1.8

type GlyphFn = (c: string) => ReactElement

const GLYPHS: Record<string, GlyphFn> = {
  outline_planner: (c) => (
    <g stroke={c} strokeWidth={SW} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="15" y="12" width="18" height="24" rx="2" />
      <line x1="19" y1="19" x2="29" y2="19" />
      <line x1="19" y1="24" x2="29" y2="24" />
      <line x1="19" y1="29" x2="26" y2="29" />
    </g>
  ),
  chapter_writer: (c) => (
    <g stroke={c} strokeWidth={SW} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 34 L20 28 L31 17 Q34 14 34 17 Q34 20 31 20 L20 31 L14 34 Z" />
      <path d="M27 21 L30 24" />
      <line x1="12" y1="36" x2="36" y2="36" />
    </g>
  ),
  style_polisher: (c) => (
    <g stroke={c} strokeWidth={SW} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M25 13 L27 20 L34 21 L28.5 25.5 L30.5 33 L25 29 L19.5 33 L21.5 25.5 L16 21 L23 20 Z" />
      <circle cx="36" cy="13" r="1.5" fill={c} stroke="none" />
      <circle cx="12" cy="15" r="1" fill={c} stroke="none" />
    </g>
  ),
  plot_critic: (c) => (
    <g stroke={c} strokeWidth={SW} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20 Q18 15 24 19 Q30 23 36 18" />
      <path d="M12 27 Q18 22 24 26 Q30 30 36 25" />
      <circle cx="34" cy="14" r="2" fill={c} stroke="none" />
    </g>
  ),
  character_critic: (c) => (
    <g stroke={c} strokeWidth={SW} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 16 Q24 11 33 16 L32 26 Q30 32 24 32 Q18 32 16 26 Z" />
      <circle cx="20" cy="22" r="1.3" fill={c} stroke="none" />
      <circle cx="28" cy="22" r="1.3" fill={c} stroke="none" />
      <path d="M21 27 Q24 29 27 27" />
      <line x1="24" y1="11" x2="24" y2="14" />
    </g>
  ),
  style_critic: (c) => (
    <g stroke={c} strokeWidth={SW} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 13 L16 32 Q16 35 19 35 L30 35 Q33 35 33 32 L33 19 L22 19" />
      <line x1="20" y1="22" x2="29" y2="22" />
      <line x1="20" y1="26" x2="29" y2="26" />
      <line x1="20" y1="30" x2="26" y2="30" />
    </g>
  ),
  worldbuilding_critic: (c) => (
    <g stroke={c} strokeWidth={SW} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="24" cy="24" r="11" />
      <path d="M13 24 Q24 18 35 24 Q24 30 13 24 Z" />
      <ellipse cx="24" cy="24" rx="4" ry="11" />
      <line x1="24" y1="13" x2="24" y2="35" />
    </g>
  ),
  critique_aggregator: (c) => (
    <g stroke={c} strokeWidth={SW} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <rect x="12" y="18" width="7" height="10" rx="1" />
      <rect x="20.5" y="14" width="7" height="14" rx="1" />
      <rect x="29" y="10" width="7" height="18" rx="1" />
      <path d="M12 32 L20.5 35 L29 32 L36 35" />
    </g>
  ),
  revision_agent: (c) => (
    <g stroke={c} strokeWidth={SW} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 32 L20 32 L34 18 Q36 16 34 14 Q32 12 30 14 L16 28 Z" />
      <path d="M28 16 L32 20" />
      <path d="M15 35 L12 36 L13 33" />
    </g>
  )
}

const DEFAULT_GLYPH: GlyphFn = (c) => (
  <g stroke={c} strokeWidth={SW} fill="none" strokeLinecap="round" strokeLinejoin="round">
    <rect x="14" y="13" width="20" height="22" rx="3" />
    <circle cx="24" cy="22" r="3" />
    <path d="M17 31 Q20 27 24 27 Q28 27 31 31" />
  </g>
)

export function AgentAvatar({ agentId, size = 44, className = '', mode = 'card' }: AvatarProps) {
  const glyph = GLYPHS[agentId] || DEFAULT_GLYPH
  const iconColor = '#7c3aed'
  const bg = 'rgba(139, 92, 246, 0.1)'
  const stroke = iconColor

  return (
    <div
      className={cn(
        'shrink-0 grid place-items-center rounded-lg transition-colors',
        className
      )}
      style={{ width: size, height: size, background: bg, color: stroke }}
    >
      <svg width={size * 0.65} height={size * 0.65} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        {glyph(stroke)}
      </svg>
    </div>
  )
}
