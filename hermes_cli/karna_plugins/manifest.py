from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

SEMVER_RE = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)"
    r"(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?"
    r"(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$"
)

SUPPORTED_PLATFORMS = {"win32-x64", "darwin-x64", "darwin-arm64", "linux-x64", "linux-arm64"}
PLUGIN_SCHEMA_VERSION = 1
SKILL_PACK_SCHEMA_VERSION = 1


def _validate_semver(version: str, field_name: str = "version") -> str:
    if not SEMVER_RE.match(version):
        raise ValueError(f"Invalid SemVer {field_name}: {version!r}")
    return version


def _validate_relative_path(path: str, field_name: str = "path") -> str:
    p = Path(path)
    if p.is_absolute():
        raise ValueError(f"Path {field_name} must be relative, got: {path!r}")
    if ".." in p.parts:
        raise ValueError(f"Path {field_name} must not contain '..', got: {path!r}")
    return path.replace("\\", "/")


@dataclass
class PluginPublisher:
    id: str
    name: str

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> PluginPublisher:
        return cls(id=data["id"], name=data["name"])

    def to_dict(self) -> Dict[str, Any]:
        return {"id": self.id, "name": self.name}


@dataclass
class PluginLicense:
    spdx: str
    file: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> PluginLicense:
        return cls(spdx=data["spdx"], file=data.get("file"))

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"spdx": self.spdx}
        if self.file:
            d["file"] = self.file
        return d


@dataclass
class PluginInterface:
    category: str
    icon: Optional[str] = None
    capabilities: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> PluginInterface:
        return cls(
            category=data.get("category", "uncategorized"),
            icon=data.get("icon"),
            capabilities=data.get("capabilities", []),
        )

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"category": self.category}
        if self.icon:
            d["icon"] = self.icon
        if self.capabilities:
            d["capabilities"] = self.capabilities
        return d


@dataclass
class PluginCompatibility:
    karna: str
    platforms: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> PluginCompatibility:
        platforms = data.get("platforms", [])
        for plat in platforms:
            if plat not in SUPPORTED_PLATFORMS:
                logger.warning(f"Unknown platform {plat!r} in plugin compatibility")
        return cls(karna=data.get("karna", ">=0.18.0"), platforms=platforms)

    def to_dict(self) -> Dict[str, Any]:
        return {"karna": self.karna, "platforms": self.platforms}


@dataclass
class PluginEntrypoints:
    skills: List[str] = field(default_factory=list)
    mcp: List[str] = field(default_factory=list)
    connectors: List[str] = field(default_factory=list)
    workflows: List[str] = field(default_factory=list)
    writer_forms: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> PluginEntrypoints:
        return cls(
            skills=[_validate_relative_path(p, "skills entrypoint") for p in data.get("skills", [])],
            mcp=[_validate_relative_path(p, "mcp entrypoint") for p in data.get("mcp", [])],
            connectors=[_validate_relative_path(p, "connectors entrypoint") for p in data.get("connectors", [])],
            workflows=[_validate_relative_path(p, "workflows entrypoint") for p in data.get("workflows", [])],
            writer_forms=[_validate_relative_path(p, "writer_forms entrypoint") for p in data.get("writer_forms", [])],
        )

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {}
        if self.skills:
            d["skills"] = self.skills
        if self.mcp:
            d["mcp"] = self.mcp
        if self.connectors:
            d["connectors"] = self.connectors
        if self.workflows:
            d["workflows"] = self.workflows
        if self.writer_forms:
            d["writer_forms"] = self.writer_forms
        return d


@dataclass
class PluginDependencies:
    node_lock: Optional[str] = None
    python_lock: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> PluginDependencies:
        node_lock = data.get("node_lock")
        python_lock = data.get("python_lock")
        if node_lock:
            _validate_relative_path(node_lock, "node_lock")
        if python_lock:
            _validate_relative_path(python_lock, "python_lock")
        return cls(node_lock=node_lock, python_lock=python_lock)

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {}
        if self.node_lock:
            d["node_lock"] = self.node_lock
        if self.python_lock:
            d["python_lock"] = self.python_lock
        return d


@dataclass
class PluginSource:
    type: str
    url: Optional[str] = None
    update_url: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> PluginSource:
        return cls(
            type=data.get("type", "local"),
            url=data.get("url"),
            update_url=data.get("update_url"),
        )

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"type": self.type}
        if self.url:
            d["url"] = self.url
        if self.update_url:
            d["update_url"] = self.update_url
        return d


@dataclass
class PluginIntegrity:
    sha256: Optional[str] = None
    signature: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> PluginIntegrity:
        return cls(sha256=data.get("sha256"), signature=data.get("signature"))

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {}
        if self.sha256:
            d["sha256"] = self.sha256
        if self.signature:
            d["signature"] = self.signature
        return d


@dataclass
class KarnaPluginManifest:
    schema_version: int
    id: str
    name: str
    version: str
    publisher: PluginPublisher
    description: str
    interface: PluginInterface
    compatibility: PluginCompatibility
    permissions: List[str] = field(default_factory=list)
    license: Optional[PluginLicense] = None
    entrypoints: PluginEntrypoints = field(default_factory=PluginEntrypoints)
    dependencies: PluginDependencies = field(default_factory=PluginDependencies)
    source: PluginSource = field(default_factory=PluginSource)
    integrity: PluginIntegrity = field(default_factory=PluginIntegrity)
    compat_raw: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> KarnaPluginManifest:
        schema_version = data.get("schema_version", 1)
        if schema_version != PLUGIN_SCHEMA_VERSION:
            raise ValueError(f"Unsupported plugin schema_version: {schema_version}")

        manifest_id = data["id"]
        name = data["name"]
        version = _validate_semver(data["version"])
        publisher = PluginPublisher.from_dict(data["publisher"])
        description = data.get("description", "")

        return cls(
            schema_version=schema_version,
            id=manifest_id,
            name=name,
            version=version,
            publisher=publisher,
            description=description,
            license=PluginLicense.from_dict(data["license"]) if "license" in data else None,
            interface=PluginInterface.from_dict(data.get("interface", {})),
            compatibility=PluginCompatibility.from_dict(data.get("compatibility", {})),
            permissions=data.get("permissions", []),
            entrypoints=PluginEntrypoints.from_dict(data.get("entrypoints", {})),
            dependencies=PluginDependencies.from_dict(data.get("dependencies", {})),
            source=PluginSource.from_dict(data.get("source", {})),
            integrity=PluginIntegrity.from_dict(data.get("integrity", {})),
        )

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {
            "schema_version": self.schema_version,
            "id": self.id,
            "name": self.name,
            "version": self.version,
            "publisher": self.publisher.to_dict(),
            "description": self.description,
            "interface": self.interface.to_dict(),
            "compatibility": self.compatibility.to_dict(),
        }
        if self.license:
            d["license"] = self.license.to_dict()
        if self.permissions:
            d["permissions"] = self.permissions
        d["entrypoints"] = self.entrypoints.to_dict()
        d["dependencies"] = self.dependencies.to_dict()
        d["source"] = self.source.to_dict()
        d["integrity"] = self.integrity.to_dict()
        if self.compat_raw:
            d["_compat_raw"] = self.compat_raw
        return d


@dataclass
class SkillPackEntry:
    id: str
    path: str
    sha256: Optional[str] = None
    license: Optional[str] = None
    source_url: Optional[str] = None
    default_enabled: bool = True
    domains: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> SkillPackEntry:
        _validate_relative_path(data["path"], "skill path")
        return cls(
            id=data["id"],
            path=data["path"],
            sha256=data.get("sha256"),
            license=data.get("license"),
            source_url=data.get("source_url"),
            default_enabled=data.get("default_enabled", True),
            domains=data.get("domains", []),
            tags=data.get("tags", []),
        )

    def to_dict(self) -> Dict[str, Any]:
        d: Dict[str, Any] = {"id": self.id, "path": self.path}
        if self.sha256:
            d["sha256"] = self.sha256
        if self.license:
            d["license"] = self.license
        if self.source_url:
            d["source_url"] = self.source_url
        if not self.default_enabled:
            d["default_enabled"] = self.default_enabled
        if self.domains:
            d["domains"] = self.domains
        if self.tags:
            d["tags"] = self.tags
        return d


@dataclass
class KarnaSkillPackManifest:
    schema_version: int
    id: str
    version: str
    category: str
    skills: List[SkillPackEntry] = field(default_factory=list)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> KarnaSkillPackManifest:
        schema_version = data.get("schema_version", 1)
        if schema_version != SKILL_PACK_SCHEMA_VERSION:
            raise ValueError(f"Unsupported skill pack schema_version: {schema_version}")
        return cls(
            schema_version=schema_version,
            id=data["id"],
            version=data["version"],
            category=data.get("category", "uncategorized"),
            skills=[SkillPackEntry.from_dict(s) for s in data.get("skills", [])],
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "id": self.id,
            "version": self.version,
            "category": self.category,
            "skills": [s.to_dict() for s in self.skills],
        }


@dataclass
class CodexPluginManifest:
    name: Optional[str] = None
    description: Optional[str] = None
    version: Optional[str] = None
    services: Dict[str, Any] = field(default_factory=dict)
    prompts: List[str] = field(default_factory=list)
    tools: List[Dict[str, Any]] = field(default_factory=list)
    agents: List[Dict[str, Any]] = field(default_factory=list)
    skills: List[Dict[str, Any]] = field(default_factory=list)
    raw: Dict[str, Any] = field(default_factory=dict)


def parse_plugin_manifest(root_dir: Path) -> KarnaPluginManifest:
    manifest_path = root_dir / "karna-plugin.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"karna-plugin.json not found in {root_dir}")
    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return KarnaPluginManifest.from_dict(data)


def parse_skill_pack_manifest(root_dir: Path) -> KarnaSkillPackManifest:
    manifest_path = root_dir / "karna-skill-pack.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"karna-skill-pack.json not found in {root_dir}")
    with open(manifest_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return KarnaSkillPackManifest.from_dict(data)


def convert_codex_plugin(codex_dir: Path) -> KarnaPluginManifest:
    plugin_json = codex_dir / ".codex-plugin" / "plugin.json"
    if not plugin_json.exists():
        raise FileNotFoundError(f"Codex plugin.json not found at {plugin_json}")

    with open(plugin_json, "r", encoding="utf-8") as f:
        raw = json.load(f)

    codex = CodexPluginManifest(
        name=raw.get("name"),
        description=raw.get("description"),
        version=raw.get("version"),
        services=raw.get("services", {}),
        prompts=raw.get("prompts", []),
        tools=raw.get("tools", []),
        agents=raw.get("agents", []),
        skills=raw.get("skills", []),
        raw=raw,
    )

    plugin_id = codex.name or codex_dir.name
    safe_id = re.sub(r"[^a-z0-9._-]", "-", plugin_id.lower())
    version = codex.version or "1.0.0"
    if not SEMVER_RE.match(version):
        version = "1.0.0"

    entrypoints = PluginEntrypoints(
        skills=["skills/"] if (codex_dir / "skills").exists() or codex.skills else [],
        mcp=["mcp/server.json"] if (codex_dir / "mcp").exists() or codex.services else [],
        workflows=["workflows/"] if (codex_dir / "workflows").exists() else [],
    )

    capabilities: List[str] = []
    if entrypoints.skills:
        capabilities.append("skills")
    if entrypoints.mcp:
        capabilities.append("mcp")
    if entrypoints.workflows:
        capabilities.append("workflows")

    permissions = []
    if codex.services:
        for svc_name, svc_config in codex.services.items():
            cmd = svc_config.get("command", "") if isinstance(svc_config, dict) else ""
            if cmd:
                permissions.append("process:external")
                break

    return KarnaPluginManifest(
        schema_version=PLUGIN_SCHEMA_VERSION,
        id=f"codex.{safe_id}",
        name=codex.name or plugin_id,
        version=version,
        publisher=PluginPublisher(id="codex-import", name="Codex Import"),
        description=codex.description or f"Imported from Codex plugin: {plugin_id}",
        interface=PluginInterface(
            category="uncategorized",
            capabilities=capabilities,
        ),
        compatibility=PluginCompatibility(karna=">=0.18.0", platforms=["win32-x64"]),
        permissions=permissions,
        entrypoints=entrypoints,
        compat_raw=raw,
    )
