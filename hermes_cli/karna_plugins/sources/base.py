from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Type

logger = logging.getLogger(__name__)


@dataclass
class ResolvedSource:
    source_type: str
    source_url: str
    version: str
    resolved_id: str = ""
    commit_sha: str = ""
    release_tag: str = ""
    asset_name: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DownloadedPackage:
    source_type: str
    source_url: str
    version: str
    local_path: Path
    sha256: str = ""
    is_zip: bool = True
    files_count: int = 0
    total_size: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class UpdateCandidate:
    plugin_id: str
    current_version: str
    new_version: str
    download_url: str
    changelog: str = ""
    new_permissions: List[str] = field(default_factory=list)
    sha256: str = ""
    release_date: str = ""


class PluginSourceAdapter(ABC):
    source_type: str = "base"

    @abstractmethod
    def can_handle(self, source: str) -> bool:
        pass

    @abstractmethod
    def resolve(self, source: str) -> ResolvedSource:
        pass

    @abstractmethod
    def download(self, resolved: ResolvedSource, staging_dir: Path) -> DownloadedPackage:
        pass

    @abstractmethod
    def check_update(self, plugin_id: str, current_version: str, metadata: Dict[str, Any]) -> Optional[UpdateCandidate]:
        pass


_adapter_registry: List[Type[PluginSourceAdapter]] = []


def register_adapter(adapter_class: Type[PluginSourceAdapter]) -> Type[PluginSourceAdapter]:
    _adapter_registry.append(adapter_class)
    return adapter_class


def get_source_adapter(source: str) -> PluginSourceAdapter:
    for adapter_class in _adapter_registry:
        adapter = adapter_class()
        if adapter.can_handle(source):
            return adapter
    raise ValueError(f"No source adapter found for: {source}")
