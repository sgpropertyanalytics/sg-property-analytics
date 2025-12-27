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

    # Use MONTH boundaries because URA data is month-level (all txns dated 1st of month)
    #
    # RULE: Only use COMPLETE months. If today is in month M, latest complete = M-1.
    #
    # Example: if max_date is Dec 27, 2025:
    #   max_exclusive = Dec 1, 2025 (1st of current month - excludes incomplete Dec)
    #   current_min = Sep 1, 2025 (3 complete months: Sep, Oct, Nov)
    #   prev_min = Jun 1, 2025 (3 months: Jun, Jul, Aug)

    # max_exclusive is the first of CURRENT month (excludes incomplete current month)
    max_exclusive = date(max_date.year, max_date.month, 1)

    # Current period starts 3 months before max_exclusive
    if max_exclusive.month <= 3:
        current_min = date(max_exclusive.year - 1, max_exclusive.month + 9, 1)
    else:
        current_min = date(max_exclusive.year, max_exclusive.month - 3, 1)

    # Previous period starts 3 months before current_min
    if current_min.month <= 3:
        prev_min = date(current_min.year - 1, current_min.month + 9, 1)
    else:
        prev_min = date(current_min.year, current_min.month - 3, 1)

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
            title="Total Resale Transactions",
            value=0,
            formatted_value="—",
            subtitle="Last 3 months",
            insight="Insufficient data"
        )

    current_count = int(row.current_count or 0)
    previous_count = int(row.previous_count or 0)

    # Calculate % change
    if previous_count > 0:
        pct_change = ((current_count - previous_count) / previous_count) * 100
    else:
        pct_change = 0.0 if current_count == 0 else 100.0

    # Determine trend direction and label based on interpretation thresholds
    if pct_change > 10:
        direction = "up"
        label = "Strong Growth"
    elif pct_change > 5:
        direction = "up"
        label = "Growing"
    elif pct_change > 2:
        direction = "up"
        label = "Mild Uptick"
    elif pct_change >= -2:
        direction = "neutral"
        label = "Neutral"
    elif pct_change >= -5:
        direction = "down"
        label = "Softening"
    elif pct_change >= -10:
        direction = "down"
        label = "Weak"
    else:
        direction = "down"
        label = "Sharp Decline"

    return KPIResult(
        kpi_id="total_transactions",
        title="Total Transactions",
        value=current_count,
        formatted_value=f"{current_count:,}",
        subtitle="Last 3 months",
        trend={
            "value": round(pct_change, 1),
            "direction": direction,
            "label": label
        },
        insight="Resale transactions only",
        meta={
            "current_count": current_count,
            "previous_count": previous_count,
            "pct_change": round(pct_change, 1),
            "direction": direction,
            "label": label,
            "description": (
                "Resale Volume (QoQ) measures the change in resale transaction volume "
                "over the latest 3 full months versus the previous 3 months. "
                "Only resale transactions are included, with outliers excluded.\n\n"
                "Trend Interpretation\n"
                "• > +10%: Strong Growth\n"
                "• +5% to +10%: Growing\n"
                "• +2% to +5%: Mild Uptick\n"
                "• –2% to +2%: Neutral\n"
                "• –5% to –2%: Softening\n"
                "• –10% to –5%: Weak\n"
                "• < –10%: Sharp Decline"
            )
        }
    )


class TotalTransactionsSpec:
    kpi_id = "total_transactions"
    title = "Total Resale Transactions"
    subtitle = "Last 3 months"

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
