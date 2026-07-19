'use strict'

const fs = require('node:fs')
const path = require('node:path')

// The packaged runtime is replaceable application code. User-owned agent
// state must live under Electron's userData directory so NSIS upgrades and
// reinstalls cannot remove it together with $INSTDIR.
function resolveKarnaAgentDataHome(options = {}) {
  const env = options.env || process.env
  const isPackaged = Boolean(options.isPackaged)
  const userDataPath = options.userDataPath || null
  const userDataOverride = options.userDataOverride || null
  const legacyHome = options.legacyHome || null
  const normalize = options.normalize || (value => path.resolve(String(value)))

  if (env.KARNA_AGENT_DATA_HOME && String(env.KARNA_AGENT_DATA_HOME).trim()) {
    return normalize(env.KARNA_AGENT_DATA_HOME)
  }
  if (userDataOverride) return path.join(path.resolve(userDataOverride), 'agent-data')
  if (isPackaged) {
    if (!userDataPath) throw new Error('Packaged Karna requires an Electron userData path')
    return path.join(path.resolve(userDataPath), 'agent-data')
  }
  if (legacyHome) return path.resolve(legacyHome)
  if (env.HERMES_HOME && String(env.HERMES_HOME).trim()) return normalize(env.HERMES_HOME)
  return path.join(path.resolve(userDataPath || process.cwd()), 'agent-data')
}

// Entries that belong to the replaceable runtime or are safe to regenerate.
// Everything else is treated as user data. This denylist approach means new
// upstream state types are preserved automatically instead of being silently
// lost until somebody remembers to extend an allowlist.
const LEGACY_RUNTIME_EXCLUDES = new Set([
  'versions',
  'node',
  'hermes-agent',
  'offline-runtime',
  'active-version',
  'runtime-manifest.json',
  'hermes-setup.exe',
  '.hermes-update-in-progress',
  '.karna-offline-runtime.json',
  'cache',
  'audio_cache',
  'image_cache',
  'logs',
  'temp',
  'tmp',
  '__pycache__',
  '.update_check',
  '.skills_prompt_snapshot.json',
  'models_dev_cache.json',
  'provider_models_cache.json',
  'ollama_cloud_models_cache.json'
])

function samePath(a, b) {
  const normalize = value => {
    const resolved = path.resolve(value).replace(/[\\/]+$/, '')
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  }
  return normalize(a) === normalize(b)
}

function copyMissingTree(source, destination, stats) {
  const info = fs.lstatSync(source)
  if (info.isSymbolicLink()) {
    stats.skipped += 1
    return
  }
  if (info.isDirectory()) {
    fs.mkdirSync(destination, { recursive: true })
    for (const entry of fs.readdirSync(source)) {
      copyMissingTree(path.join(source, entry), path.join(destination, entry), stats)
    }
    return
  }
  if (!info.isFile()) return
  if (fs.existsSync(destination)) {
    stats.skipped += 1
    return
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true })
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL)
  try { fs.chmodSync(destination, info.mode & 0o777) } catch {}
  stats.files += 1
  stats.bytes += info.size
}

function migrateLegacyRuntimeUserData(options = {}) {
  const stats = { files: 0, bytes: 0, skipped: 0, entries: [] }
  if (!options.legacyRuntimeHome || !options.targetHome) return stats
  const legacyRuntimeHome = path.resolve(String(options.legacyRuntimeHome))
  const targetHome = path.resolve(String(options.targetHome))

  if (samePath(legacyRuntimeHome, targetHome)) return stats
  fs.mkdirSync(targetHome, { recursive: true })
  if (!fs.existsSync(legacyRuntimeHome)) return stats

  for (const entry of fs.readdirSync(legacyRuntimeHome)) {
    if (LEGACY_RUNTIME_EXCLUDES.has(entry) || entry.startsWith('.karna-update-')) continue
    copyMissingTree(path.join(legacyRuntimeHome, entry), path.join(targetHome, entry), stats)
    stats.entries.push(entry)
  }

  const marker = path.join(targetHome, '.karna-data-migration.json')
  const previous = (() => {
    try { return JSON.parse(fs.readFileSync(marker, 'utf8')) } catch { return null }
  })()
  if (previous && stats.files === 0) return stats
  fs.writeFileSync(marker, `${JSON.stringify({
    schemaVersion: 1,
    migratedAt: previous?.migratedAt || new Date().toISOString(),
    lastCheckedAt: new Date().toISOString(),
    legacyRuntimeHome,
    filesCopied: Number(previous?.filesCopied || 0) + stats.files,
    bytesCopied: Number(previous?.bytesCopied || 0) + stats.bytes
  }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  return stats
}

module.exports = {
  LEGACY_RUNTIME_EXCLUDES,
  migrateLegacyRuntimeUserData,
  resolveKarnaAgentDataHome
}
