'use strict'

const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const test = require('node:test')

const { createReleaseUpdater } = require('./release-updater.cjs')

test('release updater maps GitHub update state and waits for explicit install', async () => {
  const updater = new EventEmitter()
  updater.checkForUpdates = async () => ({ updateInfo: { version: '0.18.0' } })
  updater.downloadUpdate = async () => []
  updater.quitAndInstall = () => {}
  const progress = []
  const service = createReleaseUpdater({
    app: { isPackaged: true, getVersion: () => '0.17.0' },
    autoUpdater: updater,
    emitProgress: value => progress.push(value),
    onInstall: () => {},
    promptInstall: async () => false
  })
  const checked = await service.check()
  assert.equal(checked.updateAvailable, true)
  updater.emit('update-downloaded', { version: '0.18.0' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(service.status().behind, 1)
  assert.equal(progress.at(-1).stage, 'done')
})
