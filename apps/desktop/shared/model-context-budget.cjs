'use strict'

// Offline fallback catalogue. Keep the values aligned with
// agent/model_metadata.py; live provider metadata and user overrides win.
const MODEL_CONTEXT_LENGTHS = Object.freeze({
  'gpt-5.5': 1_050_000, 'gpt-5.4-mini': 400_000, 'gpt-5.4-nano': 400_000,
  'gpt-5.4': 1_050_000, 'gpt-5.3-codex-spark': 128_000,
  'gpt-5.1-chat': 128_000, 'gpt-5': 400_000, 'gpt-4.1': 1_047_576,
  'gpt-4': 128_000, 'claude-fable': 1_000_000,
  'claude-opus-4.8': 1_000_000, 'claude-opus-4.7': 1_000_000,
  'claude-opus-4.6': 1_000_000, 'claude-sonnet-4.6': 1_000_000,
  claude: 200_000, gemini: 1_048_576,
  'deepseek-v4-pro': 1_000_000, 'deepseek-v4-flash': 1_000_000,
  'deepseek-chat': 1_000_000, 'deepseek-reasoner': 1_000_000,
  deepseek: 128_000, 'qwen3.6-plus': 1_048_576,
  'qwen3-coder-plus': 1_000_000, 'qwen3-coder': 262_144,
  qwen: 131_072, 'minimax-m3': 1_000_000, minimax: 204_800,
  'glm-5.2': 1_048_576, glm: 202_752, 'grok-4.20': 2_000_000,
  'grok-4-fast': 2_000_000, 'grok-4.3': 1_000_000,
  'grok-4': 256_000, grok: 131_072, kimi: 262_144, llama: 131_072
})

const DEFAULT_CONTEXT_LENGTH = 256_000

function positiveInteger(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0
}

function clampRatio(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 && parsed < 1 ? parsed : fallback
}

function resolveAdvertisedContextLength(model, providerMetadataLength) {
  const providerLength = positiveInteger(providerMetadataLength)
  if (providerLength) return { tokens: providerLength, source: 'provider_metadata' }

  const normalized = String(model || '').trim().toLowerCase()
  const match = Object.entries(MODEL_CONTEXT_LENGTHS)
    .sort((a, b) => b[0].length - a[0].length)
    .find(([key]) => normalized.includes(key.toLowerCase()))
  return match
    ? { tokens: match[1], source: 'catalog' }
    : { tokens: DEFAULT_CONTEXT_LENGTH, source: 'fallback' }
}

function resolveModelContextBudget(options = {}) {
  const advertised = resolveAdvertisedContextLength(options.model, options.providerContextLength)
  const configured = positiveInteger(options.configuredContextLength)
  const effective = configured || advertised.tokens
  const compressionThreshold = clampRatio(options.compressionThreshold, effective >= 1_000_000 ? 0.85 : 0.8)
  const outputReserve = positiveInteger(options.outputReserveTokens)
    || Math.min(32_768, Math.max(4_096, Math.floor(effective * 0.02)))
  const safetyReserve = Math.max(4_096, Math.floor(effective * 0.05))
  const availableInput = Math.max(1_000, effective - outputReserve - safetyReserve)
  const contextShare = clampRatio(options.workflowContextRatio, 0.6)

  return {
    advertisedContextTokens: advertised.tokens,
    configuredContextTokens: configured || null,
    effectiveContextTokens: effective,
    compressionStartsAt: Math.floor(effective * compressionThreshold),
    compressionThreshold,
    outputReserveTokens: outputReserve,
    safetyReserveTokens: safetyReserve,
    availableInputTokens: availableInput,
    workflowContextTokens: Math.max(1_000, Math.floor(availableInput * contextShare)),
    source: configured ? 'user_override' : advertised.source
  }
}

module.exports = {
  DEFAULT_CONTEXT_LENGTH,
  MODEL_CONTEXT_LENGTHS,
  positiveInteger,
  resolveAdvertisedContextLength,
  resolveModelContextBudget
}
