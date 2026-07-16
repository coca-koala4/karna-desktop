'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { createDesktopPreferences } = require('./desktop-preferences.cjs')

test('installer options apply once and do not contain user content', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-prefs-'))
  const calls = []
  const app = {
    isPackaged: true,
    getPath: name => path.join(root, name),
    getLoginItemSettings: () => ({ openAtLogin: calls.at(-1)?.openAtLogin || false }),
    setLoginItemSettings: value => calls.push(value)
  }
  const shell = { writeShortcutLink: target => { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, 'shortcut'); return true } }
  const prefs = createDesktopPreferences({ app, fs, path, processRef: { execPath: 'C:\\Karna\\Karna.exe', platform: 'win32' }, shell })
  fs.mkdirSync(path.dirname(prefs.installerOptionsPath()), { recursive: true })
  fs.writeFileSync(prefs.installerOptionsPath(), JSON.stringify({ schemaVersion: 1, workspace: path.join(root, 'workspace'), autostart: 1, desktopShortcut: 1 }))
  let workspace = null
  const result = prefs.applyInstallerOptions(value => { workspace = value })
  assert.equal(result.applied, true)
  assert.equal(workspace, path.join(root, 'workspace'))
  assert.equal(fs.existsSync(prefs.shortcutPath()), true)
  assert.equal(fs.existsSync(prefs.installerOptionsPath()), false)
  assert.equal(calls[0].args[0], '--startup')
  fs.rmSync(root, { recursive: true, force: true })
})
