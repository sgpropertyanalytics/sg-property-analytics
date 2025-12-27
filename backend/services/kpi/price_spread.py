"""
KPI: Price Spread (IQR)

Shows P25-P75 range as a volatility indicator.
"""

from typing import Dict, Any
from db.sql import OUTLIER_FILTER
from services.kpi.base import (
    KPIResult, build_date_bounds, build_filter_clause
)


def build_params(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Build params for price spread query."""
    params = build_date_bounds(
        max_date=filters.get('max_date'),
        lookback_days=30
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
        SELECT
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY psf) as p25,
            PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY psf) as p50,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY psf) as p75,
            COUNT(*) as txn_count
        FROM transactions
        WHERE {base_filter}
          AND transaction_date >= :min_date
          AND transaction_date < :max_date_exclusive
    """


def map_result(row: Any, filters: Dict[str, Any]) -> KPIResult:
    """Map query result to KPIResult."""
    if not row or not row.p50:
        return KPIResult(
            kpi_id="price_spread",
            title="Price Spread",
            value=0,
            formatted_value="—",
            subtitle="IQR volatility",
            insight="Insufficient data"
        )

    p25 = float(row.p25)
    p50 = float(row.p50)
    p75 = float(row.p75)
    iqr = p75 - p25

    # IQR ratio as % of median
    iqr_ratio = (iqr / p50 * 100) if p50 > 0 else 0
    iqr_ratio = min(iqr_ratio, 100)  # Cap at 100%

    # Volatility label
    if iqr_ratio < 20:
        label = "Very Stable"
        direction = "down"  # Low volatility = good
    elif iqr_ratio < 30:
        label = "Stable"
        direction = "neutral"
    elif iqr_ratio < 40:
        label = "Moderate"
        direction = "neutral"
    else:
        label = "Volatile"
        direction = "up"  # High volatility = caution

    return KPIResult(
        kpi_id="price_spread",
        title="Price Spread",
        value=round(iqr),
        formatted_value=f"${round(iqr):,}",
        subtitle="IQR volatility",
        trend={
            "value": round(iqr_ratio, 1),
            "direction": direction,
            "label": label
        },
        insight=f"P25 ${round(p25):,} · P75 ${round(p75):,}",
        meta={
            "p25": round(p25),
            "p50": round(p50),
            "p75": round(p75),
            "iqr_ratio": round(iqr_ratio, 1)
        }
    )


class PriceSpreadSpec:
    kpi_id = "price_spread"
    title = "Price Spread"
    subtitle = "IQR volatility"

    @staticmethod
    def build_params(filters):
        return build_params(filters)

    @staticmethod
    def get_sql(params):
        return get_sql(params)

    @staticmethod
    def map_result(row, filters):
        return map_result(row, filters)


SPEC = PriceSpreadSpec()
