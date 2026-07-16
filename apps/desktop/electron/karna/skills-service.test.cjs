'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { createSkillsService } = require('./skills-service.cjs')

const writeSkill = (dir, name, description = name) => {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`, 'utf8')
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-skill-service-'))
  const repoRoot = path.join(root, 'repo')
  const userRoot = path.join(root, 'user')
  const state = new Map()
  const readJsonState = (name, fallback) => state.has(name) ? JSON.parse(JSON.stringify(state.get(name))) : JSON.parse(JSON.stringify(fallback))
  const writeJsonState = (name, value) => {
    state.set(name, JSON.parse(JSON.stringify(value)))
    return name
  }
  const service = createSkillsService({
    env: { USERPROFILE: userRoot },
    fs,
    notConfigured: (capability, error, extra = {}) => ({ ok: false, capability, error, ...extra }),
    path,
    readJsonState,
    rememberLog: () => {},
    repoRoot,
    skillI18n: {
      translateCategory: value => value,
      translateSkillDescription: (_name, value) => value
    },
    writeJsonState,
    writeInventoryState: writeJsonState
  })

  return { root, repoRoot, service, state, userRoot }
}

test('scanner includes allowlisted .claude/skills and excludes other hidden or generated directories', () => {
  const ctx = fixture()
  try {
    writeSkill(path.join(ctx.repoRoot, 'skills', 'normal'), 'normal')
    writeSkill(path.join(ctx.repoRoot, 'skills', 'imported', 'game', '.claude', 'skills', 'game-design'), 'game-design')
    writeSkill(path.join(ctx.repoRoot, 'skills', '.git', 'skills', 'secret'), 'secret')
    writeSkill(path.join(ctx.repoRoot, 'skills', '.disabled', 'removed'), 'removed')
    writeSkill(path.join(ctx.repoRoot, 'skills', 'node_modules', 'package-skill'), 'package-skill')

    const catalog = ctx.service.getSkillsCatalog()
    assert.deepEqual(catalog.skills.filter(row => row.available !== false).map(row => row.name).sort(), ['game-design', 'normal'])
    assert.equal(catalog.diagnostics.logicalCount, 2)
    assert.ok(catalog.diagnostics.excludedCount >= 3)
  } finally {
    fs.rmSync(ctx.root, { force: true, recursive: true })
  }
})

test('same-name sources keep stable ids and local source wins without discarding alternatives', () => {
  const ctx = fixture()
  try {
    writeSkill(path.join(ctx.repoRoot, 'skills', 'community', 'shared'), 'shared', 'community')
    writeSkill(path.join(ctx.userRoot, '.codex', 'skills', 'shared'), 'shared', 'local')

    const catalog = ctx.service.getSkillsCatalog()
    const shared = catalog.skills.find(row => row.name === 'shared')
    assert.equal(shared.source, 'local')
    assert.equal(shared.conflict, true)
    assert.equal(shared.sourceCount, 2)
    assert.equal(shared.sources.length, 2)
    assert.equal(new Set(shared.sources.map(source => source.id)).size, 2)
    assert.equal(catalog.diagnostics.sourceCount, 2)
    assert.equal(catalog.diagnostics.conflictCount, 1)
  } finally {
    fs.rmSync(ctx.root, { force: true, recursive: true })
  }
})

test('using a skill repeatedly only changes last_used and never shrinks the catalog', () => {
  const ctx = fixture()
  try {
    const skillDir = path.join(ctx.userRoot, '.codex', 'skills', 'reusable')
    writeSkill(skillDir, 'reusable')
    const before = ctx.service.scanSkills()
    const beforePath = before.find(row => row.name === 'reusable').path

    for (let index = 0; index < 100; index += 1) {
      assert.equal(ctx.service.readSkillByName('reusable').ok, true)
    }

    const after = ctx.service.scanSkills()
    assert.equal(after.length, before.length)
    assert.equal(after.find(row => row.name === 'reusable').path, beforePath)
    assert.equal(fs.existsSync(path.join(skillDir, 'SKILL.md')), true)
    assert.ok(after.find(row => row.name === 'reusable').lastUsed > 0)
  } finally {
    fs.rmSync(ctx.root, { force: true, recursive: true })
  }
})

test('a temporarily missing source is retained until it becomes available again', () => {
  const ctx = fixture()
  try {
    const skillDir = path.join(ctx.repoRoot, 'skills', 'temporary')
    const parkedDir = path.join(ctx.root, 'parked-temporary')
    writeSkill(skillDir, 'temporary')
    assert.equal(ctx.service.getSkillsCatalog().diagnostics.logicalCount, 1)

    fs.renameSync(skillDir, parkedDir)
    const degraded = ctx.service.getSkillsCatalog()
    const retained = degraded.skills.find(row => row.name === 'temporary')
    assert.equal(retained.missing, true)
    assert.equal(retained.available, false)
    assert.equal(degraded.diagnostics.driftDetected, true)
    assert.equal(degraded.diagnostics.unavailableCount, 1)

    fs.renameSync(parkedDir, skillDir)
    const restored = ctx.service.getSkillsCatalog()
    assert.equal(restored.skills.find(row => row.name === 'temporary').available, true)
    assert.equal(restored.diagnostics.unavailableCount, 0)
  } finally {
    fs.rmSync(ctx.root, { force: true, recursive: true })
  }
})

test('only explicit uninstall moves a local skill and install restores it', () => {
  const ctx = fixture()
  try {
    const skillDir = path.join(ctx.userRoot, '.codex', 'skills', 'local-only')
    writeSkill(skillDir, 'local-only')
    const row = ctx.service.scanSkills().find(skill => skill.name === 'local-only')

    const uninstalled = ctx.service.uninstallSkill(row.id)
    assert.equal(uninstalled.ok, true)
    assert.equal(uninstalled.installed, false)
    assert.equal(fs.existsSync(path.join(skillDir, 'SKILL.md')), false)

    const installed = ctx.service.installSkill(row.id)
    assert.equal(installed.ok, true)
    assert.equal(installed.installed, true)
    assert.equal(fs.existsSync(path.join(skillDir, 'SKILL.md')), true)
  } finally {
    fs.rmSync(ctx.root, { force: true, recursive: true })
  }
})
