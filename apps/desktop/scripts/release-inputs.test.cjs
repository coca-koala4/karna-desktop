'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { statusPath, unexpectedReleaseInputs } = require('./release-inputs.cjs')

test('release guard allows generated files but rejects source changes', () => {
  const status = [
    '?? apps/desktop/test-results/writer.png',
    ' M apps/desktop/dist/index.html',
    '?? output/report.json',
    ' M apps/desktop/src/main.tsx'
  ].join('\n')

  assert.deepEqual(unexpectedReleaseInputs(status), ['apps/desktop/src/main.tsx'])
})

test('release guard evaluates the destination of git rename records', () => {
  assert.equal(statusPath('R  old.txt -> apps/desktop/src/new.ts'), 'apps/desktop/src/new.ts')
})
