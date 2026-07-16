import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { TextTab, TextTabMeta } from '@/components/ui/text-tab'
import { cn } from '@/lib/utils'
import { notifyError } from '@/store/notifications'

import { PAGE_INSET_X } from '../layout-constants'

import { KarnaAgentsCanvasWorkshopView } from './agents-canvas'
import { ConnectorWorkshopView } from './connector-workshop'
import { SoulWorkshopFullView } from './soul'
import { WriterWorkshopFullView } from './writer'

type WorkshopKind = 'agents' | 'writer' | 'soul' | 'mcp'
type SoulTab = 'authors' | 'samples' | 'rag' | 'retrieval'

interface ResourceRow { id: string; name: string; folder?: string; description?: string; documents?: number; chunks?: number; vectorized?: boolean }
interface WriterProject { id: string; title: string; slug?: string; folder?: string; status?: string; pinned?: boolean; knowledge_ids?: string[] }
interface WorkflowRow { id: string; name: string; nodes?: Array<{ id: string }>; edges?: Array<{ id?: string }> }
interface WorkflowRunRow { run_id: string; workflow_id: string; status?: string; progress?: { total?: number; completed?: number } }
interface SoulAuthor { id: string; name: string; texts_count?: number; chunks_count?: number; profile_version?: number }
interface SearchResult { id?: string; title?: string; path?: string; text?: string; summary?: string; author?: string; score?: number }
interface SearchResponse { results?: SearchResult[]; vectorized?: boolean; embedding_model?: string; message?: string }
interface McpServer { name: string; description?: string; enabled?: boolean; transport?: string; command?: string; url?: string; tools?: string[] }
interface McpCatalogEntry { name: string; description: string; source?: string; installed: boolean; enabled: boolean; auth_type?: string }
interface KnowledgeStore { config?: Record<string, unknown>; libraries?: ResourceRow[]; usage?: { bytes: number; files: number; folders: Array<{ folder: string; bytes: number; files: number; truncated?: boolean }> } }

interface WorkshopState {
  authors: SoulAuthor[]
  knowledge: ResourceRow[]
  knowledgeStore: KnowledgeStore
  mcpServers: McpServer[]
  mcpCatalog: McpCatalogEntry[]
  projects: WriterProject[]
  resources: { knowledge: ResourceRow[]; mcp: ResourceRow[]; skills: ResourceRow[] }
  workflowRuns: WorkflowRunRow[]
  workflows: WorkflowRow[]
}

const EMPTY_STATE: WorkshopState = { authors: [], knowledge: [], knowledgeStore: {}, mcpServers: [], mcpCatalog: [], projects: [], resources: { knowledge: [], mcp: [], skills: [] }, workflowRuns: [], workflows: [] }

const VIEW_COPY: Record<WorkshopKind, { desc: string; icon: string; title: string }> = {
  agents: { desc: '编排、运行和复盘 Karna 多智能体工作流；当前保留 JSON 编辑，后续可替换为可视化画布。', icon: 'type-hierarchy-sub', title: '多 Agent 工坊' },
  writer: { desc: '管理作品项目、主控会话、Prompt 增强和项目级知识绑定。全局 RAG 管理已迁移到 Soul 工坊。', icon: 'notebook', title: '作品工坊' },
  soul: { desc: '统一管理作者人格、文本样本、RAG 知识库、检索测试与安全融合。', icon: 'sparkle', title: 'Soul工坊' },
  mcp: { desc: '管理 Karna 可调用的 MCP 服务器、内置工具、连接测试与重载。', icon: 'plug', title: 'MCP 工坊' }
}

const SOUL_TABS: Array<{ icon: string; id: SoulTab; label: string }> = [
  { icon: 'account', id: 'authors', label: '作者人格' },
  { icon: 'file-text', id: 'samples', label: '文本样本' },
  { icon: 'library', id: 'rag', label: 'RAG 知识库' },
  { icon: 'search', id: 'retrieval', label: '检索测试' }
]

async function karnaApi<T>(path: string, options: { body?: unknown; method?: string } = {}): Promise<T> {
  return window.karnaDesktop.api<T>({ body: options.body, method: options.method || 'GET', path })
}

const asText = (value: unknown) => (typeof value === 'string' ? value : value ? JSON.stringify(value, null, 2) : '')
const builtinMcp = (server: McpServer) => server.transport === 'builtin' || server.name.startsWith('karna-')

type McpTab = 'catalog' | 'installed' | 'add'

const MCP_TABS: Array<{ icon: string; id: McpTab; label: string }> = [
  { icon: 'library', id: 'catalog', label: 'MCP 目录' },
  { icon: 'server', id: 'installed', label: '已安装' },
  { icon: 'add', id: 'add', label: '手动添加' },
]

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('rounded-xl border border-border/70 bg-card/70 p-4 shadow-sm', className)}>{children}</section>
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border/70 p-6 text-sm text-muted-foreground">{children}</div>
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn('w-full rounded-lg border border-border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-primary/30', props.className)} />
}

function Area(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn('w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary/30', props.className)} />
}

function useWorkshopData() {
  const [state, setState] = useState<WorkshopState>(EMPTY_STATE)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    setRefreshing(true)

    try {
      const [projects, resources, workflows, authors, knowledge, mcp, mcpCatalog] = await Promise.all([
        karnaApi<{ projects?: WriterProject[] }>('/api/writer/projects').catch((): { projects?: WriterProject[] } => ({ projects: [] })),
        karnaApi<Partial<WorkshopState['resources']>>('/api/writer/resources').catch((): Partial<WorkshopState['resources']> => ({})),
        karnaApi<{ runs?: WorkflowRunRow[]; workflows?: WorkflowRow[] }>('/api/writer/workflows').catch((): { runs?: WorkflowRunRow[]; workflows?: WorkflowRow[] } => ({ runs: [], workflows: [] })),
        karnaApi<{ authors?: SoulAuthor[] }>('/api/soul/authors').catch((): { authors?: SoulAuthor[] } => ({ authors: [] })),
        karnaApi<KnowledgeStore>('/api/knowledge').catch((): KnowledgeStore => ({})),
        karnaApi<{ servers?: McpServer[] }>('/api/mcp/servers').catch((): { servers?: McpServer[] } => ({ servers: [] })),
        karnaApi<{ entries?: McpCatalogEntry[] }>('/api/mcp/catalog').catch((): { entries?: McpCatalogEntry[] } => ({ entries: [] }))
      ])

      const knowledgeRows = knowledge.libraries || resources.knowledge || []
      setState({
        authors: authors.authors || [],
        knowledge: knowledgeRows,
        knowledgeStore: knowledge,
        mcpServers: mcp.servers || [],
        mcpCatalog: mcpCatalog.entries || [],
        projects: projects.projects || [],
        resources: { knowledge: knowledgeRows, mcp: resources.mcp || [], skills: resources.skills || [] },
        workflowRuns: workflows.runs || [],
        workflows: workflows.workflows || []
      })
    } catch (error) {
      notifyError('Karna 工坊加载失败', error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const runAction = useCallback(async (label: string, action: () => Promise<void>) => {
    setBusy(label)

    try { await action() } catch (error) { notifyError(label, error instanceof Error ? error.message : String(error)) } finally { setBusy('') }
  }, [])

  return { busy, load, loading, refreshing, runAction, setState, state }
}

type Data = ReturnType<typeof useWorkshopData>

function Shell({ children, data, kind }: { children: ReactNode; data: Data; kind: WorkshopKind }) {
  const copy = VIEW_COPY[kind]

  return <main className="flex h-full min-h-0 flex-col bg-background text-foreground">
    <div className={cn('border-b border-border/60 py-4', PAGE_INSET_X)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-primary/80"><Codicon name={copy.icon} />{copy.title}</div><h1 className="mt-1 text-2xl font-semibold tracking-tight">{copy.title}</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{copy.desc}</p></div>
        <Button disabled={data.refreshing || Boolean(data.busy)} onClick={() => void data.load()} size="sm" variant="outline">{data.refreshing ? '刷新中…' : data.busy || '刷新'}</Button>
      </div>
    </div>
    <div className={cn('min-h-0 flex-1 overflow-y-auto py-5', PAGE_INSET_X)}>{children}</div>
  </main>
}

function WriterView({ data }: { data: Data }) {
  const { load, runAction, state } = data
  const [prompt, setPrompt] = useState('')
  const [enhanced, setEnhanced] = useState('')
  const patchProject = (p: WriterProject, patch: Partial<WriterProject>) => runAction('更新作品项目失败', async () => { await karnaApi(`/api/writer/projects/${encodeURIComponent(p.id)}`, { method: 'PATCH', body: patch }); await load() })

  const deleteProject = (p: WriterProject) => { if (!window.confirm(`确定删除作品项目「${p.title || p.id}」吗？`)) {return;} void runAction('删除作品项目失败', async () => { await karnaApi(`/api/writer/projects/${encodeURIComponent(p.id)}`, { method: 'DELETE' }); await load() }) }

  const enhancePrompt = () => runAction('Prompt 增强失败', async () => { const res = await karnaApi<{ error?: string; text?: string }>('/api/prompt/enhance', { method: 'POST', body: { mode: 'writer', text: prompt } });

 if (res.error) {throw new Error(res.error);} setEnhanced(res.text || prompt) })

  return <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
    <Card><div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">作品项目</h2><span className="text-xs text-muted-foreground">{state.projects.length} 项</span></div>{state.projects.length ? <div className="grid gap-2">{state.projects.map(p => <div className="rounded-lg border border-border/60 p-3" key={p.id}><div className="flex justify-between gap-2"><div className="min-w-0"><div className="truncate font-medium">{p.title || p.id}</div><div className="truncate text-xs text-muted-foreground">{p.folder || p.slug || p.id}</div></div><span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{p.status || 'active'}</span></div><div className="mt-2 text-xs text-muted-foreground">绑定知识库：{p.knowledge_ids?.length || 0} 个；全局 RAG 管理请进入「Soul 工坊」。</div><div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => void karnaApi(`/api/writer/projects/${encodeURIComponent(p.id)}/open`, { method: 'POST' })} size="sm" variant="outline">设为当前</Button><Button onClick={() => void karnaApi(`/api/writer/projects/${encodeURIComponent(p.id)}/sessions`, { method: 'POST', body: { title: `${p.title || p.id} / 主控会话` } })} size="sm" variant="outline">新建会话</Button><Button onClick={() => void karnaApi(`/api/writer/projects/${encodeURIComponent(p.id)}/open-folder`, { method: 'POST' })} size="sm" variant="outline">打开文件夹</Button><Button onClick={() => void patchProject(p, { pinned: !p.pinned })} size="sm" variant="ghost">{p.pinned ? '取消置顶' : '置顶'}</Button><Button onClick={() => void patchProject(p, { status: p.status === 'archived' ? 'active' : 'archived' })} size="sm" variant="ghost">{p.status === 'archived' ? '恢复' : '归档'}</Button><Button onClick={() => deleteProject(p)} size="sm" variant="ghost">删除</Button></div></div>)}</div> : <EmptyPanel>还没有 Karna 作品项目。可以从左侧「新建项目」创建。</EmptyPanel>}</Card>
    <Card><h2 className="font-semibold">Prompt 增强</h2><p className="mt-1 text-sm text-muted-foreground">把粗略目标扩展成更适合 Karna agent 执行的任务。</p><Area className="mt-3 min-h-28" onChange={e => setPrompt(e.target.value)} placeholder="输入创作、研究或项目目标…" value={prompt} /><Button className="mt-2" disabled={!prompt.trim()} onClick={() => void enhancePrompt()} size="sm">增强 Prompt</Button>{enhanced && <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">{enhanced}</pre>}</Card>
  </div>
}

function AgentsView({ data }: { data: Data }) {
  const { runAction, setState, state } = data
  const [name, setName] = useState('')
  const [json, setJson] = useState('')
  const [selected, setSelected] = useState('')
  const projectRef = useMemo(() => state.projects.find(p => p.status !== 'archived')?.id || 'global', [state.projects])
  const selectedWorkflow = state.workflows.find(w => w.id === selected) || null

  const loadWorkflows = async () => { const res = await karnaApi<{ runs?: WorkflowRunRow[]; workflows?: WorkflowRow[] }>(`/api/writer/workflows?project=${encodeURIComponent(projectRef)}`); setState(cur => ({ ...cur, workflowRuns: res.runs || [], workflows: res.workflows || [] })) }
  const starter = () => ({ edges: [{ id: 'edge_outline_write', label: '交接', source: 'node_outline', target: 'node_write' }], mode: 'canvas', name: name.trim() || 'Karna 起步工作流', nodes: [{ data: { agent_id: 'outline_architect', label: '大纲智能体' }, id: 'node_outline', position: { x: 120, y: 120 }, type: 'agent' }, { data: { agent_id: 'chapter_writer', label: '正文写作智能体' }, id: 'node_write', position: { x: 360, y: 120 }, type: 'agent' }] })

  const create = () => runAction('创建工作流失败', async () => { const res = await karnaApi<{ workflow?: WorkflowRow }>(`/api/writer/workflows?project=${encodeURIComponent(projectRef)}`, { method: 'POST', body: starter() });

 if (res.workflow) {setSelected(res.workflow.id);} setName(''); await loadWorkflows() })

  const save = () => runAction('保存工作流 JSON 失败', async () => { const res = await karnaApi<{ workflow?: WorkflowRow }>(`/api/writer/workflows?project=${encodeURIComponent(projectRef)}`, { method: 'POST', body: JSON.parse(json) });

 if (res.workflow) {setSelected(res.workflow.id);} setJson(''); await loadWorkflows() })

  const run = (w: WorkflowRow) => runAction('运行工作流失败', async () => { await karnaApi(`/api/writer/workflows/${encodeURIComponent(w.id)}/run`, { method: 'POST', body: { input: w.name, projectRef } }); await loadWorkflows() })

  const del = (w: WorkflowRow) => { if (!window.confirm(`确定删除工作流「${w.name || w.id}」吗？`)) {return;} void runAction('删除工作流失败', async () => { await karnaApi(`/api/writer/workflows/${encodeURIComponent(w.id)}?project=${encodeURIComponent(projectRef)}`, { method: 'DELETE' }); setSelected(''); await loadWorkflows() }) }

  return <div className="grid gap-4 xl:grid-cols-[1fr_1fr]"><Card><h2 className="font-semibold">多 Agent 工作流</h2><p className="mt-1 text-sm text-muted-foreground">创建、编辑 JSON、运行和删除 Karna 工作流定义。当前作用域：{projectRef}</p><div className="mt-3 flex gap-2"><Input onChange={e => setName(e.target.value)} placeholder="工作流名称" value={name} /><Button onClick={() => void create()} size="sm">创建起步工作流</Button></div>{state.workflows.length ? <div className="mt-4 grid gap-2">{state.workflows.map(w => <div className={cn('rounded-lg border p-3', selected === w.id ? 'border-primary bg-primary/10' : 'border-border/60')} key={w.id}><button className="w-full text-left" onClick={() => { setSelected(w.id); setJson(JSON.stringify(w, null, 2)) }} type="button"><div className="font-medium">{w.name}</div><div className="mt-1 text-xs text-muted-foreground">{w.nodes?.length || 0} 个节点 / {w.edges?.length || 0} 条连线</div></button><div className="mt-3 flex gap-2"><Button onClick={() => void run(w)} size="sm" variant="outline">运行</Button><Button onClick={() => setJson(JSON.stringify(w, null, 2))} size="sm" variant="ghost">编辑 JSON</Button><Button onClick={() => del(w)} size="sm" variant="ghost">删除</Button></div></div>)}</div> : <EmptyPanel>还没有工作流。可以先创建起步工作流。</EmptyPanel>}</Card><Card><h2 className="font-semibold">工作流详情</h2><div className="mt-2 text-xs text-muted-foreground">{selectedWorkflow ? `已选择：${selectedWorkflow.name}` : '尚未选择工作流。'}</div><Area className="mt-3 min-h-80 font-mono text-xs" onChange={e => setJson(e.target.value)} placeholder="选择一个工作流以编辑 JSON，或在这里粘贴新的工作流 JSON。" value={json} /><div className="mt-3 flex gap-2"><Button disabled={!json.trim()} onClick={() => void save()} size="sm">保存 JSON</Button><Button onClick={() => void loadWorkflows()} size="sm" variant="outline">重新加载工作流</Button></div>{state.workflowRuns.length ? <div className="mt-4 space-y-2"><h3 className="text-sm font-medium">最近运行</h3>{state.workflowRuns.slice(-5).reverse().map(r => <div className="rounded-lg bg-muted p-3 text-xs" key={r.run_id}>{r.status || '未知'} / {r.progress?.completed || 0}/{r.progress?.total || 0}</div>)}</div> : null}</Card></div>
}

function SoulView({ data }: { data: Data }) {
  const { load, runAction, state } = data
  const [tab, setTab] = useState<SoulTab>('authors')
  const [authorName, setAuthorName] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [output, setOutput] = useState('')
  const [samplePath, setSamplePath] = useState('')
  const [knowledgeFolder, setKnowledgeFolder] = useState('')
  const [knowledgeName, setKnowledgeName] = useState('')
  const [scope, setScope] = useState('global')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<SearchResponse | null>(null)

  const [retentionPeriod, setRetentionPeriod] = useState<string>(() => {
    try { return window.localStorage.getItem('karna:knowledge:retention') || 'forever' } catch { return 'forever' }
  })

  const selectedAuthor = state.authors.find(a => selected.includes(a.id)) || state.authors[0] || null
  const selectedNames = useMemo(() => state.authors.filter(a => selected.includes(a.id)).map(a => a.name), [selected, state.authors])
  const createAuthor = () => runAction('创建 Soul 作者失败', async () => { await karnaApi('/api/soul/authors', { method: 'POST', body: { name: authorName } }); setAuthorName(''); await load() })
  const exportAuthor = (a: SoulAuthor) => runAction('导出 Soul 作者失败', async () => { const res = await karnaApi<{ file?: string }>(`/api/soul/authors/${encodeURIComponent(a.id)}/export`, { method: 'POST' }); setOutput(`已导出：${res.file || a.name}`) })

  const deleteAuthor = (a: SoulAuthor) => { if (!window.confirm(`确定删除 Soul 作者「${a.name}」吗？`)) {return;} void runAction('删除 Soul 作者失败', async () => { await karnaApi(`/api/soul/authors/${encodeURIComponent(a.id)}`, { method: 'DELETE' }); await load() }) }
  const preview = () => runAction('Soul 融合预览失败', async () => { const res = await karnaApi<{ preview?: unknown }>('/api/soul/fusion/preview', { method: 'POST', body: { authors: selectedNames } }); setOutput(asText(res.preview)) })
  const importSample = () => runAction('导入作者文本失败', async () => { if (!selectedAuthor) {throw new Error('请先选择一个作者人格。');} await karnaApi(`/api/soul/authors/${encodeURIComponent(selectedAuthor.id)}/import`, { method: 'POST', body: { path: samplePath } }); setSamplePath(''); await load() })
  const processAuthor = () => runAction('处理作者样本失败', async () => { if (!selectedAuthor) {throw new Error('请先选择一个作者人格。');} await karnaApi(`/api/soul/authors/${encodeURIComponent(selectedAuthor.id)}/process`, { method: 'POST', body: {} }); await load() })
  const importKnowledge = () => runAction('导入 RAG 知识库失败', async () => { await karnaApi('/api/knowledge/import-folder', { method: 'POST', body: { name: knowledgeName, path: knowledgeFolder, recursive: true } }); setKnowledgeName(''); setKnowledgeFolder(''); await load() })
  const reindex = () => runAction('重建 RAG 索引失败', async () => { await karnaApi('/api/knowledge/reindex', { method: 'POST' }); await load() })

  const deleteKnowledge = (row: ResourceRow) => { if (!window.confirm(`确定删除知识库「${row.name}」吗？`)) {return;} void runAction('删除知识库失败', async () => { await karnaApi(`/api/knowledge/libraries/${encodeURIComponent(row.id)}`, { method: 'DELETE' }); await load() }) }
  const retrieve = () => runAction('检索测试失败', async () => { setSearch(scope.startsWith('soul:') ? await karnaApi(`/api/soul/authors/${encodeURIComponent(scope.slice(5))}/search`, { method: 'POST', body: { limit: 8, query } }) : await karnaApi('/api/knowledge/search', { method: 'POST', body: { limit: 8, query, scope } })) })

  const handleRetentionChange = (value: string) => {
    setRetentionPeriod(value)

    try { window.localStorage.setItem('karna:knowledge:retention', value) } catch { /* noop */ }
  }

  const exportAllKnowledge = async () => {
    const exportData = {
      exportedAt: new Date().toISOString(),
      retention: retentionPeriod,
      libraries: state.knowledge,
      config: state.knowledgeStore.config
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `karna-knowledge-backup-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    setOutput('知识库导出已开始下载。桌面版支持完整治理与API同步。')
  }

  const clearAllKnowledge = () => {
    if (!window.confirm('确定要清空所有知识库吗？此操作不可恢复！\n\n桌面版支持完整治理，当前Web版仅清除本地UI状态。')) {return}
    void runAction('清空知识库失败', async () => {
      for (const row of state.knowledge) {
        try { await karnaApi(`/api/knowledge/libraries/${encodeURIComponent(row.id)}`, { method: 'DELETE' }) } catch { /* continue */ }
      }

      await load()
      setOutput('知识库已清空。桌面版支持完整治理与API同步。')
    })
  }

  return <div className="space-y-4"><div className="flex flex-wrap gap-3">{SOUL_TABS.map(t => <TextTab active={tab === t.id} key={t.id} onClick={() => setTab(t.id)}><span className="inline-flex items-center gap-1"><Codicon name={t.icon} />{t.label}</span><TextTabMeta>{t.id === 'authors' ? state.authors.length : t.id === 'rag' ? state.knowledge.length : ''}</TextTabMeta></TextTab>)}</div>
    {tab === 'authors' && <div className="grid gap-4 xl:grid-cols-[1fr_1fr]"><Card><h2 className="font-semibold">Soul 作者 / 人格库</h2><div className="mt-3 flex gap-2"><Input onChange={e => setAuthorName(e.target.value)} placeholder="作者或人格名称" value={authorName} /><Button disabled={!authorName.trim()} onClick={() => void createAuthor()} size="sm">创建</Button></div>{state.authors.length ? <div className="mt-4 grid gap-2">{state.authors.map(a => <div className={cn('rounded-lg border p-3', selected.includes(a.id) ? 'border-primary bg-primary/10' : 'border-border/60')} key={a.id}><button className="w-full text-left" onClick={() => setSelected(cur => cur.includes(a.id) ? cur.filter(id => id !== a.id) : [...cur, a.id])} type="button"><div className="font-medium">{a.name}</div><div className="mt-1 text-xs text-muted-foreground">文本 {a.texts_count || 0} / 分块 {a.chunks_count || 0}</div></button><div className="mt-3 flex gap-2"><Button onClick={() => void exportAuthor(a)} size="sm" variant="outline">导出</Button><Button onClick={() => deleteAuthor(a)} size="sm" variant="ghost">删除</Button></div></div>)}</div> : <EmptyPanel>还没有 Soul 作者。</EmptyPanel>}</Card><Card><h2 className="font-semibold">融合预览</h2><p className="mt-1 text-sm text-muted-foreground">已选择：{selectedNames.join(' + ') || '无'}</p><Button className="mt-3" disabled={!selected.length} onClick={() => void preview()} size="sm">生成预览</Button>{output && <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">{output}</pre>}</Card></div>}
    {tab === 'samples' && <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]"><Card><h2 className="font-semibold">文本样本</h2><select className="mt-3 w-full rounded-lg border border-border bg-background p-2 text-sm" onChange={e => setSelected(e.target.value ? [e.target.value] : [])} value={selectedAuthor?.id || ''}><option value="">选择作者人格</option>{state.authors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select><Input className="mt-2" onChange={e => setSamplePath(e.target.value)} placeholder="样本文件路径，例如 D:\\notes\\author.md" value={samplePath} /><div className="mt-3 flex gap-2"><Button disabled={!samplePath.trim() || !selectedAuthor} onClick={() => void importSample()} size="sm">导入样本</Button><Button disabled={!selectedAuthor} onClick={() => void processAuthor()} size="sm" variant="outline">处理并切块</Button></div></Card><Card><h2 className="font-semibold">样本状态</h2>{state.authors.length ? <div className="mt-3 grid gap-2">{state.authors.map(a => <div className="rounded-lg border border-border/60 p-3" key={a.id}><div className="font-medium">{a.name}</div><div className="mt-1 text-xs text-muted-foreground">文本 {a.texts_count || 0} / 分块 {a.chunks_count || 0} / Profile v{a.profile_version || 0}</div></div>)}</div> : <EmptyPanel>先创建作者人格，再导入文本样本。</EmptyPanel>}</Card></div>}
    {tab === 'rag' && <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]"><Card><h2 className="font-semibold">RAG 知识库</h2><p className="mt-1 text-sm text-muted-foreground">知识库导入、重建索引和向量化状态已从设置迁移到 Soul 工坊。</p><div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"><p className="text-xs text-amber-600 flex items-start gap-1.5"><Codicon className="mt-0.5 flex-shrink-0" name="info" size={14} />桌面版支持完整治理与API同步，当前版本设置保存在本地。</p></div><div className="mt-3 grid gap-2"><label className="text-sm font-medium">保留期设置</label><select className="w-full rounded-lg border border-border bg-background p-2 text-sm" onChange={e => handleRetentionChange(e.target.value)} value={retentionPeriod}><option value="7days">7天</option><option value="30days">30天</option><option value="90days">90天</option><option value="forever">永久</option></select></div><Input className="mt-3" onChange={e => setKnowledgeName(e.target.value)} placeholder="知识库名称，可选" value={knowledgeName} /><Input className="mt-2" onChange={e => setKnowledgeFolder(e.target.value)} placeholder="文件夹路径，例如 D:\\notes\\karna" value={knowledgeFolder} /><div className="mt-3 flex flex-wrap gap-2"><Button disabled={!knowledgeFolder.trim()} onClick={() => void importKnowledge()} size="sm">导入文件夹</Button><Button onClick={() => void reindex()} size="sm" variant="outline">重建索引</Button></div><div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3"><Button onClick={() => void exportAllKnowledge()} size="sm" variant="outline"><Codicon className="mr-1" name="cloud-download" size={12} />导出全部知识库</Button><Button onClick={() => clearAllKnowledge()} size="sm" variant="destructive"><Codicon className="mr-1" name="trash" size={12} />清空知识库</Button></div><div className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">Embedding：{String(state.knowledgeStore.config?.embedding_model_name || state.knowledgeStore.config?.embedding_model_id || '未配置')}；Top K：{String(state.knowledgeStore.config?.top_k || 5)}；Chunk：{String(state.knowledgeStore.config?.chunk_size || 1200)}；保留期：{retentionPeriod === '7days' ? '7天' : retentionPeriod === '30days' ? '30天' : retentionPeriod === '90days' ? '90天' : '永久'}</div>{output && <div className="mt-2 text-xs text-primary">{output}</div>}</Card><Card><h2 className="font-semibold">知识库列表</h2>{state.knowledge.length ? <div className="mt-4 grid gap-2">{state.knowledge.map(row => <div className="rounded-lg border border-border/60 p-3" key={row.id}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-medium">{row.name}</div><div className="mt-1 truncate text-xs text-muted-foreground">{row.folder || row.description || row.id}</div><div className="mt-2 text-xs text-muted-foreground">文档 {row.documents || 0} / 分块 {row.chunks || 0} / {row.vectorized ? '已向量化' : '未向量化'}</div></div><Button onClick={() => deleteKnowledge(row)} size="sm" variant="ghost">删除</Button></div></div>)}</div> : <EmptyPanel>还没有导入知识库。</EmptyPanel>}</Card></div>}
    {tab === 'retrieval' && <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]"><Card><h2 className="font-semibold">检索测试</h2><select className="mt-3 w-full rounded-lg border border-border bg-background p-2 text-sm" onChange={e => setScope(e.target.value)} value={scope}><option value="global">全局知识库</option>{state.authors.map(a => <option key={a.id} value={`soul:${a.id}`}>Soul 作者：{a.name}</option>)}{state.projects.map(p => <option key={p.id} value={`project:${p.id}`}>作品绑定：{p.title || p.id}</option>)}</select><Area className="mt-3 min-h-24" onChange={e => setQuery(e.target.value)} placeholder="输入要检索的问题或片段…" value={query} /><Button className="mt-3" disabled={!query.trim()} onClick={() => void retrieve()} size="sm">开始检索</Button></Card><Card><h2 className="font-semibold">召回结果</h2>{search ? <div className="mt-3 space-y-2"><div className="text-xs text-muted-foreground">模式：{search.vectorized ? 'Hybrid / Vector' : 'Lexical fallback'}{search.embedding_model ? `；模型：${search.embedding_model}` : ''}</div>{search.results?.length ? search.results.map((row, index) => <div className="rounded-lg bg-muted p-3 text-xs" key={row.id || `${row.path}-${index}`}><div className="font-medium">{row.title || row.author || row.path || `结果 ${index + 1}`}</div><div className="mt-1 whitespace-pre-wrap text-muted-foreground">{row.text || row.summary}</div>{typeof row.score === 'number' && <div className="mt-2 text-muted-foreground">score: {row.score.toFixed(3)}</div>}</div>) : <EmptyPanel>没有召回结果。</EmptyPanel>}</div> : <EmptyPanel>输入 query 后可在这里查看检索结果。</EmptyPanel>}</Card></div>}
  </div>
}

function McpView({ data }: { data: Data }) {
  const { load, runAction, state } = data
  const [tab, setTab] = useState<McpTab>('catalog')
  const [name, setName] = useState(''), [description, setDescription] = useState(''), [url, setUrl] = useState(''), [command, setCommand] = useState(''), [result, setResult] = useState('')
  const [catalogFilter, setCatalogFilter] = useState('')
  const save = () => runAction('保存 MCP 服务器失败', async () => { await karnaApi('/api/mcp/servers', { method: 'POST', body: { command, description, enabled: true, name, url } }); setName(''); setDescription(''); setUrl(''); setCommand(''); await load() })
  const test = (server: McpServer) => runAction('测试 MCP 服务器失败', async () => setResult(asText(await karnaApi(`/api/mcp/servers/${encodeURIComponent(server.name)}/test`, { method: 'POST', body: server }))))
  const toggle = (server: McpServer) => runAction('更新 MCP 服务器失败', async () => { await karnaApi(`/api/mcp/servers/${encodeURIComponent(server.name)}`, { method: 'PATCH', body: { enabled: server.enabled === false } }); await load() })

  const remove = (server: McpServer) => { if (builtinMcp(server)) {return;}

 if (!window.confirm(`确定删除 MCP 服务器「${server.name}」吗？`)) {return;} void runAction('删除 MCP 服务器失败', async () => { await karnaApi(`/api/mcp/servers/${encodeURIComponent(server.name)}`, { method: 'DELETE' }); await load() }) }

  const installFromCatalog = (entry: McpCatalogEntry) => runAction(`安装 ${entry.name} 失败`, async () => {
    await karnaApi('/api/mcp/catalog/install', { method: 'POST', body: { name: entry.name, enable: true } })
    await load()
  })

  const reload = () => runAction('重新加载 MCP 失败', async () => { setResult(asText(await karnaApi('/api/mcp/reload', { method: 'POST' }))); await load() })

  const filteredCatalog = state.mcpCatalog.filter(e =>
    !catalogFilter.trim() ||
    e.name.toLowerCase().includes(catalogFilter.toLowerCase()) ||
    e.description.toLowerCase().includes(catalogFilter.toLowerCase())
  )

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-3">
        {MCP_TABS.map(t => <TextTab active={tab === t.id} key={t.id} onClick={() => setTab(t.id)}>
          <span className="inline-flex items-center gap-1"><Codicon name={t.icon} />{t.label}</span>
          <TextTabMeta>{t.id === 'catalog' ? state.mcpCatalog.length : t.id === 'installed' ? state.mcpServers.length : ''}</TextTabMeta>
        </TextTab>)}
      </div>
      <Button onClick={() => void reload()} size="sm" variant="outline">重新加载 MCP</Button>
    </div>

    {tab === 'catalog' && <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">MCP 精选目录</h2>
          <p className="mt-1 text-sm text-muted-foreground">精选自 MCP Hub 中国，一键安装使用。</p>
        </div>
        <Input className="w-64" onChange={e => setCatalogFilter(e.target.value)} placeholder="搜索 MCP..." value={catalogFilter} />
      </div>
      {filteredCatalog.length ? <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {filteredCatalog.map(entry => <div className="flex flex-col rounded-lg border border-border/60 p-3" key={entry.name}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{entry.name}</div>
              <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entry.description}</div>
            </div>
            <span className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-xs",
              entry.installed ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
            )}>
              {entry.installed ? (entry.enabled ? '已启用' : '已安装') : '可安装'}
            </span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {entry.auth_type === 'api_key' ? '需要 API Key' : entry.auth_type === 'oauth' ? 'OAuth 登录' : '无需认证'}
            </span>
            <Button disabled={entry.installed} onClick={() => void installFromCatalog(entry)} size="sm" variant={entry.installed ? 'ghost' : 'default'}>
              {entry.installed ? '已安装' : '安装'}
            </Button>
          </div>
        </div>)}
      </div> : <EmptyPanel>没有匹配的 MCP。</EmptyPanel>}
    </Card>}

    {tab === 'installed' && <Card>
      <h2 className="font-semibold">已安装的 MCP 服务器</h2>
      <p className="mt-1 text-sm text-muted-foreground">管理当前已配置的 MCP 服务器。</p>
      {state.mcpServers.length ? <div className="mt-4 grid gap-2">{state.mcpServers.map(server => <div className="rounded-lg border border-border/60 p-3" key={server.name}><div className="font-medium">{server.name}</div><div className="mt-1 text-xs text-muted-foreground">{server.description || server.url || server.command || server.transport || '未配置描述'}</div><div className="mt-2 text-xs text-muted-foreground">{server.enabled === false ? '已禁用' : '已启用'} / 工具 {server.tools?.length || 0} 个{builtinMcp(server) ? ' / 内置只读' : ''}</div><div className="mt-3 flex flex-wrap gap-2"><Button onClick={() => void test(server)} size="sm" variant="outline">测试</Button><Button disabled={builtinMcp(server)} onClick={() => void toggle(server)} size="sm" variant="ghost">{server.enabled === false ? '启用' : '禁用'}</Button><Button disabled={builtinMcp(server)} onClick={() => remove(server)} size="sm" variant="ghost">删除</Button></div>{server.tools?.length ? <div className="mt-3 flex flex-wrap gap-1 text-xs">{server.tools.map(tool => <span className="rounded bg-muted px-2 py-0.5" key={tool}>{tool}</span>)}</div> : null}</div>)}</div> : <EmptyPanel>还没有安装任何 MCP 服务器。去「MCP 目录」看看吧。</EmptyPanel>}
      {result && <pre className="mt-4 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">{result}</pre>}
    </Card>}

    {tab === 'add' && <Card>
      <h2 className="font-semibold">手动添加 MCP 服务器</h2>
      <p className="mt-1 text-sm text-muted-foreground">支持 HTTP URL 或 stdio command。内置 Karna MCP 只读展示。</p>
      <Input className="mt-3" onChange={e => setName(e.target.value)} placeholder="配置键，例如 local-search" value={name} />
      <Input className="mt-2" onChange={e => setDescription(e.target.value)} placeholder="描述，可选" value={description} />
      <Input className="mt-2" onChange={e => setUrl(e.target.value)} placeholder="HTTP URL，例如 http://127.0.0.1:3000/mcp" value={url} />
      <Input className="mt-2" onChange={e => setCommand(e.target.value)} placeholder="stdio 命令，例如 npx" value={command} />
      <Button className="mt-3" disabled={!name.trim() || (!url.trim() && !command.trim())} onClick={() => void save()} size="sm">保存服务器</Button>
      {result && <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs">{result}</pre>}
    </Card>}
  </div>
}

function KarnaWorkshopByKind({ kind }: { kind: WorkshopKind }) {
  if (kind === 'agents') {return <KarnaAgentsCanvasWorkshopView />}

  if (kind === 'writer') {return <WriterWorkshopFullView />}

  if (kind === 'soul') {return <SoulWorkshopFullView />}

  return <ConnectorWorkshopView />
}

export function KarnaAgentsWorkshopView() { return <KarnaWorkshopByKind kind="agents" /> }

export function KarnaWriterWorkshopView() { return <KarnaWorkshopByKind kind="writer" /> }

export function KarnaSoulWorkshopView() { return <KarnaWorkshopByKind kind="soul" /> }

export function KarnaMcpWorkshopView() { return <KarnaWorkshopByKind kind="mcp" /> }

export function KarnaWorkshopView() { return <KarnaAgentsWorkshopView /> }
