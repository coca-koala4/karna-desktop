"""
Karna Plugin Platform API endpoints.

Provides REST API for managing Karna plugins v1, skill packs,
installation transactions, and runtime integration.
"""

import asyncio
import json
import logging
import threading
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from fastapi import (
    APIRouter,
    BackgroundTasks,
    File,
    Form,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from pydantic import BaseModel

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/karna", tags=["karna-plugins"])

_installer_lock = threading.Lock()
_installer: Optional[Any] = None
_job_subscribers: Dict[str, Set[WebSocket]] = {}
_job_subscribers_lock = threading.Lock()


def _get_installer():
    global _installer
    if _installer is None:
        with _installer_lock:
            if _installer is None:
                from hermes_cli.karna_plugins import PluginInstaller, PluginRegistry
                _installer = PluginInstaller(PluginRegistry())
    return _installer


def _job_to_dict(job: Any) -> Dict[str, Any]:
    manifest_dict = None
    manifest = getattr(job, "manifest", None)
    if manifest and hasattr(manifest, "__dict__"):
        try:
            from dataclasses import asdict as dc_asdict
            manifest_dict = dc_asdict(manifest)
        except Exception:
            manifest_dict = None
    return {
        "job_id": job.job_id,
        "source": job.source,
        "operation": getattr(job, "operation", "install"),
        "state": job.state.value if hasattr(job.state, "value") else str(job.state),
        "phase": job.phase.value if hasattr(job.phase, "value") else str(job.phase),
        "progress": getattr(job, "progress", 0),
        "message": getattr(job, "message", ""),
        "error": getattr(job, "error", None),
        "created_at": getattr(job, "created_at", time.time()),
        "updated_at": getattr(job, "updated_at", time.time()),
        "plugin_id": job.preflight.plugin_id if getattr(job, "preflight", None) else None,
        "plugin_name": job.preflight.name if getattr(job, "preflight", None) else None,
        "version": job.preflight.version if getattr(job, "preflight", None) else None,
        "manifest": manifest_dict,
        "preflight": _preflight_to_dict(getattr(job, "preflight", None)),
    }


def _preflight_to_dict(preflight: Any) -> Optional[Dict[str, Any]]:
    if preflight is None:
        return None
    if hasattr(preflight, "to_dict"):
        return preflight.to_dict()
    result = {
        "plugin_id": getattr(preflight, "plugin_id", None),
        "name": getattr(preflight, "name", None),
        "version": getattr(preflight, "version", None),
        "description": getattr(preflight, "description", ""),
        "permissions": getattr(preflight, "permissions", []),
        "new_permissions": getattr(preflight, "new_permissions", []),
        "platforms": getattr(preflight, "platforms", []),
        "is_compatible": getattr(preflight, "is_compatible_platform", getattr(preflight, "is_compatible", True)),
        "compatibility_issues": getattr(preflight, "compatibility_issues", []),
        "conflicts": getattr(preflight, "conflicts", []),
        "warnings": getattr(preflight, "warnings", []),
        "security_issues": [],
        "skills": getattr(preflight, "skills", []),
        "is_skill_pack": getattr(preflight, "is_skill_pack", False),
        "is_codex_converted": getattr(preflight, "is_codex_converted", False),
        "files_count": getattr(preflight, "files_count", 0),
        "total_size": getattr(preflight, "total_size", getattr(preflight, "size_bytes", 0)),
        "license": getattr(preflight, "license_id", getattr(preflight, "license", None)),
        "source_type": getattr(preflight, "source_type", None),
        "source_url": getattr(preflight, "source_url", ""),
        "sha256": getattr(preflight, "sha256", None),
        "entrypoints": getattr(preflight, "entrypoints", {}),
        "capabilities": getattr(preflight, "capabilities", []),
        "category": getattr(preflight, "category", "uncategorized"),
        "publisher": getattr(preflight, "publisher", {}),
        "security_verdict": getattr(preflight, "security_verdict", "pass"),
    }
    security_issues = getattr(preflight, "security_issues", [])
    for issue in security_issues:
        if isinstance(issue, dict):
            result["security_issues"].append(issue)
        else:
            result["security_issues"].append({
                "severity": getattr(issue, "severity", "unknown"),
                "code": getattr(issue, "code", "unknown"),
                "message": getattr(issue, "message", str(issue)),
                "file": getattr(issue, "file", None),
            })
    return result


def _plugin_to_dict(plugin: Any) -> Dict[str, Any]:
    health = getattr(plugin, "health_status", "unknown")
    status = getattr(plugin, "status", None)
    status_str = status.value if hasattr(status, "value") else str(status) if status else "unknown"
    return {
        "id": plugin.plugin_id,
        "name": plugin.name,
        "version": plugin.version,
        "publisher_id": plugin.publisher_id,
        "publisher_name": plugin.publisher_name,
        "description": plugin.description,
        "category": getattr(plugin, "category", "uncategorized"),
        "status": status_str,
        "health_status": health,
        "is_builtin": bool(getattr(plugin, "is_builtin", False)),
        "is_active": bool(getattr(plugin, "is_active_version", True)),
        "permissions": getattr(plugin, "permissions", []),
        "permissions_granted": getattr(plugin, "permissions_granted", []),
        "platforms": getattr(plugin, "platforms", []),
        "source_type": getattr(plugin, "source_type", ""),
        "source_url": getattr(plugin, "source_url", ""),
        "sha256": getattr(plugin, "sha256", ""),
        "installed_at": getattr(plugin, "installed_at", None),
        "updated_at": getattr(plugin, "updated_at", None),
        "last_health_check": getattr(plugin, "last_health_check", None),
        "rollback_version": getattr(plugin, "rollback_version", ""),
        "capabilities": getattr(plugin, "capabilities", []),
        "entrypoints": getattr(plugin, "entrypoints", {}),
        "install_path": str(getattr(plugin, "install_path", "")),
        "skills": [],
        "mcp_servers": [],
        "has_update": False,
        "update_version": None,
    }


def _skill_pack_to_dict(pack: Any) -> Dict[str, Any]:
    return {
        "id": pack.pack_id,
        "version": pack.version,
        "category": pack.category,
        "name": getattr(pack, "name", pack.pack_id),
        "description": getattr(pack, "description", ""),
        "skills_count": getattr(pack, "skills_count", 0),
        "size_bytes": getattr(pack, "size_bytes", 0),
        "installed_at": getattr(pack, "installed_at", None),
        "source_type": getattr(pack, "source_type", ""),
        "source_url": getattr(pack, "source_url", ""),
        "is_active": bool(getattr(pack, "is_active", True)),
    }


def _skill_to_dict(skill: Any) -> Dict[str, Any]:
    return {
        "id": skill.skill_id,
        "name": getattr(skill, "name", skill.skill_id),
        "version": getattr(skill, "version", ""),
        "description": getattr(skill, "description", ""),
        "category": getattr(skill, "primary_category", "uncategorized"),
        "domains": getattr(skill, "domains", []),
        "tags": getattr(skill, "tags", []),
        "language": getattr(skill, "language", "en"),
        "risk_level": getattr(skill, "risk_level", "low"),
        "license": getattr(skill, "license", ""),
        "is_enabled": bool(getattr(skill, "is_enabled", True)),
        "is_builtin": bool(getattr(skill, "is_builtin", False)),
        "source_pack": getattr(skill, "source_pack_id", ""),
        "source_plugin": getattr(skill, "source_plugin_id", ""),
        "plugin_id": getattr(skill, "plugin_id", ""),
        "install_path": str(getattr(skill, "install_path", "")),
        "variants": getattr(skill, "variants", []),
        "active_variant": getattr(skill, "active_variant", None),
        "confidence": getattr(skill, "classification_confidence", 1.0),
    }


class PluginInstallRequest(BaseModel):
    source: str
    auto_confirm: bool = False
    granted_permissions: Optional[List[str]] = None


class PluginConfirmRequest(BaseModel):
    granted_permissions: Optional[List[str]] = None


class PluginEnableRequest(BaseModel):
    enabled: bool = True


class PluginPermissionsRequest(BaseModel):
    permissions: List[str]


class SkillPackInstallRequest(BaseModel):
    source: str
    auto_confirm: bool = False
    granted_permissions: Optional[List[str]] = None


class SkillVariantRequest(BaseModel):
    variant_id: str


@router.get("/plugins")
async def list_plugins():
    try:
        installer = _get_installer()
        registry = installer.registry
        plugins = registry.list_plugins()
        result = []
        for p in plugins:
            d = _plugin_to_dict(p)
            d["skills"] = [
                _skill_to_dict(s) for s in registry.list_plugin_skills(p.plugin_id)
            ]
            d["mcp_servers"] = registry.list_plugin_mcp(p.plugin_id)
            result.append(d)
        return {"plugins": result}
    except Exception as e:
        _log.exception("Failed to list plugins")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/plugins/{plugin_id}")
async def get_plugin(plugin_id: str):
    try:
        installer = _get_installer()
        plugin = installer.registry.get_plugin(plugin_id)
        if not plugin:
            raise HTTPException(status_code=404, detail=f"Plugin not found: {plugin_id}")
        d = _plugin_to_dict(plugin)
        d["skills"] = [
            _skill_to_dict(s) for s in installer.registry.list_plugin_skills(plugin_id)
        ]
        d["mcp_servers"] = installer.registry.list_plugin_mcp(plugin_id)
        d["health_report"] = installer.run_health_check(plugin_id)
        return d
    except HTTPException:
        raise
    except Exception as e:
        _log.exception(f"Failed to get plugin {plugin_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/plugins/preflight")
async def preflight_plugin(body: PluginInstallRequest, background_tasks: BackgroundTasks):
    source = (body.source or "").strip()
    if not source:
        raise HTTPException(status_code=400, detail="source is required")
    try:
        installer = _get_installer()

        def run_preflight():
            try:
                job, preflight = installer.preflight(source)
                _notify_job_subscribers(job.job_id, _job_to_dict(job))
            except Exception as e:
                _log.exception("Preflight failed")

        job = installer.create_job(source)
        background_tasks.add_task(run_preflight)
        return _job_to_dict(job)
    except Exception as e:
        _log.exception("Failed to start plugin preflight")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/plugins/install")
async def install_plugin(body: PluginInstallRequest, background_tasks: BackgroundTasks):
    source = (body.source or "").strip()
    if not source:
        raise HTTPException(status_code=400, detail="source is required")
    try:
        installer = _get_installer()
        if body.auto_confirm:
            job = installer.install(
                source,
                auto_confirm=True,
                granted_permissions=body.granted_permissions,
            )
        else:
            job, _ = installer.preflight(source)

        def run_install():
            try:
                if not body.auto_confirm:
                    pass
                _notify_job_subscribers(job.job_id, _job_to_dict(job))
                _refresh_runtime_registry()
            except Exception as e:
                _log.exception("Install failed")

        if body.auto_confirm:
            background_tasks.add_task(run_install)
        return _job_to_dict(job)
    except Exception as e:
        _log.exception("Failed to install plugin")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/plugins/install/{job_id}/confirm")
async def confirm_plugin_install(job_id: str, body: PluginConfirmRequest, background_tasks: BackgroundTasks):
    try:
        installer = _get_installer()

        def run_confirm():
            try:
                installer.confirm_and_install(
                    job_id,
                    granted_permissions=body.granted_permissions,
                )
                job = installer.get_job(job_id)
                if job:
                    _notify_job_subscribers(job_id, _job_to_dict(job))
                _refresh_runtime_registry()
            except Exception as e:
                _log.exception(f"Confirm install failed for job {job_id}")

        background_tasks.add_task(run_confirm)
        return {"ok": True, "job_id": job_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _log.exception(f"Failed to confirm install {job_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/plugins/jobs/{job_id}")
async def get_plugin_job(job_id: str):
    try:
        installer = _get_installer()
        job = installer.get_job(job_id)
        if not job:
            db_job = installer.registry.get_job(job_id)
            if db_job:
                return db_job
            raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
        return _job_to_dict(job)
    except HTTPException:
        raise
    except Exception as e:
        _log.exception(f"Failed to get job {job_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/plugins/{plugin_id}/enable")
async def set_plugin_enabled(plugin_id: str, body: PluginEnableRequest):
    try:
        installer = _get_installer()
        if body.enabled:
            installer.enable_plugin(plugin_id)
        else:
            installer.disable_plugin(plugin_id)
        _refresh_runtime_registry()
        return {"ok": True, "plugin_id": plugin_id, "enabled": body.enabled}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        _log.exception(f"Failed to set plugin enabled {plugin_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/plugins/{plugin_id}/permissions")
async def set_plugin_permissions(plugin_id: str, body: PluginPermissionsRequest):
    try:
        installer = _get_installer()
        installer.set_permissions(plugin_id, body.permissions)
        return {"ok": True, "plugin_id": plugin_id, "permissions": body.permissions}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        _log.exception(f"Failed to set permissions for {plugin_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/plugins/{plugin_id}/check-update")
async def check_plugin_update(plugin_id: str, background_tasks: BackgroundTasks):
    try:
        installer = _get_installer()
        update_info = await asyncio.get_event_loop().run_in_executor(
            None, installer.check_update, plugin_id
        )
        if update_info:
            return {
                "has_update": True,
                "plugin_id": plugin_id,
                "update": {
                    "version": update_info.version,
                    "changelog": getattr(update_info, "changelog", ""),
                    "new_permissions": getattr(update_info, "new_permissions", []),
                    "size_bytes": getattr(update_info, "size_bytes", 0),
                    "sha256": getattr(update_info, "sha256", ""),
                    "source_url": getattr(update_info, "source_url", ""),
                }
            }
        return {"has_update": False, "plugin_id": plugin_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        _log.exception(f"Failed to check update for {plugin_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/plugins/{plugin_id}/update")
async def update_plugin(plugin_id: str, background_tasks: BackgroundTasks):
    try:
        installer = _get_installer()

        def run_update():
            try:
                job = installer.update(plugin_id)
                _notify_job_subscribers(job.job_id, _job_to_dict(job))
                _refresh_runtime_registry()
            except Exception as e:
                _log.exception(f"Update failed for {plugin_id}")

        background_tasks.add_task(run_update)
        return {"ok": True, "plugin_id": plugin_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        _log.exception(f"Failed to update plugin {plugin_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/plugins/{plugin_id}/rollback")
async def rollback_plugin(plugin_id: str):
    try:
        installer = _get_installer()
        installer.rollback(plugin_id)
        _refresh_runtime_registry()
        return {"ok": True, "plugin_id": plugin_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        _log.exception(f"Failed to rollback plugin {plugin_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/plugins/{plugin_id}")
async def uninstall_plugin(plugin_id: str):
    try:
        installer = _get_installer()
        installer.uninstall(plugin_id)
        _refresh_runtime_registry()
        return {"ok": True, "plugin_id": plugin_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        _log.exception(f"Failed to uninstall plugin {plugin_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/plugins/import-codex")
async def import_codex_plugin(background_tasks: BackgroundTasks, file: Optional[UploadFile] = File(None), source: Optional[str] = Form(None)):
    try:
        installer = _get_installer()
        if file:
            content = await file.read()
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
                tmp.write(content)
                tmp_path = tmp.name
            source_str = tmp_path
        elif source:
            source_str = source
        else:
            raise HTTPException(status_code=400, detail="Either file or source is required")

        def run_import():
            try:
                job = installer.import_codex(source_str)
                _notify_job_subscribers(job.job_id, _job_to_dict(job))
                _refresh_runtime_registry()
            except Exception as e:
                _log.exception("Codex import failed")

        background_tasks.add_task(run_import)
        return {"ok": True, "source": source_str}
    except HTTPException:
        raise
    except Exception as e:
        _log.exception("Failed to import Codex plugin")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/skill-packs")
async def list_skill_packs():
    try:
        installer = _get_installer()
        packs = installer.registry.list_skill_packs()
        result = []
        for pack in packs:
            d = _skill_pack_to_dict(pack)
            d["skills"] = [
                _skill_to_dict(s) for s in installer.registry.list_pack_skills(pack.pack_id)
            ]
            result.append(d)
        return {"skill_packs": result}
    except Exception as e:
        _log.exception("Failed to list skill packs")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/skill-packs/preflight")
async def preflight_skill_pack(body: SkillPackInstallRequest, background_tasks: BackgroundTasks):
    source = (body.source or "").strip()
    if not source:
        raise HTTPException(status_code=400, detail="source is required")
    try:
        installer = _get_installer()
        job, preflight = installer.preflight_skill_pack(source)
        return _job_to_dict(job)
    except Exception as e:
        _log.exception("Failed to preflight skill pack")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/skill-packs/install")
async def install_skill_pack(body: SkillPackInstallRequest, background_tasks: BackgroundTasks):
    source = (body.source or "").strip()
    if not source:
        raise HTTPException(status_code=400, detail="source is required")
    try:
        installer = _get_installer()
        job = installer.install_skill_pack(
            source,
            auto_confirm=body.auto_confirm,
            granted_permissions=body.granted_permissions,
        )

        def run_install():
            try:
                _notify_job_subscribers(job.job_id, _job_to_dict(job))
                _refresh_runtime_registry()
            except Exception as e:
                _log.exception("Skill pack install failed")

        background_tasks.add_task(run_install)
        return _job_to_dict(job)
    except Exception as e:
        _log.exception("Failed to install skill pack")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/skills")
async def list_skills(category: Optional[str] = None, tag: Optional[str] = None, enabled_only: bool = False):
    try:
        installer = _get_installer()
        skills = installer.registry.list_skills()
        result = []
        for s in skills:
            d = _skill_to_dict(s)
            if category and d["category"] != category:
                continue
            if tag and tag not in d["tags"]:
                continue
            if enabled_only and not d["is_enabled"]:
                continue
            result.append(d)
        return {"skills": result}
    except Exception as e:
        _log.exception("Failed to list skills")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/skills/{skill_id}/activate-variant")
async def activate_skill_variant(skill_id: str, body: SkillVariantRequest):
    try:
        installer = _get_installer()
        installer.registry.activate_skill_variant(skill_id, body.variant_id)
        _refresh_runtime_registry()
        return {"ok": True, "skill_id": skill_id, "active_variant": body.variant_id}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        _log.exception(f"Failed to activate variant for skill {skill_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/skills/{skill_id}/enable")
async def set_skill_enabled(skill_id: str, enabled: bool = True):
    try:
        installer = _get_installer()
        installer.registry.set_skill_enabled(skill_id, enabled)
        _refresh_runtime_registry()
        return {"ok": True, "skill_id": skill_id, "enabled": enabled}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        _log.exception(f"Failed to set skill enabled {skill_id}")
        raise HTTPException(status_code=500, detail=str(e))


@router.websocket("/plugins/jobs/{job_id}/events")
async def job_events_websocket(websocket: WebSocket, job_id: str):
    await websocket.accept()
    with _job_subscribers_lock:
        if job_id not in _job_subscribers:
            _job_subscribers[job_id] = set()
        _job_subscribers[job_id].add(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        with _job_subscribers_lock:
            if job_id in _job_subscribers:
                _job_subscribers[job_id].discard(websocket)
                if not _job_subscribers[job_id]:
                    del _job_subscribers[job_id]


def _notify_job_subscribers(job_id: str, data: Dict[str, Any]):
    with _job_subscribers_lock:
        subscribers = _job_subscribers.get(job_id, set()).copy()
    for ws in subscribers:
        try:
            import asyncio
            loop = asyncio.get_event_loop()
            asyncio.run_coroutine_threadsafe(
                ws.send_json(data), loop
            )
        except Exception:
            pass


def _refresh_runtime_registry():
    try:
        from hermes_cli.skills_hub import reload_skills
        reload_skills()
    except Exception:
        pass
    try:
        from hermes_cli.plugins import discover_plugins
        discover_plugins(force=True)
    except Exception:
        pass
    try:
        from hermes_cli.mcp_startup import reload_mcp_servers
        reload_mcp_servers()
    except Exception:
        pass


def register_karna_plugin_routes(app):
    app.include_router(router)
