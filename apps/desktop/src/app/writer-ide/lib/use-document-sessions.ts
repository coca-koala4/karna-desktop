import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  getCapabilityForFile,
  getRelativePath,
  type DocumentSession,
  type EditorDiagnostic,
  type EditorSelection,
  type FileCapabilityDescriptor
} from './file-capabilities'
import { readDesktopFileText, writeDesktopFileText } from '@/lib/desktop-fs'
import { createIngestJob, getIngestJob, getIngestResult, type IngestResult } from '@/lib/ingest-api'

export interface DocumentState {
  filePath: string
  content: string
  originalContent: string
  dirty: boolean
  loading: boolean
  error: string | null
  mtime?: number
  size?: number
  diagnostics: EditorDiagnostic[]
  selection?: EditorSelection
  cursorPosition?: { line: number; column: number }
  scrollPosition?: number
  ingestResultId?: string
  ingestJobId?: string
  ingestStatus?: 'idle' | 'queued' | 'parsing' | 'parsed' | 'failed'
  ingestText?: string
  ingestMarkdown?: string
  ingestWarnings?: string[]
  breakpoints?: number[]
}

export function useDocumentSessions(
  workspaceId: string,
  rootPath: string | null,
  openFiles: string[],
  activeFile: string | null
) {
  const [documents, setDocuments] = useState<Map<string, DocumentState>>(new Map())
  const [loading, setLoading] = useState<string | null>(null)
  const [saving, setSaving] = useState<Set<string>>(new Set())
  const [conflict, setConflict] = useState<{ filePath: string; diskContent: string } | null>(null)

  const draftStorageKey = useMemo(() =>
    `writer-ide-sessions-${rootPath || workspaceId || 'default'}`,
    [workspaceId, rootPath]
  )

  useEffect(() => {
    const dirtyDocs: Record<string, { content: string; savedAt: number }> = {}
    documents.forEach((doc, path) => {
      if (doc.dirty && doc.content !== doc.originalContent) {
        dirtyDocs[path] = { content: doc.content, savedAt: Date.now() }
      }
    })
    try {
      if (Object.keys(dirtyDocs).length > 0) {
        localStorage.setItem(draftStorageKey, JSON.stringify(dirtyDocs))
      } else {
        localStorage.removeItem(draftStorageKey)
      }
    } catch {
      // ignore
    }
  }, [documents, draftStorageKey])

  useEffect(() => {
    async function loadFile(filePath: string) {
      if (documents.has(filePath)) return

      setLoading(filePath)
      try {
        let content = ''
        let mtime = Date.now()
        let size = 0

        try {
          const stat = await (window as any).hermesDesktop?.stat?.(filePath)
          if (stat) {
            mtime = stat.mtimeMs || mtime
            size = stat.size || 0
          }
        } catch {
          // ignore stat errors
        }

        const capability = getCapabilityForFile(filePath)
        const isTextBased = capability?.ingestMediaType === 'text' || !capability?.ingestMediaType

        if (isTextBased) {
          try {
            const result = await readDesktopFileText(filePath)
            content = result.text || ''
            size = result.byteSize ?? size
          } catch {
            content = ''
          }
        }

        let draftContent: string | undefined
        try {
          const stored = localStorage.getItem(draftStorageKey)
          if (stored) {
            const drafts = JSON.parse(stored) as Record<string, { content: string }>
            if (drafts[filePath]) {
              draftContent = drafts[filePath].content
            }
          }
        } catch {
          // ignore
        }

        const finalContent = draftContent ?? content
        const isDirty = draftContent !== undefined && draftContent !== content

        const newState: DocumentState = {
          filePath,
          content: finalContent,
          originalContent: content,
          dirty: isDirty,
          loading: false,
          error: null,
          mtime,
          size,
          diagnostics: []
        }

        setDocuments(prev => {
          const next = new Map(prev)
          next.set(filePath, newState)
          return next
        })

        if (capability?.ingestMediaType && capability.ingestMediaType !== 'text') {
          void startIngest(filePath)
        }
      } catch (e) {
        setDocuments(prev => {
          const next = new Map(prev)
          next.set(filePath, {
            filePath,
            content: '',
            originalContent: '',
            dirty: false,
            loading: false,
            error: e instanceof Error ? e.message : String(e),
            diagnostics: []
          })
          return next
        })
      } finally {
        setLoading(null)
      }
    }

    openFiles.forEach(f => {
      void loadFile(f)
    })
  }, [openFiles, documents, draftStorageKey])

  const updateContent = useCallback((filePath: string, content: string) => {
    setDocuments(prev => {
      const next = new Map(prev)
      const doc = next.get(filePath)
      if (!doc) return prev
      next.set(filePath, {
        ...doc,
        content,
        dirty: content !== doc.originalContent
      })
      return next
    })
  }, [])

  const setSelection = useCallback((filePath: string, selection: EditorSelection | null) => {
    setDocuments(prev => {
      const next = new Map(prev)
      const doc = next.get(filePath)
      if (!doc) return prev
      next.set(filePath, {
        ...doc,
        selection: selection ?? undefined
      })
      return next
    })
  }, [])

  const setCursorPosition = useCallback((filePath: string, pos: { line: number; column: number }) => {
    setDocuments(prev => {
      const next = new Map(prev)
      const doc = next.get(filePath)
      if (!doc) return prev
      next.set(filePath, { ...doc, cursorPosition: pos })
      return next
    })
  }, [])

  const setDiagnostics = useCallback((filePath: string, diagnostics: EditorDiagnostic[]) => {
    setDocuments(prev => {
      const next = new Map(prev)
      const doc = next.get(filePath)
      if (!doc) return prev
      next.set(filePath, { ...doc, diagnostics })
      return next
    })
  }, [])

  const toggleBreakpoint = useCallback((filePath: string, line: number) => {
    setDocuments(prev => {
      const next = new Map(prev)
      const doc = next.get(filePath)
      if (!doc) return prev
      const bps = new Set(doc.breakpoints || [])
      if (bps.has(line)) {
        bps.delete(line)
      } else {
        bps.add(line)
      }
      next.set(filePath, { ...doc, breakpoints: Array.from(bps).sort((a, b) => a - b) })
      return next
    })
  }, [])

  const setScrollPosition = useCallback((filePath: string, pos: number) => {
    setDocuments(prev => {
      const next = new Map(prev)
      const doc = next.get(filePath)
      if (!doc) return prev
      next.set(filePath, { ...doc, scrollPosition: pos })
      return next
    })
  }, [])

  const saveFile = useCallback(async (filePath: string): Promise<boolean> => {
    const doc = documents.get(filePath)
    if (!doc || !doc.dirty) return true

    setSaving(prev => new Set(prev).add(filePath))

    try {
      let diskContent = ''
      try {
        const result = await readDesktopFileText(filePath)
        diskContent = result.text || ''
      } catch {
        diskContent = doc.originalContent
      }

      if (diskContent !== doc.originalContent) {
        setConflict({ filePath, diskContent })
        return false
      }

      await writeDesktopFileText(filePath, doc.content)

      setDocuments(prev => {
        const next = new Map(prev)
        const d = next.get(filePath)
        if (d) {
          next.set(filePath, {
            ...d,
            originalContent: d.content,
            dirty: false,
            error: null,
            mtime: Date.now(),
            size: new Blob([d.content]).size
          })
        }
        return next
      })

      try {
        const stored = localStorage.getItem(draftStorageKey)
        if (stored) {
          const drafts = JSON.parse(stored) as Record<string, { content: string; savedAt: number }>
          delete drafts[filePath]
          if (Object.keys(drafts).length > 0) {
            localStorage.setItem(draftStorageKey, JSON.stringify(drafts))
          } else {
            localStorage.removeItem(draftStorageKey)
          }
        }
      } catch {
        // ignore
      }

      return true
    } catch (e) {
      setDocuments(prev => {
        const next = new Map(prev)
        const d = next.get(filePath)
        if (d) {
          next.set(filePath, {
            ...d,
            error: e instanceof Error ? e.message : String(e)
          })
        }
        return next
      })
      return false
    } finally {
      setSaving(prev => {
        const next = new Set(prev)
        next.delete(filePath)
        return next
      })
    }
  }, [documents, draftStorageKey])

  const resolveConflict = useCallback((filePath: string, resolution: 'overwrite' | 'useDisk' | 'revert') => {
    if (!conflict || conflict.filePath !== filePath) return

    if (resolution === 'overwrite') {
      setDocuments(prev => {
        const next = new Map(prev)
        const d = next.get(filePath)
        if (d) {
          next.set(filePath, { ...d, originalContent: conflict.diskContent })
        }
        return next
      })
      setConflict(null)
      void saveFile(filePath)
    } else if (resolution === 'useDisk') {
      setDocuments(prev => {
        const next = new Map(prev)
        const d = next.get(filePath)
        if (d) {
          next.set(filePath, {
            ...d,
            content: conflict.diskContent,
            originalContent: conflict.diskContent,
            dirty: false
          })
        }
        return next
      })
      setConflict(null)
    } else {
      setDocuments(prev => {
        const next = new Map(prev)
        const d = next.get(filePath)
        if (d) {
          next.set(filePath, {
            ...d,
            content: d.originalContent,
            dirty: false
          })
        }
        return next
      })
      setConflict(null)
    }
  }, [conflict, saveFile])

  const saveAll = useCallback(async (): Promise<boolean> => {
    const dirtyPaths: string[] = []
    documents.forEach((doc, path) => {
      if (doc.dirty) dirtyPaths.push(path)
    })

    let allSaved = true
    for (const path of dirtyPaths) {
      const ok = await saveFile(path)
      if (!ok) allSaved = false
    }
    return allSaved
  }, [documents, saveFile])

  const revertFile = useCallback((filePath: string) => {
    setDocuments(prev => {
      const next = new Map(prev)
      const d = next.get(filePath)
      if (d) {
        next.set(filePath, {
          ...d,
          content: d.originalContent,
          dirty: false
        })
      }
      return next
    })
  }, [])

  const startIngest = useCallback(async (filePath: string) => {
    const capability = getCapabilityForFile(filePath)
    if (!capability?.ingestMediaType || capability.ingestMediaType === 'text') return

    const doc = documents.get(filePath)
    if ((doc?.ingestJobId && doc.ingestStatus !== 'failed') || doc?.ingestStatus === 'parsed') return

    setDocuments(prev => {
      const next = new Map(prev)
      const d = next.get(filePath)
      if (d) {
        next.set(filePath, { ...d, ingestStatus: 'queued', ingestJobId: undefined, error: null })
      }
      return next
    })

    try {
      const { job_id } = await createIngestJob({
        source: {
          kind: 'local_file',
          path: filePath,
          original_name: filePath.split(/[/\\]/).pop()
        },
        intent: 'project_document'
      })

      setDocuments(prev => {
        const next = new Map(prev)
        const d = next.get(filePath)
        if (d) {
          next.set(filePath, { ...d, ingestJobId: job_id, ingestStatus: 'parsing' })
        }
        return next
      })

      let pollCount = 0
      const maxPolls = 120

      const poll = async (): Promise<void> => {
        if (pollCount >= maxPolls) {
          setDocuments(prev => {
            const next = new Map(prev)
            const d = next.get(filePath)
            if (d) {
              next.set(filePath, { ...d, ingestStatus: 'failed', error: '解析超时' })
            }
            return next
          })
          return
        }

        pollCount++
        try {
          const job = await getIngestJob(job_id)

          if (job.status === 'parsed' || job.status === 'partial') {
            try {
              const result = await getIngestResult(job_id)
              setDocuments(prev => {
                const next = new Map(prev)
                const d = next.get(filePath)
                if (d) {
                  next.set(filePath, {
                    ...d,
                    ingestStatus: 'parsed',
                    ingestResultId: result.id,
                    ingestText: result.text,
                    ingestMarkdown: result.markdown,
                    ingestWarnings: result.warnings
                  })
                }
                return next
              })
            } catch {
              setDocuments(prev => {
                const next = new Map(prev)
                const d = next.get(filePath)
                if (d) {
                  next.set(filePath, { ...d, ingestStatus: 'failed', error: '获取解析结果失败' })
                }
                return next
              })
            }
            return
          }

          if (job.status === 'failed' || job.status === 'unsupported' || job.status === 'cancelled') {
            setDocuments(prev => {
              const next = new Map(prev)
              const d = next.get(filePath)
              if (d) {
                next.set(filePath, {
                  ...d,
                  ingestStatus: 'failed',
                  error: job.error || '解析失败'
                })
              }
              return next
            })
            return
          }

          setTimeout(() => void poll(), 2000)
        } catch {
          setTimeout(() => void poll(), 2000)
        }
      }

      setTimeout(() => void poll(), 1000)
    } catch (e) {
      setDocuments(prev => {
        const next = new Map(prev)
        const d = next.get(filePath)
        if (d) {
          next.set(filePath, {
            ...d,
            ingestStatus: 'failed',
            error: e instanceof Error ? e.message : '解析启动失败'
          })
        }
        return next
      })
    }
  }, [documents])

  const removeDocument = useCallback((filePath: string) => {
    setDocuments(prev => {
      const next = new Map(prev)
      next.delete(filePath)
      return next
    })
  }, [])

  const renameDocument = useCallback((oldPath: string, newPath: string) => {
    setDocuments(prev => {
      const next = new Map(prev)
      const doc = next.get(oldPath)
      if (doc) {
        next.set(newPath, { ...doc, filePath: newPath })
        next.delete(oldPath)
      }
      return next
    })
  }, [])

  const hasUnsavedChanges = useMemo(() => {
    for (const doc of documents.values()) {
      if (doc.dirty) return true
    }
    return false
  }, [documents])

  const allDiagnostics = useMemo(() => {
    const diags: (EditorDiagnostic & { filePath: string })[] = []
    documents.forEach((doc, path) => {
      doc.diagnostics.forEach(d => diags.push({ ...d, filePath: path }))
    })
    return diags
  }, [documents])

  const getActiveDocument = useCallback((filePath: string | null): DocumentState | null => {
    if (!filePath) return null
    return documents.get(filePath) || null
  }, [documents])

  const getCapability = useCallback((filePath: string | null): FileCapabilityDescriptor | null => {
    if (!filePath) return null
    return getCapabilityForFile(filePath)
  }, [])

  return {
    documents,
    loading,
    saving,
    conflict,
    hasUnsavedChanges,
    allDiagnostics,
    updateContent,
    setSelection,
    setCursorPosition,
    setDiagnostics,
    toggleBreakpoint,
    setScrollPosition,
    saveFile,
    saveAll,
    revertFile,
    resolveConflict,
    removeDocument,
    renameDocument,
    getActiveDocument,
    getCapability,
    startIngest,
    getRelativePath: (filePath: string) => getRelativePath(filePath, rootPath)
  }
}
