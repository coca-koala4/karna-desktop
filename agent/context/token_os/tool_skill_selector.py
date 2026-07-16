from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

INTENT_KEYWORDS = {
    "file_write": {"write", "create", "save", "edit", "modify", "patch", "append", "create file", "write to", "overwrite", "delete file", "rename"},
    "file_read": {"read", "open", "view", "show", "cat", "list", "dir", "ls", "find", "search file", "glob"},
    "web_search": {"search", "google", "find online", "look up", "browse", "web", "internet", "fetch url", "http"},
    "terminal": {"run", "execute", "command", "terminal", "shell", "bash", "npm", "pip", "install", "build", "test"},
    "code": {"code", "function", "class", "bug", "error", "fix", "refactor", "implement", "debug", "syntax", "compile"},
    "memory": {"remember", "save memory", "note", "pin", "constraint", "decision", "preference", "recall"},
    "delegation": {"delegate", "spawn agent", "sub-agent", "worker", "multi-agent", "workflow", "parallel"},
    "mcp": {"mcp", "feishu", "discord", "slack", "notion"},
    "clarify": {"clarify", "confirm", "ask", "question", "help"},
    "todo": {"todo", "task", "plan", "step"},
    "skill": {"skill", "specialized", "invoke skill"},
}

CATEGORY_TO_TOOLS = {
    "file_write": ["write_file", "patch", "edit_file", "create_file", "append_file", "replace_in_file"],
    "file_read": ["read_file", "list_dir", "search_files", "glob", "find_files", "view_file", "codebase_search"],
    "web_search": ["web_search", "web_fetch", "browser_navigate", "fetch_url", "x_search"],
    "terminal": ["run_terminal_cmd", "terminal", "execute_command", "run_command"],
    "code": ["search_codebase", "grep_search", "problemas", "get_diagnostics"],
    "memory": ["memory_add", "pin_context", "add_decision", "memory_search"],
    "delegation": ["delegate_task", "spawn_worker"],
    "mcp": ["mcp_list", "mcp_call"],
    "clarify": ["clarify", "ask_user"],
    "todo": ["todo_write", "update_todo"],
    "skill": ["invoke_skill", "list_skills"],
}


def classify_intent(instruction: str) -> List[str]:
    if not instruction:
        return ["file_read", "file_write", "terminal"]
    text = instruction.lower()
    categories = []
    for cat, keywords in INTENT_KEYWORDS.items():
        for kw in keywords:
            if kw in text:
                categories.append(cat)
                break
    if not categories:
        if any(c in text for c in ("代码", "文件", "bug", "修复", "编写")):
            categories.extend(["file_read", "file_write", "terminal"])
        elif any(c in text for c in ("写", "创作", "创作", "小说", "章节", "论文")):
            categories.extend(["file_read", "file_write"])
        else:
            categories.extend(["file_read", "file_write", "terminal"])
    if "code" in categories and "file_read" not in categories:
        categories.append("file_read")
    return list(dict.fromkeys(categories))


def select_tool_schemas(
    all_tools: List[Dict[str, Any]],
    instruction: str = "",
    module: str = "",
    max_budget_tokens: int = 0,
    always_include: Optional[List[str]] = None,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    from .token_estimator import estimate_tool_schema_tokens
    wanted = set(always_include or [])
    wanted.add("tool_search")
    wanted.add("clarify")
    # Skill bodies are already lazy-loaded by Hermes; keep only the tiny index
    # and loader tools available so relevant skills can still be fetched after
    # the full tool schema set is pruned.
    wanted.update({"skill_view", "skills_list", "invoke_skill", "list_skills"})

    intents = classify_intent(instruction)

    if module in ("writer_ide", "longform_writing"):
        wanted.update(CATEGORY_TO_TOOLS["file_read"])
        wanted.update(CATEGORY_TO_TOOLS["file_write"])
        wanted.update(CATEGORY_TO_TOOLS["memory"])
        wanted.update(CATEGORY_TO_TOOLS["todo"])
        wanted.difference_update({"run_terminal_cmd", "execute_command", "browser_navigate", "web_search"})
    elif module in ("research",):
        wanted.update(CATEGORY_TO_TOOLS["web_search"])
        wanted.update(CATEGORY_TO_TOOLS["file_read"])
        wanted.update(CATEGORY_TO_TOOLS["memory"])
    elif module in ("multi_agent_flow",):
        wanted.update(CATEGORY_TO_TOOLS["delegation"])
        wanted.update(CATEGORY_TO_TOOLS["file_read"])
        wanted.update(CATEGORY_TO_TOOLS["file_write"])
        wanted.update(CATEGORY_TO_TOOLS["memory"])
    else:
        for intent in intents:
            wanted.update(CATEGORY_TO_TOOLS.get(intent, []))

    def tool_name(t: Dict[str, Any]) -> str:
        fn = t.get("function") if isinstance(t, dict) else None
        if isinstance(fn, dict):
            return str(fn.get("name") or "")
        return str(t.get("name") or "")

    selected = []
    selected_names = set()
    for t in all_tools:
        name = tool_name(t)
        if name in wanted and name not in selected_names:
            selected.append(t)
            selected_names.add(name)

    if not selected:
        selected = all_tools[:]
        reasons = ["no specific intent matched; sending full toolset"]
    else:
        reasons = [f"intent={','.join(intents)}; selected {len(selected)}/{len(all_tools)} tools"]

    if max_budget_tokens > 0:
        while estimate_tool_schema_tokens(selected) > max_budget_tokens and len(selected) > 5:
            non_essential = [t for t in selected if tool_name(t) not in {"tool_search", "clarify", "write_file", "read_file"}]
            if not non_essential:
                break
            selected.remove(non_essential[-1])

    return selected, reasons


def select_skills(
    available_skills: List[Dict[str, Any]],
    instruction: str = "",
    module: str = "",
    writing_domain: str = "",
    max_skills: int = 3,
) -> List[Dict[str, Any]]:
    if not available_skills:
        return []
    scored = []
    text = (instruction or "").lower()
    for skill in available_skills:
        name = (skill.get("name") or "").lower()
        desc = (skill.get("description") or "").lower()
        domains = [d.lower() for d in (skill.get("domains") or [])]
        modules = [m.lower() for m in (skill.get("modules") or [])]
        score = 0
        if module and module.lower() in modules:
            score += 5
        if writing_domain and writing_domain.lower() in domains:
            score += 5
        for word in name.split("-") + name.split("_"):
            if word and word in text:
                score += 2
        for word in desc.split():
            w = word.strip(".,;:!?").lower()
            if len(w) > 4 and w in text:
                score += 1
        scored.append((score, skill))
    scored.sort(key=lambda x: -x[0])
    selected = [s for score, s in scored if score > 0][:max_skills]
    if not selected and available_skills:
        for s in available_skills:
            if s.get("default"):
                selected.append(s)
                if len(selected) >= min(2, max_skills):
                    break
    return selected[:max_skills]
