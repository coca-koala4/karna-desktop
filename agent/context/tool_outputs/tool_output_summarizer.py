import re
import logging
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ToolOutputSummary:
    tool_name: str
    summary_text: str
    key_findings: List[str] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)
    output_type: str = "general"
    char_count: int = 0
    line_count: int = 0
    truncated: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tool_name": self.tool_name,
            "summary_text": self.summary_text,
            "key_findings": self.key_findings,
            "errors": self.errors,
            "output_type": self.output_type,
            "char_count": self.char_count,
            "line_count": self.line_count,
            "truncated": self.truncated,
        }

    def to_handle_text(self, handle_id: str) -> str:
        lines = [
            f"[Tool Output: {self.tool_name}] (handle: {handle_id})",
            f"Summary: {self.summary_text}",
        ]
        if self.key_findings:
            lines.append("Key findings:")
            for finding in self.key_findings[:5]:
                lines.append(f"  - {finding}")
        if self.errors:
            lines.append(f"Errors found: {len(self.errors)}")
        lines.append(f"Size: {self.char_count} chars, {self.line_count} lines")
        return "\n".join(lines)


class ToolOutputSummarizer:
    MAX_INLINE_CHARS = 2000
    MAX_SUMMARY_LENGTH = 500

    def summarize(
        self,
        tool_name: str,
        content: str,
        tool_args: Optional[str] = None,
    ) -> ToolOutputSummary:
        if not content:
            return ToolOutputSummary(
                tool_name=tool_name,
                summary_text="Empty output",
                char_count=0,
                line_count=0,
            )

        char_count = len(content)
        line_count = len(content.splitlines())
        truncated = char_count > self.MAX_INLINE_CHARS

        output_type = self._detect_output_type(tool_name, content)
        key_findings = self._extract_key_findings(tool_name, content, output_type)
        errors = self._extract_errors(content)

        summary_text = self._generate_summary(
            tool_name=tool_name,
            content=content,
            output_type=output_type,
            key_findings=key_findings,
            errors=errors,
            char_count=char_count,
            line_count=line_count,
        )

        return ToolOutputSummary(
            tool_name=tool_name,
            summary_text=summary_text,
            key_findings=key_findings,
            errors=errors,
            output_type=output_type,
            char_count=char_count,
            line_count=line_count,
            truncated=truncated,
        )

    def _detect_output_type(self, tool_name: str, content: str) -> str:
        tool_lower = tool_name.lower()

        if any(k in tool_lower for k in ["grep", "search", "find", "rg"]):
            return "search_results"
        if any(k in tool_lower for k in ["read", "view", "cat", "file"]):
            return "file_content"
        if any(k in tool_lower for k in ["write", "edit", "patch", "diff"]):
            return "code_diff"
        if any(k in tool_lower for k in ["ls", "dir", "list", "glob"]):
            return "directory_listing"
        if any(k in tool_lower for k in ["run", "exec", "command", "bash", "shell"]):
            return "command_output"
        if any(k in tool_lower for k in ["error", "traceback", "bug", "debug"]):
            return "error_output"
        if content.strip().startswith("{") or content.strip().startswith("["):
            return "json_output"

        return "general"

    def _extract_key_findings(
        self, tool_name: str, content: str, output_type: str
    ) -> List[str]:
        findings = []

        if output_type == "search_results":
            matches = re.findall(r"^.*:\d+:.*$", content, re.MULTILINE)
            if matches:
                findings.append(f"Found {len(matches)} matching lines")
                for m in matches[:3]:
                    findings.append(m[:100])

        elif output_type == "file_content":
            lines = content.splitlines()
            findings.append(f"File has {len(lines)} lines")
            first_non_empty = next(
                (l.strip() for l in lines if l.strip()), ""
            )
            if first_non_empty:
                findings.append(f"Starts with: {first_non_empty[:80]}")

        elif output_type == "directory_listing":
            entries = [l.strip() for l in content.splitlines() if l.strip()]
            findings.append(f"Listed {len(entries)} entries")
            if entries:
                findings.append(f"First entry: {entries[0][:60]}")

        elif output_type == "command_output":
            lines = [l.strip() for l in content.splitlines() if l.strip()]
            if lines:
                findings.append(f"Command produced {len(lines)} output lines")
                findings.append(f"First line: {lines[0][:80]}")

        if len(findings) > 5:
            findings = findings[:5]

        return findings

    def _extract_errors(self, content: str) -> List[str]:
        errors = []

        error_patterns = [
            r"(?:Error|ERROR|error):\s*.+",
            r"(?:Exception|EXCEPTION|exception):\s*.+",
            r"(?:Traceback|traceback).*",
            r"(?:failed|FAILED|Failed).*",
            r"^\s*at\s+.*\(\d+[:\)]\d*\)",
        ]

        for pattern in error_patterns:
            matches = re.findall(pattern, content, re.MULTILINE)
            for m in matches[:3]:
                m = m.strip()
                if m and m not in errors and len(m) < 200:
                    errors.append(m)

        return errors[:5]

    def _generate_summary(
        self,
        tool_name: str,
        content: str,
        output_type: str,
        key_findings: List[str],
        errors: List[str],
        char_count: int,
        line_count: int,
    ) -> str:
        if errors:
            error_part = f"{len(errors)} error(s) found. "
        else:
            error_part = ""

        if key_findings:
            finding_part = key_findings[0]
        else:
            preview = content[:200].replace("\n", " ").strip()
            finding_part = f"Preview: {preview[:100]}..."

        summary = (
            f"{error_part}"
            f"{tool_name} output ({char_count} chars, {line_count} lines). "
            f"{finding_part}"
        )

        if len(summary) > self.MAX_SUMMARY_LENGTH:
            summary = summary[: self.MAX_SUMMARY_LENGTH - 3] + "..."

        return summary

    def should_externalize(self, content: str) -> bool:
        return len(content) > self.MAX_INLINE_CHARS

    def get_handle_placeholder(
        self, handle_id: str, tool_name: str, summary: ToolOutputSummary
    ) -> str:
        return summary.to_handle_text(handle_id)


_default_summarizer: Optional[ToolOutputSummarizer] = None


def get_tool_output_summarizer() -> ToolOutputSummarizer:
    global _default_summarizer
    if _default_summarizer is None:
        _default_summarizer = ToolOutputSummarizer()
    return _default_summarizer
