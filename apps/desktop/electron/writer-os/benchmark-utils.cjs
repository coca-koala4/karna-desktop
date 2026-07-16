'use strict'

const BENCHMARK_MATURITY_TARGETS = {
  documents_indexed: { target: '10+ document nodes', action: 'Import more manuscript chapters, notes, or research files, or click Run action to create local seed material.' },
  story_bible: { target: 'characters, chapters, locations, rules, foreshadows, and timeline populated', action: 'Run Story Bible extraction after importing representative material.' },
  creative_search: { target: '20+ searchable creative items', action: 'Run creative search after documents/wiki/state are populated.' },
  living_wiki: { target: '8+ confirmed or pending wiki items', action: 'Generate and confirm Living Wiki candidates from Story Bible and workflow outputs.' },
  knowledge_graph: { target: '20+ graph nodes with typed edges', action: 'Rebuild graph after Story Bible, Wiki, and State have enough entities.' },
  narrative_state: { target: '10+ character/thread state rows', action: 'Rebuild narrative state after characters, foreshadows, and workflow outputs exist.' },
  creative_memory: { target: '20+ durable memories', action: 'Rebuild Creative Memory after Wiki, State, and Critic Council runs.' },
  artifact_registry: { target: '8+ indexed artifacts', action: 'Run workflows, exports, safety, and critic checks, then sync artifacts.' },
  data_model: { target: '12+ model entities inspected', action: 'Run Data Model inspector after all project stores exist.' },
  rag_index: { target: '20+ RAG chunks', action: 'Add/import more source text or click Run action to create seed material, then rebuild RAG.' },
  vector_store: { target: '20+ current vectors', action: 'Create/import enough chunks, then build the vector store.' },
  rag_context_pack: { target: '3+ context packs with citations', action: 'Assemble context packs from Knowledge panel or run closed-loop verification.' },
  capability_packs: { target: '6+ capability packs including Soul packs when available', action: 'Sync capability packs and distill Soul profiles if needed.' },
  canon_review_queue: { target: '<=10 unresolved canon review items', action: 'Accept or reject Draft Guard / Workflow canon updates in World panel, or run Canon Review action.' },
  draft_guard_input_gate: { target: 'Workflow input preflight has Draft Guard citations', action: 'Run an agent workflow with Draft Guard enabled.' },
  draft_guard_output_gate: { target: 'Agent outputs pass Draft Guard and write pending canon/state review items', action: 'Run a workflow with output Draft Guard enabled, then review generated canon changes.' },
  soul_method_workflow: { target: 'Workflow can explicitly use a selected Soul Method Pack with safe-transfer audit fields', action: 'Sync capability packs, select a Soul Method Pack in Agents panel, and run a guarded workflow.' }
}

const benchmarkCheck = (id, title, ok, detail = '', score = 0) => ({ id, title, ok: Boolean(ok), score: Number(score || (ok ? 1 : 0)), detail })
const maturityGapsForChecks = checks => checks
  .filter(row => Number(row.score || 0) < 0.85)
  .map(row => ({ id: row.id, title: row.title, score: Number(row.score || 0), detail: row.detail || '', target: BENCHMARK_MATURITY_TARGETS[row.id]?.target || 'Increase project data depth and rerun the module.', action: BENCHMARK_MATURITY_TARGETS[row.id]?.action || 'Run the related Writer OS guide step, then rerun Benchmark.' }))
  .sort((a, b) => a.score - b.score)

const statusToneForScore = score => score >= 0.85 ? 'green' : score >= 0.55 ? 'yellow' : 'red'
const commandCenterModuleRepairPlan = moduleId => ({
  foundation: ['schema'],
  documents: ['seed_documents', 'rag', 'vector_store'],
  rag: ['rag', 'vector_store'],
  graph_state: ['knowledge_graph', 'narrative_state'],
  canon_queue: ['canon_review'],
  draft_guard: ['closed_loop'],
  workflow: ['workflow', 'writing_loop'],
  safety: ['safety'],
  benchmark: ['benchmark']
}[moduleId] || [])

module.exports = { BENCHMARK_MATURITY_TARGETS, benchmarkCheck, maturityGapsForChecks, statusToneForScore, commandCenterModuleRepairPlan }
