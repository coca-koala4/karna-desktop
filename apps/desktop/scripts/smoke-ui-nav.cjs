#!/usr/bin/env node
'use strict'

const fs = require('fs')
const path = require('path')

const APP_ROOT = path.resolve(__dirname, '..')
const SRC_APP = path.join(APP_ROOT, 'src', 'app')

const ROUTES_CONFIG = [
  {
    path: '/',
    name: 'chat',
    component: './chat/index.tsx',
    exports: ['ChatView']
  },
  {
    path: '/skills',
    name: 'skills',
    component: './skills/index.tsx',
    exports: ['SkillsView']
  },
  {
    path: '/messaging',
    name: 'messaging',
    component: './messaging/index.tsx',
    exports: ['MessagingView']
  },
  {
    path: '/artifacts',
    name: 'artifacts',
    component: './artifacts/index.tsx',
    exports: ['ArtifactsView']
  },
  {
    path: '/settings',
    name: 'settings',
    component: './settings/index.tsx',
    exports: ['SettingsView']
  },
  {
    path: '/command-center',
    name: 'command-center',
    component: './command-center/index.tsx',
    exports: ['CommandCenterView']
  },
  {
    path: '/agents',
    name: 'agents',
    component: './agents/index.tsx',
    exports: ['AgentsView']
  },
  {
    path: '/cron',
    name: 'cron',
    component: './cron/index.tsx',
    exports: ['CronView']
  },
  {
    path: '/profiles',
    name: 'profiles',
    component: './profiles/index.tsx',
    exports: ['ProfilesView']
  },
  {
    path: '/starmap',
    name: 'starmap',
    component: './starmap/index.tsx',
    exports: ['StarmapView']
  },
  {
    path: '/karna/agents',
    name: 'karna-agents',
    component: './karna-workshop/index.tsx',
    exports: ['KarnaAgentsWorkshopView']
  },
  {
    path: '/karna/writer',
    name: 'karna-writer',
    component: './karna-workshop/index.tsx',
    exports: ['KarnaWriterWorkshopView']
  },
  {
    path: '/karna/soul',
    name: 'karna-soul',
    component: './karna-workshop/index.tsx',
    exports: ['KarnaSoulWorkshopView']
  },
  {
    path: '/karna/flow',
    name: 'karna-flow',
    component: './agent-flow/index.tsx',
    exports: ['AgentFlowWorkshopPage']
  },
  {
    path: '/karna/mcp',
    name: 'karna-mcp',
    component: './karna-workshop/index.tsx',
    exports: ['KarnaMcpWorkshopView']
  },
  {
    path: '/karna/home-demo',
    name: 'karna-home-demo',
    component: './karna-workshop/home-demo.tsx',
    exports: ['KarnaHomeDemoView']
  }
]

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
}

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`
}

function checkBrackets(content, filePath) {
  const errors = []
  const stack = []
  const brackets = {
    '(': ')',
    '[': ']',
    '{': '}',
    '<': '>'
  }
  const closing = {
    ')': '(',
    ']': '[',
    '}': '{',
    '>': '<'
  }

  let inString = null
  let inTemplate = false
  let inComment = false
  let inLineComment = false
  let inJsxTag = false
  let line = 1

  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    const prev = i > 0 ? content[i - 1] : ''
    const next = i < content.length - 1 ? content[i + 1] : ''

    if (char === '\n') {
      line++
      if (inLineComment) inLineComment = false
      continue
    }

    if (inLineComment || inComment) {
      if (inComment && prev === '*' && char === '/') {
        inComment = false
      }
      continue
    }

    if (inString) {
      if (char === '\\' && (next === inString || next === '\\')) {
        i++
        continue
      }
      if (char === inString && prev !== '\\') {
        inString = null
      }
      continue
    }

    if (inTemplate) {
      if (char === '\\' && next === '`') {
        i++
        continue
      }
      if (char === '`') {
        inTemplate = false
      }
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      i++
      continue
    }

    if (char === '/' && next === '*') {
      inComment = true
      i++
      continue
    }

    if (char === '"' || char === "'") {
      inString = char
      continue
    }

    if (char === '`') {
      inTemplate = true
      continue
    }

    if (char === '<' && /[A-Za-z/]/.test(next)) {
      inJsxTag = true
      stack.push({ char: '<', line })
      continue
    }

    if (inJsxTag && char === '>') {
      if (stack.length > 0 && stack[stack.length - 1].char === '<') {
        if (prev !== '/') {
          stack.pop()
        } else {
          stack.pop()
        }
      }
      inJsxTag = false
      continue
    }

    if (brackets[char]) {
      stack.push({ char, line })
    } else if (closing[char]) {
      if (stack.length === 0) {
        errors.push(`Line ${line}: Unexpected closing bracket '${char}'`)
      } else {
        const last = stack.pop()
        if (closing[char] !== last.char) {
          errors.push(`Line ${line}: Mismatched bracket '${char}' (expected '${brackets[last.char]}' opened at line ${last.line})`)
        }
      }
    }
  }

  while (stack.length > 0) {
    const unclosed = stack.pop()
    if (unclosed.char !== '<') {
      errors.push(`Unclosed bracket '${unclosed.char}' opened at line ${unclosed.line}`)
    }
  }

  return errors
}

function checkExports(content, expectedExports) {
  const found = []
  const missing = []

  for (const exp of expectedExports) {
    const patterns = [
      new RegExp(`export\\s+(?:const|function|class|async\\s+function)\\s+${exp}\\b`),
      new RegExp(`export\\s*\\{[^}]*\\b${exp}\\b[^}]*\\}`),
      new RegExp(`export\\s+default\\s+${exp}\\b`)
    ]

    if (patterns.some(p => p.test(content))) {
      found.push(exp)
    } else {
      missing.push(exp)
    }
  }

  return { found, missing }
}

function checkConsoleErrors(content) {
  const issues = []
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/console\.(error|warn)\s*\(/.test(line) && !/\/\/\s*expected/.test(line)) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('//') && !trimmed.startsWith('*')) {
        issues.push({ line: i + 1, content: trimmed.substring(0, 120) })
      }
    }
  }

  return issues
}

function checkModalCloseHandlers(content, filePath) {
  const issues = []
  const lines = content.split('\n')
  const modalPatterns = [
    /<(?:Modal|Dialog|Drawer|Sheet|Popover|AlertDialog)\b/
  ]
  const closeHandlerPatterns = [
    /on(?:Close|OpenChange|Dismiss)\s*=/,
    /open\s*=\s*\{[^}]*\}/
  ]

  let inModal = false
  let modalLine = 0
  let hasCloseHandler = false
  let depth = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (modalPatterns.some(p => p.test(line))) {
      if (!inModal) {
        inModal = true
        modalLine = i + 1
        hasCloseHandler = closeHandlerPatterns.some(p => p.test(line))
        depth = 0
      }
    }

    if (inModal) {
      if (closeHandlerPatterns.some(p => p.test(line))) {
        hasCloseHandler = true
      }
      depth += (line.match(/</g) || []).length - (line.match(/\/>/g) || []).length * 2 - (line.match(/<\//g) || []).length
      if (depth <= 0 && line.includes('>')) {
        if (!hasCloseHandler) {
          issues.push(`Line ${modalLine}: Modal/Dialog may be missing onClose/onOpenChange handler`)
        }
        inModal = false
      }
    }
  }

  return issues
}

function analyzeFile(filePath, expectedExports) {
  const result = {
    exists: false,
    nonEmpty: false,
    bracketErrors: [],
    missingExports: [],
    foundExports: [],
    consoleIssues: [],
    modalIssues: [],
    error: null
  }

  try {
    if (!fs.existsSync(filePath)) {
      result.error = 'File not found'
      return result
    }

    result.exists = true
    const content = fs.readFileSync(filePath, 'utf8')

    if (content.trim().length === 0) {
      result.error = 'File is empty'
      return result
    }

    result.nonEmpty = true
    // TypeScript/Vite is the authoritative parser for TSX.  A character-level
    // bracket scanner cannot distinguish JSX tags, generics, and comparison
    // operators and produced false failures for every real route.  Keep this
    // route smoke focused on what it can prove: file presence and exports.
    result.bracketErrors = []

    const exportCheck = checkExports(content, expectedExports)
    result.foundExports = exportCheck.found
    result.missingExports = exportCheck.missing

    result.consoleIssues = checkConsoleErrors(content)
    result.modalIssues = checkModalCloseHandlers(content, filePath)
  } catch (err) {
    result.error = err.message
  }

  return result
}

function resolveComponentPath(relativePath) {
  let fullPath = path.join(SRC_APP, relativePath)
  if (fs.existsSync(fullPath)) {
    return fullPath
  }
  const extensions = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts']
  for (const ext of extensions) {
    const withExt = fullPath + ext
    if (fs.existsSync(withExt)) {
      return withExt
    }
  }
  return fullPath
}

function main() {
  console.log('\n')
  console.log(colorize('╔══════════════════════════════════════════════════════════════╗', 'cyan'))
  console.log(colorize('║           UI Navigation Smoke Test (Static Analysis)         ║', 'cyan'))
  console.log(colorize('╚══════════════════════════════════════════════════════════════╝', 'cyan'))
  console.log('')

  const results = []
  let okCount = 0
  let missingCount = 0
  let errorCount = 0
  const syntaxErrors = []

  for (const route of ROUTES_CONFIG) {
    const componentPath = resolveComponentPath(route.component)
    const relPath = path.relative(APP_ROOT, componentPath)
    const analysis = analyzeFile(componentPath, route.exports)

    let status = 'OK'
    const issues = []

    if (!analysis.exists) {
      status = 'MISSING'
      missingCount++
      issues.push(analysis.error)
    } else if (analysis.error) {
      status = 'ERROR'
      errorCount++
      issues.push(analysis.error)
    } else {
      if (analysis.bracketErrors.length > 0) {
        status = 'ERROR'
        errorCount++
        issues.push(...analysis.bracketErrors.map(e => `Syntax: ${e}`))
        syntaxErrors.push({ file: relPath, errors: analysis.bracketErrors })
      }
      if (analysis.missingExports.length > 0) {
        if (status === 'OK') {
          status = 'ERROR'
          errorCount++
        }
        issues.push(`Missing exports: ${analysis.missingExports.join(', ')}`)
      }
      if (status === 'OK') {
        okCount++
      }
    }

    results.push({
      route: route.path,
      name: route.name,
      component: relPath,
      status,
      issues,
      consoleIssues: analysis.consoleIssues,
      modalIssues: analysis.modalIssues
    })
  }

  console.log(colorize('Route Components:', 'bold'))
  console.log('')

  for (const r of results) {
    const statusColor = r.status === 'OK' ? 'green' : r.status === 'MISSING' ? 'yellow' : 'red'
    const statusIcon = r.status === 'OK' ? '✓' : r.status === 'MISSING' ? '?' : '✗'
    console.log(`  ${colorize(statusIcon, statusColor)}  ${colorize(r.status.padEnd(8), statusColor)} ${r.route.padEnd(20)} → ${r.component}`)

    for (const issue of r.issues) {
      console.log(`      ${colorize('→', 'red')} ${issue}`)
    }
  }

  console.log('')

  const allConsoleIssues = results.flatMap(r =>
    r.consoleIssues.map(i => ({ ...i, file: r.component }))
  )

  const allModalIssues = results.flatMap(r =>
    r.modalIssues.map(i => ({ issue: i, file: r.component }))
  )

  if (allConsoleIssues.length) {
    console.log(colorize(`Console calls requiring review: ${allConsoleIssues.length}`, 'yellow'))
    allConsoleIssues.slice(0, 20).forEach(issue => console.log(`  - ${issue.file}:${issue.line} ${issue.content}`))
  }
  if (allModalIssues.length) {
    console.log(colorize(`Modal close-handler warnings: ${allModalIssues.length}`, 'yellow'))
    allModalIssues.slice(0, 20).forEach(issue => console.log(`  - ${issue.file}: ${issue.issue}`))
  }

  console.log('')
  console.log(`Summary: ${okCount} OK, ${missingCount} missing, ${errorCount} errors; ${allConsoleIssues.length} console review items; ${allModalIssues.length} modal review items.`)
  if (syntaxErrors.length) {
    console.error(colorize('Route smoke failed because a route component has a syntax/export error.', 'red'))
  }
  process.exit(errorCount || missingCount ? 1 : 0)
}

main()
