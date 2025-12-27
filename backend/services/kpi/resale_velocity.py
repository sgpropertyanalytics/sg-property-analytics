"""
KPI: Resale Transaction Velocity

Measures market liquidity as resale transactions per total completed stock.
Rolling 90-day window with period-over-period comparison.

Calculation:
    velocity_pct = (resale_transactions_90d / total_completed_units) × 100

Interpretation (annualized = velocity × 4):
    >= 4%: Hot (fast-moving market)
    2-4%: Healthy
    1-2%: Slow
    < 1%: Illiquid
"""

from typing import Dict, Any, Tuple
from db.sql import OUTLIER_FILTER
from services.kpi.base import (
    KPIResult, build_comparison_bounds, build_filter_clause
)


# Configuration
LOOKBACK_DAYS = 90
MIN_UNITS_THRESHOLD = 100  # Exclude boutique projects


def build_params(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Build params for velocity query."""
    params = build_comparison_bounds(
        max_date=filters.get('max_date'),
        period_days=LOOKBACK_DAYS
    )

    filter_parts, filter_params = build_filter_clause(filters)
    params.update(filter_params)
    params['_filter_parts'] = filter_parts

    return params


def get_sql(params: Dict[str, Any]) -> str:
    """
    Build SQL for resale transaction counts.

    Returns current and prior period resale counts.
    Total units are aggregated separately in Python using CSV data.
    """
    filter_parts = params.pop('_filter_parts', [])
    base_filter = OUTLIER_FILTER
    if filter_parts:
        base_filter += " AND " + " AND ".join(filter_parts)

    return f"""
        SELECT
            COUNT(*) FILTER (
                WHERE transaction_date >= :min_date
                  AND transaction_date < :max_date_exclusive
            ) as current_txns,
            COUNT(*) FILTER (
                WHERE transaction_date >= :prev_min_date
                  AND transaction_date < :prev_max_date_exclusive
            ) as prior_txns
        FROM transactions
        WHERE {base_filter}
          AND sale_type = 'Resale'
          AND transaction_date >= :prev_min_date
          AND transaction_date < :max_date_exclusive
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


def map_result(row: Any, filters: Dict[str, Any],
               total_units: int, projects_counted: int) -> KPIResult:
    """Map query result + unit data to KPIResult."""

    if not row or total_units == 0:
        return KPIResult(
            kpi_id="resale_velocity",
            title="Resale Velocity",
            value=0,
            formatted_value="—",
            subtitle="90D turnover rate",
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
    # 90D velocity → annualized = velocity × 4
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

    # Calculate period-over-period change for trend
    if prior_velocity > 0:
        pct_change = ((current_velocity - prior_velocity) / prior_velocity) * 100
    else:
        pct_change = 0

    return KPIResult(
        kpi_id="resale_velocity",
        title="Resale Velocity",
        value=round(current_velocity, 2),
        formatted_value=f"{current_velocity:.1f}%",
        subtitle="90D turnover rate",
        trend={
            "value": round(pct_change, 1),
            "direction": direction,
            "label": label
        },
        insight=f"{current_txns:,} txns · {total_units:,} units",
        meta={
            "current_txns": current_txns,
            "prior_txns": prior_txns,
            "total_units": total_units,
            "projects_counted": projects_counted,
            "annualized_velocity": round(annualized, 2),
            "confidence": confidence,
            "window": "90D"
        }
    )


class ResaleVelocitySpec:
    """
    KPI Spec for Resale Velocity.

    This KPI is special: it uses a custom runner because it needs
    both SQL data (transaction counts) and Python aggregation (total units).
    """
    kpi_id = "resale_velocity"
    title = "Resale Velocity"
    subtitle = "90D turnover rate"

    @staticmethod
    def build_params(filters):
        return build_params(filters)

    @staticmethod
    def get_sql(params):
        return get_sql(params)

    @staticmethod
    def map_result(row, filters):
        # This will be called with extra args by custom runner
        # For standard registry, get units here
        total_units, projects_counted = get_total_units_for_scope(filters)
        return map_result(row, filters, total_units, projects_counted)


SPEC = ResaleVelocitySpec()
