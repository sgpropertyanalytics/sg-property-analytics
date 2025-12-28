"""
Aggregate Endpoints

Flexible aggregation endpoints for Power BI-style dynamic filtering.

Endpoints:
- /aggregate - Flexible GROUP BY queries (THE STANDARD)
- /aggregate-summary - URA-compliant summary without transaction records
"""

import time
from flask import request, jsonify, g
from routes.analytics import analytics_bp
from constants import (
    SALE_TYPE_NEW, SALE_TYPE_RESALE,
    TENURE_FREEHOLD, TENURE_99_YEAR, TENURE_999_YEAR
)
from datetime import timedelta
from utils.normalize import (
    to_int, to_float, to_date, to_list, to_bool, clamp_date_to_today,
    ValidationError as NormalizeValidationError, validation_error_response
)
from api.contracts import api_contract


@analytics_bp.route("/aggregate", methods=["GET"])
@api_contract("aggregate")
def aggregate():
    """
    Flexible aggregation endpoint for Power BI-style dynamic filtering.
    Uses SQL-level aggregation for memory efficiency.

    Now includes server-side caching for faster repeated queries.

    Contract enforcement via @api_contract decorator:
    - Validates params against schema (WARN mode by default)
    - Injects requestId and elapsedMs into meta
    - Logs contract violations for observability

    API Parameter Convention:
      All filter parameters use SINGULAR form with comma-separated values for multiple selections.
      Example: ?district=D01,D02&bedroom=2,3 (NOT ?districts=...)

    Query params:
      - group_by: comma-separated dimensions (month, quarter, year, district, bedroom, sale_type, project, region, floor_level, age_band)
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
          "cache_hit": bool,
          "requestId": "uuid",
          "elapsedMs": 45.2,
          "apiVersion": "v3"
        }
      }
    """
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
    try:
        bedrooms = to_list(request.args.get("bedroom"), item_type=int, field="bedroom")
        if bedrooms:
            filter_conditions.append(Transaction.bedroom_count.in_(bedrooms))
            filters_applied["bedroom"] = bedrooms
    except NormalizeValidationError as e:
        return validation_error_response(e)

    # Segment filter (supports comma-separated values e.g., "CCR,RCR")
    # OPTIMIZED: Use pre-computed district→segment mapping from constants
    # instead of N+1 database query
    # Also support 'region' as alias for 'segment' (backwards compatibility)
    segment = request.args.get("segment") or request.args.get("region")
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
    try:
        from_dt = to_date(request.args.get("date_from"), field="date_from")
        if from_dt:
            filter_conditions.append(Transaction.transaction_date >= from_dt)
            filters_applied["date_from"] = from_dt.isoformat()

        to_dt = clamp_date_to_today(to_date(request.args.get("date_to"), field="date_to"))
        if to_dt:
            # Use < next_day instead of <= to_dt to include all transactions on to_dt
            # PostgreSQL treats date as midnight, so <= 2025-12-27 means <= 2025-12-27 00:00:00
            filter_conditions.append(Transaction.transaction_date < to_dt + timedelta(days=1))
            filters_applied["date_to"] = to_dt.isoformat()
    except NormalizeValidationError as e:
        return validation_error_response(e)

    # PSF range filter
    try:
        psf_min = to_float(request.args.get("psf_min"), field="psf_min")
        if psf_min is not None:
            filter_conditions.append(Transaction.psf >= psf_min)
            filters_applied["psf_min"] = psf_min

        psf_max = to_float(request.args.get("psf_max"), field="psf_max")
        if psf_max is not None:
            filter_conditions.append(Transaction.psf <= psf_max)
            filters_applied["psf_max"] = psf_max

        # Size range filter
        size_min = to_float(request.args.get("size_min"), field="size_min")
        if size_min is not None:
            filter_conditions.append(Transaction.area_sqft >= size_min)
            filters_applied["size_min"] = size_min

        size_max = to_float(request.args.get("size_max"), field="size_max")
        if size_max is not None:
            filter_conditions.append(Transaction.area_sqft <= size_max)
            filters_applied["size_max"] = size_max
    except NormalizeValidationError as e:
        return validation_error_response(e)

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
        elif g == "age_band":
            # Group by property age band (for budget fair price analysis)
            # Property age = year(transaction_date) - lease_start_year
            from sqlalchemy import case, literal, and_
            property_age = extract('year', Transaction.transaction_date) - Transaction.lease_start_year
            age_band_case = case(
                # New Sale: always 'new_sale' regardless of age
                (func.lower(Transaction.sale_type) == 'new sale', literal('new_sale')),
                # Freehold: treat as 'freehold' (no depreciation)
                (Transaction.tenure.ilike('%freehold%'), literal('freehold')),
                # Missing lease_start_year: unknown
                (Transaction.lease_start_year.is_(None), literal('unknown')),
                # Age bands for resale properties
                (and_(property_age >= 0, property_age < 4), literal('just_top')),
                (and_(property_age >= 4, property_age < 8), literal('recently_top')),
                (and_(property_age >= 8, property_age < 15), literal('young_resale')),
                (and_(property_age >= 15, property_age < 25), literal('resale')),
                (property_age >= 25, literal('mature_resale')),
                else_=literal('unknown')
            )
            group_columns.append(age_band_case)
            select_columns.append(age_band_case.label("age_band"))

    # Add metric columns
    # ALWAYS include count - it's a row integrity field, not just a metric
    select_columns.append(func.count(Transaction.id).label("count"))
    if "avg_psf" in metrics:
        select_columns.append(func.avg(Transaction.psf).label("avg_psf"))
    if "median_psf" in metrics:
        # TRUE median using PERCENTILE_CONT(0.5), not a copy of avg
        select_columns.append(func.percentile_cont(0.5).within_group(Transaction.psf).label("median_psf"))
    if "total_value" in metrics:
        select_columns.append(func.sum(Transaction.price).label("total_value"))
    if "avg_price" in metrics:
        select_columns.append(func.avg(Transaction.price).label("avg_price"))
    if "median_price" in metrics:
        # TRUE median price using PERCENTILE_CONT(0.5)
        select_columns.append(func.percentile_cont(0.5).within_group(Transaction.price).label("median_price"))
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

    # total_units is handled via post-processing (not SQL aggregate)
    # It requires joining with project inventory data from CSV/database
    needs_total_units = "total_units" in metrics and "project" in group_by

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

        data.append(clean_dict)

    # Post-processing: Add total_units and top_year from project inventory data
    if needs_total_units and data:
        from services.new_launch_units import get_project_units
        for row in data:
            project_name = row.get('project')
            if project_name:
                units_info = get_project_units(project_name)
                row['total_units'] = units_info.get('total_units')
                row['top_year'] = units_info.get('top')  # TOP year for age calculation
                # Also include confidence for transparency
                row['total_units_source'] = units_info.get('unit_source')
                row['total_units_confidence'] = units_info.get('confidence')

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
@api_contract("aggregate-summary")
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
    from datetime import datetime
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
    try:
        bin_count = min(to_int(request.args.get('bin_count'), default=10, field='bin_count'), MAX_BIN_COUNT)
    except NormalizeValidationError as e:
        return validation_error_response(e)

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
    try:
        from_dt = to_date(request.args.get("date_from"), field="date_from")
        if from_dt:
            query = query.filter(Transaction.transaction_date >= from_dt)

        to_dt = clamp_date_to_today(to_date(request.args.get("date_to"), field="date_to"))
        if to_dt:
            # Use < next_day instead of <= to_dt to include all transactions on to_dt
            query = query.filter(Transaction.transaction_date < to_dt + timedelta(days=1))

        # Price/PSF range filters
        price_min = to_float(request.args.get("price_min"), field="price_min")
        if price_min is not None:
            query = query.filter(Transaction.price >= price_min)

        price_max = to_float(request.args.get("price_max"), field="price_max")
        if price_max is not None:
            query = query.filter(Transaction.price <= price_max)

        psf_min = to_float(request.args.get("psf_min"), field="psf_min")
        if psf_min is not None:
            query = query.filter(Transaction.psf >= psf_min)

        psf_max = to_float(request.args.get("psf_max"), field="psf_max")
        if psf_max is not None:
            query = query.filter(Transaction.psf <= psf_max)
    except NormalizeValidationError as e:
        return validation_error_response(e)

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
    if from_dt:
        psf_stats = psf_stats.filter(Transaction.transaction_date >= from_dt)
    if to_dt:
        # Use < next_day instead of <= to_dt to include all transactions on to_dt
        psf_stats = psf_stats.filter(Transaction.transaction_date < to_dt + timedelta(days=1))

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
    if from_dt:
        price_stats = price_stats.filter(Transaction.transaction_date >= from_dt)
    if to_dt:
        # Use < next_day instead of <= to_dt to include all transactions on to_dt
        price_stats = price_stats.filter(Transaction.transaction_date < to_dt + timedelta(days=1))

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
    if from_dt:
        bedroom_mix_query = bedroom_mix_query.filter(Transaction.transaction_date >= from_dt)
    if to_dt:
        # Use < next_day instead of <= to_dt to include all transactions on to_dt
        bedroom_mix_query = bedroom_mix_query.filter(Transaction.transaction_date < to_dt + timedelta(days=1))

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
    if from_dt:
        sale_mix_query = sale_mix_query.filter(Transaction.transaction_date >= from_dt)
    if to_dt:
        # Use < next_day instead of <= to_dt to include all transactions on to_dt
        sale_mix_query = sale_mix_query.filter(Transaction.transaction_date < to_dt + timedelta(days=1))

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
