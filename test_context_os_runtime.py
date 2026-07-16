"""Runtime-bound Context OS regression tests (no model/network required)."""
import os
import sqlite3
import tempfile
from pathlib import Path


root = Path(tempfile.mkdtemp(prefix="karna_context_runtime_"))
os.environ["KARNA_CONTEXT_DIR"] = str(root / "Karna" / "karna-data" / "context")
os.environ["HERMES_DESKTOP"] = "1"
os.environ["KARNA_DISABLE_LEGACY_CONTEXT_MIGRATION"] = "1"

from agent.context.context_envelope import ContextEnvelope, get_current_envelope
from agent.context.compressor.compression_profiles import get_profile
from agent.context.memory import ProjectMemoryService, PinnedContextService
from agent.context.extraction import ExtractedContextItem
from agent.context_compressor import ContextCompressor
from gateway.session_context import (
    get_session_envelope,
    reset_session_envelope,
    set_session_envelope,
)


def check(name, fn):
    fn()
    print(f"[PASS] {name}")


def test_turn_binding_and_reset():
    env = ContextEnvelope(
        workspace_id="workspace-a", project_id="project-a",
        session_id="server-session", module="writer_ide",
        source_kind="artifact_selection",
    )
    token = set_session_envelope(env)
    assert get_session_envelope().project_id == "project-a"
    assert get_current_envelope().project_id == "project-a"
    reset_session_envelope(token)
    assert get_session_envelope() is None
    assert get_current_envelope() is None


def test_gateway_normalization_contract():
    from tui_gateway.server import _normalize_prompt_context_envelope
    session = {"session_key": "real-session", "cwd": "D:/books/a"}
    env = _normalize_prompt_context_envelope({
        "context_envelope": {
            "session_id": "spoofed", "workspace_id": "workspace-a",
            "project_id": "project-a", "module": "writer_ide",
            "source_kind": "artifact_selection",
        }
    }, "transport-session", session)
    assert env.session_id == "real-session"
    assert env.get_scope_id() == "project-a"
    try:
        _normalize_prompt_context_envelope({
            "context_envelope": {"source_kind": "writer_ide"}
        }, "transport-session", session)
    except ValueError:
        pass
    else:
        raise AssertionError("invalid source kind was accepted")


def test_live_profile_application():
    comp = ContextCompressor(
        model="test", config_context_length=100_000, quiet_mode=True,
        threshold_percent=0.60,
    )
    comp.apply_compression_profile("research")
    research = get_profile("research")
    assert comp.threshold_percent == research.threshold
    assert comp.protect_last_n == research.protect_last_n
    assert comp.threshold_tokens == comp._compute_threshold_tokens(
        comp.context_length, research.threshold, comp.max_tokens,
    )
    comp.apply_compression_profile("longform_writing")
    assert comp.threshold_percent == get_profile("longform_writing").threshold
    assert comp.protect_last_n == 24


def test_candidate_requires_confirmation():
    memory = ProjectMemoryService()
    pins = PinnedContextService()
    item = ExtractedContextItem(
        type="constraint", scope="workspace", priority="critical",
        workspace_id="project-a", content="Keep the narrator in first person.",
    )
    mem_id = memory.add_memory(item)
    assert item.id == mem_id
    assert pins.auto_pin_critical_items(memory, [item]) == []
    assert pins.get_active_pins(workspace_id="project-a") == []
    assert len(memory.get_candidates(workspace_id="project-a")) == 1
    assert memory.confirm_memory(mem_id, confirmed_by="user")
    pin_id = pins.pin(
        content=item.content, scope=item.scope, priority=item.priority,
        workspace_id="project-a", memory_id=mem_id, created_by="user",
        pin_reason="user_confirmed",
    )
    assert pin_id
    assert len(pins.get_active_pins(workspace_id="project-a")) == 1
    conn = sqlite3.connect(str(memory._db_path))
    assert conn.execute("SELECT COUNT(*) FROM context_memory WHERE id=?", (mem_id,)).fetchone()[0] == 1
    conn.close()


def test_project_isolation():
    memory = ProjectMemoryService()
    a = ExtractedContextItem(
        type="character_fact", scope="workspace", priority="high",
        workspace_id="project-a", status="active", content="A-only fact",
    )
    b = ExtractedContextItem(
        type="character_fact", scope="workspace", priority="high",
        workspace_id="project-b", status="active", content="B-only fact",
    )
    memory.add_memories([a, b])
    a_rows = memory.get_active_memories(workspace_id="project-a")
    b_rows = memory.get_active_memories(workspace_id="project-b")
    assert any(row["content"] == "A-only fact" for row in a_rows)
    assert not any(row["content"] == "B-only fact" for row in a_rows)
    assert any(row["content"] == "B-only fact" for row in b_rows)
    assert not any(row["content"] == "A-only fact" for row in b_rows)


def test_legacy_database_migration():
    from agent.context.memory.memory_schema import init_context_db
    legacy_root = root / "legacy-local"
    legacy_db = legacy_root / "hermes" / "context_memory.db"
    legacy_db.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(legacy_db))
    conn.executescript("""
      CREATE TABLE context_memory (
        id TEXT PRIMARY KEY, workspace_id TEXT, module TEXT, task_id TEXT,
        type TEXT, scope TEXT, priority TEXT, content TEXT, status TEXT,
        source_message_id TEXT, confidence REAL, created_at TEXT, updated_at TEXT
      );
      INSERT INTO context_memory VALUES (
        'legacy-1','legacy-project',NULL,NULL,'constraint','workspace','high',
        'preserved legacy fact','active',NULL,1.0,'2026-01-01','2026-01-01'
      );
      PRAGMA user_version=1;
    """)
    conn.close()
    target = root / "Migrated" / "Karna" / "karna-data" / "context" / "context_memory.db"
    old_local = os.environ.get("LOCALAPPDATA")
    old_disable = os.environ.pop("KARNA_DISABLE_LEGACY_CONTEXT_MIGRATION", None)
    os.environ["LOCALAPPDATA"] = str(legacy_root)
    try:
        migrated = init_context_db(target)
        assert migrated.execute("SELECT content FROM context_memory WHERE id='legacy-1'").fetchone()[0] == "preserved legacy fact"
        assert migrated.execute("PRAGMA user_version").fetchone()[0] == 3
        migrated.close()
        # A second initialization is idempotent.
        again = init_context_db(target)
        assert again.execute("SELECT COUNT(*) FROM context_memory WHERE id='legacy-1'").fetchone()[0] == 1
        again.close()
    finally:
        if old_local is None:
            os.environ.pop("LOCALAPPDATA", None)
        else:
            os.environ["LOCALAPPDATA"] = old_local
        if old_disable is not None:
            os.environ["KARNA_DISABLE_LEGACY_CONTEXT_MIGRATION"] = old_disable


check("turn-bound envelope and reset", test_turn_binding_and_reset)
check("gateway prompt envelope normalization", test_gateway_normalization_contract)
check("live compressor profile application", test_live_profile_application)
check("candidate confirmation without duplicate auto-pin", test_candidate_requires_confirmation)
check("project memory isolation", test_project_isolation)
check("idempotent legacy database migration", test_legacy_database_migration)
print("ALL CONTEXT OS RUNTIME TESTS PASSED")
