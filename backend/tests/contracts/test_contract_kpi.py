"""
Contract tests for /api/kpi-summary-v2 endpoint.

Tests:
- Response structure matches expected schema
- KPI items have required fields
"""

import pytest
import json
from pathlib import Path


SNAPSHOT_DIR = Path(__file__).parent / "snapshots"


class TestKpiContractSchema:
    """Test that KPI contract schema is properly registered."""

    def test_kpi_contract_registered(self, contract_registry):
        """Contract should be registered on import."""
        assert "kpi-summary-v2" in contract_registry
        contract = contract_registry["kpi-summary-v2"]
        assert contract.version == "v3"
        assert contract.endpoint == "kpi-summary-v2"

    def test_param_schema_has_filter_fields(self, contract_registry):
        """ParamSchema should define filter fields."""
        contract = contract_registry["kpi-summary-v2"]
        fields = contract.param_schema.fields

        assert "district" in fields
        assert "bedroom" in fields
        assert "segment" in fields
        assert "max_date" in fields

    def test_param_schema_has_max_date_alias(self, contract_registry):
        """ParamSchema should have camelCase alias for max_date."""
        contract = contract_registry["kpi-summary-v2"]
        aliases = contract.param_schema.aliases

        assert aliases.get("maxDate") == "max_date"


class TestKpiValidation:
    """Test KPI param validation."""

    def test_validate_valid_segment(self, contract_registry):
        """Valid segment should pass validation."""
        from api.contracts.validate import validate_public_params

        contract = contract_registry["kpi-summary-v2"]
        params = {"segment": "CCR"}

        # Should not raise
        validate_public_params(params, contract.param_schema)

    def test_validate_invalid_segment(self, contract_registry):
        """Invalid segment should fail validation."""
        from api.contracts.validate import validate_public_params, ContractViolation

        contract = contract_registry["kpi-summary-v2"]
        params = {"segment": "INVALID"}

        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)


class TestKpiNormalization:
    """Test KPI param normalization."""

    def test_normalize_district_to_districts(self, contract_registry):
        """district param should be passed through (KPI uses comma-separated string)."""
        from api.contracts.normalize import normalize_params

        contract = contract_registry["kpi-summary-v2"]
        raw = {"district": "D09,D10"}

        normalized = normalize_params(raw, contract.param_schema)

        # KPI endpoint expects districts as string, not list
        # This tests the normalization doesn't break it
        assert "districts" in normalized or "district" in normalized


class TestKpiResponseValidation:
    """Test KPI response structure validation."""

    def test_kpi_response_custom_validator(self):
        """KPI custom validator should check for 'kpis' array."""
        from api.contracts.schemas.kpi_summary import validate_kpi_response
        from api.contracts.validate import ContractViolation

        # Valid response
        valid_response = {
            "kpis": [
                {
                    "kpi_id": "median_psf",
                    "title": "Median PSF",
                    "value": 1842,
                    "formatted_value": "$1,842",
                }
            ],
            "meta": {}
        }

        # Should not raise
        validate_kpi_response(valid_response)

        # Invalid response (missing kpis)
        invalid_response = {
            "data": [],
            "meta": {}
        }

        with pytest.raises(ContractViolation):
            validate_kpi_response(invalid_response)

    def test_kpi_item_required_fields(self):
        """KPI items should have required fields."""
        from api.contracts.schemas.kpi_summary import validate_kpi_response
        from api.contracts.validate import ContractViolation

        # Missing kpi_id and title
        response = {
            "kpis": [
                {
                    "value": 1842,
                }
            ],
            "meta": {}
        }

        with pytest.raises(ContractViolation) as exc_info:
            validate_kpi_response(response)

        details = exc_info.value.details
        assert any("kpi_id" in str(v) for v in details["violations"])
        assert any("title" in str(v) for v in details["violations"])


class TestKpiSnapshots:
    """Snapshot tests for KPI endpoint."""

    def test_kpi_schema_matches_snapshot(self, snapshot_dir):
        """KPI response schema should match saved snapshot."""
        snapshot_path = snapshot_dir / "kpi_response_schema.json"
        if not snapshot_path.exists():
            pytest.skip("Snapshot not created yet")

        with open(snapshot_path) as f:
            snapshot = json.load(f)

        from api.contracts import get_contract
        contract = get_contract("kpi-summary-v2")
        if not contract:
            pytest.skip("Contract not registered")

        current_required_meta = contract.response_schema.required_meta

        for field in snapshot.get("required_meta", []):
            assert field in current_required_meta, f"Required meta '{field}' removed"
