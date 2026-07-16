import json
import logging
import re
from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any, Tuple

from .summary_schema import CompressionSummary

logger = logging.getLogger(__name__)


@dataclass
class CompressionQualityCheck:
    has_goal: bool = False
    has_constraints: bool = False
    has_next_steps: bool = False
    has_active_files: bool = False
    has_rejected_ideas: bool = False
    has_open_bugs: bool = False
    has_ui_rules: bool = False

    score: float = 0.0
    missing_fields: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "has_goal": self.has_goal,
            "has_constraints": self.has_constraints,
            "has_next_steps": self.has_next_steps,
            "has_active_files": self.has_active_files,
            "has_rejected_ideas": self.has_rejected_ideas,
            "has_open_bugs": self.has_open_bugs,
            "has_ui_rules": self.has_ui_rules,
            "score": self.score,
            "missing_fields": self.missing_fields,
        }


QUALITY_WEIGHTS = {
    "has_goal": 0.15,
    "has_constraints": 0.25,
    "has_next_steps": 0.15,
    "has_active_files": 0.10,
    "has_rejected_ideas": 0.10,
    "has_open_bugs": 0.10,
    "has_ui_rules": 0.15,
}


def calculate_quality_score(check: CompressionQualityCheck) -> float:
    score = 0.0
    check.missing_fields = []

    if check.has_goal:
        score += QUALITY_WEIGHTS["has_goal"]
    else:
        check.missing_fields.append("goal")

    if check.has_constraints:
        score += QUALITY_WEIGHTS["has_constraints"]
    else:
        check.missing_fields.append("constraints")

    if check.has_next_steps:
        score += QUALITY_WEIGHTS["has_next_steps"]
    else:
        check.missing_fields.append("next_steps")

    if check.has_active_files:
        score += QUALITY_WEIGHTS["has_active_files"]
    else:
        check.missing_fields.append("active_files")

    if check.has_rejected_ideas:
        score += QUALITY_WEIGHTS["has_rejected_ideas"]
    else:
        check.missing_fields.append("rejected_ideas")

    if check.has_open_bugs:
        score += QUALITY_WEIGHTS["has_open_bugs"]
    else:
        check.missing_fields.append("open_bugs")

    if check.has_ui_rules:
        score += QUALITY_WEIGHTS["has_ui_rules"]
    else:
        check.missing_fields.append("ui_rules")

    check.score = round(score, 2)
    return check.score


def check_summary_quality(
    summary: CompressionSummary,
    pinned_contexts: Optional[List[Dict[str, Any]]] = None,
    recent_messages: Optional[List[Dict[str, Any]]] = None,
    min_score: float = 0.75,
) -> Tuple[CompressionQualityCheck, bool]:
    check = CompressionQualityCheck()

    check.has_goal = bool(summary.goal and len(summary.goal.strip()) > 5)
    check.has_constraints = len(summary.non_negotiable_constraints) > 0
    check.has_next_steps = len(summary.next_steps) > 0
    check.has_active_files = len(summary.active_workspace_files) > 0
    check.has_rejected_ideas = len(summary.rejected_ideas) > 0
    check.has_open_bugs = len(summary.blocked_bugs) > 0
    check.has_ui_rules = len(summary.ui_interaction_rules) > 0

    calculate_quality_score(check)

    passes = check.score >= min_score

    if pinned_contexts:
        critical_pins = [p for p in pinned_contexts if p.get("priority") == "critical"]
        if critical_pins:
            critical_contents = set()
            for pin in critical_pins:
                content = pin.get("content", "").lower()
                if content:
                    words = set(re.findall(r"[\w\u4e00-\u9fff]+", content))
                    critical_contents.add(frozenset(words))

            if critical_contents:
                all_summary_text = _get_summary_text_for_matching(summary).lower()
                summary_words = set(re.findall(r"[\w\u4e00-\u9fff]+", all_summary_text))

                missing_critical = []
                for i, pin_words in enumerate(critical_contents):
                    overlap = len(pin_words & summary_words)
                    if overlap < len(pin_words) * 0.3 and len(pin_words) > 3:
                        missing_critical.append(i)

                if missing_critical:
                    passes = False
                    check.missing_fields.append("critical_pinned_context")
                    check.score = max(0.0, check.score - 0.3)

    return check, passes


def _get_summary_text_for_matching(summary: CompressionSummary) -> str:
    parts = [
        summary.goal or "",
        " ".join(summary.non_negotiable_constraints),
        " ".join(summary.design_decisions),
        " ".join(summary.implementation_decisions),
        " ".join(summary.ui_interaction_rules),
        " ".join(summary.rejected_ideas),
        " ".join(summary.critical_exact_phrases),
    ]
    return " ".join(parts)


def should_retry_compression(
    quality_check: CompressionQualityCheck,
    previous_checks: Optional[List[CompressionQualityCheck]] = None,
) -> bool:
    if quality_check.score >= 0.75:
        return False

    if previous_checks and len(previous_checks) >= 1:
        return False

    important_missing = {"constraints", "next_steps", "critical_pinned_context"}
    return bool(set(quality_check.missing_fields) & important_missing)


def get_quality_retry_prompt_addition(quality_check: CompressionQualityCheck) -> str:
    if not quality_check.missing_fields:
        return ""

    additions = ["IMPORTANT - Your previous summary was missing critical information. You MUST include:"]
    if "constraints" in quality_check.missing_fields:
        additions.append("- NON-NEGOTIABLE CONSTRAINTS: List ALL hard rules/constraints mentioned by the user")
    if "next_steps" in quality_check.missing_fields:
        additions.append("- NEXT STEPS: List what needs to be done next")
    if "rejected_ideas" in quality_check.missing_fields:
        additions.append("- REJECTED IDEAS: List approaches the user explicitly rejected (do NOT repeat these)")
    if "ui_rules" in quality_check.missing_fields:
        additions.append("- UI INTERACTION RULES: Include click/right-click/hover behavior rules")
    if "critical_pinned_context" in quality_check.missing_fields:
        additions.append("- CRITICAL PINNED CONSTRAINTS: You missed critical pinned constraints, include all of them")
    if "goal" in quality_check.missing_fields:
        additions.append("- GOAL: State the clear current goal")

    additions.append("Output complete JSON with ALL fields populated.")
    return "\n".join(additions)
