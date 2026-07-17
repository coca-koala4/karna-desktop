const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const appRoot = path.resolve(__dirname, '..')
const repoRoot = path.resolve(appRoot, '..', '..')
const sourceRoot = path.join(repoRoot, 'skills')
const targetRoot = path.join(appRoot, 'build', 'skill-marketplace')
const skillsTarget = path.join(targetRoot, 'skills')

const DENY_DIR = new Set(['.git', '.github', 'node_modules', '.venv', 'venv', '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', 'test', 'tests', 'test-results', 'playwright-report', 'dist', 'build', 'coverage', '.cache'])
const DENY_FILE_RE = /(^|[\\/])(?:\.env|.*\.log|.*\.map|.*\.patch|.*\.bak|.*\.tmp|.*\.png|.*\.jpg|.*\.jpeg|.*\.webp|.*\.gif|.*\.zip|.*\.7z|.*\.rar|.*\.exe|.*\.dll|.*\.pdb)$/i
const SECRET_RE = /(sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|ghp_[0-9A-Za-z]{20,}|-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----)/
const MAX_FILE_BYTES = 512 * 1024

const zhCategory = top => ({
  apple: 'Apple 生态',
  'autonomous-ai-agents': '智能体与自动化',
  'computer-use': '电脑控制',
  creative: '创意生产',
  'data-science': '数据科学',
  dogfood: 'Karna 内测',
  email: '邮件',
  github: 'GitHub',
  karna: 'Karna 官方扩展',
  media: '媒体处理',
  mlops: 'MLOps',
  'note-taking': '笔记知识库',
  productivity: '生产力',
  research: '研究',
  'smart-home': '智能家居',
  'social-media': '社交媒体',
  'software-development': '软件开发',
  yuanbao: '元宝生态'
}[top] || '扩展 Skill')

function rmrf(p) { fs.rmSync(p, { recursive: true, force: true }) }
function ensure(p) { fs.mkdirSync(p, { recursive: true }) }
function listSkillFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (DENY_DIR.has(entry.name.toLowerCase())) continue
      listSkillFiles(full, out)
    } else if (entry.isFile() && entry.name === 'SKILL.md') {
      out.push(full)
    }
  }
  return out
}
function parseFrontmatter(text) {
  const fm = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/)
  const data = {}
  if (fm) {
    for (const line of fm[1].split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z0-9_-]+):\s*(.+)$/)
      if (m) data[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
    }
  }
  return data
}
function titleFromSlug(slug) {
  return slug.split(/[-_]/).filter(Boolean).map(x => x.charAt(0).toUpperCase() + x.slice(1)).join(' ')
}
function safeVisible(s) {
  return String(s || '').replace(/Hermes Agent/gi, 'Karna Agent').replace(/Hermes/gi, 'Karna 兼容运行时').replace(/Nous Research/gi, 'Karna 上游兼容层')
}
function riskFor(rel) {
  const v = rel.toLowerCase()
  if (/(hack|attack|exploit|pentest|red[-_ ]?team|security|credential|cookie)/.test(v)) return 'high'
  if (/(computer-use|autonomous|browser|shell|github|email)/.test(v)) return 'medium'
  return 'low'
}
function copySafe(src, dst) {
  const st = fs.statSync(src)
  if (st.isDirectory()) {
    if (DENY_DIR.has(path.basename(src).toLowerCase())) return
    ensure(dst)
    for (const entry of fs.readdirSync(src)) copySafe(path.join(src, entry), path.join(dst, entry))
    return
  }
  if (!st.isFile()) return
  const rel = src.replace(sourceRoot, '')
  if (DENY_FILE_RE.test(rel) || st.size > MAX_FILE_BYTES) return
  const textExt = /\.(md|txt|json|ya?ml|toml|py|js|ts|tsx|sh|ps1)$/i.test(src)
  if (textExt) {
    const text = fs.readFileSync(src, 'utf8')
    if (SECRET_RE.test(text)) return
  }
  ensure(path.dirname(dst))
  fs.copyFileSync(src, dst)
}
function hashDir(dir) {
  const h = crypto.createHash('sha256')
  const walk = p => {
    for (const entry of fs.readdirSync(p, { withFileTypes: true }).sort((a,b)=>a.name.localeCompare(b.name))) {
      const full = path.join(p, entry.name)
      if (entry.isDirectory()) walk(full)
      else { h.update(path.relative(dir, full)); h.update(fs.readFileSync(full)) }
    }
  }
  walk(dir)
  return h.digest('hex')
}

if (!fs.existsSync(sourceRoot)) throw new Error(`Skill source not found: ${sourceRoot}`)
rmrf(targetRoot); ensure(skillsTarget)
const skillFiles = listSkillFiles(sourceRoot)
const entries = []
for (const skillFile of skillFiles) {
  const dir = path.dirname(skillFile)
  const relDir = path.relative(sourceRoot, dir).replace(/\\/g, '/')
  const parts = relDir.split('/')
  const slug = parts[parts.length - 1]
  const top = parts[0]
  const text = fs.readFileSync(skillFile, 'utf8')
  if (SECRET_RE.test(text)) continue
  const fm = parseFrontmatter(text)
  const id = relDir.replace(/[^A-Za-z0-9_-]+/g, '.')
  const dst = path.join(skillsTarget, relDir)
  copySafe(dir, dst)
  entries.push({
    id,
    slug,
    name: safeVisible(fm.name || titleFromSlug(slug)),
    description: safeVisible(fm.description || text.split(/\r?\n/).find(line => line.trim() && !line.startsWith('---')) || `${titleFromSlug(slug)} 扩展 Skill。`).slice(0, 360),
    category: zhCategory(top),
    category_id: top,
    relative_path: `skills/${relDir}`,
    source_type: 'bundled-marketplace',
    source_pack: 'Karna 外置 Skill 市场',
    language: 'zh-CN',
    risk_level: riskFor(relDir),
    installable: true,
    installed: false,
    is_builtin: false,
    sha256: hashDir(dst),
  })
}
entries.sort((a,b) => a.category.localeCompare(b.category, 'zh-Hans-CN') || a.name.localeCompare(b.name, 'zh-Hans-CN'))
const manifest = { version: 1, generated_at: new Date().toISOString(), source: 'repo://skills', count: entries.length, entries }
fs.writeFileSync(path.join(targetRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')
if (entries.length < 400) throw new Error(`Expected at least 400 marketplace skills, staged ${entries.length}`)
console.log(`[skill-marketplace] staged ${entries.length} external skills to ${targetRoot}`)
