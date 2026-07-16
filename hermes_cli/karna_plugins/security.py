from __future__ import annotations

import hashlib
import logging
import os
import re
import stat
import zipfile
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple
import shutil

logger = logging.getLogger(__name__)


class SecuritySeverity(str, Enum):
    INFO = "info"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class SecurityIssue:
    severity: SecuritySeverity
    code: str
    message: str
    file: Optional[str] = None
    line: Optional[int] = None
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "severity": self.severity.value,
            "code": self.code,
            "message": self.message,
            "file": self.file,
            "line": self.line,
            "details": self.details,
        }


@dataclass
class SecurityScanResult:
    issues: List[SecurityIssue] = field(default_factory=list)
    files_scanned: int = 0
    total_size: int = 0
    verdict: str = "pass"

    def add_issue(self, issue: SecurityIssue) -> None:
        self.issues.append(issue)
        if issue.severity in (SecuritySeverity.HIGH, SecuritySeverity.CRITICAL):
            self.verdict = "block"
        elif issue.severity == SecuritySeverity.MEDIUM and self.verdict == "pass":
            self.verdict = "warn"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "issues": [i.to_dict() for i in self.issues],
            "files_scanned": self.files_scanned,
            "total_size": self.total_size,
            "verdict": self.verdict,
        }


MAX_ZIP_SIZE = 1 * 1024 * 1024 * 1024
MAX_ZIP_FILES = 20000
MAX_SINGLE_FILE = 100 * 1024 * 1024
MAX_COMPRESSION_RATIO = 100
DANGEROUS_PERMISSIONS = {
    "filesystem:full",
    "shell:exec",
    "process:spawn",
    "desktop:control",
    "browser:cookies",
    "email:send",
    "calendar:delete",
    "credentials:read",
}
SUSPICIOUS_PATTERNS = [
    (re.compile(r"rm\s+-rf\s+[/~]", re.IGNORECASE), "dangerous_rm", SecuritySeverity.CRITICAL),
    (re.compile(r"format\s+[A-Z]:", re.IGNORECASE), "disk_format", SecuritySeverity.CRITICAL),
    (re.compile(r"del\s+/[fqs]\s+[A-Za-z]:\\", re.IGNORECASE), "dangerous_del", SecuritySeverity.HIGH),
    (re.compile(r"child_process", re.IGNORECASE), "node_child_process", SecuritySeverity.MEDIUM),
    (re.compile(r"subprocess\.(call|Popen|run)", re.IGNORECASE), "python_subprocess", SecuritySeverity.MEDIUM),
    (re.compile(r"os\.system", re.IGNORECASE), "python_system", SecuritySeverity.MEDIUM),
    (re.compile(r"eval\s*\(", re.IGNORECASE), "code_eval", SecuritySeverity.HIGH),
    (re.compile(r"exec\s*\(", re.IGNORECASE), "code_exec", SecuritySeverity.HIGH),
    (re.compile(r"crypto\.createCipher", re.IGNORECASE), "weak_crypto", SecuritySeverity.LOW),
    (re.compile(r"SELECT.*FROM.*WHERE.*=.*['\"]?\+", re.IGNORECASE), "sql_injection", SecuritySeverity.HIGH),
    (re.compile(r"http://(?!localhost|127\.0\.0\.1)", re.IGNORECASE), "http_url", SecuritySeverity.LOW),
]


def validate_path_safety(path: str, base_dir: Path) -> Path:
    if not path or not isinstance(path, str):
        raise ValueError("Invalid path")

    clean_path = path.replace("\\", "/")
    if clean_path.startswith("/"):
        raise ValueError(f"Absolute paths not allowed: {path}")

    if ".." in clean_path.split("/"):
        raise ValueError(f"Path traversal detected: {path}")

    resolved_base = base_dir.resolve()
    target = (resolved_base / clean_path).resolve()

    try:
        target.relative_to(resolved_base)
    except ValueError:
        raise ValueError(f"Path escapes base directory: {path}")

    return target


def compute_sha256(file_path: Path) -> str:
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha256_hash.update(chunk)
    return sha256_hash.hexdigest()


def compute_sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class SecurityScanner:
    def __init__(self):
        self.blocked_extensions: Set[str] = {
            ".exe", ".dll", ".so", ".dylib", ".bat", ".cmd", ".ps1",
            ".vbs", ".js", ".jse", ".wsf", ".wsh", ".msc", ".scr",
            ".com", ".lnk", ".inf", ".reg",
        }
        self.scan_text_extensions: Set[str] = {
            ".py", ".js", ".ts", ".tsx", ".jsx", ".sh", ".bash",
            ".ps1", ".bat", ".cmd", ".json", ".yaml", ".yml",
            ".md", ".txt", ".html", ".css",
        }

    def scan_file(self, file_path: Path, rel_path: str) -> List[SecurityIssue]:
        issues: List[SecurityIssue] = []
        suffix = file_path.suffix.lower()

        if suffix in self.blocked_extensions:
            issues.append(SecurityIssue(
                severity=SecuritySeverity.HIGH,
                code="dangerous_extension",
                message=f"Potentially dangerous file type: {suffix}",
                file=rel_path,
            ))

        if suffix in self.scan_text_extensions and file_path.stat().st_size <= MAX_SINGLE_FILE:
            try:
                content = file_path.read_text(errors="ignore")
                lines = content.split("\n")
                for pattern, code, severity in SUSPICIOUS_PATTERNS:
                    for i, line in enumerate(lines, 1):
                        if pattern.search(line):
                            issues.append(SecurityIssue(
                                severity=severity,
                                code=code,
                                message=f"Suspicious pattern detected: {code}",
                                file=rel_path,
                                line=i,
                            ))
            except Exception as e:
                logger.debug(f"Could not scan {rel_path}: {e}")

        return issues

    def scan_directory(self, directory: Path) -> SecurityScanResult:
        result = SecurityScanResult()

        for root, dirs, files in os.walk(directory):
            for filename in files:
                file_path = Path(root) / filename
                rel_path = str(file_path.relative_to(directory))
                result.files_scanned += 1
                result.total_size += file_path.stat().st_size

                if file_path.is_symlink():
                    link_target = os.readlink(file_path)
                    target_path = (file_path.parent / link_target).resolve()
                    try:
                        target_path.relative_to(directory.resolve())
                    except ValueError:
                        result.add_issue(SecurityIssue(
                            severity=SecuritySeverity.HIGH,
                            code="symlink_escape",
                            message=f"Symlink escapes directory: {rel_path} -> {link_target}",
                            file=rel_path,
                        ))
                    continue

                issues = self.scan_file(file_path, rel_path)
                for issue in issues:
                    result.add_issue(issue)

        return result

    def scan_manifest_permissions(self, permissions: List[str]) -> List[SecurityIssue]:
        issues: List[SecurityIssue] = []
        for perm in permissions:
            if perm in DANGEROUS_PERMISSIONS:
                issues.append(SecurityIssue(
                    severity=SecuritySeverity.MEDIUM,
                    code="dangerous_permission",
                    message=f"Plugin requests dangerous permission: {perm}",
                    details={"permission": perm},
                ))
        return issues


def scan_zip_extract(
    zip_path: Path,
    extract_to: Path,
    max_size: int = MAX_ZIP_SIZE,
    max_files: int = MAX_ZIP_FILES,
    max_single_file: int = MAX_SINGLE_FILE,
    max_ratio: int = MAX_COMPRESSION_RATIO,
) -> Tuple[SecurityScanResult, Path]:
    result = SecurityScanResult()
    extract_to.mkdir(parents=True, exist_ok=True)

    try:
        with zipfile.ZipFile(zip_path, "r") as zf:
            total_uncompressed = 0
            total_compressed = 0

            for info in zf.infolist():
                total_compressed += info.compress_size
                total_uncompressed += info.file_size
                result.files_scanned += 1

                if info.filename.startswith("/") or ".." in info.filename.replace("\\", "/").split("/"):
                    result.add_issue(SecurityIssue(
                        severity=SecuritySeverity.CRITICAL,
                        code="path_traversal",
                        message=f"Zip slip detected: {info.filename}",
                        file=info.filename,
                    ))
                    continue

                if info.file_size > max_single_file:
                    result.add_issue(SecurityIssue(
                        severity=SecuritySeverity.HIGH,
                        code="file_too_large",
                        message=f"File exceeds size limit: {info.file_size} bytes",
                        file=info.filename,
                    ))
                    continue

                if info.external_attr & 0xFFFF & stat.S_IXUSR:
                    if not info.filename.lower().endswith((".sh", ".py", ".js", ".bat", ".cmd")):
                        result.add_issue(SecurityIssue(
                            severity=SecuritySeverity.MEDIUM,
                            code="executable_file",
                            message=f"Executable file in archive",
                            file=info.filename,
                        ))

            if total_uncompressed > max_size:
                result.add_issue(SecurityIssue(
                    severity=SecuritySeverity.CRITICAL,
                    code="zip_bomb_size",
                    message=f"Archive too large: {total_uncompressed} bytes",
                ))

            if result.files_scanned > max_files:
                result.add_issue(SecurityIssue(
                    severity=SecuritySeverity.CRITICAL,
                    code="zip_bomb_files",
                    message=f"Too many files: {result.files_scanned}",
                ))

            if total_compressed > 0:
                ratio = total_uncompressed / total_compressed
                if ratio > max_ratio:
                    result.add_issue(SecurityIssue(
                        severity=SecuritySeverity.CRITICAL,
                        code="zip_bomb_ratio",
                        message=f"Compression ratio too high: {ratio:.1f}:1",
                    ))

            if any(i.severity in (SecuritySeverity.CRITICAL,) for i in result.issues):
                return result, extract_to

            for info in zf.infolist():
                if info.filename.startswith("/") or ".." in info.filename.replace("\\", "/").split("/"):
                    continue

                target_path = validate_path_safety(info.filename, extract_to)
                if info.is_dir():
                    target_path.mkdir(parents=True, exist_ok=True)
                else:
                    target_path.parent.mkdir(parents=True, exist_ok=True)
                    with zf.open(info) as source, open(target_path, "wb") as target:
                        shutil.copyfileobj(source, target)

    except zipfile.BadZipFile:
        result.add_issue(SecurityIssue(
            severity=SecuritySeverity.CRITICAL,
            code="invalid_zip",
            message="File is not a valid ZIP archive",
        ))

    result.total_size = sum(f.stat().st_size for f in extract_to.rglob("*") if f.is_file())

    scanner = SecurityScanner()
    dir_scan = scanner.scan_directory(extract_to)
    for issue in dir_scan.issues:
        result.add_issue(issue)

    return result, extract_to
