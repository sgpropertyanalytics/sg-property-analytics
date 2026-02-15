"""
New Launch Timeline Endpoint

Provides aggregated data about new launch projects over time:
- Number of projects launched per period
- Total units launched per period

Endpoint: GET /api/new-launch-timeline
"""

from flask import jsonify, g
from routes.analytics import analytics_bp
from api.contracts import api_contract
from services.new_launch_service import get_new_launch_timeline, get_new_launch_absorption
from routes.analytics._route_utils import route_logger, log_success, log_error


logger = route_logger("new_launch")


@analytics_bp.route("/new-launch-timeline", methods=["GET"])
@api_contract("new-launch-timeline")
def new_launch_timeline():
    """
    Get new launch activity grouped by time period.

    Query params (handled by @api_contract decorator):
        - time_grain: month, quarter, or year (default: quarter)
        - district: Comma-separated district codes (e.g., D09,D10)
        - segment: Market segment (CCR, RCR, OCR)
        - bedroom: Comma-separated bedroom counts (e.g., 2,3,4)
        - date_from: Start date (inclusive), YYYY-MM-DD
        - date_to: End date (inclusive), YYYY-MM-DD

    Returns:
        {
            "data": [
                { "periodStart": "2024-01-01", "projectCount": 5, "totalUnits": 1200 },
                ...
            ],
            "meta": {
                "requestId": "...",
                "elapsedMs": 45.2,
                "apiVersion": "v3"
            }
        }
    """
    import time
    start = time.perf_counter()

    # Get normalized params from @api_contract decorator
    params = getattr(g, "normalized_params", {}) or {}

    try:
        # Extract service params (already normalized: districts, segments, bedrooms, date_to_exclusive)
        result = get_new_launch_timeline(
            time_grain=params.get("time_grain", "quarter"),
            districts=params.get("districts"),
            segments=params.get("segments"),
            bedrooms=params.get("bedrooms"),
            date_from=params.get("date_from"),
            date_to_exclusive=params.get("date_to_exclusive"),
        )
        log_success(
            logger,
            "/api/new-launch-timeline",
            start,
            {
                "periods": len(result),
                "district_count": len(params.get("districts") or []),
                "bedroom_count": len(params.get("bedrooms") or []),
            },
        )
        # Return data - @api_contract decorator injects meta fields
        return jsonify({"data": result})
    except Exception as e:
        log_error(
            logger,
            "/api/new-launch-timeline",
            start,
            e,
            {
                "district_count": len(params.get("districts") or []),
                "bedroom_count": len(params.get("bedrooms") or []),
            },
        )
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/new-launch-absorption", methods=["GET"])
@api_contract("new-launch-absorption")
def new_launch_absorption():
    """
    Get new launch activity with launch-month absorption rates.

    Query params (normalized by @api_contract):
        - time_grain: month, quarter, year (default: quarter)
        - district: Comma-separated district codes
        - segment: Market segment (CCR, RCR, OCR)
        - bedroom: Comma-separated bedroom counts
        - date_from: Start date (inclusive), YYYY-MM-DD
        - date_to: End date (inclusive), YYYY-MM-DD

    Response: { data: [...] } with meta injected by decorator.
    """
    params = getattr(g, "normalized_params", {}) or {}

    import time
    start = time.perf_counter()

    try:
        result = get_new_launch_absorption(
            time_grain=params["time_grain"],
            districts=params.get("districts"),
            segments=params.get("segments"),
            bedrooms=params.get("bedrooms"),
            date_from=params.get("date_from"),
            date_to_exclusive=params.get("date_to_exclusive"),
        )
        log_success(
            logger,
            "/api/new-launch-absorption",
            start,
            {
                "periods": len(result),
                "district_count": len(params.get("districts") or []),
                "bedroom_count": len(params.get("bedrooms") or []),
            },
        )
        return jsonify({"data": result})
    except Exception as e:
        log_error(
            logger,
            "/api/new-launch-absorption",
            start,
            e,
            {
                "district_count": len(params.get("districts") or []),
                "bedroom_count": len(params.get("bedrooms") or []),
            },
        )
        return jsonify({"error": str(e)}), 500
