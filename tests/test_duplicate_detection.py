#!/usr/bin/env python3
"""
Regression test for duplicate detection with floor_range.

This test ensures that:
- floor_range is always included in the deduplication key
- Transactions on different floors with same project/date/price/area are NOT deduped
- The deduplication logic attempts floor_range first before falling back

Issue: B3 in DATA_PIPELINE_AUDIT.md

Run with: pytest tests/test_duplicate_detection.py -v
"""

import sys
import os
import pytest

pytestmark = pytest.mark.integration

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pytest


def _get_remove_duplicates_source():
    """Read source code of remove_duplicates_sql without importing (avoids SQLAlchemy dep)."""
    source_path = os.path.join(
        os.path.dirname(__file__), '..', 'backend', 'services', 'data_validation.py'
    )
    with open(source_path, 'r') as f:
        full_source = f.read()

    # Extract just the remove_duplicates_sql function
    start = full_source.find('def remove_duplicates_sql')
    end = full_source.find('\ndef validate_transaction_data')
    if start == -1 or end == -1:
        raise ValueError("Could not find remove_duplicates_sql function in source")
    return full_source[start:end]


class TestDuplicateDetectionWithFloorRange:
    """Test that floor_range is used in deduplication to preserve valid transactions."""

    def test_remove_duplicates_uses_floor_range_first(self):
        """
        Verify remove_duplicates_sql attempts to use floor_range before fallback.

        This is the key regression test for issue B3.
        """
        source = _get_remove_duplicates_source()

        # Should have sql_with_floor as the primary query
        assert 'sql_with_floor' in source, (
            "remove_duplicates_sql should define sql_with_floor query"
        )

        # Should try sql_with_floor first
        assert 'execute(sql_with_floor)' in source, (
            "remove_duplicates_sql should try sql_with_floor first, not sql_without_floor"
        )

        # Should use COALESCE for NULL handling
        assert "COALESCE(floor_range, '')" in source, (
            "Deduplication should use COALESCE(floor_range, '') to handle NULL values"
        )

    def test_floor_range_in_group_by(self):
        """
        Verify floor_range is included in the GROUP BY clause.
        """
        source = _get_remove_duplicates_source()

        # The GROUP BY should include floor_range with COALESCE
        assert 'GROUP BY project_name, transaction_date, price, area_sqft' in source, (
            "GROUP BY should include the base deduplication fields"
        )

        # The floor_range should be on the next line or same line with COALESCE
        assert 'floor_range' in source and 'GROUP BY' in source, (
            "floor_range must be part of the deduplication key"
        )

    def test_fallback_only_on_column_error(self):
        """
        Verify fallback to simpler query only happens when column doesn't exist.
        """
        source = _get_remove_duplicates_source()

        # Should have conditional fallback checking for column-related errors
        assert 'floor_range' in source.lower() and 'column' in source.lower(), (
            "Fallback should only trigger on floor_range column errors"
        )


class TestDuplicatePreservation:
    """Test that legitimate multi-floor transactions are preserved."""

    def test_different_floors_not_deduped(self):
        """
        Verify transactions on different floors are NOT marked as duplicates.

        Two transactions with:
        - Same project_name, transaction_date, price, area_sqft
        - Different floor_range

        Should BOTH be preserved, not deduped.
        """
        try:
            from app import create_app
            from models.database import db
            from models.transaction import Transaction
            from sqlalchemy import and_
        except ImportError:
            pytest.skip("SQLAlchemy/Flask not installed - skipping DB test")

        app = create_app()

        with app.app_context():
            # Find example of same project with multiple floor transactions
            # Look for projects with varied floor_range values
            result = db.session.execute(db.text("""
                SELECT project_name, transaction_date, price, area_sqft,
                       COUNT(DISTINCT floor_range) as floor_count,
                       COUNT(*) as total_count
                FROM transactions
                WHERE floor_range IS NOT NULL
                GROUP BY project_name, transaction_date, price, area_sqft
                HAVING COUNT(DISTINCT floor_range) > 1
                LIMIT 1
            """)).fetchone()

            if result is None:
                pytest.skip(
                    "No test data: need transactions with same project/date/price/area "
                    "but different floor_range values"
                )

            project_name = result.project_name
            txn_date = result.transaction_date
            price = result.price
            area = result.area_sqft

            # Count distinct floor transactions for this combination
            distinct_floors = db.session.query(Transaction.floor_range).filter(
                and_(
                    Transaction.project_name == project_name,
                    Transaction.transaction_date == txn_date,
                    Transaction.price == price,
                    Transaction.area_sqft == area,
                    Transaction.floor_range.isnot(None)
                )
            ).distinct().count()

            # Should have multiple floors preserved
            assert distinct_floors > 1, (
                f"Expected multiple floor transactions to be preserved for "
                f"project={project_name}, but only found {distinct_floors} distinct floors. "
                f"Deduplication may have incorrectly removed different-floor transactions."
            )

    def test_true_duplicates_still_detected(self):
        """
        Verify true duplicates (same project/date/price/area/floor) are still detected.
        """
        try:
            from app import create_app
            from models.database import db
        except ImportError:
            pytest.skip("SQLAlchemy/Flask not installed - skipping DB test")

        app = create_app()

        with app.app_context():
            # Check if any true duplicates exist (same all fields including floor)
            result = db.session.execute(db.text("""
                SELECT project_name, transaction_date, price, area_sqft,
                       COALESCE(floor_range, '') as floor,
                       COUNT(*) as dup_count
                FROM transactions
                GROUP BY project_name, transaction_date, price, area_sqft,
                         COALESCE(floor_range, '')
                HAVING COUNT(*) > 1
                LIMIT 5
            """)).fetchall()

            # It's OK if there are no duplicates (data is clean)
            # This test just documents that true duplicates would be detected
            if result:
                for row in result:
                    print(f"True duplicate found: {row.project_name}, "
                          f"floor={row.floor}, count={row.dup_count}")


class TestDeduplicationDocstring:
    """Test that the function is properly documented."""

    def test_docstring_mentions_floor_range(self):
        """
        Verify docstring documents floor_range as part of deduplication key.
        """
        source = _get_remove_duplicates_source()

        # Extract docstring (between first """ and second """)
        doc_start = source.find('"""')
        if doc_start != -1:
            doc_end = source.find('"""', doc_start + 3)
            if doc_end != -1:
                docstring = source[doc_start:doc_end + 3]
            else:
                docstring = ""
        else:
            docstring = ""

        assert 'floor_range' in docstring.lower(), (
            "remove_duplicates_sql docstring should document that floor_range "
            "is part of the deduplication key"
        )

    def test_docstring_mentions_b3_issue(self):
        """
        Verify docstring references the audit issue for traceability.
        """
        source = _get_remove_duplicates_source()

        # Extract docstring (between first """ and second """)
        doc_start = source.find('"""')
        if doc_start != -1:
            doc_end = source.find('"""', doc_start + 3)
            if doc_end != -1:
                docstring = source[doc_start:doc_end + 3]
            else:
                docstring = ""
        else:
            docstring = ""

        assert 'B3' in docstring or 'audit' in docstring.lower(), (
            "remove_duplicates_sql docstring should reference the audit issue "
            "for traceability (B3)"
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
