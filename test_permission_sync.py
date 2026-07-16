#!/usr/bin/env python3
"""Test script for permission scope synchronization."""

import os
import sys
import tempfile

project_root = os.path.dirname(os.path.abspath(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from tools.capability_sandbox import (
    create_project_only_scope,
    create_computer_authorized_scope,
    create_high_risk_scope,
    set_scope_by_mode,
    get_scope,
    WorkspaceMode,
    ToolRiskLevel,
)


def test_scope_factories():
    """Test that all three scope factory functions create correct scopes."""
    print("=" * 60)
    print("Testing scope factory functions...")
    print("=" * 60)

    with tempfile.TemporaryDirectory() as tmpdir:
        workspace_id = "test-workspace"
        workspace_root = tmpdir

        # Test project_only scope
        print("\n1. Testing create_project_only_scope():")
        project_scope = create_project_only_scope(workspace_id, workspace_root)
        print(f"   Mode: {project_scope.mode}")
        print(f"   allow_shell: {project_scope.allow_shell}")
        print(f"   allow_network: {project_scope.allow_network}")
        print(f"   allow_system_info: {project_scope.allow_system_info}")
        print(f"   allow_env_vars: {project_scope.allow_env_vars}")
        print(f"   allowed_paths: {project_scope.allowed_paths}")
        print(f"   denied_paths count: {len(project_scope.denied_paths)}")
        print(f"   require_confirmation_for: {[r.name for r in project_scope.require_confirmation_for]}")
        assert project_scope.mode == WorkspaceMode.project_only
        assert project_scope.allow_shell is False
        assert project_scope.allow_network is False
        assert project_scope.allow_system_info is False
        assert ToolRiskLevel.write_project in project_scope.require_confirmation_for
        assert ToolRiskLevel.delete in project_scope.require_confirmation_for
        assert ToolRiskLevel.execute_command not in project_scope.require_confirmation_for
        print("   ✓ Project-only scope OK")

        # Test computer_authorized scope
        print("\n2. Testing create_computer_authorized_scope():")
        computer_scope = create_computer_authorized_scope(workspace_id, workspace_root)
        print(f"   Mode: {computer_scope.mode}")
        print(f"   allow_shell: {computer_scope.allow_shell}")
        print(f"   allow_network: {computer_scope.allow_network}")
        print(f"   allow_system_info: {computer_scope.allow_system_info}")
        print(f"   allow_env_vars: {computer_scope.allow_env_vars}")
        print(f"   allowed_paths: {computer_scope.allowed_paths}")
        print(f"   denied_paths count: {len(computer_scope.denied_paths)}")
        print(f"   require_confirmation_for: {[r.name for r in computer_scope.require_confirmation_for]}")
        assert computer_scope.mode == WorkspaceMode.computer_authorized
        assert computer_scope.allow_shell is True
        assert computer_scope.allow_network is True
        assert computer_scope.allow_system_info is True
        assert computer_scope.allow_env_vars is False
        assert ToolRiskLevel.write_project in computer_scope.require_confirmation_for
        assert ToolRiskLevel.delete in computer_scope.require_confirmation_for
        assert ToolRiskLevel.execute_command in computer_scope.require_confirmation_for
        print("   ✓ Computer-authorized scope OK")

        # Test high_risk scope
        print("\n3. Testing create_high_risk_scope():")
        free_scope = create_high_risk_scope(workspace_id, workspace_root)
        print(f"   Mode: {free_scope.mode}")
        print(f"   allow_shell: {free_scope.allow_shell}")
        print(f"   allow_network: {free_scope.allow_network}")
        print(f"   allow_system_info: {free_scope.allow_system_info}")
        print(f"   allow_env_vars: {free_scope.allow_env_vars}")
        print(f"   allowed_paths: {free_scope.allowed_paths}")
        print(f"   denied_paths count: {len(free_scope.denied_paths)}")
        print(f"   require_confirmation_for: {[r.name for r in free_scope.require_confirmation_for]}")
        assert free_scope.mode == WorkspaceMode.high_risk
        assert free_scope.allow_shell is True
        assert free_scope.allow_network is True
        assert free_scope.allow_system_info is True
        assert free_scope.allow_env_vars is True
        assert len(free_scope.denied_paths) == 0
        assert len(free_scope.require_confirmation_for) == 0
        print("   ✓ High-risk (free) scope OK")

    return True


def test_set_scope_by_mode():
    """Test set_scope_by_mode helper function."""
    print("\n" + "=" * 60)
    print("Testing set_scope_by_mode()...")
    print("=" * 60)

    import tempfile
    with tempfile.TemporaryDirectory() as tmpdir:
        session_id = "test-session-123"
        workspace_id = "test-ws"
        workspace_root = tmpdir

        # Test 'project' mode
        print("\n1. Testing mode='project':")
        scope = set_scope_by_mode(session_id, workspace_id, workspace_root, "project")
        assert scope.mode == WorkspaceMode.project_only
        stored = get_scope(session_id)
        assert stored.mode == WorkspaceMode.project_only
        print(f"   ✓ Mode set to project_only")

        # Test 'computer' mode
        print("\n2. Testing mode='computer':")
        scope = set_scope_by_mode(session_id, workspace_id, workspace_root, "computer")
        assert scope.mode == WorkspaceMode.computer_authorized
        stored = get_scope(session_id)
        assert stored.mode == WorkspaceMode.computer_authorized
        print(f"   ✓ Mode set to computer_authorized")

        # Test 'free' mode
        print("\n3. Testing mode='free':")
        scope = set_scope_by_mode(session_id, workspace_id, workspace_root, "free")
        assert scope.mode == WorkspaceMode.high_risk
        stored = get_scope(session_id)
        assert stored.mode == WorkspaceMode.high_risk
        print(f"   ✓ Mode set to high_risk")

        # Test aliases
        print("\n4. Testing mode aliases:")
        scope = set_scope_by_mode(session_id, workspace_id, workspace_root, "high_risk")
        assert scope.mode == WorkspaceMode.high_risk
        print("   'high_risk' alias works")
        scope = set_scope_by_mode(session_id, workspace_id, workspace_root, "computer_authorized")
        assert scope.mode == WorkspaceMode.computer_authorized
        print("   'computer_authorized' alias works")
        scope = set_scope_by_mode(session_id, workspace_id, workspace_root, "desktop")
        assert scope.mode == WorkspaceMode.computer_authorized
        print("   'desktop' alias works")
        scope = set_scope_by_mode(session_id, workspace_id, workspace_root, "unrestricted")
        assert scope.mode == WorkspaceMode.high_risk
        print("   'unrestricted' alias works")
        print("   ✓ All aliases work")

        # Test case insensitivity
        print("\n5. Testing case insensitivity:")
        scope = set_scope_by_mode(session_id, workspace_id, workspace_root, "COMPUTER")
        assert scope.mode == WorkspaceMode.computer_authorized
        scope = set_scope_by_mode(session_id, workspace_id, workspace_root, "Free")
        assert scope.mode == WorkspaceMode.high_risk
        print("   ✓ Case insensitive")

        # Test default (project) for unknown modes
        print("\n6. Testing default to project for unknown modes:")
        scope = set_scope_by_mode(session_id, workspace_id, workspace_root, "unknown_mode")
        assert scope.mode == WorkspaceMode.project_only
        print("   ✓ Unknown modes default to project_only")

    return True


def test_message_detection():
    """Test that message text detection logic works."""
    print("\n" + "=" * 60)
    print("Testing message text permission detection...")
    print("=" * 60)

    def detect_permission_mode(text: str) -> str:
        if not text:
            return "project"
        if "允许在整个电脑内自由执行所有操作" in text or "无需额外确认" in text:
            return "free"
        if "允许在整个电脑内读写文件和执行命令" in text:
            return "computer"
        return "project"

    # Project mode (default)
    msg1 = "你好，请帮我写一个Python脚本"
    assert detect_permission_mode(msg1) == "project"
    print(f"\n1. Normal message: '{msg1[:30]}...' → project ✓")

    # Computer mode
    msg2 = """你好，请帮我配置系统

执行要求：
- 可用资源：技能=无；MCP/工具=无
- 操作权限：允许在整个电脑内读写文件和执行命令，但执行删除等危险操作前必须向用户确认。
"""
    assert detect_permission_mode(msg2) == "computer"
    print(f"2. Computer permission message → computer ✓")

    # Free mode
    msg3 = """请帮我清理临时文件

执行要求：
- 操作权限：允许在整个电脑内自由执行所有操作，包括删除文件、清空目录等，无需额外确认，请谨慎但高效地完成任务。
"""
    assert detect_permission_mode(msg3) == "free"
    print(f"3. Free permission message → free ✓")

    return True


def main():
    """Run all tests."""
    print("\n" + "=" * 60)
    print("Karna Permission Synchronization - Test Suite")
    print("=" * 60)

    try:
        test_scope_factories()
        test_set_scope_by_mode()
        test_message_detection()

        print("\n" + "=" * 60)
        print("ALL TESTS PASSED!")
        print("=" * 60)
        return 0
    except Exception as e:
        print(f"\n✗ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    sys.exit(main())
