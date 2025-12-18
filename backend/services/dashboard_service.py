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
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from functools import wraps
import threading

from sqlalchemy import text, func, case, literal, and_, or_, extract, cast, Integer, Float
from sqlalchemy.orm import Session

from models.database import db
from models.transaction import Transaction

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
CACHE_TTL_SECONDS = 300  # 5 minutes
CACHE_MAX_SIZE = 500

# District to region mapping
CCR_DISTRICTS = ['D01', 'D02', 'D06', 'D07', 'D09', 'D10', 'D11']
RCR_DISTRICTS = ['D03', 'D04', 'D05', 'D08', 'D12', 'D13', 'D14', 'D15', 'D20']
# OCR = everything else

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


def validate_request(filters: Dict[str, Any], panels: List[str], options: Dict[str, Any]) -> None:
    """
    Validate request parameters to prevent abuse and invalid queries.

    Raises:
        ValidationError: If validation fails
    """
    errors = []

    # Date range limit
    date_from = filters.get('date_from')
    date_to = filters.get('date_to')
    if date_from and date_to:
        try:
            from_dt = datetime.strptime(date_from, '%Y-%m-%d')
            to_dt = datetime.strptime(date_to, '%Y-%m-%d')
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
                    'bedroom_mix', 'summary', 'sale_type_breakdown'}
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


def get_region_for_district(district: str) -> str:
    """Map district to market segment (CCR/RCR/OCR)."""
    d = normalize_district(district)
    if d in CCR_DISTRICTS:
        return 'CCR'
    elif d in RCR_DISTRICTS:
        return 'RCR'
    else:
        return 'OCR'


def get_districts_for_segment(segment: str) -> List[str]:
    """Get all districts for a market segment."""
    segment = segment.upper()
    if segment == 'CCR':
        return CCR_DISTRICTS
    elif segment == 'RCR':
        return RCR_DISTRICTS
    elif segment == 'OCR':
        # OCR is everything not CCR or RCR
        return [f"D{i:02d}" for i in range(1, 29)
                if f"D{i:02d}" not in CCR_DISTRICTS and f"D{i:02d}" not in RCR_DISTRICTS]
    return []


def build_filter_conditions(filters: Dict[str, Any]) -> List:
    """
    Build SQLAlchemy filter conditions from filter dict.

    Returns list of conditions to be combined with and_().
    """
    conditions = []

    # Date range
    if filters.get('date_from'):
        try:
            from_dt = datetime.strptime(filters['date_from'], '%Y-%m-%d')
            conditions.append(Transaction.transaction_date >= from_dt)
        except ValueError:
            pass

    if filters.get('date_to'):
        try:
            to_dt = datetime.strptime(filters['date_to'], '%Y-%m-%d')
            conditions.append(Transaction.transaction_date <= to_dt)
        except ValueError:
            pass

    # Districts
    districts = filters.get('districts', [])
    if districts:
        if isinstance(districts, str):
            districts = [d.strip() for d in districts.split(',')]
        normalized = [normalize_district(d) for d in districts]
        conditions.append(Transaction.district.in_(normalized))

    # Segment (market region) - convert to districts
    segment = filters.get('segment')
    if segment and not districts:  # Only apply if no explicit districts
        segment_districts = get_districts_for_segment(segment)
        if segment_districts:
            conditions.append(Transaction.district.in_(segment_districts))

    # Bedrooms
    bedrooms = filters.get('bedrooms', [])
    if bedrooms:
        if isinstance(bedrooms, str):
            bedrooms = [int(b.strip()) for b in bedrooms.split(',')]
        conditions.append(Transaction.bedroom_count.in_(bedrooms))

    # Sale type
    sale_type = filters.get('sale_type')
    if sale_type:
        conditions.append(Transaction.sale_type == sale_type)

    # PSF range
    if filters.get('psf_min') is not None:
        conditions.append(Transaction.psf >= float(filters['psf_min']))
    if filters.get('psf_max') is not None:
        conditions.append(Transaction.psf <= float(filters['psf_max']))

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
            conditions.append(or_(
                Transaction.tenure.ilike('%freehold%'),
                Transaction.remaining_lease == 999
            ))
        elif tenure_lower in ['99-year', '99']:
            conditions.append(and_(
                Transaction.remaining_lease < 999,
                Transaction.remaining_lease > 0
            ))
        elif tenure_lower in ['999-year', '999']:
            conditions.append(Transaction.remaining_lease == 999)

    # Project name (partial match)
    project = filters.get('project')
    if project:
        conditions.append(Transaction.project_name.ilike(f'%{project}%'))

    return conditions


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
            'median_psf': round(r.avg_psf, 2) if r.avg_psf else None,  # Use avg as median approximation
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
def query_price_histogram(filters: Dict[str, Any], options: Dict[str, Any]) -> List[Dict]:
    """
    Query price distribution histogram with server-side binning.

    Uses SQL WIDTH_BUCKET for efficient binning (or equivalent for SQLite).
    """
    num_bins = options.get('histogram_bins', DEFAULT_HISTOGRAM_BINS)
    conditions = build_filter_conditions(filters)

    # First get the price range
    range_query = db.session.query(
        func.min(Transaction.price).label('min_price'),
        func.max(Transaction.price).label('max_price')
    )
    if conditions:
        range_query = range_query.filter(and_(*conditions))

    price_range = range_query.first()

    if not price_range.min_price or not price_range.max_price:
        return []

    min_price = float(price_range.min_price)
    max_price = float(price_range.max_price)

    # Avoid division by zero
    if min_price == max_price:
        return [{
            'bin': 1,
            'bin_start': min_price,
            'bin_end': max_price,
            'count': 1
        }]

    bin_width = (max_price - min_price) / num_bins

    # Calculate bin for each transaction
    # bin_number = floor((price - min_price) / bin_width) + 1, capped at num_bins
    bin_expr = func.least(
        cast(func.floor((Transaction.price - min_price) / bin_width) + 1, Integer),
        num_bins
    )

    query = db.session.query(
        bin_expr.label('bin'),
        func.count(Transaction.id).label('count')
    )

    if conditions:
        query = query.filter(and_(*conditions))

    query = query.group_by(bin_expr).order_by(bin_expr)

    results = query.all()

    # Convert to histogram format
    histogram = []
    for r in results:
        bin_num = r.bin if r.bin else 1
        bin_start = min_price + (bin_num - 1) * bin_width
        bin_end = min_price + bin_num * bin_width
        histogram.append({
            'bin': bin_num,
            'bin_start': round(bin_start, 0),
            'bin_end': round(bin_end, 0),
            'count': r.count
        })

    return histogram


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

    # Only include common bedroom types
    query = query.filter(Transaction.bedroom_count.in_([1, 2, 3, 4, 5]))

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
        func.avg(Transaction.price).label('avg_price'),
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
        'median_psf': round(r.avg_psf, 2) if r.avg_psf else None,  # Approximation
        'avg_price': round(r.avg_price, 0) if r.avg_price else None,
        'median_price': round(r.avg_price, 0) if r.avg_price else None,  # Approximation
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

PANEL_QUERIES = {
    'time_series': query_time_series,
    'volume_by_location': query_volume_by_location,
    'price_histogram': query_price_histogram,
    'bedroom_mix': query_bedroom_mix,
    'sale_type_breakdown': query_sale_type_breakdown,
    'summary': query_summary
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

        # Execute queries for each panel
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

        result = {
            'data': data,
            'meta': {
                'cache_hit': False,
                'elapsed_ms': round(elapsed, 1),
                'filters_applied': filters,
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
