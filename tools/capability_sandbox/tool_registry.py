"""Tool registry for managing built-in and custom tool metadata.

Provides registration and lookup of ToolMetadata for all tools,
including support for MCP tool prefix matching.
"""

from __future__ import annotations

import re
from typing import Dict, Optional, Tuple

from tools.capability_sandbox.models import ToolMetadata, ToolRiskLevel


TOOL_REGISTRY: Dict[str, ToolMetadata] = {}

MCP_DANGEROUS_SERVERS = frozenset({
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

MCP_BUILTIN_WHITELIST = frozenset({
    "workspace",
    "writer_workspace",
    "story_bible",
    "living_wiki",
    "narrative_state",
    "creative_search",
    "soul_workshop",
})


def _parse_mcp_tool_name(tool_name: str) -> Tuple[Optional[str], Optional[str]]:
    """Parse an MCP tool name into (server_name, tool_suffix).

    MCP tool names follow the format ``mcp_{safe_server_name}_{safe_tool_name}``
    where both server and tool names have hyphens replaced with underscores via
    sanitize_mcp_name_component(). Since server names may themselves contain
    underscores (e.g. ``writer_workspace``), simple underscore-splitting is
    ambiguous. We resolve this by trying known server prefixes (longest match
    first), then falling back to scanning registered wildcard patterns.

    Returns:
        (server_name, tool_suffix) tuple, or (None, None) if not an MCP tool.
    """
    if not tool_name.startswith("mcp_"):
        return None, None

    if tool_name.startswith("mcp__"):
        parts = tool_name.split("__")
        if len(parts) >= 3:
            return parts[1], "__".join(parts[2:])
        return None, None

    remainder = tool_name[4:]

    all_known_servers = set()
    for key in TOOL_REGISTRY:
        if key.endswith(".*"):
            srv = key[:-2]
            if srv:
                all_known_servers.add(srv)

    all_known_servers.update(MCP_DANGEROUS_SERVERS)
    all_known_servers.update(MCP_BUILTIN_WHITELIST)

    candidates = sorted(all_known_servers, key=lambda s: -len(s))
    for srv in candidates:
        sanitized = re.sub(r"[^A-Za-z0-9_]", "_", srv)
        prefix = sanitized + "_"
        if remainder.startswith(prefix):
            return srv, remainder[len(prefix):]

    parts = remainder.split("_", 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    if len(parts) == 1 and parts[0]:
        return parts[0], ""

    return None, None


def _register_builtin_tools() -> None:
    """Register all built-in tools with their metadata."""

    file_tools = [
        ToolMetadata(
            name="read_file",
            risk_level=ToolRiskLevel.read_project,
            requires_path_access=True,
            target_path_arg="file_path",
        ),
        ToolMetadata(
            name="write_file",
            risk_level=ToolRiskLevel.write_project,
            requires_path_access=True,
            target_path_arg="file_path",
            confirmation_message="Karna 想修改文件",
        ),
        ToolMetadata(
            name="patch",
            risk_level=ToolRiskLevel.write_project,
            requires_path_access=True,
            target_path_arg="file_path",
            confirmation_message="Karna 想修改文件",
        ),
        ToolMetadata(
            name="search_files",
            risk_level=ToolRiskLevel.read_project,
            requires_path_access=True,
            target_path_arg="path",
        ),
        ToolMetadata(
            name="list_dir",
            risk_level=ToolRiskLevel.read_project,
            requires_path_access=True,
            target_path_arg="path",
        ),
        ToolMetadata(
            name="delete_file",
            risk_level=ToolRiskLevel.delete,
            requires_path_access=True,
            target_path_arg="file_path",
            confirmation_message="Karna 想删除文件",
        ),
        ToolMetadata(
            name="move_file",
            risk_level=ToolRiskLevel.write_project,
            requires_path_access=True,
            confirmation_message="Karna 想移动文件",
        ),
    ]

    terminal_tools = [
        ToolMetadata(
            name="terminal",
            risk_level=ToolRiskLevel.execute_command,
            requires_shell=True,
            confirmation_message="Karna 想执行终端命令",
        ),
        ToolMetadata(
            name="read_terminal",
            risk_level=ToolRiskLevel.execute_command,
            requires_shell=True,
        ),
        ToolMetadata(
            name="close_terminal",
            risk_level=ToolRiskLevel.safe,
            requires_shell=True,
        ),
        ToolMetadata(
            name="execute_code",
            risk_level=ToolRiskLevel.execute_command,
            requires_shell=True,
            confirmation_message="Karna 想执行代码",
        ),
    ]

    network_tools = [
        ToolMetadata(
            name="web_search",
            risk_level=ToolRiskLevel.network,
            requires_network=True,
        ),
        ToolMetadata(
            name="web_extract",
            risk_level=ToolRiskLevel.network,
            requires_network=True,
        ),
    ]

    browser_tools = [
        ToolMetadata(
            name="browser_navigate",
            risk_level=ToolRiskLevel.network,
            requires_network=True,
        ),
        ToolMetadata(
            name="browser_snapshot",
            risk_level=ToolRiskLevel.network,
            requires_network=True,
        ),
        ToolMetadata(
            name="browser_click",
            risk_level=ToolRiskLevel.network,
            requires_network=True,
        ),
        ToolMetadata(
            name="browser_type",
            risk_level=ToolRiskLevel.network,
            requires_network=True,
        ),
        ToolMetadata(
            name="browser_scroll",
            risk_level=ToolRiskLevel.network,
            requires_network=True,
        ),
        ToolMetadata(
            name="browser_back",
            risk_level=ToolRiskLevel.safe,
            requires_network=True,
        ),
        ToolMetadata(
            name="browser_press",
            risk_level=ToolRiskLevel.network,
            requires_network=True,
        ),
        ToolMetadata(
            name="browser_get_images",
            risk_level=ToolRiskLevel.network,
            requires_network=True,
        ),
        ToolMetadata(
            name="browser_vision",
            risk_level=ToolRiskLevel.network,
            requires_network=True,
        ),
        ToolMetadata(
            name="browser_console",
            risk_level=ToolRiskLevel.network,
            requires_network=True,
        ),
        ToolMetadata(
            name="browser_cdp",
            risk_level=ToolRiskLevel.network,
            requires_network=True,
        ),
        ToolMetadata(
            name="browser_dialog",
            risk_level=ToolRiskLevel.safe,
            requires_network=True,
        ),
        ToolMetadata(
            name="browser-cleanup",
            risk_level=ToolRiskLevel.safe,
            requires_network=True,
        ),
    ]

    system_tools = [
        ToolMetadata(
            name="process",
            risk_level=ToolRiskLevel.read_system,
            requires_system_info=True,
        ),
        ToolMetadata(
            name="disk_usage",
            risk_level=ToolRiskLevel.read_system,
            requires_system_info=True,
        ),
        ToolMetadata(
            name="os_info",
            risk_level=ToolRiskLevel.read_system,
            requires_system_info=True,
        ),
        ToolMetadata(
            name="system_info",
            risk_level=ToolRiskLevel.read_system,
            requires_system_info=True,
        ),
        ToolMetadata(
            name="network_config",
            risk_level=ToolRiskLevel.read_system,
            requires_system_info=True,
        ),
        ToolMetadata(
            name="env_vars",
            risk_level=ToolRiskLevel.secret_access,
            requires_system_info=True,
            requires_env_vars=True,
        ),
        ToolMetadata(
            name="get_env",
            risk_level=ToolRiskLevel.secret_access,
            requires_system_info=True,
            requires_env_vars=True,
        ),
    ]

    karna_project_tools = [
        ToolMetadata(name="project_list", risk_level=ToolRiskLevel.safe),
        ToolMetadata(name="project_create", risk_level=ToolRiskLevel.safe),
        ToolMetadata(name="project_switch", risk_level=ToolRiskLevel.safe),
        ToolMetadata(name="clarify", risk_level=ToolRiskLevel.safe),
        ToolMetadata(name="todo", risk_level=ToolRiskLevel.safe),
        ToolMetadata(name="skills_list", risk_level=ToolRiskLevel.safe),
        ToolMetadata(name="skill_view", risk_level=ToolRiskLevel.safe),
        ToolMetadata(name="skill_manage", risk_level=ToolRiskLevel.safe),
        ToolMetadata(name="session_search", risk_level=ToolRiskLevel.safe),
        ToolMetadata(name="memory", risk_level=ToolRiskLevel.safe),
        ToolMetadata(name="cronjob", risk_level=ToolRiskLevel.safe),
        ToolMetadata(name="delegate_task", risk_level=ToolRiskLevel.safe),
        ToolMetadata(name="image_generate", risk_level=ToolRiskLevel.safe),
        ToolMetadata(name="computer_use", risk_level=ToolRiskLevel.safe),
        ToolMetadata(name="get_metadata", risk_level=ToolRiskLevel.read_project, requires_path_access=True, target_path_arg="path"),
        ToolMetadata(name="create_directory", risk_level=ToolRiskLevel.write_project, requires_path_access=True, target_path_arg="path"),
        ToolMetadata(name="copy_file", risk_level=ToolRiskLevel.write_project, requires_path_access=True, target_path_arg="source"),
        ToolMetadata(name="read_excerpt", risk_level=ToolRiskLevel.read_project, requires_path_access=True, target_path_arg="file_path"),
        ToolMetadata(name="file_info", risk_level=ToolRiskLevel.read_project, requires_path_access=True, target_path_arg="path"),
        ToolMetadata(name="skill", risk_level=ToolRiskLevel.safe),
    ]

    mcp_tools = [
        ToolMetadata(
            name="writer_workspace.*",
            risk_level=ToolRiskLevel.read_project,
            requires_path_access=False,
            requires_mcp=True,
            target_path_arg="file_path",
            mcp_server_name="writer_workspace",
        ),
        ToolMetadata(
            name="workspace.read_file",
            risk_level=ToolRiskLevel.read_project,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
        ),
        ToolMetadata(
            name="workspace.read_text_file",
            risk_level=ToolRiskLevel.read_project,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
        ),
        ToolMetadata(
            name="workspace.get_file_contents",
            risk_level=ToolRiskLevel.read_project,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
        ),
        ToolMetadata(
            name="workspace.list_directory",
            risk_level=ToolRiskLevel.read_project,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
        ),
        ToolMetadata(
            name="workspace.list_dir",
            risk_level=ToolRiskLevel.read_project,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
        ),
        ToolMetadata(
            name="workspace.stat",
            risk_level=ToolRiskLevel.read_project,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
        ),
        ToolMetadata(
            name="workspace.file_info",
            risk_level=ToolRiskLevel.read_project,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
        ),
        ToolMetadata(
            name="workspace.exists",
            risk_level=ToolRiskLevel.read_project,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
        ),
        ToolMetadata(
            name="workspace.write_file",
            risk_level=ToolRiskLevel.write_project,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
            confirmation_message="Karna 想通过workspace MCP修改文件",
        ),
        ToolMetadata(
            name="workspace.write_text_file",
            risk_level=ToolRiskLevel.write_project,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
            confirmation_message="Karna 想通过workspace MCP修改文件",
        ),
        ToolMetadata(
            name="workspace.create_file",
            risk_level=ToolRiskLevel.write_project,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
            confirmation_message="Karna 想通过workspace MCP创建文件",
        ),
        ToolMetadata(
            name="workspace.save_file",
            risk_level=ToolRiskLevel.write_project,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
            confirmation_message="Karna 想通过workspace MCP保存文件",
        ),
        ToolMetadata(
            name="workspace.create_directory",
            risk_level=ToolRiskLevel.write_project,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
        ),
        ToolMetadata(
            name="workspace.mkdir",
            risk_level=ToolRiskLevel.write_project,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
        ),
        ToolMetadata(
            name="workspace.move_file",
            risk_level=ToolRiskLevel.write_project,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="source",
            mcp_server_name="workspace",
            confirmation_message="Karna 想通过workspace MCP移动文件",
        ),
        ToolMetadata(
            name="workspace.copy_file",
            risk_level=ToolRiskLevel.write_project,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="source",
            mcp_server_name="workspace",
        ),
        ToolMetadata(
            name="workspace.delete_file",
            risk_level=ToolRiskLevel.delete,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
            confirmation_message="Karna 想通过workspace MCP删除文件",
        ),
        ToolMetadata(
            name="workspace.remove_file",
            risk_level=ToolRiskLevel.delete,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
            confirmation_message="Karna 想通过workspace MCP删除文件",
        ),
        ToolMetadata(
            name="workspace.delete",
            risk_level=ToolRiskLevel.delete,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
            confirmation_message="Karna 想通过workspace MCP删除",
        ),
        ToolMetadata(
            name="workspace.*",
            risk_level=ToolRiskLevel.write_project,
            requires_path_access=True,
            requires_mcp=True,
            target_path_arg="path",
            mcp_server_name="workspace",
        ),
        ToolMetadata(
            name="story_bible.*",
            risk_level=ToolRiskLevel.safe,
            requires_mcp=True,
            mcp_server_name="story_bible",
        ),
        ToolMetadata(
            name="living_wiki.*",
            risk_level=ToolRiskLevel.safe,
            requires_mcp=True,
            mcp_server_name="living_wiki",
        ),
        ToolMetadata(
            name="narrative_state.*",
            risk_level=ToolRiskLevel.safe,
            requires_mcp=True,
            mcp_server_name="narrative_state",
        ),
        ToolMetadata(
            name="creative_search.*",
            risk_level=ToolRiskLevel.network,
            requires_network=True,
            requires_mcp=True,
            mcp_server_name="creative_search",
        ),
        ToolMetadata(
            name="soul_workshop.*",
            risk_level=ToolRiskLevel.safe,
            requires_mcp=True,
            mcp_server_name="soul_workshop",
        ),
        ToolMetadata(
            name="filesystem.*",
            risk_level=ToolRiskLevel.read_system,
            requires_system_info=True,
            requires_mcp=True,
            mcp_server_name="filesystem",
        ),
        ToolMetadata(
            name="shell.*",
            risk_level=ToolRiskLevel.execute_command,
            requires_shell=True,
            requires_mcp=True,
            mcp_server_name="shell",
        ),
        ToolMetadata(
            name="command.*",
            risk_level=ToolRiskLevel.execute_command,
            requires_shell=True,
            requires_mcp=True,
            mcp_server_name="command",
        ),
        ToolMetadata(
            name="system_info.*",
            risk_level=ToolRiskLevel.read_system,
            requires_system_info=True,
            requires_mcp=True,
            mcp_server_name="system_info",
        ),
        ToolMetadata(
            name="system.*",
            risk_level=ToolRiskLevel.read_system,
            requires_system_info=True,
            requires_mcp=True,
            mcp_server_name="system",
        ),
        ToolMetadata(
            name="browser_profile.*",
            risk_level=ToolRiskLevel.secret_access,
            requires_system_info=True,
            requires_mcp=True,
            mcp_server_name="browser_profile",
        ),
        ToolMetadata(
            name="browser-profile.*",
            risk_level=ToolRiskLevel.secret_access,
            requires_system_info=True,
            requires_mcp=True,
            mcp_server_name="browser-profile",
        ),
        ToolMetadata(
            name="environment.*",
            risk_level=ToolRiskLevel.secret_access,
            requires_env_vars=True,
            requires_system_info=True,
            requires_mcp=True,
            mcp_server_name="environment",
        ),
        ToolMetadata(
            name="external_upload.*",
            risk_level=ToolRiskLevel.external_upload,
            requires_network=True,
            requires_mcp=True,
            mcp_server_name="external_upload",
        ),
        ToolMetadata(
            name="external-upload.*",
            risk_level=ToolRiskLevel.external_upload,
            requires_network=True,
            requires_mcp=True,
            mcp_server_name="external-upload",
        ),
        ToolMetadata(
            name="exec.*",
            risk_level=ToolRiskLevel.execute_command,
            requires_shell=True,
            requires_mcp=True,
            mcp_server_name="exec",
        ),
        ToolMetadata(
            name="terminal_mcp.*",
            risk_level=ToolRiskLevel.execute_command,
            requires_shell=True,
            requires_mcp=True,
            mcp_server_name="terminal_mcp",
        ),
    ]

    all_tools = (
        file_tools
        + terminal_tools
        + network_tools
        + browser_tools
        + system_tools
        + karna_project_tools
        + mcp_tools
    )

    for tool in all_tools:
        TOOL_REGISTRY[tool.name] = tool


def register_tool_metadata(metadata: ToolMetadata) -> None:
    """Register a tool's metadata.

    Args:
        metadata: The ToolMetadata to register.
    """
    TOOL_REGISTRY[metadata.name] = metadata


def _make_metadata_from_template(
    template: ToolMetadata, tool_name: str, server_name: str
) -> ToolMetadata:
    """Create a concrete ToolMetadata from a wildcard template."""
    return ToolMetadata(
        name=tool_name,
        risk_level=template.risk_level,
        requires_path_access=template.requires_path_access,
        requires_shell=template.requires_shell,
        requires_network=template.requires_network,
        requires_system_info=template.requires_system_info,
        requires_env_vars=template.requires_env_vars,
        requires_mcp=template.requires_mcp,
        target_path_arg=template.target_path_arg,
        confirmation_message=template.confirmation_message,
        mcp_server_name=template.mcp_server_name or server_name,
    )


def get_tool_metadata(tool_name: str) -> Optional[ToolMetadata]:
    """Get metadata for a tool by name.

    First tries exact match, then for MCP tools tries specific tool patterns
    (e.g., workspace.write_file) before falling back to server wildcards
    (e.g., workspace.*). Unregistered dangerous servers get a restrictive
    default metadata.

    Args:
        tool_name: The name of the tool to look up.

    Returns:
        ToolMetadata if found, None otherwise.
    """
    if tool_name in TOOL_REGISTRY:
        return TOOL_REGISTRY[tool_name]

    if tool_name.startswith("mcp_"):
        server_name, tool_suffix = _parse_mcp_tool_name(tool_name)
        if server_name is not None:
            sanitized = re.sub(r"[^A-Za-z0-9_]", "_", server_name)

            patterns_to_try: list[str] = []
            if tool_suffix:
                patterns_to_try.append(f"{server_name}.{tool_suffix}")
                if sanitized != server_name:
                    patterns_to_try.append(f"{sanitized}.{tool_suffix}")
            patterns_to_try.append(f"{server_name}.*")
            if sanitized != server_name:
                patterns_to_try.append(f"{sanitized}.*")

            for pattern in patterns_to_try:
                if pattern in TOOL_REGISTRY:
                    return _make_metadata_from_template(
                        TOOL_REGISTRY[pattern], tool_name, server_name
                    )

            dangerous_names = {re.sub(r"[^A-Za-z0-9_]", "_", n) for n in MCP_DANGEROUS_SERVERS}
            if server_name in MCP_DANGEROUS_SERVERS or sanitized in dangerous_names:
                if server_name in {"shell", "command", "exec"} or sanitized in {"shell", "command", "exec"}:
                    risk = ToolRiskLevel.execute_command
                    requires_shell = True
                    requires_system = False
                    requires_env = False
                    requires_net = False
                elif server_name in {"filesystem", "system", "system_info"} or sanitized in {"filesystem", "system", "system_info"}:
                    risk = ToolRiskLevel.read_system
                    requires_shell = False
                    requires_system = True
                    requires_env = False
                    requires_net = False
                elif server_name in {"environment", "browser_profile", "browser-profile"} or sanitized in {"environment", "browser_profile", "browser_profile"}:
                    risk = ToolRiskLevel.secret_access
                    requires_shell = False
                    requires_system = True
                    requires_env = True
                    requires_net = False
                elif server_name in {"external_upload", "external-upload"} or sanitized in {"external_upload", "external_upload"}:
                    risk = ToolRiskLevel.external_upload
                    requires_shell = False
                    requires_system = False
                    requires_env = False
                    requires_net = True
                else:
                    risk = ToolRiskLevel.mcp_external
                    requires_shell = False
                    requires_system = True
                    requires_env = False
                    requires_net = False
                return ToolMetadata(
                    name=tool_name,
                    risk_level=risk,
                    requires_path_access=False,
                    requires_shell=requires_shell,
                    requires_network=requires_net,
                    requires_system_info=requires_system,
                    requires_env_vars=requires_env,
                    requires_mcp=True,
                    mcp_server_name=server_name,
                )

            return ToolMetadata(
                name=tool_name,
                risk_level=ToolRiskLevel.mcp_external,
                requires_path_access=False,
                requires_shell=False,
                requires_network=False,
                requires_system_info=False,
                requires_env_vars=False,
                requires_mcp=True,
                mcp_server_name=server_name,
            )

    return None


_register_builtin_tools()
