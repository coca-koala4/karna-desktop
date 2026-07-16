# Local artifact policy

The following paths are runtime or test output and must never be committed:

| Path | Owner | Retention | Cleanup |
| --- | --- | --- | --- |
| `karna-data/` | local Karna runtime | keep only local working data | never removed wholesale by the cleanup command; export first, then delete manually |
| `output/` | screenshots and ad-hoc reports | per investigation | `npm run --prefix apps/desktop clean:local-artifacts -- --apply` |
| `.playwright-cli/` | browser automation snapshots | per run | same command |
| `apps/desktop/test-results/` | route screenshots and Playwright output | per run | same command |
| `karna-data/logs/` | local diagnostics | 30 days by default | dry-run first; use `--apply --days=30` |
| `writer-os-delivery-*.zip` | Writer project delivery packages | user-controlled | preserved by default; audit/remove old copies only with `--include-project-artifacts` after exporting them |
| `apps/desktop/_restore_backup_*/` | emergency restore snapshots | until restoration is verified | delete manually after verification |

The cleanup command is a dry run unless `--apply` is supplied. Project files
and delivery ZIPs are deliberately outside its default deletion scope.

Release artifacts belong only in the CI release upload. A local release build is
blocked when the working tree contains non-generated changes. Exported Writer
projects should be copied outside this repository before cleanup.
