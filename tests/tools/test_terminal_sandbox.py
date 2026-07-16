#!/usr/bin/env python3
"""Test terminal tool sandbox hardening."""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from tools.capability_sandbox.models import CapabilityScope, WorkspaceMode
from tools.capability_sandbox.scope_store import set_scope, clear_all_scopes
from tools import terminal_tool


class TestTerminalSandbox(unittest.TestCase):
    def setUp(self):
        clear_all_scopes()
        terminal_tool._active_environments.clear()
        terminal_tool._last_activity.clear()
        self.test_session_id = "test-session-123"
        self.temp_dir = tempfile.mkdtemp()

    def tearDown(self):
        clear_all_scopes()
        terminal_tool._active_environments.clear()
        terminal_tool._last_activity.clear()

    def test_project_only_without_allow_shell_blocks(self):
        scope = CapabilityScope(
            mode=WorkspaceMode.project_only,
            workspace_root=self.temp_dir,
            allow_shell=False,
        )
        set_scope(self.test_session_id, scope)

        with patch.dict(os.environ, {"TERMINAL_ENV": "local"}):
            result = terminal_tool.terminal_tool(
                command="dir",
                session_id=self.test_session_id,
            )
            data = json.loads(result)
            self.assertEqual(data["exit_code"], -1)
            self.assertEqual(data["status"], "blocked")
            self.assertIn("仅当前项目", data["error"])

    def test_project_only_with_allow_shell_blocks_dangerous_command(self):
        scope = CapabilityScope(
            mode=WorkspaceMode.project_only,
            workspace_root=self.temp_dir,
            allow_shell=True,
            allow_network=False,
        )
        set_scope(self.test_session_id, scope)

        with patch.dict(os.environ, {"TERMINAL_ENV": "local"}):
            result = terminal_tool.terminal_tool(
                command="powershell Get-PSDrive C",
                session_id=self.test_session_id,
            )
            data = json.loads(result)
            self.assertEqual(data["exit_code"], -1)
            self.assertEqual(data["status"], "blocked")
            self.assertIn("高危命令", data["error"])

    def test_project_only_blocks_unlisted_command(self):
        scope = CapabilityScope(
            mode=WorkspaceMode.project_only,
            workspace_root=self.temp_dir,
            allow_shell=True,
            allow_network=False,
        )
        set_scope(self.test_session_id, scope)

        with patch.dict(os.environ, {"TERMINAL_ENV": "local"}):
            result = terminal_tool.terminal_tool(
                command="whoami",
                session_id=self.test_session_id,
            )
            data = json.loads(result)
            self.assertEqual(data["exit_code"], -1)
            self.assertEqual(data["status"], "blocked")
            self.assertIn("不在允许列表", data["error"])

    def test_safe_command_git_status_allowed_check(self):
        allowed, reason = terminal_tool._is_command_allowed("git status")
        self.assertTrue(allowed)
        self.assertIsNone(reason)

    def test_safe_command_npm_test_allowed_check(self):
        allowed, reason = terminal_tool._is_command_allowed("npm test")
        self.assertTrue(allowed)
        self.assertIsNone(reason)

    def test_safe_command_pytest_allowed_check(self):
        allowed, reason = terminal_tool._is_command_allowed("pytest")
        self.assertTrue(allowed)
        self.assertIsNone(reason)

    def test_safe_command_ls_allowed_check(self):
        allowed, reason = terminal_tool._is_command_allowed("ls -la")
        self.assertTrue(allowed)
        self.assertIsNone(reason)

    def test_blocklist_python_c_blocked(self):
        allowed, reason = terminal_tool._is_command_allowed("python -c 'import os'")
        self.assertFalse(allowed)
        self.assertIn("python -c", reason)

    def test_blocklist_node_e_blocked(self):
        allowed, reason = terminal_tool._is_command_allowed("node -e 'console.log(1)'")
        self.assertFalse(allowed)
        self.assertIn("node -e", reason)

    def test_blocklist_cmd_blocked(self):
        allowed, reason = terminal_tool._is_command_allowed("cmd /c dir")
        self.assertFalse(allowed)
        self.assertIn("cmd", reason)

    def test_computer_authorized_mode_allows_commands(self):
        scope = CapabilityScope(
            mode=WorkspaceMode.computer_authorized,
            workspace_root=self.temp_dir,
            allow_shell=True,
        )
        set_scope(self.test_session_id, scope)

        mock_approval = {"approved": True, "user_approved": False, "smart_approved": False}
        with patch.dict(os.environ, {"TERMINAL_ENV": "local"}), \
             patch.object(terminal_tool, '_check_all_guards', return_value=mock_approval), \
             patch.object(terminal_tool, '_LocalEnvironment') as mock_local:
            mock_env = MagicMock()
            mock_env.execute.return_value = {
                "output": "mocked output",
                "returncode": 0,
            }
            mock_local.return_value = mock_env
            result = terminal_tool.terminal_tool(
                command="echo hello",
                session_id=self.test_session_id,
            )
            mock_local.assert_called_once()

    def test_high_risk_mode_allows_local_env(self):
        scope = CapabilityScope(
            mode=WorkspaceMode.high_risk,
            workspace_root=self.temp_dir,
            allow_shell=True,
            allow_network=True,
        )
        set_scope(self.test_session_id, scope)

        mock_approval = {"approved": True, "user_approved": False, "smart_approved": False}
        with patch.dict(os.environ, {"TERMINAL_ENV": "local"}), \
             patch.object(terminal_tool, '_check_all_guards', return_value=mock_approval), \
             patch.object(terminal_tool, '_LocalEnvironment') as mock_local:
            mock_env = MagicMock()
            mock_env.execute.return_value = {
                "output": "mocked",
                "returncode": 0,
            }
            mock_local.return_value = mock_env
            result = terminal_tool.terminal_tool(
                command="ls",
                session_id=self.test_session_id,
            )
            mock_local.assert_called_once()

    def test_project_only_uses_docker_with_hardened_config(self):
        scope = CapabilityScope(
            mode=WorkspaceMode.project_only,
            workspace_root=self.temp_dir,
            allow_shell=True,
            allow_network=False,
        )
        set_scope(self.test_session_id, scope)

        mock_approval = {"approved": True, "user_approved": False, "smart_approved": False}
        mock_docker_env = MagicMock()
        mock_docker_env.execute.return_value = {
            "output": "mocked docker output",
            "returncode": 0,
        }

        with patch.dict(os.environ, {"TERMINAL_ENV": "local"}), \
             patch.object(terminal_tool, '_check_all_guards', return_value=mock_approval), \
             patch.object(terminal_tool, '_DockerEnvironment', return_value=mock_docker_env) as mock_docker, \
             patch.object(terminal_tool, '_maybe_reap_docker_orphans'):
            result = terminal_tool.terminal_tool(
                command="git status",
                session_id=self.test_session_id,
            )
            mock_docker.assert_called_once()
            call_kwargs = mock_docker.call_args.kwargs
            self.assertEqual(call_kwargs['network'], False)
            self.assertEqual(call_kwargs['cwd'], '/workspace')
            self.assertEqual(call_kwargs['host_cwd'], self.temp_dir)
            self.assertTrue(call_kwargs['auto_mount_cwd'])
            extra_args = call_kwargs.get('extra_args', [])
            self.assertIn('--read-only', extra_args)
            self.assertFalse(call_kwargs['persistent_filesystem'])


if __name__ == "__main__":
    unittest.main()
