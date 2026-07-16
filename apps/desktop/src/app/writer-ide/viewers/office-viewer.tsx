import { useState, useEffect, useMemo, useRef } from 'react'
import { FileText, Table, Presentation, ExternalLink, AlertTriangle, Loader2, CheckCircle2, Lock, FileQuestion, ShieldAlert, FileX, HardDrive, ChevronDown, Settings, Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'

export type OfficePreviewErrorType =
  | 'file_not_found'
  | 'permission_denied'
  | 'file_locked'
  | 'package_corrupted'
  | 'format_mismatch'
  | 'file_encrypted'
  | 'render_failed'
  | 'ingest_failed'
  | 'unknown'

export interface OfficeViewerProps {
  filePath: string
  fileType: 'docx' | 'xlsx' | 'pptx'
  content?: string
  ingestResultId?: string
  ingestStatus?: 'idle' | 'queued' | 'parsing' | 'parsed' | 'failed'
  ingestText?: string
  ingestWarnings?: string[]
  ingestError?: string
  errorType?: OfficePreviewErrorType
  errorMessage?: string
  compatibilityMode?: 'full' | 'safe_copy_only' | 'preview_only' | 'external_only'
  unsupportedFeatures?: string[]
  onOpenExternal?: () => void
  onRetryIngest?: () => void
}

function getFileName(filePath: string): string {
  const parts = filePath.split(/[/\\]/)
  return parts[parts.length - 1] || filePath
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function getFileTypeConfig(type: 'docx' | 'xlsx' | 'pptx') {
  switch (type) {
    case 'docx':
      return {
        label: 'Word 文档',
        icon: FileText,
        color: 'text-blue-500',
        bgColor: 'bg-blue-500/10',
      }
    case 'xlsx':
      return {
        label: 'Excel 表格',
        icon: Table,
        color: 'text-green-500',
        bgColor: 'bg-green-500/10',
      }
    case 'pptx':
      return {
        label: 'PowerPoint 演示',
        icon: Presentation,
        color: 'text-orange-500',
        bgColor: 'bg-orange-500/10',
      }
  }
}

function getErrorInfo(type: OfficePreviewErrorType): {
  icon: typeof FileX
  title: string
  description: string
  severity: 'error' | 'warning' | 'info'
} {
  switch (type) {
    case 'file_not_found':
      return {
        icon: FileQuestion,
        title: '文件不存在',
        description: '文件可能已被移动、重命名或删除。请检查文件路径是否正确。',
        severity: 'error'
      }
    case 'permission_denied':
      return {
        icon: ShieldAlert,
        title: '权限不足',
        description: '没有足够的权限访问该文件。请检查文件权限或尝试使用管理员权限。',
        severity: 'error'
      }
    case 'file_locked':
      return {
        icon: Lock,
        title: '文件被占用',
        description: '文件正在被其他程序独占使用。请关闭其他程序后重试，或使用外部程序打开。',
        severity: 'warning'
      }
    case 'package_corrupted':
      return {
        icon: FileX,
        title: '文件损坏',
        description: 'Office 文档包结构损坏，无法正常解析。文件可能不完整或已损坏。',
        severity: 'error'
      }
    case 'format_mismatch':
      return {
        icon: FileQuestion,
        title: '格式不匹配',
        description: '文件扩展名与实际内容格式不匹配。请确认文件类型是否正确。',
        severity: 'warning'
      }
    case 'file_encrypted':
      return {
        icon: Lock,
        title: '文件已加密',
        description: '该文档使用了密码保护，当前无法预览。请使用外部程序输入密码打开。',
        severity: 'warning'
      }
    case 'render_failed':
      return {
        icon: FileX,
        title: '渲染失败',
        description: '文档视觉渲染失败。您可以尝试文本降级预览，或使用外部程序打开。',
        severity: 'error'
      }
    case 'ingest_failed':
      return {
        icon: FileX,
        title: '文本提取失败',
        description: '无法从文档中提取文本内容。文件可能为空或格式不支持。',
        severity: 'warning'
      }
    default:
      return {
        icon: AlertTriangle,
        title: '预览错误',
        description: '预览时发生未知错误。您可以尝试重试或使用外部程序打开。',
        severity: 'error'
      }
  }
}

export function OfficeViewer({
  filePath,
  fileType,
  content,
  ingestResultId,
  ingestStatus: externalIngestStatus,
  ingestText,
  ingestWarnings,
  ingestError,
  errorType,
  errorMessage,
  compatibilityMode = 'preview_only',
  unsupportedFeatures = [],
  onOpenExternal,
  onRetryIngest,
}: OfficeViewerProps) {
  const [fileSize, setFileSize] = useState<number | null>(null)
  const [showOpenWithMenu, setShowOpenWithMenu] = useState(false)
  const [detectedApps, setDetectedApps] = useState<Array<{ id: string; name: string; executablePath: string }>>([])
  const [loadingApps, setLoadingApps] = useState(false)
  const [openError, setOpenError] = useState<string | null>(null)
  const [visualPreview, setVisualPreview] = useState<{
    state: 'idle' | 'loading' | 'ready' | 'failed'
    url?: string
    error?: string
  }>({ state: 'idle' })
  const menuRef = useRef<HTMLDivElement>(null)

  const fileName = getFileName(filePath)
  const fileConfig = getFileTypeConfig(fileType)
  const IconComponent = fileConfig.icon

  const effectiveStatus = externalIngestStatus || 'idle'
  const displayText = ingestText || content

  const errorInfo = useMemo(() => {
    if (!errorType) return null
    return getErrorInfo(errorType)
  }, [errorType])

  const isTextDegradedMode = errorType === 'render_failed' && displayText && displayText.length > 0

  const officeKind = useMemo<'word' | 'spreadsheet' | 'presentation'>(() => {
    if (fileType === 'docx') return 'word'
    if (fileType === 'xlsx') return 'spreadsheet'
    return 'presentation'
  }, [fileType])

  useEffect(() => {
    setFileSize(null)
    setDetectedApps([])
    setOpenError(null)
  }, [filePath])

  useEffect(() => {
    if (!window.karnaDesktop?.writerPreview) {
      setVisualPreview({ state: 'idle' })
      return
    }

    let cancelled = false
    let previewId: string | undefined
    let objectUrl: string | undefined

    const loadPreview = async () => {
      setVisualPreview({ state: 'loading' })
      try {
        const created = await window.karnaDesktop.writerPreview!.create({ filePath, kind: fileType })
        if (!created.ok || !created.previewId) {
          throw new Error(created.message || created.error || `无法创建${fileConfig.label}预览`)
        }
        previewId = created.previewId
        const manifest = await window.karnaDesktop.writerPreview!.get(previewId)
        if (!manifest.ok || manifest.format !== 'binary') {
          throw new Error(manifest.error || '预览转换结果无效')
        }

        const chunks: Uint8Array[] = []
        const totalChunks = Number(manifest.totalChunks || 0)
        for (let index = 0; index < totalChunks; index += 1) {
          const chunk = await window.karnaDesktop.writerPreview!.chunk(previewId, index)
          if (!chunk.ok || !chunk.data) throw new Error(chunk.error || '读取预览数据失败')
          const binary = window.atob(chunk.data)
          const bytes = new Uint8Array(binary.length)
          for (let offset = 0; offset < binary.length; offset += 1) bytes[offset] = binary.charCodeAt(offset)
          chunks.push(bytes)
        }

        const blobParts = chunks.map(chunk => chunk.buffer.slice(
          chunk.byteOffset,
          chunk.byteOffset + chunk.byteLength
        ) as ArrayBuffer)
        objectUrl = URL.createObjectURL(new Blob(blobParts, { type: 'application/pdf' }))
        if (!cancelled) setVisualPreview({ state: 'ready', url: objectUrl })
        else URL.revokeObjectURL(objectUrl)
      } catch (err) {
        if (!cancelled) {
          setVisualPreview({ state: 'failed', error: err instanceof Error ? err.message : '预览失败' })
        }
      }
    }

    void loadPreview()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      if (previewId) void window.karnaDesktop.writerPreview?.release(previewId)
    }
  }, [filePath, fileType])

  useEffect(() => {
    if (!showOpenWithMenu || detectedApps.length > 0) return

    const loadApps = async () => {
      setLoadingApps(true)
      try {
        const apps = await window.karnaDesktop?.officeApps?.list(officeKind)
        if (apps) setDetectedApps(apps)
      } catch {
        // ignore
      } finally {
        setLoadingApps(false)
      }
    }

    void loadApps()
  }, [showOpenWithMenu, officeKind, detectedApps.length])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowOpenWithMenu(false)
      }
    }

    if (showOpenWithMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showOpenWithMenu])

  const handleOpenWith = async (appId?: string, useSavedPreference = false) => {
    setShowOpenWithMenu(false)
    setOpenError(null)

    try {
      if (onOpenExternal && !appId && !useSavedPreference) {
        onOpenExternal()
        return
      }

      if (window.karnaDesktop?.officeApps?.open) {
        await window.karnaDesktop.officeApps.open({
          kind: officeKind,
          filePath,
          appId
        })
      } else {
        const normalized = filePath.replace(/\\/g, '/')
        const fileUrl = `file:///${normalized.replace(/^\//, '')}`
        void window.karnaDesktop?.openExternal?.(fileUrl)
      }
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : '打开失败')
    }
  }

  const handleSetDefault = async (appId: string) => {
    try {
      await window.karnaDesktop?.officeApps?.setPreference(officeKind, { mode: 'detected', appId })
      await handleOpenWith(appId)
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : '保存默认打开方式失败')
    }
  }

  const handleUseSystemDefault = async () => {
    try {
      await window.karnaDesktop?.officeApps?.setPreference(officeKind, { mode: 'system' })
      await handleOpenWith('system')
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : '保存系统默认打开方式失败')
    }
  }

  const handlePickCustomApp = async () => {
    try {
      const choice = await window.karnaDesktop?.officeApps?.pickCustom(officeKind)
      if (!choice) return
      await window.karnaDesktop?.officeApps?.setPreference(officeKind, choice)
      await handleOpenWith(undefined, true)
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : '选择自定义程序失败')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-4xl space-y-6 pb-24">
          <div className="flex flex-col items-center gap-4 rounded-xl border border-(--ui-stroke-secondary) bg-(--ui-surface-primary) p-8 text-center">
            <div className={`flex size-20 items-center justify-center rounded-2xl ${fileConfig.bgColor}`}>
              <IconComponent className={`size-10 ${fileConfig.color}`} />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-(--ui-text-primary)">{fileName}</h2>
              <p className="text-sm text-(--ui-text-secondary)">{fileConfig.label}</p>
            </div>

            <div className="flex items-center gap-4 text-sm text-(--ui-text-tertiary)">
              {fileSize !== null && (
                <span className="flex items-center gap-1.5">
                  <HardDrive className="size-3.5" />
                  {formatFileSize(fileSize)}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-(--ui-text-quaternary)" />
                {fileType.toUpperCase()}
              </span>
            </div>

            {isTextDegradedMode && (
              <div className="rounded-md bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                文本降级模式
              </div>
            )}
          </div>

          {visualPreview.state === 'loading' && (
            <div className="flex min-h-64 items-center justify-center gap-2 rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-surface-primary) text-sm text-(--ui-text-secondary)">
              <Loader2 className="size-4 animate-spin" />
              正在生成{fileConfig.label}视觉预览...
            </div>
          )}

          {visualPreview.state === 'ready' && visualPreview.url && (
            <div className="min-h-[640px] overflow-hidden rounded-lg border border-(--ui-stroke-secondary) bg-white">
              <iframe
                className="h-[max(70vh,640px)] w-full border-0"
                src={visualPreview.url}
                title={`${fileName} 视觉预览`}
              />
            </div>
          )}

          {visualPreview.state === 'failed' && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-700 dark:text-amber-400">
              视觉预览不可用：{visualPreview.error}。下方仍会独立显示文本提取结果和外部打开选项。
            </div>
          )}

          {errorInfo && (
            <div className={`rounded-lg border p-4 ${
              errorInfo.severity === 'error'
                ? 'border-red-500/20 bg-red-500/5'
                : errorInfo.severity === 'warning'
                  ? 'border-amber-500/20 bg-amber-500/5'
                  : 'border-blue-500/20 bg-blue-500/5'
            }`}>
              <div className="flex gap-3">
                <errorInfo.icon className={`mt-0.5 size-5 shrink-0 ${
                  errorInfo.severity === 'error'
                    ? 'text-red-500'
                    : errorInfo.severity === 'warning'
                      ? 'text-amber-500'
                      : 'text-blue-500'
                }`} />
                <div className="space-y-1">
                  <h4 className={`text-sm font-medium ${
                    errorInfo.severity === 'error'
                      ? 'text-red-700 dark:text-red-400'
                      : errorInfo.severity === 'warning'
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-blue-700 dark:text-blue-400'
                  }`}>
                    {errorInfo.title}
                  </h4>
                  <p className={`text-sm ${
                    errorInfo.severity === 'error'
                      ? 'text-red-600/80 dark:text-red-400/80'
                      : errorInfo.severity === 'warning'
                        ? 'text-amber-600/80 dark:text-amber-400/80'
                        : 'text-blue-600/80 dark:text-blue-400/80'
                  }`}>
                    {errorInfo.description}
                  </p>
                  {errorMessage && (
                    <p className="text-xs text-(--ui-text-tertiary)">
                      详细信息：{errorMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {unsupportedFeatures.length > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    兼容性提示
                  </h4>
                  <p className="text-sm text-amber-600/80 dark:text-amber-400/80">
                    该文档包含以下高级功能，预览或编辑时可能不被完全支持：
                  </p>
                  <ul className="list-inside list-disc space-y-0.5 text-xs text-amber-600/80 dark:text-amber-400/80">
                    {unsupportedFeatures.map((feature, i) => (
                      <li key={i}>{feature}</li>
                    ))}
                  </ul>
                  <p className="text-xs text-amber-600/60 dark:text-amber-400/60">
                    如需完整查看或编辑，请使用外部程序打开。
                  </p>
                </div>
              </div>
            </div>
          )}

          {!errorInfo && compatibilityMode !== 'full' && unsupportedFeatures.length === 0 && (
            <div className="rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) p-4">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 size-5 shrink-0 text-(--ui-text-secondary)" />
                <div className="space-y-1">
                  <h4 className="text-sm font-medium text-(--ui-text-primary)">
                    预览模式
                  </h4>
                  <p className="text-sm text-(--ui-text-secondary)">
                    {compatibilityMode === 'preview_only'
                      ? '当前为只读视觉预览模式；如需保留 Word 的完整格式，请使用外部程序编辑。'
                      : compatibilityMode === 'safe_copy_only'
                        ? '仅支持编辑安全副本，不会修改原文件。'
                        : '仅支持使用外部程序打开编辑。'}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-medium text-(--ui-text-primary)">文档处理状态</h4>
              <div className="flex items-center gap-2">
                {effectiveStatus === 'idle' && (
                  <>
                    <span className="size-2 rounded-full bg-(--ui-text-quaternary)" />
                    <span className="text-xs text-(--ui-text-tertiary)">待处理</span>
                  </>
                )}
                {(effectiveStatus === 'queued' || effectiveStatus === 'parsing') && (
                  <>
                    <Loader2 className="size-3.5 animate-spin text-blue-500" />
                    <span className="text-xs text-blue-500">
                      {effectiveStatus === 'queued' ? '等待处理...' : '正在提取文本...'}
                    </span>
                  </>
                )}
                {effectiveStatus === 'parsed' && (
                  <>
                    <CheckCircle2 className="size-3.5 text-green-500" />
                    <span className="text-xs text-green-500">已完成</span>
                  </>
                )}
                {effectiveStatus === 'failed' && (
                  <>
                    <AlertTriangle className="size-3.5 text-red-500" />
                    <span className="text-xs text-red-500">处理失败</span>
                  </>
                )}
              </div>
            </div>
            {ingestResultId && (
              <p className="text-xs text-(--ui-text-quaternary)">
                处理 ID: {ingestResultId}
              </p>
            )}
            {ingestError && (
              <p className="mt-2 text-xs text-red-500">
                {ingestError}
              </p>
            )}
            {ingestWarnings && ingestWarnings.length > 0 && (
              <div className="mt-2 space-y-1">
                {ingestWarnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-500">
                    警告：{w}
                  </p>
                ))}
              </div>
            )}
            {effectiveStatus === 'failed' && onRetryIngest && (
              <Button
                className="mt-3"
                onClick={onRetryIngest}
                size="sm"
                variant="outline"
              >
                重试解析
              </Button>
            )}
          </div>

          {displayText && (effectiveStatus === 'parsed' || isTextDegradedMode) && (
            <div className="rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-surface-primary)">
              <div className="border-b border-(--ui-stroke-secondary) px-4 py-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-(--ui-text-primary)">
                    {isTextDegradedMode ? '文本降级预览' : '文本内容预览'}
                  </h4>
                  {displayText.length > 0 && (
                    <span className="text-xs text-(--ui-text-quaternary">
                      {displayText.length} 字
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-(--ui-text-tertiary)">
                  {isTextDegradedMode
                    ? '视觉渲染失败，显示提取的文本内容（格式可能不完整）'
                    : '从文档中提取的文本内容（预览模式，暂不支持编辑）'}
                </p>
              </div>
              <div className="max-h-96 overflow-auto p-4">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-(--ui-text-secondary)">
                  {displayText}
                </pre>
              </div>
            </div>
          )}

          {!displayText && effectiveStatus === 'idle' && !errorInfo && (
            <div className="rounded-lg border border-dashed border-(--ui-stroke-secondary) bg-(--ui-surface-secondary)/50 p-8 text-center">
              <div className={`mx-auto mb-3 flex size-12 items-center justify-center rounded-xl ${fileConfig.bgColor}`}>
                <IconComponent className={`size-6 ${fileConfig.color}`} />
              </div>
              <p className="text-sm text-(--ui-text-tertiary)">
                文档尚未处理，正在自动解析...
              </p>
            </div>
          )}

          {!displayText && effectiveStatus === 'failed' && (
            <div className="rounded-lg border border-dashed border-red-500/20 bg-red-500/5 p-8 text-center">
              <FileX className="mx-auto mb-3 size-12 text-red-500/60" />
              <p className="text-sm text-red-600 dark:text-red-400">
                无法提取文本内容
              </p>
              <p className="mt-1 text-xs text-red-500/60">
                请尝试使用外部程序打开查看
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-(--ui-stroke-secondary) bg-(--ui-surface-primary) px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <p className="text-xs text-(--ui-text-quaternary)">
              IDE 内视觉预览与文本提取互不阻塞
            </p>
            {openError && (
              <p className="text-xs text-red-500">
                {openError}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative" ref={menuRef}>
              <Button
                size="sm"
                onClick={() => setShowOpenWithMenu(!showOpenWithMenu)}
                className="gap-2"
              >
                <ExternalLink className="size-4" />
                打开方式
                <ChevronDown className="size-3.5" />
              </Button>
              {showOpenWithMenu && (
                <div className="absolute bottom-full right-0 mb-2 min-w-[200px] rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-surface-primary) shadow-lg">
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-(--ui-surface-secondary)"
                    onClick={() => handleOpenWith('system')}
                  >
                    <Monitor className="size-4 text-(--ui-text-tertiary)" />
                    <span>跟随系统默认</span>
                  </button>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-(--ui-text-tertiary) hover:bg-(--ui-surface-secondary)"
                    onClick={() => void handleUseSystemDefault()}
                  >
                    <span className="ml-6">设为此类文档默认</span>
                  </button>
                  <div className="border-t border-(--ui-stroke-secondary)" />
                  {loadingApps && (
                    <div className="px-3 py-2 text-xs text-(--ui-text-tertiary)">
                      正在检测程序...
                    </div>
                  )}
                  {!loadingApps && detectedApps.length === 0 && (
                    <div className="px-3 py-2 text-xs text-(--ui-text-tertiary)">
                      未检测到其他 Office 程序
                    </div>
                  )}
                  {detectedApps.map(app => (
                    <div className="flex items-center hover:bg-(--ui-surface-secondary)" key={app.id}>
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left text-sm"
                        onClick={() => handleOpenWith(app.id)}
                      >
                        <Settings className="size-4 shrink-0 text-(--ui-text-tertiary)" />
                        <span className="flex-1 truncate">{app.name}</span>
                      </button>
                      <button
                        className="shrink-0 px-2 py-2 text-[11px] text-(--ui-text-tertiary) hover:text-(--ui-text-primary)"
                        onClick={() => void handleSetDefault(app.id)}
                        title={`将 ${app.name} 设为此类文档默认程序`}
                      >
                        设为默认
                      </button>
                    </div>
                  ))}
                  <div className="border-t border-(--ui-stroke-secondary)" />
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-(--ui-surface-secondary)"
                    onClick={() => void handlePickCustomApp()}
                  >
                    <Settings className="size-4 text-(--ui-text-tertiary)" />
                    <span>选择自定义 EXE…</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
