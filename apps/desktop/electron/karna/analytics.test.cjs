'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { createAnalyticsService } = require('./analytics.cjs')

test('product metrics implement all five documented definitions without rates above one', () => {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-analytics-'))
  const analytics = createAnalyticsService({ fs, path, karnaPaths: { dataRoot: () => dataRoot } })
  const events = [
    ['project_created', { project_id: 'p1' }],
    ['project_created', { project_id: 'p2' }],
    ['delivery_package_built', { project_id: 'p1' }],
    ['delivery_package_built', { project_id: 'p1' }],
    ['project_import_attempted', { project_id: 'p1' }],
    ['project_imported', { project_id: 'p1' }],
    ['project_import_attempted', { project_id: 'p1' }],
    ['project_import_failed', { project_id: 'p1' }],
    ['workflow_run_started', { project_id: 'p1' }],
    ['workflow_run_started', { project_id: 'p1' }],
    ['workflow_run_completed', { project_id: 'p1' }],
    ['workflow_run_failed', { project_id: 'p1' }],
    ['workflow_human_confirmation', { duration_ms: 1000 }],
    ['workflow_human_confirmation', { duration_ms: 3000 }],
    ['delivery_verified', { ok: true }],
    ['delivery_verified', { ok: false }]
  ]

  try {
    events.forEach(([name, properties]) => analytics.track(name, properties))
    const metrics = analytics.getProductMetrics()

    assert.deepEqual(metrics.projects, { completed: 1, completion_rate: 0.5, created: 2 })
    assert.deepEqual(metrics.imports, { attempts: 2, failed: 1, succeeded: 1, success_rate: 0.5 })
    assert.equal(metrics.workflows.success_rate, 0.5)
    assert.equal(metrics.human_confirmation.mean_duration_ms, 2000)
    assert.equal(metrics.delivery.success_rate, 0.5)
  } finally {
    analytics.destroy()
    fs.rmSync(dataRoot, { force: true, recursive: true })
  }
})
