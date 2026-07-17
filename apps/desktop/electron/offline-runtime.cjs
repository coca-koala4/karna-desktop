'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
let WorkerThreads = null
try {
  WorkerThreads = require('node:worker_threads')
} catch {
  WorkerThreads = null
}

function sha256(file) {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(file))
  return hash.digest('hex')
}

function readManifest(bundleRoot) {
  const file = path.join(bundleRoot, 'runtime-manifest.json')
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.files) || !manifest.desktopVersion) {
    throw new Error('离线运行时清单无效。请重新下载安装器。')
  }
  return manifest
}

function verifyBundle(bundleRoot, expectedVersion) {
  const manifest = readManifest(bundleRoot)
  if (String(manifest.desktopVersion) !== String(expectedVersion)) {
    throw new Error(`离线运行时版本不匹配：需要 ${expectedVersion}，实际为 ${manifest.desktopVersion}`)
  }
  for (const item of manifest.files) {
    const relative = String(item.path || '').replaceAll('\\', '/')
    if (!relative || relative.startsWith('/') || relative.includes('../')) throw new Error('离线运行时清单包含非法路径。')
    const file = path.join(bundleRoot, ...relative.split('/'))
    if (!fs.statSync(file).isFile() || sha256(file) !== item.sha256) {
      throw new Error(`离线运行时校验失败：${relative}`)
    }
  }
  return manifest
}

function installedMarkerIsCurrent({ bundleRoot, finalRoot, runtimeHome, version }) {
  try {
    const manifestSha256 = sha256(path.join(bundleRoot, 'runtime-manifest.json'))
    const marker = path.join(finalRoot, '.karna-offline-runtime.json')
    const current = JSON.parse(fs.readFileSync(marker, 'utf8'))
    const activeVersion = fs.readFileSync(path.join(runtimeHome, 'active-version'), 'utf8').trim()
    return current.manifestSha256 === manifestSha256 && String(current.version) === String(version) && activeVersion === String(version)
  } catch {
    return false
  }
}

function installOfflineRuntime({ bundleRoot, runtimeHome, version }) {
  const versionsRoot = path.join(runtimeHome, 'versions')
  const finalRoot = path.join(versionsRoot, String(version))

  // Startup fast path: the runtime was fully verified before this marker was
  // written. Re-hashing all bundled files on every launch blocked Electron's
  // main thread at 28% and made the window look frozen.
  if (installedMarkerIsCurrent({ bundleRoot, finalRoot, runtimeHome, version })) {
    return finalRoot
  }

  const manifest = verifyBundle(bundleRoot, version)
  fs.mkdirSync(versionsRoot, { recursive: true })
  const staging = path.join(versionsRoot, `.${version}.staging-${process.pid}-${Date.now()}`)
  fs.rmSync(staging, { recursive: true, force: true })
  fs.cpSync(bundleRoot, staging, { recursive: true, dereference: false, errorOnExist: false })
  fs.writeFileSync(
    path.join(staging, '.karna-offline-runtime.json'),
    JSON.stringify({ schemaVersion: 1, version, manifestSha256: sha256(path.join(bundleRoot, 'runtime-manifest.json')) }, null, 2)
  )
  fs.rmSync(finalRoot, { recursive: true, force: true })
  fs.renameSync(staging, finalRoot)
  fs.writeFileSync(path.join(runtimeHome, 'active-version'), `${version}\n`, 'utf8')
  for (const entry of fs.readdirSync(versionsRoot, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name !== String(version) && !entry.name.startsWith('.')) {
      fs.rmSync(path.join(versionsRoot, entry.name), { recursive: true, force: true })
    }
  }
  return finalRoot
}

function installOfflineRuntimeAsync(options) {
  if (!WorkerThreads?.Worker || WorkerThreads.isMainThread === false) {
    return Promise.resolve().then(() => installOfflineRuntime(options))
  }
  return new Promise((resolve, reject) => {
    const worker = new WorkerThreads.Worker(__filename, { workerData: options })
    let settled = false
    const finish = (fn, value) => {
      if (settled) return
      settled = true
      fn(value)
    }
    worker.once('message', message => {
      if (message?.ok) finish(resolve, message.installed)
      else finish(reject, new Error(message?.error || '离线运行时安装失败。'))
    })
    worker.once('error', error => finish(reject, error))
    worker.once('exit', code => {
      if (code !== 0) finish(reject, new Error(`离线运行时安装进程退出：${code}`))
    })
  })
}

if (WorkerThreads && WorkerThreads.isMainThread === false) {
  try {
    const installed = installOfflineRuntime(WorkerThreads.workerData)
    WorkerThreads.parentPort.postMessage({ ok: true, installed })
  } catch (error) {
    WorkerThreads.parentPort.postMessage({ ok: false, error: error?.message || String(error) })
  }
}

module.exports = { installOfflineRuntime, installOfflineRuntimeAsync, readManifest, verifyBundle }
