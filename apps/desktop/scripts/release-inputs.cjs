'use strict'

const GENERATED_RELEASE_INPUTS = [
  /^apps\/desktop\/(?:build|dist|release)\//,
  /^apps\/desktop\/test-results\//,
  /^output\//,
  /^\.playwright-cli\//,
  /^apps\/desktop\/\.playwright-cli\//
]

const statusPath = line => {
  const raw = String(line || '').slice(3).trim().replace(/\\/g, '/')
  const renameTarget = raw.includes(' -> ') ? raw.slice(raw.lastIndexOf(' -> ') + 4) : raw

  return renameTarget.replace(/^"|"$/g, '')
}

const unexpectedReleaseInputs = status => String(status || '')
  .split(/\r?\n/)
  .filter(Boolean)
  .map(statusPath)
  .filter(file => !GENERATED_RELEASE_INPUTS.some(pattern => pattern.test(file)))

module.exports = { GENERATED_RELEASE_INPUTS, statusPath, unexpectedReleaseInputs }
