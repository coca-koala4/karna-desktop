import json
import logging
import os
from typing import List, Optional, Dict, Any
from pathlib import Path

try:
    from fastapi import FastAPI, HTTPException, Query
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False
    FastAPI = None
    BaseModel = object

from agent.context.memory import ProjectMemoryService, PinnedContextService, DecisionLogService, NodeRunSummaryService, ToolOutputRecordService
from agent.context.tool_outputs import ToolOutputStore
from agent.context.context_orchestrator import get_orchestrator

logger = logging.getLogger(__name__)


class PinCreateRequest(BaseModel):
    content: str
    scope: str = "task"
    priority: str = "high"
    workspace_id: Optional[str] = None
    module: Optional[str] = None
    task_id: Optional[str] = None
    memory_id: Optional[str] = None
    pin_reason: Optional[str] = None
    created_by: str = "system"


class DecisionCreateRequest(BaseModel):
    decision: str
    reason: Optional[str] = None
    alternatives_rejected: Optional[str] = None
    workspace_id: Optional[str] = None
    module: Optional[str] = None
    task_id: Optional[str] = None
    source_ref: Optional[str] = None
    confirmed_by: Optional[str] = None


class MemoryConfirmRequest(BaseModel):
    confirmed_by: str = "user"


class NodeSummaryCreateRequest(BaseModel):
    flow_run_id: str
    node_id: str
    agent_id: Optional[str] = None
    task: str = ""
    input_summary: str = ""
    output_summary: str = ""
    key_findings: Optional[List[str]] = None
    decisions: Optional[List[str]] = None
    evidence_refs: Optional[List[str]] = None
    file_refs: Optional[List[str]] = None
    errors: Optional[List[str]] = None
    next_suggestions: Optional[List[str]] = None
    token_usage: int = 0
    workspace_id: Optional[str] = None
    session_id: Optional[str] = None
    summary_quality: str = "ok"
    context_packet: Optional[Dict[str, Any]] = None


class ToolOutputCreateRequest(BaseModel):
    tool_name: str
    content: str
    tool_args: str = ""
    session_id: Optional[str] = None
    workspace_id: Optional[str] = None
    task_id: Optional[str] = None
    node_id: Optional[str] = None
    agent_id: Optional[str] = None
    source_kind: str = "tool_output"
    summary: Optional[str] = None
    related_files: Optional[List[str]] = None


class SnapshotEnvelope(BaseModel):
    workspace_id: Optional[str] = None
    project_id: Optional[str] = None
    module: Optional[str] = None
    task_id: Optional[str] = None
    writing_domain: Optional[str] = None
    runtime_profile: Optional[str] = None
    active_artifact_path: Optional[str] = None


class PromptPreviewRequest(BaseModel):
    query: str
    session_id: Optional[str] = None
    workspace_id: Optional[str] = None
    module: Optional[str] = None
    mode: Optional[str] = None
    writing_domain: Optional[str] = None
    token_budget: Optional[int] = None


class CompactRequest(BaseModel):
    messages: List[Dict[str, Any]]
    session_id: Optional[str] = None
    workspace_id: Optional[str] = None
    profile: Optional[str] = None
    model: Optional[str] = None
    force: bool = False


class EnvelopeSetRequest(BaseModel):
    workspace_id: Optional[str] = None
    project_id: Optional[str] = None
    module: Optional[str] = None
    task_id: Optional[str] = None
    session_id: Optional[str] = None
    writing_domain: Optional[str] = None
    runtime_profile: Optional[str] = None
    active_artifact_path: Optional[str] = None
    active_artifact_kind: Optional[str] = None
    selection_text: Optional[str] = None
    source_kind: Optional[str] = None


class MemoryCreateRequest(BaseModel):
    type: str = "goal"
    content: str
    scope: str = "workspace"
    priority: str = "medium"
    workspace_id: Optional[str] = None
    module: Optional[str] = None
    task_id: Optional[str] = None
    source: str = "manual"
    source_ref: Optional[str] = None
    confidence: float = 1.0
    confirmed_by: Optional[str] = "user"
    source_kind: Optional[str] = "user_instruction"


def create_context_memory_app() -> "FastAPI":
    if not HAS_FASTAPI:
        raise ImportError("FastAPI is required for context memory API. Install with: pip install fastapi")

    app = FastAPI(
        title="Karna Context Memory API",
        description="Project Memory / Pinned Context / Context Compression Viewer",
        version="2.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    memory_service = ProjectMemoryService()
    pinned_service = PinnedContextService()
    decision_service = DecisionLogService()
    node_service = NodeRunSummaryService()
    tool_output_service = ToolOutputRecordService()
    tool_store = ToolOutputStore()
    orchestrator = get_orchestrator()

    @app.get("/memories")
    def list_memories(
        workspace_id: Optional[str] = Query(None),
        module: Optional[str] = Query(None),
        task_id: Optional[str] = Query(None),
        type: Optional[str] = Query(None),
        status: Optional[str] = Query('active'),
        source_kind: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=200),
    ):
        types = [type] if type else None
        memories = memory_service.get_active_memories(
            workspace_id=workspace_id,
            module=module,
            task_id=task_id,
            types=types,
            status=status,
            source_kind=source_kind,
            limit=limit,
        )
        return {"memories": memories, "count": len(memories)}

    @app.get("/memories/candidates")
    def list_candidates(
        workspace_id: Optional[str] = Query(None),
        module: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=200),
    ):
        candidates = memory_service.get_candidates(
            workspace_id=workspace_id,
            module=module,
            limit=limit,
        )
        return {"candidates": candidates, "count": len(candidates)}

    @app.post("/memories/{mem_id}/confirm")
    def confirm_memory(mem_id: str, req: MemoryConfirmRequest):
        success = memory_service.confirm_memory(mem_id, confirmed_by=req.confirmed_by)
        if not success:
            raise HTTPException(status_code=404, detail="Memory not found")
        return {"ok": True, "id": mem_id, "status": "active", "authority": "user_confirmed"}

    @app.post("/memories/{mem_id}/reject")
    def reject_memory(mem_id: str):
        success = memory_service.reject_memory(mem_id)
        if not success:
            raise HTTPException(status_code=404, detail="Memory not found")
        return {"ok": True, "id": mem_id, "status": "rejected"}

    @app.delete("/memories/{mem_id}")
    def delete_memory(mem_id: str):
        success = memory_service.delete_memory(mem_id)
        if not success:
            raise HTTPException(status_code=404, detail="Memory not found")
        return {"ok": True, "id": mem_id}

    @app.post("/memories/{mem_id}/resolve")
    def resolve_memory(mem_id: str):
        success = memory_service.mark_resolved(mem_id)
        if not success:
            raise HTTPException(status_code=404, detail="Memory not found")
        return {"ok": True, "id": mem_id, "status": "resolved"}

    @app.get("/pins")
    def list_pins(
        workspace_id: Optional[str] = Query(None),
        module: Optional[str] = Query(None),
        task_id: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=200),
    ):
        pins = pinned_service.get_active_pins(
            workspace_id=workspace_id,
            module=module,
            task_id=task_id,
            limit=limit,
        )
        return {"pins": pins, "count": len(pins)}

    @app.post("/pins")
    def create_pin(req: PinCreateRequest):
        pin_id = pinned_service.pin(
            content=req.content,
            scope=req.scope,
            priority=req.priority,
            workspace_id=req.workspace_id,
            module=req.module,
            task_id=req.task_id,
            memory_id=req.memory_id,
            pin_reason=req.pin_reason,
            created_by=req.created_by,
        )
        if pin_id is None:
            raise HTTPException(status_code=429, detail="Pin limit reached (max pins or tokens exceeded)")
        return {"ok": True, "id": pin_id}

    @app.delete("/pins/{pin_id}")
    def delete_pin(pin_id: str):
        success = pinned_service.delete(pin_id)
        if not success:
            raise HTTPException(status_code=404, detail="Pin not found")
        return {"ok": True, "id": pin_id}

    @app.post("/pins/{pin_id}/unpin")
    def unpin_pin(pin_id: str):
        success = pinned_service.unpin(pin_id)
        if not success:
            raise HTTPException(status_code=404, detail="Pin not found")
        return {"ok": True, "id": pin_id, "is_active": False}

    @app.post("/pins/{pin_id}/repin")
    def repin_pin(pin_id: str):
        success = pinned_service.repin(pin_id)
        if not success:
            raise HTTPException(status_code=404, detail="Pin not found")
        return {"ok": True, "id": pin_id, "is_active": True}

    @app.get("/decisions")
    def list_decisions(
        workspace_id: Optional[str] = Query(None),
        module: Optional[str] = Query(None),
        status: Optional[str] = Query('active'),
        limit: int = Query(50, ge=1, le=200),
    ):
        decisions = decision_service.get_decisions(
            workspace_id=workspace_id,
            module=module,
            status=status,
            limit=limit,
        )
        return {"decisions": decisions, "count": len(decisions)}

    @app.post("/decisions")
    def create_decision(req: DecisionCreateRequest):
        dec_id = decision_service.add_decision(
            decision=req.decision,
            reason=req.reason,
            alternatives_rejected=req.alternatives_rejected,
            workspace_id=req.workspace_id,
            module=req.module,
            task_id=req.task_id,
            source_ref=req.source_ref,
            confirmed_by=req.confirmed_by,
        )
        return {"ok": True, "id": dec_id}

    @app.post("/decisions/{dec_id}/confirm")
    def confirm_decision(dec_id: str, req: MemoryConfirmRequest):
        success = decision_service.confirm_decision(dec_id, confirmed_by=req.confirmed_by)
        if not success:
            raise HTTPException(status_code=404, detail="Decision not found")
        return {"ok": True, "id": dec_id, "status": "active"}

    @app.get("/tool-outputs")
    def list_tool_outputs(
        session_id: Optional[str] = Query(None),
        workspace_id: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=200),
    ):
        outputs = tool_output_service.get_tool_outputs(
            session_id=session_id,
            workspace_id=workspace_id,
            limit=limit,
        )
        return {"outputs": outputs, "count": len(outputs)}

    @app.post("/tool-outputs")
    def create_tool_output(req: ToolOutputCreateRequest):
        record = tool_store.externalize(
            tool_name=req.tool_name,
            tool_args=req.tool_args,
            content=req.content,
            session_id=req.session_id,
            workspace_id=req.workspace_id,
            task_id=req.task_id,
            node_id=req.node_id,
            agent_id=req.agent_id,
            source_kind=req.source_kind,
            summary=req.summary,
            related_files=req.related_files,
        )
        return {"ok": True, "record": record.to_dict(), "handle": record.to_handle()}

    @app.get("/tool-outputs/{output_id}")
    def get_tool_output(output_id: str):
        record = tool_store.get(output_id)
        if not record:
            raise HTTPException(status_code=404, detail="Tool output not found")
        return record

    @app.get("/tool-outputs/{output_id}/content")
    def get_tool_output_content(output_id: str):
        content = tool_store.get_full_content(output_id)
        if content is None:
            raise HTTPException(status_code=404, detail="Tool output content not found")
        return {"id": output_id, "content": content}

    @app.get("/compression-events")
    def list_compression_events(
        session_id: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=200),
    ):
        events = memory_service.get_compression_events(session_id=session_id, limit=limit)
        return {"events": events, "count": len(events)}

    @app.get("/profiles")
    def list_profiles():
        from agent.context.compressor import DEFAULT_PROFILES
        profiles = {}
        for name, p in DEFAULT_PROFILES.items():
            profiles[name] = {
                "name": p.name,
                "threshold": p.threshold,
                "target_ratio": p.target_ratio,
                "protect_last_n": p.protect_last_n,
                "max_summary_tokens": p.max_summary_tokens,
            }
        return {"profiles": profiles}

    @app.get("/summary")
    def get_current_summary():
        summary = orchestrator.get_current_summary()
        if summary is None:
            return {"summary": None}
        return {
            "summary": summary.to_dict(),
            "markdown": summary.to_markdown(),
        }

    @app.get("/node-summaries")
    def list_node_summaries(
        flow_run_id: Optional[str] = Query(None),
        workspace_id: Optional[str] = Query(None),
        session_id: Optional[str] = Query(None),
        limit: int = Query(50, ge=1, le=200),
    ):
        if flow_run_id:
            summaries = node_service.get_flow_summaries(flow_run_id)
        else:
            summaries = node_service.get_recent_summaries(
                workspace_id=workspace_id,
                session_id=session_id,
                limit=limit,
            )
        return {"summaries": summaries, "count": len(summaries)}

    @app.post("/node-summaries")
    def create_node_summary(req: NodeSummaryCreateRequest):
        summary_id = node_service.add_node_summary(
            flow_run_id=req.flow_run_id,
            node_id=req.node_id,
            agent_id=req.agent_id,
            task=req.task,
            input_summary=req.input_summary,
            output_summary=req.output_summary,
            key_findings=req.key_findings,
            decisions=req.decisions,
            evidence_refs=req.evidence_refs,
            file_refs=req.file_refs,
            errors=req.errors,
            next_suggestions=req.next_suggestions,
            token_usage=req.token_usage,
            workspace_id=req.workspace_id,
            session_id=req.session_id,
            summary_quality=req.summary_quality,
            context_packet=req.context_packet,
        )
        return {"ok": True, "id": summary_id}

    @app.get("/stats")
    def get_stats():
        import sqlite3
        from agent.context.memory.memory_schema import get_context_db_path
        db_path = get_context_db_path()
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row

        stats = {}
        for table in ["context_memory", "pinned_context", "decision_log", "tool_output_records", "compression_events", "agent_node_run_summaries"]:
            try:
                cursor = conn.execute(f"SELECT COUNT(*) as cnt FROM {table}")
                stats[table] = cursor.fetchone()["cnt"]
            except Exception:
                stats[table] = 0

        try:
            cursor = conn.execute("SELECT status, COUNT(*) as cnt FROM context_memory GROUP BY status")
            stats["by_status"] = {row["status"]: row["cnt"] for row in cursor.fetchall()}
        except Exception:
            stats["by_status"] = {}

        try:
            cursor = conn.execute("SELECT type, COUNT(*) as cnt FROM context_memory WHERE status='active' GROUP BY type")
            stats["by_type"] = {row["type"]: row["cnt"] for row in cursor.fetchall()}
        except Exception:
            stats["by_type"] = {}

        conn.close()
        return stats

    @app.get("/snapshot")
    def get_snapshot(
        workspace_id: Optional[str] = Query(None),
        session_id: Optional[str] = Query(None),
    ):
        try:
            from agent.context.context_envelope import get_current_envelope
            env = get_current_envelope()
            env_dict = env.to_dict() if env else {}
        except Exception:
            env_dict = {}
        try:
            summary = orchestrator.get_current_summary()
            summary_dict = summary.to_dict() if summary else None
        except Exception:
            summary_dict = None
        mems = memory_service.get_active_memories(workspace_id=workspace_id, limit=10)
        pins = pinned_service.get_active_pins(workspace_id=workspace_id, limit=10)
        decs = decision_service.get_decisions(workspace_id=workspace_id, limit=10)
        events = memory_service.get_compression_events(session_id=session_id, limit=5)
        nodes = node_service.get_recent_summaries(limit=5)
        return {
            "envelope": env_dict,
            "summary": summary_dict,
            "counts": {
                "memories": len(memory_service.get_active_memories(workspace_id=workspace_id, limit=200)),
                "pins": len(pinned_service.get_active_pins(workspace_id=workspace_id, limit=200)),
                "decisions": len(decision_service.get_decisions(workspace_id=workspace_id, limit=200)),
            },
            "recent_memories": mems[:10],
            "recent_pins": pins[:10],
            "recent_decisions": decs[:10],
            "recent_compressions": events,
            "recent_nodes": nodes,
        }

    @app.post("/prompt-preview")
    def prompt_preview(req: PromptPreviewRequest):
        from agent.context.rebuild import ContextBuildRequest, ContextRebuilder
        from agent.context.memory import MemoryRetriever
        try:
            retriever = MemoryRetriever(memory_service)
            rebuilder = ContextRebuilder(memory_service, pinned_service, retriever=retriever)
            build_req = ContextBuildRequest(
                session_id=req.session_id or "preview-session",
                user_message=req.query,
                workspace_id=req.workspace_id,
                module=req.module,
                mode=req.mode or "agent_chat",
                writing_domain=req.writing_domain,
            )
            built = rebuilder.build(build_req)
            context_text = built.to_context_text()
            return {
                "context_text": context_text,
                "estimated_tokens": len(context_text) // 4,
                "memory_count": len(built.relevant_memories),
                "pin_count": len(built.pinned_contexts),
                "decision_count": 0,
                "mode": build_req.mode,
                "writing_domain": built.writing_domain,
            }
        except Exception as e:
            logger.exception("prompt-preview failed")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/compact")
    def compact_context(req: CompactRequest):
        try:
            os.environ["KARNA_CONTEXT_DIR"] = os.environ.get("KARNA_CONTEXT_DIR") or str(Path.home() / ".karna" / "context")
            from agent.context_compressor import ContextCompressor
            model = req.model or os.environ.get("KARNA_COMPRESSION_MODEL", "gpt-4o-mini")
            compressor = ContextCompressor(model=model)
            compressor.enable_context_os(workspace_id=req.workspace_id, default_profile=req.profile or "agent_chat")
            before_count = len(req.messages)
            before_chars = sum(len(str(m.get("content", ""))) for m in req.messages if isinstance(m.get("content"), str))
            compressed = compressor.compress(
                req.messages,
                force=req.force,
            )
            metadata = {"profile": req.profile or "agent_chat"}
            after_count = len(compressed)
            after_chars = sum(len(str(m.get("content", ""))) for m in compressed if isinstance(m.get("content"), str))
            return {
                "messages": compressed,
                "before_count": before_count,
                "after_count": after_count,
                "before_chars": before_chars,
                "after_chars": after_chars,
                "metadata": metadata or {},
            }
        except Exception as e:
            logger.exception("compact failed")
            raise HTTPException(status_code=500, detail=str(e))

    @app.get("/envelope")
    def get_envelope():
        try:
            from agent.context.context_envelope import get_current_envelope
            env = get_current_envelope()
            return {"envelope": env.to_dict() if env else None}
        except Exception:
            return {"envelope": None}

    @app.post("/envelope")
    def set_envelope(req: EnvelopeSetRequest):
        try:
            from agent.context.context_envelope import ContextEnvelope
            env = ContextEnvelope(
                workspace_id=req.workspace_id,
                project_id=req.project_id,
                module=req.module,
                task_id=req.task_id,
                session_id=req.session_id,
                writing_domain=req.writing_domain,
                runtime_profile=req.runtime_profile,
                active_artifact_path=req.active_artifact_path,
                active_artifact_kind=req.active_artifact_kind,
                selection_text=req.selection_text,
                source_kind=req.source_kind,
            )
            # This endpoint validates/normalizes editor state for the UI only.
            # Runtime truth travels inside prompt.submit and is bound to that
            # session/turn by the gateway.  HTTP ContextVars and a global
            # orchestrator must never be used as cross-request storage.
            return {"ok": True, "envelope": env.to_dict()}
        except Exception as e:
            logger.exception("set envelope failed")
            raise HTTPException(status_code=500, detail=str(e))

    @app.post("/memories")
    def create_memory(req: MemoryCreateRequest):
        from agent.context.extraction import ExtractedContextItem
        _priority_map = {"low": "low", "medium": "normal", "high": "high", "critical": "critical"}
        _type_map = {
            "fact": "goal", "preference": "user_preference", "constraint": "constraint",
            "decision": "decision", "bug": "bug", "next_step": "next_step",
            "goal": "goal", "user_preference": "user_preference", "data_model": "data_model",
            "ui_rule": "ui_rule", "active_file": "active_file", "rejected_idea": "rejected_idea",
        }
        item = ExtractedContextItem(
            type=_type_map.get(req.type, "goal"),
            content=req.content,
            scope=req.scope if req.scope in ("global", "workspace", "module", "task") else "workspace",
            priority=_priority_map.get(req.priority, "normal"),
            workspace_id=req.workspace_id,
            module=req.module,
            task_id=req.task_id,
            source_ref=req.source_ref,
            confidence=req.confidence,
            source_kind=req.source_kind if req.source_kind in ("user_instruction", "artifact_selection", "project_document", "imported_source", "tool_output", "subagent_output") else "user_instruction",
            status="active",
            authority="user_confirmed",
            confirmed_by=req.confirmed_by or "user",
        )
        mem_id = memory_service.add_memory(item)
        return {"ok": True, "id": mem_id}

    @app.delete("/decisions/{dec_id}")
    def delete_decision(dec_id: str):
        success = decision_service.delete_decision(dec_id)
        if not success:
            raise HTTPException(status_code=404, detail="Decision not found")
        return {"ok": True, "id": dec_id}

    try:
        from agent.context.token_os import (
            TokenPolicy, get_token_ledger, TokenPlanner, plan_for_call,
            WorkflowTokenPlanner, get_context_window,
        )
        ledger = get_token_ledger()

        class TokenPolicyRequest(BaseModel):
            mode: Optional[str] = None
            scope: str = "global"
            scope_id: Optional[str] = None
            budget_mode: Optional[str] = None
            input_budget: Optional[int] = None
            output_budget: Optional[int] = None
            total_token_budget: Optional[int] = None
            currency_budget: Optional[float] = None
            compression_profile: Optional[str] = None
            cache_policy: Optional[str] = None
            tool_schema_policy: Optional[str] = None
            skill_policy: Optional[str] = None
            rag_policy: Optional[str] = None
            multi_agent_policy: Optional[str] = None
            artifact_policy: Optional[str] = None
            max_critic_rounds: Optional[int] = None
            max_parallel_nodes: Optional[int] = None
            input_price_per_million: Optional[float] = None
            cached_input_price_per_million: Optional[float] = None
            output_price_per_million: Optional[float] = None
            reasoning_price_per_million: Optional[float] = None
            price_source: Optional[str] = None
            price_version: Optional[str] = None
            model_routing_policy: Optional[str] = None
            model_slots: Optional[Dict[str, str]] = None
            provider_slots: Optional[Dict[str, str]] = None

        class TokenPlanRequest(BaseModel):
            provider: str = ""
            model: str = ""
            profile_name: str = "agent_chat"
            session_id: Optional[str] = None
            project_id: Optional[str] = None
            system_text: str = ""
            task_root_text: str = ""
            pinned_text: str = ""
            artifact_text: str = ""
            recent_messages: Optional[List[Dict[str, Any]]] = None
            summary_text: str = ""
            retrieval_text: str = ""
            upstream_text: str = ""
            requested_output_tokens: Optional[int] = None
            is_node_final: bool = False
            policy_mode: Optional[str] = None

        class WorkflowPlanRequest(BaseModel):
            workflow_id: str
            nodes: List[Dict[str, Any]]
            model: str = ""
            provider: str = ""
            project_id: Optional[str] = None

        class TokenUsageRecordRequest(BaseModel):
            provider: str = ""
            model: str = ""
            session_id: Optional[str] = None
            project_id: Optional[str] = None
            workspace_id: Optional[str] = None
            workflow_id: Optional[str] = None
            node_id: Optional[str] = None
            agent_id: Optional[str] = None
            source_kind: str = "agent_chat"
            input_tokens: int = 0
            cached_input_tokens: int = 0
            output_tokens: int = 0
            reasoning_tokens: int = 0
            estimated_cost: Optional[float] = None
            actual_cost: Optional[float] = None
            usage_source: str = "estimate"
            plan_id: Optional[str] = None
            cache_hit: bool = False

        class TokenReuseRecordRequest(BaseModel):
            reuse_type: str
            session_id: Optional[str] = None
            project_id: Optional[str] = None
            workflow_id: Optional[str] = None
            node_id: Optional[str] = None
            source_ref: Optional[str] = None
            cache_key: Optional[str] = None
            input_hash: Optional[str] = None
            tokens_before: int = 0
            tokens_after: int = 0
            model_id: str = ""

        @app.get("/token-policy")
        def get_token_policy(
            session_id: Optional[str] = Query(None),
            project_id: Optional[str] = Query(None),
            workspace_id: Optional[str] = Query(None),
            workflow_id: Optional[str] = Query(None),
        ):
            policy_dict = ledger.get_active_policy(
                session_id=session_id, project_id=project_id,
                workspace_id=workspace_id, workflow_id=workflow_id,
            )
            return {"policy": policy_dict}

        @app.put("/token-policy")
        def set_token_policy(req: TokenPolicyRequest):
            if req.mode == "saving":
                from agent.context.token_os import SAVING_POLICY
                policy = TokenPolicy.from_dict(SAVING_POLICY.to_dict())
            elif req.mode == "quality":
                from agent.context.token_os import QUALITY_POLICY
                policy = TokenPolicy.from_dict(QUALITY_POLICY.to_dict())
            else:
                policy = TokenPolicy()
            for field_name in ["mode", "budget_mode", "input_budget", "output_budget",
                               "total_token_budget", "currency_budget", "compression_profile",
                               "cache_policy", "tool_schema_policy", "skill_policy",
                               "rag_policy", "multi_agent_policy", "artifact_policy",
                               "max_critic_rounds", "max_parallel_nodes",
                               "input_price_per_million", "cached_input_price_per_million",
                               "output_price_per_million", "reasoning_price_per_million",
                               "price_source", "price_version", "model_routing_policy",
                               "model_slots", "provider_slots"]:
                val = getattr(req, field_name, None)
                if val is not None:
                    setattr(policy, field_name, val)
            policy.scope = req.scope if req.scope in ("global", "workspace", "project", "workflow", "session") else "global"
            policy.scope_id = req.scope_id
            pid = ledger.save_policy(policy.scope, policy.scope_id, policy.to_dict())
            return {"ok": True, "id": pid, "policy": policy.to_dict()}

        @app.post("/token-plan")
        def create_token_plan(req: TokenPlanRequest):
            policy = TokenPolicy.from_dict(ledger.get_active_policy(
                session_id=req.session_id, project_id=req.project_id,
            ))
            if req.policy_mode == "saving":
                from agent.context.token_os import SAVING_POLICY
                policy = SAVING_POLICY
            elif req.policy_mode == "quality":
                from agent.context.token_os import QUALITY_POLICY
                policy = QUALITY_POLICY
            plan = plan_for_call(
                provider=req.provider, model=req.model, profile_name=req.profile_name,
                session_id=req.session_id, policy=policy,
                system_text=req.system_text, task_root_text=req.task_root_text,
                pinned_text=req.pinned_text, artifact_text=req.artifact_text,
                recent_messages=req.recent_messages, summary_text=req.summary_text,
                retrieval_text=req.retrieval_text, upstream_text=req.upstream_text,
                requested_output_tokens=req.requested_output_tokens,
                is_node_final=req.is_node_final,
            )
            plan_dict = plan.to_dict()
            plan_dict["session_id"] = req.session_id
            plan_dict["project_id"] = req.project_id
            try:
                ledger.record_context_build(plan_dict)
            except Exception as e:
                logger.debug("Failed to record context build: %s", e)
            return plan_dict

        @app.get("/token-usage")
        def get_token_usage(
            session_id: Optional[str] = Query(None),
            project_id: Optional[str] = Query(None),
            workflow_id: Optional[str] = Query(None),
            since_minutes: Optional[int] = Query(None),
        ):
            return ledger.get_usage_summary(
                session_id=session_id, project_id=project_id,
                workflow_id=workflow_id, since_minutes=since_minutes,
            )

        @app.post("/token-usage")
        def record_token_usage(req: TokenUsageRecordRequest):
            event_id = ledger.record_usage(**req.model_dump())
            ledger.emit_event(
                "token.usage", req.model_dump(), session_id=req.session_id,
                project_id=req.project_id, workflow_id=req.workflow_id,
                node_id=req.node_id, plan_id=req.plan_id,
            )
            return {"ok": True, "id": event_id}

        @app.get("/token-usage/breakdown")
        def get_token_usage_breakdown(
            session_id: Optional[str] = Query(None),
            project_id: Optional[str] = Query(None),
            limit: int = Query(50, ge=1, le=500),
        ):
            return {"events": ledger.get_recent_events(
                session_id=session_id, project_id=project_id, limit=limit,
            )}

        @app.get("/cache-stats")
        def get_cache_stats(session_id: Optional[str] = Query(None)):
            return ledger.get_cache_stats(session_id=session_id)

        @app.get("/reuse-records")
        def get_reuse_records(
            session_id: Optional[str] = Query(None),
            limit: int = Query(50, ge=1, le=200),
        ):
            return {"records": ledger.get_reuse_records(session_id=session_id, limit=limit)}

        @app.post("/reuse-records")
        def record_reuse_record(req: TokenReuseRecordRequest):
            rid = ledger.record_reuse(**req.model_dump())
            ledger.emit_event(
                "token.reuse", req.model_dump(), session_id=req.session_id,
                project_id=req.project_id, workflow_id=req.workflow_id,
                node_id=req.node_id,
            )
            return {"ok": True, "id": rid}

        @app.get("/token-events")
        def get_token_events(
            session_id: Optional[str] = Query(None),
            workflow_id: Optional[str] = Query(None),
            limit: int = Query(100, ge=1, le=500),
        ):
            return {"events": ledger.get_events(session_id=session_id, workflow_id=workflow_id, limit=limit)}

        @app.post("/workflows/{workflow_id}/token-plan")
        def create_workflow_token_plan(workflow_id: str, req: WorkflowPlanRequest):
            policy = TokenPolicy.from_dict(ledger.get_active_policy(
                project_id=req.project_id, workflow_id=workflow_id,
            ))
            wfp = WorkflowTokenPlanner(policy)
            usage = ledger.get_usage_summary(project_id=req.project_id)
            plan = wfp.plan_workflow(
                workflow_id=workflow_id, nodes=req.nodes, model=req.model,
                provider=req.provider,
                project_budget_used_input=int(usage.get("input_tokens", 0)) + int(usage.get("cached_input_tokens", 0)),
                project_budget_used_output=int(usage.get("output_tokens", 0)),
            )
            ledger.emit_event(
                "token.plan", plan.to_dict(), project_id=req.project_id,
                workflow_id=workflow_id,
            )
            if plan.blocked:
                ledger.emit_event(
                    "token.budget.blocked", {"reason": plan.block_reason},
                    project_id=req.project_id, workflow_id=workflow_id,
                )
            return plan.to_dict()

        @app.get("/context-window")
        def get_context_window_endpoint(model: str = Query("")):
            return {"model": model, "context_window": get_context_window(model)}

    except Exception as _e:
        logger.debug("Token OS API endpoints not registered: %s", _e)

    return app


if __name__ == "__main__":
    import uvicorn
    from fastapi import FastAPI as _FastAPI
    root = _FastAPI()
    context_app = create_context_memory_app()
    root.mount("/api/context", context_app)
    uvicorn.run(root, host="127.0.0.1", port=8765)
