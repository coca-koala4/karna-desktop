'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { createArtifactsService } = require('./artifacts-service.cjs')

function makeMemoryStore() {
  const state = new Map()

  return {
    readJsonState: (filename, fallback) => state.has(filename) ? JSON.parse(JSON.stringify(state.get(filename))) : JSON.parse(JSON.stringify(fallback)),
    writeJsonState: (filename, data) => {
      state.set(filename, JSON.parse(JSON.stringify(data)))

      return filename
    }
  }
}

test('artifacts service records rows, preserves settings, caps history, and deletes by id', () => {
  const memory = makeMemoryStore()
  const service = createArtifactsService({
    crypto: { randomBytes: () => Buffer.from('abc') },
    ...memory
  })

  service.updateArtifactSettings({ image: false })
  const first = service.recordArtifact({ type: 'markdown', title: 'One', content: '# One' })

  assert.match(first.id, /^art_\d+_616263$/)
  assert.equal(first.type, 'markdown')
  assert.equal(service.readArtifacts().settings.image, false)

  for (let index = 0; index < 505; index += 1) {
    service.recordArtifact({ id: `item-${index}`, type: 'file', title: `Item ${index}` })
  }

  const capped = service.readArtifacts()

  assert.equal(capped.artifacts.length, 500)
  assert.equal(capped.artifacts[0].id, 'item-504')

  service.deleteArtifact('item-504')

  assert.equal(service.readArtifacts().artifacts.some(item => item.id === 'item-504'), false)
})
