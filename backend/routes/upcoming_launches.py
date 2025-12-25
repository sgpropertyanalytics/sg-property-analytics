"""
UPCOMING Launches API Routes

Endpoint: /api/upcoming-launches/*

SEMANTIC CLARIFICATION:
- "Upcoming Launches" = Projects that have NOT YET LAUNCHED (pre-sale info)
- For ACTIVE sales data (already launched), use /api/projects/hot instead

Provides endpoints for:
- Future new private condo launches (pre-launch, any year)
- Cross-validated data from EdgeProp, PropNex, ERA
- Links to GLS tender data for land bid prices

Follows same patterns as GLS routes for consistency.
"""
from flask import Blueprint, request, jsonify
import time
from datetime import datetime
from models.database import db
from models.upcoming_launch import UpcomingLaunch
from sqlalchemy import desc, asc

upcoming_launches_bp = Blueprint('upcoming_launches', __name__)

# Import contract versioning for HTTP header
from schemas.api_contract import API_CONTRACT_HEADER, CURRENT_API_CONTRACT_VERSION


@upcoming_launches_bp.after_request
def add_contract_version_header(response):
    """Add X-API-Contract-Version header to all upcoming launches responses."""
    response.headers[API_CONTRACT_HEADER] = CURRENT_API_CONTRACT_VERSION
    return response


@upcoming_launches_bp.route("/all", methods=["GET"])
def get_all():
    """
    Get all upcoming launch projects.

    Query params:
        - market_segment: CCR, RCR, or OCR (optional)
        - district: Filter by district, e.g. D09 (optional)
        - launch_year: Filter by launch year (optional, shows all if not specified)
        - needs_review: If 'true', only show items needing review
        - limit: Max results (default 100)
        - sort: Field to sort by (default: project_name)
        - order: asc or desc (default: asc)

    Returns:
        Pre-computed static data with last_checked in metadata
    """
    start = time.time()

    market_segment = request.args.get("market_segment")
    district = request.args.get("district")
    launch_year = request.args.get("launch_year")  # Optional - shows all years if not specified
    needs_review = request.args.get("needs_review", "").lower() == "true"
    limit = int(request.args.get("limit", 100))
    sort_by = request.args.get("sort", "project_name")
    order = request.args.get("order", "asc")

    try:
        query = db.session.query(UpcomingLaunch)

        # Apply filters
        if launch_year:
            query = query.filter(UpcomingLaunch.launch_year == int(launch_year))

        # Order by launch_year first if not filtered by year
        if not launch_year:
            query = query.order_by(UpcomingLaunch.launch_year)

        if market_segment:
            query = query.filter(UpcomingLaunch.market_segment == market_segment.upper())

        if district:
            # Normalize district format
            d = district.upper()
            if not d.startswith("D"):
                d = f"D{d.zfill(2)}"
            query = query.filter(UpcomingLaunch.district == d)

        if needs_review:
            query = query.filter(UpcomingLaunch.needs_review == True)

        # Apply sorting
        sort_col = getattr(UpcomingLaunch, sort_by, UpcomingLaunch.project_name)
        if order.lower() == 'desc':
            query = query.order_by(desc(sort_col))
        else:
            query = query.order_by(asc(sort_col))

        query = query.limit(limit)
        launches = query.all()

        # Get last checked timestamp (most recent)
        last_checked = None
        if launches:
            dates = [l.last_validated or l.last_scraped for l in launches if hasattr(l, 'last_validated') and (l.last_validated or l.last_scraped)]
            if dates:
                last_checked = max(dates)

        elapsed = time.time() - start
        print(f"GET /api/upcoming-launches/all took: {elapsed:.4f} seconds (returned {len(launches)} launches)")

        # Count by segment
        segment_counts = {}
        for l in launches:
            seg = l.market_segment or 'Unknown'
            segment_counts[seg] = segment_counts.get(seg, 0) + 1

        return jsonify({
            "count": len(launches),
            "summary": {
                "by_segment": segment_counts,
                "total_units": sum(l.total_units or 0 for l in launches),
            },
            "meta": {
                "last_checked": last_checked.isoformat() if last_checked else None,
                "filters_applied": {
                    "market_segment": market_segment,
                    "district": district,
                    "launch_year": launch_year,
                    "needs_review": needs_review,
                },
            },
            "data": [l.to_dict() for l in launches]
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/upcoming-launches/all ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@upcoming_launches_bp.route("/by-segment", methods=["GET"])
def get_by_segment():
    """
    Get upcoming launches grouped by market segment.

    Query params:
        - launch_year: Filter by launch year (default: 2026)

    Returns:
        Projects grouped by CCR, RCR, OCR
    """
    start = time.time()

    launch_year = int(request.args.get("launch_year", 2026))

    try:
        launches = db.session.query(UpcomingLaunch).filter(
            UpcomingLaunch.launch_year == launch_year
        ).order_by(UpcomingLaunch.market_segment, UpcomingLaunch.project_name).all()

        # Group by segment
        by_segment = {'CCR': [], 'RCR': [], 'OCR': [], 'Unknown': []}
        for l in launches:
            seg = l.market_segment or 'Unknown'
            by_segment.setdefault(seg, []).append(l.to_dict(include_sources=False))

        # Calculate totals
        totals = {}
        for seg, projects in by_segment.items():
            totals[seg] = {
                'count': len(projects),
                'total_units': sum(p.get('total_units') or 0 for p in projects),
                'avg_psf_low': sum(p.get('indicative_psf_low') or 0 for p in projects) / len(projects) if projects else 0,
            }

        elapsed = time.time() - start
        print(f"GET /api/upcoming-launches/by-segment took: {elapsed:.4f} seconds")

        return jsonify({
            "launch_year": launch_year,
            "totals": totals,
            "by_segment": by_segment
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/upcoming-launches/by-segment ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@upcoming_launches_bp.route("/supply-pipeline", methods=["GET"])
def get_supply_pipeline():
    """
    Get aggregate supply pipeline from upcoming launches.

    Query params:
        - launch_year: Filter by launch year (default: 2026)
        - market_segment: CCR, RCR, or OCR (optional)

    Returns:
        Aggregate units by region
    """
    start = time.time()

    launch_year = int(request.args.get("launch_year", 2026))
    market_segment = request.args.get("market_segment")

    try:
        from sqlalchemy import func

        query = db.session.query(
            UpcomingLaunch.market_segment,
            func.sum(UpcomingLaunch.total_units).label('total_units'),
            func.count(UpcomingLaunch.id).label('project_count'),
            func.avg(UpcomingLaunch.indicative_psf_low).label('avg_psf_low'),
            func.avg(UpcomingLaunch.indicative_psf_high).label('avg_psf_high'),
        ).filter(
            UpcomingLaunch.launch_year == launch_year
        )

        if market_segment:
            query = query.filter(UpcomingLaunch.market_segment == market_segment.upper())

        query = query.group_by(UpcomingLaunch.market_segment)
        results = query.all()

        pipeline = {
            'launch_year': launch_year,
            'disclaimer': 'Based on cross-validated data from EdgeProp, PropNex, ERA',
            'by_segment': {},
            'total_units': 0,
            'total_projects': 0,
        }

        for row in results:
            segment = row.market_segment or 'Unknown'
            units = int(row.total_units) if row.total_units else 0
            count = int(row.project_count)

            pipeline['by_segment'][segment] = {
                'units': units,
                'project_count': count,
                'avg_psf_low': round(float(row.avg_psf_low), 2) if row.avg_psf_low else None,
                'avg_psf_high': round(float(row.avg_psf_high), 2) if row.avg_psf_high else None,
            }
            pipeline['total_units'] += units
            pipeline['total_projects'] += count

        elapsed = time.time() - start
        print(f"GET /api/upcoming-launches/supply-pipeline took: {elapsed:.4f} seconds")

        return jsonify(pipeline)

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/upcoming-launches/supply-pipeline ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@upcoming_launches_bp.route("/project/<project_name>", methods=["GET"])
def get_project_detail(project_name: str):
    """
    Get details for a specific project.

    Args:
        project_name: Project name (URL encoded)

    Returns:
        Full project details including source data
    """
    start = time.time()

    try:
        from urllib.parse import unquote
        decoded_name = unquote(project_name)

        launch = db.session.query(UpcomingLaunch).filter(
            UpcomingLaunch.project_name.ilike(f"%{decoded_name}%")
        ).first()

        if not launch:
            return jsonify({"error": f"Project not found: {decoded_name}"}), 404

        elapsed = time.time() - start
        print(f"GET /api/upcoming-launches/project/{project_name} took: {elapsed:.4f} seconds")

        return jsonify(launch.to_dict(include_sources=True))

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/upcoming-launches/project/{project_name} ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@upcoming_launches_bp.route("/needs-review", methods=["GET"])
def get_needs_review():
    """
    Get projects that need manual review.

    Returns:
        List of projects flagged for review with reasons
    """
    start = time.time()

    try:
        launches = db.session.query(UpcomingLaunch).filter(
            UpcomingLaunch.needs_review == True
        ).order_by(desc(UpcomingLaunch.updated_at)).all()

        elapsed = time.time() - start
        print(f"GET /api/upcoming-launches/needs-review took: {elapsed:.4f} seconds (returned {len(launches)} projects)")

        return jsonify({
            "count": len(launches),
            "data": [l.to_dict(include_sources=True) for l in launches]
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/upcoming-launches/needs-review ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500


@upcoming_launches_bp.route("/reset", methods=["POST"])
def reset_data():
    """
    Reset upcoming launches data for a given year.

    Query params:
        - year: Year to reset (default: 2026)
        - confirm: Must be 'yes' to proceed

    Returns:
        Number of records deleted
    """
    start = time.time()

    year = int(request.args.get("year", 2026))
    confirm = request.args.get("confirm", "").lower()

    if confirm != "yes":
        return jsonify({
            "error": "Must pass confirm=yes to reset all upcoming launches data",
            "warning": "This will DELETE all existing upcoming launch records"
        }), 400

    try:
        # Delete all existing records for the year
        deleted = db.session.query(UpcomingLaunch).filter(
            UpcomingLaunch.launch_year == year
        ).delete()
        db.session.commit()

        elapsed = time.time() - start
        print(f"POST /api/upcoming-launches/reset took: {elapsed:.4f} seconds")

        return jsonify({
            "success": True,
            "year": year,
            "deleted": deleted,
            "elapsed_seconds": round(elapsed, 2),
            "message": "Data deleted. Use CSV upload to repopulate.",
            "hint": "upload_upcoming_launches('data/upcoming_launches_2026.csv')"
        })

    except Exception as e:
        elapsed = time.time() - start
        db.session.rollback()
        print(f"POST /api/upcoming-launches/reset ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@upcoming_launches_bp.route("/stats", methods=["GET"])
def get_stats():
    """
    Get summary statistics for upcoming launches data.

    Returns:
        Overview of project counts and values
    """
    start = time.time()

    try:
        from sqlalchemy import func

        # Total counts
        total = db.session.query(UpcomingLaunch).count()
        needs_review = db.session.query(UpcomingLaunch).filter(UpcomingLaunch.needs_review == True).count()
        with_gls_link = db.session.query(UpcomingLaunch).filter(UpcomingLaunch.gls_tender_id.isnot(None)).count()

        # By year
        by_year = db.session.query(
            UpcomingLaunch.launch_year,
            func.count(UpcomingLaunch.id).label('count'),
            func.sum(UpcomingLaunch.total_units).label('total_units')
        ).group_by(UpcomingLaunch.launch_year).all()

        year_stats = {
            row.launch_year: {
                'count': row.count,
                'total_units': int(row.total_units) if row.total_units else 0
            }
            for row in by_year
        }

        # By segment for 2026
        by_segment = db.session.query(
            UpcomingLaunch.market_segment,
            func.count(UpcomingLaunch.id).label('count'),
            func.sum(UpcomingLaunch.total_units).label('total_units')
        ).filter(
            UpcomingLaunch.launch_year == 2026
        ).group_by(UpcomingLaunch.market_segment).all()

        segment_stats = {
            (row.market_segment or 'Unknown'): {
                'count': row.count,
                'total_units': int(row.total_units) if row.total_units else 0
            }
            for row in by_segment
        }

        # Last updated
        last_updated = db.session.query(
            func.max(UpcomingLaunch.updated_at)
        ).scalar()

        elapsed = time.time() - start
        print(f"GET /api/upcoming-launches/stats took: {elapsed:.4f} seconds")

        return jsonify({
            "total_projects": total,
            "needs_review": needs_review,
            "with_gls_link": with_gls_link,
            "by_year": year_stats,
            "by_segment_2026": segment_stats,
            "last_updated": last_updated.isoformat() if last_updated else None
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/upcoming-launches/stats ERROR (took {elapsed:.4f}s): {e}")
        return jsonify({"error": str(e)}), 500
