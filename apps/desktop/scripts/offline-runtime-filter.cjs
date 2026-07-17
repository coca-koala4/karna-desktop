'use strict'

const DENIED_RUNTIME_PATH = /(^|[\\/])(\.git|\.venv|tests?|docs?|website|playwright-report|karna-data|__pycache__|\.pytest_cache|\.mypy_cache)([\\/]|$)/i

// electron-builder intentionally omits foreign-architecture Windows launchers
// from an x64 NSIS payload. If they remain in runtime-manifest.json, the
// installed app fails integrity verification even though they cannot run.
const FOREIGN_ARCH_WINDOWS_LAUNCHER = /(^|\/)(?:[tw]64-arm|(?:cli|gui)-arm64)\.exe$/i

function shouldIncludeOfflineRuntimePath(relativePath) {
  const normalized = String(relativePath || '').replaceAll('\\', '/')
  return Boolean(normalized) && !DENIED_RUNTIME_PATH.test(normalized) && !FOREIGN_ARCH_WINDOWS_LAUNCHER.test(normalized)
}

module.exports = {
  DENIED_RUNTIME_PATH,
  FOREIGN_ARCH_WINDOWS_LAUNCHER,
  shouldIncludeOfflineRuntimePath
}
