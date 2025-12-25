"""
Projects API Routes - Project locations and school proximity

Endpoints:
- GET /api/projects/<project_name>/school-flag - Get school proximity flag for a project
- GET /api/projects/with-school - List projects with popular school within 1km
- GET /api/projects/locations - List all project locations with geocoding status
- GET /api/schools - List all popular schools
"""

from flask import Blueprint, request, jsonify
import time
from models.project_location import ProjectLocation
from models.popular_school import PopularSchool
from models.database import db
from constants import DISTRICT_NAMES
from services.school_distance import get_schools_within_distance
from db.sql import OUTLIER_FILTER, exclude_outliers, get_outlier_filter_sql

projects_bp = Blueprint('projects', __name__)


@projects_bp.route("/projects/<path:project_name>/school-flag", methods=["GET"])
def get_project_school_flag(project_name: str):
    """
    Get school proximity flag for a specific project.

    Returns:
        {
            "project_name": "The Continuum",
            "has_popular_school_1km": true,
            "geocode_status": "success",
            "district": "D15",
            "market_segment": "RCR"
        }
    """
    start = time.time()

    try:
        project = db.session.query(ProjectLocation).filter(
            ProjectLocation.project_name == project_name
        ).first()

        if not project:
            return jsonify({
                "error": "Project not found",
                "project_name": project_name
            }), 404

        result = {
            "project_name": project.project_name,
            "has_popular_school_1km": project.has_popular_school_1km,
            "geocode_status": project.geocode_status,
            "district": project.district,
            "market_segment": project.market_segment
        }

        elapsed = time.time() - start
        print(f"GET /api/projects/{project_name}/school-flag took: {elapsed:.4f} seconds")

        return jsonify(result)

    except Exception as e:
        print(f"GET /api/projects/{project_name}/school-flag ERROR: {e}")
        return jsonify({"error": str(e)}), 500


@projects_bp.route("/projects/with-school", methods=["GET"])
def get_projects_with_school():
    """
    Get list of projects with popular school within 1km.

    Query params:
        - district: filter by district (comma-separated, e.g., D09,D10)
        - segment: filter by market segment (CCR, RCR, OCR)
        - limit: max results (default 100)

    Returns:
        {
            "projects": [...],
            "count": N,
            "filters_applied": {...}
        }
    """
    start = time.time()

    try:
        # Build query
        query = db.session.query(ProjectLocation).filter(
            ProjectLocation.has_popular_school_1km == True
        )

        filters_applied = {}

        # District filter
        districts_param = request.args.get("district")
        if districts_param:
            districts = [d.strip().upper() for d in districts_param.split(",") if d.strip()]
            normalized = []
            for d in districts:
                if not d.startswith("D"):
                    d = f"D{d.zfill(2)}"
                normalized.append(d)
            query = query.filter(ProjectLocation.district.in_(normalized))
            filters_applied["district"] = normalized

        # Segment filter
        segment = request.args.get("segment")
        if segment:
            query = query.filter(ProjectLocation.market_segment == segment.upper())
            filters_applied["segment"] = segment.upper()

        # Limit
        limit = int(request.args.get("limit", 100))

        # Execute query
        projects = query.order_by(ProjectLocation.project_name).limit(limit).all()

        result = {
            "projects": [p.to_dict() for p in projects],
            "count": len(projects),
            "filters_applied": filters_applied
        }

        elapsed = time.time() - start
        print(f"GET /api/projects/with-school took: {elapsed:.4f} seconds (returned {len(projects)} projects)")

        return jsonify(result)

    except Exception as e:
        print(f"GET /api/projects/with-school ERROR: {e}")
        return jsonify({"error": str(e)}), 500


@projects_bp.route("/projects/locations", methods=["GET"])
def get_project_locations():
    """
    Get list of all project locations with geocoding status.

    Query params:
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
        # Build query
        query = db.session.query(ProjectLocation)

        # Status filter
        status = request.args.get("status")
        if status:
            query = query.filter(ProjectLocation.geocode_status == status)

        # District filter
        districts_param = request.args.get("district")
        if districts_param:
            districts = [d.strip().upper() for d in districts_param.split(",") if d.strip()]
            normalized = []
            for d in districts:
                if not d.startswith("D"):
                    d = f"D{d.zfill(2)}"
                normalized.append(d)
            query = query.filter(ProjectLocation.district.in_(normalized))

        # Segment filter
        segment = request.args.get("segment")
        if segment:
            query = query.filter(ProjectLocation.market_segment == segment.upper())

        # School filter
        has_school = request.args.get("has_school")
        if has_school:
            if has_school.lower() == 'true':
                query = query.filter(ProjectLocation.has_popular_school_1km == True)
            elif has_school.lower() == 'false':
                query = query.filter(ProjectLocation.has_popular_school_1km == False)

        # Search filter
        search = request.args.get("search")
        if search:
            query = query.filter(ProjectLocation.project_name.ilike(f"%{search}%"))

        # Get total count
        total_count = query.count()

        # Pagination
        limit = int(request.args.get("limit", 100))
        offset = int(request.args.get("offset", 0))

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


@projects_bp.route("/projects/school-flags", methods=["GET"])
def get_school_flags_batch():
    """
    Get school flags for multiple projects at once.

    Query params:
        - projects: comma-separated project names

    Returns:
        {
            "flags": {
                "Project A": true,
                "Project B": false,
                "Project C": null  // not found or not computed
            }
        }
    """
    start = time.time()

    try:
        projects_param = request.args.get("projects", "")
        if not projects_param:
            return jsonify({"error": "projects parameter required"}), 400

        project_names = [p.strip() for p in projects_param.split(",") if p.strip()]

        if len(project_names) > 100:
            return jsonify({"error": "Maximum 100 projects per request"}), 400

        # Query all projects at once
        projects = db.session.query(
            ProjectLocation.project_name,
            ProjectLocation.has_popular_school_1km
        ).filter(
            ProjectLocation.project_name.in_(project_names)
        ).all()

        # Build result dict
        flags = {}
        for p in projects:
            flags[p.project_name] = p.has_popular_school_1km

        # Add None for projects not found
        for name in project_names:
            if name not in flags:
                flags[name] = None

        elapsed = time.time() - start
        print(f"GET /api/projects/school-flags took: {elapsed:.4f} seconds ({len(project_names)} projects)")

        return jsonify({"flags": flags})

    except Exception as e:
        print(f"GET /api/projects/school-flags ERROR: {e}")
        return jsonify({"error": str(e)}), 500


@projects_bp.route("/schools", methods=["GET"])
def get_schools():
    """
    Get list of all popular schools.

    Returns:
        {
            "schools": [...],
            "count": N
        }
    """
    start = time.time()

    try:
        schools = db.session.query(PopularSchool).order_by(PopularSchool.school_name).all()

        result = {
            "schools": [s.to_dict() for s in schools],
            "count": len(schools)
        }

        elapsed = time.time() - start
        print(f"GET /api/schools took: {elapsed:.4f} seconds")

        return jsonify(result)

    except Exception as e:
        print(f"GET /api/schools ERROR: {e}")
        return jsonify({"error": str(e)}), 500


@projects_bp.route("/schools/<int:school_id>", methods=["GET"])
def get_school(school_id: int):
    """Get a specific school by ID"""
    try:
        school = db.session.query(PopularSchool).get(school_id)

        if not school:
            return jsonify({"error": "School not found"}), 404

        return jsonify(school.to_dict())

    except Exception as e:
        print(f"GET /api/schools/{school_id} ERROR: {e}")
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

        # Get filter params
        limit = int(request.args.get("limit", 100))

        # Filter params
        market_segment = request.args.get("market_segment") or request.args.get("region")
        district_param = request.args.get("district")
        bedroom = request.args.get("bedroom")
        price_min = request.args.get("price_min")
        price_max = request.args.get("price_max")

        # Build dynamic WHERE clauses
        # IMPORTANT: units_sold is a HARD FACT - total confirmed New Sale transactions
        # It should NOT be affected by bedroom/district/segment filters
        # Filters only affect: which projects are shown, and median_price/psf calculations

        # Base clause for all queries (outlier exclusion is always applied)
        base_where = get_outlier_filter_sql('t')

        # Filter clauses - affect project visibility and median calculations, NOT units_sold
        filter_clauses = []
        outer_where_clauses = []
        params = {"limit": limit}

        # Bedroom filter - affects which projects are shown (must have sales in this bedroom type)
        # but does NOT affect the units_sold count
        if bedroom:
            try:
                bedroom_val = int(bedroom)
                if bedroom_val >= 4:
                    filter_clauses.append(f"t.bedroom_count >= {bedroom_val}")
                else:
                    filter_clauses.append("t.bedroom_count = :bedroom")
                    params["bedroom"] = bedroom_val
            except ValueError:
                pass

        # District filter - can be comma-separated
        if district_param:
            districts = [d.strip().upper() for d in district_param.split(",") if d.strip()]
            normalized = []
            for d in districts:
                if not d.startswith("D"):
                    d = f"D{d.zfill(2)}"
                normalized.append(d)
            if normalized:
                placeholders = ", ".join([f":district_{i}" for i in range(len(normalized))])
                filter_clauses.append(f"t.district IN ({placeholders})")
                for i, d in enumerate(normalized):
                    params[f"district_{i}"] = d

        # Market segment (region) filter - expand to districts
        if market_segment and market_segment.upper() in ('CCR', 'RCR', 'OCR'):
            segment_districts = get_districts_for_region(market_segment.upper())
            if segment_districts:
                placeholders = ", ".join([f":seg_district_{i}" for i in range(len(segment_districts))])
                filter_clauses.append(f"t.district IN ({placeholders})")
                for i, d in enumerate(segment_districts):
                    params[f"seg_district_{i}"] = d

        # Price filters - applied in outer query on median_price
        if price_min:
            try:
                outer_where_clauses.append("fs.median_price >= :price_min")
                params["price_min"] = float(price_min)
            except ValueError:
                pass

        if price_max:
            try:
                outer_where_clauses.append("fs.median_price <= :price_max")
                params["price_max"] = float(price_max)
            except ValueError:
                pass

        # Build SQL components
        filter_where_sql = " AND ".join([base_where] + filter_clauses) if filter_clauses else base_where
        outer_where_sql = " AND ".join(outer_where_clauses) if outer_where_clauses else "1=1"

        # Query with TWO CTEs:
        # 1. total_project_sales: UNFILTERED units_sold (HARD FACT - confirmed transactions)
        # 2. filtered_stats: Filtered median_price/psf for relevance + determines which projects to show
        sql = text(f"""
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
                WHERE {get_outlier_filter_sql('t')}
                  AND t.sale_type = 'New Sale'
                GROUP BY t.project_name, t.district
            ),
            filtered_stats AS (
                -- Filtered stats: median_price/psf based on user filters
                -- Also determines which projects to show (must have matching transactions)
                SELECT
                    t.project_name,
                    t.district,
                    COUNT(CASE WHEN t.sale_type = 'New Sale' THEN 1 END) as filtered_count,
                    COUNT(CASE WHEN t.sale_type = 'Resale' THEN 1 END) as resale_count,
                    AVG(CASE WHEN t.sale_type = 'New Sale' THEN t.psf END) as avg_psf,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CASE WHEN t.sale_type = 'New Sale' THEN t.price END) as median_price,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY CASE WHEN t.sale_type = 'New Sale' THEN t.psf END) as median_psf
                FROM transactions t
                WHERE {filter_where_sql}
                GROUP BY t.project_name, t.district
                HAVING COUNT(CASE WHEN t.sale_type = 'New Sale' THEN 1 END) > 0
                   AND COUNT(CASE WHEN t.sale_type = 'Resale' THEN 1 END) = 0
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
            LEFT JOIN project_locations pl
                ON LOWER(TRIM(tps.project_name)) = LOWER(TRIM(pl.project_name))
            WHERE {outer_where_sql}
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

        results = db.session.execute(sql, params).fetchall()

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
                "district": district_param,
                "bedroom": bedroom,
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
            Transaction.sale_type == 'New Sale',
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
