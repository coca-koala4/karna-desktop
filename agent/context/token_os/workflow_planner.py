from __future__ import annotations

import logging
import hashlib
from typing import Any, Dict, List, Optional

from .token_policy import TokenPolicy
from .token_models import WorkflowTokenPlan, NodeTokenPlan
from .token_estimator import estimate_text_tokens
from .token_planner import get_context_window, get_reserved_output

logger = logging.getLogger(__name__)


def estimate_node_defaults(node_type: str) -> Dict[str, Any]:
    t = (node_type or "").lower()
    if "research" in t or "search" in t:
        return {"output_tokens": 2048, "tools": ["web_search", "web_fetch", "read_file"], "skills": [], "rag_budget": 4000}
    if "write" in t or "draft" in t or "create" in t:
        return {"output_tokens": 4096, "tools": ["write_file", "read_file", "memory_add"], "skills": ["writer"], "rag_budget": 2000}
    if "edit" in t or "review" in t or "critic" in t:
        return {"output_tokens": 2048, "tools": ["read_file"], "skills": ["critic"], "rag_budget": 1500}
    if "final" in t or "compile" in t or "aggregate" in t:
        return {"output_tokens": 8192, "tools": ["read_file", "write_file"], "skills": [], "rag_budget": 2000}
    return {"output_tokens": 2048, "tools": ["read_file"], "skills": [], "rag_budget": 2000}


class WorkflowTokenPlanner:
    def __init__(self, policy: Optional[TokenPolicy] = None):
        self.policy = policy or TokenPolicy()

    def plan_workflow(
        self,
        workflow_id: str,
        nodes: List[Dict[str, Any]],
        model: str = "",
        provider: str = "",
        project_budget_used_input: int = 0,
        project_budget_used_output: int = 0,
    ) -> WorkflowTokenPlan:
        plan = WorkflowTokenPlan(
            workflow_id=workflow_id,
            max_parallel_nodes=self.policy.max_parallel_nodes,
        )
        total_in = 0
        total_out = 0
        total_calls = 0
        total_cost = 0.0
        cost_known = True
        reusable = []
        skipped = []
        warnings: List[str] = []

        for node in nodes:
            node_id = node.get("id") or node.get("node_id") or ""
            node_name = node.get("name") or node.get("label") or node_id
            node_type = node.get("type") or node.get("node_type") or "default"
            defaults = estimate_node_defaults(node_type)
            is_final = node.get("is_final", "final" in node_name.lower() or "compile" in node_type.lower())

            route_slot = "default"
            node_type_lower = node_type.lower()
            if is_final:
                route_slot = "final"
            elif "critic" in node_type_lower or "review" in node_type_lower:
                route_slot = "critic"
            elif "research" in node_type_lower or "retriev" in node_type_lower:
                route_slot = "research"
            elif "summar" in node_type_lower or "extract" in node_type_lower or "parse" in node_type_lower:
                route_slot = "lightweight"
            routed_model = self.policy.model_slots.get(route_slot) or self.policy.model_slots.get("default") or model
            routed_provider = self.policy.provider_slots.get(route_slot) or self.policy.provider_slots.get("default") or provider

            max_output = node.get("max_output_tokens") or defaults["output_tokens"]
            if is_final:
                max_output = max(max_output, 8192)

            ntools = list(node.get("tools") or defaults["tools"])
            nskills = list(node.get("skills") or defaults["skills"])
            if self.policy.tool_schema_policy == "required_only" and "web_search" not in ntools and "research" not in node_type:
                pass
            if len(nskills) > self.policy.skill_max_inject:
                nskills = nskills[:self.policy.skill_max_inject]

            node_input_est = node.get("estimated_input", 0) or 3000
            node_in = node_input_est
            node_out = max_output
            total_in += node_in
            total_out += node_out
            total_calls += node.get("max_retries", 2) + 1

            can_reuse = node.get("reusable", False) or any(
                k in node_type for k in ("extract", "parse", "embed", "fact_check", "summarize", "term_glossary", "structure")
            )
            if can_reuse:
                reusable.append(node_id)

            estimated_cost = None
            try:
                from agent.usage_pricing import estimate_usage_cost, CanonicalUsage
                usage = CanonicalUsage(input_tokens=node_in, output_tokens=node_out)
                cost = estimate_usage_cost(routed_model or "claude-sonnet-4-6", usage, provider=routed_provider)
                if cost.amount_usd is not None:
                    estimated_cost = float(cost.amount_usd)
            except Exception:
                pass
            if estimated_cost is None:
                cost_known = False
            else:
                total_cost += estimated_cost

            np = NodeTokenPlan(
                node_id=node_id,
                node_name=node_name,
                model=node.get("model") or routed_model,
                provider=node.get("provider") or routed_provider,
                max_output_tokens=max_output,
                toolset=ntools,
                skills=nskills,
                mcp_servers=list(node.get("mcp_servers") or []),
                upstream_summary_budget=self.policy.node_summary_max_chars // 4,
                rag_budget=defaults["rag_budget"],
                max_retries=min(node.get("max_retries", 2), self.policy.max_critic_rounds) if "critic" in node_type else node.get("max_retries", 1),
                max_loops=1,
                reusable=can_reuse,
                estimated_input_tokens=node_in,
                estimated_output_tokens=node_out,
                estimated_cost=estimated_cost,
            )
            plan.node_plans.append(np)

        plan.estimated_calls = total_calls
        plan.estimated_input_tokens = total_in
        plan.estimated_output_tokens = total_out
        if self.policy.budget_mode == "hard" and self.policy.total_token_budget:
            projected = project_budget_used_input + project_budget_used_output + total_in + total_out
            if projected > self.policy.total_token_budget:
                plan.blocked = True
                plan.block_reason = f"Workflow would exceed budget: {projected}t > {self.policy.total_token_budget}t"
                warnings.append(plan.block_reason)
        plan.warnings = warnings
        plan.reusable_nodes = reusable
        plan.skipped_nodes = skipped
        plan.estimated_cost = total_cost if cost_known else None
        return plan


def compute_node_cache_key(
    *,
    input_text: str,
    prompt_template_version: str = "",
    skill_version: str = "",
    model: str = "",
    constraints_version: str = "",
    rag_index_version: str = "",
    node_config_version: str = "",
) -> str:
    input_hash = hashlib.sha256(input_text.encode("utf-8", errors="replace")).hexdigest()[:16]
    raw = f"{input_hash}|{prompt_template_version}|{skill_version}|{model}|{constraints_version}|{rag_index_version}|{node_config_version}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]


CRITIC_STOP_THRESHOLD = 0.05
MAX_CRITIC_ROUNDS = 2


def should_stop_critic_loop(
    round_scores: List[float],
    threshold: float = CRITIC_STOP_THRESHOLD,
    max_rounds: int = MAX_CRITIC_ROUNDS,
) -> bool:
    if len(round_scores) >= max_rounds:
        return True
    if len(round_scores) < 2:
        return False
    improvement = round_scores[-1] - round_scores[-2]
    if improvement < threshold:
        return True
    return False
