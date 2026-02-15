"""
Transaction Analysis Endpoints

Transaction-level analysis for price growth and appreciation metrics.

Endpoints:
- /transactions/price-growth - Transaction-level price growth metrics
- /transactions/price-growth/segments - Aggregated segment summary
"""

import time
from flask import jsonify, g
from routes.analytics import analytics_bp
from routes.analytics._route_utils import route_logger, log_success, log_error
from routes.analytics._filter_builders import extract_price_growth_params
from utils.normalize import (
    ValidationError as NormalizeValidationError, validation_error_response
)
from api.contracts import api_contract

logger = route_logger("transactions")


@analytics_bp.route("/transactions/price-growth", methods=["GET"])
@api_contract("transactions/price-growth")
def get_transaction_price_growth():
    """
    Get transaction-level price growth metrics partitioned by market segments.

    Computes historical price appreciation for each transaction relative to
    the first transaction in its segment (project + bedroom_count + floor_level).

    Returns growth metrics:
    - Cumulative growth % from first transaction in segment
    - Incremental growth % from previous transaction
    - Days since previous transaction
    - Annualized growth rate

    Query params:
        Filters:
        - project: Project name (partial match)
        - bedroom: Bedroom count (1-5)
        - floor_level: Floor tier (low, mid_low, mid, mid_high, high, luxury, unknown)
        - district: District code (D01-D28)
        - date_from: Start date (YYYY-MM-DD)
        - date_to: End date (YYYY-MM-DD)
        - sale_type: Sale type ('new_sale', 'resale', 'sub_sale')

        Pagination:
        - page: Page number (default 1)
        - per_page: Records per page (default 50, max 500)

    Example:
        GET /api/transactions/price-growth?project=THE%20ORIE&bedroom=2&page=1
    """
    start = time.perf_counter()
    from services.price_growth_service import get_transaction_price_growth as compute_growth

    try:
        params = getattr(g, "normalized_params", {}) or {}
        parsed = extract_price_growth_params(params)
        project_name = parsed["project_name"]
        bedroom_count = parsed["bedroom_count"]
        floor_level = parsed["floor_level"]
        sale_type = parsed["sale_type"]
        district = parsed["district"]
        date_from = parsed["date_from"]
        date_to = parsed["date_to"]
        page = parsed["page"]
        per_page = parsed["per_page"]

    except NormalizeValidationError as e:
        return validation_error_response(e)

    try:
        from api.contracts.pydantic_models.transactions import PriceGrowthResponse

        # Compute price growth
        result = compute_growth(
            project_name=project_name,
            bedroom_count=bedroom_count,
            floor_level=floor_level,
            district=district,
            date_from=date_from,
            date_to=date_to,
            sale_type=sale_type,
            page=page,
            per_page=per_page
        )

        # Serialize via Pydantic response model (snake_case → camelCase)
        response = PriceGrowthResponse.from_service(result).model_dump(by_alias=True)

        log_success(
            logger,
            "/api/transactions/price-growth",
            start,
            {
                "project": project_name,
                "district": district,
                "sale_type": sale_type,
                "page": page,
                "per_page": per_page,
                "items": len(response.get("data", [])) if isinstance(response, dict) else None,
            },
        )

        return jsonify(response)

    except Exception as e:
        log_error(
            logger,
            "/api/transactions/price-growth",
            start,
            e,
            {"project": project_name, "district": district, "sale_type": sale_type},
        )
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/transactions/price-growth/segments", methods=["GET"])
@api_contract("transactions/price-growth/segments")
def get_price_growth_segments():
    """
    Get aggregated price growth summary by market segment.

    Returns average growth metrics grouped by (project + bedroom_count + floor_level).

    Query params:
        - project: Project name (partial match)
        - district: District code (D01-D28)
        - sale_type: Sale type ('new_sale', 'resale', 'sub_sale')
    Example:
        GET /api/transactions/price-growth/segments?district=D09
    """
    start = time.perf_counter()
    from services.price_growth_service import get_segment_summary

    try:
        params = getattr(g, "normalized_params", {}) or {}
        parsed = extract_price_growth_params(params)
        project_name = parsed["project_name"]
        sale_type = parsed["sale_type"]
        district = parsed["district"]

        from api.contracts.pydantic_models.transactions import SegmentSummaryResponse

        # Get segment summary
        segments = get_segment_summary(
            project_name=project_name,
            district=district,
            sale_type=sale_type
        )

        # Serialize via Pydantic response model (snake_case → camelCase)
        response = SegmentSummaryResponse.from_service(segments).model_dump(by_alias=True)

        log_success(
            logger,
            "/api/transactions/price-growth/segments",
            start,
            {
                "project": project_name,
                "district": district,
                "sale_type": sale_type,
                "segments": len(segments or []),
            },
        )

        return jsonify(response)

    except Exception as e:
        log_error(
            logger,
            "/api/transactions/price-growth/segments",
            start,
            e,
            {"project": project_name, "district": district, "sale_type": sale_type},
        )
        return jsonify({"error": str(e)}), 500
