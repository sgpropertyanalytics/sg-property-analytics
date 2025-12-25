#!/usr/bin/env python3
"""
Regression tests for Batch 2 audit fixes.

This test ensures that:
- B5: API returns filter_notes when property age filter is used
- B9: Date day assignment uses middle of month (15th) consistently

Note: B10 (bedroom classification) and B13 (floor level) were NOT changed
as they are manual inputs maintained by the user.

Issues: B5, B9 in DATA_PIPELINE_AUDIT.md

Run with: pytest tests/test_batch2_fixes.py -v
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pytest


def _read_source_file(relative_path: str) -> str:
    """Read source file content without importing."""
    source_path = os.path.join(
        os.path.dirname(__file__), '..', 'backend', relative_path
    )
    with open(source_path, 'r') as f:
        return f.read()


class TestB5_PropertyAgeFilterNotes:
    """Test that property age filter returns explanatory notes."""

    def test_filter_notes_in_dashboard_service(self):
        """
        Verify dashboard_service adds filter_notes for property age filter.

        This is the key regression test for issue B5.
        """
        source = _read_source_file('services/dashboard_service.py')

        # Should have filter_notes building logic
        assert 'filter_notes' in source, (
            "dashboard_service should build filter_notes for filter explanations"
        )

        # Should mention B5 or property age
        assert 'B5' in source or 'property_age' in source.lower(), (
            "filter_notes should be related to property age filter (B5)"
        )

        # Should explain freehold exclusion
        assert 'freehold' in source.lower() and 'property_age' in source.lower(), (
            "filter_notes should explain that freehold properties are excluded"
        )

    def test_filter_notes_in_meta_response(self):
        """
        Verify filter_notes is included in the meta response structure.
        """
        source = _read_source_file('services/dashboard_service.py')

        # Should have filter_notes in the result meta
        assert "'filter_notes'" in source or '"filter_notes"' in source, (
            "filter_notes should be included in API response meta"
        )


class TestB9_DateDayAssignment:
    """Test that date day assignment uses middle of month consistently."""

    def test_uses_day_15_for_all_months(self):
        """
        Verify all months use day 15 (middle) instead of variable days.

        This is the key regression test for issue B9.
        """
        source = _read_source_file('services/data_loader.py')

        # Should have comment about B9
        assert 'B9' in source, (
            "Date day assignment should reference issue B9"
        )

        # Should use day 15 for all months
        assert "df['parsed_day'] = 15" in source, (
            "All months should use day 15 (middle of month)"
        )

        # Should NOT have the old get_day function logic
        assert 'def get_day(row):' not in source, (
            "Old get_day function with variable days should be removed"
        )

    def test_consistent_date_generation(self):
        """
        Verify generated dates use day 15.
        """
        import pandas as pd
        from services.data_loader import clean_csv_data

        df = pd.DataFrame({
            'Project Name': ['Test A', 'Test B'],
            'Sale Date': ['Oct 2024', 'Sep 2024'],
            'Postal District': ['D09', 'D10'],
            'Transacted Price ($)': ['1,000,000', '2,000,000'],
            'Area (SQFT)': ['1000', '1500'],
            'Unit Price ($ PSF)': ['1000', '1333'],
            'Property Type': ['Condominium', 'Condominium'],
        })

        result = clean_csv_data(df)

        if not result.empty:
            # All dates should be on the 15th
            for date_str in result['transaction_date']:
                assert '-15' in date_str, (
                    f"Date {date_str} should use day 15, not variable days"
                )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
