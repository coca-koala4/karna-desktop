from __future__ import annotations

import json
import logging
import os
import re
import urllib.request
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

GITHUB_RELEASE_RE = re.compile(
    r"^(?:https?://)?github\.com/(?P<owner>[^/]+)/(?P<repo>[^/]+)(?:/releases(?:/tag/(?P<tag>[^/]+))?)?(?:$|[/?#])"
)


@register_adapter
class GitHubReleaseSource(PluginSourceAdapter):
    source_type = "github_release"

    def __init__(self):
        self.github_token = os.environ.get("GITHUB_TOKEN", "")

    def can_handle(self, source: str) -> bool:
        return bool(GITHUB_RELEASE_RE.match(source))

    def _api_headers(self) -> Dict[str, str]:
        headers = {"Accept": "application/vnd.github+json", "User-Agent": "Karna-Plugin-Installer/1.0"}
        if self.github_token:
            headers["Authorization"] = f"Bearer {self.github_token}"
        return headers

    def resolve(self, source: str) -> ResolvedSource:
        m = GITHUB_RELEASE_RE.match(source)
        if not m:
            raise ValueError(f"Invalid GitHub URL: {source}")

        owner = m.group("owner")
        repo = m.group("repo")
        tag = m.group("tag")

        api_url = f"https://api.github.com/repos/{owner}/{repo}/releases"
        if tag:
            api_url += f"/tags/{tag}"

        req = urllib.request.Request(api_url, headers=self._api_headers())
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
        except urllib.error.HTTPError as e:
            if e.code == 404 and tag:
                req2 = urllib.request.Request(
                    f"https://api.github.com/repos/{owner}/{repo}/releases/latest",
                    headers=self._api_headers(),
                )
                with urllib.request.urlopen(req2, timeout=30) as resp:
                    data = json.loads(resp.read())
            else:
                raise

        if isinstance(data, list):
            if not data:
                raise ValueError(f"No releases found for {owner}/{repo}")
            data = data[0]

        version = data.get("tag_name", "v0.0.0").lstrip("v")
        release_tag = data.get("tag_name", "")
        assets = data.get("assets", [])

        preferred_asset = None
        for asset in assets:
            name = asset.get("name", "").lower()
            if name.endswith(".karna-plugin") or name.endswith(".karna-skill-pack"):
                preferred_asset = asset
                break
        if not preferred_asset and assets:
            for asset in assets:
                name = asset.get("name", "").lower()
                if name.endswith(".zip"):
                    preferred_asset = asset
                    break
        if not preferred_asset and assets:
            zipball_url = data.get("zipball_url")
            if zipball_url:
                preferred_asset = {
                    "name": f"{repo}-{release_tag}.zip",
                    "browser_download_url": zipball_url,
                }

        if not preferred_asset:
            raise ValueError(f"No suitable asset found in release {release_tag} for {owner}/{repo}")

        return ResolvedSource(
            source_type=self.source_type,
            source_url=preferred_asset.get("browser_download_url", ""),
            version=version,
            resolved_id=f"{owner}.{repo}",
            release_tag=release_tag,
            asset_name=preferred_asset.get("name", ""),
            metadata={
                "owner": owner,
                "repo": repo,
                "release_id": data.get("id"),
                "release_url": data.get("html_url"),
                "changelog": data.get("body", ""),
                "published_at": data.get("published_at"),
            },
        )

    def download(self, resolved: ResolvedSource, staging_dir: Path) -> DownloadedPackage:
        import shutil
        import urllib.error

        staging_dir.mkdir(parents=True, exist_ok=True)
        job_id = str(uuid.uuid4())[:8]
        dest = staging_dir / f"{job_id}_{resolved.asset_name or 'release.zip'}"

        req = urllib.request.Request(resolved.source_url, headers=self._api_headers())
        try:
            with urllib.request.urlopen(req, timeout=120) as response, open(dest, "wb") as out_file:
                shutil.copyfileobj(response, out_file)
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"Download failed: HTTP {e.code}") from e

        sha = compute_sha256(dest)

        return DownloadedPackage(
            source_type=self.source_type,
            source_url=resolved.source_url,
            version=resolved.version,
            local_path=dest,
            sha256=sha,
            is_zip=True,
            metadata=resolved.metadata,
        )

    def check_update(self, plugin_id: str, current_version: str, metadata: Dict[str, Any]) -> Optional[UpdateCandidate]:
        owner = metadata.get("owner")
        repo = metadata.get("repo")
        if not owner or not repo:
            return None

        try:
            req = urllib.request.Request(
                f"https://api.github.com/repos/{owner}/{repo}/releases/latest",
                headers=self._api_headers(),
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
            latest_version = data.get("tag_name", "").lstrip("v")
            if latest_version and latest_version != current_version:
                return UpdateCandidate(
                    plugin_id=plugin_id,
                    current_version=current_version,
                    new_version=latest_version,
                    download_url=data.get("html_url", ""),
                    changelog=data.get("body", ""),
                    release_date=data.get("published_at", ""),
                )
        except Exception as e:
            logger.debug(f"Update check failed for {owner}/{repo}: {e}")
        return None
