'use strict'
const path = require('path')
const fs = require('fs')

const appRoot = __dirname
const workflowFile = path.resolve('D:\\Agent\\projects\\karna-hermes\\karna-builtin\\workflows\\critic-revision.json')
console.log('Loading workflow from:', workflowFile)
console.log('Exists:', fs.existsSync(workflowFile))

const raw = fs.readFileSync(workflowFile, 'utf8')
const workflow = JSON.parse(raw)
console.log('Workflow loaded, nodes:', workflow.nodes.length, 'edges:', workflow.edges.length)

const workflowValidation = require('./writer-os/workflow-validation.cjs')
console.log('\n=== validateWorkflowGraph (backend) ===')
try {
  const result = workflowValidation.validateWorkflowGraph(workflow)
  console.log('valid:', result.valid)
  if (!result.valid) {
    console.log('errors:', JSON.stringify(result.errors, null, 2))
  } else {
    console.log('Backend validation OK')
  }
} catch(e) {
  console.error('Backend validation CRASHED:', e.message)
  console.error(e.stack)
}

console.log('\nLoop edge e13:')
const loopEdge = workflow.edges.find(e => e.id === 'e13')
console.log(JSON.stringify(loopEdge, null, 2))
console.log('\nAll node types:', [...new Set(workflow.nodes.map(n => n.type))])
console.log('All edge types:', [...new Set(workflow.edges.map(e => e.type || 'normal'))])

console.log('\n=== Simulate arrangeNodes topology ===')
const nodeIds = workflow.nodes.map(n => n.id)
const indegree = new Map(nodeIds.map(id => [id, 0]))
const outgoing = new Map(nodeIds.map(id => [id, []]))

for (const edge of workflow.edges) {
  if (!indegree.has(edge.source) || !indegree.has(edge.target)) continue
  if (edge.type === 'loop') {
    console.log(`Skipping loop edge for topology: ${edge.source} -> ${edge.target}`)
    continue
  }
  indegree.set(edge.target, (indegree.get(edge.target) || 0) + 1)
  outgoing.get(edge.source)?.push(edge.target)
}

console.log('Initial indegree:', Object.fromEntries(indegree))
const queue = nodeIds.filter(id => (indegree.get(id) || 0) === 0)
console.log('Start queue:', queue)
const ordered = []
while (queue.length) {
  const id = queue.shift()
  if (ordered.includes(id)) continue
  ordered.push(id)
  for (const next of outgoing.get(id) || []) {
    indegree.set(next, (indegree.get(next) || 0) - 1)
    if ((indegree.get(next) || 0) <= 0) queue.push(next)
  }
}
for (const id of nodeIds) {
  if (!ordered.includes(id)) {
    console.log('Node not in topo order (cycle, added at end):', id, 'remaining indegree:', indegree.get(id))
    ordered.push(id)
  }
}
console.log('Ordered nodes:', ordered)
console.log('Total ordered:', ordered.length)
