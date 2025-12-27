"""
KPI: Resale Transaction Velocity

Measures market liquidity as resale transactions per total completed stock.
Rolling 3-month window with Q-o-Q comparison.

Calculation:
    velocity_pct = (resale_transactions_3mo / total_completed_units) × 100

Interpretation (annualized = velocity × 4):
    >= 4%: Hot (fast-moving market)
    2-4%: Healthy
    1-2%: Slow
    < 1%: Illiquid
"""

from typing import Dict, Any, Tuple
from datetime import date
from db.sql import OUTLIER_FILTER
from constants import SALE_TYPE_RESALE
from services.kpi.base import (
    KPIResult, build_filter_clause
)


# Configuration
MIN_UNITS_THRESHOLD = 100  # Exclude boutique projects


def build_params(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Build params for velocity query using MONTH boundaries."""
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
    """Build SQL for resale transaction counts using month boundaries."""
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
            c.txn_count as current_txns,
            p.txn_count as prior_txns
        FROM current_period c
        CROSS JOIN previous_period p
    """


def get_total_units_for_scope(filters: Dict[str, Any]) -> Tuple[int, int]:
    """
    Get aggregated total_units for projects matching filter scope.

    Uses CSV data (high confidence) for unit counts.
    Excludes boutique projects (<100 units).

    Returns:
        (total_units, projects_counted)
    """
    from services.new_launch_units import _load_data
    from models.database import db
    from sqlalchemy import text

    # Build filter clause for district/segment/bedroom filtering
    filter_parts, filter_params = build_filter_clause(filters)
    base_filter = OUTLIER_FILTER
    if filter_parts:
        base_filter += " AND " + " AND ".join(filter_parts)

    # Get distinct projects with resale transactions in scope
    projects_result = db.session.execute(text(f"""
        SELECT DISTINCT UPPER(project_name) as project_name
        FROM transactions
        WHERE {base_filter}
          AND sale_type = 'Resale'
    """), filter_params).fetchall()

    project_names = [r[0] for r in projects_result]

    # Load CSV data for high-confidence unit counts
    csv_data = _load_data()

    total_units = 0
    projects_counted = 0

    for name in project_names:
        if name in csv_data:
            units = csv_data[name].get('total_units')
            if units and units >= MIN_UNITS_THRESHOLD:
                total_units += units
                projects_counted += 1

    return total_units, projects_counted


def map_result(row: Any, filters: Dict[str, Any]) -> KPIResult:
    """Map query result + unit data to KPIResult."""
    # Get total units for the scope
    total_units, projects_counted = get_total_units_for_scope(filters)

    if not row or total_units == 0:
        return KPIResult(
            kpi_id="resale_velocity",
            title="Resale Velocity",
            value=0,
            formatted_value="—",
            subtitle="3-month turnover",
            insight="Insufficient data"
        )

    current_txns = int(row.current_txns or 0)
    prior_txns = int(row.prior_txns or 0)

    # Calculate velocities (as percentage)
    current_velocity = (current_txns / total_units) * 100
    prior_velocity = (prior_txns / total_units) * 100 if prior_txns > 0 else 0

    # Determine confidence based on transaction count
    if current_txns >= 20:
        confidence = "high"
    elif current_txns >= 10:
        confidence = "medium"
    else:
        confidence = "low"

    # Interpretation thresholds (annualized equivalents)
    # 3-month velocity → annualized = velocity × 4
    annualized = current_velocity * 4
    if annualized >= 4:
        label = "Hot"
        direction = "up"
    elif annualized >= 2:
        label = "Healthy"
        direction = "neutral"
    elif annualized >= 1:
        label = "Slow"
        direction = "neutral"
    else:
        label = "Illiquid"
        direction = "down"

    # Calculate Q-o-Q change for trend
    if prior_velocity > 0:
        pct_change = ((current_velocity - prior_velocity) / prior_velocity) * 100
    else:
        pct_change = 0

    # Footer: show the calculation
    insight = (
        f"{current_txns:,} txns ÷ {total_units:,} units × 4\n"
        f"= {annualized:.1f}% annualized"
    )

    return KPIResult(
        kpi_id="resale_velocity",
        title="Resale Velocity",
        value=round(annualized, 2),
        formatted_value=f"{annualized:.1f}%",
        subtitle="annualized turnover",
        trend={
            "value": round(pct_change, 1),
            "direction": direction,
            "label": label
        },
        insight=insight,
        meta={
            "current_txns": current_txns,
            "prior_txns": prior_txns,
            "total_units": total_units,
            "projects_counted": projects_counted,
            "annualized_velocity": round(annualized, 2),
            "quarterly_velocity": round(current_velocity, 2),
            "confidence": confidence,
            "pct_change": round(pct_change, 1),
            "description": (
                "Measures how fast resale homes are changing hands.\n\n"
                "Interpretation (annualized)\n"
                "• ≥4%: Hot – fast-moving market\n"
                "• 2–4%: Healthy – balanced liquidity\n"
                "• 1–2%: Slow – limited activity\n"
                "• <1%: Illiquid – hard to exit\n\n"
                "Based on 3-month resale transactions divided by total "
                "completed units. Excludes new sales and boutique projects (<100 units)."
            )
        }
    )


class ResaleVelocitySpec:
    """KPI Spec for Resale Velocity."""
    kpi_id = "resale_velocity"
    title = "Resale Velocity"
    subtitle = "annualized turnover"

    @staticmethod
    def build_params(filters):
        return build_params(filters)

    @staticmethod
    def get_sql(params):
        return get_sql(params)

    @staticmethod
    def map_result(row, filters):
        return map_result(row, filters)


SPEC = ResaleVelocitySpec()
