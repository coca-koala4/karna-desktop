import { useEffect, useState } from 'react'

import { FieldRow, WorkshopEmpty, WorkshopMetric, WorkshopPanel, WorkshopStatus } from '@/components/karna/workshop'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { notify, notifyError } from '@/store/notifications'

import { api, projectRef, type WriterProject } from '../workshop-state'

interface SafetyRisk { id: string; dimension: string; level: string; title: string; evidence?: string[]; suggestion?: string; policy?: string }
interface SafetyReport { id: string; checked_at: string; scope?: string; summary?: { high?: number; medium?: number; total?: number; publish_ready?: boolean }; risks?: SafetyRisk[] }
interface SafetyResponse { ok: boolean; report?: SafetyReport; reports?: SafetyReport[]; updated_at?: string | null }
interface CriticFinding { id: string; lens: string; level: string; title: string; evidence?: string[]; suggestion?: string }
interface CriticLens { id: string; name: string; focus?: string; status?: string; findings?: CriticFinding[] }
interface CriticReport { id: string; checked_at: string; summary?: { findings?: number; high?: number; medium?: number; status?: string }; lenses?: CriticLens[]; findings?: CriticFinding[]; policy?: string }
interface CriticCouncilResponse { ok: boolean; reports?: CriticReport[]; report?: CriticReport; lenses?: CriticLens[]; updated_at?: string | null }
interface CreativeMemoryRow { id: string; type: string; title: string; content?: string; evidence?: string; source?: string; confidence?: number; pinned?: boolean; created_at?: string; updated_at?: string }
interface CreativeMemoryStore { memories?: CreativeMemoryRow[]; decisions?: unknown[]; preferences?: unknown[]; stats?: { memories?: number; pinned?: number; decisions?: number; preferences?: number; types?: Record<string, number> }; updated_at?: string | null }
interface CreativeMemoryResponse { ok: boolean; memory?: CreativeMemoryStore; memories?: CreativeMemoryRow[]; added?: CreativeMemoryRow; forgotten?: string; updated_at?: string | null }
interface ProjectArtifact { id: string; type: string; title: string; source?: string; rel?: string; path?: string; bytes?: number; updated_at?: string; preview?: string }
interface ProjectArtifactsResponse { ok: boolean; artifacts?: ProjectArtifact[]; stats?: { artifacts?: number; types?: Record<string, number>; sources?: Record<string, number> }; delivery?: { name?: string; rel?: string; zip_rel?: string; manifest?: { files?: unknown[]; sections?: Array<{ id: string; title?: string; files?: string[] }> }; artifact?: ProjectArtifact }; verification?: { ok?: boolean; files?: number; passed?: number; missing?: number; changed?: number; manifest_rel?: string; failures?: Array<{ rel?: string; ok?: boolean; exists?: boolean }> }; report?: { ok?: boolean; files?: number; passed?: number; missing?: number; changed?: number; manifest_rel?: string }; updated_at?: string | null }
interface DataModelEntity { id: string; name: string; store: string; role?: string; fields?: string[]; exists?: boolean; rows?: number; keys?: string[] }
interface DataModelStore { rel: string; label?: string; exists: boolean; bytes?: number; updated_at?: string | null; rows?: number; keys?: string[] }
interface DataModelSnapshot { id: string; at: string; ready?: boolean; entities?: number; stores?: number; total_rows?: number; missing_files?: string[] }
interface DataModelResponse { ok: boolean; entities?: DataModelEntity[]; stores?: DataModelStore[]; snapshots?: DataModelSnapshot[]; updated_at?: string | null }
interface MilestoneRow { id: string; title: string; status: string; deliverables?: string[] }
interface BenchmarkCheck { id: string; title: string; ok: boolean; score: number; detail?: string }
interface MaturityGap { id: string; title: string; score: number; detail?: string; target?: string; action?: string }
interface BenchmarkRun { id: string; at: string; score: number; readiness_score?: number; maturity_score?: number; maturity_gaps?: MaturityGap[]; passed: number; total: number; recommendation?: string; checks?: BenchmarkCheck[] }
interface LoopVerifyStep { id: string; ok: boolean; detail?: string; context_id?: string; run_id?: string }
interface AcceptanceAuditItem { id: string; title: string; ok: boolean; status?: string; evidence?: string[]; gaps?: string[] }
interface AcceptanceAudit { id: string; at: string; score: number; passed: number; total: number; status: string; items?: AcceptanceAuditItem[]; command_center?: { status?: string; health_score?: number } }
interface BenchmarkResponse { ok: boolean; milestones?: MilestoneRow[]; runs?: BenchmarkRun[]; run?: BenchmarkRun; benchmark?: BenchmarkRun; steps?: LoopVerifyStep[]; audit?: AcceptanceAudit; report?: AcceptanceAudit; markdown_rel?: string; json_rel?: string; updated_at?: string | null }

const LEVEL_TONE: Record<string, 'info' | 'warning' | 'danger' | 'success' | 'neutral'> = {
  info: 'info', low: 'info', warning: 'warning', medium: 'warning', high: 'danger', blocked: 'danger', error: 'danger'
}

const LOOP_CHECK_IDS = ['rag_context_pack', 'workflow_rag_injection', 'workflow_writeback', 'wiki_confirm_refresh']

const LOOP_CHECK_HELP: Record<string, string> = {
  rag_context_pack: 'RAG search can assemble citation-ready evidence context.',
  workflow_rag_injection: 'Agent workflow nodes receive evidence context before generation.',
  workflow_writeback: 'Workflow results are persisted into artifacts, wiki pending updates, and narrative state.',
  wiki_confirm_refresh: 'Confirmed Living Wiki updates refresh graph and creative memory.',
  canon_review_queue: 'Canon Review Queue is reviewed instead of accumulating unmerged AI canon changes.',
  draft_guard_input_gate: 'Workflow input is checked by Draft Guard before execution.',
  draft_guard_output_gate: 'Agent output is checked by Draft Guard before canon/writeback.'
}

const CHECK_REPAIR_HINTS: Record<string, { panel: string; action: string }> = {
  schema_ready: { panel: '项目 / 数据结构', action: '修复项目数据结构' },
  documents_indexed: { panel: '知识', action: '同步文档或导入稿件' },
  story_bible: { panel: '世界设定', action: '从源文档构建故事圣经' },
  creative_search: { panel: '知识', action: '执行创意检索索引' },
  living_wiki: { panel: '世界设定', action: '生成动态百科候选项' },
  knowledge_graph: { panel: '世界设定', action: '重建知识图谱' },
  narrative_state: { panel: '世界设定', action: '构建叙事状态' },
  critic_council: { panel: '质量', action: '运行评审委员会' },
  creative_memory: { panel: '质量', action: '重建创意记忆' },
  artifact_registry: { panel: '质量', action: '同步交付物' },
  data_model: { panel: '质量', action: '检查数据模型' },
  writer_os_guide: { panel: '项目', action: '生成 Writer OS 指南' },
  rag_index: { panel: '知识', action: '构建 RAG 索引' },
  vector_store: { panel: '知识', action: '构建向量库' },
  rag_context_pack: { panel: '质量 / 知识', action: '运行闭环或组装上下文包' },
  workflow_ready: { panel: '智能体', action: '创建智能体工作流' },
  workflow_rag_injection: { panel: '质量 / 智能体', action: '运行闭环或启用 RAG 的工作流' },
  workflow_writeback: { panel: '质量 / 智能体', action: '运行工作流并持久化回写' },
  wiki_confirm_refresh: { panel: '质量 / 世界设定', action: '运行闭环或确认工作流百科更新' },
  canon_review_queue: { panel: '世界设定', action: 'Review / accept / reject canon queue' },
  draft_guard_input_gate: { panel: '智能体', action: '运行带草稿守卫预检的工作流' },
  draft_guard_output_gate: { panel: '智能体', action: '运行带输出草稿守卫的工作流' },
  capability_packs: { panel: '技能', action: '同步能力包' },
  safety_report: { panel: '质量', action: 'Run Safety & Copyright check' }
}

const GAP_GUIDE_STEPS: Record<string, string> = {
  documents_indexed: 'seed_documents',
  story_bible: 'seed_documents',
  creative_search: 'creative_search',
  living_wiki: 'living_wiki',
  knowledge_graph: 'knowledge_graph',
  narrative_state: 'narrative_state',
  critic_council: 'critic_council',
  creative_memory: 'creative_memory',
  artifact_registry: 'artifacts',
  data_model: 'data_model',
  writer_os_guide: 'benchmark',
  rag_index: 'seed_documents',
  vector_store: 'seed_documents',
  rag_context_pack: 'closed_loop',
  workflow_ready: 'workflow',
  workflow_rag_injection: 'closed_loop',
  workflow_writeback: 'closed_loop',
  wiki_confirm_refresh: 'closed_loop',
  canon_review_queue: 'canon_review',
  draft_guard_input_gate: 'workflow_guard',
  draft_guard_output_gate: 'workflow_guard',
  capability_packs: 'capabilities',
  safety_report: 'safety'
}

export function QualityPanel({ active, busy, setBusy }: { active: WriterProject | null; busy: string; setBusy: (v: string) => void }) {
  const [safetyReports, setSafetyReports] = useState<SafetyReport[]>([])
  const [safetyText, setSafetyText] = useState('')
  const [criticReports, setCriticReports] = useState<CriticReport[]>([])
  const [criticLenses, setCriticLenses] = useState<CriticLens[]>([])
  const [criticText, setCriticText] = useState('')
  const [memories, setMemories] = useState<CreativeMemoryRow[]>([])
  const [memoryStats, setMemoryStats] = useState<NonNullable<CreativeMemoryStore['stats']>>({})
  const [memoryTitle, setMemoryTitle] = useState('')
  const [memoryContent, setMemoryContent] = useState('')
  const [artifacts, setArtifacts] = useState<ProjectArtifact[]>([])
  const [artifactStats, setArtifactStats] = useState<NonNullable<ProjectArtifactsResponse['stats']>>({})
  const [deliveryPackage, setDeliveryPackage] = useState<ProjectArtifactsResponse['delivery'] | null>(null)
  const [deliveryVerification, setDeliveryVerification] = useState<ProjectArtifactsResponse['verification'] | null>(null)
  const [entities, setEntities] = useState<DataModelEntity[]>([])
  const [stores, setStores] = useState<DataModelStore[]>([])
  const [benchmarks, setBenchmarks] = useState<BenchmarkRun[]>([])
  const [milestones, setMilestones] = useState<MilestoneRow[]>([])
  const [loopVerifySteps, setLoopVerifySteps] = useState<LoopVerifyStep[]>([])
  const [acceptanceAudit, setAcceptanceAudit] = useState<AcceptanceAudit | null>(null)
  const [acceptanceAuditPath, setAcceptanceAuditPath] = useState('')

  const ref = projectRef(active)

  const refresh = async () => {
    if (!active) {return}

    try {
      const [s, c, m, a, d, b] = await Promise.all([
        api<SafetyResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/safety`),
        api<CriticCouncilResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/critic-council`),
        api<CreativeMemoryResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/creative-memory`),
        api<ProjectArtifactsResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/artifacts`),
        api<DataModelResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/data-model`),
        api<BenchmarkResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/benchmarks`)
      ])

      setSafetyReports(s.reports || (s.report ? [s.report] : []))
      setCriticReports(c.reports || (c.report ? [c.report] : []))
      setCriticLenses(c.lenses || c.report?.lenses || [])
      setMemories(m.memories || m.memory?.memories || [])
      setMemoryStats(m.memory?.stats || {})
      setArtifacts(a.artifacts || [])
      setArtifactStats(a.stats || {})
      setEntities(d.entities || [])
      setStores(d.stores || [])
      setBenchmarks(b.runs || (b.run ? [b.run] : []))
      setMilestones(b.milestones || [])
    } catch (err) { notifyError(err, '质量面板加载失败') }
  }

  useEffect(() => {
    setSafetyReports([]); setCriticReports([]); setMemories([]); setArtifacts([]); setEntities([]); setBenchmarks([]); setAcceptanceAudit(null); setAcceptanceAuditPath(''); setDeliveryPackage(null); setDeliveryVerification(null)

    if (!active) {return}
    void refresh()
  }, [ref, active?.id])

  const runSafety = async () => {
    if (!active) {return}
    setBusy('safety')

    try {
      const result = await api<SafetyResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/safety`, 'POST', { text: safetyText })
      setSafetyReports(result.reports || (result.report ? [result.report] : []))
      notify({ kind: 'success', title: '安全检查已运行', message: '安全检查已运行' })
    } catch (err) { notifyError(err, '安全检查失败') } finally { setBusy('') }
  }

  const runCritic = async () => {
    if (!active) {return}
    setBusy('critic')

    try {
      const result = await api<CriticCouncilResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/critic-council`, 'POST', { text: criticText })
      setCriticReports(result.reports || (result.report ? [result.report] : []))
      setCriticLenses(result.lenses || result.report?.lenses || [])
      notify({ kind: 'success', title: '评审委员会已运行', message: '评审委员会已运行' })
    } catch (err) { notifyError(err, '评审运行失败') } finally { setBusy('') }
  }

  const addMemory = async () => {
    if (!active || !memoryTitle.trim()) {return}
    setBusy('creative-memory')

    try {
      const result = await api<CreativeMemoryResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/creative-memory`, 'POST', { action: 'add', title: memoryTitle.trim(), content: memoryContent })
      setMemories(result.memories || [])
      setMemoryTitle(''); setMemoryContent('')
      notify({ kind: 'success', title: '记忆已加入', message: '记忆已加入' })
    } catch (err) { notifyError(err, '加入记忆失败') } finally { setBusy('') }
  }

  const rebuildMemory = async () => {
    if (!active) {return}
    setBusy('creative-memory')

    try {
      const result = await api<CreativeMemoryResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/creative-memory`, 'POST', { action: 'build' })
      setMemories(result.memories || [])
      notify({ kind: 'success', title: '记忆已重建', message: `${result.memories?.length || 0} 条` })
    } catch (err) { notifyError(err, '记忆重建失败') } finally { setBusy('') }
  }

  const syncArtifacts = async () => {
    if (!active) {return}
    setBusy('artifacts')

    try {
      const result = await api<ProjectArtifactsResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/artifacts`, 'POST', {})
      setArtifacts(result.artifacts || [])
      setArtifactStats(result.stats || {})
      notify({ kind: 'success', title: '产物索引已同步', message: '产物索引已同步' })
    } catch (err) { notifyError(err, '同步产物失败') } finally { setBusy('') }
  }

  const createDeliveryPackage = async () => {
    if (!active) {return}
    setBusy('delivery-package')

    try {
      const result = await api<ProjectArtifactsResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/artifacts`, 'POST', { action: 'delivery', zip: true })
      setDeliveryPackage(result.delivery || null)
      setArtifacts(result.artifacts || artifacts)
      notify({ kind: result.ok === false ? 'warning' : 'success', title: '交付包已创建', message: result.delivery?.zip_rel || result.delivery?.rel || 'done' })
      await refresh()
    } catch (err) { notifyError(err, '创建交付包失败') } finally { setBusy('') }
  }

  const verifyDeliveryPackage = async () => {
    if (!active) {return}
    setBusy('verify-delivery')

    try {
      const result = await api<ProjectArtifactsResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/artifacts`, 'POST', { action: 'verify-delivery' })
      setDeliveryVerification(result.verification || result.report || null)
      notify({ kind: result.ok === false ? 'warning' : 'success', title: result.ok === false ? '交付包校验失败' : '交付包已校验', message: `${result.verification?.passed || result.report?.passed || 0}/${result.verification?.files || result.report?.files || 0}` })
      await refresh()
    } catch (err) { notifyError(err, '交付包校验失败') } finally { setBusy('') }
  }

  const inspectDataModel = async () => {
    if (!active) {return}
    setBusy('data-model')

    try {
      const result = await api<DataModelResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/data-model`, 'POST', {})
      setEntities(result.entities || [])
      setStores(result.stores || [])
    } catch (err) { notifyError(err, '检查数据模型失败') } finally { setBusy('') }
  }

  const runBenchmark = async () => {
    if (!active) {return}
    setBusy('benchmark')

    try {
      const result = await api<BenchmarkResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/benchmarks`, 'POST', {})
      setBenchmarks(result.runs || (result.run ? [result.run] : []))
      setMilestones(result.milestones || [])
      const run = result.run || result.runs?.[0]
      notify({ kind: 'success', title: '基准测试完成', message: run ? `readiness ${(run.readiness_score ?? run.score).toFixed(2)} / maturity ${(run.maturity_score ?? run.score).toFixed(2)}` : 'done' })
    } catch (err) { notifyError(err, '基准测试失败') } finally { setBusy('') }
  }

  const runAcceptanceAudit = async () => {
    if (!active) {return}
    setBusy('acceptance-audit')

    try {
      const result = await api<BenchmarkResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/benchmarks`, 'POST', { action: 'audit' })
      setAcceptanceAudit(result.audit || result.report || null)
      setAcceptanceAuditPath(result.markdown_rel || '')
      const audit = result.audit || result.report
      notify({ kind: audit?.score === 1 ? 'success' : 'warning', title: '验收审计完成', message: audit ? `${audit.passed}/${audit.total} - ${audit.status}` : 'done' })
    } catch (err) { notifyError(err, '验收审计失败') } finally { setBusy('') }
  }

  const verifyClosedLoop = async () => {
    if (!active) {return}
    setBusy('closed-loop')

    try {
      const result = await api<BenchmarkResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/benchmarks`, 'POST', { action: 'closed-loop', provider: 'local' })
      setLoopVerifySteps(result.steps || [])
      setBenchmarks(result.runs || (result.benchmark ? [result.benchmark] : result.run ? [result.run] : []))
      setMilestones(result.milestones || milestones)
      notify({ kind: result.ok ? 'success' : 'warning', title: result.ok ? '闭环已验证' : '闭环仍需修复', message: `${(result.steps || []).filter(s => s.ok).length}/${result.steps?.length || 0}` })
    } catch (err) { notifyError(err, '闭环验证失败') } finally { setBusy('') }
  }


  const runMaturityGap = async (gap: MaturityGap) => {
    if (!active) {return}
    const step = GAP_GUIDE_STEPS[gap.id]

    if (!step) {return}
    setBusy(`maturity-${gap.id}`)

    try {
      if (step === 'closed_loop') {
        const closed = await api<BenchmarkResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/benchmarks`, 'POST', { action: 'closed-loop', provider: 'local' })
        setLoopVerifySteps(closed.steps || [])
      } else if (step === 'workflow_guard') {
        const closed = await api<BenchmarkResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/benchmarks`, 'POST', { action: 'closed-loop', provider: 'local', draftGuard: true, draftGuardOutputs: true })
        setLoopVerifySteps(closed.steps || [])
      } else {
        await api(`/api/writer/projects/${encodeURIComponent(ref)}/guide`, 'POST', { action: 'run-step', step, provider: 'local', all: step === 'canon_review' })

        if (step === 'seed_documents') {
          for (const followUpStep of ['rag', 'vector_store', 'creative_memory']) {
            await api(`/api/writer/projects/${encodeURIComponent(ref)}/guide`, 'POST', { action: 'run-step', step: followUpStep, provider: 'local' })
          }
        }
      }

      const bench = await api<BenchmarkResponse>(`/api/writer/projects/${encodeURIComponent(ref)}/benchmarks`, 'POST', {})
      setBenchmarks(bench.runs || (bench.run ? [bench.run] : []))
      notify({ kind: 'success', title: '成熟度修复操作完成', message: `${gap.title} -> ${step}` })
      await refresh()
    } catch (err) { notifyError(err, '成熟度修复操作失败') } finally { setBusy('') }
  }

  if (!active) {return <WorkshopEmpty>先在项目中心选中项目，再进入质量 / 评审面板。</WorkshopEmpty>}

  const latestSafety = safetyReports[0]
  const latestCritic = criticReports[0]
  const lastBench = benchmarks[0]
  const loopChecks = (lastBench?.checks || []).filter(c => LOOP_CHECK_IDS.includes(c.id))
  const loopPassed = loopChecks.filter(c => c.ok).length
  const loopTotal = LOOP_CHECK_IDS.length

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-5">
        <WorkshopMetric accent="rose" hint="Safety & Copyright" label="高风险" value={latestSafety?.summary?.high ?? 0} />
        <WorkshopMetric accent="amber" label="中风险" value={(latestSafety?.summary?.medium ?? 0) + (latestCritic?.summary?.medium ?? 0)} />
        <WorkshopMetric accent="violet" hint={latestCritic?.summary?.status || '未跑'} label="评审" value={latestCritic?.summary?.findings ?? 0} />
        <WorkshopMetric accent="sky" hint={memoryStats.pinned ? `${memoryStats.pinned} 钉住` : '可钉住'} label="Creative Memory" value={memories.length} />
        <WorkshopMetric accent="emerald" hint={lastBench ? `maturity ${Number(lastBench.maturity_score ?? lastBench.score).toFixed(2)}` : 'not run'} label="Benchmark" value={lastBench ? Number(lastBench.readiness_score ?? lastBench.score).toFixed(2) : 0} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <WorkshopPanel
          actions={
            <div className="flex items-center gap-2">
              <Button onClick={() => void refresh()} size="sm" variant="outline"><Codicon name="refresh" /></Button>
              <Button disabled={busy === 'safety'} onClick={() => void runSafety()} size="sm"><Codicon name="shield" /> 跑</Button>
            </div>
          }
          description="自动检查风格克隆 / 长文复现 / 平台风险 / PII / Soul 风险。报告只给建议，不会自动改稿。"
          title="Safety & Copyright"
        >
          <FieldRow description="不填则检查项目文档；填写后只检查这段文本。" label="可选：手动检查片段">
            <textarea className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background px-2 py-1.5 text-sm" onChange={e => setSafetyText(e.target.value)} placeholder="粘贴用户作品片段，用于评审或相似度风险检测" rows={3} value={safetyText} />
          </FieldRow>
          {!latestSafety ? <WorkshopEmpty>点上方「跑」做一次安全检查。</WorkshopEmpty> : (
            <div className="grid gap-1.5">
              {(latestSafety.risks || []).map(r => (
                <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 p-2 text-xs" key={r.id}>
                  <div className="flex items-center gap-1.5">
                    <WorkshopStatus tone={LEVEL_TONE[r.level] || 'info'}>{r.level}</WorkshopStatus>
                    <span className="font-medium">{r.title}</span>
                    <span className="text-[0.6rem] text-muted-foreground">{r.dimension}</span>
                  </div>
                  {r.suggestion ? <p className="mt-0.5 text-[0.7rem] text-muted-foreground">{r.suggestion}</p> : null}
                </div>
              ))}
              {latestSafety.risks?.length === 0 ? <WorkshopStatus tone="success">没有发现明显风险</WorkshopStatus> : null}
            </div>
          )}
        </WorkshopPanel>

        <WorkshopPanel
          actions={
            <div className="flex items-center gap-2">
              <Button onClick={() => void refresh()} size="sm" variant="outline"><Codicon name="refresh" /></Button>
              <Button disabled={busy === 'critic'} onClick={() => void runCritic()} size="sm"><Codicon name="gavel" /> 评审</Button>
            </div>
          }
          description="六视角审稿：编辑 / 逻辑 / 人物 / 世界 / 伏笔 / 安全。报告只给建议，作者决定是否采纳。"
          title="Critic Council"
        >
          <FieldRow label="可选：待审片段">
            <textarea className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background px-2 py-1.5 text-sm" onChange={e => setCriticText(e.target.value)} placeholder="粘贴章节或片段" rows={3} value={criticText} />
          </FieldRow>
          {!latestCritic ? <WorkshopEmpty>点上方「评审」让多视角审稿 Agent 跑一次。</WorkshopEmpty> : (
            <div className="grid gap-1.5">
              {(criticLenses || []).map(lens => (
                <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 p-2 text-xs" key={lens.id}>
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{lens.name}</span>
                    <WorkshopStatus tone={lens.status === 'blocked' ? 'danger' : lens.status === 'needs_revision' ? 'warning' : lens.status === 'clear' ? 'success' : 'info'}>{lens.status || 'ok'}</WorkshopStatus>
                  </div>
                  <p className="mt-0.5 text-[0.7rem] text-muted-foreground">{lens.focus}</p>
                  {lens.findings?.length ? <div className="mt-1 text-[0.65rem] text-muted-foreground">{(lens.findings || []).length} 条 findings</div> : null}
                </div>
              ))}
              {latestCritic.findings?.length ? (
                <div className="grid gap-1">
                  {latestCritic.findings.slice(0, 5).map(f => (
                    <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 p-2 text-xs" key={f.id}>
                      <div className="flex items-center gap-1.5">
                        <WorkshopStatus tone={LEVEL_TONE[f.level] || 'info'}>{f.level}</WorkshopStatus>
                        <span className="font-medium">{f.title}</span>
                        <span className="text-[0.6rem] text-muted-foreground">{f.lens}</span>
                      </div>
                      {f.suggestion ? <p className="mt-0.5 text-[0.7rem] text-muted-foreground">{f.suggestion}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </WorkshopPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <WorkshopPanel
          actions={
            <div className="flex items-center gap-2">
              <Button disabled={busy === 'creative-memory'} onClick={() => void rebuildMemory()} size="sm" variant="outline"><Codicon name="refresh" /> 重建</Button>
              <Button disabled={!memoryTitle.trim() || busy === 'creative-memory'} onClick={() => void addMemory()} size="sm"><Codicon name="pin" /> 钉住</Button>
            </div>
          }
          description="可钉住的设定 / 决策 / 偏好；从 Story Bible + Wiki + State + Critic 自动构建，也可以手动加。"
          title="Creative Memory"
        >
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <FieldRow label="标题">
              <input className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background px-2 py-1.5 text-sm" onChange={e => setMemoryTitle(e.target.value)} placeholder="如：林凡的核心动机" value={memoryTitle} />
            </FieldRow>
            <div className="self-end pb-2 text-[0.6rem] text-muted-foreground">来源: manual</div>
          </div>
          <FieldRow label="内容">
            <textarea className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background px-2 py-1.5 text-sm" onChange={e => setMemoryContent(e.target.value)} placeholder="短描述 + 引用" rows={2} value={memoryContent} />
          </FieldRow>
          <div className="mt-3 grid max-h-48 gap-1 overflow-auto">
            {memories.length === 0 ? <WorkshopEmpty>还没有记忆。点「重建」从 Story Bible / Wiki / State 自动构建。</WorkshopEmpty> : null}
            {memories.slice(0, 30).map(m => (
              <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 px-2 py-1.5 text-xs" key={m.id}>
                <div className="flex items-center gap-1.5">
                  {m.pinned ? <Codicon className="text-amber-500" name="pinned" /> : null}
                  <span className="truncate font-medium">{m.title}</span>
                  <WorkshopStatus tone="info">{m.type}</WorkshopStatus>
                </div>
                {m.content ? <p className="mt-0.5 line-clamp-2 text-[0.7rem] text-muted-foreground">{m.content}</p> : null}
                {m.evidence ? <div className="mt-0.5 truncate font-mono text-[0.6rem] text-muted-foreground/80">{m.evidence}</div> : null}
              </div>
            ))}
          </div>
        </WorkshopPanel>

        <WorkshopPanel
          actions={
            <div className="flex items-center gap-2">
              <Button disabled={busy === 'delivery-package'} onClick={() => void createDeliveryPackage()} size="sm" variant="outline"><Codicon name="package" /> 生成交付包</Button>
              <Button disabled={busy === 'verify-delivery'} onClick={() => void verifyDeliveryPackage()} size="sm" variant="outline"><Codicon name="verified" /> 校验</Button>
              <Button disabled={busy === 'artifacts'} onClick={() => void syncArtifacts()} size="sm" variant="outline"><Codicon name="sync" /> 同步交付物</Button>
              <Button disabled={busy === 'data-model'} onClick={() => void inspectDataModel()} size="sm" variant="outline"><Codicon name="data" /> 数据模型</Button>
            </div>
          }
          description="扫描 exports / workflow_artifacts / drafts / safety / critics 目录；展示项目 JSON 数据库健康。"
          title="产物索引 / 数据模型"
        >
          <div className="grid gap-1.5">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <WorkshopMetric accent="emerald" hint={artifactStats.sources ? `${Object.keys(artifactStats.sources).length} 来源` : '—'} label="产物" value={artifacts.length} />
              <WorkshopMetric accent="sky" hint={stores.length ? `${stores.length} 存储` : ''} label="实体" value={entities.length} />
              <WorkshopMetric accent="amber" hint="missing" label="存疑" value={stores.filter(s => !s.exists).length} />
              <WorkshopMetric accent="violet" hint={lastBench?.recommendation || '点 Benchmark'} label="检查" value={lastBench ? `${lastBench.passed}/${lastBench.total}` : '—'} />
            </div>
            {deliveryPackage ? (
              <div className="rounded-[2px] border border-emerald-500/25 bg-emerald-500/5 px-2 py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <WorkshopStatus tone="success">delivery</WorkshopStatus>
                  <span className="truncate font-medium">{deliveryPackage.name}</span>
                </div>
                <div className="mt-0.5 font-mono text-[0.65rem] text-muted-foreground">{deliveryPackage.zip_rel || deliveryPackage.rel}</div>
                <div className="mt-0.5 text-[0.65rem] text-muted-foreground">{deliveryPackage.manifest?.files?.length || 0} files / {deliveryPackage.manifest?.sections?.length || 0} sections</div>
              </div>
            ) : null}
            {deliveryVerification ? (
              <div className="rounded-[2px] border border-sky-500/25 bg-sky-500/5 px-2 py-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <WorkshopStatus tone={deliveryVerification.ok === false ? 'warning' : 'success'}>{deliveryVerification.ok === false ? 'verify failed' : 'verified'}</WorkshopStatus>
                  <span className="font-mono text-muted-foreground">{deliveryVerification.passed || 0}/{deliveryVerification.files || 0}</span>
                  <span className="text-muted-foreground">missing {deliveryVerification.missing || 0} / changed {deliveryVerification.changed || 0}</span>
                </div>
                <div className="mt-0.5 truncate font-mono text-[0.65rem] text-muted-foreground">{deliveryVerification.manifest_rel}</div>
              </div>
            ) : null}
            <div className="grid max-h-48 gap-1 overflow-auto">
              {stores.length === 0 ? <WorkshopEmpty>点「检查模型」扫描项目 JSON 数据库。</WorkshopEmpty> : null}
              {stores.map(s => (
                <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 px-2 py-1.5 text-xs" key={s.rel}>
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{s.label || s.rel}</span>
                    <WorkshopStatus tone={s.exists ? 'success' : 'warning'}>{s.exists ? '就绪' : '待补'}</WorkshopStatus>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[0.6rem] text-muted-foreground/80">{s.rel}</div>
                </div>
              ))}
            </div>
          </div>
        </WorkshopPanel>
      </div>

      <WorkshopPanel
        actions={
          <div className="flex items-center gap-2">
            <Button disabled={busy === 'acceptance-audit'} onClick={() => void runAcceptanceAudit()} size="sm" variant="outline"><Codicon name="checklist" /> 验收审计</Button>
            <Button disabled={busy === 'closed-loop'} onClick={() => void verifyClosedLoop()} size="sm" variant="outline"><Codicon name="circuit-board" /> 闭环验证</Button>
            <Button disabled={busy === 'benchmark'} onClick={() => void runBenchmark()} size="sm"><Codicon name="rocket" /> 基准测试</Button>
          </div>
        }
        description="端到端自检：schema / documents / story_bible / creative_search / living_wiki / knowledge_graph / narrative_state / critic / memory / artifact / data_model / writer_os_guide / rag / workflow / capability_packs / safety。"
        title="Benchmark"
      >
        {acceptanceAudit ? (
          <div className="mb-3 rounded-[2px] border border-emerald-500/25 bg-emerald-500/5 p-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">验收审计</span>
              <WorkshopStatus tone={acceptanceAudit.score >= 0.95 ? 'success' : acceptanceAudit.score >= 0.8 ? 'info' : 'warning'}>{acceptanceAudit.status}</WorkshopStatus>
              <span className="font-mono text-muted-foreground">{acceptanceAudit.passed}/{acceptanceAudit.total} - {acceptanceAudit.score.toFixed(2)}</span>
              {acceptanceAuditPath ? <span className="font-mono text-[0.65rem] text-muted-foreground">{acceptanceAuditPath}</span> : null}
            </div>
            <div className="mt-2 grid gap-1 md:grid-cols-2">
              {(acceptanceAudit.items || []).slice(0, 8).map(item => (
                <div className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 px-2 py-1" key={item.id}>
                  <WorkshopStatus tone={item.ok ? 'success' : 'warning'}>{item.ok ? 'ok' : 'gap'}</WorkshopStatus>
                  <span className="truncate">{item.title}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {lastBench ? (
          <div className="grid gap-2">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">最近：</span>
              <span className="font-mono">{formatTime(lastBench.at)}</span>
              <WorkshopStatus tone={(lastBench.readiness_score ?? lastBench.score) >= 1 ? 'success' : (lastBench.readiness_score ?? lastBench.score) >= 0.75 ? 'info' : 'warning'}>readiness {(lastBench.readiness_score ?? lastBench.score).toFixed(2)}</WorkshopStatus>
              <WorkshopStatus tone={lastBench.passed === lastBench.total ? 'success' : 'warning'}>{lastBench.passed}/{lastBench.total} passed</WorkshopStatus>
              <WorkshopStatus tone={(lastBench.maturity_score ?? lastBench.score) >= 0.85 ? 'success' : (lastBench.maturity_score ?? lastBench.score) >= 0.55 ? 'info' : 'warning'}>maturity {(lastBench.maturity_score ?? lastBench.score).toFixed(2)}</WorkshopStatus>
            </div>
            <p className="text-xs text-muted-foreground">{lastBench.recommendation}</p>
            {lastBench.maturity_gaps?.length ? (
              <div className="rounded-[2px] border border-amber-500/25 bg-amber-500/5 p-2">
                <div className="mb-1 flex items-center gap-2 text-xs">
                  <span className="font-medium">成熟度路线图</span>
                  <WorkshopStatus tone="warning">{lastBench.maturity_gaps.length} gaps</WorkshopStatus>
                  <span className="text-muted-foreground">逐步将成熟度提升到 0.85 以上，同时不要与就绪度混淆。</span>
                </div>
                <div className="grid gap-1 md:grid-cols-2">
                  {lastBench.maturity_gaps.slice(0, 6).map(gap => (
                    <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 px-2 py-1.5 text-xs" key={gap.id}>
                      <div className="flex items-center gap-1.5">
                        <WorkshopStatus tone={gap.score >= 0.55 ? 'info' : 'warning'}>{gap.score.toFixed(2)}</WorkshopStatus>
                        <span className="truncate font-medium">{gap.title}</span>
                      </div>
                      <p className="mt-0.5 text-[0.68rem] text-muted-foreground">Target: {gap.target}</p>
                      <p className="mt-0.5 text-[0.68rem] text-muted-foreground">Action: {gap.action}</p>
                      <div className="mt-1 flex justify-end">
                        <Button disabled={busy === `maturity-${gap.id}`} onClick={() => void runMaturityGap(gap)} size="xs" variant="outline"><Codicon name="play" /> 执行操作</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="rounded-[2px] border border-emerald-500/25 bg-emerald-500/5 p-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-medium">Writer OS 创作闭环</span>
                <WorkshopStatus tone={loopPassed === loopTotal ? 'success' : loopPassed > 0 ? 'warning' : 'danger'}>{loopPassed}/{loopTotal}</WorkshopStatus>
                <span className="text-muted-foreground">RAG → 上下文 → 工作流 → 回写 → 百科 / 图谱 / 记忆</span>
              </div>
              {loopVerifySteps.length ? (
                <div className="mt-2 grid gap-1 rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/50 p-1">
                  {loopVerifySteps.map(step => (
                    <div className="grid grid-cols-[auto_1fr] items-center gap-2 text-[0.68rem]" key={step.id}>
                      <WorkshopStatus tone={step.ok ? 'success' : 'warning'}>{step.ok ? 'ok' : 'todo'}</WorkshopStatus>
                      <span className="truncate text-muted-foreground">{step.id}: {step.detail || ''}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-2 grid gap-1 md:grid-cols-2">
                {LOOP_CHECK_IDS.map(id => {
                  const c = loopChecks.find(check => check.id === id)

                  return (
                    <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 px-2 py-1.5 text-xs" key={id}>
                      <div className="flex items-center gap-1.5">
                        <WorkshopStatus tone={c?.ok ? 'success' : 'warning'}>{c?.ok ? 'ok' : 'todo'}</WorkshopStatus>
                        <span className="truncate font-medium">{c?.title || id}</span>
                        <span className="ml-auto font-mono text-[0.65rem] tabular-nums text-muted-foreground">{c ? c.score.toFixed(2) : '--'}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[0.68rem] text-muted-foreground">{c?.detail || LOOP_CHECK_HELP[id]}</p>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="grid max-h-64 gap-1 overflow-auto">
              {(lastBench.checks || []).map(c => {
                const hint = CHECK_REPAIR_HINTS[c.id]

                return (
                  <div className="rounded-[2px] border border-(--ui-stroke-tertiary) bg-background/70 px-2 py-1.5 text-xs" key={c.id}>
                    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
                      <WorkshopStatus tone={c.ok ? 'success' : 'warning'}>{c.ok ? 'ok' : 'todo'}</WorkshopStatus>
                      <span className="truncate">{c.title}</span>
                      <span className="font-mono text-[0.65rem] tabular-nums text-muted-foreground">{c.score.toFixed(2)}</span>
                    </div>
                    {!c.ok && hint ? (
                      <div className="mt-1 flex flex-wrap items-center gap-1 pl-6 text-[0.65rem] text-muted-foreground">
                        <WorkshopStatus tone="info">{hint.panel}</WorkshopStatus>
                        <span>{hint.action}</span>
                        {c.detail ? <span className="truncate opacity-70">- {c.detail}</span> : null}
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        ) : <WorkshopEmpty>点上方按钮跑一次 Benchmark；score ≥ 0.85 表示已就绪。</WorkshopEmpty>}
      </WorkshopPanel>
    </div>
  )
}

function formatTime(iso: string): string {
  const t = new Date(iso).getTime()

  if (Number.isNaN(t)) {return iso}

  return new Date(t).toLocaleString()
}
