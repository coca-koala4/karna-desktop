import { useEffect, useState } from 'react'

import { FieldRow, WorkshopEmpty, WorkshopMetric, WorkshopPanel, WorkshopStatus } from '@/components/karna/workshop'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { notifyError } from '@/store/notifications'

import { api, projectRef, type WriterProject } from '../workshop-state'

interface DocumentRow { id: string; title: string; rel: string; kind: string; chars: number; lines: number; preview?: string; mtime?: string }
interface DocumentNodeRow { id: string; document_id: string; project_rel: string; title: string; start_line: number; end_line: number; chars: number; summary?: string }
interface DocumentEngineResponse { ok: boolean; documents?: DocumentRow[]; nodes?: DocumentNodeRow[]; updated_at?: string | null }
interface RagChunk { id: string; node_id?: string; project_rel?: string; title?: string; summary?: string; text?: string; start_line?: number; end_line?: number; score?: number; score_detail?: { vector?: number; lexical?: number }; retrieval?: { mode?: string; vector_id?: string; dimensions?: number; provider?: string; model?: string } }
interface VectorHealth { chunks?: number; vectors?: number; current?: number; missing?: number; stale?: number; orphaned?: number; coverage?: number; ready?: boolean }
interface VectorDatabase { engine?: string; storage?: string; vectors?: number; dimensions?: number; provider?: { id?: string; kind?: string; model?: string; dimensions?: number }; updated_at?: string | null; segments?: Array<{ rel?: string; rows?: number; bytes?: number; sha1?: string }> }
interface VectorDbVerification { ok?: boolean; vectors?: number; db_vectors?: number; segment_rows?: number; coverage?: number; failures?: Array<{ rel?: string; reason?: string; ok?: boolean }>; repair_action?: string | null; at?: string }
interface RagCitation { id: string; title?: string; source_rel?: string; line_start?: number; line_end?: number; score?: number; excerpt?: string }
interface RagContextPack { id: string; query: string; created_at: string; mode?: string; provider?: string; model?: string; citations?: RagCitation[]; prompt_context?: string; stats?: { citations?: number; chars?: number; estimated_tokens?: number } }
interface RagStats { chunks?: number; documents?: number; vectorized?: number; vector_total?: number; vector_dimensions?: number; vector_provider?: string; vector_model?: string; vector_coverage?: number; vector_missing?: number; vector_stale?: number; vector_orphaned?: number; contexts?: number; mode?: string }
interface RagResponse { ok: boolean; chunks?: RagChunk[]; results?: RagChunk[]; contexts?: RagContextPack[]; context?: RagContextPack; search?: { stats?: RagStats }; stats?: RagStats; vector_health?: VectorHealth; vector_database?: VectorDatabase; vector_db_verification?: VectorDbVerification; updated_at?: string | null; query?: string; vectorized?: boolean; mode?: string; fallback_reason?: string | null }
interface CreativeSearchResult { id: string; kind: string; title: string; text?: string; evidence?: string; score?: number; meta?: Record<string, unknown> }
interface CreativeSearchResponse { ok: boolean; query?: string; results?: CreativeSearchResult[]; queries?: Array<{ id: string; query: string; at: string; results: number }>; stats?: { searchable_items?: number; result_count?: number; kinds?: Record<string, number> }; updated_at?: string | null; mode?: string }

const KIND_TONE: Record<string, 'info' | 'success' | 'warning' | 'neutral'> = {
  manuscript: 'success',
  import: 'info',
  'character-note': 'info',
  'world-note': 'info',
  research: 'info',
  note: 'neutral',
  source: 'warning'
}

export function KnowledgePanel({ active, busy, setBusy }: { active: WriterProject | null; busy: string; setBusy: (v: string) => void }) {
  const [docs, setDocs] = useState<DocumentRow[]>([])
  const [nodes, setNodes] = useState<DocumentNodeRow[]>([])
  const [docsUpdated, setDocsUpdated] = useState<string | null>(null)
  const [rag, setRag] = useState<RagChunk[]>([])
  const [ragResults, setRagResults] = useState<RagChunk[]>([])
  const [ragContexts, setRagContexts] = useState<RagContextPack[]>([])
  const [activeContext, setActiveContext] = useState<RagContextPack | null>(null)
  const [ragStats, setRagStats] = useState<RagStats>({})
  const [vectorHealth, setVectorHealth] = useState<VectorHealth>({})
  const [vectorDatabase, setVectorDatabase] = useState<VectorDatabase | null>(null)
  const [vectorDbVerification, setVectorDbVerification] = useState<VectorDbVerification | null>(null)
  const [ragUpdated, setRagUpdated] = useState<string | null>(null)
  const [ragQuery, setRagQuery] = useState('')
  const [vectorProvider, setVectorProvider] = useState<'local' | 'auto' | 'embedding'>('local')
  const [csQuery, setCsQuery] = useState('')
  const [csResults, setCsResults] = useState<CreativeSearchResult[]>([])
  const [csHistory, setCsHistory] = useState<CreativeSearchResponse['queries']>([])
  const [csStats, setCsStats] = useState<NonNullable<CreativeSearchResponse['stats']>>({})
  const [csUpdated, setCsUpdated] = useState<string | null>(null)

  const ref = projectRef(active)

  const applyRag = (r: RagResponse) => {
    setRag(r.chunks || [])
    setRagResults(r.results || [])
    setRagContexts(r.contexts || [])
    setActiveContext(r.context || r.contexts?.[0] || null)
    setRagStats(r.search?.stats || r.stats || {})
    setVectorHealth(r.vector_health || {})
    setVectorDatabase(r.vector_database || null)
    setVectorDbVerification(r.vector_db_verification || null)
    setRagUpdated(r.updated_at || null)
  }

  const refreshAll = async () => {
    if (!active) {return}

    try {
      const [d, r, c] = await Promise.all([
        api<DocumentEngineResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/documents`),
        api<RagResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/rag`),
        api<CreativeSearchResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/creative-search`)
      ])

      setDocs(d.documents || [])
      setNodes(d.nodes || [])
      setDocsUpdated(d.updated_at || null)
      setRag(r.chunks || [])
      setRagResults(r.results || [])
      setRagContexts(r.contexts || [])
      setActiveContext(r.contexts?.[0] || null)
      setRagStats(r.stats || {})
      setVectorHealth(r.vector_health || {})
      setVectorDatabase(r.vector_database || null)
      setVectorDbVerification(r.vector_db_verification || null)
      setRagUpdated(r.updated_at || null)
      setCsResults(c.results || [])
      setCsHistory(c.queries || [])
      setCsStats(c.stats || {})
      setCsUpdated(c.updated_at || null)
    } catch (err) { notifyError(err, '知识面板加载失败') }
  }

  useEffect(() => {
    setDocs([]); setNodes([]); setRag([]); setRagResults([]); setRagContexts([]); setActiveContext(null); setVectorHealth({}); setVectorDatabase(null); setVectorDbVerification(null); setCsResults([]); setCsHistory([])

    if (!active) {return}
    void refreshAll()
  }, [ref, active?.id])

  const syncDocuments = async () => {
    if (!active) {return}
    setBusy('documents')

    try {
      const result = await api<DocumentEngineResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/documents`, 'POST', {})
      setDocs(result.documents || [])
      setNodes(result.nodes || [])
      setDocsUpdated(result.updated_at || null)
    } catch (err) { notifyError(err, '文档同步失败') } finally { setBusy('') }
  }

  const buildRag = async () => {
    if (!active) {return}
    setBusy('rag')

    try {
      const result = await api<RagResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/rag`, 'POST', { action: 'build' })
      applyRag(result)
    } catch (err) { notifyError(err, 'RAG 索引构建失败') } finally { setBusy('') }
  }

  const buildVectorStore = async () => {
    if (!active) {return}
    setBusy('rag-vector')

    try {
      const result = await api<RagResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/rag`, 'POST', { action: 'vectorize', provider: vectorProvider, rebuildIndex: true })
      applyRag(result)
    } catch (err) { notifyError(err, '向量数据库构建失败') } finally { setBusy('') }
  }

  const verifyVectorDb = async () => {
    if (!active) {return}
    setBusy('rag-vector-verify')

    try {
      const result = await api<RagResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/rag`, 'POST', { action: 'verify-vector-db' })
      setVectorDatabase(result.vector_database || vectorDatabase)
      setVectorHealth(result.vector_health || vectorHealth)
      setVectorDbVerification(result.vector_db_verification || null)
      setRagUpdated(result.updated_at || null)
    } catch (err) { notifyError(err, '向量数据库校验失败') } finally { setBusy('') }
  }

  const searchRag = async () => {
    if (!active) {return}
    setBusy('rag-search')

    try {
      const result = await api<RagResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/rag`, 'POST', { action: 'search', query: ragQuery, limit: 8, provider: vectorProvider })
      applyRag(result)
    } catch (err) { notifyError(err, 'RAG 检索失败') } finally { setBusy('') }
  }

  const assembleContext = async () => {
    if (!active) {return}
    setBusy('rag-context')

    try {
      const result = await api<RagResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/rag`, 'POST', { action: 'context', query: ragQuery, limit: 6, provider: vectorProvider })
      setRagResults(result.results || result.context?.citations?.map(c => ({ id: c.id, title: c.title, project_rel: c.source_rel, start_line: c.line_start, end_line: c.line_end, score: c.score, summary: c.excerpt })) || [])
      setRagContexts(result.contexts || (result.context ? [result.context] : []))
      setActiveContext(result.context || result.contexts?.[0] || null)
      setRagStats(result.search?.stats || result.stats || {})
      setVectorHealth(result.vector_health || {})
      setVectorDatabase(result.vector_database || vectorDatabase)
      setVectorDbVerification(result.vector_db_verification || vectorDbVerification)
      setRagUpdated(result.updated_at || null)
    } catch (err) { notifyError(err, 'RAG 上下文组装失败') } finally { setBusy('') }
  }

  const runCreativeSearch = async () => {
    if (!active) {return}
    setBusy('creative-search')

    try {
      const result = await api<CreativeSearchResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/creative-search`, 'POST', { query: csQuery, limit: 20 })
      setCsResults(result.results || [])
      setCsHistory(result.queries || [])
      setCsStats(result.stats || {})
      setCsUpdated(result.updated_at || null)
    } catch (err) { notifyError(err, '创作检索失败') } finally { setBusy('') }
  }

  if (!active) {return <WorkshopEmpty>先选择项目，再打开知识 / RAG 面板。</WorkshopEmpty>}

  const dbSegment = vectorDatabase?.segments?.[0]
  const vectorDbRows = vectorDatabase?.vectors || 0
  const vectorCount = ragStats.vector_total || vectorHealth.vectors || 0
  const vectorCurrent = ragStats.vectorized || vectorHealth.current || 0
  const vectorCoverage = ragStats.vector_coverage ?? vectorHealth.coverage ?? 0

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-5">
        <WorkshopMetric accent="sky" hint={docsUpdated ? `已更新 ${formatTime(docsUpdated)}` : '未同步'} label="文档" value={docs.length} />
        <WorkshopMetric accent="violet" hint={ragStats.mode || 'lexical-local'} label="RAG 切片" value={rag.length} />
        <WorkshopMetric accent="rose" hint={ragStats.vector_dimensions ? `${ragStats.vector_dimensions} 维 / ${Math.round(vectorCoverage * 100)}%` : '未构建'} label="向量" value={`${vectorCurrent}/${vectorCount || vectorCurrent}`} />
        <WorkshopMetric accent="emerald" hint={dbSegment ? `${dbSegment.rows || 0} 行 / ${formatBytes(dbSegment.bytes || 0)}` : '未就绪'} label="向量库" value={vectorDbRows} />
        <WorkshopMetric accent="amber" hint={activeContext ? `${activeContext.stats?.estimated_tokens || 0} tokens` : '未就绪'} label="上下文" value={ragStats.contexts || ragContexts.length} />
      </div>

      <WorkshopPanel
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={() => void refreshAll()} size="sm" variant="outline"><Codicon name="refresh" /> 刷新</Button>
            <Button disabled={busy === 'documents'} onClick={() => void syncDocuments()} size="sm"><Codicon name="sync" /> 重扫</Button>
          </div>
        }
        description="扫描项目文件并构建可追溯的文档节点；RAG、图谱和叙事状态都以它们为证据。"
        title="文档引擎"
      >
        <div className="grid max-h-72 gap-1.5 overflow-auto md:grid-cols-2 xl:grid-cols-3">
          {docs.length === 0 ? <WorkshopEmpty>还没有文档索引。先点“重扫”，或导入稿件。</WorkshopEmpty> : null}
          {docs.map(d => (
            <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 p-2 text-xs" key={d.id}>
              <div className="flex items-center justify-between gap-1.5">
                <span className="truncate font-medium" title={d.rel}>{d.title}</span>
                <WorkshopStatus tone={KIND_TONE[d.kind] || 'neutral'}>{d.kind}</WorkshopStatus>
              </div>
              <div className="mt-0.5 truncate font-mono text-[0.6rem] text-muted-foreground">{d.rel}</div>
              <div className="mt-1 text-[0.7rem] text-muted-foreground tabular-nums">{d.lines} 行 / {formatChars(d.chars)}</div>
              {d.preview ? <p className="mt-1 line-clamp-2 text-[0.7rem] text-muted-foreground">{d.preview}</p> : null}
            </div>
          ))}
        </div>
      </WorkshopPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <WorkshopPanel
          actions={
            <div className="flex items-center gap-2">
              <select
                className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background px-2 py-1 text-xs"
                onChange={e => setVectorProvider(e.target.value as 'local' | 'auto' | 'embedding')}
                title="Vector provider"
                value={vectorProvider}
              >
                <option value="local">本地哈希</option>
                <option value="auto">自动：优先向量嵌入</option>
                <option value="embedding">强制向量嵌入</option>
              </select>
              <Button disabled={busy === 'rag'} onClick={() => void buildRag()} size="sm" variant="outline"><Codicon name="build" /> 构建索引</Button>
              <Button disabled={busy === 'rag-vector'} onClick={() => void buildVectorStore()} size="sm" variant="outline"><Codicon name="database" /> 构建向量库</Button>
              <Button disabled={busy === 'rag-vector-verify'} onClick={() => void verifyVectorDb()} size="sm" variant="outline"><Codicon name="shield" /> 校验向量库</Button>
              <Button disabled={busy === 'rag-search' || !ragQuery.trim()} onClick={() => void searchRag()} size="sm">检索</Button>
              <Button disabled={busy === 'rag-context' || !ragQuery.trim()} onClick={() => void assembleContext()} size="sm" variant="outline">组装上下文</Button>
            </div>
          }
          description="项目级本地向量数据库，带词法检索兜底。构建时同时写入 rag/vector_store.json 和 rag/vector_db/segments/vectors.jsonl。"
          title="RAG Pipeline / Vector DB"
        >
          <div className="mb-3 grid gap-2 rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/60 p-2 text-xs text-muted-foreground md:grid-cols-2 xl:grid-cols-3">
            <div>Mode: <span className="font-mono text-foreground">{ragStats.mode || 'lexical-local'}</span></div>
            <div>当前向量数：<span className="font-mono text-foreground">{vectorCurrent}/{vectorCount || vectorCurrent}</span></div>
            <div>Dimensions: <span className="font-mono text-foreground">{ragStats.vector_dimensions || vectorDatabase?.dimensions || 0}</span></div>
            <div>Provider: <span className="font-mono text-foreground">{ragStats.vector_provider || vectorDatabase?.provider?.id || 'local-hash-vector'}</span></div>
            <div>Coverage: <span className="font-mono text-foreground">{Math.round(vectorCoverage * 100)}%</span></div>
            <div>Pending: <span className="font-mono text-foreground">{(ragStats.vector_missing || 0) + (ragStats.vector_stale || 0)}</span></div>
            <div>DB engine: <span className="font-mono text-foreground">{vectorDatabase?.engine || 'not-built'}</span></div>
            <div>DB segment: <span className="font-mono text-foreground">{dbSegment?.rel || 'not-built'}</span></div>
            <div>DB hash: <span className="font-mono text-foreground">{dbSegment?.sha1?.slice(0, 10) || '-'}</span></div>
            <div>DB verify: <span className="font-mono text-foreground">{vectorDbVerification ? (vectorDbVerification.ok ? 'pass' : 'fail') : 'not-run'}</span></div>
            <div>DB rows: <span className="font-mono text-foreground">{vectorDbVerification?.segment_rows ?? vectorDbRows}</span></div>
            <div>DB failures: <span className="font-mono text-foreground">{vectorDbVerification?.failures?.length || 0}</span></div>
          </div>
          <FieldRow label="RAG 问题">
            <input className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background px-2 py-1.5 text-sm" onChange={e => setRagQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') {void searchRag()} }} placeholder="例如：人物目标、伏笔位置、世界观规则证据" value={ragQuery} />
          </FieldRow>
          <div className="mt-3 grid gap-1.5">
            {ragResults.length === 0 ? <WorkshopEmpty>先构建索引和向量库，然后在这里检索证据。</WorkshopEmpty> : null}
            {ragResults.map(r => (
              <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 p-2 text-xs" key={r.id}>
                <div className="flex items-center justify-between gap-1.5">
                  <span className="truncate font-medium">{r.title || r.project_rel}</span>
                  <div className="flex items-center gap-1.5">
                    {r.retrieval?.mode ? <WorkshopStatus tone={r.retrieval.mode.includes('vector') ? 'success' : 'warning'}>{r.retrieval.mode}</WorkshopStatus> : null}
                    {typeof r.score === 'number' ? <span className="font-mono text-[0.65rem] tabular-nums text-muted-foreground">{r.score.toFixed(2)}</span> : null}
                  </div>
                </div>
                <div className="font-mono text-[0.6rem] text-muted-foreground">{r.project_rel}:{r.start_line || 1}-{r.end_line || ''}</div>
                {r.score_detail ? <div className="mt-1 font-mono text-[0.6rem] text-muted-foreground">vector {Number(r.score_detail.vector || 0).toFixed(3)} / lexical {Number(r.score_detail.lexical || 0).toFixed(3)} / {r.retrieval?.provider || ''} / {r.retrieval?.vector_id || 'no-vector-id'}</div> : null}
                <p className="mt-1 line-clamp-3 text-[0.7rem] text-muted-foreground">{r.summary || r.text || ''}</p>
              </div>
            ))}
          </div>
          {activeContext ? (
            <div className="mt-3 rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 p-2 text-xs">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <div className="truncate font-medium">上下文包： {activeContext.query}</div>
                <WorkshopStatus tone="success">{activeContext.stats?.citations || activeContext.citations?.length || 0} citations</WorkshopStatus>
              </div>
              <div className="mb-2 font-mono text-[0.6rem] text-muted-foreground">
                {activeContext.id} / {activeContext.mode || 'unknown'} / {activeContext.provider || 'local'} / {activeContext.stats?.estimated_tokens || 0} tokens
              </div>
              <div className="grid max-h-44 gap-1 overflow-auto">
                {(activeContext.citations || []).map(c => (
                  <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/80 p-1.5" key={c.id}>
                    <div className="font-mono text-[0.6rem] text-muted-foreground">[{c.id}] {c.source_rel}:{c.line_start || 1}-{c.line_end || ''} / {Number(c.score || 0).toFixed(3)}</div>
                    <p className="mt-0.5 line-clamp-2 text-[0.7rem] text-muted-foreground">{c.excerpt}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </WorkshopPanel>

        <WorkshopPanel
          actions={
            <Button disabled={busy === 'creative-search' || !csQuery.trim()} onClick={() => void runCreativeSearch()} size="sm">检索</Button>
          }
          description="跨文档、Story Bible、Living Wiki、图谱和叙事状态检索人物弧光、伏笔证据和设定冲突。"
          title="创作检索"
        >
          <FieldRow label="创作问题">
            <input className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background px-2 py-1.5 text-sm" onChange={e => setCsQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') {void runCreativeSearch()} }} placeholder="例如：银色钥匙在哪几处出现？角色的核心冲突是什么？" value={csQuery} />
          </FieldRow>
          <div className="mt-3 grid max-h-72 gap-1.5 overflow-auto">
            {csResults.length === 0 ? <WorkshopEmpty>先同步文档并重建 Story Bible，再检索。</WorkshopEmpty> : null}
            {csResults.map(r => (
              <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 p-2 text-xs" key={r.id}>
                <div className="flex items-center justify-between gap-1.5">
                  <span className="truncate font-medium">{r.title}</span>
                  <div className="flex items-center gap-1.5">
                    <WorkshopStatus tone="info">{r.kind}</WorkshopStatus>
                    {typeof r.score === 'number' ? <span className="font-mono text-[0.65rem] tabular-nums text-muted-foreground">{r.score.toFixed(2)}</span> : null}
                  </div>
                </div>
                {r.evidence ? <div className="font-mono text-[0.6rem] text-muted-foreground">{r.evidence}</div> : null}
                {r.text ? <p className="mt-1 line-clamp-2 text-[0.7rem] text-muted-foreground">{r.text}</p> : null}
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/60 p-2 text-xs text-muted-foreground">
            <div>可检索条目： <span className="font-mono text-foreground">{csStats.searchable_items || 0}</span></div>
            <div>历史： <span className="font-mono text-foreground">{csHistory?.length || 0}</span></div>
            <div>更新： <span className="font-mono text-foreground">{csUpdated ? formatTime(csUpdated) : '-'}</span></div>
          </div>
        </WorkshopPanel>
      </div>
    </div>
  )
}

function formatTime(iso: string): string {
  const t = new Date(iso).getTime()

  if (Number.isNaN(t)) {return iso}

  return new Date(t).toLocaleString()
}

function formatChars(n: number): string {
  if (n < 1000) {return `${n}`}

  if (n < 1_000_000) {return `${(n / 1000).toFixed(1)}k`}

  return `${(n / 1_000_000).toFixed(2)}M`
}

function formatBytes(n: number): string {
  if (n < 1024) {return `${n} B`}

  if (n < 1024 * 1024) {return `${(n / 1024).toFixed(1)} KB`}

  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
