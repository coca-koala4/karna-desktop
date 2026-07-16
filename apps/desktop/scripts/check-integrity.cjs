'use strict'

const fs = require('node:fs')
const path = require('node:path')

const DESKTOP_ROOT = path.resolve(__dirname, '..')
const KARNA_DATA_ROOT = path.join(DESKTOP_ROOT, '..', '..', '..', 'karna-data')
const WORKFLOWS_DIR = path.join(KARNA_DATA_ROOT, 'workflows')

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
  bgRed: '\x1b[41m'
}

const SEVERITY = {
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
}

function log(level, message) {
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  let color = COLORS.white
  let prefix = 'INFO'

  switch (level) {
    case 'start':
      color = COLORS.bgBlue + COLORS.bright
      prefix = 'CHECK'
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
    case 'issue':
      color = COLORS.magenta
      prefix = 'ISSUE'
      break
  }

  console.log(`${COLORS.dim}[${timestamp}]${COLORS.reset} ${color}[${prefix}]${COLORS.reset} ${message}`)
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (err) {
    return { error: err.message }
  }
}

function isCredentialKey(key) {
  const credentialPatterns = [
    /api[_-]?key/i,
    /secret/i,
    /token/i,
    /password/i,
    /auth/i,
    /credential/i,
    /private[_-]?key/i,
    /access[_-]?key/i
  ]
  return credentialPatterns.some(pattern => pattern.test(key))
}

function findCredentialsInObject(obj, pathPrefix = '') {
  const credentials = []
  if (!obj || typeof obj !== 'object') return credentials

  for (const [key, value] of Object.entries(obj)) {
    const currentPath = pathPrefix ? `${pathPrefix}.${key}` : key
    if (isCredentialKey(key) && typeof value === 'string' && value.length > 0) {
      if (value !== '***' && value !== '••••••••' && !value.startsWith('{{')) {
        credentials.push({
          path: currentPath,
          key,
          value: value.slice(0, 4) + '...' + value.slice(-4),
          fullLength: value.length
        })
      }
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      credentials.push(...findCredentialsInObject(value, currentPath))
    }
  }
  return credentials
}

function validateWorkflowStructure(workflow, filePath) {
  const issues = []
  const fileName = path.basename(filePath)

  if (!workflow || typeof workflow !== 'object') {
    issues.push({
      severity: SEVERITY.ERROR,
      type: 'invalid_structure',
      message: 'Workflow is not a valid JSON object',
      file: fileName
    })
    return issues
  }

  if (!workflow.schemaVersion && !workflow.version) {
    issues.push({
      severity: SEVERITY.WARNING,
      type: 'missing_version',
      message: 'Missing schema version',
      file: fileName
    })
  }

  if (!workflow.name && !workflow.title) {
    issues.push({
      severity: SEVERITY.WARNING,
      type: 'missing_name',
      message: 'Workflow has no name',
      file: fileName
    })
  }

  if (!workflow.nodes || !Array.isArray(workflow.nodes)) {
    issues.push({
      severity: SEVERITY.ERROR,
      type: 'missing_nodes',
      message: 'Missing or invalid nodes array',
      file: fileName
    })
    return issues
  }

  const nodeIds = new Set()
  const nodeTypes = new Set()

  for (const node of workflow.nodes) {
    if (!node.id) {
      issues.push({
        severity: SEVERITY.ERROR,
        type: 'node_missing_id',
        message: 'Node without id found',
        file: fileName
      })
      continue
    }

    if (nodeIds.has(node.id)) {
      issues.push({
        severity: SEVERITY.ERROR,
        type: 'duplicate_node_id',
        message: `Duplicate node id: ${node.id}`,
        file: fileName,
        nodeId: node.id
      })
    }
    nodeIds.add(node.id)

    if (!node.type) {
      issues.push({
        severity: SEVERITY.ERROR,
        type: 'node_missing_type',
        message: `Node ${node.id} has no type`,
        file: fileName,
        nodeId: node.id
      })
    } else {
      nodeTypes.add(node.type)
    }

    if (node.config && typeof node.config === 'object') {
      const creds = findCredentialsInObject(node.config, `nodes[${node.id}].config`)
      for (const cred of creds) {
        issues.push({
          severity: SEVERITY.WARNING,
          type: 'stored_credential',
          message: `Potential credential stored in workflow: ${cred.path} (${cred.value})`,
          file: fileName,
          nodeId: node.id,
          credential: cred
        })
      }
    }
  }

  if (workflow.connections && Array.isArray(workflow.connections)) {
    for (const conn of workflow.connections) {
      if (!conn.id) {
        issues.push({
          severity: SEVERITY.WARNING,
          type: 'connection_missing_id',
          message: 'Connection without id found',
          file: fileName
        })
      }

      if (conn.sourceNode && !nodeIds.has(conn.sourceNode)) {
        issues.push({
          severity: SEVERITY.ERROR,
          type: 'invalid_source_node',
          message: `Connection references non-existent source node: ${conn.sourceNode}`,
          file: fileName,
          connectionId: conn.id
        })
      }

      if (conn.targetNode && !nodeIds.has(conn.targetNode)) {
        issues.push({
          severity: SEVERITY.ERROR,
          type: 'invalid_target_node',
          message: `Connection references non-existent target node: ${conn.targetNode}`,
          file: fileName,
          connectionId: conn.id
        })
      }

      if (conn.sourceNode && conn.targetNode && nodeIds.has(conn.sourceNode) && nodeIds.has(conn.targetNode)) {
        const sourceNode = workflow.nodes.find(n => n.id === conn.sourceNode)
        const targetNode = workflow.nodes.find(n => n.id === conn.targetNode)

        if (sourceNode?.outputs && conn.sourcePort) {
          const hasPort = sourceNode.outputs.some(p => p.id === conn.sourcePort)
          if (!hasPort) {
            issues.push({
              severity: SEVERITY.WARNING,
              type: 'invalid_source_port',
              message: `Connection source port not found: ${conn.sourcePort} on node ${conn.sourceNode}`,
              file: fileName,
              connectionId: conn.id
            })
          }
        }

        if (targetNode?.inputs && conn.targetPort) {
          const hasPort = targetNode.inputs.some(p => p.id === conn.targetPort)
          if (!hasPort) {
            issues.push({
              severity: SEVERITY.WARNING,
              type: 'invalid_target_port',
              message: `Connection target port not found: ${conn.targetPort} on node ${conn.targetNode}`,
              file: fileName,
              connectionId: conn.id
            })
          }
        }
      }
    }
  }

  if (workflow.resources && Array.isArray(workflow.resources)) {
    for (const resource of workflow.resources) {
      if (resource.path) {
        if (!fs.existsSync(resource.path)) {
          issues.push({
            severity: SEVERITY.WARNING,
            type: 'missing_resource',
            message: `Resource file not found: ${resource.path}`,
            file: fileName,
            resourcePath: resource.path
          })
        }
      }
    }
  }

  return issues
}

function checkWorkflowFile(filePath) {
  const result = {
    file: path.basename(filePath),
    path: filePath,
    valid: true,
    issues: [],
    nodeCount: 0,
    connectionCount: 0,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0
  }

  const workflow = readJson(filePath)

  if (workflow.error) {
    result.valid = false
    result.issues.push({
      severity: SEVERITY.ERROR,
      type: 'parse_error',
      message: `JSON parse error: ${workflow.error}`,
      file: result.file
    })
    result.errorCount = 1
    return result
  }

  result.nodeCount = workflow.nodes?.length || 0
  result.connectionCount = workflow.connections?.length || 0

  const issues = validateWorkflowStructure(workflow, filePath)
  result.issues = issues
  result.errorCount = issues.filter(i => i.severity === SEVERITY.ERROR).length
  result.warningCount = issues.filter(i => i.severity === SEVERITY.WARNING).length
  result.infoCount = issues.filter(i => i.severity === SEVERITY.INFO).length
  result.valid = result.errorCount === 0

  return result
}

function checkProject(projectDir, projectId) {
  const result = {
    projectId,
    projectName: path.basename(projectDir),
    path: projectDir,
    total: 0,
    valid: 0,
    invalid: 0,
    hasWarnings: 0,
    totalErrors: 0,
    totalWarnings: 0,
    files: []
  }

  const workflowsDir = path.join(projectDir, 'workflows')
  if (!fs.existsSync(workflowsDir)) {
    return result
  }

  const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json'))
  result.total = files.length

  for (const file of files) {
    const filePath = path.join(workflowsDir, file)
    const fileResult = checkWorkflowFile(filePath)
    result.files.push(fileResult)

    if (fileResult.valid) {
      result.valid++
    } else {
      result.invalid++
    }

    if (fileResult.warningCount > 0) {
      result.hasWarnings++
    }

    result.totalErrors += fileResult.errorCount
    result.totalWarnings += fileResult.warningCount
  }

  return result
}

function findAllProjects(baseDir) {
  const projects = []
  if (!fs.existsSync(baseDir)) return projects

  const entries = fs.readdirSync(baseDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const projectPath = path.join(baseDir, entry.name)
      const workflowsDir = path.join(projectPath, 'workflows')
      if (fs.existsSync(workflowsDir)) {
        projects.push({
          id: entry.name,
          name: entry.name,
          path: projectPath
        })
      }
    }
  }

  return projects
}

function printReport(allResults) {
  console.log()
  console.log(`${COLORS.bgBlue}${COLORS.bright}                                                              ${COLORS.reset}`)
  console.log(`${COLORS.bgBlue}${COLORS.bright}                 Integrity Check Report                       ${COLORS.reset}`)
  console.log(`${COLORS.bgBlue}${COLORS.bright}                                                              ${COLORS.reset}`)
  console.log()

  let totalFiles = 0
  let totalValid = 0
  let totalInvalid = 0
  let totalErrors = 0
  let totalWarnings = 0
  let filesWithCredentials = 0

  for (const project of allResults) {
    log('info', `Project: ${project.projectName} (${project.total} workflows)`)
    log('info', `  Valid: ${project.valid}, Invalid: ${project.invalid}, With warnings: ${project.hasWarnings}`)
    log('info', `  Total errors: ${project.totalErrors}, Total warnings: ${project.totalWarnings}`)

    for (const file of project.files) {
      if (file.issues.length > 0) {
        console.log()
        const statusColor = file.valid ? COLORS.yellow : COLORS.red
        const statusLabel = file.valid ? 'WARN' : 'ERR'
        console.log(`${COLORS.dim}  [${file.file}]${COLORS.reset} ${statusColor}${statusLabel}${COLORS.reset} (${file.errorCount} errors, ${file.warningCount} warnings, ${file.nodeCount} nodes)`)

        for (const issue of file.issues) {
          const sevColor = issue.severity === SEVERITY.ERROR ? COLORS.red : COLORS.yellow
          const sevLabel = issue.severity === SEVERITY.ERROR ? 'ERROR' : 'WARN'
          console.log(`    ${sevColor}${sevLabel}${COLORS.reset} [${issue.type}]: ${issue.message}`)

          if (issue.type === 'stored_credential') {
            filesWithCredentials++
          }
        }
      }
    }
    console.log()

    totalFiles += project.total
    totalValid += project.valid
    totalInvalid += project.invalid
    totalErrors += project.totalErrors
    totalWarnings += project.totalWarnings
  }

  console.log()
  console.log(`${COLORS.bgGreen}${COLORS.bright}                                                              ${COLORS.reset}`)
  console.log(`${COLORS.bgGreen}${COLORS.bright}                     Summary                                  ${COLORS.reset}`)
  console.log(`${COLORS.bgGreen}${COLORS.bright}                                                              ${COLORS.reset}`)
  console.log()
  log('info', `Total projects: ${allResults.length}`)
  log('info', `Total workflows: ${totalFiles}`)
  log('success', `Valid: ${totalValid}`)
  if (totalInvalid > 0) {
    log('error', `Invalid: ${totalInvalid}`)
  } else {
    log('success', `Invalid: ${totalInvalid}`)
  }
  log('info', `Total errors: ${totalErrors}`)
  log('info', `Total warnings: ${totalWarnings}`)
  if (filesWithCredentials > 0) {
    log('warn', `Files with stored credentials: ${filesWithCredentials} (security concern!)`)
  }
  console.log()

  if (totalInvalid > 0) {
    log('error', 'Integrity check FAILED - some workflows have errors')
  } else if (totalWarnings > 0) {
    log('warn', 'Integrity check PASSED with warnings - review recommended')
  } else {
    log('success', 'Integrity check PASSED - all workflows are valid!')
  }
  console.log()
}

function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    projectId: null,
    all: false,
    workflowsDir: WORKFLOWS_DIR,
    checkCredentials: true
  }

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--project':
      case '-p':
        options.projectId = args[++i]
        break
      case '--all':
      case '-a':
        options.all = true
        break
      case '--dir':
        options.workflowsDir = path.resolve(args[++i])
        break
      case '--no-credential-check':
        options.checkCredentials = false
        break
      case '--help':
      case '-h':
        console.log(`
Karna Workflow Integrity Checker

Check workflow files for validity, credential leaks, and resource references.

Usage: node scripts/check-integrity.cjs [options]

Options:
  -a, --all                  Check all projects
  -p, --project <id>         Check specific project
      --dir <path>           Custom workflows directory
      --no-credential-check  Skip credential leak detection
  -h, --help                 Show this help message
`)
        process.exit(0)
    }
  }

  return options
}

function main() {
  const options = parseArgs()

  console.log()
  console.log(`${COLORS.bgMagenta}${COLORS.bright}                                                              ${COLORS.reset}`)
  console.log(`${COLORS.bgMagenta}${COLORS.bright}         Karna Workflow Integrity Checker                     ${COLORS.reset}`)
  console.log(`${COLORS.bgMagenta}${COLORS.bright}                                                              ${COLORS.reset}`)
  console.log()

  log('info', `Workflows directory: ${options.workflowsDir}`)
  if (!options.checkCredentials) {
    log('warn', 'Credential check disabled')
  }
  console.log()

  if (!fs.existsSync(options.workflowsDir)) {
    log('error', 'Workflows directory not found')
    console.log()
    process.exit(1)
  }

  const allResults = []

  if (options.all) {
    const projects = findAllProjects(options.workflowsDir)
    log('info', `Found ${projects.length} projects with workflows`)
    console.log()

    for (const project of projects) {
      log('start', `Checking project: ${project.name}`)
      const result = checkProject(project.path, project.id)
      allResults.push(result)
    }
  } else if (options.projectId) {
    const projectDir = path.join(options.workflowsDir, options.projectId)
    if (!fs.existsSync(projectDir)) {
      log('error', `Project not found: ${options.projectId}`)
      process.exit(1)
    }
    log('start', `Checking project: ${options.projectId}`)
    const result = checkProject(projectDir, options.projectId)
    allResults.push(result)
  } else {
    log('warn', 'No project specified. Use --all to check all projects, or --project <id> for a specific one.')
    log('info', 'Use --help for usage information.')
    console.log()
    process.exit(0)
  }

  printReport(allResults)

  const hasInvalid = allResults.some(r => r.invalid > 0)
  if (hasInvalid) {
    process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = {
  checkWorkflowFile,
  checkProject,
  validateWorkflowStructure,
  findCredentialsInObject,
  SEVERITY
}
