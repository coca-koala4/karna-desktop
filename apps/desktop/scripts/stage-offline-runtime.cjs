'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const { shouldIncludeOfflineRuntimePath } = require('./offline-runtime-filter.cjs')

const appRoot = path.resolve(__dirname, '..')
const packageJson = JSON.parse(fs.readFileSync(path.join(appRoot, 'package.json'), 'utf8'))
const source = process.env.KARNA_OFFLINE_RUNTIME_SOURCE && path.resolve(process.env.KARNA_OFFLINE_RUNTIME_SOURCE)
const target = path.join(appRoot, 'build', 'offline-runtime')

if (!source || !fs.existsSync(source)) {
  throw new Error(
    'KARNA_OFFLINE_RUNTIME_SOURCE is required for release packaging and must point to a prepared offline runtime. ' +
      'Online git clone/bootstrap is intentionally disabled.'
  )
}
if (!fs.existsSync(path.join(source, 'hermes-agent', 'hermes_cli'))) {
  throw new Error('Offline runtime source is missing hermes-agent/hermes_cli')
}

fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(target, { recursive: true })
const files = []


function patchRuntimeBranding(root) {
  const textFile = /\.(py|json|toml|md|txt|yml|yaml|cfg|ini)$/i
  const zh = {
    runtime: '\u517c\u5bb9\u8fd0\u884c\u65f6',
    welcome: '\u6b22\u8fce\u4f7f\u7528 Karna',
    ui: 'Karna \u754c\u9762',
    mcpBlocked: '\u5f53\u524d\u6743\u9650\u6a21\u5f0f\u4e0d\u5141\u8bb8\u8c03\u7528 MCP \u5de5\u5177\u3002\u8bf7\u5728 Karna \u5e95\u90e8\u6743\u9650\u6a21\u5f0f\u6216\u8bbe\u7f6e\u4e2d\u5207\u6362\u5230\u201c\u7535\u8111\u6388\u6743\u6a21\u5f0f\u201d\u540e\u91cd\u8bd5\u3002',
    shellBlocked: '\u5f53\u524d\u6743\u9650\u6a21\u5f0f\u4e0d\u5141\u8bb8\u6267\u884c\u7ec8\u7aef\u547d\u4ee4\u3002\u8bf7\u5728 Karna \u5e95\u90e8\u6743\u9650\u6a21\u5f0f\u6216\u8bbe\u7f6e\u4e2d\u5207\u6362\u5230\u201c\u7535\u8111\u6388\u6743\u6a21\u5f0f\u201d\u540e\u91cd\u8bd5\u3002',
    infoBlocked: '\u5f53\u524d\u6743\u9650\u6a21\u5f0f\u4e0d\u5141\u8bb8\u8bfb\u53d6\u7cfb\u7edf\u4fe1\u606f\u3002\u8bf7\u5728 Karna \u5e95\u90e8\u6743\u9650\u6a21\u5f0f\u6216\u8bbe\u7f6e\u4e2d\u5207\u6362\u5230\u201c\u7535\u8111\u6388\u6743\u6a21\u5f0f\u201d\u540e\u91cd\u8bd5\u3002',
    projectOnly: '\u5f53\u524d\u5904\u4e8e\u201c\u4ec5\u5f53\u524d\u9879\u76ee\u201d\u6a21\u5f0f\uff0c\u7981\u6b62\u8bbf\u95ee\u7cfb\u7edf\u7ea7\u8d44\u6e90\u3002\u8bf7\u5728 Karna \u7684\u6743\u9650\u6a21\u5f0f\u4e2d\u5207\u6362\u5230\u201c\u7535\u8111\u6388\u6743\u6a21\u5f0f\u201d\u540e\u91cd\u8bd5\u3002',
    projectOnlyShell: '\u5f53\u524d\u5904\u4e8e\u201c\u4ec5\u5f53\u524d\u9879\u76ee\u201d\u6a21\u5f0f\uff0c\u7981\u6b62\u6267\u884c\u7ec8\u7aef\u547d\u4ee4\u3002\u8bf7\u5728 Karna \u7684\u6743\u9650\u6a21\u5f0f\u4e2d\u5207\u6362\u5230\u201c\u7535\u8111\u6388\u6743\u6a21\u5f0f\u201d\u6216\u201c\u9ad8\u5371\u64cd\u4f5c\u6a21\u5f0f\u201d\u540e\u91cd\u8bd5\u3002'
  }
  const replacements = [
    [/Hermes Agent/g, 'Karna Agent'],
    [/Hermes CLI/g, `Karna ${zh.runtime}`],
    [/Hermes is/g, 'Karna is'],
    [/Welcome to Hermes/g, zh.welcome],
    [/Hermes v/g, 'Karna v'],
    [/⚕ Hermes/g, 'Karna'],
    [/\(Hermes Agent\)/g, '(Karna Agent)'],
    [/Hermes \u754c\u9762/g, zh.ui],
    [/Hermes/g, 'Karna']
  ]
  const permissionReplacements = [
    [new RegExp('\u5f53\u524d\u6a21\u5f0f\u4e0d\u5141\u8bb8\u8c03\u7528MCP\u5de5\u5177\u3002\u5982\u9700\u4f7f\u7528\u5916\u90e8\u5de5\u5177\uff0c\u8bf7\u5207\u6362\u5230\'\u7535\u8111\u6388\u6743\u6a21\u5f0f\'\u3002', 'g'), zh.mcpBlocked],
    [new RegExp('\u5f53\u524d\u6a21\u5f0f\u4e0d\u5141\u8bb8\u6267\u884c\u7ec8\u7aef\u547d\u4ee4\u3002\u5982\u9700\u8fd0\u884c\u547d\u4ee4\uff0c\u8bf7\u5207\u6362\u5230\'\u7535\u8111\u6388\u6743\u6a21\u5f0f\'\u3002', 'g'), zh.shellBlocked],
    [new RegExp('\u5f53\u524d\u6a21\u5f0f\u4e0d\u5141\u8bb8\u8bfb\u53d6\u7cfb\u7edf\u4fe1\u606f\u3002\u5982\u9700\u67e5\u770b\u78c1\u76d8\u4f7f\u7528\u60c5\u51b5\u7b49\uff0c\u8bf7\u5207\u6362\u5230\'\u7535\u8111\u6388\u6743\u6a21\u5f0f\'\u3002', 'g'), zh.infoBlocked],
    [new RegExp('\u5f53\u524d\u5904\u4e8e\'\u4ec5\u5f53\u524d\u9879\u76ee\'\u6a21\u5f0f\uff0c\u7981\u6b62\u8bbf\u95ee\u7cfb\u7edf\u7ea7\u8d44\u6e90\u3002', 'g'), zh.projectOnly],
    [new RegExp('\u5f53\u524d\u5904\u4e8e\'\u4ec5\u5f53\u524d\u9879\u76ee\'\u6a21\u5f0f\uff0c\u7981\u6b62\u6267\u884c\u7ec8\u7aef\u547d\u4ee4\u3002\u5982\u9700\u6267\u884c\u547d\u4ee4\uff0c\u8bf7\u5207\u6362\u5230\'\u7535\u8111\u6388\u6743\u6a21\u5f0f\'\u6216\'\u9ad8\u5371\u64cd\u4f5c\u6a21\u5f0f\'\u3002', 'g'), zh.projectOnlyShell]
  ]
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) visit(file)
      else if (entry.isFile() && textFile.test(file)) {
        let text = fs.readFileSync(file, 'utf8')
        const before = text
        for (const [from, to] of permissionReplacements) text = text.replace(from, to)
        for (const [from, to] of replacements) text = text.replace(from, to)
        if (text !== before) fs.writeFileSync(file, text, 'utf8')
      }
    }
  }
  visit(root)
}

function collectManifestFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name)
    const relative = path.relative(target, absolute).replaceAll('\\', '/')
    if (!shouldIncludeOfflineRuntimePath(relative)) continue
    if (entry.isDirectory()) collectManifestFiles(absolute)
    else if (entry.isFile()) {
      const stat = fs.statSync(absolute)
      files.push({ path: relative, size: stat.size, sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') })
    }
  }
}

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name)
    const relative = path.relative(source, absolute).replaceAll('\\', '/')
    if (!shouldIncludeOfflineRuntimePath(relative)) continue
    if (entry.isSymbolicLink()) throw new Error(`Offline runtime may not contain symlinks: ${relative}`)
    if (entry.isDirectory()) walk(absolute)
    else if (entry.isFile()) {
      const stat = fs.statSync(absolute)
      const destination = path.join(target, ...relative.split('/'))
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.copyFileSync(absolute, destination)
      files.push({
        path: relative,
        size: stat.size,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex')
      })
    }
  }
}

walk(source)
patchRuntimeBranding(target)
files.length = 0
collectManifestFiles(target)
files.sort((a, b) => a.path.localeCompare(b.path))
fs.writeFileSync(
  path.join(target, 'runtime-manifest.json'),
  JSON.stringify({ schemaVersion: 1, desktopVersion: packageJson.version, generatedAt: new Date().toISOString(), files }, null, 2) + '\n'
)
console.log(`[offline-runtime] staged ${files.length} files for Karna ${packageJson.version}`)
