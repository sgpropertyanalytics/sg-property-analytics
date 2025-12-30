"""
Contract tests for trend endpoints.
"""

import pytest
from api.contracts import get_contract
from api.contracts.validate import validate_public_params, ContractViolation


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
        time_grain_field = contract.param_schema.fields["time_grain"]
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
