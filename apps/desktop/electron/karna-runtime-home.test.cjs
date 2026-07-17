'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { resolveKarnaRuntimeHome } = require('./karna-runtime-home.cjs')

test('packaged Windows Karna ignores an existing Hermes home', () => {
  const result = resolveKarnaRuntimeHome({
    env: { LOCALAPPDATA: 'C:\\Users\\alice\\AppData\\Local', HERMES_HOME: 'D:\\private-hermes' },
    isPackaged: true,
    isWindows: true,
    homeDir: 'C:\\Users\\alice',
    installRoot: 'D:\\Apps\\Karna',
    readWindowsUserEnvVar: () => 'E:\\also-private'
  })
  assert.equal(result, 'D:\\Apps\\Karna\\runtime')
})

test('packaged runtime supports an explicit Karna-only override', () => {
  const result = resolveKarnaRuntimeHome({
    env: { KARNA_RUNTIME_HOME: 'F:\\KarnaRuntime', LOCALAPPDATA: 'C:\\Local' },
    isPackaged: true,
    isWindows: true,
    normalize: value => value
  })
  assert.equal(result, 'F:\\KarnaRuntime')
})

test('fresh-install sandbox keeps runtime below throwaway user data', () => {
  const result = resolveKarnaRuntimeHome({
    env: { LOCALAPPDATA: 'C:\\Local' },
    isPackaged: true,
    isWindows: true,
    userDataOverride: 'D:\\smoke-user-data'
  })
  assert.equal(result, 'D:\\smoke-user-data\\hermes-home')
})

test('development retains the explicit Hermes CLI home', () => {
  const result = resolveKarnaRuntimeHome({
    env: { HERMES_HOME: 'D:\\HermesDev' },
    isPackaged: false,
    isWindows: true,
    normalize: value => value
  })
  assert.equal(result, 'D:\\HermesDev')
})
