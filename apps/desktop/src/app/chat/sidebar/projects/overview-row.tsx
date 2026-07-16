import type * as React from 'react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { ideRoute } from '@/app/routes'
import { Checkbox } from '@/components/ui/checkbox'
import { Codicon } from '@/components/ui/codicon'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import type { SessionInfo } from '@/hermes'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { dismissAutoProject } from '@/store/layout'
import {
  copyPath,
  deleteProject,
  openProjectRename,
  revealPath,
  setActiveProject
} from '@/store/projects'
import { canOpenSessionWindow } from '@/store/windows'

import {
  SIDEBAR_LEAD_ICON_SIZE,
  SidebarRowCluster,
  SidebarRowGrab,
  SidebarRowLabel,
  SidebarRowLead,
  SidebarRowLeadGlyph,
  SidebarRowNest,
  SidebarRowShell
} from '../chrome'

import { latestProjectSessions, PROJECT_PREVIEW_COUNT, useWorkspaceNodeOpen } from './model'
import type { SidebarProjectTree } from './workspace-groups'
import { WorkspaceAddButton } from './workspace-header'

export function projectIcon({ color, icon }: SidebarProjectTree) {
  if (color && !icon) {
    return (
      <SidebarRowLeadGlyph>
        <span aria-hidden="true" className="size-1 rounded-full" style={{ backgroundColor: color }} />
      </SidebarRowLeadGlyph>
    )
  }

  return (
    <SidebarRowLeadGlyph style={color ? { color } : undefined}>
      <Codicon name={icon || 'folder-library'} size={SIDEBAR_LEAD_ICON_SIZE} />
    </SidebarRowLeadGlyph>
  )
}

export function ProjectBackRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <SidebarRowShell>
      <button
        className="group/back flex w-full items-center gap-2 text-(--ui-text-tertiary) opacity-40 hover:text-foreground"
        onClick={onClick}
      >
        <SidebarRowLead>
          <SidebarRowLeadGlyph>
            <Codicon name="arrow-left" size={SIDEBAR_LEAD_ICON_SIZE} />
          </SidebarRowLeadGlyph>
        </SidebarRowLead>
        <SidebarRowLabel className="text-xs underline-offset-4 group-hover/back:underline">{label}</SidebarRowLabel>
      </button>
    </SidebarRowShell>
  )
}

interface ProjectOverviewRowProps {
  project: SidebarProjectTree
  onEnter?: (id: string) => void
  onNewSession?: (path: null | string, opts?: { follow?: boolean }) => void
  renderRows?: (sessions: SessionInfo[]) => React.ReactNode
  activeProjectId?: null | string
  previewSessions?: SessionInfo[]
  reorderable?: boolean
  dragging?: boolean
  dragHandleProps?: React.HTMLAttributes<HTMLElement>
  ref?: React.Ref<HTMLDivElement>
  style?: React.CSSProperties
  categoryLabel?: string
  categorySubLabel?: string
  isLegacy?: boolean
}

export function ProjectOverviewRow({
  project,
  onNewSession,
  renderRows,
  activeProjectId,
  previewSessions,
  reorderable = false,
  dragging = false,
  dragHandleProps,
  ref,
  style,
  categoryLabel,
  categorySubLabel,
  isLegacy = false
}: ProjectOverviewRowProps) {
  const { t } = useI18n()
  const s = t.sidebar
  const navigate = useNavigate()
  const isActive = project.id === activeProjectId
  const [open, toggleOpen] = useWorkspaceNodeOpen(project.id)
  const fetched = (previewSessions ?? []).slice(0, PROJECT_PREVIEW_COUNT)
  const preview = renderRows ? (fetched.length ? fetched : latestProjectSessions(project, PROJECT_PREVIEW_COUNT)) : []

  const lead = reorderable ? (
    <SidebarRowGrab
      ariaLabel={s.projects.reorder(project.label)}
      dragging={dragging}
      dragHandleProps={dragHandleProps}
      leadClassName="overflow-visible"
    >
      {projectIcon(project)}
    </SidebarRowGrab>
  ) : (
    <SidebarRowLead>{projectIcon(project)}</SidebarRowLead>
  )

  const openInIDE = () => {
    navigate(ideRoute(project.id))
  }

  const target = { id: project.id, name: project.label }
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteSessions, setDeleteSessions] = useState(true)
  const [deleteFolder, setDeleteFolder] = useState(false)

  const handleDelete = () => {
    if (project.isAuto) {
      dismissAutoProject(project.id)
    } else {
      setDeleteSessions(true)
      setDeleteFolder(false)
      setDeleteDialogOpen(true)
    }
  }

  const confirmDelete = async () => {
    await deleteProject(project.id, { deleteSessions, deleteFolder })
    setDeleteDialogOpen(false)
  }

  return (
    <div className={cn(dragging && 'relative z-10')} ref={ref} style={style}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <SidebarRowShell
            actions={
              <>
                {onNewSession && (
                  <WorkspaceAddButton
                    label={s.newSessionIn(project.label)}
                    onClick={() => onNewSession(project.path, { follow: false })}
                  />
                )}
              </>
            }
            className={cn('group/workspace cursor-default', dragging && 'cursor-grabbing bg-(--ui-sidebar-surface-background)')}
          >
            <SidebarRowCluster className="min-w-0 flex-1">
              {lead}
              <div className="min-w-0 flex-1">
                <SidebarRowLabel
                  className={cn('font-medium', isActive && 'text-foreground')}
                >
                  {project.label}
                </SidebarRowLabel>
                {(categoryLabel || categorySubLabel) && (
                  <div className="flex items-center gap-1 mt-0.5">
                    {categoryLabel && (
                      <span className={cn(
                        'text-[0.6rem] px-1 py-0.5 rounded',
                        isLegacy
                          ? 'bg-amber-500/10 text-amber-600'
                          : 'bg-(--ui-accent)/10 text-(--ui-accent)'
                      )}>
                        {categoryLabel}
                        {isLegacy && ' · 旧版'}
                      </span>
                    )}
                    {categorySubLabel && !isLegacy && (
                      <span className="text-[0.6rem] text-(--ui-text-tertiary)">
                        {categorySubLabel}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button
                aria-label={s.projects.toggle(project.label)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-transparent p-0 hover:bg-(--ui-sidebar-hover)"
                onClick={toggleOpen}
                type="button"
              >
                <DisclosureCaret
                  className="shrink-0 text-(--ui-text-tertiary) opacity-0 transition group-hover/workspace:opacity-100"
                  open={open}
                />
              </button>
            </SidebarRowCluster>
          </SidebarRowShell>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <div className="px-2 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">
            项目操作
          </div>
          <ContextMenuItem onSelect={openInIDE}>
            <Codicon name="edit-layout" size="0.875rem" />
            <span>打开为 Writer IDE</span>
          </ContextMenuItem>
          <ContextMenuSeparator />
          {!project.isAuto && (
            <>
              <ContextMenuItem onSelect={() => openProjectRename(target)}>
                <Codicon name="edit" size="0.875rem" />
                <span>重命名项目</span>
              </ContextMenuItem>
              <ContextMenuItem disabled={isActive} onSelect={() => void setActiveProject(project.id)}>
                <Codicon name="target" size="0.875rem" />
                <span>设为活动项目</span>
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem disabled={!project.path} onSelect={() => void revealPath(project.path)}>
            <Codicon name="folder-opened" size="0.875rem" />
            <span>在文件夹中显示</span>
          </ContextMenuItem>
          <ContextMenuItem disabled={!project.path} onSelect={() => void copyPath(project.path)}>
            <Codicon name="copy" size="0.875rem" />
            <span>复制项目路径</span>
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={handleDelete} variant="destructive">
            <Codicon name="trash" size="0.875rem" />
            <span>{project.isAuto ? '从侧边栏移除' : '删除项目'}</span>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {open && preview.length > 0 && <SidebarRowNest>{renderRows?.(preview)}</SidebarRowNest>}
      {!project.isAuto && (
        <ConfirmDialog
          busyLabel="删除中..."
          confirmLabel="删除项目"
          description={
            <div className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">删除后项目将无法恢复。</p>
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={deleteSessions}
                  id="delete-sessions"
                  onCheckedChange={(c) => setDeleteSessions(Boolean(c))}
                />
                <label
                  className="text-sm cursor-pointer leading-tight"
                  htmlFor="delete-sessions"
                >
                  同时删除项目下的所有对话
                </label>
              </div>
              <div className="flex items-start gap-2">
                <Checkbox
                  checked={deleteFolder}
                  id="delete-folder"
                  onCheckedChange={(c) => setDeleteFolder(Boolean(c))}
                />
                <label
                  className="text-sm cursor-pointer leading-tight"
                  htmlFor="delete-folder"
                >
                  同时删除项目文件夹（不可逆）
                </label>
              </div>
            </div>
          }
          destructive
          onClose={() => setDeleteDialogOpen(false)}
          onConfirm={confirmDelete}
          open={deleteDialogOpen}
          title={`删除项目「${project.label}」`}
        />
      )}
    </div>
  )
}
