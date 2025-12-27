"""
KPI Services Package

Standardized KPI computation with:
- One file per KPI (no shared SQL)
- Automatic placeholder validation
- Canonical date bounds

Usage:
    from services.kpi import run_all_kpis, get_kpi_by_id

    # Run all KPIs
    results = run_all_kpis({"segment": "CCR", "bedrooms": "2,3"})

    # Run single KPI
    result = get_kpi_by_id("median_psf", filters)
"""

from services.kpi.registry import (
    run_all_kpis,
    get_kpi_by_id,
    list_enabled_kpis,
    ENABLED_KPIS,
)

from services.kpi.base import (
    KPIResult,
    KPISpec,
    build_date_bounds,
    build_comparison_bounds,
    validate_sql_params,
)

__all__ = [
    'run_all_kpis',
    'get_kpi_by_id',
    'list_enabled_kpis',
    'ENABLED_KPIS',
    'KPIResult',
    'KPISpec',
    'build_date_bounds',
    'build_comparison_bounds',
    'validate_sql_params',
]
