"""
Contract tests for project analytics endpoints.
"""

import json
import pytest
from pathlib import Path

from api.contracts.schemas import projects_analytics
from api.contracts import get_contract
from api.contracts.validate import validate_public_params, ContractViolation


SNAPSHOT_DIR = Path(__file__).parent / "snapshots"


class TestProjectInventoryContract:
    """Test projects/inventory contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("projects/inventory")
        assert contract is not None
        assert contract.version == "v3"

    def test_no_required_params(self):
        """project_name should be required from URL path."""
        contract = get_contract("projects/inventory")
        params = {}
        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)
        assert contract.param_schema.fields["project_name"].required is True


class TestProjectPriceBandsContract:
    """Test projects/price-bands contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("projects/price-bands")
        assert contract is not None
        assert contract.version == "v3"

    def test_param_schema_defaults(self):
        """Check default values."""
        contract = get_contract("projects/price-bands")
        assert contract.param_schema.fields["window_months"].default == 24


class TestResaleProjectsContract:
    """Test projects/resale-projects contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("projects/resale-projects")
        assert contract is not None
        assert contract.version == "v3"

    def test_no_required_params(self):
        """No params should be required."""
        contract = get_contract("projects/resale-projects")
        params = {}
        validate_public_params(params, contract.param_schema)


class TestProjectExitQueueContract:
    """Test projects/exit-queue contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("projects/exit-queue")
        assert contract is not None
        assert contract.version == "v3"

    def test_no_required_params(self):
        """project_name should be required from URL path."""
        contract = get_contract("projects/exit-queue")
        params = {}
        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)
        assert contract.param_schema.fields["project_name"].required is True


class TestProjectsAnalyticsSnapshots:
    """Test schemas match snapshots."""

    def test_schemas_match_snapshot(self):
        """All project analytics schemas should match snapshot."""
        snapshot_path = SNAPSHOT_DIR / "projects_analytics_response_schema.json"
        if snapshot_path.exists():
            snapshot = json.loads(snapshot_path.read_text())
            assert snapshot.get("_version") == "v3"

            endpoints = [
                ("projects/inventory", "inventory"),
                ("projects/price-bands", "price_bands"),
                ("projects/resale-projects", "resale_projects"),
                ("projects/exit-queue", "exit_queue"),
            ]
            for contract_name, snapshot_key in endpoints:
                contract = get_contract(contract_name)
                for field in snapshot[snapshot_key]["required_meta"]:
                    assert field in contract.response_schema.required_meta
