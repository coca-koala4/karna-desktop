'use strict'

const { describe, it, assert } = require('../run-tests.cjs')
const {
  prepareNodeForExecution,
  buildNodeExecutionContext,
  buildNodePrompt,
  getNodeCapabilities,
  isArchiveNode,
  isAgentNode,
  getNodeDefinition,
  generateNodeWarnings
} = require('../../electron/writer-os/flow-compiler.cjs')

describe('getNodeDefinition / getNodeCapabilities - 节点定义', () => {
  it('agent 节点能力', () => {
    const caps = getNodeCapabilities('agent')
    assert.ok(caps.includes('model'))
    assert.ok(caps.includes('skills'))
    assert.ok(caps.includes('prompt'))
    assert.ok(caps.includes('tools'))
    assert.ok(caps.includes('mcp'))
    assert.ok(caps.includes('rag'))
  })

  it('archive 节点能力', () => {
    const caps = getNodeCapabilities('archive')
    assert.ok(caps.includes('archive'))
    assert.ok(caps.includes('filesystem'))
    assert.ok(!caps.includes('model'))
    assert.ok(!caps.includes('skills'))
  })

  it('human_confirm 节点能力', () => {
    const caps = getNodeCapabilities('human_confirm')
    assert.ok(caps.includes('human_review'))
    assert.ok(caps.includes('flow_control'))
  })

  it('未知类型返回默认能力', () => {
    const caps = getNodeCapabilities('unknown_type')
    assert.deepEqual(caps, ['debug'])
  })

  it('getNodeDefinition 返回完整定义', () => {
    const def = getNodeDefinition('agent')
    assert.ok(Array.isArray(def.capabilities))
    assert.equal(def.isArchive, false)
    assert.equal(def.isAgent, true)
    assert.equal(def.isHuman, false)
    assert.equal(def.classType, 'agent')
  })
})

describe('isArchiveNode / isAgentNode - 节点类型判断', () => {
  it('archive 是归档节点', () => {
    assert.equal(isArchiveNode('archive'), true)
    assert.equal(isArchiveNode('archive_version'), true)
  })

  it('agent 不是归档节点', () => {
    assert.equal(isArchiveNode('agent'), false)
    assert.equal(isArchiveNode('critic'), false)
  })

  it('agent 是 Agent 节点', () => {
    assert.equal(isAgentNode('agent'), true)
    assert.equal(isAgentNode('critic'), true)
    assert.equal(isAgentNode('tool_agent'), true)
    assert.equal(isAgentNode('llm_judge'), true)
    assert.equal(isAgentNode('scheduler'), true)
  })

  it('input/output 不是 Agent 节点', () => {
    assert.equal(isAgentNode('input'), false)
    assert.equal(isAgentNode('output'), false)
    assert.equal(isAgentNode('archive'), false)
  })

  it('空值处理', () => {
    assert.equal(isArchiveNode(''), false)
    assert.equal(isArchiveNode(null), false)
    assert.equal(isAgentNode(undefined), false)
  })
})

describe('prepareNodeForExecution - 节点执行准备', () => {
  it('Agent 节点完整准备', () => {
    const node = {
      id: 'agent-1',
      data: {
        nodeType: 'agent',
        label: 'Main Agent',
        modelConfig: { mode: 'explicit', modelId: 'gpt-4o' },
        skillsConfig: { mode: 'auto' },
        mcpConfig: { mode: 'disabled' },
        promptConfig: {
          systemPrompt: 'You are helpful.',
          taskPromptTemplate: 'Do: {{input}}'
        }
      }
    }
    const result = prepareNodeForExecution({
      node,
      workflow: {},
      systemDefault: 'default-model'
    })
    assert.equal(result.nodeId, 'agent-1')
    assert.equal(result.nodeType, 'agent')
    assert.equal(result.nodeLabel, 'Main Agent')
    assert.equal(result.isAgent, true)
    assert.equal(result.isArchive, false)
    assert.ok(result.capabilities.length > 0)
    assert.equal(result.resolvedModel, 'gpt-4o')
    assert.ok(result.resolvedSkills)
    assert.ok(result.resolvedMcp)
    assert.ok(result.resolvedBudget)
    assert.ok(result.retryConfig)
    assert.ok(result.timeoutConfig)
    assert.ok(result.reviewConfig)
  })

  it('归档节点准备', () => {
    const node = {
      id: 'arch-1',
      data: {
        nodeType: 'archive',
        label: 'Archive Node'
      }
    }
    const result = prepareNodeForExecution({
      node,
      workflow: {},
      systemDefault: 'default-model'
    })
    assert.equal(result.nodeType, 'archive')
    assert.equal(result.isArchive, true)
    assert.equal(result.isAgent, false)
    assert.ok(result.capabilities.includes('archive'))
  })

  it('旧字段迁移', () => {
    const node = {
      id: 'legacy-1',
      data: {
        nodeType: 'agent',
        model: 'gpt-4',
        skill: 'writing-skill',
        mcp: 'my-mcp'
      }
    }
    const result = prepareNodeForExecution({
      node,
      workflow: {},
      systemDefault: 'default'
    })
    assert.equal(result.migrated, true)
    assert.ok(result.legacyConfig)
    assert.equal(result.resolvedModel, 'gpt-4')
    assert.equal(result.resolvedSkills.mode, 'explicit')
    assert.deepEqual(result.resolvedSkills.selectedIds, ['writing-skill'])
    assert.equal(result.resolvedMcp.mode, 'explicit')
    assert.deepEqual(result.resolvedMcp.selectedIds, ['my-mcp'])
  })

  it('预算配置解析', () => {
    const node = {
      id: 'n1',
      data: {
        nodeType: 'agent',
        budgetConfig: {
          maxInputTokens: 5000,
          maxOutputTokens: 2000,
          maxContextTokens: 4000,
          maxToolCalls: 5,
          maxRetries: 3
        }
      }
    }
    const result = prepareNodeForExecution({ node, workflow: {} })
    assert.equal(result.resolvedBudget.maxInputTokens, 5000)
    assert.equal(result.resolvedBudget.maxOutputTokens, 2000)
    assert.equal(result.resolvedBudget.maxContextTokens, 4000)
    assert.equal(result.resolvedBudget.maxToolCalls, 5)
    assert.equal(result.resolvedBudget.maxRetries, 3)
  })

  it('重试配置解析', () => {
    const node = {
      id: 'n1',
      data: {
        nodeType: 'agent',
        retryConfig: {
          maxRetries: 5,
          retryOnRecoverable: false,
          backoffMs: 500
        }
      }
    }
    const result = prepareNodeForExecution({ node, workflow: {} })
    assert.equal(result.retryConfig.maxRetries, 5)
    assert.equal(result.retryConfig.retryOnRecoverable, false)
    assert.equal(result.retryConfig.backoffMs, 500)
  })

  it('超时配置解析', () => {
    const node = {
      id: 'n1',
      data: {
        nodeType: 'agent',
        timeoutConfig: {
          timeoutMs: 60000,
          onTimeout: 'retry'
        }
      }
    }
    const result = prepareNodeForExecution({ node, workflow: {} })
    assert.equal(result.timeoutConfig.timeoutMs, 60000)
    assert.equal(result.timeoutConfig.onTimeout, 'retry')
  })

  it('审批配置解析', () => {
    const node = {
      id: 'n1',
      data: {
        nodeType: 'agent',
        reviewConfig: {
          requiresReview: false,
          reviewPrompt: 'Check carefully',
          autoApproveOnTimeout: true,
          timeoutMs: 120000
        }
      }
    }
    const result = prepareNodeForExecution({ node, workflow: {} })
    assert.equal(result.reviewConfig.requiresReview, false)
    assert.equal(result.reviewConfig.reviewPrompt, 'Check carefully')
    assert.equal(result.reviewConfig.autoApproveOnTimeout, true)
    assert.equal(result.reviewConfig.timeoutMs, 120000)
  })
})

describe('buildNodeExecutionContext - 上下文构建', () => {
  it('归档节点返回空上下文', async () => {
    const prepared = {
      isArchive: true,
      config: {}
    }
    const result = await buildNodeExecutionContext({
      prepared,
      node: { id: 'n1' },
      workflow: {},
      services: {}
    })
    assert.deepEqual(result.contextPackage.excerpts, [])
    assert.equal(result.contextText, '')
    assert.deepEqual(result.warnings, [])
  })

  it('非归档节点构建上下文', async () => {
    const prepared = {
      isArchive: false,
      config: {
        contextConfig: {
          bindings: [
            {
              id: 'm1',
              sourceType: 'manual_context',
              enabled: true,
              config: { manualText: 'manual context here', title: 'Manual' }
            }
          ]
        }
      }
    }
    const result = await buildNodeExecutionContext({
      prepared,
      node: { id: 'n1' },
      workflow: {},
      input: { text: 'test input' },
      services: {}
    })
    assert.ok(result.contextPackage.excerpts.length > 0)
    assert.ok(result.contextText.length > 0)
    assert.ok(result.contextText.includes('manual context here'))
  })

  it('返回 warnings', async () => {
    const prepared = {
      isArchive: false,
      config: {
        contextConfig: {
          bindings: [
            {
              id: 'v1',
              sourceType: 'vector_collection',
              sourceId: 'kb1',
              enabled: true
            }
          ]
        }
      }
    }
    const result = await buildNodeExecutionContext({
      prepared,
      node: { id: 'n1' },
      workflow: {},
      query: 'test',
      services: {}
    })
    assert.ok(result.warnings.length > 0)
  })
})

describe('buildNodePrompt - Prompt 构建', () => {
  it('有 promptConfig 时正常渲染', () => {
    const prepared = {
      config: {
        nodeType: 'agent',
        promptConfig: {
          systemPrompt: 'You are a helpful assistant.',
          taskPromptTemplate: 'Please process: {{input}}',
          mergeMode: 'append',
          variables: []
        }
      },
      nodeLabel: 'Test Agent',
      resolvedModel: 'gpt-4'
    }
    const result = buildNodePrompt({
      prepared,
      project: { name: 'Test Project' },
      workflow: { name: 'Test Workflow' },
      node: { id: 'n1' },
      agent: { name: 'Agent' },
      input: { text: 'Hello there' },
      contextText: '',
      contextPackage: { excerpts: [] }
    })
    assert.ok(result.systemPrompt)
    assert.ok(result.taskPrompt)
    assert.ok(result.fullPrompt)
    assert.ok(result.tokenEstimate > 0)
    assert.ok(result.sourceSections)
  })

  it('无 promptConfig 时使用 fallback', () => {
    const prepared = {
      config: {
        nodeType: 'agent',
        description: 'Test agent task'
      },
      nodeLabel: 'Test Node',
      resolvedModel: 'gpt-4',
      resolvedSkills: { mode: 'auto', selectedIds: [] },
      resolvedMcp: { mode: 'auto', selectedIds: [] },
      resolvedBudget: { maxOutputTokens: 2000 }
    }
    const result = buildNodePrompt({
      prepared,
      project: { title: 'Project' },
      workflow: { name: 'Workflow' },
      node: { id: 'n1' },
      agent: { name: 'Agent', role: 'Assistant' },
      input: { text: 'test input' },
      contextText: '',
      contextPackage: { excerpts: [] }
    })
    assert.ok(result.taskPrompt)
    assert.ok(result.taskPrompt.length > 0)
    assert.ok(result.tokenEstimate > 0)
  })

  it('包含变量渲染结果', () => {
    const prepared = {
      config: {
        nodeType: 'agent',
        promptConfig: {
          systemPrompt: 'Sys: {{node.name}}',
          taskPromptTemplate: 'Task: {{input}}',
          mergeMode: 'append',
          variables: [{ name: 'customVar', defaultValue: 'defaultVal' }]
        }
      },
      nodeLabel: 'My Node',
      resolvedModel: 'gpt-4'
    }
    const result = buildNodePrompt({
      prepared,
      project: {},
      workflow: {},
      node: { id: 'n1' },
      agent: {},
      input: { text: 'hello' },
      contextText: '',
      contextPackage: { excerpts: [] }
    })
    assert.ok(result.renderedVariables)
    assert.equal(result.renderedVariables.customVar, 'defaultVal')
  })

  it('包含 missingVariables', () => {
    const prepared = {
      config: {
        nodeType: 'agent',
        promptConfig: {
          taskPromptTemplate: '{{missing_var_xyz}}',
          mergeMode: 'append',
          variables: [{ name: 'missing_var_xyz' }]
        }
      },
      nodeLabel: 'Test',
      resolvedModel: 'gpt-4'
    }
    const result = buildNodePrompt({
      prepared,
      project: {},
      workflow: {},
      node: { id: 'n1' },
      agent: {},
      input: {},
      contextText: '',
      contextPackage: { excerpts: [] }
    })
    assert.ok(result.missingVariables.includes('missing_var_xyz'))
  })

  it('包含 upstream 输出', () => {
    const prepared = {
      config: {
        nodeType: 'agent',
        promptConfig: {
          taskPromptTemplate: 'Upstream: {{node.upstream.prev.output}}',
          mergeMode: 'append',
          variables: []
        }
      },
      nodeLabel: 'Test',
      resolvedModel: 'gpt-4'
    }
    const result = buildNodePrompt({
      prepared,
      project: {},
      workflow: {},
      node: { id: 'n1' },
      agent: {},
      input: {},
      upstream: { prev: 'previous output' },
      contextText: '',
      contextPackage: { excerpts: [] }
    })
    assert.ok(result.taskPrompt.includes('previous output'))
  })

  it('包含 artifact 状态', () => {
    const prepared = {
      config: {
        nodeType: 'agent',
        promptConfig: {
          taskPromptTemplate: 'Artifact: {{artifact.content}}',
          mergeMode: 'append',
          variables: []
        }
      },
      nodeLabel: 'Test',
      resolvedModel: 'gpt-4'
    }
    const result = buildNodePrompt({
      prepared,
      project: {},
      workflow: {},
      node: { id: 'n1' },
      agent: {},
      input: {},
      contextText: '',
      contextPackage: { excerpts: [] },
      artifactState: { content: 'artifact content', version: 3 }
    })
    assert.ok(result.taskPrompt.includes('artifact content'))
  })

  it('包含 loop 状态', () => {
    const prepared = {
      config: {
        nodeType: 'agent',
        promptConfig: {
          taskPromptTemplate: 'Round {{loop.round}} / {{loop.max_rounds}}',
          mergeMode: 'append',
          variables: []
        }
      },
      nodeLabel: 'Test',
      resolvedModel: 'gpt-4'
    }
    const result = buildNodePrompt({
      prepared,
      project: {},
      workflow: {},
      node: { id: 'n1' },
      agent: {},
      input: {},
      contextText: '',
      contextPackage: { excerpts: [] },
      loopState: { round: 2, maxRounds: 5 }
    })
    assert.ok(result.taskPrompt.includes('2'))
    assert.ok(result.taskPrompt.includes('5'))
  })

  it('包含 review 状态', () => {
    const prepared = {
      config: {
        nodeType: 'agent',
        promptConfig: {
          taskPromptTemplate: 'Review: {{review.criteria}}',
          mergeMode: 'append',
          variables: []
        }
      },
      nodeLabel: 'Test',
      resolvedModel: 'gpt-4'
    }
    const result = buildNodePrompt({
      prepared,
      project: {},
      workflow: {},
      node: { id: 'n1' },
      agent: {},
      input: {},
      contextText: '',
      contextPackage: { excerpts: [] },
      reviewState: { criteria: 'quality, accuracy' }
    })
    assert.ok(result.taskPrompt.includes('quality, accuracy'))
  })
})

describe('generateNodeWarnings - 节点警告生成', () => {
  it('迁移警告', () => {
    const prepared = { migrated: true, isAgent: true, resolvedModel: 'gpt-4' }
    const warnings = generateNodeWarnings({ prepared })
    assert.ok(warnings.some(w => w.code === 'config_migrated'))
  })

  it('上下文警告', () => {
    const prepared = { migrated: false, isAgent: true, resolvedModel: 'gpt-4' }
    const warnings = generateNodeWarnings({
      prepared,
      contextWarnings: ['Context warning 1', 'Context warning 2']
    })
    assert.ok(warnings.some(w => w.code === 'context_warning'))
    assert.equal(warnings.filter(w => w.code === 'context_warning').length, 2)
  })

  it('凭证警告', () => {
    const prepared = { migrated: false, isAgent: true, resolvedModel: 'gpt-4' }
    const warnings = generateNodeWarnings({
      prepared,
      credentialFindings: [{ key: 'api_key', path: 'data.api_key' }]
    })
    assert.ok(warnings.some(w => w.code === 'credential_found'))
  })

  it('Agent 节点无模型警告', () => {
    const prepared = { migrated: false, isAgent: true, resolvedModel: null }
    const warnings = generateNodeWarnings({ prepared })
    assert.ok(warnings.some(w => w.code === 'no_model'))
  })

  it('非 Agent 节点无模型不警告', () => {
    const prepared = { migrated: false, isAgent: false, isArchive: true, resolvedModel: null }
    const warnings = generateNodeWarnings({ prepared })
    assert.ok(!warnings.some(w => w.code === 'no_model'))
  })
})
