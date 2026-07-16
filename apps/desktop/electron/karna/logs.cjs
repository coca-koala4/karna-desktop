'use strict'

function createLoggerUtils() {
  const logEntries = []
  const MAX_LOG_ENTRIES = 500
  const DEFAULT_RECENT_LOG_COUNT = 80

  const _addEntry = (entry) => {
    logEntries.push(entry)
    if (logEntries.length > MAX_LOG_ENTRIES) logEntries.shift()
  }

  const _formatConsoleMessage = (entry) => {
    let parts = []
    if (entry.requestId) parts.push(`[${entry.requestId}]`)
    parts.push(`[${entry.module}]`)
    parts.push(`[${entry.level}]`)
    parts.push(entry.message)
    if (entry.durationMs != null) parts.push(`(${entry.durationMs}ms)`)
    return parts.join(' ')
  }

  const rememberLog = (msg) => {
    const message = typeof msg === 'string' ? msg : String(msg)
    const entry = {
      timestamp: new Date().toISOString(),
      module: 'general',
      level: 'info',
      message: message
    }
    _addEntry(entry)
    console.log(`[karna-adapter] ${_formatConsoleMessage(entry)}`)
  }

  const logRequest = (requestId, module, message, level = 'info') => {
    const entry = {
      timestamp: new Date().toISOString(),
      module: module,
      level: level,
      message: message,
      requestId: requestId
    }
    _addEntry(entry)
    console.log(`[karna-adapter] ${_formatConsoleMessage(entry)}`)
  }

  const logTiming = (requestId, durationMs) => {
    for (let i = logEntries.length - 1; i >= 0; i--) {
      if (logEntries[i].requestId === requestId) {
        logEntries[i].durationMs = durationMs
        console.log(`[karna-adapter] [${requestId}] timing: ${durationMs}ms`)
        return true
      }
    }
    return false
  }

  const getRecentLogs = (n) => {
    const count = n != null ? n : DEFAULT_RECENT_LOG_COUNT
    return logEntries.slice(-count)
  }

  const getLogsFiltered = (filters = {}) => {
    const { module, level, since, requestId } = filters
    return logEntries.filter(entry => {
      if (module && entry.module !== module) return false
      if (level && entry.level !== level) return false
      if (requestId && entry.requestId !== requestId) return false
      if (since) {
        const sinceTime = typeof since === 'string' ? new Date(since).getTime() : since.getTime()
        const entryTime = new Date(entry.timestamp).getTime()
        if (entryTime < sinceTime) return false
      }
      return true
    })
  }

  const getLogStats = () => {
    const stats = {
      total: logEntries.length,
      byModule: {},
      byLevel: {},
      errors: 0,
      warnings: 0
    }

    for (const entry of logEntries) {
      stats.byModule[entry.module] = (stats.byModule[entry.module] || 0) + 1
      stats.byLevel[entry.level] = (stats.byLevel[entry.level] || 0) + 1
      if (entry.level === 'error') stats.errors++
      if (entry.level === 'warn' || entry.level === 'warning') stats.warnings++
    }

    return stats
  }

  return {
    rememberLog,
    logRequest,
    logTiming,
    getRecentLogs,
    getLogsFiltered,
    getLogStats
  }
}

function createLogger() {
  return createLoggerUtils()
}

module.exports = { createLogger, createLoggerUtils }
