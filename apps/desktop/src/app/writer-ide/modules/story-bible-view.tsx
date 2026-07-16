import { useState } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

interface StoryBibleData {
  version?: number
  project_id?: string
  title?: string
  chapters?: Array<{
    id: string
    title: string
    file?: string
    line?: number
    summary?: string
    chars?: number
    evidence?: string
  }>
  characters?: Array<{
    name: string
    count?: number
    evidence?: string
    file?: string
    line?: number
    note?: string
    snippets?: Array<{ file: string; line: number; text: string }>
  }>
  locations?: Array<{
    name: string
    count?: number
    evidence?: string
    file?: string
    line?: number
    note?: string
  }>
  foreshadows?: Array<{
    id?: string
    description?: string
    status?: string
    evidence?: string
    chapter?: string
  }>
}

type BibleTab = 'chapters' | 'characters' | 'locations' | 'foreshadows' | 'raw'

export function StoryBibleView({ data }: { data: unknown }) {
  const bible = (data as { story_bible?: StoryBibleData })?.story_bible || (data as StoryBibleData)
  const [activeTab, setActiveTab] = useState<BibleTab>('characters')

  const tabs: Array<{ id: BibleTab; label: string; icon: string; count?: number }> = [
    { id: 'chapters', label: '章节', icon: 'book', count: bible?.chapters?.length },
    { id: 'characters', label: '人物', icon: 'person', count: bible?.characters?.length },
    { id: 'locations', label: '地点', icon: 'location', count: bible?.locations?.length },
    { id: 'foreshadows', label: '伏笔', icon: 'lightbulb', count: bible?.foreshadows?.length },
    { id: 'raw', label: '原始数据', icon: 'json' }
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Codicon name="book" size="1rem" />
        <h3 className="text-sm font-medium">故事圣经</h3>
        {bible?.title && (
          <span className="ml-auto text-xs text-(--ui-text-quaternary)">{bible.title}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-1 border-b border-(--ui-stroke-secondary) pb-2">
        {tabs.map(tab => (
          <button
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
              activeTab === tab.id
                ? 'bg-(--ui-control-active-background) text-foreground'
                : 'text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
            )}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            <Codicon name={tab.icon} size="0.75rem" />
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className="rounded bg-(--ui-surface-tertiary) px-1 text-[10px] text-(--ui-text-quaternary)">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="max-h-[400px] overflow-auto">
        {activeTab === 'chapters' && <ChapterList chapters={bible?.chapters || []} />}
        {activeTab === 'characters' && <CharacterList characters={bible?.characters || []} />}
        {activeTab === 'locations' && <LocationList locations={bible?.locations || []} />}
        {activeTab === 'foreshadows' && <ForeshadowList foreshadows={bible?.foreshadows || []} />}
        {activeTab === 'raw' && <RawJsonView data={data} />}
      </div>
    </div>
  )
}

function ChapterList({ chapters }: { chapters: NonNullable<StoryBibleData['chapters']> }) {
  if (chapters.length === 0) {
    return <EmptyState text="暂无章节" />
  }

  return (
    <div className="space-y-1">
      {chapters.map(chapter => (
        <div
          className="rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-tertiary) p-2"
          key={chapter.id}
        >
          <div className="flex items-start gap-2">
            <Codicon className="mt-0.5 text-(--ui-text-quaternary)" name="file" size="0.75rem" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-(--ui-text-primary)">
                {chapter.title}
              </div>
              {chapter.summary && (
                <p className="mt-1 line-clamp-2 text-[11px] text-(--ui-text-secondary)">
                  {chapter.summary}
                </p>
              )}
              <div className="mt-1 flex items-center gap-2 text-[10px] text-(--ui-text-quaternary)">
                {chapter.chars !== undefined && <span>{chapter.chars} 字</span>}
                {chapter.file && <span className="truncate">{chapter.file}</span>}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function CharacterList({ characters }: { characters: NonNullable<StoryBibleData['characters']> }) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (characters.length === 0) {
    return <EmptyState text="暂无人设" />
  }

  return (
    <div className="space-y-1">
      {characters.map(char => (
        <div
          className="rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-tertiary)"
          key={char.name}
        >
          <button
            className="flex w-full items-start gap-2 p-2 text-left"
            onClick={() => setExpanded(expanded === char.name ? null : char.name)}
            type="button"
          >
            <Codicon className="mt-0.5 text-(--ui-color-accent)" name="person" size="0.75rem" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-xs font-medium text-(--ui-text-primary)">
                  {char.name}
                </span>
                {char.count !== undefined && (
                  <span className="shrink-0 rounded bg-(--ui-surface-secondary) px-1 text-[10px] text-(--ui-text-quaternary)">
                    {char.count} 次
                  </span>
                )}
              </div>
              {char.note && (
                <p className="mt-0.5 truncate text-[11px] text-(--ui-text-secondary)">{char.note}</p>
              )}
            </div>
            <Codicon
              className={cn(
                'mt-0.5 shrink-0 text-(--ui-text-quaternary) transition-transform',
                expanded === char.name && 'rotate-90'
              )}
              name="chevron-right"
              size="0.75rem"
            />
          </button>

          {expanded === char.name && char.snippets && char.snippets.length > 0 && (
            <div className="border-t border-(--ui-stroke-secondary) p-2">
              <div className="mb-1 text-[10px] font-medium text-(--ui-text-secondary)">原文片段</div>
              <div className="space-y-1">
                {char.snippets.map((snippet, idx) => (
                  <div
                    className="rounded bg-(--ui-surface-secondary) p-2 text-[11px]"
                    key={idx}
                  >
                    <div className="mb-1 text-[10px] text-(--ui-text-quaternary">
                      {snippet.file}:{snippet.line}
                    </div>
                    <p className="line-clamp-3 text-(--ui-text-secondary)">{snippet.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function LocationList({ locations }: { locations: NonNullable<StoryBibleData['locations']> }) {
  if (locations.length === 0) {
    return <EmptyState text="暂无地点" />
  }

  return (
    <div className="space-y-1">
      {locations.map(loc => (
        <div
          className="flex items-start gap-2 rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-tertiary) p-2"
          key={loc.name}
        >
          <Codicon className="mt-0.5 text-(--ui-text-quaternary)" name="location" size="0.75rem" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs font-medium text-(--ui-text-primary)">
                {loc.name}
              </span>
              {loc.count !== undefined && (
                <span className="shrink-0 rounded bg-(--ui-surface-secondary) px-1 text-[10px] text-(--ui-text-quaternary)">
                  {loc.count} 次
                </span>
              )}
            </div>
            {loc.note && (
              <p className="mt-0.5 text-[11px] text-(--ui-text-secondary)">{loc.note}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function ForeshadowList({ foreshadows }: { foreshadows: NonNullable<StoryBibleData['foreshadows']> }) {
  if (foreshadows.length === 0) {
    return <EmptyState text="暂无伏笔" />
  }

  return (
    <div className="space-y-1">
      {foreshadows.map((fs, idx) => (
        <div
          className="rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-tertiary) p-2"
          key={fs.id || idx}
        >
          <div className="flex items-start gap-2">
            <Codicon className="mt-0.5 text-amber-500" name="lightbulb" size="0.75rem" />
            <div className="min-w-0 flex-1">
              {fs.description && (
                <p className="text-xs text-(--ui-text-primary)">{fs.description}</p>
              )}
              <div className="mt-1 flex items-center gap-2 text-[10px]">
                {fs.status && (
                  <span className={cn(
                    'rounded px-1.5 py-0.5',
                    fs.status === 'resolved' || fs.status === '回收'
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-amber-500/20 text-amber-400'
                  )}>
                    {fs.status}
                  </span>
                )}
                {fs.chapter && (
                  <span className="text-(--ui-text-quaternary)">{fs.chapter}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center py-8 text-xs text-(--ui-text-quaternary)">
      {text}
    </div>
  )
}

function RawJsonView({ data }: { data: unknown }) {
  return (
    <pre className="rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-tertiary) p-3 font-mono text-xs leading-relaxed">
      <code className="text-(--ui-text-secondary)">
        {JSON.stringify(data, null, 2)}
      </code>
    </pre>
  )
}
