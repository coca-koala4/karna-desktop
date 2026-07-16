'use strict'

const { spawn } = require('node:child_process')
const net = require('node:net')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')

const APP_ROOT = path.resolve(__dirname, '..')
const FLOW_STUDIO_SERVER_DIR = path.join(APP_ROOT, 'electron', 'flow-studio-server')
const FLOW_STUDIO_PUBLIC_DIR = path.join(APP_ROOT, 'public', 'karna-flow-studio')
const FALLBACK_SERVER_DIR = path.resolve(APP_ROOT, '..', '..', '..', 'karna-flow-studio', 'server')

const HEALTH_CHECK_INTERVAL_MS = 2000
const STARTUP_TIMEOUT_MS = 15000

let flowStudioProcess = null
let flowStudioPort = 0
let flowStudioToken = null
let flowStudioReady = false
let healthCheckInterval = null
let lastActivityAt = 0

function findAvailablePort(preferredPort = 0) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on('error', reject)
    server.listen(preferredPort, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => resolve(port))
    })
  })
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex')
}

function healthCheck(port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = net.connect({ port, host: '127.0.0.1' }, () => {
      req.end()
      resolve(true)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      resolve(false)
    })
  })
}

function getServerDir() {
  if (fs.existsSync(path.join(FLOW_STUDIO_SERVER_DIR, 'index.mjs'))) {
    return FLOW_STUDIO_SERVER_DIR
  }
  if (fs.existsSync(path.join(FALLBACK_SERVER_DIR, 'index.mjs'))) {
    return FALLBACK_SERVER_DIR
  }
  return null
}

function getStaticDir() {
  if (fs.existsSync(path.join(FLOW_STUDIO_PUBLIC_DIR, 'index.html'))) {
    return FLOW_STUDIO_PUBLIC_DIR
  }
  return null
}

function isFlowStudioRunning() {
  return flowStudioProcess !== null && !flowStudioProcess.killed
}

function getFlowStudioUrl() {
  if (!isFlowStudioRunning() || !flowStudioPort) return null
  return `http://127.0.0.1:${flowStudioPort}/?token=${flowStudioToken}`
}

function getFlowStudioStatus() {
  return {
    running: isFlowStudioRunning(),
    ready: flowStudioReady,
    port: flowStudioPort,
    url: getFlowStudioUrl(),
    token: flowStudioToken ? `${flowStudioToken.substring(0, 8)}...` : null,
    lastActivityAt: lastActivityAt || null,
    serverDir: getServerDir(),
    staticDir: getStaticDir()
  }
}

function startHealthChecks() {
  stopHealthChecks()
  healthCheckInterval = setInterval(async () => {
    if (!isFlowStudioRunning()) {
      stopHealthChecks()
      return
    }
    const healthy = await healthCheck(flowStudioPort)
    if (healthy) {
      lastActivityAt = Date.now()
    }
  }, HEALTH_CHECK_INTERVAL_MS)
}

function stopHealthChecks() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval)
    healthCheckInterval = null
  }
}

async function startFlowStudio(options = {}) {
  const {
    workspaceId = null,
    workflowId = null,
    karnaUrl = null,
    preferredPort = 0,
    onLog = null,
    onReady = null,
    onError = null,
    onExit = null
  } = options

  if (isFlowStudioRunning()) {
    return {
      success: true,
      alreadyRunning: true,
      port: flowStudioPort,
      url: getFlowStudioUrl(),
      token: flowStudioToken
    }
  }

  const serverDir = getServerDir()
  if (!serverDir) {
    return {
      success: false,
      error: 'Flow Studio server not found',
      details: `Checked: ${FLOW_STUDIO_SERVER_DIR}, ${FALLBACK_SERVER_DIR}`
    }
  }

  const staticDir = getStaticDir()
  if (!staticDir) {
    return {
      success: false,
      error: 'Flow Studio frontend not found. Run flow-studio:sync first.',
      details: `Expected: ${FLOW_STUDIO_PUBLIC_DIR}`
    }
  }

  try {
    flowStudioPort = await findAvailablePort(preferredPort)
    flowStudioToken = generateToken()
    flowStudioReady = false
    lastActivityAt = Date.now()

    const args = [
      path.join(serverDir, 'index.mjs'),
      '--port', String(flowStudioPort),
      '--token', flowStudioToken,
      '--static-dir', staticDir
    ]

    if (workspaceId) {
      args.push('--workspace-id', workspaceId)
    }
    if (workflowId) {
      args.push('--workflow-id', workflowId)
    }
    if (karnaUrl) {
      args.push('--karna-url', karnaUrl)
    }

    flowStudioProcess = spawn(process.execPath, args, {
      cwd: serverDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
      windowsHide: true
    })

    flowStudioProcess.stdout.on('data', (data) => {
      const text = data.toString().trim()
      if (onLog) onLog('stdout', text)
    })

    flowStudioProcess.stderr.on('data', (data) => {
      const text = data.toString().trim()
      if (onLog) onLog('stderr', text)
    })

    flowStudioProcess.on('exit', (code, signal) => {
      if (onExit) onExit(code, signal)
      flowStudioReady = false
      stopHealthChecks()
      flowStudioProcess = null
    })

    flowStudioProcess.on('error', (err) => {
      if (onError) onError(err)
      flowStudioProcess = null
      flowStudioReady = false
      stopHealthChecks()
    })

    const startTime = Date.now()
    const waitForReady = () => new Promise((resolve) => {
      const check = async () => {
        if (!isFlowStudioRunning()) {
          resolve(false)
          return
        }
        const healthy = await healthCheck(flowStudioPort)
        if (healthy) {
          flowStudioReady = true
          startHealthChecks()
          if (onReady) onReady()
          resolve(true)
          return
        }
        if (Date.now() - startTime > STARTUP_TIMEOUT_MS) {
          resolve(false)
          return
        }
        setTimeout(check, 300)
      }
      check()
    })

    const ready = await waitForReady()

    if (!ready) {
      if (flowStudioProcess) {
        flowStudioProcess.kill('SIGTERM')
        flowStudioProcess = null
      }
      flowStudioReady = false
      return {
        success: false,
        error: 'Flow Studio startup timeout'
      }
    }

    return {
      success: true,
      alreadyRunning: false,
      port: flowStudioPort,
      url: getFlowStudioUrl(),
      token: flowStudioToken
    }
  } catch (err) {
    if (flowStudioProcess) {
      flowStudioProcess.kill('SIGTERM')
      flowStudioProcess = null
    }
    flowStudioReady = false
    return {
      success: false,
      error: err.message
    }
  }
}

async function stopFlowStudio() {
  if (!isFlowStudioRunning()) {
    return { success: true, alreadyStopped: true }
  }

  stopHealthChecks()
  flowStudioReady = false

  return new Promise((resolve) => {
    let resolved = false

    const timeout = setTimeout(() => {
      if (resolved) return
      resolved = true
      if (flowStudioProcess) {
        flowStudioProcess.kill('SIGKILL')
        flowStudioProcess = null
      }
      resolve({ success: true, forceKilled: true })
    }, 5000)

    flowStudioProcess.once('exit', () => {
      if (resolved) return
      resolved = true
      clearTimeout(timeout)
      flowStudioProcess = null
      flowStudioPort = 0
      flowStudioToken = null
      resolve({ success: true })
    })

    flowStudioProcess.kill('SIGTERM')
  })
}

async function restartFlowStudio(options = {}) {
  await stopFlowStudio()
  return startFlowStudio(options)
}

function isBuilt() {
  const hasServer = fs.existsSync(path.join(FLOW_STUDIO_SERVER_DIR, 'index.mjs'))
    || fs.existsSync(path.join(FALLBACK_SERVER_DIR, 'index.mjs'))
  const hasFrontend = fs.existsSync(path.join(FLOW_STUDIO_PUBLIC_DIR, 'index.html'))
  return hasServer && hasFrontend
}

module.exports = {
  startFlowStudio,
  stopFlowStudio,
  restartFlowStudio,
  getFlowStudioUrl,
  getFlowStudioStatus,
  isFlowStudioRunning,
  isBuilt,
  healthCheck,
  findAvailablePort,
  generateToken
}
