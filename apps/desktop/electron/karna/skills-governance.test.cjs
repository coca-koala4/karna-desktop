'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-skills-governance-'))
const userRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-skills-user-'))
process.env.KARNA_DESKTOP_DATA_DIR = dataRoot
process.env.KARNA_DATA_DIR = dataRoot
process.env.USERPROFILE = userRoot

const adapter = require('../karna-adapter.cjs')

test('skill inventory exposes source, dependencies, platforms, install state, and recent use', async () => {
  try {
    const initial = await adapter.handleKarnaApiRequest({ path: '/api/skills', method: 'GET' })
    const catalog = await adapter.handleKarnaApiRequest({ path: '/api/skills/catalog', method: 'GET' })
    assert.equal(catalog.ok, true)
    assert.ok(catalog.diagnostics.logicalCount >= 400)
    assert.ok(catalog.diagnostics.sourceCount >= catalog.diagnostics.logicalCount)
    assert.ok(catalog.skills.some(skill => skill.name === 'adopt' && String(skill.path).includes('.claude')))
    const appleNotes = initial.find(skill => skill.name === 'apple-notes')

    assert.equal(appleNotes.source, 'community')
    assert.equal(appleNotes.installed, true)
    assert.ok(appleNotes.dependencies.includes('memo'))
    assert.ok(appleNotes.platforms.includes('macos'))
    assert.equal(appleNotes.lastUsed, null)

    const detail = await adapter.handleKarnaApiRequest({ path: '/api/skills/apple-notes', method: 'GET' })
    assert.equal(detail.ok, true)
    assert.match(detail.content, /Manage Apple Notes/)

    const refreshed = await adapter.handleKarnaApiRequest({ path: '/api/skills', method: 'GET' })
    assert.ok(refreshed.find(skill => skill.name === 'apple-notes').lastUsed > 0)

    const created = await adapter.handleKarnaApiRequest({
      path: '/api/skills/create',
      method: 'POST',
      body: { name: 'local-test-skill', description: 'Local test skill' }
    })
    assert.equal(created.ok, true)

    const withLocal = await adapter.handleKarnaApiRequest({ path: '/api/skills', method: 'GET' })
    const localSkill = withLocal.find(skill => skill.name === 'local-test-skill')
    assert.equal(localSkill.source, 'local')
    assert.equal(localSkill.installed, true)

    const uninstalled = await adapter.handleKarnaApiRequest({
      path: '/api/skills/uninstall',
      method: 'POST',
      body: { name: 'local-test-skill' }
    })
    assert.equal(uninstalled.ok, true)
    assert.equal(uninstalled.installed, false)

    const afterUninstall = await adapter.handleKarnaApiRequest({ path: '/api/skills', method: 'GET' })
    const disabledLocal = afterUninstall.find(skill => skill.name === 'local-test-skill')
    assert.equal(disabledLocal.installed, false)
    assert.equal(disabledLocal.enabled, false)

    const reinstalled = await adapter.handleKarnaApiRequest({
      path: '/api/skills/install',
      method: 'POST',
      body: { name: 'local-test-skill' }
    })
    assert.equal(reinstalled.ok, true)
    assert.equal(reinstalled.installed, true)

    const afterInstall = await adapter.handleKarnaApiRequest({ path: '/api/skills', method: 'GET' })
    assert.equal(afterInstall.find(skill => skill.name === 'local-test-skill').installed, true)
  } finally {
    adapter.stopKarnaAdapter()
    fs.rmSync(dataRoot, { force: true, recursive: true })
    fs.rmSync(userRoot, { force: true, recursive: true })
  }
})
