'use strict'

const fs = require('node:fs')
const path = require('node:path')

const DENIED_PATHS = [
  /(^|\/)karna-data(\/|$)/i,
  /(^|\/)tests?(\/|$)/i,
  /\.test\.[cm]?[jt]sx?$/i,
  /(^|\/)(?:test-results|\.playwright-cli|\.venv|__pycache__|\.pytest_cache|backups?|temp)(\/|$)/i,
  /(?:^|\/)(?:dev-renderer|build-todo).+\.log$/i,
  /\.patch$/i
]

const DENIED_TEXT = [
  /D:\\Agent/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:sk-[A-Za-z0-9]{32,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/
]

function walk(root) {
  const files = []
  const pending = [root]
  while (pending.length) {
    const current = pending.pop()
    if (!fs.existsSync(current)) continue
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(full)
      else if (entry.isFile()) files.push(full)
    }
  }
  return files
}

function verifyUnpacked(appOutDir) {
  const resources = path.join(appOutDir, 'resources')
  const problems = []
  for (const file of walk(resources)) {
    const rel = path.relative(resources, file).replace(/\\/g, '/')
    if (DENIED_PATHS.some(pattern => pattern.test(rel))) problems.push(`denied path: ${rel}`)
    const stat = fs.statSync(file)
    if (stat.size <= 4 * 1024 * 1024 && /\.(?:json|ya?ml|md|txt|js|cjs|mjs|html|css)$/i.test(file)) {
      const text = fs.readFileSync(file, 'utf8')
      if (DENIED_TEXT.some(pattern => pattern.test(text))) problems.push(`sensitive text: ${rel}`)
    }
  }

  const required = ['builtin-skills', 'builtin-plugins', 'builtin-workflows', 'release-manifest.json']
  for (const name of required) {
    if (!fs.existsSync(path.join(resources, name))) problems.push(`missing required resource: ${name}`)
  }
  const workflowManifest = path.join(resources, 'builtin-workflows', 'manifest.json')
  if (fs.existsSync(workflowManifest)) {
    const parsed = JSON.parse(fs.readFileSync(workflowManifest, 'utf8'))
    if (parsed.workflows?.length !== 2) problems.push(`expected exactly 2 built-in workflows, got ${parsed.workflows?.length ?? 0}`)
  }
  if (problems.length) throw new Error(`Release privacy verification failed:\n${problems.map(row => `  - ${row}`).join('\n')}`)
  console.log(`[release-verify] clean resources inventory (${walk(resources).length} files)`)
  return true
}

if (require.main === module) verifyUnpacked(process.argv[2])

module.exports = { DENIED_PATHS, DENIED_TEXT, verifyUnpacked }
