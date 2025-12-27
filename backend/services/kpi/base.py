"""
KPI Base Module - Shared infrastructure for all KPI specs.

Core components:
- KPIResult: standardized output shape
- build_date_bounds(): canonical date params
- validate_sql_params(): fail-fast placeholder check
- execute_kpi(): run a KPI spec safely

Usage:
    from services.kpi.base import KPIResult, build_date_bounds, execute_kpi
"""

import re
import logging
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Dict, Any, Optional, List, Callable

from sqlalchemy import text
from models.database import db

logger = logging.getLogger('kpi')


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class KPIResult:
    """Standardized KPI output shape for frontend."""
    kpi_id: str
    title: str
    value: Any
    formatted_value: str
    subtitle: Optional[str] = None
    trend: Optional[Dict[str, Any]] = None  # {value, direction, label}
    insight: Optional[str] = None
    meta: Optional[Dict[str, Any]] = None


@dataclass
class KPISpec:
    """
    KPI specification - everything needed to compute one KPI.

    Each KPI file exports one of these.
    """
    kpi_id: str
    title: str
    subtitle: Optional[str]
    build_params: Callable[[Dict[str, Any]], Dict[str, Any]]  # filters -> params
    sql: str
    map_result: Callable[[Any, Dict[str, Any]], KPIResult]  # row, filters -> KPIResult


# =============================================================================
# DATE BOUNDS (Canonical - use everywhere)
# =============================================================================

def build_date_bounds(
    max_date: Optional[date] = None,
    lookback_days: int = 30
) -> Dict[str, Any]:
    """
    Build canonical date parameters.

    RULE: Always use exclusive upper bound.
    - min_date: inclusive (>=)
    - max_date_exclusive: exclusive (<)

    For "last N days":
        WHERE date >= :min_date AND date < :max_date_exclusive

    For "last 12 months" relative:
        WHERE date >= :max_date_exclusive - INTERVAL '12 months'
          AND date < :max_date_exclusive

    Args:
        max_date: The reference date (defaults to today)
        lookback_days: How many days back for min_date

    Returns:
        {min_date, max_date_exclusive}
    """
    if max_date is None:
        max_date = date.today()

    return {
        'min_date': max_date - timedelta(days=lookback_days),
        'max_date_exclusive': max_date + timedelta(days=1),
    }


def build_comparison_bounds(
    max_date: Optional[date] = None,
    period_days: int = 30
) -> Dict[str, Any]:
    """
    Build date params for current vs previous period comparison.

    Returns:
        {
            min_date: start of current period,
            max_date_exclusive: end of current period (exclusive),
            prev_min_date: start of previous period,
            prev_max_date_exclusive: end of previous period (exclusive)
        }
    """
    if max_date is None:
        max_date = date.today()

    max_exclusive = max_date + timedelta(days=1)
    min_date = max_date - timedelta(days=period_days)
    prev_min = min_date - timedelta(days=period_days)

    return {
        'min_date': min_date,
        'max_date_exclusive': max_exclusive,
        'prev_min_date': prev_min,
        'prev_max_date_exclusive': min_date,  # Previous ends where current starts
    }


# =============================================================================
# SQL VALIDATION (The guardrail that prevents param bugs)
# =============================================================================

def validate_sql_params(sql: str, params: Dict[str, Any]) -> None:
    """
    Fail fast if SQL placeholders don't match params dict.

    This catches the exact bug class:
        SQL uses :max_date but params dict removed it.

    Raises:
        ValueError if any placeholder missing from params
    """
    # Extract all :placeholder names from SQL
    # Matches :word but not ::cast or quoted strings
    placeholders = set(re.findall(r'(?<![:\w]):([a-zA-Z_][a-zA-Z0-9_]*)', sql))
    param_keys = set(params.keys())

    missing = placeholders - param_keys
    if missing:
        raise ValueError(
            f"SQL placeholders missing from params: {missing}. "
            f"SQL has: {placeholders}, params has: {param_keys}"
        )

    unused = param_keys - placeholders
    if unused:
        logger.warning(f"Unused params (not in SQL): {unused}")


# =============================================================================
# KPI EXECUTION
# =============================================================================

def execute_kpi(spec: KPISpec, filters: Dict[str, Any]) -> KPIResult:
    """
    Execute a single KPI spec safely.

    Steps:
        1. Build params from filters using spec.build_params
        2. Validate SQL placeholders match params
        3. Execute SQL
        4. Map result using spec.map_result

    Args:
        spec: The KPI specification
        filters: User filters (district, bedroom, segment, etc.)

    Returns:
        KPIResult with computed values
    """
    # 1. Build params
    params = spec.build_params(filters)

    # 2. Validate (fail fast)
    validate_sql_params(spec.sql, params)

    # 3. Execute
    try:
        result = db.session.execute(text(spec.sql), params).fetchone()
    except Exception as e:
        logger.error(f"KPI {spec.kpi_id} query failed: {e}")
        # Return empty result rather than crash
        return KPIResult(
            kpi_id=spec.kpi_id,
            title=spec.title,
            value=None,
            formatted_value="—",
            subtitle=spec.subtitle,
            insight="Data unavailable",
            meta={"error": str(e)}
        )

    # 4. Map result
    return spec.map_result(result, filters)


def execute_kpis(specs: List[KPISpec], filters: Dict[str, Any]) -> List[KPIResult]:
    """
    Execute multiple KPI specs.

    Each KPI runs independently - one failure doesn't affect others.
    """
    results = []
    for spec in specs:
        try:
            result = execute_kpi(spec, filters)
            results.append(result)
        except Exception as e:
            logger.error(f"KPI {spec.kpi_id} failed: {e}")
            results.append(KPIResult(
                kpi_id=spec.kpi_id,
                title=spec.title,
                value=None,
                formatted_value="—",
                subtitle=spec.subtitle,
                insight="Error computing metric",
                meta={"error": str(e)}
            ))
    return results


# =============================================================================
# FILTER HELPERS (Reusable across KPIs)
# =============================================================================

def build_filter_clause(filters: Dict[str, Any]) -> tuple:
    """
    Build WHERE clause parts from standard filters.

    Returns:
        (sql_parts: list, params: dict)

    Usage:
        parts, params = build_filter_clause(filters)
        where = " AND ".join(["COALESCE(is_outlier, false) = false"] + parts)
    """
    parts = []
    params = {}

    # District filter
    if filters.get('districts'):
        districts = filters['districts']
        if isinstance(districts, str):
            districts = [d.strip().upper() for d in districts.split(',')]
        placeholders = ','.join([f":district_{i}" for i in range(len(districts))])
        parts.append(f"district IN ({placeholders})")
        for i, d in enumerate(districts):
            params[f'district_{i}'] = d if d.startswith('D') else f'D{d.zfill(2)}'

    # Segment filter (converts to districts)
    elif filters.get('segment'):
        from constants import get_districts_for_region
        segment = filters['segment'].upper()
        if segment in ['CCR', 'RCR', 'OCR']:
            seg_districts = get_districts_for_region(segment)
            placeholders = ','.join([f":seg_d_{i}" for i in range(len(seg_districts))])
            parts.append(f"district IN ({placeholders})")
            for i, d in enumerate(seg_districts):
                params[f'seg_d_{i}'] = d

    # Bedroom filter
    if filters.get('bedrooms'):
        bedrooms = filters['bedrooms']
        if isinstance(bedrooms, str):
            bedrooms = [int(b.strip()) for b in bedrooms.split(',') if b.strip().isdigit()]
        placeholders = ','.join([f":bed_{i}" for i in range(len(bedrooms))])
        parts.append(f"bedroom_count IN ({placeholders})")
        for i, b in enumerate(bedrooms):
            params[f'bed_{i}'] = b

    return parts, params
