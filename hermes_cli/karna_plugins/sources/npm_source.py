from __future__ import annotations

import json
import logging
import shutil
import subprocess
import tarfile
import uuid
from pathlib import Path
from typing import Any, Dict, Optional
import urllib.request

from .base import (
    DownloadedPackage,
    PluginSourceAdapter,
    ResolvedSource,
    UpdateCandidate,
    register_adapter,
)
from ..security import compute_sha256

logger = logging.getLogger(__name__)


@register_adapter
class NpmSource(PluginSourceAdapter):
    source_type = "npm"

    def can_handle(self, source: str) -> bool:
        if not source:
            return False
        return source.startswith("npm:") or source.startswith("npm/") or source == "npm"

    def _package_name(self, source: str) -> str:
        if source.startswith("npm:"):
            return source[4:]
        if source.startswith("npm/"):
            return source[4:]
        return source

    def resolve(self, source: str) -> ResolvedSource:
        pkg_name = self._package_name(source)
        if not pkg_name or pkg_name == "npm":
            raise ValueError("Please specify an npm package name: npm:<package-name>")

        registry_url = f"https://registry.npmjs.org/{pkg_name}/latest"
        req = urllib.request.Request(registry_url, headers={"User-Agent": "Karna-Plugin-Installer/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
        except Exception as e:
            raise RuntimeError(f"Failed to fetch npm package info: {e}")

        version = data.get("version", "0.0.0")
        tarball_url = data.get("dist", {}).get("tarball", "")
        if not tarball_url:
            raise ValueError(f"No tarball found for npm package {pkg_name}")

        return ResolvedSource(
            source_type=self.source_type,
            source_url=tarball_url,
            version=version,
            resolved_id=pkg_name,
            metadata={"package_name": pkg_name, "npm_shasum": data.get("dist", {}).get("shasum", "")},
        )

    def download(self, resolved: ResolvedSource, staging_dir: Path) -> DownloadedPackage:
        staging_dir.mkdir(parents=True, exist_ok=True)
        job_id = str(uuid.uuid4())[:8]
        tarball_dest = staging_dir / f"{job_id}_package.tgz"
        extract_dir = staging_dir / f"{job_id}_extracted"
        extract_dir.mkdir(parents=True, exist_ok=True)

        req = urllib.request.Request(resolved.source_url, headers={"User-Agent": "Karna-Plugin-Installer/1.0"})
        with urllib.request.urlopen(req, timeout=120) as response, open(tarball_dest, "wb") as out_file:
            shutil.copyfileobj(response, out_file)

        with tarfile.open(tarball_dest, "r:gz") as tf:
            tf.extractall(extract_dir)

        package_dir = extract_dir / "package"
        if not package_dir.exists():
            package_dir = extract_dir

        zip_dest = staging_dir / f"{job_id}_package.zip"
        import zipfile
        with zipfile.ZipFile(zip_dest, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in package_dir.rglob("*"):
                if f.is_file():
                    rel = f.relative_to(package_dir)
                    zf.write(f, str(rel))

        shutil.rmtree(extract_dir, ignore_errors=True)
        tarball_dest.unlink(missing_ok=True)

        sha = compute_sha256(zip_dest)
        file_count = sum(1 for f in package_dir.rglob("*") if f.is_file()) if package_dir.exists() else 0
        total_size = sum(f.stat().st_size for f in package_dir.rglob("*") if f.is_file()) if package_dir.exists() else 0

        return DownloadedPackage(
            source_type=self.source_type,
            source_url=resolved.source_url,
            version=resolved.version,
            local_path=zip_dest,
            sha256=sha,
            is_zip=True,
            files_count=file_count,
            total_size=total_size,
            metadata=resolved.metadata,
        )

    def check_update(self, plugin_id: str, current_version: str, metadata: Dict[str, Any]) -> Optional[UpdateCandidate]:
        pkg_name = metadata.get("package_name")
        if not pkg_name:
            return None
        try:
            req = urllib.request.Request(
                f"https://registry.npmjs.org/{pkg_name}/latest",
                headers={"User-Agent": "Karna-Plugin-Installer/1.0"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
            latest = data.get("version", "")
            if latest and latest != current_version:
                return UpdateCandidate(
                    plugin_id=plugin_id,
                    current_version=current_version,
                    new_version=latest,
                    download_url=data.get("dist", {}).get("tarball", ""),
                )
        except Exception as e:
            logger.debug(f"npm update check failed: {e}")
        return None
