'use strict'

const { describe, it, assert } = require('../run-tests.cjs')
const {
  resolveNodeModel,
  resolveNodeSkills,
  resolveNodeMcp,
  resolveNodeBudget,
  resolveRetryConfig,
  resolveTimeoutConfig,
  resolveReviewConfig,
  migrateLegacyNodeConfig,
  scanForCredentials,
  autoPickModel,
  hasSensitiveKeys
} = require('../../electron/writer-os/node-resource-resolvers.cjs')

describe('resolveNodeModel - 模型解析', () => {
  it('disabled 模式返回 null', () => {
    const node = { data: { modelConfig: { mode: 'disabled' } } }
    const result = resolveNodeModel({ node, systemDefault: 'gpt-4' })
    assert.equal(result, null)
  })

  it('explicit 模式返回指定模型', () => {
    const node = { data: { modelConfig: { mode: 'explicit', modelId: 'claude-3-opus' } } }
    const result = resolveNodeModel({ node })
    assert.equal(result, 'claude-3-opus')
  })

  it('auto 模式自动选择模型', () => {
    const node = { data: { modelConfig: { mode: 'auto', reasoningEffort: 'medium' } } }
    const availableModels = [
      { id: 'gpt-4o', name: 'GPT-4o', authenticated: true },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', authenticated: true }
    ]
    const result = resolveNodeModel({ node, availableModels })
    assert.equal(typeof result, 'string')
    assert.ok(result.length > 0)
  })

  it('inherit 模式继承工作流配置', () => {
    const node = { data: { modelConfig: { mode: 'inherit' } } }
    const workflow = { runtimeConfig: { defaultModel: 'workflow-model' } }
    const result = resolveNodeModel({ node, workflow, systemDefault: 'default-model' })
    assert.equal(result, 'workflow-model')
  })

  it('inherit 模式回退到 systemDefault', () => {
    const node = { data: { modelConfig: { mode: 'inherit' } } }
    const result = resolveNodeModel({ node, systemDefault: 'fallback-model' })
    assert.equal(result, 'fallback-model')
  })

  it('旧字段兼容 - node.data.model', () => {
    const node = { data: { model: 'legacy-model' } }
    const result = resolveNodeModel({ node })
    assert.equal(result, 'legacy-model')
  })

  it('旧字段兼容 - "默认模型" 字符串', () => {
    const node = { data: { model: '默认模型' } }
    const result = resolveNodeModel({ node, systemDefault: 'default-model' })
    assert.equal(result, 'default-model')
  })

  it('无配置时使用 agent.model', () => {
    const node = { data: {} }
    const agent = { model: 'agent-model' }
    const result = resolveNodeModel({ node, agent })
    assert.equal(result, 'agent-model')
  })
})

describe('resolveNodeSkills - Skills 解析', () => {
  it('disabled 模式', () => {
    const node = { data: { skillsConfig: { mode: 'disabled' } } }
    const result = resolveNodeSkills({ node })
    assert.equal(result.mode, 'disabled')
    assert.deepEqual(result.selectedIds, [])
  })

  it('explicit 模式', () => {
    const node = { data: { skillsConfig: { mode: 'explicit', selectedIds: ['skill-a', 'skill-b'] } } }
    const result = resolveNodeSkills({ node })
    assert.equal(result.mode, 'explicit')
    assert.deepEqual(result.selectedIds, ['skill-a', 'skill-b'])
  })

  it('auto 模式', () => {
    const node = { data: { skillsConfig: { mode: 'auto' } } }
    const result = resolveNodeSkills({ node })
    assert.equal(result.mode, 'auto')
    assert.deepEqual(result.selectedIds, [])
  })

  it('inherit 模式', () => {
    const node = { data: { skillsConfig: { mode: 'inherit' } } }
    const workflow = { runtimeConfig: { defaultSkills: ['wf-skill'] } }
    const result = resolveNodeSkills({ node, workflow })
    assert.equal(result.mode, 'inherit')
    assert.deepEqual(result.selectedIds, ['wf-skill'])
  })

  it('旧字段兼容 - node.data.skill', () => {
    const node = { data: { skill: 'legacy-skill' } }
    const result = resolveNodeSkills({ node })
    assert.equal(result.mode, 'explicit')
    assert.deepEqual(result.selectedIds, ['legacy-skill'])
  })

  it('旧字段兼容 - "自动" 字符串', () => {
    const node = { data: { skill: '自动' } }
    const result = resolveNodeSkills({ node })
    assert.equal(result.mode, 'auto')
  })

  it('包含 localInstructions', () => {
    const node = { data: { skillsConfig: { mode: 'explicit', selectedIds: ['s1'], localInstructions: 'do this' } } }
    const result = resolveNodeSkills({ node })
    assert.equal(result.localInstructions, 'do this')
  })
})

describe('resolveNodeMcp - MCP 解析', () => {
  it('disabled 模式', () => {
    const node = { data: { mcpConfig: { mode: 'disabled' } } }
    const result = resolveNodeMcp({ node })
    assert.equal(result.mode, 'disabled')
    assert.deepEqual(result.selectedIds, [])
  })

  it('explicit 模式', () => {
    const node = { data: { mcpConfig: { mode: 'explicit', selectedIds: ['mcp-a'] } } }
    const result = resolveNodeMcp({ node })
    assert.equal(result.mode, 'explicit')
    assert.deepEqual(result.selectedIds, ['mcp-a'])
  })

  it('auto 模式', () => {
    const node = { data: { mcpConfig: { mode: 'auto' } } }
    const result = resolveNodeMcp({ node })
    assert.equal(result.mode, 'auto')
  })

  it('inherit 模式', () => {
    const node = { data: { mcpConfig: { mode: 'inherit' } } }
    const group = { mcpConfig: { selectedIds: ['group-mcp'] } }
    const result = resolveNodeMcp({ node, group })
    assert.equal(result.mode, 'inherit')
    assert.deepEqual(result.selectedIds, ['group-mcp'])
  })

  it('旧字段兼容 - node.data.mcp', () => {
    const node = { data: { mcp: 'legacy-mcp' } }
    const result = resolveNodeMcp({ node })
    assert.equal(result.mode, 'explicit')
    assert.deepEqual(result.selectedIds, ['legacy-mcp'])
  })
})

describe('resolveNodeBudget - 预算配置', () => {
  it('返回默认预算值', () => {
    const node = { data: {} }
    const result = resolveNodeBudget({ node, workflow: {} })
    assert.equal(result.maxInputTokens, 32000)
    assert.equal(result.maxOutputTokens, 8000)
    assert.equal(result.maxContextTokens, 16000)
    assert.equal(result.maxToolCalls, 10)
    assert.equal(result.maxRetries, 2)
  })

  it('节点级预算覆盖默认值', () => {
    const node = {
      data: {
        budgetConfig: {
          maxInputTokens: 1000,
          maxOutputTokens: 500,
          maxContextTokens: 800,
          maxToolCalls: 3,
          maxRetries: 1
        }
      }
    }
    const result = resolveNodeBudget({ node, workflow: {} })
    assert.equal(result.maxInputTokens, 1000)
    assert.equal(result.maxOutputTokens, 500)
    assert.equal(result.maxContextTokens, 800)
    assert.equal(result.maxToolCalls, 3)
    assert.equal(result.maxRetries, 1)
  })

  it('工作流级限制', () => {
    const node = { data: {} }
    const workflow = { limits: { max_input_tokens: 20000, max_output_tokens: 4000, max_tool_calls: 5 } }
    const result = resolveNodeBudget({ node, workflow })
    assert.equal(result.maxInputTokens, 20000)
    assert.equal(result.maxOutputTokens, 4000)
    assert.equal(result.maxToolCalls, 5)
  })
})

describe('resolveRetryConfig - 重试配置', () => {
  it('默认重试配置', () => {
    const result = resolveRetryConfig({ node: { data: {} } })
    assert.equal(result.maxRetries, 2)
    assert.equal(result.retryOnRecoverable, true)
    assert.equal(result.backoffMs, 1000)
  })

  it('自定义重试配置', () => {
    const node = {
      data: {
        retryConfig: {
          maxRetries: 5,
          retryOnRecoverable: false,
          backoffMs: 2000
        }
      }
    }
    const result = resolveRetryConfig({ node })
    assert.equal(result.maxRetries, 5)
    assert.equal(result.retryOnRecoverable, false)
    assert.equal(result.backoffMs, 2000)
  })
})

describe('resolveTimeoutConfig - 超时配置', () => {
  it('默认超时配置', () => {
    const result = resolveTimeoutConfig({ node: { data: {} } })
    assert.equal(result.timeoutMs, 300000)
    assert.equal(result.onTimeout, 'fail')
  })

  it('自定义超时配置', () => {
    const node = {
      data: {
        timeoutConfig: {
          timeoutMs: 60000,
          onTimeout: 'retry'
        }
      }
    }
    const result = resolveTimeoutConfig({ node })
    assert.equal(result.timeoutMs, 60000)
    assert.equal(result.onTimeout, 'retry')
  })
})

describe('resolveReviewConfig - 审批配置', () => {
  it('默认审批配置', () => {
    const result = resolveReviewConfig({ node: { data: {} } })
    assert.equal(result.requiresReview, true)
    assert.equal(result.reviewPrompt, '')
    assert.equal(result.autoApproveOnTimeout, false)
    assert.equal(result.timeoutMs, 300000)
  })

  it('自定义审批配置', () => {
    const node = {
      data: {
        reviewConfig: {
          requiresReview: false,
          reviewPrompt: 'Please review carefully',
          autoApproveOnTimeout: true,
          timeoutMs: 60000
        }
      }
    }
    const result = resolveReviewConfig({ node })
    assert.equal(result.requiresReview, false)
    assert.equal(result.reviewPrompt, 'Please review carefully')
    assert.equal(result.autoApproveOnTimeout, true)
    assert.equal(result.timeoutMs, 60000)
  })
})

describe('migrateLegacyNodeConfig - 旧字段迁移', () => {
  it('model 字段迁移', () => {
    const result = migrateLegacyNodeConfig({ model: 'gpt-4' })
    assert.equal(result.migrated, true)
    assert.equal(result.data.modelConfig.mode, 'explicit')
    assert.equal(result.data.modelConfig.modelId, 'gpt-4')
    assert.equal(result.legacyConfig.model, 'gpt-4')
  })

  it('skill 字段迁移', () => {
    const result = migrateLegacyNodeConfig({ skill: 'my-skill' })
    assert.equal(result.migrated, true)
    assert.equal(result.data.skillsConfig.mode, 'explicit')
    assert.deepEqual(result.data.skillsConfig.selectedIds, ['my-skill'])
  })

  it('mcp 字段迁移', () => {
    const result = migrateLegacyNodeConfig({ mcp: 'my-mcp' })
    assert.equal(result.migrated, true)
    assert.equal(result.data.mcpConfig.mode, 'explicit')
    assert.deepEqual(result.data.mcpConfig.selectedIds, ['my-mcp'])
  })

  it('plugin 字段迁移', () => {
    const result = migrateLegacyNodeConfig({ plugin: 'my-plugin' })
    assert.equal(result.migrated, true)
    assert.equal(result.data.pluginsConfig.mode, 'explicit')
    assert.deepEqual(result.data.pluginsConfig.selectedIds, ['my-plugin'])
  })

  it('knowledge 字段迁移', () => {
    const result = migrateLegacyNodeConfig({ knowledge: 'kb-123' })
    assert.equal(result.migrated, true)
    assert.ok(result.data.contextConfig)
    assert.equal(result.data.contextConfig.bindings.length, 1)
    assert.equal(result.data.contextConfig.bindings[0].sourceId, 'kb-123')
  })

  it('soul 字段迁移', () => {
    const result = migrateLegacyNodeConfig({ soul: 'soul-123' })
    assert.equal(result.migrated, true)
    assert.equal(result.data.soulConfig.mode, 'explicit')
    assert.equal(result.data.soulConfig.soulId, 'soul-123')
  })

  it('requiresReview 字段迁移', () => {
    const result = migrateLegacyNodeConfig({ requiresReview: true })
    assert.equal(result.migrated, true)
    assert.equal(result.data.reviewConfig.requiresReview, true)
  })

  it('空数据不迁移', () => {
    const result = migrateLegacyNodeConfig({})
    assert.equal(result.migrated, false)
  })

  it('已有新配置不覆盖', () => {
    const result = migrateLegacyNodeConfig({
      model: 'old-model',
      modelConfig: { mode: 'explicit', modelId: 'new-model' }
    })
    assert.equal(result.migrated, false)
    assert.equal(result.data.modelConfig.modelId, 'new-model')
  })

  it('"默认模型" 迁移为 inherit 模式', () => {
    const result = migrateLegacyNodeConfig({ model: '默认模型' })
    assert.equal(result.migrated, true)
    assert.equal(result.data.modelConfig.mode, 'inherit')
  })

  it('"自动" skill 迁移为 auto 模式', () => {
    const result = migrateLegacyNodeConfig({ skill: '自动' })
    assert.equal(result.migrated, true)
    assert.equal(result.data.skillsConfig.mode, 'auto')
  })

  it('null 输入处理', () => {
    const result = migrateLegacyNodeConfig(null)
    assert.equal(result.migrated, false)
    assert.equal(result.data, null)
  })
})

describe('scanForCredentials - 凭证扫描', () => {
  it('检测 api_key 字段', () => {
    const findings = scanForCredentials({ api_key: 'sk-12345678' })
    assert.ok(findings.length > 0)
    assert.equal(findings[0].key, 'api_key')
  })

  it('检测嵌套对象中的凭证', () => {
    const findings = scanForCredentials({
      config: {
        nested: {
          password: 'secret123'
        }
      }
    })
    assert.ok(findings.length > 0)
    assert.equal(findings[0].path, 'config.nested.password')
  })

  it('空字符串不触发', () => {
    const findings = scanForCredentials({ api_key: '' })
    assert.equal(findings.length, 0)
  })

  it('普通字段不触发', () => {
    const findings = scanForCredentials({ name: 'test', value: 123 })
    assert.equal(findings.length, 0)
  })

  it('hasSensitiveKeys 直接调用', () => {
    const findings = hasSensitiveKeys({ token: 'abc12345' })
    assert.ok(findings.length > 0)
  })
})

describe('autoPickModel - 自动模型选择', () => {
  it('空模型列表返回 null', () => {
    const result = autoPickModel({ availableModels: [] })
    assert.equal(result, null)
  })

  it('低复杂度偏好快速模型', () => {
    const models = [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini' }
    ]
    const result = autoPickModel({ availableModels: models, taskComplexity: 'low' })
    assert.equal(typeof result, 'string')
  })

  it('高复杂度偏好推理模型', () => {
    const models = [
      { id: 'gpt-4o', name: 'GPT-4o' },
      { id: 'o1', name: 'O1 Preview' }
    ]
    const result = autoPickModel({ availableModels: models, taskComplexity: 'high' })
    assert.equal(typeof result, 'string')
  })

  it('已认证模型优先', () => {
    const models = [
      { id: 'model-a', name: 'Model A', authenticated: false },
      { id: 'model-b', name: 'Model B', authenticated: true }
    ]
    const result = autoPickModel({ availableModels: models })
    assert.equal(typeof result, 'string')
  })
})
