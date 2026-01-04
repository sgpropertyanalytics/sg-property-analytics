"""
Aggregate Endpoints

Flexible aggregation endpoints for Power BI-style dynamic filtering.

Endpoints:
- /aggregate - Flexible GROUP BY queries (THE STANDARD)
"""

import time
from flask import jsonify, g
from routes.analytics import analytics_bp
from constants import (
    SALE_TYPE_NEW, SALE_TYPE_RESALE,
    TENURE_FREEHOLD, TENURE_99_YEAR, TENURE_999_YEAR
)
from datetime import timedelta, date, datetime
from typing import Optional, Tuple
from utils.normalize import (
    to_int, to_float, to_date, clamp_date_to_today,
    ValidationError as NormalizeValidationError, validation_error_response
)
from api.contracts import api_contract
from api.contracts.contract_schema import PropertyAgeBucket


def _get_project_lease_info(project_name: str) -> Tuple[Optional[int], Optional[str]]:
    """
    Get representative lease_start_year and dominant tenure for a project.

    Uses MODE (most common) lease_start_year from transactions.

    Returns:
        (lease_start_year, tenure_type) - either may be None
    """
    try:
        from models.database import db
        from sqlalchemy import text
        from db.sql import OUTLIER_FILTER

        # Get mode (most common) lease_start_year and tenure
        result = db.session.execute(text(f"""
            SELECT
                lease_start_year,
                tenure,
                COUNT(*) as cnt
            FROM transactions
            WHERE UPPER(project_name) = :project_name
              AND {OUTLIER_FILTER}
              AND lease_start_year IS NOT NULL
            GROUP BY lease_start_year, tenure
            ORDER BY cnt DESC
            LIMIT 1
        """), {"project_name": project_name.upper().strip()}).fetchone()

        if result:
            return (result[0], result[1])
        return (None, None)
    except Exception:
        return (None, None)


def _classify_age_band(
    lease_start_year: Optional[int],
    tenure: Optional[str],
    sale_type: Optional[str],
    as_of_year: int
) -> str:
    """
    Classify project into age band using canonical PropertyAgeBucket.classify().

    IMPORTANT: This is a thin wrapper around PropertyAgeBucket.classify().
    All classification logic lives in PropertyAgeBucket (single source of truth).

    Args:
        lease_start_year: Year lease commenced (from transactions)
        tenure: Tenure string (e.g., "Freehold", "99-year...")
        sale_type: Dominant sale type for the project
        as_of_year: Year to calculate age as-of (from query filters or current)

    Returns:
        Age band key from PropertyAgeBucket.ALL or 'unknown'
    """
    # Calculate age if we have lease data
    age = None
    if lease_start_year is not None:
        age = as_of_year - lease_start_year

    # Use canonical classifier (single source of truth)
    return PropertyAgeBucket.classify(
        age=age,
        sale_type=sale_type,
        tenure=tenure,
        strict=False  # Return 'unknown' for edge cases
    )


def _expand_csv_list(value, item_type=str) -> list:
    if value is None:
        return []
    items = value if isinstance(value, list) else [value]
    expanded = []
    for item in items:
        if isinstance(item, str) and "," in item:
            expanded.extend([p.strip() for p in item.split(",") if p.strip()])
        else:
            expanded.append(item)
    if item_type is int:
        try:
            return [int(v) for v in expanded]
        except (ValueError, TypeError):
            raise NormalizeValidationError("Invalid list value")
    return expanded


def _build_aggregate_cache_key(params: dict) -> str:
    from utils.cache_key import build_json_cache_key

    return build_json_cache_key("aggregate", params)


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
      - sale_type: new_sale, resale, sub_sale
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
          "totalRecords": N,
          "filtersApplied": {...},
          "cacheHit": bool,
          "requestId": "uuid",
          "elapsedMs": 45.2,
          "apiVersion": "v3"
        }
      }
    """
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func, and_, or_, extract, cast, String, Integer, literal_column
    from constants import get_region_for_district
    from services.dashboard_service import _dashboard_cache
    from api.contracts.contract_schema import serialize_aggregate_response

    start = time.time()

    params = getattr(g, "normalized_params", {}) or {}

    # Track if date normalization occurred (for user transparency)
    date_was_normalized = params.pop('_date_normalized', False)

    # Schema version: v2 only (v1 deprecated fields removed)
    schema_version = params.get('schema', 'v2').lower()
    if schema_version != 'v2':
        return jsonify({
            "error": "Unsupported schema version",
            "details": {"schema": schema_version, "supported": ["v2"]}
        }), 400

    # Build cache key from normalized params
    skip_cache = params.get("skip_cache", False)
    cache_key = _build_aggregate_cache_key(params)

    # Check cache first
    if not skip_cache:
        cached = _dashboard_cache.get(cache_key)
        if cached is not None:
            elapsed = time.time() - start
            cached['meta']['cacheHit'] = True
            cached['meta']['elapsedMs'] = int(elapsed * 1000)
            print(f"GET /api/aggregate CACHE HIT in {elapsed:.4f} seconds")
            return jsonify(cached)

    # Parse parameters
    group_by = params.get("group_by") or ["month"]
    metrics = params.get("metrics") or ["count", "avg_psf"]
    if isinstance(group_by, str):
        group_by = [g.strip() for g in group_by.split(",") if g.strip()]
    if isinstance(metrics, str):
        metrics = [m.strip() for m in metrics.split(",") if m.strip()]

    # SUBSCRIPTION CHECK: Granularity restriction for free users
    # NOTE: 60-day time restriction removed - using blur paywall instead (all data visible but blurred)
    from utils.subscription import check_granularity_allowed, is_premium_user
    is_premium = is_premium_user()

    group_by_param = ",".join(group_by)
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
    districts = params.get("districts") or []
    if districts:
        filter_conditions.append(Transaction.district.in_(districts))
        filters_applied["district"] = districts

    # Bedroom filter
    try:
        bedrooms = _expand_csv_list(params.get("bedrooms"), item_type=int)
        if bedrooms:
            filter_conditions.append(Transaction.bedroom_count.in_(bedrooms))
            filters_applied["bedroom"] = bedrooms
    except NormalizeValidationError as e:
        return validation_error_response(e)

    # Segment filter (supports comma-separated values e.g., "CCR,RCR")
    # OPTIMIZED: Use pre-computed district→segment mapping from constants
    segments = _expand_csv_list(params.get("segments"))
    if segments:
        from constants import get_districts_for_region
        segments = [s.strip().upper() for s in segments]
        segment_districts = []
        for seg in segments:
            segment_districts.extend(get_districts_for_region(seg))
        if segment_districts:
            filter_conditions.append(Transaction.district.in_(segment_districts))
        filters_applied["segment"] = segments

    # Sale type filter (case-insensitive to handle data variations)
    # sale_type already normalized to DB format by Pydantic validator
    sale_type = params.get("sale_type")
    if sale_type:
        filter_conditions.append(func.lower(Transaction.sale_type) == sale_type.lower())
        filters_applied["sale_type"] = sale_type

    # Date range filter
    from_dt = params.get("date_from")
    if from_dt:
        filter_conditions.append(Transaction.transaction_date >= from_dt)
        filters_applied["date_from"] = from_dt.isoformat()

    to_dt_exclusive = params.get("date_to_exclusive")
    to_dt = None
    if to_dt_exclusive:
        # Use exclusive upper bound to include all transactions on the end date
        filter_conditions.append(Transaction.transaction_date < to_dt_exclusive)
        to_dt = to_dt_exclusive - timedelta(days=1)
        filters_applied["date_to"] = to_dt.isoformat()

    # PSF range filter
    if params.get("psf_min") is not None:
        psf_min = params.get("psf_min")
        filter_conditions.append(Transaction.psf >= psf_min)
        filters_applied["psf_min"] = psf_min

    if params.get("psf_max") is not None:
        psf_max = params.get("psf_max")
        filter_conditions.append(Transaction.psf <= psf_max)
        filters_applied["psf_max"] = psf_max

    # Size range filter
    if params.get("size_min") is not None:
        size_min = params.get("size_min")
        filter_conditions.append(Transaction.area_sqft >= size_min)
        filters_applied["size_min"] = size_min

    if params.get("size_max") is not None:
        size_max = params.get("size_max")
        filter_conditions.append(Transaction.area_sqft <= size_max)
        filters_applied["size_max"] = size_max

    # Tenure filter
    tenure = params.get("tenure")
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
    project_exact = params.get("project_exact")
    project = params.get("project")
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
        # Build diagnostic warnings for empty results
        warnings = ["No records matched the applied filters."]
        if filters_applied:
            active_filters = list(filters_applied.keys())
            warnings.append(f"Active filters: {', '.join(active_filters)}")
            # Check for potentially restrictive combinations
            if len(active_filters) >= 3:
                warnings.append("Try removing some filters to broaden the search.")
            # Specific hints for common issues
            if "bedroom" in filters_applied and any(b >= 5 for b in (filters_applied.get("bedroom") or [])):
                warnings.append("5+ bedroom units are rare in many areas.")
            if "date_from" in filters_applied:
                warnings.append("Note: URA data is month-level (all transactions dated 1st of month).")
        # Add date normalization notice if dates were auto-aligned
        if date_was_normalized:
            warnings.append("Date range was auto-aligned to month boundaries (URA data is month-level).")
        empty_meta = {
            "totalRecords": 0,
            "filtersApplied": filters_applied,
            "elapsedMs": int(elapsed * 1000),
            "schemaVersion": schema_version,
            "warnings": warnings,
        }
        return jsonify(serialize_aggregate_response([], empty_meta))

    # Build group_by columns for SQL
    group_columns = []
    select_columns = []

    # Map group_by params to SQL expressions
    for group in group_by:
        if group == "district":
            group_columns.append(Transaction.district)
            select_columns.append(Transaction.district.label("district"))
        elif group == "bedroom":
            group_columns.append(Transaction.bedroom_count)
            select_columns.append(Transaction.bedroom_count.label("bedroom"))
        elif group == "sale_type":
            group_columns.append(Transaction.sale_type)
            select_columns.append(Transaction.sale_type.label("sale_type"))
        elif group == "project":
            group_columns.append(Transaction.project_name)
            select_columns.append(Transaction.project_name.label("project"))
        elif group == "year":
            year_col = cast(extract('year', Transaction.transaction_date), Integer)
            group_columns.append(year_col)
            select_columns.append(year_col.label("year"))
        elif group == "month":
            # Format as YYYY-MM - cast to integers for proper grouping
            year_col = cast(extract('year', Transaction.transaction_date), Integer)
            month_col = cast(extract('month', Transaction.transaction_date), Integer)
            # Use a combined expression for grouping
            group_columns.append(year_col)
            group_columns.append(month_col)
            select_columns.append(year_col.label("_year"))
            select_columns.append(month_col.label("_month"))
        elif group == "quarter":
            # Cast year to integer for proper grouping
            year_col = cast(extract('year', Transaction.transaction_date), Integer)
            # Use FLOOR and CAST for proper integer division to calculate quarter
            month_col = extract('month', Transaction.transaction_date)
            quarter_col = cast(func.floor((month_col - 1) / 3) + 1, Integer)
            group_columns.append(year_col)
            group_columns.append(quarter_col)
            select_columns.append(year_col.label("_year"))
            select_columns.append(quarter_col.label("_quarter"))
        elif group == "region":
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
        elif group == "floor_level":
            # Group by floor level classification
            group_columns.append(Transaction.floor_level)
            select_columns.append(Transaction.floor_level.label("floor_level"))
        elif group == "age_band":
            # Group by property age band using canonical PropertyAgeBucket
            # IMPORTANT: CASE expression built dynamically from PropertyAgeBucket constants
            # to ensure single source of truth (no hardcoded bucket strings)
            from sqlalchemy import case, literal, and_
            property_age = extract('year', Transaction.transaction_date) - Transaction.lease_start_year

            # Build CASE conditions dynamically from PropertyAgeBucket
            age_conditions = [
                # Priority 1: New Sale (market state, not age-based)
                (func.lower(Transaction.sale_type) == 'new sale', literal(PropertyAgeBucket.NEW_SALE)),
                # Priority 2: Freehold (no depreciation)
                (Transaction.tenure.ilike('%freehold%'), literal(PropertyAgeBucket.FREEHOLD)),
                # Priority 3: Missing lease_start_year
                (Transaction.lease_start_year.is_(None), literal('unknown')),
            ]

            # Add age-based conditions from canonical AGE_RANGES
            for bucket, (min_age, max_age) in PropertyAgeBucket.AGE_RANGES.items():
                if max_age is None:
                    condition = property_age >= min_age
                else:
                    condition = and_(property_age >= min_age, property_age < max_age)
                age_conditions.append((condition, literal(bucket)))

            age_band_case = case(*age_conditions, else_=literal('unknown'))
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
    limit_val = params.get("limit")
    if isinstance(limit_val, int) and 0 < limit_val <= 10000:
        query = query.limit(limit_val)

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
        # Use to_int() to safely handle unexpected values (avoids 500 on malformed data)
        if "_year" in row_dict and "_month" in row_dict:
            year = to_int(row_dict.pop("_year"))
            month = to_int(row_dict.pop("_month"))
            if year and month:
                row_dict["month"] = f"{year}-{month:02d}"
        if "_year" in row_dict and "_quarter" in row_dict:
            year = to_int(row_dict.pop("_year"))
            quarter = to_int(row_dict.pop("_quarter"))
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

    # Post-processing: Add total_units, top_year, and age_band for project grouping
    if needs_total_units and data:
        from services.new_launch_units import get_project_units

        # Determine "as-of" year for age calculation
        # If date_to filter provided, use that year; otherwise use current year
        as_of_year = to_dt.year if to_dt else date.today().year

        for row in data:
            project_name = row.get('project')
            if project_name:
                # Get unit inventory data
                units_info = get_project_units(project_name)
                row['total_units'] = units_info.get('total_units')
                row['top_year'] = units_info.get('top')
                row['total_units_source'] = units_info.get('unit_source')
                row['total_units_confidence'] = units_info.get('confidence')

                # Get lease info and classify age band
                lease_start_year, tenure = _get_project_lease_info(project_name)
                row['lease_start_year'] = lease_start_year
                if lease_start_year:
                    row['property_age_years'] = as_of_year - lease_start_year
                else:
                    row['property_age_years'] = None
                row['age_band'] = _classify_age_band(
                    lease_start_year, tenure, row.get('sale_type'), as_of_year
                )

    elapsed = time.time() - start
    print(f"GET /api/aggregate took: {elapsed:.4f} seconds (returned {len(data)} groups from {total_records} records)")

    # Build meta for response
    warnings = []
    if date_was_normalized:
        warnings.append("Date range was auto-aligned to month boundaries (URA data is month-level).")

    meta = {
        "totalRecords": total_records,
        "filtersApplied": filters_applied,
        "elapsedMs": int(elapsed * 1000),
        "cacheHit": False,
        "schemaVersion": schema_version,
    }
    # Only add warnings key if there are warnings
    if warnings:
        meta["warnings"] = warnings

    # Wrap with API contract serializer (transforms field names + enum values)
    result = serialize_aggregate_response(data, meta)

    # Cache the result for faster repeated queries
    _dashboard_cache.set(cache_key, result)

    return jsonify(result)


# =============================================================================
# AGGREGATE SUMMARY ENDPOINT (URA-Compliant Replacement for /transactions)
# =============================================================================

# Cost controls to prevent DoS via expensive queries
MAX_TIME_BUCKETS = 40
MAX_BIN_COUNT = 20


def _make_aggregate_cache_key(params: dict) -> str:
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
    from utils.cache_key import build_query_cache_key

    return build_query_cache_key("agg_summary", params, include_keys=relevant_params)
