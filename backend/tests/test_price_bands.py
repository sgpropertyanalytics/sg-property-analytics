"""
Tests for Price Bands Service - Historical Downside Protection

Tests:
1. Unit tests - rolling_median, compute_floor_trend, compute_verdict
2. Contract tests - v2 schema format validation
3. Dual-mode tests - returns both v1 and v2 fields
4. Edge case tests - empty data, insufficient data
"""

import pytest
from typing import Dict, Any

# Import pure computation functions
from services.price_bands_compute import (
    rolling_median,
    apply_rolling_median_smoothing,
    get_latest_values,
    compute_floor_trend,
    compute_verdict,
    classify_price_position,
    FloorDirection,
    PricePosition,
    VerdictBadge,
    TREND_RISING_THRESHOLD,
    TREND_WEAKENING_THRESHOLD,
)

# Import serializers from api_contract
from schemas.api_contract import (
    serialize_price_bands_v1,
    serialize_price_bands_v2,
    serialize_price_bands_dual,
    PriceBandsFields,
    DataSource,
    API_CONTRACT_VERSION,
)


# =============================================================================
# UNIT TESTS: ROLLING MEDIAN
# =============================================================================

class TestRollingMedian:
    """Tests for rolling_median function."""

    def test_rolling_median_basic(self):
        """Test basic rolling median with window of 3."""
        values = [100, 110, 105, 120, 115]
        result = rolling_median(values, window=3)

        assert len(result) == 5
        # First element: median of [100, 110] = 105
        assert result[0] == 105.0
        # Middle element: median of [100, 110, 105] = 105
        assert result[1] == 105.0
        # Element at index 2: median of [110, 105, 120] = 110
        assert result[2] == 110.0
        # Element at index 3: median of [105, 120, 115] = 115
        assert result[3] == 115.0
        # Last element: median of [120, 115] = 117.5
        assert result[4] == 117.5

    def test_rolling_median_with_none(self):
        """Test rolling median handles None values."""
        values = [100, None, 105, 120, None]
        result = rolling_median(values, window=3)

        assert len(result) == 5
        # Window is centered. For position 0 (half=1): looks at [0, 1]
        # Position 0: values at [0, 1] = [100, None] → [100] → 100
        assert result[0] == 100
        # Position 1: values at [0, 1, 2] = [100, None, 105] → [100, 105] → 102.5
        assert result[1] == 102.5
        # Position 2: values at [1, 2, 3] = [None, 105, 120] → [105, 120] → 112.5
        assert result[2] == 112.5
        # Position 3: values at [2, 3, 4] = [105, 120, None] → [105, 120] → 112.5
        assert result[3] == 112.5
        # Position 4: values at [3, 4] = [120, None] → [120] → 120
        assert result[4] == 120.0

    def test_rolling_median_all_none(self):
        """Test rolling median with all None values returns None."""
        values = [None, None, None]
        result = rolling_median(values, window=3)

        assert result == [None, None, None]

    def test_rolling_median_empty(self):
        """Test rolling median with empty input."""
        result = rolling_median([], window=3)
        assert result == []

    def test_rolling_median_single_value(self):
        """Test rolling median with single value."""
        result = rolling_median([100], window=3)
        assert result == [100]


class TestApplyRollingMedianSmoothing:
    """Tests for apply_rolling_median_smoothing function."""

    def test_smoothing_adds_smoothed_values(self):
        """Test that smoothing adds p25_s, p50_s, p75_s to each band."""
        bands = [
            {'month': '2024-01', 'count': 5, 'p25': 1800, 'p50': 2000, 'p75': 2200},
            {'month': '2024-02', 'count': 6, 'p25': 1850, 'p50': 2050, 'p75': 2250},
            {'month': '2024-03', 'count': 4, 'p25': 1820, 'p50': 2020, 'p75': 2220},
        ]

        result = apply_rolling_median_smoothing(bands, window=3)

        assert len(result) == 3
        for band in result:
            assert 'p25_s' in band
            assert 'p50_s' in band
            assert 'p75_s' in band
            assert band['p25_s'] is not None
            assert band['p50_s'] is not None
            assert band['p75_s'] is not None

    def test_smoothing_empty_input(self):
        """Test smoothing with empty input returns empty."""
        result = apply_rolling_median_smoothing([], window=3)
        assert result == []


# =============================================================================
# UNIT TESTS: GET LATEST VALUES
# =============================================================================

class TestGetLatestValues:
    """Tests for get_latest_values function."""

    def test_get_latest_returns_last_valid(self):
        """Test that get_latest_values returns the last band with valid data."""
        bands = [
            {'month': '2024-01', 'p25_s': 1800, 'p50_s': 2000, 'p75_s': 2200},
            {'month': '2024-02', 'p25_s': 1850, 'p50_s': 2050, 'p75_s': 2250},
            {'month': '2024-03', 'p25_s': None, 'p50_s': None, 'p75_s': None},
        ]

        result = get_latest_values(bands)

        assert result is not None
        assert result['month'] == '2024-02'
        assert result['p25_s'] == 1850
        assert result['p50_s'] == 2050
        assert result['p75_s'] == 2250

    def test_get_latest_empty_input(self):
        """Test get_latest_values with empty input."""
        result = get_latest_values([])
        assert result is None

    def test_get_latest_all_none(self):
        """Test get_latest_values when all bands have None values."""
        bands = [
            {'month': '2024-01', 'p25_s': None, 'p50_s': None, 'p75_s': None},
            {'month': '2024-02', 'p25_s': None, 'p50_s': None, 'p75_s': None},
        ]

        result = get_latest_values(bands)
        assert result is None


# =============================================================================
# UNIT TESTS: FLOOR TREND
# =============================================================================

class TestComputeFloorTrend:
    """Tests for compute_floor_trend function."""

    def test_trend_rising(self):
        """Test floor trend detection for rising prices."""
        # 5% increase over 6 months
        bands = [
            {'month': '2024-01', 'p25_s': 1000},
            {'month': '2024-02', 'p25_s': 1010},
            {'month': '2024-03', 'p25_s': 1020},
            {'month': '2024-04', 'p25_s': 1030},
            {'month': '2024-05', 'p25_s': 1040},
            {'month': '2024-06', 'p25_s': 1050},  # +5% from start
        ]

        result = compute_floor_trend(bands, lookback_months=6)

        assert result['floor_direction'] == FloorDirection.RISING
        assert result['floor_slope_pct'] == 5.0
        assert result['observation_months'] == 6

    def test_trend_weakening(self):
        """Test floor trend detection for falling prices."""
        # 5% decrease over 6 months
        bands = [
            {'month': '2024-01', 'p25_s': 1000},
            {'month': '2024-02', 'p25_s': 990},
            {'month': '2024-03', 'p25_s': 980},
            {'month': '2024-04', 'p25_s': 970},
            {'month': '2024-05', 'p25_s': 960},
            {'month': '2024-06', 'p25_s': 950},  # -5% from start
        ]

        result = compute_floor_trend(bands, lookback_months=6)

        assert result['floor_direction'] == FloorDirection.WEAKENING
        assert result['floor_slope_pct'] == -5.0
        assert result['observation_months'] == 6

    def test_trend_flat(self):
        """Test floor trend detection for stable prices."""
        # 1% change (within threshold)
        bands = [
            {'month': '2024-01', 'p25_s': 1000},
            {'month': '2024-02', 'p25_s': 1002},
            {'month': '2024-03', 'p25_s': 1004},
            {'month': '2024-04', 'p25_s': 1006},
            {'month': '2024-05', 'p25_s': 1008},
            {'month': '2024-06', 'p25_s': 1010},  # +1% from start
        ]

        result = compute_floor_trend(bands, lookback_months=6)

        assert result['floor_direction'] == FloorDirection.FLAT
        assert abs(result['floor_slope_pct'] - 1.0) < 0.1
        assert result['observation_months'] == 6

    def test_trend_insufficient_data(self):
        """Test floor trend with insufficient data (only 1 point)."""
        bands = [{'month': '2024-01', 'p25_s': 1000}]

        result = compute_floor_trend(bands, lookback_months=6)

        # With only 1 data point, we can't compute a slope (need at least 2)
        # The function returns unknown direction and 0 observation_months
        # because it checks len(bands) < 2 first, before extracting p25 values
        assert result['floor_direction'] == FloorDirection.UNKNOWN
        assert result['floor_slope_pct'] is None
        # Note: observation_months is 0 because the early-exit check triggers
        assert result['observation_months'] == 0

    def test_trend_empty_input(self):
        """Test floor trend with empty input."""
        result = compute_floor_trend([], lookback_months=6)

        assert result['floor_direction'] == FloorDirection.UNKNOWN
        assert result['floor_slope_pct'] is None
        assert result['observation_months'] == 0


# =============================================================================
# UNIT TESTS: VERDICT COMPUTATION
# =============================================================================

class TestClassifyPricePosition:
    """Tests for classify_price_position function."""

    def test_position_below_floor(self):
        """Test classification below P25."""
        position, label, vs_floor = classify_price_position(
            unit_psf=1700, p25=1800, p50=2000, p75=2200
        )

        assert position == PricePosition.BELOW_FLOOR
        assert label == 'Below Floor'
        assert vs_floor < 0  # Below floor

    def test_position_near_floor(self):
        """Test classification between P25 and P50."""
        position, label, vs_floor = classify_price_position(
            unit_psf=1900, p25=1800, p50=2000, p75=2200
        )

        assert position == PricePosition.NEAR_FLOOR
        assert label == 'Near Floor'
        assert vs_floor > 0  # Above floor

    def test_position_above_median(self):
        """Test classification between P50 and P75."""
        position, label, vs_floor = classify_price_position(
            unit_psf=2100, p25=1800, p50=2000, p75=2200
        )

        assert position == PricePosition.ABOVE_MEDIAN
        assert label == 'Above Median'

    def test_position_premium_zone(self):
        """Test classification above P75."""
        position, label, vs_floor = classify_price_position(
            unit_psf=2400, p25=1800, p50=2000, p75=2200
        )

        assert position == PricePosition.PREMIUM_ZONE
        assert label == 'Premium Zone'


class TestComputeVerdict:
    """Tests for compute_verdict function."""

    def test_verdict_protected_rising(self):
        """Test protected verdict with rising floor."""
        latest = {'p25_s': 1800, 'p50_s': 2000, 'p75_s': 2200}
        trend = {'floor_direction': FloorDirection.RISING, 'floor_slope_pct': 3.0}

        result = compute_verdict(unit_psf=2100, latest=latest, trend=trend)

        assert result['badge'] == VerdictBadge.PROTECTED
        assert result['badge_label'] == 'Protected'
        assert result['position'] == PricePosition.ABOVE_MEDIAN
        assert 'rising' in result['explanation'].lower()

    def test_verdict_protected_flat(self):
        """Test protected verdict with flat floor."""
        latest = {'p25_s': 1800, 'p50_s': 2000, 'p75_s': 2200}
        trend = {'floor_direction': FloorDirection.FLAT, 'floor_slope_pct': 0.5}

        result = compute_verdict(unit_psf=2100, latest=latest, trend=trend)

        assert result['badge'] == VerdictBadge.PROTECTED
        assert 'stable' in result['explanation'].lower()

    def test_verdict_watch_near_floor(self):
        """Test watch verdict when near floor."""
        latest = {'p25_s': 1800, 'p50_s': 2000, 'p75_s': 2200}
        trend = {'floor_direction': FloorDirection.FLAT, 'floor_slope_pct': 0.5}

        result = compute_verdict(unit_psf=1850, latest=latest, trend=trend)

        assert result['badge'] == VerdictBadge.WATCH
        assert result['position'] == PricePosition.NEAR_FLOOR

    def test_verdict_watch_weakening(self):
        """Test watch verdict when floor is weakening."""
        latest = {'p25_s': 1800, 'p50_s': 2000, 'p75_s': 2200}
        trend = {'floor_direction': FloorDirection.WEAKENING, 'floor_slope_pct': -3.0}

        result = compute_verdict(unit_psf=2100, latest=latest, trend=trend)

        assert result['badge'] == VerdictBadge.WATCH
        assert 'weakening' in result['explanation'].lower()

    def test_verdict_exposed_below_floor(self):
        """Test exposed verdict when below floor."""
        latest = {'p25_s': 1800, 'p50_s': 2000, 'p75_s': 2200}
        trend = {'floor_direction': FloorDirection.FLAT, 'floor_slope_pct': 0.5}

        result = compute_verdict(unit_psf=1700, latest=latest, trend=trend)

        assert result['badge'] == VerdictBadge.EXPOSED
        assert result['badge_label'] == 'Exposed'
        assert result['position'] == PricePosition.BELOW_FLOOR
        assert 'below' in result['explanation'].lower()


# =============================================================================
# CONTRACT TESTS: V2 SCHEMA
# =============================================================================

class TestPriceBandsV2Schema:
    """Tests for v2 schema compliance."""

    @pytest.fixture
    def sample_result(self) -> Dict[str, Any]:
        """Create a sample result dict for testing serialization."""
        return {
            'project_name': 'Test Project',
            'data_source': 'project',
            'proxy_label': None,
            'bands': [
                {'month': '2024-01', 'count': 5, 'p25': 1800, 'p50': 2000, 'p75': 2200,
                 'p25_s': 1800, 'p50_s': 2000, 'p75_s': 2200},
            ],
            'latest': {'month': '2024-01', 'p25_s': 1800, 'p50_s': 2000, 'p75_s': 2200},
            'trend': {'floor_direction': 'rising', 'floor_slope_pct': 2.5, 'observation_months': 6},
            'verdict': {
                'unit_psf': 2100,
                'position': 'above_median',
                'position_label': 'Above Median',
                'vs_floor_pct': 16.7,
                'badge': 'protected',
                'badge_label': 'Protected',
                'explanation': 'Unit is 16.7% above a rising floor.'
            },
            'data_quality': {
                'total_trades': 50,
                'months_with_data': 12,
                'is_valid': True,
                'fallback_reason': None,
                'window_months': 24,
                'smoothing': 'rolling_median_3'
            }
        }

    def test_v2_has_camelcase_keys(self, sample_result):
        """Test that v2 schema uses camelCase keys."""
        v2 = serialize_price_bands_v2(sample_result)

        # Check top-level camelCase keys
        assert 'projectName' in v2
        assert 'dataSource' in v2
        assert 'proxyLabel' in v2
        assert 'dataQuality' in v2

        # Verify snake_case keys are NOT present
        assert 'project_name' not in v2
        assert 'data_source' not in v2
        assert 'proxy_label' not in v2
        assert 'data_quality' not in v2

    def test_v2_bands_have_camelcase(self, sample_result):
        """Test that band objects use camelCase for smoothed values."""
        v2 = serialize_price_bands_v2(sample_result)

        band = v2['bands'][0]
        assert 'p25S' in band
        assert 'p50S' in band
        assert 'p75S' in band

        # snake_case smoothed should not be present
        assert 'p25_s' not in band
        assert 'p50_s' not in band
        assert 'p75_s' not in band

    def test_v2_trend_has_camelcase(self, sample_result):
        """Test that trend object uses camelCase keys."""
        v2 = serialize_price_bands_v2(sample_result)

        trend = v2['trend']
        assert 'floorDirection' in trend
        assert 'floorSlopePct' in trend
        assert 'observationMonths' in trend

    def test_v2_verdict_has_camelcase(self, sample_result):
        """Test that verdict object uses camelCase keys."""
        v2 = serialize_price_bands_v2(sample_result)

        verdict = v2['verdict']
        assert 'unitPsf' in verdict
        assert 'positionLabel' in verdict
        assert 'vsFloorPct' in verdict
        assert 'badgeLabel' in verdict

    def test_v2_data_quality_has_camelcase(self, sample_result):
        """Test that dataQuality object uses camelCase keys."""
        v2 = serialize_price_bands_v2(sample_result)

        dq = v2['dataQuality']
        assert 'totalTrades' in dq
        assert 'monthsWithData' in dq
        assert 'isValid' in dq
        assert 'fallbackReason' in dq
        assert 'windowMonths' in dq


# =============================================================================
# DUAL-MODE TESTS
# =============================================================================

class TestPriceBandsDualMode:
    """Tests for dual-mode serialization."""

    @pytest.fixture
    def sample_result(self) -> Dict[str, Any]:
        """Create a sample result dict for testing."""
        return {
            'project_name': 'Test Project',
            'data_source': 'project',
            'proxy_label': None,
            'bands': [],
            'latest': None,
            'trend': {'floor_direction': 'unknown', 'floor_slope_pct': None, 'observation_months': 0},
            'verdict': None,
            'data_quality': {
                'total_trades': 0,
                'months_with_data': 0,
                'is_valid': False,
                'fallback_reason': 'Insufficient data',
                'window_months': 24,
                'smoothing': 'rolling_median_3'
            }
        }

    def test_v2_has_camel_case_fields(self, sample_result):
        """Test that v2 response uses camelCase field names."""
        result = serialize_price_bands_dual(sample_result)

        # Should have camelCase
        assert 'projectName' in result
        assert 'dataSource' in result
        assert 'dataQuality' in result

        # Should NOT have snake_case
        assert 'project_name' not in result
        assert 'data_source' not in result
        assert 'data_quality' not in result

    def test_v2_has_api_version(self, sample_result):
        """Test that v2 includes API contract version."""
        result = serialize_price_bands_dual(sample_result)

        assert 'apiContractVersion' in result
        assert result['apiContractVersion'] == API_CONTRACT_VERSION


# =============================================================================
# EDGE CASE TESTS
# =============================================================================

class TestPriceBandsEdgeCases:
    """Tests for edge cases and error conditions."""

    def test_serialize_empty_result(self):
        """Test serialization of empty/error result."""
        empty_result = {
            'project_name': 'Unknown Project',
            'data_source': 'none',
            'proxy_label': None,
            'bands': [],
            'latest': None,
            'trend': {'floor_direction': 'unknown', 'floor_slope_pct': None, 'observation_months': 0},
            'verdict': None,
            'data_quality': {
                'total_trades': 0,
                'months_with_data': 0,
                'is_valid': False,
                'fallback_reason': 'Project not found',
                'window_months': 24,
                'smoothing': 'rolling_median_3'
            },
            'error': 'Project not found'
        }

        v2 = serialize_price_bands_v2(empty_result)

        assert v2['projectName'] == 'Unknown Project'
        assert v2['dataSource'] == 'none'
        assert v2['bands'] == []
        assert v2['latest'] is None
        assert v2['verdict'] is None
        assert 'error' in v2

    def test_serialize_null_verdict(self):
        """Test serialization when verdict is None (no unit_psf provided)."""
        result = {
            'project_name': 'Test',
            'data_source': 'project',
            'proxy_label': None,
            'bands': [{'month': '2024-01', 'count': 5, 'p25': 1800, 'p50': 2000, 'p75': 2200,
                       'p25_s': 1800, 'p50_s': 2000, 'p75_s': 2200}],
            'latest': {'month': '2024-01', 'p25_s': 1800, 'p50_s': 2000, 'p75_s': 2200},
            'trend': {'floor_direction': 'flat', 'floor_slope_pct': 0.5, 'observation_months': 6},
            'verdict': None,  # No unit_psf provided
            'data_quality': {
                'total_trades': 50,
                'months_with_data': 12,
                'is_valid': True,
                'fallback_reason': None,
                'window_months': 24,
                'smoothing': 'rolling_median_3'
            }
        }

        v2 = serialize_price_bands_v2(result)

        assert v2['verdict'] is None
        assert v2['latest'] is not None
        assert v2['trend'] is not None


# =============================================================================
# THRESHOLD CONSTANT TESTS
# =============================================================================

class TestTrendThresholds:
    """Tests to verify trend thresholds are correctly defined."""

    def test_rising_threshold_is_positive(self):
        """Verify rising threshold is positive."""
        assert TREND_RISING_THRESHOLD > 0
        assert TREND_RISING_THRESHOLD == 0.015  # 1.5%

    def test_weakening_threshold_is_negative(self):
        """Verify weakening threshold is negative."""
        assert TREND_WEAKENING_THRESHOLD < 0
        assert TREND_WEAKENING_THRESHOLD == -0.015  # -1.5%

    def test_thresholds_symmetric(self):
        """Verify thresholds are symmetric around zero."""
        assert abs(TREND_RISING_THRESHOLD) == abs(TREND_WEAKENING_THRESHOLD)
