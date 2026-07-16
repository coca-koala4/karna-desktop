"""
End-to-end test for Karna Context OS.
Validates all major components work together.
"""
import os
import sys
import tempfile
import json

_tmp_dir = tempfile.mkdtemp(prefix="karna_context_test_")
os.environ["KARNA_CONTEXT_DIR"] = _tmp_dir
os.environ["HERMES_DESKTOP"] = "1"

print(f"=== KARNA_CONTEXT_DIR = {_tmp_dir}")
print()

errors = []

def check(name, fn):
    try:
        fn()
        print(f"  [PASS] {name}")
    except Exception as e:
        import traceback
        errors.append((name, str(e)))
        print(f"  [FAIL] {name}: {e}")
        traceback.print_exc()

# ============================================================
# 1. Import all context modules
# ============================================================
print("--- 1. Module Imports ---")

def test_imports():
    import agent.context
    from agent.context import (
        ContextOrchestrator,
        ProjectMemoryService,
        PinnedContextService,
        DecisionLogService,
        NodeRunSummaryService,
        ToolOutputStore,
        ContextEnvelope,
        set_current_envelope,
        get_current_envelope,
        get_orchestrator,
        inject_context_os,
        validate_coverage,
        CoverageReport,
        ExtractedContextItem,
        MemoryRetriever,
    )
    from agent.context.compressor import (
        CompressionProfile,
        DEFAULT_PROFILES,
        get_profile,
        resolve_compression_profile,
    )
    from agent.context.rebuild import (
        ContextRebuilder,
        ContextBuildRequest,
        BuiltContext,
    )
    from agent.context.security import redact_text
    from agent.context.api.context_memory_api import create_context_memory_app

check("import all context modules", test_imports)

# ============================================================
# 2. Data models: ContextEnvelope
# ============================================================
print("\n--- 2. ContextEnvelope ---")

def test_envelope():
    from agent.context import ContextEnvelope, set_current_envelope, get_current_envelope
    env = ContextEnvelope(
        workspace_id="ws_test",
        module="agent_chat",
        writing_domain="fiction",
        runtime_profile="longform_writing",
        active_artifact_path="/work/story.md",
    )
    assert env.version == 1
    assert env.enabled is True
    assert env.writing_domain == "fiction"
    prof = env.get_effective_profile()
    assert prof == "longform_writing", f"Expected longform_writing, got {prof}"
    d = env.to_dict()
    assert d["writing_domain"] == "fiction"
    env2 = ContextEnvelope.from_dict({"writingDomain": "academic", "workspaceId": "ws2"})
    assert env2.writing_domain == "academic"
    assert env2.workspace_id == "ws2"
    set_current_envelope(env)
    got = get_current_envelope()
    assert got is not None
    assert got.writing_domain == "fiction"

check("ContextEnvelope creation/serialization/roundtrip", test_envelope)

# ============================================================
# 3. Compression profiles
# ============================================================
print("\n--- 3. Compression Profiles ---")

def test_profiles():
    from agent.context.compressor import DEFAULT_PROFILES, resolve_compression_profile, get_profile
    assert "agent_chat" in DEFAULT_PROFILES
    assert "longform_writing" in DEFAULT_PROFILES
    assert "edit_review" in DEFAULT_PROFILES
    assert "translation" in DEFAULT_PROFILES
    p_fiction = resolve_compression_profile(writing_domain="fiction")
    assert p_fiction == "longform_writing", f"fiction -> {p_fiction}"
    p_academic = resolve_compression_profile(writing_domain="academic")
    assert p_academic == "academic"
    p_journal = resolve_compression_profile(writing_domain="journalism")
    assert p_journal == "edit_review", f"journalism -> {p_journal}"
    p_trans = resolve_compression_profile(writing_domain="translation")
    assert p_trans == "translation"
    p = get_profile("longform_writing")
    assert p.protect_last_n >= 20
    p_edit = get_profile("edit_review")
    assert p_edit.protect_last_n >= 10
    p_trans = get_profile("translation")
    assert p_trans.protect_last_n >= 5

check("compression profiles and domain mapping", test_profiles)

# ============================================================
# 4. Memory storage
# ============================================================
print("\n--- 4. Memory Storage ---")

def test_memory_storage():
    from agent.context import ProjectMemoryService, PinnedContextService, DecisionLogService, ExtractedContextItem
    ms = ProjectMemoryService()
    item = ExtractedContextItem(
        type="goal",
        content="User prefers dark mode for all interfaces",
        scope="workspace",
        workspace_id="ws_test",
        priority="normal",
        source_kind="user_instruction",
        status="active",
        authority="user_confirmed",
    )
    mem_id = ms.add_memory(item)
    assert mem_id is not None
    mems = ms.get_active_memories(workspace_id="ws_test", status=None)
    assert len(mems) >= 1
    # Confirm memory
    ms.confirm_memory(mem_id, confirmed_by="test_user")
    # Pin
    ps = PinnedContextService()
    pin_id = ps.pin(
        content="IMPORTANT: Must follow the existing code style exactly.",
        scope="task",
        workspace_id="ws_test",
        pin_reason="explicit user instruction",
        created_by="test",
    )
    assert pin_id is not None
    pins = ps.get_active_pins(workspace_id="ws_test")
    assert len(pins) >= 1
    # Decision
    ds = DecisionLogService()
    dec_id = ds.add_decision(
        decision="Use SQLite for all context storage",
        reason="Simple, no external dependencies, fast enough for single-user",
        workspace_id="ws_test",
    )
    assert dec_id is not None
    decs = ds.get_decisions(workspace_id="ws_test")
    assert len(decs) >= 1
    # Delete decision
    assert ds.delete_decision(dec_id)

check("memory/pin/decision CRUD", test_memory_storage)

# ============================================================
# 5. Tool output externalization
# ============================================================
print("\n--- 5. Tool Output Externalization ---")

def test_tool_output():
    from agent.context import ToolOutputStore
    ts = ToolOutputStore()
    large_content = "A" * 5000
    rec = ts.externalize(
        tool_name="read_file",
        tool_args='{"file_path": "test.txt"}',
        content=large_content,
        session_id="sess_1",
        source_kind="file_read",
    )
    assert rec is not None
    handle = rec.to_handle()
    assert "toolout_" in handle or rec.id
    assert rec.char_count == 5000
    got = ts.get(rec.id)
    assert got is not None
    batch = ts.get_by_refs([rec.id])
    assert len(batch) == 1

check("tool output externalization", test_tool_output)

# ============================================================
# 6. Node run summaries
# ============================================================
print("\n--- 6. Node Run Summaries ---")

def test_node_summaries():
    from agent.context import NodeRunSummaryService
    ns = NodeRunSummaryService()
    nid = ns.add_node_summary(
        flow_run_id="flow_1",
        node_id="node_1",
        agent_id="researcher",
        task="Research Python best practices",
        input_summary="Find modern Python style guides",
        output_summary="Found PEP8, Google style guide, and Black formatter",
        key_findings=["PEP8 is baseline", "Black is formatter of choice", "Type hints recommended"],
        decisions=["Use Black for formatting"],
        file_refs=["README.md"],
    )
    assert nid is not None
    timeline = ns.get_flow_timeline("flow_1")
    assert len(timeline) >= 1
    results = ns.search_node_summaries("Python")
    assert len(results) >= 1
    one = ns.get_node_summary("node_1")
    assert one is not None

check("node run summaries", test_node_summaries)

# ============================================================
# 7. Secret redaction
# ============================================================
print("\n--- 7. Secret Redaction ---")

def test_redaction():
    from agent.context.security import redact_text
    sample = "My API key is sk-abcdefghijklmnopqrstuvwxyz1234567890 and password=hunter2secret"
    redacted = redact_text(sample)
    assert "[REDACTED]" in redacted
    assert "sk-abcdefghijklmnopqrstuvwxyz1234567890" not in redacted

check("secret redaction", test_redaction)

# ============================================================
# 8. Expected Coverage validation
# ============================================================
print("\n--- 8. Expected Coverage ---")

def test_coverage():
    from agent.context import validate_coverage
    orig = [
        {"role": "user", "content": "We decided to use Python 3.11 for this project. The build system is Bazel. File path is src/main.py"},
        {"role": "assistant", "content": "OK I'll use Python 3.11. IMPORTANT: Do not break the existing API at /api/v1/users"},
    ]
    summary = "The project uses Python 3.11 with Bazel build system. Key constraint: must preserve /api/v1/users API."
    preserved = [orig[0]]
    report = validate_coverage(orig, summary, preserved, threshold=0.5)
    assert report.preserved_count + report.missed_count > 0
    bad_report = validate_coverage(orig, "", preserved, threshold=0.9)
    assert bad_report.meets_threshold is False

check("expected coverage validation", test_coverage)

# ============================================================
# 9. Context Rebuilder
# ============================================================
print("\n--- 9. Context Rebuilder ---")

def test_rebuilder():
    from agent.context import (
        ProjectMemoryService, PinnedContextService,
        ExtractedContextItem, MemoryRetriever,
    )
    from agent.context.rebuild import ContextRebuilder, ContextBuildRequest
    ms = ProjectMemoryService()
    item = ExtractedContextItem(
        type="goal",
        content="Python 3.11 is required",
        scope="workspace",
        workspace_id="ws_test",
        source_kind="user_instruction",
        status="active",
    )
    ms.add_memory(item)
    ps = PinnedContextService()
    ps.pin(content="Follow PEP8 strictly", workspace_id="ws_test", scope="workspace")
    retriever = MemoryRetriever(ms)
    rebuilder = ContextRebuilder(ms, ps, retriever=retriever)
    req = ContextBuildRequest(
        session_id="sess_reb_test",
        user_message="How do I set up the project?",
        workspace_id="ws_test",
        mode="agent_chat",
        writing_domain="technical_writing",
    )
    built = rebuilder.build(req)
    assert built is not None
    text = built.to_context_text()
    assert len(text) > 0
    assert built.writing_domain == "technical_writing"

check("context rebuilder builds context with memories/pins/decisions", test_rebuilder)

# ============================================================
# 10. Context Orchestrator
# ============================================================
print("\n--- 10. Context Orchestrator ---")

def test_orchestrator():
    from agent.context import ContextOrchestrator, ContextEnvelope
    from pathlib import Path
    orch = ContextOrchestrator(workspace_root=Path(_tmp_dir))
    env = ContextEnvelope(workspace_id="ws_test", writing_domain="fiction", module="writer_ide")
    orch.set_envelope(env)
    assert orch.envelope is not None
    assert orch.envelope.writing_domain == "fiction"
    prof = orch.envelope.get_effective_profile()
    assert prof == "longform_writing"

check("context orchestrator envelope management", test_orchestrator)

# ============================================================
# 11. Context injection into messages
# ============================================================
print("\n--- 11. Context Injection ---")

def test_injection():
    from pathlib import Path
    from agent.context import (
        ContextOrchestrator, ContextEnvelope, inject_context_os,
        ProjectMemoryService, PinnedContextService, ExtractedContextItem,
        set_current_envelope,
    )
    orch = ContextOrchestrator(workspace_root=Path(_tmp_dir))
    ms = ProjectMemoryService()
    item = ExtractedContextItem(
        type="goal",
        content="Project uses SQLite database",
        scope="workspace",
        workspace_id="ws_inj",
        source_kind="user_instruction",
        status="active",
    )
    ms.add_memory(item)
    ps = PinnedContextService()
    ps.pin(content="Always use transactions", workspace_id="ws_inj", scope="workspace")
    env = ContextEnvelope(workspace_id="ws_inj", writing_domain="general")
    set_current_envelope(env)
    messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello"},
        {"role": "assistant", "content": "Hi there!"},
        {"role": "user", "content": "How do I query the database?"},
    ]
    result = inject_context_os(
        messages,
        user_message="How do I query the database?",
        workspace_id="ws_inj",
        orchestrator=orch,
    )
    assert len(result) >= len(messages)
    assert any("[Karna Context OS" in str(m.get("content", "")) for m in result)

check("context injection into messages", test_injection)

# ============================================================
# 12. Context Compressor with Context OS
# ============================================================
print("\n--- 12. Context Compressor (Context OS) ---")

def test_compressor():
    from agent.context_compressor import ContextCompressor
    comp = ContextCompressor(model="gpt-4o-mini")
    comp.enable_context_os(default_profile="agent_chat")
    assert comp._context_os_enabled is True
    assert comp.get_context_orchestrator() is not None

check("context compressor enables Context OS", test_compressor)

# ============================================================
# 13. API endpoints
# ============================================================
print("\n--- 13. API Endpoints ---")

def test_api():
    from fastapi.testclient import TestClient
    from agent.context.api.context_memory_api import create_context_memory_app
    app = create_context_memory_app()
    client = TestClient(app)
    r = client.get("/stats")
    assert r.status_code == 200
    r = client.get("/profiles")
    assert r.status_code == 200
    data = r.json()
    assert "profiles" in data
    assert "agent_chat" in data["profiles"]
    r = client.get("/memories?limit=5")
    assert r.status_code == 200
    assert "memories" in r.json()
    r = client.post("/memories", json={"type": "goal", "content": "API test memory", "scope": "workspace"})
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    r = client.get("/pins?limit=5")
    assert r.status_code == 200
    r = client.post("/pins", json={"content": "API test pin", "scope": "workspace"})
    assert r.status_code == 200
    r = client.get("/decisions?limit=5")
    assert r.status_code == 200
    r = client.post("/decisions", json={"decision": "API test decision"})
    assert r.status_code == 200
    dec_id = r.json()["id"]
    r = client.get("/snapshot")
    assert r.status_code == 200
    snap = r.json()
    assert "envelope" in snap
    assert "counts" in snap
    r = client.post("/envelope", json={"writing_domain": "fiction", "workspace_id": "ws_api"})
    assert r.status_code == 200
    r = client.get("/envelope")
    assert r.status_code == 200
    r = client.post("/prompt-preview", json={"query": "test query", "mode": "agent_chat"})
    assert r.status_code == 200, r.text
    prev = r.json()
    assert "context_text" in prev
    assert "estimated_tokens" in prev
    r = client.get("/tool-outputs?limit=5")
    assert r.status_code == 200
    r = client.get("/compression-events?limit=5")
    assert r.status_code == 200
    r = client.get("/node-summaries?limit=5")
    assert r.status_code == 200
    r = client.delete(f"/decisions/{dec_id}")
    assert r.status_code == 200
    msgs = []
    for i in range(30):
        msgs.append({"role": "user", "content": f"Message {i}: " + ("hello world " * 15)})
        msgs.append({"role": "assistant", "content": f"Reply {i}: " + ("hi there " * 15)})
    r = client.post("/compact", json={"messages": msgs, "force": False})
    assert r.status_code == 200, r.text
    comp = r.json()
    assert "messages" in comp
    assert "before_count" in comp

check("all API endpoints respond correctly", test_api)

# ============================================================
# 14. Tool output auto-scan in orchestrator
# ============================================================
print("\n--- 14. Tool Output Auto-Scan ---")

def test_scan_externalize():
    from pathlib import Path
    from agent.context import ContextOrchestrator
    orch = ContextOrchestrator(workspace_root=Path(_tmp_dir))
    messages = [
        {"role": "user", "content": "Read the file"},
        {"role": "assistant", "content": "Let me read that."},
        {"role": "tool", "name": "read_file", "content": "X" * 5000},
        {"role": "assistant", "content": "File contents reviewed."},
    ]
    count = orch.scan_and_externalize_tool_outputs(messages, session_id="sess_scan")
    assert count == 1, f"Expected 1 externalized, got {count}"
    assert "toolout_" in messages[2]["content"] or "[Tool output externalized:" in messages[2]["content"], f"Got: {messages[2]['content'][:100]}"

check("auto-scan externalizes large tool outputs", test_scan_externalize)

# ============================================================
# Summary
# ============================================================
print("\n" + "=" * 60)
if errors:
    print(f"FAILED: {len(errors)} errors:")
    for name, err in errors:
        print(f"  - {name}: {err}")
    sys.exit(1)
else:
    print("ALL TESTS PASSED!")
    print(f"\nTemporary context dir: {_tmp_dir}")
    print("Context OS end-to-end validation complete.")
