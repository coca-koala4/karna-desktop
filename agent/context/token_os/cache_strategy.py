from __future__ import annotations

import copy
import json
import hashlib
import logging
from typing import Any, Dict, List, Optional, Tuple

from .token_models import RollingArtState
from .token_estimator import estimate_text_tokens
from .deduplicator import trim_to_budget

logger = logging.getLogger(__name__)

CACHE_BREAKPOINTS_ANTHROPIC = 4

def split_stable_volatile_prompt(parts: Dict[str, str]) -> Tuple[List[str], List[str]]:
    stable_keys = ["identity", "safety_rules", "karna_identity", "soul_methods", "tool_schema_header"]
    stable = []
    volatile = []
    for key, text in parts.items():
        if not text:
            continue
        if key in stable_keys:
            stable.append(text)
        else:
            volatile.append(text)
    return stable, volatile

def apply_provider_cache(
    messages: List[Dict[str, Any]],
    provider: str = "",
    model: str = "",
    stable_prefix_parts: Optional[List[str]] = None,
    cache_policy: str = "auto",
    native_anthropic: bool = False,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    if cache_policy != "auto":
        return messages, {"cache_applied": False, "reason": "cache disabled"}
    provider_l = (provider or "").lower()
    is_anthropic = provider_l == "anthropic" or "claude" in (model or "").lower()
    if is_anthropic:
        try:
            from agent.prompt_caching import apply_anthropic_cache_control
            cached = apply_anthropic_cache_control(
                messages, cache_ttl="5m", native_anthropic=native_anthropic
            )
            return cached, {"cache_applied": True, "provider": "anthropic", "breakpoints": CACHE_BREAKPOINTS_ANTHROPIC}
        except Exception as e:
            logger.debug("Anthropic cache apply failed: %s", e)
    return messages, {"cache_applied": False, "provider": provider_l}

def build_prompt_cache_key(provider: str, model: str, stable_hash: str, toolset_hash: str, policy_version: int, profile: str) -> str:
    raw = f"{provider}|{model}|{stable_hash}|{toolset_hash}|v{policy_version}|{profile}"
    return hashlib.sha256(raw.encode()).hexdigest()[:24]

_LAYERED_ARTIFACT_DEFAULTS = {
    "current_segment": 4000,
    "local_window": 3000,
    "chapter_summary": 1500,
    "global_state": 2000,
}

def build_layered_artifact_context(
    *,
    current_text: str = "",
    selection_start: int = -1,
    selection_end: int = -1,
    local_context_before: str = "",
    local_context_after: str = "",
    chapter_summary: str = "",
    global_state: str = "",
    rolling_state: Optional[RollingArtState] = None,
    task_type: str = "edit",
    budgets: Optional[Dict[str, int]] = None,
) -> Dict[str, str]:
    b = dict(_LAYERED_ARTIFACT_DEFAULTS)
    if budgets:
        b.update(budgets)
    parts = {}
    if task_type == "full_analysis":
        parts["global_state"] = trim_to_budget(global_state or "", b["global_state"] * 2)[0]
        parts["chapter_summary"] = trim_to_budget(chapter_summary or "", b["chapter_summary"] * 2)[0]
    else:
        parts["global_state"] = trim_to_budget(global_state or "", b["global_state"])[0]
        parts["chapter_summary"] = trim_to_budget(chapter_summary or "", b["chapter_summary"])[0]
    local_window = ""
    if local_context_before or local_context_after:
        local_window = (local_context_before or "") + "\n[SELECTION]\n" + (local_context_after or "")
        parts["local_window"] = trim_to_budget(local_window, b["local_window"])[0]
    if selection_start >= 0 and selection_end > selection_start:
        selected = current_text[selection_start:selection_end]
        parts["current_segment"] = trim_to_budget(selected, b["current_segment"])[0]
    else:
        parts["current_segment"] = trim_to_budget(current_text, b["current_segment"])[0]
    if rolling_state:
        parts["rolling_state"] = rolling_state.to_context_text()
    return parts


class DirectArtifactWriter:
    def __init__(self, base_dir: Optional[str] = None):
        import tempfile
        from agent.context.memory.memory_schema import get_context_dir
        self.base_dir = base_dir or str(get_context_dir() / "artifacts")
        import os
        os.makedirs(self.base_dir, exist_ok=True)

    def start_segmented_write(self, artifact_path: str, target_tokens: int = 0) -> Dict[str, Any]:
        import os
        target_path = os.path.abspath(artifact_path)
        target_dir = os.path.dirname(target_path) or self.base_dir
        os.makedirs(target_dir, exist_ok=True)
        handle = hashlib.sha1(target_path.encode()).hexdigest()[:10]
        tmp_path = os.path.join(target_dir, f".{os.path.basename(target_path)}.{handle}.tmp")
        # A prior interrupted run must never leak stale segments into a retry.
        with open(tmp_path, "w", encoding="utf-8"):
            pass
        return {
            "artifact_path": target_path,
            "tmp_path": tmp_path,
            "segments_written": 0,
            "target_tokens": target_tokens,
            "completed_tokens": 0,
            "status": "started",
        }

    def append_segment(self, session: Dict[str, Any], segment_text: str) -> Dict[str, Any]:
        if not segment_text:
            return session
        tmp_path = session["tmp_path"]
        with open(tmp_path, "a", encoding="utf-8") as f:
            if session["segments_written"] > 0:
                f.write("\n\n")
            f.write(segment_text)
        session["segments_written"] += 1
        session["completed_tokens"] += estimate_text_tokens(segment_text)
        return session

    def finalize(self, session: Dict[str, Any]) -> Dict[str, Any]:
        import os
        tmp = session["tmp_path"]
        target = session["artifact_path"]
        if os.path.exists(tmp):
            target_dir = os.path.dirname(target)
            if target_dir:
                os.makedirs(target_dir, exist_ok=True)
            try:
                os.replace(tmp, target)
            except OSError:
                # Cross-volume fallback still replaces atomically at the target:
                # copy to a sibling file first, then rename that sibling.
                import shutil
                sibling = f"{target}.replace-{hashlib.sha1(tmp.encode()).hexdigest()[:8]}"
                shutil.copy2(tmp, sibling)
                os.replace(sibling, target)
                os.unlink(tmp)
        session["status"] = "completed"
        return session
