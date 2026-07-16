'use strict'

const assert = require('node:assert/strict')
const test = require('node:test')

const { CONFIG_SCHEMA, createDefaultConfig } = require('./config-service.cjs')

test('config defaults are isolated copies with the required desktop fields', () => {
  const first = createDefaultConfig()
  const second = createDefaultConfig()

  first.terminal.cwd = 'changed'

  assert.equal(second.terminal.cwd, 'D:\\Agent')
  assert.equal(second.display.language, 'zh')
  assert.equal(second.approvals.mode, 'on-request')
  assert.equal(second.model_context_length, 0, 'desktop must not impose a hidden fixed context cap')
  assert.equal(CONFIG_SCHEMA.fields['terminal.cwd'].type, 'string')
  assert.ok(Object.keys(CONFIG_SCHEMA.fields).length > 50)
})


test('legacy display personality is not part of editable config schema', () => {
  const config = createDefaultConfig()

  assert.equal(config.display.personality, undefined)
  assert.equal(CONFIG_SCHEMA.fields['display.personality'], undefined)
})
