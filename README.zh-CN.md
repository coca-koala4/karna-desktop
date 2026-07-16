<p align="center">
  <img src="apps/desktop/public/Karna.png" alt="Karna" width="180">
</p>

<h1 align="center">Karna 桌面端</h1>

<p align="center">
  面向长篇写作、研究、知识管理和多智能体生产的桌面 AI 工作空间。
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="https://github.com/123abcbjs/karna-desktop/releases/latest">版本发布</a> ·
  <a href="https://github.com/123abcbjs/karna-desktop/issues">问题反馈</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Windows-10%20%7C%2011-2563eb?style=flat-square&logo=windows" alt="Windows 10/11">
  <img src="https://img.shields.io/badge/架构-x64-6d28d9?style=flat-square" alt="x64">
  <img src="https://img.shields.io/badge/许可证-MIT-16a34a?style=flat-square" alt="MIT License">
</p>

## 下载

当前 Windows 验收版为 **Karna 0.17.2**：

**[下载 Karna Windows 安装器](https://github.com/123abcbjs/karna-desktop/releases/download/v0.17.2/Karna-0.17.2-win-x64.exe)**

当前版本为未签名 Pre-release，仅用于验收。正式稳定版发布流程在缺少 Windows 代码签名证书时会直接失败。

## Karna 是什么？

Karna 是围绕真实项目构建的桌面创作环境，而不是一组彼此割裂的聊天窗口。正文、研究资料、项目知识、多智能体、工作流、终端和交付内容都集中在同一个工作空间中。

| 区域 | 用途 |
| --- | --- |
| **Writer OS** | 长篇写作、故事圣经、叙事状态、版本、评审和交付导出。 |
| **多智能体工作坊** | 带运行状态、日志、重试、人工确认和产物交接的可视化工作流。 |
| **Soul 工作坊** | 研究作者方法并形成可复用创作档案，不与用户项目数据混装。 |
| **知识与 RAG** | 项目级资料导入、索引、检索和带来源的写作辅助。 |
| **Skills、插件与 MCP** | 内置能力、本地扩展和 `karna-writer` MCP。 |
| **本地工作台** | 感知项目的对话、终端、文件和默认工作空间管理。 |

## 默认保护用户隐私

安装包只包含应用程序和版本化内置资源，**不会**包含开发者对话、API Key、模型配置、项目、Soul、用户工作流、运行记录、日志、截图、测试产物或本地 `karna-data`。

用户内容会在 `%APPDATA%\Karna` 和安装时选择的工作空间中创建。升级会保留这两个位置；卸载默认也不会删除用户内容。

## Windows 桌面行为

- Assisted NSIS 安装器，可选择应用安装位置和默认工作空间。
- 可选开机自启动和桌面快捷方式。
- 关闭窗口后隐藏到系统托盘。
- 托盘菜单提供“显示 Karna”和“完全退出”。
- 打包版通过 GitHub Releases 和 `electron-updater` 持续更新。
- 官方模板按版本升级，用户创建或修改的工作流永不覆盖。

## 发行版内置内容

- 两个官方工作流模板：**基础写作流程**、**多评审师循环修订**。
- Karna 内置 Skills 和插件。
- `karna-writer` MCP 与连接器目录。
- 每个 Windows 版本都附带哈希化发行清单和完整包内容清单。

## 本地开发

需要 Node.js 22、Python 3.11+；构建 NSIS 安装器需要 Windows 10/11。

```powershell
git clone https://github.com/123abcbjs/karna-desktop.git
cd karna-desktop
npm ci
npm --prefix apps/desktop run dev
```

从干净工作树构建 Windows 安装器：

```powershell
npm --prefix apps/desktop run dist:win:nsis
```

关键验证命令：

```powershell
npm --prefix apps/desktop run typecheck
npm --prefix apps/desktop run test:contracts
npm --prefix apps/desktop run test:desktop:platforms
npm --prefix apps/desktop run test:writer-os
npm --prefix apps/desktop run test:desktop:nsis
```

## 仓库结构

```text
apps/desktop/          Electron 主进程与 React 桌面界面
karna-builtin/         版本化内置 Skills、插件和工作流
agent/                 Agent 运行时集成
hermes_cli/            兼容运行时与服务层
tools/                 本地工具和能力沙箱
spec/                  远程与桌面协议契约
docs/                  架构、工程和审计文档
```

## 运行时来源说明

Karna 包含从开源 Hermes Agent 项目演进而来的兼容运行时层，相关来源和许可证会继续保留。Karna 的产品身份、桌面体验、Writer OS、工作坊、工作流、发布渠道和用户数据模型均由本仓库维护。

## 许可证

MIT，详见 [LICENSE](LICENSE)。
