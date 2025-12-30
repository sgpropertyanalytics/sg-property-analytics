"""
Transaction Analysis Endpoints

Transaction-level analysis for price growth and appreciation metrics.

Endpoints:
- /transactions/price-growth - Transaction-level price growth metrics
- /transactions/price-growth/segments - Aggregated segment summary
"""

import time
from datetime import timedelta
from flask import jsonify, g
from routes.analytics import analytics_bp
from utils.normalize import (
    clamp_date_to_today,
    ValidationError as NormalizeValidationError, validation_error_response
)
from api.contracts import api_contract


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
    start = time.time()
    from services.price_growth_service import get_transaction_price_growth as compute_growth

    try:
        params = getattr(g, "normalized_params", {}) or {}

        project_name = params.get("project")
        bedrooms = params.get("bedrooms") or []
        if isinstance(bedrooms, list):
            bedroom_values = []
            for item in bedrooms:
                if isinstance(item, str) and "," in item:
                    bedroom_values.extend([v.strip() for v in item.split(",") if v.strip()])
                else:
                    bedroom_values.append(item)
            bedroom_count = bedroom_values[0] if bedroom_values else None
        else:
            bedroom_count = bedrooms
        if bedroom_count is not None:
            try:
                bedroom_count = int(bedroom_count)
            except (TypeError, ValueError):
                bedroom_count = None
        floor_level = params.get("floor_level")
        sale_type = params.get("sale_type")

        if floor_level:
            from api.contracts.contract_schema import FloorLevel
            floor_level = FloorLevel.to_db(floor_level)

        if sale_type:
            from api.contracts.contract_schema import SaleType
            sale_type = SaleType.to_db(sale_type)

        districts = params.get("districts") or []
        district = districts[0] if isinstance(districts, list) and districts else None

        date_from = params.get("date_from")
        date_to = None
        date_to_exclusive = params.get("date_to_exclusive")
        if date_to_exclusive:
            date_to = clamp_date_to_today(date_to_exclusive - timedelta(days=1))

        page = params.get("page", 1)
        per_page = params.get("per_page", 50)

    except NormalizeValidationError as e:
        return validation_error_response(e)

    try:

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

        # Serialize response (future: add proper serializer in api/contracts/contract_schema.py)
        # For now, return as-is with v2 metadata.
        response = result
        response['apiContractVersion'] = 'v2'

        elapsed = time.time() - start
        print(f"GET /api/transactions/price-growth completed in {elapsed:.4f}s")

        return jsonify(response)

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/transactions/price-growth ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
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
    start = time.time()
    from services.price_growth_service import get_segment_summary

    try:
        params = getattr(g, "normalized_params", {}) or {}

        project_name = params.get("project")
        sale_type = params.get("sale_type")
        if sale_type:
            from api.contracts.contract_schema import SaleType
            sale_type = SaleType.to_db(sale_type)

        districts = params.get("districts") or []
        district = districts[0] if isinstance(districts, list) and districts else None

        # Get segment summary
        segments = get_segment_summary(
            project_name=project_name,
            district=district,
            sale_type=sale_type
        )

        # Build response
        response = {"data": segments, "apiContractVersion": "v2"}

        elapsed = time.time() - start
        print(f"GET /api/transactions/price-growth/segments completed in {elapsed:.4f}s")

        return jsonify(response)

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/transactions/price-growth/segments ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
