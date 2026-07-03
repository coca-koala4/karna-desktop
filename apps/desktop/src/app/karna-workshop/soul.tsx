
import { type ReactNode, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { notify, notifyError } from '@/store/notifications'

interface SoulAuthor { id: string; slug: string; name: string; folder: string; texts_count?: number; chunks_count?: number; web_evidence_count?: number; profile_version?: number; profile_updated_at?: string | null }
interface SoulText { id: string; title: string; chars: number; copyright_status: string; cleaned_file?: string; imported_at?: string }
interface SoulChunk { chunk_id: string; title: string; chapter: string; scene: string; text: string; summary: string; embedding_type: string; source_file: string; line_start: number; tags?: string[]; score?: number }
interface SoulProfile { updated_at?: string | null; narrative_methods?: unknown[]; dialogue_features?: unknown[]; imagery_system?: unknown[]; safe_transfer_principles?: unknown[]; do_not_copy?: unknown[]; evidence_refs?: unknown[] }
interface SoulDetail { ok: boolean; author: SoulAuthor; metadata: { texts?: SoulText[] }; chunks?: SoulChunk[]; profile?: SoulProfile; web?: { sources?: Array<Record<string, unknown>>; claims?: Array<Record<string, unknown>>; conflicts?: Array<Record<string, unknown>> }; risk_profile?: { checks?: Array<Record<string, unknown>> } }
interface KnowledgeLibrary { id: string; name: string; folder?: string; description?: string; documents?: number; chunks?: number; vectorized?: boolean }
interface KnowledgeStore { config?: Record<string, unknown>; libraries?: KnowledgeLibrary[] }

const C = {
  workshop: '\u7075\u9b42\u5de5\u574a',
  subtitle: '\u672c\u5730\u5bfc\u5165\u4f5c\u54c1\uff0c\u5efa\u7acb\u4f5c\u5bb6\u7814\u7a76\u5e93\uff0c\u8054\u7f51\u641c\u96c6\u516c\u5f00\u8bc4\u8bba\u548c\u8bbf\u8c08\u8bc1\u636e\uff0c\u84b8\u998f\u53ef\u8fc1\u79fb\u521b\u4f5c\u65b9\u6cd5\uff1b\u4e0d\u505a\u4eff\u5199\u6309\u94ae\uff0c\u4e0d\u590d\u523b\u4eba\u683c\u3002',
  p1: '\u5b66\u4e60\u65b9\u6cd5\uff0c\u4e0d\u590d\u5236\u8868\u8fbe',
  p2: '\u8fc1\u79fb\u539f\u5219\uff0c\u4e0d\u590d\u523b\u4eba\u683c',
  p3: '\u8f85\u52a9\u4f5c\u8005\uff0c\u4e0d\u66ff\u4ee3\u4f5c\u8005',
  p4: '\u5c0a\u91cd\u4f5c\u54c1\uff0c\u4e0d\u69a8\u5e72\u4f5c\u54c1',
  authorLibrary: '\u4f5c\u5bb6\u5e93',
  text: '\u6587\u672c',
  createFirst: '\u5148\u521b\u5efa\u4e00\u4e2a\u4f5c\u5bb6\u7814\u7a76\u5e93\u3002',
  newAuthor: '\u65b0\u5efa\u4f5c\u5bb6',
  authorPlaceholder: '\u4f5c\u5bb6 / \u6279\u8bc4\u5bb6 / \u65b9\u6cd5\u6765\u6e90',
  createAuthor: '\u521b\u5efa\u4f5c\u5bb6\u5e93',
  profileSummary: '\u6863\u6848\u6458\u8981',
  ready: '\u5df2\u751f\u6210',
  emptyStatus: '\u672a\u751f\u6210',
  distillFirst: '\u84b8\u998f\u540e\u663e\u793a\u5b89\u5168\u8fc1\u79fb\u539f\u5219\u3002',
  localImport: '\u672c\u5730\u5bfc\u5165',
  titlePlaceholder: '\u4f5c\u54c1\u540d\uff08\u53ef\u9009\uff09',
  importFiles: '\u5bfc\u5165 txt/md/docx/pdf/epub',
  importEmpty: '\u5bfc\u5165\u540e\u663e\u793a\u771f\u5b9e\u6587\u4ef6\u3001\u5b57\u7b26\u6570\u3001\u7248\u6743\u5b57\u6bb5\u548c\u89e3\u6790\u72b6\u6001\u3002',
  chars: '\u5b57\u7b26',
  processSearch: '\u5904\u7406\u4e0e\u68c0\u7d22',
  processButton: '\u89e3\u6790\u6e05\u6d17\u5e76\u751f\u6210\u5206\u5757',
  currentChunks: '\u5f53\u524d\u5206\u5757',
  queryPlaceholder: '\u68c0\u7d22\u4e3b\u9898 / \u4eba\u7269 / \u610f\u8c61 / \u6280\u6cd5',
  search: '\u68c0\u7d22',
  vectorHybrid: '\u5411\u91cf + \u5173\u952e\u8bcd\u6df7\u5408\u68c0\u7d22',
  keywordFallback: '\u5173\u952e\u8bcd fallback',
  webPlaceholder: '\u9ed8\u8ba4\u641c\u7d22\u5f53\u524d\u4f5c\u5bb6',
  webButton: '\u8054\u7f51\u641c\u96c6',
  webEmpty: '\u8054\u7f51\u8d44\u6599\u5148\u8fdb\u5165\u8054\u7f51\u8bc1\u636e\u5e93\uff0c\u53ea\u4fdd\u5b58\u6765\u6e90\u6458\u8981\u3001\u89c2\u70b9\u3001\u53ef\u4fe1\u5ea6\u3001\u94fe\u63a5\u548c\u98ce\u9669\u3002',
  confidence: '\u53ef\u4fe1\u5ea6',
  sourceCount: '\u6765\u6e90\u6570',
  distillProfile: '\u84b8\u998f\u7075\u9b42\u6863\u6848',
  exportSkill: '\u5bfc\u51fa\u6280\u80fd\u5305',
  narrative: '\u53d9\u4e8b\u65b9\u6cd5',
  dialogue: '\u5bf9\u767d\u7279\u5f81',
  imagery: '\u610f\u8c61\u7cfb\u7edf',
  doNotCopy: '\u4e0d\u8981\u590d\u5236',
  none: '\u6682\u65e0',
  criticSafety: '\u6279\u8bc4\u4e0e\u98ce\u683c\u5b89\u5168',
  noImitation: '\u4e0d\u8f93\u51fa\u4eff\u5199',
  userTextPlaceholder: '\u7c98\u8d34\u7528\u6237\u4f5c\u54c1\u7247\u6bb5\uff0c\u7528\u4e8e\u6279\u8bc4\u6216\u76f8\u4f3c\u5ea6\u98ce\u9669\u68c0\u6d4b\u3002',
  criticButton: '\u6279\u8bc4\u5efa\u8bae',
  riskButton: '\u98ce\u9669\u68c0\u6d4b',
  criticEmpty: '\u6279\u8bc4\u53ea\u7ed9\u8282\u594f\u3001\u51b2\u7a81\u3001\u4eba\u7269\u548c\u65b9\u6cd5\u8fc1\u79fb\u5efa\u8bae\u3002',
  riskEmpty: '\u9ad8\u98ce\u9669/\u7981\u6b62\u65f6\u53ea\u7ed9\u964d\u98ce\u9669\u5efa\u8bae\uff0c\u4e0d\u7ed9\u4eff\u5199\u6587\u672c\u3002',
  chunkEmpty: '\u5904\u7406\u540e\u8fd9\u91cc\u4f1a\u5c55\u793a\u771f\u5b9e\u5206\u5757\u548c\u8bc1\u636e\u4f4d\u7f6e\u3002',
  privateRag: '\u672c\u5730\u79c1\u6709 RAG',
  webEvidence: '\u8054\u7f51\u8bc1\u636e\u5e93',
  ragKnowledge: 'RAG 知识库',
  ragMeta: '从设置迁移',
  ragDesc: '知识库导入、重建索引、检索测试和向量化状态归属灵魂工坊；设置页只保留底层模型与 provider 配置。',
  importKnowledge: '导入知识库文件夹',
  reindexKnowledge: '重建索引',
  knowledgeEmpty: '还没有知识库。导入文件夹后，这里会显示文档数、chunk 数和向量化状态。',
  vectorized: '已向量化',
  notVectorized: '未向量化',
  documents: '文档',
  chunks: '分块',
  embedding: 'Embedding',
  soulProfile: '\u7075\u9b42\u6863\u6848',
  evidenceRefs: '\u6761\u8bc1\u636e',
  claimUnit: '\u6761\u89c2\u70b9',
  loadFail: '\u7075\u9b42\u5de5\u574a\u52a0\u8f7d\u5931\u8d25',
  createOk: '\u5df2\u521b\u5efa\u4f5c\u5bb6\u5e93',
  createFail: '\u521b\u5efa\u4f5c\u5bb6\u5e93\u5931\u8d25',
  pickTitle: '\u9009\u62e9\u672c\u5730\u4f5c\u54c1\u6216\u7814\u7a76\u8d44\u6599',
  importFail: '\u5bfc\u5165\u5931\u8d25',
  imported: '\u5df2\u5bfc\u5165',
  importedMsg: '\u4e2a\u6587\u4ef6\u5df2\u89e3\u6790\u843d\u76d8',
  processed: '\u5904\u7406\u5b8c\u6210',
  processFail: '\u5904\u7406\u5931\u8d25',
  searchFail: '\u68c0\u7d22\u5931\u8d25',
  webOk: '\u8054\u7f51\u8bc1\u636e\u5e93\u5df2\u66f4\u65b0',
  webFail: '\u8054\u7f51\u8d44\u6599\u641c\u96c6\u5931\u8d25',
  distillOk: '\u7075\u9b42\u6863\u6848\u5df2\u84b8\u998f',
  distillMsg: '\u7ed3\u6784\u5316\u6863\u6848\u5df2\u5e26\u8bc1\u636e\u56de\u6eaf\u843d\u76d8',
  distillFail: '\u84b8\u998f\u5931\u8d25',
  criticFail: '\u6279\u8bc4\u5931\u8d25',
  riskFail: '\u98ce\u9669\u68c0\u6d4b\u5931\u8d25',
  skillOk: '\u6280\u80fd\u5305\u5df2\u5bfc\u51fa',
  skillFail: '\u5bfc\u51fa\u6280\u80fd\u5305\u5931\u8d25'
}

async function api<TData>(path: string, method = 'GET', body?: unknown): Promise<TData> { return window.karnaDesktop.api<TData>({ path, method, body }) }
function Card({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) { return <section className="rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm"><div className="mb-3 flex items-start justify-between gap-3"><h2 className="text-sm font-semibold">{title}</h2>{meta ? <span className="rounded-full border border-border/70 px-2 py-0.5 text-[0.68rem] text-muted-foreground">{meta}</span> : null}</div>{children}</section> }
function Empty({ children }: { children: ReactNode }) { return <div className="rounded-xl border border-dashed border-border/70 p-3 text-sm text-muted-foreground">{children}</div> }
function itemValue(item: unknown) { if (typeof item === 'string') return item; if (item && typeof item === 'object' && 'value' in item) return String((item as { value?: unknown }).value || ''); return JSON.stringify(item, null, 2) }

export function SoulWorkshopFullView() {
  const [authors, setAuthors] = useState<SoulAuthor[]>([])
  const [activeId, setActiveId] = useState('')
  const [detail, setDetail] = useState<SoulDetail | null>(null)
  const [busy, setBusy] = useState('')
  const [name, setName] = useState('')
  const [title, setTitle] = useState('')
  const [copyrightStatus, setCopyrightStatus] = useState('user_provided')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<{ vectorized?: boolean; results?: SoulChunk[]; message?: string } | null>(null)
  const [webQuery, setWebQuery] = useState('')
  const [userText, setUserText] = useState('')
  const [critic, setCritic] = useState<Record<string, unknown> | null>(null)
  const [risk, setRisk] = useState<Record<string, unknown> | null>(null)
  const [knowledge, setKnowledge] = useState<KnowledgeStore>({})
  const active = useMemo(() => authors.find(a => a.id === activeId) || authors[0] || null, [authors, activeId])
  const ref = active?.slug || active?.id || ''
  const refreshAuthors = async () => { const r = await api<{ ok: boolean; authors?: SoulAuthor[]; active_author_id?: string }>('/api/soul/authors'); const rows = r.authors || []; setAuthors(rows); setActiveId(x => x || r.active_author_id || rows[0]?.id || '') }
  const refreshDetail = async (a = active) => { if (!a) return; setDetail(await api<SoulDetail>(`/api/soul/authors/${encodeURIComponent(a.slug || a.id)}`)) }
  const refreshKnowledge = async () => { setKnowledge(await api<KnowledgeStore>('/api/knowledge')) }
  useEffect(() => { void refreshAuthors().catch(err => notifyError(err, C.loadFail)) }, [])
  useEffect(() => { void refreshKnowledge().catch(() => undefined) }, [])
  useEffect(() => { void refreshDetail().catch(() => undefined) }, [active?.id])
  const createAuthor = async () => { if (!name.trim()) return; setBusy('create'); try { const r = await api<{ ok: boolean; author: SoulAuthor }>('/api/soul/authors', 'POST', { name: name.trim() }); setName(''); await refreshAuthors(); setActiveId(r.author.id); notify({ kind: 'success', title: C.createOk, message: r.author.name }) } catch (e) { notifyError(e, C.createFail) } finally { setBusy('') } }
  const importFiles = async () => { if (!active) return; const paths = await window.karnaDesktop.selectPaths({ multiple: true, title: C.pickTitle, filters: [{ name: C.localImport, extensions: ['txt', 'md', 'markdown', 'docx', 'pdf', 'epub'] }] }); if (!paths.length) return; setBusy('import'); try { const r = await api<{ ok: boolean; imported?: SoulText[]; error?: string }>(`/api/soul/authors/${encodeURIComponent(ref)}/import`, 'POST', { paths, title, copyright_status: copyrightStatus, genre: 'unknown', source: 'local_upload' }); if (!r.ok) throw new Error(r.error || C.importFail); setTitle(''); await refreshAuthors(); await refreshDetail(active); notify({ kind: 'success', title: C.imported, message: `${r.imported?.length || 0} ${C.importedMsg}` }) } catch (e) { notifyError(e, C.importFail) } finally { setBusy('') } }
  const process = async () => { if (!active) return; setBusy('process'); try { const r = await api<{ ok: boolean; stats?: Record<string, number> }>(`/api/soul/authors/${encodeURIComponent(ref)}/process`, 'POST', {}); await refreshAuthors(); await refreshDetail(active); notify({ kind: 'success', title: C.processed, message: `${r.stats?.total || 0} \u4e2a\u5206\u5757` }) } catch (e) { notifyError(e, C.processFail) } finally { setBusy('') } }
  const doSearch = async () => { if (!active || !query.trim()) return; setBusy('search'); try { setSearch(await api(`/api/soul/authors/${encodeURIComponent(ref)}/search`, 'POST', { query, limit: 8 })) } catch (e) { notifyError(e, C.searchFail) } finally { setBusy('') } }
  const webResearch = async () => { if (!active) return; setBusy('web'); try { const r = await api<{ ok: boolean; error?: string; sources?: unknown[]; claims?: unknown[] }>(`/api/soul/authors/${encodeURIComponent(ref)}/web-research`, 'POST', { query: webQuery || active.name }); if (!r.ok) throw new Error(r.error || C.webFail); await refreshAuthors(); await refreshDetail(active); notify({ kind: 'success', title: C.webOk, message: `${r.sources?.length || 0} \u4e2a\u6765\u6e90 / ${r.claims?.length || 0} \u6761\u89c2\u70b9` }) } catch (e) { notifyError(e, C.webFail) } finally { setBusy('') } }
  const distill = async () => { if (!active) return; setBusy('distill'); try { await api(`/api/soul/authors/${encodeURIComponent(ref)}/distill`, 'POST', {}); await refreshAuthors(); await refreshDetail(active); notify({ kind: 'success', title: C.distillOk, message: C.distillMsg }) } catch (e) { notifyError(e, C.distillFail) } finally { setBusy('') } }
  const runCritic = async () => { if (!active || !userText.trim()) return; setBusy('critic'); try { const r = await api<{ ok: boolean; report?: Record<string, unknown> }>(`/api/soul/authors/${encodeURIComponent(ref)}/critic`, 'POST', { text: userText }); setCritic(r.report || null) } catch (e) { notifyError(e, C.criticFail) } finally { setBusy('') } }
  const runRisk = async () => { if (!active || !userText.trim()) return; setBusy('risk'); try { const r = await api<{ ok: boolean; report?: Record<string, unknown> }>(`/api/soul/authors/${encodeURIComponent(ref)}/risk-check`, 'POST', { text: userText }); setRisk(r.report || null); await refreshDetail(active) } catch (e) { notifyError(e, C.riskFail) } finally { setBusy('') } }
  const exportSkill = async () => { if (!active) return; setBusy('export'); try { const r = await api<{ ok: boolean; skill_dir?: string }>(`/api/soul/authors/${encodeURIComponent(ref)}/export-skill`, 'POST', {}); notify({ kind: 'success', title: C.skillOk, message: r.skill_dir || '\u5b8c\u6210' }) } catch (e) { notifyError(e, C.skillFail) } finally { setBusy('') } }
  const importKnowledgeFolder = async () => { const paths = await window.karnaDesktop.selectPaths({ directories: true, multiple: false, title: C.importKnowledge }); const folder = paths[0]; if (!folder) return; setBusy('knowledge-import'); try { await api('/api/knowledge/import-folder', 'POST', { path: folder, recursive: true }); await refreshKnowledge(); notify({ kind: 'success', title: C.importKnowledge, message: folder }) } catch (e) { notifyError(e, C.importKnowledge) } finally { setBusy('') } }
  const reindexKnowledge = async () => { setBusy('knowledge-reindex'); try { await api('/api/knowledge/reindex', 'POST', {}); await refreshKnowledge(); notify({ kind: 'success', title: C.reindexKnowledge, message: '完成' }) } catch (e) { notifyError(e, C.reindexKnowledge) } finally { setBusy('') } }
  const deleteKnowledge = async (row: KnowledgeLibrary) => { if (!window.confirm(`确定删除知识库「${row.name}」吗？`)) return; setBusy('knowledge-delete'); try { await api(`/api/knowledge/libraries/${encodeURIComponent(row.id)}`, 'DELETE'); await refreshKnowledge() } catch (e) { notifyError(e, '删除知识库失败') } finally { setBusy('') } }
  const texts = detail?.metadata?.texts || []
  const chunks = detail?.chunks || []
  const profile = detail?.profile || {}
  const claims = detail?.web?.claims || []
  const sources = detail?.web?.sources || []
  const libraries = knowledge.libraries || []
  return <div className="min-h-full overflow-auto bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--ui-accent)_13%,transparent),transparent_34rem)] px-6 py-6 text-foreground"><div className="mx-auto grid max-w-7xl gap-5"><header className="rounded-3xl border border-border/70 bg-background/80 p-5 shadow-sm"><p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{'Karna ' + C.workshop}</p><h1 className="mt-1 text-2xl font-semibold">{C.workshop}</h1><p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">{C.subtitle}</p><div className="mt-3 grid gap-2 text-xs text-emerald-700 dark:text-emerald-200 sm:grid-cols-4"><span>{C.p1}</span><span>{C.p2}</span><span>{C.p3}</span><span>{C.p4}</span></div></header><div className="grid gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]"><aside className="grid content-start gap-4"><Card title={C.authorLibrary} meta={`${authors.length}`}><select className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={active?.id || ''} onChange={e => setActiveId(e.target.value)}>{authors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>{active ? <div className="mt-2 rounded-xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground"><b className="text-foreground">{active.name}</b><br />{C.text} {active.texts_count || 0} / {C.currentChunks} {active.chunks_count || 0} / {C.webEvidence} {active.web_evidence_count || 0}<br /><span className="font-mono">{active.folder}</span></div> : <Empty>{C.createFirst}</Empty>}</Card><Card title={C.newAuthor}><input className="mb-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={name} onChange={e => setName(e.target.value)} placeholder={C.authorPlaceholder} /><Button size="sm" disabled={!name.trim() || busy === 'create'} onClick={() => void createAuthor()}>{C.createAuthor}</Button></Card><Card title={C.profileSummary} meta={profile.updated_at ? C.ready : C.emptyStatus}><MiniList rows={profile.safe_transfer_principles || []} empty={C.distillFirst} /></Card></aside><main className="grid gap-5"><div className="grid gap-5 lg:grid-cols-2"><Card title={C.localImport} meta={C.privateRag}><input className="mb-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" placeholder={C.titlePlaceholder} value={title} onChange={e => setTitle(e.target.value)} /><select className="mb-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={copyrightStatus} onChange={e => setCopyrightStatus(e.target.value)}><option value="user_provided">{'\u7528\u6237\u63d0\u4f9b\uff0c\u4ec5\u79c1\u6709\u5206\u6790'}</option><option value="public_domain">{'\u516c\u7248 / \u516c\u5171\u9886\u57df'}</option><option value="unknown">{'\u672a\u77e5\u7248\u6743\u72b6\u6001'}</option></select><Button size="sm" disabled={!active || busy === 'import'} onClick={() => void importFiles()}>{C.importFiles}</Button><div className="mt-3 grid max-h-52 gap-2 overflow-auto">{texts.length ? texts.map(t => <div className="rounded-xl border border-border/60 p-2 text-xs" key={t.id}><b>{t.title}</b><br />{t.chars} {C.chars} / {copyrightLabel(t.copyright_status)}<br /><span className="font-mono text-muted-foreground">{t.cleaned_file}</span></div>) : <Empty>{C.importEmpty}</Empty>}</div></Card><Card title={C.processSearch} meta={'\u7ae0\u8282 / \u573a\u666f / \u6bb5\u843d'}><Button size="sm" disabled={!active || busy === 'process'} onClick={() => void process()}>{C.processButton}</Button><div className="mt-2 text-xs text-muted-foreground">{C.currentChunks}: {active?.chunks_count || chunks.length || 0}</div><div className="mt-3 flex gap-2"><input className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" value={query} onChange={e => setQuery(e.target.value)} placeholder={C.queryPlaceholder} /><Button size="sm" disabled={!query.trim()} onClick={() => void doSearch()}>{C.search}</Button></div>{search ? <div className="mt-2 text-xs text-muted-foreground">{search.vectorized ? C.vectorHybrid : C.keywordFallback} / {search.message}</div> : null}<ResultChunks rows={search?.results || chunks.slice(0, 6)} /></Card></div><div className="grid gap-5 lg:grid-cols-2"><Card title={C.webEvidence} meta={`${claims.length} ${C.claimUnit}`}><div className="flex gap-2"><input className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm" value={webQuery} onChange={e => setWebQuery(e.target.value)} placeholder={C.webPlaceholder} /><Button size="sm" disabled={!active || busy === 'web'} onClick={() => void webResearch()}>{C.webButton}</Button></div><div className="mt-3 grid max-h-64 gap-2 overflow-auto">{claims.length ? claims.slice(0, 8).map((c, i) => <div className="rounded-xl border border-border/60 p-2 text-xs" key={i}>{String(c.claim || '')}<br /><span className="text-muted-foreground">{C.confidence} {String(c.confidence || '')} / {String(c.source_url || '')}</span></div>) : <Empty>{C.webEmpty}</Empty>}</div><div className="mt-2 text-xs text-muted-foreground">{C.sourceCount}: {sources.length}</div></Card><Card title={C.soulProfile} meta={`${profile.evidence_refs?.length || 0} ${C.evidenceRefs}`}><Button size="sm" disabled={!active || busy === 'distill'} onClick={() => void distill()}>{C.distillProfile}</Button><Button className="ml-2" size="sm" variant="outline" disabled={!active || busy === 'export'} onClick={() => void exportSkill()}>{C.exportSkill}</Button><div className="mt-3 grid gap-3 lg:grid-cols-2"><MiniList title={C.narrative} rows={profile.narrative_methods || []} empty={C.none} /><MiniList title={C.dialogue} rows={profile.dialogue_features || []} empty={C.none} /><MiniList title={C.imagery} rows={profile.imagery_system || []} empty={C.none} /><MiniList title={C.doNotCopy} rows={profile.do_not_copy || []} empty={C.none} /></div></Card></div><Card title={C.ragKnowledge} meta={C.ragMeta}><p className="mb-3 text-sm leading-6 text-muted-foreground">{C.ragDesc}</p><div className="flex flex-wrap gap-2"><Button size="sm" disabled={busy === 'knowledge-import'} onClick={() => void importKnowledgeFolder()}>{C.importKnowledge}</Button><Button size="sm" variant="outline" disabled={busy === 'knowledge-reindex'} onClick={() => void reindexKnowledge()}>{C.reindexKnowledge}</Button></div><div className="mt-3 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">{C.embedding}: {String(knowledge.config?.embedding_model_name || knowledge.config?.embedding_model_id || '未配置')}</div><div className="mt-3 grid max-h-72 gap-2 overflow-auto">{libraries.length ? libraries.map(row => <div className="rounded-xl border border-border/60 p-2 text-xs" key={row.id}><div className="flex items-start justify-between gap-2"><div><b>{row.name}</b><br /><span className="font-mono text-muted-foreground">{row.folder || row.description || row.id}</span><br />{C.documents} {row.documents || 0} / {C.chunks} {row.chunks || 0} / {row.vectorized ? C.vectorized : C.notVectorized}</div><Button size="sm" variant="ghost" disabled={busy === 'knowledge-delete'} onClick={() => void deleteKnowledge(row)}>删除</Button></div></div>) : <Empty>{C.knowledgeEmpty}</Empty>}</div></Card><Card title={C.criticSafety} meta={C.noImitation}><textarea className="min-h-32 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" value={userText} onChange={e => setUserText(e.target.value)} placeholder={C.userTextPlaceholder} /><div className="mt-2 flex gap-2"><Button size="sm" disabled={!userText.trim() || busy === 'critic'} onClick={() => void runCritic()}>{C.criticButton}</Button><Button size="sm" variant="outline" disabled={!userText.trim() || busy === 'risk'} onClick={() => void runRisk()}>{C.riskButton}</Button></div><div className="mt-3 grid gap-3 lg:grid-cols-2">{critic ? <ReportBox data={critic} /> : <Empty>{C.criticEmpty}</Empty>}{risk ? <ReportBox data={risk} /> : <Empty>{C.riskEmpty}</Empty>}</div></Card></main></div></div></div>
}

const KEY_LABELS: Record<string, string> = {
  policy: '\u7b56\u7565',
  issues: '\u95ee\u9898',
  suggestions: '\u5efa\u8bae',
  safe_transfer_principles: '\u5b89\u5168\u8fc1\u79fb\u539f\u5219',
  level: '\u98ce\u9669\u7b49\u7ea7',
  scores: '\u5206\u9879\u76f8\u4f3c\u5ea6',
  reductions: '\u964d\u98ce\u9669\u64cd\u4f5c',
  blocked: '\u662f\u5426\u62e6\u622a',
  note: '\u8bf4\u660e',
  vocabulary_similarity: '\u8bcd\u6c47\u76f8\u4f3c\u5ea6',
  sentence_similarity: '\u53e5\u5f0f\u76f8\u4f3c\u5ea6',
  imagery_similarity: '\u610f\u8c61\u76f8\u4f3c\u5ea6',
  paragraph_structure: '\u6bb5\u843d\u7ed3\u6784',
  character_setting: '\u4eba\u7269\u8bbe\u5b9a',
  plot_bridge: '\u60c5\u8282\u6865\u6bb5',
  thematic_expression: '\u4e3b\u9898\u8868\u8fbe'
}
function labelKey(key: string) { return KEY_LABELS[key] || key.replace(/_/g, ' ') }
function ReportBox({ data }: { data: Record<string, unknown> }) { return <div className="max-h-80 overflow-auto rounded-xl border border-border/60 bg-muted/30 p-3 text-xs"><ReportValue value={data} /></div> }
function ReportValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) return <div className="grid gap-1">{value.length ? value.map((v, i) => <div className="rounded-lg bg-background/60 px-2 py-1" key={i}><ReportValue value={v} /></div>) : <span className="text-muted-foreground">{C.none}</span>}</div>
  if (value && typeof value === 'object') return <div className="grid gap-2">{Object.entries(value as Record<string, unknown>).map(([k, v]) => <div key={k}><div className="mb-1 font-semibold text-foreground">{labelKey(k)}</div><ReportValue value={v} /></div>)}</div>
  if (typeof value === 'boolean') return <span>{value ? '\u662f' : '\u5426'}</span>
  return <span className="whitespace-pre-wrap text-muted-foreground">{String(value ?? '')}</span>
}


function copyrightLabel(value: string) {
  if (value === 'user_provided') return '\u7528\u6237\u63d0\u4f9b\uff0c\u4ec5\u79c1\u6709\u5206\u6790'
  if (value === 'public_domain') return '\u516c\u7248 / \u516c\u5171\u9886\u57df'
  if (value === 'unknown') return '\u672a\u77e5\u7248\u6743\u72b6\u6001'
  return value
}
function chunkTypeLabel(value: string) {
  if (value === 'chapter') return '\u7ae0\u8282'
  if (value === 'scene') return '\u573a\u666f'
  if (value === 'paragraph') return '\u6bb5\u843d'
  return value
}

function MiniList({ rows, empty, title }: { rows: unknown[]; empty: string; title?: string }) { return <div>{title ? <div className="mb-1 text-xs font-semibold text-muted-foreground">{title}</div> : null}<div className="grid max-h-44 gap-1 overflow-auto text-xs text-muted-foreground">{rows.length ? rows.slice(0, 8).map((r, i) => <div className="rounded-lg bg-muted/30 px-2 py-1" key={i}>{itemValue(r)}</div>) : <span>{empty}</span>}</div></div> }
function ResultChunks({ rows }: { rows: SoulChunk[] }) { return <div className="mt-3 grid max-h-80 gap-2 overflow-auto">{rows.length ? rows.map(r => <div className="rounded-xl border border-border/60 p-2 text-xs" key={r.chunk_id}><div className="flex justify-between gap-2"><b>{chunkTypeLabel(r.embedding_type)} / {r.title}</b><span>{typeof r.score === 'number' ? r.score.toFixed(2) : ''}</span></div><div className="text-muted-foreground">{r.source_file}:{r.line_start} / {r.tags?.join(', ')}</div><div className="mt-1">{r.summary || r.text.slice(0, 180)}</div></div>) : <Empty>{C.chunkEmpty}</Empty>}</div> }
