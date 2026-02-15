"""
Trend Endpoints

Only active endpoint:
- /new-vs-resale - New sale vs resale comparison
"""

from flask import jsonify, g
from routes.analytics import analytics_bp
from routes.analytics._filter_builders import extract_scope_filters
from utils.normalize import (
    ValidationError as NormalizeValidationError, validation_error_response
)
from api.contracts.wrapper import api_contract
from routes.analytics._route_utils import route_logger, log_success, log_error


logger = route_logger("trends")


@analytics_bp.route("/new-vs-resale", methods=["GET"])
@api_contract("trends/new-vs-resale")
def new_vs_resale():
    """
    New Sale vs Young Resale (4-9 years age) comparison.

    Young Resale definition:
    - Property age (transaction year - lease start year) between 4 and 9 years
    - Project must have at least one resale transaction (excludes delayed construction)

    RESPECTS GLOBAL FILTERS from sidebar (district, bedroom, segment, date range).
    Only the drill level (timeGrain) is visual-local.

    Query params (global filters from sidebar):
      - district: comma-separated districts (D01,D02,...) - from global sidebar
      - bedroom: comma-separated bedroom counts (2,3,4) - from global sidebar
      - segment: CCR, RCR, OCR - from global sidebar
      - date_from: YYYY-MM-DD - from global sidebar
      - date_to: YYYY-MM-DD - from global sidebar

    Query params (visual-local):
      - timeGrain: year, quarter, month (default: quarter) - for drill up/down

    Returns:
      {
        "chartData": [...],
        "summary": {...},
        "appliedFilters": {...}
      }
    """
    import time
    start = time.perf_counter()

    # Parse GLOBAL filter parameters (from sidebar)
    params = getattr(g, "normalized_params", {}) or {}

    try:
        scope = extract_scope_filters(params, clamp_end_to_today=True)
    except NormalizeValidationError as e:
        return validation_error_response(e)

    districts = scope["districts"] or []
    bedrooms = scope["bedrooms"] or []
    segment = scope["segment"]
    date_from = scope["date_from"]
    date_to = scope["date_to"]

    # Parse visual-local parameter (drill level)
    time_grain = params.get("time_grain", "quarter")
    valid_time_grains = ["year", "quarter", "month"]
    if time_grain not in valid_time_grains:
        return jsonify({"error": f"Invalid timeGrain. Must be one of: {valid_time_grains}"}), 400

    try:
        from services.data_processor import get_new_vs_resale_comparison

        result = get_new_vs_resale_comparison(
            districts=districts,
            bedrooms=bedrooms,
            segment=segment,
            date_from=date_from,
            date_to=date_to,
            time_grain=time_grain
        )

        log_success(
            logger,
            "/api/new-vs-resale",
            start,
            {
                "district_count": len(districts or []),
                "bedroom_count": len(bedrooms or []),
                "segment": segment,
                "time_grain": time_grain,
                "points": len(result.get("chartData", [])),
            },
        )
        return jsonify(result)
    except Exception as e:
        log_error(
            logger,
            "/api/new-vs-resale",
            start,
            e,
            {
                "district_count": len(districts or []),
                "bedroom_count": len(bedrooms or []),
                "segment": segment,
                "time_grain": time_grain,
            },
        )
        return jsonify({"error": str(e)}), 500
