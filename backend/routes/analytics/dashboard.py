"""
Dashboard Endpoints

Main unified dashboard endpoint that returns all chart datasets in one response.

Endpoints:
- /dashboard - Unified dashboard data (GET/POST)
- /dashboard/cache - Cache management
"""

import time
from flask import request, jsonify
from routes.analytics import analytics_bp
from constants import SALE_TYPE_NEW, SALE_TYPE_RESALE


@analytics_bp.route("/dashboard", methods=["GET", "POST"])
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
        - sale_type: 'New Sale' or 'Resale'
        - psf_min, psf_max: PSF range
        - size_min, size_max: sqft range
        - tenure: Freehold, 99-year, 999-year
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
    from schemas.api_contract import serialize_dashboard_response

    start = time.time()

    try:
        # Check if client requests v2 schema
        schema_version = request.args.get('schema', 'v1')
        include_deprecated = (schema_version != 'v2')

        # Parse parameters from GET query string or POST JSON body
        if request.method == 'POST' and request.is_json:
            body = request.get_json()
            filters = body.get('filters', {})
            panels_param = body.get('panels', [])
            options = body.get('options', {})
            skip_cache = body.get('skip_cache', False)
        else:
            # Parse from query params
            filters = {}
            options = {}

            # Date filters - parse to Python date objects
            from datetime import datetime
            if request.args.get('date_from'):
                try:
                    filters['date_from'] = datetime.strptime(request.args.get('date_from'), "%Y-%m-%d").date()
                except ValueError:
                    pass
            if request.args.get('date_to'):
                try:
                    filters['date_to'] = datetime.strptime(request.args.get('date_to'), "%Y-%m-%d").date()
                except ValueError:
                    pass

            # District filter
            if request.args.get('district'):
                districts = [d.strip() for d in request.args.get('district').split(',') if d.strip()]
                filters['districts'] = districts

            # Bedroom filter
            if request.args.get('bedroom'):
                bedrooms = [int(b.strip()) for b in request.args.get('bedroom').split(',') if b.strip()]
                filters['bedrooms'] = bedrooms

            # Segment filter - supports comma-separated values (e.g., "CCR,RCR")
            if request.args.get('segment'):
                segments = [s.strip().upper() for s in request.args.get('segment').split(',') if s.strip()]
                filters['segments'] = segments

            # Sale type filter (v2: saleType, v1: sale_type)
            sale_type = request.args.get('saleType') or request.args.get('sale_type')
            if sale_type:
                # Convert v2 enum to DB value if needed
                from schemas.api_contract import SaleType
                if sale_type in SaleType.ALL:
                    filters['sale_type'] = SaleType.to_db(sale_type)
                else:
                    filters['sale_type'] = sale_type

            # PSF range
            if request.args.get('psf_min'):
                filters['psf_min'] = float(request.args.get('psf_min'))
            if request.args.get('psf_max'):
                filters['psf_max'] = float(request.args.get('psf_max'))

            # Size range
            if request.args.get('size_min'):
                filters['size_min'] = float(request.args.get('size_min'))
            if request.args.get('size_max'):
                filters['size_max'] = float(request.args.get('size_max'))

            # Tenure filter
            if request.args.get('tenure'):
                filters['tenure'] = request.args.get('tenure')

            # Property age filter (years since TOP/lease start)
            # Note: This only applies to leasehold properties (freehold excluded)
            if request.args.get('property_age_min'):
                filters['property_age_min'] = int(request.args.get('property_age_min'))
            if request.args.get('property_age_max'):
                filters['property_age_max'] = int(request.args.get('property_age_max'))

            # Property age bucket filter (v2: propertyAgeBucket, v1: property_age_bucket)
            from schemas.api_contract import PropertyAgeBucket
            property_age_bucket = request.args.get('propertyAgeBucket') or request.args.get('property_age_bucket')
            if property_age_bucket and PropertyAgeBucket.is_valid(property_age_bucket):
                filters['property_age_bucket'] = property_age_bucket

            # Project filter - supports both partial match (search) and exact match (drill-through)
            if request.args.get('project_exact'):
                filters['project_exact'] = request.args.get('project_exact')
            elif request.args.get('project'):
                filters['project'] = request.args.get('project')

            # Panels
            panels_param = request.args.get('panels', '')
            if panels_param:
                panels_param = [p.strip() for p in panels_param.split(',') if p.strip()]
            else:
                panels_param = None  # Will use default

            # Options
            if request.args.get('time_grain'):
                options['time_grain'] = request.args.get('time_grain')
            if request.args.get('location_grain'):
                options['location_grain'] = request.args.get('location_grain')
            if request.args.get('histogram_bins'):
                options['histogram_bins'] = int(request.args.get('histogram_bins'))
            if request.args.get('show_full_range'):
                options['show_full_range'] = request.args.get('show_full_range', '').lower() == 'true'

            skip_cache = request.args.get('skip_cache', '').lower() == 'true'

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

        # Serialize to v2 schema (with backwards compat for v1)
        serialized = serialize_dashboard_response(
            data=result.get('data', {}),
            meta=result.get('meta', {}),
            include_deprecated=include_deprecated
        )

        elapsed = time.time() - start
        print(f"GET /api/dashboard took: {elapsed:.4f} seconds (cache_hit: {result['meta'].get('cache_hit', False)})")

        return jsonify(serialized)

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


@analytics_bp.route("/dashboard/cache", methods=["GET", "DELETE"])
def dashboard_cache():
    """
    Dashboard cache management endpoint.

    GET: Return cache statistics
    DELETE: Clear cache
    """
    from services.dashboard_service import get_cache_stats, clear_dashboard_cache

    if request.method == 'DELETE':
        clear_dashboard_cache()
        return jsonify({"status": "cache cleared"})

    return jsonify(get_cache_stats())
