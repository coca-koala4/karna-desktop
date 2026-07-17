/* eslint-disable no-unused-vars, no-control-regex, no-useless-escape, no-empty -- legacy adapter stays linted for syntax and unsafe constructs while its module extraction proceeds. */
// TODO: 历史债务 - 此文件为340KB的大型Node.js CommonJS模块，包含大量历史代码。
// 全局禁用ESLint是临时方案，后续应拆分为多个小模块并逐步修复lint问题。
'use strict'

/**
 * Karna Desktop Protocol Adapter
 *
 * Bridges the Karna frontend (JSON-RPC over WebSocket + REST proxy)
 * to the Karna backend (simple FastAPI with POST /api/chat + GET /health).
 *
 * Three responsibilities:
 * 1. Start the Karna Python backend (uvicorn) and health-check it.
 * 2. Run a local WebSocket server that speaks JSON-RPC 2.0 to the frontend,
 *    translating `prompt.submit` → `POST /api/chat` and streaming the response
 *    back as `message.start` → `message.delta` → `message.complete` events.
 *    All other JSON-RPC methods return mock/empty responses for graceful degradation.
 * 3. Provide `handleKarnaApiRequest()` that maps REST API paths to the
 *    Karna backend (or returns mock data for unsupported endpoints).
 */

const { WebSocketServer } = require('ws')
const crypto = require('node:crypto')
const http = require('node:http')
const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { spawn, execFileSync, execFile } = require('node:child_process')

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const KARNA_BACKEND_HOST = '127.0.0.1'
const KARNA_BACKEND_PORT = 8710 // fixed port for the Karna Python backend
const WS_BRIDGE_HOST = '127.0.0.1'
const WS_BRIDGE_PORT = 17891 // local WS bridge port
const BACKEND_STARTUP_TIMEOUT_MS = 30_000
const HEALTH_CHECK_INTERVAL_MS = 500
// All data directory paths are derived from karna/paths.cjs — single source of
// truth for dev vs packaged data location. The legacy KARNA_DESKTOP_DATA_DIR
// env var is preserved for backwards compatibility but routes through
// paths.dataRoot() so the override semantics match.
const karnaPaths = require('./karna/paths.cjs')
const skillI18n = require('./karna/skill-i18n.cjs')
const { createArtifactsService } = require('./karna/artifacts-service.cjs')
const { createCapabilitiesService, normalizeStateMap } = require('./karna/capabilities-service.cjs')
const { createSkillsService } = require('./karna/skills-service.cjs')
const { createSkillImportService } = require('./karna/skill-import-service.cjs')
const { textHash } = require('./karna/hash.cjs')
const { slugify } = require('./karna/slugify.cjs')
const { createStorageUtils } = require('./karna/storage.cjs')
const { createLogger } = require('./karna/logs.cjs')
const { createAnalyticsService } = require('./karna/analytics.cjs')
const { createConnectorBridge } = require('./karna/connector-bridge.cjs')
const { createSoulPromptService } = require('./karna/soul-prompt-service.cjs')
const { createIngestService } = require('./karna/ingest-service.cjs')
const { createModeService } = require('./karna/mode-service.cjs')
const { createPlanService } = require('./karna/plan-service.cjs')
const { createGoalService } = require('./karna/goal-service.cjs')
const { createCreativeService } = require('./karna/creative-service.cjs')
const { MODEL_PROVIDERS, createCustomModelController, createCustomModelStore, createEmbeddingModelService, createImageModelService, createModelRouter, customEnvKey, modelCapabilities } = require('./karna/model-service.cjs')
const { app, safeStorage } = require('electron')
const { createModelCredentialStore } = require('./model-credential-store.cjs')
const { resolveModelContextBudget } = require('../shared/model-context-budget.cjs')
const storage = createStorageUtils({ fs, path })
const analytics = createAnalyticsService({ fs, path, karnaPaths, storage })
const { cloneJson, ensureDir, readJsonFile, writeJsonFile, atomicWrite } = storage
const { rememberLog, getRecentLogs, getLogsFiltered, getLogStats, logRequest, logTiming } = createLogger()
const { createVectorDbService } = require('./writer-os/vector-db-service.cjs')
const { createWriterDataModelService } = require('./writer-os/data-model-utils.cjs')
const { createWriterNarrativeService } = require('./writer-os/narrative-utils.cjs')
const { createWriterSafetyCouncilService } = require('./writer-os/safety-council.cjs')
const { createWriterMemoryArtifactsService } = require('./writer-os/memory-artifacts.cjs')
const { createWriterDocumentSearchService } = require('./writer-os/document-search.cjs')
const { createWriterRagService } = require('./writer-os/rag.cjs')
const { createWriterWorkflowStoreService } = require('./writer-os/workflow-store.cjs')
const writerWorkflowUtils = require('./writer-os/workflow-utils.cjs')
const { createWriterGuideService } = require('./writer-os/guide-utils.cjs')
const writerBenchmarkUtils = require('./writer-os/benchmark-utils.cjs')
const { createWriterBenchmarkService } = require('./writer-os/benchmark-suite.cjs')
const { createWriterCommandCenterService } = require('./writer-os/command-center.cjs')
const { createWriterDeliveryService } = require('./writer-os/delivery.cjs')
const writerSafetyUtils = require('./writer-os/safety-utils.cjs')
const { createWriterOsServices } = require('./writer-os/services.cjs')
const nodeCapabilities = require('./writer-os/node-capabilities.cjs')
const { createModeCompatibilityCompiler } = require('./writer-os/mode-compatibility-compiler.cjs')
const { createModeResourceBridge } = require('./writer-os/mode-resource-bridge.cjs')
const { createSessionLifecycleService } = require('./karna/session-lifecycle-service.cjs')
const writerOsApiContract = require('../shared/writer-os-api-contract.json')
const { registerApiRoutes } = require('./karna/api-routes.cjs')
const KARNA_DATA_ROOT = karnaPaths.dataRoot({ env: { ...process.env, KARNA_DATA_DIR: process.env.KARNA_DESKTOP_DATA_DIR || process.env.KARNA_DATA_DIR } })
const WRITER_OS_CONTRACT_MODULES = writerOsApiContract.modules.map(module => module.id)
const soulPrompts = createSoulPromptService({ fs, path, dataRoot: KARNA_DATA_ROOT })

const LEGACY_TYPE_TO_DOC_TYPE = {
  'novel': 'narrative_prose',
  'web-novel': 'narrative_prose',
  'poetry': 'narrative_prose',
  'screenplay': 'script_dialogue',
  'paper': 'argumentative_document',
  'copywriting': 'marketing_copy',
  'editorial': 'informational_article'
}

function getProjectAnalyticsProps(project) {
  if (!project) return {}
  const taxonomy = project.taxonomy
  if (taxonomy && taxonomy.schemaVersion === 2) {
    return {
      taxonomy_version: 2,
      document_type: taxonomy.primaryDocumentType || null,
      form_id: taxonomy.formId || null,
      domain_id: taxonomy.domainId || null,
      family_id: taxonomy.familyId || null,
      is_custom_form: Boolean(taxonomy.customFormLabel),
      capability_profile: taxonomy.capabilityProfileId || null
    }
  }
  const legacyType = project.type || ''
  return {
    taxonomy_version: 1,
    legacy_type: legacyType,
    document_type: LEGACY_TYPE_TO_DOC_TYPE[legacyType] || null
  }
}

function trackProjectTypeDistribution(projects) {
  if (!Array.isArray(projects) || projects.length === 0) return
  const distribution = {}
  for (const project of projects) {
    const props = getProjectAnalyticsProps(project)
    const key = props.taxonomy_version === 2
      ? `v2:${props.domain_id || 'unknown'}:${props.family_id || 'unknown'}:${props.form_id || 'unknown'}`
      : `v1:${props.legacy_type || 'unknown'}`
    distribution[key] = (distribution[key] || 0) + 1
  }
  const projectIdHashes = projects.map(p => textHash(p.id || '').slice(0, 16))
  analytics.track('project_type_distribution', {
    total_projects: projects.length,
    distribution,
    project_id_hashes: projectIdHashes
  })
}

let vectorDb = null
const getVectorDb = () => {
  if (!vectorDb) {
    vectorDb = createVectorDbService({
      karnaPaths,
      textHash,
      nodeModulesRoot: path.resolve(__dirname, '..', '..', '..')
    })
  }
  return vectorDb
}

let writerOs = null
const getWriterOs = () => {
  if (writerOs) return writerOs
  writerOs = createWriterOsServices({
    fs, path, crypto,
    ensureWriterProjectMetadata, findWriterProject, enrichWriterProject,
    readJsonFile, writeJsonFile, textHash, slugify, uniqueBy,
    readWriterProjectBible, analyzeWriterProject, readProjectDocuments,
    readSoulStore, enrichSoulAuthor, recordArtifact,
    appendWriterProjectVersion, logWriterProjectCall,
    writerProjectManifestPath,
    workflowsDir: () => karnaPaths.workflowsDir(),
    vectorDbService: getVectorDb(),
    trackAnalytics: (event, properties) => analytics.track(event, properties),
    flushAnalytics: () => analytics.flush()
  })
  return writerOs
}

let karnaBackendUrl = `http://${KARNA_BACKEND_HOST}:${KARNA_BACKEND_PORT}`
let wsBridgeUrl = `ws://${WS_BRIDGE_HOST}:${WS_BRIDGE_PORT}`
let karnaProcess = null
let wsBridgeServer = null
let backendReady = false
let bootProgressCb = null

// In-memory session store (Karna backend has no session management)
const sessions = new Map()
const sessionMessages = new Map()
let nextSessionNum = 1
const cronJobs = new Map()
const modeCompatibilityCompiler = createModeCompatibilityCompiler({ nodeCapabilities: nodeCapabilities?.NODE_CAPABILITIES || nodeCapabilities })
const modeService = createModeService({ logRequest, modeCompatibilityCompiler })
const planService = createPlanService({ logRequest, modeService })
const goalService = createGoalService({ logRequest, modeService })
const creativeService = createCreativeService({ logRequest, modeService })
const modeResourceBridge = createModeResourceBridge({
  modeService,
  writerServices: () => getWriterOs(),
  documentSearch: () => getWriterOs()?.documentSearch || null,
  ragService: () => getVectorDb()
})
const profiles = new Map([
  ['default', { name: 'default', label: 'Default', is_default: true }]
])

const nowSeconds = () => Date.now() / 1000
const sessionInfoPayload = session => ({
  ...session,
  cwd: session.cwd || karnaConfig?.terminal?.cwd || process.cwd(),
  running: Boolean(session?.running),
  desktop_contract: 1,
  conversation_scope: session.conversation_scope || (session.project_id || session.writer_project_id ? 'project' : 'standalone'),
  workspace_id: session.workspace_id || session.project_id || null,
  writer_project_id: session.writer_project_id || session.project_id || null,
  permission_mode: session.permission_mode || 'restricted',
  personality: '',
  reasoning_effort: karnaConfig?.agent?.reasoning_effort || 'medium',
  service_tier: karnaConfig?.agent?.service_tier || 'normal',
  fast: String(karnaConfig?.agent?.service_tier || '').toLowerCase() === 'fast',
  yolo: false
})
const storedSessionInfo = session => ({
  id: session.id,
  title: session.title || '\u65b0\u4f1a\u8bdd',
  started_at: session.created || nowSeconds(),
  last_active: session.updated || nowSeconds(),
  ended_at: null,
  message_count: session.message_count || 0,
  archived: Boolean(session.archived),
  is_active: true,
  input_tokens: 0,
  output_tokens: 0,
  tool_call_count: 0,
  source: session.source || 'tui',
  profile: session.profile || 'default',
  is_default_profile: (session.profile || 'default') === 'default',
  model: session.model || currentModel,
  preview: session.preview || null,
  cwd: session.cwd || karnaConfig?.terminal?.cwd || process.cwd(),
  project_id: session.project_id || null,
  project_title: session.project_title || null,
  agent_id: session.agent_id || null,
  agent_name: session.agent_name === 'Project Controller' ? '\u4e3b\u63a7' : (session.agent_name || null),
  agent_role: session.agent_role === 'Project Controller' ? '\u4e3b\u63a7' : (session.agent_role || null),
  is_project_session: Boolean(session.project_id || session.writer_project_id),
  conversation_scope: session.conversation_scope || (session.project_id || session.writer_project_id ? 'project' : 'standalone'),
  workspace_id: session.workspace_id || session.project_id || null,
  writer_project_id: session.writer_project_id || session.project_id || null,
  permission_mode: session.permission_mode || 'restricted'
})

let currentModelProvider = ''
let currentModel = ''


const providerWithCapabilities = provider => {
  const authenticated = isProviderConfigured(provider)
  const models = authenticated ? provider.models : []
  return {
    ...provider,
    authenticated,
    models,
    total_models: provider.models.length,
    warning: authenticated ? undefined : `Set ${provider.key_env} before using ${provider.name}.`,
    capabilities: Object.fromEntries(models.map(model => [model, modelCapabilities(model)]))
  }
}

const getCustomModelsPath = () => {
  const dir = findKarnaBackendDir()
  return path.join(dir || path.dirname(getBackendEnvPath()), 'custom_models.json')
}

const getBackendDataDir = () => KARNA_DATA_ROOT
// Named-index readers — every persistent store goes through paths.cjs so the
// dev / packaged data location is centralised. Phase 1 Task 1.2 AC: no
// hardcoded 'karna-data' string literals outside paths.cjs itself.
const getWriterProjectsIndexPath = () => karnaPaths.writerProjectsIndexFile()
const getSoulWorkshopIndexPath    = () => karnaPaths.soulWorkshopIndexFile()
const backendDataPath = filename => path.join(getBackendDataDir(), filename)
const readBackendJson = (filename, fallback) => {
  try {
    const file = backendDataPath(filename)
    if (!fs.existsSync(file)) {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, `${JSON.stringify(fallback, null, 2)}
`, 'utf8')
      return cloneJson(fallback)
    }
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    rememberLog(`Could not read ${filename}: ${err.message}`)
    return cloneJson(fallback)
  }
}
const writeBackendJson = (filename, data) => {
  const file = backendDataPath(filename)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}
`, 'utf8')
  return file
}
const writeBackendJsonAtomic = (filename, data) => {
  const file = backendDataPath(filename)
  const tempFile = `${file}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  try {
    fs.writeFileSync(tempFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    fs.renameSync(tempFile, file)
  } finally {
    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile) } catch {}
  }
  return file
}
const notConfigured = (capability, error, extra = {}) => ({ ok: false, capability, error, ...extra })

const normalizeApiKey = value => String(value || '').trim().replace(/^Bearer\s+/i, '')

const getModelSelectionPath = () => backendDataPath('model_selection.json')
const readPersistedModelSelection = () => {
  try {
    const file = getModelSelectionPath()
    if (!fs.existsSync(file)) return { provider: '', model: '' }
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    return { provider: String(data?.provider || ''), model: String(data?.model || '') }
  } catch {
    return { provider: '', model: '' }
  }
}
const persistCurrentModelSelection = () => {
  try {
    if (!currentModelProvider || !currentModel) return
    writeBackendJsonAtomic('model_selection.json', {
      provider: currentModelProvider,
      model: currentModel,
      updated_at: new Date().toISOString()
    })
  } catch (err) {
    rememberLog(`Could not persist model selection: ${err?.message || err}`)
  }
}
const restorePersistedModelSelection = () => {
  const stored = readPersistedModelSelection()
  if (!stored.provider || !stored.model) return false
  const provider = findProvider(stored.provider)
  if (!provider || !isProviderConfigured(provider)) return false
  currentModelProvider = provider.slug
  currentModel = provider.models.includes(stored.model) ? stored.model : (provider.models[0] || stored.model)
  if (!karnaConfig.models) karnaConfig.models = {}
  karnaConfig.models.default = currentModel
  return true
}

const ensureCurrentConfiguredProvider = () => {
  const current = findProvider(currentModelProvider)
  if (current && isProviderConfigured(current) && currentModel) return
  if (restorePersistedModelSelection()) return
  const configured = MODEL_PROVIDERS.find(isProviderConfigured) || getCustomProviders()[0] || getCustomProvider()
  if (configured) {
    currentModelProvider = configured.slug
    currentModel = configured.models.includes(currentModel) ? currentModel : configured.models[0]
    if (!karnaConfig.models) karnaConfig.models = {}
    karnaConfig.models.default = currentModel
    persistCurrentModelSelection()
  }
}

const resolveUsableModelSelection = input => {
  const requestedProviderSlug = String(input?.provider || '').trim()
  const requestedModel = String(input?.model || '').trim()
  const requestedProvider = findProvider(requestedProviderSlug)
  if (requestedProvider && isProviderConfigured(requestedProvider) && requestedModel) {
    return { provider: requestedProvider, model: requestedModel }
  }

  ensureCurrentConfiguredProvider()
  const currentProvider = findProvider(currentModelProvider)
  if (currentProvider && isProviderConfigured(currentProvider) && currentModel) {
    return { provider: currentProvider, model: currentModel }
  }

  const configured = MODEL_PROVIDERS.find(isProviderConfigured) || getCustomProviders()[0] || getCustomProvider()
  if (configured) {
    currentModelProvider = configured.slug
    currentModel = configured.models.includes(requestedModel) ? requestedModel : (configured.models[0] || requestedModel)
    if (!karnaConfig.models) karnaConfig.models = {}
    karnaConfig.models.default = currentModel
    persistCurrentModelSelection()
    if (currentModel) return { provider: configured, model: currentModel }
  }

  return { provider: null, model: '' }
}

const getConfiguredProviders = () => {
  const providers = MODEL_PROVIDERS.map(providerWithCapabilities)
  return [...providers, ...getCustomProviders()]
}

const getModelOptionsPayload = () => {
  ensureCurrentConfiguredProvider()
  const current = findProvider(currentModelProvider)
  if (current && !current.models.includes(currentModel)) currentModel = current.models[0] || currentModel
  return {
    provider: current?.slug || '',
    model: current ? currentModel : '',
    providers: getConfiguredProviders(),
    custom_models: readCustomModels().map(publicCustomModel)
  }
}

const findProvider = slug => {
  const key = String(slug || '').toLowerCase()
  if (!key) return null
  if (key.startsWith('custom:')) return getCustomProvider(key.slice('custom:'.length)) || { slug: key, name: 'Custom model', key_env: customEnvKey(key.slice('custom:'.length)), models: [] }
  if (key === 'custom') return getCustomProvider() || { slug: 'custom', name: 'Legacy custom / OpenAI-compatible', key_env: 'CUSTOM_API_KEY', models: [] }
  return MODEL_PROVIDERS.find(p => String(p.slug).toLowerCase() === key) || null
}

const findProviderByEnv = envKey =>
  MODEL_PROVIDERS.find(p => String(p.key_env).toLowerCase() === String(envKey || '').toLowerCase()) || null

const getBackendEnvPath = () => {
  const dir = findKarnaBackendDir()
  return dir ? path.join(dir, '.env') : path.join(KARNA_DATA_ROOT, '.env')
}

const parseEnvFile = () => {
  const env = {}
  try {
    const text = fs.readFileSync(getBackendEnvPath(), 'utf8')
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#') || !line.includes('=')) continue
      const idx = line.indexOf('=')
      const key = line.slice(0, idx).trim()
      let value = line.slice(idx + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (key) env[key] = value
    }
  } catch {
    // Missing .env is fine.
  }
  return env
}

const modelCredentialStore = createModelCredentialStore({ safeStorage, userDataPath: app.getPath('userData') })
const getEnvValue = key => app.isPackaged
  ? modelCredentialStore.get(key)
  : process.env[key] || parseEnvFile()[key] || ''
const customModelStore = createCustomModelStore({
  fs,
  getCustomModelsPath,
  getEnvValue,
  path
})
const readCustomModels = customModelStore.readCustomModels
const writeCustomModels = customModelStore.writeCustomModels
const publicCustomModel = customModelStore.publicCustomModel
const getCustomProvider = customModelStore.getCustomProvider
const getCustomProviders = customModelStore.getCustomProviders
const isProviderConfigured = provider => {
  if (!provider) return false
  if (String(provider.slug || '').startsWith('custom:')) return provider.authenticated === true
  if (provider.slug === 'custom') return !!(getEnvValue('CUSTOM_BASE_URL').trim() && getEnvValue('CUSTOM_MODEL_NAME').trim())
  return !!getEnvValue(provider.key_env).trim()
}
const modelRouter = createModelRouter({ isProviderConfigured, readCustomModels })
const findUsableImageModel = modelRouter.findUsableImageModel
const routeModelForPrompt = modelRouter.routeModelForPrompt

const writeEnvValue = (key, value) => {
  if (app.isPackaged) {
    modelCredentialStore.set(key, value)
    return
  }
  const envPath = getBackendEnvPath()
  fs.mkdirSync(path.dirname(envPath), { recursive: true })
  let lines = []
  try {
    lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  } catch {
    lines = []
  }
  let found = false
  const escaped = String(value ?? '').replace(/\r?\n/g, '')
  lines = lines.map(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return line
    const existing = trimmed.slice(0, trimmed.indexOf('=')).trim()
    if (existing === key) {
      found = true
      return `${key}=${escaped}`
    }
    return line
  }).filter((line, index, arr) => !(index === arr.length - 1 && line === ''))
  if (!found) lines.push(`${key}=${escaped}`)
  fs.writeFileSync(envPath, `${lines.join('\n')}\n`, 'utf8')
  if (escaped) process.env[key] = escaped
  else delete process.env[key]
}

const deleteEnvValue = key => {
  if (app.isPackaged) {
    modelCredentialStore.remove(key)
    return
  }
  const envPath = getBackendEnvPath()
  let lines = []
  try {
    lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  } catch {
    lines = []
  }
  lines = lines.filter(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return true
    return trimmed.slice(0, trimmed.indexOf('=')).trim() !== key
  })
  fs.writeFileSync(envPath, `${lines.filter((line, index, arr) => !(index === arr.length - 1 && line === '')).join('\n')}\n`, 'utf8')
  delete process.env[key]
}

const envInfo = provider => {
  const value = getEnvValue(provider.key_env)
  return {
    advanced: false,
    category: 'models',
    description: `API key for ${provider.name}.`,
    is_password: true,
    is_set: !!value.trim(),
    provider: provider.slug,
    provider_label: provider.provider_label || provider.name,
    redacted_value: value ? `${value.slice(0, 4)}?${value.slice(-4)}` : null,
    tools: [],
    url: null
  }
}

// In-memory config store
const { CONFIG_SCHEMA, createDefaultConfig } = require('./karna/config-service.cjs')
let karnaConfig = createDefaultConfig()
let karnaConfigDefaults = createDefaultConfig()
const karnaConfigSchema = CONFIG_SCHEMA

const stripLegacyPersonalityConfig = config => {
  const source = config && typeof config === 'object' ? config : {}
  const display = source.display && typeof source.display === 'object' ? { ...source.display } : {}
  delete display.personality
  return { ...source, display }
}

const publicKarnaConfig = () => ({ ...stripLegacyPersonalityConfig(karnaConfig), mcp_servers: readMcpServers() })

// ---------------------------------------------------------------------------
// Backend Launcher
// ---------------------------------------------------------------------------

/**
 * Find the Karna backend directory.
 * Looks for an optional Karna FastAPI backend beside this Hermes-based tree.
 */
function findKarnaBackendDir() {
  // Try common locations
  const candidates = [
    path.resolve(__dirname, '..', '..', '..', 'backend'),
    path.resolve(__dirname, '..', '..', 'backend')
  ]
  for (const dir of candidates) {
    const mainPy = path.join(dir, 'main.py')
    try {
      if (fs.existsSync(mainPy)) return dir
    } catch {
      // continue
    }
  }
  return null
}

/**
 * Find a Python executable.
 */
function findPython() {
  const { execFileSync } = require('node:child_process')
  const candidates = ['python', 'python3', 'py']
  for (const cmd of candidates) {
    try {
      execFileSync(cmd, ['--version'], { stdio: 'pipe', timeout: 3000 })
      return cmd
    } catch {
      // continue
    }
  }
  return 'python'
}

const runConnectorBridge = createConnectorBridge({
  dataRoot: KARNA_DATA_ROOT,
  findPython,
  notConfigured,
  projectRoot: path.resolve(__dirname, '..', '..', '..')
})

/**
 * Start the Karna Python backend (uvicorn).
 */
function startKarnaBackend() {
  const backendDir = findKarnaBackendDir()
  if (!backendDir) {
    rememberLog('WARNING: Could not find Karna backend directory. Running in mock mode.')
    backendReady = true
    return Promise.resolve()
  }

  const pythonCmd = findPython()
  rememberLog(`Starting Karna backend from ${backendDir} using ${pythonCmd}`)

  return new Promise((resolve, reject) => {
    const args = ['-m', 'uvicorn', 'main:app', '--host', KARNA_BACKEND_HOST, '--port', String(KARNA_BACKEND_PORT)]
    karnaProcess = spawn(pythonCmd, args, {
      cwd: backendDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })

    karnaProcess.stdout.on('data', d => rememberLog(`[backend:stdout] ${d.toString().trim()}`))
    karnaProcess.stderr.on('data', d => rememberLog(`[backend:stderr] ${d.toString().trim()}`))

    karnaProcess.once('error', err => {
      rememberLog(`Karna backend failed to start: ${err.message}`)
      // Fall back to mock mode
      backendReady = true
      resolve()
    })

    karnaProcess.once('exit', (code, signal) => {
      rememberLog(`Karna backend exited (code=${code}, signal=${signal})`)
      karnaProcess = null
      backendReady = false
    })

    // Wait for health check
    const startTime = Date.now()
    const healthCheck = setInterval(() => {
      if (Date.now() - startTime > BACKEND_STARTUP_TIMEOUT_MS) {
        clearInterval(healthCheck)
        rememberLog('Backend startup timeout. Running in mock mode.')
        backendReady = true
        resolve()
        return
      }
      checkBackendHealth()
        .then(() => {
          clearInterval(healthCheck)
          backendReady = true
          rememberLog('Karna backend is ready.')
          resolve()
        })
        .catch(() => {
          // not ready yet, keep polling
        })
    }, HEALTH_CHECK_INTERVAL_MS)
  })
}

/**
 * Check if the Karna backend is healthy.
 */
function checkBackendHealth() {
  return new Promise((resolve, reject) => {
    const req = http.get(`${karnaBackendUrl}/health`, { timeout: 2000 }, res => {
      if (res.statusCode === 200) {
        res.resume()
        resolve()
      } else {
        res.resume()
        reject(new Error(`Health check returned ${res.statusCode}`))
      }
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Health check timeout'))
    })
  })
}

/**
 * Make a JSON request to the Karna backend.
 */
function karnaBackendFetch(pathname, options = {}) {
  const method = options.method || 'GET'
  const body = options.body ? JSON.stringify(options.body) : null
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, karnaBackendUrl)
    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {})
        },
        timeout: options.timeoutMs || 30_000
      },
      res => {
        let data = ''
        res.on('data', chunk => {
          data += chunk
        })
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) })
          } catch {
            resolve({ status: res.statusCode, data })
          }
        })
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
    if (body) req.write(body)
    req.end()
  })
}

// The compatibility adapter owns Karna-only desktop features, while Context/Token
// OS is served by the primary Hermes backend.  Internal adapter calls therefore
// need an explicit bridge; otherwise they silently target the optional legacy
// backend on :8710 and token accounting is never persisted in a normal desktop
// installation.
let hermesApiBridge = null

function setHermesApiBridge(bridge) {
  hermesApiBridge = typeof bridge === 'function' ? bridge : null
}

async function contextBackendFetch(pathname, options = {}) {
  if (!hermesApiBridge) return karnaBackendFetch(pathname, options)
  try {
    const data = await hermesApiBridge({
      path: pathname,
      method: options.method || 'GET',
      body: options.body,
      timeoutMs: options.timeoutMs
    })
    return { status: 200, data }
  } catch (error) {
    const status = Number(error?.status || error?.statusCode || 500)
    return {
      status,
      data: {
        detail: error instanceof Error ? error.message : String(error)
      }
    }
  }
}

async function chatBackendFetch(options = {}) {
  const body = options.body || {}
  const provider = String(body.provider || currentModelProvider || '')
  const model = String(body.model || currentModel || '')
  const configured = findProvider(provider)
  if (!provider || !model || !configured || !isProviderConfigured(configured)) {
    return karnaBackendFetch('/api/chat', options)
  }
  try {
    const result = await callChatCompletion(provider, model, body.messages || [], {
      timeoutMs: options.timeoutMs || 300_000,
      maxTokens: body.max_tokens || body.maxOutputTokens,
      includeUsage: true
    })
    return {
      status: 200,
      data: {
        content: result.content,
        usage: result.usage || {},
        provider,
        model
      }
    }
  } catch (error) {
    return {
      status: 502,
      data: { detail: error instanceof Error ? error.message : String(error) }
    }
  }
}


const completionUrlForBase = baseUrl => {
  const clean = String(baseUrl || '').trim().replace(/\/+$/, '')
  if (!clean) return ''
  return clean.endsWith('/chat/completions') ? clean : `${clean}/chat/completions`
}

const postJsonUrl = (urlText, headers, payload, timeoutMs = 20_000) => new Promise((resolve, reject) => {
  let url
  try {
    url = new URL(urlText)
  } catch {
    reject(new Error(`Invalid base_url: ${urlText}`))
    return
  }
  const client = url.protocol === 'https:' ? https : http
  const body = JSON.stringify(payload)
  const req = client.request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers },
    timeout: timeoutMs
  }, res => {
    let data = ''
    res.on('data', chunk => { data += chunk })
    res.on('end', () => {
      let parsed = data
      try { parsed = data ? JSON.parse(data) : {} } catch {}
      resolve({ status: res.statusCode || 0, data: parsed })
    })
  })
  req.on('error', reject)
  req.on('timeout', () => {
    req.destroy()
    reject(new Error('Model test timeout'))
  })
  req.write(body)
  req.end()
})

const embeddingModels = createEmbeddingModelService({
  getEnvValue,
  normalizeApiKey,
  postJsonUrl,
  publicCustomModel,
  readCustomModels
})
const getEmbeddingModelRow = embeddingModels.getEmbeddingModelRow
const embedTexts = embeddingModels.embedTexts


const testOpenAICompatibleModel = async ({ base_url, model_name, api_key }) => {
  const baseUrl = String(base_url || '').trim().replace(/\/+$/, '')
  const modelName = String(model_name || '').trim()
  if (!baseUrl || !modelName) return { ok: false, reachable: false, message: 'base_url and model_name are required.' }
  const cleanKey = normalizeApiKey(api_key)
  const headers = cleanKey ? { Authorization: `Bearer ${cleanKey}` } : {}
  try {
    const response = await postJsonUrl(completionUrlForBase(baseUrl), headers, {
      model: modelName,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
      max_tokens: 8,
      temperature: 0
    })
    if (response.status < 200 || response.status >= 300) {
      const detail = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
      return { ok: false, reachable: true, status: response.status, message: `HTTP ${response.status}: ${detail.slice(0, 500)}` }
    }
    const content = response.data?.choices?.[0]?.message?.content ?? response.data?.choices?.[0]?.text ?? ''
    if (!String(content).trim()) return { ok: false, reachable: true, status: response.status, message: 'Endpoint responded but no chat content was returned.' }
    return { ok: true, reachable: true, status: response.status, message: 'Chat model test passed.', sample: String(content).slice(0, 120) }
  } catch (err) {
    return { ok: false, reachable: false, message: err instanceof Error ? err.message : String(err) }
  }
}

const artifactsService = createArtifactsService({
  crypto,
  readJsonState: readBackendJson,
  writeJsonState: writeBackendJson
})
const recordArtifact = artifactsService.recordArtifact
const readArtifacts = artifactsService.readArtifacts

const imageModels = createImageModelService({
  getEnvValue,
  normalizeApiKey,
  postJsonUrl,
  recordArtifact
})


const testCustomModelByType = async row => {
  if (row.type === 'image') return imageModels.testImageModel(row)
  if (row.type === 'embedding') return embeddingModels.testEmbeddingModel(row)
  if (row.type === 'chat' || row.type === 'vision') return testOpenAICompatibleModel(row)
  return { ok: true, reachable: true, message: `${row.type} model saved. No universal live test is available for this model type yet.` }
}

const customModelController = createCustomModelController({
  crypto,
  getEnvValue,
  publicCustomModel,
  readCustomModels,
  testCustomModelByType,
  writeCustomModels,
  writeEnvValue
})

const managedSkills = createSkillsService({
  env: process.env,
  fs,
  notConfigured,
  path,
  readJsonState: readBackendJson,
  rememberLog,
  repoRoot: path.resolve(__dirname, '..', '..', '..'),
  skillI18n,
  writeJsonState: writeBackendJson,
  writeInventoryState: writeBackendJsonAtomic
})

const getUserSkillRoot = () => path.join(process.env.USERPROFILE || 'D:\\Agent', '.codex', 'skills')

const skillImportService = createSkillImportService({
  fs,
  path,
  crypto,
  karnaPaths,
  getUserSkillRoot,
  rememberLog,
  rescanSkills: () => managedSkills.scanSkills()
})

const readMcpServers = () => {
  const raw = readBackendJson('mcp_servers.json', { version: 1, servers: {} })
  if (Array.isArray(raw)) return Object.fromEntries(raw.filter(Boolean).map(row => [String(row.name || row.id || '').trim(), row]).filter(([name]) => name))
  if (raw.servers && typeof raw.servers === 'object' && !Array.isArray(raw.servers)) return raw.servers
  return {}
}
const writeMcpServers = servers => writeBackendJson('mcp_servers.json', { version: 1, servers: servers || {} })
const mcpServerList = () => Object.entries(withBuiltinMcpServers(readMcpServers())).map(([name, value]) => ({ name, ...(value || {}), enabled: value?.enabled !== false }))

const capabilitiesService = createCapabilitiesService({
  env: process.env,
  fs,
  notConfigured,
  path,
  readJsonState: readBackendJson,
  rememberLog,
  writeJsonState: writeBackendJson,
  listMcpServers: mcpServerList,
  listSkills: () => managedSkills.scanSkills(),
  listArtifacts: () => readArtifacts().artifacts
})
const toolsetRows = capabilitiesService.toolsetRows
const toolsetConfig = capabilitiesService.toolsetConfig
const setToolsetEnabled = capabilitiesService.setToolsetEnabled
const setToolsetProvider = capabilitiesService.setToolsetProvider
const scanPlugins = capabilitiesService.scanPlugins
const setPluginEnabled = capabilitiesService.setPluginEnabled

const KARNA_PLUGIN_NAME_ZH = {
  'karna.calendar': '日历',
  'karna.chrome': '浏览器',
  'karna.computer-use': '桌面控制',
  'karna.documents': '文档',
  'karna.email': '邮件',
  'karna.local-files': '本地文件',
  'karna.ocr': 'OCR 识别',
  'karna.pdf': 'PDF',
  'karna.presentations': '演示文稿',
  'karna.spreadsheets': '电子表格',
  'karna.web-research': '网页研究',
  'karna.zotero': 'Zotero 文献'
}

const KARNA_PLUGIN_DESC_ZH = {
  'karna.calendar': '连接 Google Calendar 和 Microsoft 365 日历，管理日程、会议与提醒。',
  'karna.chrome': '使用隔离浏览器或已登录 Chrome 会话浏览网页、读取资料与执行网页任务。',
  'karna.computer-use': '通过鼠标、键盘、截图和拖拽控制桌面应用。',
  'karna.documents': '读取、创建、编辑、批注并验证 DOCX 文档。',
  'karna.email': '连接 Gmail 和 Outlook/Microsoft 365，读取、整理和发送邮件。',
  'karna.local-files': '在项目目录中读取、写入、搜索、预览和管理本地文件。',
  'karna.ocr': '从图片和扫描 PDF 中识别文字，并保留页码与区域引用。',
  'karna.pdf': '读取、提取、OCR、创建、合并、拆分和渲染 PDF，并进行结果验证。',
  'karna.presentations': '读取、创建、编辑和渲染 PPTX 演示文稿，并进行视觉验证。',
  'karna.spreadsheets': '读取、创建和编辑 XLSX/CSV 表格，保留公式与格式。',
  'karna.web-research': '搜索、抓取、引用来源、去重资料，并生成证据包。',
  'karna.zotero': '连接本地 Zotero，检索文献、读取元数据并导入引用。'
}

const PERMISSION_ZH = {
  'browser:isolated': '隔离浏览器',
  'browser:login-session': '登录浏览器会话',
  'calendar:read': '读取日历',
  'calendar:write': '写入日历',
  'clipboard': '剪贴板访问',
  'desktop:control': '桌面控制',
  'email:modify': '修改邮件',
  'email:read': '读取邮件',
  'email:send': '发送邮件',
  'filesystem:project': '项目文件读写',
  'filesystem:read': '读取文件',
  'filesystem:write': '写入文件',
  'network:local': '本地网络访问',
  'network:request': '网络访问',
  'oauth:desktop': '桌面 OAuth 授权',
  'process:bundled-runtime': '内置运行时进程',
  'screen:capture': '屏幕截图',
  'zotero:local': '本地 Zotero'
}

function releaseResourceCandidates(name) {
  return [
    process.resourcesPath ? path.join(process.resourcesPath, name) : null,
    path.resolve(__dirname, '..', '..', '..', 'karna-builtin', name.replace(/^builtin-/, '')),
    path.resolve(__dirname, '..', '..', '..', name)
  ].filter(Boolean)
}

function firstExistingDir(candidates) {
  return candidates.find(dir => {
    try {
      return fs.existsSync(dir) && fs.statSync(dir).isDirectory()
    } catch {
      return false
    }
  }) || candidates[0]
}

function listDirs(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => path.join(root, entry.name))
  } catch {
    return []
  }
}

function readReleaseJsonFile(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    rememberLog(`[release-resources] failed to read ${file}: ${err.message}`)
    return fallback
  }
}

function extractSkillDescription(text) {
  const fm = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/m)?.[1] || ''
  const desc = fm.match(/^description:\s*(.+)$/mi)?.[1] || text.match(/^description:\s*(.+)$/mi)?.[1] || ''
  return String(desc).trim().replace(/^['"]|['"]$/g, '')
}

function scanReleaseSkills() {
  const root = firstExistingDir(releaseResourceCandidates('builtin-skills'))
  const state = readBackendJson('skills_state.json', { version: 1, enabled: {} })
  const enabledMap = normalizeStateMap(state.enabled)
  return listDirs(root).map(dir => {
    const id = path.basename(dir)
    const skillPath = path.join(dir, 'SKILL.md')
    const text = fs.existsSync(skillPath) ? fs.readFileSync(skillPath, 'utf8') : ''
    const description = skillI18n.translateSkillDescription(id, extractSkillDescription(text))
    const category = id.startsWith('karna-') ? 'writing' : 'productivity'
    return {
      id,
      name: skillI18n.translateSkillName(id),
      version: '1.0.0',
      description,
      category: skillI18n.translateCategory(category),
      domains: id.startsWith('karna-') ? ['写作', 'Karna 官方'] : ['效率', '内置'],
      tags: id.startsWith('karna-') ? ['Karna 官方', 'Writer OS'] : ['内置 Skill'],
      language: 'zh-CN',
      risk_level: 'low',
      license: 'MIT',
      is_enabled: enabledMap[id] !== false,
      is_builtin: true,
      source_pack: 'Karna 官方内置',
      source_plugin: '',
      plugin_id: 'karna.official-skills',
      install_path: skillPath,
      variants: ['内置版本'],
      active_variant: '内置版本',
      confidence: id.startsWith('karna-') ? 1 : 0.92
    }
  }).sort((a, b) => Number(b.id.startsWith('karna-')) - Number(a.id.startsWith('karna-')) || a.id.localeCompare(b.id))
}


function scanMarketplaceSkills() {
  const root = firstExistingDir(releaseResourceCandidates('skill-marketplace'))
  const manifest = readReleaseJsonFile(path.join(root || '', 'manifest.json'), { entries: [] }) || { entries: [] }
  const state = readBackendJson('skills_state.json', { version: 1, enabled: {}, installed_marketplace: {} })
  const enabledMap = normalizeStateMap(state.enabled)
  const installedMap = normalizeStateMap(state.installed_marketplace)
  return (Array.isArray(manifest.entries) ? manifest.entries : []).map(entry => {
    const id = String(entry.id || entry.slug || '').trim()
    return {
      id,
      name: String(entry.name || entry.slug || id),
      version: '1.0.0',
      description: String(entry.description || 'Karna \u5916\u7f6e Skill\u3002'),
      category: String(entry.category || '\u6269\u5c55 Skill'),
      domains: [String(entry.category || '\u6269\u5c55 Skill')],
      tags: [String(entry.source_pack || 'Karna \u5916\u7f6e Skill \u5e02\u573a'), entry.risk_level === 'high' ? '\u9ad8\u6743\u9650' : '\u6269\u5c55\u5e02\u573a'].filter(Boolean),
      language: 'zh-CN',
      risk_level: String(entry.risk_level || 'low'),
      license: '\u6309 Skill \u58f0\u660e',
      is_enabled: Boolean(installedMap[id]) && enabledMap[id] !== false,
      is_builtin: false,
      is_marketplace: true,
      is_installed: Boolean(installedMap[id]),
      source_pack: String(entry.source_pack || 'Karna \u5916\u7f6e Skill \u5e02\u573a'),
      source_plugin: '',
      plugin_id: 'karna.external-skill-marketplace',
      install_path: path.join(root || '', String(entry.relative_path || '')),
      marketplace_path: path.join(root || '', String(entry.relative_path || '')),
      variants: ['\u6269\u5c55\u5e02\u573a'],
      active_variant: '\u6269\u5c55\u5e02\u573a',
      confidence: 0.86
    }
  }).filter(row => row.id)
}

function copyDirSafe(src, dest) {
  if (!src || !fs.existsSync(src)) throw new Error(`\u6e90\u76ee\u5f55\u4e0d\u5b58\u5728\uff1a${src}`)
  const blocked = /(^|[\/])(?:\.git|node_modules|\.venv|venv|__pycache__|\.pytest_cache|test|tests|test-results)([\/]|$)/i
  const copy = (from, to) => {
    const st = fs.statSync(from)
    if (st.isDirectory()) {
      if (blocked.test(from)) return
      fs.mkdirSync(to, { recursive: true })
      for (const child of fs.readdirSync(from)) copy(path.join(from, child), path.join(to, child))
      return
    }
    if (!st.isFile()) return
    if (blocked.test(from) || /\.(log|map|patch|bak|tmp)$/i.test(from)) return
    fs.mkdirSync(path.dirname(to), { recursive: true })
    fs.copyFileSync(from, to)
  }
  fs.rmSync(dest, { recursive: true, force: true })
  copy(src, dest)
}

function installMarketplaceSkill(id) {
  const skill = scanMarketplaceSkills().find(row => row.id === id)
  if (!skill) return notConfigured('skills', `\u672a\u627e\u5230\u5916\u7f6e Skill\uff1a${id}`)
  const dest = path.join(getUserSkillRoot(), skill.id.replace(/[^A-Za-z0-9_.-]+/g, '-'))
  try {
    copyDirSafe(skill.marketplace_path, dest)
    const state = readBackendJson('skills_state.json', { version: 1, enabled: {}, installed_marketplace: {} })
    state.enabled = normalizeStateMap(state.enabled)
    state.installed_marketplace = normalizeStateMap(state.installed_marketplace)
    state.enabled[id] = true
    state.installed_marketplace[id] = true
    writeBackendJson('skills_state.json', state)
    return { ok: true, skill_id: id, install_path: dest, message: 'Skill \u5df2\u5b89\u88c5\u5e76\u542f\u7528\u3002' }
  } catch (err) {
    return notConfigured('skills', `\u5b89\u88c5 Skill \u5931\u8d25\uff1a${err.message}`)
  }
}

function scanReleasePlugins() {
  const root = firstExistingDir(releaseResourceCandidates('builtin-plugins'))
  const state = readBackendJson('plugins.json', { version: 1, enabled: {} })
  const enabledMap = normalizeStateMap(state.enabled)
  return listDirs(root).map(dir => {
    const manifest = readReleaseJsonFile(path.join(dir, 'karna-plugin.json'), {}) || {}
    const id = String(manifest.id || path.basename(dir))
    const permissions = Array.isArray(manifest.permissions) ? manifest.permissions : []
    return {
      id,
      name: KARNA_PLUGIN_NAME_ZH[id] || manifest.name || id,
      version: manifest.version || '1.0.0',
      publisher_id: 'karna',
      publisher_name: 'Karna 官方',
      description: KARNA_PLUGIN_DESC_ZH[id] || manifest.description || 'Karna 官方内置插件。',
      category: '内置插件',
      status: enabledMap[id] === false ? 'disabled' : 'active',
      health_status: 'ready',
      is_builtin: true,
      is_active: enabledMap[id] !== false,
      permissions,
      permissions_granted: permissions,
      permission_labels: permissions.map(permission => PERMISSION_ZH[permission] || permission),
      platforms: ['windows'],
      source_type: 'bundled',
      source_url: 'karna://builtin',
      sha256: '',
      rollback_version: manifest.version || '1.0.0',
      capabilities: Array.isArray(manifest.capabilities) ? manifest.capabilities : [],
      entrypoints: manifest.entrypoints || {},
      install_path: dir,
      skills: [],
      mcp_servers: [],
      has_update: false
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
}

function releaseSkillPacks() {
  const builtinSkills = scanReleaseSkills()
  const marketplaceSkills = scanMarketplaceSkills()
  const byCategory = new Map()
  for (const skill of marketplaceSkills) {
    const key = skill.category || '\u6269\u5c55 Skill'
    if (!byCategory.has(key)) byCategory.set(key, [])
    byCategory.get(key).push(skill)
  }
  const packs = [{
    id: 'karna.official-skills',
    version: '1.0.0',
    category: 'Karna \u5b98\u65b9',
    name: 'Karna \u5b98\u65b9\u5185\u7f6e Skill \u5305',
    description: '\u968f\u5b89\u88c5\u5305\u79bb\u7ebf\u63d0\u4f9b\u7684 Karna \u5b98\u65b9\u5199\u4f5c\u3001\u7814\u7a76\u3001\u6587\u6863\u3001\u6d4f\u89c8\u5668\u548c\u521b\u610f Skill\u3002',
    skills_count: builtinSkills.length,
    size_bytes: 0,
    source_type: 'bundled',
    source_url: 'karna://builtin-skills',
    is_active: true,
    skills: builtinSkills
  }, {
    id: 'karna.external-skill-marketplace',
    version: '1.0.0',
    category: '\u5916\u7f6e Skill \u5e02\u573a',
    name: 'Karna \u5916\u7f6e Skill \u5e02\u573a\u5168\u96c6',
    description: '\u5b89\u88c5\u5305\u5185\u7f6e\u7684\u53ef\u9009\u5916\u7f6e Skill \u4e0b\u8f7d\u533a\u3002\u9ed8\u8ba4\u4e0d\u542f\u7528\uff1b\u7528\u6237\u53ef\u6309\u9700\u5b89\u88c5\u3002',
    skills_count: marketplaceSkills.length,
    size_bytes: 0,
    source_type: 'bundled-marketplace',
    source_url: 'karna://skill-marketplace',
    is_active: true,
    skills: marketplaceSkills
  }]
  for (const [category, skills] of byCategory) {
    packs.push({
      id: `karna.marketplace.${String(category).replace(/\s+/g, '-').toLowerCase()}`,
      version: '1.0.0',
      category: '\u5916\u7f6e Skill \u5e02\u573a',
      name: `${category} Skill \u6269\u5c55\u5305`,
      description: `Karna \u5916\u7f6e Skill \u5e02\u573a\u4e2d\u7684\u300c${category}\u300d\u5206\u7c7b\uff0c\u53ef\u6309\u9700\u5b89\u88c5\u3002`,
      skills_count: skills.length,
      size_bytes: 0,
      source_type: 'bundled-marketplace',
      source_url: 'karna://skill-marketplace',
      is_active: true,
      skills
    })
  }
  return packs
}

function handleKarnaPluginPlatform(reqPath, method, body) {
  if ((reqPath === '/api/karna/plugins' || reqPath.startsWith('/api/karna/plugins?')) && method === 'GET') {
    return { ok: true, plugins: scanReleasePlugins() }
  }
  const pluginEnableMatch = reqPath.match(/^\/api\/karna\/plugins\/([^/?]+)\/enable(?:\?|$)/)
  if (pluginEnableMatch && method === 'POST') {
    const id = decodeURIComponent(pluginEnableMatch[1])
    const enabled = body?.enabled !== false
    const state = readBackendJson('plugins.json', { version: 1, enabled: {} })
    state.enabled = normalizeStateMap(state.enabled)
    state.enabled[id] = enabled
    writeBackendJson('plugins.json', state)
    return { ok: true, plugin_id: id, enabled }
  }
  const pluginMatch = reqPath.match(/^\/api\/karna\/plugins\/([^/?]+)$/)
  if (pluginMatch && method === 'GET') {
    const id = decodeURIComponent(pluginMatch[1])
    const plugin = scanReleasePlugins().find(row => row.id === id)
    return plugin || notConfigured('plugins', `插件不存在：${id}`)
  }
  if ((reqPath === '/api/karna/skills' || reqPath.startsWith('/api/karna/skills?')) && method === 'GET') {
    return { ok: true, skills: [...scanReleaseSkills(), ...scanMarketplaceSkills()] }
  }
  const skillEnableMatch = reqPath.match(/^\/api\/karna\/skills\/([^/?]+)\/enable(?:\?|$)/)
  if (skillEnableMatch && method === 'POST') {
    const id = decodeURIComponent(skillEnableMatch[1])
    const enabled = !reqPath.includes('enabled=false') && body?.enabled !== false
    const state = readBackendJson('skills_state.json', { version: 1, enabled: {} })
    state.enabled = normalizeStateMap(state.enabled)
    state.enabled[id] = enabled
    writeBackendJson('skills_state.json', state)
    return { ok: true, skill_id: id, enabled }
  }
  if ((reqPath === '/api/karna/skill-packs' || reqPath.startsWith('/api/karna/skill-packs?')) && method === 'GET') {
    return { ok: true, skill_packs: releaseSkillPacks() }
  }
  const skillInstallMatch = reqPath.match(/^\/api\/karna\/skills\/([^/?]+)\/install(?:\?|$)/)
  if (skillInstallMatch && method === 'POST') {
    return installMarketplaceSkill(decodeURIComponent(skillInstallMatch[1]))
  }
  if (reqPath === '/api/karna/skill-packs/install' && method === 'POST') {
    const source = String(body?.source || body?.id || '').trim()
    return { ok: true, job_id: `skill-pack-${Date.now()}`, state: 'completed', phase: 'active', progress: 100, operation: 'install', source: source || 'karna://skill-marketplace', plugin_id: source || 'karna.external-skill-marketplace', plugin_name: 'Karna Skill \u6269\u5c55\u5305', created_at: Date.now() / 1000, updated_at: Date.now() / 1000, message: '\u5916\u7f6e Skill \u5e02\u573a\u5df2\u968f\u5b89\u88c5\u5305\u79bb\u7ebf\u5185\u7f6e\uff0c\u8bf7\u5728\u201c\u6240\u6709 Skill\u201d\u91cc\u9010\u4e2a\u5b89\u88c5\u6216\u542f\u7528\u3002' }
  }
  if (reqPath.includes('/preflight') || reqPath.includes('/install') || reqPath.includes('/update') || reqPath.includes('/rollback')) {
    return notConfigured('plugins', '\u5f53\u524d\u7248\u672c\u5df2\u5185\u7f6e\u79bb\u7ebf\u63d2\u4ef6\u548c Skill \u5e02\u573a\uff1b\u8bf7\u5728\u201c\u6240\u6709 Skill\u201d\u91cc\u9009\u62e9\u9700\u8981\u7684 Skill \u540e\u542f\u7528\u3002')
  }
  return null
}

const resolveExecutable = command => {
  const cmd = String(command || '').trim()
  if (!cmd) return null
  if (path.isAbsolute(cmd)) return fs.existsSync(cmd) ? cmd : null
  try { return String(execFileSync('where.exe', [cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).split(/\r?\n/).map(x => x.trim()).find(Boolean) || null } catch { return null }
}

const httpProbe = url => new Promise(resolve => {
  const target = String(url || '').trim()
  if (!/^https?:\/\//i.test(target)) return resolve({ ok: false, error: 'MCP url must start with http:// or https://.' })
  const client = target.startsWith('https:') ? https : http
  const req = client.request(target, { method: 'GET', timeout: 5000 }, res => {
    res.resume()
    resolve({ ok: res.statusCode >= 200 && res.statusCode < 500, status: res.statusCode, message: `HTTP ${res.statusCode}` })
  })
  req.on('timeout', () => { req.destroy(new Error('timeout')) })
  req.on('error', err => resolve({ ok: false, error: err.message }))
  req.end()
})

const testMcpServer = async server => {
  if (!server || typeof server !== 'object') return notConfigured('mcp', 'MCP server config is missing.')
  if (server.transport === 'builtin') return { ok: true, transport: 'builtin', tools: server.tools || [], message: 'Karna built-in MCP tools are available.' }
  if (server.enabled === false) return notConfigured('mcp', 'MCP server is disabled.')
  const url = server.url || server.endpoint
  if (url) {
    const probe = await httpProbe(url)
    return probe.ok ? { ok: true, transport: 'http', url, status: probe.status, message: probe.message } : notConfigured('mcp', probe.error || probe.message || 'MCP HTTP probe failed.', { transport: 'http', url, status: probe.status })
  }
  const command = server.command || server.cmd
  if (command) {
    const resolved = resolveExecutable(command)
    return resolved ? { ok: true, transport: 'stdio', command, resolved, message: 'Command executable found. Long-running MCP process was not started during test.' } : notConfigured('mcp', `Executable not found: ${command}`, { transport: 'stdio', command })
  }
  return notConfigured('mcp', 'MCP server needs either url or command.')
}

const BUILTIN_MCP_SERVERS = {
  'karna-writer': {
    name: 'karna-writer',
    enabled: true,
    transport: 'builtin',
    description: 'Karna 文字工作者项目工具：章节、人物、世界观、资料和导出。',
    tools: ['knowledge_search', 'list_writer_skills', 'read_skill', 'list_artifacts', 'manuscript_outline', 'project_list', 'project_create', 'project_open', 'project_save', 'project_export', 'project_status', 'find_skill', 'create_skill']
  }
}
const withBuiltinMcpServers = servers => ({ ...BUILTIN_MCP_SERVERS, ...(servers || {}) })


const KNOWLEDGE_COLLECTION_ID = 'global_knowledge'
const getKnowledgeDefaultFolder = () => karnaPaths.knowledgeBaseFile({}).replace(/knowledge_base\.json$/, 'knowledge')
const knowledgeFolderUsage = folders => {
  const rows = []
  let totalBytes = 0
  let totalFiles = 0
  for (const folder of [...new Set((folders || []).map(value => path.resolve(String(value || ''))).filter(Boolean))]) {
    let bytes = 0
    let files = 0
    const pending = [folder]
    while (pending.length && files < 100_000) {
      const current = pending.pop()
      try {
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
          const full = path.join(current, entry.name)
          if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(full)
          else if (entry.isFile()) {
            bytes += fs.statSync(full).size
            files += 1
          }
        }
      } catch {
        // Missing or inaccessible folders remain visible with zero usage.
      }
    }
    rows.push({ folder, bytes, files, truncated: files >= 100_000 })
    totalBytes += bytes
    totalFiles += files
  }
  return { bytes: totalBytes, files: totalFiles, folders: rows }
}
const readKnowledgeConfig = () => readBackendJson('knowledge_config.json', {
  version: 1,
  config: { folders: [getKnowledgeDefaultFolder()], recursive: true, auto_inject: true, top_k: 5, chunk_size: 1200, chunk_overlap: 160, embedding_model_id: '' },
  libraries: [],
  last_indexed_at: null
})
const writeKnowledgeConfig = store => writeBackendJson('knowledge_config.json', store)

let knowledgeVectorInitPromise = null
const ensureKnowledgeVectorDb = async () => {
  const vdb = getVectorDb()
  if (!knowledgeVectorInitPromise) {
    knowledgeVectorInitPromise = (async () => {
      const db = await vdb.getKnowledgeDb()
      vdb.createCollection(db, {
        id: KNOWLEDGE_COLLECTION_ID,
        name: 'Global Knowledge Base',
        dimensions: 384
      })
      const oldStore = readBackendJson('knowledge_base.json', null)
      if (oldStore && Array.isArray(oldStore.chunks) && oldStore.chunks.length > 0) {
        const existingStats = vdb.getCollectionStats(db, KNOWLEDGE_COLLECTION_ID)
        if (existingStats.chunks === 0) {
          const items = (oldStore.chunks || []).map(chunk => ({
            chunk: {
              id: chunk.id,
              chunkId: chunk.id,
              documentId: chunk.doc_id || null,
              path: chunk.path || null,
              title: chunk.title || path.basename(chunk.path || ''),
              text: chunk.text || null,
              textHash: chunk.hash || null
            },
            vector: Array.isArray(chunk.embedding) ? {
              id: `vec_${chunk.id}`,
              provider: 'embedding',
              model: oldStore.config?.embedding_model_name || null,
              vector: chunk.embedding,
              textHash: chunk.hash || null
            } : null
          }))
          vdb.bulkUpsertChunksAndVectors(db, { collectionId: KNOWLEDGE_COLLECTION_ID, items })
          vdb.saveKnowledgeDb()
        }
      }
      return { db, vdb }
    })()
  }
  return knowledgeVectorInitPromise
}

const readKnowledgeBase = async () => {
  const config = readKnowledgeConfig()
  try {
    const { db, vdb } = await ensureKnowledgeVectorDb()
    const stats = vdb.getCollectionStats(db, KNOWLEDGE_COLLECTION_ID)
    return {
      ...config,
      version: 2,
      storage: 'sqlite',
      _db: db,
      _vdb: vdb,
      stats
    }
  } catch (err) {
    return { ...config, version: 1, documents: [], chunks: [], last_indexed_at: null, _error: err.message }
  }
}
const writeKnowledgeBase = store => writeKnowledgeConfig(store)

const knowledgeLibraryRows = store => {
  const libraries = Array.isArray(store.libraries) ? store.libraries : []
  const folders = Array.isArray(store.config?.folders) ? store.config.folders : []
  const writerRoot = path.resolve(getWriterProjectsRoot())
  const baseRows = libraries.length ? libraries : folders
    .map(folder => ({ id: textHash(path.resolve(String(folder || ''))).slice(0, 12), name: path.basename(String(folder || '')) || 'Knowledge', folder }))
    .filter(row => !isPathWithin(row.folder, writerRoot))
  let collectionStats = null
  if (store._db && store._vdb) {
    try { collectionStats = store._vdb.getCollectionStats(store._db, KNOWLEDGE_COLLECTION_ID) } catch { collectionStats = null }
  }
  return baseRows.map((lib, index) => {
    const resolved = path.resolve(String(lib.folder || lib.path || ''))
    if (isPathWithin(resolved, writerRoot)) return null
    return {
      id: lib.id || textHash(resolved).slice(0, 12),
      name: lib.name || path.basename(resolved) || `Knowledge ${index + 1}`,
      folder: resolved,
      vectorized: collectionStats ? collectionStats.vectors > 0 : false,
      documents: collectionStats?.documents || 0,
      chunks: collectionStats?.chunks || 0,
      updated_at: lib.updated_at || store.last_indexed_at || null
    }
  }).filter(Boolean)
}
const writeKnowledgeLibraries = async libraries => {
  const store = await readKnowledgeBase()
  const folders = libraries.map(row => path.resolve(String(row.folder || row.path || ''))).filter(Boolean)
  writeKnowledgeConfig({ ...store, libraries, config: { ...(store.config || {}), folders: Array.from(new Set(folders)) } })
  return await readKnowledgeBase()
}
const upsertKnowledgeLibrary = async ({ id = '', name = '', folder = '' } = {}) => {
  const resolved = path.resolve(String(folder || '').trim())
  if (!resolved) throw new Error('Please choose a knowledge folder')
  const store = await readKnowledgeBase()
  const current = knowledgeLibraryRows(store)
  const row = { id: id || textHash(resolved).slice(0, 12), name: String(name || path.basename(resolved) || 'Knowledge').trim(), folder: resolved, updated_at: new Date().toISOString() }
  const next = [...current.filter(item => item.id !== row.id && path.resolve(item.folder) !== resolved), row]
  await writeKnowledgeLibraries(next)
  return { ok: true, library: row, libraries: knowledgeLibraryRows(await readKnowledgeBase()) }
}
const renameKnowledgeLibrary = async (id, name) => {
  const store = await readKnowledgeBase()
  const current = knowledgeLibraryRows(store)
  const next = current.map(row => row.id === id ? { ...row, name: String(name || row.name).trim(), updated_at: new Date().toISOString() } : row)
  await writeKnowledgeLibraries(next)
  return { ok: true, libraries: knowledgeLibraryRows(await readKnowledgeBase()) }
}
const normalizeTextForSearch = text => String(text || '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')

const chunkMarkdown = (text, chunkSize = 1200, overlap = 160) => {
  const clean = String(text || '').replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n').trim()
  if (!clean) return []
  const blocks = clean.split(/\n(?=#{1,6}\s)|\n\n+/g).map(x => x.trim()).filter(Boolean)
  const chunks = []
  let current = ''
  for (const block of blocks) {
    if ((current + '\n\n' + block).length <= chunkSize) current = current ? `${current}\n\n${block}` : block
    else {
      if (current) chunks.push(current)
      if (block.length <= chunkSize) current = block
      else {
        const step = Math.max(1, chunkSize - overlap)
        for (let i = 0; i < block.length; i += step) chunks.push(block.slice(i, i + chunkSize))
        current = ''
      }
    }
  }
  if (current) chunks.push(current)
  return chunks
}

const scanMarkdownFiles = (folder, recursive = true) => {
  const root = path.resolve(String(folder || ''))
  const rows = []
  const walk = dir => {
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory() && recursive) walk(full)
      if (entry.isFile() && /\.(md|markdown|txt)$/i.test(entry.name)) rows.push(full)
    }
  }
  if (fs.existsSync(root)) walk(root)
  return rows
}

const indexKnowledgeFolder = async (folder, options = {}) => {
  const store = await readKnowledgeBase()
  const config = { ...(store.config || {}), ...options }
  const root = path.resolve(String(folder || config.folders?.[0] || getKnowledgeDefaultFolder()))
  fs.mkdirSync(root, { recursive: true })
  const { db, vdb } = await ensureKnowledgeVectorDb()
  const files = scanMarkdownFiles(root, config.recursive !== false)
  const documents = []
  const chunkItems = []
  const { localHashVector, ragTokenize } = getVectorDb()
  for (const file of files) {
    const stat = fs.statSync(file)
    const content = fs.readFileSync(file, 'utf8')
    const docId = textHash(`${file}:${stat.mtimeMs}:${content.length}`)
    documents.push({ id: docId, path: file, title: path.basename(file), bytes: stat.size, mtime_ms: stat.mtimeMs, hash: textHash(content) })
    const chunks = chunkMarkdown(content, Number(config.chunk_size) || 1200, Number(config.chunk_overlap) || 160)
    chunks.forEach((chunk, index) => {
      const chunkId = textHash(`${docId}:${index}:${chunk}`)
      const terms = {}
      for (const token of ragTokenize(chunk)) { terms[token] = (terms[token] || 0) + 1 }
      chunkItems.push({
        chunk: {
          id: chunkId,
          chunkId,
          documentId: docId,
          path: file,
          title: path.basename(file),
          text: chunk,
          textHash: textHash(chunk),
          terms
        },
        vector: {
          id: `vec_${chunkId}`,
          provider: 'local-hash-vector',
          model: 'local-hash-vector-384',
          vector: localHashVector(chunk),
          textHash: textHash(chunk)
        }
      })
    })
  }

  const db2 = db
  const otherChunks = []
  const allChunks = db2.exec("SELECT c.id, c.path FROM chunks c JOIN collections col ON c.collection_id = col.id WHERE col.id = ?", [KNOWLEDGE_COLLECTION_ID])
  if (allChunks.length && allChunks[0].values.length) {
    for (const [chunkId, chunkPath] of allChunks[0].values) {
      if (!isPathWithin(chunkPath, root)) {
        otherChunks.push(chunkId)
      }
    }
  }
  for (const chunkId of otherChunks) {
    vdb.deleteChunkAndVector(db2, chunkId)
  }

  let embeddingModel = null
  let usedEmbedding = false
  if (chunkItems.length > 0) {
    const embeddingRow = getEmbeddingModelRow(config.embedding_model_id || '')
    if (embeddingRow) {
      try {
        const batchSize = 16
        for (let i = 0; i < chunkItems.length; i += batchSize) {
          const batch = chunkItems.slice(i, i + batchSize)
          const result = await embedTexts(batch.map(item => item.chunk.text), config.embedding_model_id || '')
          embeddingModel = result.model
          result.vectors.forEach((vector, offset) => {
            batch[offset].vector = {
              ...batch[offset].vector,
              provider: 'embedding',
              model: result.model.model_name,
              vector
            }
          })
        }
        usedEmbedding = true
        config.embedding_model_id = embeddingModel?.id || config.embedding_model_id || ''
        config.embedding_model_name = embeddingModel?.model_name || ''
      } catch (err) {
      }
    }
  }

  vdb.bulkUpsertChunksAndVectors(db2, { collectionId: KNOWLEDGE_COLLECTION_ID, items: chunkItems })
  vdb.updateCollectionMetadata(db2, KNOWLEDGE_COLLECTION_ID, {
    dimensions: chunkItems[0]?.vector?.vector?.length || 384,
    vectorProvider: usedEmbedding ? 'embedding' : 'local-hash-vector',
    vectorModel: embeddingModel?.model_name || 'local-hash-vector-384'
  })
  vdb.saveKnowledgeDb()

  const folders = Array.from(new Set([...(Array.isArray(config.folders) ? config.folders : []), root]))
  writeKnowledgeConfig({ ...config, folders, libraries: store.libraries, last_indexed_at: new Date().toISOString() })

  return {
    ok: true,
    folder: root,
    files: documents.length,
    chunks: chunkItems.length,
    embedding_model: usedEmbedding ? (config.embedding_model_name || config.embedding_model_id || null) : 'local-hash-vector (fallback)'
  }
}

const cosineSimilarity = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0
  let dot = 0; let na = 0; let nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}
const lexicalScore = (query, text) => {
  const q = normalizeTextForSearch(query).split(/\s+/).filter(x => x.length > 1)
  if (!q.length) return 0
  const t = normalizeTextForSearch(text)
  return q.reduce((sum, token) => sum + (t.includes(token) ? 1 : 0), 0) / q.length
}

const KNOWLEDGE_STRATEGIES_CJS = {
  narrative_prose: {
    id: 'narrative-prose',
    name: '叙事散文策略',
    description: '人物/世界观/时间线优先，中等召回，不强调引用',
    retrieval: { topK: 6, similarityThreshold: 0.15, rerank: false, includeMetadata: true },
    ranking: { recencyWeight: 0.15, sourceCredibilityWeight: 0.15, relevanceWeight: 0.7 }
  },
  script_dialogue: {
    id: 'script-dialogue',
    name: '剧本对白策略',
    description: '角色/场景/设定优先，按场景组织',
    retrieval: { topK: 8, similarityThreshold: 0.12, rerank: true, includeMetadata: true },
    ranking: { recencyWeight: 0.1, sourceCredibilityWeight: 0.2, relevanceWeight: 0.7 }
  },
  interactive_narrative: {
    id: 'interactive-narrative',
    name: '互动叙事策略',
    description: '状态/分支/角色对话优先，强调一致性',
    retrieval: { topK: 10, similarityThreshold: 0.1, rerank: true, includeMetadata: true },
    ranking: { recencyWeight: 0.05, sourceCredibilityWeight: 0.25, relevanceWeight: 0.7 }
  },
  marketing_copy: {
    id: 'marketing-copy',
    name: '营销文案策略',
    description: '品牌资料/产品信息/竞品分析优先，事实核查必须',
    retrieval: { topK: 6, similarityThreshold: 0.2, rerank: true, includeMetadata: true },
    ranking: { recencyWeight: 0.2, sourceCredibilityWeight: 0.35, relevanceWeight: 0.45 }
  },
  informational_article: {
    id: 'informational-article',
    name: '资讯文章策略',
    description: '事实来源/数据/专家观点优先，引用列表格式',
    retrieval: { topK: 8, similarityThreshold: 0.18, rerank: true, includeMetadata: true },
    ranking: { recencyWeight: 0.3, sourceCredibilityWeight: 0.35, relevanceWeight: 0.35 }
  },
  argumentative_document: {
    id: 'argumentative-document',
    name: '论证文档策略',
    description: '证据/引用/反方观点优先，高事实核查要求',
    retrieval: { topK: 12, similarityThreshold: 0.15, rerank: true, includeMetadata: true },
    ranking: { recencyWeight: 0.2, sourceCredibilityWeight: 0.45, relevanceWeight: 0.35 }
  },
  structured_business_doc: {
    id: 'structured-business-doc',
    name: '结构化商务文档策略',
    description: '案例/模板/行业数据优先，来源可信度权重高',
    retrieval: { topK: 8, similarityThreshold: 0.2, rerank: true, includeMetadata: true },
    ranking: { recencyWeight: 0.25, sourceCredibilityWeight: 0.4, relevanceWeight: 0.35 }
  },
  regulated_document: {
    id: 'regulated-document',
    name: '受监管文档策略',
    description: '法规/标准/先例优先，事实核查必须，来源必须可追溯',
    retrieval: { topK: 10, similarityThreshold: 0.25, rerank: true, includeMetadata: true },
    ranking: { recencyWeight: 0.35, sourceCredibilityWeight: 0.5, relevanceWeight: 0.15 }
  },
  technical_document: {
    id: 'technical-document',
    name: '技术文档策略',
    description: 'API文档/规范/示例优先，版本匹配权重高',
    retrieval: { topK: 8, similarityThreshold: 0.15, rerank: true, includeMetadata: true },
    ranking: { recencyWeight: 0.3, sourceCredibilityWeight: 0.3, relevanceWeight: 0.4 }
  },
  knowledge_asset: {
    id: 'knowledge-asset',
    name: '知识资产策略',
    description: '全量召回，实体关系优先，置信度标注必须',
    retrieval: { topK: 15, similarityThreshold: 0.08, rerank: true, includeMetadata: true },
    ranking: { recencyWeight: 0.1, sourceCredibilityWeight: 0.3, relevanceWeight: 0.6 }
  },
  outline: {
    id: 'outline',
    name: '大纲规划策略',
    description: '相关案例/结构模板优先',
    retrieval: { topK: 6, similarityThreshold: 0.18, rerank: false, includeMetadata: true },
    ranking: { recencyWeight: 0.15, sourceCredibilityWeight: 0.25, relevanceWeight: 0.6 }
  },
  research_material: {
    id: 'research-material',
    name: '研究资料策略',
    description: '全量高召回，来源信息必须完整',
    retrieval: { topK: 15, similarityThreshold: 0.08, rerank: true, includeMetadata: true },
    ranking: { recencyWeight: 0.2, sourceCredibilityWeight: 0.4, relevanceWeight: 0.4 }
  },
  review_feedback: {
    id: 'review-feedback',
    name: '审阅反馈策略',
    description: '相关审稿标准/质量基准优先',
    retrieval: { topK: 6, similarityThreshold: 0.2, rerank: false, includeMetadata: true },
    ranking: { recencyWeight: 0.2, sourceCredibilityWeight: 0.35, relevanceWeight: 0.45 }
  },
  revision_artifact: {
    id: 'revision-artifact',
    name: '修订产物策略',
    description: '历史版本/变更记录优先',
    retrieval: { topK: 8, similarityThreshold: 0.15, rerank: false, includeMetadata: true },
    ranking: { recencyWeight: 0.5, sourceCredibilityWeight: 0.2, relevanceWeight: 0.3 }
  }
}

const getKnowledgeStrategyCjs = (docType) => {
  return KNOWLEDGE_STRATEGIES_CJS[docType] || null
}

const searchKnowledge = async (query, opts = {}) => {
  const { db, vdb } = await ensureKnowledgeVectorDb()
  const store = readKnowledgeConfig()
  const project = opts.projectRef ? findWriterProject(opts.projectRef) : null
  const projectRoot = project?.folder ? path.resolve(project.folder) : ''
  const libraryRef = String(opts.libraryRef || '').trim()
  const library = libraryRef
    ? knowledgeLibraryRows(store).find(row => row.id === libraryRef || row.name === libraryRef || row.folder === libraryRef)
    : null
  const libraryRoot = library?.folder ? path.resolve(library.folder) : ''

  const docType = opts.docType || ''
  const formId = opts.formId || ''
  const strategy = docType ? getKnowledgeStrategyCjs(docType) : null

  let baseLimit = Number(opts.limit || store.config?.top_k || 5)
  let similarityThreshold = 0.1
  let strategyApplied = null

  if (strategy) {
    baseLimit = opts.limit ? Number(opts.limit) : strategy.retrieval.topK
    similarityThreshold = strategy.retrieval.similarityThreshold
    strategyApplied = {
      id: strategy.id,
      doc_type: docType,
      name: strategy.name,
      description: strategy.description,
      form_id: formId || null
    }
  }

  const limit = Math.max(1, Math.min(20, baseLimit))
  const stats = vdb.getCollectionStats(db, KNOWLEDGE_COLLECTION_ID)
  if (stats.chunks === 0) {
    return {
      ok: true,
      query,
      results: [],
      vectorized: false,
      message: 'Knowledge base is empty. Index a folder first.',
      strategy_applied: strategyApplied
    }
  }
  const { localHashVector } = vdb
  let queryVector = localHashVector(String(query || ''))
  let vectorized = false
  let embeddingModel = null
  try {
    const embeddingRow = getEmbeddingModelRow(store.config?.embedding_model_id || '')
    if (embeddingRow && stats.vectors > 0) {
      try {
        const embedded = await embedTexts([String(query || '')], store.config?.embedding_model_id || '')
        queryVector = embedded.vectors[0]
        vectorized = true
        embeddingModel = embedded.model?.model_name || null
      } catch {
        queryVector = localHashVector(String(query || ''))
      }
    }
  } catch {
    queryVector = localHashVector(String(query || ''))
  }
  const filter = {}
  if (projectRoot) filter.path = projectRoot
  else if (libraryRoot) filter.path = libraryRoot
  let results = vdb.searchVectors(db, { collectionId: KNOWLEDGE_COLLECTION_ID, queryVector, limit, filter })
  if (!results.length || results.every(r => r.score < similarityThreshold)) {
    const lexicalResults = vdb.lexicalSearch(db, { collectionId: KNOWLEDGE_COLLECTION_ID, query, limit, filter })
    if (lexicalResults.length) {
      results = lexicalResults
      vectorized = false
    }
  }
  return {
    ok: true,
    query,
    results: results.map(r => ({ ...r, doc_id: r.document_id })),
    vectorized,
    embedding_model: embeddingModel,
    stats: { chunks: stats.chunks, vectors: stats.vectors },
    strategy_applied: strategyApplied
  }
}

const knowledgeContextForPrompt = async (prompt, opts = {}) => {
  const store = readKnowledgeConfig()
  if (store.auto_inject === false) return ''
  if (!opts.projectRef) return ''
  const search = await searchKnowledge(prompt, { limit: store.top_k || 5, allowLexical: true, projectRef: opts.projectRef })
  if (!search.results?.length) return ''
  return search.results.map((row, index) => `[#${index + 1}] ${row.title || path.basename(row.path || '')}\n${String(row.text || '').slice(0, 1200)}`).join('\n\n')
}

const callBuiltinMcpTool = async (tool, args = {}) => {
  const name = String(tool || '')
  if (name === 'knowledge_search') {
    const projectRef = args.project_id || args.projectId || ''
    if (!projectRef && !args.library_id && !args.libraryId) {
      return notConfigured('knowledge', 'knowledge_search requires an explicit project_id or library_id to avoid cross-project leakage.', { results: [] })
    }
    return searchKnowledge(args.query || args.q || '', { limit: args.limit || 5, allowLexical: true, projectRef, libraryRef: args.library_id || args.libraryId || '', docType: args.doc_type || args.docType || '', formId: args.form_id || args.formId || '' })
  }
  if (name === 'list_writer_skills') return { ok: true, skills: managedSkills.listWriterSkills() }
  if (name === 'read_skill') return managedSkills.readSkillByName(args.name || args.skill || '')
  if (name === 'find_skill') return managedSkills.searchSkills(args.query || args.q || args.keyword || '')
  if (name === 'create_skill') return managedSkills.createSkill(args)
  if (name === 'list_artifacts') return readArtifacts()
  if (name === 'manuscript_outline') return { ok: true, outline: [{ act: 'Act I', goal: 'Set desire, wound, world, and irreversible disturbance.', premise: String(args.premise || args.prompt || '') }, { act: 'Act II', goal: 'Escalate opposition, reversals, midpoint revelation, and cost.' }, { act: 'Act III', goal: 'Force choice, resolve core contradiction, show aftermath.' }] }
  if (name === 'project_list') return { ok: true, projects: readWriterProjects().projects || [] }
  if (name === 'project_create') return { ok: true, project: await createWriterProject(args) }
  if (name === 'project_open') return { ok: true, project: setActiveWriterProject(args.project || args.projectRef || args.ref || '') }
  if (name === 'project_save') return { ok: true, saved: saveWriterProjectFile(args) }
  if (name === 'project_export') return { ok: true, export: exportWriterProject(args.project || args.projectRef || '') }
  if (name === 'project_status') return { ok: true, status: writerProjectStatusMarkdown(args.project || args.projectRef || '') }
  return notConfigured('mcp', `Unknown built-in Karna writer tool: ${name}`)
}



const readWriterProjects = () => readBackendJson('writer_projects.json', { version: 1, active_project_id: '', projects: [] })
const writeWriterProjects = store => writeBackendJson('writer_projects.json', { version: 1, active_project_id: store.active_project_id || '', projects: Array.isArray(store.projects) ? store.projects : [] })
const sessionLifecycleService = createSessionLifecycleService({
  dataRoot: KARNA_DATA_ROOT,
  getSessionsMap: () => sessions,
  getSessionMessagesMap: () => sessionMessages,
  readWriterProjects,
  writeWriterProjects,
  writerProjectDataPath: p => p.folder,
  log: rememberLog
})

function broadcastSessionLifecycleEvent(payload) {
  try {
    const { BrowserWindow } = require('electron')
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        try {
          win.webContents.send('karna:session.lifecycle', payload)
        } catch (e) { /* ignore */ }
      }
    }
  } catch (e) { /* ignore - may be in test environment */ }
}
const getWriterProjectsRoot = () => karnaPaths.writerProjectsDir()
const projectAgentId = (projectId, index) => `agent_${index + 1}_${crypto.randomBytes(3).toString('hex')}`
const normalizeAgentStatusLabel = label => {
  const text = String(label || '').trim()
  if (!text) return '\u4f11\u7720'
  if (/working/i.test(text)) return '\u6b63\u5728\u5de5\u4f5c'
  if (/waiting/i.test(text)) return '\u7b49\u5f85\u524d\u7f6e\u4efb\u52a1'
  if (/ready/i.test(text)) return '\u5f85\u547d'
  if (text === '\u7761\u7720') return '\u4f11\u7720'
  return text
}
const normalizeAgentInput = (agent, index, projectId) => {
  const rawRole = String(agent?.role || agent?.name || `Agent ${index + 1}`).trim()
  const role = rawRole === 'Project Controller' ? '\u4e3b\u63a7' : rawRole
  return {
    id: String(agent?.id || projectAgentId(projectId || 'project', index)).trim(),
    name: String(agent?.name === 'Project Controller' ? '\u4e3b\u63a7' : (agent?.name || role)).trim(),
    role,
    brief: String(agent?.brief || agent?.description || agent?.function || `${role} handles project writing tasks.`).trim(),
    persona: String(agent?.persona || agent?.identity || '').trim(),
    skills: Array.isArray(agent?.skills) ? agent.skills.map(String).filter(Boolean) : [],
    mcp: Array.isArray(agent?.mcp) ? agent.mcp.map(String).filter(Boolean) : [],
    enabled: agent?.enabled !== false,
    status: agent?.status || 'sleeping',
    status_label: normalizeAgentStatusLabel(agent?.status_label),
    status_detail: agent?.status_detail || '',
    waiting_for: agent?.waiting_for || '',
    session_id: agent?.session_id || null
  }
}
const readWriterAgents = project => {
  const file = path.join(project.folder, 'writer_agents.json')
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'))
    const rows = Array.isArray(data.agents) ? data.agents : []
    return { ...data, agents: rows.map((agent, index) => normalizeAgentInput(agent, index, project.id)) }
  } catch {
    return { version: 1, project_id: project.id, project_slug: project.slug, type: project.type, agents: [] }
  }
}
const writeWriterAgentsData = (project, agents, extra = {}) => {
  const file = path.join(project.folder, 'writer_agents.json')
  const data = { version: 1, project_id: project.id, project_slug: project.slug, type: project.type, updated_at: new Date().toISOString(), ...extra, agents }
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  return { ok: true, path: file, ...data }
}

const WORKFLOW_AGENT_TEMPLATES = [
  { id: 'setting_keeper', name: '设定库 Agent', role: '设定核查', color: '#7c3aed', tagline: '守住世界观、人设、时间线和能力规则', duties: '管理世界观、年代、势力、人物性格、能力规则，并核查新内容是否吃设定。', forbidden: '不负责写正文，不擅自新增破坏主设定的大规则。', output_format: '设定核查报告', permissions: { canEditDraft: false, canComment: true, canUseKnowledge: true, canReadUpstream: true }, model: '', temperature: 0.3, top_p: 0.8, constraints: ['必须严格遵循本书世界观', '仅标注问题不修改正文'] },
  { id: 'outline_architect', name: '大纲 Agent', role: '大纲设计', color: '#2563eb', tagline: '搭建主线、分卷和章节节拍', duties: '生成长篇总纲、分卷纲、章节梗概和阶段目标。', forbidden: '不直接撰写完整正文。', output_format: '分层大纲', permissions: { canEditDraft: false, canComment: true, canUseKnowledge: true, canReadUpstream: true }, model: '', temperature: 0.7, top_p: 0.9, constraints: ['不得改动用户指定主线剧情'] },
  { id: 'character_designer', name: '人设 Agent', role: '人设塑造', color: '#db2777', tagline: '塑造身世、动机、口头禅和行为逻辑', duties: '设计人物小传、性格、口头禅、行为逻辑、情绪变化和成长弧。', forbidden: '不推翻主线，不随意黑化角色。', output_format: '人物卡', permissions: { canEditDraft: false, canComment: true, canUseKnowledge: true, canReadUpstream: true }, model: '', temperature: 0.65, top_p: 0.9, constraints: ['保持人物动机一致'] },
  { id: 'chapter_writer', name: '正文写作 Agent', role: '正文写作', color: '#16a34a', tagline: '根据梗概和指令落地码字', duties: '根据用户需求、章节梗概和上游材料写章节初稿。', forbidden: '未经允许不改变大纲和核心情节。', output_format: '章节正文', permissions: { canEditDraft: true, canComment: false, canUseKnowledge: true, canReadUpstream: true }, model: '', temperature: 0.75, top_p: 0.95, constraints: ['贴合用户文风锚点'] },
  { id: 'plot_continuation', name: '剧情续写 Agent', role: '剧情续写', color: '#0891b2', tagline: '卡文时生成矛盾、转折和下一步方案', duties: '为卡文场景生成冲突、反转、突发事件和后续走向方案。', forbidden: '不替作者决定最终剧情方向。', output_format: '续写方案', permissions: { canEditDraft: true, canComment: true, canUseKnowledge: true, canReadUpstream: true }, model: '', temperature: 0.85, top_p: 0.95, constraints: ['给出多个方案供作者选择'] },
  { id: 'style_polisher', name: '文笔润色 Agent', role: '文笔润色', color: '#ea580c', tagline: '优化句式、氛围、节奏和对话质感', duties: '优化句式流畅度、节奏、氛围、对话和可读性。', forbidden: '不改变剧情走向和核心事件。', output_format: '润色后文本+修改说明', permissions: { canEditDraft: true, canComment: true, canUseKnowledge: false, canReadUpstream: true }, model: '', temperature: 0.55, top_p: 0.85, constraints: ['修改篇幅不能超过原文30%', '不得改动主线剧情'] },
  { id: 'logic_reviewer', name: '剧情逻辑 Agent', role: '逻辑审核', color: '#9333ea', tagline: '排查剧情漏洞、时间线冲突和动机问题', duties: '检查剧情漏洞、时间线冲突、因果薄弱和人物行为动机不合理。', forbidden: '只标注问题和修复方案，不大段改写正文。', output_format: '问题清单', permissions: { canEditDraft: false, canComment: true, canUseKnowledge: true, canReadUpstream: true }, model: '', temperature: 0.25, top_p: 0.8, constraints: ['仅标注问题不修改正文'] },
  { id: 'foreshadow_manager', name: '伏笔 Agent', role: '伏笔埋坑', color: '#4f46e5', tagline: '自然埋设新伏笔并回收旧伏笔', duties: '检索前文材料，自然埋设新伏笔，回收旧伏笔，并记录线索表。', forbidden: '不制造无关悬念。', output_format: '伏笔表', permissions: { canEditDraft: false, canComment: true, canUseKnowledge: true, canReadUpstream: true }, model: '', temperature: 0.45, top_p: 0.85, constraints: ['引用前文证据'] },
  { id: 'compliance_guard', name: '合规风控 Agent', role: '合规避雷', color: '#dc2626', tagline: '筛查敏感、低俗、暴力和平台风险', duties: '检查敏感剧情、暴力、低俗、三观风险和平台擦边风险，并提供更安全替代方案。', forbidden: '不扩写敏感内容，不评价文学质量。', output_format: '风险等级+替代方案', permissions: { canEditDraft: false, canComment: true, canUseKnowledge: false, canReadUpstream: true }, model: '', temperature: 0.2, top_p: 0.75, constraints: ['优先平台安全'] },
  { id: 'critic_editor', name: '剧评批判 Agent', role: '剧评批判', color: '#64748b', tagline: '站在读者和编辑视角挑短板', duties: '指出节奏拖沓、桥段老套、冲突不足、看点匮乏，并给出改进方向。', forbidden: '只评论和建议，不私自改写正文。', output_format: '编辑评语', permissions: { canEditDraft: false, canComment: true, canUseKnowledge: true, canReadUpstream: true }, model: '', temperature: 0.5, top_p: 0.85, constraints: ['贴合网文读者审美'] }
]
const workflowAgentsPath = project => path.join(project.folder, 'workflow_agents.json')
const workflowsPath = project => path.join(project.folder, 'workflows.json')
const workflowRunsPath = project => path.join(project.folder, 'workflow_runs.json')
const workflowArtifactsDir = project => path.join(project.folder, 'workflow_artifacts')
const workflowNow = () => new Date().toISOString()
const workflowId = prefix => `${prefix}_${crypto.randomBytes(5).toString('hex')}`
const globalWorkflowProject = () => {
  const folder = path.join(getBackendDataDir(), 'global-workflows')
  const project = { id: 'global-workflows', slug: 'global-workflows', title: 'Karna 多智能体工坊', type: 'workflow', folder, root: folder, status: 'active', knowledge_ids: [] }
  fs.mkdirSync(folder, { recursive: true })
  fs.mkdirSync(path.join(folder, 'workflow_artifacts'), { recursive: true })
  return project
}
const activeWriterProject = () => {
  const store = readWriterProjects()
  const rows = Array.isArray(store.projects) ? store.projects : []
  return rows.find(project => project.id === store.active_project_id) || rows.find(project => project.status !== 'archived') || rows[0] || null
}
const workflowProjectFromRef = ref => {
  const text = String(ref || '').trim()
  if (text && text !== 'global' && text !== 'global-workflows') return findWriterProject(text) || globalWorkflowProject()
  return globalWorkflowProject()
}
const normalizeWorkflowPermissions = p => ({ canEditDraft: Boolean(p?.canEditDraft), canComment: p?.canComment !== false, canUseKnowledge: p?.canUseKnowledge !== false, canReadUpstream: p?.canReadUpstream !== false })
const normalizeWorkflowAgent = (agent, index = 0) => ({
  id: String(agent?.id || workflowId('wf_agent')).trim(),
  name: String(agent?.name || agent?.role || `Creative Agent ${index + 1}`).trim(),
  role: String(agent?.role || agent?.name || `Creative Agent ${index + 1}`).trim(),
  color: String(agent?.color || WORKFLOW_AGENT_TEMPLATES[index % WORKFLOW_AGENT_TEMPLATES.length]?.color || '#7c3aed'),
  tagline: String(agent?.tagline || agent?.brief || '').trim(),
  duties: String(agent?.duties || agent?.brief || agent?.description || '').trim(),
  forbidden: String(agent?.forbidden || '').trim(),
  output_format: String(agent?.output_format || agent?.outputFormat || 'Segmented response').trim(),
  model: String(agent?.model || '').trim(),
  temperature: Math.max(0, Math.min(2, Number(agent?.temperature ?? 0.6))),
  top_p: Math.max(0, Math.min(1, Number(agent?.top_p ?? agent?.topP ?? 0.9))),
  constraints: Array.isArray(agent?.constraints) ? agent.constraints.map(String).filter(Boolean).slice(0, 12) : [],
  permissions: normalizeWorkflowPermissions(agent?.permissions || {}),
  enabled: agent?.enabled !== false,
  updated_at: workflowNow()
})
const defaultWorkflowAgents = () => WORKFLOW_AGENT_TEMPLATES.map((agent, index) => normalizeWorkflowAgent(agent, index))
const workflowTemplateById = () => new Map(defaultWorkflowAgents().map(agent => [agent.id, agent]))
const maybeUpgradeBuiltinWorkflowAgent = (agent, index = 0) => {
  const normalized = normalizeWorkflowAgent(agent, index)
  const template = workflowTemplateById().get(normalized.id)
  if (!template) return normalized
  const oldEnglish = /Setting Keeper|Outline Agent|Character Agent|Chapter Writer|Plot Continuation|Style Polisher|Logic Reviewer|Foreshadow Agent|Compliance Agent|Critic Agent/i.test(`${normalized.name} ${normalized.role} ${normalized.tagline}`)
  if (!oldEnglish) return normalized
  return normalizeWorkflowAgent({
    ...template,
    model: normalized.model || template.model,
    temperature: normalized.temperature ?? template.temperature,
    top_p: normalized.top_p ?? template.top_p,
    enabled: normalized.enabled
  }, index)
}
const readWorkflowAgents = project => {
  const fallback = { version: 1, project_id: project?.id || 'global', agents: defaultWorkflowAgents() }
  const data = readJsonFile(workflowAgentsPath(project), fallback)
  const rows = Array.isArray(data.agents) && data.agents.length ? data.agents : fallback.agents
  return { ...fallback, ...data, agents: rows.map(maybeUpgradeBuiltinWorkflowAgent) }
}
const writeWorkflowAgents = (project, agents) => writeJsonFile(workflowAgentsPath(project), { version: 1, project_id: project.id, updated_at: workflowNow(), agents: agents.map(normalizeWorkflowAgent).slice(0, 10) })
const readWorkflows = project => readJsonFile(workflowsPath(project), { version: 1, project_id: project.id, workflows: [] })
const writeWorkflows = (project, workflows) => writeJsonFile(workflowsPath(project), { version: 1, project_id: project.id, updated_at: workflowNow(), workflows })
const readWorkflowRuns = project => readJsonFile(workflowRunsPath(project), { version: 1, project_id: project.id, runs: [] })
const writeWorkflowRuns = (project, runs) => writeJsonFile(workflowRunsPath(project), { version: 1, project_id: project.id, updated_at: workflowNow(), runs: runs.slice(-100) })
const defaultWorkflowLimits = limits => ({ max_agents: Math.min(10, Math.max(1, Number(limits?.max_agents || 10))), max_parallel: Math.min(5, Math.max(1, Number(limits?.max_parallel || 3))), max_loop: Math.min(5, Math.max(1, Number(limits?.max_loop || 3))) })
const normalizeWorkflowNode = (node, index = 0) => ({
  id: String(node?.id || workflowId('node')).trim(),
  type: String(node?.type || 'agent').trim(),
  position: node?.position && typeof node.position === 'object' ? { x: Number(node.position.x || 0), y: Number(node.position.y || 0) } : { x: 120 + index * 160, y: 140 },
  data: node?.data && typeof node.data === 'object' ? node.data : {}
})
const normalizeWorkflowEdge = edge => ({ id: String(edge?.id || `${edge?.source || ''}-${edge?.target || ''}` || workflowId('edge')), source: String(edge?.source || ''), target: String(edge?.target || ''), label: edge?.label ? String(edge.label) : '' })
const validateWorkflowGraph = workflow => {
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : []
  const edges = Array.isArray(workflow.edges) ? workflow.edges : []
  const ids = new Set(nodes.map(node => node.id))
  const agentCount = nodes.filter(node => node.type === 'agent').length
  const limits = defaultWorkflowLimits(workflow.limits)
  if (agentCount > limits.max_agents) throw new Error(`At most ${limits.max_agents} Agent nodes are allowed in one workflow`)
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) throw new Error('An edge references a missing node')
    if (edge.source === edge.target) throw new Error('A node cannot connect to itself')
  }
  const adjacency = new Map(nodes.map(node => [node.id, []]))
  for (const edge of edges) adjacency.get(edge.source)?.push(edge.target)
  const visiting = new Set(); const visited = new Set()
  const dfs = id => {
    if (visiting.has(id)) throw new Error('Workflow cycles are not allowed; use a loop node with an explicit cap')
    if (visited.has(id)) return
    visiting.add(id)
    for (const next of adjacency.get(id) || []) dfs(next)
    visiting.delete(id); visited.add(id)
  }
  for (const id of ids) dfs(id)
  return true
}
const normalizeWorkflow = (project, input = {}, existing = null) => {
  const now = workflowNow()
  const workflow = {
    id: String(existing?.id || input.id || workflowId('workflow')),
    project_id: project.id,
    name: String(input.name || existing?.name || 'Upstream output is not provided').trim(),
    mode: ['simple', 'canvas'].includes(input.mode || existing?.mode) ? String(input.mode || existing?.mode) : 'canvas',
    nodes: (Array.isArray(input.nodes) ? input.nodes : existing?.nodes || []).map(normalizeWorkflowNode),
    edges: (Array.isArray(input.edges) ? input.edges : existing?.edges || []).map(normalizeWorkflowEdge).filter(edge => edge.source && edge.target),
    limits: defaultWorkflowLimits(input.limits || existing?.limits),
    knowledge_binding: input.knowledge_binding || input.knowledgeBinding || existing?.knowledge_binding || { enabled: true, ids: project.knowledge_ids || [] },
    created_at: existing?.created_at || now,
    updated_at: now
  }
  validateWorkflowGraph(workflow)
  return workflow
}
const upsertWorkflowAgent = (project, patch = {}, targetId = '') => {
  const store = readWorkflowAgents(project)
  const next = normalizeWorkflowAgent({ ...patch, id: targetId || patch.id || workflowId('wf_agent') })
  const exists = store.agents.some(agent => agent.id === next.id)
  const agents = exists ? store.agents.map(agent => agent.id === next.id ? next : agent) : [...store.agents, next]
  return writeWorkflowAgents(project, agents.slice(0, 10))
}
const deleteWorkflowAgent = (project, targetId = '') => {
  const id = String(targetId || '').trim()
  if (!id) throw new Error('Agent id is required')
  const builtinIds = new Set(WORKFLOW_AGENT_TEMPLATES.map(agent => agent.id))
  if (builtinIds.has(id)) throw new Error('\u5185\u7f6e\u667a\u80fd\u4f53\u4e0d\u80fd\u5220\u9664\uff0c\u53ef\u4ee5\u5148\u590d\u5236\u518d\u6539\u3002')
  const store = readWorkflowAgents(project)
  const agents = (store.agents || []).filter(agent => agent.id !== id)
  const saved = writeWorkflowAgents(project, agents)
  return { ...saved, deleted_id: id }
}
const listWorkflowsForProject = project => ({ ok: true, project, agents: readWorkflowAgents(project).agents, ...readWorkflows(project), runs: readWorkflowRuns(project).runs })

const migrateWorkflowV3IfNeeded = () => {
  try {
    const metaPath = backendDataPath('meta.json')
    let meta = readJsonFile(metaPath, {})
    if (meta && meta.workflow_v3_migrated === true) {
      return
    }

    rememberLog('Starting Workflow V3 migration...')

    const now = new Date()
    const timestamp = now.toISOString().replace(/[:.]/g, '-')
    const backupRoot = path.join(getBackendDataDir(), 'workflow-backups', timestamp)

    const scopes = []

    const globalProj = globalWorkflowProject()
    scopes.push({ project: globalProj, scopeId: 'global' })

    const projectStore = readWriterProjects()
    const allProjects = Array.isArray(projectStore.projects) ? projectStore.projects : []
    for (const proj of allProjects) {
      if (proj && proj.folder && proj.id) {
        scopes.push({ project: proj, scopeId: proj.id })
      }
    }

    let backupCount = 0
    for (const { project, scopeId } of scopes) {
      try {
        const scopeBackupDir = path.join(backupRoot, scopeId)
        const hasOldData =
          fs.existsSync(workflowsPath(project)) ||
          fs.existsSync(workflowRunsPath(project)) ||
          fs.existsSync(workflowArtifactsDir(project))

        if (!hasOldData) {
          continue
        }

        ensureDir(scopeBackupDir)

        const wfPath = workflowsPath(project)
        if (fs.existsSync(wfPath)) {
          try {
            const oldWorkflows = readJsonFile(wfPath, null)
            if (oldWorkflows && (Array.isArray(oldWorkflows.workflows) ? oldWorkflows.workflows.length > 0 : Object.keys(oldWorkflows).length > 0)) {
              writeJsonFile(path.join(scopeBackupDir, 'workflows.json'), oldWorkflows)
              backupCount++
            }
          } catch (e) {
            rememberLog(`Failed to backup workflows for ${scopeId}: ${e.message}`)
          }
        }

        const runsPath = workflowRunsPath(project)
        if (fs.existsSync(runsPath)) {
          try {
            const oldRuns = readJsonFile(runsPath, null)
            if (oldRuns && (Array.isArray(oldRuns.runs) ? oldRuns.runs.length > 0 : Object.keys(oldRuns).length > 0)) {
              writeJsonFile(path.join(scopeBackupDir, 'workflow_runs.json'), oldRuns)
              backupCount++
            }
          } catch (e) {
            rememberLog(`Failed to backup workflow runs for ${scopeId}: ${e.message}`)
          }
        }

        const artifactsDir = workflowArtifactsDir(project)
        if (fs.existsSync(artifactsDir)) {
          try {
            const backupArtifactsDir = path.join(scopeBackupDir, 'workflow_artifacts')
            copyDirectoryRecursive(artifactsDir, backupArtifactsDir)
          } catch (e) {
            rememberLog(`Failed to backup workflow artifacts for ${scopeId}: ${e.message}`)
          }
        }

        writeWorkflows(project, [])
        writeWorkflowRuns(project, [])
      } catch (e) {
        rememberLog(`Workflow V3 migration failed for scope ${scopeId}: ${e.message}`)
      }
    }

    meta = {
      ...(meta || {}),
      workflow_v3_migrated: true,
      workflow_v3_migrated_at: now.toISOString(),
      workflow_v3_backup_path: backupRoot,
      workflow_v3_backup_count: backupCount
    }
    writeJsonFile(metaPath, meta)

    rememberLog(`Workflow V3 migration completed. Backed up ${backupCount} files to ${backupRoot}`)
  } catch (e) {
    rememberLog(`Workflow V3 migration error: ${e.message}`)
  }
}

const copyDirectoryRecursive = (src, dest) => {
  if (!fs.existsSync(src)) return
  ensureDir(dest)
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath)
    } else if (entry.isFile()) {
      try {
        fs.copyFileSync(srcPath, destPath)
      } catch (e) {
      }
    }
  }
}

const validateWorkflowSchema = (workflow) => {
  const errors = []
  if (!workflow || typeof workflow !== 'object') {
    errors.push('Workflow must be an object')
    return errors
  }
  if (!workflow.name || typeof workflow.name !== 'string' || !workflow.name.trim()) {
    errors.push('Workflow name is required and must be a non-empty string')
  }
  if (!Array.isArray(workflow.nodes)) {
    errors.push('Workflow nodes must be an array')
  } else {
    const nodeIds = new Set()
    for (let i = 0; i < workflow.nodes.length; i++) {
      const node = workflow.nodes[i]
      if (!node || typeof node !== 'object') {
        errors.push(`Node at index ${i} is invalid`)
        continue
      }
      if (!node.id) {
        errors.push(`Node at index ${i} must have an id`)
      } else {
        nodeIds.add(node.id)
      }
      if (!node.type) {
        errors.push(`Node ${node.id || i} must have a type`)
      }
    }
    if (Array.isArray(workflow.edges)) {
      for (let i = 0; i < workflow.edges.length; i++) {
        const edge = workflow.edges[i]
        if (!edge || typeof edge !== 'object') {
          errors.push(`Edge at index ${i} is invalid`)
          continue
        }
        const fromId = edge.from || edge.source
        const toId = edge.to || edge.target
        if (fromId && !nodeIds.has(fromId)) {
          errors.push(`Edge ${i} references non-existent from/source node: ${fromId}`)
        }
        if (toId && !nodeIds.has(toId)) {
          errors.push(`Edge ${i} references non-existent to/target node: ${toId}`)
        }
      }
    }
  }
  return errors
}

const saveWorkflowForProject = (project, input = {}) => {
  const validationErrors = validateWorkflowSchema(input)
  if (validationErrors.length > 0) {
    const error = new Error('Validation failed')
    error.validationErrors = validationErrors
    throw error
  }
  const store = readWorkflows(project)
  const existing = (store.workflows || []).find(row => row.id === input.id)
  const workflow = normalizeWorkflow(project, input, existing)
  const workflows = existing ? (store.workflows || []).map(row => row.id === workflow.id ? workflow : row) : [...(store.workflows || []), workflow]
  writeWorkflows(project, workflows)
  return { ok: true, workflow, workflows }
}
const deleteWorkflowForProject = (project, workflowIdText) => {
  const store = readWorkflows(project)
  const workflows = (store.workflows || []).filter(row => row.id !== workflowIdText)
  writeWorkflows(project, workflows)
  return { ok: true, workflows }
}
const buildExecutionPlan = (workflow) => {
  const nodes = Array.isArray(workflow.nodes) ? workflow.nodes : []
  const edges = Array.isArray(workflow.edges) ? workflow.edges : []
  const nodeIds = new Set(nodes.map(n => n.id))
  const incoming = new Map()
  const outgoing = new Map()
  for (const n of nodes) {
    incoming.set(n.id, [])
    outgoing.set(n.id, [])
  }
  for (const e of edges) {
    if (nodeIds.has(e.source) && nodeIds.has(e.target)) {
      incoming.get(e.target).push(e.source)
      outgoing.get(e.source).push(e.target)
    }
  }
  const entryNodes = nodes.filter(n => (incoming.get(n.id) || []).length === 0)
  const steps = []
  const visited = new Set()
  const queue = entryNodes.map(n => n.id)
  while (queue.length > 0) {
    const nodeId = queue.shift()
    if (visited.has(nodeId)) continue
    const deps = incoming.get(nodeId) || []
    if (deps.some(d => !visited.has(d))) {
      queue.push(nodeId)
      continue
    }
    visited.add(nodeId)
    const node = nodes.find(n => n.id === nodeId)
    steps.push({
      nodeId,
      agentId: node?.data?.agentId || node?.data?.agent_id || null,
      dependencies: deps,
      type: node?.type || 'agent'
    })
    for (const next of outgoing.get(nodeId) || []) {
      if (!visited.has(next)) queue.push(next)
    }
  }
  return {
    workflowId: workflow.id,
    steps,
    entryNodeId: entryNodes[0]?.id || null
  }
}
const resolveWorkflow = ({ workflow_id, workspace_id, session_id }) => {
  const workflowId = String(workflow_id || '').trim()
  if (!workflowId) {
    return { ok: false, error: 'workflow_id is required', code: 'MISSING_WORKFLOW_ID', status: 400 }
  }
  const workspaceId = workspace_id ? String(workspace_id).trim() : null
  const candidates = []
  const globalProj = globalWorkflowProject()
  const globalWorkflowsData = readWorkflows(globalProj)
  for (const wf of (globalWorkflowsData.workflows || [])) {
    candidates.push({ workflow: wf, project: globalProj, source: 'global' })
  }
  if (workspaceId) {
    const projectFromWs = findWriterProject(workspaceId)
    if (projectFromWs) {
      const projectWorkflowsData = readWorkflows(projectFromWs)
      for (const wf of (projectWorkflowsData.workflows || [])) {
        candidates.push({ workflow: wf, project: projectFromWs, source: 'project' })
      }
    }
  }
  const match = candidates.find(c => c.workflow.id === workflowId)
  if (!match) {
    return { ok: false, error: `Workflow not found: ${workflowId}`, code: 'WORKFLOW_NOT_FOUND', status: 404 }
  }
  if (match.source === 'project') {
    if (!workspaceId) {
      return { ok: false, error: 'This is a project workflow. Please specify workspace_id to use it.', code: 'WORKSPACE_REQUIRED', status: 400 }
    }
    if (match.project.id !== workspaceId && match.project.workspace_id !== workspaceId) {
      return { ok: false, error: 'This workflow belongs to a different project and cannot be used in the current workspace', code: 'WORKSPACE_PERMISSION_DENIED', status: 403 }
    }
  }
  const projectAgents = readWorkflowAgents(match.project)
  const workflowContent = JSON.stringify(match.workflow)
  const contentHash = textHash(workflowContent)
  const version = Date.now()
  const normalizedWorkflow = {
    ...match.workflow,
    version,
    content_hash: contentHash
  }
  const executionPlan = buildExecutionPlan(match.workflow)
  const agentsList = projectAgents.agents.map(a => ({
    id: a.id,
    name: a.name,
    role: a.role,
    color: a.color,
    tagline: a.tagline,
    duties: a.duties,
    forbidden: a.forbidden,
    output_format: a.output_format,
    model: a.model,
    temperature: a.temperature,
    top_p: a.top_p,
    constraints: a.constraints,
    permissions: a.permissions
  }))
  return {
    ok: true,
    binding: {
      workflowId: match.workflow.id,
      source: match.source,
      workspaceId: match.source === 'project' ? (match.project.workspace_id || match.project.id) : null,
      version,
      contentHash
    },
    workflow: normalizedWorkflow,
    agents: agentsList,
    executionPlan
  }
}

const workflowNodePrompt = ({ project, workflow, node, agent, upstream, input }) => {
  const permissions = normalizeWorkflowPermissions(agent?.permissions || {})
  const nodeData = node?.data || {}
  const resourceLines = [
    nodeData.model && nodeData.model !== '默认模型' ? `Node model override: ${nodeData.model}` : 'Node model: default',
    nodeData.skill && nodeData.skill !== '自动' ? `Bound skill: ${nodeData.skill}` : `Skill selection: auto`,
    nodeData.plugin && nodeData.plugin !== '自动' ? `Bound plugin: ${nodeData.plugin}` : `Plugin selection: auto`,
    nodeData.mcp && nodeData.mcp !== '自动' ? `Bound MCP/tool: ${nodeData.mcp}` : `MCP/tool selection: auto`,
    nodeData.knowledge ? `Bound knowledge library: ${nodeData.knowledge}` : '',
    nodeData.soul ? `Soul style sample: ${nodeData.soul}` : ''
  ].filter(Boolean)
  const lines = [
    `Project: ${project.title}`,
    `Workflow: ${workflow.name}`,
    `Current node: ${node.data?.label || node.data?.name || node.id}`,
    `Agent: ${agent?.name || 'Unnamed Agent'} / ${agent?.role || ''}`,
    `Duties: ${agent?.duties || agent?.tagline || ''}`,
    agent?.forbidden ? `Forbidden: ${agent.forbidden}` : '',
    agent?.constraints?.length ? `Hard constraints: ${agent.constraints.join('; ')}` : '',
    resourceLines.length ? `Node resources:\n${resourceLines.join('\n')}` : '',
    `Permissions: ${permissions.canEditDraft ? 'may edit draft' : 'must not edit prose; comments or suggestions only'}; ${permissions.canUseKnowledge ? 'may use knowledge base' : 'do not use knowledge base'}; ${permissions.canReadUpstream ? 'may read upstream output' : 'ignore upstream output'}`,
    `Output format: ${agent?.output_format || 'Segmented response'}`,
    `User input: ${String(input || '').slice(0, 6000)}`,
    permissions.canReadUpstream ? `Upstream output: ${String(upstream || '').slice(0, 8000)}` : 'Upstream output is not provided',
    'Only complete this node responsibility. Do not talk to other Agents; return everything to the hidden dispatcher.'
  ]
  return lines.filter(Boolean).join('\n')
}
const workflowRunSummaryText = run => Object.values(run.node_statuses || {}).map(row => `${row.label || ''}: ${row.summary || ''}`).filter(Boolean).join('\n\n')
const latestWorkflowRun = (project, workflowIdText) => (readWorkflowRuns(project).runs || []).filter(run => run.workflow_id === workflowIdText).at(-1) || null
const workflowStopRequests = new Set()
const stopWorkflowRun = (project, runId) => {
  const store = readWorkflowRuns(project)
  const run = (store.runs || []).find(row => row.run_id === runId)
  if (!run) throw new Error(`Workflow run not found: ${runId}`)
  if (!['running', 'paused', 'blocked'].includes(run.status)) throw new Error(`Workflow run is already terminal: ${run.status}`)
  workflowStopRequests.add(runId)
  run.status = 'cancelled'
  run.stop_requested_at = workflowNow()
  run.finished_at = run.finished_at || workflowNow()
  writeWorkflowRuns(project, store.runs || [])
  return { ok: true, run }
}
const updateWorkflowRunNodeAction = (project, runId, nodeId, action, note = '') => {
  const store = readWorkflowRuns(project)
  const runs = store.runs || []
  const run = runs.find(row => row.run_id === runId)
  if (!run) throw new Error(`Workflow run not found: ${runId}`)
  const current = run.node_statuses?.[nodeId] || { label: nodeId, summary: '' }
  const statusByAction = { accept: 'accepted', reject: 'rejected', skip: 'skipped', retry: 'queued' }
  if (action === 'retry') {
    run.node_statuses = { ...(run.node_statuses || {}), [nodeId]: { ...current, status: 'queued', action, action_note: String(note || ''), updated_at: workflowNow(), summary: '等待重试...' } }
    run.status = 'running'
  } else {
    run.node_statuses = { ...(run.node_statuses || {}), [nodeId]: { ...current, status: statusByAction[action] || String(action || 'updated'), action, action_note: String(note || ''), updated_at: workflowNow() } }
  }
  run.updated_at = workflowNow()
  writeWorkflowRuns(project, runs)
  if (action === 'accept' || action === 'reject') {
    const startedAt = Date.parse(run.started_at || '')
    const durationMs = Number.isFinite(startedAt) ? Math.max(0, Date.now() - startedAt) : null
    analytics.track('workflow_human_confirmation', {
      project_id: project.id,
      run_id: run.run_id,
      node_id: nodeId,
      action,
      outcome: action === 'accept' ? 'approved' : 'rejected',
      duration_ms: durationMs,
      ...getProjectAnalyticsProps(project)
    })
  }
  return { ok: true, run, node: run.node_statuses[nodeId] }
}
const firstScoreFromText = text => {
  const raw = String(text || '')
  const explicit = raw.match(/(?:score|rating)\s*[:=]?\s*(\d{1,3})/i)
  const loose = explicit || raw.match(/(\d{1,3})\s*(?:\/100|points?)/i)
  if (!loose) return null
  const score = Number(loose[1])
  return Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : null
}
const appendWorkflowTaskSystem = (project, workflow, run, agentNodes) => {
  const agents = readWriterAgents(project).agents
  const now = workflowNow()
  const tasks = agentNodes.map((node, index) => ({
    id: `wf_task_${run.run_id}_${index + 1}`,
    title: node.data?.label || node.data?.name || `Workflow node ${index + 1}`,
    description: `Canvas node from Multi Agent Workshop workflow ${workflow.name}. Node type: ${node.type}.`,
    owner_agent_id: node.data?.agent_id || node.data?.agentId || 'controller',
    owner_agent_name: node.data?.agent_name || node.data?.agentName || node.data?.label || 'Workflow Agent',
    status: 'done',
    notes: run.node_statuses?.[node.id]?.summary || '',
    created_at: now,
    updated_at: now,
    depends_on: []
  }))
  return writeTaskSystem(project, { ...defaultTaskSystem(project, agents), coordination_mode: 'semi', monitor: { status: 'done', updated_at: now, summary: `Multi Agent Workshop completed: ${workflow.name}` }, tasks })
}
const workflowNodeCachePath = project => path.join(project.folder, 'agents', 'token_node_cache.json')
const readWorkflowNodeCache = project => readJsonFile(workflowNodeCachePath(project), { version: 1, entries: [] })
const writeWorkflowNodeCache = (project, entries) => writeJsonFile(workflowNodeCachePath(project), { version: 1, updated_at: workflowNow(), entries: entries.slice(-100) })

const extractRequestedOutputTokens = input => {
  const explicit = Number(input?.requestedOutputTokens || input?.targetTokens || 0)
  if (Number.isFinite(explicit) && explicit > 0) return Math.min(500_000, Math.floor(explicit))
  const text = String(input?.input || input?.text || input?.prompt || input?.humanInput || '')
  const tokenMatch = text.match(/(?:target|write|output|生成|输出|写(?:出|作)?)?\s*([0-9]+(?:\.[0-9]+)?)\s*(k|万)?\s*(?:tokens?|令牌)/i)
  if (tokenMatch) {
    const multiplier = String(tokenMatch[2] || '').toLowerCase() === 'k' ? 1_000 : tokenMatch[2] === '万' ? 10_000 : 1
    return Math.min(500_000, Math.max(1, Math.floor(Number(tokenMatch[1]) * multiplier)))
  }
  const charMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(万|千|k)?\s*(?:字|words?)/i)
  if (!charMatch) return 0
  const unit = String(charMatch[2] || '').toLowerCase()
  const multiplier = unit === '万' ? 10_000 : unit === '千' || unit === 'k' ? 1_000 : 1
  const requestedUnits = Number(charMatch[1]) * multiplier
  const isEnglishWords = /words?/i.test(charMatch[0])
  return Math.min(500_000, Math.max(1, Math.ceil(requestedUnits * (isEnglishWords ? 1.35 : 1))))
}

const runSegmentedWorkflowWrite = async ({ project, workflow, run, node, agent, prompt, model, provider, targetTokens, segmentTokens }) => {
  const artifactId = workflowId('artifact')
  const finalPath = path.join(workflowArtifactsDir(project), `${artifactId}.md`)
  const tempPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`
  const totalSegments = Math.max(2, Math.min(64, Math.ceil(targetTokens / Math.max(512, segmentTokens))))
  let completedTokens = 0
  let recentWindow = ''
  const state = { current_section: 0, total_sections: totalSegments, completed_tokens: 0, target_tokens: targetTokens, next_segment_hook: '' }
  fs.mkdirSync(path.dirname(finalPath), { recursive: true })
  try {
    for (let index = 0; index < totalSegments && completedTokens < targetTokens; index += 1) {
      state.current_section = index + 1
      const segmentPrompt = [
        prompt,
        '',
        '# Segmented direct-write contract',
        `Write segment ${index + 1}/${totalSegments}. Target up to ${segmentTokens} tokens for this segment.`,
        `Overall progress: ${completedTokens}/${targetTokens} tokens.`,
        'Return only the next manuscript segment. Do not repeat earlier text.',
        recentWindow ? `Recent ending window for continuity only:\n${recentWindow}` : '',
        state.next_segment_hook ? `Next-segment hook:\n${state.next_segment_hook}` : ''
      ].filter(Boolean).join('\n')
      const response = await chatBackendFetch({
        method: 'POST',
        body: { messages: soulPrompts.buildChatMessages({ profile: 'default', projectContext: projectSessionContext(project, null), prompt: segmentPrompt }), model, provider },
        timeoutMs: 300_000
      })
      if (response.status !== 200) throw new Error(response.data?.detail || response.data?.message || `Segment ${index + 1} failed with HTTP ${response.status}`)
      const segment = typeof response.data === 'object' && response.data
        ? String(response.data.content || response.data.message || '')
        : String(response.data || '')
      if (!segment.trim()) throw new Error(`Segment ${index + 1} returned no content`)
      fs.appendFileSync(tempPath, `${index ? '\n\n' : ''}${segment}`, 'utf8')
      const usage = response?.data?.usage || {}
      const inputTokens = Number(usage.input_tokens || usage.prompt_tokens || Math.ceil(segmentPrompt.length / 3))
      const outputTokens = Number(usage.output_tokens || usage.completion_tokens || Math.ceil(segment.length / 3))
      completedTokens += outputTokens
      state.completed_tokens = completedTokens
      recentWindow = segment.slice(-1600)
      state.next_segment_hook = recentWindow.slice(-320)
      await contextBackendFetch('/api/context/token-usage', {
        method: 'POST',
        body: {
          provider: provider || '', model: model || '', session_id: run.run_id,
          project_id: project.id, workspace_id: project.id, workflow_id: workflow.id,
          node_id: node.id, agent_id: agent.id, source_kind: 'longform_segment',
          input_tokens: inputTokens,
          cached_input_tokens: Number(usage.cached_input_tokens || usage.cache_read_input_tokens || 0),
          output_tokens: outputTokens, reasoning_tokens: Number(usage.reasoning_tokens || 0),
          usage_source: Object.keys(usage).length ? 'provider' : 'estimate',
          cache_hit: Number(usage.cached_input_tokens || usage.cache_read_input_tokens || 0) > 0
        }
      }).catch(err => rememberLog(`Longform segment usage record skipped: ${err.message}`))
    }
    fs.renameSync(tempPath, finalPath)
  } catch (err) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath) } catch {}
    throw err
  }
  return {
    content: `Segmented long-form artifact completed: ${finalPath}\n${completedTokens}/${targetTokens} estimated tokens across ${state.current_section} segments.`,
    artifact: { id: artifactId, node_id: node.id, title: `${node.data?.label || node.id} long-form output`, kind: 'longform_direct_write', path: finalPath, content: '', rolling_state: state, created_at: workflowNow() },
    completedTokens,
    segments: state.current_section
  }
}

const runWorkflowForProject = async (project, workflowIdText, input = {}, onlyNodeId = '') => {
  const store = readWorkflows(project)
  const workflow = (store.workflows || []).find(row => row.id === workflowIdText)
  if (!workflow) throw new Error(`Workflow not found: ${workflowIdText}`)
  validateWorkflowGraph(workflow)
  try {
    const compiledValidation = writerWorkflowUtils.flowCompiler.validateWorkflow(workflow)
    if (!compiledValidation.valid && compiledValidation.errors.length > 0) {
      const errMsg = compiledValidation.errors.slice(0, 3).map(e => e.userMessage).join('; ')
      rememberLog(`Workflow validation issues: ${errMsg}`)
    }
  } catch (valErr) {
    rememberLog(`Workflow validation skipped: ${valErr.message}`)
  }
  const agentStore = readWorkflowAgents(project)
  const agentById = new Map(agentStore.agents.map(agent => [agent.id, agent]))
  const resumeRun = input?.resumeRunId ? (readWorkflowRuns(project).runs || []).find(row => row.run_id === input.resumeRunId) : null
  const resumeNodeId = String(input?.resumeFromNodeId || '')
  const resumeIndex = resumeNodeId ? workflow.nodes.findIndex(node => node.id === resumeNodeId) : -1
  let workflowTokenPlan = null
  try {
    const planResponse = await contextBackendFetch(`/api/context/workflows/${encodeURIComponent(workflow.id)}/token-plan`, {
      method: 'POST',
      body: {
        workflow_id: workflow.id,
        project_id: project.id,
        model: input.model || '',
        provider: input.provider || '',
        nodes: workflow.nodes.map(node => ({
          id: node.id,
          name: node.data?.label || node.data?.name || node.id,
          type: node.type || node.data?.nodeType || 'agent',
          model: node.data?.modelConfig?.model || node.data?.model || '',
          tools: node.data?.tools || [],
          skills: node.data?.skills || [],
          max_retries: node.data?.budgetConfig?.maxRetries,
          is_final: node.type === 'output' || node.data?.isFinal === true,
          reusable: node.data?.reusable === true
        }))
      }
    })
    if (planResponse.status === 200 && planResponse.data && typeof planResponse.data === 'object') {
      workflowTokenPlan = planResponse.data
      if (workflowTokenPlan.blocked) {
        throw new Error(workflowTokenPlan.block_reason || 'Workflow hard token budget exceeded')
      }
    }
  } catch (planErr) {
    if (/budget/i.test(String(planErr?.message || planErr))) throw planErr
    rememberLog(`Workflow TokenPlan unavailable; continuing in advisory compatibility mode: ${planErr.message}`)
  }
  const run = { run_id: workflowId('run'), workflow_id: workflow.id, project_id: project.id, parent_run_id: resumeRun?.run_id || null, status: 'running', node_statuses: resumeRun ? { ...(resumeRun.node_statuses || {}) } : {}, artifacts: [], evidence_pack: [], token_plan: workflowTokenPlan, cost_estimate: { tokens: 0, calls: 0 }, started_at: workflowNow(), finished_at: null, progress: { total: workflow.nodes.length, completed: 0 } }
  const runsStore = readWorkflowRuns(project)
  writeWorkflowRuns(project, [...(runsStore.runs || []), run])
  analytics.track('workflow_run_started', { workflow_id: workflow.id, workflow_name: workflow.name, project_id: project.id, run_id: run.run_id, nodes: workflow.nodes.length, ...getProjectAnalyticsProps(project) })
  const persistRun = () => {
    const rows = readWorkflowRuns(project).runs || []
    writeWorkflowRuns(project, [...rows.filter(row => row.run_id !== run.run_id), run])
  }
  fs.mkdirSync(workflowArtifactsDir(project), { recursive: true })
  const nodes = onlyNodeId ? workflow.nodes.filter(node => node.id === onlyNodeId) : workflow.nodes
  const nodeById = new Map(nodes.map((node, index) => [node.id, { node, index }]))
  const originalIndex = new Map(workflow.nodes.map((node, index) => [node.id, index]))
  let startIndex = 0
  if (!onlyNodeId && resumeIndex >= 0) startIndex = resumeIndex + 1
  let upstream = String(input.input || input.text || input.prompt || input.humanInput || '')
  if (!upstream && resumeRun) upstream = String((resumeRun.artifacts || []).at(-1)?.content || workflowRunSummaryText(resumeRun) || '')
  const agentNodes = []
  const skipped = new Set(Array.isArray(input.skipNodeIds) ? input.skipNodeIds.map(String) : [])
  const limits = defaultWorkflowLimits(workflow.limits)
  const outgoing = new Map()
  for (const edge of workflow.edges || []) {
    const list = outgoing.get(edge.source) || []
    list.push(edge)
    outgoing.set(edge.source, list)
  }
  const setNodeStatus = (node, patch) => {
    const label = node.data?.label || node.data?.name || node.id
    run.node_statuses[node.id] = { ...(run.node_statuses[node.id] || {}), label, ...patch, updated_at: workflowNow() }
    run.updated_at = workflowNow()
    persistRun()
    if (typeof input.onNodeStatus === 'function') input.onNodeStatus({ node, status: run.node_statuses[node.id], run })
  }
  const nextIndexFromEdge = (node, branch = '') => {
    const edges = outgoing.get(node.id) || []
    const matched = branch ? edges.find(edge => String(edge.label || '').toLowerCase().includes(branch)) : null
    const edge = matched || edges[0]
    if (!edge) return null
    const idx = originalIndex.get(edge.target)
    return typeof idx === 'number' ? idx : null
  }
  const runAgentNode = async (node, localUpstream) => {
    const label = node.data?.label || node.data?.name || node.id
    const agent = agentById.get(node.data?.agent_id || node.data?.agentId) || normalizeWorkflowAgent(node.data || {}, 0)
    agentNodes.push(node)
    setNodeStatus(node, { status: 'running', agent_id: agent.id, agent_name: agent.name, summary: `${agent.name} 正在运行。` })

    const services = {
      ragService: getVectorDb(),
      vectorDb: getVectorDb(),
      soulPrompts,
      narrativeService: null,
      wikiService: null,
      bibleService: null,
      dataModel: null
    }
    try { services.dataModel = createWriterDataModelService?.() } catch {}
    try { services.narrativeService = createWriterNarrativeService?.() } catch {}

    const prepared = writerWorkflowUtils.flowCompiler.prepareNodeForExecution({
      node, workflow, project, agent,
      input: { input: input.input || input.text || input.prompt || '', model: input.model, provider: input.provider },
      upstream: localUpstream,
      systemDefault: currentModel,
      systemContextLength: resolveModelContextBudget({
        model: currentModel,
        configuredContextLength: karnaConfig.model_context_length,
        compressionThreshold: karnaConfig.compression?.threshold
      }).effectiveContextTokens,
      availableModels: null,
      services,
      group: null
    })

    let contextText = ''
    let contextPackage = null
    let contextWarnings = []
    let contextCitations = []
    if (prepared.isAgent && !prepared.isArchive) {
      try {
        const { contextPackage: builtContextPackage, contextText: ctxText, warnings } = await writerWorkflowUtils.flowCompiler.buildNodeExecutionContext({
          prepared, project, workflow, node, agent,
          input: { input: input.input || input.text || input.prompt || '' },
          upstream: localUpstream, services
        })
        contextText = ctxText
        contextPackage = builtContextPackage || null
        contextWarnings = warnings
        contextCitations = contextPackage?.citations || []
      } catch (ctxErr) {
        rememberLog(`Node context build failed for ${label}: ${ctxErr.message}`)
        contextWarnings.push(`上下文构建失败: ${ctxErr.message}`)
      }
    }

    let prompt
    let renderedPromptTokens = 0
    let promptSourceSections = null

    const canUseNewPromptBuilder = typeof writerWorkflowUtils.flowCompiler.buildNodePrompt === 'function'

    if (canUseNewPromptBuilder) {
      try {
        const promptResult = writerWorkflowUtils.flowCompiler.buildNodePrompt({
          prepared, project, workflow, node, agent,
          upstream: localUpstream,
          input: input.input || input.text || input.prompt || '',
          contextText,
          contextPackage
        })
        prompt = promptResult.fullPrompt
        renderedPromptTokens = promptResult.tokenEstimate || 0
        promptSourceSections = promptResult.sourceSections || null
      } catch (promptErr) {
        rememberLog(`New prompt builder failed for ${label}, falling back: ${promptErr.message}`)
        prompt = buildLegacyPrompt()
        renderedPromptTokens = Math.ceil(prompt.length / 3)
      }
    } else {
      prompt = buildLegacyPrompt()
      renderedPromptTokens = Math.ceil(prompt.length / 3)
    }

    function buildLegacyPrompt() {
      const basePrompt = writerWorkflowUtils.flowCompiler.buildNodePromptLegacy
        ? writerWorkflowUtils.flowCompiler.buildNodePromptLegacy({
            prepared, project, workflow, node, agent,
            upstream: localUpstream,
            input: input.input || input.text || input.prompt || '',
            contextText
          })
        : writerWorkflowUtils.flowCompiler.buildNodePrompt({
            prepared, project, workflow, node, agent,
            upstream: localUpstream,
            input: input.input || input.text || input.prompt || '',
            contextText
          })

      const knowledgeQuery = [node.data?.knowledge, input.input || input.text || input.prompt || '', localUpstream].filter(Boolean).join('\n')
      const canUseKnowledge = normalizeWorkflowPermissions(agent.permissions).canUseKnowledge
      const legacyKnowledge = (!node.data?.contextConfig?.bindings?.length && (node.data?.knowledge || workflow.knowledge_binding?.enabled) && canUseKnowledge)
        ? knowledgeContextForPrompt(knowledgeQuery).catch(err => { rememberLog(`Workflow knowledge injection skipped: ${err.message}`); return '' })
        : ''

      let result = basePrompt
      if (legacyKnowledge && typeof legacyKnowledge === 'string') {
        result = `${basePrompt}\n\nRelevant knowledge excerpts (legacy binding):\n${legacyKnowledge}\n\nUse the excerpts only when relevant and do not invent sources.`
      }
      return result
    }

    const knowledgeQuery = [node.data?.knowledge, input.input || input.text || input.prompt || '', localUpstream].filter(Boolean).join('\n')
    const canUseKnowledge = normalizeWorkflowPermissions(agent.permissions).canUseKnowledge
    const legacyKnowledge = (!node.data?.contextConfig?.bindings?.length && (node.data?.knowledge || workflow.knowledge_binding?.enabled) && canUseKnowledge)
      ? await knowledgeContextForPrompt(knowledgeQuery).catch(err => { rememberLog(`Workflow knowledge injection skipped: ${err.message}`); return '' })
      : ''

    if (legacyKnowledge && !prompt.includes('Relevant knowledge excerpts (legacy binding)')) {
      prompt = `${prompt}\n\nRelevant knowledge excerpts (legacy binding):\n${legacyKnowledge}\n\nUse the excerpts only when relevant and do not invent sources.`
    }

    if (contextWarnings.length > 0) {
      setNodeStatus(node, { warnings: contextWarnings })
    }

    const plannedNode = workflowTokenPlan?.node_plans?.find(row => row.node_id === node.id)
    const nodeModelMode = String(node.data?.modelConfig?.mode || '').toLowerCase()
    const explicitNodeModel = nodeModelMode && nodeModelMode !== 'inherit' ? prepared.resolvedModel : ''
    const selectedModel = explicitNodeModel || plannedNode?.model || prepared.resolvedModel || agent.model || input.model
    const selectedProvider = plannedNode?.provider || input.provider
    const nodeType = String(node.type || node.data?.nodeType || '').toLowerCase()
    const reusableNode = node.data?.reusable === true || /(extract|parse|embed|fact.?check|summar|glossary|structure|retriev)/i.test(nodeType)
    const nodeCacheKey = textHash(JSON.stringify({
      workflow: workflow.id, node: node.id, type: nodeType, model: selectedModel || '',
      prompt, skills: prepared.resolvedSkills || [], tools: prepared.resolvedTools || [],
      projectVersion: project.updated_at || project.created_at || ''
    }))
    if (reusableNode) {
      const cacheStore = readWorkflowNodeCache(project)
      const cached = (cacheStore.entries || []).find(row => row.key === nodeCacheKey)
      if (cached?.content) {
        const saved = Math.max(0, Number(cached.input_tokens || 0) - 64)
        run.cost_estimate.tokens += 64
        setNodeStatus(node, { status: 'done', reused: true, cache_key: nodeCacheKey, summary: String(cached.content).slice(0, 1200) })
        await contextBackendFetch('/api/context/reuse-records', {
          method: 'POST',
          body: {
            reuse_type: 'workflow_node', session_id: run.run_id, project_id: project.id,
            workflow_id: workflow.id, node_id: node.id, source_ref: cached.source_ref || '',
            cache_key: nodeCacheKey, input_hash: nodeCacheKey,
            tokens_before: Number(cached.input_tokens || saved), tokens_after: 64,
            model_id: selectedModel || ''
          }
        }).catch(err => rememberLog(`Workflow reuse record skipped for ${label}: ${err.message}`))
        return String(cached.content)
      }
    }

    run.cost_estimate.calls += 1
    run.cost_estimate.tokens += renderedPromptTokens || Math.ceil(prompt.length / 3)
    let content = ''
    try {
      if (!selectedModel && prepared.isAgent) {
        rememberLog(`No model resolved for agent node ${label}, falling back to default`)
      }
      const targetOutputTokens = Number(node.data?.targetTokens || node.data?.target_tokens || extractRequestedOutputTokens(input) || 0)
      const perCallOutputCap = Math.max(512, Number(node.data?.modelConfig?.maxOutputTokens || node.data?.budgetConfig?.maxOutputTokens || prepared.resolvedBudget?.maxOutputTokens || 4096))
      const isFinalDraftNode = node.data?.isFinal === true || /final|compile|成稿|终稿/i.test(`${node.type || ''} ${label}`)
      if (isFinalDraftNode && targetOutputTokens > perCallOutputCap) {
        const segmented = await runSegmentedWorkflowWrite({
          project, workflow, run, node, agent, prompt, model: selectedModel,
          provider: selectedProvider, targetTokens: targetOutputTokens,
          segmentTokens: perCallOutputCap
        })
        content = segmented.content
        run.artifacts.push(segmented.artifact)
        run.cost_estimate.calls += segmented.segments - 1
        run.cost_estimate.tokens += segmented.completedTokens
      } else {
        const response = await chatBackendFetch({ method: 'POST', body: { messages: soulPrompts.buildChatMessages({ profile: 'default', projectContext: projectSessionContext(project, null), prompt }), model: selectedModel, provider: selectedProvider }, timeoutMs: 300_000 })
        content = response.status === 200 ? (typeof response.data === 'object' && response.data ? response.data.content || response.data.message || JSON.stringify(response.data) : String(response.data)) : `Node failed: ${response.data?.detail || response.data?.message || response.status}`
        const usage = response?.data?.usage || {}
        await contextBackendFetch('/api/context/token-usage', {
          method: 'POST',
          body: {
            provider: selectedProvider || '', model: selectedModel || '',
            session_id: run.run_id, project_id: project.id, workspace_id: project.id,
            workflow_id: workflow.id, node_id: node.id, agent_id: agent.id,
            source_kind: 'workflow_node',
            input_tokens: Number(usage.input_tokens || usage.prompt_tokens || renderedPromptTokens || Math.ceil(prompt.length / 3)),
            cached_input_tokens: Number(usage.cached_input_tokens || usage.cache_read_input_tokens || 0),
            output_tokens: Number(usage.output_tokens || usage.completion_tokens || Math.ceil(content.length / 3)),
            reasoning_tokens: Number(usage.reasoning_tokens || 0),
            usage_source: Object.keys(usage).length ? 'provider' : 'estimate',
            cache_hit: Number(usage.cached_input_tokens || usage.cache_read_input_tokens || 0) > 0
          }
        }).catch(err => rememberLog(`Workflow token usage record skipped for ${label}: ${err.message}`))
        if (reusableNode && !content.startsWith('Node failed')) {
          const cacheStore = readWorkflowNodeCache(project)
          const entries = (cacheStore.entries || []).filter(row => row.key !== nodeCacheKey)
          entries.push({
            key: nodeCacheKey, node_id: node.id, workflow_id: workflow.id,
            model: selectedModel || '', content,
            input_tokens: Number(usage.input_tokens || usage.prompt_tokens || renderedPromptTokens || Math.ceil(prompt.length / 3)),
            source_ref: `workflow:${workflow.id}:${run.run_id}:${node.id}`,
            created_at: workflowNow()
          })
          writeWorkflowNodeCache(project, entries)
        }
      }
    } catch (err) {
      content = `Node failed: ${err instanceof Error ? err.message : String(err)}\n\n[Local fallback]\n${prompt.slice(0, 1200)}`
    }
    // Context OS event sink: preserve the full node artifact, but hand only a
    // compact summary/reference to downstream nodes.  This is intentionally in
    // the real workflow lifecycle rather than a standalone API demo.
    const nodeSummary = content.slice(0, 1200)
    const contextRefs = []
    const nodeFileRefs = []
    if (content.length > 4000) {
      const nodeArtifact = {
        id: workflowId('artifact'),
        node_id: node.id,
        title: `${label} full output`,
        kind: 'node_output',
        content,
        created_at: workflowNow()
      }
      const nodeFile = path.join(workflowArtifactsDir(project), `${nodeArtifact.id}.md`)
      fs.writeFileSync(nodeFile, `# ${nodeArtifact.title}\n\n${content}\n`, 'utf8')
      nodeArtifact.path = nodeFile
      run.artifacts.push(nodeArtifact)
      nodeFileRefs.push(nodeFile)
      try {
        const stored = await contextBackendFetch('/api/context/tool-outputs', {
          method: 'POST',
          body: {
            tool_name: 'writer_workflow_node', content,
            session_id: run.run_id, workspace_id: project.id,
            task_id: workflow.id, node_id: node.id, agent_id: agent.id,
            source_kind: 'subagent_output', summary: nodeSummary,
            related_files: nodeFileRefs
          }
        })
        const handle = stored?.data?.handle
        if (handle) {
          contextRefs.push(handle)
          run.evidence_pack.push({ node_id: node.id, agent_id: agent.id, handle, summary: nodeSummary, created_at: workflowNow() })
        }
      } catch (ctxErr) {
        rememberLog(`Node output externalization skipped for ${label}: ${ctxErr.message}`)
      }
    }
    try {
      await contextBackendFetch('/api/context/node-summaries', {
        method: 'POST',
        body: {
          flow_run_id: run.run_id, node_id: node.id, agent_id: agent.id,
          task: label, input_summary: String(localUpstream || '').slice(0, 1000),
          output_summary: nodeSummary, evidence_refs: contextRefs,
          file_refs: nodeFileRefs,
          errors: content.startsWith('Node failed') ? [nodeSummary] : [],
          token_usage: renderedPromptTokens || Math.ceil(prompt.length / 3),
          workspace_id: project.id, session_id: run.run_id,
          summary_quality: content.startsWith('Node failed') ? 'error' : 'ok',
          context_packet: { profile: 'multi_agent_flow', citations: contextCitations }
        }
      })
    } catch (ctxErr) {
      rememberLog(`Node summary persistence skipped for ${label}: ${ctxErr.message}`)
    }
    setNodeStatus(node, {
      status: content.startsWith('Node failed') ? 'blocked' : 'done',
      agent_id: agent.id,
      agent_name: agent.name,
      summary: nodeSummary,
      context_refs: contextRefs,
      artifact_refs: nodeFileRefs,
      resolved_model: prepared.resolvedModel,
      context_sources: contextCitations.length,
      context_warnings: contextWarnings,
      rendered_prompt_tokens: renderedPromptTokens,
      prompt_source_sections: promptSourceSections
    })
    return contextRefs.length
      ? `${nodeSummary}\n\nFull output references:\n${[...contextRefs, ...nodeFileRefs].join('\n')}`
      : content
  }
  const completeOne = () => { run.progress.completed = Math.min(run.progress.total, Number(run.progress.completed || 0) + 1); persistRun() }
  let index = Math.max(0, startIndex)
  const visited = new Set()
  while (index < workflow.nodes.length) {
    if (workflowStopRequests.has(run.run_id)) {
      workflowStopRequests.delete(run.run_id)
      run.status = 'cancelled'
      run.finished_at = workflowNow()
      persistRun()
      break
    }

    const node = workflow.nodes[index]
    if (!node || (onlyNodeId && !nodeById.has(node.id))) { index += 1; continue }
    const label = node.data?.label || node.data?.name || node.id
    if (visited.has(`${node.id}:${index}`)) { setNodeStatus(node, { status: 'blocked', summary: 'Stopped because this path repeated. Use loop node with explicit cap.' }); run.status = 'blocked'; break }
    visited.add(`${node.id}:${index}`)
    try {
      if (skipped.has(node.id)) { setNodeStatus(node, { status: 'skipped', summary: 'Skipped by author before run.' }); completeOne(); index += 1; continue }
      if (node.type === 'input') {
        upstream = [upstream, node.data?.content, node.data?.prompt].filter(Boolean).join('\n\n')
        setNodeStatus(node, { status: 'done', summary: String(upstream).slice(0, 500) })
        completeOne(); index = nextIndexFromEdge(node) ?? index + 1; continue
      }
      if (node.type === 'human_review') {
        const mustReview = node.data?.requiresReview === true || node.data?.requiresReview === 'true'
        if (!mustReview) {
          setNodeStatus(node, { status: 'done', summary: '人工确认节点已跳过，流程继续向下执行。' })
          completeOne(); index = nextIndexFromEdge(node) ?? index + 1; continue
        }
        if (input?.action === 'continue' || input?.humanInput) {
          upstream = [upstream, input.humanInput].filter(Boolean).join('\n\n')
          setNodeStatus(node, { status: 'accepted', summary: '已收到人工确认，继续执行后续节点。', human_input: String(input.humanInput || '').slice(0, 2000) })
          completeOne(); index = nextIndexFromEdge(node) ?? index + 1; continue
        }
        run.status = 'paused'; run.paused_at_node_id = node.id; persistRun()
        setNodeStatus(node, { status: 'paused', summary: '等待人工确认：请检查当前节点产出并决定继续、驳回或跳过。' })
        break
      }
      if (node.type === 'loop') {
        const rounds = Math.min(limits.max_loop, Math.max(1, Number(node.data?.rounds || 3)))
        setNodeStatus(node, { status: 'done', rounds, summary: `Loop cap is ${rounds} rounds. Dispatcher will stop retries at this cap.` })
        completeOne(); index = nextIndexFromEdge(node) ?? index + 1; continue
      }
      if (node.type === 'condition') {
        const threshold = Math.max(0, Math.min(100, Number(node.data?.threshold || node.data?.pass_score || 60)))
        const score = firstScoreFromText(upstream)
        const branch = score == null ? 'unknown' : score >= threshold ? 'pass' : 'retry'
        setNodeStatus(node, { status: 'done', score, threshold, branch, summary: score == null ? `No score recognized; continuing default path. Condition: ${node.data?.condition || 'not set'}` : `Score ${score}/${threshold}; entering ${branch === 'pass' ? 'pass' : 'retry'} branch.` })
        completeOne()
        const configuredTarget = branch === 'pass' ? (node.data?.passTargetId || node.data?.pass_target_id) : branch === 'retry' ? (node.data?.retryTargetId || node.data?.retry_target_id) : ''
        const configuredIndex = configuredTarget ? originalIndex.get(String(configuredTarget)) : null
        index = typeof configuredIndex === 'number' ? configuredIndex : (nextIndexFromEdge(node, branch) ?? index + 1)
        continue
      }
      if (node.type === 'parallel') {
        const fanoutEdges = (outgoing.get(node.id) || []).slice(0, limits.max_parallel)
        let parallelNodes = fanoutEdges.map(edge => workflow.nodes[originalIndex.get(edge.target)]).filter(child => child && child.type === 'agent')
        if (!parallelNodes.length) {
          let scan = index + 1
          while (scan < workflow.nodes.length && workflow.nodes[scan]?.type === 'agent' && parallelNodes.length < limits.max_parallel) { parallelNodes.push(workflow.nodes[scan]); scan += 1 }
        }
        setNodeStatus(node, { status: 'running', summary: `并行启动 ${parallelNodes.length} 个 Agent；所有输出先回到隐藏调度器。` })
        const results = await Promise.all(parallelNodes.map(child => runAgentNode(child, upstream).catch(err => `Node failed: ${err instanceof Error ? err.message : String(err)}`)))
        upstream = results.map((content, i) => `## ${parallelNodes[i]?.data?.label || parallelNodes[i]?.id}\n${content}`).join('\n\n')
        const maxChildIndex = parallelNodes.reduce((max, child) => Math.max(max, originalIndex.get(child.id) ?? index), index)
        setNodeStatus(node, { status: 'done', parallel_count: parallelNodes.length, summary: `并行任务已完成：${parallelNodes.length} 个 Agent 的输出已合并，可进入下游节点。` })
        const childIds = new Set(parallelNodes.map(child => child.id))
        const nonChildEdge = (outgoing.get(node.id) || []).find(edge => !childIds.has(edge.target))
        const nonChildIndex = nonChildEdge ? originalIndex.get(nonChildEdge.target) : null
        completeOne(); index = typeof nonChildIndex === 'number' ? nonChildIndex : maxChildIndex + 1; continue
      }
      if (node.type === 'archive') {
        const artifact = { id: workflowId('artifact'), node_id: node.id, title: label, kind: 'workflow', content: upstream, created_at: workflowNow() }
        const file = path.join(workflowArtifactsDir(project), `${artifact.id}.md`)
        fs.writeFileSync(file, `# ${label}\n\n${upstream}\n`, 'utf8')
        artifact.path = file; run.artifacts.push(artifact)
        setNodeStatus(node, { status: 'done', summary: `Archived to ${file}`, artifact_id: artifact.id })
        completeOne(); index = nextIndexFromEdge(node) ?? index + 1; continue
      }
      if (node.type === 'output') {
        setNodeStatus(node, { status: 'done', summary: String(upstream).slice(0, 1200) })
        completeOne(); index = nextIndexFromEdge(node) ?? index + 1; continue
      }
      if (node.type === 'agent') {
        upstream = await runAgentNode(node, upstream)
        completeOne(); index = nextIndexFromEdge(node) ?? index + 1; continue
      }
      setNodeStatus(node, { status: 'done', summary: `Unknown node type ${node.type}; skipped.` })
      completeOne(); index += 1
    } catch (err) {
      run.node_statuses[node.id] = { ...(run.node_statuses[node.id] || {}), status: 'blocked', label, summary: err instanceof Error ? err.message : String(err), updated_at: workflowNow() }
      run.status = 'blocked'
      break
    }
    if (onlyNodeId) break
  }
  if (run.status === 'running') run.status = Object.values(run.node_statuses).some(row => row.status === 'blocked') ? 'blocked' : 'done'
  run.finished_at = workflowNow()
  if (run.status === 'done') {
    analytics.track('workflow_run_completed', { workflow_id: workflow.id, workflow_name: workflow.name, project_id: project.id, run_id: run.run_id, nodes_completed: run.progress.completed, ...getProjectAnalyticsProps(project) })
  } else {
    analytics.track('workflow_run_failed', { workflow_id: workflow.id, workflow_name: workflow.name, project_id: project.id, run_id: run.run_id, status: run.status, ...getProjectAnalyticsProps(project) })
  }
  const artifact = { id: workflowId('artifact'), node_id: 'final', title: `${workflow.name} run result`, kind: 'workflow_result', content: upstream, created_at: workflowNow() }
  const file = path.join(workflowArtifactsDir(project), `${artifact.id}.md`)
  fs.writeFileSync(file, `# ${artifact.title}\n\n${upstream}\n`, 'utf8')
  artifact.path = file
  run.artifacts.push(artifact)
  appendWorkflowTaskSystem(project, workflow, run, agentNodes)
  const latestRuns = readWorkflowRuns(project).runs || []
  writeWorkflowRuns(project, [...latestRuns.filter(row => row.run_id !== run.run_id), run])
  return { ok: true, run, workflow, tasks: readTaskSystem(project) }
}

const projectSessionContext = (project, agent = null) => {
  const workspaceLabel = project.slug || project.id || project.title || 'project'
  const base = [`Project: ${project.title}`, `Type: ${project.type}`, `Workspace: ${workspaceLabel} (local path hidden)`]
  const agents = (() => { try { return readWriterAgents(project).agents.filter(a => a.enabled !== false) } catch { return [] } })()
  const nonControllerAgents = agents.filter(a => a.id !== 'controller')
  base.push(`Agents in this project: ${nonControllerAgents.map(a => `${a.name} (${a.brief || a.role})`).join('; ') || 'none'}`)
  base.push('Coordination rule: the controller schedules the project. When the user assigns work in the controller chat, split task_system.json and assign tasks to the project agents. Other agent chats are result views; they receive work from task_system, not direct user prompting.')
  base.push('Structured output rule: for character relationship graphs, event links, and knowledge graphs, provide readable explanation plus tolerant JSON. Missing fields must be empty arrays or strings; never stop collaboration because of JSON formatting.')
  if (agent) {
    base.push(`Current agent: ${agent.name}`)
    base.push(`Duty: ${agent.brief}`)
    if (agent.persona) base.push(`Persona: ${agent.persona}`)
    if (agent.skills?.length) base.push(`Skills: ${agent.skills.join(', ')}`)
    if (agent.mcp?.length) base.push(`MCP: ${agent.mcp.join(', ')}`)
    if (agent.id === 'controller') base.push('You are the controller. You can see and schedule all project agents listed above. Answer according to that roster.')
  } else {
    base.push('Role: controller. Discuss goals with the user, make plans, create and assign task_system.json.')
  }
  return base.join('\n')
}
const createStoredSession = ({ title = '\u65b0\u4f1a\u8bdd', cwd = '', project = null, agent = null, source = 'tui', conversation_scope = 'standalone', writer_project_id = null, workspace_id = null } = {}) => {
  const newId = `karna-${Date.now()}-${nextSessionNum++}`
  const session = {
    id: newId,
    title,
    created: nowSeconds(),
    updated: nowSeconds(),
    message_count: 0,
    archived: false,
    source,
    provider: currentModelProvider,
    model: currentModel,
    profile: 'default',
    cwd: cwd || project?.folder || karnaConfig?.terminal?.cwd || 'D:\\Agent',
    project_id: project?.id || writer_project_id || null,
    project_title: project?.title || null,
    agent_id: agent?.id || null,
    agent_name: agent?.name === 'Project Controller' ? '\u4e3b\u63a7' : (agent?.name || null),
    agent_role: agent?.role === 'Project Controller' ? '\u4e3b\u63a7' : (agent?.role || null),
    system_context: project ? projectSessionContext(project, agent) : '',
    conversation_scope,
    writer_project_id: writer_project_id || project?.id || null,
    workspace_id
  }
  sessions.set(newId, session)
  sessionMessages.set(newId, [])
  return session
}
const ensureStoredSession = ({ id, title = '\u65b0\u4f1a\u8bdd', cwd = '', project = null, agent = null, source = 'tui' } = {}) => {
  if (!id) return null
  if (sessionLifecycleService.preventResurrection(id)) return null
  const existing = sessions.get(id)
  if (existing) return existing
  const session = {
    id,
    title,
    created: nowSeconds(),
    updated: nowSeconds(),
    message_count: 0,
    archived: false,
    source,
    provider: currentModelProvider,
    model: currentModel,
    profile: 'default',
    cwd: cwd || project?.folder || karnaConfig?.terminal?.cwd || 'D:\\Agent',
    project_id: project?.id || null,
    project_title: project?.title || null,
    agent_id: agent?.id || null,
    agent_name: agent?.name === 'Project Controller' ? '\u4e3b\u63a7' : (agent?.name || null),
    agent_role: agent?.role === 'Project Controller' ? '\u4e3b\u63a7' : (agent?.role || null),
    system_context: project ? projectSessionContext(project, agent) : ''
  }
  sessions.set(id, session)
  if (!sessionMessages.has(id)) sessionMessages.set(id, [])
  return session
}
const defaultTaskSystem = (project, agents = []) => ({
  version: 1,
  project_id: project.id,
  project_title: project.title,
  goal: '',
  schema_version: 1,
  output_schema: {
    knowledge_graph: { nodes: [], edges: [], events: [], characters: [] },
    validation: { ok: true, errors: [] }
  },
  monitor: { status: 'idle', updated_at: new Date().toISOString(), summary: 'Waiting for controller to generate tasks.' },
  tasks: [],
  claims: [],
  agents: agents.map(agent => ({ id: agent.id, name: agent.name, role: agent.role, status: agent.status || 'sleeping', active_task_ids: [] }))
})
const taskSystemPath = project => path.join(project.folder, 'task_system.json')
const readTaskSystem = project => {
  const file = taskSystemPath(project)
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) }
  catch { return defaultTaskSystem(project, readWriterAgents(project).agents) }
}
const writeTaskSystem = (project, data) => {
  const next = { ...data, version: 1, project_id: project.id, project_title: project.title, monitor: { ...(data.monitor || {}), updated_at: new Date().toISOString() } }
  fs.writeFileSync(taskSystemPath(project), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return next
}
const agentStatusFromTasks = (agent, tasks = []) => {
  const mine = tasks.filter(task => task.owner_agent_id === agent.id)
  const review = mine.find(task => task.status === 'review')
  if (review) return { status: 'pending_approval', status_label: '\u5f85\u5ba1\u6279', status_detail: review.title || '' }
  const active = mine.find(task => ['claimed', 'in_progress'].includes(task.status))
  if (active) return { status: 'working', status_label: '\u6b63\u5728\u5de5\u4f5c', status_detail: active.title || '' }
  const waiting = mine.find(task => task.status === 'todo' && Array.isArray(task.depends_on) && task.depends_on.length)
  if (waiting) return { status: 'waiting', status_label: '\u7b49\u5f85\u524d\u7f6e\u4efb\u52a1', status_detail: waiting.title || '', waiting_for: waiting.depends_on.join(',') }
  return { status: agent.status || 'sleeping', status_label: normalizeAgentStatusLabel(agent.status_label), status_detail: agent.status_detail || '' }
}

const enrichWriterProject = project => {
  const tasks = readTaskSystem(project)
  const writerAgentsData = readWriterAgents(project)
  const agents = writerAgentsData.agents.map(agent => ({ ...agent, ...agentStatusFromTasks(agent, tasks.tasks || []) }))
  const controller = agents.find(agent => agent.id === 'controller') || { id: 'controller', name: '主控', role: '主控', brief: '统筹项目计划、任务分发和进度监控' }
  let updatedProject = { ...project }

  const allSessions = Array.from(sessions.values())
  const tombstones = sessionLifecycleService.loadTombstones()
  const projectSessions = allSessions.filter(s => {
    if (tombstones.has(s.id)) return false
    return s.writer_project_id === project.id || s.project_id === project.id
  }).map(storedSessionInfo)

  const validSessionIds = new Set(projectSessions.map(s => s.id))
  const cleanedSessionIds = (project.session_ids || []).filter(id => validSessionIds.has(id))
  const cleanedAgentSessionIds = {}
  for (const [agentId, sid] of Object.entries(project.agent_session_ids || {})) {
    if (validSessionIds.has(sid)) {
      cleanedAgentSessionIds[agentId] = sid
    }
  }
  let cleanedMainSessionId = project.main_session_id
  if (cleanedMainSessionId && !validSessionIds.has(cleanedMainSessionId)) {
    cleanedMainSessionId = null
  }

  let agentsChanged = false
  const cleanedAgents = agents.map(agent => {
    if (agent.session_id && !validSessionIds.has(agent.session_id)) {
      agentsChanged = true
      return { ...agent, session_id: null }
    }
    return agent
  })

  const projectMetaChanged = cleanedMainSessionId !== project.main_session_id
    || cleanedSessionIds.length !== (project.session_ids || []).length
    || Object.keys(cleanedAgentSessionIds).length !== Object.keys(project.agent_session_ids || {}).length

  if (projectMetaChanged) {
    updatedProject = {
      ...updatedProject,
      session_ids: cleanedSessionIds,
      agent_session_ids: cleanedAgentSessionIds,
      main_session_id: cleanedMainSessionId
    }
    try {
      const store = readWriterProjects()
      const idx = (store.projects || []).findIndex(p => p.id === project.id)
      if (idx >= 0) {
        store.projects[idx] = { ...store.projects[idx], main_session_id: cleanedMainSessionId, session_ids: cleanedSessionIds, agent_session_ids: cleanedAgentSessionIds }
        writeWriterProjects(store)
      }
    } catch (e) { rememberLog(`enrichWriterProject: persist project meta failed: ${e.message}`) }
  }

  if (agentsChanged) {
    writeWriterAgentsData(project, cleanedAgents.map(a => ({ ...a, session_id: a.session_id || null })))
  }

  let enriched = {
    ...updatedProject,
    agents: cleanedAgents,
    tasks,
    sessions: projectSessions
  }
  if (updatedProject.taxonomy && updatedProject.taxonomy.schemaVersion === 2 && updatedProject.taxonomy.formId) {
    try {
      const catalog = getWriterFormsCatalog()
      const form = catalog.forms.find(f => f.id === updatedProject.taxonomy.formId)
      if (form) {
        const domain = catalog.domains.find(d => d.id === updatedProject.taxonomy.domainId)
        const family = catalog.families.find(f => f.id === updatedProject.taxonomy.familyId)
        enriched = {
          ...enriched,
          form_info: {
            id: form.id,
            label: form.label,
            aliases: form.aliases,
            description: form.description || '',
            tags: form.tags || []
          },
          domain_info: domain ? { id: domain.id, label: domain.label, description: domain.description } : null,
          family_info: family ? { id: family.id, label: family.label, description: family.description } : null,
          resolved_capabilities: {
            primaryDocumentType: updatedProject.taxonomy.primaryDocumentType,
            promptProfileId: form.promptProfileId || 'default',
            outputSchemaProfileId: form.outputSchemaProfileId || 'default',
            capabilityProfileId: updatedProject.taxonomy.capabilityProfileId || form.capabilityProfileId || 'default',
            knowledgeProfileId: form.knowledgeProfileId || 'default',
            workflowProfileIds: form.workflowProfileIds || [],
            documentPresetIds: form.documentPresetIds || []
          }
        }
      }
    } catch { /* ignore catalog lookup errors */ }
  }
  return enriched
}
const readWriterProjectsEnriched = (opts = {}) => {
  const store = readWriterProjects()
  const rows = (store.projects || []).filter(project => opts.includeArchived || project.status !== 'archived')
  return { ...store, projects: rows.map(enrichWriterProject) }
}
const agentTaskTitle = agent => {
  const text = `${agent.name || ''} ${agent.role || ''} ${agent.brief || ''}`
  if (/\u5927\u7eb2|\u7ed3\u6784|outline/i.test(text)) return '\u6784\u5efa\u9879\u76ee\u5927\u7eb2'
  if (/\u4eba\u7269|\u89d2\u8272|character/i.test(text)) return '\u5efa\u7acb\u4eba\u7269\u8bbe\u5b9a\u4e0e\u5173\u7cfb'
  if (/\u4e16\u754c|\u8bbe\u5b9a|\u8d44\u6599|research|\u80cc\u666f/i.test(text)) return '\u6574\u7406\u4e16\u754c\u89c2\u4e0e\u8d44\u6599\u4f9d\u636e'
  if (/\u8bfb\u8005|\u5e02\u573a|\u53d7\u4f17|reader/i.test(text)) return '\u6a21\u62df\u8bfb\u8005\u671f\u5f85\u4e0e\u9605\u8bfb\u53cd\u9988'
  if (/\u5199\u7a3f|\u4e3b\u7b14|draft|writer|\u6b63\u6587/i.test(text)) return '\u64b0\u5199\u6837\u7a3f\u6216\u6b63\u6587\u7247\u6bb5'
  if (/\u8bc4\u8bba|\u5ba1\u7a3f|\u6279\u8bc4|review|critic/i.test(text)) return '\u8bc4\u5ba1\u6210\u679c\u5e76\u63d0\u51fa\u4fee\u6539\u610f\u89c1'
  if (/\u6da6\u8272|\u6821\u5bf9|\u7ec8\u7a3f|polish|proof/i.test(text)) return '\u6da6\u8272\u6587\u5b57\u5e76\u6574\u7406\u4ea4\u4ed8\u6210\u679c'
  return `${agent.name || agent.role || '\u667a\u80fd\u4f53'}\u6267\u884c\u9879\u76ee\u4efb\u52a1`
}

const agentTaskDescription = (agent, goal, project) => {
  const title = agentTaskTitle(agent)
  return `${title}\u3002\u9879\u76ee\u76ee\u6807\uff1a${String(goal || project.title || '').trim()}\u3002\u8bf7\u6309\u4f60\u7684\u804c\u8d23\u201c${agent.brief || agent.role || agent.name}\u201d\u8f93\u51fa\u53ef\u76f4\u63a5\u7528\u4e8e\u9879\u76ee\u63a8\u8fdb\u7684\u7ed3\u679c\uff1b\u5982\u6d89\u53ca\u4eba\u7269\u5173\u7cfb\u3001\u4e8b\u4ef6\u7ebf\u7d22\u3001\u77e5\u8bc6\u56fe\u8c31\uff0c\u8bf7\u4f18\u5148\u4f7f\u7528\u7ed3\u6784\u5316\u5c0f\u8282\u6216 JSON \u7247\u6bb5\uff0c\u683c\u5f0f\u9519\u8bef\u4e5f\u4e0d\u8981\u4e2d\u65ad\u534f\u4f5c\u3002`
}

const agentWaitsForPrevious = agent => /\u8bc4\u8bba|\u5ba1\u7a3f|\u6279\u8bc4|\u6da6\u8272|\u6821\u5bf9|\u7ec8\u7a3f|review|critic|polish|proof/i.test(`${agent.name || ''} ${agent.role || ''} ${agent.brief || ''}`)

const generateProjectTasks = (project, goal = '') => {
  const agents = readWriterAgents(project).agents.filter(agent => agent.enabled !== false)
  const workers = agents.filter(agent => agent.id !== 'controller')
  const now = new Date().toISOString()
  const fallback = workers.length ? workers : agents.length ? agents : [{ id: 'controller', name: '\u4e3b\u63a7', role: '\u4e3b\u63a7' }]
  const firstParallelId = `task_1_${crypto.randomBytes(3).toString('hex')}`
  const tasks = fallback.map((owner, index) => {
    const id = index === 0 ? firstParallelId : `task_${index + 1}_${crypto.randomBytes(3).toString('hex')}`
    const waitsForDraft = index > 0 && agentWaitsForPrevious(owner)
    return {
      id,
      title: agentTaskTitle(owner),
      description: agentTaskDescription(owner, goal, project),
      owner_agent_id: owner.id,
      owner_agent_name: owner.name,
      status: waitsForDraft ? 'todo' : 'claimed',
      priority: index + 1,
      depends_on: waitsForDraft ? [firstParallelId] : [],
      output_path: '',
      updated_at: now,
      notes: ''
    }
  })
  const data = {
    ...defaultTaskSystem(project, agents),
    goal: String(goal || project.title).trim(),
    tasks,
    claims: tasks.filter(t => t.status === 'claimed').map(t => ({ task_id: t.id, agent_id: t.owner_agent_id, claimed_at: now })),
    monitor: { status: 'active', updated_at: now, summary: '\u4e3b\u63a7\u5df2\u751f\u6210\u4efb\u52a1\uff0c\u53ef\u5e76\u884c\u6267\u884c\u7684\u667a\u80fd\u4f53\u5df2\u8ba4\u9886\u3002' }
  }
  return writeTaskSystem(project, data)
}

const updateProjectTask = (project, taskId, patch = {}) => {
  const data = readTaskSystem(project)
  const now = new Date().toISOString()
  data.tasks = (data.tasks || []).map(task => task.id === taskId ? { ...task, ...patch, updated_at: now } : task)
  if (!(data.tasks || []).some(task => task.id === taskId)) throw new Error(`Task not found: ${taskId}`)
  if (patch.status === 'claimed' || patch.owner_agent_id) {
    data.claims = [...(data.claims || []), { task_id: taskId, agent_id: patch.owner_agent_id || data.tasks.find(t => t.id === taskId)?.owner_agent_id || '', claimed_at: now }]
  }
  data.monitor = { ...(data.monitor || {}), status: 'active', updated_at: now, summary: 'Task status updated.' }
  return writeTaskSystem(project, data)
}

const deleteWriterProject = ref => {
  const store = readWriterProjects()
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const projects = (store.projects || []).filter(row => row.id !== project.id)
  for (const session of Array.from(sessions.values())) {
    if (session.project_id === project.id) {
      sessions.delete(session.id)
      sessionMessages.delete(session.id)
    }
  }
  if (project.folder && fs.existsSync(project.folder) && String(project.folder).includes('writer-projects')) fs.rmSync(project.folder, { recursive: true, force: true })
  writeWriterProjects({ ...store, active_project_id: store.active_project_id === project.id ? '' : store.active_project_id, projects })
  return { ok: true, deleted: project.id }
}
const openWriterProjectFolder = ref => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  fs.mkdirSync(project.folder, { recursive: true })
  const child = spawn('explorer.exe', [project.folder], { detached: true, stdio: 'ignore' })
  child.unref?.()
  return { ok: true, folder: project.folder }
}

const parseTypedTitle = arg => {
  const text = String(arg || '').trim()
  const match = /^(novel|webnovel|paper|essay|script|poetry|copy|editorial|research)\s*[:?]\s*(.+)$/i.exec(text)
  return { type: (match?.[1] || 'novel').toLowerCase(), title: (match?.[2] || text || 'Untitled writing project').trim() }
}
const ensureWriterProjectFolders = project => {
  fs.mkdirSync(project.folder, { recursive: true })
}
const safeWriteFile = (filePath, content, encoding = 'utf8') => {
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, content, encoding)
    return true
  }
  return false
}

const WRITER_FILE_TREE_DIRS = ['manuscript', 'notes', 'drafts', 'exports', 'bible', 'versions', 'sources', 'workflow_artifacts']
const WRITER_ALLOWED_EXTENSIONS = new Set(['.md', '.txt', '.json', '.docx'])

const scanProjectDirectory = (dirPath, basePath, maxDepth = 2, currentDepth = 0) => {
  const result = []
  if (!fs.existsSync(dirPath)) return result
  let entries
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return result
  }
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
    const relPath = path.relative(basePath, fullPath)
    if (entry.isDirectory()) {
      if (currentDepth < maxDepth) {
        const children = scanProjectDirectory(fullPath, basePath, maxDepth, currentDepth + 1)
        result.push({
          name: entry.name,
          type: 'dir',
          path: relPath,
          children
        })
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase()
      if (WRITER_ALLOWED_EXTENSIONS.has(ext)) {
        result.push({
          name: entry.name,
          type: 'file',
          path: relPath
        })
      }
    }
  }
  return result
}

const getProjectFileTree = (project) => {
  const tree = []
  for (const dirName of WRITER_FILE_TREE_DIRS) {
    const dirPath = path.join(project.folder, dirName)
    const children = scanProjectDirectory(dirPath, project.folder, 1, 0)
    tree.push({
      name: dirName,
      type: 'dir',
      path: dirName,
      children
    })
  }
  return { tree }
}

const getProjectVersions = (project) => {
  const versionsDir = path.join(project.folder, 'versions')
  const result = []
  if (!fs.existsSync(versionsDir)) return { versions: result }
  let entries
  try {
    entries = fs.readdirSync(versionsDir, { withFileTypes: true })
  } catch {
    return { versions: result }
  }
  for (const entry of entries) {
    if (!entry.isFile()) continue
    if (path.extname(entry.name).toLowerCase() !== '.md') continue
    const fullPath = path.join(versionsDir, entry.name)
    try {
      const stats = fs.statSync(fullPath)
      let content = ''
      try {
        content = fs.readFileSync(fullPath, 'utf8').slice(0, 2000)
      } catch {}
      result.push({
        name: entry.name,
        mtime: stats.mtime.toISOString(),
        size: stats.size,
        content
      })
    } catch {}
  }
  result.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())
  return { versions: result }
}
const upsertKnowledgeFolder = folder => {
  const store = readKnowledgeConfig()
  const folders = Array.from(new Set([...(Array.isArray(store.folders) ? store.folders : (Array.isArray(store.config?.folders) ? store.config.folders : [])), folder]))
  writeKnowledgeConfig({ ...store, config: { ...(store.config || {}), folders }, folders })
}

const normalizeProjectType = type => {
  const t = String(type || 'novel').toLowerCase()
  if (t.includes('web') || t.includes('\u7f51\u6587')) return 'web-novel'
  if (t.includes('paper') || t.includes('research') || t.includes('\u8bba\u6587')) return 'paper'
  if (t.includes('screen') || t.includes('script') || t.includes('\u5267\u672c')) return 'screenplay'
  if (t.includes('copy') || t.includes('\u6587\u6848')) return 'copywriting'
  if (t.includes('poem') || t.includes('poetry') || t.includes('\u8bd7')) return 'poetry'
  if (t.includes('edit') || t.includes('\u7f16\u8f91')) return 'editorial'
  return 'novel'
}
const PRIMARY_DOCUMENT_TYPES = [
  'narrative_prose',
  'script_dialogue',
  'interactive_narrative',
  'marketing_copy',
  'informational_article',
  'argumentative_document',
  'structured_business_doc',
  'regulated_document',
  'technical_document',
  'knowledge_asset',
  'outline',
  'research_material',
  'review_feedback',
  'revision_artifact'
]

const LEGACY_TYPE_TO_PRIMARY = {
  'novel': 'narrative_prose',
  'web-novel': 'narrative_prose',
  'paper': 'argumentative_document',
  'screenplay': 'script_dialogue',
  'copywriting': 'marketing_copy',
  'poetry': 'narrative_prose',
  'editorial': 'informational_article'
}

const PRIMARY_TO_LEGACY_TYPE = {
  narrative_prose: 'novel',
  script_dialogue: 'screenplay',
  interactive_narrative: 'screenplay',
  marketing_copy: 'copywriting',
  informational_article: 'editorial',
  argumentative_document: 'paper',
  structured_business_doc: 'editorial',
  regulated_document: 'editorial',
  technical_document: 'editorial',
  knowledge_asset: 'editorial',
  outline: 'novel',
  research_material: 'paper',
  review_feedback: 'editorial',
  revision_artifact: 'editorial'
}
const legacyTypeFromTaxonomy = taxonomy => {
  const primary = String(taxonomy?.primaryDocumentType || '').trim()
  if (primary && PRIMARY_TO_LEGACY_TYPE[primary]) return PRIMARY_TO_LEGACY_TYPE[primary]
  const formId = String(taxonomy?.formId || '').toLowerCase()
  if (formId.includes('game') || formId.includes('interactive')) return 'screenplay'
  if (formId.includes('script') || formId.includes('play')) return 'screenplay'
  if (formId.includes('copy') || formId.includes('brand') || formId.includes('ad')) return 'copywriting'
  if (formId.includes('paper') || formId.includes('research')) return 'paper'
  return 'novel'
}

const WRITER_FORMS_CATALOG_CORE = {
  version: '2026.07',
  domains: [
    { id: 'literature', label: 'Literature and narrative', description: 'Narrative prose and literary writing' },
    { id: 'film-theater', label: 'Film and theater', description: 'Screenplay, stage play, and audio drama' },
    { id: 'games-interactive', label: 'Games and interactive narrative', description: 'Game story, branching narrative, quest and dialogue text' },
    { id: 'marketing-brand', label: 'Marketing and brand copy', description: 'Advertising, brand, ecommerce, and content marketing copy' },
    { id: 'news-publishing', label: 'News and publishing', description: 'News, publishing, editing, and media planning' },
    { id: 'academic-research', label: 'Academic and research writing', description: 'Papers, research reports, and grant proposals' },
    { id: 'business-enterprise', label: 'Business and enterprise docs', description: 'Business plans, proposals, bids, and management docs' },
    { id: 'legal-government', label: 'Legal, government, and compliance', description: 'Legal, government, and regulated documents' },
    { id: 'technical-docs', label: 'Technical documentation', description: 'API docs, technical plans, and user manuals' },
    { id: 'knowledge-assets', label: 'Knowledge assets', description: 'Wiki, encyclopedia, glossary, and RAG knowledge base' }
  ],
  families: [
    { id: 'game-story', domainId: 'games-interactive', label: 'Game story', description: 'Main story, side quests, and quest text', order: 1 },
    { id: 'interactive-fiction', domainId: 'games-interactive', label: 'Interactive fiction', description: 'Interactive novels, visual novels, and murder mystery scripts', order: 2 }
  ],
  forms: [
    { id: 'game-main-story', familyId: 'game-story', label: 'Game script', description: 'Main story, side story, quest, and dialogue text for game projects', primaryDocumentType: 'interactive_narrative', capabilityProfileId: 'interactive_narrative', documentPresetIds: ['game-world', 'main-quest', 'character-dialogue', 'quest-text'] },
    { id: 'interactive-novel', familyId: 'interactive-fiction', label: 'Interactive novel', description: 'Branching story and state-driven interactive fiction', primaryDocumentType: 'interactive_narrative', capabilityProfileId: 'interactive_narrative', documentPresetIds: ['game-world', 'main-quest', 'character-dialogue'] }
  ],
  presets: [
    { id: 'novel-outline', label: 'Story outline', description: 'Three-act story outline template', documentType: 'outline', defaultPath: 'planning/story-outline.md', kind: 'file', templateId: 'outline.story.v1' },
    { id: 'character-bible', label: 'Character bible', description: 'Main character profile template', documentType: 'knowledge_asset', defaultPath: 'setting/characters.md', kind: 'file', templateId: 'character.bible.v1' },
    { id: 'worldbuilding', label: 'Worldbuilding', description: 'World rules and setting', documentType: 'knowledge_asset', defaultPath: 'setting/world.md', kind: 'file', templateId: 'worldbuilding.v1' },
    { id: 'timeline', label: 'Timeline', description: 'Story timeline template', documentType: 'knowledge_asset', defaultPath: 'setting/timeline.md', kind: 'file', templateId: 'timeline.v1' },
    { id: 'game-world', label: 'Game world', description: 'Game world, factions, and rules', documentType: 'knowledge_asset', defaultPath: 'setting/world.md', kind: 'file', templateId: 'worldbuilding.v1' },
    { id: 'main-quest', label: 'Main quest', description: 'Main game story script', documentType: 'interactive_narrative', defaultPath: 'story/main-quest.md', kind: 'file' },
    { id: 'character-dialogue', label: 'NPC dialogue', description: 'NPC dialogue and voice lines', documentType: 'interactive_narrative', defaultPath: 'dialogue/npc/', kind: 'directory' },
    { id: 'quest-text', label: 'Quest text', description: 'Quest descriptions and system text', documentType: 'interactive_narrative', defaultPath: 'system/quest-text.md', kind: 'file' }
  ]
}
const getWriterFormsCatalog = () => WRITER_FORMS_CATALOG_CORE

const PRIMARY_DOCUMENT_ROLES = {
  narrative_prose: ['\u4e3b\u7b14', '\u5267\u60c5\u7f16\u8f91', '\u4eba\u7269\u7f16\u8f91', '\u4e16\u754c\u89c2\u7ba1\u7406\u5458', '\u8d44\u6599\u5458', '\u6821\u5bf9'],
  script_dialogue: ['\u7f16\u5267', '\u573a\u666f\u8c03\u5ea6', '\u5bf9\u767d\u533b\u751f', '\u8282\u594f\u7f16\u8f91', '\u5206\u955c\u534f\u8c03'],
  interactive_narrative: ['\u53d9\u4e8b\u8bbe\u8ba1\u5e08', '\u5206\u652f\u7b56\u5212', '\u72b6\u6001\u7ba1\u7406\u5458', '\u5bf9\u8bdd\u7f16\u8f91', '\u4e00\u81f4\u6027\u68c0\u67e5'],
  marketing_copy: ['\u521b\u610f\u7b56\u5212', '\u54c1\u724c\u8c03\u6027\u7f16\u8f91', '\u4e8b\u5b9e\u6838\u67e5', '\u7ec8\u7a3f\u6821\u5bf9', '\u6e20\u9053\u9002\u914d'],
  informational_article: ['\u8d23\u4efb\u7f16\u8f91', '\u4e8b\u5b9e\u6838\u67e5', '\u7ed3\u6784\u7f16\u8f91', '\u8d44\u6599\u6574\u7406', '\u7ec8\u7a3f\u6821\u5bf9'],
  argumentative_document: ['\u4e3b\u7b14', '\u8bba\u8bc1\u7f16\u8f91', '\u8bc1\u636e\u6838\u67e5', '\u53cd\u65b9\u89c6\u89d2', '\u5f15\u6587\u6821\u5bf9'],
  structured_business_doc: ['\u9879\u76ee\u7ecf\u7406', '\u9700\u6c42\u5206\u6790\u5e08', '\u65b9\u6848\u67b6\u6784\u5e08', '\u98ce\u9669\u8bc4\u4f30', '\u6587\u6848\u7f16\u8f91'],
  regulated_document: ['\u4e3b\u7b14', '\u5408\u89c4\u5ba1\u67e5', '\u4e8b\u5b9e\u6eaf\u6e90', '\u98ce\u9669\u8bc4\u4f30', '\u6cd5\u52a1\u6821\u5bf9'],
  technical_document: ['\u6280\u672f\u5199\u4f5c', '\u67b6\u6784\u5ba1\u6838', '\u793a\u4f8b\u9a8c\u8bc1', '\u63a5\u53e3\u4e00\u81f4\u6027', '\u7248\u672c\u7ba1\u7406'],
  knowledge_asset: ['\u77e5\u8bc6\u67b6\u6784\u5e08', '\u5b9e\u4f53\u62bd\u53d6', '\u5173\u7cfb\u5efa\u6a21', '\u6765\u6e90\u6838\u5b9e', '\u8d28\u91cf\u5ba1\u6821'],
  outline: ['\u5927\u7eb2\u7b56\u5212', '\u7ed3\u6784\u7f16\u8f91', '\u8282\u594f\u8bbe\u8ba1'],
  research_material: ['\u8d44\u6599\u6574\u7406\u5458', '\u4e8b\u5b9e\u6838\u67e5\u5458', '\u5f15\u7528\u7ba1\u7406\u5458'],
  review_feedback: ['\u5ba1\u7a3f\u4eba', '\u7f16\u8f91\u987e\u95ee', '\u8d28\u91cf\u8bc4\u4f30'],
  revision_artifact: ['\u4fee\u8ba2\u7f16\u8f91', '\u7248\u672c\u7ba1\u7406', '\u5bf9\u7167\u68c0\u67e5']
}

const writerAgentTemplates = type => {
  const rawType = String(type || 'novel').toLowerCase()
  let primaryType
  if (PRIMARY_DOCUMENT_TYPES.includes(rawType)) {
    primaryType = rawType
  } else {
    const legacyType = normalizeProjectType(type)
    primaryType = LEGACY_TYPE_TO_PRIMARY[legacyType] || 'narrative_prose'
  }
  const common = { enabled: true, max_concurrent: 3, created_at: new Date().toISOString() }
  const roles = PRIMARY_DOCUMENT_ROLES[primaryType] || PRIMARY_DOCUMENT_ROLES.narrative_prose
  return { ...common, type: primaryType, agents: roles.map((role, index) => ({ id: `${primaryType}-agent-${index + 1}`, role, enabled: true, brief: `${role}\u53ea\u505a\u521b\u4f5c\u5de5\u7a0b\u7ba1\u7406\u3001\u4e00\u81f4\u6027\u68c0\u67e5\u548c\u53ef\u5ba1\u9605\u5efa\u8bae\uff0c\u4e0d\u66ff\u4f5c\u8005\u81ea\u52a8\u5b9a\u7a3f\u3002` })) }
}
const parseProjectPlanDraft = input => {
  const text = String(input?.goal || input?.description || input?.prompt || '').trim()
  const type = normalizeProjectType(input?.type || text)
  const template = writerAgentTemplates(type)
  const lower = text.toLowerCase()
  let agents = template.agents.map((agent, index) => normalizeAgentInput({ ...agent, name: agent.role, role: agent.role }, index, 'draft'))
  const ensure = (name, brief) => {
    if (!agents.some(agent => agent.name === name || agent.role === name)) agents.push(normalizeAgentInput({ name, role: name, brief, enabled: true }, agents.length, 'draft'))
  }
  if (/\u5211\u4fa6|\u63a8\u7406|\u60ac\u7591|detective|mystery/i.test(text)) {
    ensure('\u7ebf\u7d22\u7ba1\u7406\u5458', '\u68b3\u7406\u6848\u4ef6\u7ebf\u7d22\u3001\u8bc1\u636e\u94fe\u548c\u4f0f\u7b14\u56de\u6536')
    ensure('\u903b\u8f91\u68c0\u67e5\u5458', '\u68c0\u67e5\u63a8\u7406\u94fe\u6761\u3001\u65f6\u95f4\u7ebf\u548c\u4f5c\u6848\u53ef\u80fd\u6027')
  }
  if (/\u4e00\u4e07|\u957f\u7bc7|\u7ae0\u8282|chapter/i.test(text)) ensure('\u8fde\u8f7d\u8282\u594f\u7ba1\u7406\u5458', '\u62c6\u5206\u7ae0\u8282\u3001\u8282\u594f\u70b9\u548c\u8ffd\u66f4\u94a9\u5b50')
  const plan = agents.map(agent => ({ name: agent.name, role: agent.role, brief: agent.brief, persona: agent.persona || '', skills: agent.skills || [], mcp: agent.mcp || [], enabled: true }))
  return { ok: true, type, goal: text, agents: plan, summary: '\u5df2\u6839\u636e\u4efb\u52a1\u63cf\u8ff0\u751f\u6210\u591a\u667a\u80fd\u4f53\u5206\u5de5\u3002' }
}

const getProviderApiConfig = providerSlug => {
  const provider = findProvider(providerSlug)
  if (!provider) return null
  const isCustom = String(providerSlug || '').startsWith('custom:') || providerSlug === 'custom'
  let baseUrl = ''
  let apiKey = ''
  let model = ''
  if (isCustom) {
    const customId = providerSlug === 'custom' ? '' : providerSlug.slice('custom:'.length)
    const customModels = readCustomModels()
    const customRow = customModels.find(m => m.id === customId) || (customId ? null : customModels[0])
    if (customRow) {
      baseUrl = customRow.base_url || getEnvValue('CUSTOM_BASE_URL')
      apiKey = customRow.api_key || getEnvValue('CUSTOM_API_KEY')
      model = customRow.model || customRow.id || getEnvValue('CUSTOM_MODEL_NAME')
    } else {
      baseUrl = getEnvValue('CUSTOM_BASE_URL')
      apiKey = getEnvValue('CUSTOM_API_KEY')
      model = getEnvValue('CUSTOM_MODEL_NAME')
    }
    if (!baseUrl.endsWith('/')) baseUrl += '/'
  } else {
    apiKey = getEnvValue(provider.key_env)
    if (provider.slug === 'deepseek') {
      baseUrl = 'https://api.deepseek.com/'
    } else if (provider.slug === 'glm') {
      baseUrl = 'https://open.bigmodel.cn/api/paas/v4/'
    } else if (provider.slug === 'openai') {
      baseUrl = 'https://api.openai.com/v1/'
    } else if (provider.slug === 'anthropic') {
      baseUrl = 'https://api.anthropic.com/v1/'
    } else if (provider.slug === 'qwen') {
      baseUrl = 'https://dashscope.aliyuncs.com/compatible-mode/v1/'
    } else if (provider.slug === 'gemini') {
      baseUrl = 'https://generativelanguage.googleapis.com/v1beta/'
    } else {
      return null
    }
  }
  return { baseUrl, apiKey, model, provider, isCustom }
}

const callChatCompletion = async (providerSlug, modelName, messages, options = {}) => {
  const config = getProviderApiConfig(providerSlug)
  if (!config || !config.apiKey) {
    throw new Error('模型提供方未配置 API Key')
  }
  const model = modelName || config.model
  if (!model) throw new Error('未指定模型')

  const isAnthropic = config.provider?.slug === 'anthropic'
  const isGemini = config.provider?.slug === 'gemini' && !config.isCustom

  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs || 60_000
    const url = new URL(config.baseUrl)
    const isHttps = url.protocol === 'https:'
    const httpLib = isHttps ? https : http

    let pathname
    let requestBody
    let headers

    if (isGemini) {
      pathname = `${url.pathname}models/${model}:generateContent`
      const systemMsg = messages.find(m => m.role === 'system')
      const userMsgs = messages.filter(m => m.role !== 'system')
      requestBody = {
        contents: userMsgs.map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }))
      }
      if (systemMsg) {
        requestBody.systemInstruction = { parts: [{ text: systemMsg.content }] }
      }
      headers = {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.apiKey
      }
    } else if (isAnthropic) {
      pathname = `${url.pathname}messages`
      const systemMsg = messages.find(m => m.role === 'system')
      const nonSystem = messages.filter(m => m.role !== 'system')
      requestBody = {
        model,
        max_tokens: options.maxTokens || 4096,
        messages: nonSystem.map(m => ({ role: m.role, content: m.content }))
      }
      if (systemMsg) requestBody.system = systemMsg.content
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01'
      }
    } else {
      pathname = `${url.pathname}chat/completions`
      requestBody = {
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: options.temperature ?? 0.7
      }
      headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      }
    }

    const bodyStr = JSON.stringify(requestBody)
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: pathname + url.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(bodyStr)
      },
      timeout: timeoutMs
    }

    const req = httpLib.request(reqOptions, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            const err = JSON.parse(data)
            const msg = err?.error?.message || err?.message || `API 返回 ${res.statusCode}`
            reject(new Error(msg))
            return
          }
          const result = JSON.parse(data)
          let content = ''
          if (isGemini) {
            content = result?.candidates?.[0]?.content?.parts?.[0]?.text || ''
          } else if (isAnthropic) {
            content = result?.content?.[0]?.text || ''
          } else {
            content = result?.choices?.[0]?.message?.content || ''
          }
          const usage = isGemini
            ? {
                input_tokens: Number(result?.usageMetadata?.promptTokenCount || 0),
                cached_input_tokens: Number(result?.usageMetadata?.cachedContentTokenCount || 0),
                output_tokens: Number(result?.usageMetadata?.candidatesTokenCount || 0),
                reasoning_tokens: Number(result?.usageMetadata?.thoughtsTokenCount || 0)
              }
            : isAnthropic
              ? {
                  input_tokens: Number(result?.usage?.input_tokens || 0),
                  cached_input_tokens: Number(result?.usage?.cache_read_input_tokens || 0),
                  output_tokens: Number(result?.usage?.output_tokens || 0),
                  reasoning_tokens: 0
                }
              : {
                  input_tokens: Number(result?.usage?.prompt_tokens || 0),
                  cached_input_tokens: Number(result?.usage?.prompt_tokens_details?.cached_tokens || 0),
                  output_tokens: Number(result?.usage?.completion_tokens || 0),
                  reasoning_tokens: Number(result?.usage?.completion_tokens_details?.reasoning_tokens || 0)
                }
          resolve(options.includeUsage ? { content, usage } : content)
        } catch (e) {
          reject(new Error(`解析响应失败: ${e.message}`))
        }
      })
    })

    req.on('error', err => {
      reject(new Error(`网络请求失败: ${err.message}`))
    })
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('请求超时'))
    })
    req.write(bodyStr)
    req.end()
  })
}

const ingestService = createIngestService({
  fs, path, os, execFile,
  dataRoot: KARNA_DATA_ROOT,
  karnaPaths,
  storage,
  callChatCompletion: (provider, model, messages, opts) => callChatCompletion(provider, model, messages, opts),
  findProvider,
  isProviderConfigured,
  getCurrentModelConfig: () => ({ provider: currentModelProvider, model: currentModel })
})

const enhancePromptText = async input => {
  const raw = String(input?.text || input?.prompt || '').trim()
  if (!raw) return { ok: false, error: '\u8bf7\u5148\u8f93\u5165\u9700\u8981\u589e\u5f3a\u7684\u63d0\u793a\u8bcd\u3002' }

  const selected = resolveUsableModelSelection({ provider: input?.provider, model: input?.model })
  const provider = selected.provider
  const modelName = selected.model
  if (!provider || !isProviderConfigured(provider) || !modelName) {
    return {
      ok: false,
      error: '\u672a\u68c0\u6d4b\u5230\u5df2\u6388\u6743\u7684\u6a21\u578b\u3002\u8bf7\u5728\u8bbe\u7f6e\u2192\u6a21\u578b\u4e2d\u4fdd\u5b58 DeepSeek\u3001Qwen\u3001GLM \u6216\u81ea\u5b9a\u4e49 API Key\uff0c\u5e76\u70b9\u51fb\u201c\u8bbe\u4e3a\u9ed8\u8ba4\u201d\u540e\u518d\u4f7f\u7528\u63d0\u793a\u8bcd\u589e\u5f3a\u3002',
      provider: provider?.slug || currentModelProvider || '',
      model: modelName || currentModel || ''
    }
  }

  const projectContext = input?.projectContext || input?.project_context || {}
  const skills = Array.isArray(input?.skills) ? input.skills.map(String).filter(Boolean) : []
  const mcp = Array.isArray(input?.mcp) ? input.mcp.map(String).filter(Boolean) : []
  const soul = String(input?.soul || '').trim()
  const workflow = String(input?.workflow || '').trim()
  const mode = String(input?.mode || '').trim()
  const permission = String(input?.permission || '').trim()
  const contextLines = []
  if (projectContext?.type) contextLines.push(`\u9879\u76ee\u7c7b\u578b\uff1a${projectContext.type}`)
  if (projectContext?.goal) contextLines.push(`\u9879\u76ee\u76ee\u6807\uff1a${projectContext.goal}`)
  if (Array.isArray(projectContext?.files) && projectContext.files.length) contextLines.push(`\u91cd\u8981\u6587\u4ef6\uff1a${projectContext.files.join('\u3001')}`)
  if (soul) contextLines.push(`Soul \u98ce\u683c\uff1a${soul}`)
  if (skills.length) contextLines.push(`\u53ef\u7528 Skill\uff1a${skills.join('\u3001')}`)
  if (mcp.length) contextLines.push(`\u53ef\u7528 MCP\uff1a${mcp.join('\u3001')}`)
  if (workflow) contextLines.push(`\u5de5\u4f5c\u6d41\uff1a${workflow}`)
  if (mode) contextLines.push(`\u5bf9\u8bdd\u6a21\u5f0f\uff1a${mode}`)
  if (permission) contextLines.push(`\u6743\u9650\u6a21\u5f0f\uff1a${permission}`)

  const systemPrompt = [
    '\u4f60\u662f Karna \u7684\u63d0\u793a\u8bcd\u589e\u5f3a\u6a21\u5757\u3002',
    '\u4f60\u8981\u628a\u7528\u6237\u7684\u53e3\u8bed\u5316\u9700\u6c42\u6539\u5199\u6210\u66f4\u6e05\u6670\u3001\u66f4\u5177\u4f53\u3001\u66f4\u9002\u5408 Karna \u6267\u884c\u7684\u4e2d\u6587\u521b\u4f5c\u4efb\u52a1\u3002',
    '\u4e0d\u6539\u53d8\u539f\u610f\uff0c\u4e0d\u865a\u6784\u7528\u6237\u6ca1\u6709\u63d0\u5230\u7684\u8981\u6c42\u3002',
    '\u4fdd\u7559\u4f5c\u54c1\u540d\u3001\u4eba\u540d\u3001\u6587\u4ef6\u540d\u3001Skill\u3001MCP\u3001Soul\u3001Workflow \u7b49\u4e13\u6709\u540d\u8bcd\u3002',
    '\u76f4\u63a5\u8f93\u51fa\u589e\u5f3a\u540e\u7684\u5b8c\u6574\u63d0\u793a\u8bcd\uff0c\u4e0d\u8981\u52a0\u201c\u4ee5\u4e0b\u662f\u201d\u7b49\u524d\u7f00\u3002'
  ].join('\n')
  const userPrompt = contextLines.length
    ? `\u3010\u9879\u76ee\u4e0a\u4e0b\u6587\u3011\n${contextLines.join('\n')}\n\n\u3010\u7528\u6237\u9700\u6c42\u3011\n${raw}`
    : `\u8bf7\u589e\u5f3a\u4ee5\u4e0b\u7528\u6237\u9700\u6c42\uff1a\n\n${raw}`

  try {
    const content = await callChatCompletion(provider.slug, modelName, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ], { temperature: 0.45, maxTokens: 4096, timeoutMs: 60_000 })
    const enhanced = String(content || '').trim()
    if (!enhanced) return { ok: false, error: '\u63d0\u793a\u8bcd\u589e\u5f3a\u8fd4\u56de\u4e3a\u7a7a\u3002' }
    return { ok: true, text: enhanced, provider: provider.slug, model: modelName }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), provider: provider.slug, model: modelName }
  }
}

const writeWriterAgents = (project, template = '', inputAgents = null) => {
  const data = writerAgentTemplates(template || project.type)
  const sourceAgents = Array.isArray(inputAgents) && inputAgents.length ? inputAgents : data.agents
  const agents = sourceAgents.map((agent, index) => normalizeAgentInput(agent, index, project.id))
  return writeWriterAgentsData(project, agents, { template: data.type, enabled: project.multi_agent_enabled !== false })
}
const normalizeFolderPath = folder => {
  if (!folder) return ''
  return path.resolve(String(folder).trim())
}
const resolveProjectFolder = input => {
  const folderInput = String(input?.folder || '').trim()
  if (folderInput) {
    return { folder: normalizeFolderPath(folderInput), root: normalizeFolderPath(input?.root || '') }
  }
  const rootInput = String(input?.root || input?.projectRoot || '').trim()
  const root = rootInput ? normalizeFolderPath(rootInput) : getWriterProjectsRoot()
  const baseSlug = slugify(input?.title || 'project')
  const folder = path.join(root, baseSlug)
  return { folder, root }
}
const checkWriterProjectConflict = ({ folder, workspace_id }) => {
  const store = readWriterProjects()
  const normalizedFolder = folder ? normalizeFolderPath(folder) : ''
  const normalizedWorkspaceId = String(workspace_id || '').trim()
  for (const project of store.projects || []) {
    if (normalizedWorkspaceId && project.workspace_id === normalizedWorkspaceId) {
      return { conflict: true, project, reason: 'workspace_id' }
    }
    if (normalizedFolder && normalizeFolderPath(project.folder) === normalizedFolder) {
      return { conflict: true, project, reason: 'folder' }
    }
  }
  return { conflict: false, project: null, reason: null }
}
const createWriterProject = async input => {
  const isNewTaxonomy = Boolean(input?.taxonomy && input.taxonomy.schemaVersion === 2)
  const { title, type: parsedType } = parseTypedTitle(input?.title || input?.arg || input)
  const type = normalizeProjectType(input?.type || (isNewTaxonomy ? legacyTypeFromTaxonomy(input.taxonomy) : parsedType))
  const store = readWriterProjects()
  const baseSlug = slugify(title)
  const existing = new Set((store.projects || []).map(p => p.slug))
  let slug = baseSlug
  let suffix = 2
  while (existing.has(slug)) slug = `${baseSlug}-${suffix++}`
  const id = `wp_${crypto.randomBytes(5).toString('hex')}`
  const workspace_id = String(input?.workspace_id || '').trim()
  const { folder, root } = resolveProjectFolder({ ...input, title })
  const normalizedFolder = normalizeFolderPath(folder)
  const conflict = checkWriterProjectConflict({ folder: normalizedFolder, workspace_id })
  if (conflict.conflict && conflict.project) {
    return {
      ok: false,
      error: 'PROJECT_CONFLICT',
      conflict_reason: conflict.reason,
      existing_project: enrichWriterProject(conflict.project),
      message: conflict.reason === 'workspace_id'
        ? 'Workspace already has a bound writer project.'
        : 'A writer project already exists at this location.'
    }
  }
  const now = new Date().toISOString()
  const multiAgentEnabled = input?.legacyProjectAgents === true && (input?.multiAgentEnabled === true || input?.multi_agent_enabled === true)
  const coordinationMode = parseCoordinationMode(input?.coordinationMode || input?.coordination_mode || 'manual')

  const taxonomy = isNewTaxonomy ? {
    schemaVersion: 2,
    catalogVersion: input.taxonomy.catalogVersion || '2026.07',
    domainId: input.taxonomy.domainId || '',
    familyId: input.taxonomy.familyId || '',
    formId: input.taxonomy.formId || '',
    customFormLabel: input.taxonomy.customFormLabel || undefined,
    primaryDocumentType: input.taxonomy.primaryDocumentType || 'narrative_prose',
    capabilityProfileId: input.taxonomy.capabilityProfileId || ''
  } : null

  const project = {
    id, slug, title, type,
    folder: normalizedFolder,
    root: root || path.dirname(normalizedFolder),
    workspace_id,
    created_at: now,
    updated_at: now,
    status: 'active',
    pinned: Boolean(input?.pinned),
    multi_agent_enabled: multiAgentEnabled,
    coordination_mode: coordinationMode,
    session_ids: [],
    main_session_id: null,
    agent_session_ids: {},
    knowledge_ids: Array.isArray(input?.knowledgeIds) ? input.knowledgeIds.map(String) : [],
    ...(isNewTaxonomy ? {
      taxonomy,
      selected_documents: Array.isArray(input?.selected_documents) ? input.selected_documents : [],
      created_documents: []
    } : {})
  }
  const createdFiles = []
  const rollbackStack = []
  let committed = false

  try {
    ensureWriterProjectFolders(project)
    rollbackStack.push({ type: 'dir', path: normalizedFolder, createdOnly: !fs.existsSync(normalizedFolder) })
    ensureWriterProjectMetadata(project)

    if (!isNewTaxonomy) {
      safeWriteFile(path.join(normalizedFolder, 'project.md'), `# ${title}\n\n- Type: ${type}\n- Created: ${now}\n- Folder: ${normalizedFolder}\n\n## Goal\n\n${String(input?.goal || '').trim()}\n`, 'utf8')
      rollbackStack.push({ type: 'file', path: path.join(normalizedFolder, 'project.md') })
      safeWriteFile(path.join(normalizedFolder, 'outline.md'), writerOutlineMarkdown(title), 'utf8')
      rollbackStack.push({ type: 'file', path: path.join(normalizedFolder, 'outline.md') })
      safeWriteFile(path.join(normalizedFolder, 'canon.md'), `# ${title} Canon\n\n`, 'utf8')
      rollbackStack.push({ type: 'file', path: path.join(normalizedFolder, 'canon.md') })
    } else if (Array.isArray(input?.selected_documents) && input.selected_documents.length > 0) {
      const catalog = getWriterFormsCatalog()
      const presetMap = new Map(catalog.presets.map(p => [p.id, p]))
      for (const doc of input.selected_documents) {
        const relPath = String(doc.relativePath || '').trim()
        if (!relPath || /\.\./.test(relPath) || relPath.startsWith('/') || /^[a-zA-Z]:/.test(relPath)) continue
        if (relPath.startsWith('.karna') || relPath.startsWith('.git')) continue
        const fullPath = path.join(normalizedFolder, relPath)
        const preset = doc.presetId ? presetMap.get(doc.presetId) : null
        const isDir = doc.kind === 'directory' || preset?.kind === 'directory' || relPath.endsWith('/')
        if (isDir) {
          fs.mkdirSync(fullPath, { recursive: true })
          rollbackStack.push({ type: 'dir', path: fullPath })
        } else {
          let content = ''
          if (preset?.templateId) {
            content = renderDocumentTemplate(preset.templateId, { projectName: title, formLabel: taxonomy?.formId ? (catalog.forms.find(f => f.id === taxonomy.formId)?.label || '') : '', createdAt: now })
          } else {
            content = `# ${doc.title || path.basename(relPath, path.extname(relPath))}\n\n`
          }
          fs.mkdirSync(path.dirname(fullPath), { recursive: true })
          fs.writeFileSync(fullPath, content, 'utf8')
          rollbackStack.push({ type: 'file', path: fullPath })
        }
        createdFiles.push({
          relative_path: relPath,
          document_type: doc.documentType || (preset?.documentType || 'narrative_prose'),
          created_at: now,
          title: doc.title || '',
          preset_id: doc.presetId || ''
        })
      }
      project.created_documents = createdFiles
    }

    const controller = normalizeAgentInput({ id: 'controller', name: '主控', role: '主控', brief: 'Schedule tasks and assign task_system.json.', persona: 'Project dispatcher.', enabled: true, status: 'working', status_label: '待命' }, 0, id)
    const inputAgents = Array.isArray(input?.agents) ? input.agents : null
    const agentTemplateKey = isNewTaxonomy ? (input.taxonomy.primaryDocumentType || type) : (input?.agentTemplate || type)
    const agentsInput = multiAgentEnabled ? [controller, ...(inputAgents || writerAgentTemplates(agentTemplateKey).agents)] : [controller]
    const agents = writeWriterAgents(project, agentTemplateKey, agentsInput)
    writeWriterAgentsData(project, agents.agents.map(a => ({ ...a, session_id: null })), { template: agents.template, enabled: multiAgentEnabled, concurrency: { enabled: multiAgentEnabled, max_parallel: Math.max(1, Number(input?.maxParallelAgents || 3)) } })
    writeTaskSystem(project, { ...defaultTaskSystem(project, agents.agents), coordination_mode: coordinationMode })
    if (multiAgentEnabled && String(input?.goal || '').trim()) generateProjectTasks(project, input.goal)
    karnaConfig = { ...karnaConfig, terminal: { ...(karnaConfig.terminal || {}), cwd: normalizedFolder } }
    const knowledge = { ok: false, folder: normalizedFolder, status: 'not_selected', folders: [], selected: project.knowledge_ids }
    const importFolder = String(input?.importFolder || '').trim()
    const explicitFolders = Array.isArray(input?.knowledgeFolders) ? input.knowledgeFolders.map(String).filter(Boolean) : []
    const knowledgeFolders = [...explicitFolders, importFolder].filter(Boolean).map(row => path.resolve(row))
    if (knowledgeFolders.length) {
      knowledge.ok = true
      knowledge.status = 'bound'
      knowledge.message = 'Knowledge bound to project.'
      knowledge.folders = knowledgeFolders
      for (const target of knowledgeFolders) upsertKnowledgeFolder(target)
      const knowledgeConfig = readKnowledgeConfig()
      const embed = getEmbeddingModelRow(knowledgeConfig.config?.embedding_model_id || knowledgeConfig.embedding_model_id || '')
      {
        try {
          const indexedRows = []
          for (const targetFolder of knowledgeFolders) indexedRows.push(await indexKnowledgeFolder(targetFolder, knowledgeConfig.config || knowledgeConfig || {}))
          knowledge.vectorization = { ok: true, files: indexedRows.reduce((sum, row) => sum + (row.files || 0), 0), chunks: indexedRows.reduce((sum, row) => sum + (row.chunks || 0), 0), results: indexedRows }
        } catch (err) {
          knowledge.vectorization = notConfigured('knowledge', err instanceof Error ? err.message : String(err), { status: 'failed' })
        }
      }
    }
    writeWriterProjects({ version: 1, active_project_id: id, projects: [...(store.projects || []), project] })
    committed = true
    analytics.track('project_created', {
      project_id: id,
      project_type: type,
      multi_agent: multiAgentEnabled,
      ...getProjectAnalyticsProps(project),
      ...(isNewTaxonomy ? {
        documents_selected: createdFiles.length
      } : {})
    })
    let import_result = null
    if (importFolder) {
      try { import_result = importWriterProjectManuscript(id, { paths: [importFolder] }) }
      catch (err) { import_result = notConfigured('writer_import', err instanceof Error ? err.message : String(err)) }
    }
    return {
      ...enrichWriterProject(project),
      knowledge,
      import_result,
      agents: readWriterAgents(project).agents,
      tasks: readTaskSystem(project),
      workspace: { cwd: normalizedFolder, configured: true },
      created_documents: createdFiles,
      next_commands: isNewTaxonomy ? [] : ['/chapter', '/char-save', '/world-save', '/research-save', '/find-skill']
    }
  } catch (err) {
    if (!committed && rollbackStack.length > 0) {
      for (let i = rollbackStack.length - 1; i >= 0; i--) {
        const item = rollbackStack[i]
        try {
          if (item.type === 'file' && fs.existsSync(item.path)) {
            fs.unlinkSync(item.path)
          } else if (item.type === 'dir' && item.createdOnly && fs.existsSync(item.path)) {
            fs.rmSync(item.path, { recursive: true, force: true })
          }
        } catch { /* ignore */ }
      }
    }
    throw err
  }
}

const renderDocumentTemplate = (templateId, vars) => {
  const templates = {
    'outline.story.v1': `# {{projectName}} · 故事大纲\n\n## 一句话梗概\n\n\n\n## 核心冲突\n\n\n\n## 三幕结构\n\n### 第一幕\n\n\n\n### 第二幕\n\n\n\n### 第三幕\n\n\n\n## 主要人物\n\n- \n\n## 背景设定\n\n\n\n## 主题\n\n`,
    'character.bible.v1': `# {{projectName}} · 人物设定\n\n## 主要人物\n\n### \n\n- **姓名：**\n- **年龄：**\n- **身份：**\n- **外貌：**\n- **性格：**\n- **背景：**\n- **动机：**\n- **人物弧光：**\n\n## 次要人物\n\n- \n`,
    'worldbuilding.v1': `# {{projectName}} · 世界观设定\n\n## 世界概览\n\n\n\n## 地理与环境\n\n\n\n## 社会与文化\n\n\n\n## 力量体系/规则\n\n\n\n## 历史与重要事件\n\n\n\n## 重要地点\n\n- \n`,
    'timeline.v1': `# {{projectName}} · 时间轴\n\n## 主线时间线\n\n| 时间 | 事件 | 涉及人物 | 备注 |\n|------|------|----------|------|\n|      |      |          |      |\n\n## 支线/背景时间线\n\n- \n`
  }
  let template = templates[templateId] || ''
  if (!template) {
    template = `# {{projectName}}\n\n`
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '')
}
const resolveWriterProject = ({ workspace_id, folder }) => {
  const store = readWriterProjects()
  const normalizedWorkspaceId = String(workspace_id || '').trim()
  const normalizedFolder = folder ? normalizeFolderPath(folder) : ''
  if (normalizedWorkspaceId) {
    const exactMatch = (store.projects || []).find(p => p.workspace_id === normalizedWorkspaceId)
    if (exactMatch) {
      return { project: exactMatch, matched_by: 'workspace_id' }
    }
  }
  if (normalizedFolder) {
    const folderMatch = (store.projects || []).find(p => normalizeFolderPath(p.folder) === normalizedFolder)
    if (folderMatch) {
      if (normalizedWorkspaceId && !folderMatch.workspace_id) {
        folderMatch.workspace_id = normalizedWorkspaceId
        folderMatch.updated_at = new Date().toISOString()
        writeWriterProjects({ ...store, projects: (store.projects || []).map(p => p.id === folderMatch.id ? folderMatch : p) })
      }
      return { project: folderMatch, matched_by: 'folder' }
    }
  }
  return null
}
const findWriterProject = ref => {
  const store = readWriterProjects()
  const rows = Array.isArray(store.projects) ? store.projects : []
  const key = String(ref || '').trim()
  if (key) {
    const byId = rows.find(p => p.id === key || p.slug === key || p.title === key || p.workspace_id === key)
    if (byId) return byId
  }
  return rows.find(p => p.id === store.active_project_id) || rows.find(p => p.status !== 'archived') || rows[0] || null
}
const setActiveWriterProject = ref => {
  const store = readWriterProjects()
  const project = findWriterProject(ref)
  if (!project) return null
  writeWriterProjects({ ...store, active_project_id: project.id })
  return project
}
const updateWriterProject = (ref, patch = {}) => {
  const store = readWriterProjects()
  const project = (store.projects || []).find(p => p.id === ref || p.slug === ref || p.title === ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const next = { ...project, ...patch, id: project.id, updated_at: new Date().toISOString() }
  writeWriterProjects({ ...store, projects: (store.projects || []).map(p => p.id === project.id ? next : p) })
  return enrichWriterProject(next)
}
const createProjectSession = (ref, input = {}) => {
  const store = readWriterProjects()
  const project = (store.projects || []).find(p => p.id === ref || p.slug === ref || p.title === ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const agentsData = readWriterAgents(project)
  const agent = input.agentId ? agentsData.agents.find(a => a.id === input.agentId) : null
  const session = createStoredSession({ title: String(input.title || (agent ? `${agent.name} \u00b7 ${project.title}` : `${project.title} ? 新对话`)), cwd: project.folder, project, agent })
  const nextProject = { ...project, session_ids: Array.from(new Set([...(project.session_ids || []), session.id])), agent_session_ids: { ...(project.agent_session_ids || {}) } }
  if (agent) {
    nextProject.agent_session_ids[agent.id] = session.id
    agentsData.agents = agentsData.agents.map(a => a.id === agent.id ? { ...a, session_id: session.id } : a)
    writeWriterAgentsData(project, agentsData.agents, { template: agentsData.template, enabled: agentsData.enabled !== false })
  }
  writeWriterProjects({ ...store, projects: (store.projects || []).map(p => p.id === project.id ? nextProject : p), active_project_id: project.id })
  return { ok: true, session: storedSessionInfo(session), project: enrichWriterProject(nextProject) }
}
const updateProjectAgent = (ref, agentId, patch = {}) => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const data = readWriterAgents(project)
  let found = false
  const agents = data.agents.map(agent => {
    if (agent.id !== agentId) return agent
    found = true
    return normalizeAgentInput({ ...agent, ...patch, id: agent.id, session_id: agent.session_id }, 0, project.id)
  })
  if (!found) throw new Error(`Agent not found: ${agentId}`)
  return writeWriterAgentsData(project, agents, { template: data.template, enabled: data.enabled !== false })
}
const writerProjectListMarkdown = () => {
  const store = readWriterProjects()
  if (!store.projects?.length) return '暂无写作项目。可以在主界面点击“新建项目”，或使用 /project-new novel: 项目名。'
  return store.projects.map(p => `${p.id === store.active_project_id ? '*' : '-'} ${p.title} (${p.type}) - ${p.slug} - ${p.folder}`).join('\n')
}
const saveWriterProjectFile = ({ projectRef = '', kind = 'notes', title = '', content = '' }) => {
  const project = findWriterProject(projectRef)
  if (!project) throw new Error('No active writing project. Use /project-new first.')
  ensureWriterProjectFolders(project)
  const folderByKind = { chapter: 'manuscript', manuscript: 'manuscript', character: 'characters', world: 'world', canon: '.', research: 'research', note: 'notes', draft: 'drafts' }
  const sub = folderByKind[kind] || 'notes'
  const dir = sub === '.' ? project.folder : path.join(project.folder, sub)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${slugify(title || kind)}.md`)
  const text = `# ${title || kind}\n\n${String(content || '').trim()}\n`
  fs.writeFileSync(file, text, 'utf8')
  project.updated_at = new Date().toISOString()
  const store = readWriterProjects()
  writeWriterProjects({ ...store, projects: (store.projects || []).map(p => p.id === project.id ? project : p), active_project_id: project.id })
  return { project, file, title: title || kind, kind, bytes: Buffer.byteLength(text, 'utf8') }
}
const exportWriterProject = projectRef => {
  const project = findWriterProject(projectRef)
  if (!project) throw new Error('No active writing project. Use /project-new first.')
  ensureWriterProjectMetadata(project)
  const isNewTaxonomy = project.taxonomy?.schemaVersion === 2
  const sourceItems = projectSourceFiles(project)
  const fileItems = sourceItems.map(item => {
    if (typeof item === 'string') return { file: item, document_type: null }
    return item
  })
  if (isNewTaxonomy && fileItems.length === 0) {
    const error = new Error('项目尚无工作文档，暂无可导出内容')
    error.code = 'EMPTY_PROJECT'
    throw error
  }
  if (isNewTaxonomy) {
    const sortOrder = [
      'narrative_prose',
      'script_dialogue',
      'technical_document',
      'knowledge_asset',
      'interactive_narrative',
      'marketing_copy',
      'informational_article',
      'argumentative_document',
      'structured_business_doc',
      'regulated_document',
      'outline',
      'research_material',
      'review_feedback',
      'revision_artifact'
    ]
    const priorityMap = {
      narrative_prose: (filePath) => {
        const rel = path.relative(project.folder, filePath).toLowerCase().replace(/\\/g, '/')
        if (rel.startsWith('正文/') || rel.startsWith('manuscript/')) return 0
        if (rel.includes('第') && rel.includes('章')) return 1
        return 2
      },
      script_dialogue: (filePath) => {
        const rel = path.relative(project.folder, filePath).toLowerCase().replace(/\\/g, '/')
        if (rel.startsWith('剧本/场景/') || rel.startsWith('scenes/')) return 0
        if (rel.includes('场景') || rel.includes('scene')) return 1
        return 2
      },
      technical_document: (filePath) => {
        const name = path.basename(filePath).toLowerCase()
        const rel = path.relative(project.folder, filePath).toLowerCase().replace(/\\/g, '/')
        if (name === 'readme.md' || name === 'readme') return 0
        if (rel.startsWith('docs/')) return 1
        return 2
      },
      knowledge_asset: (filePath) => {
        const name = path.basename(filePath).toLowerCase()
        const rel = path.relative(project.folder, filePath).toLowerCase().replace(/\\/g, '/')
        if (rel.startsWith('wiki/') && (name === 'home.md' || name === '首页.md')) return 0
        if (rel.startsWith('wiki/')) return 1
        return 2
      }
    }
    fileItems.sort((a, b) => {
      const typeA = a.document_type || 'narrative_prose'
      const typeB = b.document_type || 'narrative_prose'
      const typeIdxA = sortOrder.indexOf(typeA)
      const typeIdxB = sortOrder.indexOf(typeB)
      if (typeIdxA !== typeIdxB) return (typeIdxA === -1 ? 99 : typeIdxA) - (typeIdxB === -1 ? 99 : typeIdxB)
      const priorityFn = priorityMap[typeA]
      if (priorityFn) {
        const prioA = priorityFn(a.file)
        const prioB = priorityFn(b.file)
        if (prioA !== prioB) return prioA - prioB
      }
      return a.file.localeCompare(b.file)
    })
  }
  let headerParts = []
  if (isNewTaxonomy) {
    const taxonomy = project.taxonomy
    headerParts.push(`# ${project.title}`)
    headerParts.push('')
    headerParts.push(`_Document_Type: ${taxonomy.primaryDocumentType || 'narrative_prose'}_`)
    headerParts.push(`_Form: ${taxonomy.formId || ''}_`)
    headerParts.push(`_Domain: ${taxonomy.domainId || ''}_`)
    headerParts.push(`_Catalog_Version: ${taxonomy.catalogVersion || '2026.07'}_`)
    headerParts.push('')
  } else {
    headerParts.push(`# ${project.title}`)
    headerParts.push('')
    headerParts.push(`_Type: ${project.type}_`)
    headerParts.push('')
  }
  const parts = [headerParts.join('\n')]
  for (const item of fileItems) {
    const filePath = item.file
    parts.push(`## ${path.relative(project.folder, filePath)}\n\n${fs.readFileSync(filePath, 'utf8')}`)
  }
  const output = parts.join('\n\n---\n\n')
  const exportDir = path.join(project.folder, 'exports')
  fs.mkdirSync(exportDir, { recursive: true })
  const exportFile = path.join(exportDir, `${project.slug}-manuscript.md`)
  fs.writeFileSync(exportFile, output, 'utf8')
  const jsonFile = path.join(exportDir, `${project.slug}-project-data.json`)
  const bible = readJsonFile(writerProjectBiblePath(project), null)
  const versions = readJsonFile(writerProjectVersionsPath(project), { entries: [] })
  const manifestFiles = fileItems.map(item => ({
    file: path.relative(project.folder, item.file),
    document_type: item.document_type,
    content: fs.readFileSync(item.file, 'utf8')
  }))
  writeJsonFile(jsonFile, { exported_at: new Date().toISOString(), project, bible, versions: versions.entries || [], source_files: manifestFiles })
  const artifact = recordArtifact({ type: 'file', title: `${project.title} manuscript`, url: exportFile, content: output.slice(0, 5000), metadata: { project_id: project.id, kind: 'manuscript_export', json_file: jsonFile } })
  appendWriterProjectVersion(project, 'export', `Exported ${fileItems.length} chapters plus JSON data package`, { file: exportFile, json: jsonFile })
  analytics.track('export_built', { project_id: project.id, sources: fileItems.length, export_file: exportFile, ...getProjectAnalyticsProps(project) })
  return { project, file: exportFile, json: jsonFile, sources: fileItems.length, artifact }
}
const writerProjectStatusMarkdown = projectRef => {
  const project = findWriterProject(projectRef)
  if (!project) return 'No active writing project. Use /project-new first.'
  const counts = Object.fromEntries(['manuscript', 'characters', 'world', 'research', 'notes', 'drafts'].map(name => [name, scanMarkdownFiles(path.join(project.folder, name), false).length]))
  return `# ${project.title}\n\n- Type: ${project.type}\n- Slug: ${project.slug}\n- Folder: ${project.folder}\n- Updated: ${project.updated_at}\n\n## Files\n${Object.entries(counts).map(([k, v]) => `- ${k}: ${v}`).join('\n')}`
}

const writerProjectPrivacyMarkdown = project => `# Karna Project Privacy

- Project data stays in this local folder by default.
- Analysis and consistency checks are manual actions.
- Imports are copied; original manuscripts are never overwritten.
- Rewrite preview returns suggestions and diff only.
- Model/local analysis calls are logged in privacy/model_calls.jsonl.
`
const writerProjectManifestPath = project => path.join(project.folder, 'project_memory.json')
const writerProjectBiblePath = project => path.join(project.folder, 'bible', 'bible.json')
const writerProjectVersionsPath = project => path.join(project.folder, 'versions', 'versions.json')
const writerProjectCallLogPath = project => path.join(project.folder, 'privacy', 'model_calls.jsonl')
const writerProjectStoryBiblePath = project => path.join(project.folder, 'bible', 'story_bible.json')
const writerProjectLivingWikiPath = project => path.join(project.folder, 'wiki', 'living_wiki.json')
const writerProjectKnowledgeGraphPath = project => path.join(project.folder, 'graph', 'knowledge_graph.json')
const writerProjectNarrativeStatePath = project => path.join(project.folder, 'narrative-state', 'narrative_state.json')
const writerProjectCriticCouncilPath = project => path.join(project.folder, 'critics', 'critic_council.json')
const writerProjectSafetyReportsPath = project => path.join(project.folder, 'safety', 'safety_reports.json')
const writerProjectCreativeMemoryPath = project => path.join(project.folder, 'memory', 'creative_memory.json')
const writerProjectArtifactsPath = project => path.join(project.folder, 'artifacts', 'artifacts.json')
const writerProjectDataModelPath = project => path.join(project.folder, 'project_data_model.json')
const writerProjectRagIndexPath = project => path.join(project.folder, 'rag', 'rag_index.json')
const writerProjectVectorStorePath = project => path.join(project.folder, 'rag', 'vector_store.json')
const writerProjectDocumentsPath = project => path.join(project.folder, 'documents', 'documents.json')
const writerProjectCapabilityPacksPath = project => path.join(project.folder, 'capabilities', 'capability_packs.json')
const writerProjectBenchmarksPath = project => path.join(project.folder, 'benchmarks', 'benchmark_runs.json')
const writerProjectCreativeSearchPath = project => path.join(project.folder, 'documents', 'creative_search.json')
const writerProjectGuidePath = project => path.join(project.folder, 'guide', 'writer_guide.json')
const writerProjectDeliveryPackagePath = project => path.join(project.folder, 'delivery', 'delivery_package.json')
const readProjectJson = (project, file, fallback) => readJsonFile(path.join(project.folder, file), fallback)
const writeProjectJson = (project, file, data) => writeJsonFile(path.join(project.folder, file), data)
const ensureWriterProjectMetadata = project => {
  ensureWriterProjectFolders(project)
  const manifestFile = writerProjectManifestPath(project)
  if (!fs.existsSync(manifestFile)) writeJsonFile(manifestFile, {
    version: 1,
    scope: 'project',
    project_id: project.id,
    project_slug: project.slug,
    workspace_id: project.workspace_id || '',
    title: project.title,
    user_memory: { author_preferences: [], style_preferences: [], common_genres: [] },
    project_memory: { bible: 'bible/bible.json', isolated: true },
    privacy: { local_first: true, manual_analysis: true, never_overwrite_original: true, default_full_text_upload: false }
  })
}
const logWriterProjectCall = (project, operation, details = {}) => {
  ensureWriterProjectMetadata(project)
  const row = { at: new Date().toISOString(), project_id: project.id, project_slug: project.slug, operation, model: details.model || 'local-heuristic', sent_scope: details.sent_scope || 'project-local-files', chars: Number(details.chars || 0), note: details.note || '' }
  fs.appendFileSync(writerProjectCallLogPath(project), `${JSON.stringify(row)}\n`, 'utf8')
  return row
}
const appendWriterProjectVersion = (project, kind, summary, payload = {}) => {
  ensureWriterProjectMetadata(project)
  const file = writerProjectVersionsPath(project)
  const data = readJsonFile(file, { version: 1, project_id: project.id, entries: [] })
  const entry = { id: `ver_${crypto.randomBytes(5).toString('hex')}`, at: new Date().toISOString(), kind, summary, ...payload }
  data.entries = [entry, ...(Array.isArray(data.entries) ? data.entries : [])].slice(0, 200)
  writeJsonFile(file, data)
  return entry
}
const uniqueProjectPath = file => {
  if (!fs.existsSync(file)) return file
  const ext = path.extname(file)
  const stem = file.slice(0, file.length - ext.length)
  let i = 2
  while (fs.existsSync(`${stem}-${i}${ext}`)) i += 1
  return `${stem}-${i}${ext}`
}
const copyWriterImportFile = (project, sourceFile) => {
  const full = path.resolve(String(sourceFile || ''))
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null
  if (!/\.(md|markdown|txt)$/i.test(full)) return null
  const targetDir = path.join(project.folder, 'imports')
  fs.mkdirSync(targetDir, { recursive: true })
  const target = uniqueProjectPath(path.join(targetDir, path.basename(full)))
  fs.copyFileSync(full, target)
  return { source: full, target, bytes: fs.statSync(target).size }
}
const importWriterProjectManuscript = (ref, input = {}) => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  analytics.track('project_import_attempted', { project_id: project.id, ...getProjectAnalyticsProps(project) })
  try {
    ensureWriterProjectMetadata(project)
    const rawPaths = []
    if (Array.isArray(input.paths)) rawPaths.push(...input.paths)
    if (input.path) rawPaths.push(input.path)
    if (input.folder) rawPaths.push(input.folder)
    const files = []
    for (const raw of rawPaths.map(String).filter(Boolean)) {
      const resolved = path.resolve(raw)
      if (!fs.existsSync(resolved)) continue
      const stat = fs.statSync(resolved)
      if (stat.isDirectory()) files.push(...scanMarkdownFiles(resolved, input.recursive !== false))
      if (stat.isFile()) files.push(resolved)
    }
    const imported = files.map(file => copyWriterImportFile(project, file)).filter(Boolean)
    appendWriterProjectVersion(project, 'import', `Imported ${imported.length} manuscript/source files`, { files: imported.map(row => row.target) })
    logWriterProjectCall(project, 'import', { sent_scope: 'local-copy-only', chars: 0, note: `${imported.length} files copied; no model call.` })
    analytics.track(imported.length ? 'project_imported' : 'project_import_failed', { project_id: project.id, files_count: imported.length, reason: imported.length ? undefined : 'no_supported_files', ...getProjectAnalyticsProps(project) })
    return { ok: true, project: enrichWriterProject(project), imported, message: 'Imported files into project imports folder without overwriting originals.' }
  } catch (error) {
    analytics.track('project_import_failed', { project_id: project.id, reason: error instanceof Error ? error.message : String(error), ...getProjectAnalyticsProps(project) })
    throw error
  }
}

const summarizeText = (text, limit = 360) => {
  const clean = String(text || '').replace(/^#{1,6}\s+/gm, '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  if (clean.length <= limit) return clean
  const sentenceEnd = clean.slice(0, limit + 80).search(/[。？！.!?]\s/)
  const cut = sentenceEnd > 40 && sentenceEnd < limit + 80 ? sentenceEnd + 1 : limit
  return `${clean.slice(0, cut).trim()}...`
}
const uniqueBy = (rows, keyFn) => {
  const seen = new Set()
  const out = []
  for (const row of rows || []) {
    const key = keyFn(row)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}
const isPathWithin = (candidate, root) => {
  const resolvedCandidate = path.resolve(String(candidate || ''))
  const resolvedRoot = path.resolve(String(root || ''))
  const rel = path.relative(resolvedRoot, resolvedCandidate)
  return rel === '' || (rel && !rel.startsWith('..') && !path.isAbsolute(rel))
}

const projectSourceFiles = project => {
  const isNewTaxonomy = project.taxonomy?.schemaVersion === 2
  if (!isNewTaxonomy) {
    const roots = ['manuscript', 'imports', 'characters', 'world', 'notes', 'research']
    return roots.flatMap(name => scanMarkdownFiles(path.join(project.folder, name), true))
      .filter(file => !file.includes(`${path.sep}exports${path.sep}`) && !file.includes(`${path.sep}analysis${path.sep}`) && !file.includes(`${path.sep}bible${path.sep}`))
      .sort((a, b) => a.localeCompare(b))
  }
  const excludedDirs = ['.karna', 'exports', 'analysis', 'bible', '.git', 'node_modules', '.venv', '__pycache__']
  const allFiles = scanMarkdownFiles(project.folder, true).filter(file => {
    const rel = path.relative(project.folder, file)
    const parts = rel.split(path.sep)
    return !parts.some(part => excludedDirs.includes(part))
  })
  const createdDocs = Array.isArray(project.created_documents) ? project.created_documents : []
  const docMap = new Map(createdDocs.map(d => [d.relative_path.replace(/\\/g, '/'), d.document_type]))
  const inferDocumentType = (filePath, content) => {
    const rel = path.relative(project.folder, filePath).replace(/\\/g, '/')
    if (docMap.has(rel)) return docMap.get(rel)
    const lowerRel = rel.toLowerCase()
    const lowerName = path.basename(rel).toLowerCase()
    if (lowerRel.startsWith('正文/') || lowerRel.startsWith('manuscript/') || lowerRel.startsWith('书稿/正文/') || lowerRel.startsWith('剧本/场景/') || lowerRel.includes('chapter') || lowerRel.includes('章节')) {
      return 'narrative_prose'
    }
    if (lowerRel.startsWith('剧本/') || lowerRel.startsWith('scenes/') || lowerRel.includes('场景') || lowerRel.includes('scene') || lowerName.includes('剧本') || lowerName.includes('screenplay')) {
      return 'script_dialogue'
    }
    if (lowerRel.startsWith('剧情/') || lowerRel.startsWith('对话/') || lowerRel.startsWith('系统/') || lowerRel.startsWith('quest/') || lowerRel.startsWith('dialogue/')) {
      return 'interactive_narrative'
    }
    if (lowerRel.startsWith('品牌/') || lowerRel.startsWith('广告/') || lowerRel.startsWith('电商/') || lowerRel.startsWith('销售/') || lowerRel.includes('brand') || lowerRel.includes('ad') || lowerRel.includes('copy') || lowerRel.includes('营销') || lowerRel.includes('slogan')) {
      return 'marketing_copy'
    }
    if (lowerRel.startsWith('内容/') || lowerRel.startsWith('新闻/') || lowerRel.startsWith('公关/') || lowerRel.startsWith('seo/') || lowerRel.includes('article') || lowerRel.includes('新闻') || lowerRel.includes('白皮书') || lowerRel.includes('报道')) {
      return 'informational_article'
    }
    if (lowerRel.startsWith('论文/') || lowerRel.startsWith('研究/') || lowerRel.includes('paper') || lowerRel.includes('research') || lowerRel.includes('论文') || lowerRel.includes('综述')) {
      return 'argumentative_document'
    }
    if (lowerRel.startsWith('商业/') || lowerRel.startsWith('产品/') || lowerRel.startsWith('项目/') || lowerRel.startsWith('投标/') || lowerRel.startsWith('汇报/') || lowerRel.startsWith('出版/') || lowerRel.startsWith('申请/') || lowerRel.includes('business') || lowerRel.includes('prd') || lowerRel.includes('proposal') || lowerRel.includes('plan')) {
      return 'structured_business_doc'
    }
    if (lowerRel.startsWith('法律/') || lowerRel.startsWith('合规/') || lowerRel.startsWith('公文/') || lowerRel.startsWith('政务/') || lowerRel.includes('legal') || lowerRel.includes('contract') || lowerRel.includes('合同') || lowerRel.includes('政策')) {
      return 'regulated_document'
    }
    if (lowerRel.startsWith('docs/') || lowerRel.startsWith('docs\\') || lowerName === 'readme.md' || lowerName === 'readme') {
      return 'technical_document'
    }
    if (lowerRel.startsWith('wiki/') || lowerRel.startsWith('设定/') || lowerRel.startsWith('人物/') || lowerRel.startsWith('知识库/') || lowerRel.includes('wiki') || lowerRel.includes('百科') || lowerRel.includes('术语') || lowerRel.includes('设定') || lowerRel.includes('人物')) {
      return 'knowledge_asset'
    }
    if (lowerRel.startsWith('规划/') || lowerRel.includes('outline') || lowerRel.includes('大纲') || lowerRel.includes('分场') || lowerRel.includes('排期')) {
      return 'outline'
    }
    if (lowerRel.startsWith('资料/') || lowerRel.startsWith('evidence/') || lowerRel.includes('research') || lowerRel.includes('资料') || lowerRel.includes('素材')) {
      return 'research_material'
    }
    if (lowerRel.startsWith('会议/') || lowerRel.includes('review') || lowerRel.includes('反馈') || lowerRel.includes('会议') || lowerRel.includes('周报')) {
      return 'review_feedback'
    }
    if (lowerRel.startsWith('修订/') || lowerRel.includes('revision') || lowerRel.includes('changelog') || lowerRel.includes('修订') || lowerRel.includes('版本')) {
      return 'revision_artifact'
    }
    if (content) {
      const lowerContent = content.slice(0, 2000).toLowerCase()
      if (lowerContent.includes('# 剧本') || lowerContent.includes('场景：') || lowerContent.includes('scene:') || lowerContent.includes('int.') || lowerContent.includes('ext.')) return 'script_dialogue'
      if (lowerContent.includes('# 人物') || lowerContent.includes('人物设定') || lowerContent.includes('世界观') || lowerContent.includes('worldbuilding')) return 'knowledge_asset'
      if (lowerContent.includes('# 大纲') || lowerContent.includes('故事大纲') || lowerContent.includes('outline')) return 'outline'
      if (lowerContent.includes('第') && lowerContent.includes('章') && lowerContent.includes('# ')) return 'narrative_prose'
    }
    return 'narrative_prose'
  }
  const result = []
  for (const file of allFiles) {
    let content = ''
    try { content = fs.readFileSync(file, 'utf8') } catch {}
    const document_type = inferDocumentType(file, content)
    result.push({ file, document_type })
  }
  return result
}
const lineNumberAt = (text, index) => String(text || '').slice(0, Math.max(0, index)).split(/\r?\n/).length
const textSnippet = (text, index, size = 140) => String(text || '').slice(Math.max(0, index - Math.floor(size / 2)), index + size).replace(/\s+/g, ' ').trim()
const sourceRel = (project, file) => path.relative(project.folder, file)
const readProjectDocuments = project => projectSourceFiles(project).map(item => {
  const file = typeof item === 'string' ? item : item.file
  const document_type = typeof item === 'string' ? null : item.document_type
  const text = fs.readFileSync(file, 'utf8')
  return { file, rel: sourceRel(project, file), title: path.basename(file, path.extname(file)), text, chars: text.length, lines: text.split(/\r?\n/).length, document_type }
})
const listWriterProjectSources = ref => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const sources = readProjectDocuments(project).map(doc => ({ file: doc.rel, title: doc.title, chars: doc.chars, lines: doc.lines, preview: summarizeText(doc.text, 180) }))
  return { ok: true, project: enrichWriterProject(project), sources }
}
const splitProjectChapters = docs => {
  const chapters = []
  for (const doc of docs) {
    const heading = doc.text.match(/^\s{0,3}#{1,3}\s+(.+)$/m)
    const title = heading ? heading[1].trim().slice(0, 80) : doc.title
    chapters.push({
      id: `chapter_${chapters.length + 1}`,
      title,
      file: doc.rel,
      line: heading ? lineNumberAt(doc.text, heading.index || 0) : 1,
      summary: summarizeText(doc.text, 520),
      chars: doc.chars,
      evidence: `${doc.rel}:1`
    })
  }
  return chapters
}

const writerStopNames = new Set(['Chapter', 'Act', 'Scene', 'The', 'This', 'That', 'And', 'But', 'Karna', 'AI', 'TODO', 'Note'])
const writerGenericNames = new Set(['\u4eba\u7269', '\u89d2\u8272', '\u8bbe\u5b9a', '\u4f0f\u7b14', '\u7ebf\u7d22', '\u7ae0\u8282', '\u6458\u8981', '\u4e16\u754c\u89c2'])
const addCandidateName = (map, name, doc, index, kind = 'mention') => {
  const clean = String(name || '').replace(/[\s`*_#:,.;!?\"'()\[\]-]+/g, '').trim()
  if (!clean || clean.length < 2 || clean.length > 24 || /^\d+$/.test(clean) || writerStopNames.has(clean) || writerGenericNames.has(clean)) return
  if (/^\u7b2c.{1,4}\u7ae0$/.test(clean)) return
  const key = clean.toLowerCase()
  const line = lineNumberAt(doc.text, index)
  const row = map.get(key) || { name: clean, count: 0, evidence: `${doc.rel}:${line}`, file: doc.rel, line, snippets: [], signals: [] }
  row.count += 1
  if (!row.snippets.some(item => item.file === doc.rel && item.line === line)) row.snippets.push({ file: doc.rel, line, text: textSnippet(doc.text, index) })
  if (!row.signals.includes(kind)) row.signals.push(kind)
  map.set(key, row)
}
const extractCharactersFromDocs = docs => {
  const map = new Map()
  const patterns = [
    new RegExp('(?:\\u4eba\\u7269|\\u89d2\\u8272|\\u4e3b\\u89d2|\\u914d\\u89d2|\\u59d3\\u540d|Name|Character)\\s*[:\\uff1a]\\s*([\\u4e00-\\u9fa5A-Z][\\u4e00-\\u9fa5A-Za-z0-9_\\- ]{1,30})', 'g'),
    new RegExp('([\\u4e00-\\u9fa5]{2,4})(?:\\u8bf4|\\u9053|\\u95ee|\\u7b54|\\u60f3|\\u770b\\u89c1|\\u8d70|\\u7b11|\\u54ed|\\u70b9\\u5934|\\u6447\\u5934|\\u6c89\\u9ed8|\\u4f4e\\u58f0|\\u7236\\u4eb2|\\u6bcd\\u4eb2)', 'g'),
    new RegExp('(?:\\u201c[^\\u201d]{0,80}\\u201d|"[^"]{0,80}")\\s*([\\u4e00-\\u9fa5]{2,4})(?:\\u8bf4|\\u9053|\\u95ee|\\u7b54)', 'g'),
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b(?:\s+(?:said|asked|replied|thought|walked|looked|smiled|cried))/g
  ]
  for (const doc of docs) for (const re of patterns) {
    let match
    while ((match = re.exec(doc.text))) addCandidateName(map, match[1], doc, match.index, 'text-pattern')
  }
  return [...map.values()]
    .filter(row => row.count >= 1)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 80)
    .map(row => ({ ...row, note: `${row.count} mentions; signals: ${row.signals.join(', ')}` }))
}
const extractWorldRulesFromDocs = docs => {
  const rows = []
  const patterns = [
    /Worldbuilding[:\uff1a]?([^\n\u3002\uff1f\uff01.!?]{6,160})/gi,
    /Rule[:\uff1a]?([^\n\u3002\uff1f\uff01.!?]{6,160})/gi,
    /Canon[:\uff1a]?([^\n\u3002\uff1f\uff01.!?]{6,160})/gi,
    new RegExp('(?:\\u4e16\\u754c\\u89c2|\\u89c4\\u5219|\\u8bbe\\u5b9a)[:\\uff1a]?([^\\n\\u3002\\uff1f\\uff01.!?]{6,160})', 'g'),
    new RegExp('(?:\\u4e0d\\u80fd|\\u5fc5\\u987b|\\u53ea\\u6709|\\u4e00\\u65e6|\\u4ece\\u4e0d|\\u6c38\\u8fdc)[^\\u3002\\uff1f\\uff01.!?\\n]{6,140}', 'g')
  ]
  for (const doc of docs) for (const re of patterns) {
    let match
    while ((match = re.exec(doc.text))) rows.push({ rule: (match[1] || match[0]).trim(), evidence: `${doc.rel}:${lineNumberAt(doc.text, match.index)}`, file: doc.rel, line: lineNumberAt(doc.text, match.index), snippet: textSnippet(doc.text, match.index) })
  }
  return uniqueBy(rows, row => row.rule).slice(0, 100)
}
const extractForeshadowsFromDocs = docs => {
  const rows = []
  const patterns = [
    /Foreshadow[:\uff1a]?([^\n\u3002\uff1f\uff01.!?]{4,160})/gi,
    /Clue[:\uff1a]?([^\n\u3002\uff1f\uff01.!?]{4,160})/gi,
    new RegExp('(?:\\u4f0f\\u7b14|\\u7ebf\\u7d22)[:\\uff1a]?([^\\n\\u3002\\uff1f\\uff01.!?]{4,160})', 'g'),
    new RegExp('(?:\\u79d8\\u5bc6|\\u9884\\u8a00|\\u94a5\\u5319|\\u4fe1\\u7269|\\u4f24\\u75a4|\\u68a6\\u5883|\\u5f02\\u5e38|\\u8c1c\\u56e2)[^\\u3002\\uff1f\\uff01.!?\\n]{4,160}', 'g')
  ]
  for (const doc of docs) for (const re of patterns) {
    let match
    while ((match = re.exec(doc.text))) rows.push({ clue: (match[1] || match[0]).trim(), status: 'open', evidence: `${doc.rel}:${lineNumberAt(doc.text, match.index)}`, file: doc.rel, line: lineNumberAt(doc.text, match.index), snippet: textSnippet(doc.text, match.index) })
  }
  return uniqueBy(rows, row => row.clue).slice(0, 100)
}
const extractTimelineFromDocs = docs => {
  const rows = []
  const re = new RegExp('(?:Chapter\\s*\\d+|Act\\s*\\d+|\\d{4}\\s*year|\\d{4}\\u5e74|\\u7b2c[\\u4e00\\u4e8c\\u4e09\\u56db\\u4e94\\u516d\\u4e03\\u516b\\u4e5d\\u5341\\u767e\\u5343\\u4e070-9]+[\\u5929\\u5e74\\u6708\\u7ae0\\u8282\\u5e55\\u573a]|\\u6e05\\u6668|\\u4e0a\\u5348|\\u4e2d\\u5348|\\u4e0b\\u5348|\\u508d\\u665a|\\u591c\\u91cc|\\u591a\\u5e74\\u540e|\\u4e09\\u5e74\\u524d|\\u5341\\u5e74\\u524d)[^\\u3002\\uff1f\\uff01.!?\\n]{0,100}', 'g')
  for (const doc of docs) {
    let match
    while ((match = re.exec(doc.text))) rows.push({ event: match[0].trim(), evidence: `${doc.rel}:${lineNumberAt(doc.text, match.index)}`, file: doc.rel, line: lineNumberAt(doc.text, match.index), snippet: textSnippet(doc.text, match.index) })
  }
  return rows.slice(0, 160)
}
const writeProjectBibleFiles = (project, bible) => {
  const bibleDir = path.join(project.folder, 'bible')
  fs.mkdirSync(bibleDir, { recursive: true })
  writeJsonFile(writerProjectBiblePath(project), bible)
  const md = [`# ${project.title} Project Bible`, '', `Updated: ${bible.updated_at}`, '', '## Chapter summaries', ...(bible.chapters || []).map(row => `- ${row.title} (${row.file}): ${row.summary}`), '', '## Characters', ...(bible.characters || []).map(row => `- ${row.name}: ${row.note || ''} (evidence: ${row.evidence})`), '', '## World / canon rules', ...(bible.world || []).map(row => `- ${row.rule} (evidence: ${row.evidence})`), '', '## Foreshadows', ...(bible.foreshadows || []).map(row => `- [${row.status}] ${row.clue} (evidence: ${row.evidence})`), '', '## Timeline', ...(bible.timeline || []).map(row => `- ${row.event} (evidence: ${row.evidence})`)].join('\n')
  fs.writeFileSync(path.join(bibleDir, 'bible.md'), md, 'utf8')
  fs.writeFileSync(path.join(bibleDir, 'chapter_summaries.md'), (bible.chapters || []).map(row => `## ${row.title}\n\n- File: ${row.file}\n- Chars: ${row.chars}\n\n${row.summary}\n`).join('\n'), 'utf8')
  fs.writeFileSync(path.join(bibleDir, 'characters.md'), (bible.characters || []).map(row => `## ${row.name}\n\n- Evidence: ${row.evidence}\n- Note: ${row.note || ''}\n`).join('\n'), 'utf8')
  fs.writeFileSync(path.join(bibleDir, 'world.md'), (bible.world || []).map(row => `- ${row.rule}\n  - Evidence: ${row.evidence}`).join('\n'), 'utf8')
  fs.writeFileSync(path.join(bibleDir, 'foreshadows.md'), (bible.foreshadows || []).map(row => `- [${row.status}] ${row.clue}\n  - Evidence: ${row.evidence}`).join('\n'), 'utf8')
  return { json: writerProjectBiblePath(project), markdown: path.join(bibleDir, 'bible.md') }
}
const analyzeWriterProject = (ref, input = {}) => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  ensureWriterProjectMetadata(project)
  const docs = readProjectDocuments(project)
  const bible = {
    version: 1,
    project_id: project.id,
    project_slug: project.slug,
    title: project.title,
    updated_at: new Date().toISOString(),
    source_policy: 'manual-local-analysis; no automatic full-text upload',
    sources: docs.map(doc => ({ file: doc.rel, chars: doc.chars, lines: doc.lines })),
    chapters: splitProjectChapters(docs),
    characters: extractCharactersFromDocs(docs),
    world: extractWorldRulesFromDocs(docs),
    foreshadows: extractForeshadowsFromDocs(docs),
    timeline: extractTimelineFromDocs(docs)
  }
  const files = writeProjectBibleFiles(project, bible)
  appendWriterProjectVersion(project, 'analyze', `Analyzed ${docs.length} local files into project Bible`, { bible: files.markdown })
  logWriterProjectCall(project, 'analyze', { chars: docs.reduce((sum, doc) => sum + doc.chars, 0), sent_scope: input.useModel ? 'manual-selected-project-context' : 'local-heuristic', note: 'Manual project analysis; original files not overwritten.' })
  return { ok: true, project: enrichWriterProject(project), bible, files }
}
const readWriterProjectBible = ref => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  const bible = readJsonFile(writerProjectBiblePath(project), { version: 1, project_id: project.id, title: project.title, chapters: [], characters: [], world: [], foreshadows: [], timeline: [], updated_at: null })
  const versions = readJsonFile(writerProjectVersionsPath(project), { version: 1, entries: [] })
  let calls = []
  try { calls = fs.readFileSync(writerProjectCallLogPath(project), 'utf8').split(/\r?\n/).filter(Boolean).slice(-50).map(line => JSON.parse(line)) } catch {}
  return { ok: true, project: enrichWriterProject(project), bible, versions: versions.entries || [], calls }
}

const evidenceForPatterns = (docs, patterns, limit = 4) => {
  const hits = []
  for (const doc of docs) for (const re of patterns) {
    const regex = re instanceof RegExp ? new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`) : re
    let match
    while ((match = regex.exec(doc.text))) {
      hits.push(`${doc.rel}:${lineNumberAt(doc.text, match.index)} - ${textSnippet(doc.text, match.index, 180)}`)
      if (hits.length >= limit) return hits
    }
  }
  return hits
}
const checkWriterConsistency = (ref, input = {}) => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  ensureWriterProjectMetadata(project)
  const docs = readProjectDocuments(project)
  const joined = docs.map(doc => `\n[${doc.rel}]\n${doc.text}`).join('\n')
  const issues = []
  const add = (title, severity, evidence, suggestion, rule = 'builtin') => issues.push({ id: `issue_${issues.length + 1}`, title, severity, evidence, suggestion, rule })
  const waterA = [/\u6015\u6c34|\u6050\u6c34|\u4e0d\u6562\u4e0b\u6c34/g]
  const waterB = [/\u6f5c\u6c34|\u6e38\u6cf3|\u8df3\u8fdb\u6d77|\u8df3\u5165\u6cb3|\u70ed\u7231\u5927\u6d77/g]
  if (waterA.some(re => re.test(joined)) && waterB.some(re => re.test(joined))) add('Possible water-fear continuity conflict', 'high', [...evidenceForPatterns(docs, waterA, 2), ...evidenceForPatterns(docs, waterB, 2)], 'Decide whether this is a character arc or a continuity bug; if it is an arc, add a transition beat.')
  const deadA = [/(?:\u7236\u4eb2|\u7238\u7238|\u7236\u738b|father)[^\u3002\uff1f\uff01.!?\n]{0,24}(?:\u6b7b|\u53bb\u4e16|\u5df2\u6545|\u846c\u793c|dead|died)/gi]
  const deadB = [/(?:\u7236\u4eb2|\u7238\u7238|\u7236\u738b|father)[^\u3002\uff1f\uff01.!?\n]{0,34}(?:\u6253\u7535\u8bdd|\u6765\u7535|\u53d1\u6765\u6d88\u606f|\u51fa\u73b0|\u56de\u6765\u4e86|called|appeared)/gi]
  if (deadA.some(re => re.test(joined)) && deadB.some(re => re.test(joined))) add('Possible father alive/dead state conflict', 'high', [...evidenceForPatterns(docs, deadA, 2), ...evidenceForPatterns(docs, deadB, 2)], 'Mark flashback/dream/fake death explicitly, or unify the status.')
  const voiceA = [/\u51b7\u6de1|\u5be1\u8a00|\u6c89\u9ed8|\u60dc\u5b57\u5982\u91d1|cold|silent/gi]
  const voiceB = [/\u6bb5\u5b50|\u54c8\u54c8\u54c8|\u7b11\u6b7b|\u6897|\u5410\u69fd\u738b|meme|joke/gi]
  if (voiceA.some(re => re.test(joined)) && voiceB.some(re => re.test(joined))) add('Possible character voice drift', 'medium', [...evidenceForPatterns(docs, voiceA, 2), ...evidenceForPatterns(docs, voiceB, 2)], 'Create a dialogue rule for this character; move comedy to another character if needed.')
  const worldRules = extractWorldRulesFromDocs(docs)
  const neverRules = worldRules.filter(row => /\u4e0d\u80fd|\u4ece\u4e0d|\u6c38\u8fdc\u4e0d|\u7981\u6b62|never|forbidden/i.test(row.rule))
  for (const rule of neverRules.slice(0, 8)) {
    const key = rule.rule.replace(/^(\u4e0d\u80fd|\u4ece\u4e0d|\u6c38\u8fdc\u4e0d|\u7981\u6b62|never|forbidden)/i, '').slice(0, 8)
    if (key && joined.includes(key) && /(\u5374|\u7a81\u7136|\u7adf\u7136|\u5f00\u59cb|suddenly|however)/i.test(joined)) add('Possible hard world-rule breach', 'medium', [rule.evidence || rule.rule, rule.snippet || `Later text contains a turn around ${key}`], 'If this is an exception, record the exception mechanism in the Bible; otherwise revise the scene.')
  }
  const bible = readJsonFile(writerProjectBiblePath(project), null)
  const openForeshadows = Array.isArray(bible?.foreshadows) ? bible.foreshadows.filter(row => row.status === 'open') : extractForeshadowsFromDocs(docs)
  if (openForeshadows.length >= 5) add('Many open foreshadows need a recovery plan', 'info', openForeshadows.slice(0, 5).map(row => `${row.evidence || row.file}: ${row.clue}`), 'Review whether each clue is paid off, escalated, or intentionally left open.')
  if (!issues.length) add('No obvious hard conflict found', 'info', [`Checked ${docs.length} source files with ${joined.length} characters.`], 'Import more chapters or run a human/editorial review for softer issues.')
  const report = { version: 1, project_id: project.id, checked_at: new Date().toISOString(), issues, source_files: docs.map(doc => ({ file: doc.rel, chars: doc.chars, lines: doc.lines })), policy: 'manual check; suggestions only; no manuscript changes' }
  const file = path.join(project.folder, 'analysis', `consistency-${Date.now()}.json`)
  writeJsonFile(file, report)
  appendWriterProjectVersion(project, 'consistency-check', `Consistency check produced ${issues.length} issues`, { report: file })
  logWriterProjectCall(project, 'check-consistency', { chars: joined.length, sent_scope: 'local-heuristic', note: 'Suggestions only; no file overwritten.' })
  return { ok: true, project: enrichWriterProject(project), report }
}
const rewriteModeInstruction = mode => ({
  pace: 'Keep plot; improve pacing by cutting explanation and moving conflict earlier.',
  dialogue: 'Keep characterization; increase dialogue conflict and subtext.',
  concise: 'Keep style; reduce verbosity and repeated explanation.',
  suspense: 'Keep foreshadowing; strengthen suspense without adding unrelated canon.',
  logic: 'Logic check only; do not rewrite prose.'
})[mode] || 'Preserve author intent; provide editorial suggestions only.'
const localRewriteSuggestion = (text, mode) => {
  const source = String(text || '')
  if (mode === 'logic') return source
  let out = source.replace(/\s+$/gm, '').replace(/([\u3002\uff1f\uff01.!?])\1+/g, '$1')
  if (mode === 'concise' || mode === 'pace') out = out.replace(/\b(actually|obviously|needless to say)\b/gi, '').replace(/\u5176\u5b9e|\u663e\u7136|\u6beb\u65e0\u7591\u95ee|\u4e0d\u5f97\u4e0d\u8bf4|\u4f17\u6240\u5468\u77e5/g, '').replace(/([^\u3002\uff1f\uff01.!?]{0,30})\1/g, '$1')
  if (mode === 'dialogue') out = out.replace(/\u201c([^\u201d]{2,80})\u3002\u201d/g, '\u201c$1\u3002\u201d The line now needs visible resistance or subtext here.')
  if (mode === 'suspense') out = `${out.trim()}\n\n> Editorial note: end this passage with one unanswered question or recoverable object, without breaking existing canon.`
  return out.trim() || source
}
const simpleInlineDiff = (original, suggested) => {
  if (original === suggested) return '(Logic-only mode: no replacement prose generated.)'
  return [`--- original`, `+++ suggested`, `- ${String(original || '').replace(/\n/g, '\n- ')}`, `+ ${String(suggested || '').replace(/\n/g, '\n+ ')}`].join('\n')
}
const rewriteWriterPreview = (ref, input = {}) => {
  const project = findWriterProject(ref)
  if (!project) throw new Error(`Project not found: ${ref}`)
  ensureWriterProjectMetadata(project)
  const mode = String(input.mode || 'pace')
  const original = String(input.text || input.original || '')
  if (!original.trim()) throw new Error('Rewrite preview requires selected text. Karna will not rewrite an entire project by default.')
  const suggested = localRewriteSuggestion(original, mode)
  const preview = { id: `rw_${crypto.randomBytes(5).toString('hex')}`, at: new Date().toISOString(), mode, instruction: rewriteModeInstruction(mode), original, suggested, diff: simpleInlineDiff(original, suggested), reason: mode === 'logic' ? 'Logic-only mode: no prose was changed.' : 'Preview only; nothing is written back to the manuscript unless the author manually applies it elsewhere.', policy: 'preview-only; never overwrite manuscript' }
  const file = path.join(project.folder, 'drafts', `${preview.id}.rewrite-preview.json`)
  writeJsonFile(file, preview)
  appendWriterProjectVersion(project, 'rewrite-preview', `Rewrite preview (${mode}) saved`, { preview: file })
  logWriterProjectCall(project, 'rewrite-preview', { chars: original.length, sent_scope: 'manual-selected-text', note: preview.policy })
  return { ok: true, project: enrichWriterProject(project), preview }
}



const getSoulWorkshopRoot = () => karnaPaths.soulWorkshopDir()
const soulAuthorsRoot = () => path.join(getSoulWorkshopRoot(), 'authors')
const readSoulStore = () => readBackendJson('soul_workshop.json', { version: 1, active_author_id: '', authors: [] })
const writeSoulStore = store => writeBackendJson('soul_workshop.json', { version: 1, active_author_id: store.active_author_id || '', authors: Array.isArray(store.authors) ? store.authors : [] })
const soulId = prefix => `${prefix}_${crypto.randomBytes(6).toString('hex')}`
const soulNow = () => new Date().toISOString()
const soulAuthorFolder = author => path.join(soulAuthorsRoot(), author.id)
const soulPath = (author, ...parts) => path.join(author.folder || soulAuthorFolder(author), ...parts)
const soulJson = (author, name, fallback) => readJsonFile(soulPath(author, name), fallback)
const writeSoulJson = (author, name, data) => writeJsonFile(soulPath(author, name), data)
const soulSafeFileName = value => String(value || 'untitled').replace(/[<>:"/\\|?*\x00-\x1F]+/g, '-').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96) || `file-${Date.now()}`
const soulUsagePolicy = status => ({ copyright_status: status || 'unknown', allowed_usage: ['analysis', 'private_rag'], forbidden_usage: ['style_clone', 'public_generation'] })
const ensureSoulAuthorFolders = author => {
  for (const dir of ['raw_texts', 'cleaned_texts', 'chunks', 'vector_db', 'web_research', 'exports']) fs.mkdirSync(soulPath(author, dir), { recursive: true })
  for (const file of ['queries.json', 'sources.json', 'extracted_claims.json', 'credibility_scores.json', 'conflicts.json']) if (!fs.existsSync(soulPath(author, 'web_research', file))) writeJsonFile(soulPath(author, 'web_research', file), file === 'conflicts.json' ? { conflicts: [] } : { items: [] })
  if (!fs.existsSync(soulPath(author, 'soul_profile.json'))) writeSoulJson(author, 'soul_profile.json', defaultSoulProfile(author.name || author.author_name || author.title || 'Unknown'))
  if (!fs.existsSync(soulPath(author, 'risk_profile.json'))) writeSoulJson(author, 'risk_profile.json', { version: 1, author_id: author.id, updated_at: null, checks: [] })
  if (!fs.existsSync(soulPath(author, 'citations.json'))) writeSoulJson(author, 'citations.json', { version: 1, citations: [] })
  if (!fs.existsSync(soulPath(author, 'metadata.json'))) writeSoulJson(author, 'metadata.json', { version: 1, author_id: author.id, author_name: author.name, texts: [], updated_at: soulNow() })
}
const defaultSoulProfile = name => ({ version: 1, author_name: name, updated_at: null, core_worldview: [], common_themes: [], narrative_methods: [], character_design_patterns: [], dialogue_features: [], sentence_features: [], imagery_system: [], conflict_patterns: [], pacing_preferences: [], critical_lens: [], do_not_copy: [], safe_transfer_principles: [], evidence_refs: [], attributes: [] })
const SOUL_CATALOG_VERSION = '2026.07'
const SOUL_DOMAINS = [
  { id: 'literature', label: '文学与叙事创作', description: '小说、散文、诗歌、非虚构等文学创作', icon: 'book', order: 1 },
  { id: 'film-theater', label: '影视戏剧表演', description: '影视剧本、舞台戏剧、音频戏剧', icon: 'file-media', order: 2 },
  { id: 'games-interactive', label: '游戏互动叙事', description: '游戏剧情、互动小说、跑团', icon: 'git-branch', order: 3 },
  { id: 'marketing-brand', label: '营销品牌文案', description: '广告、品牌、电商、内容营销', icon: 'megaphone', order: 4 },
  { id: 'news-publishing', label: '新闻媒体出版', description: '新闻报道、出版编辑、媒体策划', icon: 'file-text', order: 5 },
  { id: 'academic-research', label: '学术科研写作', description: '论文、研究报告、基金申请', icon: 'library', order: 6 },
  { id: 'business-enterprise', label: '企业商业管理', description: '商业计划、方案、标书、管理文档', icon: 'briefcase', order: 7 },
  { id: 'legal-government', label: '政务法律合规', description: '法律文书、政务公文、合规文档', icon: 'shield', order: 8 },
  { id: 'technical-docs', label: '技术开发文档', description: 'API文档、技术方案、用户手册', icon: 'code', order: 9 },
  { id: 'knowledge-assets', label: '知识资产管理', description: 'Wiki、百科、术语表、RAG资料库', icon: 'database', order: 10 }
]
const SOUL_DOCUMENT_TYPES_WITH_LABELS = [
  { id: 'narrative_prose', label: '叙事散文' },
  { id: 'script_dialogue', label: '剧本对白' },
  { id: 'interactive_narrative', label: '互动叙事' },
  { id: 'marketing_copy', label: '营销文案' },
  { id: 'informational_article', label: '资讯文章' },
  { id: 'argumentative_document', label: '论说文档' },
  { id: 'structured_business_doc', label: '结构化商业文档' },
  { id: 'regulated_document', label: '合规文档' },
  { id: 'technical_document', label: '技术文档' },
  { id: 'knowledge_asset', label: '知识资产' },
  { id: 'outline', label: '大纲' },
  { id: 'research_material', label: '研究资料' },
  { id: 'review_feedback', label: '审阅反馈' },
  { id: 'revision_artifact', label: '修订产物' }
]
const SOUL_IDENTITY_PRESETS = [
  { id: 'literary_author', label: '文学作者', kind: 'person', default_domain: 'literature', icon: 'book' },
  { id: 'screenwriter_director', label: '编剧/导演', kind: 'person', default_domain: 'film-theater', icon: 'file-media' },
  { id: 'game_narrative_designer', label: '游戏叙事设计师', kind: 'person', default_domain: 'games-interactive', icon: 'git-branch' },
  { id: 'brand_ad_copywriter', label: '品牌/广告/电商文案', kind: 'person', default_domain: 'marketing-brand', icon: 'megaphone' },
  { id: 'social_content_creator', label: '社交媒体与内容营销创作者', kind: 'person', default_domain: 'marketing-brand', icon: 'megaphone' },
  { id: 'journalist_editor', label: '记者/编辑/出版工作者', kind: 'editorial_role', default_domain: 'news-publishing', icon: 'file-text' },
  { id: 'academic_researcher', label: '学术研究者', kind: 'person', default_domain: 'academic-research', icon: 'library' },
  { id: 'business_writer', label: '商业方案与管理文档作者', kind: 'person', default_domain: 'business-enterprise', icon: 'briefcase' },
  { id: 'legal_compliance_writer', label: '法律/政务/合规写作者', kind: 'person', default_domain: 'legal-government', icon: 'shield' },
  { id: 'technical_writer', label: '技术写作者', kind: 'person', default_domain: 'technical-docs', icon: 'code' },
  { id: 'knowledge_curator', label: '知识库策划与编辑', kind: 'person', default_domain: 'knowledge-assets', icon: 'database' },
  { id: 'critic_theorist', label: '评论家/理论家', kind: 'editorial_role', default_domain: 'literature', icon: 'search' },
  { id: 'editor_proofreader', label: '编辑/审校者', kind: 'editorial_role', default_domain: 'news-publishing', icon: 'checklist' },
  { id: 'user_preference', label: '用户个人创作偏好', kind: 'user_preference', default_domain: 'literature', icon: 'person' },
  { id: 'custom_method', label: '自定义方法源', kind: 'method', default_domain: 'literature', icon: 'sparkle' }
]
const SOUL_ALLOWED_EXTENSIONS = ['.md', '.txt', '.markdown', '.pdf', '.docx', '.doc']
const SOUL_IGNORE_DIRS = new Set(['.git', 'node_modules', '.karna', 'exports', 'dist', 'build', '__pycache__', '.venv', 'venv'])

const scanSoulSourceFolder = (folderPath) => {
  const root = path.resolve(String(folderPath || ''))
  const files = []
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return files
  const walk = (dir) => {
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.') continue
      if (SOUL_IGNORE_DIRS.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        walk(full)
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (SOUL_ALLOWED_EXTENSIONS.includes(ext)) {
          files.push(full)
        }
      }
    }
  }
  walk(root)
  return files
}

const httpFetchUrlText = (url, timeoutMs = 20000) => new Promise((resolve, reject) => {
  const target = String(url || '').trim()
  if (!/^https?:\/\//i.test(target)) {
    reject(new Error('URL必须以http://或https://开头'))
    return
  }
  const client = target.startsWith('https:') ? https : http
  const req = client.get(target, {
    headers: {
      'User-Agent': 'KarnaSoulWorkshop/1.0',
      'Accept': 'text/html,text/plain,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    },
    timeout: timeoutMs
  }, res => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume()
      httpFetchUrlText(res.headers.location, timeoutMs).then(resolve).catch(reject)
      return
    }
    let data = ''
    res.setEncoding('utf8')
    res.on('data', chunk => { data += chunk })
    res.on('end', () => {
      let text = data
      try {
        text = text.replace(/<script[\s\S]*?<\/script>/gi, ' ')
        text = text.replace(/<style[\s\S]*?<\/style>/gi, ' ')
        text = text.replace(/<[^>]+>/g, ' ')
        text = text.replace(/&nbsp;/g, ' ')
        text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
        text = text.replace(/\s+/g, ' ').trim()
      } catch {}
      resolve({ text, url: target, statusCode: res.statusCode })
    })
  })
  req.on('error', reject)
  req.on('timeout', () => {
    req.destroy(new Error('URL抓取超时'))
  })
})

const importIngestedTextToSoul = (author, sourceLabel, text, meta = {}) => {
  if (!author || !text || !String(text).trim()) return null
  try {
    const metaStore = soulJson(author, 'metadata.json', { version: 1, author_id: author.id, author_name: author.name, texts: [] })
    const cleaned = String(text).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim()
    const title = String(meta.title || sourceLabel || 'Imported Text').trim()
    const textId = soulId('text')
    const cleanFile = path.join(soulPath(author, 'cleaned_texts'), `${textId}-${soulSafeFileName(title)}.txt`)
    fs.writeFileSync(cleanFile, cleaned, 'utf8')
    const record = {
      id: textId,
      raw_file: null,
      cleaned_file: cleanFile,
      chars: cleaned.length,
      imported_at: soulNow(),
      author: author.name,
      title,
      year: meta.year || null,
      genre: meta.genre || 'unknown',
      source: meta.source || 'soul_source_ingest',
      source_url: meta.source_url || '',
      language: meta.language || 'zh',
      license_note: meta.license_note || '',
      copyright_status: meta.copyright_status || 'unknown',
      allowed_usage: meta.allowed_usage || ['analysis', 'private_rag'],
      forbidden_usage: meta.forbidden_usage || ['style_clone', 'public_generation']
    }
    metaStore.texts = [record, ...(metaStore.texts || [])]
    metaStore.updated_at = soulNow()
    writeSoulJson(author, 'metadata.json', metaStore)
    return record
  } catch (err) {
    return null
  }
}

const syncSingleSoulSourceStatus = (author, source) => {
  if (!source) return source
  if (source.kind === 'url' && !source.ingest_job_id && source.status === 'parsing') {
    return source
  }
  if (!source.ingest_job_id) return source
  try {
    const job = ingestService.getJob(source.ingest_job_id)
    if (!job) return { ...source, error: 'Ingest任务不存在' }
    let updated = { ...source }
    updated.job_status = job.status
    updated.job_progress = job.progress
    updated.job_stage = job.stage
    updated.job_message = job.message
    if (job.status === 'parsed' || job.status === 'partial' || job.status === 'failed') {
      if (job.status === 'parsed' || job.status === 'partial') {
        const result = ingestService.getResultByJobId(source.ingest_job_id)
        if (result) {
          updated.status = job.status === 'parsed' ? 'indexed' : 'partial'
          updated.parser = result.metadata?.engine || result.media_type || 'unknown'
          updated.chunk_count = (result.chunks || []).length
          updated.warnings = result.warnings || []
          updated.indexed_at = soulNow()
          updated.error = result.error || null
          if (result.text && String(result.text).trim() && !source._text_imported) {
            const imported = importIngestedTextToSoul(author, source.label, result.text, {
              title: source.label,
              source: 'soul_source_ingest',
              source_url: source.kind === 'url' ? source.original_location : '',
              copyright_status: source.copyright_status
            })
            if (imported) {
              updated._text_imported = true
              updated.imported_text_id = imported.id
            }
          }
        }
      } else if (job.status === 'failed') {
        updated.status = 'failed'
        updated.error = job.error || job.message || '解析失败'
        updated.indexed_at = null
      }
      updated.completed_at = job.completed_at || soulNow()
    } else if (job.status === 'queued' || job.status === 'running') {
      updated.status = 'parsing'
    }
    return updated
  } catch (err) {
    return { ...source, error: err.message || String(err), status: 'failed' }
  }
}

const syncSoulSourcesStatus = (author) => {
  if (!author || !Array.isArray(author.sources)) return author
  let hasChanges = false
  const syncedSources = (author.sources || []).map(source => {
    const synced = syncSingleSoulSourceStatus(author, source)
    if (JSON.stringify(synced) !== JSON.stringify(source)) hasChanges = true
    return synced
  })
  if (hasChanges) {
    const next = { ...author, sources: syncedSources }
    updateSoulAuthorInStore(next)
    return next
  }
  return author
}

const migrateSoulSource = (source, authorId) => {
  if (!source) return source
  const now = soulNow()
  return {
    id: source.id || soulId('source'),
    soul_id: source.soul_id || authorId || '',
    kind: source.kind || 'file',
    label: source.label || source.original_location || '未命名资料源',
    original_location: source.original_location || '',
    copyright_status: source.copyright_status || 'unknown',
    status: source.status || 'pending',
    parser: source.parser || null,
    file_count: source.file_count || 0,
    chunk_count: source.chunk_count || 0,
    created_at: source.created_at || now,
    updated_at: source.updated_at || now,
    indexed_at: source.indexed_at || null,
    completed_at: source.completed_at || null,
    error: source.error || null,
    warnings: source.warnings || [],
    files: source.files || [],
    ingest_job_id: source.ingest_job_id || null,
    ingest_job_ids: source.ingest_job_ids || [],
    library_id: source.library_id || null,
    imported_text_id: source.imported_text_id || null,
    job_status: source.job_status || null,
    job_progress: source.job_progress || 0,
    job_stage: source.job_stage || null,
    job_message: source.job_message || null
  }
}
const migrateSoulAuthor = author => {
  if (!author) return author
  let migrated = { ...author }
  let needsMigration = false
  if (!migrated.identity) {
    needsMigration = true
    let kind = 'person'
    const oldType = String(migrated.type || '').toLowerCase()
    if (oldType === 'author') kind = 'person'
    else if (oldType === 'screenwriter') kind = 'person'
    else if (oldType === 'critic') kind = 'editorial_role'
    else if (oldType === 'custom') kind = 'method'
    else if (oldType === 'user_preference') kind = 'user_preference'
    let defaultDomain = 'literature'
    if (oldType === 'screenwriter') defaultDomain = 'film-theater'
    else if (oldType === 'critic') defaultDomain = 'literature'
    migrated.identity = {
      kind,
      role_id: '',
      domain_ids: [defaultDomain],
      family_ids: [],
      form_ids: []
    }
  }
  if (!Array.isArray(migrated.identity.domain_ids)) migrated.identity.domain_ids = []
  if (!Array.isArray(migrated.identity.family_ids)) migrated.identity.family_ids = []
  if (!Array.isArray(migrated.identity.form_ids)) migrated.identity.form_ids = []
  if (!migrated.language) {
    needsMigration = true
    migrated.language = 'zh-CN'
  } else if (migrated.language === 'zh') {
    needsMigration = true
    migrated.language = 'zh-CN'
  }
  if (!migrated.risk_strategy) {
    needsMigration = true
    migrated.risk_strategy = 'balanced'
  }
  if (!Array.isArray(migrated.sources)) {
    needsMigration = true
    migrated.sources = []
  } else {
    const migratedSources = migrated.sources.map(s => migrateSoulSource(s, migrated.id))
    if (JSON.stringify(migratedSources) !== JSON.stringify(migrated.sources)) {
      needsMigration = true
      migrated.sources = migratedSources
    }
  }
  if (!Array.isArray(migrated.candidates)) {
    needsMigration = true
    migrated.candidates = []
  }
  if (!migrated.status || migrated.status === 'active') {
    needsMigration = true
    migrated.status = 'draft'
  }
  if (!migrated.description) {
    migrated.description = ''
  }
  if (needsMigration) {
    return migrated
  }
  return migrated
}
const enrichSoulAuthor = author => {
  let migrated = migrateSoulAuthor(author)
  ensureSoulAuthorFolders(migrated)
  const meta = soulJson(migrated, 'metadata.json', { texts: [] })
  const chunks = readSoulChunks(migrated)
  const webClaims = soulJson(migrated, 'web_research/extracted_claims.json', { items: [] }).items || []
  const profile = soulJson(migrated, 'soul_profile.json', defaultSoulProfile(migrated.name))
  const textsCount = (meta.texts || []).length
  let finalAuthor = migrated
  let sourcesUpdated = false
  const syncedSources = (finalAuthor.sources || []).map(source => {
    const synced = syncSingleSoulSourceStatus(finalAuthor, source)
    if (JSON.stringify(synced) !== JSON.stringify(source)) sourcesUpdated = true
    return synced
  })
  if (sourcesUpdated) {
    finalAuthor = { ...finalAuthor, sources: syncedSources }
    updateSoulAuthorInStore(finalAuthor)
  }
  if (finalAuthor.status === 'draft' && textsCount > 0) {
    finalAuthor = { ...finalAuthor, status: 'ready' }
    updateSoulAuthorInStore(finalAuthor)
  }
  const sourcesIndexed = (finalAuthor.sources || []).filter(s => s.status === 'indexed' || s.status === 'partial').length
  const sourcesParsing = (finalAuthor.sources || []).filter(s => s.status === 'parsing' || s.status === 'pending').length
  return { ...finalAuthor, texts_count: textsCount, chunks_count: chunks.length, web_evidence_count: webClaims.length, sources_count: (finalAuthor.sources || []).length, sources_indexed: sourcesIndexed, sources_parsing: sourcesParsing, profile_version: profile.updated_at ? profile.version || 1 : 0, profile_updated_at: profile.updated_at || null }
}
const listSoulAuthors = (query = {}) => {
  const store = readSoulStore()
  let hasChanges = false
  let authors = (store.authors || []).map(a => {
    const migrated = migrateSoulAuthor(a)
    if (JSON.stringify(a) !== JSON.stringify(migrated)) {
      hasChanges = true
    }
    return migrated
  })
  authors = authors.map(a => enrichSoulAuthor(a))
  if (hasChanges) {
    writeSoulStore({ ...store, authors: authors.map(a => ({
      id: a.id, slug: a.slug, name: a.name, description: a.description,
      identity: a.identity, language: a.language, risk_strategy: a.risk_strategy,
      status: a.status, created_at: a.created_at, updated_at: a.updated_at,
      folder: a.folder, sources: a.sources, candidates: a.candidates, governance: a.governance
    })) })
  }
  const statusFilter = query?.status
  let filteredAuthors = authors
  if (statusFilter === 'archived') {
    filteredAuthors = authors.filter(a => a.status === 'archived')
  } else if (statusFilter && statusFilter !== 'all') {
    filteredAuthors = authors.filter(a => a.status === statusFilter)
  } else {
    filteredAuthors = authors.filter(a => a.status !== 'archived')
  }
  return { ok: true, authors: filteredAuthors, active_author_id: store.active_author_id || authors[0]?.id || '' }
}
const findSoulAuthor = ref => {
  const store = readSoulStore()
  const rows = Array.isArray(store.authors) ? store.authors : []
  const key = String(ref || '').trim()
  let author = null
  if (key) author = rows.find(a => a.id === key || a.slug === key || a.name === key) || null
  else author = rows.find(a => a.id === store.active_author_id) || rows[0] || null
  if (!author) return null
  const migrated = migrateSoulAuthor(author)
  if (JSON.stringify(author) !== JSON.stringify(migrated)) {
    updateSoulAuthorInStore(migrated)
    return enrichSoulAuthor(migrated)
  }
  return enrichSoulAuthor(migrated)
}
const createSoulAuthor = input => {
  const name = String(input?.name || input?.author || input?.title || '').trim()
  if (!name) throw new Error('作者名称不能为空。')
  const store = readSoulStore()
  let slug = slugify(name)
  const existing = new Set((store.authors || []).map(a => a.slug))
  let suffix = 2
  while (existing.has(slug)) slug = `${slugify(name)}-${suffix++}`
  let identity = input?.identity || {}
  if (!identity.kind) {
    const oldType = String(input?.type || 'author').toLowerCase()
    if (oldType === 'author') identity.kind = 'person'
    else if (oldType === 'screenwriter') identity.kind = 'person'
    else if (oldType === 'critic') identity.kind = 'editorial_role'
    else if (oldType === 'custom') identity.kind = 'method'
    else if (oldType === 'user_preference') identity.kind = 'user_preference'
    else identity.kind = 'person'
  }
  if (!identity.role_id) identity.role_id = input?.role_id || ''
  if (!Array.isArray(identity.domain_ids)) {
    identity.domain_ids = input?.domain_ids ? (Array.isArray(input.domain_ids) ? input.domain_ids : [input.domain_ids]) : []
    if (identity.domain_ids.length === 0) {
      if (input?.type === 'screenwriter') identity.domain_ids = ['film-theater']
      else identity.domain_ids = ['literature']
    }
  }
  if (!Array.isArray(identity.family_ids)) identity.family_ids = input?.family_ids ? (Array.isArray(input.family_ids) ? input.family_ids : [input.family_ids]) : []
  if (!Array.isArray(identity.form_ids)) identity.form_ids = input?.form_ids ? (Array.isArray(input.form_ids) ? input.form_ids : [input.form_ids]) : []
  const language = input?.language || 'zh-CN'
  const risk_strategy = input?.risk_strategy || 'balanced'
  const description = String(input?.description || '').trim()
  const author = {
    id: soulId('author'),
    slug,
    name,
    description,
    identity,
    language: language === 'zh' ? 'zh-CN' : language,
    risk_strategy,
    status: 'draft',
    created_at: soulNow(),
    updated_at: soulNow(),
    folder: path.join(soulAuthorsRoot(), slug),
    sources: [],
    candidates: []
  }
  ensureSoulAuthorFolders(author)
  writeSoulStore({ ...store, active_author_id: author.id, authors: [...(store.authors || []), author] })
  return { ok: true, author: enrichSoulAuthor(author) }
}
const updateSoulAuthorInStore = author => {
  const store = readSoulStore()
  writeSoulStore({ ...store, active_author_id: author.id, authors: (store.authors || []).map(a => a.id === author.id ? { ...a, ...author, updated_at: soulNow() } : a) })
}
const readSoulChunks = author => {
  const file = soulPath(author, 'chunks', 'chunks.json')
  const data = readJsonFile(file, { chunks: [] })
  return Array.isArray(data.chunks) ? data.chunks : []
}
const writeSoulChunks = (author, chunks) => writeJsonFile(soulPath(author, 'chunks', 'chunks.json'), { version: 1, author_id: author.id, updated_at: soulNow(), chunks })
const soulLog = (author, operation, details = {}) => {
  ensureSoulAuthorFolders(author)
  const row = { at: soulNow(), author_id: author.id, author_name: author.name, operation, model: details.model || 'local-heuristic', sent_scope: details.sent_scope || 'local-derived-evidence', urls: details.urls || [], note: details.note || '' }
  fs.appendFileSync(soulPath(author, 'decisions.jsonl'), `${JSON.stringify(row)}\n`, 'utf8')
  return row
}
const soulReadTextFile = file => fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
const stripXmlText = xml => String(xml || '').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const extractZipTextWithPowerShell = (file, wanted) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-soul-zip-'))
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory(${JSON.stringify(file)}, ${JSON.stringify(tmp)})`], { stdio: 'ignore' })
    const rows = []
    const walk = dir => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else if (wanted(full)) rows.push(stripXmlText(fs.readFileSync(full, 'utf8')))
      }
    }
    walk(tmp)
    return rows.filter(Boolean).join('\n\n')
  } finally { try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {} }
}
const extractSoulText = file => {
  const ext = path.extname(file).toLowerCase()
  if (ext === '.txt' || ext === '.md' || ext === '.markdown') return soulReadTextFile(file)
  if (ext === '.docx') return extractZipTextWithPowerShell(file, full => /word[\\/]document\.xml$/i.test(full))
  if (ext === '.epub') return extractZipTextWithPowerShell(file, full => /\.(xhtml|html|htm)$/i.test(full))
  if (ext === '.pdf') throw new Error('PDF text extraction dependency is not configured. Install a local PDF text extractor before importing PDF into Soul Workshop.')
  throw new Error(`Unsupported Soul Workshop file type: ${ext}`)
}
const normalizeSoulMeta = input => ({ author: String(input?.author || input?.author_name || '').trim(), title: String(input?.title || '').trim(), year: Number(input?.year || 0) || null, genre: String(input?.genre || 'unknown').trim(), source: String(input?.source || 'local_upload').trim(), source_url: String(input?.source_url || '').trim(), language: String(input?.language || 'zh').trim(), license_note: String(input?.license_note || '').trim(), ...soulUsagePolicy(input?.copyright_status || 'unknown') })
const importSoulTexts = (ref, input = {}) => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`Soul author not found: ${ref}`)
  ensureSoulAuthorFolders(author)
  const rawPaths = [...(Array.isArray(input.paths) ? input.paths : []), input.path, input.file].map(String).filter(Boolean)
  const urls = Array.isArray(input.urls) ? input.urls : (input.url ? [input.url] : [])
  const metaBase = normalizeSoulMeta({ ...input, author: author.name })
  const imported = []
  const meta = soulJson(author, 'metadata.json', { version: 1, author_id: author.id, author_name: author.name, texts: [] })
  const resolvedFiles = []
  for (const raw of rawPaths) {
    const full = path.resolve(raw)
    if (!fs.existsSync(full)) continue
    try {
      const stat = fs.statSync(full)
      if (stat.isDirectory()) {
        const dirFiles = scanSoulSourceFolder(full)
        resolvedFiles.push(...dirFiles)
      } else if (stat.isFile()) {
        resolvedFiles.push(full)
      }
    } catch {}
  }
  for (const full of resolvedFiles) {
    try {
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue
      const rawName = `${Date.now()}-${soulSafeFileName(path.basename(full))}`
      const rawTarget = path.join(soulPath(author, 'raw_texts'), rawName)
      fs.copyFileSync(full, rawTarget)
      const text = extractSoulText(full)
      const title = metaBase.title || path.basename(full, path.extname(full))
      const cleaned = text.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim()
      const textId = soulId('text')
      const cleanFile = path.join(soulPath(author, 'cleaned_texts'), `${textId}-${soulSafeFileName(title)}.txt`)
      fs.writeFileSync(cleanFile, cleaned, 'utf8')
      const record = { id: textId, raw_file: rawTarget, cleaned_file: cleanFile, chars: cleaned.length, imported_at: soulNow(), ...metaBase, title }
      meta.texts = [record, ...(meta.texts || [])]
      imported.push(record)
    } catch (fileErr) {}
  }
  meta.updated_at = soulNow()
  writeSoulJson(author, 'metadata.json', meta)
  const now = soulNow()
  let updatedAuthor = { ...author }
  if (imported.length > 0 && input.add_source !== false) {
    const existingSources = Array.isArray(author.sources) ? author.sources : []
    const hasLegacySource = existingSources.some(s => s.kind === 'legacy_import' && s.import_batch === meta.updated_at)
    if (!hasLegacySource) {
      const sourceLabel = input.source_label || (resolvedFiles.length === 1 ? path.basename(resolvedFiles[0]) : `导入 (${imported.length} 个文件)`)
      const legacySource = {
        id: soulId('source'),
        soul_id: author.id,
        kind: resolvedFiles.length === 1 ? 'file' : 'folder',
        label: sourceLabel,
        original_location: resolvedFiles.length === 1 ? resolvedFiles[0] : (rawPaths[0] || ''),
        copyright_status: metaBase.copyright_status || 'unknown',
        status: 'indexed',
        parser: 'legacy_import',
        file_count: resolvedFiles.length,
        chunk_count: imported.length,
        created_at: now,
        updated_at: now,
        indexed_at: now,
        completed_at: now,
        error: null,
        warnings: [],
        files: resolvedFiles.slice(0, 200),
        ingest_job_id: null,
        ingest_job_ids: [],
        imported_text_ids: imported.map(r => r.id),
        import_batch: meta.updated_at
      }
      updatedAuthor = { ...updatedAuthor, sources: [...existingSources, legacySource] }
    }
  }
  updateSoulAuthorInStore(updatedAuthor)
  soulLog(updatedAuthor, 'import', { sent_scope: 'local-copy-and-parse', note: `${imported.length} files imported` })
  return { ok: true, author: enrichSoulAuthor(updatedAuthor), imported }
}
const splitSoulParagraphs = text => String(text || '').split(/\n\s*\n+/).map(x => x.trim()).filter(Boolean)
const detectSoulTags = text => {
  const tags = []
  if (new RegExp('[\\u201c\\u201d\"].{1,120}[\\u201c\\u201d\"]').test(text)) tags.push('dialogue')
  if (new RegExp('\\u51b2\\u7a81|\\u4e89\\u5435|\\u5931\\u8d25|\\u5371\\u9669|\\u79d8\\u5bc6|\\u6b7b\\u4ea1|fear|conflict|danger', 'i').test(text)) tags.push('conflict')
  if (new RegExp('\\u68a6|\\u5f71\\u5b50|\\u6708|\\u96e8|\\u6d77|\\u706f|\\u82b1|\\u9e1f|\\u955c|symbol|image', 'i').test(text)) tags.push('symbolism')
  if (new RegExp('\\u5fc5\\u987b|\\u4e0d\\u80fd|\\u6c38\\u8fdc|\\u4ece\\u4e0d|\\u89c4\\u5219').test(text)) tags.push('canon_rule')
  return tags.length ? tags : ['prose']
}
const soulLineAt = (text, idx) => String(text || '').slice(0, Math.max(0, idx)).split(/\n/).length
const makeSoulChunk = (author, textRecord, type, text, extra = {}) => ({ chunk_id: soulId('chunk'), author_id: author.id, author: author.name, title: textRecord.title, chapter: extra.chapter || '', scene: extra.scene || '', text, summary: summarizeText(text, 240), tags: detectSoulTags(text), embedding_type: type, source_file: path.relative(author.folder, textRecord.cleaned_file), line_start: extra.line_start || 1, line_end: extra.line_end || (extra.line_start || 1), copyright_status: textRecord.copyright_status, allowed_usage: textRecord.allowed_usage, forbidden_usage: textRecord.forbidden_usage, metadata: { text_id: textRecord.id, year: textRecord.year, genre: textRecord.genre, language: textRecord.language } })
const processSoulAuthor = async (ref, input = {}) => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`Soul author not found: ${ref}`)
  ensureSoulAuthorFolders(author)
  const meta = soulJson(author, 'metadata.json', { texts: [] })
  const chunks = []
  const graph = { version: 1, author_id: author.id, nodes: {}, edges: [] }
  for (const textRecord of meta.texts || []) {
    const text = fs.readFileSync(textRecord.cleaned_file, 'utf8')
    const chapterParts = text.split(new RegExp('(?=^\\s{0,3}#{1,3}\\s+|^\\u7b2c[\\u4e00\\u4e8c\\u4e09\\u56db\\u4e94\\u516d\\u4e03\\u516b\\u4e5d\\u5341\\u767e\\u53430-9]+[\\u7ae0\\u8282\\u56de\\u5e55])', 'm')).map(x => x.trim()).filter(Boolean)
    const chapters = chapterParts.length ? chapterParts : [text]
    chapters.forEach((chapterText, ci) => {
      const chapterName = (chapterText.match(/^\\s{0,3}#{1,3}\\s+(.+)$/m)?.[1] || chapterText.match(new RegExp('^\\u7b2c[\\u4e00\\u4e8c\\u4e09\\u56db\\u4e94\\u516d\\u4e03\\u516b\\u4e5d\\u5341\\u767e\\u53430-9]+[\\u7ae0\\u8282\\u56de\\u5e55].{0,40}'))?.[0] || `Chapter ${ci + 1}`).trim()
      const chapterLine = soulLineAt(text, text.indexOf(chapterText))
      chunks.push(makeSoulChunk(author, textRecord, 'chapter', chapterText.slice(0, 6000), { chapter: chapterName, line_start: chapterLine, line_end: chapterLine + chapterText.split(/\n/).length }))
      const scenes = chapterText.split(new RegExp('\\n\\s*[-*]{3,}\\s*\\n|\\n\\s*\\u7b2c[\\u4e00\\u4e8c\\u4e09\\u56db\\u4e94\\u516d\\u4e03\\u516b\\u4e5d\\u5341\\u767e\\u53430-9]+\\u573a', 'm')).map(x => x.trim()).filter(x => x.length > 80)
      scenes.slice(0, 80).forEach((sceneText, si) => chunks.push(makeSoulChunk(author, textRecord, 'scene', sceneText.slice(0, 3000), { chapter: chapterName, scene: `Scene ${si + 1}`, line_start: soulLineAt(text, text.indexOf(sceneText)) })))
      splitSoulParagraphs(chapterText).filter(p => p.length > 24).slice(0, 240).forEach((para, pi) => chunks.push(makeSoulChunk(author, textRecord, 'paragraph', para.slice(0, 1200), { chapter: chapterName, scene: `P${pi + 1}`, line_start: soulLineAt(text, text.indexOf(para)) })))
    })
    const names = extractCharactersFromDocs([{ rel: path.basename(textRecord.cleaned_file), text }]).slice(0, 60)
    for (const n of names) graph.nodes[n.name] = { id: n.name, type: 'character', count: n.count || 1 }
  }
  let vectorized = false
  if (chunks.length) {
    const embRow = getEmbeddingModelRow('')
    if (embRow) {
      try {
        const batchSize = 16
        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize)
          const embedded = await embedTexts(batch.map(c => c.text.slice(0, 3000)), '')
          embedded.vectors.forEach((v, j) => { batch[j].embedding = v })
        }
        vectorized = true
      } catch { vectorized = false }
    }
  }
  writeSoulChunks(author, chunks)
  writeSoulJson(author, 'chunks/graph.json', graph)
  const stats = { total: chunks.length, chapter: chunks.filter(c => c.embedding_type === 'chapter').length, scene: chunks.filter(c => c.embedding_type === 'scene').length, paragraph: chunks.filter(c => c.embedding_type === 'paragraph').length, vectorized: vectorized ? 1 : 0 }
  soulLog(author, 'process', { sent_scope: 'local-cleaned-texts', note: `${stats.total} chunks generated` })
  return { ok: true, author: enrichSoulAuthor(author), stats, chunks: chunks.slice(0, 30), graph }
}
const soulLexScore = (query, text) => {
  const terms = normalizeTextForSearch(query).split(/\s+/).filter(Boolean)
  const hay = normalizeTextForSearch(text)
  if (!terms.length) return 0
  return terms.reduce((sum, t) => sum + (hay.includes(t) ? 1 : 0), 0) / terms.length
}
const searchSoulAuthor = async (ref, input = {}) => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`Soul author not found: ${ref}`)
  const query = String(input.query || input.q || '').trim()
  const type = String(input.embedding_type || input.type || '').trim()
  const limit = Math.max(1, Math.min(30, Number(input.limit || 8)))
  let chunks = readSoulChunks(author).filter(c => !type || c.embedding_type === type)
  if (input.copyright_status) chunks = chunks.filter(c => c.copyright_status === input.copyright_status)
  let vectorized = false
  let results = []
  const vectorChunks = chunks.filter(c => Array.isArray(c.embedding))
  if (query && vectorChunks.length) {
    try {
      const embedded = await embedTexts([query], '')
      const qv = embedded.vectors[0]
      vectorized = true
      results = vectorChunks.map(c => ({ ...c, score: 0.65 * cosineSimilarity(qv, c.embedding) + 0.35 * soulLexScore(query, c.text), score_detail: { vector: true, lexical: soulLexScore(query, c.text) } }))
    } catch { vectorized = false }
  }
  if (!results.length) results = chunks.map(c => ({ ...c, score: soulLexScore(query, `${c.title} ${c.chapter} ${c.tags?.join(' ')} ${c.text}`), score_detail: { vector: false, lexical: soulLexScore(query, c.text) } }))
  results = results.sort((a, b) => b.score - a.score).slice(0, limit)
  return { ok: true, query, vectorized, results, message: vectorized ? 'Hybrid vector + lexical retrieval.' : 'Lexical/BM25-like fallback; configure an embedding model to vectorize Soul chunks.' }
}
const sourceCredibility = url => {
  const u = String(url || '').toLowerCase()
  let score = 0.45
  if (/\.edu|\.ac\.|university|press|journal|jstor|doi|official|gov|org|cnki|nature\.com|science\.org|springer|sciencedirect|pubmed|arxiv/.test(u)) score += 0.35
  if (/baike\.baidu|wikipedia|britannica|douban|goodreads|nytimes|newyorker|guardian|bbc/.test(u)) score += 0.18
  if (/blog|forum|tieba|reddit|zhihu|xiaohongshu|xhslink|weibo|bilibili/.test(u)) score -= 0.22
  if (new RegExp('txt|read|novel|chapter|fulltext|\\u5168\\u96c6|\\u5728\\u7ebf\\u9605\\u8bfb|\\u76d7\\u7248').test(u)) score -= 0.35
  return Math.max(0, Math.min(1, score))
}

const sourceAuthorityCheck = url => {
  const u = String(url || '').toLowerCase()
  const credibility = sourceCredibility(u)
  if (/txt|read|novel|chapter|fulltext|\u5168\u96c6|\u5728\u7ebf\u9605\u8bfb|\u76d7\u7248/.test(u)) return { status: 'failed', reason: '疑似全文转载/盗版阅读来源，不进入观点抽取。', credibility }
  if (/zhihu|xiaohongshu|xhslink|tieba|forum|reddit|weibo|bilibili/.test(u)) return { status: 'failed', reason: '社区/社媒来源权威性不足，仅保留为线索。', credibility }
  if (/wikipedia|baike\.baidu|cnki|nature\.com|science\.org|doi|jstor|\.edu|\.ac\.|gov|official|douban|britannica|press|journal|pubmed|arxiv/.test(u)) return { status: 'passed', reason: '命中百科/学术/出版/官方等较权威来源。', credibility }
  return { status: credibility >= 0.55 ? 'passed' : 'review', reason: credibility >= 0.55 ? '来源可信度达到阈值。' : '来源未命中权威白名单，建议人工复核。', credibility }
}

const httpGetText = (url, timeoutMs = 15000) => new Promise((resolve, reject) => {
  const req = https.get(url, { headers: { 'User-Agent': 'KarnaSoulWorkshop/1.0' } }, res => {
    let data = ''
    res.setEncoding('utf8')
    res.on('data', d => { data += d })
    res.on('end', () => resolve(data))
  })
  req.on('error', reject)
  req.setTimeout(timeoutMs, () => { req.destroy(new Error('Web research timeout')) })
})
const webSearchDuckDuckGo = async query => {
  const data = await httpGetText(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, 15000)
  const rows = []
  const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>[\s\S]*?(?:<a[^>]+class="result__snippet"[^>]*>|<div[^>]+class="result__snippet"[^>]*>)([\s\S]*?)(?:<\/a>|<\/div>)/gi
  let m
  while ((m = re.exec(data)) && rows.length < 10) rows.push({ title: stripXmlText(m[2]), url: m[1].replace(/&amp;/g, '&'), snippet: stripXmlText(m[3]) })
  return rows
}
const webSearchBaiduBaike = async query => {
  const short = String(query || '')
    .replace(/\b(interview|writing|method|literary|criticism|craft|lecture)\b/gi, '')
    .replace(new RegExp('\\u8bbf\\u8c08|\\u521b\\u4f5c\\u8c08|\\u6587\\u5b66\\u8bc4\\u8bba|\\u8bba\\u6587\\u6458\\u8981|\\u8bb2\\u5ea7|\\u4e66\\u8bc4', 'g'), '')
    .trim() || query
  const url = `https://baike.baidu.com/search/word?word=${encodeURIComponent(short)}`
  const data = await httpGetText(url, 10000)
  if (/verify|captcha|wappass|security/i.test(data)) return []
  const titleMatch = data.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const descMatch = data.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || data.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
  const title = stripXmlText(titleMatch?.[1] || `${short} - \u767e\u5ea6\u767e\u79d1`).replace(new RegExp('_\\u767e\\u5ea6\\u767e\\u79d1|-\\s*\\u767e\\u5ea6\\u767e\\u79d1|\\s*\\u767e\\u5ea6\\u767e\\u79d1', 'g'), '').trim()
  const snippet = stripXmlText(descMatch?.[1] || '')
  if (!title || (!snippet && !new RegExp(String(short).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(title))) return []
  return [{ title, url, snippet: snippet || `${title}\uff08\u767e\u5ea6\u767e\u79d1\u6761\u76ee\uff09` }]
}
const webSearchWikipedia = async query => {
  const short = String(query || '').replace(/\b(interview|writing|method|literary|criticism|craft|lecture)\b/gi, '').trim() || query
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&limit=6&namespace=0&format=json&search=${encodeURIComponent(short)}`
  let data = ''
  try { data = await httpGetText(url, 12000) } catch {
    data = String(execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Invoke-WebRequest -UseBasicParsing -Uri ${JSON.stringify(url)} -TimeoutSec 18).Content`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))
  }
  const parsed = JSON.parse(data)
  const titles = parsed[1] || [], snippets = parsed[2] || [], urls = parsed[3] || []
  return titles.map((title, i) => ({ title, snippet: snippets[i] || title, url: urls[i] || `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}` }))
}
const webSearchPublic = async query => {
  try {
    const baike = await webSearchBaiduBaike(query)
    if (baike.length) return baike
  } catch {}
  try {
    const wiki = await webSearchWikipedia(query)
    if (wiki.length) return wiki
  } catch {}
  try {
    return await webSearchDuckDuckGo(query)
  } catch {
    return []
  }
}
const webResearchSoulAuthor = async (ref, input = {}) => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`Soul author not found: ${ref}`)
  ensureSoulAuthorFolders(author)
  const base = String(input.query || input.keyword || author.name).trim()
  const queries = [base, `${base} interview writing method`, `${base} literary criticism`, `${base} craft lecture`].slice(0, Number(input.max_queries || 4))
  const allSources = []
  const allClaims = []
  const queryRows = []
  const warnings = []
  const seedUrls = Array.isArray(input.urls) ? input.urls : String(input.urls || input.url || '').split(/[\n,，\s]+/)
  for (const rawUrl of seedUrls.map(String).map(s => s.trim()).filter(Boolean).slice(0, 20)) {
    const queryRow = { query: `URL: ${rawUrl}`, at: soulNow(), status: 'running', message: '' }
    queryRows.push(queryRow)
    if (!/^https?:\/\//i.test(rawUrl)) {
      queryRow.status = 'degraded'
      queryRow.message = 'URL必须以http://或https://开头。'
      warnings.push({ query: rawUrl, message: queryRow.message })
      continue
    }
    const authority = sourceAuthorityCheck(rawUrl)
    let text = ''
    try {
      const fetched = await httpFetchUrlText(rawUrl, 18000)
      text = fetched.text || ''
      queryRow.status = text.trim() ? 'success' : 'degraded'
      queryRow.message = text.trim() ? `权威校验：${authority.status === 'passed' ? '通过' : authority.status === 'failed' ? '未通过' : '需复核'}。${authority.reason}` : '网页没有返回可用正文。'
    } catch (err) {
      queryRow.status = 'degraded'
      queryRow.message = `抓取失败：${err.message || String(err)}`
      warnings.push({ query: rawUrl, message: queryRow.message })
    }
    const source = { id: soulId('source'), query: queryRow.query, title: rawUrl, url: rawUrl, summary: summarizeText(text, 260) || queryRow.message, credibility: authority.credibility, copyright_risk: authority.status === 'failed' ? 'high' : 'low', authority_status: authority.status, authority_reason: authority.reason, saved_at: soulNow() }
    allSources.push(source)
    if (authority.status !== 'failed' && text.trim()) {
      allClaims.push({ id: soulId('claim'), claim: summarizeText(text, 260), evidence: summarizeText(text, 420), source_url: rawUrl, source_title: rawUrl, confidence: authority.credibility, category: 'seed_url_research' })
    }
  }
  for (const q of queries) {
    const queryRow = { query: q, at: soulNow(), status: 'running', message: '' }
    queryRows.push(queryRow)
    const results = await webSearchPublic(q)
    queryRow.status = results.length ? 'success' : 'degraded'
    if (!results.length) {
      queryRow.message = '\u641c\u7d22\u6e90\u8d85\u65f6\u6216\u672a\u8fd4\u56de\u53ef\u7528\u7ed3\u679c\uff0c\u5df2\u8df3\u8fc7\u8be5\u67e5\u8be2\u3002'
      warnings.push({ query: q, message: queryRow.message })
    }
    for (const row of results) {
      const copyright_risk = new RegExp('txt|read|novel|chapter|fulltext|\\u5168\\u96c6|\\u5728\\u7ebf\\u9605\\u8bfb|\\u76d7\\u7248', 'i').test(`${row.url} ${row.title}`) ? 'high' : 'low'
      const authority = sourceAuthorityCheck(row.url)
      const credibility = authority.credibility
      const source = { id: soulId('source'), query: q, title: row.title, url: row.url, summary: row.snippet, credibility, copyright_risk: authority.status === 'failed' ? 'high' : copyright_risk, authority_status: authority.status, authority_reason: authority.reason, saved_at: soulNow() }
      allSources.push(source)
      if (source.copyright_risk !== 'high') allClaims.push({ id: soulId('claim'), claim: summarizeText(row.snippet || row.title, 220), evidence: row.snippet, source_url: row.url, source_title: row.title, confidence: credibility, category: new RegExp('interview|\\u8bbf\\u8c08|lecture|talk', 'i').test(`${row.title} ${row.snippet}`) ? 'narrative_method' : 'critical_lens' })
    }
  }
  writeJsonFile(soulPath(author, 'web_research', 'queries.json'), { items: [...queryRows, ...(readJsonFile(soulPath(author, 'web_research', 'queries.json'), { items: [] }).items || [])].slice(0, 200) })
  writeJsonFile(soulPath(author, 'web_research', 'sources.json'), { items: [...allSources, ...(readJsonFile(soulPath(author, 'web_research', 'sources.json'), { items: [] }).items || [])].slice(0, 400) })
  writeJsonFile(soulPath(author, 'web_research', 'extracted_claims.json'), { items: [...allClaims, ...(readJsonFile(soulPath(author, 'web_research', 'extracted_claims.json'), { items: [] }).items || [])].slice(0, 400) })
  writeJsonFile(soulPath(author, 'web_research', 'credibility_scores.json'), { items: allSources.map(s => ({ source_id: s.id, url: s.url, credibility: s.credibility, copyright_risk: s.copyright_risk })) })
  writeJsonFile(soulPath(author, 'web_research', 'conflicts.json'), { conflicts: detectSoulClaimConflicts(allClaims) })
  soulLog(author, 'web-research', { sent_scope: 'public-search-snippets-only', urls: allSources.map(s => s.url).slice(0, 20), note: `${allSources.length} sources, ${allClaims.length} claims`, warnings })
  return { ok: true, author: enrichSoulAuthor(author), queries: queryRows, sources: allSources, claims: allClaims, warnings, message: warnings.length && !allSources.length ? '\u8054\u7f51\u641c\u7d22\u6e90\u672a\u5728\u9650\u65f6\u5185\u8fd4\u56de\u7ed3\u679c\uff0c\u672c\u6b21\u6ca1\u6709\u5199\u5165\u65b0\u8bc1\u636e\u3002' : undefined, conflicts: detectSoulClaimConflicts(allClaims) }
}
const detectSoulClaimConflicts = claims => {
  const text = claims.map(c => c.claim).join(' ').toLowerCase()
  const conflicts = []
  if (new RegExp('realism|\\u73b0\\u5b9e\\u4e3b\\u4e49').test(text) && new RegExp('modernism|\\u73b0\\u4ee3\\u4e3b\\u4e49').test(text)) conflicts.push({ topic: 'realism_vs_modernism', mainstream: 'mixed evidence', minority: 'keep both labels', note: 'Do not collapse critical disagreements; cite source context.' })
  return conflicts
}
const profileItem = (value, evidence_refs = []) => ({ value, evidence_refs })
const distillSoulProfile = (ref, input = {}) => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`Soul author not found: ${ref}`)
  const chunks = readSoulChunks(author)
  const claims = soulJson(author, 'web_research/extracted_claims.json', { items: [] }).items || []
  const byTag = tag => chunks.filter(c => c.tags?.includes(tag)).slice(0, 6)
  const ev = c => c.chunk_id ? `chunk:${c.chunk_id}` : `web:${c.id}`
  const profile = defaultSoulProfile(author.name)
  profile.updated_at = soulNow()
  profile.common_themes = uniqueBy(chunks.flatMap(c => c.tags || []).map(t => profileItem(t, [ev(chunks.find(c => c.tags?.includes(t)) || {})])), x => x.value).slice(0, 12)
  profile.narrative_methods = byTag('conflict').map(c => profileItem(`\u7528\u5177\u4f53\u51b2\u7a81\u573a\u9762\u4ee3\u66ff\u62bd\u8c61\u8bf4\u6559\uff1a${c.summary}`, [ev(c)])).slice(0, 8)
  profile.dialogue_features = byTag('dialogue').map(c => profileItem(`\u5bf9\u767d\u627f\u8f7d\u4eba\u7269\u538b\u529b\u548c\u6f5c\u53f0\u8bcd\uff1a${c.summary}`, [ev(c)])).slice(0, 8)
  profile.imagery_system = byTag('symbolism').map(c => profileItem(`\u53ef\u8ffd\u8e2a\u7684\u610f\u8c61\u7cfb\u7edf\uff1a${c.summary}`, [ev(c)])).slice(0, 8)
  profile.sentence_features = chunks.filter(c => c.embedding_type === 'paragraph').slice(0, 8).map(c => profileItem(`\u6bb5\u843d\u8282\u594f\u53ea\u84b8\u998f\u4e3a\u65b9\u6cd5\u539f\u5219\uff0c\u4e0d\u590d\u5236\u539f\u53e5\u3002`, [ev(c)]))
  profile.critical_lens = claims.slice(0, 10).map(c => profileItem(c.claim, [ev(c)]))
  profile.core_worldview = claims.filter(c => c.category === 'critical_lens').slice(0, 6).map(c => profileItem(c.claim, [ev(c)]))
  profile.character_design_patterns = chunks.filter(c => /character|dialogue|conflict/.test((c.tags || []).join(' '))).slice(0, 8).map(c => profileItem(`\u901a\u8fc7\u884c\u52a8\u3001\u8bed\u8a00\u548c\u77db\u76fe\u66b4\u9732\u4eba\u7269\u3002`, [ev(c)]))
  profile.conflict_patterns = byTag('conflict').map(c => profileItem(`\u51b2\u7a81\u6a21\u5f0f\uff1a\u538b\u529b + \u540e\u679c + \u53ef\u89c1\u9009\u62e9\u3002`, [ev(c)])).slice(0, 8)
  profile.pacing_preferences = chunks.filter(c => c.embedding_type === 'chapter').slice(0, 6).map(c => profileItem(`\u7ae0\u8282\u7ea7\u63a8\u8fdb\uff1a${c.summary}`, [ev(c)]))
  profile.do_not_copy = [profileItem('\u4e0d\u6a21\u4eff\u53d7\u4fdd\u62a4\u8868\u8fbe\u3001\u6807\u5fd7\u6027\u7528\u8bcd\u3001\u5177\u540d\u573a\u666f\u6216\u53ef\u8bc6\u522b\u60c5\u8282\u5e8f\u5217\u3002', [])]
  profile.safe_transfer_principles = [profileItem('\u5b66\u4e60\u65b9\u6cd5\uff0c\u4e0d\u590d\u5236\u8868\u8fbe\u3002', []), profileItem('\u8fc1\u79fb\u539f\u5219\uff0c\u4e0d\u590d\u523b\u4eba\u683c\u3002', []), profileItem('\u5148\u7ed9\u6279\u8bc4\u548c\u89c4\u5212\u5efa\u8bae\uff0c\u4e0d\u76f4\u63a5\u4ee3\u5199\u6b63\u6587\u3002', []), profileItem('\u98ce\u9669\u5347\u9ad8\u65f6\uff0c\u6539\u53d8\u610f\u8c61\u3001\u53e5\u5f0f\u8282\u594f\u3001\u89c6\u89d2\u548c\u60c5\u8282\u7ed3\u6784\u3002', [])]
  profile.evidence_refs = uniqueBy([...chunks.slice(0, 30).map(c => ({ ref: ev(c), title: c.title, source_file: c.source_file, line_start: c.line_start })), ...claims.slice(0, 30).map(c => ({ ref: ev(c), title: c.source_title, source_url: c.source_url }))], x => x.ref)
  writeSoulJson(author, 'soul_profile.json', profile)
  writeSoulJson(author, 'citations.json', { version: 1, citations: profile.evidence_refs })
  soulLog(author, 'distill', { sent_scope: 'chunk-summaries-and-web-claims', note: `${profile.evidence_refs.length} evidence refs` })
  return { ok: true, author: enrichSoulAuthor(author), profile }
}
const criticSoulText = (ref, input = {}) => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`Soul author not found: ${ref}`)
  const text = String(input.text || '').trim()
  if (!text) throw new Error('Critic requires user text.')
  const profile = soulJson(author, 'soul_profile.json', defaultSoulProfile(author.name))
  const report = { at: soulNow(), author_id: author.id, mode: 'critic', summary: summarizeText(text, 220), critiques: [], transfer_principles: profile.safe_transfer_principles || [], policy: '\u53ea\u505a\u6279\u8bc4\uff0c\u4e0d\u8f93\u51fa\u4f5c\u5bb6\u514b\u9686\u5f0f\u6587\u672c' }
  report.critiques.push({ dimension: 'conflict', issue: new RegExp('\\u4f46\\u662f|\\u51b2\\u7a81|\\u5931\\u8d25|\\u5371\\u9669').test(text) ? '\u5df2\u6709\u51b2\u7a81\u4fe1\u53f7\uff1b\u9700\u68c0\u67e5\u540e\u679c\u662f\u5426\u5347\u7ea7\u3002' : '\u51b2\u7a81\u4fe1\u53f7\u504f\u5f31\u3002', suggestion: '\u8ba9\u573a\u666f\u4ee3\u4ef7\u53ef\u89c1\uff0c\u5e76\u628a\u5b83\u7ed1\u5230\u4eba\u7269\u9009\u62e9\u4e0a\u3002' })
  report.critiques.push({ dimension: 'exposition', issue: text.length > 800 ? '\u7247\u6bb5\u504f\u957f\uff0c\u53ef\u80fd\u8fc7\u5ea6\u89e3\u91ca\u3002' : '\u7247\u6bb5\u957f\u5ea6\u53ef\u63a7\u3002', suggestion: '\u5c3d\u91cf\u7528\u5177\u4f53\u573a\u666f\u7ec6\u8282\u66ff\u4ee3\u62bd\u8c61\u89e3\u91ca\u3002' })
  report.critiques.push({ dimension: 'safe_transfer', issue: '\u628a\u7075\u9b42\u6863\u6848\u5f53\u6210\u6279\u8bc4\u955c\u5934\uff0c\u4e0d\u8981\u5f53\u6210\u4eff\u5199\u6a21\u677f\u3002', suggestion: '\u53ea\u8fc1\u79fb\u4e00\u6761\u62bd\u8c61\u539f\u5219\uff0c\u540c\u65f6\u6539\u53d8\u610f\u8c61\u3001\u89c6\u89d2\u548c\u53e5\u5f0f\u8282\u594f\u3002' })
  soulLog(author, 'critic', { sent_scope: 'manual-user-text', note: `${text.length} chars` })
  return { ok: true, author: enrichSoulAuthor(author), report }
}
const ngramSet = (text, n = 5) => { const s = normalizeTextForSearch(text).replace(/\s+/g, ''); const out = new Set(); for (let i = 0; i <= s.length - n; i++) out.add(s.slice(i, i + n)); return out }
const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let hit = 0; for (const x of a) if (b.has(x)) hit++; return hit / Math.max(a.size, b.size) }
const riskCheckSoulText = (ref, input = {}) => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`Soul author not found: ${ref}`)
  const text = String(input.text || '').trim()
  if (!text) throw new Error('Risk check requires user text.')
  const userSet = ngramSet(text, 5)
  const chunks = readSoulChunks(author)
  const matches = chunks.map(c => ({ chunk_id: c.chunk_id, title: c.title, source_file: c.source_file, line_start: c.line_start, score: jaccard(userSet, ngramSet(c.text, 5)), snippet: summarizeText(c.text, 180) })).sort((a, b) => b.score - a.score).slice(0, 5)
  const top = matches[0]?.score || 0
  const markerHits = chunks.some(c => String(c.text || '').includes(text.slice(0, Math.min(24, text.length))) || text.includes(String(c.text || '').slice(0, Math.min(24, String(c.text || '').length))))
  const level = markerHits || top > 0.22 || new RegExp('\\u590d\\u8ff0|\\u7167\\u7740|\\u4eff\\u5199|\\u6a21\\u4eff').test(text) ? 'blocked' : top > 0.08 ? 'high' : top > 0.035 ? 'medium' : 'low'
  const report = { at: soulNow(), level, dimensions: { lexical_similarity: top, sentence_similarity: Math.min(1, top * 1.2), imagery_similarity: detectSoulTags(text).includes('symbolism') ? top : top * 0.6, paragraph_structure_similarity: Math.min(1, text.split(/\n\s*\n/).length / 20), plot_motif_similarity: top * 0.8, theme_similarity: top * 0.7 }, matches, allowed_output: level === 'high' || level === 'blocked' ? 'risk_reduction_advice_only' : 'criticism_and_safe_principles', risk_reduction: ['\u51cf\u5c11\u6807\u5fd7\u6027\u8bcd\u6c47\u3002', '\u66ff\u6362\u610f\u8c61\u7cfb\u7edf\u3002', '\u6539\u53d8\u53d9\u8ff0\u89c6\u89d2\u3002', '\u6539\u53d8\u53e5\u5f0f\u8282\u594f\u3002', '\u6539\u53d8\u60c5\u8282\u7ed3\u6784\u3002', '\u4fdd\u7559\u65b9\u6cd5\u8bba\uff0c\u79fb\u9664\u53ef\u8bc6\u522b\u8868\u8fbe\u3002'] }
  const data = soulJson(author, 'risk_profile.json', { checks: [] })
  data.updated_at = soulNow(); data.checks = [report, ...(data.checks || [])].slice(0, 100)
  writeSoulJson(author, 'risk_profile.json', data)
  soulLog(author, 'risk-check', { sent_scope: 'manual-user-text-vs-local-chunks', note: `${level} risk` })
  return { ok: true, author: enrichSoulAuthor(author), report }
}
const fusionSoulPreview = input => {
  const parts = input?.config || input || {}
  return { ok: true, preview: { plot_structure: parts.plot_structure || 'Use a clear conflict architecture, not author imitation.', character_conflict: parts.character_conflict || 'Use moral pressure as a design principle.', language_constraint: parts.language_constraint || 'Keep wording original and avoid signature markers.', reader_experience: parts.reader_experience || 'Prioritize tension, clarity, and user intent.', output_policy: 'principle-combination-only; no style cloning' } }
}
const exportSoulSkill = ref => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`Soul author not found: ${ref}`)
  const profile = soulJson(author, 'soul_profile.json', defaultSoulProfile(author.name))
  const dir = path.join(soulPath(author, 'exports'), `soul_distill_${author.slug}.skill`)
  fs.mkdirSync(dir, { recursive: true })
  const skill = { purpose: `Use ${author.name} research as safe transferable writing-method principles.`, inputs: ['user_text', 'task', 'risk_tolerance'], process: ['retrieve evidence refs', 'apply abstract principles', 'check style-similarity risk', 'return suggestions not imitation'], output_schema: { critiques: [], suggestions: [], risk: {} }, safety_rules: ['Do not imitate protected expression.', 'Do not produce author-clone prose.', 'Cite evidence refs as research support.'], examples: [{ input: 'criticize my chapter', output: 'conflict and pacing advice with risk notes' }], soul_profile: profile }
  writeJsonFile(path.join(dir, 'skill.json'), skill)
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `# ${author.name} Safe Soul Skill\n\nPurpose: ${skill.purpose}\n\nSafety: learn methods, do not copy expression.\n`, 'utf8')
  return { ok: true, author: enrichSoulAuthor(author), skill_dir: dir, skill }
}
const exportSoulAuthor = ref => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`Soul author not found: ${ref}`)
  const out = path.join(soulPath(author, 'exports'), `${author.slug}-soul-research.json`)
  const data = { exported_at: soulNow(), author, metadata: soulJson(author, 'metadata.json', {}), chunks: readSoulChunks(author), web_research: { sources: soulJson(author, 'web_research/sources.json', { items: [] }).items || [], claims: soulJson(author, 'web_research/extracted_claims.json', { items: [] }).items || [], conflicts: soulJson(author, 'web_research/conflicts.json', { conflicts: [] }).conflicts || [] }, soul_profile: soulJson(author, 'soul_profile.json', {}), risk_profile: soulJson(author, 'risk_profile.json', {}) }
  writeJsonFile(out, data)
  fs.writeFileSync(path.join(soulPath(author, 'exports'), `${author.slug}-soul-profile.md`), `# ${author.name} Soul Profile\n\n${JSON.stringify(data.soul_profile, null, 2)}\n`, 'utf8')
  return { ok: true, author: enrichSoulAuthor(author), file: out }
}
const updateSoulGovernance = (ref, input = {}) => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`Soul author not found: ${ref}`)
  const retentionDays = input.retention_days === 'forever' ? 'forever' : Math.max(1, Math.min(3650, Number(input.retention_days || 30)))
  const next = { ...author, governance: { ...(author.governance || {}), retention_days: retentionDays, updated_at: soulNow() } }
  updateSoulAuthorInStore(next)
  soulLog(next, 'governance-update', { note: `retention_days=${retentionDays}` })
  return { ok: true, governance: next.governance, author: enrichSoulAuthor(next) }
}
const purgeSoulKnowledge = ref => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`Soul author not found: ${ref}`)
  const root = path.resolve(author.folder)
  const allowedRoot = path.resolve(soulAuthorsRoot())
  if (root === allowedRoot || !root.startsWith(`${allowedRoot}${path.sep}`)) throw new Error('Refusing to purge a Soul folder outside the managed data root.')
  for (const directory of ['raw_texts', 'cleaned_texts', 'chunks', 'vector_db', 'web_research']) fs.rmSync(path.join(root, directory), { recursive: true, force: true })
  for (const file of ['metadata.json', 'soul_profile.json', 'risk_profile.json', 'citations.json']) fs.rmSync(path.join(root, file), { force: true })
  ensureSoulAuthorFolders(author)
  soulLog(author, 'knowledge-purge', { note: 'User-confirmed purge; exports preserved.' })
  return { ok: true, author: enrichSoulAuthor(author), governance: author.governance || { retention_days: 30 }, usage: knowledgeFolderUsage([root]) }
}
const deleteSoulAuthor = ref => {
  const store = readSoulStore()
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`Soul author not found: ${ref}`)
  try { fs.rmSync(author.folder, { recursive: true, force: true }) } catch {}
  const authors = (store.authors || []).filter(a => a.id !== author.id)
  writeSoulStore({ ...store, authors, active_author_id: authors[0]?.id || '' })
  return { ok: true, deleted: author.id }
}
const readSoulAuthorDetail = ref => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`Soul author not found: ${ref}`)
  return { ok: true, author: enrichSoulAuthor(author), governance: author.governance || { retention_days: 30 }, usage: knowledgeFolderUsage([author.folder]), metadata: soulJson(author, 'metadata.json', { texts: [] }), chunks: readSoulChunks(author).slice(0, 80), profile: soulJson(author, 'soul_profile.json', defaultSoulProfile(author.name)), citations: soulJson(author, 'citations.json', { citations: [] }).citations || [], risk_profile: soulJson(author, 'risk_profile.json', { checks: [] }), web: { queries: soulJson(author, 'web_research/queries.json', { items: [] }).items || [], sources: soulJson(author, 'web_research/sources.json', { items: [] }).items || [], claims: soulJson(author, 'web_research/extracted_claims.json', { items: [] }).items || [], conflicts: soulJson(author, 'web_research/conflicts.json', { conflicts: [] }).conflicts || [] } }
}
const getSoulCatalog = () => ({
  ok: true,
  catalog_version: SOUL_CATALOG_VERSION,
  domains: SOUL_DOMAINS,
  identity_presets: SOUL_IDENTITY_PRESETS,
  document_types: SOUL_DOCUMENT_TYPES_WITH_LABELS
})
const updateSoulAuthor = (ref, input) => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`未找到Soul作者: ${ref}`)
  const next = { ...author }
  if (typeof input?.name === 'string' && input.name.trim()) next.name = input.name.trim()
  if (typeof input?.description === 'string') next.description = input.description.trim()
  if (input?.identity) {
    next.identity = { ...(next.identity || {}), ...input.identity }
    if (!Array.isArray(next.identity.domain_ids)) next.identity.domain_ids = []
    if (!Array.isArray(next.identity.family_ids)) next.identity.family_ids = []
    if (!Array.isArray(next.identity.form_ids)) next.identity.form_ids = []
  }
  if (typeof input?.language === 'string' && input.language.trim()) next.language = input.language === 'zh' ? 'zh-CN' : input.language.trim()
  if (typeof input?.risk_strategy === 'string' && ['strict', 'balanced', 'permissive'].includes(input.risk_strategy)) next.risk_strategy = input.risk_strategy
  if (typeof input?.status === 'string' && ['draft', 'ready', 'archived'].includes(input.status)) next.status = input.status
  updateSoulAuthorInStore(next)
  return { ok: true, author: enrichSoulAuthor(next) }
}
const duplicateSoulAuthor = ref => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`未找到Soul作者: ${ref}`)
  const store = readSoulStore()
  let newName = `${author.name}（副本）`
  let slug = slugify(newName)
  const existing = new Set((store.authors || []).map(a => a.slug))
  let suffix = 2
  while (existing.has(slug)) {
    newName = `${author.name}（副本${suffix}）`
    slug = `${slugify(author.name)}-copy-${suffix++}`
  }
  const copy = {
    id: soulId('author'),
    slug,
    name: newName,
    description: author.description,
    identity: author.identity ? { ...author.identity, domain_ids: [...(author.identity.domain_ids || [])], family_ids: [...(author.identity.family_ids || [])], form_ids: [...(author.identity.form_ids || [])] } : { kind: 'person', role_id: '', domain_ids: [], family_ids: [], form_ids: [] },
    language: author.language || 'zh-CN',
    risk_strategy: author.risk_strategy || 'balanced',
    status: 'draft',
    created_at: soulNow(),
    updated_at: soulNow(),
    folder: path.join(soulAuthorsRoot(), slug),
    sources: author.sources ? [...author.sources] : [],
    candidates: []
  }
  ensureSoulAuthorFolders(copy)
  try {
    const sourceProfile = soulJson(author, 'soul_profile.json', null)
    if (sourceProfile) writeSoulJson(copy, 'soul_profile.json', sourceProfile)
    const sourceCitations = soulJson(author, 'citations.json', null)
    if (sourceCitations) writeSoulJson(copy, 'citations.json', sourceCitations)
  } catch {}
  writeSoulStore({ ...store, active_author_id: copy.id, authors: [...(store.authors || []), copy] })
  soulLog(copy, 'duplicate', { note: `从 ${author.id} 复制`, source_id: author.id })
  return { ok: true, author: enrichSoulAuthor(copy) }
}
const archiveSoulAuthor = ref => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`未找到Soul作者: ${ref}`)
  const next = { ...author, status: 'archived' }
  updateSoulAuthorInStore(next)
  soulLog(next, 'archive', { note: '归档' })
  return { ok: true, author: enrichSoulAuthor(next) }
}
const unarchiveSoulAuthor = ref => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`未找到Soul作者: ${ref}`)
  const next = { ...author, status: author.texts_count > 0 ? 'ready' : 'draft' }
  updateSoulAuthorInStore(next)
  soulLog(next, 'unarchive', { note: '取消归档' })
  return { ok: true, author: enrichSoulAuthor(next) }
}
const listSoulSources = ref => {
  let author = findSoulAuthor(ref)
  if (!author) throw new Error(`未找到Soul作者: ${ref}`)
  author = syncSoulSourcesStatus(author)
  return { ok: true, sources: author.sources || [] }
}

const addSoulSource = (ref, input) => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`未找到Soul作者: ${ref}`)
  const kind = String(input?.kind || 'file').trim()
  const label = String(input?.label || '').trim()
  if (!label) throw new Error('资料源名称不能为空。')
  const originalLocation = String(input?.original_location || '').trim()
  const copyrightStatus = String(input?.copyright_status || 'unknown').trim()
  const now = soulNow()
  const sourceBase = {
    id: soulId('source'),
    soul_id: author.id,
    kind,
    label,
    original_location: originalLocation,
    copyright_status: copyrightStatus,
    parser: null,
    file_count: 0,
    chunk_count: 0,
    created_at: now,
    updated_at: now,
    indexed_at: null,
    completed_at: null,
    error: null,
    warnings: [],
    files: []
  }
  let source = null
  let createdJobs = []
  try {
    if (kind === 'knowledge_library') {
      source = {
        ...sourceBase,
        status: 'indexed',
        indexed_at: now,
        library_id: String(input?.library_id || '').trim()
      }
    } else if (kind === 'file') {
      if (!originalLocation || !fs.existsSync(originalLocation)) {
        throw new Error('文件不存在或路径无效。')
      }
      if (!fs.statSync(originalLocation).isFile()) {
        throw new Error('指定的路径不是文件。')
      }
      const job = ingestService.createJob({
        kind: 'local_file',
        path: path.resolve(originalLocation),
        original_name: path.basename(originalLocation)
      }, { intent: 'soul_ingest' })
      createdJobs.push(job.job_id)
      source = {
        ...sourceBase,
        status: 'parsing',
        ingest_job_id: job.job_id,
        job_status: job.status,
        file_count: 1,
        files: [path.resolve(originalLocation)]
      }
    } else if (kind === 'folder') {
      if (!originalLocation || !fs.existsSync(originalLocation)) {
        throw new Error('文件夹不存在或路径无效。')
      }
      if (!fs.statSync(originalLocation).isDirectory()) {
        throw new Error('指定的路径不是文件夹。')
      }
      const files = scanSoulSourceFolder(originalLocation)
      if (files.length === 0) {
        throw new Error('文件夹中未找到支持的文件类型（.md, .txt, .pdf, .docx）。')
      }
      const jobIds = []
      for (const file of files.slice(0, 50)) {
        try {
          const job = ingestService.createJob({
            kind: 'local_file',
            path: file,
            original_name: path.basename(file)
          }, { intent: 'soul_ingest_folder' })
          jobIds.push(job.job_id)
        } catch (jobErr) {}
      }
      source = {
        ...sourceBase,
        status: jobIds.length > 0 ? 'parsing' : 'failed',
        ingest_job_ids: jobIds,
        ingest_job_id: jobIds[0] || null,
        file_count: files.length,
        files: files.slice(0, 200)
      }
    } else if (kind === 'url') {
      if (!originalLocation) {
        throw new Error('URL不能为空。')
      }
      if (!/^https?:\/\//i.test(originalLocation)) {
        throw new Error('URL必须以http://或https://开头。')
      }
      source = {
        ...sourceBase,
        status: 'parsing',
        ingest_job_id: null
      }
      httpFetchUrlText(originalLocation, 20000).then(({ text }) => {
        if (text && String(text).trim()) {
          try {
            const currentAuthor = findSoulAuthor(author.id)
            if (!currentAuthor) return
            const imported = importIngestedTextToSoul(currentAuthor, label, text, {
              title: label,
              source: 'soul_source_url',
              source_url: originalLocation,
              copyright_status: copyrightStatus
            })
            if (imported) {
              const updatedSources = (currentAuthor.sources || []).map(s =>
                s.id === source.id ? {
                  ...s,
                  status: 'indexed',
                  chunk_count: Math.ceil(String(text).length / 1200),
                  parser: 'html_text_extract',
                  indexed_at: soulNow(),
                  completed_at: soulNow(),
                  imported_text_id: imported.id,
                  _text_imported: true
                } : s
              )
              updateSoulAuthorInStore({ ...currentAuthor, sources: updatedSources })
            }
          } catch (importErr) {}
        } else {
          try {
            const currentAuthor = findSoulAuthor(author.id)
            if (!currentAuthor) return
            const updatedSources = (currentAuthor.sources || []).map(s =>
              s.id === source.id ? { ...s, status: 'failed', error: '未能从URL抓取到有效内容', completed_at: soulNow() } : s
            )
            updateSoulAuthorInStore({ ...currentAuthor, sources: updatedSources })
          } catch {}
        }
      }).catch(fetchErr => {
        try {
          const currentAuthor = findSoulAuthor(author.id)
          if (!currentAuthor) return
          const updatedSources = (currentAuthor.sources || []).map(s =>
            s.id === source.id ? { ...s, status: 'failed', error: fetchErr.message || 'URL抓取失败', completed_at: soulNow() } : s
          )
          updateSoulAuthorInStore({ ...currentAuthor, sources: updatedSources })
        } catch {}
      })
    } else {
      throw new Error(`不支持的资料源类型: ${kind}`)
    }
  } catch (err) {
    if (createdJobs.length > 0) {
      for (const jid of createdJobs) {
        try { ingestService.cancelJob(jid) } catch {}
      }
    }
    throw err
  }
  if (!source) {
    throw new Error('创建资料源失败。')
  }
  const next = { ...author, sources: [...(author.sources || []), source] }
  updateSoulAuthorInStore(next)
  soulLog(next, 'source-add', { note: `添加资料源: ${label} (${kind})` })
  const synced = syncSoulSourcesStatus(next)
  const savedSource = (synced.sources || []).find(s => s.id === source.id) || source
  return { ok: true, source: savedSource, author: enrichSoulAuthor(synced) }
}

const deleteSoulSource = (ref, sourceId) => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`未找到Soul作者: ${ref}`)
  const source = (author.sources || []).find(s => s.id === sourceId)
  if (source) {
    if (source.ingest_job_id) {
      try { ingestService.cancelJob(source.ingest_job_id) } catch {}
    }
    if (Array.isArray(source.ingest_job_ids)) {
      for (const jid of source.ingest_job_ids) {
        try { ingestService.cancelJob(jid) } catch {}
      }
    }
  }
  const sources = (author.sources || []).filter(s => s.id !== sourceId)
  if (sources.length === (author.sources || []).length) throw new Error(`未找到资料源: ${sourceId}`)
  const next = { ...author, sources }
  updateSoulAuthorInStore(next)
  soulLog(next, 'source-delete', { note: `删除资料源: ${sourceId}` })
  return { ok: true, author: enrichSoulAuthor(next) }
}

const reindexSoulSource = (ref, sourceId) => {
  let author = findSoulAuthor(ref)
  if (!author) throw new Error(`未找到Soul作者: ${ref}`)
  const existing = (author.sources || []).find(s => s.id === sourceId)
  if (!existing) throw new Error(`未找到资料源: ${sourceId}`)
  let newJobId = null
  let newJobIds = []
  try {
    if (existing.kind === 'file' && existing.original_location && fs.existsSync(existing.original_location)) {
      const job = ingestService.createJob({
        kind: 'local_file',
        path: path.resolve(existing.original_location),
        original_name: path.basename(existing.original_location)
      }, { intent: 'soul_reingest' })
      newJobId = job.job_id
    } else if (existing.kind === 'folder' && existing.original_location) {
      const files = scanSoulSourceFolder(existing.original_location)
      for (const file of files.slice(0, 50)) {
        try {
          const job = ingestService.createJob({
            kind: 'local_file',
            path: file,
            original_name: path.basename(file)
          }, { intent: 'soul_reingest_folder' })
          newJobIds.push(job.job_id)
        } catch {}
      }
    } else if (existing.kind === 'url' && existing.original_location) {
      httpFetchUrlText(existing.original_location, 20000).then(({ text }) => {
        if (text && String(text).trim()) {
          try {
            const currentAuthor = findSoulAuthor(author.id)
            if (!currentAuthor) return
            const imported = importIngestedTextToSoul(currentAuthor, existing.label, text, {
              title: existing.label,
              source: 'soul_source_url_reindex',
              source_url: existing.original_location,
              copyright_status: existing.copyright_status
            })
            const updatedSources = (currentAuthor.sources || []).map(s =>
              s.id === sourceId ? {
                ...s,
                status: 'indexed',
                chunk_count: Math.ceil(String(text).length / 1200),
                parser: 'html_text_extract',
                indexed_at: soulNow(),
                completed_at: soulNow(),
                _text_imported: imported ? true : s._text_imported,
                imported_text_id: imported?.id || s.imported_text_id,
                error: null
              } : s
            )
            updateSoulAuthorInStore({ ...currentAuthor, sources: updatedSources })
          } catch {}
        }
      }).catch(() => {})
    }
  } catch (err) {}
  const now = soulNow()
  const sources = (author.sources || []).map(s => s.id === sourceId ? {
    ...s,
    indexed_at: null,
    completed_at: null,
    status: 'parsing',
    updated_at: now,
    ingest_job_id: newJobId || s.ingest_job_id,
    ingest_job_ids: newJobIds.length > 0 ? newJobIds : s.ingest_job_ids,
    error: null,
    chunk_count: 0,
    warnings: []
  } : s)
  let next = { ...author, sources }
  updateSoulAuthorInStore(next)
  next = syncSoulSourcesStatus(next)
  soulLog(next, 'source-reindex', { note: `重新索引资料源: ${sourceId}` })
  return { ok: true, message: '重新索引任务已提交', author: enrichSoulAuthor(next) }
}
const updateSoulAttribute = (ref, attributeId, input) => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`未找到Soul作者: ${ref}`)
  const profile = soulJson(author, 'soul_profile.json', defaultSoulProfile(author.name))
  if (!Array.isArray(profile.attributes)) profile.attributes = []
  let attr = profile.attributes.find(a => a.id === attributeId)
  if (!attr) {
    attr = { id: attributeId, summary: '', tags: [], confidence: 0.5, risk_level: 'low', disabled: false, evidence_refs: [], created_at: soulNow(), updated_at: soulNow() }
    profile.attributes.push(attr)
  }
  if (typeof input?.summary === 'string') attr.summary = input.summary
  if (Array.isArray(input?.tags)) attr.tags = input.tags
  if (typeof input?.confidence === 'number') attr.confidence = Math.max(0, Math.min(1, input.confidence))
  if (typeof input?.risk_level === 'string') attr.risk_level = input.risk_level
  if (typeof input?.disabled === 'boolean') attr.disabled = input.disabled
  attr.updated_at = soulNow()
  writeSoulJson(author, 'soul_profile.json', profile)
  soulLog(author, 'attribute-update', { note: `更新属性: ${attributeId}` })
  return { ok: true, attribute: attr, author: enrichSoulAuthor(author) }
}
const disableSoulAttribute = (ref, attributeId) => updateSoulAttribute(ref, attributeId, { disabled: true })
const enableSoulAttribute = (ref, attributeId) => updateSoulAttribute(ref, attributeId, { disabled: false })
const distillSoulAttribute = (ref, attributeId) => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`未找到Soul作者: ${ref}`)
  soulLog(author, 'attribute-distill', { note: `蒸馏属性: ${attributeId}` })
  return { ok: true, message: '蒸馏任务已提交', attribute_id: attributeId }
}
const getSoulAttributeEvidence = (ref, attributeId) => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`未找到Soul作者: ${ref}`)
  const profile = soulJson(author, 'soul_profile.json', defaultSoulProfile(author.name))
  const attr = (profile.attributes || []).find(a => a.id === attributeId)
  if (!attr) throw new Error(`未找到属性: ${attributeId}`)
  const evidence = []
  for (const refId of attr.evidence_refs || []) {
    if (refId.startsWith('chunk:')) {
      const chunkId = refId.slice(6)
      const chunk = readSoulChunks(author).find(c => c.chunk_id === chunkId)
      if (chunk) evidence.push({ ref: refId, type: 'chunk', title: chunk.title, snippet: chunk.summary, source_file: chunk.source_file, line_start: chunk.line_start })
    } else if (refId.startsWith('web:')) {
      const claimId = refId.slice(4)
      const claims = soulJson(author, 'web_research/extracted_claims.json', { items: [] }).items || []
      const claim = claims.find(c => c.id === claimId)
      if (claim) evidence.push({ ref: refId, type: 'web', title: claim.source_title, snippet: claim.evidence, source_url: claim.source_url })
    }
  }
  return { ok: true, evidence, attribute: attr }
}
const listSoulCandidates = ref => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`未找到Soul作者: ${ref}`)
  return { ok: true, candidates: author.candidates || [] }
}
const acceptSoulCandidate = (ref, candidateId) => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`未找到Soul作者: ${ref}`)
  const candidate = (author.candidates || []).find(c => c.id === candidateId)
  if (!candidate) throw new Error(`未找到候选版本: ${candidateId}`)
  const profile = soulJson(author, 'soul_profile.json', defaultSoulProfile(author.name))
  const currentVersion = profile.version || 1
  writeSoulJson(author, `soul_profile_v${currentVersion}_backup.json`, profile)
  if (candidate.profile) writeSoulJson(author, 'soul_profile.json', { ...candidate.profile, version: currentVersion + 1, updated_at: soulNow() })
  const candidates = (author.candidates || []).map(c => c.id === candidateId ? { ...c, status: 'accepted', accepted_at: soulNow() } : { ...c, status: c.status === 'pending' ? 'rejected' : c.status })
  const next = { ...author, candidates }
  updateSoulAuthorInStore(next)
  soulLog(next, 'candidate-accept', { note: `接受候选: ${candidateId}` })
  return { ok: true, author: enrichSoulAuthor(next) }
}
const rejectSoulCandidate = (ref, candidateId) => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`未找到Soul作者: ${ref}`)
  const candidates = (author.candidates || []).map(c => c.id === candidateId ? { ...c, status: 'rejected', rejected_at: soulNow() } : c)
  const next = { ...author, candidates }
  updateSoulAuthorInStore(next)
  soulLog(next, 'candidate-reject', { note: `拒绝候选: ${candidateId}` })
  return { ok: true, author: enrichSoulAuthor(next) }
}
const analyzeSoulImpact = ref => {
  const author = findSoulAuthor(ref)
  if (!author) throw new Error(`未找到Soul作者: ${ref}`)
  const currentProfile = soulJson(author, 'soul_profile.json', defaultSoulProfile(author.name))
  const pendingCandidate = (author.candidates || []).find(c => c.status === 'pending')
  return {
    ok: true,
    current_profile: currentProfile,
    latest_candidate: pendingCandidate?.profile || null,
    diff: pendingCandidate ? {
      added_attributes: (pendingCandidate.profile?.attributes || []).length - (currentProfile.attributes || []).length,
      updated_at: pendingCandidate.created_at
    } : null,
    message: pendingCandidate ? '有待审核的候选版本' : '暂无待审核的候选版本'
  }
}
const writerSlashCommandSpecs = [
  ['/kb', '\u641c\u7d22 Karna \u77e5\u8bc6\u5e93\uff1a/kb \u9f99\u65cf\u8bbe\u5b9a'],
  ['/kb-import', '\u5bfc\u5165\u5e76\u5411\u91cf\u5316 Markdown/TXT \u6587\u4ef6\u5939\uff1a/kb-import D:\\\\notes'],
  ['/kb-reindex', '\u91cd\u65b0\u7d22\u5f15\u6240\u6709\u77e5\u8bc6\u5e93\u6587\u4ef6\u5939'],
  ['/writer-skills', '\u5217\u51fa Karna \u5185\u7f6e\u5199\u4f5c\u6280\u80fd'],
  ['/skill-read', '\u8bfb\u53d6\u5185\u7f6e/\u672c\u5730\u6280\u80fd\uff1a/skill-read karna-fiction-architect'],
  ['/find-skill', '搜索本地技能：/find-skill 小说 人物'],
  ['/create-skill', '创建新技能：/create-skill 名称 :: 描述 :: 步骤'],
  ['/outline', '\u6839\u636e\u4e00\u53e5\u8bdd premise \u751f\u6210\u4e09\u5e55\u5f0f\u5927\u7eb2'],
  ['/character', '\u6839\u636e\u7b80\u8ff0\u521b\u5efa\u4eba\u7269\u5361\u548c\u6210\u957f\u5f27'],
  ['/scene', '\u8bca\u65ad\u573a\u666f\u7684\u51b2\u7a81\u3001\u8282\u594f\u3001\u89c6\u89d2\u548c\u94a9\u5b50'],
  ['/poem', '\u6839\u636e\u610f\u8c61/\u4e3b\u9898/\u683c\u5f8b\u751f\u6210\u8bd7\u6b4c\u5de5\u4f5c\u574a\u65b9\u6848'],
  ['/paper', '\u6839\u636e\u4e3b\u9898\u6216\u8bba\u70b9\u521b\u5efa\u8bba\u6587\u7ed3\u6784'],
  ['/copy', '\u6839\u636e\u4ea7\u54c1\u548c\u53d7\u4f17\u751f\u6210\u8f6c\u5316\u6587\u6848\u53d8\u4f53'],
  ['/style', '\u4ece\u6837\u7a3f\u6216\u4fee\u6539\u8bb0\u5f55\u4e2d\u63d0\u53d6\u957f\u671f\u98ce\u683c\u89c4\u5219'],
  ['/canon', '\u5411\u9ed8\u8ba4\u77e5\u8bc6\u5e93\u8ffd\u52a0\u8bbe\u5b9a/\u4e16\u754c\u89c2\u7b14\u8bb0'],
  ['/project-new', '\u521b\u5efa\u6301\u4e45\u5316\u5199\u4f5c\u9879\u76ee\uff1a/project-new novel: Title'],
  ['/project-list', '\u5217\u51fa\u5199\u4f5c\u9879\u76ee'],
  ['/project-open', '\u6309 slug/id/title \u6253\u5f00\u9879\u76ee'],
  ['/project-status', '\u663e\u793a\u5f53\u524d\u9879\u76ee\u6587\u4ef6\u548c\u76ee\u5f55'],
  ['/chapter', '\u4fdd\u5b58\u7ae0\u8282\u5230\u5f53\u524d\u9879\u76ee\uff1a/chapter \u6807\u9898 :: \u6b63\u6587'],
  ['/char-save', '\u4fdd\u5b58\u4eba\u7269\u7b14\u8bb0\u5230\u5f53\u524d\u9879\u76ee'],
  ['/world-save', '\u4fdd\u5b58\u4e16\u754c\u89c2/\u8bbe\u5b9a\u7b14\u8bb0\u5230\u5f53\u524d\u9879\u76ee'],
  ['/research-save', '\u4fdd\u5b58\u8d44\u6599\u7b14\u8bb0\u5230\u5f53\u524d\u9879\u76ee'],
  ['/export-project', '\u5bfc\u51fa\u5f53\u524d\u9879\u76ee\u4e3a Markdown']
]

const writerCommandsCatalog = () => ({
  categories: [
    { name: 'Karna \u5199\u4f5c', pairs: writerSlashCommandSpecs },
    { name: 'Karna \u5185\u7f6e MCP', pairs: [['/karna-tools', '\u5217\u51fa Karna \u5185\u7f6e\u5199\u4f5c MCP \u5de5\u5177']] }
  ],
  pairs: writerSlashCommandSpecs,
  skill_count: writerSlashCommandSpecs.length + 1
})

const parseSlashInput = input => {
  const text = String(input || '').trim().replace(/^\/+/, '')
  const [name = '', ...rest] = text.split(/\s+/)
  return { name: name.toLowerCase(), arg: rest.join(' ').trim(), raw: text }
}

const mdBullet = items => items.map(item => `- ${item}`).join('\n')
const saveMarkdownArtifact = (title, content, command) => recordArtifact({ type: 'markdown', title, content, metadata: { command } })

const writerOutlineMarkdown = premise => `# Manuscript Outline\n\nPremise: ${premise || '(add premise)'}\n\n## Act I - Invitation and wound\n${mdBullet(['Opening image and ordinary world', 'Protagonist desire, wound, contradiction', 'Inciting disturbance that cannot be ignored', 'First irreversible choice into the story world'])}\n\n## Act II - Pressure and reversal\n${mdBullet(['Promise of the premise scenes', 'Antagonistic pressure escalates', 'Midpoint revelation changes the meaning of the goal', 'Cost of desire becomes personal and public'])}\n\n## Act III - Choice and aftermath\n${mdBullet(['False solution collapses', 'Final choice resolves inner contradiction', 'External conflict resolves through earned action', 'Aftermath image proves what changed'])}\n`

const writerCharacterMarkdown = brief => `# Character Card\n\nBrief: ${brief || '(add character seed)'}\n\n- Surface role:\n- Secret desire:\n- Fear / wound:\n- Public mask:\n- Contradiction that makes them human:\n- Voice markers:\n- Relationship pressure points:\n- Lie believed at start:\n- Choice that proves change:\n\n## Arc beats\n1. First impression.\n2. Pressure exposes contradiction.\n3. Temptation to regress.\n4. Costly truthful action.\n`

const writerSceneMarkdown = scene => `# Scene Doctor\n\nScene / brief:\n${scene || '(paste scene or describe it)'}\n\n## Diagnostic checklist\n${mdBullet(['What changes by the end of this scene?', 'What does the POV character want right now?', 'What blocks them?', 'Where does power shift?', 'Which sensory detail makes the scene uncopyable?', 'Does the final line create forward pull?'])}\n\n## Rewrite moves\n${mdBullet(['Enter later if setup is static', 'Make subtext conflict with spoken dialogue', 'Cut explanation after the reader can infer it', 'End on decision, image, or threat rather than summary'])}\n`

const writerPaperMarkdown = topic => `# Paper Structure\n\nTopic / claim: ${topic || '(add research claim)'}\n\n1. Problem: what gap or tension exists?\n2. Contribution: what is new and why now?\n3. Method / evidence: what would convince a skeptical reviewer?\n4. Related work map: camps, limitation, your bridge.\n5. Results / argument sequence.\n6. Threats, limitations, and honest scope.\n7. Abstract in four sentences: background, gap, method, finding.\n`

const writerCopyMarkdown = brief => `# Copy Variants\n\nBrief: ${brief || '(add product, audience, offer)'}\n\n## Angle map\n${mdBullet(['Pain-aware: name the costly problem', 'Outcome-aware: show the desired future', 'Proof-aware: evidence, demo, comparison', 'Objection-aware: price, risk, time, trust'])}\n\n## Draft blocks\n- Headline:\n- Subhead:\n- Proof point:\n- CTA:\n- Short email subject variants:\n`

const writerStyleMarkdown = sample => `# Style Rules\n\nSample / edit:\n${sample || '(paste sample or describe desired voice)'}\n\n## Extracted rule slots\n- Sentence rhythm:\n- Diction level:\n- Favorite moves:\n- Forbidden phrases:\n- Humor / irony:\n- Imagery pattern:\n- Revision rule: preserve voice before polishing grammar.\n`

const writerPoemMarkdown = brief => `# Poetry Workshop\n\nSeed: ${brief || '(add image/theme/form)'}\n\n- Core image:\n- Emotional turn:\n- Sound pattern:\n- Line-break strategy:\n- Concrete nouns to keep:\n- Abstract words to challenge:\n- Last line pressure test: does it open, cut, or echo?\n`

const appendCanonNote = async note => {
  const configStore = readKnowledgeConfig()
  const folder = configStore.config?.folders?.[0] || getKnowledgeDefaultFolder()
  fs.mkdirSync(folder, { recursive: true })
  const file = path.join(folder, 'karna-canon-inbox.md')
  const entry = `\n\n## ${new Date().toISOString()}\n\n${String(note || '').trim() || '(empty canon note)'}\n`
  fs.appendFileSync(file, entry, 'utf8')
  try {
    const indexed = await indexKnowledgeFolder(folder, configStore.config || {})
    return { file, indexed, message: `Canon note saved and indexed: ${file}` }
  } catch (err) {
    return { file, indexed: null, message: `Canon note saved to ${file}. Configure a usable Embedding model, then run /kb-reindex to vectorize it. (${err instanceof Error ? err.message : String(err)})` }
  }
}

const executeWriterSlash = async input => {
  const { name, arg, raw } = parseSlashInput(input)
  if (name === 'kb') {
    const result = await searchKnowledge(arg, { limit: 6, allowLexical: true })
    if (!result.results?.length) return { output: `No knowledge matches for: ${arg || '(empty query)'}` }
    const body = result.results.map((row, i) => `## ${i + 1}. ${row.title || path.basename(row.path || '')} (${Number(row.score || 0).toFixed(3)})\n${String(row.text || '').slice(0, 900)}`).join('\n\n')
    return { output: `# Knowledge results for: ${arg}\n\n${body}` }
  }
  if (name === 'kb-import') {
    const result = await indexKnowledgeFolder(arg)
    return { output: `Knowledge imported: ${result.files} files, ${result.chunks} chunks from ${result.folder}.` }
  }
  if (name === 'kb-reindex') {
    const configStore = readKnowledgeConfig()
    const folders = Array.isArray(configStore.config?.folders) && configStore.config.folders.length ? configStore.config.folders : [getKnowledgeDefaultFolder()]
    const rows = []
    for (const folder of folders) rows.push(await indexKnowledgeFolder(folder, configStore.config || {}))
    return { output: rows.map(row => `${row.folder}: ${row.files} files, ${row.chunks} chunks`).join('\n') || 'No knowledge folders configured.' }
  }
  if (name === 'writer-skills') return { output: managedSkills.listWriterSkills().map(skill => `- ${skill.name}: ${skill.description}`).join('\n') }
  if (name === 'skill-read') {
    const result = managedSkills.readSkillByName(arg)
    return { output: result.ok ? result.content : result.error }
  }
  if (name === 'find-skill') {
    const result = managedSkills.searchSkills(arg)
    return { output: result.skills.length ? result.skills.map(skill => `- ${skill.name}: ${skill.description}\n  ${skill.path}\n  ${skill.reason}`).join('\n') : `没有找到匹配技能：${arg}` }
  }
  if (name === 'create-skill') {
    const [rawName, rawDesc, ...rest] = arg.split(/\s+::\s+/)
    const result = managedSkills.createSkill({ name: rawName, description: rawDesc || `用户创建的技能：${rawName}`, instructions: rest.join(' :: ') })
    return { output: result.ok ? `已创建技能：${result.name}\n${result.path}` : `创建失败：${result.error}` }
  }
  if (name === 'karna-tools') return { output: BUILTIN_MCP_SERVERS['karna-writer'].tools.map(tool => `- ${tool}`).join('\n') }
  const generators = {
    outline: ['Manuscript Outline', writerOutlineMarkdown],
    character: ['Character Card', writerCharacterMarkdown],
    scene: ['Scene Doctor', writerSceneMarkdown],
    poem: ['Poetry Workshop', writerPoemMarkdown],
    paper: ['Paper Structure', writerPaperMarkdown],
    copy: ['Copy Variants', writerCopyMarkdown],
    style: ['Style Rules', writerStyleMarkdown]
  }
  if (generators[name]) {
    const [title, fn] = generators[name]
    const content = fn(arg)
    const artifact = saveMarkdownArtifact(title, content, raw)
    return { output: `${content}\n\nArtifact saved: ${artifact.id}` }
  }
  if (name === 'canon') {
    const saved = await appendCanonNote(arg)
    return { output: saved.message }
  }
  if (name === 'project-new') {
    const project = await createWriterProject(arg)
    return { output: `Created writing project: ${project.title} (${project.type})\nFolder: ${project.folder}\nActive project: ${project.slug}` }
  }
  if (name === 'project-list') return { output: writerProjectListMarkdown() }
  if (name === 'project-open') {
    const project = setActiveWriterProject(arg)
    return { output: project ? `Active project: ${project.title} (${project.slug})` : `Project not found: ${arg}` }
  }
  if (name === 'project-status') return { output: writerProjectStatusMarkdown(arg) }
  const saveCommandMap = { chapter: 'chapter', 'char-save': 'character', 'world-save': 'world', 'research-save': 'research' }
  if (saveCommandMap[name]) {
    const [rawTitle, ...rest] = arg.split(/\s+::\s+/)
    const title = (rawTitle || saveCommandMap[name]).trim()
    const content = (rest.join(' :: ') || rawTitle || '').trim()
    const saved = saveWriterProjectFile({ kind: saveCommandMap[name], title, content })
    return { output: `Saved ${saved.kind}: ${saved.title}\n${saved.file}` }
  }
  if (name === 'export-project') {
    const exported = exportWriterProject(arg)
    return { output: `Exported ${exported.project.title}: ${exported.chapters} chapters\n${exported.file}\nArtifact: ${exported.artifact.id}` }
  }
  return null
}

const completeWriterSlash = text => {
  const raw = String(text || '')
  const token = raw.trim().replace(/^\//, '').toLowerCase()
  if (!token || !token.includes(' ')) {
    const prefix = token.split(/\s+/, 1)[0]
    const items = writerSlashCommandSpecs
      .concat([['/karna-tools', 'Karna \u5185\u7f6e\u5199\u4f5c MCP \u5de5\u5177']])
      .filter(([cmd]) => cmd.slice(1).startsWith(prefix))
      .map(([cmd, meta]) => ({ text: cmd, display: cmd, meta }))
    return { items, replace_from: 1 }
  }
  if (token.startsWith('find-skill ')) return { items: managedSkills.searchSkills(raw.replace(/^\//, '').replace(/^find-skill\s+/i, '')).skills.map(skill => ({ text: skill.name, display: skill.name, meta: skill.description || skill.path })), replace_from: '/find-skill '.length }
  if (token.startsWith('skill-read ')) {
    const arg = raw.replace(/^\//, '').replace(/^skill-read\s+/i, '').toLowerCase()
    const items = managedSkills.scanSkills().filter(skill => skill.name.toLowerCase().includes(arg)).slice(0, 20).map(skill => ({ text: skill.name, display: skill.name, meta: skill.description || skill.path }))
    return { items, replace_from: '/skill-read '.length }
  }
  if (token.startsWith('project-open ') || token.startsWith('project-status ') || token.startsWith('export-project ')) {
    const command = token.split(/\s+/, 1)[0]
    const arg = raw.replace(/^\//, '').replace(new RegExp(`^${command}\s+`, 'i'), '').toLowerCase()
    const items = (readWriterProjects().projects || []).filter(project => `${project.slug} ${project.title}`.toLowerCase().includes(arg)).slice(0, 20).map(project => ({ text: project.slug, display: project.title, meta: `${project.type} - ${project.folder}` }))
    return { items, replace_from: `/${command} `.length }
  }
  return { items: [], replace_from: 1 }
}


// ---------------------------------------------------------------------------
// WebSocket Bridge (JSON-RPC 2.0 → Karna REST)
// ---------------------------------------------------------------------------

function startWsBridge() {
  return new Promise((resolve, reject) => {
    wsBridgeServer = new WebSocketServer({
      host: WS_BRIDGE_HOST,
      port: WS_BRIDGE_PORT,
      perMessageDeflate: false
    })

    wsBridgeServer.on('listening', () => {
      rememberLog(`WS Bridge listening on ${wsBridgeUrl}`)
      resolve()
    })

    wsBridgeServer.on('error', err => {
      rememberLog(`WS Bridge error: ${err.message}`)
      reject(err)
    })

    wsBridgeServer.on('connection', socket => {
      rememberLog('Frontend connected to WS Bridge')
      socket.on('message', async raw => {
        let frame
        try {
          frame = JSON.parse(raw.toString())
        } catch {
          return
        }
        try {
          await handleJsonRpcCall(socket, frame)
        } catch (err) {
          rememberLog(`RPC error: ${err.message}`)
          if (frame.id != null) {
            sendJsonRpcError(socket, frame.id, -32603, err.message)
          }
        }
      })
      socket.on('close', () => {
        rememberLog('Frontend disconnected from WS Bridge')
      })
      socket.on('error', err => {
        rememberLog(`WS socket error: ${err.message}`)
      })
    })
  })
}

function sendJsonRpcResult(socket, id, result) {
  socket.send(JSON.stringify({ jsonrpc: '2.0', result, id }))
}

function sendJsonRpcError(socket, id, code, message) {
  socket.send(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id }))
}

function sendGatewayEvent(socket, sessionId, eventType, payload) {
  socket.send(
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'event',
      params: {
        type: eventType,
        session_id: sessionId,
        payload
      }
    })
  )
}

/**
 * Handle a JSON-RPC 2.0 call from the frontend.
 */
async function handleJsonRpcCall(socket, frame) {
  const { method, params, id } = frame
  const p = params || {}
  const sessionId = p.session_id || p.sessionId || 'default'

  switch (method) {
    case 'prompt.submit': {
      await handlePromptSubmit(socket, id, p)
      break
    }

    case 'session.create': {
      const newId = `karna-${Date.now()}-${nextSessionNum++}`
      const session = {
        id: newId,
        title: p.title || '\u65b0\u4f1a\u8bdd',
        created: nowSeconds(),
        updated: nowSeconds(),
        message_count: 0,
        archived: false,
        source: 'tui',
        provider: p.provider || currentModelProvider,
        model: p.model || currentModel,
        profile: 'default',
        cwd: p.cwd || karnaConfig?.terminal?.cwd || process.cwd(),
        project_id: p.project_id || p.writer_project_id || null,
        project_title: p.project_title || null,
        agent_id: p.agent_id || null,
        agent_name: p.agent_name || null,
        agent_role: p.agent_role || null,
        system_context: p.system_context || '',
        conversation_scope: p.conversation_scope || (p.project_id || p.writer_project_id ? 'project' : 'standalone'),
        workspace_id: p.workspace_id || p.project_id || p.writer_project_id || null,
        writer_project_id: p.writer_project_id || p.project_id || null,
        permission_mode: p.permission_mode || 'restricted'
      }
      sessions.set(newId, session)
      sessionMessages.set(newId, [])

      if (session.writer_project_id && p.set_primary !== false) {
        try {
          const wpStore = readWriterProjects()
          const wpProject = (wpStore.projects || []).find(pp => pp.id === session.writer_project_id)
          if (wpProject && !wpProject.main_session_id) {
            const updatedWp = {
              ...wpProject,
              main_session_id: newId,
              session_ids: Array.from(new Set([...(wpProject.session_ids || []), newId])),
              agent_session_ids: {
                ...(wpProject.agent_session_ids || {}),
                controller: newId
              },
              updated_at: new Date().toISOString()
            }
            writeWriterProjects({
              ...wpStore,
              projects: (wpStore.projects || []).map(pp => pp.id === session.writer_project_id ? updatedWp : pp)
            })
            try {
              const agentDataPath = path.join(writerProjectDataPath(wpProject), 'writer_agents.json')
              if (fs.existsSync(agentDataPath)) {
                const agentsRaw = JSON.parse(fs.readFileSync(agentDataPath, 'utf8'))
                const updatedAgents = (agentsRaw.agents || []).map(agent => {
                  if (agent.id === 'controller') {
                    return { ...agent, session_id: newId }
                  }
                  return agent
                })
                fs.writeFileSync(agentDataPath, JSON.stringify({ ...agentsRaw, agents: updatedAgents }, null, 2), 'utf8')
              }
            } catch { /* ignore */ }
          } else if (wpProject) {
            const updatedWp = {
              ...wpProject,
              session_ids: Array.from(new Set([...(wpProject.session_ids || []), newId])),
              updated_at: new Date().toISOString()
            }
            writeWriterProjects({
              ...wpStore,
              projects: (wpStore.projects || []).map(pp => pp.id === session.writer_project_id ? updatedWp : pp)
            })
          }
        } catch { /* ignore project binding errors */ }
      }

      sendGatewayEvent(socket, newId, 'session.info', sessionInfoPayload(session))
      sendJsonRpcResult(socket, id, {
        session_id: newId,
        stored_session_id: newId,
        message_count: 0,
        messages: [],
        info: sessionInfoPayload(session),
        session: storedSessionInfo(session)
      })
      break
    }

    case 'session.resume': {
      const sid = p.session_id || p.id
      const session = sessions.get(sid)
      if (session) {
        const messages = sessionMessages.get(sid) || []
        sendGatewayEvent(socket, sid, 'session.info', sessionInfoPayload(session))
        sendJsonRpcResult(socket, id, { resumed: sid, session_id: sid, message_count: messages.length, info: sessionInfoPayload(session), messages })
      } else {
        sendJsonRpcError(socket, id, -32000, `Session not found: ${sid}`)
      }
      break
    }

    case 'session.close': {
      sendJsonRpcResult(socket, id, { ok: true })
      break
    }

    case 'session.interrupt': {
      sendJsonRpcResult(socket, id, { ok: true })
      break
    }

    case 'session.steer': {
      sendJsonRpcResult(socket, id, { ok: true })
      break
    }

    case 'session.title': {
      const sid = p.session_id || p.id
      const session = sessions.get(sid)
      if (session && p.title) {
        session.title = p.title
        session.updated = Date.now() / 1000
      }
      sendJsonRpcResult(socket, id, { ok: true })
      break
    }

    case 'session.usage': {
      sendJsonRpcResult(socket, id, {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        cost: 0
      })
      break
    }

    case 'model.options': {
      sendJsonRpcResult(socket, id, getModelOptionsPayload())
      break
    }

    case 'complete.path': {
      sendJsonRpcResult(socket, id, { items: [] })
      break
    }

    case 'process.list': {
      sendJsonRpcResult(socket, id, { processes: [] })
      break
    }

    case 'process.kill': {
      sendJsonRpcResult(socket, id, { ok: true })
      break
    }

    case 'config.get': {
      sendJsonRpcResult(socket, id, publicKarnaConfig())
      break
    }

    case 'config.set': {
      if (p.key === 'model' && typeof p.value === 'string') {
        const match = p.value.match(/^(.*?)\s+--provider\s+(\S+)$/)
        const model = (match ? match[1] : p.value).trim()
        const provider = (match ? match[2] : currentModelProvider).trim()
        const sid = p.session_id || p.sessionId
        if (sid && sessions.has(sid)) {
          const session = sessions.get(sid)
          session.model = model
          session.provider = provider
          session.updated = Date.now() / 1000
          sendGatewayEvent(socket, sid, 'session.info', sessionInfoPayload(session))
        } else {
          currentModel = model
          currentModelProvider = provider
        }
      } else if (p.config) {
        if (p.config.mcp_servers) writeMcpServers(p.config.mcp_servers)
        const { mcp_servers, ...restConfig } = p.config
        karnaConfig = { ...karnaConfig, ...stripLegacyPersonalityConfig(restConfig) }
      }
      sendJsonRpcResult(socket, id, { ok: true })
      break
    }

    case 'image.attach':
    case 'image.attach_bytes':
    case 'image.detach':
    case 'file.attach': {
      sendJsonRpcResult(socket, id, { ok: true })
      break
    }

    case 'complete.slash': {
      sendJsonRpcResult(socket, id, completeWriterSlash(p.text || p.query || ''))
      break
    }

    case 'slash.exec': {
      const result = await executeWriterSlash(p.command || '')
      sendJsonRpcResult(socket, id, result || { output: `Unknown slash command: ${p.command || ''}`, error: null })
      break
    }

    case 'command.dispatch': {
      const result = await executeWriterSlash(`${p.name || ''}${p.arg ? ` ${p.arg}` : ''}`)
      sendJsonRpcResult(socket, id, result || { type: 'exec', output: `Unknown command: ${p.name || ''}` })
      break
    }

    case 'commands.catalog': {
      sendJsonRpcResult(socket, id, writerCommandsCatalog())
      break
    }

    case 'reload.mcp': {
      const servers = mcpServerList()
      sendJsonRpcResult(socket, id, { ok: true, servers: servers.length, enabled: servers.filter(server => server.enabled !== false).length, config_path: backendDataPath('mcp_servers.json') })
      break
    }

    case 'browser.manage': {
      sendJsonRpcResult(socket, id, { ok: true })
      break
    }

    case 'handoff.request': {
      sendJsonRpcResult(socket, id, { ok: true })
      break
    }

    // ---- Setup / Runtime probes (mock) ----
    case 'setup.status': {
      sendJsonRpcResult(socket, id, {
        status: backendReady ? 'running' : 'starting',
        version: '0.1.0',
        uptime: process.uptime(),
        backend: backendReady ? 'connected' : 'mock',
        mode: 'local',
        auth_mode: 'token'
      })
      break
    }

    case 'setup.runtime_check': {
      sendJsonRpcResult(socket, id, {
        ok: true,
        checks: {
          python: { found: true, version: '3.x' },
          backend: { reachable: backendReady },
          ws_bridge: { listening: true }
        },
        ready: backendReady
      })
      break
    }

    default:
      rememberLog(`Unknown RPC method: ${method}`)
      sendJsonRpcResult(socket, id, { ok: false, error: `Unsupported Karna RPC method: ${method}` })
      break
  }
}

const parseCoordinationMode = text => {
  const raw = String(text || '')
  if (/\u5168\u624b\u52a8|manual/i.test(raw)) return 'manual'
  if (/\u534a\u81ea\u52a8|semi/i.test(raw)) return 'semi'
  if (/\u5168\u81ea\u52a8|auto/i.test(raw)) return 'auto'
  return 'auto'
}

const coordinationModeLabel = mode => mode === 'manual' ? '\u5168\u624b\u52a8' : mode === 'semi' ? '\u534a\u81ea\u52a8' : '\u5168\u81ea\u52a8'

const setAgentTaskStatus = (project, taskIds, status, notes = '') => {
  const data = readTaskSystem(project)
  const now = new Date().toISOString()
  const idSet = new Set(taskIds)
  data.tasks = (data.tasks || []).map(task => idSet.has(task.id) ? { ...task, status, notes: notes || task.notes || '', updated_at: now } : task)
  data.monitor = { ...(data.monitor || {}), status: status === 'done' ? 'active' : status, updated_at: now, summary: `\u534f\u4f5c\u6a21\u5f0f\uff1a${coordinationModeLabel(data.coordination_mode || 'auto')}\uff1b\u4efb\u52a1\u72b6\u6001\u5df2\u66f4\u65b0\u3002` }
  return writeTaskSystem(project, data)
}

const agentTaskPrompt = (project, agent, tasks, mode) => `[task_system]\n\u4e3b\u63a7\u5df2\u5411\u4f60\u6d3e\u53d1\u4efb\u52a1\uff08\u534f\u4f5c\u6a21\u5f0f\uff1a${coordinationModeLabel(mode)}\uff09\uff1a\n${tasks.map(t => `- ${t.title}\uff1a${t.description}`).join('\n')}\n\n\u8bf7\u4f60\u4ee5\u201c${agent.name}\u201d\u8eab\u4efd\u8f93\u51fa\u6210\u679c\u3002\u5982\u9700\u8f93\u51fa\u4eba\u7269\u5173\u7cfb\u3001\u4e8b\u4ef6\u8054\u7cfb\u6216\u77e5\u8bc6\u56fe\u8c31\uff0c\u8bf7\u540c\u65f6\u7ed9\u51fa\u81ea\u7136\u8bed\u8a00\u7248\u548c\u5bb9\u9519 JSON \u7247\u6bb5\u3002\u4e0d\u8981\u7b49\u5f85\u7528\u6237\u518d\u5524\u8d77\u4f60\u3002`

const runAgentTask = async ({ socket, project, agent, tasks, mode, model, provider }) => {
  if (!agent.session_id || !tasks.length) return null
  const taskIds = tasks.map(t => t.id)
  const prompt = agentTaskPrompt(project, agent, tasks, mode)
  const session = sessions.get(agent.session_id) || ensureStoredSession({ id: agent.session_id, title: `${agent.name} \u00b7 ${project.title}`, cwd: project.folder, project, agent })
  const history = sessionMessages.get(agent.session_id) || []
  history.push({ role: 'user', content: prompt, timestamp: nowSeconds() })
  sessionMessages.set(agent.session_id, history)
  setAgentTaskStatus(project, taskIds, 'in_progress')
  if (session) { session.running = true; session.updated = nowSeconds(); session.preview = `\u6b63\u5728\u6267\u884c\uff1a${tasks[0]?.title || ''}`; sendGatewayEvent(socket, agent.session_id, 'session.info', sessionInfoPayload(session)) }
  sendGatewayEvent(socket, agent.session_id, 'message.start', { message_id: `task-${Date.now()}-${agent.id}`, role: 'assistant', model, provider })
  const projectContext = projectSessionContext(project, agent)
  const messages = soulPrompts.buildChatMessages({
    profile: session?.profile || 'default',
    projectContext,
    history,
    prompt: ''
  }).filter((message, index, rows) => !(index === rows.length - 1 && message.role === 'user' && message.content === ''))
  const response = await chatBackendFetch({ method: 'POST', body: { messages, model, provider }, timeoutMs: 300_000 })
  const content = response.status === 200
    ? (typeof response.data === 'object' && response.data ? response.data.content || response.data.message || JSON.stringify(response.data) : String(response.data))
    : `\u667a\u80fd\u4f53\u6267\u884c\u5931\u8d25\uff1a${response.data?.detail || response.data?.message || response.status}`
  history.push({ role: 'assistant', content, text: content, timestamp: nowSeconds(), model, provider })
  sessionMessages.set(agent.session_id, history)
  const finalStatus = mode === 'semi' ? 'review' : response.status === 200 ? 'done' : 'blocked'
  setAgentTaskStatus(project, taskIds, finalStatus, content.slice(0, 800))
  sendGatewayEvent(socket, agent.session_id, 'message.delta', { message_id: `task-${Date.now()}-${agent.id}`, text: content })
  sendGatewayEvent(socket, agent.session_id, 'message.complete', { message_id: `task-${Date.now()}-${agent.id}`, text: content, rendered: content, role: 'assistant', model, provider, finish_reason: 'stop' })
  if (session) { session.running = false; session.message_count = history.length; session.updated = nowSeconds(); session.preview = content.slice(0, 160); sendGatewayEvent(socket, agent.session_id, 'session.info', sessionInfoPayload(session)) }
  return { agent, tasks, content, status: finalStatus }
}

const appendControllerDispatchSummary = (socket, sessionRecord, project, mode, results, taskSystem) => {
  if (!sessionRecord?.id) return
  const history = sessionMessages.get(sessionRecord.id) || []
  const summary = mode === 'manual'
    ? `\n\n---\n\u4efb\u52a1\u5df2\u751f\u6210\uff08\u5168\u624b\u52a8\uff09\uff1a\u8bf7\u5207\u6362\u5230\u5404\u667a\u80fd\u4f53\u5bf9\u8bdd\u624b\u52a8\u5524\u8d77\u6267\u884c\u3002\n${(taskSystem.tasks || []).map(t => `- ${t.owner_agent_name}\uff1a${t.title}`).join('\n')}`
    : mode === 'semi'
      ? `\n\n---\n\u534a\u81ea\u52a8\u534f\u4f5c\u5df2\u542f\u52a8\uff1a${results.length}\u4e2a\u667a\u80fd\u4f53\u5df2\u8f93\u51fa\u6210\u679c\uff0c\u72b6\u6001\u4e3a\u201c\u5f85\u5ba1\u6279\u201d\uff0c\u8bf7\u5230\u5404\u667a\u80fd\u4f53\u5bf9\u8bdd\u67e5\u770b\u5e76\u786e\u8ba4\u3002`
      : `\n\n---\n\u5168\u81ea\u52a8\u534f\u4f5c\u5df2\u5b8c\u6210\uff1a\n${results.map(r => `- ${r.agent.name}\uff1a${String(r.content || '').slice(0, 120).replace(/\s+/g, ' ')}...`).join('\n')}`
  history.push({ role: 'assistant', content: summary, text: summary, timestamp: nowSeconds(), model: 'task_system' })
  sessionMessages.set(sessionRecord.id, history)
  const messageId = `task-summary-${Date.now()}`
  sendGatewayEvent(socket, sessionRecord.id, 'message.start', { message_id: messageId, role: 'assistant', model: 'task_system', provider: 'karna' })
  sendGatewayEvent(socket, sessionRecord.id, 'message.delta', { message_id: messageId, text: summary })
  sendGatewayEvent(socket, sessionRecord.id, 'message.complete', { message_id: messageId, text: summary, rendered: summary, role: 'assistant', model: 'task_system', provider: 'karna', finish_reason: 'stop' })
}

const dispatchControllerTasks = async (socket, sessionRecord, prompt, model, provider) => {
  try {
    if (!sessionRecord || sessionRecord.agent_id !== 'controller' || !sessionRecord.project_id) return null
    const project = findWriterProject(sessionRecord.project_id)
    if (!project) return null
    const mode = parseCoordinationMode(prompt)
    const taskSystem = generateProjectTasks(project, prompt)
    taskSystem.coordination_mode = mode
    writeTaskSystem(project, taskSystem)
    const agents = readWriterAgents(project).agents.filter(a => a.enabled !== false && a.id !== 'controller')
    const byAgent = new Map()
    for (const task of taskSystem.tasks || []) {
      if (!task.owner_agent_id || task.owner_agent_id === 'controller') continue
      const list = byAgent.get(task.owner_agent_id) || []
      list.push(task)
      byAgent.set(task.owner_agent_id, list)
    }
    if (mode === 'manual') {
      appendControllerDispatchSummary(socket, sessionRecord, project, mode, [], taskSystem)
      return taskSystem
    }
    const runnable = agents.map(agent => ({ agent, tasks: (byAgent.get(agent.id) || []).filter(task => ['claimed', 'in_progress'].includes(task.status)) })).filter(row => row.tasks.length && row.agent.session_id)
    const results = await Promise.all(runnable.map(row => runAgentTask({ socket, project, agent: row.agent, tasks: row.tasks, mode, model, provider }).catch(err => ({ agent: row.agent, tasks: row.tasks, content: err instanceof Error ? err.message : String(err), status: 'blocked' }))))
    appendControllerDispatchSummary(socket, sessionRecord, project, mode, results.filter(Boolean), taskSystem)
    return readTaskSystem(project)
  } catch (err) {
    rememberLog(`Controller task dispatch failed: ${err instanceof Error ? err.message : String(err)}`)
    return null
  }
}

const parseWorkflowChatDirective = prompt => {
  const text = String(prompt || '')
  const match = text.match(/^\s*\[karna_workflow:([^\]\s]+)\]\s*/)
  if (!match) return null
  return { workflowId: decodeURIComponent(match[1]), text: text.slice(match[0].length).trim() }
}
const workflowChatReport = run => {
  const lines = [`# 多 Agent 工作流运行报告`, ``, `状态：${run.status}`, `调用：${run.cost_estimate?.calls || 0} 次；Token 估算：${run.cost_estimate?.tokens || 0}`, ``]
  for (const [id, row] of Object.entries(run.node_statuses || {})) {
    lines.push(`## ${row.label || id}`)
    lines.push(`运行状态：${row.status}${row.agent_name ? `；Agent：${row.agent_name}` : ''}`)
    if (row.branch) lines.push(`分支：${row.branch}${typeof row.score === 'number' ? `；评分：${row.score}/${row.threshold || 60}` : ''}`)
    lines.push(String(row.summary || '').trim() || '暂无输出')
    lines.push('')
  }
  const final = (run.artifacts || []).at(-1)
  if (final?.content) lines.push(`---\n最终汇总\n\n${String(final.content).slice(0, 6000)}`)
  return lines.join('\n')
}

const isUntitledSession = title => !String(title || '').trim() || /^New Session$/i.test(String(title || '').trim()) || String(title || '').trim() === '\u65b0\u4f1a\u8bdd'

const titleFromPrompt = prompt => {
  const text = String(prompt || '').replace(/\s+/g, ' ').trim()
  if (!text) return '\u65b0\u4f1a\u8bdd'
  return text.length > 18 ? `${text.slice(0, 18)}...` : text
}

const xmlEscape = value => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;')

const safeFileStem = value => String(value || '\u6587\u6863')
  .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
  .replace(/\s+/g, '-')
  .slice(0, 40) || 'karna-doc'

const desktopOutputDir = () => {
  const dir = path.join(os.homedir() || getBackendDataDir(), 'Documents', 'Karna')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

const createDocx = ({ title = '\u7b11\u8bdd', text = '' } = {}) => {
  const outDir = desktopOutputDir()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const docxPath = path.join(outDir, `${safeFileStem(title)}-${stamp}.docx`)
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-docx-'))
  const wordDir = path.join(tmpRoot, 'word')
  const relsDir = path.join(tmpRoot, '_rels')
  fs.mkdirSync(wordDir, { recursive: true })
  fs.mkdirSync(relsDir, { recursive: true })
  fs.writeFileSync(path.join(tmpRoot, '[Content_Types].xml'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`, 'utf8')
  fs.writeFileSync(path.join(relsDir, '.rels'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`, 'utf8')
  const paragraphs = String(text || '').split(/\r?\n/).filter(Boolean).map(line => `<w:p><w:r><w:t>${xmlEscape(line)}</w:t></w:r></w:p>`).join('')
  fs.writeFileSync(path.join(wordDir, 'document.xml'), `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs || '<w:p><w:r><w:t></w:t></w:r></w:p>'}<w:sectPr/></w:body></w:document>`, 'utf8')
  const zipPath = `${docxPath}.zip`
  try { fs.rmSync(zipPath, { force: true }) } catch {}
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `Compress-Archive -Path '${tmpRoot.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`], { stdio: 'ignore', timeout: 30_000 })
  fs.renameSync(zipPath, docxPath)
  try { fs.rmSync(tmpRoot, { recursive: true, force: true }) } catch {}
  return docxPath
}

const formatBytesGb = bytes => `${(Number(bytes || 0) / 1024 / 1024 / 1024).toFixed(1)} GB`

const readWindowsDrive = drive => {
  const letter = String(drive || 'C').replace(/[^a-z]/ig, '').slice(0, 1).toUpperCase() || 'C'
  const script = `$d=Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='${letter}:'"; if($d){[pscustomobject]@{DeviceID=$d.DeviceID;Size=$d.Size;FreeSpace=$d.FreeSpace}|ConvertTo-Json -Compress}`
  const raw = execFileSync('powershell.exe', ['-NoProfile', '-Command', script], { encoding: 'utf8', timeout: 10_000 })
  const row = JSON.parse(String(raw || '{}'))
  if (!row || !row.DeviceID) throw new Error(`Drive ${letter}: not found`)
  const used = Number(row.Size || 0) - Number(row.FreeSpace || 0)
  return `Windows ${row.DeviceID} \u78c1\u76d8\u60c5\u51b5\uff1a\n- \u603b\u5bb9\u91cf\uff1a${formatBytesGb(row.Size)}\n- \u5df2\u7528\uff1a${formatBytesGb(used)}\n- \u53ef\u7528\uff1a${formatBytesGb(row.FreeSpace)}`
}

const openChrome = () => {
  const candidates = [
    path.join(process.env.ProgramFiles || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
  ].filter(Boolean)
  const exe = candidates.find(file => fs.existsSync(file)) || 'chrome.exe'
  const child = spawn(exe, [], { detached: true, stdio: 'ignore' })
  child.unref()
  return '\u5df2\u5c1d\u8bd5\u6253\u5f00 Chrome \u6d4f\u89c8\u5668\u3002'
}

const localTimeAnswer = () => {
  const now = new Date()
  const text = new Intl.DateTimeFormat('zh-CN', { timeZone: karnaConfig.timezone || 'Asia/Shanghai', dateStyle: 'full', timeStyle: 'medium', hour12: false }).format(now)
  return `\u73b0\u5728\u662f ${text}\u3002`
}

const localDocxAnswer = prompt => {
  const joke = '\u4e3a\u4ec0\u4e48\u6570\u5b66\u4e66\u603b\u662f\u5f88\u5fe7\u90c1\uff1f\u56e0\u4e3a\u5b83\u6709\u592a\u591a\u201c\u95ee\u9898\u201d\uff0c\u5374\u4ece\u6765\u627e\u4e0d\u5230\u201c\u7b54\u6848\u201d\u3002'
  const title = /\u7b11\u8bdd/.test(prompt) ? '\u7b11\u8bdd' : '\u6587\u6863'
  const file = createDocx({ title, text: joke })
  return `\u5df2\u751f\u6210 Word \u6587\u6863\uff1a\n${file}\n\n\u5185\u5bb9\uff1a${joke}`
}

const resolveLocalDesktopIntent = prompt => {
  const text = String(prompt || '').trim()
  if (!text) return null
  if (/(几点|幾點|时间|時間|现在.*点|現在.*點)/i.test(text)) return { content: localTimeAnswer(), model: 'local-time', provider: 'desktop' }
  if (/(c盘|c\\s*盘|C盘|磁盘|硬盘|存储|储存|空间|容量)/i.test(text)) {
    const match = text.match(/([a-zA-Z])\s*盘/)
    return { content: readWindowsDrive(match?.[1] || 'C'), model: 'local-disk', provider: 'desktop' }
  }
  if (/(打开|启动|开启).*(chrome|谷歌|浏览器|瀏覽器)/i.test(text)) return { content: openChrome(), model: 'local-app-launcher', provider: 'desktop' }
  if (/(word|docx|文档|文檔)/i.test(text) && /(写|生成|存|保存|输出|輸出|写入)/i.test(text)) return { content: localDocxAnswer(text), model: 'local-docx', provider: 'desktop' }
  return null
}

/**
 * Handle prompt.submit: call POST /api/chat and stream the response.
 */
async function handlePromptSubmit(socket, id, params) {
  const sessionId = params.session_id || params.sessionId || `karna-${Date.now()}`
  const prompt = params.prompt || params.message || params.text || ''
  const sessionRecord = sessions.get(sessionId)
  const requestedPermissionMode = String(params.permission_mode || params.permissionMode || 'project').toLowerCase()
  const permissionMode = ['project', 'computer', 'free'].includes(requestedPermissionMode)
    ? requestedPermissionMode
    : 'project'
  if (sessionRecord) sessionRecord.permission_mode = permissionMode
  if (sessionRecord && isUntitledSession(sessionRecord.title) && String(prompt || '').trim()) {
    sessionRecord.title = titleFromPrompt(prompt)
    sessionRecord.updated = nowSeconds()
  }
  let model = params.model || sessionRecord?.model || currentModel
  let provider = params.provider || sessionRecord?.provider || currentModelProvider
  const routed = routeModelForPrompt(prompt, provider, model)
  model = routed.model
  provider = routed.provider

  // Legacy project-agent chat lock is disabled: normal chats now stay normal unless a multi-agent workflow is explicitly selected.


  // Build messages from session history
  const history = sessionMessages.get(sessionId) || []
  const knowledgeContext = await knowledgeContextForPrompt(prompt, { projectRef: sessionRecord?.project_id || '' }).catch(err => {
    rememberLog(`Knowledge injection skipped: ${err.message}`)
    return ''
  })
  const projectContext = sessionRecord?.project_id ? projectSessionContext(findWriterProject(sessionRecord.project_id) || { title: sessionRecord.project_title || '', type: '', folder: sessionRecord.cwd || '' }, sessionRecord.agent_id ? readWriterAgents(findWriterProject(sessionRecord.project_id) || {}).agents.find(a => a.id === sessionRecord.agent_id) : null) : (sessionRecord?.system_context || '')
  const messages = soulPrompts.buildChatMessages({
    profile: sessionRecord?.profile || 'default',
    projectContext,
    knowledgeContext,
    history,
    prompt
  })

  if (sessionRecord) {
    sessionRecord.running = true
    sendGatewayEvent(socket, sessionId, 'session.info', sessionInfoPayload(sessionRecord))
  }

  // Send message.start event
  const assistantMessageId = `msg-${Date.now()}`
  sendGatewayEvent(socket, sessionId, 'message.start', {
    message_id: assistantMessageId,
    role: 'assistant',
    model,
    provider
  })

  // Send thinking.start (optional, helps UI show a loading state)
  sendGatewayEvent(socket, sessionId, 'status.update', { status: 'thinking' })
  if (routed.routed) sendGatewayEvent(socket, sessionId, 'status.update', { status: `auto-routed to ${provider} / ${model}` })

  const workflowDirective = parseWorkflowChatDirective(prompt)
  if (workflowDirective) {
    try {
      const workflowProject = workflowProjectFromRef('global')
      const workflowStore = readWorkflows(workflowProject)
      const workflow = (workflowStore.workflows || []).find(row => row.id === workflowDirective.workflowId)
      if (!workflow) throw new Error(`Workflow not found: ${workflowDirective.workflowId}`)
      const emit = text => sendGatewayEvent(socket, sessionId, 'message.delta', { message_id: assistantMessageId, text })
      emit(`多 Agent 工作流已启动：${workflow.name}\n\n`)
      const result = await runWorkflowForProject(workflowProject, workflowDirective.workflowId, {
        input: workflowDirective.text,
        model,
        provider,
        onNodeStatus: ({ status }) => {
          const label = status.label || '节点'
          const state = status.status || ''
          if (state === 'running') emit(`▶ ${label} 正在运行...\n`)
          else if (state === 'done' || state === 'accepted') emit(`✓ ${label} 已完成\n${String(status.summary || '').slice(0, 1200)}\n\n`)
          else if (state === 'paused') emit(`⏸ ${label} 已暂停，等待人工确认。\n`)
          else if (state === 'blocked') emit(`✕ ${label} 运行失败：${String(status.summary || '').slice(0, 800)}\n`)
        }
      })
      const content = workflowChatReport(result.run)
      emit(`\n${content}`)
      sendGatewayEvent(socket, sessionId, 'message.complete', { message_id: assistantMessageId, text: content, rendered: content, role: 'assistant', model: 'multi-agent-workflow', provider: 'karna', finish_reason: 'stop' })
      history.push({ role: 'user', content: workflowDirective.text || prompt, timestamp: nowSeconds() })
      history.push({ role: 'assistant', content, text: content, timestamp: nowSeconds(), model: 'multi-agent-workflow', provider: 'karna' })
      sessionMessages.set(sessionId, history)
      if (sessionRecord) { sessionRecord.message_count = history.length; sessionRecord.preview = `多 Agent：${workflow.name}`; sessionRecord.running = false; sessionRecord.updated = nowSeconds(); sendGatewayEvent(socket, sessionId, 'session.info', sessionInfoPayload(sessionRecord)) }
      sendJsonRpcResult(socket, id, { session_id: sessionId, ok: true, message_id: assistantMessageId })
      return
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      if (sessionRecord) { sessionRecord.running = false; sendGatewayEvent(socket, sessionId, 'session.info', sessionInfoPayload(sessionRecord)) }
      sendGatewayEvent(socket, sessionId, 'error', { message: errorMessage, code: 'workflow_error' })
      sendJsonRpcResult(socket, id, { session_id: sessionId, ok: false, error: errorMessage })
      return
    }
  }

  const completeLocalResponse = (content, localModel = model, localProvider = provider) => {
    sendGatewayEvent(socket, sessionId, 'message.delta', { message_id: assistantMessageId, text: content })
    sendGatewayEvent(socket, sessionId, 'message.complete', {
      message_id: assistantMessageId,
      text: content,
      rendered: content,
      role: 'assistant',
      model: localModel || 'desktop',
      provider: localProvider || 'desktop',
      finish_reason: 'stop'
    })
    history.push({ role: 'user', content: prompt, timestamp: nowSeconds() })
    history.push({ role: 'assistant', content, text: content, timestamp: nowSeconds(), model: localModel || 'desktop', provider: localProvider || 'desktop' })
    sessionMessages.set(sessionId, history)
    if (sessionRecord) {
      sessionRecord.message_count = history.length
      sessionRecord.preview = prompt.slice(0, 160)
      sessionRecord.running = false
      sessionRecord.updated = nowSeconds()
      sendGatewayEvent(socket, sessionId, 'session.info', sessionInfoPayload(sessionRecord))
    }
    sendJsonRpcResult(socket, id, { session_id: sessionId, ok: true, message_id: assistantMessageId })
  }

  const localIntent = (() => {
    try { return resolveLocalDesktopIntent(prompt) }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { content: `\u672c\u5730\u684c\u9762\u64cd\u4f5c\u5931\u8d25\uff1a${message}`, model: 'desktop-error', provider: 'desktop' }
    }
  })()
  if (localIntent) {
    completeLocalResponse(localIntent.content, localIntent.model, localIntent.provider)
    return
  }

  const selectedProvider = findProvider(provider)
  if (!selectedProvider || !isProviderConfigured(selectedProvider) || !model) {
    const content = '\u8fd8\u6ca1\u6709\u914d\u7f6e\u53ef\u7528\u7684\u6a21\u578b\u63d0\u4f9b\u65b9\u3002Karna \u4e0d\u4f1a\u9ed8\u8ba4\u53bb\u7528 GPT/OpenAI\uff1b\u8bf7\u5728\u8bbe\u7f6e\u91cc\u914d\u7f6e DeepSeek\u3001GLM\u3001Qwen \u6216\u81ea\u5b9a\u4e49 OpenAI-compatible \u6a21\u578b\u540e\u518d\u53d1\u9001\u3002'
    completeLocalResponse(content, 'not-configured', 'desktop')
    return
  }

  try {
    const customRow = routed.row || (String(provider || '').startsWith('custom:')
      ? readCustomModels().find(row => `custom:${row.id}` === String(provider))
      : null)

    let response
    if (customRow?.type === 'image') {
      const content = await imageModels.generateImageWithCustomModel(customRow, prompt)
      response = { status: 200, data: { content, provider, model } }
    } else {
      response = await chatBackendFetch({
        method: 'POST',
        body: {
          messages,
          model,
          permission_mode: permissionMode,
          provider,
          session_id: sessionId,
          workspace_root: sessionRecord?.cwd || ''
        },
        timeoutMs: 300_000
      })
    }

    if (response.status !== 200) {
      const errorMessage = response.data?.detail || response.data?.message || `Backend returned ${response.status}`
      if (sessionRecord) {
        sessionRecord.running = false
        sessionRecord.updated = nowSeconds()
        sendGatewayEvent(socket, sessionId, 'session.info', sessionInfoPayload(sessionRecord))
      }
      sendGatewayEvent(socket, sessionId, 'error', {
        message: errorMessage,
        code: response.status === 400 ? 'provider_setup_required' : 'backend_error'
      })
      sendJsonRpcResult(socket, id, { session_id: sessionId, ok: false, error: errorMessage })
      return
    }

    const content = typeof response.data === 'object' && response.data
      ? response.data.content || response.data.message || JSON.stringify(response.data)
      : String(response.data)

    // Send the full response as a single delta (Karna backend doesn't stream)
    sendGatewayEvent(socket, sessionId, 'message.delta', {
      message_id: assistantMessageId,
      text: content
    })

    // Send message.complete
    sendGatewayEvent(socket, sessionId, 'message.complete', {
      message_id: assistantMessageId,
      text: content,
      rendered: content,
      role: 'assistant',
      model,
      provider,
      finish_reason: 'stop'
    })

    // Store in session history
    history.push({ role: 'user', content: prompt, timestamp: nowSeconds() })
    history.push({ role: 'assistant', content, text: content, timestamp: nowSeconds(), model, provider })
    sessionMessages.set(sessionId, history)
    const dispatchedTasks = null
    if (dispatchedTasks && sessionRecord) {
      sessionRecord.preview = `\u5df2\u6d3e\u53d1 ${dispatchedTasks.tasks?.length || 0} \u4e2a\u4efb\u52a1`
    }

    // Update session metadata
    if (sessionRecord) {
      sessionRecord.message_count = (sessionMessages.get(sessionId) || history).length
      sessionRecord.updated = nowSeconds()
      if (!dispatchedTasks) sessionRecord.preview = prompt.slice(0, 160)
      sessionRecord.running = false
      sendGatewayEvent(socket, sessionId, 'session.info', sessionInfoPayload(sessionRecord))
    }

    sendJsonRpcResult(socket, id, { session_id: sessionId, ok: true, message_id: assistantMessageId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    rememberLog(`prompt.submit error: ${message}`)
    if (sessionRecord) {
      sessionRecord.running = false
      sendGatewayEvent(socket, sessionId, 'session.info', sessionInfoPayload(sessionRecord))
    }
    sendGatewayEvent(socket, sessionId, 'error', {
      message,
      code: /credential|required|api key|401|403/i.test(message) ? 'provider_setup_required' : 'backend_error'
    })
    sendJsonRpcResult(socket, id, { session_id: sessionId, ok: false, error: message })
  }
}

// ---------------------------------------------------------------------------
// REST API Adapter (frontend paths → Karna backend / mock)
// ---------------------------------------------------------------------------

/**
 * Handle a REST API request from the frontend (via karna:api IPC).
 * Maps API paths to the Karna backend or returns mock data.
 */
async function handleKarnaApiRequestImpl(request) {
  const reqPath = request?.path || '/'
  const method = (request?.method || 'GET').toUpperCase()
  const body = request?.body
  const timeoutMs = request?.timeoutMs || 30_000

  if (
    reqPath.startsWith('/api/karna/plugins') ||
    reqPath.startsWith('/api/karna/skills') ||
    reqPath.startsWith('/api/karna/skill-packs')
  ) {
    const result = handleKarnaPluginPlatform(reqPath, method, body)
    if (result) return result
  }

  // ---- Session endpoints (mock) ----
  if (reqPath.startsWith('/api/sessions/search')) {
    return { results: [], total: 0 }
  }

  if (reqPath === '/api/sessions' || reqPath.startsWith('/api/sessions?')) {
    if (method === 'GET') {
      const url = new URL(reqPath, 'http://local')
      const includeArchived = url.searchParams.get('include_archived') === 'true'
      const archivedOnly = url.searchParams.get('archived_only') === 'true'
      let sessionList = Array.from(sessions.values())
      sessionList = sessionLifecycleService.filterTombstoned(sessionList)
      sessionList = sessionLifecycleService.filterSessionsByArchive(sessionList, { includeArchived, archivedOnly })
      sessionList = sessionList.map(storedSessionInfo).sort((a, b) => b.last_active - a.last_active)
      return { sessions: sessionList, total: sessionList.length, offset: 0 }
    }
  }

  if (reqPath === '/api/profiles/sessions' || reqPath.startsWith('/api/profiles/sessions?')) {
    const url = new URL(reqPath, 'http://local')
    const includeArchived = url.searchParams.get('include_archived') === 'true'
    const archivedOnly = url.searchParams.get('archived_only') === 'true'
    let sessionList = Array.from(sessions.values())
    sessionList = sessionLifecycleService.filterTombstoned(sessionList)
    sessionList = sessionLifecycleService.filterSessionsByArchive(sessionList, { includeArchived, archivedOnly })
    sessionList = sessionList.map(storedSessionInfo).sort((a, b) => b.last_active - a.last_active)
    return {
      sessions: sessionList,
      total: sessionList.length,
      offset: 0,
      profile_totals: { default: sessionList.length }
    }
  }

  // Session by ID
  const sessionMatch = reqPath.match(/^\/api\/sessions\/([^/?]+)(?:\?|$)/)
  if (sessionMatch) {
    const sessionId = decodeURIComponent(sessionMatch[1])
    if (method === 'GET') {
      if (sessionLifecycleService.isTombstoned(sessionId)) {
        return { ok: false, error: 'Session deleted', code: 'SESSION_DELETED', id: sessionId }
      }
      return sessions.has(sessionId) ? storedSessionInfo(sessions.get(sessionId)) : { id: sessionId, title: '\u4f1a\u8bdd', started_at: 0, last_active: 0, ended_at: null, message_count: 0, archived: false, is_active: false, input_tokens: 0, output_tokens: 0, tool_call_count: 0, source: 'tui', profile: 'default', is_default_profile: true, model: null, preview: null, cwd: null, project_id: null, project_title: null, is_project_session: false, conversation_scope: 'standalone', workspace_id: null, writer_project_id: null, permission_mode: 'restricted' }
    }
    if (method === 'PATCH') {
      if (typeof body?.archived === 'boolean') {
        const scope = body?.scope === 'single' ? 'single' : 'lineage'
        const result = sessionLifecycleService.archiveLineage(sessionId, {
          archived: body.archived,
          scope,
          profileId: body?.profile
        })
        if (result.ok && typeof broadcastSessionLifecycleEvent === 'function') {
          broadcastSessionLifecycleEvent({
            mutation_id: result.mutation_id,
            action: result.action,
            lineage_root_id: result.lineage_root_id,
            affected_session_ids: result.affected_session_ids,
            affected_project_ids: result.affected_project_ids
          })
        }
        return result
      }
      const session = sessions.get(sessionId)
      if (session && body) {
        if (body.title) session.title = body.title
        session.updated = Date.now() / 1000
      }
      return { ok: true }
    }
    if (method === 'DELETE') {
      const scope = request?.query?.scope === 'single' ? 'single' : 'lineage'
      const result = sessionLifecycleService.deleteLineage(sessionId, {
        scope,
        reason: body?.reason || 'user_deleted',
        profileId: body?.profile || request?.query?.profile
      })
      if (result.ok && typeof broadcastSessionLifecycleEvent === 'function') {
        broadcastSessionLifecycleEvent({
          mutation_id: result.mutation_id,
          action: 'deleted',
          lineage_root_id: result.lineage_root_id,
          affected_session_ids: result.deleted_session_ids,
          affected_project_ids: result.cleared_project_ids
        })
      }
      return result
    }
  }

  // Session messages
  const messagesMatch = reqPath.match(/^\/api\/sessions\/([^/?]+)\/messages/)
  if (messagesMatch) {
    const sessionId = decodeURIComponent(messagesMatch[1])
    const messages = sessionMessages.get(sessionId) || []
    return { messages, session_id: sessionId }
  }

  // ---- Config endpoints ----
  if (reqPath === '/api/config') {
    if (method === 'GET') return publicKarnaConfig()
    if (method === 'PUT') {
      if (body?.config) {
        if (body.config.mcp_servers) writeMcpServers(body.config.mcp_servers)
        const { mcp_servers, ...restConfig } = body.config
        karnaConfig = { ...karnaConfig, ...stripLegacyPersonalityConfig(restConfig) }
      }
      return { ok: true, config_path: backendDataPath('mcp_servers.json') }
    }
  }

  if (reqPath === '/api/config/defaults') return stripLegacyPersonalityConfig(karnaConfigDefaults)
  if (reqPath === '/api/config/schema') {
    return karnaConfigSchema
  }

  // ---- Model endpoints ----
  if (reqPath === '/api/model/info') {
    ensureCurrentConfiguredProvider()
    const customModel = String(currentModelProvider || '').startsWith('custom:')
      ? readCustomModels().find(row => `custom:${row.id}` === currentModelProvider)
      : null
    const contextBudget = resolveModelContextBudget({
      model: currentModel,
      providerContextLength: customModel?.context_length,
      configuredContextLength: karnaConfig.model_context_length,
      compressionThreshold: karnaConfig.compression?.threshold
    })
    return {
      model: currentModel,
      provider: currentModelProvider,
      auto_context_length: contextBudget.advertisedContextTokens,
      config_context_length: contextBudget.configuredContextTokens,
      effective_context_length: contextBudget.effectiveContextTokens,
      compression_starts_at: contextBudget.compressionStartsAt,
      compression_threshold: contextBudget.compressionThreshold,
      output_reserve_tokens: contextBudget.outputReserveTokens,
      workflow_context_tokens: contextBudget.workflowContextTokens,
      context_length_source: contextBudget.source,
      capabilities: modelCapabilities(currentModel)
    }
  }

  if (reqPath === '/api/model/auxiliary' || reqPath.startsWith('/api/model/auxiliary')) {
    const rawTasks = Array.isArray(karnaConfig.models?.auxiliary) ? karnaConfig.models.auxiliary : []
    const tasks = rawTasks
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => ({
        task: String(entry.task || ''),
        provider: String(entry.provider || 'auto'),
        model: String(entry.model || ''),
        base_url: String(entry.base_url || '')
      }))
      .filter(entry => entry.task)
    return { main: { provider: currentModelProvider, model: currentModel }, tasks, stale_aux: [] }
  }


  if (reqPath === '/api/model/options' || reqPath.startsWith('/api/model/options')) {
    return getModelOptionsPayload()
  }

  if (reqPath === '/api/model/set') {
    if (!karnaConfig.models) karnaConfig.models = { default: currentModel, auxiliary: [] }
    if (body?.scope === 'auxiliary') {
      if (body?.task === '__reset__') {
        karnaConfig.models.auxiliary = []
        return { ok: true, model: currentModel, provider: currentModelProvider, stale_aux: [], gateway_tools: [] }
      }
      const provider = findProvider(body?.provider || currentModelProvider)
      if (!provider) {
        return { ok: false, error: '\u8bf7\u9009\u62e9\u4e00\u4e2a\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u63d0\u4f9b\u65b9\u3002', model: '', provider: '', stale_aux: [], gateway_tools: [] }
      }
      if (!isProviderConfigured(provider)) {
        return { ok: false, error: `Set ${provider.key_env} before using ${provider.name}.`, model: '', provider: provider.slug, stale_aux: [], gateway_tools: [] }
      }
      const task = String(body?.task || '').trim()
      if (!task) return { ok: false, error: 'Auxiliary task is required.', stale_aux: [], gateway_tools: [] }
      const model = String(body?.model || provider.models[0] || currentModel)
      const currentAux = Array.isArray(karnaConfig.models.auxiliary) ? karnaConfig.models.auxiliary : []
      karnaConfig.models.auxiliary = currentAux.filter(entry => entry?.task !== task).concat({ task, provider: provider.slug, model, base_url: String(body?.base_url || '') })
      return { ok: true, model, provider: provider.slug, stale_aux: [], gateway_tools: [] }
    }
    const provider = findProvider(body?.provider || currentModelProvider)
    if (!provider) {
      return { ok: false, error: '\u8bf7\u9009\u62e9\u4e00\u4e2a\u5df2\u914d\u7f6e\u7684\u6a21\u578b\u63d0\u4f9b\u65b9\u3002', model: '', provider: '', stale_aux: [], gateway_tools: [] }
    }
    if (!isProviderConfigured(provider)) {
      return { ok: false, error: `Set ${provider.key_env} before using ${provider.name}.`, model: '', provider: provider.slug, stale_aux: [], gateway_tools: [] }
    }
    const model = String(body?.model || provider.models[0] || currentModel)
    currentModelProvider = provider.slug
    currentModel = model
    karnaConfig.models.default = model
    persistCurrentModelSelection()
    return { ok: true, model, provider: provider.slug, stale_aux: [], gateway_tools: [] }
  }

  if (reqPath === '/api/model/custom') {
    if (method === 'GET') return { models: readCustomModels().map(publicCustomModel) }
    if (method === 'POST') return customModelController.upsertCustomModel(body)
  }

  const customModelMatch = reqPath.match(/^\/api\/model\/custom\/([^/?]+)(?:\/(test))?/)
  if (customModelMatch) {
    const id = decodeURIComponent(customModelMatch[1])
    if (method === 'DELETE') {
      customModelController.deleteCustomModel(id)
      deleteEnvValue(customEnvKey(id))
      if (currentModelProvider === `custom:${id}`) ensureCurrentConfiguredProvider()
      return { ok: true }
    }
    if (method === 'PUT') return customModelController.upsertCustomModel(body, id)
    if (method === 'POST' && customModelMatch[2] === 'test') {
      return customModelController.testExistingCustomModel(id, body)
    }
  }

  if (reqPath === '/api/model/test') {
    return testCustomModelByType({ type: body?.type || 'chat', base_url: body?.base_url, model_name: body?.model_name, api_key: body?.api_key })
  }

  if (reqPath === '/api/model/recommended-default' || reqPath.startsWith('/api/model/recommended-default?')) {
    const url = new URL(reqPath, 'http://karna.local')
    const provider = findProvider(url.searchParams.get('provider') || currentModelProvider)
    if (!provider) return { provider: '', model: '', free_tier: false }
    return { provider: provider.slug, model: provider.models[0] || currentModel, free_tier: true }
  }

  // ---- Skills ----
  if (reqPath === '/api/skills') return managedSkills.scanSkills()
  if (reqPath === '/api/skills/catalog') return managedSkills.getSkillsCatalog()
  if (reqPath.startsWith('/api/skills/search')) { const url = new URL(reqPath, 'http://karna.local'); return managedSkills.searchSkills(url.searchParams.get('q') || body?.q || body?.query || '') }
  if (reqPath === '/api/skills/import/preflight' && method === 'POST') {
    return await skillImportService.preflight(body || {})
  }
  if (reqPath === '/api/skills/import/commit' && method === 'POST') {
    return await skillImportService.commit(body?.jobId, body?.selectedSkills)
  }
  const importJobMatch = reqPath.match(/^\/api\/skills\/import\/([^/?]+)$/)
  if (importJobMatch && method === 'GET') {
    return skillImportService.getJob(decodeURIComponent(importJobMatch[1]))
  }
  if (reqPath === '/api/skills/create-direct' && method === 'POST') {
    return skillImportService.createSkillDirect(body || {})
  }
  const skillDetailMatch = reqPath.match(/^\/api\/skills\/([^/?]+)$/)
  if (skillDetailMatch && method === 'GET') return managedSkills.readSkillByName(decodeURIComponent(skillDetailMatch[1]))
  if (reqPath === '/api/skills/create' && method === 'POST') return managedSkills.createSkill(body || {})
  if (reqPath === '/api/skills/install' && method === 'POST') return managedSkills.installSkill(body?.name || body?.skill || '')
  if (reqPath === '/api/skills/uninstall' && (method === 'POST' || method === 'DELETE')) return managedSkills.uninstallSkill(body?.name || body?.skill || '')
  if (reqPath === '/api/skills/toggle') return managedSkills.setSkillEnabled(body?.name, body?.enabled !== false)

  // ---- Connector Workshop / MCP Workshop ----
  if (reqPath === '/api/connectors/definitions' && method === 'GET') return runConnectorBridge('definitions', { timeoutMs })
  if (reqPath === '/api/connectors/advanced-definitions' && method === 'GET') return runConnectorBridge('advanced_definitions', { timeoutMs })
  if (reqPath === '/api/connectors/instances') {
    if (method === 'GET') return runConnectorBridge('instances', { timeoutMs })
    if (method === 'POST') return runConnectorBridge('create_instance', { body: body || {}, timeoutMs })
  }
  const connectorInstanceMatch = reqPath.match(/^\/api\/connectors\/instances\/([^/?]+)(?:\/(test|credential))?(?:\?|$)/)
  if (connectorInstanceMatch) {
    const id = decodeURIComponent(connectorInstanceMatch[1])
    const action = connectorInstanceMatch[2]
    if (action === 'test' && method === 'POST') return runConnectorBridge('test_instance', { ref: id, timeoutMs: Math.max(timeoutMs, 60_000) })
    if (action === 'credential' && method === 'DELETE') return runConnectorBridge('delete_credential', { ref: id, timeoutMs })
    if (!action && method === 'PATCH') return runConnectorBridge('update_instance', { ref: id, body: body || {}, timeoutMs })
    if (!action && method === 'DELETE') return runConnectorBridge('delete_instance', { ref: id, timeoutMs })
  }
  const connectorToolMatch = reqPath.match(/^\/api\/connectors\/tools\/([^/?]+)(?:\/(call))?(?:\?|$)/)
  if (connectorToolMatch) {
    const id = decodeURIComponent(connectorToolMatch[1])
    const action = connectorToolMatch[2]
    if (action === 'call' && method === 'POST') return runConnectorBridge('call_tool', { ref: id, body: body || {}, timeoutMs: Math.max(timeoutMs, 90_000) })
    if (!action && method === 'PATCH') return runConnectorBridge('toggle_tool', { ref: id, body: body || {}, timeoutMs })
  }
  if (reqPath === '/api/connectors/audit-logs' || reqPath.startsWith('/api/connectors/audit-logs?')) {
    const url = new URL(reqPath, 'http://karna.local')
    return runConnectorBridge('audit_logs', {
      body: {
        instance_id: url.searchParams.get('instance_id') || url.searchParams.get('instanceId') || undefined,
        project_id: url.searchParams.get('project_id') || url.searchParams.get('projectId') || undefined,
        limit: Number(url.searchParams.get('limit') || 80)
      },
      timeoutMs
    })
  }
  if (reqPath === '/api/connectors/health-check' && method === 'POST') return runConnectorBridge('health_check', { timeoutMs: Math.max(timeoutMs, 90_000) })
  if (reqPath === '/api/connectors/router/candidates' && method === 'POST') return runConnectorBridge('route_tools', { body: body || {}, timeoutMs })

  // ---- MCP ----
  if (reqPath === '/api/mcp/reload' && method === 'POST') {
    const servers = mcpServerList()
    return { ok: true, servers: servers.length, enabled: servers.filter(server => server.enabled !== false).length, config_path: backendDataPath('mcp_servers.json') }
  }
  if (reqPath === '/api/mcp/servers') {
    if (method === 'GET') return { servers: mcpServerList(), config_path: backendDataPath('mcp_servers.json') }
    if (method === 'POST') {
      const name = String(body?.name || body?.id || '').trim()
      if (!name) return notConfigured('mcp', 'Missing MCP server name.')
      const servers = readMcpServers()
      servers[name] = { ...(servers[name] || {}), ...body, name, enabled: body?.enabled !== false }
      writeMcpServers(servers)
      return { ok: true, server: { name, ...servers[name] }, config_path: backendDataPath('mcp_servers.json') }
    }
  }
  const mcpServerMatch = reqPath.match(/^\/api\/mcp\/servers\/([^/?]+)(?:\/(test))?$/)
  if (mcpServerMatch) {
    const name = decodeURIComponent(mcpServerMatch[1])
    const userServers = readMcpServers()
    const servers = withBuiltinMcpServers(userServers)
    if (method === 'POST' && mcpServerMatch[2] === 'test') return testMcpServer(servers[name] || body)
    if (method === 'PUT') {
      if (BUILTIN_MCP_SERVERS[name]) return notConfigured('mcp', `Built-in MCP server ${name} cannot be overwritten.`)
      userServers[name] = { ...(userServers[name] || {}), ...body, name, enabled: body?.enabled !== false }
      writeMcpServers(userServers)
      return { ok: true, server: { name, ...userServers[name] } }
    }
    if (method === 'DELETE') {
      if (BUILTIN_MCP_SERVERS[name]) return notConfigured('mcp', `Built-in MCP server ${name} cannot be deleted.`)
      delete userServers[name]
      writeMcpServers(userServers)
      return { ok: true, name }
    }
    if (method === 'GET') return servers[name] ? { name, ...servers[name] } : notConfigured('mcp', `MCP server not found: ${name}`)
  }

  // ---- Tools/Toolsets ----
  if (reqPath === '/api/tools/toolsets') return toolsetRows()
  const toolsetConfigMatch = reqPath.match(/^\/api\/tools\/toolsets\/([^/?]+)\/config/)
  if (toolsetConfigMatch) return toolsetConfig(decodeURIComponent(toolsetConfigMatch[1]))
  const toolsetProviderMatch = reqPath.match(/^\/api\/tools\/toolsets\/([^/?]+)\/provider/)
  if (toolsetProviderMatch && (method === 'POST' || method === 'PUT')) return setToolsetProvider(decodeURIComponent(toolsetProviderMatch[1]), body?.provider || body?.name || 'local')
  const toolsetPostSetupMatch = reqPath.match(/^\/api\/tools\/toolsets\/([^/?]+)\/post-setup/)
  if (toolsetPostSetupMatch && method === 'POST') return notConfigured('toolsets', `No post-setup hook is configured for ${decodeURIComponent(toolsetPostSetupMatch[1])}.`)
  const toolsetMatch = reqPath.match(/^\/api\/tools\/toolsets\/([^/?]+)$/)
  if (toolsetMatch) {
    const name = decodeURIComponent(toolsetMatch[1])
    if (method === 'PUT') return setToolsetEnabled(name, body?.enabled !== false)
    const row = toolsetRows().find(r => r.name === name)
    return row || notConfigured('toolsets', `Unknown toolset: ${name}`)
  }

  // ---- Plugins ----
  if (reqPath === '/api/plugins') return { plugins: scanPlugins(), config_path: backendDataPath('plugins.json') }
  const pluginMatch = reqPath.match(/^\/api\/plugins\/([^/?]+)$/)
  if (pluginMatch && method === 'PUT') return setPluginEnabled(decodeURIComponent(pluginMatch[1]), body?.enabled !== false)

  // ---- Artifacts ----
  if (reqPath === '/api/artifacts') {
    if (method === 'GET') return readArtifacts()
    if (method === 'PUT') return artifactsService.updateArtifactSettings(body?.settings || {})
  }
  const artifactMatch = reqPath.match(/^\/api\/artifacts\/([^/?]+)$/)
  if (artifactMatch) {
    const artifactId = decodeURIComponent(artifactMatch[1])
    const store = readArtifacts()
    const artifact = store.artifacts.find(item => item.id === artifactId)
    if (method === 'GET') return artifact || notConfigured('artifacts', `Artifact not found: ${artifactId}`)
    if (method === 'DELETE') return artifactsService.deleteArtifact(artifactId)
  }


  // ---- Knowledge Base ----
  if (reqPath === '/api/knowledge') {
    if (method === 'GET') { const store = await readKnowledgeBase(); const config = store.config || store; return { ...store, config, libraries: knowledgeLibraryRows(store), usage: knowledgeFolderUsage(config.folders || [getKnowledgeDefaultFolder()]) } }
    if (method === 'PUT') {
      const configStore = readKnowledgeConfig()
      const config = { ...(configStore.config || {}), ...(body?.config || body || {}) }
      writeKnowledgeConfig({ ...configStore, config })
      const store = await readKnowledgeBase()
      return { ok: true, config, libraries: knowledgeLibraryRows(store) }
    }
  }
  if (reqPath === '/api/knowledge/libraries') {
    if (method === 'GET') { const store = await readKnowledgeBase(); return { ok: true, libraries: knowledgeLibraryRows(store) } }
    if (method === 'POST') return upsertKnowledgeLibrary(body || {})
  }
  const knowledgeLibraryMatch = reqPath.match(/^\/api\/knowledge\/libraries\/([^/?]+)$/)
  if (knowledgeLibraryMatch) {
    const id = decodeURIComponent(knowledgeLibraryMatch[1])
    if (method === 'PATCH') return renameKnowledgeLibrary(id, body?.name || body?.title || '')
  }
  if (reqPath === '/api/knowledge/import-folder' && method === 'POST') {
    try { const row = await upsertKnowledgeLibrary({ name: body?.name, folder: body?.path || body?.folder }); const indexed = await indexKnowledgeFolder(body?.path || body?.folder, body || {}); const store = await readKnowledgeBase(); return { ...indexed, library: row.library, libraries: knowledgeLibraryRows(store) } }
    catch (err) { return notConfigured('knowledge', err instanceof Error ? err.message : String(err)) }
  }
  if (reqPath === '/api/knowledge/reindex' && method === 'POST') {
    const configStore = readKnowledgeConfig()
    const folders = Array.isArray(configStore.config?.folders) && configStore.config.folders.length ? configStore.config.folders : [getKnowledgeDefaultFolder()]
    const results = []
    for (const folder of folders) {
      try { results.push(await indexKnowledgeFolder(folder, body || {})) }
      catch (err) { results.push(notConfigured('knowledge', err instanceof Error ? err.message : String(err), { folder })) }
    }
    return { ok: results.every(row => row.ok), results }
  }
  if (reqPath === '/api/knowledge/search' && method === 'POST') {
    try { return await searchKnowledge(body?.query || body?.q || '', { limit: body?.limit, allowLexical: true, docType: body?.doc_type || body?.docType || '', formId: body?.form_id || body?.formId || '' }) }
    catch (err) { return notConfigured('knowledge', err instanceof Error ? err.message : String(err), { results: [] }) }
  }

  // ---- Built-in Karna MCP tool calls ----
  const builtinMcpCallMatch = reqPath.match(/^\/api\/mcp\/builtin\/([^/?]+)$/)
  if (builtinMcpCallMatch && method === 'POST') {
    try {
      return await callBuiltinMcpTool(decodeURIComponent(builtinMcpCallMatch[1]), body || {})
    } catch (err) {
      if (err.code === 'EMPTY_PROJECT') {
        return { ok: false, error: 'EMPTY_PROJECT', message: err.message }
      }
      return notConfigured('mcp', err instanceof Error ? err.message : String(err))
    }
  }
  const mcpToolsMatch = reqPath.match(/^\/api\/mcp\/servers\/([^/?]+)\/tools$/)
  if (mcpToolsMatch) {
    const server = withBuiltinMcpServers(readMcpServers())[decodeURIComponent(mcpToolsMatch[1])]
    return server ? { ok: true, server: server.name, tools: server.tools || [] } : notConfigured('mcp', `MCP server not found: ${decodeURIComponent(mcpToolsMatch[1])}`)
  }


  if (reqPath === '/api/writer/resources') {
    const skills = managedSkills.scanSkills().map(skill => ({ id: skill.name, name: skill.name, description: skill.description || '', path: skill.path, enabled: skill.enabled !== false, scope: 'global', available: true, status: 'ready', icon: 'code', source: 'skill-registry', category: skill.category || 'general' }))
    const mcp = Object.values(withBuiltinMcpServers(readMcpServers())).map(server => ({ id: server.name, name: server.name, description: server.description || '', enabled: server.enabled !== false, scope: 'global', available: server.enabled !== false, status: server.enabled !== false ? 'ready' : 'disabled', icon: 'plug', source: 'mcp-server', tools: (server.tools || []).map(t => typeof t === 'string' ? { id: t, name: t } : { id: t.id || t.name, name: t.name || t.id, description: t.description }) }))
    const plugins = scanPlugins().map(plugin => ({ id: plugin.id, name: plugin.name || plugin.id, description: plugin.description || '', path: plugin.path, enabled: plugin.enabled !== false, scope: 'global', available: true, status: 'ready', icon: 'extensions', source: 'plugin-registry' }))
    const kStore = await readKnowledgeBase()
    const knowledge = knowledgeLibraryRows(kStore).map(lib => ({ id: lib.id, name: lib.name, description: lib.folder || '', scope: 'global', enabled: true, available: true, status: 'ready', icon: 'database', source: 'knowledge-base', documentCount: lib.documents || 0 }))

    const modelList = []
    try {
      const modelOpts = getModelOptionsPayload()
      for (const provider of (modelOpts.providers || [])) {
        const isConfigured = provider.authenticated !== false
        for (const modelId of (provider.models || [])) {
          modelList.push({
            id: modelId,
            name: modelId,
            description: provider.name || provider.slug,
            provider: provider.slug,
            scope: 'global',
            enabled: isConfigured,
            available: isConfigured,
            status: isConfigured ? 'ready' : 'disabled',
            icon: 'server',
            source: 'model-provider',
            unavailableReason: isConfigured ? undefined : `请先配置 ${provider.name || provider.slug} 的 API Key`
          })
        }
      }
      for (const custom of (modelOpts.custom_models || [])) {
        const cmId = custom.model_name || custom.id || custom.name
        modelList.push({
          id: cmId,
          name: custom.name || cmId,
          description: custom.base_url ? `自定义模型 (${custom.base_url})` : '自定义模型',
          provider: custom.provider || 'custom',
          scope: 'global',
          enabled: true,
          available: true,
          status: 'ready',
          icon: 'server',
          source: 'model-provider'
        })
      }
    } catch (err) {
      rememberLog(`Failed to load models for resources: ${err.message}`)
    }

    let souls = []
    try {
      const soulResult = listSoulAuthors({})
      souls = (soulResult.authors || []).map(author => ({
        id: author.id,
        name: author.name,
        description: author.description || author.tagline || '',
        scope: 'global',
        enabled: author.status === 'ready',
        available: author.status === 'ready',
        status: author.status === 'ready' ? 'ready' : (author.status === 'error' ? 'error' : 'loading'),
        icon: 'heart',
        source: 'soul-workshop',
        documentCount: author.texts_count || 0,
        tagline: author.tagline
      }))
    } catch (err) {
      rememberLog(`Failed to load souls for resources: ${err.message}`)
    }

    return { ok: true, skills, mcp, plugins, knowledge, models: modelList, souls, connectors: [] }
  }

  if (reqPath === '/api/writer/plan/parse' && method === 'POST') {
    try { return parseProjectPlanDraft(body || {}) }
    catch (err) { return notConfigured('writer_projects', err instanceof Error ? err.message : String(err)) }
  }
  if (reqPath === '/api/prompt/enhance' && method === 'POST') {
    try { return await enhancePromptText(body || {}) }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) } }
  }

  // ---- Document Ingest Pipeline ----
  if (reqPath === '/api/ingest/capabilities') {
    try { return { ok: true, ...ingestService.getParseCapabilities() } }
    catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) } }
  }
  if (reqPath === '/api/ingest/jobs' && method === 'POST') {
    try {
      const { source, project_id, library_id, intent, options } = body || {}
      const job = await ingestService.createJob({ source, projectId: project_id, libraryId: library_id, intent, options })
      return { ok: true, job_id: job.job_id, status: job.status }
    } catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) } }
  }
  const ingestJobMatch = reqPath.match(/^\/api\/ingest\/jobs\/([^/?]+)(?:\?|$)/)
  if (ingestJobMatch) {
    const jobId = decodeURIComponent(ingestJobMatch[1])
    try {
      if (method === 'GET') {
        const job = ingestService.getJob(jobId)
        if (!job) return { ok: false, error: 'Job not found', status: 404 }
        return { ok: true, job_id: job.job_id, status: job.status, progress: job.progress, stage: job.stage, message: job.message, error: job.error }
      }
      if (method === 'DELETE') {
        ingestService.cancelJob(jobId)
        return { ok: true }
      }
    } catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) } }
  }
  const ingestResultMatch = reqPath.match(/^\/api\/ingest\/results\/([^/?]+)(?:\?|$)/)
  if (ingestResultMatch && method === 'GET') {
    const resultId = decodeURIComponent(ingestResultMatch[1])
    try {
      const result = ingestService.getResult(resultId) || ingestService.getResultByJobId(resultId)
      if (!result) return { ok: false, error: 'Result not found', status: 404 }
      return { ok: true, ...result }
    } catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) } }
  }
  if (reqPath === '/api/ingest/materialize' && method === 'POST') {
    try {
      const { resultId, markdown, originalName } = body || {}
      return ingestService.materializeResult({ resultId, markdown, originalName })
    } catch (err) { return { ok: false, error: err instanceof Error ? err.message : String(err) } }
  }

  // ---- Writer Workflow Builder ----
  if (reqPath === '/api/writer/agents/library' || reqPath.startsWith('/api/writer/agents/library?')) {
    const url = new URL(reqPath, 'http://karna.local')
    const project = workflowProjectFromRef(url.searchParams.get('project') || body?.projectRef || body?.project_id)
    if (!project) return notConfigured('writer_projects', 'No active writing project. Create or open a writer project first.')
    try {
      if (method === 'GET') return { ok: true, project, templates: WORKFLOW_AGENT_TEMPLATES, ...readWorkflowAgents(project) }
      if (method === 'POST') return { ok: true, project, templates: WORKFLOW_AGENT_TEMPLATES, ...upsertWorkflowAgent(project, body || {}) }
    } catch (err) { return notConfigured('writer_workflows', err instanceof Error ? err.message : String(err)) }
  }
  const workflowAgentLibraryMatch = reqPath.match(/^\/api\/writer\/agents\/library\/([^/?]+)(?:\?|$)/)
  if (workflowAgentLibraryMatch) {
    const url = new URL(reqPath, 'http://karna.local')
    const project = workflowProjectFromRef(url.searchParams.get('project') || body?.projectRef || body?.project_id)
    if (!project) return notConfigured('writer_projects', 'No active writing project. Create or open a writer project first.')
    try {
      if (method === 'PATCH') return { ok: true, project, templates: WORKFLOW_AGENT_TEMPLATES, ...upsertWorkflowAgent(project, body || {}, decodeURIComponent(workflowAgentLibraryMatch[1])) }
      if (method === 'DELETE') return { ok: true, project, templates: WORKFLOW_AGENT_TEMPLATES, ...deleteWorkflowAgent(project, decodeURIComponent(workflowAgentLibraryMatch[1])) }
    } catch (err) { return notConfigured('writer_workflows', err instanceof Error ? err.message : String(err)) }
  }
  if (reqPath === '/api/writer/workflows/resolve' && method === 'POST') {
    try {
      return resolveWorkflow(body || {})
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), status: 500 }
    }
  }
  if (reqPath === '/api/writer/workflows' || reqPath.startsWith('/api/writer/workflows?')) {
    const url = new URL(reqPath, 'http://karna.local')
    const project = workflowProjectFromRef(url.searchParams.get('project') || body?.projectRef || body?.project_id)
    if (!project) return notConfigured('writer_projects', 'No active writing project. Create or open a writer project first.')
    try {
      if (method === 'GET') return listWorkflowsForProject(project)
      if (method === 'POST') return saveWorkflowForProject(project, body || {})
    } catch (err) {
      if (err.validationErrors) {
        return { ok: false, error: 'Validation failed', errors: err.validationErrors, status: 400 }
      }
      return notConfigured('writer_workflows', err instanceof Error ? err.message : String(err))
    }
  }
  const workflowRunStopMatch = reqPath.match(/^\/api\/writer\/workflows\/([^/?]+)\/runs\/([^/?]+)\/(?:stop|cancel)(?:\?|$)/)
  if (workflowRunStopMatch && method === 'POST') {
    const project = workflowProjectFromRef(body?.projectRef || body?.project_id)
    if (!project) return notConfigured('writer_projects', 'No active writing project. Create or open a writer project first.')
    try { return stopWorkflowRun(project, decodeURIComponent(workflowRunStopMatch[2])) }
    catch (err) { return notConfigured('writer_workflows', err instanceof Error ? err.message : String(err)) }
  }
  const workflowRunNodeActionMatch = reqPath.match(/^\/api\/writer\/workflows\/([^/?]+)\/runs\/([^/?]+)\/nodes\/([^/?]+)\/(accept|reject|skip|retry)(?:\?|$)/)
  if (workflowRunNodeActionMatch && method === 'POST') {
    const project = workflowProjectFromRef(body?.projectRef || body?.project_id)
    if (!project) return notConfigured('writer_projects', 'No active writing project. Create or open a writer project first.')
    try { return updateWorkflowRunNodeAction(project, decodeURIComponent(workflowRunNodeActionMatch[2]), decodeURIComponent(workflowRunNodeActionMatch[3]), workflowRunNodeActionMatch[4], body?.note || body?.text || '') }
    catch (err) { return notConfigured('writer_workflows', err instanceof Error ? err.message : String(err)) }
  }
  const workflowContinueMatch = reqPath.match(/^\/api\/writer\/workflows\/([^/?]+)\/continue(?:\?|$)/)
  if (workflowContinueMatch && method === 'POST') {
    const project = workflowProjectFromRef(body?.projectRef || body?.project_id)
    if (!project) return notConfigured('writer_projects', 'No active writing project. Create or open a writer project first.')
    try {
      const workflowIdText = decodeURIComponent(workflowContinueMatch[1])
      const run = body?.runId ? (readWorkflowRuns(project).runs || []).find(row => row.run_id === body.runId) : latestWorkflowRun(project, workflowIdText)
      const pausedNode = body?.nodeId || run?.paused_at_node_id || Object.entries(run?.node_statuses || {}).find(([, row]) => row.status === 'paused')?.[0]
      if (!run || !pausedNode) throw new Error('No paused workflow run found to continue.')
      return runWorkflowForProject(project, workflowIdText, { ...(body || {}), action: 'continue', resumeRunId: run.run_id, resumeFromNodeId: pausedNode, humanInput: body?.humanInput || body?.text || '' })
    } catch (err) { return notConfigured('writer_workflows', err instanceof Error ? err.message : String(err)) }
  }
  const workflowNodeRunMatch = reqPath.match(/^\/api\/writer\/workflows\/([^/?]+)\/nodes\/([^/?]+)\/rerun(?:\?|$)/)
  if (workflowNodeRunMatch && method === 'POST') {
    const project = workflowProjectFromRef(body?.projectRef || body?.project_id)
    if (!project) return notConfigured('writer_projects', 'No active writing project. Create or open a writer project first.')
    try { return runWorkflowForProject(project, decodeURIComponent(workflowNodeRunMatch[1]), body || {}, decodeURIComponent(workflowNodeRunMatch[2])) }
    catch (err) { return notConfigured('writer_workflows', err instanceof Error ? err.message : String(err)) }
  }
  const workflowRunMatch = reqPath.match(/^\/api\/writer\/workflows\/([^/?]+)\/run(?:\?|$)/)
  if (workflowRunMatch && method === 'POST') {
    const project = workflowProjectFromRef(body?.projectRef || body?.project_id)
    if (!project) return notConfigured('writer_projects', 'No active writing project. Create or open a writer project first.')
    try { return runWorkflowForProject(project, decodeURIComponent(workflowRunMatch[1]), body || {}) }
    catch (err) { return notConfigured('writer_workflows', err instanceof Error ? err.message : String(err)) }
  }
  const workflowMatch = reqPath.match(/^\/api\/writer\/workflows\/([^/?]+)(?:\?|$)/)
  if (workflowMatch) {
    const url = new URL(reqPath, 'http://karna.local')
    const project = workflowProjectFromRef(url.searchParams.get('project') || body?.projectRef || body?.project_id)
    if (!project) return notConfigured('writer_projects', 'No active writing project. Create or open a writer project first.')
    try {
      const id = decodeURIComponent(workflowMatch[1])
      if (method === 'GET') return { ok: true, workflow: (readWorkflows(project).workflows || []).find(row => row.id === id) || null, project, agents: readWorkflowAgents(project).agents, runs: readWorkflowRuns(project).runs }
      if (method === 'PATCH') return saveWorkflowForProject(project, { ...(body || {}), id })
      if (method === 'DELETE') return deleteWorkflowForProject(project, id)
    } catch (err) {
      if (err.validationErrors) {
        return { ok: false, error: 'Validation failed', errors: err.validationErrors, status: 400 }
      }
      return notConfigured('writer_workflows', err instanceof Error ? err.message : String(err))
    }
  }

  // ---- Soul Workshop ----
  if (reqPath === '/api/soul/catalog' || reqPath.startsWith('/api/soul/catalog?')) {
    try {
      if (method === 'GET') return getSoulCatalog()
    } catch (err) { return notConfigured('soul_workshop', err instanceof Error ? err.message : String(err)) }
  }
  if (reqPath === '/api/soul/authors' || reqPath.startsWith('/api/soul/authors?')) {
    try {
      if (method === 'GET') {
        const url = new URL(reqPath, 'http://karna.local')
        return listSoulAuthors({ status: url.searchParams.get('status') })
      }
      if (method === 'POST') return createSoulAuthor(body || {})
    } catch (err) { return notConfigured('soul_workshop', err instanceof Error ? err.message : String(err)) }
  }
  if (reqPath === '/api/soul/fusion/preview' && method === 'POST') return fusionSoulPreview(body || {})

  const soulSourceMatch = reqPath.match(/^\/api\/soul\/authors\/([^/?]+)\/sources(?:\/([^/?]+)\/(reindex))?$/)
  if (soulSourceMatch) {
    const ref = decodeURIComponent(soulSourceMatch[1])
    const sourceId = soulSourceMatch[2] ? decodeURIComponent(soulSourceMatch[2]) : null
    const action = soulSourceMatch[3]
    try {
      if (!sourceId && method === 'GET') return listSoulSources(ref)
      if (!sourceId && method === 'POST') return addSoulSource(ref, body || {})
      if (sourceId && !action && method === 'DELETE') return deleteSoulSource(ref, sourceId)
      if (sourceId && action === 'reindex' && method === 'POST') return reindexSoulSource(ref, sourceId)
    } catch (err) { return notConfigured('soul_workshop', err instanceof Error ? err.message : String(err)) }
  }

  const soulAttributeMatch = reqPath.match(/^\/api\/soul\/authors\/([^/?]+)\/attributes\/([^/?]+)(?:\/(disable|enable|distill|evidence))?$/)
  if (soulAttributeMatch) {
    const ref = decodeURIComponent(soulAttributeMatch[1])
    const attributeId = decodeURIComponent(soulAttributeMatch[2])
    const action = soulAttributeMatch[3]
    try {
      if (!action && method === 'PATCH') return updateSoulAttribute(ref, attributeId, body || {})
      if (action === 'disable' && method === 'POST') return disableSoulAttribute(ref, attributeId)
      if (action === 'enable' && method === 'POST') return enableSoulAttribute(ref, attributeId)
      if (action === 'distill' && method === 'POST') return distillSoulAttribute(ref, attributeId)
      if (action === 'evidence' && method === 'GET') return getSoulAttributeEvidence(ref, attributeId)
    } catch (err) { return notConfigured('soul_workshop', err instanceof Error ? err.message : String(err)) }
  }

  const soulCandidateMatch = reqPath.match(/^\/api\/soul\/authors\/([^/?]+)\/candidates(?:\/([^/?]+)\/(accept|reject))?$/)
  if (soulCandidateMatch) {
    const ref = decodeURIComponent(soulCandidateMatch[1])
    const candidateId = soulCandidateMatch[2] ? decodeURIComponent(soulCandidateMatch[2]) : null
    const action = soulCandidateMatch[3]
    try {
      if (!candidateId && method === 'GET') return listSoulCandidates(ref)
      if (candidateId && action === 'accept' && method === 'POST') return acceptSoulCandidate(ref, candidateId)
      if (candidateId && action === 'reject' && method === 'POST') return rejectSoulCandidate(ref, candidateId)
    } catch (err) { return notConfigured('soul_workshop', err instanceof Error ? err.message : String(err)) }
  }

  const soulImpactMatch = reqPath.match(/^\/api\/soul\/authors\/([^/?]+)\/impact(?:\?|$)/)
  if (soulImpactMatch && method === 'POST') {
    const ref = decodeURIComponent(soulImpactMatch[1])
    try { return analyzeSoulImpact(ref) }
    catch (err) { return notConfigured('soul_workshop', err instanceof Error ? err.message : String(err)) }
  }

  const soulAuthorMatch = reqPath.match(/^\/api\/soul\/authors\/([^/?]+)(?:\/(import|process|search|web-research|distill|critic|risk-check|export-skill|export|governance|purge|detail|duplicate|archive|unarchive))?$/)
  if (soulAuthorMatch) {
    const ref = decodeURIComponent(soulAuthorMatch[1])
    const action = soulAuthorMatch[2] || 'detail'
    try {
      if (action === 'detail' && method === 'GET') return readSoulAuthorDetail(ref)
      if (action === 'detail' && method === 'DELETE') return deleteSoulAuthor(ref)
      if (action === 'detail' && method === 'PATCH') return updateSoulAuthor(ref, body || {})
      if (action === 'import' && method === 'POST') return importSoulTexts(ref, body || {})
      if (action === 'process' && method === 'POST') return await processSoulAuthor(ref, body || {})
      if (action === 'search' && method === 'POST') return await searchSoulAuthor(ref, body || {})
      if (action === 'web-research' && method === 'POST') return await webResearchSoulAuthor(ref, body || {})
      if (action === 'distill' && method === 'POST') return distillSoulProfile(ref, body || {})
      if (action === 'critic' && method === 'POST') return criticSoulText(ref, body || {})
      if (action === 'risk-check' && method === 'POST') return riskCheckSoulText(ref, body || {})
      if (action === 'export-skill' && method === 'POST') return exportSoulSkill(ref)
      if (action === 'export' && method === 'POST') return exportSoulAuthor(ref)
      if (action === 'governance' && (method === 'PUT' || method === 'PATCH')) return updateSoulGovernance(ref, body || {})
      if (action === 'purge' && method === 'DELETE') return purgeSoulKnowledge(ref)
      if (action === 'duplicate' && method === 'POST') return duplicateSoulAuthor(ref)
      if (action === 'archive' && method === 'POST') return archiveSoulAuthor(ref)
      if (action === 'unarchive' && method === 'POST') return unarchiveSoulAuthor(ref)
    } catch (err) { return notConfigured('soul_workshop', err instanceof Error ? err.message : String(err)) }
  }
  const WRITER_CATALOG_VERSION = '2026.07'
  const WRITER_DOCUMENT_TYPES = [
    'narrative_prose', 'script_dialogue', 'interactive_narrative',
    'marketing_copy', 'informational_article', 'argumentative_document',
    'structured_business_doc', 'regulated_document', 'technical_document',
    'knowledge_asset', 'outline', 'research_material', 'review_feedback', 'revision_artifact'
  ]
  const WRITER_DOMAINS = [
    { id: 'literature', label: '文学与叙事创作', description: '小说、散文、诗歌、非虚构等文学创作', icon: 'book', order: 1 },
    { id: 'film-theater', label: '影视戏剧表演', description: '影视剧本、舞台戏剧、音频戏剧', icon: 'file-media', order: 2 },
    { id: 'games-interactive', label: '游戏互动叙事', description: '游戏剧情、互动小说、跑团', icon: 'git-branch', order: 3 },
    { id: 'marketing-brand', label: '营销品牌文案', description: '广告、品牌、电商、内容营销', icon: 'megaphone', order: 4 },
    { id: 'news-publishing', label: '新闻媒体出版', description: '新闻报道、出版编辑、媒体策划', icon: 'file-text', order: 5 },
    { id: 'academic-research', label: '学术科研写作', description: '论文、研究报告、基金申请', icon: 'library', order: 6 },
    { id: 'business-enterprise', label: '企业商业管理', description: '商业计划、方案、标书、管理文档', icon: 'briefcase', order: 7 },
    { id: 'legal-government', label: '政务法律合规', description: '法律文书、政务公文、合规文档', icon: 'shield', order: 8 },
    { id: 'technical-docs', label: '技术开发文档', description: 'API文档、技术方案、用户手册', icon: 'code', order: 9 },
    { id: 'knowledge-assets', label: '知识资产管理', description: 'Wiki、百科、术语表、RAG资料库', icon: 'database', order: 10 }
  ]
  const WRITER_FAMILIES = [
    { id: 'novel', domainId: 'literature', label: '小说', description: '长短篇小说、网络小说、类型小说', order: 1 },
    { id: 'nonfiction', domainId: 'literature', label: '非虚构文学', description: '纪实、传记、报告文学', order: 2 },
    { id: 'prose', domainId: 'literature', label: '散文随笔', description: '散文、随笔、杂文、游记', order: 3 },
    { id: 'poetry', domainId: 'literature', label: '诗歌韵文', description: '诗歌、歌词、散文诗', order: 4 },
    { id: 'childrens-lit', domainId: 'literature', label: '儿童文学', description: '童话、寓言、儿童故事', order: 5 },
    { id: 'film-script', domainId: 'film-theater', label: '影视剧本', description: '电影、电视剧、网剧剧本', order: 1 },
    { id: 'stage-play', domainId: 'film-theater', label: '舞台戏剧', description: '话剧、音乐剧、戏曲', order: 2 },
    { id: 'audio-drama', domainId: 'film-theater', label: '音频戏剧', description: '广播剧、有声剧、播客叙事', order: 3 },
    { id: 'game-story', domainId: 'games-interactive', label: '游戏剧情', description: '游戏主线、支线、任务文本', order: 1 },
    { id: 'interactive-fiction', domainId: 'games-interactive', label: '互动叙事', description: '互动小说、视觉小说、剧本杀', order: 2 },
    { id: 'brand-copy', domainId: 'marketing-brand', label: '品牌文案', description: '品牌故事、Slogan、品牌手册', order: 1 },
    { id: 'ad-copy', domainId: 'marketing-brand', label: '广告文案', description: '平面、视频、信息流广告', order: 2 },
    { id: 'ecommerce-copy', domainId: 'marketing-brand', label: '电商文案', description: '商品详情、活动页、种草', order: 3 },
    { id: 'content-marketing', domainId: 'marketing-brand', label: '内容营销', description: 'SEO文章、白皮书、案例研究', order: 4 },
    { id: 'social-media', domainId: 'marketing-brand', label: '社交媒体', description: '公众号、小红书、微博等', order: 5 },
    { id: 'video-script', domainId: 'marketing-brand', label: '视频直播', description: '短视频脚本、直播话术', order: 6 },
    { id: 'news-reporting', domainId: 'news-publishing', label: '新闻内容', description: '消息、报道、特写、评论', order: 1 },
    { id: 'publishing', domainId: 'news-publishing', label: '出版文本', description: '图书、书稿、编辑加工', order: 2 },
    { id: 'academic-paper', domainId: 'academic-research', label: '学术论文', description: '期刊、会议、学位论文', order: 1 },
    { id: 'research-report', domainId: 'academic-research', label: '研究报告', description: '调研报告、技术报告、分析报告', order: 2 },
    { id: 'grant-proposal', domainId: 'academic-research', label: '基金申请', description: '基金、项目申请书', order: 3 },
    { id: 'business-plan', domainId: 'business-enterprise', label: '商业战略', description: '商业计划书、战略规划、可行性研究', order: 1 },
    { id: 'proposal-bid', domainId: 'business-enterprise', label: '方案标书', description: '项目方案、投标书、合作方案', order: 2 },
    { id: 'internal-mgmt', domainId: 'business-enterprise', label: '内部管理', description: '制度、SOP、会议纪要、总结', order: 3 },
    { id: 'sales-copy', domainId: 'business-enterprise', label: '销售文本', description: '销售话术、提案书、客户案例', order: 4 },
    { id: 'legal-document', domainId: 'legal-government', label: '法律文书', description: '合同、协议、律师函、诉状', order: 1 },
    { id: 'government-doc', domainId: 'legal-government', label: '政务公文', description: '通知、报告、意见、方案', order: 2 },
    { id: 'compliance-doc', domainId: 'legal-government', label: '合规文档', description: '隐私政策、合规报告、风险告知', order: 3 },
    { id: 'software-doc', domainId: 'technical-docs', label: '软件文档', description: 'README、API文档、架构设计', order: 1 },
    { id: 'product-doc', domainId: 'technical-docs', label: '产品文档', description: 'PRD、需求文档、用户手册', order: 2 },
    { id: 'testing-doc', domainId: 'technical-docs', label: '测试文档', description: '测试计划、用例、报告', order: 3 },
    { id: 'knowledge-base', domainId: 'knowledge-assets', label: '知识库', description: 'Wiki、百科、术语表、RAG库', order: 1 },
    { id: 'creative-process', domainId: 'knowledge-assets', label: '创作过程', description: '大纲、设定、时间线、素材库', order: 2 }
  ]
  function getWriterFormsCatalog() {
    const presets = [
      { id: 'novel-outline', label: '故事大纲', description: '三幕结构故事大纲模板', documentType: 'outline', defaultPath: '规划/故事大纲.md', kind: 'file' },
      { id: 'character-bible', label: '人物设定', description: '主要人物档案模板', documentType: 'knowledge_asset', defaultPath: '设定/人物设定.md', kind: 'file' },
      { id: 'worldbuilding', label: '世界观设定', description: '世界观和规则设定', documentType: 'knowledge_asset', defaultPath: '设定/世界观.md', kind: 'file' },
      { id: 'timeline', label: '时间轴', description: '故事时间线模板', documentType: 'knowledge_asset', defaultPath: '设定/时间轴.md', kind: 'file' },
      { id: 'manuscript-dir', label: '正文章节', description: '正文写作目录', documentType: 'narrative_prose', defaultPath: '正文/', kind: 'directory' },
      { id: 'research-dir', label: '研究资料', description: '资料收集和研究笔记', documentType: 'research_material', defaultPath: '资料/', kind: 'directory' },
      { id: 'revisions-dir', label: '修订版本', description: '修订稿和版本对比', documentType: 'revision_artifact', defaultPath: '修订/', kind: 'directory' },
      { id: 'screenplay-outline', label: '剧本大纲', description: '三幕结构剧本大纲', documentType: 'outline', defaultPath: '规划/剧本大纲.md', kind: 'file' },
      { id: 'character-dossier', label: '人物小传', description: '角色人物小传', documentType: 'knowledge_asset', defaultPath: '人物/人物小传.md', kind: 'file' },
      { id: 'scene-list', label: '分场大纲', description: '场次列表和节拍表', documentType: 'outline', defaultPath: '规划/分场大纲.md', kind: 'file' },
      { id: 'scenes-dir', label: '场景剧本', description: '分场景剧本目录', documentType: 'script_dialogue', defaultPath: '剧本/场景/', kind: 'directory' },
      { id: 'story-bible', label: '剧集圣经', description: 'Series Bible 剧集设定', documentType: 'knowledge_asset', defaultPath: '设定/剧集圣经.md', kind: 'file' },
      { id: 'game-world', label: '世界观设定', description: '游戏世界和阵营设定', documentType: 'knowledge_asset', defaultPath: '设定/世界观.md', kind: 'file' },
      { id: 'main-quest', label: '主线剧情', description: '游戏主线剧情脚本', documentType: 'interactive_narrative', defaultPath: '剧情/主线.md', kind: 'file' },
      { id: 'character-dialogue', label: 'NPC对话', description: 'NPC 对话和语音台词', documentType: 'interactive_narrative', defaultPath: '对话/NPC/', kind: 'directory' },
      { id: 'quest-text', label: '任务文本', description: '任务描述和系统文本', documentType: 'interactive_narrative', defaultPath: '系统/任务文本.md', kind: 'file' },
      { id: 'brand-story', label: '品牌故事', description: '品牌定位和品牌故事', documentType: 'marketing_copy', defaultPath: '品牌/品牌故事.md', kind: 'file' },
      { id: 'brand-voice', label: '品牌语调', description: '品牌语调和命名规范', documentType: 'knowledge_asset', defaultPath: '品牌/语调指南.md', kind: 'file' },
      { id: 'slogan', label: 'Slogan 方案', description: '核心传播语和Tagline', documentType: 'marketing_copy', defaultPath: '品牌/Slogan.md', kind: 'file' },
      { id: 'ad-campaign', label: '广告文案', description: '广告创意和文案方案', documentType: 'marketing_copy', defaultPath: '广告/广告文案.md', kind: 'file' },
      { id: 'product-detail', label: '商品详情页', description: '电商商品详情文案', documentType: 'marketing_copy', defaultPath: '电商/商品详情.md', kind: 'file' },
      { id: 'content-calendar', label: '内容排期', description: '社交媒体内容日历', documentType: 'outline', defaultPath: '运营/内容排期.md', kind: 'file' },
      { id: 'seo-articles-dir', label: 'SEO文章', description: 'SEO优化文章目录', documentType: 'informational_article', defaultPath: '内容/SEO/', kind: 'directory' },
      { id: 'whitepaper', label: '白皮书', description: '行业白皮书或电子书', documentType: 'informational_article', defaultPath: '内容/白皮书.md', kind: 'file' },
      { id: 'news-article', label: '新闻报道', description: '新闻稿件模板', documentType: 'informational_article', defaultPath: '新闻/新闻稿.md', kind: 'file' },
      { id: 'press-release', label: '新闻通稿', description: '媒体通稿和发布会稿', documentType: 'informational_article', defaultPath: '公关/新闻通稿.md', kind: 'file' },
      { id: 'manuscript-book', label: '图书书稿', description: '图书正文稿件', documentType: 'narrative_prose', defaultPath: '书稿/正文/', kind: 'directory' },
      { id: 'book-proposal', label: '选题报告', description: '图书选题申报材料', documentType: 'structured_business_doc', defaultPath: '出版/选题报告.md', kind: 'file' },
      { id: 'academic-paper', label: '学术论文', description: '标准学术论文模板', documentType: 'argumentative_document', defaultPath: '论文/正文.md', kind: 'file' },
      { id: 'literature-review', label: '文献综述', description: '文献综述写作模板', documentType: 'argumentative_document', defaultPath: '论文/文献综述.md', kind: 'file' },
      { id: 'research-plan', label: '研究方案', description: '研究计划和实验方案', documentType: 'outline', defaultPath: '研究/研究方案.md', kind: 'file' },
      { id: 'grant-application', label: '基金申请书', description: '基金项目申请模板', documentType: 'structured_business_doc', defaultPath: '申请/基金申请书.md', kind: 'file' },
      { id: 'business-plan-doc', label: '商业计划书', description: '完整商业计划书模板', documentType: 'structured_business_doc', defaultPath: '商业/商业计划书.md', kind: 'file' },
      { id: 'prd', label: '产品需求文档', description: 'PRD 产品需求文档', documentType: 'structured_business_doc', defaultPath: '产品/PRD.md', kind: 'file' },
      { id: 'project-proposal', label: '项目方案', description: '项目建议书和方案', documentType: 'structured_business_doc', defaultPath: '项目/项目方案.md', kind: 'file' },
      { id: 'bid-proposal', label: '投标书', description: '投标文件模板', documentType: 'structured_business_doc', defaultPath: '投标/投标书.md', kind: 'file' },
      { id: 'meeting-minutes', label: '会议纪要', description: '会议记录模板', documentType: 'review_feedback', defaultPath: '会议/会议纪要.md', kind: 'file' },
      { id: 'weekly-report', label: '周报', description: '周工作总结模板', documentType: 'review_feedback', defaultPath: '汇报/周报.md', kind: 'file' },
      { id: 'sales-pitch', label: '销售提案', description: '销售提案和Pitch', documentType: 'marketing_copy', defaultPath: '销售/提案书.md', kind: 'file' },
      { id: 'contract-template', label: '合同模板', description: '标准合同模板', documentType: 'regulated_document', defaultPath: '法律/合同.md', kind: 'file' },
      { id: 'legal-opinion', label: '法律意见书', description: '法律意见模板', documentType: 'regulated_document', defaultPath: '法律/法律意见书.md', kind: 'file' },
      { id: 'privacy-policy', label: '隐私政策', description: '隐私政策模板', documentType: 'regulated_document', defaultPath: '合规/隐私政策.md', kind: 'file' },
      { id: 'government-notice', label: '通知通告', description: '政务通知公告', documentType: 'regulated_document', defaultPath: '公文/通知.md', kind: 'file' },
      { id: 'government-report', label: '工作报告', description: '政府/企业工作报告', documentType: 'structured_business_doc', defaultPath: '汇报/工作报告.md', kind: 'file' },
      { id: 'readme', label: '项目 README', description: '项目说明文档', documentType: 'technical_document', defaultPath: 'README.md', kind: 'file' },
      { id: 'api-docs', label: 'API 文档', description: 'API 接口文档', documentType: 'technical_document', defaultPath: 'docs/api.md', kind: 'file' },
      { id: 'architecture-doc', label: '架构设计', description: '系统架构设计文档', documentType: 'technical_document', defaultPath: 'docs/architecture.md', kind: 'file' },
      { id: 'tech-spec', label: '技术方案', description: '技术方案和设计文档', documentType: 'technical_document', defaultPath: 'docs/technical-design.md', kind: 'file' },
      { id: 'user-manual', label: '用户手册', description: '用户使用手册', documentType: 'technical_document', defaultPath: 'docs/user-manual.md', kind: 'file' },
      { id: 'test-plan', label: '测试计划', description: '测试计划和用例', documentType: 'technical_document', defaultPath: 'tests/test-plan.md', kind: 'file' },
      { id: 'release-notes', label: '版本说明', description: 'Release Notes / Changelog', documentType: 'revision_artifact', defaultPath: 'CHANGELOG.md', kind: 'file' },
      { id: 'wiki-home', label: 'Wiki 首页', description: '知识库首页和目录', documentType: 'knowledge_asset', defaultPath: 'wiki/Home.md', kind: 'file' },
      { id: 'glossary', label: '术语表', description: '术语和概念定义', documentType: 'knowledge_asset', defaultPath: 'wiki/术语表.md', kind: 'file' },
      { id: 'evidence-library', label: '证据库', description: '引用来源和证据档案', documentType: 'research_material', defaultPath: 'evidence/', kind: 'directory' },
      { id: 'soul-profile', label: 'Soul 档案', description: '风格和人格档案', documentType: 'knowledge_asset', defaultPath: 'soul/profile.md', kind: 'file' },
      { id: 'prompt-library', label: 'Prompt 库', description: '提示词模板库', documentType: 'knowledge_asset', defaultPath: 'prompts/', kind: 'directory' }
    ]
    const forms = [
      { id: 'web-novel', domainId: 'literature', familyId: 'novel', label: '网络小说', aliases: ['网文', '连载小说', '轻小说'], primaryDocumentType: 'narrative_prose', capabilityProfileId: 'long-form-narrative', documentPresetIds: ['novel-outline', 'character-bible', 'worldbuilding', 'timeline', 'manuscript-dir', 'research-dir', 'revisions-dir'], promptProfileId: 'narrative.novel.web', outputSchemaProfileId: 'narrative.chapters', workflowProfileIds: ['narrative.long-form', 'narrative.continuity'], knowledgeProfileId: 'story-bible', tags: ['小说', '网文', '连载', '长篇'] },
      { id: 'literary-novel', domainId: 'literature', familyId: 'novel', label: '长篇小说', aliases: ['严肃文学', '文学小说', '传统小说'], primaryDocumentType: 'narrative_prose', capabilityProfileId: 'literary-novel', documentPresetIds: ['novel-outline', 'character-bible', 'worldbuilding', 'manuscript-dir', 'revisions-dir'], promptProfileId: 'narrative.novel.literary', outputSchemaProfileId: 'narrative.chapters', workflowProfileIds: ['narrative.long-form'], knowledgeProfileId: 'story-bible', tags: ['小说', '文学', '长篇'] },
      { id: 'short-story', domainId: 'literature', familyId: 'novel', label: '短篇小说', aliases: ['短篇', '微型小说', '小小说'], primaryDocumentType: 'narrative_prose', capabilityProfileId: 'short-form-narrative', documentPresetIds: ['novel-outline', 'manuscript-dir', 'revisions-dir'], promptProfileId: 'narrative.short-story', outputSchemaProfileId: 'narrative.short', workflowProfileIds: ['narrative.short-form'], knowledgeProfileId: 'basic', tags: ['小说', '短篇'] },
      { id: 'biography', domainId: 'literature', familyId: 'nonfiction', label: '传记', aliases: ['自传', '回忆录', '人物传记'], primaryDocumentType: 'narrative_prose', capabilityProfileId: 'biography', documentPresetIds: ['research-dir', 'manuscript-dir', 'character-bible', 'timeline'], promptProfileId: 'nonfiction.biography', outputSchemaProfileId: 'narrative.chapters', workflowProfileIds: ['nonfiction.research'], knowledgeProfileId: 'research-heavy', tags: ['传记', '非虚构', '人物'] },
      { id: 'prose-essay', domainId: 'literature', familyId: 'prose', label: '散文随笔', aliases: ['随笔', '杂文', '游记', '专栏'], primaryDocumentType: 'narrative_prose', capabilityProfileId: 'essay', documentPresetIds: ['manuscript-dir', 'research-dir'], promptProfileId: 'narrative.essay', outputSchemaProfileId: 'article.standard', workflowProfileIds: ['short-form'], knowledgeProfileId: 'basic', tags: ['散文', '随笔', '专栏'] },
      { id: 'poetry-collection', domainId: 'literature', familyId: 'poetry', label: '诗歌集', aliases: ['现代诗', '古体诗', '歌词', '散文诗'], primaryDocumentType: 'narrative_prose', capabilityProfileId: 'poetry', documentPresetIds: ['manuscript-dir'], promptProfileId: 'narrative.poetry', outputSchemaProfileId: 'poetry.collection', workflowProfileIds: ['short-form'], knowledgeProfileId: 'basic', tags: ['诗歌', '诗词', '歌词'] },
      { id: 'childrens-story', domainId: 'literature', familyId: 'childrens-lit', label: '儿童故事', aliases: ['童话', '寓言', '儿童文学', '睡前故事'], primaryDocumentType: 'narrative_prose', capabilityProfileId: 'childrens-lit', documentPresetIds: ['novel-outline', 'character-bible', 'manuscript-dir'], promptProfileId: 'narrative.childrens', outputSchemaProfileId: 'narrative.chapters', workflowProfileIds: ['narrative.short-form'], knowledgeProfileId: 'story-bible', tags: ['儿童', '童话', '故事'] },
      { id: 'feature-film', domainId: 'film-theater', familyId: 'film-script', label: '电影剧本', aliases: ['院线电影', '网络电影', '微电影'], primaryDocumentType: 'script_dialogue', capabilityProfileId: 'screenplay-feature', documentPresetIds: ['screenplay-outline', 'character-dossier', 'scene-list', 'story-bible', 'scenes-dir'], promptProfileId: 'script.feature', outputSchemaProfileId: 'script.standard', workflowProfileIds: ['script.development'], knowledgeProfileId: 'story-bible', tags: ['电影', '剧本', '影视'] },
      { id: 'tv-script', domainId: 'film-theater', familyId: 'film-script', label: '电视剧剧本', aliases: ['剧集', '网剧', '短剧', '单元剧'], primaryDocumentType: 'script_dialogue', capabilityProfileId: 'screenplay-series', documentPresetIds: ['screenplay-outline', 'character-dossier', 'story-bible', 'scene-list', 'scenes-dir'], promptProfileId: 'script.episode', outputSchemaProfileId: 'script.standard', workflowProfileIds: ['script.series'], knowledgeProfileId: 'story-bible', tags: ['电视剧', '网剧', '剧集'] },
      { id: 'animation-script', domainId: 'film-theater', familyId: 'film-script', label: '动画剧本', aliases: ['动画电影', '番剧', '动画剧集'], primaryDocumentType: 'script_dialogue', capabilityProfileId: 'animation-script', documentPresetIds: ['screenplay-outline', 'character-dossier', 'scenes-dir'], promptProfileId: 'script.animation', outputSchemaProfileId: 'script.standard', workflowProfileIds: ['script.development'], knowledgeProfileId: 'story-bible', tags: ['动画', '剧本'] },
      { id: 'documentary-script', domainId: 'film-theater', familyId: 'film-script', label: '纪录片脚本', aliases: ['纪录片', '专题片', '宣传片'], primaryDocumentType: 'script_dialogue', capabilityProfileId: 'documentary', documentPresetIds: ['research-dir', 'scenes-dir', 'timeline'], promptProfileId: 'script.documentary', outputSchemaProfileId: 'script.documentary', workflowProfileIds: ['nonfiction.research'], knowledgeProfileId: 'research-heavy', tags: ['纪录片', '宣传片', '脚本'] },
      { id: 'stage-play', domainId: 'film-theater', familyId: 'stage-play', label: '话剧剧本', aliases: ['舞台剧', '戏剧', '小品'], primaryDocumentType: 'script_dialogue', capabilityProfileId: 'stage-play', documentPresetIds: ['screenplay-outline', 'character-dossier', 'scenes-dir'], promptProfileId: 'script.stage', outputSchemaProfileId: 'script.stage', workflowProfileIds: ['script.development'], knowledgeProfileId: 'story-bible', tags: ['话剧', '舞台', '戏剧'] },
      { id: 'audio-drama', domainId: 'film-theater', familyId: 'audio-drama', label: '广播剧', aliases: ['有声剧', '音频故事', '播客叙事'], primaryDocumentType: 'script_dialogue', capabilityProfileId: 'audio-drama', documentPresetIds: ['screenplay-outline', 'character-dossier', 'scenes-dir'], promptProfileId: 'script.audio', outputSchemaProfileId: 'script.audio', workflowProfileIds: ['script.development'], knowledgeProfileId: 'story-bible', tags: ['广播剧', '有声', '音频'] },
      { id: 'game-main-story', domainId: 'games-interactive', familyId: 'game-story', label: '游戏剧情', aliases: ['主线剧情', '支线剧情', '游戏脚本'], primaryDocumentType: 'interactive_narrative', capabilityProfileId: 'game-narrative', documentPresetIds: ['game-world', 'main-quest', 'character-dialogue', 'quest-text'], promptProfileId: 'game.story', outputSchemaProfileId: 'interactive.quest', workflowProfileIds: ['game.narrative'], knowledgeProfileId: 'game-world', tags: ['游戏', '剧情', '脚本'] },
      { id: 'interactive-fiction', domainId: 'games-interactive', familyId: 'interactive-fiction', label: '互动小说', aliases: ['视觉小说', '文字冒险', 'AVG'], primaryDocumentType: 'interactive_narrative', capabilityProfileId: 'interactive-fiction', documentPresetIds: ['game-world', 'character-dossier', 'main-quest'], promptProfileId: 'interactive.fiction', outputSchemaProfileId: 'interactive.branching', workflowProfileIds: ['interactive.branching'], knowledgeProfileId: 'story-bible', tags: ['互动小说', '视觉小说', '分支'] },
      { id: 'murder-mystery', domainId: 'games-interactive', familyId: 'interactive-fiction', label: '剧本杀', aliases: ['谋杀之谜', 'LARP', '跑团模组'], primaryDocumentType: 'interactive_narrative', capabilityProfileId: 'murder-mystery', documentPresetIds: ['game-world', 'character-dossier', 'timeline'], promptProfileId: 'interactive.mystery', outputSchemaProfileId: 'interactive.mystery', workflowProfileIds: ['interactive.branching'], knowledgeProfileId: 'story-bible', tags: ['剧本杀', '推理', '跑团'] },
      { id: 'brand-copywriting', domainId: 'marketing-brand', familyId: 'brand-copy', label: '品牌文案', aliases: ['品牌故事', '品牌定位', '品牌手册'], primaryDocumentType: 'marketing_copy', capabilityProfileId: 'brand-copy', documentPresetIds: ['brand-story', 'brand-voice', 'slogan'], promptProfileId: 'marketing.brand', outputSchemaProfileId: 'marketing.brand', workflowProfileIds: ['marketing.brand-development'], knowledgeProfileId: 'brand-knowledge', tags: ['品牌', '文案'] },
      { id: 'ad-copywriting', domainId: 'marketing-brand', familyId: 'ad-copy', label: '广告文案', aliases: ['平面广告', '视频广告', '信息流广告', '海报文案'], primaryDocumentType: 'marketing_copy', capabilityProfileId: 'ad-copy', documentPresetIds: ['ad-campaign', 'brand-voice'], promptProfileId: 'marketing.ad', outputSchemaProfileId: 'marketing.ad', workflowProfileIds: ['marketing.campaign'], knowledgeProfileId: 'brand-knowledge', tags: ['广告', '文案', '创意'] },
      { id: 'ecommerce-copy', domainId: 'marketing-brand', familyId: 'ecommerce-copy', label: '电商文案', aliases: ['商品详情', '详情页', '种草文案', '带货'], primaryDocumentType: 'marketing_copy', capabilityProfileId: 'ecommerce-copy', documentPresetIds: ['product-detail', 'brand-voice'], promptProfileId: 'marketing.ecommerce', outputSchemaProfileId: 'marketing.ecommerce', workflowProfileIds: ['marketing.campaign'], knowledgeProfileId: 'product-knowledge', tags: ['电商', '商品', '详情页'] },
      { id: 'content-marketing', domainId: 'marketing-brand', familyId: 'content-marketing', label: '内容营销', aliases: ['SEO文章', '白皮书', '案例研究', '博客'], primaryDocumentType: 'informational_article', capabilityProfileId: 'content-marketing', documentPresetIds: ['content-calendar', 'seo-articles-dir', 'whitepaper'], promptProfileId: 'marketing.content', outputSchemaProfileId: 'article.standard', workflowProfileIds: ['content.marketing'], knowledgeProfileId: 'brand-knowledge', tags: ['内容营销', 'SEO', '白皮书'] },
      { id: 'social-media', domainId: 'marketing-brand', familyId: 'social-media', label: '社交媒体', aliases: ['公众号', '小红书', '微博', '抖音文案'], primaryDocumentType: 'marketing_copy', capabilityProfileId: 'social-media', documentPresetIds: ['content-calendar', 'brand-voice'], promptProfileId: 'marketing.social', outputSchemaProfileId: 'marketing.social', workflowProfileIds: ['content.marketing'], knowledgeProfileId: 'brand-knowledge', tags: ['社媒', '公众号', '小红书'] },
      { id: 'video-live', domainId: 'marketing-brand', familyId: 'video-script', label: '短视频脚本', aliases: ['口播稿', '直播话术', 'Vlog脚本', '测评脚本'], primaryDocumentType: 'script_dialogue', capabilityProfileId: 'video-script', documentPresetIds: ['content-calendar'], promptProfileId: 'video.short-form', outputSchemaProfileId: 'script.short-video', workflowProfileIds: ['short-form'], knowledgeProfileId: 'brand-knowledge', tags: ['短视频', '直播', '脚本'] },
      { id: 'news-reporting', domainId: 'news-publishing', familyId: 'news-reporting', label: '新闻报道', aliases: ['消息', '通讯', '特写', '深度报道', '调查报道'], primaryDocumentType: 'informational_article', capabilityProfileId: 'news-reporting', documentPresetIds: ['news-article', 'research-dir'], promptProfileId: 'journalism.news', outputSchemaProfileId: 'article.news', workflowProfileIds: ['journalism.investigative'], knowledgeProfileId: 'research-heavy', tags: ['新闻', '报道', '媒体'] },
      { id: 'press-release', domainId: 'news-publishing', familyId: 'news-reporting', label: '新闻通稿', aliases: ['媒体通稿', '公关稿', '新闻发布'], primaryDocumentType: 'informational_article', capabilityProfileId: 'pr', documentPresetIds: ['press-release', 'brand-voice'], promptProfileId: 'pr.release', outputSchemaProfileId: 'article.press-release', workflowProfileIds: ['pr.communications'], knowledgeProfileId: 'brand-knowledge', tags: ['公关', '通稿', '新闻稿'] },
      { id: 'book-publishing', domainId: 'news-publishing', familyId: 'publishing', label: '图书出版', aliases: ['书稿', '图书选题', '编辑加工'], primaryDocumentType: 'narrative_prose', capabilityProfileId: 'book-publishing', documentPresetIds: ['manuscript-book', 'book-proposal', 'revisions-dir'], promptProfileId: 'publishing.book', outputSchemaProfileId: 'narrative.chapters', workflowProfileIds: ['publishing.editorial'], knowledgeProfileId: 'basic', tags: ['出版', '图书', '书稿'] },
      { id: 'academic-paper', domainId: 'academic-research', familyId: 'academic-paper', label: '学术论文', aliases: ['期刊论文', '会议论文', '学位论文', '毕业论文'], primaryDocumentType: 'argumentative_document', capabilityProfileId: 'academic-paper', documentPresetIds: ['academic-paper', 'literature-review', 'research-plan'], promptProfileId: 'academic.paper', outputSchemaProfileId: 'academic.paper', workflowProfileIds: ['academic.research'], knowledgeProfileId: 'research-heavy', tags: ['论文', '学术', '科研'] },
      { id: 'research-report', domainId: 'academic-research', familyId: 'research-report', label: '研究报告', aliases: ['调研报告', '技术报告', '数据分析报告'], primaryDocumentType: 'argumentative_document', capabilityProfileId: 'research-report', documentPresetIds: ['research-plan', 'research-dir'], promptProfileId: 'research.report', outputSchemaProfileId: 'report.standard', workflowProfileIds: ['academic.research'], knowledgeProfileId: 'research-heavy', tags: ['研究', '报告', '调研'] },
      { id: 'grant-writing', domainId: 'academic-research', familyId: 'grant-proposal', label: '基金申请', aliases: ['国自然', '社科基金', '项目申请', '开题报告'], primaryDocumentType: 'structured_business_doc', capabilityProfileId: 'grant-writing', documentPresetIds: ['grant-application', 'research-plan', 'literature-review'], promptProfileId: 'grant.proposal', outputSchemaProfileId: 'grant.application', workflowProfileIds: ['grant.proposal'], knowledgeProfileId: 'research-heavy', tags: ['基金', '申请', '项目'] },
      { id: 'business-plan', domainId: 'business-enterprise', familyId: 'business-plan', label: '商业计划书', aliases: ['创业计划', '战略规划', '可行性研究'], primaryDocumentType: 'structured_business_doc', capabilityProfileId: 'business-plan', documentPresetIds: ['business-plan-doc', 'research-dir'], promptProfileId: 'business.plan', outputSchemaProfileId: 'business.plan', workflowProfileIds: ['business.planning'], knowledgeProfileId: 'market-research', tags: ['商业计划', '创业', '战略'] },
      { id: 'proposal-bid', domainId: 'business-enterprise', familyId: 'proposal-bid', label: '项目方案', aliases: ['建议书', '解决方案', '投标', '标书'], primaryDocumentType: 'structured_business_doc', capabilityProfileId: 'proposal-writing', documentPresetIds: ['project-proposal', 'bid-proposal'], promptProfileId: 'business.proposal', outputSchemaProfileId: 'business.proposal', workflowProfileIds: ['business.proposal'], knowledgeProfileId: 'product-knowledge', tags: ['方案', '投标', '项目'] },
      { id: 'internal-docs', domainId: 'business-enterprise', familyId: 'internal-mgmt', label: '内部管理文档', aliases: ['制度', 'SOP', '会议纪要', '周报', '总结'], primaryDocumentType: 'structured_business_doc', capabilityProfileId: 'internal-docs', documentPresetIds: ['meeting-minutes', 'weekly-report'], promptProfileId: 'business.internal', outputSchemaProfileId: 'business.internal', workflowProfileIds: ['internal.docs'], knowledgeProfileId: 'basic', tags: ['内部', '管理', '制度'] },
      { id: 'sales-copy', domainId: 'business-enterprise', familyId: 'sales-copy', label: '销售文本', aliases: ['销售话术', '客户案例', '提案书', '拜访提纲'], primaryDocumentType: 'marketing_copy', capabilityProfileId: 'sales-enablement', documentPresetIds: ['sales-pitch', 'brand-voice'], promptProfileId: 'sales.copy', outputSchemaProfileId: 'sales.proposal', workflowProfileIds: ['sales.enablement'], knowledgeProfileId: 'product-knowledge', tags: ['销售', '话术', '案例'] },
      { id: 'legal-docs', domainId: 'legal-government', familyId: 'legal-document', label: '法律文书', aliases: ['合同', '协议', '律师函', '诉状', '法律意见书'], primaryDocumentType: 'regulated_document', capabilityProfileId: 'legal-document', documentPresetIds: ['contract-template', 'legal-opinion'], promptProfileId: 'legal.document', outputSchemaProfileId: 'legal.contract', workflowProfileIds: ['legal.review'], knowledgeProfileId: 'legal-research', tags: ['法律', '合同', '合规'] },
      { id: 'government-docs', domainId: 'legal-government', familyId: 'government-doc', label: '政务公文', aliases: ['通知', '报告', '意见', '方案', '请示'], primaryDocumentType: 'regulated_document', capabilityProfileId: 'government-document', documentPresetIds: ['government-notice', 'government-report'], promptProfileId: 'government.document', outputSchemaProfileId: 'government.standard', workflowProfileIds: ['government.docs'], knowledgeProfileId: 'policy-research', tags: ['政务', '公文', '政府'] },
      { id: 'compliance-docs', domainId: 'legal-government', familyId: 'compliance-doc', label: '合规文档', aliases: ['隐私政策', '用户协议', '合规报告', '风险告知'], primaryDocumentType: 'regulated_document', capabilityProfileId: 'compliance', documentPresetIds: ['privacy-policy', 'legal-opinion'], promptProfileId: 'compliance.document', outputSchemaProfileId: 'legal.compliance', workflowProfileIds: ['legal.review'], knowledgeProfileId: 'legal-research', tags: ['合规', '隐私', '政策'] },
      { id: 'software-docs', domainId: 'technical-docs', familyId: 'software-doc', label: '软件项目文档', aliases: ['README', 'API文档', '架构设计', '开发文档'], primaryDocumentType: 'technical_document', capabilityProfileId: 'software-docs', documentPresetIds: ['readme', 'api-docs', 'architecture-doc', 'tech-spec', 'release-notes'], promptProfileId: 'tech.software', outputSchemaProfileId: 'technical.api', workflowProfileIds: ['tech.documentation'], knowledgeProfileId: 'tech-wiki', tags: ['软件', '开发', 'API'] },
      { id: 'product-docs', domainId: 'technical-docs', familyId: 'product-doc', label: '产品文档', aliases: ['PRD', '需求文档', '用户手册', '帮助中心'], primaryDocumentType: 'technical_document', capabilityProfileId: 'product-docs', documentPresetIds: ['prd', 'user-manual'], promptProfileId: 'tech.product', outputSchemaProfileId: 'technical.product', workflowProfileIds: ['product.docs'], knowledgeProfileId: 'product-knowledge', tags: ['产品', 'PRD', '需求'] },
      { id: 'testing-docs', domainId: 'technical-docs', familyId: 'testing-doc', label: '测试文档', aliases: ['测试计划', '测试用例', '测试报告', 'Bug报告'], primaryDocumentType: 'technical_document', capabilityProfileId: 'testing-docs', documentPresetIds: ['test-plan'], promptProfileId: 'tech.testing', outputSchemaProfileId: 'technical.test', workflowProfileIds: ['qa.testing'], knowledgeProfileId: 'tech-wiki', tags: ['测试', 'QA', '用例'] },
      { id: 'knowledge-base', domainId: 'knowledge-assets', familyId: 'knowledge-base', label: '知识库/Wiki', aliases: ['百科', '术语表', '内部Wiki', 'RAG资料库'], primaryDocumentType: 'knowledge_asset', capabilityProfileId: 'knowledge-base', documentPresetIds: ['wiki-home', 'glossary', 'evidence-library', 'prompt-library'], promptProfileId: 'knowledge.base', outputSchemaProfileId: 'knowledge.wiki', workflowProfileIds: ['knowledge.management'], knowledgeProfileId: 'full-wiki', tags: ['知识库', 'Wiki', '百科'] },
      { id: 'creative-workspace', domainId: 'knowledge-assets', familyId: 'creative-process', label: '创作工作空间', aliases: ['大纲设定', '素材库', '时间线', '灵感收集'], primaryDocumentType: 'knowledge_asset', capabilityProfileId: 'creative-workspace', documentPresetIds: ['novel-outline', 'character-bible', 'worldbuilding', 'timeline', 'research-dir', 'prompt-library', 'soul-profile'], promptProfileId: 'creative.workspace', outputSchemaProfileId: 'knowledge.wiki', workflowProfileIds: ['creative.process'], knowledgeProfileId: 'story-bible', tags: ['创作', '设定', '素材'] }
    ]
    const workflowTemplates = [
      { id: 'narrative-long-form', name: '长篇创作工作流', description: '从大纲到完稿的全流程长篇小说创作工作流', icon: 'book', category: 'creation', applicableDocTypes: ['narrative_prose'], applicableFormIds: ['web-novel', 'literary-novel', 'biography', 'book-publishing'], minComplexity: 'complex', estimatedSteps: 8, tags: ['长篇', '小说', '创作'], recommendedFor: ['网络小说', '长篇小说', '传记', '图书出版'], nodes: [{ id: 'outline', type: 'planning', label: '大纲规划' }, { id: 'character', type: 'creation', label: '人物设定' }, { id: 'worldbuilding', type: 'creation', label: '世界观构建' }, { id: 'drafting', type: 'creation', label: '初稿写作' }, { id: 'review', type: 'review', label: '内容审阅' }, { id: 'revision', type: 'revision', label: '修订润色' }, { id: 'continuity', type: 'review', label: '连续性检查' }, { id: 'finalize', type: 'publication', label: '定稿输出' }] },
      { id: 'narrative-character-consistency', name: '人物一致性检查', description: '检查全文人物性格、语言风格、行为逻辑的一致性', icon: 'users', category: 'review', applicableDocTypes: ['narrative_prose', 'script_dialogue', 'interactive_narrative'], minComplexity: 'medium', estimatedSteps: 4, tags: ['人物', '一致性', '审阅'], recommendedFor: ['长篇小说', '剧本', '互动叙事'], nodes: [{ id: 'extract', type: 'analysis', label: '提取人物档案' }, { id: 'analyze', type: 'analysis', label: '分析人物表现' }, { id: 'identify', type: 'review', label: '识别不一致点' }, { id: 'report', type: 'output', label: '生成修订建议' }] },
      { id: 'narrative-pacing-assessment', name: '情节节奏评估', description: '评估故事节奏分布，识别拖沓或仓促段落', icon: 'chart-line', category: 'review', applicableDocTypes: ['narrative_prose', 'script_dialogue'], minComplexity: 'medium', estimatedSteps: 5, tags: ['节奏', '情节', '评估'], recommendedFor: ['小说', '剧本'], nodes: [{ id: 'segment', type: 'analysis', label: '分段解析' }, { id: 'tension', type: 'analysis', label: '张力曲线分析' }, { id: 'pacing', type: 'analysis', label: '节奏分布评估' }, { id: 'issues', type: 'review', label: '问题定位' }, { id: 'suggestions', type: 'output', label: '优化建议' }] },
      { id: 'narrative-chapter-continuity', name: '章节连续性校对', description: '检查章节之间的情节、人物、时间线连续性', icon: 'link', category: 'review', applicableDocTypes: ['narrative_prose'], applicableFormIds: ['web-novel', 'literary-novel'], minComplexity: 'medium', estimatedSteps: 4, tags: ['章节', '连续性', '校对'], recommendedFor: ['连载小说', '长篇小说'], nodes: [{ id: 'summary', type: 'analysis', label: '章节摘要提取' }, { id: 'timeline', type: 'analysis', label: '时间线梳理' }, { id: 'check', type: 'review', label: '连续性检查' }, { id: 'report', type: 'output', label: '问题报告' }] },
      { id: 'script-development', name: '剧本开发工作流', description: '从概念到分场的完整剧本开发流程', icon: 'device-camera-video', category: 'creation', applicableDocTypes: ['script_dialogue'], applicableFormIds: ['feature-film', 'tv-script', 'animation-script', 'stage-play'], minComplexity: 'complex', estimatedSteps: 7, tags: ['剧本', '开发', '创作'], recommendedFor: ['电影剧本', '电视剧本', '动画剧本', '话剧剧本'], nodes: [{ id: 'logline', type: 'planning', label: '一句话概念' }, { id: 'treatment', type: 'planning', label: '故事梗概' }, { id: 'outline', type: 'planning', label: '剧本大纲' }, { id: 'character', type: 'creation', label: '人物小传' }, { id: 'scenelist', type: 'planning', label: '分场大纲' }, { id: 'draft', type: 'creation', label: '初稿写作' }, { id: 'polish', type: 'revision', label: '润色定稿' }] },
      { id: 'script-dialogue-polish', name: '对白润色', description: '优化对白的口语化、个性化和潜台词表达', icon: 'message', category: 'review', applicableDocTypes: ['script_dialogue'], minComplexity: 'simple', estimatedSteps: 3, tags: ['对白', '润色', '语言'], recommendedFor: ['所有剧本类型'], nodes: [{ id: 'analyze', type: 'analysis', label: '对白分析' }, { id: 'polish', type: 'revision', label: '润色优化' }, { id: 'review', type: 'review', label: '质量检查' }] },
      { id: 'script-scene-pacing', name: '场景节奏检查', description: '评估场景长度、冲突密度和视觉节奏', icon: 'clock', category: 'review', applicableDocTypes: ['script_dialogue'], minComplexity: 'medium', estimatedSteps: 4, tags: ['场景', '节奏', '审阅'], recommendedFor: ['影视剧本', '舞台剧本'], nodes: [{ id: 'timing', type: 'analysis', label: '时长估算' }, { id: 'conflict', type: 'analysis', label: '冲突密度分析' }, { id: 'visual', type: 'analysis', label: '视觉节奏评估' }, { id: 'report', type: 'output', label: '调整建议' }] },
      { id: 'script-scene-outline', name: '分场大纲生成', description: '从故事大纲自动生成详细的分场大纲', icon: 'list', category: 'planning', applicableDocTypes: ['script_dialogue', 'outline'], minComplexity: 'medium', estimatedSteps: 4, tags: ['分场', '大纲', '规划'], recommendedFor: ['影视剧本', '舞台剧本'], nodes: [{ id: 'analyze', type: 'analysis', label: '大纲分析' }, { id: 'breakdown', type: 'planning', label: '场次拆解' }, { id: 'detail', type: 'creation', label: '场次细化' }, { id: 'output', type: 'output', label: '分场表输出' }] },
      { id: 'interactive-branch-design', name: '分支剧情设计', description: '设计和构建多分支互动叙事结构', icon: 'git-branch', category: 'creation', applicableDocTypes: ['interactive_narrative'], applicableFormIds: ['interactive-fiction', 'murder-mystery', 'game-main-story'], minComplexity: 'complex', estimatedSteps: 6, tags: ['分支', '互动', '设计'], recommendedFor: ['互动小说', '剧本杀', '游戏剧情'], nodes: [{ id: 'trunk', type: 'planning', label: '主干剧情设计' }, { id: 'branches', type: 'planning', label: '分支点规划' }, { id: 'variables', type: 'planning', label: '状态变量设计' }, { id: 'writing', type: 'creation', label: '分支内容写作' }, { id: 'mapping', type: 'review', label: '分支映射检查' }, { id: 'finalize', type: 'output', label: '结构化输出' }] },
      { id: 'interactive-branch-consistency', name: '分支一致性检查', description: '验证所有分支路径的逻辑一致性和完整性', icon: 'git-merge', category: 'review', applicableDocTypes: ['interactive_narrative'], minComplexity: 'complex', estimatedSteps: 5, tags: ['分支', '一致性', '检查'], recommendedFor: ['互动叙事', '游戏剧情'], nodes: [{ id: 'map', type: 'analysis', label: '构建分支图谱' }, { id: 'deadends', type: 'review', label: '死路检测' }, { id: 'logic', type: 'review', label: '逻辑一致性检查' }, { id: 'coverage', type: 'analysis', label: '路径覆盖分析' }, { id: 'report', type: 'output', label: '问题报告' }] },
      { id: 'interactive-npc-dialogue', name: 'NPC对话生成', description: '批量生成符合人物设定的NPC对话内容', icon: 'message-circle', category: 'creation', applicableDocTypes: ['interactive_narrative'], applicableFormIds: ['game-main-story'], minComplexity: 'medium', estimatedSteps: 4, tags: ['NPC', '对话', '生成'], recommendedFor: ['游戏剧情', '互动叙事'], nodes: [{ id: 'profile', type: 'analysis', label: '人物档案提取' }, { id: 'topics', type: 'planning', label: '对话主题规划' }, { id: 'generate', type: 'creation', label: '对话内容生成' }, { id: 'quality', type: 'review', label: '质量校验' }] },
      { id: 'interactive-state-validation', name: '状态变量校验', description: '检查状态变量的定义、使用和变更逻辑', icon: 'database', category: 'review', applicableDocTypes: ['interactive_narrative'], minComplexity: 'medium', estimatedSteps: 4, tags: ['状态', '变量', '校验'], recommendedFor: ['互动小说', '游戏剧情'], nodes: [{ id: 'extract', type: 'analysis', label: '提取变量定义' }, { id: 'usage', type: 'analysis', label: '变量使用分析' }, { id: 'validate', type: 'review', label: '变更逻辑校验' }, { id: 'report', type: 'output', label: '问题报告' }] },
      { id: 'marketing-copy-workflow', name: '文案创作工作流', description: '从策略到成品的完整营销文案创作流程', icon: 'megaphone', category: 'creation', applicableDocTypes: ['marketing_copy'], applicableFormIds: ['brand-copywriting', 'ad-copywriting', 'ecommerce-copy', 'social-media', 'sales-copy'], minComplexity: 'medium', estimatedSteps: 6, tags: ['文案', '营销', '创作'], recommendedFor: ['品牌文案', '广告文案', '电商文案', '社交媒体'], nodes: [{ id: 'brief', type: 'planning', label: '需求Brief分析' }, { id: 'strategy', type: 'planning', label: '传播策略制定' }, { id: 'concept', type: 'creation', label: '创意概念发想' }, { id: 'draft', type: 'creation', label: '文案初稿' }, { id: 'review', type: 'review', label: '效果评估' }, { id: 'finalize', type: 'revision', label: '优化定稿' }] },
      { id: 'marketing-ab-variants', name: 'A/B变体生成', description: '生成多版本文案变体用于A/B测试', icon: 'split', category: 'creation', applicableDocTypes: ['marketing_copy'], minComplexity: 'simple', estimatedSteps: 3, tags: ['A/B测试', '变体', '优化'], recommendedFor: ['广告文案', '电商文案', '社媒文案'], nodes: [{ id: 'analyze', type: 'analysis', label: '原文案分析' }, { id: 'generate', type: 'creation', label: '多变体生成' }, { id: 'package', type: 'output', label: '测试方案打包' }] },
      { id: 'marketing-fact-check', name: '事实声明核查', description: '核查文案中的事实声明、数据引用和功效承诺', icon: 'shield-check', category: 'review', applicableDocTypes: ['marketing_copy', 'informational_article'], minComplexity: 'medium', estimatedSteps: 4, tags: ['事实核查', '合规', '风险'], recommendedFor: ['营销文案', '资讯文章'], nodes: [{ id: 'extract', type: 'analysis', label: '提取事实声明' }, { id: 'verify', type: 'research', label: '交叉验证' }, { id: 'risk', type: 'review', label: '风险评估' }, { id: 'report', type: 'output', label: '核查报告' }] },
      { id: 'marketing-channel-adaptation', name: '渠道适配优化', description: '将核心文案适配到不同传播渠道的格式和风格', icon: 'share-2', category: 'publication', applicableDocTypes: ['marketing_copy'], minComplexity: 'simple', estimatedSteps: 3, tags: ['渠道', '适配', '多平台'], recommendedFor: ['全渠道营销'], nodes: [{ id: 'analyze', type: 'analysis', label: '核心信息提取' }, { id: 'adapt', type: 'creation', label: '各渠道适配' }, { id: 'output', type: 'output', label: '多版本输出' }] },
      { id: 'informational-article-workflow', name: '科普文章工作流', description: '从选题到成稿的科普/资讯文章创作流程', icon: 'newspaper', category: 'creation', applicableDocTypes: ['informational_article'], applicableFormIds: ['content-marketing', 'news-reporting', 'press-release'], minComplexity: 'medium', estimatedSteps: 6, tags: ['科普', '资讯', '文章'], recommendedFor: ['科普文章', '新闻报道', '内容营销'], nodes: [{ id: 'topic', type: 'planning', label: '选题规划' }, { id: 'research', type: 'research', label: '资料研究' }, { id: 'outline', type: 'planning', label: '结构大纲' }, { id: 'draft', type: 'creation', label: '初稿写作' }, { id: 'factcheck', type: 'review', label: '事实核查' }, { id: 'polish', type: 'revision', label: '润色定稿' }] },
      { id: 'informational-fact-check', name: '事实核查', description: '系统性核查文章中的事实、数据和引用', icon: 'search-check', category: 'review', applicableDocTypes: ['informational_article', 'argumentative_document'], minComplexity: 'medium', estimatedSteps: 5, tags: ['事实核查', '准确性', '引用'], recommendedFor: ['新闻报道', '学术论文', '科普文章'], nodes: [{ id: 'extract', type: 'analysis', label: '提取待核查项' }, { id: 'sources', type: 'research', label: '来源检索' }, { id: 'verify', type: 'review', label: '交叉验证' }, { id: 'cite', type: 'revision', label: '引用规范' }, { id: 'report', type: 'output', label: '核查报告' }] },
      { id: 'informational-structure-optimization', name: '结构优化', description: '优化文章结构，提升可读性和信息传达效率', icon: 'layout', category: 'review', applicableDocTypes: ['informational_article', 'argumentative_document'], minComplexity: 'medium', estimatedSteps: 4, tags: ['结构', '优化', '可读性'], recommendedFor: ['资讯文章', '论文', '报告'], nodes: [{ id: 'analyze', type: 'analysis', label: '结构分析' }, { id: 'evaluate', type: 'review', label: '逻辑性评估' }, { id: 'restructure', type: 'revision', label: '结构重构' }, { id: 'review', type: 'review', label: '效果验证' }] },
      { id: 'informational-multi-version', name: '多版本改写', description: '基于同一主题生成不同角度和深度的文章版本', icon: 'copy', category: 'creation', applicableDocTypes: ['informational_article'], minComplexity: 'simple', estimatedSteps: 3, tags: ['改写', '多版本', '内容矩阵'], recommendedFor: ['内容营销', 'SEO文章'], nodes: [{ id: 'analyze', type: 'analysis', label: '核心内容提取' }, { id: 'generate', type: 'creation', label: '多版本生成' }, { id: 'output', type: 'output', label: '版本输出' }] },
      { id: 'argumentative-paper-workflow', name: '论文写作工作流', description: '学术论文从选题到投稿的完整写作流程', icon: 'library', category: 'creation', applicableDocTypes: ['argumentative_document'], applicableFormIds: ['academic-paper', 'research-report'], minComplexity: 'complex', estimatedSteps: 8, tags: ['论文', '学术', '科研'], recommendedFor: ['学术论文', '研究报告'], nodes: [{ id: 'topic', type: 'planning', label: '选题确定' }, { id: 'literature', type: 'research', label: '文献综述' }, { id: 'methodology', type: 'planning', label: '研究方法设计' }, { id: 'outline', type: 'planning', label: '论文大纲' }, { id: 'draft', type: 'creation', label: '初稿写作' }, { id: 'logic', type: 'review', label: '论证逻辑检查' }, { id: 'citation', type: 'revision', label: '引文格式规范' }, { id: 'finalize', type: 'output', label: '定稿排版' }] },
      { id: 'argumentative-logic-check', name: '论证逻辑检查', description: '检查论文论证的严密性、逻辑性和说服力', icon: 'puzzle', category: 'review', applicableDocTypes: ['argumentative_document'], minComplexity: 'complex', estimatedSteps: 5, tags: ['论证', '逻辑', '审阅'], recommendedFor: ['学术论文', '研究报告'], nodes: [{ id: 'extract', type: 'analysis', label: '提取论证结构' }, { id: 'premises', type: 'review', label: '前提有效性检查' }, { id: 'reasoning', type: 'review', label: '推理过程分析' }, { id: 'fallacies', type: 'review', label: '逻辑谬误识别' }, { id: 'report', type: 'output', label: '改进建议' }] },
      { id: 'argumentative-citation-check', name: '引文格式校验', description: '检查引文格式的一致性和规范性', icon: 'quote', category: 'review', applicableDocTypes: ['argumentative_document', 'informational_article'], minComplexity: 'simple', estimatedSteps: 3, tags: ['引文', '格式', '规范'], recommendedFor: ['学术论文', '研究报告'], nodes: [{ id: 'extract', type: 'analysis', label: '提取引用标记' }, { id: 'check', type: 'review', label: '格式校验' }, { id: 'fix', type: 'revision', label: '格式修正' }] },
      { id: 'argumentative-counter-review', name: '反方视角审阅', description: '从反方视角审视论证，发现薄弱环节', icon: 'scale', category: 'review', applicableDocTypes: ['argumentative_document', 'structured_business_doc'], minComplexity: 'medium', estimatedSteps: 4, tags: ['反方', '审阅', '批判性思维'], recommendedFor: ['学术论文', '商业方案', '论证文档'], nodes: [{ id: 'identify', type: 'analysis', label: '识别核心论点' }, { id: 'counter', type: 'research', label: '构建反方论证' }, { id: 'weakness', type: 'review', label: '发现薄弱环节' }, { id: 'suggestions', type: 'output', label: '强化建议' }] },
      { id: 'business-proposal-workflow', name: '方案撰写工作流', description: '商业/项目方案从需求到定稿的完整流程', icon: 'briefcase', category: 'creation', applicableDocTypes: ['structured_business_doc'], applicableFormIds: ['business-plan', 'proposal-bid', 'grant-writing', 'product-docs'], minComplexity: 'complex', estimatedSteps: 7, tags: ['方案', '商业', '项目'], recommendedFor: ['商业计划书', '项目方案', '投标书', '基金申请'], nodes: [{ id: 'requirements', type: 'planning', label: '需求分析' }, { id: 'research', type: 'research', label: '背景调研' }, { id: 'structure', type: 'planning', label: '结构设计' }, { id: 'content', type: 'creation', label: '内容撰写' }, { id: 'risk', type: 'review', label: '风险评估' }, { id: 'stakeholder', type: 'review', label: '利益相关者分析' }, { id: 'finalize', type: 'revision', label: '润色定稿' }] },
      { id: 'business-risk-assessment', name: '风险评估', description: '系统性识别和评估方案中的各类风险', icon: 'alert-triangle', category: 'review', applicableDocTypes: ['structured_business_doc'], minComplexity: 'medium', estimatedSteps: 5, tags: ['风险', '评估', '管理'], recommendedFor: ['商业计划', '项目方案', '投标书'], nodes: [{ id: 'identify', type: 'analysis', label: '风险识别' }, { id: 'analyze', type: 'analysis', label: '风险分析' }, { id: 'evaluate', type: 'review', label: '风险评估' }, { id: 'mitigation', type: 'planning', label: '应对策略' }, { id: 'report', type: 'output', label: '风险报告' }] },
      { id: 'business-milestone-planning', name: '里程碑规划', description: '制定项目里程碑和关键时间节点', icon: 'flag', category: 'planning', applicableDocTypes: ['structured_business_doc', 'outline'], minComplexity: 'medium', estimatedSteps: 4, tags: ['里程碑', '时间线', '规划'], recommendedFor: ['项目方案', '商业计划'], nodes: [{ id: 'goals', type: 'analysis', label: '目标拆解' }, { id: 'milestones', type: 'planning', label: '里程碑定义' }, { id: 'timeline', type: 'planning', label: '时间线规划' }, { id: 'output', type: 'output', label: '计划表输出' }] },
      { id: 'business-stakeholder-analysis', name: '利益相关者分析', description: '识别和分析项目涉及的各方利益相关者', icon: 'users', category: 'research', applicableDocTypes: ['structured_business_doc'], minComplexity: 'medium', estimatedSteps: 4, tags: ['利益相关者', '分析', '沟通'], recommendedFor: ['商业方案', '项目计划'], nodes: [{ id: 'identify', type: 'analysis', label: '识别相关方' }, { id: 'analyze', type: 'analysis', label: '利益与影响力分析' }, { id: 'map', type: 'planning', label: '利益相关者地图' }, { id: 'strategy', type: 'planning', label: '沟通策略' }] },
      { id: 'regulated-document-workflow', name: '合规文档工作流', description: '合规文档从起草到审核的完整流程', icon: 'shield', category: 'creation', applicableDocTypes: ['regulated_document'], applicableFormIds: ['legal-docs', 'government-docs', 'compliance-docs'], minComplexity: 'complex', estimatedSteps: 7, tags: ['合规', '法律', '政务'], recommendedFor: ['法律文书', '政务公文', '合规文档'], nodes: [{ id: 'requirements', type: 'planning', label: '法规要求分析' }, { id: 'template', type: 'planning', label: '模板选择' }, { id: 'draft', type: 'creation', label: '初稿起草' }, { id: 'clause-review', type: 'review', label: '条款风险审查' }, { id: 'traceability', type: 'review', label: '依据溯源' }, { id: 'human-review', type: 'review', label: '人工确认流程' }, { id: 'finalize', type: 'output', label: '定稿用印' }] },
      { id: 'regulated-clause-risk', name: '条款风险审查', description: '审查合同/协议条款的法律风险和漏洞', icon: 'file-search', category: 'review', applicableDocTypes: ['regulated_document'], minComplexity: 'complex', estimatedSteps: 5, tags: ['条款', '风险', '法律审查'], recommendedFor: ['合同', '协议', '法律文书'], nodes: [{ id: 'extract', type: 'analysis', label: '关键条款提取' }, { id: 'risk-scan', type: 'review', label: '风险点扫描' }, { id: 'liability', type: 'review', label: '责任条款分析' }, { id: 'compliance', type: 'review', label: '合规性检查' }, { id: 'report', type: 'output', label: '风险报告' }] },
      { id: 'regulated-traceability', name: '依据溯源', description: '为文档中的每个关键主张追溯法规和依据', icon: 'git-compare', category: 'research', applicableDocTypes: ['regulated_document', 'argumentative_document'], minComplexity: 'medium', estimatedSteps: 4, tags: ['溯源', '依据', '合规'], recommendedFor: ['合规文档', '法律文书', '政务公文'], nodes: [{ id: 'extract', type: 'analysis', label: '提取关键主张' }, { id: 'research', type: 'research', label: '法规依据检索' }, { id: 'mapping', type: 'review', label: '依据映射' }, { id: 'output', type: 'output', label: '溯源清单' }] },
      { id: 'regulated-human-confirmation', name: '人工确认流程', description: '高风险条款的人工复核和确认工作流', icon: 'user-check', category: 'review', applicableDocTypes: ['regulated_document'], minComplexity: 'medium', estimatedSteps: 5, tags: ['人工审核', '确认', '风险控制'], recommendedFor: ['高风险合同', '重要公文'], nodes: [{ id: 'flag', type: 'analysis', label: '高风险项标记' }, { id: 'assign', type: 'planning', label: '审核人分配' }, { id: 'review', type: 'review', label: '人工审核' }, { id: 'revise', type: 'revision', label: '修订反馈' }, { id: 'approve', type: 'output', label: '最终确认' }] },
      { id: 'technical-api-workflow', name: 'API文档工作流', description: 'API接口文档的规划、编写和维护流程', icon: 'code', category: 'creation', applicableDocTypes: ['technical_document'], applicableFormIds: ['software-docs'], minComplexity: 'medium', estimatedSteps: 6, tags: ['API', '接口', '技术文档'], recommendedFor: ['软件项目文档', 'API文档'], nodes: [{ id: 'plan', type: 'planning', label: '接口规划' }, { id: 'spec', type: 'planning', label: '接口定义' }, { id: 'write', type: 'creation', label: '文档编写' }, { id: 'example', type: 'creation', label: '示例代码' }, { id: 'validate', type: 'review', label: '一致性检查' }, { id: 'publish', type: 'publication', label: '发布更新' }] },
      { id: 'technical-code-validation', name: '示例代码验证', description: '验证文档中的示例代码是否可运行和正确', icon: 'terminal', category: 'review', applicableDocTypes: ['technical_document'], minComplexity: 'medium', estimatedSteps: 4, tags: ['代码', '验证', '示例'], recommendedFor: ['技术文档', 'API文档'], nodes: [{ id: 'extract', type: 'analysis', label: '提取示例代码' }, { id: 'syntax', type: 'review', label: '语法检查' }, { id: 'test', type: 'review', label: '可运行性测试' }, { id: 'report', type: 'output', label: '验证报告' }] },
      { id: 'technical-interface-consistency', name: '接口一致性检查', description: '检查API文档与实际接口的一致性', icon: 'link-2', category: 'review', applicableDocTypes: ['technical_document'], minComplexity: 'medium', estimatedSteps: 4, tags: ['接口', '一致性', '检查'], recommendedFor: ['API文档', '技术文档'], nodes: [{ id: 'extract-doc', type: 'analysis', label: '提取文档定义' }, { id: 'extract-code', type: 'analysis', label: '提取代码定义' }, { id: 'compare', type: 'review', label: '一致性对比' }, { id: 'report', type: 'output', label: '差异报告' }] },
      { id: 'technical-changelog', name: '版本变更记录', description: '生成规范的版本变更记录和Release Notes', icon: 'history', category: 'publication', applicableDocTypes: ['technical_document', 'revision_artifact'], minComplexity: 'simple', estimatedSteps: 3, tags: ['版本', '变更', '发布'], recommendedFor: ['软件项目', '技术文档'], nodes: [{ id: 'collect', type: 'analysis', label: '变更收集' }, { id: 'categorize', type: 'planning', label: '变更分类' }, { id: 'write', type: 'creation', label: '变更记录编写' }] },
      { id: 'knowledge-ingestion-workflow', name: '知识入库工作流', description: '将外部资料整理入库的完整流程', icon: 'database-import', category: 'creation', applicableDocTypes: ['knowledge_asset'], applicableFormIds: ['knowledge-base', 'creative-workspace'], minComplexity: 'medium', estimatedSteps: 6, tags: ['知识', '入库', '整理'], recommendedFor: ['知识库', 'Wiki', '素材库'], nodes: [{ id: 'collect', type: 'research', label: '资料收集' }, { id: 'extract', type: 'analysis', label: '信息提取' }, { id: 'entity', type: 'analysis', label: '实体关系抽取' }, { id: 'evaluate', type: 'review', label: '来源可信度评估' }, { id: 'organize', type: 'planning', label: '知识组织' }, { id: 'ingest', type: 'output', label: '入库索引' }] },
      { id: 'knowledge-entity-relation', name: '实体关系抽取', description: '从文本中自动抽取实体和实体间关系', icon: 'network', category: 'research', applicableDocTypes: ['knowledge_asset', 'research_material'], minComplexity: 'medium', estimatedSteps: 4, tags: ['实体', '关系', '知识图谱'], recommendedFor: ['知识库', '研究资料'], nodes: [{ id: 'analyze', type: 'analysis', label: '文本分析' }, { id: 'entities', type: 'analysis', label: '实体识别' }, { id: 'relations', type: 'analysis', label: '关系抽取' }, { id: 'graph', type: 'output', label: '知识图谱输出' }] },
      { id: 'knowledge-source-credibility', name: '来源可信度评估', description: '评估知识来源的可靠性和权威性', icon: 'award', category: 'review', applicableDocTypes: ['knowledge_asset', 'research_material'], minComplexity: 'medium', estimatedSteps: 4, tags: ['来源', '可信度', '评估'], recommendedFor: ['知识库', '研究资料'], nodes: [{ id: 'identify', type: 'analysis', label: '来源识别' }, { id: 'evaluate', type: 'review', label: '可信度评估' }, { id: 'rank', type: 'analysis', label: '可信度分级' }, { id: 'report', type: 'output', label: '评估报告' }] },
      { id: 'knowledge-quality-review', name: '质量审校', description: '对知识库内容进行质量审核和校对', icon: 'check-circle', category: 'review', applicableDocTypes: ['knowledge_asset'], minComplexity: 'simple', estimatedSteps: 4, tags: ['质量', '审校', '知识库'], recommendedFor: ['知识库', 'Wiki'], nodes: [{ id: 'accuracy', type: 'review', label: '准确性检查' }, { id: 'completeness', type: 'review', label: '完整性检查' }, { id: 'structure', type: 'review', label: '结构性检查' }, { id: 'report', type: 'output', label: '质量报告' }] },
      { id: 'outline-generation', name: '大纲生成', description: '根据主题和目标生成结构化写作大纲', icon: 'list-tree', category: 'planning', applicableDocTypes: ['outline', 'narrative_prose', 'script_dialogue', 'informational_article', 'argumentative_document'], minComplexity: 'simple', estimatedSteps: 3, tags: ['大纲', '规划', '生成'], recommendedFor: ['各类文档创作'], nodes: [{ id: 'analyze', type: 'analysis', label: '主题分析' }, { id: 'structure', type: 'planning', label: '结构设计' }, { id: 'output', type: 'output', label: '大纲输出' }] },
      { id: 'outline-structure-assessment', name: '结构评估', description: '评估大纲结构的合理性和完整性', icon: 'layout-dashboard', category: 'review', applicableDocTypes: ['outline'], minComplexity: 'simple', estimatedSteps: 3, tags: ['结构', '评估', '大纲'], recommendedFor: ['各类大纲'], nodes: [{ id: 'analyze', type: 'analysis', label: '结构分析' }, { id: 'evaluate', type: 'review', label: '合理性评估' }, { id: 'suggestions', type: 'output', label: '优化建议' }] },
      { id: 'outline-pacing-design', name: '节奏设计', description: '为叙事类大纲设计节奏曲线和情绪起伏', icon: 'activity', category: 'planning', applicableDocTypes: ['outline'], minComplexity: 'medium', estimatedSteps: 4, tags: ['节奏', '设计', '叙事'], recommendedFor: ['小说大纲', '剧本大纲'], nodes: [{ id: 'analyze', type: 'analysis', label: '大纲分析' }, { id: 'pacing', type: 'planning', label: '节奏规划' }, { id: 'emotion', type: 'planning', label: '情绪曲线设计' }, { id: 'output', type: 'output', label: '带节奏的大纲' }] },
      { id: 'outline-chapter-split', name: '章节拆分', description: '将大纲拆分为适合写作的章节结构', icon: 'scissors', category: 'planning', applicableDocTypes: ['outline', 'narrative_prose'], minComplexity: 'simple', estimatedSteps: 3, tags: ['章节', '拆分', '规划'], recommendedFor: ['长篇创作', '图书写作'], nodes: [{ id: 'analyze', type: 'analysis', label: '内容分析' }, { id: 'split', type: 'planning', label: '章节拆分' }, { id: 'output', type: 'output', label: '章节结构输出' }] },
      { id: 'research-material-organize', name: '资料整理', description: '将零散的研究资料系统化整理', icon: 'folder-tree', category: 'planning', applicableDocTypes: ['research_material'], minComplexity: 'medium', estimatedSteps: 5, tags: ['资料', '整理', '研究'], recommendedFor: ['学术研究', '项目调研'], nodes: [{ id: 'collect', type: 'research', label: '资料收集' }, { id: 'categorize', type: 'planning', label: '分类归档' }, { id: 'summarize', type: 'analysis', label: '要点摘要' }, { id: 'index', type: 'planning', label: '索引建立' }, { id: 'output', type: 'output', label: '资料库输出' }] },
      { id: 'research-information-extraction', name: '信息提取', description: '从大量资料中提取关键信息和要点', icon: 'scan-search', category: 'research', applicableDocTypes: ['research_material'], minComplexity: 'medium', estimatedSteps: 4, tags: ['信息提取', '摘要', '研究'], recommendedFor: ['研究资料', '文献综述'], nodes: [{ id: 'analyze', type: 'analysis', label: '资料分析' }, { id: 'extract', type: 'analysis', label: '关键信息提取' }, { id: 'organize', type: 'planning', label: '信息组织' }, { id: 'output', type: 'output', label: '提取结果输出' }] },
      { id: 'research-source-verification', name: '来源核实', description: '核实研究资料来源的真实性和可靠性', icon: 'source-branch', category: 'review', applicableDocTypes: ['research_material'], minComplexity: 'medium', estimatedSteps: 4, tags: ['来源', '核实', '研究'], recommendedFor: ['学术研究', '新闻报道'], nodes: [{ id: 'identify', type: 'analysis', label: '来源识别' }, { id: 'verify', type: 'research', label: '来源核实' }, { id: 'evaluate', type: 'review', label: '可信度评估' }, { id: 'report', type: 'output', label: '核实报告' }] },
      { id: 'research-review-generation', name: '综述生成', description: '基于研究资料生成综合性综述', icon: 'book-open', category: 'creation', applicableDocTypes: ['research_material', 'argumentative_document'], minComplexity: 'complex', estimatedSteps: 5, tags: ['综述', '研究', '生成'], recommendedFor: ['文献综述', '研究报告'], nodes: [{ id: 'collect', type: 'research', label: '文献收集' }, { id: 'analyze', type: 'analysis', label: '内容分析' }, { id: 'synthesize', type: 'planning', label: '综合归纳' }, { id: 'write', type: 'creation', label: '综述撰写' }, { id: 'cite', type: 'revision', label: '引用规范' }] },
      { id: 'review-workflow', name: '审稿流程', description: '规范化的稿件审阅和反馈流程', icon: 'file-edit', category: 'review', applicableDocTypes: ['review_feedback', 'narrative_prose', 'script_dialogue'], minComplexity: 'medium', estimatedSteps: 5, tags: ['审稿', '反馈', '审阅'], recommendedFor: ['编辑审稿', '同行评议'], nodes: [{ id: 'intake', type: 'planning', label: '稿件接收' }, { id: 'read', type: 'analysis', label: '通读评估' }, { id: 'issues', type: 'review', label: '问题识别' }, { id: 'suggestions', type: 'creation', label: '修改建议' }, { id: 'report', type: 'output', label: '审稿报告' }] },
      { id: 'review-issue-grading', name: '问题分级', description: '对审阅发现的问题按严重程度分级', icon: 'alert-circle', category: 'review', applicableDocTypes: ['review_feedback'], minComplexity: 'simple', estimatedSteps: 3, tags: ['问题分级', '优先级', '审阅'], recommendedFor: ['各类审阅'], nodes: [{ id: 'collect', type: 'analysis', label: '问题收集' }, { id: 'grade', type: 'review', label: '严重程度分级' }, { id: 'prioritize', type: 'planning', label: '优先级排序' }] },
      { id: 'review-suggestion-generation', name: '修改建议生成', description: '针对问题生成具体可操作的修改建议', icon: 'lightbulb', category: 'creation', applicableDocTypes: ['review_feedback'], minComplexity: 'medium', estimatedSteps: 4, tags: ['建议', '修改', '审阅'], recommendedFor: ['审稿', '编辑'], nodes: [{ id: 'analyze', type: 'analysis', label: '问题分析' }, { id: 'generate', type: 'creation', label: '建议生成' }, { id: 'examples', type: 'creation', label: '示例对照' }, { id: 'organize', type: 'planning', label: '建议整理' }] },
      { id: 'review-quality-scoring', name: '质量打分', description: '基于多维度对稿件质量进行量化评分', icon: 'star', category: 'review', applicableDocTypes: ['review_feedback'], minComplexity: 'simple', estimatedSteps: 3, tags: ['质量', '评分', '评估'], recommendedFor: ['稿件评级', '质量评估'], nodes: [{ id: 'dimensions', type: 'planning', label: '评分维度设定' }, { id: 'evaluate', type: 'review', label: '分项评分' }, { id: 'summary', type: 'output', label: '综合评分报告' }] },
      { id: 'revision-diff', name: '版本对照', description: '对比两个版本的差异，生成变更清单', icon: 'git-diff', category: 'review', applicableDocTypes: ['revision_artifact', 'narrative_prose', 'technical_document'], minComplexity: 'simple', estimatedSteps: 3, tags: ['版本', '对比', '差异'], recommendedFor: ['修订稿对比', '版本管理'], nodes: [{ id: 'load', type: 'analysis', label: '加载版本' }, { id: 'diff', type: 'analysis', label: '差异比对' }, { id: 'report', type: 'output', label: '变更报告' }] },
      { id: 'revision-review', name: '修订审阅', description: '审阅修订内容，确认修改是否到位', icon: 'edit-3', category: 'review', applicableDocTypes: ['revision_artifact'], minComplexity: 'medium', estimatedSteps: 4, tags: ['修订', '审阅', '确认'], recommendedFor: ['编辑加工', '修订稿审核'], nodes: [{ id: 'review-changes', type: 'review', label: '变更审阅' }, { id: 'verify', type: 'review', label: '修改验证' }, { id: 'new-issues', type: 'review', label: '新问题识别' }, { id: 'approve', type: 'output', label: '审核结论' }] },
      { id: 'revision-impact-analysis', name: '变更影响分析', description: '分析修改内容对其他部分的连锁影响', icon: 'ripple', category: 'research', applicableDocTypes: ['revision_artifact', 'narrative_prose', 'technical_document'], minComplexity: 'medium', estimatedSteps: 4, tags: ['影响分析', '变更', '风险'], recommendedFor: ['长篇修订', '技术文档修订'], nodes: [{ id: 'identify', type: 'analysis', label: '变更点识别' }, { id: 'impact', type: 'analysis', label: '影响范围分析' }, { id: 'risk', type: 'review', label: '风险评估' }, { id: 'report', type: 'output', label: '影响报告' }] },
      { id: 'revision-rollback-plan', name: '回滚预案', description: '为重大修订制定回滚方案和应急计划', icon: 'rotate-ccw', category: 'planning', applicableDocTypes: ['revision_artifact'], minComplexity: 'medium', estimatedSteps: 4, tags: ['回滚', '预案', '风险控制'], recommendedFor: ['重要文档修订', '合规文档修订'], nodes: [{ id: 'baseline', type: 'analysis', label: '基线版本确认' }, { id: 'triggers', type: 'planning', label: '回滚触发条件' }, { id: 'procedure', type: 'planning', label: '回滚流程' }, { id: 'output', type: 'output', label: '回滚预案' }] }
    ]
    return {
      version: WRITER_CATALOG_VERSION,
      domains: WRITER_DOMAINS,
      families: WRITER_FAMILIES,
      forms,
      presets,
      documentTypes: WRITER_DOCUMENT_TYPES,
      workflowTemplates,
      capabilityProfiles: [...new Set(forms.map(f => f.capabilityProfileId))],
      promptProfiles: [...new Set(forms.map(f => f.promptProfileId))],
      outputSchemaProfiles: [...new Set(forms.map(f => f.outputSchemaProfileId))],
      workflowProfiles: [...new Set(forms.flatMap(f => f.workflowProfileIds))],
      knowledgeProfiles: [...new Set(forms.map(f => f.knowledgeProfileId))]
    }
  }
  if (reqPath === '/api/writer/project-catalog' || reqPath.startsWith('/api/writer/project-catalog?')) {
    if (method === 'GET') {
      return { ok: true, catalog: getWriterFormsCatalog() }
    }
  }
  if (reqPath === '/api/writer/projects/preflight' && method === 'POST') {
    try {
      const errors = []
      const warnings = []
      const pathConflicts = []
      const fs = require('fs')
      const path = require('path')

      const title = String(body?.title || '').trim()
      const folder = String(body?.folder || '').trim()
      const selectedDocuments = Array.isArray(body?.selected_documents) ? body.selected_documents : []

      if (!title) {
        errors.push({ code: 'EMPTY_TITLE', message: '项目名称不能为空' })
      }

      if (!folder) {
        errors.push({ code: 'EMPTY_FOLDER', message: '项目目录不能为空' })
      }

      if (folder && /\.\./.test(folder)) {
        errors.push({ code: 'PATH_ESCAPE', message: '项目目录不能包含路径逃逸字符' })
      }

      if (folder) {
        try {
          if (fs.existsSync(folder)) {
            const dirContents = fs.readdirSync(folder)
            if (dirContents.length > 0) {
              warnings.push({ code: 'DIR_NOT_EMPTY', message: '目标目录不为空' })
            }
          }
        } catch (e) {
          // ignore
        }
      }

      const seenPaths = new Set()
      for (const doc of selectedDocuments) {
        const relPath = String(doc.relativePath || '')
        if (!relPath || relPath === '.' || relPath.startsWith('/') || /^[a-zA-Z]:/.test(relPath)) {
          errors.push({ code: 'INVALID_PATH', message: `无效的相对路径: ${doc.title || relPath}` })
          continue
        }
        if (/\.\./.test(relPath)) {
          errors.push({ code: 'PATH_ESCAPE', message: `路径包含逃逸字符: ${doc.title || relPath}` })
          continue
        }
        if (seenPaths.has(relPath.toLowerCase())) {
          errors.push({ code: 'DUPLICATE_PATH', message: `重复的文件路径: ${relPath}` })
        }
        seenPaths.add(relPath.toLowerCase())
        if (relPath.startsWith('.karna') || relPath.startsWith('.git')) {
          errors.push({ code: 'RESERVED_PATH', message: `路径为系统保留目录: ${relPath}` })
        }
      }

      if (body?.taxonomy && body.taxonomy.formId === 'custom' && !body.taxonomy.primaryDocumentType) {
        errors.push({ code: 'MISSING_DOC_TYPE', message: '自定义文体必须选择底层文档类型' })
      }

      return {
        ok: true,
        valid: errors.length === 0,
        errors,
        warnings,
        pathConflicts
      }
    } catch (err) {
      return notConfigured('writer_projects', err instanceof Error ? err.message : String(err))
    }
  }
  if (reqPath === '/api/writer/projects' || reqPath.startsWith('/api/writer/projects?')) {
    if (method === 'GET') return readWriterProjectsEnriched({ includeArchived: /includeArchived=1|include_archived=1/.test(reqPath) })
    if (method === 'POST') {
      try {
        const result = await createWriterProject(body || {})
        if (result && result.ok === false) return result
        return { ok: true, project: result }
      }
      catch (err) { return notConfigured('writer_projects', err instanceof Error ? err.message : String(err)) }
    }
  }
  if (reqPath.startsWith('/api/writer/projects/resolve')) {
    const url = new URL(reqPath, 'http://localhost')
    const workspace_id = url.searchParams.get('workspace_id') || ''
    const folder = url.searchParams.get('folder') || ''
    let resolved = resolveWriterProject({ workspace_id, folder })
    if (!resolved && workspace_id) {
      const byFind = findWriterProject(workspace_id)
      if (byFind) {
        resolved = { project: byFind, matched_by: 'find' }
      }
    }
    if (resolved && resolved.project) {
      const project = enrichWriterProject(resolved.project)
      return {
        ok: true,
        matched_by: resolved.matched_by,
        project: {
          id: project.id,
          name: project.title || 'Untitled',
          workspaceId: project.workspace_id || project.id || workspace_id,
          rootPath: project.folder || '',
          primarySessionId: project.main_session_id || null,
          permissionsRoot: project.permissions_root || project.folder || '',
          capabilities: project.resolved_capabilities || null,
          created_documents: project.created_documents || [],
          taxonomy: project.taxonomy || null,
          knowledge_ids: project.knowledge_ids || [],
          soul_profile_id: project.soul_profile_id || null,
          workflow_profile_ids: project.workflow_profile_ids || []
        }
      }
    }
    return { ok: false, error: 'PROJECT_BINDING_NOT_FOUND', message: 'No writer project found for this workspace.', code: 'PROJECT_NOT_FOUND', statusCode: 404 }
  }
  const projectSessionsMatch = reqPath.match(/^\/api\/writer\/projects\/([^/?]+)\/sessions(?:\?|$)/)
  if (projectSessionsMatch && method === 'POST') {
    const projectId = decodeURIComponent(projectSessionsMatch[1])
    const store = readWriterProjects()
    const project = (store.projects || []).find(p => p.id === projectId)
    if (!project) {
      return { ok: false, error: 'PROJECT_NOT_FOUND', message: '项目不存在', statusCode: 404 }
    }

    const body = request?.body || body || {}
    const { setPrimary = true } = body
    const controller = { id: 'controller', name: '主控', role: '主控' }
    const sessionTitle = `${project.title} · 主控`

    const newSession = createStoredSession({
      title: sessionTitle,
      cwd: project.folder,
      project,
      agent: controller,
      conversation_scope: 'project',
      writer_project_id: project.id,
      workspace_id: project.workspace_id
    })

    const updatedProject = {
      ...project,
      session_ids: Array.from(new Set([...(project.session_ids || []), newSession.id])),
      updated_at: new Date().toISOString()
    }
    if (setPrimary) {
      updatedProject.main_session_id = newSession.id
      updatedProject.agent_session_ids = {
        ...(project.agent_session_ids || {}),
        controller: newSession.id
      }
    }

    writeWriterProjects({
      ...store,
      projects: (store.projects || []).map(p => p.id === projectId ? updatedProject : p)
    })

    try {
      const agentDataPath = path.join(writerProjectDataPath(project), 'writer_agents.json')
      if (fs.existsSync(agentDataPath)) {
        const agentsRaw = JSON.parse(fs.readFileSync(agentDataPath, 'utf8'))
        const updatedAgents = (agentsRaw.agents || []).map(agent => {
          if (agent.id === 'controller') {
            return { ...agent, session_id: newSession.id }
          }
          return agent
        })
        fs.writeFileSync(agentDataPath, JSON.stringify({ ...agentsRaw, agents: updatedAgents }, null, 2), 'utf8')
      }
    } catch { /* ignore */ }

    return {
      ok: true,
      sessionId: newSession.id,
      bindingCreated: setPrimary,
      messageAccepted: false,
      project: enrichWriterProject(updatedProject)
    }
  }
  if (reqPath.match(/^\/api\/writer\/projects\/[^/]+\/documents\/register/) && method === 'POST') {
    const projectId = reqPath.split('/')[4]
    const body = request?.body || body || {}
    const store = readWriterProjects()
    const project = (store.projects || []).find(p => p.id === projectId)
    if (!project) {
      return { ok: false, error: 'PROJECT_NOT_FOUND', message: '项目不存在', statusCode: 404 }
    }
    const { relative_path, document_type, title, preset_id } = body
    if (!relative_path || !document_type) {
      return { ok: false, error: 'INVALID_PARAMS', message: '缺少必要参数：relative_path 和 document_type', statusCode: 400 }
    }
    const ALLOWED_DOC_TYPES = [
      'narrative_prose','script_dialogue','interactive_narrative','marketing_copy',
      'informational_article','argumentative_document','structured_business_doc',
      'regulated_document','technical_document','knowledge_asset',
      'outline','research_material','review_feedback','revision_artifact'
    ]
    if (!ALLOWED_DOC_TYPES.includes(document_type)) {
      return { ok: false, error: 'INVALID_DOC_TYPE', message: '无效的文档类型', statusCode: 400 }
    }
    const normalized = relative_path.replace(/^[\\/]+/, '').replace(/\\/g, '/')
    if (!normalized || normalized.includes('..')) {
      return { ok: false, error: 'INVALID_PATH', message: '非法的文件路径', statusCode: 400 }
    }
    const created = Array.isArray(project.created_documents) ? [...project.created_documents] : []
    const existingIndex = created.findIndex(d => d.relative_path === normalized)
    const entry = {
      relative_path: normalized,
      document_type,
      title: title || normalized.split('/').pop() || normalized,
      preset_id: preset_id || null,
      created_at: existingIndex >= 0 ? created[existingIndex].created_at : new Date().toISOString(),
      registered_at: new Date().toISOString()
    }
    if (existingIndex >= 0) {
      created[existingIndex] = entry
    } else {
      created.push(entry)
    }
    const updatedProject = { ...project, created_documents: created, updated_at: new Date().toISOString() }
    writeWriterProjects({
      ...store,
      projects: (store.projects || []).map(p => p.id === projectId ? updatedProject : p)
    })
    return { ok: true, document: entry, project: enrichWriterProject(updatedProject) }
  }
  if (reqPath === '/api/writer/projects/integrity' || reqPath.startsWith('/api/writer/projects/integrity?')) {
    const store = readWriterProjects()
    const projects = store.projects || []
    const byWorkspaceId = new Map()
    const byFolder = new Map()
    const byTitle = new Map()
    const issues = []
    const healthy = []
    const missingWorkspaceId = []
    const duplicateWorkspaceLinks = []
    const duplicateFolders = []
    const titleConflicts = []
    const orphanFolders = []

    for (const project of projects) {
      const wid = String(project.workspace_id || '').trim()
      const folder = normalizeFolderPath(project.folder || '')
      const title = String(project.title || '').trim()

      if (!wid) {
        missingWorkspaceId.push({ project_id: project.id, title: project.title, folder: project.folder, reason: 'missing_workspace_id' })
      } else {
        if (byWorkspaceId.has(wid)) {
          duplicateWorkspaceLinks.push({ workspace_id: wid, projects: [byWorkspaceId.get(wid).id, project.id], titles: [byWorkspaceId.get(wid).title, project.title] })
        } else {
          byWorkspaceId.set(wid, project)
        }
      }

      if (folder) {
        if (byFolder.has(folder)) {
          duplicateFolders.push({ folder, projects: [byFolder.get(folder).id, project.id], titles: [byFolder.get(folder).title, project.title] })
        } else {
          byFolder.set(folder, project)
        }
      }

      if (title) {
        if (!byTitle.has(title)) byTitle.set(title, [])
        byTitle.get(title).push(project.id)
      }

      const folderExists = project.folder && fs.existsSync(project.folder)
      if (project.folder && !folderExists) {
        orphanFolders.push({ project_id: project.id, title: project.title, folder: project.folder, reason: 'folder_missing' })
      }

      if (wid && folder && folderExists && !duplicateWorkspaceLinks.some(d => d.workspace_id === wid) && !duplicateFolders.some(d => d.folder === folder)) {
        healthy.push({
          workspace_id: wid,
          writer_project_id: project.id,
          folder: project.folder,
          title: project.title,
          status: project.status,
          created_at: project.created_at,
          updated_at: project.updated_at
        })
      }
    }

    for (const [title, ids] of byTitle.entries()) {
      if (ids.length > 1) {
        titleConflicts.push({ title, project_ids: ids, note: 'Same title is allowed, but verify correct project is selected by ID' })
      }
    }

    return {
      ok: true,
      report: {
        total: projects.length,
        healthy: healthy.length,
        healthy_projects: healthy,
        issues: {
          missing_workspace_id: missingWorkspaceId,
          duplicate_workspace_links: duplicateWorkspaceLinks,
          duplicate_folders: duplicateFolders,
          title_conflicts: titleConflicts,
          orphan_folders: orphanFolders
        }
      }
    }
  }
  const writerAgentMatch = reqPath.match(/^\/api\/writer\/projects\/([^/?]+)\/agents\/([^/?]+)$/)
  if (writerAgentMatch) {
    try { return { ok: true, agents: updateProjectAgent(decodeURIComponent(writerAgentMatch[1]), decodeURIComponent(writerAgentMatch[2]), body || {}) } }
    catch (err) { return notConfigured('writer_projects', err instanceof Error ? err.message : String(err)) }
  }
  const writerTasksMatch = reqPath.match(/^\/api\/writer\/projects\/([^/?]+)\/tasks(?:\/(generate|[^/?]+))?$/)
  if (writerTasksMatch) {
    const ref = decodeURIComponent(writerTasksMatch[1]); const part = writerTasksMatch[2] || ''; const generate = part === 'generate'; const taskId = part && !generate ? decodeURIComponent(part) : ''
    try {
      const project = findWriterProject(ref); if (!project) return notConfigured('writer_projects', `Project not found: ${ref}`)
      if (generate && method === 'POST') return { ok: true, tasks: generateProjectTasks(project, body?.goal || body?.description || '') }
      if (!taskId && method === 'GET') return { ok: true, tasks: readTaskSystem(project) }
      if (taskId && method === 'PATCH') { const tasks = updateProjectTask(project, taskId, body || {}); return { ok: true, tasks, task: (tasks.tasks || []).find(task => task.id === taskId) || null } }
    } catch (err) { return notConfigured('writer_projects', err instanceof Error ? err.message : String(err)) }
  }
  const writerProjectSessionMatch = reqPath.match(/^\/api\/writer\/projects\/([^/?]+)\/sessions$/)
  if (writerProjectSessionMatch) {
    try { return createProjectSession(decodeURIComponent(writerProjectSessionMatch[1]), body || {}) }
    catch (err) { return notConfigured('writer_projects', err instanceof Error ? err.message : String(err)) }
  }
  const writerProjectOpenFolderMatch = reqPath.match(/^\/api\/writer\/projects\/([^/?]+)\/open-folder$/)
  if (writerProjectOpenFolderMatch && method === 'POST') {
    try { return openWriterProjectFolder(decodeURIComponent(writerProjectOpenFolderMatch[1])) }
    catch (err) { return notConfigured('writer_projects', err instanceof Error ? err.message : String(err)) }
  }
  const writerProjectOpsMatch = reqPath.match(/^\/api\/writer\/projects\/([^/?]+)\/(import|analyze|check-consistency|rewrite-preview|bible|sources)$/)
  if (writerProjectOpsMatch) {
    const ref = decodeURIComponent(writerProjectOpsMatch[1])
    const action = writerProjectOpsMatch[2]
    try {
      if (action === 'import' && method === 'POST') return importWriterProjectManuscript(ref, body || {})
      if (action === 'analyze' && method === 'POST') return analyzeWriterProject(ref, body || {})
      if (action === 'check-consistency' && method === 'POST') return checkWriterConsistency(ref, body || {})
      if (action === 'rewrite-preview' && method === 'POST') return rewriteWriterPreview(ref, body || {})
      if (action === 'bible' && method === 'GET') return readWriterProjectBible(ref)
      if (action === 'sources' && method === 'GET') return listWriterProjectSources(ref)
    } catch (err) { return notConfigured('writer_projects', err instanceof Error ? err.message : String(err)) }
  }
  const writerProjectTreeMatch = reqPath.match(/^\/api\/writer\/projects\/([^/?]+)\/tree$/)
  if (writerProjectTreeMatch && method === 'GET') {
    try {
      const ref = decodeURIComponent(writerProjectTreeMatch[1])
      const project = findWriterProject(ref)
      if (!project) return notConfigured('writer_projects', `Project not found: ${ref}`)
      return getProjectFileTree(project)
    } catch (err) { return notConfigured('writer_projects', err instanceof Error ? err.message : String(err)) }
  }
  const writerProjectExportsMatch = reqPath.match(/^\/api\/writer\/projects\/([^/?]+)\/exports$/)
  if (writerProjectExportsMatch && method === 'GET') {
    try {
      const ref = decodeURIComponent(writerProjectExportsMatch[1])
      const project = findWriterProject(ref)
      if (!project) return notConfigured('writer_projects', `Project not found: ${ref}`)
      const exportDir = path.join(project.folder, 'exports')
      if (!fs.existsSync(exportDir)) return { ok: true, exports: [] }
      const files = fs.readdirSync(exportDir).map(name => {
        const fullPath = path.join(exportDir, name)
        try {
          const stat = fs.statSync(fullPath)
          if (!stat.isFile()) return null
          return { name, path: fullPath, size: stat.size, mtime: stat.mtime.toISOString() }
        } catch { return null }
      }).filter(Boolean)
      files.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime())
      return { ok: true, exports: files }
    } catch (err) { return notConfigured('writer_projects', err instanceof Error ? err.message : String(err)) }
  }
  const writerProjectVersionsMatch = reqPath.match(/^\/api\/writer\/projects\/([^/?]+)\/versions$/)
  if (writerProjectVersionsMatch && method === 'GET') {
    try {
      const ref = decodeURIComponent(writerProjectVersionsMatch[1])
      const project = findWriterProject(ref)
      if (!project) return notConfigured('writer_projects', `Project not found: ${ref}`)
      return getProjectVersions(project)
    } catch (err) { return notConfigured('writer_projects', err instanceof Error ? err.message : String(err)) }
  }
  const WORKBENCH_PROFILES = {
    'narrative_prose': {
      id: 'narrative-prose',
      name: '叙事散文',
      labels: { contentUnit: '章节', knowledgeHub: '故事圣经', entities: '人物', reviewCenter: '评审委员会', delivery: '定稿', workbenchTitle: '作品工坊' },
      navigation: [
        { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
        { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge'] },
        { id: 'build', label: '设定', icon: 'book', moduleIds: ['story-bible', 'structure', 'entities'] },
        { id: 'write', label: '创作', icon: 'edit', moduleIds: ['editor', 'narrative-state', 'memory', 'search'] },
        { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['critic-council', 'continuity', 'review', 'versions'] },
        { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['delivery'] }
      ],
      dashboardMetricIds: ['char_count','chapter_count','words_total','foreshadow_count','timeline_events','review_issues','version_count'],
      capabilityPackIds: ['core', 'narrative']
    },
    'script_dialogue': {
      id: 'script-dialogue',
      name: '剧本对白',
      labels: { contentUnit: '场次', knowledgeHub: '剧集圣经', entities: '角色', reviewCenter: '剧本审阅', delivery: '剧本定稿', workbenchTitle: '剧本工坊' },
      navigation: [
        { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
        { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge'] },
        { id: 'build', label: '剧本结构', icon: 'list-ordered', moduleIds: ['scene-list', 'character-dossier', 'structure'] },
        { id: 'write', label: '创作', icon: 'edit', moduleIds: ['editor', 'narrative-state', 'memory', 'search'] },
        { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['script-format', 'critic-council', 'review', 'versions'] },
        { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['delivery'] }
      ],
      dashboardMetricIds: ['scene_count','character_count_script','words_total','beat_count','format_issues','version_count'],
      capabilityPackIds: ['core', 'narrative', 'script']
    },
    'interactive_narrative': {
      id: 'interactive-narrative',
      name: '互动叙事',
      labels: { contentUnit: '剧情节点', knowledgeHub: '世界设定', entities: 'NPC', reviewCenter: '分支验证', delivery: '剧情包', workbenchTitle: '互动工坊' },
      navigation: [
        { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
        { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge'] },
        { id: 'build', label: '分支设计', icon: 'git-branch', moduleIds: ['branch-map', 'state-vars', 'entities'] },
        { id: 'write', label: '创作', icon: 'edit', moduleIds: ['editor', 'memory', 'search'] },
        { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['review', 'versions'] },
        { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['delivery'] }
      ],
      dashboardMetricIds: ['branch_count','ending_count','variable_count','entity_count','words_total','deadend_count','version_count'],
      capabilityPackIds: ['core', 'interactive']
    },
    'marketing_copy': {
      id: 'marketing-copy',
      name: '营销文案',
      labels: { contentUnit: '文案', knowledgeHub: '品牌资产', entities: '卖点', reviewCenter: '合规审阅', delivery: '投放包', workbenchTitle: '文案工坊' },
      navigation: [
        { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
        { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge', 'brief'] },
        { id: 'build', label: '策略', icon: 'lightbulb', moduleIds: ['structure', 'entities'] },
        { id: 'write', label: '创作', icon: 'edit', moduleIds: ['editor', 'ab-variants', 'memory', 'search'] },
        { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['claims-check', 'review', 'versions'] },
        { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['delivery'] }
      ],
      dashboardMetricIds: ['words_total','variant_count','claim_issues','review_issues','version_count'],
      capabilityPackIds: ['core', 'marketing']
    },
    'informational_article': {
      id: 'informational-article',
      name: '资讯文章',
      labels: { contentUnit: '文章', knowledgeHub: '资料台', entities: '来源', reviewCenter: '事实核查', delivery: '发布', workbenchTitle: '写作工坊' },
      navigation: [
        { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
        { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge', 'sources'] },
        { id: 'build', label: '结构', icon: 'list-tree', moduleIds: ['structure'] },
        { id: 'write', label: '创作', icon: 'edit', moduleIds: ['editor', 'memory', 'search'] },
        { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['fact-check', 'review', 'versions'] },
        { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['delivery'] }
      ],
      dashboardMetricIds: ['words_total','source_count','verified_sources','citations_count','fact_issues','review_issues','version_count'],
      capabilityPackIds: ['core', 'informational']
    },
    'argumentative_document': {
      id: 'argumentative-document',
      name: '论证文档',
      labels: { contentUnit: '章节', knowledgeHub: '文献库', entities: '论点', reviewCenter: '同行审阅', delivery: '投稿定稿', workbenchTitle: '学术工坊' },
      navigation: [
        { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
        { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge', 'sources'] },
        { id: 'build', label: '论证', icon: 'git-merge', moduleIds: ['argument-tree', 'evidence-matrix', 'structure'] },
        { id: 'write', label: '创作', icon: 'edit', moduleIds: ['editor', 'memory', 'search'] },
        { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['counter-arguments', 'citations', 'fact-check', 'review', 'versions'] },
        { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['delivery'] }
      ],
      dashboardMetricIds: ['words_total','thesis_count','evidence_count','citations_count','fallacy_count','citation_issues','version_count'],
      capabilityPackIds: ['core', 'informational', 'argumentative']
    },
    'structured_business_doc': {
      id: 'structured-business',
      name: '结构化商务',
      labels: { contentUnit: '章节', knowledgeHub: '项目资料', entities: '干系人', reviewCenter: '风险评审', delivery: '提交', workbenchTitle: '商务工坊' },
      navigation: [
        { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
        { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge', 'stakeholders'] },
        { id: 'build', label: '规划', icon: 'flag', moduleIds: ['milestones', 'structure'] },
        { id: 'write', label: '撰写', icon: 'edit', moduleIds: ['editor', 'memory', 'search'] },
        { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['risk-assessment', 'counter-arguments', 'review', 'versions'] },
        { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['delivery'] }
      ],
      dashboardMetricIds: ['words_total','stakeholder_count','milestone_count','deliverable_count','risk_count','high_risks','version_count'],
      capabilityPackIds: ['core', 'business', 'argumentative']
    },
    'regulated_document': {
      id: 'regulated-document',
      name: '受监管文档',
      labels: { contentUnit: '条款', knowledgeHub: '法规依据', entities: '责任方', reviewCenter: '合规审查', delivery: '签署定稿', workbenchTitle: '法务工坊' },
      navigation: [
        { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
        { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge'] },
        { id: 'build', label: '条款', icon: 'list-flat', moduleIds: ['clause-matrix', 'structure'] },
        { id: 'write', label: '起草', icon: 'edit', moduleIds: ['editor', 'memory', 'search'] },
        { id: 'review', label: '校验', icon: 'shield', moduleIds: ['compliance-check', 'review', 'versions'] },
        { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['audit-log', 'delivery'] }
      ],
      dashboardMetricIds: ['clause_count','words_total','compliance_issues','approval_status','review_issues','version_count'],
      capabilityPackIds: ['core', 'regulated']
    },
    'technical_document': {
      id: 'technical-document',
      name: '技术文档',
      labels: { contentUnit: '章节', knowledgeHub: '技术资料', entities: '接口', reviewCenter: '一致性检查', delivery: '发布', workbenchTitle: '文档工坊' },
      navigation: [
        { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
        { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge'] },
        { id: 'build', label: '结构', icon: 'code', moduleIds: ['api-reference', 'structure'] },
        { id: 'write', label: '编写', icon: 'edit', moduleIds: ['editor', 'memory', 'search'] },
        { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['code-validation', 'review', 'versions'] },
        { id: 'deliver', label: '交付', icon: 'package', moduleIds: ['changelog', 'delivery'] }
      ],
      dashboardMetricIds: ['api_count','param_count','code_examples','words_total','validation_issues','changelog_entries','version_count'],
      capabilityPackIds: ['core', 'technical']
    },
    'knowledge_asset': {
      id: 'knowledge-asset',
      name: '知识资产',
      labels: { contentUnit: '页面', knowledgeHub: '知识管理', entities: '概念', reviewCenter: '质量检查', delivery: '发布', workbenchTitle: '知识工坊' },
      navigation: [
        { id: 'overview', label: '概览', icon: 'layout', moduleIds: ['dashboard', 'guide'] },
        { id: 'prepare', label: '准备', icon: 'folder-opened', moduleIds: ['documents', 'knowledge'] },
        { id: 'build', label: '构建', icon: 'git-branch', moduleIds: ['glossary', 'knowledge-graph', 'entities'] },
        { id: 'write', label: '编写', icon: 'edit', moduleIds: ['editor', 'memory', 'search'] },
        { id: 'review', label: '校验', icon: 'checklist', moduleIds: ['ingest-quality', 'review', 'versions'] },
        { id: 'deliver', label: '发布', icon: 'package', moduleIds: ['delivery'] }
      ],
      dashboardMetricIds: ['term_count','kg_nodes','kg_edges','entity_count','knowledge_sources','conflict_count','version_count'],
      capabilityPackIds: ['core', 'knowledge']
    }
  }

  const MODULE_DEFINITIONS = {
    'story-bible': { id: 'story-bible', title: '故事圣经', icon: 'book', group: 'narrative', phase: 'build' },
    'narrative-state': { id: 'narrative-state', title: '叙事状态', icon: 'activity', group: 'narrative', phase: 'write' },
    'critic-council': { id: 'critic-council', title: '评审委员会', icon: 'checklist', group: 'narrative', phase: 'review' },
    'continuity': { id: 'continuity', title: '连续性检查', icon: 'link', group: 'narrative', phase: 'review' },
    'scene-list': { id: 'scene-list', title: '场次表', icon: 'list-ordered', group: 'script', phase: 'build' },
    'character-dossier': { id: 'character-dossier', title: '人物小传', icon: 'person', group: 'script', phase: 'build' },
    'script-format': { id: 'script-format', title: '剧本格式', icon: 'symbol-misc', group: 'script', phase: 'review' },
    'branch-map': { id: 'branch-map', title: '分支图', icon: 'git-branch', group: 'interactive', phase: 'build' },
    'state-vars': { id: 'state-vars', title: '状态变量', icon: 'database', group: 'interactive', phase: 'build' },
    'brief': { id: 'brief', title: '营销Brief', icon: 'file-text', group: 'marketing', phase: 'prepare' },
    'ab-variants': { id: 'ab-variants', title: 'A/B变体', icon: 'split-horizontal', group: 'marketing', phase: 'write' },
    'claims-check': { id: 'claims-check', title: '功效声明核查', icon: 'shield-check', group: 'marketing', phase: 'review' },
    'sources': { id: 'sources', title: '来源管理', icon: 'link', group: 'informational', phase: 'prepare' },
    'fact-check': { id: 'fact-check', title: '事实核查', icon: 'search-check', group: 'informational', phase: 'review' },
    'argument-tree': { id: 'argument-tree', title: '论证树', icon: 'git-merge', group: 'argumentative', phase: 'build' },
    'evidence-matrix': { id: 'evidence-matrix', title: '证据矩阵', icon: 'layout-grid', group: 'argumentative', phase: 'build' },
    'counter-arguments': { id: 'counter-arguments', title: '反方审阅', icon: 'scale', group: 'argumentative', phase: 'review' },
    'citations': { id: 'citations', title: '引文格式', icon: 'quote', group: 'argumentative', phase: 'review' },
    'stakeholders': { id: 'stakeholders', title: '利益相关者', icon: 'organization', group: 'business', phase: 'prepare' },
    'milestones': { id: 'milestones', title: '里程碑', icon: 'flag', group: 'business', phase: 'build' },
    'risk-assessment': { id: 'risk-assessment', title: '风险评估', icon: 'alert-triangle', group: 'business', phase: 'review' },
    'clause-matrix': { id: 'clause-matrix', title: '条款矩阵', icon: 'list-flat', group: 'regulated', phase: 'build' },
    'compliance-check': { id: 'compliance-check', title: '合规审查', icon: 'shield', group: 'regulated', phase: 'review' },
    'audit-log': { id: 'audit-log', title: '审计日志', icon: 'history', group: 'regulated', phase: 'deliver' },
    'api-reference': { id: 'api-reference', title: 'API/接口', icon: 'code', group: 'technical', phase: 'build' },
    'code-validation': { id: 'code-validation', title: '代码示例验证', icon: 'play', group: 'technical', phase: 'review' },
    'changelog': { id: 'changelog', title: '变更日志', icon: 'diff', group: 'technical', phase: 'deliver' },
    'glossary': { id: 'glossary', title: '术语表', icon: 'book', group: 'knowledge', phase: 'build' },
    'knowledge-graph': { id: 'knowledge-graph', title: '知识图谱', icon: 'git-branch', group: 'knowledge', phase: 'build' },
    'ingest-quality': { id: 'ingest-quality', title: '摄取质量', icon: 'check', group: 'knowledge', phase: 'review' },
    'dashboard': { id: 'dashboard', title: '概览', icon: 'layout', group: 'core', phase: 'prepare' },
    'guide': { id: 'guide', title: '引导修复', icon: 'wrench', group: 'core', phase: 'prepare' },
    'documents': { id: 'documents', title: '文件与资料', icon: 'files', group: 'core', phase: 'prepare' },
    'knowledge': { id: 'knowledge', title: '知识源', icon: 'book', group: 'core', phase: 'prepare' },
    'structure': { id: 'structure', title: '项目结构', icon: 'list-tree', group: 'core', phase: 'build' },
    'entities': { id: 'entities', title: '实体关系', icon: 'git-branch', group: 'core', phase: 'build' },
    'editor': { id: 'editor', title: '文档编辑', icon: 'edit', group: 'core', phase: 'write' },
    'memory': { id: 'memory', title: '创作记忆', icon: 'database', group: 'core', phase: 'write' },
    'search': { id: 'search', title: '创意检索', icon: 'search', group: 'core', phase: 'write' },
    'review': { id: 'review', title: '审阅中心', icon: 'checklist', group: 'core', phase: 'review' },
    'versions': { id: 'versions', title: '版本记录', icon: 'history', group: 'core', phase: 'review' },
    'delivery': { id: 'delivery', title: '交付导出', icon: 'package', group: 'core', phase: 'deliver' }
  }

  const LEGACY_MODULE_TO_TAB = {
    'bible': 'story-bible', 'wiki': 'knowledge', 'graph': 'entities',
    'state': 'narrative-state', 'critic': 'critic-council',
    'safety': 'review', 'rag': 'knowledge', 'benchmark': 'review'
  }

  function resolveWorkbenchProfile(project) {
    const taxonomy = project.taxonomy || {}
    const formId = taxonomy.formId
    const docType = taxonomy.primaryDocumentType || 'narrative_prose'
    const formToProfile = {
      'web-novel': 'narrative_prose', 'literary-novel': 'narrative_prose', 'short-story': 'narrative_prose',
      'biography': 'narrative_prose', 'prose-essay': 'narrative_prose', 'poetry-collection': 'narrative_prose',
      'childrens-story': 'narrative_prose', 'book-publishing': 'narrative_prose',
      'feature-film': 'script_dialogue', 'tv-script': 'script_dialogue', 'animation-script': 'script_dialogue',
      'documentary-script': 'script_dialogue', 'stage-play': 'script_dialogue', 'audio-drama': 'script_dialogue', 'video-live': 'script_dialogue',
      'game-main-story': 'interactive_narrative', 'interactive-fiction': 'interactive_narrative', 'murder-mystery': 'interactive_narrative',
      'brand-copywriting': 'marketing_copy', 'ad-copywriting': 'marketing_copy', 'ecommerce-copy': 'marketing_copy',
      'social-media': 'marketing_copy', 'sales-copy': 'marketing_copy',
      'content-marketing': 'informational_article', 'news-reporting': 'informational_article', 'press-release': 'informational_article',
      'academic-paper': 'argumentative_document', 'research-report': 'argumentative_document',
      'grant-writing': 'structured_business_doc', 'business-plan': 'structured_business_doc',
      'proposal-bid': 'structured_business_doc', 'internal-docs': 'structured_business_doc', 'book-proposal': 'structured_business_doc', 'government-report': 'structured_business_doc',
      'legal-docs': 'regulated_document', 'government-docs': 'regulated_document', 'compliance-docs': 'regulated_document',
      'software-docs': 'technical_document', 'product-docs': 'technical_document', 'testing-docs': 'technical_document',
      'knowledge-base': 'knowledge_asset', 'creative-workspace': 'knowledge_asset'
    }
    const resolvedDocType = formToProfile[formId] || docType
    return WORKBENCH_PROFILES[resolvedDocType] || WORKBENCH_PROFILES['narrative_prose']
  }

  function resolveModuleForLegacyTab(tab) {
    return LEGACY_MODULE_TO_TAB[tab] || tab
  }

  function computeProjectSummary(project, profile, os) {
    try {
      const docType = (project.taxonomy && project.taxonomy.primaryDocumentType) || 'narrative_prose'
      const metrics = {}
      let moduleStatuses = {}
      let bible = null, graph = null, narrativeState = null, wiki = null, critic = null, documents = null

      try { if (os) { bible = os.readWriterProjectStoryBible(project.id) } } catch {}
      try { if (os) { graph = os.readKnowledgeGraphStore(project) } } catch {}
      try { if (os && os.narrative) { narrativeState = os.narrative.readWriterProjectNarrativeState(project.id) } } catch {}
      try { if (os && os.narrative) { wiki = os.narrative.readWriterProjectLivingWiki(project.id) } } catch {}
      try { if (os && os.safetyCouncil) { critic = os.safetyCouncil.readWriterProjectCriticCouncil(project.id) } } catch {}
      try { if (os) { documents = os.readWriterProjectDocumentEngine(project.id) } } catch {}
      try { if (os && os.moduleStatus) { moduleStatuses = os.moduleStatus.getAllModuleStatuses(project) || {} } } catch {}

      const chapters = (bible && bible.story_bible && Array.isArray(bible.story_bible.chapters)) ? bible.story_bible.chapters : []
      const timeline = (bible && bible.story_bible && Array.isArray(bible.story_bible.timeline)) ? bible.story_bible.timeline : []
      const foreshadows = (bible && bible.story_bible && Array.isArray(bible.story_bible.foreshadows)) ? bible.story_bible.foreshadows : []
      const bibleChars = (bible && bible.story_bible && Array.isArray(bible.story_bible.characters)) ? bible.story_bible.characters : []
      const criticIssues = (critic && critic.reports && Array.isArray(critic.reports))
        ? critic.reports.flatMap(r => (r.issues && Array.isArray(r.issues)) ? r.issues : []) : []
      const wikiQueue = (wiki && wiki.review_queue && Array.isArray(wiki.review_queue)) ? wiki.review_queue : []
      const docsCount = (documents && documents.documents) ? documents.documents.length : 0
      const nodesCount = (documents && documents.stats) ? (documents.stats.nodes || 0) : 0
      const totalWords = project.word_count || 0
      const graphNodes = (graph && graph.stats) ? (graph.stats.nodes || 0) : ((graph && Array.isArray(graph.nodes)) ? graph.nodes.length : 0)
      const graphEdges = (graph && graph.stats) ? (graph.stats.edges || 0) : ((graph && Array.isArray(graph.edges)) ? graph.edges.length : 0)
      const threads = (narrativeState && narrativeState.state && Array.isArray(narrativeState.state.threads)) ? narrativeState.state.threads : []
      const staleModules = Object.values(moduleStatuses).filter(s => s && s.status === 'stale').length

      const allMetrics = {
        char_count: bibleChars.length,
        chapter_count: chapters.length,
        words_total: totalWords,
        foreshadow_count: foreshadows.length,
        timeline_events: timeline.length,
        review_issues: criticIssues.length + wikiQueue.length,
        version_count: 0,
        scene_count: chapters.length,
        character_count_script: bibleChars.length,
        beat_count: 0,
        format_issues: 0,
        branch_count: 0,
        ending_count: 0,
        variable_count: 0,
        entity_count: graphNodes,
        deadend_count: 0,
        variant_count: 0,
        claim_issues: 0,
        source_count: docsCount,
        verified_sources: 0,
        citations_count: 0,
        fact_issues: criticIssues.length,
        thesis_count: 0,
        evidence_count: 0,
        fallacy_count: 0,
        citation_issues: 0,
        stakeholder_count: 0,
        milestone_count: 0,
        deliverable_count: 0,
        risk_count: 0,
        high_risks: 0,
        clause_count: chapters.length,
        compliance_issues: 0,
        approval_status: '未审批',
        api_count: 0,
        param_count: 0,
        code_examples: 0,
        validation_issues: criticIssues.length,
        changelog_entries: 0,
        term_count: 0,
        kg_nodes: graphNodes,
        kg_edges: graphEdges,
        knowledge_sources: docsCount,
        conflict_count: 0,
        doc_count: docsCount,
        doc_nodes: nodesCount,
        sections: chapters.length,
        relation_count: graphEdges,
        review_resolved: 0,
        delivery_status: '未交付',
        memories_count: 0,
        relation_count_metric: graphEdges,
        thread_count: threads.length,
        critic_reports: (critic && critic.reports) ? critic.reports.length : 0
      }

      const profileMetricIds = profile.dashboardMetricIds
      const dashboardMetrics = profileMetricIds.map(id => ({
        id,
        label: id,
        value: allMetrics[id] !== undefined ? allMetrics[id] : null,
        status: allMetrics[id] !== null ? 'ready' : 'not_configured',
        sourceModuleId: 'core'
      }))

      let currentPhase = 'prepare'
      let phaseProgress = 10
      let phaseReason = '项目刚创建，需要先准备素材和资料'
      const hasStoryGoal = !!(bible && bible.story_bible && (bible.story_bible.story_goal || bible.story_bible.premise))
      const hasDocuments = docsCount > 0
      const hasAnyContent = chapters.length > 0 || bibleChars.length > 0 || hasStoryGoal || hasDocuments || totalWords > 0
      const hasContent = totalWords > 0 || chapters.length > 0

      if (!hasAnyContent) {
        currentPhase = 'prepare'; phaseProgress = 10; phaseReason = '项目刚创建，需要先准备素材和资料'
      } else if (docType === 'narrative_prose') {
        if (!hasStoryGoal || bibleChars.length === 0) {
          currentPhase = 'build'; phaseProgress = hasStoryGoal ? 40 : 25; phaseReason = hasStoryGoal ? '已有故事目标，需要补充核心人物' : '需要建立故事圣经和核心设定'
        } else if (chapters.length === 0) {
          currentPhase = 'build'; phaseProgress = 60; phaseReason = '故事框架已建立，可以开始创作正文'
        } else if (criticIssues.length > 0 || wikiQueue.length > 0 || staleModules > 0) {
          currentPhase = 'review'; phaseProgress = 75; phaseReason = '内容创作中，但存在需要处理的问题'
        } else if (hasContent) {
          currentPhase = 'write'; phaseProgress = 70; phaseReason = '正在持续创作中'
        }
      } else if (docType === 'script_dialogue' || docType === 'interactive_narrative') {
        if (bibleChars.length === 0 && !hasDocuments) {
          currentPhase = 'build'; phaseProgress = 30; phaseReason = '需要建立角色和场景设定'
        } else if (!hasContent) {
          currentPhase = 'build'; phaseProgress = 55; phaseReason = '框架已建立，可以开始撰写内容'
        } else if (criticIssues.length > 0 || staleModules > 0) {
          currentPhase = 'review'; phaseProgress = 75; phaseReason = '内容创作中，存在需要检查的问题'
        } else {
          currentPhase = 'write'; phaseProgress = 70; phaseReason = '正在创作中'
        }
      } else if (docType === 'marketing_copy' || docType === 'informational_article') {
        if (!hasDocuments) {
          currentPhase = 'prepare'; phaseProgress = 20; phaseReason = '需要先收集素材和参考资料'
        } else if (!hasContent) {
          currentPhase = 'build'; phaseProgress = 50; phaseReason = '资料已就绪，可以开始撰写'
        } else if (criticIssues.length > 0) {
          currentPhase = 'review'; phaseProgress = 75; phaseReason = '需要事实核查或合规检查'
        } else {
          currentPhase = 'write'; phaseProgress = 70; phaseReason = '正在撰写中'
        }
      } else if (docType === 'argumentative_document' || docType === 'structured_business_doc') {
        if (!hasDocuments) {
          currentPhase = 'prepare'; phaseProgress = 15; phaseReason = '需要先收集文献和资料'
        } else if (!hasContent) {
          currentPhase = 'build'; phaseProgress = 45; phaseReason = '资料已收集，需要建立论证结构'
        } else if (criticIssues.length > 0) {
          currentPhase = 'review'; phaseProgress = 80; phaseReason = '需要审阅论证逻辑和引用'
        } else {
          currentPhase = 'write'; phaseProgress = 65; phaseReason = '正在撰写中'
        }
      } else if (docType === 'regulated_document' || docType === 'technical_document') {
        if (!hasDocuments) {
          currentPhase = 'prepare'; phaseProgress = 15; phaseReason = '需要先准备法规依据或技术资料'
        } else if (!hasContent) {
          currentPhase = 'build'; phaseProgress = 40; phaseReason = '资料已就绪，可以开始起草'
        } else if (criticIssues.length > 0) {
          currentPhase = 'review'; phaseProgress = 80; phaseReason = '需要合规检查或一致性验证'
        } else {
          currentPhase = 'write'; phaseProgress = 65; phaseReason = '正在起草中'
        }
      } else if (docType === 'knowledge_asset') {
        if (!hasDocuments) {
          currentPhase = 'prepare'; phaseProgress = 20; phaseReason = '需要先导入知识源'
        } else if (graphNodes === 0) {
          currentPhase = 'build'; phaseProgress = 50; phaseReason = '资料已导入，需要构建知识图谱'
        } else {
          currentPhase = 'write'; phaseProgress = 75; phaseReason = '知识库构建中'
        }
      } else {
        if (hasContent) {
          if (criticIssues.length > 0) { currentPhase = 'review'; phaseProgress = 75; phaseReason = '内容创作中，存在需要处理的问题' }
          else { currentPhase = 'write'; phaseProgress = 70; phaseReason = '正在创作中' }
        } else if (hasDocuments) {
          currentPhase = 'build'; phaseProgress = 40; phaseReason = '资料已就绪，可以开始创作'
        }
      }

      return { metrics: allMetrics, dashboardMetrics, moduleStatuses, currentPhase, phaseProgress, phaseReason, criticIssues, wikiQueue, chapters, bibleChars, threads, staleModules, hasAnyContent, hasContent, hasDocuments }
    } catch (err) {
      return { metrics: {}, dashboardMetrics: [], moduleStatuses: {}, currentPhase: 'prepare', phaseProgress: 0, phaseReason: '项目初始化中', criticIssues: [], wikiQueue: [], chapters: [], bibleChars: [], threads: [], staleModules: 0 }
    }
  }

  const writerWorkbenchProfileMatch = reqPath.match(/^\/api\/writer\/projects\/([^/?]+)\/workbench\/profile$/)
  if (writerWorkbenchProfileMatch && method === 'GET') {
    try {
      const ref = decodeURIComponent(writerWorkbenchProfileMatch[1])
      const project = findWriterProject(ref)
      if (!project) return { ok: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' }
      const profile = resolveWorkbenchProfile(project)
      const taxonomy = project.taxonomy || {}
      return {
        ok: true,
        profile: {
          id: profile.id,
          name: profile.name,
          navigation: profile.navigation.map(g => ({
            ...g,
            modules: g.moduleIds.map(mid => MODULE_DEFINITIONS[mid]).filter(Boolean)
          })),
          labels: profile.labels,
          capabilityPackIds: profile.capabilityPackIds,
          dashboardMetricIds: profile.dashboardMetricIds,
          taxonomy: {
            primaryDocumentType: taxonomy.primaryDocumentType || 'narrative_prose',
            formId: taxonomy.formId || '',
            domainId: taxonomy.domainId || 'literature',
            familyId: taxonomy.familyId || 'novel',
            customFormLabel: taxonomy.customFormLabel
          }
        }
      }
    } catch (err) { return notConfigured('writer_workbench', err instanceof Error ? err.message : String(err)) }
  }

  const writerWorkbenchConfigMatch = reqPath.match(/^\/api\/writer\/projects\/([^/?]+)\/workbench\/config$/)
  if (writerWorkbenchConfigMatch && method === 'PUT') {
    try {
      const ref = decodeURIComponent(writerWorkbenchConfigMatch[1])
      const project = findWriterProject(ref)
      if (!project) return { ok: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' }
      const input = request?.body || body || {}
      const next = { ...project }
      if (input.enabledModuleIds) next.enabled_module_ids = input.enabledModuleIds
      if (input.disabledModuleIds) next.disabled_module_ids = input.disabledModuleIds
      if (input.capabilityPackIds) next.enabled_capability_packs = input.capabilityPackIds
      updateWriterProject(ref, next)
      return { ok: true }
    } catch (err) { return notConfigured('writer_workbench', err instanceof Error ? err.message : String(err)) }
  }

  const writerWorkbenchSummaryMatch = reqPath.match(/^\/api\/writer\/projects\/([^/?]+)\/workbench\/summary$/)
  if (writerWorkbenchSummaryMatch && method === 'GET') {
    try {
      const ref = decodeURIComponent(writerWorkbenchSummaryMatch[1])
      const os = getWriterOs()
      const project = findWriterProject(ref)
      if (!project) return { ok: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' }
      const profile = resolveWorkbenchProfile(project)
      const summary = computeProjectSummary(project, profile, os)

      const docType = (project.taxonomy && project.taxonomy.primaryDocumentType) || 'narrative_prose'
      const nextActions = []
      const attention = []

      if (!summary.hasAnyContent) {
        nextActions.push({ id: 'prepare-docs', title: '导入资料', description: '先导入项目相关资料，为创作做准备', route: 'documents' })
        nextActions.push({ id: 'setup-guide', title: '项目引导', description: '通过引导完成项目初始设置', route: 'guide' })
      } else if (summary.currentPhase === 'prepare') {
        nextActions.push({ id: 'build-structure', title: '建立项目结构', description: '根据项目类型建立核心框架', route: 'structure' })
      } else if (summary.currentPhase === 'build') {
        nextActions.push({ id: 'start-writing', title: '开始创作', description: '框架已就绪，可以开始撰写内容', route: 'editor' })
      } else if (summary.currentPhase === 'write') {
        if (summary.criticIssues.length > 0 || summary.wikiQueue.length > 0) {
          nextActions.push({ id: 'review-issues', title: '处理审阅问题', description: '检查并解决已发现的问题', route: 'review' })
        } else {
          nextActions.push({ id: 'continue-write', title: '继续创作', description: '保持创作节奏，推进内容进度', route: 'editor' })
        }
      } else if (summary.currentPhase === 'review') {
        nextActions.push({ id: 'fix-issues', title: '处理问题', description: '解决审阅中发现的问题', route: 'review' })
      } else {
        nextActions.push({ id: 'deliver', title: '准备交付', description: '完成最终检查并导出交付', route: 'delivery' })
      }

      if (summary.staleModules > 0) {
        attention.push({ id: 'stale-modules', title: `${summary.staleModules}个模块数据过期`, description: '部分模块数据需要重新生成', severity: 'warning', source: '系统', route: 'guide' })
      }
      if (summary.criticIssues.length > 0) {
        attention.push({ id: 'critic-issues', title: `${summary.criticIssues.length}条审阅问题`, description: '需要处理的审阅反馈', severity: summary.criticIssues.some(i => i.severity === 'critical') ? 'critical' : 'warning', source: profile.labels.reviewCenter, route: 'critic-council' })
      }

      const recentItems = []
      try {
        const versions = getProjectVersions(project)
        if (versions && versions.versions) {
          for (const v of versions.versions.slice(0, 4)) {
            recentItems.push({ id: v.id || `v-${v.timestamp}`, title: v.message || '版本记录', subtitle: v.timestamp ? new Date(v.timestamp).toLocaleString('zh-CN') : '', type: 'version', route: 'versions', updatedAt: v.timestamp })
          }
        }
      } catch {}

      return {
        ok: true,
        summary: {
          phase: { current: summary.currentPhase, progress: summary.phaseProgress, reason: summary.phaseReason },
          nextAction: nextActions[0] || null,
          attention,
          recentItems,
          counts: summary.metrics,
          metrics: summary.dashboardMetrics,
          labels: profile.labels,
          docType,
          project: {
            id: project.id,
            title: project.title,
            folder: project.folder,
            taxonomy: project.taxonomy || {}
          }
        }
      }
    } catch (err) { return notConfigured('writer_workbench', err instanceof Error ? err.message : String(err)) }
  }

  const writerWorkbenchMatch = reqPath.match(/^\/api\/writer\/projects\/([^/?]+)\/workbench$/)
  if (writerWorkbenchMatch && method === 'GET') {
    try {
      const ref = decodeURIComponent(writerWorkbenchMatch[1])
      const os = getWriterOs()
      const project = findWriterProject(ref)
      if (!project) return notConfigured('writer_projects', `Project not found: ${ref}`)

      let bible = null
      let graph = null
      let narrativeState = null
      let wiki = null
      let critic = null
      let safety = null
      let documents = null
      let moduleStatuses = {}
      let versions = { versions: [] }

      try { bible = os.readWriterProjectStoryBible(ref) } catch {}
      try { graph = os.readKnowledgeGraphStore(project) } catch {}
      try { narrativeState = os.narrative.readWriterProjectNarrativeState(ref) } catch {}
      try { wiki = os.narrative.readWriterProjectLivingWiki(ref) } catch {}
      try { critic = os.safetyCouncil.readWriterProjectCriticCouncil(ref) } catch {}
      try { safety = os.safetyCouncil.readWriterProjectSafety(ref) } catch {}
      try { documents = os.readWriterProjectDocumentEngine(ref) } catch {}
      try { moduleStatuses = os.moduleStatus.getAllModuleStatuses(project) || {} } catch {}
      try { versions = getProjectVersions(project) } catch {}

      const chapters = (bible && bible.story_bible && Array.isArray(bible.story_bible.chapters)) ? bible.story_bible.chapters : []
      const characters = (bible && bible.story_bible && Array.isArray(bible.story_bible.characters)) ? bible.story_bible.characters : []
      const hasStoryGoal = !!(bible && bible.story_bible && (bible.story_bible.story_goal || bible.story_bible.premise))
      const hasDocuments = !!(documents && documents.documents && documents.documents.length > 0)
      const hasAnyContent = chapters.length > 0 || characters.length > 0 || hasStoryGoal || hasDocuments

      const wikiReviewQueue = (wiki && wiki.review_queue && Array.isArray(wiki.review_queue)) ? wiki.review_queue : []
      const criticIssues = (critic && critic.reports && Array.isArray(critic.reports))
        ? critic.reports.flatMap(r => (r.issues && Array.isArray(r.issues)) ? r.issues : [])
        : []
      const safetyIssues = (safety && safety.issues && Array.isArray(safety.issues)) ? safety.issues : []
      const staleModules = Object.values(moduleStatuses).filter(s => s && s.status === 'stale').length

      let currentPhase = 'prepare'
      let phaseProgress = 0
      let phaseReason = '项目刚创建，需要先准备素材和资料'

      if (!hasAnyContent) {
        currentPhase = 'prepare'
        phaseProgress = 10
        phaseReason = '项目刚创建，需要先准备素材和资料'
      } else if (!hasStoryGoal || characters.length === 0) {
        currentPhase = 'build'
        phaseProgress = hasStoryGoal ? 40 : 25
        phaseReason = hasStoryGoal ? '已有故事目标，需要补充核心人物' : '需要建立故事圣经和核心设定'
      } else if (chapters.length === 0) {
        currentPhase = 'build'
        phaseProgress = 60
        phaseReason = '故事框架已建立，可以开始创作正文'
      } else {
        const hasRecentChapters = chapters.length > 0
        if (criticIssues.length > 0 || wikiReviewQueue.length > 0 || staleModules > 0) {
          currentPhase = 'review'
          phaseProgress = 75
          phaseReason = '正文创作中，但存在需要处理的问题'
        } else {
          currentPhase = 'write'
          phaseProgress = 70
          phaseReason = '正在持续创作中'
        }
      }

      const nextActions = []

      if (!hasStoryGoal) {
        nextActions.push({
          id: 'build-bible',
          title: '完善故事圣经',
          description: '先建立故事目标和核心设定，为后续创作打基础',
          route: 'bible',
          priority: 1
        })
      }

      if (characters.length === 0 && hasStoryGoal) {
        nextActions.push({
          id: 'add-characters',
          title: '创建主要人物',
          description: '故事还没有主要人物，先创建一位推动故事发生的人物',
          route: 'bible',
          priority: 2
        })
      }

      if (chapters.length === 0 && hasStoryGoal && characters.length > 0) {
        nextActions.push({
          id: 'create-first-chapter',
          title: '开始创作第一章',
          description: '你的故事框架已经建立，可以开始第一章了',
          route: 'bible',
          priority: 1
        })
      }

      if (chapters.length > 0) {
        const lastChapter = chapters[chapters.length - 1]
        nextActions.push({
          id: 'continue-writing',
          title: `继续《${lastChapter.title || `第${chapters.length}章`}》`,
          description: `上次编辑：${lastChapter.updated_at ? new Date(lastChapter.updated_at).toLocaleString('zh-CN') : '尚未编辑'}`,
          route: 'bible',
          entityId: lastChapter.id,
          priority: 1
        })
      }

      if (wikiReviewQueue.length > 0) {
        nextActions.push({
          id: 'review-wiki',
          title: `处理 ${wikiReviewQueue.length} 条百科待确认`,
          description: '活百科有新的更新待确认',
          route: 'wiki',
          priority: 3
        })
      }

      if (criticIssues.length > 0) {
        nextActions.push({
          id: 'review-critic',
          title: `处理 ${criticIssues.length} 条评审问题`,
          description: '评审委员会发现了需要关注的问题',
          route: 'critic',
          priority: 3
        })
      }

      nextActions.sort((a, b) => a.priority - b.priority)
      const nextAction = nextActions[0] || {
        id: 'explore',
        title: '探索项目',
        description: '熟悉项目结构和已有内容',
        route: 'dashboard',
        priority: 99
      }

      const attention = []

      for (const issue of criticIssues.slice(0, 3)) {
        attention.push({
          id: `critic-${issue.id || issue.title}`,
          severity: issue.severity || 'warning',
          title: issue.title || issue.message || '评审问题',
          source: '评审委员会',
          description: issue.description || issue.message || '',
          route: 'critic',
          blocking: issue.severity === 'critical' || issue.severity === 'blocking'
        })
      }

      for (const item of wikiReviewQueue.slice(0, 2)) {
        attention.push({
          id: `wiki-${item.id || item.entity_name}`,
          severity: 'info',
          title: `百科待确认：${item.entity_name || item.title || '新条目'}`,
          source: '活百科',
          description: item.change_summary || item.reason || '',
          route: 'wiki',
          blocking: false
        })
      }

      for (const [moduleName, status] of Object.entries(moduleStatuses)) {
        if (status && status.status === 'stale') {
          attention.push({
            id: `stale-${moduleName}`,
            severity: 'warning',
            title: `${moduleName} 已过期`,
            source: '模块状态',
            description: status.reason || '源文件已变更，需要重新构建',
            route: moduleName,
            blocking: false
          })
        }
      }

      const recentItems = []

      for (const ch of [...chapters].reverse().slice(0, 5)) {
        recentItems.push({
          id: `chapter-${ch.id}`,
          type: 'chapter',
          title: ch.title || '未命名章节',
          subtitle: ch.summary || '',
          updatedAt: ch.updated_at || ch.created_at,
          route: 'bible'
        })
      }

      for (const c of [...characters].reverse().slice(0, 3)) {
        recentItems.push({
          id: `char-${c.id}`,
          type: 'character',
          title: c.name || '未命名人物',
          subtitle: c.role || '',
          updatedAt: c.updated_at || c.created_at,
          route: 'bible'
        })
      }

      if (versions.versions && versions.versions.length > 0) {
        for (const v of versions.versions.slice(0, 2)) {
          recentItems.push({
            id: `ver-${v.id || v.version}`,
            type: 'version',
            title: v.label || `版本 ${v.version}`,
            subtitle: v.description || '',
            updatedAt: v.created_at,
            route: 'versions'
          })
        }
      }

      recentItems.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())

      return {
        ok: true,
        project: {
          workspaceId: project.workspace_id,
          writerProjectId: project.id,
          title: project.title,
          type: project.type || 'novel',
          revision: project.revision || 0,
          updatedAt: project.updated_at
        },
        phase: {
          current: currentPhase,
          progress: phaseProgress,
          reason: phaseReason
        },
        nextAction,
        attention: attention.slice(0, 5),
        recentItems: recentItems.slice(0, 8),
        moduleStatuses,
        counts: {
          chapters: chapters.length,
          characters: characters.length,
          unresolvedIssues: criticIssues.length + wikiReviewQueue.length,
          staleModules
        }
      }
    } catch (err) {
      return notConfigured('writer_workbench', err instanceof Error ? err.message : String(err))
    }
  }
  const writerProjectMatch = reqPath.match(/^\/api\/writer\/projects\/([^/?]+)(?:\/(status|export|save|open))?$/)
  if (writerProjectMatch) {
    const ref = decodeURIComponent(writerProjectMatch[1])
    const action = writerProjectMatch[2] || ''
    try {
      if (!action && method === 'GET') { const project = findWriterProject(ref); return project ? enrichWriterProject(project) : notConfigured('writer_projects', `Project not found: ${ref}`) }
      if (!action && method === 'PATCH') return { ok: true, project: updateWriterProject(ref, body || {}) }
      if (!action && method === 'DELETE') return deleteWriterProject(ref)
      if (action === 'open' && method === 'POST') return { ok: true, project: setActiveWriterProject(ref) }
      if (action === 'status') return { ok: true, markdown: writerProjectStatusMarkdown(ref) }
      if (action === 'export' && method === 'POST') return { ok: true, export: exportWriterProject(ref) }
      if (action === 'save' && method === 'POST') return { ok: true, saved: saveWriterProjectFile({ ...(body || {}), projectRef: ref }) }
    } catch (err) {
      if (err.code === 'EMPTY_PROJECT') {
        return { ok: false, error: 'EMPTY_PROJECT', message: err.message }
      }
      return notConfigured('writer_projects', err instanceof Error ? err.message : String(err))
    }
  }

  // ---- Writer OS unified API ----
  const writerOsMatch = reqPath.match(/^\/api\/writer\/projects\/([^/?]+)\/os\/([^/?]+)(?:\/([^/?]+))?$/)
  if (writerOsMatch) {
    const ref = decodeURIComponent(writerOsMatch[1])
    const module = writerOsMatch[2]
    const action = writerOsMatch[3] || (method === 'POST' ? 'run' : 'get')
    try {
      const os = getWriterOs()
      const project = findWriterProject(ref)
      if (!project) return notConfigured('writer_os', `Project not found: ${ref}`)
      switch (module) {
        case 'story-bible':
        case 'bible': {
          if (method === 'GET') return os.readWriterProjectStoryBible(ref)
          if (method === 'POST' || method === 'PUT') {
            const bibleAction = String(body?.action || 'build')
            if (bibleAction === 'build' || bibleAction === 'analyze') {
              const analyzed = analyzeWriterProject(ref, body || {})
              return { ok: true, project: enrichWriterProject(project), story_bible: os.buildStoryBible(project, analyzed.bible) }
            }
            if (bibleAction === 'add' || bibleAction === 'update' || bibleAction === 'upsert') {
              return os.updateStoryBibleField(project, body?.section || 'characters', body?.item || body || {})
            }
            if (bibleAction === 'delete' || bibleAction === 'remove') {
              return os.deleteStoryBibleItem(project, body?.section || 'characters', body?.item_id || body?.id)
            }
            if (bibleAction === 'add-timeline-event') {
              return os.addTimelineEvent(project, body?.event || body || {})
            }
            const analyzed = analyzeWriterProject(ref, body || {})
            return { ok: true, project: enrichWriterProject(project), story_bible: os.buildStoryBible(project, analyzed.bible) }
          }
          break
        }
        case 'wiki':
        case 'living-wiki': {
          if (method === 'GET') {
            if (action === 'queue' || action === 'review-queue') return os.narrative.livingWikiReviewQueue(project)
            return os.narrative.readWriterProjectLivingWiki(ref)
          }
          if (method === 'POST') {
            const wikiAction = String(body?.action || action || 'generate')
            if (wikiAction === 'generate' || wikiAction === 'candidates') return os.narrative.generateLivingWikiCandidates(project)
            if (wikiAction === 'confirm' || wikiAction === 'accept' || wikiAction === 'accept-all') return os.narrative.confirmLivingWikiUpdates(project, body || {})
            if (wikiAction === 'reject' || wikiAction === 'dismiss') return os.narrative.rejectLivingWikiUpdates(project, body || {})
            return os.narrative.handleWriterProjectLivingWiki(ref, body || {})
          }
          break
        }
        case 'graph':
        case 'knowledge-graph': {
          if (method === 'GET') {
            const g = os.readKnowledgeGraphStore(project)
            return { ok: true, ...g }
          }
          if (method === 'POST' || method === 'PUT') {
            const gAction = String(body?.action || 'build')
            if (gAction === 'build' || gAction === 'rebuild') return os.narrative.buildWriterProjectKnowledgeGraph(project)
            if (gAction === 'add-node') return os.addGraphNode(project, body || {})
            if (gAction === 'update-node') return os.updateGraphNode(project, body?.node_id || body?.id, body?.patch || body || {})
            if (gAction === 'delete-node') return os.deleteGraphNode(project, body?.node_id || body?.id)
            if (gAction === 'add-edge') return os.addGraphEdge(project, body || {})
            if (gAction === 'update-edge') return os.updateGraphEdge(project, body?.edge_id || body?.id, body?.patch || body || {})
            if (gAction === 'delete-edge') return os.deleteGraphEdge(project, body?.edge_id || body?.id)
            return os.narrative.buildWriterProjectKnowledgeGraph(project)
          }
          break
        }
        case 'state':
        case 'narrative-state': {
          if (method === 'GET') return os.narrative.readWriterProjectNarrativeState(ref)
          if (method === 'POST' || method === 'PUT') return os.narrative.buildWriterProjectNarrativeState(project)
          break
        }
        case 'critic':
        case 'critic-council': {
          if (method === 'GET') return os.safetyCouncil.readWriterProjectCriticCouncil(ref)
          if (method === 'POST' || method === 'PUT') return os.safetyCouncil.runCriticCouncil(project, body || {})
          break
        }
        case 'safety': {
          if (method === 'GET') return os.safetyCouncil.readWriterProjectSafety(ref)
          if (method === 'POST' || method === 'PUT') return os.safetyCouncil.buildWriterSafetyReport(project, body || {})
          break
        }
        case 'memory':
        case 'creative-memory': {
          if (method === 'GET') return os.memory.readWriterProjectCreativeMemory(ref)
          if (method === 'POST' || method === 'PUT') {
            const memAction = String(body?.action || 'build')
            if (memAction === 'add') return os.memory.addCreativeMemory(project, body || {})
            if (memAction === 'forget' || memAction === 'delete') return os.memory.forgetCreativeMemory(project, body || {})
            return os.memory.rebuildCreativeMemory(project)
          }
          break
        }
        case 'search':
        case 'creative-search': {
          if (method === 'POST' || method === 'GET') return os.docSearch.runCreativeSearch(project, { query: body?.query || project.title, limit: body?.limit || 12 })
          break
        }
        case 'documents': {
          if (method === 'GET') return os.readWriterProjectDocumentEngine(ref)
          if (method === 'POST' || method === 'PUT') return os.syncWriterProjectDocuments(project)
          break
        }
        case 'rag': {
          if (method === 'POST' || method === 'PUT') return await os.handleWriterProjectRag(ref, body || {})
          return os.handleWriterProjectRag(ref, { action: 'read' })
        }
        case 'vectors':
        case 'vector-store': {
          if (method === 'POST' || method === 'PUT') return await os.buildWriterProjectVectorStore(project)
          return { ok: true, ...readJsonFile(os.paths.writerProjectVectorStorePath(project), { version: 1, vectors: [] }) }
        }
        case 'data-model': {
          if (method === 'GET') return os.dataModel.readWriterProjectDataModel(ref)
          if (method === 'POST' || method === 'PUT') return os.dataModel.buildWriterProjectDataModel(project)
          break
        }
        case 'benchmark': {
          if ((method === 'POST' || method === 'PUT') && String(body?.action || '').toLowerCase() === 'audit') return os.commandCenter.writerOsAcceptanceAudit(project)
          if (method === 'POST' || method === 'PUT') return os.benchmark.runWriterProjectBenchmark(project)
          return { ok: true, ...readJsonFile(os.paths.writerProjectBenchmarksPath(project), { version: 1, runs: [] }) }
        }
        case 'capability-packs': {
          return { ok: true, ...os.readCapabilityPackStore(project) }
        }
        case 'command-center': {
          return os.commandCenter.buildWriterCommandCenter(project)
        }
        case 'guide': {
          if (method === 'GET') return os.guide.readWriterProjectGuide(ref)
          if (method === 'POST') return await os.guide.handleWriterProjectGuide(ref, body || {})
          break
        }
        case 'delivery': {
          return os.delivery.buildWriterDeliveryPackage(project, body || {})
        }
        case 'artifacts': {
          if (String(body?.action || '').toLowerCase().includes('delivery')) return os.delivery.buildWriterDeliveryPackage(project, body || {})
          return { ok: true, ...os.readProjectArtifactStore(project) }
        }
        case 'status':
        case 'module-status': {
          if (method === 'POST' || method === 'PUT') {
            const statusAction = String(body?.action || '').toLowerCase()
            if (statusAction === 'mark-stale' && body?.module) {
              return { ok: true, status: os.moduleStatus.markModuleStale(project, body.module, body.reason || '') }
            }
            if (statusAction === 'propagate-stale' && body?.module) {
              return { ok: true, status: os.moduleStatus.propagateStale(project, body.module, body.reason || '') }
            }
            if (statusAction === 'increment-revision') {
              return { ok: true, status: os.moduleStatus.incrementProjectRevision(project, body.reason || '') }
            }
          }
          return { ok: true, status: os.moduleStatus.getAllModuleStatuses(project) }
        }
        case 'file-watcher':
        case 'watcher': {
          const watcherAction = String(body?.action || action || 'status').toLowerCase()
          if (watcherAction === 'start' || watcherAction === 'enable') {
            const started = os.fileWatcher.setupProjectWatcher(project, (changes) => {
              try {
                os.moduleStatus.incrementProjectRevision(project, `file_change:${changes.files[0] || 'batch'}`)
                for (const mod of changes.modules) {
                  os.moduleStatus.propagateStale(project, mod, `source file changed: ${changes.files[0] || 'batch'}`)
                }
              } catch (e) {
                console.warn('[watcher] onChange handler error:', e.message)
              }
            })
            return { ok: !!started, watcher: started ? { id: started.id, folder: started.folder } : null }
          }
          if (watcherAction === 'stop' || watcherAction === 'disable') {
            os.fileWatcher.stopProjectWatcher(project.id || project.workspace_id)
            return { ok: true, stopped: true }
          }
          if (watcherAction === 'list' || watcherAction === 'all') {
            return { ok: true, watchers: os.fileWatcher.listActiveWatchers() }
          }
          if (watcherAction === 'build-queue') {
            return {
              ok: true,
              queue: os.fileWatcher.getBuildQueue(),
              active: os.fileWatcher.getActiveBuilds()
            }
          }
          return { ok: true, status: os.fileWatcher.getProjectWatcherStatus(project.id || project.workspace_id) }
        }
        case 'loop':
        case 'verify': {
          return await os.runWriterOsLoopVerification(project, body || {})
        }
        case 'bootstrap':
        case 'repair': {
          return await os.guide.runWriterProjectGuideRepair(project, { ...(body || {}), action: 'repair' })
        }
        default:
          return {
            ok: false,
            error: `Unknown writer-os module: ${module}`,
            available: [...new Set([...WRITER_OS_CONTRACT_MODULES, 'vector-store', 'data-model', 'capability-packs', 'command-center', 'bootstrap'])]
          }
      }
    } catch (err) {
      return notConfigured('writer_os', err instanceof Error ? err.message : String(err))
    }
  }

  // ---- Status (mock) ----
  if (reqPath === '/api/status') {
    return {
      version: '0.1.0',
      release_date: new Date().toISOString().slice(0, 10),
      active_sessions: sessions.size,
      config_path: backendDataPath('config.yaml'),
      config_version: 1,
      latest_config_version: 1,
      env_path: getBackendEnvPath(),
      karna_home: KARNA_DATA_ROOT,
      gateway_running: backendReady,
      gateway_state: backendReady ? 'running' : 'mock',
      gateway_pid: karnaProcess?.pid ?? null,
      gateway_exit_reason: null,
      gateway_health_url: `${karnaBackendUrl}/health`,
      gateway_updated_at: new Date().toISOString(),
      gateway_platforms: {}
    }
  }

  // ---- Audio helpers ----
  if (reqPath === '/api/audio/elevenlabs/voices') {
    return { voices: [] }
  }

  // ---- Logs (mock) ----
  if (reqPath === '/api/logs' || reqPath.startsWith('/api/logs?')) {
    const query = new URLSearchParams(String(reqPath).split('?')[1] || '')
    const filters = {
      module: query.get('module') || undefined,
      level: query.get('level') || undefined,
      requestId: query.get('request_id') || undefined,
      since: query.get('since') || undefined
    }
    return { file: 'desktop', lines: getLogsFiltered(filters), stats: getLogStats(), filters }
  }

  // ---- Env vars ----
  if (reqPath === '/api/env') {
    if (method === 'GET') {
      return Object.fromEntries([...MODEL_PROVIDERS.map(provider => [provider.key_env, envInfo(provider)]), ['CUSTOM_BASE_URL', { advanced: false, category: 'models', description: 'Base URL for a custom OpenAI-compatible endpoint.', is_password: false, is_set: !!getEnvValue('CUSTOM_BASE_URL').trim(), provider: 'custom', provider_label: 'Custom', redacted_value: getEnvValue('CUSTOM_BASE_URL') || null, tools: [], url: null }], ['CUSTOM_MODEL_NAME', { advanced: false, category: 'models', description: 'Model name for the custom endpoint.', is_password: false, is_set: !!getEnvValue('CUSTOM_MODEL_NAME').trim(), provider: 'custom', provider_label: 'Custom', redacted_value: getEnvValue('CUSTOM_MODEL_NAME') || null, tools: [], url: null }], ['CUSTOM_API_KEY', { advanced: false, category: 'models', description: 'API key for the custom endpoint.', is_password: true, is_set: !!getEnvValue('CUSTOM_API_KEY').trim(), provider: 'custom', provider_label: 'Custom', redacted_value: getEnvValue('CUSTOM_API_KEY') ? `${getEnvValue('CUSTOM_API_KEY').slice(0, 4)}?${getEnvValue('CUSTOM_API_KEY').slice(-4)}` : null, tools: [], url: null }]])
    }
    if (method === 'PUT') {
      if (body?.key) {
        writeEnvValue(String(body.key), String(body.value || ''))
        const provider = findProviderByEnv(body.key)
        if (provider?.key_env === body.key && isProviderConfigured(provider)) {
          currentModelProvider = provider.slug
          currentModel = provider.models[0] || currentModel
          if (!karnaConfig.models) karnaConfig.models = {}
          karnaConfig.models.default = currentModel
          persistCurrentModelSelection()
        }
      }
      return { ok: true }
    }
    if (method === 'DELETE') {
      if (body?.key) deleteEnvValue(String(body.key))
      return { ok: true }
    }
  }
  if (reqPath === '/api/env/reveal') {
    const key = String(body?.key || '')
    return { key, value: getEnvValue(key) }
  }

  // ---- OAuth (mock) ----
  if (reqPath === '/api/providers/oauth') return { providers: [] }
  if (reqPath.startsWith('/api/providers/oauth/')) {
    if (reqPath.includes('/start')) return notConfigured('oauth', 'OAuth flow is not configured for this provider.', { session_id: null, url: '' })
    if (reqPath.includes('/submit')) return notConfigured('oauth', 'OAuth flow is not configured for this provider.')
    if (reqPath.includes('/poll/')) return notConfigured('oauth', 'OAuth flow is not configured for this provider.', { status: 'not_configured' })
    if (reqPath.includes('/sessions/')) return notConfigured('oauth', 'OAuth session storage is not configured.')
    return notConfigured('oauth', 'OAuth provider is not configured.', { cli_command: '', docs_url: '', flow: 'external', id: '', name: '', configured: false })
  }
  if (reqPath === '/api/providers/validate') {
    const provider = findProviderByEnv(body?.key || body?.env_key || body?.envKey)
    const value = String(body?.value || body?.api_key || '').trim()
    if (!provider) return { ok: false, reachable: false, message: '\u672a\u77e5\u7684\u6a21\u578b\u63d0\u4f9b\u65b9\u5bc6\u94a5\u3002', models: [] }
    if (!value) return { ok: false, reachable: false, message: `Paste ${provider.key_env} first.`, models: [] }
    const providerUrls = {
      openai: 'https://api.openai.com/v1',
      deepseek: 'https://api.deepseek.com/v1',
      qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      glm: 'https://open.bigmodel.cn/api/paas/v4'
    }
    if (provider.slug === 'anthropic' || provider.slug === 'gemini') {
      return { ok: true, reachable: true, message: 'Credential saved. This provider will be verified by its native chat endpoint on first request.', models: provider.models }
    }
    const test = await testOpenAICompatibleModel({ base_url: providerUrls[provider.slug], model_name: provider.models[0], api_key: value })
    return { ...test, models: test.ok ? provider.models : [] }
  }

  // ---- Memory ----
  if (reqPath.startsWith('/api/memory/')) return notConfigured('memory', 'Memory backend is not configured.', { values: {} })

  // ---- Messaging ----
  if (reqPath.startsWith('/api/messaging/')) return notConfigured('messaging', 'Messaging platform integration is not configured.', { platforms: [] })

  // ---- Cron ----
  if (reqPath.startsWith('/api/cron')) {
    if (reqPath === '/api/cron/jobs' && method === 'GET') return notConfigured('cron', 'Cron scheduler is not configured.', { jobs: [] })
    if (/^\/api\/cron\/jobs\/[^/?]+\/runs/.test(reqPath)) return notConfigured('cron', 'Cron scheduler is not configured.', { runs: [] })
    return notConfigured('cron', 'Cron scheduler is not configured.', { jobs: [] })
  }


  // ---- Profiles (mock) ----
  if (reqPath === '/api/profiles') {
    if (method === 'GET') {
      return {
        profiles: Array.from(profiles.values()),
        active: 'default'
      }
    }
    if (method === 'POST') {
      const requested = String(body?.name || `profile-${profiles.size + 1}`).trim() || `profile-${profiles.size + 1}`
      const profile = { name: requested, label: requested, is_default: requested === 'default' }
      profiles.set(requested, profile)
      return { ok: true, name: requested, path: `profiles/${requested}` }
    }
  }

  if (reqPath === '/api/profiles/active') {
    return {
      name: 'default',
      label: 'Default',
      is_default: true,
      provider: currentModelProvider,
      model: currentModel,
      created: Date.now() / 1000 - 86400,
      updated: Date.now() / 1000
    }
  }

  const profileSoulMatch = reqPath.match(/^\/api\/profiles\/([^/?]+)\/soul$/)
  if (profileSoulMatch) {
    const profileName = decodeURIComponent(profileSoulMatch[1])
    if (method === 'GET') {
      return soulPrompts.getProfileSoul(profileName)
    }
    if (method === 'PUT') {
      return soulPrompts.setProfileSoul(profileName, String(body?.content || ''))
    }
    if (method === 'DELETE') {
      return soulPrompts.resetProfileSoul(profileName)
    }
  }

  const profileSetupMatch = reqPath.match(/^\/api\/profiles\/([^/?]+)\/setup-command$/)
  if (profileSetupMatch) {
    const profileName = decodeURIComponent(profileSetupMatch[1])
    return { command: `karna --profile ${profileName}` }
  }

  if (reqPath === '/api/karna/core-policy') {
    return { editable: false, summary: soulPrompts.CORE_POLICY_SUMMARY }
  }

  // ---- Mode API ----
  if (reqPath === '/api/karna/modes' && method === 'POST') {
    const mode = String(body?.mode || 'direct')
    const workspaceId = String(body?.workspaceId || body?.workspace_id || 'default')
    const conversationId = body?.conversationId || body?.conversation_id || null
    const projectId = body?.projectId || body?.project_id || null
    const parentSessionId = body?.parentSessionId || body?.parent_session_id || null
    const workflowSelection = body?.workflowSelection || body?.workflow_selection || null
    const resourceSelection = body?.resourceSelection || body?.resource_selection || null
    const initialContract = body?.initialContract || body?.initial_contract || null
    let metadata = body?.metadata || {}

    if (workflowSelection?.workflowId) {
      try {
        const resolveResult = resolveWorkflow({
          workflow_id: workflowSelection.workflowId,
          workspace_id: projectId || workspaceId,
          session_id: conversationId
        })
        if (resolveResult?.ok && resolveResult.workflow && resolveResult.binding) {
          const compat = modeService.checkWorkflowCompatibility(
            mode === 'direct' ? 'plan' : mode,
            resolveResult.workflow,
            resolveResult.agents || [],
            resolveResult.binding.source
          )
          metadata = {
            ...metadata,
            _resolvedWorkflow: resolveResult,
            _workflowCompatibility: compat
          }
        }
      } catch (err) {
        rememberLog(`Mode workflow resolution failed: ${err.message}`)
      }
    }

    const session = modeService.createSession({
      mode, workspaceId, conversationId, projectId, parentSessionId,
      metadata, workflowSelection, resourceSelection, initialContract
    })

    if (session.binding && metadata?._resolvedWorkflow?.workflow) {
      const workflowSnapshot = modeCompatibilityCompiler.createWorkflowBindingSnapshot(
        metadata._resolvedWorkflow.workflow,
        metadata._resolvedWorkflow.agents || [],
        metadata._resolvedWorkflow.binding?.source || 'mode_default',
        mode
      )
      modeService.updateBindingWorkflow(session.id, workflowSnapshot, 1)
    }

    return session
  }

  if (reqPath === '/api/karna/modes' || reqPath.startsWith('/api/karna/modes?')) {
    const url = new URL(reqPath, 'http://localhost')
    return modeService.listSessions({
      conversationId: url.searchParams.get('conversationId') || url.searchParams.get('conversation_id'),
      workspaceId: url.searchParams.get('workspaceId') || url.searchParams.get('workspace_id'),
      projectId: url.searchParams.get('projectId') || url.searchParams.get('project_id'),
      mode: url.searchParams.get('mode'),
      status: url.searchParams.get('status'),
      limit: Number(url.searchParams.get('limit')) || 50,
      offset: Number(url.searchParams.get('offset')) || 0
    })
  }

  const activeModeMatch = reqPath.match(/^\/api\/karna\/modes\/active\/([^/?]+)$/)
  if (activeModeMatch) {
    const conversationId = decodeURIComponent(activeModeMatch[1])
    return modeService.getActiveForConversation(conversationId)
  }

  const modeIdMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)$/)
  if (modeIdMatch && method === 'GET') {
    const sessionId = decodeURIComponent(modeIdMatch[1])
    return modeService.getSession(sessionId) || { error: 'Not found' }
  }

  const modePauseMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/pause$/)
  if (modePauseMatch && method === 'POST') {
    const sessionId = decodeURIComponent(modePauseMatch[1])
    const expectedVersion = Number(body?.expectedVersion || body?.expected_version || 1)
    const reason = String(body?.reason || '')
    return modeService.pause(sessionId, expectedVersion, reason)
  }

  const modeResumeMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/resume$/)
  if (modeResumeMatch && method === 'POST') {
    const sessionId = decodeURIComponent(modeResumeMatch[1])
    const expectedVersion = Number(body?.expectedVersion || body?.expected_version || 1)
    return modeService.resume(sessionId, expectedVersion)
  }

  const modeCancelMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/cancel$/)
  if (modeCancelMatch && method === 'POST') {
    const sessionId = decodeURIComponent(modeCancelMatch[1])
    const expectedVersion = Number(body?.expectedVersion || body?.expected_version || 1)
    const reason = String(body?.reason || '')
    return modeService.cancel(sessionId, expectedVersion, reason)
  }

  const modeReadyMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/ready$/)
  if (modeReadyMatch && method === 'POST') {
    const sessionId = decodeURIComponent(modeReadyMatch[1])
    const expectedVersion = Number(body?.expectedVersion || body?.expected_version || 1)
    return modeService.ready(sessionId, expectedVersion)
  }

  const modeStartMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/start$/)
  if (modeStartMatch && method === 'POST') {
    const sessionId = decodeURIComponent(modeStartMatch[1])
    const expectedVersion = Number(body?.expectedVersion || body?.expected_version || 1)
    return modeService.startRunning(sessionId, expectedVersion)
  }

  const modeWaitUserMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/wait-user$/)
  if (modeWaitUserMatch && method === 'POST') {
    const sessionId = decodeURIComponent(modeWaitUserMatch[1])
    const expectedVersion = Number(body?.expectedVersion || body?.expected_version || 1)
    const prompt = String(body?.prompt || '')
    const options = Array.isArray(body?.options) ? body.options : []
    return modeService.waitForUser(sessionId, expectedVersion, prompt, options)
  }

  const modeCompleteMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/complete$/)
  if (modeCompleteMatch && method === 'POST') {
    const sessionId = decodeURIComponent(modeCompleteMatch[1])
    const expectedVersion = Number(body?.expectedVersion || body?.expected_version || 1)
    const summary = body?.summary || null
    return modeService.complete(sessionId, expectedVersion, summary)
  }

  const modeFailMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/fail$/)
  if (modeFailMatch && method === 'POST') {
    const sessionId = decodeURIComponent(modeFailMatch[1])
    const expectedVersion = Number(body?.expectedVersion || body?.expected_version || 1)
    const errorCode = String(body?.errorCode || body?.error_code || 'UNKNOWN')
    const errorMessage = String(body?.errorMessage || body?.error_message || 'Unknown error')
    return modeService.fail(sessionId, expectedVersion, errorCode, errorMessage)
  }

  const modeBlockMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/block$/)
  if (modeBlockMatch && method === 'POST') {
    const sessionId = decodeURIComponent(modeBlockMatch[1])
    const expectedVersion = Number(body?.expectedVersion || body?.expected_version || 1)
    const reason = String(body?.reason || '')
    const requiredAction = String(body?.requiredAction || body?.required_action || '')
    return modeService.block(sessionId, expectedVersion, reason, requiredAction)
  }

  const modePhaseMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/phase$/)
  if (modePhaseMatch && method === 'POST') {
    const sessionId = decodeURIComponent(modePhaseMatch[1])
    const expectedVersion = Number(body?.expectedVersion || body?.expected_version || 1)
    const phase = String(body?.phase || '')
    const activeFlowId = body?.activeFlowId || body?.active_flow_id || null
    const activeRunId = body?.activeRunId || body?.active_run_id || null
    return modeService.transitionPhase(sessionId, phase, expectedVersion, activeFlowId, activeRunId)
  }

  const modeCheckpointsMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/checkpoints$/)
  if (modeCheckpointsMatch && method === 'POST') {
    const sessionId = decodeURIComponent(modeCheckpointsMatch[1])
    const stateRef = String(body?.stateRef || body?.state_ref || '')
    const label = String(body?.label || '')
    const metadata = body?.metadata || {}
    return modeService.createCheckpoint(sessionId, stateRef, label, metadata)
  }

  const modeEventsMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/events/)
  if (modeEventsMatch && method === 'GET') {
    const sessionId = decodeURIComponent(modeEventsMatch[1])
    const url = new URL(reqPath, 'http://localhost')
    const since = Number(url.searchParams.get('since')) || 0
    const limit = Number(url.searchParams.get('limit')) || 100
    return modeService.getEvents(sessionId, since, limit)
  }

  const modeFlowRunsMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/flow-runs$/)
  if (modeFlowRunsMatch && method === 'POST') {
    const sessionId = decodeURIComponent(modeFlowRunsMatch[1])
    return modeService.requestFlowRun(sessionId, {
      workflowId: body?.workflowId || body?.workflow_id,
      workflowVersion: Number(body?.workflowVersion || body?.workflow_version || 1),
      phase: String(body?.phase || ''),
      inputRefs: Array.isArray(body?.inputRefs) ? body.inputRefs : [],
      permissionEnvelope: body?.permissionEnvelope || {},
      budgetSnapshot: body?.budgetSnapshot || {},
      projectId: body?.projectId || body?.project_id || null
    })
  }

  const modeFlowRunCompleteMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/flow-runs\/([^/?]+)\/complete$/)
  if (modeFlowRunCompleteMatch && method === 'POST') {
    const sessionId = decodeURIComponent(modeFlowRunCompleteMatch[1])
    const runId = decodeURIComponent(modeFlowRunCompleteMatch[2])
    return modeService.completeFlowRun(
      sessionId, runId,
      body?.status || 'completed',
      Array.isArray(body?.outputRefs) ? body.outputRefs : [],
      Array.isArray(body?.evidenceRefs) ? body.evidenceRefs : [],
      Array.isArray(body?.proposalRefs) ? body.proposalRefs : [],
      Number(body?.tokenUsage || body?.token_usage || 0),
      body?.error || null
    )
  }

  const modeBindingMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/binding$/)
  if (modeBindingMatch && method === 'GET') {
    const sessionId = decodeURIComponent(modeBindingMatch[1])
    return modeService.getSessionBinding(sessionId) || { error: 'Binding not found' }
  }

  const modeBindingWorkflowMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/binding\/workflow$/)
  if (modeBindingWorkflowMatch && method === 'PUT') {
    const sessionId = decodeURIComponent(modeBindingWorkflowMatch[1])
    const expectedBindingVersion = Number(body?.expectedBindingVersion || body?.expected_binding_version || 1)
    const workflowSnapshot = body?.workflowSnapshot || body?.workflow_snapshot || null
    if (!workflowSnapshot) return { ok: false, error: 'workflowSnapshot required' }
    return modeService.updateBindingWorkflow(sessionId, workflowSnapshot, expectedBindingVersion)
  }

  const modeCompatMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/check-compatibility$/)
  if (modeCompatMatch && method === 'POST') {
    const sessionId = decodeURIComponent(modeCompatMatch[1])
    const workflowId = String(body?.workflowId || body?.workflow_id || '')
    if (!workflowId) return { ok: false, error: 'workflowId required' }
    const session = modeService.getSession(sessionId)
    if (!session) return { ok: false, error: 'Session not found' }
    try {
      const resolveResult = resolveWorkflow({
        workflow_id: workflowId,
        workspace_id: session.projectId || session.workspaceId,
        session_id: session.conversationId
      })
      if (!resolveResult?.ok || !resolveResult.workflow) {
        return { ok: false, error: resolveResult?.error || 'Workflow not found', code: resolveResult?.code }
      }
      const compat = modeService.checkWorkflowCompatibility(sessionId, resolveResult.workflow, resolveResult.agents || [])
      return {
        ok: true,
        workflow: { id: resolveResult.workflow.id, name: resolveResult.workflow.name, version: resolveResult.binding?.version },
        source: resolveResult.binding?.source,
        compatibility: compat
      }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  }

  const modeTransitionMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/transition$/)
  if (modeTransitionMatch && method === 'POST') {
    const fromSessionId = decodeURIComponent(modeTransitionMatch[1])
    const toMode = String(body?.toMode || body?.to_mode || '')
    const mapping = body?.mapping || {}
    if (!toMode || !['direct', 'plan', 'goal', 'living_work'].includes(toMode)) {
      return { ok: false, error: 'Valid toMode required (direct|plan|goal|living_work)' }
    }
    return modeService.createTransition(fromSessionId, toMode, mapping)
  }

  const modeEffectiveResourcesMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/effective-resources$/)
  if (modeEffectiveResourcesMatch && method === 'GET') {
    const sessionId = decodeURIComponent(modeEffectiveResourcesMatch[1])
    return modeService.getEffectiveNodeResources(sessionId)
  }

  // ---- Plan API ----
  const planCreateMatch = reqPath.match(/^\/api\/karna\/plans$/)
  if (planCreateMatch && method === 'POST') {
    const modeSessionId = String(body?.modeSessionId || body?.mode_session_id || '')
    const objective = String(body?.objective || '')
    const context = String(body?.context || '')
    if (!modeSessionId) return { ok: false, error: 'modeSessionId required' }
    return planService.createPlan(modeSessionId, { objective, context })
  }

  const planGetMatch = reqPath.match(/^\/api\/karna\/plans\/([^/?]+)$/)
  if (planGetMatch && method === 'GET') {
    const modeSessionId = decodeURIComponent(planGetMatch[1])
    return planService.getPlanSnapshot(modeSessionId) || { error: 'Plan not found' }
  }

  const planUpdateMatch = reqPath.match(/^\/api\/karna\/plans\/([^/?]+)$/)
  if (planUpdateMatch && method === 'PUT') {
    const modeSessionId = decodeURIComponent(planUpdateMatch[1])
    const expectedVersion = Number(body?.expectedVersion || body?.expected_version || 1)
    return planService.updatePlan(modeSessionId, body || {}, expectedVersion, 'user', body?.message || 'Update')
  }

  const planEvidenceMatch = reqPath.match(/^\/api\/karna\/plans\/([^/?]+)\/evidence$/)
  if (planEvidenceMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(planEvidenceMatch[1])
    return planService.addEvidence(modeSessionId, body || {})
  }

  const planFactsMatch = reqPath.match(/^\/api\/karna\/plans\/([^/?]+)\/facts$/)
  if (planFactsMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(planFactsMatch[1])
    return planService.addFact(modeSessionId, String(body?.fact || ''), Array.isArray(body?.evidenceRefs) ? body.evidenceRefs : [])
  }

  const planInvestigateMatch = reqPath.match(/^\/api\/karna\/plans\/([^/?]+)\/investigate$/)
  if (planInvestigateMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(planInvestigateMatch[1])
    return planService.startInvestigation(modeSessionId)
  }

  const planStructureMatch = reqPath.match(/^\/api\/karna\/plans\/([^/?]+)\/structure$/)
  if (planStructureMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(planStructureMatch[1])
    return planService.startStructuring(modeSessionId)
  }

  const planValidateMatch = reqPath.match(/^\/api\/karna\/plans\/([^/?]+)\/validate$/)
  if (planValidateMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(planValidateMatch[1])
    return planService.startValidating(modeSessionId)
  }

  const planReadyMatch = reqPath.match(/^\/api\/karna\/plans\/([^/?]+)\/ready$/)
  if (planReadyMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(planReadyMatch[1])
    return planService.markReadyForReview(modeSessionId)
  }

  const planReviseMatch = reqPath.match(/^\/api\/karna\/plans\/([^/?]+)\/revise$/)
  if (planReviseMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(planReviseMatch[1])
    return planService.revise(modeSessionId, body?.feedback || '')
  }

  const planConvertMatch = reqPath.match(/^\/api\/karna\/plans\/([^/?]+)\/convert$/)
  if (planConvertMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(planConvertMatch[1])
    const toMode = String(body?.toMode || body?.to_mode || 'goal')
    const mapping = body?.mapping || {}
    if (!['goal', 'living_work', 'flow_studio'].includes(toMode)) {
      return { ok: false, error: 'toMode must be goal, living_work, or flow_studio' }
    }
    if (toMode === 'flow_studio') {
      return { ok: true, action: 'open_flow_studio', modeSessionId }
    }
    return planService.convert(modeSessionId, toMode, mapping)
  }

  // ---- Goal API ----
  const goalContractMatch = reqPath.match(/^\/api\/karna\/goals$/)
  if (goalContractMatch && method === 'POST') {
    const modeSessionId = String(body?.modeSessionId || body?.mode_session_id || '')
    if (!modeSessionId) return { ok: false, error: 'modeSessionId required' }
    return goalService.createContract(modeSessionId, body || {})
  }

  const goalGetMatch = reqPath.match(/^\/api\/karna\/goals\/([^/?]+)$/)
  if (goalGetMatch && method === 'GET') {
    const modeSessionId = decodeURIComponent(goalGetMatch[1])
    return goalService.getGoalSnapshot(modeSessionId) || { error: 'Goal not found' }
  }

  const goalStartMatch = reqPath.match(/^\/api\/karna\/goals\/([^/?]+)\/start$/)
  if (goalStartMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(goalStartMatch[1])
    return goalService.start(modeSessionId)
  }

  const goalActionMatch = reqPath.match(/^\/api\/karna\/goals\/([^/?]+)\/actions$/)
  if (goalActionMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(goalActionMatch[1])
    const alignment = goalService.performAlignmentCheck(modeSessionId, body || {})
    if (!alignment.passed) {
      return { ok: false, error: 'Alignment check failed', alignment }
    }
    return goalService.recordAction(modeSessionId, body || {})
  }

  const goalActionCompleteMatch = reqPath.match(/^\/api\/karna\/goals\/([^/?]+)\/actions\/([^/?]+)\/complete$/)
  if (goalActionCompleteMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(goalActionCompleteMatch[1])
    const actionId = decodeURIComponent(goalActionCompleteMatch[2])
    return goalService.completeAction(modeSessionId, actionId, body || {})
  }

  const goalEvidenceMatch = reqPath.match(/^\/api\/karna\/goals\/([^/?]+)\/evidence$/)
  if (goalEvidenceMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(goalEvidenceMatch[1])
    const criterionId = String(body?.criterionId || body?.criterion_id || '')
    return goalService.addEvidence(modeSessionId, criterionId, body || {})
  }

  const goalVerifyMatch = reqPath.match(/^\/api\/karna\/goals\/([^/?]+)\/criteria\/([^/?]+)\/verify$/)
  if (goalVerifyMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(goalVerifyMatch[1])
    const criterionId = decodeURIComponent(goalVerifyMatch[2])
    return goalService.verifyCriterion(modeSessionId, criterionId, body || {}, body?.verifier || 'agent_judge')
  }

  const goalCompletionMatch = reqPath.match(/^\/api\/karna\/goals\/([^/?]+)\/completion-status$/)
  if (goalCompletionMatch && method === 'GET') {
    const modeSessionId = decodeURIComponent(goalCompletionMatch[1])
    const status = goalService.evaluateGoalCompletion(modeSessionId)
    if (status.shouldBlock) {
      const session = modeService.getSession(modeSessionId)
      if (session && session.status !== 'blocked' && session.status !== 'waiting_user' && session.status !== 'completed') {
        modeService.block(modeSessionId, session.stateVersion, status.reason)
      }
    } else if (status.shouldWait) {
      const session = modeService.getSession(modeSessionId)
      if (session && session.status !== 'waiting_user' && session.status !== 'blocked' && session.status !== 'completed') {
        modeService.waitForUser(modeSessionId, session.stateVersion, status.reason, ['Provide input', 'Unblock', 'Cancel'])
      }
    } else if (status.completed) {
      const session = modeService.getSession(modeSessionId)
      if (session && session.status !== 'completed') {
        modeService.complete(modeSessionId, session.stateVersion, status.reason)
      }
    }
    return status
  }

  const goalReplanMatch = reqPath.match(/^\/api\/karna\/goals\/([^/?]+)\/replan$/)
  if (goalReplanMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(goalReplanMatch[1])
    return goalService.replan(modeSessionId, String(body?.reason || 'Replan requested'))
  }

  const goalCheckpointMatch = reqPath.match(/^\/api\/karna\/goals\/([^/?]+)\/checkpoint$/)
  if (goalCheckpointMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(goalCheckpointMatch[1])
    return goalService.checkpoint(modeSessionId, String(body?.label || 'Goal checkpoint'))
  }

  const goalAlignmentMatch = reqPath.match(/^\/api\/karna\/goals\/([^/?]+)\/alignment-check$/)
  if (goalAlignmentMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(goalAlignmentMatch[1])
    return goalService.performAlignmentCheck(modeSessionId, body || {})
  }

  // ---- Creative / Living Work API ----
  const creativeContractMatch = reqPath.match(/^\/api\/karna\/creative\/contracts$/)
  if (creativeContractMatch && method === 'POST') {
    const modeSessionId = String(body?.modeSessionId || body?.mode_session_id || '')
    if (!modeSessionId) return { ok: false, error: 'modeSessionId required' }
    return creativeService.createContract(modeSessionId, body || {})
  }

  const creativeGetMatch = reqPath.match(/^\/api\/karna\/creative\/([^/?]+)$/)
  if (creativeGetMatch && method === 'GET') {
    const modeSessionId = decodeURIComponent(creativeGetMatch[1])
    return creativeService.getCreativeSnapshot(modeSessionId) || { error: 'Creative session not found' }
  }

  const creativeConfirmMatch = reqPath.match(/^\/api\/karna\/creative\/([^/?]+)\/confirm$/)
  if (creativeConfirmMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(creativeConfirmMatch[1])
    return creativeService.confirmContract(modeSessionId, Number(body?.version || 1))
  }

  const creativeBlackboardMatch = reqPath.match(/^\/api\/karna\/creative\/([^/?]+)\/blackboard$/)
  if (creativeBlackboardMatch && method === 'GET') {
    const modeSessionId = decodeURIComponent(creativeBlackboardMatch[1])
    return creativeService.getBlackboard(modeSessionId) || { error: 'Blackboard not found' }
  }

  const creativeEventsMatch = reqPath.match(/^\/api\/karna\/creative\/([^/?]+)\/events$/)
  if (creativeEventsMatch && method === 'GET') {
    const modeSessionId = decodeURIComponent(creativeEventsMatch[1])
    const url = new URL(reqPath, 'http://localhost')
    const since = Number(url.searchParams.get('since')) || 0
    const limit = Number(url.searchParams.get('limit')) || 100
    return creativeService.getEvents(modeSessionId, since, limit)
  }

  const creativeOpportunitiesMatch = reqPath.match(/^\/api\/karna\/creative\/([^/?]+)\/opportunities$/)
  if (creativeOpportunitiesMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(creativeOpportunitiesMatch[1])
    return creativeService.recordOpportunities(
      modeSessionId,
      body?.opportunities || [],
      body?.tensions || [],
      body?.gaps || []
    )
  }

  const creativeCandidatesMatch = reqPath.match(/^\/api\/karna\/creative\/([^/?]+)\/candidates$/)
  if (creativeCandidatesMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(creativeCandidatesMatch[1])
    return creativeService.generateCandidates(modeSessionId, Array.isArray(body?.candidates) ? body.candidates : [])
  }

  const creativeImpactMatch = reqPath.match(/^\/api\/karna\/creative\/([^/?]+)\/candidates\/([^/?]+)\/impact$/)
  if (creativeImpactMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(creativeImpactMatch[1])
    const candidateId = decodeURIComponent(creativeImpactMatch[2])
    return creativeService.performImpactAnalysis(modeSessionId, candidateId, body || {})
  }

  const creativeSelectMatch = reqPath.match(/^\/api\/karna\/creative\/([^/?]+)\/candidates\/([^/?]+)\/select$/)
  if (creativeSelectMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(creativeSelectMatch[1])
    const candidateId = decodeURIComponent(creativeSelectMatch[2])
    return creativeService.selectCandidate(modeSessionId, candidateId, body?.authorChoice !== false)
  }

  const creativeRejectMatch = reqPath.match(/^\/api\/karna\/creative\/([^/?]+)\/candidates\/([^/?]+)\/reject$/)
  if (creativeRejectMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(creativeRejectMatch[1])
    const candidateId = decodeURIComponent(creativeRejectMatch[2])
    return creativeService.rejectCandidate(modeSessionId, candidateId, String(body?.reason || 'Author rejected'))
  }

  const creativeExecuteCompleteMatch = reqPath.match(/^\/api\/karna\/creative\/([^/?]+)\/execute-complete$/)
  if (creativeExecuteCompleteMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(creativeExecuteCompleteMatch[1])
    return creativeService.completeCandidateExecution(
      modeSessionId,
      Array.isArray(body?.artifactRefs) ? body.artifactRefs : [],
      Array.isArray(body?.diffRefs) ? body.diffRefs : []
    )
  }

  const creativeProposalMatch = reqPath.match(/^\/api\/karna\/creative\/([^/?]+)\/proposals$/)
  if (creativeProposalMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(creativeProposalMatch[1])
    return creativeService.createWritebackProposal(
      modeSessionId,
      String(body?.targetType || 'narrative_state'),
      body?.changes || {},
      body?.candidateId || null
    )
  }

  const creativeProposalDecideMatch = reqPath.match(/^\/api\/karna\/creative\/([^/?]+)\/proposals\/([^/?]+)\/decide$/)
  if (creativeProposalDecideMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(creativeProposalDecideMatch[1])
    const proposalId = decodeURIComponent(creativeProposalDecideMatch[2])
    return creativeService.approveProposal(modeSessionId, proposalId, String(body?.decision || 'reject'))
  }

  const creativeHandoffMatch = reqPath.match(/^\/api\/karna\/creative\/([^/?]+)\/handoff$/)
  if (creativeHandoffMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(creativeHandoffMatch[1])
    return creativeService.handoffToAuthor(
      modeSessionId,
      String(body?.reason || 'Author decision required'),
      Array.isArray(body?.candidates) ? body.candidates : []
    )
  }

  const creativeCheckpointMatch = reqPath.match(/^\/api\/karna\/creative\/([^/?]+)\/checkpoint$/)
  if (creativeCheckpointMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(creativeCheckpointMatch[1])
    return creativeService.createCheckpoint(modeSessionId, String(body?.label || 'Creative checkpoint'))
  }

  const creativeRebuildMatch = reqPath.match(/^\/api\/karna\/creative\/([^/?]+)\/rebuild-blackboard$/)
  if (creativeRebuildMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(creativeRebuildMatch[1])
    return { ok: true, blackboard: creativeService.rebuildBlackboard(modeSessionId) }
  }

  // ---- Mode Runtime / Resource Bridge API ----
  const modeAttachMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/runtime\/attach$/)
  if (modeAttachMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(modeAttachMatch[1])
    const binding = modeResourceBridge.attachRuntime({ modeSessionId, bindingSnapshot: body?.binding })
    return { ok: Boolean(binding), binding }
  }
  const modeDetachMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/runtime\/detach$/)
  if (modeDetachMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(modeDetachMatch[1])
    modeResourceBridge.detachRuntime(modeSessionId)
    return { ok: true }
  }
  const modeContextMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/runtime\/context$/)
  if (modeContextMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(modeContextMatch[1])
    const ctx = await modeResourceBridge.buildModeContextPackage({
      modeSessionId,
      query: String(body?.query || ''),
      project: body?.project || null,
      services: getWriterOs()
    })
    return { ok: true, context: ctx, formattedText: modeResourceBridge.formatModeContextForPrompt(ctx) }
  }
  const modeWritebackMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/runtime\/writeback-check$/)
  if (modeWritebackMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(modeWritebackMatch[1])
    const decision = modeResourceBridge.resolveWritebackPermission(modeSessionId, body?.targetType, body?.changes)
    return { ok: true, ...decision }
  }
  const modeRuntimeResourcesMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/runtime\/effective-resources$/)
  if (modeRuntimeResourcesMatch && method === 'GET') {
    const modeSessionId = decodeURIComponent(modeRuntimeResourcesMatch[1])
    const binding = modeResourceBridge.getRuntimeBinding(modeSessionId)
    if (!binding) return { ok: false, error: 'No runtime binding attached', skills: [], souls: [], tools: [], documents: [], knowledgeSources: [] }
    return {
      ok: true,
      modeSessionId,
      bindingId: binding.id,
      version: binding.version,
      skills: (binding.skills || []).map(s => ({ id: s.skillId || s.id, ref: s.skillRef, weight: s.weight || 1 })),
      souls: (binding.souls || []).map(s => ({ id: s.soulId || s.id, ref: s.soulRef, weight: s.weight || 1 })),
      tools: (binding.tools || []).map(t => ({ id: t.toolId || t.id || t.name, scope: t.scope })),
      documents: (binding.documents || []).map(d => ({ id: d.documentId || d.id, label: d.label, path: d.path })),
      knowledgeSources: (binding.knowledgeSources || []).map(k => ({ id: k.sourceId || k.id, type: k.type })),
      permissionPolicy: binding.permissionPolicy || null,
      modelPolicy: binding.modelPolicy || null
    }
  }
  const modeIngestDocMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/bindings\/documents$/)
  if (modeIngestDocMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(modeIngestDocMatch[1])
    const binding = modeService.getBinding(modeSessionId)
    if (!binding) return { ok: false, error: 'Binding not found' }
    const doc = {
      documentId: body?.documentId || body?.id || `doc_${Date.now()}`,
      label: body?.label || body?.name || 'Document',
      path: body?.path || null,
      uri: body?.uri || null,
      content: body?.content || null,
      maxExcerpts: body?.maxExcerpts || 5,
      addedAt: new Date().toISOString()
    }
    binding.documents = Array.isArray(binding.documents) ? binding.documents.filter(d => d.documentId !== doc.documentId) : []
    binding.documents.push(doc)
    binding.updatedAt = new Date().toISOString()
    binding.version = (binding.version || 1) + 1
    modeService.updateBinding(modeSessionId, binding, binding.version - 1)
    return { ok: true, document: doc, bindingVersion: binding.version }
  }
  const modeIngestSourceMatch = reqPath.match(/^\/api\/karna\/modes\/([^/?]+)\/bindings\/knowledge-sources$/)
  if (modeIngestSourceMatch && method === 'POST') {
    const modeSessionId = decodeURIComponent(modeIngestSourceMatch[1])
    const binding = modeService.getBinding(modeSessionId)
    if (!binding) return { ok: false, error: 'Binding not found' }
    const src = {
      sourceId: body?.sourceId || body?.id || `src_${Date.now()}`,
      type: body?.type || 'vector_collection',
      label: body?.label || body?.name || 'Source',
      config: body?.config || {},
      topK: body?.topK || 5,
      minScore: body?.minScore || 0.7,
      content: body?.content || null,
      addedAt: new Date().toISOString()
    }
    binding.knowledgeSources = Array.isArray(binding.knowledgeSources) ? binding.knowledgeSources.filter(s => s.sourceId !== src.sourceId) : []
    binding.knowledgeSources.push(src)
    binding.updatedAt = new Date().toISOString()
    binding.version = (binding.version || 1) + 1
    modeService.updateBinding(modeSessionId, binding, binding.version - 1)
    return { ok: true, source: src, bindingVersion: binding.version }
  }

  const profileMatch = reqPath.match(/^\/api\/profiles\/([^/?]+)$/)
  if (profileMatch) {
    const profileName = decodeURIComponent(profileMatch[1])
    if (method === 'PUT') {
      const nextName = String(body?.new_name || body?.name || profileName).trim() || profileName
      const prev = profiles.get(profileName) || { name: profileName, label: profileName, is_default: profileName === 'default' }
      profiles.delete(profileName)
      profiles.set(nextName, { ...prev, name: nextName, label: nextName, is_default: nextName === 'default' })
      soulPrompts.renameProfileSoul(profileName, nextName)
      return { ok: true, name: nextName, path: `profiles/${nextName}` }
    }
    if (method === 'DELETE') {
      if (profileName !== 'default') {
        profiles.delete(profileName)
        soulPrompts.deleteProfileSoul(profileName)
      }
      return { ok: true, path: `profiles/${profileName}` }
    }
  }

  // ---- TTS API ----
  if (reqPath === '/api/tts/speak' && method === 'POST') {
    const text = String(body?.text || '').trim()
    const voice = String(body?.voice || karnaConfig.tts?.edge?.voice || 'zh-CN-XiaoxiaoNeural')
    const provider = karnaConfig.tts?.provider || 'edge'
    if (!text) {
      return { ok: false, error: 'Text is required.' }
    }
    if (provider === 'edge') {
      try {
        require.resolve('edge-tts')
        return { ok: false, error: 'TTS provider edge-tts is available but disabled in demo mode. Use browser speech instead.', fallback: 'browser' }
      } catch {
        return { ok: false, error: 'TTS provider not available. Configure tts.provider in settings or use browser speech.', fallback: 'browser' }
      }
    }
    return { ok: false, error: 'TTS provider not available. Configure tts.provider in settings or use browser speech.', fallback: 'browser' }
  }

  // ---- Image Generation API ----
  if (reqPath === '/api/image/generate' && method === 'POST') {
    const prompt = String(body?.prompt || '').trim()
    const size = String(body?.size || '1024x1024')
    const provider = karnaConfig.image?.provider || ''
    if (!prompt) {
      return { ok: false, error: 'Prompt is required.' }
    }
    const hasOpenAIKey = !!getEnvValue('OPENAI_API_KEY').trim()
    if (!provider && !hasOpenAIKey && !findUsableImageModel()) {
      return { ok: false, error: 'Image provider not configured. Set image.apiKey in settings.', hint: 'Configure an image provider (DALL-E, etc.) in model settings to enable image generation.' }
    }
    return { ok: false, error: 'Image generation configured but disabled in demo mode.' }
  }

  // ---- Analytics (mock) ----
  if (reqPath === '/api/analytics/usage' || reqPath.startsWith('/api/analytics/usage?')) {
    const daysMatch = reqPath.match(/[?&]days=(\d+)/)
    const period = daysMatch ? Math.max(1, Number(daysMatch[1]) || 30) : 30
    return notConfigured('analytics', 'Analytics storage is not configured.', {
      period_days: period,
      daily: [],
      by_model: [],
      skills: {
        summary: {
          distinct_skills_used: 0,
          total_skill_actions: 0,
          total_skill_edits: 0,
          total_skill_loads: 0
        },
        top_skills: []
      },
      totals: {
        total_actual_cost: 0,
        total_api_calls: 0,
        total_cache_read: 0,
        total_estimated_cost: 0,
        total_input: 0,
        total_output: 0,
        total_reasoning: 0,
        total_sessions: sessions.size
      }
    })
  }

  if (reqPath === '/api/analytics' || reqPath.startsWith('/api/analytics')) {
    return { ok: true, source: 'karna-local', product_metrics: analytics.getProductMetrics(), stats: analytics.getStats() }
  }

  // ---- Action (mock) ----
  if (reqPath === '/api/gateway/restart') return notConfigured('action', 'Gateway restart is not wired to a supervised process yet.', { name: 'restart', pid: karnaProcess?.pid || null })
  if (reqPath === '/api/karna/update') return notConfigured('updates', 'Self-update is not configured for this desktop build.', { name: 'update' })
  if (reqPath === '/api/karna/update/check' || reqPath.startsWith('/api/karna/update/check?')) {
    return {
      install_method: 'dev',
      current_version: '0.1.0',
      behind: 0,
      update_available: false,
      can_apply: false,
      update_command: null,
      message: null,
      commits: []
    }
  }
  const actionStatusMatch = reqPath.match(/^\/api\/actions\/([^/?]+)\/status/)
  if (actionStatusMatch) {
    const name = decodeURIComponent(actionStatusMatch[1])
    return { ok: false, capability: 'action', name, pid: null, running: false, exit_code: null, lines: [`Action status is not configured for ${name}.`] }
  }
  if (reqPath === '/api/action' || reqPath.startsWith('/api/action')) return notConfigured('action', 'Action runner is not configured.', { status: 'not_configured' })

  // ---- Audio (mock) ----
  if (reqPath === '/api/audio/transcribe') return notConfigured('audio', 'ASR model is not configured.', { text: '' })
  if (reqPath === '/api/audio/speak') return notConfigured('audio', 'TTS model is not configured.', { url: '' })

  // ---- Updates (mock) ----
  if (reqPath === '/api/updates/check') return { update_available: false, version: '0.1.0' }

  // ---- Proxy to Karna backend for /health ----
  if (reqPath === '/health' || reqPath === '/') {
    try {
      const result = await karnaBackendFetch(reqPath, { method, body, timeoutMs })
      return result.data
    } catch {
      return { status: 'mock' }
    }
  }

  // ---- Default: explicit unsupported response instead of a fake empty object ----
  rememberLog(`Unhandled API path: ${method} ${reqPath}`)
  return notConfigured('unsupported', `Unsupported Karna desktop API path: ${method} ${reqPath}`)
}

/**
 * IPC/REST observability boundary.  Every adapter call receives a correlation
 * id and emits a structured start/completion (or failure) record without
 * changing the response contract consumed by the renderer.
 */
async function handleKarnaApiRequest(request) {
  const requestId = crypto.randomUUID()
  const startedAt = Date.now()
  const requestPath = String(request?.path || '/')
  const module = requestPath.split('?')[0].split('/').filter(Boolean)[1] || 'root'
  const method = String(request?.method || 'GET').toUpperCase()
  logRequest(requestId, module, `${method} ${requestPath}`)

  try {
    const result = await handleKarnaApiRequestImpl(request)
    logTiming(requestId, Date.now() - startedAt)
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logRequest(requestId, module, `${method} ${requestPath} failed: ${message}`, 'error')
    logTiming(requestId, Date.now() - startedAt)
    throw error
  }
}

// ---------------------------------------------------------------------------
// API Routes Registration (incremental refactor)
// ---------------------------------------------------------------------------

function createExpressStyleApp() {
  const routes = []
  const methods = ['get', 'post', 'put', 'delete', 'patch', 'all']
  const app = {}
  for (const m of methods) {
    app[m] = function (routePath, handler) {
      routes.push({ method: m.toUpperCase(), path: routePath, handler })
    }
  }
  app.getRoutes = () => [...routes]
  return app
}

const apiApp = createExpressStyleApp()

async function resolveWriterProjectRequest(req) {
  const url = new URL(req.url, 'http://localhost')
  const workspaceId = url.searchParams.get('workspace_id')
  if (!workspaceId) {
    return { ok: false, error: 'workspace_id is required' }
  }

  try {
    const rawProject = findWriterProject(workspaceId)

    if (!rawProject) {
      return { ok: false, error: 'Project not found', code: 'PROJECT_NOT_FOUND' }
    }

    const project = enrichWriterProject(rawProject)

    return {
      ok: true,
      project: {
        id: project.id,
        name: project.title || 'Untitled',
        workspaceId: project.workspace_id || project.id || workspaceId,
        rootPath: project.folder || '',
        primarySessionId: project.main_session_id || null,
        permissionsRoot: project.permissions_root || project.folder || ''
      }
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function setWriterProjectMainSession(req) {
  try {
    let body = req.body
    if (typeof body === 'string') {
      body = JSON.parse(body)
    }
    const sessionId = body?.sessionId
    const shouldClear = body?.clear === true || sessionId === null || sessionId === ''

    const projectIdMatch = req.path.match(/\/api\/writer\/projects\/([^/]+)\/main-session/)
    const projectId = projectIdMatch ? projectIdMatch[1] : null
    if (!projectId) {
      return { ok: false, error: 'projectId is required' }
    }

    const patch = shouldClear
      ? { main_session_id: null, primarySessionId: null, primary_session_id: null }
      : { main_session_id: sessionId, primarySessionId: sessionId, primary_session_id: sessionId }

    if (!shouldClear && !sessionId) {
      return { ok: false, error: 'sessionId is required' }
    }

    const updateReq = {
      ...req,
      path: `/api/writer/projects/${projectId}`,
      method: 'PATCH',
      body: JSON.stringify(patch)
    }
    const result = await handleKarnaApiRequest(updateReq)
    return { ok: true, ...result }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

const apiDeps = {
  listSessions: async (req) => handleKarnaApiRequest(req),
  searchSessions: async (req) => handleKarnaApiRequest(req),
  listProfileSessions: async (req) => handleKarnaApiRequest(req),
  getSession: async (req) => handleKarnaApiRequest(req),
  updateSession: async (req) => handleKarnaApiRequest(req),
  deleteSession: async (req) => handleKarnaApiRequest(req),
  getSessionMessages: async (req) => handleKarnaApiRequest(req),
  getConfig: async (req) => handleKarnaApiRequest(req),
  updateConfig: async (req) => handleKarnaApiRequest(req),
  getConfigDefaults: async (req) => handleKarnaApiRequest(req),
  getConfigSchema: async (req) => handleKarnaApiRequest(req),
  getModelInfo: async (req) => handleKarnaApiRequest(req),
  getAuxiliaryModels: async (req) => handleKarnaApiRequest(req),
  getModelOptions: async (req) => handleKarnaApiRequest(req),
  setModel: async (req) => handleKarnaApiRequest(req),
  getCustomModels: async (req) => handleKarnaApiRequest(req),
  createCustomModel: async (req) => handleKarnaApiRequest(req),
  deleteCustomModel: async (req) => handleKarnaApiRequest(req),
  updateCustomModel: async (req) => handleKarnaApiRequest(req),
  testCustomModel: async (req) => handleKarnaApiRequest(req),
  testModelEndpoint: async (req) => handleKarnaApiRequest(req),
  getRecommendedDefaultModel: async (req) => handleKarnaApiRequest(req),
  listSkills: async (req) => handleKarnaApiRequest(req),
  getSkillsCatalog: async (req) => handleKarnaApiRequest(req),
  searchSkills: async (req) => handleKarnaApiRequest(req),
  createSkill: async (req) => handleKarnaApiRequest(req),
  preflightSkillImport: async (req) => handleKarnaApiRequest(req),
  commitSkillImport: async (req) => handleKarnaApiRequest(req),
  getSkillImportJob: async (req) => handleKarnaApiRequest(req),
  createSkillDirect: async (req) => handleKarnaApiRequest(req),
  getSkill: async (req) => handleKarnaApiRequest(req),
  toggleSkill: async (req) => handleKarnaApiRequest(req),
  installSkill: async (req) => handleKarnaApiRequest(req),
  uninstallSkill: async (req) => handleKarnaApiRequest(req),
  getConnectorDefinitions: async (req) => handleKarnaApiRequest(req),
  getConnectorAdvancedDefinitions: async (req) => handleKarnaApiRequest(req),
  listConnectorInstances: async (req) => handleKarnaApiRequest(req),
  createConnectorInstance: async (req) => handleKarnaApiRequest(req),
  testConnectorInstance: async (req) => handleKarnaApiRequest(req),
  updateConnectorInstance: async (req) => handleKarnaApiRequest(req),
  deleteConnectorInstance: async (req) => handleKarnaApiRequest(req),
  callConnectorTool: async (req) => handleKarnaApiRequest(req),
  toggleConnectorTool: async (req) => handleKarnaApiRequest(req),
  getConnectorAuditLogs: async (req) => handleKarnaApiRequest(req),
  healthCheckConnectors: async (req) => handleKarnaApiRequest(req),
  routeConnectorCandidates: async (req) => handleKarnaApiRequest(req),
  reloadMcpServers: async (req) => handleKarnaApiRequest(req),
  listMcpServers: async (req) => handleKarnaApiRequest(req),
  createMcpServer: async (req) => handleKarnaApiRequest(req),
  testMcpServer: async (req) => handleKarnaApiRequest(req),
  updateMcpServer: async (req) => handleKarnaApiRequest(req),
  deleteMcpServer: async (req) => handleKarnaApiRequest(req),
  getMcpServer: async (req) => handleKarnaApiRequest(req),
  getMcpServerTools: async (req) => handleKarnaApiRequest(req),
  callBuiltinMcpTool: async (req) => handleKarnaApiRequest(req),
  listToolsets: async (req) => handleKarnaApiRequest(req),
  getToolsetConfig: async (req) => handleKarnaApiRequest(req),
  setToolsetProvider: async (req) => handleKarnaApiRequest(req),
  toolsetPostSetup: async (req) => handleKarnaApiRequest(req),
  getToolset: async (req) => handleKarnaApiRequest(req),
  setToolsetEnabled: async (req) => handleKarnaApiRequest(req),
  listPlugins: async (req) => handleKarnaApiRequest(req),
  setPluginEnabled: async (req) => handleKarnaApiRequest(req),
  getArtifacts: async (req) => handleKarnaApiRequest(req),
  updateArtifacts: async (req) => handleKarnaApiRequest(req),
  getArtifact: async (req) => handleKarnaApiRequest(req),
  deleteArtifact: async (req) => handleKarnaApiRequest(req),
  getKnowledge: async (req) => handleKarnaApiRequest(req),
  updateKnowledge: async (req) => handleKarnaApiRequest(req),
  listKnowledgeLibraries: async (req) => handleKarnaApiRequest(req),
  createKnowledgeLibrary: async (req) => handleKarnaApiRequest(req),
  renameKnowledgeLibrary: async (req) => handleKarnaApiRequest(req),
  importKnowledgeFolder: async (req) => handleKarnaApiRequest(req),
  reindexKnowledge: async (req) => handleKarnaApiRequest(req),
  searchKnowledge: async (req) => handleKarnaApiRequest(req),
  getWriterResources: async (req) => handleKarnaApiRequest(req),
  parseWriterPlan: async (req) => handleKarnaApiRequest(req),
  enhancePrompt: async (req) => handleKarnaApiRequest(req),
  getWorkflowAgentLibrary: async (req) => handleKarnaApiRequest(req),
  createWorkflowAgent: async (req) => handleKarnaApiRequest(req),
  updateWorkflowAgent: async (req) => handleKarnaApiRequest(req),
  deleteWorkflowAgent: async (req) => handleKarnaApiRequest(req),
  listWorkflows: async (req) => handleKarnaApiRequest(req),
  saveWorkflow: async (req) => handleKarnaApiRequest(req),
  updateWorkflowRunNodeAction: async (req) => handleKarnaApiRequest(req),
  continueWorkflow: async (req) => handleKarnaApiRequest(req),
  getWorkflow: async (req) => handleKarnaApiRequest(req),
  updateWorkflow: async (req) => handleKarnaApiRequest(req),
  deleteWorkflow: async (req) => handleKarnaApiRequest(req),
  resolveWorkflow: async (req) => handleKarnaApiRequest(req),
  listSoulAuthors: async (req) => handleKarnaApiRequest(req),
  createSoulAuthor: async (req) => handleKarnaApiRequest(req),
  fusionSoulPreview: async (req) => handleKarnaApiRequest(req),
  getSoulAuthor: async (req) => handleKarnaApiRequest(req),
  deleteSoulAuthor: async (req) => handleKarnaApiRequest(req),
  importSoulTexts: async (req) => handleKarnaApiRequest(req),
  processSoulAuthor: async (req) => handleKarnaApiRequest(req),
  searchSoulAuthor: async (req) => handleKarnaApiRequest(req),
  webResearchSoulAuthor: async (req) => handleKarnaApiRequest(req),
  distillSoulProfile: async (req) => handleKarnaApiRequest(req),
  criticSoulText: async (req) => handleKarnaApiRequest(req),
  riskCheckSoulText: async (req) => handleKarnaApiRequest(req),
  exportSoulSkill: async (req) => handleKarnaApiRequest(req),
  exportSoulAuthor: async (req) => handleKarnaApiRequest(req),
  listWriterProjects: async (req) => handleKarnaApiRequest(req),
  resolveWriterProject: resolveWriterProjectRequest,
  setWriterProjectMainSession,
  createWriterProject: async (req) => handleKarnaApiRequest(req),
  updateProjectAgent: async (req) => handleKarnaApiRequest(req),
  generateProjectTasks: async (req) => handleKarnaApiRequest(req),
  getProjectTasks: async (req) => handleKarnaApiRequest(req),
  updateProjectTask: async (req) => handleKarnaApiRequest(req),
  createProjectSession: async (req) => handleKarnaApiRequest(req),
  openProjectFolder: async (req) => handleKarnaApiRequest(req),
  importProjectManuscript: async (req) => handleKarnaApiRequest(req),
  analyzeProject: async (req) => handleKarnaApiRequest(req),
  checkProjectConsistency: async (req) => handleKarnaApiRequest(req),
  rewritePreview: async (req) => handleKarnaApiRequest(req),
  getProjectBible: async (req) => handleKarnaApiRequest(req),
  listProjectSources: async (req) => handleKarnaApiRequest(req),
  getProjectFileTree: async (req) => handleKarnaApiRequest(req),
  getProjectVersions: async (req) => handleKarnaApiRequest(req),
  getWriterProject: async (req) => handleKarnaApiRequest(req),
  updateWriterProject: async (req) => handleKarnaApiRequest(req),
  deleteWriterProject: async (req) => handleKarnaApiRequest(req),
  setActiveWriterProject: async (req) => handleKarnaApiRequest(req),
  writerProjectStatus: async (req) => handleKarnaApiRequest(req),
  exportWriterProject: async (req) => handleKarnaApiRequest(req),
  saveWriterProjectFile: async (req) => handleKarnaApiRequest(req),
  handleWriterOsRequest: async (req) => handleKarnaApiRequest(req),
  getStatus: async (req) => handleKarnaApiRequest(req),
  getElevenlabsVoices: async (req) => handleKarnaApiRequest(req),
  getLogs: async (req) => handleKarnaApiRequest(req),
  getEnv: async (req) => handleKarnaApiRequest(req),
  setEnv: async (req) => handleKarnaApiRequest(req),
  deleteEnv: async (req) => handleKarnaApiRequest(req),
  revealEnv: async (req) => handleKarnaApiRequest(req),
  listOauthProviders: async (req) => handleKarnaApiRequest(req),
  handleOauthRequest: async (req) => handleKarnaApiRequest(req),
  validateProvider: async (req) => handleKarnaApiRequest(req),
  handleMemoryRequest: async (req) => handleKarnaApiRequest(req),
  handleMessagingRequest: async (req) => handleKarnaApiRequest(req),
  handleCronRequest: async (req) => handleKarnaApiRequest(req),
  listCronJobs: async (req) => handleKarnaApiRequest(req),
  listProfiles: async (req) => handleKarnaApiRequest(req),
  createProfile: async (req) => handleKarnaApiRequest(req),
  getActiveProfile: async (req) => handleKarnaApiRequest(req),
  getProfileSoul: async (req) => handleKarnaApiRequest(req),
  setProfileSoul: async (req) => handleKarnaApiRequest(req),
  getProfileSetupCommand: async (req) => handleKarnaApiRequest(req),
  renameProfile: async (req) => handleKarnaApiRequest(req),
  deleteProfile: async (req) => handleKarnaApiRequest(req),
  speakTts: async (req) => handleKarnaApiRequest(req),
  generateImage: async (req) => handleKarnaApiRequest(req),
  getAnalyticsUsage: async (req) => handleKarnaApiRequest(req),
  getAnalytics: async (req) => handleKarnaApiRequest(req),
  restartGateway: async (req) => handleKarnaApiRequest(req),
  checkForUpdate: async (req) => handleKarnaApiRequest(req),
  getActionStatus: async (req) => handleKarnaApiRequest(req),
  handleActionRequest: async (req) => handleKarnaApiRequest(req),
  transcribeAudio: async (req) => handleKarnaApiRequest(req),
  createIngestJob: async (req) => handleKarnaApiRequest(req),
  getIngestJob: async (req) => handleKarnaApiRequest(req),
  getIngestResult: async (req) => handleKarnaApiRequest(req),
  cancelIngestJob: async (req) => handleKarnaApiRequest(req),
  getIngestCapabilities: async (req) => handleKarnaApiRequest(req),
  materializeIngestResult: async (req) => handleKarnaApiRequest(req),
  getUpdatesCheck: async (req) => handleKarnaApiRequest(req),
  healthCheck: async (req) => handleKarnaApiRequest(req),
  rootHealth: async (req) => handleKarnaApiRequest(req)
}

registerApiRoutes(apiApp, apiDeps)

const registeredApiRoutes = apiApp.getRoutes()

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start the Karna backend and WS bridge.
 * Returns a connection object compatible with the original startKarna() return.
 */
async function startKarnaAdapter(bootProgressCallback) {
  bootProgressCb = bootProgressCallback || null

  analytics.track('app_started')

  if (bootProgressCb) bootProgressCb('backend.resolve', 'Resolving Karna backend', 8)
  await startKarnaBackend()

  if (bootProgressCb) bootProgressCb('backend.ws', 'Starting WebSocket bridge', 50)
  await startWsBridge()

  if (bootProgressCb) bootProgressCb('backend.ready', 'Karna backend is ready', 94)

  try {
    migrateWorkflowV3IfNeeded()
  } catch (e) {
    rememberLog(`Workflow V3 migration call failed: ${e.message}`)
  }

  try {
    const repairReport = sessionLifecycleService.runIntegrityRepair()
    rememberLog(`session lifecycle integrity repair: ${JSON.stringify(repairReport)}`)
  } catch (e) {
    rememberLog(`session lifecycle integrity repair failed: ${e.message}`)
  }

  return {
    baseUrl: karnaBackendUrl,
    mode: 'local',
    source: 'karna-adapter',
    authMode: 'token',
    token: 'karna-desktop-adapter',
    wsUrl: wsBridgeUrl,
    logs: getRecentLogs()
  }
}

/**
 * Get the WS Bridge URL.
 */
function getKarnaWsBridgeUrl() {
  return wsBridgeUrl
}

/**
 * Check if the backend is ready.
 */
function isBackendReady() {
  return backendReady
}

/**
 * Stop the adapter (backend + WS bridge).
 */
function stopKarnaAdapter() {
  try {
    if (vectorDb) {
      vectorDb.saveAll()
      vectorDb.closeAll()
      vectorDb = null
      knowledgeVectorInitPromise = null
    }
  } catch {
  }
  if (wsBridgeServer) {
    wsBridgeServer.close()
    wsBridgeServer = null
  }
  if (karnaProcess) {
    try {
      karnaProcess.kill('SIGTERM')
    } catch {
      // ignore
    }
    karnaProcess = null
  }
}

function registerRemoteIpcHandlers(ipcMain, getRemoteGateway) {
  const getGateway = () => {
    const gateway = typeof getRemoteGateway === 'function' ? getRemoteGateway() : getRemoteGateway
    if (!gateway) throw new Error('Remote Gateway not initialized')
    return gateway
  }

  ipcMain.handle('remote:get-status', async () => {
    try {
      const gateway = getGateway()
      return { ok: true, status: gateway.getRemoteStatus() }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('remote:start', async (_event, options = {}) => {
    try {
      const gateway = getGateway()
      const result = await gateway.startRemoteServer({
        bindAddress: options.bindAddress || '0.0.0.0'
      })
      return { ok: true, ...result }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('remote:stop', async () => {
    try {
      const gateway = getGateway()
      await gateway.stopRemoteServer()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('remote:create-pairing', async (_event, deviceInfo = {}) => {
    try {
      const gateway = getGateway()
      const pairing = gateway.pairingService.startPairing(deviceInfo)
      const status = gateway.getRemoteStatus()
      const baseUrl = status.privateInterfaces?.[0]
        ? `https://${status.privateInterfaces[0].address}:${status.port || 8765}`
        : 'https://localhost:8765'
      const qrPayload = gateway.pairingService.generateQrPayload(baseUrl, pairing.token)
      return {
        ok: true,
        offer: {
          version: 1,
          token: pairing.token,
          sasCode: pairing.sasCode,
          serverPublicKey: pairing.serverPublicKey,
          serverFingerprint: pairing.serverFingerprint,
          expiresAt: pairing.expiresAt,
          tlsCertFingerprint: pairing.tlsCertFingerprint,
          qrPayload
        }
      }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('remote:confirm-pairing', async (_event, token, sasCode, deviceInfo = {}) => {
    try {
      const gateway = getGateway()
      const result = gateway.pairingService.confirmPairing(token, sasCode, deviceInfo)
      return { ok: result.success, ...result }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('remote:cancel-pairing', async (_event, token) => {
    try {
      const gateway = getGateway()
      gateway.pairingService.cancelPairing(token)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('remote:list-devices', async () => {
    try {
      const gateway = getGateway()
      const devices = gateway.deviceTrustStore.listDevices()
      return { ok: true, devices }
    } catch (err) {
      return { ok: false, error: err.message, devices: [] }
    }
  })

  ipcMain.handle('remote:update-device', async (_event, deviceId, updates = {}) => {
    try {
      const gateway = getGateway()
      const device = gateway.deviceTrustStore.updateDevice(deviceId, updates)
      return { ok: true, device }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('remote:revoke-device', async (_event, deviceId) => {
    try {
      const gateway = getGateway()
      gateway.deviceTrustStore.revokeDevice(deviceId)
      gateway.sessionManager.disconnectDevice(deviceId)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('remote:disconnect-all', async () => {
    try {
      const gateway = getGateway()
      gateway.sessionManager.disconnectAll()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  ipcMain.handle('remote:get-audit-logs', async (_event, options = {}) => {
    try {
      const gateway = getGateway()
      const logs = gateway.auditLogger.getRecentLogs(options.limit || 100)
      return { ok: true, logs }
    } catch (err) {
      return { ok: false, error: err.message, logs: [] }
    }
  })

  ipcMain.handle('remote:get-pairing-state', async (_event, token) => {
    try {
      const gateway = getGateway()
      const pairing = gateway.pairingService.getPairing(token)
      return { ok: true, pairing }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })
}

module.exports = {
  startKarnaAdapter,
  getKarnaWsBridgeUrl,
  handleKarnaApiRequest,
  setHermesApiBridge,
  isBackendReady,
  stopKarnaAdapter,
  getRecentLogs,
  karnaBackendUrl,
  registerRemoteIpcHandlers,
  sessionLifecycleService,
  _tokenOsTest: {
    contextBackendFetch,
    extractRequestedOutputTokens
  }
}
