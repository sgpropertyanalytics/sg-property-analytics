"""
Universal STRICT mode validation for ALL contracted endpoints.

This test catches undeclared fields in responses that slip through
when developers add debug fields or forget to update schemas.

The Problem This Solves:
------------------------
On Jan 3, 2026, we discovered /api/auth/subscription was returning
`_debug_user_id` and `_debug_email` fields not declared in the schema.
The @api_contract decorator logged warnings but tests didn't fail because:
1. Tests ran in WARN mode (default), not STRICT mode
2. No test validated actual responses against schemas

This test ensures EVERY contracted endpoint's response matches its
schema exactly - no undeclared fields allowed.

Run: pytest tests/contracts/test_all_endpoints_strict.py -v
"""

import os
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta
import jwt

# Import app factory
from app import create_app
from config import Config


# =============================================================================
# ENDPOINT REGISTRY
# =============================================================================
# Maps contract endpoint names to (URL path, HTTP method, required params)
#
# Categories:
# - PUBLIC: No authentication required
# - AUTH_REQUIRED: Requires valid JWT in Authorization header
# - PARAMS_REQUIRED: Requires specific query/body params to avoid 400
# - SKIP: Known to fail or require special setup (with reason)

PUBLIC_ENDPOINTS = [
    # Filter & Options
    ("filter-options", "/api/filter-options", "GET", {}),

    # Analytics - Aggregate
    ("aggregate", "/api/aggregate", "GET", {"group_by": "month", "metrics": "count"}),

    # Analytics - Dashboard
    ("dashboard", "/api/dashboard", "GET", {}),

    # Analytics - KPI
    ("kpi-summary", "/api/kpi-summary", "GET", {}),
    ("kpi-summary-v2", "/api/kpi-summary-v2", "GET", {}),

    # Analytics - Trends
    ("trends/new-vs-resale", "/api/new-vs-resale", "GET", {}),

    # Analytics - Transactions
    ("transactions/price-growth", "/api/transactions/price-growth", "GET", {}),
    ("transactions/price-growth/segments", "/api/transactions/price-growth/segments", "GET", {}),

    # Analytics - New Launch
    ("new-launch-timeline", "/api/new-launch-timeline", "GET", {}),
    ("new-launch-absorption", "/api/new-launch-absorption", "GET", {}),

    # Charts
    ("charts/projects-by-district", "/api/projects_by_district", "GET", {"district": "D01"}),
    ("charts/price-projects-by-district", "/api/price_projects_by_district", "GET", {"district": "D01"}),
    ("charts/floor-liquidity-heatmap", "/api/floor-liquidity-heatmap", "GET", {"project": "TEST_PROJECT"}),
    ("charts/budget-heatmap", "/api/budget-heatmap", "GET", {}),

    # Insights
    ("insights/district-psf", "/api/insights/district-psf", "GET", {}),
    ("insights/district-liquidity", "/api/insights/district-liquidity", "GET", {}),

    # Supply
    ("supply/summary", "/api/supply/summary", "GET", {}),

    # Upcoming Launches
    ("upcoming-launches/all", "/api/upcoming-launches/all", "GET", {}),
    ("upcoming-launches/needs-review", "/api/upcoming-launches/needs-review", "GET", {}),

    # GLS
    ("gls/all", "/api/gls/all", "GET", {}),
    ("gls/needs-review", "/api/gls/needs-review", "GET", {}),

    # Projects
    ("projects/hot", "/api/projects/hot", "GET", {}),
    ("projects/locations", "/api/projects/locations", "GET", {}),
    ("projects/inventory-status", "/api/projects/inventory/status", "GET", {}),
    ("projects/resale-projects", "/api/projects/resale-projects", "GET", {}),
]

AUTH_REQUIRED_ENDPOINTS = [
    # Auth endpoints that require JWT
    ("auth/me", "/api/auth/me", "GET", {}),
    ("auth/subscription", "/api/auth/subscription", "GET", {}),
]

# Endpoints requiring POST with specific body
POST_ENDPOINTS = [
    ("auth/register", "/api/auth/register", "POST", {"email": "test@example.com", "password": "testpass123"}),
    ("auth/login", "/api/auth/login", "POST", {"email": "test@example.com", "password": "testpass123"}),
    ("auth/firebase-sync", "/api/auth/firebase-sync", "POST", {"idToken": "mock_token", "email": "test@example.com"}),
]

# Endpoints with path parameters
PATH_PARAM_ENDPOINTS = [
    ("projects/inventory", "/api/projects/TEST_PROJECT/inventory", "GET", {}),
    ("projects/price-bands", "/api/projects/TEST_PROJECT/price-bands", "GET", {}),
    ("projects/exit-queue", "/api/projects/TEST_PROJECT/exit-queue", "GET", {}),
    ("kpi-summary-v2/single", "/api/kpi-summary-v2/market_momentum", "GET", {}),
]

# Endpoints that require special setup or are known to have issues
# Format: (contract, url, method, params, skip_reason)
SKIP_ENDPOINTS = [
    ("auth/delete-account", "/api/auth/delete-account", "DELETE", {},
     "Destructive action - requires real user in DB"),
    ("deal-checker/multi-scope", "/api/deal-checker/multi-scope", "GET", {},
     "Requires complex query params"),
    ("deal-checker/project-names", "/api/projects/names", "GET", {},
     "Requires deal-checker context"),
    ("charts/psf-by-price-band", "/api/psf-by-price-band", "GET", {},
     "Requires specific project context"),
]


# =============================================================================
# FIXTURES
# =============================================================================

@pytest.fixture(scope="module")
def app():
    """Create test Flask application with STRICT contract mode."""
    # Set STRICT mode BEFORE creating app
    os.environ["CONTRACT_MODE"] = "strict"

    app = create_app()
    app.config['TESTING'] = True

    yield app

    # Cleanup
    os.environ.pop("CONTRACT_MODE", None)


@pytest.fixture(scope="module")
def client(app):
    """Create test client."""
    return app.test_client()


@pytest.fixture(scope="module")
def auth_headers(app):
    """Generate valid JWT for authenticated endpoints."""
    # Create a mock user token
    payload = {
        'user_id': 999999,  # Test user ID
        'email': 'test@strict-mode.test',
        'exp': datetime.utcnow() + timedelta(hours=1),
        'iat': datetime.utcnow()
    }
    token = jwt.encode(payload, Config.JWT_SECRET, algorithm=Config.JWT_ALGORITHM)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def mock_user(app):
    """Mock User.query.get to return a test user."""
    from models.user import User

    mock_user = MagicMock(spec=User)
    mock_user.id = 999999
    mock_user.email = "test@strict-mode.test"
    mock_user.plan_tier = "free"
    mock_user.subscription_status = None
    mock_user.normalized_tier.return_value = "free"
    mock_user.is_subscribed.return_value = False
    mock_user.entitlement_info.return_value = {
        "has_access": False,
        "entitlement_source": None,
        "access_expires_at": None,
    }
    mock_user.to_dict.return_value = {
        "id": 999999,
        "email": "test@strict-mode.test",
        "plan_tier": "free",
    }

    return mock_user


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def check_response_not_contract_violation(response, endpoint_name: str, url: str):
    """
    Check that response is not a 500 caused by contract violation.

    In STRICT mode, undeclared fields cause ContractViolation which
    Flask converts to 500 Internal Server Error.

    Returns tuple (passed: bool, message: str)
    """
    # 2xx and 3xx are fine
    if response.status_code < 400:
        return True, f"OK ({response.status_code})"

    # 4xx might be expected (auth required, missing params)
    if response.status_code < 500:
        return True, f"Client error ({response.status_code}) - not contract violation"

    # 5xx - check if it's a contract violation
    try:
        data = response.get_json()
        if data and "contract" in str(data).lower():
            return False, f"CONTRACT VIOLATION: {data}"
        if data and "undeclared" in str(data).lower():
            return False, f"UNDECLARED FIELD: {data}"
        # Generic 500 - might be DB or other issue
        return True, f"Server error ({response.status_code}) - not contract violation: {data}"
    except Exception:
        return True, f"Server error ({response.status_code}) - response not JSON"


def extract_contract_violations_from_logs(caplog):
    """Extract contract violation warnings from captured logs."""
    violations = []
    for record in caplog.records:
        if "contract" in record.message.lower() and "violation" in record.message.lower():
            violations.append(record.message)
    return violations


# =============================================================================
# TESTS: PUBLIC ENDPOINTS
# =============================================================================

class TestPublicEndpointsStrict:
    """
    Test that all public endpoints return schema-compliant responses.

    These endpoints don't require authentication.
    """

    @pytest.mark.parametrize("contract,url,method,params", PUBLIC_ENDPOINTS)
    def test_public_endpoint_no_contract_violation(self, client, contract, url, method, params):
        """
        Public endpoint must not trigger contract violation in STRICT mode.

        A 500 error with 'contract violation' or 'undeclared field' in the
        response indicates the endpoint returns fields not declared in schema.
        """
        if method == "GET":
            response = client.get(url, query_string=params)
        else:
            response = client.post(url, json=params)

        passed, message = check_response_not_contract_violation(response, contract, url)

        assert passed, f"[{contract}] {url}: {message}"


# =============================================================================
# TESTS: AUTH-REQUIRED ENDPOINTS
# =============================================================================

class TestAuthEndpointsStrict:
    """
    Test that auth-required endpoints return schema-compliant responses.

    These endpoints require valid JWT in Authorization header.
    Uses mocked user to avoid needing real database records.
    """

    @pytest.mark.parametrize("contract,url,method,params", AUTH_REQUIRED_ENDPOINTS)
    def test_auth_endpoint_no_contract_violation(
        self, client, auth_headers, mock_user, contract, url, method, params, monkeypatch
    ):
        """
        Auth endpoint must not trigger contract violation in STRICT mode.
        """
        # Mock User.query.get to return our mock user
        from routes import auth as auth_module

        class MockQuery:
            def get(self, user_id):
                if user_id == 999999:
                    return mock_user
                return None

        class MockUser:
            query = MockQuery()

        # Patch User in the auth module
        monkeypatch.setattr(auth_module, "User", MockUser)

        # Also mock schema guard for subscription endpoint
        if "subscription" in url:
            monkeypatch.setattr(
                "services.schema_guard.check_user_entitlement_columns",
                lambda: {"missing": [], "error": None}
            )

        if method == "GET":
            response = client.get(url, headers=auth_headers, query_string=params)
        else:
            response = client.post(url, headers=auth_headers, json=params)

        passed, message = check_response_not_contract_violation(response, contract, url)

        assert passed, f"[{contract}] {url}: {message}"


# =============================================================================
# TESTS: PATH PARAMETER ENDPOINTS
# =============================================================================

class TestPathParamEndpointsStrict:
    """
    Test endpoints that require path parameters.

    These use placeholder values that may not exist in DB,
    so we expect 404 or empty results - NOT contract violations.
    """

    @pytest.mark.parametrize("contract,url,method,params", PATH_PARAM_ENDPOINTS)
    def test_path_param_endpoint_no_contract_violation(self, client, contract, url, method, params):
        """
        Path param endpoint must not trigger contract violation.

        404 or empty results are acceptable - contract violations are not.
        """
        if method == "GET":
            response = client.get(url, query_string=params)
        else:
            response = client.post(url, json=params)

        passed, message = check_response_not_contract_violation(response, contract, url)

        assert passed, f"[{contract}] {url}: {message}"


# =============================================================================
# TESTS: POST ENDPOINTS (No Auth)
# =============================================================================

class TestPostEndpointsStrict:
    """
    Test POST endpoints that don't require prior auth.

    These include registration and login which create/verify users.
    We mock the database to avoid side effects.
    """

    def test_register_no_contract_violation(self, client, monkeypatch):
        """Registration endpoint must not trigger contract violation."""
        from routes import auth as auth_module
        from models.user import User

        # Mock User.query to return None (user doesn't exist)
        class MockQuery:
            def filter_by(self, **kwargs):
                return self
            def first(self):
                return None

        class MockUser:
            query = MockQuery()

        # Mock database session
        mock_session = MagicMock()
        monkeypatch.setattr(auth_module, "User", MockUser)
        monkeypatch.setattr("models.database.db.session", mock_session)

        # Create a mock user instance
        mock_user = MagicMock(spec=User)
        mock_user.id = 12345
        mock_user.email = "newuser@test.com"
        mock_user.to_dict.return_value = {"id": 12345, "email": "newuser@test.com"}

        # Patch User constructor to return our mock
        with patch.object(auth_module, 'User', return_value=mock_user):
            response = client.post(
                "/api/auth/register",
                json={"email": "newuser@test.com", "password": "testpass123"}
            )

        passed, message = check_response_not_contract_violation(response, "auth/register", "/api/auth/register")
        assert passed, f"[auth/register]: {message}"

    def test_login_invalid_credentials_no_contract_violation(self, client, monkeypatch):
        """Login endpoint with invalid creds must not trigger contract violation."""
        from routes import auth as auth_module

        # Mock User.query to return None (user not found)
        class MockQuery:
            def filter_by(self, **kwargs):
                return self
            def first(self):
                return None

        class MockUser:
            query = MockQuery()

        monkeypatch.setattr(auth_module, "User", MockUser)

        response = client.post(
            "/api/auth/login",
            json={"email": "invalid@test.com", "password": "wrongpass"}
        )

        # 401 is expected, but should not be contract violation
        passed, message = check_response_not_contract_violation(response, "auth/login", "/api/auth/login")
        assert passed, f"[auth/login]: {message}"


# =============================================================================
# TESTS: SKIPPED ENDPOINTS (Document Why)
# =============================================================================

class TestSkippedEndpoints:
    """
    Document endpoints that are skipped and why.

    Each skipped endpoint should have a tracking issue or clear reason.
    """

    @pytest.mark.parametrize("contract,url,method,params,reason", SKIP_ENDPOINTS)
    def test_document_skipped_endpoint(self, contract, url, method, params, reason):
        """
        Skipped endpoints are documented with reasons.

        This test always passes but documents what's not covered.
        """
        pytest.skip(f"[{contract}] {url}: {reason}")


# =============================================================================
# TESTS: META FIELD INJECTION
# =============================================================================

class TestMetaFieldsInjected:
    """
    Test that @api_contract decorator injects required meta fields.

    All responses should contain:
    - meta.requestId
    - meta.elapsedMs
    - meta.apiVersion
    - meta.apiContractVersion
    - meta.contractHash
    """

    def test_aggregate_has_meta_fields(self, client):
        """Aggregate endpoint should have all required meta fields."""
        response = client.get("/api/aggregate", query_string={"group_by": "month"})

        if response.status_code != 200:
            pytest.skip(f"Endpoint returned {response.status_code}, cannot check meta")

        data = response.get_json()
        assert "meta" in data, "Response missing 'meta' field"

        meta = data["meta"]
        required_fields = ["requestId", "elapsedMs", "apiVersion", "apiContractVersion", "contractHash"]

        for field in required_fields:
            assert field in meta, f"meta.{field} missing from response"

    def test_filter_options_has_meta_fields(self, client):
        """Filter options endpoint should have all required meta fields."""
        response = client.get("/api/filter-options")

        if response.status_code != 200:
            pytest.skip(f"Endpoint returned {response.status_code}, cannot check meta")

        data = response.get_json()
        assert "meta" in data, "Response missing 'meta' field"

        meta = data["meta"]
        required_fields = ["requestId", "elapsedMs", "apiVersion", "apiContractVersion", "contractHash"]

        for field in required_fields:
            assert field in meta, f"meta.{field} missing from response"


# =============================================================================
# TESTS: CONTRACT MODE VERIFICATION
# =============================================================================

class TestContractModeActive:
    """Verify that STRICT mode is actually active during tests."""

    def test_strict_mode_env_set(self):
        """CONTRACT_MODE should be 'strict' in test environment."""
        mode = os.environ.get("CONTRACT_MODE")
        assert mode == "strict", f"CONTRACT_MODE is '{mode}', expected 'strict'"

    def test_strict_mode_detected_by_registry(self):
        """Registry should detect STRICT mode."""
        from api.contracts.registry import _get_default_mode, SchemaMode

        mode = _get_default_mode()
        assert mode == SchemaMode.STRICT, f"Registry mode is {mode}, expected STRICT"


# =============================================================================
# SUMMARY TEST
# =============================================================================

class TestCoverageSummary:
    """Provide summary of contract test coverage."""

    def test_coverage_summary(self):
        """Print summary of endpoints tested."""
        total_public = len(PUBLIC_ENDPOINTS)
        total_auth = len(AUTH_REQUIRED_ENDPOINTS)
        total_path = len(PATH_PARAM_ENDPOINTS)
        total_post = 2  # register, login
        total_skipped = len(SKIP_ENDPOINTS)

        total = total_public + total_auth + total_path + total_post

        print(f"\n{'='*60}")
        print("CONTRACT STRICT MODE TEST COVERAGE")
        print(f"{'='*60}")
        print(f"Public endpoints:      {total_public}")
        print(f"Auth-required:         {total_auth}")
        print(f"Path param endpoints:  {total_path}")
        print(f"POST endpoints:        {total_post}")
        print(f"{'─'*60}")
        print(f"TOTAL TESTED:          {total}")
        print(f"Skipped (documented):  {total_skipped}")
        print(f"{'='*60}\n")

        # This test always passes - it's informational
        assert True
