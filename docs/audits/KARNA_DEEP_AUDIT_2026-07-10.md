# Karna-Hermes 深度审计与整改清单（2026-07-10）

> 范围：`D:\Agent\projects\karna-hermes`。本报告以当前工作树、可运行桌面/浏览器证据和构建日志为准；不把“能编译”误写成“所有产品能力已经落地”。

## 1. 结论摘要

Karna 的定位已经清楚：它是建立在 Hermes 运行时之上的**中文长篇创作操作系统**，核心闭环为“创建项目 → 导入材料/知识库 → Soul 作者风格 → 工作流与多 Agent → 人工检查点 → 产物交付”。当前 UI 已经可见地覆盖作品、Soul、MCP、技能/工具、多 Agent 流程、会话和设置等主要入口。

本轮实际发现并修复了 3 个会阻断演示或验证的缺陷：

1. 浏览器开发模式的设置页因 `/api/config/schema` 返回形状错误一直显示“正在加载 Karna 配置”。
2. 修复上述加载后，模型设置又因浏览器桥接缺少完整的模型、辅助模型与 MoA 协议而触发根级 Error Boundary。
3. `writer-os-electron-smoke.cjs` 使用已废弃的 Writer OS REST 路由，导致 Electron IPC 冒烟误报“向量库校验失败”。

修复后，设置页可以显示模型配置；Writer OS Electron IPC 冒烟通过；TypeScript、严格 ESLint 和生产构建全部通过。仍有明显产品/工程债务：应用主包约 28.3 MB、README 仍以 Hermes 为第一品牌、测试数据/产物污染工作树、Electron 适配器单体过大、开发桥接与 Electron API 容易再次失配。

## 2. 审计方法与证据

### 2.1 代码与文档盘点

- 枚举了仓库（排除 `.git`、`node_modules`、构建输出等依赖/派生目录）中的 **13,523** 个文件，约 **974 MB**。
- 主要体量：`karna-data` 5,419 文件 / 486 MB；`apps/desktop/src` 719 文件 / 6.0 MB；`apps/desktop/electron` 89 文件 / 1.3 MB；`agent` 170 文件 / 4.1 MB；`tools` 128 文件 / 4.5 MB。
- 重点阅读：`AGENTS.md`、`KARNA_MIGRATION.md`、根 README（中英文）、`.plans/openai-api-server.md`、`.plans/streaming-support.md`、桌面路由、工作坊入口、浏览器桥接、Electron 主进程/适配器、Writer OS 脚本与关键数据路径。
- 已核实最大的活跃代码文件：`apps/desktop/electron/karna-adapter.cjs` 333.9 KB、`apps/desktop/electron/main.cjs` 292.3 KB；`soul.tsx` 89 KB、`writer.tsx` 77.9 KB、`agents-canvas.tsx` 65 KB。

> 说明：仓库含 1.3 万余文件和数千份第三方/数据文件。本次完成了全树枚举、分类、入口/计划/关键实现深读和运行验证；不应把它表述为对每个数据文件逐行人工阅读。

### 2.2 实机点击与截图

开发服务：`http://127.0.0.1:5174`（真实 headed Chromium + Playwright CLI）。所有下列路径均由实际点击或路由打开，之后读取了快照与 Console error：

| 路径/动作 | 结果 | 截图 |
|---|---|---|
| 首页、打开“新建项目” | 普通/创作项目两类和三步向导可见 | `output/playwright/audit-home.png`、`audit-project-wizard.png` |
| 技能与工具工坊、切换工具集 | 技能 2 个、工具集 1 个，开关和“需要密钥”状态可见 | `audit-skills.png`、`audit-tools.png` |
| 设置 → 模型 | 初次发现加载死锁和 Error Boundary；修复后模型、辅助模型、MoA 可渲染 | `audit-settings-loading.png`、`audit-settings-fixed.png` |
| 协作工坊 → 调试 | 11 节点、10 连线、人工确认和归档节点可视；控制台零错误 | `audit-agent-workshop.png`、`audit-agent-debug.png` |
| 产物 | 空状态正确显示，但浏览器开发桥接仅返回 0 项 | `audit-artifacts.png` |
| MCP 工坊 → Tool Router | 路由结果显示 `Intent: research` 及四个工具，不再因 `tools.length` 崩溃 | `audit-mcp-router-fixed.png` |
| 作品工坊 → 故事圣经、Soul → 新建节点（上一轮） | Writer OS 演示项目与故事圣经可见；弹窗已中文化 | `fixed-writer-project.png`、`fixed-soul-modal.png` |

### 2.3 质量门禁

在 `apps/desktop` 执行：

```powershell
npm run typecheck
npm run lint -- --max-warnings=0
npm run build
node scripts/writer-os-smoke.cjs
node scripts/writer-os-electron-smoke.cjs
```

- `typecheck`：通过。
- `lint --max-warnings=0`：通过。
- `build`：通过；仍警告 `@tabler/icons-react` 6149 个 re-export 和单 JS 包 **28,327.79 kB**（gzip 6,102.60 kB）。
- Writer OS 本地烟测：通过，向量库 62/62、检索 5 条、基准 25/25、交付 67 文件。
- Writer OS Electron IPC 烟测：修复旧路由后通过；`vectorVerified: true`、`deliveryOk: true`，并验证 Writer/Soul/Karna hub 路由。

## 3. 产品与功能地图

| 模块 | 已有实现/进度 | 本次判断 |
|---|---|---|
| 主会话与项目向导 | 会话、项目、新建向导、权限模式、模型入口 | 主入口清楚，但“网关需要设置”和“未打开项目”同时出现，首次使用解释不足。 |
| 作品工坊 / Writer OS | 圣经、Wiki、图谱、状态、文档、RAG、基准、交付、验证 | 底层工作流很完整，必须继续补 UI 到真实数据契约的 E2E 覆盖。 |
| Soul 工坊 | 作者画像、样本、风格节点、研究导入 | 可操作；术语仍中英混杂，初学者引导和来源/版权说明不足。 |
| MCP 工坊 | 连接器、工具、审计、路由、健康检查 | 已修复 Router 崩溃；开发态只模拟 3 个连接器，需清晰区分模拟/真实运行时。 |
| 技能与工具 | 技能库、工具集、启用开关、凭据入口 | 基本可用，但 2 条演示数据不足以证明真实可发现、可安装、可调用。 |
| 协作工坊 | React Flow 画布、模板、Agent、运行记录、校验 | 视觉表现好；“调试”点击缺少明显状态反馈，真实执行/回滚证据仍需补。 |
| 产物 | 图片/文件/链接分类和空状态 | 空状态正常，开发桥接不展示现有 Writer 交付物，闭环感弱。 |
| 设置与模型 | 模型、权限、网关、MCP、密钥、外观等 | 本轮已修复开发态崩溃；必须加契约测试，防止模拟层再次缺字段。 |
| Electron 运行时 | 主进程、预加载、IPC、Karna adapter、Python backend | 可通过 Writer OS IPC 冒烟；适配器职责过于集中。 |

## 4. 本轮已落地修复

| 优先级 | 修复 | 文件 | 验证 |
|---|---|---|---|
| P0 | MCP Tool Router 对 `tools` 缺失做归一化，空连接器仍展示 Custom MCP | `apps/desktop/src/app/karna-workshop/connector-workshop.tsx` | Router 点击不再触发 Error Boundary。 |
| P0 | 浏览器开发桥接补齐连接器、Writer OS 演示项目与相关 API | `apps/desktop/src/dev/karna-browser-bridge.ts` | MCP/Writer 页面均有实际数据。 |
| P0 | 修正 `bible` 到 `story-bible` 的 Electron 后端别名 | `apps/desktop/electron/karna-adapter.cjs` | 故事圣经请求可读取。 |
| P1 | Soul 新建弹窗文案中文化 | `apps/desktop/src/app/karna-workshop/soul.tsx` | “创建 Soul 节点”可见。 |
| P0 | 浏览器桥接返回 `{ fields: {} }`，不再让设置页无限加载 | `apps/desktop/src/dev/karna-browser-bridge.ts` | 设置页不再停在加载态。 |
| P0 | 浏览器桥接补齐模型信息/选项、辅助模型、MoA、模型切换响应 | `apps/desktop/src/dev/karna-browser-bridge.ts` | 设置 → 模型无 Error Boundary，Console 0 error。 |
| P0 | Electron Writer OS 冒烟改用统一 `/os/{module}` 路由及正确的 `benchmark` 模块名 | `apps/desktop/scripts/writer-os-electron-smoke.cjs` | Electron IPC 验证全绿。 |

## 5. 按重要度与价值排序的待办（35 项）

| # | 优先级 | 领域 | 待办与验收标准 | 价值 |
|---:|---|---|---|---|
| 1 | P0 | API 契约 | ✅ 已完成：建立共享 `writer-os-api-contract.json`，浏览器桥接、Writer UI 与 Electron adapter 共用模块清单；8 个契约测试断言路径、别名和响应形状。 | 防止“设置无限加载 / Router 崩溃”类失配复发。 |
| 2 | P0 | E2E | ✅ 已完成：Tool Router 覆盖“缺失 tools、0 连接器、正常研究路由”三种自动化回归。 | 已发生真实崩溃，必须永久防回归。 |
| 3 | P0 | E2E | ✅ 已完成：Writer OS 本地/IPC 冒烟加入 `test:writer-os`，并接入 GitHub Actions 的 desktop contracts and smoke job。 | 防止测试脚本自己调用过期 API。 |
| 4 | P0 | 路由 | ✅ 已完成：Electron IPC 冒烟校验 `bible/wiki/graph/state/critic/memory/search` 别名；同时修复 graph GET 传入错误参数导致的真实错误。 | 减少 UI 名称升级导致的 404/空页面。 |
| 5 | P1 | 首次使用 | ✅ 已完成：浏览器开发态状态栏改为“浏览器演示”，展开后明确说明本地预览、真实网关配置入口和运行边界；桌面真实网关状态保持不变。证据：`todo-05-browser-demo-menu.png`。 | 降低首次启动的失败感。 |
| 6 | P1 | 性能 | ✅ 已完成：Tabler 图标改为直连模块，移除 6,149 re-export 构建警告；启用既有工作坊 lazy route 分包，并把 Shiki/Mermaid 聚合为延迟块。初始 renderer 从 28.3 MB 降至 3.28 MB，`assert-renderer-budget.cjs` 强制 4 MB 预算。 | 当前 28.3 MB 主包直接伤害启动速度。 |
| 7 | P1 | 架构 | 将 334 KB 的 `karna-adapter.cjs` 拆为 router、Writer OS service、connector service、config service。 | 降低高风险改动和审查成本。 |
| 8 | P1 | 架构 | 将 292 KB 的 `electron/main.cjs` 拆成窗口、启动、IPC、路由安全、更新模块。 | 让桌面生命周期可测试可维护。 |
| 9 | P1 | 测试 | 增加所有左侧主入口的 route-level screenshot + console-error 回归：首页、技能、流程、Writer、Soul、MCP、产物、设置。 | 覆盖用户真实点击路径。 |
| 10 | P1 | 品牌 | 把根 `README.md` 与 `README.zh-CN.md` 改为 Karna-first；Hermes 仅作为运行时/上游实现说明。 | 当前外部第一印象仍是 Hermes。 |
| 11 | P1 | 工程卫生 | 制定 `karna-data`、`output/playwright`、日志、交付 zip 的忽略/样例/清理策略。 | 当前数据目录约 486 MB，且大量派生文件未跟踪。 |
| 12 | P1 | 发布 | 构建前增加 dirty-tree 和生成物白名单检查，产物写入可追溯 build metadata。 | 现有构建明确警告“DIRTY”，发布不可复现。 |
| 13 | P1 | 数据 | 为本地向量库/知识库增加项目级删除、导出、保留期和空间用量界面。 | 长篇创作资料涉及隐私、版权与磁盘增长。 |
| 14 | P1 | 凭据安全 | 在连接器、工具集、模型密钥界面显示保存位置、掩码、删除和权限风险说明。 | 用户需要知道 API Key 与高危权限的边界。 |
| 15 | P1 | CI | CI 至少运行 typecheck、严格 lint、build、Writer OS 本地/IPC 烟测、路由 E2E。 | 当前可靠性依赖人工临时运行。 |
| 16 | P1 | 可观测性 | 为 Electron IPC 请求生成 request id、模块、耗时、失败原因，并在“打开日志”中可过滤。 | 当前问题需要借助开发者日志定位。 |
| 17 | P1 | 连接器 | 建立 optional MCP manifest：id、版本、来源、权限、依赖、健康检查、弃用状态。 | 76 个可选 MCP 目前缺少清晰的治理面。 |
| 18 | P1 | 目录规范 | 编写 `docs/architecture/desktop-runtime.md`，画出 Renderer → preload → IPC → adapter → Python/数据路径图。 | 新成员不必从两个巨型 CJS 反推系统。 |
| 19 | P2 | UX | 让右栏项目上下文与 Writer 已打开项目同步，不再同时出现“未打开项目”。 | 消除用户对当前作品归属的困惑。 |
| 20 | P2 | Writer OS | 作品工坊空状态增加“打开已有项目、导入资料、运行示例”三条 CTA。 | 将后台能力变成可发现流程。 |
| 21 | P2 | 产物 | 开发桥接提供真实样例产物，或明确显示“浏览器演示模式”；Electron 显示 Writer 交付物索引。 | 当前产物页 0 项削弱端到端闭环。 |
| 22 | P2 | 流程工坊 | “调试”按钮必须显示调试状态、节点高亮、日志/输入输出或明确禁用理由。 | 目前点击几乎没有可感知反馈。 |
| 23 | P2 | 流程工坊 | 为运行、取消、失败重试、人工确认、归档回滚写端到端测试。 | 多 Agent 是差异化卖点，不能只停在画布。 |
| 24 | P2 | Soul | 统一“灵魂/Soul/作者节点/风格包”术语，提供第一次创建作者/导入样本教程。 | 中文创作者理解成本更低。 |
| 25 | P2 | Soul | 对网络检索来源、引用、版权和失败降级显示可解释状态。 | 风格研究需要可信来源链。 |
| 26 | P2 | MCP | 在 MCP 工坊醒目标记“浏览器演示 3 个连接器”和“桌面真实连接器”差异。 | 防止演示数据被误认为真实安装结果。 |
| 27 | P2 | MCP | 审计日志支持时间/项目/工具/失败筛选、详情和导出。 | 便于追踪外部工具调用与安全审计。 |
| 28 | P2 | 技能 | 增加技能/工具的来源、权限、依赖、最近调用、安装/卸载与搜索无结果引导。 | 从“开关列表”升级为可管理能力库。 |
| 29 | P2 | 文案 | 清理用户可见的 Hermes、英文配置导出名 `hermes-config.json` 等遗留命名。 | 品牌一致性和可信度。 |
| 30 | P2 | i18n | 建立 UTF-8/替换字符/未翻译 key 扫描，避免终端显示乱码被误判或真实文本损坏。 | 中文桌面产品需要稳定本地化质量。 |
| 31 | P2 | 代码规范 | 收紧全局 ESLint 抑制；对 hook dependency、空 catch、`any` 采用局部注释和测试。 | 避免“过 lint 但埋状态失效”。 |
| 32 | P2 | 可访问性 | 审计所有模态框的焦点环、Esc、Tab 循环、屏幕阅读器名称和色彩对比。 | 工坊画布和密钥页均是高复杂交互。 |
| 33 | P2 | 响应式 | 为 1280、1024、768 宽度的侧栏、流程画布、设置双栏做视觉回归。 | 当前 UI 信息密度高，笔记本环境最易溢出。 |
| 34 | P3 | 文档 | 将 `.plans` 中仍以 Hermes 为主体的 API/流式计划标注“上游计划/已迁移/不适用”。 | 减少团队把旧计划当 Karna 当前路线图。 |
| 35 | P3 | 产品度量 | 定义“项目完成率、资料导入成功率、工作流成功率、人工确认耗时、交付成功率”埋点。 | 为后续产品优先级提供真实数据。 |

## 6. 建议的执行顺序

**第一周（阻断稳定性）**：#1、#2、#3、#4、#5、#9、#15。先把浏览器演示、Electron 实机与 CI 收敛为同一套接口证据。

**第二周（性能与工程可维护性）**：#6、#7、#8、#11、#12、#16、#17、#18。

**第三周（可用性与品牌落地）**：#10、#13、#14、#19 至 #30。

## 7. 本轮修改文件

- `apps/desktop/src/dev/karna-browser-bridge.ts`：补齐设置和模型开发态契约。
- `apps/desktop/scripts/writer-os-electron-smoke.cjs`：改为当前统一 Writer OS 路由。
- 以及本报告：`docs/audits/KARNA_DEEP_AUDIT_2026-07-10.md`。

本报告不建议在未清理现有大规模 dirty worktree 前直接发布；应先将数据/构建产物与源码变更拆分提交，再以 CI 结果作为发布依据。
