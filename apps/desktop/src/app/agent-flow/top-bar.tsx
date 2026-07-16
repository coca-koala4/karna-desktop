import { useNavigate } from 'react-router-dom'
import { useState, useRef, useEffect, useCallback } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'
import { NEW_CHAT_ROUTE } from '@/app/routes'

import { useAgentFlow } from './store'

interface AgentFlowTopBarProps {
  drawerVisible: boolean
  inspectorVisible: boolean
  runPanelVisible: boolean
  onToggleDrawer: () => void
  onToggleInspector: () => void
  onToggleRunPanel: () => void
  onSwapPanels?: () => void
  panelsSwapped?: boolean
}

export function AgentFlowTopBar({
  drawerVisible,
  inspectorVisible,
  runPanelVisible,
  onToggleDrawer,
  onToggleInspector,
  onToggleRunPanel,
  onSwapPanels,
  panelsSwapped = false
}: AgentFlowTopBarProps) {
  const navigate = useNavigate()
  const {
    workflowName,
    setWorkflowName,
    validation,
    running,
    saving,
    hasUnsavedChanges,
    lastSavedAt,
    arrangeNodes,
    saveWorkflow,
    runWorkflow,
    stopWorkflow,
    nodeResources,
    openInNewWindow,
    patchRuntimeConfig,
    currentWorkflow
  } = useAgentFlow()

  const [isEditingName, setIsEditingName] = useState(false)
  const [editingName, setEditingName] = useState(workflowName)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showErrorList, setShowErrorList] = useState(false)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const moreMenuRef = useRef<HTMLDivElement>(null)
  const errorListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setEditingName(workflowName)
  }, [workflowName])

  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [isEditingName])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showMoreMenu && moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false)
      }
      if (showErrorList && errorListRef.current && !errorListRef.current.contains(e.target as Node)) {
        setShowErrorList(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMoreMenu, showErrorList])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        void saveWorkflow()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [saveWorkflow])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = '您有未保存的更改，确定要离开吗？'
        return e.returnValue
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  const handleNameSubmit = () => {
    const trimmed = editingName.trim()
    if (trimmed) {
      setWorkflowName(trimmed)
    } else {
      setEditingName(workflowName)
    }
    setIsEditingName(false)
  }

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSubmit()
    } else if (e.key === 'Escape') {
      setEditingName(workflowName)
      setIsEditingName(false)
    }
  }

  const handleBack = () => {
    if (hasUnsavedChanges) {
      const confirmed = window.confirm('您有未保存的更改，确定要离开吗？')
      if (!confirmed) return
    }
    navigate(NEW_CHAT_ROUTE)
  }

  const errorCount = validation.errors.length
  const warningCount = validation.warnings.length

  const getValidationStatus = () => {
    if (errorCount > 0) return 'error'
    if (warningCount > 0) return 'warning'
    return 'success'
  }

  const validationStatus = getValidationStatus()

  const getSaveStatusText = () => {
    if (saving) return '保存中...'
    if (hasUnsavedChanges) return '未保存'
    if (lastSavedAt) {
      const date = new Date(lastSavedAt)
      const now = new Date()
      const diffMs = now.getTime() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      if (diffMins < 1) return '刚刚保存'
      if (diffMins < 60) return `${diffMins}分钟前保存`
      const diffHours = Math.floor(diffMins / 60)
      if (diffHours < 24) return `${diffHours}小时前保存`
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' 保存'
    }
    return '已保存'
  }

  const models = nodeResources?.models || [
    { id: 'deepseek-v4.1-pro', name: 'DeepSeek V4.1 Pro' },
    { id: 'deepseek-v4.1-fast', name: 'DeepSeek V4.1 Fast' },
    { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' },
    { id: 'deepseek-chat', name: 'DeepSeek Chat' }
  ]

  const selectedModel = currentWorkflow.runtimeConfig.defaultModel
  const currentModel = models.find(m => m.id === selectedModel) || models[0]

  return (
    <header
      className="relative z-20 flex h-[34px] shrink-0 items-center gap-1 border-b border-(--ui-stroke-secondary) bg-(--ui-surface)"
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-1"
        style={{
          paddingLeft: 'calc(var(--titlebar-controls-left, 0px) + 8px)',
          WebkitAppRegion: 'drag'
        } as React.CSSProperties}
      >
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} className="flex items-center gap-1">
          <button
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
            onClick={handleBack}
            title="回到 Karna"
          >
            <Codicon name="arrow-left" size={13} />
          </button>

          <button
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors',
              drawerVisible
                ? 'bg-(--ui-control-active-background) text-foreground'
                : 'text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
            )}
            onClick={onToggleDrawer}
            title={drawerVisible ? '隐藏侧边栏' : '显示侧边栏'}
          >
            <Codicon name="layout-sidebar-left" size={13} />
          </button>

          {onSwapPanels && (
            <button
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded transition-colors',
                panelsSwapped
                  ? 'bg-(--ui-control-active-background) text-foreground'
                  : 'text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
              )}
              onClick={onSwapPanels}
              title="交换左右面板"
            >
              <Codicon name="arrow-swap" size={13} />
            </button>
          )}
        </div>

        <div className="mx-1 h-4 w-px shrink-0 bg-(--ui-stroke-secondary)" />

        <button
          className="group flex min-w-0 items-center gap-1.5 rounded px-2 py-1 text-sm font-medium text-foreground transition-colors hover:bg-(--ui-control-hover-background)"
          onClick={() => setIsEditingName(true)}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {isEditingName ? (
            <input
              ref={nameInputRef}
              className="w-36 sm:w-48 rounded border border-(--ui-color-accent)/50 bg-(--ui-surface-secondary) px-2 py-0.5 text-sm outline-none"
              value={editingName}
              onChange={e => setEditingName(e.target.value)}
              onBlur={handleNameSubmit}
              onKeyDown={handleNameKeyDown}
            />
          ) : (
            <>
              <span className="truncate">{workflowName}</span>
              <Codicon name="edit" size={11} className="opacity-0 transition-opacity group-hover:opacity-100 shrink-0" />
              {hasUnsavedChanges && (
                <span className="h-1.5 w-1.5 rounded-full bg-(--ui-color-accent) shrink-0" />
              )}
            </>
          )}
        </button>

        <div className="ml-2 hidden items-center gap-1.5 text-[11px] text-(--ui-text-secondary) md:flex">
          {saving ? (
            <>
              <Codicon name="loading" size={11} className="animate-spin text-(--ui-color-accent)" />
              <span>保存中</span>
            </>
          ) : hasUnsavedChanges ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-(--ui-color-accent)" />
              <span>未保存</span>
            </>
          ) : (
            <>
              <Codicon name="check" size={11} className="text-emerald-500" />
              <span>{getSaveStatusText()}</span>
            </>
          )}
        </div>
      </div>

      <div
        className="flex shrink-0 items-center gap-1"
        style={{
          paddingRight: 'calc(var(--titlebar-tools-right, 160px) + 20px)',
          WebkitAppRegion: 'no-drag'
        } as React.CSSProperties}
      >
        <div className="relative">
          <button
            className={cn(
              'flex h-7 items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
              validationStatus === 'success' && 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400',
              validationStatus === 'warning' && 'bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400',
              validationStatus === 'error' && 'bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400'
            )}
            onClick={() => validationStatus !== 'success' && setShowErrorList(!showErrorList)}
          >
            {validationStatus === 'success' && <Codicon name="check" size={11} />}
            {validationStatus === 'warning' && <Codicon name="warning" size={11} />}
            {validationStatus === 'error' && <Codicon name="error" size={11} />}
            <span className="hidden sm:inline">
              {validationStatus === 'success' && '校验通过'}
              {validationStatus === 'warning' && `${warningCount}个警告`}
              {validationStatus === 'error' && `${errorCount}个错误`}
            </span>
          </button>

          {showErrorList && (validationStatus === 'error' || validationStatus === 'warning') && (
            <div
              ref={errorListRef}
              className="absolute right-0 top-full mt-1 w-72 rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-surface) p-1.5 shadow-xl z-50"
            >
              <div className="mb-1.5 px-2 text-[10px] font-semibold text-(--ui-text-secondary)">
                校验问题
              </div>
              <div className="max-h-56 overflow-y-auto">
                {validation.errors.map((err, i) => (
                  <div key={`err-${i}`} className="flex items-start gap-1.5 rounded px-2 py-1 text-[11px] hover:bg-(--ui-control-hover-background)">
                    <Codicon name="error" size={11} className="mt-0.5 shrink-0 text-red-500" />
                    <span className="text-red-600 dark:text-red-400">{err.userMessage}</span>
                  </div>
                ))}
                {validation.warnings.map((warn, i) => (
                  <div key={`warn-${i}`} className="flex items-start gap-1.5 rounded px-2 py-1 text-[11px] hover:bg-(--ui-control-hover-background)">
                    <Codicon name="warning" size={11} className="mt-0.5 shrink-0 text-amber-500" />
                    <span className="text-amber-600 dark:text-amber-400">{warn.userMessage}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button
          className="flex h-7 w-7 items-center justify-center rounded text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground disabled:opacity-50"
          onClick={() => {
            void saveWorkflow()
          }}
          title="保存 (Ctrl+S)"
          disabled={saving}
        >
          <Codicon name={saving ? 'loading' : 'save'} size={13} className={saving ? 'animate-spin' : ''} />
        </button>

        {running ? (
          <button
            className="flex h-7 items-center gap-1 rounded bg-red-500 px-2 text-[11px] font-medium text-white shadow-sm transition-colors hover:bg-red-600"
            onClick={() => {
              void stopWorkflow()
            }}
            title="停止运行"
          >
            <Codicon name="debug-stop" size={11} />
            <span>停止</span>
          </button>
        ) : (
          <button
            className="flex h-7 items-center gap-1 rounded bg-emerald-500 px-2 text-[11px] font-medium text-white shadow-sm transition-colors hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => {
              void runWorkflow()
            }}
            disabled={!validation.valid}
            title={validation.valid ? '运行' : `校验失败：${validation.errors[0]?.userMessage || '请修复错误'}`}
          >
            <Codicon name="play" size={11} />
            <span>运行</span>
          </button>
        )}

        <div className="mx-0.5 h-4 w-px shrink-0 bg-(--ui-stroke-secondary)" />

        <button
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded transition-colors',
            inspectorVisible
              ? 'bg-(--ui-control-active-background) text-foreground'
              : 'text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
          )}
          onClick={onToggleInspector}
          title="检查器 (Ctrl+\\)"
        >
          <Codicon name="inspect" size={13} />
        </button>

        <button
          className={cn(
            'flex h-7 w-7 items-center justify-center rounded transition-colors',
            runPanelVisible
              ? 'bg-(--ui-control-active-background) text-foreground'
              : 'text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
          )}
          onClick={onToggleRunPanel}
          title="运行面板 (Ctrl+`)"
        >
          <Codicon name={runPanelVisible ? 'chevron-up' : 'chevron-down'} size={13} />
        </button>

        <div className="relative" ref={moreMenuRef}>
          <button
            className="flex h-7 w-7 items-center justify-center rounded text-(--ui-text-secondary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            title="更多选项"
          >
            <Codicon name="ellipsis" size={13} />
          </button>

          {showMoreMenu && (
            <div className="absolute right-0 top-full mt-1 w-44 rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-surface) py-1 shadow-xl z-50">
              <div className="px-2 py-1">
                <div className="mb-1 px-1 text-[10px] font-medium text-(--ui-text-secondary)">模型选择</div>
                <div className="space-y-0.5 max-h-36 overflow-y-auto">
                  {models.map(model => (
                    <button
                      key={model.id}
                      className={cn(
                        'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px] transition-colors',
                        model.id === selectedModel
                          ? 'bg-(--ui-control-active-background) text-foreground'
                          : 'text-foreground hover:bg-(--ui-control-hover-background)'
                      )}
                      onClick={() => {
                        patchRuntimeConfig({ defaultModel: model.id })
                        setShowMoreMenu(false)
                      }}
                    >
                      {model.id === selectedModel && <Codicon name="check" size={11} />}
                      <span className={model.id === selectedModel ? '' : 'ml-4'}>{model.name}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="my-1 h-px bg-(--ui-stroke-secondary)" />
              <button
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-foreground transition-colors hover:bg-(--ui-control-hover-background)"
                onClick={() => {
                  arrangeNodes()
                  setShowMoreMenu(false)
                }}
              >
                <Codicon name="layout" size={11} />
                <span>整理布局</span>
              </button>
              <button
                className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[11px] text-foreground transition-colors hover:bg-(--ui-control-hover-background)"
                onClick={() => {
                  openInNewWindow()
                  setShowMoreMenu(false)
                }}
              >
                <Codicon name="link-external" size={11} />
                <span>新窗口打开</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
