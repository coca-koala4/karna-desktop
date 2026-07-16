import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { HermesReadDirEntry } from '@/global'
import { createDesktopDirectory, readDesktopDir, renameDesktopPath, trashDesktopPath, writeDesktopFileText } from '@/lib/desktop-fs'

import { readProjectDir } from '../right-sidebar/files/ipc'

export type ExplorerFilter = 'all' | 'documents'

export interface IdeTreeNode {
  id: string
  name: string
  relativePath: string
  isDirectory: boolean
  children?: IdeTreeNode[]
  childrenState?: 'unloaded' | 'loading' | 'loaded' | 'error'
  loading?: boolean
  visibility?: 'user' | 'generated' | 'system'

  document?: {
    registered: boolean
    documentId?: string
    documentType?: string
    presetId?: string
    title?: string
  }

  capability?: {
    editorType: string
    editable: boolean
  }

  missing?: boolean
  error?: string | null
}

interface CreatedDocument {
  id?: string
  relative_path: string
  document_type?: string
  preset_id?: string | null
  title?: string
}

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.karna/cache',
  '.karna/index',
  '.DS_Store',
  '__pycache__',
  '.venv',
  'venv'
])

const KARNA_MANAGED_FILES = new Set([
  '.karna-project',
  'writer_agents.json',
  'task_system.json',
  'project_memory.json',
  'project_data_model.json'
])

const WRITER_OS_SYSTEM_DIRS = new Set([
  'artifacts',
  'bible',
  'critics',
  'documents',
  'graph',
  'guide',
  'memory',
  'narrative-state',
  'rag',
  'roadmap',
  'safety',
  'versions',
  'wiki',
  '.karna',
  '.writer',
  'writer-os',
  'writeros',
  '.writer-os'
])

const GENERATED_DIRS = new Set([
  'exports',
  'output',
  'deliverables',
  'generated'
])

const DOCUMENT_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.docx',
  '.doc',
  '.pdf',
  '.xlsx',
  '.xls',
  '.pptx',
  '.ppt',
  '.csv',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.html',
  '.htm',
  '.py',
  '.js',
  '.ts',
  '.tsx',
  '.jsx'
])

type FileVisibility = 'user' | 'generated' | 'system'

function getFileVisibility(name: string, isDirectory: boolean): FileVisibility {
  if (isDirectory) {
    const lower = name.toLowerCase()
    if (WRITER_OS_SYSTEM_DIRS.has(lower) || lower.startsWith('.karna') || lower.startsWith('.writer')) {
      return 'system'
    }
    if (GENERATED_DIRS.has(lower)) {
      return 'generated'
    }
    return 'user'
  }

  if (KARNA_MANAGED_FILES.has(name)) {
    return 'system'
  }

  const lower = name.toLowerCase()
  if (lower.startsWith('.karna') || lower.startsWith('.writer')) {
    return 'system'
  }

  return 'user'
}

function isSystemFile(name: string, isDirectory: boolean): boolean {
  return getFileVisibility(name, isDirectory) === 'system'
}

function shouldIgnore(name: string, isDirectory: boolean, showKarnaFiles: boolean): boolean {
  if (IGNORED_DIRS.has(name)) {
    return true
  }
  if (name.startsWith('.') && name !== '.karna') {
    return true
  }
  if (!showKarnaFiles && isSystemFile(name, isDirectory)) {
    return true
  }
  return false
}

function isDocumentFile(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return false
  const ext = name.slice(dot).toLowerCase()
  return DOCUMENT_EXTENSIONS.has(ext)
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

function getRelativePath(absPath: string, rootPath: string): string {
  const abs = normalizePath(absPath)
  const root = normalizePath(rootPath)
  if (abs.toLowerCase().startsWith(root.toLowerCase() + '/')) {
    return abs.slice(root.length + 1)
  }
  return abs
}

function joinPath(parent: string, name: string): string {
  const separator = parent.includes('\\') ? '\\' : '/'
  const normalizedParent = parent.replace(/[/\\]+$/, '')
  return `${normalizedParent}${separator}${name}`
}

function buildNodeFromEntry(
  entry: HermesReadDirEntry,
  rootPath: string,
  docMap: Map<string, CreatedDocument>
): IdeTreeNode {
  const relativePath = getRelativePath(entry.path, rootPath)
  const lowerRelPath = relativePath.toLowerCase()
  const doc = docMap.get(lowerRelPath)

  const ext = entry.name.slice(entry.name.lastIndexOf('.') + 1).toLowerCase()
  const editable = !entry.isDirectory && isDocumentFile(entry.name)
  const visibility = getFileVisibility(entry.name, entry.isDirectory)

  return {
    id: entry.path,
    name: entry.name,
    relativePath,
    isDirectory: entry.isDirectory,
    visibility,
    document: doc
      ? {
          registered: true,
          documentId: doc.id,
          documentType: doc.document_type,
          presetId: doc.preset_id || undefined,
          title: doc.title
        }
      : !entry.isDirectory && isDocumentFile(entry.name)
        ? { registered: false }
        : undefined,
    capability: !entry.isDirectory
      ? {
          editorType: ext,
          editable
        }
      : undefined
  }
}

async function loadDirectory(
  path: string,
  rootPath: string,
  showKarnaFiles: boolean,
  docMap: Map<string, CreatedDocument>
): Promise<{ ok: true; entries: IdeTreeNode[] } | { ok: false; error: string; path: string }> {
  try {
    const result = await readProjectDir(path, rootPath)

    if (result.error) {
      return { ok: false, error: result.error, path }
    }

    const entries = result.entries
      .filter((entry: HermesReadDirEntry) => !shouldIgnore(entry.name, entry.isDirectory, showKarnaFiles))
      .sort((a: HermesReadDirEntry, b: HermesReadDirEntry) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1
        }
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      })
      .map((e: HermesReadDirEntry) => {
        const node = buildNodeFromEntry(e, rootPath, docMap)
        if (node.isDirectory) {
          node.childrenState = 'unloaded'
        }
        return node
      })

    return { ok: true, entries }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      path
    }
  }
}

function filterTreeForDocuments(nodes: IdeTreeNode[]): IdeTreeNode[] {
  return nodes
    .map(node => {
      if (node.isDirectory) {
        if (node.childrenState === 'unloaded' || node.children === undefined) {
          return node
        }
        const filteredChildren = filterTreeForDocuments(node.children)
        if (filteredChildren.length > 0) {
          return { ...node, children: filteredChildren }
        }
        return null
      }
      const isDoc = node.document || isDocumentFile(node.name)
      return isDoc ? node : null
    })
    .filter((node): node is IdeTreeNode => node !== null)
}

function filterTreeByQuery(nodes: IdeTreeNode[], query: string): IdeTreeNode[] {
  if (!query.trim()) {
    return nodes
  }

  const lowerQuery = query.toLowerCase()

  return nodes
    .map(node => {
      if (node.isDirectory) {
        const filteredChildren = node.children ? filterTreeByQuery(node.children, query) : []
        const matchesSelf =
          node.name.toLowerCase().includes(lowerQuery) ||
          node.relativePath.toLowerCase().includes(lowerQuery)

        if (matchesSelf || filteredChildren.length > 0) {
          return { ...node, children: filteredChildren }
        }
        return null
      }

      const matches =
        node.name.toLowerCase().includes(lowerQuery) ||
        node.relativePath.toLowerCase().includes(lowerQuery)
      return matches ? node : null
    })
    .filter((node): node is IdeTreeNode => node !== null)
}

function buildDocMap(documents: CreatedDocument[]): Map<string, CreatedDocument> {
  const map = new Map<string, CreatedDocument>()
  for (const doc of documents) {
    const key = normalizePath(doc.relative_path).toLowerCase()
    map.set(key, doc)
  }
  return map
}

async function ensureDirectory(dirPath: string): Promise<void> {
  await createDesktopDirectory(dirPath)
}

export interface UseIdeFileTreeResult {
  data: IdeTreeNode[]
  filteredData: IdeTreeNode[]
  loading: boolean
  error: string | null
  expandedPaths: Set<string>
  toggleExpanded: (path: string) => void
  refresh: () => void
  openFiles: Set<string>
  activeFile: string | null
  selectedNodePath: string | null
  setSelectedNodePath: (path: string | null) => void
  openFile: (path: string) => void
  closeFile: (path: string) => void
  setActiveFile: (path: string) => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  filter: ExplorerFilter
  setFilter: (filter: ExplorerFilter) => void
  createFile: (parentPath: string, fileName: string) => Promise<void>
  createFolder: (parentPath: string, folderName: string) => Promise<void>
  renameNode: (path: string, newName: string) => Promise<void>
  deleteNode: (path: string) => Promise<void>
  showKarnaFiles: boolean
  setShowKarnaFiles: (show: boolean) => void
  activeFileHiddenByFilter: boolean
}

function getRecentFilesKey(rootPath: string | null): string {
  return `karna-ide-recent-${rootPath || 'default'}`
}

function loadRecentFiles(rootPath: string | null): { openFiles: string[]; activeFile: string | null } {
  if (!rootPath) {
    return { openFiles: [], activeFile: null }
  }
  try {
    const stored = localStorage.getItem(getRecentFilesKey(rootPath))
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        openFiles: Array.isArray(parsed.openFiles) ? parsed.openFiles : [],
        activeFile: parsed.activeFile || null
      }
    }
  } catch {
    // ignore
  }
  return { openFiles: [], activeFile: null }
}

function saveRecentFiles(rootPath: string | null, openFiles: Set<string>, activeFile: string | null) {
  if (!rootPath) return
  try {
    localStorage.setItem(
      getRecentFilesKey(rootPath),
      JSON.stringify({
        openFiles: Array.from(openFiles),
        activeFile
      })
    )
  } catch {
    // ignore
  }
}

interface UseIdeFileTreeOptions {
  rootPath: string | null
  createdDocuments?: CreatedDocument[]
}

export function useIdeFileTree(options: UseIdeFileTreeOptions): UseIdeFileTreeResult
export function useIdeFileTree(rootPath: string | null): UseIdeFileTreeResult

export function useIdeFileTree(
  arg: string | null | UseIdeFileTreeOptions
): UseIdeFileTreeResult {
  const rootPath = typeof arg === 'string' || arg === null ? arg : arg.rootPath
  const createdDocuments =
    typeof arg === 'object' && arg !== null ? arg.createdDocuments || [] : []

  const [data, setData] = useState<IdeTreeNode[]>([])
  const dataRef = useRef<IdeTreeNode[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    if (typeof localStorage !== 'undefined' && rootPath) {
      try {
        const stored = localStorage.getItem(`karna-ide-expanded-${rootPath}`)
        if (stored) return new Set(JSON.parse(stored))
      } catch {
        // ignore
      }
    }
    return new Set()
  })
  const [openFiles, setOpenFiles] = useState<Set<string>>(() => {
    const recent = loadRecentFiles(rootPath)
    return new Set(recent.openFiles)
  })
  const [activeFile, setActiveFile] = useState<string | null>(() => {
    const recent = loadRecentFiles(rootPath)
    return recent.activeFile
  })
  const [selectedNodePath, setSelectedNodePath] = useState<string | null>(() => {
    const recent = loadRecentFiles(rootPath)
    return recent.activeFile || rootPath
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [filter, setFilter] = useState<ExplorerFilter>('all')
  const [showKarnaFiles, setShowKarnaFiles] = useState(false)

  const docMap = useMemo(() => buildDocMap(createdDocuments), [createdDocuments])

  const filterTree = useCallback(
    (nodes: IdeTreeNode[]): IdeTreeNode[] => {
      let result = nodes
      if (filter === 'documents') {
        result = filterTreeForDocuments(result)
      }
      if (searchQuery.trim()) {
        result = filterTreeByQuery(result, searchQuery)
      }
      return result
    },
    [filter, searchQuery]
  )

  const filteredData = useMemo(() => filterTree(data), [data, filterTree])

  const activeFileHiddenByFilter = useMemo(() => {
    if (!activeFile) return false
    if (filter === 'all') return false

    function findNode(nodes: IdeTreeNode[]): boolean {
      for (const node of nodes) {
        if (node.id === activeFile) return true
        if (node.isDirectory && node.children && findNode(node.children)) return true
      }
      return false
    }
    return !findNode(filteredData)
  }, [activeFile, filter, filteredData])

  const loadChildren = useCallback(
    async (
      nodes: IdeTreeNode[],
      parentPath: string,
      showKarna: boolean,
      dMap: Map<string, CreatedDocument>
    ): Promise<IdeTreeNode[]> => {
      const result = await Promise.all(
        nodes.map(async node => {
          if (node.isDirectory) {
            const isExpanded = expandedPaths.has(node.id)

            if (isExpanded) {
              const dirResult = await loadDirectory(node.id, parentPath, showKarna, dMap)
              if (!dirResult.ok) {
                return { ...node, children: [], childrenState: 'error' as const, error: dirResult.error, loading: false }
              }
              const loadedChildren = await loadChildren(dirResult.entries, parentPath, showKarna, dMap)

              return { ...node, children: loadedChildren, childrenState: 'loaded' as const, loading: false, error: null }
            }

            return { ...node, children: undefined, childrenState: 'unloaded' as const, loading: false }
          }

          return node
        })
      )

      return result
    },
    [expandedPaths]
  )

  const refresh = useCallback(async () => {
    if (!rootPath) {
      setData([])
      setError(null)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const rootResult = await loadDirectory(rootPath, rootPath, showKarnaFiles, docMap)
      if (!rootResult.ok) {
        setError(rootResult.error)
        setData([])
        return
      }
      const loaded = await loadChildren(rootResult.entries, rootPath, showKarnaFiles, docMap)
      setData(loaded)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load directory')
    } finally {
      setLoading(false)
    }
  }, [rootPath, loadChildren, showKarnaFiles, docMap])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    saveRecentFiles(rootPath, openFiles, activeFile)
  }, [rootPath, openFiles, activeFile])

  useEffect(() => {
    if (rootPath && expandedPaths.size > 0) {
      try {
        localStorage.setItem(
          `karna-ide-expanded-${rootPath}`,
          JSON.stringify(Array.from(expandedPaths))
        )
      } catch {
        // ignore
      }
    }
  }, [rootPath, expandedPaths])

  const toggleExpanded = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    async function expandAndLoad() {
      if (!rootPath) {
        return
      }

      const currentData = dataRef.current
      if (currentData.length === 0) {
        return
      }

      const updateNodeChildren = async (nodes: IdeTreeNode[]): Promise<IdeTreeNode[]> => {
        return Promise.all(
          nodes.map(async node => {
            if (node.isDirectory && expandedPaths.has(node.id)) {
              if (!node.children || node.childrenState === 'unloaded') {
                const dirResult = await loadDirectory(node.id, rootPath, showKarnaFiles, docMap)
                if (!dirResult.ok) {
                  return { ...node, children: [], childrenState: 'error' as const, error: dirResult.error }
                }
                const loadedChildren = await updateNodeChildren(dirResult.entries)
                return { ...node, children: loadedChildren, childrenState: 'loaded' as const, error: null }
              }

              const updatedChildren = await updateNodeChildren(node.children)
              return { ...node, children: updatedChildren, childrenState: 'loaded' as const }
            }
            return node
          })
        )
      }

      const updated = await updateNodeChildren(currentData)
      if (!cancelled) {
        setData(updated)
      }
    }

    void expandAndLoad()

    return () => {
      cancelled = true
    }
  }, [expandedPaths, rootPath, showKarnaFiles, docMap])

  const openFile = useCallback((path: string) => {
    setOpenFiles(prev => new Set(prev).add(path))
    setActiveFile(path)
    setSelectedNodePath(path)
  }, [])

  const closeFile = useCallback((path: string) => {
    setOpenFiles(prev => {
      const next = new Set(prev)
      next.delete(path)
      return next
    })
    setActiveFile(prev => (prev === path ? null : prev))
  }, [])

  const createFile = useCallback(
    async (parentPath: string, fileName: string) => {
      if (!fileName.trim()) {
        throw new Error('文件名不能为空')
      }

      const filePath = joinPath(parentPath, fileName)
      await writeDesktopFileText(filePath, '')

      setExpandedPaths(prev => new Set(prev).add(parentPath))
      await refresh()
      openFile(filePath)
    },
    [refresh, openFile]
  )

  const createFolder = useCallback(
    async (parentPath: string, folderName: string) => {
      if (!folderName.trim()) {
        throw new Error('文件夹名不能为空')
      }

      const folderPath = joinPath(parentPath, folderName)
      await ensureDirectory(folderPath)

      setExpandedPaths(prev => new Set(prev).add(parentPath).add(folderPath))
      await refresh()
    },
    [refresh]
  )

  const renameNode = useCallback(
    async (path: string, newName: string) => {
      if (!newName.trim()) {
        throw new Error('名称不能为空')
      }

      const newPath = await renameDesktopPath(path, newName)

      setOpenFiles(prev => {
        const next = new Set<string>()
        prev.forEach(f => {
          if (f === path) {
            next.add(newPath)
          } else if (f.startsWith(path + '\\') || f.startsWith(path + '/')) {
            const rel = f.slice(path.length)
            next.add(newPath + rel)
          } else {
            next.add(f)
          }
        })
        return next
      })

      setActiveFile(prev => {
        if (prev === path) return newPath
        if (prev?.startsWith(path + '\\') || prev?.startsWith(path + '/')) {
          return newPath + prev.slice(path.length)
        }
        return prev
      })
      setSelectedNodePath(prev => {
        if (prev === path) return newPath
        if (prev?.startsWith(path + '\\') || prev?.startsWith(path + '/')) {
          return newPath + prev.slice(path.length)
        }
        return prev
      })

      setExpandedPaths(prev => {
        const next = new Set<string>()
        prev.forEach(p => {
          if (p === path) {
            next.add(newPath)
          } else if (p.startsWith(path + '\\') || p.startsWith(path + '/')) {
            next.add(newPath + p.slice(path.length))
          } else {
            next.add(p)
          }
        })
        return next
      })

      await refresh()
    },
    [refresh]
  )

  const deleteNode = useCallback(
    async (path: string) => {
      await trashDesktopPath(path)

      setOpenFiles(prev => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })
      setActiveFile(prev => (prev === path ? null : prev))
      setSelectedNodePath(prev => {
        if (!prev) return prev
        return prev === path || prev.startsWith(path + '\\') || prev.startsWith(path + '/')
          ? rootPath
          : prev
      })

      setExpandedPaths(prev => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })

      await refresh()
    },
    [refresh]
  )

  return {
    data,
    filteredData,
    loading,
    error,
    expandedPaths,
    toggleExpanded,
    refresh,
    openFiles,
    activeFile,
    selectedNodePath,
    setSelectedNodePath,
    openFile,
    closeFile,
    setActiveFile,
    searchQuery,
    setSearchQuery,
    filter,
    setFilter,
    createFile,
    createFolder,
    renameNode,
    deleteNode,
    showKarnaFiles,
    setShowKarnaFiles,
    activeFileHiddenByFilter
  }
}
