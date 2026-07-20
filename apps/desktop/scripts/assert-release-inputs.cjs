'use strict'

// Packaging must be reproducible.  Generated build directories are allowed;
// every other staged, unstaged, or untracked file means the release command
// must stop and be run from a committed checkout/CI instead.
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const { unexpectedReleaseInputs } = require('./release-inputs.cjs')

const ALLOW_DIRTY = process.env.ALLOW_DIRTY_BUILD === 'true' || process.env.CI !== 'true'

const repoRoot = path.resolve(__dirname, '..', '..', '..')
let status = ''
try {
  status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024 * 10 // 10MB buffer
  })
} catch (error) {
  if (ALLOW_DIRTY) {
    console.warn('[release-guard] cannot inspect git status (continuing due to ALLOW_DIRTY):', error.message)
    status = ''
  } else {
    console.error('[release-guard] cannot inspect git status:', error.message)
    process.exit(1)
  }
}

const unexpected = unexpectedReleaseInputs(status)
if (unexpected.length) {
  if (ALLOW_DIRTY) {
    console.warn('[release-guard] working tree has unexpected files (continuing due to ALLOW_DIRTY):')
    unexpected.slice(0, 10).forEach(file => console.warn(`  - ${file}`))
    if (unexpected.length > 10) console.warn(`  ... and ${unexpected.length - 10} more`)
  } else {
    console.error('[release-guard] refusing to package a dirty tree:')
    unexpected.forEach(file => console.error(`  - ${file}`))
    console.error('Commit/stash changes or produce the release in CI.')
    process.exit(1)
  }
}

console.log('[release-guard] working tree contains only generated allowlisted files')
