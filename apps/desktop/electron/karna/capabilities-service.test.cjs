'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { createCapabilitiesService } = require('./capabilities-service.cjs')

function makeMemoryStore() {
  const state = new Map()

  return {
    readJsonState: (filename, fallback) => state.has(filename) ? JSON.parse(JSON.stringify(state.get(filename))) : JSON.parse(JSON.stringify(fallback)),
    writeJsonState: (filename, data) => {
      state.set(filename, JSON.parse(JSON.stringify(data)))

      return filename
    }
  }
}

test('capabilities service scans plugins and manages toolset/plugin state', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-capabilities-'))
  const pluginDir = path.join(home, '.codex', 'plugins', 'cache', 'demo-plugin')
  const memory = makeMemoryStore()

  fs.mkdirSync(pluginDir, { recursive: true })
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ id: 'demo', name: 'Demo Plugin', version: '1.2.3', description: 'Demo' }), 'utf8')

  const service = createCapabilitiesService({
    env: { USERPROFILE: home },
    fs,
    path,
    notConfigured: (capability, error, extra = {}) => ({ ok: false, capability, error, ...extra }),
    rememberLog: () => {},
    listMcpServers: () => [{ name: 'karna-writer' }],
    listSkills: () => [{ name: 'writer-outline', enabled: true }],
    listArtifacts: () => [{ id: 'art-1', type: 'markdown' }],
    ...memory
  })

  try {
    const plugins = service.scanPlugins()

    assert.equal(plugins.length, 1)
    assert.equal(plugins[0].id, 'demo')
    assert.equal(plugins[0].enabled, true)

    assert.equal(service.setPluginEnabled('demo', false).enabled, false)
    assert.equal(service.scanPlugins()[0].enabled, false)

    const rows = service.toolsetRows()

    assert.deepEqual(rows.map(row => row.name), ['mcp', 'skills', 'plugins', 'artifacts'])
    assert.equal(rows.find(row => row.name === 'plugins').configured, true)

    assert.equal(service.setToolsetEnabled('skills', false).enabled, false)
    assert.equal(service.toolsetRows().find(row => row.name === 'skills').enabled, false)

    assert.equal(service.setToolsetProvider('mcp', 'local').provider, 'local')
    assert.equal(service.toolsetConfig('mcp').active_provider, 'local')
    assert.equal(service.toolsetConfig('missing').ok, false)
  } finally {
    fs.rmSync(home, { force: true, recursive: true })
  }
})
