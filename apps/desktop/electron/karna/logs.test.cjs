'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { createLogger } = require('./logs.cjs')

test('structured request logs retain id, module, level, duration and support filters', () => {
  const originalLog = console.log
  console.log = () => {}
  try {
    const logger = createLogger()

    logger.logRequest('req-ok', 'writer', 'GET /api/writer/projects')
    assert.equal(logger.logTiming('req-ok', 37), true)
    logger.logRequest('req-fail', 'connectors', 'POST /api/connectors failed: timeout', 'error')

    assert.deepEqual(logger.getLogsFiltered({ module: 'writer' }), [{
      durationMs: 37,
      level: 'info',
      message: 'GET /api/writer/projects',
      module: 'writer',
      requestId: 'req-ok',
      timestamp: logger.getLogsFiltered({ requestId: 'req-ok' })[0].timestamp
    }])
    assert.equal(logger.getLogsFiltered({ level: 'error' })[0].requestId, 'req-fail')
    assert.deepEqual(logger.getLogStats(), {
      byLevel: { error: 1, info: 1 },
      byModule: { connectors: 1, writer: 1 },
      errors: 1,
      total: 2,
      warnings: 0
    })
  } finally {
    console.log = originalLog
  }
})

test('logger keeps a bounded 500-entry in-memory window', () => {
  const originalLog = console.log
  console.log = () => {}
  try {
    const logger = createLogger()
    for (let index = 0; index < 510; index++) logger.logRequest(`req-${index}`, 'test', String(index))
    assert.equal(logger.getRecentLogs(1)[0].requestId, 'req-509')
    assert.equal(logger.getLogStats().total, 500)
  } finally {
    console.log = originalLog
  }
})
