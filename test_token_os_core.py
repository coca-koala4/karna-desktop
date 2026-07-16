import sys
sys.path.insert(0, '.')
from agent.context.token_os import (
    TokenPolicy, TokenPlanner, TokenLedger,
    estimate_text_tokens, dedupe_messages, select_tool_schemas,
    BudgetEnforcer, WorkflowTokenPlanner, DirectArtifactWriter,
    apply_provider_cache, SAVING_POLICY, QUALITY_POLICY,
    should_stop_critic_loop,
)
import sqlite3

print("=== Test 1: Basic Token Planning ===")
plan = TokenPlanner(TokenPolicy()).plan(
    provider='anthropic', model='claude-sonnet-4-6',
    system_text='You are Karna, an AI assistant.' * 20,
    task_root_text='Write a short story about a robot.',
    pinned_text='Style: concise, no adverbs.',
    artifact_text='Once upon a time in a digital world, ' * 200,
    recent_messages=[
        {'role':'user','content':'Hello'},
        {'role':'assistant','content':'Hi! How can I help?'},
        {'role':'user','content':'Write a story'},
    ],
    summary_text='Previous conversation summary.',
    retrieval_text='Some RAG results about robots.',
)
print(f"  context_window={plan.context_window}, max_input={plan.max_input_tokens}")
print(f"  est_input={plan.estimated_input_tokens}, est_output={plan.estimated_output_tokens}")
print(f"  warnings={plan.warnings}")
print(f"  actions={[a.action for a in plan.actions]}")
assert plan.context_window == 200000
assert plan.max_input_tokens > 0
print("  PASS")

print("=== Test 2: Ledger Recording ===")
conn = sqlite3.connect(':memory:', check_same_thread=False)
ledger = TokenLedger(conn)
eid = ledger.record_usage(
    provider='anthropic', model='claude-sonnet-4-6',
    session_id='test-session-1',
    input_tokens=1000, cached_input_tokens=500,
    output_tokens=400, reasoning_tokens=100,
    estimated_cost=0.005, usage_source='provider',
    cache_hit=True,
)
s = ledger.get_usage_summary(session_id='test-session-1')
assert s['calls'] == 1
assert s['input_tokens'] == 1000
assert s['cached_input_tokens'] == 500
assert s['output_tokens'] == 400
print(f"  calls={s['calls']}, cached={s['cached_input_tokens']}, output={s['output_tokens']}")
print("  PASS")

print("=== Test 3: Saving Mode Plan ===")
plan_saving = TokenPlanner(SAVING_POLICY).plan(
    provider='anthropic', model='claude-sonnet-4-6',
    artifact_text='Very long text ' * 2000,
)
print(f"  saving tool_schema_budget={SAVING_POLICY.tool_schema_budget_pct}, max_critic={SAVING_POLICY.max_critic_rounds}")
assert plan_saving.estimated_input_tokens <= plan_saving.max_input_tokens
assert SAVING_POLICY.tool_schema_budget_pct < QUALITY_POLICY.tool_schema_budget_pct
assert SAVING_POLICY.max_critic_rounds < QUALITY_POLICY.max_critic_rounds
print("  PASS")

print("=== Test 4: Budget Enforcer Advisory ===")
enforcer = BudgetEnforcer(TokenPolicy(total_token_budget=10000, budget_mode='advisory'))
plan_b = TokenPlanner(TokenPolicy()).plan(
    provider='anthropic', model='claude-sonnet-4-6',
    artifact_text='text ' * 3000,
)
result = enforcer.check_budget(plan_b, used_so_far_input=8000, used_so_far_output=2000)
print(f"  blocked={result['blocked']}, warnings={len(result['warnings'])}, thresholds={[t['label'] for t in result['triggered_thresholds']]}")
assert result['blocked'] is False
assert result['warnings'], "Advisory mode must warn when projected usage exceeds the budget"
assert result['triggered_thresholds'], "Budget thresholds must be observable"
print("  PASS")

print("=== Test 5: Hard Budget Blocks ===")
hard_policy = TokenPolicy(total_token_budget=5000, budget_mode='hard')
enforcer_hard = BudgetEnforcer(hard_policy)
plan_h = TokenPlanner(hard_policy).plan(
    provider='anthropic', model='claude-sonnet-4-6',
    artifact_text='text ' * 3000,
)
result_h = enforcer_hard.check_budget(plan_h, used_so_far_input=4500, used_so_far_output=800)
print(f"  hard blocked={result_h['blocked']}, reason={result_h.get('block_reason')}")
assert result_h['blocked'] == True
print("  PASS")

print("=== Test 6: Deduplication ===")
msgs = [
    {'role':'user','content':'Hello'},
    {'role':'assistant','content':'Hi'},
    {'role':'user','content':'Hello'},
    {'role':'assistant','content':'Error: xyz\nTraceback...'},
    {'role':'assistant','content':'Error: xyz\nTraceback...'},
    {'role':'assistant','content':'Let me try again.'},
]
deduped = dedupe_messages(msgs)
print(f"  original={len(msgs)}, deduped={len(deduped)}")
assert len(deduped) <= len(msgs)
print("  PASS")

print("=== Test 7: Tool Schema Selection ===")
fake_tools = []
tool_names = ["read_file","write_file","list_dir","search_files","glob","run_terminal_cmd",
              "web_search","web_fetch","browser_navigate","delegate_task","clarify","tool_search",
              "memory_add","pin_context","todo_write","mcp_call","mcp_list","invoke_skill",
              "deploy_app","video_edit","docker_build","aws_deploy","cloudformation_apply","kubernetes_apply",
              "slack_send","discord_message","notion_create","youtube_upload","tts_synth","image_gen"]
for name in tool_names:
    fake_tools.append({"type":"function","function":{"name":name,"description":f"Tool {name}","parameters":{}}})
selected, reasons = select_tool_schemas(fake_tools, instruction="read a file and search the web", module="writer_ide")
print(f"  writer_ide: selected {len(selected)}/{len(fake_tools)} tools")
assert len(selected) < len(fake_tools), f"Expected fewer tools, got {len(selected)}"
selected2, reasons2 = select_tool_schemas(fake_tools, instruction="search the web for research papers", module="research")
print(f"  research: selected {len(selected2)}/{len(fake_tools)} tools")
print("  PASS")

print("=== Test 8: Workflow Planner ===")
wfp = WorkflowTokenPlanner(TokenPolicy())
wf_plan = wfp.plan_workflow(
    workflow_id='wf-test-1',
    nodes=[
        {"id":"n1","name":"Research","type":"research"},
        {"id":"n2","name":"Draft","type":"write"},
        {"id":"n3","name":"Review","type":"critic_review"},
        {"id":"n4","name":"Final","type":"final_compile","is_final":True},
    ],
    model='claude-sonnet-4-6', provider='anthropic',
)
print(f"  workflow: calls={wf_plan.estimated_calls}, nodes={len(wf_plan.node_plans)}, reusable={wf_plan.reusable_nodes}")
assert wf_plan.estimated_calls > 0
assert len(wf_plan.node_plans) == 4
assert should_stop_critic_loop([0.70, 0.72], threshold=0.05, max_rounds=3) is True
assert should_stop_critic_loop([0.60, 0.75], threshold=0.05, max_rounds=3) is False
print("  PASS")

print("=== Test 9: Policy Persistence ===")
ledger.save_policy("global", None, {"mode":"saving","budget_mode":"hard","total_token_budget":50000})
p = ledger.get_active_policy()
assert p.get("mode") == "saving"
assert p.get("budget_mode") == "hard"
print(f"  policy mode={p.get('mode')}, budget_mode={p.get('budget_mode')}")
print("  PASS")

print("=== Test 10: Direct Artifact Writer ===")
import tempfile, os
with tempfile.TemporaryDirectory() as tmpdir:
    writer = DirectArtifactWriter(base_dir=tmpdir)
    session = writer.start_segmented_write(os.path.join(tmpdir, "out.md"), target_tokens=5000)
    session = writer.append_segment(session, "# Chapter 1\n\nIt was a dark night.")
    session = writer.append_segment(session, "\n\nThe wind howled through the trees.")
    session = writer.finalize(session)
    assert session["segments_written"] == 2
    assert os.path.exists(os.path.join(tmpdir, "out.md"))
    assert not os.path.exists(session["tmp_path"])
    with open(os.path.join(tmpdir, "out.md"), encoding="utf-8") as fh:
        final_text = fh.read()
    assert "Chapter 1" in final_text and "wind howled" in final_text
    print(f"  segments={session['segments_written']}, completed_tokens={session['completed_tokens']}")
print("  PASS")

print("\n=== ALL TESTS PASSED ===")
