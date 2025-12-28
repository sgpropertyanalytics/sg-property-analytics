"""
Contract tests for upcoming launches endpoints.
"""

import pytest
import json
from pathlib import Path

from api.contracts.schemas import upcoming_launches
from api.contracts import get_contract
from api.contracts.validate import validate_public_params, ContractViolation


SNAPSHOT_DIR = Path(__file__).parent / "snapshots"


class TestUpcomingAllContract:
    """Test upcoming-launches/all contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("upcoming-launches/all")
        assert contract is not None
        assert contract.version == "v3"

    def test_param_schema_market_segment(self):
        """Market segment should have allowed values."""
        contract = get_contract("upcoming-launches/all")
        segment_field = contract.param_schema.fields["market_segment"]
        assert "CCR" in segment_field.allowed_values
        assert "RCR" in segment_field.allowed_values
        assert "OCR" in segment_field.allowed_values

    def test_param_schema_order(self):
        """Order should have allowed values."""
        contract = get_contract("upcoming-launches/all")
        order_field = contract.param_schema.fields["order"]
        assert "asc" in order_field.allowed_values
        assert "desc" in order_field.allowed_values
        assert order_field.default == "asc"

    def test_param_schema_defaults(self):
        """Check default values."""
        contract = get_contract("upcoming-launches/all")
        assert contract.param_schema.fields["limit"].default == 100
        assert contract.param_schema.fields["sort"].default == "project_name"

    def test_validate_invalid_market_segment(self):
        """Invalid market segment should fail."""
        contract = get_contract("upcoming-launches/all")
        params = {"market_segment": "INVALID"}
        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)

    def test_validate_invalid_order(self):
        """Invalid order should fail."""
        contract = get_contract("upcoming-launches/all")
        params = {"order": "random"}
        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)


class TestUpcomingBySegmentContract:
    """Test upcoming-launches/by-segment contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("upcoming-launches/by-segment")
        assert contract is not None
        assert contract.version == "v3"

    def test_param_schema_defaults(self):
        """Check default values."""
        contract = get_contract("upcoming-launches/by-segment")
        assert contract.param_schema.fields["launch_year"].default == 2026


class TestUpcomingSupplyPipelineContract:
    """Test upcoming-launches/supply-pipeline contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("upcoming-launches/supply-pipeline")
        assert contract is not None
        assert contract.version == "v3"

    def test_param_schema_market_segment(self):
        """Market segment should have allowed values."""
        contract = get_contract("upcoming-launches/supply-pipeline")
        segment_field = contract.param_schema.fields["market_segment"]
        assert "CCR" in segment_field.allowed_values
        assert "RCR" in segment_field.allowed_values
        assert "OCR" in segment_field.allowed_values

    def test_param_schema_defaults(self):
        """Check default values."""
        contract = get_contract("upcoming-launches/supply-pipeline")
        assert contract.param_schema.fields["launch_year"].default == 2026


class TestUpcomingProjectContract:
    """Test upcoming-launches/project contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("upcoming-launches/project")
        assert contract is not None
        assert contract.version == "v3"

    def test_no_required_params(self):
        """No params should be required (project_name from URL)."""
        contract = get_contract("upcoming-launches/project")
        params = {}
        validate_public_params(params, contract.param_schema)


class TestUpcomingStatsContract:
    """Test upcoming-launches/stats contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("upcoming-launches/stats")
        assert contract is not None
        assert contract.version == "v3"

    def test_no_required_params(self):
        """No params should be required."""
        contract = get_contract("upcoming-launches/stats")
        params = {}
        validate_public_params(params, contract.param_schema)


class TestUpcomingNeedsReviewContract:
    """Test upcoming-launches/needs-review contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("upcoming-launches/needs-review")
        assert contract is not None
        assert contract.version == "v3"

    def test_no_required_params(self):
        """No params should be required."""
        contract = get_contract("upcoming-launches/needs-review")
        params = {}
        validate_public_params(params, contract.param_schema)


class TestUpcomingLaunchesSnapshots:
    """Test schemas match snapshots."""

    def test_schemas_match_snapshot(self):
        """All upcoming launches schemas should match snapshot."""
        snapshot_path = SNAPSHOT_DIR / "upcoming_launches_response_schema.json"
        if snapshot_path.exists():
            snapshot = json.loads(snapshot_path.read_text())
            assert snapshot.get("_version") == "v3"

            endpoints = [
                ("upcoming-launches/all", "all"),
                ("upcoming-launches/by-segment", "by_segment"),
                ("upcoming-launches/supply-pipeline", "supply_pipeline"),
                ("upcoming-launches/project", "project"),
                ("upcoming-launches/stats", "stats"),
                ("upcoming-launches/needs-review", "needs_review"),
            ]
            for contract_name, snapshot_key in endpoints:
                contract = get_contract(contract_name)
                for field in snapshot[snapshot_key]["required_meta"]:
                    assert field in contract.response_schema.required_meta
