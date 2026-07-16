import os
import tempfile
os.environ['KARNA_CONTEXT_DIR'] = tempfile.mkdtemp(prefix='karna_final_test_')
os.environ['HERMES_DESKTOP'] = '1'

from agent.context import (
    ContextOrchestrator, get_orchestrator,
    ProjectMemoryService, PinnedContextService, DecisionLogService, NodeRunSummaryService,
    MemoryRetriever, ContextRebuilder, ContextBuildRequest, BuiltContext,
    ContextBudgeter, ToolOutputStore, CompressionProfile,
    redact_text, redact_dict, is_safe_to_store,
)
from agent.context.compressor.compression_profiles import (
    get_profile, resolve_compression_profile, DEFAULT_PROFILES
)

print('=== 1. COMPRESSION PROFILES ===')
print('Total profiles:', len(DEFAULT_PROFILES))
assert len(DEFAULT_PROFILES) == 11, 'Expected 11 profiles'
for name, p in DEFAULT_PROFILES.items():
    print(f'  {name}: threshold={p.threshold}, target={p.target_ratio}, protect_last_n={p.protect_last_n}')

print()
print('=== 2. WRITING DOMAIN MAPPING ===')
domains = ['fiction', 'screenplay', 'poetry', 'academic', 'technical_writing', 'legal_policy', 'journalism', 'translation', 'marketing_brand']
for d in domains:
    profile = resolve_compression_profile(writing_domain=d)
    print(f'  {d} -> {profile}')

print()
print('=== 3. SECRET REDACTOR ===')
test_text = 'api_key=sk-abc123def456ghi789 password=mysecret123 token=tok_jkl012mno345'
redacted = redact_text(test_text)
assert '[REDACTED]' in redacted
print('  Redaction works:', '[REDACTED]' in redacted)

print()
print('=== 4. TOOL OUTPUT EXTERNALIZATION ===')
orch = ContextOrchestrator(default_profile='agent_chat')
msgs = [
    {'role': 'user', 'content': 'Search for files'},
    {'role': 'tool', 'name': 'search_files', 'content': 'X' * 6000},
    {'role': 'user', 'content': 'Thanks'},
]
count = orch.scan_and_externalize_tool_outputs(msgs, session_id='final-test')
assert count == 1
assert 'externalized' in msgs[1]['content']
assert len(msgs[1]['content']) < 500
print(f'  Externalized {count} tool output(s)')
print('  Placeholder starts with:', msgs[1]['content'][:80])

print()
print('=== 5. NODE SUMMARY SERVICE ===')
ns = NodeRunSummaryService()
sid = ns.add_node_summary(
    flow_run_id='flow-1', node_id='node-1', agent_id='researcher',
    task='Find context code', output_summary='Found context module in agent/context/',
    key_findings=['Context OS is implemented', '11 profiles exist'],
    file_refs=['agent/context/__init__.py'], token_usage=2000
)
summaries = ns.get_flow_summaries('flow-1')
assert len(summaries) == 1
print(f'  Created node summary: {sid}')
print(f'  Retrieved {len(summaries)} summaries for flow-1')

print()
print('=== 6. CONTEXT REBUILDER WITH RETRIEVER+BUDGETER ===')
req = ContextBuildRequest(session_id='test', mode='multi_agent_flow', user_message='context compression')
result = orch.context_rebuilder.build(req)
assert result.relevant_memories is not None
assert result.pinned_contexts is not None
ctx_text = result.to_context_text()
print(f'  Context text length: {len(ctx_text)} chars')
print(f'  Context blocks: {len(result.context_blocks)}')

print()
print('=== 7. API CREATION ===')
from agent.context.api.context_memory_api import create_context_memory_app
app = create_context_memory_app()
routes = [r.path for r in app.routes if hasattr(r, 'path') and not str(r.path).startswith('/docs') and not str(r.path).startswith('/openapi') and not str(r.path).startswith('/redoc')]
expected = ['/memories', '/pins', '/decisions', '/node-summaries', '/tool-outputs', '/profiles', '/summary', '/stats']
for e in expected:
    assert any(e in str(r) for r in routes), f'Missing route: {e}'
print('  API routes count:', len([r for r in routes if r]))
print('  All expected routes present!')

print()
print('=== 8. MEMORY STORAGE WITH REDACTION ===')
ms = ProjectMemoryService()
from agent.context.extraction import ExtractedContextItem
item = ExtractedContextItem(
    type='constraint', scope='workspace', priority='critical',
    content='Never expose api_key=sk-abc123def456ghi789 in output',
    workspace_id='test-ws'
)
mid = ms.add_memory(item)
retrieved = ms.get_candidates(workspace_id='test-ws', limit=1)
assert len(retrieved) == 1
assert '[REDACTED]' in retrieved[0]['content']
print(f'  Memory stored with auto-redaction: {mid}')
print('  Safe content check: [REDACTED] present =', '[REDACTED]' in retrieved[0]['content'])

print()
print('=== ALL TESTS PASSED ===')
