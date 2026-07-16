'use strict'

const crypto = require('node:crypto')

const textHash = text => crypto.createHash('sha256').update(String(text || '')).digest('hex')

module.exports = { textHash }
