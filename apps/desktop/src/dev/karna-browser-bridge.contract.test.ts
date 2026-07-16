import { beforeEach, describe, expect, it } from 'vitest'

import { hasWriterOsResponseShape, WRITER_OS_API_CONTRACT, writerOsApiPath } from '@/lib/writer-os-contract'

import { karnaBrowserDevApiForTest } from './karna-browser-bridge'

describe('browser-dev Writer OS contract', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns the declared response shape for every Writer OS module', async () => {
    for (const module of WRITER_OS_API_CONTRACT.modules) {
      const result = await karnaBrowserDevApiForTest({
        method: 'GET',
        path: writerOsApiPath('writer-os-smoke-lab', module.id)
      })

      expect(hasWriterOsResponseShape(module.id, result), module.id).toBe(true)
    }
  })

  it('accepts legacy aliases but responds with the canonical payload', async () => {
    for (const module of WRITER_OS_API_CONTRACT.modules) {
      for (const alias of module.aliases) {
        const result = await karnaBrowserDevApiForTest({
          method: 'GET',
          path: writerOsApiPath('writer-os-smoke-lab', alias)
        })

        expect(hasWriterOsResponseShape(alias, result), `${alias} -> ${module.id}`).toBe(true)
      }
    }
  })
})

describe('browser-dev connector audit contract', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('records and filters tool calls by project context', async () => {
    await karnaBrowserDevApiForTest({
      method: 'POST',
      path: '/api/connectors/tools/dev_tool_read_webpage/call',
      body: { arguments: { url: 'https://example.com' }, project_id: 'writer-os-smoke-lab' }
    })
    await karnaBrowserDevApiForTest({
      method: 'POST',
      path: '/api/connectors/tools/dev_tool_read_webpage/call',
      body: { arguments: { url: 'https://example.net' }, project_id: 'another-project' }
    })

    const result = await karnaBrowserDevApiForTest<{ items: Array<{ projectId?: string; toolName?: string }> }>({
      method: 'GET',
      path: '/api/connectors/audit-logs?instance_id=dev_conn_browser_reader&project_id=writer-os-smoke-lab'
    })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ projectId: 'writer-os-smoke-lab', toolName: 'read_webpage' })
  })
})

describe('browser-dev Soul governance contract', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('persists retention, exports, and purges only the selected Soul knowledge', async () => {
    const created = await karnaBrowserDevApiForTest<{ author: { id: string } }>({ method: 'POST', path: '/api/soul/authors', body: { name: 'Governance test' } })
    const ref = created.author.id

    const governance = await karnaBrowserDevApiForTest<{ governance: { retention_days: number } }>({ method: 'PUT', path: `/api/soul/authors/${ref}/governance`, body: { retention_days: 90 } })
    const exported = await karnaBrowserDevApiForTest<{ file: string }>({ method: 'POST', path: `/api/soul/authors/${ref}/export` })
    const purged = await karnaBrowserDevApiForTest<{ usage: { files: number } }>({ method: 'DELETE', path: `/api/soul/authors/${ref}/purge` })
    const detail = await karnaBrowserDevApiForTest<{ author: { id: string }; governance: { retention_days: number } }>({ method: 'GET', path: `/api/soul/authors/${ref}` })

    expect(governance.governance.retention_days).toBe(90)
    expect(exported.file).toContain(ref)
    expect(purged.usage.files).toBe(0)
    expect(detail.author.id).toBe(ref)
    expect(detail.governance.retention_days).toBe(90)
  })
})
