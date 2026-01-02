"""
Trend Endpoints

Only active endpoint:
- /new-vs-resale - New sale vs resale comparison
"""

import time
from flask import request, jsonify, g
from routes.analytics import analytics_bp
from utils.normalize import (
    to_date, to_list, clamp_date_to_today,
    ValidationError as NormalizeValidationError, validation_error_response
)
from api.contracts.wrapper import api_contract


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
    start = time.time()

    # Parse GLOBAL filter parameters (from sidebar)
    params = getattr(g, "normalized_params", {}) or {}

    districts = params.get("districts")

    def _expand_csv_list(value, item_type=str):
        if value is None:
            return []
        items = value if isinstance(value, list) else [value]
        expanded = []
        for item in items:
            if isinstance(item, str) and "," in item:
                expanded.extend([p.strip() for p in item.split(",") if p.strip()])
            else:
                expanded.append(item)
        try:
            if item_type is int:
                return [int(v) for v in expanded]
        except (ValueError, TypeError):
            raise NormalizeValidationError("Invalid list value")
        return expanded

    try:
        bedrooms = _expand_csv_list(params.get("bedrooms"), item_type=int)
    except NormalizeValidationError as e:
        return validation_error_response(e)

    segments = _expand_csv_list(params.get("segments"))
    segment = segments[0] if segments else None

    date_from = params.get("date_from")
    # Use date_to_exclusive from normalizer (timeframe resolution) if available
    # Fall back to date_to for explicit date params (converted +1 day by normalizer)
    date_to = params.get("date_to_exclusive") or params.get("date_to")
    if date_to:
        date_to = clamp_date_to_today(date_to)

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

        elapsed = time.time() - start
        filter_info = f"districts={districts}, bedrooms={bedrooms}, segment={segment}, timeGrain={time_grain}"
        print(f"GET /api/new-vs-resale took: {elapsed:.4f} seconds ({filter_info})")
        return jsonify(result)
    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/new-vs-resale ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
