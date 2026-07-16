'use strict'

const { describe, it, assert } = require('../run-tests.cjs')
const {
  estimateTokens,
  deduplicateExcerpts,
  truncateToTokenBudget,
  formatContextForPrompt,
  buildNodeContextPackage
} = require('../../electron/writer-os/node-context-builder.cjs')

describe('estimateTokens - Token 估算', () => {
  it('空文本返回 0', () => {
    assert.equal(estimateTokens(''), 0)
    assert.equal(estimateTokens(null), 0)
    assert.equal(estimateTokens(undefined), 0)
  })

  it('基于字符长度估算', () => {
    const text = 'Hello World'
    const result = estimateTokens(text)
    assert.equal(typeof result, 'number')
    assert.ok(result > 0)
    assert.ok(result < text.length)
  })

  it('长文本估算', () => {
    const longText = 'x'.repeat(1000)
    const result = estimateTokens(longText)
    assert.ok(result > 100)
    assert.ok(result < 1000)
  })
})

describe('deduplicateExcerpts - 去重', () => {
  it('重复摘录被去重', () => {
    const excerpts = [
      { sourceType: 'vector_collection', sourceId: 'kb1', text: 'content a' },
      { sourceType: 'vector_collection', sourceId: 'kb1', text: 'content a' },
      { sourceType: 'vector_collection', sourceId: 'kb1', text: 'content b' }
    ]
    const result = deduplicateExcerpts(excerpts)
    assert.equal(result.length, 2)
  })

  it('不同 sourceId 不被去重', () => {
    const excerpts = [
      { sourceType: 'vector_collection', sourceId: 'kb1', text: 'content a' },
      { sourceType: 'vector_collection', sourceId: 'kb2', text: 'content a' }
    ]
    const result = deduplicateExcerpts(excerpts)
    assert.equal(result.length, 2)
  })

  it('不同 sourceType 不被去重', () => {
    const excerpts = [
      { sourceType: 'vector_collection', sourceId: '1', text: 'content' },
      { sourceType: 'living_wiki', sourceId: '1', text: 'content' }
    ]
    const result = deduplicateExcerpts(excerpts)
    assert.equal(result.length, 2)
  })

  it('空数组返回空数组', () => {
    const result = deduplicateExcerpts([])
    assert.deepEqual(result, [])
  })

  it('前100字符相同即判定为重复', () => {
    const baseText = 'x'.repeat(100)
    const excerpts = [
      { sourceType: 'wiki', sourceId: '1', text: baseText + 'aaa' },
      { sourceType: 'wiki', sourceId: '1', text: baseText + 'bbb' }
    ]
    const result = deduplicateExcerpts(excerpts)
    assert.equal(result.length, 1)
  })
})

describe('truncateToTokenBudget - Token 预算裁剪', () => {
  it('预算足够时不裁剪', () => {
    const excerpts = [
      { text: 'short text 1' },
      { text: 'short text 2' }
    ]
    const result = truncateToTokenBudget(excerpts, 1000)
    assert.equal(result.excerpts.length, 2)
    assert.equal(result.truncated, false)
    assert.equal(typeof result.tokenEstimate, 'number')
  })

  it('超出预算时裁剪', () => {
    const excerpts = [
      { text: 'a'.repeat(1000) },
      { text: 'b'.repeat(1000) },
      { text: 'c'.repeat(1000) }
    ]
    const result = truncateToTokenBudget(excerpts, 300)
    assert.ok(result.truncated)
    assert.ok(result.tokenEstimate <= 300)
  })

  it('部分截断保留 truncated 标记', () => {
    const excerpts = [
      { text: 'a'.repeat(200) },
      { text: 'b'.repeat(1000) }
    ]
    const result = truncateToTokenBudget(excerpts, 250)
    assert.equal(result.excerpts.length, 2)
    assert.equal(result.excerpts[1].truncated, true)
    assert.ok(result.excerpts[1].text.length < 1000)
  })

  it('空输入返回空结果', () => {
    const result = truncateToTokenBudget([], 1000)
    assert.deepEqual(result.excerpts, [])
    assert.equal(result.tokenEstimate, 0)
    assert.equal(result.truncated, false)
  })

  it('使用 excerpt.tokenEstimate 如果存在', () => {
    const excerpts = [
      { text: 'test', tokenEstimate: 100 },
      { text: 'test', tokenEstimate: 200 }
    ]
    const result = truncateToTokenBudget(excerpts, 500)
    assert.equal(result.excerpts.length, 2)
    assert.equal(result.truncated, false)
  })
})

describe('formatContextForPrompt - 上下文格式化', () => {
  it('空上下文返回空字符串', () => {
    assert.equal(formatContextForPrompt(null), '')
    assert.equal(formatContextForPrompt({ excerpts: [] }), '')
  })

  it('格式化包含标题和内容', () => {
    const ctx = {
      excerpts: [
        { sourceType: 'vector_collection', title: 'Doc 1', text: 'Content 1' }
      ],
      citations: []
    }
    const result = formatContextForPrompt(ctx)
    assert.ok(result.includes('--- 上下文参考 ---'))
    assert.ok(result.includes('[vector_collection]'))
    assert.ok(result.includes('Doc 1'))
    assert.ok(result.includes('Content 1'))
  })

  it('包含截断标记', () => {
    const ctx = {
      excerpts: [
        { sourceType: 'wiki', title: 'Doc', text: 'content', truncated: true }
      ],
      citations: []
    }
    const result = formatContextForPrompt(ctx)
    assert.ok(result.includes('内容已截断'))
  })

  it('包含引用来源', () => {
    const ctx = {
      excerpts: [
        { sourceType: 'vector_collection', title: 'Doc 1', text: 'C1' }
      ],
      citations: [
        { sourceType: 'vector_collection', sourceId: '1', title: 'Doc 1' },
        { sourceType: 'vector_collection', sourceId: '2', title: 'Doc 2' }
      ]
    }
    const result = formatContextForPrompt(ctx)
    assert.ok(result.includes('--- 引用来源 ---'))
    assert.ok(result.includes('Doc 1'))
    assert.ok(result.includes('Doc 2'))
  })

  it('引用来源去重', () => {
    const ctx = {
      excerpts: [
        { sourceType: 'wiki', title: 'A', text: 'content' }
      ],
      citations: [
        { sourceType: 'wiki', sourceId: '1', title: 'A' },
        { sourceType: 'wiki', sourceId: '1', title: 'A' }
      ]
    }
    const result = formatContextForPrompt(ctx)
    const matches = result.match(/- \[wiki\] A/g) || []
    assert.equal(matches.length, 1)
  })

  it('多个摘录格式正确', () => {
    const ctx = {
      excerpts: [
        { sourceType: 'wiki', title: 'Wiki 1', text: 'Wiki content 1' },
        { sourceType: 'bible', title: 'Bible 1', text: 'Bible content 1' }
      ],
      citations: []
    }
    const result = formatContextForPrompt(ctx)
    assert.ok(result.includes('Wiki 1'))
    assert.ok(result.includes('Bible 1'))
    assert.ok(result.includes('Wiki content 1'))
    assert.ok(result.includes('Bible content 1'))
  })
})

describe('buildNodeContextPackage - 完整构建', () => {
  it('无绑定返回空包', async () => {
    const node = { data: { contextConfig: { bindings: [] } } }
    const result = await buildNodeContextPackage({
      node,
      workflow: {},
      services: {}
    })
    assert.deepEqual(result.excerpts, [])
    assert.deepEqual(result.citations, [])
    assert.equal(result.tokenEstimate, 0)
    assert.equal(result.truncated, false)
  })

  it('manual_context 来源处理', async () => {
    const node = {
      data: {
        contextConfig: {
          bindings: [
            {
              id: 'manual1',
              sourceType: 'manual_context',
              enabled: true,
              config: {
                title: 'My Context',
                manualText: 'This is manual context content'
              }
            }
          ]
        }
      }
    }
    const result = await buildNodeContextPackage({ node, workflow: {}, services: {} })
    assert.equal(result.excerpts.length, 1)
    assert.equal(result.excerpts[0].sourceType, 'manual_context')
    assert.equal(result.excerpts[0].title, 'My Context')
    assert.equal(result.excerpts[0].text, 'This is manual context content')
  })

  it('upstream_output 来源处理', async () => {
    const node = {
      data: {
        contextConfig: {
          bindings: [
            {
              id: 'up1',
              sourceType: 'upstream_output',
              enabled: true,
              config: { maxTokens: 100 }
            }
          ]
        }
      }
    }
    const result = await buildNodeContextPackage({
      node,
      workflow: {},
      upstream: 'upstream output text here',
      services: {}
    })
    assert.equal(result.excerpts.length, 1)
    assert.equal(result.excerpts[0].sourceType, 'upstream_output')
    assert.ok(result.excerpts[0].text.includes('upstream output'))
  })

  it('vector_collection 服务不可用时返回警告', async () => {
    const node = {
      data: {
        contextConfig: {
          bindings: [
            {
              id: 'vc1',
              sourceType: 'vector_collection',
              sourceId: 'kb1',
              enabled: true,
              retrieval: { topK: 5 }
            }
          ]
        }
      }
    }
    const result = await buildNodeContextPackage({
      node,
      workflow: {},
      query: 'test query',
      services: {}
    })
    assert.equal(result.excerpts.length, 0)
    assert.ok(result.warnings.length > 0)
    assert.ok(result.warnings[0].includes('向量库服务不可用'))
  })

  it('living_wiki 服务不可用时返回警告', async () => {
    const node = {
      data: {
        contextConfig: {
          bindings: [
            {
              id: 'lw1',
              sourceType: 'living_wiki',
              sourceId: 'wiki1',
              enabled: true
            }
          ]
        }
      }
    }
    const result = await buildNodeContextPackage({
      node,
      workflow: {},
      query: 'test',
      services: {}
    })
    assert.equal(result.excerpts.length, 0)
    assert.ok(result.warnings.some(w => w.includes('Living Wiki')))
  })

  it('story_bible 服务不可用时返回警告', async () => {
    const node = {
      data: {
        contextConfig: {
          bindings: [
            {
              id: 'sb1',
              sourceType: 'story_bible',
              sourceId: 'bible1',
              enabled: true
            }
          ]
        }
      }
    }
    const result = await buildNodeContextPackage({
      node,
      workflow: {},
      query: 'test',
      services: {}
    })
    assert.equal(result.excerpts.length, 0)
    assert.ok(result.warnings.some(w => w.includes('剧情圣经')))
  })

  it('narrative_state 服务不可用时返回警告', async () => {
    const node = {
      data: {
        contextConfig: {
          bindings: [
            {
              id: 'ns1',
              sourceType: 'narrative_state',
              sourceId: 'state1',
              enabled: true
            }
          ]
        }
      }
    }
    const result = await buildNodeContextPackage({
      node,
      workflow: {},
      query: 'test',
      services: {}
    })
    assert.equal(result.excerpts.length, 0)
    assert.ok(result.warnings.some(w => w.includes('叙事状态')))
  })

  it('soul_profile 服务不可用时返回警告', async () => {
    const node = {
      data: {
        contextConfig: {
          bindings: [
            {
              id: 'sp1',
              sourceType: 'soul_profile',
              sourceId: 'soul1',
              enabled: true
            }
          ]
        }
      }
    }
    const result = await buildNodeContextPackage({
      node,
      workflow: {},
      services: {}
    })
    assert.equal(result.excerpts.length, 0)
    assert.ok(result.warnings.some(w => w.includes('Soul')))
  })

  it('禁用的绑定被跳过', async () => {
    const node = {
      data: {
        contextConfig: {
          bindings: [
            {
              id: 'm1',
              sourceType: 'manual_context',
              enabled: true,
              config: { manualText: 'enabled' }
            },
            {
              id: 'm2',
              sourceType: 'manual_context',
              enabled: false,
              config: { manualText: 'disabled' }
            }
          ]
        }
      }
    }
    const result = await buildNodeContextPackage({ node, workflow: {}, services: {} })
    assert.equal(result.excerpts.length, 1)
    assert.equal(result.excerpts[0].text, 'enabled')
  })

  it('继承工作流全局上下文', async () => {
    const node = {
      data: {
        contextConfig: {
          inheritWorkflowContext: true,
          bindings: []
        }
      }
    }
    const workflow = {
      id: 'wf1',
      runtimeConfig: {
        globalContext: 'This is global context'
      }
    }
    const result = await buildNodeContextPackage({ node, workflow, services: {} })
    assert.equal(result.excerpts.length, 1)
    assert.equal(result.excerpts[0].sourceType, 'workflow_context')
    assert.ok(result.excerpts[0].text.includes('global context'))
  })

  it('sourceSummary 统计正确', async () => {
    const node = {
      data: {
        contextConfig: {
          bindings: [
            { id: 'm1', sourceType: 'manual_context', enabled: true, config: { manualText: 'a' } },
            { id: 'm2', sourceType: 'manual_context', enabled: true, config: { manualText: 'b' } },
            { id: 'd1', sourceType: 'disabled', enabled: false }
          ]
        }
      }
    }
    const result = await buildNodeContextPackage({ node, workflow: {}, services: {} })
    assert.equal(result.sourceSummary.totalBindings, 3)
    assert.equal(result.sourceSummary.enabledBindings, 2)
    assert.equal(result.sourceSummary.sourceCounts.manual_context, 2)
  })

  it('不支持的来源类型产生警告', async () => {
    const node = {
      data: {
        contextConfig: {
          bindings: [
            { id: 'u1', sourceType: 'unknown_type', sourceId: 'x', enabled: true }
          ]
        }
      }
    }
    const result = await buildNodeContextPackage({ node, workflow: {}, services: {} })
    assert.ok(result.warnings.some(w => w.includes('不支持的上下文来源类型')))
  })

  it('优先级排序正确', async () => {
    const node = {
      data: {
        contextConfig: {
          bindings: [
            { id: 'low', sourceType: 'manual_context', priority: 10, enabled: true, config: { manualText: 'low' } },
            { id: 'high', sourceType: 'manual_context', priority: -1, enabled: true, config: { manualText: 'high' } },
            { id: 'mid', sourceType: 'manual_context', priority: 0, enabled: true, config: { manualText: 'mid' } }
          ]
        }
      }
    }
    const result = await buildNodeContextPackage({ node, workflow: {}, services: {} })
    assert.equal(result.excerpts[0].priority, -1)
    assert.equal(result.excerpts[1].priority, 0)
    assert.equal(result.excerpts[2].priority, 10)
  })
})
