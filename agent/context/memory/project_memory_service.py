import sqlite3
import json
import logging
from typing import List, Optional, Dict, Any
from pathlib import Path

from .memory_schema import (
    init_context_db, _generate_id, _now_iso, get_context_db_path
)
from ..extraction.extraction_schema import ExtractedContextItem
from ..security.secret_redactor import redact_text

logger = logging.getLogger(__name__)

MAX_PIN_TOKENS = 4000
MAX_ACTIVE_PINS = 40


def _estimate_tokens(text: str) -> int:
    if not text:
        return 0
    return max(1, len(text) // 4)


class ProjectMemoryService:
    def __init__(self, db_path: Optional[Path] = None):
        self._db_path = db_path or get_context_db_path()
        self._conn: Optional[sqlite3.Connection] = None

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = init_context_db(self._db_path)
        return self._conn

    def add_memory(self, item: ExtractedContextItem) -> str:
        conn = self._get_conn()
        mem_id = item.id or _generate_id()
        now = _now_iso()
        safe_content = redact_text(item.content or "")
        conn.execute(
            """
            INSERT INTO context_memory 
            (id, workspace_id, module, task_id, session_id, artifact_id,
             type, scope, priority, content, status, domain, authority, writing_domain,
             source_kind, source_message_id, source_ref, source_quote, source_hash,
             confirmed_by, version, supersedes_id, conflicts_with_json,
             confidence, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                mem_id,
                item.workspace_id,
                item.module,
                item.task_id,
                item.session_id,
                item.artifact_id,
                item.type,
                item.scope,
                item.priority,
                safe_content,
                item.status or 'candidate',
                item.domain,
                item.authority or 'agent_inferred',
                item.writing_domain,
                item.source_kind or 'system_inference',
                item.source_message_id,
                item.source_ref,
                item.source_quote,
                None,
                item.confirmed_by,
                1,
                None,
                None,
                item.confidence,
                item.created_at or now,
                now,
            )
        )
        conn.commit()
        # Keep the in-memory item and its persisted row as the same entity.
        # Pinning/confirmation code can now reference this row without inserting
        # a duplicate candidate memory.
        item.id = mem_id
        return mem_id

    def add_memories(self, items: List[ExtractedContextItem]) -> List[str]:
        ids = []
        for item in items:
            ids.append(self.add_memory(item))
        return ids

    def get_active_memories(
        self,
        workspace_id: Optional[str] = None,
        module: Optional[str] = None,
        task_id: Optional[str] = None,
        types: Optional[List[str]] = None,
        status: Optional[str] = 'active',
        source_kind: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        query = "SELECT * FROM context_memory WHERE status NOT IN ('deleted', 'rejected')"
        params: List[Any] = []

        if status:
            query += " AND status = ?"
            params.append(status)
        if workspace_id:
            query += " AND (workspace_id = ? OR workspace_id IS NULL OR scope = 'global')"
            params.append(workspace_id)
        if module:
            query += " AND (module = ? OR module IS NULL OR scope IN ('global', 'workspace'))"
            params.append(module)
        if task_id:
            query += " AND (task_id = ? OR task_id IS NULL OR scope IN ('global', 'workspace', 'module'))"
            params.append(task_id)
        if types:
            placeholders = ",".join("?" * len(types))
            query += f" AND type IN ({placeholders})"
            params.extend(types)
        if source_kind:
            query += " AND source_kind = ?"
            params.append(source_kind)

        query += " ORDER BY CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 END, created_at DESC"
        query += " LIMIT ?"
        params.append(limit)

        cursor = conn.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

    def get_candidates(
        self,
        workspace_id: Optional[str] = None,
        module: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        return self.get_active_memories(
            workspace_id=workspace_id,
            module=module,
            status='candidate',
            limit=limit,
        )

    def confirm_memory(self, mem_id: str, confirmed_by: str = 'user') -> bool:
        conn = self._get_conn()
        now = _now_iso()
        cursor = conn.execute(
            """
            UPDATE context_memory 
            SET status = 'active', authority = 'user_confirmed', confirmed_by = ?, 
                version = version + 1, updated_at = ?
            WHERE id = ?
            """,
            (confirmed_by, now, mem_id),
        )
        conn.commit()
        return cursor.rowcount > 0

    def reject_memory(self, mem_id: str) -> bool:
        conn = self._get_conn()
        now = _now_iso()
        cursor = conn.execute(
            "UPDATE context_memory SET status = 'rejected', updated_at = ? WHERE id = ?",
            (now, mem_id),
        )
        conn.commit()
        return cursor.rowcount > 0

    def supersede_memory(self, old_id: str, new_id: str) -> bool:
        conn = self._get_conn()
        now = _now_iso()
        cursor = conn.execute(
            "UPDATE context_memory SET status = 'superseded', supersedes_id = ?, updated_at = ? WHERE id = ?",
            (new_id, now, old_id),
        )
        conn.commit()
        return cursor.rowcount > 0

    def add_conflict(self, mem_id: str, conflicts_with_id: str, reason: str) -> bool:
        conn = self._get_conn()
        now = _now_iso()
        existing = conn.execute(
            "SELECT conflicts_with_json FROM context_memory WHERE id = ?", (mem_id,)
        ).fetchone()
        conflicts = []
        if existing and existing['conflicts_with_json']:
            try:
                conflicts = json.loads(existing['conflicts_with_json'])
            except Exception:
                conflicts = []
        conflicts.append({"conflicts_with": conflicts_with_id, "reason": reason})
        cursor = conn.execute(
            "UPDATE context_memory SET conflicts_with_json = ?, updated_at = ? WHERE id = ?",
            (json.dumps(conflicts, ensure_ascii=False), now, mem_id),
        )
        conn.commit()
        return cursor.rowcount > 0

    def get_compression_events(
        self,
        session_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        query = "SELECT * FROM compression_events WHERE 1=1"
        params: List[Any] = []
        if session_id:
            query += " AND session_id = ?"
            params.append(session_id)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        cursor = conn.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

    def record_compression_event(
        self,
        session_id: str,
        profile_name: str,
        model_used: Optional[str] = None,
        estimated_cost: float = 0.0,
        retry_count: int = 0,
        summary_json: Optional[str] = None,
        quality_details_json: Optional[str] = None,
        envelope_version: int = 1,
        aborted: int = 0,
        abort_reason: Optional[str] = None,
        before_tokens: Optional[int] = None,
        after_tokens: Optional[int] = None,
        summary_tokens: Optional[int] = None,
        before_message_count: Optional[int] = None,
        after_message_count: Optional[int] = None,
        quality_score: Optional[float] = None,
        missing_fields_json: Optional[str] = None,
        workspace_id: Optional[str] = None,
        before_messages: Optional[int] = None,
        after_messages: Optional[int] = None,
        missed_items: Optional[List[Any]] = None,
    ) -> str:
        conn = self._get_conn()
        event_id = _generate_id()
        now = _now_iso()
        conn.execute(
            """
            INSERT INTO compression_events
            (id, session_id, workspace_id, profile_name, model_used, estimated_cost,
             retry_count, summary_json, quality_details_json, envelope_version,
             aborted, abort_reason, before_tokens, after_tokens, summary_tokens,
             before_message_count, after_message_count, quality_score, missing_fields_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id, session_id, workspace_id, profile_name, model_used, estimated_cost,
                retry_count, summary_json, quality_details_json, envelope_version,
                aborted, abort_reason, before_tokens, after_tokens, summary_tokens,
                before_message_count or before_messages, after_message_count or after_messages,
                quality_score, missing_fields_json, now,
            )
        )
        missed_json = json.dumps(missed_items or [], ensure_ascii=False) if missed_items is not None else None
        if missed_json is None and missing_fields_json:
            try:
                missed = json.loads(missing_fields_json)
                missed_json = json.dumps(missed, ensure_ascii=False)
            except Exception:
                missed_json = missing_fields_json
        conn.execute(
            """
            INSERT INTO context_compression_events
            (id, session_id, workspace_id, profile_name, model_used,
             before_tokens, after_tokens, before_messages, after_messages,
             quality_score, missed_items, aborted, abort_reason, envelope_version, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                event_id, session_id, workspace_id, profile_name, model_used,
                before_tokens, after_tokens,
                before_message_count or before_messages, after_message_count or after_messages,
                quality_score, missed_json,
                aborted, abort_reason, envelope_version, now,
            )
        )
        conn.commit()
        return event_id

    def soft_delete(self, mem_id: str) -> bool:
        conn = self._get_conn()
        now = _now_iso()
        cursor = conn.execute(
            "UPDATE context_memory SET status = 'deleted', updated_at = ? WHERE id = ?",
            (now, mem_id),
        )
        conn.commit()
        return cursor.rowcount > 0

    def update_memory(self, mem_id: str, content: str) -> bool:
        conn = self._get_conn()
        safe_content = redact_text(content or "")
        now = _now_iso()
        cursor = conn.execute(
            "UPDATE context_memory SET content = ?, version = version + 1, updated_at = ? WHERE id = ?",
            (safe_content, now, mem_id),
        )
        conn.commit()
        return cursor.rowcount > 0

    def delete_memory(self, mem_id: str) -> bool:
        return self.soft_delete(mem_id)

    def mark_resolved(self, mem_id: str) -> bool:
        conn = self._get_conn()
        now = _now_iso()
        cursor = conn.execute(
            "UPDATE context_memory SET status = 'resolved', updated_at = ? WHERE id = ?",
            (now, mem_id),
        )
        conn.commit()
        return cursor.rowcount > 0


class PinnedContextService:
    def __init__(self, db_path: Optional[Path] = None):
        self._db_path = db_path or get_context_db_path()
        self._conn: Optional[sqlite3.Connection] = None
        self._memory_service: Optional[ProjectMemoryService] = None

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = init_context_db(self._db_path)
        return self._conn

    def _get_memory_service(self) -> ProjectMemoryService:
        if self._memory_service is None:
            self._memory_service = ProjectMemoryService(self._db_path)
        return self._memory_service

    def _get_total_pin_tokens(self, workspace_id: Optional[str] = None, module: Optional[str] = None, task_id: Optional[str] = None) -> int:
        conn = self._get_conn()
        query = "SELECT COALESCE(SUM(token_estimate), 0) as total FROM pinned_context WHERE is_active = 1"
        params: List[Any] = []
        if workspace_id:
            query += " AND (workspace_id = ? OR workspace_id IS NULL OR scope = 'global')"
            params.append(workspace_id)
        if module:
            query += " AND (module = ? OR module IS NULL OR scope IN ('global', 'workspace'))"
            params.append(module)
        if task_id:
            query += " AND (task_id = ? OR task_id IS NULL OR scope IN ('global', 'workspace', 'module'))"
            params.append(task_id)
        row = conn.execute(query, params).fetchone()
        return row['total'] if row else 0

    def _get_active_pin_count(self, workspace_id: Optional[str] = None, module: Optional[str] = None, task_id: Optional[str] = None) -> int:
        conn = self._get_conn()
        query = "SELECT COUNT(*) as cnt FROM pinned_context WHERE is_active = 1"
        params: List[Any] = []
        if workspace_id:
            query += " AND (workspace_id = ? OR workspace_id IS NULL OR scope = 'global')"
            params.append(workspace_id)
        if module:
            query += " AND (module = ? OR module IS NULL OR scope IN ('global', 'workspace'))"
            params.append(module)
        if task_id:
            query += " AND (task_id = ? OR task_id IS NULL OR scope IN ('global', 'workspace', 'module'))"
            params.append(task_id)
        row = conn.execute(query, params).fetchone()
        return row['cnt'] if row else 0

    def get_pin_token_estimate(self, pin_id: str) -> int:
        conn = self._get_conn()
        row = conn.execute("SELECT token_estimate FROM pinned_context WHERE id = ?", (pin_id,)).fetchone()
        return row['token_estimate'] if row else 0

    def pin(
        self,
        content: str,
        scope: str = "task",
        priority: str = "high",
        workspace_id: Optional[str] = None,
        module: Optional[str] = None,
        task_id: Optional[str] = None,
        source_message_id: Optional[str] = None,
        memory_id: Optional[str] = None,
        pin_reason: Optional[str] = None,
        created_by: str = 'system',
    ) -> Optional[str]:
        conn = self._get_conn()
        
        active_count = self._get_active_pin_count(workspace_id, module, task_id)
        if active_count >= MAX_ACTIVE_PINS:
            logger.warning(f"Cannot pin: max active pins ({MAX_ACTIVE_PINS}) reached")
            return None

        token_estimate = _estimate_tokens(content)
        current_tokens = self._get_total_pin_tokens(workspace_id, module, task_id)
        if current_tokens + token_estimate > MAX_PIN_TOKENS:
            logger.warning(f"Cannot pin: would exceed max pin tokens ({MAX_PIN_TOKENS})")
            return None

        safe_content = redact_text(content or "")
        
        if not memory_id:
            mem_service = self._get_memory_service()
            item = ExtractedContextItem(
                type='constraint' if priority in ('critical', 'high') else 'user_preference',
                content=safe_content,
                scope=scope,
                priority=priority,
                workspace_id=workspace_id,
                module=module,
                task_id=task_id,
                source_message_id=source_message_id,
                source_kind='user_instruction' if created_by == 'user' else 'system_inference',
                authority='user_confirmed' if created_by == 'user' else 'agent_inferred',
                status='active',
                confirmed_by=created_by if created_by == 'user' else None,
            )
            memory_id = mem_service.add_memory(item)

        max_order_row = conn.execute(
            "SELECT COALESCE(MAX(pin_order), 0) as max_order FROM pinned_context WHERE is_active = 1"
        ).fetchone()
        next_order = (max_order_row['max_order'] if max_order_row else 0) + 1

        pin_id = _generate_id()
        now = _now_iso()
        conn.execute(
            """
            INSERT INTO pinned_context
            (id, workspace_id, module, task_id, memory_id, content, scope, priority,
             pin_reason, token_estimate, pin_order, created_by,
             created_from_message_id, is_active, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                pin_id, workspace_id, module, task_id,
                memory_id, safe_content, scope, priority,
                pin_reason, token_estimate, next_order, created_by,
                source_message_id, now, now,
            )
        )
        conn.commit()
        return pin_id

    def auto_pin_critical_items(self, memory_service: ProjectMemoryService, items: List[ExtractedContextItem]) -> List[str]:
        """Deprecated safety shim: inferred memories must remain candidates.

        Permanent pins are authority-bearing project state and therefore require
        the explicit confirm/pin API.  Returning an empty list preserves older
        callers without silently promoting model inferences.
        """
        return []

    def get_active_pins(
        self,
        workspace_id: Optional[str] = None,
        module: Optional[str] = None,
        task_id: Optional[str] = None,
        limit: int = 30,
    ) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        query = "SELECT * FROM pinned_context WHERE is_active = 1"
        params: List[Any] = []

        if workspace_id:
            query += " AND (workspace_id = ? OR workspace_id IS NULL OR scope = 'global')"
            params.append(workspace_id)
        if module:
            query += " AND (module = ? OR module IS NULL OR scope IN ('global', 'workspace'))"
            params.append(module)
        if task_id:
            query += " AND (task_id = ? OR task_id IS NULL OR scope IN ('global', 'workspace', 'module'))"
            params.append(task_id)

        query += " ORDER BY pin_order ASC, CASE priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'normal' THEN 3 WHEN 'low' THEN 4 END, created_at DESC"
        query += " LIMIT ?"
        params.append(limit)

        cursor = conn.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

    def unpin(self, pin_id: str) -> bool:
        conn = self._get_conn()
        now = _now_iso()
        cursor = conn.execute(
            "UPDATE pinned_context SET is_active = 0, updated_at = ? WHERE id = ?",
            (now, pin_id),
        )
        conn.commit()
        return cursor.rowcount > 0

    def repin(self, pin_id: str) -> bool:
        conn = self._get_conn()
        now = _now_iso()
        cursor = conn.execute(
            "UPDATE pinned_context SET is_active = 1, updated_at = ? WHERE id = ?",
            (now, pin_id),
        )
        conn.commit()
        return cursor.rowcount > 0

    def delete(self, pin_id: str) -> bool:
        conn = self._get_conn()
        cursor = conn.execute(
            "DELETE FROM pinned_context WHERE id = ?",
            (pin_id,),
        )
        conn.commit()
        return cursor.rowcount > 0


class DecisionLogService:
    def __init__(self, db_path: Optional[Path] = None):
        self._db_path = db_path or get_context_db_path()
        self._conn: Optional[sqlite3.Connection] = None

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = init_context_db(self._db_path)
        return self._conn

    def add_decision(
        self,
        decision: str,
        reason: Optional[str] = None,
        alternatives_rejected: Optional[str] = None,
        workspace_id: Optional[str] = None,
        module: Optional[str] = None,
        task_id: Optional[str] = None,
        source_message_id: Optional[str] = None,
        source_ref: Optional[str] = None,
        confirmed_by: Optional[str] = None,
        effective_from: Optional[str] = None,
    ) -> str:
        conn = self._get_conn()
        dec_id = _generate_id()
        now = _now_iso()
        safe_decision = redact_text(decision or "")
        safe_reason = redact_text(reason) if reason else None
        safe_alts = redact_text(alternatives_rejected) if alternatives_rejected else None
        conn.execute(
            """
            INSERT INTO decision_log
            (id, workspace_id, module, task_id, decision, reason,
             alternatives_rejected, status, version, source_ref, confirmed_by,
             effective_from, created_from_message_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, ?, ?)
            """,
            (
                dec_id, workspace_id, module, task_id,
                safe_decision, safe_reason, safe_alts,
                source_ref, confirmed_by,
                effective_from or now, source_message_id, now,
            )
        )
        conn.commit()
        return dec_id

    def get_decisions(
        self,
        workspace_id: Optional[str] = None,
        module: Optional[str] = None,
        status: Optional[str] = 'active',
        limit: int = 30,
    ) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        query = "SELECT * FROM decision_log WHERE 1=1"
        params: List[Any] = []

        if status:
            query += " AND status = ?"
            params.append(status)
        if workspace_id:
            query += " AND (workspace_id = ? OR workspace_id IS NULL)"
            params.append(workspace_id)
        if module:
            query += " AND (module = ? OR module IS NULL)"
            params.append(module)

        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)

        cursor = conn.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]

    def update_decision(self, dec_id: str, decision: Optional[str] = None, reason: Optional[str] = None) -> bool:
        conn = self._get_conn()
        now = _now_iso()
        sets = []
        params: List[Any] = []
        if decision is not None:
            sets.append("decision = ?")
            params.append(redact_text(decision))
        if reason is not None:
            sets.append("reason = ?")
            params.append(redact_text(reason))
        if not sets:
            return False
        sets.append("version = version + 1")
        sets.append("updated_at = ?")
        params.extend([now, dec_id])
        query = f"UPDATE decision_log SET {', '.join(sets)} WHERE id = ?"
        cursor = conn.execute(query, params)
        conn.commit()
        return cursor.rowcount > 0

    def supersede_decision(self, old_id: str, new_id: str) -> bool:
        conn = self._get_conn()
        now = _now_iso()
        cursor = conn.execute(
            "UPDATE decision_log SET status = 'superseded', supersedes_id = ?, effective_to = ? WHERE id = ?",
            (new_id, now, old_id),
        )
        conn.commit()
        return cursor.rowcount > 0

    def confirm_decision(self, dec_id: str, confirmed_by: str = 'user') -> bool:
        conn = self._get_conn()
        now = _now_iso()
        cursor = conn.execute(
            "UPDATE decision_log SET status = 'active', confirmed_by = ?, version = version + 1 WHERE id = ?",
            (confirmed_by, dec_id),
        )
        conn.commit()
        return cursor.rowcount > 0

    def delete_decision(self, dec_id: str) -> bool:
        conn = self._get_conn()
        cursor = conn.execute(
            "UPDATE decision_log SET status = 'deleted' WHERE id = ?",
            (dec_id,),
        )
        conn.commit()
        return cursor.rowcount > 0


class ToolOutputRecordService:
    def __init__(self, db_path: Optional[Path] = None):
        self._db_path = db_path or get_context_db_path()
        self._conn: Optional[sqlite3.Connection] = None

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = init_context_db(self._db_path)
        return self._conn

    def record_tool_output(
        self,
        tool_name: str,
        summary: str,
        full_content_ref: str,
        workspace_id: Optional[str] = None,
        task_id: Optional[str] = None,
        session_id: Optional[str] = None,
        node_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        source_kind: Optional[str] = None,
        output_type: str = 'text',
        related_files: Optional[List[str]] = None,
        content_hash: Optional[str] = None,
        redaction_report: Optional[Dict[str, Any]] = None,
        retention_policy: str = 'default',
        expires_at: Optional[str] = None,
        token_estimate: Optional[int] = None,
        char_count: Optional[int] = None,
        truncated: bool = False,
    ) -> str:
        import hashlib
        conn = self._get_conn()
        record_id = _generate_id()
        now = _now_iso()
        safe_summary = redact_text(summary or "")
        if content_hash is None:
            content_hash = hashlib.sha256((full_content_ref + summary).encode('utf-8')).hexdigest()[:32]
        if token_estimate is None:
            token_estimate = _estimate_tokens(summary)
        if char_count is None:
            char_count = len(summary or "")
        conn.execute(
            """
            INSERT INTO tool_output_records
            (id, workspace_id, task_id, session_id, node_id, agent_id,
             tool_name, output_type, source_kind,
             summary, full_content_ref, related_files_json, content_hash,
             redaction_report_json, retention_policy, expires_at,
             token_estimate, char_count, truncated, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record_id, workspace_id, task_id, session_id, node_id, agent_id,
                tool_name, output_type, source_kind or 'tool_call',
                safe_summary, full_content_ref,
                json.dumps(related_files or [], ensure_ascii=False),
                content_hash,
                json.dumps(redaction_report or {}, ensure_ascii=False) if redaction_report else None,
                retention_policy, expires_at,
                token_estimate, char_count, 1 if truncated else 0, now,
            )
        )
        conn.commit()
        return record_id

    def get_tool_outputs(
        self,
        session_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        query = "SELECT * FROM tool_output_records WHERE 1=1"
        params: List[Any] = []
        if session_id:
            query += " AND session_id = ?"
            params.append(session_id)
        if workspace_id:
            query += " AND workspace_id = ?"
            params.append(workspace_id)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        cursor = conn.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]


def _extract_tool_refs_from_text(text: str) -> List[str]:
    import re as _re
    if not text:
        return []
    refs = []
    for m in _re.finditer(r'id=(toolout_[a-zA-Z0-9_]+)', text):
        ref = m.group(1)
        if ref not in refs:
            refs.append(ref)
    for m in _re.finditer(r'(toolout_[a-zA-Z0-9_]+)', text):
        ref = m.group(1)
        if ref not in refs:
            refs.append(ref)
    return refs


def _extract_file_refs_from_text(text: str, limit: int = 20) -> List[str]:
    import re as _re
    if not text:
        return []
    files = []
    patterns = [
        _re.compile(r'[a-zA-Z]:[\\/][^\s`\'")\]}<>]+\.[a-zA-Z0-9]+'),
        _re.compile(r'~?/[^\s`\'")\]}<>]+\.[a-zA-Z0-9]+'),
        _re.compile(r'(?:^|[\s("`\'])([a-zA-Z0-9_\-/.]+\.(?:py|ts|tsx|js|jsx|md|json|yaml|yml|css|html|vue|go|rs|java|kt|swift))'),
    ]
    for pattern in patterns:
        for m in pattern.finditer(text):
            f = m.group(0) if m.lastindex is None else m.group(1)
            f = f.strip().strip('"\'`(),')
            if f and f not in files and len(f) < 300:
                files.append(f)
            if len(files) >= limit:
                return files
    return files


def _deserialize_node_row(row: dict) -> dict:
    r = dict(row)
    for json_col in ("key_findings_json", "decisions_json", "evidence_refs_json",
                    "file_refs_json", "errors_json", "next_suggestions_json",
                    "context_packet_json"):
        try:
            val = r.get(json_col)
            default = [] if json_col != "context_packet_json" else None
            r[json_col.replace("_json", "")] = json.loads(val) if val else default
        except Exception:
            r[json_col.replace("_json", "")] = [] if json_col != "context_packet_json" else None
    return r


class NodeRunSummaryService:
    def __init__(self, db_path=None):
        self._db_path = db_path or get_context_db_path()
        self._conn = None

    def _get_conn(self):
        if self._conn is None:
            self._conn = init_context_db(self._db_path)
        return self._conn

    def _try_enrich_refs_from_tool_outputs(
        self,
        evidence_refs: List[str],
        file_refs: List[str],
        output_summary: str,
        input_summary: str,
        task: str,
    ):
        auto_evidence = list(evidence_refs or [])
        auto_files = list(file_refs or [])

        combined_text = " ".join(filter(None, [task, input_summary, output_summary]))
        text_refs = _extract_tool_refs_from_text(combined_text)
        for ref in text_refs:
            if ref not in auto_evidence:
                auto_evidence.append(ref)

        try:
            from ..tool_outputs.tool_output_store import ToolOutputStore
            store = ToolOutputStore(self._db_path)
            if auto_evidence:
                records = store.get_by_refs(auto_evidence)
                for rec in records:
                    for f in rec.related_files:
                        if f not in auto_files:
                            auto_files.append(f)
                    if rec.id not in auto_evidence:
                        auto_evidence.append(rec.id)
        except Exception:
            pass

        text_files = _extract_file_refs_from_text(combined_text)
        for f in text_files:
            if f not in auto_files:
                auto_files.append(f)

        return auto_evidence, auto_files

    def add_node_summary(
        self,
        flow_run_id,
        node_id,
        agent_id=None,
        task="",
        input_summary="",
        output_summary="",
        key_findings=None,
        decisions=None,
        evidence_refs=None,
        file_refs=None,
        errors=None,
        next_suggestions=None,
        token_usage=0,
        workspace_id=None,
        session_id=None,
        summary_quality="ok",
        context_packet=None,
    ):
        conn = self._get_conn()
        summary_id = _generate_id()
        now = _now_iso()
        safe_task = redact_text(task or "")
        safe_input = redact_text(input_summary or "")
        safe_output = redact_text(output_summary or "")
        context_packet_json = json.dumps(context_packet, ensure_ascii=False) if context_packet else None

        auto_evidence, auto_files = self._try_enrich_refs_from_tool_outputs(
            evidence_refs or [], file_refs or [], safe_output, safe_input, safe_task
        )

        conn.execute(
            """
            INSERT INTO agent_node_run_summaries
            (id, flow_run_id, node_id, agent_id, workspace_id, session_id,
             task, input_summary, output_summary, summary_quality, context_packet_json,
             key_findings_json, decisions_json, evidence_refs_json, file_refs_json,
             errors_json, next_suggestions_json, token_usage, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                summary_id, flow_run_id, node_id, agent_id, workspace_id, session_id,
                safe_task, safe_input, safe_output,
                summary_quality, context_packet_json,
                json.dumps(key_findings or [], ensure_ascii=False),
                json.dumps(decisions or [], ensure_ascii=False),
                json.dumps(auto_evidence, ensure_ascii=False),
                json.dumps(auto_files, ensure_ascii=False),
                json.dumps(errors or [], ensure_ascii=False),
                json.dumps(next_suggestions or [], ensure_ascii=False),
                token_usage, now,
            )
        )
        conn.commit()
        return summary_id

    def get_node_summary(self, node_id: str) -> Optional[dict]:
        conn = self._get_conn()
        cursor = conn.execute(
            "SELECT * FROM agent_node_run_summaries WHERE node_id = ? ORDER BY created_at DESC LIMIT 1",
            (node_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        return _deserialize_node_row(row)

    def get_flow_timeline(self, flow_run_id: str) -> List[dict]:
        conn = self._get_conn()
        cursor = conn.execute(
            "SELECT * FROM agent_node_run_summaries WHERE flow_run_id = ? ORDER BY created_at ASC",
            (flow_run_id,),
        )
        return [_deserialize_node_row(row) for row in cursor.fetchall()]

    def get_flow_summaries(self, flow_run_id):
        return self.get_flow_timeline(flow_run_id)

    def search_node_summaries(self, query: str, limit: int = 20) -> List[dict]:
        conn = self._get_conn()
        like_pattern = f"%{query}%"
        cursor = conn.execute(
            """
            SELECT * FROM agent_node_run_summaries
            WHERE key_findings_json LIKE ?
               OR decisions_json LIKE ?
               OR output_summary LIKE ?
               OR task LIKE ?
            ORDER BY created_at DESC LIMIT ?
            """,
            (like_pattern, like_pattern, like_pattern, like_pattern, limit),
        )
        return [_deserialize_node_row(row) for row in cursor.fetchall()]

    def get_recent_summaries(self, workspace_id=None, session_id=None, limit=20):
        conn = self._get_conn()
        query = "SELECT * FROM agent_node_run_summaries WHERE 1=1"
        params: List[Any] = []
        if workspace_id:
            query += " AND (workspace_id = ? OR workspace_id IS NULL)"
            params.append(workspace_id)
        if session_id:
            query += " AND (session_id = ? OR session_id IS NULL)"
            params.append(session_id)
        query += " ORDER BY created_at DESC LIMIT ?"
        params.append(limit)
        cursor = conn.execute(query, params)
        return [_deserialize_node_row(row) for row in cursor.fetchall()]
