"""
Contract tests for /api/aggregate endpoint.

Tests:
- Response structure matches expected schema
- Invalid params return 400 with helpful errors
- Snapshot comparisons for detecting breaking changes
"""

import pytest
import json
from pathlib import Path

from .conftest import extract_schema, diff_schemas


SNAPSHOT_DIR = Path(__file__).parent / "snapshots"


class TestAggregateContractSchema:
    """Test that contract schema is properly registered."""

    def test_aggregate_contract_registered(self, contract_registry):
        """Contract should be registered on import."""
        assert "aggregate" in contract_registry
        contract = contract_registry["aggregate"]
        assert contract.version == "v3"
        assert contract.endpoint == "aggregate"

    def test_param_schema_has_required_fields(self, contract_registry):
        """ParamSchema should define expected fields."""
        contract = contract_registry["aggregate"]
        fields = contract.param_schema.fields

        # Core fields
        assert "group_by" in fields
        assert "metrics" in fields
        assert "district" in fields
        assert "bedroom" in fields
        assert "date_from" in fields
        assert "date_to" in fields

    def test_param_schema_has_aliases(self, contract_registry):
        """ParamSchema should have camelCase aliases."""
        contract = contract_registry["aggregate"]
        aliases = contract.param_schema.aliases

        assert aliases.get("saleType") == "sale_type"
        assert aliases.get("dateFrom") == "date_from"
        assert aliases.get("dateTo") == "date_to"

    def test_response_schema_has_required_meta(self, contract_registry):
        """ResponseSchema should require meta fields."""
        contract = contract_registry["aggregate"]
        required = contract.response_schema.required_meta

        assert "requestId" in required
        assert "elapsedMs" in required
        assert "filtersApplied" in required


class TestAggregateValidation:
    """Test param validation."""

    def test_validate_public_params_with_valid_input(self, contract_registry):
        """Valid params should pass validation."""
        from api.contracts.validate import validate_public_params

        contract = contract_registry["aggregate"]
        params = {
            "group_by": "month,district",
            "metrics": "count,median_psf",
            "district": "D09,D10",
        }

        # Should not raise
        validate_public_params(params, contract.param_schema)

    def test_validate_public_params_with_invalid_segment(self, contract_registry):
        """Invalid segment value should raise ContractViolation."""
        from api.contracts.validate import validate_public_params, ContractViolation

        contract = contract_registry["aggregate"]
        params = {
            "segment": "INVALID",
        }

        with pytest.raises(ContractViolation) as exc_info:
            validate_public_params(params, contract.param_schema)

        assert "invalid_value" in str(exc_info.value.details)


class TestAggregateNormalization:
    """Test param normalization."""

    def test_normalize_district_codes(self, contract_registry):
        """District codes should be normalized to D## format."""
        from api.contracts.normalize import normalize_params

        contract = contract_registry["aggregate"]
        raw = {"district": "9,10,d01"}

        normalized = normalize_params(raw, contract.param_schema)

        assert "districts" in normalized
        assert "D09" in normalized["districts"]
        assert "D10" in normalized["districts"]
        assert "D01" in normalized["districts"]
        assert "district" not in normalized  # Singular removed

    def test_normalize_date_to_exclusive(self, contract_registry):
        """date_to should become date_to_exclusive."""
        from api.contracts.normalize import normalize_params
        from datetime import date

        contract = contract_registry["aggregate"]
        raw = {"date_to": "2025-12-27"}

        normalized = normalize_params(raw, contract.param_schema)

        assert "date_to_exclusive" in normalized
        assert "date_to" not in normalized

    def test_normalize_comma_lists(self, contract_registry):
        """Comma-separated strings should become lists."""
        from api.contracts.normalize import normalize_params

        contract = contract_registry["aggregate"]
        raw = {
            "group_by": "month,district",
            "metrics": "count,median_psf",
        }

        normalized = normalize_params(raw, contract.param_schema)

        assert isinstance(normalized["group_by"], list)
        assert normalized["group_by"] == ["month", "district"]
        assert isinstance(normalized["metrics"], list)
        assert normalized["metrics"] == ["count", "median_psf"]


class TestAggregateResponseValidation:
    """Test response validation."""

    def test_validate_valid_response(self, contract_registry):
        """Valid response should pass validation."""
        from api.contracts.validate import validate_response

        contract = contract_registry["aggregate"]
        response = {
            "data": [
                {
                    "period": "2025-12",
                    "periodGrain": "month",
                    "count": 100,
                    "medianPsf": 1842.50,
                }
            ],
            "meta": {
                "requestId": "req-123",
                "elapsedMs": 45.2,
                "filtersApplied": {"district": ["D09"]},
                "apiVersion": "v3",
            }
        }

        # Should not raise
        validate_response(response, contract.response_schema)

    def test_validate_response_missing_meta(self, contract_registry):
        """Response missing required meta should fail."""
        from api.contracts.validate import validate_response, ContractViolation

        contract = contract_registry["aggregate"]
        response = {
            "data": [{"count": 100}],
            "meta": {
                # Missing requestId, elapsedMs
                "filtersApplied": {},
            }
        }

        with pytest.raises(ContractViolation) as exc_info:
            validate_response(response, contract.response_schema)

        details = exc_info.value.details
        assert any("requestId" in str(v) for v in details["violations"])


class TestAggregateSnapshots:
    """Snapshot tests for detecting breaking changes."""

    def test_response_schema_matches_snapshot(self, snapshot_dir):
        """Response schema should match saved snapshot."""
        # Load snapshot
        snapshot_path = snapshot_dir / "aggregate_response_schema.json"
        if not snapshot_path.exists():
            pytest.skip("Snapshot not created yet")

        with open(snapshot_path) as f:
            snapshot = json.load(f)

        # Get current schema
        from api.contracts import get_contract
        contract = get_contract("aggregate")
        if not contract:
            pytest.skip("Contract not registered")

        current = {
            "data_fields": list(contract.response_schema.data_fields.keys()),
            "meta_fields": list(contract.response_schema.meta_fields.keys()),
            "required_meta": contract.response_schema.required_meta,
        }

        # Compare structure (allow additive changes)
        for field in snapshot.get("data_fields", []):
            assert field in current["data_fields"], f"Field '{field}' removed from data"

        for field in snapshot.get("required_meta", []):
            assert field in current["required_meta"], f"Required meta '{field}' removed"


# =============================================================================
# AGGREGATE-SUMMARY CONTRACT TESTS
# =============================================================================


class TestAggregateSummaryContractSchema:
    """Test that aggregate-summary contract schema is properly registered."""

    def test_aggregate_summary_contract_registered(self, contract_registry):
        """Contract should be registered on import."""
        assert "aggregate-summary" in contract_registry
        contract = contract_registry["aggregate-summary"]
        assert contract.version == "v3"
        assert contract.endpoint == "aggregate-summary"

    def test_param_schema_has_required_fields(self, contract_registry):
        """ParamSchema should define expected fields."""
        contract = contract_registry["aggregate-summary"]
        fields = contract.param_schema.fields

        # Filter fields
        assert "district" in fields
        assert "segment" in fields
        assert "bedroom" in fields
        assert "sale_type" in fields
        assert "tenure" in fields
        assert "date_from" in fields
        assert "date_to" in fields

        # Range filters
        assert "price_min" in fields
        assert "price_max" in fields
        assert "psf_min" in fields
        assert "psf_max" in fields

        # Options
        assert "bin_count" in fields

    def test_param_schema_has_aliases(self, contract_registry):
        """ParamSchema should have camelCase aliases."""
        contract = contract_registry["aggregate-summary"]
        aliases = contract.param_schema.aliases

        assert aliases.get("saleType") == "sale_type"
        assert aliases.get("dateFrom") == "date_from"
        assert aliases.get("dateTo") == "date_to"
        assert aliases.get("binCount") == "bin_count"

    def test_response_schema_has_required_meta(self, contract_registry):
        """ResponseSchema should require meta fields."""
        contract = contract_registry["aggregate-summary"]
        required = contract.response_schema.required_meta

        assert "requestId" in required
        assert "elapsedMs" in required
        assert "apiVersion" in required


class TestAggregateSummaryValidation:
    """Test aggregate-summary param validation."""

    def test_validate_valid_segment(self, contract_registry):
        """Valid segment should pass validation."""
        from api.contracts.validate import validate_public_params

        contract = contract_registry["aggregate-summary"]
        params = {"segment": "CCR"}

        # Should not raise
        validate_public_params(params, contract.param_schema)

    def test_validate_invalid_segment(self, contract_registry):
        """Invalid segment should fail validation."""
        from api.contracts.validate import validate_public_params, ContractViolation

        contract = contract_registry["aggregate-summary"]
        params = {"segment": "INVALID"}

        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)

    def test_validate_with_filters(self, contract_registry):
        """Multiple filters should pass validation."""
        from api.contracts.validate import validate_public_params

        contract = contract_registry["aggregate-summary"]
        params = {
            "district": "D09,D10",
            "bedroom": "2,3",
            "sale_type": "New Sale",
            "bin_count": "15",
        }

        # Should not raise
        validate_public_params(params, contract.param_schema)
