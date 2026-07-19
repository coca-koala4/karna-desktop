"""Karna's single model gateway and credential-validation metadata.

This module deliberately contains no desktop-only provider implementation.
Every desktop feature that needs an LLM calls the Python runtime through
``/api/model/complete`` so chat, prompt enhancement, ingest and workflows all
resolve the same provider, credential, base URL and model aliases.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import logging
import os
from pathlib import Path
from typing import Any, Dict, Iterable, Optional

from hermes_cli.config import get_hermes_home, load_config, load_env
from hermes_cli.model_normalize import normalize_model_for_provider
from hermes_cli.provider_catalog import provider_catalog_by_slug

logger = logging.getLogger(__name__)


LEGACY_MODEL_ALIASES = {
    ("deepseek", "deepseek-v4.1-pro"): "deepseek-v4-pro",
    ("deepseek", "deepseek-v4.1-fast"): "deepseek-v4-flash",
    ("deepseek", "deepseek-v4-fast"): "deepseek-v4-flash",
}


def canonical_provider(provider: str) -> str:
    raw = (provider or "").strip().lower()
    try:
        from hermes_cli.models import normalize_provider

        return normalize_provider(raw) or raw
    except Exception:
        return raw


def canonical_model(provider: str, model: str) -> str:
    p = canonical_provider(provider)
    raw = (model or "").strip()
    aliased = LEGACY_MODEL_ALIASES.get((p, raw.lower()), raw)
    return normalize_model_for_provider(aliased, p)


def provider_descriptor(provider: str):
    return provider_catalog_by_slug().get(canonical_provider(provider))


def provider_key_env(provider: str) -> str:
    descriptor = provider_descriptor(provider)
    if not descriptor or not descriptor.api_key_env_vars:
        return ""
    return descriptor.api_key_env_vars[0]


def _metadata_path() -> Path:
    return Path(get_hermes_home()) / "model-validation.json"


def _read_metadata() -> Dict[str, Any]:
    try:
        data = json.loads(_metadata_path().read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_metadata(data: Dict[str, Any]) -> None:
    path = _metadata_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temp, path)


def credential_fingerprint(value: str) -> str:
    if not value:
        return ""
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def masked_preview(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:3]}…{value[-4:]}"


def record_credential_status(
    key: str,
    value: str,
    *,
    status: str,
    source: str = "karna_store",
    message: str = "",
) -> Dict[str, Any]:
    data = _read_metadata()
    entry = {
        "source": source,
        "configured": bool(value),
        "validated": status == "valid",
        "validation_status": status,
        "last_validated_at": datetime.now(timezone.utc).isoformat() if status in {"valid", "invalid"} else None,
        "masked_preview": masked_preview(value),
        "key_fingerprint": credential_fingerprint(value),
        "message": message,
    }
    data[key] = entry
    _write_metadata(data)
    return entry


def credential_status(key: str, value: str = "") -> Dict[str, Any]:
    entry = dict(_read_metadata().get(key) or {})
    if not value:
        entry.update({"configured": False, "validated": False, "validation_status": "missing"})
        return entry
    if entry.get("key_fingerprint") != credential_fingerprint(value):
        return {
            "source": "karna_store",
            "configured": True,
            "validated": False,
            "validation_status": "pending",
            "last_validated_at": None,
            "masked_preview": masked_preview(value),
        }
    return entry


def clear_credential_status(key: str) -> None:
    data = _read_metadata()
    if key in data:
        data.pop(key, None)
        _write_metadata(data)


def classify_provider_error(exc: BaseException) -> Dict[str, Any]:
    text = str(exc)
    lower = text.lower()
    status = getattr(exc, "status_code", None)
    if status in {401, 403} or any(x in lower for x in ("unauthorized", "invalid api key", "authentication")):
        code, message = "key_invalid", "API Key 无效或没有访问权限。"
    elif status == 404 or "model_not_found" in lower or "model not found" in lower:
        code, message = "model_not_found", "供应商中不存在该模型，或当前账号无权使用。"
    elif status == 429 or "rate limit" in lower:
        code, message = "rate_limit", "请求频率受限，请稍后重试。"
    elif any(x in lower for x in ("insufficient", "quota", "balance", "credits")):
        code, message = "balance", "账号额度或余额不足。"
    elif any(x in lower for x in ("timeout", "timed out", "connection", "dns", "network")):
        code, message = "network", "无法连接供应商，请检查网络、代理和 Base URL。"
    else:
        code, message = "provider_error", "供应商请求失败。"
    return {"code": code, "message": message, "detail": text[:500], "status_code": status}


def _message_content(response: Any) -> str:
    choices = getattr(response, "choices", None) or []
    if not choices:
        return ""
    message = getattr(choices[0], "message", None)
    content = getattr(message, "content", "") if message is not None else ""
    if isinstance(content, str):
        return content
    if isinstance(content, Iterable):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.append(str(item.get("text") or ""))
            else:
                parts.append(str(getattr(item, "text", "") or ""))
        return "".join(parts)
    return str(content or "")


def _usage_dict(response: Any) -> Dict[str, int]:
    usage = getattr(response, "usage", None)
    if usage is None:
        return {}
    result = {}
    for source, target in (("prompt_tokens", "input_tokens"), ("completion_tokens", "output_tokens"), ("total_tokens", "total_tokens")):
        value = getattr(usage, source, None)
        if isinstance(value, int):
            result[target] = value
    return result


def complete_model_request(
    *,
    messages: list[dict[str, Any]],
    provider: str = "",
    model: str = "",
    base_url: str = "",
    api_key: str = "",
    max_tokens: int = 1024,
    temperature: Optional[float] = None,
    timeout: float = 60.0,
    task: str = "desktop",
) -> Dict[str, Any]:
    cfg = load_config()
    model_cfg = cfg.get("model", {}) if isinstance(cfg, dict) else {}
    if not isinstance(model_cfg, dict):
        model_cfg = {}
    resolved_provider = canonical_provider(provider or str(model_cfg.get("provider") or ""))
    resolved_model = canonical_model(resolved_provider, model or str(model_cfg.get("default") or model_cfg.get("name") or ""))
    resolved_base_url = base_url or str(model_cfg.get("base_url") or "")
    configured_api_key = api_key or str(model_cfg.get("api_key") or "")
    if not resolved_provider or not resolved_model:
        raise ValueError("尚未配置可用的模型供应商和模型。")

    logger.info(
        "model_gateway route task=%s provider=%s model=%s base_url=%s",
        task,
        resolved_provider,
        resolved_model,
        "custom" if resolved_base_url else "provider-default",
    )

    from agent.auxiliary_client import auxiliary_max_tokens_param, resolve_provider_client

    client, sdk_model = resolve_provider_client(
        resolved_provider,
        resolved_model,
        explicit_base_url=resolved_base_url or None,
        explicit_api_key=configured_api_key or None,
        task=task,
    )
    if client is None or not sdk_model:
        raise ValueError("当前供应商缺少有效凭据，请先在模型设置中完成验证。")
    kwargs: Dict[str, Any] = {
        "model": sdk_model,
        "messages": messages,
        "timeout": timeout,
    }
    kwargs.update(auxiliary_max_tokens_param(max(1, min(int(max_tokens or 1024), 32768)), model=sdk_model))
    if temperature is not None:
        kwargs["temperature"] = temperature
    response = client.chat.completions.create(**kwargs)
    return {
        "content": _message_content(response),
        "usage": _usage_dict(response),
        "provider": resolved_provider,
        "model": sdk_model,
        "gateway": "python-hermes-model-gateway",
        "fallback_used": False,
    }


def build_diagnostics() -> Dict[str, Any]:
    cfg = load_config()
    model_cfg = cfg.get("model", {}) if isinstance(cfg, dict) else {}
    if not isinstance(model_cfg, dict):
        model_cfg = {}
    provider = canonical_provider(str(model_cfg.get("provider") or ""))
    model = canonical_model(provider, str(model_cfg.get("default") or model_cfg.get("name") or "")) if provider else ""
    env = load_env()
    key_env = provider_key_env(provider)
    disk_key_value = env.get(key_env, "") if key_env else ""
    key_value = (disk_key_value or os.environ.get(key_env, "")) if key_env else ""
    aux = cfg.get("auxiliary", {}) if isinstance(cfg, dict) else {}
    stale = []
    if isinstance(aux, dict) and provider:
        for task, row in aux.items():
            if isinstance(row, dict):
                p = canonical_provider(str(row.get("provider") or "auto"))
                if p not in {"", "auto", provider}:
                    stale.append({"task": task, "provider": p, "model": str(row.get("model") or "")})
    credential = credential_status(key_env, key_value) if key_env else {"configured": provider in {"custom", "local"}, "validation_status": "not_applicable"}
    if key_env and key_value and not disk_key_value:
        credential["source"] = "windows_encrypted_store"
    return {
        "gateway": "python-hermes-model-gateway",
        "provider": provider,
        "model": model,
        "base_url": str(model_cfg.get("base_url") or ""),
        "credential_key": key_env,
        "credential": credential,
        "stale_auxiliary": stale,
        "provider_registered": bool(provider_descriptor(provider)) if provider else False,
        "catalog_size": len(provider_catalog_by_slug()),
    }
