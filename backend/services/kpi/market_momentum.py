"""
KPI: Market Momentum (Resale-Based)

A derived signal representing buyer vs seller leverage in the market.
This is NOT a valuation metric - it indicates momentum direction only.

Methodology:
- Based ONLY on resale median PSF growth (excludes new sale/developer sales)
- Uses rolling 90-day windows for Q-o-Q comparison
- Formula: Score = 50 - (PSF_Growth × 3)
- Clamped to 30-70

Interpretation:
- Score > 55: Buyer advantage (prices falling → buyers have leverage)
- Score 45-55: Balanced market
- Score < 45: Seller advantage (prices rising → sellers have leverage)

This does NOT mean cheap or expensive - only momentum.
"""

from typing import Dict, Any
from db.sql import OUTLIER_FILTER
from constants import SALE_TYPE_RESALE
from services.kpi.base import (
    KPIResult, build_comparison_bounds, build_filter_clause
)

# Momentum formula multiplier (balanced, non-aggressive)
MOMENTUM_MULTIPLIER = 3

# Minimum sample size for reliable calculation
MIN_SAMPLE_SIZE = 20


def build_params(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Build params for market momentum query with 90-day windows."""
    # 90-day comparison bounds (same as PSF growth)
    params = build_comparison_bounds(
        max_date=filters.get('max_date'),
        period_days=90  # Rolling quarter
    )

    filter_parts, filter_params = build_filter_clause(filters)
    params.update(filter_params)
    params['_filter_parts'] = filter_parts

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
    """
    Map query result to KPIResult.

    Formula: Score = 50 - (PSF_Growth × 3)
    - Rising prices → negative adjustment → lower score → seller advantage
    - Falling prices → positive adjustment → higher score → buyer advantage
    """
    default_score = 50  # Neutral/balanced

    if not row or not row.current_psf:
        return KPIResult(
            kpi_id="market_momentum",
            title="Market Momentum",
            value=default_score,
            formatted_value=str(default_score),
            subtitle="resale-based",
            trend={"value": default_score, "direction": "neutral", "label": "Balanced"},
            insight="Insufficient data"
        )

    current = float(row.current_psf)
    prev = float(row.prev_psf) if row.prev_psf else None
    current_count = int(row.current_count or 0)
    prev_count = int(row.prev_count or 0)

    # Check sample size
    low_confidence = current_count < MIN_SAMPLE_SIZE or prev_count < MIN_SAMPLE_SIZE

    # Calculate PSF growth and momentum score
    psf_growth = None
    score = default_score

    if prev and prev > 0 and prev_count > 0:
        # PSF Growth = (Current - Previous) / Previous × 100
        psf_growth = ((current - prev) / prev) * 100

        # Momentum Score = 50 - (PSF_Growth × multiplier)
        # Rising prices (positive growth) → lower score → seller advantage
        # Falling prices (negative growth) → higher score → buyer advantage
        score = 50 - (psf_growth * MOMENTUM_MULTIPLIER)
        score = max(30, min(70, score))  # Clamp to 30-70

    # Determine market condition based on score thresholds
    if score > 55:
        label = "Buyer advantage"
        direction = "up"
    elif score < 45:
        label = "Seller advantage"
        direction = "down"
    else:
        label = "Balanced"
        direction = "neutral"

    # Build insight text
    if psf_growth is not None:
        insight = f"Resale PSF {psf_growth:+.1f}% Q-o-Q"
        if low_confidence:
            insight += " (low confidence)"
    else:
        insight = "No trend data"

    return KPIResult(
        kpi_id="market_momentum",
        title="Market Momentum",
        value=round(score),
        formatted_value=str(round(score)),
        subtitle="resale-based",
        trend={
            "value": round(score),
            "direction": direction,
            "label": label
        },
        insight=insight,
        meta={
            "psf_growth_pct": round(psf_growth, 1) if psf_growth is not None else None,
            "current_count": current_count,
            "prev_count": prev_count,
            "low_confidence": low_confidence,
            "sale_type": "resale"
        }
    )


class MarketMomentumSpec:
    kpi_id = "market_momentum"
    title = "Market Momentum"
    subtitle = "resale-based"

    @staticmethod
    def build_params(filters):
        return build_params(filters)

    @staticmethod
    def get_sql(params):
        return get_sql(params)

    @staticmethod
    def map_result(row, filters):
        return map_result(row, filters)


SPEC = MarketMomentumSpec()
