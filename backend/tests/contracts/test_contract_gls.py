"""
Contract tests for /gls endpoints.

Tests:
- Contract registration
- Param schema validation
- Response schema requirements
"""

import pytest


class TestGlsUpcomingContract:
    """Tests for gls/upcoming contract."""

    def test_contract_registered(self, contract_registry):
        """Contract should be registered on import."""
        assert "gls/upcoming" in contract_registry
        contract = contract_registry["gls/upcoming"]
        assert contract.version == "v3"
        assert contract.endpoint == "gls/upcoming"

    def test_param_schema_has_filter_fields(self, contract_registry):
        """ParamSchema should define filter fields."""
        contract = contract_registry["gls/upcoming"]
        fields = contract.param_schema.fields

        assert "market_segment" in fields
        assert "planning_area" in fields
        assert "limit" in fields

    def test_market_segment_allowed_values(self, contract_registry):
        """market_segment should only allow CCR, RCR, OCR."""
        contract = contract_registry["gls/upcoming"]
        field = contract.param_schema.fields["market_segment"]

        assert field.allowed_values == ["CCR", "RCR", "OCR"]

    def test_validate_invalid_market_segment(self, contract_registry):
        """Invalid market_segment should fail validation."""
        from api.contracts.validate import validate_public_params, ContractViolation

        contract = contract_registry["gls/upcoming"]
        params = {"market_segment": "INVALID"}

        with pytest.raises(ContractViolation):
            validate_public_params(params, contract.param_schema)


class TestGlsAwardedContract:
    """Tests for gls/awarded contract."""

    def test_contract_registered(self, contract_registry):
        """Contract should be registered on import."""
        assert "gls/awarded" in contract_registry
        contract = contract_registry["gls/awarded"]
        assert contract.version == "v3"

    def test_param_schema_same_as_upcoming(self, contract_registry):
        """awarded should have same params as upcoming."""
        contract = contract_registry["gls/awarded"]
        fields = contract.param_schema.fields

        assert "market_segment" in fields
        assert "planning_area" in fields
        assert "limit" in fields


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


class TestGlsSupplyPipelineContract:
    """Tests for gls/supply-pipeline contract."""

    def test_contract_registered(self, contract_registry):
        """Contract should be registered on import."""
        assert "gls/supply-pipeline" in contract_registry
        contract = contract_registry["gls/supply-pipeline"]
        assert contract.version == "v3"

    def test_param_schema_has_market_segment(self, contract_registry):
        """ParamSchema should have market_segment filter."""
        contract = contract_registry["gls/supply-pipeline"]
        fields = contract.param_schema.fields

        assert "market_segment" in fields


class TestGlsPriceFloorContract:
    """Tests for gls/price-floor contract."""

    def test_contract_registered(self, contract_registry):
        """Contract should be registered on import."""
        assert "gls/price-floor" in contract_registry
        contract = contract_registry["gls/price-floor"]
        assert contract.version == "v3"

    def test_param_schema_has_market_segment(self, contract_registry):
        """ParamSchema should have market_segment filter."""
        contract = contract_registry["gls/price-floor"]
        fields = contract.param_schema.fields

        assert "market_segment" in fields


class TestGlsTenderDetailContract:
    """Tests for gls/tender contract."""

    def test_contract_registered(self, contract_registry):
        """Contract should be registered on import."""
        assert "gls/tender" in contract_registry
        contract = contract_registry["gls/tender"]
        assert contract.version == "v3"

    def test_no_query_params(self, contract_registry):
        """release_id is a path param, no query params."""
        contract = contract_registry["gls/tender"]
        fields = contract.param_schema.fields

        assert len(fields) == 0


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


class TestGlsStatsContract:
    """Tests for gls/stats contract."""

    def test_contract_registered(self, contract_registry):
        """Contract should be registered on import."""
        assert "gls/stats" in contract_registry
        contract = contract_registry["gls/stats"]
        assert contract.version == "v3"

    def test_response_has_summary_fields(self, contract_registry):
        """ResponseSchema should include summary fields."""
        contract = contract_registry["gls/stats"]
        data_fields = contract.response_schema.data_fields

        assert "status_summary" in data_fields
        assert "by_region" in data_fields
        assert "date_range" in data_fields
        assert "total_tenders" in data_fields
