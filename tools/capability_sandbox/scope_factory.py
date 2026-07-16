"""Factory functions for creating capability scopes.

Provides pre-configured CapabilityScope instances for common workspace modes,
starting with the restrictive project_only scope that limits tool access to
the workspace directory.
"""

from __future__ import annotations

from tools.capability_sandbox.models import (
    CapabilityScope,
    ToolRiskLevel,
    WorkspaceMode,
)


def create_project_only_scope(
    workspace_id: str,
    workspace_root: str,
) -> CapabilityScope:
    """Create a default project-only capability scope.

    The project_only mode restricts tool execution to the workspace root,
    denies access to system directories, disables shell/network/system-info
    access, and requires confirmation for writes and deletes within the
    project. Internal Karna MCP servers are permitted.

    Args:
        workspace_id: Unique identifier for the workspace.
        workspace_root: Absolute path to the workspace root directory.

    Returns:
        A CapabilityScope configured for project-only access.
    """
    return CapabilityScope(
        mode=WorkspaceMode.project_only,
        workspace_id=workspace_id,
        workspace_root=workspace_root,
        allowed_paths=[workspace_root],
        denied_paths=[
            "C:\\",
            "D:\\",
            "/",
            "/etc",
            "/root",
            "/home",
            "/usr",
            "/var",
            "/bin",
            "/sbin",
            "/boot",
            "/lib",
            "C:\\Windows",
            "C:\\Program Files",
            "C:\\Program Files (x86)",
            "C:\\Users\\All Users",
            "C:\\ProgramData",
        ],
        allow_shell=False,
        allow_network=False,
        allow_system_info=False,
        allow_env_vars=False,
        allow_mcp=True,
        allowed_mcp_servers=[
            "workspace",
            "writer_workspace",
            "story_bible",
            "living_wiki",
            "narrative_state",
            "creative_search",
            "soul_workshop",
        ],
        allowed_tools=[
            "read_file",
            "write_file",
            "list_dir",
            "search_files",
            "get_metadata",
            "create_directory",
            "move_file",
            "copy_file",
            "read_excerpt",
            "file_info",
            "todo",
            "skill",
            "clarify",
        ],
        require_confirmation_for=[
            ToolRiskLevel.write_project,
            ToolRiskLevel.delete,
        ],
    )


def create_computer_authorized_scope(
    workspace_id: str | None = None,
    workspace_root: str | None = None,
    allow_shell: bool = True,
    allow_network: bool = True,
    allow_system_info: bool = True,
    allow_env_vars: bool = False,
    allow_mcp: bool = True,
    allowed_mcp_servers: list[str] | None = None,
) -> CapabilityScope:
    """Create a computer-authorized capability scope.

    The computer_authorized mode grants full access to the system, including
    shell, network, system info, but requires confirmation for high-risk
    operations like delete and execute_command.

    Args:
        workspace_id: Optional workspace identifier.
        workspace_root: Optional workspace root directory.
        allow_shell: Whether to allow shell/terminal access.
        allow_network: Whether to allow network access.
        allow_system_info: Whether to allow system info access.
        allow_env_vars: Whether to allow environment variable access.
        allow_mcp: Whether to allow MCP tool calls.
        allowed_mcp_servers: Optional list of allowed MCP server names.
            If None, all non-dangerous MCP servers are allowed.

    Returns:
        A CapabilityScope configured for computer-authorized access.
    """
    denied_paths = [
        "C:\\Windows\\System32\\config",
        "/etc/shadow",
        "/etc/sudoers",
        "/root/.ssh",
    ]
    allowed_paths = []
    if workspace_root:
        allowed_paths.append(workspace_root)

    return CapabilityScope(
        mode=WorkspaceMode.computer_authorized,
        workspace_id=workspace_id,
        workspace_root=workspace_root,
        allowed_paths=allowed_paths,
        denied_paths=denied_paths,
        allow_shell=allow_shell,
        allow_network=allow_network,
        allow_system_info=allow_system_info,
        allow_env_vars=allow_env_vars,
        allow_mcp=allow_mcp,
        allowed_mcp_servers=allowed_mcp_servers or [],
        allowed_tools=[],
        require_confirmation_for=[
            ToolRiskLevel.write_project,
            ToolRiskLevel.delete,
            ToolRiskLevel.execute_command,
        ],
    )


def create_high_risk_scope(
    workspace_id: str | None = None,
    workspace_root: str | None = None,
) -> CapabilityScope:
    """Create a high-risk (free) capability scope with full unrestricted access.

    The high_risk mode grants complete system access without any confirmation
    requirements. All tools are allowed, all permissions are enabled, and no
    operations require user confirmation. This should only be used when the
    user explicitly opts in to unrestricted mode.

    Args:
        workspace_id: Optional workspace identifier.
        workspace_root: Optional workspace root directory.

    Returns:
        A CapabilityScope configured for unrestricted high-risk access.
    """
    allowed_paths = []
    if workspace_root:
        allowed_paths.append(workspace_root)

    return CapabilityScope(
        mode=WorkspaceMode.high_risk,
        workspace_id=workspace_id,
        workspace_root=workspace_root,
        allowed_paths=allowed_paths,
        denied_paths=[],
        allow_shell=True,
        allow_network=True,
        allow_system_info=True,
        allow_env_vars=True,
        allow_mcp=True,
        allowed_mcp_servers=[],
        allowed_tools=[],
        require_confirmation_for=[],
    )
