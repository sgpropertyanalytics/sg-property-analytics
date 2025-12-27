"""
KPI: Median PSF Trend - Q-o-Q comparison.

Shows % change in median transacted PSF over rolling 90-day periods.
Current: last 90 days vs Previous: 90 days before that.

Methodology:
- Median computed on pooled transactions (not "median of medians")
- Sample size gate: n < 20 → "Low confidence" warning
- Rolling quarters for always-fresh data (not calendar quarters)
"""

from typing import Dict, Any
from db.sql import OUTLIER_FILTER
from services.kpi.base import (
    KPISpec, KPIResult,
    build_comparison_bounds, build_filter_clause
)

# Minimum sample size for reliable median
MIN_SAMPLE_SIZE = 20


def build_params(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Build params for median PSF query with 90-day rolling windows."""
    # Get date bounds - 90 days for Q-o-Q comparison
    params = build_comparison_bounds(
        max_date=filters.get('max_date'),
        period_days=90  # Rolling quarter
    )

    # Add filter params
    filter_parts, filter_params = build_filter_clause(filters)
    params.update(filter_params)
    params['_filter_parts'] = filter_parts  # Store for SQL building

    return params


def get_sql(params: Dict[str, Any]) -> str:
    """Build SQL with dynamic filter clause."""
    filter_parts = params.pop('_filter_parts', [])
    base_filter = OUTLIER_FILTER
    if filter_parts:
        base_filter += " AND " + " AND ".join(filter_parts)

    return f"""
        WITH current_period AS (
            SELECT
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions
            WHERE {base_filter}
              AND transaction_date >= :min_date
              AND transaction_date < :max_date_exclusive
        ),
        previous_period AS (
            SELECT
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions
            WHERE {base_filter}
              AND transaction_date >= :prev_min_date
              AND transaction_date < :prev_max_date_exclusive
        )
        SELECT
            c.median_psf as current_psf,
            c.txn_count as current_count,
            p.median_psf as prev_psf,
            p.txn_count as prev_count
        FROM current_period c
        CROSS JOIN previous_period p
    """


def map_result(row: Any, filters: Dict[str, Any]) -> KPIResult:
    """Map query result to KPIResult with sample size gating."""
    if not row or not row.current_psf:
        return KPIResult(
            kpi_id="median_psf",
            title="Median PSF Trend",
            value=0,
            formatted_value="—",
            subtitle="Q-o-Q",
            insight="Insufficient data"
        )

    current = float(row.current_psf)
    prev = float(row.prev_psf) if row.prev_psf else None
    current_count = int(row.current_count or 0)
    prev_count = int(row.prev_count or 0)

    # Sample size gate - check if we have enough data for reliable median
    low_confidence = current_count < MIN_SAMPLE_SIZE or prev_count < MIN_SAMPLE_SIZE
    confidence_label = "Low confidence" if low_confidence else None

    # Calculate trend
    trend = None
    pct_change = None
    if prev and prev_count > 0:
        pct_change = ((current - prev) / prev) * 100
        trend = {
            "value": round(pct_change, 1),
            "direction": "up" if pct_change > 0.5 else "down" if pct_change < -0.5 else "neutral",
            "label": "vs prev 90d"
        }

    # Format the primary value as trend % (the main story)
    if pct_change is not None:
        if pct_change >= 0:
            formatted_value = f"+{round(pct_change, 1)}%"
        else:
            formatted_value = f"{round(pct_change, 1)}%"
    else:
        formatted_value = "—"

    # Build insight - show the underlying PSF values
    if prev and prev_count > 0:
        insight = f"${round(prev):,} → ${round(current):,}"
    else:
        insight = f"Now ${round(current):,}"

    # Add confidence warning to insight if low sample
    if confidence_label:
        insight = f"{insight} ({confidence_label})"

    return KPIResult(
        kpi_id="median_psf",
        title="Median PSF Trend",
        value=round(pct_change, 1) if pct_change is not None else None,
        formatted_value=formatted_value,
        subtitle="Q-o-Q (90d rolling)",
        trend=trend,
        insight=insight,
        meta={
            "current_count": current_count,
            "prev_count": prev_count,
            "current_psf": round(current),
            "prev_psf": round(prev) if prev else None,
            "low_confidence": low_confidence
        }
    )


# Export the spec
# Note: SQL is built dynamically, so we wrap it
class MedianPsfSpec:
    kpi_id = "median_psf"
    title = "Median PSF Trend"
    subtitle = "Q-o-Q (90d rolling)"

    @staticmethod
    def build_params(filters):
        return build_params(filters)

    @staticmethod
    def get_sql(params):
        return get_sql(params)

    @staticmethod
    def map_result(row, filters):
        return map_result(row, filters)


SPEC = MedianPsfSpec()
