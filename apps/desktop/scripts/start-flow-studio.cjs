'use strict'

const { spawn } = require('node:child_process')
const net = require('node:net')
const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')

const DESKTOP_ROOT = path.resolve(__dirname, '..')
const FLOW_STUDIO_ROOT = path.resolve(DESKTOP_ROOT, '..', '..', '..', 'karna-flow-studio')
const FLOW_STUDIO_SERVER_DIR = path.join(FLOW_STUDIO_ROOT, 'server')
const DESKTOP_SERVER_DIR = path.join(DESKTOP_ROOT, 'electron', 'flow-studio-server')
const DESKTOP_PUBLIC_DIR = path.join(DESKTOP_ROOT, 'public', 'karna-flow-studio')

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgMagenta: '\x1b[45m'
}

function log(level, message) {
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  let color = COLORS.white
  let prefix = 'INFO'

  switch (level) {
    case 'start':
      color = COLORS.bgGreen + COLORS.bright
      prefix = 'START'
      break
    case 'success':
      color = COLORS.green
      prefix = ' OK '
      break
    case 'warn':
      color = COLORS.yellow
      prefix = 'WARN'
      break
    case 'error':
      color = COLORS.red + COLORS.bright
      prefix = 'ERR '
      break
    case 'info':
      color = COLORS.cyan
      prefix = 'INFO'
      break
  }

  console.log(`${COLORS.dim}[${timestamp}]${COLORS.reset} ${color}[${prefix}]${COLORS.reset} ${message}`)
}

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

function checkBuildStatus() {
  const frontendBuilt = fs.existsSync(path.join(DESKTOP_PUBLIC_DIR, 'index.html'))
  const serverBuilt = fs.existsSync(path.join(DESKTOP_SERVER_DIR, 'index.mjs'))
  const sourceServerExists = fs.existsSync(path.join(FLOW_STUDIO_SERVER_DIR, 'index.mjs'))

  return {
    frontendBuilt,
    serverBuilt,
    sourceServerExists,
    usable: frontendBuilt && (serverBuilt || sourceServerExists)
  }
}

function getServerDir() {
  if (fs.existsSync(path.join(DESKTOP_SERVER_DIR, 'index.mjs'))) {
    return DESKTOP_SERVER_DIR
  }
  return FLOW_STUDIO_SERVER_DIR
}

function healthCheck(port, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
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

async function startFlowStudio(options = {}) {
  const {
    workspaceId = null,
    workflowId = null,
    karnaUrl = null,
    autoOpen = false,
    preferredPort = 0
  } = options

  console.log()
  console.log(`${COLORS.bgMagenta}${COLORS.bright}                                                              ${COLORS.reset}`)
  console.log(`${COLORS.bgMagenta}${COLORS.bright}       Karna Flow Studio - Startup Utility                   ${COLORS.reset}`)
  console.log(`${COLORS.bgMagenta}${COLORS.bright}                                                              ${COLORS.reset}`)
  console.log()

  const buildStatus = checkBuildStatus()
  log('info', 'Checking build status...')

  if (!buildStatus.frontendBuilt) {
    log('warn', 'Frontend not built!')
    log('info', 'Run: npm run flow-studio:build')
  } else {
    log('success', 'Frontend: built')
  }

  if (!buildStatus.serverBuilt) {
    if (buildStatus.sourceServerExists) {
      log('warn', 'Server not synced, using source server')
    } else {
      log('error', 'Server not found!')
      log('info', 'Run: npm run flow-studio:build')
      process.exit(1)
    }
  } else {
    log('success', 'Server: built')
  }

  if (!buildStatus.usable) {
    console.log()
    log('error', 'Flow Studio is not properly built.')
    log('info', 'Please run: npm run flow-studio:build')
    console.log()
    process.exit(1)
  }

  console.log()
  log('start', 'Starting Flow Studio...')

  const port = await findAvailablePort(preferredPort)
  const token = generateToken()
  const serverDir = getServerDir()
  const staticDir = DESKTOP_PUBLIC_DIR

  log('info', `Port: ${port}`)
  log('info', `Token: ${token.substring(0, 16)}...`)
  log('info', `Server dir: ${serverDir}`)
  log('info', `Static dir: ${staticDir}`)
  console.log()

  const args = [
    path.join(serverDir, 'index.mjs'),
    '--port', String(port),
    '--token', token,
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

  const child = spawn(process.execPath, args, {
    cwd: serverDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env }
  })

  child.stdout.on('data', (data) => {
    console.log(`${COLORS.dim}[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}]${COLORS.reset} ${COLORS.green}[SERVER]${COLORS.reset} ${data.toString().trim()}`)
  })

  child.stderr.on('data', (data) => {
    console.log(`${COLORS.dim}[${new Date().toLocaleTimeString('zh-CN', { hour12: false })}]${COLORS.reset} ${COLORS.red}[SERVER]${COLORS.reset} ${data.toString().trim()}`)
  })

  child.on('exit', (code, signal) => {
    console.log()
    log('warn', `Flow Studio exited (code=${code}, signal=${signal})`)
    console.log()
    process.exit(code || 0)
  })

  let ready = false
  const checkInterval = setInterval(async () => {
    const healthy = await healthCheck(port)
    if (healthy && !ready) {
      ready = true
      clearInterval(checkInterval)

      const url = `http://127.0.0.1:${port}/?token=${token}`
      console.log()
      console.log(`${COLORS.bgGreen}${COLORS.bright}                                                              ${COLORS.reset}`)
      console.log(`${COLORS.bgGreen}${COLORS.bright}                Flow Studio is Running!                      ${COLORS.reset}`)
      console.log(`${COLORS.bgGreen}${COLORS.bright}                                                              ${COLORS.reset}`)
      console.log()
      log('success', `URL: ${url}`)
      log('info', `Press Ctrl+C to stop`)
      console.log()

      if (autoOpen) {
        const { exec } = require('node:child_process')
        const openCmd = process.platform === 'win32'
          ? `start "" "${url}"`
          : process.platform === 'darwin'
            ? `open "${url}"`
            : `xdg-open "${url}"`
        exec(openCmd, (err) => {
          if (err) {
            log('warn', `Could not open browser: ${err.message}`)
          }
        })
      }
    }
  }, 500)

  setTimeout(() => {
    if (!ready) {
      clearInterval(checkInterval)
      log('error', 'Flow Studio startup timeout')
      child.kill('SIGTERM')
      process.exit(1)
    }
  }, 15000)

  process.on('SIGINT', () => {
    console.log()
    log('warn', 'Stopping Flow Studio...')
    child.kill('SIGTERM')
    setTimeout(() => process.exit(0), 1000)
  })

  process.on('SIGTERM', () => {
    child.kill('SIGTERM')
    setTimeout(() => process.exit(0), 1000)
  })
}

function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    autoOpen: false,
    preferredPort: 0,
    workspaceId: null,
    workflowId: null,
    karnaUrl: null
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--open':
      case '-o':
        options.autoOpen = true
        break
      case '--port':
      case '-p':
        options.preferredPort = parseInt(args[++i], 10) || 0
        break
      case '--workspace-id':
        options.workspaceId = args[++i]
        break
      case '--workflow-id':
        options.workflowId = args[++i]
        break
      case '--karna-url':
        options.karnaUrl = args[++i]
        break
      case '--help':
      case '-h':
        console.log(`
Karna Flow Studio Starter

Usage: node scripts/start-flow-studio.cjs [options]

Options:
  -o, --open               Open browser automatically
  -p, --port <port>        Preferred port (default: random)
      --workspace-id <id>  Workspace ID
      --workflow-id <id>   Initial workflow ID
      --karna-url <url>    Karna backend URL
  -h, --help               Show this help message
`)
        process.exit(0)
    }
  }

  return options
}

if (require.main === module) {
  const options = parseArgs()
  startFlowStudio(options).catch(err => {
    console.error(err)
    process.exit(1)
  })
}

module.exports = {
  startFlowStudio,
  checkBuildStatus,
  findAvailablePort,
  generateToken,
  healthCheck
}
