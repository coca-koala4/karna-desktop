"""BuiltinMCPServer — 内置连接器 MCP Server 基类。

通过 stdio 传输，使用 JSON-RPC 2.0 协议。
子类继承 BuiltinMCPServer，定义 tools 列表并实现对应的 handle_xxx 方法。
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import uuid
from datetime import datetime
from pathlib import Path


class BuiltinMCPServer:
    """所有内置连接器 MCP Server 的基类。"""

    server_name: str = ""
    server_version: str = "0.1.0"
    tools: list[dict] = []

    def __init__(self, connector_id: str):
        self.connector_id = connector_id
        hermes_home = os.environ.get(
            "HERMES_HOME", str(Path.home() / ".hermes")
        )
        self.data_dir = (
            Path(hermes_home) / "connector-workshop" / "data" / connector_id
        )
        self.data_dir.mkdir(parents=True, exist_ok=True)

    # ── 数据持久化 ──────────────────────────────────────────────

    def _load_json(self, filename: str):
        """从 data_dir 加载 JSON 文件，不存在则返回空列表。"""
        path = self.data_dir / filename
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        return []

    def _save_json(self, filename: str, data):
        """将数据以 JSON 写入 data_dir 下的文件。"""
        path = self.data_dir / filename
        path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    def _ensure_data_dir(self):
        """确保 data_dir 存在。"""
        self.data_dir.mkdir(parents=True, exist_ok=True)

    # ── 工具方法 ────────────────────────────────────────────────

    def _now(self) -> str:
        return datetime.now().isoformat()

    def _new_id(self) -> str:
        return str(uuid.uuid4())[:8]

    # ── 工具调用路由 ────────────────────────────────────────────

    async def handle_tool_call(self, tool_name: str, arguments: dict) -> dict:
        handler = getattr(self, f"handle_{tool_name}", None)
        if handler is None:
            return {"error": f"Unknown tool: {tool_name}"}
        return await handler(arguments)

    # ── stdio 事件循环 ──────────────────────────────────────────

    async def run(self):
        # Keep stdio handling deliberately synchronous.  The asyncio
        # connect_read_pipe/connect_write_pipe path is fragile on Windows
        # subprocess pipes (WinError 6 invalid handle under ProactorEventLoop),
        # while MCP stdio is newline-delimited and does not require async pipe
        # transports.
        for line in sys.stdin:
            if not line:
                break
            try:
                request = json.loads(line.strip())
                response = await self._handle_request(request)
                if response is not None:
                    sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
                    sys.stdout.flush()
            except Exception as e:
                error_resp = {
                    "jsonrpc": "2.0",
                    "id": None,
                    "error": {"code": -32603, "message": str(e)},
                }
                sys.stdout.write(json.dumps(error_resp, ensure_ascii=False) + "\n")
                sys.stdout.flush()

    async def _handle_request(self, request: dict):
        method = request.get("method", "")
        req_id = request.get("id")

        if method == "initialize":
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "serverInfo": {
                        "name": self.server_name,
                        "version": self.server_version,
                    },
                    "capabilities": {"tools": {}},
                },
            }
        elif method == "tools/list":
            return {"jsonrpc": "2.0", "id": req_id, "result": {"tools": self.tools}}
        elif method == "tools/call":
            params = request.get("params", {})
            tool_name = params.get("name", "")
            arguments = params.get("arguments", {})
            result = await self.handle_tool_call(tool_name, arguments)
            if "error" in result:
                return {
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {"code": -32602, "message": result["error"]},
                }
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(result, ensure_ascii=False),
                        }
                    ]
                },
            }
        elif method == "notifications/initialized":
            return None
        else:
            return {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": -32601, "message": f"Method not found: {method}"},
            }


def run_server(server: BuiltinMCPServer):
    """Helper to start a server from __main__ block."""
    asyncio.run(server.run())
