'use strict'

const fs = require('node:fs')
const path = require('node:path')

const AUDIT_LOG_FILE = 'remote-audit.log'
const MAX_LOG_SIZE = 10 * 1024 * 1024
const BACKUP_COUNT = 3

const SENSITIVE_KEYS = new Set([
  'password', 'passwd', 'secret', 'token', 'api_key', 'apikey',
  'private_key', 'privatekey', 'session_key', 'sessionkey',
  'shared_secret', 'encryption_key', 'hmac_key', 'key',
  'prompt', 'content', 'message', 'file_content', 'fileContent',
  'code', 'input', 'output', 'response', 'text', 'body'
])

function redactSensitiveData(obj, depth = 0) {
  if (depth > 10 || obj === null || obj === undefined) return obj
  if (typeof obj !== 'object') return obj

  if (Array.isArray(obj)) {
    return obj.map(item => redactSensitiveData(item, depth + 1))
  }

  const redacted = {}
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase()
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('secret') || lowerKey.includes('token') || lowerKey.includes('key')) {
      redacted[key] = '[REDACTED]'
    } else if (typeof value === 'object') {
      redacted[key] = redactSensitiveData(value, depth + 1)
    } else if (typeof value === 'string' && value.length > 200) {
      redacted[key] = value.substring(0, 100) + '...[TRUNCATED]'
    } else {
      redacted[key] = value
    }
  }
  return redacted
}

function createAuditLogger(deps = {}) {
  const {
    paths,
    app,
    fs: fsDep = fs
  } = deps

  let logPath = null
  let writeBuffer = []
  let flushTimer = null
  const FLUSH_INTERVAL_MS = 1000

  if (paths) {
    const logsDir = typeof paths.logsDir === 'function' ? paths.logsDir({ app }) : paths.logsDir
    logPath = path.join(logsDir, AUDIT_LOG_FILE)
  }

  function rotateLogs() {
    if (!logPath) return
    try {
      const stat = fsDep.statSync(logPath)
      if (stat.size < MAX_LOG_SIZE) return

      for (let i = BACKUP_COUNT; i >= 1; i--) {
        const src = i === 1 ? logPath : `${logPath}.${i - 1}`
        const dst = `${logPath}.${i}`
        try {
          if (fsDep.existsSync(src)) {
            fsDep.renameSync(src, dst)
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  function flushBuffer() {
    if (!logPath || writeBuffer.length === 0) return
    const lines = writeBuffer.splice(0)
    try {
      rotateLogs()
      fsDep.mkdirSync(path.dirname(logPath), { recursive: true })
      fsDep.appendFileSync(logPath, lines.join('\n') + '\n', 'utf8')
    } catch (_) {}
  }

  function scheduleFlush() {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      flushBuffer()
    }, FLUSH_INTERVAL_MS)
  }

  function log(level, event, details = {}) {
    const safeDetails = redactSensitiveData(details)
    const entry = {
      ts: Date.now(),
      level,
      event,
      ...safeDetails
    }
    writeBuffer.push(JSON.stringify(entry))
    scheduleFlush()
  }

  function initialize() {
  }

  function info(event, details) { log('info', event, details) }
  function warn(event, details) { log('warn', event, details) }
  function error(event, details) { log('error', event, details) }

  function devicePair(details) { info('device_pair', { deviceId: details?.deviceId, wakeId: details?.wakeId?.substring(0, 8) }) }
  function deviceRevoke(details) { info('device_revoke', { deviceId: details?.deviceId, reason: details?.reason }) }
  function sessionStart(details) { info('session_start', { sessionId: details?.sessionId, deviceId: details?.deviceId }) }
  function sessionEnd(details) { info('session_end', { sessionId: details?.sessionId, deviceId: details?.deviceId, reason: details?.reason }) }
  function messageReceived(details) { info('message_received', { sessionId: details?.sessionId, type: details?.type, size: details?.size }) }
  function messageSent(details) { info('message_sent', { sessionId: details?.sessionId, type: details?.type, size: details?.size }) }
  function permissionDenied(details) { warn('permission_denied', { deviceId: details?.deviceId, capability: details?.capability, reason: details?.reason }) }
  function authFailure(details) { warn('auth_failure', { deviceId: details?.deviceId, reason: details?.reason, remoteAddress: details?.remoteAddress }) }
  function serverStart(details) { info('server_start', { port: details?.port }) }
  function serverStop(details) { info('server_stop', { reason: details?.reason }) }
  function commandExecuted(details) { info('command_executed', { deviceId: details?.deviceId, commandId: details?.commandId, commandType: details?.commandType, exitCode: details?.exitCode }) }
  function notificationSent(details) { info('notification_sent', { wakeId: details?.wakeId?.substring(0, 8), eventType: details?.eventType }) }

  async function shutdown() {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    flushBuffer()
  }

  return Object.freeze({
    initialize,
    log,
    info,
    warn,
    error,
    devicePair,
    deviceRevoke,
    sessionStart,
    sessionEnd,
    messageReceived,
    messageSent,
    permissionDenied,
    authFailure,
    serverStart,
    serverStop,
    commandExecuted,
    notificationSent,
    shutdown
  })
}

module.exports = { createAuditLogger, redactSensitiveData }
