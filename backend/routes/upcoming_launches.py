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
from utils.normalize import (
    to_int, to_bool,
    ValidationError as NormalizeValidationError, validation_error_response
)

upcoming_launches_bp = Blueprint('upcoming_launches', __name__)

# Import contract versioning for HTTP header
from api.contracts.contract_schema import API_CONTRACT_HEADER, CURRENT_API_CONTRACT_VERSION
from api.contracts.wrapper import api_contract


@upcoming_launches_bp.after_request
def add_contract_version_header(response):
    """Add X-API-Contract-Version header to all upcoming launches responses."""
    response.headers[API_CONTRACT_HEADER] = CURRENT_API_CONTRACT_VERSION
    return response


# --- Public endpoints ---
@upcoming_launches_bp.route("/all", methods=["GET"])
@api_contract("upcoming-launches/all")
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
    needs_review = request.args.get("needs_review", "").lower() == "true"
    sort_by = request.args.get("sort", "project_name")
    order = request.args.get("order", "asc")

    try:
        # Parse optional params that may fail - return 400 on validation error
        launch_year = to_int(request.args.get("launch_year"), field="launch_year")  # Optional
        limit = to_int(request.args.get("limit"), default=100, field="limit")
    except NormalizeValidationError as e:
        return validation_error_response(e)

    try:
        query = db.session.query(UpcomingLaunch)

        # Apply filters
        if launch_year:
            query = query.filter(UpcomingLaunch.launch_year == launch_year)

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


# --- Admin endpoints ---
@upcoming_launches_bp.route("/needs-review", methods=["GET"])
@api_contract("upcoming-launches/needs-review")
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

    year = to_int(request.args.get("year"), default=2026, field="year")
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
