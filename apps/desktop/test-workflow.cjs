'use strict'
const path = require('path')
const fs = require('fs')

const appRoot = path.join(__dirname, '..')
const workflowFile = path.join(appRoot, '..', 'karna-builtin', 'workflows', 'critic-revision.json')
console.log('Loading workflow from:', workflowFile)
console.log('Exists:', fs.existsSync(workflowFile))

const raw = fs.readFileSync(workflowFile, 'utf8')
const workflow = JSON.parse(raw)
console.log('Workflow loaded, nodes:', workflow.nodes.length, 'edges:', workflow.edges.length)

process.chdir(path.join(__dirname, '..'))

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
  console.error('Backend validation CRASHED:', e.message, e.stack)
}

console.log('\n=== Testing migrateWorkflow/validateWorkflow (frontend schema via tsx? no, just check structure) ===')
console.log('Loop edge e13:')
const loopEdge = workflow.edges.find(e => e.id === 'e13')
console.log(JSON.stringify(loopEdge, null, 2))
console.log('\nAll node types:', [...new Set(workflow.nodes.map(n => n.type))])
console.log('All edge types:', [...new Set(workflow.edges.map(e => e.type || 'normal'))])
