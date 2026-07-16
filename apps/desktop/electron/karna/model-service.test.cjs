'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { MODEL_PROVIDERS, createCustomModelController, createCustomModelStore, createEmbeddingModelService, createImageModelService, createModelRouter, createModelService, customEnvKey, isImagePrompt, modelCapabilities, normalizeCustomModel, parseImageOutput } = require('./model-service.cjs')

test('model providers expose stable built-in metadata and derived capabilities', () => {
  assert.deepEqual(
    MODEL_PROVIDERS.map(provider => provider.slug),
    ['glm', 'deepseek', 'anthropic', 'qwen', 'openai', 'gemini']
  )
  assert.equal(new Set(MODEL_PROVIDERS.map(provider => provider.key_env)).size, MODEL_PROVIDERS.length)
  assert.equal(modelCapabilities('deepseek-reasoner').reasoning, true)
  assert.equal(modelCapabilities('gpt-4o-mini').fast, true)
  assert.equal(modelCapabilities('qwen-max').reasoning, true)
})

test('model service hides model names until a provider is configured', () => {
  const service = createModelService({
    isProviderConfigured: provider => provider.slug === 'deepseek'
  })
  const rows = service.listProviders()
  const deepseek = rows.find(provider => provider.slug === 'deepseek')
  const openai = rows.find(provider => provider.slug === 'openai')

  assert.equal(deepseek.authenticated, true)
  assert.deepEqual(deepseek.models, [
    'deepseek-v4.1-pro',
    'deepseek-v4.1-fast',
    'deepseek-reasoner',
    'deepseek-chat',
    'deepseek-v3.5'
  ])
  assert.equal(openai.authenticated, false)
  assert.deepEqual(openai.models, [])
  assert.match(openai.warning, /OPENAI_API_KEY/)
})

test('custom models retain provider-reported context length metadata', () => {
  assert.equal(normalizeCustomModel({
    id: 'local', base_url: 'http://localhost:11434/v1', model_name: 'large-local', context_length: '1048576'
  }).context_length, 1_048_576)
})

test('custom model store normalizes, persists, masks, and exposes usable providers', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-model-store-'))
  const file = path.join(dir, 'custom_models.json')
  const env = { [customEnvKey('local-chat')]: 'sk-test-secret' }
  const store = createCustomModelStore({
    fs,
    path,
    getCustomModelsPath: () => file,
    getEnvValue: key => env[key] || ''
  })

  try {
    store.writeCustomModels([
      {
        id: 'local-chat',
        name: 'Local Chat',
        base_url: 'https://example.test/v1/',
        model_name: 'local-reasoner',
        type: 'chat',
        enabled: true,
        usable: true
      }
    ])

    const row = store.readCustomModels()[0]

    assert.equal(row.base_url, 'https://example.test/v1')
    assert.equal(row.type, 'chat')

    const publicRow = store.publicCustomModel(row)

    assert.equal(publicRow.api_key_set, true)
    assert.equal(publicRow.api_key_redacted, 'sk-t?cret')

    const provider = store.getCustomProvider('local-chat')

    assert.equal(provider.slug, 'custom:local-chat')
    assert.deepEqual(provider.models, ['local-reasoner'])
    assert.equal(store.getCustomProviders().length, 1)
  } finally {
    fs.rmSync(dir, { force: true, recursive: true })
  }
})

test('model router sends image prompts to usable image models and routes text away from image-only models', () => {
  const models = [
    { id: 'img', model_name: 'image-pro', type: 'image', enabled: true, usable: true },
    { id: 'chat', model_name: 'chat-pro', type: 'chat', enabled: true, usable: true }
  ]
  const router = createModelRouter({
    isProviderConfigured: () => false,
    readCustomModels: () => models
  })

  assert.equal(isImagePrompt('生成一张小猫海报'), true)
  assert.equal(isImagePrompt('summarize this report'), false)

  const imageRoute = router.routeModelForPrompt('draw a poster', 'custom:chat', 'chat-pro')

  assert.equal(imageRoute.provider, 'custom:img')
  assert.equal(imageRoute.model, 'image-pro')
  assert.equal(imageRoute.row.id, 'img')
  assert.equal(imageRoute.routed, true)

  const textRoute = router.routeModelForPrompt('summarize this report', 'custom:img', 'image-pro')

  assert.equal(textRoute.provider, 'custom:chat')
  assert.equal(textRoute.model, 'chat-pro')
  assert.equal(textRoute.row, null)
  assert.equal(textRoute.routed, true)
})

test('custom model controller upserts, retests, and deletes persisted rows', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'karna-model-controller-'))
  const file = path.join(dir, 'custom_models.json')
  const env = {}
  const store = createCustomModelStore({
    fs,
    path,
    getCustomModelsPath: () => file,
    getEnvValue: key => env[key] || ''
  })
  const controller = createCustomModelController({
    crypto: { randomBytes: () => Buffer.from('abcde') },
    getEnvValue: key => env[key] || '',
    publicCustomModel: store.publicCustomModel,
    readCustomModels: store.readCustomModels,
    testCustomModelByType: async row => ({ ok: true, base_url: row.base_url.replace('/v1', '/openai/v1'), message: `${row.model_name} ok` }),
    writeCustomModels: store.writeCustomModels,
    writeEnvValue: (key, value) => { env[key] = value }
  })

  try {
    const created = await controller.upsertCustomModel({
      name: 'Test Chat',
      base_url: 'https://example.test/v1',
      model_name: 'chat-model',
      api_key: 'secret-key'
    })

    assert.equal(created.ok, true)
    assert.equal(created.model.id, 'cm_6162636465')
    assert.equal(created.model.base_url, 'https://example.test/openai/v1')
    assert.equal(env[customEnvKey('cm_6162636465')], 'secret-key')

    const tested = await controller.testExistingCustomModel('cm_6162636465', { model_name: 'chat-model-2' })

    assert.equal(tested.ok, true)
    assert.equal(store.readCustomModels()[0].usable, true)

    const deleted = controller.deleteCustomModel('cm_6162636465')

    assert.equal(deleted.ok, true)
    assert.deepEqual(store.readCustomModels(), [])
  } finally {
    fs.rmSync(dir, { force: true, recursive: true })
  }
})

test('embedding model service selects preferred rows, tests endpoints, and embeds batches', async () => {
  const rows = [
    { id: 'embed-a', model_name: 'embed-a-model', type: 'embedding', enabled: true, usable: true, base_url: 'https://embed-a.test/' },
    { id: 'embed-b', model_name: 'embed-b-model', type: 'embedding', enabled: true, usable: true, base_url: 'https://embed-b.test' }
  ]
  const calls = []
  const service = createEmbeddingModelService({
    getEnvValue: key => key === customEnvKey('embed-b') ? 'Bearer embed-key' : '',
    normalizeApiKey: value => String(value || '').replace(/^Bearer\s+/i, ''),
    publicCustomModel: row => ({ ...row, provider: `custom:${row.id}` }),
    readCustomModels: () => rows,
    postJsonUrl: async (url, headers, payload, timeoutMs) => {
      calls.push({ headers, payload, timeoutMs, url })

      return {
        status: 200,
        data: { data: Array.isArray(payload.input) ? payload.input.map((_, index) => ({ embedding: [index, index + 1] })) : [{ embedding: [1, 2, 3] }] }
      }
    }
  })

  assert.equal(service.getEmbeddingModelRow('custom:embed-b').id, 'embed-b')

  const tested = await service.testEmbeddingModel({ base_url: 'https://embed.test/', model_name: 'embed-model', api_key: 'abc' })

  assert.equal(tested.ok, true)
  assert.match(tested.message, /3 dims/)

  const embedded = await service.embedTexts(['one', 'two'], 'embed-b')

  assert.deepEqual(embedded.vectors, [[0, 1], [1, 2]])
  assert.equal(embedded.model.provider, 'custom:embed-b')
  assert.deepEqual(calls.at(-1).headers, { Authorization: 'Bearer embed-key' })
  assert.equal(calls.at(-1).url, 'https://embed-b.test/embeddings')
  assert.equal(calls.at(-1).timeoutMs, 120_000)
})

test('image model service tests fallback domains and records generated artifacts', async () => {
  const artifacts = []
  const calls = []
  const service = createImageModelService({
    getEnvValue: key => key === customEnvKey('img') ? 'Bearer image-key' : '',
    normalizeApiKey: value => String(value || '').replace(/^Bearer\s+/i, ''),
    recordArtifact: artifact => {
      const row = { id: `art-${artifacts.length + 1}`, ...artifact }

      artifacts.push(row)

      return row
    },
    postJsonUrl: async (url, headers, payload, timeoutMs) => {
      calls.push({ headers, payload, timeoutMs, url })
      if (/api\.siliconflow\.com/.test(url)) {
        return { status: 401, data: { error: 'bad domain' } }
      }

      return { status: 200, data: { data: [{ b64_json: 'abc123' }] } }
    }
  })

  assert.equal(parseImageOutput({ images: [{ url: 'https://image.test/a.png' }] }), 'https://image.test/a.png')

  const testResult = await service.testImageModel({
    base_url: 'https://api.siliconflow.com/v1',
    model_name: 'image-model',
    api_key: 'secret'
  })

  assert.equal(testResult.ok, true)
  assert.equal(testResult.base_url, 'https://api.siliconflow.cn/v1')
  assert.match(testResult.message, /CN endpoint/)

  const markdown = await service.generateImageWithCustomModel({
    id: 'img',
    base_url: 'https://image.test/v1',
    model_name: 'image-model',
    image_size: '512x512'
  }, 'draw a duck')

  assert.match(markdown, /^!\[image-model generated image\]\(data:image\/png;base64,abc123\)/)
  assert.equal(artifacts[0].metadata.prompt, 'draw a duck')
  assert.deepEqual(calls.at(-1).headers, { Authorization: 'Bearer image-key' })
  assert.equal(calls.at(-1).payload.image_size, '512x512')
  assert.equal(calls.at(-1).timeoutMs, 120_000)
})
