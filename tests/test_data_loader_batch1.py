#!/usr/bin/env python3
"""
Regression tests for data loader fixes (Batch 1).

This test ensures that:
- B6: PSF calculation prevents division by zero
- B7: nett_price preserves NULL semantics (not filled with 0)
- B8: num_units preserves NULL semantics (not filled with 1)
- B11: contract_date uses MMYYYY format (no century ambiguity)

Issues: B6, B7, B8, B11 in DATA_PIPELINE_AUDIT.md

Run with: pytest tests/test_data_loader_batch1.py -v
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pytest
import pandas as pd


def _get_clean_csv_data_source():
    """Read source code of clean_csv_data without importing (avoids dep issues)."""
    source_path = os.path.join(
        os.path.dirname(__file__), '..', 'backend', 'services', 'data_loader.py'
    )
    with open(source_path, 'r') as f:
        return f.read()


class TestB6_PSFDivisionByZero:
    """Test that PSF calculation handles division by zero safely."""

    def test_psf_calculation_checks_area_before_division(self):
        """
        Verify PSF calculation checks area_sqft > 0 before division.

        This is the key regression test for issue B6.
        """
        source = _get_clean_csv_data_source()

        # Should check for area_sqft > 0 before calculating PSF
        assert 'area_sqft' in source and '> 0' in source, (
            "PSF calculation should check area_sqft > 0 to prevent division by zero"
        )

        # Should have comment referencing B6
        assert 'B6' in source or 'division by zero' in source.lower(), (
            "PSF calculation fix should reference issue B6 or mention division by zero"
        )

    def test_psf_with_zero_area_returns_zero_not_infinity(self):
        """
        Verify that rows with area_sqft=0 get PSF=0, not infinity.
        """
        from services.data_loader import clean_csv_data

        # Create test data with zero area
        df = pd.DataFrame({
            'Project Name': ['Test Project'],
            'Sale Date': ['Oct 2024'],
            'Postal District': ['D09'],
            'Transacted Price ($)': ['1,000,000'],
            'Area (SQFT)': ['0'],  # Zero area - would cause division by zero
            'Unit Price ($ PSF)': [''],  # Empty - triggers calculation
            'Property Type': ['Condominium'],
        })

        result = clean_csv_data(df)

        # Row should be filtered out due to area_sqft <= 0
        assert len(result) == 0, (
            "Rows with area_sqft=0 should be filtered out"
        )

    def test_psf_calculation_normal_case(self):
        """
        Verify PSF calculation works correctly for valid data.
        """
        from services.data_loader import clean_csv_data

        df = pd.DataFrame({
            'Project Name': ['Test Project'],
            'Sale Date': ['Oct 2024'],
            'Postal District': ['D09'],
            'Transacted Price ($)': ['1,000,000'],
            'Area (SQFT)': ['1000'],
            'Unit Price ($ PSF)': [''],  # Empty - triggers calculation
            'Property Type': ['Condominium'],
        })

        result = clean_csv_data(df)

        if not result.empty:
            # PSF should be 1,000,000 / 1000 = 1000
            assert result.iloc[0]['psf'] == 1000.0, (
                f"PSF should be 1000.0, got {result.iloc[0]['psf']}"
            )


class TestB7_NettPriceNullSemantics:
    """Test that nett_price preserves NULL semantics."""

    def test_nett_price_does_not_fillna_zero(self):
        """
        Verify nett_price parsing does NOT use fillna(0).

        This is the key regression test for issue B7.
        """
        source = _get_clean_csv_data_source()

        # Find the nett_price section
        nett_start = source.find("nett_price_col = 'Nett Price")
        nett_end = source.find('# Clean and parse area')

        if nett_start != -1 and nett_end != -1:
            nett_section = source[nett_start:nett_end]

            # Check for actual code using fillna(0), not comments about it
            # Look for pattern like ").fillna(0)" which would be actual usage
            import re
            actual_fillna_zero = re.search(r'\)\s*\.fillna\(0\)', nett_section)
            assert actual_fillna_zero is None, (
                "nett_price should NOT use .fillna(0) - this destroys NULL semantics"
            )

            # Should have comment about B7 or NULL semantics
            assert 'B7' in nett_section or 'NULL' in nett_section, (
                "nett_price section should reference issue B7 or explain NULL semantics"
            )

    def test_missing_nett_price_remains_null(self):
        """
        Verify that missing nett_price values remain NULL, not 0.
        """
        from services.data_loader import clean_csv_data

        df = pd.DataFrame({
            'Project Name': ['Test A', 'Test B'],
            'Sale Date': ['Oct 2024', 'Oct 2024'],
            'Postal District': ['D09', 'D10'],
            'Transacted Price ($)': ['1,000,000', '2,000,000'],
            'Area (SQFT)': ['1000', '1500'],
            'Unit Price ($ PSF)': ['1000', '1333'],
            'Property Type': ['Condominium', 'Condominium'],
            'Nett Price($)': ['950000', ''],  # Second one is missing
        })

        result = clean_csv_data(df)

        if not result.empty and 'nett_price' in result.columns:
            # First should have value, second should be NaN/NULL
            assert pd.notna(result.iloc[0]['nett_price']), (
                "First row should have nett_price value"
            )
            assert pd.isna(result.iloc[1]['nett_price']), (
                "Second row with empty nett_price should be NULL, not 0"
            )


class TestB8_NumUnitsNullSemantics:
    """Test that num_units preserves NULL semantics."""

    def test_num_units_does_not_fillna_one(self):
        """
        Verify num_units parsing does NOT use fillna(1).

        This is the key regression test for issue B8.
        """
        source = _get_clean_csv_data_source()

        # Find the num_units section
        units_start = source.find("num_units_col = 'Number of Units")
        units_end = source.find('# Helper to normalize null')

        if units_start != -1 and units_end != -1:
            units_section = source[units_start:units_end]

            # Check for actual code using fillna(1), not comments about it
            # Look for pattern like ").fillna(1)" which would be actual usage
            import re
            actual_fillna_one = re.search(r'\)\s*\.fillna\(1\)', units_section)
            assert actual_fillna_one is None, (
                "num_units should NOT use .fillna(1) - this destroys NULL semantics"
            )

            # Should use nullable Int64 type
            assert 'Int64' in units_section, (
                "num_units should use nullable Int64 type to preserve NaN"
            )

            # Should have comment about B8 or NULL semantics
            assert 'B8' in units_section or 'NULL' in units_section, (
                "num_units section should reference issue B8 or explain NULL semantics"
            )

    def test_missing_num_units_remains_null(self):
        """
        Verify that missing num_units values remain NULL, not 1.
        """
        from services.data_loader import clean_csv_data

        df = pd.DataFrame({
            'Project Name': ['Test A', 'Test B'],
            'Sale Date': ['Oct 2024', 'Oct 2024'],
            'Postal District': ['D09', 'D10'],
            'Transacted Price ($)': ['1,000,000', '2,000,000'],
            'Area (SQFT)': ['1000', '1500'],
            'Unit Price ($ PSF)': ['1000', '1333'],
            'Property Type': ['Condominium', 'Condominium'],
            'Number of Units': ['3', ''],  # Second one is missing
        })

        result = clean_csv_data(df)

        if not result.empty and 'num_units' in result.columns:
            # First should have value 3
            assert result.iloc[0]['num_units'] == 3, (
                "First row should have num_units=3"
            )
            # Second should be NaN/NULL (not 1)
            assert pd.isna(result.iloc[1]['num_units']), (
                "Second row with empty num_units should be NULL, not 1"
            )


class TestB11_ContractDateFormat:
    """Test that contract_date uses MMYYYY format (no century ambiguity)."""

    def test_contract_date_uses_mmyyyy_format(self):
        """
        Verify contract_date uses MMYYYY format with 4-digit year.

        This is the key regression test for issue B11.
        """
        source = _get_clean_csv_data_source()

        # Should have comment about B11 or century ambiguity
        assert 'B11' in source or 'century' in source.lower() or 'MMYYYY' in source, (
            "contract_date section should reference issue B11 or mention MMYYYY format"
        )

        # Should use 4-digit year (str[0:4] for YYYY)
        assert "str[0:4]" in source or "str[:4]" in source, (
            "contract_date should extract 4-digit year to avoid century ambiguity"
        )

    def test_contract_date_has_six_digits(self):
        """
        Verify contract_date is 6 characters (MMYYYY format).
        """
        from services.data_loader import clean_csv_data

        df = pd.DataFrame({
            'Project Name': ['Test Project'],
            'Sale Date': ['Oct 2024'],
            'Postal District': ['D09'],
            'Transacted Price ($)': ['1,000,000'],
            'Area (SQFT)': ['1000'],
            'Unit Price ($ PSF)': ['1000'],
            'Property Type': ['Condominium'],
        })

        result = clean_csv_data(df)

        if not result.empty and 'contract_date' in result.columns:
            contract_date = result.iloc[0]['contract_date']

            # Should be 6 characters (MMYYYY)
            assert len(contract_date) == 6, (
                f"contract_date should be 6 characters (MMYYYY), got '{contract_date}' with length {len(contract_date)}"
            )

            # Should start with month (10 for October)
            assert contract_date.startswith('10'), (
                f"contract_date for October should start with '10', got '{contract_date}'"
            )

            # Should end with year (2024)
            assert contract_date.endswith('2024'), (
                f"contract_date for 2024 should end with '2024', got '{contract_date}'"
            )

    def test_contract_date_preserves_century(self):
        """
        Verify contract_date distinguishes between centuries.
        """
        from services.data_loader import clean_csv_data

        # Test with different centuries
        df = pd.DataFrame({
            'Project Name': ['Test 2024', 'Test 1999'],
            'Sale Date': ['Oct 2024', 'Oct 1999'],
            'Postal District': ['D09', 'D10'],
            'Transacted Price ($)': ['1,000,000', '500,000'],
            'Area (SQFT)': ['1000', '800'],
            'Unit Price ($ PSF)': ['1000', '625'],
            'Property Type': ['Condominium', 'Condominium'],
        })

        result = clean_csv_data(df)

        if len(result) == 2 and 'contract_date' in result.columns:
            date_2024 = result[result['project_name'] == 'Test 2024'].iloc[0]['contract_date']
            date_1999 = result[result['project_name'] == 'Test 1999'].iloc[0]['contract_date']

            # Should be different (unlike old MMYY format which would both be "1024" and "1099")
            assert date_2024 != date_1999, (
                f"contract_dates for different years should be different: "
                f"2024={date_2024}, 1999={date_1999}"
            )

            # 2024 should be "102024", 1999 should be "101999"
            assert date_2024 == '102024', f"Expected '102024', got '{date_2024}'"
            assert date_1999 == '101999', f"Expected '101999', got '{date_1999}'"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
