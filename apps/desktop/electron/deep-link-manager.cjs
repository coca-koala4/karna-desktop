'use strict'

const path = require('node:path')

function createDeepLinkManager({ app, getMainWindow, ipcMain, rememberLog }) {
  const protocols = ['karna', 'hermes']
  let pending = null
  let rendererReady = false

  const extractDeepLink = argv => {
    if (!Array.isArray(argv)) return null
    return argv.find(value => typeof value === 'string' && protocols.some(protocol => value.startsWith(`${protocol}://`))) || null
  }

  const deliverDeepLink = url => {
    if (!url || typeof url !== 'string') return
    let parsed
    try {
      parsed = new URL(url)
    } catch {
      rememberLog(`[deeplink] ignoring malformed url: ${url}`)
      return
    }
    const kind = parsed.hostname || ''
    const name = decodeURIComponent((parsed.pathname || '').replace(/^\//, ''))
    const params = {}
    parsed.searchParams.forEach((value, key) => { params[key] = value })
    const payload = { kind, name, params }
    const mainWindow = getMainWindow()
    if (!rendererReady || !mainWindow || mainWindow.isDestroyed()) {
      pending = payload
      return
    }
    try {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      mainWindow.webContents.send('hermes:deep-link', payload)
      rememberLog(`[deeplink] delivered ${kind}/${name}`)
    } catch (error) {
      rememberLog(`[deeplink] delivery failed: ${error.message}`)
    }
  }

  ipcMain.handle('hermes:deep-link-ready', () => {
    rendererReady = true
    if (pending) {
      const queued = pending
      pending = null
      deliverDeepLink(`karna://${queued.kind}/${encodeURIComponent(queued.name)}` + (Object.keys(queued.params).length ? `?${new URLSearchParams(queued.params).toString()}` : ''))
    }
    return { ok: true }
  })

  const registerDeepLinkProtocol = () => {
    for (const protocol of protocols) {
      try {
        if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient(protocol, process.execPath, [path.resolve(process.argv[1])])
        else app.setAsDefaultProtocolClient(protocol)
      } catch (error) {
        rememberLog(`[deeplink] ${protocol} protocol registration failed: ${error.message}`)
      }
    }
  }

  const gotSingleInstanceLock = app.requestSingleInstanceLock()
  if (!gotSingleInstanceLock) app.quit()
  else {
    app.on('second-instance', (_event, argv) => {
      const url = extractDeepLink(argv)
      const mainWindow = getMainWindow()
      if (url) deliverDeepLink(url)
      else if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.focus()
      }
    })
  }

  app.on('open-url', (event, url) => {
    event.preventDefault()
    deliverDeepLink(url)
  })

  return { deliverDeepLink, extractDeepLink, gotSingleInstanceLock, registerDeepLinkProtocol }
}

module.exports = { createDeepLinkManager }
