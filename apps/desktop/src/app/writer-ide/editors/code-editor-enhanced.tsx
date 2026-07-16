import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab, toggleComment } from '@codemirror/commands'
import {
  bracketMatching,
  codeFolding,
  foldGutter,
  foldKeymap,
  indentOnInput,
  indentUnit,
  StreamLanguage,
  syntaxTree
} from '@codemirror/language'
import type { Diagnostic } from '@codemirror/lint'
import { linter, lintGutter, setDiagnostics } from '@codemirror/lint'
import type { Extension } from '@codemirror/state'
import { Compartment, EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import type { KeyBinding } from '@codemirror/view'
import {
  Decoration,
  drawSelection,
  EditorView,
  gutter,
  GutterMarker,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  ViewPlugin,
  ViewUpdate,
  WidgetType
} from '@codemirror/view'
import { useEffect, useMemo, useRef } from 'react'

import { githubEditorTheme } from '@/components/chat/code-editor-theme'
import { useTheme } from '@/themes/context'

import type { EditorSelection, EditorDiagnostic } from '../lib/file-capabilities'

import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
import { xml } from '@codemirror/lang-xml'
import { markdown } from '@codemirror/lang-markdown'
import { toml } from '@codemirror/legacy-modes/mode/toml'

interface CodeEditorEnhancedProps {
  filePath: string
  content: string
  language: string
  onChange: (content: string) => void
  onSave?: () => void
  onSelectionChange?: (selection: EditorSelection | null) => void
  onCursorPosition?: (pos: { line: number; column: number }) => void
  diagnostics?: EditorDiagnostic[]
  breakpoints?: number[]
  onToggleBreakpoint?: (line: number) => void
  formatTrigger?: number
  readOnly?: boolean
}

interface SymbolInfo {
  name: string
  type: string
  from: number
  to: number
  line: number
}

const MONO_FONT = 'var(--font-mono)'
const ROW_HEIGHT = '1.25rem'
const CODE_SIZE = '0.7rem'
const GUTTER_COLOR = 'color-mix(in oklab, var(--muted-foreground) 55%, transparent)'

const breakpointEffect = StateEffect.define<{ pos: number; on: boolean }>()

const breakpointField = StateField.define<Set<number>>({
  create() {
    return new Set()
  },
  update(set, tr) {
    const newSet = new Set(set)
    for (const e of tr.effects) {
      if (e.is(breakpointEffect)) {
        if (e.value.on) {
          newSet.add(e.value.pos)
        } else {
          newSet.delete(e.value.pos)
        }
      }
    }
    return newSet
  }
})

class BreakpointMarker extends GutterMarker {
  toDOM() {
    const dom = document.createElement('div')
    dom.style.cssText =
      'width: 10px; height: 10px; border-radius: 50%; background: #ef4444; margin: 3px auto 0; cursor: pointer;'
    return dom
  }
}

class BreakpointSpacerMarker extends GutterMarker {
  toDOM() {
    const dom = document.createElement('div')
    dom.style.cssText = 'width: 16px; cursor: pointer;'
    return dom
  }
}

class IndentGuideWidget extends WidgetType {
  constructor(private readonly col: number) {
    super()
  }
  eq(other: IndentGuideWidget) {
    return other.col === this.col
  }
  toDOM() {
    const dom = document.createElement('div')
    dom.className = 'cm-indent-guide'
    dom.style.cssText = `
      position: absolute;
      top: 0;
      bottom: 0;
      border-left: 1px dotted color-mix(in oklab, var(--muted-foreground) 18%, transparent);
      pointer-events: none;
      left: ${this.col}ch;
    `
    return dom
  }
}

function getSymbolsFromTree(view: EditorView): SymbolInfo[] {
  const symbols: SymbolInfo[] = []
  const tree = syntaxTree(view.state)
  const cursor = tree.cursor()
  const seen = new Set<string>()

  do {
    const node = cursor.node
    const typeName = node.type.name
    let symbolType: string | null = null
    let name = ''

    if (
      typeName.includes('FunctionDefinition') ||
      typeName.includes('FunctionDeclaration') ||
      typeName === 'FunctionExpression' ||
      typeName === 'MethodDefinition' ||
      typeName === 'def' ||
      typeName === 'function_definition'
    ) {
      symbolType = 'function'
      const child =
        node.getChild('VariableName') ||
        node.getChild('Identifier') ||
        node.getChild('PropertyName') ||
        node.getChild('function_definition_name')
      if (child) {
        name = view.state.doc.sliceString(child.from, child.to)
      }
    } else if (
      typeName.includes('ClassDefinition') ||
      typeName.includes('ClassDeclaration') ||
      typeName === 'class_definition'
    ) {
      symbolType = 'class'
      const child =
        node.getChild('VariableName') || node.getChild('Identifier') || node.getChild('class_definition_name')
      if (child) {
        name = view.state.doc.sliceString(child.from, child.to)
      }
    }

    if (symbolType && name && !seen.has(`${name}:${node.from}`)) {
      seen.add(`${name}:${node.from}`)
      const line = view.state.doc.lineAt(node.from)
      symbols.push({
        name,
        type: symbolType,
        from: node.from,
        to: node.to,
        line: line.number
      })
    }
  } while (cursor.next())

  return symbols
}

const indentGuidesPlugin = ViewPlugin.fromClass(
  class {
    decorations: ReturnType<Decoration['range']>[] | Decoration[] | any
    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view)
      }
    }
    buildDecorations(view: EditorView) {
      const builder = new RangeSetBuilder<Decoration>()
      const indentSize = (view.state.facet(indentUnit) as string).length || 2
      for (const { from, to } of view.visibleRanges) {
        let pos = from
        while (pos <= to) {
          const line = view.state.doc.lineAt(pos)
          const text = line.text
          let indent = 0
          let col = 0
          for (let i = 0; i < text.length; i++) {
            const ch = text[i]
            if (ch === ' ') {
              col++
            } else if (ch === '\t') {
              col += view.state.tabSize - (col % view.state.tabSize)
            } else {
              break
            }
            indent = i + 1
          }
          for (let level = indentSize; level < col; level += indentSize) {
            builder.add(
              line.from,
              line.from,
              Decoration.widget({ widget: new IndentGuideWidget(level), side: -1, block: false })
            )
          }
          pos = line.to + 1
        }
      }
      return builder.finish()
    }
  },
  {
    decorations: v => v.decorations as any
  }
)

const gotoLineKeymap: KeyBinding = {
  key: 'Ctrl-g',
  mac: 'Cmd-g',
  run: (view: EditorView) => {
    const lineStr = window.prompt('跳转到行:')
    if (!lineStr) return false
    const line = parseInt(lineStr, 10)
    if (isNaN(line) || line < 1 || line > view.state.doc.lines) return false
    const pos = view.state.doc.line(line).from
    view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 0 })
    })
    view.focus()
    return true
  }
}

const gotoSymbolKeymap: KeyBinding = {
  key: 'Ctrl-Shift-o',
  mac: 'Cmd-Shift-o',
  run: (view: EditorView) => {
    const symbols = getSymbolsFromTree(view)
    if (symbols.length === 0) {
      window.alert('当前文件未找到符号')
      return true
    }
    const items = symbols.map((s, i) => `${i + 1}: ${s.type === 'class' ? '类' : '函数'} ${s.name} (行 ${s.line})`)
    const input = window.prompt(`跳转到符号 (1-${symbols.length}):\n${items.join('\n')}`)
    if (!input) return false
    const idx = parseInt(input, 10)
    if (isNaN(idx) || idx < 1 || idx > symbols.length) return false
    const symbol = symbols[idx - 1]
    view.dispatch({
      selection: { anchor: symbol.from },
      effects: EditorView.scrollIntoView(symbol.from, { y: 'start', yMargin: 0 })
    })
    view.focus()
    return true
  }
}

function getLanguageExtension(language: string): Extension {
  const langMap: Record<string, () => Extension> = {
    javascript: () => javascript(),
    typescript: () => javascript({ typescript: true }),
    jsx: () => javascript({ jsx: true }),
    tsx: () => javascript({ typescript: true, jsx: true }),
    python: () => python(),
    py: () => python(),
    html: () => html(),
    htm: () => html(),
    css: () => css(),
    json: () => json(),
    yaml: () => yaml(),
    yml: () => yaml(),
    xml: () => xml(),
    toml: () => StreamLanguage.define(toml),
    markdown: () => markdown(),
    md: () => markdown()
  }

  const factory = langMap[language.toLowerCase()]
  return factory ? factory() : []
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
  '.cm-foldGutter .cm-gutterElement': {
    padding: '0 0.25rem',
    textAlign: 'center',
    cursor: 'pointer'
  },
  '.cm-breakpoint-gutter .cm-gutterElement': {
    padding: '0',
    width: '16px',
    cursor: 'pointer'
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
  '.cm-matchingBracket': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 20%, transparent)',
    borderRadius: '2px'
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'color-mix(in oklab, var(--muted) 30%, transparent)',
    border: '1px solid color-mix(in oklab, var(--border) 50%, transparent)',
    borderRadius: '3px',
    padding: '0 4px',
    margin: '0 2px',
    cursor: 'pointer'
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--foreground)'
  },
  '&.cm-focused .cm-selectionBackground, .cm-content ::selection, .cm-selectionBackground': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 25%, transparent)'
  }
})

function emptyLintSource(): Diagnostic[] {
  return []
}

export function CodeEditorEnhanced({
  filePath,
  content,
  language,
  onChange,
  onSave,
  onSelectionChange,
  onCursorPosition,
  diagnostics = [],
  breakpoints = [],
  onToggleBreakpoint,
  formatTrigger,
  readOnly = false
}: CodeEditorEnhancedProps) {
  const { resolvedMode } = useTheme()
  const hostRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const languageConf = useRef(new Compartment())
  const themeConf = useRef(new Compartment())
  const readonlyConf = useRef(new Compartment())

  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const onSelectionChangeRef = useRef(onSelectionChange)
  const onCursorPositionRef = useRef(onCursorPosition)
  const onToggleBreakpointRef = useRef(onToggleBreakpoint)

  onChangeRef.current = onChange
  onSaveRef.current = onSave
  onSelectionChangeRef.current = onSelectionChange
  onCursorPositionRef.current = onCursorPosition
  onToggleBreakpointRef.current = onToggleBreakpoint

  const languageSupport = useMemo(() => getLanguageExtension(language), [language])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const isDark = resolvedMode === 'dark'

    const save = (): boolean => {
      onSaveRef.current?.()
      return true
    }

    const breakpointGutterExtension = gutter({
      class: 'cm-breakpoint-gutter',
      markers: view => {
        const builder = new RangeSetBuilder<GutterMarker>()
        const bps = view.state.field(breakpointField)
        const sortedBps = Array.from(bps).sort((a, b) => a - b)
        for (const pos of sortedBps) {
          const line = view.state.doc.lineAt(pos)
          builder.add(line.from, line.from, new BreakpointMarker())
        }
        return builder.finish()
      },
      initialSpacer: () => new BreakpointSpacerMarker(),
      domEventHandlers: {
        mousedown: (view, line) => {
          const bps = view.state.field(breakpointField)
          const hasBreakpoint = bps.has(line.from)
          const lineNumber = view.state.doc.lineAt(line.from).number
          view.dispatch({
            effects: breakpointEffect.of({ pos: line.from, on: !hasBreakpoint })
          })
          onToggleBreakpointRef.current?.(lineNumber)
          return true
        }
      }
    })

    const state = EditorState.create({
      doc: content,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        closeBrackets(),
        codeFolding(),
        foldGutter(),
        breakpointGutterExtension,
        breakpointField,
        indentUnit.of('  '),
        indentGuidesPlugin,
        lintGutter(),
        linter(emptyLintSource),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
          indentWithTab,
          gotoLineKeymap,
          gotoSymbolKeymap,
          { key: 'Mod-s', preventDefault: true, run: save },
          { key: 'Mod-/', preventDefault: true, run: toggleComment }
        ]),
        languageConf.current.of(languageSupport),
        themeConf.current.of(githubEditorTheme(isDark)),
        readonlyConf.current.of(EditorState.readOnly.of(readOnly)),
        EditorView.updateListener.of(update => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString())
          }
          if (update.selectionSet) {
            const sel = update.state.selection.main
            if (sel.empty) {
              onSelectionChangeRef.current?.(null)
            } else {
              onSelectionChangeRef.current?.({
                text: update.state.doc.sliceString(sel.from, sel.to),
                start: sel.from,
                end: sel.to
              })
            }
            const line = update.state.doc.lineAt(sel.head)
            const col = sel.head - line.from + 1
            onCursorPositionRef.current?.({ line: line.number, column: col })
          }
        }),
        LAYOUT_THEME
      ]
    })

    const view = new EditorView({ parent: host, state })
    viewRef.current = view
    view.focus()

    if (breakpoints.length > 0) {
      const effects: StateEffect<unknown>[] = []
      for (const lineNum of breakpoints) {
        if (lineNum >= 1 && lineNum <= view.state.doc.lines) {
          const pos = view.state.doc.line(lineNum).from
          effects.push(breakpointEffect.of({ pos, on: true }))
        }
      }
      if (effects.length > 0) {
        view.dispatch({ effects })
      }
    }

    if (diagnostics.length > 0) {
      const cmDiagnostics = convertDiagnostics(view, diagnostics)
      view.dispatch(setDiagnostics(view.state, cmDiagnostics))
    }

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageConf.current.reconfigure(languageSupport)
    })
  }, [languageSupport])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeConf.current.reconfigure(githubEditorTheme(resolvedMode === 'dark'))
    })
  }, [resolvedMode])

  useEffect(() => {
    if (!viewRef.current) return
    const cmDiagnostics = convertDiagnostics(viewRef.current, diagnostics)
    viewRef.current.dispatch(setDiagnostics(viewRef.current.state, cmDiagnostics))
  }, [diagnostics])

  useEffect(() => {
    if (!viewRef.current) return
    const effects: StateEffect<unknown>[] = []
    const currentBps = viewRef.current.state.field(breakpointField)
    const newBps = new Set<number>()

    for (const lineNum of breakpoints) {
      if (lineNum >= 1 && lineNum <= viewRef.current.state.doc.lines) {
        newBps.add(viewRef.current.state.doc.line(lineNum).from)
      }
    }

    for (const pos of currentBps) {
      if (!newBps.has(pos)) {
        effects.push(breakpointEffect.of({ pos, on: false }))
      }
    }
    for (const pos of newBps) {
      if (!currentBps.has(pos)) {
        effects.push(breakpointEffect.of({ pos, on: true }))
      }
    }

    if (effects.length > 0) {
      viewRef.current.dispatch({ effects })
    }
  }, [breakpoints])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readonlyConf.current.reconfigure(EditorState.readOnly.of(readOnly))
    })
  }, [readOnly])

  useEffect(() => {
    if (!viewRef.current || !formatTrigger) return
    const doc = viewRef.current.state.doc.toString()
    try {
      let formatted: string | null = null
      if (language === 'json') {
        formatted = JSON.stringify(JSON.parse(doc), null, 2)
      }
      if (formatted && formatted !== doc) {
        viewRef.current.dispatch({
          changes: { from: 0, to: doc.length, insert: formatted }
        })
      }
    } catch {
      // Format failed, ignore
    }
  }, [formatTrigger, language])

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

function convertDiagnostics(view: EditorView, diagnostics: EditorDiagnostic[]): Diagnostic[] {
  return diagnostics
    .filter(d => d.line !== undefined)
    .map(d => {
      const line = d.line || 1
      const lineObj = view.state.doc.line(Math.min(line, view.state.doc.lines))
      const from = lineObj.from + Math.min(Math.max(0, (d.column || 1) - 1), lineObj.length)
      const to =
        d.endLine && d.endColumn
          ? (() => {
              const endLineObj = view.state.doc.line(Math.min(d.endLine, view.state.doc.lines))
              return endLineObj.from + Math.min(Math.max(0, d.endColumn - 1), endLineObj.length)
            })()
          : Math.min(from + 1, lineObj.to)
      return {
        from,
        to,
        severity: d.severity,
        message: d.message,
        source: d.source
      }
    })
}
