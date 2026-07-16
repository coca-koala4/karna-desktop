'use strict'

const { describe, it, assert } = require('../run-tests.cjs')
const {
  estimateTokens,
  substituteVariables,
  mergePrompts,
  renderPrompt,
  renderPromptWithFallback,
  formatContextPackage,
  detectAndRedactCredentials,
  buildVariableMap,
  extractVariableNames,
  DEFAULT_PROMPT_CONFIG
} = require('../../electron/writer-os/prompt-renderer.cjs')

describe('estimateTokens - Token 估算', () => {
  it('空文本返回 0', () => {
    assert.equal(estimateTokens(''), 0)
    assert.equal(estimateTokens(null), 0)
    assert.equal(estimateTokens(undefined), 0)
  })

  it('纯中文文本估算', () => {
    const result = estimateTokens('你好世界')
    assert.equal(typeof result, 'number')
    assert.ok(result > 0)
    assert.ok(result < 20)
  })

  it('纯英文文本估算', () => {
    const result = estimateTokens('Hello World')
    assert.equal(typeof result, 'number')
    assert.ok(result > 0)
    assert.ok(result < 10)
  })

  it('混合文本估算', () => {
    const result = estimateTokens('你好 Hello 世界 World')
    assert.equal(typeof result, 'number')
    assert.ok(result > 0)
  })

  it('长文本估算', () => {
    const longText = '中'.repeat(1000) + 'a'.repeat(1000)
    const result = estimateTokens(longText)
    assert.ok(result > 100)
  })
})

describe('substituteVariables - 变量替换', () => {
  it('简单变量替换', () => {
    const result = substituteVariables('Hello {{name}}', { name: 'World' })
    assert.equal(result.text, 'Hello World')
    assert.deepEqual(result.missingVariables, [])
  })

  it('多个变量替换', () => {
    const result = substituteVariables('{{greeting}} {{name}}!', { greeting: 'Hello', name: 'World' })
    assert.equal(result.text, 'Hello World!')
    assert.deepEqual(result.missingVariables, [])
  })

  it('嵌套变量（点路径）', () => {
    const result = substituteVariables('User: {{user.name}}', { user: { name: 'Alice' } })
    assert.equal(result.text, 'User: Alice')
  })

  it('缺失变量 - empty 策略（默认）', () => {
    const result = substituteVariables('Hello {{name}}', {})
    assert.equal(result.text, 'Hello ')
    assert.deepEqual(result.missingVariables, ['name'])
  })

  it('缺失变量 - error 策略', () => {
    assert.throws(() => {
      substituteVariables('Hello {{name}}', {}, { missingVariablePolicy: 'error' })
    }, /Missing required variable/)
  })

  it('缺失变量 - keep_placeholder 策略', () => {
    const result = substituteVariables('Hello {{name}}', {}, { missingVariablePolicy: 'keep_placeholder' })
    assert.equal(result.text, 'Hello {{name}}')
    assert.deepEqual(result.missingVariables, ['name'])
  })

  it('对象值 JSON 序列化', () => {
    const result = substituteVariables('Data: {{data}}', { data: { a: 1, b: 2 } })
    assert.ok(result.text.includes('"a": 1'))
    assert.ok(result.text.includes('"b": 2'))
  })
})

describe('mergePrompts - Prompt 合并', () => {
  it('replace 模式 - 只保留最后一个', () => {
    const result = mergePrompts(['first', 'second', 'third'], 'replace')
    assert.equal(result, 'third')
  })

  it('prepend 模式 - 逆序连接', () => {
    const result = mergePrompts(['first', 'second'], 'prepend')
    assert.ok(result.startsWith('second'))
    assert.ok(result.includes('first'))
  })

  it('append 模式 - 顺序连接', () => {
    const result = mergePrompts(['first', 'second'], 'append')
    assert.ok(result.startsWith('first'))
    assert.ok(result.includes('second'))
  })

  it('sections 模式 - 带标签', () => {
    const sections = ['a', 'b', 'c', 'd', 'e']
    const result = mergePrompts(sections, 'sections')
    assert.ok(result.includes('--- '))
  })

  it('空输入返回空字符串', () => {
    assert.equal(mergePrompts([], 'append'), '')
    assert.equal(mergePrompts(['', '  '], 'append'), '')
  })

  it('默认模式是 sections', () => {
    const result = mergePrompts(['a', 'b', 'c', 'd', 'e'])
    assert.ok(result.includes('--- '))
  })
})

describe('renderPrompt - 完整渲染', () => {
  it('完整渲染流程', () => {
    const result = renderPrompt({
      promptConfig: {
        ...DEFAULT_PROMPT_CONFIG,
        systemPrompt: '你是一个助手。',
        taskPromptTemplate: '请处理：{{input}}',
        mergeMode: 'append'
      },
      nodeInputs: { text: 'Hello World' }
    })
    assert.ok(result.systemPrompt)
    assert.ok(result.taskPrompt)
    assert.equal(typeof result.estimatedTokens, 'number')
    assert.ok(result.estimatedTokens > 0)
  })

  it('包含 resolvedVariables', () => {
    const result = renderPrompt({
      promptConfig: {
        ...DEFAULT_PROMPT_CONFIG,
        taskPromptTemplate: '{{foo}}',
        variables: [{ name: 'foo', defaultValue: 'bar' }]
      }
    })
    assert.equal(result.resolvedVariables.foo, 'bar')
  })

  it('包含 missingVariables', () => {
    const result = renderPrompt({
      promptConfig: {
        ...DEFAULT_PROMPT_CONFIG,
        taskPromptTemplate: '{{missing_var}}',
        variables: [{ name: 'missing_var' }]
      }
    })
    assert.ok(result.missingVariables.includes('missing_var'))
  })

  it('包含 sourceSections', () => {
    const result = renderPrompt({
      promptConfig: {
        ...DEFAULT_PROMPT_CONFIG,
        systemPrompt: 'sys',
        taskPromptTemplate: 'task'
      }
    })
    assert.ok(result.sourceSections.systemPrompt)
    assert.ok(result.sourceSections.taskPrompt)
    assert.equal(typeof result.sourceSections.systemPrompt.tokenEstimate, 'number')
  })
})

describe('renderPromptWithFallback - 带降级渲染', () => {
  it('无配置时使用默认渲染', () => {
    const result = renderPromptWithFallback({
      nodeInputs: { text: 'test input' }
    })
    assert.ok(result.systemPrompt)
    assert.ok(result.taskPrompt)
    assert.ok(result.taskPrompt.includes('test input'))
  })

  it('有配置时正常渲染', () => {
    const result = renderPromptWithFallback({
      promptConfig: {
        ...DEFAULT_PROMPT_CONFIG,
        systemPrompt: 'custom sys',
        taskPromptTemplate: 'custom task: {{input}}'
      },
      nodeInputs: { text: 'hello' }
    })
    assert.ok(result.systemPrompt.includes('custom sys'))
    assert.ok(result.taskPrompt.includes('custom task'))
  })
})

describe('formatContextPackage - 上下文包格式化', () => {
  it('空上下文返回空字符串', () => {
    assert.equal(formatContextPackage(null), '')
    assert.equal(formatContextPackage({ excerpts: [] }), '')
  })

  it('格式化多个摘录', () => {
    const ctx = {
      excerpts: [
        { sourceType: 'vector_collection', title: 'Doc 1', text: 'Content 1' },
        { sourceType: 'vector_collection', title: 'Doc 2', text: 'Content 2', truncated: true }
      ],
      citations: [
        { sourceType: 'vector_collection', sourceId: '1', title: 'Doc 1' },
        { sourceType: 'vector_collection', sourceId: '2', title: 'Doc 2' }
      ]
    }
    const result = formatContextPackage(ctx)
    assert.ok(result.includes('Doc 1'))
    assert.ok(result.includes('Content 1'))
    assert.ok(result.includes('内容已截断'))
    assert.ok(result.includes('[vector_collection]'))
  })

  it('自定义模板', () => {
    const ctx = {
      excerpts: [{ sourceType: 'wiki', title: 'T', text: 'C' }],
      citations: []
    }
    const template = '=== Context ===\n{{#each excerpts}}\n- {{title}}: {{text}}\n{{/each}}'
    const result = formatContextPackage(ctx, template)
    assert.ok(result.includes('=== Context ==='))
    assert.ok(result.includes('T'))
  })
})

describe('detectAndRedactCredentials - 凭证检测与脱敏', () => {
  it('检测 API Key', () => {
    const input = 'api_key: sk-abcdefghijklmnopqrst'
    const result = detectAndRedactCredentials(input)
    assert.ok(result.includes('[REDACTED]'))
    assert.ok(!result.includes('sk-abcdefghijklmnopqrst'))
  })

  it('检测 password', () => {
    const input = 'password = "mysecretpassword123"'
    const result = detectAndRedactCredentials(input)
    assert.ok(result.includes('[REDACTED]'))
  })

  it('检测 token', () => {
    const input = 'auth_token: abcdefghij1234567890'
    const result = detectAndRedactCredentials(input)
    assert.ok(result.includes('[REDACTED]'))
  })

  it('检测 Bearer token', () => {
    const input = 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456'
    const result = detectAndRedactCredentials(input)
    assert.ok(result.includes('[REDACTED]'))
  })

  it('检测私钥', () => {
    const input = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow...\n-----END RSA PRIVATE KEY-----'
    const result = detectAndRedactCredentials(input)
    assert.ok(result.includes('[REDACTED]'))
  })

  it('非字符串输入原样返回', () => {
    assert.equal(detectAndRedactCredentials(123), 123)
    assert.deepEqual(detectAndRedactCredentials({ a: 1 }), { a: 1 })
  })

  it('普通文本不受影响', () => {
    const input = 'Hello World, this is normal text.'
    assert.equal(detectAndRedactCredentials(input), input)
  })
})

describe('buildVariableMap - 变量映射构建', () => {
  it('构建 input 变量', () => {
    const map = buildVariableMap({ nodeInputs: { text: 'hello' } })
    assert.equal(map['input'], 'hello')
    assert.equal(map['input.text'], 'hello')
  })

  it('构建 node 变量', () => {
    const map = buildVariableMap({
      node: { id: 'node1', name: 'Test Node', task: 'Do something' }
    })
    assert.equal(map['node.id'], 'node1')
    assert.equal(map['node.name'], 'Test Node')
    assert.equal(map['node.task'], 'Do something')
  })

  it('构建 workflow 变量', () => {
    const map = buildVariableMap({
      workflow: { id: 'wf1', name: 'Test Workflow' }
    })
    assert.equal(map['workflow.id'], 'wf1')
    assert.equal(map['workflow.name'], 'Test Workflow')
  })

  it('构建 workflow.variables 变量', () => {
    const map = buildVariableMap({
      workflowVariables: { foo: 'bar', baz: 42 }
    })
    assert.equal(map['workflow.variables.foo'], 'bar')
    assert.equal(map['workflow.variables.baz'], 42)
  })

  it('构建 upstream 变量', () => {
    const map = buildVariableMap({
      upstreamOutputs: { node1: 'output1', node2: 'output2' }
    })
    assert.equal(map['node.upstream.node1.output'], 'output1')
    assert.equal(map['node.upstream.node2.output'], 'output2')
  })

  it('构建 loop 变量', () => {
    const map = buildVariableMap({
      loopState: { round: 3, maxRounds: 10 }
    })
    assert.equal(map['loop.round'], 3)
    assert.equal(map['loop.max_rounds'], 10)
  })

  it('构建 artifact 变量', () => {
    const map = buildVariableMap({
      artifactState: { content: 'artifact content', version: 2, title: 'My Artifact' }
    })
    assert.equal(map['artifact.content'], 'artifact content')
    assert.equal(map['artifact.version'], 2)
    assert.equal(map['artifact.title'], 'My Artifact')
  })

  it('构建 review 变量', () => {
    const map = buildVariableMap({
      reviewState: { criteria: 'quality', revisionBrief: 'fix bugs', previousReport: 'good' }
    })
    assert.equal(map['review.criteria'], 'quality')
    assert.equal(map['review.revision_brief'], 'fix bugs')
    assert.equal(map['review.previous_report'], 'good')
  })

  it('构建 runtime 变量', () => {
    const map = buildVariableMap({
      runtimeState: { date: '2024-01-01', workspaceName: 'my-workspace' }
    })
    assert.equal(map['runtime.date'], '2024-01-01')
    assert.equal(map['runtime.workspace_name'], 'my-workspace')
  })

  it('构建 context 变量', () => {
    const map = buildVariableMap({
      contextPackage: {
        excerpts: [
          { sourceType: 'vector_collection', title: 'Doc', text: 'content' }
        ]
      }
    })
    assert.ok(map['context.rag'])
    assert.ok(map['context.rag'].includes('Doc'))
  })
})

describe('extractVariableNames - 提取变量名', () => {
  it('提取简单变量', () => {
    const names = extractVariableNames('Hello {{name}}, welcome to {{place}}')
    assert.deepEqual(names, ['name', 'place'])
  })

  it('提取嵌套变量', () => {
    const names = extractVariableNames('{{user.name}} - {{user.email}}')
    assert.deepEqual(names, ['user.name', 'user.email'])
  })

  it('空模板返回空数组', () => {
    assert.deepEqual(extractVariableNames(''), [])
    assert.deepEqual(extractVariableNames(null), [])
  })

  it('去重变量名', () => {
    const names = extractVariableNames('{{x}} {{x}} {{y}} {{x}}')
    assert.deepEqual(names, ['x', 'y'])
  })
})
