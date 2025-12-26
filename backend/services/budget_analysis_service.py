"""
Budget Analysis Service - Market Activity Heatmap by Bedroom & Property Age

Provides transaction count matrix for budget-based property search.
Designed for 512MB memory constraint - SQL aggregation only.

Key features:
- Row percentages (each row sums to 100%)
- K-anonymity: row_total < 15 → low_sample, cell_count < 5 → suppressed
- Caching with budget rounded to nearest $10K
"""

from datetime import date, timedelta
from typing import Any, Dict, List, Optional
import hashlib
import json
import logging
import threading

from sqlalchemy import text

from models.database import db
from db.sql import OUTLIER_FILTER, get_outlier_filter_sql

logger = logging.getLogger(__name__)


# =============================================================================
# CONSTANTS
# =============================================================================

# Property age band definitions (corrected per user feedback)
PROPERTY_AGE_BANDS = [
    {'key': 'new_sale', 'label': 'New Sale', 'is_new_sale': True, 'min_age': None, 'max_age': None},
    {'key': 'recently_top', 'label': 'Recently TOP (4-8 yrs)', 'is_new_sale': False, 'min_age': 4, 'max_age': 8},
    {'key': 'young_resale', 'label': 'Young Resale (8-15 yrs)', 'is_new_sale': False, 'min_age': 8, 'max_age': 15},
    {'key': 'resale', 'label': 'Resale (15-25 yrs)', 'is_new_sale': False, 'min_age': 15, 'max_age': 25},
    {'key': 'mature_resale', 'label': 'Mature Resale (25+ yrs)', 'is_new_sale': False, 'min_age': 25, 'max_age': None},
]

BEDROOM_TYPES = [1, 2, 3, 4, 5]  # 5 represents 5+

# K-anonymity thresholds
MIN_ROW_TOTAL = 15   # Rows with fewer transactions show "Limited sample"
MIN_CELL_COUNT = 5   # Cells with fewer transactions are suppressed

# Cache settings
CACHE_TTL_SECONDS = 6 * 60 * 60  # 6 hours
CACHE_MAX_SIZE = 200
BUDGET_ROUND_TO = 10000  # Round budget to nearest $10K for cache key


# =============================================================================
# SIMPLE TTL CACHE (reuse pattern from dashboard_service)
# =============================================================================

class BudgetHeatmapCache:
    """Simple TTL cache for budget heatmap results."""

    def __init__(self, maxsize: int = CACHE_MAX_SIZE, ttl: float = CACHE_TTL_SECONDS):
        self._cache: Dict[str, tuple] = {}  # key -> (value, expiry_time)
        self._maxsize = maxsize
        self._ttl = ttl
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key not in self._cache:
                return None
            value, expiry = self._cache[key]
            if expiry < date.today().toordinal() * 86400:  # Rough expiry check
                del self._cache[key]
                return None
            return value

    def set(self, key: str, value: Any) -> None:
        import time
        with self._lock:
            if len(self._cache) >= self._maxsize:
                # Evict oldest entries
                sorted_keys = sorted(
                    self._cache.keys(),
                    key=lambda k: self._cache[k][1]
                )
                for old_key in sorted_keys[:len(sorted_keys) // 4]:
                    del self._cache[old_key]

            expiry = time.time() + self._ttl
            self._cache[key] = (value, expiry)

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()


_heatmap_cache = BudgetHeatmapCache()


def _build_cache_key(
    budget: int,
    tolerance: int,
    segment: Optional[str],
    district: Optional[str],
    bedroom: Optional[int],
    tenure: Optional[str],
    months_lookback: int
) -> str:
    """Build deterministic cache key with budget rounded to nearest $10K."""
    budget_rounded = round(budget / BUDGET_ROUND_TO) * BUDGET_ROUND_TO

    key_parts = {
        'budget': budget_rounded,
        'tolerance': tolerance,
        'segment': segment or '',
        'district': district or '',
        'bedroom': bedroom or '',
        'tenure': tenure or '',
        'months': months_lookback,
    }

    key_str = json.dumps(key_parts, sort_keys=True)
    return f"budget_heatmap:{hashlib.md5(key_str.encode()).hexdigest()[:16]}"


# =============================================================================
# MAIN QUERY FUNCTION
# =============================================================================

def get_market_activity_heatmap(
    budget: int,
    tolerance: int = 100000,
    bedroom: Optional[int] = None,
    segment: Optional[str] = None,
    district: Optional[str] = None,
    tenure: Optional[str] = None,
    months_lookback: int = 24,
    skip_cache: bool = False
) -> Dict[str, Any]:
    """
    Get transaction distribution by bedroom type and property age band.

    Args:
        budget: Target budget in SGD
        tolerance: +/- range around budget (default $100K)
        bedroom: Optional bedroom filter (1-5)
        segment: Optional market segment filter (CCR/RCR/OCR)
        district: Optional district filter (D01-D28)
        tenure: Optional tenure filter (Freehold/99-year/999-year)
        months_lookback: Number of months to look back (default 24)
        skip_cache: Bypass cache (default False)

    Returns:
        Dict with matrix data (percentages), summary stats, and insight text
    """
    # Check cache
    cache_key = _build_cache_key(
        budget, tolerance, segment, district, bedroom, tenure, months_lookback
    )

    if not skip_cache:
        cached = _heatmap_cache.get(cache_key)
        if cached is not None:
            logger.debug(f"Cache hit for {cache_key}")
            return cached

    # Build query
    price_min = budget - tolerance
    price_max = budget + tolerance
    date_from = date.today() - timedelta(days=months_lookback * 30)

    # Build WHERE conditions
    where_parts = [
        get_outlier_filter_sql('t'),
        "t.price >= :price_min",
        "t.price <= :price_max",
        "t.transaction_date >= :date_from",
    ]

    params: Dict[str, Any] = {
        'price_min': price_min,
        'price_max': price_max,
        'date_from': date_from,
    }

    # Optional filters
    if bedroom:
        if bedroom >= 5:
            where_parts.append("t.bedroom_count >= 5")
        else:
            where_parts.append("t.bedroom_count = :bedroom")
            params['bedroom'] = bedroom

    if segment:
        from constants import get_districts_for_region
        districts_for_segment = get_districts_for_region(segment)
        if districts_for_segment:
            placeholders = ', '.join([f":seg_d_{i}" for i in range(len(districts_for_segment))])
            where_parts.append(f"t.district IN ({placeholders})")
            for i, d in enumerate(districts_for_segment):
                params[f'seg_d_{i}'] = d

    if district:
        where_parts.append("t.district = :district")
        params['district'] = district

    if tenure:
        tenure_lower = tenure.lower().replace('-', '_').replace(' ', '_')
        if 'freehold' in tenure_lower:
            where_parts.append(
                "(t.tenure ILIKE '%freehold%' OR (t.remaining_lease = 999 AND t.tenure NOT ILIKE '%999%'))"
            )
        elif '99' in tenure_lower and '999' not in tenure_lower:
            where_parts.append("(t.remaining_lease < 999 AND t.remaining_lease > 0)")
        elif '999' in tenure_lower:
            where_parts.append("t.tenure ILIKE '%999%'")

    where_clause = " AND ".join(where_parts)

    # SQL with CASE statements for age bands
    # Property age = transaction_year - lease_start_year
    # Note: lease_start_year is approximate for many properties
    sql = text(f"""
        WITH age_calc AS (
            SELECT
                t.bedroom_count,
                t.sale_type,
                CASE
                    WHEN t.lease_start_year IS NULL THEN NULL
                    WHEN t.tenure ILIKE '%freehold%' THEN NULL
                    ELSE DATE_PART('year', t.transaction_date) - t.lease_start_year
                END as property_age
            FROM transactions t
            WHERE {where_clause}
        ),
        classified AS (
            SELECT
                LEAST(bedroom_count, 5) as bedroom,
                CASE
                    WHEN sale_type = 'New Sale' THEN 'new_sale'
                    WHEN property_age IS NULL THEN 'unknown'
                    WHEN property_age >= 4 AND property_age < 8 THEN 'recently_top'
                    WHEN property_age >= 8 AND property_age < 15 THEN 'young_resale'
                    WHEN property_age >= 15 AND property_age < 25 THEN 'resale'
                    WHEN property_age >= 25 THEN 'mature_resale'
                    ELSE 'unknown'
                END as age_band
            FROM age_calc
        )
        SELECT
            bedroom,
            age_band,
            COUNT(*) as count
        FROM classified
        WHERE age_band != 'unknown'
        GROUP BY bedroom, age_band
        ORDER BY bedroom, age_band
    """)

    result = db.session.execute(sql, params).fetchall()

    # Build matrix structure with raw counts
    raw_matrix: Dict[str, Dict[int, int]] = {
        band['key']: {br: 0 for br in BEDROOM_TYPES}
        for band in PROPERTY_AGE_BANDS
    }
    total_count = 0

    for row in result:
        bedroom_val = row.bedroom
        age_band = row.age_band
        count = row.count
        if age_band in raw_matrix and bedroom_val in raw_matrix[age_band]:
            raw_matrix[age_band][bedroom_val] = count
            total_count += count

    # Calculate row totals and percentages with k-anonymity
    matrix_response: Dict[str, Any] = {}

    for band in PROPERTY_AGE_BANDS:
        band_key = band['key']
        row_counts = raw_matrix[band_key]
        row_total = sum(row_counts.values())

        row_response: Dict[str, Any] = {
            'row_total': row_total,
            'low_sample': row_total < MIN_ROW_TOTAL,
        }

        for br in BEDROOM_TYPES:
            cell_count = row_counts[br]
            cell_suppressed = cell_count < MIN_CELL_COUNT

            if cell_suppressed or row_total < MIN_ROW_TOTAL:
                # Suppress cell - don't reveal count
                row_response[str(br)] = {
                    'pct': None,
                    'suppressed': True,
                }
            else:
                # Calculate percentage
                pct = round((cell_count / row_total) * 100, 1) if row_total > 0 else 0.0
                row_response[str(br)] = {
                    'count': cell_count,
                    'pct': pct,
                    'suppressed': False,
                }

        matrix_response[band_key] = row_response

    # Generate insight text
    insight_text = _generate_insight_text(raw_matrix, budget)

    response = {
        'matrix': matrix_response,
        'age_bands': PROPERTY_AGE_BANDS,
        'bedroom_types': BEDROOM_TYPES,
        'total_count': total_count,
        'insight': insight_text,
        'meta': {
            'budget': budget,
            'tolerance': tolerance,
            'price_range': {'min': price_min, 'max': price_max},
            'months_lookback': months_lookback,
            'age_is_approx': True,  # lease_start_year is approximate
        }
    }

    # Cache the result
    _heatmap_cache.set(cache_key, response)

    return response


def _generate_insight_text(
    raw_matrix: Dict[str, Dict[int, int]],
    budget: int
) -> str:
    """Generate dynamic insight text based on data."""
    # Calculate totals by bedroom and age band
    bedroom_totals: Dict[int, int] = {br: 0 for br in BEDROOM_TYPES}
    band_totals: Dict[str, int] = {}

    for band in PROPERTY_AGE_BANDS:
        band_key = band['key']
        band_sum = sum(raw_matrix.get(band_key, {}).values())
        band_totals[band_key] = band_sum

        for br in BEDROOM_TYPES:
            bedroom_totals[br] += raw_matrix.get(band_key, {}).get(br, 0)

    total_all = sum(band_totals.values())

    if total_all < MIN_ROW_TOTAL:
        return "Limited transaction data available at this budget level."

    # Find top bedroom types
    sorted_bedrooms = sorted(bedroom_totals.items(), key=lambda x: x[1], reverse=True)
    popular_bedrooms = [br for br, count in sorted_bedrooms[:2] if count >= MIN_CELL_COUNT]

    # Find top age bands (excluding new_sale for this comparison)
    resale_bands = [(k, v) for k, v in band_totals.items() if k != 'new_sale' and v >= MIN_CELL_COUNT]
    sorted_bands = sorted(resale_bands, key=lambda x: x[1], reverse=True)
    popular_band = sorted_bands[0][0] if sorted_bands else None

    # Build insight
    if not popular_bedrooms:
        return "Limited transaction data available at this budget level."

    bedroom_str = " and ".join([f"{br}BR" for br in popular_bedrooms])

    band_labels = {b['key']: b['label'] for b in PROPERTY_AGE_BANDS}
    band_label = band_labels.get(popular_band, 'resale properties') if popular_band else 'resale properties'

    # Check new sale availability
    new_sale_count = band_totals.get('new_sale', 0)
    new_sale_note = " New launches are limited in this range." if new_sale_count < 10 else ""

    return f"At your budget, buyers typically choose {bedroom_str} in the {band_label} category.{new_sale_note}"


# =============================================================================
# V2 SERIALIZATION
# =============================================================================

def serialize_heatmap_v2(result: Dict[str, Any]) -> Dict[str, Any]:
    """Convert heatmap response to v2 camelCase schema."""
    matrix_v2: Dict[str, Any] = {}

    for band_key, row_data in result['matrix'].items():
        row_v2: Dict[str, Any] = {
            'rowTotal': row_data['row_total'],
            'lowSample': row_data['low_sample'],
        }
        for key, val in row_data.items():
            if key in ('row_total', 'low_sample'):
                continue
            row_v2[key] = val
        matrix_v2[band_key] = row_v2

    return {
        'matrix': matrix_v2,
        'ageBands': [
            {
                'key': b['key'],
                'label': b['label'],
                'isNewSale': b['is_new_sale'],
                'minAge': b['min_age'],
                'maxAge': b['max_age'],
            }
            for b in result['age_bands']
        ],
        'bedroomTypes': result['bedroom_types'],
        'totalCount': result['total_count'],
        'insight': result['insight'],
        'meta': {
            'budget': result['meta']['budget'],
            'tolerance': result['meta']['tolerance'],
            'priceRange': result['meta']['price_range'],
            'monthsLookback': result['meta']['months_lookback'],
            'ageIsApprox': result['meta']['age_is_approx'],
        }
    }


def clear_heatmap_cache() -> None:
    """Clear the budget heatmap cache."""
    _heatmap_cache.clear()
    logger.info("Budget heatmap cache cleared")
