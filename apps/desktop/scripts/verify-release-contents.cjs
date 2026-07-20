'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { listPackage, extractFile } = require('@electron/asar')

const DENIED_PATHS = [
  /(^|\/)karna-data(\/|$)/i,
  /(^|\/)tests?(\/|$)/i,
  /(^|\/)demos?(\/|$)/i,
  /(^|\/)examples?(\/|$)/i,
  /(^|\/)docs?(\/|$)/i,
  /(^|\/)website(\/|$)/i,
  /(^|\/)sessions?(\/|$)/i,
  /(^|\/)projects?(\/|$)/i,
  /(^|\/)logs?(\/|$)/i,
  /\.test\.[cm]?[jt]sx?$/i,
  /(^|\/)(?:test-results|\.playwright-cli|\.venv|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|backups?|temp)(\/|$)/i,
  /(?:^|\/)(?:dev-renderer|build-todo).+\.log$/i,
  /\.patch$/i,
  /\.pyc$/i,
  /\.pyo$/i,
  /\.map$/i,
  /(^|\/)(?:hermes-frames|hermes-sprite\.png|hermes\.png|nous-girl\.jpg)(\/|$)/i
]

const DENIED_TEXT = [
  /D:\\Agent/i,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:sk-[A-Za-z0-9]{32,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/,
  /logo\.clearbit\.com/i,
  /NousResearch\/hermes-agent/i
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
  const isDevBuild = process.env.ALLOW_DIRTY_BUILD === 'true' || process.env.CI === 'false'
  for (const file of walk(resources)) {
    const rel = path.relative(resources, file).replace(/\\/g, '/')
    const isInVenv = rel.includes('/venv/')
    const isInMarketplace = rel.startsWith('skill-marketplace/')
    if (!isInVenv && !isInMarketplace && DENIED_PATHS.some(pattern => pattern.test(rel))) problems.push(`denied path: ${rel}`)
    const stat = fs.statSync(file)
    if (stat.size <= 4 * 1024 * 1024 && /\.(?:json|ya?ml|md|txt|js|cjs|mjs|html|css)$/i.test(file)) {
      const text = fs.readFileSync(file, 'utf8')
      if (DENIED_TEXT.some(pattern => pattern.test(text))) problems.push(`sensitive text: ${rel}`)
    }
  }

  const required = ['builtin-skills', 'builtin-plugins', 'builtin-workflows', 'offline-runtime', 'release-manifest.json', 'icon.ico']
  for (const name of required) {
    if (!fs.existsSync(path.join(resources, name))) problems.push(`missing required resource: ${name}`)
  }
  const runtimeManifest = path.join(resources, 'offline-runtime', 'runtime-manifest.json')
  if (fs.existsSync(runtimeManifest)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(runtimeManifest, 'utf8'))
      if (parsed.schemaVersion !== 1) problems.push(`offline runtime manifest has invalid schemaVersion: ${parsed.schemaVersion}`)
      if (!parsed.desktopVersion) problems.push('offline runtime manifest missing desktopVersion')
      if (!Array.isArray(parsed.files) || parsed.files.length === 0) problems.push('offline runtime manifest has empty or invalid files list')
    } catch (err) {
      problems.push(`offline runtime manifest is invalid: ${err.message}`)
    }
  }
  const runtimeRoot = path.join(resources, 'offline-runtime', 'karna-runtime')
  if (!fs.existsSync(runtimeRoot)) {
    const legacyRoot = path.join(resources, 'offline-runtime', 'hermes-agent')
    if (!fs.existsSync(legacyRoot)) problems.push('offline runtime missing karna-runtime directory')
  }
  const workflowManifest = path.join(resources, 'builtin-workflows', 'manifest.json')
  if (fs.existsSync(workflowManifest)) {
    const parsed = JSON.parse(fs.readFileSync(workflowManifest, 'utf8'))
    if (parsed.workflows?.length !== 2) problems.push(`expected exactly 2 built-in workflows, got ${parsed.workflows?.length ?? 0}`)
  }

  // Validate the static CommonJS closure inside app.asar. Electron-builder's
  // explicit files allowlist can otherwise omit a relative dependency while
  // still producing a valid installer, causing a main-process crash only on a
  // clean installed machine.
  const asarPath = path.join(resources, 'app.asar')
  if (fs.existsSync(asarPath)) {
    const archiveEntries = new Map(listPackage(asarPath).map(original => {
      const normalized = original.replace(/^[/\\]+/, '').replace(/\\/g, '/')
      return [normalized, normalized.split('/').join(path.sep)]
    }))
    const entries = new Set(archiveEntries.keys())
    for (const entry of entries) {
      if (DENIED_PATHS.some(pattern => pattern.test(entry))) problems.push(`denied asar path: ${entry}`)
      if (/\.(?:json|ya?ml|md|txt|js|cjs|mjs|html|css|tsx?)$/i.test(entry)) {
        const source = extractFile(asarPath, archiveEntries.get(entry)).toString('utf8')
        if (DENIED_TEXT.some(pattern => pattern.test(source))) problems.push(`sensitive asar text: ${entry}`)
      }
    }
    const candidatesFor = (from, request) => {
      const base = path.posix.normalize(path.posix.join(path.posix.dirname(from), request))
      return [base, `${base}.cjs`, `${base}.js`, `${base}.json`, `${base}/index.cjs`, `${base}/index.js`]
    }
    for (const entry of entries) {
      if (!/^electron\/.+\.cjs$/i.test(entry)) continue
      const source = extractFile(asarPath, archiveEntries.get(entry)).toString('utf8')
      for (const match of source.matchAll(/require\(['"](\.{1,2}\/[^'"]+)['"]\)/g)) {
        if (!candidatesFor(entry, match[1]).some(candidate => entries.has(candidate))) {
          problems.push(`missing packaged require: ${entry} -> ${match[1]}`)
        }
      }
    }
  } else {
    problems.push('missing required resource: app.asar')
  }
  if (problems.length) {
    if (isDevBuild) {
      console.warn(`[release-verify] WARNING: ${problems.length} issues found in dev build (continuing):`)
      for (const row of problems) console.warn(`  - ${row}`)
    } else {
      throw new Error(`Release privacy verification failed:\n${problems.map(row => `  - ${row}`).join('\n')}`)
    }
  }
  console.log(`[release-verify] clean resources inventory (${walk(resources).length} files)`)
  return true
}

if (require.main === module) verifyUnpacked(process.argv[2])

module.exports = { DENIED_PATHS, DENIED_TEXT, verifyUnpacked }
