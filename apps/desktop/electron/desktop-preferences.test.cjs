'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { createDesktopPreferences } = require('./desktop-preferences.cjs')

test('installer options apply once and do not contain user content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-prefs-'))
  try {
    const calls = []
    let shortcutOptions = null
    const installDir = path.join(root, 'Karna')
    const execPath = path.join(installDir, 'Karna.exe')
    fs.mkdirSync(path.join(installDir, 'resources'), { recursive: true })
    fs.writeFileSync(execPath, 'exe')
    fs.writeFileSync(path.join(installDir, 'resources', 'icon.ico'), 'ico')
    const app = {
      isPackaged: true,
      getPath: name => path.join(root, name),
      getLoginItemSettings: () => ({ openAtLogin: calls.at(-1)?.openAtLogin || false }),
      setLoginItemSettings: value => calls.push(value)
    }
    const shell = {
      writeShortcutLink: (target, _operation, options) => {
        shortcutOptions = options
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, 'shortcut')
        return true
      }
    }
    const prefs = createDesktopPreferences({ app, fs, path, processRef: { execPath, platform: 'win32' }, shell })
    fs.mkdirSync(path.dirname(prefs.installerOptionsPath()), { recursive: true })
    fs.writeFileSync(prefs.installerOptionsPath(), JSON.stringify({ schemaVersion: 1, workspace: path.join(root, 'workspace'), autostart: 1, desktopShortcut: 1 }))
    let workspace = null
    const result = prefs.applyInstallerOptions(value => { workspace = value })
    assert.equal(result.applied, true)
    assert.equal(workspace, path.join(root, 'workspace'))
    assert.equal(fs.existsSync(prefs.shortcutPath()), true)
    assert.equal(fs.existsSync(prefs.installerOptionsPath()), false)
    assert.equal(calls[0].args[0], '--startup')
    assert.equal(shortcutOptions.icon, path.join(installDir, 'resources', 'icon.ico'))
    assert.equal(shortcutOptions.appUserModelId, 'com.karna.desktop')
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
