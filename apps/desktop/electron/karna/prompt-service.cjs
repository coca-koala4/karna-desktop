/* eslint-disable no-unused-vars -- service factory signature is intentionally uniform. */
'use strict'

function createPromptService({ fs, path, karnaPaths, storage }) {
  function enhancePrompt(text, mode) {
    return text
  }

  function wrapKarnaMode(messages) {
    return messages
  }

  return { enhancePrompt, wrapKarnaMode }
}

module.exports = { createPromptService }
