import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
  description?: string
  icon?: string
}

interface SearchableSelectProps {
  value: string
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
  searchable?: boolean
  disabled?: boolean
  className?: string
  emptyHint?: string
}

const inputBaseClass =
  'w-full rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm text-slate-800 outline-none transition-all dark:border-white/10 dark:bg-white/5 dark:text-slate-200'

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = '请选择...',
  searchable = false,
  disabled = false,
  className,
  emptyHint = '无匹配项'
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(() => options.find(o => o.value === value), [options, value])

  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return options
    const q = query.toLowerCase()
    return options.filter(o =>
      o.label.toLowerCase().includes(q) ||
      (o.description || '').toLowerCase().includes(q)
    )
  }, [options, query, searchable])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => inputRef.current?.focus(), 10)
    }
    if (!open) {
      setQuery('')
      setHighlight(0)
    }
  }, [open, searchable])

  useEffect(() => {
    setHighlight(0)
  }, [query])

  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${highlight}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  const rect = rootRef.current?.getBoundingClientRect()
  const dropW = rect?.width || 240
  const dropTop = rect ? rect.bottom + 4 : 0
  const dropLeft = rect?.left || 0

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight(h => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const opt = filtered[highlight]
      if (opt) {
        onChange(opt.value)
        setOpen(false)
      }
    }
  }

  return (
    <div ref={rootRef} className={cn('relative', className)} onKeyDown={handleKeyDown}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={cn(
          inputBaseClass,
          'flex items-center justify-between gap-2 pr-9 text-left',
          open ? 'border-violet-500/50 bg-white ring-2 ring-violet-500/20 dark:bg-white/10 dark:ring-violet-500/30' : 'hover:border-slate-300 dark:hover:border-white/20',
          disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        <span className={cn('truncate', !selected && 'text-slate-400 dark:text-slate-500')}>
          {selected ? selected.label : placeholder}
        </span>
        <Codicon
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
        />
      </button>

      {open && rect && createPortal(
        <div
          ref={listRef}
          className="fixed z-[1000] max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-2xl dark:border-white/10 dark:bg-slate-900"
          style={{ width: dropW, top: dropTop, left: dropLeft }}
        >
          {searchable && (
            <div className="sticky top-0 border-b border-slate-100 bg-white px-2 py-1.5 dark:border-white/5 dark:bg-slate-900">
              <div className="relative">
                <Codicon name="search" size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="搜索..."
                  className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-7 pr-2 text-xs text-slate-700 outline-none focus:border-violet-400 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-white/10"
                />
              </div>
            </div>
          )}
          {filtered.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-slate-400 dark:text-slate-500">{emptyHint}</div>
          ) : filtered.map((opt, i) => {
            const isSelected = opt.value === value
            const isHi = i === highlight
            return (
              <button
                key={opt.value}
                type="button"
                data-idx={i}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => { onChange(opt.value); setOpen(false) }}
                className={cn(
                  'flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors',
                  isHi ? 'bg-violet-500/10 text-violet-700 dark:text-violet-200' : 'text-slate-700 dark:text-slate-200',
                  isSelected && 'font-medium'
                )}
              >
                {opt.icon && <Codicon name={opt.icon as any} size={14} className="mt-0.5 shrink-0 text-slate-400" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Codicon name="check" size={12} className="text-violet-500 shrink-0" />}
                  </div>
                  {opt.description && (
                    <div className={cn('truncate text-[11px]', isHi ? 'text-violet-500/80' : 'text-slate-400 dark:text-slate-500')}>
                      {opt.description}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}

interface MultiSearchableSelectProps {
  values: string[]
  onChange: (vs: string[]) => void
  options: SelectOption[]
  placeholder?: string
  chipClassName?: string
  className?: string
  emptyHint?: string
}

export function MultiSearchableSelect({
  values,
  onChange,
  options,
  placeholder = '点击添加...',
  className,
  emptyHint = '暂无可选项'
}: MultiSearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlight, setHighlight] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const valueSet = useMemo(() => new Set(values), [values])
  const selected = useMemo(() => values.map(v => options.find(o => o.value === v)).filter(Boolean) as SelectOption[], [values, options])

  const available = useMemo(() => {
    const q = query.trim().toLowerCase()
    return options.filter(o => {
      if (valueSet.has(o.value)) return false
      if (!q) return true
      return o.label.toLowerCase().includes(q) || (o.description || '').toLowerCase().includes(q)
    })
  }, [options, valueSet, query])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', handler)
    window.addEventListener('keydown', esc)
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('keydown', esc)
    }
  }, [open])

  useEffect(() => { setHighlight(0) }, [query, open])
  useEffect(() => { if (!open) setQuery('') }, [open])
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${highlight}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  const addValue = (v: string) => {
    if (valueSet.has(v)) return
    onChange([...values, v])
  }
  const removeValue = (v: string) => {
    onChange(values.filter(x => x !== v))
  }

  const rect = rootRef.current?.getBoundingClientRect()

  return (
    <div ref={rootRef} className={cn('space-y-2', className)}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className={cn(
            inputBaseClass,
            'flex items-center justify-between gap-2 pr-9 text-left text-sm',
            open ? 'border-violet-500/50 bg-white ring-2 ring-violet-500/20 dark:bg-white/10 dark:ring-violet-500/30' : 'hover:border-slate-300 dark:hover:border-white/20'
          )}
        >
          <span className="truncate text-slate-500 dark:text-slate-400">
            {values.length === 0 ? placeholder : `已选 ${values.length} 项，点击继续添加`}
          </span>
          <Codicon
            name={open ? 'chevron-up' : 'chevron-down'}
            size={14}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
        </button>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(opt => (
            <span key={opt.value} className="inline-flex items-center gap-1 rounded-md bg-violet-500/15 px-2 py-1 text-xs text-violet-700 dark:text-violet-300">
              {opt.label}
              <button
                type="button"
                className="rounded p-0.5 hover:bg-violet-500/20"
                onClick={() => removeValue(opt.value)}
              >
                <Codicon name="close" size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {open && rect && createPortal(
        <div
          ref={listRef}
          className="fixed z-[1000] max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-2xl dark:border-white/10 dark:bg-slate-900"
          style={{ width: rect.width, top: (rect.bottom + 4), left: rect.left }}
        >
          <div className="sticky top-0 border-b border-slate-100 bg-white px-2 py-1.5 dark:border-white/5 dark:bg-slate-900">
            <div className="relative">
              <Codicon name="search" size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="搜索..."
                className="w-full rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-7 pr-2 text-xs text-slate-700 outline-none focus:border-violet-400 focus:bg-white dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:focus:bg-white/10"
              />
            </div>
          </div>
          {available.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-slate-400 dark:text-slate-500">{emptyHint}</div>
          ) : available.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              data-idx={i}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => { addValue(opt.value) }}
              className={cn(
                'flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition-colors',
                i === highlight ? 'bg-violet-500/10 text-violet-700 dark:text-violet-200' : 'text-slate-700 dark:text-slate-200'
              )}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate">{opt.label}</div>
                {opt.description && (
                  <div className={cn('truncate text-[11px]', i === highlight ? 'text-violet-500/80' : 'text-slate-400 dark:text-slate-500')}>
                    {opt.description}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}
