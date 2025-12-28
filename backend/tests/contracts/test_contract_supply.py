"""
Contract tests for /supply/* endpoints.
"""

import pytest
import json
from pathlib import Path

# Import contract components
from api.contracts.schemas import supply
from api.contracts import get_contract
from api.contracts.validate import validate_public_params, ContractViolation


SNAPSHOT_DIR = Path(__file__).parent / "snapshots"


class TestSupplySummaryContractSchema:
    """Test supply/summary contract."""

    def test_supply_summary_contract_registered(self):
        """Supply summary contract should be registered."""
        contract = get_contract("supply/summary")
        assert contract is not None
        assert contract.endpoint == "supply/summary"
        assert contract.version == "v3"

    def test_param_schema_has_fields(self):
        """Param schema should have expected fields."""
        contract = get_contract("supply/summary")
        fields = contract.param_schema.fields

        assert "includeGls" in fields
        assert "launchYear" in fields

    def test_param_schema_include_gls_default(self):
        """includeGls should default to True."""
        contract = get_contract("supply/summary")
        include_gls_field = contract.param_schema.fields["includeGls"]

        assert include_gls_field.default is True
        assert include_gls_field.type == bool

    def test_param_schema_launch_year_default(self):
        """launchYear should default to 2026."""
        contract = get_contract("supply/summary")
        launch_year_field = contract.param_schema.fields["launchYear"]

        assert launch_year_field.default == 2026
        assert launch_year_field.type == int

    def test_param_schema_aliases(self):
        """Aliases should map snake_case to camelCase."""
        contract = get_contract("supply/summary")
        aliases = contract.param_schema.aliases

        assert aliases.get("include_gls") == "includeGls"
        assert aliases.get("launch_year") == "launchYear"

    def test_response_schema_has_required_meta(self):
        """Response schema should require key meta fields."""
        contract = get_contract("supply/summary")
        required = contract.response_schema.required_meta

        assert "requestId" in required
        assert "elapsedMs" in required
        assert "apiVersion" in required


class TestSupplySummaryValidation:
    """Test param validation for supply/summary."""

    def test_validate_empty_params(self):
        """Empty params should pass (all have defaults)."""
        contract = get_contract("supply/summary")
        params = {}
        validate_public_params(params, contract.param_schema)

    def test_validate_include_gls_true(self):
        """includeGls=true should pass."""
        contract = get_contract("supply/summary")
        params = {"includeGls": "true"}
        validate_public_params(params, contract.param_schema)

    def test_validate_include_gls_false(self):
        """includeGls=false should pass."""
        contract = get_contract("supply/summary")
        params = {"includeGls": "false"}
        validate_public_params(params, contract.param_schema)

    def test_validate_launch_year(self):
        """Valid launchYear should pass."""
        contract = get_contract("supply/summary")
        params = {"launchYear": "2025"}
        validate_public_params(params, contract.param_schema)

    def test_validate_both_params(self):
        """Both params together should pass."""
        contract = get_contract("supply/summary")
        params = {"includeGls": "false", "launchYear": "2027"}
        validate_public_params(params, contract.param_schema)


class TestSupplySnapshots:
    """Test response schemas match snapshots."""

    def test_schemas_match_snapshot(self):
        """Supply schemas should match snapshot."""
        snapshot_path = SNAPSHOT_DIR / "supply_response_schema.json"
        if snapshot_path.exists():
            snapshot = json.loads(snapshot_path.read_text())

            # Verify version
            assert snapshot.get("_version") == "v3"

            # Verify supply_summary meta
            contract = get_contract("supply/summary")
            for field in snapshot["supply_summary"]["required_meta"]:
                assert field in contract.response_schema.required_meta
