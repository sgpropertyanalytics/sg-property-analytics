"""
Projects API Routes - Project locations and inventory analytics

Endpoints:
- GET /api/projects/locations - List all project locations with geocoding status
"""

from flask import Blueprint, jsonify, g
from sqlalchemy import func
import time
from models.project_location import ProjectLocation
from models.popular_school import PopularSchool
from models.database import db
from constants import DISTRICT_NAMES, SALE_TYPE_NEW, SALE_TYPE_RESALE
from services.school_distance import get_schools_within_distance
from db.sql import OUTLIER_FILTER, exclude_outliers, get_outlier_filter_sql
from utils.normalize import (
    to_int,
    ValidationError as NormalizeValidationError, validation_error_response
)

projects_bp = Blueprint('projects', __name__)

# Import contract versioning for HTTP header
from api.contracts.contract_schema import API_CONTRACT_HEADER, CURRENT_API_CONTRACT_VERSION
from api.contracts.wrapper import api_contract


@projects_bp.after_request
def add_contract_version_header(response):
    """Add X-API-Contract-Version header to all project responses."""
    response.headers[API_CONTRACT_HEADER] = CURRENT_API_CONTRACT_VERSION
    return response


@projects_bp.route("/projects/locations", methods=["GET"])
@api_contract("projects/locations")
def get_project_locations():
    """
    Get list of all project locations with geocoding status.

    Query params (normalized by Pydantic via @api_contract):
        - status: filter by geocode_status (pending, success, failed)
        - district: filter by district
        - segment: filter by market segment
        - has_school: filter by school flag (true/false)
        - search: search by project name
        - limit: max results (default 100)
        - offset: pagination offset (default 0)

    Returns:
        {
            "projects": [...],
            "pagination": {...},
            "summary": {...}
        }
    """
    start = time.time()

    try:
        # Use normalized params from Pydantic (via @api_contract decorator)
        params = g.normalized_params

        # Build query
        query = db.session.query(ProjectLocation)

        # Status filter
        status = params.get("status")
        if status:
            query = query.filter(ProjectLocation.geocode_status == status)

        # District filter (already normalized to list by Pydantic)
        districts = params.get("districts") or []
        if districts:
            query = query.filter(ProjectLocation.district.in_(districts))

        # Segment filter (Pydantic normalizes 'segment' → 'segments')
        segments = params.get("segments")
        segment = segments[0] if segments else None
        if segment:
            query = query.filter(ProjectLocation.market_segment == segment.upper())

        # School filter
        has_school = params.get("has_school")
        if has_school is not None:
            query = query.filter(ProjectLocation.has_popular_school_1km == has_school)

        # Search filter
        search = params.get("search")
        if search:
            query = query.filter(ProjectLocation.project_name.ilike(func.concat("%", search, "%")))

        # Get total count
        total_count = query.count()

        # Pagination (already normalized by Pydantic)
        limit = params.get("limit", 100)
        offset = params.get("offset", 0)

        projects = query.order_by(ProjectLocation.project_name).offset(offset).limit(limit).all()

        # Get summary stats
        summary_query = db.session.query(
            db.func.count(ProjectLocation.id).label('total'),
            db.func.sum(db.case((ProjectLocation.geocode_status == 'success', 1), else_=0)).label('geocoded'),
            db.func.sum(db.case((ProjectLocation.geocode_status == 'failed', 1), else_=0)).label('failed'),
            db.func.sum(db.case((ProjectLocation.geocode_status == 'pending', 1), else_=0)).label('pending'),
            db.func.sum(db.case((ProjectLocation.has_popular_school_1km == True, 1), else_=0)).label('with_school')
        ).first()

        result = {
            "projects": [p.to_dict() for p in projects],
            "pagination": {
                "total": total_count,
                "limit": limit,
                "offset": offset,
                "has_more": offset + limit < total_count
            },
            "summary": {
                "total": summary_query.total or 0,
                "geocoded": summary_query.geocoded or 0,
                "failed": summary_query.failed or 0,
                "pending": summary_query.pending or 0,
                "with_school": summary_query.with_school or 0
            }
        }

        elapsed = time.time() - start
        print(f"GET /api/projects/locations took: {elapsed:.4f} seconds")

        return jsonify(result)

    except Exception as e:
        print(f"GET /api/projects/locations ERROR: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


# District to Region mapping
DISTRICT_TO_REGION = {
    'D01': 'Central', 'D02': 'Central', 'D03': 'Central', 'D04': 'Central',
    'D05': 'West', 'D06': 'Central', 'D07': 'Central', 'D08': 'Central',
    'D09': 'Central', 'D10': 'Central', 'D11': 'Central', 'D12': 'Central',
    'D13': 'Central', 'D14': 'East', 'D15': 'East', 'D16': 'East',
    'D17': 'East', 'D18': 'East', 'D19': 'North-East', 'D20': 'North',
    'D21': 'Central', 'D22': 'West', 'D23': 'West', 'D24': 'West',
    'D25': 'North', 'D26': 'North', 'D27': 'North', 'D28': 'North-East',
}


@projects_bp.route("/projects/hot", methods=["GET"])
@api_contract("projects/hot")
def get_hot_projects():
    """
    Get ACTIVE NEW SALES projects - projects with New Sale transactions but NO resales yet.

    SEMANTIC CLARIFICATION:
    - "Active New Sales" = Projects that have ALREADY LAUNCHED and are selling
    - Only shows projects with ZERO resale transactions (true new launches)
    - Once a project has any resale, it's no longer a "new launch"

    Data Sources:
    - units_sold: COUNT(transactions WHERE sale_type='New Sale') - DETERMINISTIC
    - total_units: Static JSON file (new_launch_units.json) - AUTHORITATIVE
    - has_popular_school: from project_locations table

    Calculation:
    - percent_sold = (units_sold / total_units) * 100
    - unsold_inventory = total_units - units_sold

    Query params:
        - market_segment: filter by CCR, RCR, OCR (alias: region)
        - district: filter by district (comma-separated)
        - bedroom: filter by bedroom count (1-5)
        - price_min: minimum median price filter
        - price_max: maximum median price filter
        - limit: max results (default 100)

    Returns:
        {
            "projects": [...],
            "total_count": N,
            "last_updated": "2025-12-21T00:00:00Z"
        }
    """
    start = time.time()

    try:
        from models.transaction import Transaction
        from services.new_launch_units import get_units_for_project
        from sqlalchemy import func, case, text, literal_column
        from constants import get_region_for_district, get_districts_for_region

        normalized_params = getattr(g, "normalized_params", {}) or {}

        # Get filter params
        limit = normalized_params.get("limit") or 100

        # Filter params
        market_segment = normalized_params.get("market_segment")
        districts = normalized_params.get("districts") or []
        bedrooms = normalized_params.get("bedrooms") or []
        price_min = normalized_params.get("price_min")
        price_max = normalized_params.get("price_max")

        # Build param-guarded filters (static SQL with NULL checks).
        # IMPORTANT: units_sold is a HARD FACT - total confirmed New Sale transactions
        # It should NOT be affected by bedroom/district/segment filters
        # Filters only affect: which projects are shown, and median_price/psf calculations
        sql_params = {
            "limit": limit,
            "sale_type_new": SALE_TYPE_NEW,
            "sale_type_resale": SALE_TYPE_RESALE,
            "bedroom_exact": None,
            "bedroom_min": None,
            "districts": None,
            "segment_districts": None,
            "price_min": None,
            "price_max": None,
        }

        # Bedroom filter - affects which projects are shown (must have sales in this bedroom type)
        # but does NOT affect the units_sold count
        if bedrooms:
            bedroom_values = []
            for item in bedrooms:
                if isinstance(item, str) and "," in item:
                    bedroom_values.extend([v.strip() for v in item.split(",") if v.strip()])
                else:
                    bedroom_values.append(item)
            bedroom_val = bedroom_values[0] if bedroom_values else None
            try:
                bedroom_val = int(bedroom_val) if bedroom_val is not None else None
            except (TypeError, ValueError):
                bedroom_val = None
            if bedroom_val is not None:
                if bedroom_val >= 4:
                    sql_params["bedroom_min"] = bedroom_val
                else:
                    sql_params["bedroom_exact"] = bedroom_val

        # District filter - can be comma-separated
        if districts:
            normalized = []
            for d in districts:
                d = str(d).strip().upper()
                if not d.startswith("D"):
                    d = f"D{d.zfill(2)}"
                normalized.append(d)
            if normalized:
                sql_params["districts"] = normalized

        # Market segment (region) filter - expand to districts
        if market_segment and market_segment.upper() in ('CCR', 'RCR', 'OCR'):
            segment_districts = get_districts_for_region(market_segment.upper())
            if segment_districts:
                sql_params["segment_districts"] = segment_districts

        # Price filters - applied in outer query on median_price
        if price_min:
            try:
                sql_params["price_min"] = float(price_min)
            except ValueError:
                pass

        if price_max:
            try:
                sql_params["price_max"] = float(price_max)
            except ValueError:
                pass

        # Query with TWO CTEs:
        # 1. total_project_sales: UNFILTERED units_sold (HARD FACT - confirmed transactions)
        # 2. filtered_stats: Filtered median_price/psf for relevance + determines which projects to show
        sql = text("""
            WITH total_project_sales AS (
                -- HARD FACT: Total confirmed New Sale transactions per project
                -- This count is NEVER affected by bedroom/district/segment filters
                SELECT
                    t.project_name,
                    t.district,
                    COUNT(*) as units_sold,
                    SUM(t.price) as total_value,
                    MIN(t.transaction_date) as first_new_sale,
                    MAX(t.transaction_date) as last_new_sale
                FROM transactions t
                WHERE COALESCE(t.is_outlier, false) = false
                  AND t.sale_type = :sale_type_new
                GROUP BY t.project_name, t.district
            ),
            resale_project_sales AS (
                -- Resale presence across the full project (unfiltered)
                SELECT
                    t.project_name,
                    t.district,
                    COUNT(*) as resale_count
                FROM transactions t
                WHERE COALESCE(t.is_outlier, false) = false
                  AND t.sale_type = :sale_type_resale
                GROUP BY t.project_name, t.district
            ),
            filtered_stats AS (
                -- Filtered stats: median_price/psf based on user filters
                -- Also determines which projects to show (must have matching transactions)
                SELECT
                    t.project_name,
                    t.district,
                    COUNT(CASE WHEN t.sale_type = :sale_type_new THEN 1 END) as filtered_count,
                    AVG(CASE WHEN t.sale_type = :sale_type_new THEN t.psf END) as avg_psf,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CASE WHEN t.sale_type = :sale_type_new THEN t.price END) as median_price,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CASE WHEN t.sale_type = :sale_type_new THEN t.psf END) as median_psf
                FROM transactions t
                WHERE COALESCE(t.is_outlier, false) = false
                  AND (
                    (:bedroom_exact IS NULL AND :bedroom_min IS NULL)
                    OR (:bedroom_exact IS NOT NULL AND t.bedroom_count = :bedroom_exact)
                    OR (:bedroom_min IS NOT NULL AND t.bedroom_count >= :bedroom_min)
                  )
                  AND (:districts IS NULL OR t.district = ANY(:districts))
                  AND (:segment_districts IS NULL OR t.district = ANY(:segment_districts))
                GROUP BY t.project_name, t.district
                HAVING COUNT(CASE WHEN t.sale_type = :sale_type_new THEN 1 END) > 0
            )
            SELECT
                tps.project_name,
                tps.district,
                tps.units_sold,
                tps.total_value,
                fs.avg_psf,
                fs.median_price,
                fs.median_psf,
                tps.first_new_sale,
                tps.last_new_sale,
                pl.has_popular_school_1km,
                pl.market_segment,
                pl.latitude,
                pl.longitude
            FROM total_project_sales tps
            INNER JOIN filtered_stats fs
                ON tps.project_name = fs.project_name AND tps.district = fs.district
            LEFT JOIN resale_project_sales rps
                ON tps.project_name = rps.project_name AND tps.district = rps.district
            LEFT JOIN project_locations pl
                ON LOWER(TRIM(tps.project_name)) = LOWER(TRIM(pl.project_name))
            WHERE (:price_min IS NULL OR fs.median_price >= :price_min)
              AND (:price_max IS NULL OR fs.median_price <= :price_max)
              AND COALESCE(rps.resale_count, 0) = 0
            ORDER BY tps.units_sold DESC
            LIMIT :limit
        """)

        # Pre-load all school data for nearby school lookup
        schools = db.session.query(
            PopularSchool.school_name,
            PopularSchool.latitude,
            PopularSchool.longitude
        ).filter(
            PopularSchool.latitude.isnot(None),
            PopularSchool.longitude.isnot(None)
        ).all()
        school_data = [
            (s.school_name, float(s.latitude), float(s.longitude))
            for s in schools
        ]

        results = db.session.execute(sql, sql_params).fetchall()

        # Format response - use JSON lookup for total_units
        projects = []
        for row in results:
            district = row.district or ''
            market_seg = row.market_segment or get_region_for_district(district)
            units_sold = row.units_sold or 0

            # Lookup total_units and developer from static CSV file (runtime lookup, no DB)
            lookup = get_units_for_project(row.project_name)
            total_units = lookup.get("total_units") or 0
            developer = lookup.get("developer") or None

            # Calculate percent_sold and unsold if total_units available
            # Flag data discrepancy when units_sold > total_units (indicates URA data issues)
            data_discrepancy = False
            if total_units > 0:
                if units_sold > total_units:
                    # Data discrepancy: more transactions than official units
                    # This could be due to sub-sales, serviced apartments, or URA data issues
                    data_discrepancy = True
                    percent_sold = 100.0  # Cap at 100%
                    unsold_inventory = 0  # No unsold units known
                else:
                    percent_sold = round((units_sold * 100.0 / total_units), 1)
                    unsold_inventory = total_units - units_sold
            else:
                # No total_units data - can't calculate percent
                percent_sold = None
                unsold_inventory = None

            # Get nearby schools if project has coordinates and school flag
            nearby_schools = []
            if row.has_popular_school_1km and row.latitude and row.longitude:
                try:
                    nearby_schools = get_schools_within_distance(
                        float(row.latitude),
                        float(row.longitude),
                        school_data
                    )
                except (ValueError, TypeError):
                    nearby_schools = []

            # Get district name from constants
            district_name = DISTRICT_NAMES.get(district, '')

            projects.append({
                "project_name": row.project_name,
                "developer": developer,
                "region": DISTRICT_TO_REGION.get(district, None),
                "district": district,
                "district_name": district_name,
                "market_segment": market_seg,
                "total_units": total_units if total_units > 0 else None,
                "units_sold": units_sold,
                "percent_sold": percent_sold,
                "unsold_inventory": unsold_inventory,
                "data_discrepancy": data_discrepancy,  # True if units_sold > total_units
                "total_value": float(row.total_value) if row.total_value else 0,
                "avg_psf": round(float(row.avg_psf), 2) if row.avg_psf else 0,
                "median_price": round(float(row.median_price)) if row.median_price else None,
                "median_psf": round(float(row.median_psf), 2) if row.median_psf else None,
                "has_popular_school": row.has_popular_school_1km or False,
                "nearby_schools": nearby_schools,  # List of school names within 1km
                "first_new_sale": row.first_new_sale.isoformat() if row.first_new_sale else None,
                "last_new_sale": row.last_new_sale.isoformat() if row.last_new_sale else None,
            })

        # SECURITY: Mask sensitive data for free users
        from utils.subscription import is_premium_user
        if not is_premium_user():
            for i, proj in enumerate(projects, 1):
                # Mask project name and developer
                proj['project_name'] = f"{proj['district']} New Launch #{i}"
                proj['developer'] = None
                # Mask price values to ranges
                if proj['median_price']:
                    mp = proj['median_price']
                    if mp < 1000000:
                        proj['median_price'] = f"${int(mp // 100000) * 100}K - ${int(mp // 100000 + 1) * 100}K"
                    elif mp < 5000000:
                        lower = int(mp / 1000000 * 2) / 2
                        proj['median_price'] = f"${lower:.1f}M - ${lower + 0.5:.1f}M"
                    else:
                        lower = int(mp / 1000000)
                        proj['median_price'] = f"${lower}M - ${lower + 1}M"
                # Mask PSF to ranges
                if proj['median_psf']:
                    lower = int(proj['median_psf'] // 500) * 500
                    proj['median_psf'] = f"${lower:,} - ${lower + 500:,}"
                if proj['avg_psf']:
                    lower = int(proj['avg_psf'] // 500) * 500
                    proj['avg_psf'] = f"${lower:,} - ${lower + 500:,}"
                # Mask total value
                if proj['total_value']:
                    proj['total_value'] = None
                # Mark as teaser data
                proj['_is_teaser'] = True

        # Sort by units_sold descending (most active first)
        projects.sort(key=lambda x: -x['units_sold'])

        from datetime import datetime
        result = {
            "projects": projects,
            "total_count": len(projects),
            "filters_applied": {
                "limit": limit,
                "market_segment": market_segment,
                "district": districts,
                "bedroom": bedrooms,
                "price_min": price_min,
                "price_max": price_max,
            },
            "data_note": "Only shows projects with New Sale transactions and ZERO resales (true new launches). " +
                        "Projects without total_units data show N/A for % sold.",
            "last_updated": datetime.utcnow().isoformat() + "Z"
        }

        elapsed = time.time() - start
        print(f"GET /api/projects/hot took: {elapsed:.4f} seconds (returned {len(projects)} projects)")

        return jsonify(result)

    except Exception as e:
        print(f"GET /api/projects/hot ERROR: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@projects_bp.route("/projects/inventory/status", methods=["GET"])
@api_contract("projects/inventory-status")
def get_inventory_status():
    """
    Get inventory data coverage status.

    Shows how many projects have total_units data in rawdata/new_launch_units.csv
    """
    import time
    start = time.time()

    try:
        from models.transaction import Transaction
        from services.new_launch_units import get_units_for_project, list_all_projects
        from sqlalchemy import func

        # Count projects with New Sale transactions
        new_sale_projects = db.session.query(
            func.distinct(Transaction.project_name)
        ).filter(
            Transaction.sale_type == SALE_TYPE_NEW,
            exclude_outliers(Transaction)
        ).all()

        total_with_sales = len(new_sale_projects)

        # Check how many have data in CSV
        projects_with_data = 0
        projects_missing = []
        for (project_name,) in new_sale_projects:
            lookup = get_units_for_project(project_name)
            if lookup.get("total_units"):
                projects_with_data += 1
            else:
                projects_missing.append(project_name)

        coverage = (projects_with_data / total_with_sales * 100) if total_with_sales > 0 else 0

        elapsed = time.time() - start

        return jsonify({
            "total_projects_with_new_sales": total_with_sales,
            "projects_with_inventory": projects_with_data,
            "projects_missing_inventory": len(projects_missing),
            "coverage_percent": round(coverage, 1),
            "csv_file": "backend/data/new_launch_units.csv",
            "top_missing": projects_missing[:10],
            "elapsed_seconds": round(elapsed, 2)
        })

    except Exception as e:
        print(f"GET /api/projects/inventory/status ERROR: {e}")
        return jsonify({"error": str(e)}), 500


# --- Admin endpoints ---
@projects_bp.route("/projects/compute-school-flags", methods=["POST"])
def compute_school_flags():
    """
    Compute has_popular_school_1km flag for all geocoded projects.

    This endpoint triggers the computation of school proximity flags
    for all projects that have been successfully geocoded.

    Returns:
        {
            "status": "completed",
            "stats": {
                "updated": N,
                "with_school": N,
                "without_school": N,
                "skipped": N
            }
        }
    """
    import time
    start = time.time()

    try:
        from flask import current_app
        from services.school_distance import compute_school_flags_batch

        # Run the batch computation
        stats = compute_school_flags_batch(current_app._get_current_object())

        elapsed = time.time() - start

        return jsonify({
            "status": "completed",
            "stats": stats,
            "elapsed_seconds": round(elapsed, 2),
            "message": f"Updated {stats['updated']} projects. {stats['with_school']} have popular school within 1km."
        })

    except Exception as e:
        print(f"POST /api/projects/compute-school-flags ERROR: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
