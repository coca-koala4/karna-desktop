from __future__ import annotations

import uuid
import logging
from typing import Any, Dict, List, Optional, Tuple

from .token_policy import TokenPolicy, DEFAULT_BUDGET_RATIOS, OUTPUT_RESERVATION, DEFAULT_TOKEN_POLICY
from .token_models import TokenPlan, TokenPlanAction, BudgetItem, compute_cache_key, compute_stable_prefix_hash
from .token_estimator import estimate_text_tokens, estimate_json_tokens, estimate_messages_tokens, estimate_tool_schema_tokens

logger = logging.getLogger(__name__)

def get_context_window(model: str) -> int:
    model_lower = (model or "").lower()
    if any(k in model_lower for k in ("claude-opus-4", "claude-sonnet-4", "claude-4")):
        return 200000
    if any(k in model_lower for k in ("claude-3-5", "claude-3-7", "claude-3.5", "claude-3.7")):
        return 200000
    if "claude-3-haiku" in model_lower:
        return 200000
    if any(k in model_lower for k in ("gpt-4o", "gpt-4.1", "o3", "o4")):
        return 128000
    if "gpt-4.1-mini" in model_lower or "gpt-4.1-nano" in model_lower:
        return 128000
    if "deepseek" in model_lower:
        return 128000
    if "gemini-2.5" in model_lower:
        return 1000000
    if "gemini-2.0" in model_lower or "gemini-1.5" in model_lower:
        return 1000000
    return 128000


def get_reserved_output(profile_name: str, requested_output: Optional[int] = None, is_node_final: bool = False) -> int:
    if requested_output and requested_output > 0:
        return requested_output
    if is_node_final:
        return OUTPUT_RESERVATION.get("node_final", 8192)
    return OUTPUT_RESERVATION.get(profile_name, 4096)


class TokenPlanner:
    def __init__(self, policy: Optional[TokenPolicy] = None):
        self.policy = policy or DEFAULT_TOKEN_POLICY

    def plan(
        self,
        *,
        provider: str = "",
        model: str = "",
        profile_name: str = "agent_chat",
        session_id: Optional[str] = None,
        project_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        system_text: str = "",
        task_root_text: str = "",
        pinned_text: str = "",
        artifact_text: str = "",
        recent_messages: Optional[List[Dict[str, Any]]] = None,
        summary_text: str = "",
        retrieval_text: str = "",
        upstream_text: str = "",
        tool_schemas: Optional[List[Dict[str, Any]]] = None,
        tool_names_filter: Optional[List[str]] = None,
        requested_output_tokens: Optional[int] = None,
        is_node_final: bool = False,
        total_budget_used_input: int = 0,
        total_budget_used_output: int = 0,
        stable_prefix_parts: Optional[List[str]] = None,
        toolset_version: str = "",
        soul_version: str = "",
    ) -> TokenPlan:
        recent_messages = recent_messages or []
        tool_schemas = tool_schemas or []

        context_window = get_context_window(model)
        reserved_output = get_reserved_output(profile_name, requested_output_tokens, is_node_final)
        safety_margin = int(context_window * 0.08)
        max_input = context_window - reserved_output - safety_margin
        if max_input < 0:
            max_input = context_window // 2
            reserved_output = context_window // 4
            safety_margin = context_window // 8

        ratios = dict(DEFAULT_BUDGET_RATIOS)
        if profile_name == "longform_writing":
            ratios["active_artifact"] = 0.25
            ratios["recent_messages"] = 0.15
            ratios["summary"] = 0.15
            ratios["retrieval"] = 0.08
        elif profile_name == "multi_agent_flow":
            ratios["upstream"] = 0.10
            ratios["recent_messages"] = 0.12
            ratios["active_artifact"] = 0.18
        elif profile_name == "research":
            ratios["retrieval"] = 0.25
            ratios["recent_messages"] = 0.12
        elif profile_name == "edit_review":
            ratios["active_artifact"] = 0.30
            ratios["retrieval"] = 0.05
        total_r = sum(ratios.values())
        ratios = {k: v / total_r for k, v in ratios.items()}

        tool_schema_budget = int(max_input * self.policy.tool_schema_budget_pct)
        tool_tokens_full = estimate_tool_schema_tokens(tool_schemas)
        tool_tokens_selected = estimate_tool_schema_tokens(tool_schemas, tool_names_filter) if tool_names_filter else tool_tokens_full

        actions: List[TokenPlanAction] = []
        warnings: List[str] = []
        used: Dict[str, int] = {}
        budget_items: List[BudgetItem] = []

        if tool_names_filter and tool_tokens_full > tool_schema_budget:
            actions.append(TokenPlanAction(
                action="filter_tools",
                reason=f"Tool schemas ({tool_tokens_full}t) exceed budget ({tool_schema_budget}t); filtering to relevant tools + tool_search",
                token_savings_estimate=tool_tokens_full - tool_tokens_selected,
                target_category="tool_schema",
            ))
        tool_tokens_used = min(tool_tokens_selected, tool_schema_budget)

        categories = [
            ("system", system_text, ratios["system"], "text"),
            ("task_root", task_root_text, ratios["task_root"], "text"),
            ("pinned", pinned_text, ratios["pinned"], "text"),
            ("active_artifact", artifact_text, ratios["active_artifact"], "text"),
            ("recent_messages", recent_messages, ratios["recent_messages"], "messages"),
            ("summary", summary_text, ratios["summary"], "text"),
            ("retrieval", retrieval_text, ratios["retrieval"], "text"),
            ("upstream", upstream_text, ratios["upstream"], "text"),
        ]

        remaining = max_input - tool_tokens_used
        total_est = 0
        for cat_name, content, ratio, ctype in categories:
            budget = int(remaining * ratio)
            if ctype == "text":
                used_t = estimate_text_tokens(content) if isinstance(content, str) else 0
            else:
                used_t = estimate_messages_tokens(content)
            truncated = False
            dropped = 0
            notes = ""
            if used_t > budget and cat_name not in ("pinned", "task_root"):
                truncated = True
                dropped = 1
                notes = f"Truncated to {budget}t (was {used_t}t)"
                warnings.append(f"[{cat_name}] truncated from {used_t}t to {budget}t")
                used_t = budget
            elif used_t > budget and cat_name in ("pinned", "task_root"):
                notes = f"Protected category over budget ({used_t}t > {budget}t)"
                pass
            used[cat_name] = used_t
            total_est += used_t
            budget_items.append(BudgetItem(
                category=cat_name, budget_tokens=budget, used_tokens=used_t,
                truncated=truncated, items_dropped=dropped, notes=notes,
            ))

        tool_budget_actual = max_input - total_est
        if tool_tokens_used > tool_budget_actual and tool_tokens_used > tool_schema_budget:
            actions.append(TokenPlanAction(
                action="trim_tools",
                reason=f"Not enough room for tool schemas; trimming to essential tools only",
                token_savings_estimate=tool_tokens_used - tool_schema_budget,
                target_category="tool_schema",
            ))
            tool_tokens_used = tool_schema_budget

        total_input = total_est + tool_tokens_used
        estimated_output = reserved_output
        estimated_total = total_input + estimated_output

        estimated_cost = None
        if self.policy.input_price_per_million is not None or self.policy.output_price_per_million is not None:
            estimated_cost = (
                total_input * float(self.policy.input_price_per_million or 0.0)
                + estimated_output * float(self.policy.output_price_per_million or 0.0)
            ) / 1_000_000.0
        else:
            try:
                from agent.usage_pricing import estimate_usage_cost, CanonicalUsage
                usage = CanonicalUsage(
                    input_tokens=total_input,
                    output_tokens=estimated_output,
                )
                cost = estimate_usage_cost(model, usage, provider=provider)
                if cost.amount_usd is not None:
                    estimated_cost = float(cost.amount_usd)
            except Exception:
                pass

        blocked = False
        block_reason = None
        if self.policy.budget_mode == "hard" and self.policy.total_token_budget:
            projected = total_budget_used_input + total_budget_used_output + estimated_total
            if projected > self.policy.total_token_budget:
                blocked = True
                block_reason = f"Hard budget exceeded: {projected}t > {self.policy.total_token_budget}t"
        if self.policy.budget_mode == "hard" and self.policy.input_budget and total_input > self.policy.input_budget:
            blocked = True
            block_reason = f"Input budget exceeded: {total_input}t > {self.policy.input_budget}t"

        stable_prefix_hash = None
        cache_key = None
        if stable_prefix_parts and self.policy.cache_policy == "auto":
            stable_prefix_hash = compute_stable_prefix_hash(stable_prefix_parts)
            cache_key = compute_cache_key(
                stable_prefix_hash, toolset_version, soul_version,
                self.policy.version, profile_name,
            )

        plan = TokenPlan(
            context_window=context_window,
            reserved_output_tokens=reserved_output,
            safety_margin_tokens=safety_margin,
            max_input_tokens=max_input,
            system_budget=int(remaining * ratios["system"]),
            task_root_budget=int(remaining * ratios["task_root"]),
            pinned_budget=int(remaining * ratios["pinned"]),
            active_artifact_budget=int(remaining * ratios["active_artifact"]),
            recent_messages_budget=int(remaining * ratios["recent_messages"]),
            summary_budget=int(remaining * ratios["summary"]),
            retrieval_budget=int(remaining * ratios["retrieval"]),
            upstream_budget=int(remaining * ratios["upstream"]),
            tool_output_budget=tool_schema_budget,
            estimated_input_tokens=total_input,
            estimated_output_tokens=estimated_output,
            estimated_total_tokens=estimated_total,
            estimated_cost=estimated_cost,
            provider=provider,
            model=model,
            profile_name=profile_name,
            actions=actions,
            warnings=warnings,
            blocked=blocked,
            block_reason=block_reason,
            budget_items=budget_items,
            cache_key=cache_key,
            stable_prefix_hash=stable_prefix_hash,
            plan_id=str(uuid.uuid4()),
        )
        return plan


def plan_for_call(
    *,
    provider: str = "",
    model: str = "",
    profile_name: str = "agent_chat",
    session_id: Optional[str] = None,
    policy: Optional[TokenPolicy] = None,
    **kwargs,
) -> TokenPlan:
    planner = TokenPlanner(policy)
    return planner.plan(
        provider=provider, model=model, profile_name=profile_name,
        session_id=session_id, **kwargs,
    )
