"""File protection module - snapshot and trash for safe file operations.

Provides versioning snapshots before overwrites and trash-based deletion
instead of permanent removal for project files.
"""

from __future__ import annotations

import os
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple

from tools.capability_sandbox.models import CapabilityScope, WorkspaceMode
from tools.capability_sandbox.path_policy import canonicalize_path, is_sub_path


KARNA_DIR = ".karna"
TRASH_DIR = "trash"
VERSIONS_DIR = "versions"


def get_protection_dirs(workspace_root: str) -> Tuple[str, str]:
    """Return (trash_dir, versions_dir) paths, creating them if needed.

    Args:
        workspace_root: Absolute path to the workspace root.

    Returns:
        Tuple of (trash_dir, versions_dir) absolute paths.
    """
    karna_root = os.path.join(workspace_root, KARNA_DIR)
    trash_dir = os.path.join(karna_root, TRASH_DIR)
    versions_dir = os.path.join(karna_root, VERSIONS_DIR)

    os.makedirs(trash_dir, exist_ok=True)
    os.makedirs(versions_dir, exist_ok=True)

    return canonicalize_path(trash_dir), canonicalize_path(versions_dir)


def should_protect(file_path: str, workspace_root: str) -> bool:
    """Determine if a file should be protected (snapshot/trash).

    Only protects files within the workspace root. Files outside
    (e.g., system files in computer_authorized mode) are skipped.

    Args:
        file_path: Absolute path to the file.
        workspace_root: Absolute path to the workspace root.

    Returns:
        True if the file should be protected.
    """
    if not workspace_root:
        return False

    try:
        canon_file = canonicalize_path(file_path)
        canon_root = canonicalize_path(workspace_root)
        return is_sub_path(canon_file, canon_root)
    except Exception:
        return False


def create_snapshot(file_path: str, workspace_root: str) -> Optional[str]:
    """Create a snapshot of a file before overwriting.

    Copies the file to .karna/versions/ with a timestamp suffix.

    Args:
        file_path: Absolute path to the file to snapshot.
        workspace_root: Absolute path to the workspace root.

    Returns:
        Path to the snapshot file, or None if snapshot failed/skipped.
    """
    try:
        canon_file = canonicalize_path(file_path)

        if not os.path.isfile(canon_file):
            return None

        if not should_protect(canon_file, workspace_root):
            return None

        _, versions_dir = get_protection_dirs(workspace_root)

        original_name = os.path.basename(canon_file)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        snapshot_name = f"{original_name}.{timestamp}.bak"
        snapshot_path = os.path.join(versions_dir, snapshot_name)

        shutil.copy2(canon_file, snapshot_path)
        return canonicalize_path(snapshot_path)
    except Exception:
        return None


def move_to_trash(file_path: str, workspace_root: str) -> Optional[str]:
    """Move a file to trash instead of permanent deletion.

    Preserves relative directory structure within trash.
    Handles name collisions by appending timestamp.

    Args:
        file_path: Absolute path to the file to delete.
        workspace_root: Absolute path to the workspace root.

    Returns:
        Path to the file in trash, or None if move failed/skipped.
    """
    try:
        canon_file = canonicalize_path(file_path)

        if not os.path.exists(canon_file):
            return None

        if not should_protect(canon_file, workspace_root):
            return None

        trash_dir, _ = get_protection_dirs(workspace_root)
        canon_root = canonicalize_path(workspace_root)

        try:
            rel_path = os.path.relpath(canon_file, canon_root)
        except ValueError:
            rel_path = os.path.basename(canon_file)

        trash_target = os.path.join(trash_dir, rel_path)
        trash_target_dir = os.path.dirname(trash_target)
        os.makedirs(trash_target_dir, exist_ok=True)

        if os.path.exists(trash_target):
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            base, ext = os.path.splitext(trash_target)
            trash_target = f"{base}.{timestamp}{ext}"

        shutil.move(canon_file, trash_target)
        return canonicalize_path(trash_target)
    except Exception:
        return None


def protect_file_operation(
    tool_name: str,
    tool_args: dict,
    scope: CapabilityScope,
) -> dict:
    """Apply file protection before tool execution.

    For write_file/patch: creates snapshot if target exists.
    For delete_file: moves file to trash (original delete will silently
    succeed since file no longer exists, as ShellFileOperations catches
    FileNotFoundError).

    This function should be called AFTER permission checks pass but
    BEFORE the actual tool executes.

    Args:
        tool_name: Name of the tool being executed.
        tool_args: Arguments passed to the tool (may be modified in place).
        scope: Current capability scope containing workspace_root.

    Returns:
        Dict with protection info:
            - snapshot_path: Path to created snapshot (or None)
            - trash_path: Path to file in trash (or None)
    """
    result = {
        "snapshot_path": None,
        "trash_path": None,
    }

    workspace_root = getattr(scope, "workspace_root", None)
    if not workspace_root:
        return result

    if scope.mode == WorkspaceMode.computer_authorized:
        return result

    path_arg_names = ["path", "file_path"]
    target_path = None
    for arg_name in path_arg_names:
        if arg_name in tool_args and isinstance(tool_args[arg_name], str):
            target_path = tool_args[arg_name]
            break

    if not target_path:
        return result

    try:
        target_path = canonicalize_path(target_path)
    except Exception:
        return result

    if tool_name in ("write_file", "patch"):
        if os.path.isfile(target_path):
            result["snapshot_path"] = create_snapshot(target_path, workspace_root)

    elif tool_name == "delete_file":
        if os.path.isfile(target_path):
            result["trash_path"] = move_to_trash(target_path, workspace_root)

    return result


def test_file_protection() -> None:
    """Test the file protection module."""
    import tempfile
    import time

    print("Running file_protection tests...")

    with tempfile.TemporaryDirectory() as tmpdir:
        workspace = os.path.join(tmpdir, "workspace")
        os.makedirs(workspace)

        trash_dir, versions_dir = get_protection_dirs(workspace)
        assert os.path.isdir(trash_dir), "trash dir should exist"
        assert os.path.isdir(versions_dir), "versions dir should exist"
        assert trash_dir.endswith(os.path.join(".karna", "trash")), f"trash dir wrong: {trash_dir}"
        assert versions_dir.endswith(os.path.join(".karna", "versions")), f"versions dir wrong: {versions_dir}"

        test_file = os.path.join(workspace, "test.txt")
        with open(test_file, "w") as f:
            f.write("original content")

        assert should_protect(test_file, workspace) is True
        outside_file = os.path.join(tmpdir, "outside.txt")
        with open(outside_file, "w") as f:
            f.write("outside")
        assert should_protect(outside_file, workspace) is False

        snapshot_path = create_snapshot(test_file, workspace)
        assert snapshot_path is not None, "snapshot should be created"
        assert os.path.isfile(snapshot_path), "snapshot file should exist"
        assert ".bak" in snapshot_path, "snapshot should have .bak suffix"
        with open(snapshot_path, "r") as f:
            assert f.read() == "original content", "snapshot content should match"

        with open(test_file, "w") as f:
            f.write("new content")
        snapshot_path2 = create_snapshot(test_file, workspace)
        assert snapshot_path2 is not None
        assert snapshot_path2 != snapshot_path, "second snapshot should have different name"

        subdir = os.path.join(workspace, "subdir")
        os.makedirs(subdir)
        sub_file = os.path.join(subdir, "nested.txt")
        with open(sub_file, "w") as f:
            f.write("nested content")

        from tools.capability_sandbox.models import WorkspaceMode
        scope = CapabilityScope(
            mode=WorkspaceMode.project_only,
            workspace_root=workspace,
            allowed_paths=[workspace],
        )

        trash_result = move_to_trash(sub_file, workspace)
        assert trash_result is not None, "trash move should succeed"
        assert not os.path.exists(sub_file), "original file should be gone"
        assert os.path.isfile(trash_result), "file should be in trash"
        assert "subdir" in trash_result, "trash should preserve directory structure"

        with open(test_file, "w") as f:
            f.write("first")
        time.sleep(0.01)
        trash1 = move_to_trash(test_file, workspace)
        assert trash1 is not None

        with open(test_file, "w") as f:
            f.write("second")
        time.sleep(0.01)
        trash2 = move_to_trash(test_file, workspace)
        assert trash2 is not None
        assert trash1 != trash2, "duplicate names should get timestamp suffix"

        write_args = {"path": test_file, "content": "test"}
        with open(test_file, "w") as f:
            f.write("existing")
        protect_result = protect_file_operation("write_file", write_args, scope)
        assert protect_result["snapshot_path"] is not None, "write_file should create snapshot"

        delete_args = {"file_path": test_file}
        with open(test_file, "w") as f:
            f.write("to delete")
        protect_result2 = protect_file_operation("delete_file", delete_args, scope)
        assert protect_result2["trash_path"] is not None, "delete_file in project should move to trash"
        assert not os.path.exists(test_file), "file should be moved to trash"

        scope_computer = CapabilityScope(
            mode=WorkspaceMode.computer_authorized,
            workspace_root=workspace,
        )
        with open(test_file, "w") as f:
            f.write("test")
        protect_result3 = protect_file_operation("write_file", write_args, scope_computer)
        assert protect_result3["snapshot_path"] is None, "computer_authorized should skip snapshot"

    print("All file_protection tests passed!")
