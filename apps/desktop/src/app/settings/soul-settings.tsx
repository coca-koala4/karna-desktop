import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getProfileSoul, resetProfileSoul, updateProfileSoul } from '@/hermes'
import { useI18n } from '@/i18n'
import { Brain, Lock } from '@/lib/icons'
import { notify, notifyError } from '@/store/notifications'
import type { ProfileSoul } from '@/types/hermes'

import { ListRow, LoadingState, SectionHeading, SettingsContent } from './primitives'

const PROFILE = 'default'

export function SoulSettings() {
  const { t } = useI18n()
  const copy = t.settings.soul
  const [remote, setRemote] = useState<ProfileSoul | null>(null)
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [showCore, setShowCore] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  const load = async () => {
    const result = await getProfileSoul(PROFILE)
    setRemote(result)
    setContent(result.content)
  }

  useEffect(() => {
    let cancelled = false
    getProfileSoul(PROFILE)
      .then(result => {
        if (!cancelled) {
          setRemote(result)
          setContent(result.content)
        }
      })
      .catch(error => notifyError(error, copy.loadFailed))
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, [])

  const maxChars = remote?.max_chars ?? 24_000
  const changed = remote ? content !== remote.content : false
  const overLimit = content.length > maxChars
  const previewLines = useMemo(() => [
    '内置安全与权限规则（不可修改）',
    `Karna 个性化人格（当前 ${content.length} 字符）`,
    '当前项目与智能体上下文',
    '知识库与相关文件',
    '对话历史',
    '用户本轮输入'
  ], [content.length])

  async function save() {
    setSaving(true)
    try {
      await updateProfileSoul(PROFILE, content)
      await load()
      notify({ kind: 'success', title: copy.savedTitle, message: copy.savedMessage })
    } catch (error) {
      notifyError(error, copy.saveFailed)
    } finally {
      setSaving(false)
    }
  }

  async function restoreDefault() {
    if (!window.confirm(copy.resetConfirm)) return
    setSaving(true)
    try {
      await resetProfileSoul(PROFILE)
      await load()
      notify({ kind: 'success', title: copy.resetTitle, message: copy.savedMessage })
    } catch (error) {
      notifyError(error, copy.resetFailed)
    } finally {
      setSaving(false)
    }
  }

  if (!remote) return <LoadingState label={copy.loading} />

  return (
    <SettingsContent>
      <SectionHeading icon={Brain} title={copy.title} />
      <p className="mb-4 text-sm leading-6 text-muted-foreground">{copy.intro}</p>

      <div className="rounded-xl border border-border/50 bg-(--ui-bg-secondary) p-4">
        <ListRow
          below={(
            <div className="mt-3">
              <Textarea
                aria-label={copy.editorTitle}
                className="min-h-72 resize-y bg-background font-mono text-xs leading-5"
                onChange={event => setContent(event.target.value)}
                spellCheck={false}
                value={content}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className={overLimit ? 'text-destructive' : undefined}>{copy.charCount(content.length, maxChars)}</span>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => setShowPreview(value => !value)} size="sm" type="button" variant="secondary">{copy.preview}</Button>
                  <Button onClick={() => setShowCore(value => !value)} size="sm" type="button" variant="secondary">{copy.coreSummary}</Button>
                  <Button disabled={saving} onClick={() => void restoreDefault()} size="sm" type="button" variant="secondary">{copy.restoreDefault}</Button>
                  <Button disabled={!changed || saving || overLimit} onClick={() => void save()} size="sm" type="button">{saving ? t.common.saving : t.common.save}</Button>
                </div>
              </div>
            </div>
          )}
          description={copy.editorDesc}
          hint={remote.path}
          title={copy.editorTitle}
          wide
        />
      </div>

      {showPreview && (
        <div className="mt-4 rounded-xl border border-border/50 bg-background p-4">
          <div className="mb-2 text-sm font-medium">{copy.previewTitle}</div>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            {previewLines.map(line => <li key={line}>{line}</li>)}
          </ol>
        </div>
      )}

      {showCore && (
        <div className="mt-4 rounded-xl border border-border/50 bg-background p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Lock className="size-4" />{copy.coreTitle}</div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {(remote.core_policy_summary ?? []).map(line => <li key={line}>{line}</li>)}
          </ul>
        </div>
      )}
    </SettingsContent>
  )
}
