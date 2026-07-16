import re
import logging
from typing import List, Dict, Any, Optional, Set
from .extraction_schema import ExtractedContextItem, MemoryType, Priority, MemoryScope, SourceKind

logger = logging.getLogger(__name__)

NON_CONSTRAINT_SOURCE_KINDS: Set[str] = {
    "artifact_selection",
    "project_document",
    "imported_source",
    "tool_output",
    "subagent_output",
}


class BaseContextExtractor:
    name: str = "base"
    source_kinds_allowed: Optional[Set[str]] = None

    async def extract(
        self,
        messages: List[Dict[str, Any]],
        session_context: Dict[str, Any] = None,
    ) -> List[ExtractedContextItem]:
        raise NotImplementedError


CONSTRAINT_PATTERNS = [
    (re.compile(r"(?:一定要|必须|务必|切记)", re.IGNORECASE), "critical"),
    (re.compile(r"(?:不要|禁止|不能|不可以|别再|不许|请勿)", re.IGNORECASE), "high"),
    (re.compile(r"(?:我不喜欢|我讨厌|以后都|记住|这条很重要|重要)", re.IGNORECASE), "high"),
    (re.compile(r"(?:只有.*?才|必须.*?才|只有当.*?时)", re.IGNORECASE), "critical"),
]

UI_RULE_PATTERNS = [
    re.compile(r"(?:点击|右键|左键|双击|悬停|hover|click|right-click|left-click)", re.IGNORECASE),
    re.compile(r"(?:面板|弹窗|对话框|菜单|按钮|面板|tab|标签)", re.IGNORECASE),
    re.compile(r"(?:弹出|出现|显示|隐藏|展开|收起|打开|关闭)", re.IGNORECASE),
    re.compile(r"(?:大小|尺寸|可调整|resize|可拖拽|draggable)", re.IGNORECASE),
    re.compile(r"(?:泡泡|bubble|卡片|card|工作台|workspace|后台)", re.IGNORECASE),
]

REJECTED_PATTERNS = [
    (re.compile(r"(?:不要再?做|不要用|不.*?要.*?(?:卡片|后台|弹出|面板))", re.IGNORECASE), "high"),
    (re.compile(r"(?:不要做成|不要搞成|不要弄成|不是.*?而是)", re.IGNORECASE), "high"),
    (re.compile(r"(?:否定|否决|拒绝|放弃|不用这个|换一种)", re.IGNORECASE), "normal"),
]

BUG_PATTERNS = [
    re.compile(r"(?:报错|错误|bug|异常|crash|崩溃|失败|出错)", re.IGNORECASE),
    re.compile(r"(?:error|exception|traceback|failed|failure)", re.IGNORECASE),
    re.compile(r"(?:不工作|不生效|没反应|不对|有问题)", re.IGNORECASE),
]

NEXT_STEP_PATTERNS = [
    re.compile(r"(?:下一步|接下来|然后|后面要|以后要|接下来做|todo|待办)", re.IGNORECASE),
    re.compile(r"(?:需要做|还需要|还要|待实现|待完成|还没)", re.IGNORECASE),
]

FILE_CONTEXT_PATTERNS = [
    re.compile(r"(?:[a-zA-Z]:[\\/][^\s`'\")\]}<>]+\.[a-zA-Z0-9]+)"),
    re.compile(r"(?:~?/[^\s`'\")\]}<>]+\.[a-zA-Z0-9]+)"),
]


def _get_msg_source_kind(msg: Dict[str, Any]) -> str:
    return msg.get('_source_kind') or msg.get('source_kind') or 'user_instruction'


class RuleBasedConstraintExtractor(BaseContextExtractor):
    name = "rule_constraint"
    source_kinds_allowed = {"user_instruction"}

    async def extract(
        self,
        messages: List[Dict[str, Any]],
        session_context: Dict[str, Any] = None,
    ) -> List[ExtractedContextItem]:
        items = []
        session_context = session_context or {}
        module = session_context.get("module")
        workspace_id = session_context.get("workspace_id")
        source_kind = session_context.get("source_kind", "system_inference")
        domain = session_context.get("domain")
        writing_domain = session_context.get("writing_domain")

        for msg in messages[-20:]:
            if msg.get("role") != "user":
                continue
            msg_source_kind = _get_msg_source_kind(msg)
            if msg_source_kind in NON_CONSTRAINT_SOURCE_KINDS:
                continue
            content = _get_text_content(msg.get("content", ""))
            if not content:
                continue

            for pattern, priority in CONSTRAINT_PATTERNS:
                if pattern.search(content):
                    is_ui_rule = any(p.search(content) for p in UI_RULE_PATTERNS)
                    mem_type: MemoryType = "ui_rule" if is_ui_rule else "constraint"
                    
                    clean_content = self._clean_constraint_text(content)
                    if clean_content:
                        item = ExtractedContextItem(
                            type=mem_type,
                            content=clean_content,
                            scope="module" if module else "task",
                            priority=priority,
                            module=module,
                            workspace_id=workspace_id,
                            source_message_id=msg.get("id") or msg.get("message_id"),
                            source_kind='user_instruction',
                            domain=domain,
                            writing_domain=writing_domain,
                            authority='agent_inferred',
                            confidence=0.85,
                            status='candidate',
                        )
                        items.append(item)
                    break

        return items

    def _clean_constraint_text(self, text: str) -> str:
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) > 500:
            sentences = re.split(r"[。！？.!?]", text)
            for sent in sentences:
                sent = sent.strip()
                if any(p.search(sent) for p, _ in CONSTRAINT_PATTERNS):
                    return sent[:300]
            return text[:300]
        return text


class RuleBasedRejectedIdeaExtractor(BaseContextExtractor):
    name = "rule_rejected_idea"
    source_kinds_allowed = {"user_instruction"}

    async def extract(
        self,
        messages: List[Dict[str, Any]],
        session_context: Dict[str, Any] = None,
    ) -> List[ExtractedContextItem]:
        items = []
        session_context = session_context or {}
        module = session_context.get("module")
        workspace_id = session_context.get("workspace_id")
        source_kind = session_context.get("source_kind", "system_inference")
        domain = session_context.get("domain")
        writing_domain = session_context.get("writing_domain")

        for msg in messages[-20:]:
            if msg.get("role") != "user":
                continue
            msg_source_kind = _get_msg_source_kind(msg)
            if msg_source_kind in NON_CONSTRAINT_SOURCE_KINDS:
                continue
            content = _get_text_content(msg.get("content", ""))
            if not content:
                continue

            for pattern, priority in REJECTED_PATTERNS:
                if pattern.search(content):
                    clean_content = self._clean_rejected_text(content)
                    if clean_content:
                        item = ExtractedContextItem(
                            type="rejected_idea",
                            content=clean_content,
                            scope="module" if module else "task",
                            priority=priority,
                            module=module,
                            workspace_id=workspace_id,
                            source_message_id=msg.get("id") or msg.get("message_id"),
                            source_kind='user_instruction',
                            domain=domain,
                            writing_domain=writing_domain,
                            authority='agent_inferred',
                            confidence=0.8,
                            status='candidate',
                        )
                        items.append(item)
                    break

        return items

    def _clean_rejected_text(self, text: str) -> str:
        text = re.sub(r"\s+", " ", text).strip()
        if len(text) > 300:
            return text[:300]
        return text


class RuleBasedBugExtractor(BaseContextExtractor):
    name = "rule_bug"

    async def extract(
        self,
        messages: List[Dict[str, Any]],
        session_context: Dict[str, Any] = None,
    ) -> List[ExtractedContextItem]:
        items = []
        session_context = session_context or {}
        module = session_context.get("module")
        workspace_id = session_context.get("workspace_id")
        domain = session_context.get("domain")
        writing_domain = session_context.get("writing_domain")

        for msg in messages[-10:]:
            role = msg.get("role")
            if role not in ("user", "assistant"):
                continue
            content = _get_text_content(msg.get("content", ""))
            if not content:
                continue

            if any(p.search(content) for p in BUG_PATTERNS):
                clean_content = content[:400] if len(content) > 400 else content
                msg_source_kind = _get_msg_source_kind(msg)
                item = ExtractedContextItem(
                    type="bug",
                    content=clean_content,
                    scope="task",
                    priority="high",
                    module=module,
                    workspace_id=workspace_id,
                    source_message_id=msg.get("id") or msg.get("message_id"),
                    source_kind=msg_source_kind,
                    domain=domain,
                    writing_domain=writing_domain,
                    authority='agent_inferred',
                    confidence=0.7,
                    status='candidate',
                )
                items.append(item)

        return items


class RuleBasedNextStepExtractor(BaseContextExtractor):
    name = "rule_next_step"

    async def extract(
        self,
        messages: List[Dict[str, Any]],
        session_context: Dict[str, Any] = None,
    ) -> List[ExtractedContextItem]:
        items = []
        session_context = session_context or {}
        module = session_context.get("module")
        workspace_id = session_context.get("workspace_id")
        domain = session_context.get("domain")
        writing_domain = session_context.get("writing_domain")

        for msg in messages[-15:]:
            if msg.get("role") != "assistant":
                continue
            content = _get_text_content(msg.get("content", ""))
            if not content:
                continue

            msg_source_kind = _get_msg_source_kind(msg)
            if any(p.search(content) for p in NEXT_STEP_PATTERNS):
                lines = content.split("\n")
                for line in lines:
                    line = line.strip()
                    if any(p.search(line) for p in NEXT_STEP_PATTERNS) and len(line) > 10:
                        item = ExtractedContextItem(
                            type="next_step",
                            content=line[:300],
                            scope="task",
                            priority="normal",
                            module=module,
                            workspace_id=workspace_id,
                            source_message_id=msg.get("id") or msg.get("message_id"),
                            source_kind=msg_source_kind,
                            domain=domain,
                            writing_domain=writing_domain,
                            authority='agent_inferred',
                            confidence=0.6,
                            status='candidate',
                        )
                        items.append(item)

        return items


class RuleBasedFileContextExtractor(BaseContextExtractor):
    name = "rule_file_context"

    async def extract(
        self,
        messages: List[Dict[str, Any]],
        session_context: Dict[str, Any] = None,
    ) -> List[ExtractedContextItem]:
        items = []
        seen_files = set()
        session_context = session_context or {}
        workspace_id = session_context.get("workspace_id")
        domain = session_context.get("domain")
        writing_domain = session_context.get("writing_domain")

        for msg in messages[-30:]:
            content = _get_text_content(msg.get("content", ""))
            if not content:
                continue
            msg_source_kind = _get_msg_source_kind(msg)
            for pattern in FILE_CONTEXT_PATTERNS:
                for match in pattern.finditer(content):
                    filepath = match.group(0).rstrip(".,:;")
                    if filepath not in seen_files and len(filepath) < 300:
                        seen_files.add(filepath)
                        item = ExtractedContextItem(
                            type="active_file",
                            content=filepath,
                            scope="task",
                            priority="normal",
                            workspace_id=workspace_id,
                            source_message_id=msg.get("id") or msg.get("message_id"),
                            source_kind=msg_source_kind,
                            domain=domain,
                            writing_domain=writing_domain,
                            authority='agent_inferred',
                            confidence=0.9,
                            status='candidate',
                        )
                        items.append(item)

        return items[:20]


def _get_text_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                text = item.get("text")
                if isinstance(text, str):
                    parts.append(text)
        return "\n".join(parts)
    return str(content or "")


def get_default_extractors() -> List[BaseContextExtractor]:
    return [
        RuleBasedConstraintExtractor(),
        RuleBasedRejectedIdeaExtractor(),
        RuleBasedBugExtractor(),
        RuleBasedNextStepExtractor(),
        RuleBasedFileContextExtractor(),
    ]


class ContextExtractor:
    def __init__(self, extractors: Optional[List[BaseContextExtractor]] = None):
        self.extractors = extractors or get_default_extractors()

    async def extract_from_messages(
        self,
        messages: List[Dict[str, Any]],
        workspace_id: Optional[str] = None,
        module: Optional[str] = None,
        task_id: Optional[str] = None,
        session_id: Optional[str] = None,
        source_kind: Optional[str] = None,
        domain: Optional[str] = None,
        writing_domain: Optional[str] = None,
        source_kinds_allowed: Optional[Set[str]] = None,
    ) -> List[ExtractedContextItem]:
        session_context = {
            "workspace_id": workspace_id,
            "module": module,
            "task_id": task_id,
            "session_id": session_id,
            "source_kind": source_kind or "system_inference",
            "domain": domain,
            "writing_domain": writing_domain,
            "source_kinds_allowed": source_kinds_allowed,
        }
        all_items: List[ExtractedContextItem] = []
        seen = set()
        for extractor in self.extractors:
            try:
                items = await extractor.extract(messages, session_context=session_context)
                for item in items:
                    item.task_id = item.task_id or task_id
                    item.session_id = item.session_id or session_id
                    key = (item.type, item.content[:100])
                    if key not in seen:
                        seen.add(key)
                        all_items.append(item)
            except Exception as e:
                logger.warning(f"Extractor {extractor.name} failed: {e}")
        return all_items

    def extract_from_messages_sync(
        self,
        messages: List[Dict[str, Any]],
        workspace_id: Optional[str] = None,
        module: Optional[str] = None,
        task_id: Optional[str] = None,
        session_id: Optional[str] = None,
        source_kind: Optional[str] = None,
        domain: Optional[str] = None,
        writing_domain: Optional[str] = None,
        source_kinds_allowed: Optional[Set[str]] = None,
    ) -> List[ExtractedContextItem]:
        session_context = {
            "workspace_id": workspace_id,
            "module": module,
            "task_id": task_id,
            "session_id": session_id,
            "source_kind": source_kind or "system_inference",
            "domain": domain,
            "writing_domain": writing_domain,
            "source_kinds_allowed": source_kinds_allowed,
        }
        all_items: List[ExtractedContextItem] = []
        seen = set()
        for extractor in self.extractors:
            try:
                items = self._sync_extract(extractor, messages, session_context)
                for item in items:
                    item.task_id = item.task_id or task_id
                    item.session_id = item.session_id or session_id
                    key = (item.type, item.content[:100])
                    if key not in seen:
                        seen.add(key)
                        all_items.append(item)
            except Exception as e:
                logger.warning(f"Extractor {extractor.name} failed: {e}")
        return all_items

    def extract_from_text_sync(
        self,
        text: str,
        workspace_id: Optional[str] = None,
        module: Optional[str] = None,
        task_id: Optional[str] = None,
        session_id: Optional[str] = None,
        source_kind: Optional[str] = "user_instruction",
        domain: Optional[str] = None,
        writing_domain: Optional[str] = None,
    ) -> List[ExtractedContextItem]:
        fake_messages = [{"role": "user", "content": text, "source_kind": source_kind}]
        session_context = {
            "workspace_id": workspace_id,
            "module": module,
            "task_id": task_id,
            "session_id": session_id,
            "source_kind": source_kind,
            "domain": domain,
            "writing_domain": writing_domain,
        }
        all_items: List[ExtractedContextItem] = []
        seen = set()
        for extractor in self.extractors:
            try:
                items = self._sync_extract(extractor, fake_messages, session_context)
                for item in items:
                    item.task_id = item.task_id or task_id
                    item.session_id = item.session_id or session_id
                    key = (item.type, item.content[:100])
                    if key not in seen:
                        seen.add(key)
                        all_items.append(item)
            except Exception as e:
                logger.warning(f"Extractor {extractor.name} failed: {e}")
        return all_items

    def _sync_extract(
        self,
        extractor: BaseContextExtractor,
        messages: List[Dict[str, Any]],
        session_context: Dict[str, Any],
    ) -> List[ExtractedContextItem]:
        module = session_context.get("module")
        workspace_id = session_context.get("workspace_id")
        task_id = session_context.get("task_id")
        session_id = session_context.get("session_id")
        domain = session_context.get("domain")
        writing_domain = session_context.get("writing_domain")
        items = []

        allowed_kinds = getattr(extractor, 'source_kinds_allowed', None)

        if isinstance(extractor, RuleBasedConstraintExtractor):
            for msg in messages[-20:]:
                if msg.get("role") != "user":
                    continue
                msg_source_kind = _get_msg_source_kind(msg)
                if msg_source_kind in NON_CONSTRAINT_SOURCE_KINDS:
                    continue
                if allowed_kinds and msg_source_kind not in allowed_kinds:
                    continue
                content = _get_text_content(msg.get("content", ""))
                if not content:
                    continue
                for pattern, priority in CONSTRAINT_PATTERNS:
                    if pattern.search(content):
                        is_ui_rule = any(p.search(content) for p in UI_RULE_PATTERNS)
                        mem_type: MemoryType = "ui_rule" if is_ui_rule else "constraint"
                        clean_content = extractor._clean_constraint_text(content)
                        if clean_content:
                            items.append(ExtractedContextItem(
                                type=mem_type, content=clean_content,
                                scope="module" if module else "task", priority=priority,
                                module=module, workspace_id=workspace_id, task_id=task_id,
                                session_id=session_id,
                                source_message_id=msg.get("id") or msg.get("message_id"),
                                source_kind='user_instruction',
                                domain=domain, writing_domain=writing_domain,
                                authority='agent_inferred',
                                confidence=0.85,
                                status='candidate',
                            ))
                        break
        elif isinstance(extractor, RuleBasedRejectedIdeaExtractor):
            for msg in messages[-20:]:
                if msg.get("role") != "user":
                    continue
                msg_source_kind = _get_msg_source_kind(msg)
                if msg_source_kind in NON_CONSTRAINT_SOURCE_KINDS:
                    continue
                if allowed_kinds and msg_source_kind not in allowed_kinds:
                    continue
                content = _get_text_content(msg.get("content", ""))
                if not content:
                    continue
                for pattern, priority in REJECTED_PATTERNS:
                    if pattern.search(content):
                        clean_content = extractor._clean_rejected_text(content)
                        if clean_content:
                            items.append(ExtractedContextItem(
                                type="rejected_idea", content=clean_content,
                                scope="module" if module else "task", priority=priority,
                                module=module, workspace_id=workspace_id, task_id=task_id,
                                session_id=session_id,
                                source_message_id=msg.get("id") or msg.get("message_id"),
                                source_kind='user_instruction',
                                domain=domain, writing_domain=writing_domain,
                                authority='agent_inferred',
                                confidence=0.8,
                                status='candidate',
                            ))
                        break
        elif isinstance(extractor, RuleBasedBugExtractor):
            for msg in messages[-10:]:
                role = msg.get("role")
                if role not in ("user", "assistant"):
                    continue
                content = _get_text_content(msg.get("content", ""))
                if not content:
                    continue
                msg_source_kind = _get_msg_source_kind(msg)
                if any(p.search(content) for p in BUG_PATTERNS):
                    clean_content = content[:400] if len(content) > 400 else content
                    items.append(ExtractedContextItem(
                        type="bug", content=clean_content, scope="task",
                        priority="high", module=module, workspace_id=workspace_id, task_id=task_id,
                        session_id=session_id,
                        source_message_id=msg.get("id") or msg.get("message_id"),
                        source_kind=msg_source_kind,
                        domain=domain, writing_domain=writing_domain,
                        authority='agent_inferred',
                        confidence=0.7,
                        status='candidate',
                    ))
        elif isinstance(extractor, RuleBasedNextStepExtractor):
            for msg in messages[-15:]:
                if msg.get("role") != "assistant":
                    continue
                content = _get_text_content(msg.get("content", ""))
                if not content:
                    continue
                msg_source_kind = _get_msg_source_kind(msg)
                if any(p.search(content) for p in NEXT_STEP_PATTERNS):
                    lines = content.split("\n")
                    for line in lines:
                        line = line.strip()
                        if any(p.search(line) for p in NEXT_STEP_PATTERNS) and len(line) > 10:
                            items.append(ExtractedContextItem(
                                type="next_step", content=line[:300], scope="task",
                                priority="normal", module=module, workspace_id=workspace_id, task_id=task_id,
                                session_id=session_id,
                                source_message_id=msg.get("id") or msg.get("message_id"),
                                source_kind=msg_source_kind,
                                domain=domain, writing_domain=writing_domain,
                                authority='agent_inferred',
                                confidence=0.6,
                                status='candidate',
                            ))
        elif isinstance(extractor, RuleBasedFileContextExtractor):
            seen_files = set()
            for msg in messages[-30:]:
                content = _get_text_content(msg.get("content", ""))
                if not content:
                    continue
                msg_source_kind = _get_msg_source_kind(msg)
                for pattern in FILE_CONTEXT_PATTERNS:
                    for match in pattern.finditer(content):
                        filepath = match.group(0).rstrip(".,:;")
                        if filepath not in seen_files and len(filepath) < 300:
                            seen_files.add(filepath)
                            items.append(ExtractedContextItem(
                                type="active_file", content=filepath, scope="task",
                                priority="normal", workspace_id=workspace_id, task_id=task_id,
                                session_id=session_id,
                                source_message_id=msg.get("id") or msg.get("message_id"),
                                source_kind=msg_source_kind,
                                domain=domain, writing_domain=writing_domain,
                                authority='agent_inferred',
                                confidence=0.9,
                                status='candidate',
                            ))
        return items


def extract_constraints_from_text(
    text: str,
    workspace_id: Optional[str] = None,
    module: Optional[str] = None,
    task_id: Optional[str] = None,
    session_id: Optional[str] = None,
) -> List[ExtractedContextItem]:
    extractor = ContextExtractor()
    return extractor.extract_from_text_sync(
        text, workspace_id=workspace_id, module=module, task_id=task_id, session_id=session_id
    )
