export type IngestSourceKind = 'local_file' | 'remote_url' | 'composer_attachment' | 'project_document' | 'knowledge_library_document'
export type IngestMediaType = 'pdf' | 'image' | 'office_doc' | 'spreadsheet' | 'presentation' | 'text' | 'audio' | 'video' | 'webpage' | 'binary'
export type IngestStatus = 'queued' | 'running' | 'parsed' | 'partial' | 'failed' | 'unsupported' | 'cancelled'

export type AttachmentState =
  | 'idle'
  | 'queued'
  | 'parsing'
  | 'parsed'
  | 'partial'
  | 'failed'
  | 'unsupported'
  | 'materializing'
  | 'ready'

export interface IngestSource {
  kind: IngestSourceKind
  path?: string
  url?: string
  original_name?: string
}

export interface IngestChunk {
  id: string
  index: number
  text: string
  markdown?: string
  page?: number
  timestamp_start?: number
  timestamp_end?: number
  source_label: string
  metadata?: Record<string, unknown>
}

export interface IngestResult {
  id: string
  job_id: string
  source: {
    kind: IngestSourceKind
    original_name: string
    safe_display_path?: string
    url?: string
    project_id?: string
    library_id?: string
  }
  media_type: IngestMediaType
  status: 'parsed' | 'partial' | 'failed' | 'unsupported'
  text?: string
  markdown?: string
  json?: unknown
  chunks?: IngestChunk[]
  warnings?: string[]
  error?: string
  metadata?: Record<string, unknown>
  created_at: string
}

export interface IngestJob {
  job_id: string
  status: IngestStatus
  progress?: number
  stage?: string
  message?: string
  error?: string
}

export interface IngestCapabilities {
  pdf: {
    available: boolean
    engines: string[]
    default_engine: string
    mineru_enabled: boolean
  }
  ocr: {
    available: boolean
    engines: string[]
  }
  video: {
    available: boolean
    ffmpeg_found: boolean
  }
}

const api = <T>(path: string, options: { body?: unknown; method?: string } = {}): Promise<T & { ok?: boolean; error?: string }> =>
  window.karnaDesktop.api<T & { ok?: boolean; error?: string }>({ body: options.body, method: options.method || 'GET', path })

export async function getIngestCapabilities(): Promise<IngestCapabilities> {
  const res = await api<IngestCapabilities>('/api/ingest/capabilities')
  return res as IngestCapabilities
}

export async function createIngestJob(params: {
  source: IngestSource
  project_id?: string
  library_id?: string
  intent?: 'chat_context' | 'knowledge_import' | 'project_document'
  options?: {
    engine?: 'auto' | 'fast' | 'mineru'
    ocr?: 'auto' | 'always' | 'never'
    max_pages?: number
    save_to_knowledge?: boolean
  }
}): Promise<{ job_id: string; status: IngestStatus }> {
  const res = await api<{ job_id: string; status: IngestStatus }>('/api/ingest/jobs', {
    method: 'POST',
    body: params
  })
  if (!res.ok || !res.job_id) {
    throw new Error(res.error || 'Failed to create ingest job')
  }
  return { job_id: res.job_id, status: res.status }
}

export async function getIngestJob(jobId: string): Promise<IngestJob> {
  const res = await api<IngestJob>(`/api/ingest/jobs/${encodeURIComponent(jobId)}`)
  if (!res.ok) {
    throw new Error(res.error || 'Failed to get ingest job')
  }
  return res
}

export async function getIngestResult(id: string): Promise<IngestResult> {
  const res = await api<IngestResult>(`/api/ingest/results/${encodeURIComponent(id)}`)
  if (!res.ok) {
    throw new Error(res.error || 'Failed to get ingest result')
  }
  return res
}

export async function cancelIngestJob(jobId: string): Promise<void> {
  await api(`/api/ingest/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' })
}

export function pollIngestJob(
  jobId: string,
  onUpdate: (job: IngestJob) => void,
  intervalMs = 1000
): () => void {
  let cancelled = false
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const poll = async () => {
    if (cancelled) return
    try {
      const job = await getIngestJob(jobId)
      if (cancelled) return
      onUpdate(job)
      if (job.status === 'parsed' || job.status === 'partial' || job.status === 'failed' || job.status === 'unsupported' || job.status === 'cancelled') {
        return
      }
      timeoutId = setTimeout(poll, intervalMs)
    } catch {
      if (!cancelled) {
        timeoutId = setTimeout(poll, intervalMs * 2)
      }
    }
  }

  void poll()

  return () => {
    cancelled = true
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export function isParseableFile(filePath: string): boolean {
  if (!filePath) return false
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return [
    'pdf', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif',
    'docx', 'pptx', 'xlsx', 'csv', 'txt', 'md', 'json', 'html', 'htm',
    'mp4', 'mov', 'mkv', 'webm', 'avi', 'mp3', 'wav', 'm4a', 'flac', 'ogg'
  ].includes(ext)
}

export function isAutoParseType(filePath: string): boolean {
  if (!filePath) return false
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  return ['pdf', 'docx', 'txt', 'md', 'csv', 'xlsx'].includes(ext)
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function buildAttachmentIngestBlock(result: IngestResult, maxChars = 6000): string {
  const name = result.source?.original_name || 'file'
  const mediaType = result.media_type
  const engine = result.metadata?.engine || 'unknown'
  const warnings = result.warnings || []
  const chunks = result.chunks || []

  const header = `[Attachment: ${name}]\nType: ${mediaType.toUpperCase()}\nParser: ${engine}`

  let body = ''
  if (result.text) {
    body = result.text.length > maxChars ? result.text.slice(0, maxChars) + '\n...(truncated)' : result.text
  } else if (chunks.length > 0) {
    body = chunks.map(c => {
      const loc = c.page ? `p.${c.page}` : c.timestamp_start != null ? `${formatDuration(c.timestamp_start)}-${formatDuration(c.timestamp_end || c.timestamp_start)}` : ''
      return loc ? `${loc}: ${c.text}` : c.text
    }).join('\n\n')
    if (body.length > maxChars) {
      body = body.slice(0, maxChars) + '\n...(truncated)'
    }
  }

  const warnStr = warnings.length > 0 ? `\nWarnings: ${warnings.join('; ')}` : ''

  return `${header}\n${body}${warnStr}`
}

export function buildAttachmentContextBlock(
  result: IngestResult,
  options: { previewChars?: number; normalizedPath?: string } = {}
): string {
  const { previewChars = 2000, normalizedPath } = options
  const name = result.source?.original_name || 'file'
  const mediaType = result.media_type
  const engine = result.metadata?.engine || 'unknown'
  const warnings = result.warnings || []
  const chunks = result.chunks || []
  const pages = typeof result.metadata?.pages === 'number' ? result.metadata.pages : undefined

  const lines: string[] = []
  lines.push(`[Document: ${name}]`)
  lines.push(`Type: ${mediaType.toUpperCase()}`)
  if (pages != null) {
    lines.push(`Pages: ${pages}`)
  }
  if (chunks.length > 0) {
    lines.push(`Chunks: ${chunks.length}`)
  }
  lines.push(`Parser: ${engine}`)
  if (warnings.length > 0) {
    lines.push(`Warnings: ${warnings.join('; ')}`)
  }

  lines.push('')

  let previewText = ''
  if (result.text) {
    previewText = result.text
  } else if (chunks.length > 0) {
    const firstNChunks: typeof chunks = []
    let charCount = 0
    for (const chunk of chunks) {
      if (charCount + chunk.text.length > previewChars && firstNChunks.length > 0) break
      firstNChunks.push(chunk)
      charCount += chunk.text.length
    }
    previewText = firstNChunks.map(c => {
      const loc = c.page ? `p.${c.page}` : c.timestamp_start != null ? `${formatDuration(c.timestamp_start)}-${formatDuration(c.timestamp_end || c.timestamp_start)}` : ''
      return loc ? `${loc}: ${c.text}` : c.text
    }).join('\n\n')
  }

  if (previewText) {
    const truncated = previewText.length > previewChars
      ? previewText.slice(0, previewChars) + '\n...(truncated)'
      : previewText
    lines.push(`Preview (first ${previewChars} chars):`)
    lines.push(truncated)
    lines.push('')
  }

  const fileRef = normalizedPath || result.source?.safe_display_path || name
  lines.push(`Full content available via file reference: @file:${fileRef}`)

  return lines.join('\n')
}

export function canSendAttachment(state: AttachmentState): boolean {
  return state === 'parsed' || state === 'partial' || state === 'ready'
}

export function isAttachmentParsing(state: AttachmentState | 'pending' | string | undefined): boolean {
  if (!state) return false
  return state === 'queued' || state === 'pending' || state === 'parsing' || state === 'materializing'
}

export function isAttachmentFailed(state: AttachmentState): boolean {
  return state === 'failed' || state === 'unsupported'
}

export async function materializeIngestResult(
  resultId: string,
  result: IngestResult
): Promise<string> {
  const name = result.source?.original_name || 'file'
  const mediaType = result.media_type
  const engine = result.metadata?.engine || 'unknown'
  const warnings = result.warnings || []
  const chunks = result.chunks || []
  const pages = typeof result.metadata?.pages === 'number' ? result.metadata.pages : undefined

  const lines: string[] = []
  lines.push(`# ${name}`)
  lines.push('')
  lines.push(`- Type: ${mediaType}`)
  lines.push(`- Parser: ${engine}`)
  if (pages != null) {
    lines.push(`- Pages: ${pages}`)
  }
  lines.push(`- Chunks: ${chunks.length}`)
  lines.push('')

  if (warnings.length > 0) {
    lines.push('## Warnings')
    lines.push('')
    for (const warning of warnings) {
      lines.push(`- ${warning}`)
    }
    lines.push('')
  }

  lines.push('## Content')
  lines.push('')

  if (result.text) {
    lines.push(result.text)
  } else if (chunks.length > 0) {
    for (const chunk of chunks) {
      const loc = chunk.page
        ? `p.${chunk.page}`
        : chunk.timestamp_start != null
          ? `${formatDuration(chunk.timestamp_start)}-${formatDuration(chunk.timestamp_end || chunk.timestamp_start)}`
          : ''
      const header = loc ? `**${loc}**\n\n` : ''
      const text = chunk.markdown || chunk.text
      lines.push(`${header}${text}`)
      lines.push('')
    }
  }

  const markdown = lines.join('\n')

  try {
    const res = await api<{ normalizedPath?: string }>('/api/ingest/materialize', {
      method: 'POST',
      body: { resultId, markdown, originalName: name }
    })
    if (res.normalizedPath) {
      return res.normalizedPath
    }
  } catch {
    // Backend not available yet; return the resultId as a placeholder
  }

  return resultId
}
