import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

export function KarnaStartupAnimation({ className, onComplete }: { className?: string; onComplete?: () => void }) {
  useEffect(() => {
    if (!onComplete) {return}
    const timer = setTimeout(onComplete, 2000)

    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <div className={cn('grid place-items-center', className)}>
      <div
        className="relative"
        style={{ width: 'min(80vw, 520px)' }}
      >
        <style>{`
          @keyframes letter-write {
            0% {
              clip-path: polygon(0 0, 0 0, 0 100%, 0 100%);
              opacity: 0.3;
            }
            60% {
              opacity: 0.9;
            }
            100% {
              clip-path: polygon(0 0, 150% 0, 100% 100%, 0 100%);
              opacity: 1;
            }
          }
          @keyframes underline-sweep {
            0% { transform: scaleX(0); transform-origin: left center; opacity: 0; }
            20% { opacity: 1; }
            100% { transform: scaleX(1); transform-origin: left center; opacity: 1; }
          }
          @keyframes subtitle-fade {
            0% { opacity: 0; transform: translateY(6px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes soft-glow {
            0%, 100% { text-shadow: 0 0 20px color-mix(in srgb, var(--theme-primary) 35%, transparent); }
            50% { text-shadow: 0 0 32px color-mix(in srgb, var(--theme-primary) 55%, transparent), 0 0 60px color-mix(in srgb, var(--theme-midground) 30%, transparent); }
          }
          .ks-wordmark {
            display: flex;
            align-items: baseline;
            justify-content: center;
            gap: 0.02em;
            font-family: var(--dt-font-wordmark), system-ui, sans-serif;
            font-weight: 900;
            font-size: clamp(56px, 14vw, 120px);
            line-height: 1;
            letter-spacing: 0.04em;
            color: var(--theme-primary);
            user-select: none;
          }
          .ks-letter {
            display: inline-block;
            clip-path: polygon(0 0, 0 0, 0 100%, 0 100%);
            opacity: 0;
            animation: letter-write 0.42s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          }
          .ks-l1 { animation-delay: 0.05s; }
          .ks-l2 { animation-delay: 0.2s; }
          .ks-l3 { animation-delay: 0.35s; }
          .ks-l4 { animation-delay: 0.5s; }
          .ks-l5 { animation-delay: 0.65s; }
          .ks-underline-wrap {
            margin-top: 14px;
            height: 2px;
            width: 100%;
            transform: scaleX(0);
            opacity: 0;
            background: linear-gradient(
              90deg,
              var(--theme-primary),
              var(--theme-midground),
              var(--theme-primary)
            );
            border-radius: 2px;
            animation: underline-sweep 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards;
            animation-delay: 0.9s;
          }
          .ks-subtitle {
            margin-top: 18px;
            text-align: center;
            font-family: var(--dt-font-sans), system-ui, sans-serif;
            font-size: 12px;
            font-weight: 500;
            letter-spacing: 0.32em;
            color: var(--theme-muted-foreground);
            opacity: 0;
            animation: subtitle-fade 0.4s ease-out forwards;
            animation-delay: 1.25s;
          }
          .ks-glow {
            animation: soft-glow 3s ease-in-out infinite;
            animation-delay: 1.1s;
          }
        `}</style>

        <div className="ks-wordmark ks-glow">
          <span className="ks-letter ks-l1">K</span>
          <span className="ks-letter ks-l2">A</span>
          <span className="ks-letter ks-l3">R</span>
          <span className="ks-letter ks-l4">N</span>
          <span className="ks-letter ks-l5">A</span>
        </div>
        <div className="ks-underline-wrap" />
        <div className="ks-subtitle">你的专属创作工作站</div>
      </div>
    </div>
  )
}

export function KarnaThinkingMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex items-center justify-center', className)}
      role="presentation"
    >
      <svg
        className="thinking-svg text-[var(--theme-primary)]"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        style={{ width: '3.5em', height: '1.2em' }}
        viewBox="0 0 70 24"
      >
        <style>{`
          @keyframes draw-stroke {
            0% { stroke-dashoffset: 60; }
            18% { stroke-dashoffset: 0; }
            100% { stroke-dashoffset: 0; }
          }
          @keyframes fade-cycle {
            0%, 92%, 100% { opacity: 0.08; }
            30%, 70% { opacity: 1; }
          }
          @keyframes dot-pop {
            0%, 25%, 100% { opacity: 0; transform: scale(0.5); }
            40%, 75% { opacity: 1; transform: scale(1); }
          }
          @keyframes breathe {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
          .t-stroke {
            stroke-dasharray: 60;
            stroke-dashoffset: 60;
            animation: draw-stroke 2.2s ease-in-out infinite;
          }
          .t-dot {
            opacity: 0;
            animation: dot-pop 2.2s ease-in-out infinite;
          }
          .thinking-svg {
            animation: breathe 2.2s ease-in-out infinite;
          }
          .s1 { animation-delay: 0s; }
          .s2 { animation-delay: 0.1s; }
          .s3 { animation-delay: 0.2s; }
          .s4 { animation-delay: 0.3s; }
          .s5 { animation-delay: 0.4s; }
          .s6 { animation-delay: 0.5s; }
          .s7 { animation-delay: 0.6s; }
          .s8 { animation-delay: 0.7s; }
          .s9 { animation-delay: 0.85s; }
          .s10 { animation-delay: 0.95s; }
          .d1 { animation-delay: 0.65s; }
        `}</style>
        <g style={{ animation: 'fade-cycle 2.2s ease-in-out infinite' }}>
          <path className="t-stroke s1" d="M4 4 L4 20" />
          <path className="t-stroke s2" d="M4 12 L11 4" />
          <path className="t-stroke s3" d="M4 12 L11 20" />
          <path className="t-stroke s4" d="M18 16 C18 10, 24 10, 24 15 C24 20, 18 20, 18 16" />
          <path className="t-stroke s5" d="M24 12 L24 20" />
          <path className="t-stroke s6" d="M30 20 L30 8" />
          <path className="t-stroke s7" d="M30 9 C34 8, 36 10, 35 14" />
          <path className="t-stroke s8" d="M41 20 L41 8 C41 6, 46 6, 46 8 L46 20" />
          <path className="t-stroke s9" d="M54 16 C54 10, 60 10, 60 15 C60 20, 54 20, 54 16" />
          <path className="t-stroke s10" d="M60 12 L60 20" />
          <circle className="t-dot d1" cx="33" cy="5" fill="currentColor" r="1.3" stroke="none" />
        </g>
      </svg>
    </span>
  )
}

export function KarnaPageLoader({
  className,
  label
}: {
  className?: string
  label?: string
}) {
  const [bounceIndex, setBounceIndex] = useState(0)
  const [dots, setDots] = useState(0)

  useEffect(() => {
    const bounceId = setInterval(() => setBounceIndex(i => (i + 1) % 5), 180)
    const dotId = setInterval(() => setDots(d => (d + 1) % 4), 400)

    return () => {
      clearInterval(bounceId)
      clearInterval(dotId)
    }
  }, [])

  const letters = ['K', 'a', 'r', 'n', 'a']

  return (
    <div
      className={cn(
        'grid h-full place-items-center gap-5',
        className
      )}
      role="status"
    >
      <div className="relative flex items-end gap-0.5">
        <style>{`
          @keyframes letter-bounce {
            0%, 100% { transform: translateY(0) scale(1); }
            30% { transform: translateY(-12px) scale(1.1); }
            60% { transform: translateY(2px) scale(0.95); }
          }
          @keyframes pen-trail {
            0% { stroke-dashoffset: 100; opacity: 0; }
            20% { opacity: 0.6; }
            100% { stroke-dashoffset: 0; opacity: 0; }
          }
          .bounce-letter {
            display: inline-block;
            font-weight: 800;
            font-size: 2rem;
            font-family: var(--dt-font-wordmark, inherit);
            color: var(--theme-primary);
            transition: transform 0.15s ease;
          }
          .pen-trail {
            position: absolute;
            bottom: -2px;
            left: 0;
            width: 100%;
            height: 3px;
            stroke: var(--theme-primary);
            stroke-linecap: round;
          }
        `}</style>
        {letters.map((letter, i) => (
          <span
            className="bounce-letter"
            key={i}
            style={{
              animation: bounceIndex === i ? 'letter-bounce 0.5s ease-out' : 'none',
              transform: bounceIndex === i ? undefined : 'translateY(0) scale(1)'
            }}
          >
            {letter}
          </span>
        ))}
        <svg className="pen-trail" preserveAspectRatio="none" viewBox="0 0 100 3">
          <path
            d="M0 1.5 Q25 0 50 1.5 Q75 3 100 1.5"
            fill="none"
            strokeDasharray="100"
            style={{ animation: 'pen-trail 0.9s ease-out infinite' }}
          />
        </svg>
      </div>
      {label && (
        <div className="text-sm text-[var(--theme-foreground)]/60 font-medium">
          {label}{'.'.repeat(dots)}
        </div>
      )}
    </div>
  )
}
