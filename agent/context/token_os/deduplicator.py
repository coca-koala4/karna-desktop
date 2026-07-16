from __future__ import annotations

import re
import hashlib
from typing import Any, Dict, List, Tuple

def normalize_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r'\s+', ' ', text).strip()
    return text.lower()

def text_hash(text: str) -> str:
    return hashlib.md5(normalize_text(text).encode('utf-8', errors='replace')).hexdigest()[:12]

def dedupe_text_blocks(blocks: List[Tuple[str, str]]) -> List[Tuple[str, str]]:
    seen_hashes = set()
    result = []
    for label, text in blocks:
        if not text:
            continue
        h = text_hash(text)
        if h not in seen_hashes:
            seen_hashes.add(h)
            result.append((label, text))
    return result

def dedupe_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    seen = set()
    deduped = []
    error_counts: Dict[str, int] = {}
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, list):
            text_parts = []
            for p in content:
                if isinstance(p, dict) and p.get("type") == "text":
                    text_parts.append(p.get("text", ""))
            content_text = "\n".join(text_parts)
        else:
            content_text = content or ""
        role = msg.get("role", "")
        if role == "tool" and isinstance(msg.get("content"), str):
            err_key = content_text[:200]
            if "Error" in content_text or "Traceback" in content_text or "error" in content_text.lower():
                error_counts[err_key] = error_counts.get(err_key, 0) + 1
                if error_counts[err_key] > 1:
                    continue
        h = text_hash(f"{role}:{content_text[:500]}")
        if h not in seen:
            seen.add(h)
            deduped.append(msg)
    return deduped

def find_overlap(a: str, b: str, min_overlap: int = 50) -> int:
    if not a or not b:
        return 0
    a_norm = normalize_text(a)
    b_norm = normalize_text(b)
    if len(a_norm) < min_overlap or len(b_norm) < min_overlap:
        return 0
    max_possible = min(len(a_norm), len(b_norm), 2000)
    for size in range(max_possible, min_overlap - 1, -1):
        if a_norm[-size:] == b_norm[:size]:
            return size
    return 0

def compute_rag_overlap(rag_text: str, artifact_text: str) -> Tuple[int, str]:
    if not rag_text or not artifact_text:
        return 0, rag_text
    rag_sentences = re.split(r'(?<=[。！？.!?])\s+', rag_text)
    artifact_norm = normalize_text(artifact_text)
    kept = []
    saved = 0
    for sent in rag_sentences:
        sent_norm = normalize_text(sent)
        if len(sent_norm) < 20:
            kept.append(sent)
            continue
        if sent_norm[:100] in artifact_norm:
            saved += len(sent)
            continue
        overlap = find_overlap(sent, artifact_text, 30)
        if overlap > len(sent) * 0.7:
            saved += len(sent)
            continue
        kept.append(sent)
    return saved, "\n".join(kept)

def compute_diff_patch(original: str, modified: str, context_lines: int = 2) -> str:
    import difflib
    if not original or not modified:
        return modified or ""
    orig_lines = original.splitlines(keepends=True)
    mod_lines = modified.splitlines(keepends=True)
    diff = difflib.unified_diff(orig_lines, mod_lines, n=context_lines, lineterm="")
    lines = list(diff)
    if not lines:
        return ""
    header_end = 0
    for i, line in enumerate(lines):
        if line.startswith("@@"):
            header_end = i
            break
    return "".join(lines[header_end:])

def trim_to_budget(text: str, budget_tokens: int, reserve_end: bool = True) -> Tuple[str, bool]:
    from .token_estimator import estimate_text_tokens
    if estimate_text_tokens(text) <= budget_tokens:
        return text, False
    if reserve_end and len(text) > 200:
        head_ratio = 0.4
        head_chars = int(len(text) * head_ratio)
        tail_chars = len(text) - head_chars
        target_chars = budget_tokens * 3
        head = text[:head_chars][:int(target_chars * head_ratio)]
        tail_budget = target_chars - len(head)
        tail = text[-tail_chars:][-tail_budget:]
        return head + "\n...[truncated]...\n" + tail, True
    chars = budget_tokens * 3
    return text[:chars] + "\n...[truncated]...", True

def extract_window_around_selection(text: str, selection_start: int, selection_end: int, window_tokens: int = 800) -> str:
    if not text:
        return ""
    from .token_estimator import estimate_text_tokens
    if selection_start < 0:
        selection_start = 0
    if selection_end <= selection_start:
        return trim_to_budget(text, window_tokens, reserve_end=False)[0]
    sel_text = text[selection_start:selection_end]
    pre_text = text[:selection_start]
    post_text = text[selection_end:]
    pre_tokens = estimate_text_tokens(pre_text)
    post_tokens = estimate_text_tokens(post_text)
    sel_tokens = estimate_text_tokens(sel_text)
    remaining = window_tokens - sel_tokens
    if remaining <= 0:
        return sel_text
    pre_budget = min(pre_tokens, remaining // 2)
    post_budget = min(post_tokens, remaining - pre_budget)
    pre_trimmed, _ = trim_to_budget(pre_text, pre_budget, reserve_end=True)
    post_trimmed, _ = trim_to_budget(post_text, post_budget, reserve_end=False)
    return pre_trimmed + sel_text + post_trimmed
