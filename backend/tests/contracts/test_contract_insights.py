"""
Contract tests for /insights/* endpoints.
"""

import pytest
import json
from pathlib import Path

# Import contract components
from api.contracts.schemas import insights
from api.contracts import get_contract
from api.contracts.validate import validate_public_params, ContractViolation


SNAPSHOT_DIR = Path(__file__).parent / "snapshots"


class TestDistrictPsfContractSchema:
    """Test insights/district-psf contract."""

    def test_district_psf_contract_registered(self):
        """District PSF contract should be registered."""
        contract = get_contract("insights/district-psf")
        assert contract is not None
        assert contract.endpoint == "insights/district-psf"
        assert contract.version == "v3"

    def test_param_schema_has_filter_fields(self):
        """Param schema should have filter fields."""
        contract = get_contract("insights/district-psf")
        fields = contract.param_schema.fields

        assert "timeframe" in fields  # Canonical timeframe field
        assert "period" in fields     # Deprecated, kept for back-compat
        assert "bed" in fields
        assert "age" in fields
        assert "sale_type" in fields

    def test_param_schema_timeframe_values(self):
        """Timeframe should have canonical values with Y1 default."""
        contract = get_contract("insights/district-psf")
        timeframe_field = contract.param_schema.fields["timeframe"]

        # Canonical IDs with Y1 as default
        assert timeframe_field.default == "Y1"
        assert "M3" in timeframe_field.allowed_values
        assert "M6" in timeframe_field.allowed_values
        assert "Y1" in timeframe_field.allowed_values
        assert "Y3" in timeframe_field.allowed_values
        assert "Y5" in timeframe_field.allowed_values
        # Legacy values also accepted for back-compat
        assert "12m" in timeframe_field.allowed_values

        # Period is deprecated (no default, kept for back-compat)
        period_field = contract.param_schema.fields["period"]
        assert period_field.default is None
        assert "3m" in period_field.allowed_values

    def test_response_schema_has_required_meta(self):
        """Response schema should require key meta fields."""
        contract = get_contract("insights/district-psf")
        required = contract.response_schema.required_meta

        assert "requestId" in required
        assert "elapsedMs" in required
        assert "apiVersion" in required


class TestDistrictPsfValidation:
    """Test param validation for district-psf."""

    def test_validate_valid_period(self):
        """Valid period should pass."""
        contract = get_contract("insights/district-psf")
        params = {"period": "6m"}
        validate_public_params(params, contract.param_schema)

    def test_validate_invalid_period(self):
        """Invalid period should fail."""
        contract = get_contract("insights/district-psf")
        params = {"period": "2m"}

        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)

    def test_validate_valid_bed(self):
        """Valid bed should pass."""
        contract = get_contract("insights/district-psf")
        params = {"bed": "3"}
        validate_public_params(params, contract.param_schema)

    def test_validate_empty_params(self):
        """Empty params should pass (all have defaults)."""
        contract = get_contract("insights/district-psf")
        params = {}
        validate_public_params(params, contract.param_schema)


class TestDistrictLiquidityContractSchema:
    """Test insights/district-liquidity contract."""

    def test_district_liquidity_contract_registered(self):
        """District liquidity contract should be registered."""
        contract = get_contract("insights/district-liquidity")
        assert contract is not None
        assert contract.endpoint == "insights/district-liquidity"
        assert contract.version == "v3"

    def test_param_schema_has_filter_fields(self):
        """Param schema should have filter fields."""
        contract = get_contract("insights/district-liquidity")
        fields = contract.param_schema.fields

        assert "period" in fields
        assert "bed" in fields
        assert "sale_type" in fields

    def test_response_schema_has_required_meta(self):
        """Response schema should require key meta fields."""
        contract = get_contract("insights/district-liquidity")
        required = contract.response_schema.required_meta

        assert "requestId" in required
        assert "elapsedMs" in required
        assert "apiVersion" in required


class TestInsightsSnapshots:
    """Test response schemas match snapshots."""

    def test_schemas_match_snapshot(self):
        """All insights schemas should match snapshot."""
        snapshot_path = SNAPSHOT_DIR / "insights_response_schema.json"
        if snapshot_path.exists():
            snapshot = json.loads(snapshot_path.read_text())

            # Verify all endpoints have v3 version
            assert snapshot.get("_version") == "v3"

            # Verify district-psf meta
            contract = get_contract("insights/district-psf")
            for field in snapshot["district_psf"]["required_meta"]:
                assert field in contract.response_schema.required_meta

            # Verify district-liquidity meta
            contract = get_contract("insights/district-liquidity")
            for field in snapshot["district_liquidity"]["required_meta"]:
                assert field in contract.response_schema.required_meta
