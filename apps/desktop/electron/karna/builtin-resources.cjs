'use strict'

const crypto = require('node:crypto')

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function resolveBuiltinWorkflowRoot({ appRoot, isPackaged, path, resourcesPath }) {
  return isPackaged
    ? path.join(resourcesPath, 'builtin-workflows')
    : path.resolve(appRoot, '..', '..', 'karna-builtin', 'workflows')
}

function loadBuiltinWorkflows({ appRoot, fs, isPackaged, path, resourcesPath }) {
  const root = resolveBuiltinWorkflowRoot({ appRoot, isPackaged, path, resourcesPath })
  const manifestPath = path.join(root, 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const workflows = manifest.workflows.map(entry => {
    const raw = fs.readFileSync(path.join(root, entry.file), 'utf8')
    const workflow = JSON.parse(raw)
    if (workflow.id !== entry.id || workflow.nodes.length !== entry.node_count) {
      throw new Error(`Invalid built-in workflow resource: ${entry.file}`)
    }
    return { ...workflow, builtin_hash: sha256(raw) }
  })
  return { manifest, root, workflows }
}

function installBuiltinWorkflowResources({ appRoot, dataRoot, fs, isPackaged, path, resourcesPath }) {
  const loaded = loadBuiltinWorkflows({ appRoot, fs, isPackaged, path, resourcesPath })
  const globalDir = path.join(dataRoot, 'global-workflows')
  const registryPath = path.join(globalDir, 'builtin-workflows.json')
  const userWorkflowsPath = path.join(globalDir, 'workflows.json')
  fs.mkdirSync(path.join(globalDir, 'workflow_artifacts'), { recursive: true })

  const registry = {
    version: 1,
    source: 'Karna release resources',
    workflows: loaded.workflows
  }
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')

  // Seed only a genuinely fresh profile. Existing workflows are user data and
  // are never rewritten by an application update.
  if (!fs.existsSync(userWorkflowsPath)) {
    fs.writeFileSync(userWorkflowsPath, `${JSON.stringify({
      version: 1,
      project_id: 'global-workflows',
      workflows: loaded.workflows
    }, null, 2)}\n`, 'utf8')
  }

  return { registryPath, userWorkflowsPath, workflowCount: loaded.workflows.length }
}

module.exports = {
  installBuiltinWorkflowResources,
  loadBuiltinWorkflows,
  resolveBuiltinWorkflowRoot,
  sha256
}
