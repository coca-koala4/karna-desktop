import { describe, expect, it } from 'vitest'

import {
  canonicalWriterOsModule,
  hasWriterOsResponseShape,
  WRITER_OS_API_CONTRACT,
  writerOsApiPath
} from './writer-os-contract'

describe('Writer OS API contract', () => {
  it('canonicalizes every declared alias', () => {
    for (const module of WRITER_OS_API_CONTRACT.modules) {
      expect(canonicalWriterOsModule(module.id)).toBe(module.id)

      for (const alias of module.aliases) {
        expect(canonicalWriterOsModule(alias)).toBe(module.id)
      }
    }
  })

  it('creates encoded unified Writer OS paths', () => {
    expect(writerOsApiPath('writer os', 'bible', 'review queue')).toBe('/api/writer/projects/writer%20os/os/story-bible/review%20queue')
  })

  it('rejects missing response keys', () => {
    expect(hasWriterOsResponseShape('rag', { status: 'ready' })).toBe(true)
    expect(hasWriterOsResponseShape('rag', { ok: true })).toBe(false)
  })
})
