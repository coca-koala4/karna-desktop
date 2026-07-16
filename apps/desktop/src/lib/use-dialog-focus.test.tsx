import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useDialogFocus } from './use-dialog-focus'

function TestDialog({ onClose }: { onClose: () => void }) {
  const ref = useDialogFocus<HTMLDivElement>(onClose)

  return <div ref={ref} role="dialog" tabIndex={-1}><button>first</button><button>last</button></div>
}

describe('useDialogFocus', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('enters, traps, closes, and restores focus', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
      callback(0)

      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    const launcher = document.createElement('button')
    const host = document.createElement('div')
    const onClose = vi.fn()

    document.body.append(launcher, host)
    launcher.focus()

    const root = createRoot(host)

    await act(async () => {
      root.render(<TestDialog onClose={onClose} />)
    })

    const [first, last] = Array.from(host.querySelectorAll('button'))

    expect(document.activeElement).toBe(first)

    last.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab' }))
    expect(document.activeElement).toBe(first)

    first.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Tab', shiftKey: true }))
    expect(document.activeElement).toBe(last)

    document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))
    expect(onClose).toHaveBeenCalledOnce()

    await act(async () => root.unmount())
    expect(document.activeElement).toBe(launcher)
  })
})
