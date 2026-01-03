"""
KPI Registry - Central runner for all KPI specs.

The endpoint calls this, not individual KPI files.

Usage:
    from services.kpi.registry import run_all_kpis

    results = run_all_kpis(filters)
    # Returns list of KPIResult dicts

Performance:
    KPIs execute in PARALLEL using ThreadPoolExecutor.
    Each thread gets its own database connection from the pool.
    Expected speedup: ~300ms → ~120ms (4 KPIs in parallel vs sequential).
"""

import logging
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Any, List, Tuple
from dataclasses import asdict

from sqlalchemy import text
from models.database import db
from services.kpi.base import KPIResult, validate_sql_params

logger = logging.getLogger('kpi.registry')

# Configuration
# Set KPI_PARALLEL=0 to disable parallel execution (for debugging)
KPI_PARALLEL_ENABLED = os.environ.get('KPI_PARALLEL', '1') != '0'
KPI_MAX_WORKERS = int(os.environ.get('KPI_MAX_WORKERS', '4'))


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

def run_kpi(spec, filters: Dict[str, Any], connection=None) -> KPIResult:
    """
    Run a single KPI spec safely.

    Steps:
        1. Build params
        2. Build SQL (may be dynamic based on params)
        3. Validate placeholders
        4. Execute
        5. Map result

    Args:
        spec: KPI specification
        filters: User filters dict
        connection: Optional SQLAlchemy connection for thread-safe execution.
                   If None, uses db.session (only safe in main thread).
    """
    try:
        # 1. Build params
        params = spec.build_params(filters.copy())

        # 2. Get SQL (may consume _filter_parts from params)
        sql = spec.get_sql(params)

        # 3. Validate placeholders match params
        validate_sql_params(sql, params)

        # 4. Execute (use provided connection or db.session)
        if connection is not None:
            result = connection.execute(text(sql), params).fetchone()
        else:
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


def _run_kpi_thread_safe(
    spec,
    filters: Dict[str, Any],
    kpi_index: int
) -> Tuple[int, KPIResult]:
    """
    Run a single KPI in a thread-safe manner.

    Gets a fresh connection from the pool for this thread.
    Returns tuple of (index, result) to preserve ordering.
    """
    try:
        # Get a fresh connection from the pool for this thread
        with db.engine.connect() as connection:
            result = run_kpi(spec, filters, connection=connection)
            return (kpi_index, result)
    except Exception as e:
        logger.error(f"KPI {spec.kpi_id} thread execution failed: {e}", exc_info=True)
        return (kpi_index, KPIResult(
            kpi_id=spec.kpi_id,
            title=spec.title,
            value=None,
            formatted_value="—",
            subtitle=spec.subtitle,
            insight="Error computing metric",
            meta={"error": str(e), "thread_error": True}
        ))


def _run_all_kpis_sequential(filters: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Run all KPIs sequentially (fallback mode).

    Used when:
    - KPI_PARALLEL=0 environment variable is set
    - Parallel execution fails
    """
    results = []
    errors = []

    for spec in ENABLED_KPIS:
        kpi_result = run_kpi(spec, filters)
        result_dict = asdict(kpi_result)

        meta = result_dict.get('meta') or {}
        if meta.get('error'):
            errors.append({
                'kpi_id': spec.kpi_id,
                'error': meta['error']
            })

        results.append(result_dict)

    if errors:
        logger.warning(f"KPI run (sequential) completed with {len(errors)} errors: {errors}")

    return results


def _run_all_kpis_parallel(filters: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Run all KPIs in parallel using ThreadPoolExecutor.

    Each KPI gets its own database connection from the pool.
    Results are collected and reordered to match KPI_ORDER.

    Performance: ~300ms sequential → ~120ms parallel (4 KPIs)
    """
    num_kpis = len(ENABLED_KPIS)
    results: List[Tuple[int, KPIResult]] = []
    errors = []

    # Use min of configured workers and number of KPIs
    max_workers = min(KPI_MAX_WORKERS, num_kpis)

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all KPIs for parallel execution
        futures = {
            executor.submit(_run_kpi_thread_safe, spec, filters, idx): idx
            for idx, spec in enumerate(ENABLED_KPIS)
        }

        # Collect results as they complete
        for future in as_completed(futures):
            try:
                idx, kpi_result = future.result()
                results.append((idx, kpi_result))

                # Track errors
                if kpi_result.meta and kpi_result.meta.get('error'):
                    errors.append({
                        'kpi_id': kpi_result.kpi_id,
                        'error': kpi_result.meta['error']
                    })
            except Exception as e:
                # This shouldn't happen since _run_kpi_thread_safe catches errors
                idx = futures[future]
                spec = ENABLED_KPIS[idx]
                logger.error(f"Future for KPI {spec.kpi_id} failed: {e}", exc_info=True)
                results.append((idx, KPIResult(
                    kpi_id=spec.kpi_id,
                    title=spec.title,
                    value=None,
                    formatted_value="—",
                    subtitle=spec.subtitle,
                    insight="Error computing metric",
                    meta={"error": str(e), "future_error": True}
                )))
                errors.append({'kpi_id': spec.kpi_id, 'error': str(e)})

    # Sort by original index to preserve KPI_ORDER
    results.sort(key=lambda x: x[0])

    # Convert to dict format
    result_dicts = [asdict(result) for _, result in results]

    if errors:
        logger.warning(f"KPI run (parallel) completed with {len(errors)} errors: {errors}")

    return result_dicts


def run_all_kpis(filters: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Run all enabled KPIs and return results as dicts.

    Execution mode:
    - PARALLEL (default): Uses ThreadPoolExecutor with separate connections
    - SEQUENTIAL: Falls back if KPI_PARALLEL=0 or if parallel fails

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
    if not KPI_PARALLEL_ENABLED:
        logger.debug("Parallel KPI execution disabled, using sequential mode")
        return _run_all_kpis_sequential(filters)

    try:
        return _run_all_kpis_parallel(filters)
    except Exception as e:
        # Fallback to sequential if parallel execution fails entirely
        logger.warning(f"Parallel KPI execution failed, falling back to sequential: {e}")
        return _run_all_kpis_sequential(filters)


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
