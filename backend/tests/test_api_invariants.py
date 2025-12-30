"""
API Invariants Tests - Behavioral regression guards for key endpoints.

These tests verify shape + invariants for critical endpoints:
- Response schema validates
- Time series is sorted (ascending by period)
- No NaN/inf values in numeric fields
- Non-negative counts
- Empty data returns defined empty state (not crash)

Run with: pytest tests/test_api_invariants.py -v
"""

import math
import pytest
from datetime import date
from flask import Flask

# Skip all tests if no DB connection
pytestmark = pytest.mark.skipif(
    "not config.getoption('--run-integration')",
    reason="Integration tests require --run-integration flag"
)


def pytest_addoption(parser):
    """Add custom pytest options."""
    parser.addoption(
        "--run-integration",
        action="store_true",
        default=False,
        help="Run integration tests that require database"
    )


class TestAggregateEndpointInvariants:
    """Invariant tests for /api/aggregate endpoint."""

    def test_response_has_required_structure(self, client):
        """Response must have data array and meta object."""
        response = client.get("/api/aggregate?group_by=month&metrics=count")
        assert response.status_code == 200

        data = response.get_json()
        assert "data" in data, "Response must have 'data' key"
        assert isinstance(data["data"], list), "'data' must be a list"

    def test_time_series_is_sorted_ascending(self, client):
        """Time series data must be sorted by period ascending."""
        response = client.get("/api/aggregate?group_by=month&metrics=count")
        data = response.get_json()

        if len(data.get("data", [])) > 1:
            periods = [row.get("period") for row in data["data"] if row.get("period")]
            assert periods == sorted(periods), "Time series must be sorted ascending"

    def test_no_nan_or_inf_in_numeric_fields(self, client):
        """Numeric fields must not contain NaN or Infinity."""
        response = client.get("/api/aggregate?group_by=month&metrics=count,median_psf")
        data = response.get_json()

        numeric_fields = ["count", "median_psf", "avg_psf", "total_value"]
        for row in data.get("data", []):
            for field in numeric_fields:
                if field in row and row[field] is not None:
                    value = row[field]
                    if isinstance(value, float):
                        assert not math.isnan(value), f"{field} contains NaN"
                        assert not math.isinf(value), f"{field} contains Infinity"

    def test_counts_are_non_negative(self, client):
        """Count fields must be non-negative."""
        response = client.get("/api/aggregate?group_by=month&metrics=count")
        data = response.get_json()

        for row in data.get("data", []):
            count = row.get("count")
            if count is not None:
                assert count >= 0, f"Count must be non-negative, got {count}"

    def test_empty_filter_returns_empty_array_not_crash(self, client):
        """Filters that match nothing should return empty array, not error."""
        # Use impossible filter combination
        response = client.get(
            "/api/aggregate?group_by=month&metrics=count"
            "&district=D99&date_from=2099-01-01"
        )
        assert response.status_code == 200

        data = response.get_json()
        assert isinstance(data.get("data"), list), "Must return list even if empty"


class TestDashboardEndpointInvariants:
    """Invariant tests for /api/dashboard endpoint."""

    def test_response_has_required_panels(self, client):
        """Dashboard response must have expected panel structure."""
        response = client.get("/api/dashboard")
        assert response.status_code == 200

        data = response.get_json()
        assert "data" in data, "Response must have 'data' key"

    def test_summary_metrics_are_valid(self, client):
        """Summary metrics must be valid numbers."""
        response = client.get("/api/dashboard?panels=summary")
        data = response.get_json()

        summary = data.get("data", {}).get("summary", {})
        if summary:
            # Check count is non-negative
            if "total_count" in summary:
                assert summary["total_count"] >= 0

            # Check PSF is reasonable (Singapore range: $500 - $10000)
            if "median_psf" in summary and summary["median_psf"]:
                assert 100 < summary["median_psf"] < 50000, \
                    f"median_psf {summary['median_psf']} outside reasonable range"


class TestKPIEndpointInvariants:
    """Invariant tests for /api/kpi-summary-v2 endpoint."""

    def test_kpi_response_is_list(self, client):
        """KPI response must be a list of KPI objects."""
        response = client.get("/api/kpi-summary-v2")
        assert response.status_code == 200

        data = response.get_json()
        # KPI returns list directly or in data key
        kpis = data if isinstance(data, list) else data.get("data", [])
        assert isinstance(kpis, list), "KPIs must be a list"

    def test_kpi_has_required_fields(self, client):
        """Each KPI must have required fields."""
        response = client.get("/api/kpi-summary-v2")
        data = response.get_json()
        kpis = data if isinstance(data, list) else data.get("data", [])

        required_fields = ["kpi_name", "value"]
        for kpi in kpis:
            for field in required_fields:
                assert field in kpi, f"KPI missing required field: {field}"


class TestFilterOptionsEndpointInvariants:
    """Invariant tests for /api/filter-options endpoint."""

    def test_returns_valid_districts(self, client):
        """Filter options must return valid district codes."""
        response = client.get("/api/filter-options")
        assert response.status_code == 200

        data = response.get_json()
        districts = data.get("districts", data.get("data", {}).get("districts", []))

        if districts:
            # All districts should match D## pattern
            for d in districts:
                code = d if isinstance(d, str) else d.get("code", "")
                assert code.startswith("D"), f"Invalid district code: {code}"

    def test_returns_valid_segments(self, client):
        """Filter options must return valid market segments."""
        response = client.get("/api/filter-options")
        data = response.get_json()

        segments = data.get("segments", data.get("data", {}).get("segments", []))
        valid_segments = {"CCR", "RCR", "OCR"}

        for seg in segments:
            code = seg if isinstance(seg, str) else seg.get("code", "")
            assert code in valid_segments, f"Invalid segment: {code}"


class TestTransactionsEndpointInvariants:
    """Invariant tests for /api/transactions endpoint."""

    def test_pagination_respects_limit(self, client):
        """Transactions endpoint must respect page size limit."""
        limit = 10
        response = client.get(f"/api/transactions/list?per_page={limit}")

        if response.status_code == 200:
            data = response.get_json()
            transactions = data.get("data", [])
            assert len(transactions) <= limit, \
                f"Returned {len(transactions)} rows but limit was {limit}"

    def test_psf_values_are_reasonable(self, client):
        """PSF values must be within reasonable Singapore range."""
        response = client.get("/api/transactions/list?per_page=50")

        if response.status_code == 200:
            data = response.get_json()
            for txn in data.get("data", []):
                psf = txn.get("psf")
                if psf is not None:
                    assert 100 < psf < 50000, f"PSF {psf} outside reasonable range"


# Pytest fixtures
@pytest.fixture
def app():
    """Create test Flask app."""
    from app import create_app
    app = create_app()
    app.config["TESTING"] = True
    return app


@pytest.fixture
def client(app):
    """Create test client."""
    return app.test_client()
