"""
Insights Service - Core computation logic for insights endpoints.

Extracted from routes/insights.py to allow direct invocation for cache warming
without using Flask's test_client (which isn't thread-safe).

These functions take normalized params and return data dicts (no jsonify).
Routes handle: param normalization (@api_contract), caching, jsonify.
"""

import time
import statistics
from datetime import date as date_type
from typing import Dict, Any, Optional, List
from sqlalchemy import func, and_, case

from models.transaction import Transaction
from models.database import db
from constants import CCR_DISTRICTS, RCR_DISTRICTS, DISTRICT_NAMES, SALE_TYPE_NEW, SALE_TYPE_RESALE
from services.new_launch_units import get_district_units_for_resale


def _apply_bedroom_filter(conditions: list, bed_filter: str) -> None:
    """Add bedroom filter conditions to a list."""
    if bed_filter == "1":
        conditions.append(Transaction.bedroom_count == 1)
    elif bed_filter == "2":
        conditions.append(Transaction.bedroom_count == 2)
    elif bed_filter == "3":
        conditions.append(Transaction.bedroom_count == 3)
    elif bed_filter == "4":
        conditions.append(Transaction.bedroom_count == 4)
    elif bed_filter == "5":
        conditions.append(Transaction.bedroom_count >= 5)
    elif bed_filter in ["4+"]:
        conditions.append(Transaction.bedroom_count >= 4)


def _get_district_region(district_id: str) -> str:
    """Get region (CCR/RCR/OCR) for a district."""
    if district_id in CCR_DISTRICTS:
        return "CCR"
    elif district_id in RCR_DISTRICTS:
        return "RCR"
    return "OCR"


def _get_district_names(district_id: str) -> tuple:
    """Get (short_name, full_name) for a district."""
    full_name = DISTRICT_NAMES.get(district_id, district_id)
    short_name = full_name.split(" / ")[0] if " / " in full_name else full_name
    return short_name, full_name


# =============================================================================
# DISTRICT PSF COMPUTATION
# =============================================================================

def compute_district_psf(
    date_from: Optional[date_type],
    date_to_exclusive: Optional[date_type],
    bed_filter: str = "all",
    age_filter: str = "all",
    sale_type_filter: Optional[str] = None,
    timeframe: str = "Y1",
    months_in_period: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Compute district PSF metrics.

    Args:
        date_from: Start date (inclusive)
        date_to_exclusive: End date (exclusive)
        bed_filter: Bedroom filter ("all", "1", "2", "3", "4", "4+", "5")
        age_filter: Property age filter ("all", "new", "young", "resale")
        sale_type_filter: Sale type in DB format ("New Sale", "Resale", or None for all)
        timeframe: Timeframe code for response ("Y1", "Y3", etc.)
        months_in_period: Number of months in the period

    Returns:
        Dict with "districts" list and "meta" dict
    """
    from routes.insights import build_property_age_filter

    start = time.time()

    # Build base filter conditions
    filter_conditions = [Transaction.outlier_filter()]

    if date_from:
        filter_conditions.append(Transaction.transaction_date >= date_from)
    if date_to_exclusive:
        filter_conditions.append(Transaction.transaction_date < date_to_exclusive)

    # Apply bedroom filter
    if bed_filter != "all":
        _apply_bedroom_filter(filter_conditions, bed_filter)

    # Apply property age filter
    age_condition = build_property_age_filter(age_filter)
    if age_condition is not None:
        filter_conditions.append(age_condition)

    # Apply sale type filter
    if sale_type_filter:
        filter_conditions.append(Transaction.sale_type == sale_type_filter)

    # Query current period data
    current_query = db.session.query(
        Transaction.district,
        func.count(Transaction.id).label("tx_count"),
        func.percentile_cont(0.5).within_group(Transaction.psf).label("median_psf")
    ).filter(
        and_(*filter_conditions)
    ).group_by(
        Transaction.district
    )

    current_results = {row.district: row for row in current_query.all()}

    # Query YoY comparison data
    yoy_data = {}
    if date_from and date_to_exclusive:
        from dateutil.relativedelta import relativedelta
        yoy_from = date_from - relativedelta(years=1)
        yoy_to_exclusive = date_to_exclusive - relativedelta(years=1)

        yoy_conditions = [Transaction.outlier_filter()]
        yoy_conditions.append(Transaction.transaction_date >= yoy_from)
        yoy_conditions.append(Transaction.transaction_date < yoy_to_exclusive)

        if bed_filter != "all":
            _apply_bedroom_filter(yoy_conditions, bed_filter)
        if age_condition is not None:
            yoy_conditions.append(age_condition)
        if sale_type_filter:
            yoy_conditions.append(Transaction.sale_type == sale_type_filter)

        yoy_query = db.session.query(
            Transaction.district,
            func.percentile_cont(0.5).within_group(Transaction.psf).label("median_psf")
        ).filter(
            and_(*yoy_conditions)
        ).group_by(
            Transaction.district
        )

        yoy_data = {row.district: row.median_psf for row in yoy_query.all()}

    # Build response
    all_districts = [f"D{str(i).zfill(2)}" for i in range(1, 29)]
    districts_response = []
    districts_with_data = 0

    for district_id in all_districts:
        region = _get_district_region(district_id)
        short_name, full_name = _get_district_names(district_id)

        if district_id in current_results:
            row = current_results[district_id]
            median_psf = round(row.median_psf, 0) if row.median_psf else None
            tx_count = row.tx_count or 0

            yoy_pct = None
            if district_id in yoy_data and yoy_data[district_id] and median_psf:
                old_psf = yoy_data[district_id]
                yoy_pct = round(((median_psf - old_psf) / old_psf) * 100, 1)

            districts_response.append({
                "district_id": district_id,
                "name": short_name,
                "full_name": full_name,
                "region": region,
                "median_psf": median_psf,
                "tx_count": tx_count,
                "yoy_pct": yoy_pct,
                "has_data": True
            })
            districts_with_data += 1
        else:
            districts_response.append({
                "district_id": district_id,
                "name": short_name,
                "full_name": full_name,
                "region": region,
                "median_psf": None,
                "tx_count": 0,
                "yoy_pct": None,
                "has_data": False
            })

    elapsed = time.time() - start

    return {
        "districts": districts_response,
        "meta": {
            "timeframe": timeframe,
            "months_in_period": months_in_period,
            "bed_filter": bed_filter,
            "age_filter": age_filter,
            "date_range": {
                "from": date_from.isoformat() if date_from else None,
                "to_exclusive": date_to_exclusive.isoformat() if date_to_exclusive else None
            },
            "total_districts": 28,
            "districts_with_data": districts_with_data,
            "elapsed_ms": int(elapsed * 1000)
        }
    }


# =============================================================================
# DISTRICT LIQUIDITY COMPUTATION
# =============================================================================

def compute_district_liquidity(
    date_from: Optional[date_type],
    date_to_exclusive: Optional[date_type],
    bed_filter: str = "all",
    sale_type_filter: Optional[str] = None,
    timeframe: str = "Y1",
    months_in_period: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Compute district liquidity metrics.

    Args:
        date_from: Start date (inclusive)
        date_to_exclusive: End date (exclusive)
        bed_filter: Bedroom filter ("all", "1", "2", "3", "4", "5")
        sale_type_filter: Sale type in DB format ("New Sale", "Resale", or None for all)
        timeframe: Timeframe code for response
        months_in_period: Number of months in period (computed from data if None)

    Returns:
        Dict with "districts" list and "meta" dict
    """
    start = time.time()

    # Handle "all" timeframe - compute months from data
    if months_in_period is None:
        earliest = db.session.query(func.min(Transaction.transaction_date)).filter(
            Transaction.outlier_filter()
        ).scalar()
        if earliest and date_to_exclusive:
            earliest = date_type(earliest.year, earliest.month, 1)
            months_in_period = (date_to_exclusive.year - earliest.year) * 12 + (date_to_exclusive.month - earliest.month)
            months_in_period = max(months_in_period, 1)
            date_from = earliest
        else:
            months_in_period = 12

    # Build base filter conditions
    filter_conditions = [Transaction.outlier_filter()]
    if date_from:
        filter_conditions.append(Transaction.transaction_date >= date_from)
    if date_to_exclusive:
        filter_conditions.append(Transaction.transaction_date < date_to_exclusive)
    if bed_filter != "all":
        _apply_bedroom_filter(filter_conditions, bed_filter)
    if sale_type_filter:
        filter_conditions.append(Transaction.sale_type == sale_type_filter)

    # Market structure query
    query = db.session.query(
        Transaction.district,
        func.count(Transaction.id).label("tx_count"),
        func.count(case((Transaction.sale_type == SALE_TYPE_NEW, 1))).label("new_sale_count"),
        func.count(case((Transaction.sale_type == SALE_TYPE_RESALE, 1))).label("resale_count"),
        func.count(func.distinct(Transaction.project_name)).label("project_count"),
    ).filter(and_(*filter_conditions)).group_by(Transaction.district)

    results = query.all()
    district_data = {row.district: row for row in results}

    # Bedroom breakdown query
    bedroom_query = db.session.query(
        Transaction.district,
        Transaction.bedroom_count,
        func.count(Transaction.id).label("count")
    ).filter(and_(*filter_conditions)).group_by(Transaction.district, Transaction.bedroom_count)

    bedroom_results = bedroom_query.all()
    bedroom_by_district = {}
    for row in bedroom_results:
        if row.district not in bedroom_by_district:
            bedroom_by_district[row.district] = {}
        bedroom_by_district[row.district][str(row.bedroom_count)] = row.count

    # Resale-only filter for exit safety metrics
    resale_filter_conditions = [
        Transaction.outlier_filter(),
        Transaction.sale_type == SALE_TYPE_RESALE
    ]
    if date_from:
        resale_filter_conditions.append(Transaction.transaction_date >= date_from)
    if date_to_exclusive:
        resale_filter_conditions.append(Transaction.transaction_date < date_to_exclusive)
    if bed_filter != "all":
        _apply_bedroom_filter(resale_filter_conditions, bed_filter)

    # Resale velocity query
    resale_velocity_query = db.session.query(
        Transaction.district,
        func.count(Transaction.id).label("resale_tx_count"),
    ).filter(and_(*resale_filter_conditions)).group_by(Transaction.district)

    resale_velocity_results = resale_velocity_query.all()
    resale_velocity_data = {row.district: row.resale_tx_count for row in resale_velocity_results}

    # District units data
    district_units_data = get_district_units_for_resale(
        db_session=db.session,
        date_from=date_from,
        date_to=None
    )

    # PSF CV query
    psf_cv_query = db.session.query(
        Transaction.district,
        (func.stddev(Transaction.psf) / func.nullif(func.avg(Transaction.psf), 0)).label("psf_cv")
    ).filter(and_(*resale_filter_conditions)).group_by(Transaction.district)

    psf_cv_results = psf_cv_query.all()
    psf_cv_by_district = {row.district: float(row.psf_cv) if row.psf_cv else None for row in psf_cv_results}

    # Project concentration query
    project_query = db.session.query(
        Transaction.district,
        Transaction.project_name,
        func.count(Transaction.id).label("count")
    ).filter(and_(*resale_filter_conditions)).group_by(Transaction.district, Transaction.project_name)

    project_results = project_query.all()
    projects_by_district = {}
    for row in project_results:
        if row.district not in projects_by_district:
            projects_by_district[row.district] = []
        projects_by_district[row.district].append(row.count)

    # Helper functions
    def calculate_gini(values):
        if not values or len(values) < 2:
            return 0.0
        sorted_values = sorted(values)
        n = len(sorted_values)
        total = sum(sorted_values)
        if total == 0:
            return 0.0
        cumsum = sum((i + 1) * v for i, v in enumerate(sorted_values))
        return (2 * cumsum) / (n * total) - (n + 1) / n

    def get_fragility_label(gini):
        if gini < 0.4:
            return "Robust"
        elif gini < 0.7:
            return "Moderate"
        return "Fragile"

    def compute_robust_z_scores(values_dict):
        if len(values_dict) < 3:
            return {k: 0.0 for k in values_dict}
        values = list(values_dict.values())
        median_val = statistics.median(values)
        deviations = [abs(v - median_val) for v in values]
        mad = statistics.median(deviations)
        if mad < 0.001:
            return {k: 0.0 for k in values_dict}
        return {k: (v - median_val) / mad for k, v in values_dict.items()}

    def get_liquidity_tier(z_score):
        if z_score >= 1.5:
            return "Very High"
        elif z_score >= 0.5:
            return "High"
        elif z_score >= -0.5:
            return "Neutral"
        elif z_score >= -1.5:
            return "Low"
        return "Very Low"

    def percentile_score(value, all_values):
        if value is None or not all_values:
            return 50
        valid_values = [v for v in all_values if v is not None]
        if not valid_values:
            return 50
        sorted_vals = sorted(valid_values)
        rank = sum(1 for v in sorted_vals if v < value)
        return (rank / len(sorted_vals)) * 100

    def get_score_tier(score):
        if score is None:
            return None
        if score >= 80:
            return "Excellent"
        elif score >= 60:
            return "Good"
        elif score >= 40:
            return "Average"
        elif score >= 20:
            return "Below Average"
        return "Poor"

    # Calculate concentration metrics
    concentration_by_district = {}
    for district, project_counts in projects_by_district.items():
        gini = calculate_gini(project_counts)
        concentration_by_district[district] = {
            "gini": round(gini, 3),
            "fragility": get_fragility_label(gini),
            "project_count": len(project_counts),
            "top_project_share": round(max(project_counts) / sum(project_counts) * 100, 1) if project_counts else 0
        }

    # Calculate velocities and turnover rates
    velocities_data = {}
    for district, resale_tx_count in resale_velocity_data.items():
        velocity = resale_tx_count / months_in_period
        units_info = district_units_data.get(district, {})
        total_units = units_info.get("total_units", 0)
        coverage_pct = units_info.get("coverage_pct", 0)

        if total_units and total_units > 0:
            turnover_rate = (resale_tx_count / total_units) * 100
        else:
            turnover_rate = None

        velocities_data[district] = {
            "velocity": velocity,
            "turnover_rate": turnover_rate,
            "tx_count": resale_tx_count,
            "total_units": total_units,
            "coverage_pct": coverage_pct,
            "low_units_confidence": coverage_pct < 50 if coverage_pct else True
        }

    # Calculate velocity stats
    velocity_values = [d["velocity"] for d in velocities_data.values()]
    if velocity_values:
        mean_velocity = statistics.mean(velocity_values)
        stddev_velocity = statistics.stdev(velocity_values) if len(velocity_values) > 1 else 1
    else:
        mean_velocity = 0
        stddev_velocity = 1

    # Calculate turnover stats
    turnover_values = {k: v["turnover_rate"] for k, v in velocities_data.items() if v["turnover_rate"] is not None}
    if turnover_values:
        mean_turnover_rate = statistics.mean(turnover_values.values())
        median_turnover_rate = statistics.median(turnover_values.values())
    else:
        mean_turnover_rate = 0
        median_turnover_rate = 0

    # Calculate Z-scores
    z_scores = {}
    if turnover_values:
        robust_z = compute_robust_z_scores(turnover_values)
        z_scores.update(robust_z)

    for district, data in velocities_data.items():
        if district not in z_scores:
            if stddev_velocity > 0:
                z_scores[district] = (data["velocity"] - mean_velocity) / stddev_velocity
            else:
                z_scores[district] = 0

    resale_velocities = {k: v["velocity"] for k, v in velocities_data.items()}
    total_housing_stock = sum(d["total_units"] for d in velocities_data.values() if d["total_units"])

    # Collect values for percentile normalization
    all_velocities = list(resale_velocities.values())
    all_resale_counts = [c["project_count"] for c in concentration_by_district.values()]
    all_tx_counts = [row.tx_count for row in results if row.tx_count]
    all_project_counts = [row.project_count for row in results if row.project_count]

    def calculate_liquidity_score(
        monthly_velocity, resale_project_count, concentration_gini,
        tx_count, project_count, psf_cv, resale_pct
    ):
        velocity_score = percentile_score(monthly_velocity, all_velocities) * 0.35
        breadth_score = percentile_score(resale_project_count, all_resale_counts) * 0.15
        gini = concentration_gini if concentration_gini is not None else 0.5
        concentration_score = (1 - gini) * 100 * 0.10
        exit_safety = velocity_score + breadth_score + concentration_score

        volume_score = percentile_score(tx_count, all_tx_counts) * 0.18
        diversity_score = percentile_score(project_count, all_project_counts) * 0.09
        cv = min(psf_cv, 0.5) if psf_cv is not None else 0.25
        stability_score = (1 - cv * 2) * 100 * 0.08
        organic_score = (resale_pct or 0) * 0.05
        market_health = volume_score + diversity_score + stability_score + organic_score

        score = exit_safety + market_health
        return round(max(0, min(100, score)), 1)

    # Build response
    all_districts = [f"D{str(i).zfill(2)}" for i in range(1, 29)]
    districts_response = []
    total_transactions = 0

    for district_id in all_districts:
        region = _get_district_region(district_id)
        short_name, full_name = _get_district_names(district_id)

        has_combined = district_id in district_data
        has_resale = district_id in resale_velocities

        if has_combined or has_resale:
            if has_combined:
                row = district_data[district_id]
                tx_count = row.tx_count or 0
                new_sale_count = row.new_sale_count or 0
                resale_count = row.resale_count or 0
                project_count = row.project_count or 0
                total_transactions += tx_count
            else:
                tx_count = new_sale_count = resale_count = project_count = 0

            monthly_velocity = round(resale_velocities.get(district_id, 0), 2)
            z_score = round(z_scores.get(district_id, 0), 2)
            liquidity_tier = get_liquidity_tier(z_score)

            district_turnover_data = velocities_data.get(district_id, {})
            turnover_rate = district_turnover_data.get("turnover_rate")
            total_units = district_turnover_data.get("total_units", 0)
            units_coverage_pct = district_turnover_data.get("coverage_pct", 0)
            low_units_confidence = district_turnover_data.get("low_units_confidence", True)

            new_sale_pct = round((new_sale_count / tx_count) * 100, 1) if tx_count > 0 else 0
            resale_pct = round((resale_count / tx_count) * 100, 1) if tx_count > 0 else 0

            concentration = concentration_by_district.get(district_id, {
                "gini": 0, "fragility": "Unknown", "project_count": 0, "top_project_share": 0
            })
            psf_cv = psf_cv_by_district.get(district_id)

            liquidity_score = calculate_liquidity_score(
                monthly_velocity, concentration["project_count"], concentration["gini"],
                tx_count, project_count, psf_cv, resale_pct
            )
            score_tier = get_score_tier(liquidity_score)

            districts_response.append({
                "district_id": district_id,
                "name": short_name,
                "full_name": full_name,
                "region": region,
                "has_data": True,
                "liquidity_metrics": {
                    "liquidity_score": liquidity_score,
                    "score_tier": score_tier,
                    "tx_count": tx_count,
                    "new_sale_count": new_sale_count,
                    "resale_count": resale_count,
                    "new_sale_pct": new_sale_pct,
                    "resale_pct": resale_pct,
                    "project_count": project_count,
                    "monthly_velocity": monthly_velocity,
                    "z_score": z_score,
                    "liquidity_tier": liquidity_tier,
                    "turnover_rate": round(turnover_rate, 2) if turnover_rate else None,
                    "total_units": total_units,
                    "units_coverage_pct": round(units_coverage_pct, 1),
                    "low_units_confidence": low_units_confidence,
                    "concentration_gini": concentration["gini"],
                    "fragility_label": concentration["fragility"],
                    "resale_project_count": concentration["project_count"],
                    "top_project_share": concentration["top_project_share"],
                    "psf_cv": round(psf_cv, 3) if psf_cv else None
                },
                "bedroom_breakdown": bedroom_by_district.get(district_id, {})
            })
        else:
            districts_response.append({
                "district_id": district_id,
                "name": short_name,
                "full_name": full_name,
                "region": region,
                "has_data": False,
                "liquidity_metrics": {
                    "liquidity_score": None, "score_tier": None,
                    "tx_count": 0, "new_sale_count": 0, "resale_count": 0,
                    "new_sale_pct": 0, "resale_pct": 0, "project_count": 0,
                    "monthly_velocity": 0, "z_score": None, "liquidity_tier": None,
                    "turnover_rate": None, "total_units": 0, "units_coverage_pct": 0,
                    "low_units_confidence": True, "concentration_gini": None,
                    "fragility_label": None, "resale_project_count": 0,
                    "top_project_share": 0, "psf_cv": None
                },
                "bedroom_breakdown": {}
            })

    elapsed = time.time() - start

    return {
        "districts": districts_response,
        "meta": {
            "timeframe": timeframe,
            "bed_filter": bed_filter,
            "sale_type_filter": sale_type_filter,
            "months_in_period": months_in_period,
            "date_range": {
                "from": date_from.isoformat() if date_from else None,
                "to_exclusive": date_to_exclusive.isoformat() if date_to_exclusive else None
            },
            "total_transactions": total_transactions,
            "mean_velocity": round(mean_velocity, 2),
            "stddev_velocity": round(stddev_velocity, 2),
            "mean_turnover_rate": round(mean_turnover_rate, 2),
            "median_turnover_rate": round(median_turnover_rate, 2),
            "total_housing_stock": total_housing_stock,
            "methodology_notes": {
                "liquidity_score": "Composite 0-100 score: Exit Safety (60%) + Market Health (40%)",
                "exit_safety_metrics": "Velocity (35%), Breadth (15%), Concentration (10%) - RESALE only",
                "market_health_metrics": "Volume (18%), Diversity (9%), Stability (8%), Organic (5%)",
                "concentration_metrics": "Gini, Fragility, Top Share calculated on RESALE only",
                "turnover_rate": "Resales per 100 units per period - normalized for district size",
                "z_score": "Robust Z-score using median/MAD - handles skewed distributions"
            },
            "elapsed_ms": int(elapsed * 1000),
            "cache_hit": False
        }
    }
