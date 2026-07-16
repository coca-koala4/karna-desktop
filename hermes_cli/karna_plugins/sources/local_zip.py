from __future__ import annotations

import logging
import shutil
import uuid
import zipfile
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

ZIP_EXTENSIONS = {".zip", ".karna-plugin", ".karna-skill-pack"}


@register_adapter
class LocalZipSource(PluginSourceAdapter):
    source_type = "local_zip"

    def can_handle(self, source: str) -> bool:
        if not source:
            return False
        source_lower = source.lower()
        if source_lower.startswith(("http://", "https://", "git@", "git://")):
            return False
        path = Path(source)
        return path.suffix.lower() in ZIP_EXTENSIONS and path.exists()

    def resolve(self, source: str) -> ResolvedSource:
        path = Path(source).resolve()
        if not path.exists():
            raise FileNotFoundError(f"ZIP file not found: {source}")

        sha = compute_sha256(path)
        version = "0.0.0-local"
        resolved_id = path.stem

        try:
            with zipfile.ZipFile(path, "r") as zf:
                manifest_names = [
                    n for n in zf.namelist()
                    if n.endswith("karna-plugin.json") or n.endswith("karna-skill-pack.json")
                ]
                if manifest_names:
                    import json
                    manifest_name = manifest_names[0]
                    with zf.open(manifest_name) as f:
                        manifest = json.load(f)
                        version = manifest.get("version", version)
                        resolved_id = manifest.get("id", resolved_id)
        except Exception as e:
            logger.debug(f"Could not parse manifest from ZIP: {e}")

        return ResolvedSource(
            source_type=self.source_type,
            source_url=str(path),
            version=version,
            resolved_id=resolved_id,
            metadata={"file_hash": sha, "original_path": str(path)},
        )

    def download(self, resolved: ResolvedSource, staging_dir: Path) -> DownloadedPackage:
        source_path = Path(resolved.source_url)
        staging_dir.mkdir(parents=True, exist_ok=True)
        job_id = str(uuid.uuid4())[:8]
        dest = staging_dir / f"{job_id}_{source_path.name}"
        shutil.copy2(source_path, dest)

        sha = compute_sha256(dest)
        file_count = 0
        total_size = 0

        try:
            with zipfile.ZipFile(dest, "r") as zf:
                file_count = len(zf.infolist())
                total_size = sum(i.file_size for i in zf.infolist())
        except Exception:
            pass

        return DownloadedPackage(
            source_type=self.source_type,
            source_url=resolved.source_url,
            version=resolved.version,
            local_path=dest,
            sha256=sha,
            is_zip=True,
            files_count=file_count,
            total_size=total_size,
            metadata=resolved.metadata,
        )

    def check_update(self, plugin_id: str, current_version: str, metadata: Dict[str, Any]) -> Optional[UpdateCandidate]:
        return None
