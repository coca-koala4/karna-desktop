'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const { shouldIncludeOfflineRuntimePath } = require('./offline-runtime-filter.cjs')

const appRoot = path.resolve(__dirname, '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'))
const target = path.join(appRoot, 'build', 'offline-runtime')

// Try multiple possible source locations
const possibleSources = [
  process.env.KARNA_OFFLINE_RUNTIME_SOURCE && path.resolve(process.env.KARNA_OFFLINE_RUNTIME_SOURCE),
  path.join(appRoot, 'release2', 'win-unpacked', 'resources', 'offline-runtime'),
  path.join(appRoot, 'release-new', 'win-unpacked', 'resources', 'offline-runtime'),
  path.join(appRoot, 'build', 'offline-runtime-cache')
].filter(Boolean)

let source = null
for (const candidate of possibleSources) {
  if (candidate && fs.existsSync(candidate)) {
    if (fs.existsSync(path.join(candidate, 'karna-runtime', 'hermes_cli')) ||
        fs.existsSync(path.join(candidate, 'hermes-agent', 'hermes_cli'))) {
      source = candidate
      break
    }
  }
}

if (!source) {
  console.warn('[offline-runtime] WARNING: No pre-built offline runtime found. Building without offline runtime for development/testing.')
  console.warn('[offline-runtime] Set KARNA_OFFLINE_RUNTIME_SOURCE for production builds.')
  fs.mkdirSync(target, { recursive: true })
  fs.writeFileSync(
    path.join(target, 'runtime-manifest.json'),
    JSON.stringify({ schemaVersion: 1, desktopVersion: packageJson.version, generatedAt: new Date().toISOString(), files: [], note: 'Dev build - no offline runtime' }, null, 2) + '\n'
  )
  process.exit(0)
}

fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(target, { recursive: true })
const files = []

let actualSource = source
const needsRename = fs.existsSync(path.join(source, 'hermes-agent', 'hermes_cli')) &&
                    !fs.existsSync(path.join(source, 'karna-runtime', 'hermes_cli'))

if (needsRename) {
  console.log('[offline-runtime] migrating hermes-agent -> karna-runtime')
  function copyDirRecursive(srcDir, dstDir) {
    fs.mkdirSync(dstDir, { recursive: true })
    for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
      const srcFile = path.join(srcDir, entry.name)
      const dstFile = path.join(dstDir, entry.name)
      if (entry.isDirectory()) {
        copyDirRecursive(srcFile, dstFile)
      } else if (entry.isFile()) {
        fs.copyFileSync(srcFile, dstFile)
      }
    }
  }
  const tempDir = path.join(appRoot, 'build', 'offline-runtime-temp')
  fs.rmSync(tempDir, { recursive: true, force: true })
  fs.mkdirSync(tempDir, { recursive: true })
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const srcFile = path.join(source, entry.name)
    const dstName = entry.name === 'hermes-agent' ? 'karna-runtime' : entry.name
    const dstFile = path.join(tempDir, dstName)
    if (entry.isDirectory()) {
      copyDirRecursive(srcFile, dstFile)
    } else if (entry.isFile()) {
      fs.copyFileSync(srcFile, dstFile)
    }
  }
  actualSource = tempDir
}

function patchRuntimeBranding(root) {
  const textFile = /\.(py|json|toml|md|txt|yml|yaml|cfg|ini)$/i
  const zh = {
    runtime: '兼容运行时',
    welcome: '欢迎使用 Karna',
    ui: 'Karna 界面',
    mcpBlocked: '当前权限模式不允许调用 MCP 工具。请在 Karna 底部权限模式或设置中切换到"电脑授权模式"后重试。',
    shellBlocked: '当前权限模式不允许执行终端命令。请在 Karna 底部权限模式或设置中切换到"电脑授权模式"后重试。',
    infoBlocked: '当前权限模式不允许读取系统信息。请在 Karna 底部权限模式或设置中切换到"电脑授权模式"后重试。',
    projectOnly: '当前处于"仅当前项目"模式，禁止访问系统级资源。请在 Karna 的权限模式中切换到"电脑授权模式"后重试。'
  }
  const replacements = [
    [/Hermes Agent/g, 'Karna Agent'],
    [/Hermes CLI/g, `Karna ${zh.runtime}`],
    [/Hermes is/g, 'Karna is'],
    [/Welcome to Hermes/g, zh.welcome],
    [/Hermes v/g, 'Karna v'],
    [/⚕ Hermes/g, 'Karna'],
    [/\(Hermes Agent\)/g, '(Karna Agent)'],
    [/Hermes 界面/g, zh.ui],
    [/Hermes/g, 'Karna']
  ]
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.isFile() && textFile.test(file)) {
        let text = fs.readFileSync(file, 'utf8')
        const before = text
        for (const [from, to] of replacements) text = text.replace(from, to)
        if (text !== before) fs.writeFileSync(file, text, 'utf8')
      }
    }
  }
  visit(root)
}

function collectManifestFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name)
    const relative = path.relative(target, absolute).replaceAll('\\', '/')
    if (!shouldIncludeOfflineRuntimePath(relative)) continue
    if (entry.isDirectory()) collectManifestFiles(absolute)
    else if (entry.isFile()) {
      const stat = fs.statSync(absolute)
      files.push({ path: relative, size: stat.size, sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') })
    }
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name)
    const relative = path.relative(actualSource, absolute).replaceAll('\\', '/')
    if (!shouldIncludeOfflineRuntimePath(relative)) continue
    if (entry.isSymbolicLink()) throw new Error(`Offline runtime may not contain symlinks: ${relative}`)
    if (entry.isDirectory()) walk(absolute)
    else if (entry.isFile()) {
      const stat = fs.statSync(absolute)
      const destination = path.join(target, ...relative.split('/'))
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(absolute, destination)
      files.push({
        path: relative,
        size: stat.size,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')
      })
    }
  }
}

walk(actualSource)
patchRuntimeBranding(target)
files.length = 0
collectManifestFiles(target)
files.sort((a, b) => a.path.localeCompare(b.path))
fs.writeFileSync(
  path.join(target, 'runtime-manifest.json'),
  JSON.stringify({ schemaVersion: 1, desktopVersion: packageJson.version, generatedAt: new Date().toISOString(), files }, null, 2) + '\n'
)

if (needsRename) {
  const tempDir = path.join(appRoot, 'build', 'offline-runtime-temp')
  fs.rmSync(tempDir, { recursive: true, force: true })
}

console.log(`[offline-runtime] staged ${files.length} files for Karna ${packageJson.version}`)
