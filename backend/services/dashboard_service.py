"""
Dashboard Service - High-Performance Unified Dashboard Aggregation

This service provides a single endpoint that returns all chart datasets in one response
using SQL CTEs for maximum efficiency. Designed for 100K-1M+ transactions without
loading raw data into memory.

Key Features:
- SQL-only aggregation (no pandas for aggregation)
- Multi-CTE queries for fetching all panels in one DB roundtrip
- Server-side histogram binning
- Normalized cache keys for deterministic caching
- Query timing and observability

Usage:
    from services.dashboard_service import get_dashboard_data

    result = get_dashboard_data(
        filters={'districts': ['D09', 'D10'], 'bedrooms': [2, 3, 4]},
        panels=['time_series', 'volume_by_location', 'price_histogram'],
        options={'time_grain': 'month', 'location_grain': 'district'}
    )
"""

import time
import hashlib
import json
import logging
from datetime import date, datetime, timedelta
from typing import Dict, Any, List, Optional
from functools import wraps
import threading

from sqlalchemy import text, func, case, literal, and_, or_, extract, cast, Integer, Float, exists
from sqlalchemy.orm import Session

from models.database import db
from models.transaction import Transaction
from db.sql import OUTLIER_FILTER, exclude_outliers

# Configure logging
logger = logging.getLogger('dashboard')
logging.basicConfig(level=logging.INFO)

# ============================================================================
# CONFIGURATION
# ============================================================================

# Query limits (guardrails)
MAX_DATE_RANGE_DAYS = 365 * 10  # 10 years max
MAX_HISTOGRAM_BINS = 50
DEFAULT_HISTOGRAM_BINS = 20
QUERY_TIMEOUT_SECONDS = 10
MAX_LOCATION_RESULTS = 50

# Cache configuration
# Extended TTL for better performance under load (data changes infrequently)
CACHE_TTL_SECONDS = 600  # 10 minutes (was 5)
CACHE_MAX_SIZE = 1000    # Increased capacity (was 500)

# District to region mapping - import from centralized constants (SINGLE SOURCE OF TRUTH)
from constants import (
    CCR_DISTRICTS, RCR_DISTRICTS, OCR_DISTRICTS,
    get_region_for_district, get_districts_for_region,
    TENURE_FREEHOLD, TENURE_99_YEAR, TENURE_999_YEAR
)

# ============================================================================
# CACHING
# ============================================================================

class TTLCache:
    """Simple TTL cache with max size limit."""

    def __init__(self, maxsize: int = 500, ttl: int = 300):
        self._cache = {}
        self._maxsize = maxsize
        self._ttl = ttl
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key in self._cache:
                value, timestamp = self._cache[key]
                if time.time() - timestamp < self._ttl:
                    return value
                else:
                    del self._cache[key]
            return None

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            # Evict oldest entries if at capacity
            if len(self._cache) >= self._maxsize:
                oldest_key = min(self._cache.keys(), key=lambda k: self._cache[k][1])
                del self._cache[oldest_key]
            self._cache[key] = (value, time.time())

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()

    def stats(self) -> Dict[str, Any]:
        return {
            'size': len(self._cache),
            'maxsize': self._maxsize,
            'ttl': self._ttl
        }


# Global cache instance
_dashboard_cache = TTLCache(maxsize=CACHE_MAX_SIZE, ttl=CACHE_TTL_SECONDS)

# Locks for cache stampede prevention
_key_locks = {}
_key_locks_lock = threading.Lock()


def get_cache_stats() -> Dict[str, Any]:
    """Get cache statistics for monitoring."""
    return _dashboard_cache.stats()


def clear_dashboard_cache() -> None:
    """Clear all cached dashboard data."""
    _dashboard_cache.clear()
    logger.info("Dashboard cache cleared")


# ============================================================================
# CACHE KEY GENERATION
# ============================================================================

def build_cache_key(filters: Dict[str, Any], panels: List[str], options: Dict[str, Any]) -> str:
    """
    Build deterministic cache key from normalized filter state.

    Ensures same filters always produce same key regardless of parameter order.
    """
    # Normalize filters
    normalized = {}

    for key, value in sorted(filters.items()):
        if value is None or value == [] or value == '':
            continue
        if isinstance(value, list):
            # Sort lists for deterministic ordering
            normalized[key] = sorted([str(v) for v in value])
        elif isinstance(value, dict):
            # Handle nested dicts (like date_range)
            normalized[key] = {k: str(v) for k, v in sorted(value.items()) if v is not None}
        else:
            normalized[key] = str(value)

    # Include panels and options in key
    cache_input = {
        'filters': normalized,
        'panels': sorted(panels),
        'options': {k: str(v) for k, v in sorted(options.items())}
    }

    # Create hash
    cache_str = json.dumps(cache_input, sort_keys=True)
    hash_key = hashlib.md5(cache_str.encode()).hexdigest()[:16]

    return f"dashboard:{hash_key}"


# ============================================================================
# VALIDATION
# ============================================================================

class ValidationError(Exception):
    """Raised when request validation fails."""
    pass


# Import centralized coercion utility
from utils.normalize import coerce_to_date as _coerce_to_date


def validate_request(filters: Dict[str, Any], panels: List[str], options: Dict[str, Any]) -> None:
    """
    Validate request parameters to prevent abuse and invalid queries.

    Raises:
        ValidationError: If validation fails
    """
    errors = []

    # Date range limit
    # Note: Routes should pass date objects (via to_date()), but we accept strings for legacy compatibility
    date_from = filters.get('date_from')
    date_to = filters.get('date_to')
    if date_from and date_to:
        try:
            from_dt = _coerce_to_date(date_from)
            to_dt = _coerce_to_date(date_to)
            if (to_dt - from_dt).days > MAX_DATE_RANGE_DAYS:
                errors.append(f"Date range exceeds {MAX_DATE_RANGE_DAYS} days limit")
            if from_dt > to_dt:
                errors.append("date_from must be before date_to")
        except ValueError:
            errors.append("Invalid date format. Use YYYY-MM-DD")

    # Histogram bins limit
    histogram_bins = options.get('histogram_bins', DEFAULT_HISTOGRAM_BINS)
    if histogram_bins > MAX_HISTOGRAM_BINS:
        errors.append(f"histogram_bins cannot exceed {MAX_HISTOGRAM_BINS}")

    # Valid panels
    valid_panels = {'time_series', 'volume_by_location', 'price_histogram',
                    'bedroom_mix', 'summary', 'sale_type_breakdown', 'beads_chart'}
    invalid_panels = set(panels) - valid_panels
    if invalid_panels:
        errors.append(f"Invalid panels: {invalid_panels}. Valid: {valid_panels}")

    # Valid time grains
    valid_time_grains = {'year', 'quarter', 'month'}
    time_grain = options.get('time_grain', 'month')
    if time_grain not in valid_time_grains:
        errors.append(f"Invalid time_grain: {time_grain}. Valid: {valid_time_grains}")

    # Valid location grains
    valid_location_grains = {'region', 'district', 'project'}
    location_grain = options.get('location_grain', 'region')
    if location_grain not in valid_location_grains:
        errors.append(f"Invalid location_grain: {location_grain}. Valid: {valid_location_grains}")

    if errors:
        raise ValidationError(errors)


# ============================================================================
# QUERY TIMING DECORATOR
# ============================================================================

def log_timing(operation: str):
    """Decorator to log operation timing."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            start = time.perf_counter()
            try:
                result = func(*args, **kwargs)
                elapsed = (time.perf_counter() - start) * 1000
                logger.info(f"{operation} completed in {elapsed:.1f}ms")
                if elapsed > 1000:
                    logger.warning(f"SLOW OPERATION: {operation} took {elapsed:.1f}ms")
                return result
            except Exception as e:
                elapsed = (time.perf_counter() - start) * 1000
                logger.error(f"{operation} failed after {elapsed:.1f}ms: {e}")
                raise
        return wrapper
    return decorator


# ============================================================================
# FILTER BUILDING
# ============================================================================

def normalize_district(district: str) -> str:
    """Normalize district format to DXX."""
    d = str(district).strip().upper()
    if not d.startswith('D'):
        d = f"D{d.zfill(2)}"
    return d


# get_region_for_district is imported from constants.py (SINGLE SOURCE OF TRUTH)
# get_districts_for_region is imported from constants.py (SINGLE SOURCE OF TRUTH)

def get_districts_for_segment(segment: str) -> List[str]:
    """Get all districts for a market segment. Wrapper for get_districts_for_region."""
    return get_districts_for_region(segment)


def build_filter_conditions(filters: Dict[str, Any]) -> List:
    """
    Build SQLAlchemy filter conditions from filter dict.

    Returns list of conditions to be combined with and_().
    Always excludes outliers using COALESCE(is_outlier, false) = false.
    """
    conditions = []

    # ALWAYS exclude outliers from all queries (null-safe)
    conditions.append(exclude_outliers(Transaction))

    # Date range
    # Note: Routes should pass date objects (via to_date()), but we accept strings for legacy compatibility
    if filters.get('date_from'):
        try:
            from_dt = _coerce_to_date(filters['date_from'])
            conditions.append(Transaction.transaction_date >= from_dt)
        except ValueError:
            pass

    if filters.get('date_to'):
        try:
            to_dt = _coerce_to_date(filters['date_to'])
            # Use < next_day instead of <= to_dt to include all transactions on to_dt
            conditions.append(Transaction.transaction_date < to_dt + timedelta(days=1))
        except ValueError:
            pass

    # Districts
    districts = filters.get('districts', [])
    if districts:
        if isinstance(districts, str):
            districts = [d.strip() for d in districts.split(',')]
        normalized = [normalize_district(d) for d in districts]
        conditions.append(Transaction.district.in_(normalized))

    # Segment (market region) - convert to districts, supports multiple segments
    # Issue B16: Both 'segments' (plural, preferred) and 'segment' (singular) are supported
    # for API compatibility. Frontend uses 'segments', some legacy code uses 'segment'.
    segments = filters.get('segments', [])
    if not segments:
        # Backwards compatibility: check for single 'segment' key
        single_segment = filters.get('segment')
        if single_segment:
            segments = [single_segment]

    if segments and not districts:  # Only apply if no explicit districts
        all_segment_districts = []
        for seg in segments:
            seg_districts = get_districts_for_segment(seg)
            if seg_districts:
                all_segment_districts.extend(seg_districts)
        if all_segment_districts:
            conditions.append(Transaction.district.in_(all_segment_districts))

    # Bedrooms
    bedrooms = filters.get('bedrooms', [])
    if bedrooms:
        if isinstance(bedrooms, str):
            bedrooms = [int(b.strip()) for b in bedrooms.split(',')]
        conditions.append(Transaction.bedroom_count.in_(bedrooms))

    # Sale type (case-insensitive)
    sale_type = filters.get('sale_type')
    if sale_type:
        conditions.append(func.lower(Transaction.sale_type) == sale_type.lower())

    # PSF range
    if filters.get('psf_min') is not None:
        conditions.append(Transaction.psf >= float(filters['psf_min']))
    if filters.get('psf_max') is not None:
        conditions.append(Transaction.psf <= float(filters['psf_max']))

    # Price range (for cross-filter from price distribution chart)
    if filters.get('price_min') is not None:
        conditions.append(Transaction.price >= float(filters['price_min']))
    if filters.get('price_max') is not None:
        conditions.append(Transaction.price <= float(filters['price_max']))

    # Size range
    if filters.get('size_min') is not None:
        conditions.append(Transaction.area_sqft >= float(filters['size_min']))
    if filters.get('size_max') is not None:
        conditions.append(Transaction.area_sqft <= float(filters['size_max']))

    # Tenure
    tenure = filters.get('tenure')
    if tenure:
        tenure_lower = tenure.lower()
        if tenure_lower == 'freehold':
            # Match freehold tenure, but exclude 999-year leasehold which also has remaining_lease=999
            conditions.append(or_(
                Transaction.tenure.ilike('%freehold%'),
                and_(
                    Transaction.remaining_lease == 999,
                    ~Transaction.tenure.ilike('%999%')
                )
            ))
        elif tenure_lower in [TENURE_99_YEAR.lower(), '99']:
            conditions.append(and_(
                Transaction.remaining_lease < 999,
                Transaction.remaining_lease > 0
            ))
        elif tenure_lower in [TENURE_999_YEAR.lower(), '999']:
            # Match 999-year leasehold by tenure text, not remaining_lease
            # (remaining_lease=999 would also match Freehold)
            conditions.append(Transaction.tenure.ilike('%999%'))

    # Property age filter (years since lease start / TOP date)
    # NOTE: Freehold properties are EXCLUDED from property age filtering because their
    # lease_start_year represents the original land grant date (often 1800s), not the
    # building's actual TOP date. This filter only applies to leasehold properties.
    property_age_min = filters.get('property_age_min')
    property_age_max = filters.get('property_age_max')
    if property_age_min is not None or property_age_max is not None:
        # Calculate property age: transaction_year - lease_start_year
        property_age_expr = extract('year', Transaction.transaction_date) - Transaction.lease_start_year

        # Exclude freehold properties (lease_start_year is land grant date, not TOP)
        # Freehold is identified by: tenure contains 'freehold' OR remaining_lease = 999
        is_leasehold = and_(
            ~Transaction.tenure.ilike('%freehold%'),
            or_(Transaction.remaining_lease.is_(None), Transaction.remaining_lease < 999),
            Transaction.lease_start_year.isnot(None)
        )

        if property_age_min is not None and property_age_max is not None:
            conditions.append(and_(
                is_leasehold,
                property_age_expr >= int(property_age_min),
                property_age_expr <= int(property_age_max)
            ))
        elif property_age_min is not None:
            conditions.append(and_(
                is_leasehold,
                property_age_expr >= int(property_age_min)
            ))
        elif property_age_max is not None:
            conditions.append(and_(
                is_leasehold,
                property_age_expr <= int(property_age_max)
            ))

    # Project name - supports both partial match (search) and exact match (drill-through)
    # Use project_exact for drill-through views (ProjectDetailPanel)
    # Use project for search functionality (sidebar filter)
    project_exact = filters.get('project_exact')
    project = filters.get('project')
    if project_exact:
        # EXACT match - for ProjectDetailPanel drill-through
        conditions.append(Transaction.project_name == project_exact)
    elif project:
        # PARTIAL match - for search functionality
        conditions.append(Transaction.project_name.ilike(f'%{project}%'))

    # Property age bucket filter
    # Uses lease age: floor(transaction_year - lease_start_year)
    # Freehold excluded (their lease_start_year is land grant date, not building age)
    property_age_bucket = filters.get('property_age_bucket')
    if property_age_bucket:
        from schemas.api_contract import PropertyAgeBucket, SaleType

        if property_age_bucket == PropertyAgeBucket.NEW_SALE:
            # CORRELATED SUBQUERY: project has 0 resale transactions
            # This is a market state, not age-based
            # Use text() directly with NOT EXISTS for proper SQL generation
            resale_db_value = SaleType.to_db(SaleType.RESALE)
            not_exists_clause = text("""
                NOT EXISTS (
                    SELECT 1 FROM transactions t2
                    WHERE t2.project_name = transactions.project_name
                      AND LOWER(t2.sale_type) = LOWER(:resale_type)
                      AND COALESCE(t2.is_outlier, false) = false
                )
            """).bindparams(resale_type=resale_db_value)
            conditions.append(not_exists_clause)

        elif property_age_bucket == PropertyAgeBucket.FREEHOLD:
            # Freehold properties (no lease)
            conditions.append(Transaction.tenure.ilike('%freehold%'))

        else:
            # Age-based buckets (leasehold only)
            age_range = PropertyAgeBucket.get_age_range(property_age_bucket)
            if age_range:
                min_age, max_age = age_range
                lease_age_expr = extract('year', Transaction.transaction_date) - Transaction.lease_start_year

                # MUST be leasehold with valid lease_start_year
                is_leasehold = and_(
                    Transaction.lease_start_year.isnot(None),
                    ~Transaction.tenure.ilike('%freehold%')
                )

                bucket_conditions = [is_leasehold]
                if min_age is not None:
                    bucket_conditions.append(lease_age_expr >= min_age)
                if max_age is not None:
                    bucket_conditions.append(lease_age_expr < max_age)  # EXCLUSIVE upper bound

                conditions.append(and_(*bucket_conditions))

    return conditions


def build_property_age_bucket_filter(bucket: str, txn_table=None):
    """
    Build SQLAlchemy filter expression for a property age bucket.

    This is a reusable helper for any endpoint that needs to filter by property age bucket.
    Uses lease age: floor(EXTRACT(YEAR FROM transaction_date) - lease_start_year)

    Args:
        bucket: PropertyAgeBucket enum value (e.g., 'young_resale', 'new_sale')
        txn_table: Transaction table/alias to use (defaults to Transaction model)

    Returns:
        SQLAlchemy filter expression that can be used with .filter()

    Example:
        from services.dashboard_service import build_property_age_bucket_filter
        from schemas.api_contract import PropertyAgeBucket

        filter_expr = build_property_age_bucket_filter(PropertyAgeBucket.YOUNG_RESALE)
        query = query.filter(filter_expr)
    """
    from schemas.api_contract import PropertyAgeBucket, SaleType

    T = txn_table if txn_table is not None else Transaction
    lease_age_expr = extract('year', T.transaction_date) - T.lease_start_year

    if bucket == PropertyAgeBucket.NEW_SALE:
        # CORRELATED SUBQUERY: project has 0 resale transactions
        # Use text() directly with NOT EXISTS for proper SQL generation
        resale_db_value = SaleType.to_db(SaleType.RESALE)
        return text("""
            NOT EXISTS (
                SELECT 1 FROM transactions t2
                WHERE t2.project_name = transactions.project_name
                  AND LOWER(t2.sale_type) = LOWER(:resale_type)
                  AND COALESCE(t2.is_outlier, false) = false
            )
        """).bindparams(resale_type=resale_db_value)

    elif bucket == PropertyAgeBucket.FREEHOLD:
        # Freehold properties (no lease)
        return T.tenure.ilike('%freehold%')

    else:
        # Age-based buckets
        age_range = PropertyAgeBucket.get_age_range(bucket)
        if not age_range:
            return literal(True)  # Unknown bucket, no filter

        min_age, max_age = age_range

        # MUST be leasehold with valid lease_start_year
        is_leasehold = and_(
            T.lease_start_year.isnot(None),
            ~T.tenure.ilike('%freehold%')
        )

        conditions = [is_leasehold]
        if min_age is not None:
            conditions.append(lease_age_expr >= min_age)
        if max_age is not None:
            conditions.append(lease_age_expr < max_age)  # EXCLUSIVE upper bound

        return and_(*conditions)


# ============================================================================
# PANEL QUERIES
# ============================================================================

@log_timing("time_series_query")
def query_time_series(filters: Dict[str, Any], options: Dict[str, Any]) -> List[Dict]:
    """
    Query time series data for trend charts.

    Returns aggregated data by time period with count, median PSF, total value.
    """
    time_grain = options.get('time_grain', 'month')
    conditions = build_filter_conditions(filters)

    # Build date truncation based on grain
    if time_grain == 'year':
        period_expr = extract('year', Transaction.transaction_date)
        format_fn = lambda r: str(int(r.period))
    elif time_grain == 'quarter':
        year_expr = extract('year', Transaction.transaction_date)
        quarter_expr = cast(func.floor((extract('month', Transaction.transaction_date) - 1) / 3) + 1, Integer)
        period_expr = func.concat(year_expr, literal('-Q'), quarter_expr)
        format_fn = lambda r: str(r.period)
    else:  # month
        year_expr = extract('year', Transaction.transaction_date)
        month_expr = extract('month', Transaction.transaction_date)
        period_expr = func.concat(year_expr, literal('-'), func.lpad(cast(month_expr, db.String), 2, '0'))
        format_fn = lambda r: str(r.period)

    query = db.session.query(
        period_expr.label('period'),
        func.count(Transaction.id).label('count'),
        func.avg(Transaction.psf).label('avg_psf'),
        func.percentile_cont(0.5).within_group(Transaction.psf).label('median_psf'),
        func.sum(Transaction.price).label('total_value'),
        func.avg(Transaction.price).label('avg_price')
    )

    if conditions:
        query = query.filter(and_(*conditions))

    query = query.group_by(period_expr).order_by(period_expr)

    results = query.all()

    return [
        {
            'period': format_fn(r),
            'count': r.count,
            'avg_psf': round(r.avg_psf, 2) if r.avg_psf else None,
            'median_psf': round(r.median_psf, 2) if r.median_psf else None,
            'total_value': round(r.total_value, 0) if r.total_value else 0,
            'avg_price': round(r.avg_price, 0) if r.avg_price else None
        }
        for r in results
    ]


@log_timing("volume_by_location_query")
def query_volume_by_location(filters: Dict[str, Any], options: Dict[str, Any]) -> List[Dict]:
    """
    Query volume data grouped by location (region/district/project).

    Returns top locations by transaction count.
    """
    location_grain = options.get('location_grain', 'region')
    conditions = build_filter_conditions(filters)

    # Build location grouping based on grain
    if location_grain == 'region':
        location_expr = case(
            (Transaction.district.in_(CCR_DISTRICTS), literal('CCR')),
            (Transaction.district.in_(RCR_DISTRICTS), literal('RCR')),
            else_=literal('OCR')
        )
    elif location_grain == 'district':
        location_expr = Transaction.district
    else:  # project
        location_expr = Transaction.project_name

    query = db.session.query(
        location_expr.label('location'),
        func.count(Transaction.id).label('count'),
        func.sum(Transaction.price).label('total_value'),
        func.avg(Transaction.psf).label('avg_psf')
    )

    if conditions:
        query = query.filter(and_(*conditions))

    query = query.group_by(location_expr).order_by(func.count(Transaction.id).desc())
    query = query.limit(MAX_LOCATION_RESULTS)

    results = query.all()

    return [
        {
            'location': r.location,
            'count': r.count,
            'total_value': round(r.total_value, 0) if r.total_value else 0,
            'avg_psf': round(r.avg_psf, 2) if r.avg_psf else None
        }
        for r in results
    ]


@log_timing("price_histogram_query")
def query_price_histogram(filters: Dict[str, Any], options: Dict[str, Any]) -> Dict[str, Any]:
    """
    Query price distribution histogram with server-side binning.

    Returns histogram data capped at P95 by default for better visualization,
    along with percentile statistics (P5, P25, P50/median, P75, P95).

    Best practice: Shows P5-P95 range by default to prevent luxury tail from
    flattening the core distribution signal. Tail data is still available.
    """
    num_bins = options.get('histogram_bins', DEFAULT_HISTOGRAM_BINS)
    show_full_range = options.get('show_full_range', False)

    # Build WHERE clause for raw SQL
    where_parts = []
    params = {}

    if filters.get('date_from'):
        where_parts.append("transaction_date >= :date_from")
        params['date_from'] = filters['date_from']
    if filters.get('date_to'):
        # Use < next_day instead of <= date_to to include all transactions on date_to
        # PostgreSQL treats date as midnight, so <= 2025-12-27 means <= 2025-12-27 00:00:00
        where_parts.append("transaction_date < :date_to_exclusive")
        params['date_to_exclusive'] = filters['date_to'] + timedelta(days=1)

    districts = filters.get('districts', [])
    if districts:
        if isinstance(districts, str):
            districts = [d.strip() for d in districts.split(',')]
        normalized = [normalize_district(d) for d in districts]
        placeholders = ','.join([f":district_{i}" for i in range(len(normalized))])
        where_parts.append(f"district IN ({placeholders})")
        for i, d in enumerate(normalized):
            params[f'district_{i}'] = d
    else:
        # Handle segments (supports multiple segments)
        segments = filters.get('segments', [])
        if not segments:
            # Backwards compatibility: check for single 'segment' key
            single_segment = filters.get('segment')
            if single_segment:
                segments = [single_segment]

        if segments:
            all_segment_districts = []
            for seg in segments:
                seg_districts = get_districts_for_segment(seg)
                if seg_districts:
                    all_segment_districts.extend(seg_districts)
            if all_segment_districts:
                placeholders = ','.join([f":seg_district_{i}" for i in range(len(all_segment_districts))])
                where_parts.append(f"district IN ({placeholders})")
                for i, d in enumerate(all_segment_districts):
                    params[f'seg_district_{i}'] = d

    bedrooms = filters.get('bedrooms', [])
    if bedrooms:
        if isinstance(bedrooms, str):
            bedrooms = [int(b.strip()) for b in bedrooms.split(',')]
        placeholders = ','.join([f":bedroom_{i}" for i in range(len(bedrooms))])
        where_parts.append(f"bedroom_count IN ({placeholders})")
        for i, b in enumerate(bedrooms):
            params[f'bedroom_{i}'] = b

    if filters.get('sale_type'):
        where_parts.append("LOWER(sale_type) = LOWER(:sale_type)")
        params['sale_type'] = filters['sale_type']

    # Project filter - supports both partial match (search) and exact match (drill-through)
    if filters.get('project_exact'):
        # EXACT match - for ProjectDetailPanel drill-through
        where_parts.append("project_name = :project_exact")
        params['project_exact'] = filters['project_exact']
    elif filters.get('project'):
        # Case-insensitive match - for search functionality
        where_parts.append("LOWER(project_name) = LOWER(:project)")
        params['project'] = filters['project']

    if filters.get('psf_min') is not None:
        where_parts.append("psf >= :psf_min")
        params['psf_min'] = float(filters['psf_min'])
    if filters.get('psf_max') is not None:
        where_parts.append("psf <= :psf_max")
        params['psf_max'] = float(filters['psf_max'])

    if filters.get('size_min') is not None:
        where_parts.append("area_sqft >= :size_min")
        params['size_min'] = float(filters['size_min'])
    if filters.get('size_max') is not None:
        where_parts.append("area_sqft <= :size_max")
        params['size_max'] = float(filters['size_max'])

    where_clause = " AND ".join(where_parts) if where_parts else "1=1"

    # Step 1: Get percentiles and count in a single query
    # PostgreSQL PERCENTILE_CONT for accurate percentile calculation
    percentile_sql = text(f"""
        SELECT
            COUNT(*) as total_count,
            PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY price) as p5,
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price) as p25,
            PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY price) as median,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price) as p75,
            PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY price) as p95,
            MIN(price) as min_price,
            MAX(price) as max_price
        FROM transactions
        WHERE {where_clause}
          AND price IS NOT NULL
          AND price > 0
          AND {OUTLIER_FILTER}
    """)

    stats_result = db.session.execute(percentile_sql, params).fetchone()

    if not stats_result or stats_result.total_count == 0:
        logger.warning(f"Histogram query returned no results. Filters: {filters}")
        return {
            'bins': [],
            'stats': {
                'total_count': 0,
                'p5': None, 'p25': None, 'median': None, 'p75': None, 'p95': None,
                'min': None, 'max': None, 'iqr': None
            },
            'tail': {'count': 0, 'threshold': None, 'pct': 0}
        }

    total_count = stats_result.total_count
    p5 = float(stats_result.p5)
    p25 = float(stats_result.p25)
    median = float(stats_result.median)
    p75 = float(stats_result.p75)
    p95 = float(stats_result.p95)
    min_price = float(stats_result.min_price)
    max_price = float(stats_result.max_price)
    iqr = p75 - p25

    # Build stats object
    stats = {
        'total_count': total_count,
        'p5': round(p5, 0),
        'p25': round(p25, 0),
        'median': round(median, 0),
        'p75': round(p75, 0),
        'p95': round(p95, 0),
        'min': round(min_price, 0),
        'max': round(max_price, 0),
        'iqr': round(iqr, 0)
    }

    # Determine histogram range based on show_full_range option
    if show_full_range:
        hist_min = min_price
        hist_max = max_price
    else:
        # Default: Show P5-P95 range for clean visualization
        hist_min = p5
        hist_max = p95

    # Handle edge case: all prices are the same
    if hist_max == hist_min:
        return {
            'bins': [{
                'bin': 1,
                'bin_start': round(hist_min, 0),
                'bin_end': round(hist_max, 0),
                'count': total_count
            }],
            'stats': stats,
            'tail': {'count': 0, 'threshold': round(p95, 0), 'pct': 0}
        }

    bin_width = (hist_max - hist_min) / num_bins

    # Step 2: Compute histogram bins within the chosen range
    params['hist_min'] = hist_min
    params['hist_max'] = hist_max
    params['bin_width'] = bin_width
    params['num_bins'] = num_bins

    histogram_sql = text(f"""
        SELECT
            LEAST(
                GREATEST(
                    FLOOR((price - :hist_min) / :bin_width) + 1,
                    1
                )::INTEGER,
                :num_bins
            ) as bin_num,
            COUNT(*) as count
        FROM transactions
        WHERE {where_clause}
          AND price IS NOT NULL
          AND price > 0
          AND price >= :hist_min
          AND price <= :hist_max
          AND {OUTLIER_FILTER}
        GROUP BY bin_num
        ORDER BY bin_num
    """)

    results = db.session.execute(histogram_sql, params).fetchall()

    histogram = []
    visible_count = 0
    for r in results:
        bin_num = r.bin_num if r.bin_num else 1
        bin_start = hist_min + (bin_num - 1) * bin_width
        bin_end = hist_min + bin_num * bin_width
        histogram.append({
            'bin': bin_num,
            'bin_start': round(bin_start, 0),
            'bin_end': round(bin_end, 0),
            'count': r.count
        })
        visible_count += r.count

    # Calculate tail (transactions above P95, not shown by default)
    tail_count = total_count - visible_count
    tail_pct = round((tail_count / total_count) * 100, 1) if total_count > 0 else 0

    tail = {
        'count': tail_count,
        'threshold': round(p95, 0),
        'pct': tail_pct
    }

    return {
        'bins': histogram,
        'stats': stats,
        'tail': tail
    }


@log_timing("bedroom_mix_query")
def query_bedroom_mix(filters: Dict[str, Any], options: Dict[str, Any]) -> List[Dict]:
    """
    Query bedroom type distribution over time.

    Returns count by period, bedroom count, and sale type.
    """
    time_grain = options.get('time_grain', 'month')
    conditions = build_filter_conditions(filters)

    # Build date truncation based on grain
    if time_grain == 'year':
        period_expr = cast(extract('year', Transaction.transaction_date), Integer)
    elif time_grain == 'quarter':
        year_expr = extract('year', Transaction.transaction_date)
        quarter_expr = cast(func.floor((extract('month', Transaction.transaction_date) - 1) / 3) + 1, Integer)
        period_expr = func.concat(year_expr, literal('-Q'), quarter_expr)
    else:  # month
        year_expr = extract('year', Transaction.transaction_date)
        month_expr = extract('month', Transaction.transaction_date)
        period_expr = func.concat(year_expr, literal('-'), func.lpad(cast(month_expr, db.String), 2, '0'))

    query = db.session.query(
        period_expr.label('period'),
        Transaction.bedroom_count.label('bedroom'),
        Transaction.sale_type.label('sale_type'),
        func.count(Transaction.id).label('count')
    )

    if conditions:
        query = query.filter(and_(*conditions))

    # No hardcoded bedroom filter - show ALL bedroom types by default
    # User can filter via the 'bedrooms' filter parameter if needed

    query = query.group_by(period_expr, Transaction.bedroom_count, Transaction.sale_type)
    query = query.order_by(period_expr, Transaction.bedroom_count)

    results = query.all()

    return [
        {
            'period': str(r.period),
            'bedroom': r.bedroom,
            'sale_type': r.sale_type or 'Unknown',
            'count': r.count
        }
        for r in results
    ]


@log_timing("sale_type_breakdown_query")
def query_sale_type_breakdown(filters: Dict[str, Any], options: Dict[str, Any]) -> List[Dict]:
    """
    Query sale type breakdown (New Sale vs Resale) over time.
    """
    time_grain = options.get('time_grain', 'month')
    conditions = build_filter_conditions(filters)

    # Build date truncation based on grain
    if time_grain == 'year':
        period_expr = cast(extract('year', Transaction.transaction_date), Integer)
    elif time_grain == 'quarter':
        year_expr = extract('year', Transaction.transaction_date)
        quarter_expr = cast(func.floor((extract('month', Transaction.transaction_date) - 1) / 3) + 1, Integer)
        period_expr = func.concat(year_expr, literal('-Q'), quarter_expr)
    else:  # month
        year_expr = extract('year', Transaction.transaction_date)
        month_expr = extract('month', Transaction.transaction_date)
        period_expr = func.concat(year_expr, literal('-'), func.lpad(cast(month_expr, db.String), 2, '0'))

    query = db.session.query(
        period_expr.label('period'),
        Transaction.sale_type.label('sale_type'),
        func.count(Transaction.id).label('count'),
        func.sum(Transaction.price).label('total_value')
    )

    if conditions:
        query = query.filter(and_(*conditions))

    query = query.group_by(period_expr, Transaction.sale_type)
    query = query.order_by(period_expr)

    results = query.all()

    return [
        {
            'period': str(r.period),
            'sale_type': r.sale_type or 'Unknown',
            'count': r.count,
            'total_value': round(r.total_value, 0) if r.total_value else 0
        }
        for r in results
    ]


@log_timing("summary_query")
def query_summary(filters: Dict[str, Any], options: Dict[str, Any]) -> Dict:
    """
    Query summary KPIs for the filtered dataset.
    """
    conditions = build_filter_conditions(filters)

    query = db.session.query(
        func.count(Transaction.id).label('total_count'),
        func.avg(Transaction.psf).label('avg_psf'),
        func.percentile_cont(0.5).within_group(Transaction.psf).label('median_psf'),
        func.avg(Transaction.price).label('avg_price'),
        func.percentile_cont(0.5).within_group(Transaction.price).label('median_price'),
        func.sum(Transaction.price).label('total_value'),
        func.min(Transaction.transaction_date).label('date_min'),
        func.max(Transaction.transaction_date).label('date_max'),
        func.min(Transaction.psf).label('psf_min'),
        func.max(Transaction.psf).label('psf_max'),
        func.min(Transaction.price).label('price_min'),
        func.max(Transaction.price).label('price_max')
    )

    if conditions:
        query = query.filter(and_(*conditions))

    r = query.first()

    return {
        'total_count': r.total_count or 0,
        'avg_psf': round(r.avg_psf, 2) if r.avg_psf else None,
        'median_psf': round(r.median_psf, 2) if r.median_psf else None,
        'avg_price': round(r.avg_price, 0) if r.avg_price else None,
        'median_price': round(r.median_price, 0) if r.median_price else None,
        'total_value': round(r.total_value, 0) if r.total_value else 0,
        'date_min': r.date_min.isoformat() if r.date_min else None,
        'date_max': r.date_max.isoformat() if r.date_max else None,
        'psf_range': {
            'min': round(r.psf_min, 2) if r.psf_min else None,
            'max': round(r.psf_max, 2) if r.psf_max else None
        },
        'price_range': {
            'min': round(r.price_min, 0) if r.price_min else None,
            'max': round(r.price_max, 0) if r.price_max else None
        }
    }


# ============================================================================
# MAIN DASHBOARD FUNCTION
# ============================================================================

# Import beads chart query from dedicated service module
from services.beads_chart_service import query_beads_chart

PANEL_QUERIES = {
    'time_series': query_time_series,
    'volume_by_location': query_volume_by_location,
    'price_histogram': query_price_histogram,
    'bedroom_mix': query_bedroom_mix,
    'sale_type_breakdown': query_sale_type_breakdown,
    'summary': query_summary,
    'beads_chart': query_beads_chart,
}


@log_timing("get_dashboard_data")
def get_dashboard_data(
    filters: Dict[str, Any],
    panels: List[str] = None,
    options: Dict[str, Any] = None,
    skip_cache: bool = False
) -> Dict[str, Any]:
    """
    Get all dashboard data in a single call.

    This is the main entry point for the unified dashboard endpoint.
    Returns all requested panels in one response using SQL-only aggregation.

    Args:
        filters: Filter parameters (districts, date_from, date_to, bedrooms, etc.)
        panels: List of panels to return. Default: all panels.
        options: Query options (time_grain, location_grain, histogram_bins)
        skip_cache: If True, bypass cache and fetch fresh data

    Returns:
        {
            'data': { panel_name: panel_data, ... },
            'meta': {
                'cache_hit': bool,
                'elapsed_ms': float,
                'filters_applied': dict,
                'total_records_matched': int
            }
        }

    Raises:
        ValidationError: If request parameters are invalid
    """
    start_time = time.perf_counter()

    # Defaults
    if panels is None:
        panels = ['time_series', 'volume_by_location', 'price_histogram',
                  'bedroom_mix', 'summary']
    if options is None:
        options = {}

    # Set default options
    options.setdefault('time_grain', 'month')
    options.setdefault('location_grain', 'region')
    options.setdefault('histogram_bins', DEFAULT_HISTOGRAM_BINS)

    # Validate request
    validate_request(filters, panels, options)

    # Build cache key
    cache_key = build_cache_key(filters, panels, options)

    # Check cache (unless skip_cache)
    if not skip_cache:
        cached = _dashboard_cache.get(cache_key)
        if cached is not None:
            elapsed = (time.perf_counter() - start_time) * 1000
            logger.info(f"Cache hit for {cache_key} in {elapsed:.1f}ms")
            # Update meta with cache hit info
            cached['meta']['cache_hit'] = True
            cached['meta']['elapsed_ms'] = round(elapsed, 1)
            return cached

    # Prevent cache stampede with per-key locking
    with _key_locks_lock:
        if cache_key not in _key_locks:
            _key_locks[cache_key] = threading.Lock()
        key_lock = _key_locks[cache_key]

    with key_lock:
        # Double-check cache (another thread may have populated it)
        if not skip_cache:
            cached = _dashboard_cache.get(cache_key)
            if cached is not None:
                elapsed = (time.perf_counter() - start_time) * 1000
                cached['meta']['cache_hit'] = True
                cached['meta']['elapsed_ms'] = round(elapsed, 1)
                return cached

        # Execute queries for each panel SEQUENTIALLY
        # Note: Parallel execution was tested but caused contention on remote DB
        # with limited connection pool, making queries slower overall.
        # Sequential is faster for remote databases with high latency.
        data = {}
        for panel in panels:
            query_fn = PANEL_QUERIES.get(panel)
            if query_fn:
                try:
                    data[panel] = query_fn(filters, options)
                except Exception as e:
                    logger.error(f"Error querying {panel}: {e}")
                    data[panel] = {'error': str(e)}

        # Get total records from summary if available
        total_records = 0
        if 'summary' in data and isinstance(data['summary'], dict):
            total_records = data['summary'].get('total_count', 0)

        elapsed = (time.perf_counter() - start_time) * 1000

        # Build filter_notes to explain filter behaviors (Issue B5)
        filter_notes = []
        if filters.get('property_age_min') is not None or filters.get('property_age_max') is not None:
            filter_notes.append(
                "Property age filter excludes Freehold properties (their lease_start_year "
                "represents land grant date, not building TOP date)"
            )

        result = {
            'data': data,
            'meta': {
                'cache_hit': False,
                'elapsed_ms': round(elapsed, 1),
                'filters_applied': filters,
                'filter_notes': filter_notes if filter_notes else None,
                'panels_returned': panels,
                'options': options,
                'total_records_matched': total_records
            }
        }

        # Cache the result
        _dashboard_cache.set(cache_key, result)

        logger.info(f"Dashboard computed in {elapsed:.1f}ms, {total_records} records matched")

        return result


# ============================================================================
# PSF BY PRICE BAND QUERY
# ============================================================================

def query_psf_by_price_band(
    params: Dict[str, Any],
    session: Optional[Session] = None
) -> List[Dict]:
    """
    Query PSF percentiles grouped by price band and bedroom type.

    Uses SQL aggregation only (no pandas) for memory safety on 512MB Render.

    Args:
        params: Parsed filter params from parse_filter_params():
            - date_from: Python date object
            - date_to: Python date object
            - sale_type_db: DB-format sale type (e.g., 'New Sale')
            - districts: List of district codes
            - segments_db: List of regions (CCR, RCR, OCR)
            - tenure_db: Tenure string
        session: Optional SQLAlchemy session

    Returns:
        List of dicts with keys: price_band, bedroom_group, observation_count, p25, p50, p75
    """
    # Build filter clauses using :param style ONLY
    filters = [OUTLIER_FILTER]
    bind_params = {}

    # Date filters
    if params.get('date_from'):
        filters.append("transaction_date >= :date_from")
        bind_params['date_from'] = params['date_from']  # Python date object

    if params.get('date_to'):
        # Use < next_day instead of <= date_to to include all transactions on date_to
        # PostgreSQL treats date as midnight, so <= 2025-12-27 means <= 2025-12-27 00:00:00
        filters.append("transaction_date < :date_to_exclusive")
        bind_params['date_to_exclusive'] = params['date_to'] + timedelta(days=1)

    # Sale type filter
    if params.get('sale_type_db'):
        filters.append("sale_type = :sale_type")
        bind_params['sale_type'] = params['sale_type_db']

    # District filter
    if params.get('districts'):
        districts = params['districts']
        if isinstance(districts, str):
            districts = [districts]
        filters.append("district = ANY(:districts)")
        bind_params['districts'] = districts

    # Region/segment filter - use district mapping (market_segment column may be null/inconsistent)
    if params.get('segments_db'):
        segments = params['segments_db']
        if isinstance(segments, str):
            segments = [segments]
        # Get all districts for the requested segments
        from constants import get_districts_for_region
        segment_districts = []
        for seg in segments:
            segment_districts.extend(get_districts_for_region(seg))
        if segment_districts:
            filters.append("district = ANY(:segment_districts)")
            bind_params['segment_districts'] = segment_districts

    # Tenure filter
    if params.get('tenure_db'):
        filters.append("tenure = :tenure")
        bind_params['tenure'] = params['tenure_db']

    where_clause = " AND ".join(filters)

    sql = f"""
    WITH price_banded AS (
      SELECT
        psf,
        bedroom_count,
        price,
        district,
        -- Property age: years since lease started (null for freehold)
        CASE
          WHEN lease_start_year IS NOT NULL AND lease_start_year > 0
          THEN EXTRACT(YEAR FROM transaction_date) - lease_start_year
          ELSE NULL
        END AS property_age,
        CASE
          WHEN price < 1000000 THEN '$0.5M-1M'
          WHEN price < 1500000 THEN '$1M-1.5M'
          WHEN price < 2000000 THEN '$1.5M-2M'
          WHEN price < 2500000 THEN '$2M-2.5M'
          WHEN price < 3000000 THEN '$2.5M-3M'
          WHEN price < 3500000 THEN '$3M-3.5M'
          WHEN price < 4000000 THEN '$3.5M-4M'
          WHEN price < 5000000 THEN '$4M-5M'
          ELSE '$5M+'
        END AS price_band,
        CASE
          WHEN bedroom_count >= 5 THEN 5
          ELSE bedroom_count
        END AS bedroom_group
      FROM transactions
      WHERE {where_clause}
        AND price >= 500000
        AND psf IS NOT NULL
        AND bedroom_count IS NOT NULL
    )
    SELECT
      price_band,
      bedroom_group,
      COUNT(*) AS observation_count,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY psf) AS p25,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY psf) AS p50,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY psf) AS p75,
      -- Average property age (excluding nulls/freehold)
      ROUND(AVG(property_age)::numeric, 1) AS avg_age,
      -- Region breakdown by district mapping
      SUM(CASE WHEN district IN ('D01', 'D02', 'D06', 'D07', 'D09', 'D10', 'D11') THEN 1 ELSE 0 END) AS ccr_count,
      SUM(CASE WHEN district IN ('D03', 'D04', 'D05', 'D08', 'D12', 'D13', 'D14', 'D15', 'D20') THEN 1 ELSE 0 END) AS rcr_count,
      SUM(CASE WHEN district IN ('D16', 'D17', 'D18', 'D19', 'D21', 'D22', 'D23', 'D24', 'D25', 'D26', 'D27', 'D28') THEN 1 ELSE 0 END) AS ocr_count
    FROM price_banded
    GROUP BY price_band, bedroom_group
    ORDER BY
      CASE price_band
        WHEN '$0.5M-1M' THEN 1
        WHEN '$1M-1.5M' THEN 2
        WHEN '$1.5M-2M' THEN 3
        WHEN '$2M-2.5M' THEN 4
        WHEN '$2.5M-3M' THEN 5
        WHEN '$3M-3.5M' THEN 6
        WHEN '$3.5M-4M' THEN 7
        WHEN '$4M-5M' THEN 8
        ELSE 9
      END,
      bedroom_group
    """

    sess = session or db.session
    result = sess.execute(text(sql), bind_params)

    # Convert to list of dicts
    rows = []
    for row in result:
        rows.append({
            'price_band': row.price_band,
            'bedroom_group': row.bedroom_group,
            'observation_count': row.observation_count,
            'p25': float(row.p25) if row.p25 is not None else None,
            'p50': float(row.p50) if row.p50 is not None else None,
            'p75': float(row.p75) if row.p75 is not None else None,
            'avg_age': float(row.avg_age) if row.avg_age is not None else None,
            'ccr_count': int(row.ccr_count) if row.ccr_count is not None else 0,
            'rcr_count': int(row.rcr_count) if row.rcr_count is not None else 0,
            'ocr_count': int(row.ocr_count) if row.ocr_count is not None else 0,
        })

    return rows


# ============================================================================
# CACHE WARMING (OPTIONAL)
# ============================================================================

def warm_cache_for_common_queries():
    """
    Pre-populate cache with common query patterns.

    Call this at application startup or periodically.
    """
    common_queries = [
        # All data, no filters
        {'filters': {}, 'panels': ['time_series', 'volume_by_location', 'summary']},
        # By region
        {'filters': {'segment': 'CCR'}, 'panels': ['time_series', 'volume_by_location', 'summary']},
        {'filters': {'segment': 'RCR'}, 'panels': ['time_series', 'volume_by_location', 'summary']},
        {'filters': {'segment': 'OCR'}, 'panels': ['time_series', 'volume_by_location', 'summary']},
        # By bedroom type
        {'filters': {'bedrooms': [2, 3, 4]}, 'panels': ['time_series', 'volume_by_location', 'summary']},
    ]

    for query in common_queries:
        try:
            get_dashboard_data(
                filters=query['filters'],
                panels=query['panels'],
                skip_cache=True  # Force computation
            )
            logger.info(f"Warmed cache for {query['filters']}")
        except Exception as e:
            logger.error(f"Failed to warm cache for {query['filters']}: {e}")
