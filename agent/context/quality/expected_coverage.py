"""ExpectedCoverage quality validation for compressed context.

Validates that critical information is preserved after compression.
"""
import re
from dataclasses import dataclass, field
from typing import List, Optional, Set, Tuple

# Critical patterns that MUST be preserved in summaries
CRITICAL_PATTERNS = {
    "decision": r"(?:decision|decided|will|agreed|conclusion)\s*[:\-]\s*(.{10,200})",
    "action_item": r"(?:todo|task|action item|next step|need to|must|should)\s*[:\-]?\s*(.{10,200})",
    "file_path": r"(?:[a-zA-Z]:\\|/)(?:[\w\-. ]+[\\/])+[\w\-./ ]+\.\w+",
    "code_ref": r"(?:function|class|method|def|const|import)\s+(\w{2,60})",
    "url": r"https?://[^\s<>\"]{10,300}",
    "constraint": r"(?:constraint|requirement|must (?:not )?|never|always|important|note|warning)\s*[:\-]?\s*(.{10,200})",
    "number_spec": r"(?:\d+(?:\.\d+)?)\s*(?:ms|seconds?|minutes?|hours?|days?|chars?|tokens?|bytes?|MB|GB|limit|threshold|port\b)",
    "error": r"(?:error|exception|failed|traceback|crash|bug)[^\n]{5,200}",
    "api_key_ref": r"(?:api[_-]?key|token|secret|credential|password)[^\n]{5,100}",
}

# Pin/constraint keywords with high priority
PIN_KEYWORDS = {"pinned", "remember", "keep in mind", "important:", "critical:", "constraint:", "must not", "do not", "never"}


@dataclass
class CoverageReport:
    """Report on coverage after compression."""
    pre_token_count: int = 0
    post_token_count: int = 0
    preserved_count: int = 0
    missed_count: int = 0
    missed_items: List[str] = field(default_factory=list)
    coverage_ratio: float = 1.0
    meets_threshold: bool = True
    threshold: float = 0.8

    def to_dict(self) -> dict:
        return {
            "pre_token_count": self.pre_token_count,
            "post_token_count": self.post_token_count,
            "preserved_count": self.preserved_count,
            "missed_count": self.missed_count,
            "missed_items": self.missed_items[:20],  # cap
            "coverage_ratio": self.coverage_ratio,
            "meets_threshold": self.meets_threshold,
            "threshold": self.threshold,
        }


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 chars per token."""
    if not text:
        return 0
    return max(1, len(text) // 4)


def _extract_critical_items(text: str) -> List[Tuple[str, str]]:
    """Extract (category, text) of critical items from text."""
    items = []
    if not text:
        return items
    text_lower = text.lower()
    for cat, pat in CRITICAL_PATTERNS.items():
        for m in re.finditer(pat, text, re.IGNORECASE):
            item_text = m.group(0).strip()
            if item_text:
                items.append((cat, item_text))
    # Also detect lines that contain pin keywords
    for line in text.split("\n"):
        line_lower = line.lower().strip()
        if any(kw in line_lower for kw in PIN_KEYWORDS) and len(line.strip()) > 15:
            items.append(("pin_keyword", line.strip()[:200]))
    return items


def _item_is_preserved(critical_text: str, summary_text: str) -> bool:
    """Heuristically check if a critical item is preserved in summary.

    Uses a combination of keyword overlap and substring matching.
    """
    if not critical_text or not summary_text:
        return False
    crit_lower = critical_text.lower()
    sum_lower = summary_text.lower()
    if crit_lower in sum_lower:
        return True
    # Extract substantive words (>=4 chars) from critical item
    words = re.findall(r"[a-zA-Z_][\w_\-]{3,}", crit_lower)
    # For paths/URLs/code refs, require more exact matching
    if any(c in critical_text for c in "/\\:") and len(critical_text) > 8:
        # Check for the main identifier present
        key_part = critical_text.rstrip(".,;:)\"'")[-20:]
        if key_part.lower() in sum_lower:
            return True
        # Check if key parts are there (words > 6 chars)
        key_words = [w for w in words if len(w) >= 6]
        if key_words:
            hits = sum(1 for w in key_words if w in sum_lower)
            return hits >= max(1, len(key_words) * 0.6)
    # Normal items: require 50% of key words present
    if not words:
        return False
    hits = sum(1 for w in words if w in sum_lower)
    return hits / len(words) >= 0.5


def validate_coverage(
    original_messages: List[dict],
    summary_text: str,
    preserved_messages: List[dict],
    threshold: float = 0.8,
    pinned_contexts: Optional[List[str]] = None,
) -> CoverageReport:
    """Validate that critical information from original messages is preserved.

    Args:
        original_messages: Messages before compression
        summary_text: Generated summary text
        preserved_messages: Messages that were kept as-is after compression
        threshold: Minimum coverage ratio to consider acceptable (0.0-1.0)
        pinned_contexts: Explicitly pinned content that MUST be preserved

    Returns:
        CoverageReport with details
    """
    # Build original text (user + assistant messages, excluding system prompts)
    original_parts = []
    for msg in original_messages:
        role = msg.get("role", "")
        if role in ("system",):
            continue
        content = msg.get("content", "")
        if isinstance(content, list):
            content = " ".join(
                c.get("text", str(c)) if isinstance(c, dict) else str(c) for c in content
            )
        if content:
            original_parts.append(str(content))
    original_text = "\n".join(original_parts)

    # Build preserved text
    preserved_parts = []
    for msg in preserved_messages:
        content = msg.get("content", "")
        if isinstance(content, list):
            content = " ".join(
                c.get("text", str(c)) if isinstance(c, dict) else str(c) for c in content
            )
        if content:
            preserved_parts.append(str(content))
    preserved_text = "\n".join(preserved_parts)
    combined_text = preserved_text + "\n" + (summary_text or "")

    # Extract critical items
    critical_items = _extract_critical_items(original_text)
    # Add pinned contexts as critical
    if pinned_contexts:
        for pc in pinned_contexts:
            if pc:
                critical_items.append(("pinned", pc))

    if not critical_items:
        return CoverageReport(
            pre_token_count=_estimate_tokens(original_text),
            post_token_count=_estimate_tokens(combined_text),
            preserved_count=0,
            missed_count=0,
            coverage_ratio=1.0,
            meets_threshold=True,
            threshold=threshold,
        )

    # Check each
    missed = []
    preserved = 0
    for cat, text in critical_items:
        if _item_is_preserved(text, combined_text):
            preserved += 1
        else:
            missed.append(f"[{cat}] {text[:120]}")

    total = len(critical_items)
    ratio = preserved / total if total > 0 else 1.0

    return CoverageReport(
        pre_token_count=_estimate_tokens(original_text),
        post_token_count=_estimate_tokens(combined_text),
        preserved_count=preserved,
        missed_count=len(missed),
        missed_items=missed,
        coverage_ratio=ratio,
        meets_threshold=ratio >= threshold,
        threshold=threshold,
    )
