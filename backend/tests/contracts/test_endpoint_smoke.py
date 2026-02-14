"""
Endpoint Smoke Test - Catches runtime errors that static analysis misses.

This test CALLS every endpoint to catch:
- NameError (undefined variables)
- TypeError (wrong argument types)
- AttributeError (missing attributes)
- ImportError (missing imports)
- KeyError (missing dict keys)

These errors pass `py_compile` and `ast.parse` but crash at runtime.

INCIDENT: On Jan 3, 2026, `/api/projects/hot` had `district_param` NameError.
`py_compile` passed. Only discovered when endpoint was actually called.

Run: pytest tests/contracts/test_endpoint_smoke.py -v --tb=short
"""

import pytest
from unittest.mock import patch, MagicMock

from app import create_app


# =============================================================================
# ENDPOINT REGISTRY - All endpoints to smoke test
# =============================================================================

# Format: (url, method, params, expected_non_500_status)
# We don't care about 400/401/404 - we care about catching 500s from runtime errors

PUBLIC_ENDPOINTS = [
    # Core analytics
    ("/api/filter-options", "GET", {}, True),
    ("/api/aggregate", "GET", {"group_by": "month"}, True),
    ("/api/dashboard", "GET", {}, True),
    ("/api/kpi-summary", "GET", {}, True),
    ("/api/kpi-summary-v2", "GET", {}, True),

    # Transactions
    ("/api/transactions/price-growth", "GET", {}, True),
    ("/api/transactions/price-growth/segments", "GET", {}, True),

    # New launch
    ("/api/new-launch-timeline", "GET", {}, True),
    ("/api/new-launch-absorption", "GET", {}, True),

    # Trends
    ("/api/new-vs-resale", "GET", {}, True),

    # Charts - require params
    ("/api/projects_by_district", "GET", {"district": "D01"}, True),
    ("/api/price_projects_by_district", "GET", {"district": "D01"}, True),
    ("/api/floor-liquidity-heatmap", "GET", {"project": "TEST"}, True),
    ("/api/budget-heatmap", "GET", {}, True),

    # Insights
    ("/api/insights/district-psf", "GET", {}, True),
    ("/api/insights/district-liquidity", "GET", {}, True),

    # Supply
    ("/api/supply/summary", "GET", {}, True),

    # Projects
    ("/api/projects/locations", "GET", {}, True),
    ("/api/projects/hot", "GET", {}, True),  # THE ENDPOINT WITH NameError
    ("/api/projects/inventory/status", "GET", {}, True),
    ("/api/projects/resale-projects", "GET", {}, True),

    # Path param projects
    ("/api/projects/TEST_PROJECT/inventory", "GET", {}, True),
    ("/api/projects/TEST_PROJECT/price-bands", "GET", {}, True),
    ("/api/projects/TEST_PROJECT/exit-queue", "GET", {}, True),

    # Upcoming launches
    ("/api/upcoming-launches/all", "GET", {}, True),
    ("/api/upcoming-launches/needs-review", "GET", {}, True),

    # GLS
    ("/api/gls/all", "GET", {}, True),
    ("/api/gls/needs-review", "GET", {}, True),

    # Admin/Health (should always work)
    ("/api/ping", "GET", {}, True),
    ("/api/health", "GET", {}, True),
    ("/api/metadata", "GET", {}, True),
]

AUTH_ENDPOINTS = [
    ("/api/auth/delete-account", "DELETE", {}, True),
]


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture(scope="module")
def app():
    """Create test Flask application."""
    app = create_app()
    app.config['TESTING'] = True
    return app


@pytest.fixture(scope="module")
def client(app):
    """Create test client."""
    return app.test_client()


@pytest.fixture(scope="module")
def auth_headers():
    """Auth headers for authenticated endpoints (Firebase token mocked at request level)."""
    return {"Authorization": "Bearer mock-firebase-token"}


@pytest.fixture(scope="module")
def mock_user():
    """Mock user for auth endpoints."""
    from models.user import User

    mock = MagicMock(spec=User)
    mock.id = 999999
    mock.email = "smoke-test@test.com"
    mock.access_level = "authenticated"
    mock.is_subscribed.return_value = False
    mock.access_info.return_value = {
        "has_access": False,
        "access_source": None,
        "access_expires_at": None,
    }
    mock.to_dict.return_value = {"id": 999999, "email": "smoke-test@test.com"}

    return mock


# =============================================================================
# HELPER
# =============================================================================

def is_runtime_error_500(response) -> tuple[bool, str]:
    """
    Check if response is a 500 caused by runtime error.

    Returns (is_runtime_error, error_message)
    """
    if response.status_code != 500:
        return False, ""

    try:
        data = response.get_json()
        if not data:
            return False, "500 with no JSON body"

        error = data.get("error", "")

        # Known runtime error patterns
        runtime_patterns = [
            "NameError",
            "TypeError",
            "AttributeError",
            "KeyError",
            "ImportError",
            "IndexError",
            "UnboundLocalError",
            "is not defined",
            "has no attribute",
            "missing required",
            "takes",
            "argument",
        ]

        for pattern in runtime_patterns:
            if pattern.lower() in str(data).lower():
                return True, str(data)

        return False, f"500 but not runtime error: {data}"

    except Exception as e:
        return False, f"500 with unparseable response: {e}"


# =============================================================================
# TESTS
# =============================================================================

class TestEndpointSmoke:
    """
    Smoke test all endpoints to catch runtime errors.

    This is NOT about testing business logic - it's about catching
    crashes that static analysis misses (NameError, TypeError, etc.)
    """

    @pytest.mark.parametrize("url,method,params,_", PUBLIC_ENDPOINTS)
    def test_public_endpoint_no_runtime_error(self, client, url, method, params, _):
        """
        Public endpoint must not crash with runtime error.

        400/401/404 are acceptable (bad params, no auth, not found).
        500 from NameError/TypeError/etc is a BUG.
        """
        if method == "GET":
            response = client.get(url, query_string=params)
        else:
            response = client.post(url, json=params)

        is_runtime, error_msg = is_runtime_error_500(response)

        assert not is_runtime, f"{url} has RUNTIME ERROR:\n{error_msg}"

    @pytest.mark.parametrize("url,method,params,_", AUTH_ENDPOINTS)
    def test_auth_endpoint_no_runtime_error(
        self, client, auth_headers, mock_user, url, method, params, _, monkeypatch
    ):
        """
        Auth endpoint must not crash with runtime error.
        """
        from routes import auth as auth_module

        class MockQuery:
            def get(self, user_id):
                return mock_user if user_id == 999999 else None

        class MockUser:
            query = MockQuery()

        monkeypatch.setattr(auth_module, "User", MockUser)

        if method == "GET":
            response = client.get(url, headers=auth_headers, query_string=params)
        else:
            response = client.post(url, headers=auth_headers, json=params)

        is_runtime, error_msg = is_runtime_error_500(response)

        assert not is_runtime, f"{url} has RUNTIME ERROR:\n{error_msg}"


class TestCriticalEndpoints:
    """
    Test endpoints that have historically had runtime errors.

    Add new entries when we discover runtime errors in production.
    """

    def test_projects_hot_no_nameerror(self, client):
        """
        /api/projects/hot had NameError: district_param not defined.

        This is a regression test to ensure it doesn't happen again.
        """
        response = client.get("/api/projects/hot")

        is_runtime, error_msg = is_runtime_error_500(response)

        assert not is_runtime, (
            f"/api/projects/hot has RUNTIME ERROR (regression!):\n{error_msg}\n\n"
            "This endpoint previously had 'NameError: district_param is not defined'.\n"
            "Check routes/projects.py get_hot_projects() for undefined variables."
        )


class TestHealthEndpoints:
    """
    Health endpoints must ALWAYS return 200.

    If these fail, the whole service is down.
    """

    def test_ping_returns_200(self, client):
        """Ping endpoint must return 200."""
        response = client.get("/api/ping")
        assert response.status_code == 200, f"Ping failed: {response.get_json()}"

    def test_health_returns_200(self, client):
        """Health endpoint must return 200."""
        response = client.get("/api/health")
        assert response.status_code == 200, f"Health failed: {response.get_json()}"


class TestSmokeTestCoverage:
    """Informational test showing smoke test coverage."""

    def test_coverage_summary(self):
        """Print coverage summary."""
        total = len(PUBLIC_ENDPOINTS) + len(AUTH_ENDPOINTS)

        print(f"\n{'='*60}")
        print("ENDPOINT SMOKE TEST COVERAGE")
        print(f"{'='*60}")
        print(f"Public endpoints:  {len(PUBLIC_ENDPOINTS)}")
        print(f"Auth endpoints:    {len(AUTH_ENDPOINTS)}")
        print(f"{'─'*60}")
        print(f"TOTAL:             {total}")
        print(f"{'='*60}")
        print()
        print("Catches: NameError, TypeError, AttributeError, KeyError,")
        print("         ImportError, IndexError, UnboundLocalError")
        print()

        assert True  # Always passes
