import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export interface ResolvedProject {
  id: string
  name: string
  workspaceId: string
  rootPath: string
  primarySessionId: string | null
  permissionsRoot: string
}

export interface WriterProjectContextValue {
  workspaceId: string
  writerProjectId: string
  rootPath: string
  projectName: string
  mainSessionId: string | null
  permissionsRoot: string
  capabilities: any
  createdDocuments: any[]
  taxonomy: any
  knowledgeIds: string[]
  soulProfileId: string | null
  workflowProfileIds: string[]
  activeDocument: any
  setActiveDocument: (doc: any) => void
  status: 'idle' | 'resolving' | 'ready' | 'not_found' | 'error'
  error: string | null
  reload: () => Promise<void>
  setMainSessionId: (sessionId: string) => Promise<void>
  clearMainSessionId: () => Promise<void>
}

const WriterProjectContext = createContext<WriterProjectContextValue | null>(null)

const LOADING_CONTEXT: WriterProjectContextValue = {
  workspaceId: '',
  writerProjectId: '',
  rootPath: '',
  projectName: '',
  mainSessionId: null,
  permissionsRoot: '',
  capabilities: null,
  createdDocuments: [],
  taxonomy: null,
  knowledgeIds: [],
  soulProfileId: null,
  workflowProfileIds: [],
  activeDocument: null,
  setActiveDocument: () => {},
  status: 'idle',
  error: null,
  reload: async () => {},
  setMainSessionId: async () => {},
  clearMainSessionId: async () => {}
}

export function WriterProjectProvider({
  workspaceId,
  children
}: {
  workspaceId: string
  children: ReactNode
}) {
  const [contextValue, setContextValue] = useState<WriterProjectContextValue>(LOADING_CONTEXT)
  const [activeDocument, setActiveDocument] = useState<any>(null)
  const generationRef = useRef(0)

  const resolveProject = useCallback(async () => {
    if (!workspaceId) {
      setContextValue({ ...LOADING_CONTEXT, status: 'error', error: '未指定工作区' })
      return
    }

    const generation = ++generationRef.current
    setContextValue(prev => ({ ...prev, status: 'resolving', error: null, workspaceId }))

    try {
      const result = await window.karnaDesktop.api<any>({
        method: 'GET',
        path: `/api/writer/projects/resolve?workspace_id=${encodeURIComponent(workspaceId)}`
      })

      if (generation !== generationRef.current) {
        return
      }

      if (!result?.ok || !result?.project) {
        setContextValue({
          ...LOADING_CONTEXT,
          workspaceId,
          setActiveDocument,
          status: result?.code === 'PROJECT_NOT_FOUND' ? 'not_found' : 'error',
          error: result?.error || '项目解析失败',
          reload: resolveProject,
          setMainSessionId: async () => {},
          clearMainSessionId: async () => {}
        })
        return
      }

      const project = result.project
      setContextValue({
        workspaceId,
        writerProjectId: project.id || '',
        rootPath: project.rootPath || '',
        projectName: project.name || workspaceId,
        mainSessionId: project.primarySessionId || null,
        permissionsRoot: project.permissionsRoot || project.rootPath || '',
        capabilities: project.capabilities || project.resolved_capabilities || null,
        createdDocuments: Array.isArray(project.created_documents) ? project.created_documents : [],
        taxonomy: project.taxonomy || null,
        knowledgeIds: project.knowledge_ids || [],
        soulProfileId: project.soul_profile_id || null,
        workflowProfileIds: project.workflow_profile_ids || [],
        activeDocument: null,
        setActiveDocument,
        status: 'ready',
        error: null,
        reload: resolveProject,
        setMainSessionId: async (sessionId: string) => {
          if (!project.id) return
          try {
            await window.karnaDesktop.api({
              method: 'POST',
              path: `/api/writer/projects/${project.id}/main-session`,
              body: { sessionId }
            })
            setContextValue(prev => ({ ...prev, mainSessionId: sessionId }))
          } catch {
            // ignore errors for this
          }
        },
        clearMainSessionId: async () => {
          if (!project.id) return
          try {
            await window.karnaDesktop.api({
              method: 'POST',
              path: `/api/writer/projects/${project.id}/main-session`,
              body: { sessionId: null, clear: true }
            })
          } catch {
            // Older adapters may not support clearing yet; still fix renderer state.
          }
          setContextValue(prev => ({ ...prev, mainSessionId: null }))
        }
      })
    } catch (err: any) {
      if (generation !== generationRef.current) {
        return
      }
      setContextValue({
        ...LOADING_CONTEXT,
        workspaceId,
        setActiveDocument,
        status: 'error',
        error: err?.message || String(err),
        reload: resolveProject,
        setMainSessionId: async () => {},
        clearMainSessionId: async () => {}
      })
    }
  }, [workspaceId])

  useEffect(() => {
    void resolveProject()
    return () => {
      generationRef.current++
    }
  }, [resolveProject])

  const value = useMemo(
    () => ({ ...contextValue, activeDocument, setActiveDocument }),
    [contextValue, activeDocument]
  )

  return (
    <WriterProjectContext.Provider value={value}>
      {children}
    </WriterProjectContext.Provider>
  )
}

export function useWriterProject(): WriterProjectContextValue {
  const ctx = useContext(WriterProjectContext)
  if (!ctx) {
    throw new Error('useWriterProject must be used within a WriterProjectProvider')
  }
  return ctx
}
