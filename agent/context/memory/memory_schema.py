import sqlite3
import logging
import uuid
import os
import shutil
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Dict, Any

from hermes_constants import get_hermes_home

logger = logging.getLogger(__name__)

CONTEXT_MEMORY_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS context_memory (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    module TEXT,
    task_id TEXT,
    session_id TEXT,
    artifact_id TEXT,
    
    type TEXT NOT NULL,
    scope TEXT NOT NULL,
    priority TEXT NOT NULL,
    
    content TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'candidate',
    domain TEXT,
    authority TEXT NOT NULL DEFAULT 'agent_inferred',
    writing_domain TEXT,
    
    source_kind TEXT DEFAULT 'system_inference',
    source_message_id TEXT,
    source_ref TEXT,
    source_quote TEXT,
    source_hash TEXT,
    confirmed_by TEXT,
    
    version INTEGER NOT NULL DEFAULT 1,
    supersedes_id TEXT,
    conflicts_with_json TEXT,
    
    confidence REAL DEFAULT 1.0,
    
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    expires_at DATETIME
);

CREATE TABLE IF NOT EXISTS pinned_context (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    module TEXT,
    task_id TEXT,
    
    memory_id TEXT REFERENCES context_memory(id) ON DELETE CASCADE,
    content TEXT,
    scope TEXT NOT NULL,
    priority TEXT NOT NULL,
    
    pin_reason TEXT,
    token_estimate INTEGER DEFAULT 0,
    pin_order INTEGER DEFAULT 0,
    created_by TEXT DEFAULT 'system',
    
    created_from_message_id TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL,
    expires_at DATETIME
);

CREATE TABLE IF NOT EXISTS decision_log (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    module TEXT,
    task_id TEXT,
    
    decision TEXT NOT NULL,
    reason TEXT,
    alternatives_rejected TEXT,
    
    status TEXT NOT NULL DEFAULT 'active',
    version INTEGER NOT NULL DEFAULT 1,
    supersedes_id TEXT,
    effective_from DATETIME,
    effective_to DATETIME,
    source_ref TEXT,
    confirmed_by TEXT,
    
    created_from_message_id TEXT,
    created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_output_records (
    id TEXT PRIMARY KEY,
    workspace_id TEXT,
    task_id TEXT,
    session_id TEXT,
    node_id TEXT,
    agent_id TEXT,
    
    tool_name TEXT NOT NULL,
    output_type TEXT NOT NULL DEFAULT 'text',
    source_kind TEXT DEFAULT 'tool_call',
    
    summary TEXT,
    full_content_ref TEXT NOT NULL,
    related_files_json TEXT,
    content_hash TEXT,
    redaction_report_json TEXT,
    retention_policy TEXT NOT NULL DEFAULT 'default',
    expires_at DATETIME,
    
    token_estimate INTEGER,
    char_count INTEGER DEFAULT 0,
    truncated INTEGER DEFAULT 0,
    
    created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS context_compression_events (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    workspace_id TEXT,
    profile_name TEXT,
    model_used TEXT,
    before_tokens INTEGER,
    after_tokens INTEGER,
    before_messages INTEGER,
    after_messages INTEGER,
    quality_score REAL,
    missed_items TEXT,
    aborted INTEGER DEFAULT 0,
    abort_reason TEXT,
    envelope_version INTEGER DEFAULT 1,
    created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS compression_events (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    workspace_id TEXT,
    
    profile_name TEXT NOT NULL,
    model_used TEXT,
    estimated_cost REAL DEFAULT 0.0,
    retry_count INTEGER DEFAULT 0,
    summary_json TEXT,
    quality_details_json TEXT,
    envelope_version INTEGER DEFAULT 1,
    aborted INTEGER DEFAULT 0,
    abort_reason TEXT,
    
    before_tokens INTEGER,
    after_tokens INTEGER,
    summary_tokens INTEGER,
    before_message_count INTEGER,
    after_message_count INTEGER,
    
    quality_score REAL,
    missing_fields_json TEXT,
    
    created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_node_run_summaries (
    id TEXT PRIMARY KEY,
    flow_run_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    agent_id TEXT,
    workspace_id TEXT,
    session_id TEXT,
    
    task TEXT,
    input_summary TEXT,
    output_summary TEXT,
    summary_quality TEXT NOT NULL DEFAULT 'ok',
    context_packet_json TEXT,
    
    key_findings_json TEXT,
    decisions_json TEXT,
    evidence_refs_json TEXT,
    file_refs_json TEXT,
    errors_json TEXT,
    next_suggestions_json TEXT,
    
    token_usage INTEGER,
    created_at DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_context_memory_workspace ON context_memory(workspace_id, module, status);
CREATE INDEX IF NOT EXISTS idx_context_memory_type ON context_memory(type, priority, status);
CREATE INDEX IF NOT EXISTS idx_context_memory_session ON context_memory(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_context_memory_artifact ON context_memory(artifact_id);
CREATE INDEX IF NOT EXISTS idx_context_memory_status ON context_memory(status, source_kind);
CREATE INDEX IF NOT EXISTS idx_context_memory_supersedes ON context_memory(supersedes_id);
CREATE INDEX IF NOT EXISTS idx_pinned_context_active ON pinned_context(is_active, workspace_id, module);
CREATE INDEX IF NOT EXISTS idx_pinned_context_memory ON pinned_context(memory_id);
CREATE INDEX IF NOT EXISTS idx_pinned_context_order ON pinned_context(pin_order, created_at);
CREATE INDEX IF NOT EXISTS idx_compression_events_session ON compression_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tool_outputs_session ON tool_output_records(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tool_outputs_hash ON tool_output_records(content_hash);
CREATE INDEX IF NOT EXISTS idx_node_summaries_flow ON agent_node_run_summaries(flow_run_id, node_id);
CREATE INDEX IF NOT EXISTS idx_node_summaries_workspace ON agent_node_run_summaries(workspace_id, session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_decision_log_status ON decision_log(status, workspace_id, module);
"""


def get_context_db_path() -> Path:
    import os
    candidates = []

    env_dir = os.environ.get("KARNA_CONTEXT_DIR")
    if env_dir:
        candidates.append(Path(env_dir))

    try:
        candidates.append(Path(get_hermes_home()) / "context")
    except Exception:
        pass

    import tempfile
    candidates.append(Path(tempfile.gettempdir()) / "karna_context")

    cwd = Path.cwd() / ".karna" / "context"
    candidates.append(cwd)

    for base in candidates:
        try:
            base.mkdir(parents=True, exist_ok=True)
            test_file = base / ".write_test"
            test_file.write_text("ok", encoding="utf-8")
            test_file.unlink()
            return base / "context_memory.db"
        except Exception:
            continue

    fallback = Path(tempfile.gettempdir()) / "karna_context"
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback / "context_memory.db"


def get_context_dir() -> Path:
    return get_context_db_path().parent


def get_tool_outputs_dir() -> Path:
    d = get_context_dir() / "tool_outputs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _check_and_add_column(conn: sqlite3.Connection, table: str, column: str, col_def: str):
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_def}")
    except sqlite3.OperationalError:
        pass


def _preflight_legacy_index_columns(conn: sqlite3.Connection) -> None:
    """Add columns referenced by CREATE INDEX before running the v3 script."""
    tables = {
        row[0] for row in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table'"
        ).fetchall()
    }
    required = {
        "context_memory": {
            "session_id": "TEXT", "artifact_id": "TEXT",
            "source_kind": "TEXT DEFAULT 'system_inference'", "supersedes_id": "TEXT",
        },
        "pinned_context": {"memory_id": "TEXT", "pin_order": "INTEGER DEFAULT 0"},
        "tool_output_records": {
            "session_id": "TEXT", "content_hash": "TEXT", "node_id": "TEXT",
            "agent_id": "TEXT",
        },
        "agent_node_run_summaries": {"workspace_id": "TEXT", "session_id": "TEXT"},
        "decision_log": {"status": "TEXT NOT NULL DEFAULT 'active'"},
    }
    for table, columns in required.items():
        if table not in tables:
            continue
        existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
        for column, definition in columns.items():
            if column not in existing:
                _check_and_add_column(conn, table, column, definition)
    conn.commit()


def _database_has_user_data(db_path: Path) -> bool:
    if not db_path.exists() or db_path.stat().st_size == 0:
        return False
    try:
        conn = sqlite3.connect(str(db_path))
        try:
            for table in ("context_memory", "pinned_context", "decision_log", "tool_output_records"):
                exists = conn.execute(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
                ).fetchone()
                if exists and conn.execute(f"SELECT 1 FROM {table} LIMIT 1").fetchone():
                    return True
        finally:
            conn.close()
    except sqlite3.Error:
        return False
    return False


def _migrate_legacy_hermes_db_if_needed(target: Path) -> None:
    """One-time, idempotent migration from the pre-Karna Hermes data path."""
    if os.environ.get("KARNA_DISABLE_LEGACY_CONTEXT_MIGRATION") == "1":
        return
    # Only the installed Karna data directory is a migration destination.
    # Explicit temp/test/custom stores must remain hermetic.
    if "karna-data" not in str(target.parent).lower().replace("_", "-"):
        return
    marker = target.parent / ".legacy-hermes-context-migrated-v1"
    if marker.exists() or _database_has_user_data(target):
        return
    local_app_data = os.environ.get("LOCALAPPDATA")
    if not local_app_data:
        return
    source = Path(local_app_data) / "hermes" / "context_memory.db"
    try:
        if not source.exists() or source.resolve() == target.resolve() or not _database_has_user_data(source):
            return
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            backup = target.with_suffix(".pre-legacy-migration.bak")
            if not backup.exists():
                shutil.copy2(target, backup)
        src_conn = sqlite3.connect(str(source))
        dst_conn = sqlite3.connect(str(target))
        try:
            src_conn.backup(dst_conn)
            dst_conn.commit()
        finally:
            dst_conn.close()
            src_conn.close()
        marker.write_text(
            f"source={source}\nmigrated_at={datetime.utcnow().isoformat()}Z\n",
            encoding="utf-8",
        )
        logger.info("Migrated legacy Hermes context database: %s -> %s", source, target)
    except Exception as exc:
        logger.warning("Legacy context database migration skipped: %s", exc)


def init_context_db(db_path: Optional[Path] = None) -> sqlite3.Connection:
    if db_path is None:
        db_path = get_context_db_path()
    
    db_path.parent.mkdir(parents=True, exist_ok=True)
    _migrate_legacy_hermes_db_if_needed(db_path)
    
    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    _preflight_legacy_index_columns(conn)
    conn.executescript(CONTEXT_MEMORY_SCHEMA_SQL)

    # Migration for user_version 1 -> 2
    try:
        current_version = conn.execute("PRAGMA user_version").fetchone()[0]
    except Exception:
        current_version = 0

    if current_version < 2:
        # context_memory new columns
        _check_and_add_column(conn, "context_memory", "session_id", "TEXT")
        _check_and_add_column(conn, "context_memory", "artifact_id", "TEXT")
        _check_and_add_column(conn, "context_memory", "domain", "TEXT")
        _check_and_add_column(conn, "context_memory", "authority", "TEXT NOT NULL DEFAULT 'agent_inferred'")
        _check_and_add_column(conn, "context_memory", "writing_domain", "TEXT")
        _check_and_add_column(conn, "context_memory", "source_ref", "TEXT")
        _check_and_add_column(conn, "context_memory", "source_quote", "TEXT")
        _check_and_add_column(conn, "context_memory", "source_hash", "TEXT")
        _check_and_add_column(conn, "context_memory", "version", "INTEGER NOT NULL DEFAULT 1")
        _check_and_add_column(conn, "context_memory", "supersedes_id", "TEXT")
        _check_and_add_column(conn, "context_memory", "conflicts_with_json", "TEXT")
        _check_and_add_column(conn, "context_memory", "confirmed_by", "TEXT")
        
        # Update default status for existing active memories - keep as is, new default is candidate
        # _check_and_add_column already has default for status from initial schema, no need to alter
        
        # pinned_context new columns
        _check_and_add_column(conn, "pinned_context", "memory_id", "TEXT REFERENCES context_memory(id) ON DELETE CASCADE")
        _check_and_add_column(conn, "pinned_context", "pin_reason", "TEXT")
        _check_and_add_column(conn, "pinned_context", "token_estimate", "INTEGER DEFAULT 0")
        _check_and_add_column(conn, "pinned_context", "pin_order", "INTEGER DEFAULT 0")
        _check_and_add_column(conn, "pinned_context", "created_by", "TEXT DEFAULT 'system'")
        _check_and_add_column(conn, "pinned_context", "content", "TEXT")
        
        # decision_log new columns
        _check_and_add_column(conn, "decision_log", "status", "TEXT NOT NULL DEFAULT 'active'")
        _check_and_add_column(conn, "decision_log", "version", "INTEGER NOT NULL DEFAULT 1")
        _check_and_add_column(conn, "decision_log", "supersedes_id", "TEXT")
        _check_and_add_column(conn, "decision_log", "effective_from", "DATETIME")
        _check_and_add_column(conn, "decision_log", "effective_to", "DATETIME")
        _check_and_add_column(conn, "decision_log", "source_ref", "TEXT")
        _check_and_add_column(conn, "decision_log", "confirmed_by", "TEXT")
        
        # tool_output_records new columns
        _check_and_add_column(conn, "tool_output_records", "content_hash", "TEXT")
        _check_and_add_column(conn, "tool_output_records", "redaction_report_json", "TEXT")
        _check_and_add_column(conn, "tool_output_records", "retention_policy", "TEXT NOT NULL DEFAULT 'default'")
        _check_and_add_column(conn, "tool_output_records", "expires_at", "DATETIME")
        
        # compression_events new columns
        _check_and_add_column(conn, "compression_events", "model_used", "TEXT")
        _check_and_add_column(conn, "compression_events", "estimated_cost", "REAL DEFAULT 0.0")
        _check_and_add_column(conn, "compression_events", "retry_count", "INTEGER DEFAULT 0")
        _check_and_add_column(conn, "compression_events", "summary_json", "TEXT")
        _check_and_add_column(conn, "compression_events", "before_message_count", "INTEGER")
        _check_and_add_column(conn, "compression_events", "after_message_count", "INTEGER")
        _check_and_add_column(conn, "compression_events", "quality_details_json", "TEXT")
        _check_and_add_column(conn, "compression_events", "envelope_version", "INTEGER DEFAULT 1")
        _check_and_add_column(conn, "compression_events", "aborted", "INTEGER DEFAULT 0")
        _check_and_add_column(conn, "compression_events", "abort_reason", "TEXT")
        
        # agent_node_run_summaries new columns
        _check_and_add_column(conn, "agent_node_run_summaries", "workspace_id", "TEXT")
        _check_and_add_column(conn, "agent_node_run_summaries", "session_id", "TEXT")
        _check_and_add_column(conn, "agent_node_run_summaries", "summary_quality", "TEXT NOT NULL DEFAULT 'ok'")
        _check_and_add_column(conn, "agent_node_run_summaries", "context_packet_json", "TEXT")
        
        # Add new indexes
        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_context_memory_session ON context_memory(session_id, created_at)")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_context_memory_artifact ON context_memory(artifact_id)")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_context_memory_status ON context_memory(status, source_kind)")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_context_memory_supersedes ON context_memory(supersedes_id)")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_pinned_context_memory ON pinned_context(memory_id)")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_pinned_context_order ON pinned_context(pin_order, created_at)")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_tool_outputs_hash ON tool_output_records(content_hash)")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_node_summaries_workspace ON agent_node_run_summaries(workspace_id, session_id, created_at)")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_decision_log_status ON decision_log(status, workspace_id, module)")
        except sqlite3.OperationalError:
            pass
        
        conn.execute("PRAGMA user_version = 2")

    # Ensure source_kind columns exist (from previous migration)
    _check_and_add_column(conn, "context_memory", "source_kind", "TEXT DEFAULT 'system_inference'")
    _check_and_add_column(conn, "tool_output_records", "source_kind", "TEXT DEFAULT 'tool_call'")

    if current_version < 3:
        _check_and_add_column(conn, "tool_output_records", "node_id", "TEXT")
        _check_and_add_column(conn, "tool_output_records", "agent_id", "TEXT")
        _check_and_add_column(conn, "tool_output_records", "char_count", "INTEGER DEFAULT 0")
        _check_and_add_column(conn, "tool_output_records", "truncated", "INTEGER DEFAULT 0")

        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_tool_outputs_node ON tool_output_records(node_id)")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_tool_outputs_agent ON tool_output_records(agent_id)")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("CREATE INDEX IF NOT EXISTS idx_context_compression_session ON context_compression_events(session_id, created_at)")
        except sqlite3.OperationalError:
            pass

        conn.execute("PRAGMA user_version = 3")

    conn.commit()
    
    return conn


def _generate_id() -> str:
    return str(uuid.uuid4())


def _now_iso() -> str:
    return datetime.utcnow().isoformat()
