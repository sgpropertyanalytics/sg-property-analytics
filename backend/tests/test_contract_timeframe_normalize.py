"""
Tests for contract-layer timeframe normalization.

Ensures API contract layer resolves timeframe → date bounds.
"""
from datetime import date

from api.contracts.normalize import normalize_params
from api.contracts.schemas.insights import DISTRICT_PSF_PARAM_SCHEMA


class TestContractNormalize:
    """Test timeframe normalization in contract layer."""

    def test_timeframe_produces_bounds(self):
        """timeframe=M3 produces date_from, date_to_exclusive, months_in_period."""
        out = normalize_params({"timeframe": "M3"}, DISTRICT_PSF_PARAM_SCHEMA)

        assert "date_from" in out
        assert "date_to_exclusive" in out
        assert out["months_in_period"] == 3

    def test_legacy_period_works(self):
        """Legacy period=12m produces same as timeframe=Y1."""
        out = normalize_params({"period": "12m"}, DISTRICT_PSF_PARAM_SCHEMA)

        assert out["months_in_period"] == 12
        assert out["date_from"] is not None

    def test_timeframe_takes_precedence_over_period(self):
        """timeframe takes precedence over legacy period."""
        out = normalize_params({
            "timeframe": "M3",
            "period": "12m"
        }, DISTRICT_PSF_PARAM_SCHEMA)

        # timeframe=M3 (3 months) should win over period=12m
        assert out["months_in_period"] == 3

    def test_all_returns_none_bounds(self):
        """timeframe=all produces None bounds."""
        out = normalize_params({"timeframe": "all"}, DISTRICT_PSF_PARAM_SCHEMA)

        assert out.get("date_from") is None
        assert out.get("date_to_exclusive") is None

    def test_empty_params_defaults_to_all(self):
        """No timeframe param defaults to all (full database)."""
        out = normalize_params({}, DISTRICT_PSF_PARAM_SCHEMA)

        # 'all' means no date bounds
        assert out.get("date_from") is None
        assert out.get("date_to_exclusive") is None
        assert out.get("months_in_period") is None
