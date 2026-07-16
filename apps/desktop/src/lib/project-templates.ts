export type ProjectCategory = 'general' | 'creative'

export type CreativeProjectType =
  | 'web-novel'
  | 'novel'
  | 'screenplay'
  | 'short-story'
  | 'poetry'
  | 'comic'
  | 'game-script'

export type GeneralProjectType = 'general' | 'research' | 'coding' | 'notes'

export interface ProjectTemplate {
  category: ProjectCategory
  type: string
  label: string
  icon: string
  color: string
  description: string
  files: ProjectTemplateFile[]
}

export interface ProjectTemplateFile {
  path: string
  content: string
  required?: boolean
}

const outlineTemplate = (projectName: string) => `# ${projectName} - 大纲

## 作品核心

- **作品名称**：${projectName}
- **作品类型**：
- **目标读者**：
- **预计字数**：
- **核心卖点**：

## 故事梗概

一句话概括：

>

## 故事结构

### 第一幕（开端）

- 钩子：
- 激励事件：
- 第一转折点：

### 第二幕（发展）

- 上升动作：
- 中点：
- 危机：
- 第二转折点：

### 第三幕（结局）

- 高潮：
- 结局：

## 主题与立意

- 核心主题：
- 情感基调：
- 想探讨的问题：
`

const charactersTemplate = `# 人物关系图

## 主要人物

### 主角

| 姓名 | 年龄 | 身份 | 核心动机 | 人物弧光 |
|------|------|------|----------|----------|
|      |      |      |          |          |

### 重要配角

| 姓名 | 与主角关系 | 立场 | 备注 |
|------|------------|------|------|
|      |            |      |      |

## 人物关系

\`\`\`mermaid
graph TD
    主角[主角]
    配角1[配角1]
    配角2[配角2]

    主角 -->|关系描述| 配角1
    主角 -->|关系描述| 配角2
\`\`\`

## 人物卡片模板

### 【人物姓名】

- **年龄**：
- **职业/身份**：
- **外貌特征**：
- **性格特点**：
- **背景故事**：
- **核心动机**：
- **人物成长**：
- **标志性台词**：
- **备注**：
`

const timelineTemplate = `# 时间轴

## 故事时间线

| 时间点 | 事件 | 涉及人物 | 备注 |
|--------|------|----------|------|
|        |      |          |      |

## 世界观历史（背景）

- [年代]：
- [年代]：
- [年代]：
`

const worldbuildingTemplate = `# 世界观设定

## 世界基本规则

- 时代背景：
- 地理环境：
- 社会制度：
- 力量体系（如有）：
- 特殊规则：

## 重要地点

| 地点名称 | 类型 | 描述 | 备注 |
|----------|------|------|------|
|          |      |      |      |

## 势力/组织

| 组织名称 | 性质 | 核心目标 | 与主角关系 |
|----------|------|----------|------------|
|          |      |          |            |
`

const ideasTemplate = (projectName: string) => `# ${projectName} - 想法收集

## 灵感记录

-

## 待确认问题

-

## 参考资料

-
`

const researchTemplate = (projectName: string) => `# ${projectName} - 研究笔记

## 研究主题

## 资料收集

| 资料名称 | 来源 | 核心观点 | 备注 |
|----------|------|----------|------|
|          |      |          |      |

## 笔记摘要

-
`

const notesTemplate = (projectName: string) => `# ${projectName} - 笔记

## 待办

- [ ]

## 笔记

-
`

const codingReadmeTemplate = (projectName: string) => `# ${projectName}

## 项目描述

## 技术栈

## 快速开始

## 项目结构
`

const screenplayOutlineTemplate = (projectName: string) => `# ${projectName} - 剧本大纲

## 基本信息

- **片名**：${projectName}
- **类型**：
- **时长**：
- **主题**：

## 人物小传

### 主角

- 姓名：
- 年龄：
- 职业：
- 人物前史：
- 核心需求：

## 三幕结构

### 第一幕（建置）

**开场画面**：

**主题呈现**：

**铺垫**：

**推动（催化剂）**：

**争执（Debate）**：

**第二幕衔接点**：

### 第二幕（对抗）

**B故事**：

**游戏时间**：

**中点**：

**坏蛋逼近**：

**一无所有**：

**灵魂黑夜**：

**第三幕衔接点**：

### 第三幕（结局）

**结局**：

**终场画面**：
`

const comicTemplate = (projectName: string) => `# ${projectName} - 漫画分镜

## 作品信息

- **标题**：${projectName}
- **题材**：
- **画风**：

## 章节规划

### 第1话

| 页码 | 分镜描述 | 台词/旁白 | 备注 |
|------|----------|-----------|------|
| 1    |          |           |      |
`

const poetryTemplate = (projectName: string) => `# ${projectName} - 诗集

## 集名：${projectName}

## 目录

-

## 作品

### 诗名一

>

### 诗名二

>
`

const gameScriptTemplate = (projectName: string) => `# ${projectName} - 游戏脚本

## 游戏信息

- **游戏名称**：${projectName}
- **游戏类型**：
- **目标平台**：

## 核心玩法

-

## 世界观

-

## 角色设定

| 角色 | 身份 | 性格 | 关键剧情 |
|------|------|------|----------|
|      |      |      |          |

## 主线剧情

### 序章

### 第一章

### 第二章
`

const generalProjectReadme = (projectName: string) => `# ${projectName}

## 项目说明

## 目录结构

-
`

export function getKarnaProjectsRoot(): string {
  const home = process.env.USERPROFILE || process.env.HOME || ''

  return `${home}\\Documents\\Karna\\Projects`
}

export function getDocumentsRoot(): string {
  return process.env.USERPROFILE || process.env.HOME || ''
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    category: 'general',
    type: 'general',
    label: '通用项目',
    icon: 'folder',
    color: 'slate',
    description: '适用于任何类型的通用项目工作空间',
    files: [
      { path: 'README.md', content: generalProjectReadme('{{projectName}}'), required: true },
      { path: 'notes/notes.md', content: notesTemplate('{{projectName}}') }
    ]
  },
  {
    category: 'general',
    type: 'research',
    label: '研究项目',
    icon: 'library',
    color: 'sky',
    description: '用于资料收集、研究分析、学术写作',
    files: [
      { path: 'README.md', content: generalProjectReadme('{{projectName}}'), required: true },
      { path: 'research/research-notes.md', content: researchTemplate('{{projectName}}') },
      { path: 'references/', content: '', required: true }
    ]
  },
  {
    category: 'general',
    type: 'coding',
    label: '开发项目',
    icon: 'code',
    color: 'emerald',
    description: '用于代码开发、技术项目',
    files: [
      { path: 'README.md', content: codingReadmeTemplate('{{projectName}}'), required: true },
      { path: 'docs/', content: '', required: true }
    ]
  },
  {
    category: 'general',
    type: 'notes',
    label: '笔记知识库',
    icon: 'notebook',
    color: 'amber',
    description: '用于整理笔记、构建个人知识库',
    files: [
      { path: 'README.md', content: generalProjectReadme('{{projectName}}'), required: true },
      { path: 'inbox.md', content: '# 收件箱\n\n- ', required: true }
    ]
  },
  {
    category: 'creative',
    type: 'web-novel',
    label: '网络小说',
    icon: 'book',
    color: 'violet',
    description: '网文长篇创作，包含完整大纲、人物、世界观模板',
    files: [
      { path: '00-大纲/大纲.md', content: outlineTemplate('{{projectName}}'), required: true },
      { path: '00-大纲/人物关系.md', content: charactersTemplate, required: true },
      { path: '00-大纲/时间轴.md', content: timelineTemplate, required: true },
      { path: '00-大纲/世界观.md', content: worldbuildingTemplate, required: true },
      { path: '00-大纲/想法收集.md', content: ideasTemplate('{{projectName}}') },
      { path: '01-正文/', content: '', required: true },
      { path: '02-素材/', content: '', required: true },
      { path: '03-废弃/', content: '' }
    ]
  },
  {
    category: 'creative',
    type: 'novel',
    label: '长篇小说',
    icon: 'book',
    color: 'indigo',
    description: '严肃文学/传统长篇小说创作',
    files: [
      { path: '大纲/大纲.md', content: outlineTemplate('{{projectName}}'), required: true },
      { path: '大纲/人物设定.md', content: charactersTemplate, required: true },
      { path: '大纲/时间轴.md', content: timelineTemplate, required: true },
      { path: '大纲/世界观.md', content: worldbuildingTemplate },
      { path: '正文/', content: '', required: true },
      { path: '素材/', content: '', required: true },
      { path: '修订/', content: '' }
    ]
  },
  {
    category: 'creative',
    type: 'screenplay',
    label: '影视剧本',
    icon: 'device-camera-video',
    color: 'rose',
    description: '电影、电视剧剧本创作，含三幕结构模板',
    files: [
      { path: '剧本大纲.md', content: screenplayOutlineTemplate('{{projectName}}'), required: true },
      { path: '人物设定.md', content: charactersTemplate, required: true },
      { path: '分镜/', content: '', required: true },
      { path: '场景/', content: '', required: true },
      { path: '素材/', content: '' }
    ]
  },
  {
    category: 'creative',
    type: 'short-story',
    label: '短篇小说',
    icon: 'file-text',
    color: 'cyan',
    description: '中短篇小说创作',
    files: [
      { path: '构思.md', content: outlineTemplate('{{projectName}}'), required: true },
      { path: '人物/', content: '', required: true },
      { path: '初稿/', content: '', required: true },
      { path: '定稿/', content: '' }
    ]
  },
  {
    category: 'creative',
    type: 'poetry',
    label: '诗歌集',
    icon: 'quote',
    color: 'pink',
    description: '诗歌、散文、随笔创作',
    files: [
      { path: '诗集.md', content: poetryTemplate('{{projectName}}'), required: true },
      { path: '素材/', content: '', required: true },
      { path: '草稿/', content: '' }
    ]
  },
  {
    category: 'creative',
    type: 'comic',
    label: '漫画/绘本',
    icon: 'browser',
    color: 'orange',
    description: '漫画、绘本、图像小说创作，含分镜模板',
    files: [
      { path: '设定/大纲.md', content: outlineTemplate('{{projectName}}'), required: true },
      { path: '设定/人物.md', content: charactersTemplate, required: true },
      { path: '分镜/', content: comicTemplate('{{projectName}}'), required: true },
      { path: '原稿/', content: '', required: true },
      { path: '素材/', content: '' }
    ]
  },
  {
    category: 'creative',
    type: 'game-script',
    label: '游戏脚本',
    icon: 'gamepad',
    color: 'fuchsia',
    description: '游戏剧情、对话脚本、互动叙事设计',
    files: [
      { path: '世界观设定.md', content: worldbuildingTemplate, required: true },
      { path: '人物设定.md', content: charactersTemplate, required: true },
      { path: '主线脚本.md', content: gameScriptTemplate('{{projectName}}'), required: true },
      { path: '支线/', content: '', required: true },
      { path: '对话/', content: '', required: true },
      { path: '美术参考/', content: '' }
    ]
  }
]

export function getTemplateByType(type: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find(t => t.type === type)
}

export function getCategoryTemplates(category: ProjectCategory): ProjectTemplate[] {
  return PROJECT_TEMPLATES.filter(t => t.category === category)
}

export function processTemplateContent(content: string, projectName: string): string {
  return content.replace(/\{\{projectName\}\}/g, projectName)
}

export function getDefaultProjectPath(projectName: string, location: 'karna' | 'documents' | 'custom', customPath?: string): string {
  if (location === 'custom' && customPath) {
    return customPath.endsWith('\\') || customPath.endsWith('/')
      ? `${customPath}${projectName}`
      : `${customPath}\\${projectName}`
  }

  if (location === 'documents') {
    return `${getDocumentsRoot()}\\Documents\\${projectName}`
  }

  return `${getKarnaProjectsRoot()}\\${projectName}`
}

export const COLOR_CLASSES: Record<string, { bg: string; border: string; text: string; iconBg: string; selectedBg: string; selectedBorder: string }> = {
  slate: {
    bg: 'bg-slate-50 dark:bg-slate-800/50',
    border: 'border-slate-200 dark:border-slate-700',
    text: 'text-slate-700 dark:text-slate-300',
    iconBg: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400',
    selectedBg: 'bg-slate-100 dark:bg-slate-700/50',
    selectedBorder: 'border-slate-400 dark:border-slate-500'
  },
  sky: {
    bg: 'bg-sky-50 dark:bg-sky-900/30',
    border: 'border-sky-200 dark:border-sky-800',
    text: 'text-sky-700 dark:text-sky-300',
    iconBg: 'bg-sky-100 dark:bg-sky-800/50 text-sky-600 dark:text-sky-400',
    selectedBg: 'bg-sky-100 dark:bg-sky-800/40',
    selectedBorder: 'border-sky-400 dark:border-sky-500'
  },
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    border: 'border-emerald-200 dark:border-emerald-800',
    text: 'text-emerald-700 dark:text-emerald-300',
    iconBg: 'bg-emerald-100 dark:bg-emerald-800/50 text-emerald-600 dark:text-emerald-400',
    selectedBg: 'bg-emerald-100 dark:bg-emerald-800/40',
    selectedBorder: 'border-emerald-400 dark:border-emerald-500'
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-900/30',
    border: 'border-amber-200 dark:border-amber-800',
    text: 'text-amber-700 dark:text-amber-300',
    iconBg: 'bg-amber-100 dark:bg-amber-800/50 text-amber-600 dark:text-amber-400',
    selectedBg: 'bg-amber-100 dark:bg-amber-800/40',
    selectedBorder: 'border-amber-400 dark:border-amber-500'
  },
  violet: {
    bg: 'bg-violet-50 dark:bg-violet-900/30',
    border: 'border-violet-200 dark:border-violet-800',
    text: 'text-violet-700 dark:text-violet-300',
    iconBg: 'bg-violet-100 dark:bg-violet-800/50 text-violet-600 dark:text-violet-400',
    selectedBg: 'bg-violet-100 dark:bg-violet-800/40',
    selectedBorder: 'border-violet-400 dark:border-violet-500'
  },
  indigo: {
    bg: 'bg-indigo-50 dark:bg-indigo-900/30',
    border: 'border-indigo-200 dark:border-indigo-800',
    text: 'text-indigo-700 dark:text-indigo-300',
    iconBg: 'bg-indigo-100 dark:bg-indigo-800/50 text-indigo-600 dark:text-indigo-400',
    selectedBg: 'bg-indigo-100 dark:bg-indigo-800/40',
    selectedBorder: 'border-indigo-400 dark:border-indigo-500'
  },
  rose: {
    bg: 'bg-rose-50 dark:bg-rose-900/30',
    border: 'border-rose-200 dark:border-rose-800',
    text: 'text-rose-700 dark:text-rose-300',
    iconBg: 'bg-rose-100 dark:bg-rose-800/50 text-rose-600 dark:text-rose-400',
    selectedBg: 'bg-rose-100 dark:bg-rose-800/40',
    selectedBorder: 'border-rose-400 dark:border-rose-500'
  },
  cyan: {
    bg: 'bg-cyan-50 dark:bg-cyan-900/30',
    border: 'border-cyan-200 dark:border-cyan-800',
    text: 'text-cyan-700 dark:text-cyan-300',
    iconBg: 'bg-cyan-100 dark:bg-cyan-800/50 text-cyan-600 dark:text-cyan-400',
    selectedBg: 'bg-cyan-100 dark:bg-cyan-800/40',
    selectedBorder: 'border-cyan-400 dark:border-cyan-500'
  },
  pink: {
    bg: 'bg-pink-50 dark:bg-pink-900/30',
    border: 'border-pink-200 dark:border-pink-800',
    text: 'text-pink-700 dark:text-pink-300',
    iconBg: 'bg-pink-100 dark:bg-pink-800/50 text-pink-600 dark:text-pink-400',
    selectedBg: 'bg-pink-100 dark:bg-pink-800/40',
    selectedBorder: 'border-pink-400 dark:border-pink-500'
  },
  orange: {
    bg: 'bg-orange-50 dark:bg-orange-900/30',
    border: 'border-orange-200 dark:border-orange-800',
    text: 'text-orange-700 dark:text-orange-300',
    iconBg: 'bg-orange-100 dark:bg-orange-800/50 text-orange-600 dark:text-orange-400',
    selectedBg: 'bg-orange-100 dark:bg-orange-800/40',
    selectedBorder: 'border-orange-400 dark:border-orange-500'
  },
  fuchsia: {
    bg: 'bg-fuchsia-50 dark:bg-fuchsia-900/30',
    border: 'border-fuchsia-200 dark:border-fuchsia-800',
    text: 'text-fuchsia-700 dark:text-fuchsia-300',
    iconBg: 'bg-fuchsia-100 dark:bg-fuchsia-800/50 text-fuchsia-600 dark:text-fuchsia-400',
    selectedBg: 'bg-fuchsia-100 dark:bg-fuchsia-800/40',
    selectedBorder: 'border-fuchsia-400 dark:border-fuchsia-500'
  }
}
