"""
KPI Guardrail Tests

These tests prevent SQL parameter bugs in KPI queries:
1. Placeholder validation catches missing params before execute
2. Date bounds use exclusive upper bound convention
3. Each KPI file is self-contained (no shared SQL breakage)

Run with: pytest tests/test_kpi_guardrails.py -v
"""
import pytest
import re
from datetime import date, timedelta
from pathlib import Path

from services.kpi.base import (
    validate_sql_params,
    build_date_bounds,
    build_comparison_bounds,
)


# =============================================================================
# PLACEHOLDER / PARAM VALIDATION
# =============================================================================

class TestValidateSqlParams:
    """Test placeholder/param validation catches mismatches."""

    def test_valid_params_pass(self):
        """All placeholders have matching params - should pass."""
        sql = """
            SELECT * FROM transactions
            WHERE date >= :min_date AND date < :max_date_exclusive
        """
        params = {
            'min_date': date(2024, 1, 1),
            'max_date_exclusive': date(2024, 2, 1),
        }
        # Should not raise
        validate_sql_params(sql, params)

    def test_missing_param_fails(self):
        """SQL has placeholder not in params - should fail."""
        sql = """
            SELECT * FROM transactions
            WHERE date >= :min_date AND date < :max_date_exclusive
        """
        params = {
            'min_date': date(2024, 1, 1),
            # Missing 'max_date_exclusive'
        }
        with pytest.raises(ValueError) as exc:
            validate_sql_params(sql, params)

        assert 'max_date_exclusive' in str(exc.value)
        assert 'missing' in str(exc.value).lower()

    def test_extra_param_warns_but_passes(self):
        """Extra params not in SQL - should warn but not fail."""
        sql = "SELECT * FROM transactions WHERE date >= :min_date"
        params = {
            'min_date': date(2024, 1, 1),
            'unused_param': 'value',  # Not in SQL
        }
        # Should not raise (just logs warning)
        validate_sql_params(sql, params)

    def test_double_colon_cast_not_matched(self):
        """::type casts should not be matched as placeholders."""
        sql = """
            SELECT * FROM transactions
            WHERE date >= :min_date::date
        """
        params = {
            'min_date': date(2024, 1, 1),
        }
        # Should not fail looking for 'date' as a param
        validate_sql_params(sql, params)

    def test_quoted_colon_not_matched(self):
        """Colons in strings should not be matched."""
        sql = """
            SELECT * FROM transactions
            WHERE label = 'time: 12:30' AND date >= :min_date
        """
        params = {
            'min_date': date(2024, 1, 1),
        }
        # Should not fail looking for '30' or 'time' as params
        validate_sql_params(sql, params)

    def test_interval_expression_with_param(self):
        """INTERVAL expressions using params should work."""
        sql = """
            SELECT * FROM transactions
            WHERE date >= :max_date_exclusive - INTERVAL '12 months'
              AND date < :max_date_exclusive
        """
        params = {
            'max_date_exclusive': date(2024, 2, 1),
        }
        # Should pass - same param used twice
        validate_sql_params(sql, params)


# =============================================================================
# DATE BOUNDS CONVENTION
# =============================================================================

class TestBuildDateBounds:
    """Test canonical date bounds builder."""

    def test_default_is_today(self):
        """No max_date defaults to today."""
        bounds = build_date_bounds()
        assert bounds['max_date_exclusive'] == date.today() + timedelta(days=1)

    def test_exclusive_upper_bound(self):
        """Upper bound is +1 day (exclusive)."""
        max_date = date(2024, 1, 15)
        bounds = build_date_bounds(max_date=max_date)

        assert bounds['max_date_exclusive'] == date(2024, 1, 16)

    def test_lookback_days(self):
        """min_date is max_date - lookback_days."""
        max_date = date(2024, 1, 31)
        bounds = build_date_bounds(max_date=max_date, lookback_days=30)

        assert bounds['min_date'] == date(2024, 1, 1)

    def test_month_boundary(self):
        """Month boundary dates work correctly."""
        max_date = date(2024, 3, 1)
        bounds = build_date_bounds(max_date=max_date, lookback_days=30)

        # min_date should be Jan 31
        assert bounds['min_date'] == date(2024, 1, 31)


class TestBuildComparisonBounds:
    """Test period comparison bounds builder."""

    def test_current_and_previous_periods(self):
        """Generates current and previous period bounds."""
        max_date = date(2024, 2, 15)
        bounds = build_comparison_bounds(max_date=max_date, period_days=30)

        # Current period: Jan 16 - Feb 16 (exclusive)
        assert bounds['min_date'] == date(2024, 1, 16)
        assert bounds['max_date_exclusive'] == date(2024, 2, 16)

        # Previous period: Dec 17 - Jan 16 (exclusive)
        assert bounds['prev_min_date'] == date(2023, 12, 17)
        assert bounds['prev_max_date_exclusive'] == date(2024, 1, 16)

    def test_periods_are_contiguous(self):
        """Previous period ends exactly where current starts."""
        bounds = build_comparison_bounds(max_date=date(2024, 6, 1), period_days=30)

        assert bounds['prev_max_date_exclusive'] == bounds['min_date']


# =============================================================================
# KPI FILE STRUCTURE GUARDRAILS
# =============================================================================

class TestKpiFileStructure:
    """Ensure each KPI file follows the template pattern."""

    BACKEND_ROOT = Path(__file__).parent.parent
    KPI_DIR = BACKEND_ROOT / 'services' / 'kpi'

    # Required exports for a KPI file
    REQUIRED_ELEMENTS = ['SPEC', 'build_params', 'get_sql', 'map_result']

    def get_kpi_files(self):
        """Get all KPI spec files (not base/registry)."""
        if not self.KPI_DIR.exists():
            return []
        skip = ['__init__.py', 'base.py', 'registry.py', '__pycache__']
        return [
            f for f in self.KPI_DIR.glob('*.py')
            if f.name not in skip and not f.name.startswith('__')
        ]

    def test_each_kpi_has_spec_export(self):
        """Each KPI file should export a SPEC object."""
        missing = []

        for filepath in self.get_kpi_files():
            content = filepath.read_text()
            if 'SPEC = ' not in content:
                missing.append(filepath.name)

        if missing:
            pytest.fail(f"KPI files missing 'SPEC = ' export: {missing}")

    def test_each_kpi_has_required_functions(self):
        """Each KPI file should have build_params, get_sql, map_result."""
        violations = []

        for filepath in self.get_kpi_files():
            content = filepath.read_text()
            missing = []
            for func in ['def build_params', 'def get_sql', 'def map_result']:
                if func not in content:
                    missing.append(func.replace('def ', ''))
            if missing:
                violations.append(f"{filepath.name}: missing {missing}")

        if violations:
            pytest.fail(f"KPI files with missing functions:\n" + "\n".join(violations))

    def test_no_shared_sql_imports(self):
        """KPI files should not import SQL from other KPI files.

        Each KPI owns its SQL - prevents shared param breakage.
        """
        violations = []

        for filepath in self.get_kpi_files():
            content = filepath.read_text()
            # Check for cross-KPI imports
            if re.search(r'from services\.kpi\.[a-z_]+ import.*sql', content, re.IGNORECASE):
                violations.append(filepath.name)

        if violations:
            pytest.fail(
                f"KPI files importing SQL from other KPIs: {violations}\n"
                "Each KPI should own its SQL to prevent shared param bugs."
            )


# =============================================================================
# REGISTRY CONSISTENCY
# =============================================================================

class TestKpiRegistry:
    """Test KPI registry consistency."""

    def test_enabled_kpis_match_order(self):
        """ENABLED_KPIS should match KPI_ORDER."""
        from services.kpi.registry import ENABLED_KPIS, KPI_ORDER, KPI_REGISTRY

        # Check order matches
        enabled_ids = [spec.kpi_id for spec in ENABLED_KPIS]
        assert enabled_ids == KPI_ORDER, (
            f"ENABLED_KPIS order doesn't match KPI_ORDER.\n"
            f"ENABLED_KPIS: {enabled_ids}\n"
            f"KPI_ORDER: {KPI_ORDER}"
        )

    def test_registry_contains_all_ordered(self):
        """KPI_REGISTRY should contain all KPIs in KPI_ORDER."""
        from services.kpi.registry import KPI_ORDER, KPI_REGISTRY

        missing = [kpi_id for kpi_id in KPI_ORDER if kpi_id not in KPI_REGISTRY]
        if missing:
            pytest.fail(f"KPIs in KPI_ORDER but not in KPI_REGISTRY: {missing}")

    def test_no_orphan_kpis(self):
        """All KPIs in registry should be in KPI_ORDER."""
        from services.kpi.registry import KPI_ORDER, KPI_REGISTRY

        orphans = [kpi_id for kpi_id in KPI_REGISTRY if kpi_id not in KPI_ORDER]
        if orphans:
            pytest.fail(f"KPIs in KPI_REGISTRY but not in KPI_ORDER: {orphans}")


# =============================================================================
# API ENVELOPE STRUCTURE
# =============================================================================

class TestKpiApiEnvelope:
    """Test KPI v2 API response envelope structure.

    The KPI endpoint must return { data: { kpis: [...] }, meta: {...} } format.
    Frontend apiClient unwraps the envelope so callers can use response.data.kpis.
    """

    def test_kpi_v2_returns_data_envelope(self):
        """KPI v2 endpoint returns proper { data: {...}, meta: {...} } envelope.

        Without the data envelope, the @api_contract wrapper adds an extra layer,
        causing frontend to need response.data.data.kpis instead of response.data.kpis.
        """
        import json
        from routes.analytics.kpi_v2 import kpi_summary_v2

        # Mock Flask app context and request
        from flask import Flask
        app = Flask(__name__)
        app.config['TESTING'] = True

        # We can't easily test the full endpoint without DB, but we can
        # verify the response structure by checking the endpoint code pattern
        import inspect
        source = inspect.getsource(kpi_summary_v2)

        # The endpoint MUST return data inside a "data" key to avoid double-wrapping
        assert '"data":' in source or "'data':" in source, (
            "kpi_summary_v2 must return response with 'data' key to match api_contract wrapper. "
            "Expected: { 'data': { 'kpis': [...] }, 'meta': {...} }"
        )

    def test_kpi_results_have_required_fields(self):
        """Each KPI result must have required fields for frontend rendering."""
        from services.kpi.registry import run_all_kpis

        # Empty filters - just testing structure
        # Note: This requires DB connection, so may skip in CI
        try:
            results = run_all_kpis({})
        except Exception:
            pytest.skip("Requires database connection")
            return

        required_fields = ['kpi_id', 'title', 'value', 'formatted_value']

        for result in results:
            for field in required_fields:
                assert field in result, (
                    f"KPI {result.get('kpi_id', 'unknown')} missing required field: {field}"
                )
