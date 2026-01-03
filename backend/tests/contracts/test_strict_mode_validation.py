"""
STRICT mode validation regression tests.

This is the critical test that prevents the entire class of schema drift failures:
1. Response exactly matches schema (no undeclared fields) in STRICT mode
2. Meta contains apiContractVersion + contractHash in expected location
3. contractHash is stable across runs

Run: pytest tests/contracts/test_strict_mode_validation.py -v
"""

import pytest
from unittest.mock import patch
import os

from api.contracts.validate import validate_response, ContractViolation
from api.contracts.registry import SchemaMode, ResponseSchema, FieldSpec
from api.contracts.contract_schema import (
    API_CONTRACT_VERSION,
    CONTRACT_SCHEMA_HASHES,
    get_schema_hash,
)


# =============================================================================
# TEST 1: Undeclared Field Detection (Bidirectional Validation)
# =============================================================================

class TestUndeclaredFieldDetection:
    """
    Bidirectional validation: schema → response AND response → schema.

    This catches serializers returning fields not declared in schemas,
    preventing "works in WARN, breaks in STRICT" failures.
    """

    @pytest.fixture
    def strict_schema(self):
        """A minimal schema for testing undeclared field detection."""
        return ResponseSchema(
            data_fields={
                "name": FieldSpec(name="name", type=str, required=True),
                "count": FieldSpec(name="count", type=int, required=True),
            },
            meta_fields={
                "requestId": FieldSpec(name="requestId", type=str, required=True),
            },
            required_meta=["requestId"],
            data_is_list=True,
        )

    def test_valid_response_passes_strict(self, strict_schema):
        """Response matching schema exactly should pass."""
        response = {
            "data": [{"name": "Test", "count": 10}],
            "meta": {"requestId": "req-123"},
        }

        # Should not raise
        validate_response(response, strict_schema)

    def test_undeclared_data_field_detected(self, strict_schema):
        """Undeclared field in data should be caught."""
        response = {
            "data": [
                {
                    "name": "Test",
                    "count": 10,
                    "extraField": "SHOULD_FAIL",  # Not in schema
                }
            ],
            "meta": {"requestId": "req-123"},
        }

        with pytest.raises(ContractViolation) as exc_info:
            validate_response(response, strict_schema)

        # Verify the violation mentions undeclared field
        violations = exc_info.value.details.get("violations", [])
        undeclared = [v for v in violations if v.get("error") == "undeclared_field"]
        assert len(undeclared) > 0, "Should detect undeclared field"
        assert "extraField" in str(undeclared)

    def test_undeclared_meta_field_detected(self, strict_schema):
        """Undeclared field in meta should be caught."""
        response = {
            "data": [{"name": "Test", "count": 10}],
            "meta": {
                "requestId": "req-123",
                "secretField": "SHOULD_FAIL",  # Not in schema
            },
        }

        with pytest.raises(ContractViolation) as exc_info:
            validate_response(response, strict_schema)

        violations = exc_info.value.details.get("violations", [])
        undeclared = [v for v in violations if v.get("error") == "undeclared_meta_field"]
        assert len(undeclared) > 0, "Should detect undeclared meta field"
        assert "secretField" in str(undeclared)

    def test_missing_required_field_detected(self, strict_schema):
        """Missing required field should be caught."""
        response = {
            "data": [{"name": "Test"}],  # Missing 'count'
            "meta": {"requestId": "req-123"},
        }

        with pytest.raises(ContractViolation) as exc_info:
            validate_response(response, strict_schema)

        violations = exc_info.value.details.get("violations", [])
        missing = [v for v in violations if v.get("error") == "missing_field"]
        assert len(missing) > 0, "Should detect missing required field"

    def test_missing_required_meta_detected(self, strict_schema):
        """Missing required meta field should be caught."""
        response = {
            "data": [{"name": "Test", "count": 10}],
            "meta": {},  # Missing 'requestId'
        }

        with pytest.raises(ContractViolation) as exc_info:
            validate_response(response, strict_schema)

        violations = exc_info.value.details.get("violations", [])
        missing = [v for v in violations if "requestId" in str(v)]
        assert len(missing) > 0, "Should detect missing required meta"


# =============================================================================
# TEST 2: Meta Contains apiContractVersion + contractHash
# =============================================================================

class TestMetaFieldInjection:
    """
    Decorator must inject apiContractVersion and contractHash into meta.

    These fields are required for frontend contract validation and debugging.
    """

    def test_api_contract_version_is_defined(self):
        """API_CONTRACT_VERSION constant must be defined."""
        assert API_CONTRACT_VERSION is not None
        assert isinstance(API_CONTRACT_VERSION, str)
        assert API_CONTRACT_VERSION.startswith("v")

    def test_contract_hashes_defined_for_core_endpoints(self):
        """Core endpoints must have contractHash defined."""
        core_endpoints = [
            "aggregate",
            "dashboard",
            "filter_options",
            "transactions",
        ]

        for endpoint in core_endpoints:
            hash_value = get_schema_hash(endpoint)
            assert hash_value is not None, f"Missing hash for {endpoint}"
            assert ":v3:" in hash_value, f"Hash for {endpoint} should include version"
            assert hash_value != f"{endpoint}:v3:unknown", f"Hash for {endpoint} is undefined"

    def test_get_schema_hash_returns_unknown_for_missing(self):
        """Unknown endpoints should get fallback hash."""
        hash_value = get_schema_hash("nonexistent_endpoint_xyz")
        assert hash_value == "nonexistent_endpoint_xyz:v3:unknown"


# =============================================================================
# TEST 3: contractHash Stability
# =============================================================================

class TestContractHashStability:
    """
    contractHash must be stable: same schema → same hash across runs.

    This is critical because:
    - Frontend uses hash for cache invalidation
    - Unstable hashes break client-side caching
    - Hash changes should only happen when schema actually changes
    """

    # Snapshot of expected hashes - update when schemas intentionally change
    EXPECTED_HASHES = {
        "aggregate": "agg:v3:period|periodGrain|saleType|count|totalValue|medianPsf",
        "transactions": "txn:v3:projectName|district|bedroomCount|price|psf|saleType",
        "dashboard": "dash:v3:timeSeries|volumeByLocation|priceHistogram|summary",
        "filter_options": "fopt:v3:saleTypes|tenures|regions|districts|bedrooms",
        "price_bands": "pb:v3:bands|latest|trend|verdict|dataQuality",
        "exit_queue": "eq:v3:fundamentals|resaleMetrics|riskAssessment|gatingFlags",
        "psf_by_price_band": "psfpb:v3:priceBand|bedroom|p25|p50|p75|observationCount|suppressed",
    }

    def test_hashes_match_snapshot(self):
        """Contract hashes must match expected snapshot."""
        for endpoint, expected_hash in self.EXPECTED_HASHES.items():
            actual_hash = get_schema_hash(endpoint)
            assert actual_hash == expected_hash, (
                f"Hash mismatch for '{endpoint}'!\n"
                f"Expected: {expected_hash}\n"
                f"Actual:   {actual_hash}\n"
                f"If this is intentional, update EXPECTED_HASHES in this test."
            )

    def test_hashes_are_static_strings(self):
        """Hashes should be static strings, not computed."""
        # Verify CONTRACT_SCHEMA_HASHES is a simple dict of strings
        assert isinstance(CONTRACT_SCHEMA_HASHES, dict)

        for endpoint, hash_value in CONTRACT_SCHEMA_HASHES.items():
            assert isinstance(endpoint, str)
            assert isinstance(hash_value, str)
            # Hashes should be human-readable signatures, not cryptographic
            assert len(hash_value) < 100, f"Hash for {endpoint} too long (not human-readable)"
            assert "|" in hash_value, f"Hash for {endpoint} should use pipe-separated fields"

    def test_hash_deterministic_across_calls(self):
        """Same endpoint should return same hash on repeated calls."""
        for _ in range(10):
            for endpoint in CONTRACT_SCHEMA_HASHES.keys():
                hash1 = get_schema_hash(endpoint)
                hash2 = get_schema_hash(endpoint)
                assert hash1 == hash2, f"Non-deterministic hash for {endpoint}"

    def test_no_runtime_computation(self):
        """get_schema_hash should be O(1) dict lookup, not computed."""
        import time

        # If hashes were computed at runtime (JSON + SHA), this would be slow
        # Dict lookup should be < 1ms for 1000 iterations
        start = time.perf_counter()
        for _ in range(1000):
            for endpoint in CONTRACT_SCHEMA_HASHES.keys():
                get_schema_hash(endpoint)
        elapsed = time.perf_counter() - start

        assert elapsed < 0.1, (
            f"get_schema_hash took {elapsed:.3f}s for 1000 iterations - "
            "this suggests runtime computation instead of static lookup"
        )


# =============================================================================
# TEST 4: Full Integration - @api_contract Decorator
# =============================================================================

class TestDecoratorMetaInjection:
    """
    Test that @api_contract decorator injects all required meta fields.
    """

    @pytest.fixture
    def app(self):
        """Create Flask app for testing."""
        from flask import Flask
        app = Flask(__name__)
        app.config['TESTING'] = True
        return app

    def test_decorator_injects_meta_fields(self, app):
        """Decorator should inject requestId, apiContractVersion, contractHash."""
        from api.contracts import api_contract
        # Import a schema to ensure it's registered
        from api.contracts.schemas import filter_options  # noqa: F401

        @api_contract("filter-options")
        def handler():
            return {
                "districts": [],
                "regions": [],
                "bedrooms": [],
                "saleTypes": [],
                "projects": [],
                "dateRange": {},
                "psfRange": {},
                "sizeRange": {},
                "tenures": [],
                "propertyAgeBuckets": [],
                "marketSegments": [],
            }

        with app.test_request_context("/test"):
            result = handler()

        # Unpack tuple response
        if isinstance(result, tuple):
            response, status = result
        else:
            response, status = result, 200

        data = response.get_json()

        # Verify meta fields
        assert "meta" in data, "Response should have meta"
        meta = data["meta"]

        assert "requestId" in meta, "meta.requestId missing"
        assert "apiContractVersion" in meta, "meta.apiContractVersion missing"
        assert "contractHash" in meta, "meta.contractHash missing"
        assert "elapsedMs" in meta, "meta.elapsedMs missing"

        # Verify values
        assert meta["apiContractVersion"] == API_CONTRACT_VERSION
        assert "fopt:v3:" in meta["contractHash"]


# =============================================================================
# TEST 5: CONTRACT_MODE Environment Variable
# =============================================================================

class TestContractModeEnv:
    """Test that CONTRACT_MODE=strict is respected."""

    def test_strict_mode_from_env(self):
        """CONTRACT_MODE=strict should enable strict validation."""
        from api.contracts.registry import _get_default_mode, SchemaMode

        with patch.dict(os.environ, {"CONTRACT_MODE": "strict"}):
            mode = _get_default_mode()
            assert mode == SchemaMode.STRICT

    def test_warn_mode_from_env(self):
        """CONTRACT_MODE=warn should enable warn validation."""
        from api.contracts.registry import _get_default_mode, SchemaMode

        with patch.dict(os.environ, {"CONTRACT_MODE": "warn"}):
            mode = _get_default_mode()
            assert mode == SchemaMode.WARN

    def test_default_is_warn(self):
        """Default mode should be WARN when env not set."""
        from api.contracts.registry import _get_default_mode, SchemaMode

        with patch.dict(os.environ, {}, clear=True):
            # Remove CONTRACT_MODE if it exists
            os.environ.pop("CONTRACT_MODE", None)
            mode = _get_default_mode()
            assert mode == SchemaMode.WARN
