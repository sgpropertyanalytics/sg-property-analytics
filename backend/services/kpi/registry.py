"""
KPI Registry - Central runner for all KPI specs.

The endpoint calls this, not individual KPI files.

PERFORMANCE: Uses multi-CTE query to fetch all KPIs in ONE DB roundtrip.
This matches the dashboard_service.py pattern and avoids connection pool
contention that parallel execution would cause.

Before: 4 sequential queries (~250ms total)
After:  1 multi-CTE query (~80-100ms)

Usage:
    from services.kpi.registry import run_all_kpis

    results = run_all_kpis(filters)
    # Returns list of KPIResult dicts
"""

import logging
import time
from datetime import date
from typing import Dict, Any, List, Optional
from dataclasses import asdict

from sqlalchemy import text
from models.database import db
from constants import SALE_TYPE_RESALE
from services.kpi.base import KPIResult, validate_sql_params, _months_back
from utils.filter_builder import build_sql_where

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


def _build_multi_cte_query(filters: Dict[str, Any]) -> tuple[str, Dict[str, Any]]:
    """
    Build a single multi-CTE query that computes ALL KPIs in one DB roundtrip.

    This matches the dashboard_service.py pattern for efficiency.

    Returns:
        (sql_string, params_dict)
    """
    max_date = filters.get('max_date') or date.today()

    # Use MONTH boundaries (URA data is month-level)
    max_exclusive = date(max_date.year, max_date.month, 1)

    # 3-month windows for median_psf, total_transactions, resale_velocity
    q0_start = _months_back(max_exclusive, 3)  # Current quarter
    q1_start = _months_back(max_exclusive, 6)  # Previous quarter
    q2_start = _months_back(max_exclusive, 9)  # Older quarter (for momentum)

    # 36-month window for volatility calculation
    volatility_start = _months_back(max_exclusive, 36)

    # Build filter clause
    filter_parts, filter_params = build_sql_where(filters)
    base_filter = " AND ".join(filter_parts) if filter_parts else "1=1"
    resale_filter = f"sale_type = '{SALE_TYPE_RESALE}'"

    params = {
        'q0_start': q0_start,
        'q0_end': max_exclusive,
        'q1_start': q1_start,
        'q1_end': q0_start,
        'q2_start': q2_start,
        'q2_end': q1_start,
        'volatility_start': volatility_start,
        **filter_params
    }

    sql = f"""
        WITH
        -- ================================================================
        -- MEDIAN PSF: Current and Previous 3-month windows (resale only)
        -- ================================================================
        median_current AS (
            SELECT
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions_primary
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :q0_start
              AND transaction_date < :q0_end
        ),
        median_prev AS (
            SELECT
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions_primary
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :q1_start
              AND transaction_date < :q1_end
        ),

        -- ================================================================
        -- TOTAL TRANSACTIONS: Current and Previous counts (resale only)
        -- ================================================================
        txn_current AS (
            SELECT COUNT(*) as txn_count
            FROM transactions_primary
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :q0_start
              AND transaction_date < :q0_end
        ),
        txn_prev AS (
            SELECT COUNT(*) as txn_count
            FROM transactions_primary
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :q1_start
              AND transaction_date < :q1_end
        ),

        -- ================================================================
        -- MARKET MOMENTUM: 3 quarters + volatility (resale only)
        -- ================================================================
        momentum_q0 AS (
            SELECT
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions_primary
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :q0_start
              AND transaction_date < :q0_end
        ),
        momentum_q1 AS (
            SELECT
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions_primary
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :q1_start
              AND transaction_date < :q1_end
        ),
        momentum_q2 AS (
            SELECT
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions_primary
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :q2_start
              AND transaction_date < :q2_end
        ),
        -- Quarterly PSF for volatility (last 12 quarters)
        quarterly_psf AS (
            SELECT
                DATE_TRUNC('quarter', transaction_date) as quarter,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions_primary
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :volatility_start
              AND transaction_date < :q0_end
            GROUP BY DATE_TRUNC('quarter', transaction_date)
            HAVING COUNT(*) >= 5
        ),
        quarterly_changes AS (
            SELECT
                quarter,
                median_psf,
                txn_count,
                LAG(median_psf) OVER (ORDER BY quarter) as prev_quarter_psf,
                CASE
                    WHEN LAG(median_psf) OVER (ORDER BY quarter) > 0
                    THEN ((median_psf - LAG(median_psf) OVER (ORDER BY quarter))
                          / LAG(median_psf) OVER (ORDER BY quarter)) * 100
                    ELSE NULL
                END as pct_change
            FROM quarterly_psf
        ),
        volatility AS (
            SELECT
                STDDEV(pct_change) as quarterly_stddev,
                COUNT(pct_change) as quarters_count,
                AVG(txn_count) as avg_deals_per_quarter,
                MIN(txn_count) as min_deals_per_quarter
            FROM quarterly_changes
            WHERE pct_change IS NOT NULL
        )

        -- ================================================================
        -- FINAL SELECT: All KPI data in one row
        -- ================================================================
        SELECT
            -- Median PSF
            mc.median_psf as median_current_psf,
            mc.txn_count as median_current_count,
            mp.median_psf as median_prev_psf,
            mp.txn_count as median_prev_count,

            -- Total Transactions
            tc.txn_count as txn_current_count,
            tp.txn_count as txn_prev_count,

            -- Market Momentum
            mq0.median_psf as momentum_q0_psf,
            mq0.txn_count as momentum_q0_count,
            mq1.median_psf as momentum_q1_psf,
            mq1.txn_count as momentum_q1_count,
            mq2.median_psf as momentum_q2_psf,
            mq2.txn_count as momentum_q2_count,
            v.quarterly_stddev as volatility,
            v.quarters_count as volatility_quarters,
            v.avg_deals_per_quarter,
            v.min_deals_per_quarter

        FROM median_current mc
        CROSS JOIN median_prev mp
        CROSS JOIN txn_current tc
        CROSS JOIN txn_prev tp
        CROSS JOIN momentum_q0 mq0
        CROSS JOIN momentum_q1 mq1
        CROSS JOIN momentum_q2 mq2
        CROSS JOIN volatility v
    """

    return sql, params


def _map_median_psf_result(row, filters: Dict[str, Any]) -> KPIResult:
    """Map multi-CTE row to median_psf KPIResult."""
    if not row or not row.median_current_psf:
        return KPIResult(
            kpi_id="median_psf",
            title="Resale Median PSF",
            value=0,
            formatted_value="—",
            subtitle="Q-o-Q (resale only)",
            insight="Insufficient data"
        )

    current = float(row.median_current_psf)
    prev = float(row.median_prev_psf) if row.median_prev_psf else None
    current_count = int(row.median_current_count or 0)
    prev_count = int(row.median_prev_count or 0)

    # Sample size gate
    MIN_SAMPLE_SIZE = 20
    low_confidence = current_count < MIN_SAMPLE_SIZE or prev_count < MIN_SAMPLE_SIZE

    # Calculate growth %
    pct_change = None
    direction = "neutral"
    if prev and prev > 0:
        pct_change = ((current - prev) / prev) * 100
        direction = "up" if pct_change > 0.5 else "down" if pct_change < -0.5 else "neutral"

    return KPIResult(
        kpi_id="median_psf",
        title="Resale Median PSF",
        value=round(current),
        formatted_value=f"${round(current):,}",
        subtitle="Q-o-Q (resale only)",
        trend={
            "value": round(pct_change, 1) if pct_change is not None else 0,
            "direction": direction,
            "label": "QoQ"
        } if pct_change is not None else None,
        insight="[Low confidence]" if low_confidence else None,
        meta={
            "current_count": current_count,
            "prev_count": prev_count,
            "current_psf": round(current),
            "prev_psf": round(prev) if prev else None,
            "pct_change": round(pct_change, 1) if pct_change is not None else None,
            "low_confidence": low_confidence,
            "sale_type": "resale",
            "description": (
                "Compares the resale median PSF from the latest 3 full months "
                "against the previous 3 months (QoQ), using resale transactions only. "
                "Outliers excluded. Results with <20 transactions flagged as low confidence."
            )
        }
    )


def _map_total_transactions_result(row, filters: Dict[str, Any]) -> KPIResult:
    """Map multi-CTE row to total_transactions KPIResult."""
    if not row:
        return KPIResult(
            kpi_id="total_transactions",
            title="Total Transactions",
            value=0,
            formatted_value="—",
            subtitle="Last 3 months",
            insight="Insufficient data"
        )

    current_count = int(row.txn_current_count or 0)
    previous_count = int(row.txn_prev_count or 0)

    # Calculate % change
    if previous_count > 0:
        pct_change = ((current_count - previous_count) / previous_count) * 100
    else:
        pct_change = 0.0 if current_count == 0 else 100.0

    # Determine trend
    if pct_change > 10:
        direction, label = "up", "Strong Growth"
    elif pct_change > 5:
        direction, label = "up", "Growing"
    elif pct_change > 2:
        direction, label = "up", "Mild Uptick"
    elif pct_change >= -2:
        direction, label = "neutral", "Neutral"
    elif pct_change >= -5:
        direction, label = "down", "Softening"
    elif pct_change >= -10:
        direction, label = "down", "Weak"
    else:
        direction, label = "down", "Sharp Decline"

    return KPIResult(
        kpi_id="total_transactions",
        title="Total Transactions",
        value=current_count,
        formatted_value=f"{current_count:,}",
        subtitle="Last 3 months",
        trend={"value": round(pct_change, 1), "direction": direction, "label": label},
        meta={
            "current_count": current_count,
            "previous_count": previous_count,
            "pct_change": round(pct_change, 1),
            "direction": direction,
            "description": (
                "Total resale transactions in the last 3 full months compared to the "
                "previous 3 months. Measures market activity volume and momentum."
            )
        }
    )


def _map_resale_velocity_result(row, filters: Dict[str, Any]) -> KPIResult:
    """Map multi-CTE row to resale_velocity KPIResult."""
    # Get total units (requires separate lookup - this is the only extra query)
    from services.kpi.resale_velocity import get_total_units_for_scope

    total_units, projects_counted = get_total_units_for_scope(filters)

    if not row or total_units == 0:
        return KPIResult(
            kpi_id="resale_velocity",
            title="Annualized Resale Velocity",
            value=0,
            formatted_value="—",
            subtitle="annualized turnover",
            insight="Insufficient data"
        )

    current_txns = int(row.txn_current_count or 0)
    prior_txns = int(row.txn_prev_count or 0)

    # Calculate velocities
    current_velocity = (current_txns / total_units) * 100
    prior_velocity = (prior_txns / total_units) * 100 if prior_txns > 0 else 0

    # Annualized (quarterly × 4)
    current_annualized = current_velocity * 4
    prior_annualized = prior_velocity * 4

    # Interpretation
    if current_annualized > 6:
        label, direction = "High Turnover", "up"
    elif current_annualized >= 4:
        label, direction = "Very Active", "up"
    elif current_annualized >= 3:
        label, direction = "Active", "up"
    elif current_annualized >= 2:
        label, direction = "Healthy", "neutral"
    elif current_annualized >= 1:
        label, direction = "Slow", "down"
    else:
        label, direction = "Illiquid", "down"

    # Q-o-Q change
    pct_change = ((current_annualized - prior_annualized) / prior_annualized * 100) if prior_annualized > 0 else 0

    return KPIResult(
        kpi_id="resale_velocity",
        title="Annualized Resale Velocity",
        value=round(current_annualized, 2),
        formatted_value=f"{current_annualized:.1f}%",
        subtitle="annualized turnover",
        trend={"value": round(pct_change, 1), "direction": direction, "label": label},
        meta={
            "current_txns": current_txns,
            "prior_txns": prior_txns,
            "total_units": total_units,
            "projects_counted": projects_counted,
            "current_annualized": round(current_annualized, 2),
            "prior_annualized": round(prior_annualized, 2),
            "pct_change": round(pct_change, 1),
            "description": (
                "Annualized turnover rate: (quarterly resale txns / total units) × 4. "
                "Measures liquidity. >6% = High Turnover, 2-4% = Healthy, <1% = Illiquid."
            )
        }
    )


def _map_market_momentum_result(row, filters: Dict[str, Any]) -> KPIResult:
    """Map multi-CTE row to market_momentum KPIResult."""
    default_score = 50

    if not row:
        return KPIResult(
            kpi_id="market_momentum",
            title="Market Momentum",
            value=default_score,
            formatted_value=str(default_score),
            subtitle="volatility-adjusted",
            trend={"value": default_score, "direction": "neutral", "label": "Balanced"},
            insight="Insufficient data"
        )

    # Extract data
    current_psf = float(row.momentum_q0_psf) if row.momentum_q0_psf else None
    prev_psf = float(row.momentum_q1_psf) if row.momentum_q1_psf else None
    older_psf = float(row.momentum_q2_psf) if row.momentum_q2_psf else None
    current_count = int(row.momentum_q0_count or 0)
    prev_count = int(row.momentum_q1_count or 0)
    volatility = float(row.volatility) if row.volatility else None
    volatility_quarters = int(row.volatility_quarters or 0)

    if not current_psf or not prev_psf or prev_psf <= 0:
        return KPIResult(
            kpi_id="market_momentum",
            title="Market Momentum",
            value=default_score,
            formatted_value=str(default_score),
            subtitle="volatility-adjusted",
            trend={"value": default_score, "direction": "neutral", "label": "Balanced"},
            insight="Insufficient data"
        )

    # Compute momentum score
    psf_change = ((current_psf - prev_psf) / prev_psf) * 100

    if volatility and volatility > 0 and volatility_quarters >= 4:
        z_score = max(-3, min(psf_change / volatility, 3))
        score = 50 - (z_score * 10)
    else:
        score = 50 - (psf_change * 3)

    score = max(30, min(70, score))

    # Previous score for comparison
    prev_score = None
    score_change = None
    if older_psf and older_psf > 0:
        prev_psf_change = ((prev_psf - older_psf) / older_psf) * 100
        if volatility and volatility > 0 and volatility_quarters >= 4:
            prev_z = max(-3, min(prev_psf_change / volatility, 3))
            prev_score = max(30, min(70, 50 - (prev_z * 10)))
        else:
            prev_score = max(30, min(70, 50 - (prev_psf_change * 3)))
        if prev_score:
            score_change = ((score - prev_score) / prev_score) * 100

    # Determine label
    if score > 55:
        label, direction = "Buyer advantage", "up"
    elif score < 45:
        label, direction = "Seller advantage", "down"
    else:
        label, direction = "Balanced", "neutral"

    formatted_value = f"{round(score)}"
    if score_change is not None:
        change_str = f"+{round(score_change, 1)}%" if score_change >= 0 else f"{round(score_change, 1)}%"
        formatted_value = f"{round(score)} ({change_str} Q-o-Q)"

    return KPIResult(
        kpi_id="market_momentum",
        title="Market Momentum",
        value=round(score),
        formatted_value=formatted_value,
        subtitle="volatility-adjusted",
        trend={"value": round(score), "direction": direction, "label": label},
        insight="Score = clamp(50 - z × 10, 30, 70)\nz = Q-o-Q PSF Growth % / Q-o-Q StdDev",
        meta={
            "current_score": round(score),
            "prev_score": round(prev_score) if prev_score else None,
            "score_change_pct": round(score_change, 1) if score_change is not None else None,
            "change_direction": "up" if (score_change or 0) > 0 else "down" if (score_change or 0) < 0 else "neutral",
            "condition_direction": direction,
            "label": label,
            "volatility": round(volatility, 2) if volatility else None,
            "volatility_quarters": volatility_quarters,
            "current_count": current_count,
            "prev_count": prev_count,
            "confidence": "high" if min(current_count, prev_count) >= 20 else "medium" if min(current_count, prev_count) >= 10 else "low",
            "description": (
                "Volatility-adjusted momentum score (30-70). Score = 50 - (z × 10) where "
                "z = QoQ PSF change / historical StdDev. <45 = Seller advantage, >55 = Buyer advantage."
            )
        }
    )


def run_all_kpis(filters: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Run all enabled KPIs using a SINGLE multi-CTE query.

    PERFORMANCE: One DB roundtrip instead of 4 sequential queries.
    Matches the dashboard_service.py pattern for efficiency.

    Args:
        filters: {
            districts: str or list,
            segment: str,
            bedrooms: str or list,
            max_date: date (optional, defaults to today)
        }

    Returns:
        List of KPIResult dicts ready for JSON serialization (in stable order)
    """
    start_time = time.time()
    results = []
    errors = []

    try:
        # Build and execute multi-CTE query
        sql, params = _build_multi_cte_query(filters)
        row = db.session.execute(text(sql), params).fetchone()

        # Map results for each KPI
        kpi_mappers = [
            ('median_psf', _map_median_psf_result),
            ('total_transactions', _map_total_transactions_result),
            ('resale_velocity', _map_resale_velocity_result),
            ('market_momentum', _map_market_momentum_result),
        ]

        for kpi_id, mapper in kpi_mappers:
            try:
                kpi_result = mapper(row, filters)
                result_dict = asdict(kpi_result)
                results.append(result_dict)
            except Exception as e:
                logger.error(f"KPI {kpi_id} mapping failed: {e}", exc_info=True)
                results.append(asdict(KPIResult(
                    kpi_id=kpi_id,
                    title=kpi_id.replace('_', ' ').title(),
                    value=None,
                    formatted_value="—",
                    insight="Error computing metric",
                    meta={"error": str(e)}
                )))
                errors.append({'kpi_id': kpi_id, 'error': str(e)})

    except Exception as e:
        logger.error(f"Multi-CTE query failed: {e}", exc_info=True)
        # Fall back to sequential execution
        logger.info("Falling back to sequential KPI execution")
        for spec in ENABLED_KPIS:
            kpi_result = run_kpi(spec, filters)
            results.append(asdict(kpi_result))

    elapsed = time.time() - start_time
    logger.info(f"run_all_kpis completed in {elapsed*1000:.1f}ms (multi-CTE)")

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
