import { describe, expect, it } from 'vitest'

import { resolveWriterOsProfile } from './writer-os-profile'

describe('resolveWriterOsProfile', () => {
  it('uses the project document type instead of a fixed novel profile', () => {
    const legal = resolveWriterOsProfile('regulated_document', 'legal-docs')
    const script = resolveWriterOsProfile('script_dialogue', 'feature-film')

    expect(legal.title).toBe('法务工坊')
    expect(legal.labels.safety).toBe('合规审查')
    expect(legal.moduleIds).not.toContain('story-bible')
    expect(script.title).toBe('剧本工坊')
    expect(script.labels['story-bible']).toBe('剧集圣经')
  })

  it('falls back safely for old projects without taxonomy', () => {
    const profile = resolveWriterOsProfile(null, null)
    expect(profile.documentType).toBe('narrative_prose')
    expect(profile.moduleIds).toContain('story-bible')
  })
})
