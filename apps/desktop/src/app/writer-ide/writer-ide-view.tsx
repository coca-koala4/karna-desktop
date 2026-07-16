import type React from 'react'
import { type MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { FileTypeIcon } from '@/components/ui/file-type-icon'
import { revealDesktopPath } from '@/lib/desktop-fs'
import { cn } from '@/lib/utils'
import {
  getCapabilityForFile,
  getFileName,
  type EditorSelection
} from './lib/file-capabilities'
import { useDocumentSessions } from './lib/use-document-sessions'
import { useEditorCommands } from './lib/use-editor-commands'
import { EditorContainer } from './components/editor-container'
import { EditorToolbar } from './components/editor-toolbar'
import { BottomPanel, type BottomPanelTab, type OutputLine, type IngestStatusItem, DEFAULT_HEIGHT as BOTTOM_PANEL_DEFAULT_HEIGHT } from './components/bottom-panel'

import { AgentDock } from './agent-dock'
import { ProjectAgentPanel } from './project-agent-panel'
import { WriterIDEHeader } from './writer-ide-header'
import { useWriterProject } from './project-context'
import { WriterOsPanel } from './writer-os-panel'
import { useIdeFileTree } from './use-ide-file-tree'
import { WorkspaceExplorer } from './workspace-explorer'
import { useWriterContextEnvelope } from './lib/use-context-envelope'

interface WriterIDEViewProps {
  workspaceId: string
  projectName: string
  rootPath: string
  onHasUnsavedChangesChange?: (hasUnsaved: boolean) => void
  chatView?: React.ReactNode
  onBack?: () => void
}

const DEFAULT_LEFT_WIDTH = 260
const DEFAULT_RIGHT_WIDTH = 420
const MIN_PANEL_SIZE = 180
const BOTTOM_PANEL_HEIGHT = BOTTOM_PANEL_DEFAULT_HEIGHT

type DragTarget = 'explorer' | 'assistant' | null

interface WriterIdeLayoutState {
  explorerVisible: boolean
  assistantVisible: boolean
  explorerSide: 'left' | 'right'
  explorerWidth: number
  assistantWidth: number
}

function loadWriterIdeLayout(workspaceId: string): WriterIdeLayoutState {
  const fallback: WriterIdeLayoutState = {
    explorerVisible: true,
    assistantVisible: true,
    explorerSide: 'left',
    explorerWidth: DEFAULT_LEFT_WIDTH,
    assistantWidth: DEFAULT_RIGHT_WIDTH
  }
  try {
    const raw = window.localStorage.getItem(`karna:writer-ide:layout:${workspaceId}`)
    if (!raw) return fallback
    const saved = JSON.parse(raw) as Partial<WriterIdeLayoutState>
    return {
      explorerVisible: saved.explorerVisible !== false,
      assistantVisible: saved.assistantVisible !== false,
      explorerSide: saved.explorerSide === 'right' ? 'right' : 'left',
      explorerWidth: Math.max(MIN_PANEL_SIZE, Number(saved.explorerWidth) || DEFAULT_LEFT_WIDTH),
      assistantWidth: Math.max(MIN_PANEL_SIZE, Number(saved.assistantWidth) || DEFAULT_RIGHT_WIDTH)
    }
  } catch {
    return fallback
  }
}

export function WriterIDEView({ workspaceId, projectName, rootPath, onHasUnsavedChangesChange, chatView, onBack }: WriterIDEViewProps) {
  const { createdDocuments, setActiveDocument, capabilities, taxonomy, activeDocument: writerActiveDocument, writerProjectId } = useWriterProject()
  const tree = useIdeFileTree({ rootPath: rootPath || null, createdDocuments })
  const { activeFile, openFiles, closeFile, setActiveFile, renameNode: baseRenameNode, deleteNode: baseDeleteNode } = tree

  const [layout, setLayout] = useState<WriterIdeLayoutState>(() => loadWriterIdeLayout(workspaceId))
  const { explorerVisible, assistantVisible: rightPanelVisible, explorerSide, explorerWidth: leftWidth, assistantWidth: rightWidth } = layout
  const [rightPanelTab, setRightPanelTab] = useState<'agent' | 'writer-os'>('agent')
  const [bottomPanelVisible, setBottomPanelVisible] = useState(false)
  const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTab>('output')
  const [bottomPanelHeight, setBottomPanelHeight] = useState(BOTTOM_PANEL_HEIGHT)
  const [outputLines, setOutputLines] = useState<OutputLine[]>([])
  const [ingestItems, setIngestItems] = useState<IngestStatusItem[]>([])
  const [runtimeState, setRuntimeState] = useState<'idle' | 'running' | 'paused' | 'stopped' | 'failed'>('idle')
  const [formatTrigger, setFormatTrigger] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)
  const dragTargetRef = useRef<DragTarget>(null)
  const startPosRef = useRef({ x: 0, y: 0, leftW: 0, rightW: 0 })
  const terminalRef = useRef<HTMLDivElement>(null)
  const runtimeSessionRef = useRef<{
    id: string
    removeDataListener: () => void
    removeExitListener: () => void
  } | null>(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(`karna:writer-ide:layout:${workspaceId}`, JSON.stringify(layout))
    } catch {
      // Layout persistence is best effort; the controls still work in-memory.
    }
  }, [layout, workspaceId])

  const openFilesArray = useMemo(() => Array.from(openFiles), [openFiles])
  const sessions = useDocumentSessions(workspaceId, rootPath || null, openFilesArray, activeFile)
  const {
    documents,
    loading: fileLoading,
    saving: savingFiles,
    conflict,
    hasUnsavedChanges,
    allDiagnostics,
    updateContent,
    setSelection: setDocSelection,
    setCursorPosition,
    saveFile,
    saveAll,
    revertFile,
    resolveConflict,
    removeDocument,
    renameDocument,
    getActiveDocument,
    getCapability
  } = sessions

  const activeDocument = activeFile ? getActiveDocument(activeFile) : null
  const activeCapability = activeFile ? getCapability(activeFile) : null
  const activeFileIsEditable = activeCapability?.editable ?? false
  const activeContent = activeDocument?.content ?? ''
  const activeSelection = activeDocument?.selection ?? null
  const activeCursorPos = activeDocument?.cursorPosition
  const isSaving = activeFile ? savingFiles.has(activeFile) : false
  const fileState: 'clean' | 'dirty' | 'saving' | 'conflict' | 'error' = useMemo(() => {
    if (conflict) return 'conflict'
    if (activeDocument?.error) return 'error'
    if (isSaving) return 'saving'
    if (activeDocument?.dirty) return 'dirty'
    return 'clean'
  }, [conflict, activeDocument, isSaving])

  const commandContext = useMemo(() => ({
    filePath: activeFile,
    capability: activeCapability,
    isDirty: activeDocument?.dirty ?? false,
    isSaving,
    content: activeContent,
    selection: activeSelection,
    runtimeState,
    projectId: undefined,
    workspaceId,
    rootPath
  }), [activeFile, activeCapability, activeDocument, isSaving, activeContent, activeSelection, runtimeState, workspaceId, rootPath])

  const addOutputLine = useCallback((type: OutputLine['type'], text: string) => {
    setOutputLines(prev => [...prev, { type, text, timestamp: Date.now() }])
  }, [])

  const clearOutput = useCallback(() => {
    setOutputLines([])
  }, [])

  const handleOpenExternal = useCallback(() => {
    if (activeFile) {
      const normalized = activeFile.replace(/\\/g, '/')
      const fileUrl = `file:///${normalized.replace(/^\//, '')}`
      void window.hermesDesktop?.openExternal?.(fileUrl)
    }
  }, [activeFile])

  const disposeRuntimeSession = useCallback(async () => {
    const current = runtimeSessionRef.current
    if (!current) return
    runtimeSessionRef.current = null
    current.removeDataListener()
    current.removeExitListener()
    await window.hermesDesktop?.terminal.dispose(current.id)
  }, [])

  useEffect(() => () => {
    void disposeRuntimeSession()
  }, [disposeRuntimeSession])

  const handleRun = useCallback(async () => {
    if (!activeFile || !activeCapability) return
    if (!window.hermesDesktop?.terminal) {
      addOutputLine('stderr', '当前桌面运行时不可用，请重新启动 Karna。')
      setRuntimeState('failed')
      return
    }
    if (activeDocument?.dirty) await saveFile(activeFile)
    await disposeRuntimeSession()
    setRuntimeState('running')
    setBottomPanelVisible(true)
    setBottomPanelTab('output')
    addOutputLine('system', `> 正在运行 ${getFileName(activeFile)}…`)

    try {
      const session = await window.hermesDesktop.terminal.start({ cwd: rootPath || undefined })
      const removeDataListener = window.hermesDesktop.terminal.onData(session.id, data => {
        if (data) addOutputLine('stdout', data.replace(/\r?\n$/, ''))
      })
      const removeExitListener = window.hermesDesktop.terminal.onExit(session.id, event => {
        runtimeSessionRef.current?.removeDataListener()
        runtimeSessionRef.current?.removeExitListener()
        runtimeSessionRef.current = null
        setRuntimeState(event.code === 0 ? 'idle' : 'failed')
        addOutputLine(event.code === 0 ? 'system' : 'stderr', `> 进程结束，退出码 ${event.code ?? '未知'}`)
      })
      runtimeSessionRef.current = { id: session.id, removeDataListener, removeExitListener }

      const quotePowerShell = (value: string) => `'${value.replace(/'/g, "''")}'`
      const quoteCmd = (value: string) => `"${value.replace(/"/g, '""')}"`
      const quotePosix = (value: string) => `'${value.replace(/'/g, `'"'"'`)}'`
      const language = activeCapability.runtimeLanguage
      const executable = language === 'python' ? 'python' : language === 'typescript' ? 'npx tsx' : 'node'
      const isPowerShell = /powershell|pwsh/i.test(session.shell)
      const isCmd = /cmd/i.test(session.shell)
      const quotedPath = isPowerShell ? quotePowerShell(activeFile) : isCmd ? quoteCmd(activeFile) : quotePosix(activeFile)
      const command = isPowerShell
        ? `& ${executable} ${quotedPath}; exit $LASTEXITCODE\r`
        : isCmd
          ? `${executable} ${quotedPath} & exit /b %errorlevel%\r`
          : `${executable} ${quotedPath}; exit $?\r`
      await window.hermesDesktop.terminal.write(session.id, command)
    } catch (error) {
      await disposeRuntimeSession()
      setRuntimeState('failed')
      addOutputLine('stderr', error instanceof Error ? error.message : '启动运行时失败')
    }
  }, [activeFile, activeCapability, activeDocument?.dirty, addOutputLine, disposeRuntimeSession, rootPath, saveFile])

  const handleStop = useCallback(async () => {
    await disposeRuntimeSession()
    setRuntimeState('stopped')
    addOutputLine('system', '> 已停止运行')
  }, [addOutputLine, disposeRuntimeSession])

  const handleFormat = useCallback(() => {
    setFormatTrigger(prev => prev + 1)
  }, [])

  const handleValidate = useCallback(() => {
    if (!activeCapability) return
    try {
      if (activeCapability.validationProvider === 'json') {
        JSON.parse(activeContent)
      } else if (activeCapability.validationProvider === 'xml') {
        const document = new DOMParser().parseFromString(activeContent, 'application/xml')
        const parserError = document.querySelector('parsererror')
        if (parserError) throw new Error(parserError.textContent || 'XML 语法错误')
      } else {
        return
      }
      addOutputLine('system', '> 验证通过')
    } catch (error) {
      addOutputLine('stderr', `> 验证失败：${error instanceof Error ? error.message : '格式错误'}`)
    }
    setBottomPanelVisible(true)
    setBottomPanelTab('output')
  }, [activeCapability, activeContent, addOutputLine])

  const handleFind = useCallback(() => {
    addOutputLine('system', '> 查找功能即将推出')
  }, [addOutputLine])

  const handleReplace = useCallback(() => {
    addOutputLine('system', '> 替换功能即将推出')
  }, [addOutputLine])

  const handleAiExplain = useCallback(() => {
    setLayout(previous => ({ ...previous, assistantVisible: true }))
    setRightPanelTab('agent')
  }, [])

  const handleAiRewrite = useCallback(() => {
    setLayout(previous => ({ ...previous, assistantVisible: true }))
    setRightPanelTab('agent')
  }, [])

  const handleAiReview = useCallback(() => {
    setLayout(previous => ({ ...previous, assistantVisible: true }))
    setRightPanelTab('agent')
  }, [])

  const commands = useEditorCommands(commandContext, {
    onSave: () => { if (activeFile) void saveFile(activeFile) },
    onSaveAs: () => { addOutputLine('system', '> 另存为功能即将推出') },
    onRevert: () => { if (activeFile) revertFile(activeFile) },
    onOpenExternal: handleOpenExternal,
    onUndo: () => { /* 撤销功能由编辑器内部处理 */ },
    onRedo: () => { /* 重做功能由编辑器内部处理 */ },
    onFind: handleFind,
    onReplace: handleReplace,
    onFormat: handleFormat,
    onValidate: handleValidate,
    onComment: () => { /* 批注功能即将推出 */ },
    onExport: () => { addOutputLine('system', '> 导出功能即将推出') },
    onRun: handleRun,
    onDebug: undefined,
    onStop: handleStop,
    onAiExplain: handleAiExplain,
    onAiRewrite: handleAiRewrite,
    onAiReview: handleAiReview,
    onAiSummarize: () => { setLayout(previous => ({ ...previous, assistantVisible: true })); setRightPanelTab('agent') },
    onAiDescribe: () => { setLayout(previous => ({ ...previous, assistantVisible: true })); setRightPanelTab('agent') },
    onAiTranscribe: () => { setLayout(previous => ({ ...previous, assistantVisible: true })); setRightPanelTab('agent') },
    onKnowledgeIndex: () => { addOutputLine('system', '> 知识库索引功能即将推出') }
  })

  useEffect(() => {
    onHasUnsavedChangesChange?.(hasUnsavedChanges)
  }, [hasUnsavedChanges, onHasUnsavedChangesChange])

  useEffect(() => {
    if (!activeFile) {
      setActiveDocument(null)
      return
    }
    const relativePath = rootPath && activeFile.startsWith(rootPath)
      ? activeFile.slice(rootPath.length).replace(/^[\\/]/, '')
      : activeFile
    const matched = createdDocuments.find(d =>
      d.relative_path === relativePath || d.relative_path === activeFile
    )
    if (matched) {
      setActiveDocument({
        filePath: activeFile,
        fileName: getFileName(activeFile),
        documentType: matched.document_type,
        presetId: matched.preset_id || null
      })
    } else {
      setActiveDocument({
        filePath: activeFile,
        fileName: getFileName(activeFile),
        documentType: capabilities?.primaryDocumentType || null,
        presetId: null
      })
    }
  }, [activeFile, rootPath, createdDocuments, capabilities, setActiveDocument])

  const handleContentChange = useCallback(
    (content: string) => {
      if (activeFile) {
        updateContent(activeFile, content)
      }
    },
    [activeFile, updateContent]
  )

  const handleSelectionChange = useCallback(
    (selection: { text: string; start: number; end: number } | null) => {
      if (activeFile) {
        setDocSelection(activeFile, selection as EditorSelection | null)
      }
    },
    [activeFile, setDocSelection]
  )

  const handleCursorPositionChange = useCallback(
    (pos: { line: number; column: number }) => {
      if (activeFile) {
        setCursorPosition(activeFile, pos)
      }
    },
    [activeFile, setCursorPosition]
  )

  const renameNode = useCallback(
    async (path: string, newName: string) => {
      await baseRenameNode(path, newName)
      const separator = path.includes('\\') ? '\\' : '/'
      const parentPath = path.slice(0, path.lastIndexOf(separator))
      const newPath = parentPath + separator + newName
      renameDocument(path, newPath)
    },
    [baseRenameNode, renameDocument]
  )

  const deleteNode = useCallback(
    async (path: string) => {
      const doc = documents.get(path)
      if (doc?.dirty) {
        const fileName = path.split(/[/\\]/).pop() || path
        if (!window.confirm(`"${fileName}" 有未保存的更改，确定要删除吗？`)) {
          return
        }
      }
      await baseDeleteNode(path)
      removeDocument(path)
    },
    [baseDeleteNode, documents, removeDocument]
  )

  const handleOverwriteDisk = useCallback(async () => {
    if (conflict) {
      resolveConflict(conflict.filePath, 'overwrite')
    }
  }, [conflict, resolveConflict])

  const handleReloadFromDisk = useCallback(async () => {
    if (conflict) {
      resolveConflict(conflict.filePath, 'useDisk')
    }
  }, [conflict, resolveConflict])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && activeFile && activeFileIsEditable && activeDocument?.dirty) {
        e.preventDefault()
        void saveFile(activeFile)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeFile, activeFileIsEditable, activeDocument, saveFile])

  useEffect(() => {
    if (!activeFile || !activeFileIsEditable || !activeDocument?.dirty) {
      return
    }

    const timer = setTimeout(() => {
      void saveFile(activeFile)
    }, 800)

    return () => clearTimeout(timer)
  }, [activeFile, activeContent, activeFileIsEditable, activeDocument, saveFile])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    const handleWindowBlur = () => {
      if (hasUnsavedChanges) {
        void saveAll()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('blur', handleWindowBlur)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('blur', handleWindowBlur)
    }
  }, [hasUnsavedChanges, saveAll])

  const handleMouseDown = useCallback(
    (target: DragTarget) => (e: ReactMouseEvent) => {
      e.preventDefault()
      dragTargetRef.current = target
      startPosRef.current = {
        x: e.clientX,
        y: e.clientY,
        leftW: leftWidth,
        rightW: rightWidth
      }

      const handleMouseMove = (ev: MouseEvent) => {
        const drag = dragTargetRef.current

        if (!drag || !containerRef.current) {return}

        const dx = ev.clientX - startPosRef.current.x
        const containerRect = containerRef.current.getBoundingClientRect()

        if (drag === 'explorer') {
          const direction = explorerSide === 'left' ? 1 : -1
          const newWidth = Math.max(
            MIN_PANEL_SIZE,
            Math.min(containerRect.width - MIN_PANEL_SIZE * 2, startPosRef.current.leftW + dx * direction)
          )

          setLayout(prev => ({ ...prev, explorerWidth: newWidth }))
        } else if (drag === 'assistant') {
          const assistantOnLeft = explorerSide === 'right'
          const direction = assistantOnLeft ? 1 : -1
          const newWidth = Math.max(
            MIN_PANEL_SIZE,
            Math.min(containerRect.width - MIN_PANEL_SIZE * 2, startPosRef.current.rightW + dx * direction)
          )

          setLayout(prev => ({ ...prev, assistantWidth: newWidth }))
        }
      }

      const handleMouseUp = () => {
        dragTargetRef.current = null
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.body.style.cursor = 'ew-resize'
      document.body.style.userSelect = 'none'
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    },
    [leftWidth, rightWidth, explorerSide]
  )

  const openFileNames = useMemo(() => Array.from(openFiles).map(path => {
    const doc = documents.get(path)
    return {
      path,
      name: getFileName(path),
      dirty: doc?.dirty ?? false,
      type: getCapabilityForFile(path)
    }
  }), [openFiles, documents])

  const handleCloseFile = useCallback((path: string) => {
    const doc = documents.get(path)
    if (doc?.dirty) {
      if (!window.confirm(`"${getFileName(path)}" 有未保存的更改，确定要关闭吗？`)) {
        return
      }
    }
    closeFile(path)
    removeDocument(path)
  }, [documents, closeFile, removeDocument])

  const stats = useMemo(() => {
    if (!activeContent) {
      return { chars: 0, charsNoSpace: 0, words: 0, paragraphs: 0, lines: 0 }
    }
    const chars = activeContent.length
    const charsNoSpace = activeContent.replace(/\s/g, '').length
    const words = activeContent.trim() ? activeContent.trim().split(/\s+/).length : 0
    const paragraphs = activeContent.trim() ? activeContent.split(/\n\s*\n/).filter(p => p.trim()).length : 0
    const lines = activeContent.split('\n').length
    return { chars, charsNoSpace, words, paragraphs, lines }
  }, [activeContent])

  const toolbarStatistics = useMemo(() => ({
    words: stats.words,
    chars: stats.chars,
    lines: stats.lines,
    selection: activeSelection ?? undefined
  }), [stats, activeSelection])

  const handleQuickCreateFile = useCallback(() => {
    if (!rootPath) {return}
    const fileName = window.prompt('请输入文件名（带扩展名，例如 第一章.md）：', '第一章.md')

    if (fileName?.trim()) {
      void tree.createFile(rootPath, fileName.trim())
    }
  }, [rootPath, tree])

  const handleQuickCreateFolder = useCallback(() => {
    if (!rootPath) {return}
    const folderName = window.prompt('请输入文件夹名：', '新章节')

    if (folderName?.trim()) {
      void tree.createFolder(rootPath, folderName.trim())
    }
  }, [rootPath, tree])

  const handleFocusSearch = useCallback(() => {
    const searchInput = document.querySelector('input[placeholder="搜索文件..."]') as HTMLInputElement | null
    searchInput?.focus()
  }, [])

  const quickActions = [
    { icon: 'new-file', label: '新建文件', action: handleQuickCreateFile },
    { icon: 'new-folder', label: '新建文件夹', action: handleQuickCreateFolder },
    { icon: 'search', label: '搜索文件', action: handleFocusSearch },
    { icon: 'refresh', label: '刷新项目', action: () => tree.refresh() }
  ]

  const isEmptyProject = tree.data.length === 0
  const projectDocumentType = taxonomy?.primaryDocumentType || capabilities?.primaryDocumentType || null
  const formLabel = projectDocumentType ? getFormLabel(projectDocumentType) : null

  const currentDocumentType = writerActiveDocument?.documentType || projectDocumentType
  const currentFileName = activeFile ? getFileName(activeFile) : null

  useWriterContextEnvelope({
    workspaceId,
    projectId: writerProjectId || undefined,
    documentType: currentDocumentType || undefined,
    activeFilePath: activeFile || undefined,
    selectionText: activeSelection?.text || undefined,
    enabled: true
  })

  const toggleBottomPanel = useCallback(() => {
    setBottomPanelVisible(v => !v)
  }, [])

  const errorCount = useMemo(() => allDiagnostics.filter(d => d.severity === 'error').length, [allDiagnostics])
  const warningCount = useMemo(() => allDiagnostics.filter(d => d.severity === 'warning').length, [allDiagnostics])

  useEffect(() => {
    if (errorCount > 0 || warningCount > 0) {
      setBottomPanelVisible(true)
      setBottomPanelTab('problems')
    }
  }, [errorCount, warningCount])

  function getFormLabel(docType: string): string {
    const labels: Record<string, string> = {
      narrative_prose: '叙事散文',
      script_dialogue: '剧本对白',
      interactive_narrative: '互动叙事',
      marketing_copy: '营销文案',
      informational_article: '资讯文章',
      argumentative_document: '论证文档',
      structured_business_doc: '结构化商务文档',
      regulated_document: '受监管文档',
      technical_document: '技术文档',
      knowledge_asset: '知识资产',
      outline: '大纲规划',
      research_material: '研究资料',
      review_feedback: '审阅反馈',
      revision_artifact: '修订产物'
    }
    return labels[docType] || docType
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-(--ui-background)" ref={containerRef}>
      <WriterIDEHeader
        activeFileName={currentFileName}
        activeFilePath={activeFile}
        fileDirty={activeDocument?.dirty ?? false}
        fileState={fileState}
        filePanelVisible={explorerVisible}
        onBack={onBack}
        onSave={() => activeFile && void saveFile(activeFile)}
        onToggleFilePanel={() => setLayout(prev => ({ ...prev, explorerVisible: !prev.explorerVisible }))}
        onSwapPanels={() => setLayout(prev => ({ ...prev, explorerSide: prev.explorerSide === 'left' ? 'right' : 'left' }))}
        panelsSwapped={explorerSide === 'right'}
        onToggleRightPanel={() => setLayout(prev => ({ ...prev, assistantVisible: !prev.assistantVisible }))}
        onToggleRightPanelTab={tab => setRightPanelTab(tab)}
        projectName={projectName}
        rightPanelTab={rightPanelTab}
        rightPanelVisible={rightPanelVisible}
        rootPath={rootPath}
        documentType={currentDocumentType as any}
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1">
          {explorerVisible && (
            <>
              <div
                className="shrink-0 overflow-hidden bg-(--ui-surface-secondary)"
                style={{ order: explorerSide === 'left' ? 10 : 50, width: leftWidth }}
              >
                <WorkspaceExplorer projectName={projectName} rootPath={rootPath} tree={{ ...tree, renameNode, deleteNode }} />
              </div>
              <div
                className="group relative w-1 shrink-0 cursor-ew-resize bg-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-color-accent)"
                onMouseDown={handleMouseDown('explorer')}
                style={{ order: explorerSide === 'left' ? 20 : 40 }}
              >
                <div className="absolute inset-y-0 -left-1 -right-1" />
              </div>
            </>
          )}

          {!explorerVisible && (
            <div
              className="flex w-7 shrink-0 flex-col items-center border-x border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) py-2"
              style={{ order: explorerSide === 'left' ? 10 : 50 }}
            >
              <button
                className="rounded p-1.5 text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground"
                onClick={() => setLayout(prev => ({ ...prev, explorerVisible: true }))}
                title="显示文件树"
                type="button"
              >
                <Codicon name="files" size="0.75rem" />
              </button>
            </div>
          )}

          <div className="flex min-w-0 flex-1 flex-col" style={{ order: 30 }}>
            <div className="flex h-9 shrink-0 items-center gap-1 border-b border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-2 overflow-x-auto">
              {openFileNames.length === 0 ? (
                <div className="px-2 text-xs text-(--ui-text-quaternary)">点击左侧文件打开编辑</div>
              ) : (
                openFileNames.map(({ path, name, dirty }) => (
                  <div
                    className={cn(
                      'group flex shrink-0 items-center gap-1.5 rounded-t border-x border-t border-transparent px-3 py-1.5 text-xs transition-colors cursor-pointer',
                      activeFile === path
                        ? 'border-(--ui-stroke-secondary) bg-(--ui-background) text-foreground'
                        : 'text-(--ui-text-secondary) hover:text-foreground'
                    )}
                    key={path}
                    onClick={() => setActiveFile(path)}
                  >
                    {dirty ? (
                      <Codicon className="text-(--ui-color-accent)" name="circle-filled" size="0.5rem" />
                    ) : (
                      <FileTypeIcon path={path} size="0.75rem" />
                    )}
                    <span>{name}</span>
                    <button
                      className="ml-1 rounded p-0.5 opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) group-hover:opacity-100"
                      onClick={e => {
                        e.stopPropagation()
                        handleCloseFile(path)
                      }}
                      type="button"
                    >
                      <Codicon name="close" size="0.625rem" />
                    </button>
                  </div>
                ))
              )}
              <div className="ml-auto flex items-center gap-2 pr-2">
                {activeFile && activeFileIsEditable && (
                  fileState === 'error' ? (
                    <span className="flex items-center gap-1 text-[10px] text-destructive">
                      <Codicon name="error" size="0.75rem" />
                      {activeDocument?.error || '保存失败'}
                    </span>
                  ) : null
                )}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-(--ui-editor-surface-background)">
                {activeFile ? (
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    {activeCapability && activeDocument ? (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <EditorToolbar
                          capability={activeCapability}
                          commands={commands.commands}
                          fileState={fileState}
                          statistics={toolbarStatistics}
                          cursorPosition={activeCursorPos}
                        />
                        <div className="min-h-0 flex-1 overflow-hidden">
                          <EditorContainer
                            filePath={activeFile}
                            capability={activeCapability}
                            document={activeDocument}
                            onChange={handleContentChange}
                            onSave={() => activeFile && void saveFile(activeFile)}
                            onSelectionChange={handleSelectionChange}
                            onCursorPosition={handleCursorPositionChange}
                            onToggleBreakpoint={() => {}}
                            formatTrigger={formatTrigger}
                            onOpenExternal={handleOpenExternal}
                            onRetryIngest={sessions.startIngest}
                          />
                        </div>
                      </div>
                    ) : fileLoading === activeFile ? (
                      <div className="flex flex-1 items-center justify-center gap-2 text-(--ui-text-quaternary)">
                        <Codicon className="animate-spin" name="loading" size="0.875rem" />
                        <span className="text-sm">加载中...</span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex flex-1 items-center justify-center overflow-auto p-8">
                    <div className="max-w-lg space-y-6 text-center">
                      <div className="mx-auto flex size-20 items-center justify-center rounded-2xl bg-gradient-to-br from-(--ui-color-accent)/20 to-(--ui-color-accent)/5">
                        <Codicon className="text-4xl text-(--ui-color-accent)" name={isEmptyProject ? 'new-file' : 'file-code'} />
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-2xl font-semibold">{projectName}</h2>
                        <p className="text-sm text-(--ui-text-secondary)">
                          {isEmptyProject ? '空白项目' : 'Writer IDE 工作台'}
                        </p>
                        {formLabel && (
                          <div className="flex items-center justify-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-2 py-0.5 text-[10px] text-(--ui-text-secondary)">
                              <Codicon name="tag" size="0.625rem" />
                              {formLabel}
                            </span>
                          </div>
                        )}
                        <p className="text-xs text-(--ui-text-quaternary)">
                          {isEmptyProject
                            ? '项目尚未添加任何文档，选择以下操作开始创作'
                            : '从左侧文件树开始，或选择以下快速操作'}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-left">
                        {quickActions.map(({ icon, label, action }) => (
                          <button
                            className="rounded-lg border border-(--ui-stroke-secondary) p-3 text-left transition-colors hover:border-(--ui-color-accent)/50 hover:bg-(--ui-control-hover-background)"
                            key={label}
                            onClick={action}
                            type="button"
                          >
                            <Codicon className="mb-2 text-(--ui-color-accent)" name={icon as 'new-file' | 'new-folder' | 'search' | 'refresh'} />
                            <p className="text-sm font-medium">{label}</p>
                          </button>
                        ))}
                      </div>
                      {rootPath && (
                        <div className="flex items-center justify-center gap-1 rounded-lg bg-(--ui-surface-secondary) px-3 py-2">
                          <Codicon className="text-(--ui-text-quaternary)" name="folder-opened" size="0.75rem" />
                          <span className="font-mono text-xs text-(--ui-text-quaternary) truncate max-w-[400px]">
                            {rootPath}
                          </span>
                          <button
                            className="ml-2 shrink-0 rounded p-1 text-(--ui-text-quaternary) hover:bg-(--ui-control-hover-background) hover:text-foreground"
                            onClick={() => void revealDesktopPath(rootPath)}
                            title="在文件管理器中显示"
                            type="button"
                          >
                            <Codicon name="link-external" size="0.625rem" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <BottomPanel
                visible={bottomPanelVisible}
                activeTab={bottomPanelTab}
                height={bottomPanelHeight}
                outputLines={outputLines}
                diagnostics={allDiagnostics}
                ingestItems={ingestItems}
                terminalRef={terminalRef}
                onTabChange={setBottomPanelTab}
                onToggleVisibility={toggleBottomPanel}
                onHeightChange={setBottomPanelHeight}
                onClearOutput={clearOutput}
              />
          </div>

          {rightPanelVisible && (
            <>
              <div
                className="group relative w-1 shrink-0 cursor-ew-resize bg-(--ui-stroke-secondary) transition-colors hover:bg-(--ui-color-accent)"
                onMouseDown={handleMouseDown('assistant')}
                style={{ order: explorerSide === 'left' ? 40 : 20 }}
              >
                <div className="absolute inset-y-0 -left-1 -right-1" />
              </div>
              <div
                className="shrink-0 overflow-hidden bg-(--ui-surface-secondary)"
                style={{ order: explorerSide === 'left' ? 50 : 10, width: rightWidth }}
              >
                <div className="flex h-9 shrink-0 items-center border-b border-(--ui-stroke-secondary)">
                  <div className="flex flex-1 items-center gap-0.5 px-1">
                    <button
                      className={cn(
                        'flex items-center gap-1 rounded px-2 py-0.5 text-[10px] transition-colors',
                        rightPanelTab === 'agent'
                          ? 'bg-(--ui-control-active-background) text-foreground'
                          : 'text-(--ui-text-quaternary) hover:text-foreground'
                      )}
                      onClick={() => setRightPanelTab('agent')}
                      type="button"
                    >
                      <Codicon name="hubot" size="0.75rem" />
                      <span>Agent</span>
                    </button>
                    <button
                      className={cn(
                        'flex items-center gap-1 rounded px-2 py-0.5 text-[10px] transition-colors',
                        rightPanelTab === 'writer-os'
                          ? 'bg-(--ui-control-active-background) text-foreground'
                          : 'text-(--ui-text-quaternary) hover:text-foreground'
                      )}
                      onClick={() => setRightPanelTab('writer-os')}
                      type="button"
                    >
                      <Codicon name="circuit-board" size="0.75rem" />
                      <span>Writer OS</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className={cn(
                        'rounded p-1 text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground',
                        bottomPanelVisible && 'bg-(--ui-control-active-background) text-foreground'
                      )}
                      onClick={toggleBottomPanel}
                      title={bottomPanelVisible ? '隐藏底部面板' : '显示底部面板'}
                      type="button"
                    >
                      <Codicon name={bottomPanelVisible ? 'chevron-down' : 'chevron-up'} size="0.75rem" />
                    </button>
                    <button
                      className="mr-1 rounded p-1 text-(--ui-text-quaternary) hover:bg-(--ui-control-hover-background) hover:text-foreground"
                      onClick={() => setLayout(prev => ({ ...prev, assistantVisible: false }))}
                      title="隐藏面板"
                      type="button"
                    >
                      <Codicon name="close" size="0.75rem" />
                    </button>
                  </div>
                </div>
                <div className="h-[calc(100%-2.25rem)] overflow-hidden">
                  {rightPanelTab === 'agent' && (
                    <ProjectAgentPanel
                      activeFile={activeFile}
                      chatView={chatView}
                      selectedText={activeSelection?.text}
                    />
                  )}
                  {rightPanelTab === 'writer-os' && workspaceId && (
                    <WriterOsPanel
                      projectName={projectName}
                      projectRef={workspaceId}
                      documentType={projectDocumentType}
                      formId={taxonomy?.formId || null}
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {!rightPanelVisible && (
            <div
              className="flex w-7 shrink-0 flex-col items-center gap-1 border-x border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) py-2"
              style={{ order: explorerSide === 'left' ? 50 : 10 }}
            >
              <button
                className="rounded p-1.5 text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground"
                onClick={() => {
                  setRightPanelTab('agent')
                  setLayout(prev => ({ ...prev, assistantVisible: true }))
                }}
                title="显示 Agent 面板"
                type="button"
              >
                <Codicon name="hubot" size="0.75rem" />
              </button>
              <button
                className="rounded p-1.5 text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground"
                onClick={() => {
                  setRightPanelTab('writer-os')
                  setLayout(prev => ({ ...prev, assistantVisible: true }))
                }}
                title="显示 Writer OS"
                type="button"
              >
                <Codicon name="circuit-board" size="0.75rem" />
              </button>
            </div>
          )}
        </div>

        {!rightPanelVisible && (
          <div className="flex h-6 shrink-0 items-center justify-end gap-2 border-t border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-2">
            <button
              className={cn(
                'flex items-center gap-1 rounded px-2 py-0.5 text-[10px] transition-colors',
                bottomPanelVisible
                  ? 'bg-(--ui-control-active-background) text-foreground'
                  : 'text-(--ui-text-quaternary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
              )}
              onClick={toggleBottomPanel}
              type="button"
            >
              <Codicon name={bottomPanelVisible ? 'chevron-down' : 'chevron-up'} size="0.625rem" />
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
          </div>
        )}
      </div>

      <Dialog onOpenChange={open => !open && conflict && resolveConflict(conflict.filePath, 'revert')} open={conflict !== null}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Codicon className="text-amber-500" name="warning" />
              文件冲突
            </DialogTitle>
            <DialogDescription>
              「{conflict ? getFileName(conflict.filePath) : ''}」已被外部程序修改。请选择如何处理：
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <p className="mb-2 text-xs font-medium text-(--ui-text-secondary)">您的版本</p>
                <div className="max-h-40 overflow-auto rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) p-2 font-mono text-xs">
                  <pre className="whitespace-pre-wrap">
                    {conflict ? documents.get(conflict.filePath)?.content?.slice(0, 500) : ''}
                    {conflict && documents.get(conflict.filePath)?.content && documents.get(conflict.filePath)!.content.length > 500 ? '...' : ''}
                  </pre>
                </div>
              </div>
              <div className="flex-1">
                <p className="mb-2 text-xs font-medium text-(--ui-text-secondary)">磁盘版本</p>
                <div className="max-h-40 overflow-auto rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) p-2 font-mono text-xs">
                  <pre className="whitespace-pre-wrap">
                    {conflict?.diskContent.slice(0, 500)}
                    {conflict && conflict.diskContent.length > 500 ? '...' : ''}
                  </pre>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleReloadFromDisk} variant="secondary">
              重新加载（放弃更改）
            </Button>
            <Button onClick={handleOverwriteDisk}>
              覆盖磁盘版本
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
