from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Literal, Optional

TokenMode = Literal["balanced", "saving", "quality"]
PolicyScope = Literal["global", "workspace", "project", "workflow", "session"]
BudgetMode = Literal["advisory", "hard"]
UsageSource = Literal["provider", "tokenizer", "estimate"]
CachePolicy = Literal["auto", "off"]
ToolSchemaPolicy = Literal["required_only", "minimal", "full"]
SkillPolicy = Literal["retrieve_on_demand", "top_n", "minimal"]
RagPolicy = Literal["adaptive", "fixed_top_k", "minimal"]
MultiAgentPolicy = Literal["summary_and_refs", "full_passthrough", "minimal"]
ArtifactPolicy = Literal["direct_write", "inline"]


@dataclass
class TokenPolicy:
    version: int = 1
    mode: TokenMode = "balanced"
    scope: PolicyScope = "global"
    scope_id: Optional[str] = None

    final_output_policy: str = "protect_requested_length"

    input_budget: Optional[int] = None
    output_budget: Optional[int] = None
    total_token_budget: Optional[int] = None
    currency_budget: Optional[float] = None

    budget_mode: BudgetMode = "advisory"
    unknown_price_policy: str = "token_only"
    input_price_per_million: Optional[float] = None
    cached_input_price_per_million: Optional[float] = None
    output_price_per_million: Optional[float] = None
    reasoning_price_per_million: Optional[float] = None
    price_source: Optional[str] = None
    price_version: Optional[str] = None
    model_routing_policy: str = "auto"
    model_slots: Dict[str, str] = field(default_factory=dict)
    provider_slots: Dict[str, str] = field(default_factory=dict)

    compression_profile: str = "agent_chat"
    cache_policy: CachePolicy = "auto"
    tool_schema_policy: ToolSchemaPolicy = "required_only"
    skill_policy: SkillPolicy = "retrieve_on_demand"
    rag_policy: RagPolicy = "adaptive"
    multi_agent_policy: MultiAgentPolicy = "summary_and_refs"
    artifact_policy: ArtifactPolicy = "direct_write"

    skill_max_inject: int = 3
    tool_schema_budget_pct: float = 0.10
    max_critic_rounds: int = 2
    max_parallel_nodes: int = 3
    tool_output_externalize_chars: int = 4000
    node_summary_max_chars: int = 1200
    critic_improvement_threshold: float = 0.05

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "TokenPolicy":
        valid_fields = {f.name for f in cls.__dataclass_fields__.values()}
        filtered = {k: v for k, v in d.items() if k in valid_fields}
        return cls(**filtered)

    def merge(self, override: "TokenPolicy") -> "TokenPolicy":
        base = self.to_dict()
        over = override.to_dict()
        for k, v in over.items():
            if v is not None:
                base[k] = v
        if override.scope != "global" and override.scope_id is not None:
            base["scope"] = override.scope
            base["scope_id"] = override.scope_id
        return TokenPolicy.from_dict(base)


DEFAULT_TOKEN_POLICY = TokenPolicy()

BALANCED_POLICY = TokenPolicy(mode="balanced")
SAVING_POLICY = TokenPolicy(
    mode="saving",
    skill_max_inject=2,
    tool_schema_budget_pct=0.07,
    max_critic_rounds=1,
    max_parallel_nodes=2,
    tool_output_externalize_chars=2500,
    node_summary_max_chars=800,
)
QUALITY_POLICY = TokenPolicy(
    mode="quality",
    skill_max_inject=5,
    tool_schema_budget_pct=0.15,
    max_critic_rounds=3,
    max_parallel_nodes=4,
    tool_output_externalize_chars=6000,
    node_summary_max_chars=2000,
    rag_policy="fixed_top_k",
)

POLICY_PRIORITY: Dict[str, int] = {
    "global": 0,
    "workspace": 1,
    "project": 2,
    "session": 3,
    "workflow": 4,
}

OUTPUT_RESERVATION = {
    "agent_chat": 4096,
    "edit_review": 4096,
    "academic": 6144,
    "technical_writing": 6144,
    "longform_writing": 8192,
    "multi_agent_flow": 4096,
    "research": 4096,
    "codex_dev": 4096,
    "soul_workshop": 4096,
    "translation": 4096,
    "node_intermediate": 2048,
    "node_final": 8192,
}

DEFAULT_BUDGET_RATIOS = {
    "system": 0.10,
    "task_root": 0.10,
    "pinned": 0.10,
    "active_artifact": 0.20,
    "recent_messages": 0.20,
    "summary": 0.12,
    "retrieval": 0.13,
    "upstream": 0.05,
}
