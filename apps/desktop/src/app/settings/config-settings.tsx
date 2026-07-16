import type { ChangeEvent, ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  getElevenLabsVoices,
  getHermesConfigDefaults,
  getHermesConfigRecord,
  getHermesConfigSchema,
  saveHermesConfig
} from '@/hermes'
import { useI18n } from '@/i18n'
import { FolderOpen } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import type { ConfigFieldSchema, HermesConfigRecord } from '@/types/hermes'

import { CONTROL_TEXT, EMPTY_SELECT_VALUE, FIELD_DESCRIPTIONS, FIELD_LABELS, SECTIONS } from './constants'
import { fieldCopyForSchemaKey } from './field-copy'
import { enumOptionsFor, getNested, prettyName, setNested } from './helpers'
import { MemoryConnect } from './memory/connect'
import { ModelSettings } from './model-settings'
import { DesktopSettings } from './desktop-settings'
import { EmptyState, ListRow, LoadingState, SettingsContent } from './primitives'
import { ProviderConfigPanel } from './provider-config-panel'

// On the Voice page, only surface the sub-fields of the *selected* TTS/STT
// provider — otherwise every provider's options render at once (the "totally
// crazy" wall of ~30 fields). Top-level keys (tts.provider, stt.enabled,
// voice.*) always show; STT provider fields hide entirely when STT is off.
export function voiceFieldVisible(key: string, config: HermesConfigRecord): boolean {
  const match = /^(tts|stt)\.([^.]+)\./.exec(key)

  if (!match) {
    return true
  }

  const [, domain, provider] = match

  if (domain === 'stt' && !getNested(config, 'stt.enabled')) {
    return false
  }

  return provider === String(getNested(config, `${domain}.provider`) ?? '')
}

function ConfigField({
  schemaKey,
  schema,
  value,
  enumOptions,
  optionLabels,
  onChange,
  descriptionExtra,
  actionExtra
}: {
  schemaKey: string
  schema: ConfigFieldSchema
  value: unknown
  enumOptions?: string[]
  optionLabels?: Record<string, string>
  onChange: (value: unknown) => void
  descriptionExtra?: ReactNode
  actionExtra?: ReactNode
}) {
  const { t } = useI18n()
  const c = t.settings.config

  const label =
    fieldCopyForSchemaKey(t.settings.fieldLabels, schemaKey) ??
    fieldCopyForSchemaKey(FIELD_LABELS, schemaKey) ??
    prettyName(schemaKey.split('.').pop() ?? schemaKey)

  const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '')

  const rawDescription = (
    fieldCopyForSchemaKey(t.settings.fieldDescriptions, schemaKey) ??
    fieldCopyForSchemaKey(FIELD_DESCRIPTIONS, schemaKey) ??
    schema.description ??
    ''
  ).trim()

  const normalizedDesc = normalize(rawDescription)

  const description =
    rawDescription && normalizedDesc !== normalize(label) && normalizedDesc !== normalize(schemaKey)
      ? rawDescription
      : undefined

  const descriptionNode: ReactNode = descriptionExtra ? (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
      {description}
      {descriptionExtra}
    </span>
  ) : (
    description
  )

  const row = (action: ReactNode, wide = false) => (
    <ListRow
      action={actionExtra ? <div className="flex items-center justify-end gap-2">{action}{actionExtra}</div> : action}
      description={descriptionNode}
      title={label}
      wide={wide}
    />
  )

  if (schema.type === 'boolean') {
    return row(
      <div className="flex items-center justify-end">
        <Switch checked={Boolean(value)} onCheckedChange={onChange} />
      </div>
    )
  }

  const selectOptions = enumOptions ?? (schema.type === 'select' ? (schema.options ?? []).map(String) : undefined)

  if (selectOptions) {
    return row(
      <Select
        onValueChange={next => onChange(next === EMPTY_SELECT_VALUE ? '' : next)}
        value={String(value ?? '') || EMPTY_SELECT_VALUE}
      >
        <SelectTrigger className={CONTROL_TEXT}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {selectOptions.map(option => (
            <SelectItem key={option || EMPTY_SELECT_VALUE} value={option || EMPTY_SELECT_VALUE}>
              {option
                ? (optionLabels?.[option] ?? prettyName(option))
                : (optionLabels?.[''] ?? (schemaKey === 'display.personality' ? c.none : c.noneParen))}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (schema.type === 'number') {
    return row(
      <Input
        className={CONTROL_TEXT}
        onChange={e => {
          const raw = e.target.value
          const n = raw === '' ? 0 : Number(raw)

          if (!Number.isNaN(n)) {
            onChange(n)
          }
        }}
        placeholder={c.notSet}
        type="number"
        value={value === undefined || value === null ? '' : String(value)}
      />
    )
  }

  if (schema.type === 'list') {
    return row(
      <Input
        className={CONTROL_TEXT}
        onChange={e =>
          onChange(
            e.target.value
              .split(',')
              .map(s => s.trim())
              .filter(Boolean)
          )
        }
        placeholder={c.commaSeparated}
        value={Array.isArray(value) ? value.join(', ') : String(value ?? '')}
      />
    )
  }

  if (typeof value === 'object' && value !== null) {
    return row(
      <Textarea
        className={cn('min-h-28 resize-y bg-background font-mono', CONTROL_TEXT)}
        onChange={e => {
          try {
            onChange(JSON.parse(e.target.value))
          } catch {
            /* keep last valid */
          }
        }}
        placeholder={c.notSet}
        spellCheck={false}
        value={JSON.stringify(value, null, 2)}
      />,
      true
    )
  }

  const isLong = schema.type === 'text' || String(value ?? '').length > 100

  return row(
    isLong ? (
      <Textarea
        className={cn('min-h-24 resize-y bg-background', CONTROL_TEXT)}
        onChange={e => onChange(e.target.value)}
        placeholder={c.notSet}
        value={String(value ?? '')}
      />
    ) : (
      <Input
        className={CONTROL_TEXT}
        onChange={e => onChange(e.target.value)}
        placeholder={c.notSet}
        value={String(value ?? '')}
      />
    ),
    isLong
  )
}

export function ConfigSettings({
  activeSectionId,
  onConfigSaved,
  onMainModelChanged,
  importInputRef
}: {
  activeSectionId: string
  onConfigSaved?: () => void
  onMainModelChanged?: (provider: string, model: string) => void
  importInputRef: React.RefObject<HTMLInputElement | null>
}) {
  const { t } = useI18n()
  const c = t.settings.config
  const [config, setConfig] = useState<HermesConfigRecord | null>(null)
  const [_defaults, setDefaults] = useState<HermesConfigRecord | null>(null)
  const [schema, setSchema] = useState<Record<string, ConfigFieldSchema> | null>(null)
  const [elevenLabsVoiceOptions, setElevenLabsVoiceOptions] = useState<string[] | null>(null)
  const [elevenLabsVoiceLabels, setElevenLabsVoiceLabels] = useState<Record<string, string>>({})
  const saveVersionRef = useRef(0)
  const [saveVersion, setSaveVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    Promise.all([getHermesConfigRecord(), getHermesConfigDefaults(), getHermesConfigSchema()])
      .then(([c, d, s]) => {
        if (cancelled) {
          return
        }

        setConfig(c)
        setDefaults(d)
        setSchema(s.fields)
      })
      .catch(err => notifyError(err, c.failedLoad))

    return () => void (cancelled = true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount; copy is stable
  }, [])

  useEffect(() => {
    let cancelled = false

    getElevenLabsVoices()
      .then(result => {
        if (cancelled || !result.available) {
          return
        }

        setElevenLabsVoiceOptions(result.voices.map(voice => voice.voice_id))
        setElevenLabsVoiceLabels(Object.fromEntries(result.voices.map(voice => [voice.voice_id, voice.label])))
      })
      .catch(() => {
        if (!cancelled) {
          setElevenLabsVoiceOptions(null)
          setElevenLabsVoiceLabels({})
        }
      })

    return () => void (cancelled = true)
  }, [])

  useEffect(() => {
    if (!config || saveVersion === 0) {
      return
    }

    const v = saveVersion

    const t = window.setTimeout(() => {
      void (async () => {
        try {
          await saveHermesConfig(config)

          if (saveVersionRef.current === v) {
            onConfigSaved?.()
          }
        } catch (err) {
          if (saveVersionRef.current === v) {
            notifyError(err, c.autosaveFailed)
          }
        }
      })()
    }, 550)

    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- copy is stable; avoid re-scheduling autosave on locale change
  }, [config, onConfigSaved, saveVersion])

  const updateConfig = (next: HermesConfigRecord) => {
    saveVersionRef.current += 1
    setConfig(next)
    setSaveVersion(saveVersionRef.current)
  }

  const sectionFields = useMemo(() => {
    if (!schema) {
      return new Map<string, [string, ConfigFieldSchema][]>()
    }

    return new Map(
      SECTIONS.map(s => [s.id, s.keys.flatMap(k => (schema[k] ? [[k, schema[k]] as [string, ConfigFieldSchema]] : []))])
    )
  }, [schema])

  const fields = sectionFields.get(activeSectionId) ?? []

  // Deep-link target from the command palette (?field=<key>): scroll the row
  // into view and flash it, then drop the param so it doesn't re-fire.
  const [searchParams, setSearchParams] = useSearchParams()
  const targetField = searchParams.get('field')

  useEffect(() => {
    if (!targetField || !config || !schema) {
      return
    }

    const element = document.getElementById(`setting-field-${targetField}`)

    if (!element) {
      return
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    element.classList.add('setting-field-highlight')

    const timeout = window.setTimeout(() => element.classList.remove('setting-field-highlight'), 1600)

    setSearchParams(
      previous => {
        const next = new URLSearchParams(previous)
        next.delete('field')

        return next
      },
      { replace: true }
    )

    return () => window.clearTimeout(timeout)
  }, [config, schema, setSearchParams, targetField])

  function handleImport(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]

    if (!file) {
      return
    }

    const reader = new FileReader()

    reader.onload = () => {
      try {
        updateConfig(JSON.parse(String(reader.result)))
        notify({ kind: 'success', title: c.imported, message: t.common.saving })
      } catch (err) {
        notifyError(err, c.invalidJson)
      }
    }

    reader.readAsText(file)
    e.target.value = ''
  }

  if (!config || !schema) {
    return <LoadingState label={c.loading} />
  }

  const visibleFields = activeSectionId === 'voice' ? fields.filter(([key]) => voiceFieldVisible(key, config)) : fields
  const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'
  const isChinese = t.settings.nav.about === '关于'
  const timezoneOptions = [...new Set(['', detectedTimezone, 'Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC'])]
  const chineseOptionLabels: Record<string, Record<string, string>> = {
    timezone: {
      '': `跟随系统（当前 ${detectedTimezone}）`,
      'Asia/Shanghai': '中国大陆（北京时间）',
      'Asia/Hong_Kong': '中国香港',
      'Asia/Tokyo': '日本东京',
      'Europe/London': '英国伦敦',
      'America/New_York': '美国纽约',
      'America/Los_Angeles': '美国洛杉矶',
      UTC: 'UTC 协调世界时'
    },
    'approvals.mode': {
      manual: '每次询问（推荐）',
      smart: '低风险自动允许',
      off: '不询问（高风险）'
    },
    'agent.image_input_mode': { auto: '自动判断', native: '原图发送', text: '仅发送提取文本' },
    'code_execution.mode': { project: '仅当前项目', strict: '严格沙箱' },
    'context.engine': { compressor: '自动压缩', default: '默认策略', custom: '自定义策略' },
    'terminal.backend': { local: '本机', docker: 'Docker', singularity: 'Singularity', modal: 'Modal 云端', daytona: 'Daytona', ssh: 'SSH 远程' }
  }
  const sectionGuidance: Record<string, string> = {
    model: '通常只需要在上方选择主模型。上下文窗口保持 0 即可自动匹配模型；只有模型平台报告错误时才手动填写。',
    workspace: '工作目录决定独立对话和终端默认从哪里开始，不会搬动已有项目。时区建议跟随系统。',
    safety: '推荐保留“每次询问”、隐去密钥和文件检查点。只有明确了解风险时才降低审批或开放内网访问。',
    chat: '这里控制对话显示、图片发送和代码执行范围。拿不准时保留“自动判断”和“仅当前项目”。',
    advanced: '高级配置会影响运行时、压缩、记忆、语音和子智能体。不了解某项含义时请保持默认值。'
  }
  const englishSectionGuidance: Record<string, string> = {
    model: 'Normally you only need to choose the main model above. Keep Context Window at 0 for automatic detection.',
    workspace: 'The working directory is the default for standalone chats and terminals; it does not move existing projects. Following the system timezone is recommended.',
    safety: 'Keep manual approval, secret redaction, and file checkpoints enabled unless you understand the risks.',
    chat: 'Controls conversation display, image handling, and code-execution scope. The automatic and project-only defaults are recommended.',
    advanced: 'Advanced values affect runtime, compression, memory, voice, and child agents. Keep defaults when unsure.'
  }
  const activeGuidance = (isChinese ? sectionGuidance : englishSectionGuidance)[activeSectionId]

  const chooseWorkingDirectory = async () => {
    const settings = window.hermesDesktop?.settings
    if (!settings) return
    try {
      const result = await settings.pickDefaultProjectDir()
      if (!result.canceled && result.dir) updateConfig(setNested(config, 'terminal.cwd', result.dir))
    } catch (error) {
      notifyError(error, isChinese ? '无法选择工作目录' : 'Could not choose the working directory')
    }
  }

  return (
    <SettingsContent>
      {activeGuidance ? (
        <div className="mb-4 rounded-lg border border-(--ui-stroke-tertiary) bg-(--ui-bg-tertiary) px-3 py-2 text-xs leading-5 text-muted-foreground">
          {activeGuidance}
        </div>
      ) : null}
      {activeSectionId === 'workspace' ? <DesktopSettings chinese={isChinese} /> : null}
      {activeSectionId === 'model' && (
        <div className="mb-6">
          <ModelSettings onMainModelChanged={onMainModelChanged} />
        </div>
      )}
      {visibleFields.length === 0 ? (
        <EmptyState description={c.emptyDesc} title={c.emptyTitle} />
      ) : (
        <div className="grid gap-1">
          {visibleFields.map(([key, field]) => (
            <div className="scroll-mt-6 rounded-lg" id={`setting-field-${key}`} key={key}>
              <ConfigField
                actionExtra={key === 'terminal.cwd' ? (
                  <Button onClick={() => void chooseWorkingDirectory()} size="sm" type="button" variant="outline">
                    <FolderOpen className="size-3.5" />{isChinese ? '选择文件夹' : 'Choose folder'}
                  </Button>
                ) : undefined}
                descriptionExtra={
                  key === 'memory.provider' && Boolean(getNested(config, key)) ? (
                    <MemoryConnect provider={String(getNested(config, key))} />
                  ) : undefined
                }
                enumOptions={
                  key === 'timezone'
                    ? timezoneOptions
                    : key === 'tts.elevenlabs.voice_id'
                    ? enumOptionsFor(key, getNested(config, key), config, elevenLabsVoiceOptions ?? undefined)
                    : enumOptionsFor(key, getNested(config, key), config)
                }
                onChange={value => updateConfig(setNested(config, key, value))}
                optionLabels={key === 'tts.elevenlabs.voice_id' ? elevenLabsVoiceLabels : (isChinese ? chineseOptionLabels[key] : undefined)}
                schema={field}
                schemaKey={key}
                value={getNested(config, key)}
              />
              {key === 'memory.provider' && typeof getNested(config, key) === 'string' && getNested(config, key) ? (
                <ProviderConfigPanel provider={String(getNested(config, key))} />
              ) : null}
            </div>
          ))}
        </div>
      )}
      <input
        accept=".json,application/json"
        className="hidden"
        onChange={handleImport}
        ref={importInputRef}
        type="file"
      />
    </SettingsContent>
  )
}
