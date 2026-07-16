/* eslint-disable no-unused-vars, no-empty -- compatibility service tolerates unavailable local stores. */
'use strict'

function createSlashService({ fs, path, karnaPaths, storage }) {
  const commands = [
    { name: 'profile', description: 'Switch or manage profiles', args: '[name]' },
    { name: 'version', description: 'Show Karna version', args: '' },
    { name: 'new', description: 'Start a new conversation', args: '' },
    { name: 'help', description: 'Show available slash commands', args: '' }
  ]

  function listCommands() {
    try {
      if (karnaPaths && karnaPaths.slashCommandsFile) {
        const file = typeof karnaPaths.slashCommandsFile === 'function'
          ? karnaPaths.slashCommandsFile()
          : karnaPaths.slashCommandsFile
        const stored = storage.readJsonFile(file, null)
        if (Array.isArray(stored)) {
          return [...commands, ...stored]
        }
      }
    } catch {}
    return commands
  }

  function executeCommand(name, args) {
    return { ok: false, error: 'not implemented in skeleton' }
  }

  function registerCommand(cmd) {
    if (cmd && typeof cmd === 'object' && cmd.name) {
      commands.push(cmd)
    }
  }

  return { listCommands, executeCommand, registerCommand }
}

module.exports = { createSlashService }
