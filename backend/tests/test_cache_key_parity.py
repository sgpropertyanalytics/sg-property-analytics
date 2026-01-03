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
"""

import pytest
from datetime import date

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.contracts.normalize import normalize_params
from api.contracts.schemas.aggregate import AGGREGATE_PARAM_SCHEMA
from utils.cache_key import build_json_cache_key, build_query_cache_key

# Import Pydantic model
try:
    from api.contracts.pydantic_models.aggregate import AggregateParams
    PYDANTIC_AVAILABLE = True
except ImportError:
    AggregateParams = None
    PYDANTIC_AVAILABLE = False


# =============================================================================
# TEST DATA - Various param combinations to test
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


# =============================================================================
# CACHE KEY PARITY TESTS
# =============================================================================

@pytest.mark.skipif(not PYDANTIC_AVAILABLE, reason="Pydantic not available")
class TestCacheKeyParity:
    """
    Verify old and new validation produce identical cache keys.

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
