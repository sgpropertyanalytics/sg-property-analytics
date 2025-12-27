"""
KPI Registry - Central runner for all KPI specs.

The endpoint calls this, not individual KPI files.

Usage:
    from services.kpi.registry import run_all_kpis

    results = run_all_kpis(filters)
    # Returns list of KPIResult dicts
"""

import logging
from typing import Dict, Any, List
from dataclasses import asdict

from sqlalchemy import text
from models.database import db
from services.kpi.base import KPIResult, validate_sql_params

logger = logging.getLogger('kpi.registry')


# =============================================================================
# KPI REGISTRY
# =============================================================================

# Import all KPI specs
from services.kpi.median_psf import SPEC as median_psf_spec
from services.kpi.resale_velocity import SPEC as resale_velocity_spec
from services.kpi.kpi_total_transactions import SPEC as total_transactions_spec
from services.kpi.market_momentum import SPEC as market_momentum_spec


# Explicit order - frontend relies on this (stable, deterministic)
KPI_ORDER = [
    'median_psf',
    'total_transactions',
    'resale_velocity',
    'market_momentum',
]

# Registry by ID for lookup
KPI_REGISTRY = {
    'median_psf': median_psf_spec,
    'resale_velocity': resale_velocity_spec,
    'total_transactions': total_transactions_spec,
    'market_momentum': market_momentum_spec,
}

# Enabled KPIs in explicit order
ENABLED_KPIS = [KPI_REGISTRY[kpi_id] for kpi_id in KPI_ORDER]


# =============================================================================
# EXECUTION
# =============================================================================

def run_kpi(spec, filters: Dict[str, Any]) -> KPIResult:
    """
    Run a single KPI spec safely.

    Steps:
        1. Build params
        2. Build SQL (may be dynamic based on params)
        3. Validate placeholders
        4. Execute
        5. Map result
    """
    try:
        # 1. Build params
        params = spec.build_params(filters.copy())

        # 2. Get SQL (may consume _filter_parts from params)
        sql = spec.get_sql(params)

        # 3. Validate placeholders match params
        validate_sql_params(sql, params)

        # 4. Execute
        result = db.session.execute(text(sql), params).fetchone()

        # 5. Map result
        return spec.map_result(result, filters)

    except Exception as e:
        logger.error(f"KPI {spec.kpi_id} failed: {e}", exc_info=True)
        return KPIResult(
            kpi_id=spec.kpi_id,
            title=spec.title,
            value=None,
            formatted_value="—",
            subtitle=spec.subtitle,
            insight="Error computing metric",
            meta={"error": str(e)}
        )


def run_all_kpis(filters: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Run all enabled KPIs and return results as dicts.

    Each KPI runs independently - one failure doesn't affect others.

    Args:
        filters: {
            districts: str or list,
            segment: str,
            bedrooms: str or list,
            max_date: date (optional, defaults to today)
        }

    Returns:
        List of KPIResult dicts ready for JSON serialization
    """
    results = []
    errors = []

    for spec in ENABLED_KPIS:
        kpi_result = run_kpi(spec, filters)
        result_dict = asdict(kpi_result)

        # Track errors for debugging (meta can be None, not just missing)
        meta = result_dict.get('meta') or {}
        if meta.get('error'):
            errors.append({
                'kpi_id': spec.kpi_id,
                'error': meta['error']
            })

        results.append(result_dict)

    # Log summary if any errors occurred
    if errors:
        logger.warning(f"KPI run completed with {len(errors)} errors: {errors}")

    return results


def get_kpi_by_id(kpi_id: str, filters: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run a single KPI by ID.

    Useful for testing or when frontend only needs one metric.
    """
    spec = KPI_REGISTRY.get(kpi_id)
    if spec:
        return asdict(run_kpi(spec, filters))

    return {
        "kpi_id": kpi_id,
        "error": f"Unknown KPI: {kpi_id}. Available: {list(KPI_REGISTRY.keys())}"
    }


def list_enabled_kpis() -> List[Dict[str, str]]:
    """List all enabled KPI IDs and titles."""
    return [
        {"kpi_id": spec.kpi_id, "title": spec.title, "subtitle": spec.subtitle}
        for spec in ENABLED_KPIS
    ]
