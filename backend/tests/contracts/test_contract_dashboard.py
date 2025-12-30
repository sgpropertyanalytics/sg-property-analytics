"""
Contract tests for /dashboard endpoint.
"""

import pytest
import json
from pathlib import Path

# Import contract components
from api.contracts.schemas import dashboard
from api.contracts import get_contract
from api.contracts.validate import validate_public_params, ContractViolation
from api.contracts.normalize import normalize_params


SNAPSHOT_DIR = Path(__file__).parent / "snapshots"


class TestDashboardContractSchema:
    """Test dashboard contract registration and schema."""

    def test_dashboard_contract_registered(self):
        """Dashboard contract should be registered."""
        contract = get_contract("dashboard")
        assert contract is not None
        assert contract.endpoint == "dashboard"
        assert contract.version == "v3"

    def test_param_schema_has_filter_fields(self):
        """Param schema should have all filter fields."""
        contract = get_contract("dashboard")
        fields = contract.param_schema.fields

        # Required filter fields
        assert "date_from" in fields
        assert "date_to" in fields
        assert "district" in fields
        assert "bedroom" in fields
        assert "segment" in fields
        assert "sale_type" in fields
        assert "tenure" in fields
        assert "psf_min" in fields
        assert "psf_max" in fields

    def test_param_schema_has_option_fields(self):
        """Param schema should have option fields."""
        contract = get_contract("dashboard")
        fields = contract.param_schema.fields

        assert "panels" in fields
        assert "time_grain" in fields
        assert "location_grain" in fields
        assert "histogram_bins" in fields
        assert "skip_cache" in fields

    def test_param_schema_has_aliases(self):
        """Param schema should have camelCase aliases."""
        contract = get_contract("dashboard")
        aliases = contract.param_schema.aliases

        assert aliases.get("saleType") == "sale_type"
        assert aliases.get("dateFrom") == "date_from"
        assert aliases.get("dateTo") == "date_to"
        assert aliases.get("timeGrain") == "time_grain"
        assert aliases.get("locationGrain") == "location_grain"

    def test_response_schema_has_required_meta(self):
        """Response schema should require key meta fields."""
        contract = get_contract("dashboard")
        required = contract.response_schema.required_meta

        assert "requestId" in required
        assert "elapsedMs" in required
        assert "apiVersion" in required


class TestDashboardValidation:
    """Test param validation for dashboard."""

    def test_validate_valid_segment(self):
        """Valid segment should pass validation."""
        contract = get_contract("dashboard")
        params = {"segment": "CCR"}
        # Should not raise
        validate_public_params(params, contract.param_schema)

    def test_validate_invalid_segment(self):
        """Invalid segment should fail validation."""
        contract = get_contract("dashboard")
        params = {"segment": "INVALID"}

        with pytest.raises(ContractViolation) as exc_info:
            validate_public_params(params, contract.param_schema)

        # Check that error details mention the invalid value
        assert exc_info.value.details["violations"][0]["received"] == "INVALID"

    def test_validate_valid_time_grain(self):
        """Valid time_grain should pass."""
        contract = get_contract("dashboard")
        params = {"time_grain": "quarter"}
        validate_public_params(params, contract.param_schema)

    def test_validate_invalid_time_grain(self):
        """Invalid time_grain should fail."""
        contract = get_contract("dashboard")
        params = {"time_grain": "week"}

        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)


class TestDashboardNormalization:
    """Test param normalization for dashboard."""

    def test_normalize_district_to_districts(self):
        """district param should normalize to districts list."""
        contract = get_contract("dashboard")
        raw = {"district": "D09,D10"}
        normalized = normalize_params(raw, contract.param_schema)

        assert "districts" in normalized
        assert "D09" in normalized["districts"]
        assert "D10" in normalized["districts"]
        assert "district" not in normalized

    def test_normalize_bedroom_to_bedrooms(self):
        """bedroom param should normalize to bedrooms (singular to plural)."""
        contract = get_contract("dashboard")
        # Note: Comma-splitting is done by route handler's to_list()
        # Contract normalizer only handles singular→plural rename
        raw = {"bedroom": [2, 3, 4]}  # Pre-parsed list
        normalized = normalize_params(raw, contract.param_schema)

        assert "bedrooms" in normalized
        assert 2 in normalized["bedrooms"]
        assert 3 in normalized["bedrooms"]
        assert "bedroom" not in normalized

    def test_normalize_segment_to_segments(self):
        """segment param should normalize to segments list."""
        contract = get_contract("dashboard")
        raw = {"segment": "CCR"}
        normalized = normalize_params(raw, contract.param_schema)

        assert "segments" in normalized
        assert "CCR" in normalized["segments"]
        assert "segment" not in normalized

    def test_normalize_panels_string_to_list(self):
        """panels param should normalize from comma-separated string to list."""
        contract = get_contract("dashboard")
        raw = {"panels": "time_series,beads_chart"}
        normalized = normalize_params(raw, contract.param_schema)

        assert "panels" in normalized
        assert isinstance(normalized["panels"], list)
        assert "time_series" in normalized["panels"]
        assert "beads_chart" in normalized["panels"]

    def test_normalize_single_panel_to_list(self):
        """Single panel value should normalize to list with one element."""
        contract = get_contract("dashboard")
        raw = {"panels": "beads_chart"}
        normalized = normalize_params(raw, contract.param_schema)

        assert "panels" in normalized
        assert isinstance(normalized["panels"], list)
        assert normalized["panels"] == ["beads_chart"]


class TestDashboardSnapshots:
    """Test response schema matches snapshots."""

    def test_response_schema_matches_snapshot(self):
        """Response schema structure should match snapshot."""
        contract = get_contract("dashboard")

        # Load snapshot
        snapshot_path = SNAPSHOT_DIR / "dashboard_response_schema.json"
        if snapshot_path.exists():
            snapshot = json.loads(snapshot_path.read_text())

            # Verify required meta fields match
            for field in snapshot.get("required_meta", []):
                assert field in contract.response_schema.required_meta

            # Verify version matches
            assert contract.version == snapshot.get("_version")
