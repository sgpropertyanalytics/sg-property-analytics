"""
API Contract Smoke Tests

These tests validate that the API contract serializers produce correct output.
Run in CI to prevent "200 OK but chart breaks" regressions.

Tests:
1. serialize_aggregate_row() produces expected fields
2. period normalization works for all time grains
3. Enum values are valid
4. Metrics are numbers (not null/string when data exists)
5. PropertyAgeBucket.classify() returns only valid keys
6. Enum key snapshots prevent unintended changes
"""

import pytest
from schemas.api_contract import (
    serialize_aggregate_row,
    serialize_aggregate_response,
    AggregateFields,
    SaleType,
    Region,
    PropertyAgeBucket,
    TIME_BUCKET_FIELDS,
    API_CONTRACT_VERSION,
)


# =============================================================================
# FIXTURES - Simulated API data
# =============================================================================

@pytest.fixture
def quarter_aggregate_row():
    """Simulated row from GROUP BY quarter, sale_type query."""
    return {
        'quarter': '2024-Q4',
        'sale_type': 'New Sale',
        'count': 788,
        'avg_psf': 2150.50,
        'median_psf': 2100.00,
        'total_value': 1175004395,
    }


@pytest.fixture
def month_aggregate_row():
    """Simulated row from GROUP BY month, region query."""
    return {
        'month': '2024-12',
        'region': 'CCR',
        'count': 145,
        'avg_psf': 2850.75,
        'median_psf': 2750.00,
        'total_value': 412500000,
    }


@pytest.fixture
def year_aggregate_row():
    """Simulated row from GROUP BY year query."""
    return {
        'year': 2024,
        'count': 5200,
        'avg_psf': 2200.00,
        'median_psf': 2150.00,
        'total_value': 8500000000,
    }


# =============================================================================
# PERIOD NORMALIZATION TESTS
# =============================================================================

class TestPeriodNormalization:
    """Test that time buckets are normalized to unified 'period' field."""

    def test_quarter_produces_period(self, quarter_aggregate_row):
        """Quarter grouping should add period='2024-Q4' and periodGrain='quarter'."""
        result = serialize_aggregate_row(quarter_aggregate_row)

        assert 'period' in result, "Missing 'period' field"
        assert result['period'] == '2024-Q4'
        assert result['periodGrain'] == 'quarter'

    def test_month_produces_period(self, month_aggregate_row):
        """Month grouping should add period='2024-12' and periodGrain='month'."""
        result = serialize_aggregate_row(month_aggregate_row)

        assert 'period' in result, "Missing 'period' field"
        assert result['period'] == '2024-12'
        assert result['periodGrain'] == 'month'

    def test_year_produces_period(self, year_aggregate_row):
        """Year grouping should add period=2024 and periodGrain='year'."""
        result = serialize_aggregate_row(year_aggregate_row)

        assert 'period' in result, "Missing 'period' field"
        assert result['period'] == 2024
        assert result['periodGrain'] == 'year'

    def test_legacy_fields_included_by_default(self, quarter_aggregate_row):
        """Legacy time fields should be included for backwards compat."""
        result = serialize_aggregate_row(quarter_aggregate_row, include_deprecated=True)

        assert 'quarter' in result, "Missing legacy 'quarter' field"
        assert result['quarter'] == '2024-Q4'

    def test_legacy_fields_excluded_in_v2_strict(self, quarter_aggregate_row):
        """Legacy time fields should be excluded in strict v2 mode."""
        result = serialize_aggregate_row(quarter_aggregate_row, include_deprecated=False)

        assert 'quarter' not in result, "Legacy 'quarter' should not be in v2 strict"
        assert 'period' in result


# =============================================================================
# ENUM VALIDATION TESTS
# =============================================================================

class TestEnumValues:
    """Test that enum values are valid API enums."""

    def test_sale_type_enum_conversion(self, quarter_aggregate_row):
        """sale_type should be converted to lowercase enum."""
        result = serialize_aggregate_row(quarter_aggregate_row)

        assert 'saleType' in result, "Missing 'saleType' field"
        assert result['saleType'] == SaleType.NEW_SALE
        assert result['saleType'] in SaleType.ALL

    def test_region_enum_conversion(self, month_aggregate_row):
        """region should be converted to lowercase enum in v2 strict mode."""
        # In dual mode (default), uppercase is preserved for backwards compat
        result_dual = serialize_aggregate_row(month_aggregate_row, include_deprecated=True)
        assert 'region' in result_dual, "Missing 'region' field"
        assert result_dual['region'] == 'CCR'  # uppercase in dual mode (v1 compat)

        # In v2 strict mode, lowercase enum is used
        result_v2 = serialize_aggregate_row(month_aggregate_row, include_deprecated=False)
        assert 'region' in result_v2, "Missing 'region' field in v2"
        assert result_v2['region'] == 'ccr'  # lowercase in v2 strict
        assert result_v2['region'] in Region.ALL

    def test_invalid_sale_type_passes_through(self):
        """Unknown sale_type should pass through (graceful degradation)."""
        row = {'quarter': '2024-Q4', 'sale_type': 'Unknown Type', 'count': 10}
        result = serialize_aggregate_row(row)

        # Should not crash, should pass through
        assert 'saleType' in result


# =============================================================================
# METRIC VALIDATION TESTS
# =============================================================================

class TestMetricValues:
    """Test that metrics are proper numeric types."""

    def test_metrics_are_numbers(self, quarter_aggregate_row):
        """Metric fields should be numeric (int or float)."""
        result = serialize_aggregate_row(quarter_aggregate_row)

        # Check v2 camelCase fields
        assert isinstance(result['avgPsf'], (int, float)), "avgPsf should be numeric"
        assert isinstance(result['medianPsf'], (int, float)), "medianPsf should be numeric"
        assert isinstance(result['totalValue'], (int, float)), "totalValue should be numeric"
        assert isinstance(result['count'], int), "count should be int"

    def test_null_metrics_stay_null(self):
        """Null metrics should remain null (not converted to 0)."""
        row = {
            'quarter': '2024-Q4',
            'count': 5,
            'avg_psf': None,
            'median_psf': None,
        }
        result = serialize_aggregate_row(row)

        assert result['avgPsf'] is None, "Null avgPsf should remain null"
        assert result['medianPsf'] is None, "Null medianPsf should remain null"

    def test_count_is_integer(self, quarter_aggregate_row):
        """count should always be an integer."""
        result = serialize_aggregate_row(quarter_aggregate_row)

        assert isinstance(result['count'], int)
        assert result['count'] == 788


# =============================================================================
# RESPONSE WRAPPER TESTS
# =============================================================================

class TestAggregateResponse:
    """Test the full response wrapper."""

    def test_response_structure(self, quarter_aggregate_row):
        """Response should have data array and meta object."""
        data = [quarter_aggregate_row]
        meta = {'total': 1, 'limit': 100}

        result = serialize_aggregate_response(data, meta)

        assert 'data' in result
        assert 'meta' in result
        assert isinstance(result['data'], list)
        assert len(result['data']) == 1

    def test_meta_includes_contract_version(self, quarter_aggregate_row):
        """Meta should include apiContractVersion."""
        data = [quarter_aggregate_row]
        meta = {}

        result = serialize_aggregate_response(data, meta)

        assert result['meta']['apiContractVersion'] == API_CONTRACT_VERSION

    def test_empty_data_array(self):
        """Empty data should return empty array, not null."""
        result = serialize_aggregate_response([], {})

        assert result['data'] == []
        assert 'apiContractVersion' in result['meta']


# =============================================================================
# FIELD NAME TESTS
# =============================================================================

class TestFieldNames:
    """Test that field names follow v2 camelCase convention."""

    def test_v2_camel_case_fields(self, quarter_aggregate_row):
        """v2 response should have camelCase field names."""
        result = serialize_aggregate_row(quarter_aggregate_row, include_deprecated=False)

        # Should have camelCase
        assert 'avgPsf' in result
        assert 'medianPsf' in result
        assert 'totalValue' in result
        assert 'saleType' in result

        # Should NOT have snake_case in v2 strict
        assert 'avg_psf' not in result
        assert 'median_psf' not in result
        assert 'total_value' not in result
        assert 'sale_type' not in result

    def test_dual_mode_has_both(self, quarter_aggregate_row):
        """Default dual mode should have both field formats."""
        result = serialize_aggregate_row(quarter_aggregate_row, include_deprecated=True)

        # Should have both
        assert 'avgPsf' in result
        assert 'avg_psf' in result
        assert result['avgPsf'] == result['avg_psf']


# =============================================================================
# REGRESSION TESTS
# =============================================================================

class TestRegressions:
    """Tests for specific bugs that were fixed."""

    def test_period_field_always_present_with_time_data(self):
        """Period field must always be present when time grouping is used."""
        for time_field in TIME_BUCKET_FIELDS:
            row = {time_field: '2024-01', 'count': 10}
            result = serialize_aggregate_row(row)

            assert 'period' in result, f"Missing period for {time_field} grouping"
            assert 'periodGrain' in result, f"Missing periodGrain for {time_field} grouping"
            assert result['periodGrain'] == time_field

    def test_no_period_without_time_data(self):
        """Non-time groupings should not have period field."""
        row = {'district': 'D01', 'count': 100}
        result = serialize_aggregate_row(row)

        # Should NOT have period (no time data)
        assert result.get('period') is None
        assert result.get('periodGrain') is None

    def test_quarter_sorting_format(self):
        """Quarter format '2024-Q4' should sort correctly as string."""
        quarters = ['2024-Q1', '2024-Q2', '2024-Q3', '2024-Q4', '2025-Q1']
        sorted_quarters = sorted(quarters)

        # Natural string sort should work for this format
        assert sorted_quarters == quarters, "Quarter format should sort correctly"


# =============================================================================
# SMOKE TEST - Run this in CI
# =============================================================================

class TestContractSmokeTest:
    """
    Minimal smoke test that catches 90% of contract issues.
    Run this in CI on every commit.
    """

    def test_aggregate_contract_smoke(self):
        """
        Smoke test: serialize a typical aggregate row and validate all expected fields.
        This single test catches most contract drift issues.
        """
        # Simulate a typical API response row
        raw_row = {
            'quarter': '2024-Q4',
            'sale_type': 'Resale',
            'count': 500,
            'avg_psf': 2000.0,
            'median_psf': 1950.0,
            'total_value': 750000000,
        }

        # Serialize with dual mode (default)
        result = serialize_aggregate_row(raw_row)

        # ========== ASSERTIONS ==========
        # 1. Period exists
        assert 'period' in result, "CRITICAL: Missing 'period' field"
        assert result['period'] == '2024-Q4'

        # 2. PeriodGrain matches expected
        assert result['periodGrain'] == 'quarter', "CRITICAL: periodGrain mismatch"

        # 3. Metrics are numbers
        assert isinstance(result['avgPsf'], (int, float)), "avgPsf must be numeric"
        assert isinstance(result['medianPsf'], (int, float)), "medianPsf must be numeric"
        assert isinstance(result['totalValue'], (int, float)), "totalValue must be numeric"
        assert isinstance(result['count'], int), "count must be integer"

        # 4. SaleType is valid enum
        assert result['saleType'] in SaleType.ALL, f"Invalid saleType: {result['saleType']}"

        # 5. v1 compat fields present (dual mode)
        assert 'avg_psf' in result, "Missing v1 compat field"
        assert 'quarter' in result, "Missing v1 compat time field"

        print("✅ Contract smoke test PASSED")


# =============================================================================
# PROPERTY AGE BUCKET TESTS
# =============================================================================

class TestPropertyAgeBucket:
    """
    Tests for PropertyAgeBucket enum integrity.

    These tests enforce the Taxonomy & Enum Integrity policy:
    - All classify() outputs must be valid keys
    - Enum keys must not change without explicit intent
    """

    # Snapshot of expected keys - update ONLY with deliberate intent
    EXPECTED_KEYS = ['new_sale', 'recently_top', 'young_resale', 'resale', 'mature_resale', 'freehold']
    EXPECTED_ALL_KEYS = EXPECTED_KEYS + ['unknown']

    def test_classify_returns_valid_keys_only(self):
        """
        CRITICAL: PropertyAgeBucket.classify() must only return keys in ALL or 'unknown'.

        This test catches if someone adds a new bucket in classify() without
        adding it to the ALL list.
        """
        valid_keys = set(PropertyAgeBucket.all_keys())

        # Test all age ranges
        test_cases = [
            # (age, sale_type, tenure, expected_in_valid)
            (None, 'New Sale', None),      # new_sale
            (None, 'Resale', 'Freehold'),  # freehold
            (None, 'Resale', '99-year'),   # unknown (no age)
            (2, 'Resale', '99-year'),      # unknown (0-4 years)
            (5, 'Resale', '99-year'),      # recently_top
            (10, 'Resale', '99-year'),     # young_resale
            (20, 'Resale', '99-year'),     # resale
            (30, 'Resale', '99-year'),     # mature_resale
        ]

        for age, sale_type, tenure in test_cases:
            result = PropertyAgeBucket.classify(age=age, sale_type=sale_type, tenure=tenure)
            assert result in valid_keys, \
                f"classify(age={age}, sale_type={sale_type}, tenure={tenure}) " \
                f"returned '{result}' which is not in valid keys: {valid_keys}"

    def test_enum_key_snapshot(self):
        """
        SNAPSHOT TEST: Enum keys must match expected snapshot.

        If this test fails, you must:
        1. Verify the change was intentional
        2. Update EXPECTED_KEYS in this test
        3. Update frontend constants/index.js to match
        4. Update any SQL that references bucket keys
        """
        actual_keys = sorted(PropertyAgeBucket.ALL)
        expected_keys = sorted(self.EXPECTED_KEYS)

        assert actual_keys == expected_keys, \
            f"PropertyAgeBucket.ALL changed!\n" \
            f"  Expected: {expected_keys}\n" \
            f"  Actual:   {actual_keys}\n" \
            f"If intentional, update EXPECTED_KEYS in test_api_contract.py"

    def test_all_keys_includes_unknown(self):
        """all_keys() should include 'unknown' as a valid fallback."""
        all_keys = PropertyAgeBucket.all_keys()
        assert 'unknown' in all_keys, "all_keys() must include 'unknown'"

    def test_age_ranges_match_bucket_keys(self):
        """AGE_RANGES keys must be subset of ALL."""
        for bucket in PropertyAgeBucket.AGE_RANGES.keys():
            assert bucket in PropertyAgeBucket.ALL, \
                f"AGE_RANGES has key '{bucket}' not in ALL"

    def test_classify_new_sale_priority(self):
        """New Sale sale_type should always return 'new_sale', regardless of age."""
        # Even with age=30, New Sale should return new_sale
        result = PropertyAgeBucket.classify(age=30, sale_type='New Sale', tenure='99-year')
        assert result == PropertyAgeBucket.NEW_SALE

    def test_classify_freehold_priority(self):
        """Freehold tenure should always return 'freehold', regardless of age."""
        result = PropertyAgeBucket.classify(age=10, sale_type='Resale', tenure='Freehold')
        assert result == PropertyAgeBucket.FREEHOLD

    def test_classify_strict_mode_raises(self):
        """In strict mode, classify() should raise for unknown buckets."""
        with pytest.raises(ValueError):
            PropertyAgeBucket.classify(age=None, sale_type='Resale', tenure='99-year', strict=True)

        with pytest.raises(ValueError):
            PropertyAgeBucket.classify(age=2, sale_type='Resale', tenure='99-year', strict=True)

    def test_age_band_boundaries(self):
        """Test exact boundary conditions for age bands."""
        # recently_top: 4-8 (exclusive upper)
        assert PropertyAgeBucket.classify(age=3, sale_type='Resale', tenure='99-year') == 'unknown'
        assert PropertyAgeBucket.classify(age=4, sale_type='Resale', tenure='99-year') == 'recently_top'
        assert PropertyAgeBucket.classify(age=7, sale_type='Resale', tenure='99-year') == 'recently_top'
        assert PropertyAgeBucket.classify(age=8, sale_type='Resale', tenure='99-year') == 'young_resale'

        # young_resale: 8-15
        assert PropertyAgeBucket.classify(age=14, sale_type='Resale', tenure='99-year') == 'young_resale'
        assert PropertyAgeBucket.classify(age=15, sale_type='Resale', tenure='99-year') == 'resale'

        # resale: 15-25
        assert PropertyAgeBucket.classify(age=24, sale_type='Resale', tenure='99-year') == 'resale'
        assert PropertyAgeBucket.classify(age=25, sale_type='Resale', tenure='99-year') == 'mature_resale'

        # mature_resale: 25+
        assert PropertyAgeBucket.classify(age=50, sale_type='Resale', tenure='99-year') == 'mature_resale'


class TestEnumIntegrityGuardrails:
    """
    Meta-tests to enforce the Taxonomy & Enum Integrity policy.

    These tests ensure the codebase follows the "No Drift" rules.
    """

    def test_no_hardcoded_bucket_strings_in_classify(self):
        """
        Verify that classify() uses PropertyAgeBucket constants, not strings.

        This is a design-time check - if classify() hardcodes strings,
        renaming a bucket would silently break.
        """
        import inspect
        source = inspect.getsource(PropertyAgeBucket.classify)

        # The implementation should reference cls.NEW_SALE, not 'new_sale'
        # (except in return statements for 'unknown')
        forbidden_patterns = [
            "'recently_top'",
            "'young_resale'",
            "'resale'",  # This one is tricky - 'resale' could be in Resale check
            "'mature_resale'",
            # 'new_sale' is returned via cls.NEW_SALE, 'freehold' via cls.FREEHOLD
        ]

        for pattern in ['recently_top', 'young_resale', 'mature_resale']:
            # Should NOT have literal string, should use cls.CONSTANT
            assert f"'{pattern}'" not in source or f"cls.{pattern.upper()}" in source, \
                f"Found hardcoded '{pattern}' in classify() instead of cls.{pattern.upper()}"
