import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { highlightActiveLine, highlightActiveLineGutter, lineNumbers } from '@codemirror/view'
import { drawSelection, EditorView, keymap } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { Compartment, EditorState } from '@codemirror/state'
import { useEffect, useMemo, useRef } from 'react'

import { githubEditorTheme } from '@/components/chat/code-editor-theme'
import { useTheme } from '@/themes/context'

import type { EditorProps, EditorSelection } from './editor-registry'

const LARGE_FILE_THRESHOLD = 2 * 1024 * 1024

const MONO_FONT = 'var(--font-mono)'
const ROW_HEIGHT = '1.25rem'
const CODE_SIZE = '0.875rem'
const GUTTER_COLOR = 'color-mix(in oklab, var(--muted-foreground) 55%, transparent)'

interface TextEditorStats {
  words: number
  chars: number
  lines: number
}

interface TextEditorExtendedProps extends EditorProps {
  wordWrap?: boolean
  showLineNumbers?: boolean
  onStatistics?: (stats: TextEditorStats) => void
  onCursorPosition?: (pos: { line: number; column: number }) => void
}

const LAYOUT_THEME = EditorView.theme({
  '&': {
    WebkitFontSmoothing: 'antialiased',
    backgroundColor: 'transparent',
    height: '100%'
  },
  '.cm-content': {
    fontFamily: MONO_FONT,
    fontSize: CODE_SIZE,
    fontWeight: '400',
    lineHeight: ROW_HEIGHT,
    padding: '0',
    caretColor: 'var(--foreground)'
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: GUTTER_COLOR,
    fontFamily: MONO_FONT,
    fontSize: CODE_SIZE
  },
  '.cm-lineNumbers .cm-gutterElement': {
    boxSizing: 'border-box',
    fontVariantNumeric: 'tabular-nums',
    fontWeight: '400',
    lineHeight: ROW_HEIGHT,
    minWidth: '2.25rem',
    padding: '0 0.5rem 0 0',
    textAlign: 'right',
    cursor: 'default'
  },
  '.cm-line': {
    fontFamily: MONO_FONT,
    fontSize: CODE_SIZE,
    fontWeight: '400',
    lineHeight: ROW_HEIGHT,
    padding: '0 0.625rem',
    position: 'relative'
  },
  '.cm-scroller': {
    fontFamily: MONO_FONT,
    fontSize: CODE_SIZE,
    lineHeight: ROW_HEIGHT,
    overflow: 'auto'
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 6%, transparent)'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 10%, transparent)'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--foreground)'
  },
  '&.cm-focused .cm-selectionBackground, .cm-content ::selection, .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 25%, transparent)'
  }
})

function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  const cjkRegex = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/g
  const cjkMatches = trimmed.match(cjkRegex)
  const cjkCount = cjkMatches ? cjkMatches.length : 0
  const nonCjkText = trimmed.replace(cjkRegex, ' ')
  const words = nonCjkText.split(/\s+/).filter(w => w.length > 0)
  return cjkCount + words.length
}

function getLineEnding(content: string): 'LF' | 'CRLF' {
  const crlfCount = (content.match(/\r\n/g) || []).length
  const lfCount = (content.match(/(?<!\r)\n/g) || []).length
  return crlfCount > lfCount ? 'CRLF' : 'LF'
}

function detectLargeFile(content: string): boolean {
  return new Blob([content]).size > LARGE_FILE_THRESHOLD
}

export function TextEditor({
  filePath,
  content,
  onChange,
  onSave,
  readOnly = false,
  onSelectionChange,
  wordWrap = false,
  showLineNumbers = true,
  onStatistics,
  onCursorPosition
}: TextEditorExtendedProps) {
  const { resolvedMode } = useTheme()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const lineNumbersConf = useRef(new Compartment())
  const wordWrapConf = useRef(new Compartment())
  const readonlyConf = useRef(new Compartment())
  const themeConf = useRef(new Compartment())
  const highlightConf = useRef(new Compartment())

  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const onStatisticsRef = useRef(onStatistics)
  const onCursorPositionRef = useRef(onCursorPosition)

  onChangeRef.current = onChange
  onSaveRef.current = onSave
  onSelectionChangeRef.current = onSelectionChange
  onStatisticsRef.current = onStatistics
  onCursorPositionRef.current = onCursorPosition

  const isLargeFile = useMemo(() => detectLargeFile(content), [content])
  const effectiveShowLineNumbers = showLineNumbers && !isLargeFile
  const effectiveHighlight = !isLargeFile

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const isDark = resolvedMode === 'dark'

    const save = (): boolean => {
      onSaveRef.current?.()
      return true
    }

    const computeAndEmitStats = (state: EditorState) => {
      const doc = state.doc.toString()
      const stats: TextEditorStats = {
        words: countWords(doc),
        chars: doc.length,
        lines: state.doc.lines
      }
      onStatisticsRef.current?.(stats)
    }

    const baseExtensions: Extension[] = [
      history(),
      drawSelection(),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        indentWithTab,
        { key: 'Mod-s', preventDefault: true, run: save },
        { key: 'Mod-f', preventDefault: true, run: () => true },
        { key: 'Mod-h', preventDefault: true, run: () => true }
      ]),
      lineNumbersConf.current.of(effectiveShowLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : []),
      wordWrapConf.current.of(wordWrap ? EditorView.lineWrapping : []),
      readonlyConf.current.of(EditorState.readOnly.of(readOnly)),
      highlightConf.current.of(effectiveHighlight ? [highlightActiveLine()] : []),
      themeConf.current.of(githubEditorTheme(isDark)),
      EditorView.updateListener.of(update => {
        if (update.docChanged) {
          onChangeRef.current(update.state.doc.toString())
          computeAndEmitStats(update.state)
        }
        if (update.selectionSet) {
          const sel = update.state.selection.main
          if (sel.empty) {
            onSelectionChangeRef.current?.(null)
          } else {
            const selection: EditorSelection = {
              text: update.state.doc.sliceString(sel.from, sel.to),
              start: sel.from,
              end: sel.to
            }
            onSelectionChangeRef.current?.(selection)
          }
          const line = update.state.doc.lineAt(sel.head)
          const col = sel.head - line.from + 1
          onCursorPositionRef.current?.({ line: line.number, column: col })
        }
        if (update.docChanged || update.selectionSet) {
          computeAndEmitStats(update.state)
        }
      }),
      LAYOUT_THEME
    ]

    const state = EditorState.create({
      doc: content,
      extensions: baseExtensions
    })

    const view = new EditorView({ parent: host, state })
    viewRef.current = view

    computeAndEmitStats(state)

    requestAnimationFrame(() => {
      view.focus()
    })

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: lineNumbersConf.current.reconfigure(effectiveShowLineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : [])
    })
  }, [effectiveShowLineNumbers])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wordWrapConf.current.reconfigure(wordWrap ? EditorView.lineWrapping : [])
    })
  }, [wordWrap])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readonlyConf.current.reconfigure(EditorState.readOnly.of(readOnly))
    })
  }, [readOnly])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: highlightConf.current.reconfigure(effectiveHighlight ? [highlightActiveLine()] : [])
    })
  }, [effectiveHighlight])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeConf.current.reconfigure(githubEditorTheme(resolvedMode === 'dark'))
    })
  }, [resolvedMode])

  useEffect(() => {
    if (!viewRef.current) return
    const currentContent = viewRef.current.state.doc.toString()
    if (content !== currentContent) {
      viewRef.current.dispatch({
        changes: { from: 0, to: currentContent.length, insert: content }
      })
    }
  }, [content])

  return <div className="h-full min-h-0 overflow-hidden" ref={hostRef} />
}

export { getLineEnding, detectLargeFile, LARGE_FILE_THRESHOLD }
export type { TextEditorStats }
