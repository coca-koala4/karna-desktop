"""Thread-safe scope storage for capability sandbox.

Provides session-scoped storage of CapabilityScope instances with
thread-safe access and default project-only scope creation.
"""

from __future__ import annotations

import os
import threading
from typing import Dict, Optional

from tools.capability_sandbox.models import CapabilityScope
from tools.capability_sandbox.scope_factory import (
    create_project_only_scope,
    create_computer_authorized_scope,
    create_high_risk_scope,
)

logger = __import__("logging").getLogger(__name__)

_scope_store: Dict[str, CapabilityScope] = {}
_scope_lock = threading.Lock()
_default_scope: Optional[CapabilityScope] = None


def _infer_workspace_root() -> str:
    cwd = os.getcwd()
    workspace_root = os.getenv("HERMES_WORKSPACE_ROOT") or os.getenv("WORKSPACE_ROOT")
    if workspace_root and os.path.isabs(workspace_root) and os.path.exists(workspace_root):
        return workspace_root
    return cwd


def _get_or_create_default_scope() -> CapabilityScope:
    global _default_scope
    if _default_scope is not None:
        return _default_scope
    workspace_root = _infer_workspace_root()
    _default_scope = create_project_only_scope(
        workspace_id="default",
        workspace_root=workspace_root,
    )
    return _default_scope


def set_scope(session_id: str, scope: CapabilityScope) -> None:
    with _scope_lock:
        _scope_store[session_id] = scope


def get_scope(session_id: str) -> CapabilityScope:
    with _scope_lock:
        if not session_id:
            return _get_or_create_default_scope()
        scope = _scope_store.get(session_id)
        if scope is None:
            scope = _get_or_create_default_scope()
            _scope_store[session_id] = scope
        return scope


def get_explicit_scope(session_id: str) -> Optional[CapabilityScope]:
    """Return a scope only when the runtime explicitly installed one.

    Unlike ``get_scope``, this never creates a process-wide default. Tool
    entry points use it for defence-in-depth without changing direct library
    calls that run outside an agent turn.
    """
    if not session_id:
        return None
    with _scope_lock:
        return _scope_store.get(session_id)


def set_scope_by_mode(
    session_id: str,
    workspace_id: str | None,
    workspace_root: str | None,
    mode_str: str,
) -> CapabilityScope:
    """Set the capability scope for a session based on a mode string.

    Args:
        session_id: The session identifier.
        workspace_id: Optional workspace identifier.
        workspace_root: Optional workspace root directory.
        mode_str: One of 'project', 'computer', or 'free' (case-insensitive).

    Returns:
        The created CapabilityScope.
    """
    mode = mode_str.strip().lower()
    if not workspace_root:
        workspace_root = _infer_workspace_root()
    if not workspace_id:
        workspace_id = session_id or "default"

    if mode in ("free", "high_risk", "unrestricted"):
        scope = create_high_risk_scope(
            workspace_id=workspace_id,
            workspace_root=workspace_root,
        )
    elif mode in ("computer", "computer_authorized", "desktop"):
        scope = create_computer_authorized_scope(
            workspace_id=workspace_id,
            workspace_root=workspace_root,
        )
    else:
        scope = create_project_only_scope(
            workspace_id=workspace_id,
            workspace_root=workspace_root,
        )

    set_scope(session_id, scope)
    return scope


def clear_scope(session_id: str) -> None:
    with _scope_lock:
        _scope_store.pop(session_id, None)


def clear_all_scopes() -> None:
    global _default_scope
    with _scope_lock:
        _scope_store.clear()
        _default_scope = None
