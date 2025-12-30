#!/usr/bin/env python3
"""
Regression test for median_psf calculation.

This test ensures that median_psf returns the TRUE median (PERCENTILE_CONT 0.5),
NOT the average. This is critical because averages can be heavily skewed by
luxury outliers, misleading users about typical market prices.

Issue: B1 in DATA_PIPELINE_AUDIT.md

Run with: pytest tests/test_dashboard_median.py -v
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pytest

pytestmark = pytest.mark.integration
from sqlalchemy import text


class TestMedianCalculation:
    """Test that median_psf returns true median, not average."""

    def test_summary_median_psf_is_true_median(self):
        """
        Verify summary median_psf equals PERCENTILE_CONT(0.5), not AVG.

        This is the key regression test for issue B1.
        """
        from app import create_app
        from models.database import db
        from services.dashboard_service import query_summary

        app = create_app()

        with app.app_context():
            # Get summary via dashboard service
            summary = query_summary(filters={}, options={})

            if summary['total_count'] == 0:
                pytest.skip("No data in database to test")

            service_median_psf = summary['median_psf']
            service_avg_psf = summary['avg_psf']

            # Get true median via raw SQL
            result = db.session.execute(text("""
                SELECT
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as true_median,
                    AVG(psf) as true_avg
                FROM transactions
                WHERE (is_outlier = false OR is_outlier IS NULL)
                  AND psf IS NOT NULL
            """)).fetchone()

            true_median = round(float(result.true_median), 2)
            true_avg = round(float(result.true_avg), 2)

            # Median from service MUST match true median
            assert service_median_psf == true_median, (
                f"median_psf should be true median ({true_median}), "
                f"but got {service_median_psf}. "
                f"This looks like the average ({true_avg}) was returned instead!"
            )

            # Average from service should match true average
            assert service_avg_psf == true_avg, (
                f"avg_psf should be {true_avg}, but got {service_avg_psf}"
            )

    def test_summary_median_price_is_true_median(self):
        """Verify summary median_price equals PERCENTILE_CONT(0.5), not AVG."""
        from app import create_app
        from models.database import db
        from services.dashboard_service import query_summary

        app = create_app()

        with app.app_context():
            summary = query_summary(filters={}, options={})

            if summary['total_count'] == 0:
                pytest.skip("No data in database to test")

            service_median_price = summary['median_price']

            # Get true median via raw SQL
            result = db.session.execute(text("""
                SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) as true_median
                FROM transactions
                WHERE (is_outlier = false OR is_outlier IS NULL)
                  AND price IS NOT NULL
            """)).fetchone()

            true_median = round(float(result.true_median), 0)

            assert service_median_price == true_median, (
                f"median_price should be true median ({true_median}), "
                f"but got {service_median_price}"
            )

    def test_time_series_median_per_period(self):
        """Verify time_series median_psf is true median per period."""
        from app import create_app
        from models.database import db
        from services.dashboard_service import query_time_series

        app = create_app()

        with app.app_context():
            # Query time series with month grain
            time_series = query_time_series(filters={}, options={'time_grain': 'month'})

            if not time_series:
                pytest.skip("No time series data in database")

            # Pick the first period with enough data
            test_period = time_series[0]['period']
            service_median = time_series[0]['median_psf']

            if service_median is None:
                pytest.skip("First period has no median data")

            # Get true median for that period via raw SQL
            result = db.session.execute(text("""
                SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as true_median
                FROM transactions
                WHERE (is_outlier = false OR is_outlier IS NULL)
                  AND psf IS NOT NULL
                  AND TO_CHAR(transaction_date, 'YYYY-MM') = :period
            """), {'period': test_period}).fetchone()

            if result.true_median is None:
                pytest.skip(f"No data for period {test_period}")

            true_median = round(float(result.true_median), 2)

            assert service_median == true_median, (
                f"median_psf for period {test_period} should be {true_median}, "
                f"but got {service_median}"
            )

    def test_median_differs_from_average_when_skewed(self):
        """
        Verify median and average are different when distribution is skewed.

        In real estate data, luxury properties often create right-skewed
        distributions where mean > median. This test confirms we're actually
        computing different values.
        """
        from app import create_app
        from models.database import db
        from services.dashboard_service import query_summary

        app = create_app()

        with app.app_context():
            summary = query_summary(filters={}, options={})

            if summary['total_count'] < 100:
                pytest.skip("Need at least 100 records for skewness test")

            median_psf = summary['median_psf']
            avg_psf = summary['avg_psf']

            # In a skewed distribution, median != average
            # We expect real estate data to be right-skewed (avg > median)
            # At minimum, verify they're being calculated separately
            # (could be same value in rare symmetric distributions)

            # Get variance to check if distribution has any spread
            result = db.session.execute(text("""
                SELECT STDDEV(psf) as std, AVG(psf) as avg
                FROM transactions
                WHERE (is_outlier = false OR is_outlier IS NULL)
            """)).fetchone()

            coefficient_of_variation = float(result.std) / float(result.avg)

            # If CV > 0.2 (20% spread), median and avg should differ
            if coefficient_of_variation > 0.2:
                assert median_psf != avg_psf, (
                    f"With CV={coefficient_of_variation:.2%}, median ({median_psf}) "
                    f"and average ({avg_psf}) should differ. "
                    f"This suggests median is still using AVG formula."
                )


class TestMedianWithFilters:
    """Test median calculation respects filter conditions."""

    def test_median_with_district_filter(self):
        """Verify median is calculated only for filtered district."""
        from app import create_app
        from models.database import db
        from services.dashboard_service import query_summary

        app = create_app()

        with app.app_context():
            # Get median for D09 only
            summary = query_summary(filters={'districts': ['D09']}, options={})

            if summary['total_count'] == 0:
                pytest.skip("No D09 data in database")

            service_median = summary['median_psf']

            # Verify via raw SQL
            result = db.session.execute(text("""
                SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as true_median
                FROM transactions
                WHERE (is_outlier = false OR is_outlier IS NULL)
                  AND district = 'D09'
                  AND psf IS NOT NULL
            """)).fetchone()

            true_median = round(float(result.true_median), 2)

            assert service_median == true_median, (
                f"D09 median_psf should be {true_median}, but got {service_median}"
            )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
