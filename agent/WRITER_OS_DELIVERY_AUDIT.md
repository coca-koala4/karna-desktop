# Writer OS / Karna-Hermes Delivery Audit

Date: 2026-07-07
Scope: Karna-Hermes only. Legacy Muse and DeerFlow are out of scope.

## Current delivery state

Writer OS is implemented as a local-first writer operating system inside `apps/desktop`.
The implementation now covers the whitepaper-facing modules:

- Product shell and project schema
- Document Engine and Creative Search
- Story Bible
- Living Wiki
- Knowledge Graph
- Narrative State Engine
- Creative Memory
- Artifact Registry
- RAG Pipeline
- durable local Vector DB
- Agent Workflow and workflow writeback
- Skill / Capability Packs
- Soul Workshop method-pack bridge
- Safety and copyright checks
- Critic Council
- Command Center
- Benchmark and Acceptance Audit
- Delivery Package and Delivery Verify

## Backend module split

The large desktop adapter remains the API router and integration bridge, while Writer OS logic has been split into focused modules:

- `apps/desktop/electron/writer-os/vector-utils.cjs`
- `apps/desktop/electron/writer-os/rag.cjs`
- `apps/desktop/electron/writer-os/delivery.cjs`
- `apps/desktop/electron/writer-os/benchmark-utils.cjs`
- `apps/desktop/electron/writer-os/workflow-utils.cjs`
- `apps/desktop/electron/writer-os/workflow-store.cjs`
- `apps/desktop/electron/writer-os/narrative-utils.cjs`
- `apps/desktop/electron/writer-os/data-model-utils.cjs`
- `apps/desktop/electron/writer-os/guide-utils.cjs`
- `apps/desktop/electron/writer-os/benchmark-suite.cjs`
- `apps/desktop/electron/writer-os/command-center.cjs`
- `apps/desktop/electron/writer-os/safety-utils.cjs`
- `apps/desktop/electron/writer-os/safety-council.cjs`
- `apps/desktop/electron/writer-os/memory-artifacts.cjs`
- `apps/desktop/electron/writer-os/document-search.cjs`

`apps/desktop/electron/karna-adapter.cjs` is now about 6024 lines and acts mainly as adapter/router/glue.

## Verified commands

Run from `apps/desktop`:

```powershell
node -c electron\karna-adapter.cjs
npm run typecheck
npm run build
npm run test:writer-os:all
```

Latest Writer OS regression result:

- Vector DB corruption detection: passed
- Delivery package tamper detection: passed
- RAG retrieval: `local-vector+lexical`
- Vector DB verification: passed
- Writer Loop: passed
- Benchmark: `25/25`
- Acceptance Audit: `release_candidate`
- Command Center: `green`

## Encoding check

The final encoding scan checked these files for replacement characters, question-mark mojibake triplets, and control-Z artifacts:

- `apps/desktop/electron/karna-adapter.cjs`
- all `apps/desktop/electron/writer-os/*.cjs`
- `apps/desktop/src/app/karna-workshop/soul.tsx`
- `README.md`

Result: no detected mojibake markers in the checked files.

## UI / Electron smoke check

A real Electron shell smoke test has been added and verified:

```powershell
npm run test:writer-os:electron
```

Latest Electron result:

- Window title: `Karna`
- Desktop IPC bridge: available through `window.karnaDesktop.api`
- Writer project API: reachable through Electron IPC
- RAG mode: `local-vector+lexical`
- Vector DB verification through IPC: passed
- Acceptance Audit through IPC: `release_candidate`
- Delivery verification through IPC: passed
- UI routes rendered: `/karna/writer`, `/karna/soul`, `/karna`

This replaces the earlier browser-only Vite preview smoke. The preview was useful for shell rendering, but it cannot verify Electron-only IPC and therefore is no longer treated as the main UI proof.

## Remaining recommended work

The core Writer OS backend, local Vector DB, regression gates, and Electron IPC/UI smoke are stable. Further work should focus on release polish rather than more line-count-only extraction:

1. Manual product walkthrough of deeper Writer panel button flows on real user projects.
2. End-user copy polish for Chinese writing workflows.
3. Optional packaging/release cleanup of generated smoke data.
4. Optional dynamic chunk splitting for the large Vite frontend bundle warning.
5. Optional deeper e2e tests for individual UI button flows beyond the current Electron route + IPC smoke.
