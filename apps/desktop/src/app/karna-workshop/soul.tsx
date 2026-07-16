import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { useDialogFocus } from '@/lib/use-dialog-focus'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'

interface SoulIdentity { kind?: string; role_id?: string; domain_ids?: string[]; family_ids?: string[]; form_ids?: string[] }
interface SoulSource { id: string; kind: 'file' | 'folder' | 'url' | 'knowledge_library' | string; label: string; original_location?: string; status?: 'queued' | 'parsing' | 'indexed' | 'partial' | 'failed' | 'disabled' | string; parser?: string | null; file_count?: number; chunk_count?: number; indexed_at?: string | null; completed_at?: string | null; error?: string | null; warnings?: string[]; ingest_job_id?: string | null; library_id?: string }
interface SoulAuthor { id: string; slug?: string; name: string; folder?: string; texts_count?: number; chunks_count?: number; web_evidence_count?: number; profile_version?: number; profile_updated_at?: string | null; description?: string; type?: string; identity?: SoulIdentity; language?: string; risk_strategy?: string; completeness?: number; risk_level?: 'low' | 'medium' | 'high'; status?: 'draft' | 'ready' | 'stale' | 'archived' | 'error'; sources?: SoulSource[] }
interface SoulText { id: string; title: string; chars: number; copyright_status?: string; cleaned_file?: string; imported_at?: string }
interface SoulChunk { chunk_id: string; title?: string; chapter?: string; scene?: string; text?: string; summary?: string; embedding_type?: string; source_file?: string; line_start?: number; tags?: string[]; score?: number }
interface SoulProfile { updated_at?: string | null; narrative_methods?: unknown[]; dialogue_features?: unknown[]; imagery_system?: unknown[]; safe_transfer_principles?: unknown[]; do_not_copy?: unknown[]; evidence_refs?: unknown[]; character_design?: unknown[]; pacing_preference?: unknown[]; critic_lens?: unknown[] }
interface SoulWebSource { id?: string; title?: string; url?: string; summary?: string; credibility?: number; copyright_risk?: 'high' | 'low' | 'medium'; authority_status?: 'passed' | 'failed' | 'review'; authority_reason?: string; saved_at?: string }
interface SoulWebQuery { query?: string; at?: string; status?: 'degraded' | 'running' | 'success'; message?: string }
interface SoulDetail { ok?: boolean; author?: SoulAuthor; governance?: { retention_days?: number | 'forever' }; usage?: KnowledgeUsage; metadata?: { texts?: SoulText[] }; chunks?: SoulChunk[]; profile?: SoulProfile; citations?: Array<{ ref?: string; title?: string; source_file?: string; source_url?: string; line_start?: number }>; web?: { queries?: SoulWebQuery[]; sources?: SoulWebSource[]; claims?: Array<Record<string, unknown>>; conflicts?: Array<Record<string, unknown>> }; risk_profile?: { checks?: Array<Record<string, unknown>> }; timeline?: Array<{ id: string; type: string; title: string; description?: string; created_at: string }> }
interface SoulCatalogPreset { id: string; label: string; kind?: string; default_domain?: string; icon?: string }
interface SoulCatalogDomain { id: string; label: string; description?: string; icon?: string }
interface SoulCatalog { ok?: boolean; identity_presets?: SoulCatalogPreset[]; domains?: SoulCatalogDomain[] }
interface KnowledgeUsage { bytes: number; files: number; folders: Array<{ folder: string; bytes: number; files: number; truncated?: boolean }> }

type ViewMode = 'pool' | 'focused' | 'expanded' | 'attributeView' | 'attributeEdit' | 'soulEdit' | 'sourceManage'
type DragKind = 'canvas' | 'soul' | 'panel' | 'panel-resize' | null
type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw' | null

type BubblePosition = { x: number; y: number }
type BubblePositions = Record<string, BubblePosition>
type Camera = { x: number; y: number; scale: number }
type AttributeId = 'sources' | 'narrative_methods' | 'character_design' | 'dialogue_features' | 'imagery_system' | 'rhythm' | 'critic_lens' | 'safety_shield' | 'do_not_copy' | 'application' | 'evidence_timeline'

interface AttributeBubble {
  id: AttributeId
  label: string
  summary: string
  status: 'empty' | 'ready' | 'stale' | 'indexing' | 'error'
  volume: number
  tags: string[]
  confidence: number
  riskLevel: 'low' | 'medium' | 'high'
  evidenceCount: number
  claimCount: number
}

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  type: 'soul' | 'attribute' | 'canvas' | null
  targetId: string | null
  world?: BubblePosition
}

interface PanelState {
  x: number
  y: number
  w: number
  h: number
  maximized: boolean
  prevBounds?: { x: number; y: number; w: number; h: number }
}

const WORLD = { width: 5600, height: 3800 } // 仅用于迁移旧坐标；新版画布不再限制节点边界
const POSITIONS_KEY = 'karna:soul-nebula:bubble-positions:v3'
const CAMERA_KEY = 'karna:soul-nebula:camera:v4'
const PANEL_KEY = 'karna:soul-nebula:panel:v4'
const MOTION_KEY = 'karna:soul-nebula:motion:v1'

const EDIT_PANEL_DEFAULT: PanelState = { x: 0, y: 0, w: 860, h: 760, maximized: false }
const EDIT_PANEL_MIN = { w: 380, h: 360 }
const EDIT_PANEL_MAX = { w: Math.min(typeof window !== 'undefined' ? window.innerWidth * 0.96 : 1400, 1280), h: Math.min(typeof window !== 'undefined' ? window.innerHeight * 0.94 : 980, 940) }

const ATTRIBUTE_DEFS: Array<{ id: AttributeId; label: string; icon: string; angle: number; radius: number }> = [
  { id: 'sources', label: '资料源', icon: 'library', angle: -118, radius: 245 },
  { id: 'narrative_methods', label: '叙事方法', icon: 'book', angle: -82, radius: 295 },
  { id: 'character_design', label: '人物处理', icon: 'account', angle: -46, radius: 260 },
  { id: 'dialogue_features', label: '对白特征', icon: 'comment', angle: -12, radius: 315 },
  { id: 'imagery_system', label: '意象系统', icon: 'sparkle', angle: 24, radius: 270 },
  { id: 'rhythm', label: '节奏偏好', icon: 'music', angle: 60, radius: 303 },
  { id: 'critic_lens', label: '批评视角', icon: 'search', angle: 104, radius: 258 },
  { id: 'safety_shield', label: '安全护盾', icon: 'shield', angle: 142, radius: 298 },
  { id: 'do_not_copy', label: 'DO_NOT_COPY', icon: 'circle-slash', angle: 182, radius: 253 },
  { id: 'application', label: '应用到作品', icon: 'symbol-color', angle: 222, radius: 312 },
  { id: 'evidence_timeline', label: '证据时间线', icon: 'watch', angle: 264, radius: 278 }
]

type AttributeGroupId = 'sources_evidence' | 'craft_methods' | 'language_aesthetic' | 'critique_constraints' | 'application_output'

interface AttributeGroupDef {
  id: AttributeGroupId
  label: string
  icon: string
  angle: number
  radius: number
  children: AttributeId[]
}

interface GalaxyGroupNode extends AttributeGroupDef {
  x: number
  y: number
  size: number
  volume: number
  readyCount: number
  risk: 'low' | 'medium' | 'high'
  childCount: number
  expanded: boolean
}

interface GalaxyAttributeNode {
  id: AttributeId
  x: number
  y: number
  size: number
  groupId: AttributeGroupId
  attribute: AttributeBubble
}

const ATTRIBUTE_GROUPS: AttributeGroupDef[] = [
  { id: 'sources_evidence', label: '资料与证据', icon: 'library', angle: -120, radius: 285, children: ['sources', 'evidence_timeline'] },
  { id: 'craft_methods', label: '创作方法', icon: 'book', angle: -40, radius: 300, children: ['narrative_methods', 'character_design', 'dialogue_features'] },
  { id: 'language_aesthetic', label: '语言与审美', icon: 'sparkle', angle: 38, radius: 286, children: ['imagery_system', 'rhythm'] },
  { id: 'critique_constraints', label: '评价与约束', icon: 'shield', angle: 126, radius: 305, children: ['critic_lens', 'safety_shield', 'do_not_copy'] },
  { id: 'application_output', label: '应用与产出', icon: 'symbol-color', angle: 218, radius: 292, children: ['application'] }
]

function bubbleSizeForAttribute(attr: AttributeBubble): number {
  const volume = Math.max(0, attr.volume || 0)
  return clamp(92 + Math.sqrt(volume) * 6.2, 92, 146)
}

function computeAttributeGalaxy(activePos: BubblePosition, attributes: AttributeBubble[], expandedGroupId: AttributeGroupId | '', centerSize = 290) {
  const attrMap = Object.fromEntries(attributes.map(attr => [attr.id, attr])) as Partial<Record<AttributeId, AttributeBubble>>
  const groupCount = ATTRIBUTE_GROUPS.length
  const groupStep = (Math.PI * 2) / Math.max(1, groupCount)
  const groupStart = -Math.PI / 2
  const groups: GalaxyGroupNode[] = ATTRIBUTE_GROUPS.map(group => {
    const groupIndex = ATTRIBUTE_GROUPS.findIndex(item => item.id === group.id)
    const children = group.children.map(id => attrMap[id]).filter(Boolean) as AttributeBubble[]
    const volume = children.reduce((sum, attr) => sum + Math.max(0, attr.volume), 0)
    const readyCount = children.filter(attr => attr.status !== 'empty').length
    const risk = children.some(attr => attr.riskLevel === 'high') ? 'high' : children.some(attr => attr.riskLevel === 'medium') ? 'medium' : 'low'
    const angle = groupStart + groupIndex * groupStep
    const size = clamp(112 + Math.sqrt(Math.max(0, volume)) * 5.2, 112, 152)
    // Keep first-level attribute groups outside the visible Soul surface.
    // The center bubble contains glow/rings, so layout must reserve more than
    // the raw visual diameter; otherwise the groups look like they are pasted
    // into the Soul bubble instead of orbiting it.
    const radius = centerSize / 2 + size / 2 + 168

    return {
      ...group,
      angle: angle * 180 / Math.PI,
      radius,
      x: activePos.x + Math.cos(angle) * radius,
      y: activePos.y + Math.sin(angle) * radius,
      size,
      volume,
      readyCount,
      risk,
      childCount: children.length,
      expanded: group.id === expandedGroupId
    }
  })

  const attributesByGroup = new Map<AttributeGroupId, AttributeBubble[]>()

  ATTRIBUTE_GROUPS.forEach(group => {
    attributesByGroup.set(group.id, group.children.map(id => attrMap[id]).filter(Boolean) as AttributeBubble[])
  })

  const childNodes: GalaxyAttributeNode[] = []
  const expandedGroup = expandedGroupId ? groups.find(group => group.id === expandedGroupId) : null

  if (expandedGroup) {
    const children = attributesByGroup.get(expandedGroup.id) || []
    // Second-level bubbles orbit their own group bubble, not the central Soul.
    // Keep every child on one exact circle with an equal angular step so that
    // opening a group cannot produce the old lopsided fan layout.
    const outwardAngle = expandedGroup.angle * Math.PI / 180
    const maxChildSize = Math.max(92, ...children.map(bubbleSizeForAttribute))
    const minimumGap = 34
    const circumferenceRadius = children.length > 1
      ? (maxChildSize + minimumGap) / (2 * Math.sin(Math.PI / children.length))
      : 0
    const childRadius = Math.max(expandedGroup.size / 2 + maxChildSize / 2 + 64, circumferenceRadius)
    const angleStep = children.length > 0 ? (Math.PI * 2) / children.length : 0

    children.forEach((attribute, index) => {
      const size = bubbleSizeForAttribute(attribute)
      const angle = outwardAngle + index * angleStep
      const raw = {
        id: attribute.id,
        x: expandedGroup.x + Math.cos(angle) * childRadius,
        y: expandedGroup.y + Math.sin(angle) * childRadius,
        size,
        groupId: expandedGroup.id,
        attribute
      }

      childNodes.push(raw)
    })
  }

  return { groups, childNodes }
}

interface AttributeLayout {
  id: AttributeId
  angle: number
  radius: number
  size: number
}

function calculateAttributeLayout(attributes: AttributeBubble[]): AttributeLayout[] {
  const n = attributes.length
  if (n === 0) return []

  const withSize = attributes.map(attr => ({
    id: attr.id,
    size: bubbleSizeForAttribute(attr)
  }))

  const sorted = [...withSize].sort((a, b) => b.size - a.size)

  const outerCount = Math.ceil(n * 0.6)
  const innerCount = n - outerCount

  const outerRing = sorted.slice(0, outerCount)
  const innerRing = sorted.slice(outerCount)

  const baseOuterRadius = 320
  const baseInnerRadius = 230

  const outerAngleStep = (Math.PI * 2) / outerCount
  const innerAngleStep = (Math.PI * 2) / innerCount

  const startAngle = -Math.PI / 2 - Math.PI / 6

  const layout: AttributeLayout[] = []

  outerRing.forEach((item, i) => {
    const angle = startAngle + i * outerAngleStep
    const sizeRatio = (item.size - 86) / (148 - 86)
    const radius = baseOuterRadius + sizeRatio * 40
    layout.push({ id: item.id, angle, radius, size: item.size })
  })

  if (innerCount > 0) {
    const innerOffset = outerAngleStep / 2
    innerRing.forEach((item, i) => {
      const angle = startAngle + innerOffset + i * innerAngleStep
      const sizeRatio = (item.size - 86) / (148 - 86)
      const radius = baseInnerRadius + sizeRatio * 30
      layout.push({ id: item.id, angle, radius, size: item.size })
    })
  }

  const iterations = 50
  const repulsionStrength = 8
  const minDistFactor = 0.95

  for (let iter = 0; iter < iterations; iter++) {
    let moved = false

    for (let i = 0; i < layout.length; i++) {
      for (let j = i + 1; j < layout.length; j++) {
        const a = layout[i]
        const b = layout[j]

        const ax = Math.cos(a.angle) * a.radius
        const ay = Math.sin(a.angle) * a.radius
        const bx = Math.cos(b.angle) * b.radius
        const by = Math.sin(b.angle) * b.radius

        const dx = bx - ax
        const dy = by - ay
        const dist = Math.sqrt(dx * dx + dy * dy)
        const minDist = (a.size + b.size) / 2 * minDistFactor

        if (dist < minDist && dist > 0.1) {
          const overlap = minDist - dist
          const pushX = (dx / dist) * overlap * 0.5
          const pushY = (dy / dist) * overlap * 0.5

          const aNewX = ax - pushX * repulsionStrength * 0.1
          const aNewY = ay - pushY * repulsionStrength * 0.1
          const bNewX = bx + pushX * repulsionStrength * 0.1
          const bNewY = by + pushY * repulsionStrength * 0.1

          const aNewAngle = Math.atan2(aNewY, aNewX)
          const aNewRadius = Math.sqrt(aNewX * aNewX + aNewY * aNewY)
          const bNewAngle = Math.atan2(bNewY, bNewX)
          const bNewRadius = Math.sqrt(bNewX * bNewX + bNewY * bNewY)

          const radiusMin = baseInnerRadius - 20
          const radiusMax = baseOuterRadius + 80

          layout[i] = { ...a, angle: aNewAngle, radius: clamp(aNewRadius, radiusMin, radiusMax) }
          layout[j] = { ...b, angle: bNewAngle, radius: clamp(bNewRadius, radiusMin, radiusMax) }

          moved = true
        }
      }
    }

    if (!moved) break
  }

  const result: AttributeLayout[] = []
  for (const def of ATTRIBUTE_DEFS) {
    const found = layout.find(l => l.id === def.id)
    if (found) {
      result.push(found)
    }
  }

  return result
}

const STAR_COUNT = 120

function useMotionPreference() {
  const [reduceMotion, setReduceMotion] = useState(() => {
    try {
      const stored = window.localStorage.getItem(MOTION_KEY)

      if (stored) {return JSON.parse(stored).reduceMotion}

      return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    } catch { return false }
  })

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches)
    mq?.addEventListener?.('change', handler)

    return () => mq?.removeEventListener?.('change', handler)
  }, [])

  const setMotion = useCallback((value: boolean) => {
    setReduceMotion(value)

    try { window.localStorage.setItem(MOTION_KEY, JSON.stringify({ reduceMotion: value })) } catch { /* noop */ }
  }, [])

  return { reduceMotion, setReduceMotion: setMotion }
}

async function api<TData>(path: string, method = 'GET', body?: unknown): Promise<TData> {
  return window.karnaDesktop.api<TData>({ path, method, body })
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)

    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback
  } catch {
    return fallback
  }
}

function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)) }

function clampPanelToViewport(panel: PanelState): PanelState {
  const margin = 24
  const topMargin = 88
  const maxW = Math.max(EDIT_PANEL_MIN.w, window.innerWidth - margin * 2)
  const maxH = Math.max(EDIT_PANEL_MIN.h, window.innerHeight - topMargin - margin)
  const w = clamp(panel.w || EDIT_PANEL_DEFAULT.w, EDIT_PANEL_MIN.w, Math.min(EDIT_PANEL_MAX.w, maxW))
  const h = clamp(panel.h || EDIT_PANEL_DEFAULT.h, EDIT_PANEL_MIN.h, Math.min(EDIT_PANEL_MAX.h, maxH))
  return {
    ...panel,
    w,
    h,
    x: clamp(Number.isFinite(panel.x) ? panel.x : window.innerWidth - w - margin, margin, Math.max(margin, window.innerWidth - w - margin)),
    y: clamp(Number.isFinite(panel.y) ? panel.y : topMargin, topMargin, Math.max(topMargin, window.innerHeight - h - margin))
  }
}

function primaryButtonClass(extra = '') { return `border-0 bg-[var(--theme-primary)] text-white shadow-lg shadow-[var(--theme-primary)]/25 hover:bg-[color-mix(in_srgb,var(--theme-primary)_88%,black)] disabled:opacity-55 ${extra}` }

function soulDataWeight(author: SoulAuthor) {
  const sourceCount = Array.isArray(author.sources) ? author.sources.length : Number((author as { sources_count?: number }).sources_count || 0)
  return Math.max(0, (author.texts_count || 0) * 0.8 + (author.chunks_count || 0) * 1.6 + (author.web_evidence_count || 0) * 5.5 + sourceCount * 8)
}

function volumeForSoul(author: SoulAuthor) {
  const weight = soulDataWeight(author)
  return clamp(132 + Math.sqrt(weight) * 5.5, 132, 260)
}

function displaySizeForSoul(author: SoulAuthor, focused: boolean, mode: ViewMode) {
  return volumeForSoul(author) + (focused && mode !== 'pool' ? 40 : 0)
}

function volumeLabel(author: SoulAuthor) { return `${author.texts_count || 0} 文本 · ${author.chunks_count || 0} 分块 · ${author.web_evidence_count || 0} 证据` }

function resolveSoulCollision(author: SoulAuthor, desired: BubblePosition, authors: SoulAuthor[], positions: BubblePositions, activeId = '', mode: ViewMode = 'pool'): BubblePosition {
  const result = { ...desired }
  const selfRadius = displaySizeForSoul(author, author.id === activeId, mode) / 2 + 8
  const others = authors.filter(row => row.id !== author.id)

  for (let pass = 0; pass < 6; pass++) {
    others.forEach((other, index) => {
      const otherPos = positions[other.id] || defaultPosition(authors.findIndex(row => row.id === other.id), authors.length || 1)
      const otherRadius = displaySizeForSoul(other, other.id === activeId, mode) / 2 + 8
      const minDist = selfRadius + otherRadius + 8
      let dx = result.x - otherPos.x
      let dy = result.y - otherPos.y
      let dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < 0.001) {
        const angle = ((index + pass + 1) * 137.5 * Math.PI) / 180
        dx = Math.cos(angle)
        dy = Math.sin(angle)
        dist = 1
      }

      if (dist < minDist) {
        const push = minDist - dist
        result.x += (dx / dist) * push
        result.y += (dy / dist) * push
      }
    })
  }

  return result
}

function eventPoint(event: ReactPointerEvent | PointerEvent | MouseEvent) { return { x: event.clientX, y: event.clientY } }

function isInteractiveTarget(target: EventTarget | null) { return target instanceof HTMLElement && Boolean(target.closest('button,input,textarea,select,a,[data-panel],[data-menu],[data-resize-handle]')) }

function isWheelBlockedTarget(target: EventTarget | null) { return target instanceof HTMLElement && Boolean(target.closest('input,textarea,select,[data-panel],[data-menu],[data-resize-handle]')) }

function listText(rows?: unknown[]) { return rows?.length ? rows.slice(0, 3).map(itemValue).join(' / ') : '' }

function itemValue(item: unknown) {
  if (typeof item === 'string') {return item}

  if (item && typeof item === 'object' && 'value' in item) {return String((item as { value?: unknown }).value || '')}

  if (item && typeof item === 'object' && 'text' in item) {return String((item as { text?: unknown }).text || '')}

  if (item && typeof item === 'object' && 'label' in item) {return String((item as { label?: unknown }).label || '')}

  return String(item ?? '')
}

function sourceRef(author: SoulAuthor) { return author.slug || author.id }

function defaultPosition(index: number, total: number): BubblePosition {
  const ring = Math.floor(index / 9)
  const slot = index % 9
  const angle = (slot / Math.min(total, 9)) * Math.PI * 2 + ring * 0.38
  const radius = 380 + ring * 280

  return {
    x: Math.cos(angle) * radius + ((index * 73) % 140) - 70,
    y: Math.sin(angle) * radius + ((index * 41) % 120) - 60
  }
}

function createAttributes(detail: SoulDetail | null, author: SoulAuthor | null): AttributeBubble[] {
  const profile = detail?.profile || {}
  const texts = detail?.metadata?.texts?.length || author?.texts_count || 0
  const chunks = detail?.chunks?.length || author?.chunks_count || 0
  const claims = detail?.web?.claims?.length || author?.web_evidence_count || 0
  const sources = detail?.web?.sources?.length || texts

  const rows: Record<AttributeId, { summary: string; volume: number; tags: string[]; confidence: number; riskLevel: 'low' | 'medium' | 'high'; evidenceCount: number; claimCount: number; status: 'empty' | 'ready' | 'stale' | 'indexing' }> = {
    sources: { summary: sources ? `已连接 ${sources} 个资料源。点击"管理资料源"添加更多。` : '这个 Soul 还没有资料源。右键中心泡泡，选择"连接资料源"。', volume: sources, tags: ['source'], confidence: sources > 0 ? 0.85 : 0, riskLevel: 'low', evidenceCount: sources, claimCount: 0, status: sources ? 'ready' : 'empty' },
    narrative_methods: { summary: listText(profile.narrative_methods) || '叙事方法尚未蒸馏。添加资料源后可重新蒸馏。', volume: profile.narrative_methods?.length || 0, tags: ['method', 'narrative'], confidence: profile.narrative_methods?.length ? 0.78 : 0, riskLevel: 'low', evidenceCount: chunks, claimCount: profile.narrative_methods?.length || 0, status: profile.narrative_methods?.length ? 'ready' : 'empty' },
    character_design: { summary: listText(profile.character_design) || '人物处理会从分块、证据和人工摘要中提炼角色塑造方法。', volume: profile.character_design?.length || Math.round(chunks / 16), tags: ['character'], confidence: profile.character_design?.length ? 0.72 : 0.3, riskLevel: 'medium', evidenceCount: chunks, claimCount: profile.character_design?.length || 0, status: profile.character_design?.length ? 'ready' : 'empty' },
    dialogue_features: { summary: listText(profile.dialogue_features) || '对白特征尚未生成。', volume: profile.dialogue_features?.length || 0, tags: ['dialogue'], confidence: profile.dialogue_features?.length ? 0.8 : 0, riskLevel: 'low', evidenceCount: chunks, claimCount: profile.dialogue_features?.length || 0, status: profile.dialogue_features?.length ? 'ready' : 'empty' },
    imagery_system: { summary: listText(profile.imagery_system) || '意象系统尚未生成。追踪隐喻、象征、视觉母题。', volume: profile.imagery_system?.length || 0, tags: ['imagery', 'visual'], confidence: profile.imagery_system?.length ? 0.75 : 0, riskLevel: 'low', evidenceCount: chunks, claimCount: profile.imagery_system?.length || 0, status: profile.imagery_system?.length ? 'ready' : 'empty' },
    rhythm: { summary: listText(profile.pacing_preference) || '节奏偏好用于迁移结构感和呼吸感，不复制句式。', volume: profile.pacing_preference?.length || Math.round(chunks / 24), tags: ['rhythm', 'pacing'], confidence: 0.5, riskLevel: 'low', evidenceCount: chunks, claimCount: profile.pacing_preference?.length || 0, status: profile.pacing_preference?.length ? 'ready' : 'empty' },
    critic_lens: { summary: listText(profile.critic_lens) || '批评视角只给创作建议，不输出仿写文本。', volume: profile.critic_lens?.length || claims, tags: ['critic', 'theory'], confidence: claims > 0 ? 0.68 : 0.2, riskLevel: 'medium', evidenceCount: claims, claimCount: profile.critic_lens?.length || 0, status: claims > 0 ? 'ready' : 'empty' },
    safety_shield: { summary: listText(profile.safe_transfer_principles) || '安全护盾会在蒸馏后列出可迁移原则和不可迁移边界。', volume: profile.safe_transfer_principles?.length || 0, tags: ['safety', 'guardrail'], confidence: profile.safe_transfer_principles?.length ? 0.9 : 0.4, riskLevel: 'medium', evidenceCount: 0, claimCount: profile.safe_transfer_principles?.length || 0, status: profile.safe_transfer_principles?.length ? 'ready' : 'empty' },
    do_not_copy: { summary: listText(profile.do_not_copy) || '还没有不可复制清单。明确标记受版权保护的独特表达。', volume: profile.do_not_copy?.length || 0, tags: ['guardrail', 'copyright'], confidence: profile.do_not_copy?.length ? 0.95 : 0.3, riskLevel: profile.do_not_copy?.length ? 'high' : 'medium', evidenceCount: 0, claimCount: profile.do_not_copy?.length || 0, status: profile.do_not_copy?.length ? 'ready' : 'empty' },
    application: { summary: '应用到作品需要先选择目标项目。在写作时自动激活风格迁移。', volume: 0, tags: ['apply', 'workflow'], confidence: 0, riskLevel: 'low', evidenceCount: 0, claimCount: 0, status: 'empty' },
    evidence_timeline: { summary: claims ? `当前有 ${claims} 条观点证据。点击查看证据演化时间线。` : '证据时间线尚为空。', volume: claims, tags: ['evidence', 'timeline'], confidence: claims > 0 ? 0.82 : 0, riskLevel: 'low', evidenceCount: claims, claimCount: claims, status: claims > 0 ? 'ready' : 'empty' }
  }

  return ATTRIBUTE_DEFS.map(def => {
    const row = rows[def.id]

    return { id: def.id, label: def.label, summary: row.summary, status: row.status, volume: row.volume, tags: row.tags, confidence: row.confidence, riskLevel: row.riskLevel, evidenceCount: row.evidenceCount, claimCount: row.claimCount }
  })
}

function generateStars(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 2 + 0.5,
    opacity: Math.random() * 0.6 + 0.1,
    delay: Math.random() * 8,
    duration: Math.random() * 4 + 3
  }))
}

export function SoulWorkshopFullView() {
  const { reduceMotion, setReduceMotion } = useMotionPreference()
  const stars = useMemo(() => generateStars(STAR_COUNT), [])
  const [authors, setAuthors] = useState<SoulAuthor[]>([])
  const [activeId, setActiveId] = useState('')
  const [detail, setDetail] = useState<SoulDetail | null>(null)
  const [knowledgeUsage, setKnowledgeUsage] = useState<KnowledgeUsage | null>(null)
  const [catalog, setCatalog] = useState<SoulCatalog>({})
  const [mode, setMode] = useState<ViewMode>('pool')
  const [activeAttributeId, setActiveAttributeId] = useState<AttributeId | ''>('')
  const [expandedGroupId, setExpandedGroupId] = useState<AttributeGroupId | ''>('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newSoulName, setNewSoulName] = useState('')
  const [newSoulDesc, setNewSoulDesc] = useState('')
  const [positions, setPositions] = useState<BubblePositions>(() => readJson<BubblePositions>(POSITIONS_KEY, {}))
  const [camera, setCamera] = useState<Camera>(() => readJson<Camera>(CAMERA_KEY, { x: window.innerWidth / 2, y: window.innerHeight / 2, scale: 1 }))

  const [panel, setPanel] = useState<PanelState>(() => {
    const stored = readJson<Partial<PanelState> | null>(PANEL_KEY, null)

    if (stored && typeof stored === 'object' && 'w' in stored) {
      return clampPanelToViewport({ ...EDIT_PANEL_DEFAULT, ...stored, maximized: false })
    }

    return clampPanelToViewport({ ...EDIT_PANEL_DEFAULT, x: window.innerWidth - EDIT_PANEL_DEFAULT.w - 48, y: 120 })
  })

  const [panelDirty, setPanelDirty] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({ visible: false, x: 0, y: 0, type: null, targetId: null })
  const [timelineExpanded, setTimelineExpanded] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null)
  const [draggingSoulId, setDraggingSoulId] = useState('')
  const [copiedSoulRef, setCopiedSoulRef] = useState('')
  const dragRef = useRef<{ kind: DragKind; id?: string; edge?: ResizeEdge; start: BubblePosition; origin: BubblePosition & { w?: number; h?: number }; moved: boolean; soulOrigin?: BubblePosition } | null>(null)
  const createInputRef = useRef<HTMLInputElement | null>(null)
  const positionsRef = useRef<BubblePositions>(positions)
  const persistPositionsRef = useRef(true)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const previousModeRef = useRef<ViewMode>(mode)
  const previousActiveIdRef = useRef(activeId)
  const active = useMemo(() => authors.find(a => a.id === activeId) || null, [authors, activeId])
  const attributes = useMemo(() => createAttributes(detail, active), [detail, active])
  const activeAttribute = attributes.find(a => a.id === activeAttributeId) || null
  const timelineEvents = useMemo(() => detail?.timeline || [], [detail])

  useEffect(() => { positionsRef.current = positions }, [positions])
  useEffect(() => {
    const activeChanged = previousActiveIdRef.current !== activeId
    const enteredExpanded = previousModeRef.current !== 'expanded' && mode === 'expanded'
    const leftExpanded = previousModeRef.current === 'expanded' && mode !== 'expanded'

    if (activeChanged || enteredExpanded || leftExpanded) {
      setExpandedGroupId('')
    }

    previousActiveIdRef.current = activeId
    previousModeRef.current = mode
  }, [activeId, mode])

  const patchPositions = useCallback((updater: (old: BubblePositions) => BubblePositions) => {
    setPositions(old => {
      const next = updater(old)

      if (persistPositionsRef.current) {
        try { window.localStorage.setItem(POSITIONS_KEY, JSON.stringify(next)) } catch { /* noop */ }
      }

      return next
    })
  }, [])

  const setCameraPersist = useCallback((next: Camera | ((old: Camera) => Camera)) => {
    setCamera(old => {
      const value = typeof next === 'function' ? next(old) : next
      const clean = { x: value.x, y: value.y, scale: clamp(value.scale, 0.15, 3.0) }

      try { window.localStorage.setItem(CAMERA_KEY, JSON.stringify(clean)) } catch { /* noop */ }

      return clean
    })
  }, [])

  const setPanelPersist = useCallback((updater: PanelState | ((old: PanelState) => PanelState)) => {
    setPanel(old => {
      const next = clampPanelToViewport(typeof updater === 'function' ? updater(old) : updater)

      try { window.localStorage.setItem(PANEL_KEY, JSON.stringify({ x: next.x, y: next.y, w: next.w, h: next.h, maximized: next.maximized })) } catch { /* noop */ }

      return next
    })
  }, [])

  const refreshAuthors = useCallback(async () => {
    const r = await api<{ ok?: boolean; authors?: SoulAuthor[]; active_author_id?: string }>('/api/soul/authors')
    const rows = r.authors || []
    setAuthors(rows)
    setActiveId(current => current && rows.some(row => row.id === current) ? current : rows[0]?.id || '')
    patchPositions(old => {
      const next = { ...old }
      rows.forEach((row, index) => {
        if (!next[row.id]) {next[row.id] = defaultPosition(index, rows.length || 1)}
      })

      return next
    })
  }, [patchPositions])

  const refreshDetail = useCallback(async (row = active) => {
    if (!row) { setDetail(null);

 return }

    setDetail(await api<SoulDetail>(`/api/soul/authors/${encodeURIComponent(sourceRef(row))}`))
  }, [active])

  useEffect(() => { void refreshAuthors().catch(err => notifyError(err, 'Soul工坊加载失败')) }, [refreshAuthors])
  useEffect(() => { void refreshDetail().catch(() => undefined) }, [activeId, refreshDetail])
  useEffect(() => { void api<SoulCatalog>('/api/soul/catalog').then(setCatalog).catch(() => setCatalog({})) }, [])
  useEffect(() => {
    void api<{ usage?: KnowledgeUsage }>('/api/knowledge').then(result => setKnowledgeUsage(result.usage || null)).catch(() => setKnowledgeUsage(null))
  }, [])
  useEffect(() => {
    if (createOpen) {window.setTimeout(() => createInputRef.current?.focus(), 60)}
  }, [createOpen])

  useEffect(() => {
    const onResize = () => setPanelPersist(old => old)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [setPanelPersist])

  useEffect(() => {
    if (message) {
      const t = window.setTimeout(() => setMessage(''), 3500)

      return () => window.clearTimeout(t)
    }
  }, [message])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isInteractiveTarget(e.target)) {return}

      if (e.key === 'Escape') {
        if (contextMenu.visible) { setContextMenu(prev => ({ ...prev, visible: false }));

 return }

        if (confirmDialog) { setConfirmDialog(null);

 return }

        if (createOpen) { setCreateOpen(false);

 return }

        if (mode === 'attributeEdit' || mode === 'soulEdit' || mode === 'sourceManage') {
          if (panelDirty) {
            setConfirmDialog({ message: '有未保存的更改，确定关闭吗？', onConfirm: () => { setPanelDirty(false); setMode(mode === 'attributeEdit' ? 'attributeView' : 'focused') } })
          } else {
            setMode(mode === 'attributeEdit' ? 'attributeView' : 'focused')
          }

          return
        }

        if (mode === 'attributeView') { setActiveAttributeId(''); setMode('expanded');

 return }

        if (mode === 'expanded') { setMode('focused');

 return }

        if (mode === 'focused') { setMode('pool');

 return }
      }

      if (e.key === 'Enter' && mode === 'focused') {
        setMode('expanded')
      }

      if ((e.key === 'Backspace' || e.key === 'Delete') && mode !== 'pool' && !e.ctrlKey && !e.metaKey) {
        if (mode === 'attributeView') { setActiveAttributeId(''); setMode('expanded') }
        else if (mode === 'expanded') {setMode('focused')}
        else if (mode === 'focused') {setMode('pool')}
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()

        if (mode === 'attributeEdit' || mode === 'soulEdit' || mode === 'sourceManage') {
          setPanelDirty(false)
          notify({ kind: 'success', title: '已保存', message: '更改已保存到 Soul 档案' })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode, contextMenu.visible, confirmDialog, createOpen, panelDirty])

  useEffect(() => {
    const handleClick = () => {
      if (contextMenu.visible) {setContextMenu(prev => ({ ...prev, visible: false }))}
    }

    window.addEventListener('click', handleClick)

    return () => window.removeEventListener('click', handleClick)
  }, [contextMenu.visible])

  const createSoul = async () => {
    const name = newSoulName.trim()

    if (!name) {
      setCreateOpen(true)
      window.setTimeout(() => createInputRef.current?.focus(), 40)

      return
    }

    setBusy('create')

    try {
      const r = await api<{ ok?: boolean; author?: SoulAuthor }>('/api/soul/authors', 'POST', { name, description: newSoulDesc.trim(), identity: { kind: 'method', role_id: 'custom_method', domain_ids: ['literature'], family_ids: [], form_ids: [] }, risk_strategy: 'balanced' })

      if (!r.author) {throw new Error('创建接口没有返回 Soul')}
      const point = screenToWorld(window.innerWidth / 2, window.innerHeight / 2, camera)
      patchPositions(old => ({ ...old, [r.author!.id]: { x: point.x, y: point.y } }))
      setNewSoulName('')
      setNewSoulDesc('')
      setCreateOpen(false)
      setActiveId(r.author.id)
      setMode('focused')
      await refreshAuthors()
      notify({ kind: 'success', title: '已创建 Soul', message: r.author.name })
    } catch (e) {
      notifyError(e, '创建 Soul 失败')
    } finally {
      setBusy('')
    }
  }

  const focusSoul = useCallback((author: SoulAuthor) => {
    if (activeId === author.id && (mode === 'focused' || mode === 'expanded')) {
      setMode(mode === 'expanded' ? 'focused' : 'expanded')
    } else {
      setActiveId(author.id)
      setActiveAttributeId('')
      setExpandedGroupId('')
      setMessage('')
      setMode('focused')
      const targetX = window.innerWidth / 2
      const targetY = window.innerHeight / 2
      const pos = positions[author.id] || defaultPosition(authors.findIndex(a => a.id === author.id), authors.length)
      setCameraPersist({ x: targetX - pos.x * camera.scale, y: targetY - pos.y * camera.scale, scale: camera.scale })
    }
  }, [activeId, mode, positions, authors, camera, setCameraPersist])

  const expandSoul = useCallback((author: SoulAuthor) => {
    if (activeId === author.id && mode === 'expanded') {return}
    setActiveId(author.id)
    setActiveAttributeId('')
    setExpandedGroupId('')
    setMessage('')
    setMode('expanded')
    const targetX = window.innerWidth / 2
    const targetY = window.innerHeight / 2
    const pos = positions[author.id] || defaultPosition(authors.findIndex(a => a.id === author.id), authors.length)
    setCameraPersist({ x: targetX - pos.x * camera.scale, y: targetY - pos.y * camera.scale, scale: camera.scale })
  }, [activeId, mode, positions, authors, camera, setCameraPersist])

  const handleCanvasClick = useCallback((e: React.MouseEvent) => {
    if (isInteractiveTarget(e.target)) {return}

    if (dragRef.current?.moved) { dragRef.current = null;

 return }

    if (mode === 'attributeEdit' || mode === 'soulEdit' || mode === 'sourceManage') {return}

    if (mode === 'attributeView') { setActiveAttributeId(''); setMode('expanded');

 return }

    if (mode === 'expanded') { setMode('focused');

 return }

    if (mode === 'focused') { setMode('pool');

 return }
  }, [mode])

  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(event.target)) {return}
    const point = eventPoint(event)
    dragRef.current = { kind: 'canvas', start: point, origin: { x: camera.x, y: camera.y }, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onSoulPointerDown = (event: ReactPointerEvent, author: SoulAuthor) => {
    if (event.button !== 0) {return}
    event.stopPropagation()
    const point = eventPoint(event)
    const origin = positions[author.id] || defaultPosition(authors.findIndex(a => a.id === author.id), authors.length)
    persistPositionsRef.current = false
    setDraggingSoulId(author.id)
    dragRef.current = { kind: 'soul', id: author.id, start: point, origin: { x: origin.x, y: origin.y }, soulOrigin: origin, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPanelDragStart = (event: ReactPointerEvent) => {
    if (event.button !== 0) {return}
    event.stopPropagation()
    const point = eventPoint(event)
    dragRef.current = { kind: 'panel', start: point, origin: { x: panel.x, y: panel.y }, moved: false }
  }

  const onResizeStart = (event: ReactPointerEvent, edge: ResizeEdge) => {
    if (event.button !== 0) {return}
    event.stopPropagation()
    event.preventDefault()
    const point = eventPoint(event)
    dragRef.current = { kind: 'panel-resize', edge, start: point, origin: { x: panel.x, y: panel.y, w: panel.w, h: panel.h }, moved: false }
  }

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current

      if (!drag) {return}
      const point = eventPoint(event)
      const dx = point.x - drag.start.x
      const dy = point.y - drag.start.y

      if (Math.abs(dx) + Math.abs(dy) > 3) {drag.moved = true}

      if (drag.kind === 'canvas') {
        setCameraPersist({ x: drag.origin.x + dx, y: drag.origin.y + dy, scale: camera.scale })
      }

      if (drag.kind === 'soul' && drag.id) {
        const worldDx = dx / camera.scale
        const worldDy = dy / camera.scale
        const draggedAuthor = authors.find(row => row.id === drag.id)
        const desired = {
          x: (drag.soulOrigin?.x || drag.origin.x) + worldDx,
          y: (drag.soulOrigin?.y || drag.origin.y) + worldDy
        }
        const nextPos = draggedAuthor ? resolveSoulCollision(draggedAuthor, desired, authors, positionsRef.current, activeId, mode) : desired

        patchPositions(old => ({
          ...old,
          [drag.id!]: nextPos
        }))
      }

      if (drag.kind === 'panel') {
        setPanelPersist(old => ({
          ...old,
          x: clamp(drag.origin.x + dx, 20, window.innerWidth - old.w - 20),
          y: clamp(drag.origin.y + dy, 80, window.innerHeight - 120)
        }))
      }

      if (drag.kind === 'panel-resize' && drag.edge) {
        const edge = drag.edge
        let nx = panel.x, ny = panel.y, nw = panel.w, nh = panel.h
        const ox = drag.origin.x, oy = drag.origin.y, ow = drag.origin.w || panel.w, oh = drag.origin.h || panel.h

        if (edge.includes('e')) {nw = clamp(ow + dx, EDIT_PANEL_MIN.w, EDIT_PANEL_MAX.w)}

        if (edge.includes('w')) { nw = clamp(ow - dx, EDIT_PANEL_MIN.w, EDIT_PANEL_MAX.w); nx = ox + (ow - nw) }

        if (edge.includes('s')) {nh = clamp(oh + dy, EDIT_PANEL_MIN.h, EDIT_PANEL_MAX.h)}

        if (edge.includes('n')) { nh = clamp(oh - dy, EDIT_PANEL_MIN.h, EDIT_PANEL_MAX.h); ny = oy + (oh - nh) }

        setPanelPersist(old => ({ ...old, x: clamp(nx, 20, window.innerWidth - nw - 20), y: clamp(ny, 80, window.innerHeight - nh - 20), w: nw, h: nh }))
      }
    }

    const onPointerUp = () => {
      if (dragRef.current?.kind === 'soul') {
        persistPositionsRef.current = true
        setDraggingSoulId('')
        try { window.localStorage.setItem(POSITIONS_KEY, JSON.stringify(positionsRef.current)) } catch { /* noop */ }
      }
      dragRef.current = null
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [activeId, authors, camera, mode, patchPositions, setCameraPersist, setPanelPersist, panel.x, panel.y, panel.w, panel.h])

  const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (isWheelBlockedTarget(event.target)) {return}
    event.preventDefault()
    const delta = event.deltaY

    if (event.shiftKey) {
      setCameraPersist({ x: camera.x - delta * 0.75, y: camera.y, scale: camera.scale })
      return
    }

    const before = screenToWorld(event.clientX, event.clientY, camera)
    const zoomFactor = Math.exp(-delta * 0.0012)
    const nextScale = clamp(camera.scale * zoomFactor, 0.15, 3.0)
    setCameraPersist({ scale: nextScale, x: event.clientX - before.x * nextScale, y: event.clientY - before.y * nextScale })
  }

  const activePos = active ? positions[active.id] || defaultPosition(authors.findIndex(a => a.id === active.id), authors.length) : { x: 0, y: 0 }
  const activeSoulSize = active ? displaySizeForSoul(active, true, mode) + 72 : 204
  const attributeGalaxy = useMemo(() => computeAttributeGalaxy(activePos, attributes, expandedGroupId, activeSoulSize), [activePos.x, activePos.y, attributes, expandedGroupId, activeSoulSize])

  const toggleMaximize = () => {
    setPanelPersist(old => {
      if (old.maximized && old.prevBounds) {
        return { ...old.prevBounds, maximized: false, prevBounds: undefined }
      }

      return {
        maximized: true,
        prevBounds: { x: old.x, y: old.y, w: old.w, h: old.h, maximized: false },
        x: 40, y: 80, w: window.innerWidth - 80, h: window.innerHeight - 180
      }
    })
  }

  const closePanel = () => {
    if (panelDirty) {
      setConfirmDialog({
        message: '有未保存的更改，确定关闭吗？',
        onConfirm: () => { setPanelDirty(false); setConfirmDialog(null); setMode(mode === 'attributeEdit' ? 'attributeView' : 'focused') }
      })
    } else {
      setMode(mode === 'attributeEdit' ? 'attributeView' : 'focused')
    }
  }

  const handleSoulContextMenu = (event: React.MouseEvent, author: SoulAuthor) => {
    event.preventDefault()
    event.stopPropagation()
    setActiveId(author.id)
    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, type: 'soul', targetId: author.id })
  }

  const handleAttributeContextMenu = (event: React.MouseEvent, attrId: AttributeId) => {
    event.preventDefault()
    event.stopPropagation()
    setActiveAttributeId(attrId)
    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, type: 'attribute', targetId: attrId })
  }

  const handleCanvasContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    if (isInteractiveTarget(event.target)) {return}
    event.preventDefault()
    const world = screenToWorld(event.clientX, event.clientY, camera)
    setContextMenu({ visible: true, x: event.clientX, y: event.clientY, type: 'canvas', targetId: null, world })
  }

  const refForActive = () => active ? sourceRef(active) : ''

  const copyActiveSoul = () => {
    if (!active) return
    setCopiedSoulRef(sourceRef(active))
    setContextMenu(prev => ({ ...prev, visible: false }))
    notify({ kind: 'success', title: '已复制 Soul', message: active.name })
  }

  const pasteSoulAtCanvas = async () => {
    if (!copiedSoulRef) return
    const world = contextMenu.world || screenToWorld(contextMenu.x, contextMenu.y, camera)
    setContextMenu(prev => ({ ...prev, visible: false }))
    setBusy('duplicate')
    try {
      const result = await api<{ author?: SoulAuthor }>(`/api/soul/authors/${encodeURIComponent(copiedSoulRef)}/duplicate`, 'POST', {})
      if (result.author?.id) {
        patchPositions(old => ({ ...old, [result.author!.id]: world }))
        setActiveId(result.author.id)
        setMode('focused')
      }
      await refreshAuthors()
      notify({ kind: 'success', title: '已粘贴 Soul', message: result.author?.name || '副本已创建' })
    } catch (error) {
      notifyError(error, '粘贴 Soul 失败')
    } finally {
      setBusy('')
    }
  }

  const runSoulAction = async (action: 'distill' | 'process' | 'export-skill' | 'duplicate' | 'archive' | 'impact' | 'delete') => {
    if (!active) return
    setContextMenu(prev => ({ ...prev, visible: false }))
    const ref = refForActive()
    try {
      if (action === 'delete') {
        setConfirmDialog({
          message: `确定删除 Soul「${active.name}」吗？这会删除它的派生资料和档案，但不会删除共享知识库。`,
          onConfirm: () => {
            setConfirmDialog(null)
            void api(`/api/soul/authors/${encodeURIComponent(ref)}/detail`, 'DELETE')
              .then(async () => { await refreshAuthors(); setMode('pool'); notify({ kind: 'success', title: 'Soul 已删除', message: active.name }) })
              .catch(error => notifyError(error, '删除 Soul 失败'))
          }
        })
        return
      }
      setBusy(action)
      if (action === 'distill') {
        await api(`/api/soul/authors/${encodeURIComponent(ref)}/distill`, 'POST', {})
        notify({ kind: 'success', title: '已提交蒸馏', message: 'Soul Profile 正在更新' })
      } else if (action === 'process') {
        await api(`/api/soul/authors/${encodeURIComponent(ref)}/process`, 'POST', {})
        notify({ kind: 'success', title: '已提交索引', message: '资料会进入解析、分块和索引流程' })
      } else if (action === 'export-skill') {
        const result = await api<{ skill_dir?: string }>(`/api/soul/authors/${encodeURIComponent(ref)}/export-skill`, 'POST', {})
        notify({ kind: 'success', title: '已导出 Soul Skill', message: result.skill_dir || '可在 Skill 库中查看和启用' })
      } else if (action === 'duplicate') {
        const result = await api<{ author?: SoulAuthor }>(`/api/soul/authors/${encodeURIComponent(ref)}/duplicate`, 'POST', {})
        if (result.author?.id) setActiveId(result.author.id)
        notify({ kind: 'success', title: '已复制 Soul', message: result.author?.name || active.name })
      } else if (action === 'archive') {
        await api(`/api/soul/authors/${encodeURIComponent(ref)}/archive`, 'POST', {})
        notify({ kind: 'success', title: 'Soul 已归档', message: active.name })
      } else if (action === 'impact') {
        const result = await api<{ message?: string; diff?: { added_attributes?: number; updated_at?: string } | null }>(`/api/soul/authors/${encodeURIComponent(ref)}/impact`, 'POST', {})
        setMessage(result.diff ? `影响分析：新增/变化属性 ${result.diff.added_attributes ?? 0} 项，更新时间 ${result.diff.updated_at || '未知'}` : (result.message || '暂无待审核变更，当前资料不会自动覆盖已有属性。'))
      }
      await refreshAuthors()
      await refreshDetail(active)
    } catch (error) {
      notifyError(error, action === 'impact' ? '操作失败' : 'Soul 操作失败')
    } finally {
      setBusy('')
    }
  }

  const distillAttribute = async (attrId: AttributeId) => {
    if (!active) return
    try {
      setBusy(`attribute-${attrId}`)
      await api(`/api/soul/authors/${encodeURIComponent(sourceRef(active))}/attributes/${encodeURIComponent(attrId)}/distill`, 'POST', {})
      await refreshDetail(active)
      notify({ kind: 'success', title: '属性蒸馏已提交', message: ATTRIBUTE_DEFS.find(d => d.id === attrId)?.label || attrId })
    } catch (error) {
      notifyError(error, '属性蒸馏失败')
    } finally {
      setBusy('')
    }
  }

  const viewAttributeEvidence = async (attrId: AttributeId) => {
    if (!active) return
    try {
      const result = await api<{ evidence?: Array<{ title?: string; snippet?: string; source_file?: string; source_url?: string }> }>(`/api/soul/authors/${encodeURIComponent(sourceRef(active))}/attributes/${encodeURIComponent(attrId)}/evidence`)
      const rows = result.evidence || []
      if (!rows.length) {
        setMessage('该属性暂无可定位证据，请先添加资料源并重新蒸馏。')
        return
      }
      setMessage(`证据 ${rows.length} 条：${rows.slice(0, 2).map(row => row.title || row.source_file || row.source_url || row.snippet || '证据').join('；')}`)
    } catch (error) {
      notifyError(error, '更新失败')
    }
  }

  const markAttributeRisk = async (attrId: AttributeId, risk: 'low' | 'medium' | 'high') => {
    if (!active) return
    try {
      await api(`/api/soul/authors/${encodeURIComponent(sourceRef(active))}/attributes/${encodeURIComponent(attrId)}`, 'PATCH', { risk_level: risk })
      await refreshDetail(active)
      notify({ kind: 'success', title: '风险等级已更新', message: risk === 'high' ? '已标记为高风险' : `已标记为${risk}` })
    } catch (error) {
      notifyError(error, '更新失败')
    }
  }

  const disableAttribute = async (attrId: AttributeId) => {
    if (!active) return
    try {
      await api(`/api/soul/authors/${encodeURIComponent(sourceRef(active))}/attributes/${encodeURIComponent(attrId)}/disable`, 'POST', {})
      await refreshDetail(active)
      notify({ kind: 'success', title: '属性已禁用', message: ATTRIBUTE_DEFS.find(d => d.id === attrId)?.label || attrId })
    } catch (error) {
      notifyError(error, '禁用属性失败')
    }
  }

  const centerCameraOn = (pos: BubblePosition, targetScale?: number) => {
    const s = targetScale ?? camera.scale
    setCameraPersist({ x: window.innerWidth / 2 - pos.x * s, y: window.innerHeight / 2 - pos.y * s, scale: s })
  }

  return (
    <div className="relative h-full min-h-[100dvh] overflow-hidden bg-[var(--theme-background-seed)] text-[var(--theme-foreground)] select-none">
      <style>{`
        @keyframes nebula-drift {
          0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.4; }
          50% { transform: translate(30px, -20px) scale(1.08); opacity: 0.55; }
        }
        @keyframes star-twinkle {
          0%, 100% { opacity: var(--base-opacity, 0.3); transform: scale(1); }
          50% { opacity: calc(var(--base-opacity, 0.3) * 2.5); transform: scale(1.3); }
        }
        @keyframes soul-float {
          0%, 100% { transform: translate(-50%, -50%) translateY(0px); }
          33% { transform: translate(-50%, -50%) translateY(-8px); }
          66% { transform: translate(-50%, -50%) translateY(4px); }
        }
        @keyframes soul-float-alt {
          0%, 100% { transform: translate(-50%, -50%) translateY(0px); }
          40% { transform: translate(-50%, -50%) translateY(6px); }
          70% { transform: translate(-50%, -50%) translateY(-5px); }
        }
        @keyframes breath-glow {
          0%, 100% { box-shadow: 0 0 60px var(--theme-primary), 0 0 120px var(--theme-primary); }
          50% { box-shadow: 0 0 90px var(--theme-primary), 0 0 180px var(--theme-primary); }
        }
        @keyframes risk-pulse-high {
          0%, 100% { box-shadow: 0 0 0 0 var(--dt-destructive), 0 0 60px var(--theme-primary); }
          50% { box-shadow: 0 0 0 12px var(--dt-destructive), 0 0 80px var(--dt-destructive); }
        }
        @keyframes stale-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes attribute-emerge {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes orbit-line-draw {
          from { stroke-dashoffset: 300; opacity: 0; }
          to { stroke-dashoffset: 0; opacity: 1; }
        }
        @keyframes panel-slide-in {
          from { opacity: 0; transform: translateX(40px) scale(0.96); }
          to { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes info-sheet-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ping-ring {
          0% { transform: scale(1); opacity: 0.5; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .soul-float { animation: soul-float var(--float-duration, 6s) ease-in-out infinite; animation-delay: var(--float-delay, 0s); }
        .soul-float-alt { animation: soul-float-alt var(--float-duration, 7s) ease-in-out infinite; animation-delay: var(--float-delay, 0s); }
        .breath-glow { animation: breath-glow 3.5s ease-in-out infinite; }
        .risk-pulse-high { animation: risk-pulse-high 2s ease-out infinite; }
        .stale-ring { animation: stale-spin 4s linear infinite; }
        .attribute-emerge { animation: attribute-emerge 0.5s cubic-bezier(0.22,1,0.36,1) both; }
        .panel-slide-in { animation: panel-slide-in 0.3s cubic-bezier(0.22,1,0.36,1) both; }
        .info-sheet-in { animation: info-sheet-in 0.22s cubic-bezier(0.22,1,0.36,1) both; }
        .reduce-motion * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
        .nebula-bg { background: radial-gradient(ellipse at 15% 20%, var(--theme-primary) 0%, transparent 45%), radial-gradient(ellipse at 85% 75%, var(--theme-accent-soft) 0%, transparent 40%); }
        .nebula-drift-1 { background: radial-gradient(circle, var(--theme-primary) 0%, transparent 60%); }
        .nebula-drift-2 { background: radial-gradient(circle, var(--theme-accent-soft) 0%, transparent 60%); }
        .grid-bg { background-image: radial-gradient(circle, var(--dt-border) 1px, transparent 1px); }
        .center-glow { box-shadow: 0 0 300px 120px var(--theme-primary), 0 0 600px 240px var(--theme-accent-soft); }
        .star { background-color: var(--theme-primary); }
        .bubble-shine { background: radial-gradient(circle at 50% 50%, rgba(255,255,255,.86) 0%, rgba(255,255,255,.55) 34%, transparent 58%), radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--theme-primary) 42%, transparent) 0%, transparent 46%), radial-gradient(circle at 50% 50%, rgba(255,255,255,.28) 0%, transparent 76%); }
        .soul-surface { background: radial-gradient(circle at 50% 50%, rgba(255,255,255,.98) 0%, rgba(255,255,255,.9) 45%, rgba(255,255,255,.72) 72%, rgba(255,255,255,.52) 100%); background-position: center; background-size: 100% 100%; }
        .attr-hover-shine { background: radial-gradient(circle at 30% 25%, rgba(255,255,255,.9) 0%, transparent 50%); }
        .orbit-line { stroke: url(#orbitGradient); }
        .attr-bubble { background-color: var(--theme-card-seed); border-color: var(--dt-border); box-shadow: 0 4px 20px var(--theme-primary); }
        .attr-bubble-selected { background-color: color-mix(in srgb, var(--theme-primary) 12%, transparent); border-color: var(--theme-primary); box-shadow: 0 0 60px var(--theme-primary); }
        .attr-bubble-hover:hover { box-shadow: 0 0 40px var(--theme-primary); }
      `}</style>

      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 nebula-bg" />
        <div className="absolute -left-1/4 -top-1/4 h-[150%] w-[150%] nebula-drift-1" style={{ animation: reduceMotion ? 'none' : 'nebula-drift 20s ease-in-out infinite' }} />
        <div className="absolute -right-1/4 -bottom-1/4 h-[150%] w-[150%] nebula-drift-2" style={{ animation: reduceMotion ? 'none' : 'nebula-drift 24s ease-in-out infinite reverse' }} />
        {stars.map(star => (
          <div className="absolute rounded-full star" key={star.id} style={{ left: `${star.x}%`, top: `${star.y}%`, width: star.size, height: star.size, opacity: star.opacity * 0.7, ['--base-opacity' as string]: star.opacity * 0.7, animation: reduceMotion ? 'none' : `star-twinkle ${star.duration}s ease-in-out infinite`, animationDelay: `${star.delay}s` }} />
        ))}
      </div>

      <Toolbar authors={authors} busy={busy} camera={camera} mode={mode} onCreate={() => setCreateOpen(true)} onRefresh={() => void refreshAuthors()} onResetView={() => centerCameraOn(activePos, 1)} onToggleMotion={() => setReduceMotion(!reduceMotion)} reduceMotion={reduceMotion} />

      {message ? (
        <div className="absolute left-1/2 top-24 z-40 -translate-x-1/2 rounded-full border border-[var(--theme-primary)]/30 bg-[var(--theme-card-seed)]/95 px-5 py-2.5 text-sm text-[var(--theme-foreground)] shadow-xl backdrop-blur-xl info-sheet-in">
          {message}
        </div>
      ) : null}

      <div
        className={`absolute inset-0 ${mode === 'pool' || mode === 'focused' ? 'cursor-grab' : ''} active:cursor-grabbing`}
        onClick={handleCanvasClick}
        onContextMenu={handleCanvasContextMenu}
        onPointerDown={onCanvasPointerDown}
        onWheel={onWheel}
        ref={canvasRef}
      >
        <div className="absolute left-0 top-0 origin-top-left" style={{ width: 1, height: 1, transform: `translate3d(${camera.x}px, ${camera.y}px, 0) scale(${camera.scale})`, transition: dragRef.current?.moved ? 'none' : 'transform 0.5s cubic-bezier(0.22,1,0.36,1)' }}>
          <div className="absolute h-[8000px] w-[8000px] -left-[4000px] -top-[4000px] opacity-40 grid-bg" style={{ backgroundSize: '80px 80px' }} />
          <div className="absolute left-0 top-0 h-[2px] w-[2px] rounded-full center-glow" />

          {authors.length === 0 ? <EmptySoulBubble onCreate={() => setCreateOpen(true)} reduceMotion={reduceMotion} /> : null}

          {authors.map((author, index) => {
            const pos = positions[author.id] || defaultPosition(index, authors.length)
            const focused = author.id === activeId
            const isNotFocused = active && mode !== 'pool' && !focused
            const dist = focused ? 0 : Math.sqrt(Math.pow(pos.x - activePos.x, 2) + Math.pow(pos.y - activePos.y, 2))
            const opacity = isNotFocused ? clamp(1 - dist / 1200, 0.15, 0.5) : 1
            const scale = isNotFocused ? clamp(1 - dist / 2500, 0.5, 0.85) : 1

            return (
              <SoulBubble
                author={author}
                floatIndex={index}
                focused={focused}
                isDragging={draggingSoulId === author.id}
                key={author.id}
                mode={mode}
                onClick={() => focusSoul(author)}
                onContextMenu={event => handleSoulContextMenu(event, author)}
                onDoubleClick={() => expandSoul(author)}
                onPointerDown={event => onSoulPointerDown(event, author)}
                opacity={opacity}
                position={focused && mode !== 'pool' ? activePos : pos}
                reduceMotion={reduceMotion}
                scale={scale}
                volume={volumeForSoul(author)}
                volumeLabel={volumeLabel(author)}
              />
            )
          })}

          {active && mode === 'expanded' ? (
            <AttributeOrbit
              activeAttributeId={activeAttributeId}
              activePos={activePos}
              childNodes={attributeGalaxy.childNodes}
              dragging={draggingSoulId === active.id}
              groups={attributeGalaxy.groups}
              onAttributeClick={attribute => { setActiveAttributeId(attribute.id); setMode('attributeView') }}
              onAttributeContextMenu={handleAttributeContextMenu}
              onAttributeEdit={attribute => { setActiveAttributeId(attribute.id); setMode('attributeEdit') }}
              onGroupToggle={groupId => setExpandedGroupId(current => current === groupId ? '' : groupId)}
              reduceMotion={reduceMotion}
            />
          ) : null}
        </div>
      </div>

      <StatusRail active={active} detail={detail} mode={mode} timelineExpanded={timelineExpanded} />

      <HintBar mode={mode} timelineExpanded={timelineExpanded} />

      {activeAttribute && mode === 'attributeView' ? (
        <FloatingInfoSheet
          attribute={activeAttribute}
          onClose={() => { setActiveAttributeId(''); setMode('expanded') }}
          onEdit={() => setMode('attributeEdit')}
          onRedistill={() => void distillAttribute(activeAttribute.id)}
          onViewEvidence={() => void viewAttributeEvidence(activeAttribute.id)}
        />
      ) : null}

      {(mode === 'attributeEdit' || mode === 'soulEdit' || mode === 'sourceManage') && active ? (
        <EditPanel
          active={active}
          catalog={catalog}
          attribute={activeAttribute}
          detail={detail}
          dirty={panelDirty}
          knowledgeUsage={knowledgeUsage}
          mode={mode}
          onClose={closePanel}
          onDragStart={onPanelDragStart}
          onGoverned={async () => { await refreshDetail(active); await refreshAuthors() }}
          onResizeStart={onResizeStart}
          onSaved={async () => { setPanelDirty(false); await refreshAuthors(); await refreshDetail(active) }}
          onToggleMax={toggleMaximize}
          panel={panel}
          setDirty={setPanelDirty}
        />
      ) : null}

      {createOpen ? (
        <CreateSoulDialog
          busy={busy === 'create'}
          description={newSoulDesc}
          inputRef={createInputRef}
          name={newSoulName}
          onClose={() => setCreateOpen(false)}
          onCreate={() => void createSoul()}
          setDescription={setNewSoulDesc}
          setName={setNewSoulName}
        />
      ) : null}

      {contextMenu.visible ? (
        <ContextMenu
          onArchiveSoul={() => void runSoulAction('archive')}
          onCopySoul={copyActiveSoul}
          onDelete={() => { if (contextMenu.type === 'attribute' && contextMenu.targetId) { void disableAttribute(contextMenu.targetId as AttributeId); setContextMenu(prev => ({ ...prev, visible: false })) } else { void runSoulAction('delete') } }}
          onDuplicateSoul={() => void runSoulAction('duplicate')}
          onEditAttribute={() => { setContextMenu(prev => ({ ...prev, visible: false })); setMode('attributeEdit') }}
          onEditSoul={() => { setContextMenu(prev => ({ ...prev, visible: false })); setMode('soulEdit') }}
          onExportSkill={() => void runSoulAction('export-skill')}
          onImpact={() => void runSoulAction('impact')}
          onManageSources={() => { setContextMenu(prev => ({ ...prev, visible: false })); setPanelPersist(old => ({ ...old, x: Math.max(24, window.innerWidth - Math.min(940, window.innerWidth - 48) - 24), y: 88, w: Math.min(940, window.innerWidth - 48), h: Math.min(820, window.innerHeight - 112) })); setMode('sourceManage') }}
          onMarkHighRisk={() => { if (contextMenu.targetId) void markAttributeRisk(contextMenu.targetId as AttributeId, 'high'); setContextMenu(prev => ({ ...prev, visible: false })) }}
          onPasteSoul={() => void pasteSoulAtCanvas()}
          onRedistill={() => { if (contextMenu.type === 'attribute' && contextMenu.targetId) void distillAttribute(contextMenu.targetId as AttributeId); else void runSoulAction('distill'); setContextMenu(prev => ({ ...prev, visible: false })) }}
          onReindex={() => void runSoulAction('process')}
          onViewAttribute={() => { setContextMenu(prev => ({ ...prev, visible: false })); setMode('attributeView') }}
          onViewEvidence={() => { if (contextMenu.targetId) void viewAttributeEvidence(contextMenu.targetId as AttributeId); setContextMenu(prev => ({ ...prev, visible: false })) }}
          type={contextMenu.type}
          x={contextMenu.x}
          y={contextMenu.y}
        />
      ) : null}

      {confirmDialog ? (
        <ConfirmDialog
          message={confirmDialog.message}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={() => confirmDialog.onConfirm()}
        />
      ) : null}

      <TimelineDock
        events={timelineEvents}
        expanded={timelineExpanded}
        onToggle={() => setTimelineExpanded(!timelineExpanded)}
      />

      <Minimap
        activeId={activeId}
        attributeNodes={mode === 'expanded' ? attributeGalaxy.childNodes : []}
        authors={authors}
        camera={camera}
        groupNodes={mode === 'expanded' ? attributeGalaxy.groups : []}
        onNavigate={pos => centerCameraOn(pos)}
        positions={positions}
        timelineExpanded={timelineExpanded}
      />
    </div>
  )
}

function screenToWorld(x: number, y: number, camera: Camera): BubblePosition { return { x: (x - camera.x) / camera.scale, y: (y - camera.y) / camera.scale } }

function Toolbar({ authors, busy, camera, mode, reduceMotion, onCreate, onRefresh, onResetView, onToggleMotion }: { authors: SoulAuthor[]; busy: string; camera: Camera; mode: ViewMode; reduceMotion: boolean; onCreate: () => void; onRefresh: () => void; onResetView: () => void; onToggleMotion: () => void }) {
  return (
    <header className="absolute left-5 right-5 top-5 z-30 flex items-center justify-between gap-4 rounded-3xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/80 px-6 py-4 shadow-xl backdrop-blur-2xl">
      <div>
        <div className="text-[0.6rem] uppercase tracking-[0.32em] text-[var(--theme-foreground)]/60">Karna · Soul Nebula · {mode}</div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight bg-gradient-to-r from-[var(--theme-primary)] via-[var(--theme-accent-soft)] to-[var(--theme-primary)] bg-clip-text text-transparent">Soul工坊</h1>
        <p className="mt-1 text-xs text-[var(--theme-foreground)]/60">无界泡泡工作台 · 点击 Soul 聚焦，展开属性，左键查看，编辑需确认</p>
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full border border-[var(--dt-border)] bg-[var(--theme-secondary)]/50 px-3 py-1.5 text-xs text-[var(--theme-foreground)]">{authors.length} Souls</span>
        <span className="rounded-full border border-[var(--dt-border)] bg-[var(--theme-secondary)]/50 px-3 py-1.5 text-xs text-[var(--theme-foreground)]">{Math.round(camera.scale * 100)}%</span>
        <Button className="flex items-center gap-1" onClick={onToggleMotion} size="sm" title={reduceMotion ? '开启动效' : '关闭动效'} variant="ghost"><Codicon name={reduceMotion ? 'eye-closed' : 'eye'} size={14} />{reduceMotion ? '动效关' : '动效开'}</Button>
        <Button onClick={onResetView} size="sm" variant="ghost">重置视图</Button>
        <Button disabled={busy === 'refresh'} onClick={onRefresh} size="sm" variant="ghost">刷新</Button>
        <Button className={primaryButtonClass()} onClick={onCreate} size="sm">+ 新建 Soul</Button>
      </div>
    </header>
  )
}

function SoulBubble({ author, focused, mode, opacity, scale, floatIndex, isDragging, reduceMotion, onClick, onDoubleClick, onContextMenu, onPointerDown, position, volume, volumeLabel }: { author: SoulAuthor; focused: boolean; mode: ViewMode; opacity: number; scale: number; floatIndex: number; isDragging: boolean; reduceMotion: boolean; onClick: () => void; onDoubleClick: () => void; onContextMenu: (event: React.MouseEvent) => void; onPointerDown: (event: ReactPointerEvent) => void; position: BubblePosition; volume: number; volumeLabel: string }) {
  const size = displaySizeForSoul(author, focused, mode)
  const riskHigh = author.risk_level === 'high'
  const isStale = author.status === 'stale'
  const isError = author.status === 'error'
  const isDraft = author.status === 'draft'
  const floatDuration = 5.5 + (floatIndex % 7) * 0.4
  const floatDelay = (floatIndex * 0.7) % 5

  return (
    <button
      className={`group absolute rounded-full soul-surface border-2 text-center cursor-grab active:cursor-grabbing hover:scale-[1.08] ${isDragging ? 'transition-none' : 'transition-all duration-500'} ${reduceMotion || isDragging || focused ? '' : floatIndex % 2 === 0 ? 'soul-float' : 'soul-float-alt'} ${focused ? 'border-[var(--theme-primary)]/70' : isError ? 'border-[var(--dt-destructive)]/40 hover:border-[var(--dt-destructive)]/60' : isStale ? 'border-[var(--theme-secondary)]/50 hover:border-[var(--theme-secondary)]/70' : isDraft ? 'border-[var(--theme-primary)]/40' : riskHigh ? 'border-[var(--dt-destructive)]/40 hover:border-[var(--dt-destructive)]/60' : 'border-[var(--dt-border)]'} ${focused ? (reduceMotion || isDragging ? '' : 'breath-glow') : ''}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      style={{
        left: position.x,
        top: position.y,
        width: size,
        height: size,
        opacity,
        transform: `translate(-50%, -50%) scale(${scale})`,
        zIndex: focused ? 30 : 20,
        background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,.98) 0%, rgba(255,255,255,.9) 45%, rgba(255,255,255,.72) 72%, rgba(255,255,255,.52) 100%)',
        backgroundPosition: 'center',
        backgroundSize: '100% 100%',
        ['--float-duration' as string]: `${floatDuration}s`,
        ['--float-delay' as string]: `${floatDelay}s`,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
      type="button"
    >
      {focused && !reduceMotion && (
        <>
          <span className="absolute inset-0 rounded-full border border-[var(--theme-primary)]/30" style={{ animation: 'ping-ring 2.5s ease-out infinite' }} />
          <span className="absolute inset-0 rounded-full border border-[var(--theme-primary)]/20" style={{ animation: 'ping-ring 2.5s ease-out infinite', animationDelay: '0.8s' }} />
          <span className="absolute inset-0 rounded-full border border-[var(--theme-primary)]/10" style={{ animation: 'ping-ring 2.5s ease-out infinite', animationDelay: '1.6s' }} />
        </>
      )}
      {isDraft && (
        <span className="absolute inset-[-6px] rounded-full border-2 border-dashed border-[var(--theme-primary)]/50 stale-ring" />
      )}
      {isStale && (
        <span className="absolute inset-[-4px] rounded-full border-2 border-dashed border-[var(--theme-secondary)]/50 stale-ring" />
      )}
      {riskHigh && !focused && !reduceMotion && (
        <span className="absolute inset-[-3px] rounded-full border border-[var(--dt-destructive)]/50 risk-pulse-high" />
      )}
      <span className="relative z-10 flex h-full flex-col items-center justify-center px-5">
        <span className="block max-w-[12rem] text-balance font-semibold leading-tight text-[var(--theme-foreground)]" style={{ fontSize: focused ? 17 : 14 }}>{author.name}</span>
        <span className="mt-2.5 h-1.5 w-16 overflow-hidden rounded-full bg-[var(--dt-border)]">
          <span
            className={`block h-full rounded-full shadow-lg ${riskHigh ? 'bg-gradient-to-r from-[var(--dt-destructive)] to-[var(--dt-destructive)]/70' : isStale ? 'bg-gradient-to-r from-[var(--theme-secondary)] to-[var(--theme-secondary)]/70' : 'bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-accent-soft)]'}`}
            style={{ width: `${clamp(((author.completeness || (volume - 100) / 140) * 100), 15, 100)}%` }}
          />
        </span>
        {focused ? (
          <span className="mt-2.5 text-[0.65rem] text-[var(--theme-foreground)]/80 font-medium tracking-wide">{volumeLabel} · 双击展开属性</span>
        ) : (
          <span className="mt-2 text-[0.55rem] text-[var(--theme-foreground)]/60 font-medium opacity-0 group-hover:opacity-100 transition-opacity duration-300">点击聚焦 · 双击展开</span>
        )}
        {author.description && focused ? (
          <span className="mt-1 max-w-[14rem] text-[0.65rem] text-[var(--theme-foreground)]/70 line-clamp-2 leading-relaxed">{author.description}</span>
        ) : null}
      </span>
    </button>
  )
}

function EmptySoulBubble({ onCreate, reduceMotion }: { onCreate: () => void; reduceMotion: boolean }) {
  return (
    <button
      className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-dashed border-[var(--theme-primary)]/30 bg-[var(--theme-card-seed)]/60 text-center transition-all hover:border-[var(--theme-primary)]/50 hover:bg-[var(--theme-card-seed)]/80 hover:scale-105 cursor-pointer"
      onClick={onCreate}
      type="button"
    >
      {!reduceMotion && <span className="absolute inset-0 rounded-full border border-[var(--theme-primary)]/20" style={{ animation: 'ping-ring 3s ease-out infinite' }} />}
      <span className="relative z-10 flex h-full flex-col items-center justify-center">
        <Codicon className="mb-3 text-[var(--theme-primary)]" name="sparkle" size={48} />
        <span className="block text-lg font-semibold text-[var(--theme-foreground)]">创建第一个 Soul</span>
        <span className="mx-auto mt-3 block max-w-[16rem] text-xs leading-5 text-[var(--theme-foreground)]/70">Soul 是可迁移的创作方法档案，从资料和证据中蒸馏叙事方法、人物处理和批评视角。</span>
      </span>
    </button>
  )
}

function AttributeOrbit({ activePos, activeAttributeId, childNodes, dragging, groups, reduceMotion, onGroupToggle, onAttributeClick, onAttributeContextMenu, onAttributeEdit }: { activePos: BubblePosition; activeAttributeId: string; childNodes: GalaxyAttributeNode[]; dragging: boolean; groups: GalaxyGroupNode[]; reduceMotion: boolean; onGroupToggle: (groupId: AttributeGroupId) => void; onAttributeClick: (attribute: AttributeBubble) => void; onAttributeContextMenu: (event: React.MouseEvent, id: AttributeId) => void; onAttributeEdit: (attribute: AttributeBubble) => void }) {
  return (
    <>
      <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" height="1" style={{ transform: `translate(${activePos.x}px, ${activePos.y}px)` }} width="1">
        <defs>
          <radialGradient id="orbitGradient">
            <stop offset="0%" stopColor="var(--theme-primary)" />
            <stop offset="100%" stopColor="var(--dt-border)" />
          </radialGradient>
        </defs>
        {groups.map((group, i) => {
          const groupX = group.x - activePos.x
          const groupY = group.y - activePos.y
          return <line className="orbit-line" key={`group-line-${group.id}`} strokeDasharray="10 10" strokeWidth="2" style={{ animation: reduceMotion || dragging ? 'none' : 'orbit-line-draw 0.55s ease-out forwards', animationDelay: `${i * 60}ms`, opacity: dragging ? 0.55 : 0 }} x1="0" x2={groupX} y1="0" y2={groupY} />
        })}
        {childNodes.map((node, index) => {
          const group = groups.find(item => item.id === node.groupId)
          if (!group) {return null}
          return <line className="orbit-line" key={`attr-line-${node.groupId}-${node.id}`} strokeDasharray="5 8" strokeWidth="1.3" style={{ animation: reduceMotion || dragging ? 'none' : 'orbit-line-draw 0.45s ease-out forwards', animationDelay: `${index * 50 + 120}ms`, opacity: dragging ? 0.45 : 0 }} x1={group.x - activePos.x} x2={node.x - activePos.x} y1={group.y - activePos.y} y2={node.y - activePos.y} />
        })}
      </svg>

      {groups.map((group, i) => {
        const statusVar = group.risk === 'high' ? 'var(--dt-destructive)' : group.risk === 'medium' ? 'var(--theme-secondary)' : 'var(--theme-primary)'
        return (
          <button
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 text-center hover:scale-105 cursor-pointer group attr-bubble-hover ${dragging ? 'transition-none' : 'transition-all duration-300'} ${group.expanded ? 'attr-bubble-selected' : 'attr-bubble'}`}
            key={group.id}
            onClick={event => { event.stopPropagation(); onGroupToggle(group.id) }}
            style={{ left: group.x, top: group.y, width: group.size, height: group.size, borderColor: group.expanded ? undefined : `color-mix(in srgb, ${statusVar} 35%, transparent)`, animationDelay: `${i * 45}ms`, zIndex: group.expanded ? 24 : 18 }}
            type="button"
          >
            <span className="absolute inset-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 attr-hover-shine" />
            <span className="relative z-10 flex h-full flex-col items-center justify-center px-3">
              <Codicon className="mb-1" name={group.icon} size={22} />
              <span className="block text-sm font-semibold leading-tight text-[var(--theme-foreground)]">{group.label}</span>
              <span className="mt-1 rounded-full px-2 py-0.5 text-[0.62rem]" style={{ color: statusVar, backgroundColor: `color-mix(in srgb, ${statusVar} 12%, transparent)` }}>{group.readyCount}/{group.childCount} 项 · {group.volume} 条</span>
              <span className="mt-1 text-[0.5rem] text-[var(--theme-foreground)]/50">{group.expanded ? '已展开' : '点击展开'}</span>
            </span>
          </button>
        )
      })}

      {childNodes.map((node, i) => {
        const attr = node.attribute
        const isSelected = activeAttributeId === attr.id
        const isError = attr.status === 'error' || (attr.status === 'ready' && attr.riskLevel === 'high')
        const isWarning = attr.status === 'stale' || (attr.status === 'ready' && attr.riskLevel === 'medium')
        const isIndexing = attr.status === 'indexing'
        const isEmpty = attr.status === 'empty'
        const def = ATTRIBUTE_DEFS.find(d => d.id === attr.id)!
        const statusVar = isError ? 'var(--dt-destructive)' : isWarning ? 'var(--theme-secondary)' : isIndexing ? 'var(--theme-accent-soft)' : isEmpty ? 'var(--dt-border)' : 'var(--theme-primary)'
        return (
          <button
            className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 text-center hover:scale-110 cursor-pointer attribute-emerge group attr-bubble-hover ${dragging ? 'transition-none' : 'transition-all duration-300'} ${isSelected ? 'border-[var(--theme-primary)]/80 attr-bubble-selected scale-110' : 'attr-bubble'}`}
            key={attr.id}
            onClick={event => { event.stopPropagation(); onAttributeClick(attr) }}
            onContextMenu={event => onAttributeContextMenu(event, attr.id)}
            onDoubleClick={event => { event.stopPropagation(); onAttributeEdit(attr) }}
            style={{ left: node.x, top: node.y, width: node.size, height: node.size, borderColor: isSelected ? undefined : `color-mix(in srgb, ${statusVar} 35%, transparent)`, boxShadow: isSelected ? undefined : `0 4px 20px color-mix(in srgb, ${statusVar} 15%, transparent)`, animationDelay: `${i * 50 + 120}ms`, zIndex: isSelected ? 28 : 22, userSelect: 'none', WebkitUserSelect: 'none' }}
            type="button"
          >
            {attr.status === 'indexing' && !reduceMotion ? <span className="absolute inset-[-4px] rounded-full border-2 border-dashed border-[var(--theme-primary)]/50 stale-ring" /> : null}
            {attr.status === 'stale' && !reduceMotion ? <span className="absolute inset-[-3px] rounded-full border border-dashed border-[var(--theme-secondary)]/50 stale-ring" /> : null}
            <span className="absolute inset-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 attr-hover-shine" />
            <span className="relative z-10 flex h-full flex-col items-center justify-center px-2">
              <Codicon className="mb-0.5" name={def.icon} size={20} />
              <span className="block text-xs font-semibold text-[var(--theme-foreground)] leading-tight">{attr.label}</span>
              <span className="mt-1 rounded-full px-2 py-0.5 text-[0.6rem] font-medium" style={{ color: statusVar, backgroundColor: `color-mix(in srgb, ${statusVar} 12%, transparent)` }}>{attr.status === 'ready' ? `${attr.volume} 条 · ${Math.round(attr.confidence * 100)}%` : attr.status === 'stale' ? '需更新' : attr.status === 'indexing' ? '索引中' : attr.status === 'error' ? '异常' : '未配置'}</span>
              <span className="mt-1 text-[0.5rem] text-[var(--theme-foreground)]/50 opacity-0 group-hover:opacity-100 transition-opacity duration-200">单击查看 · 双击编辑</span>
            </span>
          </button>
        )
      })}
    </>
  )
}

function FloatingInfoSheet({ attribute, onClose, onEdit, onViewEvidence, onRedistill }: { attribute: AttributeBubble; onClose: () => void; onEdit: () => void; onViewEvidence: () => void; onRedistill: () => void }) {
  const confidencePct = Math.round(attribute.confidence * 100)
  const riskColors = { low: 'text-[var(--theme-primary)] bg-[var(--theme-primary)]/10 border-[var(--theme-primary)]/30', medium: 'text-[var(--theme-secondary)] bg-[var(--theme-secondary)]/10 border-[var(--theme-secondary)]/30', high: 'text-[var(--dt-destructive)] bg-[var(--dt-destructive)]/10 border-[var(--dt-destructive)]/30' }
  const riskLabels = { low: '低风险', medium: '中风险', high: '高风险' }

  return (
    <aside className="absolute right-8 top-32 z-40 w-[26rem] rounded-2xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/95 p-5 shadow-xl backdrop-blur-2xl info-sheet-in" data-panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[0.6rem] uppercase tracking-widest text-[var(--theme-foreground)]/60">只读属性摘要</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--theme-foreground)]">{attribute.label}</h2>
        </div>
        <Button aria-label="close" className="h-8 w-8 text-lg text-[var(--theme-foreground)]/60" onClick={onClose} size="icon-xs" variant="ghost">×</Button>
      </div>

      <p className="mt-4 text-sm leading-6 text-[var(--theme-foreground)]/80">{attribute.summary}</p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-[var(--theme-card-seed)]/60 p-2.5 text-center">
          <div className="text-[0.55rem] uppercase tracking-wider text-[var(--theme-foreground)]/60">观点</div>
          <div className="text-lg font-semibold text-[var(--theme-primary)]">{attribute.claimCount}</div>
        </div>
        <div className="rounded-xl bg-[var(--theme-card-seed)]/60 p-2.5 text-center">
          <div className="text-[0.55rem] uppercase tracking-wider text-[var(--theme-foreground)]/60">证据</div>
          <div className="text-lg font-semibold text-[var(--theme-primary)]">{attribute.evidenceCount}</div>
        </div>
        <div className="rounded-xl bg-[var(--theme-card-seed)]/60 p-2.5 text-center">
          <div className="text-[0.55rem] uppercase tracking-wider text-[var(--theme-foreground)]/60">置信度</div>
          <div className="text-lg font-semibold text-[var(--theme-primary)]">{confidencePct}%</div>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[0.65rem] font-medium ${riskColors[attribute.riskLevel]}`}>
          {riskLabels[attribute.riskLevel]}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[0.6rem] font-medium text-amber-600 dark:text-amber-400 border border-amber-500/25">
          <Codicon name="tools" size={10} />
          引用证据可查看
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-[var(--theme-foreground)]/10 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-accent-soft)]" style={{ width: `${confidencePct}%` }} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {attribute.tags.map(tag => (
          <span className="rounded-full bg-[var(--theme-card-seed)]/60 px-2.5 py-1 text-[0.65rem] text-[var(--theme-foreground)]/80 border border-[var(--dt-border)]" key={tag}>#{tag}</span>
        ))}
      </div>

      <div className="mt-5 flex gap-2">
        <Button className={primaryButtonClass()} onClick={onEdit} size="sm">编辑</Button>
        <Button className="text-[var(--theme-foreground)]/80" onClick={onViewEvidence} size="sm" variant="ghost">证据</Button>
        <Button className="text-[var(--theme-foreground)]/80" onClick={onRedistill} size="sm" variant="ghost">蒸馏</Button>
      </div>
    </aside>
  )
}

function WebResearchEvidence({ queries, sources }: { queries: SoulWebQuery[]; sources: SoulWebSource[] }) {
  const degraded = queries.filter(query => query.status === 'degraded')

  return (
    <section aria-label="Web research evidence" className="rounded-xl border border-[var(--dt-border)] bg-[var(--dt-muted)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-[var(--theme-foreground)]"><Codicon name="globe" size={14} />网络检索证据</h3>
        <span className="text-xs text-[var(--theme-foreground)]/60">{sources.length} 个来源 / {degraded.length} 个降级查询</span>
      </div>
      {degraded.length ? <div className="mt-3 grid gap-1.5">{degraded.slice(0, 5).map((query, index) => <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300" key={`${query.query}-${index}`}>{query.query}: {query.message || '检索未返回可用结果，已安全跳过。'}</p>)}</div> : null}
      {sources.length ? <div className="mt-3 grid gap-2">{sources.slice(0, 12).map((source, index) => <div className="rounded-lg bg-[var(--theme-card-seed)]/60 px-3 py-2" key={source.id || `${source.url}-${index}`}>
        <div className="flex items-start justify-between gap-3">
          {source.url ? <a className="min-w-0 truncate text-xs font-medium text-[var(--theme-primary)] underline-offset-2 hover:underline" href={source.url} rel="noreferrer" target="_blank">{source.title || source.url}</a> : <span className="truncate text-xs font-medium">{source.title || '未命名来源'}</span>}
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[0.65rem]', source.authority_status === 'failed' ? 'bg-red-500/12 text-red-600' : 'bg-emerald-500/12 text-emerald-600')}>{source.authority_status === 'failed' ? '权威校验未通过' : '权威校验通过'}</span>
        </div>
        <p className="mt-1 text-[0.68rem] text-[var(--theme-foreground)]/75">可信度 {Math.round((source.credibility || 0) * 100)}% · {source.authority_reason || (source.copyright_risk === 'high' ? '版权高风险，禁止提取观点' : '版权风险较低')}{source.saved_at ? ` · ${new Date(source.saved_at).toLocaleString()}` : ''}</p>
        {source.summary ? <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--theme-foreground)]/80">{source.summary}</p> : null}
      </div>)}</div> : <p className="mt-3 text-xs text-[var(--theme-foreground)]/60">尚无网络来源；系统不会把检索失败伪装成证据。</p>}
    </section>
  )
}

function CitationEvidence({ citations }: { citations: NonNullable<SoulDetail['citations']> }) {
  if (citations.length === 0) {
    return <div className="rounded-xl border border-dashed border-[var(--dt-border)] px-3 py-2 text-xs text-[var(--theme-foreground)]/60">No citation evidence has been generated for this Soul yet.</div>
  }

  return (
    <section aria-label="Citation evidence" className="rounded-xl border border-[var(--dt-border)] bg-[var(--dt-muted)] p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[var(--theme-foreground)]"><Codicon name="references" size={14} />Citation evidence ({citations.length})</h3>
      <div className="grid gap-2">
        {citations.slice(0, 12).map((citation, index) => {
          const label = citation.title || citation.source_file || citation.source_url || citation.ref || `Evidence ${index + 1}`
          const meta = [citation.source_file, citation.line_start ? `line ${citation.line_start}` : ''].filter(Boolean).join(' / ')
          
          return <div className="rounded-lg bg-[var(--theme-card-seed)]/60 px-3 py-2" key={`${citation.ref || label}-${index}`}>
            {citation.source_url ? <a className="block truncate text-xs font-medium text-[var(--theme-primary)] underline-offset-2 hover:underline" href={citation.source_url} rel="noreferrer" target="_blank">{label}</a> : <p className="truncate text-xs font-medium text-[var(--theme-foreground)]">{label}</p>}
            {meta ? <p className="mt-1 truncate text-[0.68rem] text-[var(--theme-foreground)]/60">{meta}</p> : null}
          </div>
        })}
      </div>
    </section>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {return `${bytes} B`}

  if (bytes < 1024 ** 2) {return `${(bytes / 1024).toFixed(1)} KB`}

  if (bytes < 1024 ** 3) {return `${(bytes / 1024 ** 2).toFixed(1)} MB`}

  return `${(bytes / 1024 ** 3).toFixed(1)} GB`
}

function KnowledgeUsageSummary({ usage }: { usage: KnowledgeUsage | null }) {
  return (
    <section aria-label="Knowledge storage usage" className="rounded-xl border border-[var(--dt-border)] bg-[var(--dt-muted)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-[var(--theme-foreground)]"><Codicon name="database" size={14} />知识库存储占用</h3>
        <span className="text-xs font-medium text-[var(--theme-primary)]">{usage ? `${formatBytes(usage.bytes)} / ${usage.files} 个文件` : '正在统计…'}</span>
      </div>
      {usage?.folders.length ? <div className="mt-3 grid gap-1.5">{usage.folders.map(folder => <div className="flex items-center justify-between gap-3 text-xs text-[var(--theme-foreground)]/65" key={folder.folder}><span className="min-w-0 truncate" title={folder.folder}>{folder.folder}</span><span className="shrink-0">{formatBytes(folder.bytes)}</span></div>)}</div> : null}
    </section>
  )
}

function EditPanel({ active, catalog, attribute, detail, mode, panel, dirty, knowledgeUsage, setDirty, onClose, onDragStart, onGoverned, onResizeStart, onToggleMax, onSaved }: { active: SoulAuthor; catalog: SoulCatalog; attribute: AttributeBubble | null; detail: SoulDetail | null; mode: ViewMode; panel: PanelState; dirty: boolean; knowledgeUsage: KnowledgeUsage | null; setDirty: (v: boolean) => void; onClose: () => void; onDragStart: (event: ReactPointerEvent) => void; onGoverned: () => Promise<void>; onResizeStart: (event: ReactPointerEvent, edge: ResizeEdge) => void; onToggleMax: () => void; onSaved: () => Promise<void> }) {
  const title = mode === 'sourceManage' ? '资料源管理' : mode === 'soulEdit' ? 'Soul 编辑' : `${attribute?.label || '属性'} 编辑`
  const subtitle = mode === 'sourceManage' ? '连接向量库、Wiki、文件夹、网页链接等' : mode === 'soulEdit' ? '编辑 Soul 基本信息和设置' : '修改属性摘要、标签和观点'
  const titleIcon = mode === 'sourceManage' ? 'library' : mode === 'soulEdit' ? 'edit' : 'book'

  const presets = catalog.identity_presets?.length ? catalog.identity_presets : [
    { id: 'literary_author', label: '作者 / 作家', kind: 'person', default_domain: 'literature' },
    { id: 'screenwriter_director', label: '编剧/导演', kind: 'person', default_domain: 'film-theater' },
    { id: 'game_narrative_designer', label: '游戏叙事设计师', kind: 'person', default_domain: 'games-interactive' },
    { id: 'brand_ad_copywriter', label: '品牌/广告/电商文案', kind: 'person', default_domain: 'marketing-brand' },
    { id: 'journalist_editor', label: '记者/编辑/出版工作者', kind: 'editorial_role', default_domain: 'news-publishing' },
    { id: 'technical_writer', label: '技术写作者', kind: 'person', default_domain: 'technical-docs' },
    { id: 'custom_method', label: '自定义方法源', kind: 'method', default_domain: 'literature' }
  ]
  const initialRoleId = active.identity?.role_id || active.type || 'custom_method'
  const [soulName, setSoulName] = useState(active.name)
  const [soulDescription, setSoulDescription] = useState(active.description || '')
  const [soulRoleId, setSoulRoleId] = useState(initialRoleId)
  const [riskStrategy, setRiskStrategy] = useState(active.risk_strategy || 'balanced')
  const [attributeSummary, setAttributeSummary] = useState(attribute?.summary || '')
  const [attributeConfidence, setAttributeConfidence] = useState(Math.round((attribute?.confidence || 0.5) * 100))
  const [attributeRisk, setAttributeRisk] = useState<'low' | 'medium' | 'high'>(attribute?.riskLevel || 'low')
  const [attributeTags, setAttributeTags] = useState(attribute?.tags.join(', ') || '')
  const [kbRetention, setKbRetention] = useState(String(detail?.governance?.retention_days || 30))
  const [urlInput, setUrlInput] = useState('')
  const [webResearchInput, setWebResearchInput] = useState('')
  const [knowledgeLibraries, setKnowledgeLibraries] = useState<Array<{ id: string; name: string }>>([])
  const [selectedLibraryId, setSelectedLibraryId] = useState('')
  useEffect(() => {
    setSoulName(active.name)
    setSoulDescription(active.description || '')
    setSoulRoleId(active.identity?.role_id || active.type || 'custom_method')
    setRiskStrategy(active.risk_strategy || 'balanced')
  }, [active.id, active.name, active.description, active.type, active.identity?.role_id, active.risk_strategy])
  useEffect(() => {
    setAttributeSummary(attribute?.summary || '')
    setAttributeConfidence(Math.round((attribute?.confidence || 0.5) * 100))
    setAttributeRisk(attribute?.riskLevel || 'low')
    setAttributeTags(attribute?.tags.join(', ') || '')
  }, [attribute?.id, attribute?.summary, attribute?.confidence, attribute?.riskLevel, attribute?.tags])

  useEffect(() => {
    if (mode !== 'sourceManage') return
    void api<{ libraries?: Array<{ id: string; name: string }> }>('/api/knowledge')
      .then(store => {
        const rows = store.libraries || []
        setKnowledgeLibraries(rows)
        setSelectedLibraryId(current => current || rows[0]?.id || '')
      })
      .catch(() => setKnowledgeLibraries([]))
  }, [mode])

  const handleRetentionChange = async (value: string) => {
    setKbRetention(value)

    try {
      await api(`/api/soul/authors/${encodeURIComponent(ref)}/governance`, 'PUT', { retention_days: value })
      await onGoverned()
      notify({ kind: 'success', title: '保留策略已保存', message: value === 'forever' ? '该 Soul 数据将永久保留' : `该 Soul 数据保留 ${value} 天` })
    } catch (error) {
      notifyError(error, '保存保留策略失败')
    }
  }

  const handleExportKb = async () => {
    try {
      const result = await api<{ file?: string }>(`/api/soul/authors/${encodeURIComponent(ref)}/export`, 'POST')
      notify({ kind: 'success', title: '已导出', message: result.file || 'Soul 知识库数据已导出' })
    } catch (error) {
      notifyError(error, '导出知识库失败')
    }
  }

  const handleClearKb = async () => {
    if (window.confirm('确定清空所有知识库数据？此操作不可恢复。')) {
      try {
        await api(`/api/soul/authors/${encodeURIComponent(ref)}/purge`, 'DELETE')
        await onGoverned()
        notify({ kind: 'success', title: '知识库已清空', message: '原始文本、索引、向量和网络证据已删除；历史导出文件仍保留。' })
      } catch (error) {
        notifyError(error, '清空知识库失败')
      }
    }
  }

  const ref = sourceRef(active)
  const selectedPreset = presets.find(row => row.id === soulRoleId) || presets[0]
  const handleSave = async () => {
    try {
      if (mode === 'soulEdit') {
        await api(`/api/soul/authors/${encodeURIComponent(ref)}/detail`, 'PATCH', {
          name: soulName,
          description: soulDescription,
          risk_strategy: riskStrategy,
          identity: { ...(active.identity || {}), kind: selectedPreset?.kind || active.identity?.kind || 'method', role_id: soulRoleId, domain_ids: selectedPreset?.default_domain ? [selectedPreset.default_domain] : (active.identity?.domain_ids || []) }
        })
        notify({ kind: 'success', title: 'Soul 已保存', message: soulName })
      } else if (mode === 'attributeEdit' && attribute) {
        await api(`/api/soul/authors/${encodeURIComponent(ref)}/attributes/${encodeURIComponent(attribute.id)}`, 'PATCH', {
          summary: attributeSummary,
          confidence: clamp(attributeConfidence, 0, 100) / 100,
          risk_level: attributeRisk,
          tags: attributeTags.split(',').map(tag => tag.trim()).filter(Boolean)
        })
        notify({ kind: 'success', title: '属性已保存', message: attribute.label })
      }
      setDirty(false)
      await onSaved()
    } catch (error) { notifyError(error, '保存失败') }
  }

  const addFileSource = async (kindLabel: string, extensions: string[]) => {
    const paths = await window.karnaDesktop.selectPaths({ multiple: false, title: `选择${kindLabel}`, filters: [{ name: kindLabel, extensions }] })
    const file = paths[0]
    if (!file) return
    try {
      await api(`/api/soul/authors/${encodeURIComponent(ref)}/sources`, 'POST', { kind: 'file', label: file.split(/[\/]/).pop() || kindLabel, original_location: file, copyright_status: 'user_provided' })
      await onGoverned()
      notify({ kind: 'success', title: '资料源已添加', message: '已进入统一 Ingest 解析流程' })
    } catch (error) { notifyError(error, '添加资料源失败') }
  }

  const addFolderSource = async () => {
    const paths = await window.karnaDesktop.selectPaths({ directories: true, multiple: false, title: '请选择资料文件夹' })
    const folder = paths[0]
    if (!folder) return
    try {
      await api(`/api/soul/authors/${encodeURIComponent(ref)}/sources`, 'POST', { kind: 'folder', label: folder.split(/[\/]/).pop() || '本地文件夹', original_location: folder, copyright_status: 'user_provided' })
      await onGoverned()
      notify({ kind: 'success', title: '文件夹资料源已添加', message: 'PDF/DOCX/Markdown 会统一解析' })
    } catch (error) { notifyError(error, '添加文件夹资料源失败') }
  }

  const addUrlSource = async () => {
    const url = urlInput.trim()
    if (!url) return
    try {
      await api(`/api/soul/authors/${encodeURIComponent(ref)}/sources`, 'POST', { kind: 'url', label: url, original_location: url, copyright_status: 'public_web' })
      setUrlInput('')
      await onGoverned()
      notify({ kind: 'success', title: '网页资料源已添加', message: '正在抓取并解析网页正文' })
    } catch (error) { notifyError(error, '操作失败') }
  }

  const runWebResearch = async () => {
    const raw = webResearchInput.trim()
    const urls = raw.split(/[\n,，\s]+/).map(row => row.trim()).filter(Boolean)
    if (!urls.length) {
      notifyError(new Error('请先输入维基、百度百科、知网、豆瓣、Nature 等资料网址。'), '网络检索证据失败')
      return
    }
    try {
      const result = await api<{ sources?: SoulWebSource[]; warnings?: Array<{ message?: string }> }>(`/api/soul/authors/${encodeURIComponent(ref)}/web-research`, 'POST', { urls, query: active.name })
      setWebResearchInput('')
      await onGoverned()
      const passed = (result.sources || []).filter(source => source.authority_status !== 'failed').length
      const failed = (result.sources || []).filter(source => source.authority_status === 'failed').length
      notify({ kind: 'success', title: '网络证据已检索', message: `权威校验通过 ${passed} 个，未通过 ${failed} 个。` })
    } catch (error) {
      notifyError(error, '网络检索证据失败')
    }
  }

  const addKnowledgeSource = async () => {
    const chosen = knowledgeLibraries.find(row => row.id === selectedLibraryId)
    if (!chosen) {
      notifyError(new Error('请先选择一个现有知识库'), '连接知识库失败')
      return
    }
    try {
      await api(`/api/soul/authors/${encodeURIComponent(ref)}/sources`, 'POST', { kind: 'knowledge_library', label: chosen.name, library_id: chosen.id, original_location: chosen.id, copyright_status: 'shared_knowledge' })
      await onGoverned()
      notify({ kind: 'success', title: '已连接现有知识库', message: chosen.name })
    } catch (error) { notifyError(error, '操作失败') }
  }

  const reindexSource = async (source: SoulSource) => {
    try {
      await api(`/api/soul/authors/${encodeURIComponent(ref)}/sources/${encodeURIComponent(source.id)}/reindex`, 'POST', {})
      await onGoverned()
      notify({ kind: 'success', title: '已重新提交解析', message: source.label })
    } catch (error) { notifyError(error, '操作失败') }
  }

  const deleteSource = async (source: SoulSource) => {
    if (!window.confirm(`删除资料源「${source.label}」的连接吗？不会删除原始文件或共享知识库。`)) return
    try {
      await api(`/api/soul/authors/${encodeURIComponent(ref)}/sources/${encodeURIComponent(source.id)}`, 'DELETE')
      await onGoverned()
      notify({ kind: 'success', title: '资料源连接已删除', message: source.label })
    } catch (error) { notifyError(error, '操作失败') }
  }


  const sources = detail?.author?.sources || active.sources || []

  const edges: Array<{ pos: string; cursor: string; edge: ResizeEdge; style: React.CSSProperties }> = [
    { pos: 'n', cursor: 'ns-resize', edge: 'n', style: { top: 0, left: 10, right: 10, height: 6 } },
    { pos: 's', cursor: 'ns-resize', edge: 's', style: { bottom: 0, left: 10, right: 10, height: 6 } },
    { pos: 'w', cursor: 'ew-resize', edge: 'w', style: { top: 10, bottom: 10, left: 0, width: 6 } },
    { pos: 'e', cursor: 'ew-resize', edge: 'e', style: { top: 10, bottom: 10, right: 0, width: 6 } },
    { pos: 'nw', cursor: 'nwse-resize', edge: 'nw', style: { top: 0, left: 0, width: 14, height: 14 } },
    { pos: 'ne', cursor: 'nesw-resize', edge: 'ne', style: { top: 0, right: 0, width: 14, height: 14 } },
    { pos: 'sw', cursor: 'nesw-resize', edge: 'sw', style: { bottom: 0, left: 0, width: 14, height: 14 } },
    { pos: 'se', cursor: 'nwse-resize', edge: 'se', style: { bottom: 0, right: 0, width: 18, height: 18 } },
  ]

  return (
    <aside
      className="absolute z-50 overflow-hidden rounded-2xl border border-[var(--dt-border)] bg-[var(--theme-elevated-seed)]/95 shadow-xl backdrop-blur-xl panel-slide-in"
      data-panel
      style={{ left: panel.x, top: panel.y, width: panel.w, height: panel.h }}
    >
      {edges.map(e => (
        <div
          className="absolute z-50 hover:bg-[var(--theme-primary)]/15"
          data-resize-handle
          key={e.pos}
          onPointerDown={ev => onResizeStart(ev, e.edge)}
          style={{ ...e.style, cursor: e.cursor }}
        />
      ))}

      <div className="flex cursor-move items-center justify-between border-b border-[var(--dt-border)] px-5 py-3.5" onPointerDown={onDragStart}>
        <div>
          <p className="text-[0.6rem] uppercase tracking-widest text-[var(--theme-foreground)]/60">可拖动编辑面板 {dirty && <span className="text-[var(--theme-secondary)] ml-1">· 未保存</span>}</p>
          <h2 className="mt-0.5 font-semibold text-[var(--theme-foreground)] flex items-center gap-2"><Codicon name={titleIcon} size={16} />{title}</h2>
          <p className="text-[0.65rem] text-[var(--theme-foreground)]/60 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button className="h-8 w-8 text-[var(--theme-foreground)]/60" onClick={onToggleMax} size="icon-xs" title={panel.maximized ? '还原' : '最大化'} variant="ghost"><Codicon name={panel.maximized ? 'screen-normal' : 'screen-full'} size={14} /></Button>
          <Button className="h-8 w-8 text-lg text-[var(--theme-foreground)]/60" onClick={onClose} size="icon-xs" variant="ghost">×</Button>
        </div>
      </div>

      <div className="grid h-[calc(100%-4.5rem)] gap-4 overflow-auto p-5 text-sm text-[var(--theme-foreground)]/80">
        {mode === 'soulEdit' && (
          <>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[var(--theme-foreground)]/70">Soul 名称</span>
              <input
                className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 px-4 py-2.5 text-[var(--theme-foreground)] outline-none focus:border-[var(--theme-primary)] transition-colors"
                value={soulName}
                onChange={event => { setSoulName(event.target.value); setDirty(true) }}
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[var(--theme-foreground)]/70">Soul 类型</span>
              <select className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 px-4 py-2.5 text-[var(--theme-foreground)] outline-none focus:border-[var(--theme-primary)]" value={soulRoleId} onChange={event => { setSoulRoleId(event.target.value); setDirty(true) }}>
                <option value="author">作者 / 作家</option>
                <option value="screenwriter">编剧 / 导演</option>
                <option value="critic">批评家 / 理论家</option>
                <option value="custom">自定义方法源</option>
                <option value="user_preference">我的创作偏好</option>
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[var(--theme-foreground)]/70">一句话描述</span>
              <textarea
                className="min-h-24 rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 px-4 py-2.5 text-[var(--theme-foreground)] outline-none focus:border-[var(--theme-primary)] resize-none"
                value={soulDescription}
                onChange={event => { setSoulDescription(event.target.value); setDirty(true) }}
                placeholder="描述这个 Soul 的研究方向和风格特点..."
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[var(--theme-foreground)]/70">风险策略</span>
              <select className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 px-4 py-2.5 text-[var(--theme-foreground)] outline-none focus:border-[var(--theme-primary)]" value={riskStrategy} onChange={event => { setRiskStrategy(event.target.value); setDirty(true) }}>
                <option value="strict">严格 - 只迁移最安全的原则</option>
                <option value="default">默认 - 平衡迁移性和安全性</option>
                <option value="creative">创意优先 - 允许更多风格借鉴</option>
              </select>
            </label>
          </>
        )}

        {mode === 'attributeEdit' && attribute && (
          <>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[var(--theme-foreground)]/70">属性名称</span>
              <input className="rounded-xl border border-[var(--dt-border)] bg-[var(--dt-muted)] px-4 py-2.5 text-[var(--theme-foreground)]/80 outline-none" defaultValue={attribute.label} readOnly />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[var(--theme-foreground)]/70">属性摘要</span>
              <textarea
                className="min-h-32 rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 px-4 py-2.5 text-[var(--theme-foreground)] outline-none focus:border-[var(--theme-primary)] resize-none leading-relaxed"
                value={attributeSummary}
                onChange={event => { setAttributeSummary(event.target.value); setDirty(true) }}
                placeholder="描述这个属性的核心发现..."
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-[var(--theme-foreground)]/70">置信度 ({Math.round(attribute.confidence * 100)}%)</span>
                <input className="accent-[var(--theme-primary)]" defaultValue={Math.round(attribute.confidence * 100)} max="100" min="0" onChange={() => setDirty(true)} type="range" />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-[var(--theme-foreground)]/70">风险等级</span>
                <select className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 px-4 py-2.5 text-[var(--theme-foreground)] outline-none focus:border-[var(--theme-primary)]" value={attributeRisk} onChange={event => { setAttributeRisk(event.target.value as 'low' | 'medium' | 'high'); setDirty(true) }}>
                  <option value="low">低风险</option>
                  <option value="medium">中风险</option>
                  <option value="high">高风险</option>
                </select>
              </label>
            </div>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-[var(--theme-foreground)]/70">标签（逗号分隔）</span>
              <input
                className="rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 px-4 py-2.5 text-[var(--theme-foreground)] outline-none focus:border-[var(--theme-primary)]"
                value={attributeTags}
                onChange={event => { setAttributeTags(event.target.value); setDirty(true) }}
                placeholder="tag1, tag2, tag3"
              />
            </label>
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/8 p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  <Codicon name="tools" size={12} />
                  引用证据可查看
                </span>
              </div>
              <p className="text-xs text-[var(--theme-foreground)]/80 leading-relaxed">当前属性会优先使用已连接资料源和网络证据；点击“证据”可查看已生成的引用记录。</p>
              <p className="text-xs text-[var(--theme-primary)] flex items-start gap-1.5 mt-2">
                <Codicon className="mt-0.5 flex-shrink-0" name="lightbulb" size={14} />
                当前版本支持手动编辑摘要和标签。
              </p>
            </div>
          </>
        )}

        {mode === 'sourceManage' && (() => {
          const localSources = sources.filter(source => source.kind === 'file' || source.kind === 'folder')
          const urlSources = sources.filter(source => source.kind === 'url')
          const knowledgeSources = sources.filter(source => source.kind === 'knowledge_library')
          const statusClass = (status?: string) => status === 'failed'
            ? 'bg-[var(--dt-destructive)]/10 text-[var(--dt-destructive)]'
            : status === 'parsing' || status === 'queued'
              ? 'bg-[var(--theme-secondary)]/10 text-[var(--theme-secondary)]'
              : 'bg-[var(--theme-primary)]/10 text-[var(--theme-primary)]'
          const SourceRow = ({ source }: { source: SoulSource }) => (
            <div className="rounded-lg bg-[var(--theme-card-seed)]/60 px-3 py-2.5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex items-start gap-2">
                  <Codicon className="mt-0.5 text-[var(--theme-foreground)]/60" name={source.kind === 'url' ? 'globe' : source.kind === 'knowledge_library' ? 'database' : source.kind === 'folder' ? 'folder' : 'file'} size={14} />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-[var(--theme-foreground)]/85" title={source.original_location}>{source.label}</div>
                    <div className="mt-1 truncate text-[0.62rem] text-[var(--theme-foreground)]/75">{source.parser || source.kind} · {source.file_count || 0} 文件 · {source.chunk_count || 0} 分块{source.error ? ` · ${source.error}` : ''}</div>
                    {source.status === 'failed' && String(source.error || '').toLowerCase().includes('interrupted by restart') ? (
                      <div className="mt-1 text-[0.62rem] font-medium text-[var(--theme-secondary)]">解析任务被应用/后端重启打断，通常不是模型问题。点“重解析”即可重新提交。</div>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${statusClass(source.status)}`}>{source.status || 'indexed'}</span>
                  <Button onClick={() => void reindexSource(source)} size="sm" variant="ghost">重解析</Button>
                  <Button className="text-[var(--dt-destructive)] hover:text-[var(--dt-destructive)]" onClick={() => void deleteSource(source)} size="sm" variant="ghost">删除</Button>
                </div>
              </div>
            </div>
          )
          return (
          <>
            <section className="rounded-xl border border-[var(--dt-border)] bg-[var(--dt-muted)] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-1.5 text-sm font-medium text-[var(--theme-foreground)]"><Codicon name="folder" size={14} />本地文件 / 文件夹</h3>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button onClick={() => void addFolderSource()} size="sm" variant="ghost"><Codicon className="mr-1" name="folder-opened" size={12} />本地文件夹</Button>
                  <Button onClick={() => void addFileSource('Markdown', ['md', 'markdown', 'txt'])} size="sm" variant="ghost"><Codicon className="mr-1" name="file-code" size={12} />Markdown</Button>
                  <Button onClick={() => void addFileSource('PDF 文件', ['pdf'])} size="sm" variant="ghost"><Codicon className="mr-1" name="file" size={12} />PDF</Button>
                  <Button onClick={() => void addFileSource('DOCX 文件', ['docx', 'doc'])} size="sm" variant="ghost"><Codicon className="mr-1" name="file" size={12} />DOCX</Button>
                </div>
              </div>
              <div className="space-y-2">
                {localSources.length ? localSources.map(source => <SourceRow key={source.id} source={source} />) : <div className="rounded-lg border border-dashed border-[var(--dt-border)] px-3 py-4 text-center text-xs text-[var(--theme-foreground)]/60">还没有本地资料。可添加文件夹、Markdown、PDF 或 DOCX。</div>}
              </div>
            </section>

            <section className="rounded-xl border border-[var(--dt-border)] bg-[var(--dt-muted)] p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[var(--theme-foreground)]"><Codicon name="link" size={14} />网页链接</h3>
              <div className="mb-3 flex gap-2">
                <input className="min-w-0 flex-1 rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 px-3 py-2 text-xs text-[var(--theme-foreground)] outline-none focus:border-[var(--theme-primary)]" onChange={event => setUrlInput(event.target.value)} placeholder="https://example.com/article" value={urlInput} />
                <Button disabled={!urlInput.trim()} onClick={() => void addUrlSource()} size="sm"><Codicon className="mr-1" name="link" size={12} />添加网页</Button>
              </div>
              <div className="space-y-2">
                {urlSources.length ? urlSources.map(source => <SourceRow key={source.id} source={source} />) : <div className="rounded-lg border border-dashed border-[var(--dt-border)] px-3 py-3 text-center text-xs text-[var(--theme-foreground)]/75">没有网页资料源。这里用于指定网页导入；搜索研究仍在网络检索证据区域。</div>}
              </div>
            </section>

            <section className="rounded-xl border border-[var(--dt-border)] bg-[var(--dt-muted)] p-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-medium text-[var(--theme-foreground)]"><Codicon name="database" size={14} />现有 Karna 知识库</h3>
              <div className="mb-3 flex gap-2">
                <select className="min-w-0 flex-1 rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 px-3 py-2 text-xs text-[var(--theme-foreground)] outline-none focus:border-[var(--theme-primary)]" onChange={event => setSelectedLibraryId(event.target.value)} value={selectedLibraryId}>
                  {knowledgeLibraries.length ? knowledgeLibraries.map(row => <option key={row.id} value={row.id}>{row.name}</option>) : <option value="">暂无可选知识库</option>}
                </select>
                <Button disabled={!selectedLibraryId} onClick={() => void addKnowledgeSource()} size="sm"><Codicon className="mr-1" name="database" size={12} />连接</Button>
              </div>
              <div className="space-y-2">
                {knowledgeSources.length ? knowledgeSources.map(source => <SourceRow key={source.id} source={source} />) : <div className="rounded-lg border border-dashed border-[var(--dt-border)] px-3 py-3 text-center text-xs text-[var(--theme-foreground)]/60">未连接现有知识库。删除连接不会删除共享知识库本体。</div>}
              </div>
            </section>

            <section className="rounded-xl border border-[var(--dt-border)] bg-[var(--dt-muted)] p-4">
              <h3 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-[var(--theme-foreground)]"><Codicon name="globe" size={14} />网络检索证据入口</h3>
              <p className="mb-3 text-xs leading-5 text-[var(--theme-foreground)]/80">输入维基、百度百科、知网、豆瓣、Nature、官网等起始网址。Karna 会抓取这些网址，并对知乎、小红书、论坛、盗版全文站等来源做权威校验，结果会明确标注通过或未通过。</p>
              <div className="flex gap-2">
                <textarea className="min-h-20 min-w-0 flex-1 rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 px-3 py-2 text-xs text-[var(--theme-foreground)] outline-none focus:border-[var(--theme-primary)]" onChange={event => setWebResearchInput(event.target.value)} placeholder="每行一个网址，例如：https://zh.wikipedia.org/wiki/...&#10;https://baike.baidu.com/item/..." value={webResearchInput} />
                <Button disabled={!webResearchInput.trim()} onClick={() => void runWebResearch()} size="sm">开始检索</Button>
              </div>
            </section>

            <KnowledgeUsageSummary usage={detail?.usage || knowledgeUsage} />
            <WebResearchEvidence queries={detail?.web?.queries || []} sources={detail?.web?.sources || []} />
            <CitationEvidence citations={detail?.citations || []} />

            <div className="rounded-xl bg-[var(--theme-secondary)]/10 border border-[var(--theme-secondary)]/20 p-3">
              <p className="text-xs font-medium leading-5 text-[var(--theme-secondary)] flex items-start gap-1.5"><Codicon className="mt-0.5 flex-shrink-0" name="warning" size={14} />PDF 显示 failed 时先看错误：如果是 Interrupted by restart，表示任务被重启打断，重解析即可；只有扫描件/OCR 报错时才可能需要配置读图/OCR 模型。</p>
            </div>

            <div className="rounded-xl border border-[var(--dt-border)] bg-[var(--dt-muted)] p-4">
              <h3 className="text-sm font-medium text-[var(--theme-foreground)] mb-3 flex items-center gap-1.5"><Codicon name="gear" size={14} />知识库治理</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <label className="text-xs text-[var(--theme-foreground)]/70">数据保留期</label>
                  <select
                    className="rounded-lg border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 px-3 py-1.5 text-xs text-[var(--theme-foreground)] outline-none focus:border-[var(--theme-primary)]"
                    onChange={e => void handleRetentionChange(e.target.value)}
                    value={kbRetention}
                  >
                    <option value="7">7天</option>
                    <option value="30">30天</option>
                    <option value="90">90天</option>
                    <option value="forever">永久</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => void handleExportKb()} size="sm" variant="ghost"><Codicon className="mr-1" name="cloud-download" size={12} />导出知识库</Button>
                  <Button className="text-[var(--dt-destructive)] hover:bg-[var(--dt-destructive)]/10 hover:text-[var(--dt-destructive)]" onClick={() => void handleClearKb()} size="sm" variant="ghost"><Codicon className="mr-1" name="trash" size={12} />清空知识库</Button>
                </div>
                <p className="text-[0.6rem] text-[var(--theme-foreground)]/50 flex items-start gap-1"><Codicon className="mt-0.5 flex-shrink-0" name="info" size={10} />清空只清理 Soul 派生知识库；共享知识库不会被删除。</p>
              </div>
            </div>
          </>
          )
        })()}


        <div className="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-[var(--dt-border)]">
          <span className="text-[0.6rem] text-[var(--theme-foreground)]/60">Ctrl+S 保存 · Esc 关闭</span>
          <div className="flex gap-2">
            <Button className="text-[var(--theme-foreground)]/70" onClick={onClose} size="sm" variant="ghost">取消</Button>
            <Button className={primaryButtonClass()} onClick={() => void handleSave()} size="sm"><Codicon className="mr-1" name="save" size={12} />保存</Button>
          </div>
        </div>
      </div>
    </aside>
  )
}

function ContextMenu({ x, y, type, onArchiveSoul, onCopySoul, onDelete, onDuplicateSoul, onEditSoul, onManageSources, onEditAttribute, onViewAttribute, onViewEvidence, onRedistill, onReindex, onImpact, onExportSkill, onMarkHighRisk, onPasteSoul }: { x: number; y: number; type: 'soul' | 'attribute' | 'canvas' | null; onArchiveSoul: () => void; onCopySoul: () => void; onDelete: () => void; onDuplicateSoul: () => void; onEditSoul: () => void; onManageSources: () => void; onEditAttribute: () => void; onViewAttribute: () => void; onViewEvidence: () => void; onRedistill: () => void; onReindex: () => void; onImpact: () => void; onExportSkill: () => void; onMarkHighRisk: () => void; onPasteSoul: () => void }) {
  const adjustedX = Math.min(x, window.innerWidth - 220)
  const adjustedY = Math.min(y, window.innerHeight - 320)

  return (
    <div
      className="fixed z-[60] w-52 rounded-xl border border-[var(--dt-border)] bg-[var(--theme-elevated-seed)]/98 py-1.5 shadow-lg backdrop-blur-xl info-sheet-in"
      data-menu
      style={{ left: adjustedX, top: adjustedY }}
    >
      {type === 'canvas' ? (
        <>
          <MenuItem icon="clippy" label="粘贴 Soul" onClick={onPasteSoul} />
        </>
      ) : type === 'soul' ? (
        <>
          <MenuItem icon="edit" label="编辑 Soul" onClick={onEditSoul} />
          <MenuItem icon="library" label="连接资料源" onClick={onManageSources} />
          <div className="my-1 border-t border-[var(--dt-border)]" />
          <MenuItem icon="refresh" label="重新索引全部资料" onClick={onReindex} />
          <MenuItem icon="graph" label="查看影响分析" onClick={onImpact} />
          <MenuItem icon="package" label="导出 Soul Skill" onClick={onExportSkill} />
          <div className="my-1 border-t border-[var(--dt-border)]" />
          <MenuItem icon="clippy" label="复制 Soul" onClick={onCopySoul} />
          <MenuItem icon="archive" label="归档 Soul" onClick={onArchiveSoul} />
          <MenuItem danger icon="trash" label="删除 Soul" onClick={onDelete} />
        </>
      ) : type === 'attribute' ? (
        <>
          <MenuItem icon="eye" label="查看摘要" onClick={onViewAttribute} />
          <MenuItem icon="edit" label="编辑属性" onClick={onEditAttribute} />
          <div className="my-1 border-t border-[var(--dt-border)]" />
          <MenuItem icon="clippy" label="查看证据" onClick={onViewEvidence} />
          <MenuItem icon="tag" label="管理标签" onClick={onEditAttribute} />
          <MenuItem icon="refresh" label="重新蒸馏" onClick={onRedistill} />
          <MenuItem icon="warning" label="标记为高风险" onClick={onMarkHighRisk} />
          <div className="my-1 border-t border-[var(--dt-border)]" />
          <MenuItem danger icon="circle-slash" label="禁用属性" onClick={onDelete} />
        </>
      ) : null}
    </div>
  )
}

function MenuItem({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-sm transition-colors ${danger ? 'text-[var(--dt-destructive)] hover:bg-[var(--dt-destructive)]/10' : 'text-[var(--theme-foreground)]/80 hover:bg-[var(--theme-secondary)]/50 hover:text-[var(--theme-foreground)]'}`}
      onClick={e => { e.stopPropagation(); onClick() }}
      type="button"
    >
      <Codicon name={icon} size={14} />
      {label}
    </button>
  )
}

function CreateSoulDialog({ busy, description, inputRef, name, onClose, onCreate, setDescription, setName }: { busy: boolean; description: string; inputRef: React.RefObject<HTMLInputElement | null>; name: string; onClose: () => void; onCreate: () => void; setDescription: (value: string) => void; setName: (value: string) => void }) {
  const dialogRef = useDialogFocus<HTMLFormElement>(onClose)

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-[var(--theme-foreground)]/20 backdrop-blur-md info-sheet-in" onMouseDown={event => { if (event.target === event.currentTarget) {onClose()} }}>
      <form aria-labelledby="create-soul-title" aria-modal="true" className="w-[32rem] rounded-3xl border border-[var(--dt-border)] bg-[var(--theme-elevated-seed)]/98 p-6 shadow-xl" data-panel onSubmit={event => { event.preventDefault(); onCreate() }} ref={dialogRef} role="dialog" tabIndex={-1}>
        <p className="text-[0.6rem] uppercase tracking-[0.28em] text-[var(--theme-foreground)]/60">创建 Soul 节点</p>
        <h2 className="mt-2 flex items-center gap-2 text-xl font-semibold text-[var(--theme-primary)]" id="create-soul-title"><Codicon className="text-[var(--theme-primary)]" name="sparkle" size={20} />创建新 Soul 泡泡</h2>
        <p className="mt-2 text-xs leading-5 text-[var(--theme-foreground)]/70">创建后新泡泡会出现在当前视野中心，可直接拖动定位。Soul 是创作方法档案，不用于仿写。</p>

        <input
          className="mt-5 w-full rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 px-4 py-3.5 text-sm text-[var(--theme-foreground)] outline-none placeholder:text-[var(--theme-foreground)]/40 focus:border-[var(--theme-primary)] transition-colors"
          onChange={event => setName(event.target.value)}
          placeholder="Soul 名称，例如：陀思妥耶夫斯基方法库"
          ref={inputRef}
          value={name}
        />
        <textarea
          className="mt-3 min-h-28 w-full rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/60 px-4 py-3.5 text-sm text-[var(--theme-foreground)] outline-none placeholder:text-[var(--theme-foreground)]/40 focus:border-[var(--theme-primary)] transition-colors resize-none"
          onChange={event => setDescription(event.target.value)}
          placeholder="可选描述：这个 Soul 研究什么方法、风格特点、适用场景..."
          value={description}
        />

        <div className="mt-5 flex justify-end gap-2">
          <Button className="text-[var(--theme-foreground)]/70" onClick={onClose} type="button" variant="ghost">取消</Button>
          <Button className={primaryButtonClass()} disabled={!name.trim() || busy} type="submit"><Codicon className="mr-1" name="sparkle" size={14} />{busy ? '创建中...' : '创建 Soul'}</Button>
        </div>
      </form>
    </div>
  )
}

function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  const dialogRef = useDialogFocus<HTMLDivElement>(onCancel)

  return (
    <div className="fixed inset-0 z-[58] flex items-center justify-center bg-[var(--theme-foreground)]/25 backdrop-blur-sm info-sheet-in" onClick={onCancel}>
      <div aria-describedby="soul-confirm-message" aria-labelledby="soul-confirm-title" aria-modal="true" className="w-[24rem] rounded-2xl border border-[var(--dt-border)] bg-[var(--theme-elevated-seed)]/98 p-5 shadow-xl" data-panel onClick={e => e.stopPropagation()} ref={dialogRef} role="alertdialog" tabIndex={-1}>
        <h3 className="font-semibold text-[var(--theme-foreground)]" id="soul-confirm-title">确认</h3>
        <p className="mt-2 text-sm text-[var(--theme-foreground)]/70 leading-relaxed" id="soul-confirm-message">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button className="text-[var(--theme-foreground)]/70" onClick={onCancel} size="sm" variant="ghost">取消</Button>
          <Button onClick={onConfirm} size="sm" variant="destructive">确认</Button>
        </div>
      </div>
    </div>
  )
}

function StatusRail({ active, detail, mode, timelineExpanded }: { active: SoulAuthor | null; detail: SoulDetail | null; mode: ViewMode; timelineExpanded: boolean }) {
  return (
    <aside className={`absolute right-5 z-20 w-72 rounded-2xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/85 p-4 text-xs shadow-xl backdrop-blur-2xl transition-all duration-300 ${timelineExpanded ? 'bottom-64' : 'bottom-24'}`}>
      <div className="flex items-center justify-between">
        <span className="text-[var(--theme-foreground)]/60 font-medium uppercase tracking-wider text-[0.6rem]">当前状态</span>
        <span className="rounded-full border border-[var(--theme-primary)]/30 bg-[var(--theme-primary)]/10 px-2.5 py-0.5 text-[var(--theme-primary)] text-[0.65rem] font-medium">{mode}</span>
      </div>
      <div className="mt-3 text-base font-semibold text-[var(--theme-foreground)]">{active?.name || '未选择 Soul'}</div>
      {active?.description && <div className="mt-1 text-[0.65rem] text-[var(--theme-foreground)]/60 line-clamp-2">{active.description}</div>}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-[var(--dt-muted)] p-2 text-center">
          <div className="text-base font-semibold text-[var(--theme-primary)]">{active?.texts_count || detail?.metadata?.texts?.length || 0}</div>
          <div className="text-[0.55rem] text-[var(--theme-foreground)]/60">文本</div>
        </div>
        <div className="rounded-lg bg-[var(--dt-muted)] p-2 text-center">
          <div className="text-base font-semibold text-[var(--theme-primary)]">{active?.chunks_count || detail?.chunks?.length || 0}</div>
          <div className="text-[0.55rem] text-[var(--theme-foreground)]/60">分块</div>
        </div>
        <div className="rounded-lg bg-[var(--dt-muted)] p-2 text-center">
          <div className="text-base font-semibold text-[var(--theme-primary)]">{active?.web_evidence_count || detail?.web?.claims?.length || 0}</div>
          <div className="text-[0.55rem] text-[var(--theme-foreground)]/60">证据</div>
        </div>
      </div>
    </aside>
  )
}

function HintBar({ mode, timelineExpanded }: { mode: ViewMode; timelineExpanded: boolean }) {
  const hints: Record<ViewMode, string> = {
    pool: '点击 Soul 聚焦 · 双击直接展开属性 · 拖动画布移动 · 滚轮缩放',
    focused: '再次点击或双击中心 Soul 展开属性 · 点击空白返回泡泡池 · Enter 展开',
    expanded: '左键属性查看摘要 · 双击直接编辑 · 右键打开菜单 · 点击空白收起',
    attributeView: '双击或点击"编辑"打开面板 · Esc 返回 · 点击空白收起',
    attributeEdit: 'Ctrl+S 保存 · Esc 关闭（未保存会提示）· 拖动边缘/标题调整面板',
    soulEdit: 'Ctrl+S 保存 · 拖动边缘调整面板大小 · 点击□最大化/还原',
    sourceManage: '添加资料源后会后台索引，生成影响分析供您确认'
  }

  return (
    <div className={`absolute left-1/2 z-20 -translate-x-1/2 rounded-full border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/85 px-5 py-2.5 text-xs text-[var(--theme-foreground)]/70 shadow-xl backdrop-blur-xl transition-all duration-300 ${timelineExpanded ? 'bottom-64' : 'bottom-5'}`}>
      {hints[mode]}
    </div>
  )
}

function TimelineDock({ events, expanded, onToggle }: { events: Array<{ id: string; type: string; title: string; description?: string; created_at: string }>; expanded: boolean; onToggle: () => void }) {
  const eventIcons: Record<string, string> = {
    soul_created: 'sparkle', source_added: 'library', source_indexed: 'refresh', attribute_updated: 'edit', impact_generated: 'warning', impact_applied: 'check', risk_changed: 'shield', skill_exported: 'package'
  }

  return (
    <div className={`absolute bottom-0 left-0 right-0 z-20 border-t border-[var(--dt-border)] bg-[var(--theme-card-seed)]/90 backdrop-blur-2xl transition-all duration-300 ${expanded ? 'h-60' : 'h-14'}`}>
      <button className="absolute left-1/2 -top-3 -translate-x-1/2 rounded-full border border-[var(--dt-border)] bg-[var(--theme-card-seed)] px-4 py-1 text-xs text-[var(--theme-foreground)]/70 hover:text-[var(--theme-foreground)] transition-colors shadow-md" onClick={onToggle}>
        {expanded ? '▼ 收起时间线' : '▲ 展开时间线'}
      </button>
      <div className="flex items-center justify-between px-6 h-14">
        <span className="text-sm font-medium text-[var(--theme-foreground)]/80 flex items-center gap-1.5"><Codicon name="watch" size={14} />证据时间线</span>
        <span className="text-xs text-[var(--theme-foreground)]/60">{events.length || 0} 个事件</span>
      </div>
      {expanded && (
        <div className="px-6 pb-4 h-[calc(100%-3.5rem)] overflow-auto">
          {events.length === 0 ? (
            <div className="text-center text-xs text-[var(--theme-foreground)]/60 py-8">暂无事件。添加资料源、蒸馏属性后会在这里记录操作历史。</div>
          ) : (
            <div className="space-y-2">
              {events.slice(0, 20).map(event => (
                <div className="flex items-start gap-3 rounded-lg bg-[var(--dt-muted)] px-3 py-2" key={event.id}>
                  <Codicon className="mt-0.5 text-[var(--theme-foreground)]/60" name={eventIcons[event.type] || 'circle-filled'} size={14} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-[var(--theme-foreground)]/80">{event.title}</div>
                    {event.description && <div className="text-xs text-[var(--theme-foreground)]/60 mt-0.5 line-clamp-1">{event.description}</div>}
                  </div>
                  <span className="text-[0.6rem] text-[var(--theme-foreground)]/50 flex-shrink-0">{event.created_at?.slice(0, 10)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Minimap({ authors, attributeNodes, groupNodes, positions, activeId, camera, onNavigate, timelineExpanded }: { authors: SoulAuthor[]; attributeNodes: GalaxyAttributeNode[]; groupNodes: GalaxyGroupNode[]; positions: BubblePositions; activeId: string; camera: Camera; onNavigate: (pos: BubblePosition) => void; timelineExpanded: boolean }) {
  const minimapWidth = 180
  const minimapHeight = 120
  const bounds = useMemo(() => {
    const points: Array<{ x: number; y: number; radius: number }> = authors.map((author, index) => {
      const pos = positions[author.id] || defaultPosition(index, authors.length || 1)
      return { x: pos.x, y: pos.y, radius: displaySizeForSoul(author, author.id === activeId, author.id === activeId ? 'focused' : 'pool') / 2 }
    })

    groupNodes.forEach(group => points.push({ x: group.x, y: group.y, radius: group.size / 2 }))
    attributeNodes.forEach(node => points.push({ x: node.x, y: node.y, radius: node.size / 2 }))

    if (!points.length) {points.push({ x: 0, y: 0, radius: 240 })}

    const padding = 260
    const minX = Math.min(...points.map(point => point.x - point.radius)) - padding
    const maxX = Math.max(...points.map(point => point.x + point.radius)) + padding
    const minY = Math.min(...points.map(point => point.y - point.radius)) - padding
    const maxY = Math.max(...points.map(point => point.y + point.radius)) + padding
    const width = Math.max(900, maxX - minX)
    const height = Math.max(620, maxY - minY)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2

    return { minX: centerX - width / 2, minY: centerY - height / 2, width, height }
  }, [authors, positions, groupNodes, attributeNodes])

  const minimapScale = Math.min(minimapWidth / bounds.width, minimapHeight / bounds.height)
  const mapX = (x: number) => (x - bounds.minX) * minimapScale
  const mapY = (y: number) => (y - bounds.minY) * minimapScale
  const viewportWorldX = -camera.x / camera.scale
  const viewportWorldY = -camera.y / camera.scale
  const viewportW = (window.innerWidth / camera.scale) * minimapScale
  const viewportH = (window.innerHeight / camera.scale) * minimapScale

  return (
    <div className={`absolute left-5 z-20 rounded-xl border border-[var(--dt-border)] bg-[var(--theme-card-seed)]/85 p-2 shadow-xl backdrop-blur-2xl transition-all duration-300 ${timelineExpanded ? 'bottom-64' : 'bottom-24'}`} style={{ width: minimapWidth + 16, height: minimapHeight + 24 }}>
      <div className="text-[0.55rem] text-[var(--theme-foreground)]/60 uppercase tracking-wider mb-1.5 px-1">导航</div>
      <div className="relative rounded-lg bg-[var(--dt-muted)] border border-[var(--dt-border)] overflow-hidden" onClick={e => {
        const rect = e.currentTarget.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const worldX = bounds.minX + mx / minimapScale
        const worldY = bounds.minY + my / minimapScale
        onNavigate({ x: worldX, y: worldY })
      }} style={{ width: minimapWidth, height: minimapHeight }}>
        <div className="absolute rounded border border-[var(--theme-primary)]/50 bg-[var(--theme-primary)]/10 pointer-events-none" style={{ left: mapX(viewportWorldX), top: mapY(viewportWorldY), width: viewportW, height: viewportH }} />
        {groupNodes.map(group => (
          <div
            className={`absolute rounded-full border ${group.expanded ? 'border-[var(--theme-primary)] bg-[var(--theme-primary)]/25' : 'border-[var(--theme-foreground)]/20 bg-[var(--theme-foreground)]/10'}`}
            key={`mini-group-${group.id}`}
            style={{ left: mapX(group.x) - 3, top: mapY(group.y) - 3, width: group.expanded ? 7 : 5, height: group.expanded ? 7 : 5 }}
          />
        ))}
        {attributeNodes.map(node => (
          <div
            className="absolute rounded-full bg-[var(--theme-secondary)]/70"
            key={`mini-attr-${node.id}`}
            style={{ left: mapX(node.x) - 2, top: mapY(node.y) - 2, width: 4, height: 4 }}
          />
        ))}
        {authors.map((author, index) => {
          const pos = positions[author.id] || defaultPosition(index, authors.length || 1)
          const isActive = author.id === activeId

          return (
            <div
              className={`absolute rounded-full transition-colors ${isActive ? 'bg-[var(--theme-primary)] shadow-lg shadow-[var(--theme-primary)]/50' : 'bg-[var(--theme-foreground)]/30 hover:bg-[var(--theme-foreground)]/50'}`}
              key={author.id}
              style={{ left: mapX(pos.x) - 2, top: mapY(pos.y) - 2, width: isActive ? 7 : 4, height: isActive ? 7 : 4 }}
            />
          )
        })}
      </div>
    </div>
  )
}

function MiniList({ rows, empty, title }: { rows: unknown[]; empty: string; title?: string }) {
  return (
    <div>
      {title ? <div className="mb-1 text-xs font-semibold text-[var(--theme-foreground)]/70">{title}</div> : null}
      <div className="grid max-h-44 gap-1 overflow-auto text-xs text-[var(--theme-foreground)]/70">
        {rows.length ? rows.slice(0, 8).map((r, i) => <div className="rounded-lg bg-[var(--dt-muted)] px-2 py-1" key={i}>{itemValue(r)}</div>) : <span>{empty}</span>}
      </div>
    </div>
  )
}

export { MiniList }





