"""
Resale Velocity KPI Tests

Tests for the resale transaction velocity KPI:
1. Velocity calculation logic
2. Interpretation thresholds (Hot/Healthy/Slow/Illiquid)
3. Confidence levels based on transaction count
4. Edge cases (no data, low data)

Run with: pytest tests/test_resale_velocity_kpi.py -v
"""
import pytest
from datetime import date
from unittest.mock import MagicMock, patch
from dataclasses import asdict

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.kpi.resale_velocity import (
    build_params,
    get_sql,
    map_result,
    LOOKBACK_DAYS,
    MIN_UNITS_THRESHOLD,
    SPEC,
)
from services.kpi.base import validate_sql_params, KPIResult


# =============================================================================
# PARAMS AND SQL
# =============================================================================

class TestBuildParams:
    """Test parameter building for velocity query."""

    def test_uses_comparison_bounds(self):
        """Should use comparison bounds for current vs prior period."""
        params = build_params({'max_date': date(2024, 6, 15)})

        assert 'min_date' in params
        assert 'max_date_exclusive' in params
        assert 'prev_min_date' in params
        assert 'prev_max_date_exclusive' in params

    def test_lookback_is_90_days(self):
        """Default lookback should be 90 days."""
        assert LOOKBACK_DAYS == 90

        params = build_params({'max_date': date(2024, 6, 30)})
        expected_min = date(2024, 4, 1)  # 90 days before June 30
        assert params['min_date'] == expected_min


class TestGetSql:
    """Test SQL generation."""

    def test_sql_has_all_required_placeholders(self):
        """SQL should have all required date placeholders."""
        params = build_params({})
        sql = get_sql(params)

        # Should validate without errors
        validate_sql_params(sql, params)

    def test_sql_filters_resale_only(self):
        """SQL should filter for Resale transactions only."""
        params = build_params({})
        sql = get_sql(params)

        assert "sale_type = 'Resale'" in sql

    def test_sql_uses_outlier_filter(self):
        """SQL should use the standard outlier filter."""
        params = build_params({})
        sql = get_sql(params)

        # OUTLIER_FILTER is "COALESCE(is_outlier, false) = false"
        assert "is_outlier" in sql.lower()


# =============================================================================
# VELOCITY CALCULATION
# =============================================================================

class TestMapResult:
    """Test result mapping and velocity calculation."""

    def make_row(self, current_txns, prior_txns):
        """Create a mock row object."""
        row = MagicMock()
        row.current_txns = current_txns
        row.prior_txns = prior_txns
        return row

    def test_velocity_calculation(self):
        """Velocity = (current_txns / total_units) * 100."""
        row = self.make_row(current_txns=100, prior_txns=80)
        result = map_result(row, {}, total_units=10000, projects_counted=50)

        # 100 / 10000 * 100 = 1.0%
        assert result.value == 1.0

    def test_zero_units_returns_empty(self):
        """Zero total units should return empty state."""
        row = self.make_row(current_txns=100, prior_txns=80)
        result = map_result(row, {}, total_units=0, projects_counted=0)

        assert result.formatted_value == "—"
        assert result.insight == "Insufficient data"

    def test_no_row_returns_empty(self):
        """No row data should return empty state."""
        result = map_result(None, {}, total_units=10000, projects_counted=50)

        assert result.formatted_value == "—"


# =============================================================================
# INTERPRETATION THRESHOLDS
# =============================================================================

class TestInterpretation:
    """Test velocity interpretation labels."""

    def make_row(self, current_txns, prior_txns=0):
        row = MagicMock()
        row.current_txns = current_txns
        row.prior_txns = prior_txns
        return row

    def test_hot_market(self):
        """Annualized >= 4% should be 'Hot'."""
        # 1% 90D velocity = 4% annualized
        row = self.make_row(current_txns=100)
        result = map_result(row, {}, total_units=10000, projects_counted=50)

        # 100/10000 * 100 = 1% * 4 = 4% annualized
        assert result.trend['label'] == 'Hot'
        assert result.trend['direction'] == 'up'

    def test_healthy_market(self):
        """Annualized 2-4% should be 'Healthy'."""
        # 0.6% 90D velocity = 2.4% annualized
        row = self.make_row(current_txns=60)
        result = map_result(row, {}, total_units=10000, projects_counted=50)

        # 60/10000 * 100 = 0.6% * 4 = 2.4% annualized
        assert result.trend['label'] == 'Healthy'
        assert result.trend['direction'] == 'neutral'

    def test_slow_market(self):
        """Annualized 1-2% should be 'Slow'."""
        # 0.3% 90D velocity = 1.2% annualized
        row = self.make_row(current_txns=30)
        result = map_result(row, {}, total_units=10000, projects_counted=50)

        # 30/10000 * 100 = 0.3% * 4 = 1.2% annualized
        assert result.trend['label'] == 'Slow'
        assert result.trend['direction'] == 'neutral'

    def test_illiquid_market(self):
        """Annualized < 1% should be 'Illiquid'."""
        # 0.2% 90D velocity = 0.8% annualized
        row = self.make_row(current_txns=20)
        result = map_result(row, {}, total_units=10000, projects_counted=50)

        # 20/10000 * 100 = 0.2% * 4 = 0.8% annualized
        assert result.trend['label'] == 'Illiquid'
        assert result.trend['direction'] == 'down'


# =============================================================================
# CONFIDENCE LEVELS
# =============================================================================

class TestConfidence:
    """Test confidence level based on transaction count."""

    def make_row(self, current_txns, prior_txns=0):
        row = MagicMock()
        row.current_txns = current_txns
        row.prior_txns = prior_txns
        return row

    def test_high_confidence(self):
        """>=20 transactions should be high confidence."""
        row = self.make_row(current_txns=25)
        result = map_result(row, {}, total_units=10000, projects_counted=50)

        assert result.meta['confidence'] == 'high'

    def test_medium_confidence(self):
        """10-19 transactions should be medium confidence."""
        row = self.make_row(current_txns=15)
        result = map_result(row, {}, total_units=10000, projects_counted=50)

        assert result.meta['confidence'] == 'medium'

    def test_low_confidence(self):
        """<10 transactions should be low confidence."""
        row = self.make_row(current_txns=5)
        result = map_result(row, {}, total_units=10000, projects_counted=50)

        assert result.meta['confidence'] == 'low'


# =============================================================================
# PERIOD-OVER-PERIOD TREND
# =============================================================================

class TestTrend:
    """Test period-over-period trend calculation."""

    def make_row(self, current_txns, prior_txns):
        row = MagicMock()
        row.current_txns = current_txns
        row.prior_txns = prior_txns
        return row

    def test_positive_trend(self):
        """Current > prior should show positive change."""
        row = self.make_row(current_txns=120, prior_txns=100)
        result = map_result(row, {}, total_units=10000, projects_counted=50)

        # Both periods: same total_units
        # Current: 1.2%, Prior: 1.0%
        # Change: (1.2 - 1.0) / 1.0 * 100 = 20%
        assert result.trend['value'] == 20.0

    def test_negative_trend(self):
        """Current < prior should show negative change."""
        row = self.make_row(current_txns=80, prior_txns=100)
        result = map_result(row, {}, total_units=10000, projects_counted=50)

        # Current: 0.8%, Prior: 1.0%
        # Change: (0.8 - 1.0) / 1.0 * 100 = -20%
        assert result.trend['value'] == -20.0

    def test_no_prior_data_zero_change(self):
        """No prior transactions should show 0% change."""
        row = self.make_row(current_txns=100, prior_txns=0)
        result = map_result(row, {}, total_units=10000, projects_counted=50)

        assert result.trend['value'] == 0


# =============================================================================
# META DATA
# =============================================================================

class TestMetaData:
    """Test metadata in result."""

    def test_meta_contains_required_fields(self):
        """Result meta should contain all required fields."""
        row = MagicMock()
        row.current_txns = 100
        row.prior_txns = 80
        result = map_result(row, {}, total_units=10000, projects_counted=50)

        required_fields = [
            'current_txns',
            'prior_txns',
            'total_units',
            'projects_counted',
            'annualized_velocity',
            'confidence',
            'window',
        ]
        for field in required_fields:
            assert field in result.meta, f"Missing meta field: {field}"

    def test_window_is_90d(self):
        """Window should always be '90D'."""
        row = MagicMock()
        row.current_txns = 100
        row.prior_txns = 80
        result = map_result(row, {}, total_units=10000, projects_counted=50)

        assert result.meta['window'] == '90D'


# =============================================================================
# SPEC OBJECT
# =============================================================================

class TestSpec:
    """Test KPI spec object structure."""

    def test_has_required_attributes(self):
        """Spec should have required attributes."""
        assert hasattr(SPEC, 'kpi_id')
        assert hasattr(SPEC, 'title')
        assert hasattr(SPEC, 'subtitle')

    def test_kpi_id(self):
        """KPI ID should be 'resale_velocity'."""
        assert SPEC.kpi_id == 'resale_velocity'

    def test_has_required_methods(self):
        """Spec should have required static methods."""
        assert hasattr(SPEC, 'build_params')
        assert hasattr(SPEC, 'get_sql')
        assert hasattr(SPEC, 'map_result')


# =============================================================================
# BOUTIQUE EXCLUSION
# =============================================================================

class TestBoutiqueExclusion:
    """Test boutique project exclusion threshold."""

    def test_min_units_threshold(self):
        """Minimum units threshold should be 100."""
        assert MIN_UNITS_THRESHOLD == 100
