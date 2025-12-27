"""
Supply Pipeline API Routes

Provides the unified supply summary endpoint for waterfall visualization.

Endpoint:
- GET /api/supply/summary - Aggregated supply pipeline data

This is a THIN route handler - all business logic is in services/supply_service.py.
"""

import time
from flask import Blueprint, request, jsonify

supply_bp = Blueprint('supply', __name__)


@supply_bp.route("/debug", methods=["GET"])
def debug_supply():
    """Debug endpoint to verify code is deployed."""
    return jsonify({
        "status": "ok",
        "version": "2.1",
        "message": "Supply route is working with lazy imports"
    })


@supply_bp.route("/test", methods=["GET"])
def test_supply():
    """Test endpoint to isolate issues step by step."""
    step = request.args.get("step", "1")

    try:
        if step == "1":
            # Just return static data
            return jsonify({"step": 1, "message": "Static response works"})

        elif step == "2":
            # Test imports
            from services.supply_service import get_supply_summary
            return jsonify({"step": 2, "message": "Import works"})

        elif step == "3":
            # Test new_launch_units service import
            from services.new_launch_units import get_new_launch_projects
            return jsonify({"step": 3, "message": "new_launch_units import works"})

        elif step == "3a":
            # Test get_new_launch_projects call
            from services.new_launch_units import get_new_launch_projects
            projects = get_new_launch_projects()
            return jsonify({"step": "3a", "message": "get_new_launch_projects works", "count": len(projects)})

        elif step == "3b":
            # Test just unsold inventory
            from services.supply_service import _get_unsold_inventory_by_district
            result = _get_unsold_inventory_by_district()
            return jsonify({"step": "3b", "message": "Unsold inventory works", "count": len(result), "sample": dict(list(result.items())[:3])})

        elif step == "4":
            # Test UpcomingLaunch model import
            from models.upcoming_launch import UpcomingLaunch
            return jsonify({"step": 4, "message": "UpcomingLaunch import works"})

        elif step == "4a":
            # Test just upcoming launches query
            from services.supply_service import _get_upcoming_launches_by_district
            result = _get_upcoming_launches_by_district(2026)
            return jsonify({"step": "4a", "message": "Upcoming launches works", "count": len(result), "sample": dict(list(result.items())[:3])})

        elif step == "5":
            # Test just GLS
            from services.supply_service import _get_gls_pipeline_by_region
            result = _get_gls_pipeline_by_region()
            return jsonify({"step": 5, "message": "GLS works", "result": result})

        elif step == "6":
            # Full call without GLS
            from services.supply_service import get_supply_summary
            result = get_supply_summary(include_gls=False, launch_year=2026)
            return jsonify({"step": 6, "message": "Service works", "totals": result.get("totals", {})})

        elif step == "7":
            # Full call with GLS
            from services.supply_service import get_supply_summary
            result = get_supply_summary(include_gls=True, launch_year=2026)
            return jsonify(result)

        else:
            return jsonify({"error": "Unknown step"})

    except Exception as e:
        import traceback
        return jsonify({
            "step": step,
            "error": str(e),
            "type": type(e).__name__,
            "traceback": traceback.format_exc()
        }), 500


@supply_bp.after_request
def add_contract_version_header(response):
    """Add X-API-Contract-Version header to all supply responses."""
    try:
        from schemas.api_contract import API_CONTRACT_HEADER, CURRENT_API_CONTRACT_VERSION
        response.headers[API_CONTRACT_HEADER] = CURRENT_API_CONTRACT_VERSION
    except ImportError:
        response.headers['X-API-Contract-Version'] = 'v3'
    return response


@supply_bp.route("/summary", methods=["GET"])
def get_supply_summary():
    """
    Get aggregated supply pipeline data for waterfall visualization.

    Query params (camelCase - normalized internally):
        - includeGls: bool (default true) - Include GLS pipeline in totals
        - launchYear: int (default 2026) - Year filter for upcoming launches

    Returns:
        {
            "byRegion": {
                "CCR": { unsoldInventory, upcomingLaunches, glsPipeline, totalEffectiveSupply },
                ...
            },
            "byDistrict": { "D01": {...}, ... },
            "totals": { unsoldInventory, upcomingLaunches, glsPipeline, totalEffectiveSupply },
            "meta": { launchYear, includeGls, computedAs, asOfDate, warnings }
        }

    Example:
        GET /api/supply/summary?includeGls=true&launchYear=2026
    """
    # Wrap entire function in try/except to guarantee JSON error response
    try:
        start = time.time()

        # ========== PARSE & NORMALIZE INPUT ==========
        # Frontend sends camelCase, we normalize here
        try:
            from utils.normalize import to_int, to_bool

            # includeGls (default True)
            include_gls_raw = request.args.get("includeGls", request.args.get("include_gls", "true"))
            include_gls = to_bool(include_gls_raw, default=True, field="includeGls")

            # launchYear (default 2026)
            launch_year_raw = request.args.get("launchYear", request.args.get("launch_year"))
            launch_year = to_int(launch_year_raw, default=2026, field="launchYear")

        except ImportError:
            # Fallback if normalize module not available
            include_gls = request.args.get("includeGls", "true").lower() == "true"
            launch_year_str = request.args.get("launchYear", "2026")
            try:
                launch_year = int(launch_year_str)
            except (ValueError, TypeError):
                launch_year = 2026

        # Validate launch year range
        if launch_year < 2020 or launch_year > 2035:
            return jsonify({
                "error": "launchYear must be between 2020 and 2035",
                "type": "validation_error",
                "field": "launchYear",
                "received": launch_year
            }), 400

        # ========== CALL SERVICE ==========
        from services.supply_service import get_supply_summary as fetch_summary

        result = fetch_summary(
            include_gls=include_gls,
            launch_year=launch_year
        )

        elapsed = time.time() - start
        print(f"GET /api/supply/summary took: {elapsed:.4f}s (includeGls={include_gls}, launchYear={launch_year})")

        return jsonify(result)

    except Exception as e:
        # Catch ALL errors and return JSON
        import traceback
        error_traceback = traceback.format_exc()
        print(f"GET /api/supply/summary FATAL ERROR: {e}")
        print(error_traceback)
        return jsonify({
            "error": str(e),
            "type": type(e).__name__,
            "traceback": error_traceback.split('\n')[-5:]  # Last 5 lines of traceback
        }), 500
