import { useEffect, useRef, useState, useCallback } from 'react'
import { startFlowStudio, stopFlowStudio, getActiveSession, type FlowStudioSession } from './flow-host'
import { Button } from '@/components/ui/button'
import { Loader2, ExternalLink, X, RefreshCw, Maximize2, Minimize2 } from 'lucide-react'

interface FlowStudioEmbedProps {
  workspaceId: string
  workflowId?: string
  onClose?: () => void
  onWorkflowSaved?: (workflowId: string, version: number) => void
}

export function FlowStudioEmbed({ workspaceId, workflowId, onClose, onWorkflowSaved }: FlowStudioEmbedProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [session, setSession] = useState<FlowStudioSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    let mounted = true

    async function init() {
      try {
        setLoading(true)
        setError(null)

        let sess = getActiveSession()
        if (!sess) {
          sess = await startFlowStudio({
            workspaceId,
            workflowId,
            mode: 'iframe'
          })
        }

        if (mounted) {
          setSession(sess)
          setLoading(false)
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to start Flow Studio')
          setLoading(false)
        }
      }
    }

    void init()

    return () => {
      mounted = false
    }
  }, [workspaceId, workflowId])

  const handleIframeLoad = useCallback(() => {
    setLoading(false)
  }, [])

  const handleRefresh = useCallback(() => {
    if (iframeRef.current && session) {
      setLoading(true)
      iframeRef.current.src = session.url
    }
  }, [session])

  const handleOpenExternal = useCallback(() => {
    if (session) {
      window.open(session.url, '_blank')
    }
  }, [session])

  const handleStop = useCallback(async () => {
    await stopFlowStudio()
    setSession(null)
    onClose?.()
  }, [onClose])

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (!session) return
      if (!event.origin.startsWith('http://127.0.0.1')) return

      const data = event.data
      if (data?.type === 'workflow.saved') {
        onWorkflowSaved?.(data.workflowId, data.version)
      }
    }

    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [session, onWorkflowSaved])

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#202020]">
        <div className="text-center space-y-4">
          <div className="text-red-400 text-lg">Flow Studio 启动失败</div>
          <div className="text-neutral-400 text-sm max-w-md">{error}</div>
          <div className="text-neutral-500 text-xs">
            请确认 karna-flow-studio 已正确安装，或尝试重启应用
          </div>
          <div className="flex gap-2 justify-center pt-2">
            <Button variant="outline" size="sm" onClick={onClose}>关闭</Button>
            <Button size="sm" onClick={() => window.location.reload()}>重试</Button>
          </div>
        </div>
      </div>
    )
  }

  if (loading || !session) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#202020]">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mx-auto" />
          <div className="text-neutral-300 text-sm">正在启动 Karna Flow Studio...</div>
          <div className="text-neutral-500 text-xs">
            基于 ComfyUI 工作流引擎的多智能体流态工坊
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col h-full w-full bg-[#202020] ${fullscreen ? 'fixed inset-0 z-50' : ''}`}>
      <div className="flex items-center justify-between h-10 px-3 bg-[#282828] border-b border-[#3c3c3c] shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-neutral-300 text-sm font-medium">Karna Flow Studio</span>
          <span className="text-neutral-500 text-xs">:{session.port}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 text-neutral-400 hover:text-white" onClick={handleRefresh} title="刷新">
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-neutral-400 hover:text-white" onClick={handleOpenExternal} title="在浏览器中打开">
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-neutral-400 hover:text-white" onClick={() => setFullscreen(!fullscreen)} title={fullscreen ? '退出全屏' : '全屏'}>
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-7 w-7 text-neutral-400 hover:text-red-400" onClick={handleStop} title="关闭">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#202020] z-10">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
          </div>
        )}
        <iframe
          ref={iframeRef}
          src={session.url}
          className="w-full h-full border-0"
          onLoad={handleIframeLoad}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
          title="Karna Flow Studio"
        />
      </div>
    </div>
  )
}

export default FlowStudioEmbed
