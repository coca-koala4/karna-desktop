import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hermes', () => ({
  setContextEnvelope: vi.fn(async (envelope) => ({ ok: true, envelope }))
}))

import {
  enterWriterMode,
  getEnvelopeMetadata,
  updateWriterArtifact,
  updateWriterSelection
} from './use-context-envelope'

describe('writer ContextEnvelope transport contract', () => {
  beforeEach(async () => {
    await enterWriterMode({
      workspaceId: 'workspace-a',
      projectId: 'project-a',
      domainId: 'literature',
      documentType: 'narrative_prose'
    })
  })

  it('submits one complete versioned and project-scoped envelope', async () => {
    await updateWriterArtifact('D:/books/a/chapter-1.md', 'narrative_prose')
    await updateWriterSelection('manuscript reference', 10, 30)
    expect(getEnvelopeMetadata()).toEqual({
      context_envelope: expect.objectContaining({
        version: 1,
        enabled: true,
        workspace_id: 'workspace-a',
        project_id: 'project-a',
        module: 'writer_ide',
        source_kind: 'user_instruction',
        writing_domain: 'fiction',
        runtime_profile: 'longform_writing',
        active_artifact_path: 'D:/books/a/chapter-1.md',
        selection_text: 'manuscript reference'
      })
    })
  })
})
