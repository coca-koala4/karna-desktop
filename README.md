<p align="center">
  <img src="apps/desktop/public/Karna.png" alt="Karna" width="180">
</p>

<h1 align="center">Karna Desktop</h1>

<p align="center">
  A desktop-first AI workspace for long-form writing, research, knowledge, and multi-agent production.
</p>

<p align="center">
  <a href="README.zh-CN.md">中文</a> ·
  <a href="https://github.com/123abcbjs/karna-desktop/releases/latest">Releases</a> ·
  <a href="https://github.com/123abcbjs/karna-desktop/issues">Issues</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Windows-10%20%7C%2011-2563eb?style=flat-square&logo=windows" alt="Windows 10/11">
  <img src="https://img.shields.io/badge/Architecture-x64-6d28d9?style=flat-square" alt="x64">
  <img src="https://img.shields.io/badge/License-MIT-16a34a?style=flat-square" alt="MIT License">
</p>

## Download

The current Windows acceptance build is **Karna 0.17.3**:

**[Download Karna for Windows](https://github.com/123abcbjs/karna-desktop/releases/download/v0.17.3/Karna-0.17.3-win-x64.exe)**

This is an unsigned pre-release for acceptance testing. The stable release pipeline refuses to publish without a Windows code-signing certificate.

## What is Karna?

Karna is a native desktop creation environment built around real projects rather than isolated chat sessions. It keeps manuscripts, research, project knowledge, agents, workflows, terminals, and deliverables in one workspace.

| Area | Purpose |
| --- | --- |
| **Writer OS** | Long-form writing, story bible, narrative state, versions, review, and delivery exports. |
| **Multi-agent Workshop** | Visual workflows with run state, logs, retry, human confirmation, and artifact handoff. |
| **Soul Workshop** | Research authorial methods and reusable creative profiles without mixing them into user projects. |
| **Knowledge & RAG** | Project-local ingestion, indexing, retrieval, and source-aware writing support. |
| **Skills, plugins & MCP** | Built-in capabilities plus local extensions and the `karna-writer` MCP. |
| **Local workbench** | Project-aware conversations, terminals, files, and default workspace management. |

## Privacy by default

The installer contains application code and versioned built-in resources only. It does **not** ship developer conversations, API keys, model configuration, projects, Souls, user workflows, run history, logs, screenshots, test output, or local `karna-data`.

User content is created under `%APPDATA%\Karna` and the workspace selected during installation. Updates preserve both locations, and uninstall does not delete user content by default.

## Windows behavior

- Assisted NSIS installer with a selectable application directory and default workspace.
- Optional startup launch and desktop shortcut.
- Closing the window hides Karna to the system tray.
- The tray menu provides **Show Karna** and **Quit completely**.
- Packaged builds update through GitHub Releases using `electron-updater`.
- Built-in templates are versioned; user-created or modified workflows are never overwritten.

## Built-in release content

- Two official workflow templates: **Basic Writing Flow** and **Multi-reviewer Revision Loop**.
- Karna built-in Skills and plugins.
- `karna-writer` MCP and connector catalog.
- A hashed release manifest and package inventory for every Windows release.

## Development

Requirements: Node.js 22, Python 3.11+, and Windows 10/11 for NSIS builds.

```powershell
git clone https://github.com/123abcbjs/karna-desktop.git
cd karna-desktop
npm ci
npm --prefix apps/desktop run dev
```

Build the Windows installer from a clean tree:

```powershell
npm --prefix apps/desktop run dist:win:nsis
```

Important verification commands:

```powershell
npm --prefix apps/desktop run typecheck
npm --prefix apps/desktop run test:contracts
npm --prefix apps/desktop run test:desktop:platforms
npm --prefix apps/desktop run test:writer-os
npm --prefix apps/desktop run test:desktop:nsis
```

## Repository map

```text
apps/desktop/          Electron main process and React desktop UI
karna-builtin/         Versioned built-in Skills, plugins, and workflows
agent/                 Agent runtime integration
hermes_cli/            Runtime compatibility and service layer
tools/                 Local tools and capability sandbox
spec/                  Remote and desktop protocol contracts
docs/                  Architecture, engineering, and audit documentation
```

## Runtime acknowledgement

Karna contains a compatibility/runtime layer derived from the open-source Hermes Agent project. That upstream lineage is retained in source history and licensing. Karna's product identity, desktop experience, Writer OS, workshops, workflows, release channel, and user-data model are maintained in this repository.

## License

MIT. See [LICENSE](LICENSE).
