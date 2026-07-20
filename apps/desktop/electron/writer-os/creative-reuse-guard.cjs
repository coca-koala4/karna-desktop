'use strict'

const MARKDOWN_DIRS = ['规划', '设定', '正文', '输出', 'manuscript', 'notes', 'drafts', 'bible', 'narrative-state', 'memory']
const SKIP_DIRS = ['.git', '.karna', 'node_modules', 'versions', 'exports', 'workflow_artifacts', 'safety', 'capabilities', 'benchmarks', 'roadmap', 'delivery', 'rag', 'wiki', 'graph', 'critics', 'artifacts']

const NAME_PATTERNS = [
  /(?:主角|配角|人物|姓名|名字)[:：\s]*([^\n\r,，、。；;]{2,8})/g,
  /#{1,4}\s*(?:主角|配角|人物)[:：\s]*([^\n\r,，、。；;]{2,8})/g,
  /"name"\s*:\s*"([^"]{2,8})"/g,
  /"label"\s*:\s*"([^"]{2,8})"/g,
  /(?:他是|她是|名叫|叫做|叫)([^\n\r,，、。；;的]{2,6})/g
]

const PROFESSION_PATTERNS = [
  /(?:身份|职业|工作|职位)[:：\s]*([^\n\r,，。；;]{3,20})/g,
  /"profession"\s*:\s*"([^"]{3,30})"/g,
  /"role"\s*:\s*"([^"]{3,30})"/g,
  /"identity"\s*:\s*"([^"]{3,30})"/g,
  /(?:担任|任职于?|在[^，。；;]{1,12}(?:工作|上班|任职))/g,
  /是(?:一名|一位|个)([^，。；;的]{3,15})(?:，|。|；|;|$)/g
]

const COMMON_WORDS = new Set([
  '自己', '我们', '你们', '他们', '她们', '这个', '那个', '什么', '怎么', '为什么',
  '故事', '小说', '开始', '结束', '然后', '但是', '因为', '所以', '如果', '虽然',
  '一个', '一些', '所有', '没有', '不是', '可以', '应该', '需要', '知道', '觉得',
  '男人', '女人', '老人', '孩子', '青年', '姑娘', '小伙子', '师傅', '同志', '先生', '女士'
])

const MOTIF_KEYWORDS = [
  '管道', '水', '水龙头', '水表', '裂缝', '抄表', '给排水', '检修', '巡检',
  '雨', '雪', '雾', '风', '光', '影', '灯', '门', '窗', '墙', '路', '桥',
  '信', '信笺', '日记', '照片', '旧物', '手表', '钟', '钥匙', '锁', '镜子',
  '烟', '酒', '茶', '食物', '饭', '菜', '衣服', '帽子', '鞋子', '包',
  '树', '花', '草', '鸟', '鱼', '猫', '狗', '声音', '沉默', '呼吸'
]

function isValidName(name) {
  if (!name) return false
  const trimmed = name.trim().replace(/^["「『《]|["」』》]$/g, '')
  if (trimmed.length < 2 || trimmed.length > 8) return false
  if (COMMON_WORDS.has(trimmed)) return false
  if (/^[a-zA-Z0-9\s]+$/.test(trimmed) && trimmed.length < 3) return false
  if (/[<>{}[\]\\|=+*&^%$#@!~`]/.test(trimmed)) return false
  return true
}

function isValidProfession(prof) {
  if (!prof) return false
  const trimmed = prof.trim().replace(/^["「『《]|["」』》]$/g, '')
  if (trimmed.length < 3 || trimmed.length > 25) return false
  if (COMMON_WORDS.has(trimmed)) return false
  if (/[<>{}[\]\\|=+*&^%$#@!~`]/.test(trimmed)) return false
  if (/^(一个|一些|这个|那个)/.test(trimmed)) return false
  return true
}

function extractMatches(text, patterns) {
  const matches = new Set()
  if (!text) return []
  for (const pattern of patterns) {
    pattern.lastIndex = 0
    let m
    while ((m = pattern.exec(text)) !== null) {
      const value = (m[1] || m[0] || '').trim()
      if (value) matches.add(value)
    }
  }
  return Array.from(matches)
}

function extractMotifs(text) {
  if (!text) return []
  const motifs = new Set()
  for (const keyword of MOTIF_KEYWORDS) {
    if (text.includes(keyword)) {
      motifs.add(keyword)
    }
  }
  return Array.from(motifs)
}

function shouldSkipDir(name) {
  return SKIP_DIRS.includes(name) || name.startsWith('.')
}

function isMarkdownFile(name) {
  return /\.(md|markdown|txt)$/i.test(name)
}

function scanDirectory(dir, fs, path, maxDepth = 3, currentDepth = 0) {
  const results = []
  if (currentDepth > maxDepth || !fs.existsSync(dir)) return results
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    if (shouldSkipDir(entry.name)) continue
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...scanDirectory(fullPath, fs, path, maxDepth, currentDepth + 1))
    } else if (entry.isFile() && isMarkdownFile(entry.name)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8')
        results.push({ file: fullPath, rel: path.relative(dir, fullPath), content })
      } catch {}
    }
  }
  return results
}

function scanProject(project, fs, path) {
  const result = { names: new Set(), professions: new Set(), motifs: new Set(), title: project.title || '' }
  if (!project || !project.folder || !fs.existsSync(project.folder)) return result
  const files = scanDirectory(project.folder, fs, path, 3, 0)
  const jsonFiles = ['bible/story_bible.json', 'narrative-state/narrative_state.json', 'memory/creative_memory.json']
  for (const rel of jsonFiles) {
    const fullPath = path.join(project.folder, rel)
    if (fs.existsSync(fullPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'))
        const extractFromArray = (arr, key) => {
          if (Array.isArray(arr)) {
            for (const item of arr) {
              if (item && typeof item === 'object') {
                const val = item[key] || item.name || item.label
                if (typeof val === 'string' && val.trim()) {
                  if (key === 'name' || key === 'label') result.names.add(val.trim())
                  if (key === 'profession' || key === 'role' || key === 'identity') result.professions.add(val.trim())
                }
              }
            }
          }
        }
        extractFromArray(data.characters, 'name')
        extractFromArray(data.characters, 'profession')
        extractFromArray(data.characters, 'role')
        extractFromArray(data.entities, 'name')
        if (Array.isArray(data.nodes)) {
          for (const node of data.nodes) {
            if (node && node.type === 'character' && node.label) {
              result.names.add(String(node.label).trim())
            }
          }
        }
      } catch {}
    }
  }
  for (const { content } of files) {
    const names = extractMatches(content, NAME_PATTERNS).filter(isValidName)
    const profs = extractMatches(content, PROFESSION_PATTERNS).filter(isValidProfession)
    const motifs = extractMotifs(content)
    for (const n of names) result.names.add(n)
    for (const p of profs) result.professions.add(p)
    for (const m of motifs) result.motifs.add(m)
  }
  return {
    names: Array.from(result.names).filter(isValidName),
    professions: Array.from(result.professions).filter(isValidProfession),
    motifs: Array.from(result.motifs),
    title: result.title
  }
}

function createCreativeReuseGuardService({ fs, path, crypto, readJsonFile, writeJsonFile, listAllProjects, creativeIdentityService }) {
  const scanAllProjectsForReuse = (currentProject) => {
    const allProjects = listAllProjects()
    const otherProjects = allProjects.filter(p => p.id !== currentProject.id && !p.archived && p.folder && fs.existsSync(p.folder))
    const mustNotReuseNames = new Set()
    const mustNotReuseProfessions = new Set()
    const mustNotReuseCoreMotifs = new Set()
    const mustNotReuseStoryTitles = new Set()
    const sourceProjectIds = []
    for (const other of otherProjects) {
      try {
        const scan = scanProject(other, fs, path)
        for (const n of scan.names) mustNotReuseNames.add(n)
        for (const p of scan.professions) mustNotReuseProfessions.add(p)
        for (const m of scan.motifs) mustNotReuseCoreMotifs.add(m)
        if (other.title) mustNotReuseStoryTitles.add(other.title)
        sourceProjectIds.push(other.id)
      } catch {}
    }
    creativeIdentityService.updateReuseGuard(currentProject, {
      must_not_reuse_names: Array.from(mustNotReuseNames),
      must_not_reuse_professions: Array.from(mustNotReuseProfessions),
      must_not_reuse_core_motifs: Array.from(mustNotReuseCoreMotifs).slice(0, 30),
      must_not_reuse_story_titles: Array.from(mustNotReuseStoryTitles),
      source_project_ids: sourceProjectIds
    })
    return {
      must_not_reuse_names: Array.from(mustNotReuseNames),
      must_not_reuse_professions: Array.from(mustNotReuseProfessions),
      must_not_reuse_core_motifs: Array.from(mustNotReuseCoreMotifs).slice(0, 30),
      must_not_reuse_story_titles: Array.from(mustNotReuseStoryTitles),
      source_project_ids: sourceProjectIds,
      other_project_count: otherProjects.length
    }
  }
  const checkGeneratedContent = (project, content) => {
    const identity = creativeIdentityService.readCreativeIdentity(project)
    if (!identity || !identity.reuse_guard || !identity.reuse_guard.enabled) {
      return { status: 'ok', matches: [], recommendations: [] }
    }
    const guard = identity.reuse_guard
    const generatedNames = extractMatches(content, NAME_PATTERNS).filter(isValidName)
    const generatedProfessions = extractMatches(content, PROFESSION_PATTERNS).filter(isValidProfession)
    const generatedMotifs = extractMotifs(content)
    const matches = []
    for (const name of generatedNames) {
      if (guard.must_not_reuse_names.includes(name)) {
        matches.push({ type: 'character_name', value: name, severity: 'high' })
      }
    }
    for (const prof of generatedProfessions) {
      if (guard.must_not_reuse_professions.some(p => p.includes(prof) || prof.includes(p))) {
        matches.push({ type: 'profession', value: prof, severity: 'medium' })
      }
    }
    const nameMatches = matches.filter(m => m.type === 'character_name').length
    const profMatches = matches.filter(m => m.type === 'profession').length
    let status = 'ok'
    if (nameMatches >= 1 && profMatches >= 1) status = 'high'
    else if (nameMatches >= 1 || profMatches >= 2) status = 'warning'
    const reportFile = creativeIdentityService.reuseGuardReportPath(project)
    const report = {
      version: 1,
      project_id: project.id,
      checked_at: new Date().toISOString(),
      status: status === 'high' ? 'warning' : status,
      matches,
      recommendations: status !== 'ok'
        ? ['Karna 检测到本次生成疑似复用了其它项目的角色或职业，建议重新生成差异化版本。']
        : []
    }
    try { writeJsonFile(reportFile, report) } catch {}
    return report
  }
  const buildReuseGuardContext = (project) => {
    const identity = creativeIdentityService.ensureCreativeIdentity(project).identity
    if (!identity.reuse_guard || !identity.reuse_guard.enabled || !identity.reuse_guard.last_scanned_at) {
      scanAllProjectsForReuse(project)
    }
    const updatedIdentity = creativeIdentityService.readCreativeIdentity(project)
    return updatedIdentity?.reuse_guard || {
      must_not_reuse_names: [],
      must_not_reuse_professions: [],
      must_not_reuse_core_motifs: [],
      must_not_reuse_story_titles: [],
      source_project_ids: []
    }
  }
  return {
    scanAllProjectsForReuse,
    checkGeneratedContent,
    buildReuseGuardContext,
    scanProject
  }
}

module.exports = { createCreativeReuseGuardService }
