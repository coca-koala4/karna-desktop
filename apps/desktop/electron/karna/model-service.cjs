'use strict'

const MODEL_PROVIDERS = Object.freeze([
  Object.freeze({
    slug: 'glm',
    name: 'GLM / Zhipu',
    provider_label: 'GLM',
    auth_type: 'api_key',
    key_env: 'GLM_API_KEY',
    authenticated: true,
    models: Object.freeze(['glm-4-plus', 'glm-4-flash'])
  }),
  Object.freeze({
    slug: 'deepseek',
    name: 'DeepSeek',
    provider_label: 'DeepSeek',
    auth_type: 'api_key',
    key_env: 'DEEPSEEK_API_KEY',
    authenticated: true,
    models: Object.freeze(['deepseek-v4.1-pro', 'deepseek-v4.1-fast', 'deepseek-reasoner', 'deepseek-chat', 'deepseek-v3.5'])
  }),
  Object.freeze({
    slug: 'anthropic',
    name: 'Anthropic / Claude',
    provider_label: 'Anthropic',
    auth_type: 'api_key',
    key_env: 'ANTHROPIC_API_KEY',
    authenticated: true,
    models: Object.freeze(['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'])
  }),
  Object.freeze({
    slug: 'qwen',
    name: 'Qwen / Alibaba',
    provider_label: 'Qwen',
    auth_type: 'api_key',
    key_env: 'DASHSCOPE_API_KEY',
    authenticated: true,
    models: Object.freeze(['qwen-plus', 'qwen-max', 'qwen-turbo'])
  }),
  Object.freeze({
    slug: 'openai',
    name: 'GPT / OpenAI',
    provider_label: 'GPT',
    auth_type: 'api_key',
    key_env: 'OPENAI_API_KEY',
    authenticated: true,
    models: Object.freeze(['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'])
  }),
  Object.freeze({
    slug: 'gemini',
    name: 'Gemini / Google',
    provider_label: 'Gemini',
    auth_type: 'api_key',
    key_env: 'GEMINI_API_KEY',
    authenticated: true,
    models: Object.freeze(['gemini-1.5-pro', 'gemini-1.5-flash'])
  })
])

const modelCapabilities = model => ({
  reasoning: /reason|thinking|claude|glm|gemini|gpt-4|qwen-max|v4\.1-pro|v4-pro/i.test(String(model)),
  fast: /flash|mini|turbo|haiku|v4\.1-fast|v4-fast/i.test(String(model))
})

const isImagePrompt = text => {
  const value = String(text || '').toLowerCase()
  const asciiHit = /image|picture|photo|draw|generate.*image|create.*image|poster|illustration|wallpaper|logo/.test(value)
  const zhWords = [
    '生成图',
    '生成图片',
    '生成一张',
    '画图',
    '画一张',
    '出图',
    '文生图',
    '图片',
    '照片',
    '海报',
    '插画',
    '头像',
    '壁纸',
    '小鸭',
    '小猫',
    '小狗'
  ]

  return asciiHit || zhWords.some(word => value.includes(word))
}

const customEnvKey = id => `CUSTOM_MODEL_${String(id).toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`
const maskSecret = value => value ? `${String(value).slice(0, 4)}?${String(value).slice(-4)}` : null

function normalizeCustomModel(row) {
  return {
    id: String(row.id || '').trim(),
    name: String(row.name || row.model_name || '').trim(),
    base_url: String(row.base_url || '').trim().replace(/\/+$/, ''),
    model_name: String(row.model_name || '').trim(),
    type: String(row.type || row.kind || row.task || 'chat').trim().toLowerCase(),
    endpoint: String(row.endpoint || '').trim(),
    context_length: Number.isFinite(Number(row.context_length)) && Number(row.context_length) > 0
      ? Math.floor(Number(row.context_length))
      : null,
    enabled: row.enabled !== false,
    usable: row.usable === true,
    last_test: row.last_test && typeof row.last_test === 'object' ? row.last_test : null,
    created_at: row.created_at || new Date().toISOString(),
    updated_at: row.updated_at || new Date().toISOString()
  }
}

function createCustomModelStore({ fs, getCustomModelsPath, getEnvValue, path }) {
  function readCustomModels() {
    try {
      const raw = JSON.parse(fs.readFileSync(getCustomModelsPath(), 'utf8'))
      const rows = Array.isArray(raw) ? raw : Array.isArray(raw.models) ? raw.models : []

      return rows.map(normalizeCustomModel).filter(row => row.id && row.base_url && row.model_name)
    } catch {
      return []
    }
  }

  function writeCustomModels(models) {
    const file = getCustomModelsPath()

    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${JSON.stringify({ version: 1, models }, null, 2)}\n`, 'utf8')

    return file
  }

  function publicCustomModel(row) {
    const apiKey = getEnvValue(customEnvKey(row.id)).trim()

    return {
      ...row,
      provider: `custom:${row.id}`,
      api_key_env: customEnvKey(row.id),
      api_key_set: !!apiKey,
      api_key_redacted: maskSecret(apiKey)
    }
  }

  function customProviderFromRow(row) {
    return {
      slug: `custom:${row.id}`,
      name: row.name || row.model_name,
      provider_label: 'Custom',
      auth_type: 'api_key',
      key_env: customEnvKey(row.id),
      authenticated: row.enabled !== false && row.usable === true,
      is_user_defined: true,
      model_type: row.type || 'chat',
      models: row.enabled !== false && row.usable === true ? [row.model_name] : [],
      total_models: 1,
      warning: row.usable ? undefined : row.last_test?.message || 'Run a successful model test before using this model.',
      capabilities: row.usable ? { [row.model_name]: modelCapabilities(row.model_name) } : {}
    }
  }

  function getCustomProvider(id) {
    const rows = readCustomModels()

    if (id) {
      const row = rows.find(model => model.id === id)

      return row ? customProviderFromRow(row) : null
    }

    const legacyBaseUrl = getEnvValue('CUSTOM_BASE_URL').trim()
    const legacyModel = getEnvValue('CUSTOM_MODEL_NAME').trim()

    if (!legacyBaseUrl || !legacyModel) {
      return null
    }

    return {
      slug: 'custom',
      name: 'Legacy custom / OpenAI-compatible',
      provider_label: 'Custom',
      auth_type: 'api_key',
      key_env: 'CUSTOM_API_KEY',
      authenticated: true,
      is_user_defined: true,
      models: [legacyModel],
      total_models: 1,
      capabilities: { [legacyModel]: modelCapabilities(legacyModel) }
    }
  }

  function getCustomProviders() {
    return readCustomModels().map(customProviderFromRow).filter(provider => provider.authenticated)
  }

  return {
    customEnvKey,
    customProviderFromRow,
    getCustomProvider,
    getCustomProviders,
    maskSecret,
    publicCustomModel,
    readCustomModels,
    writeCustomModels
  }
}

function createModelRouter({ isProviderConfigured, readCustomModels }) {
  function findUsableImageModel() {
    return readCustomModels().find(row => row.enabled !== false && row.usable === true && row.type === 'image') || null
  }

  function findUsableChatProvider() {
    const builtin = MODEL_PROVIDERS.find(isProviderConfigured)

    if (builtin) {
      return { provider: builtin.slug, model: builtin.models[0] }
    }

    const custom = readCustomModels().find(row => row.enabled !== false && row.usable === true && ['chat', 'vision'].includes(row.type || 'chat'))

    if (custom) {
      return { provider: `custom:${custom.id}`, model: custom.model_name }
    }

    return null
  }

  function routeModelForPrompt(prompt, provider, model) {
    const row = String(provider || '').startsWith('custom:')
      ? readCustomModels().find(item => `custom:${item.id}` === String(provider))
      : null

    if (isImagePrompt(prompt)) {
      if (row?.type === 'image') {
        return { provider, model, row, routed: false }
      }

      const imageRow = findUsableImageModel()

      if (imageRow) {
        return { provider: `custom:${imageRow.id}`, model: imageRow.model_name, row: imageRow, routed: true }
      }
    }

    if (row?.type === 'image' && !isImagePrompt(prompt)) {
      const chat = findUsableChatProvider()

      if (chat) {
        return { ...chat, row: null, routed: true }
      }
    }

    return { provider, model, row, routed: false }
  }

  return { findUsableChatProvider, findUsableImageModel, routeModelForPrompt }
}

function createCustomModelController({
  crypto,
  getEnvValue,
  publicCustomModel,
  readCustomModels,
  testCustomModelByType,
  writeCustomModels,
  writeEnvValue
}) {
  async function upsertCustomModel(body, existingId = null) {
    const models = readCustomModels()
    const now = new Date().toISOString()
    const id = existingId || `cm_${crypto.randomBytes(5).toString('hex')}`
    const current = models.find(model => model.id === id) || {}
    const apiKey = String(body?.api_key ?? '').trim()
    const type = String(body?.type || current.type || 'chat').trim().toLowerCase()
    const row = {
      ...current,
      id,
      name: String(body?.name || current.name || body?.model_name || current.model_name || id).trim(),
      base_url: String(body?.base_url || current.base_url || '').trim().replace(/\/+$/, ''),
      model_name: String(body?.model_name || current.model_name || '').trim(),
      type,
      endpoint: String(body?.endpoint || current.endpoint || '').trim(),
      context_length: Number.isFinite(Number(body?.context_length)) && Number(body.context_length) > 0
        ? Math.floor(Number(body.context_length))
        : (current.context_length || null),
      enabled: body?.enabled !== false,
      created_at: current.created_at || now,
      updated_at: now
    }
    const keyForTest = apiKey || getEnvValue(customEnvKey(id)).trim()
    const test = await testCustomModelByType({ ...row, api_key: keyForTest })

    row.usable = test.ok === true
    if (test.base_url) {
      row.base_url = test.base_url
    }
    row.last_test = { ...test, tested_at: now }

    if (!test.ok) {
      return { ok: false, model: publicCustomModel(row), test, error: test.message, message: test.message }
    }

    writeCustomModels(models.filter(model => model.id !== id).concat(row))
    if (apiKey) {
      writeEnvValue(customEnvKey(id), apiKey)
    }

    return { ok: true, model: publicCustomModel(row), test, message: test.message }
  }

  function deleteCustomModel(id) {
    const next = readCustomModels().filter(model => model.id !== id)

    writeCustomModels(next)

    return { ok: true, models: next }
  }

  async function testExistingCustomModel(id, body = {}) {
    const row = readCustomModels().find(model => model.id === id)

    if (!row) {
      return { ok: false, reachable: false, message: 'Custom model not found.' }
    }

    const apiKey = String(body?.api_key || '').trim() || getEnvValue(customEnvKey(id)).trim()
    const test = await testCustomModelByType({
      ...row,
      base_url: body?.base_url || row.base_url,
      model_name: body?.model_name || row.model_name,
      api_key: apiKey
    })
    const now = new Date().toISOString()
    const rows = readCustomModels().map(model => model.id === id
      ? { ...model, usable: test.ok === true, last_test: { ...test, tested_at: now }, updated_at: now }
      : model)

    writeCustomModels(rows)

    return test
  }

  return { deleteCustomModel, testExistingCustomModel, upsertCustomModel }
}

function createEmbeddingModelService({
  getEnvValue,
  normalizeApiKey,
  postJsonUrl,
  publicCustomModel,
  readCustomModels
}) {
  function getEmbeddingModelRow(preferredId = '') {
    const rows = readCustomModels().filter(row => row.enabled !== false && row.usable === true && row.type === 'embedding')

    if (preferredId) {
      return rows.find(row => row.id === preferredId || `custom:${row.id}` === preferredId) || null
    }

    return rows[0] || null
  }

  async function testEmbeddingModel({ base_url, model_name, api_key }) {
    const baseUrl = String(base_url || '').trim().replace(/\/+$/, '')
    const modelName = String(model_name || '').trim()

    if (!baseUrl || !modelName) {
      return { ok: false, reachable: false, message: 'base_url and model_name are required.' }
    }

    const cleanKey = normalizeApiKey(api_key)
    const headers = cleanKey ? { Authorization: `Bearer ${cleanKey}` } : {}

    try {
      const response = await postJsonUrl(`${baseUrl}/embeddings`, headers, { model: modelName, input: 'test' })

      if (response.status < 200 || response.status >= 300) {
        const detail = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

        return { ok: false, reachable: true, status: response.status, message: `HTTP ${response.status}: ${detail.slice(0, 500)}` }
      }

      const embedding = response.data?.data?.[0]?.embedding

      if (!Array.isArray(embedding)) {
        return { ok: false, reachable: true, status: response.status, message: 'Embedding endpoint responded but no embedding vector was returned.' }
      }

      return { ok: true, reachable: true, status: response.status, message: `Embedding model test passed (${embedding.length} dims).` }
    } catch (err) {
      return { ok: false, reachable: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  async function embedTexts(texts, preferredId = '') {
    const row = getEmbeddingModelRow(preferredId)

    if (!row) {
      throw new Error('No usable embedding model configured. Add an Embedding model first in Model settings.')
    }

    const apiKey = getEnvValue(customEnvKey(row.id)).trim()
    const cleanKey = normalizeApiKey(apiKey)
    const headers = cleanKey ? { Authorization: `Bearer ${cleanKey}` } : {}
    const baseUrl = String(row.base_url || '').trim().replace(/\/+$/, '')
    const response = await postJsonUrl(`${baseUrl}/embeddings`, headers, { model: row.model_name, input: texts }, 120_000)

    if (response.status < 200 || response.status >= 300) {
      const detail = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

      throw new Error(`Embedding failed: HTTP ${response.status}: ${detail.slice(0, 600)}`)
    }

    const data = Array.isArray(response.data?.data) ? response.data.data : []
    const vectors = data.map(item => item.embedding).filter(Array.isArray)

    if (vectors.length !== texts.length) {
      throw new Error(`Embedding endpoint returned ${vectors.length} vectors for ${texts.length} inputs.`)
    }

    return { vectors, model: publicCustomModel(row) }
  }

  return { embedTexts, getEmbeddingModelRow, testEmbeddingModel }
}

function parseImageOutput(data) {
  const first = Array.isArray(data?.data) ? data.data[0] : null

  return first?.url || first?.b64_json || data?.images?.[0]?.url || data?.output?.[0] || ''
}

function createImageModelService({
  getEnvValue,
  normalizeApiKey,
  postJsonUrl,
  recordArtifact
}) {
  async function testImageModelOnce({ baseUrl, modelName, headers, image_size }) {
    const response = await postJsonUrl(`${baseUrl}/images/generations`, headers, {
      model: modelName,
      prompt: 'A simple blue circle on a white background, clean test image.',
      image_size: image_size || '1024x1024',
      seed: 1
    }, 60_000)

    if (response.status < 200 || response.status >= 300) {
      const detail = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

      return { ok: false, reachable: true, status: response.status, detail, message: `HTTP ${response.status} from ${baseUrl}/images/generations: ${detail.slice(0, 500)}` }
    }

    const output = parseImageOutput(response.data)

    if (!output) {
      return { ok: false, reachable: true, status: response.status, message: 'Image endpoint responded but no image URL/base64 was returned.' }
    }

    return { ok: true, reachable: true, status: response.status, base_url: baseUrl, message: 'Image model test passed.', sample: String(output).slice(0, 180) }
  }

  async function testImageModel({ base_url, model_name, api_key, image_size }) {
    const baseUrl = String(base_url || '').trim().replace(/\/+$/, '')
    const modelName = String(model_name || '').trim()

    if (!baseUrl || !modelName) {
      return { ok: false, reachable: false, message: 'base_url and model_name are required.' }
    }

    const cleanKey = normalizeApiKey(api_key)
    const headers = cleanKey ? { Authorization: `Bearer ${cleanKey}` } : {}

    try {
      const primary = await testImageModelOnce({ baseUrl, modelName, headers, image_size })

      if (primary.ok) {
        return primary
      }

      if (primary.status === 401 && /api\.siliconflow\.com/i.test(baseUrl)) {
        const cnBaseUrl = baseUrl.replace(/api\.siliconflow\.com/i, 'api.siliconflow.cn')
        const fallback = await testImageModelOnce({ baseUrl: cnBaseUrl, modelName, headers, image_size })

        if (fallback.ok) {
          return { ...fallback, message: 'Image model test passed on https://api.siliconflow.cn/v1. Saved CN endpoint automatically.' }
        }

        return {
          ...fallback,
          message: `Tried both SiliconFlow domains. .com returned 401 (${primary.detail?.slice(0, 160) || primary.message}); .cn returned ${fallback.status || 'error'} (${fallback.detail?.slice(0, 200) || fallback.message}).`
        }
      }

      if (primary.status === 401) {
        return { ...primary, message: `SiliconFlow image API returned 401. If your key was created at cloud.siliconflow.cn, use base_url https://api.siliconflow.cn/v1. Detail: ${primary.detail?.slice(0, 300) || primary.message}` }
      }

      return primary
    } catch (err) {
      return { ok: false, reachable: false, message: err instanceof Error ? err.message : String(err) }
    }
  }

  async function generateImageWithCustomModel(row, prompt) {
    const baseUrl = String(row.base_url || '').trim().replace(/\/+$/, '')
    const modelName = String(row.model_name || '').trim()
    const apiKey = getEnvValue(customEnvKey(row.id)).trim()
    const cleanKey = normalizeApiKey(apiKey)
    const headers = cleanKey ? { Authorization: `Bearer ${cleanKey}` } : {}
    const response = await postJsonUrl(`${baseUrl}/images/generations`, headers, {
      model: modelName,
      prompt: prompt || 'Generate an image.',
      image_size: row.image_size || '1024x1024'
    }, 120_000)

    if (response.status < 200 || response.status >= 300) {
      const detail = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

      throw new Error(`Image generation failed: HTTP ${response.status}: ${detail.slice(0, 800)}`)
    }

    const output = parseImageOutput(response.data)

    if (!output) {
      throw new Error('Image generation succeeded but no image URL/base64 was returned.')
    }

    const imageUrl = String(output).startsWith('http') ? String(output) : `data:image/png;base64,${output}`
    const artifact = recordArtifact({
      type: 'image',
      title: `${modelName} image`,
      url: imageUrl,
      content: null,
      metadata: { provider: `custom:${row.id}`, model: modelName, prompt: String(prompt || '').slice(0, 1000), base_url: baseUrl }
    })

    return `![${modelName} generated image](${imageUrl})\n\n[artifact:${artifact.id}]`
  }

  return { generateImageWithCustomModel, parseImageOutput, testImageModel, testImageModelOnce }
}

function createModelService({ isProviderConfigured }) {
  function listProviders() {
    return MODEL_PROVIDERS.map(provider => {
      const authenticated = isProviderConfigured(provider)
      const models = authenticated ? [...provider.models] : []

      return {
        ...provider,
        models,
        authenticated,
        total_models: provider.models.length,
        warning: authenticated ? undefined : `Set ${provider.key_env} before using ${provider.name}.`,
        capabilities: Object.fromEntries(models.map(model => [model, modelCapabilities(model)]))
      }
    })
  }

  return { listProviders }
}

module.exports = {
  MODEL_PROVIDERS,
  createCustomModelController,
  createCustomModelStore,
  createEmbeddingModelService,
  createImageModelService,
  createModelRouter,
  createModelService,
  customEnvKey,
  isImagePrompt,
  maskSecret,
  modelCapabilities,
  normalizeCustomModel,
  parseImageOutput
}
