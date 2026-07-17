'use strict'

const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const desktopRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(desktopRoot, '..', '..')
const target = path.join(desktopRoot, 'build', 'offline-runtime-source', 'hermes-agent')
const venvPython = path.join(repoRoot, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
if (!fs.existsSync(venvPython)) throw new Error('Create the locked production .venv before preparing the offline runtime.')

const basePython = fs.realpathSync(execFileSync(venvPython, ['-c', 'import sys; print(sys.base_prefix)'], { encoding: 'utf8' }).trim())
if (!fs.existsSync(basePython)) throw new Error(`Python base runtime not found: ${basePython}`)

const denied = /(^|[\\/])(tests?|docs?|website|\.git|__pycache__|\.pytest_cache|\.mypy_cache|karna-data|logs?|sessions?|projects?)([\\/]|$)/i
function copyTree(source, destination) {
  fs.cpSync(source, destination, {
    recursive: true,
    dereference: true,
    filter: file => !denied.test(path.relative(source, file))
  })
}

fs.rmSync(path.dirname(target), { recursive: true, force: true })
fs.mkdirSync(target, { recursive: true })

for (const name of ['acp_adapter', 'acp_registry', 'agent', 'config', 'cron', 'gateway', 'hermes_cli', 'karna', 'locales', 'plugins', 'providers', 'tools', 'tui_gateway']) {
  const source = path.join(repoRoot, name)
  if (fs.existsSync(source)) copyTree(source, path.join(target, name))
}
for (const name of ['cli.py', 'hermes_bootstrap.py', 'hermes_constants.py', 'hermes_logging.py', 'hermes_state.py', 'hermes_time.py', 'mcp_serve.py', 'model_tools.py', 'run_agent.py', 'toolsets.py', 'toolset_distributions.py', 'trajectory_compressor.py', 'utils.py', 'pyproject.toml']) {
  const source = path.join(repoRoot, name)
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(target, name))
}

// A relocatable runtime is built from the complete CPython installation, then
// receives only the locked production site-packages from the build venv.
const runtimePython = path.join(target, 'venv')
copyTree(basePython, runtimePython)
const sourceSitePackages = path.join(repoRoot, '.venv', process.platform === 'win32' ? 'Lib/site-packages' : 'lib/python3.11/site-packages')
const targetSitePackages = path.join(runtimePython, process.platform === 'win32' ? 'Lib/site-packages' : 'lib/python3.11/site-packages')
fs.mkdirSync(targetSitePackages, { recursive: true })
copyTree(sourceSitePackages, targetSitePackages)

console.log(`[offline-runtime] prepared curated source at ${path.dirname(target)}`)
