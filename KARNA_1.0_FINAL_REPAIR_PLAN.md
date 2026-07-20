# Karna 1.0 正式版：系统性修复、联通、验收与发布计划

> 文档性质：给执行修复的 AI 使用的工程执行书。  
> 执行模式：每个批次一次完成 1～3 个问题；不得只改按钮、只改前端或只添加测试。每个批次必须同时检查 UI、IPC、适配器、运行时、数据文件和打包入口。  
> 目标：发布一个可干净安装、可启动、可配置模型、可保存项目数据、可检测更新、可回滚且可验证的 Karna 正式版。  
> 仓库：`D:\Agent\projects\karna-hermes`  
> 公开发行仓库：`https://github.com/coca-koala4/karna-desktop`  
> 私有源码仓库：`https://github.com/coca-koala4/karna-desktop-source`

---

## 0. 执行纪律（所有批次必须遵守）

### 0.1 不得把“按钮存在”当成功

每个功能必须证明完整链路：

```text
用户点击
  → React 状态变化
  → preload 暴露接口
  → IPC handler
  → 主进程/适配器路由
  → 后端或本地数据服务
  → 文件/数据库持久化
  → 返回结果
  → UI 显示成功、失败或进行中状态
```

如果某一层尚未实现，必须在同一批次内补齐，或者删除该按钮并改成明确的“规划中”。禁止返回假成功、空数组伪装成功或固定版本号。

### 0.2 每批次交付格式

执行 AI 每完成一个批次，必须输出：

1. 本批次处理的问题编号。
2. 实际修改的文件和关键函数。
3. 修改前后接口契约。
4. 单元测试结果。
5. Electron 真机/打包环境验证结果。
6. 截图路径和截图说明。
7. 尚未解决的风险。
8. `git diff --stat`、`git status --short` 和版本号。

### 0.3 禁止行为

- 不得读取、迁移或打包测试机器的对话、项目、Soul、API Key、模型配置。
- 不得从 `%APPDATA%`、`%LOCALAPPDATA%`、开发机 `.env` 或浏览器登录状态自动导入模型凭据。
- 不得在没有干净提交的情况下生成正式安装器。
- 不得用 mock、demo、固定空数组、固定 `0.1.0` 或“返回 ok 但不执行”冒充正式功能。
- 不得把 Hermes 字样、旧接口命名、旧品牌资源留在正式用户可见路径中。
- 不得把“代码通过”当作验收完成；必须操作窗口、点击、滚轮、创建项目、配置模型、运行工作流、重启、升级并截图。

### 0.4 正式版本号策略

用户可见产品名称为 **Karna 1.0**。为了让已经安装 `1.0.3`、`1.0.4`、`1.0.9`、`1.1.2`、`1.1.4`、`1.1.6` 的用户能够升级，技术版本不得重新降到 `1.0.0`，否则 `electron-updater` 会认为新版本更低而拒绝更新。

采用以下方案：

- `productName`: `Karna`
- `displayReleaseName`: `Karna 1.0 正式版`
- `package.json.version`: `2.0.0`
- Git tag：`v2.0.0`
- GitHub Release 标题：`Karna 1.0 正式版（技术版本 2.0.0）`
- 设置页同时显示：`Karna 1.0 · 2.0.0`

如果产品必须把技术版本也写成 `1.0.0`，则必须额外实现更新器的 legacy-version migration，并在旧版本中允许从 `1.1.x` 迁移到 `1.0.0`；否则不得采用降版本方案。

---

## 1. 当前审计基线与发布阻断项

执行 AI 在修改前必须保存以下只读证据：

```powershell
Set-Location D:\Agent\projects\karna-hermes
git status --short
git describe --tags --always --dirty
(Get-Content apps/desktop/package.json -Raw | ConvertFrom-Json).version
Get-Content apps/desktop/build/install-stamp.json
Get-Content apps/desktop/release2/latest.yml
git ls-remote --tags origin
git ls-remote --tags public-release
```

当前已知阻断项：

1. package.json、Git tag、本地 Release 目录和公开标签不一致。
2. 工作树 dirty，且有未跟踪测试脚本和构建目录。
3. `install-stamp.json` 标记 dirty build。
4. 适配器仍存在 mock、not-configured 和固定空响应。
5. MCP 图标引用目录不存在。
6. 作品工坊接口和适配器路由不完整。
7. Writer OS 核心 JSON 只创建路径指针，不创建真实数据文件。
8. 项目目录扫描不能稳定识别“输出”“正文”等中文目录。
9. 复杂工作流的控制节点、循环、人工确认和前端运行状态未完成端到端证明。
10. Hermes IPC、环境变量、运行时目录和文本残留未清理。

任何一项未关闭，都不得创建 `v2.0.0` Release。

---

# 2. 分批修复清单

每个批次只处理 1～3 个编号，但必须一次把该问题的全链路完成。下面每个问题都写明：问题、原因、解决方案、具体文件、验收方法。

## 批次 A：版本、提交和正式发行基线

### 问题 1：版本号、Git 提交和 Release 资产错位

**问题**：package.json、Git tag、`latest.yml`、安装器和运行时版本互相不一致，更新器无法判断真实版本。

**原因**：本地工作树在 dirty 状态下构建；旧 `release2` 资产未清理；公开仓库多个标签指向同一提交。

**修改文件**：

- `apps/desktop/package.json`
- `apps/desktop/build/install-stamp.json` 生成逻辑
- `apps/desktop/scripts/write-build-stamp.cjs`
- `apps/desktop/scripts/assert-release-inputs.cjs`
- `apps/desktop/scripts/run-electron-builder.cjs`
- `.github/workflows/release.yml`

**解决方案**：

1. 将技术版本统一为 `2.0.0`，产品显示为 `Karna 1.0 正式版`。
2. 构建 stamp 必须记录 commit、tag、dirty=false、runtimeVersion=2.0.0。
3. dirty tree 直接失败，不能使用 `allowDirtyBuilds: true`。
4. 构建前删除所有旧 Release 输出目录，但不得删除用户数据。
5. CI 只允许从 tag `v2.0.0` 构建。
6. 构建结束后验证安装器文件名、`latest.yml`、blockmap、SHA256 和 manifest 全部为 2.0.0。

**验收**：在干净 clone 中运行构建；`git status` 只允许构建白名单目录；stamp 的 dirty 必须为 false；所有版本字段完全一致。

### 问题 2：旧失败 Release 未撤下，更新器可能指向错误资产

**问题**：旧版本仍可能被用户下载，用户无法区分失败验收版和正式版。

**原因**：没有统一 Release 清理脚本和发布前检查。

**修改文件**：

- `.github/workflows/release.yml`
- `scripts/release/publish-release.ps1`（新建）
- `scripts/release/verify-github-release.ps1`（新建）
- `README.md`
- `README.en.md`

**解决方案**：

1. 将旧 `1.0.x`、`1.1.x` 失败 Release 标记为撤下或删除。
2. 旧版本不再作为 `latest`、stable 或自动更新候选。
3. 公开下载链接只使用 GitHub Release 的 2.0.0 资产。
4. CI 发布后调用 GitHub API 验证 Release 不是 draft、不是 prerelease、存在 exe、latest.yml、blockmap、SHA256、manifest。
5. 所有下载链接由 Release 元数据生成，禁止硬编码旧版本。

**验收**：匿名浏览器打开 Releases 页面；只显示正式版；点击下载链接能拿到正确安装器；设置页“检查更新”返回 2.0.0。

### 问题 3：公开仓库和私有源码仓库边界不可信

**问题**：公开仓库或历史提交可能包含源码、测试、内部设计、绝对路径和用户数据。

**原因**：没有从干净导出目录重新初始化公开仓库，也没有历史和资产双重扫描。

**修改文件**：

- `scripts/release/build-public-repository.ps1`（新建）
- `scripts/release/scan-public-repository.ps1`（新建）
- `.gitignore`
- `.github/workflows/public-release.yml`

**解决方案**：

1. 完整源码只留在私有仓库。
2. 公开仓库只允许 README、许可证、安全说明、第三方声明和 Release 资产。
3. 扫描当前树、Git 历史、ASAR、offline-runtime 和安装器。
4. 扫描 API Key、私钥、高熵 token、`D:\Agent`、`karna-data`、对话、项目、Soul、测试路径和 Hermes 品牌。
5. 发现真实凭据时先吊销，再重建历史，不能只删除工作树文件。

**验收**：脚本输出允许文件清单；任何额外源码或敏感内容都使 CI 失败。

---

## 批次 B：启动、离线运行时和安装器

### 问题 4：首次启动仍存在 Hermes runtime/旧 bootstrap 路径

**问题**：运行时路径中仍叫 `hermes-agent`，启动逻辑仍保留旧 Hermes 家目录和安装脚本回退。

**原因**：桌面重命名只做了显示层，运行时、环境变量和启动器没有真正切换。

**修改文件**：

- `apps/desktop/electron/main.cjs`
- `apps/desktop/electron/bootstrap-runner.cjs`
- `apps/desktop/electron/karna-runtime-home.cjs`
- `apps/desktop/electron/karna-user-data.cjs`
- `apps/desktop/scripts/prepare-offline-runtime.cjs`
- `apps/desktop/scripts/stage-offline-runtime.cjs`

**解决方案**：

1. 运行时目录统一为 `runtime/versions/2.0.0/karna-runtime`。
2. 移除 git clone、ZIP 下载和在线 install.ps1 回退。
3. 只从安装包内读取 runtime manifest。
4. 缺少运行时直接显示可操作的安装损坏提示，不启动 mock。
5. 旧 Hermes 目录只用于一次性显式迁移，迁移完成后不再读取。
6. 所有环境变量改为 `KARNA_*`，保留旧变量仅用于迁移且不得自动带入模型凭据。

**验收**：断网安装、断网启动；不会访问 GitHub；不会创建 Hermes 目录；运行时路径与安装目录一致。

### 问题 5：离线 runtime 白名单不严格

**问题**：运行时仍含 `pythonwin/Demos` 等不必要开发资源，并保留 Hermes 路径。

**修改文件**：

- `apps/desktop/scripts/offline-runtime-filter.cjs`
- `apps/desktop/scripts/stage-offline-runtime.cjs`
- `apps/desktop/scripts/verify-release-contents.cjs`

**解决方案**：

1. 使用严格允许列表，不再使用宽松拒绝列表。
2. 仅允许 Python 启动所需模块、依赖、内置 Skill、插件、MCP 和两套工作流。
3. 排除 demos、examples、tests、docs、网站、缓存、日志、源码地图、`.git`、`.venv`、用户项目和模型配置。
4. manifest 记录每个文件 SHA256、来源和许可证。

**验收**：解包 runtime 后逐文件比对白名单；发现一个未允许文件即失败。

### 问题 6：安装目录不可写时仍可能失败或回退

**问题**：安装到受保护目录、旧目录或非管理员目录后，runtime 写入失败。

**修改文件**：

- `apps/desktop/assets/installer.nsh`
- `apps/desktop/electron/karna/paths.cjs`
- `apps/desktop/electron/main.cjs`
- `apps/desktop/electron/karna-runtime-home.cjs`

**解决方案**：

1. 安装页先执行写入测试。
2. 失败时阻止继续安装，不回退到 C 盘。
3. 运行时目录跟随 `$INSTDIR`。
4. 写入权限只授予当前安装用户。
5. 更新时使用临时目录、校验、原子 rename，不覆盖用户数据。

**验收**：分别安装到 D 盘普通目录、Program Files、只读目录；错误必须明确，不能偷偷写 `%LOCALAPPDATA%`。

### 问题 7：安装器和卸载器文本乱码、卸载选项未验证

**修改文件**：

- `apps/desktop/assets/installer.nsh`
- `apps/desktop/assets/migrate-user-data.ps1`
- `apps/desktop/electron/desktop-uninstall.cjs`

**解决方案**：

1. 将 NSIS 文本改为 UTF-8 可显示中文。
2. 验证安装位置、工作空间、自启动、桌面快捷方式四个选项真正写入配置。
3. 卸载页验证“卸载插件”和“卸载用户数据”复选框实际执行。
4. 默认不删除用户数据和工作空间。
5. 升级时不执行卸载清理逻辑。

**验收**：干净用户和已有用户各执行一次安装、升级、卸载，截图保存每个页面和最终文件状态。

---

## 批次 C：模型供应商、凭据和首次授权

### 问题 8：模型供应商自动探测旧环境变量

**问题**：`ensureCurrentConfiguredProvider()` 会自动选择第一个已配置供应商，可能导致新用户继承 DeepSeek、Copilot 或旧 `.env`。

**修改文件**：

- `apps/desktop/electron/karna-adapter.cjs`
- `apps/desktop/electron/karna/model-service.cjs`
- `apps/desktop/electron/model-credential-store.cjs`
- `apps/desktop/src/app/settings/model-settings.tsx`
- `apps/desktop/src/components/onboarding/index.tsx`

**解决方案**：

1. 初始状态固定为 `provider: unconfigured`、`model: null`、`authorized: false`。
2. 新安装不得读取系统模型环境变量、旧 Hermes 配置、浏览器 OAuth 或 Copilot 登录。
3. 只有用户在设置页主动选择供应商、输入 Key、点击保存并完成连通性测试，才写入授权状态。
4. 凭据写入 Windows Credential Manager；普通设置只写 credential reference。
5. 旧数据迁移必须备份、逐项提示和允许跳过。

**验收**：机器预先设置 DeepSeek API Key、Copilot 登录和旧 `.env`；干净安装后发送按钮、工作流运行和提示词增强必须锁定。

### 问题 9：提示词增强和普通对话使用不同模型选择链

**修改文件**：

- `apps/desktop/electron/karna-adapter.cjs`
- `apps/desktop/src/app/karna-workshop/index.tsx`
- `apps/desktop/src/app/chat/composer/index.tsx`
- `apps/desktop/src/app/settings/model-settings.tsx`

**解决方案**：

1. 所有模型调用统一调用 `resolveAuthorizedModel()`。
2. 未授权时返回统一错误码 `provider_setup_required`，不要只返回文字。
3. 已配置 DeepSeek 时，提示词增强必须使用当前已验证的 provider/model。
4. UI 显示供应商、模型、连通性时间和失败原因。
5. 不允许“设置页显示已连接、增强接口却找不到模型”的状态分裂。

**验收**：DeepSeek 正常、错误 Key、网络断开、模型不存在四种场景分别测试并截图。

### 问题 10：模型配置升级后丢失或重复要求配置

**修改文件**：

- `apps/desktop/electron/karna/paths.cjs`
- `apps/desktop/electron/model-credential-store.cjs`
- `apps/desktop/electron/main.cjs`
- `apps/desktop/electron/karna-adapter.cjs`
- `apps/desktop/electron/migrations/*`（新建）

**解决方案**：

1. 将模型配置拆成版本化 `model-config.json` 和 Credential Manager 引用。
2. 更新前备份，更新后先迁移再启动 gateway。
3. 同一用户、同一安装目录和不同安装目录都使用稳定的 userData 位置。
4. 迁移完成写入 marker，重复启动不得重复询问。
5. 迁移失败时保留旧配置并提供恢复，不清空用户数据。

**验收**：从每个旧版本升级；检查 API Key 不丢、设置不重置、项目和对话不丢。

---

## 批次 D：API 适配器和插件/Skill 平台

### 问题 11：适配器 mock 和固定空响应覆盖真实错误

**修改文件**：

- `apps/desktop/electron/karna-adapter.cjs`
- `apps/desktop/electron/karna-backend-client.cjs`（新建）
- `apps/desktop/src/lib/api-error.ts`（新建）

**解决方案**：

1. 正式包删除 session search、status、updates、audio、action 的假成功响应。
2. 后端未启动时统一返回结构化错误：`code`、`message`、`retryable`、`request_id`。
3. mock 只允许在明确的浏览器预览模式中存在，且不能进入 Electron 正式包。
4. `/api/status` 使用真实 app version、runtime version、gateway state。

**验收**：断开 gateway、断网、损坏 runtime 时，UI 显示明确错误而不是空列表或“成功”。

### 问题 12：插件接口只实现列表，没有实现管理动作

**修改文件**：

- `apps/desktop/electron/karna-adapter.cjs`
- `apps/desktop/src/lib/karna-plugins.ts`
- `apps/desktop/src/app/skills-tools/*`
- `apps/desktop/electron/karna/plugins-service.cjs`（新建）

**解决方案**：

1. 建立插件服务：list、detail、preflight、install、confirm、job status、enable、permissions、update、rollback。
2. 所有动作使用 job 状态机：queued、running、completed、failed、rolled_back。
3. 插件目录只允许发行 manifest 白名单字段。
4. 插件安装使用临时目录、SHA256 校验、权限确认和原子替换。
5. UI 展示真实进度、日志、失败原因和回滚入口。

**验收**：安装、启用、禁用、更新、回滚各执行一次；重新启动后状态保持。

### 问题 13：Skill 目录、Skill 包、官方 Skill 和外置 Skill 未统一

**修改文件**：

- `apps/desktop/electron/karna/skills-service.cjs`
- `apps/desktop/electron/karna-adapter.cjs`
- `apps/desktop/src/lib/karna-plugins.ts`
- `apps/desktop/src/app/skills-tools/*`
- `apps/desktop/scripts/stage-skill-marketplace.cjs`

**解决方案**：

1. 统一返回 `id`、`name_zh`、`description_zh`、`source_pack`、`is_builtin`、`installed`、`enabled`、`risk_level`、`sha256`。
2. 发行包内置官方 Skill 与外置 Skill 市场分离展示。
3. 外置 Skill 默认不执行，必须逐项安装和启用。
4. 清理空描述、`>-`、`|`、英文主标题和高风险未审核内容。
5. 至少 30 个官方内置 Skill 必须有可读取的 SKILL.md 和中文描述。

**验收**：所有 Skill 列表数量、官方 Skill、安装状态、启用状态、风险提示和重启持久化全部验证。

### 问题 14：高风险外置 Skill 未建立供应链门禁

**修改文件**：

- `apps/desktop/scripts/stage-skill-marketplace.cjs`
- `apps/desktop/scripts/verify-release-contents.cjs`
- `apps/desktop/electron/karna/skills-service.cjs`

**解决方案**：

1. 对每个外置 Skill 记录来源仓库、许可证、提交、SHA256、审核人和风险等级。
2. 默认排除未审核安全攻击类、绕过类和横向移动类 Skill。
3. 高风险 Skill 只能作为开发者可选下载，不进入普通用户默认目录。
4. Skill 执行必须继承权限模式和项目范围，不能自行扩大权限。

**验收**：解包安装器确认高风险内容不在默认内置目录；安装时显示风险和权限。

---

## 批次 E：MCP 工坊、工具中文化和头像

### 问题 15：MCP 目录前端和后端使用两套来源

**修改文件**：

- `apps/desktop/src/app/karna-workshop/built-in-mcps.ts`
- `apps/desktop/electron/karna/connector-catalog.cjs`（新建）
- `apps/desktop/electron/karna-adapter.cjs`
- `apps/desktop/src/app/karna-workshop/connector-workshop.tsx`

**解决方案**：

1. 生成一个版本化 `connector-catalog.json`。
2. UI、适配器、聊天资源选择器和工作流资源面板全部读取同一清单。
3. 清单字段统一包括官方名称、中文名、文档、授权方式、连接方式、工具列表、状态、图标来源和哈希。
4. 不存在真实连接方式的条目从“可用”改为“规划中”或删除。

**验收**：MCP 工坊、聊天资源选择器、工作流节点资源选择器显示同样数量和同样状态。

### 问题 16：MCP 头像引用不存在的资源

**修改文件**：

- `apps/desktop/src/app/karna-workshop/connector-icons/mcp/*`
- `apps/desktop/src/app/karna-workshop/built-in-mcps.ts`
- `apps/desktop/scripts/check-mcp-icon-catalog.cjs`
- `apps/desktop/scripts/verify-release-contents.cjs`

**解决方案**：

1. 逐项获取官方允许再分发的本地头像。
2. 不允许 Clearbit 热链、emoji 或远程 URL。
3. 官方无可再分发图标时使用本地统一 Karna 连接器图标，并记录 `generic=true`。
4. 构建前逐项检查文件存在、格式、尺寸、SHA256。
5. React 图片加载失败必须回退到本地中性图标，不显示浏览器坏图。

**验收**：断网打开 MCP 工坊，所有头像都能显示；随机删除一张图时构建必须失败。

### 问题 17：工具名称和工具描述未完成中文展示层

**修改文件**：

- `apps/desktop/src/app/karna-workshop/built-in-mcps.ts`
- `apps/desktop/src/app/karna-workshop/connector-workshop.tsx`
- `apps/desktop/src/app/chat/composer/index.tsx`
- `apps/desktop/src/app/agent-flow/node-inspector-schema-renderer.tsx`
- `apps/desktop/src/i18n/zh.ts`

**解决方案**：

1. 技术 ID 保留为小字，例如 `create_doc`。
2. 主标题使用中文，例如“创建文档”。
3. 每个工具必须有中文名称、中文描述、参数中文说明和风险等级。
4. 缺失翻译在构建阶段失败，不得退回英文。

**验收**：MCP 卡片、工具详情、聊天选择器、工作流节点配置四处截图检查。

---

## 批次 F：Writer OS 项目文件、作品工坊和记忆

### 问题 18：项目创建只创建目录，不创建核心数据文件

**修改文件**：

- `apps/desktop/electron/karna-adapter.cjs`
- `apps/desktop/electron/writer-os/project-bootstrap.cjs`（新建）
- `apps/desktop/electron/writer-os/data-model-utils.cjs`

**解决方案**：

首次创建项目必须原子写入：

- `project_schema.json`
- `project_memory.json`
- `bible/bible.json`
- `bible/story_bible.json`
- `identity/creative_identity.json`
- `memory/creative_memory.json`
- `narrative-state/narrative_state.json`
- `documents/documents.json`
- `documents/creative_search.json`
- `graph/knowledge_graph.json`
- `versions/versions.json`
- `task_system.json`
- `writer_agents.json`
- `workflow_agents.json`
- `workflows.json`
- `workflow_runs.json`

每个文件必须有 schemaVersion、project_id、updated_at、空数组或空对象的合法初始值。

**验收**：新建项目后立即关闭应用，重新打开文件夹检查所有文件存在且 JSON 可解析。

### 问题 19：中文“输出/正文”目录没有稳定索引

**修改文件**：

- `apps/desktop/electron/karna-adapter.cjs`
- `apps/desktop/electron/writer-os/document-indexer.cjs`（新建）
- `apps/desktop/src/app/karna-workshop/writer.tsx`

**解决方案**：

1. 建立目录别名表：正文、输出、章节、书稿、manuscript、output、chapters。
2. 文档索引按真实相对路径扫描，不依赖乱码字符串。
3. 每次打开作品工坊先执行轻量增量索引。
4. 检测到未同步 Markdown 时显示文件数、差异和“点击同步”。
5. 同步只更新索引和派生 JSON，不覆盖原 Markdown。

**验收**：准备 4 个 Markdown 文件，打开作品工坊出现未同步提示；点击同步后正文、章节数、修改时间和文件列表正确显示。

### 问题 20：文件变更不会写回作品工坊、记忆和知识图谱

**修改文件**：

- `apps/desktop/electron/writer-os/document-indexer.cjs`
- `apps/desktop/electron/writer-os/memory-artifacts.cjs`
- `apps/desktop/electron/writer-os/narrative-utils.cjs`
- `apps/desktop/electron/karna-adapter.cjs`

**解决方案**：

1. Markdown 变化生成 document record、章节节点、叙事状态候选和记忆候选。
2. 候选先进入 review queue，用户确认后写入 canonical JSON。
3. 每次写回记录 source file、hash、时间和触发原因。
4. 不覆盖用户原文，不删除用户文件。

**验收**：修改章节后重开作品工坊，看到索引、叙事状态、记忆候选和版本记录均有变化。

### 问题 21：task_system 和 writer_agents 为空

**修改文件**：

- `apps/desktop/electron/karna-adapter.cjs`
- `apps/desktop/electron/writer-os/task-system.cjs`（新建）
- `apps/desktop/electron/writer-os/agent-registry.cjs`（新建）

**解决方案**：

1. 移除 `legacyProjectAgents === true` 才生成任务的旧门槛。
2. 新建长篇项目默认写入最小 Agent 集合和任务模板。
3. 项目目标为空时也写入待确认任务，而不是空文件。
4. 任务状态包含 pending、running、blocked、done、failed，并保存错误原因。
5. Agent session 绑定使用项目 ID、workspace ID 和 session ID 三重校验。

**验收**：新建两个项目，两个项目的 Agent、任务和 session ID 不相同；关闭重开后仍能恢复。

### 问题 22：项目关闭重开后会话和项目绑定丢失

**修改文件**：

- `apps/desktop/electron/karna-adapter.cjs`
- `apps/desktop/electron/writer-os/project-session-migration.cjs`（新建）
- `apps/desktop/src/app/writer-ide/project-context.tsx`
- `apps/desktop/src/app/writer-ide/project-agent-panel.tsx`

**解决方案**：

1. 启动时加载 sessions index，再加载项目，最后执行绑定修复。
2. 通过 workspace path 识别 orphan session，提供安全重新绑定。
3. IDE 显示 controller、agent 和普通项目会话，支持选择已有会话继续提问。
4. 新建会话与恢复会话使用同一套状态更新函数。

**验收**：已有项目包含普通会话、主控会话和 Agent 会话；重启后逐个打开并发送消息，不能被强制跳转到新会话。

---

## 批次 G：多智能体工作流

### 问题 23：复杂工作流点击后崩溃

**修改文件**：

- `apps/desktop/src/app/agent-flow/store.tsx`
- `apps/desktop/src/app/agent-flow/flow-canvas.tsx`
- `apps/desktop/src/app/agent-flow/flow-run-panel.tsx`
- `apps/desktop/electron/writer-os/workflow-validation.cjs`
- `apps/desktop/electron/karna-adapter.cjs`
- `karna-builtin/workflows/critic-revision.json`

**解决方案**：

1. 内置工作流只从版本化 JSON 加载，删除 `createWorkflowTemplate()` 的第二来源。
2. 加载时先迁移、再校验、再渲染；校验失败显示节点和边错误，不得让 React 崩溃。
3. loop 边不参与普通拓扑排序。
4. condition、human_confirm、loop_controller 都使用统一 Node Runtime Contract。
5. 每个控制节点必须有默认配置、超时、取消和错误出口。
6. 运行前检查模型授权、项目绑定、输入文本和输出目录。
7. 运行状态写入 `workflow_runs.json`，崩溃时保存 failed 状态和堆栈摘要。

**验收**：简单流程和复杂流程各加载 10 次；复杂流程运行、暂停、人工确认、循环上限、取消、失败重试分别截图。

### 问题 24：工作流模板、Agent 模板和运行器字段不一致

**修改文件**：

- `karna-builtin/workflows/*.json`
- `karna-builtin/workflows/manifest.json`
- `apps/desktop/electron/writer-os/workflow-schema.cjs`（新建）
- `apps/desktop/electron/writer-os/workflow-store.cjs`
- `apps/desktop/src/app/agent-flow/store.tsx`

**解决方案**：

1. 定义唯一 schema：node type、node data、edge type、loop condition、agent reference、artifact output。
2. 构建阶段验证两套内置工作流的每个节点、边、Agent 和输出目标。
3. 禁止未知节点静默跳过。
4. 运行器和前端共用 schema 生成的 TypeScript 类型和 JSON Schema。

**验收**：任意删除节点字段、改错边、改错 loop 上限都能在保存或构建阶段给出明确错误。

### 问题 25：工作流结果没有进入 Writer OS

**修改文件**：

- `apps/desktop/electron/karna-adapter.cjs`
- `apps/desktop/electron/writer-os/memory-artifacts.cjs`
- `apps/desktop/electron/writer-os/command-center.cjs`

**解决方案**：

1. 每次成功运行生成 artifact、document version、task event、memory candidate、narrative candidate。
2. 最终输出按项目文档类型写入正文索引，不只显示在聊天气泡中。
3. 用户确认后才能升级为 canonical memory/story bible。
4. 失败和取消运行必须保留可查看记录。

**验收**：运行两个内置工作流后，作品工坊能看到输出、版本、运行记录和待确认记忆。

---

## 批次 H：权限、文件修改验证和旧接口清理

### 问题 26：项目内文件被“仅当前项目”权限错误阻止

**修改文件**：

- `apps/desktop/electron/karna/permission-service.cjs`
- `apps/desktop/src/components/assistant-ui/tool/permission-error-card.tsx`
- `run_agent.py`
- `apps/desktop/src/app/settings/permissions/*`

**解决方案**：

1. 将“项目文件写入”和“终端执行”分成两种能力。
2. 当前项目模式允许经过路径校验的项目内 Markdown/JSON 写入。
3. 终端、系统命令、项目外路径仍需要电脑授权或高危授权。
4. 错误提示显示被阻止的实际路径、能力和可行操作。
5. 项目内路径必须经过 realpath、符号链接和目录边界检查。

**验收**：项目内新建/修改/重命名可完成；项目外和终端命令仍正确阻止；三种权限模式分别截图。

### 问题 27：File-mutation verifier 因 old_string 多匹配而误报

**修改文件**：

- `run_agent.py`
- `apps/desktop/src/components/assistant-ui/tool/*`
- `apps/desktop/src/i18n/zh.ts`

**解决方案**：

1. old_string 多匹配时返回候选位置和上下文，而不是直接失败。
2. AI 工具层自动执行一次带上下文的重试。
3. 明确区分“文件未修改”“匹配不唯一”“权限阻止”“目标不存在”。
4. UI 显示真实修改文件、行数和 diff 摘要。
5. 禁止在失败时显示“工作完成”。

**验收**：同一旧文本出现 4 次时，测试 replace_all、精确上下文和失败提示三种场景。

### 问题 28：旧 Hermes IPC 和 API 没有废弃策略

**修改文件**：

- `apps/desktop/electron/preload.cjs`
- `apps/desktop/electron/main.cjs`
- `apps/desktop/src/global.d.ts`
- `apps/desktop/src/hermes.ts`
- `apps/desktop/src/store/*`

**解决方案**：

1. 新增 `karna:*` 命名空间。
2. 旧 `hermes:*` 只保留内部兼容映射，不出现在 UI、日志和错误提示。
3. 建立 deprecated map、调用计数和移除版本。
4. 所有新功能只允许调用 `karna:*`。
5. 构建扫描禁止新增 Hermes 可见字符串。

**验收**：运行时日志、开发者工具、设置页、错误弹窗和安装器不再出现 Hermes；兼容旧用户数据仍能迁移。

---

## 批次 I：中文化、品牌和窗口图标

### 问题 29：乱码和中英文混杂

**修改文件**：

- `apps/desktop/electron/karna-adapter.cjs`
- `apps/desktop/electron/main.cjs`
- `apps/desktop/electron/release-updater.cjs`
- `apps/desktop/electron/writer-os/*.cjs`
- `apps/desktop/src/app/**/*.tsx`
- `apps/desktop/src/i18n/zh.ts`
- `apps/desktop/assets/installer.nsh`

**解决方案**：

1. 统一所有源码为 UTF-8。
2. 所有用户可见字符串进入 i18n。
3. 运行乱码扫描：`鏂`、`椤`、`涓`、`璇`、`瀵`、`宸`、`閿` 等命中即失败。
4. 中文版禁止完整英文句子，品牌名和标准协议名除外。
5. 工具、MCP、工作流、启动页、更新页、错误页和卸载器逐路由截图验收。

**验收**：100%、125%、150% 缩放和 1366×768、1920×1080、4K 分辨率逐页检查。

### 问题 30：任务栏、Alt+Tab、托盘、EXE 和快捷方式图标不统一

**修改文件**：

- `apps/desktop/assets/icon.ico`
- `apps/desktop/electron/main.cjs`
- `apps/desktop/assets/installer.nsh`
- `apps/desktop/scripts/verify-release-contents.cjs`
- `apps/desktop/scripts/verify-windows-branding.ps1`（新建）

**解决方案**：

1. 所有窗口使用同一个多尺寸 ICO。
2. 设置 `com.karna.desktop` AppUserModelID。
3. 安装和升级重建开始菜单、桌面快捷方式并刷新 Shell 缓存。
4. PE 资源检查 EXE 内是否真的写入 Karna ICO，而不是只检查源码路径。
5. 任务栏窗口、Alt+Tab、缩略图、托盘、通知、卸载器全部检查。

**验收**：干净 Windows 用户、旧 Electron 图标缓存用户各安装/升级一次并截图。

---

## 批次 J：更新器和升级保留数据

### 问题 31：更新器状态和实际安装流程不一致

**修改文件**：

- `apps/desktop/electron/release-updater.cjs`
- `apps/desktop/electron/main.cjs`
- `apps/desktop/electron/preload.cjs`
- `apps/desktop/src/app/settings/updates.tsx`
- `apps/desktop/src/store/updates.ts`

**解决方案**：

1. 统一状态机：idle、checking、available、downloading、downloaded、installing、failed、unsupported。
2. `latest.yml` 版本、架构、SHA256 和 blockmap 必须校验。
3. 自动下载不覆盖 `%APPDATA%\\Karna` 和工作空间。
4. 下载完成后询问立即安装或稍后。
5. “稍后”不关闭写作任务；完全退出时再安装。
6. 更新失败显示真实网络、签名、哈希或资产错误。

**验收**：从旧正式版、失败版和开发版分别测试检查更新、下载、稍后、退出安装和失败重试。

### 问题 32：升级后 runtime 和桌面版本可能错配

**修改文件**：

- `apps/desktop/electron/karna-runtime-manager.cjs`（新建）
- `apps/desktop/electron/main.cjs`
- `apps/desktop/scripts/stage-offline-runtime.cjs`
- `apps/desktop/scripts/verify-release-contents.cjs`

**解决方案**：

1. 每个桌面版本绑定同版本 runtime manifest。
2. 更新时先安装新 runtime，再原子切换 active-version。
3. 启动时校验桌面版本、runtime desktopVersion、文件哈希。
4. 失败回滚旧 runtime，不覆盖用户数据。

**验收**：人为损坏一个 runtime 文件、模拟下载中断、模拟旧 runtime 残留，均能阻止错误启动并恢复。

---

# 3. 最终验收矩阵

所有修复批次完成后，不得只运行 `typecheck`。必须执行以下验收。

## 3.1 静态和契约检查

```powershell
npm --prefix apps/desktop run typecheck
npm --prefix apps/desktop run lint
npm --prefix apps/desktop run test:contracts
npm --prefix apps/desktop run test:i18n
npm --prefix apps/desktop run test:writer-os
npm --prefix apps/desktop run test:desktop:platforms
npm --prefix apps/desktop run workflow:check
```

额外执行：

- 全仓库乱码扫描。
- API 前端调用路径与适配器路由差集扫描。
- preload 类型与 IPC handler 差集扫描。
- JSON、YAML、manifest、workflow schema 解析。
- 依赖 require 闭包检查。
- 密钥、绝对路径、用户数据、测试数据扫描。
- Hermes 可见字符串扫描。
- MCP 图标存在性和 SHA256 扫描。

## 3.2 干净首装验收

在全新的 Windows 10/11 x64 用户或虚拟机执行：

1. 安装到 D 盘自定义目录。
2. 设置默认工作空间到 D 盘。
3. 分别取消和勾选自启动、桌面快捷方式。
4. 启动后确认没有旧项目、旧会话、DeepSeek、Copilot、Soul 或测试数据。
5. 未配置模型时，发送按钮和工作流运行按钮必须锁定。
6. 配置 DeepSeek 后完成连通性测试，再发送普通对话。
7. 打开插件/Skill 工坊，确认官方 Skill 数量、外置 Skill 市场和安装状态。
8. 打开 MCP 工坊，确认完整目录、头像、工具中文描述和授权状态。
9. 创建项目，检查所有 Writer OS JSON 文件。
10. 关闭并重新打开，检查项目、会话、任务、记忆和工作流。

## 3.3 项目和 Writer OS 验收

使用两个不同目录、两个不同标题、两个不同目标：

1. 创建两个长篇项目。
2. 确认人物、职业、主线、任务和 Agent 不重复复制。
3. 在“输出”和“正文”目录写入 Markdown。
4. 打开作品工坊，确认检测到未同步稿件。
5. 点击同步，确认文档、章节、叙事状态、记忆候选和图谱候选更新。
6. 修改文件，再次同步，确认只产生增量变化。
7. 运行工作流，确认结果进入作品工坊和版本记录。
8. 人工确认后，确认 canonical JSON 更新；未确认候选不能覆盖主设定。

## 3.4 工作流验收

简单工作流和复杂工作流各执行：

1. 加载。
2. 保存。
3. 运行。
4. 失败。
5. 重试。
6. 暂停。
7. 人工确认。
8. 达到循环上限。
9. 取消。
10. 重启后查看运行记录。

每个动作保存至少一张截图和对应日志 request_id。

## 3.5 更新验收

1. 安装旧验收版。
2. 配置模型并创建项目、对话和工作流。
3. 安装正式版 2.0.0。
4. 设置页检查更新必须发现 2.0.0。
5. 下载期间继续写作。
6. 选择稍后安装。
7. 完全退出后安装更新。
8. 重启检查 API 配置、项目、对话、工作空间、Skill、插件和 MCP。
9. 人为损坏下载文件，确认校验失败而不是启动损坏程序。

## 3.6 视觉和交互验收

每个正式路由至少保存：

- 首次加载截图。
- 数据加载完成截图。
- 空状态截图。
- 错误状态截图。
- 滚轮滚动截图。
- 125% 缩放截图。

重点页面：

- 首次启动/模型设置。
- 普通对话。
- IDE 已有会话选择。
- 作品工坊。
- Skill 与工具工坊。
- MCP 工坊。
- 多智能体工作流。
- 设置/更新。
- 托盘菜单。

## 3.7 发布门禁

正式发布前必须全部满足：

- Git tree clean。
- package、tag、stamp、runtime、latest.yml 同版本。
- 安装器启动无 JavaScript main-process error。
- 安装目录和 runtime 路径正确。
- 无 Hermes 可见残留。
- 无乱码。
- 无 mock 正式路由。
- 无固定空数组伪装成功。
- 无测试数据、用户数据、API Key、绝对路径。
- MCP 图标全部离线可显示。
- Skill 数量和官方 Skill 达标。
- 两个内置工作流可加载、运行、暂停、恢复和失败处理。
- 更新器能检测、下载、校验、安装并保留用户数据。
- Windows 任务栏、托盘、开始菜单、桌面快捷方式和 Alt+Tab 图标一致。

---

# 4. 正式发布步骤

1. 私有仓库合并全部修复并生成干净提交。
2. 执行全部静态、契约、Electron、Windows 虚拟机和升级验收。
3. 生成 `Karna-2.0.0-win-x64.exe`、blockmap、`latest.yml`、SHA256、release-manifest 和 release-notes。
4. 解包安装器，执行白名单和敏感信息扫描。
5. 删除或撤下旧失败 Release，禁止旧版本继续作为 latest。
6. 创建 GitHub Release `v2.0.0`，标题写 `Karna 1.0 正式版`，设置为非 draft、非 prerelease。
7. 上传全部发行资产。
8. 使用匿名下载链接验证安装器可以下载。
9. 在一台没有开发环境的 Windows 机器上安装并完成首装验收。
10. 用已安装旧版本的机器检查更新，确认升级成功。
11. 发布后保留验收证据：安装截图、更新截图、包清单、SHA256、测试日志和版本 manifest。

---

# 5. 给执行 AI 的每批次提示模板

```text
你现在只处理问题编号：X、Y、Z。

要求：
1. 先读取本计划对应的问题、原因、文件和验收标准。
2. 一次性完成这 1～3 个问题的完整链路，不要只改 React 按钮。
3. 必须检查 UI、preload、IPC、主进程、适配器、后端、持久化、迁移和打包入口。
4. 如果发现旧接口、mock、空响应或重复实现，必须在本批次处理，不能留下临时兼容分支。
5. 添加针对真实 Electron 路径的测试，不得只测浏览器 demo bridge。
6. 完成后实际启动 Karna，点击相关页面，创建真实测试项目，截图记录成功和失败状态。
7. 运行本批次相关测试、typecheck、lint 和发行扫描。
8. 输出修改文件、关键 diff、测试命令、截图路径、剩余风险和 git status。
9. 不得发布、不改变版本号、不上传 GitHub，直到所有批次和最终验收完成。
```

执行顺序建议：先 A、B、C，随后 D、E、F，再 G、H、I、J；但每个批次内部必须闭环，不得把同一问题拆成“先做按钮、以后再接后端”。

