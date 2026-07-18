'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const appRoot = path.resolve(__dirname, '..')
const catalogFile = path.join(appRoot, 'src', 'app', 'karna-workshop', 'built-in-mcps.ts')
const iconRoot = path.join(appRoot, 'public', 'connector-icons', 'mcp')
const manifestFile = path.join(iconRoot, 'manifest.json')
const source = fs.readFileSync(catalogFile, 'utf8')
const ids = [...source.matchAll(/\n\s+id: '([^']+)'/g)].map(match => match[1])
const iconPaths = [...source.matchAll(/\n\s+iconImage: '([^']+)'/g)].map(match => match[1])
const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
const problems = []

if (ids.length < 40) problems.push(`catalog unexpectedly small: ${ids.length}`)
if (new Set(ids).size !== ids.length) problems.push('catalog contains duplicate ids')
if (iconPaths.length !== ids.length) problems.push(`every connector needs an icon: ${iconPaths.length}/${ids.length}`)
if (manifest.items.length !== ids.length) problems.push(`manifest/catalog count mismatch: ${manifest.items.length}/${ids.length}`)

const manifestById = new Map(manifest.items.map(item => [item.id, item]))
for (const id of ids) {
  const item = manifestById.get(id)
  if (!item) {
    problems.push(`${id}: missing icon manifest entry`)
    continue
  }
  if (!String(item.status).startsWith('official')) problems.push(`${id}: icon is not verified official`)
  if (!item.pageUrl || !item.assetUrl) problems.push(`${id}: source URL missing`)
  const expectedUiPath = `./connector-icons/mcp/${path.basename(item.localPath)}`
  if (!source.includes(`id: '${id}'`) || !source.includes(`iconImage: '${expectedUiPath}'`)) {
    problems.push(`${id}: catalog icon path is not local/relative`)
  }
  const file = path.join(iconRoot, path.basename(item.localPath))
  if (!fs.existsSync(file)) {
    problems.push(`${id}: local icon file missing`)
    continue
  }
  const data = fs.readFileSync(file)
  const sha256 = crypto.createHash('sha256').update(data).digest('hex')
  if (sha256 !== item.sha256) problems.push(`${id}: SHA-256 mismatch`)
  const raster = data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const svg = data.subarray(0, 512).toString('utf8').includes('<svg')
  if (!raster && !svg) problems.push(`${id}: unsupported or mislabeled icon content`)
}

if (/iconImage: '\/connector-icons\//.test(source)) problems.push('absolute connector icon URL would break under file://')
if (/一键授权/.test(source)) problems.push('catalog must not describe a website link as one-click authorization')

if (problems.length) {
  console.error(`[mcp-icons] blocked by ${problems.length} issue(s):`)
  problems.forEach(problem => console.error(`  - ${problem}`))
  process.exit(1)
}

console.log(`[mcp-icons] verified ${ids.length} official local icons with source URLs and SHA-256`)
