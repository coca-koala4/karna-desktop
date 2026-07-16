'use strict'

function createWriterSafetyCouncilService(deps = {}) {
  const {
    path,
    ensureWriterProjectMetadata,
    readJsonFile,
    writeJsonFile,
    writerProjectSafetyReportsPath,
    writerProjectCriticCouncilPath,
    readProjectDocuments,
    readSoulStore,
    enrichSoulAuthor,
    writerSafetyUtils,
    appendWriterProjectVersion,
    logWriterProjectCall,
    enrichWriterProject,
    findWriterProject,
    readWriterProjectStoryBible,
    readNarrativeStateStore,
    readKnowledgeGraphStore,
    textHash
  } = deps
  const evidenceForPatterns = deps.evidenceForPatterns || (() => [])

const readWriterProjectSafetyStore = project => {
  ensureWriterProjectMetadata(project)
  return readJsonFile(writerProjectSafetyReportsPath(project), { version: 1, project_id: project.id, reports: [], updated_at: null })
}
const writeWriterProjectSafetyStore = (project, store) => {
  const next = { ...store, version: 1, project_id: project.id, updated_at: new Date().toISOString(), reports: (store.reports || []).slice(0, 100) }
  writeJsonFile(writerProjectSafetyReportsPath(project), next)
  return next
}
const safetyHits = (docs, patterns, limit = 8) => evidenceForPatterns(docs, patterns, limit)
const buildWriterSafetyReport = (project, input = {}) => {
  const docs = String(input.text || '').trim()
    ? [{ rel: 'manual-input', text: String(input.text || ''), chars: String(input.text || '').length, lines: String(input.text || '').split(/\r?\n/).length }]
    : readProjectDocuments(project)
  const soulStore = readSoulStore()
  const soulAuthors = Array.isArray(soulStore.authors) ? soulStore.authors.map(enrichSoulAuthor) : []
  const { risks, joined } = writerSafetyUtils.buildSafetyRisks({ docs, soulAuthors })
  const high = risks.filter(row => row.level === 'high').length
  const medium = risks.filter(row => row.level === 'medium').length
  const report = { id: `safety_${Date.now()}`, version: 1, project_id: project.id, checked_at: new Date().toISOString(), scope: input.text ? 'manual-input' : 'project-documents', summary: { high, medium, total: risks.length, publish_ready: high === 0 }, risks, policy: { no_style_clone: true, no_unlicensed_long_reproduction: true, redact_pii: true, human_review_required: true } }
  const store = readWriterProjectSafetyStore(project)
  const next = writeWriterProjectSafetyStore(project, { ...store, reports: [report, ...(store.reports || [])] })
  writeJsonFile(path.join(project.folder, 'safety', `${report.id}.json`), report)
  appendWriterProjectVersion(project, 'safety-check', `Safety check produced ${risks.length} findings`, { report: report.id, high, medium })
  logWriterProjectCall(project, 'safety-check', { chars: joined.length, sent_scope: input.text ? 'manual-user-text' : 'local-heuristic-project-docs', note: 'Safety/copyright suggestions only; no manuscript changes.' })
  return { ok: true, project: enrichWriterProject(project), report, reports: next.reports, updated_at: next.updated_at }
}
const readWriterProjectSafety = ref => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const store = readWriterProjectSafetyStore(project)
  return { ok: true, project: enrichWriterProject(project), reports: store.reports || [], updated_at: store.updated_at || null }
}
const handleWriterProjectSafety = (ref, body = {}) => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  return buildWriterSafetyReport(project, body)
}

const readCriticCouncilStore = project => {
  ensureWriterProjectMetadata(project)
  return readJsonFile(writerProjectCriticCouncilPath(project), { version: 1, project_id: project.id, reports: [], updated_at: null })
}
const writeCriticCouncilStore = (project, store) => {
  const next = { ...store, version: 1, project_id: project.id, updated_at: new Date().toISOString(), reports: (store.reports || []).slice(0, 80) }
  writeJsonFile(writerProjectCriticCouncilPath(project), next)
  return next
}
const criticCouncilLenses = () => [
  { id: 'editor', name: 'Editor Lens', focus: 'hook, pacing, scene value, reader promise' },
  { id: 'logic', name: 'Logic Lens', focus: 'causality, motivation, timeline, contradiction' },
  { id: 'character', name: 'Character Lens', focus: 'goal, pressure, voice, relationship continuity' },
  { id: 'world', name: 'World Canon Lens', focus: 'rules, locations, constraints, canon drift' },
  { id: 'payoff', name: 'Foreshadow Payoff Lens', focus: 'clue setup, escalation, payoff readiness' },
  { id: 'safety', name: 'Safety Lens', focus: 'copyright, platform risk, privacy, publish readiness' }
]
const criticFinding = (lens, level, title, evidence = [], suggestion = '') => ({ id: `finding_${textHash(`${lens}:${title}:${evidence.join('|')}`).slice(0, 10)}`, lens, level, title, evidence: evidence.filter(Boolean).slice(0, 8), suggestion })
const runCriticCouncil = (project, input = {}) => {
  ensureWriterProjectMetadata(project)
  const manual = String(input.text || '').trim()
  const docs = manual ? [{ rel: 'manual-input', text: manual, chars: manual.length, lines: manual.split(/\r?\n/).length }] : readProjectDocuments(project)
  const joined = docs.map(doc => `\n[${doc.rel}]\n${doc.text}`).join('\n')
  const story = readWriterProjectStoryBible(project.id).story_bible || {}
  const state = readNarrativeStateStore(project)
  const graph = readKnowledgeGraphStore(project)
  const findings = []
  const add = (lens, level, title, evidence, suggestion) => findings.push(criticFinding(lens, level, title, evidence, suggestion))
  if (!docs.length || joined.trim().length < 80) add('editor', 'warning', 'Not enough draft material for editorial review', ['No substantial manuscript text found.'], 'Import or paste a scene/chapter before asking the council for useful critique.')
  if (joined.length > 500 && !/[?？!！。.!]/.test(joined.slice(0, 600))) add('editor', 'medium', 'Opening block may lack clear sentence rhythm', docs.slice(0, 2).map(doc => doc.rel), 'Check whether the opening establishes situation, conflict, and reader promise quickly enough.')
  const dialogueMarks = (joined.match(/[“”"「」]/g) || []).length
  if (joined.length > 1200 && dialogueMarks < 4) add('editor', 'info', 'Low visible dialogue density', [`dialogue marks: ${dialogueMarks}`], 'If the chapter should be dramatic, consider adding dialogue or concrete interaction beats.')
  if (!(story.characters || []).length) add('character', 'warning', 'No character cards in Story Bible', ['bible/story_bible.json characters = 0'], 'Run Story Bible analysis or add explicit Character: markers so character continuity can be reviewed.')
  if ((story.characters || []).length && !(state.characters || []).length) add('character', 'medium', 'Character state has not been rebuilt', [`story characters: ${(story.characters || []).length}`], 'Rebuild Narrative State before major revision so goals, pressure and last-seen evidence are visible.')
  if (!(story.world_rules || []).length) add('world', 'info', 'World rules are thin or missing', ['story_bible.world_rules = 0'], 'Add explicit rules/constraints; weak canon makes later contradiction checks unreliable.')
  if ((graph.nodes || []).length < Math.max(3, (story.characters || []).length)) add('logic', 'info', 'Knowledge graph is thinner than Story Bible', [`graph nodes: ${(graph.nodes || []).length}`], 'Rebuild the graph after Story Bible and Living Wiki updates so relationship evidence is available.')
  const openThreads = (state.threads || []).filter(row => row.type === 'foreshadow' && row.status !== 'resolved')
  if (openThreads.length > 12) add('payoff', 'medium', 'Many unresolved foreshadow threads', openThreads.slice(0, 6).map(row => `${row.evidence || ''}: ${row.title || row.clue || row.id}`), 'Group clues into pay off, escalate, abandon, or intentionally leave open before drafting the ending.')
  if ((story.foreshadows || []).length && !openThreads.length) add('payoff', 'info', 'Foreshadows exist but are not represented in Narrative State', [`story foreshadows: ${(story.foreshadows || []).length}`], 'Rebuild Narrative State so clue tracking becomes reviewable.')
  const safetyReport = buildWriterSafetyReport(project, { text: manual || '' }).report
  if ((safetyReport.summary?.high || 0) > 0) add('safety', 'high', 'Safety check found high risk items', (safetyReport.risks || []).slice(0, 4).map(row => row.title), 'Resolve high-risk copyright, platform, or privacy items before publication.')
  else add('safety', 'info', 'No high-risk safety issue in automatic check', [`safety report: ${safetyReport.id}`], 'Still do human review; the automated council is a preflight check, not legal advice.')
  if (!findings.length) add('editor', 'info', 'Council found no obvious issue', [`Checked ${docs.length} source entries.`], 'Use a human editor or targeted lens for softer taste and market-positioning feedback.')
  const levelRank = { high: 4, medium: 3, warning: 2, info: 1 }
  const grouped = criticCouncilLenses().map(lens => {
    const rows = findings.filter(row => row.lens === lens.id)
    return { ...lens, findings: rows, status: rows.some(row => row.level === 'high') ? 'blocked' : rows.some(row => row.level === 'medium' || row.level === 'warning') ? 'needs_revision' : rows.length ? 'ok_with_notes' : 'clear' }
  })
  const topLevel = findings.reduce((max, row) => Math.max(max, levelRank[row.level] || 1), 0)
  const report = { id: `critic_${Date.now()}`, version: 1, project_id: project.id, checked_at: new Date().toISOString(), scope: manual ? 'manual-input' : 'project-documents', summary: { findings: findings.length, high: findings.filter(row => row.level === 'high').length, medium: findings.filter(row => row.level === 'medium').length, status: topLevel >= 4 ? 'blocked' : topLevel >= 3 ? 'needs_revision' : 'reviewable' }, lenses: grouped, findings, policy: 'critique-only; no manuscript overwrite; author decides changes' }
  const store = readCriticCouncilStore(project)
  const next = writeCriticCouncilStore(project, { ...store, reports: [report, ...(store.reports || [])] })
  writeJsonFile(path.join(project.folder, 'critics', `${report.id}.json`), report)
  appendWriterProjectVersion(project, 'critic-council', `Critic Council produced ${findings.length} findings`, { report: report.id, findings: findings.length })
  logWriterProjectCall(project, 'critic-council', { chars: joined.length, sent_scope: manual ? 'manual-user-text' : 'local-heuristic-project-docs', note: report.policy })
  return { ok: true, project: enrichWriterProject(project), report, reports: next.reports, updated_at: next.updated_at }
}
const readWriterProjectCriticCouncil = ref => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const store = readCriticCouncilStore(project)
  return { ok: true, project: enrichWriterProject(project), reports: store.reports || [], lenses: criticCouncilLenses(), updated_at: store.updated_at || null }
}
const handleWriterProjectCriticCouncil = (ref, body = {}) => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  return runCriticCouncil(project, body)
}


  return {
    readWriterProjectSafetyStore,
    writeWriterProjectSafetyStore,
    safetyHits,
    buildWriterSafetyReport,
    readWriterProjectSafety,
    handleWriterProjectSafety,
    readCriticCouncilStore,
    writeCriticCouncilStore,
    criticCouncilLenses,
    criticFinding,
    runCriticCouncil,
    readWriterProjectCriticCouncil,
    handleWriterProjectCriticCouncil
  }
}

module.exports = { createWriterSafetyCouncilService }
