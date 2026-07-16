'use strict'

const flowCompiler = require('./flow-compiler.cjs')

const normalizeWorkflowPermissions = p => ({
  canEditDraft: Boolean(p?.canEditDraft),
  canComment: p?.canComment !== false,
  canUseKnowledge: p?.canUseKnowledge !== false,
  canReadUpstream: p?.canReadUpstream !== false
})

const workflowRunSummaryText = run => Object.values(run?.node_statuses || {})
  .map(row => `${row.label || ''}: ${row.summary || ''}`)
  .filter(Boolean)
  .join('\n\n')

const isRecoverableWorkflowModelError = errorText => /429|too many requests|rate limit|quota|timeout|ECONNRESET|ECONNREFUSED|ENOTFOUND|fetch failed|backend|503|502|504/i.test(String(errorText || ''))

const workflowNodePrompt = ({ project, workflow, node, agent, upstream, input }) => {
  const permissions = normalizeWorkflowPermissions(agent?.permissions || {})
  const nodeData = node?.data || {}
  const resourceLines = [
    nodeData.model && nodeData.model !== '默认模型' ? `Node model override: ${nodeData.model}` : 'Node model: default',
    nodeData.skill && nodeData.skill !== '自动' ? `Bound skill: ${nodeData.skill}` : 'Skill selection: auto',
    nodeData.plugin && nodeData.plugin !== '自动' ? `Bound plugin: ${nodeData.plugin}` : 'Plugin selection: auto',
    nodeData.mcp && nodeData.mcp !== '自动' ? `Bound MCP/tool: ${nodeData.mcp}` : 'MCP/tool selection: auto',
    nodeData.knowledge ? `Bound knowledge library: ${nodeData.knowledge}` : '',
    nodeData.soul ? `Soul style sample: ${nodeData.soul}` : ''
  ].filter(Boolean)
  const lines = [
    `Project: ${project.title}`,
    `Workflow: ${workflow.name}`,
    `Current node: ${node.data?.label || node.data?.name || node.id}`,
    `Agent: ${agent?.name || 'Unnamed Agent'} / ${agent?.role || ''}`,
    `Duties: ${agent?.duties || agent?.tagline || ''}`,
    agent?.forbidden ? `Forbidden: ${agent.forbidden}` : '',
    agent?.constraints?.length ? `Hard constraints: ${agent.constraints.join('; ')}` : '',
    resourceLines.length ? `Node resources:\n${resourceLines.join('\n')}` : '',
    `Permissions: ${permissions.canEditDraft ? 'may edit draft' : 'must not edit prose; comments or suggestions only'}; ${permissions.canUseKnowledge ? 'may use knowledge base' : 'do not use knowledge base'}; ${permissions.canReadUpstream ? 'may read upstream output' : 'ignore upstream output'}`,
    `Output format: ${agent?.output_format || 'Segmented response'}`,
    `User input: ${String(input || '').slice(0, 6000)}`,
    permissions.canReadUpstream ? `Upstream output: ${String(upstream || '').slice(0, 8000)}` : 'Upstream output is not provided',
    'Only complete this node responsibility. Do not talk to other Agents; return everything to the hidden dispatcher.'
  ]
  return lines.filter(Boolean).join('\n')
}

const buildLocalWorkflowFallback = ({ project, workflow, node, agent, prompt, upstream, reason, ragContext }) => {
  const citations = ragContext?.context?.citations || []
  const citeLines = citations.slice(0, 6).map((c, index) => `- [C${index + 1}] ${c.title || c.source_rel || 'source'}:${c.line_start || 1}-${c.line_end || ''}`).join('\n')
  const promptExcerpt = String(prompt || '').slice(0, 1800)
  const upstreamExcerpt = String(upstream || '').slice(0, 1200)
  return [
    `# ${node.data?.label || node.data?.name || node.id} - local fallback draft`,
    '',
    '> Model provider was unavailable, so Karna continued locally instead of blocking the workflow.',
    `> Reason: ${String(reason || 'unknown model error').slice(0, 500)}`,
    '',
    '## Working intent',
    `Project: ${project.title || project.id}`,
    `Workflow: ${workflow.name || workflow.id}`,
    `Agent: ${agent.name || agent.id || 'agent'}`,
    '',
    '## Evidence used',
    citeLines || '- No RAG citations were available for this fallback.',
    '',
    '## Draft result',
    upstreamExcerpt ? `Based on the current upstream material, continue with a conservative, canon-preserving draft.\n\n${upstreamExcerpt}` : 'No upstream manuscript text was provided; keep this as a planning placeholder until the author supplies text.',
    '',
    '## Local checklist',
    '- Preserve established canon and do not invent unsupported facts.',
    '- Treat all uncertain facts as TODOs for human review.',
    '- Rerun this node with a configured model when provider quota recovers.',
    '',
    '## Prompt excerpt for audit',
    '```text',
    promptExcerpt,
    '```'
  ].join('\n')
}

module.exports = { normalizeWorkflowPermissions, workflowRunSummaryText, isRecoverableWorkflowModelError, workflowNodePrompt, buildLocalWorkflowFallback, flowCompiler }
