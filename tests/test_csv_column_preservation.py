#!/usr/bin/env python3
"""
Tests for CSV column preservation in the data import pipeline

Run with: pytest tests/test_csv_column_preservation.py -v
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import pytest
import pandas as pd
from io import StringIO
from services.data_loader import clean_csv_data


# Sample URA CSV data for testing
SAMPLE_CSV = """Project Name,Street Name,Property Type,Postal District,Market Segment,Tenure,Type of Sale,No. of Units,Nett Price ($),Transacted Price ($),Area (SQFT),Type of Area,Unit Price ($ PSF),Sale Date,Floor Range
TEST CONDO,123 TEST ROAD,Condominium,1,CCR,99 yrs lease commencing from 2020,New Sale,1,1000000,1050000,800,Strata,1312,Dec-24,16 to 20
SAMPLE RESIDENCE,456 SAMPLE AVE,Apartment,2,RCR,Freehold,Resale,1,2000000,2100000,1200,Strata,1750,Nov-24,06 to 10
HIGH TOWER,789 HIGH STREET,Condominium,9,OCR,99 yrs lease commencing from 2015,New Sale,2,3500000,3600000,1500,Strata,2400,Oct-24,31 to 35
"""


class TestCSVColumnPreservation:
    """Test that all CSV columns are preserved during cleaning."""

    def get_sample_df(self):
        """Create a sample DataFrame from CSV data."""
        return pd.read_csv(StringIO(SAMPLE_CSV))

    def test_original_columns_preserved(self):
        """Test that original CSV columns are not dropped."""
        df = self.get_sample_df()
        original_columns = set(df.columns)

        cleaned = clean_csv_data(df)

        # These original columns should still exist (or have DB-friendly versions)
        expected_preserved = [
            'Project Name', 'Street Name', 'Property Type', 'Postal District',
            'Market Segment', 'Tenure', 'Type of Sale', 'Floor Range'
        ]

        for col in expected_preserved:
            assert col in cleaned.columns or col.lower().replace(' ', '_') in cleaned.columns, \
                f"Column '{col}' was dropped during cleaning"

    def test_computed_columns_added(self):
        """Test that computed columns are added."""
        df = self.get_sample_df()
        cleaned = clean_csv_data(df)

        expected_computed = [
            'transaction_date',  # Parsed from Sale Date
            'contract_date',  # Derived from transaction_date
            'price',  # Parsed from Transacted Price ($)
            'area_sqft',  # Parsed from Area (SQFT)
            'psf',  # Parsed from Unit Price ($ PSF)
            'district',  # Parsed from Postal District
            'bedroom_count',  # Classified from area_sqft
        ]

        for col in expected_computed:
            assert col in cleaned.columns, f"Computed column '{col}' not added"

    def test_floor_range_preserved(self):
        """Test that Floor Range is preserved and floor_level is computed."""
        df = self.get_sample_df()
        cleaned = clean_csv_data(df)

        assert 'floor_range' in cleaned.columns, "floor_range not preserved"
        assert 'floor_level' in cleaned.columns, "floor_level not computed"

        # Check floor_level values
        assert cleaned['floor_level'].iloc[0] == 'Mid-High'  # 16 to 20
        assert cleaned['floor_level'].iloc[1] == 'Mid-Low'   # 06 to 10
        assert cleaned['floor_level'].iloc[2] == 'Luxury'    # 31 to 35

    def test_street_name_preserved(self):
        """Test that Street Name is preserved."""
        df = self.get_sample_df()
        cleaned = clean_csv_data(df)

        assert 'street_name' in cleaned.columns, "street_name not preserved"
        assert cleaned['street_name'].iloc[0] == '123 TEST ROAD'

    def test_market_segment_preserved(self):
        """Test that Market Segment is preserved."""
        df = self.get_sample_df()
        cleaned = clean_csv_data(df)

        assert 'market_segment' in cleaned.columns, "market_segment not preserved"
        assert set(cleaned['market_segment']) == {'CCR', 'RCR', 'OCR'}

    def test_type_of_area_preserved(self):
        """Test that Type of Area is preserved."""
        df = self.get_sample_df()
        cleaned = clean_csv_data(df)

        assert 'type_of_area' in cleaned.columns, "type_of_area not preserved"
        assert cleaned['type_of_area'].iloc[0] == 'Strata'

    def test_num_units_parsed(self):
        """Test that No. of Units is parsed as integer."""
        df = self.get_sample_df()
        cleaned = clean_csv_data(df)

        assert 'num_units' in cleaned.columns, "num_units not parsed"
        assert cleaned['num_units'].iloc[0] == 1
        assert cleaned['num_units'].iloc[2] == 2

    def test_nett_price_parsed(self):
        """Test that Nett Price is parsed as float."""
        df = self.get_sample_df()
        cleaned = clean_csv_data(df)

        assert 'nett_price' in cleaned.columns, "nett_price not parsed"
        assert cleaned['nett_price'].iloc[0] == 1000000.0

    def test_property_type_filter(self):
        """Test that only Condo/Apartment properties are kept."""
        csv_with_ec = SAMPLE_CSV + "EC PROJECT,EC ROAD,Executive Condominium,3,OCR,99 yrs,New Sale,1,500000,520000,600,Strata,866,Dec-24,01 to 05\n"
        df = pd.read_csv(StringIO(csv_with_ec))

        cleaned = clean_csv_data(df)

        # EC should be filtered out
        assert 'EC PROJECT' not in cleaned['project_name'].values
        assert len(cleaned) == 3  # Only the 3 original rows

    def test_empty_csv_handling(self):
        """Test handling of empty CSV data."""
        df = pd.DataFrame()
        cleaned = clean_csv_data(df)

        assert cleaned.empty

    def test_missing_required_columns(self):
        """Test handling when required columns are missing."""
        csv_without_sale_date = """Project Name,Price
TEST CONDO,1000000"""
        df = pd.read_csv(StringIO(csv_without_sale_date))

        cleaned = clean_csv_data(df)

        # Should return empty DataFrame if Sale Date is missing
        assert cleaned.empty


class TestDataTypeConsistency:
    """Test that data types are consistent after cleaning."""

    def get_sample_df(self):
        return pd.read_csv(StringIO(SAMPLE_CSV))

    def test_price_is_float(self):
        """Test that price is converted to float."""
        df = self.get_sample_df()
        cleaned = clean_csv_data(df)

        assert cleaned['price'].dtype in ['float64', 'float32']

    def test_area_is_float(self):
        """Test that area_sqft is converted to float."""
        df = self.get_sample_df()
        cleaned = clean_csv_data(df)

        assert cleaned['area_sqft'].dtype in ['float64', 'float32']

    def test_bedroom_count_is_int(self):
        """Test that bedroom_count is an integer."""
        df = self.get_sample_df()
        cleaned = clean_csv_data(df)

        assert cleaned['bedroom_count'].dtype in ['int64', 'int32']

    def test_num_units_is_int(self):
        """Test that num_units is an integer."""
        df = self.get_sample_df()
        cleaned = clean_csv_data(df)

        assert cleaned['num_units'].dtype in ['int64', 'int32']


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
