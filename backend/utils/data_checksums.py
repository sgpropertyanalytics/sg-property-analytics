"""
Data Checksums: Maintains SHA256 checksums of canonical data files.

This module provides integrity verification for critical CSV files.
Run verify_all() at startup to detect any tampering or data loss.

Usage:
    # Verify all checksums (returns list of violations)
    from utils.data_checksums import verify_all
    violations = verify_all()
    if violations:
        for v in violations:
            print(f"VIOLATION: {v}")

    # Update checksums after intentional data updates
    from utils.data_checksums import save_checksums
    save_checksums()  # Run this after uploading new data

Files monitored:
    - backend/data/new_launch_units.csv
    - backend/data/new_launch_units_updated.csv
    - backend/data/upcoming_launches.csv

Why this exists:
    Detects silent data corruption or tampering that might otherwise
    go unnoticed until analytics produce wrong results.
"""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("data_checksums")

# Repository root
REPO_ROOT = Path(__file__).resolve().parents[2]

# Checksum registry file (tracked in git)
CHECKSUM_FILE = REPO_ROOT / "backend" / "data" / ".checksums.json"

# Files that MUST have stable checksums
# Add new critical data files here
CANONICAL_FILES = [
    "backend/data/new_launch_units.csv",
    "backend/data/new_launch_units_updated.csv",
    "backend/data/upcoming_launches.csv",
]

# Thresholds for detecting suspicious changes
MIN_SIZE_RATIO = 0.80  # Alert if file shrinks by >20%
MIN_LINE_RATIO = 0.80  # Alert if lines drop by >20%


def compute_checksum(path: Path) -> str:
    """
    Compute SHA256 checksum of file.

    Args:
        path: Path to file

    Returns:
        Hex-encoded SHA256 hash
    """
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            h.update(chunk)
    return h.hexdigest()


def count_lines(path: Path) -> int:
    """Count lines in file."""
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        return sum(1 for _ in f)


def save_checksums() -> dict[str, Any]:
    """
    Save current checksums for all canonical files.

    Run this after intentional data updates (e.g., weekly CSV refresh).

    Returns:
        Dict of saved checksums
    """
    checksums = {}

    for rel_path in CANONICAL_FILES:
        p = REPO_ROOT / rel_path
        if p.exists():
            checksums[rel_path] = {
                "sha256": compute_checksum(p),
                "size": p.stat().st_size,
                "lines": count_lines(p),
            }
            logger.info(f"Checksum saved: {rel_path}")
        else:
            logger.warning(f"File not found, skipping: {rel_path}")

    # Write checksum file
    CHECKSUM_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(CHECKSUM_FILE, "w") as f:
        json.dump(checksums, f, indent=2)

    print(f"Saved checksums for {len(checksums)} files to {CHECKSUM_FILE}")
    return checksums


def verify_all() -> list[str]:
    """
    Verify all canonical files match saved checksums.

    Returns:
        List of violation messages (empty = all good)
    """
    if not CHECKSUM_FILE.exists():
        return ["CHECKSUM_FILE_MISSING: Run 'python -c \"from utils.data_checksums import save_checksums; save_checksums()\"'"]

    try:
        with open(CHECKSUM_FILE) as f:
            saved = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        return [f"CHECKSUM_FILE_CORRUPT: {e}"]

    violations = []

    for rel_path, expected in saved.items():
        p = REPO_ROOT / rel_path

        # Check file exists
        if not p.exists():
            violations.append(f"MISSING: {rel_path}")
            continue

        # Check checksum matches
        actual_checksum = compute_checksum(p)
        if actual_checksum != expected["sha256"]:
            violations.append(
                f"TAMPERED: {rel_path} "
                f"(expected {expected['sha256'][:12]}..., got {actual_checksum[:12]}...)"
            )

        # Check file hasn't shrunk significantly
        actual_size = p.stat().st_size
        expected_size = expected.get("size", 0)
        if expected_size > 0 and actual_size < expected_size * MIN_SIZE_RATIO:
            violations.append(
                f"SHRUNK: {rel_path} size dropped "
                f"({expected_size:,} -> {actual_size:,} bytes, "
                f"{actual_size/expected_size:.0%} of original)"
            )

        # Check line count hasn't dropped significantly
        actual_lines = count_lines(p)
        expected_lines = expected.get("lines", 0)
        if expected_lines > 0 and actual_lines < expected_lines * MIN_LINE_RATIO:
            violations.append(
                f"ROWS_LOST: {rel_path} row count dropped "
                f"({expected_lines:,} -> {actual_lines:,} lines, "
                f"{actual_lines/expected_lines:.0%} of original)"
            )

    # Check for files in registry that aren't in CANONICAL_FILES anymore
    # (indicates potential misconfiguration)
    for rel_path in saved:
        if rel_path not in CANONICAL_FILES:
            violations.append(f"ORPHAN_CHECKSUM: {rel_path} in registry but not in CANONICAL_FILES")

    return violations


def startup_check() -> None:
    """
    Run verification at Flask app startup.

    Logs violations as warnings but does NOT block startup.
    This is intentional - we want the app to start even if
    data is corrupted, so we can investigate.
    """
    violations = verify_all()

    if not violations:
        logger.info("Data checksum verification: PASSED")
        return

    logger.critical("=" * 60)
    logger.critical("DATA INTEGRITY VIOLATIONS DETECTED")
    logger.critical("=" * 60)

    for v in violations:
        logger.critical(f"  - {v}")

    logger.critical("")
    logger.critical("ACTIONS:")
    logger.critical("  1. Check git status for unexpected changes")
    logger.critical("  2. Restore from git: git checkout -- backend/data/")
    logger.critical("  3. If intentional, update checksums:")
    logger.critical("     python -c \"from utils.data_checksums import save_checksums; save_checksums()\"")
    logger.critical("=" * 60)


def get_status() -> dict[str, Any]:
    """
    Get current status of all monitored files.

    Returns:
        Dict with file statuses and any violations
    """
    status = {
        "checksum_file_exists": CHECKSUM_FILE.exists(),
        "files": {},
        "violations": verify_all(),
    }

    for rel_path in CANONICAL_FILES:
        p = REPO_ROOT / rel_path
        if p.exists():
            status["files"][rel_path] = {
                "exists": True,
                "size": p.stat().st_size,
                "lines": count_lines(p),
                "checksum": compute_checksum(p)[:12] + "...",
            }
        else:
            status["files"][rel_path] = {"exists": False}

    return status


if __name__ == "__main__":
    # CLI: save or verify checksums
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "save":
        save_checksums()
    elif len(sys.argv) > 1 and sys.argv[1] == "status":
        import pprint
        pprint.pprint(get_status())
    else:
        violations = verify_all()
        if violations:
            print("VIOLATIONS:")
            for v in violations:
                print(f"  - {v}")
            sys.exit(1)
        else:
            print("All checksums valid")
            sys.exit(0)
