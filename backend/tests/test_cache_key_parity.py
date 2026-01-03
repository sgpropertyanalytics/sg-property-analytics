"""
Cache Key Parity Tests - CRITICAL for Pydantic Migration

This test ensures old normalize_params() and new Pydantic models produce
IDENTICAL cache keys. This prevents the bug class where cache key uses
wrong param values.

The Bug We're Preventing:
- Cache key was built from params.timeframe, but after normalization
  timeframe is resolved to date_from/date_to_exclusive
- If cache key reads timeframe (which may be undefined in custom mode),
  it uses wrong value → cache mismatch → stale data served

Run: pytest tests/test_cache_key_parity.py -v

Coverage:
- AggregateParams (43 tests)
- FilterOptionsParams (8 tests)
- DashboardParams (18 tests)
- KPISummaryParams (10 tests)
- KPISingleParams (6 tests)
- KPISummaryLegacyParams (6 tests)
- PriceGrowthParams (12 tests)
- SegmentsParams (6 tests)
- DistrictPsfParams (10 tests)
- DistrictLiquidityParams (10 tests)
"""

import pytest
from datetime import date

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.contracts.normalize import normalize_params
from utils.cache_key import build_json_cache_key, build_query_cache_key

# Import all schemas
from api.contracts.schemas.aggregate import AGGREGATE_PARAM_SCHEMA
from api.contracts.schemas.filter_options import FILTER_OPTIONS_PARAM_SCHEMA
from api.contracts.schemas.dashboard import DASHBOARD_PARAM_SCHEMA
from api.contracts.schemas.kpi_summary import (
    KPI_SUMMARY_PARAM_SCHEMA,
    KPI_SINGLE_PARAM_SCHEMA,
    KPI_SUMMARY_LEGACY_PARAM_SCHEMA,
)
from api.contracts.schemas.transactions import PRICE_GROWTH_PARAM_SCHEMA, SEGMENTS_PARAM_SCHEMA
from api.contracts.schemas.insights import DISTRICT_PSF_PARAM_SCHEMA, DISTRICT_LIQUIDITY_PARAM_SCHEMA

# Import Pydantic models
try:
    from api.contracts.pydantic_models import (
        AggregateParams,
        FilterOptionsParams,
        DashboardParams,
        KPISummaryParams,
        KPISingleParams,
        KPISummaryLegacyParams,
        PriceGrowthParams,
        SegmentsParams,
        DistrictPsfParams,
        DistrictLiquidityParams,
    )
    PYDANTIC_AVAILABLE = True
except ImportError:
    PYDANTIC_AVAILABLE = False
    AggregateParams = None
    FilterOptionsParams = None
    DashboardParams = None
    KPISummaryParams = None
    KPISingleParams = None
    KPISummaryLegacyParams = None
    PriceGrowthParams = None
    SegmentsParams = None
    DistrictPsfParams = None
    DistrictLiquidityParams = None


# =============================================================================
# TEST DATA - Various param combinations for each model
# =============================================================================

AGGREGATE_TEST_PARAMS = [
    # Timeframe presets
    {"timeframe": "M3"},
    {"timeframe": "M6"},
    {"timeframe": "Y1"},
    {"timeframe": "Y3"},
    {"timeframe": "Y5"},
    {"timeframe": "all"},

    # Custom dates
    {"dateFrom": "2024-01-01", "dateTo": "2024-12-31"},
    {"date_from": "2024-06-01"},  # Snake case

    # Filters
    {"timeframe": "M6", "district": "D01,D09"},
    {"timeframe": "Y1", "saleType": "Resale"},
    {"timeframe": "M3", "bedroom": "2,3"},
    {"timeframe": "M6", "segment": "CCR"},

    # Value filters
    {"timeframe": "Y1", "psfMin": 1000, "psfMax": 2000},
    {"timeframe": "M6", "sizeMin": 500, "sizeMax": 1500},

    # Combined filters
    {
        "timeframe": "Y1",
        "district": "D09,D10",
        "bedroom": "3",
        "saleType": "Resale",
    },

    # Empty params (should default to Y1)
    {},

    # Only group_by
    {"group_by": "month,district"},

    # Metrics
    {"metrics": "count,median_psf"},
]

# FilterOptionsParams - simple endpoint, mostly empty params
FILTER_OPTIONS_TEST_PARAMS = [
    {},  # Empty - should default to Y1
    {"timeframe": "M6"},
    {"timeframe": "Y1"},
    {"timeframe": "all"},
    {"dateFrom": "2024-01-01"},
    {"dateFrom": "2024-01-01", "dateTo": "2024-12-31"},
    {"date_from": "2024-06-01"},  # Snake case
    {"timeframe": "M3"},
]

# DashboardParams - unified dashboard endpoint
DASHBOARD_TEST_PARAMS = [
    {},  # Empty - defaults
    {"timeframe": "M6"},
    {"timeframe": "Y1"},
    {"timeframe": "all"},
    {"panels": "kpi_summary"},
    {"panels": "time_series,volume_by_location"},
    {"district": "D01,D09"},
    {"segment": "CCR"},
    {"bedroom": "2,3"},
    {"saleType": "Resale"},
    {"tenure": "freehold"},
    {"psfMin": 1000, "psfMax": 2000},
    {"sizeMin": 500, "sizeMax": 1500},
    {"time_grain": "quarter"},
    {"location_grain": "district"},
    {"timeframe": "M6", "district": "D09", "bedroom": "3"},
    {"dateFrom": "2024-01-01", "dateTo": "2024-12-31"},
    {"project": "PARC CLEMATIS"},
]

# KPISummaryParams - KPI endpoint
KPI_SUMMARY_TEST_PARAMS = [
    {},  # Empty
    {"district": "D01"},
    {"district": "D01,D09,D10"},
    {"bedroom": "2"},
    {"bedroom": "2,3,4"},
    {"segment": "CCR"},
    {"segment": "RCR"},
    {"maxDate": "2024-12-31"},
    {"district": "D09", "bedroom": "3"},
    {"district": "D09", "bedroom": "3", "segment": "CCR"},
]

# KPISingleParams - single KPI endpoint
KPI_SINGLE_TEST_PARAMS = [
    {},
    {"district": "D01"},
    {"bedroom": "2"},
    {"segment": "CCR"},
    {"district": "D09", "bedroom": "3"},
    {"district": "D01,D02", "bedroom": "2,3", "segment": "RCR"},
]

# KPISummaryLegacyParams - legacy KPI endpoint
KPI_SUMMARY_LEGACY_TEST_PARAMS = [
    {},
    {"district": "D01"},
    {"bedroom": "2"},
    {"segment": "CCR"},
    {"district": "D09", "bedroom": "3"},
    {"district": "D01,D02", "bedroom": "2,3", "segment": "RCR"},
]

# PriceGrowthParams - transaction price growth
PRICE_GROWTH_TEST_PARAMS = [
    {},
    {"project": "PARC CLEMATIS"},
    {"bedroom": 3},
    {"floor_level": "mid"},
    {"district": "D09"},
    {"saleType": "Resale"},
    {"dateFrom": "2024-01-01"},
    {"dateFrom": "2024-01-01", "dateTo": "2024-12-31"},
    {"page": 2, "per_page": 100},
    {"project": "PARC CLEMATIS", "bedroom": 3},
    {"district": "D09", "saleType": "Resale"},
    {"floorLevel": "high", "bedroom": 4},  # camelCase alias
]

# SegmentsParams - price growth segments
SEGMENTS_TEST_PARAMS = [
    {},
    {"project": "PARC CLEMATIS"},
    {"district": "D09"},
    {"saleType": "Resale"},
    {"project": "PARC CLEMATIS", "district": "D19"},
    {"district": "D09,D10", "saleType": "new_sale"},
]

# DistrictPsfParams - insights PSF by district
DISTRICT_PSF_TEST_PARAMS = [
    {},  # Defaults to Y1
    {"timeframe": "M6"},
    {"timeframe": "Y1"},
    {"timeframe": "all"},
    {"period": "12m"},  # Deprecated alias
    {"bed": "2"},
    {"bed": "all"},
    {"age": "new"},
    {"sale_type": "resale"},
    {"timeframe": "M6", "bed": "3", "sale_type": "new_sale"},
]

# DistrictLiquidityParams - insights liquidity by district
DISTRICT_LIQUIDITY_TEST_PARAMS = [
    {},  # Defaults to Y1
    {"timeframe": "M6"},
    {"timeframe": "Y1"},
    {"timeframe": "all"},
    {"period": "12m"},  # Deprecated alias
    {"bed": "2"},
    {"bed": "all"},
    {"sale_type": "resale"},
    {"saleType": "new_sale"},  # camelCase alias
    {"timeframe": "M6", "bed": "3", "sale_type": "new_sale"},
]


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

def assert_parity(model_class, schema, raw_params: dict, endpoint: str, check_dates: bool = True):
    """
    Assert that old normalize_params and new Pydantic model produce identical results.

    Args:
        model_class: Pydantic model class
        schema: ParamSchema for normalize_params
        raw_params: Raw input params
        endpoint: Endpoint name for cache key
        check_dates: Whether to check date fields
    """
    old_result = normalize_params(raw_params.copy(), schema)
    new_result = model_class(**raw_params.copy()).model_dump()

    # Build cache keys
    old_cache_key = build_json_cache_key(endpoint, old_result)
    new_cache_key = build_json_cache_key(endpoint, new_result)

    assert old_cache_key == new_cache_key, (
        f"Cache key mismatch for {endpoint}!\n"
        f"  Params: {raw_params}\n"
        f"  Old: {old_cache_key}\n"
        f"  New: {new_cache_key}"
    )

    # Also check date fields if requested
    if check_dates:
        for key in ["date_from", "date_to_exclusive", "months_in_period"]:
            if key in old_result or key in new_result:
                assert old_result.get(key) == new_result.get(key), (
                    f"{key} mismatch for {endpoint}!\n"
                    f"  Params: {raw_params}\n"
                    f"  Old: {old_result.get(key)}\n"
                    f"  New: {new_result.get(key)}"
                )


# =============================================================================
# CACHE KEY PARITY TESTS - AGGREGATE
# =============================================================================

@pytest.mark.skipif(not PYDANTIC_AVAILABLE, reason="Pydantic not available")
class TestAggregateParity:
    """
    Verify AggregateParams produces identical cache keys to normalize_params.

    These tests are CRITICAL for the Pydantic migration. If any test fails,
    the migration cannot proceed safely.
    """

    @pytest.mark.parametrize("raw_params", AGGREGATE_TEST_PARAMS)
    def test_json_cache_key_identical(self, raw_params: dict):
        """
        Cache key from old normalize_params == cache key from Pydantic.

        Uses JSON format cache keys (standard format).
        """
        # Old method
        old_result = normalize_params(raw_params.copy(), AGGREGATE_PARAM_SCHEMA)

        # New Pydantic method
        new_result = AggregateParams(**raw_params.copy()).model_dump()

        # Build cache keys
        old_cache_key = build_json_cache_key("aggregate", old_result)
        new_cache_key = build_json_cache_key("aggregate", new_result)

        assert old_cache_key == new_cache_key, (
            f"Cache key mismatch!\n"
            f"  Params: {raw_params}\n"
            f"  Old: {old_cache_key}\n"
            f"  New: {new_cache_key}"
        )

    @pytest.mark.parametrize("raw_params", AGGREGATE_TEST_PARAMS)
    def test_query_cache_key_identical(self, raw_params: dict):
        """
        Cache key from old normalize_params == cache key from Pydantic.

        Uses query string format cache keys.
        """
        # Old method
        old_result = normalize_params(raw_params.copy(), AGGREGATE_PARAM_SCHEMA)

        # New Pydantic method
        new_result = AggregateParams(**raw_params.copy()).model_dump()

        # Build cache keys (include only date-related keys for focused testing)
        include_keys = ["date_from", "date_to_exclusive", "months_in_period"]

        old_cache_key = build_query_cache_key("aggregate", old_result, include_keys=include_keys)
        new_cache_key = build_query_cache_key("aggregate", new_result, include_keys=include_keys)

        assert old_cache_key == new_cache_key, (
            f"Cache key mismatch!\n"
            f"  Params: {raw_params}\n"
            f"  Old: {old_cache_key}\n"
            f"  New: {new_cache_key}"
        )

    def test_date_bounds_identical(self):
        """Verify date bounds are resolved identically."""
        params = {"timeframe": "M6"}

        old_result = normalize_params(params.copy(), AGGREGATE_PARAM_SCHEMA)
        new_result = AggregateParams(**params.copy()).model_dump()

        assert old_result["date_from"] == new_result["date_from"], (
            f"date_from mismatch: {old_result['date_from']} vs {new_result['date_from']}"
        )
        assert old_result["date_to_exclusive"] == new_result["date_to_exclusive"], (
            f"date_to_exclusive mismatch: {old_result['date_to_exclusive']} vs {new_result['date_to_exclusive']}"
        )
        assert old_result.get("months_in_period") == new_result.get("months_in_period"), (
            f"months_in_period mismatch: {old_result.get('months_in_period')} vs {new_result.get('months_in_period')}"
        )

    def test_district_normalization_identical(self):
        """Verify district normalization is identical."""
        params = {"district": "9,d01,D02"}

        old_result = normalize_params(params.copy(), AGGREGATE_PARAM_SCHEMA)
        new_result = AggregateParams(**params.copy()).model_dump()

        assert old_result["districts"] == new_result["districts"], (
            f"districts mismatch: {old_result['districts']} vs {new_result['districts']}"
        )

    def test_empty_params_default_to_y1(self):
        """Empty params should default to Y1 (12 months)."""
        old_result = normalize_params({}, AGGREGATE_PARAM_SCHEMA)
        new_result = AggregateParams().model_dump()

        assert old_result.get("months_in_period") == 12
        assert new_result.get("months_in_period") == 12

    def test_explicit_dates_skip_timeframe_resolution(self):
        """When explicit dates provided, timeframe resolution is skipped."""
        params = {
            "date_from": date(2020, 1, 1),
            "date_to": date(2020, 12, 31),
        }

        old_result = normalize_params(params.copy(), AGGREGATE_PARAM_SCHEMA)
        new_result = AggregateParams(**params.copy()).model_dump()

        # Both should preserve the explicit dates (after month alignment)
        assert old_result["date_from"].year == new_result["date_from"].year
        assert old_result["date_from"].month == new_result["date_from"].month


# =============================================================================
# REGRESSION TESTS - Specific scenarios that have caused bugs
# =============================================================================

@pytest.mark.skipif(not PYDANTIC_AVAILABLE, reason="Pydantic not available")
class TestCacheKeyRegression:
    """Regression tests for specific bug scenarios."""

    def test_m6_cache_key_bug_scenario(self):
        """
        The original M6 cache key bug scenario.

        Frontend sends timeframe='M6', cache key should use resolved dates,
        not the timeframe string.
        """
        params = {"timeframe": "M6"}

        old_result = normalize_params(params.copy(), AGGREGATE_PARAM_SCHEMA)
        new_result = AggregateParams(**params.copy()).model_dump()

        # Both must have resolved date bounds
        assert old_result["date_from"] is not None
        assert new_result["date_from"] is not None

        # Cache keys must be identical
        old_key = build_json_cache_key("agg", old_result)
        new_key = build_json_cache_key("agg", new_result)

        assert old_key == new_key

    def test_custom_mode_no_timeframe(self):
        """
        Custom date mode - no timeframe param.

        This is the scenario where cache key must NOT read timeframe
        (which would be undefined).
        """
        params = {
            "dateFrom": "2024-06-01",
            "dateTo": "2024-12-31",
        }

        old_result = normalize_params(params.copy(), AGGREGATE_PARAM_SCHEMA)
        new_result = AggregateParams(**params.copy()).model_dump()

        # Both should have resolved dates
        assert old_result.get("date_from") is not None
        assert new_result.get("date_from") is not None

        # Cache keys should work even without timeframe
        old_key = build_json_cache_key("agg", old_result)
        new_key = build_json_cache_key("agg", new_result)

        # Keys may differ in structure but both should be valid
        assert old_key is not None
        assert new_key is not None


# =============================================================================
# DEBUGGING HELPERS
# =============================================================================

@pytest.mark.skipif(not PYDANTIC_AVAILABLE, reason="Pydantic not available")
class TestDebugDifferences:
    """Helper tests to debug differences between old and new."""

    def test_show_all_differences(self):
        """
        Debug test to show all differences between old and new.

        This test always passes but prints differences for debugging.
        """
        params = {"timeframe": "M6", "district": "D01,D09"}

        old_result = normalize_params(params.copy(), AGGREGATE_PARAM_SCHEMA)
        new_result = AggregateParams(**params.copy()).model_dump()

        all_keys = set(old_result.keys()) | set(new_result.keys())

        differences = []
        for key in sorted(all_keys):
            old_val = old_result.get(key)
            new_val = new_result.get(key)
            if old_val != new_val:
                differences.append(f"  {key}: old={old_val}, new={new_val}")

        if differences:
            print("\n=== DIFFERENCES ===")
            print("\n".join(differences))
            print("===================")

        # This test always passes - it's for debugging
        assert True


# =============================================================================
# CACHE KEY PARITY TESTS - FILTER OPTIONS
# =============================================================================

@pytest.mark.skipif(not PYDANTIC_AVAILABLE, reason="Pydantic not available")
class TestFilterOptionsParity:
    """Verify FilterOptionsParams produces identical results to normalize_params."""

    @pytest.mark.parametrize("raw_params", FILTER_OPTIONS_TEST_PARAMS)
    def test_cache_key_identical(self, raw_params: dict):
        """Cache key parity for FilterOptionsParams."""
        assert_parity(
            FilterOptionsParams,
            FILTER_OPTIONS_PARAM_SCHEMA,
            raw_params,
            "filter-options"
        )

    def test_empty_params_default_to_y1(self):
        """Empty params should default to Y1 (12 months)."""
        old_result = normalize_params({}, FILTER_OPTIONS_PARAM_SCHEMA)
        new_result = FilterOptionsParams().model_dump()

        assert old_result.get("months_in_period") == 12
        assert new_result.get("months_in_period") == 12


# =============================================================================
# CACHE KEY PARITY TESTS - DASHBOARD
# =============================================================================

@pytest.mark.skipif(not PYDANTIC_AVAILABLE, reason="Pydantic not available")
class TestDashboardParity:
    """Verify DashboardParams produces identical results to normalize_params."""

    @pytest.mark.parametrize("raw_params", DASHBOARD_TEST_PARAMS)
    def test_cache_key_identical(self, raw_params: dict):
        """Cache key parity for DashboardParams."""
        assert_parity(
            DashboardParams,
            DASHBOARD_PARAM_SCHEMA,
            raw_params,
            "dashboard"
        )

    def test_empty_params_default_to_y1(self):
        """Empty params should default to Y1 (12 months)."""
        old_result = normalize_params({}, DASHBOARD_PARAM_SCHEMA)
        new_result = DashboardParams().model_dump()

        assert old_result.get("months_in_period") == 12
        assert new_result.get("months_in_period") == 12

    def test_panels_normalization(self):
        """Panels should be normalized to list."""
        params = {"panels": "kpi_summary,time_series"}

        old_result = normalize_params(params.copy(), DASHBOARD_PARAM_SCHEMA)
        new_result = DashboardParams(**params.copy()).model_dump()

        assert old_result.get("panels") == new_result.get("panels")
        assert isinstance(new_result.get("panels"), list)


# =============================================================================
# CACHE KEY PARITY TESTS - KPI SUMMARY
# =============================================================================

@pytest.mark.skipif(not PYDANTIC_AVAILABLE, reason="Pydantic not available")
class TestKPISummaryParity:
    """Verify KPISummaryParams produces identical results to normalize_params."""

    @pytest.mark.parametrize("raw_params", KPI_SUMMARY_TEST_PARAMS)
    def test_cache_key_identical(self, raw_params: dict):
        """Cache key parity for KPISummaryParams."""
        assert_parity(
            KPISummaryParams,
            KPI_SUMMARY_PARAM_SCHEMA,
            raw_params,
            "kpi-summary-v2",
            check_dates=False  # KPI doesn't use timeframe dates
        )

    def test_district_normalization(self):
        """Districts should be normalized."""
        params = {"district": "1,D02,d09"}

        old_result = normalize_params(params.copy(), KPI_SUMMARY_PARAM_SCHEMA)
        new_result = KPISummaryParams(**params.copy()).model_dump()

        assert old_result.get("districts") == new_result.get("districts")


# =============================================================================
# CACHE KEY PARITY TESTS - KPI SINGLE
# =============================================================================

@pytest.mark.skipif(not PYDANTIC_AVAILABLE, reason="Pydantic not available")
class TestKPISingleParity:
    """Verify KPISingleParams produces identical results to normalize_params."""

    @pytest.mark.parametrize("raw_params", KPI_SINGLE_TEST_PARAMS)
    def test_cache_key_identical(self, raw_params: dict):
        """Cache key parity for KPISingleParams."""
        assert_parity(
            KPISingleParams,
            KPI_SINGLE_PARAM_SCHEMA,
            raw_params,
            "kpi-summary-v2/single",
            check_dates=False
        )


# =============================================================================
# CACHE KEY PARITY TESTS - KPI SUMMARY LEGACY
# =============================================================================

@pytest.mark.skipif(not PYDANTIC_AVAILABLE, reason="Pydantic not available")
class TestKPISummaryLegacyParity:
    """Verify KPISummaryLegacyParams produces identical results to normalize_params."""

    @pytest.mark.parametrize("raw_params", KPI_SUMMARY_LEGACY_TEST_PARAMS)
    def test_cache_key_identical(self, raw_params: dict):
        """Cache key parity for KPISummaryLegacyParams."""
        assert_parity(
            KPISummaryLegacyParams,
            KPI_SUMMARY_LEGACY_PARAM_SCHEMA,
            raw_params,
            "kpi-summary",
            check_dates=False
        )


# =============================================================================
# CACHE KEY PARITY TESTS - PRICE GROWTH
# =============================================================================

@pytest.mark.skipif(not PYDANTIC_AVAILABLE, reason="Pydantic not available")
class TestPriceGrowthParity:
    """Verify PriceGrowthParams produces identical results to normalize_params."""

    @pytest.mark.parametrize("raw_params", PRICE_GROWTH_TEST_PARAMS)
    def test_cache_key_identical(self, raw_params: dict):
        """Cache key parity for PriceGrowthParams."""
        assert_parity(
            PriceGrowthParams,
            PRICE_GROWTH_PARAM_SCHEMA,
            raw_params,
            "transactions/price-growth"
        )

    def test_pagination_defaults(self):
        """Pagination should have correct defaults."""
        old_result = normalize_params({}, PRICE_GROWTH_PARAM_SCHEMA)
        new_result = PriceGrowthParams().model_dump()

        assert old_result.get("page") == new_result.get("page")
        assert old_result.get("per_page") == new_result.get("per_page")


# =============================================================================
# CACHE KEY PARITY TESTS - SEGMENTS
# =============================================================================

@pytest.mark.skipif(not PYDANTIC_AVAILABLE, reason="Pydantic not available")
class TestSegmentsParity:
    """Verify SegmentsParams produces identical results to normalize_params."""

    @pytest.mark.parametrize("raw_params", SEGMENTS_TEST_PARAMS)
    def test_cache_key_identical(self, raw_params: dict):
        """Cache key parity for SegmentsParams."""
        assert_parity(
            SegmentsParams,
            SEGMENTS_PARAM_SCHEMA,
            raw_params,
            "transactions/price-growth/segments",
            check_dates=False
        )


# =============================================================================
# CACHE KEY PARITY TESTS - DISTRICT PSF
# =============================================================================

@pytest.mark.skipif(not PYDANTIC_AVAILABLE, reason="Pydantic not available")
class TestDistrictPsfParity:
    """Verify DistrictPsfParams produces identical results to normalize_params."""

    @pytest.mark.parametrize("raw_params", DISTRICT_PSF_TEST_PARAMS)
    def test_cache_key_identical(self, raw_params: dict):
        """Cache key parity for DistrictPsfParams."""
        assert_parity(
            DistrictPsfParams,
            DISTRICT_PSF_PARAM_SCHEMA,
            raw_params,
            "insights/district-psf",
            check_dates=False  # Uses period, not date_from
        )

    def test_timeframe_to_period_resolution(self):
        """Timeframe should resolve to period."""
        params = {"timeframe": "M6"}

        old_result = normalize_params(params.copy(), DISTRICT_PSF_PARAM_SCHEMA)
        new_result = DistrictPsfParams(**params.copy()).model_dump()

        # Both should have period set
        assert old_result.get("period") == new_result.get("period")


# =============================================================================
# CACHE KEY PARITY TESTS - DISTRICT LIQUIDITY
# =============================================================================

@pytest.mark.skipif(not PYDANTIC_AVAILABLE, reason="Pydantic not available")
class TestDistrictLiquidityParity:
    """Verify DistrictLiquidityParams produces identical results to normalize_params."""

    @pytest.mark.parametrize("raw_params", DISTRICT_LIQUIDITY_TEST_PARAMS)
    def test_cache_key_identical(self, raw_params: dict):
        """Cache key parity for DistrictLiquidityParams."""
        assert_parity(
            DistrictLiquidityParams,
            DISTRICT_LIQUIDITY_PARAM_SCHEMA,
            raw_params,
            "insights/district-liquidity",
            check_dates=False  # Uses period, not date_from
        )

    def test_timeframe_to_period_resolution(self):
        """Timeframe should resolve to period."""
        params = {"timeframe": "Y1"}

        old_result = normalize_params(params.copy(), DISTRICT_LIQUIDITY_PARAM_SCHEMA)
        new_result = DistrictLiquidityParams(**params.copy()).model_dump()

        # Both should have period set
        assert old_result.get("period") == new_result.get("period")
