"""
Contract tests for upcoming launches endpoints.
"""

import pytest
from api.contracts import get_contract
from api.contracts.validate import validate_public_params, ContractViolation


class TestUpcomingAllContract:
    """Test upcoming-launches/all contract."""

    def test_contract_registered(self):
        contract = get_contract("upcoming-launches/all")
        assert contract is not None
        assert contract.version == "v3"

    def test_param_schema_market_segment(self):
        contract = get_contract("upcoming-launches/all")
        segment_field = contract.param_schema.fields["market_segment"]
        assert "CCR" in segment_field.allowed_values
        assert "RCR" in segment_field.allowed_values
        assert "OCR" in segment_field.allowed_values

    def test_param_schema_order(self):
        contract = get_contract("upcoming-launches/all")
        order_field = contract.param_schema.fields["order"]
        assert "asc" in order_field.allowed_values
        assert "desc" in order_field.allowed_values
        assert order_field.default == "asc"

    def test_param_schema_defaults(self):
        contract = get_contract("upcoming-launches/all")
        assert contract.param_schema.fields["limit"].default == 100
        assert contract.param_schema.fields["sort"].default == "project_name"

    def test_validate_invalid_market_segment(self):
        contract = get_contract("upcoming-launches/all")
        params = {"market_segment": "INVALID"}
        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)

    def test_validate_invalid_order(self):
        contract = get_contract("upcoming-launches/all")
        params = {"order": "random"}
        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)


class TestUpcomingProjectContract:
    """Test upcoming-launches/project contract."""

    def test_contract_registered(self):
        contract = get_contract("upcoming-launches/project")
        assert contract is not None
        assert contract.version == "v3"

    def test_no_required_params(self):
        contract = get_contract("upcoming-launches/project")
        params = {}
        validate_public_params(params, contract.param_schema)


class TestUpcomingNeedsReviewContract:
    """Test upcoming-launches/needs-review contract."""

    def test_contract_registered(self):
        contract = get_contract("upcoming-launches/needs-review")
        assert contract is not None
        assert contract.version == "v3"

    def test_no_required_params(self):
        contract = get_contract("upcoming-launches/needs-review")
        params = {}
        validate_public_params(params, contract.param_schema)
