'use strict'

const STYLE_AXES = [
  '写实主义', '现代主义', '后现代主义', '魔幻现实主义', '浪漫主义',
  '极简主义', '意识流', '黑色幽默', '寓言式', '散文式',
  '冷峻克制', '热烈奔放', '细腻敏感', '粗犷有力', '诗意抒情'
]

const THEME_AXES = [
  '存在与虚无', '记忆与遗忘', '爱与失去', '自由与束缚', '成长与蜕变',
  '孤独与联结', '真相与谎言', '命运与选择', '秩序与混沌', '传统与现代',
  '城市与乡村', '时间与永恒', '身份认同', '阶级差异', '家庭羁绊'
]

const MOTIF_AXES = [
  '水与河流', '光与影', '门与窗', '道路与旅程', '镜子与反射',
  '四季轮回', '天气变化', '信件与文字', '旧物与回忆', '声音与沉默',
  '食物与味觉', '衣服与身份', '建筑与空间', '植物与生长', '动物与象征'
]

const SETTING_AXES = [
  '当代都市', '小城小镇', '乡村山野', '历史年代', '近未来',
  '工厂厂区', '学校校园', '医院诊所', '机关单位', '家庭居所',
  '街巷弄堂', '市场商铺', '交通枢纽', '边境地带', '虚拟空间'
]

const CHARACTER_AXES = [
  '边缘人', '理想主义者', '务实者', '叛逆者', '守护者',
  '流浪者', '观察者', '行动派', '思考者', '调停者',
  '新手', '老手', '外来者', '归来者', '转型者'
]

function pickRandom(arr, crypto) {
  const bytes = crypto.randomBytes(4)
  const idx = bytes.readUInt32BE(0) % arr.length
  return arr[idx]
}

function pickMultiple(arr, count, crypto) {
  const shuffled = [...arr]
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = crypto.randomBytes(4).readUInt32BE(0) % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, count)
}

function generateCreativeSeed(project, crypto) {
  const salt = crypto.randomBytes(16).toString('hex')
  const style = pickMultiple(STYLE_AXES, 2, crypto)
  const theme = pickMultiple(THEME_AXES, 2, crypto)
  const motif = pickMultiple(MOTIF_AXES, 3, crypto)
  const setting = pickRandom(SETTING_AXES, crypto)
  const character = pickMultiple(CHARACTER_AXES, 2, crypto)
  const seedId = `cs_${crypto.randomBytes(6).toString('hex')}`
  const seedText = `本项目创作方向：以${setting}为主要空间，采用${style.join('、')}的写作风格，围绕${theme.join('、')}等核心主题，运用${motif.join('、')}等核心意象，塑造${character.join('、')}类型的人物。故事需要形成独特的气质和独立的人物体系，与作者其它作品保持明显区分。`
  const hash = crypto.createHash('sha256').update(`${project.id}:${project.workspace_id}:${project.folder}:${salt}:${seedText}`).digest('hex')
  return {
    seed_id: seedId,
    seed_text: seedText,
    seed_hash: hash,
    random_salt: salt,
    style_axes: style,
    theme_axes: theme,
    motif_axes: motif,
    setting_axes: [setting],
    character_axes: character
  }
}

function createCreativeIdentityService({ fs, path, crypto, readJsonFile, writeJsonFile }) {
  const creativeIdentityPath = project => path.join(project.folder, 'identity', 'creative_identity.json')
  const reuseGuardReportPath = project => path.join(project.folder, 'safety', 'reuse_guard_report.json')

  const ensureCreativeIdentity = (project, options = {}) => {
    const identityFile = creativeIdentityPath(project)
    const dir = path.dirname(identityFile)
    fs.mkdirSync(dir, { recursive: true })
    fs.mkdirSync(path.join(project.folder, 'safety'), { recursive: true })
    fs.mkdirSync(path.join(project.folder, 'memory'), { recursive: true })
    fs.mkdirSync(path.join(project.folder, 'bible'), { recursive: true })
    fs.mkdirSync(path.join(project.folder, 'narrative-state'), { recursive: true })
    fs.mkdirSync(path.join(project.folder, 'documents'), { recursive: true })
    fs.mkdirSync(path.join(project.folder, 'versions'), { recursive: true })
    let identity = null
    let isNew = false
    if (fs.existsSync(identityFile)) {
      try {
        identity = readJsonFile(identityFile, null)
      } catch {
        identity = null
      }
    }
    if (!identity || !identity.creative_seed || !identity.creative_seed.seed_id) {
      isNew = true
      const now = new Date().toISOString()
      identity = {
        version: 1,
        project_id: project.id,
        workspace_id: project.workspace_id || '',
        project_title: project.title || '',
        created_at: identity?.created_at || now,
        updated_at: now,
        taxonomy: project.taxonomy || {
          domainId: 'literature',
          familyId: 'novel',
          formId: 'literary-novel',
          primaryDocumentType: 'narrative_prose'
        },
        creative_seed: generateCreativeSeed(project, crypto),
        reuse_guard: {
          enabled: true,
          must_not_reuse_names: [],
          must_not_reuse_professions: [],
          must_not_reuse_core_motifs: [],
          must_not_reuse_story_titles: [],
          source_project_ids: [],
          last_scanned_at: null
        },
        status: {
          initialized: true,
          migrated_from_existing_docs: Boolean(options.migrated),
          last_scan_at: null
        }
      }
      writeJsonFile(identityFile, identity)
    }
    const reportFile = reuseGuardReportPath(project)
    if (!fs.existsSync(reportFile)) {
      writeJsonFile(reportFile, {
        version: 1,
        project_id: project.id,
        checked_at: null,
        status: 'ok',
        matches: [],
        recommendations: []
      })
    }
    const memoryFile = path.join(project.folder, 'memory', 'creative_memory.json')
    if (!fs.existsSync(memoryFile)) {
      writeJsonFile(memoryFile, {
        version: 1,
        project_id: project.id,
        characters: [],
        professions: [],
        locations: [],
        motifs: [],
        chapters: [],
        memories: [],
        decisions: [],
        preferences: [],
        updated_at: new Date().toISOString()
      })
    }
    return { ok: true, identity, isNew }
  }

  const readCreativeIdentity = project => {
    const identityFile = creativeIdentityPath(project)
    if (!fs.existsSync(identityFile)) return null
    try {
      return readJsonFile(identityFile, null)
    } catch {
      return null
    }
  }

  const updateReuseGuard = (project, guardData) => {
    const { identity } = ensureCreativeIdentity(project)
    identity.reuse_guard = {
      ...identity.reuse_guard,
      ...guardData,
      last_scanned_at: new Date().toISOString()
    }
    identity.updated_at = new Date().toISOString()
    identity.status.last_scan_at = identity.reuse_guard.last_scanned_at
    writeJsonFile(creativeIdentityPath(project), identity)
    return identity
  }

  return {
    ensureCreativeIdentity,
    readCreativeIdentity,
    updateReuseGuard,
    creativeIdentityPath,
    reuseGuardReportPath: reuseGuardReportPath
  }
}

module.exports = { createCreativeIdentityService }
