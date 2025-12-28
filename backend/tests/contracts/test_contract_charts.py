"""
Contract tests for chart endpoints.
"""

import pytest
import json
from pathlib import Path

from api.contracts.schemas import charts
from api.contracts import get_contract
from api.contracts.validate import validate_public_params, ContractViolation


SNAPSHOT_DIR = Path(__file__).parent / "snapshots"


class TestProjectsByDistrictContract:
    """Test charts/projects-by-district contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("charts/projects-by-district")
        assert contract is not None
        assert contract.endpoint == "charts/projects-by-district"
        assert contract.version == "v3"

    def test_param_schema_district_required(self):
        """District should be required."""
        contract = get_contract("charts/projects-by-district")
        district_field = contract.param_schema.fields["district"]
        assert district_field.required is True

    def test_validate_missing_district(self):
        """Missing district should fail."""
        contract = get_contract("charts/projects-by-district")
        params = {"bedroom": "2,3"}
        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)


class TestPriceProjectsByDistrictContract:
    """Test charts/price-projects-by-district contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("charts/price-projects-by-district")
        assert contract is not None
        assert contract.version == "v3"

    def test_param_schema_defaults(self):
        """Check default values."""
        contract = get_contract("charts/price-projects-by-district")
        assert contract.param_schema.fields["bedroom"].default == "2,3,4"
        assert contract.param_schema.fields["months"].default == 15


class TestFloorLiquidityHeatmapContract:
    """Test charts/floor-liquidity-heatmap contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("charts/floor-liquidity-heatmap")
        assert contract is not None
        assert contract.version == "v3"

    def test_param_schema_window_months(self):
        """Window months should have allowed values."""
        contract = get_contract("charts/floor-liquidity-heatmap")
        window_field = contract.param_schema.fields["window_months"]
        assert window_field.default == 12
        assert 6 in window_field.allowed_values
        assert 12 in window_field.allowed_values
        assert 24 in window_field.allowed_values


class TestPsfByPriceBandContract:
    """Test charts/psf-by-price-band contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("charts/psf-by-price-band")
        assert contract is not None
        assert contract.version == "v3"

    def test_param_schema_aliases(self):
        """Check aliases."""
        contract = get_contract("charts/psf-by-price-band")
        assert contract.param_schema.aliases.get("segment") == "region"
        assert contract.param_schema.aliases.get("saleType") == "sale_type"


class TestBudgetHeatmapContract:
    """Test charts/budget-heatmap contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("charts/budget-heatmap")
        assert contract is not None
        assert contract.version == "v3"

    def test_param_schema_budget_required(self):
        """Budget should be required."""
        contract = get_contract("charts/budget-heatmap")
        budget_field = contract.param_schema.fields["budget"]
        assert budget_field.required is True

    def test_validate_missing_budget(self):
        """Missing budget should fail."""
        contract = get_contract("charts/budget-heatmap")
        params = {"tolerance": "100000"}
        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)


class TestChartsSnapshots:
    """Test schemas match snapshots."""

    def test_schemas_match_snapshot(self):
        """All chart schemas should match snapshot."""
        snapshot_path = SNAPSHOT_DIR / "charts_response_schema.json"
        if snapshot_path.exists():
            snapshot = json.loads(snapshot_path.read_text())
            assert snapshot.get("_version") == "v3"

            # Verify each endpoint has required meta
            endpoints = [
                ("charts/projects-by-district", "projects_by_district"),
                ("charts/price-projects-by-district", "price_projects_by_district"),
                ("charts/floor-liquidity-heatmap", "floor_liquidity_heatmap"),
                ("charts/psf-by-price-band", "psf_by_price_band"),
                ("charts/budget-heatmap", "budget_heatmap"),
            ]
            for contract_name, snapshot_key in endpoints:
                contract = get_contract(contract_name)
                for field in snapshot[snapshot_key]["required_meta"]:
                    assert field in contract.response_schema.required_meta
