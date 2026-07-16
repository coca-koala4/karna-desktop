# .plans Directory Migration Status

These plan documents were authored during the Hermes Agent era and reference the original project structure.
They are retained for historical reference but have NOT been fully migrated to the Karna rebrand.

## Status
- **Brand references**: Partially migrated (Karna replaces Hermes in UI and documentation, but environment variables and internal code identifiers remain HERMES_* for backward compatibility)
- **Architecture docs**: See `docs/architecture/desktop-runtime.md` for the current Karna desktop runtime architecture
- **Module structure**: See `apps/desktop/electron/karna/` directory for current modular services (storage, logs, skills, mcp, knowledge, writer-projects, soul, api-routes, analytics, etc.)
- **Plans in this directory** should be considered historical unless explicitly marked as updated for Karna.
- **Plan labels**: `openai-api-server.md` and `streaming-support.md` now carry an explicit historical/upstream banner and must not be treated as current Karna implementation plans.
- **Last audited**: 2026-07-11
