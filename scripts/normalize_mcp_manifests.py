"""Normalize optional MCP manifests to the Karna governance schema.

The upstream source catalogue does not reliably publish package versions or
fine-grained tool permissions.  ``version: unresolved`` preserves that fact
instead of inventing a version; installation must resolve and record the
actual package version before enabling a server.
"""
from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_ROOT = ROOT / "optional-mcps"


def permissions_for(name: str, package: str) -> list[str]:
    token = f"{name} {package}".lower()
    if "filesystem" in token or "desktop-commander" in token:
        return ["filesystem:read", "filesystem:write"]
    if any(word in token for word in ("postgres", "mysql", "mongodb", "redis", "supabase", "neon")):
        return ["network:outbound", "database:read", "database:write"]
    if any(word in token for word in ("browser", "playwright", "puppeteer")):
        return ["network:outbound", "browser:control"]
    return ["network:outbound"]


def normalize(manifest: dict, directory: Path) -> dict:
    transport = manifest.get("transport") or {}
    args = transport.get("args") or []
    package = str(args[-1]) if args else "unresolved"
    name = str(manifest.get("name") or directory.name)
    manifest["manifest_version"] = max(2, int(manifest.get("manifest_version") or 1))
    manifest["id"] = str(manifest.get("id") or directory.name)
    manifest["version"] = str(manifest.get("version") or "unresolved")
    manifest["source"] = str(manifest.get("source") or "unresolved")
    manifest["dependencies"] = manifest.get("dependencies") or {
        "runtime": "npm" if transport.get("command") == "npx" else "external",
        "package": package,
    }
    manifest["permissions"] = manifest.get("permissions") or permissions_for(name, package)
    manifest["health_check"] = manifest.get("health_check") or {
        "type": "mcp_initialize",
        "timeout_ms": 10000,
    }
    manifest["lifecycle"] = manifest.get("lifecycle") or {
        "status": "active",
        "deprecated": False,
    }
    return manifest


def main() -> None:
    changed = 0
    for manifest_path in sorted(MANIFEST_ROOT.glob("*/manifest.yaml")):
        raw = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
        normalized = normalize(raw, manifest_path.parent)
        rendered = yaml.safe_dump(normalized, allow_unicode=True, sort_keys=False)
        if manifest_path.read_text(encoding="utf-8") != rendered:
            manifest_path.write_text(rendered, encoding="utf-8")
            changed += 1
    print(f"normalized {changed} optional MCP manifests")


if __name__ == "__main__":
    main()
