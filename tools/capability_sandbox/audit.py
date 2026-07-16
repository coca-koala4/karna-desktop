"""Audit logging for capability sandbox authorization decisions.

Provides logging of tool authorization decisions for security auditing
and compliance purposes, with persistent SQLite storage.
"""

from __future__ import annotations

import logging
import sqlite3
import threading
from pathlib import Path
from typing import Any, Optional

from hermes_constants import get_hermes_home
from tools.capability_sandbox.models import (
    AuthorizationDecision,
    CapabilityScope,
    ToolAuthorizationResult,
)
from tools.capability_sandbox.path_policy import extract_target_path

logger = logging.getLogger(__name__)

_AUDIT_DB_PATH: Path = get_hermes_home() / "capability_sandbox_audit.db"

_db_lock = threading.Lock()
_db_initialized = False
_db_conn: Optional[sqlite3.Connection] = None

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS tool_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    workspace_id TEXT,
    mode TEXT,
    tool_name TEXT,
    decision TEXT,
    risk_level TEXT,
    target_path TEXT,
    reason TEXT,
    input_summary TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_session ON tool_audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_workspace ON tool_audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON tool_audit_logs(created_at DESC);
"""


def _get_db_path() -> Path:
    return _AUDIT_DB_PATH


def _init_db() -> None:
    global _db_conn, _db_initialized
    if _db_initialized:
        return
    with _db_lock:
        if _db_initialized:
            return
        try:
            _get_db_path().parent.mkdir(parents=True, exist_ok=True)
            _db_conn = sqlite3.connect(
                str(_get_db_path()),
                check_same_thread=False,
                timeout=5.0,
                isolation_level=None,
            )
            _db_conn.row_factory = sqlite3.Row
            try:
                _db_conn.execute("PRAGMA journal_mode=WAL")
            except sqlite3.OperationalError:
                _db_conn.execute("PRAGMA journal_mode=DELETE")
            _db_conn.execute("PRAGMA foreign_keys=ON")
            _db_conn.executescript(SCHEMA_SQL)
            _db_initialized = True
        except Exception as exc:
            logger.warning("Failed to initialize audit DB: %s", exc)
            _db_conn = None
            _db_initialized = False


def init_audit_db() -> bool:
    """Initialize the audit database. Returns True if successful."""
    _init_db()
    return _db_initialized


def _summarize_args(tool_args: dict[str, Any], target_path: Optional[str]) -> str:
    if not tool_args:
        return ""
    parts = []
    path_keys = {"path", "file_path", "file", "target", "destination", "src", "dst", "dir", "directory", "cwd"}
    for key, value in tool_args.items():
        if key in path_keys and isinstance(value, str):
            parts.append(f"{key}={value}")
        elif isinstance(value, (str, int, float, bool)):
            parts.append(key)
        elif isinstance(value, list):
            parts.append(f"{key}=[{len(value)} items]")
        elif isinstance(value, dict):
            parts.append(f"{key}={{...}}")
        else:
            parts.append(key)
    if target_path and not any(p.startswith("path=") or p.startswith("file_path=") or p.startswith("target=") for p in parts):
        parts.insert(0, f"target={target_path}")
    return ", ".join(parts)


def log_authorization_decision(
    session_id: str,
    scope: CapabilityScope,
    tool_name: str,
    tool_args: dict[str, Any],
    result: ToolAuthorizationResult,
) -> None:
    target_path: Optional[str] = None
    try:
        from tools.capability_sandbox.tool_registry import get_tool_metadata
        metadata = get_tool_metadata(tool_name)
        if metadata is not None:
            target_path = extract_target_path(tool_name, tool_args, metadata)
    except Exception:
        pass

    mode = scope.mode.value if scope else "unknown"
    workspace_id = scope.workspace_id if scope else None
    decision = result.decision.value if isinstance(result.decision, AuthorizationDecision) else str(result.decision)
    risk_level = result.risk_level.value if result.risk_level else None
    reason = result.reason
    input_summary = _summarize_args(tool_args, target_path)

    logger.info(
        "tool_authorization: session_id=%s mode=%s tool_name=%s decision=%s reason=%s target_path=%s",
        session_id,
        mode,
        tool_name,
        decision,
        reason,
        target_path or "",
    )

    _write_audit_log(
        session_id=session_id,
        workspace_id=workspace_id,
        mode=mode,
        tool_name=tool_name,
        decision=decision,
        risk_level=risk_level,
        target_path=target_path,
        reason=reason,
        input_summary=input_summary,
    )


def _write_audit_log(
    session_id: str,
    workspace_id: Optional[str],
    mode: str,
    tool_name: str,
    decision: str,
    risk_level: Optional[str],
    target_path: Optional[str],
    reason: Optional[str],
    input_summary: Optional[str],
) -> None:
    if not _db_initialized:
        _init_db()
    if _db_conn is None:
        return
    try:
        with _db_lock:
            _db_conn.execute(
                "INSERT INTO tool_audit_logs "
                "(session_id, workspace_id, mode, tool_name, decision, risk_level, target_path, reason, input_summary) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (session_id, workspace_id, mode, tool_name, decision, risk_level, target_path, reason, input_summary),
            )
    except Exception as exc:
        logger.warning("Failed to write audit log to DB: %s", exc)


def get_audit_logs(
    session_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    """Query audit logs with optional filtering and pagination.

    Args:
        session_id: Filter by session ID.
        workspace_id: Filter by workspace ID.
        limit: Maximum number of records to return (default 100).
        offset: Number of records to skip (default 0).

    Returns:
        List of audit log entries as dicts.
    """
    if not _db_initialized:
        _init_db()
    if _db_conn is None:
        return []

    conditions = []
    params: list[Any] = []

    if session_id:
        conditions.append("session_id = ?")
        params.append(session_id)
    if workspace_id:
        conditions.append("workspace_id = ?")
        params.append(workspace_id)

    where_clause = ""
    if conditions:
        where_clause = "WHERE " + " AND ".join(conditions)

    query = (
        f"SELECT id, session_id, workspace_id, mode, tool_name, decision, "
        f"risk_level, target_path, reason, input_summary, created_at "
        f"FROM tool_audit_logs {where_clause} "
        f"ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?"
    )
    params.extend([limit, offset])

    try:
        with _db_lock:
            cursor = _db_conn.execute(query, params)
            rows = cursor.fetchall()
            return [dict(row) for row in rows]
    except Exception as exc:
        logger.warning("Failed to query audit logs: %s", exc)
        return []


def close_audit_db() -> None:
    """Close the audit database connection."""
    global _db_conn, _db_initialized
    with _db_lock:
        if _db_conn is not None:
            try:
                _db_conn.close()
            except Exception:
                pass
            _db_conn = None
        _db_initialized = False
