"""
Contract tests for precomputed endpoints.
"""

import pytest
import json
from pathlib import Path

from api.contracts.schemas import precomputed
from api.contracts import get_contract
from api.contracts.validate import validate_public_params, ContractViolation


SNAPSHOT_DIR = Path(__file__).parent / "snapshots"


class TestResaleStatsContract:
    """Test precomputed/resale-stats contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("precomputed/resale-stats")
        assert contract is not None
        assert contract.version == "v3"

    def test_validate_segment(self):
        """Valid segment should pass."""
        contract = get_contract("precomputed/resale-stats")
        params = {"segment": "RCR"}
        validate_public_params(params, contract.param_schema)

    def test_validate_invalid_segment(self):
        """Invalid segment should fail."""
        contract = get_contract("precomputed/resale-stats")
        params = {"segment": "INVALID"}
        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)


class TestPriceTrendsContract:
    """Test precomputed/price-trends contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("precomputed/price-trends")
        assert contract is not None
        assert contract.version == "v3"

    def test_no_required_params(self):
        """No params should be required."""
        contract = get_contract("precomputed/price-trends")
        params = {}
        validate_public_params(params, contract.param_schema)


class TestTotalVolumeContract:
    """Test precomputed/total-volume contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("precomputed/total-volume")
        assert contract is not None
        assert contract.version == "v3"


class TestAvgPsfContract:
    """Test precomputed/avg-psf contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("precomputed/avg-psf")
        assert contract is not None
        assert contract.version == "v3"


class TestDistrictsContract:
    """Test precomputed/districts contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("precomputed/districts")
        assert contract is not None
        assert contract.version == "v3"


class TestMarketStatsContract:
    """Test precomputed/market-stats contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("precomputed/market-stats")
        assert contract is not None
        assert contract.version == "v3"

    def test_param_schema_defaults(self):
        """Check default values."""
        contract = get_contract("precomputed/market-stats")
        assert contract.param_schema.fields["short_months"].default == 3
        assert contract.param_schema.fields["long_months"].default == 15

    def test_validate_segment(self):
        """Valid segment should pass."""
        contract = get_contract("precomputed/market-stats")
        params = {"segment": "OCR"}
        validate_public_params(params, contract.param_schema)


class TestPrecomputedSnapshots:
    """Test schemas match snapshots."""

    def test_schemas_match_snapshot(self):
        """All precomputed schemas should match snapshot."""
        snapshot_path = SNAPSHOT_DIR / "precomputed_response_schema.json"
        if snapshot_path.exists():
            snapshot = json.loads(snapshot_path.read_text())
            assert snapshot.get("_version") == "v3"

            endpoints = [
                ("precomputed/resale-stats", "resale_stats"),
                ("precomputed/price-trends", "price_trends"),
                ("precomputed/total-volume", "total_volume"),
                ("precomputed/avg-psf", "avg_psf"),
                ("precomputed/districts", "districts"),
                ("precomputed/market-stats", "market_stats"),
            ]
            for contract_name, snapshot_key in endpoints:
                contract = get_contract(contract_name)
                for field in snapshot[snapshot_key]["required_meta"]:
                    assert field in contract.response_schema.required_meta
