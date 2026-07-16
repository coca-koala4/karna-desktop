import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { SoulSettings } from './soul-settings'

const { getProfileSoul, updateProfileSoul, resetProfileSoul } = vi.hoisted(() => ({
  getProfileSoul: vi.fn(),
  updateProfileSoul: vi.fn(),
  resetProfileSoul: vi.fn()
}))

vi.mock('@/hermes', () => ({ getProfileSoul, updateProfileSoul, resetProfileSoul }))
vi.mock('@/store/notifications', () => ({ notify: vi.fn(), notifyError: vi.fn() }))
vi.mock('@/i18n', () => ({
  useI18n: () => ({
    t: {
      common: { save: '保存', saving: '保存中' },
      settings: { soul: {
        title: 'Karna 人格', intro: '系统人格', loading: '加载中', loadFailed: '加载失败',
        editorTitle: '个性化人格提示词', editorDesc: '描述', charCount: (n: number, max: number) => `${n}/${max}`,
        preview: '预览', previewTitle: '顺序', coreSummary: '安全规则', coreTitle: '规则', restoreDefault: '恢复默认',
        resetConfirm: '确认', resetTitle: '已恢复', savedTitle: '已保存', savedMessage: '已生效', saveFailed: '保存失败', resetFailed: '恢复失败'
      } }
    }
  })
}))

describe('Karna personality settings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProfileSoul.mockResolvedValue({ content: '初始人格', max_chars: 24000, path: 'SOUL.md', core_policy_summary: [] })
    updateProfileSoul.mockResolvedValue({ ok: true })
    resetProfileSoul.mockResolvedValue({ ok: true })
  })

  it('loads and saves the editable system personality', async () => {
    render(<MemoryRouter><SoulSettings /></MemoryRouter>)
    const editor = await screen.findByLabelText('个性化人格提示词')
    fireEvent.change(editor, { target: { value: '更新后的人格' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(updateProfileSoul).toHaveBeenCalledWith('default', '更新后的人格'))
  })
})
