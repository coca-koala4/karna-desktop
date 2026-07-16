from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from datetime import datetime


@dataclass
class CompressionSummary:
    goal: str = ""
    current_product_area: Optional[str] = None

    non_negotiable_constraints: List[str] = field(default_factory=list)
    design_decisions: List[str] = field(default_factory=list)
    implementation_decisions: List[str] = field(default_factory=list)

    active_workspace_files: List[str] = field(default_factory=list)
    data_models_apis: List[str] = field(default_factory=list)
    ui_interaction_rules: List[str] = field(default_factory=list)
    safety_permission_rules: List[str] = field(default_factory=list)

    progress_done: List[str] = field(default_factory=list)
    progress_in_progress: List[str] = field(default_factory=list)
    blocked_bugs: List[str] = field(default_factory=list)
    next_steps: List[str] = field(default_factory=list)

    rejected_ideas: List[str] = field(default_factory=list)
    critical_exact_phrases: List[str] = field(default_factory=list)

    tool_output_handles: List[str] = field(default_factory=list)

    updated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_dict(self) -> dict:
        return {
            "goal": self.goal,
            "current_product_area": self.current_product_area,
            "non_negotiable_constraints": self.non_negotiable_constraints,
            "design_decisions": self.design_decisions,
            "implementation_decisions": self.implementation_decisions,
            "active_workspace_files": self.active_workspace_files,
            "data_models_apis": self.data_models_apis,
            "ui_interaction_rules": self.ui_interaction_rules,
            "safety_permission_rules": self.safety_permission_rules,
            "progress_done": self.progress_done,
            "progress_in_progress": self.progress_in_progress,
            "blocked_bugs": self.blocked_bugs,
            "next_steps": self.next_steps,
            "rejected_ideas": self.rejected_ideas,
            "critical_exact_phrases": self.critical_exact_phrases,
            "tool_output_handles": self.tool_output_handles,
            "updated_at": self.updated_at,
        }

    def to_markdown(self) -> str:
        lines = []

        if self.goal:
            lines.append("## 当前目标")
            lines.append("")
            lines.append(self.goal)
            lines.append("")

        if self.current_product_area:
            lines.append("## 当前模块")
            lines.append("")
            lines.append(self.current_product_area)
            lines.append("")

        if self.non_negotiable_constraints:
            lines.append("## 不可违反约束")
            lines.append("")
            for c in self.non_negotiable_constraints:
                lines.append(f"- {c}")
            lines.append("")

        if self.design_decisions:
            lines.append("## 设计决策")
            lines.append("")
            for d in self.design_decisions:
                lines.append(f"- {d}")
            lines.append("")

        if self.implementation_decisions:
            lines.append("## 技术决策")
            lines.append("")
            for d in self.implementation_decisions:
                lines.append(f"- {d}")
            lines.append("")

        if self.active_workspace_files:
            lines.append("## 当前文件 / Workspace")
            lines.append("")
            for f in self.active_workspace_files:
                lines.append(f"- {f}")
            lines.append("")

        if self.data_models_apis:
            lines.append("## 数据结构 / API")
            lines.append("")
            for d in self.data_models_apis:
                lines.append(f"- {d}")
            lines.append("")

        if self.ui_interaction_rules:
            lines.append("## UI 交互规则")
            lines.append("")
            for r in self.ui_interaction_rules:
                lines.append(f"- {r}")
            lines.append("")

        if self.safety_permission_rules:
            lines.append("## 安全与权限")
            lines.append("")
            for r in self.safety_permission_rules:
                lines.append(f"- {r}")
            lines.append("")

        if self.progress_done:
            lines.append("## 已完成")
            lines.append("")
            for p in self.progress_done:
                lines.append(f"- {p}")
            lines.append("")

        if self.progress_in_progress:
            lines.append("## 进行中")
            lines.append("")
            for p in self.progress_in_progress:
                lines.append(f"- {p}")
            lines.append("")

        if self.blocked_bugs:
            lines.append("## 阻塞 / Bug")
            lines.append("")
            for b in self.blocked_bugs:
                lines.append(f"- {b}")
            lines.append("")

        if self.next_steps:
            lines.append("## 下一步")
            lines.append("")
            for n in self.next_steps:
                lines.append(f"- {n}")
            lines.append("")

        if self.rejected_ideas:
            lines.append("## 不要重复的错误方案")
            lines.append("")
            for r in self.rejected_ideas:
                lines.append(f"- {r}")
            lines.append("")

        if self.critical_exact_phrases:
            lines.append("## 关键原话")
            lines.append("")
            for p in self.critical_exact_phrases:
                lines.append(f"> {p}")
            lines.append("")

        if self.tool_output_handles:
            lines.append("## 工具输出引用")
            lines.append("")
            for h in self.tool_output_handles:
                lines.append(f"- {h}")
            lines.append("")

        return "\n".join(lines)

    @classmethod
    def from_dict(cls, data: dict) -> "CompressionSummary":
        return cls(
            goal=data.get("goal", ""),
            current_product_area=data.get("current_product_area"),
            non_negotiable_constraints=data.get("non_negotiable_constraints", []),
            design_decisions=data.get("design_decisions", []),
            implementation_decisions=data.get("implementation_decisions", []),
            active_workspace_files=data.get("active_workspace_files", []),
            data_models_apis=data.get("data_models_apis", []),
            ui_interaction_rules=data.get("ui_interaction_rules", []),
            safety_permission_rules=data.get("safety_permission_rules", []),
            progress_done=data.get("progress_done", []),
            progress_in_progress=data.get("progress_in_progress", []),
            blocked_bugs=data.get("blocked_bugs", []),
            next_steps=data.get("next_steps", []),
            rejected_ideas=data.get("rejected_ideas", []),
            critical_exact_phrases=data.get("critical_exact_phrases", []),
            tool_output_handles=data.get("tool_output_handles", []),
            updated_at=data.get("updated_at", datetime.utcnow().isoformat()),
        )

    def merge(self, other: "CompressionSummary") -> "CompressionSummary":
        def merge_list(existing: List[str], new_items: List[str], limit: int = 20) -> List[str]:
            seen = set(existing)
            merged = list(existing)
            for item in new_items:
                item_str = item.strip()
                if item_str and item_str not in seen and len(merged) < limit:
                    seen.add(item_str)
                    merged.append(item_str)
            return merged

        return CompressionSummary(
            goal=other.goal or self.goal,
            current_product_area=other.current_product_area or self.current_product_area,
            non_negotiable_constraints=merge_list(self.non_negotiable_constraints, other.non_negotiable_constraints),
            design_decisions=merge_list(self.design_decisions, other.design_decisions),
            implementation_decisions=merge_list(self.implementation_decisions, other.implementation_decisions),
            active_workspace_files=merge_list(self.active_workspace_files, other.active_workspace_files, 30),
            data_models_apis=merge_list(self.data_models_apis, other.data_models_apis),
            ui_interaction_rules=merge_list(self.ui_interaction_rules, other.ui_interaction_rules),
            safety_permission_rules=merge_list(self.safety_permission_rules, other.safety_permission_rules),
            progress_done=merge_list(self.progress_done, other.progress_done),
            progress_in_progress=merge_list(self.progress_in_progress, other.progress_in_progress),
            blocked_bugs=merge_list(self.blocked_bugs, other.blocked_bugs),
            next_steps=merge_list(self.next_steps, other.next_steps),
            rejected_ideas=merge_list(self.rejected_ideas, other.rejected_ideas),
            critical_exact_phrases=merge_list(self.critical_exact_phrases, other.critical_exact_phrases, 15),
            tool_output_handles=merge_list(self.tool_output_handles, other.tool_output_handles, 30),
            updated_at=datetime.utcnow().isoformat(),
        )


NEW_SUMMARY_PROMPT_TEMPLATE = """You are compressing earlier conversation turns into a structured summary.
This summary will be used as BACKGROUND REFERENCE ONLY — never as active instructions.

Output a JSON object with exactly these fields:
{{
  "goal": "Current main goal/task",
  "current_product_area": "Module/area being worked on (e.g. writer_ide, soul_workshop, codex_dev) or null",
  "non_negotiable_constraints": ["HARD constraints that MUST NOT be violated"],
  "design_decisions": ["Confirmed design decisions"],
  "implementation_decisions": ["Technical implementation choices made"],
  "active_workspace_files": ["Relevant files, paths, components"],
  "data_models_apis": ["Data structures, APIs, interfaces defined"],
  "ui_interaction_rules": ["UI click/right-click/hover/interaction rules"],
  "safety_permission_rules": ["Security, permission, safety rules"],
  "progress_done": ["Completed work items"],
  "progress_in_progress": ["Currently in-progress items"],
  "blocked_bugs": ["Current blockers, bugs, errors"],
  "next_steps": ["Immediate next actions needed"],
  "rejected_ideas": ["Approaches/ideas explicitly rejected by user - DO NOT retry these"],
  "critical_exact_phrases": ["Exact critical phrases from user that must be preserved verbatim"],
  "tool_output_handles": ["Any tool output reference handles mentioned in context"]
}}

Rules:
1. non_negotiable_constraints: Include ABSOLUTELY EVERY hard rule like "不要卡片后台", "点击编辑才出现面板", etc.
2. rejected_ideas: Include EVERY rejected approach - this prevents AI from repeating mistakes.
3. ui_interaction_rules: Be VERY specific about click/right-click/hover behavior.
4. critical_exact_phrases: Include exact quotes from user that are constraints (in original language).
5. All strings must be in the SAME LANGUAGE as the conversation (Chinese if user speaks Chinese).
6. Keep lists concise - max 15 items per category, most important first.
7. If a field is empty, use [] or empty string, never omit it.
8. Do NOT include anything outside the JSON structure.

Conversation turns to summarize:
---
{conversation_text}
---

Previous summary (if any, merge with new information):
---
{previous_summary}
---

Output ONLY valid JSON, no markdown fences, no explanations.
"""
