import type { DocumentObjectType } from '@/types/writer-project-catalog'

export interface OutputSchemaField {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'markdown'
  required: boolean
  description: string
  children?: OutputSchemaField[]
}

export interface OutputSchemaProfile {
  id: string
  name: string
  docType: DocumentObjectType
  description: string
  fields: OutputSchemaField[]
  examples: string[]
}

export const OUTPUT_SCHEMA_PROFILES: OutputSchemaProfile[] = [
  {
    id: 'narrative_prose',
    name: '叙事散文',
    docType: 'narrative_prose',
    description: '叙事性文学作品的输出结构，包含章节、人物、情节、情感等核心要素',
    fields: [
      {
        key: 'chapterTitle',
        label: '章节标题',
        type: 'string',
        required: true,
        description: '本章的标题，概括章节核心内容或主题'
      },
      {
        key: 'content',
        label: '内容段落',
        type: 'markdown',
        required: true,
        description: '章节正文内容，以 Markdown 格式呈现的叙事文本'
      },
      {
        key: 'characterReferences',
        label: '人物引用',
        type: 'array',
        required: false,
        description: '本章出现的主要人物及其关键行为或状态变化',
        children: [
          {
            key: 'name',
            label: '人物名称',
            type: 'string',
            required: true,
            description: '人物姓名或称谓'
          },
          {
            key: 'role',
            label: '角色定位',
            type: 'string',
            required: false,
            description: '人物在本章中的角色作用'
          },
          {
            key: 'highlights',
            label: '关键表现',
            type: 'string',
            required: false,
            description: '人物在本章中的重要言行或成长变化'
          }
        ]
      },
      {
        key: 'timelineImpact',
        label: '时间线影响',
        type: 'string',
        required: false,
        description: '本章事件对整体故事时间线产生的影响和推进'
      },
      {
        key: 'continuityNotes',
        label: '连续性提示',
        type: 'string',
        required: false,
        description: '需要注意的前后文衔接点、伏笔回收或新伏笔设置'
      },
      {
        key: 'emotionalTone',
        label: '情感基调',
        type: 'string',
        required: false,
        description: '本章的主要情感氛围和情绪走向'
      }
    ],
    examples: [
      `章节标题：迷雾中的相遇

内容段落：
清晨的雾气还未散去，林晚站在古老的石桥上，望着远处若隐若现的山峦。她手里紧握着那封泛黄的信件，指节微微发白。

"你还是来了。"一个低沉的声音从身后传来。

她没有回头，只是轻轻叹了口气："我答应过他，无论如何都要来。"

脚步声渐渐靠近，最终停在她身侧。男人穿着一件深灰色风衣，面容在雾气中显得有些模糊。

人物引用：
- 林晚：女主角，带着一封神秘信件来到石桥，履行旧日约定
- 陈默：神秘男子，在石桥等候林晚，似乎知道信件的秘密

时间线影响：揭开了三年前那个雨夜的部分真相，推动主线剧情进入新阶段

连续性提示：呼应第一章林晚收到信件时的反应；陈默提及的"老地方"在后续章节会有交代

情感基调：悬疑中带着淡淡的忧伤，重逢的复杂情绪交织`
    ]
  },
  {
    id: 'script_dialogue',
    name: '剧本对白',
    docType: 'script_dialogue',
    description: '剧本格式的输出结构，包含场景、角色、动作、对白等标准剧本要素',
    fields: [
      {
        key: 'sceneNumber',
        label: '场次编号',
        type: 'string',
        required: true,
        description: '场景编号，如"第3场"或"1-3"'
      },
      {
        key: 'location',
        label: '场景地点',
        type: 'string',
        required: true,
        description: '故事发生的具体地点'
      },
      {
        key: 'timeInteriorExterior',
        label: '时间/内外',
        type: 'string',
        required: true,
        description: '日/夜、内/外，如"日·内"或"夜·外"'
      },
      {
        key: 'charactersPresent',
        label: '出场角色',
        type: 'array',
        required: true,
        description: '本场出现的角色列表',
        children: [
          {
            key: 'name',
            label: '角色名',
            type: 'string',
            required: true,
            description: '角色姓名'
          },
          {
            key: 'description',
            label: '出场状态',
            type: 'string',
            required: false,
            description: '角色的出场状态或简要描述'
          }
        ]
      },
      {
        key: 'actionDescription',
        label: '动作描写',
        type: 'markdown',
        required: true,
        description: '场景动作和环境描写，即舞台指示'
      },
      {
        key: 'dialogues',
        label: '对白',
        type: 'array',
        required: true,
        description: '角色对话列表',
        children: [
          {
            key: 'character',
            label: '说话角色',
            type: 'string',
            required: true,
            description: '说话的角色名称'
          },
          {
            key: 'line',
            label: '台词',
            type: 'string',
            required: true,
            description: '角色说的话'
          },
          {
            key: 'parenthetical',
            label: '台词提示',
            type: 'string',
            required: false,
            description: '括号中的语气、动作提示，如（冷笑）、（缓缓地）'
          }
        ]
      },
      {
        key: 'transition',
        label: '转场',
        type: 'string',
        required: false,
        description: '本场结束的转场方式，如"切至"、"淡入淡出"等'
      }
    ],
    examples: [
      `场次编号：第7场

场景地点：咖啡馆·靠窗位置

时间/内外：日·内

出场角色：
- 苏晴：28岁，设计师，略显紧张地搅动咖啡
- 张伟：30岁，建筑师，从容淡定

动作描写：
午后阳光透过玻璃窗洒进来，在木质桌面上投下斑驳的光影。苏晴坐在靠窗的位置，手指无意识地搅动着面前的拿铁，眼神时不时飘向门口。

风铃轻响，张伟走了进来。他扫视一圈，目光落在苏晴身上，嘴角微微上扬，快步走了过去。

张 伟
（拉开椅子坐下）
等很久了？

苏 晴
（抬起头，露出一个略显僵硬的微笑）
没有，我也刚到。

张 伟
（脱下外套搭在椅背上）
路上有点堵。不好意思。对了，你之前说有重要的事？

苏晴握着咖啡杯的手紧了紧，深吸一口气。

苏 晴
（认真地看着对方）
张伟，我考虑好了。我决定接受那个去巴黎的机会。

张伟脸上的笑容凝固了一瞬，但很快恢复了平静。

张 伟
（缓缓点头）
……好。什么时候走？

转场：切至 咖啡馆外街道·黄昏`
    ]
  },
  {
    id: 'interactive_narrative',
    name: '互动叙事',
    docType: 'interactive_narrative',
    description: '互动叙事/分支剧情的输出结构，包含节点、选项、变量和状态管理',
    fields: [
      {
        key: 'nodeId',
        label: '节点ID',
        type: 'string',
        required: true,
        description: '当前剧情节点的唯一标识符'
      },
      {
        key: 'nodeTitle',
        label: '节点标题',
        type: 'string',
        required: true,
        description: '当前节点的标题或简短描述'
      },
      {
        key: 'bodyText',
        label: '正文',
        type: 'markdown',
        required: true,
        description: '当前节点的叙事正文内容'
      },
      {
        key: 'choices',
        label: '选项列表',
        type: 'array',
        required: true,
        description: '玩家可以选择的分支选项',
        children: [
          {
            key: 'choiceText',
            label: '选项文本',
            type: 'string',
            required: true,
            description: '呈现给玩家的选项文字'
          },
          {
            key: 'targetNode',
            label: '目标节点',
            type: 'string',
            required: true,
            description: '选择后跳转到的节点ID'
          },
          {
            key: 'condition',
            label: '条件',
            type: 'string',
            required: false,
            description: '选项出现的前置条件，基于变量判断'
          },
          {
            key: 'stateChange',
            label: '状态变化',
            type: 'string',
            required: false,
            description: '选择后对变量或状态的影响'
          }
        ]
      },
      {
        key: 'variables',
        label: '变量列表',
        type: 'array',
        required: false,
        description: '本节点涉及的关键变量及其当前值说明',
        children: [
          {
            key: 'name',
            label: '变量名',
            type: 'string',
            required: true,
            description: '变量的名称'
          },
          {
            key: 'value',
            label: '当前值',
            type: 'string',
            required: false,
            description: '进入本节点时的变量值'
          },
          {
            key: 'description',
            label: '说明',
            type: 'string',
            required: false,
            description: '变量的含义和作用'
          }
        ]
      }
    ],
    examples: [
      `节点ID：ch02_node015

节点标题：古门抉择

正文：
你站在一扇古老的石门前，门上刻满了奇异的符文，散发着幽幽蓝光。石门左右各有一条蜿蜒的通道——左边传来潺潺水声，右边则隐约有火光闪烁。

手中的玉佩突然发烫，你知道时间不多了。

【勇气值：75】
【智慧值：60】
【同伴：无】

选项列表：
- 推开古老的石门 → 目标节点：ch02_node020
  条件：勇气值 ≥ 70
  状态变化：勇气值 +5，获得成就"无畏者"

- 走左边的水道 → 目标节点：ch02_node018
  条件：无
  状态变化：智慧值 +3

- 走右边的火道 → 目标节点：ch02_node019
  条件：无
  状态变化：勇气值 +2

- 原地研究符文 → 目标节点：ch02_node017
  条件：智慧值 ≥ 55
  状态变化：智慧值 +8，获得隐藏线索"符文密语"

变量列表：
- 勇气值：影响战斗和危险选择的成功率
- 智慧值：影响解谜和洞察选项的解锁
- 玉佩：关键道具，温度变化暗示危险程度`
    ]
  },
  {
    id: 'marketing_copy',
    name: '营销文案',
    docType: 'marketing_copy',
    description: '营销文案的输出结构，包含标题、正文、CTA、卖点等核心营销要素',
    fields: [
      {
        key: 'headline',
        label: '标题/Headline',
        type: 'string',
        required: true,
        description: '主标题，一句话抓住注意力并传达核心价值'
      },
      {
        key: 'subheadline',
        label: '副标题',
        type: 'string',
        required: false,
        description: '辅助标题，进一步补充说明或强化主标题'
      },
      {
        key: 'body',
        label: '正文/Body',
        type: 'markdown',
        required: true,
        description: '文案正文，展开描述产品价值、用户利益和情感共鸣'
      },
      {
        key: 'cta',
        label: 'CTA',
        type: 'string',
        required: true,
        description: '行动号召（Call to Action），明确引导用户下一步操作'
      },
      {
        key: 'targetAudience',
        label: '目标受众',
        type: 'string',
        required: true,
        description: '文案针对的目标人群画像和需求痛点'
      },
      {
        key: 'keySellingPoints',
        label: '核心卖点',
        type: 'array',
        required: true,
        description: '产品或服务的核心价值主张和差异化优势',
        children: [
          {
            key: 'point',
            label: '卖点',
            type: 'string',
            required: true,
            description: '卖点的简要概括'
          },
          {
            key: 'benefit',
            label: '用户利益',
            type: 'string',
            required: true,
            description: '该卖点能给用户带来的具体好处'
          }
        ]
      },
      {
        key: 'factualClaims',
        label: '事实声明',
        type: 'array',
        required: false,
        description: '文案中涉及的事实、数据、声明及其依据',
        children: [
          {
            key: 'claim',
            label: '声明内容',
            type: 'string',
            required: true,
            description: '事实声明的具体内容'
          },
          {
            key: 'source',
            label: '来源依据',
            type: 'string',
            required: true,
            description: '声明的数据来源或依据'
          }
        ]
      },
      {
        key: 'variants',
        label: '变体说明',
        type: 'array',
        required: false,
        description: '不同渠道/场景的文案变体说明',
        children: [
          {
            key: 'channel',
            label: '渠道',
            type: 'string',
            required: true,
            description: '投放渠道或使用场景'
          },
          {
            key: 'adjustment',
            label: '调整说明',
            type: 'string',
            required: true,
            description: '针对该渠道的文案调整要点'
          }
        ]
      }
    ],
    examples: [
      `标题/Headline：每天15分钟，30天说出一口流利英语

副标题：告别哑巴英语，让学习像刷短视频一样轻松

正文/Body：
你是不是也有这样的困扰？
学了十几年英语，见到外国人还是不敢开口；
单词背了又忘，语法看了又看，就是说不出来；
想报班又太贵，自学又坚持不下去……

现在，有一个更聪明的方法——
「流利说AI英语教练」，把外教装进口袋，随时随地练口语。

🎯 智能对话，像真人一样聊天
AI 教练听懂你的每一句话，实时纠正发音、语法和表达
就像身边跟着一位24小时待命的私教

⏰ 碎片时间，高效利用
地铁上、排队时、午休前
每天只需15分钟，一个月就能看到明显变化

📊 科学路径，稳步提升
基于千万用户数据的智能学习路径
从零基础到商务交流，循序渐进不踩坑

CTA：立即免费试学，首月立享5折优惠 →

目标受众：25-35岁职场人士，有英语学习需求但时间有限、预算有限，曾尝试自学但难以坚持

核心卖点：
- AI智能对话：随时随地道口语练习，不怕说错没面子
- 15分钟碎片化学习：时间灵活，降低坚持门槛
- 科学学习路径：基于数据的个性化方案，效果有保障

事实声明：
- "千万用户数据"：基于平台累计1200万+注册用户学习数据
- "30天见效"：据内部统计，坚持每日学习的用户中，87%在30天后口语流利度评分提升20%以上

变体说明：
- 朋友圈：缩短正文，突出"15分钟"和"AI私教"，配用户证言截图
- 小红书：增加emoji，用更口语化的表达，首图用对比图
- 抖音：前3秒抛出痛点问题，节奏更快，结尾重复CTA`
    ]
  },
  {
    id: 'informational_article',
    name: '资讯文章',
    docType: 'informational_article',
    description: '资讯/科普类文章的输出结构，包含标题、摘要、正文、来源等要素',
    fields: [
      {
        key: 'title',
        label: '标题',
        type: 'string',
        required: true,
        description: '文章标题，准确概括文章核心内容'
      },
      {
        key: 'summary',
        label: '摘要',
        type: 'string',
        required: true,
        description: '文章摘要，一两句话概括全文核心信息'
      },
      {
        key: 'bodyParagraphs',
        label: '正文段落',
        type: 'array',
        required: true,
        description: '正文内容，按小标题分段呈现',
        children: [
          {
            key: 'subtitle',
            label: '小标题',
            type: 'string',
            required: false,
            description: '段落的小标题'
          },
          {
            key: 'content',
            label: '内容',
            type: 'markdown',
            required: true,
            description: '段落的具体内容'
          }
        ]
      },
      {
        key: 'sources',
        label: '事实来源列表',
        type: 'array',
        required: true,
        description: '文章中引用的事实、数据的来源',
        children: [
          {
            key: 'sourceName',
            label: '来源名称',
            type: 'string',
            required: true,
            description: '来源的名称，如机构名、文献名'
          },
          {
            key: 'sourceDetail',
            label: '来源详情',
            type: 'string',
            required: false,
            description: '来源的具体信息，如发布时间、链接、页码'
          }
        ]
      },
      {
        key: 'keyData',
        label: '关键数据',
        type: 'array',
        required: false,
        description: '文章中的关键数据和数字',
        children: [
          {
            key: 'dataPoint',
            label: '数据点',
            type: 'string',
            required: true,
            description: '数据指标的名称'
          },
          {
            key: 'value',
            label: '数值',
            type: 'string',
            required: true,
            description: '具体的数值和单位'
          },
          {
            key: 'context',
            label: '上下文说明',
            type: 'string',
            required: false,
            description: '数据的解读或对比说明'
          }
        ]
      },
      {
        key: 'furtherReading',
        label: '延伸阅读',
        type: 'array',
        required: false,
        description: '推荐的相关阅读材料或深入了解的途径',
        children: [
          {
            key: 'title',
            label: '资料标题',
            type: 'string',
            required: true,
            description: '推荐资料的标题'
          },
          {
            key: 'reason',
            label: '推荐理由',
            type: 'string',
            required: false,
            description: '推荐阅读的原因和价值'
          }
        ]
      }
    ],
    examples: [
      `标题：全球首条"无化石钢"铁路在瑞典启用，钢铁行业减碳迎来新突破

摘要：瑞典钢铁公司SSAB与铁路运营商合作，启用全球首条完全使用无化石钢建造的铁路线，标志着钢铁行业向碳中和迈出重要一步。

正文段落：
## 什么是"无化石钢"？
传统钢铁生产是全球最大的工业碳排放源之一，约占全球碳排放的7%。无化石钢是指在生产过程中不使用煤炭等化石燃料，而是采用氢气直接还原技术，以可再生能源驱动的电力为能源，最终的副产品只有水蒸气，而非二氧化碳。

## 这条铁路有何特别之处？
这条位于瑞典北部的试验铁路线全长约2公里，全部使用SSAB生产的无化石钢建造。虽然目前还是示范项目，但其意义远超项目本身——它证明了无化石钢可以实际应用于基础设施建设。

## 商业化还有多远？
目前无化石钢的成本仍然较高，约为传统钢材的2-3倍。但随着技术成熟和规模效应，预计到2030年成本可下降至传统钢材的1.5倍左右，到2040年左右实现成本平价。

事实来源列表：
- SSAB官方新闻稿，2026年5月发布
- 国际能源署（IEA）《2025年钢铁行业技术路线图》
- 世界钢铁协会（World Steel Association）碳排放数据报告

关键数据：
- 钢铁行业碳排放占比：7%（全球工业碳排放）
- 无化石钢当前成本溢价：200%-300%
- 2030年成本溢价预测：约50%
- 试验铁路线长度：约2公里

延伸阅读：
- 《氢冶金：钢铁行业的绿色革命》——深入了解氢直接还原技术原理
- SSAB无化石钢项目官网——获取最新进展和技术细节
- IEA钢铁减碳路线图全文——了解行业整体减碳路径`
    ]
  },
  {
    id: 'argumentative_document',
    name: '论证文档',
    docType: 'argumentative_document',
    description: '论证类文档的输出结构，包含论点、论据、反方观点、反驳和结论',
    fields: [
      {
        key: 'coreThesis',
        label: '核心论点',
        type: 'string',
        required: true,
        description: '全文的核心主张或中心论点，一句话明确表达立场'
      },
      {
        key: 'arguments',
        label: '论据列表',
        type: 'array',
        required: true,
        description: '支撑核心论点的论据，按重要性排序',
        children: [
          {
            key: 'point',
            label: '分论点',
            type: 'string',
            required: true,
            description: '支撑核心论点的分论点'
          },
          {
            key: 'evidence',
            label: '证据',
            type: 'string',
            required: true,
            description: '支持该分论点的具体证据、数据或案例'
          },
          {
            key: 'source',
            label: '来源',
            type: 'string',
            required: true,
            description: '证据的来源出处'
          },
          {
            key: 'credibility',
            label: '可信度',
            type: 'string',
            required: false,
            description: '证据的可信度评估和说明'
          }
        ]
      },
      {
        key: 'counterarguments',
        label: '反方观点',
        type: 'array',
        required: true,
        description: '可能的反对意见或对立观点',
        children: [
          {
            key: 'counterpoint',
            label: '反方论点',
            type: 'string',
            required: true,
            description: '反对方的主要论点'
          },
          {
            key: 'rationale',
            label: '反方理由',
            type: 'string',
            required: false,
            description: '反方提出该观点的理由和依据'
          }
        ]
      },
      {
        key: 'rebuttals',
        label: '反驳',
        type: 'array',
        required: true,
        description: '对反方观点的回应和反驳',
        children: [
          {
            key: 'target',
            label: '反驳对象',
            type: 'string',
            required: true,
            description: '针对的反方论点'
          },
          {
            key: 'rebuttal',
            label: '反驳内容',
            type: 'string',
            required: true,
            description: '具体的反驳论证和证据'
          }
        ]
      },
      {
        key: 'conclusion',
        label: '结论',
        type: 'string',
        required: true,
        description: '总结全文，重申核心论点并提出启示或建议'
      },
      {
        key: 'references',
        label: '引用列表',
        type: 'array',
        required: true,
        description: '文中引用的文献和资料列表，规范格式',
        children: [
          {
            key: 'reference',
            label: '引用条目',
            type: 'string',
            required: true,
            description: '完整的引用信息'
          }
        ]
      }
    ],
    examples: [
      `核心论点：远程办公对员工生产力的正面影响大于负面影响，企业应将混合办公模式作为长期战略而非权宜之计。

论据列表：
1. 生产力提升
   - 证据：斯坦福大学针对中国16,000名员工的两年期研究显示，远程办公使生产力提升13%，主要来自工作时间增加和干扰减少
   - 来源：Bloom, N. et al. (2015). "Does Working from Home Work? Evidence from a Chinese Experiment"
   - 可信度：高——大规模随机对照实验，发表于顶级经济学期刊QJE

2. 员工留存与满意度
   - 证据：微软2025年Work Trend Index报告显示，实行混合办公的公司员工离职率比纯线下公司低41%
   - 来源：微软Work Trend Index 2025年度报告
   - 可信度：较高——大样本调研，但由商业公司发布需注意立场

3. 成本节约
   - 证据：Global Workplace Analytics数据显示，雇主每位远程员工每年可节省约11,000美元，包括办公空间、水电和配套服务
   - 来源：Global Workplace Analytics研究报告
   - 可信度：中等——基于行业平均水平估算，具体情况因企业而异

反方观点：
1. 远程办公损害团队协作和创新
   - 理由：MIT研究发现，完全远程团队的"意外碰撞"减少，跨领域创意交流下降

2. 远程办公加剧职业发展不平等
   - 理由：年轻员工和初级岗位缺乏面对面指导，晋升机会可能减少

反驳：
1. 针对"协作与创新下降"
   - 反驳内容：该研究针对的是完全远程模式，而混合办公模式（每周2-3天到岗）既保留了面对面协作的机会，又享受远程办公的便利。微软同一报告也显示，混合办公团队的协作效率评分最高，甚至高于纯线下团队。关键在于设计合理的"协作日"和"专注日"节奏。

2. 针对"职业发展不平等"
   - 反驳内容：这确实是需要关注的问题，但可以通过制度设计缓解，比如结构化导师制、全员线上会议（即使部分人在办公室）、明确的绩效评估标准等。问题的根源是管理方式的不适应，而非远程办公本身的固有缺陷。

结论：
远程办公不是简单的"好"与"坏"的二元对立，而是一种需要被精心设计和管理的工作模式。现有研究证据表明，设计合理的混合办公模式在生产力、员工满意度和成本效率方面都展现出显著优势。企业不应将其视为疫情期间的临时措施，而应将其作为未来工作方式的重要组成部分，投入资源进行制度设计和管理能力建设。

引用列表：
- Bloom, N., Liang, J., Roberts, J., & Ying, Z. J. (2015). Does working from home work? Evidence from a Chinese experiment. The Quarterly Journal of Economics, 130(1), 165-218.
- Microsoft. (2025). Work Trend Index: Annual Report.
- Global Workplace Analytics. (2024). Remote Work Cost Savings Analysis.
- Allen, T. D., et al. (2023). Remote work effectiveness: A meta-analysis. Journal of Applied Psychology.`
    ]
  },
  {
    id: 'structured_business_doc',
    name: '结构化商务文档',
    docType: 'structured_business_doc',
    description: '结构化商务文档的输出结构，包含目标、背景、里程碑、资源、风险等要素',
    fields: [
      {
        key: 'objectiveScope',
        label: '目标/范围',
        type: 'object',
        required: true,
        description: '文档的目标和范围界定',
        children: [
          {
            key: 'objectives',
            label: '目标',
            type: 'array',
            required: true,
            description: '项目或文档的核心目标',
            children: [
              {
                key: 'objective',
                label: '目标描述',
                type: 'string',
                required: true,
                description: '具体的目标内容'
              }
            ]
          },
          {
            key: 'scopeIn',
            label: '范围内',
            type: 'string',
            required: false,
            description: '明确包含在范围内的内容'
          },
          {
            key: 'scopeOut',
            label: '范围外',
            type: 'string',
            required: false,
            description: '明确不包含在范围内的内容'
          }
        ]
      },
      {
        key: 'background',
        label: '背景',
        type: 'string',
        required: true,
        description: '项目或事项的背景信息、起因和现状'
      },
      {
        key: 'milestones',
        label: '里程碑计划',
        type: 'array',
        required: true,
        description: '关键里程碑和时间节点',
        children: [
          {
            key: 'milestone',
            label: '里程碑名称',
            type: 'string',
            required: true,
            description: '里程碑的名称'
          },
          {
            key: 'timeline',
            label: '时间节点',
            type: 'string',
            required: true,
            description: '预计完成时间'
          },
          {
            key: 'deliverables',
            label: '交付物',
            type: 'string',
            required: false,
            description: '该里程碑的交付成果'
          },
          {
            key: 'successCriteria',
            label: '成功标准',
            type: 'string',
            required: false,
            description: '衡量该里程碑完成的标准'
          }
        ]
      },
      {
        key: 'resourceRequirements',
        label: '资源需求',
        type: 'array',
        required: true,
        description: '所需的人力、预算、技术等资源',
        children: [
          {
            key: 'resourceType',
            label: '资源类型',
            type: 'string',
            required: true,
            description: '资源的类别，如人力、预算、设备等'
          },
          {
            key: 'detail',
            label: '具体需求',
            type: 'string',
            required: true,
            description: '资源的具体需求描述'
          }
        ]
      },
      {
        key: 'riskAssessment',
        label: '风险评估',
        type: 'array',
        required: true,
        description: '潜在风险识别与应对措施',
        children: [
          {
            key: 'risk',
            label: '风险描述',
            type: 'string',
            required: true,
            description: '可能发生的风险'
          },
          {
            key: 'likelihood',
            label: '发生概率',
            type: 'string',
            required: true,
            description: '风险发生的可能性（高/中/低）'
          },
          {
            key: 'impact',
            label: '影响程度',
            type: 'string',
            required: true,
            description: '风险发生后的影响程度（高/中/低）'
          },
          {
            key: 'mitigation',
            label: '应对措施',
            type: 'string',
            required: true,
            description: '预防或应对风险的措施'
          }
        ]
      },
      {
        key: 'stakeholders',
        label: '利益相关者',
        type: 'array',
        required: true,
        description: '涉及的关键利益相关方',
        children: [
          {
            key: 'role',
            label: '角色/部门',
            type: 'string',
            required: true,
            description: '利益相关者的角色或部门'
          },
          {
            key: 'interest',
            label: '利益点',
            type: 'string',
            required: false,
            description: '该相关方的核心利益或关注点'
          },
          {
            key: 'responsibility',
            label: '职责',
            type: 'string',
            required: false,
            description: '该相关方在项目中的职责'
          }
        ]
      },
      {
        key: 'acceptanceCriteria',
        label: '验收标准',
        type: 'array',
        required: true,
        description: '项目或交付物的验收标准',
        children: [
          {
            key: 'criterion',
            label: '标准描述',
            type: 'string',
            required: true,
            description: '具体的验收标准'
          },
          {
            key: 'measurement',
            label: '衡量方式',
            type: 'string',
            required: false,
            description: '如何验证该标准是否达成'
          }
        ]
      }
    ],
    examples: [
      `目标/范围：
- 目标：
  1. 在Q3结束前完成客户管理系统（CRM）2.0版本上线
  2. 实现销售线索转化率提升20%
  3. 客户数据管理效率提升30%
- 范围内：客户信息管理、销售漏斗、数据分析模块
- 范围外：财务模块、库存管理、移动端App（延后至下一版本）

背景：
公司现有CRM系统为5年前采购，功能已无法满足当前业务需求。销售团队反映系统操作繁琐、数据统计不准，导致线索跟进不及时，客户流失率偏高。经过半年调研，管理层决定自主开发新一代CRM系统，以适应业务快速发展的需要。

里程碑计划：
1. 需求确认与产品设计
   - 时间节点：2026年7月31日前
   - 交付物：PRD文档、产品原型、UI设计稿
   - 成功标准：产品、研发、销售三方签字确认

2. 核心功能开发完成
   - 时间节点：2026年8月31日前
   - 交付物：可运行的beta版本
   - 成功标准：核心功能通过内部测试

3. 用户测试与优化
   - 时间节点：2026年9月15日前
   - 交付物：优化后的正式版本
   - 成功标准：UAT测试通过率≥95%

4. 正式上线
   - 时间节点：2026年9月30日前
   - 交付物：上线运行的CRM 2.0系统
   - 成功标准：系统稳定运行72小时无重大故障

资源需求：
- 人力：产品经理1人、项目经理1人、后端开发3人、前端开发2人、测试1人、设计师0.5人
- 预算：研发投入约80万，服务器及运维费用约10万/年
- 技术：现有技术栈（React + Node.js + PostgreSQL）

风险评估：
- 需求变更风险
  - 概率：中
  - 影响：高
  - 应对：前期充分调研确认，设立需求变更审批流程，控制范围蔓延

- 人员流动风险
  - 概率：中
  - 影响：中
  - 应对：关键岗位设Backup，代码规范和文档完善，降低人员依赖

- 技术难点风险（大数据量性能）
  - 概率：低
  - 影响：高
  - 应对：前期技术方案评审，预留性能优化时间，准备备选方案

利益相关者：
- 销售部：核心使用方，关注效率提升和数据准确
- 产品部：负责需求定义和产品设计
- 研发部：负责技术实现
- 数据部：提供数据支持和报表需求
- 财务部：预算审批和成本控制

验收标准：
1. 功能完整性：PRD中定义的所有功能均实现并通过测试
   - 衡量方式：对照PRD逐项功能测试
2. 性能指标：单页面加载时间≤2秒，支持500人同时在线
   - 衡量方式：性能压测报告
3. 用户满意度：销售团队满意度评分≥4.0/5.0
   - 衡量方式：上线后两周内用户调研问卷
4. 数据准确性：客户数据迁移零丢失
   - 衡量方式：数据迁移前后比对验证`
    ]
  },
  {
    id: 'regulated_document',
    name: '受监管文档',
    docType: 'regulated_document',
    description: '受监管类文档的输出结构，包含条款、依据、风险、范围、免责等要素',
    fields: [
      {
        key: 'clauseContent',
        label: '条款内容',
        type: 'markdown',
        required: true,
        description: '文档的核心条款和正文内容'
      },
      {
        key: 'legalBasis',
        label: '法律依据',
        type: 'array',
        required: true,
        description: '文档所依据的法律法规、政策文件',
        children: [
          {
            key: 'basis',
            label: '依据名称',
            type: 'string',
            required: true,
            description: '法律法规或政策文件的名称'
          },
          {
            key: 'article',
            label: '具体条款',
            type: 'string',
            required: false,
            description: '具体引用的条款条目'
          }
        ]
      },
      {
        key: 'riskLevel',
        label: '风险级别',
        type: 'string',
        required: true,
        description: '文档涉及的风险等级评估（高/中/低）'
      },
      {
        key: 'applicableScope',
        label: '适用范围',
        type: 'string',
        required: true,
        description: '文档的适用对象、场景和边界'
      },
      {
        key: 'disclaimer',
        label: '免责声明',
        type: 'string',
        required: true,
        description: '必要的免责声明和风险提示'
      },
      {
        key: 'reviewStatus',
        label: '审阅状态',
        type: 'object',
        required: true,
        description: '文档的审阅审批状态',
        children: [
          {
            key: 'draftVersion',
            label: '版本号',
            type: 'string',
            required: true,
            description: '当前文档版本号'
          },
          {
            key: 'reviewStage',
            label: '审阅阶段',
            type: 'string',
            required: true,
            description: '当前所处的审阅阶段，如起草/审核/批准'
          },
          {
            key: 'reviewer',
            label: '审阅人',
            type: 'string',
            required: false,
            description: '需要或已经审阅的人员/部门'
          }
        ]
      },
      {
        key: 'effectiveDate',
        label: '生效日期',
        type: 'object',
        required: true,
        description: '文档的生效和失效时间',
        children: [
          {
            key: 'startDate',
            label: '生效起始日',
            type: 'string',
            required: true,
            description: '文档开始生效的日期'
          },
          {
            key: 'endDate',
            label: '失效日期',
            type: 'string',
            required: false,
            description: '文档到期或失效的日期（如有）'
          }
        ]
      }
    ],
    examples: [
      `条款内容：
# 用户服务协议

## 第一条 服务内容
1.1 本平台为用户提供在线文档协作、项目管理、团队沟通等服务。
1.2 服务的具体内容以平台实际提供的功能为准，平台有权根据业务发展调整服务内容。

## 第二条 用户注册与账号
2.1 用户注册时应提供真实、准确、完整的个人信息。
2.2 用户应妥善保管账号和密码，对账号下的所有行为和风险承担责任。
2.3 如发现账号被盗用或存在安全漏洞，应立即通知平台。

## 第三条 知识产权
3.1 用户在平台上创建的内容，其知识产权归用户所有。
3.2 平台的软件、技术、界面设计等知识产权归平台所有。

## 第四条 服务费用
4.1 基础功能免费提供，高级功能按订阅制收费。
4.2 收费标准以平台公示的价格为准，平台有权调整价格。

## 第五条 免责条款
5.1 因不可抗力导致服务中断的，平台不承担责任。
5.2 用户因自身操作不当造成损失的，平台不承担责任。

法律依据：
- 《中华人民共和国民法典》第三编 合同编
- 《中华人民共和国网络安全法》
- 《中华人民共和国个人信息保护法》
- 《互联网信息服务管理办法》

风险级别：中

适用范围：
本协议适用于所有注册并使用本平台服务的个人用户和企业用户。不适用于私有化部署版本的客户，私有化部署客户以单独签订的商业合同为准。

免责声明：
本文档为标准模板示例，仅供参考，不构成法律意见。在实际使用前，请咨询专业法律人士进行审核和定制。本模板的作者和提供方不对因使用本文档而产生的任何直接或间接损失承担责任。法律具有时效性和地域性，使用时请确保符合适用的法律法规。

审阅状态：
- 版本号：v1.2
- 审阅阶段：法务审核中
- 审阅人：法务部 - 李明

生效日期：
- 生效起始日：2026年8月1日
- 失效日期：无固定期限，新版本发布后旧版本自动失效`
    ]
  },
  {
    id: 'technical_document',
    name: '技术文档',
    docType: 'technical_document',
    description: '技术文档的输出结构，包含接口、参数、返回值、错误码、示例等要素',
    fields: [
      {
        key: 'interfaceName',
        label: '接口名称',
        type: 'string',
        required: true,
        description: '接口或功能模块的名称'
      },
      {
        key: 'description',
        label: '描述',
        type: 'string',
        required: true,
        description: '接口或功能的简要描述和用途说明'
      },
      {
        key: 'version',
        label: '版本号',
        type: 'string',
        required: true,
        description: '文档或接口的版本号'
      },
      {
        key: 'requestParameters',
        label: '请求参数',
        type: 'array',
        required: true,
        description: '请求参数列表',
        children: [
          {
            key: 'name',
            label: '参数名',
            type: 'string',
            required: true,
            description: '参数的字段名'
          },
          {
            key: 'type',
            label: '类型',
            type: 'string',
            required: true,
            description: '参数的数据类型'
          },
          {
            key: 'required',
            label: '必填',
            type: 'boolean',
            required: true,
            description: '是否为必填参数'
          },
          {
            key: 'description',
            label: '说明',
            type: 'string',
            required: true,
            description: '参数的含义和取值范围'
          },
          {
            key: 'default',
            label: '默认值',
            type: 'string',
            required: false,
            description: '参数的默认值（如有）'
          }
        ]
      },
      {
        key: 'response',
        label: '返回值',
        type: 'array',
        required: true,
        description: '返回值字段说明',
        children: [
          {
            key: 'name',
            label: '字段名',
            type: 'string',
            required: true,
            description: '返回字段的名称'
          },
          {
            key: 'type',
            label: '类型',
            type: 'string',
            required: true,
            description: '返回字段的数据类型'
          },
          {
            key: 'description',
            label: '说明',
            type: 'string',
            required: true,
            description: '返回字段的含义'
          }
        ]
      },
      {
        key: 'errorCodes',
        label: '错误码',
        type: 'array',
        required: true,
        description: '可能的错误码和说明',
        children: [
          {
            key: 'code',
            label: '错误码',
            type: 'string',
            required: true,
            description: '错误编码'
          },
          {
            key: 'message',
            label: '错误信息',
            type: 'string',
            required: true,
            description: '对应的错误提示信息'
          },
          {
            key: 'description',
            label: '说明',
            type: 'string',
            required: false,
            description: '错误原因和处理建议'
          }
        ]
      },
      {
        key: 'codeExamples',
        label: '代码示例',
        type: 'array',
        required: true,
        description: '使用示例代码',
        children: [
          {
            key: 'language',
            label: '语言',
            type: 'string',
            required: true,
            description: '示例代码的编程语言'
          },
          {
            key: 'code',
            label: '示例代码',
            type: 'string',
            required: true,
            description: '具体的代码示例'
          }
        ]
      },
      {
        key: 'compatibility',
        label: '兼容性说明',
        type: 'string',
        required: false,
        description: '版本兼容性、浏览器兼容性等说明'
      }
    ],
    examples: [
      `接口名称：用户信息查询接口 (GET /api/v1/users/:id)

描述：根据用户ID获取用户的详细信息，包括基本资料、账号状态、权限角色等。用于用户详情页展示、权限校验等场景。

版本号：v1.3.0

请求参数：
- id (string, 必填) - 用户唯一标识符，UUID格式
  - 示例：550e8400-e29b-41d4-a716-446655440000
- include (string, 选填，默认值：basic) - 指定返回的信息范围
  - 可选值：basic（基本信息）、full（完整信息）、with_roles（包含角色权限）
- locale (string, 选填，默认值：zh-CN) - 返回信息的语言
  - 可选值：zh-CN、en-US

返回值：
- id (string) - 用户ID
- username (string) - 用户名
- email (string) - 邮箱地址
- avatar_url (string) - 头像URL
- status (string) - 账号状态：active（正常）、suspended（暂停）、disabled（禁用）
- created_at (string) - 注册时间，ISO 8601格式
- updated_at (string) - 最后更新时间，ISO 8601格式
- roles (array, 可选) - 角色列表（include=with_roles时返回）
  - role_id (string) - 角色ID
  - role_name (string) - 角色名称

错误码：
- 40001 - 参数格式错误
  - 说明：id不是有效的UUID格式，或include参数值不合法
- 40101 - 未授权访问
  - 说明：缺少有效的访问令牌
- 40301 - 权限不足
  - 说明：无权查看该用户的完整信息
- 40401 - 用户不存在
  - 说明：指定ID的用户不存在
- 50001 - 服务器内部错误
  - 说明：数据库查询失败或其他服务端异常

代码示例：
语言：JavaScript (Fetch)
代码：
async function getUser(userId, include = 'basic') {
  const response = await fetch(
    \`https://api.example.com/v1/users/\${userId}?include=\${include}\`,
    {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      }
    }
  );
  
  if (!response.ok) {
    throw new Error(\`HTTP error! status: \${response.status}\`);
  }
  
  return await response.json();
}

// 调用示例
getUser('550e8400-e29b-41d4-a716-446655440000', 'with_roles')
  .then(user => console.log(user))
  .catch(err => console.error(err));

语言：cURL
代码：
curl -X GET "https://api.example.com/v1/users/550e8400-e29b-41d4-a716-446655440000?include=full" \\
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \\
  -H "Content-Type: application/json"

兼容性说明：
- 本接口自v1.0起稳定可用
- v1.3新增include=with_roles选项，之前版本调用不受影响
- 旧版接口 /api/v0/users 已废弃，将于2026年12月31日下线，请尽快迁移`
    ]
  },
  {
    id: 'knowledge_asset',
    name: '知识资产',
    docType: 'knowledge_asset',
    description: '知识资产的输出结构，包含实体、属性、关系、来源、置信度等要素',
    fields: [
      {
        key: 'entityName',
        label: '实体名称',
        type: 'string',
        required: true,
        description: '知识实体的名称或标题'
      },
      {
        key: 'entityType',
        label: '实体类型',
        type: 'string',
        required: true,
        description: '实体的类别，如人物、地点、物品、概念、事件等'
      },
      {
        key: 'attributes',
        label: '属性列表',
        type: 'array',
        required: true,
        description: '实体的属性和特征',
        children: [
          {
            key: 'attributeName',
            label: '属性名',
            type: 'string',
            required: true,
            description: '属性的名称'
          },
          {
            key: 'attributeValue',
            label: '属性值',
            type: 'string',
            required: true,
            description: '属性的具体值'
          },
          {
            key: 'confidence',
            label: '置信度',
            type: 'string',
            required: false,
            description: '该属性值的可信程度'
          }
        ]
      },
      {
        key: 'relations',
        label: '关系列表',
        type: 'array',
        required: false,
        description: '与其他实体的关系',
        children: [
          {
            key: 'relationType',
            label: '关系类型',
            type: 'string',
            required: true,
            description: '关系的类型，如"属于"、"创建"、"位于"等'
          },
          {
            key: 'targetEntity',
            label: '目标实体',
            type: 'string',
            required: true,
            description: '关联的另一个实体名称'
          },
          {
            key: 'description',
            label: '关系描述',
            type: 'string',
            required: false,
            description: '对关系的详细说明'
          }
        ]
      },
      {
        key: 'sourceReferences',
        label: '来源引用',
        type: 'array',
        required: true,
        description: '知识信息的来源出处',
        children: [
          {
            key: 'source',
            label: '来源',
            type: 'string',
            required: true,
            description: '信息来源的名称或标识'
          },
          {
            key: 'detail',
            label: '来源详情',
            type: 'string',
            required: false,
            description: '来源的具体位置，如页码、章节、URL等'
          }
        ]
      },
      {
        key: 'confidenceLevel',
        label: '置信度',
        type: 'string',
        required: true,
        description: '该知识条目的整体可信程度（高/中/低）'
      },
      {
        key: 'lastUpdated',
        label: '更新时间',
        type: 'string',
        required: true,
        description: '该知识条目最后更新的时间'
      }
    ],
    examples: [
      `实体名称：张衡

实体类型：人物（历史人物）

属性列表：
- 生卒年：78年—139年
  - 置信度：高
- 字：平子
  - 置信度：高
- 朝代：东汉
  - 置信度：高
- 籍贯：南阳西鄂（今河南南阳）
  - 置信度：高
- 职业：天文学家、数学家、发明家、地理学家、文学家
  - 置信度：高
- 主要成就：发明浑天仪、地动仪；著有《灵宪》《算罔论》
  - 置信度：高
- 官职：太史令、河间相、尚书
  - 置信度：高
- 后世尊称：科圣
  - 置信度：中

关系列表：
- 属于：东汉科学家群体
  - 描述：东汉时期最重要的科学家之一
- 发明：地动仪
  - 描述：发明了世界上最早的地震仪——候风地动仪
- 发明：浑天仪
  - 描述：改进了浑天仪，推动了中国古代天文学发展
- 著作：《二京赋》
  - 描述：汉赋名篇，文学成就的代表
- 同时代：班固
  - 描述：与班固、崔瑗等人为同时代学者

来源引用：
- 《后汉书·张衡列传》
  - 详情：范晔 撰，卷五十九
- 《中国科学技术史》
  - 详情：李约瑟 著，天文学卷
- 中国大百科全书·中国历史
  - 详情："张衡"条目

置信度：高

更新时间：2026-03-15`
    ]
  },
  {
    id: 'outline',
    name: '大纲规划',
    docType: 'outline',
    description: '大纲规划文档的输出结构，包含整体结构、章节列表和各章节核心信息',
    fields: [
      {
        key: 'outlineTitle',
        label: '大纲标题',
        type: 'string',
        required: true,
        description: '整个大纲的标题，即作品或文档的名称'
      },
      {
        key: 'structureOverview',
        label: '整体结构说明',
        type: 'string',
        required: true,
        description: '对整体结构、叙事节奏或逻辑框架的说明'
      },
      {
        key: 'chapters',
        label: '章节列表',
        type: 'array',
        required: true,
        description: '各章节的详细规划',
        children: [
          {
            key: 'chapterTitle',
            label: '章节标题',
            type: 'string',
            required: true,
            description: '章节的标题'
          },
          {
            key: 'oneLineSummary',
            label: '一句话概括',
            type: 'string',
            required: true,
            description: '用一句话概括本章的核心内容'
          },
          {
            key: 'estimatedWordCount',
            label: '字数预估',
            type: 'number',
            required: false,
            description: '本章预估的字数'
          },
          {
            key: 'coreConflict',
            label: '核心冲突',
            type: 'string',
            required: false,
            description: '本章的核心冲突或关键事件'
          }
        ]
      }
    ],
    examples: [
      `大纲标题：《星尘之约》长篇科幻小说大纲

整体结构说明：
全书采用三幕式结构，共24章，约12万字。第一幕（第1-6章）铺垫世界观和人物，引出危机；第二幕（第7-18章）为主体，主角团队经历探索、背叛、成长，冲突逐步升级；第三幕（第19-24章）高潮与结局，揭开最终真相，完成人物弧光。整体节奏前缓后紧，中段有多次小高潮，保持阅读张力。

章节列表：
1. 章节标题：第一章 仰望星空的人
   - 一句话概括：天文学家林薇在例行观测中发现异常信号，她的人生轨迹从此改变
   - 字数预估：约5000字
   - 核心冲突：林薇的发现在学术界引起争议，她面临"坚持真相"与"职业前途"的抉择

2. 章节标题：第二章 来自深空
   - 一句话概括：信号被证实来自25光年外的一颗行星，且包含规律的数学序列
   - 字数预估：约4500字
   - 核心冲突：各国政府争夺信号解释权，林薇被排除在核心研究团队之外

3. 章节标题：第三章 秘密任务
   - 一句话概括：神秘组织找到林薇，邀请她加入一项未经官方批准的秘密探测计划
   - 字数预估：约5000字
   - 核心冲突：是否要违背官方禁令，加入这个动机不明的秘密组织

4. 章节标题：第四章 启航
   - 一句话概括：飞船"星尘号"搭载7名船员，踏上前往未知星系的旅程
   - 字数预估：约4000字
   - 核心冲突：飞船升空初期的技术故障，以及船员之间的初次磨合

5. 章节标题：第五章 失重的日子
   - 一句话概括：长途航行中，船员们在封闭空间里逐渐暴露出各自的问题和秘密
   - 字数预估：约5500字
   - 核心冲突：船员之间的信任危机，一场意外让矛盾浮出水面

……（后续章节略）`
    ]
  },
  {
    id: 'research_material',
    name: '研究资料',
    docType: 'research_material',
    description: '研究资料的输出结构，包含来源、摘要、引述、标签、可信度等要素',
    fields: [
      {
        key: 'materialTitle',
        label: '资料标题',
        type: 'string',
        required: true,
        description: '该份资料的标题或名称'
      },
      {
        key: 'sourceInfo',
        label: '来源信息',
        type: 'object',
        required: true,
        description: '资料的出处和来源详情',
        children: [
          {
            key: 'author',
            label: '作者/机构',
            type: 'string',
            required: false,
            description: '资料的作者或发布机构'
          },
          {
            key: 'publication',
            label: '出版物/平台',
            type: 'string',
            required: false,
            description: '发布的出版物或平台名称'
          },
          {
            key: 'publishDate',
            label: '发布日期',
            type: 'string',
            required: false,
            description: '资料的发布或出版时间'
          },
          {
            key: 'url',
            label: '链接/出处',
            type: 'string',
            required: false,
            description: '资料的链接或出处标识'
          }
        ]
      },
      {
        key: 'coreSummary',
        label: '核心内容摘要',
        type: 'string',
        required: true,
        description: '资料核心内容的摘要概括'
      },
      {
        key: 'keyQuotes',
        label: '关键引述',
        type: 'array',
        required: false,
        description: '资料中的关键原文引述',
        children: [
          {
            key: 'quote',
            label: '引述内容',
            type: 'string',
            required: true,
            description: '原文引述的内容'
          },
          {
            key: 'context',
            label: '上下文',
            type: 'string',
            required: false,
            description: '引述的上下文背景'
          },
          {
            key: 'location',
            label: '位置',
            type: 'string',
            required: false,
            description: '引述在原文中的位置，如页码、段落'
          }
        ]
      },
      {
        key: 'tags',
        label: '分类标签',
        type: 'array',
        required: true,
        description: '用于分类检索的标签',
        children: [
          {
            key: 'tag',
            label: '标签',
            type: 'string',
            required: true,
            description: '标签名称'
          }
        ]
      },
      {
        key: 'credibilityAssessment',
        label: '可信度评估',
        type: 'object',
        required: true,
        description: '对该资料可信度的评估',
        children: [
          {
            key: 'level',
            label: '可信度等级',
            type: 'string',
            required: true,
            description: '整体可信度（高/中/低）'
          },
          {
            key: 'reasoning',
            label: '评估理由',
            type: 'string',
            required: true,
            description: '做出可信度评估的理由和依据'
          }
        ]
      },
      {
        key: 'collectedAt',
        label: '采集时间',
        type: 'string',
        required: true,
        description: '该资料被采集整理的时间'
      }
    ],
    examples: [
      `资料标题：2025年中国人工智能人才发展白皮书

来源信息：
- 作者/机构：中国人工智能学会、智联招聘联合发布
- 出版物/平台：中国人工智能学会官网
- 发布日期：2026年2月
- 链接/出处：https://caai.cn/whitepaper/2025-ai-talent

核心内容摘要：
本白皮书基于智联招聘平台2025年全年招聘数据和问卷调研，系统分析了中国AI人才市场的供需状况、薪酬水平、地域分布和技能要求。核心发现包括：1）AI人才需求同比增长45%，但供给增速仅为28%，人才缺口持续扩大；2）算法工程师平均月薪达3.8万元，居各岗位之首；3）北京、上海、深圳、杭州四座城市占据AI人才需求总量的68%；4）大模型相关岗位成为新的增长热点，相关人才溢价达30%以上。

关键引述：
- 引述内容："2025年，我国AI核心产业人才需求量突破80万人，而存量人才仅约30万人，供需比约为1:2.7。"
  - 上下文：报告第一章"人才供需总体分析"
  - 位置：第12页

- 引述内容："大模型相关岗位中，Prompt工程师岗位数量同比增长320%，成为增长最快的细分岗位。"
  - 上下文：报告第四章"新兴岗位分析"
  - 位置：第47页

分类标签：
- 人工智能
- 人才市场
- 行业报告
- 大模型
- 就业数据
- 薪酬分析

可信度评估：
- 可信度等级：高
- 评估理由：发布机构为权威行业协会（中国人工智能学会）和主流招聘平台（智联招聘），数据来源真实可靠，报告有明确的方法论说明，且数据可交叉验证。注意的是，数据主要反映招聘平台上的公开职位，可能不包含内部推荐等非公开招聘渠道。

采集时间：2026-04-10`
    ]
  },
  {
    id: 'review_feedback',
    name: '审阅反馈',
    docType: 'review_feedback',
    description: '审阅反馈文档的输出结构，包含问题列表、严重级别、修改建议和优先级',
    fields: [
      {
        key: 'overview',
        label: '审稿意见概述',
        type: 'string',
        required: true,
        description: '对稿件整体的评价和主要问题的概括'
      },
      {
        key: 'issues',
        label: '问题列表',
        type: 'array',
        required: true,
        description: '具体的问题和反馈点',
        children: [
          {
            key: 'location',
            label: '位置',
            type: 'string',
            required: true,
            description: '问题所在的位置，如章节、段落、页码等'
          },
          {
            key: 'description',
            label: '问题描述',
            type: 'string',
            required: true,
            description: '具体问题的详细描述'
          },
          {
            key: 'severity',
            label: '严重级别',
            type: 'string',
            required: true,
            description: '问题的严重程度：致命/严重/一般/轻微'
          },
          {
            key: 'suggestion',
            label: '修改建议',
            type: 'string',
            required: true,
            description: '具体的修改建议或解决方案'
          }
        ]
      },
      {
        key: 'overallEvaluation',
        label: '整体评价',
        type: 'object',
        required: true,
        description: '对稿件的整体评价',
        children: [
          {
            key: 'strengths',
            label: '优点',
            type: 'string',
            required: true,
            description: '稿件的优点和亮点'
          },
          {
            key: 'weaknesses',
            label: '不足',
            type: 'string',
            required: true,
            description: '稿件的主要不足之处'
          },
          {
            key: 'rating',
            label: '总体评分',
            type: 'string',
            required: false,
            description: '总体评价等级或分数'
          }
        ]
      },
      {
        key: 'priorityOrder',
        label: '优先级排序',
        type: 'array',
        required: true,
        description: '建议的修改优先级排序，按重要性排列',
        children: [
          {
            key: 'priorityItem',
            label: '优先级事项',
            type: 'string',
            required: true,
            description: '需要优先处理的事项'
          }
        ]
      }
    ],
    examples: [
      `审稿意见概述：
这篇关于"城市微更新"的选题角度不错，切入点新颖，案例选择也有代表性。整体结构清晰，语言流畅。但目前版本存在几个较突出的问题：一是核心观点不够明确，读完后不知道作者到底想主张什么；二是部分案例描述偏多，分析深度不足；三是个别数据和事实需要核实来源。建议从明确核心论点、深化案例分析、补充事实来源三个方面进行修改。

问题列表：
1. 位置：引言部分（第1-2段）
   - 问题描述：引言铺陈过多，但迟迟不点明核心论点。读者读了两段还不知道文章要讲什么。
   - 严重级别：严重
   - 修改建议：建议在引言结尾处用一两句话明确表达本文的核心观点，比如"本文认为，城市微更新的关键不在于硬件翻新，而在于社区参与机制的建立"。

2. 位置：第二章"上海愚园路案例"（第3-5页）
   - 问题描述：案例描述占了3页篇幅，大多是事实陈述，但对案例的分析和反思只有半页。案例是为了论证观点服务的，不能变成案例介绍。
   - 严重级别：严重
   - 修改建议：精简案例描述，保留关键事实，增加分析深度。建议重点分析：1）这个案例的成功关键因素是什么？2）有什么局限性？3）对其他城市有什么借鉴意义？

3. 位置：第三章第2节第1段（第7页）
   - 问题描述：文中提到"据统计，全国已有超过200个城市开展了微更新实践"，但没有标注数据来源。
   - 严重级别：一般
   - 修改建议：补充数据来源和统计时间。如果找不到权威来源，建议调整表述方式，比如改为"近年来，越来越多的城市开始探索微更新模式"。

4. 位置：第4章第3节（第12页）
   - 问题描述："微更新就是小打小闹，成不了气候"——这种对反方观点的表述过于简单化，有稻草人谬误之嫌。
   - 严重级别：一般
   - 修改建议：公正地呈现反方观点的合理之处，然后再有针对性地反驳。比如可以承认微更新在解决系统性问题上的局限性，再强调其独特价值。

5. 位置：全文
   - 问题描述：部分段落之间的过渡比较生硬，逻辑衔接不够顺畅。
   - 严重级别：轻微
   - 修改建议：在章节之间和段落之间增加过渡句，让行文更连贯。

整体评价：
- 优点：选题有价值，案例丰富，语言表达流畅，可读性较好
- 不足：核心论点不突出，分析深度不够，部分事实缺少来源，逻辑衔接有待加强
- 总体评分：修改后可发表（需中等幅度修改）

优先级排序：
1. 明确核心论点，在引言和结论中强化中心观点
2. 深化案例分析，减少描述性内容，增加分析和反思
3. 补充事实和数据的来源标注
4. 调整反方观点的表述方式，做到公正客观
5. 优化段落过渡和逻辑衔接`
    ]
  },
  {
    id: 'revision_artifact',
    name: '修订产物',
    docType: 'revision_artifact',
    description: '修订产物的输出结构，包含版本号、变更原因、变更内容、影响范围和回滚方案',
    fields: [
      {
        key: 'versionNumber',
        label: '版本号',
        type: 'string',
        required: true,
        description: '当前修订后的版本号'
      },
      {
        key: 'changeReason',
        label: '变更原因',
        type: 'string',
        required: true,
        description: '进行本次修订的原因和背景'
      },
      {
        key: 'changes',
        label: '变更内容列表',
        type: 'array',
        required: true,
        description: '具体的变更内容',
        children: [
          {
            key: 'location',
            label: '位置',
            type: 'string',
            required: true,
            description: '变更发生的位置，如章节、段落、页码'
          },
          {
            key: 'originalText',
            label: '原文',
            type: 'string',
            required: true,
            description: '修改前的原文内容'
          },
          {
            key: 'revisedText',
            label: '修改后',
            type: 'string',
            required: true,
            description: '修改后的内容'
          },
          {
            key: 'changeType',
            label: '变更类型',
            type: 'string',
            required: true,
            description: '变更类型：新增/删除/修改/调整结构'
          }
        ]
      },
      {
        key: 'impactScope',
        label: '影响范围',
        type: 'string',
        required: true,
        description: '本次变更可能影响的范围和方面'
      },
      {
        key: 'rollbackPlan',
        label: '回滚方案',
        type: 'string',
        required: false,
        description: '如出现问题，回退到之前版本的方案'
      }
    ],
    examples: [
      `版本号：v2.1.0

变更原因：
根据产品评审会反馈和用户调研结果，用户注册流程过于复杂，导致注册转化率偏低。本次修订主要针对注册流程进行优化，简化必填项，增加第三方登录选项，预计可将注册转化率提升15-20%。

变更内容列表：
1. 位置：注册页面 - 表单字段
   - 原文：注册需填写：用户名、邮箱、密码、确认密码、手机号、验证码、所在地区、行业
   - 修改后：注册需填写：手机号、验证码、密码
   - 变更类型：修改
   - 说明：将邮箱、所在地区、行业等字段移至注册后"完善资料"环节，降低注册门槛

2. 位置：注册页面 - 登录方式
   - 原文：仅支持手机号+密码注册登录
   - 修改后：支持手机号+验证码注册登录，同时支持微信、企业微信、钉钉第三方登录
   - 变更类型：新增
   - 说明：增加第三方登录选项，实现一键注册/登录，大幅减少操作步骤

3. 位置：用户协议展示方式
   - 原文：注册页面底部完整展示用户协议全文
   - 修改后：注册页面底部展示协议链接，点击弹窗查看，默认勾选"已阅读并同意"
   - 变更类型：修改
   - 说明：优化页面布局，减少页面干扰元素

4. 位置：注册成功后跳转页
   - 原文：注册成功后直接跳转到首页
   - 修改后：注册成功后跳转到"欢迎引导页"，包含3步新手引导和完善资料入口
   - 变更类型：新增
   - 说明：提升新用户首体验，同时引导用户完善资料

影响范围：
- 注册页面UI/UX
- 用户数据表结构（新增第三方账号绑定表）
- 登录认证模块
- 新用户引导流程
- 数据分析埋点（新增注册转化漏斗各节点埋点）

回滚方案：
如上线后出现重大问题，可执行以下回滚方案：
1. 前端一键回滚到v2.0.0版本的注册页面（预计5分钟内完成）
2. 数据库迁移脚本已预写回滚SQL，可快速回退表结构变更
3. 第三方登录相关接口保留兼容旧版逻辑，回滚不影响已有用户
4. 回滚操作可在业务低峰期（凌晨2-4点）执行，用户感知最小`
    ]
  }
]

export function getOutputSchemaProfile(
  docType: DocumentObjectType,
  formId?: string
): OutputSchemaProfile {
  const profile = OUTPUT_SCHEMA_PROFILES.find(p => p.docType === docType)
  if (profile) {
    return profile
  }

  return {
    id: 'default',
    name: '通用输出',
    docType: docType,
    description: '通用的输出结构，无特定格式约束',
    fields: [
      {
        key: 'content',
        label: '内容',
        type: 'markdown',
        required: true,
        description: '输出的主要内容'
      }
    ],
    examples: []
  }
}
