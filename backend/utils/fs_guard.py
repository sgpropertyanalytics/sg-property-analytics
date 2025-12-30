"""
Filesystem Guard: Prevents mutations to protected data files.

This module provides guarded file operations that BLOCK writes/deletes
to protected directories (backend/data/, scripts/data/) while allowing
writes to designated output directories (backend/data/generated/, .data/).

Usage:
    from utils.fs_guard import safe_write_text, safe_unlink, safe_open

    # These will CRASH if targeting protected files:
    safe_write_text("backend/data/generated/output.csv", data)  # OK
    safe_write_text("backend/data/projects.csv", data)  # RuntimeError!

    safe_unlink("backend/data/generated/temp.csv")  # OK
    safe_unlink("backend/data/projects.csv")  # RuntimeError!

Why this exists:
    Claude Code accidentally deleted tracked CSV files during a "cleanup"
    operation. This guard makes such deletions IMPOSSIBLE at runtime.
"""

from __future__ import annotations

import logging
import os
import subprocess
from datetime import datetime
from functools import wraps
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger("fs_guard")

# Repository root (adjust if this file moves)
REPO_ROOT = Path(__file__).resolve().parents[2]

# Directories containing IMMUTABLE reference data (tracked in git)
IMMUTABLE_DIRS = [
    REPO_ROOT / "backend" / "data",
    REPO_ROOT / "scripts" / "data",
]

# Exceptions: generated outputs that ARE allowed to be written
ALLOW_WRITE_PREFIXES = [
    REPO_ROOT / "backend" / "data" / "generated",
    REPO_ROOT / ".data",
    Path("/tmp"),
    Path("/var/tmp"),
]

# Audit log location
AUDIT_LOG = REPO_ROOT / "data-validation-logs" / "fs_operations.log"


def _resolve(p: str | Path) -> Path:
    """Resolve path relative to repo root if not absolute."""
    path = Path(p)
    if not path.is_absolute():
        path = REPO_ROOT / path
    return path.resolve()


def _is_under(path: Path, parent: Path) -> bool:
    """Check if path is under parent directory."""
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def _audit_log(op: str, path: Path, allowed: bool, reason: str = "") -> None:
    """Log every file operation attempt to audit log."""
    try:
        AUDIT_LOG.parent.mkdir(parents=True, exist_ok=True)
        ts = datetime.utcnow().isoformat()
        status = "ALLOWED" if allowed else "BLOCKED"
        with open(AUDIT_LOG, "a") as f:
            f.write(f"{ts} | {status} | {op} | {path} | {reason}\n")
    except Exception:
        pass  # Don't fail on audit log errors


def _is_git_tracked(path: Path) -> bool:
    """
    Check if file is tracked by git (extra safety layer).
    Returns True if tracked OR if check fails (fail-safe).
    """
    try:
        result = subprocess.run(
            ["git", "ls-files", "--error-unmatch", str(path)],
            cwd=REPO_ROOT,
            capture_output=True,
            timeout=5
        )
        return result.returncode == 0
    except Exception:
        # If git check fails, assume tracked (fail-safe)
        return True


def assert_mutation_allowed(path: str | Path, op: str) -> Path:
    """
    Central guard: raises RuntimeError if mutation would touch protected data.

    This is the ONLY function that should gate file mutations.
    All other safe_* functions call this.

    Args:
        path: File path (absolute or relative to repo root)
        op: Operation name for error message (e.g., "delete", "write")

    Returns:
        Resolved absolute path if allowed

    Raises:
        RuntimeError: If the operation would mutate protected data
    """
    p = _resolve(path)

    # Check if under immutable directories
    for imm in IMMUTABLE_DIRS:
        if _is_under(p, imm):
            # Check if under allowed prefixes (exceptions)
            for allow in ALLOW_WRITE_PREFIXES:
                if _is_under(p, allow):
                    _audit_log(op, p, True, "under allowed prefix")
                    return p

            # Additional check: is it git-tracked?
            is_tracked = _is_git_tracked(p)

            _audit_log(op, p, False, f"git-tracked={is_tracked}")

            raise RuntimeError(
                f"\n{'='*60}\n"
                f"FS_GUARD VIOLATION: BLOCKED {op.upper()}\n"
                f"{'='*60}\n"
                f"Path: {p}\n"
                f"Reason: This file is in a protected data directory.\n"
                f"\n"
                f"SOLUTION:\n"
                f"  1. Write outputs to: backend/data/generated/\n"
                f"  2. Or write to: .data/\n"
                f"  3. NEVER modify tracked CSV files\n"
                f"\n"
                f"See CLAUDE.md section '## Data File Immutability'\n"
                f"{'='*60}\n"
            )

    _audit_log(op, p, True, "not under immutable dir")
    return p


def safe_unlink(path: str | Path) -> None:
    """
    Safe file deletion - blocked for protected files.

    Args:
        path: File to delete

    Raises:
        RuntimeError: If file is protected
    """
    p = assert_mutation_allowed(path, "delete")
    if p.exists():
        p.unlink()


def safe_write_bytes(path: str | Path, data: bytes) -> None:
    """
    Safe byte write - blocked for protected files.

    Args:
        path: File to write
        data: Bytes to write

    Raises:
        RuntimeError: If file is protected
    """
    p = assert_mutation_allowed(path, "write")
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)


def safe_write_text(path: str | Path, text: str, encoding: str = "utf-8") -> None:
    """
    Safe text write - blocked for protected files.

    Args:
        path: File to write
        text: Text to write
        encoding: Text encoding (default: utf-8)

    Raises:
        RuntimeError: If file is protected
    """
    safe_write_bytes(path, text.encode(encoding))


def safe_open(path: str | Path, mode: str = "r", **kwargs) -> Any:
    """
    Safe file open - blocks write modes for protected files.

    Use this instead of builtin open() for any file operations
    that might write to protected directories.

    Args:
        path: File to open
        mode: Open mode (r, w, a, x, etc.)
        **kwargs: Additional arguments passed to open()

    Returns:
        File handle

    Raises:
        RuntimeError: If write mode requested on protected file
    """
    if any(m in mode for m in ["w", "a", "x", "+"]):
        assert_mutation_allowed(path, f"open(mode={mode})")
    return open(path, mode, **kwargs)


def safe_rename(src: str | Path, dst: str | Path) -> None:
    """
    Safe file rename - blocked if source is protected.

    Args:
        src: Source file path
        dst: Destination file path

    Raises:
        RuntimeError: If source file is protected
    """
    src_p = assert_mutation_allowed(src, "rename_from")
    dst_p = _resolve(dst)

    # Also check destination isn't trying to overwrite protected file
    for imm in IMMUTABLE_DIRS:
        if _is_under(dst_p, imm):
            for allow in ALLOW_WRITE_PREFIXES:
                if _is_under(dst_p, allow):
                    break
            else:
                _audit_log("rename_to", dst_p, False, "destination is protected")
                raise RuntimeError(
                    f"FS_GUARD: Cannot rename to protected location: {dst_p}"
                )

    src_p.rename(dst_p)


def guard_decorator(func: Callable) -> Callable:
    """
    Decorator to wrap functions that write files.

    Usage:
        @guard_decorator
        def my_write_function(path, data):
            with open(path, 'w') as f:
                f.write(data)
    """
    @wraps(func)
    def wrapper(*args, **kwargs):
        # Try to extract path from first arg or 'path' kwarg
        path = kwargs.get('path') or (args[0] if args else None)
        if path:
            assert_mutation_allowed(path, func.__name__)
        return func(*args, **kwargs)
    return wrapper


# For testing: allows temporarily disabling the guard
_GUARD_ENABLED = True


def disable_guard() -> None:
    """Disable the guard (for testing only)."""
    global _GUARD_ENABLED
    _GUARD_ENABLED = False
    logger.warning("FS_GUARD: Guard disabled - testing mode")


def enable_guard() -> None:
    """Re-enable the guard."""
    global _GUARD_ENABLED
    _GUARD_ENABLED = True
    logger.info("FS_GUARD: Guard enabled")
