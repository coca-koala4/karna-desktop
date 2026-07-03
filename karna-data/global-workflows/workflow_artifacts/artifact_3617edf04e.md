# smoke-1783007059278 run result

Node failed: connect ECONNREFUSED 127.0.0.1:8710

[Local fallback]
Project: Karna 多智能体工坊
Workflow: smoke-1783007059278
Current node: Draft
Agent: 正文写作 Agent / 正文写作
Duties: 根据用户需求、章节梗概和上游材料写章节初稿。
Forbidden: 未经允许不改变大纲和核心情节。
Hard constraints: 贴合用户文风锚点
Node resources:
Node model: default
Skill selection: auto
Plugin selection: auto
MCP/tool selection: auto
Permissions: may edit draft; may use knowledge base; may read upstream output
Output format: 章节正文
User input: smoke test
Upstream output: Node failed: connect ECONNREFUSED 127.0.0.1:8710

[Local fallback]
Project: Karna 多智能体工坊
Workflow: smoke-1783007059278
Current node: Plan
Agent: 大纲 Agent / 大纲设计
Duties: 生成长篇总纲、分卷纲、章节梗概和阶段目标。
Forbidden: 不直接撰写完整正文。
Hard constraints: 不得改动用户指定主线剧情
Node resources:
Node model: default
Skill selection: auto
Plugin selection: auto
MCP/tool selection: auto
Permissions: must not edit prose; comments or suggestions only; may use knowledge base; may read upstream output
Output format: 分层大纲
User input: smoke test
Upstream output: smoke test
Only complete this node responsibility. Do not talk to other Agents; return everything to the hidden dispatcher.
Only complete this node responsibility. Do not talk to other Agents; return everything to the hidden dispatcher.
