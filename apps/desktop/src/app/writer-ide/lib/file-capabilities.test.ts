import { describe, expect, it } from 'vitest'

import { CAPABILITIES, getCapabilityForFile } from './file-capabilities'

describe('Writer IDE file capabilities', () => {
  it('routes binary and structured formats to their real viewers', () => {
    expect(getCapabilityForFile('chapter.docx').previewStrategy).toBe('office_pdf')
    expect(getCapabilityForFile('slides.pptx').previewStrategy).toBe('office_pdf')
    expect(getCapabilityForFile('world.xmind').viewer).toBe('mindmap')
    expect(getCapabilityForFile('movie.mp4').previewStrategy).toBe('media_stream')
    expect(getCapabilityForFile('photo.png').previewStrategy).toBe('image_stream')
  })

  it('does not expose toolbar commands that have no implementation', () => {
    const unsupported = new Set([
      'file.saveAs',
      'edit.find',
      'edit.replace',
      'document.comment',
      'document.export',
      'code.debug',
      'knowledge.index'
    ])
    for (const capability of CAPABILITIES) {
      for (const action of capability.supportedActions) {
        expect(unsupported.has(action), `${capability.id} exposes ${action}`).toBe(false)
      }
    }
  })

  it('only exposes actual run support for Python and JavaScript', () => {
    expect(getCapabilityForFile('tool.py').supportedActions).toContain('code.run')
    expect(getCapabilityForFile('tool.js').supportedActions).toContain('code.run')
    expect(getCapabilityForFile('tool.ts').supportedActions).not.toContain('code.run')
  })
})
