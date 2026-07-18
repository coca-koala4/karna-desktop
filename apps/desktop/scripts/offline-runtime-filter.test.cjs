'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { shouldIncludeOfflineRuntimePath } = require('./offline-runtime-filter.cjs')

test('x64 offline runtime excludes foreign architecture launchers omitted by NSIS', () => {
  assert.equal(shouldIncludeOfflineRuntimePath('hermes-agent/venv/Lib/site-packages/pip/_vendor/distlib/t64-arm.exe'), false)
  assert.equal(shouldIncludeOfflineRuntimePath('hermes-agent/venv/Lib/site-packages/pip/_vendor/distlib/w64-arm.exe'), false)
  assert.equal(shouldIncludeOfflineRuntimePath('hermes-agent/venv/Lib/site-packages/setuptools/cli-arm64.exe'), false)
  assert.equal(shouldIncludeOfflineRuntimePath('hermes-agent/venv/Lib/site-packages/setuptools/gui-arm64.exe'), false)
})

test('x64 offline runtime keeps native launchers and non-executable assets containing arm', () => {
  assert.equal(shouldIncludeOfflineRuntimePath('hermes-agent/venv/Lib/site-packages/pip/_vendor/distlib/t64.exe'), true)
  assert.equal(shouldIncludeOfflineRuntimePath('hermes-agent/venv/Lib/site-packages/pip/_vendor/distlib/w64.exe'), true)
  assert.equal(shouldIncludeOfflineRuntimePath('hermes-agent/venv/tcl/tix8.4.3/bitmaps/plusarm.gif'), true)
})

test('offline runtime still rejects tests, caches, user data and source control', () => {
  assert.equal(shouldIncludeOfflineRuntimePath('hermes-agent/tests/test_boot.py'), false)
  assert.equal(shouldIncludeOfflineRuntimePath('hermes-agent/__pycache__/boot.pyc'), false)
  assert.equal(shouldIncludeOfflineRuntimePath('karna-data/config.json'), false)
  assert.equal(shouldIncludeOfflineRuntimePath('.git/config'), false)
})

test('offline runtime rejects generated metadata from an earlier staged bundle', () => {
  assert.equal(shouldIncludeOfflineRuntimePath('runtime-manifest.json'), false)
  assert.equal(shouldIncludeOfflineRuntimePath('.karna-offline-runtime.json'), false)
  assert.equal(shouldIncludeOfflineRuntimePath('active-version'), false)
})
