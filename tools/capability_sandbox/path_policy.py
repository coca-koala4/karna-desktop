"""Path security policy module.

Provides path canonicalization, subpath checking, and path access
authorization for the capability sandbox.
"""

from __future__ import annotations

import os
import sys
from typing import Any

from tools.capability_sandbox.models import (
    CapabilityScope,
    PermissionDenied,
    ToolMetadata,
    ToolRiskLevel,
)


def canonicalize_path(path: str) -> str:
    if not path:
        return path

    path = os.path.expanduser(path)
    path = os.path.realpath(path)
    path = os.path.normpath(path)
    path = os.path.abspath(path)
    path = path.replace('/', os.sep).replace('\\', os.sep)

    if sys.platform == 'win32':
        if not path.startswith('\\\\'):
            if len(path) >= 2 and path[1] == ':':
                drive = path[0].upper() + ':'
                path = drive + path[2:]

    return path


def _normalize_for_comparison(path: str) -> str:
    path = canonicalize_path(path)
    if sys.platform == 'win32':
        path = path.lower()
    return path


def is_sub_path(child: str, parent: str) -> bool:
    child_norm = _normalize_for_comparison(child)
    parent_norm = _normalize_for_comparison(parent)

    if child_norm == parent_norm:
        return True

    if not child_norm.startswith(parent_norm):
        return False

    if parent_norm.endswith(os.sep):
        return True
    else:
        return len(child_norm) > len(parent_norm) and child_norm[len(parent_norm)] == os.sep


def assert_path_allowed(target_path: str, scope: CapabilityScope) -> str:
    original_path = target_path
    canon_path = canonicalize_path(target_path)

    if not scope.allowed_paths:
        return canon_path

    canon_allowed = [canonicalize_path(p) for p in scope.allowed_paths]
    canon_denied = [canonicalize_path(p) for p in scope.denied_paths]

    for allowed in canon_allowed:
        if is_sub_path(canon_path, allowed):
            return canon_path

    for denied in canon_denied:
        if is_sub_path(canon_path, denied):
            raise PermissionDenied(
                f"当前处于'{scope.mode.value}'模式，禁止访问系统敏感路径：{original_path}"
            )

    raise PermissionDenied(
        f"当前处于'{scope.mode.value}'模式，禁止访问授权范围外路径：{original_path}"
    )


_PATH_ARG_NAMES = [
    'file_path', 'path', 'directory', 'src', 'dst', 'target',
    'filename', 'filepath', 'dir', 'source', 'destination',
    'input_path', 'output_path', 'folder',
]


def extract_target_path(
    tool_name: str,
    tool_args: dict[str, Any],
    metadata: ToolMetadata,
) -> str | None:
    if not metadata.requires_path_access:
        return None

    if metadata.target_path_arg is not None:
        arg_name = metadata.target_path_arg
        if arg_name in tool_args:
            val = tool_args[arg_name]
            if isinstance(val, str):
                return val
        return None

    for name in _PATH_ARG_NAMES:
        if name in tool_args:
            val = tool_args[name]
            if isinstance(val, str):
                return val

    return None


def test_path_policy() -> None:
    import tempfile

    print("Running path_policy tests...")

    with tempfile.TemporaryDirectory() as tmpdir:
        project_root = os.path.join(tmpdir, 'Project')
        os.makedirs(project_root)

        secret_dir = os.path.join(tmpdir, 'secret')
        os.makedirs(secret_dir)

        project_evil = os.path.join(tmpdir, 'Project_Evil')
        os.makedirs(project_evil)

        subdir = os.path.join(project_root, 'subdir')
        os.makedirs(subdir)

        canon_project = canonicalize_path(project_root)
        canon_secret = canonicalize_path(secret_dir)
        canon_evil = canonicalize_path(project_evil)
        canon_subdir = canonicalize_path(subdir)

        assert is_sub_path(canon_subdir, canon_project) is True, "Subdir should be under project"
        assert is_sub_path(canon_project, canon_project) is True, "Same path should be subpath"
        assert is_sub_path(canon_secret, canon_project) is False, "Secret should NOT be under project"
        assert is_sub_path(canon_evil, canon_project) is False, "Project_Evil should NOT be under Project (startsWith vulnerability)"

        traversal = os.path.join(project_root, '..', 'secret')
        assert is_sub_path(canonicalize_path(traversal), canon_project) is False, "Path traversal with .. should be rejected"

        if sys.platform == 'win32':
            project_lower = canon_project[0].lower() + canon_project[1:]
            assert is_sub_path(project_lower, canon_project) is True, "Windows: case-insensitive comparison should work"
            mixed_sep = canon_project.replace('\\', '/') + '/a/b.txt'
            canon_mixed = canonicalize_path(mixed_sep)
            assert is_sub_path(canon_mixed, canon_project) is True, "Mixed path separators should be handled"

        from tools.capability_sandbox.models import WorkspaceMode
        scope = CapabilityScope(
            mode=WorkspaceMode.project_only,
            workspace_root=canon_project,
            allowed_paths=[canon_project],
            denied_paths=[canon_secret],
        )

        allowed_file = os.path.join(canon_project, 'test.txt')
        with open(allowed_file, 'w') as f:
            f.write('test')
        result = assert_path_allowed(allowed_file, scope)
        assert result == canonicalize_path(allowed_file), "Allowed file should pass"

        try:
            assert_path_allowed(canon_secret, scope)
            assert False, "Secret path should be denied"
        except PermissionDenied:
            pass

        try:
            assert_path_allowed(traversal, scope)
            assert False, "Path traversal should be denied"
        except PermissionDenied:
            pass

        try:
            assert_path_allowed(canon_evil, scope)
            assert False, "Project_Evil should be denied (startsWith)"
        except PermissionDenied:
            pass

        meta_no_path = ToolMetadata(
            name='test_no_path',
            risk_level=ToolRiskLevel.safe,
            requires_path_access=False,
        )
        assert extract_target_path('test', {}, meta_no_path) is None, "Should return None when requires_path_access=False"

        meta_explicit = ToolMetadata(
            name='test_explicit',
            risk_level=ToolRiskLevel.read_project,
            requires_path_access=True,
            target_path_arg='my_custom_path',
        )
        args = {'my_custom_path': allowed_file}
        assert extract_target_path('test', args, meta_explicit) == allowed_file, "Should extract explicit target_path_arg"

        meta_common = ToolMetadata(
            name='test_common',
            risk_level=ToolRiskLevel.read_project,
            requires_path_access=True,
        )
        args = {'file_path': allowed_file}
        assert extract_target_path('test', args, meta_common) == allowed_file, "Should find common arg name 'file_path'"

        args2 = {'path': allowed_file}
        assert extract_target_path('test', args2, meta_common) == allowed_file, "Should find common arg name 'path'"

    print("All path_policy tests passed!")
