#!/usr/bin/env python3
"""
CI Guard: Enforce canonical engine factory usage.

This script fails the build if create_engine() is used outside the canonical
engine factory (backend/db/engine.py).

Policy:
    - All non-Flask database engine creation MUST go through db.engine.get_engine()
    - Only backend/db/engine.py is allowed to call create_engine()
    - This prevents the "forgot to copy connection options" bug class

Usage:
    python scripts/guard_no_create_engine.py

Exit codes:
    0: All usages are in allowed files
    1: Unauthorized create_engine() usage found

Add to CI:
    - name: Check engine factory policy
      run: python scripts/guard_no_create_engine.py
"""

import re
import sys
from pathlib import Path

# Project root
PROJECT_ROOT = Path(__file__).parent.parent

# Files that are ALLOWED to use create_engine()
ALLOWED_FILES = {
    # The canonical engine factory
    "backend/db/engine.py",
    # Test files (mocking is fine)
    "backend/tests/test_ura_sync_engine.py",
    # This guard script itself (references in docstrings)
    "scripts/guard_no_create_engine.py",
}

# Patterns to ignore (comments, strings, imports that don't call it)
IGNORE_PATTERNS = [
    r"^\s*#",           # Comments
    r"^\s*from\s+",     # Import statements (from sqlalchemy import create_engine)
    r"^\s*import\s+",   # Import statements
    r'["\'].*create_engine.*["\']',  # Strings containing create_engine
]


def find_violations() -> list[tuple[str, int, str]]:
    """
    Find unauthorized create_engine() usages.

    Returns:
        List of (file_path, line_number, line_content) tuples
    """
    violations = []

    # Search Python files
    for py_file in PROJECT_ROOT.rglob("*.py"):
        # Skip non-source directories
        rel_path = str(py_file.relative_to(PROJECT_ROOT))
        if any(skip in rel_path for skip in [
            "__pycache__",
            ".venv",
            "venv",
            "site-packages",
            "node_modules",
            ".git",
            "migrations",        # Alembic migrations may reference create_engine
            "alembic",           # Alembic config
            ".tox",              # Tox test environments
            ".pytest_cache",
        ]):
            continue

        # Check if file is allowed
        if rel_path in ALLOWED_FILES:
            continue

        # Search for create_engine() calls
        try:
            content = py_file.read_text()
        except Exception:
            continue

        for line_num, line in enumerate(content.split("\n"), 1):
            # Look for create_engine( pattern (actual function call)
            if "create_engine(" not in line:
                continue

            # Skip if matches ignore patterns
            skip = False
            for pattern in IGNORE_PATTERNS:
                if re.search(pattern, line):
                    skip = True
                    break

            if skip:
                continue

            # This is a violation
            violations.append((rel_path, line_num, line.strip()))

    return violations


def main() -> int:
    """Main entry point."""
    print("=" * 60)
    print("CI Guard: Checking engine factory policy")
    print("=" * 60)
    print(f"\nAllowed files: {', '.join(sorted(ALLOWED_FILES))}")
    print()

    violations = find_violations()

    if not violations:
        print("✓ No unauthorized create_engine() usage found")
        print("\nPolicy enforced: All engine creation goes through db.engine.get_engine()")
        return 0

    print(f"✗ Found {len(violations)} unauthorized create_engine() usage(s):\n")

    for file_path, line_num, line_content in violations:
        print(f"  {file_path}:{line_num}")
        print(f"    {line_content[:80]}{'...' if len(line_content) > 80 else ''}")
        print()

    print("-" * 60)
    print("FIX: Replace create_engine() with db.engine.get_engine()")
    print()
    print("  from db.engine import get_engine")
    print("  engine = get_engine('job')  # For cron/scripts")
    print("  engine = get_engine('web')  # For long-running processes")
    print("-" * 60)

    return 1


if __name__ == "__main__":
    sys.exit(main())
