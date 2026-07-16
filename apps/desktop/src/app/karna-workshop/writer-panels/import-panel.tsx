import { useEffect, useState } from 'react'

import { FieldRow, SectionHeader, WorkshopEmpty, WorkshopMetric, WorkshopPanel, WorkshopStatus } from '@/components/karna/workshop'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { notify, notifyError } from '@/store/notifications'

import { api, projectRef, type WriterProject } from '../workshop-state'

interface SourceFile { file: string; title: string; chars: number; lines: number; preview: string }
interface ProjectBible {
  updated_at?: string | null
  chapters?: Array<{ id?: string; title: string; file: string; summary: string; chars: number }>
  characters?: Array<{ name: string; note?: string; evidence: string }>
  world?: Array<{ rule: string; evidence: string }>
  locations?: Array<{ name: string; evidence: string; snippet?: string }>
  foreshadows?: Array<{ clue: string; status: string; evidence: string }>
  timeline?: Array<{ event: string; evidence: string }>
}
interface BibleResponse { ok: boolean; bible: ProjectBible; versions?: Array<Record<string, unknown>>; calls?: Array<Record<string, unknown>> }
interface DraftGuardIssue { id: string; severity: string; title: string; evidence?: string[]; suggestion?: string; rule?: string }
interface DraftGuardReport {
  id: string
  blocked?: boolean
  context_id?: string | null
  recommendation?: string
  summary?: { issues?: number; high?: number; medium?: number; citations?: number; graph_matches?: number; state_matches?: number; wiki_matches?: number }
  issues?: DraftGuardIssue[]
  citations?: Array<{ id: string; title?: string; source_rel?: string; line_start?: number; line_end?: number; excerpt?: string; score?: number }>
  graph_matches?: Array<{ id?: string; type?: string; name?: string; evidence?: string }>
  state_matches?: Array<{ id?: string; type?: string; title?: string; status?: string; evidence?: string }>
}


const REWRITE_MODES = [
  ['pace', '保持剧情，只优化节奏'],
  ['dialogue', '保持人设，只增强对白冲突'],
  ['concise', '保持文风，只降低啰嗦'],
  ['suspense', '保持伏笔，只加强悬念'],
  ['logic', '只检查逻辑，不改文字']
] as const

const SEVERITY_TONE: Record<string, 'info' | 'warning' | 'danger' | 'success' | 'neutral'> = {
  info: 'info', warning: 'warning', medium: 'warning', high: 'danger', error: 'danger', low: 'success'
}

export function ImportPanel({ active, busy, setBusy, refreshBible }: { active: WriterProject | null; busy: string; setBusy: (v: string) => void; refreshBible: () => Promise<void> }) {
  const [sources, setSources] = useState<SourceFile[]>([])
  const [bible, setBible] = useState<ProjectBible>({})
  const [rewriteText, setRewriteText] = useState('')
  const [rewriteMode, setRewriteMode] = useState<(typeof REWRITE_MODES)[number][0]>('pace')
  const [rewrite, setRewrite] = useState<{ suggested: string; diff: string; reason: string } | null>(null)
  const [guard, setGuard] = useState<DraftGuardReport | null>(null)
  const [report, setReport] = useState<{ issues: Array<{ id: string; title: string; severity: string; evidence: string[]; suggestion: string }> } | null>(null)

  const ref = projectRef(active)

  useEffect(() => {
    setRewrite(null)
    setGuard(null)
    setReport(null)

    if (!active) { setSources([]); setBible({});

 return }
    void (async () => {
      try {
        const [src, b] = await Promise.all([
          api<{ sources?: SourceFile[] }>(`/api/writer/projects/${encodeURIComponent(ref)}/sources`),
          api<BibleResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/bible`)
        ])

        setSources(src.sources || [])
        setBible(b.bible || {})
      } catch (err) { notifyError(err, '导入面板加载失败') }
    })()
  }, [ref, active?.id])

  const importPaths = async (directories: boolean) => {
    if (!active) {return}
    const paths = await window.karnaDesktop.selectPaths({ directories, multiple: true, title: directories ? '选择稿件 / 资料文件夹' : '选择 Markdown / TXT 稿件', filters: directories ? undefined : [{ name: 'Text', extensions: ['md', 'markdown', 'txt'] }] })

    if (!paths.length) {return}
    setBusy('import')

    try {
      const result = await api<{ ok: boolean; imported?: unknown[]; message?: string; error?: string }>(`/api/writer/projects/${encodeURIComponent(ref)}/import`, 'POST', { paths })

      if (!result.ok) {throw new Error(result.error || '导入失败')}
      notify({ kind: 'success', title: '已导入到项目', message: `${result.imported?.length || 0} 个文件` })
      await refreshBible()
      // reload sources
      const src = await api<{ sources?: SourceFile[] }>(`/api/writer/projects/${encodeURIComponent(ref)}/sources`)
      setSources(src.sources || [])
    } catch (err) { notifyError(err, '导入失败') } finally { setBusy('') }
  }

  const analyze = async () => {
    if (!active) {return}
    setBusy('analyze')

    try {
      const result = await api<{ ok: boolean; bible?: ProjectBible; error?: string }>(`/api/writer/projects/${encodeURIComponent(ref)}/analyze`, 'POST', {})

      if (!result.ok) {throw new Error(result.error || '分析失败')}
      setBible(result.bible || {})
      notify({ kind: 'success', title: '作品 Bible 已更新', message: '作品 Bible 已更新' })
      await refreshBible()
    } catch (err) { notifyError(err, '分析失败') } finally { setBusy('') }
  }

  const exportProject = async () => {
    if (!active) {return}
    setBusy('export')

    try {
      const result = await api<{ ok: boolean; export?: { file?: string; json?: string }; error?: string }>(`/api/writer/projects/${encodeURIComponent(ref)}/export`, 'POST', {})

      if (!result.ok || !result.export) {throw new Error(result.error || '导出失败')}
      notify({ kind: 'success', title: '项目已导出', message: result.export?.file || '已导出' })
    } catch (err) { notifyError(err, '导出失败') } finally { setBusy('') }
  }

  const checkConsistency = async () => {
    if (!active) {return}
    setBusy('check')

    try {
      const result = await api<{ ok: boolean; report?: typeof report; error?: string }>(`/api/writer/projects/${encodeURIComponent(ref)}/check-consistency`, 'POST', {})

      if (!result.ok || !result.report) {throw new Error(result.error || '检查失败')}
      setReport(result.report)
      notify({ kind: 'success', title: '一致性检查完成', message: '检查完成' })
    } catch (err) { notifyError(err, '一致性检查失败') } finally { setBusy('') }
  }

  const previewRewrite = async () => {
    if (!active || !rewriteText.trim()) {return}
    setBusy('rewrite')

    try {
      const result = await api<{ ok: boolean; preview?: typeof rewrite; error?: string }>(`/api/writer/projects/${encodeURIComponent(ref)}/rewrite-preview`, 'POST', { mode: rewriteMode, text: rewriteText })

      if (!result.ok || !result.preview) {throw new Error(result.error || '改写预览失败')}
      setRewrite(result.preview)
      notify({ kind: 'success', title: '改写预览已生成', message: '已生成' })
    } catch (err) { notifyError(err, '改写预览失败') } finally { setBusy('') }
  }

  const runDraftGuard = async () => {
    if (!active || !rewriteText.trim()) {return}
    setBusy('draft-guard')

    try {
      const result = await api<{ ok: boolean; guard?: DraftGuardReport; error?: string }>(`/api/writer/projects/${encodeURIComponent(ref)}/draft-guard`, 'POST', { text: rewriteText, provider: 'auto' })

      if (!result.ok || !result.guard) {throw new Error(result.error || 'Draft Guard failed')}
      setGuard(result.guard)
      notify({ kind: result.guard.blocked ? 'warning' : 'success', title: result.guard.blocked ? 'Draft Guard blocked' : 'Draft Guard passed', message: `${result.guard.summary?.issues || 0} issues / ${result.guard.summary?.citations || 0} citations` })
    } catch (err) { notifyError(err, 'Draft Guard failed') } finally { setBusy('') }
  }

  const applyDraftGuard = async () => {
    if (!active || !guard) {return}
    setBusy('draft-guard-apply')

    try {
      const result = await api<{ ok: boolean; writeback?: { wiki_pending?: number; narrative_threads?: number; confirmed?: number }; error?: string }>(`/api/writer/projects/${encodeURIComponent(ref)}/draft-guard`, 'POST', { action: 'apply', guard })

      if (!result.ok) {throw new Error(result.error || 'Draft Guard writeback failed')}
      notify({ kind: 'success', title: 'Draft Guard writeback saved', message: `wiki pending ${result.writeback?.wiki_pending || 0} / state threads ${result.writeback?.narrative_threads || 0}` })
    } catch (err) { notifyError(err, 'Draft Guard writeback failed') } finally { setBusy('') }
  }

  if (!active) {return <WorkshopEmpty>先在项目中心选中一个项目，再导入稿件。</WorkshopEmpty>}

  return (
    <div className="grid gap-4">
      <WorkshopPanel
        actions={
          <div className="flex items-center gap-2">
            <Button disabled={busy === 'import'} onClick={() => void importPaths(false)} size="sm" variant="outline">
              <Codicon name="file-add" /> 导入文件
            </Button>
            <Button disabled={busy === 'import'} onClick={() => void importPaths(true)} size="sm" variant="outline">
              <Codicon name="folder" /> 导入文件夹
            </Button>
            <Button disabled={busy === 'analyze'} onClick={() => void analyze()} size="sm">
              <Codicon name="search" /> 抽取 Bible
            </Button>
            <Button disabled={busy === 'export'} onClick={() => void exportProject()} size="sm" variant="outline">
              <Codicon name="export" /> 导出
            </Button>
          </div>
        }
        description="把已有稿件 / 资料复制到项目目录；本地启发式抽取章节摘要、人物、设定、伏笔和时间线。"
        title="导入与分析"
      >
        <div className="grid gap-3 md:grid-cols-4">
          <WorkshopMetric accent="sky" hint={`${formatChars(sources.reduce((s, x) => s + x.chars, 0))} 字符`} label="文档" value={sources.length} />
          <WorkshopMetric accent="emerald" label="章节" value={bible.chapters?.length || 0} />
          <WorkshopMetric accent="amber" label="人物" value={(bible.characters || []).length} />
          <WorkshopMetric accent="violet" label="伏笔" value={(bible.foreshadows || []).length} />
        </div>
        <div className="mt-3 grid max-h-72 gap-1.5 overflow-auto">
          {sources.length === 0 ? <WorkshopEmpty>还没有导入任何稿件。点上方「导入文件 / 文件夹」开始。</WorkshopEmpty> : null}
          {sources.map(s => (
            <div className="grid grid-cols-[1fr_auto] gap-2 rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 px-2.5 py-1.5 text-xs" key={s.file}>
              <div className="min-w-0">
                <div className="truncate font-medium">{s.title}</div>
                <div className="truncate font-mono text-[0.65rem] text-muted-foreground">{s.file}</div>
              </div>
              <div className="text-right text-[0.7rem] text-muted-foreground tabular-nums">
                {s.lines} 行 / {formatChars(s.chars)}
              </div>
            </div>
          ))}
        </div>
      </WorkshopPanel>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <WorkshopPanel
          actions={<Button disabled={busy === 'check'} onClick={() => void checkConsistency()} size="sm"><Codicon name="checklist" /> 跑一次</Button>}
          description="基于已抽取的人物 / 设定 / 伏笔做交叉检查；只生成报告，不会自动改稿。"
          title="一致性检查"
        >
          {!report ? <WorkshopEmpty>跑一次后这里会列出冲突、缺失和冗余问题。</WorkshopEmpty> : (
            <div className="grid gap-1.5">
              {report.issues.length === 0 ? <WorkshopStatus tone="success">没有发现明显问题</WorkshopStatus> : null}
              {report.issues.map(issue => (
                <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 px-2.5 py-1.5 text-xs" key={issue.id}>
                  <div className="flex items-center gap-2">
                    <WorkshopStatus tone={SEVERITY_TONE[issue.severity] || 'info'}>{issue.severity}</WorkshopStatus>
                    <span className="font-medium">{issue.title}</span>
                  </div>
                  <p className="mt-1 text-[0.7rem] text-muted-foreground">{issue.suggestion}</p>
                  {issue.evidence.length ? <div className="mt-1 text-[0.6rem] text-muted-foreground/80">{issue.evidence.join(' · ')}</div> : null}
                </div>
              ))}
            </div>
          )}
        </WorkshopPanel>

        <WorkshopPanel
          description="只生成 diff，不会覆盖原稿；改完可手动复制回文档。"
          title="局部改写预览"
        >
          <div className="grid gap-2">
            <FieldRow label="改写模式">
              <select className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background px-2 py-1.5 text-sm" onChange={e => setRewriteMode(e.target.value as typeof rewriteMode)} value={rewriteMode}>
                {REWRITE_MODES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </FieldRow>
            <FieldRow label="原文片段">
              <textarea className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background px-2 py-1.5 text-sm" onChange={e => setRewriteText(e.target.value)} placeholder="把要改的那一段粘进来…" rows={5} value={rewriteText} />
            </FieldRow>
            <div className="flex flex-wrap justify-end gap-2">
              <Button disabled={!rewriteText.trim() || busy === 'draft-guard'} onClick={() => void runDraftGuard()} size="sm" variant="outline">
                <Codicon name="shield" /> Draft Guard
              </Button>
              <Button disabled={!rewriteText.trim() || busy === 'rewrite'} onClick={() => void previewRewrite()} size="sm">
                <Codicon name="wand" /> Generate diff
              </Button>
            </div>
            {guard ? (
              <div className="grid gap-2 rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 p-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <WorkshopStatus tone={guard.blocked ? 'danger' : 'success'}>{guard.blocked ? 'blocked' : 'passed'}</WorkshopStatus>
                  <span className="font-medium">Draft Guard ? {guard.context_id || 'no-context'}</span>
                  <span className="text-[0.65rem] text-muted-foreground">{guard.summary?.citations || 0} citations ? {guard.summary?.graph_matches || 0} graph ? {guard.summary?.state_matches || 0} state</span>
                  <Button disabled={busy === 'draft-guard-apply'} onClick={() => void applyDraftGuard()} size="xs" variant="outline">Write back canon</Button>
                </div>
                <div className="grid gap-1">
                  {(guard.issues || []).slice(0, 6).map(issue => (
                    <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background px-2 py-1" key={issue.id}>
                      <div className="flex items-center gap-2"><WorkshopStatus tone={SEVERITY_TONE[issue.severity] || 'info'}>{issue.severity}</WorkshopStatus><span>{issue.title}</span></div>
                      {issue.suggestion ? <p className="mt-1 text-[0.65rem] text-muted-foreground">{issue.suggestion}</p> : null}
                      {issue.evidence?.length ? <p className="mt-1 truncate text-[0.6rem] text-muted-foreground/80">{issue.evidence.join(' ? ')}</p> : null}
                    </div>
                  ))}
                </div>
                {guard.citations?.length ? (
                  <div className="grid gap-1">
                    <div className="text-[0.65rem] font-medium text-muted-foreground">Evidence citations</div>
                    {guard.citations.slice(0, 4).map(c => (
                      <div className="truncate rounded-[2px] bg-background px-2 py-1 font-mono text-[0.6rem] text-muted-foreground" key={c.id}>{c.id} ? {c.source_rel}:{c.line_start}-{c.line_end} ? {c.title}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {rewrite ? (
              <div className="grid gap-2 rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 p-2 text-xs">
                <div className="font-medium text-foreground/80">建议</div>
                <pre className="whitespace-pre-wrap rounded-[2px] bg-background p-2 text-foreground">{rewrite.suggested}</pre>
                <div className="font-medium text-foreground/80">Diff</div>
                <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-[2px] bg-background p-2 text-[0.65rem] text-muted-foreground">{rewrite.diff}</pre>
                <p className="text-[0.7rem] text-muted-foreground">{rewrite.reason}</p>
              </div>
            ) : null}
          </div>
        </WorkshopPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <WorkshopPanel title="章节摘要">
          <BibleList empty="还没有章节摘要" items={(bible.chapters || []).map(c => ({ label: c.title, evidence: c.file, value: c.summary, count: c.chars }))} />
        </WorkshopPanel>
        <WorkshopPanel title="人物表">
          <BibleList empty="还没有人物" items={(bible.characters || []).map(c => ({ label: c.name, evidence: c.evidence, value: c.note || '' }))} />
        </WorkshopPanel>
        <WorkshopPanel title="世界观 / 时间线 / 伏笔">
          <div className="grid gap-3">
            <SubList empty="—" items={(bible.world || []).map(w => ({ label: w.rule, evidence: w.evidence }))} title="设定" />
            <SubList empty="—" items={(bible.locations || []).map(l => ({ label: l.name, evidence: l.evidence, value: l.snippet }))} title="地点" />
            <SubList empty="—" items={(bible.timeline || []).map(t => ({ label: t.event, evidence: t.evidence }))} title="时间线" />
            <SubList empty="—" items={(bible.foreshadows || []).map(f => ({ label: f.clue, evidence: f.evidence, badge: f.status }))} title="伏笔" />
          </div>
        </WorkshopPanel>
      </div>
    </div>
  )
}

function BibleList({ items, empty }: { items: Array<{ label: string; value?: string; evidence?: string; count?: number; badge?: string }>; empty: string }) {
  if (items.length === 0) {return <WorkshopEmpty>{empty}</WorkshopEmpty>}

  return (
    <div className="grid max-h-72 gap-1.5 overflow-auto">
      {items.map((it, idx) => (
        <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 px-2.5 py-1.5 text-xs" key={`${it.label}-${idx}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate font-medium">{it.label}</span>
            <div className="flex items-center gap-1.5">
              {it.badge ? <WorkshopStatus tone={it.badge === 'resolved' ? 'success' : 'warning'}>{it.badge}</WorkshopStatus> : null}
              {typeof it.count === 'number' ? <span className="text-[0.65rem] text-muted-foreground tabular-nums">{formatChars(it.count)}</span> : null}
            </div>
          </div>
          {it.value ? <p className="mt-0.5 text-[0.7rem] text-muted-foreground line-clamp-2">{it.value}</p> : null}
          {it.evidence ? <div className="mt-0.5 truncate font-mono text-[0.6rem] text-muted-foreground/80">{it.evidence}</div> : null}
        </div>
      ))}
    </div>
  )
}

function SubList({ items, title, empty }: { items: Array<{ label: string; value?: string; evidence?: string; badge?: string }>; title: string; empty: string }) {
  return (
    <div>
      <SectionHeader>{title}</SectionHeader>
      <BibleList empty={empty} items={items} />
    </div>
  )
}

function formatChars(n: number): string {
  if (n < 1000) {return `${n}`}

  if (n < 1_000_000) {return `${(n / 1000).toFixed(1)}k`}

  return `${(n / 1_000_000).toFixed(2)}M`
}
