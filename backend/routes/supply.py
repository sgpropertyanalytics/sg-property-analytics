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
        "version": "2.0",
        "message": "Supply route is working with lazy imports"
    })


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
