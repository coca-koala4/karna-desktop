"""Mode Controller for Karna Agent Modes.

Implements the unified mode system with four primary modes:
- direct: Instant chat mode (default)
- plan: Read-only planning mode
- goal: Autonomous goal execution
- living_work: Creative evolution mode

Architecture:
- ModeController manages lifecycle, phases, budget, transitions
- Uses ModeStore for persistence in SessionDB
- ModeEventBus for real-time event streaming
- Delegates execution to existing Flow Runtime
"""

from __future__ import annotations

import json
import logging
import sqlite3
import time
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


class AgentModeId(str, Enum):
    DIRECT = "direct"
    PLAN = "plan"
    GOAL = "goal"
    LIVING_WORK = "living_work"


class ModeStatus(str, Enum):
    DRAFT = "draft"
    READY = "ready"
    RUNNING = "running"
    PAUSED = "paused"
    WAITING_USER = "waiting_user"
    BLOCKED = "blocked"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ModeEventType(str, Enum):
    CREATED = "mode.created"
    STATUS_CHANGED = "mode.status_changed"
    PHASE_CHANGED = "mode.phase_changed"
    FLOW_RUN_REQUESTED = "mode.flow_run.requested"
    FLOW_RUN_COMPLETED = "mode.flow_run.completed"
    FLOW_RUN_FAILED = "mode.flow_run.failed"
    CHECKPOINT_CREATED = "mode.checkpoint.created"
    TRANSITIONED = "mode.transitioned"
    BUDGET_WARNING = "mode.budget.warning"
    BUDGET_EXCEEDED = "mode.budget.exceeded"
    PERMISSION_DENIED = "mode.permission.denied"
    WAITING_USER = "mode.waiting_user"
    USER_INPUT_RECEIVED = "mode.user_input_received"
    ERROR = "mode.error"


@dataclass
class AgentModeSession:
    id: str
    conversation_id: Optional[str]
    workspace_id: str
    project_id: Optional[str]

    mode: AgentModeId
    status: ModeStatus

    state_ref: str
    active_flow_id: Optional[str] = None
    active_run_id: Optional[str] = None

    parent_session_id: Optional[str] = None
    forked_from_checkpoint_id: Optional[str] = None

    current_phase: str = ""
    state_version: int = 1
    expected_version: int = 1

    token_usage: int = 0
    cost_estimate: float = 0.0
    turn_count: int = 0

    created_at: str = ""
    updated_at: str = ""
    completed_at: Optional[str] = None
    failed_at: Optional[str] = None
    cancelled_at: Optional[str] = None

    error_message: Optional[str] = None
    error_code: Optional[str] = None

    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        now = datetime.now(tz=timezone.utc).isoformat()
        if not self.created_at:
            self.created_at = now
        if not self.updated_at:
            self.updated_at = now

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["mode"] = self.mode.value if isinstance(self.mode, AgentModeId) else self.mode
        d["status"] = self.status.value if isinstance(self.status, ModeStatus) else self.status
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AgentModeSession":
        data = dict(data)
        mode_val = data.get("mode", "direct")
        status_val = data.get("status", "draft")
        data["mode"] = AgentModeId(mode_val) if isinstance(mode_val, str) else mode_val
        data["status"] = ModeStatus(status_val) if isinstance(status_val, str) else status_val
        return cls(**data)


@dataclass
class ModeEvent:
    id: str
    mode_session_id: str
    mode: AgentModeId
    sequence: int
    state_version: int
    event_type: ModeEventType
    payload: Dict[str, Any]
    created_at: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "modeSessionId": self.mode_session_id,
            "mode": self.mode.value,
            "sequence": self.sequence,
            "stateVersion": self.state_version,
            "type": self.event_type.value,
            "payload": self.payload,
            "createdAt": self.created_at,
        }


@dataclass
class ModeCheckpoint:
    id: str
    mode_session_id: str
    state_ref: str
    state_version: int
    label: Optional[str]
    created_at: str
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ModeTransitionSnapshot:
    id: str
    from_mode_session_id: str
    to_mode_session_id: str
    from_mode: AgentModeId
    to_mode: AgentModeId
    objectives: List[str]
    constraints: List[str]
    artifact_refs: List[str]
    evidence_refs: List[str]
    decisions: List[str]
    unresolved_items: List[str]
    excluded_context: List[str]
    created_at: str
    confirmed_by_user: bool = False


_MODE_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS mode_sessions (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    workspace_id TEXT NOT NULL,
    project_id TEXT,
    mode TEXT NOT NULL,
    status TEXT NOT NULL,
    state_ref TEXT NOT NULL,
    active_flow_id TEXT,
    active_run_id TEXT,
    parent_session_id TEXT,
    forked_from_checkpoint_id TEXT,
    current_phase TEXT DEFAULT '',
    state_version INTEGER NOT NULL DEFAULT 1,
    expected_version INTEGER NOT NULL DEFAULT 1,
    token_usage INTEGER NOT NULL DEFAULT 0,
    cost_estimate REAL NOT NULL DEFAULT 0.0,
    turn_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT,
    failed_at TEXT,
    cancelled_at TEXT,
    error_message TEXT,
    error_code TEXT,
    metadata TEXT DEFAULT '{}',
    FOREIGN KEY (conversation_id) REFERENCES sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (parent_session_id) REFERENCES mode_sessions(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS mode_events (
    id TEXT PRIMARY KEY,
    mode_session_id TEXT NOT NULL REFERENCES mode_sessions(id) ON DELETE CASCADE,
    mode TEXT NOT NULL,
    sequence INTEGER NOT NULL,
    state_version INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    payload TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mode_transitions (
    id TEXT PRIMARY KEY,
    from_mode_session_id TEXT NOT NULL REFERENCES mode_sessions(id) ON DELETE CASCADE,
    to_mode_session_id TEXT NOT NULL REFERENCES mode_sessions(id) ON DELETE CASCADE,
    from_mode TEXT NOT NULL,
    to_mode TEXT NOT NULL,
    objectives TEXT NOT NULL DEFAULT '[]',
    constraints TEXT NOT NULL DEFAULT '[]',
    artifact_refs TEXT NOT NULL DEFAULT '[]',
    evidence_refs TEXT NOT NULL DEFAULT '[]',
    decisions TEXT NOT NULL DEFAULT '[]',
    unresolved_items TEXT NOT NULL DEFAULT '[]',
    excluded_context TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    confirmed_by_user INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mode_checkpoints (
    id TEXT PRIMARY KEY,
    mode_session_id TEXT NOT NULL REFERENCES mode_sessions(id) ON DELETE CASCADE,
    state_ref TEXT NOT NULL,
    state_version INTEGER NOT NULL,
    label TEXT,
    created_at TEXT NOT NULL,
    metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS mode_approvals (
    id TEXT PRIMARY KEY,
    mode_session_id TEXT NOT NULL REFERENCES mode_sessions(id) ON DELETE CASCADE,
    proposal_id TEXT NOT NULL,
    approval_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    requested_at TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT,
    payload TEXT NOT NULL DEFAULT '{}',
    resolution TEXT
);

CREATE INDEX IF NOT EXISTS idx_mode_sessions_conversation ON mode_sessions(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mode_sessions_workspace ON mode_sessions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mode_sessions_project ON mode_sessions(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mode_sessions_status ON mode_sessions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_mode_events_sequence ON mode_events(mode_session_id, sequence);
CREATE INDEX IF NOT EXISTS idx_mode_checkpoints_session ON mode_checkpoints(mode_session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mode_approvals_session ON mode_approvals(mode_session_id, status);
"""


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


def _new_id(prefix: str = "mode") -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


class ModeStore:
    """Persistent storage for mode sessions, events, checkpoints, transitions."""

    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn
        self._ensure_schema()

    def _ensure_schema(self):
        self._conn.executescript(_MODE_SCHEMA_SQL)

    def _execute_with_retry(self, fn: Callable[[sqlite3.Cursor], Any]) -> Any:
        from hermes_state import _with_write_retry
        return _with_write_retry(self._conn, fn)

    def create_session(self, session: AgentModeSession) -> AgentModeSession:
        def _do(cursor: sqlite3.Cursor):
            cursor.execute(
                """INSERT INTO mode_sessions (
                    id, conversation_id, workspace_id, project_id, mode, status,
                    state_ref, active_flow_id, active_run_id, parent_session_id,
                    forked_from_checkpoint_id, current_phase, state_version,
                    expected_version, token_usage, cost_estimate, turn_count,
                    created_at, updated_at, metadata
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    session.id, session.conversation_id, session.workspace_id,
                    session.project_id, session.mode.value, session.status.value,
                    session.state_ref, session.active_flow_id, session.active_run_id,
                    session.parent_session_id, session.forked_from_checkpoint_id,
                    session.current_phase, session.state_version, session.expected_version,
                    session.token_usage, session.cost_estimate, session.turn_count,
                    session.created_at, session.updated_at,
                    json.dumps(session.metadata, ensure_ascii=False),
                )
            )
        self._execute_with_retry(_do)
        return session

    def get_session(self, session_id: str) -> Optional[AgentModeSession]:
        cursor = self._conn.execute(
            "SELECT * FROM mode_sessions WHERE id = ?", (session_id,)
        )
        row = cursor.fetchone()
        if not row:
            return None
        return self._row_to_session(row)

    def get_active_session_for_conversation(self, conversation_id: str) -> Optional[AgentModeSession]:
        cursor = self._conn.execute(
            """SELECT * FROM mode_sessions
               WHERE conversation_id = ?
                 AND status NOT IN ('completed', 'failed', 'cancelled')
               ORDER BY created_at DESC LIMIT 1""",
            (conversation_id,)
        )
        row = cursor.fetchone()
        if not row:
            return None
        return self._row_to_session(row)

    def list_sessions(
        self,
        conversation_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        project_id: Optional[str] = None,
        mode: Optional[AgentModeId] = None,
        status: Optional[ModeStatus] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[AgentModeSession]:
        conditions = []
        params: List[Any] = []
        if conversation_id:
            conditions.append("conversation_id = ?")
            params.append(conversation_id)
        if workspace_id:
            conditions.append("workspace_id = ?")
            params.append(workspace_id)
        if project_id:
            conditions.append("project_id = ?")
            params.append(project_id)
        if mode:
            conditions.append("mode = ?")
            params.append(mode.value)
        if status:
            conditions.append("status = ?")
            params.append(status.value)
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        cursor = self._conn.execute(
            f"SELECT * FROM mode_sessions {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            params + [limit, offset]
        )
        return [self._row_to_session(r) for r in cursor.fetchall()]

    def update_session_status(
        self,
        session_id: str,
        status: ModeStatus,
        expected_version: int,
        *,
        error_message: Optional[str] = None,
        error_code: Optional[str] = None,
    ) -> Tuple[bool, Optional[AgentModeSession]]:
        now = _now_iso()
        sets = ["status = ?", "updated_at = ?", "state_version = state_version + 1"]
        params: List[Any] = [status.value, now]
        if status == ModeStatus.COMPLETED:
            sets.append("completed_at = ?")
            params.append(now)
        elif status == ModeStatus.FAILED:
            sets.append("failed_at = ?")
            params.append(now)
            if error_message:
                sets.append("error_message = ?")
                params.append(error_message)
            if error_code:
                sets.append("error_code = ?")
                params.append(error_code)
        elif status == ModeStatus.CANCELLED:
            sets.append("cancelled_at = ?")
            params.append(now)

        params.extend([session_id, expected_version])
        sql = f"UPDATE mode_sessions SET {', '.join(sets)} WHERE id = ? AND state_version = ?"

        def _do(cursor: sqlite3.Cursor):
            cursor.execute(sql, params)
            return cursor.rowcount

        updated = self._execute_with_retry(_do)
        if updated == 0:
            return False, None
        return True, self.get_session(session_id)

    def update_session_phase(
        self,
        session_id: str,
        phase: str,
        expected_version: int,
        active_flow_id: Optional[str] = None,
        active_run_id: Optional[str] = None,
    ) -> Tuple[bool, Optional[AgentModeSession]]:
        now = _now_iso()
        sets = ["current_phase = ?", "updated_at = ?", "state_version = state_version + 1"]
        params: List[Any] = [phase, now]
        if active_flow_id is not None:
            sets.append("active_flow_id = ?")
            params.append(active_flow_id)
        if active_run_id is not None:
            sets.append("active_run_id = ?")
            params.append(active_run_id)
        params.extend([session_id, expected_version])
        sql = f"UPDATE mode_sessions SET {', '.join(sets)} WHERE id = ? AND state_version = ?"

        def _do(cursor: sqlite3.Cursor):
            cursor.execute(sql, params)
            return cursor.rowcount

        updated = self._execute_with_retry(_do)
        if updated == 0:
            return False, None
        return True, self.get_session(session_id)

    def increment_usage(
        self,
        session_id: str,
        tokens: int = 0,
        cost: float = 0.0,
        turns: int = 0,
    ):
        def _do(cursor: sqlite3.Cursor):
            cursor.execute(
                """UPDATE mode_sessions
                   SET token_usage = token_usage + ?,
                       cost_estimate = cost_estimate + ?,
                       turn_count = turn_count + ?,
                       updated_at = ?
                   WHERE id = ?""",
                (tokens, cost, turns, _now_iso(), session_id)
            )
        self._execute_with_retry(_do)

    def append_event(
        self,
        mode_session_id: str,
        mode: AgentModeId,
        event_type: ModeEventType,
        payload: Dict[str, Any],
        state_version: Optional[int] = None,
    ) -> ModeEvent:
        if state_version is None:
            session = self.get_session(mode_session_id)
            state_version = session.state_version if session else 1

        def _do(cursor: sqlite3.Cursor):
            cursor.execute(
                "SELECT COALESCE(MAX(sequence), 0) + 1 FROM mode_events WHERE mode_session_id = ?",
                (mode_session_id,)
            )
            seq = cursor.fetchone()[0]
            event_id = _new_id("evt")
            now = _now_iso()
            cursor.execute(
                """INSERT INTO mode_events
                   (id, mode_session_id, mode, sequence, state_version, event_type, payload, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    event_id, mode_session_id, mode.value, seq, state_version,
                    event_type.value, json.dumps(payload, ensure_ascii=False), now
                )
            )
            return event_id, seq, now

        event_id, seq, created_at = self._execute_with_retry(_do)
        return ModeEvent(
            id=event_id,
            mode_session_id=mode_session_id,
            mode=mode,
            sequence=seq,
            state_version=state_version,
            event_type=event_type,
            payload=payload,
            created_at=created_at,
        )

    def get_events(
        self,
        mode_session_id: str,
        since_sequence: int = 0,
        limit: int = 100,
    ) -> List[ModeEvent]:
        cursor = self._conn.execute(
            """SELECT * FROM mode_events
               WHERE mode_session_id = ? AND sequence > ?
               ORDER BY sequence ASC LIMIT ?""",
            (mode_session_id, since_sequence, limit)
        )
        events = []
        for row in cursor.fetchall():
            events.append(ModeEvent(
                id=row["id"],
                mode_session_id=row["mode_session_id"],
                mode=AgentModeId(row["mode"]),
                sequence=row["sequence"],
                state_version=row["state_version"],
                event_type=ModeEventType(row["event_type"]),
                payload=json.loads(row["payload"] or "{}"),
                created_at=row["created_at"],
            ))
        return events

    def create_checkpoint(
        self,
        mode_session_id: str,
        state_ref: str,
        state_version: int,
        label: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> ModeCheckpoint:
        checkpoint_id = _new_id("ckpt")
        now = _now_iso()

        def _do(cursor: sqlite3.Cursor):
            cursor.execute(
                """INSERT INTO mode_checkpoints
                   (id, mode_session_id, state_ref, state_version, label, created_at, metadata)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    checkpoint_id, mode_session_id, state_ref, state_version,
                    label, now, json.dumps(metadata or {}, ensure_ascii=False)
                )
            )

        self._execute_with_retry(_do)
        return ModeCheckpoint(
            id=checkpoint_id,
            mode_session_id=mode_session_id,
            state_ref=state_ref,
            state_version=state_version,
            label=label,
            created_at=now,
            metadata=metadata or {},
        )

    def get_latest_checkpoint(self, mode_session_id: str) -> Optional[ModeCheckpoint]:
        cursor = self._conn.execute(
            """SELECT * FROM mode_checkpoints
               WHERE mode_session_id = ?
               ORDER BY created_at DESC LIMIT 1""",
            (mode_session_id,)
        )
        row = cursor.fetchone()
        if not row:
            return None
        return ModeCheckpoint(
            id=row["id"],
            mode_session_id=row["mode_session_id"],
            state_ref=row["state_ref"],
            state_version=row["state_version"],
            label=row["label"],
            created_at=row["created_at"],
            metadata=json.loads(row["metadata"] or "{}"),
        )

    def create_transition(self, transition: ModeTransitionSnapshot) -> ModeTransitionSnapshot:
        def _do(cursor: sqlite3.Cursor):
            cursor.execute(
                """INSERT INTO mode_transitions (
                    id, from_mode_session_id, to_mode_session_id, from_mode, to_mode,
                    objectives, constraints, artifact_refs, evidence_refs,
                    decisions, unresolved_items, excluded_context,
                    created_at, confirmed_by_user
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    transition.id, transition.from_mode_session_id,
                    transition.to_mode_session_id, transition.from_mode.value,
                    transition.to_mode.value,
                    json.dumps(transition.objectives, ensure_ascii=False),
                    json.dumps(transition.constraints, ensure_ascii=False),
                    json.dumps(transition.artifact_refs, ensure_ascii=False),
                    json.dumps(transition.evidence_refs, ensure_ascii=False),
                    json.dumps(transition.decisions, ensure_ascii=False),
                    json.dumps(transition.unresolved_items, ensure_ascii=False),
                    json.dumps(transition.excluded_context, ensure_ascii=False),
                    transition.created_at,
                    1 if transition.confirmed_by_user else 0,
                )
            )
        self._execute_with_retry(_do)
        return transition

    def _row_to_session(self, row: sqlite3.Row) -> AgentModeSession:
        return AgentModeSession(
            id=row["id"],
            conversation_id=row["conversation_id"],
            workspace_id=row["workspace_id"],
            project_id=row["project_id"],
            mode=AgentModeId(row["mode"]),
            status=ModeStatus(row["status"]),
            state_ref=row["state_ref"],
            active_flow_id=row["active_flow_id"],
            active_run_id=row["active_run_id"],
            parent_session_id=row["parent_session_id"],
            forked_from_checkpoint_id=row["forked_from_checkpoint_id"],
            current_phase=row["current_phase"] or "",
            state_version=row["state_version"],
            expected_version=row["expected_version"],
            token_usage=row["token_usage"],
            cost_estimate=row["cost_estimate"],
            turn_count=row["turn_count"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            completed_at=row["completed_at"],
            failed_at=row["failed_at"],
            cancelled_at=row["cancelled_at"],
            error_message=row["error_message"],
            error_code=row["error_code"],
            metadata=json.loads(row["metadata"] or "{}"),
        )


class ModeEventBus:
    """Publishes mode events to subscribers."""

    def __init__(self):
        self._subscribers: Dict[str, List[Callable[[ModeEvent], None]]] = {}
        self._global_subscribers: List[Callable[[ModeEvent], None]] = []

    def subscribe(
        self,
        callback: Callable[[ModeEvent], None],
        mode_session_id: Optional[str] = None,
    ):
        if mode_session_id:
            if mode_session_id not in self._subscribers:
                self._subscribers[mode_session_id] = []
            self._subscribers[mode_session_id].append(callback)
        else:
            self._global_subscribers.append(callback)

    def publish(self, event: ModeEvent):
        for cb in self._global_subscribers:
            try:
                cb(event)
            except Exception as e:
                logger.debug("Mode event bus global subscriber error: %s", e)
        subs = self._subscribers.get(event.mode_session_id, [])
        for cb in subs:
            try:
                cb(event)
            except Exception as e:
                logger.debug("Mode event bus subscriber error: %s", e)


class ModeController:
    """Central controller for agent mode lifecycle and execution.

    Responsibilities:
    - Create, pause, resume, cancel mode sessions
    - Manage phase transitions within a mode
    - Coordinate with Flow Runtime for execution
    - Emit events via ModeEventBus
    - Enforce version-based optimistic concurrency
    """

    def __init__(self, store: ModeStore, event_bus: Optional[ModeEventBus] = None):
        self._store = store
        self._bus = event_bus or ModeEventBus()
        self._flow_runner: Optional[Callable[[Dict[str, Any]], Any]] = None

    def set_flow_runner(self, runner: Callable[[Dict[str, Any]], Any]):
        self._flow_runner = runner

    @property
    def event_bus(self) -> ModeEventBus:
        return self._bus

    def create_session(
        self,
        *,
        mode: AgentModeId,
        workspace_id: str,
        conversation_id: Optional[str] = None,
        project_id: Optional[str] = None,
        parent_session_id: Optional[str] = None,
        initial_state_ref: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AgentModeSession:
        session_id = _new_id("mode")
        state_ref = initial_state_ref or f"state://{session_id}/v1"
        session = AgentModeSession(
            id=session_id,
            conversation_id=conversation_id,
            workspace_id=workspace_id,
            project_id=project_id,
            mode=mode,
            status=ModeStatus.DRAFT if mode != AgentModeId.DIRECT else ModeStatus.RUNNING,
            state_ref=state_ref,
            parent_session_id=parent_session_id,
            metadata=metadata or {},
        )
        self._store.create_session(session)
        event = self._store.append_event(
            session.id, mode, ModeEventType.CREATED,
            {"conversationId": conversation_id, "projectId": project_id}
        )
        self._bus.publish(event)
        return session

    def get_session(self, session_id: str) -> Optional[AgentModeSession]:
        return self._store.get_session(session_id)

    def get_active_for_conversation(self, conversation_id: str) -> Optional[AgentModeSession]:
        return self._store.get_active_session_for_conversation(conversation_id)

    def pause(self, session_id: str, expected_version: int, reason: Optional[str] = None) -> Tuple[bool, Optional[AgentModeSession]]:
        ok, session = self._store.update_session_status(
            session_id, ModeStatus.PAUSED, expected_version,
        )
        if ok and session:
            event = self._store.append_event(
                session.id, session.mode, ModeEventType.STATUS_CHANGED,
                {"to": "paused", "reason": reason}
            )
            self._bus.publish(event)
        return ok, session

    def resume(self, session_id: str, expected_version: int) -> Tuple[bool, Optional[AgentModeSession]]:
        ok, session = self._store.update_session_status(
            session_id, ModeStatus.RUNNING, expected_version,
        )
        if ok and session:
            event = self._store.append_event(
                session.id, session.mode, ModeEventType.STATUS_CHANGED,
                {"to": "running"}
            )
            self._bus.publish(event)
        return ok, session

    def cancel(self, session_id: str, expected_version: int, reason: Optional[str] = None) -> Tuple[bool, Optional[AgentModeSession]]:
        ok, session = self._store.update_session_status(
            session_id, ModeStatus.CANCELLED, expected_version,
        )
        if ok and session:
            event = self._store.append_event(
                session.id, session.mode, ModeEventType.STATUS_CHANGED,
                {"to": "cancelled", "reason": reason}
            )
            self._bus.publish(event)
        return ok, session

    def mark_waiting_user(
        self,
        session_id: str,
        expected_version: int,
        prompt: str,
        options: Optional[List[str]] = None,
    ) -> Tuple[bool, Optional[AgentModeSession]]:
        ok, session = self._store.update_session_status(
            session_id, ModeStatus.WAITING_USER, expected_version,
        )
        if ok and session:
            event = self._store.append_event(
                session.id, session.mode, ModeEventType.WAITING_USER,
                {"prompt": prompt, "options": options or []}
            )
            self._bus.publish(event)
        return ok, session

    def mark_completed(
        self,
        session_id: str,
        expected_version: int,
        summary: Optional[str] = None,
    ) -> Tuple[bool, Optional[AgentModeSession]]:
        ok, session = self._store.update_session_status(
            session_id, ModeStatus.COMPLETED, expected_version,
        )
        if ok and session:
            event = self._store.append_event(
                session.id, session.mode, ModeEventType.STATUS_CHANGED,
                {"to": "completed", "summary": summary}
            )
            self._bus.publish(event)
        return ok, session

    def mark_failed(
        self,
        session_id: str,
        expected_version: int,
        error_code: str,
        error_message: str,
    ) -> Tuple[bool, Optional[AgentModeSession]]:
        ok, session = self._store.update_session_status(
            session_id, ModeStatus.FAILED, expected_version,
            error_message=error_message, error_code=error_code,
        )
        if ok and session:
            event = self._store.append_event(
                session.id, session.mode, ModeEventType.ERROR,
                {"code": error_code, "message": error_message}
            )
            self._bus.publish(event)
        return ok, session

    def mark_blocked(
        self,
        session_id: str,
        expected_version: int,
        reason: str,
        required_action: Optional[str] = None,
    ) -> Tuple[bool, Optional[AgentModeSession]]:
        ok, session = self._store.update_session_status(
            session_id, ModeStatus.BLOCKED, expected_version,
            error_message=reason, error_code="blocked",
        )
        if ok and session:
            event = self._store.append_event(
                session.id, session.mode, ModeEventType.STATUS_CHANGED,
                {"to": "blocked", "reason": reason, "requiredAction": required_action}
            )
            self._bus.publish(event)
        return ok, session

    def transition_phase(
        self,
        session_id: str,
        phase: str,
        expected_version: int,
        active_flow_id: Optional[str] = None,
        active_run_id: Optional[str] = None,
    ) -> Tuple[bool, Optional[AgentModeSession]]:
        ok, session = self._store.update_session_phase(
            session_id, phase, expected_version,
            active_flow_id=active_flow_id, active_run_id=active_run_id,
        )
        if ok and session:
            event = self._store.append_event(
                session.id, session.mode, ModeEventType.PHASE_CHANGED,
                {"phase": phase, "flowId": active_flow_id, "runId": active_run_id}
            )
            self._bus.publish(event)
        return ok, session

    def ready(self, session_id: str, expected_version: int) -> Tuple[bool, Optional[AgentModeSession]]:
        ok, session = self._store.update_session_status(
            session_id, ModeStatus.READY, expected_version,
        )
        if ok and session:
            event = self._store.append_event(
                session.id, session.mode, ModeEventType.STATUS_CHANGED,
                {"to": "ready"}
            )
            self._bus.publish(event)
        return ok, session

    def start_running(self, session_id: str, expected_version: int) -> Tuple[bool, Optional[AgentModeSession]]:
        ok, session = self._store.update_session_status(
            session_id, ModeStatus.RUNNING, expected_version,
        )
        if ok and session:
            event = self._store.append_event(
                session.id, session.mode, ModeEventType.STATUS_CHANGED,
                {"to": "running"}
            )
            self._bus.publish(event)
        return ok, session

    def create_checkpoint(
        self,
        session_id: str,
        state_ref: str,
        label: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[ModeCheckpoint]:
        session = self._store.get_session(session_id)
        if not session:
            return None
        ckpt = self._store.create_checkpoint(
            session_id, state_ref, session.state_version, label=label, metadata=metadata
        )
        event = self._store.append_event(
            session.id, session.mode, ModeEventType.CHECKPOINT_CREATED,
            {"checkpointId": ckpt.id, "label": label}
        )
        self._bus.publish(event)
        return ckpt

    def fork_from_checkpoint(
        self,
        checkpoint_id: str,
        new_mode: Optional[AgentModeId] = None,
    ) -> Optional[AgentModeSession]:
        raise NotImplementedError("Checkpoint forking will be implemented in a later phase")

    def transition_mode(
        self,
        from_session_id: str,
        to_mode: AgentModeId,
        snapshot: ModeTransitionSnapshot,
        expected_version: int,
    ) -> Optional[AgentModeSession]:
        from_session = self._store.get_session(from_session_id)
        if not from_session:
            return None

        to_session = self.create_session(
            mode=to_mode,
            workspace_id=from_session.workspace_id,
            conversation_id=from_session.conversation_id,
            project_id=from_session.project_id,
            parent_session_id=from_session_id,
        )

        snapshot.id = _new_id("trans")
        snapshot.from_mode_session_id = from_session_id
        snapshot.to_mode_session_id = to_session.id
        snapshot.from_mode = from_session.mode
        snapshot.to_mode = to_mode
        snapshot.created_at = _now_iso()
        snapshot.confirmed_by_user = True
        self._store.create_transition(snapshot)

        event = self._store.append_event(
            from_session.id, from_session.mode, ModeEventType.TRANSITIONED,
            {"toMode": to_mode.value, "toSessionId": to_session.id}
        )
        self._bus.publish(event)
        return to_session

    def request_flow_run(
        self,
        session_id: str,
        workflow_id: str,
        workflow_version: int,
        phase: str,
        *,
        input_refs: Optional[List[str]] = None,
        permission_envelope: Optional[Dict[str, Any]] = None,
        budget_snapshot: Optional[Dict[str, Any]] = None,
        project_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        session = self._store.get_session(session_id)
        if not session:
            return None

        run_id = _new_id("run")
        command_id = _new_id("cmd")

        request = {
            "commandId": command_id,
            "modeSessionId": session_id,
            "mode": session.mode.value,
            "phase": phase,
            "projectId": project_id or session.project_id,
            "workflowId": workflow_id,
            "workflowVersion": workflow_version,
            "inputRefs": input_refs or [],
            "stateSnapshotRef": session.state_ref,
            "permissionEnvelope": permission_envelope or {},
            "budgetSnapshot": budget_snapshot or {},
            "runId": run_id,
        }

        ok, updated = self.transition_phase(
            session_id, phase, session.state_version,
            active_flow_id=workflow_id, active_run_id=run_id,
        )
        if not ok:
            return None

        event = self._store.append_event(
            session.id, session.mode, ModeEventType.FLOW_RUN_REQUESTED,
            {
                "commandId": command_id, "runId": run_id,
                "workflowId": workflow_id, "phase": phase,
            }
        )
        self._bus.publish(event)

        if self._flow_runner:
            try:
                result = self._flow_runner(request)
                self._handle_flow_result(session.id, session.mode, command_id, run_id, result)
                return result
            except Exception as e:
                self._store.append_event(
                    session.id, session.mode, ModeEventType.FLOW_RUN_FAILED,
                    {"commandId": command_id, "runId": run_id, "error": str(e)}
                )
                logger.exception("Flow run failed for mode session %s", session_id)
                return {"error": str(e), "commandId": command_id}

        return request

    def _handle_flow_result(
        self,
        session_id: str,
        mode: AgentModeId,
        command_id: str,
        run_id: str,
        result: Dict[str, Any],
    ):
        status = result.get("status", "completed")
        if status == "failed":
            event_type = ModeEventType.FLOW_RUN_FAILED
        else:
            event_type = ModeEventType.FLOW_RUN_COMPLETED
        event = self._store.append_event(
            session_id, mode, event_type,
            {
                "commandId": command_id, "runId": run_id,
                "status": status,
                "outputRefs": result.get("outputRefs", []),
                "evidenceRefs": result.get("evidenceRefs", []),
                "proposalRefs": result.get("proposalRefs", []),
                "tokenUsage": result.get("tokenUsage", 0),
                "cost": result.get("cost"),
                "error": result.get("error"),
            }
        )
        self._bus.publish(event)

        tokens = result.get("tokenUsage", 0) or 0
        cost = result.get("cost", 0.0) or 0.0
        if tokens or cost:
            self._store.increment_usage(session_id, tokens=tokens, cost=cost, turns=1)

    def get_events(
        self,
        session_id: str,
        since_sequence: int = 0,
        limit: int = 100,
    ) -> List[ModeEvent]:
        return self._store.get_events(session_id, since_sequence, limit)


_mode_controller_instance: Optional[ModeController] = None


def get_mode_controller(db_path=None) -> ModeController:
    """Get or create the global ModeController singleton."""
    global _mode_controller_instance
    if _mode_controller_instance is None:
        from hermes_state import SessionDB
        sdb = SessionDB(db_path) if db_path else SessionDB()
        store = ModeStore(sdb._conn)
        _mode_controller_instance = ModeController(store)
    return _mode_controller_instance


def reset_mode_controller():
    """Reset the singleton (for testing)."""
    global _mode_controller_instance
    _mode_controller_instance = None
