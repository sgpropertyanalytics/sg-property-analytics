"""
KPI Summary Endpoint V2 - Thin Controller

Uses the standardized KPI registry pattern.
This is the new, clean implementation.

Endpoints:
- /kpi-summary-v2 - All KPI metrics via registry
"""

import time
from flask import request, jsonify, g
from sqlalchemy import text
from routes.analytics import analytics_bp
from models.database import db
from db.sql import OUTLIER_FILTER
from utils.normalize import to_date
from api.contracts import api_contract


def _get_max_transaction_date():
    """Get the latest transaction date from the database."""
    result = db.session.execute(text(f"""
        SELECT MAX(transaction_date) as max_date
        FROM transactions
        WHERE {OUTLIER_FILTER}
    """)).fetchone()
    return result.max_date if result else None


@analytics_bp.route("/kpi-summary-v2", methods=["GET"])
@api_contract("kpi-summary-v2")
def kpi_summary_v2():
    """
    New KPI endpoint using registry pattern.

    Contract enforcement via @api_contract decorator:
    - Validates params against schema (WARN mode by default)
    - Injects requestId and elapsedMs into meta
    - Logs contract violations for observability

    Returns standardized KPIResult format:
    {
        "kpis": [
            {
                "kpi_id": "median_psf",
                "title": "Median PSF",
                "value": 1842,
                "formatted_value": "$1,842",
                "subtitle": "past 30 days",
                "trend": {"value": 2.4, "direction": "up", "label": "vs prev 30d"},
                "insight": "$1,798 → $1,842",
                "meta": {...}
            },
            ...
        ],
        "meta": {
            "elapsed_ms": 45.2,
            "requestId": "uuid",
            "apiVersion": "v3"
        }
    }
    """
    from services.kpi import run_all_kpis

    start = time.time()

    try:
        # Parse filters (thin layer - just parsing, no logic)
        filters = {}

        # District filter
        district_param = request.args.get('district')
        if district_param:
            filters['districts'] = district_param

        # Bedroom filter
        bedroom_param = request.args.get('bedroom')
        if bedroom_param:
            filters['bedrooms'] = bedroom_param

        # Segment filter
        segment_param = request.args.get('segment')
        if segment_param:
            filters['segment'] = segment_param

        # Date filter - use max from DB if not provided (like v1 does)
        date_param = request.args.get('max_date')
        if date_param:
            filters['max_date'] = to_date(date_param, field='max_date')
        else:
            # Default to latest transaction date in database
            filters['max_date'] = _get_max_transaction_date()

        # Run all KPIs via registry
        kpi_results = run_all_kpis(filters)

        elapsed = time.time() - start
        print(f"GET /api/kpi-summary-v2 completed in {elapsed:.4f}s")

        return jsonify({
            "kpis": kpi_results,
            "meta": {
                "elapsed_ms": round(elapsed * 1000, 2),
                "filters_applied": filters
            }
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/kpi-summary-v2 ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/kpi-summary-v2/<kpi_id>", methods=["GET"])
def kpi_single(kpi_id: str):
    """
    Get a single KPI by ID.

    Useful for testing or selective refresh.
    """
    from services.kpi import get_kpi_by_id

    start = time.time()

    try:
        filters = {}

        district_param = request.args.get('district')
        if district_param:
            filters['districts'] = district_param

        bedroom_param = request.args.get('bedroom')
        if bedroom_param:
            filters['bedrooms'] = bedroom_param

        segment_param = request.args.get('segment')
        if segment_param:
            filters['segment'] = segment_param

        # Default to latest transaction date
        filters['max_date'] = _get_max_transaction_date()

        result = get_kpi_by_id(kpi_id, filters)

        elapsed = time.time() - start
        return jsonify({
            "kpi": result,
            "meta": {"elapsed_ms": round(elapsed * 1000, 2)}
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
