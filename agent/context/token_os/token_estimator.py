from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

def estimate_text_tokens(text: str) -> int:
    if not text:
        return 0
    cn_chars = len(re.findall(r'[\u4e00-\u9fff\u3400-\u4dbf]', text))
    ascii_chars = len(re.findall(r'[a-zA-Z0-9]', text))
    other_chars = len(text) - cn_chars - ascii_chars
    return max(1, cn_chars + (ascii_chars + 3) // 4 + other_chars // 2)


def estimate_json_tokens(obj: Any) -> int:
    import json
    try:
        s = json.dumps(obj, ensure_ascii=False, default=str)
    except Exception:
        s = str(obj)
    return estimate_text_tokens(s)


def estimate_messages_tokens(messages: List[Dict[str, Any]]) -> int:
    total = 0
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, str):
            total += estimate_text_tokens(content)
        elif isinstance(content, list):
            for part in content:
                if isinstance(part, dict):
                    if part.get("type") == "text":
                        total += estimate_text_tokens(part.get("text", ""))
                    elif part.get("type") == "tool_use" or part.get("type") == "tool_calls":
                        total += estimate_json_tokens(part)
                    elif part.get("type") == "tool_result":
                        tc = part.get("content", "")
                        if isinstance(tc, str):
                            total += estimate_text_tokens(tc)
                        else:
                            total += estimate_json_tokens(tc)
                    else:
                        total += estimate_json_tokens(part)
                else:
                    total += estimate_text_tokens(str(part))
        role = msg.get("role", "")
        total += 4
        if role == "system":
            total += 2
    return total + len(messages) * 2


def estimate_tool_schema_tokens(tools: List[Dict[str, Any]], tool_names: Optional[List[str]] = None) -> int:
    if tool_names is not None:
        selected = []
        wanted = set(tool_names)
        for t in tools:
            fn = t.get("function") if isinstance(t, dict) else None
            name = ""
            if isinstance(fn, dict):
                name = fn.get("name", "")
            elif isinstance(t, dict):
                name = t.get("name", "")
            if name in wanted or name == "tool_search":
                selected.append(t)
        tools = selected
    return estimate_json_tokens(tools)


def estimate_context_breakdown(
    system_text: str = "",
    task_root: str = "",
    pinned_text: str = "",
    artifact_text: str = "",
    recent_messages: Optional[List[Dict[str, Any]]] = None,
    summary_text: str = "",
    retrieval_text: str = "",
    upstream_text: str = "",
    tools: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, int]:
    return {
        "system": estimate_text_tokens(system_text),
        "task_root": estimate_text_tokens(task_root),
        "pinned": estimate_text_tokens(pinned_text),
        "active_artifact": estimate_text_tokens(artifact_text),
        "recent_messages": estimate_messages_tokens(recent_messages or []),
        "summary": estimate_text_tokens(summary_text),
        "retrieval": estimate_text_tokens(retrieval_text),
        "upstream": estimate_text_tokens(upstream_text),
        "tool_schema": estimate_tool_schema_tokens(tools or []),
    }
