import logging
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field

from ..compressor.compression_profiles import CompressionProfile, get_profile

logger = logging.getLogger(__name__)


@dataclass
class ContextBudget:
    total_tokens: int
    system_prompt: int = 0
    tool_definitions: int = 0
    pinned_constraints: int = 0
    mode_rules: int = 0
    project_memory: int = 0
    active_workspace: int = 0
    compressed_summary: int = 0
    recent_messages: int = 0
    tool_outputs: int = 0
    reserved_output: int = 0
    safety_margin: int = 0

    def used_total(self) -> int:
        return (
            self.system_prompt
            + self.tool_definitions
            + self.pinned_constraints
            + self.mode_rules
            + self.project_memory
            + self.active_workspace
            + self.compressed_summary
            + self.recent_messages
            + self.tool_outputs
        )

    def remaining(self) -> int:
        return self.total_tokens - self.used_total() - self.reserved_output - self.safety_margin

    def to_dict(self) -> Dict[str, int]:
        return {
            "total_tokens": self.total_tokens,
            "system_prompt": self.system_prompt,
            "tool_definitions": self.tool_definitions,
            "pinned_constraints": self.pinned_constraints,
            "mode_rules": self.mode_rules,
            "project_memory": self.project_memory,
            "active_workspace": self.active_workspace,
            "compressed_summary": self.compressed_summary,
            "recent_messages": self.recent_messages,
            "tool_outputs": self.tool_outputs,
            "reserved_output": self.reserved_output,
            "safety_margin": self.safety_margin,
            "used_total": self.used_total(),
            "remaining": self.remaining(),
        }


class ContextBudgeter:
    def __init__(
        self,
        context_length: int,
        profile: Optional[CompressionProfile] = None,
        profile_name: str = "agent_chat",
        max_output_tokens: int = 4096,
    ):
        self.context_length = context_length
        self.profile = profile or get_profile(profile_name)
        self.max_output_tokens = max_output_tokens
        self._safety_margin_ratio = 0.05

    def compute_budget(self) -> ContextBudget:
        total = self.context_length
        safety_margin = int(total * self._safety_margin_ratio)
        reserved_output = self.max_output_tokens

        usable = total - safety_margin - reserved_output

        pinned_ratio = self._get_pinned_ratio()
        mode_rules_ratio = 0.02
        memory_ratio = self._get_memory_ratio()
        workspace_ratio = 0.05
        summary_ratio = self._get_summary_ratio()
        recent_ratio = self._get_recent_ratio()
        tool_output_ratio = 0.05

        pinned_constraints = int(usable * pinned_ratio)
        mode_rules = int(usable * mode_rules_ratio)
        project_memory = int(usable * memory_ratio)
        active_workspace = int(usable * workspace_ratio)
        compressed_summary = int(usable * summary_ratio)
        recent_messages = int(usable * recent_ratio)
        tool_outputs = int(usable * tool_output_ratio)

        return ContextBudget(
            total_tokens=total,
            pinned_constraints=pinned_constraints,
            mode_rules=mode_rules,
            project_memory=project_memory,
            active_workspace=active_workspace,
            compressed_summary=compressed_summary,
            recent_messages=recent_messages,
            tool_outputs=tool_outputs,
            reserved_output=reserved_output,
            safety_margin=safety_margin,
        )

    def _get_pinned_ratio(self) -> float:
        if getattr(self.profile, "protect_pinned_constraints", False):
            return 0.08
        return 0.04

    def _get_memory_ratio(self) -> float:
        return 0.08

    def _get_summary_ratio(self) -> float:
        return getattr(self.profile, "max_summary_ratio", 0.05)

    def _get_recent_ratio(self) -> float:
        return 0.40

    def adjust_for_mode(
        self,
        budget: ContextBudget,
        mode: str,
        extras: Optional[Dict[str, Any]] = None,
    ) -> ContextBudget:
        extras = extras or {}

        if mode == "writer_ide":
            budget.active_workspace += int(budget.total_tokens * 0.03)
            budget.recent_messages = max(0, budget.recent_messages - int(budget.total_tokens * 0.03))
        elif mode == "codex_dev":
            budget.tool_outputs += int(budget.total_tokens * 0.03)
            budget.recent_messages = max(0, budget.recent_messages - int(budget.total_tokens * 0.03))
        elif mode == "soul_workshop":
            budget.pinned_constraints += int(budget.total_tokens * 0.04)
            budget.project_memory += int(budget.total_tokens * 0.02)
            budget.recent_messages = max(
                0, budget.recent_messages - int(budget.total_tokens * 0.06)
            )
        elif mode == "multi_agent_flow":
            budget.compressed_summary += int(budget.total_tokens * 0.05)
            budget.recent_messages = max(0, budget.recent_messages - int(budget.total_tokens * 0.05))

        return budget

    def estimate_tokens(self, text: str) -> int:
        if not text:
            return 0
        char_count = len(text)
        return max(1, int(char_count / 3.5))

    def estimate_message_tokens(self, messages: List[Dict[str, Any]]) -> int:
        total = 0
        for msg in messages:
            content = msg.get("content", "")
            if isinstance(content, str):
                total += self.estimate_tokens(content) + 4
            elif isinstance(content, list):
                for part in content:
                    if isinstance(part, dict):
                        if part.get("type") == "text":
                            total += self.estimate_tokens(part.get("text", "")) + 4
                        elif part.get("type") == "tool_result":
                            total += self.estimate_tokens(
                                str(part.get("content", ""))
                            ) + 8
            role = msg.get("role", "")
            total += len(role) + 2
        return total

    def fits_in_budget(self, text: str, budget_category: str, budget: ContextBudget) -> bool:
        tokens = self.estimate_tokens(text)
        available = getattr(budget, budget_category, 0)
        return tokens <= available

    def truncate_to_budget(
        self,
        items: List[Dict[str, Any]],
        budget_category: str,
        budget: ContextBudget,
        content_key: str = "content",
    ) -> List[Dict[str, Any]]:
        available = getattr(budget, budget_category, 0)
        result = []
        used = 0

        for item in items:
            content = str(item.get(content_key, ""))
            tokens = self.estimate_tokens(content)
            if used + tokens <= available:
                result.append(item)
                used += tokens
            else:
                remaining = available - used
                if remaining > 50:
                    ratio = remaining / tokens if tokens > 0 else 0
                    truncated = content[: int(len(content) * ratio)]
                    new_item = dict(item)
                    new_item[content_key] = truncated + "..."
                    new_item["_truncated"] = True
                    result.append(new_item)
                break

        return result


_default_budgeter: Optional[ContextBudgeter] = None


def get_context_budgeter(
    context_length: int = 128000,
    profile_name: str = "agent_chat",
) -> ContextBudgeter:
    global _default_budgeter
    if _default_budgeter is None or _default_budgeter.context_length != context_length:
        _default_budgeter = ContextBudgeter(
            context_length=context_length,
            profile_name=profile_name,
        )
    return _default_budgeter
