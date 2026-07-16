from __future__ import annotations

import sqlite3
import uuid
import json
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from agent.context.memory.memory_schema import get_context_db_path, _check_and_add_column

logger = logging.getLogger(__name__)

TOKEN_LEDGER_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS token_usage_events (
    id TEXT PRIMARY KEY,
    event_id TEXT,
    provider TEXT,
    model TEXT,
    session_id TEXT,
    project_id TEXT,
    workspace_id TEXT,
    workflow_id TEXT,
    node_id TEXT,
    agent_id TEXT,
    source_kind TEXT DEFAULT 'agent_chat',

    input_tokens INTEGER DEFAULT 0,
    cached_input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    reasoning_tokens INTEGER DEFAULT 0,
    cache_write_tokens INTEGER DEFAULT 0,

    tool_schema_tokens INTEGER DEFAULT 0,
    system_prompt_tokens INTEGER DEFAULT 0,
    memory_tokens INTEGER DEFAULT 0,
    rag_tokens INTEGER DEFAULT 0,
    upstream_tokens INTEGER DEFAULT 0,
    artifact_tokens INTEGER DEFAULT 0,
    summary_tokens INTEGER DEFAULT 0,

    estimated_input_tokens INTEGER DEFAULT 0,
    estimated_output_tokens INTEGER DEFAULT 0,
    estimated_cost REAL,
    actual_cost REAL,

    usage_source TEXT DEFAULT 'estimate',
    api_mode TEXT,
    plan_id TEXT,
    cache_hit INTEGER DEFAULT 0,

    created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS context_build_events (
    id TEXT PRIMARY KEY,
    plan_id TEXT,
    session_id TEXT,
    project_id TEXT,
    workspace_id TEXT,

    envelope_json TEXT,
    profile_name TEXT,
    policy_mode TEXT,

    context_window INTEGER DEFAULT 0,
    reserved_output_tokens INTEGER DEFAULT 0,
    max_input_tokens INTEGER DEFAULT 0,

    system_budget INTEGER DEFAULT 0,
    task_root_budget INTEGER DEFAULT 0,
    pinned_budget INTEGER DEFAULT 0,
    artifact_budget INTEGER DEFAULT 0,
    recent_budget INTEGER DEFAULT 0,
    summary_budget INTEGER DEFAULT 0,
    retrieval_budget INTEGER DEFAULT 0,
    upstream_budget INTEGER DEFAULT 0,

    system_used INTEGER DEFAULT 0,
    task_root_used INTEGER DEFAULT 0,
    pinned_used INTEGER DEFAULT 0,
    artifact_used INTEGER DEFAULT 0,
    recent_used INTEGER DEFAULT 0,
    summary_used INTEGER DEFAULT 0,
    retrieval_used INTEGER DEFAULT 0,
    upstream_used INTEGER DEFAULT 0,

    truncated_items_json TEXT,
    externalized_items_json TEXT,
    warnings_json TEXT,
    actions_json TEXT,

    cache_key TEXT,
    stable_prefix_hash TEXT,
    context_hash TEXT,

    total_input_tokens INTEGER DEFAULT 0,
    total_output_estimate INTEGER DEFAULT 0,
    estimated_cost REAL,
    blocked INTEGER DEFAULT 0,
    block_reason TEXT,

    created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS token_reuse_records (
    id TEXT PRIMARY KEY,
    reuse_type TEXT NOT NULL,
    session_id TEXT,
    project_id TEXT,
    workflow_id TEXT,
    node_id TEXT,

    source_ref TEXT,
    cache_key TEXT,
    input_hash TEXT,
    prompt_template_version TEXT,
    skill_version TEXT,
    model_id TEXT,
    constraints_version TEXT,
    rag_index_version TEXT,
    node_config_version TEXT,

    tokens_before_reuse INTEGER DEFAULT 0,
    tokens_after_reuse INTEGER DEFAULT 0,
    tokens_saved INTEGER DEFAULT 0,
    reused INTEGER DEFAULT 0,
    invalidated INTEGER DEFAULT 0,
    invalidation_reason TEXT,

    created_at DATETIME NOT NULL,
    reused_at DATETIME,
    expires_at DATETIME
);

CREATE TABLE IF NOT EXISTS token_policies (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    scope_id TEXT,
    policy_json TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    created_by TEXT DEFAULT 'system',
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS token_events (
    id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    session_id TEXT,
    project_id TEXT,
    workflow_id TEXT,
    node_id TEXT,
    plan_id TEXT,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_token_usage_session ON token_usage_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_project ON token_usage_events(project_id, created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_workflow ON token_usage_events(workflow_id, node_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_provider ON token_usage_events(provider, model, created_at);
CREATE INDEX IF NOT EXISTS idx_token_usage_source ON token_usage_events(source_kind, created_at);
CREATE INDEX IF NOT EXISTS idx_context_build_session ON context_build_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_context_build_plan ON context_build_events(plan_id);
CREATE INDEX IF NOT EXISTS idx_reuse_type ON token_reuse_records(reuse_type, reused);
CREATE INDEX IF NOT EXISTS idx_reuse_cache_key ON token_reuse_records(cache_key);
CREATE INDEX IF NOT EXISTS idx_reuse_workflow ON token_reuse_records(workflow_id, node_id);
CREATE INDEX IF NOT EXISTS idx_token_events_session ON token_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_token_events_workflow ON token_events(workflow_id, node_id, created_at);
CREATE INDEX IF NOT EXISTS idx_policy_scope ON token_policies(scope, scope_id);
"""

def _now_iso() -> str:
    return datetime.utcnow().isoformat()

def _new_id() -> str:
    return str(uuid.uuid4())


class TokenLedger:
    def __init__(self, conn: Optional[sqlite3.Connection] = None):
        if conn is None:
            from agent.context.memory.memory_schema import init_context_db
            conn = init_context_db()
        self.conn = conn
        self._ensure_schema()

    def _ensure_schema(self):
        self.conn.executescript(TOKEN_LEDGER_SCHEMA_SQL)
        try:
            v = self.conn.execute("PRAGMA user_version").fetchone()[0]
        except Exception:
            v = 3
        if v < 4:
            for col, dfn in [
                ("cache_write_tokens", "INTEGER DEFAULT 0"),
                ("tool_schema_tokens", "INTEGER DEFAULT 0"),
                ("system_prompt_tokens", "INTEGER DEFAULT 0"),
                ("memory_tokens", "INTEGER DEFAULT 0"),
                ("rag_tokens", "INTEGER DEFAULT 0"),
                ("upstream_tokens", "INTEGER DEFAULT 0"),
                ("artifact_tokens", "INTEGER DEFAULT 0"),
                ("summary_tokens", "INTEGER DEFAULT 0"),
                ("estimated_input_tokens", "INTEGER DEFAULT 0"),
                ("estimated_output_tokens", "INTEGER DEFAULT 0"),
                ("api_mode", "TEXT"),
                ("plan_id", "TEXT"),
                ("cache_hit", "INTEGER DEFAULT 0"),
                ("event_id", "TEXT"),
            ]:
                _check_and_add_column(self.conn, "token_usage_events", col, dfn)
            self.conn.execute("CREATE INDEX IF NOT EXISTS idx_token_usage_plan ON token_usage_events(plan_id)")
            self.conn.commit()
            self.conn.execute("PRAGMA user_version = 4")
            self.conn.commit()

    def record_usage(
        self,
        *,
        provider: str = "",
        model: str = "",
        session_id: Optional[str] = None,
        project_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        workflow_id: Optional[str] = None,
        node_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        source_kind: str = "agent_chat",
        input_tokens: int = 0,
        cached_input_tokens: int = 0,
        output_tokens: int = 0,
        reasoning_tokens: int = 0,
        cache_write_tokens: int = 0,
        tool_schema_tokens: int = 0,
        system_prompt_tokens: int = 0,
        memory_tokens: int = 0,
        rag_tokens: int = 0,
        upstream_tokens: int = 0,
        artifact_tokens: int = 0,
        summary_tokens: int = 0,
        estimated_input_tokens: int = 0,
        estimated_output_tokens: int = 0,
        estimated_cost: Optional[float] = None,
        actual_cost: Optional[float] = None,
        usage_source: str = "estimate",
        api_mode: Optional[str] = None,
        plan_id: Optional[str] = None,
        cache_hit: bool = False,
    ) -> str:
        eid = _new_id()
        self.conn.execute(
            """INSERT INTO token_usage_events (
                id, event_id, provider, model, session_id, project_id, workspace_id,
                workflow_id, node_id, agent_id, source_kind,
                input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, cache_write_tokens,
                tool_schema_tokens, system_prompt_tokens, memory_tokens, rag_tokens, upstream_tokens,
                artifact_tokens, summary_tokens,
                estimated_input_tokens, estimated_output_tokens,
                estimated_cost, actual_cost, usage_source, api_mode, plan_id, cache_hit,
                created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                eid, eid, provider, model, session_id, project_id, workspace_id,
                workflow_id, node_id, agent_id, source_kind,
                input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, cache_write_tokens,
                tool_schema_tokens, system_prompt_tokens, memory_tokens, rag_tokens, upstream_tokens,
                artifact_tokens, summary_tokens,
                estimated_input_tokens, estimated_output_tokens,
                estimated_cost, actual_cost, usage_source, api_mode, plan_id, 1 if cache_hit else 0,
                _now_iso(),
            ),
        )
        self.conn.commit()
        return eid

    def record_context_build(self, plan_dict: Dict[str, Any]) -> str:
        bid = plan_dict.get("plan_id") or _new_id()
        self.conn.execute(
            """INSERT INTO context_build_events (
                id, plan_id, session_id, project_id, workspace_id,
                envelope_json, profile_name, policy_mode,
                context_window, reserved_output_tokens, max_input_tokens,
                system_budget, task_root_budget, pinned_budget, artifact_budget,
                recent_budget, summary_budget, retrieval_budget, upstream_budget,
                system_used, task_root_used, pinned_used, artifact_used,
                recent_used, summary_used, retrieval_used, upstream_used,
                truncated_items_json, externalized_items_json, warnings_json, actions_json,
                cache_key, stable_prefix_hash, context_hash,
                total_input_tokens, total_output_estimate, estimated_cost,
                blocked, block_reason, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                bid, bid,
                plan_dict.get("session_id"), plan_dict.get("project_id"), plan_dict.get("workspace_id"),
                json.dumps(plan_dict.get("envelope") or {}, ensure_ascii=False),
                plan_dict.get("profile", ""), plan_dict.get("policy_mode", "balanced"),
                plan_dict.get("context_window", 0), plan_dict.get("reserved_output_tokens", 0),
                plan_dict.get("max_input_tokens", 0),
                plan_dict.get("budgets", {}).get("system", 0),
                plan_dict.get("budgets", {}).get("task_root", 0),
                plan_dict.get("budgets", {}).get("pinned", 0),
                plan_dict.get("budgets", {}).get("active_artifact", 0),
                plan_dict.get("budgets", {}).get("recent_messages", 0),
                plan_dict.get("budgets", {}).get("summary", 0),
                plan_dict.get("budgets", {}).get("retrieval", 0),
                plan_dict.get("budgets", {}).get("upstream", 0),
                plan_dict.get("used", {}).get("system", 0),
                plan_dict.get("used", {}).get("task_root", 0),
                plan_dict.get("used", {}).get("pinned", 0),
                plan_dict.get("used", {}).get("active_artifact", 0),
                plan_dict.get("used", {}).get("recent_messages", 0),
                plan_dict.get("used", {}).get("summary", 0),
                plan_dict.get("used", {}).get("retrieval", 0),
                plan_dict.get("used", {}).get("upstream", 0),
                json.dumps(plan_dict.get("truncated", []), ensure_ascii=False),
                json.dumps(plan_dict.get("externalized", []), ensure_ascii=False),
                json.dumps(plan_dict.get("warnings", []), ensure_ascii=False),
                json.dumps(plan_dict.get("actions", []), ensure_ascii=False),
                plan_dict.get("cache_key"), plan_dict.get("stable_prefix_hash"),
                plan_dict.get("context_hash"),
                plan_dict.get("estimated", {}).get("input_tokens", 0),
                plan_dict.get("estimated", {}).get("output_tokens", 0),
                plan_dict.get("estimated", {}).get("cost_usd"),
                1 if plan_dict.get("blocked") else 0,
                plan_dict.get("block_reason"),
                _now_iso(),
            ),
        )
        self.conn.commit()
        return bid

    def record_reuse(
        self,
        *,
        reuse_type: str,
        session_id: Optional[str] = None,
        project_id: Optional[str] = None,
        workflow_id: Optional[str] = None,
        node_id: Optional[str] = None,
        source_ref: Optional[str] = None,
        cache_key: Optional[str] = None,
        input_hash: Optional[str] = None,
        tokens_before: int = 0,
        tokens_after: int = 0,
        model_id: str = "",
        **extra,
    ) -> str:
        rid = _new_id()
        self.conn.execute(
            """INSERT INTO token_reuse_records (
                id, reuse_type, session_id, project_id, workflow_id, node_id,
                source_ref, cache_key, input_hash, model_id,
                tokens_before_reuse, tokens_after_reuse, tokens_saved,
                reused, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                rid, reuse_type, session_id, project_id, workflow_id, node_id,
                source_ref, cache_key, input_hash, model_id,
                tokens_before, tokens_after, max(0, tokens_before - tokens_after),
                1, _now_iso(),
            ),
        )
        self.conn.commit()
        return rid

    def emit_event(self, event_type: str, payload: Optional[Dict[str, Any]] = None, *,
                   session_id: Optional[str] = None, project_id: Optional[str] = None,
                   workflow_id: Optional[str] = None, node_id: Optional[str] = None,
                   plan_id: Optional[str] = None) -> str:
        eid = _new_id()
        self.conn.execute(
            """INSERT INTO token_events
               (id,event_type,session_id,project_id,workflow_id,node_id,plan_id,payload_json,created_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (eid, event_type, session_id, project_id, workflow_id, node_id, plan_id,
             json.dumps(payload or {}, ensure_ascii=False), _now_iso()),
        )
        self.conn.commit()
        return eid

    def get_events(self, *, session_id: Optional[str] = None,
                   workflow_id: Optional[str] = None, limit: int = 100) -> List[Dict[str, Any]]:
        clauses: List[str] = []
        params: List[Any] = []
        if session_id:
            clauses.append("session_id=?")
            params.append(session_id)
        if workflow_id:
            clauses.append("workflow_id=?")
            params.append(workflow_id)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        params.append(max(1, min(int(limit), 500)))
        rows = self.conn.execute(
            f"""SELECT id,event_type,session_id,project_id,workflow_id,node_id,plan_id,payload_json,created_at
                FROM token_events {where} ORDER BY created_at DESC LIMIT ?""", params
        ).fetchall()
        result = []
        for row in rows:
            try:
                payload = json.loads(row[7] or "{}")
            except Exception:
                payload = {}
            result.append({
                "id": row[0], "event_type": row[1], "session_id": row[2],
                "project_id": row[3], "workflow_id": row[4], "node_id": row[5],
                "plan_id": row[6], "payload": payload, "created_at": row[8],
            })
        return result

    def save_policy(self, scope: str, scope_id: Optional[str], policy_dict: Dict[str, Any], created_by: str = "user") -> str:
        pid = _new_id()
        now = _now_iso()
        self.conn.execute(
            """INSERT INTO token_policies (id, scope, scope_id, policy_json, version, created_by, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?)""",
            (pid, scope, scope_id, json.dumps(policy_dict, ensure_ascii=False),
             policy_dict.get("version", 1), created_by, now, now),
        )
        self.conn.commit()
        return pid

    def get_active_policy(self, session_id: Optional[str] = None, project_id: Optional[str] = None,
                          workspace_id: Optional[str] = None, workflow_id: Optional[str] = None) -> Dict[str, Any]:
        from .token_policy import DEFAULT_TOKEN_POLICY
        merged = DEFAULT_TOKEN_POLICY.to_dict()
        scopes = [("global", None)]
        if workspace_id:
            scopes.append(("workspace", workspace_id))
        if project_id:
            scopes.append(("project", project_id))
        if session_id:
            scopes.append(("session", session_id))
        if workflow_id:
            scopes.append(("workflow", workflow_id))
        for scope, sid in scopes:
            row = self.conn.execute(
                "SELECT policy_json FROM token_policies WHERE scope=? AND scope_id IS ? ORDER BY created_at DESC LIMIT 1",
                (scope, sid),
            ).fetchone() if sid is None else self.conn.execute(
                "SELECT policy_json FROM token_policies WHERE scope=? AND scope_id=? ORDER BY created_at DESC LIMIT 1",
                (scope, sid),
            ).fetchone()
            if row:
                try:
                    p = json.loads(row[0])
                    for k, v in p.items():
                        if v is not None:
                            merged[k] = v
                except Exception:
                    pass
        return merged

    def get_usage_summary(self, *, session_id: Optional[str] = None, project_id: Optional[str] = None,
                          workflow_id: Optional[str] = None, since_minutes: Optional[int] = None) -> Dict[str, Any]:
        clauses = []
        params = []
        if session_id:
            clauses.append("session_id=?")
            params.append(session_id)
        if project_id:
            clauses.append("project_id=?")
            params.append(project_id)
        if workflow_id:
            clauses.append("workflow_id=?")
            params.append(workflow_id)
        if since_minutes:
            clauses.append("created_at >= datetime('now', ?)")
            params.append(f"-{since_minutes} minutes")
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        row = self.conn.execute(f"""
            SELECT COUNT(*) as calls,
                   COALESCE(SUM(input_tokens),0) as input_tokens,
                   COALESCE(SUM(cached_input_tokens),0) as cached_tokens,
                   COALESCE(SUM(output_tokens),0) as output_tokens,
                   COALESCE(SUM(reasoning_tokens),0) as reasoning_tokens,
                   COALESCE(SUM(tool_schema_tokens),0) as tool_tokens,
                   COALESCE(SUM(system_prompt_tokens),0) as system_tokens,
                   COALESCE(SUM(memory_tokens),0) as memory_tokens,
                   COALESCE(SUM(rag_tokens),0) as rag_tokens,
                   COALESCE(SUM(upstream_tokens),0) as upstream_tokens,
                   COALESCE(SUM(artifact_tokens),0) as artifact_tokens,
                   COALESCE(SUM(estimated_cost),0) as est_cost,
                   COALESCE(SUM(actual_cost),0) as actual_cost
            FROM token_usage_events {where}
        """, params).fetchone()
        by_source = {}
        for r in self.conn.execute(f"""
            SELECT source_kind, COUNT(*) as calls,
                   COALESCE(SUM(input_tokens + cached_input_tokens),0) as input_total,
                   COALESCE(SUM(output_tokens),0) as output_total
            FROM token_usage_events {where}
            GROUP BY source_kind
        """, params).fetchall():
            by_source[r[0]] = {"calls": r[1], "input_tokens": r[2], "output_tokens": r[3]}
        by_model = {}
        for r in self.conn.execute(f"""
            SELECT COALESCE(model,'unknown'),
                   COALESCE(SUM(input_tokens + cached_input_tokens),0),
                   COALESCE(SUM(output_tokens),0),
                   COUNT(*)
            FROM token_usage_events {where}
            GROUP BY model
        """, params).fetchall():
            by_model[r[0]] = {"input": r[1], "output": r[2], "calls": r[3]}
        reuse_savings = 0
        try:
            for r in self.conn.execute(f"""
                SELECT COALESCE(SUM(tokens_saved),0) FROM token_reuse_records WHERE reused=1 {
                    'AND session_id=?' if session_id else ''
                }
            """, [session_id] if session_id else []).fetchone():
                reuse_savings = r or 0
        except sqlite3.OperationalError:
            pass
        externalized_saved = 0
        try:
            for r in self.conn.execute(f"""
                SELECT COALESCE(SUM(char_count),0) FROM tool_output_records WHERE 1=1
                {'AND session_id=?' if session_id else ''}
            """, [session_id] if session_id else []).fetchone():
                if r:
                    externalized_saved = int(r) // 4
        except sqlite3.OperationalError:
            pass
        return {
            "calls": row[0] if row else 0,
            "input_tokens": row[1] if row else 0,
            "cached_input_tokens": row[2] if row else 0,
            "output_tokens": row[3] if row else 0,
            "reasoning_tokens": row[4] if row else 0,
            "total_prompt_tokens": (row[1] or 0) + (row[2] or 0),
            "total_tokens": (row[1] or 0) + (row[2] or 0) + (row[3] or 0),
            "breakdown": {
                "tool_schema": row[5] if row else 0,
                "system_prompt": row[6] if row else 0,
                "memory": row[7] if row else 0,
                "rag": row[8] if row else 0,
                "upstream": row[9] if row else 0,
                "artifact": row[10] if row else 0,
            },
            "estimated_cost_usd": row[11] if row else 0.0,
            "actual_cost_usd": row[12] if row else 0.0,
            "by_source_kind": by_source,
            "by_model": by_model,
            "savings": {
                "cache_hit_tokens": row[2] if row else 0,
                "reuse_tokens": reuse_savings,
                "externalized_tokens_estimate": externalized_saved,
            },
        }

    def get_recent_events(self, *, session_id: Optional[str] = None, project_id: Optional[str] = None,
                          limit: int = 50) -> List[Dict[str, Any]]:
        clauses = []
        params = []
        if session_id:
            clauses.append("session_id=?")
            params.append(session_id)
        if project_id:
            clauses.append("project_id=?")
            params.append(project_id)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        params.append(limit)
        rows = self.conn.execute(f"""
            SELECT id, provider, model, source_kind, input_tokens, cached_input_tokens,
                   output_tokens, reasoning_tokens, estimated_cost, usage_source, cache_hit, created_at
            FROM token_usage_events {where}
            ORDER BY created_at DESC LIMIT ?
        """, params).fetchall()
        return [
            {
                "id": r[0], "provider": r[1], "model": r[2], "source_kind": r[3],
                "input_tokens": r[4], "cached_input_tokens": r[5],
                "output_tokens": r[6], "reasoning_tokens": r[7],
                "estimated_cost": r[8], "usage_source": r[9],
                "cache_hit": bool(r[10]), "created_at": r[11],
            }
            for r in rows
        ]

    def get_cache_stats(self, session_id: Optional[str] = None) -> Dict[str, Any]:
        clauses = []
        params = []
        if session_id:
            clauses.append("session_id=?")
            params.append(session_id)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        row = self.conn.execute(f"""
            SELECT COUNT(*) as calls,
                   COALESCE(SUM(CASE WHEN cache_hit=1 THEN 1 ELSE 0 END),0),
                   COALESCE(SUM(cached_input_tokens),0),
                   COALESCE(SUM(cache_write_tokens),0),
                   COALESCE(SUM(input_tokens + cached_input_tokens),0)
            FROM token_usage_events {where}
        """, params).fetchone()
        total_calls = row[0] or 0
        hits = row[1] or 0
        return {
            "total_calls": total_calls,
            "cache_hits": hits,
            "hit_rate": hits / total_calls if total_calls else 0.0,
            "cached_tokens_read": row[2] or 0,
            "cached_tokens_written": row[3] or 0,
            "total_prompt_tokens": row[4] or 0,
            "cache_savings_pct": ((row[2] or 0) / (row[4] or 1)) * 100 if row[4] else 0.0,
        }

    def get_reuse_records(self, session_id: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        clauses = []
        params = []
        if session_id:
            clauses.append("session_id=?")
            params.append(session_id)
        where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        params.append(limit)
        rows = self.conn.execute(f"""
            SELECT id, reuse_type, tokens_before_reuse, tokens_after_reuse, tokens_saved,
                   reused, invalidation_reason, created_at
            FROM token_reuse_records {where}
            ORDER BY created_at DESC LIMIT ?
        """, params).fetchall()
        return [
            {
                "id": r[0], "reuse_type": r[1], "tokens_before": r[2], "tokens_after": r[3],
                "tokens_saved": r[4], "reused": bool(r[5]), "invalidation_reason": r[6], "created_at": r[7],
            }
            for r in rows
        ]


_ledger_instance: Optional[TokenLedger] = None

def get_token_ledger() -> TokenLedger:
    global _ledger_instance
    if _ledger_instance is None:
        _ledger_instance = TokenLedger()
    return _ledger_instance

def reset_token_ledger_for_testing(conn: Optional[sqlite3.Connection] = None):
    global _ledger_instance
    _ledger_instance = TokenLedger(conn)
    return _ledger_instance
