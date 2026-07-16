import sqlite3

from agent.context.context_orchestrator import ContextOrchestrator
from agent.context.token_os import (
    BALANCED_POLICY,
    SAVING_POLICY,
    TokenLedger,
    TokenPlanner,
    TokenPolicy,
    get_context_window,
    prepare_token_call,
)


def tool(name: str):
    return {
        "type": "function",
        "function": {"name": name, "description": name, "parameters": {"type": "object"}},
    }


def memory_ledger() -> TokenLedger:
    return TokenLedger(sqlite3.connect(":memory:", check_same_thread=False))


def test_context_window_signature_and_policy_binding():
    assert get_context_window("claude-sonnet-4-6") == 200_000
    orchestrator = ContextOrchestrator.__new__(ContextOrchestrator)
    orchestrator.token_planner = TokenPlanner(BALANCED_POLICY)
    orchestrator.token_policy = BALANCED_POLICY
    hard = TokenPolicy(mode="saving", budget_mode="hard", total_token_budget=5000)
    orchestrator.set_token_policy(hard)
    assert orchestrator.token_policy is hard
    assert orchestrator.token_planner.policy is hard


def test_mandatory_preflight_filters_tools_and_persists_plan_events():
    ledger = memory_ledger()
    ledger.save_policy("session", "s1", SAVING_POLICY.to_dict())
    all_tools = [
        tool("read_file"), tool("write_file"), tool("tool_search"), tool("clarify"),
        tool("web_search"), tool("browser_navigate"), tool("docker_build"), tool("aws_deploy"),
    ]
    result = prepare_token_call(
        provider="anthropic",
        model="claude-sonnet-4-6",
        messages=[
            {"role": "system", "content": "Stable Karna rules"},
            {"role": "user", "content": "Read this chapter and revise it"},
        ],
        instruction="Read this chapter and revise it",
        tools=all_tools,
        profile_name="writer_ide",
        session_id="s1",
        project_id="p1",
        ledger=ledger,
    )
    assert result.policy.mode == "saving"
    assert result.policy.tool_schema_budget_pct == 0.07
    assert len(result.tools) < len(all_tools)
    assert result.plan.plan_id
    assert ledger.conn.execute("SELECT COUNT(*) FROM context_build_events").fetchone()[0] == 1
    events = ledger.get_events(session_id="s1")
    assert any(event["event_type"] == "token.plan" for event in events)


def test_hard_budget_blocks_before_call_and_emits_event():
    ledger = memory_ledger()
    policy = TokenPolicy(budget_mode="hard", total_token_budget=5000)
    ledger.save_policy("session", "hard-session", policy.to_dict())
    ledger.record_usage(
        session_id="hard-session", provider="test", model="test",
        input_tokens=4500, output_tokens=400,
    )
    result = prepare_token_call(
        provider="anthropic",
        model="claude-sonnet-4-6",
        messages=[{"role": "user", "content": "Write the final chapter"}],
        instruction="Write the final chapter",
        session_id="hard-session",
        requested_output_tokens=4096,
        ledger=ledger,
    )
    assert result.blocked is True
    assert "budget" in (result.block_reason or "").lower()
    events = ledger.get_events(session_id="hard-session")
    assert any(event["event_type"] == "token.budget.blocked" for event in events)


def test_unknown_price_is_not_invented_and_user_override_is_used():
    unknown = TokenPlanner(TokenPolicy()).plan(
        provider="custom", model="unknown-private-model", task_root_text="hello"
    )
    assert unknown.estimated_cost is None
    override = TokenPlanner(TokenPolicy(
        input_price_per_million=2.0,
        output_price_per_million=8.0,
        price_source="user",
        price_version="manual-v1",
    )).plan(
        provider="custom", model="unknown-private-model", task_root_text="hello",
        requested_output_tokens=1000,
    )
    expected = (
        override.estimated_input_tokens * 2.0
        + override.estimated_output_tokens * 8.0
    ) / 1_000_000
    assert override.estimated_cost == expected


if __name__ == "__main__":
    tests = [
        test_context_window_signature_and_policy_binding,
        test_mandatory_preflight_filters_tools_and_persists_plan_events,
        test_hard_budget_blocks_before_call_and_emits_event,
        test_unknown_price_is_not_invented_and_user_override_is_used,
    ]
    for test in tests:
        test()
        print(f"[PASS] {test.__name__}")
    print("ALL TOKEN OS RUNTIME TESTS PASSED")
