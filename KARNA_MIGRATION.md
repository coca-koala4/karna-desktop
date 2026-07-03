# Karna Hermes Migration Notes

Status: Hermes-based Karna migration in progress on 2026-07-02.

## Source of truth

- Upstream base: `D:\Agent\upstream\hermes-agent`
- New project: `D:\Agent\projects\karna-hermes`
- Product name: Karna
- Runtime base: NousResearch Hermes Agent

## What was deliberately dropped

- The previous non-Hermes backend/runtime path.
- Earlier experimental gateway config patches that belonged to the discarded backend.
- Old mixed-workspace assumptions from the previous desktop prototype.
- Temporary desktop backup files after the Karna/Hermes files compiled.

## What was preserved and renamed

- Legacy desktop extension protocol adapter -> `apps\desktop\electron\karna-adapter.cjs`.
- Karna desktop UI overrides -> `karna-custom\desktop-overrides\...`.
- Writer skills -> `skills\karna\writer\karna-*`.
- System skills -> `skills\karna\system`.
- External custom skills -> `skills\karna\imported`.

## Important rule

Do not reintroduce the discarded backend/runtime. Future agent runtime changes must wire into Hermes paths such as `hermes_cli`, `tui_gateway`, `gateway`, `agent`, `skills`, and `apps/desktop`.

## Integrated so far

1. Karna desktop package branding.
2. `karna-adapter.cjs` as a fallback for explicit Karna extension APIs only.
3. `window.karnaDesktop` preload alias backed by the Hermes IPC bridge.
4. Karna writer/project data rooted under this repo's `karna-data` folder.
5. Karna chat/plan/goal mode controls in the current Hermes composer.
6. Karna project wizard entry in the current Hermes sidebar.
7. Karna Workshop route/sidebar/command palette entry.
8. Karna Workshop operations for writer projects, knowledge import/search/reindex, workflow create/edit/run/delete, and Soul author create/export/delete/fusion preview.
9. Karna skills scanned from `skills/karna` rather than old desktop builtin folders.

## Next integration work

1. Replace the JSON workflow editor with a visual canvas once the Hermes desktop UI shell is stable.
2. Add live browser/UI verification for the Workshop route after launching the desktop dev server.
3. Continue moving only selected custom UI from `karna-custom/desktop-overrides`; do not overwrite current Hermes desktop files wholesale.
