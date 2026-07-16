from __future__ import annotations

import json
import logging
import os
import platform
import shutil
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from .manifest import (
    KarnaPluginManifest,
    KarnaSkillPackManifest,
    parse_plugin_manifest,
    parse_skill_pack_manifest,
    convert_codex_plugin,
)
from .registry import (
    PluginRegistry,
    InstalledPlugin,
    InstalledSkill,
    InstalledSkillPack,
    InstallReceipt,
    PluginStatus,
)
from .security import (
    SecurityScanner,
    scan_zip_extract,
    compute_sha256,
)
from .sources import (
    get_source_adapter,
    ResolvedSource,
    DownloadedPackage,
)

logger = logging.getLogger(__name__)


class InstallPhase(str, Enum):
    RESOLVING = "resolving"
    DOWNLOADING = "downloading"
    QUARANTINED = "quarantined"
    PREFLIGHTED = "preflighted"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    INSTALLING = "installing"
    REGISTERING = "registering"
    VERIFYING = "verifying"
    ACTIVE = "active"
    BLOCKED = "blocked"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


class InstallState(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    AWAITING_CONFIRMATION = "awaiting_confirmation"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


@dataclass
class PreflightReport:
    plugin_id: str
    name: str
    version: str
    publisher: Dict[str, str]
    description: str
    source_type: str
    source_url: str
    files_count: int
    total_size: int
    permissions: List[str]
    platforms: List[str]
    entrypoints: Dict[str, Any]
    capabilities: List[str]
    category: str
    license_id: str = ""
    is_compatible_platform: bool = True
    is_codex_converted: bool = False
    security_issues: List[Dict[str, Any]] = field(default_factory=list)
    security_verdict: str = "pass"
    conflicts: List[str] = field(default_factory=list)
    duplicate_skills: List[str] = field(default_factory=list)
    is_skill_pack: bool = False
    skills: List[Dict[str, Any]] = field(default_factory=list)
    sha256: str = ""
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "plugin_id": self.plugin_id,
            "name": self.name,
            "version": self.version,
            "publisher": self.publisher,
            "description": self.description,
            "source_type": self.source_type,
            "source_url": self.source_url,
            "files_count": self.files_count,
            "total_size": self.total_size,
            "permissions": self.permissions,
            "platforms": self.platforms,
            "entrypoints": self.entrypoints,
            "capabilities": self.capabilities,
            "category": self.category,
            "license_id": self.license_id,
            "is_compatible_platform": self.is_compatible_platform,
            "is_codex_converted": self.is_codex_converted,
            "security_issues": self.security_issues,
            "security_verdict": self.security_verdict,
            "conflicts": self.conflicts,
            "duplicate_skills": self.duplicate_skills,
            "is_skill_pack": self.is_skill_pack,
            "skills": self.skills,
            "sha256": self.sha256,
            "warnings": self.warnings,
        }


@dataclass
class InstallJob:
    job_id: str
    source: str
    operation: str = "install"
    state: InstallState = InstallState.PENDING
    phase: InstallPhase = InstallPhase.RESOLVING
    progress: float = 0.0
    resolved: Optional[ResolvedSource] = None
    downloaded: Optional[DownloadedPackage] = None
    preflight: Optional[PreflightReport] = None
    manifest: Optional[KarnaPluginManifest] = None
    skill_pack_manifest: Optional[KarnaSkillPackManifest] = None
    quarantine_path: Optional[Path] = None
    install_path: Optional[Path] = None
    error: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    event_callbacks: List[Callable[[Dict[str, Any]], None]] = field(default_factory=list, repr=False)

    def emit(self, event_type: str, **kwargs) -> None:
        event = {"type": event_type, "job_id": self.job_id, "phase": self.phase.value, "progress": self.progress, **kwargs}
        for cb in self.event_callbacks:
            try:
                cb(event)
            except Exception as e:
                logger.debug(f"Event callback error: {e}")

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "source": self.source,
            "operation": self.operation,
            "state": self.state.value,
            "phase": self.phase.value,
            "progress": self.progress,
            "error": self.error,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "plugin_id": self.preflight.plugin_id if self.preflight else None,
            "plugin_name": self.preflight.name if self.preflight else None,
            "version": self.preflight.version if self.preflight else None,
        }


def _get_plugins_base_dir() -> Path:
    try:
        from hermes_constants import get_hermes_home
        hermes_home = Path(get_hermes_home())
    except Exception:
        hermes_home = Path.home() / ".hermes"

    plugins_base = hermes_home / "karna-data" / "plugins"
    for subdir in ["installed", "staging", "quarantine", "rollback", "receipts", "local-packs"]:
        (plugins_base / subdir).mkdir(parents=True, exist_ok=True)
    return plugins_base


def _current_platform() -> str:
    sys_name = platform.system().lower()
    if sys_name == "windows":
        sys_name = "win32"
    elif sys_name == "darwin":
        sys_name = "darwin"
    machine = platform.machine().lower()
    arch = "x64" if machine in ("amd64", "x86_64") else "arm64" if machine in ("arm64", "aarch64") else machine
    return f"{sys_name}-{arch}"


class PluginInstaller:
    def __init__(self, registry: Optional[PluginRegistry] = None):
        self.registry = registry or PluginRegistry()
        self._jobs: Dict[str, InstallJob] = {}
        self._security_scanner = SecurityScanner()
        self._discover_builtin_plugins()

    def create_job(self, source: str, operation: str = "install") -> InstallJob:
        job_id = str(uuid.uuid4())
        job = InstallJob(job_id=job_id, source=source, operation=operation)
        self._jobs[job_id] = job
        self.registry.create_job(operation, "", "")
        self.registry.update_job(job_id, status="pending", phase="resolving", progress=0.0)
        job.emit("job_created")
        return job

    def get_job(self, job_id: str) -> Optional[InstallJob]:
        return self._jobs.get(job_id)

    def _resolve(self, job: InstallJob) -> ResolvedSource:
        job.phase = InstallPhase.RESOLVING
        job.progress = 0.1
        job.emit("phase_change", phase="resolving")
        self.registry.update_job(job.job_id, phase="resolving", progress=0.1)

        adapter = get_source_adapter(job.source)
        resolved = adapter.resolve(job.source)
        job.resolved = resolved
        job.progress = 0.2
        job.emit("resolved", resolved=resolved)
        self.registry.update_job(job.job_id, source_type=resolved.source_type, source_url=resolved.source_url, progress=0.2)
        return resolved

    def _download(self, job: InstallJob, resolved: ResolvedSource) -> DownloadedPackage:
        job.phase = InstallPhase.DOWNLOADING
        job.progress = 0.3
        job.emit("phase_change", phase="downloading")
        self.registry.update_job(job.job_id, phase="downloading", progress=0.3)

        base_dir = _get_plugins_base_dir()
        staging_dir = base_dir / "staging" / job.job_id
        staging_dir.mkdir(parents=True, exist_ok=True)

        adapter = get_source_adapter(job.source)
        downloaded = adapter.download(resolved, staging_dir)
        job.downloaded = downloaded
        job.progress = 0.4
        job.emit("downloaded", downloaded=downloaded)
        self.registry.update_job(
            job.job_id,
            progress=0.4,
            sha256=downloaded.sha256,
            files_installed=downloaded.files_count,
            total_size=downloaded.total_size,
        )
        return downloaded

    def _quarantine(self, job: InstallJob, downloaded: DownloadedPackage) -> Path:
        job.phase = InstallPhase.QUARANTINED
        job.progress = 0.5
        job.emit("phase_change", phase="quarantined")
        self.registry.update_job(job.job_id, phase="quarantined", progress=0.5)

        base_dir = _get_plugins_base_dir()
        quarantine_dir = base_dir / "quarantine" / job.job_id
        quarantine_dir.mkdir(parents=True, exist_ok=True)

        if downloaded.is_zip:
            security_result, extract_path = scan_zip_extract(downloaded.local_path, quarantine_dir)
        else:
            shutil.copy2(downloaded.local_path, quarantine_dir / downloaded.local_path.name)
            security_result = self._security_scanner.scan_directory(quarantine_dir)
            extract_path = quarantine_dir

        job.quarantine_path = extract_path
        job.emit("security_scanned", result=security_result.to_dict())

        if security_result.verdict == "block":
            job.phase = InstallPhase.BLOCKED
            job.state = InstallState.FAILED
            job.error = "Security scan blocked installation"
            job.emit("blocked", issues=security_result.to_dict())
            self.registry.update_job(
                job.job_id,
                status="failed",
                phase="blocked",
                error=job.error,
                security_report_json=security_result.to_dict(),
            )
            raise RuntimeError(f"Security scan blocked: {security_result.issues}")

        return extract_path

    def _find_manifest(self, directory: Path) -> Tuple[Optional[Path], Optional[str]]:
        plugin_manifest = directory / "karna-plugin.json"
        if plugin_manifest.exists():
            return plugin_manifest, "plugin"

        pack_manifest = directory / "karna-skill-pack.json"
        if pack_manifest.exists():
            return pack_manifest, "skill_pack"

        for root, dirs, files in __import__("os").walk(directory):
            for f in files:
                if f == "karna-plugin.json":
                    return Path(root) / f, "plugin"
                if f == "karna-skill-pack.json":
                    return Path(root) / f, "skill_pack"
                if f == ".codex-plugin" or f == "plugin.json":
                    if ".codex-plugin" in files or (Path(root) / ".codex-plugin").exists():
                        codex_manifest = Path(root) / "plugin.json"
                        if codex_manifest.exists():
                            return codex_manifest, "codex"

        skill_md = directory / "SKILL.md"
        if skill_md.exists():
            return None, "single_skill"

        for root, dirs, files in __import__("os").walk(directory):
            if "SKILL.md" in files and len(files) <= 20:
                return None, "single_skill"

        return None, None

    def _preflight(self, job: InstallJob, quarantine_path: Path) -> PreflightReport:
        job.phase = InstallPhase.PREFLIGHTED
        job.progress = 0.6
        job.emit("phase_change", phase="preflighted")
        self.registry.update_job(job.job_id, phase="preflighted", progress=0.6)

        manifest_path, manifest_type = self._find_manifest(quarantine_path)

        is_skill_pack = False
        is_codex = False
        manifest = None
        skill_pack_manifest = None

        if manifest_type == "plugin":
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest = parse_plugin_manifest(json.load(f))
            job.manifest = manifest
        elif manifest_type == "skill_pack":
            with open(manifest_path, "r", encoding="utf-8") as f:
                skill_pack_manifest = parse_skill_pack_manifest(json.load(f))
            job.skill_pack_manifest = skill_pack_manifest
            is_skill_pack = True
        elif manifest_type == "codex":
            with open(manifest_path, "r", encoding="utf-8") as f:
                codex_data = json.load(f)
            manifest = convert_codex_plugin(codex_data)
            job.manifest = manifest
            is_codex = True
        elif manifest_type == "single_skill":
            manifest = KarnaPluginManifest(
                schema_version=1,
                id=f"local.skill.{quarantine_path.name}",
                name=quarantine_path.name.replace("-", " ").replace("_", " ").title(),
                version="0.0.0-local",
                publisher={"id": "local", "name": "Local"},
                description="Local skill import",
                interface={"category": "uncategorized", "icon": "", "capabilities": []},
                compatibility={"karna": ">=0.18.0", "platforms": []},
                entrypoints={"skills": ["."]},
            )
            job.manifest = manifest
        else:
            raise ValueError("No valid plugin or skill pack manifest found")

        current_plat = _current_platform()
        platforms = []
        if manifest:
            platforms = manifest.compatibility.platforms
        elif skill_pack_manifest:
            platforms = [current_plat]

        is_compatible = not platforms or any(
            p == current_plat or p == "*" or current_plat.startswith(p.split("-")[0] + "-")
            for p in platforms
        )

        permissions = manifest.permissions if manifest else []
        perm_issues = self._security_scanner.scan_manifest_permissions(permissions)
        dir_scan = self._security_scanner.scan_directory(quarantine_path)
        all_issues = perm_issues + dir_scan.issues

        if manifest:
            entrypoints = {
                "skills": manifest.entrypoints.skills,
                "mcp": manifest.entrypoints.mcp,
                "connectors": manifest.entrypoints.connectors,
                "workflows": manifest.entrypoints.workflows,
                "writer_forms": manifest.entrypoints.writer_forms,
            }
            plugin_id = manifest.id
            name = manifest.name
            version = manifest.version
            publisher = {"id": manifest.publisher.id, "name": manifest.publisher.name}
            description = manifest.description
            capabilities = manifest.interface.capabilities
            category = manifest.interface.category
            license_id = manifest.license.spdx if manifest.license else ""
        else:
            entrypoints = {"skills": ["."]}
            plugin_id = skill_pack_manifest.id
            name = f"Skill Pack: {skill_pack_manifest.category}"
            version = skill_pack_manifest.version
            publisher = {"id": "karna", "name": "Karna"}
            description = f"Skill pack with {len(skill_pack_manifest.skills)} skills"
            capabilities = ["skills"]
            category = skill_pack_manifest.category
            license_id = "Various"

        existing_plugin = self.registry.get_plugin(plugin_id)
        conflicts = []
        if existing_plugin:
            conflicts.append(f"Plugin '{plugin_id}' version {existing_plugin.version} is already installed")

        skills = []
        skills_dir_name = "skills"
        if is_skill_pack and skill_pack_manifest:
            for skill_entry in skill_pack_manifest.skills:
                existing_skill = None
                for s in self.registry.get_all_skills():
                    if s.name == skill_entry["id"]:
                        existing_skill = s
                        break
                skills.append({
                    "id": skill_entry["id"],
                    "path": skill_entry["path"],
                    "license": skill_entry.get("license", ""),
                    "enabled": skill_entry.get("default_enabled", True),
                    "domains": skill_entry.get("domains", []),
                    "tags": skill_entry.get("tags", []),
                    "already_exists": existing_skill is not None,
                })

        warnings = []
        if is_codex:
            warnings.append("This is a converted Codex plugin. Some proprietary features may not work.")
        if job.resolved and job.resolved.metadata.get("is_lan"):
            warnings.append(job.resolved.metadata.get("lan_warning", "Local network source"))
        if not is_compatible:
            warnings.append(f"Plugin declares platforms {platforms}, current platform is {current_plat}")

        preflight = PreflightReport(
            plugin_id=plugin_id,
            name=name,
            version=version,
            publisher=publisher,
            description=description,
            source_type=job.resolved.source_type if job.resolved else "unknown",
            source_url=job.resolved.source_url if job.resolved else "",
            files_count=job.downloaded.files_count if job.downloaded else 0,
            total_size=job.downloaded.total_size if job.downloaded else 0,
            permissions=permissions,
            platforms=platforms,
            entrypoints=entrypoints,
            capabilities=capabilities,
            category=category,
            license_id=license_id,
            is_compatible_platform=is_compatible,
            is_codex_converted=is_codex,
            security_issues=[i.to_dict() for i in all_issues],
            security_verdict=dir_scan.verdict,
            conflicts=conflicts,
            is_skill_pack=is_skill_pack,
            skills=skills,
            sha256=job.downloaded.sha256 if job.downloaded else "",
            warnings=warnings,
        )
        job.preflight = preflight
        job.phase = InstallPhase.AWAITING_CONFIRMATION
        job.state = InstallState.AWAITING_CONFIRMATION
        job.progress = 0.7
        job.emit("preflight_completed", preflight=preflight.to_dict())
        self.registry.update_job(
            job.job_id,
            phase="awaiting_confirmation",
            status="awaiting_confirmation",
            progress=0.7,
            permissions_requested_json=permissions,
            metadata_json={"preflight": preflight.to_dict()},
        )
        return preflight

    def _perform_install(self, job: InstallJob, quarantine_path: Path) -> Path:
        job.phase = InstallPhase.INSTALLING
        job.progress = 0.8
        job.state = InstallState.RUNNING
        job.emit("phase_change", phase="installing")
        self.registry.update_job(job.job_id, phase="installing", status="running", progress=0.8)

        base_dir = _get_plugins_base_dir()
        plugin_id = job.preflight.plugin_id
        version = job.preflight.version
        install_dir = base_dir / "installed" / plugin_id / version

        if install_dir.exists():
            rollback_dir = base_dir / "rollback" / plugin_id
            rollback_dir.mkdir(parents=True, exist_ok=True)
            existing = self.registry.get_plugin(plugin_id)
            if existing:
                old_path = Path(existing.install_path)
                if old_path.exists():
                    rollback_target = rollback_dir / existing.version
                    if rollback_target.exists():
                        shutil.rmtree(rollback_target)
                    shutil.copytree(old_path, rollback_target)

        install_dir.parent.mkdir(parents=True, exist_ok=True)
        if install_dir.exists():
            shutil.rmtree(install_dir)
        shutil.copytree(quarantine_path, install_dir)

        job.install_path = install_dir
        job.emit("files_installed", path=str(install_dir))
        return install_dir

    def _register(self, job: InstallJob, install_path: Path) -> None:
        job.phase = InstallPhase.REGISTERING
        job.progress = 0.9
        job.emit("phase_change", phase="registering")
        self.registry.update_job(job.job_id, phase="registering", progress=0.9)

        preflight = job.preflight

        if preflight.is_skill_pack and job.skill_pack_manifest:
            pack = InstalledSkillPack(
                pack_id=preflight.plugin_id,
                version=preflight.version,
                name=preflight.name,
                category=preflight.category,
                install_path=str(install_path),
                skills_count=len(preflight.skills),
                total_size=preflight.total_size,
                skills=preflight.skills,
            )
            self.registry.register_skill_pack(pack)

            for skill_entry in job.skill_pack_manifest.skills:
                skill_path = install_path / skill_entry["path"]
                skill_id = f"{preflight.plugin_id}.{skill_entry['id']}"
                skill = InstalledSkill(
                    skill_id=skill_id,
                    name=skill_entry["id"],
                    path=str(skill_path),
                    pack_id=preflight.plugin_id,
                    primary_category=preflight.category,
                    domains=skill_entry.get("domains", []),
                    tags=skill_entry.get("tags", []),
                    license=skill_entry.get("license", ""),
                    source_url=skill_entry.get("source_url", ""),
                    enabled=skill_entry.get("default_enabled", True),
                    classification_confidence=1.0,
                    classification_source="pack_manifest",
                )
                self.registry.register_skill(skill)
        else:
            manifest = job.manifest
            plugin = InstalledPlugin(
                plugin_id=manifest.id,
                version=manifest.version,
                name=manifest.name,
                publisher_id=manifest.publisher.id,
                publisher_name=manifest.publisher.name,
                description=manifest.description,
                install_path=str(install_path),
                manifest_path=str(install_path / "karna-plugin.json"),
                status=PluginStatus.ACTIVE,
                permissions=manifest.permissions,
                platforms=manifest.compatibility.platforms,
                source_type=preflight.source_type,
                source_url=preflight.source_url,
                source_version=preflight.version,
                sha256=preflight.sha256,
                entrypoints=preflight.entrypoints,
                capabilities=preflight.capabilities,
                category=preflight.category,
                is_builtin=False,
            )
            self.registry.register_plugin(plugin)

            for skill_rel in manifest.entrypoints.skills:
                skill_dir = install_path / skill_rel
                if skill_dir.exists() and skill_dir.is_dir():
                    for skill_md in skill_dir.glob("**/SKILL.md"):
                        skill_name = skill_md.parent.name
                        skill_id = f"{manifest.id}.{skill_name}"
                        skill = InstalledSkill(
                            skill_id=skill_id,
                            name=skill_name,
                            path=str(skill_md.parent),
                            plugin_id=manifest.id,
                            primary_category=preflight.category,
                            enabled=True,
                            is_builtin=False,
                        )
                        self.registry.register_skill(skill)

    def _verify(self, job: InstallJob) -> bool:
        job.phase = InstallPhase.VERIFYING
        job.progress = 0.95
        job.emit("phase_change", phase="verifying")
        self.registry.update_job(job.job_id, phase="verifying", progress=0.95)

        install_path = job.install_path
        if not install_path or not install_path.exists():
            raise RuntimeError("Install path does not exist after install")

        plugin = self.registry.get_plugin(job.preflight.plugin_id)
        if job.preflight.is_skill_pack:
            pack = None
            for p in self.registry.get_all_skill_packs():
                if p.pack_id == job.preflight.plugin_id:
                    pack = p
                    break
            if not pack:
                raise RuntimeError("Skill pack not registered after install")
        else:
            if not plugin:
                raise RuntimeError("Plugin not registered after install")

        health_status = "ready"
        if plugin:
            self.registry.update_plugin_status(plugin.plugin_id, PluginStatus.ACTIVE, health_status)

        job.progress = 1.0
        job.phase = InstallPhase.ACTIVE
        job.state = InstallState.COMPLETED
        job.emit("completed")
        self.registry.update_job(
            job.job_id,
            phase="active",
            status="completed",
            progress=1.0,
            permissions_granted_json=[],
        )

        receipt = InstallReceipt(
            job_id=job.job_id,
            operation=job.operation,
            plugin_id=job.preflight.plugin_id,
            version=job.preflight.version,
            timestamp=time.time(),
            status="completed",
            source_type=job.preflight.source_type,
            source_url=job.preflight.source_url,
            sha256=job.preflight.sha256,
            files_installed=job.preflight.files_count,
            total_size=job.preflight.total_size,
            permissions_requested=job.preflight.permissions,
            permissions_granted=[],
            security_report={"verdict": job.preflight.security_verdict, "issues": job.preflight.security_issues},
        )
        self.registry.save_receipt(receipt)

        self._cleanup_staging(job)
        return True

    def _cleanup_staging(self, job: InstallJob) -> None:
        base_dir = _get_plugins_base_dir()
        staging_dir = base_dir / "staging" / job.job_id
        quarantine_dir = base_dir / "quarantine" / job.job_id
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)
        if quarantine_dir.exists():
            shutil.rmtree(quarantine_dir, ignore_errors=True)

    def preflight(self, source: str) -> Tuple[InstallJob, PreflightReport]:
        job = self.create_job(source)
        try:
            resolved = self._resolve(job)
            downloaded = self._download(job, resolved)
            quarantine_path = self._quarantine(job, downloaded)
            preflight = self._preflight(job, quarantine_path)
            return job, preflight
        except Exception as e:
            job.state = InstallState.FAILED
            job.error = str(e)
            job.phase = InstallPhase.FAILED
            self.registry.update_job(job.job_id, status="failed", error=str(e))
            job.emit("failed", error=str(e))
            self._cleanup_staging(job)
            raise

    def confirm_and_install(self, job_id: str, granted_permissions: Optional[List[str]] = None) -> bool:
        job = self._jobs.get(job_id)
        if not job:
            raise ValueError(f"Job not found: {job_id}")
        if job.state != InstallState.AWAITING_CONFIRMATION:
            raise RuntimeError(f"Job not awaiting confirmation: state={job.state}")

        try:
            install_path = self._perform_install(job, job.quarantine_path)
            self._register(job, install_path)
            self._verify(job)
            return True
        except Exception as e:
            job.state = InstallState.FAILED
            job.error = str(e)
            job.phase = InstallPhase.FAILED
            self.registry.update_job(job.job_id, status="failed", error=str(e))
            job.emit("failed", error=str(e))
            self._cleanup_staging(job)
            raise

    def install(self, source: str, auto_confirm: bool = False, granted_permissions: Optional[List[str]] = None) -> InstallJob:
        job, preflight = self.preflight(source)
        if auto_confirm:
            self.confirm_and_install(job.job_id, granted_permissions)
        return job

    def uninstall(self, plugin_id: str) -> bool:
        plugin = self.registry.get_plugin(plugin_id)
        if not plugin:
            return False
        self.registry.remove_plugin(plugin_id)
        return True

    def rollback(self, plugin_id: str) -> bool:
        plugin = self.registry.get_plugin(plugin_id)
        if not plugin:
            return False

        base_dir = _get_plugins_base_dir()
        rollback_dir = base_dir / "rollback" / plugin_id
        if not rollback_dir.exists():
            return False

        versions = sorted([d for d in rollback_dir.iterdir() if d.is_dir()])
        if not versions:
            return False

        prev_version = versions[-1]
        install_dir = Path(plugin.install_path).parent / prev_version.name
        if install_dir.exists():
            shutil.rmtree(install_dir)
        shutil.copytree(prev_version, install_dir)

        self.registry.update_plugin_status(plugin_id, PluginStatus.ROLLED_BACK)
        shutil.rmtree(prev_version, ignore_errors=True)
        return True

    def check_updates(self) -> List[Dict[str, Any]]:
        updates = []
        plugins = self.registry.get_all_plugins(include_builtin=False)
        for plugin in plugins:
            try:
                candidate = self.check_update(plugin.plugin_id)
                if candidate:
                    updates.append(candidate)
            except Exception as e:
                logger.debug(f"Update check failed for {plugin.plugin_id}: {e}")
        return updates

    def check_update(self, plugin_id: str) -> Optional[Any]:
        plugin = self.registry.get_plugin(plugin_id)
        if not plugin:
            raise ValueError(f"Plugin not found: {plugin_id}")
        if not plugin.source_url:
            return None
        try:
            adapter = get_source_adapter(plugin.source_url)
            candidate = adapter.check_update(
                plugin.plugin_id,
                plugin.version,
                {"source_url": plugin.source_url, "source_type": plugin.source_type},
            )
            return candidate
        except Exception as e:
            logger.debug(f"Update check failed for {plugin_id}: {e}")
            return None

    def update(self, plugin_id: str) -> InstallJob:
        plugin = self.registry.get_plugin(plugin_id)
        if not plugin:
            raise ValueError(f"Plugin not found: {plugin_id}")
        if not plugin.source_url:
            raise ValueError(f"Plugin {plugin_id} has no source URL for update")
        job = self.install(plugin.source_url, auto_confirm=True)
        return job

    def enable_plugin(self, plugin_id: str) -> bool:
        plugin = self.registry.get_plugin(plugin_id)
        if not plugin:
            raise ValueError(f"Plugin not found: {plugin_id}")
        self.registry.set_plugin_enabled(plugin_id, True)
        return True

    def disable_plugin(self, plugin_id: str) -> bool:
        plugin = self.registry.get_plugin(plugin_id)
        if not plugin:
            raise ValueError(f"Plugin not found: {plugin_id}")
        self.registry.set_plugin_enabled(plugin_id, False)
        return True

    def set_permissions(self, plugin_id: str, permissions: List[str]) -> bool:
        plugin = self.registry.get_plugin(plugin_id)
        if not plugin:
            raise ValueError(f"Plugin not found: {plugin_id}")
        self.registry.set_plugin_permissions_granted(plugin_id, permissions)
        return True

    def run_health_check(self, plugin_id: str) -> Dict[str, Any]:
        plugin = self.registry.get_plugin(plugin_id)
        if not plugin:
            raise ValueError(f"Plugin not found: {plugin_id}")

        report = {
            "plugin_id": plugin_id,
            "status": "unknown",
            "checks": [],
            "checked_at": time.time(),
        }

        install_path = Path(plugin.install_path)
        if not install_path.exists():
            report["status"] = "error"
            report["checks"].append({"name": "install_path", "status": "fail", "message": "Install path does not exist"})
            return report

        report["checks"].append({"name": "install_path", "status": "pass"})

        manifest_path = install_path / "karna-plugin.json"
        if manifest_path.exists():
            report["checks"].append({"name": "manifest", "status": "pass"})
        else:
            report["checks"].append({"name": "manifest", "status": "warn", "message": "No manifest found"})

        entrypoints = plugin.entrypoints if isinstance(plugin.entrypoints, dict) else {}
        for ep_type, ep_paths in entrypoints.items():
            if isinstance(ep_paths, list):
                for ep_path in ep_paths:
                    full_path = install_path / ep_path
                    if full_path.exists():
                        report["checks"].append({"name": f"entrypoint:{ep_type}:{ep_path}", "status": "pass"})
                    else:
                        report["checks"].append({"name": f"entrypoint:{ep_type}:{ep_path}", "status": "warn", "message": "Entrypoint path missing"})

        failed = [c for c in report["checks"] if c["status"] == "fail"]
        warned = [c for c in report["checks"] if c["status"] == "warn"]
        if failed:
            report["status"] = "error"
        elif warned:
            report["status"] = "degraded"
        else:
            report["status"] = "ready"

        self.registry.update_plugin_health(plugin_id, report["status"])
        return report

    def preflight_skill_pack(self, source: str) -> Tuple[InstallJob, PreflightReport]:
        return self.preflight(source)

    def install_skill_pack(self, source: str, auto_confirm: bool = False, granted_permissions: Optional[List[str]] = None) -> InstallJob:
        return self.install(source, auto_confirm=auto_confirm, granted_permissions=granted_permissions)

    def import_codex(self, source: str) -> InstallJob:
        return self.install(source, auto_confirm=True)

    def _get_builtin_plugins_dir(self) -> Optional[Path]:
        resources_dir = os.environ.get("KARNA_RESOURCES_DIR")
        if resources_dir:
            p = Path(resources_dir) / "builtin-plugins"
            if p.exists():
                return p

        try:
            repo_dir = Path(__file__).parent.parent.parent.resolve()
            dev_builtin = repo_dir / "karna-builtin" / "plugins"
            if dev_builtin.exists():
                return dev_builtin
        except Exception:
            pass

        try:
            import sys
            if getattr(sys, "frozen", False):
                exe_dir = Path(sys.executable).parent
                for candidate in [
                    exe_dir / "resources" / "builtin-plugins",
                    exe_dir / "builtin-plugins",
                    exe_dir.parent / "Resources" / "builtin-plugins",
                ]:
                    if candidate.exists():
                        return candidate
        except Exception:
            pass

        return None

    def _get_builtin_skills_dir(self) -> Optional[Path]:
        resources_dir = os.environ.get("KARNA_RESOURCES_DIR")
        if resources_dir:
            p = Path(resources_dir) / "builtin-skills"
            if p.exists():
                return p

        try:
            repo_dir = Path(__file__).parent.parent.parent.resolve()
            dev_builtin = repo_dir / "karna-builtin" / "skills"
            if dev_builtin.exists():
                return dev_builtin
        except Exception:
            pass

        try:
            import sys
            if getattr(sys, "frozen", False):
                exe_dir = Path(sys.executable).parent
                for candidate in [
                    exe_dir / "resources" / "builtin-skills",
                    exe_dir / "builtin-skills",
                    exe_dir.parent / "Resources" / "builtin-skills",
                ]:
                    if candidate.exists():
                        return candidate
        except Exception:
            pass

        return None

    def _discover_builtin_plugins(self) -> None:
        import os

        plugins_dir = self._get_builtin_plugins_dir()
        if not plugins_dir:
            logger.debug("No builtin plugins directory found")
            return

        current_platform = _current_platform()
        now = time.time()

        for plugin_dir in sorted(plugins_dir.iterdir()):
            if not plugin_dir.is_dir():
                continue
            manifest_path = plugin_dir / "karna-plugin.json"
            if not manifest_path.exists():
                continue

            try:
                manifest = parse_plugin_manifest(plugin_dir)
            except Exception as e:
                logger.warning(f"Invalid builtin plugin manifest at {plugin_dir}: {e}")
                import traceback
                logger.debug(traceback.format_exc())
                continue

            platforms = manifest.compatibility.platforms if manifest.compatibility else []
            is_compatible = not platforms or any(
                current_platform.startswith(p) or p == "all" for p in platforms
            )

            health_status = "ready" if is_compatible else "unsupported_platform"

            plugin = InstalledPlugin(
                plugin_id=manifest.id,
                version=manifest.version,
                name=manifest.name,
                publisher_id=manifest.publisher.id if manifest.publisher else "karna",
                publisher_name=manifest.publisher.name if manifest.publisher else "Karna",
                description=manifest.description or "",
                install_path=str(plugin_dir),
                manifest_path=str(manifest_path),
                status=PluginStatus.ACTIVE if is_compatible else PluginStatus.DISABLED,
                permissions=manifest.permissions or [],
                permissions_granted=[],
                platforms=platforms,
                source_type="builtin",
                source_url="",
                category=manifest.interface.category if manifest.interface else "uncategorized",
                capabilities=manifest.interface.capabilities if manifest.interface else [],
                entrypoints={
                    k: v for k, v in {
                        "skills": manifest.entrypoints.skills if manifest.entrypoints else [],
                        "mcp": manifest.entrypoints.mcp if manifest.entrypoints else [],
                        "connectors": manifest.entrypoints.connectors if manifest.entrypoints else [],
                        "workflows": manifest.entrypoints.workflows if manifest.entrypoints else [],
                        "writer_forms": manifest.entrypoints.writer_forms if manifest.entrypoints else [],
                    }.items() if v
                },
                is_builtin=True,
                is_active_version=True,
                installed_at=now,
                updated_at=now,
                health_status=health_status,
            )

            self.registry.register_plugin(plugin)

            if manifest.entrypoints and manifest.entrypoints.skills:
                for skills_rel in manifest.entrypoints.skills:
                    skills_path = plugin_dir / skills_rel
                    if not skills_path.exists():
                        continue
                    self._discover_builtin_skills(skills_path, manifest.id)

        builtin_skills_dir = self._get_builtin_skills_dir()
        if builtin_skills_dir and builtin_skills_dir.exists():
            self._discover_builtin_skills(builtin_skills_dir, "karna.core")

        core_plugin = InstalledPlugin(
            plugin_id="karna.core",
            version="2026.07.1",
            name="Karna Core Skills",
            publisher_id="karna",
            publisher_name="Karna",
            description="30 essential skills bundled with Karna",
            install_path=str(builtin_skills_dir) if builtin_skills_dir else "",
            manifest_path=str(builtin_skills_dir / "karna-skill-pack.json") if builtin_skills_dir else "",
            status=PluginStatus.ACTIVE,
            permissions=[],
            permissions_granted=[],
            platforms=[_current_platform()],
            source_type="builtin",
            source_url="",
            category="core",
            capabilities=["skills"],
            entrypoints={"skills": ["."]},
            is_builtin=True,
            is_active_version=True,
            installed_at=now,
            updated_at=now,
            health_status="ready",
        )
        self.registry.register_plugin(core_plugin)

    def _discover_builtin_skills(self, skills_dir: Path, plugin_id: str) -> None:
        if not skills_dir.exists() or not skills_dir.is_dir():
            return

        now = time.time()
        for skill_dir in sorted(skills_dir.iterdir()):
            if not skill_dir.is_dir():
                continue
            if skill_dir.name.startswith(".") or skill_dir.name.startswith("_"):
                continue
            skill_md = skill_dir / "SKILL.md"
            if not skill_md.exists():
                continue

            skill_id = skill_dir.name
            name = skill_id
            description = ""
            category = "uncategorized"
            domains: List[str] = []
            tags: List[str] = []
            language = ""
            risk_level = "low"

            try:
                content = skill_md.read_text(encoding="utf-8", errors="replace")
                lines = content.split("\n")

                in_frontmatter = False
                frontmatter_parsed = False
                for i, line in enumerate(lines[:80]):
                    stripped = line.strip()
                    if stripped == "---" and i == 0:
                        in_frontmatter = True
                        continue
                    if stripped == "---" and in_frontmatter:
                        in_frontmatter = False
                        frontmatter_parsed = True
                        continue
                    if in_frontmatter and ":" in stripped:
                        key, _, val = stripped.partition(":")
                        key = key.strip().lower()
                        val = val.strip().strip('"').strip("'")
                        if key == "name":
                            name = val or name
                        elif key == "description":
                            description = val
                        elif key == "primary_category" or key == "category":
                            category = val or category
                        elif key == "domains":
                            domains = [v.strip().strip('"').strip("'") for v in val.strip("[]").split(",") if v.strip()]
                        elif key == "tags":
                            tags = [v.strip().strip('"').strip("'") for v in val.strip("[]").split(",") if v.strip()]
                        elif key == "language":
                            language = val
                        elif key == "risk_level":
                            risk_level = val

                if not frontmatter_parsed:
                    for line in lines[:30]:
                        if line.startswith("# "):
                            name = line.lstrip("# ").strip()
                            break
            except Exception as e:
                logger.debug(f"Error parsing skill {skill_dir}: {e}")

            skill = InstalledSkill(
                skill_id=skill_id,
                name=name,
                path=str(skill_dir),
                plugin_id=plugin_id,
                primary_category=category,
                domains=domains,
                tags=tags,
                language=language or "zh",
                risk_level=risk_level,
                enabled=True,
                is_builtin=True,
                classification_confidence=1.0,
                classification_source="builtin_manifest",
            )
            self.registry.register_skill(skill)
