#!/usr/bin/env python3
"""
Route Contract Checker - Detects when frontend expects endpoints that backend doesn't define.

This script:
1. Extracts all routes from backend Python files
2. Extracts all endpoints from frontend/src/api/endpoints.js
3. Reports any frontend endpoints that have no matching backend route

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
FRONTEND_ENDPOINTS = REPO_ROOT / "frontend" / "src" / "api" / "endpoints.js"


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
    """Extract route paths from backend Python files."""
    paths = set()

    for py_file in BACKEND_DIR.rglob("*.py"):
        try:
            txt = py_file.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue

        # Flask route patterns: @bp.route("/path"), @app.route("/path")
        for match in re.findall(r'@\w+\.route\(\s*["\']([^"\']+)["\']', txt):
            # Normalize: routes are relative to /api in production
            if match.startswith("/"):
                paths.add(match)

        # Also catch Blueprint registrations to map prefixes
        # e.g., app.register_blueprint(auth_bp, url_prefix='/api/auth')

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
