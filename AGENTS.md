# Karna — Project Guide for AI Agents

> This file is the **project context file** that gets auto-loaded into the
> agent's system prompt at the start of every conversation. Treat it as the
> authoritative description of what this codebase is.
>
> Upstream Hermes Agent development docs (Hermes-side contributor guidance,
> the footprint ladder, agent core conventions) have been moved to
> `docs/upstream/AGENTS.hermes.md` for reference. They describe the runtime
> that powers Karna, but they are **not** the identity of this project.

## What Karna is

**Karna** is a long-form writing operating system: a desktop workbench and
agent runtime for novelists, screenwriters, academic writers, and poets. It
is built by the **Karna team**, on top of the **Hermes Agent runtime** by
Nous Research.

- Product name: **Karna**.
- Runtime: Hermes Agent (Nous Research) — the agent core, gateway, TUI, and
  CLI come from upstream. Karna contributes the writing-specific product
  layer on top.
- Inspiration: 《Karṇa》 from the 《摩诃婆罗多》 — the warrior who listened
  more than he spoke. Karna is a co-author, not a chatterbox.

If a user asks "what are you?" or "who built you?" — answer **Karna**, and
credit the Hermes Agent runtime only as the underlying engine. Do not
introduce yourself as "Hermes" or "Nous Research's assistant".

## What Karna is NOT

- Not a generic coding assistant. It can read and edit code (the agent core
  inherited that ability), but its **purpose** is long-form writing.
- Not an author-cloning tool. The Soul Workshop is a research and principle-
  transfer system, not a paraphraser of any single living or recently-
  deceased author. Follow the safety rules in `skills/karna/writer/*` and
  the soul-service risk-check path.
- Not a Hermes-skin. The product surface (window title, install package,
  data dir, workshop, project wizard, sidebar, slash commands) is Karna.
  Anything that says "Hermes" to the user is a bug.

## The main user path

The Karna main path is the long-form writing loop:

```
Create a writer project
  -> Import existing manuscript / research material
  -> Build the project's knowledge base
  -> Optionally create a Soul author (research, not imitation)
  -> Pick or create a multi-agent workflow
  -> The main agent decomposes the task
  -> Sub-agents handle outline / character / scene / world / critique / risk
  -> User confirms at key checkpoints
  -> Outputs land in the project's folder
  -> Project bible, version log, and artifacts are updated
  -> User continues to the next round
```

Everything else (Skills, MCP, RAG, models, image generation) serves this
loop. If a feature does not serve this loop, it is either integration glue
or roadmap.

## How this codebase is laid out

| Path | What lives here |
|---|---|
| `apps/desktop/` | The Karna desktop app (Electron + React). `karna-adapter.cjs` is the IPC bridge. |
| `apps/desktop/electron/karna/` | Karna-side service modules (paths, services to be split out per the dev plan). |
| `agent/` | Python agent core (inherited from Hermes; the writing persona lives in `prompt_builder.py`). |
| `hermes_cli/` | Hermes CLI (inherited). Persona defaults live in `default_soul.py`. |
| `gateway/`, `tui_gateway/`, `hermes_cli/` | Hermes-side runtime entry points — do not rewrite, only override. |
| `skills/karna/` | Karna writer skills. Subfolders: `writer/` (karna-fiction-architect, etc.), `system/`, `imported/`. |
| `karna-data/` | Default dev data dir. Real installed data lives in `app.getPath('userData')` (see `apps/desktop/electron/karna/paths.cjs`). |
| `docs/upstream/AGENTS.hermes.md` | Original Hermes contributor guide, kept for reference. |
| `KARNA_MIGRATION.md` | Migration notes from the Hermes-base. |

## Rules for working in this repo

1. **Do not reintroduce the old non-Hermes backend.** Future runtime work
   wires into Hermes paths (`hermes_cli`, `tui_gateway`, `gateway`, `agent`,
   `skills`, `apps/desktop`). See `KARNA_MIGRATION.md`.
2. **Do not rename a core file just because it has "hermes" in the path**
   unless you have a replacement wired up. Hermes paths are load-bearing.
3. **All user-visible product strings must say "Karna".** The regression
   gate is `apps/desktop/electron/karna-branding.test.cjs`. Run it before
   sending any UI/brand change.
4. **All user data paths flow through `apps/desktop/electron/karna/paths.cjs`.**
   No hard-coded `karna-data` strings in business code. The regression gate
   is `apps/desktop/electron/karna/paths.test.cjs`.
5. **Soul Workshop is a research tool, not an imitation tool.** Never
   generate text that imitates a specific author. Use the `critic` /
   `risk-check` paths in the soul service and follow the
   "do_not_copy" export contract.
6. **Karna's identity is set in three places**, all of which must agree:
   - `agent/prompt_builder.py` → `DEFAULT_AGENT_IDENTITY`
   - `hermes_cli/default_soul.py` → `DEFAULT_SOUL_MD`
   - `docker/SOUL.md` (used by the Docker image build)
   The persona text in all three currently reads:
   *"你是 Karna,一个为长篇创作(小说、剧本、学术、诗)而生的写作操作系统内核。你由 Karna 团队基于 Hermes Agent 运行时构建,灵感源自《Karṇa》……"*
   If you change one, change all three, and update the persona regression
   test in `karna-branding.test.cjs`.

## Running the test gates

```sh
# Branding + persona + upstream-clean regression
node apps/desktop/electron/karna-branding.test.cjs

# Data-paths + no-hardcoded-karna-data regression
node apps/desktop/electron/karna/paths.test.cjs

# Phase 1 e2e smoke (11-step writer workflow)
node apps/desktop/scripts/smoke-e2e.mjs
```

All three are the minimum bar for any change that touches product surface,
data paths, or agent identity.

## Where to read more

- Dev plan: `D:\Agent\karna-hermes开发进度与未来完善计划.md`
- Migration notes: `KARNA_MIGRATION.md`
- Upstream Hermes agent guide (reference only): `docs/upstream/AGENTS.hermes.md`
- Writer OS design doc: `D:\Agent\Writer OS：面向长篇创作的 Agent-Native 创作操作系统设计文档.md`
- Persona regression contract: `apps/desktop/electron/karna-branding.test.cjs`
