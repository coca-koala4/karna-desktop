'use strict'

const { describe, it, beforeEach, assert } = require('../run-tests.cjs')
const {
  checkToolPermission,
  isHighRiskTool,
  createWritebackProposal,
  approveProposal,
  rejectProposal,
  recordAudit,
  getAuditLog,
  checkWritebackPermission
} = require('../../electron/writer-os/tool-permission-gateway.cjs')

describe('isHighRiskTool - 高风险工具判断', () => {
  it('delete 相关工具是高风险', () => {
    assert.equal(isHighRiskTool('filesystem/delete_file'), true)
    assert.equal(isHighRiskTool('db/remove_record'), true)
  })

  it('write 相关工具是高风险', () => {
    assert.equal(isHighRiskTool('filesystem/write_file'), true)
    assert.equal(isHighRiskTool('editor/overwrite'), true)
  })

  it('exec 相关工具是高风险', () => {
    assert.equal(isHighRiskTool('terminal/exec_command'), true)
    assert.equal(isHighRiskTool('shell/spawn'), true)
  })

  it('eval 相关工具是高风险', () => {
    assert.equal(isHighRiskTool('code/eval'), true)
  })

  it('credential 相关工具是高风险', () => {
    assert.equal(isHighRiskTool('vault/get_credential'), true)
    assert.equal(isHighRiskTool('secrets/read_password'), true)
  })

  it('普通工具不是高风险', () => {
    assert.equal(isHighRiskTool('search/web_search'), false)
    assert.equal(isHighRiskTool('filesystem/read_file'), false)
    assert.equal(isHighRiskTool('calendar/list_events'), false)
  })

  it('action 也参与判断', () => {
    assert.equal(isHighRiskTool('filesystem/file', 'delete'), true)
    assert.equal(isHighRiskTool('filesystem/file', 'read'), false)
  })
})

describe('checkToolPermission - 工具权限检查', () => {
  it('节点没有 tools capability 被拒绝', async () => {
    const node = {
      id: 'n1',
      data: {
        nodeType: 'input',
        label: 'Input',
        capabilities: ['input_schema', 'debug']
      }
    }
    const result = await checkToolPermission({
      node,
      workflow: { id: 'wf1' },
      toolRef: 'some-tool',
      requestedAction: 'execute'
    })
    assert.equal(result.allowed, false)
    assert.ok(result.reason.includes('没有配置工具'))
    assert.equal(result.requiresApproval, false)
  })

  it('mcpConfig disabled 被拒绝', async () => {
    const node = {
      id: 'n1',
      data: {
        nodeType: 'agent',
        label: 'Agent',
        capabilities: ['tools', 'mcp'],
        mcpConfig: { mode: 'disabled', selectedIds: [] },
        toolsConfig: { mode: 'disabled', selectedIds: [] }
      }
    }
    const result = await checkToolPermission({
      node,
      workflow: { id: 'wf1' },
      toolRef: 'server/tool',
      requestedAction: 'call'
    })
    assert.equal(result.allowed, false)
    assert.ok(result.reason.includes('已禁用'))
  })

  it('未绑定工具被拒绝', async () => {
    const node = {
      id: 'n1',
      data: {
        nodeType: 'agent',
        label: 'Agent',
        capabilities: ['tools', 'mcp'],
        mcpConfig: { mode: 'explicit', selectedIds: ['allowed-server'] },
        toolsConfig: { mode: 'auto', selectedIds: [] }
      }
    }
    const result = await checkToolPermission({
      node,
      workflow: { id: 'wf1' },
      toolRef: 'other-server/tool',
      requestedAction: 'call'
    })
    assert.equal(result.allowed, false)
    assert.ok(result.reason.includes('不在'))
    assert.ok(result.reason.includes('白名单'))
  })

  it('白名单内工具允许', async () => {
    const node = {
      id: 'n1',
      data: {
        nodeType: 'agent',
        label: 'Agent',
        capabilities: ['tools', 'mcp'],
        mcpConfig: { mode: 'explicit', selectedIds: ['my-server'] },
        toolsConfig: { mode: 'auto', selectedIds: [] }
      }
    }
    const result = await checkToolPermission({
      node,
      workflow: { id: 'wf1' },
      toolRef: 'my-server/read_file',
      requestedAction: 'call'
    })
    assert.equal(result.allowed, true)
    assert.equal(result.requiresApproval, false)
  })

  it('高风险工具需要审批', async () => {
    const node = {
      id: 'n1',
      data: {
        nodeType: 'agent',
        label: 'Agent',
        capabilities: ['tools', 'mcp'],
        mcpConfig: { mode: 'explicit', selectedIds: ['my-server'] },
        toolsConfig: { mode: 'auto', selectedIds: [] },
        reviewConfig: { requiresReview: true }
      }
    }
    const result = await checkToolPermission({
      node,
      workflow: { id: 'wf1' },
      toolRef: 'my-server/delete_file',
      requestedAction: 'execute'
    })
    assert.equal(result.allowed, true)
    assert.equal(result.requiresApproval, true)
    assert.equal(result.highRisk, true)
  })

  it('通配符 * 匹配所有工具', async () => {
    const node = {
      id: 'n1',
      data: {
        nodeType: 'agent',
        label: 'Agent',
        capabilities: ['mcp', 'tools'],
        mcpConfig: { mode: 'explicit', selectedIds: ['*'] },
        toolsConfig: { mode: 'auto', selectedIds: [] }
      }
    }
    const result = await checkToolPermission({
      node,
      workflow: { id: 'wf1' },
      toolRef: 'any-server/any-tool',
      requestedAction: 'call'
    })
    assert.equal(result.allowed, true)
  })

  it('toolsConfig explicit 模式白名单检查', async () => {
    const node = {
      id: 'n1',
      data: {
        nodeType: 'agent',
        label: 'Agent',
        capabilities: ['tools'],
        mcpConfig: { mode: 'auto', selectedIds: [] },
        toolsConfig: { mode: 'explicit', selectedIds: ['web_search', 'calculator'] }
      }
    }
    const result = await checkToolPermission({
      node,
      workflow: { id: 'wf1' },
      toolRef: 'web_search',
      requestedAction: 'search'
    })
    assert.equal(result.allowed, true)
  })

  it('deniedTools 拒绝匹配的工具', async () => {
    const node = {
      id: 'n1',
      data: {
        nodeType: 'agent',
        label: 'Agent',
        capabilities: ['tools', 'mcp'],
        mcpConfig: { mode: 'explicit', selectedIds: ['server1'] },
        toolsConfig: { mode: 'auto', selectedIds: [] },
        permissions: {
          deniedTools: ['server1/shell_exec']
        }
      }
    }
    const result = await checkToolPermission({
      node,
      workflow: { id: 'wf1' },
      toolRef: 'server1/shell_exec',
      requestedAction: 'call'
    })
    assert.equal(result.allowed, false)
    assert.ok(result.reason.includes('被节点权限规则禁止'))
  })

  it('deniedTools 通配符匹配', async () => {
    const node = {
      id: 'n1',
      data: {
        nodeType: 'agent',
        label: 'Agent',
        capabilities: ['tools', 'mcp'],
        mcpConfig: { mode: 'explicit', selectedIds: ['server1'] },
        toolsConfig: { mode: 'auto', selectedIds: [] },
        permissions: {
          deniedTools: ['server1/*']
        }
      }
    }
    const result = await checkToolPermission({
      node,
      workflow: { id: 'wf1' },
      toolRef: 'server1/anything',
      requestedAction: 'call'
    })
    assert.equal(result.allowed, false)
  })

  it('MCP 服务器离线时拒绝', async () => {
    const node = {
      id: 'n1',
      data: {
        nodeType: 'agent',
        label: 'Agent',
        capabilities: ['tools', 'mcp'],
        mcpConfig: { mode: 'explicit', selectedIds: ['offline-server'] },
        toolsConfig: { mode: 'auto', selectedIds: [] }
      }
    }
    const result = await checkToolPermission({
      node,
      workflow: { id: 'wf1' },
      toolRef: 'offline-server/tool',
      requestedAction: 'call',
      mcpServerStatus: 'offline'
    })
    assert.equal(result.allowed, false)
    assert.ok(result.reason.includes('离线'))
  })
})

describe('createWritebackProposal - 创建写回提案', () => {
  it('创建提案基本字段', () => {
    const proposal = createWritebackProposal({
      workflowId: 'wf1',
      runId: 'run1',
      nodeId: 'node1',
      sourceType: 'vector_collection',
      sourceId: 'kb1',
      operation: 'update',
      diff: { old: 'a', new: 'b' },
      reason: 'Fix typo'
    })
    assert.ok(proposal.id)
    assert.ok(proposal.id.startsWith('wb_'))
    assert.equal(proposal.workflowId, 'wf1')
    assert.equal(proposal.nodeId, 'node1')
    assert.equal(proposal.sourceType, 'vector_collection')
    assert.equal(proposal.operation, 'update')
    assert.equal(proposal.status, 'pending')
    assert.ok(proposal.createdAt)
    assert.equal(proposal.approvedAt, null)
    assert.equal(proposal.rejectedAt, null)
  })

  it('delete 操作是高风险', () => {
    const proposal = createWritebackProposal({
      workflowId: 'wf1',
      sourceType: 'vector_collection',
      sourceId: 'kb1',
      operation: 'delete'
    })
    assert.equal(proposal.riskLevel, 'high')
  })

  it('suggest 操作是低风险', () => {
    const proposal = createWritebackProposal({
      workflowId: 'wf1',
      sourceType: 'living_wiki',
      sourceId: 'wiki1',
      operation: 'suggest'
    })
    assert.equal(proposal.riskLevel, 'low')
  })

  it('soul_profile 是高风险来源', () => {
    const proposal = createWritebackProposal({
      workflowId: 'wf1',
      sourceType: 'soul_profile',
      sourceId: 'soul1',
      operation: 'modify'
    })
    assert.equal(proposal.riskLevel, 'high')
  })
})

describe('approveProposal / rejectProposal - 提案审批', () => {
  it('批准提案', () => {
    const proposal = createWritebackProposal({
      workflowId: 'wf1',
      sourceType: 'living_wiki',
      sourceId: 'wiki1',
      operation: 'update'
    })
    const result = approveProposal(proposal.id, 'user1')
    assert.equal(result.ok, true)
    assert.ok(result.approvedAt)
    assert.equal(result.approvedBy, 'user1')
  })

  it('拒绝提案', () => {
    const proposal = createWritebackProposal({
      workflowId: 'wf1',
      sourceType: 'vector_collection',
      sourceId: 'kb1',
      operation: 'delete'
    })
    const result = rejectProposal(proposal.id, 'Not safe', 'user2')
    assert.equal(result.ok, true)
    assert.ok(result.rejectedAt)
    assert.equal(result.rejectedBy, 'user2')
  })

  it('批准不存在的提案返回错误', () => {
    const result = approveProposal('nonexistent-id')
    assert.equal(result.ok, false)
    assert.ok(result.error)
  })
})

describe('recordAudit / getAuditLog - 审计日志', () => {
  beforeEach(() => {
    const log = getAuditLog()
    log.length = 0
  })

  it('记录审计日志', () => {
    const entry = recordAudit({
      workflowId: 'wf1',
      nodeId: 'n1',
      toolRef: 'test/tool',
      action: 'call',
      decision: 'allow',
      severity: 'info'
    })
    assert.ok(entry.id)
    assert.ok(entry.id.startsWith('audit_'))
    assert.ok(entry.timestamp)
    assert.equal(entry.workflowId, 'wf1')
    assert.equal(entry.decision, 'allow')
  })

  it('获取审计日志', () => {
    recordAudit({ workflowId: 'wf1', nodeId: 'n1', decision: 'allow', severity: 'info' })
    recordAudit({ workflowId: 'wf2', nodeId: 'n2', decision: 'deny', severity: 'warning' })

    const all = getAuditLog()
    assert.ok(all.length >= 2)
  })

  it('按 workflowId 过滤', () => {
    recordAudit({ workflowId: 'wf-a', decision: 'allow', severity: 'info' })
    recordAudit({ workflowId: 'wf-b', decision: 'deny', severity: 'warning' })

    const filtered = getAuditLog({ workflowId: 'wf-a' })
    assert.ok(filtered.every(e => e.workflowId === 'wf-a'))
  })

  it('按 nodeId 过滤', () => {
    recordAudit({ workflowId: 'wf1', nodeId: 'node-a', decision: 'allow', severity: 'info' })
    recordAudit({ workflowId: 'wf1', nodeId: 'node-b', decision: 'deny', severity: 'warning' })

    const filtered = getAuditLog({ nodeId: 'node-a' })
    assert.ok(filtered.every(e => e.nodeId === 'node-a'))
  })

  it('按 severity 过滤', () => {
    recordAudit({ workflowId: 'wf1', decision: 'allow', severity: 'info' })
    recordAudit({ workflowId: 'wf1', decision: 'deny', severity: 'warning' })

    const filtered = getAuditLog({ severity: 'warning' })
    assert.ok(filtered.every(e => e.severity === 'warning'))
  })

  it('最新日志在前', () => {
    const first = recordAudit({ workflowId: 'wf1', decision: 'allow', severity: 'info' })
    const second = recordAudit({ workflowId: 'wf1', decision: 'deny', severity: 'warning' })

    const log = getAuditLog()
    assert.equal(log[0].id, second.id)
  })
})

describe('checkWritebackPermission - 写回权限检查', () => {
  it('read_only 只允许读和建议', () => {
    const node = {
      data: {
        contextConfig: {
          bindings: [
            { sourceType: 'vector_collection', config: { writePermission: 'read_only' } }
          ]
        }
      }
    }
    const readResult = checkWritebackPermission({ node, sourceType: 'vector_collection', operation: 'read' })
    assert.equal(readResult.allowed, true)

    const suggestResult = checkWritebackPermission({ node, sourceType: 'vector_collection', operation: 'suggest' })
    assert.equal(suggestResult.allowed, true)

    const updateResult = checkWritebackPermission({ node, sourceType: 'vector_collection', operation: 'update' })
    assert.equal(updateResult.allowed, false)
  })

  it('suggest_changes 允许 append', () => {
    const node = {
      data: {
        contextConfig: {
          bindings: [
            { sourceType: 'living_wiki', config: { writePermission: 'suggest_changes' } }
          ]
        }
      }
    }
    const result = checkWritebackPermission({ node, sourceType: 'living_wiki', operation: 'append' })
    assert.equal(result.allowed, true)
    assert.equal(result.requiresApproval, false)
  })

  it('write_with_approval 需要审批', () => {
    const node = {
      data: {
        contextConfig: {
          bindings: [
            { sourceType: 'story_bible', config: { writePermission: 'write_with_approval' } }
          ]
        }
      }
    }
    const result = checkWritebackPermission({ node, sourceType: 'story_bible', operation: 'update' })
    assert.equal(result.allowed, true)
    assert.equal(result.requiresApproval, true)
  })

  it('read_write_with_approval 所有操作都允许', () => {
    const node = {
      data: {
        contextConfig: {
          bindings: [
            { sourceType: 'workspace_files', config: { writePermission: 'read_write_with_approval' } }
          ]
        }
      }
    }
    const readResult = checkWritebackPermission({ node, sourceType: 'workspace_files', operation: 'read' })
    assert.equal(readResult.allowed, true)

    const deleteResult = checkWritebackPermission({ node, sourceType: 'workspace_files', operation: 'delete' })
    assert.equal(deleteResult.allowed, true)
    assert.equal(deleteResult.requiresApproval, true)
  })

  it('默认权限基于 sourceType', () => {
    const node = { data: { contextConfig: { bindings: [] } } }

    const vectorResult = checkWritebackPermission({ node, sourceType: 'vector_collection', operation: 'read' })
    assert.equal(vectorResult.allowed, true)
    assert.equal(vectorResult.writePermission, 'read_only')

    const wikiResult = checkWritebackPermission({ node, sourceType: 'living_wiki', operation: 'suggest' })
    assert.equal(wikiResult.allowed, true)
  })
})
