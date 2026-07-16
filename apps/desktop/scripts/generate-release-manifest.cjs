'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const appRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(appRoot, '..', '..')
const out = path.join(appRoot, 'build', 'release-manifest.json')

function hashFile(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function inventory(relativeRoot, predicate = () => true) {
  const root = path.join(repoRoot, relativeRoot)
  const rows = []
  const pending = [root]
  while (pending.length) {
    const current = pending.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(full)
      else if (entry.isFile() && predicate(full)) {
        rows.push({ path: path.relative(root, full).replace(/\\/g, '/'), sha256: hashFile(full), size: fs.statSync(full).size })
      }
    }
  }
  return rows.sort((a, b) => a.path.localeCompare(b.path))
}

const workflows = JSON.parse(fs.readFileSync(path.join(repoRoot, 'karna-builtin', 'workflows', 'manifest.json'), 'utf8'))
const manifest = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  product: 'Karna',
  mcp: [{ id: 'karna-writer', transport: 'builtin' }],
  workflows: workflows.workflows,
  skills: inventory('karna-builtin/skills'),
  plugins: inventory('karna-builtin/plugins')
}

fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
console.log(`[release-manifest] ${manifest.skills.length} skill files, ${manifest.plugins.length} plugin files, ${manifest.workflows.length} workflows`)
