import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { FileTypeIcon } from '@/components/ui/file-type-icon'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

import type { DocumentObjectType } from '@/types/writer-project-catalog'
import { DOCUMENT_OBJECT_TYPES, DOCUMENT_TYPE_LABELS } from '@/types/writer-project-catalog'

import type { IdeTreeNode, UseIdeFileTreeResult } from './use-ide-file-tree'
import { useWriterProject } from './project-context'

const DELIVERABLE_TYPES: DocumentObjectType[] = [
  'narrative_prose',
  'script_dialogue',
  'interactive_narrative',
  'marketing_copy',
  'informational_article',
  'argumentative_document',
  'structured_business_doc',
  'regulated_document',
  'technical_document',
  'knowledge_asset'
]

const PROCESS_TYPES: DocumentObjectType[] = [
  'outline',
  'research_material',
  'review_feedback',
  'revision_artifact'
]

interface WorkspaceExplorerProps {
  rootPath: string | null
  projectName: string
  tree: UseIdeFileTreeResult
}

type DialogMode = 'createFile' | 'createFolder' | 'rename' | null

interface TreeActions {
  onCreateFile: (parentPath: string) => void
  onCreateFolder: (parentPath: string) => void
  onRename: (node: IdeTreeNode) => void
  onDelete: (node: IdeTreeNode) => void
  onRegisterDocument?: (node: IdeTreeNode) => void
}

function DocumentTypeTag({ docType }: { docType: string }) {
  const label = DOCUMENT_TYPE_LABELS[docType as DocumentObjectType] || docType
  return (
    <span
      className="ml-1 shrink-0 rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-tertiary) px-1 text-[9px] font-medium text-(--ui-text-tertiary) leading-tight"
      title={`文档类型：${label}`}
    >
      {label}
    </span>
  )
}

function TreeNode({
  node,
  depth,
  expandedPaths,
  activeFile,
  selectedNodePath,
  contextTargetPath,
  onToggle,
  onOpenFile,
  onContextMenu,
  onSelectNode,
  actions
}: {
  node: IdeTreeNode
  depth: number
  expandedPaths: Set<string>
  activeFile: string | null
  selectedNodePath: string | null
  contextTargetPath: string | null
  onToggle: (path: string) => void
  onOpenFile: (path: string) => void
  onContextMenu: (path: string, kind: 'file' | 'directory') => void
  onSelectNode: (path: string) => void
  actions: TreeActions
}) {
  const isExpanded = expandedPaths.has(node.id)
  const isActive = activeFile === node.id
  const isSelected = selectedNodePath === node.id
  const isContextTarget = contextTargetPath === node.id

  const handleClick = () => {
    onSelectNode(node.id)
    if (node.isDirectory) {
      onToggle(node.id)
    } else {
      onOpenFile(node.id)
    }
  }

  return (
    <div>
      <ContextMenu onOpenChange={open => {
        if (open) {
          onContextMenu(node.id, node.isDirectory ? 'directory' : 'file')
        } else if (contextTargetPath === node.id) {
          onContextMenu('', 'file')
        }
      }}>
        <ContextMenuTrigger asChild>
          <button
            className={cn(
              'flex w-full items-center gap-1 rounded px-2 py-1 text-left text-sm transition-colors hover:bg-(--ui-control-hover-background)',
              isSelected && 'bg-(--ui-list-active-selection-background) text-(--ui-list-active-selection-foreground) ring-1 ring-(--ui-color-accent)/40',
              isActive && !isSelected && 'bg-(--ui-list-active-selection-background) text-(--ui-list-active-selection-foreground)',
              isContextTarget && 'bg-(--ui-list-hover-background) text-foreground ring-1 ring-(--ui-color-accent)/50'
            )}
            onClick={handleClick}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
            type="button"
          >
            {node.isDirectory ? (
              <Codicon
                className={cn('shrink-0 transition-transform', !isExpanded && '-rotate-90')}
                name="chevron-down"
                size="0.75rem"
              />
            ) : (
              <span className="w-3 shrink-0" />
            )}
            <FileTypeIcon className="shrink-0" path={node.name} size="0.875rem" />
            <span className="truncate">{node.name}</span>
            {node.visibility === 'system' && (
              <span
                className="ml-1 shrink-0 rounded border border-dashed border-(--ui-stroke-tertiary) px-1 text-[9px] text-(--ui-text-quaternary) leading-tight"
                title="系统文件"
              >
                系统
              </span>
            )}
            {node.document?.registered && node.document.documentType && (
              <DocumentTypeTag docType={node.document.documentType} />
            )}
            {!node.document?.registered && node.document && (
              <span
                className="ml-1 shrink-0 rounded border border-dashed border-(--ui-stroke-tertiary) px-1 text-[9px] text-(--ui-text-quaternary) leading-tight"
                title="未登记为项目文档"
              >
                未登记
              </span>
            )}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {node.isDirectory ? (
            <>
              <ContextMenuItem onSelect={() => actions.onCreateFile(node.id)}>
                <Codicon name="new-file" size="0.875rem" />
                <span>新建文件</span>
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => actions.onCreateFolder(node.id)}>
                <Codicon name="new-folder" size="0.875rem" />
                <span>新建文件夹</span>
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          ) : (
            <>
              {actions.onRegisterDocument && !node.document?.registered && (
                <ContextMenuItem onSelect={() => actions.onRegisterDocument!(node)}>
                  <Codicon name="tag" size="0.875rem" />
                  <span>登记为项目文档</span>
                </ContextMenuItem>
              )}
              {actions.onRegisterDocument && node.document?.registered && (
                <ContextMenuItem disabled>
                  <Codicon name="check" size="0.875rem" />
                  <span>已登记为项目文档</span>
                </ContextMenuItem>
              )}
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem onSelect={() => actions.onRename(node)}>
            <Codicon name="edit" size="0.875rem" />
            <span>重命名</span>
          </ContextMenuItem>
          <ContextMenuItem className="text-destructive" onSelect={() => actions.onDelete(node)}>
            <Codicon name="trash" size="0.875rem" />
            <span>删除</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {node.isDirectory && isExpanded && node.children && (
        <div>
          {node.children.map(child => (
            <TreeNode
              actions={actions}
              activeFile={activeFile}
              selectedNodePath={selectedNodePath}
              contextTargetPath={contextTargetPath}
              depth={depth + 1}
              expandedPaths={expandedPaths}
              key={child.id}
              node={child}
              onContextMenu={onContextMenu}
              onSelectNode={onSelectNode}
              onOpenFile={onOpenFile}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function WorkspaceExplorer({ rootPath, projectName, tree }: WorkspaceExplorerProps) {
  const {
    filteredData,
    loading,
    error,
    expandedPaths,
    toggleExpanded,
    refresh,
    activeFile,
    selectedNodePath,
    setSelectedNodePath,
    openFile,
    searchQuery,
    setSearchQuery,
    createFile,
    createFolder,
    renameNode,
    deleteNode,
    showKarnaFiles,
    setShowKarnaFiles
  } = tree

  const { writerProjectId, capabilities, reload } = useWriterProject()

  const [dialogMode, setDialogMode] = useState<DialogMode>(null)
  const [dialogTarget, setDialogTarget] = useState<IdeTreeNode | null>(null)
  const [dialogParentPath, setDialogParentPath] = useState<string>('')
  const [dialogValue, setDialogValue] = useState('')
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<IdeTreeNode | null>(null)
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false)
  const [registerTargetNode, setRegisterTargetNode] = useState<IdeTreeNode | null>(null)
  const [registerDocType, setRegisterDocType] = useState<DocumentObjectType>('narrative_prose')
  const [registerError, setRegisterError] = useState<string | null>(null)
  const [contextTargetPath, setContextTargetPath] = useState<string | null>(null)
  const [contextTargetKind, setContextTargetKind] = useState<'file' | 'directory' | 'root' | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (dialogMode && inputRef.current) {
      inputRef.current.focus()

      if (dialogMode === 'rename' && dialogTarget) {
        setDialogValue(dialogTarget.name)
        setTimeout(() => inputRef.current?.select(), 0)
      }
    }
  }, [dialogMode, dialogTarget])

  const openCreateFileDialog = (parentPath: string) => {
    setDialogMode('createFile')
    setDialogTarget(null)
    setDialogParentPath(parentPath)
    setDialogValue('')
    setDialogError(null)
  }

  const openCreateFolderDialog = (parentPath: string) => {
    setDialogMode('createFolder')
    setDialogTarget(null)
    setDialogParentPath(parentPath)
    setDialogValue('')
    setDialogError(null)
  }

  const openRenameDialog = (node: IdeTreeNode) => {
    setDialogMode('rename')
    setDialogTarget(node)
    setDialogValue(node.name)
    setDialogError(null)
  }

  const openDeleteConfirm = (node: IdeTreeNode) => {
    setConfirmDelete(node)
  }

  const openRegisterDialog = (node: IdeTreeNode) => {
    setRegisterTargetNode(node)
    setRegisterDocType((capabilities?.primaryDocumentType as DocumentObjectType) || 'narrative_prose')
    setRegisterError(null)
    setRegisterDialogOpen(true)
  }

  const closeRegisterDialog = () => {
    setRegisterDialogOpen(false)
    setRegisterTargetNode(null)
    setRegisterDocType('narrative_prose')
    setRegisterError(null)
  }

  const handleContextMenu = (path: string, kind: 'file' | 'directory') => {
    if (!path) {
      clearContextTarget()
      return
    }
    setContextTargetPath(path)
    setContextTargetKind(kind)
  }

  const clearContextTarget = () => {
    setContextTargetPath(null)
    setContextTargetKind(null)
  }

  const getParentPathForNew = (targetPath: string | null, targetKind: 'file' | 'directory' | 'root' | null): string => {
    if (!targetPath || targetKind === 'root' || !targetKind) {
      return rootPath || ''
    }
    if (targetKind === 'directory') {
      return targetPath
    }
    const idx = Math.max(targetPath.lastIndexOf('/'), targetPath.lastIndexOf('\\'))
    return idx >= 0 ? targetPath.slice(0, idx) : (rootPath || '')
  }

  const getDisplayPath = (absolutePath: string): string => {
    if (!rootPath) {
      return absolutePath.split(/[/\\]/).pop() || absolutePath
    }
    const normalizedRoot = rootPath.replace(/\\/g, '/')
    const normalizedAbs = absolutePath.replace(/\\/g, '/')
    if (normalizedAbs.startsWith(normalizedRoot)) {
      const rel = normalizedAbs.slice(normalizedRoot.length).replace(/^\//, '')
      return rel || rootPath.split(/[/\\]/).pop() || '项目根目录'
    }
    return absolutePath.split(/[/\\]/).pop() || absolutePath
  }

  const handleRegisterSubmit = async () => {
    if (!registerTargetNode || !writerProjectId || !rootPath) {
      return
    }

    setRegisterError(null)

    try {
      const absolutePath = registerTargetNode.id
      const normalizedRoot = rootPath.replace(/[/\\]+$/, '')
      const normalizedAbs = absolutePath.replace(/\\/g, '/')
      const normalizedRootForCompare = normalizedRoot.replace(/\\/g, '/')

      let relativePath = ''
      if (normalizedAbs.toLowerCase().startsWith(normalizedRootForCompare.toLowerCase())) {
        relativePath = normalizedAbs.slice(normalizedRootForCompare.length).replace(/^[/]+/, '')
      } else {
        relativePath = absolutePath
      }

      const title = registerTargetNode.name.replace(/\.[^/.]+$/, '')

      await window.karnaDesktop.api({
        method: 'POST',
        path: `/api/writer/projects/${writerProjectId}/documents/register`,
        body: {
          relative_path: relativePath,
          document_type: registerDocType,
          title
        }
      })

      closeRegisterDialog()
      await refresh()
      await reload()
    } catch (err) {
      setRegisterError(err instanceof Error ? err.message : '登记失败')
    }
  }

  const closeDialog = () => {
    setDialogMode(null)
    setDialogTarget(null)
    setDialogParentPath('')
    setDialogValue('')
    setDialogError(null)
  }

  const handleDialogSubmit = async () => {
    if (!dialogMode) {
      return
    }

    setDialogError(null)

    try {
      switch (dialogMode) {
        case 'createFile':
          await createFile(dialogParentPath, dialogValue)

          break

        case 'createFolder':
          await createFolder(dialogParentPath, dialogValue)

          break

        case 'rename':
          if (dialogTarget) {
            await renameNode(dialogTarget.id, dialogValue)
          }

          break
      }

      closeDialog()
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : '操作失败')
    }
  }

  const getDialogTitle = () => {
    switch (dialogMode) {
      case 'createFile':
        return '新建文件'

      case 'createFolder':
        return '新建文件夹'

      case 'rename':
        return '重命名'

      default:
        return ''
    }
  }

  const treeActions: TreeActions = {
    onCreateFile: openCreateFileDialog,
    onCreateFolder: openCreateFolderDialog,
    onRename: openRenameDialog,
    onDelete: openDeleteConfirm,
    onRegisterDocument: openRegisterDialog
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-(--ui-stroke-secondary) px-3 py-2">
        <span className="text-xs font-medium uppercase tracking-wider text-(--ui-text-secondary)">
          资源管理器
        </span>
        <div className="flex items-center gap-1">
          <Button
            disabled={!rootPath}
            onClick={() => rootPath && openCreateFileDialog(rootPath)}
            size="icon-xs"
            title="新建文件"
            variant="ghost"
          >
            <Codicon name="new-file" size="0.875rem" />
          </Button>
          <Button
            disabled={!rootPath}
            onClick={() => rootPath && openCreateFolderDialog(rootPath)}
            size="icon-xs"
            title="新建文件夹"
            variant="ghost"
          >
            <Codicon name="new-folder" size="0.875rem" />
          </Button>
          <Button onClick={refresh} size="icon-xs" title="刷新" variant="ghost">
            <Codicon name="refresh" size="0.875rem" />
          </Button>
        </div>
      </div>

      <div className="px-2 py-1.5">
        <div className="relative">
          <Codicon
            className="absolute left-2 top-1/2 -translate-y-1/2 text-(--ui-text-quaternary)"
            name="search"
            size="0.75rem"
          />
          <Input
            className="h-7 pl-7 text-xs"
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索文件..."
            value={searchQuery}
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto py-1">
        {loading && filteredData.length === 0 && (
          <div className="flex items-center justify-center py-8 text-xs text-(--ui-text-quaternary)">
            加载中...
          </div>
        )}

        {error && (
          <div className="mx-2 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && filteredData.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center text-xs text-(--ui-text-quaternary)">
            <Codicon className="mb-2 text-2xl" name="folder-opened" />
            <span>
              {searchQuery
                ? '没有找到匹配的文件'
                : '项目文件夹为空'}
            </span>
          </div>
        )}

        {filteredData.map(node => (
          <TreeNode
            actions={treeActions}
            activeFile={activeFile}
            selectedNodePath={selectedNodePath}
            contextTargetPath={contextTargetPath}
            depth={0}
            expandedPaths={expandedPaths}
            key={node.id}
            node={node}
            onContextMenu={handleContextMenu}
            onOpenFile={openFile}
            onSelectNode={setSelectedNodePath}
            onToggle={toggleExpanded}
          />
        ))}
      </div>

      <ContextMenu onOpenChange={open => {
        if (open) {
          setContextTargetPath(rootPath || null)
          setContextTargetKind('root')
        } else if (contextTargetKind === 'root') {
          clearContextTarget()
        }
      }}>
        <ContextMenuTrigger asChild>
          <button
            aria-label="项目根目录"
            className={cn(
              'min-h-8 w-full rounded text-left',
              selectedNodePath === rootPath && 'bg-(--ui-list-active-selection-background) ring-1 ring-(--ui-color-accent)/40'
            )}
            onClick={() => setSelectedNodePath(rootPath)}
            type="button"
          />
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem
            disabled={!rootPath}
            onSelect={() => {
              const parentPath = getParentPathForNew(contextTargetPath, contextTargetKind)
              openCreateFileDialog(parentPath)
            }}
          >
            <Codicon name="new-file" size="0.875rem" />
            <span>新建文件</span>
          </ContextMenuItem>
          <ContextMenuItem
            disabled={!rootPath}
            onSelect={() => {
              const parentPath = getParentPathForNew(contextTargetPath, contextTargetKind)
              openCreateFolderDialog(parentPath)
            }}
          >
            <Codicon name="new-folder" size="0.875rem" />
            <span>新建文件夹</span>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={refresh}>
            <Codicon name="refresh" size="0.875rem" />
            <span>刷新</span>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => setShowKarnaFiles(!showKarnaFiles)}>
            {showKarnaFiles ? (
              <Codicon name="check" size="0.875rem" />
            ) : (
              <span className="w-[0.875rem]" />
            )}
            <span>显示 Writer OS 系统文件</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog onOpenChange={open => !open && closeDialog()} open={dialogMode !== null}>
        <DialogContent className="max-w-sm" onKeyDown={e => e.key === 'Enter' && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={e => {
              e.preventDefault()
              void handleDialogSubmit()
            }}
          >
            {(dialogMode === 'createFile' || dialogMode === 'createFolder') && (
              <div className="mb-3">
                <label className="text-xs font-medium text-(--ui-text-secondary)">创建位置</label>
                <div className="mt-1 flex items-center gap-2 rounded border border-(--ui-stroke-secondary) bg-(--ui-control-background) px-3 py-2 text-xs text-(--ui-text-tertiary)">
                  <Codicon name="folder" size="0.75rem" />
                  <span className="truncate" title={dialogParentPath}>
                    {getDisplayPath(dialogParentPath) || '项目根目录'}
                  </span>
                </div>
              </div>
            )}
            <Input
              autoFocus
              onChange={e => setDialogValue(e.target.value)}
              placeholder={dialogMode === 'createFile' ? '文件名（例如 chapter1.md）' : '文件夹名'}
              ref={inputRef}
              value={dialogValue}
            />
            {dialogError && (
              <div className="mt-2 rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {dialogError}
              </div>
            )}
            <DialogFooter className="mt-4">
              <Button onClick={closeDialog} type="button" variant="ghost">
                取消
              </Button>
              <Button type="submit">确定</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        confirmLabel="删除"
        description={
          confirmDelete
            ? `确定要删除「${confirmDelete.name}」吗？${confirmDelete.isDirectory ? '文件夹内的所有内容也将被移动到回收站。' : ''}此操作可在系统回收站中恢复。`
            : ''
        }
        destructive
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) {
            await deleteNode(confirmDelete.id)
            setConfirmDelete(null)
          }
        }}
        open={confirmDelete !== null}
        title="确认删除"
      />

      <Dialog onOpenChange={open => !open && closeRegisterDialog()} open={registerDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>登记为项目文档</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-(--ui-text-secondary)">文件名</label>
              <div className="mt-1 rounded border border-(--ui-stroke-secondary) bg-(--ui-control-background) px-3 py-2 text-sm">
                {registerTargetNode?.name}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-(--ui-text-secondary)">文档类型</label>
              <Select onValueChange={(value: string) => setRegisterDocType(value as DocumentObjectType)} value={registerDocType}>
                <SelectTrigger className="mt-1 w-full">
                  <SelectValue placeholder="请选择文档类型" />
                </SelectTrigger>
                <SelectContent>
                  <div className="px-2 py-1 text-xs font-medium text-(--ui-text-quaternary)">交付型</div>
                  {DELIVERABLE_TYPES.map(docType => (
                    <SelectItem key={docType} value={docType}>
                      {DOCUMENT_TYPE_LABELS[docType]}
                    </SelectItem>
                  ))}
                  <div className="px-2 py-1 text-xs font-medium text-(--ui-text-quaternary)">过程型</div>
                  {PROCESS_TYPES.map(docType => (
                    <SelectItem key={docType} value={docType}>
                      {DOCUMENT_TYPE_LABELS[docType]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {registerError && (
              <div className="rounded border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {registerError}
              </div>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button onClick={closeRegisterDialog} type="button" variant="ghost">
              取消
            </Button>
            <Button onClick={() => void handleRegisterSubmit()} type="button">
              确定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
