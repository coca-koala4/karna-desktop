'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execSync } = require('node:child_process')

const appRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(appRoot, '..', '..')
const out = path.join(appRoot, 'build', 'release-manifest.json')
const pkgFile = path.join(appRoot, 'package.json')
const stampFile = path.join(appRoot, 'build', 'install-stamp.json')

const buildLog = []
const stepTimings = []

function logStep(step, message) {
  const entry = { step, message, ts: new Date().toISOString() }
  buildLog.push(entry)
  console.log(`[release-manifest] [${step}] ${message}`)
}

function logWarn(step, message) {
  const entry = { step, message, ts: new Date().toISOString(), level: 'warn' }
  buildLog.push(entry)
  console.warn(`[release-manifest] [${step}] WARNING: ${message}`)
}

function logError(step, message) {
  const entry = { step, message, ts: new Date().toISOString(), level: 'error' }
  buildLog.push(entry)
  console.error(`[release-manifest] [${step}] ERROR: ${message}`)
}

function timeStep(step, fn) {
  const start = Date.now()
  try {
    const result = fn()
    stepTimings.push({ step, durationMs: Date.now() - start, ok: true })
    return result
  } catch (err) {
    stepTimings.push({ step, durationMs: Date.now() - start, ok: false, error: err.message })
    throw err
  }
}

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function inventory(relativeRoot, predicate = () => true) {
  const root = path.join(repoRoot, relativeRoot)
  const rows = []
  const pending = [root]
  while (pending.length) {
    const current = pending.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(full)
      else if (entry.isFile() && predicate(full)) {
        const stat = fs.statSync(full)
        rows.push({
          path: path.relative(root, full).replace(/\\/g, '/'),
          sha256: hashFile(full),
          size: stat.size,
          modified_at: stat.mtime.toISOString()
        })
      }
    }
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path))
}

function computeTreeHash(items) {
  const hasher = crypto.createHash('sha256')
  for (const item of items) {
    hasher.update(item.path + '\0')
    hasher.update(item.sha256 + '\0')
    hasher.update(String(item.size) + '\0')
  }
  return hasher.digest('hex')
}

function getDesktopVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'))
    return pkg.version || null
  } catch {
    return null
  }
}

function getStampInfo() {
  try {
    if (!fs.existsSync(stampFile)) return null
    return JSON.parse(fs.readFileSync(stampFile, 'utf8'))
  } catch {
    return null
  }
}

function getCurrentPlatform() {
  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    hostname: os.hostname()
  }
}

function validateVersion(version) {
  const semverRegex = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)/
  return semverRegex.test(String(version || ''))
}

function main() {
  const startedAt = new Date()
  logStep('init', `manifest generation started at ${startedAt.toISOString()}`)
  logStep('platform', `platform=${process.platform} arch=${process.arch} node=${process.version}`)

  const desktopVersion = timeStep('read-pkg', () => getDesktopVersion())
  logStep('version', `desktopVersion=${desktopVersion || 'unknown'}`)

  if (desktopVersion && !validateVersion(desktopVersion)) {
    logWarn('version', `version "${desktopVersion}" does not look like valid semver`)
  }

  const stamp = timeStep('read-stamp', () => getStampInfo())
  if (stamp) {
    logStep('stamp', `build stamp found: commit=${stamp.commit?.slice?.(0, 12) || 'unknown'} version=${stamp.desktopVersion || 'unknown'}`)
    if (stamp.desktopVersion && desktopVersion && stamp.desktopVersion !== desktopVersion) {
      logWarn('stamp', `stamp version (${stamp.desktopVersion}) != package version (${desktopVersion})`)
    }
  } else {
    logWarn('stamp', 'no build stamp found (run write-build-stamp first)')
  }

  const workflows = timeStep('load-workflows', () =>
    JSON.parse(fs.readFileSync(path.join(repoRoot, 'karna-builtin', 'workflows', 'manifest.json'), 'utf8'))
  )
  logStep('workflows', `loaded ${workflows.workflows?.length || 0} workflows`)

  const skills = timeStep('inventory-skills', () => inventory('karna-builtin/skills'))
  logStep('skills', `${skills.length} skill files inventoried`)

  const plugins = timeStep('inventory-plugins', () => inventory('karna-builtin/plugins'))
  logStep('plugins', `${plugins.length} plugin files inventoried`)

  const skillsTreeHash = computeTreeHash(skills)
  const pluginsTreeHash = computeTreeHash(plugins)
  const workflowsHash = crypto.createHash('sha256').update(JSON.stringify(workflows.workflows || [])).digest('hex')

  const platform = getCurrentPlatform()

  const endedAt = new Date()
  const durationMs = endedAt.getTime() - startedAt.getTime()

  const manifest = {
    schema_version: 2,
    generated_at: endedAt.toISOString(),
    generated_by: {
      platform: platform.platform,
      arch: platform.arch,
      nodeVersion: platform.nodeVersion,
      hostname: platform.hostname
    },
    product: 'Karna',
    desktop_version: desktopVersion,
    build_stamp: stamp ? {
      commit: stamp.commit,
      branch: stamp.branch,
      builtAt: stamp.builtAt,
      versionFingerprint: stamp.versionFingerprint,
      dirty: stamp.dirty
    } : null,
    mcp: [{ id: 'karna-writer', transport: 'builtin' }],
    workflows: {
      items: workflows.workflows || [],
      count: (workflows.workflows || []).length,
      sha256: workflowsHash
    },
    skills: {
      items: skills,
      count: skills.length,
      total_size: skills.reduce((sum, s) => sum + s.size, 0),
      tree_sha256: skillsTreeHash
    },
    plugins: {
      items: plugins,
      count: plugins.length,
      total_size: plugins.reduce((sum, p) => sum + p.size, 0),
      tree_sha256: pluginsTreeHash
    },
    integrity: {
      algorithms: ['sha256'],
      manifest_hash: null,
      version_valid: validateVersion(desktopVersion)
    },
    build_timing: {
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_ms: durationMs,
      steps: stepTimings
    },
    build_log: buildLog
  }

  const manifestJson = JSON.stringify(manifest, null, 2)
  const manifestHash = crypto.createHash('sha256').update(manifestJson).digest('hex')
  manifest.integrity.manifest_hash = manifestHash

  const finalJson = JSON.stringify(manifest, null, 2) + '\n'
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, finalJson, 'utf8')

  logStep('write',
    `wrote ${path.relative(repoRoot, out)}: ` +
    `${skills.length} skills, ${plugins.length} plugins, ${workflows.workflows?.length || 0} workflows ` +
    `in ${durationMs}ms`
  )
  logStep('integrity', `manifest sha256: ${manifestHash.slice(0, 24)}...`)
}

main()
