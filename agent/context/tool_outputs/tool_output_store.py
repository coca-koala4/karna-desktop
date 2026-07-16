import sqlite3
import json
import logging
import re
from typing import List, Optional, Dict, Any
from pathlib import Path
from dataclasses import dataclass, field
from datetime import datetime

from ..memory.memory_schema import init_context_db, _generate_id, _now_iso, get_context_db_path
from ..security.secret_redactor import redact_text

logger = logging.getLogger(__name__)


@dataclass
class ToolOutputRecord:
    id: str
    workspace_id: Optional[str] = None
    task_id: Optional[str] = None
    session_id: Optional[str] = None
    node_id: Optional[str] = None
    agent_id: Optional[str] = None

    tool_name: str = ""
    output_type: str = "generic"
    source_kind: Optional[str] = None

    summary: Optional[str] = None
    full_content_ref: str = ""

    related_files: List[str] = field(default_factory=list)
    token_estimate: int = 0
    char_count: int = 0
    truncated: bool = False

    created_at: str = field(default_factory=_now_iso)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "workspace_id": self.workspace_id,
            "task_id": self.task_id,
            "session_id": self.session_id,
            "node_id": self.node_id,
            "agent_id": self.agent_id,
            "tool_name": self.tool_name,
            "output_type": self.output_type,
            "source_kind": self.source_kind,
            "summary": self.summary,
            "related_files": self.related_files,
            "token_estimate": self.token_estimate,
            "char_count": self.char_count,
            "truncated": self.truncated,
            "created_at": self.created_at,
        }

    def to_handle(self) -> str:
        files_str = ", ".join(f'"{f}"' for f in self.related_files[:3])
        if len(self.related_files) > 3:
            files_str += f", (+{len(self.related_files) - 3} more)"
        summary_text = (self.summary or "")[:100]
        trunc_mark = " [truncated]" if self.truncated else ""
        return f'[Tool output externalized: id={self.id}, type={self.output_type}{trunc_mark}, summary="{summary_text}"{f", related_files=[{files_str}]" if files_str else ""}]'


TOOL_OUTPUT_TYPES = {
    "file_diff": ["patch", "edit", "write_file", "apply_patch"],
    "terminal_log": ["terminal", "run_command", "shell"],
    "error_log": ["error", "traceback", "exception"],
    "search_result": ["search_files", "search_codebase", "web_search", "grep_search"],
    "test_result": ["test", "pytest", "jest"],
    "ui_screenshot": ["screenshot", "browser_screenshot"],
    "codex_report": ["codex", "code_review"],
    "mcp_tool_result": ["mcp_", "mcp__"],
    "browser_result": ["browser_", "web_navigate", "web_click"],
    "file_read": ["read_file", "glob", "ls", "read"],
}


def detect_output_type(tool_name: str, content: str) -> str:
    tool_lower = tool_name.lower()
    content_sample = content[:2000].lower()

    for output_type, prefixes in TOOL_OUTPUT_TYPES.items():
        for prefix in prefixes:
            if prefix in tool_lower:
                return output_type

    if "error" in content_sample or "traceback" in content_sample or "exception" in content_sample:
        return "error_log"
    if "diff" in content_sample or "---" in content_sample and "+++" in content_sample:
        return "file_diff"

    return "generic"


def detect_source_kind(tool_name: str) -> str:
    tool_lower = tool_name.lower()
    if any(k in tool_lower for k in ["search", "grep", "find"]):
        return "search_result"
    if any(k in tool_lower for k in ["read", "glob", "ls", "file"]):
        return "file_read"
    if any(k in tool_lower for k in ["browser", "web_", "navigate", "click"]):
        return "browser"
    if any(k in tool_lower for k in ["terminal", "run_command", "shell", "exec"]):
        return "tool_call"
    return "tool_call"


def extract_related_files(content: str, limit: int = 10) -> List[str]:
    files = []
    path_patterns = [
        re.compile(r"[a-zA-Z]:[\\/][^\s`'\")\]}<>]+\.[a-zA-Z0-9]+"),
        re.compile(r"~?/[^\s`'\")\]}<>]+\.[a-zA-Z0-9]+"),
        re.compile(r"(?:^|\s)([a-zA-Z0-9_\-/.]+\.(?:py|ts|tsx|js|jsx|md|json|yaml|yml|css|html|vue|go|rs|java|kt|swift))"),
    ]
    for pattern in path_patterns:
        for match in pattern.finditer(content):
            f = match.group(0) if match.lastindex is None else match.group(1)
            f = f.strip()
            if f and f not in files and len(f) < 300:
                files.append(f)
            if len(files) >= limit:
                return files
    return files


def estimate_tokens(content: str) -> int:
    return max(1, len(content) // 4)


def summarize_tool_output(tool_name: str, content: str, max_chars: int = 500) -> str:
    if not content:
        return "empty output"

    content_stripped = content.strip()
    lines = content_stripped.split("\n")
    line_count = len(lines)

    if tool_name == "terminal":
        cmd_match = re.search(r'"command"\s*:\s*"([^"]+)"', content_stripped)
        cmd = cmd_match.group(1)[:80] if cmd_match else "command"
        exit_match = re.search(r'"exit_code"\s*:\s*(-?\d+)', content_stripped)
        exit_code = exit_match.group(1) if exit_match else "?"
        return f"ran `{cmd}` -> exit {exit_code}, {line_count} lines output"

    if tool_name in ("read_file", "Glob", "LS"):
        path_match = re.search(r'"(?:path|cwd|pattern)"\s*:\s*"([^"]+)"', content_stripped)
        path = path_match.group(1)[:80] if path_match else "file"
        return f"read {path} ({len(content_stripped):,} chars)"

    if tool_name in ("Write", "Edit", "patch"):
        path_match = re.search(r'"(?:file_path|path)"\s*:\s*"([^"]+)"', content_stripped)
        path = path_match.group(1)[:80] if path_match else "file"
        return f"modified {path}"

    if tool_name in ("Grep", "search_files", "search_codebase"):
        pattern_match = re.search(r'"(?:pattern|query)"\s*:\s*"([^"]+)"', content_stripped)
        pattern = pattern_match.group(1)[:60] if pattern_match else "pattern"
        return f"search for '{pattern}' -> {line_count} matches/lines"

    if len(content_stripped) > max_chars:
        return content_stripped[:max_chars] + "..."
    return content_stripped[:max_chars]


MAX_STORED_CONTENT_CHARS = 100000


class ToolOutputStore:
    def __init__(self, db_path: Optional[Path] = None):
        self._db_path = db_path or get_context_db_path()
        self._conn: Optional[sqlite3.Connection] = None
        try:
            self._storage_dir: Path = self._db_path.parent / "tool_outputs"
            self._storage_dir.mkdir(parents=True, exist_ok=True)
        except Exception:
            import tempfile
            fallback = Path(tempfile.gettempdir()) / "karna_context" / "tool_outputs"
            fallback.mkdir(parents=True, exist_ok=True)
            self._storage_dir = fallback
            self._db_path = Path(tempfile.gettempdir()) / "karna_context" / "context_memory.db"

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = init_context_db(self._db_path)
        return self._conn

    def externalize(
        self,
        tool_name: str,
        tool_args: str,
        content: str,
        session_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        task_id: Optional[str] = None,
        node_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        source_kind: Optional[str] = None,
        summary: Optional[str] = None,
        related_files: Optional[List[str]] = None,
    ) -> ToolOutputRecord:
        output_type = detect_output_type(tool_name, content)
        detected_source_kind = source_kind or detect_source_kind(tool_name)
        original_char_count = len(content or "")
        truncated = False

        safe_content = redact_text(content or "")

        if len(safe_content) > MAX_STORED_CONTENT_CHARS:
            safe_content = safe_content[:MAX_STORED_CONTENT_CHARS]
            truncated = True

        auto_summary = summarize_tool_output(tool_name, safe_content)
        final_summary = summary or auto_summary
        auto_related_files = extract_related_files(safe_content)
        final_related_files = related_files or auto_related_files
        token_estimate = estimate_tokens(safe_content)

        record_id = f"toolout_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{_generate_id()[:8]}"

        content_path = self._storage_dir / f"{record_id}.txt"
        try:
            content_path.write_text(safe_content, encoding="utf-8")
            full_content_ref = str(content_path)
        except Exception as e:
            logger.warning(f"Failed to write tool output to disk: {e}")
            full_content_ref = "mem://" + record_id

        record = ToolOutputRecord(
            id=record_id,
            workspace_id=workspace_id,
            task_id=task_id,
            session_id=session_id,
            node_id=node_id,
            agent_id=agent_id,
            tool_name=tool_name,
            output_type=output_type,
            source_kind=detected_source_kind,
            summary=final_summary,
            full_content_ref=full_content_ref,
            related_files=final_related_files,
            token_estimate=token_estimate,
            char_count=original_char_count,
            truncated=truncated,
        )

        conn = self._get_conn()
        conn.execute(
            """
            INSERT INTO tool_output_records
            (id, workspace_id, task_id, session_id, node_id, agent_id,
             tool_name, output_type, source_kind,
             summary, full_content_ref, related_files_json, token_estimate,
             char_count, truncated, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record.id, record.workspace_id, record.task_id, record.session_id,
                record.node_id, record.agent_id,
                record.tool_name, record.output_type, record.source_kind,
                record.summary, record.full_content_ref,
                json.dumps(record.related_files, ensure_ascii=False),
                record.token_estimate, record.char_count,
                1 if record.truncated else 0, record.created_at,
            )
        )
        conn.commit()

        return record

    def get(self, record_id: str) -> Optional[Dict[str, Any]]:
        conn = self._get_conn()
        cursor = conn.execute(
            "SELECT * FROM tool_output_records WHERE id = ?",
            (record_id,),
        )
        row = cursor.fetchone()
        if not row:
            return None
        result = dict(row)
        if result.get("related_files_json"):
            try:
                result["related_files"] = json.loads(result["related_files_json"])
            except Exception:
                result["related_files"] = []
        result["truncated"] = bool(result.get("truncated", 0))
        return result

    def get_by_refs(self, refs: List[str]) -> List[ToolOutputRecord]:
        if not refs:
            return []
        conn = self._get_conn()
        placeholders = ",".join("?" * len(refs))
        cursor = conn.execute(
            f"SELECT * FROM tool_output_records WHERE id IN ({placeholders}) ORDER BY created_at ASC",
            refs,
        )
        records = []
        for row in cursor.fetchall():
            r = dict(row)
            related = []
            if r.get("related_files_json"):
                try:
                    related = json.loads(r["related_files_json"])
                except Exception:
                    related = []
            rec = ToolOutputRecord(
                id=r["id"],
                workspace_id=r.get("workspace_id"),
                task_id=r.get("task_id"),
                session_id=r.get("session_id"),
                node_id=r.get("node_id"),
                agent_id=r.get("agent_id"),
                tool_name=r.get("tool_name", ""),
                output_type=r.get("output_type", "generic"),
                source_kind=r.get("source_kind"),
                summary=r.get("summary"),
                full_content_ref=r.get("full_content_ref", ""),
                related_files=related,
                token_estimate=r.get("token_estimate", 0) or 0,
                char_count=r.get("char_count", 0) or 0,
                truncated=bool(r.get("truncated", 0)),
                created_at=r.get("created_at", _now_iso()),
            )
            records.append(rec)
        return records

    def get_full_content(self, record_id: str) -> Optional[str]:
        record = self.get(record_id)
        if not record:
            return None
        ref = record.get("full_content_ref", "")
        if ref.startswith("mem://"):
            return None
        try:
            path = Path(ref)
            if path.exists():
                return path.read_text(encoding="utf-8")
        except Exception as e:
            logger.warning(f"Failed to read tool output {record_id}: {e}")
        return None

    def get_session_outputs(self, session_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        cursor = conn.execute(
            "SELECT * FROM tool_output_records WHERE session_id = ? ORDER BY created_at DESC LIMIT ?",
            (session_id, limit),
        )
        results = []
        for row in cursor.fetchall():
            r = dict(row)
            if r.get("related_files_json"):
                try:
                    r["related_files"] = json.loads(r["related_files_json"])
                except Exception:
                    r["related_files"] = []
            r["truncated"] = bool(r.get("truncated", 0))
            results.append(r)
        return results
