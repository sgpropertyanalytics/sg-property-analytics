"""
Supply Pipeline API Routes

Provides the unified supply summary endpoint for waterfall visualization.

Endpoint:
- GET /api/supply/summary - Aggregated supply pipeline data

This is a THIN route handler - all business logic is in services/supply_service.py.
"""

import time
from flask import Blueprint, g, jsonify
from api.contracts.wrapper import api_contract

supply_bp = Blueprint('supply', __name__)


@supply_bp.after_request
def add_contract_version_header(response):
    """Add X-API-Contract-Version header to all supply responses."""
    try:
        from api.contracts.contract_schema import API_CONTRACT_HEADER, CURRENT_API_CONTRACT_VERSION
        response.headers[API_CONTRACT_HEADER] = CURRENT_API_CONTRACT_VERSION
    except ImportError:
        response.headers['X-API-Contract-Version'] = 'v3'
    return response


@supply_bp.route("/summary", methods=["GET"])
@api_contract("supply/summary")
def get_supply_summary():
    """
    Get aggregated supply pipeline data for waterfall visualization.

    Query params (camelCase - normalized by Pydantic via @api_contract):
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
    try:
        start = time.time()

        # Use normalized params from Pydantic (via @api_contract decorator)
        params = g.normalized_params
        include_gls = params.get("include_gls", True)
        launch_year = params.get("launch_year", 2026)

        # Validate launch year range
        if launch_year < 2020 or launch_year > 2035:
            return jsonify({
                "error": "launchYear must be between 2020 and 2035",
                "type": "validation_error",
                "field": "launchYear",
                "received": launch_year
            }), 400

        # Call service
        from services.supply_service import get_supply_summary as fetch_summary

        result = fetch_summary(
            include_gls=include_gls,
            launch_year=launch_year
        )

        elapsed = time.time() - start
        print(f"GET /api/supply/summary took: {elapsed:.4f}s (includeGls={include_gls}, launchYear={launch_year})")

        return jsonify(result)

    except Exception as e:
        import traceback
        print(f"GET /api/supply/summary FATAL ERROR: {e}")
        traceback.print_exc()
        return jsonify({
            "error": "Internal server error",
            "type": "internal_error"
        }), 500
