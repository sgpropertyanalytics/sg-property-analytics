"""
Contract tests for /transactions/* endpoints.
"""

import pytest
import json
from pathlib import Path

# Import contract components
from api.contracts.schemas import transactions
from api.contracts import get_contract
from api.contracts.validate import validate_public_params, ContractViolation
from api.contracts.normalize import normalize_params


SNAPSHOT_DIR = Path(__file__).parent / "snapshots"


class TestPriceGrowthContractSchema:
    """Test transactions/price-growth contract registration and schema."""

    def test_price_growth_contract_registered(self):
        """Price growth contract should be registered."""
        contract = get_contract("transactions/price-growth")
        assert contract is not None
        assert contract.endpoint == "transactions/price-growth"
        assert contract.version == "v3"

    def test_param_schema_has_filter_fields(self):
        """Param schema should have all filter fields."""
        contract = get_contract("transactions/price-growth")
        fields = contract.param_schema.fields

        assert "project" in fields
        assert "bedroom" in fields
        assert "floor_level" in fields
        assert "district" in fields
        assert "sale_type" in fields
        assert "date_from" in fields
        assert "date_to" in fields

    def test_param_schema_has_pagination_fields(self):
        """Param schema should have pagination fields."""
        contract = get_contract("transactions/price-growth")
        fields = contract.param_schema.fields

        assert "page" in fields
        assert fields["page"].default == 1
        assert "per_page" in fields
        assert fields["per_page"].default == 50

    def test_param_schema_has_aliases(self):
        """Param schema should have camelCase aliases."""
        contract = get_contract("transactions/price-growth")
        aliases = contract.param_schema.aliases

        assert aliases.get("saleType") == "sale_type"
        assert aliases.get("dateFrom") == "date_from"
        assert aliases.get("floorLevel") == "floor_level"

    def test_response_schema_has_required_meta(self):
        """Response schema should require key meta fields."""
        contract = get_contract("transactions/price-growth")
        required = contract.response_schema.required_meta

        assert "requestId" in required
        assert "elapsedMs" in required
        assert "apiVersion" in required


class TestPriceGrowthValidation:
    """Test param validation for price-growth endpoint."""

    def test_validate_valid_floor_level(self):
        """Valid floor_level should pass."""
        contract = get_contract("transactions/price-growth")
        params = {"floor_level": "Mid"}
        validate_public_params(params, contract.param_schema)

    def test_validate_invalid_floor_level(self):
        """Invalid floor_level should fail."""
        contract = get_contract("transactions/price-growth")
        params = {"floor_level": "Super High"}

        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)

    def test_validate_empty_params(self):
        """Empty params should pass (all optional)."""
        contract = get_contract("transactions/price-growth")
        params = {}
        validate_public_params(params, contract.param_schema)


class TestSegmentsContractSchema:
    """Test transactions/price-growth/segments contract."""

    def test_segments_contract_registered(self):
        """Segments contract should be registered."""
        contract = get_contract("transactions/price-growth/segments")
        assert contract is not None
        assert contract.endpoint == "transactions/price-growth/segments"
        assert contract.version == "v3"

    def test_param_schema_has_filter_fields(self):
        """Param schema should have filter fields."""
        contract = get_contract("transactions/price-growth/segments")
        fields = contract.param_schema.fields

        assert "project" in fields
        assert "district" in fields
        assert "sale_type" in fields

    def test_response_schema_has_required_meta(self):
        """Response schema should require key meta fields."""
        contract = get_contract("transactions/price-growth/segments")
        required = contract.response_schema.required_meta

        assert "requestId" in required
        assert "elapsedMs" in required
        assert "apiVersion" in required


class TestTransactionsSnapshots:
    """Test response schemas match snapshots."""

    def test_price_growth_schema_matches_snapshot(self):
        """Price growth schema should match snapshot."""
        contract = get_contract("transactions/price-growth")

        snapshot_path = SNAPSHOT_DIR / "transactions_response_schema.json"
        if snapshot_path.exists():
            snapshot = json.loads(snapshot_path.read_text())
            pg_snapshot = snapshot.get("price_growth", {})

            for field in pg_snapshot.get("required_meta", []):
                assert field in contract.response_schema.required_meta

    def test_segments_schema_matches_snapshot(self):
        """Segments schema should match snapshot."""
        contract = get_contract("transactions/price-growth/segments")

        snapshot_path = SNAPSHOT_DIR / "transactions_response_schema.json"
        if snapshot_path.exists():
            snapshot = json.loads(snapshot_path.read_text())
            seg_snapshot = snapshot.get("segments", {})

            for field in seg_snapshot.get("required_meta", []):
                assert field in contract.response_schema.required_meta
