"""
KPI: Market Momentum

Score based on PSF trend - higher score = buyer's market (falling prices).
"""

from typing import Dict, Any
from db.sql import OUTLIER_FILTER
from services.kpi.base import (
    KPIResult, build_comparison_bounds, build_filter_clause
)


def build_params(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Build params for market momentum query."""
    params = build_comparison_bounds(
        max_date=filters.get('max_date'),
        period_days=30
    )

    filter_parts, filter_params = build_filter_clause(filters)
    params.update(filter_params)
    params['_filter_parts'] = filter_parts

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
    """Map query result to KPIResult."""
    default_score = 50  # Neutral

    if not row or not row.current_psf:
        return KPIResult(
            kpi_id="market_momentum",
            title="Market Momentum",
            value=default_score,
            formatted_value=str(default_score),
            subtitle="buyer/seller index",
            trend={"value": default_score, "direction": "neutral", "label": "Balanced"},
            insight="Insufficient data"
        )

    current = float(row.current_psf)
    prev = float(row.prev_psf) if row.prev_psf else None
    prev_count = int(row.prev_count or 0)

    # Calculate momentum score
    # Score = 50 - (PSF trend * 5)
    # Rising prices → lower score (seller's market)
    # Falling prices → higher score (buyer's market)
    if prev and prev_count > 0:
        psf_trend = ((current - prev) / prev) * 100
        score = 50 - (psf_trend * 5)
        score = max(20, min(80, score))  # Clamp to 20-80
        insight = f"Trend {psf_trend:+.1f}% MoM"
    else:
        score = default_score
        psf_trend = None
        insight = "No trend data"

    # Determine market type
    if score >= 55:
        label = "Buyer's market"
        direction = "up"
    elif score <= 45:
        label = "Seller's market"
        direction = "down"
    else:
        label = "Balanced"
        direction = "neutral"

    return KPIResult(
        kpi_id="market_momentum",
        title="Market Momentum",
        value=round(score),
        formatted_value=str(round(score)),
        subtitle="buyer/seller index",
        trend={
            "value": round(score),
            "direction": direction,
            "label": label
        },
        insight=insight,
        meta={
            "psf_trend": round(psf_trend, 1) if psf_trend is not None else None
        }
    )


class MarketMomentumSpec:
    kpi_id = "market_momentum"
    title = "Market Momentum"
    subtitle = "buyer/seller index"

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
