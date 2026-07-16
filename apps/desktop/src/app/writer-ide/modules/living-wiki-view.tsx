import { useMemo, useState } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

interface WikiPage {
  id: string
  type: string
  title: string
  summary?: string
  evidence?: string
  updated_at?: string
  rel?: string
  history?: Array<{ at: string; summary: string; evidence?: string }>
  source?: Record<string, unknown>
}

interface LivingWikiData {
  version?: number
  project_id?: string
  pages?: WikiPage[]
}

type WikiTab = 'all' | 'character' | 'location' | 'foreshadow' | 'world' | 'timeline' | 'raw'

const TYPE_ICONS: Record<string, string> = {
  character: 'person',
  location: 'location',
  foreshadow: 'lightbulb',
  world: 'globe',
  timeline: 'history',
  page: 'file'
}

const TYPE_LABELS: Record<string, string> = {
  character: '人物',
  location: '地点',
  foreshadow: '伏笔',
  world: '世界观',
  timeline: '时间线',
  page: '页面'
}

export function LivingWikiView({ data }: { data: unknown }) {
  const wiki = (data as { wiki?: LivingWikiData })?.wiki || (data as LivingWikiData)
  const pages = wiki?.pages || []
  const [activeTab, setActiveTab] = useState<WikiTab>('all')
  const [selectedPage, setSelectedPage] = useState<string | null>(null)

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    pages.forEach(p => {
      counts[p.type] = (counts[p.type] || 0) + 1
    })
    return counts
  }, [pages])

  const filteredPages = useMemo(() => {
    if (activeTab === 'all') return pages
    return pages.filter(p => p.type === activeTab)
  }, [pages, activeTab])

  const tabs: Array<{ id: WikiTab; label: string; icon: string; count?: number }> = [
    { id: 'all', label: '全部', icon: 'library', count: pages.length },
    { id: 'character', label: '人物', icon: 'person', count: typeCounts['character'] },
    { id: 'location', label: '地点', icon: 'location', count: typeCounts['location'] },
    { id: 'foreshadow', label: '伏笔', icon: 'lightbulb', count: typeCounts['foreshadow'] },
    { id: 'world', label: '世界观', icon: 'globe', count: typeCounts['world'] },
    { id: 'timeline', label: '时间线', icon: 'history', count: typeCounts['timeline'] },
    { id: 'raw', label: '原始', icon: 'json' }
  ]

  const selectedPageData = pages.find(p => p.id === selectedPage)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Codicon name="library" size="1rem" />
        <h3 className="text-sm font-medium">活跃维基</h3>
        <span className="ml-auto text-xs text-(--ui-text-quaternary)">
          {pages.length} 个页面
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {tabs.map(tab => (
          <button
            className={cn(
              'flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors',
              activeTab === tab.id
                ? 'bg-(--ui-control-active-background) text-foreground'
                : 'text-(--ui-text-secondary) hover:bg-(--ui-control-hover-background) hover:text-foreground'
            )}
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSelectedPage(null) }}
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

      {activeTab === 'raw' ? (
        <div className="max-h-[350px] overflow-auto">
          <RawJsonView data={data} />
        </div>
      ) : (
        <div className="flex max-h-[350px] gap-2 overflow-hidden">
          <div className="w-1/2 min-w-0 overflow-auto border-r border-(--ui-stroke-secondary) pr-2">
            {filteredPages.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-xs text-(--ui-text-quaternary)">
                暂无页面
              </div>
            ) : (
              <div className="space-y-1">
                {filteredPages.map(page => (
                  <button
                    className={cn(
                      'flex w-full items-start gap-2 rounded p-2 text-left transition-colors',
                      selectedPage === page.id
                        ? 'bg-(--ui-control-active-background)'
                        : 'hover:bg-(--ui-control-hover-background)'
                    )}
                    key={page.id}
                    onClick={() => setSelectedPage(page.id)}
                    type="button"
                  >
                    <Codicon
                      className="mt-0.5 shrink-0 text-(--ui-text-quaternary)"
                      name={TYPE_ICONS[page.type] || 'file'}
                      size="0.75rem"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium text-(--ui-text-primary)">
                        {page.title}
                      </div>
                      {page.summary && (
                        <div className="mt-0.5 truncate text-[11px] text-(--ui-text-secondary)">
                          {page.summary}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="w-1/2 min-w-0 overflow-auto pl-2">
            {selectedPageData ? (
              <WikiPageDetail page={selectedPageData} />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-(--ui-text-quaternary)">
                选择一个页面查看详情
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function WikiPageDetail({ page }: { page: WikiPage }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'rounded px-1.5 py-0.5 text-[10px]',
            page.type === 'foreshadow' && 'bg-amber-500/20 text-amber-400',
            page.type === 'character' && 'bg-blue-500/20 text-blue-400',
            page.type === 'location' && 'bg-green-500/20 text-green-400',
            page.type === 'world' && 'bg-purple-500/20 text-purple-400',
            (!['foreshadow', 'character', 'location', 'world'].includes(page.type)) && 'bg-(--ui-surface-tertiary) text-(--ui-text-secondary)'
          )}>
            {TYPE_LABELS[page.type] || page.type}
          </span>
        </div>
        <h4 className="mt-1 text-sm font-medium text-(--ui-text-primary)">{page.title}</h4>
      </div>

      {page.summary && (
        <div>
          <div className="mb-1 text-[10px] font-medium text-(--ui-text-secondary)">摘要</div>
          <p className="text-xs text-(--ui-text-secondary)">{page.summary}</p>
        </div>
      )}

      {page.evidence && (
        <div>
          <div className="mb-1 text-[10px] font-medium text-(--ui-text-secondary)">出处</div>
          <code className="text-[11px] text-(--ui-text-quaternary)">{page.evidence}</code>
        </div>
      )}

      {page.history && page.history.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-medium text-(--ui-text-secondary)">
            更新历史 ({page.history.length})
          </div>
          <div className="space-y-1">
            {page.history.slice(0, 5).map((h, idx) => (
              <div
                className="rounded bg-(--ui-surface-tertiary) p-2"
                key={idx}
              >
                <div className="text-[10px] text-(--ui-text-quaternary)">
                  {new Date(h.at).toLocaleString()}
                </div>
                {h.summary && (
                  <div className="mt-0.5 text-xs text-(--ui-text-secondary)">{h.summary}</div>
                )}
                {h.evidence && (
                  <code className="mt-0.5 block text-[10px] text-(--ui-text-quaternary)">
                    {h.evidence}
                  </code>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
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
