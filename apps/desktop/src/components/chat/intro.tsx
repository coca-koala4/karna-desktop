import { type CSSProperties, useState } from 'react'

import introCopyJsonl from './intro-copy.jsonl?raw'

type IntroCopy = {
  headline: string
  body: string
}

type IntroCopyRecord = IntroCopy & {
  personality: string
}

export type IntroProps = {
  personality?: string
  seed?: number
}

const NEUTRAL_PERSONALITIES = new Set(['', 'default', 'none', 'neutral'])

const FALLBACK_COPY: IntroCopy[] = [
  {
    headline: '开始创作',
    body: '从一个灵感、一段大纲，或者一份草稿开始，Karna 陪你走完写作全程。'
  },
  {
    headline: '今天写什么',
    body: '无论是新章节、人物小传还是世界观设定，告诉我你的想法，我们一起开工。'
  },
  {
    headline: '准备就绪',
    body: '作品工坊、Soul 工坊、多智能体画布都已就位，等待你的第一行文字。'
  },
  {
    headline: '从哪里开始',
    body: '可以先导入现有稿件建立设定圣经，也可以直接开写，随时调用各种工具。'
  },
  {
    headline: '欢迎回来',
    body: '你的作品数据都安全保存在本地，上次写到哪了？我们继续。'
  },
  {
    headline: '创作工程台',
    body: '这里不是代写工具，而是你的写作搭档，帮你把创意变成完整作品。'
  },
  {
    headline: '需要帮忙吗',
    body: '卡文了？要润色？还是要检查设定一致性？告诉我你遇到了什么问题。'
  },
  {
    headline: '风格已就位',
    body: '你可以上传自己的作品创建 Soul 参考，让 Karna 提炼你的写作节奏和语气。'
  },
  {
    headline: '本地优先',
    body: '你的原稿永不自动覆盖，所有数据都存储在本地，创作安全有保障。'
  }
]

function normalizeKey(value?: string): string {
  return (value || '').trim().toLowerCase()
}

function titleize(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .join('')
}

function isIntroCopyRecord(value: unknown): value is IntroCopyRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    typeof record.personality === 'string' &&
    typeof record.headline === 'string' &&
    typeof record.body === 'string' &&
    Boolean(record.personality.trim()) &&
    Boolean(record.headline.trim()) &&
    Boolean(record.body.trim())
  )
}

function parseIntroCopy(raw: string): Record<string, IntroCopy[]> {
  const byPersonality: Record<string, IntroCopy[]> = {}

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (!trimmed) {
      continue
    }

    try {
      const parsed: unknown = JSON.parse(trimmed)

      if (!isIntroCopyRecord(parsed)) {
        continue
      }

      const key = normalizeKey(parsed.personality)
      byPersonality[key] ??= []
      byPersonality[key].push({
        headline: parsed.headline.trim(),
        body: parsed.body.trim()
      })
    } catch {
      // Bad generated copy should not break the whole desktop app.
    }
  }

  return byPersonality
}

const INTRO_COPY_BY_PERSONALITY = parseIntroCopy(introCopyJsonl)

function neutralCopy(): IntroCopy[] {
  return INTRO_COPY_BY_PERSONALITY.none || INTRO_COPY_BY_PERSONALITY.default || FALLBACK_COPY
}

function fallbackCopyForPersonality(personalityKey: string): IntroCopy[] {
  if (NEUTRAL_PERSONALITIES.has(personalityKey)) {
    return neutralCopy()
  }

  const label = titleize(personalityKey)

  return [
    {
      headline: `${label}模式已就绪`,
      body: `告诉我你想创作什么，我会按照${label}的风格来协助你。`
    },
    {
      headline: `${label}风格已加载`,
      body: `无论是润色、续写还是大纲，我都会保持${label}的创作调性。`
    },
    {
      headline: `今天写${label}`,
      body: `把你的想法、片段或者卡壳的地方发给我，我们一起用${label}的方式推进。`
    },
    {
      headline: `${label}创作中`,
      body: `我会严格遵循${label}的文体要求和风格特征，帮你打磨文字。`
    },
    {
      headline: `从${label}开始`,
      body: `描述你要写的内容，我会以${label}的视角和语气给你建议和协助。`
    }
  ]
}

function pickCopy(copies: IntroCopy[], seed = 0): IntroCopy {
  return copies[Math.abs(seed) % copies.length] || FALLBACK_COPY[0]
}

const WORDMARK = 'KARNA'

function resolveCopy(personality?: string, seed?: number): IntroCopy {
  const personalityKey = normalizeKey(personality)

  const copies = NEUTRAL_PERSONALITIES.has(personalityKey)
    ? INTRO_COPY_BY_PERSONALITY[personalityKey] || neutralCopy()
    : INTRO_COPY_BY_PERSONALITY[personalityKey] || fallbackCopyForPersonality(personalityKey)

  return pickCopy(copies, seed)
}

export function Intro({ personality, seed }: IntroProps) {
  const [mountSeed] = useState(() => Math.floor(Math.random() * 100000))
  const copy = resolveCopy(personality, mountSeed + (seed ?? 0))

  return (
    <div
      className="pointer-events-none flex w-full min-w-0 flex-col items-center justify-center px-0.5 py-6 text-center text-muted-foreground sm:px-6 lg:px-8"
      data-slot="aui_intro"
    >
      <div className="w-full min-w-0">
        <p
          aria-label={WORDMARK}
          className="fit-text mx-auto mb-1 w-[calc(100%-1rem)] font-bold uppercase leading-[0.9] tracking-[0.08em] text-midground mix-blend-plus-lighter dark:text-foreground/90"
          style={{ '--fit-min': '2.75rem', fontFamily: 'var(--dt-font-wordmark)' } as CSSProperties}
        >
          <span>
            <span>{WORDMARK}</span>
          </span>
          <span aria-hidden="true">{WORDMARK}</span>
        </p>

        <p className="m-0 text-center leading-normal tracking-tight">{copy.body}</p>
      </div>
    </div>
  )
}
