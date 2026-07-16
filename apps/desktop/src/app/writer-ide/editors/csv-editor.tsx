import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'

interface CsvEditorProps {
  filePath: string
  content: string
  onChange: (content: string) => void
  onSave?: () => void
  readOnly?: boolean
  delimiter?: ',' | '\t' | ';'
  onFindTrigger?: () => void
}

type CellPosition = { row: number; col: number } | null
type SortDirection = 'asc' | 'desc' | null

const ROW_HEIGHT = 24
const DEFAULT_COLUMN_WIDTH = 120
const HEADER_HEIGHT = 28
const ROW_NUMBER_WIDTH = 48
const VISIBLE_ROW_BUFFER = 8

function detectDelimiter(content: string, preferred?: ',' | '\t' | ';'): ',' | '\t' | ';' {
  if (preferred) return preferred

  const firstLine = content.split(/\r?\n/)[0] || ''
  const counts = {
    ',': (firstLine.match(/,/g) || []).length,
    '\t': (firstLine.match(/\t/g) || []).length,
    ';': (firstLine.match(/;/g) || []).length
  }

  if (counts['\t'] > counts[','] && counts['\t'] > counts[';']) return '\t'
  if (counts[';'] > counts[','] && counts[';'] > counts['\t']) return ';'
  return ','
}

function parseCSV(content: string, delimiter: string): string[][] {
  if (!content) return [['']]

  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false
  let i = 0

  while (i < content.length) {
    const char = content[i]
    const nextChar = content[i + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"'
        i += 2
        continue
      }
      if (char === '"') {
        inQuotes = false
        i++
        continue
      }
      currentField += char
      i++
    } else {
      if (char === '"') {
        inQuotes = true
        i++
        continue
      }
      if (char === delimiter) {
        currentRow.push(currentField)
        currentField = ''
        i++
        continue
      }
      if (char === '\r') {
        i++
        continue
      }
      if (char === '\n') {
        currentRow.push(currentField)
        rows.push(currentRow)
        currentRow = []
        currentField = ''
        i++
        continue
      }
      currentField += char
      i++
    }
  }

  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField)
    rows.push(currentRow)
  }

  if (rows.length === 0) {
    return [['']]
  }

  const maxCols = Math.max(...rows.map(r => r.length), 1)
  return rows.map(row => {
    while (row.length < maxCols) row.push('')
    return row
  })
}

function serializeCSV(data: string[][], delimiter: string): string {
  return data
    .map(row =>
      row
        .map(field => {
          const needsQuotes =
            field.includes(delimiter) ||
            field.includes('"') ||
            field.includes('\n') ||
            field.includes('\r')
          if (needsQuotes) {
            return `"${field.replace(/"/g, '""')}"`
          }
          return field
        })
        .join(delimiter)
    )
    .join('\n')
}

export function CsvEditor({
  filePath,
  content,
  onChange,
  onSave,
  readOnly,
  delimiter: propDelimiter,
  onFindTrigger
}: CsvEditorProps) {
  const delimiter = useMemo(() => detectDelimiter(content, propDelimiter), [content, propDelimiter])
  const [data, setData] = useState<string[][]>(() => parseCSV(content, delimiter))
  const [selectedCell, setSelectedCell] = useState<CellPosition>(null)
  const [editingCell, setEditingCell] = useState<CellPosition>(null)
  const [editValue, setEditValue] = useState('')
  const [frozenHeader, setFrozenHeader] = useState(true)
  const [sortConfig, setSortConfig] = useState<{ col: number; dir: SortDirection }>({
    col: -1,
    dir: null
  })
  const [columnWidths, setColumnWidths] = useState<Record<number, number>>({})
  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    row: number
    col: number
  } | null>(null)
  const [resizingCol, setResizingCol] = useState<number | null>(null)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(400)

  useEffect(() => {
    const parsed = parseCSV(content, delimiter)
    setData(parsed)
    setSelectedCell(null)
    setEditingCell(null)
    setSortConfig({ col: -1, dir: null })
  }, [content, delimiter])

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height)
      }
    })
    observer.observe(el)
    setContainerHeight(el.clientHeight)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (editingCell && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingCell])

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        onFindTrigger?.()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        onSave?.()
        return
      }

      if (editingCell) return
      if (!selectedCell) return

      const { row, col } = selectedCell
      const maxRow = data.length - 1
      const maxCol = (data[0]?.length || 1) - 1

      if (e.key === 'ArrowUp' && row > 0) {
        e.preventDefault()
        setSelectedCell({ row: row - 1, col })
      } else if (e.key === 'ArrowDown' && row < maxRow) {
        e.preventDefault()
        setSelectedCell({ row: row + 1, col })
      } else if (e.key === 'ArrowLeft' && col > 0) {
        e.preventDefault()
        setSelectedCell({ row, col: col - 1 })
      } else if (e.key === 'ArrowRight' && col < maxCol) {
        e.preventDefault()
        setSelectedCell({ row, col: col + 1 })
      } else if (e.key === 'Enter' && !readOnly) {
        e.preventDefault()
        startEdit(row, col)
      } else if (e.key === 'Delete' && !readOnly) {
        e.preventDefault()
        updateCell(row, col, '')
      } else if (e.key === 'Tab') {
        e.preventDefault()
        const nextCol = e.shiftKey ? col - 1 : col + 1
        if (nextCol >= 0 && nextCol <= maxCol) {
          setSelectedCell({ row, col: nextCol })
        } else if (!e.shiftKey && row < maxRow) {
          setSelectedCell({ row: row + 1, col: 0 })
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedCell, editingCell, data, readOnly, onFindTrigger, onSave])

  const displayedData = useMemo(() => {
    if (sortConfig.col < 0 || sortConfig.dir === null) return data

    const sorted = [...data.slice(1)].sort((a, b) => {
      const aVal = a[sortConfig.col] || ''
      const bVal = b[sortConfig.col] || ''
      const aNum = Number(aVal)
      const bNum = Number(bVal)
      let cmp: number
      if (!isNaN(aNum) && !isNaN(bNum) && aVal !== '' && bVal !== '') {
        cmp = aNum - bNum
      } else {
        cmp = aVal.localeCompare(bVal)
      }
      return sortConfig.dir === 'asc' ? cmp : -cmp
    })

    return [data[0], ...sorted]
  }, [data, sortConfig])

  const totalCols = displayedData[0]?.length || 1
  const totalRows = displayedData.length

  const getColumnWidth = useCallback(
    (col: number) => columnWidths[col] || DEFAULT_COLUMN_WIDTH,
    [columnWidths]
  )

  const totalDataWidth = useMemo(() => {
    let w = 0
    for (let c = 0; c < totalCols; c++) w += getColumnWidth(c)
    return w
  }, [totalCols, getColumnWidth])

  const totalWidth = totalDataWidth + ROW_NUMBER_WIDTH

  const visibleRowCount = Math.ceil(containerHeight / ROW_HEIGHT) + VISIBLE_ROW_BUFFER * 2
  const bodyStartRow = frozenHeader
    ? Math.max(1, Math.floor(scrollTop / ROW_HEIGHT) - VISIBLE_ROW_BUFFER)
    : Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - VISIBLE_ROW_BUFFER)
  const endRow = Math.min(totalRows, bodyStartRow + visibleRowCount)

  const commitChange = useCallback(
    (newData: string[][]) => {
      setData(newData)
      onChange(serializeCSV(newData, delimiter))
    },
    [delimiter, onChange]
  )

  const updateCell = useCallback(
    (row: number, col: number, value: string) => {
      const newData = data.map(r => [...r])
      while (newData.length <= row) newData.push(Array(totalCols).fill(''))
      while (newData[row].length <= col) newData[row].push('')
      newData[row][col] = value
      commitChange(newData)
    },
    [data, totalCols, commitChange]
  )

  const startEdit = useCallback(
    (row: number, col: number) => {
      if (readOnly) return
      if (frozenHeader && row === 0) return
      setEditingCell({ row, col })
      setEditValue(displayedData[row]?.[col] || '')
    },
    [readOnly, frozenHeader, displayedData]
  )

  const commitEdit = useCallback(() => {
    if (!editingCell) return
    updateCell(editingCell.row, editingCell.col, editValue)
    setEditingCell(null)
  }, [editingCell, editValue, updateCell])

  const cancelEdit = useCallback(() => {
    setEditingCell(null)
    setEditValue('')
  }, [])

  const addRow = useCallback(
    (afterRow: number) => {
      const newData = [...data.map(r => [...r])]
      const newRow = Array(totalCols).fill('')
      newData.splice(afterRow + 1, 0, newRow)
      commitChange(newData)
    },
    [data, totalCols, commitChange]
  )

  const deleteRow = useCallback(
    (row: number) => {
      if (data.length <= 1) return
      const newData = data.filter((_, i) => i !== row)
      commitChange(newData)
      setSelectedCell(null)
    },
    [data, commitChange]
  )

  const addColumn = useCallback(
    (afterCol: number) => {
      const newData = data.map(r => {
        const newRow = [...r]
        newRow.splice(afterCol + 1, 0, '')
        return newRow
      })
      commitChange(newData)
    },
    [data, commitChange]
  )

  const deleteColumn = useCallback(
    (col: number) => {
      if (totalCols <= 1) return
      const newData = data.map(r => r.filter((_, i) => i !== col))
      commitChange(newData)
      setSelectedCell(null)
    },
    [data, totalCols, commitChange]
  )

  const toggleSort = useCallback((col: number) => {
    setSortConfig(prev => {
      if (prev.col !== col) return { col, dir: 'asc' }
      if (prev.dir === 'asc') return { col, dir: 'desc' }
      return { col: -1, dir: null }
    })
  }, [])

  const handleColumnResizeStart = useCallback(
    (e: React.MouseEvent, col: number) => {
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startWidth = getColumnWidth(col)
      setResizingCol(col)

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const newWidth = Math.max(60, startWidth + (moveEvent.clientX - startX))
        setColumnWidths(prev => ({ ...prev, [col]: newWidth }))
      }

      const handleMouseUp = () => {
        setResizingCol(null)
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [getColumnWidth]
  )

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, row: number, col: number) => {
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY, row, col })
      setSelectedCell({ row, col })
    },
    []
  )

  const totalContentHeight = totalRows * ROW_HEIGHT
  const topPadding = bodyStartRow * ROW_HEIGHT
  const bottomPadding = Math.max(0, totalContentHeight - endRow * ROW_HEIGHT)

  const getColLetter = (col: number) => {
    let result = ''
    let n = col
    while (n >= 0) {
      result = String.fromCharCode(65 + (n % 26)) + result
      n = Math.floor(n / 26) - 1
    }
    return result
  }

  return (
    <div className="flex h-full w-full flex-col bg-[var(--vscode-editor-background)]">
      <div className="flex items-center gap-2 border-b border-[var(--vscode-editor-lineHighlightBorder)] px-3 py-1.5 text-xs text-[var(--vscode-foreground)]">
        <button
          className={`rounded px-2 py-0.5 ${
            frozenHeader
              ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
              : 'hover:bg-[var(--vscode-toolbar-hoverBackground)]'
          }`}
          onClick={() => setFrozenHeader(!frozenHeader)}
        >
          冻结表头
        </button>
        <button
          className="rounded px-2 py-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] disabled:opacity-40"
          disabled={readOnly}
          onClick={() => addRow(data.length - 1)}
        >
          + 添加行
        </button>
        <button
          className="rounded px-2 py-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] disabled:opacity-40"
          disabled={readOnly || !selectedCell}
          onClick={() => selectedCell && deleteRow(selectedCell.row)}
        >
          - 删除行
        </button>
        <div className="mx-1 h-4 w-px bg-[var(--vscode-editor-lineHighlightBorder)]" />
        <button
          className="rounded px-2 py-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] disabled:opacity-40"
          disabled={readOnly}
          onClick={() => addColumn(totalCols - 1)}
        >
          + 添加列
        </button>
        <button
          className="rounded px-2 py-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)] disabled:opacity-40"
          disabled={readOnly || !selectedCell}
          onClick={() => selectedCell && deleteColumn(selectedCell.col)}
        >
          - 删除列
        </button>
        <div className="mx-1 h-4 w-px bg-[var(--vscode-editor-lineHighlightBorder)]" />
        <button
          className="rounded px-2 py-0.5 hover:bg-[var(--vscode-toolbar-hoverBackground)]"
          onClick={() => setSortConfig({ col: -1, dir: null })}
        >
          清除排序
        </button>
        <div className="flex-1" />
        <span className="text-[var(--vscode-editorLineNumber-foreground)]">
          {delimiter === '\t' ? 'TSV' : delimiter === ';' ? 'SSV' : 'CSV'} · {totalRows} 行 × {totalCols} 列
        </span>
      </div>

      <div
        ref={scrollContainerRef}
        className="relative flex-1 overflow-auto"
        onScroll={handleScroll}
        tabIndex={0}
      >
        <div style={{ width: totalWidth }}>
          <table
            className="border-collapse text-xs text-[var(--vscode-foreground)]"
            style={{ width: totalWidth, tableLayout: 'fixed' }}
          >
            <colgroup>
              <col style={{ width: ROW_NUMBER_WIDTH }} />
              {Array.from({ length: totalCols }, (_, col) => (
                <col key={col} style={{ width: getColumnWidth(col) }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th
                  className={`border-r border-b border-[var(--vscode-editor-lineHighlightBorder)] bg-[var(--vscode-editor-inactiveSelectionBackground)] text-xs font-normal ${
                    frozenHeader ? 'sticky top-0 left-0 z-40' : 'sticky left-0 z-30'
                  }`}
                  style={{
                    height: HEADER_HEIGHT
                  }}
                >
                  <span className="text-[var(--vscode-editorLineNumber-foreground)]">#</span>
                </th>
                {Array.from({ length: totalCols }, (_, col) => {
                  const isSorted = sortConfig.col === col
                  return (
                    <th
                      key={col}
                      className={`relative select-none border-r border-b border-[var(--vscode-editor-lineHighlightBorder)] bg-[var(--vscode-editor-inactiveSelectionBackground)] px-2 text-left font-semibold ${
                        frozenHeader ? 'sticky top-0 z-30' : ''
                      } cursor-pointer hover:bg-[var(--vscode-list-hoverBackground)]`}
                      style={{ height: HEADER_HEIGHT, minWidth: getColumnWidth(col) }}
                      onClick={() => toggleSort(col)}
                    >
                      <span className="truncate">
                        {getColLetter(col)}
                        {isSorted && <span className="ml-1">{sortConfig.dir === 'asc' ? '▲' : '▼'}</span>}
                      </span>
                      <div
                        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-[var(--vscode-focusBorder)] ${
                          resizingCol === col ? 'bg-[var(--vscode-focusBorder)]' : ''
                        }`}
                        onMouseDown={e => handleColumnResizeStart(e, col)}
                        onClick={e => e.stopPropagation()}
                      />
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {topPadding > 0 && (
                <tr>
                  <td
                    colSpan={totalCols + 1}
                    style={{ height: topPadding, padding: 0, border: 'none' }}
                  />
                </tr>
              )}
              {Array.from({ length: endRow - bodyStartRow }, (_, i) => {
                const row = bodyStartRow + i
                const isSelected = selectedCell?.row === row
                const isHeaderDataRow = row === 0 && frozenHeader

                return (
                  <tr key={row} className="group">
                    <td
                      className={`sticky left-0 z-20 border-r border-b border-[var(--vscode-editor-lineHighlightBorder)] bg-[var(--vscode-editor-background)] text-center text-[var(--vscode-editorLineNumber-foreground)] ${
                        isHeaderDataRow ? 'bg-[var(--vscode-editor-inactiveSelectionBackground)]' : ''
                      }`}
                      style={{ height: ROW_HEIGHT, width: ROW_NUMBER_WIDTH }}
                    >
                      {row + 1}
                    </td>
                    {Array.from({ length: totalCols }, (_, col) => {
                      const isCellSelected = isSelected && selectedCell?.col === col
                      const isEditing = editingCell?.row === row && editingCell?.col === col
                      const cellValue = displayedData[row]?.[col] ?? ''
                      const canEdit = !readOnly && (!frozenHeader || row > 0)

                      return (
                        <td
                          key={col}
                          className={`relative truncate border-r border-b border-[var(--vscode-editor-lineHighlightBorder)] px-2 ${
                            isHeaderDataRow
                              ? 'bg-[var(--vscode-editor-inactiveSelectionBackground)] font-semibold'
                              : 'bg-[var(--vscode-editor-background)]'
                          } ${
                            isCellSelected && !isEditing
                              ? 'outline outline-1 outline-[var(--vscode-focusBorder)] z-10'
                              : ''
                          } ${canEdit ? 'cursor-cell' : ''} ${
                            !isEditing && canEdit ? 'hover:bg-[var(--vscode-list-hoverBackground)]' : ''
                          }`}
                          style={{ height: ROW_HEIGHT, maxWidth: getColumnWidth(col) }}
                          onClick={() => setSelectedCell({ row, col })}
                          onDoubleClick={() => canEdit && startEdit(row, col)}
                          onContextMenu={e => handleContextMenu(e, row, col)}
                        >
                          {isEditing ? (
                            <input
                              ref={editInputRef}
                              className="absolute inset-0 h-full w-full border-none bg-[var(--vscode-editor-background)] px-2 text-xs text-[var(--vscode-foreground)] outline-none ring-1 ring-[var(--vscode-focusBorder)]"
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={commitEdit}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  commitEdit()
                                  if (row < totalRows - 1) {
                                    setSelectedCell({ row: row + 1, col })
                                  }
                                } else if (e.key === 'Escape') {
                                  cancelEdit()
                                } else if (e.key === 'Tab') {
                                  e.preventDefault()
                                  commitEdit()
                                  const nextCol = e.shiftKey ? col - 1 : col + 1
                                  if (nextCol >= 0 && nextCol < totalCols) {
                                    setSelectedCell({ row, col: nextCol })
                                    setTimeout(() => startEdit(row, nextCol), 0)
                                  }
                                }
                                e.stopPropagation()
                              }}
                            />
                          ) : (
                            <span className="block truncate">{cellValue}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
              {bottomPadding > 0 && (
                <tr>
                  <td
                    colSpan={totalCols + 1}
                    style={{ height: bottomPadding, padding: 0, border: 'none' }}
                  />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[160px] rounded border border-[var(--vscode-menu-border)] bg-[var(--vscode-menu-background)] py-1 text-xs shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {(!frozenHeader || contextMenu.row > 0) && !readOnly && (
            <button
              className="block w-full px-3 py-1 text-left text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]"
              onClick={() => {
                startEdit(contextMenu.row, contextMenu.col)
                setContextMenu(null)
              }}
            >
              编辑单元格
            </button>
          )}
          <button
            className="block w-full px-3 py-1 text-left text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]"
            onClick={() => {
              toggleSort(contextMenu.col)
              setContextMenu(null)
            }}
          >
            {sortConfig.col === contextMenu.col && sortConfig.dir === 'asc' ? '降序排序' : '升序排序'}
          </button>
          {!readOnly && (
            <>
              <div className="my-1 h-px bg-[var(--vscode-menu-border)]" />
              <button
                className="block w-full px-3 py-1 text-left text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]"
                onClick={() => {
                  addRow(contextMenu.row)
                  setContextMenu(null)
                }}
              >
                在下方插入行
              </button>
              <button
                className="block w-full px-3 py-1 text-left text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)] disabled:opacity-40"
                disabled={data.length <= 1}
                onClick={() => {
                  deleteRow(contextMenu.row)
                  setContextMenu(null)
                }}
              >
                删除行
              </button>
              <div className="my-1 h-px bg-[var(--vscode-menu-border)]" />
              <button
                className="block w-full px-3 py-1 text-left text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)]"
                onClick={() => {
                  addColumn(contextMenu.col)
                  setContextMenu(null)
                }}
              >
                在右侧插入列
              </button>
              <button
                className="block w-full px-3 py-1 text-left text-[var(--vscode-menu-foreground)] hover:bg-[var(--vscode-menu-selectionBackground)] hover:text-[var(--vscode-menu-selectionForeground)] disabled:opacity-40"
                disabled={totalCols <= 1}
                onClick={() => {
                  deleteColumn(contextMenu.col)
                  setContextMenu(null)
                }}
              >
                删除列
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default CsvEditor
