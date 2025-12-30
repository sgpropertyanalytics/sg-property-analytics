#!/usr/bin/env python3
"""
Test that app startup does NOT mutate the database.

This test ensures that restarting the app does not change row counts,
which would cause non-deterministic datasets and IQR drift.

Outlier filtering must happen ONCE during upload pipeline (staging),
not on app startup.

Run with: pytest tests/test_startup_no_mutations.py -v
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pytest

pytestmark = pytest.mark.integration


class TestStartupNoMutations:
    """Test that app startup is read-only."""

    def test_startup_validation_is_read_only(self):
        """Verify _run_startup_validation does not delete any records."""
        from app import create_app
        from models.database import db
        from models.transaction import Transaction

        app = create_app()

        with app.app_context():
            # Get count before
            count_before = db.session.query(Transaction).count()

            if count_before == 0:
                pytest.skip("No data in database to test")

            # Run startup validation again (simulating app restart)
            from app import _run_startup_validation
            _run_startup_validation()

            # Get count after
            count_after = db.session.query(Transaction).count()

            # Assert no records were deleted
            assert count_after == count_before, (
                f"App startup MUST NOT mutate database! "
                f"Before: {count_before}, After: {count_after}, "
                f"Difference: {count_before - count_after} records deleted"
            )

    def test_run_validation_report_is_read_only(self):
        """Verify run_validation_report does not delete any records."""
        from app import create_app
        from models.database import db
        from models.transaction import Transaction
        from services.data_validation import run_validation_report

        app = create_app()

        with app.app_context():
            # Get count before
            count_before = db.session.query(Transaction).count()

            if count_before == 0:
                pytest.skip("No data in database to test")

            # Run validation report multiple times
            for _ in range(3):
                report = run_validation_report()

            # Get count after
            count_after = db.session.query(Transaction).count()

            # Assert no records were deleted
            assert count_after == count_before, (
                f"run_validation_report MUST NOT mutate database! "
                f"Before: {count_before}, After: {count_after}"
            )

    def test_multiple_app_restarts_stable_count(self):
        """Verify multiple app restarts don't change row counts."""
        from app import create_app
        from models.database import db
        from models.transaction import Transaction

        # First app instance
        app1 = create_app()
        with app1.app_context():
            count1 = db.session.query(Transaction).count()

        if count1 == 0:
            pytest.skip("No data in database to test")

        # Second app instance (simulating restart)
        app2 = create_app()
        with app2.app_context():
            count2 = db.session.query(Transaction).count()

        # Third app instance (simulating another restart)
        app3 = create_app()
        with app3.app_context():
            count3 = db.session.query(Transaction).count()

        # All counts must be identical
        assert count1 == count2 == count3, (
            f"Row counts changed across app restarts! "
            f"First: {count1}, Second: {count2}, Third: {count3}"
        )


class TestValidationReportContent:
    """Test that validation report returns expected structure."""

    def test_report_structure(self):
        """Verify report has expected keys."""
        from app import create_app
        from services.data_validation import run_validation_report

        app = create_app()

        with app.app_context():
            report = run_validation_report()

            # Check required keys
            assert 'total_count' in report
            assert 'potential_issues' in report
            assert 'is_clean' in report

            # Check potential_issues structure
            issues = report['potential_issues']
            assert 'invalid_records' in issues
            assert 'potential_duplicates' in issues
            assert 'potential_outliers' in issues

    def test_report_returns_counts_not_deletes(self):
        """Verify report returns counts, not deletion results."""
        from app import create_app
        from services.data_validation import run_validation_report

        app = create_app()

        with app.app_context():
            report = run_validation_report()

            # Should NOT have 'removed' keys (those imply mutation)
            assert 'invalid_removed' not in report
            assert 'duplicates_removed' not in report
            assert 'outliers_removed' not in report
            assert 'total_cleaned' not in report


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
