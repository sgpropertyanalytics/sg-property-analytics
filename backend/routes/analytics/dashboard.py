"""
Dashboard Endpoints

Main unified dashboard endpoint that returns all chart datasets in one response.

Endpoints:
- /dashboard - Unified dashboard data (GET/POST)
- /dashboard/cache - Cache management
"""

import time
from flask import jsonify, g
from routes.analytics import analytics_bp
from routes.analytics._route_utils import route_logger, log_success, log_error
from routes.analytics._filter_builders import (
    build_dashboard_filters,
    build_dashboard_options,
    build_panels_param,
)
from utils.normalize import (
    ValidationError as NormalizeValidationError, validation_error_response
)
from api.contracts import api_contract
from utils.subscription import require_authenticated_access

logger = route_logger("dashboard")


@analytics_bp.route("/dashboard", methods=["GET", "POST"])
@require_authenticated_access
@api_contract("dashboard")
def dashboard():
    """
    Unified dashboard endpoint - returns all chart datasets in one response.

    This is the recommended endpoint for the Power BI-style dashboard.
    Uses SQL CTEs for efficient aggregation without loading data into memory.

    Supports both GET (query params) and POST (JSON body).

    Query params / JSON body:
      Filters:
        - date_from: YYYY-MM-DD
        - date_to: YYYY-MM-DD
        - district: comma-separated districts (D01,D02,...)
        - bedroom: comma-separated bedroom counts (2,3,4)
        - segment: CCR, RCR, OCR
        - sale_type: 'new_sale', 'resale', 'sub_sale'
        - psf_min, psf_max: PSF range
        - size_min, size_max: sqft range
        - tenure: freehold, 99_year, 999_year
        - project: project name filter (partial match)

      Options:
        - panels: comma-separated panels to return
                  (time_series, volume_by_location, price_histogram, bedroom_mix,
                   sale_type_breakdown, summary)
        - time_grain: year, quarter, month (default: month)
        - location_grain: region, district, project (default: region)
        - histogram_bins: number of bins for price histogram (default: 20, max: 50)
        - skip_cache: if 'true', bypass cache

    Returns:
      {
        "data": {
          "time_series": [...],
          "volume_by_location": [...],
          "price_histogram": [...],
          "bedroom_mix": [...],
          "summary": {...}
        },
        "meta": {
          "cache_hit": bool,
          "elapsed_ms": float,
          "filters_applied": {...},
          "total_records_matched": int
        }
      }

    Example:
      GET /api/dashboard?district=D09,D10&bedroom=2,3,4&time_grain=quarter
      GET /api/dashboard?segment=CCR&panels=time_series,summary
    """
    from services.dashboard_service import get_dashboard_data, ValidationError, get_cache_stats
    from api.contracts.contract_schema import serialize_dashboard_response

    start = time.perf_counter()

    try:
        params = getattr(g, "normalized_params", {}) or {}
        filters = build_dashboard_filters(params)
        options = build_dashboard_options(params)
        panels_param = build_panels_param(params)

        skip_cache = params.get("skip_cache", False)

        # Get dashboard data
        result = get_dashboard_data(
            filters=filters,
            panels=panels_param if panels_param else None,
            options=options if options else None,
            skip_cache=skip_cache
        )

        # SECURITY: Mask project names in volume_by_location for anonymous users
        # when location_grain=project (apply before serialization)
        from utils.subscription import has_authenticated_access
        if not has_authenticated_access() and options.get('location_grain') == 'project':
            if 'volume_by_location' in result.get('data', {}):
                # Mask project names to generic format: "Project #1", "Project #2", etc.
                for i, item in enumerate(result['data']['volume_by_location'], 1):
                    item['location'] = f"Project #{i}"
                # Add flag so frontend knows data is masked
                result['meta']['data_masked'] = True

        # Serialize to v2 schema
        serialized = serialize_dashboard_response(
            data=result.get('data', {}),
            meta=result.get('meta', {})
        )

        log_success(
            logger,
            "/api/dashboard",
            start,
            {
                "cache_hit": bool(result.get("meta", {}).get("cache_hit", False)),
                "panels": len(serialized.get("data", {})),
            },
        )

        return jsonify(serialized)

    except NormalizeValidationError as e:
        return validation_error_response(e)

    except ValidationError as e:
        log_error(logger, "/api/dashboard", start, e, {"error_type": "validation"})
        return jsonify({
            "error": "Validation error",
            "details": e.args[0] if e.args else str(e)
        }), 400

    except Exception as e:
        log_error(logger, "/api/dashboard", start, e)
        return jsonify({
            "error": str(e)
        }), 500
