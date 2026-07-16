'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { createDeepLinkManager } = require('./deep-link-manager.cjs')

test('deep-link manager accepts Karna links, keeps Hermes compatibility, and flushes queued links', () => {
  const appHandlers = {}
  const ipcHandlers = {}
  const sent = []
  const registrations = []
  const mainWindow = {
    focus() {},
    isDestroyed: () => false,
    isMinimized: () => false,
    webContents: { send: (...args) => sent.push(args) }
  }
  const manager = createDeepLinkManager({
    app: {
      on: (name, handler) => { appHandlers[name] = handler },
      quit() {},
      requestSingleInstanceLock: () => true,
      setAsDefaultProtocolClient: protocol => { registrations.push(protocol); return true }
    },
    getMainWindow: () => mainWindow,
    ipcMain: { handle: (name, handler) => { ipcHandlers[name] = handler } },
    rememberLog() {}
  })

  assert.equal(manager.extractDeepLink(['x', 'karna://blueprint/morning']), 'karna://blueprint/morning')
  assert.equal(manager.extractDeepLink(['hermes://blueprint/legacy']), 'hermes://blueprint/legacy')

  manager.deliverDeepLink('karna://blueprint/morning?time=08%3A00')
  assert.equal(sent.length, 0)
  ipcHandlers['hermes:deep-link-ready']()
  assert.deepEqual(sent[0], ['hermes:deep-link', { kind: 'blueprint', name: 'morning', params: { time: '08:00' } }])

  manager.registerDeepLinkProtocol()
  assert.deepEqual(registrations, ['karna', 'hermes'])
  assert.equal(typeof appHandlers['second-instance'], 'function')
  assert.equal(typeof appHandlers['open-url'], 'function')
})
