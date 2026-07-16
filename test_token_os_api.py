import os
import shutil
import tempfile


TEMP_DIR = tempfile.mkdtemp(prefix="karna_token_os_api_")
os.environ["KARNA_CONTEXT_DIR"] = TEMP_DIR

from fastapi.testclient import TestClient

from agent.context.api.context_memory_api import create_context_memory_app


def main():
    client = TestClient(create_context_memory_app())

    saved = client.put("/token-policy", json={
        "scope": "project",
        "scope_id": "project-api-test",
        "mode": "saving",
        "budget_mode": "advisory",
    })
    assert saved.status_code == 200, saved.text
    saved_policy = saved.json()["policy"]
    assert saved_policy["mode"] == "saving"
    assert saved_policy["skill_max_inject"] == 2
    assert saved_policy["tool_schema_budget_pct"] == 0.07
    assert saved_policy["max_parallel_nodes"] == 2

    loaded = client.get("/token-policy", params={"project_id": "project-api-test"})
    assert loaded.status_code == 200, loaded.text
    assert loaded.json()["policy"]["mode"] == "saving"

    usage = client.post("/token-usage", json={
        "provider": "test",
        "model": "test-model",
        "session_id": "session-api-test",
        "project_id": "project-api-test",
        "input_tokens": 123,
        "output_tokens": 45,
        "usage_source": "provider",
    })
    assert usage.status_code == 200, usage.text

    events = client.get("/token-events", params={"session_id": "session-api-test"})
    assert events.status_code == 200, events.text
    assert any(event["event_type"] == "token.usage" for event in events.json()["events"])

    hard = client.put("/token-policy", json={
        "scope": "workflow",
        "scope_id": "workflow-api-test",
        "mode": "balanced",
        "budget_mode": "hard",
        "total_token_budget": 1000,
    })
    assert hard.status_code == 200, hard.text
    workflow = client.post("/workflows/workflow-api-test/token-plan", json={
        "workflow_id": "workflow-api-test",
        "project_id": "project-api-test",
        "provider": "custom",
        "model": "unknown-model",
        "nodes": [
            {"id": "research", "type": "research"},
            {"id": "final", "type": "final_compile", "is_final": True},
        ],
    })
    assert workflow.status_code == 200, workflow.text
    assert workflow.json()["blocked"] is True

    print("[PASS] saving preset API applies real preset fields")
    print("[PASS] usage and token event APIs persist real records")
    print("[PASS] workflow preflight enforces scoped hard budget")
    print("ALL TOKEN OS API TESTS PASSED")


if __name__ == "__main__":
    try:
        main()
    finally:
        shutil.rmtree(TEMP_DIR, ignore_errors=True)
