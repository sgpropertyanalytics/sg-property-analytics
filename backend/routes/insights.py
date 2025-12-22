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
from constants import CCR_DISTRICTS, RCR_DISTRICTS, DISTRICT_NAMES


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
def district_psf():
    """
    Get median PSF by district for the Visual Analytics Map.

    Designed for the choropleth map visualization with bedroom and property age filters.
    Returns per-district: median_psf, tx_count, yoy_pct

    Query params:
      - period: Time period filter - 3m, 6m, 12m, all (default: 12m)
      - bed: Bedroom filter - all, 1, 2, 3, 4+, 5 (default: all)
      - age: Property age filter (default: all)
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
            yoy_conditions.append(Transaction.transaction_date <= yoy_to)

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


@insights_bp.route("/district-summary", methods=["GET"])
def district_summary():
    """
    Get summary statistics for a specific district.
    Used for the tooltip/detail panel when hovering over a district.

    Query params:
      - district: District ID (e.g., D09)
      - period: Time period filter - 3m, 6m, 12m, all (default: 12m)
      - bed: Bedroom filter - all, 1, 2, 3, 4+ (default: all)

    Returns detailed stats for that district.
    """
    start = time.time()

    district = request.args.get("district")
    if not district:
        return jsonify({"error": "district parameter is required"}), 400

    # Normalize district
    district = district.strip().upper()
    if not district.startswith("D"):
        district = f"D{district.zfill(2)}"

    period = request.args.get("period", "12m")
    bed_filter = request.args.get("bed", "all")

    # Calculate date range
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
        date_from = months_ago(today, 12)

    # Build filter conditions
    filter_conditions = [
        Transaction.outlier_filter(),
        Transaction.district == district
    ]

    if date_from:
        filter_conditions.append(Transaction.transaction_date >= date_from)

    if bed_filter != "all":
        if bed_filter == "1":
            filter_conditions.append(Transaction.bedroom_count == 1)
        elif bed_filter == "2":
            filter_conditions.append(Transaction.bedroom_count == 2)
        elif bed_filter == "3":
            filter_conditions.append(Transaction.bedroom_count == 3)
        elif bed_filter in ["4", "4+"]:
            filter_conditions.append(Transaction.bedroom_count >= 4)

    try:
        # Get detailed stats
        stats = db.session.query(
            func.count(Transaction.id).label("tx_count"),
            func.percentile_cont(0.5).within_group(Transaction.psf).label("median_psf"),
            func.percentile_cont(0.25).within_group(Transaction.psf).label("psf_25th"),
            func.percentile_cont(0.75).within_group(Transaction.psf).label("psf_75th"),
            func.min(Transaction.psf).label("min_psf"),
            func.max(Transaction.psf).label("max_psf"),
            func.sum(Transaction.price).label("total_value"),
            func.percentile_cont(0.5).within_group(Transaction.price).label("median_price")
        ).filter(
            and_(*filter_conditions)
        ).first()

        # Get bedroom breakdown
        bedroom_breakdown = db.session.query(
            Transaction.bedroom_count,
            func.count(Transaction.id).label("count"),
            func.percentile_cont(0.5).within_group(Transaction.psf).label("median_psf")
        ).filter(
            and_(*filter_conditions)
        ).group_by(
            Transaction.bedroom_count
        ).order_by(
            Transaction.bedroom_count
        ).all()

        # Get top projects
        top_projects = db.session.query(
            Transaction.project_name,
            func.count(Transaction.id).label("tx_count"),
            func.percentile_cont(0.5).within_group(Transaction.psf).label("median_psf")
        ).filter(
            and_(*filter_conditions)
        ).group_by(
            Transaction.project_name
        ).order_by(
            func.count(Transaction.id).desc()
        ).limit(5).all()

        # Get region
        if district in CCR_DISTRICTS:
            region = "CCR"
        elif district in RCR_DISTRICTS:
            region = "RCR"
        else:
            region = "OCR"

        elapsed = time.time() - start

        return jsonify({
            "district_id": district,
            "name": DISTRICT_NAMES.get(district, district),
            "region": region,
            "stats": {
                "tx_count": stats.tx_count if stats else 0,
                "median_psf": round(stats.median_psf, 0) if stats and stats.median_psf else None,
                "psf_25th": round(stats.psf_25th, 0) if stats and stats.psf_25th else None,
                "psf_75th": round(stats.psf_75th, 0) if stats and stats.psf_75th else None,
                "min_psf": round(stats.min_psf, 0) if stats and stats.min_psf else None,
                "max_psf": round(stats.max_psf, 0) if stats and stats.max_psf else None,
                "total_value": round(stats.total_value, 0) if stats and stats.total_value else None,
                "median_price": round(stats.median_price, 0) if stats and stats.median_price else None,
            },
            "bedroom_breakdown": [
                {
                    "bedroom": row.bedroom_count,
                    "count": row.count,
                    "median_psf": round(row.median_psf, 0) if row.median_psf else None
                }
                for row in bedroom_breakdown
            ],
            "top_projects": [
                {
                    "name": row.project_name,
                    "tx_count": row.tx_count,
                    "median_psf": round(row.median_psf, 0) if row.median_psf else None
                }
                for row in top_projects
            ],
            "meta": {
                "period": period,
                "bed_filter": bed_filter,
                "elapsed_ms": int(elapsed * 1000)
            }
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/insights/district-summary ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
