from __future__ import annotations

import json
import logging
import shutil
import sqlite3
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger(__name__)


class PluginStatus(str, Enum):
    INSTALLING = "installing"
    ACTIVE = "active"
    DISABLED = "disabled"
    UPDATE_AVAILABLE = "update_available"
    ERROR = "error"
    ROLLED_BACK = "rolled_back"


@dataclass
class InstalledPlugin:
    plugin_id: str
    version: str
    name: str
    publisher_id: str
    publisher_name: str
    description: str
    install_path: str
    manifest_path: str
    status: PluginStatus
    permissions: List[str] = field(default_factory=list)
    permissions_granted: List[str] = field(default_factory=list)
    platforms: List[str] = field(default_factory=list)
    source_type: str = ""
    source_url: str = ""
    source_version: str = ""
    sha256: str = ""
    signature: str = ""
    installed_at: float = 0.0
    updated_at: float = 0.0
    last_health_check: float = 0.0
    health_status: str = "unknown"
    entrypoints: Dict[str, Any] = field(default_factory=dict)
    capabilities: List[str] = field(default_factory=list)
    category: str = "uncategorized"
    is_builtin: bool = False
    is_active_version: bool = True
    rollback_version: str = ""
    metadata_json: str = "{}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "plugin_id": self.plugin_id,
            "version": self.version,
            "name": self.name,
            "publisher": {"id": self.publisher_id, "name": self.publisher_name},
            "description": self.description,
            "install_path": self.install_path,
            "manifest_path": self.manifest_path,
            "status": self.status.value,
            "permissions": self.permissions,
            "permissions_granted": self.permissions_granted,
            "platforms": self.platforms,
            "source": {"type": self.source_type, "url": self.source_url, "version": self.source_version},
            "integrity": {"sha256": self.sha256, "signature": self.signature},
            "installed_at": self.installed_at,
            "updated_at": self.updated_at,
            "last_health_check": self.last_health_check,
            "health_status": self.health_status,
            "entrypoints": self.entrypoints,
            "capabilities": self.capabilities,
            "category": self.category,
            "is_builtin": self.is_builtin,
            "metadata": json.loads(self.metadata_json) if self.metadata_json else {},
        }


@dataclass
class InstalledSkillPack:
    pack_id: str
    version: str
    name: str
    category: str
    install_path: str
    status: str = "active"
    skills_count: int = 0
    total_size: int = 0
    installed_at: float = 0.0
    updated_at: float = 0.0
    skills: List[Dict[str, Any]] = field(default_factory=list)
    is_builtin: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "pack_id": self.pack_id,
            "version": self.version,
            "name": self.name,
            "category": self.category,
            "install_path": self.install_path,
            "status": self.status,
            "skills_count": self.skills_count,
            "total_size": self.total_size,
            "installed_at": self.installed_at,
            "updated_at": self.updated_at,
            "skills": self.skills,
            "is_builtin": self.is_builtin,
        }


@dataclass
class InstalledSkill:
    skill_id: str
    name: str
    path: str
    pack_id: Optional[str] = None
    plugin_id: Optional[str] = None
    primary_category: str = "uncategorized"
    domains: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    language: str = ""
    risk_level: str = "low"
    enabled: bool = True
    is_builtin: bool = False
    sha256: str = ""
    license: str = ""
    source_url: str = ""
    classification_confidence: float = 1.0
    classification_source: str = "manifest"
    variant_source: str = ""
    variant_version: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "skill_id": self.skill_id,
            "name": self.name,
            "path": self.path,
            "pack_id": self.pack_id,
            "plugin_id": self.plugin_id,
            "primary_category": self.primary_category,
            "domains": self.domains,
            "tags": self.tags,
            "language": self.language,
            "risk_level": self.risk_level,
            "enabled": self.enabled,
            "is_builtin": self.is_builtin,
            "sha256": self.sha256,
            "license": self.license,
            "source_url": self.source_url,
            "classification_confidence": self.classification_confidence,
            "classification_source": self.classification_source,
            "variant_source": self.variant_source,
            "variant_version": self.variant_version,
        }


@dataclass
class InstallReceipt:
    job_id: str
    operation: str
    plugin_id: str
    version: str
    timestamp: float
    status: str
    source_type: str = ""
    source_url: str = ""
    source_version: str = ""
    sha256: str = ""
    files_installed: int = 0
    total_size: int = 0
    permissions_requested: List[str] = field(default_factory=list)
    permissions_granted: List[str] = field(default_factory=list)
    error: Optional[str] = None
    security_report: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "operation": self.operation,
            "plugin_id": self.plugin_id,
            "version": self.version,
            "timestamp": self.timestamp,
            "status": self.status,
            "source_type": self.source_type,
            "source_url": self.source_url,
            "source_version": self.source_version,
            "sha256": self.sha256,
            "files_installed": self.files_installed,
            "total_size": self.total_size,
            "permissions_requested": self.permissions_requested,
            "permissions_granted": self.permissions_granted,
            "error": self.error,
            "security_report": self.security_report,
            "metadata": self.metadata,
        }


def _get_plugins_dir() -> Path:
    try:
        from hermes_constants import get_hermes_home
        hermes_home = Path(get_hermes_home())
    except Exception:
        hermes_home = Path.home() / ".hermes"

    plugins_dir = hermes_home / "karna-data" / "plugins"
    plugins_dir.mkdir(parents=True, exist_ok=True)
    return plugins_dir


class PluginRegistry:
    def __init__(self, db_path: Optional[Path] = None):
        if db_path is None:
            db_path = _get_plugins_dir() / "registry.db"
        self.db_path = db_path
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path))
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def _init_db(self) -> None:
        with self._get_conn() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS plugins (
                    plugin_id TEXT NOT NULL,
                    version TEXT NOT NULL,
                    name TEXT NOT NULL,
                    publisher_id TEXT NOT NULL,
                    publisher_name TEXT NOT NULL,
                    description TEXT DEFAULT '',
                    install_path TEXT NOT NULL,
                    manifest_path TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    permissions_json TEXT DEFAULT '[]',
                    permissions_granted_json TEXT DEFAULT '[]',
                    platforms_json TEXT DEFAULT '[]',
                    source_type TEXT DEFAULT '',
                    source_url TEXT DEFAULT '',
                    source_version TEXT DEFAULT '',
                    sha256 TEXT DEFAULT '',
                    signature TEXT DEFAULT '',
                    installed_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    last_health_check REAL DEFAULT 0,
                    health_status TEXT DEFAULT 'unknown',
                    entrypoints_json TEXT DEFAULT '{}',
                    capabilities_json TEXT DEFAULT '[]',
                    category TEXT DEFAULT 'uncategorized',
                    is_builtin INTEGER DEFAULT 0,
                    is_active_version INTEGER DEFAULT 1,
                    rollback_version TEXT DEFAULT '',
                    metadata_json TEXT DEFAULT '{}',
                    PRIMARY KEY (plugin_id, version)
                );

                CREATE INDEX IF NOT EXISTS idx_plugins_id ON plugins(plugin_id);
                CREATE INDEX IF NOT EXISTS idx_plugins_status ON plugins(status);
                CREATE INDEX IF NOT EXISTS idx_plugins_active ON plugins(plugin_id, is_active_version);

                CREATE TABLE IF NOT EXISTS skill_packs (
                    pack_id TEXT NOT NULL PRIMARY KEY,
                    version TEXT NOT NULL,
                    name TEXT NOT NULL,
                    category TEXT DEFAULT 'uncategorized',
                    install_path TEXT NOT NULL,
                    status TEXT DEFAULT 'active',
                    skills_count INTEGER DEFAULT 0,
                    total_size INTEGER DEFAULT 0,
                    installed_at REAL NOT NULL,
                    updated_at REAL NOT NULL,
                    is_builtin INTEGER DEFAULT 0,
                    skills_json TEXT DEFAULT '[]'
                );

                CREATE TABLE IF NOT EXISTS skills (
                    skill_id TEXT NOT NULL PRIMARY KEY,
                    name TEXT NOT NULL,
                    path TEXT NOT NULL,
                    pack_id TEXT,
                    plugin_id TEXT,
                    primary_category TEXT DEFAULT 'uncategorized',
                    domains_json TEXT DEFAULT '[]',
                    tags_json TEXT DEFAULT '[]',
                    language TEXT DEFAULT '',
                    risk_level TEXT DEFAULT 'low',
                    enabled INTEGER DEFAULT 1,
                    is_builtin INTEGER DEFAULT 0,
                    sha256 TEXT DEFAULT '',
                    license TEXT DEFAULT '',
                    source_url TEXT DEFAULT '',
                    classification_confidence REAL DEFAULT 1.0,
                    classification_source TEXT DEFAULT 'manifest',
                    variant_source TEXT DEFAULT '',
                    variant_version TEXT DEFAULT '',
                    installed_at REAL DEFAULT 0,
                    updated_at REAL DEFAULT 0
                );

                CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(primary_category);
                CREATE INDEX IF NOT EXISTS idx_skills_pack ON skills(pack_id);
                CREATE INDEX IF NOT EXISTS idx_skills_plugin ON skills(plugin_id);

                CREATE TABLE IF NOT EXISTS install_jobs (
                    job_id TEXT NOT NULL PRIMARY KEY,
                    operation TEXT NOT NULL,
                    plugin_id TEXT NOT NULL,
                    version TEXT NOT NULL,
                    timestamp REAL NOT NULL,
                    status TEXT NOT NULL,
                    phase TEXT DEFAULT '',
                    progress REAL DEFAULT 0,
                    source_type TEXT DEFAULT '',
                    source_url TEXT DEFAULT '',
                    source_version TEXT DEFAULT '',
                    sha256 TEXT DEFAULT '',
                    files_installed INTEGER DEFAULT 0,
                    total_size INTEGER DEFAULT 0,
                    permissions_requested_json TEXT DEFAULT '[]',
                    permissions_granted_json TEXT DEFAULT '[]',
                    error TEXT,
                    security_report_json TEXT DEFAULT '{}',
                    metadata_json TEXT DEFAULT '{}'
                );

                CREATE INDEX IF NOT EXISTS idx_jobs_plugin ON install_jobs(plugin_id);
                CREATE INDEX IF NOT EXISTS idx_jobs_status ON install_jobs(status);
            """)

    def register_plugin(self, plugin: InstalledPlugin) -> None:
        now = time.time()
        with self._get_conn() as conn:
            if plugin.is_builtin:
                conn.execute(
                    "DELETE FROM plugins WHERE plugin_id = ? AND is_builtin = 1",
                    (plugin.plugin_id,)
                )
            else:
                conn.execute(
                    "UPDATE plugins SET is_active_version = 0 WHERE plugin_id = ?",
                    (plugin.plugin_id,)
                )

            conn.execute("""
                INSERT OR REPLACE INTO plugins
                (plugin_id, version, name, publisher_id, publisher_name, description,
                 install_path, manifest_path, status, permissions_json, permissions_granted_json,
                 platforms_json, source_type, source_url, source_version, sha256, signature,
                 installed_at, updated_at, last_health_check, health_status, entrypoints_json,
                 capabilities_json, category, is_builtin, is_active_version, rollback_version,
                 metadata_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                plugin.plugin_id, plugin.version, plugin.name, plugin.publisher_id,
                plugin.publisher_name, plugin.description, plugin.install_path,
                plugin.manifest_path, plugin.status.value,
                json.dumps(plugin.permissions), json.dumps(plugin.permissions_granted),
                json.dumps(plugin.platforms),
                plugin.source_type, plugin.source_url, plugin.source_version,
                plugin.sha256, plugin.signature,
                plugin.installed_at or now, plugin.updated_at or now,
                plugin.last_health_check, plugin.health_status,
                json.dumps(plugin.entrypoints), json.dumps(plugin.capabilities),
                plugin.category, 1 if plugin.is_builtin else 0, 1, "",
                plugin.metadata_json,
            ))

    def get_plugin(self, plugin_id: str, version: Optional[str] = None) -> Optional[InstalledPlugin]:
        with self._get_conn() as conn:
            if version:
                row = conn.execute(
                    "SELECT * FROM plugins WHERE plugin_id = ? AND version = ?",
                    (plugin_id, version)
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT * FROM plugins WHERE plugin_id = ? AND is_active_version = 1",
                    (plugin_id,)
                ).fetchone()

            if not row:
                return None
            return self._row_to_plugin(row)

    def get_all_plugins(self, include_builtin: bool = True) -> List[InstalledPlugin]:
        with self._get_conn() as conn:
            if include_builtin:
                rows = conn.execute(
                    "SELECT * FROM plugins WHERE is_active_version = 1 ORDER BY is_builtin DESC, name"
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM plugins WHERE is_active_version = 1 AND is_builtin = 0 ORDER BY name"
                ).fetchall()
            return [self._row_to_plugin(r) for r in rows]

    def update_plugin_status(self, plugin_id: str, status: PluginStatus, health_status: Optional[str] = None) -> None:
        now = time.time()
        with self._get_conn() as conn:
            if health_status:
                conn.execute(
                    "UPDATE plugins SET status = ?, updated_at = ?, last_health_check = ?, health_status = ? WHERE plugin_id = ? AND is_active_version = 1",
                    (status.value, now, now, health_status, plugin_id)
                )
            else:
                conn.execute(
                    "UPDATE plugins SET status = ?, updated_at = ? WHERE plugin_id = ? AND is_active_version = 1",
                    (status.value, now, plugin_id)
                )

    def set_plugin_permissions(self, plugin_id: str, granted: List[str]) -> None:
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE plugins SET permissions_granted_json = ?, updated_at = ? WHERE plugin_id = ? AND is_active_version = 1",
                (json.dumps(granted), time.time(), plugin_id)
            )

    def remove_plugin(self, plugin_id: str, version: Optional[str] = None) -> bool:
        with self._get_conn() as conn:
            if version:
                row = conn.execute(
                    "SELECT install_path FROM plugins WHERE plugin_id = ? AND version = ?",
                    (plugin_id, version)
                ).fetchone()
                if row:
                    install_path = Path(row["install_path"])
                    if install_path.exists():
                        shutil.rmtree(install_path, ignore_errors=True)
                conn.execute(
                    "DELETE FROM plugins WHERE plugin_id = ? AND version = ?",
                    (plugin_id, version)
                )
                return True
            else:
                rows = conn.execute(
                    "SELECT install_path, version FROM plugins WHERE plugin_id = ?",
                    (plugin_id,)
                ).fetchall()
                for r in rows:
                    install_path = Path(r["install_path"])
                    if install_path.exists():
                        shutil.rmtree(install_path, ignore_errors=True)
                conn.execute("DELETE FROM plugins WHERE plugin_id = ?", (plugin_id,))
                conn.execute("DELETE FROM skills WHERE plugin_id = ?", (plugin_id,))
                return True

    def create_job(self, operation: str, plugin_id: str, version: str) -> str:
        job_id = str(uuid.uuid4())
        now = time.time()
        with self._get_conn() as conn:
            conn.execute("""
                INSERT INTO install_jobs
                (job_id, operation, plugin_id, version, timestamp, status, phase, progress)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (job_id, operation, plugin_id, version, now, "pending", "resolving", 0.0))
        return job_id

    def update_job(self, job_id: str, **kwargs) -> None:
        allowed_fields = {
            "status", "phase", "progress", "source_type", "source_url", "source_version",
            "sha256", "files_installed", "total_size", "error", "security_report_json",
            "permissions_requested_json", "permissions_granted_json", "metadata_json",
        }
        updates = []
        values = []
        for k, v in kwargs.items():
            if k in allowed_fields:
                updates.append(f"{k} = ?")
                if k.endswith("_json"):
                    values.append(json.dumps(v))
                else:
                    values.append(v)
        if not updates:
            return
        values.append(job_id)
        with self._get_conn() as conn:
            conn.execute(
                f"UPDATE install_jobs SET {', '.join(updates)} WHERE job_id = ?",
                values
            )

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        with self._get_conn() as conn:
            row = conn.execute("SELECT * FROM install_jobs WHERE job_id = ?", (job_id,)).fetchone()
            if not row:
                return None
            return self._row_to_job(row)

    def save_receipt(self, receipt: InstallReceipt) -> None:
        plugins_dir = _get_plugins_dir()
        receipts_dir = plugins_dir / "receipts"
        receipts_dir.mkdir(parents=True, exist_ok=True)
        receipt_path = receipts_dir / f"{receipt.job_id}.json"
        receipt_path.write_text(json.dumps(receipt.to_dict(), indent=2, ensure_ascii=False))

    def register_skill(self, skill: InstalledSkill) -> None:
        now = time.time()
        with self._get_conn() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO skills
                (skill_id, name, path, pack_id, plugin_id, primary_category,
                 domains_json, tags_json, language, risk_level, enabled, is_builtin,
                 sha256, license, source_url, classification_confidence,
                 classification_source, variant_source, variant_version,
                 installed_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                skill.skill_id, skill.name, skill.path, skill.pack_id, skill.plugin_id,
                skill.primary_category,
                json.dumps(skill.domains), json.dumps(skill.tags),
                skill.language, skill.risk_level, 1 if skill.enabled else 0,
                1 if skill.is_builtin else 0,
                skill.sha256, skill.license, skill.source_url,
                skill.classification_confidence, skill.classification_source,
                skill.variant_source, skill.variant_version,
                now, now,
            ))

    def get_all_skills(self, enabled_only: bool = False) -> List[InstalledSkill]:
        with self._get_conn() as conn:
            if enabled_only:
                rows = conn.execute(
                    "SELECT * FROM skills WHERE enabled = 1 ORDER BY primary_category, name"
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM skills ORDER BY primary_category, name"
                ).fetchall()
            return [self._row_to_skill(r) for r in rows]

    def get_skills_by_category(self, category: str) -> List[InstalledSkill]:
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM skills WHERE primary_category = ? AND enabled = 1 ORDER BY name",
                (category,)
            ).fetchall()
            return [self._row_to_skill(r) for r in rows]

    def set_skill_enabled(self, skill_id: str, enabled: bool) -> None:
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE skills SET enabled = ?, updated_at = ? WHERE skill_id = ?",
                (1 if enabled else 0, time.time(), skill_id)
            )

    def register_skill_pack(self, pack: InstalledSkillPack) -> None:
        now = time.time()
        with self._get_conn() as conn:
            conn.execute("""
                INSERT OR REPLACE INTO skill_packs
                (pack_id, version, name, category, install_path, status,
                 skills_count, total_size, installed_at, updated_at, is_builtin, skills_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                pack.pack_id, pack.version, pack.name, pack.category, pack.install_path,
                pack.status, pack.skills_count, pack.total_size,
                pack.installed_at or now, pack.updated_at or now,
                1 if pack.is_builtin else 0, json.dumps(pack.skills),
            ))

    def get_all_skill_packs(self) -> List[InstalledSkillPack]:
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM skill_packs ORDER BY category, name"
            ).fetchall()
            return [self._row_to_pack(r) for r in rows]

    def _row_to_plugin(self, row: sqlite3.Row) -> InstalledPlugin:
        return InstalledPlugin(
            plugin_id=row["plugin_id"],
            version=row["version"],
            name=row["name"],
            publisher_id=row["publisher_id"],
            publisher_name=row["publisher_name"],
            description=row["description"],
            install_path=row["install_path"],
            manifest_path=row["manifest_path"],
            status=PluginStatus(row["status"]),
            permissions=json.loads(row["permissions_json"]),
            permissions_granted=json.loads(row["permissions_granted_json"]),
            platforms=json.loads(row["platforms_json"]),
            source_type=row["source_type"],
            source_url=row["source_url"],
            source_version=row["source_version"],
            sha256=row["sha256"],
            signature=row["signature"],
            installed_at=row["installed_at"],
            updated_at=row["updated_at"],
            last_health_check=row["last_health_check"],
            health_status=row["health_status"],
            entrypoints=json.loads(row["entrypoints_json"]),
            capabilities=json.loads(row["capabilities_json"]),
            category=row["category"],
            is_builtin=bool(row["is_builtin"]),
            is_active_version=bool(row["is_active_version"]),
            rollback_version=row["rollback_version"],
            metadata_json=row["metadata_json"],
        )

    def _row_to_skill(self, row: sqlite3.Row) -> InstalledSkill:
        return InstalledSkill(
            skill_id=row["skill_id"],
            name=row["name"],
            path=row["path"],
            pack_id=row["pack_id"],
            plugin_id=row["plugin_id"],
            primary_category=row["primary_category"],
            domains=json.loads(row["domains_json"]),
            tags=json.loads(row["tags_json"]),
            language=row["language"],
            risk_level=row["risk_level"],
            enabled=bool(row["enabled"]),
            is_builtin=bool(row["is_builtin"]),
            sha256=row["sha256"],
            license=row["license"],
            source_url=row["source_url"],
            classification_confidence=row["classification_confidence"],
            classification_source=row["classification_source"],
            variant_source=row["variant_source"],
            variant_version=row["variant_version"],
        )

    def _row_to_pack(self, row: sqlite3.Row) -> InstalledSkillPack:
        return InstalledSkillPack(
            pack_id=row["pack_id"],
            version=row["version"],
            name=row["name"],
            category=row["category"],
            install_path=row["install_path"],
            status=row["status"],
            skills_count=row["skills_count"],
            total_size=row["total_size"],
            installed_at=row["installed_at"],
            updated_at=row["updated_at"],
            skills=json.loads(row["skills_json"]),
            is_builtin=bool(row["is_builtin"]),
        )

    def _row_to_job(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "job_id": row["job_id"],
            "operation": row["operation"],
            "plugin_id": row["plugin_id"],
            "version": row["version"],
            "timestamp": row["timestamp"],
            "status": row["status"],
            "phase": row["phase"],
            "progress": row["progress"],
            "source_type": row["source_type"],
            "source_url": row["source_url"],
            "source_version": row["source_version"],
            "sha256": row["sha256"],
            "files_installed": row["files_installed"],
            "total_size": row["total_size"],
            "permissions_requested": json.loads(row["permissions_requested_json"]),
            "permissions_granted": json.loads(row["permissions_granted_json"]),
            "error": row["error"],
            "security_report": json.loads(row["security_report_json"]),
            "metadata": json.loads(row["metadata_json"]),
        }

    def list_plugins(self) -> List[InstalledPlugin]:
        return self.get_all_plugins()

    def list_plugin_skills(self, plugin_id: str) -> List[InstalledSkill]:
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM skills WHERE plugin_id = ? ORDER BY name",
                (plugin_id,)
            ).fetchall()
            return [self._row_to_skill(r) for r in rows]

    def list_plugin_mcp(self, plugin_id: str) -> List[Dict[str, Any]]:
        plugin = self.get_plugin(plugin_id)
        if not plugin:
            return []
        entrypoints = plugin.entrypoints if isinstance(plugin.entrypoints, dict) else {}
        mcp_entries = entrypoints.get("mcp", [])
        result = []
        install_path = Path(plugin.install_path)
        for mcp_rel in mcp_entries:
            mcp_path = install_path / mcp_rel
            result.append({
                "path": mcp_rel,
                "full_path": str(mcp_path),
                "exists": mcp_path.exists(),
            })
        return result

    def list_skill_packs(self) -> List[InstalledSkillPack]:
        return self.get_all_skill_packs()

    def list_pack_skills(self, pack_id: str) -> List[InstalledSkill]:
        with self._get_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM skills WHERE pack_id = ? ORDER BY name",
                (pack_id,)
            ).fetchall()
            return [self._row_to_skill(r) for r in rows]

    def list_skills(self) -> List[InstalledSkill]:
        return self.get_all_skills()

    def set_plugin_enabled(self, plugin_id: str, enabled: bool) -> None:
        status = PluginStatus.ACTIVE if enabled else PluginStatus.DISABLED
        self.update_plugin_status(plugin_id, status)

    def set_plugin_permissions_granted(self, plugin_id: str, granted: List[str]) -> None:
        self.set_plugin_permissions(plugin_id, granted)

    def update_plugin_health(self, plugin_id: str, health_status: str) -> None:
        now = time.time()
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE plugins SET health_status = ?, last_health_check = ?, updated_at = ? WHERE plugin_id = ? AND is_active_version = 1",
                (health_status, now, now, plugin_id)
            )

    def activate_skill_variant(self, skill_id: str, variant_id: str) -> None:
        with self._get_conn() as conn:
            conn.execute(
                "UPDATE skills SET variant_source = ?, variant_version = ?, updated_at = ? WHERE skill_id = ?",
                (variant_id, variant_id, time.time(), skill_id)
            )

    def register_builtin_plugin(self, plugin: InstalledPlugin) -> None:
        plugin.is_builtin = True
        plugin.status = PluginStatus.ACTIVE
        self.register_plugin(plugin)

    def register_builtin_skill(self, skill: InstalledSkill) -> None:
        skill.is_builtin = True
        skill.enabled = True
        self.register_skill(skill)

    def register_builtin_skill_pack(self, pack: InstalledSkillPack) -> None:
        pack.is_builtin = True
        self.register_skill_pack(pack)
