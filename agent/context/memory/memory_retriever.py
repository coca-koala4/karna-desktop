import re
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass

from .project_memory_service import ProjectMemoryService

logger = logging.getLogger(__name__)


@dataclass
class RetrievedMemory:
    id: str
    type: str
    content: str
    priority: str
    relevance_score: float
    module: Optional[str] = None
    workspace_id: Optional[str] = None
    metadata: Dict[str, Any] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type,
            "content": self.content,
            "priority": self.priority,
            "relevance_score": self.relevance_score,
            "module": self.module,
            "workspace_id": self.workspace_id,
            "metadata": self.metadata or {},
        }


class MemoryRetriever:
    def __init__(self, memory_service: Optional[ProjectMemoryService] = None):
        self.memory_service = memory_service or ProjectMemoryService()

    def retrieve(
        self,
        query: str = "",
        workspace_id: Optional[str] = None,
        module: Optional[str] = None,
        task_id: Optional[str] = None,
        types: Optional[List[str]] = None,
        limit: int = 20,
        min_priority: Optional[str] = None,
    ) -> List[RetrievedMemory]:
        memories = self.memory_service.get_active_memories(
            workspace_id=workspace_id,
            module=module,
            task_id=task_id,
            types=types,
            limit=limit * 3,
        )

        if not memories:
            return []

        scored = []
        for mem in memories:
            score = self._compute_relevance(query, mem)
            priority_bonus = self._priority_bonus(mem.get("priority", "normal"))
            total_score = score + priority_bonus
            scored.append((mem, total_score))

        scored.sort(key=lambda x: x[1], reverse=True)

        if min_priority:
            priority_order = {"critical": 4, "high": 3, "normal": 2, "low": 1}
            min_level = priority_order.get(min_priority, 0)
            scored = [
                (m, s) for m, s in scored
                if priority_order.get(m.get("priority", "normal"), 0) >= min_level
            ]

        results = []
        for mem, score in scored[:limit]:
            results.append(RetrievedMemory(
                id=mem.get("id", ""),
                type=mem.get("type", ""),
                content=mem.get("content", ""),
                priority=mem.get("priority", "normal"),
                relevance_score=score,
                module=mem.get("module"),
                workspace_id=mem.get("workspace_id"),
                metadata={
                    "created_at": mem.get("created_at"),
                    "source": mem.get("source"),
                    "confidence": mem.get("confidence"),
                },
            ))

        return results

    def retrieve_for_compression(
        self,
        messages: List[Dict[str, Any]],
        workspace_id: Optional[str] = None,
        module: Optional[str] = None,
        task_id: Optional[str] = None,
    ) -> List[RetrievedMemory]:
        query_text = self._extract_query_from_messages(messages)
        return self.retrieve(
            query=query_text,
            workspace_id=workspace_id,
            module=module,
            task_id=task_id,
            types=["constraint", "ui_rule", "decision", "rejected_idea", "bug", "next_step"],
            limit=30,
        )

    def retrieve_for_prompt(
        self,
        user_message: str,
        workspace_id: Optional[str] = None,
        module: Optional[str] = None,
        task_id: Optional[str] = None,
        limit: int = 15,
    ) -> List[RetrievedMemory]:
        return self.retrieve(
            query=user_message,
            workspace_id=workspace_id,
            module=module,
            task_id=task_id,
            types=["constraint", "ui_rule", "decision", "rejected_idea", "bug", "next_step", "goal"],
            limit=limit,
            min_priority="normal",
        )

    def _compute_relevance(self, query: str, memory: Dict[str, Any]) -> float:
        if not query:
            return 0.5

        content = memory.get("content", "").lower()
        query_lower = query.lower()

        query_words = set(re.findall(r"[\w\u4e00-\u9fff]+", query_lower))
        content_words = set(re.findall(r"[\w\u4e00-\u9fff]+", content))

        if not query_words:
            return 0.3

        overlap = query_words & content_words
        if not overlap:
            return 0.1

        jaccard = len(overlap) / len(query_words | content_words) if (query_words | content_words) else 0

        exact_match_bonus = 0.0
        for word in query_words:
            if len(word) > 2 and word in content:
                exact_match_bonus += 0.05

        type_bonus = 0.0
        mem_type = memory.get("type", "")
        if mem_type in ("constraint", "ui_rule", "decision"):
            type_bonus = 0.1

        return min(1.0, jaccard * 0.6 + exact_match_bonus + type_bonus)

    def _priority_bonus(self, priority: str) -> float:
        bonuses = {
            "critical": 0.4,
            "high": 0.2,
            "normal": 0.0,
            "low": -0.1,
        }
        return bonuses.get(priority, 0.0)

    def _extract_query_from_messages(self, messages: List[Dict[str, Any]]) -> str:
        if not messages:
            return ""

        texts = []
        for msg in messages[-10:]:
            role = msg.get("role", "")
            if role in ("user", "assistant"):
                content = msg.get("content", "")
                if isinstance(content, str):
                    texts.append(content)
                elif isinstance(content, list):
                    for part in content:
                        if isinstance(part, dict) and part.get("type") == "text":
                            texts.append(part.get("text", ""))

        return " ".join(texts)[-2000:]


_default_retriever: Optional[MemoryRetriever] = None


def get_memory_retriever() -> MemoryRetriever:
    global _default_retriever
    if _default_retriever is None:
        _default_retriever = MemoryRetriever()
    return _default_retriever
