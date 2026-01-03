#!/usr/bin/env python3
"""
Check if changed files touch historical landmines.

Historical incidents are documented in REPO_MAP.md. When a file involved
in a past incident is modified, this script warns the developer.

Usage:
    python scripts/check_landmines.py [--files file1.py file2.py]
    python scripts/check_landmines.py  # Uses git diff

Exit codes:
    0 - No landmines touched (or only warnings)
    1 - Error running script
"""

import subprocess
import sys
from pathlib import Path
from typing import List, Set

# =============================================================================
# LANDMINE REGISTRY
# =============================================================================
# Format: (file_pattern, incident_date, description, severity)
# Severity: "critical" = block merge, "warning" = alert but allow

LANDMINES = [
    # CSV Deletion Incident (Dec 30, 2025)
    ("backend/data/*.csv", "Dec 30, 2025",
     "CSV Deletion Incident: Files in backend/data/ are IMMUTABLE. "
     "Do NOT delete or modify. Use backend/data/generated/ for writes.",
     "critical"),
    ("scripts/data/*.csv", "Dec 30, 2025",
     "CSV Deletion Incident: Files in scripts/data/ are IMMUTABLE.",
     "critical"),

    # Layer-Upon-Layer Incident (Dec 25, 2025)
    ("frontend/src/hooks/useQuery.js", "Dec 25, 2025",
     "Layer-Upon-Layer Incident: This is legacy code scheduled for React Query migration. "
     "Do NOT extend. New features must use useAppQuery().",
     "warning"),
    ("frontend/src/hooks/useAbortableQuery.js", "Dec 25, 2025",
     "Layer-Upon-Layer Incident: Legacy hook. Use useAppQuery() instead.",
     "warning"),
    ("frontend/src/hooks/useStaleRequestGuard.js", "Dec 25, 2025",
     "Layer-Upon-Layer Incident: Legacy hook. Use useAppQuery() instead.",
     "warning"),
    ("frontend/src/hooks/useGatedAbortableQuery.js", "Dec 25, 2025",
     "Layer-Upon-Layer Incident: Legacy hook. Use useAppQuery() instead.",
     "warning"),

    # Silent Param Drop Incident (Jan 2, 2026)
    ("backend/utils/normalize.py", "Jan 2, 2026",
     "Silent Param Drop Incident: normalize_params() silently drops unknown params. "
     "Ensure any new params are declared in contract schemas.",
     "warning"),
    ("frontend/src/api/helpers.js", "Jan 2, 2026",
     "Silent Param Drop Incident: buildApiParamsFromState() must match backend schemas.",
     "warning"),

    # Undeclared Response Fields Incident (Jan 3, 2026)
    ("backend/routes/auth.py", "Jan 3, 2026",
     "Undeclared Response Fields Incident: auth/subscription had undeclared _debug_* fields. "
     "All response fields must be declared in contract schemas. Run STRICT mode tests.",
     "warning"),
    ("backend/api/contracts/schemas/*.py", "Jan 3, 2026",
     "Contract schemas must match actual response fields. Run: "
     "CONTRACT_MODE=strict pytest tests/contracts/test_all_endpoints_strict.py",
     "warning"),

    # Subscription Caching Incident (Dec 30, 2025)
    ("frontend/src/context/SubscriptionContext.jsx", "Dec 30, 2025",
     "Subscription Caching Incident: On API failure, keep existing cached subscription. "
     "Never cache 'free' tier on error - it permanently downgrades premium users.",
     "critical"),

    # Endpoint Drift Incident (Dec 31, 2025)
    ("frontend/src/api/client.js", "Dec 31, 2025",
     "Endpoint Drift Incident: Verify frontend-expected endpoints exist in backend. "
     "Run: python scripts/check_route_contract.py",
     "warning"),

    # Boot Deadlock Incident (Jan 1, 2026)
    ("frontend/src/hooks/*AbortableQuery*", "Jan 1, 2026",
     "Boot Deadlock Incident: Abort handling must reset inFlight state. "
     "If using legacy hooks, ensure abort cleanup is correct.",
     "warning"),

    # Projects/hot NameError (Jan 3, 2026)
    ("backend/routes/projects.py", "Jan 3, 2026",
     "Runtime NameError Incident: get_hot_projects() had undefined variable. "
     "Run endpoint smoke tests: pytest tests/contracts/test_endpoint_smoke.py",
     "warning"),
]


def get_changed_files() -> List[str]:
    """Get list of changed files from git."""
    try:
        # Get uncommitted changes
        result = subprocess.run(
            ["git", "diff", "--name-only"],
            capture_output=True, text=True, check=True
        )
        files = set(result.stdout.strip().split('\n'))

        # Get staged changes
        result = subprocess.run(
            ["git", "diff", "--name-only", "--cached"],
            capture_output=True, text=True, check=True
        )
        files.update(result.stdout.strip().split('\n'))

        # Get last commit changes
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD~1"],
            capture_output=True, text=True, check=True
        )
        files.update(result.stdout.strip().split('\n'))

        return [f for f in files if f]  # Remove empty strings

    except subprocess.CalledProcessError:
        return []


def match_pattern(pattern: str, filepath: str) -> bool:
    """Check if filepath matches the landmine pattern."""
    from fnmatch import fnmatch

    # Handle glob patterns
    if '*' in pattern:
        return fnmatch(filepath, pattern)

    # Handle exact match or prefix match
    return filepath == pattern or filepath.startswith(pattern.rstrip('/') + '/')


def check_landmines(files: List[str]) -> dict:
    """
    Check if any files touch landmines.

    Returns dict with 'critical', 'warnings', and 'clean' lists.
    """
    result = {
        'critical': [],
        'warnings': [],
        'clean': [],
    }

    for filepath in files:
        matched = False
        for pattern, date, description, severity in LANDMINES:
            if match_pattern(pattern, filepath):
                matched = True
                entry = {
                    'file': filepath,
                    'pattern': pattern,
                    'date': date,
                    'description': description,
                }
                if severity == 'critical':
                    result['critical'].append(entry)
                else:
                    result['warnings'].append(entry)
                break  # One match per file is enough

        if not matched:
            result['clean'].append(filepath)

    return result


def print_report(result: dict) -> None:
    """Print landmine check report."""
    print("\n" + "=" * 70)
    print("LANDMINE CHECK - Historical Incident Alert")
    print("=" * 70 + "\n")

    if result['critical']:
        print("🚨 CRITICAL LANDMINES TOUCHED:")
        print("-" * 50)
        for entry in result['critical']:
            print(f"\n  File: {entry['file']}")
            print(f"  Incident: {entry['date']}")
            print(f"  ⚠️  {entry['description']}")
        print()

    if result['warnings']:
        print("⚠️  WARNING LANDMINES TOUCHED:")
        print("-" * 50)
        for entry in result['warnings']:
            print(f"\n  File: {entry['file']}")
            print(f"  Incident: {entry['date']}")
            print(f"  📝 {entry['description']}")
        print()

    if not result['critical'] and not result['warnings']:
        print("✅ No historical landmines touched.")
        print(f"   {len(result['clean'])} files checked.")
    else:
        print("-" * 50)
        print(f"Summary: {len(result['critical'])} critical, "
              f"{len(result['warnings'])} warnings, "
              f"{len(result['clean'])} clean")

    print("\n" + "=" * 70 + "\n")


def main():
    """Main entry point."""
    import argparse

    parser = argparse.ArgumentParser(description="Check for historical landmines")
    parser.add_argument("--files", nargs="*", help="Files to check (default: git diff)")
    parser.add_argument("--ci", action="store_true", help="Exit 1 if critical landmines found")
    args = parser.parse_args()

    if args.files:
        files = args.files
    else:
        files = get_changed_files()

    if not files:
        print("No changed files to check.")
        return 0

    result = check_landmines(files)
    print_report(result)

    if args.ci and result['critical']:
        print("❌ CRITICAL LANDMINES FOUND - Review required before merge\n")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
