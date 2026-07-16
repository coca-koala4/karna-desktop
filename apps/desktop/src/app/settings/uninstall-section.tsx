import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { DesktopUninstallMode, DesktopUninstallSummary } from '@/global'
import { AlertTriangle, Loader2, Trash2 } from '@/lib/icons'
import { cn } from '@/lib/utils'

import { SectionHeading } from './primitives'

interface ModeOption {
  mode: DesktopUninstallMode
  title: string
  description: string
  consequence: string
  needsAgent: boolean
}

const OPTIONS: ModeOption[] = [
  {
    mode: 'gui',
    title: 'Uninstall Karna desktop / 仅卸载桌面客户端',
    description: '移除此桌面应用。Karna 智能体、配置和聊天记录将全部保留。',
    consequence: '桌面客户端（此应用及其数据）',
    needsAgent: false
  },
  {
    mode: 'lite',
    title: '卸载客户端和智能体，保留数据',
    description: '移除应用和 Karna 智能体，但保留配置、聊天记录和密钥，以便将来重新安装。',
    consequence: '桌面客户端和 Karna 智能体（配置、聊天记录和密钥将被保留）',
    needsAgent: true
  },
  {
    mode: 'full',
    title: 'Uninstall everything / 完全卸载',
    description: '移除应用、智能体和所有用户数据——包括配置、聊天记录、定时任务、密钥和日志。',
    consequence: '所有内容——桌面客户端、Karna 智能体，以及你的所有配置、聊天记录、密钥和日志',
    needsAgent: true
  }
]

export function UninstallSection() {
  const [summary, setSummary] = useState<DesktopUninstallSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<DesktopUninstallMode | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const bridge = window.hermesDesktop?.uninstall

    if (!bridge) {
      setLoading(false)

      return
    }

    void bridge
      .summary()
      .then(result => {
        if (alive) {
          setSummary(result)
        }
      })
      .catch(() => {
      })
      .finally(() => {
        if (alive) {
          setLoading(false)
        }
      })

    return () => {
      alive = false
    }
  }, [])

  const bridge = window.hermesDesktop?.uninstall

  if (!bridge) {
    return null
  }

  const agentInstalled = summary?.agent_installed ?? false
  const visibleOptions = OPTIONS.filter(opt => agentInstalled || !opt.needsAgent)

  const handleConfirm = async () => {
    if (!pending) {
      return
    }

    setRunning(true)
    setError(null)

    try {
      const result = await bridge.run(pending)

      if (!result.ok) {
        setError(result.message || result.error || '卸载无法启动。')
        setRunning(false)
        setPending(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRunning(false)
      setPending(null)
    }
  }

  const pendingOption = OPTIONS.find(opt => opt.mode === pending) ?? null

  return (
    <div className="mx-auto mt-8 w-full max-w-2xl">
      <SectionHeading icon={AlertTriangle} title="危险操作区" />

      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
        {loading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            正在检查已安装的内容…
          </div>
        ) : pendingOption ? (
          <div>
            <p className="text-sm font-medium text-destructive">确认卸载</p>
            <p className="mt-1 text-xs text-muted-foreground">
              这将移除 {pendingOption.consequence}。此操作无法撤销。
            </p>
            {summary?.running_app_path && (
              <p className="mt-1 font-mono text-[0.68rem] text-muted-foreground/60">应用: {summary.running_app_path}</p>
            )}
            {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button disabled={running} onClick={() => void handleConfirm()} size="sm" variant="destructive">
                {running && <Loader2 className="size-3 animate-spin" />}
                {running ? '正在卸载…' : '确认卸载'}
              </Button>
              <Button disabled={running} onClick={() => setPending(null)} size="sm" variant="text">
                取消
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">卸载 Karna</p>
            <p className="text-xs text-muted-foreground">
              选择要移除的内容。应用将关闭以完成卸载；随时可以重新运行安装程序返回。
            </p>
            <div className="mt-1 flex flex-col gap-2">
              {visibleOptions.map(opt => (
                <button
                  className={cn(
                    'flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2.5 text-left transition',
                    'hover:border-destructive/40 hover:bg-destructive/5'
                  )}
                  key={opt.mode}
                  onClick={() => {
                    setError(null)
                    setPending(opt.mode)
                  }}
                  type="button"
                >
                  <Trash2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{opt.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{opt.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
