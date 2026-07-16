import { useCallback, useMemo, useState } from 'react'
import type { FileCapabilityDescriptor, EditorCommand } from './file-capabilities'

export interface CommandContext {
  filePath: string | null
  capability: FileCapabilityDescriptor | null
  isDirty: boolean
  isSaving: boolean
  content: string
  selection?: { text: string; start: number; end: number } | null
  runtimeState?: 'idle' | 'running' | 'paused' | 'stopped' | 'failed'
  projectId?: string
  workspaceId?: string
  rootPath?: string | null
}

export interface CommandHandlers {
  onSave?: () => void | Promise<void>
  onSaveAs?: () => void | Promise<void>
  onRevert?: () => void | Promise<void>
  onOpenExternal?: () => void | Promise<void>
  onUndo?: () => void
  onRedo?: () => void
  onFind?: () => void
  onReplace?: () => void
  onFormat?: () => void
  onValidate?: () => void
  onComment?: () => void
  onExport?: () => void
  onRun?: () => void | Promise<void>
  onDebug?: () => void | Promise<void>
  onStop?: () => void | Promise<void>
  onAiExplain?: () => void
  onAiRewrite?: () => void
  onAiReview?: () => void
  onAiSummarize?: () => void
  onAiDescribe?: () => void
  onAiTranscribe?: () => void
  onKnowledgeIndex?: () => void
}

export function useEditorCommands(
  context: CommandContext,
  handlers: CommandHandlers
) {
  const [pendingCommands, setPendingCommands] = useState<Set<string>>(new Set())

  const executeCommand = useCallback(async (commandId: string) => {
    if (!context.capability) return
    if (!context.capability.supportedActions.includes(commandId)) return

    const handlerMap: Record<string, (() => void | Promise<void>) | undefined> = {
      'file.save': handlers.onSave,
      'file.saveAs': handlers.onSaveAs,
      'file.revert': handlers.onRevert,
      'file.openExternal': handlers.onOpenExternal,
      'edit.undo': handlers.onUndo,
      'edit.redo': handlers.onRedo,
      'edit.find': handlers.onFind,
      'edit.replace': handlers.onReplace,
      'document.format': handlers.onFormat,
      'document.validate': handlers.onValidate,
      'document.comment': handlers.onComment,
      'document.export': handlers.onExport,
      'code.run': handlers.onRun,
      'code.debug': handlers.onDebug,
      'code.stop': handlers.onStop,
      'ai.explain': handlers.onAiExplain,
      'ai.rewrite': handlers.onAiRewrite,
      'ai.review': handlers.onAiReview,
      'ai.summarize': handlers.onAiSummarize,
      'ai.describe': handlers.onAiDescribe,
      'ai.transcribe': handlers.onAiTranscribe,
      'knowledge.index': handlers.onKnowledgeIndex
    }

    const handler = handlerMap[commandId]
    if (!handler) return

    setPendingCommands(prev => new Set(prev).add(commandId))
    try {
      await handler()
    } finally {
      setPendingCommands(prev => {
        const next = new Set(prev)
        next.delete(commandId)
        return next
      })
    }
  }, [context.capability, handlers])

  const commands = useMemo(() => {
    const map = new Map<string, EditorCommand>()
    if (!context.capability) return map

    const allCommands: { id: string; enabled: boolean }[] = [
      { id: 'file.save', enabled: context.isDirty && !context.isSaving },
      { id: 'file.saveAs', enabled: !!context.filePath },
      { id: 'file.revert', enabled: context.isDirty },
      { id: 'file.openExternal', enabled: true },
      { id: 'edit.undo', enabled: context.capability.editStrategy === 'in_place' },
      { id: 'edit.redo', enabled: context.capability.editStrategy === 'in_place' },
      { id: 'edit.find', enabled: true },
      { id: 'edit.replace', enabled: context.capability.editable },
      { id: 'document.format', enabled: context.capability.editStrategy === 'in_place' },
      { id: 'document.validate', enabled: !!context.capability.validationProvider },
      { id: 'document.comment', enabled: true },
      { id: 'document.export', enabled: true },
      { id: 'code.run', enabled: !!context.capability.runtimeLanguage && context.runtimeState !== 'running' },
      { id: 'code.debug', enabled: !!context.capability.runtimeLanguage && context.runtimeState !== 'running' },
      { id: 'code.stop', enabled: context.runtimeState === 'running' || context.runtimeState === 'paused' },
      { id: 'ai.explain', enabled: true },
      { id: 'ai.rewrite', enabled: context.capability.editable },
      { id: 'ai.review', enabled: true },
      { id: 'ai.summarize', enabled: true },
      { id: 'ai.describe', enabled: true },
      { id: 'ai.transcribe', enabled: true },
      { id: 'knowledge.index', enabled: !!context.capability.ingestMediaType }
    ]

    for (const cmd of allCommands) {
      const isVisible = context.capability.supportedActions.includes(cmd.id)
      map.set(cmd.id, {
        id: cmd.id,
        label: cmd.id,
        enabled: cmd.enabled && !pendingCommands.has(cmd.id),
        visible: isVisible,
        execute: () => void executeCommand(cmd.id),
        pending: pendingCommands.has(cmd.id)
      })
    }

    return map
  }, [context, pendingCommands, executeCommand])

  return {
    commands,
    executeCommand,
    isPending: (id: string) => pendingCommands.has(id)
  }
}
