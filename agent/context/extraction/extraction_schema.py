from dataclasses import dataclass, field
from typing import Literal, Optional, List, Any
from datetime import datetime

MemoryScope = Literal["global", "workspace", "module", "task"]
MemoryType = Literal[
    "goal",
    "constraint",
    "decision",
    "rejected_idea",
    "active_file",
    "ui_rule",
    "data_model",
    "bug",
    "next_step",
    "user_preference",
    "audience",
    "deliverable",
    "style_rule",
    "terminology",
    "character_fact",
    "world_fact",
    "plot_fact",
    "citation_rule",
    "evidence",
]

Priority = Literal["low", "normal", "high", "critical"]

SourceKind = Literal[
    "user_instruction",
    "system_inference",
    "artifact_selection",
    "project_document",
    "imported_source",
    "tool_output",
    "subagent_output",
    "node_summary",
    "retrieved_memory",
]


@dataclass
class ExtractedContextItem:
    type: MemoryType
    content: str
    scope: MemoryScope
    priority: Priority = "normal"

    workspace_id: Optional[str] = None
    module: Optional[str] = None
    task_id: Optional[str] = None
    session_id: Optional[str] = None
    artifact_id: Optional[str] = None

    source_message_id: Optional[str] = None
    source_kind: SourceKind = "system_inference"
    domain: Optional[str] = None
    writing_domain: Optional[str] = None
    source_ref: Optional[str] = None
    source_quote: Optional[str] = None
    authority: str = "agent_inferred"
    confirmed_by: Optional[str] = None

    confidence: float = 1.0

    status: str = "candidate"
    created_at: Optional[str] = None
    id: Optional[str] = None

    def __post_init__(self):
        if self.created_at is None:
            self.created_at = datetime.utcnow().isoformat()

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type,
            "content": self.content,
            "scope": self.scope,
            "priority": self.priority,
            "workspace_id": self.workspace_id,
            "module": self.module,
            "task_id": self.task_id,
            "session_id": self.session_id,
            "artifact_id": self.artifact_id,
            "source_message_id": self.source_message_id,
            "source_kind": self.source_kind,
            "domain": self.domain,
            "writing_domain": self.writing_domain,
            "source_ref": self.source_ref,
            "source_quote": self.source_quote,
            "authority": self.authority,
            "confirmed_by": self.confirmed_by,
            "confidence": self.confidence,
            "status": self.status,
            "created_at": self.created_at,
        }
