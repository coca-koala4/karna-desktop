import { type RefObject, useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

/** Provides Escape handling, focus entry/restore, and a Tab loop for custom dialogs. */
export function useDialogFocus<T extends HTMLElement>(onClose: () => void, initialFocus?: RefObject<HTMLElement | null>) {
  const containerRef = useRef<T>(null)

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const frame = window.requestAnimationFrame(() => {
      const container = containerRef.current
      const target = initialFocus?.current || container?.querySelector<HTMLElement>(FOCUSABLE) || container

      target?.focus()
    })

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()

        return
      }

      if (event.key !== 'Tab') {return}

      const container = containerRef.current

      if (!container) {return}

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(element => !element.hidden && element.getAttribute('aria-hidden') !== 'true')

      if (focusable.length === 0) {
        event.preventDefault()
        container.focus()

        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      previous?.focus()
    }
  }, [initialFocus, onClose])

  return containerRef
}
