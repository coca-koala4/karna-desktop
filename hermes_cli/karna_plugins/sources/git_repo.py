from __future__ import annotations

import logging
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Any, Dict, Optional

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
class GitRepoSource(PluginSourceAdapter):
    source_type = "git"

    def can_handle(self, source: str) -> bool:
        if not source:
            return False
        return (
            source.endswith(".git")
            or source.startswith("git@")
            or source.startswith("git://")
            or (source.startswith(("http://", "https://")) and "/tree/" in source or "/blob/" in source)
            or (source.startswith(("http://", "https://")) and "github.com" in source and not "/releases" in source)
        )

    def resolve(self, source: str) -> ResolvedSource:
        try:
            result = subprocess.run(
                ["git", "ls-remote", source, "HEAD"],
                capture_output=True, text=True, timeout=30,
                encoding="utf-8", errors="replace",
            )
            if result.returncode != 0:
                logger.debug(f"git ls-remote failed: {result.stderr}")
                commit_sha = ""
            else:
                output = result.stdout.strip()
                commit_sha = output.split()[0] if output else ""
        except Exception as e:
            logger.debug(f"Could not resolve git ref: {e}")
            commit_sha = ""

        version = f"0.0.0-git+{commit_sha[:7]}" if commit_sha else "0.0.0-git"

        return ResolvedSource(
            source_type=self.source_type,
            source_url=source,
            version=version,
            commit_sha=commit_sha,
            metadata={"git_url": self._sanitize_git_url(source)},
        )

    def _sanitize_git_url(self, url: str) -> str:
        import re
        return re.sub(r"(https?://)[^@/]+@", r"\1", url)

    def download(self, resolved: ResolvedSource, staging_dir: Path) -> DownloadedPackage:
        staging_dir.mkdir(parents=True, exist_ok=True)
        job_id = str(uuid.uuid4())[:8]
        dest = staging_dir / f"{job_id}_git_repo"

        try:
            cmd = ["git", "clone", "--depth", "1", "--single-branch"]
            cmd.append(resolved.source_url)
            cmd.append(str(dest))
            subprocess.run(cmd, check=True, capture_output=True, timeout=120)

            if resolved.commit_sha:
                subprocess.run(
                    ["git", "checkout", resolved.commit_sha],
                    cwd=str(dest), check=True, capture_output=True, timeout=30,
                )
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"Git clone failed: {e.stderr.decode() if e.stderr else str(e)}")
        except FileNotFoundError:
            raise RuntimeError("Git is not installed or not available in PATH")

        git_dir = dest / ".git"
        if git_dir.exists():
            shutil.rmtree(git_dir, ignore_errors=True)

        file_count = sum(1 for f in dest.rglob("*") if f.is_file())
        total_size = sum(f.stat().st_size for f in dest.rglob("*") if f.is_file())

        zip_dest = staging_dir / f"{job_id}_repo.zip"
        self._dir_to_zip(dest, zip_dest)
        shutil.rmtree(dest, ignore_errors=True)

        sha = compute_sha256(zip_dest)

        return DownloadedPackage(
            source_type=self.source_type,
            source_url=resolved.source_url,
            version=resolved.version,
            local_path=zip_dest,
            sha256=sha,
            is_zip=True,
            files_count=file_count,
            total_size=total_size,
            metadata={**resolved.metadata, "commit_sha": resolved.commit_sha},
        )

    def _dir_to_zip(self, src_dir: Path, zip_path: Path) -> None:
        import zipfile
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for f in src_dir.rglob("*"):
                if f.is_file():
                    rel = f.relative_to(src_dir)
                    zf.write(f, str(rel))

    def check_update(self, plugin_id: str, current_version: str, metadata: Dict[str, Any]) -> Optional[UpdateCandidate]:
        git_url = metadata.get("git_url")
        if not git_url:
            return None
        try:
            result = subprocess.run(
                ["git", "ls-remote", git_url, "HEAD"],
                capture_output=True, text=True, timeout=30,
            )
            if result.returncode == 0 and result.stdout.strip():
                latest_sha = result.stdout.strip().split()[0]
                if not current_version.endswith(latest_sha[:7]):
                    return UpdateCandidate(
                        plugin_id=plugin_id,
                        current_version=current_version,
                        new_version=f"0.0.0-git+{latest_sha[:7]}",
                        download_url=git_url,
                    )
        except Exception as e:
            logger.debug(f"Git update check failed: {e}")
        return None
