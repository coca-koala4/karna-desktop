'use strict'

function boolValue(value) {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function createDesktopPreferences({ app, fs, path, processRef = process, shell }) {
  const installerOptionsPath = () => path.join(app.getPath('userData'), 'installer-options.json')
  const shortcutPath = () => path.join(app.getPath('desktop'), 'Karna.lnk')
  const loginOptions = () => ({ path: processRef.execPath, args: ['--startup'], name: 'Karna' })

  const getAutostart = () => {
    if (!app.isPackaged) return { enabled: false, supported: false }
    const options = loginOptions()
    const state = app.getLoginItemSettings(options)
    return { enabled: Boolean(state.openAtLogin), supported: true }
  }

  const setAutostart = enabled => {
    if (!app.isPackaged) return { enabled: false, supported: false }
    const options = loginOptions()
    app.setLoginItemSettings({ ...options, enabled: true, openAtLogin: Boolean(enabled) })
    return getAutostart()
  }

  const getDesktopShortcut = () => ({ enabled: fs.existsSync(shortcutPath()), supported: processRef.platform === 'win32' })

  const setDesktopShortcut = enabled => {
    if (processRef.platform !== 'win32') return { enabled: false, supported: false }
    const target = shortcutPath()
    if (enabled) {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      const ok = shell.writeShortcutLink(target, 'create', {
        target: processRef.execPath,
        cwd: path.dirname(processRef.execPath),
        description: 'Karna 写作操作系统',
        icon: processRef.execPath,
        iconIndex: 0
      })
      if (!ok) throw new Error('Windows could not create the desktop shortcut.')
    } else {
      fs.rmSync(target, { force: true })
    }
    return getDesktopShortcut()
  }

  const applyInstallerOptions = writeWorkspace => {
    const file = installerOptionsPath()
    if (!fs.existsSync(file)) return { applied: false }
    const options = JSON.parse(fs.readFileSync(file, 'utf8'))
    if (options.schemaVersion !== 1) throw new Error('Unsupported installer options schema.')
    const workspace = typeof options.workspace === 'string' && options.workspace.trim() ? path.resolve(options.workspace) : null
    if (workspace) {
      fs.mkdirSync(workspace, { recursive: true })
      writeWorkspace(workspace)
    }
    if (app.isPackaged) setAutostart(boolValue(options.autostart))
    if (processRef.platform === 'win32') setDesktopShortcut(boolValue(options.desktopShortcut))
    fs.rmSync(file, { force: true })
    return { applied: true, workspace, autostart: boolValue(options.autostart), desktopShortcut: boolValue(options.desktopShortcut) }
  }

  return {
    applyInstallerOptions,
    getAutostart,
    getDesktopShortcut,
    installerOptionsPath,
    setAutostart,
    setDesktopShortcut,
    shortcutPath
  }
}

module.exports = { boolValue, createDesktopPreferences }
