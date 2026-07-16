'use strict'

const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const MAX_FILE_COUNT = 200
const MAX_SINGLE_FILE_SIZE = 10 * 1024 * 1024
const MAX_TOTAL_SIZE = 50 * 1024 * 1024
const JOB_EXPIRY_MS = 30 * 60 * 1000

function createSkillImportService({
  fs: fsImpl = fs,
  path: pathImpl = path,
  crypto: cryptoImpl = crypto,
  karnaPaths,
  getUserSkillRoot,
  rememberLog = () => {},
  rescanSkills = () => {}
}) {
  const jobs = new Map()

  function sanitizeSkillName(value) {
    const raw = String(value || '').trim().replace(/\s+/g, '-')
    const safe = raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
    return safe || `skill-${Date.now()}`
  }

  function isPathInside(child, parent) {
    const relative = pathImpl.relative(pathImpl.resolve(parent), pathImpl.resolve(child))
    return !!relative && !relative.startsWith('..') && !pathImpl.isAbsolute(relative)
  }

  function safeJoin(base, ...parts) {
    const resolved = pathImpl.resolve(base, ...parts)
    if (!resolved.startsWith(pathImpl.resolve(base))) {
      throw new Error(`Path traversal detected: ${parts.join('/')}`)
    }
    return resolved
  }

  function parseFrontMatter(text) {
    const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---/m)
    if (!match) return { name: '', description: '' }
    const block = match[1]
    const nameMatch = block.match(/^name:\s*(.+)$/mi)
    const descMatch = block.match(/^description:\s*(.+)$/mi)
    return {
      name: nameMatch ? nameMatch[1].trim().replace(/^['"]|['"]$/g, '') : '',
      description: descMatch ? descMatch[1].trim().replace(/^['"]|['"]$/g, '') : ''
    }
  }

  function detectSkillInDirectory(dir) {
    const skillMdPath = pathImpl.join(dir, 'SKILL.md')
    if (!fsImpl.existsSync(skillMdPath)) return null
    try {
      const stat = fsImpl.statSync(skillMdPath)
      if (!stat.isFile()) return null
      if (stat.size > MAX_SINGLE_FILE_SIZE) return null
      const content = fsImpl.readFileSync(skillMdPath, 'utf8')
      const fm = parseFrontMatter(content)
      const dirName = pathImpl.basename(dir)
      return {
        name: fm.name || dirName,
        description: fm.description,
        sourceDir: dir,
        hasSkillMd: true,
        content
      }
    } catch (err) {
      rememberLog(`Skill detect error in ${dir}: ${err.message}`)
      return null
    }
  }

  function cleanupJob(jobId) {
    const job = jobs.get(jobId)
    if (job && job.tempDir && fsImpl.existsSync(job.tempDir)) {
      try {
        fsImpl.rmSync(job.tempDir, { recursive: true, force: true })
      } catch (err) {
        rememberLog(`Failed to cleanup temp dir ${job.tempDir}: ${err.message}`)
      }
    }
    jobs.delete(jobId)
  }

  function cleanupExpiredJobs() {
    const now = Date.now()
    for (const [jobId, job] of jobs.entries()) {
      if (now - job.createdAt > JOB_EXPIRY_MS) {
        cleanupJob(jobId)
      }
    }
  }

  function createTempDir() {
    const tempRoot = karnaPaths.tempDir()
    fsImpl.mkdirSync(tempRoot, { recursive: true })
    const jobId = cryptoImpl.randomUUID()
    const jobTempDir = pathImpl.join(tempRoot, `skill-import-${jobId}`)
    fsImpl.mkdirSync(jobTempDir, { recursive: true })
    return { jobId, tempDir: jobTempDir }
  }

  async function preflightMarkdown(filePath) {
    const warnings = []
    const blockedReasons = []
    const detectedSkills = []

    try {
      if (!fsImpl.existsSync(filePath)) {
        blockedReasons.push('文件不存在')
        return { detectedSkills, warnings, conflicts: [], blockedReasons, canImport: blockedReasons.length === 0 }
      }

      const stat = fsImpl.statSync(filePath)
      if (stat.size > MAX_SINGLE_FILE_SIZE) {
        blockedReasons.push(`文件过大（${Math.round(stat.size / 1024 / 1024)}MB），最大允许 ${MAX_SINGLE_FILE_SIZE / 1024 / 1024}MB`)
        return { detectedSkills, warnings, conflicts: [], blockedReasons, canImport: false }
      }

      const content = fsImpl.readFileSync(filePath, 'utf8')
      const fm = parseFrontMatter(content)
      const baseName = pathImpl.basename(filePath, pathImpl.extname(filePath))
      const skillName = sanitizeSkillName(fm.name || baseName)

      const userRoot = getUserSkillRoot()
      const targetDir = pathImpl.join(userRoot, skillName)
      const conflicts = []
      if (fsImpl.existsSync(targetDir)) {
        conflicts.push({ name: skillName, reason: '同名技能已存在', existingPath: targetDir })
      }

      detectedSkills.push({
        name: skillName,
        description: fm.description || '导入的 Markdown 技能',
        sourceType: 'markdown',
        sourcePath: filePath,
        suggestedName: skillName
      })

      if (!fm.name) warnings.push('未在 front matter 中找到 name 字段，将使用文件名')
      if (!fm.description) warnings.push('未在 front matter 中找到 description 字段')

      return { detectedSkills, warnings, conflicts, blockedReasons, canImport: blockedReasons.length === 0 }
    } catch (err) {
      blockedReasons.push(`读取文件失败: ${err.message}`)
      return { detectedSkills, warnings, conflicts: [], blockedReasons, canImport: false }
    }
  }

  async function extractZip(filePath, destDir) {
    const warnings = []
    const blockedReasons = []
    let fileCount = 0
    let totalSize = 0
    const extractedPaths = []

    try {
      const { unzipSync, strFromU8 } = require('fflate')
      const zipData = fsImpl.readFileSync(filePath)
      const unzipped = unzipSync(zipData, {
        filter: file => {
          const entryName = file.name
          if (entryName.includes('..') || entryName.startsWith('/') || entryName.startsWith('\\')) {
            throw new Error(`路径穿越检测: ${entryName}`)
          }
          return true
        }
      })

      for (const [entryName, entryData] of Object.entries(unzipped)) {
        if (entryName.endsWith('/')) continue
        fileCount++
        if (fileCount > MAX_FILE_COUNT) {
          blockedReasons.push(`文件数过多（>${MAX_FILE_COUNT}）`)
          break
        }

        if (entryData.length > MAX_SINGLE_FILE_SIZE) {
          blockedReasons.push(`单个文件过大: ${entryName} (${Math.round(entryData.length / 1024 / 1024)}MB)`)
          break
        }

        totalSize += entryData.length
        if (totalSize > MAX_TOTAL_SIZE) {
          blockedReasons.push(`总大小超过限制（>${MAX_TOTAL_SIZE / 1024 / 1024}MB）`)
          break
        }

        const entryPath = safeJoin(destDir, entryName)
        fsImpl.mkdirSync(pathImpl.dirname(entryPath), { recursive: true })
        fsImpl.writeFileSync(entryPath, Buffer.from(entryData))
        extractedPaths.push(entryPath)
      }
    } catch (err) {
      if (err.message && err.message.includes('路径穿越检测')) {
        blockedReasons.push(err.message)
      } else {
        blockedReasons.push(`解压失败: ${err.message}`)
      }
    }

    return { warnings, blockedReasons, extractedPaths }
  }

  function findSkillDirs(rootDir) {
    const skillDirs = []
    const visit = (dir, depth = 0) => {
      if (depth > 5) return
      let entries = []
      try {
        entries = fsImpl.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }

      if (entries.some(e => e.isFile() && e.name === 'SKILL.md')) {
        skillDirs.push(dir)
        return
      }

      const subdirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      if (subdirs.length === 1 && depth === 0) {
        visit(pathImpl.join(dir, subdirs[0].name), depth + 1)
        return
      }

      for (const entry of subdirs) {
        visit(pathImpl.join(dir, entry.name), depth + 1)
      }
    }
    visit(rootDir)
    return skillDirs
  }

  async function preflightArchive(filePath) {
    const warnings = []
    const blockedReasons = []
    const detectedSkills = []
    const conflicts = []

    const { jobId, tempDir } = createTempDir()

    try {
      if (!fsImpl.existsSync(filePath)) {
        blockedReasons.push('文件不存在')
        cleanupJob(jobId)
        return { jobId: null, detectedSkills, warnings, conflicts, blockedReasons, canImport: false }
      }

      const ext = pathImpl.extname(filePath).toLowerCase()
      if (!['.zip', '.tar.gz', '.tgz'].includes(ext) && !filePath.endsWith('.tar.gz')) {
        warnings.push('未知文件格式，尝试按 ZIP 处理')
      }

      const extractResult = await extractZip(filePath, tempDir)
      warnings.push(...extractResult.warnings)
      blockedReasons.push(...extractResult.blockedReasons)

      if (blockedReasons.length > 0) {
        cleanupJob(jobId)
        return { jobId: null, detectedSkills, warnings, conflicts, blockedReasons, canImport: false }
      }

      const skillDirs = findSkillDirs(tempDir)
      const userRoot = getUserSkillRoot()

      for (const skillDir of skillDirs) {
        const skillInfo = detectSkillInDirectory(skillDir)
        if (skillInfo) {
          const skillName = sanitizeSkillName(skillInfo.name)
          const targetDir = pathImpl.join(userRoot, skillName)
          detectedSkills.push({
            name: skillName,
            description: skillInfo.description,
            sourceType: 'archive',
            sourceDir: skillDir,
            tempDir: tempDir,
            suggestedName: skillName
          })
          if (fsImpl.existsSync(targetDir)) {
            conflicts.push({ name: skillName, reason: '同名技能已存在', existingPath: targetDir })
          }
        }
      }

      if (detectedSkills.length === 0) {
        blockedReasons.push('压缩包中未找到 SKILL.md 文件')
        cleanupJob(jobId)
        return { jobId: null, detectedSkills, warnings, conflicts, blockedReasons, canImport: false }
      }

      jobs.set(jobId, {
        id: jobId,
        type: 'archive',
        status: 'preflighted',
        tempDir,
        sourcePath: filePath,
        detectedSkills,
        conflicts,
        warnings,
        createdAt: Date.now()
      })

      return { jobId, detectedSkills, warnings, conflicts, blockedReasons, canImport: blockedReasons.length === 0 }
    } catch (err) {
      blockedReasons.push(`处理失败: ${err.message}`)
      cleanupJob(jobId)
      return { jobId: null, detectedSkills, warnings, conflicts, blockedReasons, canImport: false }
    }
  }

  function parseGitHubUrl(url) {
    try {
      const parsed = new URL(url)
      if (!['github.com', 'www.github.com'].includes(parsed.hostname)) {
        return { valid: false, reason: '不是 GitHub URL' }
      }

      const parts = parsed.pathname.split('/').filter(Boolean)
      if (parts.length < 2) {
        return { valid: false, reason: 'URL 格式不正确，需要 owner/repo' }
      }

      const owner = parts[0]
      const repo = parts[1]
      let ref = 'main'
      let pathInRepo = ''

      if (parts.length >= 4 && parts[2] === 'tree') {
        ref = parts[3]
        pathInRepo = parts.slice(4).join('/')
      } else if (parts.length >= 4 && parts[2] === 'blob') {
        ref = parts[3]
        pathInRepo = parts.slice(4).join('/')
      }

      return {
        valid: true,
        owner,
        repo,
        ref,
        path: pathInRepo,
        rawUrl: `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${pathInRepo || 'SKILL.md'}`,
        archiveUrl: `https://github.com/${owner}/${repo}/archive/refs/heads/${ref}.zip`
      }
    } catch {
      return { valid: false, reason: '无效的 URL' }
    }
  }

  async function preflightGithub(url) {
    const warnings = []
    const blockedReasons = []
    const detectedSkills = []
    const conflicts = []

    const parsed = parseGitHubUrl(url)
    if (!parsed.valid) {
      blockedReasons.push(parsed.reason)
      return { detectedSkills, warnings, conflicts, blockedReasons, canImport: false, githubInfo: null }
    }

    warnings.push('GitHub 导入：将尝试下载仓库归档（需要网络连接）')

    const { jobId, tempDir } = createTempDir()
    const archivePath = pathImpl.join(tempDir, 'repo.zip')

    try {
      const https = require('node:https')
      await new Promise((resolve, reject) => {
        const file = fsImpl.createWriteStream(archivePath)
        const request = https.get(parsed.archiveUrl, { timeout: 30000 }, response => {
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            https.get(response.headers.location, { timeout: 30000 }, redirectRes => {
              if (redirectRes.statusCode !== 200) {
                reject(new Error(`GitHub 下载失败: HTTP ${redirectRes.statusCode}`))
                return
              }
              let totalSize = 0
              redirectRes.on('data', chunk => {
                totalSize += chunk.length
                if (totalSize > MAX_TOTAL_SIZE) {
                  redirectRes.destroy()
                  reject(new Error('仓库过大'))
                }
              })
              redirectRes.pipe(file)
            }).on('error', reject)
          } else if (response.statusCode !== 200) {
            reject(new Error(`GitHub 下载失败: HTTP ${response.statusCode}`))
            return
          } else {
            let totalSize = 0
            response.on('data', chunk => {
              totalSize += chunk.length
              if (totalSize > MAX_TOTAL_SIZE) {
                response.destroy()
                reject(new Error('仓库过大'))
              }
            })
            response.pipe(file)
          }
        })
        request.on('error', reject)
        request.on('timeout', () => {
          request.destroy()
          reject(new Error('下载超时'))
        })
        file.on('finish', () => {
          file.close()
          resolve()
        })
      })

      const extractResult = await extractZip(archivePath, tempDir)
      warnings.push(...extractResult.warnings)
      blockedReasons.push(...extractResult.blockedReasons)

      if (blockedReasons.length > 0) {
        cleanupJob(jobId)
        return { jobId: null, detectedSkills, warnings, conflicts, blockedReasons, canImport: false, githubInfo: parsed }
      }

      const skillDirs = findSkillDirs(tempDir)
      const userRoot = getUserSkillRoot()

      for (const skillDir of skillDirs) {
        const skillInfo = detectSkillInDirectory(skillDir)
        if (skillInfo) {
          const skillName = sanitizeSkillName(skillInfo.name)
          const targetDir = pathImpl.join(userRoot, skillName)
          detectedSkills.push({
            name: skillName,
            description: skillInfo.description,
            sourceType: 'github',
            sourceDir: skillDir,
            tempDir: tempDir,
            githubInfo: parsed,
            suggestedName: skillName
          })
          if (fsImpl.existsSync(targetDir)) {
            conflicts.push({ name: skillName, reason: '同名技能已存在', existingPath: targetDir })
          }
        }
      }

      if (detectedSkills.length === 0) {
        warnings.push('仓库中未找到明确的 SKILL.md，可手动选择目录或创建新技能')
        detectedSkills.push({
          name: sanitizeSkillName(parsed.repo),
          description: `从 GitHub 导入: ${parsed.owner}/${parsed.repo}`,
          sourceType: 'github',
          sourceDir: tempDir,
          tempDir: tempDir,
          githubInfo: parsed,
          suggestedName: sanitizeSkillName(parsed.repo)
        })
      }

      jobs.set(jobId, {
        id: jobId,
        type: 'github',
        status: 'preflighted',
        tempDir,
        sourceUrl: url,
        githubInfo: parsed,
        detectedSkills,
        conflicts,
        warnings,
        createdAt: Date.now()
      })

      return { jobId, detectedSkills, warnings, conflicts, blockedReasons, canImport: blockedReasons.length === 0, githubInfo: parsed }
    } catch (err) {
      blockedReasons.push(`GitHub 导入失败: ${err.message}`)
      warnings.push('提示：可先下载 ZIP 文件再使用"压缩包导入"')
      cleanupJob(jobId)
      return { jobId: null, detectedSkills, warnings, conflicts, blockedReasons, canImport: false, githubInfo: parsed }
    }
  }

  async function preflight(source) {
    cleanupExpiredJobs()

    const { type, filePath, url, content } = source

    switch (type) {
      case 'markdown':
        return preflightMarkdown(filePath)
      case 'archive':
        return preflightArchive(filePath)
      case 'github':
        return preflightGithub(url)
      case 'scratch':
        return preflightScratch(content)
      default:
        return {
          detectedSkills: [],
          warnings: [],
          conflicts: [],
          blockedReasons: [`不支持的导入类型: ${type}`],
          canImport: false
        }
    }
  }

  async function preflightScratch(content) {
    const warnings = []
    const conflicts = []
    const blockedReasons = []
    const detectedSkills = []

    const name = sanitizeSkillName(content?.name || '')
    if (!name) {
      blockedReasons.push('请提供技能名称')
      return { detectedSkills, warnings, conflicts, blockedReasons, canImport: false }
    }

    const userRoot = getUserSkillRoot()
    const targetDir = pathImpl.join(userRoot, name)
    if (fsImpl.existsSync(targetDir)) {
      conflicts.push({ name, reason: '同名技能已存在', existingPath: targetDir })
    }

    const { jobId, tempDir } = createTempDir()
    const skillDir = pathImpl.join(tempDir, name)
    fsImpl.mkdirSync(skillDir, { recursive: true })

    const description = content?.description || '自定义技能'
    const instructions = content?.instructions || '1. 理解用户需求\n2. 执行相应操作\n3. 返回结果'
    const whenToUse = content?.whenToUse || `当用户需要 ${description} 时使用。`
    const category = content?.category || 'general'
    const tools = content?.tools || []

    const skillContent = `---\nname: ${name}\ndescription: ${description}\n${tools.length ? `allowed-tools: [${tools.join(', ')}]\n` : ''}---\n\n# ${name}\n\n${description}\n\n## 使用时机\n\n${whenToUse}\n\n## 操作步骤\n\n${instructions}\n`

    fsImpl.writeFileSync(pathImpl.join(skillDir, 'SKILL.md'), skillContent, 'utf8')

    detectedSkills.push({
      name,
      description,
      sourceType: 'scratch',
      sourceDir: skillDir,
      tempDir: tempDir,
      suggestedName: name,
      content: skillContent
    })

    jobs.set(jobId, {
      id: jobId,
      type: 'scratch',
      status: 'preflighted',
      tempDir,
      detectedSkills,
      conflicts,
      warnings,
      createdAt: Date.now()
    })

    return { jobId, detectedSkills, warnings, conflicts, blockedReasons, canImport: true }
  }

  async function commit(jobId, selectedSkills) {
    cleanupExpiredJobs()

    const job = jobs.get(jobId)
    if (!job) {
      return { ok: false, error: '导入任务不存在或已过期', receipt: null }
    }

    if (job.status !== 'preflighted') {
      return { ok: false, error: '任务状态不正确', receipt: null }
    }

    const userRoot = getUserSkillRoot()
    fsImpl.mkdirSync(userRoot, { recursive: true })

    const importedSkills = []
    const errors = []
    let rollbackDirs = []

    try {
      const skillsToImport = selectedSkills && selectedSkills.length > 0
        ? job.detectedSkills.filter(s => selectedSkills.includes(s.name))
        : job.detectedSkills

      for (const skill of skillsToImport) {
        const skillName = sanitizeSkillName(skill.suggestedName || skill.name)
        const targetDir = pathImpl.join(userRoot, skillName)

        if (fsImpl.existsSync(targetDir)) {
          errors.push({ skill: skillName, error: '目标目录已存在' })
          continue
        }

        if (skill.sourceType === 'markdown' && job.type !== 'scratch' && !job.tempDir) {
          const fileDir = pathImpl.join(userRoot, skillName)
          fsImpl.mkdirSync(fileDir, { recursive: true })
          const sourceContent = fsImpl.readFileSync(skill.sourcePath, 'utf8')
          fsImpl.writeFileSync(pathImpl.join(fileDir, 'SKILL.md'), sourceContent, 'utf8')
          importedSkills.push({ name: skillName, path: fileDir })
          rollbackDirs.push(fileDir)
        } else if (skill.sourceDir) {
          fsImpl.mkdirSync(targetDir, { recursive: true })
          copyDir(skill.sourceDir, targetDir)
          importedSkills.push({ name: skillName, path: targetDir })
          rollbackDirs.push(targetDir)
        }
      }

      if (errors.length > 0 && importedSkills.length === 0) {
        for (const dir of rollbackDirs) {
          try { fsImpl.rmSync(dir, { recursive: true, force: true }) } catch {}
        }
        return { ok: false, error: '导入失败', errors, receipt: null }
      }

      job.status = 'committed'
      job.importedAt = Date.now()
      job.importedSkills = importedSkills

      setTimeout(() => {
        try { rescanSkills() } catch (err) { rememberLog(`Rescan skills failed: ${err.message}`) }
      }, 100)

      return {
        ok: true,
        receipt: {
          jobId,
          importedSkills,
          warnings: job.warnings,
          errors
        }
      }
    } catch (err) {
      for (const dir of rollbackDirs) {
        try { fsImpl.rmSync(dir, { recursive: true, force: true }) } catch {}
      }
      return { ok: false, error: err.message, receipt: null }
    } finally {
      setTimeout(() => cleanupJob(jobId), 60000)
    }
  }

  function copyDir(src, dest) {
    fsImpl.mkdirSync(dest, { recursive: true })
    const entries = fsImpl.readdirSync(src, { withFileTypes: true })
    for (const entry of entries) {
      const srcPath = pathImpl.join(src, entry.name)
      const destPath = pathImpl.join(dest, entry.name)
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath)
      } else if (entry.isFile() && !entry.isSymbolicLink()) {
        fsImpl.copyFileSync(srcPath, destPath)
      }
    }
  }

  function getJob(jobId) {
    cleanupExpiredJobs()
    const job = jobs.get(jobId)
    if (!job) return { ok: false, error: '任务不存在' }
    return {
      ok: true,
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        detectedSkills: job.detectedSkills,
        conflicts: job.conflicts,
        warnings: job.warnings,
        importedSkills: job.importedSkills,
        createdAt: job.createdAt,
        importedAt: job.importedAt
      }
    }
  }

  function createSkillDirect(input) {
    const name = sanitizeSkillName(input?.name || '')
    if (!name) {
      return { ok: false, error: '请提供技能名称' }
    }

    const description = String(input?.description || '自定义技能').trim()
    const instructions = String(input?.instructions || input?.body || '').trim()
    const whenToUse = String(input?.whenToUse || `当用户需要 ${description} 时使用。`).trim()
    const category = String(input?.category || 'general').trim()
    const tools = Array.isArray(input?.tools) ? input.tools : []

    const userRoot = getUserSkillRoot()
    const dir = pathImpl.join(userRoot, name)
    const skillPath = pathImpl.join(dir, 'SKILL.md')

    if (!isPathInside(dir, userRoot)) {
      return { ok: false, error: '技能路径超出用户技能目录' }
    }
    if (fsImpl.existsSync(skillPath)) {
      return { ok: false, error: `技能已存在: ${name}`, existingPath: skillPath }
    }

    fsImpl.mkdirSync(dir, { recursive: true })

    const fallbackSteps = [
      '1. 先确认用户目标和输入材料。',
      '2. 执行技能要求的读取、分析或生成动作。',
      '3. 给出可直接使用的结果，并说明落地文件或下一步。'
    ].join('\n')

    const content = `---\nname: ${name}\ndescription: ${description}\n${tools.length ? `allowed-tools: [${tools.join(', ')}]\n` : ''}---\n\n# ${name}\n\n${description}\n\n## 使用时机\n\n${whenToUse}\n\n## 操作步骤\n\n${instructions || fallbackSteps}\n`

    fsImpl.writeFileSync(skillPath, content, 'utf8')

    setTimeout(() => {
      try { rescanSkills() } catch (err) { rememberLog(`Rescan skills failed: ${err.message}`) }
    }, 100)

    return { ok: true, name, path: skillPath, content }
  }

  return {
    preflight,
    commit,
    getJob,
    createSkillDirect,
    parseGitHubUrl
  }
}

module.exports = { createSkillImportService }
