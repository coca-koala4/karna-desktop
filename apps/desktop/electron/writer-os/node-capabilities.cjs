'use strict'

const NODE_CAPABILITIES = {
  input_text: ['input_schema', 'debug'],
  input_file: ['input_schema', 'filesystem', 'debug'],
  input_variable: ['input_schema', 'debug'],
  input_constant: ['input_schema', 'debug'],

  agent: [
    'prompt', 'model', 'skills', 'plugins', 'context', 'rag',
    'living_wiki', 'story_bible', 'narrative_state', 'soul',
    'tools', 'mcp', 'human_review', 'retry', 'timeout',
    'output_schema', 'writeback', 'budget', 'debug'
  ],
  critic: [
    'prompt', 'model', 'context', 'soul',
    'human_review', 'retry', 'timeout', 'output_schema', 'budget', 'debug'
  ],
  scheduler: ['model', 'tools', 'flow_control', 'debug'],
  tool_agent: ['model', 'tools', 'mcp', 'plugins', 'context', 'retry', 'timeout', 'debug'],

  prompt_template: ['prompt', 'output_schema', 'debug'],
  prompt_merge: ['flow_control', 'output_schema', 'debug'],
  context_merge: ['context', 'flow_control', 'debug'],
  context_trim: ['context', 'budget', 'debug'],

  rag_search: ['rag', 'context', 'output_schema', 'debug'],
  wiki_query: ['living_wiki', 'context', 'output_schema', 'debug'],
  bible_query: ['story_bible', 'context', 'output_schema', 'debug'],
  narrative_query: ['narrative_state', 'context', 'output_schema', 'debug'],
  soul_query: ['soul', 'context', 'output_schema', 'debug'],
  mcp_tool: ['tools', 'mcp', 'permissions', 'debug'],

  workspace_read: ['filesystem', 'context', 'permissions', 'debug'],
  workspace_write: ['filesystem', 'writeback', 'permissions', 'human_review', 'debug'],
  web_search: ['network', 'context', 'debug'],

  fanout: ['flow_control', 'debug'],
  parallel: ['flow_control', 'debug'],
  merge: ['flow_control', 'output_schema', 'debug'],
  barrier: ['flow_control', 'timeout', 'debug'],
  condition: ['flow_control', 'input_schema', 'debug'],
  switch_node: ['flow_control', 'debug'],
  wait: ['flow_control', 'timeout', 'debug'],
  retry: ['flow_control', 'retry', 'debug'],
  loop_controller: ['flow_control', 'retry', 'timeout', 'debug'],
  loop_back: ['flow_control', 'debug'],
  loop: ['flow_control', 'retry', 'timeout', 'debug'],

  checkpoint: ['artifact', 'filesystem', 'debug'],
  subflow: ['flow_control', 'debug'],
  boolean_judge: ['model', 'flow_control', 'prompt', 'debug'],
  score_judge: ['model', 'flow_control', 'prompt', 'debug'],
  llm_judge: ['model', 'prompt', 'flow_control', 'context', 'debug'],
  consensus: ['model', 'flow_control', 'prompt', 'context', 'debug'],
  text_merge: ['flow_control', 'output_schema', 'debug'],
  critique_aggregate: ['flow_control', 'output_schema', 'context', 'debug'],

  human_confirm: ['human_review', 'timeout', 'flow_control', 'permissions'],
  human_edit: ['human_review', 'timeout', 'flow_control', 'permissions'],
  human_review: ['human_review', 'timeout', 'flow_control', 'permissions'],

  artifact: ['artifact', 'filesystem', 'permissions', 'debug'],
  save_snapshot: ['artifact', 'filesystem', 'human_review', 'permissions', 'debug'],
  archive_version: ['archive', 'filesystem', 'human_review', 'permissions', 'debug'],
  archive: ['archive', 'filesystem', 'human_review', 'permissions', 'debug'],

  text_output: ['output_schema', 'artifact', 'debug'],
  file_output: ['output_schema', 'filesystem', 'artifact', 'permissions', 'debug'],
  final_output: ['output_schema', 'artifact', 'debug'],
  output: ['output_schema', 'artifact', 'debug'],
  input: ['input_schema', 'debug']
}

const AI_RESOURCE_CAPABILITIES = new Set([
  'model', 'skills', 'rag', 'living_wiki', 'story_bible',
  'narrative_state', 'soul', 'mcp', 'tools'
])

const ARCHIVE_NODE_TYPES = new Set(['archive', 'archive_version'])
const HUMAN_NODE_TYPES = new Set(['human_confirm', 'human_edit', 'human_review'])
const AGENT_NODE_TYPES = new Set(['agent', 'critic', 'scheduler', 'tool_agent', 'llm_judge'])

function getNodeCapabilities(nodeType) {
  const type = String(nodeType || '').trim()
  if (NODE_CAPABILITIES[type]) return [...NODE_CAPABILITIES[type]]

  if (type.startsWith('input_')) return ['input_schema', 'debug']
  if (type.startsWith('output') || type === 'final_output' || type === 'file_output' || type === 'text_output') {
    return ['output_schema', 'artifact', 'debug']
  }
  if (type.startsWith('human_')) return ['human_review', 'timeout', 'flow_control', 'permissions']
  if (type.startsWith('archive')) return ['archive', 'filesystem', 'human_review', 'permissions']

  return ['debug']
}

function getNodeDefinition(nodeType) {
  const type = String(nodeType || '').trim()
  return {
    classType: type,
    capabilities: getNodeCapabilities(type),
    isArchive: ARCHIVE_NODE_TYPES.has(type),
    isHuman: HUMAN_NODE_TYPES.has(type),
    isAgent: AGENT_NODE_TYPES.has(type)
  }
}

function nodeHasCapability(nodeType, capability) {
  return getNodeCapabilities(nodeType).includes(capability)
}

function isArchiveNode(nodeType) {
  return ARCHIVE_NODE_TYPES.has(String(nodeType || ''))
}

function isAgentNode(nodeType) {
  return AGENT_NODE_TYPES.has(String(nodeType || ''))
}

module.exports = {
  NODE_CAPABILITIES,
  AI_RESOURCE_CAPABILITIES,
  ARCHIVE_NODE_TYPES,
  HUMAN_NODE_TYPES,
  AGENT_NODE_TYPES,
  getNodeCapabilities,
  getNodeDefinition,
  nodeHasCapability,
  isArchiveNode,
  isAgentNode
}
