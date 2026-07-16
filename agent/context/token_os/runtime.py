from __future__ import annotations

from dataclasses import dataclass
import hashlib
from typing import Any, Dict, List, Optional

from .budget_enforcer import BudgetEnforcer
from .token_estimator import estimate_messages_tokens, estimate_text_tokens, estimate_tool_schema_tokens
from .token_ledger import TokenLedger, get_token_ledger
from .token_models import TokenPlan
from .token_planner import TokenPlanner
from .token_policy import TokenPolicy
from .tool_skill_selector import select_tool_schemas


@dataclass
class TokenCallPreparation:
    policy: TokenPolicy
    plan: TokenPlan
    tools: List[Dict[str, Any]]
    tool_selection_reasons: List[str]
    used_input_tokens: int
    used_output_tokens: int
    blocked: bool
    block_reason: Optional[str]
    warnings: List[str]


def _content_text(message: Dict[str, Any]) -> str:
    content = message.get("content", "")
    if isinstance(content, str):
        return content
    return str(content or "")


def prepare_token_call(
    *,
    provider: str,
    model: str,
    messages: List[Dict[str, Any]],
    instruction: str,
    tools: Optional[List[Dict[str, Any]]] = None,
    profile_name: str = "agent_chat",
    session_id: Optional[str] = None,
    project_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    workflow_id: Optional[str] = None,
    node_id: Optional[str] = None,
    requested_output_tokens: Optional[int] = None,
    is_node_final: bool = False,
    artifact_text: str = "",
    pinned_text: str = "",
    retrieval_text: str = "",
    upstream_text: str = "",
    ledger: Optional[TokenLedger] = None,
) -> TokenCallPreparation:
    """Build and persist the mandatory pre-call TokenPlan.

    This function is deliberately provider-agnostic and is called immediately
    before request kwargs are constructed.  It is the enforcement boundary used
    by chat, delegate children and desktop workflow calls that enter the Hermes
    chat runtime.
    """
    ledger = ledger or get_token_ledger()
    policy_dict = ledger.get_active_policy(
        session_id=session_id,
        project_id=project_id,
        workspace_id=workspace_id,
        workflow_id=workflow_id,
    )
    policy = TokenPolicy.from_dict(policy_dict)

    all_tools = list(tools or [])
    selected_tools = all_tools
    selection_reasons: List[str] = []
    if all_tools and policy.tool_schema_policy != "full":
        selected_tools, selection_reasons = select_tool_schemas(
            all_tools,
            instruction=instruction,
            module=profile_name,
            max_budget_tokens=max(1024, int(estimate_messages_tokens(messages) * policy.tool_schema_budget_pct)),
        )

    summary = ledger.get_usage_summary(
        session_id=session_id,
        project_id=project_id,
        workflow_id=workflow_id,
    )
    used_input = int(summary.get("input_tokens", 0)) + int(summary.get("cached_input_tokens", 0))
    used_output = int(summary.get("output_tokens", 0))

    system_text = ""
    recent_messages = list(messages)
    if messages and messages[0].get("role") == "system":
        system_text = _content_text(messages[0])
        recent_messages = messages[1:]

    planner = TokenPlanner(policy)
    plan = planner.plan(
        provider=provider,
        model=model,
        profile_name=profile_name,
        session_id=session_id,
        project_id=project_id,
        workspace_id=workspace_id,
        system_text=system_text,
        task_root_text=instruction,
        pinned_text=pinned_text,
        artifact_text=artifact_text,
        recent_messages=recent_messages,
        retrieval_text=retrieval_text,
        upstream_text=upstream_text,
        tool_schemas=selected_tools,
        requested_output_tokens=requested_output_tokens,
        is_node_final=is_node_final,
        total_budget_used_input=used_input,
        total_budget_used_output=used_output,
        stable_prefix_parts=[system_text] if system_text else None,
        toolset_version=hashlib.sha256("\n".join(sorted(
            str((tool.get("function") or {}).get("name") or tool.get("name") or "")
            for tool in selected_tools
        )).encode("utf-8")).hexdigest()[:16],
    )

    enforced = BudgetEnforcer(policy, ledger).check_budget(
        plan,
        session_id=session_id,
        project_id=project_id,
        used_so_far_input=used_input,
        used_so_far_output=used_output,
        used_so_far_cost=float(summary.get("actual_cost_usd", 0.0) or summary.get("estimated_cost_usd", 0.0) or 0.0),
    )
    if enforced.get("blocked"):
        plan.blocked = True
        plan.block_reason = enforced.get("block_reason") or plan.block_reason
    warnings = list(dict.fromkeys([*plan.warnings, *enforced.get("warnings", [])]))
    plan.warnings = warnings

    plan_dict = plan.to_dict()
    plan_dict.update({
        "session_id": session_id,
        "project_id": project_id,
        "workspace_id": workspace_id,
        "policy_mode": policy.mode,
        "used": {
            "system": estimate_text_tokens(system_text),
            "task_root": estimate_text_tokens(instruction),
            "pinned": estimate_text_tokens(pinned_text),
            "active_artifact": estimate_text_tokens(artifact_text),
            "recent_messages": estimate_messages_tokens(recent_messages),
            "summary": 0,
            "retrieval": estimate_text_tokens(retrieval_text),
            "upstream": estimate_text_tokens(upstream_text),
        },
        "actions": [action.action for action in plan.actions],
    })
    ledger.record_context_build(plan_dict)
    ledger.emit_event(
        "token.plan",
        {
            "profile": profile_name,
            "provider": provider,
            "model": model,
            "estimated_input_tokens": plan.estimated_input_tokens,
            "estimated_output_tokens": plan.estimated_output_tokens,
            "blocked": plan.blocked,
            "tool_count_before": len(all_tools),
            "tool_count_after": len(selected_tools),
        },
        session_id=session_id,
        project_id=project_id,
        workflow_id=workflow_id,
        node_id=node_id,
        plan_id=plan.plan_id,
    )
    for warning in warnings:
        ledger.emit_event(
            "token.warning",
            {"message": warning},
            session_id=session_id,
            project_id=project_id,
            workflow_id=workflow_id,
            node_id=node_id,
            plan_id=plan.plan_id,
        )
    if plan.blocked:
        ledger.emit_event(
            "token.budget.blocked",
            {"reason": plan.block_reason or "Token budget exceeded"},
            session_id=session_id,
            project_id=project_id,
            workflow_id=workflow_id,
            node_id=node_id,
            plan_id=plan.plan_id,
        )

    return TokenCallPreparation(
        policy=policy,
        plan=plan,
        tools=selected_tools,
        tool_selection_reasons=selection_reasons,
        used_input_tokens=used_input,
        used_output_tokens=used_output,
        blocked=plan.blocked,
        block_reason=plan.block_reason,
        warnings=warnings,
    )
