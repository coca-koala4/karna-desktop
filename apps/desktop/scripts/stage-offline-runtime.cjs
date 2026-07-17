'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const { shouldIncludeOfflineRuntimePath } = require('./offline-runtime-filter.cjs')

const appRoot = path.resolve(__dirname, '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'))
const source = process.env.KARNA_OFFLINE_RUNTIME_SOURCE && path.resolve(process.env.KARNA_OFFLINE_RUNTIME_SOURCE)
const target = path.join(appRoot, 'build', 'offline-runtime')

if (!source || !fs.existsSync(source)) {
  throw new Error(
    'KARNA_OFFLINE_RUNTIME_SOURCE is required for release packaging and must point to a prepared offline runtime. ' +
      'Online git clone/bootstrap is intentionally disabled.'
  )
}
if (!fs.existsSync(path.join(source, 'hermes-agent', 'hermes_cli'))) {
  throw new Error('Offline runtime source is missing hermes-agent/hermes_cli')
}

fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(target, { recursive: true })
const files = []

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name)
    const relative = path.relative(source, absolute).replaceAll('\\', '/')
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

walk(source)
files.sort((a, b) => a.path.localeCompare(b.path))
fs.writeFileSync(
  path.join(target, 'runtime-manifest.json'),
  JSON.stringify({ schemaVersion: 1, desktopVersion: packageJson.version, generatedAt: new Date().toISOString(), files }, null, 2) + '\n'
)
console.log(`[offline-runtime] staged ${files.length} files for Karna ${packageJson.version}`)
