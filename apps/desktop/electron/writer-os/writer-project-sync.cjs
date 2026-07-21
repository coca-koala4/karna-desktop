'use strict'

const path = require('node:path')
const fs = require('node:fs')

function createWriterProjectSync(deps = {}) {
  const {
    fs: fsModule = fs,
    path: pathModule = path,
    crypto: cryptoModule = require('node:crypto'),
    readJsonFile = (p, def) => {
      try { return JSON.parse(fsModule.readFileSync(p, 'utf8')) }
      catch { return def || { version: 1 } }
    },
    writeJsonFile = (p, data) => {
      fsModule.mkdirSync(pathModule.dirname(p), { recursive: true })
      fsModule.writeFileSync(p, JSON.stringify(data, null, 2) + '\n', 'utf8')
    },
    textHash = (s) => cryptoModule.createHash('sha1').update(String(s || '')).digest('hex').slice(0, 16),
    slugify = (s) => String(s || '').toLowerCase()
      .replace(/[^\u4e00-\u9fa5\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  } = deps

  const EXCLUDED_DIRS = new Set([
    'node_modules', '.git', 'versions', '__pycache__', '.vscode', '.idea',
    'build', 'dist', 'release', 'rag', 'memory', 'bible', 'narrative-state',
    'critics', 'safety', 'artifacts', 'guide', 'documents', 'wiki', 'graph',
    'capabilities', 'benchmarks', 'roadmap', 'delivery', 'workflow_runs', 'exports'
  ])

  const EXCLUDED_FILE_PATTERNS = /^\.|~\$|.tmp$|.bak$|.swp$/i

  const CANONICAL_FILES = {
    outline: ['规划/故事大纲.md', '大纲/故事大纲.md', 'story-outline.md', 'outline.md'],
    characters: ['设定/人物设定.md', '人物/人物设定.md', 'characters.md', 'character-setting.md'],
    world: ['设定/世界观.md', '世界观/世界观.md', 'worldbuilding.md', 'world-setting.md']
  }

  function textToHash(text) {
    return cryptoModule.createHash('sha1').update(String(text || '')).digest('hex')
  }

  function generateStableId(prefix, name) {
    const clean = String(name || '').trim()
    return `${prefix}_${textHash(clean).slice(0, 10)}`
  }

  function extractSections(markdownText) {
    const text = String(markdownText || '')
    const sections = []
    const lines = text.split(/\r?\n/)
    let currentSection = null
    let currentContent = []
    let currentLevel = 0
    let lineStart = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
      if (headingMatch) {
        if (currentSection) {
          sections.push({
            ...currentSection,
            content: currentContent.join('\n').trim(),
            line_end: i - 1
          })
        }
        currentLevel = headingMatch[1].length
        currentSection = {
          title: headingMatch[2].trim(),
          level: currentLevel,
          line_start: i,
          content_lines: []
        }
        currentContent = []
        lineStart = i
      } else if (currentSection) {
        currentContent.push(line)
      }
    }
    if (currentSection) {
      sections.push({
        ...currentSection,
        content: currentContent.join('\n').trim(),
        line_end: lines.length - 1
      })
    }
    return sections
  }

  function classifyFile(relPath) {
    const normalized = String(relPath || '').replace(/\\/g, '/').toLowerCase()
    const basename = pathModule.basename(normalized)
    const dirname = pathModule.dirname(normalized)

    if (EXCLUDED_FILE_PATTERNS.test(basename)) return null

    const parts = normalized.split('/')
    for (const part of parts) {
      if (EXCLUDED_DIRS.has(part)) return null
    }

    if (normalized.includes('规划/') || normalized.includes('大纲/') ||
        basename.includes('大纲') || basename.includes('outline') || basename.includes('规划')) {
      return 'outline'
    }

    if (normalized.includes('设定/') || normalized.includes('人物/') || normalized.includes('世界观/') ||
        basename.includes('人物') || basename.includes('角色') || basename.includes('character')) {
      return 'setting'
    }

    if (normalized.includes('正文/') || normalized.includes('输出/') || normalized.includes('章节/') ||
        normalized.includes('manuscript/') || normalized.includes('chapters/') ||
        basename.match(/^第[0-9一二三四五六七八九十百千]+[章节回]/) ||
        basename.includes('chapter')) {
      return 'manuscript'
    }

    if (basename.includes('世界观') || basename.includes('world') || basename.includes('设定')) {
      return 'world'
    }

    if (!normalized.endsWith('.md') && !normalized.endsWith('.txt')) return null

    return 'other'
  }

  function extractCharacters(text, sourceFile, origin = 'manual') {
    const characters = []
    const sections = extractSections(text)
    const foundNames = new Set()

    function addCharacter(name, desc, sourceHash) {
      name = String(name || '').trim()
      if (name.length < 2 || name.length > 12 || foundNames.has(name)) return
      foundNames.add(name)
      characters.push({
        id: generateStableId('char', name),
        name,
        description: String(desc || '').trim().slice(0, 500),
        source_file: sourceFile,
        source_hash: sourceHash || textToHash(text),
        origin,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
    }

    const characterSections = sections.filter(s =>
      s.title.match(/人物|角色|主角|配角|character/i)
    )

    const bulletPatterns = [
      /(?:^|\n)\s*(?:[-*•]|\d+\.)\s*\*\*([^*]+)\*\*[：:]\s*(.*)/g,
      /(?:^|\n)\s*(?:[-*•]|\d+\.)\s*([^\s：:，,。；;]{2,12})[：:]\s*(.*)/g
    ]

    for (const section of characterSections.length > 0 ? characterSections : sections) {
      const content = section.content
      for (const pattern of bulletPatterns) {
        pattern.lastIndex = 0
        let match
        while ((match = pattern.exec(content)) !== null) {
          addCharacter(match[1], match[2], textToHash(content))
        }
      }

      const headingPattern = /^#{2,4}\s+(.+?)(?:\s|$)/gm
      headingPattern.lastIndex = 0
      let hMatch
      while ((hMatch = headingPattern.exec(content)) !== null) {
        addCharacter(hMatch[1], '', textToHash(content))
      }
    }

    const lines = String(text).split(/\r?\n/)
    for (const line of lines) {
      const boldMatch = line.match(/^\s*[-*•]\s*\*\*([^*]{2,12})\*\*[：:]\s*(.*)/)
      if (boldMatch) addCharacter(boldMatch[1], boldMatch[2])
    }

    const basename = pathModule.basename(sourceFile, pathModule.extname(sourceFile))
    if (basename.includes('人物') || basename.includes('角色')) {
      const simpleNameMatch = text.match(/^#\s+(.+)$/m)
      if (simpleNameMatch) {
        addCharacter(simpleNameMatch[1], text.slice(0, 500))
      }
      if (characters.length === 0 && text.length > 10) {
        addCharacter(basename.replace(/人物|角色|设定/g, ''), text.slice(0, 300))
      }
    }

    return characters
  }

  function extractChapters(text, sourceFile, origin = 'manual') {
    const chapters = []
    const sections = extractSections(text)
    const chapterHeadingPattern = /^第\s*([0-9一二三四五六七八九十百千零〇]+)\s*[章节回卷部篇集话]\s*[：:、.]?\s*(.*)$/
    const foundNumbers = new Set()
    const numberMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10,
      '百': 100, '千': 1000, '零': 0, '〇': 0 }

    function chineseToNum(str) {
      if (/^\d+$/.test(str)) return parseInt(str, 10)
      let result = 0
      let temp = 0
      for (const ch of str) {
        if (numberMap[ch] === 10 || numberMap[ch] === 100 || numberMap[ch] === 1000) {
          if (temp === 0) temp = 1
          result += temp * numberMap[ch]
          temp = 0
        } else if (numberMap[ch] !== undefined) {
          temp = numberMap[ch]
        }
      }
      return result + temp
    }

    for (const section of sections) {
      const match = section.title.match(chapterHeadingPattern)
      if (match) {
        const num = chineseToNum(match[1])
        if (num > 0 && !foundNumbers.has(num)) {
          foundNumbers.add(num)
          const title = match[2].trim() || `第${match[1]}章`
          const contentLines = section.content.split(/\r?\n/).filter(l => l.trim())
          chapters.push({
            id: generateStableId('ch', `chapter-${num}-${title}`),
            number: num,
            title,
            summary: contentLines.slice(0, 3).join(' ').trim().slice(0, 800),
            word_count: section.content.length,
            source_file: sourceFile,
            source_hash: textToHash(section.content),
            origin,
            status: 'draft',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        }
      }
    }

    const lines = String(text).split(/\r?\n/)
    for (const line of lines) {
      const inlineMatch = line.match(chapterHeadingPattern)
      if (inlineMatch) {
        const num = chineseToNum(inlineMatch[1])
        if (num > 0 && !foundNumbers.has(num)) {
          foundNumbers.add(num)
          const title = inlineMatch[2].trim() || `第${inlineMatch[1]}章`
          chapters.push({
            id: generateStableId('ch', `chapter-${num}-${title}`),
            number: num,
            title,
            summary: '',
            word_count: 0,
            source_file: sourceFile,
            source_hash: textToHash(line),
            origin,
            status: 'draft',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        }
      }
    }

    const basename = pathModule.basename(sourceFile, pathModule.extname(sourceFile))
    const fileChapterMatch = basename.match(chapterHeadingPattern)
    if (fileChapterMatch && chapters.length === 0) {
      const num = chineseToNum(fileChapterMatch[1])
      if (num > 0) {
        const title = fileChapterMatch[2].trim() || basename
        const firstLines = String(text).split(/\r?\n/).filter(l => l.trim()).slice(0, 3).join(' ')
        chapters.push({
          id: generateStableId('ch', `chapter-${num}-${title}`),
          number: num,
          title,
          summary: firstLines.slice(0, 800),
          word_count: text.length,
          source_file: sourceFile,
          source_hash: textToHash(text),
          origin,
          status: 'draft',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      }
    }

    return chapters
  }

  function extractWorldRules(text, sourceFile, origin = 'manual') {
    const rules = []
    const sections = extractSections(text)
    const ruleSections = sections.filter(s =>
      s.title.match(/世界观|规则|设定|地点|势力|世界|背景|world|rule|setting|location|faction|location/i)
    )

    const targetSections = ruleSections.length > 0 ? ruleSections : sections

    for (const section of targetSections) {
      const lines = section.content.split(/\r?\n/).filter(l => l.trim())
      let currentCategory = section.title
      for (const line of lines) {
        const bulletMatch = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.+)$/)
        const content = bulletMatch ? bulletMatch[1].trim() : line.trim()
        if (content.length > 3 && content.length < 500) {
          const ruleId = generateStableId('rule', `${currentCategory}-${content.slice(0, 30)}`)
          if (!rules.find(r => r.id === ruleId)) {
            rules.push({
              id: ruleId,
              category: currentCategory,
              content: content.slice(0, 500),
              source_file: sourceFile,
              source_hash: textToHash(content),
              origin,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
          }
        }
      }
    }

    return rules
  }

  function extractLocations(text, sourceFile, origin = 'manual') {
    const locations = []
    const sections = extractSections(text)
    const locationSections = sections.filter(s =>
      s.title.match(/地点|场景|location|place|setting/i)
    )

    for (const section of locationSections) {
      const lines = section.content.split(/\r?\n/).filter(l => l.trim())
      for (const line of lines) {
        const boldMatch = line.match(/^\s*[-*•]\s*\*\*([^*]+)\*\*[：:]?\s*(.*)$/)
        if (boldMatch) {
          locations.push({
            id: generateStableId('loc', boldMatch[1]),
            name: boldMatch[1].trim(),
            description: boldMatch[2].trim().slice(0, 300),
            source_file: sourceFile,
            source_hash: textToHash(line),
            origin,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
        }
      }
    }

    return locations
  }

  function extractForeshadows(text, sourceFile, origin = 'manual') {
    const foreshadows = []
    const foreshadowPatterns = [
      /伏笔|铺垫|线索|foreshadow|clue|hint/gi
    ]
    const sections = extractSections(text)

    for (const section of sections) {
      if (foreshadowPatterns.some(p => p.test(section.title))) {
        const lines = section.content.split(/\r?\n/).filter(l => l.trim())
        for (const line of lines) {
          const bulletMatch = line.match(/^\s*[-*•]\s+(.+)$/)
          if (bulletMatch && bulletMatch[1].trim().length > 5) {
            foreshadows.push({
              id: generateStableId('fs', bulletMatch[1].slice(0, 30)),
              content: bulletMatch[1].trim().slice(0, 300),
              status: 'unresolved',
              source_file: sourceFile,
              source_hash: textToHash(line),
              origin,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
          }
        }
      }
    }

    return foreshadows
  }

  function mergeById(existing, incoming, idKey = 'id') {
    const map = new Map()
    for (const item of existing) {
      if (item[idKey]) map.set(item[idKey], { ...item })
    }
    for (const item of incoming) {
      const key = item[idKey]
      if (key) {
        const existing = map.get(key)
        if (existing) {
          if (existing.origin === 'manual' && item.origin === 'workflow') {
            continue
          }
          map.set(key, { ...existing, ...item, updated_at: new Date().toISOString() })
        } else {
          map.set(key, { ...item })
        }
      }
    }
    return Array.from(map.values())
  }

  function scanProjectFiles(project) {
    const files = []
    const projectDir = project.folder

    function walk(dir, relPrefix = '') {
      let entries
      try {
        entries = fsModule.readdirSync(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const fullPath = pathModule.join(dir, entry.name)
        const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name

        if (entry.isDirectory()) {
          if (EXCLUDED_DIRS.has(entry.name)) continue
          if (entry.name.startsWith('.')) continue
          walk(fullPath, relPath)
        } else if (entry.isFile()) {
          const category = classifyFile(relPath)
          if (category) {
            try {
              const stat = fsModule.statSync(fullPath)
              const ext = pathModule.extname(entry.name).toLowerCase()
              if (ext === '.md' || ext === '.txt') {
                const text = fsModule.readFileSync(fullPath, 'utf8')
                files.push({
                  rel: relPath.replace(/\\/g, '/'),
                  file: fullPath,
                  category,
                  mtime: stat.mtime.toISOString(),
                  size: stat.size,
                  text,
                  hash: textToHash(text)
                })
              }
            } catch (e) {}
          }
        }
      }
    }

    walk(projectDir)
    return files
  }

  function ensureCanonicalDirectories(project) {
    const dirs = ['规划', '设定', '正文', 'versions/canonical-sync', 'bible', 'narrative-state', 'memory', 'documents']
    for (const dir of dirs) {
      fsModule.mkdirSync(pathModule.join(project.folder, dir), { recursive: true })
    }
  }

  function backupCanonicalFiles(project, timestamp) {
    const backupDir = pathModule.join(project.folder, 'versions', 'canonical-sync', timestamp)
    fsModule.mkdirSync(backupDir, { recursive: true })
    const backedUp = []

    for (const [type, paths] of Object.entries(CANONICAL_FILES)) {
      for (const relPath of paths) {
        const fullPath = pathModule.join(project.folder, relPath)
        if (fsModule.existsSync(fullPath)) {
          const backupPath = pathModule.join(backupDir, relPath.replace(/[\\/]/g, '_'))
          fsModule.copyFileSync(fullPath, backupPath)
          backedUp.push({ type, original: relPath, backup: pathModule.relative(project.folder, backupPath) })
          break
        }
      }
    }

    return { backup_dir: pathModule.relative(project.folder, backupDir), backed_up: backedUp }
  }

  function writeCanonicalMarkdown(project, type, data, options = {}) {
    const { source = 'workflow', run_id = null } = options
    const timestamp = new Date().toISOString()
    const filePath = pathModule.join(project.folder, CANONICAL_FILES[type][0])

    let existingContent = ''
    if (fsModule.existsSync(filePath)) {
      existingContent = fsModule.readFileSync(filePath, 'utf8')
    }

    const marker = `<!-- AUTO-SYNC:${source}${run_id ? ':' + run_id : ''}:${timestamp} -->`
    const endMarker = '<!-- /AUTO-SYNC -->'

    let newContent = existingContent
    const autoBlockRegex = /<!-- AUTO-SYNC:[^>]*-->[\s\S]*?<!-- \/AUTO-SYNC -->/g

    let autoBlock = ''

    if (type === 'outline' && (data.chapters?.length || data.goals?.length)) {
      const lines = ['', marker, '## 章节目录', '']
      if (data.chapters) {
        for (const ch of data.chapters) {
          lines.push(`- 第${ch.number}章：${ch.title}`)
        }
      }
      lines.push('', endMarker)
      autoBlock = lines.join('\n')
    } else if (type === 'characters' && data.characters?.length) {
      const lines = ['', marker, '## 主要人物', '']
      for (const char of data.characters.slice(0, 20)) {
        lines.push(`- **${char.name}**：${char.description || '人物描述'}`)
      }
      lines.push('', endMarker)
      autoBlock = lines.join('\n')
    } else if (type === 'world' && (data.world_rules?.length || data.locations?.length)) {
      const lines = ['', marker]
      if (data.locations?.length) {
        lines.push('## 主要地点', '')
        for (const loc of data.locations.slice(0, 15)) {
          lines.push(`- **${loc.name}**：${loc.description || '地点描述'}`)
        }
        lines.push('')
      }
      if (data.world_rules?.length) {
        lines.push('## 世界观规则', '')
        for (const rule of data.world_rules.slice(0, 20)) {
          lines.push(`- ${rule.content}`)
        }
        lines.push('')
      }
      lines.push(endMarker)
      autoBlock = lines.join('\n')
    }

    if (autoBlock) {
      autoBlockRegex.lastIndex = 0
      if (autoBlockRegex.test(existingContent)) {
        autoBlockRegex.lastIndex = 0
        newContent = existingContent.replace(autoBlockRegex, autoBlock.trim())
      } else {
        if (existingContent.trim() && !existingContent.endsWith('\n')) {
          newContent = existingContent + '\n' + autoBlock
        } else {
          newContent = existingContent + autoBlock
        }
      }
      fsModule.mkdirSync(pathModule.dirname(filePath), { recursive: true })
      fsModule.writeFileSync(filePath, newContent, 'utf8')
      return { file: CANONICAL_FILES[type][0], written: true }
    }

    return { file: CANONICAL_FILES[type][0], written: false, reason: 'no-data' }
  }

  function syncWriterProjectFull(project, options = {}) {
    const startTime = Date.now()
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const {
      source = 'manual',
      run_id = null,
      auto_update_canonical_files = false,
      record_version = true
    } = options

    ensureCanonicalDirectories(project)

    const report = {
      synced_at: new Date().toISOString(),
      source,
      run_id,
      project_id: project.id,
      project_title: project.title,
      documents_scanned: 0,
      documents_updated: 0,
      characters_added: 0,
      chapters_added: 0,
      world_rules_added: 0,
      locations_added: 0,
      foreshadows_added: 0,
      canonical_files_updated: [],
      conflicts: [],
      errors: [],
      backup: null
    }

    try {
      const files = scanProjectFiles(project)
      report.documents_scanned = files.length

      const allCharacters = []
      const allChapters = []
      const allWorldRules = []
      const allLocations = []
      const allForeshadows = []

      for (const file of files) {
        try {
          const origin = file.rel.includes('workflow') || source === 'workflow_run' ? 'workflow' : 'manual'

          const chars = extractCharacters(file.text, file.rel, origin)
          const chaps = extractChapters(file.text, file.rel, origin)
          const rules = extractWorldRules(file.text, file.rel, origin)
          const locs = extractLocations(file.text, file.rel, origin)
          const fs2 = extractForeshadows(file.text, file.rel, origin)

          allCharacters.push(...chars)
          allChapters.push(...chaps)
          allWorldRules.push(...rules)
          allLocations.push(...locs)
          allForeshadows.push(...fs2)
        } catch (err) {
          report.errors.push({ file: file.rel, error: err.message })
        }
      }

      const biblePath = pathModule.join(project.folder, 'bible', 'bible.json')
      const existingBible = readJsonFile(biblePath, {
        version: 1,
        project_id: project.id,
        project_slug: project.slug || project.id,
        title: project.title,
        chapters: [],
        characters: [],
        world: [],
        foreshadows: [],
        timeline: [],
        updated_at: null
      })

      const bibleChapters = allChapters.map(ch => ({
        id: ch.id,
        title: ch.title,
        number: ch.number,
        file: ch.source_file,
        chars: ch.word_count || 0,
        summary: ch.summary || '',
        status: ch.status || 'draft',
        origin: ch.origin,
        created_at: ch.created_at,
        updated_at: ch.updated_at
      }))

      const bibleCharacters = allCharacters.map(c => ({
        id: c.id,
        name: c.name,
        note: c.description || '',
        evidence: c.source_file,
        count: 1,
        signals: ['sync-extracted'],
        origin: c.origin,
        created_at: c.created_at,
        updated_at: c.updated_at
      }))

      const bibleWorld = [
        ...allWorldRules.map(r => ({
          id: r.id,
          rule: r.content,
          evidence: `${r.source_file}`,
          file: r.source_file,
          category: r.category,
          origin: r.origin,
          created_at: r.created_at,
          updated_at: r.updated_at
        })),
        ...allLocations.map(l => ({
          id: l.id,
          rule: `地点：${l.name} - ${l.description || ''}`,
          evidence: l.source_file,
          file: l.source_file,
          category: '地点',
          origin: l.origin,
          created_at: l.created_at,
          updated_at: l.updated_at
        }))
      ]

      const bibleForeshadows = allForeshadows.map(f => ({
        id: f.id,
        clue: f.content,
        status: f.status || 'open',
        evidence: f.source_file,
        file: f.source_file,
        origin: f.origin,
        created_at: f.created_at,
        updated_at: f.updated_at
      }))

      const bibleTimeline = bibleChapters.map(c => ({
        event: `第${c.number}章：${c.title}`,
        evidence: c.file,
        file: c.file,
        chapter: c.number
      }))

      const mergedChapters = mergeById(existingBible.chapters || [], bibleChapters)
        .sort((a, b) => (a.number || 0) - (b.number || 0))
      const mergedCharacters = mergeById(existingBible.characters || [], bibleCharacters)
      const mergedWorld = mergeById(existingBible.world || [], bibleWorld)
      const mergedForeshadows = mergeById(existingBible.foreshadows || [], bibleForeshadows)
      const mergedTimeline = mergeById(existingBible.timeline || [], bibleTimeline)

      report.characters_added = Math.max(0, mergedCharacters.length - (existingBible.characters?.length || 0))
      report.chapters_added = Math.max(0, mergedChapters.length - (existingBible.chapters?.length || 0))
      report.world_rules_added = Math.max(0, mergedWorld.length - (existingBible.world?.length || 0))
      report.foreshadows_added = Math.max(0, mergedForeshadows.length - (existingBible.foreshadows?.length || 0))

      const updatedBible = {
        ...existingBible,
        version: 1,
        project_id: project.id,
        project_slug: project.slug || project.id,
        title: project.title,
        updated_at: new Date().toISOString(),
        source_policy: 'sync-pipeline',
        sources: files.map(f => ({ file: f.rel, chars: f.text.length, lines: f.text.split(/\r?\n/).length })),
        chapters: mergedChapters,
        characters: mergedCharacters,
        world: mergedWorld,
        foreshadows: mergedForeshadows,
        timeline: mergedTimeline,
        last_sync: {
          source,
          run_id,
          synced_at: report.synced_at,
          documents_scanned: files.length
        }
      }
      writeJsonFile(biblePath, updatedBible)

      const bibleDir = pathModule.join(project.folder, 'bible')
      const md = [`# ${project.title} Project Bible`, '', `Updated: ${updatedBible.updated_at}`, '',
        '## Chapter summaries',
        ...(updatedBible.chapters || []).map(row => `- 第${row.number}章 ${row.title} (${row.file}): ${row.summary}`),
        '', '## Characters',
        ...(updatedBible.characters || []).map(row => `- ${row.name}: ${row.note || ''} (source: ${row.evidence})`),
        '', '## World / canon rules',
        ...(updatedBible.world || []).map(row => `- ${row.rule} (source: ${row.evidence})`),
        '', '## Foreshadows',
        ...(updatedBible.foreshadows || []).map(row => `- [${row.status}] ${row.clue} (source: ${row.evidence})`),
        '', '## Timeline',
        ...(updatedBible.timeline || []).map(row => `- ${row.event} (source: ${row.evidence})`)
      ].join('\n')
      fsModule.writeFileSync(pathModule.join(bibleDir, 'bible.md'), md, 'utf8')

      const storyBiblePath = pathModule.join(project.folder, 'bible', 'story_bible.json')
      writeJsonFile(storyBiblePath, {
        version: 1,
        project_id: project.id,
        title: project.title,
        characters: mergedCharacters,
        chapters: mergedChapters,
        locations: allLocations,
        world_rules: allWorldRules,
        foreshadows: mergedForeshadows,
        timeline: mergedTimeline,
        updated_at: updatedBible.updated_at,
        last_sync: updatedBible.last_sync
      })

      const narrativeStatePath = pathModule.join(project.folder, 'narrative-state', 'narrative_state.json')
      const narrativeState = {
        version: 1,
        project_id: project.id,
        current_chapter: mergedChapters.find(c => c.status !== 'completed')?.number || mergedChapters.length || 0,
        characters: mergedCharacters.map(c => ({
          id: c.id,
          name: c.name,
          status: 'active',
          arc_progress: 0,
          last_appearance_chapter: null
        })),
        threads: [],
        timeline: mergedChapters.map(c => ({ chapter: c.number, title: c.title, events: [] })),
        continuity_checks: [],
        updated_at: new Date().toISOString()
      }
      writeJsonFile(narrativeStatePath, narrativeState)

      const memoryPath = pathModule.join(project.folder, 'memory', 'creative_memory.json')
      const creativeMemory = {
        version: 1,
        project_id: project.id,
        memories: [
          ...mergedChapters.map(c => ({
            id: generateStableId('mem_ch', `chapter-${c.number}-${c.title}`),
            type: 'chapter',
            content: c.summary || c.title,
            chapter: c.number,
            created_at: c.created_at,
            updated_at: c.updated_at
          })),
          ...mergedCharacters.map(c => ({
            id: generateStableId('mem_char', c.name),
            type: 'character',
            content: `${c.name}: ${c.note || '主要角色'}`,
            character_id: c.id,
            created_at: c.created_at,
            updated_at: c.updated_at
          })),
          ...mergedWorld.map(r => ({
            id: generateStableId('mem_rule', r.id),
            type: 'world_rule',
            content: r.rule,
            category: r.category,
            created_at: r.created_at,
            updated_at: r.updated_at
          }))
        ],
        decisions: [],
        preferences: [],
        updated_at: new Date().toISOString()
      }
      writeJsonFile(memoryPath, creativeMemory)

      const docsData = {
        version: 1,
        project_id: project.id,
        documents: files.map(f => ({
          id: generateStableId('doc', f.rel),
          title: pathModule.basename(f.rel, pathModule.extname(f.rel)),
          rel: f.rel,
          file: f.file,
          category: f.category,
          size: f.size,
          mtime: f.mtime,
          hash: f.hash,
          chars: f.text.length,
          lines: f.text.split(/\r?\n/).length
        })),
        updated_at: new Date().toISOString(),
        stats: {
          documents: files.length,
          total_chars: files.reduce((sum, f) => sum + f.text.length, 0)
        }
      }
      writeJsonFile(pathModule.join(project.folder, 'documents', 'documents.json'), docsData)
      report.documents_updated = files.length

      if (auto_update_canonical_files && (report.chapters_added > 0 || report.characters_added > 0 || report.world_rules_added > 0)) {
        report.backup = backupCanonicalFiles(project, timestamp)

        const outlineResult = writeCanonicalMarkdown(project, 'outline', { chapters: mergedChapters }, { source, run_id })
        if (outlineResult.written) report.canonical_files_updated.push(outlineResult.file)

        const charResult = writeCanonicalMarkdown(project, 'characters', { characters: mergedCharacters }, { source, run_id })
        if (charResult.written) report.canonical_files_updated.push(charResult.file)

        const worldResult = writeCanonicalMarkdown(project, 'world', { world_rules: mergedWorld, locations: allLocations }, { source, run_id })
        if (worldResult.written) report.canonical_files_updated.push(worldResult.file)
      }

      const artifactsPath = pathModule.join(project.folder, 'artifacts', 'artifacts.json')
      const existingArtifacts = readJsonFile(artifactsPath, { version: 1, project_id: project.id, artifacts: [] })
      const syncArtifact = {
        id: generateStableId('sync', `sync-${timestamp}`),
        type: 'project_sync',
        source,
        run_id,
        created_at: report.synced_at,
        stats: {
          documents_scanned: report.documents_scanned,
          characters: mergedCharacters.length,
          chapters: mergedChapters.length,
          world_rules: mergedWorld.length,
          locations: allLocations.length
        }
      }
      writeJsonFile(artifactsPath, {
        ...existingArtifacts,
        artifacts: [...(existingArtifacts.artifacts || []), syncArtifact].slice(-100),
        updated_at: new Date().toISOString()
      })

      const graphDir = pathModule.join(project.folder, 'graph')
      fsModule.mkdirSync(graphDir, { recursive: true })
      writeJsonFile(pathModule.join(graphDir, 'knowledge_graph.json'), {
        version: 1,
        project_id: project.id,
        nodes: [
          ...mergedCharacters.map(c => ({ id: c.id, type: 'character', label: c.name })),
          ...mergedChapters.map(c => ({ id: c.id, type: 'chapter', label: c.title })),
          ...allLocations.map(l => ({ id: l.id, type: 'location', label: l.name }))
        ],
        edges: [],
        updated_at: new Date().toISOString()
      })

      const wikiDir = pathModule.join(project.folder, 'wiki')
      fsModule.mkdirSync(wikiDir, { recursive: true })
      writeJsonFile(pathModule.join(wikiDir, 'living_wiki.json'), {
        version: 1,
        project_id: project.id,
        entries: [
          ...mergedCharacters.map(c => ({ id: c.id, title: c.name, content: c.note || '', type: 'character' })),
          ...mergedChapters.map(c => ({ id: c.id, title: c.title, content: c.summary || '', type: 'chapter' })),
          ...allLocations.map(l => ({ id: l.id, title: l.name, content: l.description || '', type: 'location' }))
        ],
        updated_at: new Date().toISOString()
      })

      const syncReportPath = pathModule.join(project.folder, 'documents', 'last_sync_report.json')
      report.duration_ms = Date.now() - startTime
      report.ok = true
      writeJsonFile(syncReportPath, report)

    } catch (err) {
      report.errors.push({ fatal: true, error: err.message, stack: err.stack })
      report.ok = false
      report.duration_ms = Date.now() - startTime
      try {
        writeJsonFile(pathModule.join(project.folder, 'documents', 'last_sync_report.json'), report)
      } catch {}
    }

    return report
  }

  function checkProjectNeedsSync(project) {
    const docsJsonPath = pathModule.join(project.folder, 'documents', 'documents.json')
    const syncReportPath = pathModule.join(project.folder, 'documents', 'last_sync_report.json')

    let lastSyncTime = null
    try {
      const report = readJsonFile(syncReportPath, null)
      lastSyncTime = report?.synced_at ? new Date(report.synced_at) : null
    } catch {}

    const unsyncedFiles = []
    const files = scanProjectFiles(project)

    for (const file of files) {
      const fileMtime = new Date(file.mtime)
      if (!lastSyncTime || fileMtime > lastSyncTime) {
        unsyncedFiles.push(file.rel)
      }
    }

    return {
      needs_sync: unsyncedFiles.length > 0 || !lastSyncTime,
      unsynced_files: unsyncedFiles,
      last_sync_at: lastSyncTime?.toISOString() || null,
      files_scanned: files.length
    }
  }

  return {
    syncWriterProjectFull,
    checkProjectNeedsSync,
    extractSections,
    classifyFile,
    extractCharacters,
    extractChapters,
    extractWorldRules,
    extractLocations,
    extractForeshadows,
    scanProjectFiles,
    backupCanonicalFiles,
    writeCanonicalMarkdown,
    ensureCanonicalDirectories,
    mergeById,
    textToHash,
    generateStableId
  }
}

module.exports = { createWriterProjectSync }
