'use strict'

const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')

const DESKTOP_ROOT = path.resolve(__dirname, '..')
const FLOW_STUDIO_ROOT = path.resolve(DESKTOP_ROOT, '..', '..', '..', 'karna-flow-studio')
const FLOW_STUDIO_DIST = path.join(FLOW_STUDIO_ROOT, 'dist')
const FLOW_STUDIO_SERVER_DIST = path.join(FLOW_STUDIO_DIST, 'server')
const DESKTOP_PUBLIC_DIR = path.join(DESKTOP_ROOT, 'public', 'karna-flow-studio')
const DESKTOP_ELECTRON_SERVER_DIR = path.join(DESKTOP_ROOT, 'electron', 'flow-studio-server')
const MANIFEST_PATH = path.join(DESKTOP_PUBLIC_DIR, 'sync-manifest.json')

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgMagenta: '\x1b[45m'
}

function log(level, message) {
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  let color = COLORS.white
  let prefix = 'INFO'

  switch (level) {
    case 'start':
      color = COLORS.bgGreen + COLORS.bright
      prefix = 'SYNC'
      break
    case 'success':
      color = COLORS.green
      prefix = ' OK '
      break
    case 'warn':
      color = COLORS.yellow
      prefix = 'WARN'
      break
    case 'error':
      color = COLORS.red + COLORS.bright
      prefix = 'ERR '
      break
    case 'info':
      color = COLORS.cyan
      prefix = 'INFO'
      break
    case 'check':
      color = COLORS.magenta
      prefix = 'CHK'
      break
  }

  console.log(`${COLORS.dim}[${timestamp}]${COLORS.reset} ${color}[${prefix}]${COLORS.reset} ${message}`)
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function copyDirSync(src, dest) {
  const files = []
  const stats = []

  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }

  const entries = fs.readdirSync(src, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)

    if (entry.isDirectory()) {
      const subFiles = copyDirSync(srcPath, destPath)
      files.push(...subFiles.files)
      stats.push(...subFiles.stats)
    } else {
      fs.copyFileSync(srcPath, destPath)
      const stat = fs.statSync(srcPath)
      const hash = crypto.createHash('sha256')
      hash.update(fs.readFileSync(srcPath))
      files.push({
        path: path.relative(dest, destPath),
        size: stat.size,
        sha256: hash.digest('hex')
      })
      stats.push(stat.size)
    }
  }

  return { files, totalSize: stats.reduce((a, b) => a + b, 0) }
}

function verifyIntegrity(dir, expectedFiles) {
  const issues = []

  for (const file of expectedFiles) {
    const filePath = path.join(dir, file.path)
    if (!fs.existsSync(filePath)) {
      issues.push({ type: 'missing', path: file.path })
      continue
    }

    const stat = fs.statSync(filePath)
    if (stat.size !== file.size) {
      issues.push({ type: 'size_mismatch', path: file.path, expected: file.size, actual: stat.size })
      continue
    }

    const hash = crypto.createHash('sha256')
    hash.update(fs.readFileSync(filePath))
    const actualHash = hash.digest('hex')
    if (actualHash !== file.sha256) {
      issues.push({ type: 'hash_mismatch', path: file.path, expected: file.sha256, actual: actualHash })
    }
  }

  return issues
}

function loadFlowStudioPackage() {
  const pkgPath = path.join(FLOW_STUDIO_ROOT, 'frontend', 'package.json')
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
    return pkg.version || '1.0.0'
  } catch {
    return '1.0.0'
  }
}

function main() {
  const startTime = Date.now()

  console.log()
  console.log(`${COLORS.bgMagenta}${COLORS.bright}                                                              ${COLORS.reset}`)
  console.log(`${COLORS.bgMagenta}${COLORS.bright}       Karna Flow Studio - Desktop Sync Script                ${COLORS.reset}`)
  console.log(`${COLORS.bgMagenta}${COLORS.bright}                                                              ${COLORS.reset}`)
  console.log()

  log('start', 'Starting Flow Studio sync...')
  log('info', `Flow Studio root: ${FLOW_STUDIO_ROOT}`)
  log('info', `Desktop root: ${DESKTOP_ROOT}`)
  console.log()

  try {
    if (!fs.existsSync(FLOW_STUDIO_DIST)) {
      log('error', 'Flow Studio dist directory not found. Run build first.')
      log('info', `Expected: ${FLOW_STUDIO_DIST}`)
      console.log()
      process.exit(1)
    }

    log('info', 'Syncing frontend assets...')
    const frontendResult = copyDirSync(FLOW_STUDIO_DIST, DESKTOP_PUBLIC_DIR)
    log('success', `Frontend synced: ${frontendResult.files.length} files, ${formatSize(frontendResult.totalSize)}`)

    log('check', 'Verifying frontend integrity...')
    const frontendIssues = verifyIntegrity(DESKTOP_PUBLIC_DIR, frontendResult.files)
    if (frontendIssues.length > 0) {
      log('error', `Frontend integrity check failed: ${frontendIssues.length} issues`)
      for (const issue of frontendIssues) {
        log('error', `  ${issue.type}: ${issue.path}`)
      }
      process.exit(1)
    }
    log('success', 'Frontend integrity verified')
    console.log()

    let serverResult = { files: [], totalSize: 0 }
    if (fs.existsSync(FLOW_STUDIO_SERVER_DIST)) {
      log('info', 'Syncing server files...')
      serverResult = copyDirSync(FLOW_STUDIO_SERVER_DIST, DESKTOP_ELECTRON_SERVER_DIR)
      log('success', `Server synced: ${serverResult.files.length} files, ${formatSize(serverResult.totalSize)}`)

      log('check', 'Verifying server integrity...')
      const serverIssues = verifyIntegrity(DESKTOP_ELECTRON_SERVER_DIR, serverResult.files)
      if (serverIssues.length > 0) {
        log('error', `Server integrity check failed: ${serverIssues.length} issues`)
        for (const issue of serverIssues) {
          log('error', `  ${issue.type}: ${issue.path}`)
        }
        process.exit(1)
      }
      log('success', 'Server integrity verified')
    } else {
      log('warn', 'Server dist not found, skipping server sync')
    }
    console.log()

    const version = loadFlowStudioPackage()
    const manifest = {
      schemaVersion: 1,
      version,
      syncedAt: new Date().toISOString(),
      frontend: {
        fileCount: frontendResult.files.length,
        totalSize: frontendResult.totalSize,
        files: frontendResult.files
      },
      server: {
        fileCount: serverResult.files.length,
        totalSize: serverResult.totalSize,
        files: serverResult.files
      }
    }

    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')
    log('success', `Sync manifest written: ${path.relative(DESKTOP_ROOT, MANIFEST_PATH)}`)
    console.log()

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    const totalFiles = frontendResult.files.length + serverResult.files.length
    const totalSize = frontendResult.totalSize + serverResult.totalSize

    console.log(`${COLORS.bgGreen}${COLORS.bright}                                                              ${COLORS.reset}`)
    console.log(`${COLORS.bgGreen}${COLORS.bright}                      Sync Complete                           ${COLORS.reset}`)
    console.log(`${COLORS.bgGreen}${COLORS.bright}                                                              ${COLORS.reset}`)
    console.log()
    log('success', `Version: ${version}`)
    log('success', `Total: ${totalFiles} files, ${formatSize(totalSize)}`)
    log('success', `Duration: ${duration}s`)
    console.log()
  } catch (err) {
    console.log()
    log('error', 'Sync failed:')
    console.error(err.message)
    if (err.stack) {
      console.error(err.stack)
    }
    console.log()
    process.exit(1)
  }
}

main()
