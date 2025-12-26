"""
Core Analytics Endpoints

The main endpoints that power the dashboard:
- /dashboard - Unified dashboard data
- /dashboard/cache - Cache management
- /aggregate - Flexible aggregation (THE STANDARD)
- /aggregate-summary - URA-compliant summary
- /filter-options - Available filter values
- /kpi-summary - KPI cards data
"""

import time
from flask import request, jsonify
from routes.analytics import analytics_bp, reader
from constants import (
    SALE_TYPE_NEW, SALE_TYPE_RESALE,
    TENURE_FREEHOLD, TENURE_99_YEAR, TENURE_999_YEAR
)


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


@analytics_bp.route("/aggregate", methods=["GET"])
def aggregate():
    """
    Flexible aggregation endpoint for Power BI-style dynamic filtering.
    Uses SQL-level aggregation for memory efficiency.

    Now includes server-side caching for faster repeated queries.

    API Parameter Convention:
      All filter parameters use SINGULAR form with comma-separated values for multiple selections.
      Example: ?district=D01,D02&bedroom=2,3 (NOT ?districts=...)

    Query params:
      - group_by: comma-separated dimensions (month, quarter, year, district, bedroom, sale_type, project, region, floor_level)
      - metrics: comma-separated metrics (count, median_psf, avg_psf, total_value, median_price, avg_price, min_psf, max_psf, price_25th, price_75th, psf_25th, psf_75th, median_psf_actual)
      - district: comma-separated districts (D01,D02,...)
      - bedroom: comma-separated bedroom counts (2,3,4)
      - segment: CCR, RCR, OCR (filters by market segment)
      - sale_type: New Sale, Resale
      - date_from: YYYY-MM-DD
      - date_to: YYYY-MM-DD
      - psf_min: minimum PSF
      - psf_max: maximum PSF
      - size_min: minimum sqft
      - size_max: maximum sqft
      - tenure: Freehold, 99-year, 999-year
      - project: project name filter (partial match)
      - limit: max rows to return (1-10000, useful for project grouping)
      - skip_cache: if 'true', bypass cache

    IMPORTANT - Segment vs Region:
      - Input param: "segment" (CCR, RCR, OCR) - filters transactions by market segment
      - When group_by includes "region", output field is labeled "region" (not "segment")
      - Both refer to the same concept: URA market segments (CCR/RCR/OCR)
      - This naming reflects: segment=filter param, region=grouping dimension

    Returns:
      {
        "data": [...aggregated results...],
        "meta": {
          "total_records": N,
          "filters_applied": {...},
          "group_by": [...],
          "metrics": [...],
          "cache_hit": bool
        }
      }
    """
    import time
    import hashlib
    import json
    from datetime import datetime
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func, and_, or_, extract, cast, String, Integer, literal_column
    from services.data_processor import _get_market_segment
    from services.dashboard_service import _dashboard_cache
    from schemas.api_contract import serialize_aggregate_response

    start = time.time()

    # Schema version: v2 returns camelCase + lowercase enums only, v1 (default) returns both
    schema_version = request.args.get('schema', 'v1')
    include_deprecated = (schema_version != 'v2')

    # Build cache key from query string
    skip_cache = request.args.get('skip_cache', '').lower() == 'true'
    cache_key = f"aggregate:{request.query_string.decode('utf-8')}"

    # Check cache first
    if not skip_cache:
        cached = _dashboard_cache.get(cache_key)
        if cached is not None:
            elapsed = time.time() - start
            cached['meta']['cache_hit'] = True
            cached['meta']['elapsed_ms'] = int(elapsed * 1000)
            print(f"GET /api/aggregate CACHE HIT in {elapsed:.4f} seconds")
            return jsonify(cached)

    # Parse parameters
    group_by_param = request.args.get("group_by", "month")
    metrics_param = request.args.get("metrics", "count,avg_psf")

    group_by = [g.strip() for g in group_by_param.split(",") if g.strip()]
    metrics = [m.strip() for m in metrics_param.split(",") if m.strip()]

    # SUBSCRIPTION CHECK: Granularity restriction for free users
    # NOTE: 60-day time restriction removed - using blur paywall instead (all data visible but blurred)
    from utils.subscription import check_granularity_allowed, is_premium_user
    is_premium = is_premium_user()

    allowed, error_msg = check_granularity_allowed(group_by_param, is_premium=is_premium)
    if not allowed:
        return jsonify({
            "error": error_msg,
            "code": "PREMIUM_REQUIRED",
            "upgrade_prompt": "Unlock Unit-Level Precision"
        }), 403

    # Build filter conditions (we'll reuse these)
    # ALWAYS exclude outliers first
    filter_conditions = [Transaction.outlier_filter()]
    filters_applied = {}

    # District filter
    districts_param = request.args.get("district")
    if districts_param:
        districts = [d.strip().upper() for d in districts_param.split(",") if d.strip()]
        normalized = []
        for d in districts:
            if not d.startswith("D"):
                d = f"D{d.zfill(2)}"
            normalized.append(d)
        filter_conditions.append(Transaction.district.in_(normalized))
        filters_applied["district"] = normalized

    # Bedroom filter
    bedroom_param = request.args.get("bedroom")
    if bedroom_param:
        bedrooms = [int(b.strip()) for b in bedroom_param.split(",") if b.strip()]
        filter_conditions.append(Transaction.bedroom_count.in_(bedrooms))
        filters_applied["bedroom"] = bedrooms

    # Segment filter (supports comma-separated values e.g., "CCR,RCR")
    # OPTIMIZED: Use pre-computed district→segment mapping from constants
    # instead of N+1 database query
    segment = request.args.get("segment")
    if segment:
        from constants import get_districts_for_region
        segments = [s.strip().upper() for s in segment.split(',') if s.strip()]
        segment_districts = []
        for seg in segments:
            segment_districts.extend(get_districts_for_region(seg))
        if segment_districts:
            filter_conditions.append(Transaction.district.in_(segment_districts))
        filters_applied["segment"] = segments

    # Sale type filter (case-insensitive to handle data variations)
    sale_type = request.args.get("sale_type")
    if sale_type:
        # Use case-insensitive comparison to handle 'New Sale', 'NEW SALE', 'new sale', etc.
        filter_conditions.append(func.lower(Transaction.sale_type) == sale_type.lower())
        filters_applied["sale_type"] = sale_type

    # Date range filter
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    if date_from:
        try:
            from_dt = datetime.strptime(date_from, "%Y-%m-%d").date()
            filter_conditions.append(Transaction.transaction_date >= from_dt)
            filters_applied["date_from"] = date_from
        except ValueError:
            pass
    if date_to:
        try:
            to_dt = datetime.strptime(date_to, "%Y-%m-%d").date()
            filter_conditions.append(Transaction.transaction_date <= to_dt)
            filters_applied["date_to"] = date_to
        except ValueError:
            pass

    # PSF range filter
    psf_min = request.args.get("psf_min")
    psf_max = request.args.get("psf_max")
    if psf_min:
        filter_conditions.append(Transaction.psf >= float(psf_min))
        filters_applied["psf_min"] = float(psf_min)
    if psf_max:
        filter_conditions.append(Transaction.psf <= float(psf_max))
        filters_applied["psf_max"] = float(psf_max)

    # Size range filter
    size_min = request.args.get("size_min")
    size_max = request.args.get("size_max")
    if size_min:
        filter_conditions.append(Transaction.area_sqft >= float(size_min))
        filters_applied["size_min"] = float(size_min)
    if size_max:
        filter_conditions.append(Transaction.area_sqft <= float(size_max))
        filters_applied["size_max"] = float(size_max)

    # Tenure filter
    tenure = request.args.get("tenure")
    if tenure:
        tenure_lower = tenure.lower()
        if tenure_lower == TENURE_FREEHOLD.lower():
            filter_conditions.append(or_(
                Transaction.tenure.ilike("%freehold%"),
                Transaction.remaining_lease == 999
            ))
        elif tenure_lower in [TENURE_99_YEAR.lower(), "99"]:
            filter_conditions.append(and_(
                Transaction.remaining_lease < 999,
                Transaction.remaining_lease > 0
            ))
        elif tenure_lower in [TENURE_999_YEAR.lower(), "999"]:
            filter_conditions.append(Transaction.remaining_lease == 999)
        filters_applied["tenure"] = tenure

    # Project filter - supports both partial match (search) and exact match (drill-through)
    # Use project_exact for drill-through views (ProjectDetailPanel)
    # Use project for search functionality (sidebar filter)
    project_exact = request.args.get("project_exact")
    project = request.args.get("project")
    if project_exact:
        # EXACT match - for ProjectDetailPanel drill-through
        filter_conditions.append(Transaction.project_name == project_exact)
        filters_applied["project_exact"] = project_exact
    elif project:
        # PARTIAL match - for search functionality
        filter_conditions.append(Transaction.project_name.ilike(f"%{project}%"))
        filters_applied["project"] = project

    # Get total count first (fast query)
    count_query = db.session.query(func.count(Transaction.id))
    if filter_conditions:
        count_query = count_query.filter(and_(*filter_conditions))
    total_records = count_query.scalar()

    if total_records == 0:
        elapsed = time.time() - start
        empty_meta = {
            "total_records": 0,
            "filters_applied": filters_applied,
            "group_by": group_by,
            "metrics": metrics,
            "elapsed_ms": int(elapsed * 1000),
            "schemaVersion": schema_version,
        }
        return jsonify(serialize_aggregate_response([], empty_meta, include_deprecated=include_deprecated))

    # Build group_by columns for SQL
    group_columns = []
    select_columns = []

    # Map group_by params to SQL expressions
    for g in group_by:
        if g == "district":
            group_columns.append(Transaction.district)
            select_columns.append(Transaction.district.label("district"))
        elif g == "bedroom":
            group_columns.append(Transaction.bedroom_count)
            select_columns.append(Transaction.bedroom_count.label("bedroom"))
        elif g == "sale_type":
            group_columns.append(Transaction.sale_type)
            select_columns.append(Transaction.sale_type.label("sale_type"))
        elif g == "project":
            group_columns.append(Transaction.project_name)
            select_columns.append(Transaction.project_name.label("project"))
        elif g == "year":
            year_col = cast(extract('year', Transaction.transaction_date), Integer)
            group_columns.append(year_col)
            select_columns.append(year_col.label("year"))
        elif g == "month":
            # Format as YYYY-MM - cast to integers for proper grouping
            year_col = cast(extract('year', Transaction.transaction_date), Integer)
            month_col = cast(extract('month', Transaction.transaction_date), Integer)
            # Use a combined expression for grouping
            group_columns.append(year_col)
            group_columns.append(month_col)
            select_columns.append(year_col.label("_year"))
            select_columns.append(month_col.label("_month"))
        elif g == "quarter":
            # Cast year to integer for proper grouping
            year_col = cast(extract('year', Transaction.transaction_date), Integer)
            # Use FLOOR and CAST for proper integer division to calculate quarter
            month_col = extract('month', Transaction.transaction_date)
            quarter_col = cast(func.floor((month_col - 1) / 3) + 1, Integer)
            group_columns.append(year_col)
            group_columns.append(quarter_col)
            select_columns.append(year_col.label("_year"))
            select_columns.append(quarter_col.label("_quarter"))
        elif g == "region":
            # Map districts to regions using CASE statement
            from sqlalchemy import case, literal
            # Import from centralized constants (SINGLE SOURCE OF TRUTH)
            from constants import CCR_DISTRICTS, RCR_DISTRICTS
            region_case = case(
                (Transaction.district.in_(CCR_DISTRICTS), literal('CCR')),
                (Transaction.district.in_(RCR_DISTRICTS), literal('RCR')),
                else_=literal('OCR')
            )
            group_columns.append(region_case)
            select_columns.append(region_case.label("region"))
        elif g == "floor_level":
            # Group by floor level classification
            group_columns.append(Transaction.floor_level)
            select_columns.append(Transaction.floor_level.label("floor_level"))

    # Add metric columns
    if "count" in metrics:
        select_columns.append(func.count(Transaction.id).label("count"))
    if "avg_psf" in metrics or "median_psf" in metrics:
        select_columns.append(func.avg(Transaction.psf).label("avg_psf"))
    if "total_value" in metrics:
        select_columns.append(func.sum(Transaction.price).label("total_value"))
    if "avg_price" in metrics or "median_price" in metrics:
        select_columns.append(func.avg(Transaction.price).label("avg_price"))
    if "min_psf" in metrics:
        select_columns.append(func.min(Transaction.psf).label("min_psf"))
    if "max_psf" in metrics:
        select_columns.append(func.max(Transaction.psf).label("max_psf"))
    if "min_price" in metrics:
        select_columns.append(func.min(Transaction.price).label("min_price"))
    if "max_price" in metrics:
        select_columns.append(func.max(Transaction.price).label("max_price"))
    if "avg_size" in metrics:
        select_columns.append(func.avg(Transaction.area_sqft).label("avg_size"))
    if "total_sqft" in metrics:
        select_columns.append(func.sum(Transaction.area_sqft).label("total_sqft"))
    if "price_25th" in metrics:
        select_columns.append(func.percentile_cont(0.25).within_group(Transaction.price).label("price_25th"))
    if "price_75th" in metrics:
        select_columns.append(func.percentile_cont(0.75).within_group(Transaction.price).label("price_75th"))
    if "psf_25th" in metrics:
        select_columns.append(func.percentile_cont(0.25).within_group(Transaction.psf).label("psf_25th"))
    if "psf_75th" in metrics:
        select_columns.append(func.percentile_cont(0.75).within_group(Transaction.psf).label("psf_75th"))
    if "median_psf_actual" in metrics:
        # True median PSF using percentile_cont(0.5)
        select_columns.append(func.percentile_cont(0.5).within_group(Transaction.psf).label("median_psf_actual"))

    # Build the query
    if select_columns:
        query = db.session.query(*select_columns)
    else:
        query = db.session.query(func.count(Transaction.id).label("count"))

    # Apply filters
    if filter_conditions:
        query = query.filter(and_(*filter_conditions))

    # Apply group by
    if group_columns:
        query = query.group_by(*group_columns)
        # Order by count descending for project grouping (most active first),
        # otherwise order by first group column
        if 'project' in group_by:
            query = query.order_by(func.count(Transaction.id).desc())
        else:
            query = query.order_by(group_columns[0])

    # Apply limit if specified (useful for project grouping which can return 5000+ rows)
    limit_param = request.args.get('limit')
    if limit_param:
        try:
            limit_val = int(limit_param)
            if 0 < limit_val <= 10000:  # Cap at 10k for safety
                query = query.limit(limit_val)
        except ValueError:
            pass  # Ignore invalid limit values

    # Execute query
    results = query.all()

    # Convert results to list of dicts
    data = []
    for row in results:
        row_dict = {}
        # Handle the row as a named tuple or similar
        if hasattr(row, '_asdict'):
            row_dict = row._asdict()
        else:
            # Fallback for older SQLAlchemy
            row_dict = dict(row._mapping) if hasattr(row, '_mapping') else {}

        # Post-process month/quarter formatting
        if "_year" in row_dict and "_month" in row_dict:
            year = int(row_dict.pop("_year")) if row_dict.get("_year") else None
            month = int(row_dict.pop("_month")) if row_dict.get("_month") else None
            if year and month:
                row_dict["month"] = f"{year}-{month:02d}"
        if "_year" in row_dict and "_quarter" in row_dict:
            year = int(row_dict.pop("_year")) if row_dict.get("_year") else None
            quarter = int(row_dict.pop("_quarter")) if row_dict.get("_quarter") else None
            if year and quarter:
                row_dict["quarter"] = f"{year}-Q{quarter}"

        # Clean up None values and convert types
        clean_dict = {}
        for key, value in row_dict.items():
            if value is None:
                clean_dict[key] = None
            elif isinstance(value, float):
                clean_dict[key] = round(value, 2)
            else:
                clean_dict[key] = value

        # Map avg to median if median was requested (approximation)
        if "median_psf" in metrics and "avg_psf" in clean_dict:
            clean_dict["median_psf"] = clean_dict.get("avg_psf")
        if "median_price" in metrics and "avg_price" in clean_dict:
            clean_dict["median_price"] = clean_dict.get("avg_price")

        data.append(clean_dict)

    elapsed = time.time() - start
    print(f"GET /api/aggregate took: {elapsed:.4f} seconds (returned {len(data)} groups from {total_records} records)")

    # Build meta for response
    meta = {
        "total_records": total_records,
        "filters_applied": filters_applied,
        "group_by": group_by,
        "metrics": metrics,
        "elapsed_ms": int(elapsed * 1000),
        "cache_hit": False,
        "note": "median values are approximated using avg for memory efficiency",
        "schemaVersion": schema_version,
        "subscription": {
            "is_premium": is_premium,
            "time_restricted": False  # All data available, blur paywall instead of time restriction
        }
    }

    # Wrap with API contract serializer (transforms field names + enum values)
    result = serialize_aggregate_response(data, meta, include_deprecated=include_deprecated)

    # Cache the result for faster repeated queries
    _dashboard_cache.set(cache_key, result)

    return jsonify(result)


# =============================================================================
# AGGREGATE SUMMARY ENDPOINT (URA-Compliant Replacement for /transactions)
# =============================================================================

# Cost controls to prevent DoS via expensive queries
MAX_TIME_BUCKETS = 40
MAX_BIN_COUNT = 20


def _make_aggregate_cache_key():
    """
    Generate stable cache key from normalized, sorted query params.

    CRITICAL: Uses stable string representation instead of hash()
    (Python hash() changes per restart, breaks caching)
    """
    relevant_params = [
        'district', 'segment', 'bedroom', 'saleType', 'sale_type',
        'tenure', 'date_from', 'date_to', 'price_min', 'price_max',
        'psf_min', 'psf_max', 'bin_count'
    ]
    sorted_params = sorted(
        (k, request.args.get(k))
        for k in relevant_params
        if request.args.get(k)
    )
    param_str = '&'.join(f"{k}={v}" for k, v in sorted_params)
    return f"agg_summary:{param_str}"


@analytics_bp.route("/aggregate-summary", methods=["GET"])
def aggregate_summary():
    """
    URA-Compliant aggregate summary endpoint.

    Returns aggregated market metrics and distributions without
    exposing individual transaction records.

    Query params:
      - district: Filter by district(s), comma-separated
      - segment: Filter by CCR/RCR/OCR
      - bedroom: Filter by bedroom count(s)
      - saleType/sale_type: Filter by New Sale/Resale
      - tenure: Filter by Freehold/99-year
      - date_from, date_to: Date range filter
      - price_min, price_max: Price range filter
      - psf_min, psf_max: PSF range filter
      - bin_count: Number of histogram bins (default 10, max 20)

    Returns:
      {
        "summary": {
          "observationCount": N,
          "medianPsf": N,
          "medianPrice": N,
          "psfRange": {"p10": N, "p25": N, "p50": N, "p75": N, "p90": N},
          "priceRange": {"p10": N, "p25": N, "p50": N, "p75": N, "p90": N}
        },
        "bedroomMix": [{"bedroom": 2, "count": N, "pct": N}, ...],
        "saleMix": [{"saleType": "resale", "count": N, "pct": N}, ...],
        "psfDistribution": [{"binStart": N, "binEnd": N, "count": N}, ...],
        "meta": {
          "kAnonymityPassed": true,
          "fallbackLevel": null,
          "observationCount": N
        }
      }
    """
    import time
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func, text
    from services.dashboard_service import _dashboard_cache
    from utils.subscription import (
        get_granularity_level,
        check_k_anonymity,
        build_k_anonymity_meta
    )

    start = time.time()

    # Check cache first
    cache_key = _make_aggregate_cache_key()
    cached = _dashboard_cache.get(cache_key)
    if cached:
        return jsonify(cached)

    # Enforce bin limits
    bin_count = min(int(request.args.get('bin_count', 10)), MAX_BIN_COUNT)

    # Build base query with outlier exclusion
    query = Transaction.active_query()

    # Collect filter params for K-anonymity check
    filter_params = {}

    # District filter
    districts_param = request.args.get("district")
    if districts_param:
        districts = [d.strip().upper() for d in districts_param.split(",") if d.strip()]
        normalized = []
        for d in districts:
            if not d.startswith("D"):
                d = f"D{d.zfill(2)}"
            normalized.append(d)
        query = query.filter(Transaction.district.in_(normalized))
        filter_params['district'] = districts_param

    # Segment filter
    segment = request.args.get("segment")
    if segment:
        from services.data_processor import _get_market_segment
        segments = [s.strip().upper() for s in segment.split(',') if s.strip()]
        all_districts = db.session.query(Transaction.district).distinct().all()
        segment_districts = [
            d[0] for d in all_districts
            if _get_market_segment(d[0]) in segments
        ]
        query = query.filter(Transaction.district.in_(segment_districts))
        filter_params['segment'] = segment

    # Bedroom filter
    bedroom_param = request.args.get("bedroom")
    if bedroom_param:
        bedrooms = [int(b.strip()) for b in bedroom_param.split(",") if b.strip()]
        query = query.filter(Transaction.bedroom_count.in_(bedrooms))

    # Sale type filter
    from schemas.api_contract import SaleType
    sale_type_param = request.args.get("saleType") or request.args.get("sale_type")
    if sale_type_param:
        if sale_type_param in SaleType.ALL:
            sale_type_db = SaleType.to_db(sale_type_param)
        else:
            sale_type_db = sale_type_param
        query = query.filter(func.lower(Transaction.sale_type) == sale_type_db.lower())

    # Date range filter
    from datetime import datetime
    date_from = request.args.get("date_from")
    date_to = request.args.get("date_to")
    if date_from:
        try:
            from_dt = datetime.strptime(date_from, "%Y-%m-%d").date()
            query = query.filter(Transaction.transaction_date >= from_dt)
        except ValueError:
            pass
    if date_to:
        try:
            to_dt = datetime.strptime(date_to, "%Y-%m-%d").date()
            query = query.filter(Transaction.transaction_date <= to_dt)
        except ValueError:
            pass

    # Price/PSF range filters
    price_min = request.args.get("price_min")
    price_max = request.args.get("price_max")
    if price_min:
        query = query.filter(Transaction.price >= float(price_min))
    if price_max:
        query = query.filter(Transaction.price <= float(price_max))

    psf_min = request.args.get("psf_min")
    psf_max = request.args.get("psf_max")
    if psf_min:
        query = query.filter(Transaction.psf >= float(psf_min))
    if psf_max:
        query = query.filter(Transaction.psf <= float(psf_max))

    # Get total count for K-anonymity check
    total_count = query.count()

    # Check K-anonymity
    granularity = get_granularity_level(filter_params)
    passes_k, k_error = check_k_anonymity(total_count, level=granularity)

    if not passes_k:
        # Return minimal response with K-anonymity warning
        result = {
            "summary": None,
            "bedroomMix": [],
            "saleMix": [],
            "psfDistribution": [],
            "meta": build_k_anonymity_meta(False, granularity, total_count),
            "warning": k_error
        }
        return jsonify(result)

    # Calculate aggregates using SQL
    # PSF percentiles
    psf_stats = db.session.query(
        func.percentile_cont(0.10).within_group(Transaction.psf).label('p10'),
        func.percentile_cont(0.25).within_group(Transaction.psf).label('p25'),
        func.percentile_cont(0.50).within_group(Transaction.psf).label('p50'),
        func.percentile_cont(0.75).within_group(Transaction.psf).label('p75'),
        func.percentile_cont(0.90).within_group(Transaction.psf).label('p90'),
    ).filter(
        Transaction.is_outlier == False
    )

    # Apply same filters to stats query
    if districts_param:
        psf_stats = psf_stats.filter(Transaction.district.in_(normalized))
    if segment:
        psf_stats = psf_stats.filter(Transaction.district.in_(segment_districts))
    if bedroom_param:
        psf_stats = psf_stats.filter(Transaction.bedroom_count.in_(bedrooms))
    if sale_type_param:
        psf_stats = psf_stats.filter(func.lower(Transaction.sale_type) == sale_type_db.lower())
    if date_from:
        psf_stats = psf_stats.filter(Transaction.transaction_date >= from_dt)
    if date_to:
        psf_stats = psf_stats.filter(Transaction.transaction_date <= to_dt)

    psf_result = psf_stats.first()

    # Price percentiles (similar structure)
    price_stats = db.session.query(
        func.percentile_cont(0.10).within_group(Transaction.price).label('p10'),
        func.percentile_cont(0.25).within_group(Transaction.price).label('p25'),
        func.percentile_cont(0.50).within_group(Transaction.price).label('p50'),
        func.percentile_cont(0.75).within_group(Transaction.price).label('p75'),
        func.percentile_cont(0.90).within_group(Transaction.price).label('p90'),
    ).filter(
        Transaction.is_outlier == False
    )

    # Apply same filters
    if districts_param:
        price_stats = price_stats.filter(Transaction.district.in_(normalized))
    if segment:
        price_stats = price_stats.filter(Transaction.district.in_(segment_districts))
    if bedroom_param:
        price_stats = price_stats.filter(Transaction.bedroom_count.in_(bedrooms))
    if sale_type_param:
        price_stats = price_stats.filter(func.lower(Transaction.sale_type) == sale_type_db.lower())
    if date_from:
        price_stats = price_stats.filter(Transaction.transaction_date >= from_dt)
    if date_to:
        price_stats = price_stats.filter(Transaction.transaction_date <= to_dt)

    price_result = price_stats.first()

    # Bedroom mix
    bedroom_mix_query = db.session.query(
        Transaction.bedroom_count,
        func.count(Transaction.id).label('count')
    ).filter(
        Transaction.is_outlier == False
    ).group_by(Transaction.bedroom_count)

    # Apply filters
    if districts_param:
        bedroom_mix_query = bedroom_mix_query.filter(Transaction.district.in_(normalized))
    if segment:
        bedroom_mix_query = bedroom_mix_query.filter(Transaction.district.in_(segment_districts))
    if sale_type_param:
        bedroom_mix_query = bedroom_mix_query.filter(func.lower(Transaction.sale_type) == sale_type_db.lower())
    if date_from:
        bedroom_mix_query = bedroom_mix_query.filter(Transaction.transaction_date >= from_dt)
    if date_to:
        bedroom_mix_query = bedroom_mix_query.filter(Transaction.transaction_date <= to_dt)

    bedroom_mix_result = bedroom_mix_query.all()
    bedroom_total = sum(r.count for r in bedroom_mix_result) or 1
    bedroom_mix = [
        {
            "bedroom": r.bedroom_count,
            "count": r.count,
            "pct": round(r.count / bedroom_total * 100, 1)
        }
        for r in bedroom_mix_result
    ]

    # Sale type mix
    sale_mix_query = db.session.query(
        Transaction.sale_type,
        func.count(Transaction.id).label('count')
    ).filter(
        Transaction.is_outlier == False
    ).group_by(Transaction.sale_type)

    # Apply filters
    if districts_param:
        sale_mix_query = sale_mix_query.filter(Transaction.district.in_(normalized))
    if segment:
        sale_mix_query = sale_mix_query.filter(Transaction.district.in_(segment_districts))
    if bedroom_param:
        sale_mix_query = sale_mix_query.filter(Transaction.bedroom_count.in_(bedrooms))
    if date_from:
        sale_mix_query = sale_mix_query.filter(Transaction.transaction_date >= from_dt)
    if date_to:
        sale_mix_query = sale_mix_query.filter(Transaction.transaction_date <= to_dt)

    sale_mix_result = sale_mix_query.all()
    sale_total = sum(r.count for r in sale_mix_result) or 1
    sale_mix = [
        {
            "saleType": SaleType.from_db(r.sale_type) if r.sale_type else "unknown",
            "count": r.count,
            "pct": round(r.count / sale_total * 100, 1)
        }
        for r in sale_mix_result
    ]

    # Build response
    result = {
        "summary": {
            "observationCount": total_count,
            "medianPsf": round(psf_result.p50) if psf_result and psf_result.p50 else None,
            "medianPrice": round(price_result.p50) if price_result and price_result.p50 else None,
            "psfRange": {
                "p10": round(psf_result.p10) if psf_result and psf_result.p10 else None,
                "p25": round(psf_result.p25) if psf_result and psf_result.p25 else None,
                "p50": round(psf_result.p50) if psf_result and psf_result.p50 else None,
                "p75": round(psf_result.p75) if psf_result and psf_result.p75 else None,
                "p90": round(psf_result.p90) if psf_result and psf_result.p90 else None,
            },
            "priceRange": {
                "p10": round(price_result.p10) if price_result and price_result.p10 else None,
                "p25": round(price_result.p25) if price_result and price_result.p25 else None,
                "p50": round(price_result.p50) if price_result and price_result.p50 else None,
                "p75": round(price_result.p75) if price_result and price_result.p75 else None,
                "p90": round(price_result.p90) if price_result and price_result.p90 else None,
            }
        },
        "bedroomMix": bedroom_mix,
        "saleMix": sale_mix,
        "psfDistribution": [],  # TODO: Add histogram if needed
        "meta": build_k_anonymity_meta(True, None, total_count)
    }

    elapsed = time.time() - start
    result["meta"]["elapsedMs"] = round(elapsed * 1000, 2)

    # Cache result
    _dashboard_cache.set(cache_key, result)

    return jsonify(result)

@analytics_bp.route("/filter-options", methods=["GET"])
def filter_options():
    """
    Get available filter options based on current data.
    Returns unique values for each filterable dimension.

    Query params:
      - schema: 'v1' (default) returns both old and new fields, 'v2' returns only camelCase + enums
    """
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func, distinct
    from services.data_processor import _get_market_segment
    from schemas.api_contract import serialize_filter_options, PropertyAgeBucket

    # Schema version: v1 (dual-mode) or v2 (strict)
    schema_version = request.args.get('schema', 'v1')
    include_deprecated = (schema_version != 'v2')

    try:
        # Base filter to exclude outliers
        outlier_filter = Transaction.outlier_filter()

        # Get distinct values for each dimension (excluding outliers)
        districts = [d[0] for d in db.session.query(distinct(Transaction.district)).filter(outlier_filter).order_by(Transaction.district).all()]
        bedrooms = [b[0] for b in db.session.query(distinct(Transaction.bedroom_count)).filter(outlier_filter).order_by(Transaction.bedroom_count).all() if b[0]]
        sale_types = [s[0] for s in db.session.query(distinct(Transaction.sale_type)).filter(outlier_filter).all() if s[0]]
        projects = [p[0] for p in db.session.query(distinct(Transaction.project_name)).filter(outlier_filter).order_by(Transaction.project_name).limit(500).all() if p[0]]

        # Get date range (excluding outliers)
        min_date = db.session.query(func.min(Transaction.transaction_date)).filter(outlier_filter).scalar()
        max_date = db.session.query(func.max(Transaction.transaction_date)).filter(outlier_filter).scalar()

        # Get PSF range (excluding outliers)
        psf_stats = db.session.query(
            func.min(Transaction.psf),
            func.max(Transaction.psf)
        ).filter(outlier_filter).first()

        # Get size range (excluding outliers)
        size_stats = db.session.query(
            func.min(Transaction.area_sqft),
            func.max(Transaction.area_sqft)
        ).filter(outlier_filter).first()

        # Get tenure options (excluding outliers)
        tenures = [t[0] for t in db.session.query(distinct(Transaction.tenure)).filter(outlier_filter).all() if t[0]]

        # Group districts by region
        regions = {"CCR": [], "RCR": [], "OCR": []}
        for d in districts:
            region = _get_market_segment(d)
            if region in regions:
                regions[region].append(d)

        # Use serializer to transform response
        date_range = {
            "min": min_date.isoformat() if min_date else None,
            "max": max_date.isoformat() if max_date else None
        }
        psf_range = {
            "min": psf_stats[0] if psf_stats else None,
            "max": psf_stats[1] if psf_stats else None
        }
        size_range = {
            "min": size_stats[0] if size_stats else None,
            "max": size_stats[1] if size_stats else None
        }

        return jsonify(serialize_filter_options(
            districts=districts,
            regions=regions,
            bedrooms=bedrooms,
            sale_types=sale_types,
            projects=projects[:100],  # Limit project list
            date_range=date_range,
            psf_range=psf_range,
            size_range=size_range,
            tenures=tenures,
            property_age_buckets=PropertyAgeBucket.ALL,
            include_deprecated=include_deprecated
        ))
    except Exception as e:
        print(f"GET /api/filter-options ERROR: {e}")
        return jsonify({"error": str(e)}), 500


@analytics_bp.route("/kpi-summary", methods=["GET"])
def kpi_summary():
    """
    Single optimized endpoint for KPI cards - returns all metrics in one call.

    Uses a single SQL query with CTEs for maximum performance.

    Query params:
      - district: comma-separated districts
      - bedroom: comma-separated bedroom counts
      - segment: CCR, RCR, OCR

    Returns:
      {
        "medianPsf": { "current": 1842, "previous": 1798, "trend": 2.4 },
        "priceSpread": { "iqr": 485, "iqrRatio": 26.3, "label": "Stable" },
        "newLaunchPremium": { "value": 18.5, "trend": "widening" },
        "marketMomentum": { "score": 38, "label": "Seller's market" },
        "insights": {
          "psf": "Rising - sellers have leverage",
          "spread": "Normal variance",
          "premium": "High premium - consider resale",
          "momentum": "Good time to sell"
        }
      }
    """
    import time
    from datetime import datetime, timedelta
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func, text
    from db.sql import OUTLIER_FILTER

    start = time.time()

    try:
        # Get max date from metadata
        max_date_result = db.session.execute(text(f"""
            SELECT MAX(transaction_date) as max_date FROM transactions WHERE {OUTLIER_FILTER}
        """)).fetchone()

        if not max_date_result or not max_date_result.max_date:
            return jsonify({"error": "No data available"}), 404

        max_date = max_date_result.max_date
        thirty_days_ago = max_date - timedelta(days=30)
        sixty_days_ago = max_date - timedelta(days=60)

        # Build filter conditions
        filter_sql = OUTLIER_FILTER
        params = {
            'max_date': max_date,
            'thirty_days_ago': thirty_days_ago,
            'sixty_days_ago': sixty_days_ago
        }

        # District filter
        district_param = request.args.get('district')
        if district_param:
            districts = [d.strip().upper() for d in district_param.split(',') if d.strip()]
            normalized = []
            for d in districts:
                if not d.startswith('D'):
                    d = f'D{d.zfill(2)}'
                normalized.append(d)
            filter_sql += f" AND district IN :districts"
            params['districts'] = tuple(normalized)

        # Bedroom filter
        bedroom_param = request.args.get('bedroom')
        if bedroom_param:
            bedrooms = [int(b.strip()) for b in bedroom_param.split(',') if b.strip().isdigit()]
            filter_sql += f" AND num_bedrooms IN :bedrooms"
            params['bedrooms'] = tuple(bedrooms)

        # Segment filter
        segment_param = request.args.get('segment')
        if segment_param:
            from constants import get_districts_for_region
            segment = segment_param.upper()
            if segment in ['CCR', 'RCR', 'OCR']:
                segment_districts = get_districts_for_region(segment)
                filter_sql += f" AND district IN :segment_districts"
                params['segment_districts'] = tuple(segment_districts)

        # Single optimized query using CTEs
        sql = text(f"""
            WITH current_period AS (
                SELECT
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY psf) as psf_25,
                    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY psf) as psf_75,
                    COUNT(*) as txn_count
                FROM transactions
                WHERE {filter_sql}
                  AND transaction_date >= :thirty_days_ago
                  AND transaction_date <= :max_date
            ),
            previous_period AS (
                SELECT
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                    COUNT(*) as txn_count
                FROM transactions
                WHERE {filter_sql}
                  AND transaction_date >= :sixty_days_ago
                  AND transaction_date < :thirty_days_ago
            ),
            new_sales AS (
                SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
                FROM transactions
                WHERE {filter_sql}
                  AND sale_type = '{SALE_TYPE_NEW}'
                  AND transaction_date > :max_date - INTERVAL '12 months'
            ),
            young_resales AS (
                SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
                FROM transactions
                WHERE {filter_sql}
                  AND sale_type = '{SALE_TYPE_RESALE}'
                  AND transaction_date > :max_date - INTERVAL '12 months'
                  AND EXTRACT(YEAR FROM transaction_date) - COALESCE(lease_start_year, EXTRACT(YEAR FROM transaction_date) - 5) BETWEEN 4 AND 9
            )
            SELECT
                c.median_psf as current_psf,
                c.psf_25,
                c.psf_75,
                c.txn_count,
                p.median_psf as prev_psf,
                p.txn_count as prev_txn_count,
                n.median_psf as new_sale_psf,
                r.median_psf as resale_psf
            FROM current_period c
            CROSS JOIN previous_period p
            CROSS JOIN new_sales n
            CROSS JOIN young_resales r
        """)

        result = db.session.execute(sql, params).fetchone()

        if not result or not result.current_psf:
            # Return defaults if no data
            elapsed = time.time() - start
            return jsonify({
                "medianPsf": {"current": 0, "previous": 0, "trend": 0},
                "priceSpread": {"iqr": 0, "iqrRatio": 0, "label": "No data"},
                "newLaunchPremium": {"value": 0, "trend": "stable"},
                "marketMomentum": {"score": 50, "label": "No data"},
                "insights": {
                    "psf": "Insufficient data",
                    "spread": "Insufficient data",
                    "premium": "Insufficient data",
                    "momentum": "Insufficient data"
                },
                "meta": {"elapsed_ms": round(elapsed * 1000, 2), "txn_count": 0}
            })

        # Calculate metrics
        current_psf = float(result.current_psf or 0)
        prev_psf = float(result.prev_psf or current_psf)
        psf_25 = float(result.psf_25 or 0)
        psf_75 = float(result.psf_75 or 0)
        new_sale_psf = float(result.new_sale_psf or 0)
        resale_psf = float(result.resale_psf or 0)
        txn_count = int(result.txn_count or 0)
        prev_txn_count = int(result.prev_txn_count or 0)

        # PSF trend (only calculate if we have previous data)
        if prev_txn_count > 0 and prev_psf > 0:
            psf_trend = ((current_psf - prev_psf) / prev_psf * 100)
        else:
            psf_trend = None  # No data to compare

        # Price spread (IQR)
        iqr = psf_75 - psf_25
        iqr_ratio = (iqr / current_psf * 100) if current_psf > 0 else 0
        iqr_ratio = min(iqr_ratio, 100)  # Cap at 100%

        spread_label = "Very Stable" if iqr_ratio < 20 else "Stable" if iqr_ratio < 30 else "Moderate" if iqr_ratio < 40 else "Volatile"

        # New launch premium
        new_premium = ((new_sale_psf - resale_psf) / resale_psf * 100) if resale_psf > 0 else 0
        premium_trend = "widening" if new_premium > 15 else "narrowing" if new_premium < 10 else "stable"

        # Market momentum (based on PSF trend, default to 50 if no trend data)
        if psf_trend is not None:
            momentum_score = 50 - (psf_trend * 5)
            momentum_score = max(20, min(80, momentum_score))
        else:
            momentum_score = 50  # Neutral when no data
        momentum_label = "Buyer's market" if momentum_score >= 55 else "Seller's market" if momentum_score <= 45 else "Balanced"

        # Generate compact insights - just the numbers, no filler words
        # PSF: show previous vs current (handle no data case)
        if prev_txn_count > 0:
            psf_insight = f"Prev ${round(prev_psf):,} → Now ${round(current_psf):,}"
        else:
            psf_insight = f"Now ${round(current_psf):,} (no prev data)"

        # Spread: show percentiles
        spread_insight = f"P25 ${round(psf_25):,} · P75 ${round(psf_75):,}"

        # Premium: show new vs resale PSF
        if new_sale_psf > 0 and resale_psf > 0:
            premium_insight = f"New ${round(new_sale_psf):,} vs Resale ${round(resale_psf):,}"
        else:
            premium_insight = "Insufficient data"

        # Momentum: show the trend driving it
        if psf_trend is not None:
            momentum_insight = f"Trend {psf_trend:+.1f}% MoM"
        else:
            momentum_insight = "No trend data"

        elapsed = time.time() - start
        print(f"GET /api/kpi-summary completed in {elapsed:.4f}s")

        return jsonify({
            "medianPsf": {
                "current": round(current_psf),
                "previous": round(prev_psf) if prev_txn_count > 0 else None,
                "trend": round(psf_trend, 1) if psf_trend is not None else None
            },
            "priceSpread": {
                "iqr": round(iqr),
                "iqrRatio": round(iqr_ratio, 1),
                "label": spread_label
            },
            "newLaunchPremium": {
                "value": round(new_premium, 1),
                "trend": premium_trend
            },
            "marketMomentum": {
                "score": round(momentum_score),
                "label": momentum_label
            },
            "insights": {
                "psf": psf_insight,
                "spread": spread_insight,
                "premium": premium_insight,
                "momentum": momentum_insight
            },
            "meta": {
                "elapsed_ms": round(elapsed * 1000, 2),
                "current_period": {
                    "from": str(thirty_days_ago),
                    "to": str(max_date),
                    "txn_count": txn_count
                },
                "previous_period": {
                    "from": str(sixty_days_ago),
                    "to": str(thirty_days_ago),
                    "txn_count": prev_txn_count
                }
            }
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/kpi-summary ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

