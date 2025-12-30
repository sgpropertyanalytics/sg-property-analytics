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

from services.kpi.resale_velocity import (
    build_params,
    get_sql,
    map_result,
    MIN_UNITS_THRESHOLD,
    SPEC,
)
from services.kpi.base import validate_sql_params, KPIResult
from unittest.mock import patch


# =============================================================================
# PARAMS AND SQL
# =============================================================================

class TestBuildParams:
    """Test parameter building for velocity query."""

    def test_uses_comparison_bounds(self):
        """Should use comparison bounds for current vs prior period."""
        params = build_params({'max_date': date(2024, 6, 15)})

        assert 'current_min_date' in params
        assert 'max_date_exclusive' in params
        assert 'prev_min_date' in params
        assert 'prev_max_date_exclusive' in params

    def test_uses_month_boundaries(self):
        """Should use complete month boundaries, not day-based lookback."""
        # June 15 means max_exclusive = June 1 (excludes incomplete June)
        # Current period: Mar 1 - Jun 1 (3 complete months: Mar, Apr, May)
        params = build_params({'max_date': date(2024, 6, 15)})

        assert params['max_date_exclusive'] == date(2024, 6, 1)
        assert params['current_min_date'] == date(2024, 3, 1)


class TestGetSql:
    """Test SQL generation."""

    def test_sql_has_all_required_placeholders(self):
        """SQL should have all required date placeholders."""
        params = build_params({})
        sql = get_sql(params)

        # Should validate without errors
        validate_sql_params(sql, params)

    def test_sql_filters_resale_only(self):
        """SQL should filter for Resale transactions only using parameter."""
        params = build_params({})
        sql = get_sql(params)

        # Uses parameterized query instead of hardcoded string
        assert "sale_type = :sale_type_resale" in sql

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

    @patch('services.kpi.resale_velocity.get_total_units_for_scope')
    def test_velocity_calculation(self, mock_units):
        """Velocity = (current_txns / total_units) * 100 * 4 (annualized)."""
        mock_units.return_value = (10000, 50)
        row = self.make_row(current_txns=100, prior_txns=80)
        result = map_result(row, {})

        # 100 / 10000 * 100 = 1.0% quarterly * 4 = 4.0% annualized
        assert result.value == 4.0

    @patch('services.kpi.resale_velocity.get_total_units_for_scope')
    def test_zero_units_returns_empty(self, mock_units):
        """Zero total units should return empty state."""
        mock_units.return_value = (0, 0)
        row = self.make_row(current_txns=100, prior_txns=80)
        result = map_result(row, {})

        assert result.formatted_value == "—"
        assert result.insight == "Insufficient data"

    @patch('services.kpi.resale_velocity.get_total_units_for_scope')
    def test_no_row_returns_empty(self, mock_units):
        """No row data should return empty state."""
        mock_units.return_value = (10000, 50)
        result = map_result(None, {})

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

    @patch('services.kpi.resale_velocity.get_total_units_for_scope')
    def test_very_active_market(self, mock_units):
        """Annualized 4-6% should be 'Very Active'."""
        mock_units.return_value = (10000, 50)
        # 1% quarterly velocity = 4% annualized
        row = self.make_row(current_txns=100)
        result = map_result(row, {})

        # 100/10000 * 100 = 1% * 4 = 4% annualized
        assert result.trend['label'] == 'Very Active'
        assert result.trend['direction'] == 'up'

    @patch('services.kpi.resale_velocity.get_total_units_for_scope')
    def test_healthy_market(self, mock_units):
        """Annualized 2-3% should be 'Healthy'."""
        mock_units.return_value = (10000, 50)
        # 0.625% quarterly velocity = 2.5% annualized
        row = self.make_row(current_txns=62)
        result = map_result(row, {})

        # 62/10000 * 100 = 0.62% * 4 = 2.48% annualized
        assert result.trend['label'] == 'Healthy'
        assert result.trend['direction'] == 'neutral'

    @patch('services.kpi.resale_velocity.get_total_units_for_scope')
    def test_slow_market(self, mock_units):
        """Annualized 1-2% should be 'Slow'."""
        mock_units.return_value = (10000, 50)
        # 0.375% quarterly velocity = 1.5% annualized
        row = self.make_row(current_txns=37)
        result = map_result(row, {})

        # 37/10000 * 100 = 0.37% * 4 = 1.48% annualized
        assert result.trend['label'] == 'Slow'
        assert result.trend['direction'] == 'down'

    @patch('services.kpi.resale_velocity.get_total_units_for_scope')
    def test_illiquid_market(self, mock_units):
        """Annualized < 1% should be 'Illiquid'."""
        mock_units.return_value = (10000, 50)
        # 0.2% quarterly velocity = 0.8% annualized
        row = self.make_row(current_txns=20)
        result = map_result(row, {})

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

    @patch('services.kpi.resale_velocity.get_total_units_for_scope')
    def test_high_confidence(self, mock_units):
        """>=20 transactions should be high confidence."""
        mock_units.return_value = (10000, 50)
        row = self.make_row(current_txns=25)
        result = map_result(row, {})

        assert result.meta['confidence'] == 'high'

    @patch('services.kpi.resale_velocity.get_total_units_for_scope')
    def test_medium_confidence(self, mock_units):
        """10-19 transactions should be medium confidence."""
        mock_units.return_value = (10000, 50)
        row = self.make_row(current_txns=15)
        result = map_result(row, {})

        assert result.meta['confidence'] == 'medium'

    @patch('services.kpi.resale_velocity.get_total_units_for_scope')
    def test_low_confidence(self, mock_units):
        """<10 transactions should be low confidence."""
        mock_units.return_value = (10000, 50)
        row = self.make_row(current_txns=5)
        result = map_result(row, {})

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

    @patch('services.kpi.resale_velocity.get_total_units_for_scope')
    def test_positive_trend(self, mock_units):
        """Current > prior should show positive change."""
        mock_units.return_value = (10000, 50)
        row = self.make_row(current_txns=120, prior_txns=100)
        result = map_result(row, {})

        # Both periods: same total_units
        # Current: 1.2%, Prior: 1.0%
        # Change: (1.2 - 1.0) / 1.0 * 100 = 20%
        assert result.trend['value'] == 20.0

    @patch('services.kpi.resale_velocity.get_total_units_for_scope')
    def test_negative_trend(self, mock_units):
        """Current < prior should show negative change."""
        mock_units.return_value = (10000, 50)
        row = self.make_row(current_txns=80, prior_txns=100)
        result = map_result(row, {})

        # Current: 0.8%, Prior: 1.0%
        # Change: (0.8 - 1.0) / 1.0 * 100 = -20%
        assert result.trend['value'] == -20.0

    @patch('services.kpi.resale_velocity.get_total_units_for_scope')
    def test_no_prior_data_zero_change(self, mock_units):
        """No prior transactions should show 0% change."""
        mock_units.return_value = (10000, 50)
        row = self.make_row(current_txns=100, prior_txns=0)
        result = map_result(row, {})

        assert result.trend['value'] == 0


# =============================================================================
# META DATA
# =============================================================================

class TestMetaData:
    """Test metadata in result."""

    @patch('services.kpi.resale_velocity.get_total_units_for_scope')
    def test_meta_contains_required_fields(self, mock_units):
        """Result meta should contain all required fields."""
        mock_units.return_value = (10000, 50)
        row = MagicMock()
        row.current_txns = 100
        row.prior_txns = 80
        result = map_result(row, {})

        required_fields = [
            'current_txns',
            'prior_txns',
            'total_units',
            'projects_counted',
            'current_annualized',
            'confidence',
        ]
        for field in required_fields:
            assert field in result.meta, f"Missing meta field: {field}"

    @patch('services.kpi.resale_velocity.get_total_units_for_scope')
    def test_meta_has_quarterly_velocity(self, mock_units):
        """Meta should include quarterly velocity for reference."""
        mock_units.return_value = (10000, 50)
        row = MagicMock()
        row.current_txns = 100
        row.prior_txns = 80
        result = map_result(row, {})

        assert 'quarterly_velocity' in result.meta
        assert result.meta['quarterly_velocity'] == 1.0  # 100/10000 * 100


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
