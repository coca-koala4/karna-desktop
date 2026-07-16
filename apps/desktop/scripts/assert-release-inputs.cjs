'use strict'

// Packaging must be reproducible.  Generated build directories are allowed;
// every other staged, unstaged, or untracked file means the release command
// must stop and be run from a committed checkout/CI instead.
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const { unexpectedReleaseInputs } = require('./release-inputs.cjs')

const repoRoot = path.resolve(__dirname, '..', '..', '..')
let status = ''
try {
  status = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
} catch (error) {
  console.error('[release-guard] cannot inspect git status:', error.message)
  process.exit(1)
}

const unexpected = unexpectedReleaseInputs(status)
if (unexpected.length) {
  console.error('[release-guard] refusing to package a dirty tree:')
  unexpected.forEach(file => console.error(`  - ${file}`))
  console.error('Commit/stash changes or produce the release in CI.')
  process.exit(1)
}

console.log('[release-guard] working tree contains only generated allowlisted files')
