"""Sandbox authorization gateway.

Provides the authorize_tool_call function that evaluates whether a tool
invocation is permitted under a given CapabilityScope.
"""

from __future__ import annotations

import re
from typing import Any

from tools.capability_sandbox.models import (
    AuthorizationDecision,
    CapabilityScope,
    PermissionDenied,
    ToolAuthorizationResult,
    ToolMetadata,
    ToolRiskLevel,
)
from tools.capability_sandbox.path_policy import (
    assert_path_allowed,
    extract_target_path,
)
from tools.capability_sandbox.tool_registry import (
    MCP_BUILTIN_WHITELIST,
    _parse_mcp_tool_name,
    get_tool_metadata,
)


MCP_DANGEROUS_SERVERS_BLOCKLIST = frozenset({
    "filesystem",
    "shell",
    "system_info",
    "system",
    "browser_profile",
    "browser-profile",
    "environment",
    "external_upload",
    "external-upload",
    "command",
    "exec",
    "terminal",
    "process",
})


MCP_TRUSTED_BUILTIN = frozenset({
    "workspace",
    "writer_workspace",
    "story_bible",
    "living_wiki",
    "narrative_state",
    "creative_search",
    "soul_workshop",
})


def _sanitize_server_name(server_name: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]", "_", server_name or "")


def _is_server_denied(server_name: str) -> bool:
    if not server_name:
        return False
    sanitized = _sanitize_server_name(server_name)
    if server_name in MCP_DANGEROUS_SERVERS_BLOCKLIST:
        return True
    if sanitized in {_sanitize_server_name(n) for n in MCP_DANGEROUS_SERVERS_BLOCKLIST}:
        return True
    return False


def _server_in_whitelist(server_name: str, allowed_servers: list[str]) -> bool:
    if not allowed_servers:
        return False
    sanitized = _sanitize_server_name(server_name)
    for allowed in allowed_servers:
        if not allowed:
            continue
        if server_name == allowed:
            return True
        if sanitized == _sanitize_server_name(allowed):
            return True
    return False


def authorize_tool_call(
    tool_name: str,
    tool_args: dict[str, Any],
    scope: CapabilityScope,
    tool_metadata: ToolMetadata | None = None,
) -> ToolAuthorizationResult:
    """Authorize a tool call against a capability scope.

    Evaluates the tool name, its metadata requirements, risk level, and
    target path (when applicable) against the scope's permissions to produce
    an authorization decision.

    Args:
        tool_name: Name of the tool being called.
        tool_args: Arguments passed to the tool.
        scope: The capability scope to authorize against.
        tool_metadata: Optional explicit metadata. If not provided, looks up
            from the global TOOL_REGISTRY. Unregistered tools are denied
            (fail-closed).

    Returns:
        A ToolAuthorizationResult with allow, deny, or require_confirmation.
    """
    if tool_metadata is None:
        tool_metadata = get_tool_metadata(tool_name)

    if tool_metadata is None:
        return ToolAuthorizationResult(
            decision=AuthorizationDecision.deny,
            reason=f"工具 '{tool_name}' 未注册权限信息，默认拒绝。",
            risk_level=None,
        )

    metadata = tool_metadata

    is_mcp_tool = tool_name.startswith("mcp_")
    mcp_server_name = metadata.mcp_server_name

    if is_mcp_tool and not mcp_server_name:
        parsed_server, _ = _parse_mcp_tool_name(tool_name)
        mcp_server_name = parsed_server

    if is_mcp_tool:
        if not scope.allow_mcp:
            return ToolAuthorizationResult(
                decision=AuthorizationDecision.deny,
                reason="当前模式不允许调用MCP工具。如需使用外部工具，请切换到'电脑授权模式'。",
                risk_level=metadata.risk_level,
            )

        if mcp_server_name and _is_server_denied(mcp_server_name):
            return ToolAuthorizationResult(
                decision=AuthorizationDecision.deny,
                reason=f"MCP服务器 '{mcp_server_name}' 属于危险类型（系统级访问），在当前模式下被禁止。",
                risk_level=metadata.risk_level,
            )

        if scope.allowed_mcp_servers:
            if not mcp_server_name:
                return ToolAuthorizationResult(
                    decision=AuthorizationDecision.deny,
                    reason="无法识别MCP服务器名称，默认拒绝。",
                    risk_level=metadata.risk_level,
                )
            if not _server_in_whitelist(mcp_server_name, scope.allowed_mcp_servers):
                return ToolAuthorizationResult(
                    decision=AuthorizationDecision.deny,
                    reason=f"MCP服务器 '{mcp_server_name}' 不在当前模式允许的服务器列表中。",
                    risk_level=metadata.risk_level,
                )

    if metadata.requires_shell and not scope.allow_shell:
        return ToolAuthorizationResult(
            decision=AuthorizationDecision.deny,
            reason="当前模式不允许执行终端命令。如需运行命令，请切换到'电脑授权模式'。",
            risk_level=metadata.risk_level,
        )

    if metadata.requires_system_info and not scope.allow_system_info:
        return ToolAuthorizationResult(
            decision=AuthorizationDecision.deny,
            reason="当前模式不允许读取系统信息。如需查看磁盘使用情况等，请切换到'电脑授权模式'。",
            risk_level=metadata.risk_level,
        )

    if metadata.requires_env_vars and not scope.allow_env_vars:
        return ToolAuthorizationResult(
            decision=AuthorizationDecision.deny,
            reason="当前模式不允许读取环境变量。",
            risk_level=metadata.risk_level,
        )

    if metadata.requires_network and not scope.allow_network:
        return ToolAuthorizationResult(
            decision=AuthorizationDecision.deny,
            reason="当前模式不允许联网。",
            risk_level=metadata.risk_level,
        )

    if metadata.risk_level in (ToolRiskLevel.read_system, ToolRiskLevel.write_system, ToolRiskLevel.secret_access):
        if not scope.allow_system_info:
            return ToolAuthorizationResult(
                decision=AuthorizationDecision.deny,
                reason="当前处于'仅当前项目'模式，禁止访问系统级资源。",
                risk_level=metadata.risk_level,
            )

    if metadata.risk_level in (ToolRiskLevel.external_upload, ToolRiskLevel.mcp_external):
        if not scope.allow_network:
            return ToolAuthorizationResult(
                decision=AuthorizationDecision.deny,
                reason="当前模式不允许外部上传或外部MCP访问。",
                risk_level=metadata.risk_level,
            )

    if metadata.requires_path_access:
        target_path = extract_target_path(tool_name, tool_args, metadata)
        if target_path is not None:
            try:
                assert_path_allowed(target_path, scope)
            except PermissionDenied as e:
                return ToolAuthorizationResult(
                    decision=AuthorizationDecision.deny,
                    reason=str(e),
                    risk_level=metadata.risk_level,
                )

    if metadata.risk_level in scope.require_confirmation_for:
        confirmation_msg = metadata.confirmation_message or (
            f"Karna 请求执行 {metadata.risk_level.value} 级别的操作，请确认。"
        )
        return ToolAuthorizationResult(
            decision=AuthorizationDecision.require_confirmation,
            reason=f"工具 '{tool_name}' 执行 {metadata.risk_level.value} 操作需要用户确认。",
            risk_level=metadata.risk_level,
            confirmation_message=confirmation_msg,
        )

    return ToolAuthorizationResult(
        decision=AuthorizationDecision.allow,
        reason="",
        risk_level=metadata.risk_level,
    )
