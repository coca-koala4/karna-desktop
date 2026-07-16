'use strict'

const ANALYTICS_FLUSH_INTERVAL_MS = 30_000
const MAX_QUEUE_SIZE = 500
const ANALYTICS_FILENAME = 'analytics.jsonl'

const BUILTIN_EVENTS = new Set([
  'app_started',
  'project_created',
  'project_import_attempted',
  'project_imported',
  'project_import_failed',
  'workflow_run_started',
  'workflow_run_completed',
  'workflow_run_failed',
  'export_built',
  'tts_used',
  'image_generated',
  'workflow_human_confirmation',
  'delivery_package_built',
  'delivery_verified'
])

function createAnalyticsService(deps) {
  const _fs = deps && deps.fs ? deps.fs : require('node:fs')
  const _path = deps && deps.path ? deps.path : require('node:path')
  const _karnaPaths = deps && deps.karnaPaths ? deps.karnaPaths : null
  const eventQueue = []
  const eventCounts = new Map()
  let flushTimer = null
  let totalEvents = 0

  const getDataRoot = () => {
    if (_karnaPaths && typeof _karnaPaths.dataRoot === 'function') {
      return _karnaPaths.dataRoot({ env: { ...process.env, KARNA_DATA_DIR: process.env.KARNA_DESKTOP_DATA_DIR || process.env.KARNA_DATA_DIR } })
    }
    return _path.join(process.cwd(), 'karna-data')
  }

  const getAnalyticsFilePath = () => {
    return _path.join(getDataRoot(), ANALYTICS_FILENAME)
  }

  const flushQueue = () => {
    if (eventQueue.length === 0) return
    const toWrite = eventQueue.splice(0, eventQueue.length)
    try {
      const dir = _path.dirname(getAnalyticsFilePath())
      if (!_fs.existsSync(dir)) {
        _fs.mkdirSync(dir, { recursive: true })
      }
      const lines = toWrite.map(ev => JSON.stringify(ev)).join('\n') + '\n'
      _fs.appendFileSync(getAnalyticsFilePath(), lines, 'utf8')
    } catch {
      // Silently drop events if we cannot write — analytics must never crash the app
    }
  }

  const scheduleFlush = () => {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      flushQueue()
    }, ANALYTICS_FLUSH_INTERVAL_MS)
    if (typeof flushTimer.unref === 'function') flushTimer.unref()
  }

  const track = (eventName, properties) => {
    const name = String(eventName || '').trim()
    if (!name) return
    const event = {
      event: name,
      timestamp: new Date().toISOString(),
      properties: properties && typeof properties === 'object' ? properties : {}
    }
    eventQueue.push(event)
    totalEvents++
    eventCounts.set(name, (eventCounts.get(name) || 0) + 1)
    if (eventQueue.length >= MAX_QUEUE_SIZE) {
      flushQueue()
    } else {
      scheduleFlush()
    }
  }

  const getTodayStart = () => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  }

  const countTodayEvents = () => {
    const todayStart = getTodayStart()
    let count = 0
    try {
      const file = getAnalyticsFilePath()
      if (_fs.existsSync(file)) {
        const content = _fs.readFileSync(file, 'utf8')
        const lines = content.split(/\r?\n/).filter(Boolean)
        for (const line of lines) {
          try {
            const ev = JSON.parse(line)
            const ts = new Date(ev.timestamp).getTime()
            if (ts >= todayStart) count++
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch {
      // cannot read file
    }
    for (const ev of eventQueue) {
      const ts = new Date(ev.timestamp).getTime()
      if (ts >= todayStart) count++
    }
    return count
  }

  const getStats = () => {
    const byType = {}
    for (const [name, count] of eventCounts) {
      byType[name] = count
    }
    return {
      total_events: totalEvents,
      today_events: countTodayEvents(),
      pending_queue: eventQueue.length,
      by_type: byType,
      builtin_events: Array.from(BUILTIN_EVENTS),
      analytics_file: getAnalyticsFilePath()
    }
  }

  const readAllEvents = () => {
    const rows = []
    try {
      const file = getAnalyticsFilePath()
      if (_fs.existsSync(file)) {
        _fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).forEach(line => {
          try { rows.push(JSON.parse(line)) } catch { /* ignore malformed historical rows */ }
        })
      }
    } catch {
      // Metrics are advisory and must not block the desktop app.
    }
    return [...rows, ...eventQueue]
  }

  const getProductMetrics = () => {
    const events = readAllEvents()
    const count = name => events.filter(event => event.event === name).length
    const uniqueProjectIds = name => new Set(events.filter(event => event.event === name).map(event => event.properties?.project_id).filter(Boolean))
    const createdProjects = uniqueProjectIds('project_created')
    const deliveredProjects = uniqueProjectIds('delivery_package_built')
    const completedCreatedProjects = [...deliveredProjects].filter(projectId => createdProjects.has(projectId)).length
    const importSuccesses = count('project_imported')
    const importFailures = count('project_import_failed')
    // Older analytics files predate the explicit attempt event. Treat their
    // terminal success/failure rows as attempts so historical rates remain sane.
    const explicitImportAttempts = count('project_import_attempted')
    const importAttempts = explicitImportAttempts || importSuccesses + importFailures
    const started = count('workflow_run_started')
    const completed = count('workflow_run_completed')
    const failed = count('workflow_run_failed')
    const confirmations = events.filter(event => event.event === 'workflow_human_confirmation')
    const confirmationDurations = confirmations.map(event => Number(event.properties?.duration_ms)).filter(Number.isFinite)
    // Delivery packages are the release artifact. Keep manuscript exports as a
    // separate activity metric rather than using them as the delivery denominator.
    const manuscriptExports = count('export_built')
    const deliveryPackages = count('delivery_package_built')
    const deliveryVerifications = events.filter(event => event.event === 'delivery_verified')
    const successfulDeliveryVerifications = deliveryVerifications.filter(event => event.properties?.ok === true).length
    return {
      definitions: {
        project_completion_rate: 'delivery_packages_built / projects_created',
        import_success_rate: 'projects_imported / import_attempts',
        workflow_success_rate: 'workflow_runs_completed / workflow_runs_started',
        human_confirmation_duration_ms: 'mean confirmation duration',
        delivery_success_rate: 'successful_delivery_verifications / delivery_verification_attempts'
      },
      projects: {
        created: createdProjects.size,
        completed: completedCreatedProjects,
        completion_rate: createdProjects.size ? completedCreatedProjects / createdProjects.size : null
      },
      imports: {
        attempts: importAttempts,
        succeeded: importSuccesses,
        failed: importFailures,
        success_rate: importAttempts ? importSuccesses / importAttempts : null
      },
      workflows: { started, completed, failed, success_rate: started ? completed / started : null },
      human_confirmation: { count: confirmations.length, mean_duration_ms: confirmationDurations.length ? Math.round(confirmationDurations.reduce((sum, value) => sum + value, 0) / confirmationDurations.length) : null },
      delivery: {
        manuscript_exports: manuscriptExports,
        packages_built: deliveryPackages,
        verification_attempts: deliveryVerifications.length,
        successful_verifications: successfulDeliveryVerifications,
        success_rate: deliveryVerifications.length ? successfulDeliveryVerifications / deliveryVerifications.length : null
      }
    }
  }

  const flush = () => {
    flushQueue()
  }

  const destroy = () => {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    flushQueue()
  }

  return {
    track,
    getStats,
    getProductMetrics,
    flush,
    destroy,
    BUILTIN_EVENTS
  }
}

module.exports = { createAnalyticsService }
