"""
KPI Summary Endpoint V2 - Thin Controller

Uses the standardized KPI registry pattern.
This is the new, clean implementation.

Endpoints:
- /kpi-summary-v2 - All KPI metrics via registry

Performance:
- Date filter added to reduce row scans (300K → ~50K rows)
- Max lookback is 40 months (covers market_momentum's 36-month volatility)
"""

import time
from datetime import date, timedelta
from flask import request, jsonify, g
from sqlalchemy import text
from routes.analytics import analytics_bp
from models.database import db
from db.sql import OUTLIER_FILTER
from utils.normalize import to_date
from api.contracts import api_contract


def _months_back(from_date: date, months: int) -> date:
    """Go back N months from a date, returning 1st of that month."""
    year = from_date.year
    month = from_date.month - months
    while month <= 0:
        month += 12
        year -= 1
    return date(year, month, 1)


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
        # Use normalized params from Pydantic (via @api_contract decorator)
        params = g.normalized_params
        filters = {}

        # District filter (Pydantic normalizes 'district' → 'districts')
        districts = params.get('districts')
        if districts:
            filters['districts'] = districts

        # Bedroom filter (Pydantic normalizes 'bedroom' → 'bedrooms')
        bedrooms = params.get('bedrooms')
        if bedrooms:
            filters['bedrooms'] = bedrooms

        # Segment filter (Pydantic normalizes 'segment' → 'segments')
        segments = params.get('segments')
        if segments:
            filters['segments'] = segments

        # Date filter - use max from DB if not provided (like v1 does)
        max_date_param = params.get('max_date')
        if max_date_param:
            filters['max_date'] = max_date_param
        else:
            # Default to latest transaction date in database
            filters['max_date'] = _get_max_transaction_date()

        # PERFORMANCE: Add date_from to reduce row scans
        # Max lookback is 36 months (market_momentum volatility) + 4 months buffer
        # This helps PostgreSQL use indexes more effectively
        # Reduces scan from 300K rows to ~50K rows
        if filters['max_date']:
            filters['date_from'] = _months_back(filters['max_date'], 40)

        # Run all KPIs via registry
        kpi_results = run_all_kpis(filters)

        elapsed = time.time() - start
        print(f"GET /api/kpi-summary-v2 completed in {elapsed:.4f}s")

        # Always use { data: {...}, meta: {...} } envelope
        # This matches the @api_contract wrapper expectation
        # Frontend apiClient unwraps the envelope, so callers just do result.kpis
        return jsonify({
            "data": {
                "kpis": kpi_results
            },
            "meta": {
                "elapsedMs": round(elapsed * 1000, 2),
                "filtersApplied": filters
            }
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/kpi-summary-v2 ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/kpi-summary-v2/<kpi_id>", methods=["GET"])
@api_contract("kpi-summary-v2/single")
def kpi_single(kpi_id: str):
    """
    Get a single KPI by ID.

    Useful for testing or selective refresh.
    """
    from services.kpi import get_kpi_by_id

    start = time.time()

    try:
        # Use normalized params from Pydantic (via @api_contract decorator)
        params = g.normalized_params
        filters = {}

        # Pydantic normalizes singular → plural
        districts = params.get('districts')
        if districts:
            filters['districts'] = districts

        bedrooms = params.get('bedrooms')
        if bedrooms:
            filters['bedrooms'] = bedrooms

        segments = params.get('segments')
        if segments:
            filters['segments'] = segments

        # Default to latest transaction date
        filters['max_date'] = _get_max_transaction_date()

        # PERFORMANCE: Add date_from to reduce row scans
        if filters['max_date']:
            filters['date_from'] = _months_back(filters['max_date'], 40)

        result = get_kpi_by_id(kpi_id, filters)

        elapsed = time.time() - start
        return jsonify({
            "kpi": result,
            "meta": {"elapsed_ms": round(elapsed * 1000, 2)}
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500
