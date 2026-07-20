# Karna Release Notes

## 2.0.1

This is a critical bug fix release addressing workflow crashes, update detection issues, and overall stability.

### Key Fixes

#### 🔴 Critical Stability Fixes
- **Multi-agent workflow crash**: Fixed infinite loop and unresponsive UI when running complex multi-agent workflows (e.g., "multiple reviewer loop revision")
- **DAG execution stability**: Enhanced workflow executor with proper cycle detection, state persistence, and error boundaries
- **Out-of-memory protection**: Added result size limits (10MB per node, 100MB total) and circuit breaker (auto-pause after 3 consecutive failures)

#### 🔄 Update System Fixes
- **In-app update detection**: Fixed "Check for updates" in Settings returning "Not implemented" error
- **Proper electron-updater integration**: Connected releaseUpdater to API endpoints
- **Added download and install endpoints**: Full update lifecycle support

#### 💬 Chat & Memory
- **Session list pagination**: Fixed history showing only ~8 sessions, now supports limit/offset/has_more for proper pagination
- **Memory service**: Complete memory system with CRUD, search, pinning, import/export

#### 🔌 Plugins & MCP
- **Plugin job state machine**: Proper plugin lifecycle management with queued/running/completed/failed/rolled_back states
- **Unified MCP connector catalog**: Single source of truth for 50 MCP connectors with Chinese localization
- **MCP icon system**: Real icons with generic fallback, icon validation
- **Tool Chinese localization**: Chinese names and descriptions for all MCP tools

#### ⚙️ Model Configuration
- **Versioned config storage**: Model config migration system prevents settings loss during upgrades
- **Unified model authorization**: Single `resolveAuthorizedModel()` function replaces hardcoded checks
- **No automatic provider detection**: Starts in unconfigured state until user explicitly sets up a model

#### 🛠️ Developer & Build
- **Version consistency checks**: Build scripts verify version numbers match across all files
- **Asset sha256 verification**: Release manifest includes checksums for all artifacts
- **Version rollback protection**: CI prevents accidental version downgrades

### Known Issues
- Update detection requires the app to be packaged (not in dev mode)
- GitHub Releases must be published for updates to be detected

---

## 2.0.0

Initial 2.0 release with Karna branding.

### Major Changes
- Rebranded from Hermes Agent to Karna
- New "karna-runtime" replacing "hermes-agent"
- Plugin system architecture
- MCP Workshop
- Flow Studio for visual workflow editing
- Soul author profiles
- Knowledge base improvements
