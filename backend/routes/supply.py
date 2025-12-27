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
    start = time.time()

    # ========== PARSE & NORMALIZE INPUT ==========
    # Frontend sends camelCase, we normalize here
    try:
        from utils.normalize import (
            to_int, to_bool,
            ValidationError as NormalizeValidationError, validation_error_response
        )

        # includeGls (default True)
        include_gls_raw = request.args.get("includeGls", request.args.get("include_gls", "true"))
        include_gls = to_bool(include_gls_raw, default=True, field="includeGls")

        # launchYear (default 2026)
        launch_year_raw = request.args.get("launchYear", request.args.get("launch_year"))
        launch_year = to_int(launch_year_raw, default=2026, field="launchYear")

        # Validate launch year range
        if launch_year < 2020 or launch_year > 2035:
            return jsonify({
                "error": "launchYear must be between 2020 and 2035",
                "type": "validation_error",
                "field": "launchYear",
                "received": launch_year
            }), 400

    except ImportError as e:
        # Fallback if normalize module not available
        include_gls = request.args.get("includeGls", "true").lower() == "true"
        launch_year = int(request.args.get("launchYear", "2026"))
    except Exception as e:
        return jsonify({"error": f"Input validation error: {str(e)}"}), 400

    # ========== CALL SERVICE ==========
    try:
        from services.supply_service import get_supply_summary as fetch_summary

        result = fetch_summary(
            include_gls=include_gls,
            launch_year=launch_year
        )

        elapsed = time.time() - start
        print(f"GET /api/supply/summary took: {elapsed:.4f}s (includeGls={include_gls}, launchYear={launch_year})")

        return jsonify(result)

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/supply/summary ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e), "type": type(e).__name__}), 500
