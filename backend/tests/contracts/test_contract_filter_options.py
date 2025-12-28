"""
Contract tests for /filter-options endpoint.
"""

import pytest
import json
from pathlib import Path

# Import contract components
from api.contracts.schemas import filter_options
from api.contracts import get_contract
from api.contracts.validate import validate_public_params, ContractViolation


SNAPSHOT_DIR = Path(__file__).parent / "snapshots"


class TestFilterOptionsContractSchema:
    """Test filter-options contract registration and schema."""

    def test_filter_options_contract_registered(self):
        """Filter options contract should be registered."""
        contract = get_contract("filter-options")
        assert contract is not None
        assert contract.endpoint == "filter-options"
        assert contract.version == "v3"

    def test_param_schema_has_schema_field(self):
        """Param schema should have schema version field."""
        contract = get_contract("filter-options")
        fields = contract.param_schema.fields

        assert "schema" in fields
        assert fields["schema"].default == "v1"
        assert fields["schema"].allowed_values == ["v1", "v2"]

    def test_response_schema_has_required_meta(self):
        """Response schema should require key meta fields."""
        contract = get_contract("filter-options")
        required = contract.response_schema.required_meta

        assert "requestId" in required
        assert "elapsedMs" in required
        assert "apiVersion" in required

    def test_response_schema_has_filter_fields(self):
        """Response schema should have all filter option fields."""
        contract = get_contract("filter-options")
        fields = contract.response_schema.data_fields

        assert "districts" in fields
        assert "regions" in fields
        assert "bedrooms" in fields
        assert "saleTypes" in fields
        assert "dateRange" in fields
        assert "psfRange" in fields
        assert "tenures" in fields


class TestFilterOptionsValidation:
    """Test param validation for filter-options."""

    def test_validate_valid_schema_v1(self):
        """Valid schema=v1 should pass validation."""
        contract = get_contract("filter-options")
        params = {"schema": "v1"}
        # Should not raise
        validate_public_params(params, contract.param_schema)

    def test_validate_valid_schema_v2(self):
        """Valid schema=v2 should pass validation."""
        contract = get_contract("filter-options")
        params = {"schema": "v2"}
        validate_public_params(params, contract.param_schema)

    def test_validate_invalid_schema(self):
        """Invalid schema should fail validation."""
        contract = get_contract("filter-options")
        params = {"schema": "v3"}

        with pytest.raises(ContractViolation) as exc_info:
            validate_public_params(params, contract.param_schema)

        assert exc_info.value.details["violations"][0]["received"] == "v3"

    def test_validate_empty_params(self):
        """Empty params should pass (uses defaults)."""
        contract = get_contract("filter-options")
        params = {}
        # Should not raise - schema defaults to v1
        validate_public_params(params, contract.param_schema)


class TestFilterOptionsSnapshots:
    """Test response schema matches snapshots."""

    def test_response_schema_matches_snapshot(self):
        """Response schema structure should match snapshot."""
        contract = get_contract("filter-options")

        # Load snapshot
        snapshot_path = SNAPSHOT_DIR / "filter_options_response_schema.json"
        if snapshot_path.exists():
            snapshot = json.loads(snapshot_path.read_text())

            # Verify required meta fields match
            for field in snapshot.get("required_meta", []):
                assert field in contract.response_schema.required_meta

            # Verify version matches
            assert contract.version == snapshot.get("_version")
