import { useCallback, useEffect, useRef, useState } from 'react'

export type RuntimeState = 'idle' | 'starting' | 'running' | 'stopped' | 'failed'

export interface RuntimeSession {
  id: string
  language: string
  filePath: string
  cwd: string
  state: RuntimeState
  exitCode?: number
  durationMs?: number
  stdout: string
  stderr: string
}

export interface RuntimeDiagnostic {
  file: string
  line?: number
  column?: number
  message: string
  severity: 'error' | 'warning'
}

const RUNTIME_PREFIX = 'ide-runtime-'

function parsePythonTraceback(output: string): RuntimeDiagnostic[] {
  const diagnostics: RuntimeDiagnostic[] = []
  const lines = output.split('\n')
  let currentFile = ''
  let currentLine = 0

  for (let i = 0; i < lines.length; i++) {
    const fileMatch = lines[i].match(/File "([^"]+)", line (\d+)/)
    if (fileMatch) {
      currentFile = fileMatch[1]
      currentLine = parseInt(fileMatch[2], 10)
    }
    const errorMatch = lines[i].match(/^(\w+Error|Exception): (.+)$/)
    if (errorMatch && currentFile) {
      diagnostics.push({
        file: currentFile,
        line: currentLine,
        message: `${errorMatch[1]}: ${errorMatch[2]}`,
        severity: 'error'
      })
    }
  }
  return diagnostics
}

function parseNodeStack(output: string): RuntimeDiagnostic[] {
  const diagnostics: RuntimeDiagnostic[] = []
  const lines = output.split('\n')

  for (const line of lines) {
    const match = line.match(/at .* \(([^:]+):(\d+):(\d+)\)/)
    if (match) {
      diagnostics.push({
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        message: line.trim(),
        severity: 'error'
      })
    }
    const simpleMatch = line.match(/([^()\s]+\.(?:js|ts|jsx|tsx|mjs|cjs)):(\d+)/)
    if (simpleMatch && !diagnostics.some(d => d.file === simpleMatch[1] && d.line === parseInt(simpleMatch[2]))) {
      diagnostics.push({
        file: simpleMatch[1],
        line: parseInt(simpleMatch[2], 10),
        message: line.trim(),
        severity: 'error'
      })
    }
  }
  return diagnostics
}

export function useRuntime() {
  const [sessions, setSessions] = useState<Map<string, RuntimeSession>>(new Map())
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const terminalCleanupRef = useRef<Map<string, () => void>>(new Map())

  const appendOutput = useCallback((sessionId: string, type: 'stdout' | 'stderr', text: string) => {
    setSessions(prev => {
      const next = new Map(prev)
      const session = next.get(sessionId)
      if (!session) return prev
      const updated: RuntimeSession = {
        ...session,
        [type]: session[type] + text
      }
      next.set(sessionId, updated)
      return next
    })
  }, [])

  const setSessionState = useCallback((sessionId: string, state: RuntimeState, extra?: Partial<RuntimeSession>) => {
    setSessions(prev => {
      const next = new Map(prev)
      const session = next.get(sessionId)
      if (!session) return prev
      next.set(sessionId, { ...session, state, ...extra })
      return next
    })
  }, [])

  const runCode = useCallback(async (params: {
    language: 'python' | 'javascript' | 'typescript'
    filePath: string
    cwd: string
    args?: string[]
  }): Promise<string | null> => {
    const { language, filePath, cwd, args = [] } = params
    const sessionId = RUNTIME_PREFIX + Date.now() + '-' + Math.random().toString(36).slice(2, 8)

    let command = ''
    let cmdArgs: string[] = []

    if (language === 'python') {
      command = process.platform === 'win32' ? 'python' : 'python3'
      cmdArgs = [filePath, ...args]
    } else if (language === 'javascript') {
      command = process.platform === 'win32' ? 'node' : 'node'
      cmdArgs = [filePath, ...args]
    } else if (language === 'typescript') {
      command = process.platform === 'win32' ? 'npx' : 'npx'
      cmdArgs = ['--yes', 'tsx', filePath, ...args]
    } else {
      return null
    }

    const newSession: RuntimeSession = {
      id: sessionId,
      language,
      filePath,
      cwd,
      state: 'starting',
      stdout: '',
      stderr: ''
    }

    setSessions(prev => {
      const next = new Map(prev)
      next.set(sessionId, newSession)
      return next
    })
    setActiveSessionId(sessionId)

    const startTime = Date.now()

    try {
      const hermes = (window as any).hermesDesktop
      if (!hermes?.terminal?.start) {
        setSessionState(sessionId, 'failed', { exitCode: -1, stderr: '终端服务不可用', durationMs: Date.now() - startTime })
        return sessionId
      }

      const termId = await hermes.terminal.start({
        cwd,
        command,
        args: cmdArgs,
        shell: false
      })

      setSessionState(sessionId, 'running')

      const cleanupData = hermes.terminal.onData(termId, (data: string) => {
        appendOutput(sessionId, 'stdout', data)
      })

      const cleanupExit = hermes.terminal.onExit(termId, (payload: { code: number | null }) => {
        const durationMs = Date.now() - startTime
        const exitCode = payload?.code ?? -1
        setSessions(prev => {
          const next = new Map(prev)
          const session = next.get(sessionId)
          if (!session) return prev

          const combined = session.stdout + session.stderr
          let diagnostics: RuntimeDiagnostic[] = []
          if (exitCode !== 0) {
            if (language === 'python') {
              diagnostics = parsePythonTraceback(combined)
            } else {
              diagnostics = parseNodeStack(combined)
            }
          }

          next.set(sessionId, {
            ...session,
            state: exitCode === 0 ? 'stopped' : 'failed',
            exitCode,
            durationMs
          })
          return next
        })

        void hermes.terminal.dispose(termId)
      })

      terminalCleanupRef.current.set(sessionId, () => {
        cleanupData?.()
        cleanupExit?.()
      })

      return sessionId
    } catch (e) {
      setSessionState(sessionId, 'failed', {
        exitCode: -1,
        stderr: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - startTime
      })
      return sessionId
    }
  }, [appendOutput, setSessionState])

  const stopSession = useCallback(async (sessionId: string) => {
    const session = sessions.get(sessionId)
    if (!session || session.state !== 'running') return

    setSessionState(sessionId, 'stopped', { exitCode: -1 })
  }, [sessions, setSessionState])

  const getDiagnostics = useCallback((sessionId: string): RuntimeDiagnostic[] => {
    const session = sessions.get(sessionId)
    if (!session) return []

    if (session.language === 'python') {
      return parsePythonTraceback(session.stdout + session.stderr)
    }
    return parseNodeStack(session.stdout + session.stderr)
  }, [sessions])

  const clearSession = useCallback((sessionId: string) => {
    const cleanup = terminalCleanupRef.current.get(sessionId)
    cleanup?.()
    terminalCleanupRef.current.delete(sessionId)
    setSessions(prev => {
      const next = new Map(prev)
      next.delete(sessionId)
      return next
    })
    if (activeSessionId === sessionId) {
      setActiveSessionId(null)
    }
  }, [activeSessionId])

  useEffect(() => {
    return () => {
      terminalCleanupRef.current.forEach(cleanup => cleanup())
      terminalCleanupRef.current.clear()
    }
  }, [])

  const activeSession = activeSessionId ? sessions.get(activeSessionId) : null

  return {
    sessions,
    activeSessionId,
    activeSession,
    runCode,
    stopSession,
    getDiagnostics,
    clearSession,
    setActiveSessionId
  }
}
