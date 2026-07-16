'use strict'

const HIGH_RISK_TOOL_PATTERNS = /(delete|remove|rm|write|overwrite|exec|shell|spawn|eval|upload|download|credential|password|key|token)/i

const WRITEBACK_PERMISSION_DEFAULTS = {
  vector_collection: 'read_only',
  living_wiki: 'suggest_changes',
  story_bible: 'read_only',
  narrative_state: 'suggest_changes',
  soul_profile: 'read_only',
  workspace_files: 'read_write_with_approval'
}

const AUDIT_LOG = []
const MAX_AUDIT_LOG = 1000

function now() {
  return new Date().toISOString()
}

function genId() {
  return `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function recordAudit(entry) {
  const record = { id: genId(), timestamp: now(), ...entry }
  AUDIT_LOG.unshift(record)
  if (AUDIT_LOG.length > MAX_AUDIT_LOG) AUDIT_LOG.pop()
  return record
}

function getAuditLog(filter = {}) {
  let results = [...AUDIT_LOG]
  if (filter.workflowId) results = results.filter(r => r.workflowId === filter.workflowId)
  if (filter.nodeId) results = results.filter(r => r.nodeId === filter.nodeId)
  if (filter.since) results = results.filter(r => r.timestamp >= filter.since)
  if (filter.severity) results = results.filter(r => r.severity === filter.severity)
  return results
}

function isHighRiskTool(toolRef, action) {
  const combined = `${toolRef} ${action || ''}`
  return HIGH_RISK_TOOL_PATTERNS.test(combined)
}

async function checkToolPermission({
  project,
  workflow,
  node,
  toolRef,
  requestedAction,
  args,
  mcpServerStatus
}) {
  const nodeData = node?.data || {}
  const nodeType = nodeData.nodeType || node?.type
  const nodeId = node?.id
  const workflowId = workflow?.id

  const auditBase = {
    workflowId,
    nodeId,
    nodeType,
    toolRef,
    action: requestedAction,
    projectId: project?.id
  }

  const capabilities = nodeData.capabilities || []
  const hasToolsCapability = capabilities.includes('tools') || capabilities.includes('mcp')
  if (!hasToolsCapability) {
    const reason = `节点「${nodeData.label || nodeId}」类型为「${nodeType}」，没有配置工具/MCP调用权限`
    recordAudit({ ...auditBase, decision: 'deny', reason, severity: 'warning' })
    return { allowed: false, reason, requiresApproval: false }
  }

  const mcpConfig = nodeData.mcpConfig || { mode: 'auto', selectedIds: [] }
  const toolsConfig = nodeData.toolsConfig || { mode: 'auto', selectedIds: [] }

  if (mcpConfig.mode === 'disabled' && toolsConfig.mode === 'disabled') {
    const reason = `节点「${nodeData.label || nodeId}」已禁用工具/MCP调用`
    recordAudit({ ...auditBase, decision: 'deny', reason, severity: 'warning' })
    return { allowed: false, reason, requiresApproval: false }
  }

  if (mcpConfig.mode === 'explicit' && mcpConfig.selectedIds?.length > 0) {
    const allowed = mcpConfig.selectedIds.some(id => {
      const idStr = String(id)
      return toolRef === idStr || toolRef.startsWith(`${idStr}/`) || idStr === '*'
    })
    if (!allowed) {
      const reason = `MCP工具「${toolRef}」不在节点「${nodeData.label || nodeId}」绑定的白名单中`
      recordAudit({ ...auditBase, decision: 'deny', reason, severity: 'warning' })
      return { allowed: false, reason, requiresApproval: false }
    }
  }

  if (toolsConfig.mode === 'explicit' && toolsConfig.selectedIds?.length > 0) {
    const allowed = toolsConfig.selectedIds.some(id => toolRef === String(id))
    if (!allowed) {
      const reason = `工具「${toolRef}」不在节点「${nodeData.label || nodeId}」绑定的工具白名单中`
      recordAudit({ ...auditBase, decision: 'deny', reason, severity: 'warning' })
      return { allowed: false, reason, requiresApproval: false }
    }
  }

  const nodePermissions = nodeData.permissions || {}
  if (nodePermissions.deniedTools?.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
      return regex.test(toolRef)
    }
    return toolRef === pattern
  })) {
    const reason = `工具「${toolRef}」被节点权限规则禁止`
    recordAudit({ ...auditBase, decision: 'deny', reason, severity: 'warning' })
    return { allowed: false, reason, requiresApproval: false }
  }

  if (mcpServerStatus === 'offline') {
    const reason = `MCP服务器「${toolRef.split('/')[0]}」当前离线`
    recordAudit({ ...auditBase, decision: 'deny', reason, severity: 'error' })
    return { allowed: false, reason, requiresApproval: false }
  }

  const highRisk = isHighRiskTool(toolRef, requestedAction)
  if (highRisk) {
    const requiresApproval = nodePermissions.requireApprovalFor?.some(pattern => {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$')
        return regex.test(toolRef)
      }
      return toolRef === pattern
    }) !== false

    if (nodeData.reviewConfig?.requiresReview !== false && requiresApproval) {
      const reason = `高风险工具「${toolRef}」执行「${requestedAction}」需要用户确认`
      recordAudit({ ...auditBase, decision: 'require_approval', reason, severity: 'warning', highRisk: true })
      return { allowed: true, reason, requiresApproval: true, highRisk: true }
    }
  }

  recordAudit({ ...auditBase, decision: 'allow', severity: 'info', highRisk })
  return { allowed: true, requiresApproval: false, highRisk }
}

function createWritebackProposal({
  workflowId,
  runId,
  nodeId,
  sourceType,
  sourceId,
  operation,
  diff,
  reason
}) {
  const riskMap = {
    soul_profile: 'high',
    story_bible: 'medium',
    narrative_state: 'medium',
    living_wiki: 'low',
    vector_collection: 'low',
    workspace_files: 'high'
  }
  const opRisk = {
    delete: 'high',
    update: operation === 'delete' ? 'high' : 'medium',
    append: 'low',
    suggest: 'low'
  }
  const riskLevel = opRisk[operation] || riskMap[sourceType] || 'medium'

  const proposal = {
    id: `wb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    workflowId,
    runId,
    nodeId,
    sourceType,
    sourceId,
    operation,
    diff,
    reason,
    riskLevel,
    status: 'pending',
    createdAt: now(),
    approvedAt: null,
    rejectedAt: null,
    reviewedBy: null
  }

  recordAudit({
    workflowId,
    nodeId,
    action: 'writeback_proposal',
    decision: 'pending',
    severity: riskLevel === 'high' ? 'warning' : 'info',
    proposalId: proposal.id,
    sourceType,
    sourceId,
    operation
  })

  return proposal
}

function checkWritebackPermission({ node, sourceType, operation }) {
  const nodeData = node?.data || {}
  const contextConfig = nodeData.contextConfig || {}

  const bindings = Array.isArray(contextConfig.bindings)
    ? contextConfig.bindings.filter(b => b.sourceType === sourceType)
    : []

  let writePermission = WRITEBACK_PERMISSION_DEFAULTS[sourceType] || 'read_only'

  for (const binding of bindings) {
    if (binding.config?.writePermission) {
      writePermission = binding.config.writePermission
    }
  }

  if (sourceType === 'soul_profile' && nodeData.soulConfig) {
    writePermission = 'suggest_changes'
  }

  const allowed = {
    read_only: operation === 'read' || operation === 'suggest',
    suggest_changes: ['read', 'suggest', 'append'].includes(operation),
    append_with_approval: ['read', 'suggest', 'append'].includes(operation),
    write_with_approval: ['read', 'suggest', 'append', 'update'].includes(operation),
    read_write_with_approval: true
  }[writePermission] || false

  const requiresApproval = [
    'append_with_approval', 'write_with_approval', 'read_write_with_approval'
  ].includes(writePermission) && operation !== 'read' && operation !== 'suggest'

  return {
    allowed,
    requiresApproval,
    writePermission,
    mustPropose: operation !== 'read' && writePermission !== 'read_only'
  }
}

function approveProposal(proposalId, approvedBy = 'user') {
  const idx = AUDIT_LOG.findIndex(r => r.proposalId === proposalId && r.action === 'writeback_proposal')
  if (idx < 0) return { ok: false, error: 'Proposal not found' }

  recordAudit({
    action: 'writeback_decision',
    proposalId,
    decision: 'approve',
    severity: 'info',
    approvedBy
  })

  return { ok: true, proposalId, approvedAt: now(), approvedBy }
}

function rejectProposal(proposalId, reason, rejectedBy = 'user') {
  recordAudit({
    action: 'writeback_decision',
    proposalId,
    decision: 'reject',
    severity: 'warning',
    rejectedBy,
    reason
  })
  return { ok: true, proposalId, rejectedAt: now(), rejectedBy }
}

module.exports = {
  checkToolPermission,
  createWritebackProposal,
  checkWritebackPermission,
  approveProposal,
  rejectProposal,
  recordAudit,
  getAuditLog,
  isHighRiskTool,
  WRITEBACK_PERMISSION_DEFAULTS
}
