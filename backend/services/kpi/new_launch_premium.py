"""
KPI: New Launch Premium

Shows price premium of new launches vs recently TOP resales (4-8 years).
Uses canonical PropertyAgeBucket.RECENTLY_TOP age range.
"""

from typing import Dict, Any
from db.sql import OUTLIER_FILTER
from constants import SALE_TYPE_NEW, SALE_TYPE_RESALE
from schemas.api_contract import PropertyAgeBucket
from services.kpi.base import (
    KPIResult, build_date_bounds, build_filter_clause
)


def build_params(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Build params for new launch premium query."""
    params = build_date_bounds(
        max_date=filters.get('max_date'),
        lookback_days=365  # 12 months for premium calculation
    )

    filter_parts, filter_params = build_filter_clause(filters)
    params.update(filter_params)
    params['_filter_parts'] = filter_parts
    params['sale_type_new'] = SALE_TYPE_NEW
    params['sale_type_resale'] = SALE_TYPE_RESALE

    return params


def get_sql(params: Dict[str, Any]) -> str:
    """Build SQL with dynamic filter clause."""
    filter_parts = params.pop('_filter_parts', [])
    base_filter = OUTLIER_FILTER
    if filter_parts:
        base_filter += " AND " + " AND ".join(filter_parts)

    # Get canonical age range for Recently TOP bucket
    age_min, age_max = PropertyAgeBucket.get_age_range(PropertyAgeBucket.RECENTLY_TOP)

    return f"""
        WITH new_sales AS (
            SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
            FROM transactions
            WHERE {base_filter}
              AND sale_type = :sale_type_new
              AND transaction_date >= :min_date
              AND transaction_date < :max_date_exclusive
        ),
        young_resales AS (
            SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
            FROM transactions
            WHERE {base_filter}
              AND sale_type = :sale_type_resale
              AND transaction_date >= :min_date
              AND transaction_date < :max_date_exclusive
              AND EXTRACT(YEAR FROM transaction_date) - COALESCE(lease_start_year, EXTRACT(YEAR FROM transaction_date) - 5) >= {age_min}
              AND EXTRACT(YEAR FROM transaction_date) - COALESCE(lease_start_year, EXTRACT(YEAR FROM transaction_date) - 5) < {age_max}
        )
        SELECT
            n.median_psf as new_psf,
            r.median_psf as resale_psf
        FROM new_sales n
        CROSS JOIN young_resales r
    """


def map_result(row: Any, filters: Dict[str, Any]) -> KPIResult:
    """Map query result to KPIResult."""
    if not row or not row.new_psf or not row.resale_psf:
        return KPIResult(
            kpi_id="new_launch_premium",
            title="New Launch Premium",
            value=0,
            formatted_value="—",
            subtitle="vs 4-8yr resale",
            insight="Insufficient data"
        )

    new_psf = float(row.new_psf)
    resale_psf = float(row.resale_psf)

    # Premium as percentage
    premium_pct = ((new_psf - resale_psf) / resale_psf * 100) if resale_psf > 0 else 0

    # Trend interpretation
    if premium_pct > 20:
        trend_label = "widening"
        direction = "up"
    elif premium_pct < 10:
        trend_label = "narrowing"
        direction = "down"
    else:
        trend_label = "stable"
        direction = "neutral"

    return KPIResult(
        kpi_id="new_launch_premium",
        title="New Launch Premium",
        value=round(premium_pct, 1),
        formatted_value=f"{round(premium_pct, 1)}%",
        subtitle="vs 4-9yr resale",
        trend={
            "value": round(premium_pct, 1),
            "direction": direction,
            "label": trend_label
        },
        insight=f"New ${round(new_psf):,} vs Resale ${round(resale_psf):,}",
        meta={
            "new_psf": round(new_psf),
            "resale_psf": round(resale_psf)
        }
    )


class NewLaunchPremiumSpec:
    kpi_id = "new_launch_premium"
    title = "New Launch Premium"
    subtitle = "vs 4-9yr resale"

    @staticmethod
    def build_params(filters):
        return build_params(filters)

    @staticmethod
    def get_sql(params):
        return get_sql(params)

    @staticmethod
    def map_result(row, filters):
        return map_result(row, filters)


SPEC = NewLaunchPremiumSpec()
