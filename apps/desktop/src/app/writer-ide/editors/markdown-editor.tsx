import type { ComponentProps } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { code } from '@streamdown/code'
import mermaid from 'mermaid'
import { Streamdown } from 'streamdown'

import { Codicon } from '@/components/ui/codicon'
import { createMemoizedMathPlugin } from '@/lib/katex-memo'
import { cn } from '@/lib/utils'

import type { EditorProps } from './editor-registry'

interface HeadingItem {
  level: number
  text: string
  line: number
}

interface MarkdownStats {
  words: number
  chars: number
  lines: number
  headings: number
  chineseChars: number
  englishWords: number
}

interface MarkdownEditorExtraProps {
  onStatistics?: (stats: MarkdownStats) => void
  exportTrigger?: number
  aiDiffMode?: boolean
  onAcceptAiChanges?: () => void
  onRejectAiChanges?: () => void
}

type MarkdownEditorProps = EditorProps & MarkdownEditorExtraProps

let lastMermaidTheme: 'dark' | 'default' | null = null

function ensureMermaidInit(dark: boolean) {
  const theme = dark ? 'dark' : 'default'
  if (theme === lastMermaidTheme) return
  mermaid.initialize({ fontFamily: 'inherit', securityLevel: 'strict', startOnLoad: false, theme })
  lastMermaidTheme = theme
}

function parseHeadings(markdown: string): HeadingItem[] {
  const lines = markdown.split('\n')
  const headings: HeadingItem[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        line: i
      })
    }
  }

  return headings
}

function countStats(text: string, headings: HeadingItem[]): MarkdownStats {
  const lines = text.split('\n').length
  const chineseMatches = text.match(/[\u4e00-\u9fa5]/g)
  const chineseChars = chineseMatches ? chineseMatches.length : 0
  const textWithoutCode = text.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]+`/g, '')
  const englishWords = (textWithoutCode.match(/[a-zA-Z]+(?:['-][a-zA-Z]+)*/g) || []).length
  const chars = text.length

  return {
    words: chineseChars + englishWords,
    chars,
    lines,
    headings: headings.length,
    chineseChars,
    englishWords
  }
}

function MermaidBlock({ code: mermaidCode }: { code: string }) {
  const [svg, setSvg] = useState('')
  const [failed, setFailed] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setFailed(false)

    void (async () => {
      try {
        ensureMermaidInit(false)
        const id = `mmd-editor-${Math.random().toString(36).slice(2)}`
        const result = await mermaid.render(id, mermaidCode)
        if (!cancelled) {
          setSvg(result.svg)
        }
      } catch {
        if (!cancelled) {
          setFailed(true)
          setSvg('')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [mermaidCode])

  if (failed || !svg) {
    return (
      <pre className="mb-4 overflow-x-auto rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) p-3 font-mono text-sm leading-relaxed last:mb-0">
        <code className="text-(--ui-text-secondary)">{mermaidCode}</code>
      </pre>
    )
  }

  return (
    <div className="my-4 flex justify-center overflow-x-auto rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) p-4">
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }} className="[&_svg]:max-w-full" />
    </div>
  )
}

const mathPlugin = createMemoizedMathPlugin({ singleDollarTextMath: true })

const MD_PREVIEW_COMPONENTS = {
  a: ({ className, children, href, ...rest }: ComponentProps<'a'>) => (
    <a
      className={cn('font-medium underline underline-offset-4 decoration-current/20', className)}
      href={href}
      {...rest}
    >
      {children}
    </a>
  ),
  blockquote: ({ className, ...rest }: ComponentProps<'blockquote'>) => (
    <blockquote
      className={cn('my-3 border-l-4 border-(--ui-stroke-secondary) pl-4 italic text-(--ui-text-secondary)', className)}
      {...rest}
    />
  ),
  code: ({ className, children, ...rest }: ComponentProps<'code'>) => {
    const languageMatch = className?.match(/language-(\w+)/)
    const language = languageMatch?.[1]

    if (language === 'mermaid' && typeof children === 'string') {
      return <MermaidBlock code={children} />
    }

    return (
      <code
        className={cn('rounded bg-(--ui-surface-secondary) px-1.5 py-0.5 font-mono text-[0.9em]', className)}
        {...rest}
      >
        {children}
      </code>
    )
  },
  h1: ({ className, ...rest }: ComponentProps<'h1'>) => (
    <h1 className={cn('mb-4 mt-6 text-2xl font-bold tracking-tight first:mt-0', className)} {...rest} />
  ),
  h2: ({ className, ...rest }: ComponentProps<'h2'>) => (
    <h2 className={cn('mb-3 mt-5 text-xl font-semibold tracking-tight first:mt-0', className)} {...rest} />
  ),
  h3: ({ className, ...rest }: ComponentProps<'h3'>) => (
    <h3 className={cn('mb-2 mt-4 text-lg font-semibold first:mt-0', className)} {...rest} />
  ),
  h4: ({ className, ...rest }: ComponentProps<'h4'>) => (
    <h4 className={cn('mb-2 mt-3 text-base font-semibold first:mt-0', className)} {...rest} />
  ),
  hr: ({ className, ...rest }: ComponentProps<'hr'>) => (
    <hr className={cn('my-6 border-(--ui-stroke-secondary)', className)} {...rest} />
  ),
  li: ({ className, ...rest }: ComponentProps<'li'>) => (
    <li className={cn('marker:text-(--ui-text-quaternary)', className)} {...rest} />
  ),
  ol: ({ className, ...rest }: ComponentProps<'ol'>) => (
    <ol className={cn('mb-4 list-decimal pl-6 last:mb-0', className)} {...rest} />
  ),
  p: ({ className, ...rest }: ComponentProps<'p'>) => (
    <p className={cn('mb-3 leading-relaxed last:mb-0', className)} {...rest} />
  ),
  pre: ({ className, children, ...rest }: ComponentProps<'pre'>) => {
    const codeElement = Array.isArray(children) ? children[0] : children
    if (
      codeElement &&
      typeof codeElement === 'object' &&
      'props' in codeElement &&
      codeElement.props?.className?.includes('language-mermaid')
    ) {
      return <>{children}</>
    }
    return (
      <pre
        className={cn(
          'mb-4 overflow-x-auto rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) p-3 font-mono text-sm leading-relaxed last:mb-0',
          className
        )}
        {...rest}
      >
        {children}
      </pre>
    )
  },
  ul: ({ className, ...rest }: ComponentProps<'ul'>) => (
    <ul className={cn('mb-4 list-disc pl-6 last:mb-0', className)} {...rest} />
  ),
  table: ({ className, ...rest }: ComponentProps<'table'>) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-(--ui-stroke-secondary)">
      <table className={cn('w-full border-collapse text-sm', className)} {...rest} />
    </div>
  ),
  th: ({ className, ...rest }: ComponentProps<'th'>) => (
    <th
      className={cn(
        'border-b border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-3 py-2 text-left font-semibold',
        className
      )}
      {...rest}
    />
  ),
  td: ({ className, ...rest }: ComponentProps<'td'>) => (
    <td className={cn('border-b border-(--ui-stroke-secondary) px-3 py-2', className)} {...rest} />
  ),
  input: ({ className, type, checked, disabled, ...rest }: ComponentProps<'input'>) => {
    if (type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          readOnly
          className={cn('mr-1.5 h-4 w-4 accent-(--ui-color-accent)', className)}
          {...rest}
        />
      )
    }
    return <input className={className} type={type} checked={checked} disabled={disabled} {...rest} />
  }
}

type ViewMode = 'edit' | 'split' | 'preview'

interface ToolbarButton {
  icon: string
  title: string
  action: 'heading1' | 'heading2' | 'heading3' | 'bold' | 'italic' | 'strikethrough' | 'orderedList' | 'unorderedList' | 'taskList' | 'quote' | 'codeBlock' | 'table' | 'hr' | 'link' | 'image'
}

const toolbarButtons: ToolbarButton[] = [
  { icon: 'symbol-numeric', title: '标题 1', action: 'heading1' },
  { icon: 'text-size', title: '标题 2', action: 'heading2' },
  { icon: 'list-tree', title: '标题 3', action: 'heading3' },
  { icon: 'bold', title: '粗体 (Ctrl+B)', action: 'bold' },
  { icon: 'italic', title: '斜体 (Ctrl+I)', action: 'italic' },
  { icon: 'strikethrough', title: '删除线', action: 'strikethrough' },
  { icon: 'list-ordered', title: '有序列表', action: 'orderedList' },
  { icon: 'list-unordered', title: '无序列表', action: 'unorderedList' },
  { icon: 'checklist', title: '任务列表', action: 'taskList' },
  { icon: 'quote', title: '引用', action: 'quote' },
  { icon: 'code', title: '代码块', action: 'codeBlock' },
  { icon: 'table', title: '表格', action: 'table' },
  { icon: 'diff-renamed', title: '分隔线', action: 'hr' },
  { icon: 'link', title: '链接', action: 'link' },
  { icon: 'file-media', title: '图片', action: 'image' }
]

export function MarkdownEditor({
  content,
  filePath: _filePath,
  onChange,
  onSave,
  onSelectionChange,
  onStatistics,
  exportTrigger,
  aiDiffMode = false,
  onAcceptAiChanges,
  onRejectAiChanges
}: MarkdownEditorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [showOutline, setShowOutline] = useState(false)
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [findText, setFindText] = useState('')
  const [replaceText, setReplaceText] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [matchCase, setMatchCase] = useState(false)
  const [stats, setStats] = useState<MarkdownStats>({
    words: 0,
    chars: 0,
    lines: 0,
    headings: 0,
    chineseChars: 0,
    englishWords: 0
  })
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)

  const headings = useMemo(() => parseHeadings(content), [content])

  useEffect(() => {
    const newStats = countStats(content, headings)
    setStats(newStats)
    onStatistics?.(newStats)
  }, [content, headings, onStatistics])

  useEffect(() => {
    if (exportTrigger !== undefined && exportTrigger > 0) {
      const previewContent = previewRef.current
      if (previewContent) {
        const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Markdown Export</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 800px; margin: 40px auto; padding: 0 20px; line-height: 1.6; color: #1a1a1a; }
h1, h2, h3, h4 { margin-top: 1.5em; margin-bottom: 0.5em; }
h1 { font-size: 2em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #eee; padding-bottom: 0.3em; }
h3 { font-size: 1.25em; }
code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: 'SF Mono', Consolas, monospace; font-size: 0.9em; }
pre { background: #f5f5f5; padding: 16px; border-radius: 6px; overflow-x: auto; }
pre code { background: none; padding: 0; }
blockquote { border-left: 4px solid #ddd; margin: 0; padding-left: 16px; color: #666; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
th { background: #f5f5f5; }
hr { border: none; border-top: 1px solid #ddd; margin: 2em 0; }
ul, ol { padding-left: 2em; }
a { color: #0366d6; text-decoration: none; }
a:hover { text-decoration: underline; }
img { max-width: 100%; }
</style>
</head>
<body>
${previewContent.querySelector('.mx-auto')?.innerHTML || content}
</body>
</html>`
        const blob = new Blob([htmlContent], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'export.html'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    }
  }, [exportTrigger, content])

  const insertText = useCallback((before: string, after: string = '', placeholder: string = '') => {
    const textarea = textareaRef.current
    if (!textarea || !onChange) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = content.substring(start, end)
    const textToInsert = selectedText || placeholder
    const newContent = content.substring(0, start) + before + textToInsert + after + content.substring(end)

    onChange(newContent)

    requestAnimationFrame(() => {
      textarea.focus()
      const newCursorPos = start + before.length
      if (selectedText) {
        textarea.setSelectionRange(newCursorPos, newCursorPos + selectedText.length)
      } else {
        textarea.setSelectionRange(newCursorPos, newCursorPos + placeholder.length)
      }
    })
  }, [content, onChange])

  const insertBlockPrefix = useCallback((prefix: string, addEmptyLine: boolean = true) => {
    const textarea = textareaRef.current
    if (!textarea || !onChange) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const selectedText = content.substring(start, end)

    let lineStart = content.lastIndexOf('\n', start - 1) + 1
    let prefixToInsert = prefix
    let newContent: string

    if (selectedText) {
      const lines = selectedText.split('\n')
      const prefixedLines = lines.map(line => prefix + line)
      newContent = content.substring(0, lineStart) + prefixedLines.join('\n') + content.substring(end)
    } else {
      const currentLineEnd = content.indexOf('\n', start)
      const currentLine = content.substring(lineStart, currentLineEnd === -1 ? content.length : currentLineEnd)

      if (currentLine.trim()) {
        prefixToInsert = '\n' + prefix
        if (addEmptyLine) prefixToInsert += '\n'
        newContent = content.substring(0, end) + prefixToInsert + content.substring(end)
      } else {
        newContent = content.substring(0, lineStart) + prefix + content.substring(lineStart)
      }
    }

    onChange(newContent)

    requestAnimationFrame(() => {
      textarea.focus()
    })
  }, [content, onChange])

  const handleToolbarAction = useCallback((action: ToolbarButton['action']) => {
    switch (action) {
      case 'heading1':
        insertBlockPrefix('# ')
        break
      case 'heading2':
        insertBlockPrefix('## ')
        break
      case 'heading3':
        insertBlockPrefix('### ')
        break
      case 'bold':
        insertText('**', '**', '粗体文本')
        break
      case 'italic':
        insertText('*', '*', '斜体文本')
        break
      case 'strikethrough':
        insertText('~~', '~~', '删除线文本')
        break
      case 'orderedList':
        insertBlockPrefix('1. ')
        break
      case 'unorderedList':
        insertBlockPrefix('- ')
        break
      case 'taskList':
        insertBlockPrefix('- [ ] ')
        break
      case 'quote':
        insertBlockPrefix('> ')
        break
      case 'codeBlock':
        insertText('\n```\n', '\n```\n', '代码')
        break
      case 'table':
        insertText('\n| 列1 | 列2 | 列3 |\n|-----|-----|-----|\n| 内容 | 内容 | 内容 |\n', '', '')
        break
      case 'hr':
        insertText('\n---\n', '', '')
        break
      case 'link':
        insertText('[', '](https://)', '链接文本')
        break
      case 'image':
        insertText('![', '](https://)', '图片描述')
        break
    }
  }, [insertText, insertBlockPrefix])

  const matches = useMemo(() => {
    if (!findText) return []
    const text = matchCase ? content : content.toLowerCase()
    const search = matchCase ? findText : findText.toLowerCase()
    const results: { start: number; end: number }[] = []
    let index = 0
    while ((index = text.indexOf(search, index)) !== -1) {
      results.push({ start: index, end: index + search.length })
      index += search.length
    }
    return results
  }, [content, findText, matchCase])

  const jumpToMatch = useCallback((index: number) => {
    const textarea = textareaRef.current
    if (!textarea || matches.length === 0) return

    const match = matches[index]
    if (!match) return

    textarea.focus()
    textarea.setSelectionRange(match.start, match.end)

    const lineHeight = 21
    const lines = content.slice(0, match.start).split('\n')
    const lineNum = lines.length - 1
    const visibleLines = Math.floor(textarea.clientHeight / lineHeight)
    textarea.scrollTop = lineNum * lineHeight - (visibleLines / 2) * lineHeight
  }, [matches, content])

  const handleFindNext = useCallback(() => {
    if (matches.length === 0) return
    const nextIndex = (currentMatchIndex + 1) % matches.length
    setCurrentMatchIndex(nextIndex)
    jumpToMatch(nextIndex)
  }, [matches, currentMatchIndex, jumpToMatch])

  const handleFindPrev = useCallback(() => {
    if (matches.length === 0) return
    const prevIndex = (currentMatchIndex - 1 + matches.length) % matches.length
    setCurrentMatchIndex(prevIndex)
    jumpToMatch(prevIndex)
  }, [matches, currentMatchIndex, jumpToMatch])

  const handleReplace = useCallback(() => {
    if (matches.length === 0 || !onChange) return

    const match = matches[currentMatchIndex]
    if (!match) return

    const newContent = content.slice(0, match.start) + replaceText + content.slice(match.end)
    onChange(newContent)
  }, [matches, currentMatchIndex, content, replaceText, onChange])

  const handleReplaceAll = useCallback(() => {
    if (matches.length === 0 || !onChange) return

    let newContent = content
    let offset = 0
    for (const match of matches) {
      const adjustedStart = match.start + offset
      const adjustedEnd = match.end + offset
      newContent = newContent.slice(0, adjustedStart) + replaceText + newContent.slice(adjustedEnd)
      offset += replaceText.length - (match.end - match.start)
    }
    onChange(newContent)
    setCurrentMatchIndex(0)
  }, [matches, content, replaceText, onChange])

  const jumpToLine = useCallback((line: number) => {
    const textarea = textareaRef.current
    if (!textarea) return

    const lines = content.split('\n')
    let charIndex = 0
    for (let i = 0; i < line; i++) {
      charIndex += lines[i].length + 1
    }

    textarea.focus()
    textarea.setSelectionRange(charIndex, charIndex)

    const lineHeight = 21
    const visibleLines = Math.floor(textarea.clientHeight / lineHeight)
    textarea.scrollTop = line * lineHeight - (visibleLines / 2) * lineHeight
  }, [content])

  const handleSelect = useCallback(() => {
    if (!onSelectionChange || !textareaRef.current) return
    const { selectionStart, selectionEnd, value } = textareaRef.current
    if (selectionStart === selectionEnd) {
      onSelectionChange(null)
    } else {
      onSelectionChange({
        text: value.slice(selectionStart, selectionEnd),
        start: selectionStart,
        end: selectionEnd
      })
    }
  }, [onSelectionChange])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault()
          handleToolbarAction('bold')
          break
        case 'i':
          e.preventDefault()
          handleToolbarAction('italic')
          break
        case 's':
          e.preventDefault()
          onSave?.()
          break
        case 'f':
          e.preventDefault()
          setShowFindReplace(true)
          break
      }
    }
  }, [handleToolbarAction, onSave])

  const plugins = useMemo(() => ({ math: mathPlugin, code }), [])

  return (
    <div className="flex h-full flex-col">
      {aiDiffMode && (
        <div className="flex h-9 shrink-0 items-center justify-between border-b border-(--ui-color-accent)/30 bg-(--ui-color-accent)/10 px-4">
          <div className="flex items-center gap-2 text-sm text-(--ui-color-accent)">
            <Codicon name="diff" size="1rem" />
            <span>AI 建议修改</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="flex items-center gap-1 rounded bg-(--ui-color-accent) px-3 py-1 text-xs font-medium text-white hover:opacity-90"
              onClick={onAcceptAiChanges}
              type="button"
            >
              <Codicon name="check" size="0.75rem" />
              接受
            </button>
            <button
              className="flex items-center gap-1 rounded border border-(--ui-stroke-secondary) px-3 py-1 text-xs hover:bg-(--ui-control-hover-background)"
              onClick={onRejectAiChanges}
              type="button"
            >
              <Codicon name="close" size="0.75rem" />
              拒绝
            </button>
          </div>
        </div>
      )}

      <div className="flex h-9 shrink-0 items-center gap-0.5 border-b border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-2 overflow-x-auto">
        {viewMode !== 'preview' && toolbarButtons.map(btn => (
          <button
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
            key={btn.action}
            onClick={() => handleToolbarAction(btn.action)}
            title={btn.title}
            type="button"
          >
            <Codicon name={btn.icon as never} size="0.875rem" />
          </button>
        ))}

        {viewMode !== 'preview' && <div className="mx-1 h-5 w-px bg-(--ui-stroke-secondary)" />}

        <div className="flex items-center gap-0.5 rounded border border-(--ui-stroke-secondary)">
          {([
            { icon: 'edit', mode: 'edit' as const, title: '编辑' },
            { icon: 'split-horizontal', mode: 'split' as const, title: '分栏' },
            { icon: 'preview', mode: 'preview' as const, title: '预览' }
          ]).map(({ icon, mode, title }) => (
            <button
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 text-[10px] transition-colors',
                viewMode === mode
                  ? 'bg-(--ui-control-active-background) text-foreground'
                  : 'text-(--ui-text-quaternary) hover:text-foreground'
              )}
              key={mode}
              onClick={() => setViewMode(mode)}
              title={title}
              type="button"
            >
              <Codicon name={icon as 'edit' | 'split-horizontal' | 'preview'} size="0.75rem" />
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1 text-[10px] text-(--ui-text-quaternary)">
          <button
            className={cn(
              'flex items-center gap-1 rounded px-2 py-0.5 transition-colors',
              showFindReplace
                ? 'bg-(--ui-control-active-background) text-foreground'
                : 'hover:text-foreground'
            )}
            onClick={() => setShowFindReplace(!showFindReplace)}
            title="查找替换 (Ctrl+F)"
            type="button"
          >
            <Codicon name="search" size="0.75rem" />
          </button>
          <button
            className={cn(
              'flex items-center gap-1 rounded px-2 py-0.5 transition-colors',
              showOutline
                ? 'bg-(--ui-control-active-background) text-foreground'
                : 'hover:text-foreground'
            )}
            onClick={() => setShowOutline(!showOutline)}
            title="大纲"
            type="button"
          >
            <Codicon name="list-unordered" size="0.75rem" />
          </button>
          <span>
            {stats.chineseChars} 字 / {stats.englishWords} 词
          </span>
        </div>
      </div>

      {showFindReplace && (
        <div className="flex shrink-0 items-center gap-2 border-b border-(--ui-stroke-secondary) bg-(--ui-surface-secondary) px-2 py-1.5">
          <div className="flex items-center gap-1">
            <input
              className="h-6 w-36 rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-primary) px-2 text-xs text-(--ui-text-primary) outline-none focus:border-(--ui-color-accent)"
              onChange={e => { setFindText(e.target.value); setCurrentMatchIndex(0) }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleFindNext()
                }
              }}
              placeholder="查找..."
              value={findText}
            />
            <input
              className="h-6 w-36 rounded border border-(--ui-stroke-secondary) bg-(--ui-surface-primary) px-2 text-xs text-(--ui-text-primary) outline-none focus:border-(--ui-color-accent)"
              onChange={e => setReplaceText(e.target.value)}
              placeholder="替换为..."
              value={replaceText}
            />
          </div>
          <div className="flex items-center gap-0.5">
            <button
              className="flex h-6 w-6 items-center justify-center rounded text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
              onClick={handleFindPrev}
              title="上一个"
              type="button"
            >
              <Codicon name="chevron-up" size="0.75rem" />
            </button>
            <button
              className="flex h-6 w-6 items-center justify-center rounded text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
              onClick={handleFindNext}
              title="下一个"
              type="button"
            >
              <Codicon name="chevron-down" size="0.75rem" />
            </button>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              className="h-6 rounded px-2 text-[10px] text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
              onClick={handleReplace}
              type="button"
            >
              替换
            </button>
            <button
              className="h-6 rounded px-2 text-[10px] text-(--ui-text-quaternary) transition-colors hover:bg-(--ui-control-hover-background) hover:text-foreground"
              onClick={handleReplaceAll}
              type="button"
            >
              全部替换
            </button>
          </div>
          <div className="flex items-center gap-1">
            <label className="flex items-center gap-1 text-[10px] text-(--ui-text-quaternary)">
              <input
                checked={matchCase}
                onChange={e => setMatchCase(e.target.checked)}
                type="checkbox"
              />
              区分大小写
            </label>
          </div>
          <div className="ml-auto text-[10px] text-(--ui-text-quaternary)">
            {findText ? `${matches.length > 0 ? currentMatchIndex + 1 : 0} / ${matches.length}` : ''}
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div className={cn('min-h-0 min-w-0', viewMode === 'split' ? 'flex-1 border-r border-(--ui-stroke-secondary)' : 'w-full')}>
            <textarea
              ref={textareaRef}
              className="h-full w-full resize-none bg-transparent p-4 font-mono text-sm leading-relaxed text-(--ui-text-primary) outline-none"
              onChange={e => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onKeyUp={handleSelect}
              onMouseUp={handleSelect}
              spellCheck={false}
              value={content}
            />
          </div>
        )}

        {(viewMode === 'preview' || viewMode === 'split') && (
          <div ref={previewRef} className={cn('min-h-0 min-w-0 overflow-auto', viewMode === 'split' ? 'flex-1' : 'w-full')}>
            <div className="p-6">
              {content ? (
                <div className="mx-auto max-w-3xl">
                  <Streamdown components={MD_PREVIEW_COMPONENTS} controls={false} mode="static" parseIncompleteMarkdown={false} plugins={plugins}>
                    {content}
                  </Streamdown>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-(--ui-text-quaternary)">
                  开始输入内容以预览
                </div>
              )}
            </div>
          </div>
        )}

        {showOutline && (
          <div className="w-60 shrink-0 overflow-auto border-l border-(--ui-stroke-secondary) bg-(--ui-surface-secondary)">
            <div className="px-3 py-2 text-xs font-medium text-(--ui-text-secondary)">大纲</div>
            {headings.length === 0 ? (
              <div className="px-3 py-4 text-xs text-(--ui-text-quaternary)">
                暂无标题
              </div>
            ) : (
              <div className="space-y-0.5 px-1 pb-3">
                {headings.map((heading, index) => (
                  <button
                    key={index}
                    className="block w-full truncate rounded px-2 py-1 text-left text-xs transition-colors hover:bg-(--ui-control-hover-background)"
                    onClick={() => jumpToLine(heading.line)}
                    style={{ paddingLeft: `${(heading.level - 1) * 12 + 8}px` }}
                    title={heading.text}
                    type="button"
                  >
                    <span className={cn(
                      'text-(--ui-text-primary)',
                      heading.level === 1 && 'font-semibold',
                      heading.level > 3 && 'text-(--ui-text-secondary)'
                    )}>
                      {heading.text}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
