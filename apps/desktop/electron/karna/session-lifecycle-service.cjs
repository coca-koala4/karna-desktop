const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const TOMBSTONE_FILENAME = 'session_tombstones.json'
const SESSION_INDEX_FILENAME = 'session_index.json'

function generateMutationId() {
  return `mut_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`
}

function nowIso() {
  return new Date().toISOString()
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str)
  } catch {
    return fallback
  }
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    const raw = fs.readFileSync(filePath, 'utf8')
    return safeJsonParse(raw, fallback)
  } catch {
    return fallback
  }
}

function writeJsonFile(filePath, data) {
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    return true
  } catch {
    return false
  }
}

function createSessionLifecycleService({
  dataRoot,
  getSessionsMap,
  getSessionMessagesMap,
  readWriterProjects,
  writeWriterProjects,
  writerProjectDataPath,
  log = () => {}
}) {
  const tombstonePath = path.join(dataRoot, TOMBSTONE_FILENAME)
  const sessionIndexPath = path.join(dataRoot, SESSION_INDEX_FILENAME)

  let tombstoneCache = null
  let sessionIndexCache = null

  function loadTombstones() {
    if (tombstoneCache) return tombstoneCache
    const data = readJsonFile(tombstonePath, { tombstones: [], version: 1 })
    tombstoneCache = new Map((data.tombstones || []).map(t => [t.session_id, t]))
    return tombstoneCache
  }

  function saveTombstones(map) {
    const arr = Array.from(map.values())
    writeJsonFile(tombstonePath, { tombstones: arr, version: 1, updated_at: nowIso() })
  }

  function loadSessionIndex() {
    if (sessionIndexCache) return sessionIndexCache
    const data = readJsonFile(sessionIndexPath, { lineages: {}, version: 1 })
    sessionIndexCache = data
    return sessionIndexCache
  }

  function saveSessionIndex(data) {
    sessionIndexCache = data
    writeJsonFile(sessionIndexPath, { ...data, version: 1, updated_at: nowIso() })
  }

  function isTombstoned(sessionId) {
    if (!sessionId) return false
    const tombstones = loadTombstones()
    return tombstones.has(sessionId)
  }

  function addTombstones({ sessionIds, lineageRootId, profileId, reason, mutationId }) {
    const tombstones = loadTombstones()
    const now = nowIso()
    for (const sid of sessionIds) {
      if (!sid || tombstones.has(sid)) continue
      tombstones.set(sid, {
        session_id: sid,
        lineage_root_id: lineageRootId || null,
        profile_id: profileId || 'default',
        deleted_at: now,
        reason: reason || 'user_deleted',
        mutation_id: mutationId
      })
    }
    saveTombstones(tombstones)
    return sessionIds.filter(Boolean).length
  }

  function resolveLineageIds(sessionId) {
    const sessions = getSessionsMap()
    const result = new Set()
    if (!sessionId || !sessions.has(sessionId)) {
      return { allIds: [sessionId].filter(Boolean), rootId: null, isEmpty: true }
    }
    const seed = sessions.get(sessionId)
    const rootId = seed._lineage_root_id || seed.lineage_root_id || sessionId
    result.add(sessionId)
    for (const [sid, s] of sessions.entries()) {
      const sRoot = s._lineage_root_id || s.lineage_root_id || sid
      if (sRoot === rootId || sid === rootId) {
        result.add(sid)
      }
    }
    return { allIds: Array.from(result), rootId, isEmpty: false }
  }

  function clearWriterProjectReferences(sessionIds) {
    const clearedProjectIds = []
    const clearedAgentIds = []
    const idSet = new Set(sessionIds)

    try {
      const writerStore = readWriterProjects()
      let writerProjectsChanged = false
      const updatedWriterProjects = (writerStore.projects || []).map(p => {
        let projectChanged = false
        let updated = { ...p }

        if (updated.main_session_id && idSet.has(updated.main_session_id)) {
          updated.main_session_id = null
          projectChanged = true
        }

        if (Array.isArray(updated.session_ids)) {
          const filtered = updated.session_ids.filter(id => !idSet.has(id))
          if (filtered.length !== updated.session_ids.length) {
            updated.session_ids = filtered
            projectChanged = true
          }
        }

        if (updated.agent_session_ids && typeof updated.agent_session_ids === 'object') {
          const newAgentSessions = { ...updated.agent_session_ids }
          for (const [agentId, sid] of Object.entries(newAgentSessions)) {
            if (sid && idSet.has(sid)) {
              delete newAgentSessions[agentId]
              clearedAgentIds.push(agentId)
              projectChanged = true
            }
          }
          updated.agent_session_ids = newAgentSessions
        }

        if (projectChanged) {
          clearedProjectIds.push(p.id)
          writerProjectsChanged = true

          try {
            const agentDataPath = path.join(writerProjectDataPath(p), 'writer_agents.json')
            if (fs.existsSync(agentDataPath)) {
              const agentsRaw = readJsonFile(agentDataPath, { agents: [] })
              let agentsChanged = false
              const updatedAgents = (agentsRaw.agents || []).map(agent => {
                if (agent.session_id && idSet.has(agent.session_id)) {
                  agentsChanged = true
                  clearedAgentIds.push(agent.id)
                  return { ...agent, session_id: null }
                }
                return agent
              })
              if (agentsChanged) {
                writeJsonFile(agentDataPath, { ...agentsRaw, agents: updatedAgents })
              }
            }
          } catch (err) {
            log(`clearWriterProjectReferences: writer_agents.json error for ${p.id}: ${err.message}`)
          }
        }

        return projectChanged ? updated : p
      })

      if (writerProjectsChanged) {
        writeWriterProjects({ ...writerStore, projects: updatedWriterProjects })
      }
    } catch (err) {
      log(`clearWriterProjectReferences error: ${err.message}`)
    }

    return { clearedProjectIds, clearedAgentIds: [...new Set(clearedAgentIds)] }
  }

  function deleteLineage(sessionId, { scope = 'lineage', reason = 'user_deleted', profileId } = {}) {
    const mutationId = generateMutationId()
    const sessions = getSessionsMap()
    const sessionMessages = getSessionMessagesMap()
    const deletedSessionIds = []
    const affectedProfiles = new Set()

    let lineageInfo
    if (scope === 'lineage') {
      lineageInfo = resolveLineageIds(sessionId)
    } else {
      lineageInfo = { allIds: [sessionId], rootId: sessionId, isEmpty: !sessions.has(sessionId) }
    }

    const rootId = lineageInfo.rootId || sessionId

    try {
      for (const sid of lineageInfo.allIds) {
        const s = sessions.get(sid)
        if (s) {
          affectedProfiles.add(s.profile || 'default')
        }
        sessions.delete(sid)
        sessionMessages.delete(sid)
        deletedSessionIds.push(sid)
      }

      const { clearedProjectIds, clearedAgentIds } = clearWriterProjectReferences(deletedSessionIds)

      const tombstoneCount = addTombstones({
        sessionIds: deletedSessionIds,
        lineageRootId: rootId,
        profileId: profileId || 'default',
        reason,
        mutationId
      })

      log(`deleteLineage: deleted ${deletedSessionIds.length} sessions, ${clearedProjectIds.length} projects, ${clearedAgentIds.length} agents, ${tombstoneCount} tombstones (mutation=${mutationId})`)

      return {
        ok: true,
        mutation_id: mutationId,
        lineage_root_id: rootId,
        deleted_session_ids: deletedSessionIds,
        cleared_project_ids: clearedProjectIds,
        cleared_agent_ids: clearedAgentIds,
        affected_profiles: Array.from(affectedProfiles),
        scope
      }
    } catch (err) {
      log(`deleteLineage error: ${err.message}`)
      return {
        ok: false,
        error: err.message,
        mutation_id: mutationId,
        lineage_root_id: rootId
      }
    }
  }

  function archiveLineage(sessionId, { archived = true, scope = 'lineage', profileId } = {}) {
    const mutationId = generateMutationId()
    const sessions = getSessionsMap()
    const affectedSessionIds = []
    const affectedProfiles = new Set()
    const affectedProjectIds = new Set()

    let lineageInfo
    if (scope === 'lineage') {
      lineageInfo = resolveLineageIds(sessionId)
    } else {
      lineageInfo = { allIds: [sessionId], rootId: sessionId, isEmpty: !sessions.has(sessionId) }
    }

    const rootId = lineageInfo.rootId || sessionId

    for (const sid of lineageInfo.allIds) {
      const s = sessions.get(sid)
      if (s) {
        s.archived = archived
        s.updated = nowSeconds()
        affectedSessionIds.push(sid)
        affectedProfiles.add(s.profile || 'default')
        if (s.project_id) affectedProjectIds.add(s.project_id)
        if (s.writer_project_id) affectedProjectIds.add(s.writer_project_id)
      }
    }

    log(`archiveLineage: ${archived ? 'archived' : 'unarchived'} ${affectedSessionIds.length} sessions (mutation=${mutationId})`)

    return {
      ok: true,
      mutation_id: mutationId,
      action: archived ? 'archived' : 'unarchived',
      lineage_root_id: rootId,
      affected_session_ids: affectedSessionIds,
      affected_project_ids: Array.from(affectedProjectIds),
      affected_profiles: Array.from(affectedProfiles),
      scope
    }
  }

  function filterSessionsByArchive(sessionsArray, { includeArchived = false, archivedOnly = false } = {}) {
    if (archivedOnly) {
      return sessionsArray.filter(s => Boolean(s.archived))
    }
    if (!includeArchived) {
      return sessionsArray.filter(s => !Boolean(s.archived))
    }
    return sessionsArray
  }

  function filterTombstoned(sessionsArray) {
    const tombstones = loadTombstones()
    if (tombstones.size === 0) return sessionsArray
    return sessionsArray.filter(s => !tombstones.has(s.id))
  }

  function preventResurrection(sessionId) {
    if (!sessionId) return false
    if (isTombstoned(sessionId)) {
      log(`preventResurrection: blocked session_id=${sessionId}`)
      return true
    }
    return false
  }

  function runIntegrityRepair() {
    const sessions = getSessionsMap()
    const tombstones = loadTombstones()
    const report = {
      removed_stale_project_refs: 0,
      removed_stale_agent_refs: 0,
      fixed_archive_branches: 0,
      blocked_resurrections: 0,
      tombstone_count: tombstones.size,
      session_count: sessions.size
    }

    const tombstonedIds = Array.from(tombstones.keys())
    if (tombstonedIds.length > 0) {
      const { clearedProjectIds, clearedAgentIds } = clearWriterProjectReferences(tombstonedIds)
      report.removed_stale_project_refs = clearedProjectIds.length
      report.removed_stale_agent_refs = clearedAgentIds.length

      for (const sid of tombstonedIds) {
        if (sessions.has(sid)) {
          sessions.delete(sid)
          report.blocked_resurrections++
        }
      }
    }

    const byLineage = new Map()
    for (const [sid, s] of sessions.entries()) {
      const rootId = s._lineage_root_id || s.lineage_root_id || sid
      if (!byLineage.has(rootId)) byLineage.set(rootId, [])
      byLineage.get(rootId).push(s)
    }

    for (const [rootId, members] of byLineage.entries()) {
      if (members.length <= 1) continue
      const archivedCount = members.filter(s => Boolean(s.archived)).length
      if (archivedCount > 0 && archivedCount < members.length) {
        const allArchived = archivedCount === members.length
        if (!allArchived) {
          const hasExplicitlyArchived = members.some(s => s.archived)
          if (hasExplicitlyArchived) {
            for (const s of members) {
              if (!s.archived) {
                s.archived = true
                s.updated = nowSeconds()
                report.fixed_archive_branches++
              }
            }
          }
        }
      }
    }

    log(`integrityRepair: ${JSON.stringify(report)}`)
    return report
  }

  return {
    isTombstoned,
    addTombstones,
    resolveLineageIds,
    deleteLineage,
    archiveLineage,
    filterSessionsByArchive,
    filterTombstoned,
    preventResurrection,
    runIntegrityRepair,
    loadTombstones,
    loadSessionIndex
  }
}

module.exports = { createSessionLifecycleService }
