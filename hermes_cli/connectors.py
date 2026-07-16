"""Writer OS connector registry, instances, credentials, discovery and routing.

This module intentionally sits beside the existing Hermes MCP implementation. It
wraps the current ``mcp_servers`` runtime where possible, while exposing a
Writer-OS-facing connector model for the Karna connector workshop.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import secrets
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

from fastapi import HTTPException

from hermes_cli.config import get_hermes_home, load_config, save_config

PROJECT_ROOT = Path(__file__).parent.parent.resolve()
REGISTRY_PATH = PROJECT_ROOT / "config" / "connector_registry.json"
ADVANCED_REGISTRY_PATH = PROJECT_ROOT / "config" / "connector_advanced_registry.json"

CATEGORIES = {
    "creative_core",
    "docs_storage",
    "research",
    "collaboration",
    "scene_reality",
    "publishing",
}
TYPES = {"builtin", "mcp_stdio", "mcp_sse", "mcp_http", "oauth", "api_key", "local_path"}
STATUSES = {"available", "beta", "coming_soon", "experimental"}
PRIORITIES = {"S", "A", "B", "C"}
RISK = {"low", "medium", "high"}

SECRET_FIELD_HINTS = ("token", "key", "secret", "password", "credential")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _data_dir() -> Path:
    path = get_hermes_home() / "connector-workshop"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _instances_path() -> Path:
    return _data_dir() / "instances.json"


def _credentials_path() -> Path:
    return _data_dir() / "credentials.json"


def _audit_path() -> Path:
    return _data_dir() / "audit_logs.jsonl"


def _read_json_file(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"Invalid connector data file {path.name}: {exc}")


def _write_json_file(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def _normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _safe_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


def _redact_value(value: Any) -> Any:
    if value in (None, ""):
        return ""
    text = str(value)
    if len(text) <= 8:
        return "••••"
    return f"{text[:3]}••••{text[-3:]}"


def redact_auth(payload: Dict[str, Any] | None) -> Dict[str, Any]:
    result: Dict[str, Any] = {}
    for key, value in (payload or {}).items():
        if any(hint in key.lower() for hint in SECRET_FIELD_HINTS):
            result[key] = _redact_value(value)
        else:
            result[key] = value
    return result


def _redact_deep(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            key: (_redact_value(val) if any(hint in str(key).lower() for hint in SECRET_FIELD_HINTS) else _redact_deep(val))
            for key, val in value.items()
        }
    if isinstance(value, list):
        return [_redact_deep(item) for item in value]
    return value


def _summary(value: Any, limit: int = 500) -> str:
    return json.dumps(_redact_deep(value), ensure_ascii=False)[:limit]


def _vault_key() -> bytes:
    home = str(get_hermes_home()).encode("utf-8", errors="ignore")
    return hashlib.sha256(home + b"::karna-connector-vault-v1").digest()


def _xor_bytes(data: bytes, key: bytes) -> bytes:
    return bytes(byte ^ key[i % len(key)] for i, byte in enumerate(data))


def _encrypt_payload(payload: Dict[str, Any]) -> str:
    raw = json.dumps(payload or {}, ensure_ascii=False, sort_keys=True).encode("utf-8")
    return base64.urlsafe_b64encode(_xor_bytes(raw, _vault_key())).decode("ascii")


def _decrypt_payload(value: str) -> Dict[str, Any]:
    try:
        raw = _xor_bytes(base64.urlsafe_b64decode(value.encode("ascii")), _vault_key())
        decoded = json.loads(raw.decode("utf-8"))
        return decoded if isinstance(decoded, dict) else {}
    except Exception:
        return {}


def validate_definition(defn: Dict[str, Any]) -> List[str]:
    issues: List[str] = []
    required = ["id", "name", "displayName", "description", "category", "provider", "type", "priority", "status", "auth", "permissions", "toolsPreview", "dataPolicy"]
    for key in required:
        if key not in defn:
            issues.append(f"missing {key}")
    if defn.get("category") not in CATEGORIES:
        issues.append("invalid category")
    if defn.get("type") not in TYPES:
        issues.append("invalid type")
    if defn.get("priority") not in PRIORITIES:
        issues.append("invalid priority")
    if defn.get("status") not in STATUSES:
        issues.append("invalid status")
    auth = defn.get("auth")
    if not isinstance(auth, dict) or not isinstance(auth.get("fields", []), list):
        issues.append("invalid auth")
    if not isinstance(defn.get("permissions"), list):
        issues.append("invalid permissions")
    if not isinstance(defn.get("toolsPreview"), list):
        issues.append("invalid toolsPreview")
    policy = defn.get("dataPolicy")
    if not isinstance(policy, dict) or policy.get("riskLevel") not in RISK:
        issues.append("invalid dataPolicy")
    return issues


def load_definitions() -> List[Dict[str, Any]]:
    data = _read_json_file(REGISTRY_PATH, [])
    if not isinstance(data, list):
        raise HTTPException(status_code=500, detail="connector_registry.json must be a list")
    seen: set[str] = set()
    result: List[Dict[str, Any]] = []
    errors: List[str] = []
    for idx, item in enumerate(data):
        if not isinstance(item, dict):
            errors.append(f"#{idx}: entry must be object")
            continue
        cid = _normalize_text(item.get("id"))
        if not cid:
            errors.append(f"#{idx}: id required")
            continue
        if cid in seen:
            errors.append(f"{cid}: duplicate id")
            continue
        seen.add(cid)
        issues = validate_definition(item)
        if issues:
            errors.append(f"{cid}: {', '.join(issues)}")
        result.append(item)
    if errors:
        raise HTTPException(status_code=500, detail="Invalid connector registry: " + "; ".join(errors[:8]))
    return result


def load_advanced_definitions() -> List[Dict[str, Any]]:
    data = _read_json_file(ADVANCED_REGISTRY_PATH, [])
    if not isinstance(data, list):
        raise HTTPException(status_code=500, detail="connector_advanced_registry.json must be a list")
    seen: set[str] = set()
    result: List[Dict[str, Any]] = []
    errors: List[str] = []
    for idx, item in enumerate(data):
        if not isinstance(item, dict):
            errors.append(f"#{idx}: entry must be object")
            continue
        cid = _normalize_text(item.get("id"))
        if not cid:
            errors.append(f"#{idx}: id required")
            continue
        if cid in seen:
            errors.append(f"{cid}: duplicate id")
            continue
        seen.add(cid)
        issues = validate_definition(item)
        if issues:
            errors.append(f"{cid}: {', '.join(issues)}")
        result.append(item)
    if errors:
        raise HTTPException(status_code=500, detail="Invalid advanced connector registry: " + "; ".join(errors[:8]))
    return result


def load_all_definitions() -> List[Dict[str, Any]]:
    return load_definitions() + load_advanced_definitions()


def get_definition(connector_id: str) -> Dict[str, Any]:
    for item in load_all_definitions():
        if item.get("id") == connector_id:
            return item
    raise HTTPException(status_code=404, detail=f"Unknown connector: {connector_id}")


def query_advanced_definitions(phase: Optional[str] = None, category: Optional[str] = None, q: Optional[str] = None) -> List[Dict[str, Any]]:
    items = load_advanced_definitions()
    if phase:
        items = [d for d in items if str(d.get("phase", "")).lower() == str(phase).lower()]
    if category and category != "all":
        items = [d for d in items if d.get("category") == category]
    needle = _normalize_text(q).lower()
    if needle:
        def matches(d: Dict[str, Any]) -> bool:
            hay = " ".join(str(d.get(k, "")) for k in ("id", "name", "displayName", "description", "provider", "phase")).lower()
            return needle in hay
        items = [d for d in items if matches(d)]
    return items


def query_definitions(category: Optional[str] = None, q: Optional[str] = None) -> List[Dict[str, Any]]:
    items = load_definitions()
    if category and category != "all":
        items = [d for d in items if d.get("category") == category]
    needle = _normalize_text(q).lower()
    if needle:
        def matches(d: Dict[str, Any]) -> bool:
            hay = " ".join(str(d.get(k, "")) for k in ("id", "name", "displayName", "description", "provider")).lower()
            return needle in hay
        items = [d for d in items if matches(d)]
    return items


def _load_instances() -> List[Dict[str, Any]]:
    data = _read_json_file(_instances_path(), [])
    return data if isinstance(data, list) else []


def _save_instances(items: List[Dict[str, Any]]) -> None:
    _write_json_file(_instances_path(), items)


def _load_credentials() -> Dict[str, Dict[str, Any]]:
    data = _read_json_file(_credentials_path(), {})
    return data if isinstance(data, dict) else {}


def _save_credentials(data: Dict[str, Dict[str, Any]]) -> None:
    _write_json_file(_credentials_path(), data)


def save_credential(instance_id: str, payload: Dict[str, Any]) -> str:
    creds = _load_credentials()
    ref = f"cred_{instance_id}"
    now = _now()
    prev = creds.get(ref, {})
    creds[ref] = {
        "id": ref,
        "connector_instance_id": instance_id,
        "encrypted_payload": _encrypt_payload(payload),
        "created_at": prev.get("created_at") or now,
        "updated_at": now,
    }
    _save_credentials(creds)
    return ref


def get_credential(instance: Dict[str, Any]) -> Dict[str, Any]:
    ref = instance.get("authRef")
    if not ref:
        return {}
    row = _load_credentials().get(ref)
    if not row:
        return {}
    return _decrypt_payload(str(row.get("encrypted_payload") or ""))


def delete_credential(instance: Dict[str, Any]) -> None:
    ref = instance.get("authRef")
    if not ref:
        return
    creds = _load_credentials()
    if ref in creds:
        del creds[ref]
        _save_credentials(creds)


def clear_instance_credential(instance_id: str) -> Dict[str, Any]:
    items = _load_instances()
    for index, item in enumerate(items):
        if item.get("id") != instance_id:
            continue
        delete_credential(item)
        item = {**item, "authRef": "", "credentialStored": False, "updatedAt": _now()}
        items[index] = item
        _save_instances(items)
        _audit({"connectorInstanceId": instance_id, "toolName": "connector.credential.delete", "status": "success"})
        return public_instance(item)
    raise HTTPException(status_code=404, detail=f"Connector instance not found: {instance_id}")


def _definition_for_instance(instance: Dict[str, Any]) -> Dict[str, Any]:
    if instance.get("customDefinition"):
        return instance["customDefinition"]
    return get_definition(str(instance.get("connectorId") or ""))


def _tool_id(instance_id: str, tool_name: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9_.-]+", "_", tool_name).strip("_") or "tool"
    return f"tool_{instance_id}_{slug}"


def _preview_tools(defn: Dict[str, Any], instance_id: str) -> List[Dict[str, Any]]:
    tools: List[Dict[str, Any]] = []
    for item in defn.get("toolsPreview") or []:
        if not isinstance(item, dict):
            continue
        name = _normalize_text(item.get("name"))
        if not name:
            continue
        tools.append({
            "id": _tool_id(instance_id, name),
            "connectorInstanceId": instance_id,
            "name": name,
            "description": _normalize_text(item.get("description")),
            "inputSchema": item.get("inputSchema") if isinstance(item.get("inputSchema"), dict) else {},
            "riskLevel": item.get("riskLevel") if item.get("riskLevel") in RISK else defn.get("dataPolicy", {}).get("riskLevel", "low"),
            "enabled": item.get("enabled", True) is not False,
            "source": "preview",
        })
    return tools


def _preview_tool_meta(defn: Dict[str, Any], tool_name: str) -> Dict[str, Any]:
    for item in defn.get("toolsPreview") or []:
        if isinstance(item, dict) and item.get("name") == tool_name:
            return item
    return {}


def _mcp_config_from_definition(defn: Dict[str, Any], auth: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    server = dict(defn.get("server") or defn.get("mcpServer") or {})
    ctype = defn.get("type")
    if not server and ctype not in {"mcp_stdio", "mcp_sse", "mcp_http"}:
        return None
    transport = server.get("transport") or {"mcp_stdio": "stdio", "mcp_sse": "sse", "mcp_http": "http"}.get(str(ctype), "http")
    cfg: Dict[str, Any] = {}
    if transport == "stdio":
        cfg["command"] = auth.get("command") or server.get("command")
        cfg["args"] = auth.get("args") or server.get("args") or []
        args = cfg.get("args") or []
        if cfg.get("command") == "python" and len(args) >= 2 and args[0] == "-m" and str(args[1]).startswith("tools.connector_servers."):
            cfg["command"] = sys.executable
    else:
        cfg["url"] = auth.get("serverUrl") or auth.get("url") or server.get("url")
        if isinstance(cfg.get("url"), str) and "your-" in cfg["url"]:
            return None
        if transport == "sse":
            cfg["transport"] = "sse"
    env = dict(server.get("env") or {})
    user_env = auth.get("env") if isinstance(auth.get("env"), dict) else {}
    env.update(user_env)
    for key, value in list(env.items()):
        if isinstance(value, str):
            for auth_key, auth_value in auth.items():
                value = value.replace("${" + str(auth_key) + "}", str(auth_value))
            env[key] = value
    if env:
        cfg["env"] = env
    timeout_ms = server.get("timeoutMs")
    if timeout_ms:
        try:
            cfg["timeout"] = max(1, int(timeout_ms) // 1000)
        except Exception:
            pass
    return cfg


def _stdio_env(cfg: Dict[str, Any]) -> Dict[str, str]:
    env = os.environ.copy()
    env.update({str(k): str(v) for k, v in (cfg.get("env") or {}).items()})
    existing = env.get("PYTHONPATH", "")
    root = str(PROJECT_ROOT)
    env["PYTHONPATH"] = root if not existing else root + os.pathsep + existing
    return env


def _jsonrpc_stdio_request(
    cfg: Dict[str, Any],
    requests: List[Dict[str, Any]],
    timeout: float = 8,
) -> List[Dict[str, Any]]:
    command = cfg.get("command")
    if not command:
        raise ValueError("stdio MCP config missing command")
    proc = subprocess.Popen(
        [str(command), *[str(arg) for arg in (cfg.get("args") or [])]],
        cwd=str(PROJECT_ROOT),
        env=_stdio_env(cfg),
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    try:
        stdin_payload = "".join(json.dumps(req, ensure_ascii=False) + "\n" for req in requests)
        stdout, stderr = proc.communicate(stdin_payload, timeout=timeout)
        responses: List[Dict[str, Any]] = []
        wanted_ids = {req.get("id") for req in requests if req.get("id") is not None}
        for line in stdout.splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            if row.get("id") in wanted_ids:
                responses.append(row)
                wanted_ids.discard(row.get("id"))
        if wanted_ids:
            err = (stderr or "").strip()
            raise RuntimeError(err or f"stdio server closed before responses: {sorted(wanted_ids)}")
        return responses
    except subprocess.TimeoutExpired:
        try:
            proc.kill()
        except Exception:
            pass
        raise TimeoutError("stdio MCP probe timed out") from None
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass
        raise
    finally:
        try:
            if proc.poll() is None:
                proc.terminate()
                proc.wait(timeout=1)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass


def _probe_stdio_jsonrpc_tools(cfg: Dict[str, Any]) -> List[tuple[str, str, Dict[str, Any]]]:
    responses = _jsonrpc_stdio_request(
        cfg,
        [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "karna-connector-workshop", "version": "0.1.0"}}},
            {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
        ],
    )
    by_id = {row.get("id"): row for row in responses}
    if by_id.get(1, {}).get("error"):
        raise RuntimeError(by_id[1]["error"].get("message") or "initialize failed")
    tools_resp = by_id.get(2)
    if not tools_resp:
        raise RuntimeError("tools/list returned no response")
    if tools_resp.get("error"):
        raise RuntimeError(tools_resp["error"].get("message") or "tools/list failed")
    tools = tools_resp.get("result", {}).get("tools") or []
    result = []
    for tool in tools:
        if not isinstance(tool, dict) or not tool.get("name"):
            continue
        result.append((str(tool.get("name")), str(tool.get("description") or ""), tool.get("inputSchema") if isinstance(tool.get("inputSchema"), dict) else {}))
    return result


def _persist_mcp_server(instance: Dict[str, Any], defn: Dict[str, Any], auth: Dict[str, Any]) -> None:
    cfg = _mcp_config_from_definition(defn, auth)
    if not cfg:
        return
    name = instance.get("mcpServerName") or f"connector_{instance['id']}"
    instance["mcpServerName"] = name
    cfg["enabled"] = instance.get("enabled", True) is not False
    current = load_config()
    servers = current.setdefault("mcp_servers", {})
    if isinstance(servers, dict):
        servers[name] = cfg
        save_config(current)


def _remove_mcp_server(instance: Dict[str, Any]) -> None:
    name = instance.get("mcpServerName")
    if not name:
        return
    current = load_config()
    servers = current.get("mcp_servers")
    if isinstance(servers, dict) and name in servers:
        del servers[name]
        if not servers:
            current.pop("mcp_servers", None)
        save_config(current)


def _audit(event: Dict[str, Any]) -> None:
    row = {"id": _safe_id("audit"), "createdAt": _now(), **event}
    path = _audit_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def _status_for_definition(defn: Dict[str, Any], auth: Dict[str, Any]) -> tuple[str, Optional[str]]:
    mode = (defn.get("auth") or {}).get("mode")
    if defn.get("status") == "coming_soon":
        return "disconnected", "连接器仍在规划中"
    if mode in {"none", None}:
        return "connected", None
    if mode in {"local_path"}:
        fields = (defn.get("auth") or {}).get("fields") or []
        for f in fields:
            key = f.get("key")
            if f.get("required") and key:
                raw = _normalize_text(auth.get(key))
                if not raw:
                    return "error", f"缺少路径：{f.get('label') or key}"
                if not Path(raw).expanduser().exists():
                    return "error", f"路径不存在：{f.get('label') or key}"
        return "connected", None
    fields = (defn.get("auth") or {}).get("fields") or []
    for f in fields:
        key = f.get("key")
        if f.get("required") and key and not _normalize_text(auth.get(key)):
            return "error", f"缺少授权字段：{f.get('label') or key}"
    return "connected", None


def _try_discover_mcp_tools(instance: Dict[str, Any], defn: Dict[str, Any], auth: Dict[str, Any]) -> tuple[List[Dict[str, Any]], Optional[str]]:
    cfg = _mcp_config_from_definition(defn, auth)
    if not cfg:
        return _preview_tools(defn, instance["id"]), None
    try:
        server_name = instance.get("mcpServerName") or f"connector_{instance['id']}"
        if cfg.get("command"):
            probed = _probe_stdio_jsonrpc_tools(cfg)
        else:
            from hermes_cli.mcp_config import _probe_single_server
            probed = [(name, desc, {}) for name, desc in _probe_single_server(server_name, cfg)]
        tools = []
        for name, desc, schema in probed:
            preview = _preview_tool_meta(defn, name)
            tools.append({
                "id": _tool_id(instance["id"], name),
                "connectorInstanceId": instance["id"],
                "name": name,
                "description": desc,
                "inputSchema": schema,
                "riskLevel": preview.get("riskLevel") if preview.get("riskLevel") in RISK else defn.get("dataPolicy", {}).get("riskLevel", "medium"),
                "enabled": True,
                "source": "mcp",
            })
        return tools, None
    except Exception as exc:
        return _preview_tools(defn, instance["id"]), str(exc) or repr(exc)


def create_instance(payload: Dict[str, Any]) -> Dict[str, Any]:
    connector_id = _normalize_text(payload.get("connectorId"))
    custom_def = payload.get("customDefinition") if isinstance(payload.get("customDefinition"), dict) else None
    if custom_def:
        custom_def.setdefault("id", connector_id or _safe_id("custom"))
        custom_def.setdefault("name", custom_def.get("id"))
        issues = validate_definition(custom_def)
        if issues:
            raise HTTPException(status_code=400, detail="Invalid custom connector: " + ", ".join(issues))
        defn = custom_def
        connector_id = defn["id"]
    else:
        if not connector_id:
            raise HTTPException(status_code=400, detail="connectorId is required")
        defn = get_definition(connector_id)
    auth = payload.get("auth") if isinstance(payload.get("auth"), dict) else {}
    instance_id = _safe_id("conn")
    now = _now()
    status, err = _status_for_definition(defn, auth)
    tools = _preview_tools(defn, instance_id)
    instance = {
        "id": instance_id,
        "connectorId": connector_id,
        "displayName": _normalize_text(payload.get("displayName")) or defn.get("displayName") or connector_id,
        "enabled": payload.get("enabled", True) is not False,
        "connectionStatus": status,
        "authRef": "",
        "discoveredTools": tools,
        "lastConnectedAt": now if status == "connected" else None,
        "lastHealthCheckAt": now,
        "errorMessage": err,
        "config": payload.get("config") if isinstance(payload.get("config"), dict) else {},
        "customDefinition": custom_def,
        "createdAt": now,
        "updatedAt": now,
    }
    instance["authRef"] = save_credential(instance_id, auth) if auth else ""
    _persist_mcp_server(instance, defn, auth)
    items = _load_instances()
    items.append(instance)
    _save_instances(items)
    _audit({"connectorInstanceId": instance_id, "toolName": "connector.create", "status": status, "errorMessage": err, "inputSummary": connector_id})
    return public_instance(instance)


def public_instance(instance: Dict[str, Any]) -> Dict[str, Any]:
    defn = _definition_for_instance(instance)
    auth = get_credential(instance)
    return {
        **instance,
        "definition": defn,
        "auth": redact_auth(auth),
        "credentialStored": bool(instance.get("authRef")),
    }


def list_instances() -> List[Dict[str, Any]]:
    return [public_instance(item) for item in _load_instances()]


def _find_instance(instance_id: str) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
    items = _load_instances()
    for item in items:
        if item.get("id") == instance_id:
            return items, item
    raise HTTPException(status_code=404, detail=f"Connector instance not found: {instance_id}")


def update_instance(instance_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    items, item = _find_instance(instance_id)
    defn = _definition_for_instance(item)
    if "displayName" in payload:
        item["displayName"] = _normalize_text(payload.get("displayName")) or item.get("displayName")
    if "enabled" in payload:
        item["enabled"] = bool(payload.get("enabled"))
        if item.get("mcpServerName"):
            cfg = load_config()
            servers = cfg.get("mcp_servers")
            if isinstance(servers, dict) and item["mcpServerName"] in servers:
                servers[item["mcpServerName"]]["enabled"] = bool(payload.get("enabled"))
                save_config(cfg)
    if isinstance(payload.get("config"), dict):
        item["config"] = payload["config"]
    if isinstance(payload.get("auth"), dict):
        item["authRef"] = save_credential(instance_id, payload["auth"])
        _persist_mcp_server(item, defn, payload["auth"])
    item["updatedAt"] = _now()
    _save_instances(items)
    return public_instance(item)


def delete_instance(instance_id: str) -> Dict[str, Any]:
    items, item = _find_instance(instance_id)
    _remove_mcp_server(item)
    delete_credential(item)
    next_items = [x for x in items if x.get("id") != instance_id]
    _save_instances(next_items)
    _audit({"connectorInstanceId": instance_id, "toolName": "connector.delete", "status": "success", "inputSummary": item.get("connectorId")})
    return {"ok": True}


def test_instance(instance_id: str) -> Dict[str, Any]:
    items, item = _find_instance(instance_id)
    defn = _definition_for_instance(item)
    auth = get_credential(item)
    status, err = _status_for_definition(defn, auth)
    tools = item.get("discoveredTools") or _preview_tools(defn, instance_id)
    mcp_err = None
    if status == "connected" and (defn.get("type") in {"mcp_stdio", "mcp_sse", "mcp_http"} or defn.get("server")):
        tools, mcp_err = _try_discover_mcp_tools(item, defn, auth)
        if mcp_err:
            status = "error"
            err = mcp_err
    item["connectionStatus"] = status
    item["errorMessage"] = err
    item["lastHealthCheckAt"] = _now()
    if status == "connected":
        item["lastConnectedAt"] = item["lastHealthCheckAt"]
    # Preserve explicit tool enabled flags when names match.
    prior = {t.get("name"): t.get("enabled", True) for t in item.get("discoveredTools") or []}
    for tool in tools:
        if tool.get("name") in prior:
            tool["enabled"] = bool(prior[tool.get("name")])
    item["discoveredTools"] = tools
    item["updatedAt"] = _now()
    _save_instances(items)
    _audit({"connectorInstanceId": instance_id, "toolName": "connector.health_check", "status": status, "errorMessage": err, "outputSummary": f"{len(tools)} tools"})
    return {"ok": status == "connected", "status": status, "error": err, "tools": tools, "instance": public_instance(item)}


def set_tool_enabled(tool_id: str, enabled: bool) -> Dict[str, Any]:
    items = _load_instances()
    for item in items:
        for tool in item.get("discoveredTools") or []:
            if tool.get("id") == tool_id:
                tool["enabled"] = bool(enabled)
                item["updatedAt"] = _now()
                _save_instances(items)
                return {"ok": True, "tool": tool}
    raise HTTPException(status_code=404, detail=f"Connector tool not found: {tool_id}")


def list_tools(instance_id: str) -> List[Dict[str, Any]]:
    _items, item = _find_instance(instance_id)
    return list(item.get("discoveredTools") or [])


def _obsidian_call(auth: Dict[str, Any], tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    vault = Path(str(auth.get("vaultPath") or "")).expanduser()
    if not vault.exists() or not vault.is_dir():
        raise HTTPException(status_code=400, detail="Obsidian Vault 路径不存在")
    notes = [p for p in vault.rglob("*.md") if p.is_file()]

    def rel(p: Path) -> str:
        return str(p.relative_to(vault)).replace("\\", "/")

    if tool_name == "list_notes":
        return {"items": [{"path": rel(p), "title": p.stem, "size": p.stat().st_size} for p in notes[:500]], "total": len(notes)}
    if tool_name == "search_notes":
        query = _normalize_text(arguments.get("query") or arguments.get("q")).lower()
        if not query:
            return {"items": [], "total": 0}
        hits = []
        for p in notes:
            text = p.read_text(encoding="utf-8", errors="replace")
            idx = text.lower().find(query)
            if idx >= 0:
                start = max(0, idx - 80)
                end = min(len(text), idx + len(query) + 120)
                hits.append({"path": rel(p), "title": p.stem, "snippet": text[start:end].replace("\n", " ")})
            if len(hits) >= 50:
                break
        return {"items": hits, "total": len(hits)}
    if tool_name == "get_backlinks":
        note_path = _normalize_text(arguments.get("path") or arguments.get("notePath"))
        target_stem = Path(note_path).stem
        backlinks = []
        for p in notes:
            text = p.read_text(encoding="utf-8", errors="replace")
            if f"[[{target_stem}]]" in text or f"[[{note_path}]]" in text:
                backlinks.append({"path": rel(p), "title": p.stem})
        return {"items": backlinks, "total": len(backlinks)}
    raise HTTPException(status_code=404, detail=f"Unknown Obsidian tool: {tool_name}")


def _document_text(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix in {".txt", ".md", ".csv", ".json", ".yaml", ".yml", ".html", ".htm"}:
        return path.read_text(encoding="utf-8", errors="replace")
    if suffix == ".docx":
        import re as _re
        import zipfile

        with zipfile.ZipFile(path) as zf:
            xml = zf.read("word/document.xml").decode("utf-8", errors="replace")
        text = _re.sub(r"<[^>]+>", "", xml)
        return text.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")
    return ""


def _wps_call(auth: Dict[str, Any], tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    root = Path(str(auth.get("docsPath") or "")).expanduser()
    if not root.exists() or not root.is_dir():
        raise HTTPException(status_code=400, detail="WPS/文档目录不存在")
    exts = {".txt", ".md", ".docx", ".csv", ".json"}
    docs = [p for p in root.rglob("*") if p.is_file() and p.suffix.lower() in exts]

    def rel(p: Path) -> str:
        return str(p.relative_to(root)).replace("\\", "/")

    if tool_name == "list_documents":
        return {"items": [{"path": rel(p), "title": p.stem, "type": p.suffix.lower(), "size": p.stat().st_size} for p in docs[:500]], "total": len(docs)}
    if tool_name == "search_documents":
        query = _normalize_text(arguments.get("query") or arguments.get("q")).lower()
        if not query:
            return {"items": [], "total": 0}
        hits = []
        for p in docs:
            text = _document_text(p)
            idx = text.lower().find(query)
            if idx >= 0:
                hits.append({"path": rel(p), "title": p.stem, "snippet": text[max(0, idx - 80): idx + len(query) + 120].replace("\n", " ")})
            if len(hits) >= 50:
                break
        return {"items": hits, "total": len(hits)}
    if tool_name == "import_document":
        doc_path = _normalize_text(arguments.get("path") or arguments.get("filePath"))
        target = (root / doc_path).resolve()
        if not str(target).lower().startswith(str(root.resolve()).lower()) or not target.exists():
            raise HTTPException(status_code=400, detail="文档路径不存在或越界")
        text = _document_text(target)
        return {"path": rel(target), "title": target.stem, "text": text[: int(arguments.get("maxChars") or 20000)]}
    raise HTTPException(status_code=404, detail=f"Unknown WPS tool: {tool_name}")


def _baidu_netdisk_call(auth: Dict[str, Any], tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    # Full Baidu Netdisk requires a user-provided MCP SSE endpoint or official
    # API adapter.  The connector still participates in auth, permission,
    # routing, health, and audit; calls return a deterministic integration
    # status instead of pretending to access the user's cloud files.
    if tool_name not in {"list_files", "search_files", "download_file"}:
        raise HTTPException(status_code=404, detail=f"Unknown Baidu Netdisk tool: {tool_name}")
    return {
        "items": [],
        "total": 0,
        "configured": bool(_normalize_text(auth.get("accessToken"))),
        "query": arguments.get("query") or arguments.get("path") or "",
        "warning": "百度网盘连接器已完成授权、权限、路由和审计框架；真实文件访问需要填写可用的百度网盘 MCP SSE serverUrl 或接入正式 API 适配器。",
    }


def _web_search_call(auth: Dict[str, Any], tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    if tool_name != "search_web":
        raise HTTPException(status_code=404, detail=f"Unknown Web Search tool: {tool_name}")
    query = _normalize_text(arguments.get("query") or arguments.get("q"))
    if not query:
        raise HTTPException(status_code=400, detail="search_web 需要 query")
    provider = _normalize_text(auth.get("provider")).lower()
    api_key = _normalize_text(auth.get("apiKey"))
    if "searx" in provider or api_key.startswith(("http://", "https://")):
        base = api_key.rstrip("/")
        url = base + "/search?" + urllib.parse.urlencode({"q": query, "format": "json", "language": arguments.get("language") or "zh-CN"})
        req = urllib.request.Request(url, headers={"User-Agent": "Karna-ConnectorWorkshop/0.1"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            payload = json.loads(resp.read().decode("utf-8", errors="replace"))
        results = []
        for item in payload.get("results", [])[: int(arguments.get("limit") or 8)]:
            results.append({"title": item.get("title") or "", "url": item.get("url") or "", "snippet": item.get("content") or item.get("snippet") or ""})
        return {"query": query, "provider": "SearxNG", "items": results, "total": len(results)}
    return {
        "query": query,
        "items": [],
        "total": 0,
        "warning": "当前 Web Search 已保存授权并完成路由；实际联网搜索请把 provider 设为 SearxNG 且 API Key/Base URL 填 SearxNG 地址，或接入 Tavily/SerpAPI/Bing 适配器。",
    }


def _browser_reader_call(tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    url = _normalize_text(arguments.get("url"))
    if tool_name in {"read_webpage", "extract_evidence"} and not url:
        raise HTTPException(status_code=400, detail=f"{tool_name} 需要 url")
    if tool_name not in {"read_webpage", "extract_evidence"}:
        raise HTTPException(status_code=404, detail=f"Unknown Browser Reader tool: {tool_name}")
    req = urllib.request.Request(url, headers={"User-Agent": "Karna-ConnectorWorkshop/0.1"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        raw = resp.read().decode(resp.headers.get_content_charset() or "utf-8", errors="replace")
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", raw)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    title_match = re.search(r"(?is)<title[^>]*>(.*?)</title>", raw)
    title = re.sub(r"\s+", " ", title_match.group(1)).strip() if title_match else url
    if tool_name == "read_webpage":
        return {"url": url, "title": title, "text": text[: int(arguments.get("maxChars") or 12000)]}
    keywords = arguments.get("keywords") if isinstance(arguments.get("keywords"), list) else []
    evidence = []
    for keyword in [str(k) for k in keywords if str(k).strip()][:8]:
        idx = text.lower().find(keyword.lower())
        if idx >= 0:
            evidence.append({"keyword": keyword, "snippet": text[max(0, idx - 120): idx + len(keyword) + 180]})
    if not evidence and text:
        evidence.append({"keyword": "", "snippet": text[:500]})
    evidence_db = _data_dir() / "evidence_db.json"
    rows = _read_json_file(evidence_db, [])
    if not isinstance(rows, list):
        rows = []
    row = {"id": _safe_id("ev"), "createdAt": _now(), "url": url, "title": title, "evidence": evidence}
    rows.append(row)
    _write_json_file(evidence_db, rows[-1000:])
    return {"saved": True, "evidenceId": row["id"], "url": url, "title": title, "evidence": evidence}


def _call_stdio_mcp_tool(defn: Dict[str, Any], auth: Dict[str, Any], tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    cfg = _mcp_config_from_definition(defn, auth)
    if not cfg or not cfg.get("command"):
        raise HTTPException(status_code=400, detail="连接器没有可调用的 stdio MCP 配置")
    responses = _jsonrpc_stdio_request(
        cfg,
        [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "karna-connector-workshop", "version": "0.1.0"}}},
            {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": tool_name, "arguments": arguments or {}}},
        ],
    )
    by_id = {row.get("id"): row for row in responses}
    row = by_id.get(2)
    if not row:
        raise HTTPException(status_code=502, detail="MCP 工具调用无响应")
    if row.get("error"):
        raise HTTPException(status_code=502, detail=row["error"].get("message") or "MCP 工具调用失败")
    content = row.get("result", {}).get("content") or []
    if content and isinstance(content[0], dict):
        text = content[0].get("text")
        if isinstance(text, str):
            try:
                return json.loads(text)
            except Exception:
                return {"text": text}
    return row.get("result", {})


ADVANCED_CONNECTOR_IDS = {
    "feishu_docs", "tencent_docs", "wechat_reading", "zotero_library", "arxiv_search",
    "feishu", "dingtalk", "wechat_work_bot", "mail", "calendar",
    "baidu_map", "amap", "tencent_location",
    "wechat_official", "zhihu", "xiaohongshu", "wordpress", "substack",
}


def _advanced_connector_call(instance: Dict[str, Any], defn: Dict[str, Any], tool_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
    """Safe interface implementation for post-MVP connectors.

    These connectors expose stable tool contracts now, while real third-party
    API adapters can be swapped in later.  Read-only calls return structured
    empty results; write/publish/message calls require the existing high-risk
    confirmation gate and return a dry-run payload instead of touching remote
    services.
    """
    phase = defn.get("phase") or "advanced"
    risk = _preview_tool_meta(defn, tool_name).get("riskLevel") or defn.get("dataPolicy", {}).get("riskLevel")
    is_write = risk == "high" or any(word in tool_name for word in ("send", "create", "upload", "publish", "update", "schedule"))
    return {
        "ok": True,
        "mode": "interface_stub",
        "dryRun": bool(is_write),
        "phase": phase,
        "connectorId": instance.get("connectorId"),
        "connector": defn.get("displayName"),
        "tool": tool_name,
        "arguments": _redact_deep(arguments),
        "items": [] if not is_write else None,
        "message": "进阶连接器接口已接入；当前为安全占位实现，真实第三方适配器接入后会替换该返回。",
    }


def call_tool(
    tool_id: str,
    arguments: Optional[Dict[str, Any]] = None,
    confirmed: bool = False,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    arguments = arguments if isinstance(arguments, dict) else {}
    audit_project_id = _normalize_text(project_id or arguments.get("project_id") or arguments.get("projectId")) or None
    items = _load_instances()
    for item in items:
        if item.get("enabled") is False:
            continue
        for tool in item.get("discoveredTools") or []:
            if tool.get("id") != tool_id:
                continue
            if tool.get("enabled") is False:
                raise HTTPException(status_code=403, detail="连接器工具已禁用")
            if tool.get("riskLevel") == "high" and not confirmed:
                raise HTTPException(status_code=409, detail="高风险工具需要显式确认后才能调用")
            defn = _definition_for_instance(item)
            auth = get_credential(item)
            try:
                if item.get("connectorId") == "obsidian_vault":
                    output = _obsidian_call(auth, str(tool.get("name")), arguments)
                elif item.get("connectorId") == "wps_docs":
                    output = _wps_call(auth, str(tool.get("name")), arguments)
                elif item.get("connectorId") == "baidu_netdisk":
                    output = _baidu_netdisk_call(auth, str(tool.get("name")), arguments)
                elif item.get("connectorId") == "web_search":
                    output = _web_search_call(auth, str(tool.get("name")), arguments)
                elif item.get("connectorId") == "browser_reader":
                    output = _browser_reader_call(str(tool.get("name")), arguments)
                elif item.get("connectorId") in ADVANCED_CONNECTOR_IDS:
                    output = _advanced_connector_call(item, defn, str(tool.get("name")), arguments)
                elif defn.get("server") or defn.get("mcpServer"):
                    output = _call_stdio_mcp_tool(defn, auth, str(tool.get("name")), arguments)
                else:
                    raise HTTPException(status_code=400, detail="该连接器目前只支持发现，不支持直接调用")
                _audit({"connectorInstanceId": item.get("id"), "projectId": audit_project_id, "toolName": tool.get("name"), "status": "success", "inputSummary": _summary(arguments), "outputSummary": _summary(output)})
                return {"ok": True, "tool": tool, "output": output}
            except HTTPException as exc:
                _audit({"connectorInstanceId": item.get("id"), "projectId": audit_project_id, "toolName": tool.get("name"), "status": "error", "errorMessage": str(exc.detail), "inputSummary": _summary(arguments)})
                raise
            except Exception as exc:
                _audit({"connectorInstanceId": item.get("id"), "projectId": audit_project_id, "toolName": tool.get("name"), "status": "error", "errorMessage": str(exc), "inputSummary": _summary(arguments)})
                raise HTTPException(status_code=500, detail=str(exc))
    raise HTTPException(status_code=404, detail=f"Connector tool not found: {tool_id}")


def list_audit_logs(
    limit: int = 100,
    instance_id: Optional[str] = None,
    project_id: Optional[str] = None,
) -> List[Dict[str, Any]]:
    path = _audit_path()
    if not path.exists():
        return []
    rows: List[Dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            row = json.loads(line)
        except Exception:
            continue
        if instance_id and row.get("connectorInstanceId") != instance_id:
            continue
        if project_id and row.get("projectId") != project_id:
            continue
        rows.append(row)
    return rows[-max(1, min(500, limit)):][::-1]


def health_check_all() -> Dict[str, Any]:
    results = []
    for item in list(_load_instances()):
        try:
            results.append(test_instance(str(item.get("id"))))
        except Exception as exc:
            results.append({"ok": False, "id": item.get("id"), "error": str(exc)})
    return {"ok": all(r.get("ok") for r in results), "results": results}


def route_tools(intent: Optional[str] = None, text: Optional[str] = None) -> Dict[str, Any]:
    query = _normalize_text(text).lower()
    inferred = intent or "general"
    groups: Dict[str, List[str]] = {
        "workspace_read": ["writer_workspace", "story_bible", "living_wiki"],
        "workspace_write": ["writer_workspace", "story_bible", "narrative_state"],
        "story_analysis": ["writer_workspace", "story_bible", "narrative_state", "living_wiki", "creative_search"],
        "continuity_check": ["story_bible", "narrative_state", "living_wiki"],
        "creative_search": ["creative_search", "living_wiki"],
        "web_research": ["web_search", "browser_reader", "soul_workshop", "arxiv_search", "zotero_library", "wechat_reading"],
        "document_import": ["obsidian_vault", "wps_docs", "writer_workspace", "feishu_docs", "tencent_docs", "zotero_library"],
        "cloud_file_search": ["baidu_netdisk", "feishu_docs", "tencent_docs"],
        "soul_distillation": ["soul_workshop", "web_search", "browser_reader", "wechat_reading", "zotero_library"],
        "critic_review": ["soul_workshop", "story_bible", "narrative_state"],
        "publish": ["wechat_official", "zhihu", "xiaohongshu", "wordpress", "substack"],
        "collaboration": ["feishu", "dingtalk", "wechat_work_bot", "mail"],
        "calendar_task": ["calendar", "dingtalk", "feishu"],
        "scene_reality": ["baidu_map", "amap", "tencent_location", "web_search"],
    }
    if not intent:
        if re.search(r"第\s*\d+\s*章|人物|伏笔|冲突|动机|ooc|一致|chapter|character|motivation|conflict", query):
            inferred = "story_analysis"
        elif any(word in query for word in ["搜索", "查资料", "访谈", "背景", "网页"]):
            inferred = "web_research"
        elif any(word in query for word in ["网盘", "百度网盘", "文件"]):
            inferred = "cloud_file_search"
        elif any(word in query for word in ["obsidian", "笔记", "markdown"]):
            inferred = "document_import"
        elif any(word in query for word in ["发布", "草稿", "公众号", "知乎", "小红书", "wordpress", "substack"]):
            inferred = "publish"
        elif any(word in query for word in ["飞书", "钉钉", "企业微信", "邮件", "邮箱", "群聊", "消息"]):
            inferred = "collaboration"
        elif any(word in query for word in ["日历", "日程", "提醒", "待办"]):
            inferred = "calendar_task"
        elif any(word in query for word in ["地图", "路线", "地点", "城市", "街道", "高德", "百度地图"]):
            inferred = "scene_reality"
        elif any(word in query for word in ["批评", "审稿", "风格", "方法论", "灵魂"]):
            inferred = "critic_review"
    wanted = set(groups.get(inferred, []))
    candidates = []
    for instance in _load_instances():
        if instance.get("enabled") is False or instance.get("connectionStatus") != "connected":
            continue
        if wanted and instance.get("connectorId") not in wanted:
            continue
        defn = _definition_for_instance(instance)
        for tool in instance.get("discoveredTools") or []:
            if tool.get("enabled") is False:
                continue
            candidates.append({
                **tool,
                "connectorId": instance.get("connectorId"),
                "connectorDisplayName": instance.get("displayName"),
                "category": defn.get("category"),
            })
    return {"intent": inferred, "tools": candidates}



def connector_roadmap() -> Dict[str, Any]:
    """Return staged connector roadmap and implemented interface definitions."""
    phase_titles = {"V0.2": "增强版", "V0.3": "协作版", "V0.4": "场景资料版", "V1.0": "发布生态版"}
    grouped: Dict[str, List[Dict[str, Any]]] = {phase: [] for phase in phase_titles}
    for item in load_advanced_definitions():
        grouped.setdefault(str(item.get("phase") or "advanced"), []).append(item)
    return {
        "items": [
            {
                "version": phase,
                "title": title,
                "items": [d.get("displayName") for d in grouped.get(phase, [])],
                "definitions": grouped.get(phase, []),
            }
            for phase, title in phase_titles.items()
        ],
        "source": "D:/Agent/mcp-workshop.md",
    }


def get_available_tools_for_agent(context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Return enabled connector tools for an agent context.

    This is the product-facing ToolRouter entrypoint requested by the connector
    workshop plan.  Agent code can pass either ``{"intent": ...}`` or freeform
    ``{"text": ...}``; the router keeps only connected/enabled instances and
    enabled tools.
    """
    context = context if isinstance(context, dict) else {}
    return route_tools(intent=context.get("intent"), text=context.get("text") or context.get("prompt") or context.get("task"))


# JS/product spec name alias for callers that mirror the original plan wording.
getAvailableToolsForAgent = get_available_tools_for_agent
