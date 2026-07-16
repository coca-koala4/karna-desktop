import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const getSkills = vi.fn()
const getSkillsCatalog = vi.fn()
const getToolsets = vi.fn()
const toggleSkill = vi.fn()
const toggleToolset = vi.fn()
const getToolsetConfig = vi.fn()
const selectToolsetProvider = vi.fn()

vi.mock('@/hermes', () => ({
  getSkills: () => getSkills(),
  getSkillsCatalog: () => getSkillsCatalog(),
  getToolsets: () => getToolsets(),
  toggleSkill: (name: string, enabled: boolean) => toggleSkill(name, enabled),
  toggleToolset: (name: string, enabled: boolean) => toggleToolset(name, enabled),
  getToolsetConfig: (name: string) => getToolsetConfig(name),
  selectToolsetProvider: (toolset: string, provider: string) => selectToolsetProvider(toolset, provider),
  createSkill: vi.fn(),
  installSkill: vi.fn(),
  uninstallSkill: vi.fn(),
  deleteEnvVar: vi.fn(),
  revealEnvVar: vi.fn(),
  setEnvVar: vi.fn()
}))

// Notifications hit nanostores/timers we don't care about here.
vi.mock('@/store/notifications', () => ({
  notify: vi.fn(),
  notifyError: vi.fn()
}))

function toolset(overrides: Record<string, unknown> = {}) {
  return {
    name: 'web',
    label: 'Web Search',
    description: 'web_search, web_extract',
    enabled: true,
    available: true,
    configured: true,
    tools: ['web_search', 'web_extract'],
    ...overrides
  }
}

function renderSkills(initialEntry = '/skills?tab=toolsets') {
  return import('./index').then(({ SkillsView }) =>
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <SkillsView />
      </MemoryRouter>
    )
  )
}

beforeEach(() => {
  getSkills.mockResolvedValue([])
  getSkillsCatalog.mockResolvedValue({
    ok: true,
    skills: [],
    diagnostics: {
      scannedAt: new Date().toISOString(), logicalCount: 0, sourceCount: 0, conflictCount: 0,
      unavailableCount: 0, uninstalledCount: 0, excludedCount: 0, previousLogicalCount: 0,
      countDelta: 0, driftDetected: false, roots: [], errors: [], excluded: []
    }
  })
  getToolsets.mockResolvedValue([toolset()])
  toggleToolset.mockResolvedValue({ ok: true, name: 'web', enabled: false })
  getToolsetConfig.mockResolvedValue({ has_category: false, active_provider: null, providers: [] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SkillsView toolset management', () => {
  it('renders a switch for each toolset and toggles it off', async () => {
    await renderSkills()

    const sw = await screen.findByRole('switch', { name: 'Toggle Web Search toolset' })
    expect(sw.getAttribute('aria-checked')).toBe('true')

    fireEvent.click(sw)

    await waitFor(() => expect(toggleToolset).toHaveBeenCalledWith('web', false))
  })

  it('renders toolset titles without leading emoji', async () => {
    getToolsets.mockResolvedValue([toolset({ name: 'cronjob', label: '⏰ Cron Jobs', description: 'cron tools' })])

    await renderSkills()

    expect(await screen.findByText('Cron Jobs')).toBeTruthy()
    expect(screen.queryByText(/⏰/)).toBeNull()
  })

  it('keeps the configured pill alongside the switch', async () => {
    await renderSkills()

    await screen.findByRole('switch', { name: 'Toggle Web Search toolset' })
    expect(screen.getByText('Configured')).toBeTruthy()
  })

  it('expands the provider config panel when the configured pill is clicked', async () => {
    await renderSkills()

    const configureBtn = await screen.findByRole('button', { name: 'Configure Web Search' })
    fireEvent.click(configureBtn)

    await waitFor(() => expect(getToolsetConfig).toHaveBeenCalledWith('web'))
  })
})

describe('SkillsView catalog diagnostics', () => {
  it('shows logical/source counts and same-name source details', async () => {
    getSkillsCatalog.mockResolvedValue({
      ok: true,
      skills: [{
        id: 'local:shared', name: 'shared', description: 'Shared skill', category: 'general', enabled: true,
        source: 'local', installed: true, available: true, conflict: true, sourceCount: 2,
        sources: [
          { id: 'local:shared', path: 'C:\\skills\\shared\\SKILL.md', source: 'local', selected: true, available: true },
          { id: 'repo:shared', path: 'D:\\skills\\shared\\SKILL.md', source: 'community', selected: false, available: true }
        ]
      }],
      diagnostics: {
        scannedAt: new Date().toISOString(), logicalCount: 1, sourceCount: 2, conflictCount: 1,
        unavailableCount: 0, uninstalledCount: 0, excludedCount: 0, previousLogicalCount: 1,
        countDelta: 0, driftDetected: false, roots: [], errors: [], excluded: []
      }
    })

    await renderSkills('/skills?tab=skills')

    expect(await screen.findByText('技能来源')).toBeTruthy()
    expect(screen.getByText('同名冲突')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /查看同名来源/ }))
    expect(await screen.findByText(/shared · 2 个来源/)).toBeTruthy()
    expect(screen.getByText(/C:\\skills\\shared/)).toBeTruthy()
  })
})
