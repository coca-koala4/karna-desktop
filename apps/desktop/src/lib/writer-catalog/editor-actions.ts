import type { DocumentObjectType } from './types'

export interface EditorToolbarAction {
  id: string
  label: string
  icon: string
  title: string
  group: 'ai-generate' | 'ai-refine' | 'domain' | 'review'
  applicableDocumentTypes: DocumentObjectType[]
  promptKey: string
}

const COMMON_ACTIONS: EditorToolbarAction[] = [
  {
    id: 'continue-writing',
    label: '续写',
    icon: 'arrow-right',
    title: '基于当前内容继续创作',
    group: 'ai-generate',
    applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document'],
    promptKey: 'continue'
  },
  {
    id: 'polish',
    label: '润色',
    icon: 'sparkle',
    title: '优化语言表达和文笔',
    group: 'ai-refine',
    applicableDocumentTypes: ['narrative_prose','script_dialogue','interactive_narrative','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document','knowledge_asset'],
    promptKey: 'polish'
  },
  {
    id: 'rewrite',
    label: '改写',
    icon: 'refresh',
    title: '重新组织语言表述',
    group: 'ai-refine',
    applicableDocumentTypes: ['narrative_prose','script_dialogue','marketing_copy','informational_article','argumentative_document','structured_business_doc','regulated_document','technical_document'],
    promptKey: 'rewrite'
  },
  {
    id: 'summarize',
    label: '摘要',
    icon: 'book',
    title: '生成内容摘要',
    group: 'ai-refine',
    applicableDocumentTypes: ['narrative_prose','script_dialogue','informational_article','argumentative_document','structured_business_doc','technical_document','research_material'],
    promptKey: 'summarize'
  }
]

const NARRATIVE_ACTIONS: EditorToolbarAction[] = [
  {
    id: 'character-description',
    label: '人物描写',
    icon: 'person',
    title: '生成或优化人物描写',
    group: 'domain',
    applicableDocumentTypes: ['narrative_prose'],
    promptKey: 'character_description'
  },
  {
    id: 'scene-description',
    label: '场景描写',
    icon: 'home',
    title: '生成或优化场景描写',
    group: 'domain',
    applicableDocumentTypes: ['narrative_prose'],
    promptKey: 'scene_description'
  },
  {
    id: 'dialogue-writing',
    label: '对话创作',
    icon: 'comment',
    title: '创作人物对话',
    group: 'domain',
    applicableDocumentTypes: ['narrative_prose', 'script_dialogue'],
    promptKey: 'dialogue_writing'
  },
  {
    id: 'foreshadow-hint',
    label: '伏笔提示',
    icon: 'eye',
    title: '分析可埋伏笔之处',
    group: 'domain',
    applicableDocumentTypes: ['narrative_prose'],
    promptKey: 'foreshadow_hint'
  },
  {
    id: 'pacing-analysis',
    label: '节奏分析',
    icon: 'pulse',
    title: '分析叙事节奏',
    group: 'review',
    applicableDocumentTypes: ['narrative_prose'],
    promptKey: 'pacing_analysis'
  },
  {
    id: 'continuity-check',
    label: '连续性',
    icon: 'link',
    title: '检查情节连续性',
    group: 'review',
    applicableDocumentTypes: ['narrative_prose'],
    promptKey: 'continuity_check'
  }
]

const SCRIPT_ACTIONS: EditorToolbarAction[] = [
  {
    id: 'scene-blocking',
    label: '场面调度',
    icon: 'device-camera-video',
    title: '生成分镜和场面调度建议',
    group: 'domain',
    applicableDocumentTypes: ['script_dialogue'],
    promptKey: 'scene_blocking'
  },
  {
    id: 'beat-adjust',
    label: '节拍调整',
    icon: 'list-ordered',
    title: '调整场景节拍',
    group: 'domain',
    applicableDocumentTypes: ['script_dialogue'],
    promptKey: 'beat_adjust'
  },
  {
    id: 'character-voice',
    label: '声口调整',
    icon: 'mic',
    title: '统一角色语言风格',
    group: 'ai-refine',
    applicableDocumentTypes: ['script_dialogue'],
    promptKey: 'character_voice'
  },
  {
    id: 'format-fix',
    label: '格式检查',
    icon: 'symbol-misc',
    title: '检查剧本格式规范',
    group: 'review',
    applicableDocumentTypes: ['script_dialogue'],
    promptKey: 'format_fix'
  }
]

const INTERACTIVE_ACTIONS: EditorToolbarAction[] = [
  {
    id: 'branch-design',
    label: '分支设计',
    icon: 'git-branch',
    title: '设计剧情分支选项',
    group: 'domain',
    applicableDocumentTypes: ['interactive_narrative'],
    promptKey: 'branch_design'
  },
  {
    id: 'npc-dialogue',
    label: 'NPC对白',
    icon: 'comment-discussion',
    title: '创作NPC对白',
    group: 'domain',
    applicableDocumentTypes: ['interactive_narrative'],
    promptKey: 'npc_dialogue'
  },
  {
    id: 'state-vars',
    label: '状态变量',
    icon: 'database',
    title: '建议状态变量设置',
    group: 'domain',
    applicableDocumentTypes: ['interactive_narrative'],
    promptKey: 'state_vars'
  },
  {
    id: 'deadend-check',
    label: '死路检测',
    icon: 'alert',
    title: '检测剧情死路',
    group: 'review',
    applicableDocumentTypes: ['interactive_narrative'],
    promptKey: 'deadend_check'
  }
]

const MARKETING_ACTIONS: EditorToolbarAction[] = [
  {
    id: 'selling-points',
    label: '卖点提炼',
    icon: 'star',
    title: '提炼核心卖点',
    group: 'domain',
    applicableDocumentTypes: ['marketing_copy'],
    promptKey: 'selling_points'
  },
  {
    id: 'cta-optimize',
    label: 'CTA优化',
    icon: 'megaphone',
    title: '优化行动号召语句',
    group: 'ai-refine',
    applicableDocumentTypes: ['marketing_copy'],
    promptKey: 'cta_optimize'
  },
  {
    id: 'audience-adapt',
    label: '受众适配',
    icon: 'people',
    title: '调整目标受众语气',
    group: 'domain',
    applicableDocumentTypes: ['marketing_copy'],
    promptKey: 'audience_adapt'
  },
  {
    id: 'ab-variants',
    label: 'A/B变体',
    icon: 'split-horizontal',
    title: '生成多版本文案',
    group: 'ai-generate',
    applicableDocumentTypes: ['marketing_copy'],
    promptKey: 'ab_variants'
  },
  {
    id: 'claims-check',
    label: '声明核查',
    icon: 'shield-check',
    title: '检查功效声明合规性',
    group: 'review',
    applicableDocumentTypes: ['marketing_copy'],
    promptKey: 'claims_check'
  }
]

const INFORMATIONAL_ACTIONS: EditorToolbarAction[] = [
  {
    id: 'headline-optimize',
    label: '标题优化',
    icon: 'type',
    title: '生成吸引人的标题',
    group: 'ai-refine',
    applicableDocumentTypes: ['informational_article'],
    promptKey: 'headline_optimize'
  },
  {
    id: 'source-verify',
    label: '来源验证',
    icon: 'link-external',
    title: '标注和验证信息来源',
    group: 'review',
    applicableDocumentTypes: ['informational_article'],
    promptKey: 'source_verify'
  },
  {
    id: 'fact-check',
    label: '事实核查',
    icon: 'search-check',
    title: '核查事实声明',
    group: 'review',
    applicableDocumentTypes: ['informational_article', 'argumentative_document'],
    promptKey: 'fact_check'
  },
  {
    id: 'seo-optimize',
    label: 'SEO优化',
    icon: 'search',
    title: '优化SEO关键词布局',
    group: 'ai-refine',
    applicableDocumentTypes: ['informational_article', 'marketing_copy'],
    promptKey: 'seo_optimize'
  }
]

const ARGUMENTATIVE_ACTIONS: EditorToolbarAction[] = [
  {
    id: 'thesis-strengthen',
    label: '论点强化',
    icon: 'lightbulb',
    title: '强化核心论点表述',
    group: 'ai-refine',
    applicableDocumentTypes: ['argumentative_document'],
    promptKey: 'thesis_strengthen'
  },
  {
    id: 'argument-structure',
    label: '论证结构',
    icon: 'git-merge',
    title: '梳理论证逻辑结构',
    group: 'domain',
    applicableDocumentTypes: ['argumentative_document'],
    promptKey: 'argument_structure'
  },
  {
    id: 'counter-argue',
    label: '反方审阅',
    icon: 'scale',
    title: '从反方视角质疑论点',
    group: 'review',
    applicableDocumentTypes: ['argumentative_document', 'structured_business_doc'],
    promptKey: 'counter_argue'
  },
  {
    id: 'citation-fix',
    label: '引用格式',
    icon: 'quote',
    title: '检查引用格式规范',
    group: 'review',
    applicableDocumentTypes: ['argumentative_document'],
    promptKey: 'citation_fix'
  }
]

const BUSINESS_ACTIONS: EditorToolbarAction[] = [
  {
    id: 'milestone-plan',
    label: '里程碑规划',
    icon: 'flag',
    title: '规划项目里程碑',
    group: 'domain',
    applicableDocumentTypes: ['structured_business_doc', 'outline'],
    promptKey: 'milestone_plan'
  },
  {
    id: 'stakeholder-analysis',
    label: '干系人分析',
    icon: 'organization',
    title: '分析利益相关者',
    group: 'domain',
    applicableDocumentTypes: ['structured_business_doc'],
    promptKey: 'stakeholder_analysis'
  },
  {
    id: 'risk-assess',
    label: '风险评估',
    icon: 'alert-triangle',
    title: '识别和评估风险',
    group: 'review',
    applicableDocumentTypes: ['structured_business_doc'],
    promptKey: 'risk_assess'
  }
]

const REGULATED_ACTIONS: EditorToolbarAction[] = [
  {
    id: 'clause-structure',
    label: '条款结构',
    icon: 'list-flat',
    title: '规范条款表述结构',
    group: 'domain',
    applicableDocumentTypes: ['regulated_document'],
    promptKey: 'clause_structure'
  },
  {
    id: 'compliance-review',
    label: '合规审查',
    icon: 'shield',
    title: '审查合规性',
    group: 'review',
    applicableDocumentTypes: ['regulated_document'],
    promptKey: 'compliance_review'
  },
  {
    id: 'legal-language',
    label: '法律用语',
    icon: 'law',
    title: '规范法律用语',
    group: 'ai-refine',
    applicableDocumentTypes: ['regulated_document'],
    promptKey: 'legal_language'
  }
]

const TECHNICAL_ACTIONS: EditorToolbarAction[] = [
  {
    id: 'api-doc-complete',
    label: '接口补全',
    icon: 'code',
    title: '补全API文档描述',
    group: 'ai-generate',
    applicableDocumentTypes: ['technical_document'],
    promptKey: 'api_doc_complete'
  },
  {
    id: 'example-generate',
    label: '示例生成',
    icon: 'play',
    title: '生成代码示例',
    group: 'ai-generate',
    applicableDocumentTypes: ['technical_document'],
    promptKey: 'example_generate'
  },
  {
    id: 'changelog-gen',
    label: '生成变更日志',
    icon: 'diff',
    title: '基于变更生成Changelog',
    group: 'ai-generate',
    applicableDocumentTypes: ['technical_document', 'revision_artifact'],
    promptKey: 'changelog_gen'
  },
  {
    id: 'consistency-check',
    label: '一致性检查',
    icon: 'check',
    title: '检查文档与实现一致性',
    group: 'review',
    applicableDocumentTypes: ['technical_document'],
    promptKey: 'consistency_check'
  }
]

const KNOWLEDGE_ACTIONS: EditorToolbarAction[] = [
  {
    id: 'glossary-extract',
    label: '术语提取',
    icon: 'book',
    title: '提取和定义术语',
    group: 'domain',
    applicableDocumentTypes: ['knowledge_asset'],
    promptKey: 'glossary_extract'
  },
  {
    id: 'knowledge-link',
    label: '知识关联',
    icon: 'git-pull-request',
    title: '建议知识关联链接',
    group: 'domain',
    applicableDocumentTypes: ['knowledge_asset'],
    promptKey: 'knowledge_link'
  },
  {
    id: 'source-quality',
    label: '来源评估',
    icon: 'check-circle',
    title: '评估信息来源可信度',
    group: 'review',
    applicableDocumentTypes: ['knowledge_asset', 'research_material'],
    promptKey: 'source_quality'
  }
]

const OUTLINE_ACTIONS: EditorToolbarAction[] = [
  {
    id: 'outline-expand',
    label: '大纲展开',
    icon: 'list-tree',
    title: '将大纲展开为详细内容',
    group: 'ai-generate',
    applicableDocumentTypes: ['outline'],
    promptKey: 'outline_expand'
  },
  {
    id: 'structure-review',
    label: '结构评审',
    icon: 'list-ordered',
    title: '评审大纲结构合理性',
    group: 'review',
    applicableDocumentTypes: ['outline'],
    promptKey: 'structure_review'
  }
]

const RESEARCH_ACTIONS: EditorToolbarAction[] = [
  {
    id: 'source-summary',
    label: '资料摘要',
    icon: 'file-text',
    title: '生成资料摘要',
    group: 'ai-refine',
    applicableDocumentTypes: ['research_material'],
    promptKey: 'source_summary'
  },
  {
    id: 'key-points',
    label: '要点提取',
    icon: 'key',
    title: '提取关键要点',
    group: 'domain',
    applicableDocumentTypes: ['research_material'],
    promptKey: 'key_points'
  }
]

const REVIEW_ACTIONS: EditorToolbarAction[] = [
  {
    id: 'issue-classify',
    label: '问题分类',
    icon: 'tag',
    title: '分类评审问题',
    group: 'review',
    applicableDocumentTypes: ['review_feedback'],
    promptKey: 'issue_classify'
  },
  {
    id: 'suggestion-prioritize',
    label: '建议排序',
    icon: 'list-flat',
    title: '按优先级排序修改建议',
    group: 'review',
    applicableDocumentTypes: ['review_feedback'],
    promptKey: 'suggestion_prioritize'
  }
]

const REVISION_ACTIONS: EditorToolbarAction[] = [
  {
    id: 'diff-summary',
    label: '变更摘要',
    icon: 'diff',
    title: '总结版本变更内容',
    group: 'ai-refine',
    applicableDocumentTypes: ['revision_artifact'],
    promptKey: 'diff_summary'
  },
  {
    id: 'impact-analysis',
    label: '影响分析',
    icon: 'circle-slice',
    title: '分析变更影响范围',
    group: 'review',
    applicableDocumentTypes: ['revision_artifact'],
    promptKey: 'impact_analysis'
  }
]

export const ALL_EDITOR_ACTIONS: EditorToolbarAction[] = [
  ...COMMON_ACTIONS,
  ...NARRATIVE_ACTIONS,
  ...SCRIPT_ACTIONS,
  ...INTERACTIVE_ACTIONS,
  ...MARKETING_ACTIONS,
  ...INFORMATIONAL_ACTIONS,
  ...ARGUMENTATIVE_ACTIONS,
  ...BUSINESS_ACTIONS,
  ...REGULATED_ACTIONS,
  ...TECHNICAL_ACTIONS,
  ...KNOWLEDGE_ACTIONS,
  ...OUTLINE_ACTIONS,
  ...RESEARCH_ACTIONS,
  ...REVIEW_ACTIONS,
  ...REVISION_ACTIONS
]

export function getActionsForDocumentType(docType: DocumentObjectType | null | undefined): EditorToolbarAction[] {
  if (!docType) {
    return COMMON_ACTIONS
  }
  return ALL_EDITOR_ACTIONS.filter(a => a.applicableDocumentTypes.includes(docType))
}

export function getActionGroups(docType: DocumentObjectType | null | undefined): Record<string, EditorToolbarAction[]> {
  const actions = getActionsForDocumentType(docType)
  return {
    'ai-generate': actions.filter(a => a.group === 'ai-generate'),
    'ai-refine': actions.filter(a => a.group === 'ai-refine'),
    'domain': actions.filter(a => a.group === 'domain'),
    'review': actions.filter(a => a.group === 'review')
  }
}

export const GROUP_LABELS: Record<string, string> = {
  'ai-generate': '创作',
  'ai-refine': '优化',
  'domain': '专业',
  'review': '审阅'
}

export const GROUP_ICONS: Record<string, string> = {
  'ai-generate': 'wand',
  'ai-refine': 'sparkle',
  'domain': 'book',
  'review': 'checklist'
}
