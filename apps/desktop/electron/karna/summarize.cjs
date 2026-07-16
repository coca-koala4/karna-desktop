'use strict'

function summarizeText(text, maxLen = 200) {
  const str = String(text || '')
  if (str.length <= maxLen) return str

  let truncated = str.slice(0, maxLen)
  const breakChars = ['。', '！', '？', '.', '!', '?', '\n', ' ']
  let cutIndex = -1

  for (const ch of breakChars) {
    const idx = truncated.lastIndexOf(ch)
    if (idx > cutIndex) {
      cutIndex = idx
    }
  }

  if (cutIndex > 0) {
    truncated = truncated.slice(0, cutIndex + 1)
  }

  return truncated + '…'
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

module.exports = { summarizeText, cosineSimilarity }
