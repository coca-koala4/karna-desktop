/* eslint-disable no-unused-vars -- service factory signature is intentionally uniform. */
'use strict'

function createMcpService({ fs, path, karnaPaths, storage }) {
  const mcpServersFile = typeof karnaPaths.mcpServersFile === 'function'
    ? karnaPaths.mcpServersFile()
    : karnaPaths.mcpServersFile

  function listMcpServers() {
    return storage.readJsonFile(mcpServersFile, {})
  }

  function getMcpStatus() {
    const servers = listMcpServers()
    let total = 0
    let configured = 0

    if (servers && typeof servers === 'object') {
      const values = Array.isArray(servers) ? servers : Object.values(servers)
      total = values.length
      configured = values.filter(s => {
        if (!s || typeof s !== 'object') return false
        return s.enabled !== false && (s.command || s.url)
      }).length
    }

    return { total, configured }
  }

  return { listMcpServers, getMcpStatus }
}

module.exports = { createMcpService }
