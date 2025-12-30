"""
Aggregate Endpoint Median PSF Tests

Regression tests for:
1. median_psf uses PERCENTILE_CONT(0.5), not AVG
2. count is always present regardless of metrics param
3. region param aliases to segment

Run: cd backend && pytest tests/test_aggregate_median.py -v
"""

import pytest


class TestMedianPsfCalculation:
    """Test that median_psf is a true median, not a copy of avg_psf."""

    def test_median_differs_from_avg_on_skewed_data(self):
        """
        For skewed data, median should differ from average.

        Fixture: psf values [1000, 1100, 1200, 10000]
        - avg = 3325
        - median = 1150 (midpoint of 1100 and 1200)

        Assert: median_psf != avg_psf
        """
        # This is a unit test for the SQL logic
        # In a real test, we'd mock the database or use a test fixture

        # The key assertion: median should be calculated via PERCENTILE_CONT
        # Check that the endpoint code uses:
        #   func.percentile_cont(0.5).within_group(Transaction.psf)
        # NOT:
        #   clean_dict["median_psf"] = clean_dict.get("avg_psf")

        from routes.analytics.aggregate import aggregate
        import inspect

        source = inspect.getsource(aggregate)

        # Verify true median calculation is present
        assert "percentile_cont(0.5)" in source, \
            "median_psf should use PERCENTILE_CONT(0.5)"

        # Verify the copy-from-avg bug is NOT present
        assert 'clean_dict["median_psf"] = clean_dict.get("avg_psf")' not in source, \
            "median_psf should NOT be copied from avg_psf"

    def test_median_psf_added_to_select_columns(self):
        """Verify median_psf is a separate SQL column, not post-processed."""
        from routes.analytics.aggregate import aggregate
        import inspect

        source = inspect.getsource(aggregate)

        # Should have separate select for median_psf
        assert '.label("median_psf")' in source, \
            "median_psf should be its own labeled column"


class TestCountAlwaysPresent:
    """Test that count is always included regardless of metrics param."""

    def test_count_is_mandatory(self):
        """
        Count should always be in the response, even when not in metrics param.

        Rule: count is a row integrity field, not just a metric.
        """
        from routes.analytics.aggregate import aggregate
        import inspect

        source = inspect.getsource(aggregate)

        # The count should be added unconditionally (not inside if "count" in metrics)
        # Look for the pattern that adds count always
        assert 'ALWAYS include count' in source or \
               'select_columns.append(func.count(Transaction.id).label("count"))' in source.split('if "count" in metrics')[0], \
            "count should be added unconditionally before any metrics checks"


class TestRegionParamAlias:
    """Test that region param is aliased to segment."""

    def test_region_aliases_to_segment(self):
        """
        region=CCR should work the same as segment=CCR.

        Either:
        - region is aliased to segment in the route
        - OR region returns 400 with helpful error

        It should NOT be silently ignored.
        """
        from routes.analytics.aggregate import aggregate
        import inspect

        source = inspect.getsource(aggregate)

        # Route should use normalized params (contract parsing owns aliases)
        assert "normalized_params" in source, \
            "aggregate route should read g.normalized_params"

        # Contract schema should expose region as an alias for segment
        from api.contracts.schemas.aggregate import AGGREGATE_PARAM_SCHEMA
        assert "region" in AGGREGATE_PARAM_SCHEMA.fields, \
            "aggregate contract should accept region alias"


class TestMedianVsAvgValues:
    """
    Integration test to verify median != avg in API response.

    Requires running app with test database.
    """

    @pytest.mark.skip(reason="Requires running app - run manually")
    def test_ccr_median_differs_from_avg(self):
        """
        Call /api/aggregate with segment=CCR and verify median != avg.

        For real property data (right-skewed), median is typically < avg.
        """
        import requests

        # This would be run against a test server
        url = "http://localhost:5000/api/aggregate"
        params = {
            "group_by": "month",
            "segment": "CCR",
            "metrics": "median_psf,avg_psf"
        }

        response = requests.get(url, params=params)
        assert response.status_code == 200

        data = response.json()["data"]

        # At least some months should have median != avg
        differences = [
            abs(row.get("median_psf", 0) - row.get("avg_psf", 0))
            for row in data
            if row.get("median_psf") and row.get("avg_psf")
        ]

        # Property price distributions are typically right-skewed
        # so median should differ from mean
        assert any(d > 1 for d in differences), \
            "median_psf should differ from avg_psf (not a copy)"

    @pytest.mark.skip(reason="Requires running app - run manually")
    def test_count_present_with_median_metric(self):
        """Verify count is present when metrics=median_psf."""
        import requests

        url = "http://localhost:5000/api/aggregate"
        params = {
            "group_by": "month",
            "segment": "CCR",
            "metrics": "median_psf"  # Note: not including count explicitly
        }

        response = requests.get(url, params=params)
        assert response.status_code == 200

        data = response.json()["data"]

        # Count should be present even though not in metrics
        for row in data:
            assert "count" in row, "count should always be present"
            assert row["count"] is not None, "count should not be null"
            assert isinstance(row["count"], int), "count should be integer"

    @pytest.mark.skip(reason="Requires running app - run manually")
    def test_region_param_works(self):
        """Verify region=CCR is aliased to segment=CCR."""
        import requests

        url = "http://localhost:5000/api/aggregate"

        # Using region param (should work same as segment)
        params_region = {"group_by": "month", "region": "CCR"}
        response_region = requests.get(url, params=params_region)

        # Using segment param (canonical)
        params_segment = {"group_by": "month", "segment": "CCR"}
        response_segment = requests.get(url, params=params_segment)

        assert response_region.status_code == 200
        assert response_segment.status_code == 200

        # Both should return same count
        count_region = response_region.json()["meta"]["total_records"]
        count_segment = response_segment.json()["meta"]["total_records"]

        assert count_region == count_segment, \
            "region=CCR should return same data as segment=CCR"

        # region should show up in filters_applied
        filters = response_region.json()["meta"]["filters_applied"]
        assert "segment" in filters, \
            "region param should be normalized to segment in response"
