'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')
const { resolveNodeBudget } = require('./node-resource-resolvers.cjs')

test('auto node budget scales with the selected model window', () => {
  const budget = resolveNodeBudget({
    node: { data: { contextConfig: { maxContextTokens: 0 } } },
    workflow: {},
    model: 'deepseek-v4-pro',
    systemDefault: 'deepseek-v4-pro',
    systemContextLength: 1_000_000
  })

  assert.equal(budget.modelContextLength, 1_000_000)
  assert.equal(budget.contextBudgetMode, 'auto')
  assert.ok(budget.maxContextTokens > 500_000)
  assert.ok(budget.maxContextTokens <= budget.maxInputTokens)
})

test('legacy implicit 16K is upgraded while an explicit manual limit is retained', () => {
  const upgraded = resolveNodeBudget({
    node: { data: { contextConfig: { maxContextTokens: 16_000 } } },
    workflow: {}, model: 'deepseek-chat'
  })
  assert.equal(upgraded.contextBudgetMode, 'auto')
  assert.ok(upgraded.maxContextTokens > 16_000)

  const manual = resolveNodeBudget({
    node: { data: { contextConfig: { maxContextTokens: 16_000, contextBudgetMode: 'manual' } } },
    workflow: {}, model: 'deepseek-chat'
  })
  assert.equal(manual.contextBudgetMode, 'manual')
  assert.equal(manual.maxContextTokens, 16_000)
})
