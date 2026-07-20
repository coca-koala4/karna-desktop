'use strict'

const CATEGORY_ZH_MAP = {
  collaboration: '协作办公',
  docs_storage: '文档与网盘',
  finance: '金融财经',
  legal: '法律合规',
  dev_tools: '开发工具',
  marketing: '营销增长',
  research: '研究资料',
  creative_core: '创作设计',
  health: '健康医疗',
  travel: '旅行出行',
  scene_reality: '场景现实',
  publishing: '内容出版'
}

const GENERIC_ICON_PATH = 'connector-icons/karna-connector.svg'

const BUILTIN_CONNECTORS = [
  {
    id: 'tongdaxin',
    name: 'tongdaxin',
    name_zh: '通达信',
    description_zh: '通过通达信 MCP 查询全球股票行情数据、条件选股、研究报告、公告资讯和宏观信息。支持个股基本面分析、同行业对比和智能选股筛查。',
    category: 'finance',
    category_zh: '金融财经',
    provider: '通达信',
    auth_mode: 'oauth',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/tongdaxin.png',
    icon_generic: false,
    docs_url: 'https://www.tdx.com.cn/',
    login_url: 'https://www.tdx.com.cn/',
    priority: 'A',
    risk_level: 'low',
    tools: [
      { name: 'stock_quote', name_zh: '查询股票实时行情', description: '查询股票实时行情', description_zh: '查询股票实时行情数据', risk_level: 'low' },
      { name: 'stock_screen', name_zh: '条件选股', description: '条件选股', description_zh: '根据条件筛选股票', risk_level: 'low' },
      { name: 'research_report', name_zh: '研究报告查询', description: '研究报告查询', description_zh: '查询券商研究报告', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'tencent_zixuan',
    name: 'tencent_zixuan',
    name_zh: '腾讯自选股',
    description_zh: '直连腾讯自选股，实时掌握毫秒级行情与资金动态，用自然语言分析自选数据、设置股价提醒、管理模拟交易，轻松搞定盯盘与投资决策。',
    category: 'finance',
    category_zh: '金融财经',
    provider: '腾讯',
    auth_mode: 'oauth',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/tencent_zixuan.png',
    icon_generic: false,
    docs_url: 'https://stockapp.finance.qq.com/',
    login_url: 'https://stockapp.finance.qq.com/',
    priority: 'A',
    risk_level: 'low',
    tools: [
      { name: 'portfolio_query', name_zh: '查询自选股', description: '查询自选股', description_zh: '查询自选股列表和行情', risk_level: 'low' },
      { name: 'price_alert', name_zh: '设置股价提醒', description: '设置股价提醒', description_zh: '设置股票价格变动提醒', risk_level: 'low' },
      { name: 'simulate_trade', name_zh: '模拟交易', description: '模拟交易', description_zh: '进行模拟股票交易', risk_level: 'medium' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'hengshengyuan',
    name: 'hengshengyuan',
    name_zh: '恒生聚源',
    description_zh: '连接恒生聚源 MCP，查询金融结构化数据、研究报告、公司公告、新闻资讯、条件选股、宏观行业。支持基金经理观点持仓一致性分析、行业速报生成、金融资讯热点解读。',
    category: 'finance',
    category_zh: '金融财经',
    provider: '恒生聚源',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/hengshengyuan.png',
    icon_generic: false,
    docs_url: 'https://www.gildata.com/',
    login_url: '',
    priority: 'B',
    risk_level: 'low',
    tools: [
      { name: 'financial_data', name_zh: '金融结构化数据查询', description: '金融结构化数据查询', description_zh: '查询金融结构化数据', risk_level: 'low' },
      { name: 'research_search', name_zh: '研究报告搜索', description: '研究报告搜索', description_zh: '搜索研究报告', risk_level: 'low' },
      { name: 'announcement_query', name_zh: '公司公告查询', description: '公司公告查询', description_zh: '查询上市公司公告', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'qq_mail',
    name: 'qq_mail',
    name_zh: 'QQ邮箱',
    description_zh: '收发、搜索和整理 QQ 邮件。用自然语言读取邮件内容、汇总邮件线程、管理文件夹。',
    category: 'collaboration',
    category_zh: '协作办公',
    provider: '腾讯',
    auth_mode: 'oauth',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/qq_mail.png',
    icon_generic: false,
    docs_url: 'https://service.mail.qq.com/',
    login_url: 'https://wx.mail.qq.com/',
    priority: 'S',
    risk_level: 'medium',
    tools: [
      { name: 'list_emails', name_zh: '列出邮件', description: '列出邮件', description_zh: '列出邮箱中的邮件', risk_level: 'low' },
      { name: 'send_email', name_zh: '发送邮件', description: '发送邮件', description_zh: '撰写并发送邮件', risk_level: 'medium' },
      { name: 'search_email', name_zh: '搜索邮件', description: '搜索邮件', description_zh: '搜索邮件内容', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'netease_mail',
    name: 'netease_mail',
    name_zh: '网易邮箱',
    description_zh: '通过 IMAP/SMTP 连接邮箱，支持收发邮件、搜索、附件下载。支持 163、126、yeah.net 等网易邮箱及其他标准 IMAP/SMTP 邮箱。',
    category: 'collaboration',
    category_zh: '协作办公',
    provider: '网易',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/netease_mail.png',
    icon_generic: false,
    docs_url: 'https://mail.163.com/',
    login_url: '',
    priority: 'A',
    risk_level: 'medium',
    tools: [
      { name: 'list_emails', name_zh: '列出邮件', description: '列出邮件', description_zh: '列出邮箱中的邮件', risk_level: 'low' },
      { name: 'send_email', name_zh: '发送邮件', description: '发送邮件', description_zh: '撰写并发送邮件', risk_level: 'medium' },
      { name: 'download_attachment', name_zh: '下载附件', description: '下载附件', description_zh: '下载邮件附件', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'ima_kb',
    name: 'ima_kb',
    name_zh: 'ima知识库',
    description_zh: '引用知识库资料及文件，浏览知识库详情。',
    category: 'docs_storage',
    category_zh: '文档与网盘',
    provider: 'ima',
    auth_mode: 'oauth',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/ima_kb.svg',
    icon_generic: false,
    docs_url: 'https://ima.qq.com/',
    login_url: 'https://ima.qq.com/',
    priority: 'B',
    risk_level: 'low',
    tools: [
      { name: 'search_knowledge', name_zh: '搜索知识库', description: '搜索知识库', description_zh: '在知识库中搜索内容', risk_level: 'low' },
      { name: 'list_files', name_zh: '列出文件', description: '列出文件', description_zh: '列出知识库中的文件', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'lexiang_kb',
    name: 'lexiang_kb',
    name_zh: '乐享知识库',
    description_zh: '搜索、创建和管理乐享知识库中的文档。支持导入 Markdown、按标签整理内容、追踪团队文档的更新动态。',
    category: 'docs_storage',
    category_zh: '文档与网盘',
    provider: '腾讯乐享',
    auth_mode: 'oauth',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/lexiang_kb.png',
    icon_generic: false,
    docs_url: 'https://lexiangla.com/',
    login_url: 'https://lexiangla.com/',
    priority: 'B',
    risk_level: 'low',
    tools: [
      { name: 'search_doc', name_zh: '搜索文档', description: '搜索文档', description_zh: '搜索知识库中的文档', risk_level: 'low' },
      { name: 'create_doc', name_zh: '创建文档', description: '创建文档', description_zh: '创建新的知识库文档', risk_level: 'medium' },
      { name: 'list_updates', name_zh: '追踪更新', description: '追踪更新', description_zh: '追踪文档更新动态', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'tencent_docs',
    name: 'tencent_docs',
    name_zh: '腾讯文档',
    description_zh: '创建、编辑和协作腾讯文档。用自然语言管理在线表格、文档和幻灯片，轻松完成内容查询、数据整理和团队协同。',
    category: 'collaboration',
    category_zh: '协作办公',
    provider: '腾讯',
    auth_mode: 'oauth',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/tencent_docs.png',
    icon_generic: false,
    docs_url: 'https://docs.qq.com/',
    login_url: 'https://docs.qq.com/',
    priority: 'S',
    risk_level: 'medium',
    tools: [
      { name: 'create_doc', name_zh: '创建文档', description: '创建文档', description_zh: '创建新的在线文档', risk_level: 'medium' },
      { name: 'edit_doc', name_zh: '编辑文档', description: '编辑文档', description_zh: '编辑已有文档内容', risk_level: 'medium' },
      { name: 'query_sheet', name_zh: '查询表格数据', description: '查询表格数据', description_zh: '查询在线表格中的数据', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'feishu',
    name: 'feishu',
    name_zh: '飞书',
    description_zh: '通过命令行管理飞书/Lark 全产品能力：即时通讯、邮箱、日历、云文档、电子表格、多维表格（Base）、幻灯片、画板、知识库、云空间、妙记、视频会议、任务、审批、考勤、通讯录。',
    category: 'collaboration',
    category_zh: '协作办公',
    provider: '飞书',
    auth_mode: 'oauth',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/feishu.png',
    icon_generic: false,
    docs_url: 'https://open.feishu.cn/',
    login_url: 'https://open.feishu.cn/',
    priority: 'S',
    risk_level: 'medium',
    tools: [
      { name: 'send_message', name_zh: '发送消息', description: '发送消息', description_zh: '发送即时消息', risk_level: 'medium' },
      { name: 'create_doc', name_zh: '创建文档', description: '创建文档', description_zh: '创建云文档', risk_level: 'medium' },
      { name: 'calendar_event', name_zh: '日程管理', description: '日程管理', description_zh: '管理日历日程', risk_level: 'medium' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'dingtalk',
    name: 'dingtalk',
    name_zh: '钉钉',
    description_zh: '通过命令行管理钉钉全产品能力：AI 表格、考勤、日历、群聊与机器人、通讯录、开放平台文档、DING 消息、钉钉文档、钉钉云盘、AI 听记、邮箱、OA 审批、日志、待办。',
    category: 'collaboration',
    category_zh: '协作办公',
    provider: '钉钉',
    auth_mode: 'oauth',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/dingtalk.png',
    icon_generic: false,
    docs_url: 'https://open.dingtalk.com/',
    login_url: 'https://open.dingtalk.com/',
    priority: 'A',
    risk_level: 'medium',
    tools: [
      { name: 'send_message', name_zh: '发送消息', description: '发送消息', description_zh: '发送群聊或私聊消息', risk_level: 'medium' },
      { name: 'create_doc', name_zh: '创建文档', description: '创建文档', description_zh: '创建钉钉文档', risk_level: 'medium' },
      { name: 'attendance_query', name_zh: '考勤查询', description: '考勤查询', description_zh: '查询考勤记录', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'wps_docs',
    name: 'wps_docs',
    name_zh: '金山文档',
    description_zh: '创建、搜索和管理金山文档（WPS 云文档）。支持新建多种文档类型（Word/Excel/PDF/PPT/智能表格/多维表格/智能文档）、读取与搜索文档内容、编辑更新、分享、移动重命名整理、标签管理。',
    category: 'docs_storage',
    category_zh: '文档与网盘',
    provider: '金山',
    auth_mode: 'oauth',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/wps_docs.png',
    icon_generic: false,
    docs_url: 'https://kdocs.cn/',
    login_url: 'https://kdocs.cn/',
    priority: 'A',
    risk_level: 'medium',
    tools: [
      { name: 'create_doc', name_zh: '创建文档', description: '创建文档', description_zh: '创建新的云文档', risk_level: 'medium' },
      { name: 'search_doc', name_zh: '搜索文档', description: '搜索文档', description_zh: '搜索云文档内容', risk_level: 'low' },
      { name: 'edit_doc', name_zh: '编辑文档', description: '编辑文档', description_zh: '编辑文档内容', risk_level: 'medium' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'notion',
    name: 'notion',
    name_zh: 'Notion',
    description_zh: '创建、搜索和管理 Notion 工作区。用自然语言读取页面、查询数据库、更新内容、整理知识库。',
    category: 'docs_storage',
    category_zh: '文档与网盘',
    provider: 'Notion',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/notion.png',
    icon_generic: false,
    docs_url: 'https://developers.notion.com/',
    login_url: '',
    priority: 'A',
    risk_level: 'medium',
    tools: [
      { name: 'search_pages', name_zh: '搜索页面', description: '搜索页面', description_zh: '搜索工作区中的页面', risk_level: 'low' },
      { name: 'query_database', name_zh: '查询数据库', description: '查询数据库', description_zh: '查询数据库内容', risk_level: 'low' },
      { name: 'update_page', name_zh: '更新页面', description: '更新页面', description_zh: '更新页面内容', risk_level: 'medium' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'zhishixingqiu',
    name: 'zhishixingqiu',
    name_zh: '知识星球',
    description_zh: '用自然语言管理知识星球：浏览星球内容、发帖评论、搜索主题、回答问题、管理笔记、查看用户信息。',
    category: 'docs_storage',
    category_zh: '文档与网盘',
    provider: '知识星球',
    auth_mode: 'oauth',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/zhishixingqiu.png',
    icon_generic: false,
    docs_url: 'https://www.zsxq.com/',
    login_url: 'https://www.zsxq.com/',
    priority: 'B',
    risk_level: 'low',
    tools: [
      { name: 'list_posts', name_zh: '浏览帖子', description: '浏览帖子', description_zh: '浏览星球帖子内容', risk_level: 'low' },
      { name: 'search_topic', name_zh: '搜索主题', description: '搜索主题', description_zh: '搜索星球主题', risk_level: 'low' },
      { name: 'create_post', name_zh: '发布内容', description: '发布内容', description_zh: '发布新帖子', risk_level: 'medium' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'tencent_meeting',
    name: 'tencent_meeting',
    name_zh: '腾讯会议',
    description_zh: '通过命令行创建、查询和管理腾讯会议。支持快速发起会议、查看日程安排、管理参会人员。',
    category: 'collaboration',
    category_zh: '协作办公',
    provider: '腾讯',
    auth_mode: 'oauth',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/tencent_meeting.png',
    icon_generic: false,
    docs_url: 'https://cloud.tencent.com/product/tcmeeting',
    login_url: 'https://meeting.tencent.com/',
    priority: 'A',
    risk_level: 'medium',
    tools: [
      { name: 'create_meeting', name_zh: '创建会议', description: '创建会议', description_zh: '创建新的视频会议', risk_level: 'medium' },
      { name: 'query_meeting', name_zh: '查询会议', description: '查询会议', description_zh: '查询会议信息', risk_level: 'low' },
      { name: 'manage_participants', name_zh: '管理参会人', description: '管理参会人', description_zh: '管理会议参会人员', risk_level: 'medium' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'wecom',
    name: 'wecom',
    name_zh: '企业微信',
    description_zh: '企业微信 10 人及以下企业支持消息、文档、日程、会议、待办等MCP能力；10 人以上企业仅支持创建、读取文档和智能表格。',
    category: 'collaboration',
    category_zh: '协作办公',
    provider: '企业微信',
    auth_mode: 'oauth',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/wecom.png',
    icon_generic: false,
    docs_url: 'https://developer.work.weixin.qq.com/',
    login_url: 'https://work.weixin.qq.com/',
    priority: 'A',
    risk_level: 'medium',
    tools: [
      { name: 'send_message', name_zh: '发送消息', description: '发送消息', description_zh: '发送企业微信消息', risk_level: 'medium' },
      { name: 'create_doc', name_zh: '创建文档', description: '创建文档', description_zh: '创建企业微信文档', risk_level: 'medium' },
      { name: 'calendar', name_zh: '日程管理', description: '日程管理', description_zh: '管理日程安排', risk_level: 'medium' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'tencent_wenjuan',
    name: 'tencent_wenjuan',
    name_zh: '腾讯问卷',
    description_zh: '创建、管理和分析腾讯问卷。用自然语言快速生成问卷、查看回收数据、设置题目逻辑。',
    category: 'research',
    category_zh: '研究资料',
    provider: '腾讯',
    auth_mode: 'oauth',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/tencent_wenjuan.png',
    icon_generic: false,
    docs_url: 'https://wj.qq.com/',
    login_url: 'https://wj.qq.com/',
    priority: 'B',
    risk_level: 'low',
    tools: [
      { name: 'create_survey', name_zh: '创建问卷', description: '创建问卷', description_zh: '创建新的调查问卷', risk_level: 'medium' },
      { name: 'analyze_responses', name_zh: '分析回收数据', description: '分析回收数据', description_zh: '分析问卷回收数据', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'tapd',
    name: 'tapd',
    name_zh: 'TAPD',
    description_zh: '管理需求、缺陷、任务和迭代。查询项目进度、拆分需求、流转状态、填写工时，覆盖需求到发布的研发全生命周期。',
    category: 'dev_tools',
    category_zh: '开发工具',
    provider: '腾讯',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/tapd.png',
    icon_generic: false,
    docs_url: 'https://www.tapd.cn/',
    login_url: '',
    priority: 'A',
    risk_level: 'medium',
    tools: [
      { name: 'create_story', name_zh: '创建需求', description: '创建需求', description_zh: '创建新的需求条目', risk_level: 'medium' },
      { name: 'query_bug', name_zh: '查询缺陷', description: '查询缺陷', description_zh: '查询缺陷列表', risk_level: 'low' },
      { name: 'update_status', name_zh: '更新状态', description: '更新状态', description_zh: '更新工作项状态', risk_level: 'medium' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'cnb',
    name: 'cnb',
    name_zh: 'CNB',
    description_zh: '通过自然语言管理 CNB 平台：仓库、Issue、PR、流水线、制品库等操作。',
    category: 'dev_tools',
    category_zh: '开发工具',
    provider: 'CNB',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/cnb.png',
    icon_generic: false,
    docs_url: '',
    login_url: '',
    priority: 'B',
    risk_level: 'medium',
    tools: [
      { name: 'list_repos', name_zh: '列出仓库', description: '列出仓库', description_zh: '列出代码仓库', risk_level: 'low' },
      { name: 'create_issue', name_zh: '创建Issue', description: '创建Issue', description_zh: '创建新的Issue', risk_level: 'medium' },
      { name: 'run_pipeline', name_zh: '运行流水线', description: '运行流水线', description_zh: '执行CI/CD流水线', risk_level: 'medium' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'github',
    name: 'github',
    name_zh: 'GitHub',
    description_zh: '在 GitHub 上克隆、推送代码，查看和管理仓库与 Pull Request，用自然语言完成代码协作。',
    category: 'dev_tools',
    category_zh: '开发工具',
    provider: 'GitHub',
    auth_mode: 'oauth',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/github.png',
    icon_generic: false,
    docs_url: 'https://docs.github.com/en/rest',
    login_url: 'https://github.com/login/oauth/authorize',
    priority: 'S',
    risk_level: 'medium',
    tools: [
      { name: 'list_repos', name_zh: '列出仓库', description: '列出仓库', description_zh: '列出GitHub仓库', risk_level: 'low' },
      { name: 'create_pr', name_zh: '创建PR', description: '创建PR', description_zh: '创建Pull Request', risk_level: 'medium' },
      { name: 'search_code', name_zh: '搜索代码', description: '搜索代码', description_zh: '搜索代码内容', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'tencent_cloudbase',
    name: 'tencent_cloudbase',
    name_zh: '腾讯云 CloudBase',
    description_zh: '腾讯云开发 CloudBase 全栈开发、部署、调试与排障连接器。覆盖 Web 应用、微信小程序、uni-app、原生 App HTTP API、云函数、CloudRun、NoSQL/MySQL 数据库、云存储、静态托管等能力。',
    category: 'dev_tools',
    category_zh: '开发工具',
    provider: '腾讯云',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/tencent_cloudbase.png',
    icon_generic: false,
    docs_url: 'https://cloud.tencent.com/product/tcb',
    login_url: '',
    priority: 'B',
    risk_level: 'medium',
    tools: [
      { name: 'deploy_app', name_zh: '部署应用', description: '部署应用', description_zh: '部署应用到云端', risk_level: 'high' },
      { name: 'query_db', name_zh: '查询数据库', description: '查询数据库', description_zh: '查询云数据库', risk_level: 'low' },
      { name: 'manage_storage', name_zh: '管理云存储', description: '管理云存储', description_zh: '管理云存储资源', risk_level: 'medium' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'edgeone_makers',
    name: 'edgeone_makers',
    name_zh: 'EdgeOne Makers',
    description_zh: '将项目部署到 EdgeOne Makers 并返回线上访问地址，支持全栈、云函数、AI Agent 等开发场景。',
    category: 'dev_tools',
    category_zh: '开发工具',
    provider: '腾讯云',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/edgeone_makers.png',
    icon_generic: false,
    docs_url: 'https://edgeone.ai/',
    login_url: '',
    priority: 'B',
    risk_level: 'medium',
    tools: [
      { name: 'deploy_project', name_zh: '部署项目', description: '部署项目', description_zh: '部署项目到边缘节点', risk_level: 'high' },
      { name: 'get_deploy_url', name_zh: '获取访问地址', description: '获取访问地址', description_zh: '获取部署后的访问地址', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'bugly',
    name: 'bugly',
    name_zh: 'Bugly 质量概览',
    description_zh: '查看产品的质量概览，包括崩溃率、ANR 率、OOM 率、启动耗时等。',
    category: 'dev_tools',
    category_zh: '开发工具',
    provider: '腾讯',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/bugly.png',
    icon_generic: false,
    docs_url: 'https://bugly.qq.com/',
    login_url: '',
    priority: 'B',
    risk_level: 'low',
    tools: [
      { name: 'crash_overview', name_zh: '崩溃概览', description: '崩溃概览', description_zh: '查看应用崩溃率概览', risk_level: 'low' },
      { name: 'anr_rate', name_zh: 'ANR率', description: 'ANR率', description_zh: '查看应用ANR发生率', risk_level: 'low' },
      { name: 'startup_time', name_zh: '启动耗时', description: '启动耗时', description_zh: '查看应用启动耗时', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'weiyun',
    name: 'weiyun',
    name_zh: '微云',
    description_zh: '查看、下载、删除微云文件，并且提供上传文件到微云、生成分享链接能力，帮你管理微云文件。',
    category: 'docs_storage',
    category_zh: '文档与网盘',
    provider: '腾讯',
    auth_mode: 'oauth',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/weiyun.png',
    icon_generic: false,
    docs_url: 'https://www.weiyun.com/',
    login_url: 'https://www.weiyun.com/',
    priority: 'B',
    risk_level: 'medium',
    tools: [
      { name: 'list_files', name_zh: '列出文件', description: '列出文件', description_zh: '列出微云文件', risk_level: 'low' },
      { name: 'upload_file', name_zh: '上传文件', description: '上传文件', description_zh: '上传文件到微云', risk_level: 'medium' },
      { name: 'share_file', name_zh: '生成分享链接', description: '生成分享链接', description_zh: '生成文件分享链接', risk_level: 'medium' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'beidafabao',
    name: 'beidafabao',
    name_zh: '北大法宝',
    description_zh: '语义（自然语言描述）+ 关键词（精确/模糊查询）双模式检索法规与案例，结果均带 pkulaw.com 原文链接，可追溯、可复核、可直接引用。',
    category: 'legal',
    category_zh: '法律合规',
    provider: '北大法宝',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/beidafabao.png',
    icon_generic: false,
    docs_url: 'https://www.pkulaw.com/',
    login_url: '',
    priority: 'B',
    risk_level: 'low',
    tools: [
      { name: 'search_law', name_zh: '法规检索', description: '法规检索', description_zh: '检索法律法规', risk_level: 'low' },
      { name: 'search_case', name_zh: '案例检索', description: '案例检索', description_zh: '检索法律案例', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'qichacha',
    name: 'qichacha',
    name_zh: '企查查',
    description_zh: '查询和核实企业工商登记信息。支持股东结构、实际控制人、受益所有人、高管团队、对外投资、财务数据、年报及上市信息查询，用自然语言快速完成企业身份核验与背景调查。',
    category: 'legal',
    category_zh: '法律合规',
    provider: '企查查',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/qichacha.png',
    icon_generic: false,
    docs_url: 'https://www.qcc.com/',
    login_url: '',
    priority: 'A',
    risk_level: 'low',
    tools: [
      { name: 'company_query', name_zh: '企业查询', description: '企业查询', description_zh: '查询企业基本信息', risk_level: 'low' },
      { name: 'shareholder_query', name_zh: '股东查询', description: '股东查询', description_zh: '查询股东结构信息', risk_level: 'low' },
      { name: 'financial_query', name_zh: '财务查询', description: '财务查询', description_zh: '查询企业财务数据', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'tianyancha',
    name: 'tianyancha',
    name_zh: '天眼查',
    description_zh: '通过天眼查 MCP 查询多维度企业数据。支持工商登记、股东结构、司法风险、知识产权、董监高、经营数据等 160+ 项企业数据能力，用自然语言完成企业尽调与商业情报分析。',
    category: 'legal',
    category_zh: '法律合规',
    provider: '天眼查',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/tianyancha.png',
    icon_generic: false,
    docs_url: 'https://www.tianyancha.com/',
    login_url: '',
    priority: 'A',
    risk_level: 'low',
    tools: [
      { name: 'company_query', name_zh: '企业查询', description: '企业查询', description_zh: '查询企业工商信息', risk_level: 'low' },
      { name: 'risk_query', name_zh: '风险查询', description: '风险查询', description_zh: '查询企业司法风险', risk_level: 'low' },
      { name: 'ip_query', name_zh: '知识产权查询', description: '知识产权查询', description_zh: '查询企业知识产权', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'huayuyuandian',
    name: 'huayuyuandian',
    name_zh: '华宇元典法律数据',
    description_zh: '华宇元典法律数据为智能体提供法律法规、案例文书、企业信息 MCP 工具能力。',
    category: 'legal',
    category_zh: '法律合规',
    provider: '华宇元典',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/huayuyuandian.png',
    icon_generic: false,
    docs_url: '',
    login_url: '',
    priority: 'C',
    risk_level: 'low',
    tools: [
      { name: 'law_search', name_zh: '法规搜索', description: '法规搜索', description_zh: '搜索法律法规', risk_level: 'low' },
      { name: 'case_search', name_zh: '案例搜索', description: '案例搜索', description_zh: '搜索法律案例', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'weikeyansuo',
    name: 'weikeyansuo',
    name_zh: '威科先行',
    description_zh: '威科先行依托全面、准确、及时更新的法规、案例等法律数据研发的MCP服务，支持语义检索、关键词检索等场景。',
    category: 'legal',
    category_zh: '法律合规',
    provider: '威科先行',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/weikeyansuo.png',
    icon_generic: false,
    docs_url: 'https://law.wkinfo.com.cn/',
    login_url: '',
    priority: 'C',
    risk_level: 'low',
    tools: [
      { name: 'law_search', name_zh: '法规检索', description: '法规检索', description_zh: '检索法律法规', risk_level: 'low' },
      { name: 'case_search', name_zh: '案例检索', description: '案例检索', description_zh: '检索法律案例', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'fayan',
    name: 'fayan',
    name_zh: '法研',
    description_zh: '法研 · 法律法规检索，支持自然语言获取精准、现行有效的法规条文，将高质量、海量的法规知识库，无缝接入各类AI应用与工作流中。',
    category: 'legal',
    category_zh: '法律合规',
    provider: '法研',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'coming_soon',
    icon_path: 'connector-icons/mcp/fayan.png',
    icon_generic: false,
    docs_url: '',
    login_url: '',
    priority: 'C',
    risk_level: 'low',
    tools: [
      { name: 'law_search', name_zh: '法规检索', description: '法规检索', description_zh: '检索法律法规', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'tencent_qidian',
    name: 'tencent_qidian',
    name_zh: '腾讯企点客服',
    description_zh: '腾讯企点客服连接器：用自然语言处理工单（查询/创建/更新/状态变更）、查询坐席在线与实时接待、检索/拉取客户资料、拉取人工/大模型/文本机器人的会话记录和消息、查看客服实时监控。',
    category: 'marketing',
    category_zh: '营销增长',
    provider: '腾讯',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/tencent_qidian.png',
    icon_generic: false,
    docs_url: 'https://qidian.qq.com/',
    login_url: '',
    priority: 'B',
    risk_level: 'medium',
    tools: [
      { name: 'ticket_query', name_zh: '工单查询', description: '工单查询', description_zh: '查询客服工单', risk_level: 'low' },
      { name: 'ticket_create', name_zh: '创建工单', description: '创建工单', description_zh: '创建新工单', risk_level: 'medium' },
      { name: 'customer_query', name_zh: '客户查询', description: '客户查询', description_zh: '查询客户资料', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'xiaoshouyi',
    name: 'xiaoshouyi',
    name_zh: '销售易CRM',
    description_zh: '用自然语言查客户、推商机、盘线索、领公海、写跟进，一句话打通销售工作闭环。',
    category: 'marketing',
    category_zh: '营销增长',
    provider: '销售易',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/xiaoshouyi.png',
    icon_generic: false,
    docs_url: 'https://www.xiaoshouyi.com/',
    login_url: '',
    priority: 'B',
    risk_level: 'medium',
    tools: [
      { name: 'customer_query', name_zh: '客户查询', description: '客户查询', description_zh: '查询客户信息', risk_level: 'low' },
      { name: 'opportunity_query', name_zh: '商机查询', description: '商机查询', description_zh: '查询销售商机', risk_level: 'low' },
      { name: 'create_followup', name_zh: '创建跟进', description: '创建跟进', description_zh: '创建销售跟进记录', risk_level: 'medium' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'xiaoe_tong',
    name: 'xiaoe_tong',
    name_zh: '小鹅通',
    description_zh: '用自然语言管理小鹅通店铺：查询课程与学员，创建和编辑课程，查看订单，并查找或上传图片、音频、电子书和文档素材。',
    category: 'marketing',
    category_zh: '营销增长',
    provider: '小鹅通',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/xiaoe_tong.png',
    icon_generic: false,
    docs_url: 'https://www.xiaoe-tech.com/',
    login_url: '',
    priority: 'B',
    risk_level: 'medium',
    tools: [
      { name: 'course_query', name_zh: '课程查询', description: '课程查询', description_zh: '查询课程信息', risk_level: 'low' },
      { name: 'order_query', name_zh: '订单查询', description: '订单查询', description_zh: '查询订单信息', risk_level: 'low' },
      { name: 'create_course', name_zh: '创建课程', description: '创建课程', description_zh: '创建新课程', risk_level: 'medium' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'weisheng_qiweiguanjia',
    name: 'weisheng_qiweiguanjia',
    name_zh: '微盛企微管家SCRM',
    description_zh: '查询或管理企业微信中的客户信息、客户标签、客户群、营销素材、活码、群发、跟进记录、联系人、商机、汇报、抽奖、客户日程、聊天记录等业务能力。',
    category: 'marketing',
    category_zh: '营销增长',
    provider: '微盛',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/weisheng_qiweiguanjia.png',
    icon_generic: false,
    docs_url: '',
    login_url: '',
    priority: 'C',
    risk_level: 'medium',
    tools: [
      { name: 'customer_query', name_zh: '客户查询', description: '客户查询', description_zh: '查询客户信息', risk_level: 'low' },
      { name: 'tag_manage', name_zh: '标签管理', description: '标签管理', description_zh: '管理客户标签', risk_level: 'medium' },
      { name: 'group_send', name_zh: '群发消息', description: '群发消息', description_zh: '发送群消息', risk_level: 'high' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'tencent_marketing',
    name: 'tencent_marketing',
    name_zh: '腾讯营销投放',
    description_zh: '腾讯营销投放 Skill，为大模型赋予广告投放管理能力：支持广告账户授权、广告/智投项目的创建与更新、广告数据查询与分析、推广内容资产管理，以及操作日志查询等完整的广告投放管理能力。',
    category: 'marketing',
    category_zh: '营销增长',
    provider: '腾讯广告',
    auth_mode: 'oauth',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/tencent_marketing.png',
    icon_generic: false,
    docs_url: 'https://developers.e.qq.com/',
    login_url: 'https://e.qq.com/',
    priority: 'B',
    risk_level: 'high',
    tools: [
      { name: 'ad_create', name_zh: '创建广告', description: '创建广告', description_zh: '创建广告投放', risk_level: 'high' },
      { name: 'ad_query', name_zh: '查询广告数据', description: '查询广告数据', description_zh: '查询广告投放数据', risk_level: 'low' },
      { name: 'asset_manage', name_zh: '素材管理', description: '素材管理', description_zh: '管理广告素材', risk_level: 'medium' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'canva',
    name: 'canva',
    name_zh: 'Canva可画',
    description_zh: '让AI助手无缝调用Canva可画的设计能力，包括创建设计、编辑设计、管理素材和品牌资源、搜索资源库、导出设计以及添加评论等。',
    category: 'creative_core',
    category_zh: '创作设计',
    provider: 'Canva',
    auth_mode: 'oauth',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/canva.png',
    icon_generic: false,
    docs_url: 'https://www.canva.cn/developers/',
    login_url: 'https://www.canva.cn/',
    priority: 'A',
    risk_level: 'medium',
    tools: [
      { name: 'create_design', name_zh: '创建设计', description: '创建设计', description_zh: '创建新设计', risk_level: 'medium' },
      { name: 'edit_design', name_zh: '编辑设计', description: '编辑设计', description_zh: '编辑已有设计', risk_level: 'medium' },
      { name: 'search_asset', name_zh: '搜索素材', description: '搜索素材', description_zh: '搜索设计素材', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'mastergo',
    name: 'mastergo',
    name_zh: 'MasterGo 莫高设计',
    description_zh: '连接 MasterGo 画布，让 AI 进行设计、修改、同步和获取 D2C 代码。',
    category: 'creative_core',
    category_zh: '创作设计',
    provider: 'MasterGo',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/mastergo.png',
    icon_generic: false,
    docs_url: 'https://mastergo.com/',
    login_url: '',
    priority: 'B',
    risk_level: 'medium',
    tools: [
      { name: 'create_design', name_zh: '创建设计', description: '创建设计', description_zh: '创建设计稿', risk_level: 'medium' },
      { name: 'get_d2c_code', name_zh: '获取D2C代码', description: '获取D2C代码', description_zh: '获取设计转代码', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'tencent_map',
    name: 'tencent_map',
    name_zh: '腾讯地图',
    description_zh: '接入腾讯地图各类位置服务，包括地点搜索、路线规划（驾车/公交/步行/骑行）、地址正逆解析、沿途搜索和天气查询等。',
    category: 'scene_reality',
    category_zh: '场景现实',
    provider: '腾讯',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/tencent_map.png',
    icon_generic: false,
    docs_url: 'https://lbs.qq.com/',
    login_url: '',
    priority: 'A',
    risk_level: 'low',
    tools: [
      { name: 'place_search', name_zh: '地点搜索', description: '地点搜索', description_zh: '搜索POI地点', risk_level: 'low' },
      { name: 'route_plan', name_zh: '路线规划', description: '路线规划', description_zh: '规划出行路线', risk_level: 'low' },
      { name: 'geocoding', name_zh: '地址解析', description: '地址解析', description_zh: '地址与坐标互转', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'quyu_dongcha',
    name: 'quyu_dongcha',
    name_zh: '区域洞察',
    description_zh: '区域洞察提供 POI 定位、围栏内 POI 查询与聚合能力。',
    category: 'scene_reality',
    category_zh: '场景现实',
    provider: '腾讯',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/quyu_dongcha.png',
    icon_generic: false,
    docs_url: '',
    login_url: '',
    priority: 'C',
    risk_level: 'low',
    tools: [
      { name: 'poi_query', name_zh: 'POI查询', description: 'POI查询', description_zh: '查询POI信息', risk_level: 'low' },
      { name: 'fence_query', name_zh: '围栏查询', description: '围栏查询', description_zh: '查询围栏内POI', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'ctrip_wendao',
    name: 'ctrip_wendao',
    name_zh: '携程问道',
    description_zh: '通过携程问道 API 获取旅行规划与攻略。支持酒店查询、机票搜索、景点推荐、行程规划、美食住宿攻略。',
    category: 'travel',
    category_zh: '旅行出行',
    provider: '携程',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/ctrip_wendao.png',
    icon_generic: false,
    docs_url: 'https://www.ctrip.com/',
    login_url: '',
    priority: 'B',
    risk_level: 'low',
    tools: [
      { name: 'hotel_search', name_zh: '酒店查询', description: '酒店查询', description_zh: '搜索酒店信息', risk_level: 'low' },
      { name: 'flight_search', name_zh: '机票搜索', description: '机票搜索', description_zh: '搜索机票信息', risk_level: 'low' },
      { name: 'attraction_search', name_zh: '景点推荐', description: '景点推荐', description_zh: '推荐旅游景点', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'tongchengxin',
    name: 'tongchengxin',
    name_zh: '同程心',
    description_zh: '同程程心可通过自然语言查询机票、火车票、酒店、景点、度假产品等旅行资源，支持火空联程、智能交通推荐、特价机票搜索、景区门票预订，以及完整行程规划，显著提升出行效率。',
    category: 'travel',
    category_zh: '旅行出行',
    provider: '同程',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/tongchengxin.png',
    icon_generic: false,
    docs_url: '',
    login_url: '',
    priority: 'C',
    risk_level: 'low',
    tools: [
      { name: 'flight_search', name_zh: '机票查询', description: '机票查询', description_zh: '查询机票信息', risk_level: 'low' },
      { name: 'hotel_search', name_zh: '酒店查询', description: '酒店查询', description_zh: '查询酒店信息', risk_level: 'low' },
      { name: 'trip_plan', name_zh: '行程规划', description: '行程规划', description_zh: '规划旅行行程', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'agentkey',
    name: 'agentkey',
    name_zh: 'AgentKey',
    description_zh: 'AgentKey 是 AI 助手获取可信工具和实时数据的能力市场。支持网页搜索、URL抓取、新闻、社交媒体、股票市场价格、电商产品数据、企业/公司数据、天气、地图和地理位置、旅行（航班/酒店等）等上百种能力。',
    category: 'research',
    category_zh: '研究资料',
    provider: 'AgentKey',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'available',
    icon_path: 'connector-icons/mcp/agentkey.png',
    icon_generic: false,
    docs_url: 'https://agentkey.app/',
    login_url: '',
    priority: 'A',
    risk_level: 'medium',
    tools: [
      { name: 'web_search', name_zh: '网页搜索', description: '网页搜索', description_zh: '搜索互联网网页', risk_level: 'low' },
      { name: 'web_fetch', name_zh: 'URL抓取', description: 'URL抓取', description_zh: '抓取指定URL内容', risk_level: 'medium' },
      { name: 'stock_price', name_zh: '股票价格', description: '股票价格', description_zh: '查询股票价格', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'qixinhuiyan',
    name: 'qixinhuiyan',
    name_zh: '启信慧眼',
    description_zh: '通过启信慧眼 MCP 接入企业全景数据能力，支持用户用自然语言完成企业搜索、工商画像、风险识别、经营动态、知识产权等商业情报分析。',
    category: 'legal',
    category_zh: '法律合规',
    provider: '启信慧眼',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/qixinhuiyan.png',
    icon_generic: false,
    docs_url: '',
    login_url: '',
    priority: 'C',
    risk_level: 'low',
    tools: [
      { name: 'company_search', name_zh: '企业搜索', description: '企业搜索', description_zh: '搜索企业信息', risk_level: 'low' },
      { name: 'risk_analysis', name_zh: '风险识别', description: '风险识别', description_zh: '识别企业风险', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'zhuiya',
    name: 'zhuiya',
    name_zh: '智慧芽',
    description_zh: '在智慧芽全球专利数据库和文献库中进行融合检索，支持自然语言、语义搜索、关键词检索和多维过滤，并获取专利或文献信息。',
    category: 'research',
    category_zh: '研究资料',
    provider: '智慧芽',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/zhuiya.png',
    icon_generic: false,
    docs_url: 'https://www.zhihuiya.com/',
    login_url: '',
    priority: 'C',
    risk_level: 'low',
    tools: [
      { name: 'patent_search', name_zh: '专利检索', description: '专利检索', description_zh: '检索专利信息', risk_level: 'low' },
      { name: 'literature_search', name_zh: '文献检索', description: '文献检索', description_zh: '检索学术文献', risk_level: 'low' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'tencent_health',
    name: 'tencent_health',
    name_zh: '腾讯健康NGES',
    description_zh: '腾讯健康NGES MCP服务，支持智能问答和合规审核等功能。',
    category: 'health',
    category_zh: '健康医疗',
    provider: '腾讯',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/tencent_health.png',
    icon_generic: false,
    docs_url: '',
    login_url: '',
    priority: 'C',
    risk_level: 'medium',
    tools: [
      { name: 'health_qa', name_zh: '健康问答', description: '健康问答', description_zh: '健康问题智能问答', risk_level: 'low' },
      { name: 'compliance_check', name_zh: '合规审核', description: '合规审核', description_zh: '医疗内容合规审核', risk_level: 'medium' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'sunflower_remote',
    name: 'sunflower_remote',
    name_zh: '向日葵远程控制',
    description_zh: '通过命令行管理远端设备，实时监测在线状态、秒级发起远程控制、快速传输文件及远程截屏。零部署、免更新，轻松实现智能批量运维。',
    category: 'dev_tools',
    category_zh: '开发工具',
    provider: '向日葵',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/sunflower_remote.png',
    icon_generic: false,
    docs_url: 'https://sunlogin.oray.com/',
    login_url: '',
    priority: 'C',
    risk_level: 'high',
    tools: [
      { name: 'device_status', name_zh: '设备状态', description: '设备状态', description_zh: '查看设备在线状态', risk_level: 'low' },
      { name: 'remote_control', name_zh: '远程控制', description: '远程控制', description_zh: '发起远程控制', risk_level: 'high' },
      { name: 'file_transfer', name_zh: '文件传输', description: '文件传输', description_zh: '传输文件到远程设备', risk_level: 'high' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'qingliu',
    name: 'qingliu',
    name_zh: '轻流',
    description_zh: '轻流无代码平台连接器。通过自然语言创建应用、管理表单数据、处理审批流程、查询和导出数据，一站式连接轻流全部能力。',
    category: 'collaboration',
    category_zh: '协作办公',
    provider: '轻流',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/qingliu.png',
    icon_generic: false,
    docs_url: 'https://www.qingflow.com/',
    login_url: '',
    priority: 'C',
    risk_level: 'medium',
    tools: [
      { name: 'create_app', name_zh: '创建应用', description: '创建应用', description_zh: '创建无代码应用', risk_level: 'medium' },
      { name: 'form_manage', name_zh: '表单管理', description: '表单管理', description_zh: '管理表单数据', risk_level: 'medium' },
      { name: 'approval_manage', name_zh: '审批流程', description: '审批流程', description_zh: '处理审批流程', risk_level: 'medium' }
    ],
    sha256: '',
    schema_version: 1
  },
  {
    id: 'zhongxingxinyun',
    name: 'zhongxingxinyun',
    name_zh: '中兴新云AI智报',
    description_zh: '财务云 AI 报销助手：用自然语言完成报销申请、发票查询识别、报销单查询与费用审批等操作。',
    category: 'collaboration',
    category_zh: '协作办公',
    provider: '中兴新云',
    auth_mode: 'api_key',
    connection_type: 'mcp',
    status: 'beta',
    icon_path: 'connector-icons/mcp/zhongxingxinyun.png',
    icon_generic: false,
    docs_url: '',
    login_url: '',
    priority: 'C',
    risk_level: 'medium',
    tools: [
      { name: 'expense_create', name_zh: '创建报销单', description: '创建报销单', description_zh: '创建费用报销单', risk_level: 'medium' },
      { name: 'invoice_query', name_zh: '发票查询', description: '发票查询', description_zh: '查询发票信息', risk_level: 'low' },
      { name: 'expense_approval', name_zh: '费用审批', description: '费用审批', description_zh: '审批报销单', risk_level: 'medium' }
    ],
    sha256: '',
    schema_version: 1
  }
]

function createConnectorCatalog({ fs, path, dataRoot, storage }) {
  const catalogDir = path.join(dataRoot, 'connector-catalog')
  const catalogJsonPath = path.join(catalogDir, 'connector-catalog.json')
  let connectorsCache = null

  const ensureCatalogDir = () => {
    if (!fs.existsSync(catalogDir)) {
      fs.mkdirSync(catalogDir, { recursive: true })
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
    ensureCatalogDir()
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
    return data
  }

  const getBuiltinConnectors = () => {
    return JSON.parse(JSON.stringify(BUILTIN_CONNECTORS))
  }

  const getAllConnectors = () => {
    if (connectorsCache) {
      return connectorsCache
    }
    const builtin = getBuiltinConnectors()
    const saved = readJsonFile(catalogJsonPath, { version: 1, connectors: [] })
    const savedConnectors = Array.isArray(saved.connectors) ? saved.connectors : []

    const allConnectors = [...builtin]
    for (const savedConn of savedConnectors) {
      const existing = allConnectors.find(c => c.id === savedConn.id)
      if (existing) {
        Object.assign(existing, savedConn)
      } else {
        allConnectors.push(savedConn)
      }
    }

    connectorsCache = allConnectors
    return allConnectors
  }

  const saveConnector = (connector) => {
    const saved = readJsonFile(catalogJsonPath, { version: 1, connectors: [] })
    const savedConnectors = Array.isArray(saved.connectors) ? saved.connectors : []
    const index = savedConnectors.findIndex(c => c.id === connector.id)
    if (index >= 0) {
      savedConnectors[index] = { ...savedConnectors[index], ...connector }
    } else {
      savedConnectors.push(connector)
    }
    saved.connectors = savedConnectors
    writeJsonFile(catalogJsonPath, saved)
    connectorsCache = null
  }

  function listConnectors(options = {}) {
    const { category, status, connection_type } = options
    let connectors = getAllConnectors()

    if (category) {
      connectors = connectors.filter(c => c.category === category)
    }
    if (status) {
      connectors = connectors.filter(c => c.status === status)
    }
    if (connection_type) {
      connectors = connectors.filter(c => c.connection_type === connection_type)
    }

    return {
      ok: true,
      connectors,
      count: connectors.length,
      total: getAllConnectors().length
    }
  }

  function getConnector(id) {
    const connectorId = String(id || '').trim()
    if (!connectorId) {
      return { ok: false, error: 'Missing connector id.' }
    }

    const connectors = getAllConnectors()
    const connector = connectors.find(c => c.id === connectorId)

    if (!connector) {
      return { ok: false, error: `Connector not found: ${connectorId}` }
    }

    return { ok: true, connector }
  }

  function getCategories() {
    const categories = []
    const seen = new Set()

    for (const connector of BUILTIN_CONNECTORS) {
      if (!seen.has(connector.category)) {
        seen.add(connector.category)
        categories.push({
          id: connector.category,
          name: connector.category,
          name_zh: connector.category_zh || CATEGORY_ZH_MAP[connector.category] || connector.category,
          count: BUILTIN_CONNECTORS.filter(c => c.category === connector.category).length
        })
      }
    }

    categories.sort((a, b) => a.name_zh.localeCompare(b.name_zh, 'zh-CN'))

    return { ok: true, categories }
  }

  function getConnectorTools(connectorId) {
    const id = String(connectorId || '').trim()
    if (!id) {
      return { ok: false, error: 'Missing connector id.' }
    }

    const result = getConnector(id)
    if (!result.ok) {
      return result
    }

    const tools = result.connector.tools || []
    return {
      ok: true,
      connector_id: id,
      tools,
      count: tools.length
    }
  }

  function reloadCatalog() {
    connectorsCache = null
    const connectors = getAllConnectors()
    return {
      ok: true,
      reloaded: true,
      count: connectors.length
    }
  }

  function validateCatalog() {
    const connectors = getAllConnectors()
    const errors = []
    const warnings = []

    const requiredFields = [
      'id', 'name', 'name_zh', 'description_zh', 'category', 'category_zh',
      'provider', 'auth_mode', 'connection_type', 'status', 'icon_path',
      'priority', 'risk_level', 'tools', 'schema_version'
    ]

    for (const connector of connectors) {
      for (const field of requiredFields) {
        if (connector[field] === undefined || connector[field] === null || connector[field] === '') {
          if (field !== 'login_url' && field !== 'docs_url') {
            errors.push(`Connector ${connector.id}: missing required field '${field}'`)
          }
        }
      }

      if (!Array.isArray(connector.tools)) {
        errors.push(`Connector ${connector.id}: 'tools' should be an array`)
      } else {
        for (const tool of connector.tools) {
          if (!tool.name) {
            errors.push(`Connector ${connector.id}: tool missing 'name'`)
          }
          if (!tool.name_zh) {
            warnings.push(`Connector ${connector.id}: tool ${tool.name} missing 'name_zh'`)
          }
          if (!tool.description_zh) {
            warnings.push(`Connector ${connector.id}: tool ${tool.name} missing 'description_zh'`)
          }
        }
      }

      if (!CATEGORY_ZH_MAP[connector.category]) {
        warnings.push(`Connector ${connector.id}: unknown category '${connector.category}'`)
      }
    }

    const idSet = new Set()
    for (const connector of connectors) {
      if (idSet.has(connector.id)) {
        errors.push(`Duplicate connector id: ${connector.id}`)
      }
      idSet.add(connector.id)
    }

    return {
      ok: errors.length === 0,
      valid: errors.length === 0,
      total: connectors.length,
      errors,
      warnings,
      error_count: errors.length,
      warning_count: warnings.length
    }
  }

  function validateIcons() {
    const connectors = getAllConnectors()
    const resourcesDir = path.join(dataRoot, 'resources')
    const results = []
    let missingCount = 0
    let genericCount = 0

    for (const connector of connectors) {
      const iconPath = connector.icon_path
      let exists = false
      let fullPath = ''

      if (iconPath) {
        fullPath = path.join(resourcesDir, iconPath)
        try {
          exists = fs.existsSync(fullPath)
        } catch (err) {
          exists = false
        }
      }

      const isGeneric = !exists || connector.icon_generic
      if (isGeneric) {
        missingCount++
        if (connector.icon_path !== GENERIC_ICON_PATH) {
          genericCount++
        }
      }

      results.push({
        connector_id: connector.id,
        icon_path: iconPath,
        icon_exists: exists,
        icon_generic: isGeneric,
        effective_icon: isGeneric ? GENERIC_ICON_PATH : iconPath
      })

      if (isGeneric !== connector.icon_generic ||
          (isGeneric && connector.icon_path !== GENERIC_ICON_PATH)) {
        const updated = {
          ...connector,
          icon_generic: isGeneric,
          icon_path: isGeneric ? GENERIC_ICON_PATH : iconPath
        }
        saveConnector(updated)
      }
    }

    return {
      ok: true,
      total: connectors.length,
      missing_count: missingCount,
      generic_count: genericCount,
      valid_count: connectors.length - missingCount,
      results
    }
  }

  return {
    listConnectors,
    getConnector,
    getCategories,
    getConnectorTools,
    reloadCatalog,
    validateCatalog,
    validateIcons
  }
}

module.exports = {
  createConnectorCatalog,
  BUILTIN_CONNECTORS,
  CATEGORY_ZH_MAP,
  GENERIC_ICON_PATH
}
