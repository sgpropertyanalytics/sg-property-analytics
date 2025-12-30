"""
New Launch Timeline Endpoint

Provides aggregated data about new launch projects over time:
- Number of projects launched per period
- Total units launched per period

Endpoint: GET /api/analytics/new-launch-timeline
"""

import time
from flask import jsonify, g
from routes.analytics import analytics_bp
from api.contracts import api_contract
from services.new_launch_service import get_new_launch_timeline


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
    start = time.time()

    # Get normalized params from @api_contract decorator
    params = getattr(g, "normalized_params", {}) or {}

    # Extract service params (already normalized: districts, segments, bedrooms, date_to_exclusive)
    result = get_new_launch_timeline(
        time_grain=params.get("time_grain", "quarter"),
        districts=params.get("districts"),
        segments=params.get("segments"),
        bedrooms=params.get("bedrooms"),
        date_from=params.get("date_from"),
        date_to_exclusive=params.get("date_to_exclusive"),
    )

    elapsed = (time.time() - start) * 1000  # Convert to ms
    print(f"GET /api/new-launch-timeline completed in {elapsed:.1f}ms ({len(result)} periods)")

    # Return data - @api_contract decorator injects meta fields
    return jsonify({
        "data": result,
    })
