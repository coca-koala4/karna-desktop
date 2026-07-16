"""Capability sandbox data models: enums, dataclasses, and exceptions.

Defines the permission model for tool execution within workspace scopes,
including workspace modes, risk levels, authorization decisions, and
capability scopes that govern what tools can do.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class WorkspaceMode(Enum):
    """Workspace access modes defining the sandbox boundary."""

    project_only = "project_only"
    computer_authorized = "computer_authorized"
    high_risk = "high_risk"


class ToolRiskLevel(Enum):
    """Risk classification for tool operations."""

    safe = "safe"
    read_project = "read_project"
    write_project = "write_project"
    read_system = "read_system"
    write_system = "write_system"
    execute_command = "execute_command"
    delete = "delete"
    network = "network"
    secret_access = "secret_access"
    external_upload = "external_upload"
    mcp_external = "mcp_external"


class AuthorizationDecision(Enum):
    """Authorization result for a tool call."""

    allow = "allow"
    deny = "deny"
    require_confirmation = "require_confirmation"


@dataclass
class ToolAuthorizationResult:
    """Result of a tool authorization check."""

    decision: AuthorizationDecision
    reason: str
    risk_level: ToolRiskLevel | None = None
    confirmation_message: str | None = None


class PermissionDenied(Exception):
    """Raised when a tool call is denied by the sandbox."""

    def __init__(self, message: str, reason: str = "") -> None:
        super().__init__(message)
        self.message = message
        self.reason = reason


@dataclass
class CapabilityScope:
    """Defines the boundaries of what tools can do within a workspace."""

    mode: WorkspaceMode
    workspace_id: str | None = None
    workspace_root: str | None = None
    allowed_paths: list[str] = field(default_factory=list)
    denied_paths: list[str] = field(default_factory=list)
    allow_shell: bool = False
    allow_network: bool = False
    allow_system_info: bool = False
    allow_env_vars: bool = False
    allow_mcp: bool = False
    allowed_mcp_servers: list[str] = field(default_factory=list)
    allowed_tools: list[str] = field(default_factory=list)
    require_confirmation_for: list[ToolRiskLevel] = field(default_factory=list)


@dataclass
class ToolMetadata:
    """Metadata describing a tool's capability requirements and risk."""

    name: str
    risk_level: ToolRiskLevel
    requires_path_access: bool = False
    requires_shell: bool = False
    requires_network: bool = False
    requires_system_info: bool = False
    requires_env_vars: bool = False
    requires_mcp: bool = False
    target_path_arg: str | None = None
    confirmation_message: str | None = None
    mcp_server_name: str | None = None
