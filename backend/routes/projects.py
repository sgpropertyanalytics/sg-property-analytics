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
from sqlalchemy import or_

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
    - total_units: project_inventory.total_units (from URA API or manual) - AUTHORITATIVE
    - has_popular_school: from project_locations table

    Calculation:
    - percent_sold = (units_sold / total_units) * 100
    - unsold_inventory = total_units - units_sold

    Query params:
        - market_segment: filter by CCR, RCR, OCR
        - district: filter by district (comma-separated)
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
        from models.project_inventory import ProjectInventory
        from sqlalchemy import func, case, text, literal_column
        from constants import get_region_for_district

        # Get filter params
        limit = int(request.args.get("limit", 100))

        # Query: Get projects with New Sale transactions but NO resales
        # This ensures we only show true "new launches" - projects still in developer sales phase
        sql = text("""
            WITH project_stats AS (
                SELECT
                    t.project_name,
                    t.district,
                    COUNT(CASE WHEN t.sale_type = 'New Sale' THEN 1 END) as units_sold,
                    COUNT(CASE WHEN t.sale_type = 'Resale' THEN 1 END) as resale_count,
                    SUM(CASE WHEN t.sale_type = 'New Sale' THEN t.price ELSE 0 END) as total_value,
                    AVG(CASE WHEN t.sale_type = 'New Sale' THEN t.psf END) as avg_psf,
                    MAX(CASE WHEN t.sale_type = 'New Sale' THEN t.transaction_date END) as last_new_sale
                FROM transactions t
                WHERE t.is_outlier = false
                GROUP BY t.project_name, t.district
                HAVING COUNT(CASE WHEN t.sale_type = 'New Sale' THEN 1 END) > 0
                   AND COUNT(CASE WHEN t.sale_type = 'Resale' THEN 1 END) = 0
            )
            SELECT
                ps.project_name,
                ps.district,
                ps.units_sold,
                ps.total_value,
                ps.avg_psf,
                ps.last_new_sale,
                pi.total_units,
                pi.units_available as unsold_inventory_ura,
                pl.has_popular_school_1km,
                pl.market_segment
            FROM project_stats ps
            LEFT JOIN project_inventory pi ON LOWER(TRIM(ps.project_name)) = LOWER(TRIM(pi.project_name))
            LEFT JOIN project_locations pl ON LOWER(TRIM(ps.project_name)) = LOWER(TRIM(pl.project_name))
            ORDER BY ps.units_sold DESC
            LIMIT :limit
        """)

        results = db.session.execute(sql, {"limit": limit}).fetchall()

        # Format response
        projects = []
        for row in results:
            district = row.district or ''
            market_seg = row.market_segment or get_region_for_district(district)
            units_sold = row.units_sold or 0
            total_units = row.total_units or 0

            # Calculate percent_sold and unsold if total_units available
            if total_units > 0:
                percent_sold = round((units_sold * 100.0 / total_units), 1)
                # Cap percent_sold at 100% (in case more units sold than total due to data issues)
                percent_sold = min(percent_sold, 100.0)
                unsold_inventory = max(0, total_units - units_sold)
            else:
                # No total_units data - can't calculate percent
                percent_sold = None
                unsold_inventory = None

            projects.append({
                "project_name": row.project_name,
                "region": DISTRICT_TO_REGION.get(district, None),
                "district": district,
                "market_segment": market_seg,
                "total_units": total_units if total_units > 0 else None,
                "units_sold": units_sold,
                "percent_sold": percent_sold,
                "unsold_inventory": unsold_inventory,
                "total_value": float(row.total_value) if row.total_value else 0,
                "avg_psf": round(float(row.avg_psf), 2) if row.avg_psf else 0,
                "has_popular_school": row.has_popular_school_1km or False,
                "last_new_sale": row.last_new_sale.isoformat() if row.last_new_sale else None,
            })

        # Sort by units_sold descending (most active first)
        projects.sort(key=lambda x: -x['units_sold'])

        from datetime import datetime
        result = {
            "projects": projects,
            "total_count": len(projects),
            "filters_applied": {
                "limit": limit,
                "market_segment": request.args.get("market_segment"),
                "district": request.args.get("district"),
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


# =============================================================================
# INVENTORY SCRAPING ENDPOINTS
# =============================================================================

@projects_bp.route("/projects/inventory/scrape", methods=["POST"])
def scrape_project_inventory():
    """
    Scrape total_units for a specific project from 10 sources.

    This uses project_scraper.py to cross-validate data from:
    EdgeProp, 99.co, PropertyGuru, SRX, PropNex, ERA, Huttons, OrangeTee, ST Property, URA

    Query params:
        - project_name: Project name to scrape (required)
        - save: If 'true', save to project_inventory table (default: false)

    Returns:
        {
            "project_name": "...",
            "total_units": N,
            "confidence": "high|medium|low|none",
            "sources": ["EdgeProp", "99.co", ...],
            "discrepancies": [...]
        }
    """
    import time
    start = time.time()

    project_name = request.args.get("project_name")
    if not project_name:
        return jsonify({"error": "project_name parameter required"}), 400

    save = request.args.get("save", "").lower() == "true"

    try:
        from services.property_scraper import PropertyScraper

        scraper = PropertyScraper()

        if save:
            result = scraper.scrape_and_save(project_name)
        else:
            validated = scraper.scrape_project(project_name)
            result = {
                "project_name": validated.project_name,
                "total_units": validated.total_units,
                "confidence": validated.total_units_confidence,
                "sources": validated.total_units_sources,
                "sources_checked": validated.sources_checked,
                "sources_with_data": validated.sources_with_data,
                "discrepancies": validated.discrepancies,
                "developer": validated.developer,
                "tenure": validated.tenure,
            }

        elapsed = time.time() - start
        result["elapsed_seconds"] = round(elapsed, 2)

        print(f"POST /api/projects/inventory/scrape took: {elapsed:.4f}s ({project_name})")

        return jsonify(result)

    except Exception as e:
        print(f"POST /api/projects/inventory/scrape ERROR: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@projects_bp.route("/projects/inventory/scrape-missing", methods=["POST"])
def scrape_missing_inventory():
    """
    Scrape total_units for projects missing inventory data.

    Finds projects with New Sale transactions but no total_units in project_inventory,
    then scrapes from 10 sources to populate the data.

    Query params:
        - limit: Max projects to scrape (default: 20)
        - dry_run: If 'true', don't save to database (default: false)

    Returns:
        {
            "scraped": N,
            "saved": N,
            "low_confidence": N,
            "not_found": N,
            "errors": [...]
        }
    """
    import time
    start = time.time()

    limit = int(request.args.get("limit", 20))
    dry_run = request.args.get("dry_run", "").lower() == "true"

    try:
        from services.property_scraper import scrape_missing_projects

        if dry_run:
            # Just report what would be scraped
            from models.transaction import Transaction
            from models.project_inventory import ProjectInventory
            from sqlalchemy import func

            # Get projects with New Sale transactions but no inventory
            projects_with_sales = db.session.query(
                Transaction.project_name,
                func.count(Transaction.id).label('sales_count')
            ).filter(
                Transaction.sale_type == 'New Sale',
                Transaction.is_outlier == False
            ).group_by(Transaction.project_name).subquery()

            missing = db.session.query(projects_with_sales.c.project_name).outerjoin(
                ProjectInventory,
                projects_with_sales.c.project_name == ProjectInventory.project_name
            ).filter(
                ProjectInventory.id.is_(None)
            ).order_by(
                projects_with_sales.c.sales_count.desc()
            ).limit(limit).all()

            elapsed = time.time() - start
            return jsonify({
                "dry_run": True,
                "projects_to_scrape": [p[0] for p in missing],
                "count": len(missing),
                "elapsed_seconds": round(elapsed, 2)
            })

        # Actually scrape
        stats = scrape_missing_projects(limit=limit)

        elapsed = time.time() - start
        stats["elapsed_seconds"] = round(elapsed, 2)

        print(f"POST /api/projects/inventory/scrape-missing took: {elapsed:.4f}s")

        return jsonify(stats)

    except Exception as e:
        print(f"POST /api/projects/inventory/scrape-missing ERROR: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@projects_bp.route("/projects/inventory/status", methods=["GET"])
def get_inventory_status():
    """
    Get inventory data coverage status.

    Returns summary of how many projects have total_units data vs missing.

    Returns:
        {
            "total_projects_with_new_sales": N,
            "projects_with_inventory": N,
            "projects_missing_inventory": N,
            "coverage_percent": X.X,
            "by_source": {...}
        }
    """
    import time
    start = time.time()

    try:
        from models.transaction import Transaction
        from models.project_inventory import ProjectInventory
        from sqlalchemy import func

        # Count projects with New Sale transactions
        total_with_sales = db.session.query(
            func.count(func.distinct(Transaction.project_name))
        ).filter(
            Transaction.sale_type == 'New Sale',
            Transaction.is_outlier == False
        ).scalar() or 0

        # Count projects with inventory data
        inventory_stats = db.session.query(
            ProjectInventory.data_source,
            func.count(ProjectInventory.id)
        ).group_by(ProjectInventory.data_source).all()

        by_source = {src: count for src, count in inventory_stats}
        total_with_inventory = sum(by_source.values())

        missing = total_with_sales - total_with_inventory
        coverage = (total_with_inventory / total_with_sales * 100) if total_with_sales > 0 else 0

        elapsed = time.time() - start

        return jsonify({
            "total_projects_with_new_sales": total_with_sales,
            "projects_with_inventory": total_with_inventory,
            "projects_missing_inventory": max(0, missing),
            "coverage_percent": round(coverage, 1),
            "by_source": by_source,
            "elapsed_seconds": round(elapsed, 2)
        })

    except Exception as e:
        print(f"GET /api/projects/inventory/status ERROR: {e}")
        return jsonify({"error": str(e)}), 500


@projects_bp.route("/projects/cleanup-upcoming-launches", methods=["DELETE"])
def cleanup_upcoming_launches_from_transactions():
    """
    Delete new_launches entries that were auto-populated from transactions.

    These entries have data_source='transactions' and contain misleading
    total_units values (set to transaction count instead of actual units).

    The correct source of truth for total_units is project_inventory table.
    """
    import time
    start = time.time()

    try:
        from models.new_launch import NewLaunch
        from sqlalchemy import func

        # Count before delete
        count_before = db.session.query(NewLaunch).filter(
            NewLaunch.data_source == 'transactions'
        ).count()

        if count_before == 0:
            return jsonify({
                "success": True,
                "deleted": 0,
                "message": "No transaction-populated entries found to delete"
            })

        # Delete entries populated from transactions
        deleted = db.session.query(NewLaunch).filter(
            NewLaunch.data_source == 'transactions'
        ).delete()

        db.session.commit()

        elapsed = time.time() - start
        print(f"DELETE /api/projects/cleanup-upcoming-launches took: {elapsed:.4f}s (deleted {deleted} entries)")

        return jsonify({
            "success": True,
            "deleted": deleted,
            "elapsed_seconds": round(elapsed, 2),
            "message": f"Removed {deleted} entries with data_source='transactions'. "
                       f"Use project_inventory for accurate total_units."
        })

    except Exception as e:
        db.session.rollback()
        print(f"DELETE /api/projects/cleanup-upcoming-launches ERROR: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@projects_bp.route("/projects/populate-upcoming-launches", methods=["POST"])
def populate_upcoming_launches_from_transactions():
    """
    Populate new_launches table from transactions with sale_type='New Sale'.

    This extracts unique projects from New Sale transactions and creates
    entries in the new_launches table with available data.

    Fields populated:
    - project_name: From transactions
    - district: Most common district for the project
    - market_segment: Derived from district (CCR/RCR/OCR)
    - total_units: Count of New Sale transactions (estimate)
    - tenure: Most common tenure for the project
    - property_type: Most common property type
    - launch_year: Year of first transaction
    - data_source: 'transactions'

    Returns:
        {
            "created": N,
            "updated": N,
            "skipped": N,
            "projects": [...]
        }
    """
    import time
    start = time.time()

    try:
        from models.transaction import Transaction
        from models.new_launch import NewLaunch
        from sqlalchemy import func, text
        from constants import get_region_for_district

        # Query: Get all New Sale projects with aggregated data
        query = db.session.query(
            Transaction.project_name,
            Transaction.district,
            Transaction.tenure,
            Transaction.property_type,
            func.count(Transaction.id).label('units_sold'),
            func.min(Transaction.transaction_date).label('first_sale_date'),
            func.max(Transaction.transaction_date).label('last_sale_date'),
            func.avg(Transaction.psf).label('avg_psf')
        ).filter(
            Transaction.sale_type == 'New Sale',
            Transaction.is_outlier == False
        ).group_by(
            Transaction.project_name,
            Transaction.district,
            Transaction.tenure,
            Transaction.property_type
        ).order_by(
            func.count(Transaction.id).desc()
        )

        results = query.all()

        # Group by project_name to handle multiple districts/tenures per project
        projects_data = {}
        for row in results:
            name = row.project_name
            if name not in projects_data:
                projects_data[name] = {
                    'project_name': name,
                    'districts': {},
                    'tenures': {},
                    'property_types': {},
                    'total_units': 0,
                    'first_sale': row.first_sale_date,
                    'avg_psf': row.avg_psf
                }

            # Accumulate counts by district
            if row.district:
                projects_data[name]['districts'][row.district] = \
                    projects_data[name]['districts'].get(row.district, 0) + row.units_sold

            # Accumulate by tenure
            if row.tenure:
                projects_data[name]['tenures'][row.tenure] = \
                    projects_data[name]['tenures'].get(row.tenure, 0) + row.units_sold

            # Accumulate by property type
            if row.property_type:
                projects_data[name]['property_types'][row.property_type] = \
                    projects_data[name]['property_types'].get(row.property_type, 0) + row.units_sold

            projects_data[name]['total_units'] += row.units_sold

            # Track earliest first sale
            if row.first_sale_date:
                if projects_data[name]['first_sale'] is None or \
                   row.first_sale_date < projects_data[name]['first_sale']:
                    projects_data[name]['first_sale'] = row.first_sale_date

        # Now insert/update new_launches
        created = 0
        updated = 0
        skipped = 0
        processed = []

        for name, data in projects_data.items():
            # Get most common district
            district = max(data['districts'], key=data['districts'].get) if data['districts'] else None

            # Get most common tenure
            tenure = max(data['tenures'], key=data['tenures'].get) if data['tenures'] else None

            # Get most common property type
            property_type = max(data['property_types'], key=data['property_types'].get) \
                if data['property_types'] else 'Condominium'

            # Derive market segment from district
            market_segment = get_region_for_district(district) if district else None

            # Get launch year from first sale
            launch_year = data['first_sale'].year if data['first_sale'] else None

            # Check if already exists
            existing = db.session.query(NewLaunch).filter(
                func.lower(NewLaunch.project_name) == name.lower()
            ).first()

            if existing:
                # Update only if we have more data
                if data['total_units'] > (existing.total_units or 0):
                    existing.total_units = data['total_units']
                    existing.updated_at = func.now()
                    updated += 1
                    processed.append({
                        'project_name': name,
                        'action': 'updated',
                        'total_units': data['total_units']
                    })
                else:
                    skipped += 1
            else:
                # Create new entry
                new_launch = NewLaunch(
                    project_name=name,
                    district=district,
                    market_segment=market_segment,
                    total_units=data['total_units'],
                    tenure=tenure,
                    property_type=property_type,
                    launch_year=launch_year,
                    data_source='transactions',
                    data_confidence='medium',
                    needs_review=True,
                    review_reason='Auto-populated from transactions. Verify total_units and add developer.'
                )
                db.session.add(new_launch)
                created += 1
                processed.append({
                    'project_name': name,
                    'action': 'created',
                    'district': district,
                    'market_segment': market_segment,
                    'total_units': data['total_units'],
                    'launch_year': launch_year
                })

        db.session.commit()

        elapsed = time.time() - start
        print(f"POST /api/projects/populate-upcoming-launches took: {elapsed:.4f}s "
              f"(created={created}, updated={updated}, skipped={skipped})")

        return jsonify({
            "success": True,
            "created": created,
            "updated": updated,
            "skipped": skipped,
            "total_projects": len(projects_data),
            "elapsed_seconds": round(elapsed, 2),
            "projects": processed[:50],  # Return first 50 for preview
            "note": "Developer field needs manual entry. total_units is based on transaction count."
        })

    except Exception as e:
        db.session.rollback()
        print(f"POST /api/projects/populate-upcoming-launches ERROR: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
