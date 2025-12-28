"""
Contract tests for trend endpoints.
"""

import pytest
import json
from pathlib import Path

from api.contracts.schemas import trends
from api.contracts import get_contract
from api.contracts.validate import validate_public_params, ContractViolation


SNAPSHOT_DIR = Path(__file__).parent / "snapshots"


class TestPriceTrendsByDistrictContract:
    """Test trends/price-trends-by-district contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("trends/price-trends-by-district")
        assert contract is not None
        assert contract.version == "v3"

    def test_no_required_params(self):
        """No params should be required."""
        contract = get_contract("trends/price-trends-by-district")
        params = {}
        validate_public_params(params, contract.param_schema)


class TestMarketStatsByDistrictContract:
    """Test trends/market-stats-by-district contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("trends/market-stats-by-district")
        assert contract is not None
        assert contract.version == "v3"

    def test_param_schema_defaults(self):
        """Check default values."""
        contract = get_contract("trends/market-stats-by-district")
        assert contract.param_schema.fields["bedroom"].default == "2,3,4"
        assert contract.param_schema.fields["short_months"].default == 3
        assert contract.param_schema.fields["long_months"].default == 15

    def test_validate_segment(self):
        """Valid segment should pass."""
        contract = get_contract("trends/market-stats-by-district")
        params = {"segment": "CCR"}
        validate_public_params(params, contract.param_schema)

    def test_validate_invalid_segment(self):
        """Invalid segment should fail."""
        contract = get_contract("trends/market-stats-by-district")
        params = {"segment": "INVALID"}
        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)


class TestSaleTypeTrendsContract:
    """Test trends/sale-type-trends contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("trends/sale-type-trends")
        assert contract is not None
        assert contract.version == "v3"


class TestPriceTrendsBySaleTypeContract:
    """Test trends/price-trends-by-sale-type contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("trends/price-trends-by-sale-type")
        assert contract is not None
        assert contract.version == "v3"


class TestPriceTrendsByRegionContract:
    """Test trends/price-trends-by-region contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("trends/price-trends-by-region")
        assert contract is not None
        assert contract.version == "v3"


class TestPsfTrendsByRegionContract:
    """Test trends/psf-trends-by-region contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("trends/psf-trends-by-region")
        assert contract is not None
        assert contract.version == "v3"


class TestNewVsResaleContract:
    """Test trends/new-vs-resale contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("trends/new-vs-resale")
        assert contract is not None
        assert contract.version == "v3"

    def test_param_schema_time_grain(self):
        """TimeGrain should have allowed values."""
        contract = get_contract("trends/new-vs-resale")
        time_grain_field = contract.param_schema.fields["timeGrain"]
        assert time_grain_field.default == "quarter"
        assert "year" in time_grain_field.allowed_values
        assert "quarter" in time_grain_field.allowed_values
        assert "month" in time_grain_field.allowed_values

    def test_validate_invalid_time_grain(self):
        """Invalid timeGrain should fail."""
        contract = get_contract("trends/new-vs-resale")
        params = {"timeGrain": "week"}
        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)


class TestTrendsSnapshots:
    """Test schemas match snapshots."""

    def test_schemas_match_snapshot(self):
        """All trend schemas should match snapshot."""
        snapshot_path = SNAPSHOT_DIR / "trends_response_schema.json"
        if snapshot_path.exists():
            snapshot = json.loads(snapshot_path.read_text())
            assert snapshot.get("_version") == "v3"

            endpoints = [
                ("trends/price-trends-by-district", "price_trends_by_district"),
                ("trends/market-stats-by-district", "market_stats_by_district"),
                ("trends/sale-type-trends", "sale_type_trends"),
                ("trends/price-trends-by-sale-type", "price_trends_by_sale_type"),
                ("trends/price-trends-by-region", "price_trends_by_region"),
                ("trends/psf-trends-by-region", "psf_trends_by_region"),
                ("trends/new-vs-resale", "new_vs_resale"),
            ]
            for contract_name, snapshot_key in endpoints:
                contract = get_contract(contract_name)
                for field in snapshot[snapshot_key]["required_meta"]:
                    assert field in contract.response_schema.required_meta
