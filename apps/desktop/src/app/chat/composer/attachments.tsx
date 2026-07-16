import { useStore } from '@nanostores/react'

import { Codicon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { AlertCircle, CheckCircle2, FileText, FolderOpen, ImageIcon, Link, Loader2, ScanText, Terminal, XCircle } from '@/lib/icons'
import { isParseableFile } from '@/lib/ingest-api'
import { normalizeOrLocalPreviewTarget } from '@/lib/local-preview'
import { cn } from '@/lib/utils'
import type { ComposerAttachment } from '@/store/composer'
import { notifyError } from '@/store/notifications'
import { setCurrentSessionPreviewTarget } from '@/store/preview'
import { $currentCwd } from '@/store/session'

export function AttachmentList({
  attachments,
  onRemove,
  onParse
}: {
  attachments: ComposerAttachment[]
  onRemove?: (id: string) => void
  onParse?: (attachment: ComposerAttachment) => void
}) {
  return (
    <div className="flex max-w-full flex-wrap gap-1.5 px-1 pt-1" data-slot="composer-attachments">
      {attachments.filter(Boolean).map(attachment => (
        <AttachmentPill attachment={attachment} key={attachment.id} onRemove={onRemove} onParse={onParse} />
      ))}
    </div>
  )
}

function ParseStatusIndicator({ attachment }: { attachment: ComposerAttachment }) {
  const state = attachment.parseState

  if (state === 'parsing' || state === 'pending') {
    return <Loader2 className="size-3 animate-spin text-primary" />
  }
  if (state === 'parsed') {
    return <CheckCircle2 className="size-3 text-green-500" />
  }
  if (state === 'partial') {
    return <AlertCircle className="size-3 text-amber-500" />
  }
  if (state === 'failed') {
    return <XCircle className="size-3 text-destructive" />
  }
  return null
}

function AttachmentPill({ attachment, onRemove, onParse }: {
  attachment: ComposerAttachment
  onRemove?: (id: string) => void
  onParse?: (attachment: ComposerAttachment) => void
}) {
  const { t } = useI18n()
  const c = t.composer
  const Icon = { folder: FolderOpen, url: Link, image: ImageIcon, file: FileText, terminal: Terminal }[attachment.kind]
  const cwd = useStore($currentCwd)
  const isUploading = attachment.uploadState === 'uploading'
  const hasUploadError = attachment.uploadState === 'error'
  const canPreview = attachment.kind !== 'folder' && attachment.kind !== 'terminal' && !isUploading
  const isParseable = attachment.kind !== 'folder' && attachment.kind !== 'terminal' && attachment.kind !== 'url' &&
    attachment.path && isParseableFile(attachment.path)
  const isParsing = attachment.parseState === 'parsing' || attachment.parseState === 'pending'
  const isParsed = attachment.parseState === 'parsed' || attachment.parseState === 'partial'
  const parseFailed = attachment.parseState === 'failed'
  const detail = attachment.parseMessage || (attachment.detail && attachment.detail !== attachment.label ? attachment.detail : undefined)
  const parseDetailText = attachment.parseDetail || attachment.parseMessage

  async function openPreview() {
    if (!canPreview) {
      return
    }

    const rawTarget =
      attachment.path ||
      attachment.detail ||
      attachment.refText?.replace(/^@(file|image|url):/, '') ||
      attachment.label ||
      ''

    const target = rawTarget.replace(/^`|`$/g, '')

    if (!target) {
      return
    }

    try {
      const preview = await normalizeOrLocalPreviewTarget(target, cwd || undefined)

      if (!preview) {
        throw new Error(c.couldNotPreview(attachment.label))
      }

      const withBytes =
        attachment.kind === 'image' && attachment.previewUrl
          ? { ...preview, dataUrl: attachment.previewUrl, previewKind: 'image' as const }
          : preview

      setCurrentSessionPreviewTarget(withBytes, 'manual', target)
    } catch (error) {
      notifyError(error, c.previewUnavailable)
    }
  }

  function handleParse(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (onParse && !isParsing) {
      onParse(attachment)
    }
  }

  const statusTip = isParsing ? (attachment.parseMessage || 'Parsing...')
    : isParsed ? (parseDetailText || 'Parsed') + (attachment.parseWarnings?.length ? `\n${attachment.parseWarnings.join('; ')}` : '')
    : parseFailed ? (attachment.parseMessage || 'Parse failed')
    : isParseable ? 'Read content'
    : ''

  return (
    <Tip label={[attachment.path || attachment.detail || attachment.label, statusTip].filter(Boolean).join('\n')}>
      <div className="group/attachment relative min-w-0 shrink-0">
        <button
          aria-busy={isUploading || isParsing || undefined}
          aria-label={canPreview ? c.previewLabel(attachment.label) : attachment.label}
          className={cn(
            'flex max-w-56 items-center gap-2 rounded-2xl border bg-background/50 px-2 py-1.5 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] transition-colors disabled:cursor-default',
            hasUploadError || parseFailed
              ? 'border-destructive/45 hover:border-destructive/60'
              : isParsed
                ? 'border-green-500/30 hover:border-green-500/50 hover:bg-accent/45'
                : 'border-border/60 hover:border-primary/35 hover:bg-accent/45'
          )}
          disabled={!canPreview}
          onClick={() => void openPreview()}
          type="button"
        >
          <span className="relative grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-border/55 bg-muted/35 text-muted-foreground">
            {attachment.previewUrl && attachment.kind === 'image' ? (
              <img
                alt={attachment.label}
                className="size-full object-cover"
                draggable={false}
                src={attachment.previewUrl}
              />
            ) : (
              <Icon className="size-3.5" />
            )}
            {isUploading && (
              <span className="absolute inset-0 grid place-items-center bg-background/60 backdrop-blur-[1px]">
                <Loader2 className="size-3.5 animate-spin text-foreground/75" />
              </span>
            )}
            {hasUploadError && (
              <span className="absolute inset-0 grid place-items-center bg-destructive/15">
                <AlertCircle className="size-3.5 text-destructive" />
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1">
              <span className="block truncate text-[0.72rem] font-medium leading-4 text-foreground/90">
                {attachment.label}
              </span>
              {(isParsing || isParsed || parseFailed) && (
                <span className="shrink-0">
                  <ParseStatusIndicator attachment={attachment} />
                </span>
              )}
            </span>
            <span
              className={cn(
                'block truncate text-[0.62rem] leading-3.5',
                hasUploadError || parseFailed ? 'text-destructive/80'
                  : isParsed ? 'text-green-600/80'
                  : 'text-muted-foreground/65'
              )}
            >
              {isParsing && parseDetailText ? parseDetailText : detail}
            </span>
          </span>
          {isParseable && !isParsing && !isParsed && onParse && (
            <Tip label="Read content">
              <button
                aria-label="Parse file content"
                className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition hover:bg-accent hover:text-foreground group-hover/attachment:opacity-100 focus-visible:opacity-100"
                onClick={handleParse}
                type="button"
              >
                <ScanText className="size-3.5" />
              </button>
            </Tip>
          )}
        </button>
        {onRemove && (
          <button
            aria-label={c.removeAttachment(attachment.label)}
            className="absolute -right-1 -top-1 grid size-3.5 place-items-center rounded-full border border-border/70 bg-background text-muted-foreground opacity-0 shadow-xs transition hover:bg-accent hover:text-foreground group-hover/attachment:opacity-100 focus-visible:opacity-100"
            onClick={() => onRemove(attachment.id)}
            type="button"
          >
            <Codicon name="close" size="0.625rem" />
          </button>
        )}
      </div>
    </Tip>
  )
}
