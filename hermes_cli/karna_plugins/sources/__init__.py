from __future__ import annotations

from .base import (
    PluginSourceAdapter,
    ResolvedSource,
    DownloadedPackage,
    UpdateCandidate,
    get_source_adapter,
)
from .local_zip import LocalZipSource
from .url_source import UrlSource
from .github_release import GitHubReleaseSource
from .git_repo import GitRepoSource
from .npm_source import NpmSource
from .pypi_source import PyPISource
from .lan_source import LanSource

__all__ = [
    "PluginSourceAdapter",
    "ResolvedSource",
    "DownloadedPackage",
    "UpdateCandidate",
    "LocalZipSource",
    "UrlSource",
    "GitHubReleaseSource",
    "GitRepoSource",
    "NpmSource",
    "PyPISource",
    "LanSource",
    "get_source_adapter",
]
