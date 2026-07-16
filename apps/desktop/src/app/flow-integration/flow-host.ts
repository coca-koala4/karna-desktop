import { spawn, ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { getAvailablePort } from './port-utils'
import { randomBytes } from 'crypto'

export interface FlowStudioSession {
  id: string
  port: number
  token: string
  workspaceId: string
  workflowId: string
  url: string
  status: 'starting' | 'running' | 'stopped' | 'error'
  startedAt: Date
  childProcess?: ChildProcess
}

let activeSession: FlowStudioSession | null = null
let sessionCounter = 0

const FLOW_STUDIO_DIR = join(__dirname, '..', '..', '..', '..', 'karna-flow-studio')
const SERVER_ENTRY = join(FLOW_STUDIO_DIR, 'server', 'index.mjs')

export function isFlowStudioInstalled(): boolean {
  return existsSync(SERVER_ENTRY)
}

export function getFlowStudioPath(): string {
  return FLOW_STUDIO_DIR
}

function generateToken(): string {
  return randomBytes(24).toString('hex')
}

function generateWorkflowId(): string {
  return `wf_${Date.now()}_${(++sessionCounter).toString(36)}`
}

export async function startFlowStudio(options: {
  workspaceId: string
  workflowId?: string
  mode?: 'browser' | 'iframe'
  karnaUrl?: string
}): Promise<FlowStudioSession> {
  if (activeSession && activeSession.status === 'running') {
    return activeSession
  }

  const port = await getAvailablePort(8765, 8900)
  const token = generateToken()
  const workflowId = options.workflowId || generateWorkflowId()

  const session: FlowStudioSession = {
    id: `session_${Date.now()}`,
    port,
    token,
    workspaceId: options.workspaceId,
    workflowId,
    url: `http://127.0.0.1:${port}/studio?token=${token}`,
    status: 'starting',
    startedAt: new Date()
  }

  if (!existsSync(SERVER_ENTRY)) {
    throw new Error(`Flow Studio server not found at ${SERVER_ENTRY}. Please ensure karna-flow-studio is properly installed.`)
  }

  const nodeCommand = process.platform === 'win32' ? 'node.exe' : 'node'
  const args = [
    SERVER_ENTRY,
    '--port', String(port),
    '--token', token,
    '--workspace-id', options.workspaceId,
    '--workflow-id', workflowId
  ]

  if (options.karnaUrl) {
    args.push('--karna-url', options.karnaUrl)
  }

  if (options.mode === 'iframe') {
    args.push('--dev')
  }

  try {
    const child = spawn(nodeCommand, args, {
      cwd: join(FLOW_STUDIO_DIR, 'server'),
      env: {
        ...process.env,
        NODE_ENV: options.mode === 'iframe' ? 'development' : 'production',
        FLOW_STUDIO_TOKEN: token
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })

    session.childProcess = child

    child.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      console.log(`[Flow Studio] ${text.trim()}`)
      if (text.includes('Listening on') || text.includes('started')) {
        session.status = 'running'
      }
    })

    child.stderr?.on('data', (data: Buffer) => {
      console.error(`[Flow Studio Error] ${data.toString().trim()}`)
    })

    child.on('close', (code) => {
      console.log(`[Flow Studio] Process exited with code ${code}`)
      session.status = code === 0 ? 'stopped' : 'error'
      if (activeSession?.id === session.id) {
        activeSession = null
      }
    })

    child.on('error', (err) => {
      console.error('[Flow Studio] Failed to start:', err)
      session.status = 'error'
    })

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Flow Studio failed to start within 15 seconds'))
      }, 15000)

      const check = setInterval(() => {
        if (session.status === 'running') {
          clearInterval(check)
          clearTimeout(timeout)
          resolve()
        }
      }, 200)

      setTimeout(() => {
        session.status = 'running'
        clearInterval(check)
        clearTimeout(timeout)
        resolve()
      }, 2000)
    })

    activeSession = session
    return session
  } catch (err) {
    session.status = 'error'
    throw err
  }
}

export async function stopFlowStudio(): Promise<void> {
  if (!activeSession) return

  return new Promise((resolve) => {
    if (activeSession?.childProcess) {
      activeSession.childProcess.kill('SIGTERM')
      const forceKill = setTimeout(() => {
        activeSession?.childProcess?.kill('SIGKILL')
      }, 5000)
      activeSession.childProcess.on('close', () => {
        clearTimeout(forceKill)
        activeSession = null
        resolve()
      })
    } else {
      activeSession = null
      resolve()
    }
  })
}

export function getActiveSession(): FlowStudioSession | null {
  return activeSession
}

export function openInBrowser(session: FlowStudioSession): void {
  const { shell } = require('electron')
  shell.openExternal(session.url)
}
