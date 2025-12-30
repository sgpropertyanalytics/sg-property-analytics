"""
Insights API Routes - Visual Analytics for Market Intelligence

Dedicated endpoints for the Insights page visual analytics features.
These endpoints are optimized for specific visualization needs.
"""

from flask import Blueprint, request, jsonify
import time
from datetime import datetime, timedelta
from models.transaction import Transaction
from models.database import db
from sqlalchemy import func, and_, or_, extract, case, literal
from constants import CCR_DISTRICTS, RCR_DISTRICTS, DISTRICT_NAMES, SALE_TYPE_NEW, SALE_TYPE_RESALE
from services.new_launch_units import get_district_units_for_resale
from api.contracts import api_contract


def build_property_age_filter(age_filter):
    """
    Build SQLAlchemy filter condition for property age.

    Property age = transaction_year - lease_start_year

    Age categories:
    - new: 0-5 years (New Sale / Recently TOP)
    - young: 5-10 years (Young Resale)
    - resale: >10 years (Mature Resale)

    Returns filter condition or None if 'all'
    """
    if age_filter == "all" or not age_filter:
        return None

    # Property age = transaction year - lease start year
    property_age = extract('year', Transaction.transaction_date) - Transaction.lease_start_year

    if age_filter == "new":
        # 0-5 years: New Sale / Recently TOP
        return and_(
            Transaction.lease_start_year.isnot(None),
            property_age >= 0,
            property_age <= 5
        )
    elif age_filter == "young":
        # 5-10 years: Young Resale
        return and_(
            Transaction.lease_start_year.isnot(None),
            property_age > 5,
            property_age <= 10
        )
    elif age_filter == "resale":
        # >10 years: Mature Resale
        return and_(
            Transaction.lease_start_year.isnot(None),
            property_age > 10
        )

    return None

insights_bp = Blueprint('insights', __name__)

# Import contract versioning for HTTP header
from api.contracts.contract_schema import API_CONTRACT_HEADER, CURRENT_API_CONTRACT_VERSION


@insights_bp.after_request
def add_contract_version_header(response):
    """Add X-API-Contract-Version header to all insights responses."""
    response.headers[API_CONTRACT_HEADER] = CURRENT_API_CONTRACT_VERSION
    return response


def months_ago(date, months):
    """
    Calculate a date N months ago.
    Uses calendar month subtraction for accuracy.
    """
    year = date.year
    month = date.month - months
    while month <= 0:
        month += 12
        year -= 1
    # Handle day overflow (e.g., March 31 -> Feb 28)
    day = min(date.day, 28)  # Safe for all months
    return date.replace(year=year, month=month, day=day)


def years_ago(date, years):
    """Calculate a date N years ago."""
    try:
        return date.replace(year=date.year - years)
    except ValueError:
        # Handle Feb 29 in non-leap years
        return date.replace(year=date.year - years, day=28)


@insights_bp.route("/district-psf", methods=["GET"])
@api_contract("insights/district-psf")
def district_psf():
    """
    Get median PSF by district for the Visual Analytics Map.

    Designed for the choropleth map visualization with bedroom and property age filters.
    Returns per-district: median_psf, tx_count, yoy_pct

    Query params:
      - period: Time period filter - 3m, 6m, 12m, all (default: 12m)
      - bed: Bedroom filter - all, 1, 2, 3, 4+, 5 (default: all)
      - sale_type: Sale type filter (default: all)
          - all: All sale types
          - new_sale: New Sale transactions only
          - resale: Resale transactions only
      - age: Property age filter (default: all) [deprecated - use sale_type]
          - all: All properties
          - new: 0-5 years (New Sale / Recently TOP)
          - young: 5-10 years (Young Resale)
          - resale: >10 years (Mature Resale)

    Returns:
      {
        "districts": [
          {
            "district_id": "D01",
            "name": "Boat Quay / Raffles Place / Marina",
            "region": "CCR",
            "median_psf": 2150,
            "tx_count": 45,
            "yoy_pct": 3.2,
            "has_data": true
          },
          ...
        ],
        "meta": {
          "period": "12m",
          "bed_filter": "all",
          "date_range": {"from": "2024-01-01", "to": "2024-12-31"},
          "total_districts": 28,
          "districts_with_data": 25,
          "elapsed_ms": 45
        }
      }
    """
    start = time.time()

    # Parse query params
    period = request.args.get("period", "12m")
    bed_filter = request.args.get("bed", "all")
    age_filter = request.args.get("age", "all")
    # Accept both v2 (saleType) and v1 (sale_type) params
    sale_type_filter = request.args.get("saleType") or request.args.get("sale_type", "all")

    # Calculate date range based on period
    today = datetime.now().date()
    if period == "3m":
        date_from = months_ago(today, 3)
    elif period == "6m":
        date_from = months_ago(today, 6)
    elif period == "12m":
        date_from = months_ago(today, 12)
    elif period == "all":
        date_from = None
    else:
        date_from = months_ago(today, 12)  # Default to 12m

    # Build base filter conditions (always exclude outliers)
    filter_conditions = [Transaction.outlier_filter()]

    # Apply date filter
    if date_from:
        filter_conditions.append(Transaction.transaction_date >= date_from)

    # Apply bedroom filter
    bedroom_filter_label = bed_filter
    if bed_filter != "all":
        if bed_filter == "1":
            filter_conditions.append(Transaction.bedroom_count == 1)
        elif bed_filter == "2":
            filter_conditions.append(Transaction.bedroom_count == 2)
        elif bed_filter == "3":
            filter_conditions.append(Transaction.bedroom_count == 3)
        elif bed_filter in ["4", "4+", "5"]:
            filter_conditions.append(Transaction.bedroom_count >= 4)

    # Apply property age filter
    age_condition = build_property_age_filter(age_filter)
    if age_condition is not None:
        filter_conditions.append(age_condition)

    # Apply sale type filter (new_sale, resale)
    if sale_type_filter and sale_type_filter != "all":
        if sale_type_filter == "new_sale":
            filter_conditions.append(Transaction.sale_type == SALE_TYPE_NEW)
        elif sale_type_filter == "resale":
            filter_conditions.append(Transaction.sale_type == SALE_TYPE_RESALE)

    try:
        # Query current period data - grouped by district
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

        # Query YoY comparison data (same period, 1 year earlier)
        yoy_data = {}
        if date_from:
            yoy_from = years_ago(date_from, 1)
            yoy_to = years_ago(today, 1)

            yoy_conditions = [Transaction.outlier_filter()]
            yoy_conditions.append(Transaction.transaction_date >= yoy_from)
            # Use < next_day instead of <= yoy_to to include all transactions on yoy_to
            yoy_conditions.append(Transaction.transaction_date < yoy_to + timedelta(days=1))

            # Apply same bedroom filter for YoY
            if bed_filter != "all":
                if bed_filter == "1":
                    yoy_conditions.append(Transaction.bedroom_count == 1)
                elif bed_filter == "2":
                    yoy_conditions.append(Transaction.bedroom_count == 2)
                elif bed_filter == "3":
                    yoy_conditions.append(Transaction.bedroom_count == 3)
                elif bed_filter in ["4", "4+", "5"]:
                    yoy_conditions.append(Transaction.bedroom_count >= 4)

            # Apply same property age filter for YoY
            if age_condition is not None:
                yoy_conditions.append(age_condition)

            # Apply same sale type filter for YoY
            if sale_type_filter and sale_type_filter != "all":
                if sale_type_filter == "new_sale":
                    yoy_conditions.append(Transaction.sale_type == SALE_TYPE_NEW)
                elif sale_type_filter == "resale":
                    yoy_conditions.append(Transaction.sale_type == SALE_TYPE_RESALE)

            yoy_query = db.session.query(
                Transaction.district,
                func.percentile_cont(0.5).within_group(Transaction.psf).label("median_psf")
            ).filter(
                and_(*yoy_conditions)
            ).group_by(
                Transaction.district
            )

            yoy_data = {row.district: row.median_psf for row in yoy_query.all()}

        # Build response with all 28 districts
        all_districts = [f"D{str(i).zfill(2)}" for i in range(1, 29)]
        districts_response = []
        districts_with_data = 0

        for district_id in all_districts:
            # Determine region
            if district_id in CCR_DISTRICTS:
                region = "CCR"
            elif district_id in RCR_DISTRICTS:
                region = "RCR"
            else:
                region = "OCR"

            # Get district name (truncate for display)
            full_name = DISTRICT_NAMES.get(district_id, district_id)
            # Get first location for short name
            short_name = full_name.split(" / ")[0] if " / " in full_name else full_name

            # Check if we have data for this district
            if district_id in current_results:
                row = current_results[district_id]
                median_psf = round(row.median_psf, 0) if row.median_psf else None
                tx_count = row.tx_count or 0

                # Calculate YoY percentage
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
                # No data for this district (will be "ghosted" in UI)
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

        return jsonify({
            "districts": districts_response,
            "meta": {
                "period": period,
                "bed_filter": bedroom_filter_label,
                "age_filter": age_filter,
                "date_range": {
                    "from": date_from.isoformat() if date_from else None,
                    "to": today.isoformat()
                },
                "total_districts": 28,
                "districts_with_data": districts_with_data,
                "elapsed_ms": int(elapsed * 1000)
            }
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/insights/district-psf ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@insights_bp.route("/district-liquidity", methods=["GET"])
@api_contract("insights/district-liquidity")
def district_liquidity():
    """
    Get liquidity metrics by district for the District Liquidity Heatmap.

    Measures market liquidity using transaction velocity, concentration, and Z-scores.

    Query params:
      - period: Time period - 3m, 6m, 12m, all (default: 12m)
      - bed: Bedroom filter - all, 1, 2, 3, 4, 5 (default: all)
      - sale_type: Sale type filter - all, new_sale, resale (default: all)

    Returns:
      {
        "districts": [
          {
            "district_id": "D01",
            "name": "Raffles Place / Marina",
            "region": "CCR",
            "has_data": true,
            "liquidity_metrics": {
              "tx_count": 156,
              "monthly_velocity": 13.0,
              "z_score": 1.24,
              "liquidity_tier": "Very High",
              "new_sale_count": 55,
              "resale_count": 101,
              "new_sale_pct": 35.2,
              "resale_pct": 64.8
            },
            "bedroom_breakdown": { "1": 23, "2": 67, ... }
          },
          ...
        ],
        "meta": {
          "period": "12m",
          "months_in_period": 12,
          "date_range": {"from": "...", "to": "..."},
          "total_transactions": 12450,
          "mean_velocity": 37.2,
          "stddev_velocity": 28.5,
          "elapsed_ms": 45
        }
      }
    """
    import statistics

    start = time.time()

    # Parse query params
    from api.contracts.contract_schema import SaleType

    period = request.args.get("period", "12m")
    bed_filter = request.args.get("bed", "all")
    # Accept both v2 (saleType) and v1 (sale_type) params, normalize via SaleType.to_db()
    sale_type_param = request.args.get("saleType") or request.args.get("sale_type", "all")
    sale_type_filter = SaleType.to_db(sale_type_param) if sale_type_param != "all" else "all"

    # Calculate date range and months count
    today = datetime.now().date()
    if period == "3m":
        date_from = months_ago(today, 3)
        months_in_period = 3
    elif period == "6m":
        date_from = months_ago(today, 6)
        months_in_period = 6
    elif period == "12m":
        date_from = months_ago(today, 12)
        months_in_period = 12
    elif period == "all":
        # For "all", get the earliest transaction date
        earliest = db.session.query(func.min(Transaction.transaction_date)).filter(
            Transaction.outlier_filter()
        ).scalar()
        if earliest:
            date_from = earliest
            # Calculate months between earliest and today
            months_in_period = (today.year - earliest.year) * 12 + (today.month - earliest.month)
            months_in_period = max(months_in_period, 1)  # At least 1 month
        else:
            date_from = None
            months_in_period = 12  # Default
    else:
        date_from = months_ago(today, 12)
        months_in_period = 12

    # Build base filter conditions
    filter_conditions = [Transaction.outlier_filter()]

    if date_from:
        filter_conditions.append(Transaction.transaction_date >= date_from)

    # Apply bedroom filter
    if bed_filter != "all":
        if bed_filter == "1":
            filter_conditions.append(Transaction.bedroom_count == 1)
        elif bed_filter == "2":
            filter_conditions.append(Transaction.bedroom_count == 2)
        elif bed_filter == "3":
            filter_conditions.append(Transaction.bedroom_count == 3)
        elif bed_filter == "4":
            filter_conditions.append(Transaction.bedroom_count == 4)
        elif bed_filter == "5":
            filter_conditions.append(Transaction.bedroom_count >= 5)

    # Apply sale type filter
    if sale_type_filter != "all":
        filter_conditions.append(Transaction.sale_type == sale_type_filter)

    try:
        # =================================================================
        # MARKET STRUCTURE METRICS (Combined: respects user's sale_type filter)
        # These show total market activity based on user's filter selection
        # =================================================================
        query = db.session.query(
            Transaction.district,
            func.count(Transaction.id).label("tx_count"),
            func.count(case((Transaction.sale_type == SALE_TYPE_NEW, 1))).label("new_sale_count"),
            func.count(case((Transaction.sale_type == SALE_TYPE_RESALE, 1))).label("resale_count"),
            func.count(func.distinct(Transaction.project_name)).label("project_count"),
        ).filter(
            and_(*filter_conditions)
        ).group_by(
            Transaction.district
        )

        results = query.all()
        district_data = {row.district: row for row in results}

        # Query bedroom breakdown per district (combined)
        bedroom_query = db.session.query(
            Transaction.district,
            Transaction.bedroom_count,
            func.count(Transaction.id).label("count")
        ).filter(
            and_(*filter_conditions)
        ).group_by(
            Transaction.district,
            Transaction.bedroom_count
        )

        bedroom_results = bedroom_query.all()
        bedroom_by_district = {}
        for row in bedroom_results:
            if row.district not in bedroom_by_district:
                bedroom_by_district[row.district] = {}
            bedroom_by_district[row.district][str(row.bedroom_count)] = row.count

        # =================================================================
        # EXIT SAFETY METRICS (Resale-only: ignores user's sale_type filter)
        # These measure organic market depth and exit conditions
        # New sales are excluded because:
        # - Developer-controlled release schedules distort velocity
        # - Marketing-driven spikes create false liquidity signals
        # - New launch concentration is 100% by definition (one developer)
        # =================================================================
        resale_filter_conditions = [
            Transaction.outlier_filter(),
            Transaction.sale_type == SALE_TYPE_RESALE  # ALWAYS resale only for exit safety
        ]
        if date_from:
            resale_filter_conditions.append(Transaction.transaction_date >= date_from)
        # Apply bedroom filter to resale metrics too
        if bed_filter != "all":
            if bed_filter == "1":
                resale_filter_conditions.append(Transaction.bedroom_count == 1)
            elif bed_filter == "2":
                resale_filter_conditions.append(Transaction.bedroom_count == 2)
            elif bed_filter == "3":
                resale_filter_conditions.append(Transaction.bedroom_count == 3)
            elif bed_filter == "4":
                resale_filter_conditions.append(Transaction.bedroom_count == 4)
            elif bed_filter == "5":
                resale_filter_conditions.append(Transaction.bedroom_count >= 5)

        # Query resale transaction counts for velocity/Z-score calculation
        resale_velocity_query = db.session.query(
            Transaction.district,
            func.count(Transaction.id).label("resale_tx_count"),
        ).filter(
            and_(*resale_filter_conditions)
        ).group_by(
            Transaction.district
        )

        resale_velocity_results = resale_velocity_query.all()
        resale_velocity_data = {row.district: row.resale_tx_count for row in resale_velocity_results}

        # =================================================================
        # DISTRICT TOTAL UNITS (for turnover rate normalization)
        # Uses CSV data only - no estimation
        # =================================================================
        district_units_data = get_district_units_for_resale(
            db_session=db.session,
            date_from=date_from,
            date_to=None  # Up to present
        )

        # =================================================================
        # PRICE STABILITY METRICS (Resale-only: PSF Coefficient of Variation)
        # Lower CV = more consistent pricing = healthier market
        # =================================================================
        psf_cv_query = db.session.query(
            Transaction.district,
            (func.stddev(Transaction.psf) / func.nullif(func.avg(Transaction.psf), 0)).label("psf_cv")
        ).filter(
            and_(*resale_filter_conditions)
        ).group_by(
            Transaction.district
        )

        psf_cv_results = psf_cv_query.all()
        psf_cv_by_district = {row.district: float(row.psf_cv) if row.psf_cv else None for row in psf_cv_results}

        # Query project-level resale transaction counts for concentration calculation
        project_query = db.session.query(
            Transaction.district,
            Transaction.project_name,
            func.count(Transaction.id).label("count")
        ).filter(
            and_(*resale_filter_conditions)
        ).group_by(
            Transaction.district,
            Transaction.project_name
        )

        project_results = project_query.all()
        projects_by_district = {}
        for row in project_results:
            if row.district not in projects_by_district:
                projects_by_district[row.district] = []
            projects_by_district[row.district].append(row.count)

        # Gini coefficient calculation function (applied to resale only)
        def calculate_gini(values):
            """
            Calculate Gini coefficient for concentration measurement.
            0 = perfect equality (transactions spread evenly across projects)
            1 = perfect inequality (one project dominates all transactions)
            NOTE: This is calculated on RESALE transactions only.
            """
            if not values or len(values) < 2:
                return 0.0

            sorted_values = sorted(values)
            n = len(sorted_values)
            total = sum(sorted_values)

            if total == 0:
                return 0.0

            # Gini formula: G = (2 * sum(i * x_i)) / (n * sum(x_i)) - (n + 1) / n
            cumsum = sum((i + 1) * v for i, v in enumerate(sorted_values))
            return (2 * cumsum) / (n * total) - (n + 1) / n

        # Get fragility label based on Gini coefficient (resale-only)
        def get_fragility_label(gini):
            """
            Fragility based on concentration of RESALE transactions:
            - Low Gini (<0.4): Robust - resale spread across many projects
            - Medium Gini (0.4-0.7): Moderate - some concentration in resale
            - High Gini (>0.7): Fragile - resale dominated by few projects
            """
            if gini < 0.4:
                return "Robust"
            elif gini < 0.7:
                return "Moderate"
            else:
                return "Fragile"

        # Calculate concentration metrics per district
        concentration_by_district = {}
        for district, project_counts in projects_by_district.items():
            gini = calculate_gini(project_counts)
            concentration_by_district[district] = {
                "gini": round(gini, 3),
                "fragility": get_fragility_label(gini),
                "project_count": len(project_counts),
                "top_project_share": round(max(project_counts) / sum(project_counts) * 100, 1) if project_counts else 0
            }

        # =================================================================
        # TURNOVER RATE & ROBUST Z-SCORES (Normalized by housing stock)
        # Turnover = (resale_transactions / total_units) * 100 per period
        # This normalizes for district size - fairer comparison
        # =================================================================

        # Robust Z-score function (uses median/MAD instead of mean/stddev)
        def compute_robust_z_scores(values_dict):
            """
            Compute robust Z-scores using median and MAD.

            Robust Z-score handles right-skewed distributions better than
            standard Z-score (housing turnover is typically right-skewed).

            Formula: z_robust = (x - median) / MAD
            Where MAD = median(|x_i - median(x)|)
            """
            if len(values_dict) < 3:
                return {k: 0.0 for k in values_dict}

            values = list(values_dict.values())
            median_val = statistics.median(values)
            deviations = [abs(v - median_val) for v in values]
            mad = statistics.median(deviations)

            # Avoid division by zero
            if mad < 0.001:
                return {k: 0.0 for k in values_dict}

            return {k: (v - median_val) / mad for k, v in values_dict.items()}

        # Calculate velocities and turnover rates
        velocities_data = {}  # district -> {velocity, turnover_rate, tx_count, total_units, coverage}
        for district, resale_tx_count in resale_velocity_data.items():
            velocity = resale_tx_count / months_in_period

            # Get unit data for this district
            units_info = district_units_data.get(district, {})
            total_units = units_info.get("total_units", 0)
            coverage_pct = units_info.get("coverage_pct", 0)

            # Calculate turnover rate (per 100 units per period)
            # If no unit data, turnover_rate is None
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

        # Calculate mean velocity (for backwards compatibility)
        velocity_values = [d["velocity"] for d in velocities_data.values()]
        if velocity_values:
            mean_velocity = statistics.mean(velocity_values)
            stddev_velocity = statistics.stdev(velocity_values) if len(velocity_values) > 1 else 1
        else:
            mean_velocity = 0
            stddev_velocity = 1

        # Calculate turnover rate stats (for districts with unit data)
        turnover_values = {k: v["turnover_rate"] for k, v in velocities_data.items()
                          if v["turnover_rate"] is not None}
        if turnover_values:
            mean_turnover_rate = statistics.mean(turnover_values.values())
            median_turnover_rate = statistics.median(turnover_values.values())
        else:
            mean_turnover_rate = 0
            median_turnover_rate = 0

        # Calculate Z-scores based on turnover rate (robust method)
        # For districts without unit data, use velocity-based Z-score as fallback
        z_scores = {}
        if turnover_values:
            # Primary: Robust Z-score on turnover rate
            robust_z = compute_robust_z_scores(turnover_values)
            z_scores.update(robust_z)

        # Fallback for districts without turnover data: velocity-based Z-score
        for district, data in velocities_data.items():
            if district not in z_scores:
                # Standard Z-score on velocity as fallback
                if stddev_velocity > 0:
                    z_scores[district] = (data["velocity"] - mean_velocity) / stddev_velocity
                else:
                    z_scores[district] = 0

        # Convenient accessor for velocities
        resale_velocities = {k: v["velocity"] for k, v in velocities_data.items()}

        # Total housing stock across all districts
        total_housing_stock = sum(d["total_units"] for d in velocities_data.values() if d["total_units"])

        # Determine liquidity tier based on Z-score
        def get_liquidity_tier(z_score):
            """Tier based on turnover rate Z-score (exit safety indicator)"""
            if z_score >= 1.5:
                return "Very High"
            elif z_score >= 0.5:
                return "High"
            elif z_score >= -0.5:
                return "Neutral"
            elif z_score >= -1.5:
                return "Low"
            else:
                return "Very Low"

        # =================================================================
        # COMPOSITE LIQUIDITY SCORE (0-100)
        # Combines exit safety (60%) and market health (40%)
        # =================================================================
        def percentile_score(value, all_values):
            """Convert raw value to 0-100 percentile rank."""
            if value is None or not all_values:
                return 50  # Neutral if no data
            valid_values = [v for v in all_values if v is not None]
            if not valid_values:
                return 50
            sorted_vals = sorted(valid_values)
            rank = sum(1 for v in sorted_vals if v < value)
            return (rank / len(sorted_vals)) * 100

        def calculate_liquidity_score(
            monthly_velocity, resale_project_count, concentration_gini,
            tx_count, project_count, psf_cv, resale_pct,
            all_velocities, all_resale_counts, all_tx_counts, all_project_counts
        ):
            """
            Calculate composite liquidity score (0-100).

            Components:
            - Exit Safety (60%): velocity (35%), breadth (15%), concentration (10%)
            - Market Health (40%): volume (18%), diversity (9%), stability (8%), organic (5%)
            """
            # EXIT SAFETY (60%)
            velocity_score = percentile_score(monthly_velocity, all_velocities) * 0.35
            breadth_score = percentile_score(resale_project_count, all_resale_counts) * 0.15
            # Gini: 0 = evenly spread (good), 1 = concentrated (bad)
            gini = concentration_gini if concentration_gini is not None else 0.5
            concentration_score = (1 - gini) * 100 * 0.10

            exit_safety = velocity_score + breadth_score + concentration_score

            # MARKET HEALTH (40%)
            volume_score = percentile_score(tx_count, all_tx_counts) * 0.18
            diversity_score = percentile_score(project_count, all_project_counts) * 0.09
            # PSF CV: lower is better, cap at 0.5
            cv = min(psf_cv, 0.5) if psf_cv is not None else 0.25
            stability_score = (1 - cv * 2) * 100 * 0.08
            # Organic demand: higher resale % is better
            organic_score = (resale_pct or 0) * 0.05

            market_health = volume_score + diversity_score + stability_score + organic_score

            # FINAL SCORE (clamped to 0-100)
            score = exit_safety + market_health
            return round(max(0, min(100, score)), 1)

        def get_score_tier(score):
            """Convert numeric score to tier label."""
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
            else:
                return "Poor"

        # Collect all values for percentile-based normalization
        all_velocities = list(resale_velocities.values())
        all_resale_counts = [c["project_count"] for c in concentration_by_district.values()]
        all_tx_counts = [row.tx_count for row in results if row.tx_count]
        all_project_counts = [row.project_count for row in results if row.project_count]

        # Build response with all 28 districts
        all_districts = [f"D{str(i).zfill(2)}" for i in range(1, 29)]
        districts_response = []
        total_transactions = 0

        for district_id in all_districts:
            # Determine region
            if district_id in CCR_DISTRICTS:
                region = "CCR"
            elif district_id in RCR_DISTRICTS:
                region = "RCR"
            else:
                region = "OCR"

            # Get district name
            full_name = DISTRICT_NAMES.get(district_id, district_id)
            short_name = full_name.split(" / ")[0] if " / " in full_name else full_name

            # Check if district has any data (combined or resale)
            has_combined = district_id in district_data
            has_resale = district_id in resale_velocities

            if has_combined or has_resale:
                # MARKET STRUCTURE METRICS (Combined - based on user's filter)
                if has_combined:
                    row = district_data[district_id]
                    tx_count = row.tx_count or 0
                    new_sale_count = row.new_sale_count or 0
                    resale_count = row.resale_count or 0
                    project_count = row.project_count or 0  # All active projects
                    total_transactions += tx_count
                else:
                    tx_count = 0
                    new_sale_count = 0
                    resale_count = 0
                    project_count = 0

                # EXIT SAFETY METRICS (Resale-only - organic demand signals)
                # Velocity = resale transactions / months
                monthly_velocity = round(resale_velocities.get(district_id, 0), 2)
                z_score = round(z_scores.get(district_id, 0), 2)
                liquidity_tier = get_liquidity_tier(z_score)

                # TURNOVER METRICS (Normalized by housing stock)
                district_turnover_data = velocities_data.get(district_id, {})
                turnover_rate = district_turnover_data.get("turnover_rate")
                total_units = district_turnover_data.get("total_units", 0)
                units_coverage_pct = district_turnover_data.get("coverage_pct", 0)
                low_units_confidence = district_turnover_data.get("low_units_confidence", True)

                # Calculate percentages
                new_sale_pct = round((new_sale_count / tx_count) * 100, 1) if tx_count > 0 else 0
                resale_pct = round((resale_count / tx_count) * 100, 1) if tx_count > 0 else 0

                # Get concentration metrics (resale-only)
                concentration = concentration_by_district.get(district_id, {
                    "gini": 0,
                    "fragility": "Unknown",
                    "project_count": 0,
                    "top_project_share": 0
                })

                # Get PSF coefficient of variation (price stability)
                psf_cv = psf_cv_by_district.get(district_id)

                # Calculate composite liquidity score
                liquidity_score = calculate_liquidity_score(
                    monthly_velocity=monthly_velocity,
                    resale_project_count=concentration["project_count"],
                    concentration_gini=concentration["gini"],
                    tx_count=tx_count,
                    project_count=project_count,
                    psf_cv=psf_cv,
                    resale_pct=resale_pct,
                    all_velocities=all_velocities,
                    all_resale_counts=all_resale_counts,
                    all_tx_counts=all_tx_counts,
                    all_project_counts=all_project_counts
                )
                score_tier = get_score_tier(liquidity_score)

                districts_response.append({
                    "district_id": district_id,
                    "name": short_name,
                    "full_name": full_name,
                    "region": region,
                    "has_data": True,
                    "liquidity_metrics": {
                        # Composite Score
                        "liquidity_score": liquidity_score,
                        "score_tier": score_tier,
                        # Market Structure (Combined)
                        "tx_count": tx_count,
                        "new_sale_count": new_sale_count,
                        "resale_count": resale_count,
                        "new_sale_pct": new_sale_pct,
                        "resale_pct": resale_pct,
                        "project_count": project_count,  # All active projects
                        # Exit Safety (Resale-only)
                        "monthly_velocity": monthly_velocity,  # Resale velocity (raw)
                        "z_score": z_score,  # Robust Z-score based on turnover rate
                        "liquidity_tier": liquidity_tier,  # Based on turnover Z-score
                        # Turnover Metrics (Normalized by housing stock)
                        "turnover_rate": round(turnover_rate, 2) if turnover_rate else None,
                        "total_units": total_units,
                        "units_coverage_pct": round(units_coverage_pct, 1),
                        "low_units_confidence": low_units_confidence,
                        # Concentration Risks (Resale-only)
                        "concentration_gini": concentration["gini"],
                        "fragility_label": concentration["fragility"],
                        "resale_project_count": concentration["project_count"],  # Projects with resale
                        "top_project_share": concentration["top_project_share"],
                        # Price Stability (Resale-only)
                        "psf_cv": round(psf_cv, 3) if psf_cv else None
                    },
                    "bedroom_breakdown": bedroom_by_district.get(district_id, {})
                })
            else:
                # No data for this district
                districts_response.append({
                    "district_id": district_id,
                    "name": short_name,
                    "full_name": full_name,
                    "region": region,
                    "has_data": False,
                    "liquidity_metrics": {
                        # Composite Score
                        "liquidity_score": None,
                        "score_tier": None,
                        # Market Structure (Combined)
                        "tx_count": 0,
                        "new_sale_count": 0,
                        "resale_count": 0,
                        "new_sale_pct": 0,
                        "resale_pct": 0,
                        "project_count": 0,
                        # Exit Safety (Resale-only)
                        "monthly_velocity": 0,
                        "z_score": None,
                        "liquidity_tier": None,
                        # Turnover Metrics (Normalized by housing stock)
                        "turnover_rate": None,
                        "total_units": 0,
                        "units_coverage_pct": 0,
                        "low_units_confidence": True,
                        # Concentration Risks (Resale-only)
                        "concentration_gini": None,
                        "fragility_label": None,
                        "resale_project_count": 0,
                        "top_project_share": 0,
                        # Price Stability (Resale-only)
                        "psf_cv": None
                    },
                    "bedroom_breakdown": {}
                })

        elapsed = time.time() - start

        return jsonify({
            "districts": districts_response,
            "meta": {
                "period": period,
                "bed_filter": bed_filter,
                "sale_type_filter": sale_type_filter,
                "months_in_period": months_in_period,
                "date_range": {
                    "from": date_from.isoformat() if date_from else None,
                    "to": today.isoformat()
                },
                "total_transactions": total_transactions,
                # Velocity stats (raw, for backwards compat)
                "mean_velocity": round(mean_velocity, 2),
                "stddev_velocity": round(stddev_velocity, 2),
                # Turnover stats (normalized by housing stock)
                "mean_turnover_rate": round(mean_turnover_rate, 2),
                "median_turnover_rate": round(median_turnover_rate, 2),
                "total_housing_stock": total_housing_stock,
                "methodology_notes": {
                    "liquidity_score": "Composite 0-100 score: Exit Safety (60%) + Market Health (40%)",
                    "exit_safety_metrics": "Velocity (35%), Breadth (15%), Concentration (10%) - RESALE only",
                    "market_health_metrics": "Volume (18%), Diversity (9%), Stability (8%), Organic (5%)",
                    "concentration_metrics": "Gini, Fragility, Top Share calculated on RESALE only (avoids developer release distortion)",
                    "market_structure_metrics": "Transactions, Projects, New%/Resale% include all sale types (total activity)",
                    "turnover_rate": "Resales per 100 units per period - normalized for district size",
                    "z_score": "Robust Z-score using median/MAD - handles skewed distributions"
                },
                "elapsed_ms": int(elapsed * 1000)
            }
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/insights/district-liquidity ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
