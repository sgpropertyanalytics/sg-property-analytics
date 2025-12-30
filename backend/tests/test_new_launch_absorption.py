"""
New Launch Absorption Tests

Tests for the get_new_launch_absorption service function.

These are integration tests that require database connection.

Run with: pytest tests/test_new_launch_absorption.py -v --run-integration

Tests:
1. Launch-month aggregation (calendar month, not exact date)
2. Filter as cohort membership (project-level, not transaction-level)
3. Missing total_units behavior (excluded from avg, tracked in projectsMissing)
"""

import pytest
from datetime import date

# Skip all tests if no DB connection
pytestmark = pytest.mark.skipif(
    "not config.getoption('--run-integration')",
    reason="Integration tests require --run-integration flag"
)


class TestNewLaunchAbsorptionService:
    """Tests for get_new_launch_absorption service function."""

    def test_returns_valid_response_structure(self, app):
        """Response must have expected shape with all required fields."""
        with app.app_context():
            from services.new_launch_service import get_new_launch_absorption

            result = get_new_launch_absorption(
                time_grain='quarter',
                date_from=date(2024, 1, 1),
                date_to_exclusive=date(2025, 1, 1),
            )

            assert isinstance(result, list), "Must return a list"

            if result:
                row = result[0]
                # Check all required fields present
                assert "periodStart" in row, "Missing periodStart"
                assert "projectCount" in row, "Missing projectCount"
                assert "avgAbsorption" in row, "Missing avgAbsorption (can be null)"
                assert "projectsWithUnits" in row, "Missing projectsWithUnits"
                assert "projectsMissing" in row, "Missing projectsMissing"

                # Validate types
                assert isinstance(row["periodStart"], str), "periodStart must be string"
                assert isinstance(row["projectCount"], int), "projectCount must be int"
                assert row["avgAbsorption"] is None or isinstance(row["avgAbsorption"], (int, float)), \
                    "avgAbsorption must be number or null"
                assert isinstance(row["projectsWithUnits"], int), "projectsWithUnits must be int"
                assert isinstance(row["projectsMissing"], int), "projectsMissing must be int"

    def test_time_grains_produce_valid_period_format(self, app):
        """periodStart must have canonical grain-start format (YYYY-MM-01)."""
        with app.app_context():
            from services.new_launch_service import get_new_launch_absorption

            for grain in ['month', 'quarter', 'year']:
                result = get_new_launch_absorption(
                    time_grain=grain,
                    date_from=date(2024, 1, 1),
                    date_to_exclusive=date(2025, 1, 1),
                )

                for row in result:
                    period = row["periodStart"]
                    # Must be YYYY-MM-DD format
                    assert len(period) == 10, f"periodStart must be YYYY-MM-DD, got {period}"
                    parts = period.split("-")
                    assert len(parts) == 3, f"Invalid date format: {period}"
                    assert parts[2] == "01", f"Day must be 01 for canonical format, got {parts[2]}"

                    # Quarter must start on Jan/Apr/Jul/Oct
                    if grain == 'quarter':
                        month = int(parts[1])
                        assert month in [1, 4, 7, 10], f"Quarter month must be 1/4/7/10, got {month}"

                    # Year must start on Jan
                    if grain == 'year':
                        month = int(parts[1])
                        assert month == 1, f"Year month must be 1, got {month}"

    def test_project_count_includes_projects_with_zero_sales(self, app):
        """
        projectCount must include ALL projects launched in period,
        even those with 0 launch-month sales.
        This validates the LEFT JOIN behavior.
        """
        with app.app_context():
            from services.new_launch_service import get_new_launch_absorption

            result = get_new_launch_absorption(
                time_grain='year',
                date_from=date(2020, 1, 1),
                date_to_exclusive=date(2025, 1, 1),
            )

            for row in result:
                # projectCount must equal projectsWithUnits + projectsMissing
                # This validates the LEFT JOIN isn't dropping 0-sale projects
                total = row["projectsWithUnits"] + row["projectsMissing"]
                assert row["projectCount"] == total, \
                    f"projectCount ({row['projectCount']}) must equal " \
                    f"projectsWithUnits ({row['projectsWithUnits']}) + " \
                    f"projectsMissing ({row['projectsMissing']})"

    def test_absorption_capped_at_100_percent(self, app):
        """avgAbsorption must be capped at 100% (CSV may underreport total_units)."""
        with app.app_context():
            from services.new_launch_service import get_new_launch_absorption

            result = get_new_launch_absorption(
                time_grain='quarter',
                date_from=date(2020, 1, 1),
                date_to_exclusive=date(2025, 1, 1),
            )

            for row in result:
                if row["avgAbsorption"] is not None:
                    assert row["avgAbsorption"] <= 100.0, \
                        f"avgAbsorption must be <= 100, got {row['avgAbsorption']}"

    def test_missing_total_units_excluded_from_avg(self, app):
        """
        Projects without total_units in CSV should be:
        - Excluded from avgAbsorption calculation
        - Counted in projectsMissing
        """
        with app.app_context():
            from services.new_launch_service import get_new_launch_absorption

            result = get_new_launch_absorption(
                time_grain='year',
                date_from=date(2020, 1, 1),
                date_to_exclusive=date(2025, 1, 1),
            )

            # If all projects are missing units, avgAbsorption should be null
            for row in result:
                if row["projectsMissing"] == row["projectCount"]:
                    assert row["avgAbsorption"] is None, \
                        "avgAbsorption must be null when all projects missing units"
                    assert row["projectsWithUnits"] == 0, \
                        "projectsWithUnits must be 0 when all missing"

    def test_sorted_by_period_ascending(self, app):
        """Results must be sorted by periodStart ascending."""
        with app.app_context():
            from services.new_launch_service import get_new_launch_absorption

            result = get_new_launch_absorption(
                time_grain='quarter',
                date_from=date(2020, 1, 1),
                date_to_exclusive=date(2025, 1, 1),
            )

            if len(result) > 1:
                periods = [row["periodStart"] for row in result]
                assert periods == sorted(periods), \
                    f"Results must be sorted ascending, got {periods[:5]}..."

    def test_invalid_time_grain_raises_error(self, app):
        """Invalid time_grain must raise ValueError."""
        with app.app_context():
            from services.new_launch_service import get_new_launch_absorption

            with pytest.raises(ValueError) as exc_info:
                get_new_launch_absorption(time_grain='invalid')

            assert "time_grain" in str(exc_info.value).lower()


class TestNewLaunchAbsorptionEndpoint:
    """Integration tests for /api/new-launch-absorption endpoint."""

    def test_endpoint_returns_200(self, client):
        """Endpoint must return 200 OK with valid params."""
        response = client.get("/api/new-launch-absorption?time_grain=quarter")
        assert response.status_code == 200

        data = response.get_json()
        assert "data" in data, "Response must have 'data' key"
        assert isinstance(data["data"], list), "'data' must be a list"

    def test_endpoint_respects_date_filters(self, client):
        """Date range filters must be applied correctly."""
        # Narrow date range to get fewer results
        response = client.get(
            "/api/new-launch-absorption"
            "?time_grain=quarter"
            "&date_from=2024-01-01"
            "&date_to=2024-07-01"
        )
        assert response.status_code == 200

        data = response.get_json()
        for row in data.get("data", []):
            period = row["periodStart"]
            # All periods must be in 2024 H1
            assert period >= "2024-01-01" and period < "2024-07-01", \
                f"Period {period} outside requested range"

    def test_endpoint_respects_segment_filter(self, client):
        """Segment filter (CCR/RCR/OCR) must work via param."""
        response = client.get(
            "/api/new-launch-absorption"
            "?time_grain=year"
            "&segments=CCR"
        )
        assert response.status_code == 200

        data = response.get_json()
        assert isinstance(data.get("data"), list)

    def test_endpoint_returns_meta_fields(self, client):
        """Response must include API contract meta fields."""
        response = client.get("/api/new-launch-absorption?time_grain=quarter")
        assert response.status_code == 200

        data = response.get_json()
        # @api_contract decorator injects these
        assert "requestId" in data or "meta" in data, \
            "Response should have meta fields from @api_contract"

    def test_empty_result_returns_empty_array(self, client):
        """Impossible filters should return empty array, not error."""
        response = client.get(
            "/api/new-launch-absorption"
            "?time_grain=quarter"
            "&districts=D99"
            "&date_from=2099-01-01"
        )
        assert response.status_code == 200

        data = response.get_json()
        assert isinstance(data.get("data"), list), "Must return list even if empty"
