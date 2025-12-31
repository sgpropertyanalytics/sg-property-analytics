#!/usr/bin/env python3
"""
Route Contract Checker - Detects when frontend expects endpoints that backend doesn't define.

This script:
1. Parses blueprint registrations to understand URL prefixes
2. Extracts all routes from backend Python files with their full paths
3. Extracts all endpoints from frontend/src/api/endpoints.js
4. Reports any frontend endpoints that have no matching backend route

Run: python scripts/check_route_contract.py
Exit code: 0 if OK, 1 if drift detected

Use in CI to block merges that break frontend-backend contract.
"""

import re
import sys
from pathlib import Path

# Paths relative to repo root
REPO_ROOT = Path(__file__).parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
APP_FILE = BACKEND_DIR / "app.py"
FRONTEND_ENDPOINTS = REPO_ROOT / "frontend" / "src" / "api" / "endpoints.js"


def load_blueprint_prefixes():
    """Parse app.py to build mapping of blueprint variable names to their URL prefixes."""
    prefixes = {}

    if not APP_FILE.exists():
        print(f"Warning: {APP_FILE} not found")
        return prefixes

    txt = APP_FILE.read_text(encoding="utf-8")

    # Match: app.register_blueprint(auth_bp, url_prefix='/api/auth')
    for match in re.findall(r"register_blueprint\(\s*(\w+)\s*,\s*url_prefix\s*=\s*['\"]([^'\"]+)['\"]", txt):
        bp_name, prefix = match
        # Remove /api prefix since frontend paths are relative to /api
        if prefix.startswith("/api"):
            prefix = prefix[4:]  # Remove '/api'
        prefixes[bp_name] = prefix

    return prefixes


def load_frontend_paths():
    """Extract endpoint paths from frontend/src/api/endpoints.js"""
    if not FRONTEND_ENDPOINTS.exists():
        print(f"Warning: {FRONTEND_ENDPOINTS} not found")
        return set()

    txt = FRONTEND_ENDPOINTS.read_text(encoding="utf-8")
    paths = set()

    # Match string literals like '/metadata', '/auth/subscription'
    # But skip function calls like (name) => `/projects/...`
    for match in re.findall(r":\s*['\"](/[^'\"]+)['\"]", txt):
        # Skip dynamic paths with template literals
        if "${" not in match:
            paths.add(match)

    return paths


def load_backend_paths():
    """Extract route paths from backend Python files with full prefixes."""
    prefixes = load_blueprint_prefixes()
    paths = set()

    for py_file in BACKEND_DIR.rglob("*.py"):
        # Skip test files
        if "test" in py_file.name.lower():
            continue

        try:
            txt = py_file.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        # Find which blueprint this file defines routes for
        # Look for patterns like: @auth_bp.route("/login")
        for bp_match in re.findall(r'@(\w+)\.route\(\s*["\']([^"\']+)["\']', txt):
            bp_name, route_path = bp_match

            if not route_path.startswith("/"):
                route_path = "/" + route_path

            # Get the prefix for this blueprint
            prefix = prefixes.get(bp_name, "")

            # Build full path (relative to /api)
            full_path = prefix + route_path
            if full_path:
                paths.add(full_path)

    return paths


def main():
    print("Checking frontend-backend route contract...\n")

    frontend_paths = load_frontend_paths()
    backend_paths = load_backend_paths()

    print(f"Frontend endpoints: {len(frontend_paths)}")
    print(f"Backend routes: {len(backend_paths)}")
    print()

    # Check each frontend path has a matching backend route
    missing = []
    for fe_path in sorted(frontend_paths):
        # Frontend uses paths like '/metadata', backend defines '/metadata'
        # Both are relative to /api prefix
        if fe_path not in backend_paths:
            missing.append(fe_path)

    if missing:
        print("CONTRACT DRIFT DETECTED!")
        print("=" * 50)
        print("Frontend expects these endpoints, but backend doesn't define them:\n")
        for path in missing:
            print(f"  - {path}")
        print()
        print("Fix options:")
        print("  1. Add the missing backend route")
        print("  2. Remove the endpoint from frontend/src/api/endpoints.js")
        print("  3. If endpoint was renamed, update both files")
        print()
        return 1

    print("OK: All frontend endpoints have matching backend routes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
