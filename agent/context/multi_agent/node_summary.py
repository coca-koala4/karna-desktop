from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any
from datetime import datetime


@dataclass
class NodeRunSummary:
    node_id: str
    node_name: str
    agent_role: str = ""

    goal: str = ""
    status: str = "pending"

    key_findings: List[str] = field(default_factory=list)
    decisions_made: List[str] = field(default_factory=list)
    files_modified: List[str] = field(default_factory=list)
    errors_encountered: List[str] = field(default_factory=list)

    output_summary: str = ""
    token_estimate: int = 0
    duration_seconds: float = 0.0

    upstream_summary_ids: List[str] = field(default_factory=list)
    downstream_target_nodes: List[str] = field(default_factory=list)

    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    completed_at: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "node_id": self.node_id,
            "node_name": self.node_name,
            "agent_role": self.agent_role,
            "goal": self.goal,
            "status": self.status,
            "key_findings": self.key_findings,
            "decisions_made": self.decisions_made,
            "files_modified": self.files_modified,
            "errors_encountered": self.errors_encountered,
            "output_summary": self.output_summary,
            "token_estimate": self.token_estimate,
            "duration_seconds": self.duration_seconds,
            "upstream_summary_ids": self.upstream_summary_ids,
            "downstream_target_nodes": self.downstream_target_nodes,
            "created_at": self.created_at,
            "completed_at": self.completed_at,
        }

    def to_markdown(self) -> str:
        lines = []
        lines.append(f"### Node: {self.node_name} ({self.status})")
        if self.agent_role:
            lines.append(f"**Role**: {self.agent_role}")
        if self.goal:
            lines.append(f"**Goal**: {self.goal}")
        if self.key_findings:
            lines.append("**Key Findings**:")
            for f in self.key_findings:
                lines.append(f"- {f}")
        if self.decisions_made:
            lines.append("**Decisions**:")
            for d in self.decisions_made:
                lines.append(f"- {d}")
        if self.files_modified:
            lines.append("**Files Modified**:")
            for f in self.files_modified:
                lines.append(f"- {f}")
        if self.errors_encountered:
            lines.append("**Errors**:")
            for e in self.errors_encountered:
                lines.append(f"- {e}")
        if self.output_summary:
            lines.append(f"**Summary**: {self.output_summary}")
        lines.append(f"**Tokens**: ~{self.token_estimate}, **Duration**: {self.duration_seconds:.1f}s")
        return "\n".join(lines)

    def mark_completed(self, duration_seconds: Optional[float] = None):
        self.status = "completed"
        self.completed_at = datetime.utcnow().isoformat()
        if duration_seconds is not None:
            self.duration_seconds = duration_seconds

    def mark_failed(self, error: str):
        self.status = "failed"
        self.completed_at = datetime.utcnow().isoformat()
        self.errors_encountered.append(error)


@dataclass
class FlowRunSummary:
    flow_id: str
    flow_name: str
    nodes: List[NodeRunSummary] = field(default_factory=list)
    overall_goal: str = ""
    status: str = "pending"
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    completed_at: Optional[str] = None

    def add_node_summary(self, node: NodeRunSummary):
        self.nodes.append(node)

    def get_node_summary(self, node_id: str) -> Optional[NodeRunSummary]:
        for node in self.nodes:
            if node.node_id == node_id:
                return node
        return None

    def aggregate_to_parent(self) -> str:
        lines = [f"## Multi-Agent Flow: {self.flow_name}"]
        if self.overall_goal:
            lines.append(f"**Goal**: {self.overall_goal}")
        lines.append("")
        for node in self.nodes:
            lines.append(node.to_markdown())
            lines.append("")
        return "\n".join(lines)

    def to_dict(self) -> dict:
        return {
            "flow_id": self.flow_id,
            "flow_name": self.flow_name,
            "overall_goal": self.overall_goal,
            "status": self.status,
            "nodes": [n.to_dict() for n in self.nodes],
            "created_at": self.created_at,
            "completed_at": self.completed_at,
        }


NODE_SUMMARY_PROMPT = """Summarize the work done by this sub-agent node concisely.
Output JSON with:
{{
  "goal": "What this node was tasked to do",
  "key_findings": ["List of key findings/facts discovered"],
  "decisions_made": ["List of decisions made"],
  "files_modified": ["List of files created/modified"],
  "errors_encountered": ["Any errors or issues encountered"],
  "output_summary": "1-2 sentence summary of what was accomplished"
}}

Sub-agent output:
---
{agent_output}
---

Output ONLY valid JSON.
"""
