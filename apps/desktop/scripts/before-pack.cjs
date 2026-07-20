'use strict'

/**
 * before-pack.cjs — electron-builder beforePack hook.
 *
 * Removes any stale unpacked app directory (`appOutDir`) before
 * electron-builder stages the Electron binaries into it.
 *
 * WHY THIS EXISTS
 * ---------------
 * electron-builder's final packaging step copies the stock `electron`
 * binary into `release/<platform>-unpacked/` and then renames it to the
 * product name (`Hermes`). If a PREVIOUS `npm run pack` was interrupted
 * (Ctrl-C, OOM kill, crash, full disk) the unpacked directory is left in a
 * corrupted partial state: it keeps the already-renamed `LICENSE.electron.txt`
 * and the Chromium payload (.pak/.so/icudtl.dat/chrome-sandbox) but is MISSING
 * the `electron` binary itself.
 *
 * On the next run, electron-builder sees the destination directory already
 * populated, skips re-copying the binary it thinks is present, then tries to
 * rename a `electron` file that no longer exists. The build dies with:
 *
 *   ENOENT: no such file or directory, rename
 *   '.../release/linux-unpacked/electron' -> '.../release/linux-unpacked/Hermes'
 *
 * This is a hard failure with no obvious cause for the user — `hermes desktop`
 * just prints "Desktop GUI build failed" and the only fix is to manually
 * `rm -rf` the release directory, which a normal user has no way to know.
 *
 * The packaging step is not idempotent across an interrupted run, so we make
 * it idempotent ourselves: wipe the target unpacked directory up front so
 * electron-builder always stages into a clean tree. This is safe — the
 * directory is a pure build artifact that electron-builder fully recreates
 * on every pack; nothing else depends on its prior contents.
 *
 * Cross-platform: the same partial-state trap exists on macOS
 * (the mac-unpacked Hermes.app bundle) and Windows (win-unpacked), so we
 * clean whatever `appOutDir` electron-builder hands us regardless of platform.
 *
 * Best-effort: a cleanup failure must never mask the real build. We log and
 * resolve rather than throw — worst case electron-builder hits the original
 * ENOENT, which is no worse than not having this hook at all.
 *
 * electron-builder passes a context with:
 *   - appOutDir:            the unpacked app directory about to be staged
 *   - electronPlatformName: 'win32' | 'darwin' | 'linux'
 */

const fs = require('node:fs')

const buildLog = []
const stepTimings = []

function logStep(step, message) {
  const entry = { step, message, ts: new Date().toISOString() }
  buildLog.push(entry)
  console.log(`[before-pack] [${step}] ${message}`)
}

function logWarn(step, message) {
  const entry = { step, message, ts: new Date().toISOString(), level: 'warn' }
  buildLog.push(entry)
  console.warn(`[before-pack] [${step}] WARNING: ${message}`)
}

function logError(step, message) {
  const entry = { step, message, ts: new Date().toISOString(), level: 'error' }
  buildLog.push(entry)
  console.error(`[before-pack] [${step}] ERROR: ${message}`)
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

function cleanStaleAppOutDir(appOutDir) {
  if (!appOutDir || typeof appOutDir !== 'string') {
    return false
  }
  if (!fs.existsSync(appOutDir)) {
    return false
  }
  // Recursive + force so a half-written tree (read-only bits, partial files)
  // can't block the wipe. retry/maxRetries rides out transient EBUSY on
  // Windows where an AV/indexer may briefly hold a handle.
  fs.rmSync(appOutDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  return true
}

exports.cleanStaleAppOutDir = cleanStaleAppOutDir

exports.default = async function beforePack(context) {
  const startedAt = new Date()
  const appOutDir = context && context.appOutDir
  const platform = context && context.electronPlatformName

  logStep('init', `beforePack hook started for ${platform || 'unknown platform'}`)
  logStep('target', `appOutDir: ${appOutDir || '(none)'}`)

  let cleaned = false
  try {
    cleaned = timeStep('cleanup', () => cleanStaleAppOutDir(appOutDir))
    if (cleaned) {
      logStep('cleanup', `removed stale unpacked dir before staging: ${appOutDir}`)
    } else {
      logStep('cleanup', `no stale dir to clean at ${appOutDir}`)
    }
  } catch (err) {
    // Never fail the build over cleanup; surface why so a genuinely stuck
    // directory (permissions, mount) is still diagnosable.
    logWarn('cleanup', `could not clean ${appOutDir} (${err.message}); continuing`)
  }

  const endedAt = new Date()
  const durationMs = endedAt.getTime() - startedAt.getTime()
  logStep('done', `beforePack hook completed in ${durationMs}ms (cleaned=${cleaned})`)

  return {
    ok: true,
    cleaned,
    timing: {
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_ms: durationMs,
      steps: stepTimings
    },
    build_log: buildLog
  }
}
