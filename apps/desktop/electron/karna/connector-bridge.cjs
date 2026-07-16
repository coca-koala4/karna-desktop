'use strict'

const { execFile } = require('node:child_process')
const path = require('node:path')

const CONNECTOR_BRIDGE_SCRIPT = String.raw`
import json
import sys
import traceback
from pathlib import Path

project_root = Path.cwd()
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

try:
    from fastapi import HTTPException
    from hermes_cli import connectors

    payload = json.loads(sys.stdin.read() or "{}")
    action = payload.get("action")
    body = payload.get("body") if isinstance(payload.get("body"), dict) else {}
    ref = str(payload.get("ref") or "")

    if action == "definitions":
        data = {"items": connectors.load_definitions()}
    elif action == "advanced_definitions":
        data = {"items": connectors.load_advanced_definitions()}
    elif action == "instances":
        data = {"items": connectors.list_instances()}
    elif action == "create_instance":
        data = connectors.create_instance(body)
    elif action == "update_instance":
        data = connectors.update_instance(ref, body)
    elif action == "delete_instance":
        data = connectors.delete_instance(ref)
    elif action == "delete_credential":
        data = connectors.clear_instance_credential(ref)
    elif action == "test_instance":
        data = connectors.test_instance(ref)
    elif action == "toggle_tool":
        data = connectors.set_tool_enabled(ref, bool(body.get("enabled")))
    elif action == "call_tool":
        data = connectors.call_tool(ref, body.get("arguments") if isinstance(body.get("arguments"), dict) else {}, bool(body.get("confirmed")), body.get("project_id") or body.get("projectId"))
    elif action == "audit_logs":
        limit = int(body.get("limit") or 80)
        data = {"items": connectors.list_audit_logs(limit=limit, instance_id=body.get("instance_id") or body.get("instanceId"), project_id=body.get("project_id") or body.get("projectId"))}
    elif action == "health_check":
        data = connectors.health_check_all()
    elif action == "route_tools":
        data = connectors.route_tools(intent=body.get("intent"), text=body.get("text"))
    else:
        raise HTTPException(status_code=404, detail=f"Unsupported connector action: {action}")
    print(json.dumps({"ok": True, "data": data}, ensure_ascii=False))
except HTTPException as exc:
    print(json.dumps({"ok": False, "status": getattr(exc, "status_code", 500), "error": str(getattr(exc, "detail", exc))}, ensure_ascii=False))
except Exception as exc:
    print(json.dumps({"ok": False, "status": 500, "error": str(exc), "traceback": traceback.format_exc(limit=8)}, ensure_ascii=False))
`

function createConnectorBridge({ dataRoot, findPython, notConfigured, projectRoot }) {
  const root = projectRoot || path.resolve(__dirname, '..', '..', '..')

  return function runConnectorBridge(action, { body = {}, ref = '', timeoutMs = 30_000 } = {}) {
    const pythonCmd = findPython()
    const pythonPath = [root, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)
    const input = JSON.stringify({ action, body, ref })

    return new Promise(resolve => {
      const child = execFile(
        pythonCmd,
        ['-c', CONNECTOR_BRIDGE_SCRIPT],
        {
          cwd: root,
          encoding: 'utf8',
          env: {
            ...process.env,
            HERMES_HOME: dataRoot,
            KARNA_DATA_DIR: dataRoot,
            KARNA_DESKTOP_DATA_DIR: dataRoot,
            PYTHONIOENCODING: 'utf-8',
            PYTHONPATH: pythonPath
          },
          maxBuffer: 10 * 1024 * 1024,
          timeout: timeoutMs,
          windowsHide: true
        },
        (err, stdout, stderr) => {
          if (err) {
            resolve(notConfigured('connectors', err.message, { stderr: String(stderr || '').slice(0, 2000) }))

            return
          }

          try {
            const parsed = JSON.parse(String(stdout || '').trim() || '{}')

            if (parsed.ok) resolve(parsed.data)
            else resolve(notConfigured('connectors', parsed.error || 'Connector bridge failed.', { status: parsed.status, traceback: parsed.traceback }))
          } catch (parseErr) {
            resolve(notConfigured('connectors', parseErr instanceof Error ? parseErr.message : String(parseErr), { stdout: String(stdout || '').slice(0, 2000), stderr: String(stderr || '').slice(0, 2000) }))
          }
        }
      )

      child.stdin.end(input)
    })
  }
}

module.exports = { CONNECTOR_BRIDGE_SCRIPT, createConnectorBridge }
