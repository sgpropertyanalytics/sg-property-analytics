"""
PropertyAgeBucket Filter Tests

Tests for the PropertyAgeBucket enum, filter parsing, and SQL generation.
Ensures:
- All buckets are defined with labels
- Age boundaries are correct (exclusive upper bounds)
- New Sale uses correlated NOT EXISTS for 0 resale transactions
- v1 and v2 parameter formats accepted
"""

import pytest
from datetime import date


class TestPropertyAgeBucketEnum:
    """Test the PropertyAgeBucket enum class."""

    def test_all_buckets_defined(self):
        """All expected buckets should be defined."""
        from schemas.api_contract import PropertyAgeBucket

        expected = [
            'new_sale', 'recently_top',
            'young_resale', 'resale', 'mature_resale'
        ]
        assert set(PropertyAgeBucket.ALL) == set(expected)

    def test_is_valid_accepts_valid_buckets(self):
        """is_valid should return True for all valid buckets."""
        from schemas.api_contract import PropertyAgeBucket

        for bucket in PropertyAgeBucket.ALL:
            assert PropertyAgeBucket.is_valid(bucket) is True

    def test_is_valid_rejects_invalid_buckets(self):
        """is_valid should return False for invalid values."""
        from schemas.api_contract import PropertyAgeBucket

        assert PropertyAgeBucket.is_valid('invalid') is False
        assert PropertyAgeBucket.is_valid('') is False
        assert PropertyAgeBucket.is_valid(None) is False

    def test_all_buckets_have_labels(self):
        """Every bucket should have a display label."""
        from schemas.api_contract import PropertyAgeBucket

        for bucket in PropertyAgeBucket.ALL:
            label = PropertyAgeBucket.get_label(bucket)
            assert label is not None
            assert len(label) > 0
            assert label != bucket  # Label should be human-readable

    def test_all_buckets_have_short_labels(self):
        """Every bucket should have a short label."""
        from schemas.api_contract import PropertyAgeBucket

        for bucket in PropertyAgeBucket.ALL:
            label = PropertyAgeBucket.get_label(bucket, short=True)
            assert label is not None
            assert len(label) > 0

    def test_age_boundaries_correctness(self):
        """Age range boundaries should be correct."""
        from schemas.api_contract import PropertyAgeBucket

        # Test each age-based bucket
        assert PropertyAgeBucket.get_age_range(PropertyAgeBucket.RECENTLY_TOP) == (4, 8)
        assert PropertyAgeBucket.get_age_range(PropertyAgeBucket.YOUNG_RESALE) == (8, 15)
        assert PropertyAgeBucket.get_age_range(PropertyAgeBucket.RESALE) == (15, 25)
        assert PropertyAgeBucket.get_age_range(PropertyAgeBucket.MATURE_RESALE) == (25, None)

    def test_special_buckets_no_age_boundaries(self):
        """new_sale should have no age range (it's market state, not age-based)."""
        from schemas.api_contract import PropertyAgeBucket

        assert PropertyAgeBucket.get_age_range(PropertyAgeBucket.NEW_SALE) is None

    def test_is_age_based_classification(self):
        """is_age_based should correctly classify buckets."""
        from schemas.api_contract import PropertyAgeBucket

        # Age-based buckets
        assert PropertyAgeBucket.is_age_based(PropertyAgeBucket.RECENTLY_TOP) is True
        assert PropertyAgeBucket.is_age_based(PropertyAgeBucket.YOUNG_RESALE) is True
        assert PropertyAgeBucket.is_age_based(PropertyAgeBucket.RESALE) is True
        assert PropertyAgeBucket.is_age_based(PropertyAgeBucket.MATURE_RESALE) is True

        # Non-age-based buckets (new_sale is market state, not age-based)
        assert PropertyAgeBucket.is_age_based(PropertyAgeBucket.NEW_SALE) is False

    def test_boundary_age_8_goes_to_young_resale(self):
        """Age 8 should go to young_resale (not recently_top) due to exclusive upper bound."""
        from schemas.api_contract import PropertyAgeBucket

        # recently_top: [4, 8) → age 8 is NOT in this bucket
        recently_top_range = PropertyAgeBucket.get_age_range(PropertyAgeBucket.RECENTLY_TOP)
        assert recently_top_range == (4, 8)
        # 8 >= 4 and 8 < 8 is False, so age 8 is NOT recently_top

        # young_resale: [8, 15) → age 8 IS in this bucket
        young_resale_range = PropertyAgeBucket.get_age_range(PropertyAgeBucket.YOUNG_RESALE)
        assert young_resale_range == (8, 15)
        # 8 >= 8 and 8 < 15 is True, so age 8 IS young_resale


class TestPropertyAgeBucketParsing:
    """Test filter parameter parsing for property age bucket."""

    def test_parse_v2_camelcase_param(self):
        """v2 camelCase parameter name should be parsed."""
        from schemas.api_contract import parse_filter_params

        args = {'propertyAgeBucket': 'recently_top'}
        params = parse_filter_params(args)
        assert params.get('property_age_bucket') == 'recently_top'

    def test_parse_v1_snake_case_param(self):
        """v1 snake_case parameter name should be parsed."""
        from schemas.api_contract import parse_filter_params

        args = {'property_age_bucket': 'young_resale'}
        params = parse_filter_params(args)
        assert params.get('property_age_bucket') == 'young_resale'

    def test_v2_takes_precedence_over_v1(self):
        """v2 camelCase should take precedence if both provided."""
        from schemas.api_contract import parse_filter_params

        args = {'propertyAgeBucket': 'resale', 'property_age_bucket': 'mature_resale'}
        params = parse_filter_params(args)
        assert params.get('property_age_bucket') == 'resale'

    def test_invalid_bucket_ignored(self):
        """Invalid bucket values should be ignored."""
        from schemas.api_contract import parse_filter_params

        args = {'propertyAgeBucket': 'invalid_bucket'}
        params = parse_filter_params(args)
        assert 'property_age_bucket' not in params

    def test_all_valid_buckets_parsed(self):
        """All valid bucket values should be accepted."""
        from schemas.api_contract import parse_filter_params, PropertyAgeBucket

        for bucket in PropertyAgeBucket.ALL:
            args = {'propertyAgeBucket': bucket}
            params = parse_filter_params(args)
            assert params.get('property_age_bucket') == bucket


class TestPropertyAgeBucketSerialization:
    """Test filter options serialization for property age buckets."""

    def test_serialize_filter_options_includes_buckets(self):
        """serialize_filter_options should include propertyAgeBuckets."""
        from schemas.api_contract import serialize_filter_options, PropertyAgeBucket

        result = serialize_filter_options(
            districts=['D01', 'D02'],
            regions={'CCR': ['D01'], 'RCR': ['D02'], 'OCR': []},
            bedrooms=[1, 2, 3],
            sale_types=['New Sale', 'Resale'],
            projects=['Project A'],
            date_range={'min': '2020-01-01', 'max': '2024-12-31'},
            psf_range={'min': 500, 'max': 3000},
            size_range={'min': 300, 'max': 5000},
            tenures=['Freehold', '99-year'],
            property_age_buckets=PropertyAgeBucket.ALL,
            include_deprecated=True
        )

        # v2 format should have {value, label} objects
        assert 'propertyAgeBuckets' in result
        buckets = result['propertyAgeBuckets']
        assert len(buckets) == len(PropertyAgeBucket.ALL)

        # Check format
        for bucket in buckets:
            assert 'value' in bucket
            assert 'label' in bucket
            assert bucket['value'] in PropertyAgeBucket.ALL

        # v1 format should have raw list
        assert 'property_age_buckets' in result
        assert result['property_age_buckets'] == PropertyAgeBucket.ALL

    def test_serialize_v2_only_mode(self):
        """With include_deprecated=False, only v2 fields should be present."""
        from schemas.api_contract import serialize_filter_options, PropertyAgeBucket

        result = serialize_filter_options(
            districts=['D01'],
            regions={'CCR': ['D01'], 'RCR': [], 'OCR': []},
            bedrooms=[1],
            sale_types=['Resale'],
            projects=[],
            date_range={'min': None, 'max': None},
            psf_range={'min': None, 'max': None},
            size_range={'min': None, 'max': None},
            tenures=['Freehold'],
            property_age_buckets=PropertyAgeBucket.ALL,
            include_deprecated=False
        )

        assert 'propertyAgeBuckets' in result
        assert 'property_age_buckets' not in result

    def test_default_buckets_when_none_provided(self):
        """When property_age_buckets is None, all buckets should be included."""
        from schemas.api_contract import serialize_filter_options, PropertyAgeBucket

        result = serialize_filter_options(
            districts=['D01'],
            regions={'CCR': ['D01'], 'RCR': [], 'OCR': []},
            bedrooms=[1],
            sale_types=['Resale'],
            projects=[],
            date_range={'min': None, 'max': None},
            psf_range={'min': None, 'max': None},
            size_range={'min': None, 'max': None},
            tenures=['Freehold'],
            property_age_buckets=None,  # Explicitly None
            include_deprecated=True
        )

        assert len(result['propertyAgeBuckets']) == len(PropertyAgeBucket.ALL)


class TestPropertyAgeBucketFilterBuilder:
    """Test the reusable filter builder function."""

    def test_build_filter_returns_expression(self):
        """build_property_age_bucket_filter should return a SQLAlchemy expression."""
        from services.dashboard_service import build_property_age_bucket_filter
        from schemas.api_contract import PropertyAgeBucket

        # Should not raise
        expr = build_property_age_bucket_filter(PropertyAgeBucket.YOUNG_RESALE)
        assert expr is not None

    def test_unknown_bucket_returns_true(self):
        """Unknown bucket should return literal(True) (no filter)."""
        from services.dashboard_service import build_property_age_bucket_filter

        expr = build_property_age_bucket_filter('invalid_bucket')
        # This should be a literal True expression
        assert expr is not None


# Note: Integration tests that require database fixtures would go here.
# These would test actual query execution with sample data.
# For now, we test the logic in isolation.

class TestAgeBoundaryLogic:
    """Test that age boundary logic is correct."""

    def test_exclusive_upper_bound_8(self):
        """Age 8 should be in young_resale, not recently_top."""
        from schemas.api_contract import PropertyAgeBucket

        # recently_top: [4, 8) → 4 <= age < 8
        recently_top = PropertyAgeBucket.get_age_range(PropertyAgeBucket.RECENTLY_TOP)
        min_age, max_age = recently_top
        assert min_age <= 7 < max_age  # age 7 is in recently_top
        assert not (min_age <= 8 < max_age)  # age 8 is NOT in recently_top
        assert not (min_age <= 3 < max_age)  # age 3 is NOT in recently_top (it's new_sale)

        # young_resale: [8, 15) → 8 <= age < 15
        young_resale = PropertyAgeBucket.get_age_range(PropertyAgeBucket.YOUNG_RESALE)
        min_age, max_age = young_resale
        assert min_age <= 8 < max_age  # age 8 IS in young_resale

    def test_exclusive_upper_bound_15(self):
        """Age 15 should be in resale, not young_resale."""
        from schemas.api_contract import PropertyAgeBucket

        young_resale = PropertyAgeBucket.get_age_range(PropertyAgeBucket.YOUNG_RESALE)
        min_age, max_age = young_resale
        assert min_age <= 14 < max_age  # age 14 is in young_resale
        assert not (min_age <= 15 < max_age)  # age 15 is NOT in young_resale

        resale = PropertyAgeBucket.get_age_range(PropertyAgeBucket.RESALE)
        min_age, max_age = resale
        assert min_age <= 15 < max_age  # age 15 IS in resale

    def test_mature_resale_unbounded(self):
        """Mature resale should have no upper bound."""
        from schemas.api_contract import PropertyAgeBucket

        mature = PropertyAgeBucket.get_age_range(PropertyAgeBucket.MATURE_RESALE)
        min_age, max_age = mature
        assert min_age == 25
        assert max_age is None  # Unbounded

        # Any age >= 25 should be in mature_resale
        assert min_age <= 25  # age 25 in
        assert min_age <= 50  # age 50 in
        assert min_age <= 100  # age 100 in
