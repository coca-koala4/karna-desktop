import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Terminal, FileText, AlertCircle, Database, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EditorDiagnostic } from '../lib/file-capabilities'

export type BottomPanelTab = 'output' | 'terminal' | 'problems' | 'ingest'

export interface OutputLine {
  type: 'stdout' | 'stderr' | 'system'
  text: string
  timestamp?: number
}

export interface IngestStatusItem {
  filePath: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  message?: string
  progress?: number
}

interface BottomPanelProps {
  visible: boolean
  activeTab: BottomPanelTab
  height: number
  outputLines: OutputLine[]
  diagnostics: EditorDiagnostic[]
  ingestItems: IngestStatusItem[]
  terminalRef?: React.RefObject<HTMLDivElement | null>
  onTabChange: (tab: BottomPanelTab) => void
  onToggleVisibility: () => void
  onHeightChange: (height: number) => void
  onClearOutput?: () => void
  className?: string
}

const DEFAULT_HEIGHT = 300
const MIN_HEIGHT = 100
const MAX_HEIGHT = 600

const TABS: { id: BottomPanelTab; label: string; icon: React.ReactNode }[] = [
  { id: 'output', label: '输出', icon: <FileText size={14} /> },
  { id: 'terminal', label: '终端', icon: <Terminal size={14} /> },
  { id: 'problems', label: '问题', icon: <AlertCircle size={14} /> },
  { id: 'ingest', label: '文档解析', icon: <Database size={14} /> }
]

function SeverityIcon({ severity }: { severity: EditorDiagnostic['severity'] }) {
  if (severity === 'error') {
    return <span className="text-red-500"><AlertCircle size={12} fill="currentColor" /></span>
  }
  if (severity === 'warning') {
    return <span className="text-amber-500"><AlertCircle size={12} /></span>
  }
  if (severity === 'info') {
    return <span className="text-blue-400"><AlertCircle size={12} /></span>
  }
  return <span className="text-(--ui-text-quaternary)"><AlertCircle size={12} /></span>
}

function getSeverityCount(diagnostics: EditorDiagnostic[], severity: EditorDiagnostic['severity']) {
  return diagnostics.filter(d => d.severity === severity).length
}

export function BottomPanel({
  visible,
  activeTab,
  height,
  outputLines,
  diagnostics,
  ingestItems,
  terminalRef,
  onTabChange,
  onToggleVisibility,
  onHeightChange,
  onClearOutput,
  className
}: BottomPanelProps) {
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ y: 0, height: 0 })
  const outputContainerRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragStartRef.current = { y: e.clientY, height }

    const handleMouseMove = (ev: MouseEvent) => {
      const dy = dragStartRef.current.y - ev.clientY
      const newHeight = Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, dragStartRef.current.height + dy))
      onHeightChange(newHeight)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [height, onHeightChange])

  useEffect(() => {
    if (activeTab === 'output' && outputContainerRef.current) {
      outputContainerRef.current.scrollTop = outputContainerRef.current.scrollHeight
    }
  }, [outputLines, activeTab])

  const errorCount = getSeverityCount(diagnostics, 'error')
  const warningCount = getSeverityCount(diagnostics, 'warning')

  if (!visible) {
    return null
  }

  return (
    <div
      className={cn(
        'flex shrink-0 flex-col border-t border-(--ui-stroke-secondary) bg-(--ui-surface-secondary)',
        isDragging && 'select-none',
        className
      )}
      style={{ height }}
    >
      <div
        className="group relative h-1 shrink-0 cursor-ns-resize bg-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-color-accent)"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-x-0 -top-1 -bottom-1" />
      </div>

      <div className="flex h-9 shrink-0 items-center border-b border-(--ui-stroke-secondary) bg-(--ui-surface-secondary)">
        <div className="flex flex-1 items-center gap-0.5 px-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              className={cn(
                'flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors',
                activeTab === tab.id
                  ? 'bg-(--ui-control-active-background) text-foreground'
                  : 'text-(--ui-text-quaternary) hover:text-foreground'
              )}
              onClick={() => onTabChange(tab.id)}
              type="button"
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.id === 'problems' && (errorCount + warningCount > 0) && (
                <span className="flex items-center gap-1">
                  {errorCount > 0 && (
                    <span className="flex items-center gap-0.5 rounded bg-red-500/20 px-1 text-[10px] text-red-500">
                      {errorCount}
                    </span>
                  )}
                  {warningCount > 0 && (
                    <span className="flex items-center gap-0.5 rounded bg-amber-500/20 px-1 text-[10px] text-amber-500">
                      {warningCount}
                    </span>
                  )}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 pr-1">
          {activeTab === 'output' && onClearOutput && (
            <button
              className="rounded p-1 text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
              onClick={onClearOutput}
              title="清除输出"
              type="button"
            >
              <X size={14} />
            </button>
          )}
          <button
            className="rounded p-1 text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
            onClick={onToggleVisibility}
            title="隐藏面板"
            type="button"
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {activeTab === 'output' && (
          <div
            ref={outputContainerRef}
            className="h-full overflow-auto bg-(--ui-background) p-3 font-mono text-xs leading-relaxed"
          >
            {outputLines.length === 0 ? (
              <div className="flex h-full items-center justify-center text-(--ui-text-quaternary)">
                暂无输出
              </div>
            ) : (
              <div className="space-y-0.5">
                {outputLines.map((line, i) => (
                  <div
                    key={i}
                    className={cn(
                      'whitespace-pre-wrap break-all',
                      line.type === 'stderr' && 'text-red-400',
                      line.type === 'system' && 'text-(--ui-text-quaternary)'
                    )}
                  >
                    {line.text}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'terminal' && (
          <div
            ref={terminalRef}
            className="h-full overflow-auto bg-[#1e1e1e] p-0"
            style={{ fontFamily: 'var(--font-mono, Consolas, "Courier New", monospace)' }}
          />
        )}

        {activeTab === 'problems' && (
          <div className="h-full overflow-auto bg-(--ui-background)">
            {diagnostics.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-(--ui-text-quaternary)">
                <FileText size={24} className="opacity-50" />
                <span className="text-xs">暂无问题</span>
              </div>
            ) : (
              <div className="divide-y divide-(--ui-stroke-secondary)">
                {diagnostics.map((diag, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 px-3 py-2 text-xs transition-colors hover:bg-(--ui-control-hover-background) cursor-pointer"
                  >
                    <SeverityIcon severity={diag.severity} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-foreground">{diag.message}</div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-(--ui-text-quaternary)">
                        {diag.source && <span>{diag.source}</span>}
                        {diag.code && <span>[{diag.code}]</span>}
                        {diag.line !== undefined && (
                          <span>
                            第 {diag.line} 行
                            {diag.column !== undefined && `, 第 ${diag.column} 列`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'ingest' && (
          <div className="h-full overflow-auto bg-(--ui-background)">
            {ingestItems.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-(--ui-text-quaternary)">
                <Database size={24} className="opacity-50" />
                <span className="text-xs">暂无文档解析任务</span>
              </div>
            ) : (
              <div className="divide-y divide-(--ui-stroke-secondary)">
                {ingestItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 text-xs">
                    <div className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded-full',
                      item.status === 'completed' && 'bg-green-500/20 text-green-500',
                      item.status === 'processing' && 'bg-(--ui-color-accent)/20 text-(--ui-color-accent)',
                      item.status === 'error' && 'bg-red-500/20 text-red-500',
                      item.status === 'pending' && 'bg-(--ui-surface-secondary) text-(--ui-text-quaternary)'
                    )}>
                      {item.status === 'completed' && <ChevronUp size={12} className="rotate-180" />}
                      {item.status === 'processing' && <div className="size-2 animate-spin rounded-full border border-current border-t-transparent" />}
                      {item.status === 'error' && <X size={12} />}
                      {item.status === 'pending' && <div className="size-1.5 rounded-full bg-current" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-mono text-foreground">{item.filePath}</div>
                      {item.message && (
                        <div className={cn(
                          'mt-0.5 truncate text-[11px]',
                          item.status === 'error' ? 'text-red-400' : 'text-(--ui-text-quaternary)'
                        )}>
                          {item.message}
                        </div>
                      )}
                      {item.status === 'processing' && item.progress !== undefined && (
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-(--ui-surface-secondary)">
                          <div
                            className="h-full bg-(--ui-color-accent) transition-all duration-300"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function BottomPanelToggleButton({
  visible,
  errorCount,
  warningCount,
  onClick,
  className
}: {
  visible: boolean
  errorCount: number
  warningCount: number
  onClick: () => void
  className?: string
}) {
  return (
    <button
      className={cn(
        'flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors',
        visible
          ? 'bg-(--ui-control-active-background) text-foreground'
          : 'text-(--ui-text-quaternary) hover:bg-(--ui-control-hover-background) hover:text-foreground',
        className
      )}
      onClick={onClick}
      type="button"
    >
      {visible ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      <span>面板</span>
      {(errorCount + warningCount > 0) && (
        <span className="flex items-center gap-1">
          {errorCount > 0 && (
            <span className="flex items-center gap-0.5 rounded bg-red-500/20 px-1 text-[10px] text-red-500">
              {errorCount}
            </span>
          )}
          {warningCount > 0 && (
            <span className="flex items-center gap-0.5 rounded bg-amber-500/20 px-1 text-[10px] text-amber-500">
              {warningCount}
            </span>
          )}
        </span>
      )}
    </button>
  )
}

export { DEFAULT_HEIGHT, MIN_HEIGHT, MAX_HEIGHT }
