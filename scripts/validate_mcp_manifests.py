"""Fail CI when an optional MCP manifest omits governance metadata."""
from pathlib import Path
import sys
import yaml

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {"manifest_version", "id", "name", "version", "source", "transport", "auth", "dependencies", "permissions", "health_check", "lifecycle"}

errors = []
seen_ids = {}
optional_dirs = sorted(path for path in (ROOT / "optional-mcps").iterdir() if path.is_dir())
manifest_paths = sorted((ROOT / "optional-mcps").glob("*/manifest.yaml"))
for directory in optional_dirs:
    if not (directory / "manifest.yaml").is_file():
        errors.append(f"{directory.relative_to(ROOT)}: missing manifest.yaml")
for manifest_path in manifest_paths:
    data = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
    missing = sorted(REQUIRED - set(data))
    if missing:
        errors.append(f"{manifest_path.relative_to(ROOT)}: missing {', '.join(missing)}")
    manifest_id = str(data.get("id") or "").strip()
    if not manifest_id:
        errors.append(f"{manifest_path.relative_to(ROOT)}: id must be non-empty")
    elif manifest_id in seen_ids:
        errors.append(f"{manifest_path.relative_to(ROOT)}: duplicate id={manifest_id} (also {seen_ids[manifest_id]})")
    else:
        seen_ids[manifest_id] = manifest_path.relative_to(ROOT)
    if not str(data.get("version") or "").strip():
        errors.append(f"{manifest_path.relative_to(ROOT)}: version must be non-empty")
    if not str(data.get("source") or "").strip():
        errors.append(f"{manifest_path.relative_to(ROOT)}: source must be non-empty")
    if not isinstance(data.get("permissions"), list):
        errors.append(f"{manifest_path.relative_to(ROOT)}: permissions must be a list")
    if not isinstance(data.get("dependencies"), dict):
        errors.append(f"{manifest_path.relative_to(ROOT)}: dependencies must be a mapping")
    health = data.get("health_check")
    if not isinstance(health, dict) or not str(health.get("type") or "").strip():
        errors.append(f"{manifest_path.relative_to(ROOT)}: health_check.type must be non-empty")
    lifecycle = data.get("lifecycle")
    if not isinstance(lifecycle, dict) or lifecycle.get("status") not in {"active", "deprecated", "experimental", "planned"}:
        errors.append(f"{manifest_path.relative_to(ROOT)}: lifecycle.status is invalid")
        lifecycle = {}
    if lifecycle.get("deprecated") and lifecycle.get("status") != "deprecated":
        errors.append(f"{manifest_path.relative_to(ROOT)}: deprecated lifecycle must use status=deprecated")
    if lifecycle.get("status") == "deprecated" and lifecycle.get("deprecated") is not True:
        errors.append(f"{manifest_path.relative_to(ROOT)}: status=deprecated requires deprecated=true")
if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)
print("optional MCP manifest governance schema OK")
