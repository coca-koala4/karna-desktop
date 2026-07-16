'use strict'

const evidenceForPatterns = ({ lineNumberAt, textSnippet }) => (docs, patterns, limit = 4) => {
  const hits = []
  for (const doc of docs) for (const re of patterns) {
    const regex = re instanceof RegExp ? new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`) : re
    let match
    while ((match = regex.exec(doc.text))) {
      hits.push(`${doc.rel}:${lineNumberAt(doc.text, match.index)} - ${textSnippet(doc.text, match.index, 180)}`)
      if (hits.length >= limit) return hits
    }
  }
  return hits
}

const normalizeDraftGuardEvidence = value => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 240)
const draftGuardEntityName = row => String(row?.name || row?.title || row?.label || row?.id || '').trim()

function buildSafetyRisks({ docs, soulAuthors = [] }) {
  const joined = docs.map(doc => `\n[${doc.rel}]\n${doc.text}`).join('\n')
  const risks = []
  const addRisk = (dimension, level, title, evidence, suggestion, policy = '') => risks.push({ id: `risk_${risks.length + 1}`, dimension, level, title, evidence: evidence.filter(Boolean).slice(0, 10), suggestion, policy })
  const safetyHits = (patterns, limit = 8) => evidenceForPatterns({
    lineNumberAt: (text, index) => String(text || '').slice(0, Math.max(0, index)).split(/\r?\n/).length,
    textSnippet: (text, index, size = 140) => String(text || '').slice(Math.max(0, index - Math.floor(size / 2)), index + size).replace(/\s+/g, ' ').trim()
  })(docs, patterns, limit)

  const clonePatterns = [/\b(?:write like|imitate|in the style of|copy the style of)\b/gi, new RegExp('(?:\u6a21\u4eff|\u4eff\u5199|\u7167\u7740|\u50cf.*\u4e00\u6837\u5199|\u539f\u6837\u6539\u5199|\u6d17\u7a3f|\u642c\u8fd0)', 'g')]
  const cloneHits = safetyHits(clonePatterns, 6)
  if (cloneHits.length) addRisk('copyright', 'high', 'Possible style-clone or copying request', cloneHits, 'Convert the request into abstract craft principles, critique, or risk-reduction advice. Do not produce author-clone prose.', 'no_style_clone')

  const longQuotePatterns = [/\b(?:verbatim|full chapter|full text|entire article|copy all)\b/gi, new RegExp('(?:\u5168\u6587|\u6574\u7ae0|\u5b8c\u6574\u590d\u5236|\u539f\u6587\u7167\u642c|\u9010\u5b57)', 'g')]
  const quoteHits = safetyHits(longQuotePatterns, 6)
  if (quoteHits.length) addRisk('copyright', 'high', 'Possible long copyrighted text reproduction risk', quoteHits, 'Summarize, transform with user-owned text only, or quote only short necessary excerpts with attribution.', 'limit_verbatim')

  const platformPatterns = [new RegExp('(?:\u672a\u6210\u5e74|\u513f\u7ae5|\u5c0f\u5b66\u751f|\u521d\u4e2d\u751f).{0,30}(?:\u6027|\u88f8|\u7325\u4eb5|\u8272\u60c5)', 'g'), /(?:self-harm|suicide|kill myself|how to die)/gi, new RegExp('(?:\u81ea\u6740|\u81ea\u6b8b|\u600e\u4e48\u6b7b|\u8f7b\u751f)', 'g'), new RegExp('(?:\u6781\u7aef\u8840\u8165|\u5206\u5c38|\u8650\u6740|\u9177\u5211)', 'g')]
  const platformHits = safetyHits(platformPatterns, 8)
  if (platformHits.length) addRisk('platform_safety', 'high', 'Potential platform safety risk', platformHits, 'Use non-graphic handling, remove sexualized minors, and route self-harm content to support/safety framing.', 'platform_safe_revision')

  const privacyPatterns = [/\b\d{3}[- ]?\d{3}[- ]?\d{4}\b/g, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, new RegExp('(?:\u8eab\u4efd\u8bc1|\u624b\u673a\u53f7|\u4f4f\u5740|\u5bb6\u5ead\u4f4f\u5740|\u94f6\u884c\u5361)', 'g')]
  const privacyHits = safetyHits(privacyPatterns, 8)
  if (privacyHits.length) addRisk('privacy', 'medium', 'Possible personal information exposure', privacyHits, 'Redact direct identifiers before sharing drafts or sending context to a model.', 'redact_pii')

  if (soulAuthors.some(author => author.profile_version > 0)) addRisk('soul_workshop', 'info', 'Soul Workshop method profiles available', soulAuthors.filter(a => a.profile_version > 0).slice(0, 5).map(a => `${a.name}: profile ${a.profile_version}`), 'Use profiles only for critique and transferable craft methods; never clone protected expression.', 'safe_transfer_only')
  if (!risks.length) addRisk('baseline', 'info', 'No obvious safety or copyright risk found', [`Checked ${docs.length} source entries with ${joined.length} characters.`], 'Still perform human review before publication; automated checks are incomplete.', 'human_review_required')
  return { risks, joined }
}

module.exports = { evidenceForPatterns, normalizeDraftGuardEvidence, draftGuardEntityName, buildSafetyRisks }
