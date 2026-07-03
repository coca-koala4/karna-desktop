import { type ReactNode, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { notify, notifyError } from '@/store/notifications'

interface WriterProject {
  id: string
  slug: string
  title: string
  type: string
  folder: string
  updated_at?: string
  main_session_id?: string
}
interface WriterProjectsResponse { projects?: WriterProject[]; active_project_id?: string }
interface BibleChapter { id: string; title: string; file: string; summary: string; chars: number }
interface BibleCharacter { name: string; evidence: string; note?: string }
interface BibleWorld { rule: string; evidence: string }
interface BibleForeshadow { clue: string; status: string; evidence: string }
interface BibleTimeline { event: string; evidence: string }
interface ProjectBible {
  updated_at?: string | null
  chapters?: BibleChapter[]
  characters?: BibleCharacter[]
  world?: BibleWorld[]
  foreshadows?: BibleForeshadow[]
  timeline?: BibleTimeline[]
}
interface BibleResponse { ok: boolean; bible: ProjectBible; versions?: Array<Record<string, unknown>>; calls?: Array<Record<string, unknown>> }
interface SourceFile { file: string; title: string; chars: number; lines: number; preview: string }
interface ConsistencyIssue { id: string; title: string; severity: string; evidence: string[]; suggestion: string }
interface ConsistencyReport { issues: ConsistencyIssue[]; checked_at: string }
interface RewritePreview { mode: string; instruction: string; original: string; suggested: string; diff: string; reason: string; at: string }

const projectTypes = ['web-novel', 'novel', 'paper', 'screenplay', 'poetry', 'copywriting', 'editorial']
const rewriteModes = [
  ['pace', '保持剧情，只优化节奏'],
  ['dialogue', '保持人设，只增强对白冲突'],
  ['concise', '保持文风，只降低啰嗦'],
  ['suspense', '保持伏笔，只加强悬念'],
  ['logic', '只检查逻辑，不改文字']
] as const

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  return window.karnaDesktop.api<T>({ path, method, body })
}

function projectRef(project: WriterProject | null) {
  return project?.slug || project?.id || ''
}

function Card({ children, title, meta }: { children: ReactNode; title: string; meta?: string }) {
  return <section className="rounded-2xl border border-border/70 bg-background/75 p-4 shadow-sm">
    <div className="mb-3 flex items-start justify-between gap-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {meta ? <span className="rounded-full border border-border/70 px-2 py-0.5 text-[0.68rem] text-muted-foreground">{meta}</span> : null}
    </div>
    {children}
  </section>
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-border/70 p-3 text-sm text-muted-foreground">{children}</div>
}

export function WriterWorkshopFullView() {
  const [projects, setProjects] = useState<WriterProject[]>([])
  const [activeId, setActiveId] = useState('')
  const [busy, setBusy] = useState('')
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState(projectTypes[0])
  const [bible, setBible] = useState<ProjectBible>({})
  const [versions, setVersions] = useState<Array<Record<string, unknown>>>([])
  const [calls, setCalls] = useState<Array<Record<string, unknown>>>([])
  const [sources, setSources] = useState<SourceFile[]>([])
  const [report, setReport] = useState<ConsistencyReport | null>(null)
  const [rewriteText, setRewriteText] = useState('')
  const [rewriteMode, setRewriteMode] = useState<(typeof rewriteModes)[number][0]>('pace')
  const [rewrite, setRewrite] = useState<RewritePreview | null>(null)

  const active = useMemo(() => projects.find(project => project.id === activeId) || projects[0] || null, [activeId, projects])

  const refreshProjects = async () => {
    const result = await api<WriterProjectsResponse>('/api/writer/projects?includeArchived=1')
    const rows = result.projects || []
    setProjects(rows)
    setActiveId(current => current || result.active_project_id || rows[0]?.id || '')
  }
  const refreshBible = async (project = active) => {
    if (!project) return
    const [result, sourceResult] = await Promise.all([
      api<BibleResponse>(`/api/writer/projects/${encodeURIComponent(projectRef(project))}/bible`),
      api<{ ok: boolean; sources?: SourceFile[] }>(`/api/writer/projects/${encodeURIComponent(projectRef(project))}/sources`)
    ])
    setBible(result.bible || {})
    setVersions(result.versions || [])
    setCalls(result.calls || [])
    setSources(sourceResult.sources || [])
  }

  useEffect(() => { void refreshProjects().catch(err => notifyError(err, '作品项目加载失败')) }, [])
  useEffect(() => { void refreshBible().catch(() => undefined) }, [active?.id])

  const createProject = async () => {
    if (!newTitle.trim()) return
    setBusy('create')
    try {
      const result = await api<{ ok: boolean; project?: WriterProject; error?: string }>('/api/writer/projects', 'POST', { title: newTitle.trim(), type: newType, multiAgentEnabled: false })
      if (!result.ok || !result.project) throw new Error(result.error || '创建失败')
      setNewTitle('')
      await refreshProjects()
      setActiveId(result.project.id)
      notify({ kind: 'success', title: '已创建作品项目', message: result.project.title })
    } catch (err) { notifyError(err, '创建作品项目失败') } finally { setBusy('') }
  }

  const importPaths = async (directories: boolean) => {
    if (!active) return
    const paths = await window.karnaDesktop.selectPaths({ directories, multiple: true, title: directories ? '选择稿件/资料文件夹' : '选择 Markdown/TXT 稿件', filters: directories ? undefined : [{ name: 'Text', extensions: ['md', 'markdown', 'txt'] }] })
    if (!paths.length) return
    setBusy('import')
    try {
      const result = await api<{ ok: boolean; imported?: unknown[]; message?: string; error?: string }>(`/api/writer/projects/${encodeURIComponent(projectRef(active))}/import`, 'POST', { paths })
      if (!result.ok) throw new Error(result.error || '导入失败')
      notify({ kind: 'success', title: '已导入到项目', message: result.message || `复制 ${result.imported?.length || 0} 个文件` })
      await refreshBible(active)
    } catch (err) { notifyError(err, '导入失败') } finally { setBusy('') }
  }

  const analyze = async () => {
    if (!active) return
    setBusy('analyze')
    try {
      const result = await api<{ ok: boolean; bible?: ProjectBible; error?: string }>(`/api/writer/projects/${encodeURIComponent(projectRef(active))}/analyze`, 'POST', {})
      if (!result.ok) throw new Error(result.error || '分析失败')
      notify({ kind: 'success', title: '作品 Bible 已更新', message: '章节、人物、设定、伏笔和时间线已从本地稿件抽取。' })
      await refreshBible(active)
    } catch (err) { notifyError(err, '分析失败') } finally { setBusy('') }
  }

  const checkConsistency = async () => {
    if (!active) return
    setBusy('check')
    try {
      const result = await api<{ ok: boolean; report?: ConsistencyReport; error?: string }>(`/api/writer/projects/${encodeURIComponent(projectRef(active))}/check-consistency`, 'POST', {})
      if (!result.ok || !result.report) throw new Error(result.error || '检查失败')
      setReport(result.report)
      notify({ kind: 'success', title: '一致性检查完成', message: `${result.report.issues.length} 条结果` })
      await refreshBible(active)
    } catch (err) { notifyError(err, '一致性检查失败') } finally { setBusy('') }
  }

  const previewRewrite = async () => {
    if (!active || !rewriteText.trim()) return
    setBusy('rewrite')
    try {
      const result = await api<{ ok: boolean; preview?: RewritePreview; error?: string }>(`/api/writer/projects/${encodeURIComponent(projectRef(active))}/rewrite-preview`, 'POST', { mode: rewriteMode, text: rewriteText })
      if (!result.ok || !result.preview) throw new Error(result.error || '改写预览失败')
      setRewrite(result.preview)
      notify({ kind: 'success', title: '改写预览已生成', message: '只生成 diff，不会覆盖原稿。' })
      await refreshBible(active)
    } catch (err) { notifyError(err, '改写预览失败') } finally { setBusy('') }
  }

  const exportProject = async () => {
    if (!active) return
    setBusy('export')
    try {
      const result = await api<{ ok: boolean; export?: { file?: string; json?: string; sources?: number }; error?: string }>(`/api/writer/projects/${encodeURIComponent(projectRef(active))}/export`, 'POST')
      if (!result.ok || !result.export) throw new Error(result.error || '导出失败')
      notify({ kind: 'success', title: '项目已导出', message: result.export.json || result.export.file || '已导出' })
      await refreshBible(active)
    } catch (err) { notifyError(err, '导出失败') } finally { setBusy('') }
  }

  return <div className="min-h-full overflow-auto bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--ui-accent)_13%,transparent),transparent_34rem)] px-6 py-6 text-foreground">
    <div className="mx-auto grid max-w-7xl gap-5">
      <header className="rounded-3xl border border-border/70 bg-background/80 p-5 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Karna Writer OS</p>
            <h1 className="mt-1 text-2xl font-semibold">作品工坊</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">这里不是 AI 代写器，而是写作者的创作工程台：导入稿件、维护 Bible、追踪人物/设定/伏笔、检查长篇一致性，并以可审阅 diff 给出局部改写建议。</p>
          </div>
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs leading-5 text-emerald-700 dark:text-emerald-200">本地优先 · 手动分析 · 不默认上传全文 · 永不自动覆盖原稿</div>
        </div>
      </header>

      <div className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
        <aside className="grid content-start gap-4">
          <Card title="项目">
            <div className="grid gap-2">
              <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" onChange={event => setActiveId(event.target.value)} value={active?.id || ''}>{projects.map(project => <option key={project.id} value={project.id}>{project.title}</option>)}</select>
              {active ? <div className="rounded-xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground"><strong className="text-foreground">{active.title}</strong><br />{active.type} · {active.slug}<br /><span className="font-mono">{active.folder}</span></div> : <EmptyLine>还没有作品项目。先创建一个，再导入稿件。</EmptyLine>}
            </div>
          </Card>
          <Card title="新建作品">
            <div className="grid gap-2">
              <select className="rounded-xl border border-border bg-background px-3 py-2 text-sm" onChange={event => setNewType(event.target.value)} value={newType}>{projectTypes.map(type => <option key={type} value={type}>{type}</option>)}</select>
              <input className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none" onChange={event => setNewTitle(event.target.value)} placeholder="作品名" value={newTitle} />
              <Button disabled={busy === 'create' || !newTitle.trim()} onClick={() => void createProject()} size="sm">创建项目</Button>
            </div>
          </Card>
          <Card title="版本与日志" meta={`${versions.length} 条`}>
            <div className="grid max-h-72 gap-2 overflow-auto text-xs text-muted-foreground">
              {versions.length ? versions.slice(0, 12).map((row, index) => <div className="rounded-lg border border-border/60 p-2" key={String(row.id || index)}><strong className="text-foreground">{String(row.kind || 'version')}</strong><br />{String(row.summary || '')}<br />{String(row.at || '')}</div>) : <EmptyLine>导入、分析、检查、改写预览都会记录版本。</EmptyLine>}
              {calls.length ? <div className="mt-2 border-t border-border pt-2">最近调用：{calls.slice(-3).map(row => String(row.operation)).join(' / ')}</div> : null}
            </div>
          </Card>
        </aside>

        <main className="grid gap-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="导入稿件" meta="手动">
              <p className="mb-3 text-sm leading-6 text-muted-foreground">选择 Markdown/TXT 文件或文件夹。Karna 只复制到项目 imports，原稿不覆盖，不自动上传全文。</p>
              <div className="flex flex-wrap gap-2"><Button disabled={!active || busy === 'import'} onClick={() => void importPaths(false)} size="sm">导入文件</Button><Button disabled={!active || busy === 'import'} onClick={() => void importPaths(true)} size="sm" variant="outline">导入文件夹</Button></div>
              <div className="mt-3 grid max-h-52 gap-2 overflow-auto">
                {sources.length ? sources.map(source => <div className="rounded-xl border border-border/60 bg-muted/20 p-2 text-xs" key={source.file}>
                  <div className="font-medium text-foreground">{source.file}</div>
                  <div className="text-muted-foreground">{source.lines} 行 · {source.chars} 字符</div>
                  <div className="mt-1 line-clamp-2 text-muted-foreground">{source.preview}</div>
                </div>) : <EmptyLine>还没有导入的稿件。导入后这里会显示真实文件、行数和预览。</EmptyLine>}
              </div>
            </Card>
            <Card title="生成作品 Bible" meta="手动抽取">
              <p className="mb-3 text-sm leading-6 text-muted-foreground">从当前项目的本地稿件抽取章节摘要、人物、设定、伏笔和时间线。第一版使用本地规则，后续可接模型但仍需手动触发。</p>
              <Button disabled={!active || busy === 'analyze'} onClick={() => void analyze()} size="sm">分析当前项目</Button>
            </Card>
          </div>

          <Card title="作品 Bible" meta={bible.updated_at ? `更新 ${bible.updated_at}` : '未生成'}>
            <div className="grid gap-4 lg:grid-cols-2">
              <BibleList rows={bible.chapters || []} title="章节摘要" render={row => `${row.title}：${row.summary}`} />
              <BibleList rows={bible.characters || []} title="人物卡" render={row => `${row.name}：${row.note || row.evidence}`} />
              <BibleList rows={bible.world || []} title="世界观/设定" render={row => `${row.rule}（${row.evidence}）`} />
              <BibleList rows={bible.foreshadows || []} title="伏笔" render={row => `[${row.status}] ${row.clue}`} />
              <BibleList rows={bible.timeline || []} title="时间线" render={row => `${row.event}（${row.evidence}）`} />
            </div>
          </Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card title="前后矛盾检查" meta="建议，不改稿">
              <p className="mb-3 text-sm leading-6 text-muted-foreground">检查怕水/潜水、生死状态、角色声音漂移、世界观硬规则等长篇一致性风险。</p>
              <Button disabled={!active || busy === 'check'} onClick={() => void checkConsistency()} size="sm">检查当前项目</Button>
              <div className="mt-3 grid gap-2">{report?.issues?.map(issue => <div className="rounded-xl border border-border/70 p-3 text-sm" key={issue.id}><div className="flex justify-between gap-2"><strong>{issue.title}</strong><span className="text-xs text-muted-foreground">{issue.severity}</span></div><p className="mt-1 text-muted-foreground">{issue.suggestion}</p><ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">{issue.evidence.map(item => <li key={item}>{item}</li>)}</ul></div>)}</div>
            </Card>

            <Card title="可控改写预览" meta="只返回 diff">
              <p className="mb-3 text-sm leading-6 text-muted-foreground">粘贴选中文本，选择明确编辑目标。Karna 不会覆盖原稿，也不会替作者定稿。</p>
              <select className="mb-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" onChange={event => setRewriteMode(event.target.value as typeof rewriteMode)} value={rewriteMode}>{rewriteModes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
              <textarea className="min-h-32 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none" onChange={event => setRewriteText(event.target.value)} placeholder="粘贴需要局部检查/改写的片段。" value={rewriteText} />
              <Button className="mt-2" disabled={!active || !rewriteText.trim() || busy === 'rewrite'} onClick={() => void previewRewrite()} size="sm">生成预览</Button>
              {rewrite ? <div className="mt-3 rounded-xl border border-border/70 bg-muted/30 p-3 text-xs"><div className="mb-2 font-medium">{rewrite.instruction}</div><pre className="max-h-72 overflow-auto whitespace-pre-wrap font-mono">{rewrite.diff}</pre><p className="mt-2 text-muted-foreground">{rewrite.reason}</p></div> : null}
            </Card>
          </div>

          <Card title="导出项目数据" meta="Markdown + JSON">
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground">导出 manuscript 合并稿和项目 JSON 包，包含 Bible、版本记录和稿件内容，便于迁移和自托管备份。</p><Button disabled={!active || busy === 'export'} onClick={() => void exportProject()} size="sm" variant="outline">导出</Button></div>
          </Card>
        </main>
      </div>
    </div>
  </div>
}

function BibleList<T>({ rows, title, render }: { rows: T[]; title: string; render: (row: T) => string }) {
  return <div className="rounded-xl border border-border/60 p-3">
    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title} · {rows.length}</div>
    <div className="grid max-h-52 gap-1 overflow-auto text-sm text-muted-foreground">
      {rows.length ? rows.slice(0, 60).map((row, index) => <div className="rounded-lg bg-muted/30 px-2 py-1" key={index}>{render(row)}</div>) : <span>暂无。请先导入稿件并手动分析。</span>}
    </div>
  </div>
}

