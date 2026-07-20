/**
 * after-pack.cjs — electron-builder afterPack hook.
 *
 * Stamps the Hermes icon + identity onto the packed Windows Hermes.exe via
 * rcedit (delegated to set-exe-identity.cjs). This runs for EVERY packed build
 * — first install, `hermes desktop`, the installer's --update rebuild, and a
 * dev's manual `npm run pack` — so the branded exe can never silently revert
 * to the stock "Electron" icon/name (the bug when the stamp lived only in
 * install.ps1, which the update path doesn't use).
 *
 * Windows-only: rcedit edits PE resources, irrelevant on macOS/Linux where the
 * app identity comes from the bundle Info.plist / desktop entry. Best-effort:
 * a stamp failure must never fail an otherwise-good build (worst case is the
 * stock icon, not a broken app), so we log and resolve rather than throw.
 *
 * electron-builder passes a context with:
 *   - electronPlatformName: 'win32' | 'darwin' | 'linux'
 *   - appOutDir:            the unpacked app directory for this target
 *   - packager.appInfo.productFilename: the exe basename (e.g. 'Hermes')
 */

const path = require('node:path')

const { stampExeIdentity } = require('./set-exe-identity.cjs')
const { verifyUnpacked } = require('./verify-release-contents.cjs')

const buildLog = []
const stepTimings = []

function logStep(step, message) {
  const entry = { step, message, ts: new Date().toISOString() }
  buildLog.push(entry)
  console.log(`[after-pack] [${step}] ${message}`)
}

function logWarn(step, message) {
  const entry = { step, message, ts: new Date().toISOString(), level: 'warn' }
  buildLog.push(entry)
  console.warn(`[after-pack] [${step}] WARNING: ${message}`)
}

function logError(step, message) {
  const entry = { step, message, ts: new Date().toISOString(), level: 'error' }
  buildLog.push(entry)
  console.error(`[after-pack] [${step}] ERROR: ${message}`)
}

async function timeStepAsync(step, fn) {
  const start = Date.now()
  try {
    const result = await fn()
    stepTimings.push({ step, durationMs: Date.now() - start, ok: true })
    return result
  } catch (err) {
    stepTimings.push({ step, durationMs: Date.now() - start, ok: false, error: err.message })
    throw err
  }
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

exports.default = async function afterPack(context) {
  const startedAt = new Date()
  const platform = context && context.electronPlatformName

  logStep('init', `afterPack hook started for ${platform || 'unknown platform'}`)
  logStep('target', `appOutDir: ${context.appOutDir || '(none)'}`)

  try {
    timeStep('verify', () => {
      verifyUnpacked(context.appOutDir)
    })
    logStep('verify', 'unpacked contents verified')
  } catch (err) {
    logError('verify', `unpacked verification failed: ${err.message}`)
    throw err
  }

  if (context.electronPlatformName !== 'win32') {
    const endedAt = new Date()
    const durationMs = endedAt.getTime() - startedAt.getTime()
    logStep('skip', `non-win32 platform (${platform}), skipping exe identity stamp`)
    logStep('done', `afterPack hook completed in ${durationMs}ms`)
    return {
      ok: true,
      skipped: true,
      reason: 'non-win32',
      timing: {
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        duration_ms: durationMs,
        steps: stepTimings
      },
      build_log: buildLog
    }
  }

  const productName = context.packager?.appInfo?.productFilename || 'Hermes'
  const exe = path.join(context.appOutDir, `${productName}.exe`)
  const desktopRoot = path.resolve(__dirname, '..')

  logStep('stamp', `stamping exe identity: ${exe}`)

  // Branding is a release invariant, not a cosmetic best-effort operation.
  // A stock Electron icon must never escape as a Karna build.
  try {
    await timeStepAsync('stamp', () => stampExeIdentity(exe, desktopRoot))
    logStep('stamp', 'exe identity stamped successfully')
  } catch (err) {
    logError('stamp', `exe identity stamp failed: ${err.message}`)
    throw err
  }

  const endedAt = new Date()
  const durationMs = endedAt.getTime() - startedAt.getTime()
  logStep('done', `afterPack hook completed in ${durationMs}ms`)

  return {
    ok: true,
    platform,
    productName,
    exe,
    timing: {
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      duration_ms: durationMs,
      steps: stepTimings
    },
    build_log: buildLog
  }
}
