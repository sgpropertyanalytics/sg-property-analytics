#!/usr/bin/env python3
"""
Regression test for tenure filter logic.

This test ensures that:
- Freehold filter does NOT include 999-year leasehold properties
- 999-year filter does NOT include Freehold properties

Both tenure types have remaining_lease=999, but they must be distinguished
by the tenure text field.

Issue: B12 in DATA_PIPELINE_AUDIT.md

Run with: pytest tests/test_tenure_filter.py -v
"""

import sys
import os
import pytest

pytestmark = pytest.mark.integration

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pytest
from sqlalchemy import text


class TestTenureFilterSeparation:
    """Test that Freehold and 999-year leasehold are correctly separated."""

    def test_freehold_filter_excludes_999_year_leasehold(self):
        """
        Verify filtering by 'Freehold' does NOT include 999-year leasehold.

        This is the key regression test for issue B12.
        """
        from app import create_app
        from models.database import db
        from services.dashboard_service import build_filter_conditions
        from models.transaction import Transaction
        from sqlalchemy import and_, or_

        app = create_app()

        with app.app_context():
            # Check if we have 999-year leasehold data
            count_999 = db.session.query(Transaction).filter(
                Transaction.tenure.ilike('%999%'),
                or_(Transaction.is_outlier == False, Transaction.is_outlier.is_(None))
            ).count()

            if count_999 == 0:
                pytest.skip("No 999-year leasehold data in database")

            # Build filter conditions for Freehold
            conditions = build_filter_conditions({'tenure': 'Freehold'})

            # Query with Freehold filter
            query = db.session.query(Transaction).filter(
                and_(*conditions)
            ) if conditions else db.session.query(Transaction)

            freehold_results = query.all()

            # None of the results should be 999-year leasehold
            for txn in freehold_results:
                tenure_text = (txn.tenure or '').lower()
                assert '999' not in tenure_text or 'freehold' in tenure_text, (
                    f"Freehold filter incorrectly included 999-year leasehold: "
                    f"project={txn.project_name}, tenure='{txn.tenure}', "
                    f"remaining_lease={txn.remaining_lease}"
                )

    def test_999_year_filter_excludes_freehold(self):
        """
        Verify filtering by '999-year' does NOT include Freehold properties.
        """
        from app import create_app
        from models.database import db
        from services.dashboard_service import build_filter_conditions
        from models.transaction import Transaction
        from sqlalchemy import and_, or_

        app = create_app()

        with app.app_context():
            # Check if we have freehold data
            count_freehold = db.session.query(Transaction).filter(
                Transaction.tenure.ilike('%freehold%'),
                or_(Transaction.is_outlier == False, Transaction.is_outlier.is_(None))
            ).count()

            if count_freehold == 0:
                pytest.skip("No Freehold data in database")

            # Build filter conditions for 999-year
            conditions = build_filter_conditions({'tenure': '999-year'})

            # Query with 999-year filter
            query = db.session.query(Transaction).filter(
                and_(*conditions)
            ) if conditions else db.session.query(Transaction)

            results_999 = query.all()

            # None of the results should be Freehold
            for txn in results_999:
                tenure_text = (txn.tenure or '').lower()
                assert 'freehold' not in tenure_text, (
                    f"999-year filter incorrectly included Freehold: "
                    f"project={txn.project_name}, tenure='{txn.tenure}'"
                )

    def test_freehold_and_999_year_are_mutually_exclusive(self):
        """
        Verify Freehold and 999-year filters return non-overlapping results.
        """
        from app import create_app
        from models.database import db
        from services.dashboard_service import build_filter_conditions
        from models.transaction import Transaction
        from sqlalchemy import and_

        app = create_app()

        with app.app_context():
            # Get IDs from Freehold filter
            freehold_conditions = build_filter_conditions({'tenure': 'Freehold'})
            freehold_query = db.session.query(Transaction.id).filter(
                and_(*freehold_conditions)
            ) if freehold_conditions else db.session.query(Transaction.id)
            freehold_ids = set(r.id for r in freehold_query.all())

            # Get IDs from 999-year filter
            lh999_conditions = build_filter_conditions({'tenure': '999-year'})
            lh999_query = db.session.query(Transaction.id).filter(
                and_(*lh999_conditions)
            ) if lh999_conditions else db.session.query(Transaction.id)
            lh999_ids = set(r.id for r in lh999_query.all())

            if not freehold_ids or not lh999_ids:
                pytest.skip("Need both Freehold and 999-year data for overlap test")

            # Check for overlap
            overlap = freehold_ids & lh999_ids
            assert len(overlap) == 0, (
                f"Freehold and 999-year filters have {len(overlap)} overlapping records! "
                f"Sample overlapping IDs: {list(overlap)[:5]}"
            )


class TestTenureFilterConditions:
    """Test the filter condition building logic."""

    def test_freehold_condition_excludes_999_in_tenure(self):
        """
        Verify the SQL condition for Freehold explicitly excludes '999' in tenure.
        """
        import inspect
        from services.dashboard_service import build_filter_conditions

        # Get the source code
        source = inspect.getsource(build_filter_conditions)

        # The condition should check for NOT 999 in tenure when using remaining_lease=999
        # Look for the pattern that excludes 999-year leasehold
        assert '~Transaction.tenure.ilike' in source and '999' in source, (
            "Freehold filter should explicitly exclude 999-year leasehold "
            "using ~Transaction.tenure.ilike('%999%')"
        )

    def test_999_year_condition_uses_tenure_text(self):
        """
        Verify the SQL condition for 999-year uses tenure text, not just remaining_lease.
        """
        from app import create_app
        from services.dashboard_service import build_filter_conditions

        app = create_app()

        with app.app_context():
            conditions = build_filter_conditions({'tenure': '999-year'})

            # Convert conditions to string representation for inspection
            condition_strs = [str(c) for c in conditions]
            combined = ' '.join(condition_strs)

            # Should contain ilike check on tenure, not just remaining_lease=999
            assert 'ilike' in combined.lower() or 'ILIKE' in combined, (
                f"999-year filter should use tenure.ilike('%999%'), "
                f"but got conditions: {combined}"
            )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
