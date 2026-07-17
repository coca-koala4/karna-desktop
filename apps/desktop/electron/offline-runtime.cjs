'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

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
    if (!relative || relative.startsWith('/') || relative.includes('../')) throw new Error('离线运行时清单包含非法路径')
    const file = path.join(bundleRoot, ...relative.split('/'))
    if (!fs.statSync(file).isFile() || sha256(file) !== item.sha256) {
      throw new Error(`离线运行时校验失败：${relative}`)
    }
  }
  return manifest
}

function installOfflineRuntime({ bundleRoot, runtimeHome, version }) {
  const manifest = verifyBundle(bundleRoot, version)
  const versionsRoot = path.join(runtimeHome, 'versions')
  const finalRoot = path.join(versionsRoot, String(version))
  const marker = path.join(finalRoot, '.karna-offline-runtime.json')
  try {
    const current = JSON.parse(fs.readFileSync(marker, 'utf8'))
    if (current.manifestSha256 === sha256(path.join(bundleRoot, 'runtime-manifest.json'))) return finalRoot
  } catch {
    // Missing or stale installation: replace it atomically below.
  }

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

module.exports = { installOfflineRuntime, readManifest, verifyBundle }
