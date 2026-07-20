'use strict'

const crypto = require('node:crypto')

const VALID_TYPES = ['note', 'fact', 'preference', 'project']
const VALID_STATUSES = ['active', 'archived', 'deleted']

function createMemoryService({ fs, path, dataRoot }) {
  const memoriesDir = path.join(dataRoot, 'memories')
  const memoryIndexPath = path.join(memoriesDir, 'memory-index.json')

  function ensureMemoriesDir() {
    try { fs.mkdirSync(memoriesDir, { recursive: true }) } catch {}
  }

  function readIndex() {
    ensureMemoriesDir()
    try {
      if (fs.existsSync(memoryIndexPath)) {
        const data = JSON.parse(fs.readFileSync(memoryIndexPath, 'utf8'))
        return Array.isArray(data.memories) ? data.memories : []
      }
    } catch {}
    return []
  }

  function writeIndex(memories) {
    ensureMemoriesDir()
    const tempFile = `${memoryIndexPath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      fs.writeFileSync(tempFile, JSON.stringify({ version: 1, memories, updated_at: new Date().toISOString() }, null, 2) + '\n', 'utf8')
      fs.renameSync(tempFile, memoryIndexPath)
    } finally {
      try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile) } catch {}
    }
  }

  function generateId() {
    return `mem_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`
  }

  function nowIso() {
    return new Date().toISOString()
  }

  function listMemories({ type, workspaceId, module, limit = 50, offset = 0, status = 'active' } = {}) {
    let memories = readIndex()

    if (status && status !== 'all') {
      memories = memories.filter(m => m.status === status)
    }

    if (type && VALID_TYPES.includes(type)) {
      memories = memories.filter(m => m.type === type)
    }

    if (workspaceId) {
      memories = memories.filter(m => m.workspace_id === workspaceId)
    }

    if (module) {
      memories = memories.filter(m => m.module === module)
    }

    memories.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
      return new Date(b.updated_at) - new Date(a.updated_at)
    })

    const total = memories.length
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200)
    const safeOffset = Math.max(parseInt(offset, 10) || 0, 0)
    const paginated = memories.slice(safeOffset, safeOffset + safeLimit)
    const hasMore = safeOffset + safeLimit < total

    return {
      memories: paginated,
      total,
      offset: safeOffset,
      limit: safeLimit,
      has_more: hasMore
    }
  }

  function getMemory(id) {
    const memories = readIndex()
    const memory = memories.find(m => m.id === id)
    if (!memory) return null

    memory.access_count = (memory.access_count || 0) + 1
    memory.accessed_at = nowIso()
    writeIndex(memories)

    return memory
  }

  function createMemory({ type, content, title, tags, workspaceId, module, sessionId, source }) {
    if (!type || !VALID_TYPES.includes(type)) {
      return { ok: false, error: `Invalid memory type. Must be one of: ${VALID_TYPES.join(', ')}` }
    }
    if (!content || typeof content !== 'string') {
      return { ok: false, error: 'Memory content is required' }
    }

    const memories = readIndex()
    const now = nowIso()
    const memory = {
      id: generateId(),
      type,
      title: title || content.slice(0, 100),
      content,
      tags: Array.isArray(tags) ? tags : [],
      status: 'active',
      pinned: false,
      workspace_id: workspaceId || null,
      module: module || null,
      session_id: sessionId || null,
      source: source || 'manual',
      created_at: now,
      updated_at: now,
      accessed_at: null,
      access_count: 0,
      importance: 5,
      embedding: null
    }

    memories.unshift(memory)
    writeIndex(memories)

    return { ok: true, memory }
  }

  function updateMemory(id, updates) {
    if (!updates || typeof updates !== 'object') {
      return { ok: false, error: 'Updates object is required' }
    }

    const memories = readIndex()
    const index = memories.findIndex(m => m.id === id)
    if (index === -1) {
      return { ok: false, error: 'Memory not found' }
    }

    const memory = memories[index]
    const allowedFields = ['title', 'content', 'tags', 'status', 'importance', 'workspace_id', 'module']

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        memory[field] = updates[field]
      }
    }

    if (updates.status && !VALID_STATUSES.includes(updates.status)) {
      return { ok: false, error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }
    }

    memory.updated_at = nowIso()
    memories[index] = memory
    writeIndex(memories)

    return { ok: true, memory }
  }

  function deleteMemory(id) {
    const memories = readIndex()
    const index = memories.findIndex(m => m.id === id)
    if (index === -1) {
      return { ok: false, error: 'Memory not found' }
    }

    memories[index].status = 'deleted'
    memories[index].updated_at = nowIso()
    writeIndex(memories)

    return { ok: true, id }
  }

  function searchMemories({ query, type, workspaceId, limit = 20 }) {
    if (!query || typeof query !== 'string') {
      return { memories: [], total: 0 }
    }

    const queryLower = query.toLowerCase()
    let memories = readIndex()

    memories = memories.filter(m => m.status === 'active')

    if (type && VALID_TYPES.includes(type)) {
      memories = memories.filter(m => m.type === type)
    }

    if (workspaceId) {
      memories = memories.filter(m => m.workspace_id === workspaceId)
    }

    const scored = memories.map(m => {
      let score = 0
      const titleLower = (m.title || '').toLowerCase()
      const contentLower = (m.content || '').toLowerCase()
      const tagsLower = (m.tags || []).map(t => t.toLowerCase())

      if (titleLower.includes(queryLower)) score += 10
      if (contentLower.includes(queryLower)) score += 5
      for (const tag of tagsLower) {
        if (tag.includes(queryLower)) score += 3
      }

      return { memory: m, score }
    }).filter(item => item.score > 0)

    scored.sort((a, b) => b.score - a.score)

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100)
    const results = scored.slice(0, safeLimit).map(s => s.memory)

    return {
      memories: results,
      total: scored.length
    }
  }

  function togglePin(id, pinned) {
    const memories = readIndex()
    const index = memories.findIndex(m => m.id === id)
    if (index === -1) {
      return { ok: false, error: 'Memory not found' }
    }

    memories[index].pinned = Boolean(pinned)
    memories[index].updated_at = nowIso()
    writeIndex(memories)

    return { ok: true, id, pinned: Boolean(pinned) }
  }

  function getPinnedMemories({ workspaceId, module, limit = 20 } = {}) {
    let memories = readIndex()

    memories = memories.filter(m => m.status === 'active' && m.pinned)

    if (workspaceId) {
      memories = memories.filter(m => m.workspace_id === workspaceId)
    }

    if (module) {
      memories = memories.filter(m => m.module === module)
    }

    memories.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100)

    return {
      memories: memories.slice(0, safeLimit),
      total: memories.length
    }
  }

  function importMemories(filePath) {
    try {
      if (!fs.existsSync(filePath)) {
        return { ok: false, error: 'Import file not found' }
      }

      const raw = fs.readFileSync(filePath, 'utf8')
      const data = JSON.parse(raw)
      const importItems = Array.isArray(data) ? data : (data.memories || [])

      if (!Array.isArray(importItems) || importItems.length === 0) {
        return { ok: false, error: 'No memories to import' }
      }

      const memories = readIndex()
      const now = nowIso()
      let imported = 0

      for (const item of importItems) {
        if (!item.content || typeof item.content !== 'string') continue

        const memory = {
          id: generateId(),
          type: VALID_TYPES.includes(item.type) ? item.type : 'note',
          title: item.title || item.content.slice(0, 100),
          content: item.content,
          tags: Array.isArray(item.tags) ? item.tags : [],
          status: 'active',
          pinned: false,
          workspace_id: item.workspace_id || null,
          module: item.module || null,
          session_id: item.session_id || null,
          source: 'imported',
          created_at: now,
          updated_at: now,
          accessed_at: null,
          access_count: 0,
          importance: typeof item.importance === 'number' ? item.importance : 5,
          embedding: null
        }

        memories.unshift(memory)
        imported++
      }

      writeIndex(memories)

      return { ok: true, imported, total: importItems.length }
    } catch (err) {
      return { ok: false, error: `Import failed: ${err.message}` }
    }
  }

  function exportMemories({ type, workspaceId, format = 'json' } = {}) {
    let memories = readIndex()

    memories = memories.filter(m => m.status !== 'deleted')

    if (type && VALID_TYPES.includes(type)) {
      memories = memories.filter(m => m.type === type)
    }

    if (workspaceId) {
      memories = memories.filter(m => m.workspace_id === workspaceId)
    }

    const exportData = {
      version: 1,
      exported_at: nowIso(),
      count: memories.length,
      memories
    }

    return {
      ok: true,
      format,
      data: format === 'json' ? JSON.stringify(exportData, null, 2) : exportData,
      count: memories.length
    }
  }

  function getMemoryStats({ workspaceId, module } = {}) {
    const memories = readIndex()
    const active = memories.filter(m => m.status === 'active')
    const filtered = workspaceId || module
      ? active.filter(m =>
          (!workspaceId || m.workspace_id === workspaceId) &&
          (!module || m.module === module)
        )
      : active

    const byType = {}
    const byStatus = {}

    for (const type of VALID_TYPES) {
      byType[type] = filtered.filter(m => m.type === type).length
    }

    for (const status of VALID_STATUSES) {
      byStatus[status] = memories.filter(m =>
        m.status === status &&
        (!workspaceId || m.workspace_id === workspaceId) &&
        (!module || m.module === module)
      ).length
    }

    const pinned = filtered.filter(m => m.pinned).length
    const totalTags = new Set()
    for (const m of filtered) {
      for (const tag of (m.tags || [])) {
        totalTags.add(tag)
      }
    }

    return {
      total: filtered.length,
      by_type: byType,
      by_status: byStatus,
      pinned,
      unique_tags: totalTags.size
    }
  }

  return {
    listMemories,
    getMemory,
    createMemory,
    updateMemory,
    deleteMemory,
    searchMemories,
    togglePin,
    getPinnedMemories,
    importMemories,
    exportMemories,
    getMemoryStats
  }
}

module.exports = { createMemoryService }
