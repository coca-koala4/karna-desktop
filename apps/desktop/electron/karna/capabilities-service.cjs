'use strict'

function normalizeStateMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function createCapabilitiesService({
  env = process.env,
  fs,
  notConfigured,
  path,
  readJsonState,
  rememberLog,
  writeJsonState,
  listMcpServers,
  listSkills,
  listArtifacts
}) {
  const readToolsetState = () => readJsonState('toolsets.json', {
    version: 1,
    enabled: { artifacts: true, mcp: true, plugins: true, skills: true },
    providers: {}
  })
  const writeToolsetState = state => writeJsonState('toolsets.json', {
    version: 1,
    enabled: normalizeStateMap(state.enabled),
    providers: normalizeStateMap(state.providers)
  })
  const readPluginState = () => readJsonState('plugins.json', { version: 1, enabled: {} })
  const writePluginState = state => writeJsonState('plugins.json', {
    version: 1,
    enabled: normalizeStateMap(state.enabled)
  })

  function scanPlugins() {
    const roots = [
      path.join(env.USERPROFILE || '', '.codex', 'plugins'),
      path.join(env.USERPROFILE || '', '.codex', 'plugins', 'cache')
    ]
    const state = readPluginState()
    const enabledMap = normalizeStateMap(state.enabled)
    const rows = []
    const seen = new Set()
    const walk = dir => {
      let entries = []

      try {
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }

      for (const entry of entries) {
        const full = path.join(dir, entry.name)

        if (entry.isDirectory()) {
          walk(full)
        }
        if (entry.isFile() && entry.name === 'plugin.json') {
          try {
            const manifest = JSON.parse(fs.readFileSync(full, 'utf8'))
            const id = String(manifest.id || manifest.name || path.basename(path.dirname(full))).trim()

            if (!id || seen.has(id)) {
              continue
            }

            seen.add(id)
            rows.push({
              id,
              name: manifest.name || id,
              version: manifest.version || '',
              path: full,
              root: path.dirname(full),
              description: manifest.description || '',
              enabled: enabledMap[id] !== false,
              manifest
            })
          } catch (err) {
            rememberLog(`Plugin manifest parse failed ${full}: ${err.message}`)
          }
        }
      }
    }

    for (const root of roots) {
      walk(root)
    }

    return rows.sort((a, b) => String(a.name).localeCompare(String(b.name)))
  }

  function setPluginEnabled(id, enabled) {
    const pluginId = String(id || '').trim()

    if (!pluginId) {
      return notConfigured('plugins', 'Missing plugin id.')
    }

    const row = scanPlugins().find(item => item.id === pluginId)

    if (!row) {
      return notConfigured('plugins', `Plugin not found: ${pluginId}`)
    }

    const state = readPluginState()

    state.enabled = normalizeStateMap(state.enabled)
    state.enabled[pluginId] = enabled !== false
    writePluginState(state)

    return { ok: true, id: pluginId, enabled: enabled !== false, path: row.path }
  }

  function toolsetRows() {
    const state = readToolsetState()
    const enabled = normalizeStateMap(state.enabled)
    const mcpServers = listMcpServers()
    const skills = listSkills()
    const plugins = scanPlugins()
    const artifacts = listArtifacts()

    return [
      { name: 'mcp', label: 'MCP 服务器', description: '读取本地 MCP 配置，显示连接状态和可用工具。', enabled: enabled.mcp !== false, configured: mcpServers.length > 0, tools: mcpServers.map(server => server.name).concat(['test_server', 'reload']) },
      { name: 'skills', label: 'Karna 技能', description: '扫描 Karna 内置和本地技能目录，支持启用、禁用和读取。', enabled: enabled.skills !== false, configured: skills.length > 0, tools: skills.filter(skill => skill.enabled).map(skill => skill.name) },
      { name: 'plugins', label: 'Karna 插件', description: '读取本地插件清单，显示启用状态。', enabled: enabled.plugins !== false, configured: plugins.length > 0, tools: plugins.filter(plugin => plugin.enabled).map(plugin => plugin.name) },
      { name: 'artifacts', label: '产物', description: '记录图片、文件、代码块和下载链接等真实产物。', enabled: enabled.artifacts !== false, configured: artifacts.length > 0, tools: artifacts.map(artifact => artifact.type || artifact.id) }
    ]
  }

  function toolsetConfig(name) {
    const state = readToolsetState()
    const providers = normalizeStateMap(state.providers)
    const row = toolsetRows().find(item => item.name === name)

    if (!row) {
      return { name, has_category: false, active_provider: null, providers: [], ok: false, capability: 'toolsets', error: `Unknown toolset: ${name}` }
    }

    return {
      name,
      has_category: true,
      active_provider: providers[name] || 'local',
      providers: [{ name: 'local', badge: 'Local', tag: row.configured ? 'configured' : 'not configured', env_vars: [], post_setup: null, requires_karna_auth: false, is_active: (providers[name] || 'local') === 'local' }]
    }
  }

  function setToolsetEnabled(name, enabled) {
    const state = readToolsetState()

    state.enabled = normalizeStateMap(state.enabled)
    state.enabled[name] = enabled !== false
    writeToolsetState(state)

    return { ok: true, name, enabled: enabled !== false }
  }

  function setToolsetProvider(name, provider) {
    const state = readToolsetState()

    state.providers = normalizeStateMap(state.providers)
    state.providers[name] = String(provider || 'local')
    writeToolsetState(state)

    return { ok: true, name, provider: state.providers[name] }
  }

  return {
    scanPlugins,
    setPluginEnabled,
    setToolsetEnabled,
    setToolsetProvider,
    toolsetConfig,
    toolsetRows
  }
}

module.exports = { createCapabilitiesService, normalizeStateMap }
