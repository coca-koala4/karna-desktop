'use strict'

const fs = require('node:fs')
const path = require('node:path')

const MODEL_CONFIG_SCHEMA_VERSION = 1
const MIGRATION_MARKER_FILE = 'migration-completed.json'

function createModelConfigMigrator({ fs: fsImpl, path: pathImpl, userDataPath, oldDataRoot }) {
  const modelConfigPath = () => pathImpl.join(userDataPath, 'model-config.json')
  const migrationMarkerPath = () => pathImpl.join(userDataPath, MIGRATION_MARKER_FILE)
  const oldModelSelectionPath = () => pathImpl.join(oldDataRoot, 'model_selection.json')
  const oldEnvPath = () => {
    const dir = oldDataRoot
    return dir ? pathImpl.join(dir, '.env') : null
  }

  function readJsonFile(filePath, fallback = null) {
    try {
      if (!fsImpl.existsSync(filePath)) return fallback
      return JSON.parse(fsImpl.readFileSync(filePath, 'utf8'))
    } catch {
      return fallback
    }
  }

  function writeJsonFile(filePath, data, options = {}) {
    fsImpl.mkdirSync(pathImpl.dirname(filePath), { recursive: true })
    const content = `${JSON.stringify(data, null, 2)}\n`
    fsImpl.writeFileSync(filePath, content, { encoding: 'utf8', mode: options.mode || 0o600 })
  }

  function parseOldEnvFile(envPath) {
    const env = {}
    try {
      if (!envPath || !fsImpl.existsSync(envPath)) return env
      const text = fsImpl.readFileSync(envPath, 'utf8')
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
    }
    return env
  }

  function getLegacyModelProviders() {
    return [
      { slug: 'deepseek', key_env: 'DEEPSEEK_API_KEY', name: 'DeepSeek' },
      { slug: 'qwen', key_env: 'DASHSCOPE_API_KEY', name: '通义千问' },
      { slug: 'glm', key_env: 'ZHIPU_API_KEY', name: '智谱 GLM' },
      { slug: 'openai', key_env: 'OPENAI_API_KEY', name: 'OpenAI' },
      { slug: 'anthropic', key_env: 'ANTHROPIC_API_KEY', name: 'Anthropic' },
      { slug: 'custom', key_env: 'CUSTOM_API_KEY', name: '自定义 OpenAI 兼容' }
    ]
  }

  function isMigrationCompleted() {
    const marker = readJsonFile(migrationMarkerPath(), null)
    return marker?.schemaVersion === MODEL_CONFIG_SCHEMA_VERSION && marker?.modelConfigMigration === true
  }

  function markMigrationCompleted() {
    writeJsonFile(migrationMarkerPath(), {
      schemaVersion: MODEL_CONFIG_SCHEMA_VERSION,
      modelConfigMigration: true,
      migratedAt: new Date().toISOString()
    })
  }

  function backupOldConfig() {
    const backupDir = pathImpl.join(userDataPath, 'migration-backups', `backup-${Date.now()}`)
    try {
      fsImpl.mkdirSync(backupDir, { recursive: true })

      const filesToBackup = [
        oldModelSelectionPath(),
        oldEnvPath(),
        pathImpl.join(oldDataRoot, 'credentials', 'model-credentials.json')
      ].filter(Boolean)

      for (const filePath of filesToBackup) {
        try {
          if (fsImpl.existsSync(filePath)) {
            const destPath = pathImpl.join(backupDir, pathImpl.basename(filePath))
            fsImpl.copyFileSync(filePath, destPath)
          }
        } catch {
        }
      }
      return { success: true, backupDir }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  function migrateModelConfig({ credentialStore }) {
    if (isMigrationCompleted()) {
      return { migrated: false, reason: 'already_migrated' }
    }

    const backupResult = backupOldConfig()
    if (!backupResult.success) {
      return { migrated: false, error: `Backup failed: ${backupResult.error}`, backupFailed: true }
    }

    try {
      const oldSelection = readJsonFile(oldModelSelectionPath(), { provider: '', model: '' })
      const oldEnv = parseOldEnvFile(oldEnvPath())

      const providers = getLegacyModelProviders()
      const detectedProviders = []

      for (const provider of providers) {
        const apiKey = oldEnv[provider.key_env]
        if (apiKey && String(apiKey).trim()) {
          detectedProviders.push({
            slug: provider.slug,
            name: provider.name,
            key_env: provider.key_env,
            hasApiKey: true
          })
          if (credentialStore && typeof credentialStore.set === 'function') {
            try {
              credentialStore.set(provider.key_env, String(apiKey).trim())
            } catch {
            }
          }
        }
      }

      const customBaseUrl = oldEnv.CUSTOM_BASE_URL
      const customModelName = oldEnv.CUSTOM_MODEL_NAME
      if (customBaseUrl && customModelName && credentialStore) {
        try {
          credentialStore.set('CUSTOM_BASE_URL', String(customBaseUrl).trim())
          credentialStore.set('CUSTOM_MODEL_NAME', String(customModelName).trim())
        } catch {
        }
      }

      let selectedProvider = oldSelection.provider || ''
      let selectedModel = oldSelection.model || ''

      if ((!selectedProvider || !selectedModel) && detectedProviders.length > 0) {
        selectedProvider = detectedProviders[0].slug
      }

      const modelConfig = {
        schemaVersion: MODEL_CONFIG_SCHEMA_VERSION,
        migratedAt: new Date().toISOString(),
        selectedProvider,
        selectedModel,
        detectedProviders,
        customConfig: customBaseUrl && customModelName ? {
          baseUrl: customBaseUrl,
          modelName: customModelName
        } : null
      }

      writeJsonFile(modelConfigPath(), modelConfig)
      markMigrationCompleted()

      return {
        migrated: true,
        backupDir: backupResult.backupDir,
        selectedProvider,
        selectedModel,
        detectedProvidersCount: detectedProviders.length
      }
    } catch (err) {
      return {
        migrated: false,
        error: err instanceof Error ? err.message : String(err),
        backupDir: backupResult.backupDir,
        migrationFailed: true
      }
    }
  }

  function getCurrentModelConfig() {
    return readJsonFile(modelConfigPath(), {
      schemaVersion: MODEL_CONFIG_SCHEMA_VERSION,
      selectedProvider: '',
      selectedModel: '',
      detectedProviders: [],
      customConfig: null
    })
  }

  function saveModelConfig(config) {
    const normalized = {
      schemaVersion: MODEL_CONFIG_SCHEMA_VERSION,
      updatedAt: new Date().toISOString(),
      selectedProvider: String(config?.selectedProvider || ''),
      selectedModel: String(config?.selectedModel || ''),
      detectedProviders: Array.isArray(config?.detectedProviders) ? config.detectedProviders : [],
      customConfig: config?.customConfig || null
    }
    writeJsonFile(modelConfigPath(), normalized)
    return normalized
  }

  return {
    isMigrationCompleted,
    migrateModelConfig,
    getCurrentModelConfig,
    saveModelConfig,
    MODEL_CONFIG_SCHEMA_VERSION
  }
}

module.exports = { createModelConfigMigrator, MODEL_CONFIG_SCHEMA_VERSION }
