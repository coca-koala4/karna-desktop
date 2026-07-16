import { Loader2, Save, FileDown, RotateCcw, ExternalLink, Undo2, Redo2, Search, Replace, Wand2, Check, MessageSquare, ArrowUpFromLine, Play, Bug, Square, Lightbulb, Edit3, MessageCircle, BookOpen, Eye, Mic, Database, Circle, AlertTriangle, CheckCircle2, CloudUpload } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { FileCapabilityDescriptor, EditorCommand } from '../lib/file-capabilities'
import { getCommandIcon, getCommandShortcut } from '../lib/file-capabilities'

interface EditorToolbarProps {
  capability: FileCapabilityDescriptor
  commands: Map<string, EditorCommand>
  fileState: 'clean' | 'dirty' | 'saving' | 'conflict' | 'error'
  statistics?: {
    words?: number
    chars?: number
    lines?: number
    selection?: { start: number; end: number; text: string }
  }
  cursorPosition?: { line: number; column: number }
}

const ICON_MAP: Record<string, LucideIcon> = {
  save: Save,
  'save-as': FileDown,
  discard: RotateCcw,
  'link-external': ExternalLink,
  undo: Undo2,
  redo: Redo2,
  search: Search,
  replace: Replace,
  wand: Wand2,
  check: Check,
  comment: MessageSquare,
  export: ArrowUpFromLine,
  play: Play,
  bug: Bug,
  'debug-stop': Square,
  lightbulb: Lightbulb,
  edit: Edit3,
  'comment-discussion': MessageCircle,
  book: BookOpen,
  eye: Eye,
  mic: Mic,
  database: Database,
  'symbol-keyword': Circle
}

const COMMAND_GROUPS: { id: string; label: string; prefix: string }[] = [
  { id: 'file', label: '文件', prefix: 'file.' },
  { id: 'edit', label: '编辑', prefix: 'edit.' },
  { id: 'document', label: '文档', prefix: 'document.' },
  { id: 'code', label: '代码', prefix: 'code.' },
  { id: 'ai', label: 'AI', prefix: 'ai.' }
]

function ToolbarButton({ command }: { command: EditorCommand }) {
  const iconName = command.icon || getCommandIcon(command.id)
  const IconComponent = ICON_MAP[iconName] || Circle
  const shortcut = command.shortcut || getCommandShortcut(command.id)

  if (!command.visible) return null

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      disabled={!command.enabled || command.pending}
      onClick={command.execute}
      title={shortcut ? `${command.label} (${shortcut})` : command.label}
      className={cn(
        'group relative',
        command.pending && 'text-(--ui-color-accent)'
      )}
    >
      {command.pending ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <IconComponent size={14} />
      )}
    </Button>
  )
}

function FileStateIndicator({ state }: { state: EditorToolbarProps['fileState'] }) {
  const config = {
    clean: { icon: CheckCircle2, label: '已保存', color: 'text-green-500' },
    dirty: { icon: Circle, label: '未保存', color: 'text-(--ui-text-quaternary)' },
    saving: { icon: CloudUpload, label: '保存中...', color: 'text-(--ui-color-accent)' },
    conflict: { icon: AlertTriangle, label: '冲突', color: 'text-amber-500' },
    error: { icon: AlertTriangle, label: '错误', color: 'text-red-500' }
  }[state]

  const Icon = config.icon

  return (
    <div className={cn('flex items-center gap-1', config.color)} title={config.label}>
      {state === 'saving' ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Icon size={12} className={state === 'clean' ? 'fill-current' : ''} />
      )}
      <span className="text-[11px]">{config.label}</span>
    </div>
  )
}

function StatisticsDisplay({ capability, statistics, cursorPosition }: {
  capability: FileCapabilityDescriptor
  statistics?: EditorToolbarProps['statistics']
  cursorPosition?: EditorToolbarProps['cursorPosition']
}) {
  const isCode = capability.viewer === 'code'
  const isText = capability.viewer === 'text' || capability.viewer === 'markdown'

  const items: string[] = []

  if (statistics?.selection && statistics.selection.text.length > 0) {
    const selLength = statistics.selection.end - statistics.selection.start
    items.push(`选中 ${selLength} 字符`)
  } else if (isCode && cursorPosition) {
    items.push(`Ln ${cursorPosition.line}, Col ${cursorPosition.column}`)
  }

  if (statistics?.words && isText) {
    items.push(`${statistics.words} 词`)
  }
  if (statistics?.chars && isText) {
    items.push(`${statistics.chars} 字符`)
  }
  if (statistics?.lines && isCode) {
    items.push(`${statistics.lines} 行`)
  }

  return (
    <div className="flex items-center gap-3 text-[11px] text-(--ui-text-quaternary)">
      {items.map((item, i) => (
        <span key={i}>{item}</span>
      ))}
    </div>
  )
}

export function EditorToolbar({
  capability,
  commands,
  fileState,
  statistics,
  cursorPosition
}: EditorToolbarProps) {
  const visibleGroups = COMMAND_GROUPS.map(group => {
    const groupCommands = capability.supportedActions
      .filter(action => action.startsWith(group.prefix))
      .map(actionId => commands.get(actionId))
      .filter((cmd): cmd is EditorCommand => cmd !== undefined && cmd.visible)

    return {
      ...group,
      commands: groupCommands
    }
  }).filter(group => group.commands.length > 0)

  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-2">
      <div className="flex items-center gap-0.5">
        {visibleGroups.map((group, groupIndex) => (
          <div key={group.id} className="flex items-center">
            {groupIndex > 0 && (
              <div className="mx-1 h-4 w-px bg-(--ui-stroke-secondary)" />
            )}
            <div className="group relative flex items-center gap-0.5">
              {group.commands.map(command => (
                <ToolbarButton key={command.id} command={command} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <StatisticsDisplay
          capability={capability}
          statistics={statistics}
          cursorPosition={cursorPosition}
        />
        <FileStateIndicator state={fileState} />
      </div>
    </div>
  )
}
