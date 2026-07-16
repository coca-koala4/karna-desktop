import { beforeEach, describe, expect, it } from 'vitest'

import { karnaBrowserDevApiForTest } from '@/dev/karna-browser-bridge'

import { normalizeRouterResult } from './connector-workshop'

describe('Connector Workshop Tool Router regression coverage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('renders a safe empty result when an API payload omits tools', () => {
    expect(normalizeRouterResult({ intent: 'research' })).toEqual({ intent: 'research', tools: [] })
    expect(normalizeRouterResult(undefined)).toEqual({ intent: 'general', tools: [] })
  })

  it('returns enabled tools for a normal research route', async () => {
    const result = await karnaBrowserDevApiForTest<{ intent: string; tools: unknown[] }>({
      body: { text: '检索网页资料' },
      method: 'POST',
      path: '/api/connectors/router/candidates'
    })

    expect(result.intent).toBe('research')
    expect(result.tools.length).toBeGreaterThan(0)
  })

  it('returns an empty tools array when no connector instances exist', async () => {
    window.localStorage.setItem('karna.browser.dev.state.v1', JSON.stringify({ connectorInstances: [] }))

    const result = await karnaBrowserDevApiForTest<{ intent: string; tools: unknown[] }>({
      body: { text: '检索网页资料' },
      method: 'POST',
      path: '/api/connectors/router/candidates'
    })

    expect(result).toEqual({ intent: 'research', tools: [] })
  })
})
