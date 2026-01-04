"""
Dashboard Endpoints

Main unified dashboard endpoint that returns all chart datasets in one response.

Endpoints:
- /dashboard - Unified dashboard data (GET/POST)
- /dashboard/cache - Cache management
"""

import time
from datetime import timedelta
from flask import request, jsonify, g
from routes.analytics import analytics_bp
from utils.normalize import (
    ValidationError as NormalizeValidationError, validation_error_response
)
from api.contracts import api_contract


@analytics_bp.route("/dashboard", methods=["GET", "POST"])
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

    start = time.time()

    try:
        params = getattr(g, "normalized_params", {}) or {}
        filters = {}
        options = {}
        panels_param = None

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

        date_from = params.get("date_from")
        date_to_exclusive = params.get("date_to_exclusive")
        if date_from:
            filters["date_from"] = date_from
        if date_to_exclusive:
            filters["date_to"] = date_to_exclusive - timedelta(days=1)

        districts = params.get("districts") or []
        if districts:
            filters["districts"] = districts

        bedrooms = _expand_csv_list(params.get("bedrooms"), item_type=int)
        if bedrooms:
            filters["bedrooms"] = bedrooms

        segments = _expand_csv_list(params.get("segments"))
        if segments:
            filters["segments"] = [s.upper() for s in segments]

        # sale_type already normalized to DB format by Pydantic validator
        sale_type = params.get("sale_type")
        if sale_type:
            filters["sale_type"] = sale_type

        if params.get("psf_min") is not None:
            filters["psf_min"] = params.get("psf_min")
        if params.get("psf_max") is not None:
            filters["psf_max"] = params.get("psf_max")
        if params.get("size_min") is not None:
            filters["size_min"] = params.get("size_min")
        if params.get("size_max") is not None:
            filters["size_max"] = params.get("size_max")
        # tenure already normalized to DB format by Pydantic validator
        tenure = params.get("tenure")
        if tenure:
            filters["tenure"] = tenure
        if params.get("property_age_min") is not None:
            filters["property_age_min"] = params.get("property_age_min")
        if params.get("property_age_max") is not None:
            filters["property_age_max"] = params.get("property_age_max")
        if params.get("property_age_bucket"):
            filters["property_age_bucket"] = params.get("property_age_bucket")
        if params.get("project_exact"):
            filters["project_exact"] = params.get("project_exact")
        elif params.get("project"):
            filters["project"] = params.get("project")

        panels_param = _expand_csv_list(params.get("panels"))
        if not panels_param:
            panels_param = None

        if params.get("time_grain"):
            options["time_grain"] = params.get("time_grain")
        if params.get("location_grain"):
            options["location_grain"] = params.get("location_grain")
        if params.get("histogram_bins") is not None:
            options["histogram_bins"] = params.get("histogram_bins")
        options["show_full_range"] = params.get("show_full_range", False)

        skip_cache = params.get("skip_cache", False)

        # Get dashboard data
        result = get_dashboard_data(
            filters=filters,
            panels=panels_param if panels_param else None,
            options=options if options else None,
            skip_cache=skip_cache
        )

        # SECURITY: Mask project names in volume_by_location for free users
        # when location_grain=project (apply before serialization)
        from utils.subscription import is_premium_user
        if not is_premium_user() and options.get('location_grain') == 'project':
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

        elapsed = time.time() - start
        print(f"GET /api/dashboard took: {elapsed:.4f} seconds (cache_hit: {result['meta'].get('cache_hit', False)})")

        return jsonify(serialized)

    except NormalizeValidationError as e:
        return validation_error_response(e)

    except ValidationError as e:
        elapsed = time.time() - start
        print(f"GET /api/dashboard validation error (took {elapsed:.4f}s): {e}")
        return jsonify({
            "error": "Validation error",
            "details": e.args[0] if e.args else str(e)
        }), 400

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/dashboard ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({
            "error": str(e)
        }), 500

