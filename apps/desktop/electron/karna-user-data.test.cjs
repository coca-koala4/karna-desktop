'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const {
  migrateLegacyRuntimeUserData,
  resolveKarnaAgentDataHome
} = require('./karna-user-data.cjs')

test('packaged agent state is stored under Electron userData, not the install runtime', () => {
  assert.equal(resolveKarnaAgentDataHome({
    env: { HERMES_HOME: 'D:\\old-hermes' },
    isPackaged: true,
    userDataPath: 'C:\\Users\\alice\\AppData\\Roaming\\Karna'
  }), 'C:\\Users\\alice\\AppData\\Roaming\\Karna\\agent-data')
})

test('legacy runtime migration preserves all user state and excludes replaceable runtime/cache', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-user-data-'))
  const legacy = path.join(root, 'install', 'runtime')
  const target = path.join(root, 'appdata', 'agent-data')
  fs.mkdirSync(path.join(legacy, 'sessions'), { recursive: true })
  fs.mkdirSync(path.join(legacy, 'skills', 'mine'), { recursive: true })
  fs.mkdirSync(path.join(legacy, 'versions', '1.1.1'), { recursive: true })
  fs.mkdirSync(path.join(legacy, 'cache'), { recursive: true })
  fs.writeFileSync(path.join(legacy, 'config.yaml'), 'model: deepseek\n')
  fs.writeFileSync(path.join(legacy, '.env'), 'DEEPSEEK_API_KEY=secret\n')
  fs.writeFileSync(path.join(legacy, 'sessions', 'one.json'), '{"id":1}')
  fs.writeFileSync(path.join(legacy, 'skills', 'mine', 'SKILL.md'), '# mine')
  fs.writeFileSync(path.join(legacy, 'state.db'), 'database')
  fs.writeFileSync(path.join(legacy, 'versions', '1.1.1', 'code.py'), 'code')
  fs.writeFileSync(path.join(legacy, 'cache', 'large.bin'), 'cache')

  const first = migrateLegacyRuntimeUserData({ legacyRuntimeHome: legacy, targetHome: target })
  assert.equal(first.files, 5)
  assert.equal(fs.readFileSync(path.join(target, 'config.yaml'), 'utf8'), 'model: deepseek\n')
  assert.equal(fs.readFileSync(path.join(target, 'sessions', 'one.json'), 'utf8'), '{"id":1}')
  assert.equal(fs.existsSync(path.join(target, 'versions')), false)
  assert.equal(fs.existsSync(path.join(target, 'cache')), false)

  fs.writeFileSync(path.join(target, 'config.yaml'), 'model: user-newer\n')
  const second = migrateLegacyRuntimeUserData({ legacyRuntimeHome: legacy, targetHome: target })
  assert.equal(second.files, 0)
  assert.equal(fs.readFileSync(path.join(target, 'config.yaml'), 'utf8'), 'model: user-newer\n')
  fs.rmSync(root, { recursive: true, force: true })
})

test('development keeps its explicitly selected home', () => {
  assert.equal(resolveKarnaAgentDataHome({
    env: { HERMES_HOME: 'D:\\HermesDev' },
    isPackaged: false,
    legacyHome: 'D:\\HermesDev'
  }), 'D:\\HermesDev')
})

test('migration covers every mutable agent data family used by Karna', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-user-families-'))
  const legacy = path.join(root, 'runtime')
  const target = path.join(root, 'userData', 'agent-data')
  const files = [
    'config.yaml', '.env', 'auth.json', 'state.db', 'projects.db', 'SOUL.md',
    'sessions/chat.json', 'memories/MEMORY.md', 'profiles/writer/config.yaml',
    'skills/custom/SKILL.md', 'plugins/custom/plugin.json', 'skill-bundles/mine.json',
    'mcp-installs/server/manifest.json', 'connector-workshop/custom.json',
    'cron/jobs.json', 'hooks/pre-tool.sh', 'pairing/devices.json',
    'pets/custom.json', 'skins/custom.json', 'shared/oauth.json',
    'sandboxes/index.json', 'checkpoints/session.json', 'backups/manual.zip'
  ]
  for (const relative of files) {
    const file = path.join(legacy, relative)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, relative)
  }

  migrateLegacyRuntimeUserData({ legacyRuntimeHome: legacy, targetHome: target })
  for (const relative of files) {
    assert.equal(fs.existsSync(path.join(target, relative)), true, `${relative} should survive migration`)
  }
  fs.rmSync(root, { recursive: true, force: true })
})

test('NSIS optional plugin cleanup includes the stable agent-data stores', () => {
  const installer = fs.readFileSync(path.join(__dirname, '..', 'assets', 'installer.nsh'), 'utf8')
  assert.match(installer, /agent-data\\plugins/)
  assert.match(installer, /agent-data\\mcp-installs/)
  assert.match(installer, /agent-data\\skill-bundles/)
  assert.match(installer, /karna-data\\user-skills/)
})

test('NSIS update hook migrates data before electron-builder removes the old install', {
  skip: process.platform !== 'win32'
}, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-nsis-migration-'))
  try {
    const legacy = path.join(root, 'install', 'runtime')
    const target = path.join(root, 'appdata', 'agent-data')
    fs.mkdirSync(path.join(legacy, 'sessions'), { recursive: true })
    fs.mkdirSync(path.join(legacy, 'versions', '1.1.1'), { recursive: true })
    fs.mkdirSync(target, { recursive: true })
    fs.writeFileSync(path.join(legacy, 'config.yaml'), 'model: old\n')
    fs.writeFileSync(path.join(legacy, '.env'), 'DEEPSEEK_API_KEY=fake-test-value\n')
    fs.writeFileSync(path.join(legacy, 'sessions', 'one.json'), '{}')
    fs.writeFileSync(path.join(legacy, 'versions', '1.1.1', 'code.py'), 'code')
    fs.writeFileSync(path.join(target, 'config.yaml'), 'model: newer\n')

    const script = path.join(__dirname, '..', 'assets', 'migrate-user-data.ps1')
    const result = spawnSync('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', script, '-LegacyRoot', legacy, '-TargetRoot', target
    ], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr || result.stdout)
    assert.equal(fs.readFileSync(path.join(target, 'config.yaml'), 'utf8'), 'model: newer\n')
    assert.equal(fs.existsSync(path.join(target, '.env')), true)
    assert.equal(fs.existsSync(path.join(target, 'sessions', 'one.json')), true)
    assert.equal(fs.existsSync(path.join(target, 'versions')), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
