import type {
  WritingDomain,
  WritingFormFamily,
  WritingForm,
  DocumentPreset,
  ProjectCatalog
} from '@/types/writer-project-catalog'

export const CATALOG_VERSION = '2026.07'

export const WRITING_DOMAINS: WritingDomain[] = [
  { id: 'literature', label: '文学与叙事创作', description: '小说、散文、诗歌、非虚构等文学创作', icon: 'book', order: 1 },
  { id: 'film-theater', label: '影视戏剧表演', description: '影视剧本、舞台戏剧、音频戏剧', icon: 'file-media', order: 2 },
  { id: 'games-interactive', label: '游戏互动叙事', description: '游戏剧情、互动小说、跑团', icon: 'git-branch', order: 3 },
  { id: 'marketing-brand', label: '营销品牌文案', description: '广告、品牌、电商、内容营销', icon: 'megaphone', order: 4 },
  { id: 'news-publishing', label: '新闻媒体出版', description: '新闻报道、出版编辑、媒体策划', icon: 'file-text', order: 5 },
  { id: 'academic-research', label: '学术科研写作', description: '论文、研究报告、基金申请', icon: 'library', order: 6 },
  { id: 'business-enterprise', label: '企业商业管理', description: '商业计划、方案、标书、管理文档', icon: 'briefcase', order: 7 },
  { id: 'legal-government', label: '政务法律合规', description: '法律文书、政务公文、合规文档', icon: 'shield', order: 8 },
  { id: 'technical-docs', label: '技术开发文档', description: 'API文档、技术方案、用户手册', icon: 'code', order: 9 },
  { id: 'knowledge-assets', label: '知识资产管理', description: 'Wiki、百科、术语表、RAG资料库', icon: 'database', order: 10 }
]

export const WRITING_FAMILIES: WritingFormFamily[] = [
  { id: 'novel', domainId: 'literature', label: '小说', description: '长短篇小说、网络小说、类型小说', order: 1 },
  { id: 'nonfiction', domainId: 'literature', label: '非虚构文学', description: '纪实、传记、报告文学', order: 2 },
  { id: 'prose', domainId: 'literature', label: '散文随笔', description: '散文、随笔、杂文、游记', order: 3 },
  { id: 'poetry', domainId: 'literature', label: '诗歌韵文', description: '诗歌、歌词、散文诗', order: 4 },
  { id: 'childrens-lit', domainId: 'literature', label: '儿童文学', description: '童话、寓言、儿童故事', order: 5 },
  { id: 'film-script', domainId: 'film-theater', label: '影视剧本', description: '电影、电视剧、网剧剧本', order: 1 },
  { id: 'stage-play', domainId: 'film-theater', label: '舞台戏剧', description: '话剧、音乐剧、戏曲', order: 2 },
  { id: 'audio-drama', domainId: 'film-theater', label: '音频戏剧', description: '广播剧、有声剧、播客叙事', order: 3 },
  { id: 'game-story', domainId: 'games-interactive', label: '游戏剧情', description: '游戏主线、支线、任务文本', order: 1 },
  { id: 'interactive-fiction', domainId: 'games-interactive', label: '互动叙事', description: '互动小说、视觉小说、剧本杀', order: 2 },
  { id: 'brand-copy', domainId: 'marketing-brand', label: '品牌文案', description: '品牌故事、Slogan、品牌手册', order: 1 },
  { id: 'ad-copy', domainId: 'marketing-brand', label: '广告文案', description: '平面、视频、信息流广告', order: 2 },
  { id: 'ecommerce-copy', domainId: 'marketing-brand', label: '电商文案', description: '商品详情、活动页、种草', order: 3 },
  { id: 'content-marketing', domainId: 'marketing-brand', label: '内容营销', description: 'SEO文章、白皮书、案例研究', order: 4 },
  { id: 'social-media', domainId: 'marketing-brand', label: '社交媒体', description: '公众号、小红书、微博等', order: 5 },
  { id: 'video-script', domainId: 'marketing-brand', label: '视频直播', description: '短视频脚本、直播话术', order: 6 },
  { id: 'news-reporting', domainId: 'news-publishing', label: '新闻内容', description: '消息、报道、特写、评论', order: 1 },
  { id: 'publishing', domainId: 'news-publishing', label: '出版文本', description: '图书、书稿、编辑加工', order: 2 },
  { id: 'academic-paper', domainId: 'academic-research', label: '学术论文', description: '期刊、会议、学位论文', order: 1 },
  { id: 'research-report', domainId: 'academic-research', label: '研究报告', description: '调研报告、技术报告、分析报告', order: 2 },
  { id: 'grant-proposal', domainId: 'academic-research', label: '基金申请', description: '基金、项目申请书', order: 3 },
  { id: 'business-plan', domainId: 'business-enterprise', label: '商业战略', description: '商业计划书、战略规划、可行性研究', order: 1 },
  { id: 'proposal-bid', domainId: 'business-enterprise', label: '方案标书', description: '项目方案、投标书、合作方案', order: 2 },
  { id: 'internal-mgmt', domainId: 'business-enterprise', label: '内部管理', description: '制度、SOP、会议纪要、总结', order: 3 },
  { id: 'sales-copy', domainId: 'business-enterprise', label: '销售文本', description: '销售话术、提案书、客户案例', order: 4 },
  { id: 'legal-document', domainId: 'legal-government', label: '法律文书', description: '合同、协议、律师函、诉状', order: 1 },
  { id: 'government-doc', domainId: 'legal-government', label: '政务公文', description: '通知、报告、意见、方案', order: 2 },
  { id: 'compliance-doc', domainId: 'legal-government', label: '合规文档', description: '隐私政策、合规报告、风险告知', order: 3 },
  { id: 'software-doc', domainId: 'technical-docs', label: '软件文档', description: 'README、API文档、架构设计', order: 1 },
  { id: 'product-doc', domainId: 'technical-docs', label: '产品文档', description: 'PRD、需求文档、用户手册', order: 2 },
  { id: 'testing-doc', domainId: 'technical-docs', label: '测试文档', description: '测试计划、用例、报告', order: 3 },
  { id: 'knowledge-base', domainId: 'knowledge-assets', label: '知识库', description: 'Wiki、百科、术语表、RAG库', order: 1 },
  { id: 'creative-process', domainId: 'knowledge-assets', label: '创作过程', description: '大纲、设定、时间线、素材库', order: 2 }
]

export const DOCUMENT_PRESETS: DocumentPreset[] = [
  { id: 'novel-outline', label: '故事大纲', description: '三幕结构故事大纲模板', documentType: 'outline', defaultPath: '规划/故事大纲.md', templateId: 'outline.novel.v1', kind: 'file' },
  { id: 'character-bible', label: '人物设定', description: '主要人物档案模板', documentType: 'knowledge_asset', defaultPath: '设定/人物设定.md', templateId: 'bible.characters.v1', kind: 'file' },
  { id: 'worldbuilding', label: '世界观设定', description: '世界观和规则设定', documentType: 'knowledge_asset', defaultPath: '设定/世界观.md', templateId: 'bible.world.v1', kind: 'file' },
  { id: 'timeline', label: '时间轴', description: '故事时间线模板', documentType: 'knowledge_asset', defaultPath: '设定/时间轴.md', templateId: 'bible.timeline.v1', kind: 'file' },
  { id: 'manuscript-dir', label: '正文章节', description: '正文写作目录', documentType: 'narrative_prose', defaultPath: '正文/', kind: 'directory' },
  { id: 'research-dir', label: '研究资料', description: '资料收集和研究笔记', documentType: 'research_material', defaultPath: '资料/', kind: 'directory' },
  { id: 'revisions-dir', label: '修订版本', description: '修订稿和版本对比', documentType: 'revision_artifact', defaultPath: '修订/', kind: 'directory' },
  { id: 'screenplay-outline', label: '剧本大纲', description: '三幕结构剧本大纲', documentType: 'outline', defaultPath: '规划/剧本大纲.md', templateId: 'outline.screenplay.v1', kind: 'file' },
  { id: 'character-dossier', label: '人物小传', description: '角色人物小传', documentType: 'knowledge_asset', defaultPath: '人物/人物小传.md', templateId: 'bible.characters.screenplay.v1', kind: 'file' },
  { id: 'scene-list', label: '分场大纲', description: '场次列表和节拍表', documentType: 'outline', defaultPath: '规划/分场大纲.md', kind: 'file' },
  { id: 'scenes-dir', label: '场景剧本', description: '分场景剧本目录', documentType: 'script_dialogue', defaultPath: '剧本/场景/', kind: 'directory' },
  { id: 'story-bible', label: '剧集圣经', description: 'Series Bible 剧集设定', documentType: 'knowledge_asset', defaultPath: '设定/剧集圣经.md', kind: 'file' },
  { id: 'game-world', label: '世界观设定', description: '游戏世界和阵营设定', documentType: 'knowledge_asset', defaultPath: '设定/世界观.md', kind: 'file' },
  { id: 'main-quest', label: '主线剧情', description: '游戏主线剧情脚本', documentType: 'interactive_narrative', defaultPath: '剧情/主线.md', kind: 'file' },
  { id: 'character-dialogue', label: 'NPC对话', description: 'NPC 对话和语音台词', documentType: 'interactive_narrative', defaultPath: '对话/NPC/', kind: 'directory' },
  { id: 'quest-text', label: '任务文本', description: '任务描述和系统文本', documentType: 'interactive_narrative', defaultPath: '系统/任务文本.md', kind: 'file' },
  { id: 'brand-story', label: '品牌故事', description: '品牌定位和品牌故事', documentType: 'marketing_copy', defaultPath: '品牌/品牌故事.md', kind: 'file' },
  { id: 'brand-voice', label: '品牌语调', description: '品牌语调和命名规范', documentType: 'knowledge_asset', defaultPath: '品牌/语调指南.md', kind: 'file' },
  { id: 'slogan', label: 'Slogan 方案', description: '核心传播语和Tagline', documentType: 'marketing_copy', defaultPath: '品牌/Slogan.md', kind: 'file' },
  { id: 'ad-campaign', label: '广告文案', description: '广告创意和文案方案', documentType: 'marketing_copy', defaultPath: '广告/广告文案.md', kind: 'file' },
  { id: 'product-detail', label: '商品详情页', description: '电商商品详情文案', documentType: 'marketing_copy', defaultPath: '电商/商品详情.md', kind: 'file' },
  { id: 'content-calendar', label: '内容排期', description: '社交媒体内容日历', documentType: 'outline', defaultPath: '运营/内容排期.md', kind: 'file' },
  { id: 'seo-articles-dir', label: 'SEO文章', description: 'SEO优化文章目录', documentType: 'informational_article', defaultPath: '内容/SEO/', kind: 'directory' },
  { id: 'whitepaper', label: '白皮书', description: '行业白皮书或电子书', documentType: 'informational_article', defaultPath: '内容/白皮书.md', kind: 'file' },
  { id: 'news-article', label: '新闻报道', description: '新闻稿件模板', documentType: 'informational_article', defaultPath: '新闻/新闻稿.md', kind: 'file' },
  { id: 'press-release', label: '新闻通稿', description: '媒体通稿和发布会稿', documentType: 'informational_article', defaultPath: '公关/新闻通稿.md', kind: 'file' },
  { id: 'manuscript-book', label: '图书书稿', description: '图书正文稿件', documentType: 'narrative_prose', defaultPath: '书稿/正文/', kind: 'directory' },
  { id: 'book-proposal', label: '选题报告', description: '图书选题申报材料', documentType: 'structured_business_doc', defaultPath: '出版/选题报告.md', kind: 'file' },
  { id: 'academic-paper', label: '学术论文', description: '标准学术论文模板', documentType: 'argumentative_document', defaultPath: '论文/正文.md', kind: 'file' },
  { id: 'literature-review', label: '文献综述', description: '文献综述写作模板', documentType: 'argumentative_document', defaultPath: '论文/文献综述.md', kind: 'file' },
  { id: 'research-plan', label: '研究方案', description: '研究计划和实验方案', documentType: 'outline', defaultPath: '研究/研究方案.md', kind: 'file' },
  { id: 'grant-application', label: '基金申请书', description: '基金项目申请模板', documentType: 'structured_business_doc', defaultPath: '申请/基金申请书.md', kind: 'file' },
  { id: 'business-plan-doc', label: '商业计划书', description: '完整商业计划书模板', documentType: 'structured_business_doc', defaultPath: '商业/商业计划书.md', kind: 'file' },
  { id: 'prd', label: '产品需求文档', description: 'PRD 产品需求文档', documentType: 'structured_business_doc', defaultPath: '产品/PRD.md', kind: 'file' },
  { id: 'project-proposal', label: '项目方案', description: '项目建议书和方案', documentType: 'structured_business_doc', defaultPath: '项目/项目方案.md', kind: 'file' },
  { id: 'bid-proposal', label: '投标书', description: '投标文件模板', documentType: 'structured_business_doc', defaultPath: '投标/投标书.md', kind: 'file' },
  { id: 'meeting-minutes', label: '会议纪要', description: '会议记录模板', documentType: 'review_feedback', defaultPath: '会议/会议纪要.md', kind: 'file' },
  { id: 'weekly-report', label: '周报', description: '周工作总结模板', documentType: 'review_feedback', defaultPath: '汇报/周报.md', kind: 'file' },
  { id: 'sales-pitch', label: '销售提案', description: '销售提案和Pitch', documentType: 'marketing_copy', defaultPath: '销售/提案书.md', kind: 'file' },
  { id: 'contract-template', label: '合同模板', description: '标准合同模板', documentType: 'regulated_document', defaultPath: '法律/合同.md', kind: 'file' },
  { id: 'legal-opinion', label: '法律意见书', description: '法律意见模板', documentType: 'regulated_document', defaultPath: '法律/法律意见书.md', kind: 'file' },
  { id: 'privacy-policy', label: '隐私政策', description: '隐私政策模板', documentType: 'regulated_document', defaultPath: '合规/隐私政策.md', kind: 'file' },
  { id: 'government-notice', label: '通知通告', description: '政务通知公告', documentType: 'regulated_document', defaultPath: '公文/通知.md', kind: 'file' },
  { id: 'government-report', label: '工作报告', description: '政府/企业工作报告', documentType: 'structured_business_doc', defaultPath: '汇报/工作报告.md', kind: 'file' },
  { id: 'readme', label: '项目 README', description: '项目说明文档', documentType: 'technical_document', defaultPath: 'README.md', kind: 'file' },
  { id: 'api-docs', label: 'API 文档', description: 'API 接口文档', documentType: 'technical_document', defaultPath: 'docs/api.md', kind: 'file' },
  { id: 'architecture-doc', label: '架构设计', description: '系统架构设计文档', documentType: 'technical_document', defaultPath: 'docs/architecture.md', kind: 'file' },
  { id: 'tech-spec', label: '技术方案', description: '技术方案和设计文档', documentType: 'technical_document', defaultPath: 'docs/technical-design.md', kind: 'file' },
  { id: 'user-manual', label: '用户手册', description: '用户使用手册', documentType: 'technical_document', defaultPath: 'docs/user-manual.md', kind: 'file' },
  { id: 'test-plan', label: '测试计划', description: '测试计划和用例', documentType: 'technical_document', defaultPath: 'tests/test-plan.md', kind: 'file' },
  { id: 'release-notes', label: '版本说明', description: 'Release Notes / Changelog', documentType: 'revision_artifact', defaultPath: 'CHANGELOG.md', kind: 'file' },
  { id: 'wiki-home', label: 'Wiki 首页', description: '知识库首页和目录', documentType: 'knowledge_asset', defaultPath: 'wiki/Home.md', kind: 'file' },
  { id: 'glossary', label: '术语表', description: '术语和概念定义', documentType: 'knowledge_asset', defaultPath: 'wiki/术语表.md', kind: 'file' },
  { id: 'evidence-library', label: '证据库', description: '引用来源和证据档案', documentType: 'research_material', defaultPath: 'evidence/', kind: 'directory' },
  { id: 'soul-profile', label: 'Soul 档案', description: '风格和人格档案', documentType: 'knowledge_asset', defaultPath: 'soul/profile.md', kind: 'file' },
  { id: 'prompt-library', label: 'Prompt 库', description: '提示词模板库', documentType: 'knowledge_asset', defaultPath: 'prompts/', kind: 'directory' }
]

function buildForms(): WritingForm[] {
  const forms: WritingForm[] = []

  const addForm = (form: Omit<WritingForm, 'searchableText'>) => {
    forms.push({
      ...form,
      searchableText: [form.label, ...form.aliases, form.primaryDocumentType, form.domainId, form.familyId, ...form.tags].join(' ')
    })
  }

  // 文学与叙事 - 小说
  addForm({ id: 'web-novel', domainId: 'literature', familyId: 'novel', label: '网络小说', aliases: ['网文', '连载小说', '轻小说'], primaryDocumentType: 'narrative_prose', capabilityProfileId: 'long-form-narrative', documentPresetIds: ['novel-outline', 'character-bible', 'worldbuilding', 'timeline', 'manuscript-dir', 'research-dir', 'revisions-dir'], promptProfileId: 'narrative.novel.web', outputSchemaProfileId: 'narrative.chapters', workflowProfileIds: ['narrative.long-form', 'narrative.continuity'], knowledgeProfileId: 'story-bible', tags: ['小说', '网文', '连载', '长篇'] })
  addForm({ id: 'literary-novel', domainId: 'literature', familyId: 'novel', label: '长篇小说', aliases: ['严肃文学', '文学小说', '传统小说'], primaryDocumentType: 'narrative_prose', capabilityProfileId: 'literary-novel', documentPresetIds: ['novel-outline', 'character-bible', 'worldbuilding', 'manuscript-dir', 'revisions-dir'], promptProfileId: 'narrative.novel.literary', outputSchemaProfileId: 'narrative.chapters', workflowProfileIds: ['narrative.long-form'], knowledgeProfileId: 'story-bible', tags: ['小说', '文学', '长篇'] })
  addForm({ id: 'short-story', domainId: 'literature', familyId: 'novel', label: '短篇小说', aliases: ['短篇', '微型小说', '小小说'], primaryDocumentType: 'narrative_prose', capabilityProfileId: 'short-form-narrative', documentPresetIds: ['novel-outline', 'manuscript-dir', 'revisions-dir'], promptProfileId: 'narrative.short-story', outputSchemaProfileId: 'narrative.short', workflowProfileIds: ['narrative.short-form'], knowledgeProfileId: 'basic', tags: ['小说', '短篇'] })

  // 文学与叙事 - 非虚构
  addForm({ id: 'biography', domainId: 'literature', familyId: 'nonfiction', label: '传记', aliases: ['自传', '回忆录', '人物传记'], primaryDocumentType: 'narrative_prose', capabilityProfileId: 'biography', documentPresetIds: ['research-dir', 'manuscript-dir', 'character-bible', 'timeline'], promptProfileId: 'nonfiction.biography', outputSchemaProfileId: 'narrative.chapters', workflowProfileIds: ['nonfiction.research'], knowledgeProfileId: 'research-heavy', tags: ['传记', '非虚构', '人物'] })
  addForm({ id: 'creative-nonfiction', domainId: 'literature', familyId: 'nonfiction', label: '创意非虚构', aliases: ['纪实文学', '报告文学', '调查非虚构'], primaryDocumentType: 'narrative_prose', capabilityProfileId: 'creative-nonfiction', documentPresetIds: ['research-dir', 'manuscript-dir', 'timeline'], promptProfileId: 'nonfiction.creative', outputSchemaProfileId: 'narrative.chapters', workflowProfileIds: ['nonfiction.research'], knowledgeProfileId: 'research-heavy', tags: ['非虚构', '纪实', '调查'] })

  // 文学与叙事 - 散文
  addForm({ id: 'prose-essay', domainId: 'literature', familyId: 'prose', label: '散文随笔', aliases: ['随笔', '杂文', '游记', '专栏'], primaryDocumentType: 'narrative_prose', capabilityProfileId: 'essay', documentPresetIds: ['manuscript-dir', 'research-dir'], promptProfileId: 'narrative.essay', outputSchemaProfileId: 'article.standard', workflowProfileIds: ['short-form'], knowledgeProfileId: 'basic', tags: ['散文', '随笔', '专栏'] })

  // 文学与叙事 - 诗歌
  addForm({ id: 'poetry-collection', domainId: 'literature', familyId: 'poetry', label: '诗歌集', aliases: ['现代诗', '古体诗', '歌词', '散文诗'], primaryDocumentType: 'narrative_prose', capabilityProfileId: 'poetry', documentPresetIds: ['manuscript-dir'], promptProfileId: 'narrative.poetry', outputSchemaProfileId: 'poetry.collection', workflowProfileIds: ['short-form'], knowledgeProfileId: 'basic', tags: ['诗歌', '诗词', '歌词'] })

  // 文学与叙事 - 儿童文学
  addForm({ id: 'childrens-story', domainId: 'literature', familyId: 'childrens-lit', label: '儿童故事', aliases: ['童话', '寓言', '儿童文学', '睡前故事'], primaryDocumentType: 'narrative_prose', capabilityProfileId: 'childrens-lit', documentPresetIds: ['novel-outline', 'character-bible', 'manuscript-dir'], promptProfileId: 'narrative.childrens', outputSchemaProfileId: 'narrative.chapters', workflowProfileIds: ['narrative.short-form'], knowledgeProfileId: 'story-bible', tags: ['儿童', '童话', '故事'] })

  // 影视戏剧 - 影视剧本
  addForm({ id: 'feature-film', domainId: 'film-theater', familyId: 'film-script', label: '电影剧本', aliases: ['院线电影', '网络电影', '微电影'], primaryDocumentType: 'script_dialogue', capabilityProfileId: 'screenplay-feature', documentPresetIds: ['screenplay-outline', 'character-dossier', 'scene-list', 'story-bible', 'scenes-dir'], promptProfileId: 'script.feature', outputSchemaProfileId: 'script.standard', workflowProfileIds: ['script.development'], knowledgeProfileId: 'story-bible', tags: ['电影', '剧本', '影视'] })
  addForm({ id: 'tv-script', domainId: 'film-theater', familyId: 'film-script', label: '电视剧剧本', aliases: ['剧集', '网剧', '短剧', '单元剧'], primaryDocumentType: 'script_dialogue', capabilityProfileId: 'screenplay-series', documentPresetIds: ['screenplay-outline', 'character-dossier', 'story-bible', 'scene-list', 'scenes-dir'], promptProfileId: 'script.episode', outputSchemaProfileId: 'script.standard', workflowProfileIds: ['script.series'], knowledgeProfileId: 'story-bible', tags: ['电视剧', '网剧', '剧集'] })
  addForm({ id: 'animation-script', domainId: 'film-theater', familyId: 'film-script', label: '动画剧本', aliases: ['动画电影', '番剧', '动画剧集'], primaryDocumentType: 'script_dialogue', capabilityProfileId: 'animation-script', documentPresetIds: ['screenplay-outline', 'character-dossier', 'scenes-dir'], promptProfileId: 'script.animation', outputSchemaProfileId: 'script.standard', workflowProfileIds: ['script.development'], knowledgeProfileId: 'story-bible', tags: ['动画', '剧本'] })
  addForm({ id: 'documentary-script', domainId: 'film-theater', familyId: 'film-script', label: '纪录片脚本', aliases: ['纪录片', '专题片', '宣传片'], primaryDocumentType: 'script_dialogue', capabilityProfileId: 'documentary', documentPresetIds: ['research-dir', 'scenes-dir', 'timeline'], promptProfileId: 'script.documentary', outputSchemaProfileId: 'script.documentary', workflowProfileIds: ['nonfiction.research'], knowledgeProfileId: 'research-heavy', tags: ['纪录片', '宣传片', '脚本'] })

  // 影视戏剧 - 舞台戏剧
  addForm({ id: 'stage-play', domainId: 'film-theater', familyId: 'stage-play', label: '话剧剧本', aliases: ['舞台剧', '戏剧', '小品'], primaryDocumentType: 'script_dialogue', capabilityProfileId: 'stage-play', documentPresetIds: ['screenplay-outline', 'character-dossier', 'scenes-dir'], promptProfileId: 'script.stage', outputSchemaProfileId: 'script.stage', workflowProfileIds: ['script.development'], knowledgeProfileId: 'story-bible', tags: ['话剧', '舞台', '戏剧'] })
  addForm({ id: 'musical-libretto', domainId: 'film-theater', familyId: 'stage-play', label: '音乐剧脚本', aliases: ['歌剧', '戏曲', '唱词'], primaryDocumentType: 'script_dialogue', capabilityProfileId: 'musical', documentPresetIds: ['screenplay-outline', 'character-dossier', 'scenes-dir'], promptProfileId: 'script.musical', outputSchemaProfileId: 'script.musical', workflowProfileIds: ['script.development'], knowledgeProfileId: 'story-bible', tags: ['音乐剧', '歌剧', '戏曲'] })

  // 影视戏剧 - 音频戏剧
  addForm({ id: 'audio-drama', domainId: 'film-theater', familyId: 'audio-drama', label: '广播剧', aliases: ['有声剧', '音频故事', '播客叙事'], primaryDocumentType: 'script_dialogue', capabilityProfileId: 'audio-drama', documentPresetIds: ['screenplay-outline', 'character-dossier', 'scenes-dir'], promptProfileId: 'script.audio', outputSchemaProfileId: 'script.audio', workflowProfileIds: ['script.development'], knowledgeProfileId: 'story-bible', tags: ['广播剧', '有声', '音频'] })

  // 游戏互动 - 游戏剧情
  addForm({ id: 'game-main-story', domainId: 'games-interactive', familyId: 'game-story', label: '游戏剧情', aliases: ['主线剧情', '支线剧情', '游戏脚本'], primaryDocumentType: 'interactive_narrative', capabilityProfileId: 'game-narrative', documentPresetIds: ['game-world', 'main-quest', 'character-dialogue', 'quest-text'], promptProfileId: 'game.story', outputSchemaProfileId: 'interactive.quest', workflowProfileIds: ['game.narrative'], knowledgeProfileId: 'game-world', tags: ['游戏', '剧情', '脚本'] })

  // 游戏互动 - 互动叙事
  addForm({ id: 'interactive-fiction', domainId: 'games-interactive', familyId: 'interactive-fiction', label: '互动小说', aliases: ['视觉小说', '文字冒险', 'AVG'], primaryDocumentType: 'interactive_narrative', capabilityProfileId: 'interactive-fiction', documentPresetIds: ['game-world', 'character-dossier', 'main-quest'], promptProfileId: 'interactive.fiction', outputSchemaProfileId: 'interactive.branching', workflowProfileIds: ['interactive.branching'], knowledgeProfileId: 'story-bible', tags: ['互动小说', '视觉小说', '分支'] })
  addForm({ id: 'murder-mystery', domainId: 'games-interactive', familyId: 'interactive-fiction', label: '剧本杀', aliases: ['谋杀之谜', 'LARP', '跑团模组'], primaryDocumentType: 'interactive_narrative', capabilityProfileId: 'murder-mystery', documentPresetIds: ['game-world', 'character-dossier', 'timeline'], promptProfileId: 'interactive.mystery', outputSchemaProfileId: 'interactive.mystery', workflowProfileIds: ['interactive.branching'], knowledgeProfileId: 'story-bible', tags: ['剧本杀', '推理', '跑团'] })

  // 营销品牌 - 品牌文案
  addForm({ id: 'brand-copywriting', domainId: 'marketing-brand', familyId: 'brand-copy', label: '品牌文案', aliases: ['品牌故事', '品牌定位', '品牌手册'], primaryDocumentType: 'marketing_copy', capabilityProfileId: 'brand-copy', documentPresetIds: ['brand-story', 'brand-voice', 'slogan'], promptProfileId: 'marketing.brand', outputSchemaProfileId: 'marketing.brand', workflowProfileIds: ['marketing.brand-development'], knowledgeProfileId: 'brand-knowledge', tags: ['品牌', '文案'] })

  // 营销品牌 - 广告文案
  addForm({ id: 'ad-copywriting', domainId: 'marketing-brand', familyId: 'ad-copy', label: '广告文案', aliases: ['平面广告', '视频广告', '信息流广告', '海报文案'], primaryDocumentType: 'marketing_copy', capabilityProfileId: 'ad-copy', documentPresetIds: ['ad-campaign', 'brand-voice'], promptProfileId: 'marketing.ad', outputSchemaProfileId: 'marketing.ad', workflowProfileIds: ['marketing.campaign'], knowledgeProfileId: 'brand-knowledge', tags: ['广告', '文案', '创意'] })

  // 营销品牌 - 电商文案
  addForm({ id: 'ecommerce-copy', domainId: 'marketing-brand', familyId: 'ecommerce-copy', label: '电商文案', aliases: ['商品详情', '详情页', '种草文案', '带货'], primaryDocumentType: 'marketing_copy', capabilityProfileId: 'ecommerce-copy', documentPresetIds: ['product-detail', 'brand-voice'], promptProfileId: 'marketing.ecommerce', outputSchemaProfileId: 'marketing.ecommerce', workflowProfileIds: ['marketing.campaign'], knowledgeProfileId: 'product-knowledge', tags: ['电商', '商品', '详情页'] })

  // 营销品牌 - 内容营销
  addForm({ id: 'content-marketing', domainId: 'marketing-brand', familyId: 'content-marketing', label: '内容营销', aliases: ['SEO文章', '白皮书', '案例研究', '博客'], primaryDocumentType: 'informational_article', capabilityProfileId: 'content-marketing', documentPresetIds: ['content-calendar', 'seo-articles-dir', 'whitepaper'], promptProfileId: 'marketing.content', outputSchemaProfileId: 'article.standard', workflowProfileIds: ['content.marketing'], knowledgeProfileId: 'brand-knowledge', tags: ['内容营销', 'SEO', '白皮书'] })

  // 营销品牌 - 社交媒体
  addForm({ id: 'social-media', domainId: 'marketing-brand', familyId: 'social-media', label: '社交媒体', aliases: ['公众号', '小红书', '微博', '抖音文案'], primaryDocumentType: 'marketing_copy', capabilityProfileId: 'social-media', documentPresetIds: ['content-calendar', 'brand-voice'], promptProfileId: 'marketing.social', outputSchemaProfileId: 'marketing.social', workflowProfileIds: ['content.marketing'], knowledgeProfileId: 'brand-knowledge', tags: ['社媒', '公众号', '小红书'] })

  // 营销品牌 - 视频直播
  addForm({ id: 'video-live', domainId: 'marketing-brand', familyId: 'video-script', label: '短视频脚本', aliases: ['口播稿', '直播话术', 'Vlog脚本', '测评脚本'], primaryDocumentType: 'script_dialogue', capabilityProfileId: 'video-script', documentPresetIds: ['content-calendar'], promptProfileId: 'video.short-form', outputSchemaProfileId: 'script.short-video', workflowProfileIds: ['short-form'], knowledgeProfileId: 'brand-knowledge', tags: ['短视频', '直播', '脚本'] })

  // 新闻出版 - 新闻内容
  addForm({ id: 'news-reporting', domainId: 'news-publishing', familyId: 'news-reporting', label: '新闻报道', aliases: ['消息', '通讯', '特写', '深度报道', '调查报道'], primaryDocumentType: 'informational_article', capabilityProfileId: 'news-reporting', documentPresetIds: ['news-article', 'research-dir'], promptProfileId: 'journalism.news', outputSchemaProfileId: 'article.news', workflowProfileIds: ['journalism.investigative'], knowledgeProfileId: 'research-heavy', tags: ['新闻', '报道', '媒体'] })
  addForm({ id: 'press-release', domainId: 'news-publishing', familyId: 'news-reporting', label: '新闻通稿', aliases: ['媒体通稿', '公关稿', '新闻发布'], primaryDocumentType: 'informational_article', capabilityProfileId: 'pr', documentPresetIds: ['press-release', 'brand-voice'], promptProfileId: 'pr.release', outputSchemaProfileId: 'article.press-release', workflowProfileIds: ['pr.communications'], knowledgeProfileId: 'brand-knowledge', tags: ['公关', '通稿', '新闻稿'] })

  // 新闻出版 - 出版文本
  addForm({ id: 'book-publishing', domainId: 'news-publishing', familyId: 'publishing', label: '图书出版', aliases: ['书稿', '图书选题', '编辑加工'], primaryDocumentType: 'narrative_prose', capabilityProfileId: 'book-publishing', documentPresetIds: ['manuscript-book', 'book-proposal', 'revisions-dir'], promptProfileId: 'publishing.book', outputSchemaProfileId: 'narrative.chapters', workflowProfileIds: ['publishing.editorial'], knowledgeProfileId: 'basic', tags: ['出版', '图书', '书稿'] })

  // 学术科研 - 学术论文
  addForm({ id: 'academic-paper', domainId: 'academic-research', familyId: 'academic-paper', label: '学术论文', aliases: ['期刊论文', '会议论文', '学位论文', '毕业论文'], primaryDocumentType: 'argumentative_document', capabilityProfileId: 'academic-paper', documentPresetIds: ['academic-paper', 'literature-review', 'research-plan'], promptProfileId: 'academic.paper', outputSchemaProfileId: 'academic.paper', workflowProfileIds: ['academic.research'], knowledgeProfileId: 'research-heavy', tags: ['论文', '学术', '科研'] })

  // 学术科研 - 研究报告
  addForm({ id: 'research-report', domainId: 'academic-research', familyId: 'research-report', label: '研究报告', aliases: ['调研报告', '技术报告', '数据分析报告'], primaryDocumentType: 'argumentative_document', capabilityProfileId: 'research-report', documentPresetIds: ['research-plan', 'research-dir'], promptProfileId: 'research.report', outputSchemaProfileId: 'report.standard', workflowProfileIds: ['academic.research'], knowledgeProfileId: 'research-heavy', tags: ['研究', '报告', '调研'] })

  // 学术科研 - 基金申请
  addForm({ id: 'grant-writing', domainId: 'academic-research', familyId: 'grant-proposal', label: '基金申请', aliases: ['国自然', '社科基金', '项目申请', '开题报告'], primaryDocumentType: 'structured_business_doc', capabilityProfileId: 'grant-writing', documentPresetIds: ['grant-application', 'research-plan', 'literature-review'], promptProfileId: 'grant.proposal', outputSchemaProfileId: 'grant.application', workflowProfileIds: ['grant.proposal'], knowledgeProfileId: 'research-heavy', tags: ['基金', '申请', '项目'] })

  // 企业商业 - 商业战略
  addForm({ id: 'business-plan', domainId: 'business-enterprise', familyId: 'business-plan', label: '商业计划书', aliases: ['创业计划', '战略规划', '可行性研究'], primaryDocumentType: 'structured_business_doc', capabilityProfileId: 'business-plan', documentPresetIds: ['business-plan-doc', 'research-dir'], promptProfileId: 'business.plan', outputSchemaProfileId: 'business.plan', workflowProfileIds: ['business.planning'], knowledgeProfileId: 'market-research', tags: ['商业计划', '创业', '战略'] })

  // 企业商业 - 方案标书
  addForm({ id: 'proposal-bid', domainId: 'business-enterprise', familyId: 'proposal-bid', label: '项目方案', aliases: ['建议书', '解决方案', '投标', '标书'], primaryDocumentType: 'structured_business_doc', capabilityProfileId: 'proposal-writing', documentPresetIds: ['project-proposal', 'bid-proposal'], promptProfileId: 'business.proposal', outputSchemaProfileId: 'business.proposal', workflowProfileIds: ['business.proposal'], knowledgeProfileId: 'product-knowledge', tags: ['方案', '投标', '项目'] })

  // 企业商业 - 内部管理
  addForm({ id: 'internal-docs', domainId: 'business-enterprise', familyId: 'internal-mgmt', label: '内部管理文档', aliases: ['制度', 'SOP', '会议纪要', '周报', '总结'], primaryDocumentType: 'structured_business_doc', capabilityProfileId: 'internal-docs', documentPresetIds: ['meeting-minutes', 'weekly-report'], promptProfileId: 'business.internal', outputSchemaProfileId: 'business.internal', workflowProfileIds: ['internal.docs'], knowledgeProfileId: 'basic', tags: ['内部', '管理', '制度'] })

  // 企业商业 - 销售文本
  addForm({ id: 'sales-copy', domainId: 'business-enterprise', familyId: 'sales-copy', label: '销售文本', aliases: ['销售话术', '客户案例', '提案书', '拜访提纲'], primaryDocumentType: 'marketing_copy', capabilityProfileId: 'sales-enablement', documentPresetIds: ['sales-pitch', 'brand-voice'], promptProfileId: 'sales.copy', outputSchemaProfileId: 'sales.proposal', workflowProfileIds: ['sales.enablement'], knowledgeProfileId: 'product-knowledge', tags: ['销售', '话术', '案例'] })

  // 政务法律 - 法律文书
  addForm({ id: 'legal-docs', domainId: 'legal-government', familyId: 'legal-document', label: '法律文书', aliases: ['合同', '协议', '律师函', '诉状', '法律意见书'], primaryDocumentType: 'regulated_document', capabilityProfileId: 'legal-document', documentPresetIds: ['contract-template', 'legal-opinion'], promptProfileId: 'legal.document', outputSchemaProfileId: 'legal.contract', workflowProfileIds: ['legal.review'], knowledgeProfileId: 'legal-research', tags: ['法律', '合同', '合规'] })

  // 政务法律 - 政务公文
  addForm({ id: 'government-docs', domainId: 'legal-government', familyId: 'government-doc', label: '政务公文', aliases: ['通知', '报告', '意见', '方案', '请示'], primaryDocumentType: 'regulated_document', capabilityProfileId: 'government-document', documentPresetIds: ['government-notice', 'government-report'], promptProfileId: 'government.document', outputSchemaProfileId: 'government.standard', workflowProfileIds: ['government.docs'], knowledgeProfileId: 'policy-research', tags: ['政务', '公文', '政府'] })

  // 政务法律 - 合规文档
  addForm({ id: 'compliance-docs', domainId: 'legal-government', familyId: 'compliance-doc', label: '合规文档', aliases: ['隐私政策', '用户协议', '合规报告', '风险告知'], primaryDocumentType: 'regulated_document', capabilityProfileId: 'compliance', documentPresetIds: ['privacy-policy', 'legal-opinion'], promptProfileId: 'compliance.document', outputSchemaProfileId: 'legal.compliance', workflowProfileIds: ['legal.review'], knowledgeProfileId: 'legal-research', tags: ['合规', '隐私', '政策'] })

  // 技术文档 - 软件文档
  addForm({ id: 'software-docs', domainId: 'technical-docs', familyId: 'software-doc', label: '软件项目文档', aliases: ['README', 'API文档', '架构设计', '开发文档'], primaryDocumentType: 'technical_document', capabilityProfileId: 'software-docs', documentPresetIds: ['readme', 'api-docs', 'architecture-doc', 'tech-spec', 'release-notes'], promptProfileId: 'tech.software', outputSchemaProfileId: 'technical.api', workflowProfileIds: ['tech.documentation'], knowledgeProfileId: 'tech-wiki', tags: ['软件', '开发', 'API'] })

  // 技术文档 - 产品文档
  addForm({ id: 'product-docs', domainId: 'technical-docs', familyId: 'product-doc', label: '产品文档', aliases: ['PRD', '需求文档', '用户手册', '帮助中心'], primaryDocumentType: 'technical_document', capabilityProfileId: 'product-docs', documentPresetIds: ['prd', 'user-manual'], promptProfileId: 'tech.product', outputSchemaProfileId: 'technical.product', workflowProfileIds: ['product.docs'], knowledgeProfileId: 'product-knowledge', tags: ['产品', 'PRD', '需求'] })

  // 技术文档 - 测试文档
  addForm({ id: 'testing-docs', domainId: 'technical-docs', familyId: 'testing-doc', label: '测试文档', aliases: ['测试计划', '测试用例', '测试报告', 'Bug报告'], primaryDocumentType: 'technical_document', capabilityProfileId: 'testing-docs', documentPresetIds: ['test-plan'], promptProfileId: 'tech.testing', outputSchemaProfileId: 'technical.test', workflowProfileIds: ['qa.testing'], knowledgeProfileId: 'tech-wiki', tags: ['测试', 'QA', '用例'] })

  // 知识资产 - 知识库
  addForm({ id: 'knowledge-base', domainId: 'knowledge-assets', familyId: 'knowledge-base', label: '知识库/Wiki', aliases: ['百科', '术语表', '内部Wiki', 'RAG资料库'], primaryDocumentType: 'knowledge_asset', capabilityProfileId: 'knowledge-base', documentPresetIds: ['wiki-home', 'glossary', 'evidence-library', 'prompt-library'], promptProfileId: 'knowledge.base', outputSchemaProfileId: 'knowledge.wiki', workflowProfileIds: ['knowledge.management'], knowledgeProfileId: 'full-wiki', tags: ['知识库', 'Wiki', '百科'] })

  // 知识资产 - 创作过程
  addForm({ id: 'creative-workspace', domainId: 'knowledge-assets', familyId: 'creative-process', label: '创作工作空间', aliases: ['大纲设定', '素材库', '时间线', '灵感收集'], primaryDocumentType: 'knowledge_asset', capabilityProfileId: 'creative-workspace', documentPresetIds: ['novel-outline', 'character-bible', 'worldbuilding', 'timeline', 'research-dir', 'prompt-library', 'soul-profile'], promptProfileId: 'creative.workspace', outputSchemaProfileId: 'knowledge.wiki', workflowProfileIds: ['creative.process'], knowledgeProfileId: 'story-bible', tags: ['创作', '设定', '素材'] })

  return forms
}

export const WRITING_FORMS: WritingForm[] = buildForms()

export const WRITER_PROJECT_CATALOG: ProjectCatalog = {
  version: CATALOG_VERSION,
  domains: WRITING_DOMAINS,
  families: WRITING_FAMILIES,
  forms: WRITING_FORMS,
  presets: DOCUMENT_PRESETS,
  capabilityProfiles: [...new Set(WRITING_FORMS.map(f => f.capabilityProfileId))],
  promptProfiles: [...new Set(WRITING_FORMS.map(f => f.promptProfileId))],
  outputSchemaProfiles: [...new Set(WRITING_FORMS.map(f => f.outputSchemaProfileId))],
  workflowProfiles: [...new Set(WRITING_FORMS.flatMap(f => f.workflowProfileIds))],
  knowledgeProfiles: [...new Set(WRITING_FORMS.map(f => f.knowledgeProfileId))]
}
