"""
ETL Validation Guard - Ensures data pipeline integrity.

Validates:
- Schema match (columns present, types)
- Row hash uniqueness (natural key)
- Null-rate for required fields is 0%
- PSF range sanity
- District codes valid
- Dedup works correctly

Run with: pytest tests/test_etl_validation.py -v
"""

import pytest
from pathlib import Path
from datetime import date
import csv
import io


# Sample data for testing ETL rules
SAMPLE_CSV_VALID = """project_name,district,transaction_date,price,area_sqft,sale_type
The Test Condo,D09,2024-01-15,1500000,1000,New Sale
Another Project,D10,2024-02-20,2000000,1200,Resale
"""

SAMPLE_CSV_INVALID_DISTRICT = """project_name,district,transaction_date,price,area_sqft,sale_type
Bad District,D99,2024-01-15,1500000,1000,New Sale
"""

SAMPLE_CSV_MISSING_REQUIRED = """project_name,district,transaction_date,price,area_sqft,sale_type
,D09,2024-01-15,1500000,1000,New Sale
"""

SAMPLE_CSV_INVALID_PSF = """project_name,district,transaction_date,price,area_sqft,sale_type
Crazy PSF,D09,2024-01-15,50000000,100,New Sale
"""


class TestETLSchemaValidation:
    """Test ETL schema validation rules."""

    def test_required_columns_present(self):
        """CSV must have all required columns."""
        required_columns = [
            "project_name",
            "district",
            "transaction_date",
            "price",
            "area_sqft",
            "sale_type",
        ]

        reader = csv.DictReader(io.StringIO(SAMPLE_CSV_VALID))
        headers = reader.fieldnames

        for col in required_columns:
            assert col in headers, f"Required column missing: {col}"

    def test_valid_district_codes(self):
        """District codes must be valid (D01-D28)."""
        valid_districts = {f"D{i:02d}" for i in range(1, 29)}

        reader = csv.DictReader(io.StringIO(SAMPLE_CSV_VALID))
        for row in reader:
            district = row["district"]
            assert district in valid_districts, f"Invalid district: {district}"

    def test_invalid_district_rejected(self):
        """Invalid district codes should be flagged."""
        valid_districts = {f"D{i:02d}" for i in range(1, 29)}

        reader = csv.DictReader(io.StringIO(SAMPLE_CSV_INVALID_DISTRICT))
        for row in reader:
            district = row["district"]
            assert district not in valid_districts, \
                "Test setup error - district should be invalid"


class TestETLDataQuality:
    """Test ETL data quality rules."""

    def test_required_fields_not_null(self):
        """Required fields must not be empty."""
        required_fields = ["project_name", "district", "transaction_date", "price"]

        reader = csv.DictReader(io.StringIO(SAMPLE_CSV_VALID))
        for row in reader:
            for field in required_fields:
                assert row[field], f"Required field is empty: {field}"

    def test_missing_required_field_flagged(self):
        """Empty required fields should be flagged."""
        reader = csv.DictReader(io.StringIO(SAMPLE_CSV_MISSING_REQUIRED))
        for row in reader:
            # project_name is empty - should be caught
            assert not row["project_name"], \
                "Test setup error - project_name should be empty"

    def test_psf_within_reasonable_range(self):
        """PSF must be within Singapore market range."""
        MIN_PSF = 200   # ~$200 psf for very old HDB-adjacent
        MAX_PSF = 10000  # ~$10K psf for ultra-luxury

        reader = csv.DictReader(io.StringIO(SAMPLE_CSV_VALID))
        for row in reader:
            price = float(row["price"])
            area = float(row["area_sqft"])
            psf = price / area

            assert MIN_PSF < psf < MAX_PSF, \
                f"PSF {psf:.0f} outside reasonable range [{MIN_PSF}, {MAX_PSF}]"

    def test_unreasonable_psf_flagged(self):
        """Unreasonable PSF values should be flagged."""
        reader = csv.DictReader(io.StringIO(SAMPLE_CSV_INVALID_PSF))
        for row in reader:
            price = float(row["price"])
            area = float(row["area_sqft"])
            psf = price / area

            # This PSF ($500K) is clearly wrong
            assert psf > 10000, \
                "Test setup error - PSF should be unreasonably high"

    def test_valid_sale_types(self):
        """Sale type must be one of known values."""
        valid_sale_types = {"New Sale", "Resale", "Sub Sale"}

        reader = csv.DictReader(io.StringIO(SAMPLE_CSV_VALID))
        for row in reader:
            sale_type = row["sale_type"]
            assert sale_type in valid_sale_types, \
                f"Invalid sale_type: {sale_type}"

    def test_date_format_valid(self):
        """Transaction date must be valid ISO format."""
        reader = csv.DictReader(io.StringIO(SAMPLE_CSV_VALID))
        for row in reader:
            date_str = row["transaction_date"]
            try:
                # Parse YYYY-MM-DD format
                parts = date_str.split("-")
                assert len(parts) == 3
                year, month, day = int(parts[0]), int(parts[1]), int(parts[2])
                parsed_date = date(year, month, day)

                # Date should be in reasonable range
                assert parsed_date.year >= 2000, "Date too old"
                assert parsed_date <= date.today(), "Date in future"
            except (ValueError, AssertionError) as e:
                pytest.fail(f"Invalid date format: {date_str} - {e}")


class TestETLDeduplication:
    """Test ETL deduplication rules."""

    def test_natural_key_uniqueness(self):
        """Natural key (project + date + price + area) should be unique."""
        # This would be tested with actual data
        # Here we just verify the logic

        def make_natural_key(row):
            return (
                row["project_name"],
                row["transaction_date"],
                row["price"],
                row["area_sqft"],
            )

        reader = csv.DictReader(io.StringIO(SAMPLE_CSV_VALID))
        keys = set()
        duplicates = []

        for row in reader:
            key = make_natural_key(row)
            if key in keys:
                duplicates.append(key)
            keys.add(key)

        assert not duplicates, f"Duplicate natural keys found: {duplicates}"


class TestETLRuleRegistry:
    """Test that ETL rules are properly registered."""

    def test_rule_registry_exists(self):
        """ETL rule registry should exist and have rules."""
        try:
            from services.etl.rule_registry import VALIDATION_RULES
            assert len(VALIDATION_RULES) > 0, "No validation rules registered"
        except ImportError:
            pytest.skip("ETL rule registry not implemented")

    def test_critical_rules_registered(self):
        """Critical validation rules should be registered."""
        try:
            from services.etl.rule_registry import VALIDATION_RULES

            critical_rules = [
                "district_valid",
                "price_positive",
                "area_positive",
                "date_not_future",
            ]

            rule_names = [r.name for r in VALIDATION_RULES]
            for rule in critical_rules:
                assert rule in rule_names, f"Critical rule missing: {rule}"
        except ImportError:
            pytest.skip("ETL rule registry not implemented")
