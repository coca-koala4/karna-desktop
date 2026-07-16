'use strict'

const MAX_EVENTS = 100000
const RETENTION_DAYS = 7
const EVENT_CURSOR_INITIAL = '0'

function createEventStore(deps = {}) {
  const events = []
  let cursor = BigInt(0)
  let prunedAt = 0

  function generateCursor() {
    cursor += BigInt(1)
    return cursor.toString()
  }

  function prune() {
    const now = Date.now()
    if (now - prunedAt < 60 * 1000) return
    prunedAt = now

    const cutoff = now - RETENTION_DAYS * 24 * 60 * 60 * 1000
    while (events.length > 0 && events[0].ts < cutoff) {
      events.shift()
    }

    while (events.length > MAX_EVENTS) {
      events.shift()
    }
  }

  function append(type, payload = {}) {
    prune()
    const event = {
      cursor: generateCursor(),
      ts: Date.now(),
      type,
      payload
    }
    events.push(event)
    return event
  }

  function getEventsSince(sinceCursor, limit = 100) {
    prune()
    const since = sinceCursor ? BigInt(sinceCursor) : BigInt(0)
    const result = []
    for (const event of events) {
      if (BigInt(event.cursor) > since) {
        result.push(event)
        if (result.length >= limit) break
      }
    }
    return result
  }

  function getLatestCursor() {
    return cursor.toString()
  }

  function getStats() {
    prune()
    return {
      count: events.length,
      maxEvents: MAX_EVENTS,
      retentionDays: RETENTION_DAYS,
      oldestTs: events.length > 0 ? events[0].ts : null,
      latestTs: events.length > 0 ? events[events.length - 1].ts : null,
      latestCursor: getLatestCursor()
    }
  }

  function initialize() {
    cursor = BigInt(EVENT_CURSOR_INITIAL)
  }

  function clear() {
    events.length = 0
    cursor = BigInt(0)
    prunedAt = 0
  }

  return Object.freeze({
    initialize,
    append,
    getEventsSince,
    getLatestCursor,
    getStats,
    clear,
    MAX_EVENTS,
    RETENTION_DAYS
  })
}

module.exports = { createEventStore, MAX_EVENTS, RETENTION_DAYS }
