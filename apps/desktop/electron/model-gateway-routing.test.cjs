const assert = require('node:assert/strict')
const adapter = require('./karna-adapter.cjs')

async function main() {
  const calls = []
  adapter.setHermesApiBridge(async request => {
    calls.push(request)
    return {
      content: '已增强',
      usage: { input_tokens: 5, output_tokens: 2 },
      provider: 'deepseek',
      model: 'deepseek-chat',
      gateway: 'python-hermes-model-gateway'
    }
  })

  const response = await adapter._modelGatewayTest.chatBackendFetch({
    body: { messages: [{ role: 'user', content: '你好' }], task: 'test' }
  })
  assert.equal(response.status, 200)
  assert.equal(response.data.content, '已增强')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].path, '/api/model/complete')
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].body.task, 'test')

  const enhanced = await adapter._modelGatewayTest.enhancePromptText({ text: '写一篇文章' })
  assert.equal(enhanced.ok, true)
  assert.equal(enhanced.provider, 'deepseek')
  assert.equal(calls[1].path, '/api/model/complete')
  assert.equal(calls[1].body.task, 'prompt_enhance')

  adapter.setHermesApiBridge(null)
  console.log('MODEL GATEWAY ROUTING TEST PASSED')
}

main().catch(error => {
  adapter.setHermesApiBridge(null)
  console.error(error)
  process.exitCode = 1
})
