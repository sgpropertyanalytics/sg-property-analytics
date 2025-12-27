"""
KPI: Median PSF Growth (Resale Only)

Shows % change in median resale PSF over rolling 3-month periods.
Current: last 3 months vs Previous: 3 months before that.

Methodology:
- RESALE TRANSACTIONS ONLY (excludes new sale/developer sales)
- Median computed on pooled transactions (not "median of medians")
- Sample size gate: n < 20 → "Low confidence" warning
- Month boundaries (not day-level) because URA data is month-granularity

Formula:
  PSF Growth (%) = (Current Median - Previous Median) / Previous Median × 100
"""

from typing import Dict, Any
from db.sql import OUTLIER_FILTER
from constants import SALE_TYPE_RESALE
from services.kpi.base import (
    KPISpec, KPIResult,
    build_monthly_comparison_bounds, build_filter_clause
)

# Minimum sample size for reliable median
MIN_SAMPLE_SIZE = 20


def build_params(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Build params for median PSF query with 3-month rolling windows."""
    # Get date bounds - 3 months for Q-o-Q comparison
    # CRITICAL: Use month boundaries because URA data is month-level
    params = build_monthly_comparison_bounds(
        max_date=filters.get('max_date'),
        period_months=3  # Rolling quarter (3 months)
    )

    # Add filter params
    filter_parts, filter_params = build_filter_clause(filters)
    params.update(filter_params)
    params['_filter_parts'] = filter_parts  # Store for SQL building

    return params


def get_sql(params: Dict[str, Any]) -> str:
    """Build SQL with resale-only filter."""
    filter_parts = params.pop('_filter_parts', [])
    base_filter = OUTLIER_FILTER
    if filter_parts:
        base_filter += " AND " + " AND ".join(filter_parts)

    # CRITICAL: Resale only - exclude new sale/developer sales
    resale_filter = f"sale_type = '{SALE_TYPE_RESALE}'"

    return f"""
        WITH current_period AS (
            SELECT
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :min_date
              AND transaction_date < :max_date_exclusive
        ),
        previous_period AS (
            SELECT
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions
            WHERE {base_filter}
              AND {resale_filter}
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
            title="Resale Median PSF",
            value=0,
            formatted_value="—",
            subtitle="Q-o-Q (resale only)",
            insight="Insufficient data"
        )

    current = float(row.current_psf)
    prev = float(row.prev_psf) if row.prev_psf else None
    current_count = int(row.current_count or 0)
    prev_count = int(row.prev_count or 0)

    # Sample size gate - check if we have enough data for reliable median
    low_confidence = current_count < MIN_SAMPLE_SIZE or prev_count < MIN_SAMPLE_SIZE
    confidence_label = "Low confidence" if low_confidence else None

    # Calculate growth %
    # Formula: (Current - Previous) / Previous × 100
    pct_change = None
    direction = "neutral"
    if prev and prev > 0 and prev_count > 0:
        pct_change = ((current - prev) / prev) * 100
        direction = "up" if pct_change > 0.5 else "down" if pct_change < -0.5 else "neutral"

    # Format the primary value as PSF (frontend will add structured content)
    formatted_value = f"${round(current):,}"

    # Build insight - only show if low confidence
    insight = None
    if confidence_label:
        insight = f"[{confidence_label}]"

    return KPIResult(
        kpi_id="median_psf",
        title="Resale Median PSF",
        value=round(current),
        formatted_value=formatted_value,
        subtitle="Q-o-Q (resale only)",
        trend={
            "value": round(pct_change, 1) if pct_change is not None else 0,
            "direction": direction,
            "label": "QoQ"
        } if pct_change is not None else None,
        insight=insight,
        meta={
            "current_count": current_count,
            "prev_count": prev_count,
            "current_psf": round(current),
            "prev_psf": round(prev) if prev else None,
            "pct_change": round(pct_change, 1) if pct_change is not None else None,
            "direction": direction,
            "low_confidence": low_confidence,
            "sale_type": "resale",
            "description": (
                "Compares the resale median PSF from the latest 3 full months "
                "against the previous 3 months (QoQ), using resale transactions only. "
                "Prices are calculated from pooled transactions (not median-of-medians), "
                "with outliers excluded. A minimum sample size is enforced, and results "
                "with fewer than 20 transactions are flagged as low confidence."
            )
        }
    )


# Export the spec
# Note: SQL is built dynamically, so we wrap it
class MedianPsfSpec:
    kpi_id = "median_psf"
    title = "Resale Median PSF"
    subtitle = "Q-o-Q (resale only)"

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
