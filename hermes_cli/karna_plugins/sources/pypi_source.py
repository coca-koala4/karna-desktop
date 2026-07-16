from __future__ import annotations

import json
import logging
import shutil
import uuid
import zipfile
import tarfile
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
class PyPISource(PluginSourceAdapter):
    source_type = "pypi"

    def can_handle(self, source: str) -> bool:
        if not source:
            return False
        return source.startswith("pypi:") or source.startswith("pypi/") or source == "pypi"

    def _package_name(self, source: str) -> str:
        if source.startswith("pypi:"):
            return source[5:]
        if source.startswith("pypi/"):
            return source[5:]
        return source

    def resolve(self, source: str) -> ResolvedSource:
        pkg_name = self._package_name(source)
        if not pkg_name or pkg_name == "pypi":
            raise ValueError("Please specify a PyPI package name: pypi:<package-name>")

        api_url = f"https://pypi.org/pypi/{pkg_name}/json"
        req = urllib.request.Request(api_url, headers={"User-Agent": "Karna-Plugin-Installer/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
        except Exception as e:
            raise RuntimeError(f"Failed to fetch PyPI package info: {e}")

        version = data.get("info", {}).get("version", "0.0.0")
        urls = data.get("urls", [])
        wheel_url = None
        sdist_url = None

        for u in urls:
            if u.get("packagetype") == "bdist_wheel":
                wheel_url = u
            elif u.get("packagetype") == "sdist":
                sdist_url = u

        download_info = wheel_url or sdist_url
        if not download_info:
            raise ValueError(f"No suitable distribution found for PyPI package {pkg_name}")

        return ResolvedSource(
            source_type=self.source_type,
            source_url=download_info.get("url", ""),
            version=version,
            resolved_id=pkg_name,
            metadata={
                "package_name": pkg_name,
                "package_type": download_info.get("packagetype"),
                "pypi_sha256": download_info.get("digests", {}).get("sha256", ""),
            },
        )

    def download(self, resolved: ResolvedSource, staging_dir: Path) -> DownloadedPackage:
        staging_dir.mkdir(parents=True, exist_ok=True)
        job_id = str(uuid.uuid4())[:8]
        pkg_type = resolved.metadata.get("package_type", "sdist")

        if pkg_type == "bdist_wheel":
            pkg_ext = ".whl"
        else:
            pkg_ext = ".tar.gz"

        pkg_dest = staging_dir / f"{job_id}_package{pkg_ext}"
        extract_dir = staging_dir / f"{job_id}_extracted"
        extract_dir.mkdir(parents=True, exist_ok=True)

        req = urllib.request.Request(resolved.source_url, headers={"User-Agent": "Karna-Plugin-Installer/1.0"})
        with urllib.request.urlopen(req, timeout=120) as response, open(pkg_dest, "wb") as out_file:
            shutil.copyfileobj(response, out_file)

        if pkg_type == "bdist_wheel":
            with zipfile.ZipFile(pkg_dest, "r") as zf:
                zf.extractall(extract_dir)
        else:
            with tarfile.open(pkg_dest, "r:gz") as tf:
                tf.extractall(extract_dir)

        pkg_root = extract_dir
        subdirs = [d for d in extract_dir.iterdir() if d.is_dir()]
        if len(subdirs) == 1:
            pkg_root = subdirs[0]

        zip_dest = staging_dir / f"{job_id}_package.zip"
        with zipfile.ZipFile(zip_dest, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in pkg_root.rglob("*"):
                if f.is_file():
                    rel = f.relative_to(pkg_root)
                    zf.write(f, str(rel))

        shutil.rmtree(extract_dir, ignore_errors=True)
        pkg_dest.unlink(missing_ok=True)

        sha = compute_sha256(zip_dest)
        file_count = sum(1 for f in pkg_root.rglob("*") if f.is_file())
        total_size = sum(f.stat().st_size for f in pkg_root.rglob("*") if f.is_file())

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
                f"https://pypi.org/pypi/{pkg_name}/json",
                headers={"User-Agent": "Karna-Plugin-Installer/1.0"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
            latest = data.get("info", {}).get("version", "")
            if latest and latest != current_version:
                return UpdateCandidate(
                    plugin_id=plugin_id,
                    current_version=current_version,
                    new_version=latest,
                    download_url=f"https://pypi.org/project/{pkg_name}/",
                )
        except Exception as e:
            logger.debug(f"PyPI update check failed: {e}")
        return None
