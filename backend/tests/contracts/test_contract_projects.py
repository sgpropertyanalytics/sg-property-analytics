"""
Contract tests for /projects endpoints.
"""

import pytest
from api.contracts import get_contract
from api.contracts.validate import validate_public_params, ContractViolation


class TestProjectsLocationsContract:
    """Test projects/locations contract."""

    def test_contract_registered(self):
        contract = get_contract("projects/locations")
        assert contract is not None
        assert contract.version == "v3"

    def test_validate_segment(self):
        contract = get_contract("projects/locations")
        params = {"segment": "CCR"}
        validate_public_params(params, contract.param_schema)

    def test_validate_invalid_segment(self):
        contract = get_contract("projects/locations")
        params = {"segment": "INVALID"}
        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)


class TestProjectsHotContract:
    """Test projects/hot contract."""

    def test_contract_registered(self):
        contract = get_contract("projects/hot")
        assert contract is not None
        assert contract.version == "v3"

    def test_validate_segment(self):
        contract = get_contract("projects/hot")
        params = {"market_segment": "CCR"}
        validate_public_params(params, contract.param_schema)

    def test_validate_invalid_segment(self):
        contract = get_contract("projects/hot")
        params = {"market_segment": "INVALID"}
        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)


class TestProjectsInventoryStatusContract:
    """Test projects/inventory-status contract."""

    def test_contract_registered(self):
        contract = get_contract("projects/inventory-status")
        assert contract is not None
        assert contract.version == "v3"
