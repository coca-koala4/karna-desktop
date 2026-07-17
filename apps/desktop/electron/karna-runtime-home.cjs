'use strict'

const path = require('node:path')

function resolveKarnaRuntimeHome(options = {}) {
  const env = options.env || process.env
  const isPackaged = Boolean(options.isPackaged)
  const isWindows = Boolean(options.isWindows)
  const userDataOverride = options.userDataOverride || null
  const installRoot = options.installRoot || null
  const homeDir = options.homeDir || ''
  const normalize = options.normalize || (value => path.resolve(String(value)))
  const directoryExists = options.directoryExists || (() => false)
  const readWindowsUserEnvVar = options.readWindowsUserEnvVar || (() => null)

  if (env.KARNA_RUNTIME_HOME && String(env.KARNA_RUNTIME_HOME).trim()) return normalize(env.KARNA_RUNTIME_HOME)
  if (userDataOverride) return path.join(path.resolve(userDataOverride), 'hermes-home')

  // A packaged Karna release must never reuse a Hermes CLI home: it can hold
  // unrelated projects, sessions, model selection and credentials.
  if (isPackaged) {
    // Keep the managed runtime beside the user-selected Karna installation,
    // not in C:\Users\...\AppData\Local. The NSIS install directory is the
    // source of truth for a portable/custom-location install.
    if (installRoot) return path.join(path.resolve(installRoot), 'runtime')
    return path.join(homeDir, '.karna', 'runtime')
  }

  if (env.HERMES_HOME) return normalize(env.HERMES_HOME)
  if (isWindows) {
    const fromRegistry = readWindowsUserEnvVar('HERMES_HOME')
    if (fromRegistry) return normalize(fromRegistry)
  }
  if (isWindows && env.LOCALAPPDATA) {
    const localAppData = path.join(env.LOCALAPPDATA, 'hermes')
    const legacy = path.join(homeDir, '.hermes')
    if (!directoryExists(localAppData) && directoryExists(legacy)) return legacy
    return localAppData
  }
  return path.join(homeDir, '.hermes')
}

module.exports = { resolveKarnaRuntimeHome }
