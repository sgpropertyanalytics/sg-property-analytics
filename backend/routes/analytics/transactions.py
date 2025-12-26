"""
Transaction Analysis Endpoints

Transaction-level analysis for price growth and appreciation metrics.

Endpoints:
- /transactions/price-growth - Transaction-level price growth metrics
- /transactions/price-growth/segments - Aggregated segment summary
"""

import time
from flask import request, jsonify
from routes.analytics import analytics_bp


@analytics_bp.route("/transactions/price-growth", methods=["GET"])
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
        - floor_level: Floor tier (Low, Mid-Low, Mid, Mid-High, High, Luxury, Unknown)
        - district: District code (D01-D28)
        - date_from: Start date (YYYY-MM-DD)
        - date_to: End date (YYYY-MM-DD)
        - sale_type: Sale type ('New Sale', 'Resale', 'Sub Sale')

        Pagination:
        - page: Page number (default 1)
        - per_page: Records per page (default 50, max 500)

        Schema:
        - schema: 'v2' for strict camelCase only, omit for dual-mode

    Example:
        GET /api/transactions/price-growth?project=THE%20ORIE&bedroom=2&page=1
    """
    start = time.time()
    from services.price_growth_service import get_transaction_price_growth as compute_growth
    from datetime import datetime

    try:
        # Parse filter params
        project_name = request.args.get('project')
        bedroom_count = request.args.get('bedroom', type=int)
        floor_level = request.args.get('floor_level')
        district = request.args.get('district')
        sale_type = request.args.get('sale_type')

        # Parse date params (must be Python date objects for SQL guardrails)
        date_from = None
        date_to = None
        if request.args.get('date_from'):
            try:
                date_from = datetime.strptime(request.args.get('date_from'), '%Y-%m-%d').date()
            except ValueError:
                return jsonify({"error": "date_from must be YYYY-MM-DD format"}), 400

        if request.args.get('date_to'):
            try:
                date_to = datetime.strptime(request.args.get('date_to'), '%Y-%m-%d').date()
            except ValueError:
                return jsonify({"error": "date_to must be YYYY-MM-DD format"}), 400

        # Parse pagination params
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 50, type=int)

        # Check schema parameter for v2 strict mode
        schema_version = request.args.get('schema', '').lower()
        strict_v2 = schema_version == 'v2'

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

        # Serialize response (future: add proper serializer in api_contract.py)
        # For now, return as-is with schema mode handling
        if strict_v2:
            # TODO: Implement serialize_price_growth_v2 in api_contract.py
            response = result
            response['apiContractVersion'] = 'v2'
        else:
            # Default: return raw result (already in camelCase from service)
            response = result

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
def get_price_growth_segments():
    """
    Get aggregated price growth summary by market segment.

    Returns average growth metrics grouped by (project + bedroom_count + floor_level).

    Query params:
        - project: Project name (partial match)
        - district: District code (D01-D28)
        - sale_type: Sale type ('New Sale', 'Resale', 'Sub Sale')
        - schema: 'v2' for strict camelCase only, omit for dual-mode

    Example:
        GET /api/transactions/price-growth/segments?district=D09
    """
    start = time.time()
    from services.price_growth_service import get_segment_summary

    try:
        # Parse filter params
        project_name = request.args.get('project')
        district = request.args.get('district')
        sale_type = request.args.get('sale_type')

        # Check schema parameter for v2 strict mode
        schema_version = request.args.get('schema', '').lower()
        strict_v2 = schema_version == 'v2'

        # Get segment summary
        segments = get_segment_summary(
            project_name=project_name,
            district=district,
            sale_type=sale_type
        )

        # Build response
        response = {"data": segments}
        if strict_v2:
            response['apiContractVersion'] = 'v2'

        elapsed = time.time() - start
        print(f"GET /api/transactions/price-growth/segments completed in {elapsed:.4f}s")

        return jsonify(response)

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/transactions/price-growth/segments ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
