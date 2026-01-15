"""
Tests for URA Canonical Mapper

Tests the transformation from URA API responses to DB schema.
"""

import pytest
from datetime import date
import json

from services.ura_canonical_mapper import (
    URACanonicalMapper,
    parse_contract_date,
    format_contract_date,
    parse_float_safe,
    parse_int_safe,
    normalize_district,
    map_sale_type,
    map_ura_projects_to_rows,
    NATURAL_KEY_FIELDS,
)
from constants import SALE_TYPE_NEW, SALE_TYPE_SUB, SALE_TYPE_RESALE


# =============================================================================
# Fixtures
# =============================================================================

@pytest.fixture
def sample_ura_project():
    """Sample URA API project with transactions.

    Note: URA API returns area in square meters (sqm).
    764 sqft = ~71 sqm
    """
    return {
        "project": "THE SAIL @ MARINA BAY",
        "street": "MARINA BOULEVARD",
        "marketSegment": "CCR",
        "x": "29584.9",
        "y": "29432.2",
        "transaction": [
            {
                "contractDate": "0125",
                "propertyType": "Condominium",
                "district": "01",
                "tenure": "99 yrs lease commencing from 2005",
                "price": "1580000",
                "area": "71",  # sqm (≈764 sqft)
                "floorRange": "21 to 25",
                "typeOfSale": "3",
                "noOfUnits": "1"
            },
            {
                "contractDate": "1224",
                "propertyType": "Condominium",
                "district": "01",
                "tenure": "99 yrs lease commencing from 2005",
                "price": "1650000",
                "area": "71",  # sqm (≈764 sqft)
                "floorRange": "16 to 20",
                "typeOfSale": "3",
                "noOfUnits": "1"
            }
        ]
    }


@pytest.fixture
def sample_new_sale_project():
    """Sample URA project with new sale transaction.

    Note: URA API returns area in square meters (sqm).
    850 sqft = ~79 sqm
    """
    return {
        "project": "MARINA ONE RESIDENCES",
        "street": "MARINA WAY",
        "marketSegment": "CCR",
        "x": "29700.1",
        "y": "29300.5",
        "transaction": [
            {
                "contractDate": "0623",
                "propertyType": "Condominium",
                "district": "01",
                "tenure": "99 yrs lease commencing from 2014",
                "price": "2100000",
                "area": "79",  # sqm (≈850 sqft)
                "floorRange": "31 to 35",
                "typeOfSale": "1",
                "noOfUnits": "1"
            }
        ]
    }


@pytest.fixture
def mapper():
    """Create a URACanonicalMapper instance."""
    return URACanonicalMapper()


# =============================================================================
# Date Parsing Tests
# =============================================================================

class TestParseContractDate:
    """Tests for contract date parsing."""

    def test_parse_valid_date_january(self):
        """Parse January 2025."""
        result = parse_contract_date("0125")
        assert result == date(2025, 1, 1)

    def test_parse_valid_date_december(self):
        """Parse December 2024."""
        result = parse_contract_date("1224")
        assert result == date(2024, 12, 1)

    def test_parse_valid_date_june(self):
        """Parse June 2023."""
        result = parse_contract_date("0623")
        assert result == date(2023, 6, 1)

    def test_parse_none_returns_none(self):
        """None input returns None."""
        assert parse_contract_date(None) is None

    def test_parse_empty_string_returns_none(self):
        """Empty string returns None."""
        assert parse_contract_date("") is None

    def test_parse_invalid_length_returns_none(self):
        """Invalid length returns None."""
        assert parse_contract_date("012") is None
        assert parse_contract_date("01234") is None

    def test_parse_invalid_month_returns_none(self):
        """Invalid month (13+) returns None."""
        assert parse_contract_date("1325") is None
        assert parse_contract_date("0025") is None

    def test_parse_non_numeric_returns_none(self):
        """Non-numeric input returns None."""
        assert parse_contract_date("abcd") is None

    def test_parse_with_whitespace(self):
        """Handles whitespace."""
        result = parse_contract_date(" 0125 ")
        assert result == date(2025, 1, 1)


class TestFormatContractDate:
    """Tests for contract date formatting."""

    def test_format_january(self):
        """Format January 2025."""
        result = format_contract_date(date(2025, 1, 1))
        assert result == "0125"

    def test_format_december(self):
        """Format December 2024."""
        result = format_contract_date(date(2024, 12, 1))
        assert result == "1224"


# =============================================================================
# Field Parsing Tests
# =============================================================================

class TestParseFloatSafe:
    """Tests for safe float parsing."""

    def test_parse_float_string(self):
        """Parse float from string."""
        assert parse_float_safe("1580000") == 1580000.0

    def test_parse_float_with_decimals(self):
        """Parse float with decimals."""
        assert parse_float_safe("764.5") == 764.5

    def test_parse_none_returns_none(self):
        """None returns None."""
        assert parse_float_safe(None) is None

    def test_parse_invalid_returns_none(self):
        """Invalid string returns None."""
        assert parse_float_safe("invalid") is None


class TestParseIntSafe:
    """Tests for safe int parsing."""

    def test_parse_int_string(self):
        """Parse int from string."""
        assert parse_int_safe("1") == 1

    def test_parse_int_from_float_string(self):
        """Parse int from float string."""
        assert parse_int_safe("1.0") == 1

    def test_parse_none_returns_default(self):
        """None returns default."""
        assert parse_int_safe(None, default=5) == 5

    def test_parse_invalid_returns_default(self):
        """Invalid string returns default."""
        assert parse_int_safe("invalid", default=1) == 1


class TestNormalizeDistrict:
    """Tests for district normalization."""

    def test_normalize_single_digit(self):
        """Normalize single digit to D0X."""
        assert normalize_district("1") == "D01"

    def test_normalize_two_digit(self):
        """Normalize two digits to DXX."""
        assert normalize_district("01") == "D01"
        assert normalize_district("12") == "D12"
        assert normalize_district("28") == "D28"

    def test_normalize_already_prefixed(self):
        """Already prefixed stays normalized."""
        assert normalize_district("D01") == "D01"
        assert normalize_district("d12") == "D12"

    def test_normalize_empty_returns_empty(self):
        """Empty returns empty."""
        assert normalize_district("") == ""
        assert normalize_district(None) == ""


class TestMapSaleType:
    """Tests for sale type mapping."""

    def test_map_new_sale(self):
        """Map type 1 to New Sale."""
        assert map_sale_type("1") == SALE_TYPE_NEW

    def test_map_sub_sale(self):
        """Map type 2 to Sub Sale."""
        assert map_sale_type("2") == SALE_TYPE_SUB

    def test_map_resale(self):
        """Map type 3 to Resale."""
        assert map_sale_type("3") == SALE_TYPE_RESALE

    def test_map_unknown_defaults_to_resale(self):
        """Unknown type defaults to Resale."""
        assert map_sale_type("4") == SALE_TYPE_RESALE
        assert map_sale_type("") == SALE_TYPE_RESALE


# =============================================================================
# URACanonicalMapper Tests
# =============================================================================

class TestURACanonicalMapperInit:
    """Tests for mapper initialization."""

    def test_init_default_source(self):
        """Default source is 'ura_api'."""
        mapper = URACanonicalMapper()
        assert mapper.source == "ura_api"

    def test_init_custom_source(self):
        """Custom source can be set."""
        mapper = URACanonicalMapper(source="test_source")
        assert mapper.source == "test_source"

    def test_stats_initialized_to_zero(self):
        """Stats initialized to zero."""
        mapper = URACanonicalMapper()
        stats = mapper.get_stats()
        assert stats["projects_processed"] == 0
        assert stats["transactions_processed"] == 0
        assert stats["transactions_skipped"] == 0


class TestPSFCalculation:
    """Tests for PSF calculation safety."""

    def test_psf_no_nan_infinity(self, mapper):
        """PSF should never be NaN or Infinity."""
        project = {
            "project": "TEST PROJECT",
            "transaction": [
                {
                    "contractDate": "0125",
                    "price": "1000000",
                    "area": "50"  # 50 sqm ≈ 538 sqft
                }
            ]
        }
        rows = list(mapper.map_project(project))
        import math
        assert not math.isnan(rows[0]["psf"])
        assert not math.isinf(rows[0]["psf"])

    def test_psf_calculated_correctly(self, mapper, sample_ura_project):
        """PSF should be price / area_sqft, rounded to 2 decimals."""
        rows = list(mapper.map_project(sample_ura_project))
        # First transaction: price=1580000, area=71 sqm → 764.24 sqft
        expected_psf = round(1580000 / 764.24, 2)
        assert rows[0]["psf"] == expected_psf

    def test_area_conversion_sqm_to_sqft(self, mapper):
        """Area should be converted from sqm to sqft."""
        project = {
            "project": "TEST PROJECT",
            "transaction": [
                {
                    "contractDate": "0125",
                    "price": "1000000",
                    "area": "100"  # 100 sqm
                }
            ]
        }
        rows = list(mapper.map_project(project))
        # 100 sqm * 10.7639 = 1076.39 sqft
        assert rows[0]["area_sqft"] == 1076.39


class TestURACanonicalMapperMapProject:
    """Tests for project mapping."""

    def test_map_project_returns_iterator(self, mapper, sample_ura_project):
        """map_project returns an iterator."""
        result = mapper.map_project(sample_ura_project)
        assert hasattr(result, '__iter__')

    def test_map_project_correct_count(self, mapper, sample_ura_project):
        """Maps correct number of transactions."""
        rows = list(mapper.map_project(sample_ura_project))
        assert len(rows) == 2

    def test_map_project_project_name(self, mapper, sample_ura_project):
        """Project name is mapped correctly."""
        rows = list(mapper.map_project(sample_ura_project))
        assert rows[0]["project_name"] == "THE SAIL @ MARINA BAY"

    def test_map_project_street_name(self, mapper, sample_ura_project):
        """Street name is mapped correctly."""
        rows = list(mapper.map_project(sample_ura_project))
        assert rows[0]["street_name"] == "MARINA BOULEVARD"

    def test_map_project_market_segment(self, mapper, sample_ura_project):
        """Market segment is mapped correctly."""
        rows = list(mapper.map_project(sample_ura_project))
        assert rows[0]["market_segment"] == "CCR"

    def test_map_project_transaction_date(self, mapper, sample_ura_project):
        """Transaction date is parsed correctly."""
        rows = list(mapper.map_project(sample_ura_project))
        assert rows[0]["transaction_date"] == date(2025, 1, 1)
        assert rows[1]["transaction_date"] == date(2024, 12, 1)

    def test_map_project_price(self, mapper, sample_ura_project):
        """Price is parsed correctly."""
        rows = list(mapper.map_project(sample_ura_project))
        assert rows[0]["price"] == 1580000.0
        assert rows[1]["price"] == 1650000.0

    def test_map_project_area_sqft(self, mapper, sample_ura_project):
        """Area is converted from sqm to sqft correctly."""
        rows = list(mapper.map_project(sample_ura_project))
        # 71 sqm * 10.7639 = 764.24 sqft
        assert rows[0]["area_sqft"] == 764.24

    def test_map_project_psf_calculated(self, mapper, sample_ura_project):
        """PSF is calculated correctly (price / area_sqft)."""
        rows = list(mapper.map_project(sample_ura_project))
        # price=1580000, area=71 sqm → 764.24 sqft
        expected_psf = round(1580000 / 764.24, 2)
        assert rows[0]["psf"] == expected_psf

    def test_map_project_district_normalized(self, mapper, sample_ura_project):
        """District is normalized to D0X format."""
        rows = list(mapper.map_project(sample_ura_project))
        assert rows[0]["district"] == "D01"

    def test_map_project_sale_type(self, mapper, sample_ura_project):
        """Sale type is mapped correctly (resale)."""
        rows = list(mapper.map_project(sample_ura_project))
        assert rows[0]["sale_type"] == SALE_TYPE_RESALE

    def test_map_project_new_sale(self, mapper, sample_new_sale_project):
        """Sale type is mapped correctly (new sale)."""
        rows = list(mapper.map_project(sample_new_sale_project))
        assert rows[0]["sale_type"] == SALE_TYPE_NEW

    def test_map_project_floor_range(self, mapper, sample_ura_project):
        """Floor range is normalized to XX-YY format for consistent hashing."""
        rows = list(mapper.map_project(sample_ura_project))
        # Input "21 to 25" is normalized to "21-25" for consistent hashing with CSV data
        assert rows[0]["floor_range"] == "21-25"
        assert rows[1]["floor_range"] == "16-20"

    def test_map_project_floor_level_classified(self, mapper, sample_ura_project):
        """Floor level is classified."""
        rows = list(mapper.map_project(sample_ura_project))
        # Floor range "21 to 25" should be classified
        assert rows[0]["floor_level"] is not None

    def test_map_project_bedroom_count(self, mapper, sample_ura_project):
        """Bedroom count is classified."""
        rows = list(mapper.map_project(sample_ura_project))
        # 764 sqft should classify to some bedroom count
        assert rows[0]["bedroom_count"] is not None

    def test_map_project_tenure_preserved(self, mapper, sample_ura_project):
        """Tenure is preserved."""
        rows = list(mapper.map_project(sample_ura_project))
        assert rows[0]["tenure"] == "99 yrs lease commencing from 2005"

    def test_map_project_lease_start_year(self, mapper, sample_ura_project):
        """Lease start year is extracted."""
        rows = list(mapper.map_project(sample_ura_project))
        assert rows[0]["lease_start_year"] == 2005

    def test_map_project_remaining_lease(self, mapper, sample_ura_project):
        """Remaining lease is calculated."""
        rows = list(mapper.map_project(sample_ura_project))
        # 99 years from 2005, transaction in 2025 = ~79 years remaining
        assert rows[0]["remaining_lease"] is not None
        assert rows[0]["remaining_lease"] > 70
        assert rows[0]["remaining_lease"] < 85

    def test_map_project_source(self, mapper, sample_ura_project):
        """Source is set correctly."""
        rows = list(mapper.map_project(sample_ura_project))
        assert rows[0]["source"] == "ura_api"

    def test_map_project_row_hash(self, mapper, sample_ura_project):
        """Row hash is computed."""
        rows = list(mapper.map_project(sample_ura_project))
        assert rows[0]["row_hash"] is not None
        assert len(rows[0]["row_hash"]) > 0

    def test_map_project_unique_row_hashes(self, mapper, sample_ura_project):
        """Different transactions have different row hashes."""
        rows = list(mapper.map_project(sample_ura_project))
        assert rows[0]["row_hash"] != rows[1]["row_hash"]

    def test_map_project_contract_date_stored(self, mapper, sample_ura_project):
        """Original contract date is stored."""
        rows = list(mapper.map_project(sample_ura_project))
        assert rows[0]["contract_date"] == "0125"

    def test_map_project_transaction_month(self, mapper, sample_ura_project):
        """Transaction month is first of month."""
        rows = list(mapper.map_project(sample_ura_project))
        assert rows[0]["transaction_month"] == date(2025, 1, 1)
        assert rows[0]["transaction_month"].day == 1


class TestURACanonicalMapperSchemaDrift:
    """Tests for unknown field preservation."""

    def test_unknown_transaction_fields_preserved(self, mapper):
        """Unknown transaction fields are preserved in raw_extras."""
        project = {
            "project": "TEST PROJECT",
            "street": "TEST STREET",
            "transaction": [
                {
                    "contractDate": "0125",
                    "price": "1000000",
                    "area": "500",
                    "unknownField": "some_value",
                    "anotherUnknown": 123
                }
            ]
        }
        rows = list(mapper.map_project(project))
        assert len(rows) == 1

        raw_extras = json.loads(rows[0]["raw_extras"])
        assert "_transaction" in raw_extras
        assert raw_extras["_transaction"]["unknownField"] == "some_value"
        assert raw_extras["_transaction"]["anotherUnknown"] == 123

    def test_unknown_project_fields_preserved(self, mapper):
        """Unknown project fields are preserved in raw_extras."""
        project = {
            "project": "TEST PROJECT",
            "street": "TEST STREET",
            "newProjectField": "project_value",
            "transaction": [
                {
                    "contractDate": "0125",
                    "price": "1000000",
                    "area": "500"
                }
            ]
        }
        rows = list(mapper.map_project(project))
        assert len(rows) == 1

        raw_extras = json.loads(rows[0]["raw_extras"])
        assert "_project" in raw_extras
        assert raw_extras["_project"]["newProjectField"] == "project_value"

    def test_svy21_coordinates_preserved(self, mapper, sample_ura_project):
        """SVY21 coordinates are preserved in raw_extras."""
        rows = list(mapper.map_project(sample_ura_project))

        raw_extras = json.loads(rows[0]["raw_extras"])
        assert raw_extras["svy21_x"] == "29584.9"
        assert raw_extras["svy21_y"] == "29432.2"


class TestURACanonicalMapperSkipping:
    """Tests for transaction skipping logic."""

    def test_skip_missing_price(self, mapper):
        """Skip transactions with missing price."""
        project = {
            "project": "TEST",
            "transaction": [
                {"contractDate": "0125", "area": "500"}
            ]
        }
        rows = list(mapper.map_project(project))
        assert len(rows) == 0

    def test_skip_zero_price(self, mapper):
        """Skip transactions with zero price."""
        project = {
            "project": "TEST",
            "transaction": [
                {"contractDate": "0125", "price": "0", "area": "500"}
            ]
        }
        rows = list(mapper.map_project(project))
        assert len(rows) == 0

    def test_skip_missing_area(self, mapper):
        """Skip transactions with missing area."""
        project = {
            "project": "TEST",
            "transaction": [
                {"contractDate": "0125", "price": "1000000"}
            ]
        }
        rows = list(mapper.map_project(project))
        assert len(rows) == 0

    def test_skip_zero_area(self, mapper):
        """Skip transactions with zero area."""
        project = {
            "project": "TEST",
            "transaction": [
                {"contractDate": "0125", "price": "1000000", "area": "0"}
            ]
        }
        rows = list(mapper.map_project(project))
        assert len(rows) == 0

    def test_skip_invalid_contract_date(self, mapper):
        """Skip transactions with invalid contract date."""
        project = {
            "project": "TEST",
            "transaction": [
                {"contractDate": "invalid", "price": "1000000", "area": "500"}
            ]
        }
        rows = list(mapper.map_project(project))
        assert len(rows) == 0

    def test_skip_empty_transactions(self, mapper):
        """Handle project with no transactions."""
        project = {
            "project": "TEST",
            "transaction": []
        }
        rows = list(mapper.map_project(project))
        assert len(rows) == 0


class TestURACanonicalMapperStats:
    """Tests for statistics tracking."""

    def test_stats_projects_processed(self, mapper, sample_ura_project):
        """Projects processed is tracked."""
        list(mapper.map_project(sample_ura_project))
        stats = mapper.get_stats()
        assert stats["projects_processed"] == 1

    def test_stats_transactions_processed(self, mapper, sample_ura_project):
        """Transactions processed is tracked."""
        list(mapper.map_project(sample_ura_project))
        stats = mapper.get_stats()
        assert stats["transactions_processed"] == 2

    def test_stats_transactions_skipped(self, mapper):
        """Transactions skipped is tracked."""
        project = {
            "project": "TEST",
            "transaction": [
                {"contractDate": "0125", "price": "1000000", "area": "500"},
                {"contractDate": "invalid", "price": "1000000", "area": "500"},  # skipped
            ]
        }
        list(mapper.map_project(project))
        stats = mapper.get_stats()
        assert stats["transactions_processed"] == 1
        assert stats["transactions_skipped"] == 1

    def test_reset_stats(self, mapper, sample_ura_project):
        """Stats can be reset."""
        list(mapper.map_project(sample_ura_project))
        mapper.reset_stats()
        stats = mapper.get_stats()
        assert stats["projects_processed"] == 0
        assert stats["transactions_processed"] == 0

    def test_skip_invalid_date_counter(self, mapper):
        """Skip counter tracks invalid dates (month 00, 13, etc)."""
        project = {
            "project": "TEST",
            "transaction": [
                {"contractDate": "0025", "price": "1000000", "area": "500"},  # month 00
                {"contractDate": "1325", "price": "1000000", "area": "500"},  # month 13
            ]
        }
        list(mapper.map_project(project))
        stats = mapper.get_stats()
        assert stats["skip_invalid_date"] == 2
        assert stats["transactions_skipped"] == 2

    def test_skip_invalid_price_counter(self, mapper):
        """Skip counter tracks invalid prices."""
        project = {
            "project": "TEST",
            "transaction": [
                {"contractDate": "0125", "price": "0", "area": "500"},
                {"contractDate": "0125", "price": "-100", "area": "500"},
            ]
        }
        list(mapper.map_project(project))
        stats = mapper.get_stats()
        assert stats["skip_invalid_price"] == 2

    def test_skip_invalid_area_counter(self, mapper):
        """Skip counter tracks invalid areas."""
        project = {
            "project": "TEST",
            "transaction": [
                {"contractDate": "0125", "price": "1000000", "area": "0"},
                {"contractDate": "0125", "price": "1000000"},  # missing area
            ]
        }
        list(mapper.map_project(project))
        stats = mapper.get_stats()
        assert stats["skip_invalid_area"] == 2

    def test_granular_counters_sum_to_total(self, mapper):
        """Granular skip counters sum to total skipped."""
        project = {
            "project": "TEST",
            "transaction": [
                {"contractDate": "0025", "price": "1000000", "area": "500"},  # bad date
                {"contractDate": "0125", "price": "0", "area": "500"},  # bad price
                {"contractDate": "0125", "price": "1000000", "area": "0"},  # bad area
                {"contractDate": "0125", "price": "1000000", "area": "50"},  # valid
            ]
        }
        list(mapper.map_project(project))
        stats = mapper.get_stats()
        # Granular counters
        granular_sum = (
            stats["skip_invalid_date"] +
            stats["skip_invalid_price"] +
            stats["skip_invalid_area"] +
            stats["skip_missing_project"] +
            stats["skip_exception"]
        )
        assert granular_sum == stats["transactions_skipped"]
        assert stats["transactions_processed"] == 1


class TestMapAllProjects:
    """Tests for map_all_projects method."""

    def test_map_all_projects(self, mapper, sample_ura_project, sample_new_sale_project):
        """Map multiple projects."""
        projects = [sample_ura_project, sample_new_sale_project]
        rows = mapper.map_all_projects(projects)
        assert len(rows) == 3  # 2 from first, 1 from second

    def test_map_all_projects_with_cutoff(self, mapper, sample_ura_project):
        """Map with cutoff date filter."""
        # First transaction is 0125 (Jan 2025), second is 1224 (Dec 2024)
        rows = mapper.map_all_projects(
            [sample_ura_project],
            cutoff_date=date(2025, 1, 1)
        )
        # Only Jan 2025 transaction should be included
        assert len(rows) == 1
        assert rows[0]["transaction_date"] == date(2025, 1, 1)


class TestConvenienceFunctions:
    """Tests for module-level convenience functions."""

    def test_map_ura_projects_to_rows(self, sample_ura_project):
        """Convenience function works."""
        rows = map_ura_projects_to_rows([sample_ura_project])
        assert len(rows) == 2

    def test_map_ura_projects_to_rows_with_cutoff(self, sample_ura_project):
        """Convenience function with cutoff."""
        rows = map_ura_projects_to_rows(
            [sample_ura_project],
            cutoff_date=date(2025, 1, 1)
        )
        assert len(rows) == 1


class TestNaturalKeyFields:
    """Tests for natural key field configuration."""

    def test_natural_key_fields_defined(self):
        """Natural key fields include all uniqueness fields."""
        assert "project_name" in NATURAL_KEY_FIELDS
        assert "transaction_month" in NATURAL_KEY_FIELDS
        assert "price" in NATURAL_KEY_FIELDS
        assert "area_sqft" in NATURAL_KEY_FIELDS
        assert "floor_range" in NATURAL_KEY_FIELDS
        assert "sale_type" in NATURAL_KEY_FIELDS
        assert "district" in NATURAL_KEY_FIELDS

    def test_row_hash_uses_natural_keys(self, mapper, sample_ura_project):
        """Row hash is computed from natural key fields."""
        rows = list(mapper.map_project(sample_ura_project))

        # Two transactions with different prices/dates should have different hashes
        assert rows[0]["row_hash"] != rows[1]["row_hash"]

        # But the hash should be deterministic
        rows2 = list(mapper.map_project(sample_ura_project))
        assert rows[0]["row_hash"] == rows2[0]["row_hash"]

    def test_row_hash_idempotent(self, mapper, sample_ura_project):
        """Same input produces same output (idempotency check)."""
        rows1 = list(mapper.map_project(sample_ura_project))
        mapper.reset_stats()
        rows2 = list(mapper.map_project(sample_ura_project))

        # Same data should produce identical rows (excluding any timestamps)
        for r1, r2 in zip(rows1, rows2):
            assert r1["row_hash"] == r2["row_hash"]
            assert r1["project_name"] == r2["project_name"]
            assert r1["price"] == r2["price"]
            assert r1["psf"] == r2["psf"]
