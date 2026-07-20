'use strict'

const NODE_STATUSES = {
  IDLE: 'idle',
  QUEUED: 'queued',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  WAITING_HUMAN: 'waiting_human'
}

const RUN_STATUSES = {
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  STOPPED: 'stopped'
}

const EDGE_TYPES = {
  NORMAL: 'normal',
  LOOP: 'loop',
  CONDITIONAL: 'conditional'
}

const COMPLEXITY_LIMITS = {
  MAX_NODES: 50,
  MAX_EDGES: 100,
  MAX_DEPTH: 20,
  MAX_PARALLEL_BRANCHES: 10
}

const EXECUTION_DEFAULTS = {
  MAX_PARALLEL_NODES: 5,
  DEFAULT_NODE_TIMEOUT_MS: 10 * 60 * 1000,
  DEFAULT_MAX_RETRIES: 0,
  DEFAULT_MAX_LOOP_ITERATIONS: 3,
  MAX_LOOP_ITERATIONS: 10,
  DEFAULT_CIRCUIT_BREAKER_FAILURES: 3,
  DEFAULT_MAX_RUN_DURATION_MS: 2 * 60 * 60 * 1000,
  MAX_NODE_RESULT_BYTES: 10 * 1024 * 1024,
  MAX_TOTAL_RUN_BYTES: 100 * 1024 * 1024,
  RUN_HISTORY_RETENTION_DAYS: 30
}

const ERROR_CODES = {
  WORKFLOW_VALIDATION_FAILED: 'WORKFLOW_VALIDATION_FAILED',
  CYCLE_DETECTED: 'CYCLE_DETECTED',
  COMPLEXITY_EXCEEDED: 'COMPLEXITY_EXCEEDED',
  RUN_NOT_FOUND: 'RUN_NOT_FOUND',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  NODE_TIMEOUT: 'NODE_TIMEOUT',
  CIRCUIT_BREAKER_TRIPPED: 'CIRCUIT_BREAKER_TRIPPED',
  TOKEN_BUDGET_EXCEEDED: 'TOKEN_BUDGET_EXCEEDED',
  MAX_DURATION_EXCEEDED: 'MAX_DURATION_EXCEEDED',
  RESULT_TOO_LARGE: 'RESULT_TOO_LARGE',
  LOOP_ITERATION_LIMIT: 'LOOP_ITERATION_LIMIT'
}

function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function estimateSizeBytes(obj) {
  try {
    return Buffer.byteLength(JSON.stringify(obj), 'utf8')
  } catch {
    return 0
  }
}

function truncateResult(result, maxBytes) {
  try {
    const json = JSON.stringify(result)
    if (Buffer.byteLength(json, 'utf8') <= maxBytes) {
      return { value: result, truncated: false }
    }
    if (typeof result === 'object' && result !== null) {
      if (Array.isArray(result)) {
        const truncated = {
          _truncated: true,
          _original_length: result.length,
          _message: 'Result truncated due to size limit',
          sample: result.slice(0, Math.max(1, Math.floor(result.length * 0.1)))
        }
        return { value: truncated, truncated: true }
      }
      const keys = Object.keys(result)
      const truncated = {
        _truncated: true,
        _original_keys: keys,
        _message: 'Result truncated due to size limit'
      }
      for (let i = 0; i < Math.min(5, keys.length); i++) {
        truncated[keys[i]] = result[keys[i]]
      }
      return { value: truncated, truncated: true }
    }
    return {
      value: {
        _truncated: true,
        _message: 'Result truncated due to size limit',
        _type: typeof result
      },
      truncated: true
    }
  } catch {
    return { value: null, truncated: true }
  }
}

function buildAdjacencyList(nodes, edges) {
  const adj = {}
  const reverseAdj = {}
  for (const node of nodes) {
    adj[node.id] = []
    reverseAdj[node.id] = []
  }
  for (const edge of edges) {
    if (adj[edge.from]) {
      adj[edge.from].push(edge)
    }
    if (reverseAdj[edge.to]) {
      reverseAdj[edge.to].push(edge)
    }
  }
  return { adj, reverseAdj }
}

function detectCycles(workflow) {
  const nodes = workflow.nodes || []
  const edges = workflow.edges || []
  const nodeIds = new Set(nodes.map(n => n.id))
  const cycles = []
  const visited = new Set()
  const inStack = new Set()
  const pathStack = []
  const { adj } = buildAdjacencyList(nodes, edges)

  function dfs(nodeId) {
    if (inStack.has(nodeId)) {
      const cycleStartIndex = pathStack.indexOf(nodeId)
      if (cycleStartIndex !== -1) {
        const cyclePath = pathStack.slice(cycleStartIndex)
        cyclePath.push(nodeId)
        const cycleEdges = []
        for (let i = 0; i < cyclePath.length - 1; i++) {
          const from = cyclePath[i]
          const to = cyclePath[i + 1]
          const edge = edges.find(e => e.from === from && e.to === to)
          if (edge) {
            cycleEdges.push(edge)
          }
        }
        const edgeTypes = new Set(cycleEdges.map(e => e.type || EDGE_TYPES.NORMAL))
        const isControlled = edgeTypes.has(EDGE_TYPES.LOOP) && edgeTypes.size === 1
        cycles.push({
          path: cyclePath,
          edges: cycleEdges.map(e => e.id),
          is_controlled: isControlled,
          loop_edge_id: cycleEdges.find(e => e.type === EDGE_TYPES.LOOP)?.id || null
        })
      }
      return
    }
    if (visited.has(nodeId)) {
      return
    }
    visited.add(nodeId)
    inStack.add(nodeId)
    pathStack.push(nodeId)
    const outgoing = adj[nodeId] || []
    for (const edge of outgoing) {
      if (nodeIds.has(edge.to)) {
        dfs(edge.to)
      }
    }
    pathStack.pop()
    inStack.delete(nodeId)
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      dfs(node.id)
    }
  }

  const uniqueCycles = []
  const seen = new Set()
  for (const cycle of cycles) {
    const key = [...cycle.path].sort().join('|')
    if (!seen.has(key)) {
      seen.add(key)
      uniqueCycles.push(cycle)
    }
  }

  return uniqueCycles
}

function topologicalSort(workflow) {
  const nodes = workflow.nodes || []
  const edges = workflow.edges || []
  const nodeIds = new Set(nodes.map(n => n.id))
  const normalEdges = edges.filter(e => (e.type || EDGE_TYPES.NORMAL) === EDGE_TYPES.NORMAL)
  const inDegree = {}
  for (const node of nodes) {
    inDegree[node.id] = 0
  }
  for (const edge of normalEdges) {
    if (nodeIds.has(edge.to) && nodeIds.has(edge.from)) {
      inDegree[edge.to] = (inDegree[edge.to] || 0) + 1
    }
  }
  const { adj } = buildAdjacencyList(nodes, normalEdges)
  const queue = []
  for (const node of nodes) {
    if (inDegree[node.id] === 0) {
      queue.push(node.id)
    }
  }
  const result = []
  while (queue.length > 0) {
    const nodeId = queue.shift()
    result.push(nodeId)
    const outgoing = adj[nodeId] || []
    for (const edge of outgoing) {
      if (nodeIds.has(edge.to)) {
        inDegree[edge.to]--
        if (inDegree[edge.to] === 0) {
          queue.push(edge.to)
        }
      }
    }
  }
  if (result.length !== nodes.length) {
    const remaining = nodes.filter(n => !result.includes(n.id)).map(n => n.id)
    return {
      valid: false,
      order: result,
      remaining_nodes: remaining,
      has_cycle: true
    }
  }
  return {
    valid: true,
    order: result,
    remaining_nodes: [],
    has_cycle: false
  }
}

function assessComplexity(workflow) {
  const nodes = workflow.nodes || []
  const edges = workflow.edges || []
  const nodeIds = new Set(nodes.map(n => n.id))
  const normalEdges = edges.filter(e => (e.type || EDGE_TYPES.NORMAL) === EDGE_TYPES.NORMAL)

  let maxDepth = 0
  const depthMap = {}
  const { adj, reverseAdj } = buildAdjacencyList(nodes, normalEdges)

  function computeDepth(nodeId, visiting = new Set()) {
    if (depthMap[nodeId] !== undefined) {
      return depthMap[nodeId]
    }
    if (visiting.has(nodeId)) {
      return 0
    }
    visiting.add(nodeId)
    const incoming = reverseAdj[nodeId] || []
    if (incoming.length === 0) {
      depthMap[nodeId] = 0
      return 0
    }
    let maxPredDepth = 0
    for (const edge of incoming) {
      if (nodeIds.has(edge.from)) {
        const d = computeDepth(edge.from, visiting)
        maxPredDepth = Math.max(maxPredDepth, d)
      }
    }
    depthMap[nodeId] = maxPredDepth + 1
    return depthMap[nodeId]
  }

  for (const node of nodes) {
    const d = computeDepth(node.id)
    if (d > maxDepth) {
      maxDepth = d
    }
  }

  let maxParallel = 0
  const levelCounts = {}
  for (const nodeId of Object.keys(depthMap)) {
    const level = depthMap[nodeId]
    levelCounts[level] = (levelCounts[level] || 0) + 1
    if (levelCounts[level] > maxParallel) {
      maxParallel = levelCounts[level]
    }
  }

  const entryNodes = nodes.filter(n => (reverseAdj[n.id] || []).length === 0).map(n => n.id)
  const exitNodes = nodes.filter(n => {
    const outgoing = adj[n.id] || []
    return outgoing.filter(e => nodeIds.has(e.to)).length === 0
  }).map(n => n.id)

  return {
    node_count: nodes.length,
    edge_count: edges.length,
    max_depth: maxDepth,
    max_parallel_branches: maxParallel,
    entry_nodes: entryNodes,
    exit_nodes: exitNodes,
    depth_map: depthMap
  }
}

function validateWorkflow(workflow, options = {}) {
  const errors = []
  const warnings = []
  const nodes = workflow.nodes || []
  const edges = workflow.edges || []
  const limits = { ...COMPLEXITY_LIMITS, ...options.limits }

  if (!workflow || typeof workflow !== 'object') {
    return {
      valid: false,
      errors: [{ code: ERROR_CODES.WORKFLOW_VALIDATION_FAILED, message: 'Workflow must be an object' }],
      warnings: []
    }
  }

  if (!Array.isArray(nodes)) {
    errors.push({ code: ERROR_CODES.WORKFLOW_VALIDATION_FAILED, message: 'Workflow.nodes must be an array' })
    return { valid: false, errors, warnings }
  }

  if (!Array.isArray(edges)) {
    errors.push({ code: ERROR_CODES.WORKFLOW_VALIDATION_FAILED, message: 'Workflow.edges must be an array' })
    return { valid: false, errors, warnings }
  }

  const nodeIds = new Set()
  for (const node of nodes) {
    if (!node.id) {
      errors.push({ code: ERROR_CODES.WORKFLOW_VALIDATION_FAILED, message: 'Each node must have an id' })
      continue
    }
    if (nodeIds.has(node.id)) {
      errors.push({ code: ERROR_CODES.WORKFLOW_VALIDATION_FAILED, message: `Duplicate node id: ${node.id}` })
    }
    nodeIds.add(node.id)
    if (!node.type) {
      warnings.push({ message: `Node ${node.id} has no type` })
    }
  }

  for (const edge of edges) {
    if (!edge.id) {
      errors.push({ code: ERROR_CODES.WORKFLOW_VALIDATION_FAILED, message: 'Each edge must have an id' })
      continue
    }
    if (!edge.from || !nodeIds.has(edge.from)) {
      errors.push({ code: ERROR_CODES.WORKFLOW_VALIDATION_FAILED, message: `Edge ${edge.id} has invalid 'from' node: ${edge.from}` })
    }
    if (!edge.to || !nodeIds.has(edge.to)) {
      errors.push({ code: ERROR_CODES.WORKFLOW_VALIDATION_FAILED, message: `Edge ${edge.id} has invalid 'to' node: ${edge.to}` })
    }
  }

  const cycles = detectCycles(workflow)
  const uncontrolledCycles = cycles.filter(c => !c.is_controlled)
  if (uncontrolledCycles.length > 0) {
    errors.push({
      code: ERROR_CODES.CYCLE_DETECTED,
      message: `Detected ${uncontrolledCycles.length} uncontrolled cycle(s) in workflow`,
      details: { cycles: uncontrolledCycles }
    })
  }
  if (cycles.filter(c => c.is_controlled).length > 0) {
    warnings.push({
      message: `Detected ${cycles.filter(c => c.is_controlled).length} controlled loop(s) in workflow`,
      details: { loops: cycles.filter(c => c.is_controlled) }
    })
  }

  const complexity = assessComplexity(workflow)
  if (complexity.node_count > limits.MAX_NODES) {
    errors.push({
      code: ERROR_CODES.COMPLEXITY_EXCEEDED,
      message: `Node count (${complexity.node_count}) exceeds maximum (${limits.MAX_NODES})`,
      details: { limit: limits.MAX_NODES, actual: complexity.node_count }
    })
  }
  if (complexity.edge_count > limits.MAX_EDGES) {
    errors.push({
      code: ERROR_CODES.COMPLEXITY_EXCEEDED,
      message: `Edge count (${complexity.edge_count}) exceeds maximum (${limits.MAX_EDGES})`,
      details: { limit: limits.MAX_EDGES, actual: complexity.edge_count }
    })
  }
  if (complexity.max_depth > limits.MAX_DEPTH) {
    errors.push({
      code: ERROR_CODES.COMPLEXITY_EXCEEDED,
      message: `Max depth (${complexity.max_depth}) exceeds maximum (${limits.MAX_DEPTH})`,
      details: { limit: limits.MAX_DEPTH, actual: complexity.max_depth }
    })
  }
  if (complexity.max_parallel_branches > limits.MAX_PARALLEL_BRANCHES) {
    errors.push({
      code: ERROR_CODES.COMPLEXITY_EXCEEDED,
      message: `Max parallel branches (${complexity.max_parallel_branches}) exceeds maximum (${limits.MAX_PARALLEL_BRANCHES})`,
      details: { limit: limits.MAX_PARALLEL_BRANCHES, actual: complexity.max_parallel_branches }
    })
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    complexity
  }
}

function createWorkflowExecutor({
  fs,
  path,
  dataRoot,
  log = () => {}
}) {
  const runsDir = path.join(dataRoot, 'workflow-runs')
  const runsIndexPath = path.join(runsDir, 'runs-index.json')

  const ensureRunsDir = () => {
    if (!fs.existsSync(runsDir)) {
      fs.mkdirSync(runsDir, { recursive: true })
    }
  }

  const readJsonFile = (filePath, fallback) => {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'))
      }
    } catch (err) {
      log(`Error reading file ${filePath}: ${err.message}`)
    }
    return cloneJson(fallback)
  }

  const atomicWriteJson = (filePath, data) => {
    ensureRunsDir()
    const tempFile = `${filePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(tempFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    fs.renameSync(tempFile, filePath)
    return data
  }

  const getRunPath = runId => path.join(runsDir, `${runId}.json`)

  const readRun = runId => {
    const runPath = getRunPath(runId)
    if (!fs.existsSync(runPath)) {
      return null
    }
    return readJsonFile(runPath, null)
  }

  const writeRun = run => {
    run.updated_at = new Date().toISOString()
    atomicWriteJson(getRunPath(run.id), run)
    updateRunsIndex(run)
    return run
  }

  const readRunsIndex = () => {
    const saved = readJsonFile(runsIndexPath, { version: 1, runs: [] })
    return {
      version: saved.version || 1,
      runs: Array.isArray(saved.runs) ? saved.runs : []
    }
  }

  const writeRunsIndex = index => {
    atomicWriteJson(runsIndexPath, {
      version: 1,
      runs: index.runs
    })
  }

  const updateRunsIndex = run => {
    const index = readRunsIndex()
    const existingIndex = index.runs.findIndex(r => r.id === run.id)
    const summary = {
      id: run.id,
      workflow_id: run.workflow_id,
      status: run.status,
      created_at: run.created_at,
      updated_at: run.updated_at,
      completed_at: run.completed_at || null
    }
    if (existingIndex >= 0) {
      index.runs[existingIndex] = summary
    } else {
      index.runs.unshift(summary)
    }
    writeRunsIndex(index)
  }

  const initializeNodeStates = workflow => {
    const states = {}
    for (const node of workflow.nodes || []) {
      states[node.id] = {
        status: NODE_STATUSES.IDLE,
        started_at: null,
        completed_at: null,
        result: null,
        error: null,
        retry_count: 0,
        output_data: null
      }
    }
    return states
  }

  const initializeLoopCounters = workflow => {
    const counters = {}
    const edges = workflow.edges || []
    for (const edge of edges) {
      if (edge.type === EDGE_TYPES.LOOP) {
        counters[edge.id] = 0
      }
    }
    return counters
  }

  const getIncomingEdges = (workflow, nodeId, edgeType = null) => {
    const edges = workflow.edges || []
    return edges.filter(e => {
      if (e.to !== nodeId) return false
      if (edgeType && (e.type || EDGE_TYPES.NORMAL) !== edgeType) return false
      return true
    })
  }

  const getOutgoingEdges = (workflow, nodeId, edgeType = null) => {
    const edges = workflow.edges || []
    return edges.filter(e => {
      if (e.from !== nodeId) return false
      if (edgeType && (e.type || EDGE_TYPES.NORMAL) !== edgeType) return false
      return true
    })
  }

  const areAllPredecessorsComplete = (run, nodeId) => {
    const incoming = getIncomingEdges(run.workflow_snapshot, nodeId, EDGE_TYPES.NORMAL)
    if (incoming.length === 0) return true
    return incoming.every(edge => {
      const state = run.node_states[edge.from]
      return state && state.status === NODE_STATUSES.SUCCESS
    })
  }

  const markDownstreamSkipped = (run, nodeId) => {
    const visited = new Set()
    const queue = [nodeId]
    while (queue.length > 0) {
      const current = queue.shift()
      if (visited.has(current)) continue
      visited.add(current)
      const outgoing = getOutgoingEdges(run.workflow_snapshot, current, EDGE_TYPES.NORMAL)
      for (const edge of outgoing) {
        const targetId = edge.to
        if (!visited.has(targetId)) {
          const state = run.node_states[targetId]
          if (state && state.status === NODE_STATUSES.IDLE || state.status === NODE_STATUSES.QUEUED) {
            state.status = NODE_STATUSES.SKIPPED
            state.completed_at = new Date().toISOString()
            state.error = {
              message: 'Skipped due to upstream failure',
              code: 'UPSTREAM_FAILED',
              upstream_node: nodeId
            }
            queue.push(targetId)
          }
        }
      }
    }
  }

  const checkCircuitBreaker = (run, options = {}) => {
    const maxFailures = options.max_consecutive_failures ?? EXECUTION_DEFAULTS.DEFAULT_CIRCUIT_BREAKER_FAILURES
    let consecutiveFailures = 0
    const nodeStates = Object.values(run.node_states)
    for (let i = nodeStates.length - 1; i >= 0; i--) {
      if (nodeStates[i].status === NODE_STATUSES.FAILED) {
        consecutiveFailures++
        if (consecutiveFailures >= maxFailures) {
          return true
        }
      } else if (nodeStates[i].status === NODE_STATUSES.SUCCESS) {
        break
      }
    }
    return false
  }

  const checkMaxDuration = run => {
    const now = Date.now()
    const startTime = new Date(run.created_at).getTime()
    const elapsed = now - startTime
    const maxDuration = run.max_duration_ms || EXECUTION_DEFAULTS.DEFAULT_MAX_RUN_DURATION_MS
    return elapsed > maxDuration
  }

  const checkTotalSize = run => {
    const totalBytes = estimateSizeBytes(run.node_states) + estimateSizeBytes(run.input || {})
    return totalBytes > EXECUTION_DEFAULTS.MAX_TOTAL_RUN_BYTES
  }

  const isRunFinished = run => {
    const states = Object.values(run.node_states)
    const allDone = states.every(s =>
      s.status === NODE_STATUSES.SUCCESS ||
      s.status === NODE_STATUSES.FAILED ||
      s.status === NODE_STATUSES.SKIPPED
    )
    return allDone
  }

  const getRunFinalStatus = run => {
    const states = Object.values(run.node_states)
    const hasFailed = states.some(s => s.status === NODE_STATUSES.FAILED)
    if (hasFailed) return RUN_STATUSES.FAILED
    return RUN_STATUSES.COMPLETED
  }

  function validateWorkflowFn(workflow) {
    return validateWorkflow(workflow)
  }

  function topologicalSortFn(workflow) {
    return topologicalSort(workflow)
  }

  function detectCyclesFn(workflow) {
    return detectCycles(workflow)
  }

  function assessComplexityFn(workflow) {
    return assessComplexity(workflow)
  }

  function createRun(workflowId, workflow, input = {}) {
    const validation = validateWorkflow(workflow)
    if (!validation.valid) {
      return {
        ok: false,
        error: 'Workflow validation failed',
        validation_errors: validation.errors
      }
    }

    ensureRunsDir()

    const runId = generateId('run')
    const now = new Date().toISOString()
    const workflowSnapshot = cloneJson(workflow)

    const run = {
      id: runId,
      workflow_id: workflowId,
      workflow_snapshot: workflowSnapshot,
      input: cloneJson(input),
      status: RUN_STATUSES.RUNNING,
      current_step: 0,
      node_states: initializeNodeStates(workflowSnapshot),
      loop_counters: initializeLoopCounters(workflowSnapshot),
      created_at: now,
      updated_at: now,
      completed_at: null,
      total_tokens: 0,
      total_duration_ms: 0,
      max_parallel_nodes: EXECUTION_DEFAULTS.MAX_PARALLEL_NODES,
      max_duration_ms: EXECUTION_DEFAULTS.DEFAULT_MAX_RUN_DURATION_MS,
      default_node_timeout_ms: EXECUTION_DEFAULTS.DEFAULT_NODE_TIMEOUT_MS,
      default_max_retries: EXECUTION_DEFAULTS.DEFAULT_MAX_RETRIES,
      max_loop_iterations: EXECUTION_DEFAULTS.DEFAULT_MAX_LOOP_ITERATIONS,
      consecutive_failures: 0,
      circuit_breaker_tripped: false
    }

    writeRun(run)
    log(`Created workflow run: ${runId}`)

    return { ok: true, run_id: runId, run }
  }

  function stepRun(runId) {
    const run = readRun(runId)
    if (!run) {
      return { ok: false, error: `Run not found: ${runId}`, code: ERROR_CODES.RUN_NOT_FOUND }
    }

    if (run.status !== RUN_STATUSES.RUNNING) {
      return { ok: false, error: `Run is not running: ${run.status}` }
    }

    if (checkMaxDuration(run)) {
      run.status = RUN_STATUSES.FAILED
      run.completed_at = new Date().toISOString()
      for (const nodeId of Object.keys(run.node_states)) {
        const state = run.node_states[nodeId]
        if (state.status === NODE_STATUSES.IDLE || state.status === NODE_STATUSES.QUEUED) {
          state.status = NODE_STATUSES.SKIPPED
          state.completed_at = run.completed_at
          state.error = {
            message: 'Run exceeded maximum duration',
            code: ERROR_CODES.MAX_DURATION_EXCEEDED
          }
        }
      }
      writeRun(run)
      return { ok: true, run, next_nodes: [], finished: true }
    }

    if (checkTotalSize(run)) {
      run.status = RUN_STATUSES.FAILED
      run.completed_at = new Date().toISOString()
      for (const nodeId of Object.keys(run.node_states)) {
        const state = run.node_states[nodeId]
        if (state.status === NODE_STATUSES.IDLE || state.status === NODE_STATUSES.QUEUED) {
          state.status = NODE_STATUSES.SKIPPED
          state.completed_at = run.completed_at
          state.error = {
            message: 'Run exceeded maximum data size',
            code: ERROR_CODES.RESULT_TOO_LARGE
          }
        }
      }
      writeRun(run)
      return { ok: true, run, next_nodes: [], finished: true }
    }

    const runningCount = Object.values(run.node_states).filter(
      s => s.status === NODE_STATUSES.RUNNING
    ).length
    const availableSlots = run.max_parallel_nodes - runningCount

    if (availableSlots <= 0) {
      return { ok: true, run, next_nodes: [], finished: false }
    }

    const nextNodes = []
    const nodes = run.workflow_snapshot.nodes || []

    for (const node of nodes) {
      if (nextNodes.length >= availableSlots) break

      const state = run.node_states[node.id]
      if (!state) continue
      if (state.status !== NODE_STATUSES.IDLE && state.status !== NODE_STATUSES.QUEUED) continue

      if (!areAllPredecessorsComplete(run, node.id)) continue

      state.status = NODE_STATUSES.RUNNING
      state.started_at = new Date().toISOString()
      nextNodes.push(node.id)
    }

    run.current_step++
    writeRun(run)

    const finished = isRunFinished(run)
    if (finished) {
      run.status = getRunFinalStatus(run)
      run.completed_at = new Date().toISOString()
      run.total_duration_ms = Date.now() - new Date(run.created_at).getTime()
      writeRun(run)
    }

    return {
      ok: true,
      run,
      next_nodes: nextNodes,
      finished
    }
  }

  function updateNodeStatus(runId, nodeId, status, result = null) {
    const run = readRun(runId)
    if (!run) {
      return { ok: false, error: `Run not found: ${runId}`, code: ERROR_CODES.RUN_NOT_FOUND }
    }

    const state = run.node_states[nodeId]
    if (!state) {
      return { ok: false, error: `Node not found: ${nodeId}` }
    }

    const validTransitions = {
      [NODE_STATUSES.IDLE]: [NODE_STATUSES.QUEUED, NODE_STATUSES.SKIPPED],
      [NODE_STATUSES.QUEUED]: [NODE_STATUSES.RUNNING, NODE_STATUSES.SKIPPED],
      [NODE_STATUSES.RUNNING]: [NODE_STATUSES.SUCCESS, NODE_STATUSES.FAILED, NODE_STATUSES.WAITING_HUMAN],
      [NODE_STATUSES.WAITING_HUMAN]: [NODE_STATUSES.RUNNING, NODE_STATUSES.FAILED],
      [NODE_STATUSES.SUCCESS]: [],
      [NODE_STATUSES.FAILED]: [],
      [NODE_STATUSES.SKIPPED]: []
    }

    const allowed = validTransitions[state.status] || []
    if (!allowed.includes(status)) {
      return {
        ok: false,
        error: `Invalid state transition: ${state.status} -> ${status}`,
        code: ERROR_CODES.INVALID_STATE_TRANSITION
      }
    }

    const now = new Date().toISOString()

    if (status === NODE_STATUSES.SUCCESS) {
      state.status = NODE_STATUSES.SUCCESS
      state.completed_at = now
      state.result = result
      state.error = null

      const resultSize = estimateSizeBytes(result)
      if (resultSize > EXECUTION_DEFAULTS.MAX_NODE_RESULT_BYTES) {
        const { value: truncated, truncated: wasTruncated } = truncateResult(
          result,
          EXECUTION_DEFAULTS.MAX_NODE_RESULT_BYTES
        )
        state.result = truncated
        state.output_data = truncated
        if (wasTruncated) {
          log(`Warning: Node ${nodeId} result truncated due to size limit`)
        }
      } else {
        state.output_data = result
      }

      run.consecutive_failures = 0

      const outgoingLoopEdges = getOutgoingEdges(
        run.workflow_snapshot,
        nodeId,
        EDGE_TYPES.LOOP
      )
      for (const loopEdge of outgoingLoopEdges) {
        const counter = run.loop_counters[loopEdge.id] || 0
        if (counter < run.max_loop_iterations) {
          const targetState = run.node_states[loopEdge.to]
          if (targetState && targetState.status === NODE_STATUSES.SUCCESS) {
            targetState.status = NODE_STATUSES.IDLE
            targetState.started_at = null
            targetState.completed_at = null
            targetState.result = null
            targetState.error = null
            targetState.retry_count = 0
            targetState.output_data = null
            run.loop_counters[loopEdge.id] = counter + 1
          }
        } else {
          log(`Loop iteration limit reached for loop edge: ${loopEdge.id}`)
        }
      }
    } else if (status === NODE_STATUSES.FAILED) {
      const node = run.workflow_snapshot.nodes?.find(n => n.id === nodeId)
      const maxRetries = node?.max_retries ?? run.default_max_retries

      if (state.retry_count < maxRetries) {
        state.retry_count++
        state.status = NODE_STATUSES.QUEUED
        state.error = result?.error || result
        log(`Retrying node ${nodeId} (attempt ${state.retry_count}/${maxRetries})`)
        writeRun(run)
        return { ok: true, run, will_retry: true, retry_count: state.retry_count }
      }

      state.status = NODE_STATUSES.FAILED
      state.completed_at = now
      state.error = result?.error || result || { message: 'Node execution failed' }

      run.consecutive_failures++

      markDownstreamSkipped(run, nodeId)

      if (checkCircuitBreaker(run)) {
        run.circuit_breaker_tripped = true
        run.status = RUN_STATUSES.PAUSED
        log(`Circuit breaker tripped after ${run.consecutive_failures} consecutive failures`)
      }
    } else if (status === NODE_STATUSES.WAITING_HUMAN) {
      state.status = NODE_STATUSES.WAITING_HUMAN
      state.result = result
    } else {
      state.status = status
      if (status === NODE_STATUSES.QUEUED || status === NODE_STATUSES.SKIPPED) {
        state.completed_at = now
      }
    }

    const finished = isRunFinished(run)
    if (finished) {
      run.status = getRunFinalStatus(run)
      run.completed_at = now
      run.total_duration_ms = Date.now() - new Date(run.created_at).getTime()
    }

    writeRun(run)

    return { ok: true, run, finished }
  }

  function getRunStatus(runId) {
    const run = readRun(runId)
    if (!run) {
      return { ok: false, error: `Run not found: ${runId}`, code: ERROR_CODES.RUN_NOT_FOUND }
    }
    return { ok: true, run }
  }

  function pauseRun(runId) {
    const run = readRun(runId)
    if (!run) {
      return { ok: false, error: `Run not found: ${runId}`, code: ERROR_CODES.RUN_NOT_FOUND }
    }

    if (run.status !== RUN_STATUSES.RUNNING) {
      return { ok: false, error: `Cannot pause run in status: ${run.status}` }
    }

    run.status = RUN_STATUSES.PAUSED
    writeRun(run)
    log(`Paused run: ${runId}`)

    return { ok: true, run }
  }

  function resumeRun(runId) {
    const run = readRun(runId)
    if (!run) {
      return { ok: false, error: `Run not found: ${runId}`, code: ERROR_CODES.RUN_NOT_FOUND }
    }

    if (run.status !== RUN_STATUSES.PAUSED) {
      return { ok: false, error: `Cannot resume run in status: ${run.status}` }
    }

    run.status = RUN_STATUSES.RUNNING
    run.circuit_breaker_tripped = false
    run.consecutive_failures = 0
    writeRun(run)
    log(`Resumed run: ${runId}`)

    return { ok: true, run }
  }

  function stopRun(runId) {
    const run = readRun(runId)
    if (!run) {
      return { ok: false, error: `Run not found: ${runId}`, code: ERROR_CODES.RUN_NOT_FOUND }
    }

    if (run.status === RUN_STATUSES.COMPLETED || run.status === RUN_STATUSES.FAILED) {
      return { ok: false, error: `Run already finished: ${run.status}` }
    }

    const now = new Date().toISOString()
    run.status = RUN_STATUSES.STOPPED
    run.completed_at = now
    run.total_duration_ms = Date.now() - new Date(run.created_at).getTime()

    for (const nodeId of Object.keys(run.node_states)) {
      const state = run.node_states[nodeId]
      if (state.status === NODE_STATUSES.IDLE ||
          state.status === NODE_STATUSES.QUEUED ||
          state.status === NODE_STATUSES.RUNNING ||
          state.status === NODE_STATUSES.WAITING_HUMAN) {
        state.status = NODE_STATUSES.SKIPPED
        state.completed_at = now
        state.error = {
          message: 'Run was stopped',
          code: 'RUN_STOPPED'
        }
      }
    }

    writeRun(run)
    log(`Stopped run: ${runId}`)

    return { ok: true, run }
  }

  function cleanupRun(runId) {
    const runPath = getRunPath(runId)
    if (!fs.existsSync(runPath)) {
      return { ok: false, error: `Run not found: ${runId}`, code: ERROR_CODES.RUN_NOT_FOUND }
    }

    try {
      fs.unlinkSync(runPath)
    } catch (err) {
      return { ok: false, error: `Failed to delete run file: ${err.message}` }
    }

    const index = readRunsIndex()
    index.runs = index.runs.filter(r => r.id !== runId)
    writeRunsIndex(index)

    log(`Cleaned up run: ${runId}`)
    return { ok: true }
  }

  function listRuns({ workflowId, limit = 20, offset = 0 } = {}) {
    ensureRunsDir()
    const index = readRunsIndex()
    let runs = index.runs

    if (workflowId) {
      runs = runs.filter(r => r.workflow_id === workflowId)
    }

    const total = runs.length
    const paginated = runs.slice(offset, offset + limit)

    return {
      ok: true,
      runs: paginated,
      total,
      limit,
      offset
    }
  }

  function cleanupOldRuns() {
    const index = readRunsIndex()
    const now = Date.now()
    const maxAge = EXECUTION_DEFAULTS.RUN_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000
    const toRemove = []

    for (const summary of index.runs) {
      if (summary.status === RUN_STATUSES.COMPLETED ||
          summary.status === RUN_STATUSES.FAILED ||
          summary.status === RUN_STATUSES.STOPPED) {
        const completedAt = summary.completed_at
          ? new Date(summary.completed_at).getTime()
          : new Date(summary.created_at).getTime()
        if (now - completedAt > maxAge) {
          toRemove.push(summary.id)
        }
      }
    }

    let removed = 0
    for (const runId of toRemove) {
      try {
        const runPath = getRunPath(runId)
        if (fs.existsSync(runPath)) {
          fs.unlinkSync(runPath)
        }
        removed++
      } catch (err) {
        log(`Failed to cleanup old run ${runId}: ${err.message}`)
      }
    }

    index.runs = index.runs.filter(r => !toRemove.includes(r.id))
    writeRunsIndex(index)

    return { ok: true, removed }
  }

  return {
    validateWorkflow: validateWorkflowFn,
    topologicalSort: topologicalSortFn,
    detectCycles: detectCyclesFn,
    assessComplexity: assessComplexityFn,
    createRun,
    stepRun,
    updateNodeStatus,
    getRunStatus,
    pauseRun,
    resumeRun,
    stopRun,
    cleanupRun,
    listRuns,
    cleanupOldRuns
  }
}

module.exports = {
  createWorkflowExecutor,
  NODE_STATUSES,
  RUN_STATUSES,
  EDGE_TYPES,
  COMPLEXITY_LIMITS,
  EXECUTION_DEFAULTS,
  ERROR_CODES,
  validateWorkflow,
  detectCycles,
  topologicalSort,
  assessComplexity
}
