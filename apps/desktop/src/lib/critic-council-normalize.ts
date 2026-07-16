export type CriticFindingLevel = 'critical' | 'warning' | 'info'

export interface NormalizedCriticFinding {
  id: string
  level: CriticFindingLevel
  title: string
  description: string
  evidence?: string[]
  suggestion?: string
  lens?: string
  source?: {
    file?: string
    line?: number
    column?: number
  }
}

export interface NormalizedCriticLens {
  id: string
  name: string
  focus?: string
  findings: NormalizedCriticFinding[]
  status: string
}

export interface NormalizedCriticSummary {
  findings: number
  critical: number
  warning: number
  info: number
  status: string
}

export interface NormalizedCriticCouncil {
  schema_version: 1
  id?: string
  version?: number
  project_id?: string
  checked_at?: string
  scope?: string
  summary: NormalizedCriticSummary
  lenses: NormalizedCriticLens[]
}

const LEVEL_MAP: Record<string, CriticFindingLevel> = {
  high: 'critical',
  critical: 'critical',
  severe: 'critical',
  error: 'critical',
  medium: 'warning',
  warning: 'warning',
  warn: 'warning',
  low: 'info',
  info: 'info',
  note: 'info',
  hint: 'info',
  suggestion: 'info'
}

const STATUS_MAP: Record<string, string> = {
  clear: 'clear',
  ok: 'clear',
  passed: 'clear',
  ok_with_notes: 'ok_with_notes',
  notes: 'ok_with_notes',
  needs_revision: 'needs_revision',
  revision: 'needs_revision',
  issues_found: 'needs_revision',
  critical: 'critical',
  failed: 'critical',
  error: 'critical'
}

function normalizeLevel(raw: unknown): CriticFindingLevel {
  if (typeof raw !== 'string') return 'info'
  const lower = raw.toLowerCase().trim()
  return LEVEL_MAP[lower] || 'info'
}

function normalizeStatus(raw: unknown): string {
  if (typeof raw !== 'string') return 'ok_with_notes'
  const lower = raw.toLowerCase().trim()
  return STATUS_MAP[lower] || 'ok_with_notes'
}

function safeString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return fallback
  return String(value)
}

function safeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string')
}

function normalizeFinding(raw: unknown, lensId?: string): NormalizedCriticFinding | null {
  if (!raw || typeof raw !== 'object') return null

  const obj = raw as Record<string, unknown>

  const id = safeString(obj.id || obj._id || obj.finding_id, `finding-${Math.random().toString(36).slice(2, 9)}`)
  const title = safeString(obj.title || obj.name || obj.heading, '未命名发现')
  const description = safeString(obj.description || obj.detail || obj.message || obj.text, '')
  const level = normalizeLevel(obj.level || obj.severity || obj.priority)
  const evidence = safeStringArray(obj.evidence || obj.examples || obj.quotes)
  const suggestion = safeString(obj.suggestion || obj.recommendation || obj.fix, undefined) || undefined

  let findingLens: string | undefined = lensId
  if (obj.lens && typeof obj.lens === 'string') {
    findingLens = obj.lens
  } else if (obj.lens_id && typeof obj.lens_id === 'string') {
    findingLens = obj.lens_id
  }

  let source: NormalizedCriticFinding['source'] | undefined
  if (obj.source && typeof obj.source === 'object') {
    const src = obj.source as Record<string, unknown>
    source = {
      file: typeof src.file === 'string' ? src.file : undefined,
      line: typeof src.line === 'number' ? src.line : undefined,
      column: typeof src.column === 'number' ? src.column : undefined
    }
  }

  return {
    id,
    level,
    title,
    description,
    evidence: evidence.length > 0 ? evidence : undefined,
    suggestion,
    lens: findingLens,
    source
  }
}

function normalizeLens(raw: unknown): NormalizedCriticLens | null {
  if (!raw || typeof raw !== 'object') return null

  const obj = raw as Record<string, unknown>

  const id = safeString(obj.id || obj._id || obj.lens_id, `lens-${Math.random().toString(36).slice(2, 9)}`)
  const name = safeString(obj.name || obj.title || obj.label, id)
  const focus = safeString(obj.focus || obj.description || obj.purpose, undefined) || undefined
  const status = normalizeStatus(obj.status || obj.state)

  const rawFindings = Array.isArray(obj.findings) ? obj.findings : []
  const findings: NormalizedCriticFinding[] = []
  for (const f of rawFindings) {
    const normalized = normalizeFinding(f, id)
    if (normalized) {
      findings.push(normalized)
    }
  }

  return { id, name, focus, findings, status }
}

function buildSummary(lenses: NormalizedCriticLens[], rawSummary?: unknown): NormalizedCriticSummary {
  let critical = 0
  let warning = 0
  let info = 0

  for (const lens of lenses) {
    for (const finding of lens.findings) {
      if (finding.level === 'critical') critical++
      else if (finding.level === 'warning') warning++
      else info++
    }
  }

  const total = critical + warning + info
  const rawStatus = rawSummary && typeof rawSummary === 'object'
    ? (rawSummary as Record<string, unknown>).status
    : undefined
  const status = normalizeStatus(rawStatus)

  return {
    findings: total,
    critical,
    warning,
    info,
    status
  }
}

export function normalizeCriticCouncilPayload(raw: unknown): NormalizedCriticCouncil {
  const empty: NormalizedCriticCouncil = {
    schema_version: 1,
    summary: { findings: 0, critical: 0, warning: 0, info: 0, status: 'clear' },
    lenses: []
  }

  if (!raw || typeof raw !== 'object') {
    return empty
  }

  const obj = raw as Record<string, unknown>

  let councilObj: Record<string, unknown> | undefined

  if (obj.council && typeof obj.council === 'object') {
    councilObj = obj.council as Record<string, unknown>
  } else if (obj.lenses || obj.findings || obj.summary) {
    councilObj = obj
  }

  if (!councilObj) {
    return empty
  }

  const rawLenses = Array.isArray(councilObj.lenses)
    ? councilObj.lenses
    : Array.isArray(councilObj.reports)
      ? councilObj.reports
      : []
  const lenses: NormalizedCriticLens[] = []

  for (const lens of rawLenses) {
    const normalized = normalizeLens(lens)
    if (normalized) {
      lenses.push(normalized)
    }
  }

  if (Array.isArray(councilObj.findings)) {
    const looseFindings = councilObj.findings
      .map(f => normalizeFinding(f, 'general'))
      .filter((f): f is NormalizedCriticFinding => f !== null)
    if (looseFindings.length > 0) {
      lenses.unshift({
        id: 'general',
        name: '????',
        focus: '?????????????',
        findings: looseFindings,
        status: 'ok_with_notes'
      })
    }
  }

  const summary = buildSummary(lenses, councilObj.summary)

  const id = safeString(councilObj.id || obj.id, undefined) || undefined
  const version = typeof councilObj.version === 'number' ? councilObj.version : undefined
  const project_id = safeString(councilObj.project_id || obj.project_id, undefined) || undefined
  const checked_at = safeString(councilObj.checked_at || obj.checked_at, undefined) || undefined
  const scope = safeString(councilObj.scope || obj.scope, undefined) || undefined

  return {
    schema_version: 1,
    id,
    version,
    project_id,
    checked_at,
    scope,
    summary,
    lenses
  }
}
