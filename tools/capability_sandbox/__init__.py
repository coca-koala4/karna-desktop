"""Capability sandbox — permission boundaries for tool execution.

This module provides the authorization layer that governs what tools can do
within different workspace modes. It defines risk levels, capability scopes,
and a gateway function that authorizes or denies tool calls based on the
active scope.

Public API:
    Models:
        - WorkspaceMode: Access mode enums (project_only, computer_authorized, high_risk)
        - ToolRiskLevel: Risk classification enums for tool operations
        - AuthorizationDecision: allow / deny / require_confirmation
        - ToolAuthorizationResult: Dataclass holding authorization outcome
        - PermissionDenied: Exception raised when a tool call is denied
        - CapabilityScope: Dataclass defining permission boundaries
        - ToolMetadata: Dataclass describing tool requirements and risk
    Factories:
        - create_project_only_scope: Build a restrictive project-only scope
        - create_computer_authorized_scope: Build a full-access computer-authorized scope
    Gateway:
        - authorize_tool_call: Evaluate a tool call against a scope
    Registry:
        - get_tool_metadata: Look up tool metadata by name (supports MCP prefix matching)
        - register_tool_metadata: Register custom tool metadata
        - TOOL_REGISTRY: Dictionary of all registered tools
"""

from tools.capability_sandbox.models import (
    AuthorizationDecision,
    CapabilityScope,
    PermissionDenied,
    ToolAuthorizationResult,
    ToolMetadata,
    ToolRiskLevel,
    WorkspaceMode,
)
from tools.capability_sandbox.scope_factory import (
    create_computer_authorized_scope,
    create_high_risk_scope,
    create_project_only_scope,
)
from tools.capability_sandbox.gateway import authorize_tool_call
from tools.capability_sandbox.path_policy import (
    assert_path_allowed,
    canonicalize_path,
    extract_target_path,
    is_sub_path,
    test_path_policy,
)
from tools.capability_sandbox.tool_registry import (
    TOOL_REGISTRY,
    get_tool_metadata,
    register_tool_metadata,
)
from tools.capability_sandbox.scope_store import (
    clear_all_scopes,
    clear_scope,
    get_explicit_scope,
    get_scope,
    set_scope,
    set_scope_by_mode,
)
from tools.capability_sandbox.audit import log_authorization_decision
from tools.capability_sandbox.file_protection import (
    create_snapshot,
    get_protection_dirs,
    move_to_trash,
    protect_file_operation,
    should_protect,
    test_file_protection,
)

__all__ = [
    "WorkspaceMode",
    "ToolRiskLevel",
    "AuthorizationDecision",
    "ToolAuthorizationResult",
    "PermissionDenied",
    "CapabilityScope",
    "ToolMetadata",
    "create_project_only_scope",
    "create_computer_authorized_scope",
    "create_high_risk_scope",
    "authorize_tool_call",
    "canonicalize_path",
    "is_sub_path",
    "assert_path_allowed",
    "extract_target_path",
    "test_path_policy",
    "get_tool_metadata",
    "register_tool_metadata",
    "TOOL_REGISTRY",
    "get_explicit_scope",
    "get_scope",
    "set_scope",
    "set_scope_by_mode",
    "clear_scope",
    "clear_all_scopes",
    "log_authorization_decision",
    "get_protection_dirs",
    "create_snapshot",
    "move_to_trash",
    "should_protect",
    "protect_file_operation",
    "test_file_protection",
]
