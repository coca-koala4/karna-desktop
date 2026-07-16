import json
import logging
import os
from typing import List, Optional, Dict, Any, Tuple
from pathlib import Path

from .context_envelope import ContextEnvelope, set_current_envelope, get_current_envelope
from .compressor import CompressionProfile, get_profile
from .compressor.summary_schema import CompressionSummary, NEW_SUMMARY_PROMPT_TEMPLATE
from .compressor.compression_quality import check_summary_quality, should_retry_compression, get_quality_retry_prompt_addition
from .extraction import ContextExtractor, ExtractedContextItem, extract_constraints_from_text
from .memory import ProjectMemoryService, PinnedContextService, init_context_db
from .tool_outputs import ToolOutputStore, ToolOutputRecord
from .rebuild import ContextRebuilder, ContextBuildRequest, BuiltContext, build_prompt_context
from .token_os import (
    TokenPlanner, TokenPolicy, BALANCED_POLICY, SAVING_POLICY, QUALITY_POLICY,
    get_token_ledger, estimate_messages_tokens, dedupe_messages, trim_to_budget,
    estimate_context_breakdown, get_context_window, get_reserved_output,
)

logger = logging.getLogger(__name__)


class ContextOrchestrator:
    def __init__(
        self,
        workspace_root: Optional[Path] = None,
        default_profile: str = "agent_chat",
        envelope: Optional[ContextEnvelope] = None,
    ):
        self.workspace_root = workspace_root or Path.cwd()
        self._profile_name = default_profile
        self._envelope: Optional[ContextEnvelope] = envelope

        init_context_db()

        self.memory_service = ProjectMemoryService()
        self.pinned_service = PinnedContextService()
        self.tool_output_store = ToolOutputStore()
        self.context_extractor = ContextExtractor()
        self.context_rebuilder = ContextRebuilder(
            memory_service=self.memory_service,
            pinned_service=self.pinned_service,
        )
        self.token_planner = TokenPlanner()
        self.token_policy: TokenPolicy = BALANCED_POLICY

        self._current_summary: Optional[CompressionSummary] = None

    def get_profile(self, profile_name: Optional[str] = None) -> CompressionProfile:
        return get_profile(profile_name or self._profile_name)

    def set_profile(self, profile_name: str):
        self._profile_name = profile_name

    @property
    def envelope(self) -> Optional[ContextEnvelope]:
        return self._envelope

    @envelope.setter
    def envelope(self, env: Optional[ContextEnvelope]):
        self._envelope = env
        if env is not None:
            set_current_envelope(env)
            if env.writing_domain:
                self._profile_name = env.get_effective_profile()

    def set_envelope(self, env: Optional[ContextEnvelope]):
        self.envelope = env

    def get_pinned_contexts(self) -> List[str]:
        env = get_current_envelope() or self._envelope
        rows = self.pinned_service.get_active_pins(
            workspace_id=env.get_scope_id() if env else None,
            module=env.module if env else None,
            task_id=env.task_id if env else None,
        )
        return [str(row.get("content") or "") for row in rows if row.get("content")]

    def extract_and_store_context(
        self,
        messages: List[Dict[str, Any]],
        workspace_id: Optional[str] = None,
        module: Optional[str] = None,
        task_id: Optional[str] = None,
        session_id: Optional[str] = None,
        source_kind: Optional[str] = None,
    ) -> List[str]:
        items = self.context_extractor.extract_from_messages_sync(
            messages,
            workspace_id=workspace_id,
            module=module,
            task_id=task_id,
            session_id=session_id,
            source_kind=source_kind,
        )

        if items:
            self.memory_service.add_memories(items)

        return [item.id for item in items if item.id]

    def extract_constraints_from_text(
        self,
        text: str,
        workspace_id: Optional[str] = None,
        module: Optional[str] = None,
        task_id: Optional[str] = None,
    ) -> List[ExtractedContextItem]:
        return extract_constraints_from_text(
            text,
            workspace_id=workspace_id,
            module=module,
            task_id=task_id,
        )

    def externalize_tool_output(
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
        effective_envelope = get_current_envelope() or self._envelope
        effective_session_id = session_id
        effective_task_id = task_id
        effective_workspace_id = workspace_id
        if effective_envelope:
            if not effective_session_id:
                effective_session_id = effective_envelope.session_id
            if not effective_task_id:
                effective_task_id = effective_envelope.task_id
            if not effective_workspace_id:
                effective_workspace_id = effective_envelope.get_scope_id()
        return self.tool_output_store.externalize(
            tool_name=tool_name,
            tool_args=tool_args,
            content=content,
            session_id=effective_session_id,
            workspace_id=effective_workspace_id,
            task_id=effective_task_id,
            node_id=node_id,
            agent_id=agent_id,
            source_kind=source_kind,
            summary=summary,
            related_files=related_files,
        )

    TOOL_OUTPUT_EXTERNALIZE_THRESHOLD = 4000

    def scan_and_externalize_tool_outputs(
        self,
        messages: List[Dict[str, Any]],
        session_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        task_id: Optional[str] = None,
        node_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        threshold_chars: int = TOOL_OUTPUT_EXTERNALIZE_THRESHOLD,
    ) -> int:
        effective_envelope = get_current_envelope() or self._envelope
        effective_session_id = session_id
        effective_task_id = task_id
        effective_workspace_id = workspace_id
        if effective_envelope:
            if not effective_session_id:
                effective_session_id = effective_envelope.session_id
            if not effective_task_id:
                effective_task_id = effective_envelope.task_id
            if not effective_workspace_id:
                effective_workspace_id = effective_envelope.get_scope_id()

        externalized_count = 0
        for msg in messages:
            if not isinstance(msg, dict):
                continue
            role = msg.get("role", "")
            if role not in ("tool", "function"):
                if msg.get("role") == "assistant":
                    tool_calls = msg.get("tool_calls") or []
                    for tc in tool_calls:
                        if not isinstance(tc, dict):
                            continue
                        fn = tc.get("function", {})
                        if not isinstance(fn, dict):
                            continue
                        args_str = fn.get("arguments", "")
                        if isinstance(args_str, str) and len(args_str) > threshold_chars * 2:
                            pass
                continue

            content = msg.get("content", "")
            if not isinstance(content, str):
                continue
            if len(content) <= threshold_chars:
                continue

            tool_name = msg.get("name", "") or "unknown_tool"
            msg_node_id = node_id or msg.get("__node_id__")
            msg_agent_id = agent_id or msg.get("__agent_id__")
            try:
                record = self.tool_output_store.externalize(
                    tool_name=tool_name,
                    tool_args="",
                    content=content,
                    session_id=effective_session_id,
                    workspace_id=effective_workspace_id,
                    task_id=effective_task_id,
                    node_id=msg_node_id,
                    agent_id=msg_agent_id,
                )
                placeholder = record.to_handle()
                msg["content"] = placeholder
                msg["__externalized__"] = True
                msg["__externalized_id__"] = record.id
                externalized_count += 1
            except Exception as e:
                logger.debug("Failed to externalize tool output: %s", e)

        return externalized_count

    def load_summary_from_json(self, json_str: str) -> Optional[CompressionSummary]:
        try:
            data = json.loads(json_str)
            self._current_summary = CompressionSummary.from_dict(data)
            return self._current_summary
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            logger.warning(f"Failed to parse summary JSON: {e}")
            return None

    def load_summary_from_markdown(self, md_content: str) -> CompressionSummary:
        summary = _parse_summary_markdown(md_content)
        self._current_summary = summary
        return summary

    def get_current_summary(self) -> Optional[CompressionSummary]:
        return self._current_summary

    def set_current_summary(self, summary: CompressionSummary):
        self._current_summary = summary

    def merge_summary(self, new_summary: CompressionSummary) -> CompressionSummary:
        if self._current_summary:
            merged = self._current_summary.merge(new_summary)
        else:
            merged = new_summary
        self._current_summary = merged
        return merged

    def build_summary_prompt(
        self,
        conversation_text: str,
        previous_summary_json: Optional[str] = None,
    ) -> str:
        previous_summary = previous_summary_json or ""
        if self._current_summary and not previous_summary_json:
            try:
                previous_summary = json.dumps(self._current_summary.to_dict(), ensure_ascii=False)
            except Exception:
                previous_summary = self._current_summary.to_markdown()

        return NEW_SUMMARY_PROMPT_TEMPLATE.format(
            conversation_text=conversation_text,
            previous_summary=previous_summary,
        )

    def validate_and_improve_summary(
        self,
        summary_json: str,
        conversation_text: str,
        workspace_id: Optional[str] = None,
        module: Optional[str] = None,
        task_id: Optional[str] = None,
    ) -> Tuple[Optional[CompressionSummary], bool, str]:
        summary = self.load_summary_from_json(summary_json)
        if summary is None:
            return None, False, "Failed to parse summary JSON"

        pinned_contexts = self.pinned_service.get_active_pins(
            workspace_id=workspace_id,
            module=module,
            task_id=task_id,
        )

        quality_check, passes = check_summary_quality(
            summary,
            pinned_contexts=pinned_contexts,
        )

        if passes:
            return summary, True, ""

        if should_retry_compression(quality_check):
            retry_prompt_addition = get_quality_retry_prompt_addition(quality_check)
            return summary, False, retry_prompt_addition

        return summary, True, ""

    def set_token_policy(self, policy: TokenPolicy):
        self.token_policy = policy
        # TokenPlanner owns its own policy reference.  Keeping only
        # ``self.token_policy`` up to date made persisted Saving/Quality/Hard
        # policies visible in the UI while every real plan still used the
        # constructor default.
        self.token_planner.policy = policy

    def build_context_for_prompt(
        self,
        session_id: str,
        user_message: str = "",
        workspace_id: Optional[str] = None,
        module: Optional[str] = None,
        task_id: Optional[str] = None,
        mode: Optional[str] = None,
        active_file_path: Optional[str] = None,
        selection_text: Optional[str] = None,
        active_soul_id: Optional[str] = None,
        active_flow_id: Optional[str] = None,
        include_summary: bool = True,
        envelope: Optional[ContextEnvelope] = None,
    ) -> BuiltContext:
        effective_envelope = envelope or get_current_envelope() or self._envelope

        if effective_envelope:
            set_current_envelope(effective_envelope)
            effective_profile = effective_envelope.get_effective_profile()
            writing_domain = effective_envelope.writing_domain
            if effective_envelope.get_scope_id() and not workspace_id:
                workspace_id = effective_envelope.get_scope_id()
            if effective_envelope.module and not module:
                module = effective_envelope.module
            if effective_envelope.task_id and not task_id:
                task_id = effective_envelope.task_id
            if effective_envelope.session_id and not session_id:
                session_id = effective_envelope.session_id
            if effective_envelope.active_artifact_path and not active_file_path:
                active_file_path = effective_envelope.active_artifact_path
            if effective_envelope.selection_text and not selection_text:
                selection_text = effective_envelope.selection_text
        else:
            effective_profile = mode or self._profile_name
            writing_domain = None

        request = ContextBuildRequest(
            session_id=session_id,
            workspace_id=workspace_id,
            module=module,
            task_id=task_id,
            mode=effective_profile,
            user_message=user_message,
            active_file_path=active_file_path,
            selection_text=selection_text,
            active_soul_id=active_soul_id,
            active_flow_id=active_flow_id,
            writing_domain=writing_domain,
        )

        context = self.context_rebuilder.build(request)

        if include_summary and self._current_summary:
            md = self._current_summary.to_markdown()
            if md.strip():
                context.context_blocks.append({
                    "type": "compressed_summary",
                    "title": "Previous Conversation Summary (reference only)",
                    "content": md,
                })

        return context


def _parse_summary_markdown(md: str) -> CompressionSummary:
    import re
    summary = CompressionSummary()

    section_pattern = re.compile(r"^##\s+(.+)$", re.MULTILINE)
    sections = list(section_pattern.finditer(md))

    section_names = {
        "当前目标": "goal",
        "当前模块": "current_product_area",
        "不可违反约束": "non_negotiable_constraints",
        "设计决策": "design_decisions",
        "技术决策": "implementation_decisions",
        "当前文件 / Workspace": "active_workspace_files",
        "数据结构 / API": "data_models_apis",
        "UI 交互规则": "ui_interaction_rules",
        "安全与权限": "safety_permission_rules",
        "已完成": "progress_done",
        "进行中": "progress_in_progress",
        "阻塞 / Bug": "blocked_bugs",
        "下一步": "next_steps",
        "不要重复的错误方案": "rejected_ideas",
        "关键原话": "critical_exact_phrases",
        "工具输出引用": "tool_output_handles",
    }

    for i, match in enumerate(sections):
        section_title = match.group(1).strip()
        start = match.end()
        end = sections[i + 1].start() if i + 1 < len(sections) else len(md)
        content = md[start:end].strip()

        field_name = section_names.get(section_title)
        if not field_name:
            continue

        if field_name in ("goal", "current_product_area"):
            setattr(summary, field_name, content)
        else:
            items = []
            for line in content.split("\n"):
                line = line.strip()
                if line.startswith("- "):
                    items.append(line[2:].strip())
                elif line.startswith("> "):
                    items.append(line[2:].strip())
            setattr(summary, field_name, items)

    return summary


_default_orchestrator: Optional[ContextOrchestrator] = None


def get_orchestrator(workspace_root: Optional[Path] = None) -> ContextOrchestrator:
    global _default_orchestrator
    if _default_orchestrator is None:
        _default_orchestrator = ContextOrchestrator(workspace_root=workspace_root)
    return _default_orchestrator


def inject_context_os(
    messages: List[Dict[str, Any]],
    user_message: str,
    session_id: Optional[str] = None,
    workspace_id: Optional[str] = None,
    module: Optional[str] = None,
    orchestrator: Optional[ContextOrchestrator] = None,
    provider: str = "anthropic",
    model: str = "claude-sonnet-4-20250514",
    tools: Optional[List[Dict[str, Any]]] = None,
    plan_tokens: bool = True,
) -> List[Dict[str, Any]]:
    """Inject Context OS context as a system message after the developer system prompt.

    If Context OS is not enabled or no orchestrator is available, returns messages unchanged.
    Runs TokenPlanner to allocate budget, deduplicates content, applies trim-to-budget if needed,
    and records the context build event in the TokenLedger for Budget Center visibility.

    Args:
        messages: List of API messages (first message should be system role)
        user_message: The current user message for relevance retrieval
        session_id: Optional session ID
        workspace_id: Optional workspace ID
        module: Optional module name
        orchestrator: Optional pre-existing orchestrator instance
        provider: Model provider for context window sizing
        model: Model name for context window sizing
        tools: Optional tool schemas (counted in token budget)

    Returns:
        Messages list with Context OS system message injected at position 1 (after system prompt),
        or unchanged messages if Context OS is not available.
    """
    try:
        orch = orchestrator

        if orch is None:
            if not os.environ.get("KARNA_CONTEXT_DIR") and os.environ.get("HERMES_DESKTOP") != "1":
                return messages
            try:
                orch = get_orchestrator()
            except Exception:
                return messages

        if orch is None:
            return messages

        envelope = get_current_envelope()
        if envelope is not None and not envelope.enabled:
            return messages
        if envelope is None and not workspace_id:
            return messages

        effective_session_id = session_id
        if effective_session_id is None and envelope and envelope.session_id:
            effective_session_id = envelope.session_id
        if effective_session_id is None:
            import hashlib
            effective_session_id = hashlib.md5(user_message.encode("utf-8", errors="ignore")).hexdigest()[:16]

        effective_profile = "agent_chat"
        if envelope:
            effective_profile = envelope.get_effective_profile()
        elif module:
            effective_profile = module

        # Step 1: Deduplicate existing messages (remove redundant system blocks, repeated errors)
        deduped_messages = dedupe_messages(list(messages))

        built = orch.build_context_for_prompt(
            session_id=effective_session_id,
            user_message=user_message,
            workspace_id=workspace_id,
            module=module,
            envelope=envelope,
        )

        context_text = built.to_context_text()
        if not context_text or not context_text.strip():
            return deduped_messages

        context_message = {
            "role": "system",
            "content": "[Karna Context OS - Relevant Project Memory & State]\n" + context_text,
        }

        insert_pos = 1 if (deduped_messages and deduped_messages[0].get("role") == "system") else 0

        new_messages = list(deduped_messages)
        new_messages.insert(insert_pos, context_message)

        # The conversation runtime performs the authoritative all-call
        # preflight after every source of context has been injected.  Other
        # callers may keep this local planning path for standalone use.
        if not plan_tokens:
            return new_messages

        # Step 2: Load active token policy from ledger (scoped to session/project)
        try:
            ledger = get_token_ledger()
            policy_dict = ledger.get_active_policy(
                session_id=effective_session_id,
                project_id=getattr(envelope, "project_id", None) if envelope else workspace_id,
                workspace_id=workspace_id,
            )
            if policy_dict:
                from .token_os import TokenPolicy as _TP
                loaded_policy = _TP.from_dict(policy_dict)
                orch.set_token_policy(loaded_policy)
            policy = orch.token_policy
        except Exception as _ple:
            logger.debug("TokenPolicy load failed (using default): %s", _ple)
            policy = orch.token_policy

        # Step 3: Run TokenPlanner to compute budget allocation
        try:
            cw = get_context_window(model)
            reserved = get_reserved_output(effective_profile)
            pre_input_tokens = estimate_messages_tokens(new_messages)
            tool_schema_toks = 0
            if tools:
                from .token_os import estimate_tool_schema_tokens
                tool_schema_toks = estimate_tool_schema_tokens(tools)
                pre_input_tokens += tool_schema_toks

            plan = orch.token_planner.plan(
                provider=provider,
                model=model,
                profile_name=effective_profile,
                system_prompt_tokens=estimate_messages_tokens([new_messages[0]]) if new_messages and new_messages[0].get("role") == "system" else 0,
                task_root_tokens=estimate_messages_tokens([{"role": "user", "content": user_message}]) if user_message else 0,
                pinned_tokens=sum(len(str(c)) // 4 for c in built.context_blocks if c.get("type") in ("pinned_context", "constraint")),
                active_artifact_tokens=estimate_messages_tokens([{"role": "system", "content": envelope.selection_text or ""}]) if envelope and envelope.selection_text else 0,
                recent_messages_tokens=estimate_messages_tokens([m for m in new_messages[insert_pos + 1:] if m.get("role") in ("user", "assistant")][-10:]),
                summary_tokens=estimate_messages_tokens([context_message]),
                retrieval_tokens=sum(len(str(c.get("content", ""))) // 4 for c in built.context_blocks if c.get("type") in ("memory", "decision", "retrieval")),
                upstream_tokens=0,
                tool_schema_tokens=tool_schema_toks,
                output_reservation=reserved,
            )
            orch._last_token_plan = plan

            # Step 3: If estimated input exceeds max, trim retrieval/summary blocks
            if pre_input_tokens > plan.max_input_tokens:
                overage = pre_input_tokens - plan.max_input_tokens
                logger.debug("Token budget exceeded by %d tokens; trimming non-critical blocks", overage)
                trimmed_context_text = trim_to_budget(context_text, max_chars=int(plan.budgets.get("summary_budget", 4096) * 3.5))
                new_messages[insert_pos] = {
                    "role": "system",
                    "content": "[Karna Context OS - Relevant Project Memory & State]\n" + trimmed_context_text,
                }

            # Step 4: Record context build event in ledger
            try:
                ledger = get_token_ledger()
                post_tokens = estimate_messages_tokens(new_messages) + tool_schema_toks
                ledger.record_context_build({
                    "session_id": effective_session_id,
                    "project_id": getattr(envelope, "project_id", None) if envelope else workspace_id,
                    "workspace_id": workspace_id,
                    "profile": effective_profile,
                    "policy_mode": policy.mode,
                    "context_window": cw,
                    "reserved_output_tokens": reserved,
                    "max_input_tokens": plan.max_input_tokens,
                    "budgets": plan.budgets,
                    "used": {
                        "system": estimate_messages_tokens([new_messages[0]]) if new_messages and new_messages[0].get("role") == "system" else 0,
                        "task_root": estimate_messages_tokens([{"role": "user", "content": user_message}]) if user_message else 0,
                        "pinned": sum(len(str(c)) // 4 for c in built.context_blocks if c.get("type") in ("pinned_context", "constraint")),
                        "active_artifact": estimate_messages_tokens([{"role": "system", "content": envelope.selection_text or ""}]) if envelope and envelope.selection_text else 0,
                        "recent_messages": estimate_messages_tokens([m for m in new_messages[insert_pos + 1:] if m.get("role") in ("user", "assistant")][-10:]),
                        "summary": estimate_messages_tokens([context_message]),
                        "retrieval": sum(len(str(c.get("content", ""))) // 4 for c in built.context_blocks if c.get("type") in ("memory", "decision", "retrieval")),
                        "upstream": 0,
                    },
                    "truncated": ["summary", "retrieval"] if pre_input_tokens > plan.max_input_tokens else [],
                    "externalized": [],
                    "warnings": plan.warnings,
                    "actions": [a.action for a in plan.actions],
                    "cache_key": None if policy.cache_policy == "off" else f"{provider}:{model}:{effective_profile}",
                    "estimated": {
                        "input_tokens": post_tokens,
                        "output_tokens": reserved,
                    },
                    "blocked": plan.blocked,
                    "block_reason": plan.block_reason,
                })
            except Exception as _le:
                logger.debug("Context build event record failed: %s", _le)

            # Step 5: Log warnings
            if plan.warnings:
                for w in plan.warnings:
                    logger.debug("TokenPlanner: %s", w)

        except Exception as _pe:
            logger.debug("TokenPlanner integration skipped (non-fatal): %s", _pe)

        try:
            ctx_tokens = estimate_messages_tokens([context_message])
            total_tokens = estimate_messages_tokens(new_messages)
            logger.debug(
                "Context OS injected: context_tokens=%d total_tokens=%d memories=%d pins=%d profile=%s",
                ctx_tokens,
                total_tokens,
                len(built.included_memory_ids),
                len(built.included_pin_ids),
                effective_profile,
            )
        except Exception:
            logger.debug(
                "Context OS injected: memories=%d pins=%d",
                len(built.included_memory_ids),
                len(built.included_pin_ids),
            )

        return new_messages

    except Exception as exc:
        logger.debug("Context OS injection skipped: %s", exc)
        return messages
