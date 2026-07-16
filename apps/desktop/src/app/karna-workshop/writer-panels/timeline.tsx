import React, { useRef, useState } from 'react'

export interface TimelineEvent {
  id: string
  event?: string
  title?: string
  name?: string
  time?: string
  chapter?: string | number
  order?: string | number
  date?: string
  description?: string
  characters?: string[]
  location?: string
  type?: string
  importance?: 'major' | 'minor' | 'background'
  tags?: string[]
}

interface TimelineProps {
  events: TimelineEvent[]
  characters?: any[]
  onAddEvent?: (event: Partial<TimelineEvent>) => Promise<any>
  onUpdateEvent?: (eventId: string, patch: Partial<TimelineEvent>) => Promise<any>
  onDeleteEvent?: (eventId: string) => Promise<any>
  onRefresh?: () => void
  readOnly?: boolean
}

const eventTypeColors: Record<string, string> = {
  plot: '#ef4444',
  major: '#ef4444',
  conflict: '#f97316',
  revelation: '#8b5cf6',
  meeting: '#3b82f6',
  death: '#6b7280',
  birth: '#10b981',
  battle: '#dc2626',
  journey: '#06b6d4',
  romance: '#ec4899',
  discovery: '#f59e0b',
  mystery: '#6366f1',
  transition: '#14b8a6',
  background: '#64748b',
  minor: '#94a3b8',
  event: '#6366f1',
}

const getEventColor = (e: TimelineEvent) => {
  const type = (e.type || e.importance || 'event').toLowerCase()

  return eventTypeColors[type] || eventTypeColors.event
}

const getEventEmoji = (e: TimelineEvent) => {
  const type = (e.type || e.importance || 'event').toLowerCase()

  if (type.includes('major') || type.includes('plot')) {return '🔥'}

  if (type.includes('conflict') || type.includes('battle')) {return '⚔️'}

  if (type.includes('death')) {return '💀'}

  if (type.includes('birth')) {return '🌱'}

  if (type.includes('romance') || type.includes('meeting')) {return '💞'}

  if (type.includes('discovery') || type.includes('revelation')) {return '💡'}

  if (type.includes('mystery')) {return '🔍'}

  if (type.includes('journey')) {return '🚶'}

  if (type.includes('transition')) {return '🔄'}

  if (type.includes('minor') || type.includes('background')) {return '📌'}

  return '📖'
}

const getEventTitle = (e: TimelineEvent) => e.event || e.title || e.name || '未命名事件'

const getEventTime = (e: TimelineEvent) => {
  if (e.time) {return String(e.time)}

  if (e.chapter != null) {return `第${e.chapter}章`}

  if (e.order != null) {return String(e.order)}

  if (e.date) {return e.date}

  return ''
}

export const Timeline: React.FC<TimelineProps> = ({
  events,
  characters = [],
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onRefresh,
  readOnly = false,
}) => {
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [filterType, setFilterType] = useState<string>('all')
  const [filterChar, setFilterChar] = useState<string>('all')
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)

  const sortedEvents = [...events].sort((a, b) => {
    const ta = String(a.order || a.time || a.chapter || a.date || '')
    const tb = String(b.order || b.time || b.chapter || b.date || '')
    const na = parseInt(ta.replace(/[^0-9]/g, '')) || 0
    const nb = parseInt(tb.replace(/[^0-9]/g, '')) || 0

    if (na !== nb) {return na - nb}

    return ta.localeCompare(tb)
  })

  const filteredEvents = sortedEvents.filter(e => {
    if (filterType !== 'all') {
      const et = (e.type || e.importance || '').toLowerCase()

      if (filterType === 'major' && !['major', 'plot', 'battle', 'death', 'revelation', 'conflict'].some(t => et.includes(t))) {return false}

      if (filterType === 'minor' && !['minor', 'background', 'transition'].some(t => et.includes(t))) {return false}
    }

    if (filterChar !== 'all') {
      const chars = (e.characters || []) as any[]

      if (!chars.includes(filterChar) && !chars.some(c => c === filterChar || (typeof c === 'object' && c?.name === filterChar) || (typeof c === 'string' && c.includes(filterChar)))) {return false}
    }

    return true
  })

  const allTypes = Array.from(new Set(events.map(e => (e.type || e.importance || 'event').toLowerCase())))

  const handleSaveEvent = async (patch: Partial<TimelineEvent>) => {
    if (selectedEvent && onUpdateEvent) {
      await onUpdateEvent(selectedEvent.id, patch)
      setSelectedEvent(null)
      onRefresh?.()
    }
  }

  const handleDeleteEvent = async () => {
    if (selectedEvent && onDeleteEvent) {
      await onDeleteEvent(selectedEvent.id)
      setSelectedEvent(null)
      onRefresh?.()
    }
  }

  const handleAddEvent = async (event: Partial<TimelineEvent>) => {
    if (onAddEvent) {
      await onAddEvent(event)
      setShowAddForm(false)
      onRefresh?.()
    }
  }

  return (
    <div className="relative w-full h-full flex flex-col bg-slate-900/50 rounded-lg border border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50 border-b border-slate-700">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-slate-200">⏱️ 故事时间轴</h3>
          <span className="text-xs text-slate-400">{filteredEvents.length} 个事件</span>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            onChange={e => setFilterType(e.target.value)}
            value={filterType}
          >
            <option value="all">全部类型</option>
            <option value="major">重大事件</option>
            <option value="minor">次要事件</option>
            {allTypes.filter(t => !['major', 'minor', 'event', 'background'].includes(t)).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {characters.length > 0 && (
            <select
              className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
              onChange={e => setFilterChar(e.target.value)}
              value={filterChar}
            >
              <option value="all">全部人物</option>
              {characters.map((c: any) => (
                <option key={c.id || c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-1 bg-slate-700 rounded px-1">
            <button className="px-2 py-1 text-xs text-slate-300 hover:text-white" onClick={() => setZoom(z => Math.max(0.5, z - 0.2))}>−</button>
            <span className="text-xs text-slate-400 w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button className="px-2 py-1 text-xs text-slate-300 hover:text-white" onClick={() => setZoom(z => Math.min(2, z + 0.2))}>+</button>
          </div>
          {!readOnly && (
            <button
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded transition-colors"
              onClick={() => setShowAddForm(true)}
            >
              ➕ 添加事件
            </button>
          )}
        </div>
      </div>

      <div
        className="flex-1 overflow-auto p-6"
        ref={containerRef}
        style={{ fontSize: `${zoom}em` }}
      >
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <div className="text-5xl mb-3">⏱️</div>
            <div className="text-lg font-medium text-slate-400">暂无时间轴事件</div>
            <div className="text-sm mt-1">点击「分析构建」从稿件中提取事件，或手动添加</div>
          </div>
        ) : (
          <div className="relative">
            <div className="absolute left-8 top-0 bottom-0 w-0.5 bg-gradient-to-b from-indigo-500/50 via-purple-500/30 to-slate-600/20" />

            {filteredEvents.map((event, idx) => {
              const color = getEventColor(event)
              const isMajor = (event.importance || '').toLowerCase() === 'major' || (event.type || '').toLowerCase().includes('plot') || (event.type || '').toLowerCase().includes('major')
              const title = getEventTitle(event)
              const time = getEventTime(event)

              return (
                <div
                  className={`relative flex gap-4 mb-4 cursor-pointer group transition-all ${selectedEvent?.id === event.id ? 'scale-[1.01]' : 'hover:scale-[1.005]'}`}
                  key={event.id || idx}
                  onClick={() => setSelectedEvent(event)}
                >
                  <div className="relative flex-shrink-0 w-16 flex flex-col items-center">
                    <div
                      className={`w-5 h-5 rounded-full border-2 z-10 transition-all group-hover:scale-125 ${selectedEvent?.id === event.id ? 'ring-4 ring-white/20' : ''}`}
                      style={{
                        backgroundColor: color,
                        borderColor: selectedEvent?.id === event.id ? '#fff' : color,
                        boxShadow: `0 0 12px ${color}60`,
                        width: isMajor ? 20 : 14,
                        height: isMajor ? 20 : 14,
                        marginTop: isMajor ? 0 : 3,
                      }}
                    />
                    {isMajor && (
                      <div className="absolute w-8 h-8 rounded-full animate-ping opacity-20" style={{ backgroundColor: color }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {time && (
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded">{time}</span>
                        {isMajor && <span className="text-xs text-red-400 font-medium">🔥 关键事件</span>}
                      </div>
                    )}
                    <div
                      className={`rounded-lg border transition-all ${selectedEvent?.id === event.id
                        ? 'bg-slate-700/80 border-slate-500 shadow-lg'
                        : 'bg-slate-800/60 border-slate-700/50 hover:bg-slate-700/60 hover:border-slate-600'
                      }`}
                    >
                      <div className="p-3">
                        <div className="flex items-start gap-2">
                          <span className="text-lg flex-shrink-0">{getEventEmoji(event)}</span>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-slate-200 group-hover:text-white transition-colors">{title}</h4>
                            {event.description && (
                              <p className="text-sm text-slate-400 mt-1 line-clamp-2">{event.description}</p>
                            )}
                            <div className="flex flex-wrap gap-1 mt-2">
                              {event.characters && event.characters.length > 0 && event.characters.slice(0, 5).map((c: any, i: number) => (
                                <span className="inline-flex items-center gap-1 text-xs bg-amber-500/10 text-amber-300/80 px-2 py-0.5 rounded-full border border-amber-500/20" key={i}>
                                  👤 {typeof c === 'string' ? c : c?.name || '?'}
                                </span>
                              ))}
                              {event.location && (
                                <span className="inline-flex items-center gap-1 text-xs bg-emerald-500/10 text-emerald-300/80 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                  📍 {typeof event.location === 'string' ? event.location : (event.location as any)?.name || ''}
                                </span>
                              )}
                              {event.tags && event.tags.map((t, i) => (
                                <span className="text-xs bg-slate-600/50 text-slate-400 px-2 py-0.5 rounded-full" key={i}>
                                  #{t}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedEvent && !readOnly && (
        <EventEditor
          characters={characters}
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onDelete={handleDeleteEvent}
          onSave={handleSaveEvent}
        />
      )}

      {showAddForm && !readOnly && (
        <AddEventForm
          characters={characters}
          onAdd={handleAddEvent}
          onCancel={() => setShowAddForm(false)}
        />
      )}
    </div>
  )
}

const EventEditor: React.FC<{
  event: TimelineEvent
  characters: any[]
  onSave: (patch: Partial<TimelineEvent>) => void
  onDelete: () => void
  onClose: () => void
}> = ({ event, characters, onSave, onDelete, onClose }) => {
  const [form, setForm] = useState({
    event: getEventTitle(event),
    time: getEventTime(event),
    chapter: event.chapter || '',
    type: event.type || event.importance || 'event',
    description: event.description || '',
    location: typeof event.location === 'string' ? event.location : (event.location as any)?.name || '',
    characters: event.characters || [],
    importance: event.importance || 'minor',
  })

  return (
    <div className="absolute top-16 right-4 w-96 bg-slate-800 rounded-lg border border-slate-600 shadow-2xl z-20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-700/50 border-b border-slate-600">
        <h3 className="font-semibold text-sm text-slate-200">📝 编辑事件</h3>
        <button className="text-slate-400 hover:text-white transition-colors" onClick={onClose}>✕</button>
      </div>
      <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
        <div>
          <label className="block text-xs text-slate-400 mb-1">事件名称</label>
          <input
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
            onChange={e => setForm({ ...form, event: e.target.value })}
            value={form.event}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-slate-400 mb-1">章节/时间</label>
            <input
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
              onChange={e => setForm({ ...form, chapter: e.target.value, time: e.target.value })}
              placeholder="例如：第3章"
              value={form.chapter || form.time}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">重要程度</label>
            <select
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
              onChange={e => setForm({ ...form, importance: e.target.value as any })}
              value={form.importance}
            >
              <option value="major">🔥 重大</option>
              <option value="minor">📌 次要</option>
              <option value="background">📎 背景</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">事件类型</label>
          <select
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
            onChange={e => setForm({ ...form, type: e.target.value })}
            value={form.type}
          >
            <option value="plot">🔥 情节推进</option>
            <option value="conflict">⚔️ 冲突</option>
            <option value="revelation">💡 揭秘/发现</option>
            <option value="meeting">💞 相遇/会面</option>
            <option value="battle">⚔️ 战斗</option>
            <option value="death">💀 死亡</option>
            <option value="birth">🌱 诞生/起始</option>
            <option value="journey">🚶 旅程</option>
            <option value="romance">💕 感情</option>
            <option value="mystery">🔍 悬疑</option>
            <option value="discovery">🔎 发现</option>
            <option value="transition">🔄 转折</option>
            <option value="event">📖 一般事件</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">描述</label>
          <textarea
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500 resize-none"
            onChange={e => setForm({ ...form, description: e.target.value })}
            rows={3}
            value={form.description}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">地点</label>
          <input
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-indigo-500"
            onChange={e => setForm({ ...form, location: e.target.value })}
            value={form.location}
          />
        </div>
        {characters.length > 0 && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">相关人物</label>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto bg-slate-900 border border-slate-600 rounded p-2">
              {characters.map((c: any) => {
                const cname = c.name
                const isSelected = form.characters.includes(cname)

                return (
                  <button
                    className={`px-2 py-0.5 text-xs rounded-full transition-colors ${isSelected
                      ? 'bg-amber-500/30 text-amber-200 border border-amber-500/50'
                      : 'bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600'
                    }`}
                    key={c.id || cname}
                    onClick={() => {
                      setForm(f => ({
                        ...f,
                        characters: isSelected
                          ? f.characters.filter(ch => ch !== cname)
                          : [...f.characters, cname],
                      }))
                    }}
                  >
                    {cname}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <div className="flex gap-2 p-3 border-t border-slate-700">
        <button
          className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded transition-colors"
          onClick={() => onSave(form)}
        >
          保存
        </button>
        <button
          className="px-4 py-2 bg-red-600/80 hover:bg-red-500 text-white text-sm font-medium rounded transition-colors"
          onClick={onDelete}
        >
          删除
        </button>
      </div>
    </div>
  )
}

const AddEventForm: React.FC<{
  characters: any[]
  onAdd: (event: Partial<TimelineEvent>) => void
  onCancel: () => void
}> = ({ characters, onAdd, onCancel }) => {
  const [form, setForm] = useState({
    event: '',
    chapter: '',
    type: 'event',
    description: '',
    location: '',
    characters: [] as string[],
    importance: 'minor' as const,
  })

  return (
    <div className="absolute top-16 left-1/2 -translate-x-1/2 w-96 bg-slate-800 rounded-lg border border-emerald-500/50 shadow-2xl z-20 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-emerald-600/20 border-b border-emerald-500/30">
        <h3 className="font-semibold text-sm text-emerald-300">➕ 添加时间轴事件</h3>
        <button className="text-slate-400 hover:text-white transition-colors" onClick={onCancel}>✕</button>
      </div>
      <div className="p-4 space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">事件名称 *</label>
          <input
            autoFocus
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-emerald-500"
            onChange={e => setForm({ ...form, event: e.target.value })}
            placeholder="发生了什么？"
            value={form.event}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-slate-400 mb-1">章节/时间</label>
            <input
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-emerald-500"
              onChange={e => setForm({ ...form, chapter: e.target.value })}
              placeholder="例如：第3章"
              value={form.chapter}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">重要程度</label>
            <select
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-emerald-500"
              onChange={e => setForm({ ...form, importance: e.target.value as any })}
              value={form.importance}
            >
              <option value="minor">📌 次要</option>
              <option value="major">🔥 重大</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">事件类型</label>
          <select
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-emerald-500"
            onChange={e => setForm({ ...form, type: e.target.value })}
            value={form.type}
          >
            <option value="event">📖 一般事件</option>
            <option value="plot">🔥 情节推进</option>
            <option value="conflict">⚔️ 冲突</option>
            <option value="revelation">💡 揭秘/发现</option>
            <option value="meeting">💞 相遇</option>
            <option value="battle">⚔️ 战斗</option>
            <option value="romance">💕 感情</option>
            <option value="journey">🚶 旅程</option>
            <option value="transition">🔄 转折</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-400 mb-1">描述</label>
          <textarea
            className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-sm text-white focus:outline-none focus:border-emerald-500 resize-none"
            onChange={e => setForm({ ...form, description: e.target.value })}
            rows={2}
            value={form.description}
          />
        </div>
        {characters.length > 0 && (
          <div>
            <label className="block text-xs text-slate-400 mb-1">相关人物</label>
            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto bg-slate-900 border border-slate-600 rounded p-2">
              {characters.map((c: any) => {
                const cname = c.name
                const isSelected = form.characters.includes(cname)

                return (
                  <button
                    className={`px-2 py-0.5 text-xs rounded-full transition-colors ${isSelected
                      ? 'bg-amber-500/30 text-amber-200 border border-amber-500/50'
                      : 'bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600'
                    }`}
                    key={c.id || cname}
                    onClick={() => {
                      setForm(f => ({
                        ...f,
                        characters: isSelected
                          ? f.characters.filter(ch => ch !== cname)
                          : [...f.characters, cname],
                      }))
                    }}
                  >
                    {cname}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        <button
          className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm font-medium rounded transition-colors"
          disabled={!form.event.trim()}
          onClick={() => form.event.trim() && onAdd(form)}
        >
          添加事件
        </button>
      </div>
    </div>
  )
}
