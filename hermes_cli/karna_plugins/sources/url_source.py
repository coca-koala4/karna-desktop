from __future__ import annotations

import ipaddress
import logging
import socket
import uuid
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from .base import (
    DownloadedPackage,
    PluginSourceAdapter,
    ResolvedSource,
    UpdateCandidate,
    register_adapter,
)
from ..security import compute_sha256

logger = logging.getLogger(__name__)

INTERNAL_IP_RANGES = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("::1/128"),
]


def _is_private_ip(hostname: str) -> bool:
    try:
        addr_infos = socket.getaddrinfo(hostname, None)
        for info in addr_infos:
            ip_str = info[4][0]
            try:
                ip = ipaddress.ip_address(ip_str)
                for r in INTERNAL_IP_RANGES:
                    if ip in r:
                        return True
            except ValueError:
                continue
    except Exception:
        return False
    return False


@register_adapter
class UrlSource(PluginSourceAdapter):
    source_type = "url"

    def can_handle(self, source: str) -> bool:
        if not source:
            return False
        return source.lower().startswith(("https://", "http://"))

    def resolve(self, source: str, allow_lan: bool = False) -> ResolvedSource:
        parsed = urlparse(source)
        if parsed.scheme == "file":
            raise ValueError("file:// URLs are not allowed")

        if parsed.scheme == "http":
            hostname = parsed.hostname or ""
            is_local = hostname in ("localhost", "127.0.0.1", "::1")
            if not is_local and not allow_lan:
                if _is_private_ip(hostname):
                    raise ValueError(
                        f"Refusing to access private network address: {hostname}. "
                        "Use the LAN source adapter for explicit local network access."
                    )

        return ResolvedSource(
            source_type=self.source_type,
            source_url=source,
            version="0.0.0-url",
            metadata={"allow_lan": allow_lan},
        )

    def download(self, resolved: ResolvedSource, staging_dir: Path) -> DownloadedPackage:
        import urllib.request

        staging_dir.mkdir(parents=True, exist_ok=True)
        job_id = str(uuid.uuid4())[:8]

        url = resolved.source_url
        parsed = urlparse(url)
        filename = Path(parsed.path).name or f"download_{job_id}.zip"
        dest = staging_dir / f"{job_id}_{filename}"

        req = urllib.request.Request(url, headers={"User-Agent": "Karna-Plugin-Installer/1.0"})
        with urllib.request.urlopen(req, timeout=60) as response, open(dest, "wb") as out_file:
            import shutil
            shutil.copyfileobj(response, out_file)

        sha = compute_sha256(dest)
        is_zip = dest.suffix.lower() in {".zip", ".karna-plugin", ".karna-skill-pack"}

        return DownloadedPackage(
            source_type=self.source_type,
            source_url=url,
            version=resolved.version,
            local_path=dest,
            sha256=sha,
            is_zip=is_zip,
            files_count=1,
            total_size=dest.stat().st_size,
            metadata=resolved.metadata,
        )

    def check_update(self, plugin_id: str, current_version: str, metadata: Dict[str, Any]) -> Optional[UpdateCandidate]:
        return None
