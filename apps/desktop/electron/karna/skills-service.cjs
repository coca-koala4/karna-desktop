'use strict'

function createSkillsService({
  env = process.env,
  fs,
  notConfigured,
  path,
  readJsonState,
  rememberLog,
  repoRoot,
  skillI18n,
  writeJsonState,
  writeInventoryState = writeJsonState
}) {
  const normalizeStateMap = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const readSkillsState = () => readJsonState('skills_state.json', { version: 1, enabled: {}, last_used: {}, uninstalled: {} })
  const writeSkillsState = state => writeJsonState('skills_state.json', {
    version: 1,
    enabled: normalizeStateMap(state.enabled),
    last_used: normalizeStateMap(state.last_used),
    uninstalled: normalizeStateMap(state.uninstalled)
  })
  const getUserSkillRoot = () => path.join(env.USERPROFILE || 'D:\\Agent', '.codex', 'skills')
  const INVENTORY_FILE = 'skills_inventory.json'
  let lastCatalog = null
  const isPathInside = (child, parent) => {
    const relative = path.relative(path.resolve(parent), path.resolve(child))

    return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative)
  }
  const disabledSkillRootFor = root => path.join(root, '.disabled')
  const sanitizeSkillName = value => {
    const raw = String(value || '').trim().replace(/\s+/g, '-')
    // eslint-disable-next-line no-control-regex -- Windows filename sanitization deliberately strips control bytes.
    const safe = raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')

    return safe || `skill-${Date.now()}`
  }

  const skillsRoot = () => path.join(repoRoot, 'skills')
  const karnaWriterRoot = () => path.join(skillsRoot(), 'karna', 'writer')
  const karnaSystemRoot = () => path.join(skillsRoot(), 'karna', 'system')

  const hotSkills = new Set([
    'computer-use', 'claude-code', 'codex', 'opencode',
    'comfyui', 'excalidraw', 'humanizer', 'architecture-diagram',
    'github-code-review', 'github-pr-workflow', 'github-repo-management',
    'jupyter-live-kernel', 'huggingface-hub', 'vllm', 'llama-cpp',
    'find-skill', 'create-skill',
    'hack', 'sqli-sql-injection', 'xss-cross-site-scripting',
    'ssrf-server-side-request-forgery', 'recon-for-sec',
    'design', 'banner-design', 'notion', 'obsidian',
    'powerpoint', 'google-workspace', 'ocr-and-documents'
  ])
  const knownRootCategories = new Set([
    'apple', 'autonomous-ai-agents', 'computer-use', 'creative', 'data-science', 'dogfood',
    'email', 'github', 'media', 'mlops', 'note-taking', 'productivity',
    'research', 'smart-home', 'social-media', 'software-development', 'yuanbao'
  ])
  const categoryMerge = {
    'Supervisor-Skills-main': 'research-writing-skill-main',
    'XiaohongshuSkills-main': 'social-media',
    apple: 'productivity',
    'computer-use': 'productivity',
    'data-science': 'research-writing-skill-main',
    dogfood: 'productivity',
    email: 'productivity',
    general: 'productivity',
    github: 'software-development',
    'interview-coach-skill-main': 'autonomous-ai-agents',
    media: 'social-media',
    'note-taking': 'productivity',
    research: 'research-writing-skill-main',
    'smart-home': 'autonomous-ai-agents',
    system: 'productivity',
    'taste-skill-main': 'creative',
    writer: 'research-writing-skill-main',
    yuanbao: 'autonomous-ai-agents',
    'zhangxuefeng-skill-main': 'nuwa-skill-main'
  }

  const normalizePathKey = value => path.resolve(value).toLowerCase()
  const relativeSkillPath = (root, skillPath) => path.relative(root, path.dirname(skillPath)).split(path.sep).join('/') || '.'
  const sourceIdFor = (rootKey, root, skillPath) => `${rootKey}:${relativeSkillPath(root, skillPath)}`

  function skillRoots() {
    const candidates = [
      { key: 'repo', path: skillsRoot() },
      { key: 'codex', path: getUserSkillRoot() },
      { key: 'codex', path: path.join(env.USERPROFILE || '', '.codex', 'skills') },
      { key: 'agents', path: path.join(env.USERPROFILE || '', '.agents', 'skills') }
    ].filter(row => row.path)
    const seen = new Set()

    return candidates.filter(row => {
      const key = normalizePathKey(row.path)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  function skillFiles(root, diagnostics) {
    const found = []
    const visit = dir => {
      let entries = []

      try {
        if (!fs.existsSync(dir)) {
          return
        }
        entries = fs.readdirSync(dir, { withFileTypes: true })
      } catch (err) {
        rememberLog(`Skill scan skipped ${dir}: ${err.message}`)
        diagnostics.errors.push({ path: dir, message: err.message })

        return
      }
      if (entries.some(entry => entry.isFile() && entry.name === 'SKILL.md')) {
        found.push(path.join(dir, 'SKILL.md'))
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const child = path.join(dir, entry.name)
        if (entry.name === '.claude') {
          const claudeSkills = path.join(child, 'skills')
          if (normalizePathKey(root) === normalizePathKey(skillsRoot()) && fs.existsSync(claudeSkills)) {
            visit(claudeSkills)
          } else {
            diagnostics.excluded.push({ path: child, reason: 'hidden_directory' })
          }
          continue
        }
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'index-cache') {
          diagnostics.excluded.push({ path: child, reason: entry.name === '.disabled' ? 'uninstalled_store' : 'ignored_directory' })
          continue
        }
        visit(child)
      }
    }

    if (fs.existsSync(root)) {
      visit(root)
    }

    return found
  }

  function extractCategory(skillPath, root) {
    const skillDir = path.dirname(skillPath)
    const rel = path.relative(root, skillDir)
    const parts = rel.split(path.sep).filter(part => part.length > 0)
    let category = 'general'

    if (parts.length === 0) {
      category = 'general'
    } else if (parts[0] === 'karna') {
      if (parts.length >= 2 && parts[1] === 'imported') {
        category = parts.length >= 3 ? parts[2] : 'imported'
      } else if (parts.length >= 2) {
        category = parts[1] === 'writer' || parts[1] === 'system' ? parts[1] : parts[1]
      } else {
        category = 'karna'
      }
    } else if (knownRootCategories.has(parts[0])) {
      category = parts[0]
    }

    return categoryMerge[category] || category
  }

  function skillScore(skill) {
    let score = 0

    if (skill.isKarnaOfficial) {
      score += 1000
    }
    if (hotSkills.has(skill.name)) {
      score += 500
    }
    if (skill.enabled) {
      score += 100
    }

    return score
  }

  function frontmatterList(text, key) {
    const block = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/m)?.[1] || ''
    const match = block.match(new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, 'mi'))

    return match ? match[1].split(',').map(value => value.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : []
  }

  function prerequisiteCommands(text) {
    const block = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/m)?.[1] || ''
    const match = block.match(/^\s+commands:\s*\[([^\]]*)\]/mi)

    return match ? match[1].split(',').map(value => value.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : []
  }

  function scanSkills() {
    const roots = skillRoots()
    const state = readSkillsState()
    const enabledMap = normalizeStateMap(state.enabled)
    const lastUsedMap = normalizeStateMap(state.last_used)
    const uninstalledMap = normalizeStateMap(state.uninstalled)
    const sourceRows = []
    const diagnostics = { errors: [], excluded: [], roots: [] }

    for (const rootInfo of roots) {
      const root = rootInfo.path
      const rootExists = fs.existsSync(root)
      const beforeErrors = diagnostics.errors.length
      const files = skillFiles(root, diagnostics)
      diagnostics.roots.push({ key: rootInfo.key, path: root, exists: rootExists, files: files.length, readable: diagnostics.errors.length === beforeErrors })
      for (const skillPath of files) {
        try {
          const skillDir = path.dirname(skillPath)
          const key = path.basename(skillDir)
          const text = fs.readFileSync(skillPath, 'utf8')
          let description = (text.split(/\r?\n/).find(line => /^description:/i.test(line)) || '').replace(/^description:\s*/i, '').trim()

          if (!description || description === '>-' || description === '|' || description === '>') {
            description = ''
          }

          const isKarnaOfficial = skillPath.startsWith(karnaWriterRoot()) || skillPath.startsWith(karnaSystemRoot())
          const hasExplicitSetting = Object.prototype.hasOwnProperty.call(enabledMap, key)
          const category = extractCategory(skillPath, root)
          const displayDescription = skillI18n.translateSkillDescription(key, description)
          const displayCategory = skillI18n.translateCategory(category)
          const dependencies = [...new Set([...frontmatterList(text, 'dependencies'), ...prerequisiteCommands(text)])]
          const platforms = frontmatterList(text, 'platforms')
          const permissions = frontmatterList(text, 'allowed-tools')
          const source = normalizePathKey(root) === normalizePathKey(skillsRoot()) ? (isKarnaOfficial ? 'builtin' : 'community') : 'local'
          const id = sourceIdFor(rootInfo.key, root, skillPath)

          sourceRows.push({
            id,
            name: key,
            description: description || displayDescription,
            category,
            displayName: key,
            displayDescription,
            displayCategory,
            path: skillPath,
            source_root: root,
            relative_path: relativeSkillPath(root, skillPath),
            isKarnaOfficial,
            isHot: hotSkills.has(key),
            source,
            permissions,
            dependencies,
            platforms,
            installed: true,
            available: true,
            missing: false,
            lastUsed: Number(lastUsedMap[key] || 0) || null,
            enabled: hasExplicitSetting ? enabledMap[key] !== false : isKarnaOfficial
          })
        } catch (err) {
          rememberLog(`Skill scan skipped ${skillPath}: ${err.message}`)
          diagnostics.errors.push({ path: skillPath, message: err.message })
        }
      }
    }

    const priority = row => row.isKarnaOfficial ? 300 : row.source === 'local' ? 200 : 100
    const grouped = new Map()
    for (const row of sourceRows) {
      const variants = grouped.get(row.name) || []
      variants.push(row)
      grouped.set(row.name, variants)
    }
    const rows = Array.from(grouped.values()).map(variants => {
      variants.sort((a, b) => priority(b) - priority(a) || a.id.localeCompare(b.id))
      const primary = variants[0]

      return {
        ...primary,
        sourceCount: variants.length,
        conflict: variants.length > 1,
        sources: variants.map(row => ({
          id: row.id,
          path: row.path,
          source: row.source,
          sourceRoot: row.source_root,
          relativePath: row.relative_path,
          selected: row.id === primary.id,
          available: true
        }))
      }
    })

    for (const [recordId, record] of Object.entries(uninstalledMap)) {
      const name = String(record?.name || recordId)
      const disabledPath = String(record?.disabled_path || '')
      const skillPath = path.join(disabledPath, 'SKILL.md')

      if (!disabledPath || !fs.existsSync(skillPath) || rows.some(row => row.id === recordId)) {
        continue
      }

      rows.push({
        id: recordId,
        name,
        description: String(record?.description || '已卸载的本地技能，可从本页重新安装。'),
        category: 'uninstalled',
        displayName: name,
        displayDescription: String(record?.description || '已卸载的本地技能，可从本页重新安装。'),
        displayCategory: '已卸载',
        path: skillPath,
        source_root: String(record?.source_root || ''),
        original_dir: String(record?.original_dir || ''),
        disabled_path: disabledPath,
        isKarnaOfficial: false,
        isHot: false,
        source: record?.source || 'local',
        permissions: [],
        dependencies: [],
        platforms: [],
        installed: false,
        available: true,
        missing: false,
        sourceCount: 1,
        conflict: false,
        sources: [{ id: recordId, path: skillPath, source: record?.source || 'local', sourceRoot: String(record?.source_root || ''), relativePath: '', selected: true, available: true }],
        lastUsed: Number(lastUsedMap[name] || 0) || null,
        enabled: false
      })
    }

    const previous = readJsonState(INVENTORY_FILE, { version: 1, skills: [] })
    const currentNames = new Set(rows.map(row => row.name))
    const explicitlyUninstalledNames = new Set(Object.values(uninstalledMap).map(record => String(record?.name || '')).filter(Boolean))
    const retainedMissing = (Array.isArray(previous.skills) ? previous.skills : [])
      .filter(row => row?.name && !currentNames.has(row.name) && !explicitlyUninstalledNames.has(row.name))
      .map(row => ({ ...row, available: false, missing: true, enabled: false, sources: (row.sources || []).map(source => ({ ...source, available: false })) }))
    rows.push(...retainedMissing)

    const availableRows = rows.filter(row => row.available !== false)
    const logicalCount = availableRows.length
    const sourceCount = sourceRows.length + Object.keys(uninstalledMap).length
    const previousLogicalCount = Number(previous.diagnostics?.logicalCount || 0)
    const catalogDiagnostics = {
      scannedAt: new Date().toISOString(),
      logicalCount,
      sourceCount,
      conflictCount: availableRows.filter(row => row.conflict).length,
      unavailableCount: retainedMissing.length,
      uninstalledCount: Object.keys(uninstalledMap).length,
      excludedCount: diagnostics.excluded.length,
      previousLogicalCount,
      countDelta: previousLogicalCount ? logicalCount - previousLogicalCount : 0,
      driftDetected: retainedMissing.length > 0 || diagnostics.errors.length > 0 || (previousLogicalCount > 0 && logicalCount < previousLogicalCount),
      roots: diagnostics.roots,
      errors: diagnostics.errors,
      excluded: diagnostics.excluded.slice(0, 200)
    }

    lastCatalog = { skills: rows, diagnostics: catalogDiagnostics }
    writeInventoryState(INVENTORY_FILE, { version: 1, generated_at: catalogDiagnostics.scannedAt, diagnostics: catalogDiagnostics, skills: rows })

    return rows.sort((a, b) => {
      const scoreA = skillScore(a)
      const scoreB = skillScore(b)

      if (scoreB !== scoreA) {
        return scoreB - scoreA
      }

      return a.name.localeCompare(b.name)
    })
  }

  function getSkillsCatalog() {
    const skills = scanSkills()
    return { ok: true, skills, diagnostics: lastCatalog?.diagnostics || {} }
  }

  const findSkill = identifier => {
    const value = String(identifier || '').trim()
    return scanSkills().find(item => item.id === value || item.name === value)
  }

  function setSkillEnabled(name, enabled) {
    const skillName = String(name || '').trim()

    if (!skillName) {
      return notConfigured('skills', 'Missing skill name.')
    }

    const row = findSkill(skillName)

    if (!row) {
      return notConfigured('skills', `Skill not found: ${skillName}`)
    }

    const state = readSkillsState()

    state.enabled = normalizeStateMap(state.enabled)
    state.enabled[row.name] = enabled !== false
    writeSkillsState(state)

    return { ok: true, id: row.id, name: row.name, enabled: enabled !== false, path: row.path }
  }

  function uninstallSkill(name) {
    const skillName = String(name || '').trim()

    if (!skillName) {
      return notConfigured('skills', 'Missing skill name.')
    }

    const row = findSkill(skillName)

    if (!row) {
      return notConfigured('skills', `Skill not found: ${skillName}`)
    }
    if (row.installed === false) {
      return { ok: true, name: skillName, installed: false, path: row.disabled_path || row.path }
    }
    if (row.isKarnaOfficial || row.source === 'builtin') {
      return notConfigured('skills', `Built-in skill cannot be uninstalled: ${skillName}`)
    }
    if (row.source !== 'local') {
      return notConfigured('skills', `Only local skills can be uninstalled safely: ${skillName}`)
    }

    const skillDir = path.dirname(row.path)
    const sourceRoot = row.source_root || getUserSkillRoot()

    if (!isPathInside(skillDir, sourceRoot)) {
      return notConfigured('skills', 'Skill path escapes the local skill root.')
    }

    const disabledRoot = disabledSkillRootFor(sourceRoot)
    const disabledDir = path.join(disabledRoot, `${sanitizeSkillName(skillName)}-${Date.now()}`)

    fs.mkdirSync(disabledRoot, { recursive: true })
    fs.renameSync(skillDir, disabledDir)

    const state = readSkillsState()

    state.enabled = normalizeStateMap(state.enabled)
    state.uninstalled = normalizeStateMap(state.uninstalled)
    state.enabled[row.name] = false
    state.uninstalled[row.id] = {
      id: row.id,
      name: row.name,
      description: row.description,
      source: row.source,
      source_root: sourceRoot,
      original_dir: skillDir,
      disabled_path: disabledDir,
      uninstalled_at: Date.now()
    }
    writeSkillsState(state)

    return { ok: true, id: row.id, name: row.name, installed: false, path: disabledDir }
  }

  function installSkill(name) {
    const skillName = String(name || '').trim()

    if (!skillName) {
      return notConfigured('skills', 'Missing skill name.')
    }

    const state = readSkillsState()

    state.enabled = normalizeStateMap(state.enabled)
    state.uninstalled = normalizeStateMap(state.uninstalled)

    const recordKey = Object.keys(state.uninstalled).find(key => key === skillName || state.uninstalled[key]?.name === skillName)
    const record = recordKey ? state.uninstalled[recordKey] : null

    if (!record) {
      const existing = findSkill(skillName)

      if (existing?.installed !== false) {
        return { ok: true, name: skillName, installed: true, path: existing?.path || null }
      }

      return notConfigured('skills', `No uninstalled skill record found: ${skillName}`)
    }

    const disabledDir = String(record.disabled_path || '')
    const originalDir = String(record.original_dir || path.join(getUserSkillRoot(), sanitizeSkillName(skillName)))
    const sourceRoot = String(record.source_root || getUserSkillRoot())

    if (!disabledDir || !fs.existsSync(path.join(disabledDir, 'SKILL.md'))) {
      delete state.uninstalled[recordKey]
      writeSkillsState(state)

      return notConfigured('skills', `Uninstalled skill files are missing: ${skillName}`)
    }
    if (!isPathInside(originalDir, sourceRoot) || !isPathInside(disabledDir, disabledSkillRootFor(sourceRoot))) {
      return notConfigured('skills', 'Skill install path escapes the local skill root.')
    }
    if (fs.existsSync(originalDir)) {
      return notConfigured('skills', `Skill install target already exists: ${originalDir}`)
    }

    fs.mkdirSync(path.dirname(originalDir), { recursive: true })
    fs.renameSync(disabledDir, originalDir)
    state.enabled[record.name || skillName] = true
    delete state.uninstalled[recordKey]
    writeSkillsState(state)

    return { ok: true, id: record.id || skillName, name: record.name || skillName, installed: true, path: originalDir, skill: findSkill(record.id || record.name || skillName) }
  }

  function skillSearchScore(skill, terms) {
    const haystack = `${skill.name} ${skill.description} ${skill.category} ${skill.displayName || ''} ${skill.displayDescription || ''} ${skill.displayCategory || ''} ${skill.path}`.toLowerCase()

    return terms.reduce((score, term) => score + (haystack.includes(term) ? 2 : 0) + ((skill.name + ' ' + (skill.displayName || '')).toLowerCase().includes(term) ? 3 : 0), 0)
  }

  function searchSkills(query) {
    const q = String(query || '').trim().toLowerCase()
    const terms = q.split(/\s+/).filter(Boolean)
    const rows = scanSkills()
    const matches = (terms.length ? rows.map(skill => ({ skill, score: skillSearchScore(skill, terms) })).filter(row => row.score > 0) : rows.map(skill => ({ skill, score: 1 })))
      .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name))
      .slice(0, 30)
      .map(({ skill, score }) => ({ ...skill, score, reason: terms.length ? `匹配：${terms.filter(term => `${skill.name} ${skill.description}`.toLowerCase().includes(term)).join('、') || '名称/描述'}` : '本地可用技能' }))

    return { ok: true, query: q, count: matches.length, skills: matches }
  }

  function readSkillByName(name) {
    const skillName = String(name || '').trim()
    const skill = findSkill(skillName)

    if (!skill || skill.available === false) {
      return notConfigured('skills', `Skill not found: ${skillName}`)
    }

    const state = readSkillsState()

    state.last_used = normalizeStateMap(state.last_used)
    state.last_used[skill.name] = Date.now()
    writeSkillsState(state)

    return { ok: true, skill, content: fs.readFileSync(skill.path, 'utf8') }
  }

  function createSkill(input) {
    const name = sanitizeSkillName(input?.name || input?.title || input?.arg || '')
    const description = String(input?.description || input?.desc || input?.purpose || 'Karna 自定义技能').trim()
    const body = String(input?.body || input?.instructions || input?.content || '').trim()
    const root = getUserSkillRoot()
    const dir = path.join(root, name)
    const skillPath = path.join(dir, 'SKILL.md')

    if (!path.resolve(dir).startsWith(path.resolve(root))) {
      return notConfigured('skills', 'Skill path escapes the user skill root.')
    }
    if (fs.existsSync(skillPath)) {
      return notConfigured('skills', `Skill already exists: ${name}`, { name, path: skillPath })
    }

    fs.mkdirSync(dir, { recursive: true })

    const fallbackSteps = [
      '1. 先确认用户目标和输入材料。',
      '2. 执行技能要求的读取、分析或生成动作。',
      '3. 给出可直接使用的结果，并说明落地文件或下一步。'
    ].join('\n')
    const content = `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n${description}\n\n## 使用时机\n\n- 当用户明确需要 ${description} 时使用。\n\n## 操作步骤\n\n${body || fallbackSteps}\n`

    fs.writeFileSync(skillPath, content, 'utf8')

    const state = readSkillsState()

    state.enabled = normalizeStateMap(state.enabled)
    state.enabled[name] = true
    writeSkillsState(state)

    return { ok: true, name, path: skillPath, skill: scanSkills().find(row => row.name === name), content }
  }

  function listWriterSkills() {
    const writerRootFragment = `${path.sep}skills${path.sep}karna${path.sep}writer${path.sep}`

    return scanSkills().filter(skill => String(skill.path || '').includes(writerRootFragment))
  }

  return {
    createSkill,
    getSkillsCatalog,
    installSkill,
    listWriterSkills,
    readSkillByName,
    scanSkills,
    searchSkills,
    setSkillEnabled,
    uninstallSkill
  }
}

module.exports = { createSkillsService }
