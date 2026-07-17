'use strict'

const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const root = path.resolve(__dirname, '..', 'src')
const emojiPattern = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u
const englishSentencePattern = /\b[A-Za-z]{3,}(?:[\s/+-]+[A-Za-z]{3,})+\b/
const chinesePattern = /[\u3400-\u9fff]/
const allowedEnglish = [
  /^Karna Flow Studio$/,
  /^Writer OS$/,
  /^GitHub Release URL$/,
  /^HTTPS URL$/,
  /^OpenRouter$/,
  /^Nous Portal$/,
  /^WPS Office$/,
  /^tools\/(?:list|call)$/,
  /^~\/.+$/,
  /^API Key$/,
  /^OAuth$/,
  /^MCP$/,
  /^Markdown$/
]

function walk(dir, result = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!['dist', 'node_modules'].includes(entry.name)) walk(absolute, result)
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.(?:test|spec)\./.test(entry.name)) continue
    if (absolute.includes(`${path.sep}i18n${path.sep}`) && !absolute.endsWith(`${path.sep}zh.ts`)) continue
    result.push(absolute)
  }
  return result
}

function lineOf(source, node) {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1
}

const problems = []
for (const file of walk(root)) {
  const content = fs.readFileSync(file, 'utf8')
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const visit = node => {
    if (ts.isJsxText(node)) {
      const text = node.getText(source).replace(/\s+/g, ' ').trim()
      if (text && emojiPattern.test(text)) problems.push(`${path.relative(root, file)}:${lineOf(source, node)} UI emoji: ${text}`)
      if (text && !chinesePattern.test(text) && englishSentencePattern.test(text) && !allowedEnglish.some(pattern => pattern.test(text))) {
        problems.push(`${path.relative(root, file)}:${lineOf(source, node)} English JSX copy: ${text}`)
      }
    }
    if (ts.isStringLiteralLike(node) && emojiPattern.test(node.text)) {
      problems.push(`${path.relative(root, file)}:${lineOf(source, node)} emoji string: ${node.text}`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
}

if (problems.length) {
  console.error(`[release-ui] blocked by ${problems.length} visible copy issue(s):`)
  for (const problem of problems.slice(0, 100)) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log('[release-ui] no UI emoji or unapproved English JSX sentences')
