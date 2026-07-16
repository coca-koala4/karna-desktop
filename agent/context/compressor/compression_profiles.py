from dataclasses import dataclass, field
from typing import Optional, Dict, Any


@dataclass
class CompressionProfile:
    name: str
    threshold: float
    target_ratio: float
    protect_last_n: int
    max_summary_ratio: float
    max_summary_tokens: int

    protect_task_root: bool = False
    protect_active_file_context: bool = False
    protect_latest_error: bool = False
    protect_latest_patch_summary: bool = False
    protect_latest_user_prompt: bool = False
    protect_pinned_constraints: bool = False
    protect_active_soul_state: bool = False
    summarize_node_runs: bool = False
    externalize_search_results: bool = False


DEFAULT_PROFILES: Dict[str, CompressionProfile] = {
    "general_writing": CompressionProfile(
        name="general_writing",
        threshold=0.55,
        target_ratio=0.25,
        protect_last_n=20,
        max_summary_ratio=0.06,
        max_summary_tokens=6000,
        protect_task_root=True,
        protect_active_file_context=True,
        protect_pinned_constraints=True,
        protect_latest_user_prompt=True,
    ),
    "agent_chat": CompressionProfile(
        name="agent_chat",
        threshold=0.60,
        target_ratio=0.25,
        protect_last_n=20,
        max_summary_ratio=0.05,
        max_summary_tokens=4000,
    ),
    "longform_writing": CompressionProfile(
        name="longform_writing",
        threshold=0.55,
        target_ratio=0.30,
        protect_last_n=24,
        max_summary_ratio=0.08,
        max_summary_tokens=8000,
        protect_task_root=True,
        protect_active_file_context=True,
        protect_pinned_constraints=True,
        protect_latest_user_prompt=True,
    ),
    "edit_review": CompressionProfile(
        name="edit_review",
        threshold=0.50,
        target_ratio=0.30,
        protect_last_n=24,
        max_summary_ratio=0.05,
        max_summary_tokens=8000,
        protect_latest_error=True,
        protect_pinned_constraints=True,
        protect_latest_user_prompt=True,
    ),
    "research": CompressionProfile(
        name="research",
        threshold=0.45,
        target_ratio=0.20,
        protect_last_n=16,
        max_summary_ratio=0.05,
        max_summary_tokens=6000,
        externalize_search_results=True,
    ),
    "multi_agent_flow": CompressionProfile(
        name="multi_agent_flow",
        threshold=0.45,
        target_ratio=0.20,
        protect_last_n=16,
        max_summary_ratio=0.05,
        max_summary_tokens=4000,
        summarize_node_runs=True,
    ),
    "soul_workshop": CompressionProfile(
        name="soul_workshop",
        threshold=0.50,
        target_ratio=0.25,
        protect_last_n=20,
        max_summary_ratio=0.06,
        max_summary_tokens=6000,
        protect_pinned_constraints=True,
        protect_active_soul_state=True,
    ),
    "codex_dev": CompressionProfile(
        name="codex_dev",
        threshold=0.50,
        target_ratio=0.25,
        protect_last_n=24,
        max_summary_ratio=0.07,
        max_summary_tokens=6000,
        protect_latest_error=True,
        protect_latest_patch_summary=True,
        protect_latest_user_prompt=True,
    ),
    "translation": CompressionProfile(
        name="translation",
        threshold=0.50,
        target_ratio=0.20,
        protect_last_n=10,
        max_summary_ratio=0.05,
        max_summary_tokens=4000,
        protect_pinned_constraints=True,
        protect_latest_user_prompt=True,
    ),
    "academic": CompressionProfile(
        name="academic",
        threshold=0.45,
        target_ratio=0.25,
        protect_last_n=25,
        max_summary_ratio=0.06,
        max_summary_tokens=6000,
        protect_task_root=True,
        protect_pinned_constraints=True,
        protect_active_file_context=True,
        externalize_search_results=True,
    ),
    "technical_writing": CompressionProfile(
        name="technical_writing",
        threshold=0.50,
        target_ratio=0.25,
        protect_last_n=25,
        max_summary_ratio=0.06,
        max_summary_tokens=6000,
        protect_task_root=True,
        protect_active_file_context=True,
        protect_latest_patch_summary=True,
    ),
}


def resolve_compression_profile(
    session_mode: Optional[str] = None,
    task_type: Optional[str] = None,
    writing_domain: Optional[str] = None,
) -> str:
    if task_type == "codex_dev":
        return "codex_dev"
    if task_type == "research":
        return "research"
    if task_type == "edit_review":
        return "edit_review"
    if task_type == "longform_writing":
        return "longform_writing"
    if task_type == "translation":
        return "translation"
    if session_mode == "writer_ide":
        return "longform_writing"
    if session_mode == "soul_workshop":
        return "soul_workshop"
    if session_mode == "multi_agent_flow":
        return "multi_agent_flow"
    if writing_domain in ("fiction", "screenplay", "poetry"):
        return "longform_writing"
    if writing_domain in ("academic",):
        return "academic"
    if writing_domain in ("technical_writing", "legal_policy"):
        return "technical_writing"
    if writing_domain in ("journalism", "marketing_brand"):
        return "edit_review"
    if writing_domain == "translation":
        return "translation"
    return "agent_chat"


def get_profile(
    profile_name: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
) -> CompressionProfile:
    name = profile_name or "agent_chat"

    if name in DEFAULT_PROFILES:
        profile = DEFAULT_PROFILES[name]
    else:
        profile = DEFAULT_PROFILES["agent_chat"]

    if config and isinstance(config, dict):
        profiles_cfg = config.get("compression", {}).get("profiles", {})
        if isinstance(profiles_cfg, dict) and name in profiles_cfg:
            profile_cfg = profiles_cfg[name]
            if isinstance(profile_cfg, dict):
                return _merge_profile(profile, profile_cfg)

    return profile


def _merge_profile(base: CompressionProfile, overrides: Dict[str, Any]) -> CompressionProfile:
    from dataclasses import replace

    valid_fields = {f.name for f in CompressionProfile.__dataclass_fields__.values()}
    update = {}
    for k, v in overrides.items():
        if k in valid_fields and v is not None:
            update[k] = v
    return replace(base, **update) if update else base


def get_gateway_hygiene_config(config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    default = {
        "enabled": True,
        "threshold": 0.80,
        "min_history_messages": 4,
    }
    if config and isinstance(config, dict):
        gw_cfg = config.get("compression", {}).get("gateway", {})
        if isinstance(gw_cfg, dict):
            for k in default:
                if k in gw_cfg and gw_cfg[k] is not None:
                    default[k] = gw_cfg[k]
    return default
