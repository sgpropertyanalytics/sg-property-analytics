"""
Test that all public-facing routes have @api_contract decorator.

This prevents new endpoints from being added without contract validation.
When a new route is added, this test will fail until either:
1. The route gets an @api_contract decorator, OR
2. The route is explicitly added to EXEMPT_ROUTES with a reason

Run: pytest tests/contracts/test_route_coverage.py -v
"""

import re
import os
from pathlib import Path

import pytest


# Routes that are intentionally exempt from contract validation
# Format: (route_path, reason)
EXEMPT_ROUTES = [
    # Admin/Debug endpoints - internal only, not part of public API
    ("/ping", "Health check - no payload"),
    ("/health", "Health check - no payload"),
    ("/debug/data-status", "Admin debug endpoint"),
    ("/dashboard/cache", "Admin cache management"),
    ("/metadata", "Internal metadata endpoint"),
    ("/admin/update-metadata", "Admin operation"),
    ("/admin/filter-outliers", "Admin operation"),

    # Deprecated endpoints - scheduled for removal
    ("/transactions", "Deprecated - use /api/aggregate"),
    ("/transactions/list", "Deprecated - returns 410"),
    ("/comparable_value_analysis", "Deprecated - returns 410"),
    ("/scatter-sample", "Deprecated - returns 410"),
    ("/districts", "Deprecated - use /api/filter-options"),
    ("/kpi-summary", "Legacy - use /api/kpi-summary-v2"),

    # Payment webhooks - Stripe-specific, different validation
    ("/create-checkout", "Stripe Checkout - validated by Stripe SDK"),
    ("/webhook", "Stripe webhook - validated by Stripe signature"),
    ("/portal", "Stripe portal - validated by Stripe SDK"),

    # Admin operations - require special auth, not public API
    ("/reset", "Admin reset operation"),
    ("/scrape", "Admin scrape operation"),
    ("/cron-refresh", "Cron job endpoint"),
    ("/refresh-status", "Admin status check"),
    ("/trigger-refresh", "Admin trigger"),
    ("/projects/compute-school-flags", "Admin computation"),
]

EXEMPT_ROUTE_PATHS = {route for route, reason in EXEMPT_ROUTES}


def find_all_routes():
    """
    Find all routes defined in backend/routes/ directory.

    Returns list of dicts with file, line, route_path, has_contract.
    """
    routes = []
    routes_dir = Path(__file__).parent.parent.parent / "routes"

    for py_file in routes_dir.rglob("*.py"):
        if "__pycache__" in str(py_file):
            continue

        with open(py_file) as f:
            lines = f.readlines()

        for i, line in enumerate(lines):
            # Match @xxx_bp.route or @app.route
            if re.search(r'@\w+_bp\.route|@app\.route', line):
                # Extract route path
                route_match = re.search(r'"([^"]+)"', line)
                route_path = route_match.group(1) if route_match else "unknown"

                # Check if next few lines have @api_contract
                has_contract = False
                for j in range(i + 1, min(len(lines), i + 3)):
                    if '@api_contract' in lines[j]:
                        has_contract = True
                        break
                    if lines[j].strip().startswith('def '):
                        break

                routes.append({
                    "file": str(py_file.relative_to(routes_dir.parent)),
                    "line": i + 1,
                    "route": route_path,
                    "has_contract": has_contract,
                })

    return routes


class TestRouteCoverage:
    """Verify all public routes have contract validation."""

    def test_all_routes_have_contracts_or_exemption(self):
        """
        Every route must either:
        1. Have @api_contract decorator, OR
        2. Be listed in EXEMPT_ROUTES with a reason

        This prevents new endpoints from bypassing contract validation.
        """
        routes = find_all_routes()
        violations = []

        for route in routes:
            if not route["has_contract"]:
                # Check if exempt
                if route["route"] not in EXEMPT_ROUTE_PATHS:
                    violations.append(
                        f"{route['file']}:{route['line']} - {route['route']}"
                    )

        if violations:
            msg = (
                f"\n{len(violations)} route(s) missing @api_contract decorator:\n\n"
                + "\n".join(f"  {v}" for v in violations)
                + "\n\nTo fix:\n"
                + "1. Add @api_contract('endpoint-name') decorator, OR\n"
                + "2. Add route to EXEMPT_ROUTES in this test file with reason"
            )
            pytest.fail(msg)

    def test_exempt_routes_still_exist(self):
        """
        Verify exempt routes still exist in codebase.

        If a deprecated route is removed, it should be removed from EXEMPT_ROUTES.
        This keeps the exemption list clean.
        """
        routes = find_all_routes()
        route_paths = {r["route"] for r in routes}

        stale_exemptions = []
        for route_path, reason in EXEMPT_ROUTES:
            if route_path not in route_paths:
                stale_exemptions.append(f"{route_path} - {reason}")

        if stale_exemptions:
            msg = (
                f"\n{len(stale_exemptions)} exempt route(s) no longer exist:\n\n"
                + "\n".join(f"  {e}" for e in stale_exemptions)
                + "\n\nRemove these from EXEMPT_ROUTES in test_route_coverage.py"
            )
            pytest.fail(msg)

    def test_coverage_summary(self):
        """Print coverage summary."""
        routes = find_all_routes()

        contracted = sum(1 for r in routes if r["has_contract"])
        exempt = sum(1 for r in routes if r["route"] in EXEMPT_ROUTE_PATHS)
        uncovered = len(routes) - contracted - exempt

        print(f"\n{'='*60}")
        print("ROUTE CONTRACT COVERAGE")
        print(f"{'='*60}")
        print(f"Total routes:        {len(routes)}")
        print(f"With @api_contract:  {contracted}")
        print(f"Exempt (documented): {exempt}")
        print(f"Uncovered:           {uncovered}")
        print(f"Coverage:            {(contracted + exempt) / len(routes) * 100:.1f}%")
        print(f"{'='*60}\n")

        # This test always passes - it's informational
        assert True


class TestExemptRouteDocumentation:
    """Verify exempt routes have proper documentation."""

    def test_all_exemptions_have_reasons(self):
        """Every exempt route must have a documented reason."""
        for route_path, reason in EXEMPT_ROUTES:
            assert reason, f"Route {route_path} has empty exemption reason"
            assert len(reason) > 5, f"Route {route_path} has too short reason: {reason}"

    def test_no_duplicate_exemptions(self):
        """Each route should only be exempt once."""
        seen = set()
        duplicates = []

        for route_path, _ in EXEMPT_ROUTES:
            if route_path in seen:
                duplicates.append(route_path)
            seen.add(route_path)

        assert not duplicates, f"Duplicate exemptions: {duplicates}"
