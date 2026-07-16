"""Tests for capability sandbox integration (Task 4 & Task 6).

Verifies that the permission gateway correctly authorizes and denies
tool calls in project_only mode, including system info permission control.
"""

from __future__ import annotations

import os
import tempfile
import threading
import unittest
from unittest.mock import patch

from tools.capability_sandbox import (
    AuthorizationDecision,
    WorkspaceMode,
    authorize_tool_call,
    clear_all_scopes,
    create_project_only_scope,
    get_scope,
    log_authorization_decision,
    set_scope,
    canonicalize_path,
)
from tools.capability_sandbox.models import CapabilityScope


class TestScopeStore(unittest.TestCase):
    def setUp(self):
        clear_all_scopes()

    def tearDown(self):
        clear_all_scopes()

    def test_get_scope_creates_default(self):
        scope = get_scope("test-session")
        self.assertIsNotNone(scope)
        self.assertEqual(scope.mode, WorkspaceMode.project_only)

    def test_set_and_get_scope(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            custom_scope = create_project_only_scope("custom", tmpdir)
            set_scope("custom-session", custom_scope)
            retrieved = get_scope("custom-session")
            self.assertEqual(retrieved.workspace_id, "custom")
            self.assertEqual(canonicalize_path(retrieved.workspace_root), canonicalize_path(tmpdir))

    def test_thread_safety(self):
        errors = []

        def worker(thread_id: int):
            try:
                for i in range(100):
                    session_id = f"thread-{thread_id}-{i}"
                    scope = get_scope(session_id)
                    self.assertIsNotNone(scope)
            except Exception as e:
                errors.append(e)

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(10)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertEqual(len(errors), 0, f"Thread safety errors: {errors}")


class TestAuthorizationGateway(unittest.TestCase):
    def setUp(self):
        clear_all_scopes()
        self.tmpdir = tempfile.TemporaryDirectory()
        self.workspace_root = self.tmpdir.name
        self.scope = create_project_only_scope("test", self.workspace_root)

    def tearDown(self):
        self.tmpdir.cleanup()
        clear_all_scopes()

    def test_terminal_denied_in_project_only(self):
        result = authorize_tool_call("terminal", {"command": "ls"}, self.scope)
        self.assertEqual(result.decision, AuthorizationDecision.deny)
        self.assertIn("终端命令", result.reason)

    def test_read_file_allowed_in_project(self):
        test_file = os.path.join(self.workspace_root, "test.txt")
        with open(test_file, "w") as f:
            f.write("test")

        result = authorize_tool_call("read_file", {"file_path": test_file}, self.scope)
        self.assertEqual(result.decision, AuthorizationDecision.allow)

    def test_execute_code_denied_in_project_only(self):
        result = authorize_tool_call(
            "execute_code",
            {"code": "import shutil; print(shutil.disk_usage('C:\\\\'))"},
            self.scope,
        )
        self.assertEqual(result.decision, AuthorizationDecision.deny)

    def test_execute_code_entrypoint_cannot_bypass_gateway(self):
        import json
        from tools.code_execution_tool import execute_code

        set_scope("execute-code-session", self.scope)
        with patch(
            "tools.approval.get_current_session_key",
            return_value="execute-code-session",
        ), patch(
            "tools.code_execution_tool.subprocess.Popen",
            side_effect=AssertionError("Python child process must not start"),
        ):
            raw = execute_code(
                "import shutil; print(shutil.disk_usage('C:\\\\'))",
                task_id="execute-code-session",
            )

        payload = json.loads(raw)
        self.assertEqual(payload["status"], "blocked")
        self.assertEqual(payload["error_type"], "permission_denied")
        self.assertEqual(payload["capability"], "system.disk_usage")

    def test_read_file_outside_project_denied(self):
        with tempfile.TemporaryDirectory() as outside_dir:
            outside_file = os.path.join(outside_dir, "secret.txt")
            with open(outside_file, "w") as f:
                f.write("secret")

            result = authorize_tool_call("read_file", {"file_path": outside_file}, self.scope)
            self.assertEqual(result.decision, AuthorizationDecision.deny)

    def test_network_tools_denied(self):
        result = authorize_tool_call("web_search", {"query": "test"}, self.scope)
        self.assertEqual(result.decision, AuthorizationDecision.deny)

    def test_system_info_denied(self):
        result = authorize_tool_call("process", {}, self.scope)
        self.assertEqual(result.decision, AuthorizationDecision.deny)
        self.assertIn("系统信息", result.reason)
        self.assertIn("电脑授权模式", result.reason)

    def test_disk_usage_denied_in_project_only(self):
        result = authorize_tool_call("disk_usage", {}, self.scope)
        self.assertEqual(result.decision, AuthorizationDecision.deny)
        self.assertIn("系统信息", result.reason)

    def test_os_info_denied_in_project_only(self):
        result = authorize_tool_call("os_info", {}, self.scope)
        self.assertEqual(result.decision, AuthorizationDecision.deny)
        self.assertIn("系统信息", result.reason)

    def test_system_info_tool_denied_in_project_only(self):
        result = authorize_tool_call("system_info", {}, self.scope)
        self.assertEqual(result.decision, AuthorizationDecision.deny)
        self.assertIn("系统信息", result.reason)

    def test_network_config_denied_in_project_only(self):
        result = authorize_tool_call("network_config", {}, self.scope)
        self.assertEqual(result.decision, AuthorizationDecision.deny)
        self.assertIn("系统信息", result.reason)

    def test_env_vars_denied_in_project_only(self):
        result = authorize_tool_call("env_vars", {}, self.scope)
        self.assertEqual(result.decision, AuthorizationDecision.deny)

    def test_get_env_denied_in_project_only(self):
        result = authorize_tool_call("get_env", {}, self.scope)
        self.assertEqual(result.decision, AuthorizationDecision.deny)

    def test_project_tools_not_affected_by_system_info_restriction(self):
        test_file = os.path.join(self.workspace_root, "test.txt")
        with open(test_file, "w") as f:
            f.write("test")
        result = authorize_tool_call("read_file", {"file_path": test_file}, self.scope)
        self.assertEqual(result.decision, AuthorizationDecision.allow)

        result = authorize_tool_call("list_dir", {"path": self.workspace_root}, self.scope)
        self.assertEqual(result.decision, AuthorizationDecision.allow)

        result = authorize_tool_call("search_files", {"path": self.workspace_root, "pattern": "test"}, self.scope)
        self.assertEqual(result.decision, AuthorizationDecision.allow)

    def test_list_dir_allowed_in_project(self):
        result = authorize_tool_call("list_dir", {"path": self.workspace_root}, self.scope)
        self.assertEqual(result.decision, AuthorizationDecision.allow)

    def test_unregistered_tool_denied(self):
        result = authorize_tool_call("nonexistent_tool_xyz", {}, self.scope)
        self.assertEqual(result.decision, AuthorizationDecision.deny)


class TestAuditLogging(unittest.TestCase):
    def setUp(self):
        clear_all_scopes()

    def tearDown(self):
        clear_all_scopes()

    def test_log_authorization_does_not_raise(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            scope = create_project_only_scope("test", tmpdir)
            result = authorize_tool_call("terminal", {"command": "ls"}, scope)
            try:
                log_authorization_decision(
                    session_id="test-session",
                    scope=scope,
                    tool_name="terminal",
                    tool_args={"command": "ls"},
                    result=result,
                )
            except Exception as e:
                self.fail(f"log_authorization_decision raised {e}")


class TestComputerAuthorizedMode(unittest.TestCase):
    def setUp(self):
        clear_all_scopes()
        self.tmpdir = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmpdir.cleanup()
        clear_all_scopes()

    def _create_computer_scope(self, allow_env_vars: bool = True):
        from tools.capability_sandbox.models import ToolRiskLevel
        return CapabilityScope(
            mode=WorkspaceMode.computer_authorized,
            workspace_root=self.tmpdir.name,
            allowed_paths=[self.tmpdir.name],
            allow_shell=True,
            allow_network=True,
            allow_system_info=True,
            allow_env_vars=allow_env_vars,
        )

    def test_computer_authorized_allows_shell(self):
        scope = self._create_computer_scope()
        result = authorize_tool_call("terminal", {"command": "echo hello"}, scope)
        self.assertEqual(result.decision, AuthorizationDecision.allow)

    def test_computer_authorized_allows_process(self):
        scope = self._create_computer_scope()
        result = authorize_tool_call("process", {"action": "list"}, scope)
        self.assertEqual(result.decision, AuthorizationDecision.allow)

    def test_computer_authorized_allows_disk_usage(self):
        scope = self._create_computer_scope()
        result = authorize_tool_call("disk_usage", {}, scope)
        self.assertEqual(result.decision, AuthorizationDecision.allow)

    def test_computer_authorized_allows_os_info(self):
        scope = self._create_computer_scope()
        result = authorize_tool_call("os_info", {}, scope)
        self.assertEqual(result.decision, AuthorizationDecision.allow)

    def test_computer_authorized_allows_system_info(self):
        scope = self._create_computer_scope()
        result = authorize_tool_call("system_info", {}, scope)
        self.assertEqual(result.decision, AuthorizationDecision.allow)

    def test_computer_authorized_allows_network_config(self):
        scope = self._create_computer_scope()
        result = authorize_tool_call("network_config", {}, scope)
        self.assertEqual(result.decision, AuthorizationDecision.allow)

    def test_computer_authorized_allows_env_vars_when_enabled(self):
        scope = self._create_computer_scope(allow_env_vars=True)
        result = authorize_tool_call("env_vars", {}, scope)
        self.assertEqual(result.decision, AuthorizationDecision.allow)

    def test_env_vars_denied_when_allow_env_vars_false(self):
        scope = self._create_computer_scope(allow_env_vars=False)
        result = authorize_tool_call("process", {}, scope)
        self.assertEqual(result.decision, AuthorizationDecision.allow)
        result = authorize_tool_call("env_vars", {}, scope)
        self.assertEqual(result.decision, AuthorizationDecision.deny)
        self.assertIn("环境变量", result.reason)

    def test_env_vars_denied_when_allow_system_info_false(self):
        scope = CapabilityScope(
            mode=WorkspaceMode.computer_authorized,
            workspace_root=self.tmpdir.name,
            allowed_paths=[self.tmpdir.name],
            allow_shell=True,
            allow_network=True,
            allow_system_info=False,
            allow_env_vars=True,
        )
        result = authorize_tool_call("process", {}, scope)
        self.assertEqual(result.decision, AuthorizationDecision.deny)
        result = authorize_tool_call("env_vars", {}, scope)
        self.assertEqual(result.decision, AuthorizationDecision.deny)


if __name__ == "__main__":
    unittest.main()
