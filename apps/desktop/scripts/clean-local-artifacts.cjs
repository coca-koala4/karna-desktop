'use strict'

// Prints the local-only artifacts that can be removed.  The default is a dry
// run so no Writer project data disappears because a developer copied a command
// from documentation.  Pass --apply only after exporting anything worth keeping.
const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..', '..', '..')
const targets = [
  'output',
  '.playwright-cli',
  'apps/desktop/.playwright-cli',
  'apps/desktop/test-results'
].map(relative => ({ relative, absolute: path.join(repoRoot, relative) }))

const apply = process.argv.includes('--apply')
const includeProjectArtifacts = process.argv.includes('--include-project-artifacts')
const daysArg = process.argv.find(value => value.startsWith('--days='))
const retentionDays = Math.max(1, Number(daysArg?.slice('--days='.length) || 30) || 30)
const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
let found = 0
for (const target of targets) {
  if (!fs.existsSync(target.absolute)) continue
  found++
  if (apply) {
    fs.rmSync(target.absolute, { recursive: true, force: true })
    console.log(`removed ${target.relative}`)
  } else {
    console.log(`would remove ${target.relative}`)
  }
}

const staleFiles = []
const collectStale = (root, predicate) => {
  if (!fs.existsSync(root)) return
  const pending = [root]
  while (pending.length) {
    const current = pending.pop()
    let entries = []
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(full)
      else if (entry.isFile() && predicate(full, entry.name)) {
        try {
          if (fs.statSync(full).mtimeMs < cutoff) staleFiles.push(full)
        } catch {
          // A concurrently removed file needs no cleanup.
        }
      }
    }
  }
}

collectStale(path.join(repoRoot, 'karna-data', 'logs'), () => true)
if (includeProjectArtifacts) {
  collectStale(
    path.join(repoRoot, 'karna-data', 'writer-projects'),
    (_full, name) => /^writer-os-delivery-.*\.zip$/i.test(name)
  )
}

for (const file of staleFiles) {
  found++
  const relative = path.relative(repoRoot, file)
  if (apply) {
    try {
      fs.rmSync(file, { force: true })
      console.log(`removed stale file ${relative}`)
    } catch (error) {
      console.error(`failed to remove ${relative}: ${error.message}`)
      process.exitCode = 1
    }
  } else {
    console.log(`would remove stale file ${relative}`)
  }
}

if (!apply) {
  console.log(found ? `Dry run only (${retentionDays}-day retention). Re-run with --apply to remove these artifacts.` : 'No removable local artifacts found.')
  if (!includeProjectArtifacts) console.log('Writer delivery ZIPs are preserved. Add --include-project-artifacts to audit them explicitly.')
}
