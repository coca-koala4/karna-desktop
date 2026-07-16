const fs = require('fs')
const path = require('path')
const os = require('os')
const assert = require('assert')

const { createSessionLifecycleService } = require('./session-lifecycle-service.cjs')

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'karna-session-lifecycle-test-'))
}

function cleanupDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
}

function makeSession(id, opts = {}) {
  return {
    id,
    title: `Session ${id}`,
    created: Math.floor(Date.now() / 1000),
    updated: Math.floor(Date.now() / 1000),
    message_count: opts.message_count || 0,
    archived: false,
    source: 'tui',
    profile: opts.profile || 'default',
    cwd: opts.cwd || '',
    project_id: opts.project_id || null,
    writer_project_id: opts.writer_project_id || null,
    _lineage_root_id: opts.lineage_root_id || id,
    ...opts
  }
}

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  [PASS] ${name}`)
    passed++
  } catch (e) {
    console.log(`  [FAIL] ${name}: ${e.message}`)
    failed++
  }
}

console.log('\n=== Session Lifecycle Service Tests ===\n')

const tmpDir = makeTempDir()

// Setup mock stores
const sessions = new Map()
const sessionMessages = new Map()
let writerProjectsStore = { version: 1, active_project_id: '', projects: [] }

const service = createSessionLifecycleService({
  dataRoot: tmpDir,
  getSessionsMap: () => sessions,
  getSessionMessagesMap: () => sessionMessages,
  readWriterProjects: () => writerProjectsStore,
  writeWriterProjects: store => { writerProjectsStore = store },
  writerProjectDataPath: p => p.folder,
  log: () => {}
})

// --- Test 1: Delete single session ---
test('deleteLineage removes single session and its messages', () => {
  sessions.clear()
  sessionMessages.clear()
  sessions.set('s1', makeSession('s1'))
  sessionMessages.set('s1', [{ role: 'user', content: 'hello' }])

  const result = service.deleteLineage('s1')

  assert.strictEqual(result.ok, true)
  assert.ok(result.deleted_session_ids.includes('s1'))
  assert.strictEqual(sessions.has('s1'), false)
  assert.strictEqual(sessionMessages.has('s1'), false)
  assert.ok(result.mutation_id)
})

// --- Test 2: Delete removes entire lineage ---
test('deleteLineage removes all sessions in the same lineage (root + branches)', () => {
  sessions.clear()
  sessionMessages.clear()
  sessions.set('root', makeSession('root', { lineage_root_id: 'root' }))
  sessions.set('branch1', makeSession('branch1', { lineage_root_id: 'root', _lineage_root_id: 'root' }))
  sessions.set('branch2', makeSession('branch2', { lineage_root_id: 'root', _lineage_root_id: 'root' }))
  sessions.set('other', makeSession('other'))

  const result = service.deleteLineage('branch1')

  assert.strictEqual(result.deleted_session_ids.length, 3)
  assert.ok(result.deleted_session_ids.includes('root'))
  assert.ok(result.deleted_session_ids.includes('branch1'))
  assert.ok(result.deleted_session_ids.includes('branch2'))
  assert.ok(!result.deleted_session_ids.includes('other'))
  assert.strictEqual(sessions.has('other'), true)
})

// --- Test 3: Tombstone prevents resurrection ---
test('preventResurrection blocks deleted session IDs', () => {
  sessions.clear()
  sessions.set('s2', makeSession('s2'))
  service.deleteLineage('s2')

  assert.strictEqual(service.isTombstoned('s2'), true)
  assert.strictEqual(service.isTombstoned('nonexistent'), false)
  assert.strictEqual(service.preventResurrection('s2'), true)
})

// --- Test 4: Tombstone persists to disk ---
test('tombstones persist to disk and survive service restart', () => {
  sessions.clear()
  sessions.set('s3', makeSession('s3'))
  service.deleteLineage('s3')

  const service2 = createSessionLifecycleService({
    dataRoot: tmpDir,
    getSessionsMap: () => sessions,
    getSessionMessagesMap: () => sessionMessages,
    readWriterProjects: () => writerProjectsStore,
    writeWriterProjects: store => { writerProjectsStore = store },
    writerProjectDataPath: p => p.folder,
    log: () => {}
  })

  assert.strictEqual(service2.isTombstoned('s3'), true)
})

// --- Test 5: Archive lineage ---
test('archiveLineage archives entire lineage', () => {
  sessions.clear()
  sessions.set('root', makeSession('root', { lineage_root_id: 'root' }))
  sessions.set('branch1', makeSession('branch1', { _lineage_root_id: 'root' }))
  sessions.set('other', makeSession('other'))

  const result = service.archiveLineage('branch1', { archived: true })

  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.action, 'archived')
  assert.strictEqual(sessions.get('root').archived, true)
  assert.strictEqual(sessions.get('branch1').archived, true)
  assert.strictEqual(sessions.get('other').archived, false)
})

// --- Test 6: Unarchive lineage ---
test('archiveLineage can unarchive', () => {
  sessions.clear()
  sessions.set('root', makeSession('root', { archived: true }))
  sessions.set('branch1', makeSession('branch1', { _lineage_root_id: 'root', archived: true }))

  const result = service.archiveLineage('root', { archived: false })

  assert.strictEqual(result.action, 'unarchived')
  assert.strictEqual(sessions.get('root').archived, false)
  assert.strictEqual(sessions.get('branch1').archived, false)
})

// --- Test 7: filterSessionsByArchive ---
test('filterSessionsByArchive correctly filters archived sessions', () => {
  const list = [
    { id: 'a', archived: false },
    { id: 'b', archived: true },
    { id: 'c', archived: false }
  ]

  const default_ = service.filterSessionsByArchive(list)
  assert.strictEqual(default_.length, 2)
  assert.ok(default_.every(s => !s.archived))

  const all = service.filterSessionsByArchive(list, { includeArchived: true })
  assert.strictEqual(all.length, 3)

  const only = service.filterSessionsByArchive(list, { archivedOnly: true })
  assert.strictEqual(only.length, 1)
  assert.strictEqual(only[0].id, 'b')
})

// --- Test 8: filterTombstoned ---
test('filterTombstoned removes tombstoned sessions from list', () => {
  sessions.clear()
  sessions.set('keep', makeSession('keep'))
  sessions.set('dead', makeSession('dead'))
  service.deleteLineage('dead')

  const list = [{ id: 'keep' }, { id: 'dead' }, { id: 'new' }]
  const filtered = service.filterTombstoned(list)

  assert.strictEqual(filtered.length, 2)
  assert.ok(filtered.find(s => s.id === 'keep'))
  assert.ok(filtered.find(s => s.id === 'new'))
  assert.ok(!filtered.find(s => s.id === 'dead'))
})

// --- Test 9: Clear writer project references ---
test('deleteLineage clears writer project main_session_id and agent session refs', () => {
  sessions.clear()
  sessionMessages.clear()
  writerProjectsStore = {
    version: 1,
    active_project_id: 'p1',
    projects: [{
      id: 'p1',
      title: 'Test Project',
      folder: tmpDir,
      main_session_id: 'main-sess',
      session_ids: ['main-sess', 'other-sess'],
      agent_session_ids: { agent_1: 'main-sess', agent_2: 'other-sess' }
    }]
  }

  const agentFile = path.join(tmpDir, 'writer_agents.json')
  fs.writeFileSync(agentFile, JSON.stringify({
    version: 1,
    agents: [
      { id: 'agent_1', name: 'Agent 1', session_id: 'main-sess' },
      { id: 'agent_2', name: 'Agent 2', session_id: 'other-sess' }
    ]
  }))

  sessions.set('main-sess', makeSession('main-sess', { writer_project_id: 'p1' }))
  sessions.set('other-sess', makeSession('other-sess', { writer_project_id: 'p1' }))

  const result = service.deleteLineage('main-sess')

  assert.ok(result.cleared_project_ids.includes('p1'))
  const updatedProject = writerProjectsStore.projects.find(p => p.id === 'p1')
  assert.strictEqual(updatedProject.main_session_id, null)
  assert.ok(!updatedProject.session_ids.includes('main-sess'))
  assert.strictEqual(updatedProject.agent_session_ids.agent_1, undefined)

  const agentsData = JSON.parse(fs.readFileSync(agentFile, 'utf8'))
  const agent1 = agentsData.agents.find(a => a.id === 'agent_1')
  assert.strictEqual(agent1.session_id, null)
})

// --- Test 10: Integrity repair ---
test('runIntegrityRepair cleans up stale memory sessions that are tombstoned', () => {
  sessions.clear()
  sessions.set('alive', makeSession('alive'))
  sessions.set('dead', makeSession('dead'))
  service.deleteLineage('dead')
  sessions.set('dead', makeSession('dead'))

  const report = service.runIntegrityRepair()

  assert.strictEqual(sessions.has('dead'), false)
  assert.strictEqual(sessions.has('alive'), true)
  assert.ok(report.blocked_resurrections >= 1)
})

// --- Test 11: scope=single only deletes one session ---
test('deleteLineage with scope=single only deletes the specified session', () => {
  sessions.clear()
  sessions.set('root', makeSession('root'))
  sessions.set('branch1', makeSession('branch1', { _lineage_root_id: 'root' }))

  const result = service.deleteLineage('branch1', { scope: 'single' })

  assert.strictEqual(result.deleted_session_ids.length, 1)
  assert.strictEqual(result.scope, 'single')
  assert.ok(sessions.has('root'))
  assert.ok(!sessions.has('branch1'))
})

cleanupDir(tmpDir)

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`)
process.exit(failed > 0 ? 1 : 0)
