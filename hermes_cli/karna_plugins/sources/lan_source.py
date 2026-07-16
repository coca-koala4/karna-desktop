from __future__ import annotations

import logging
import shutil
import uuid
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlparse, unquote

from .base import (
    DownloadedPackage,
    PluginSourceAdapter,
    ResolvedSource,
    UpdateCandidate,
    register_adapter,
)
from .url_source import UrlSource
from ..security import compute_sha256

logger = logging.getLogger(__name__)


@register_adapter
class LanSource(PluginSourceAdapter):
    source_type = "lan"

    def __init__(self):
        self._url_source = UrlSource()

    def can_handle(self, source: str) -> bool:
        if not source:
            return False
        source_lower = source.lower()

        if source_lower.startswith("\\\\") or source_lower.startswith("//"):
            return True

        parsed = urlparse(source)
        if parsed.scheme in ("file", "smb", "cifs"):
            return True

        if source_lower.startswith("lan:"):
            return True

        return False

    def _to_local_path(self, source: str) -> Path:
        clean = source
        if clean.lower().startswith("lan:"):
            clean = clean[4:]

        if clean.startswith("file://"):
            clean = unquote(clean[7:])
            if clean.startswith("/") and len(clean) > 2 and clean[2] == ":":
                clean = clean[1:]
        elif clean.startswith("\\\\") or clean.startswith("//"):
            clean = clean.replace("/", "\\")

        path = Path(clean)
        if not path.exists():
            raise FileNotFoundError(f"LAN/SMB path not found: {source}")
        return path

    def resolve(self, source: str) -> ResolvedSource:
        parsed = urlparse(source)

        if parsed.scheme in ("http", "https"):
            resolved = self._url_source.resolve(source, allow_lan=True)
            resolved.source_type = self.source_type
            resolved.metadata["is_lan"] = True
            resolved.metadata["lan_warning"] = "Local network source — not officially verified"
            return resolved

        try:
            path = self._to_local_path(source)
        except FileNotFoundError:
            raise

        sha = compute_sha256(path) if path.is_file() else ""
        version = "0.0.0-lan"

        return ResolvedSource(
            source_type=self.source_type,
            source_url=str(path),
            version=version,
            resolved_id=path.stem if path.is_file() else path.name,
            metadata={
                "is_lan": True,
                "lan_warning": "Local network source — not officially verified",
                "file_hash": sha,
                "original_source": source,
            },
        )

    def download(self, resolved: ResolvedSource, staging_dir: Path) -> DownloadedPackage:
        parsed = urlparse(resolved.source_url)

        if parsed.scheme in ("http", "https"):
            return self._url_source.download(resolved, staging_dir)

        staging_dir.mkdir(parents=True, exist_ok=True)
        job_id = str(uuid.uuid4())[:8]
        source_path = Path(resolved.source_url)

        if source_path.is_file():
            suffix = source_path.suffix
            dest = staging_dir / f"{job_id}_{source_path.name}"
            shutil.copy2(source_path, dest)

            sha = compute_sha256(dest)
            is_zip = suffix.lower() in {".zip", ".karna-plugin", ".karna-skill-pack"}

            return DownloadedPackage(
                source_type=self.source_type,
                source_url=resolved.source_url,
                version=resolved.version,
                local_path=dest,
                sha256=sha,
                is_zip=is_zip,
                files_count=1,
                total_size=dest.stat().st_size,
                metadata=resolved.metadata,
            )
        elif source_path.is_dir():
            import zipfile
            zip_dest = staging_dir / f"{job_id}_dir.zip"
            with zipfile.ZipFile(zip_dest, "w", zipfile.ZIP_DEFLATED) as zf:
                for f in source_path.rglob("*"):
                    if f.is_file():
                        rel = f.relative_to(source_path)
                        zf.write(f, str(rel))

            sha = compute_sha256(zip_dest)
            file_count = sum(1 for f in source_path.rglob("*") if f.is_file())
            total_size = sum(f.stat().st_size for f in source_path.rglob("*") if f.is_file())

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
        else:
            raise ValueError(f"Unsupported LAN source: {resolved.source_url}")

    def check_update(self, plugin_id: str, current_version: str, metadata: Dict[str, Any]) -> Optional[UpdateCandidate]:
        return None
