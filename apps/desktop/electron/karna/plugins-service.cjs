'use strict'

function normalizeStateMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function generateId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const BUILTIN_PLUGINS = [
  {
    id: 'calendar',
    name_zh: '日历',
    description_zh: '日历管理与日程同步，支持查看、创建和修改日程安排。',
    is_builtin: true,
    installed: true,
    enabled: true,
    risk_level: 'low',
    permissions: ['calendar:read', 'calendar:write'],
    version: '1.0.0',
    source_pack: 'karna-builtin'
  },
  {
    id: 'chrome',
    name_zh: 'Chrome 浏览器',
    description_zh: 'Chrome 浏览器自动化控制，支持页面导航、元素操作和网页调试。',
    is_builtin: true,
    installed: true,
    enabled: true,
    risk_level: 'medium',
    permissions: ['browser:navigate', 'browser:click', 'browser:input', 'browser:screenshot'],
    version: '1.2.0',
    source_pack: 'karna-builtin'
  },
  {
    id: 'documents',
    name_zh: '文档',
    description_zh: '在线文档管理，支持飞书、腾讯文档等平台的文档读写操作。',
    is_builtin: true,
    installed: true,
    enabled: true,
    risk_level: 'low',
    permissions: ['documents:read', 'documents:write', 'documents:share'],
    version: '1.1.0',
    source_pack: 'karna-builtin'
  },
  {
    id: 'email',
    name_zh: '邮件',
    description_zh: '邮件收发与管理，支持撰写、发送、搜索和整理邮件。',
    is_builtin: true,
    installed: true,
    enabled: true,
    risk_level: 'medium',
    permissions: ['email:read', 'email:send', 'email:search'],
    version: '1.0.0',
    source_pack: 'karna-builtin'
  },
  {
    id: 'local-files',
    name_zh: '本地文件',
    description_zh: '本地文件系统访问，支持文件读写、目录遍历和路径操作。',
    is_builtin: true,
    installed: true,
    enabled: true,
    risk_level: 'high',
    permissions: ['filesystem:read', 'filesystem:write', 'filesystem:delete'],
    version: '1.0.0',
    source_pack: 'karna-builtin'
  }
]

const BUILTIN_SKILLS = [
  {
    id: 'skill:builtin:writer-projects',
    name_zh: '写作项目',
    description_zh: '管理写作项目，支持大纲、章节和全文组织。',
    source_pack: 'karna-builtin',
    is_builtin: true,
    installed: true,
    enabled: true,
    risk_level: 'low',
    sha256: ''
  },
  {
    id: 'skill:builtin:create-skill',
    name_zh: '创建技能',
    description_zh: '快速创建自定义技能，生成 SKILL.md 模板文件。',
    source_pack: 'karna-builtin',
    is_builtin: true,
    installed: true,
    enabled: true,
    risk_level: 'low',
    sha256: ''
  },
  {
    id: 'skill:builtin:find-skill',
    name_zh: '查找技能',
    description_zh: '搜索和发现可用技能，按关键词匹配技能描述。',
    source_pack: 'karna-builtin',
    is_builtin: true,
    installed: true,
    enabled: true,
    risk_level: 'low',
    sha256: ''
  },
  {
    id: 'skill:builtin:code-review',
    name_zh: '代码审查',
    description_zh: '自动化代码审查，检查代码质量、安全漏洞和最佳实践。',
    source_pack: 'karna-builtin',
    is_builtin: true,
    installed: true,
    enabled: true,
    risk_level: 'low',
    sha256: ''
  },
  {
    id: 'skill:builtin:refactor',
    name_zh: '代码重构',
    description_zh: '辅助代码重构，提供重构建议和自动化重构操作。',
    source_pack: 'karna-builtin',
    is_builtin: true,
    installed: true,
    enabled: true,
    risk_level: 'medium',
    sha256: ''
  }
]

const HIGH_RISK_SKILL_CATEGORIES = [
  'security-attack',
  'bypass',
  'lateral-movement',
  'exploit',
  'reverse-shell',
  'privilege-escalation'
]

const DEFAULT_EXCLUDED_SKILL_PATTERNS = [
  'hack',
  'exploit',
  'sql-injection',
  'xss',
  'ssrf',
  'reverse-shell',
  'backdoor',
  'bypass-authentication',
  'privilege-escalation',
  'lateral-movement'
]

function createPluginsService({
  fs,
  path,
  dataRoot,
  storage
}) {
  const pluginsDir = path.join(dataRoot, 'plugins')
  const pluginsJsonPath = path.join(pluginsDir, 'plugins.json')
  const installStatePath = path.join(pluginsDir, 'install-state.json')
  const jobsJsonPath = path.join(pluginsDir, 'jobs.json')
  const skillsInventoryPath = path.join(pluginsDir, 'skills-inventory.json')
  const skillAuditPath = path.join(pluginsDir, 'skill-audit.json')

  const ensurePluginsDir = () => {
    if (!fs.existsSync(pluginsDir)) {
      fs.mkdirSync(pluginsDir, { recursive: true })
    }
  }

  const readJsonFile = (filePath, fallback) => {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'))
      }
    } catch (err) {
      // ignore
    }
    return JSON.parse(JSON.stringify(fallback))
  }

  const writeJsonFile = (filePath, data) => {
    ensurePluginsDir()
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    return data
  }

  const readPluginsState = () => {
    const saved = readJsonFile(pluginsJsonPath, { version: 1, plugins: {} })
    return {
      version: saved.version || 1,
      plugins: normalizeStateMap(saved.plugins)
    }
  }

  const writePluginsState = state => {
    writeJsonFile(pluginsJsonPath, {
      version: 1,
      plugins: normalizeStateMap(state.plugins)
    })
  }

  const readInstallState = () => {
    const saved = readJsonFile(installStatePath, { version: 1, installations: {} })
    return {
      version: saved.version || 1,
      installations: normalizeStateMap(saved.installations)
    }
  }

  const writeInstallState = state => {
    writeJsonFile(installStatePath, {
      version: 1,
      installations: normalizeStateMap(state.installations)
    })
  }

  const readJobsState = () => {
    const saved = readJsonFile(jobsJsonPath, { version: 1, jobs: {} })
    return {
      version: saved.version || 1,
      jobs: normalizeStateMap(saved.jobs)
    }
  }

  const writeJobsState = state => {
    writeJsonFile(jobsJsonPath, {
      version: 1,
      jobs: normalizeStateMap(state.jobs)
    })
  }

  const readSkillsInventory = () => {
    const saved = readJsonFile(skillsInventoryPath, { version: 1, skills: {} })
    return {
      version: saved.version || 1,
      skills: normalizeStateMap(saved.skills)
    }
  }

  const writeSkillsInventory = state => {
    writeJsonFile(skillsInventoryPath, {
      version: 1,
      skills: normalizeStateMap(state.skills)
    })
  }

  const readSkillAudit = () => {
    const saved = readJsonFile(skillAuditPath, { version: 1, audit_records: {} })
    return {
      version: saved.version || 1,
      audit_records: normalizeStateMap(saved.audit_records)
    }
  }

  const writeSkillAudit = state => {
    writeJsonFile(skillAuditPath, {
      version: 1,
      audit_records: normalizeStateMap(state.audit_records)
    })
  }

  const getAllPlugins = () => {
    const state = readPluginsState()
    const savedPlugins = Object.values(state.plugins)
    const allPlugins = [...BUILTIN_PLUGINS]

    for (const saved of savedPlugins) {
      const existing = allPlugins.find(p => p.id === saved.id)
      if (existing) {
        Object.assign(existing, saved)
      } else {
        allPlugins.push({ ...saved })
      }
    }

    return allPlugins
  }

  const createJob = (type, pluginId, extra = {}) => {
    const jobsState = readJobsState()
    const jobId = `job-${generateId()}`
    const now = new Date().toISOString()
    const job = {
      id: jobId,
      type,
      plugin_id: pluginId,
      status: 'queued',
      progress: 0,
      logs: [],
      error: null,
      created_at: now,
      updated_at: now,
      ...extra
    }
    jobsState.jobs[jobId] = job
    writeJobsState(jobsState)
    return job
  }

  const updateJob = (jobId, updates) => {
    const jobsState = readJobsState()
    const job = jobsState.jobs[jobId]
    if (!job) {
      return null
    }
    Object.assign(job, updates, { updated_at: new Date().toISOString() })
    jobsState.jobs[jobId] = job
    writeJobsState(jobsState)
    return job
  }

  const addJobLog = (jobId, message) => {
    const jobsState = readJobsState()
    const job = jobsState.jobs[jobId]
    if (!job) {
      return null
    }
    job.logs.push({
      timestamp: new Date().toISOString(),
      message
    })
    job.updated_at = new Date().toISOString()
    jobsState.jobs[jobId] = job
    writeJobsState(jobsState)
    return job
  }

  const simulateJobProgress = (jobId, steps) => {
    const totalSteps = steps.length
    let currentStep = 0

    const runNextStep = () => {
      if (currentStep >= totalSteps) {
        updateJob(jobId, { status: 'completed', progress: 100 })
        addJobLog(jobId, '操作完成')
        return
      }

      const step = steps[currentStep]
      addJobLog(jobId, step.message)
      updateJob(jobId, { progress: Math.round(((currentStep + 1) / totalSteps) * 100) })
      currentStep++

      setTimeout(runNextStep, 200 + Math.random() * 300)
    }

    updateJob(jobId, { status: 'running' })
    addJobLog(jobId, '开始执行...')
    setTimeout(runNextStep, 100)
  }

  function listPlugins() {
    const plugins = getAllPlugins()
    return { ok: true, plugins, count: plugins.length }
  }

  function getPluginDetail(id) {
    const pluginId = String(id || '').trim()
    if (!pluginId) {
      return { ok: false, error: 'Missing plugin id.' }
    }

    const plugins = getAllPlugins()
    const plugin = plugins.find(p => p.id === pluginId)

    if (!plugin) {
      return { ok: false, error: `Plugin not found: ${pluginId}` }
    }

    return { ok: true, plugin }
  }

  function preflightInstall(pluginId, manifestUrl) {
    const id = String(pluginId || '').trim()
    if (!id) {
      return { ok: false, error: 'Missing plugin id.' }
    }

    const plugins = getAllPlugins()
    const existing = plugins.find(p => p.id === id)

    if (existing && existing.installed) {
      return { ok: false, error: `Plugin already installed: ${id}`, already_installed: true }
    }

    const checks = {
      permissions: { passed: true, required_permissions: [] },
      space: { passed: true, required_mb: 10, available_mb: 10240 },
      dependencies: { passed: true, missing: [] },
      manifest_valid: { passed: !!manifestUrl || existing }
    }

    const risk_level = existing?.risk_level || 'medium'
    const allPassed = Object.values(checks).every(c => c.passed)

    return {
      ok: allPassed,
      plugin_id: id,
      risk_level,
      checks,
      can_install: allPassed
    }
  }

  function installPlugin(pluginId, options = {}) {
    const id = String(pluginId || '').trim()
    if (!id) {
      return { ok: false, error: 'Missing plugin id.' }
    }

    const plugins = getAllPlugins()
    const existing = plugins.find(p => p.id === id)

    if (existing && existing.installed) {
      return { ok: false, error: `Plugin already installed: ${id}`, already_installed: true }
    }

    const job = createJob('install', id, { options })

    const steps = [
      { message: '下载插件清单...' },
      { message: '验证插件签名...' },
      { message: '检查依赖项...' },
      { message: '解压安装包...' },
      { message: '注册插件...' },
      { message: '初始化配置...' }
    ]

    simulateJobProgress(job.id, steps)

    setTimeout(() => {
      const state = readPluginsState()
      const current = state.plugins[id] || {
        id,
        name_zh: options.name_zh || id,
        description_zh: options.description_zh || '',
        is_builtin: false,
        installed: false,
        enabled: false,
        risk_level: options.risk_level || 'medium',
        permissions: options.permissions || [],
        version: options.version || '0.1.0',
        source_pack: options.source_pack || 'external'
      }
      current.installed = true
      current.enabled = false
      current.installed_at = new Date().toISOString()
      state.plugins[id] = current
      writePluginsState(state)

      const installState = readInstallState()
      installState.installations[id] = {
        plugin_id: id,
        installed_at: current.installed_at,
        version: current.version,
        previous_version: null,
        rollback_available: false
      }
      writeInstallState(installState)
    }, 1500)

    return { ok: true, job_id: job.id, status: job.status }
  }

  function getJobStatus(jobId) {
    const id = String(jobId || '').trim()
    if (!id) {
      return { ok: false, error: 'Missing job id.' }
    }

    const jobsState = readJobsState()
    const job = jobsState.jobs[id]

    if (!job) {
      return { ok: false, error: `Job not found: ${id}` }
    }

    return { ok: true, job }
  }

  function enablePlugin(id, enabled) {
    const pluginId = String(id || '').trim()
    if (!pluginId) {
      return { ok: false, error: 'Missing plugin id.' }
    }

    const plugins = getAllPlugins()
    const existing = plugins.find(p => p.id === pluginId)

    if (!existing) {
      return { ok: false, error: `Plugin not found: ${pluginId}` }
    }

    const state = readPluginsState()
    const current = state.plugins[pluginId] || { ...existing }
    current.enabled = enabled !== false
    state.plugins[pluginId] = current
    writePluginsState(state)

    return { ok: true, id: pluginId, enabled: current.enabled }
  }

  function getPluginPermissions(id) {
    const pluginId = String(id || '').trim()
    if (!pluginId) {
      return { ok: false, error: 'Missing plugin id.' }
    }

    const plugins = getAllPlugins()
    const plugin = plugins.find(p => p.id === pluginId)

    if (!plugin) {
      return { ok: false, error: `Plugin not found: ${pluginId}` }
    }

    return {
      ok: true,
      plugin_id: pluginId,
      permissions: plugin.permissions || [],
      risk_level: plugin.risk_level
    }
  }

  function updatePlugin(id) {
    const pluginId = String(id || '').trim()
    if (!pluginId) {
      return { ok: false, error: 'Missing plugin id.' }
    }

    const plugins = getAllPlugins()
    const existing = plugins.find(p => p.id === pluginId)

    if (!existing || !existing.installed) {
      return { ok: false, error: `Plugin not installed: ${pluginId}` }
    }

    const job = createJob('update', pluginId, {
      current_version: existing.version
    })

    const steps = [
      { message: '检查更新...' },
      { message: '下载新版本...' },
      { message: '验证新版本签名...' },
      { message: '备份当前版本...' },
      { message: '安装新版本...' },
      { message: '迁移配置...' }
    ]

    simulateJobProgress(job.id, steps)

    setTimeout(() => {
      const state = readPluginsState()
      const current = state.plugins[pluginId] || { ...existing }
      const previousVersion = current.version
      current.version = `${parseInt(current.version.split('.')[0]) || 1}.${parseInt(current.version.split('.')[1] || 0) + 1}.0`
      state.plugins[pluginId] = current
      writePluginsState(state)

      const installState = readInstallState()
      installState.installations[pluginId] = {
        plugin_id: pluginId,
        installed_at: new Date().toISOString(),
        version: current.version,
        previous_version: previousVersion,
        rollback_available: true
      }
      writeInstallState(installState)
    }, 1500)

    return { ok: true, job_id: job.id, status: job.status }
  }

  function rollbackPlugin(id) {
    const pluginId = String(id || '').trim()
    if (!pluginId) {
      return { ok: false, error: 'Missing plugin id.' }
    }

    const installState = readInstallState()
    const installRecord = installState.installations[pluginId]

    if (!installRecord || !installRecord.rollback_available) {
      return { ok: false, error: `No rollback available for: ${pluginId}` }
    }

    const job = createJob('rollback', pluginId, {
      target_version: installRecord.previous_version
    })

    const steps = [
      { message: '准备回滚...' },
      { message: '恢复备份版本...' },
      { message: '还原配置...' },
      { message: '验证回滚...' }
    ]

    simulateJobProgress(job.id, steps)

    setTimeout(() => {
      const state = readPluginsState()
      const current = state.plugins[pluginId]
      if (current) {
        const previousVersion = installRecord.previous_version
        current.version = previousVersion
        state.plugins[pluginId] = current
        writePluginsState(state)
      }

      const newInstallState = readInstallState()
      newInstallState.installations[pluginId] = {
        ...installRecord,
        installed_at: new Date().toISOString(),
        version: installRecord.previous_version,
        previous_version: null,
        rollback_available: false
      }
      writeInstallState(newInstallState)
    }, 1500)

    return { ok: true, job_id: job.id, status: job.status }
  }

  function uninstallPlugin(id) {
    const pluginId = String(id || '').trim()
    if (!pluginId) {
      return { ok: false, error: 'Missing plugin id.' }
    }

    const plugins = getAllPlugins()
    const existing = plugins.find(p => p.id === pluginId)

    if (!existing || !existing.installed) {
      return { ok: false, error: `Plugin not installed: ${pluginId}` }
    }

    if (existing.is_builtin) {
      return { ok: false, error: `Built-in plugin cannot be uninstalled: ${pluginId}` }
    }

    const job = createJob('uninstall', pluginId)

    const steps = [
      { message: '准备卸载...' },
      { message: '停止插件服务...' },
      { message: '移除插件文件...' },
      { message: '清理配置...' },
      { message: '注销插件...' }
    ]

    simulateJobProgress(job.id, steps)

    setTimeout(() => {
      const state = readPluginsState()
      if (state.plugins[pluginId]) {
        state.plugins[pluginId].installed = false
        state.plugins[pluginId].enabled = false
      }
      writePluginsState(state)

      const installState = readInstallState()
      if (installState.installations[pluginId]) {
        installState.installations[pluginId].uninstalled_at = new Date().toISOString()
      }
      writeInstallState(installState)
    }, 1500)

    return { ok: true, job_id: job.id, status: job.status }
  }

  function listSkills(options = {}) {
    const inventory = readSkillsInventory()
    const savedSkills = Object.values(inventory.skills)
    const allSkills = [...BUILTIN_SKILLS]

    for (const saved of savedSkills) {
      const existing = allSkills.find(s => s.id === saved.id)
      if (existing) {
        Object.assign(existing, saved)
      } else {
        allSkills.push({ ...saved })
      }
    }

    if (options.include_high_risk !== true) {
      const filtered = allSkills.filter(skill => {
        if (skill.is_builtin) return true
        const nameLower = String(skill.name_zh || skill.id || '').toLowerCase()
        return !DEFAULT_EXCLUDED_SKILL_PATTERNS.some(pattern => nameLower.includes(pattern))
      })
      return { ok: true, skills: filtered, count: filtered.length, total_available: allSkills.length }
    }

    return { ok: true, skills: allSkills, count: allSkills.length }
  }

  function getSkillDetail(skillId) {
    const id = String(skillId || '').trim()
    if (!id) {
      return { ok: false, error: 'Missing skill id.' }
    }

    const result = listSkills({ include_high_risk: true })
    const skill = result.skills.find(s => s.id === id)

    if (!skill) {
      return { ok: false, error: `Skill not found: ${skillId}` }
    }

    const auditState = readSkillAudit()
    const auditRecord = auditState.audit_records[id] || null

    return {
      ok: true,
      skill: {
        id: skill.id,
        name_zh: skill.name_zh,
        description_zh: skill.description_zh,
        source_pack: skill.source_pack,
        is_builtin: skill.is_builtin,
        installed: skill.installed,
        enabled: skill.enabled,
        risk_level: skill.risk_level,
        sha256: skill.sha256
      },
      audit: auditRecord
    }
  }

  function installExternalSkill(skillId, options = {}) {
    const id = String(skillId || '').trim()
    if (!id) {
      return { ok: false, error: 'Missing skill id.' }
    }

    const inventory = readSkillsInventory()
    const existing = inventory.skills[id]

    if (existing && existing.installed) {
      return { ok: false, error: `Skill already installed: ${id}`, already_installed: true }
    }

    const nameLower = String(options.name_zh || id).toLowerCase()
    const isExcluded = DEFAULT_EXCLUDED_SKILL_PATTERNS.some(pattern => nameLower.includes(pattern))

    if (isExcluded && options.allow_high_risk !== true) {
      return {
        ok: false,
        error: 'Skill is in excluded category. Requires explicit high-risk approval.',
        risk_level: 'high',
        excluded: true
      }
    }

    const skillRecord = {
      id,
      name_zh: options.name_zh || id,
      description_zh: options.description_zh || '',
      source_pack: options.source_pack || 'external-market',
      is_builtin: false,
      installed: true,
      enabled: false,
      risk_level: isExcluded ? 'high' : (options.risk_level || 'medium'),
      sha256: options.sha256 || ''
    }

    inventory.skills[id] = skillRecord
    writeSkillsInventory(inventory)

    const auditState = readSkillAudit()
    auditState.audit_records[id] = {
      skill_id: id,
      source_repository: options.source_repository || '',
      license: options.license || '',
      commit: options.commit || '',
      sha256: options.sha256 || '',
      reviewer: options.reviewer || '',
      risk_level: skillRecord.risk_level,
      categories: options.categories || [],
      installed_at: new Date().toISOString(),
      permissions: options.permissions || [],
      project_scope: options.project_scope || 'per-project'
    }
    writeSkillAudit(auditState)

    return { ok: true, skill: skillRecord, installed: true }
  }

  function enableSkill(skillId, enabled, context = {}) {
    const id = String(skillId || '').trim()
    if (!id) {
      return { ok: false, error: 'Missing skill id.' }
    }

    const inventory = readSkillsInventory()
    const skill = inventory.skills[id] || BUILTIN_SKILLS.find(s => s.id === id)

    if (!skill) {
      return { ok: false, error: `Skill not found: ${id}` }
    }

    if (!skill.is_builtin && !skill.installed) {
      return { ok: false, error: `Skill not installed: ${id}` }
    }

    if (!skill.is_builtin && enabled !== false) {
      const auditState = readSkillAudit()
      const auditRecord = auditState.audit_records[id]
      if (auditRecord && auditRecord.risk_level === 'high' && !context.allow_high_risk) {
        return {
          ok: false,
          error: 'High-risk skill requires explicit approval to enable.',
          risk_level: 'high',
          requires_approval: true
        }
      }
    }

    if (!inventory.skills[id]) {
      inventory.skills[id] = { ...skill }
    }
    inventory.skills[id].enabled = enabled !== false
    writeSkillsInventory(inventory)

    return {
      ok: true,
      id,
      enabled: enabled !== false,
      permissions_inherited: true,
      project_scope: context.project_scope || 'per-project'
    }
  }

  function getSkillAuditInfo(skillId) {
    const id = String(skillId || '').trim()
    if (!id) {
      return { ok: false, error: 'Missing skill id.' }
    }

    const auditState = readSkillAudit()
    const record = auditState.audit_records[id]

    if (!record) {
      return { ok: false, error: `No audit record found for: ${id}` }
    }

    return { ok: true, audit: record }
  }

  function checkSkillRisk(skillId) {
    const id = String(skillId || '').trim()
    if (!id) {
      return { ok: false, error: 'Missing skill id.' }
    }

    const result = listSkills({ include_high_risk: true })
    const skill = result.skills.find(s => s.id === id)

    if (!skill) {
      return { ok: false, error: `Skill not found: ${id}` }
    }

    const nameLower = String(skill.name_zh || skill.id || '').toLowerCase()
    const isExcluded = DEFAULT_EXCLUDED_SKILL_PATTERNS.some(pattern => nameLower.includes(pattern))

    return {
      ok: true,
      skill_id: id,
      risk_level: skill.risk_level || (isExcluded ? 'high' : 'low'),
      is_excluded: isExcluded,
      is_builtin: skill.is_builtin || false,
      categories: HIGH_RISK_SKILL_CATEGORIES.filter(cat => nameLower.includes(cat))
    }
  }

  function getSkillPermissions(skillId) {
    const id = String(skillId || '').trim()
    if (!id) {
      return { ok: false, error: 'Missing skill id.' }
    }

    const auditState = readSkillAudit()
    const auditRecord = auditState.audit_records[id]

    return {
      ok: true,
      skill_id: id,
      permissions: auditRecord?.permissions || [],
      project_scope: auditRecord?.project_scope || 'per-project',
      inherits_project_permissions: true
    }
  }

  return {
    listPlugins,
    getPluginDetail,
    preflightInstall,
    installPlugin,
    getJobStatus,
    enablePlugin,
    getPluginPermissions,
    updatePlugin,
    rollbackPlugin,
    uninstallPlugin,
    listSkills,
    getSkillDetail,
    installExternalSkill,
    enableSkill,
    getSkillAuditInfo,
    checkSkillRisk,
    getSkillPermissions
  }
}

module.exports = {
  createPluginsService,
  BUILTIN_PLUGINS,
  BUILTIN_SKILLS,
  HIGH_RISK_SKILL_CATEGORIES,
  DEFAULT_EXCLUDED_SKILL_PATTERNS
}
