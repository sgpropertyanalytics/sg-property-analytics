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
    Get hot projects with sales progress derived from transactions.

    Query params:
        - market_segment: filter by CCR, RCR, OCR
        - district: filter by district (comma-separated)

    Returns:
        {
            "projects": [...],
            "total_count": N,
            "last_updated": "2025-12-21T00:00:00Z"
        }
    """
    start = time.time()

    try:
        from models.new_launch import NewLaunch
        from models.transaction import Transaction
        from sqlalchemy import func, literal

        # Build the query using SQLAlchemy
        # Join new_launches with transactions count and project_locations for school flag
        query = db.session.query(
            NewLaunch.project_name,
            NewLaunch.district,
            NewLaunch.planning_area,
            NewLaunch.market_segment,
            NewLaunch.developer,
            NewLaunch.total_units,
            func.count(Transaction.id).label('units_sold'),
            ProjectLocation.has_popular_school_1km
        ).outerjoin(
            Transaction,
            func.lower(func.trim(NewLaunch.project_name)) == func.lower(func.trim(Transaction.project_name))
        ).outerjoin(
            ProjectLocation,
            func.lower(func.trim(NewLaunch.project_name)) == func.lower(func.trim(ProjectLocation.project_name))
        ).filter(
            NewLaunch.total_units.isnot(None),
            NewLaunch.total_units > 0
        )

        # Apply filters
        market_segment = request.args.get("market_segment")
        if market_segment:
            query = query.filter(NewLaunch.market_segment == market_segment.upper())

        districts_param = request.args.get("district")
        if districts_param:
            districts = [d.strip().upper() for d in districts_param.split(",") if d.strip()]
            normalized = []
            for d in districts:
                if not d.startswith("D"):
                    d = f"D{d.zfill(2)}"
                normalized.append(d)
            query = query.filter(NewLaunch.district.in_(normalized))

        # Group by and execute
        query = query.group_by(
            NewLaunch.project_name,
            NewLaunch.district,
            NewLaunch.planning_area,
            NewLaunch.market_segment,
            NewLaunch.developer,
            NewLaunch.total_units,
            ProjectLocation.has_popular_school_1km
        )

        results = query.all()

        # Format response
        projects = []
        for row in results:
            total_units = row.total_units or 0
            units_sold = row.units_sold or 0
            percent_sold = round((units_sold * 100.0 / total_units), 1) if total_units > 0 else 0
            unsold = total_units - units_sold

            projects.append({
                "project_name": row.project_name,
                "region": DISTRICT_TO_REGION.get(row.district, None),
                "district": row.district,
                "market_segment": row.market_segment,
                "developer": row.developer,
                "total_units": total_units,
                "units_sold": units_sold,
                "percent_sold": percent_sold,
                "unsold_inventory": unsold,
                "has_popular_school": row.has_popular_school_1km or False
            })

        # Sort by percent_sold descending
        projects.sort(key=lambda x: x['percent_sold'], reverse=True)

        from datetime import datetime
        result = {
            "projects": projects,
            "total_count": len(projects),
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
