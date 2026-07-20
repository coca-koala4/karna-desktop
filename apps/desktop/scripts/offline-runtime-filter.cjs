'use strict'

const DENIED_RUNTIME_PATH = /^(karna-runtime|hermes-agent)\/(?:\.git|\.venv|tests?|docs?|website|demos?|examples?|playwright-report|karna-data|__pycache__|\.pytest_cache|\.mypy_cache|\.ruff_cache|sessions?|projects?|logs?|\.vscode|\.idea)(?:\/|$)/i
const DENIED_FILES = /(?:^|\/)(?:.*\.pyc|.*\.pyo|.*\.pyd\.dbg|.*\.map|.*\.patch|.*\.orig|.*\.rej|AUTHORS|CHANGELOG|CONTRIBUTING|HISTORY|LICENSE|MANIFEST|NEWS|PATENTS|PKG-INFO|README|THANKS|TODO)(?:\.[^.\/]*)?$/i

const FOREIGN_ARCH_WINDOWS_LAUNCHER = /(?:^|\/)(?:[tw]64-arm|(?:cli|gui)-arm64)\.exe$/i
const GENERATED_RUNTIME_METADATA = /(?:^|\/)(?:runtime-manifest\.json|\.karna-offline-runtime\.json|active-version)$/i

function shouldIncludeOfflineRuntimePath(relativePath) {
  const normalized = String(relativePath || '').replaceAll('\\', '/')
  if (normalized.startsWith('karna-runtime/venv/') || normalized.startsWith('hermes-agent/venv/')) {
    return true
  }
  return (
    Boolean(normalized) &&
    !DENIED_RUNTIME_PATH.test(normalized) &&
    !DENIED_FILES.test(normalized) &&
    !FOREIGN_ARCH_WINDOWS_LAUNCHER.test(normalized) &&
    !GENERATED_RUNTIME_METADATA.test(normalized)
  )
}

module.exports = {
  DENIED_RUNTIME_PATH,
  DENIED_FILES,
  FOREIGN_ARCH_WINDOWS_LAUNCHER,
  GENERATED_RUNTIME_METADATA,
  shouldIncludeOfflineRuntimePath
}
