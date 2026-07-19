# Karna

[Official site](https://karna-writer-os.xujiakang75.chatgpt.site) · [3-minute guide](https://karna-writer-os.xujiakang75.chatgpt.site/start) · [Examples](https://karna-writer-os.xujiakang75.chatgpt.site/examples) · [Latest release](https://github.com/coca-koala4/karna-desktop/releases/latest) · [Discussions](https://github.com/coca-koala4/karna-desktop/discussions)

Karna is a desktop-first AI workspace for long-form writing, research and delivery. It organizes conversations, project files, knowledge, versions, skills, tools and inspectable multi-agent workflows around durable projects rather than isolated chat turns.

The recommended public build is **Karna 1.1.0**. The old `0.17.x` releases were withdrawn and must not be installed or redistributed.

## Product direction

- **Writer OS** — projects, documents, knowledge, context, versions and deliverables. *Experimental.*
- **Visual workflows** — visible steps, review loops and human confirmation. *Experimental.*
- **Context OS / Token OS** — task-aware long-form context and budget control. *Experimental.*
- **Skills, plugins and MCP** — reusable methods and reviewed integrations. *Mixed stability.*
- **Hermes foundation** — Karna retains selected mature runtime capabilities from Hermes Agent while adding a writing-focused desktop product layer.

## Privacy baseline

A clean Karna installation starts with no provider and no model. It must not inherit API keys, GitHub Copilot sessions, old Hermes/Karna configuration, browser authentication or global CLI credentials. Model calls stay disabled until the user deliberately selects and authorizes a provider.

The redesigned installer contains a complete, versioned offline runtime. It does not clone GitHub or download a source checkout on first launch. Release builds use a strict allowlist and fail if tests, logs, source documentation, user data, credentials, stale branding or development artifacts are present.

## Downloads

Use only [official GitHub Releases](https://github.com/coca-koala4/karna-desktop/releases). The current recommended build is Karna 1.1.0 for Windows 10/11 x64.

## License and attribution

Karna is derived from the MIT-licensed [Hermes Agent](https://github.com/NousResearch/hermes-agent). See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
