import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { KarnaStartupAnimation } from '@/components/ui/karna-animations'
import { cn } from '@/lib/utils'
import { $desktopBoot } from '@/store/boot'
import { $gatewayState } from '@/store/session'

const PREFIX = 'K'
const TAIL = 'ARNA'

type Phase = 'live' | 'fade-out' | 'gone'

function forcedPreview(): boolean {
  if (!import.meta.env.DEV || typeof window === 'undefined') {
    return false
  }

  try {
    return new URLSearchParams(window.location.search).get('connecting') === '1'
  } catch {
    return false
  }
}

export function GatewayConnectingOverlay() {
  const gatewayState = useStore($gatewayState)
  const boot = useStore($desktopBoot)
  const [previewing] = useState(forcedPreview)
  const [phase, setPhase] = useState<Phase>('live')

  const initialBootActive = boot.visible || boot.running || boot.progress < 100
  const connecting = gatewayState !== 'open' && !boot.error && initialBootActive

  useEffect(() => {
    if (phase !== 'live') {return}

    if (previewing) {return}

    if (gatewayState === 'open' && !initialBootActive) {
      const timer = setTimeout(() => setPhase('fade-out'), 2000)

      return () => clearTimeout(timer)
    }
  }, [phase, previewing, gatewayState, initialBootActive])

  useEffect(() => {
    if (phase === 'fade-out') {
      const id = setTimeout(() => setPhase('gone'), 600)

      return () => clearTimeout(id)
    }
  }, [phase])

  if (boot.error && !previewing) {
    return null
  }

  if (phase === 'gone' && !previewing) {
    return null
  }

  if (!previewing && !connecting && !boot.visible && !boot.running) {
    return null
  }

  const overlayHidden = phase === 'fade-out' || phase === 'gone'

  return (
    <div
      className={cn(
        'fixed inset-0 z-[1200] grid place-items-center bg-[var(--theme-background-seed)] transition-opacity duration-600 ease-out',
        overlayHidden ? 'pointer-events-none opacity-0' : 'opacity-100'
      )}
    >
      <KarnaStartupAnimation onComplete={previewing ? () => setPhase('fade-out') : undefined} />
    </div>
  )
}
