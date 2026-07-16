from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

from .token_policy import TokenPolicy
from .token_models import TokenPlan
from .token_ledger import TokenLedger

logger = logging.getLogger(__name__)

BUDGET_THRESHOLDS = [0.50, 0.75, 0.90, 1.00]
THRESHOLD_LABELS = {
    0.50: "50%",
    0.75: "75%",
    0.90: "90%",
    1.00: "projected_exceed",
}

SUGGESTIONS = {
    0.50: [
        "Consider reducing non-essential agents",
        "Reuse existing research results where possible",
    ],
    0.75: [
        "Disable unrelated MCP servers",
        "Switch auxiliary calls to a lighter model",
        "Consider compressing context before continuing",
    ],
    0.90: [
        "Reduce Critic rounds to 1",
        "Use direct-write artifact mode for long outputs",
        "Reuse cached node results",
    ],
    1.00: [
        "Reduce output length or split into segments",
        "Add temporary budget or switch model",
        "Cancel and resume after compression",
    ],
}


class BudgetEnforcer:
    def __init__(self, policy: TokenPolicy, ledger: Optional[TokenLedger] = None):
        self.policy = policy
        self.ledger = ledger
        self._notified_thresholds: Dict[str, set] = {}

    def check_budget(
        self,
        plan: TokenPlan,
        *,
        session_id: Optional[str] = None,
        project_id: Optional[str] = None,
        used_so_far_input: int = 0,
        used_so_far_output: int = 0,
        used_so_far_cost: float = 0.0,
    ) -> Dict[str, Any]:
        warnings: List[str] = []
        triggered = []
        blocked = False
        block_reason = None
        suggestions: List[str] = []

        total_budget = self.policy.total_token_budget
        if total_budget:
            projected = used_so_far_input + used_so_far_output + plan.estimated_total_tokens
            ratio = projected / total_budget
            for thresh in BUDGET_THRESHOLDS:
                if ratio >= thresh:
                    key = f"{session_id or 'global'}:{thresh}"
                    notified = self._notified_thresholds.setdefault(session_id or "global", set())
                    label = THRESHOLD_LABELS[thresh]
                    if thresh not in notified:
                        notified.add(thresh)
                        triggered.append({"threshold": thresh, "label": label, "ratio": ratio})
                        suggestions.extend(SUGGESTIONS.get(thresh, []))
                        if thresh == 1.00:
                            msg = f"Projected usage {projected}t exceeds budget {total_budget}t"
                            warnings.append(f"⚠️ Budget warning ({label}): {msg}")
                        else:
                            warnings.append(f"💰 Budget notification at {label} of total budget")
            if self.policy.budget_mode == "hard" and ratio >= 1.0:
                blocked = True
                block_reason = f"Hard budget exceeded: projected {projected}t > {total_budget}t"

        if self.policy.input_budget and plan.estimated_input_tokens > self.policy.input_budget:
            if self.policy.budget_mode == "hard":
                blocked = True
                block_reason = f"Input budget exceeded: {plan.estimated_input_tokens}t > {self.policy.input_budget}t"
            else:
                warnings.append(f"Input budget advisory: {plan.estimated_input_tokens}t > {self.policy.input_budget}t")
                suggestions.append("Reduce context size or increase input budget")

        if self.policy.output_budget and plan.estimated_output_tokens > self.policy.output_budget:
            if self.policy.budget_mode == "hard":
                blocked = True
                block_reason = f"Output budget exceeded: {plan.estimated_output_tokens}t > {self.policy.output_budget}t"
            else:
                warnings.append(f"Output budget advisory: {plan.estimated_output_tokens}t > {self.policy.output_budget}t")

        if blocked and plan.reserved_output_tokens >= 4096 and plan.profile_name in ("longform_writing", "academic", "technical_writing"):
            suggestions.insert(0, "This appears to be a final-draft call — consider segmented direct-write mode instead of blocking")

        if self.policy.currency_budget is not None and plan.estimated_cost is not None:
            projected_cost = used_so_far_cost + plan.estimated_cost
            if projected_cost > self.policy.currency_budget:
                if self.policy.budget_mode == "hard":
                    blocked = True
                    block_reason = block_reason or f"Currency budget exceeded: ${projected_cost:.4f} > ${self.policy.currency_budget:.4f}"
                else:
                    warnings.append(f"Cost advisory: ${projected_cost:.4f} projected vs ${self.policy.currency_budget:.4f} budget")

        if blocked:
            plan.blocked = True
            plan.block_reason = block_reason

        return {
            "blocked": blocked,
            "block_reason": block_reason,
            "warnings": warnings,
            "triggered_thresholds": triggered,
            "suggestions": suggestions,
        }


class EvidencePack:
    def __init__(self, pack_id: str, query: str = ""):
        self.pack_id = pack_id
        self.query = query
        self.items: List[Dict[str, Any]] = []
        self.tokens = 0

    def add(self, content: str, source: str = "", confidence: float = 1.0):
        self.items.append({"content": content, "source": source, "confidence": confidence})

    def to_summary(self, max_chars: int = 1200) -> str:
        if not self.items:
            return ""
        lines = [f"## Evidence Pack: {self.query or self.pack_id}"]
        for i, it in enumerate(self.items, 1):
            src = f" [{it['source']}]" if it.get("source") else ""
            content = it["content"][:300].replace("\n", " ")
            lines.append(f"{i}.{src} {content}")
        text = "\n".join(lines)
        if len(text) > max_chars:
            text = text[:max_chars] + "..."
        return text


class EvidencePackStore:
    def __init__(self):
        self.packs: Dict[str, EvidencePack] = {}

    def create(self, query: str = "", pack_id: Optional[str] = None) -> EvidencePack:
        import uuid
        pid = pack_id or str(uuid.uuid4())[:8]
        pack = EvidencePack(pid, query)
        self.packs[pid] = pack
        return pack

    def get(self, pack_id: str) -> Optional[EvidencePack]:
        return self.packs.get(pack_id)

    def get_or_create(self, query: str) -> Tuple[EvidencePack, bool]:
        for p in self.packs.values():
            if p.query and p.query.lower().strip() == query.lower().strip():
                return p, True
        return self.create(query), False
