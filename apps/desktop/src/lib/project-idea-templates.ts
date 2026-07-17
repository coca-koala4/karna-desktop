// Fun starter ideas for the new-project dialog. Pills prefill IDEA.md; the set
// shown is a random handful from this pool (reshuffled on open / via the dice),
// so creating a project always feels a little playful. Pure content — edit
// freely, order doesn't matter.

export interface ProjectIdeaTemplate {
  icon: string
  label: string
  idea: string
}

export const PROJECT_IDEA_TEMPLATES: ProjectIdeaTemplate[] = [
  {
    icon: 'file-text',
    label: '长篇小说',
    idea: '创作一部长篇小说。\n\n- 管理章节、人物与时间线\n- 制定每日字数目标\n- 让研究资料与正文保持关联'
  },
  {
    icon: 'file-text',
    label: '短篇小说集',
    idea: '策划并完成一组主题短篇。\n\n- 统一世界观或母题\n- 为每篇建立独立节奏\n- 完成编辑、校对与交付'
  },
  {
    icon: 'file-text',
    label: '学术论文',
    idea: '完成一篇结构严谨的学术论文。\n\n- 建立研究问题与论证路径\n- 管理文献和证据引用\n- 分阶段完成初稿与审校'
  },
  {
    icon: 'file-text',
    label: '影视剧本',
    idea: '创作一部可拍摄的影视剧本。\n\n- 从一句话梗概推进到场次\n- 管理人物动机与冲突\n- 检查节奏、对白和格式'
  },
  {
    icon: 'file-text',
    label: '人物小传',
    idea: '建立可复用的人物档案。\n\n- 梳理经历、欲望与恐惧\n- 记录关系和成长弧\n- 保持人物行为一致性'
  },
  {
    icon: 'file-text',
    label: '世界观设定',
    idea: '构建一套可持续扩展的世界观。\n\n- 定义历史、地理与规则\n- 维护势力和人物关系\n- 标记不可违背的设定'
  },
  {
    icon: 'file-text',
    label: '研究日志',
    idea: '围绕一个开放问题建立研究日志。\n\n- 记录实验、结果与失败路径\n- 在正文中关联来源\n- 每周总结新的认识'
  },
  {
    icon: 'file-text',
    label: '品牌文案',
    idea: '建立一套一致的品牌文案。\n\n- 明确受众、价值与语气\n- 产出首页、广告与社交内容\n- 统一术语并反复审校'
  },
  {
    icon: 'file-text',
    label: '课程讲义',
    idea: '设计一套循序渐进的课程讲义。\n\n- 先搭建知识地图\n- 每节课包含例子与练习\n- 最后生成复习与验收材料'
  },
  {
    icon: 'file-text',
    label: '非虚构写作',
    idea: '完成一篇基于事实的深度文章。\n\n- 明确核心问题与叙事线\n- 管理采访、资料和证据\n- 区分事实、推断与观点'
  },
]

// A shuffled slice of the pool — the pills shown at any moment.
export function randomIdeaTemplates(count = 6): ProjectIdeaTemplate[] {
  const pool = [...PROJECT_IDEA_TEMPLATES]

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))

    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }

  return pool.slice(0, Math.min(count, pool.length))
}
