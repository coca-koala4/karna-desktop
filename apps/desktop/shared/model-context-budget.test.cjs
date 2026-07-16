'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { resolveModelContextBudget } = require('./model-context-budget.cjs')

test('resolves DeepSeek V4 aliases to a one-million-token window', () => {
  for (const model of ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-chat', 'deepseek-reasoner']) {
    const budget = resolveModelContextBudget({ model, compressionThreshold: 0.5 })
    assert.equal(budget.advertisedContextTokens, 1_000_000)
    assert.equal(budget.effectiveContextTokens, 1_000_000)
    assert.equal(budget.compressionStartsAt, 500_000)
    assert.equal(budget.source, 'catalog')
  }
})

test('a user override is explicit and provider metadata beats the offline fallback', () => {
  const detected = resolveModelContextBudget({ model: 'my-local-model', providerContextLength: 900_000 })
  assert.equal(detected.effectiveContextTokens, 900_000)
  assert.equal(detected.source, 'provider_metadata')

  const overridden = resolveModelContextBudget({
    model: 'deepseek-v4-pro',
    providerContextLength: 900_000,
    configuredContextLength: 128_000
  })
  assert.equal(overridden.advertisedContextTokens, 900_000)
  assert.equal(overridden.effectiveContextTokens, 128_000)
  assert.equal(overridden.source, 'user_override')
})

test('large-window models receive a proportional workflow context budget', () => {
  const budget = resolveModelContextBudget({ model: 'deepseek-v4-pro' })
  assert.ok(budget.workflowContextTokens > 500_000)
  assert.ok(budget.workflowContextTokens < budget.availableInputTokens)
})
