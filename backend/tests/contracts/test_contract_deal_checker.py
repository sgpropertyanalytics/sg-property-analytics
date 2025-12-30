"""
Contract tests for deal checker endpoints.
"""

import pytest
import json
from pathlib import Path

from api.contracts.schemas import deal_checker
from api.contracts import get_contract
from api.contracts.validate import validate_public_params, ContractViolation


SNAPSHOT_DIR = Path(__file__).parent / "snapshots"


class TestMultiScopeContract:
    """Test deal-checker/multi-scope contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("deal-checker/multi-scope")
        assert contract is not None
        assert contract.version == "v3"

    def test_required_params(self):
        """Required params should be enforced."""
        contract = get_contract("deal-checker/multi-scope")
        project_name_field = contract.param_schema.fields["project_name"]
        bedroom_field = contract.param_schema.fields["bedroom"]
        price_field = contract.param_schema.fields["price"]
        assert project_name_field.required is True
        assert bedroom_field.required is True
        assert price_field.required is True

    def test_validate_missing_required(self):
        """Missing required params should fail."""
        contract = get_contract("deal-checker/multi-scope")
        params = {"bedroom": 3, "price": 1500000}  # Missing project_name
        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)


class TestProjectNamesContract:
    """Test deal-checker/project-names contract."""

    def test_contract_registered(self):
        """Contract should be registered."""
        contract = get_contract("deal-checker/project-names")
        assert contract is not None
        assert contract.version == "v3"

    def test_no_required_params(self):
        """No params should be required."""
        contract = get_contract("deal-checker/project-names")
        params = {}
        validate_public_params(params, contract.param_schema)


class TestDealCheckerSnapshots:
    """Test schemas match snapshots."""

    def test_schemas_match_snapshot(self):
        """All deal checker schemas should match snapshot."""
        snapshot_path = SNAPSHOT_DIR / "deal_checker_response_schema.json"
        if snapshot_path.exists():
            snapshot = json.loads(snapshot_path.read_text())
            assert snapshot.get("_version") == "v3"

            endpoints = [
                ("deal-checker/multi-scope", "multi_scope"),
                ("deal-checker/project-names", "project_names"),
            ]
            for contract_name, snapshot_key in endpoints:
                contract = get_contract(contract_name)
                for field in snapshot[snapshot_key]["required_meta"]:
                    assert field in contract.response_schema.required_meta
