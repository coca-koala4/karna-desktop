'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { DENIED_PATHS, DENIED_TEXT } = require('./verify-release-contents.cjs')

test('privacy denylist catches local data and test artifacts', () => {
  for (const value of ['karna-data/sessions/a.json', 'electron/foo.test.cjs', 'test-results/a.png', '.venv/pyvenv.cfg', 'tmp/file.patch']) {
    assert.ok(DENIED_PATHS.some(pattern => pattern.test(value)), value)
  }
})

test('privacy text rules catch developer path and credentials', () => {
  assert.ok(DENIED_TEXT.some(pattern => pattern.test('D:\\Agent\\projects\\karna-hermes')))
  assert.ok(DENIED_TEXT.some(pattern => pattern.test('ghp_123456789012345678901234567890')))
})
