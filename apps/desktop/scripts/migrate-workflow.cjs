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
  bgMagenta: '\x1b[45m'
}

function log(level, message) {
  const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  let color = COLORS.white
  let prefix = 'INFO'

  switch (level) {
    case 'start':
      color = COLORS.bgGreen + COLORS.bright
      prefix = 'MIGRATE'
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
    case 'skip':
      color = COLORS.dim
      prefix = 'SKIP'
      break
  }

  console.log(`${COLORS.dim}[${timestamp}]${COLORS.reset} ${color}[${prefix}]${COLORS.reset} ${message}`)
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath))
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

function detectWorkflowVersion(workflow) {
  if (!workflow || typeof workflow !== 'object') return 0
  if (workflow.schemaVersion === 2) return 2
  if (workflow.version === 2) return 2
  if (workflow.nodes && Array.isArray(workflow.nodes)) return 2
  if (workflow.nodeMap || workflow.connections) return 1
  if (workflow.agents && Array.isArray(workflow.agents)) return 1
  return 0
}

function isLegacyMultiAgentFormat(workflow) {
  if (!workflow) return false
  if (workflow.agents && Array.isArray(workflow.agents)) return true
  if (workflow.type === 'multi-agent') return true
  if (workflow.workshopType === 'multi-agent') return true
  return false
}

function generateId() {
  return 'wf_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function migrateLegacyToV2(legacyWorkflow, projectId = null) {
  const v2Workflow = {
    schemaVersion: 2,
    id: legacyWorkflow.id || generateId(),
    name: legacyWorkflow.name || legacyWorkflow.title || 'Untitled Workflow',
    description: legacyWorkflow.description || '',
    projectId: projectId || legacyWorkflow.projectId || null,
    createdAt: legacyWorkflow.createdAt || new Date().toISOString(),
    updatedAt: legacyWorkflow.updatedAt || new Date().toISOString(),
    nodes: [],
    connections: [],
    settings: {
      layout: 'horizontal',
      gridSize: 20,
      snapToGrid: true
    },
    metadata: {
      migratedFrom: 'legacy-multi-agent',
      originalFormat: detectWorkflowVersion(legacyWorkflow)
    }
  }

  const agents = legacyWorkflow.agents || []
  const nodeMap = {}
  let xOffset = 100
  const yOffset = 100
  const nodeWidth = 200
  const nodeHeight = 120
  const gapX = 80

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i]
    const nodeId = `agent_${i}_${agent.id || agent.name || i}`
    const safeName = (agent.name || agent.role || `Agent ${i + 1}`).replace(/[^\w\u4e00-\u9fff-]/g, '_')

    const node = {
      id: nodeId,
      type: 'agent',
      title: agent.name || agent.role || `Agent ${i + 1}`,
      x: xOffset + i * (nodeWidth + gapX),
      y: yOffset + (i % 2) * (nodeHeight + 40),
      width: nodeWidth,
      height: nodeHeight,
      config: {
        agentId: agent.id || null,
        role: agent.role || agent.name || '',
        brief: agent.brief || agent.description || '',
        persona: agent.persona || agent.identity || '',
        skills: agent.skills || [],
        mcp_servers: agent.mcp || agent.mcp_servers || [],
        model: agent.model || '',
        temperature: agent.temperature ?? 0.7,
        enabled: agent.enabled !== false
      },
      inputs: i === 0 ? [] : [{ id: `in_${nodeId}`, label: 'Input', type: 'any' }],
      outputs: i === agents.length - 1 ? [] : [{ id: `out_${nodeId}`, label: 'Output', type: 'any' }]
    }

    v2Workflow.nodes.push(node)
    nodeMap[i] = nodeId
  }

  for (let i = 0; i < agents.length - 1; i++) {
    const sourceId = nodeMap[i]
    const targetId = nodeMap[i + 1]
    const sourceNode = v2Workflow.nodes.find(n => n.id === sourceId)
    const targetNode = v2Workflow.nodes.find(n => n.id === targetId)

    if (sourceNode && targetNode && sourceNode.outputs.length > 0 && targetNode.inputs.length > 0) {
      v2Workflow.connections.push({
        id: `conn_${i}`,
        sourceNode: sourceId,
        sourcePort: sourceNode.outputs[0].id,
        targetNode: targetId,
        targetPort: targetNode.inputs[0].id
      })
    }
  }

  if (v2Workflow.nodes.length === 0) {
    v2Workflow.nodes.push({
      id: 'start',
      type: 'input',
      title: 'Start',
      x: 100,
      y: 200,
      width: 160,
      height: 80,
      config: { inputType: 'text' },
      inputs: [],
      outputs: [{ id: 'out', label: 'Output', type: 'any' }]
    })
  }

  return v2Workflow
}

function backupWorkflow(filePath, backupDir) {
  ensureDir(backupDir)
  const fileName = path.basename(filePath)
  const backupPath = path.join(backupDir, `${fileName}.bak.${Date.now()}`)
  fs.copyFileSync(filePath, backupPath)
  return backupPath
}

function migrateWorkflowFile(filePath, projectId, backupDir) {
  const workflow = readJson(filePath)
  if (!workflow) {
    return { success: false, error: 'Invalid JSON', file: path.basename(filePath) }
  }

  const version = detectWorkflowVersion(workflow)
  const fileName = path.basename(filePath)

  if (version >= 2) {
    return { success: true, skipped: true, reason: 'Already v2 format', file: fileName, version }
  }

  if (version === 0) {
    return { success: false, error: 'Unknown format', file: fileName }
  }

  try {
    const backupPath = backupWorkflow(filePath, backupDir)
    const migrated = migrateLegacyToV2(workflow, projectId)
    writeJson(filePath, migrated)

    return {
      success: true,
      skipped: false,
      file: fileName,
      fromVersion: version,
      toVersion: 2,
      nodesCount: migrated.nodes.length,
      connectionsCount: migrated.connections.length,
      backupPath
    }
  } catch (err) {
    return { success: false, error: err.message, file: fileName }
  }
}

function migrateProject(projectDir, projectId) {
  const results = {
    projectId,
    projectName: path.basename(projectDir),
    total: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    files: []
  }

  const workflowsDir = path.join(projectDir, 'workflows')
  const backupDir = path.join(projectDir, 'workflows-backup', `migration-${Date.now()}`)

  if (!fs.existsSync(workflowsDir)) {
    return results
  }

  const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json'))
  results.total = files.length

  for (const file of files) {
    const filePath = path.join(workflowsDir, file)
    const result = migrateWorkflowFile(filePath, projectId, backupDir)
    results.files.push(result)

    if (result.skipped) {
      results.skipped++
    } else if (result.success) {
      results.migrated++
    } else {
      results.failed++
    }
  }

  return results
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
  console.log(`${COLORS.bgBlue}${COLORS.bright}                   Migration Report                           ${COLORS.reset}`)
  console.log(`${COLORS.bgBlue}${COLORS.bright}                                                              ${COLORS.reset}`)
  console.log()

  let totalFiles = 0
  let totalMigrated = 0
  let totalSkipped = 0
  let totalFailed = 0

  for (const result of allResults) {
    log('info', `Project: ${result.projectName}`)
    log('info', `  Total: ${result.total}, Migrated: ${result.migrated}, Skipped: ${result.skipped}, Failed: ${result.failed}`)

    for (const file of result.files) {
      if (file.skipped) {
        log('skip', `  ${file.file}: ${file.reason}`)
      } else if (file.success) {
        log('success', `  ${file.file}: migrated v${file.fromVersion} → v${file.toVersion} (${file.nodesCount} nodes, ${file.connectionsCount} connections)`)
      } else {
        log('error', `  ${file.file}: ${file.error}`)
      }
    }

    totalFiles += result.total
    totalMigrated += result.migrated
    totalSkipped += result.skipped
    totalFailed += result.failed
    console.log()
  }

  console.log()
  console.log(`${COLORS.bgGreen}${COLORS.bright}                                                              ${COLORS.reset}`)
  console.log(`${COLORS.bgGreen}${COLORS.bright}                     Summary                                  ${COLORS.reset}`)
  console.log(`${COLORS.bgGreen}${COLORS.bright}                                                              ${COLORS.reset}`)
  console.log()
  log('info', `Total projects: ${allResults.length}`)
  log('info', `Total files: ${totalFiles}`)
  log('success', `Migrated: ${totalMigrated}`)
  log('info', `Skipped: ${totalSkipped}`)
  if (totalFailed > 0) {
    log('error', `Failed: ${totalFailed}`)
  } else {
    log('success', `Failed: ${totalFailed}`)
  }
  console.log()
}

function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    projectId: null,
    all: false,
    dryRun: false,
    workflowsDir: WORKFLOWS_DIR
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
      case '--dry-run':
      case '-d':
        options.dryRun = true
        break
      case '--dir':
        options.workflowsDir = path.resolve(args[++i])
        break
      case '--help':
      case '-h':
        console.log(`
Karna Workflow Migration Tool

Migrate legacy multi-agent workshop format to new Flow Studio v2 format.

Usage: node scripts/migrate-workflow.cjs [options]

Options:
  -a, --all              Migrate all projects
  -p, --project <id>     Migrate specific project
  -d, --dry-run          Show what would be migrated without changes
      --dir <path>       Custom workflows directory
  -h, --help             Show this help message
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
  console.log(`${COLORS.bgMagenta}${COLORS.bright}     Karna Workflow Migration Tool (Legacy → Flow Studio)     ${COLORS.reset}`)
  console.log(`${COLORS.bgMagenta}${COLORS.bright}                                                              ${COLORS.reset}`)
  console.log()

  if (options.dryRun) {
    log('warn', 'DRY RUN MODE - No changes will be made')
    console.log()
  }

  log('info', `Workflows directory: ${options.workflowsDir}`)
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
      log('start', `Migrating project: ${project.name}`)
      const result = options.dryRun ? dryMigrateProject(project.path, project.id) : migrateProject(project.path, project.id)
      allResults.push(result)
    }
  } else if (options.projectId) {
    const projectDir = path.join(options.workflowsDir, options.projectId)
    if (!fs.existsSync(projectDir)) {
      log('error', `Project not found: ${options.projectId}`)
      process.exit(1)
    }
    log('start', `Migrating project: ${options.projectId}`)
    const result = options.dryRun ? dryMigrateProject(projectDir, options.projectId) : migrateProject(projectDir, options.projectId)
    allResults.push(result)
  } else {
    log('warn', 'No project specified. Use --all to migrate all projects, or --project <id> for a specific one.')
    log('info', 'Use --help for usage information.')
    console.log()
    process.exit(0)
  }

  printReport(allResults)

  const hasFailures = allResults.some(r => r.failed > 0)
  if (hasFailures) {
    process.exit(1)
  }
}

function dryMigrateProject(projectDir, projectId) {
  const results = {
    projectId,
    projectName: path.basename(projectDir),
    total: 0,
    migrated: 0,
    skipped: 0,
    failed: 0,
    files: []
  }

  const workflowsDir = path.join(projectDir, 'workflows')
  if (!fs.existsSync(workflowsDir)) return results

  const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.json'))
  results.total = files.length

  for (const file of files) {
    const filePath = path.join(workflowsDir, file)
    const workflow = readJson(filePath)
    const version = detectWorkflowVersion(workflow)

    if (!workflow) {
      results.files.push({ success: false, error: 'Invalid JSON', file })
      results.failed++
    } else if (version >= 2) {
      results.files.push({ success: true, skipped: true, reason: 'Already v2 format', file, version })
      results.skipped++
    } else if (version === 0) {
      results.files.push({ success: false, error: 'Unknown format', file })
      results.failed++
    } else {
      const migrated = migrateLegacyToV2(workflow, projectId)
      results.files.push({
        success: true,
        skipped: false,
        file,
        fromVersion: version,
        toVersion: 2,
        nodesCount: migrated.nodes.length,
        connectionsCount: migrated.connections.length
      })
      results.migrated++
    }
  }

  return results
}

if (require.main === module) {
  main()
}

module.exports = {
  migrateWorkflowFile,
  migrateProject,
  migrateLegacyToV2,
  detectWorkflowVersion,
  isLegacyMultiAgentFormat
}
