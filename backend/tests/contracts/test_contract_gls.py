"""
Contract tests for /gls endpoints.
"""


class TestGlsAllContract:
    """Tests for gls/all contract."""

    def test_contract_registered(self, contract_registry):
        """Contract should be registered on import."""
        assert "gls/all" in contract_registry
        contract = contract_registry["gls/all"]
        assert contract.version == "v3"

    def test_param_schema_has_status_filter(self, contract_registry):
        """ParamSchema should include status filter."""
        contract = contract_registry["gls/all"]
        fields = contract.param_schema.fields

        assert "status" in fields
        assert fields["status"].allowed_values == ["launched", "awarded"]

    def test_param_schema_has_sort_options(self, contract_registry):
        """ParamSchema should include sort options."""
        contract = contract_registry["gls/all"]
        fields = contract.param_schema.fields

        assert "sort" in fields
        assert "order" in fields
        assert fields["order"].allowed_values == ["asc", "desc"]

    def test_response_has_summary(self, contract_registry):
        """ResponseSchema should include summary field."""
        contract = contract_registry["gls/all"]
        data_fields = contract.response_schema.data_fields

        assert "count" in data_fields
        assert "summary" in data_fields
        assert "data" in data_fields


class TestGlsNeedsReviewContract:
    """Tests for gls/needs-review contract."""

    def test_contract_registered(self, contract_registry):
        """Contract should be registered on import."""
        assert "gls/needs-review" in contract_registry
        contract = contract_registry["gls/needs-review"]
        assert contract.version == "v3"

    def test_response_has_count_and_data(self, contract_registry):
        """ResponseSchema should include count and data."""
        contract = contract_registry["gls/needs-review"]
        data_fields = contract.response_schema.data_fields

        assert "count" in data_fields
        assert "data" in data_fields
