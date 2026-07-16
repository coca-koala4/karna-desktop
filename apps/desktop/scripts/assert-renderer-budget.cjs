const fs = require('node:fs')
const path = require('node:path')

const assetsDir = path.join(__dirname, '..', 'dist', 'assets')
const INITIAL_RENDERER_LIMIT = 4 * 1024 * 1024

const entries = fs.readdirSync(assetsDir, { withFileTypes: true })
  .filter(entry => entry.isFile() && /^index-[\w-]+\.js$/.test(entry.name))
  .map(entry => ({ name: entry.name, size: fs.statSync(path.join(assetsDir, entry.name)).size }))

if (entries.length !== 1) {
  throw new Error(`Expected one initial renderer bundle, found ${entries.length}: ${entries.map(entry => entry.name).join(', ')}`)
}

const [entry] = entries
if (entry.size > INITIAL_RENDERER_LIMIT) {
  throw new Error(`Initial renderer ${entry.name} is ${(entry.size / 1024 / 1024).toFixed(2)} MB; budget is ${(INITIAL_RENDERER_LIMIT / 1024 / 1024).toFixed(0)} MB.`)
}

console.log(`[renderer-budget] ${entry.name}: ${(entry.size / 1024 / 1024).toFixed(2)} MB <= ${(INITIAL_RENDERER_LIMIT / 1024 / 1024).toFixed(0)} MB`)
