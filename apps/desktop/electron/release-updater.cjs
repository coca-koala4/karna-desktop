'use strict'

function createReleaseUpdater({ app, autoUpdater, emitProgress, onInstall, promptInstall, setIntervalFn = setInterval, setTimeoutFn = setTimeout }) {
  let initialized = false
  let available = null
  let downloaded = null
  let error = null
  let lastCheckedAt = null
  let timer = null

  const status = () => ({
    supported: app.isPackaged && process.platform === 'win32',
    updateAvailable: Boolean(available),
    behind: available ? 1 : 0,
    currentSha: `version:${app.getVersion()}`,
    targetSha: available ? `version:${available.version}` : undefined,
    branch: 'stable',
    message: downloaded ? `Karna ${downloaded.version} 已下载，等待安装。` : undefined,
    error: error ? 'check-failed' : undefined,
    fetchedAt: lastCheckedAt || undefined
  })

  const initialize = () => {
    if (initialized) return true
    if (!app.isPackaged || process.platform !== 'win32') return false
    initialized = true
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = false
    autoUpdater.allowPrerelease = true

    autoUpdater.on('checking-for-update', () => emitProgress({ stage: 'prepare', message: '正在检查 Karna 更新…', percent: null }))
    autoUpdater.on('update-available', info => {
      available = info
      error = null
      emitProgress({ stage: 'pull', message: `发现 Karna ${info.version}，正在后台下载…`, percent: 0 })
    })
    autoUpdater.on('update-not-available', () => {
      available = null
      error = null
      emitProgress({ stage: 'done', message: '当前已是最新版本。', percent: 100 })
    })
    autoUpdater.on('download-progress', progress => emitProgress({
      stage: 'pull',
      message: `正在下载更新 ${Math.round(progress.percent || 0)}%`,
      percent: Math.round(progress.percent || 0)
    }))
    autoUpdater.on('update-downloaded', async info => {
      available = info
      downloaded = info
      emitProgress({ stage: 'done', message: `Karna ${info.version} 已下载。`, percent: 100 })
      if (await promptInstall(info)) install()
    })
    autoUpdater.on('error', cause => {
      error = cause
      emitProgress({ stage: 'error', message: cause?.message || String(cause), percent: null, error: 'release-update-failed' })
    })
    return true
  }

  const check = async () => {
    if (!initialize()) return { ...status(), supported: false, message: '打包安装版才支持 GitHub Releases 自动更新。' }
    lastCheckedAt = Date.now()
    error = null
    const result = await autoUpdater.checkForUpdates()
    if (result?.updateInfo?.version && result.updateInfo.version !== app.getVersion()) available = result.updateInfo
    return status()
  }

  const download = async () => {
    initialize()
    if (!available) await check()
    if (downloaded) return { ok: true, downloaded: true, version: downloaded.version }
    await autoUpdater.downloadUpdate()
    return { ok: true, downloaded: false, version: available?.version }
  }

  const install = () => {
    if (!downloaded) return { ok: false, error: 'not-downloaded', message: '更新尚未下载完成。' }
    onInstall()
    setImmediate(() => autoUpdater.quitAndInstall(false, true))
    return { ok: true, handedOff: true, version: downloaded.version }
  }

  const startPolling = () => {
    if (!initialize() || timer) return
    setTimeoutFn(() => void check().catch(() => undefined), 30_000)
    timer = setIntervalFn(() => void check().catch(() => undefined), 6 * 60 * 60 * 1000)
  }

  return { check, download, initialize, install, startPolling, status }
}

module.exports = { createReleaseUpdater }
