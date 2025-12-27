"""
KPI: Total Transactions

Shows resale transaction volume (rolling 90 days) with QoQ comparison.

Signal interpretation:
- High + Rising: Strong demand
- High + Falling: Market cooling
- Low + Rising: Recovery phase
- Low + Falling: Weak / frozen market
"""

from typing import Dict, Any
from db.sql import OUTLIER_FILTER
from constants import SALE_TYPE_RESALE
from services.kpi.base import (
    KPIResult, build_filter_clause
)
from datetime import date, timedelta


def build_params(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Build params for total transactions query."""
    max_date = filters.get('max_date') or date.today()

    # Rolling 90-day windows (not calendar quarters)
    # Current period: last 90 days
    # Previous period: 90-180 days ago (for QoQ comparison)
    max_exclusive = max_date + timedelta(days=1)
    current_min = max_date - timedelta(days=90)
    prev_min = current_min - timedelta(days=90)

    params = {
        'current_min_date': current_min,
        'max_date_exclusive': max_exclusive,
        'prev_min_date': prev_min,
        'prev_max_date_exclusive': current_min,  # Previous ends where current starts
        'sale_type_resale': SALE_TYPE_RESALE,
    }

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
            SELECT COUNT(*) as txn_count
            FROM transactions
            WHERE {base_filter}
              AND sale_type = :sale_type_resale
              AND transaction_date >= :current_min_date
              AND transaction_date < :max_date_exclusive
        ),
        previous_period AS (
            SELECT COUNT(*) as txn_count
            FROM transactions
            WHERE {base_filter}
              AND sale_type = :sale_type_resale
              AND transaction_date >= :prev_min_date
              AND transaction_date < :prev_max_date_exclusive
        )
        SELECT
            c.txn_count as current_count,
            p.txn_count as previous_count
        FROM current_period c
        CROSS JOIN previous_period p
    """


def map_result(row: Any, filters: Dict[str, Any]) -> KPIResult:
    """Map query result to KPIResult."""
    if not row:
        return KPIResult(
            kpi_id="total_transactions",
            title="Total Transactions",
            value=0,
            formatted_value="—",
            subtitle="Rolling 90 days",
            insight="Insufficient data"
        )

    current_count = int(row.current_count or 0)
    previous_count = int(row.previous_count or 0)

    # Calculate % change
    if previous_count > 0:
        pct_change = ((current_count - previous_count) / previous_count) * 100
    else:
        pct_change = 0.0 if current_count == 0 else 100.0

    # Determine trend direction
    if pct_change > 2:
        direction = "up"
    elif pct_change < -2:
        direction = "down"
    else:
        direction = "neutral"

    # Format the change label
    if pct_change >= 0:
        change_label = f"+{round(pct_change)}% vs previous 90 days"
    else:
        change_label = f"{round(pct_change)}% vs previous 90 days"

    return KPIResult(
        kpi_id="total_transactions",
        title="Total Transactions",
        value=current_count,
        formatted_value=f"{current_count:,}",
        subtitle="Rolling 90 days",
        trend={
            "value": round(pct_change, 1),
            "direction": direction,
            "label": change_label
        },
        insight="Resale transactions only",
        meta={
            "current_count": current_count,
            "previous_count": previous_count,
            "pct_change": round(pct_change, 1),
            "description": (
                "Number of resale transactions in the last 90 days.\n"
                "The change vs the previous period indicates whether "
                "market activity is increasing or slowing."
            )
        }
    )


class TotalTransactionsSpec:
    kpi_id = "total_transactions"
    title = "Total Transactions"
    subtitle = "Rolling 90 days"

    @staticmethod
    def build_params(filters):
        return build_params(filters)

    @staticmethod
    def get_sql(params):
        return get_sql(params)

    @staticmethod
    def map_result(row, filters):
        return map_result(row, filters)


SPEC = TotalTransactionsSpec()
