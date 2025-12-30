"""
Unit tests for timeframe normalization and resolution.

Core logic tests - fast, deterministic, catches regressions.
"""
from datetime import date
import pytest

from constants import normalize_timeframe_id, resolve_timeframe


class TestNormalizeTimeframeId:
    """Test timeframe ID normalization."""

    @pytest.mark.parametrize("inp, expected", [
        (None, "Y1"),           # None defaults to Y1
        ("Y1", "Y1"),           # Canonical passes through
        ("m3", "M3"),           # Lowercase normalized
        ("12m", "Y1"),          # Legacy maps to canonical
        ("1y", "Y1"),           # Legacy alias
        ("2y", "Y3"),           # 2Y → Y3 (not 24 months)
        ("all", None),          # 'all' returns None (no filter)
        ("garbage", "Y1"),      # Invalid defaults to Y1
    ])
    def test_normalize(self, inp, expected):
        assert normalize_timeframe_id(inp) == expected


class TestResolveTimeframe:
    """Test timeframe resolution to date bounds."""

    def test_y1_bounds(self):
        """Y1 produces correct 12-month window with exclusive end."""
        bounds = resolve_timeframe("Y1", max_date=date(2025, 12, 29))
        # Exclusive end = 1st of current month (Dec 1, not Dec 29)
        assert bounds["date_to_exclusive"] == date(2025, 12, 1)
        assert bounds["date_from"] == date(2024, 12, 1)
        assert bounds["months_in_period"] == 12

    def test_m3_bounds(self):
        """M3 produces correct 3-month window."""
        bounds = resolve_timeframe("M3", max_date=date(2025, 12, 29))
        assert bounds["date_to_exclusive"] == date(2025, 12, 1)
        assert bounds["date_from"] == date(2025, 9, 1)
        assert bounds["months_in_period"] == 3

    def test_all_returns_none(self):
        """'all' returns None bounds (no date filter)."""
        bounds = resolve_timeframe("all", max_date=date(2025, 12, 29))
        assert bounds["date_from"] is None
        assert bounds["date_to_exclusive"] is None
        assert bounds["months_in_period"] is None

    def test_none_defaults_to_y1(self):
        """None input defaults to Y1."""
        bounds = resolve_timeframe(None, max_date=date(2025, 12, 29))
        assert bounds["months_in_period"] == 12

    def test_legacy_2y_maps_to_y3(self):
        """Legacy '2y' resolves to 36 months (Y3), not 24."""
        bounds = resolve_timeframe("2y", max_date=date(2025, 12, 29))
        assert bounds["months_in_period"] == 36

    def test_bounds_always_month_aligned(self):
        """Date bounds always on 1st of month (URA data rule)."""
        bounds = resolve_timeframe("Y1", max_date=date(2025, 6, 15))
        assert bounds["date_from"].day == 1
        assert bounds["date_to_exclusive"].day == 1
