'use strict'

const { describe, it, assert } = require('../run-tests.cjs')
const {
  validateWorkflow,
  compileWorkflow,
  makeWarning
} = require('../../electron/writer-os/workflow-validation.cjs')

describe('makeWarning - 警告格式化', () => {
  it('创建基本警告', () => {
    const w = makeWarning('warning', 'test message', 'node-1')
    assert.equal(w.severity, 'warning')
    assert.equal(w.userMessage, 'test message')
    assert.equal(w.relatedNodeId, 'node-1')
    assert.deepEqual(w.fixSuggestions, [])
  })

  it('创建带修复建议的警告', () => {
    const suggestions = [{ label: 'Fix it' }, { label: 'Ignore' }]
    const w = makeWarning('error', 'bad thing', null, suggestions)
    assert.equal(w.severity, 'error')
    assert.deepEqual(w.fixSuggestions, suggestions)
  })

  it('relatedNodeId 不传为 undefined', () => {
    const w = makeWarning('info', 'info msg')
    assert.equal(w.relatedNodeId, undefined)
  })
})

describe('validateWorkflow - 工作流验证', () => {
  it('空工作流返回错误', () => {
    const result = validateWorkflow({ nodes: [], edges: [] })
    assert.equal(result.valid, false)
    assert.ok(result.errors.length > 0)
    assert.equal(result.stats.nodeCount, 0)
    assert.equal(result.stats.edgeCount, 0)
  })

  it('正常工作流（无错误）', () => {
    const workflow = {
      nodes: [
        { id: 'start', data: { nodeType: 'input', isStart: true, label: 'Start' } },
        { id: 'agent1', data: { nodeType: 'agent', label: 'Agent 1' } },
        { id: 'output1', data: { nodeType: 'output', label: 'Output' } }
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'agent1' },
        { id: 'e2', source: 'agent1', target: 'output1' }
      ]
    }
    const result = validateWorkflow(workflow)
    assert.equal(result.valid, true)
    assert.equal(result.errors.length, 0)
    assert.equal(result.stats.nodeCount, 3)
    assert.equal(result.stats.edgeCount, 2)
    assert.equal(result.stats.startNodeCount, 1)
    assert.equal(result.stats.outputNodeCount, 1)
  })

  it('孤儿节点警告', () => {
    const workflow = {
      nodes: [
        { id: 'n1', data: { nodeType: 'agent', isStart: true } },
        { id: 'n2', data: { nodeType: 'agent' } }
      ],
      edges: []
    }
    const result = validateWorkflow(workflow)
    assert.equal(result.stats.orphanCount, 1)
    assert.ok(result.warnings.some(w => w.userMessage.includes('没有任何连线')))
  })

  it('循环检测 - 简单循环', () => {
    const workflow = {
      nodes: [
        { id: 'n1', data: { nodeType: 'agent', isStart: true } },
        { id: 'n2', data: { nodeType: 'agent' } }
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n1' }
      ]
    }
    const result = validateWorkflow(workflow)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.userMessage.includes('循环依赖')))
  })

  it('循环检测 - 无循环', () => {
    const workflow = {
      nodes: [
        { id: 'n1', data: { nodeType: 'agent', isStart: true } },
        { id: 'n2', data: { nodeType: 'agent' } },
        { id: 'n3', data: { nodeType: 'output' } }
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' }
      ]
    }
    const result = validateWorkflow(workflow)
    assert.equal(result.valid, true)
    assert.ok(!result.errors.some(e => e.userMessage.includes('循环依赖')))
  })

  it('凭证检测 - 工作流保存了 api key', () => {
    const workflow = {
      nodes: [
        {
          id: 'n1',
          data: {
            nodeType: 'agent',
            isStart: true,
            api_key: 'sk-abcdefghijklmnopqrst'
          }
        }
      ],
      edges: []
    }
    const result = validateWorkflow(workflow)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.userMessage.includes('凭证')))
    assert.ok(result.stats.credentialFindings > 0)
  })

  it('归档节点定义不包含 AI 资源能力', () => {
    const { getNodeCapabilities, isArchiveNode } = require('../../electron/writer-os/node-capabilities.cjs')
    const caps = getNodeCapabilities('archive')
    assert.equal(isArchiveNode('archive'), true)
    assert.ok(!caps.includes('model'))
    assert.ok(!caps.includes('skills'))
    assert.ok(!caps.includes('mcp'))
    assert.ok(!caps.includes('soul'))
  })

  it('写回节点需要人工确认警告', () => {
    const workflow = {
      nodes: [
        {
          id: 'n1',
          data: {
            nodeType: 'agent',
            isStart: true,
            contextConfig: {
              bindings: [
                {
                  id: 'b1',
                  sourceType: 'vector_collection',
                  sourceId: 'kb1',
                  config: { writePermission: 'write_with_approval' }
                }
              ]
            }
          }
        }
      ],
      edges: []
    }
    const result = validateWorkflow(workflow)
    assert.ok(result.warnings.some(w => w.userMessage.includes('写回')))
    assert.equal(result.stats.writebackBindingCount, 1)
  })

  it('缺少起始节点警告', () => {
    const workflow = {
      nodes: [
        { id: 'n1', data: { nodeType: 'agent' } },
        { id: 'n2', data: { nodeType: 'output' } }
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' }
      ]
    }
    const result = validateWorkflow(workflow)
    assert.equal(result.stats.startNodeCount, 0)
    assert.ok(result.warnings.some(w => w.userMessage.includes('起始节点')))
  })

  it('缺少输出节点警告', () => {
    const workflow = {
      nodes: [
        { id: 'n1', data: { nodeType: 'agent', isStart: true } },
        { id: 'n2', data: { nodeType: 'agent' } }
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' }
      ]
    }
    const result = validateWorkflow(workflow)
    assert.equal(result.stats.outputNodeCount, 0)
    assert.ok(result.warnings.some(w => w.userMessage.includes('输出/归档节点')))
  })

  it('连线引用不存在的节点', () => {
    const workflow = {
      nodes: [
        { id: 'n1', data: { nodeType: 'agent', isStart: true } }
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'nonexistent' }
      ]
    }
    const result = validateWorkflow(workflow)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.userMessage.includes('不存在的目标节点')))
  })

  it('旧版本配置警告', () => {
    const workflow = {
      nodes: [
        {
          id: 'n1',
          data: {
            nodeType: 'agent',
            isStart: true,
            legacyConfig: { model: 'old-model' }
          }
        }
      ],
      edges: []
    }
    const result = validateWorkflow(workflow)
    assert.ok(result.warnings.some(w => w.userMessage.includes('旧版本配置')))
  })

  it('Agent 节点指定模式但未选模型', () => {
    const workflow = {
      nodes: [
        {
          id: 'n1',
          data: {
            nodeType: 'agent',
            isStart: true,
            modelConfig: { mode: 'explicit' }
          }
        }
      ],
      edges: []
    }
    const result = validateWorkflow(workflow)
    assert.equal(result.valid, false)
    assert.ok(result.errors.some(e => e.userMessage.includes('指定模型但未选择模型')))
  })

  it('上下文绑定未指定来源ID警告', () => {
    const workflow = {
      nodes: [
        {
          id: 'n1',
          data: {
            nodeType: 'agent',
            isStart: true,
            contextConfig: {
              bindings: [
                { sourceType: 'vector_collection', enabled: true }
              ]
            }
          }
        }
      ],
      edges: []
    }
    const result = validateWorkflow(workflow)
    assert.ok(result.warnings.some(w => w.userMessage.includes('未指定来源ID')))
  })

  it('最大上下文 Token 过大警告', () => {
    const workflow = {
      nodes: [
        {
          id: 'n1',
          data: {
            nodeType: 'agent',
            isStart: true,
            contextConfig: { maxContextTokens: 100000 }
          }
        }
      ],
      edges: []
    }
    const result = validateWorkflow(workflow)
    assert.ok(result.warnings.some(w => w.userMessage.includes('最大上下文Token设置过大')))
  })

  it('人工确认节点无输出连线警告', () => {
    const workflow = {
      nodes: [
        {
          id: 'n1',
          data: {
            nodeType: 'human_confirm',
            isStart: true
          }
        }
      ],
      edges: []
    }
    const result = validateWorkflow(workflow)
    assert.ok(result.warnings.some(w => w.userMessage.includes('人工确认节点')))
  })

  it('null/undefined 工作流处理', () => {
    const result1 = validateWorkflow(null)
    assert.equal(result1.valid, false)
    assert.equal(result1.stats.nodeCount, 0)

    const result2 = validateWorkflow(undefined)
    assert.equal(result2.valid, false)
  })
})

describe('compileWorkflow - 工作流编译', () => {
  it('编译成功', () => {
    const workflow = {
      id: 'wf-1',
      nodes: [
        { id: 'n1', data: { nodeType: 'input', isStart: true, label: 'Input' }, position: { x: 0, y: 0 } },
        { id: 'n2', data: { nodeType: 'agent', label: 'Agent' }, position: { x: 100, y: 0 } },
        { id: 'n3', data: { nodeType: 'output', label: 'Output' }, position: { x: 200, y: 0 } }
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' }
      ]
    }
    const result = compileWorkflow(workflow)
    assert.equal(result.id, 'wf-1')
    assert.equal(result.valid, true)
    assert.equal(result.nodes.length, 3)
    assert.equal(result.edges.length, 2)
    assert.ok(result.compiled_at)
    assert.ok(result.entryNodes.length > 0)
    assert.ok(result.validation)
  })

  it('编译失败（有错误）', () => {
    const workflow = {
      id: 'wf-bad',
      nodes: [
        {
          id: 'n1',
          data: {
            nodeType: 'agent',
            isStart: true,
            api_key: 'sk-secret12345678'
          }
        }
      ],
      edges: []
    }
    const result = compileWorkflow(workflow)
    assert.equal(result.valid, false)
    assert.ok(result.validation.errors.length > 0)
  })

  it('节点包含 capabilities 字段', () => {
    const workflow = {
      id: 'wf-1',
      nodes: [
        { id: 'n1', data: { nodeType: 'agent', isStart: true } }
      ],
      edges: []
    }
    const result = compileWorkflow(workflow)
    const node = result.nodes[0]
    assert.ok(Array.isArray(node.capabilities))
    assert.ok(node.capabilities.length > 0)
    assert.ok(node.capabilities.includes('model'))
  })

  it('旧字段迁移在编译时执行', () => {
    const workflow = {
      id: 'wf-legacy',
      nodes: [
        {
          id: 'n1',
          data: {
            nodeType: 'agent',
            isStart: true,
            model: 'gpt-4'
          }
        }
      ],
      edges: []
    }
    const result = compileWorkflow(workflow)
    const node = result.nodes[0]
    assert.ok(node.data.modelConfig)
    assert.equal(node.data.modelConfig.mode, 'explicit')
    assert.equal(node.data.modelConfig.modelId, 'gpt-4')
  })

  it('entryNodes 包含起始节点', () => {
    const workflow = {
      id: 'wf-1',
      nodes: [
        { id: 'start', data: { nodeType: 'input', isStart: true } },
        { id: 'agent', data: { nodeType: 'agent' } }
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'agent' }
      ]
    }
    const result = compileWorkflow(workflow)
    assert.ok(result.entryNodes.includes('start'))
  })

  it('边的属性被保留', () => {
    const workflow = {
      id: 'wf-1',
      nodes: [
        { id: 'n1', data: { nodeType: 'agent', isStart: true } },
        { id: 'n2', data: { nodeType: 'output' } }
      ],
      edges: [
        {
          id: 'e1',
          source: 'n1',
          target: 'n2',
          sourceHandle: 'out',
          targetHandle: 'in',
          type: 'smoothstep',
          label: 'yes',
          data: { condition: 'true' }
        }
      ]
    }
    const result = compileWorkflow(workflow)
    const edge = result.edges[0]
    assert.equal(edge.sourceHandle, 'out')
    assert.equal(edge.targetHandle, 'in')
    assert.equal(edge.type, 'smoothstep')
    assert.equal(edge.label, 'yes')
    assert.deepEqual(edge.data, { condition: 'true' })
  })
})
