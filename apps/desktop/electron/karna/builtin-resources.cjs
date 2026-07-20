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

function migrateBuiltinWorkflowsInUserStore(userWorkflows, latestBuiltinWorkflows) {
  if (!Array.isArray(userWorkflows)) return userWorkflows
  const latestMap = new Map(latestBuiltinWorkflows.map(w => [w.id, w]))
  return userWorkflows.map(wf => {
    const wfId = String(wf?.id || '')
    const isBuiltin = wf?.builtin === true || wfId.startsWith('builtin.')
    if (!isBuiltin) return wf
    const latest = latestMap.get(wfId)
    if (!latest) return wf
    const userVersion = Number(wf?.template_version || 1)
    const latestVersion = Number(latest?.template_version || 1)
    if (userVersion >= latestVersion && wf?.fixed_in === latest?.fixed_in) {
      return wf
    }
    return { ...latest }
  })
}

function installBuiltinWorkflowResources({ appRoot, dataRoot, fs, isPackaged, path, resourcesPath }) {
  const loaded = loadBuiltinWorkflows({ appRoot, fs, isPackaged, path, resourcesPath })
  const globalDir = path.join(dataRoot, 'global-workflows')
  const registryPath = path.join(globalDir, 'builtin-workflows.json')
  const userWorkflowsPath = path.join(globalDir, 'workflows.json')
  fs.mkdirSync(path.join(globalDir, 'workflow_artifacts'), { recursive: true })

  const registry = {
    version: 2,
    source: 'Karna release resources',
    updated_at: new Date().toISOString(),
    workflows: loaded.workflows
  }
  fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`, 'utf8')

  if (fs.existsSync(userWorkflowsPath)) {
    try {
      const userStore = JSON.parse(fs.readFileSync(userWorkflowsPath, 'utf8'))
      const migratedWorkflows = migrateBuiltinWorkflowsInUserStore(
        Array.isArray(userStore.workflows) ? userStore.workflows : [],
        loaded.workflows
      )
      const nextStore = {
        ...userStore,
        version: Math.max(Number(userStore.version || 1), 2),
        project_id: userStore.project_id || 'global-workflows',
        updated_at: new Date().toISOString(),
        workflows: migratedWorkflows
      }
      fs.writeFileSync(userWorkflowsPath, `${JSON.stringify(nextStore, null, 2)}\n`, 'utf8')
    } catch (e) {
      console.error('[builtin-workflows] migration failed, preserving user file:', e.message)
    }
  } else {
    fs.writeFileSync(userWorkflowsPath, `${JSON.stringify({
      version: 2,
      project_id: 'global-workflows',
      updated_at: new Date().toISOString(),
      workflows: loaded.workflows
    }, null, 2)}\n`, 'utf8')
  }

  return { registryPath, userWorkflowsPath, workflowCount: loaded.workflows.length, migrated: true }
}

module.exports = {
  installBuiltinWorkflowResources,
  loadBuiltinWorkflows,
  resolveBuiltinWorkflowRoot,
  migrateBuiltinWorkflowsInUserStore,
  sha256
}
