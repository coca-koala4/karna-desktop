from __future__ import annotations

import json
import hashlib
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional

@dataclass
class TokenPlanAction:
    action: str
    reason: str
    token_savings_estimate: int = 0
    target_category: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


@dataclass
class BudgetItem:
    category: str
    budget_tokens: int
    used_tokens: int = 0
    truncated: bool = False
    externalized: bool = False
    items_dropped: int = 0
    notes: str = ""


@dataclass
class TokenPlan:
    context_window: int
    reserved_output_tokens: int
    safety_margin_tokens: int
    max_input_tokens: int

    system_budget: int = 0
    task_root_budget: int = 0
    pinned_budget: int = 0
    active_artifact_budget: int = 0
    recent_messages_budget: int = 0
    summary_budget: int = 0
    retrieval_budget: int = 0
    upstream_budget: int = 0
    tool_output_budget: int = 0

    estimated_input_tokens: int = 0
    estimated_output_tokens: int = 0
    estimated_total_tokens: int = 0
    estimated_cost: Optional[float] = None

    provider: str = ""
    model: str = ""
    profile_name: str = ""

    actions: List[TokenPlanAction] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    blocked: bool = False
    block_reason: Optional[str] = None

    budget_items: List[BudgetItem] = field(default_factory=list)
    cache_key: Optional[str] = None
    stable_prefix_hash: Optional[str] = None

    plan_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "context_window": self.context_window,
            "reserved_output_tokens": self.reserved_output_tokens,
            "safety_margin_tokens": self.safety_margin_tokens,
            "max_input_tokens": self.max_input_tokens,
            "budgets": {
                "system": self.system_budget,
                "task_root": self.task_root_budget,
                "pinned": self.pinned_budget,
                "active_artifact": self.active_artifact_budget,
                "recent_messages": self.recent_messages_budget,
                "summary": self.summary_budget,
                "retrieval": self.retrieval_budget,
                "upstream": self.upstream_budget,
                "tool_output": self.tool_output_budget,
            },
            "estimated": {
                "input_tokens": self.estimated_input_tokens,
                "output_tokens": self.estimated_output_tokens,
                "total_tokens": self.estimated_total_tokens,
                "cost_usd": self.estimated_cost,
            },
            "provider": self.provider,
            "model": self.model,
            "profile": self.profile_name,
            "actions": [asdict(a) for a in self.actions],
            "warnings": self.warnings,
            "blocked": self.blocked,
            "block_reason": self.block_reason,
            "budget_items": [asdict(b) for b in self.budget_items],
            "cache_key": self.cache_key,
            "plan_id": self.plan_id,
        }


@dataclass
class NodeTokenPlan:
    node_id: str
    node_name: str
    model: str = ""
    provider: str = ""
    max_output_tokens: int = 2048
    context_sources: List[str] = field(default_factory=list)
    toolset: List[str] = field(default_factory=list)
    skills: List[str] = field(default_factory=list)
    mcp_servers: List[str] = field(default_factory=list)
    upstream_summary_budget: int = 1200
    rag_budget: int = 2000
    max_retries: int = 2
    max_loops: int = 1
    reusable: bool = False
    estimated_input_tokens: int = 0
    estimated_output_tokens: int = 0
    estimated_cost: Optional[float] = None


@dataclass
class WorkflowTokenPlan:
    workflow_id: str
    estimated_calls: int = 0
    estimated_input_tokens: int = 0
    estimated_output_tokens: int = 0
    estimated_cost: Optional[float] = None
    node_plans: List[NodeTokenPlan] = field(default_factory=list)
    reusable_nodes: List[str] = field(default_factory=list)
    skipped_nodes: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    blocked: bool = False
    block_reason: Optional[str] = None
    max_parallel_nodes: int = 3

    def to_dict(self) -> Dict[str, Any]:
        return {
            "workflow_id": self.workflow_id,
            "estimated_calls": self.estimated_calls,
            "estimated_input_tokens": self.estimated_input_tokens,
            "estimated_output_tokens": self.estimated_output_tokens,
            "estimated_cost_usd": self.estimated_cost,
            "node_plans": [asdict(n) for n in self.node_plans],
            "reusable_nodes": self.reusable_nodes,
            "skipped_nodes": self.skipped_nodes,
            "warnings": self.warnings,
            "blocked": self.blocked,
            "block_reason": self.block_reason,
            "max_parallel_nodes": self.max_parallel_nodes,
        }


@dataclass
class RollingArtState:
    artifact_path: str
    total_target_tokens: int = 0
    completed_tokens: int = 0
    current_chapter: str = ""
    current_section: str = ""
    recent_scene_summary: str = ""
    character_positions: Dict[str, str] = field(default_factory=dict)
    timeline_position: str = ""
    unresolved_threads: List[str] = field(default_factory=list)
    new_facts: List[str] = field(default_factory=list)
    forbidden_conflicts: List[str] = field(default_factory=list)
    tone_viewpoint: str = ""
    next_segment_hook: str = ""

    def to_context_text(self) -> str:
        lines = ["## Rolling创作状态"]
        if self.current_chapter:
            lines.append(f"当前章节: {self.current_chapter}")
        if self.current_section:
            lines.append(f"当前节: {self.current_section}")
        lines.append(f"进度: {self.completed_tokens}/{self.total_target_tokens} tokens")
        if self.recent_scene_summary:
            lines.append(f"\n最近场景摘要:\n{self.recent_scene_summary}")
        if self.character_positions:
            lines.append("\n人物当前状态:")
            for char, pos in self.character_positions.items():
                lines.append(f"- {char}: {pos}")
        if self.unresolved_threads:
            lines.append("\n未回收伏笔:")
            for t in self.unresolved_threads:
                lines.append(f"- {t}")
        if self.new_facts:
            lines.append("\n本章新事实:")
            for f in self.new_facts[-10:]:
                lines.append(f"- {f}")
        if self.forbidden_conflicts:
            lines.append("\n禁止冲突:")
            for c in self.forbidden_conflicts:
                lines.append(f"- {c}")
        if self.next_segment_hook:
            lines.append(f"\n下一段衔接:\n{self.next_segment_hook}")
        return "\n".join(lines)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


def compute_stable_prefix_hash(parts: List[str]) -> str:
    h = hashlib.sha256()
    for p in parts:
        h.update(p.encode("utf-8", errors="replace"))
        h.update(b"\x00")
    return h.hexdigest()[:16]


def compute_cache_key(prefix_hash: str, toolset_version: str, soul_version: str, policy_version: int, profile_name: str) -> str:
    raw = f"{prefix_hash}|{toolset_version}|{soul_version}|v{policy_version}|{profile_name}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]
