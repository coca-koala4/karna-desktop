import { describe, expect, it } from 'vitest'
import { normalizeCriticCouncilPayload } from './critic-council-normalize'

describe('normalizeCriticCouncilPayload', () => {
  it('returns empty council for null', () => {
    const result = normalizeCriticCouncilPayload(null)
    expect(result.schema_version).toBe(1)
    expect(result.lenses).toEqual([])
    expect(result.summary.findings).toBe(0)
    expect(result.summary.status).toBe('clear')
  })

  it('returns empty council for undefined', () => {
    const result = normalizeCriticCouncilPayload(undefined)
    expect(result.lenses).toEqual([])
  })

  it('returns empty council for non-object', () => {
    const result = normalizeCriticCouncilPayload('string')
    expect(result.lenses).toEqual([])
  })

  it('returns empty council for object without council data', () => {
    const result = normalizeCriticCouncilPayload({ foo: 'bar' })
    expect(result.lenses).toEqual([])
  })

  it('handles empty lenses array', () => {
    const result = normalizeCriticCouncilPayload({ lenses: [] })
    expect(result.lenses).toEqual([])
    expect(result.summary.findings).toBe(0)
  })

  it('filters out null findings', () => {
    const result = normalizeCriticCouncilPayload({
      lenses: [
        {
          id: 'lens1',
          name: 'Test Lens',
          status: 'ok',
          findings: [
            null,
            undefined,
            { id: 'f1', title: 'Valid', level: 'high' },
            'not an object',
            123
          ]
        }
      ]
    })
    expect(result.lenses.length).toBe(1)
    expect(result.lenses[0].findings.length).toBe(1)
    expect(result.lenses[0].findings[0].title).toBe('Valid')
    expect(result.lenses[0].findings[0].level).toBe('critical')
  })

  it('normalizes finding levels correctly', () => {
    const levels = [
      { input: 'high', expected: 'critical' },
      { input: 'critical', expected: 'critical' },
      { input: 'HIGH', expected: 'critical' },
      { input: 'medium', expected: 'warning' },
      { input: 'warning', expected: 'warning' },
      { input: 'low', expected: 'info' },
      { input: 'info', expected: 'info' },
      { input: 'unknown_level', expected: 'info' },
      { input: null, expected: 'info' },
      { input: undefined, expected: 'info' }
    ]

    for (const { input, expected } of levels) {
      const result = normalizeCriticCouncilPayload({
        lenses: [
          {
            id: 'l1',
            name: 'L',
            status: 'ok',
            findings: [{ id: 'f1', title: 'T', level: input }]
          }
        ]
      })
      expect(result.lenses[0].findings[0].level).toBe(expected)
    }
  })

  it('handles missing level in finding', () => {
    const result = normalizeCriticCouncilPayload({
      lenses: [
        {
          id: 'l1',
          name: 'Lens',
          status: 'ok',
          findings: [{ id: 'f1', title: 'No level' }]
        }
      ]
    })
    expect(result.lenses[0].findings[0].level).toBe('info')
  })

  it('calculates summary from findings', () => {
    const result = normalizeCriticCouncilPayload({
      lenses: [
        {
          id: 'l1',
          name: 'L1',
          status: 'ok',
          findings: [
            { id: 'f1', title: 'F1', level: 'high' },
            { id: 'f2', title: 'F2', level: 'high' },
            { id: 'f3', title: 'F3', level: 'medium' }
          ]
        },
        {
          id: 'l2',
          name: 'L2',
          status: 'ok',
          findings: [
            { id: 'f4', title: 'F4', level: 'low' },
            { id: 'f5', title: 'F5', level: 'info' }
          ]
        }
      ]
    })
    expect(result.summary.findings).toBe(5)
    expect(result.summary.critical).toBe(2)
    expect(result.summary.warning).toBe(1)
    expect(result.summary.info).toBe(2)
  })

  it('handles council wrapper object', () => {
    const result = normalizeCriticCouncilPayload({
      council: {
        id: 'report-1',
        version: 2,
        lenses: [
          {
            id: 'l1',
            name: 'Test',
            status: 'needs_revision',
            findings: [{ id: 'f1', title: 'Test finding', level: 'medium' }]
          }
        ]
      }
    })
    expect(result.id).toBe('report-1')
    expect(result.version).toBe(2)
    expect(result.lenses.length).toBe(1)
    expect(result.lenses[0].findings.length).toBe(1)
  })

  it('normalizes status values', () => {
    const statuses = [
      { input: 'clear', expected: 'clear' },
      { input: 'ok', expected: 'clear' },
      { input: 'needs_revision', expected: 'needs_revision' },
      { input: 'critical', expected: 'critical' },
      { input: 'unknown', expected: 'ok_with_notes' }
    ]

    for (const { input, expected } of statuses) {
      const result = normalizeCriticCouncilPayload({
        lenses: [],
        summary: { status: input }
      })
      expect(result.summary.status).toBe(expected)
    }
  })

  it('preserves evidence and suggestion arrays', () => {
    const result = normalizeCriticCouncilPayload({
      lenses: [
        {
          id: 'l1',
          name: 'Lens',
          status: 'ok',
          findings: [
            {
              id: 'f1',
              title: 'F',
              level: 'high',
              evidence: ['line 1', 'line 2'],
              suggestion: 'Fix it'
            }
          ]
        }
      ]
    })
    expect(result.lenses[0].findings[0].evidence).toEqual(['line 1', 'line 2'])
    expect(result.lenses[0].findings[0].suggestion).toBe('Fix it')
  })

  it('filters non-string evidence items', () => {
    const result = normalizeCriticCouncilPayload({
      lenses: [
        {
          id: 'l1',
          name: 'Lens',
          status: 'ok',
          findings: [
            {
              id: 'f1',
              title: 'F',
              level: 'high',
              evidence: ['valid', 123, null, { obj: true }]
            }
          ]
        }
      ]
    })
    expect(result.lenses[0].findings[0].evidence).toEqual(['valid'])
  })

  it('handles old format with flat findings', () => {
    const result = normalizeCriticCouncilPayload({
      lenses: [
        {
          id: 'structure',
          name: '结构评审',
          focus: '检查文章结构完整性',
          status: 'needs_revision',
          findings: [
            { id: 'f1', lens: 'structure', level: 'medium', title: '缺少引言', evidence: [], suggestion: '添加引言段落' }
          ]
        }
      ]
    })
    expect(result.lenses.length).toBe(1)
    expect(result.lenses[0].findings.length).toBe(1)
    expect(result.lenses[0].findings[0].level).toBe('warning')
  })
})
