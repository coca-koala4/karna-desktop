# Karna

Karna is a desktop-first AI workspace for long-form writing, research and delivery. It organizes conversations, project files, knowledge, versions, skills, tools and inspectable multi-agent workflows around durable projects rather than isolated chat turns.

The public `0.17.x` releases were withdrawn and must not be installed or redistributed. The next prerelease will ship only after offline-runtime, credential-isolation, clean-install, Simplified-Chinese UI, branding and package-content gates pass.

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

Download the unsigned [Karna 1.0.2 fixed acceptance build](https://github.com/coca-koala4/karna-desktop/releases/download/v1.0.2/Karna-1.0.2-win-x64.exe), or review its [release notes and checksums](https://github.com/coca-koala4/karna-desktop/releases/tag/v1.0.2). The broken 1.0.0 and 1.0.1 releases have been withdrawn. A signed stable build will follow clean-machine acceptance testing.

## License and attribution

Karna is derived from the MIT-licensed [Hermes Agent](https://github.com/NousResearch/hermes-agent). See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
