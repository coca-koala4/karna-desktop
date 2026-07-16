import logging
from contextvars import ContextVar
from dataclasses import dataclass, fields
from typing import Optional, Any, Dict

from .compressor.compression_profiles import resolve_compression_profile

logger = logging.getLogger(__name__)


_UNSET: Any = object()


_CURRENT_ENVELOPE: ContextVar = ContextVar("context_envelope", default=_UNSET)


@dataclass
class ContextEnvelope:
    version: int = 1
    enabled: bool = True
    workspace_id: Optional[str] = None
    project_id: Optional[str] = None
    module: Optional[str] = None
    task_id: Optional[str] = None
    session_id: Optional[str] = None
    writing_domain: Optional[str] = "general"
    runtime_profile: Optional[str] = "agent_chat"
    active_artifact_path: Optional[str] = None
    active_artifact_kind: Optional[str] = None
    active_artifact_revision: Optional[str] = None
    selection_text: Optional[str] = None
    selection_start: Optional[int] = None
    selection_end: Optional[int] = None
    selection_hash: Optional[str] = None
    source_kind: Optional[str] = "user_instruction"

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ContextEnvelope":
        if not data:
            return cls()
        field_names = {f.name for f in fields(cls)}
        normalized = {}
        for key, value in data.items():
            snake_key = key
            camel_to_snake_map = {
                "version": "version",
                "enabled": "enabled",
                "workspaceId": "workspace_id",
                "projectId": "project_id",
                "module": "module",
                "taskId": "task_id",
                "sessionId": "session_id",
                "writingDomain": "writing_domain",
                "runtimeProfile": "runtime_profile",
                "activeArtifactPath": "active_artifact_path",
                "activeArtifactKind": "active_artifact_kind",
                "activeArtifactRevision": "active_artifact_revision",
                "selectionText": "selection_text",
                "selectionStart": "selection_start",
                "selectionEnd": "selection_end",
                "selectionHash": "selection_hash",
                "sourceKind": "source_kind",
            }
            if key in camel_to_snake_map:
                snake_key = camel_to_snake_map[key]
            elif key not in field_names:
                import re
                snake_key = re.sub(r"(?<!^)(?=[A-Z])", "_", key).lower()
            if snake_key in field_names:
                normalized[snake_key] = value
        return cls(**normalized)

    def to_dict(self) -> Dict[str, Any]:
        result = {}
        for f in fields(self):
            value = getattr(self, f.name)
            if value is not None:
                result[f.name] = value
        return result

    def get_effective_profile(self) -> str:
        return resolve_compression_profile(
            writing_domain=self.writing_domain,
            session_mode=self.module,
            task_type=self.runtime_profile,
        )

    def get_scope_id(self) -> Optional[str]:
        """Return the narrowest durable memory scope for this turn."""
        return self.project_id or self.workspace_id


def set_current_envelope(env: Optional[ContextEnvelope]) -> Any:
    if env is None:
        return _CURRENT_ENVELOPE.set(_UNSET)
    return _CURRENT_ENVELOPE.set(env)


def get_current_envelope() -> Optional[ContextEnvelope]:
    value = _CURRENT_ENVELOPE.get()
    if value is _UNSET:
        return None
    return value
