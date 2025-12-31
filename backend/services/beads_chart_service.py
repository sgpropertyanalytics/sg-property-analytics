"""
Beads Chart Service - Volume-Weighted Median Price by Region and Bedroom

This service provides the data for the "Beads on String" chart visualization
showing how prices vary across regions (CCR, RCR, OCR) and bedroom types (1-5+).

Key Features:
- Volume-weighted median price (transaction value as weight)
- SQL-only aggregation (no pandas, stays within 512MB RAM)
- Grouped by region and bedroom type
- Respects all standard filters (date, district, sale_type, etc.)

Volume-Weighted Median Algorithm:
1. Sort transactions by price within each (region, bedroom) group
2. Calculate cumulative sum of transaction values (the "weights")
3. Find the price where cumulative weight >= 50% of total weight

Performance Optimization (P1):
- For date ranges > 2 years: Uses PostgreSQL PERCENTILE_CONT (faster, unweighted)
- For date ranges <= 2 years: Uses precise volume-weighted median (window functions)
This reduces query time for large historical ranges while maintaining precision
for recent data analysis.
"""

import logging
from datetime import date
from typing import Dict, Any, List, Optional

from sqlalchemy import text

from models.database import db
from constants import CCR_DISTRICTS, RCR_DISTRICTS
from utils.filter_builder import build_sql_where
from utils.normalize import coerce_to_date

logger = logging.getLogger('beads_chart')

# Threshold for switching to fast query path (in months)
FAST_QUERY_THRESHOLD_MONTHS = 24


def _calculate_date_span_months(filters: Dict[str, Any]) -> Optional[int]:
    """
    Calculate the date range span in months from filters.

    Returns None if date range is unbounded (no date_from or date_to).
    """
    date_from = filters.get('date_from')
    date_to = filters.get('date_to')

    if not date_from or not date_to:
        return None  # Unbounded = treat as large range

    try:
        from_dt = coerce_to_date(date_from)
        to_dt = coerce_to_date(date_to)
        # Calculate months between dates
        months = (to_dt.year - from_dt.year) * 12 + (to_dt.month - from_dt.month)
        return max(1, months)
    except (ValueError, TypeError):
        return None


def _query_fast_median(filters: Dict[str, Any]) -> List[Dict]:
    """
    Fast query path using PERCENTILE_CONT for large date ranges.

    Uses PostgreSQL's built-in PERCENTILE_CONT(0.5) which is well-optimized
    and doesn't require the expensive window function cumsum approach.
    Trade-off: Uses unweighted median instead of volume-weighted.
    """
    where_parts, params = build_sql_where(filters)
    where_clause = " AND ".join(where_parts) if where_parts else "1=1"

    ccr_list = ", ".join([f"'{d}'" for d in CCR_DISTRICTS])
    rcr_list = ", ".join([f"'{d}'" for d in RCR_DISTRICTS])

    # Fast path: PERCENTILE_CONT is much faster than window function cumsum
    sql = text(f"""
    WITH region_mapped AS (
        SELECT
            price,
            CASE
                WHEN district IN ({ccr_list}) THEN 'CCR'
                WHEN district IN ({rcr_list}) THEN 'RCR'
                ELSE 'OCR'
            END as region,
            CASE WHEN bedroom_count >= 5 THEN 5 ELSE bedroom_count END as bedroom
        FROM transactions
        WHERE {where_clause}
          AND price IS NOT NULL
          AND price > 0
          AND bedroom_count IS NOT NULL
          AND bedroom_count > 0
    )
    SELECT
        region,
        bedroom,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price) as volume_weighted_median,
        COUNT(*) as transaction_count,
        SUM(price) as total_value
    FROM region_mapped
    GROUP BY region, bedroom
    ORDER BY
        CASE region WHEN 'CCR' THEN 1 WHEN 'RCR' THEN 2 ELSE 3 END,
        bedroom
    """)

    try:
        result = db.session.execute(sql, params).fetchall()
    except Exception as e:
        logger.error(f"Beads chart fast query failed: {e}")
        return []

    if not result:
        return []

    return [
        {
            'region': row.region,
            'bedroom': row.bedroom,
            'volumeWeightedMedian': float(row.volume_weighted_median),
            'transactionCount': row.transaction_count,
            'totalValue': float(row.total_value)
        }
        for row in result
    ]


def _query_weighted_median(filters: Dict[str, Any]) -> List[Dict]:
    """
    Precise query path using volume-weighted median for shorter date ranges.

    Uses window functions to calculate true volume-weighted median where
    the weight is the transaction price (representing capital volume).
    More accurate but slower for large datasets.
    """
    where_parts, params = build_sql_where(filters)
    where_clause = " AND ".join(where_parts) if where_parts else "1=1"

    ccr_list = ", ".join([f"'{d}'" for d in CCR_DISTRICTS])
    rcr_list = ", ".join([f"'{d}'" for d in RCR_DISTRICTS])

    # Precise path: Window function cumsum for true volume-weighted median
    sql = text(f"""
    WITH region_mapped AS (
        SELECT
            id,
            price,
            CASE
                WHEN district IN ({ccr_list}) THEN 'CCR'
                WHEN district IN ({rcr_list}) THEN 'RCR'
                ELSE 'OCR'
            END as region,
            CASE WHEN bedroom_count >= 5 THEN 5 ELSE bedroom_count END as bedroom
        FROM transactions
        WHERE {where_clause}
          AND price IS NOT NULL
          AND price > 0
          AND bedroom_count IS NOT NULL
          AND bedroom_count > 0
    ),
    ranked AS (
        SELECT
            id,
            region,
            bedroom,
            price,
            SUM(price) OVER (PARTITION BY region, bedroom ORDER BY price) as cumsum,
            SUM(price) OVER (PARTITION BY region, bedroom) as total_weight
        FROM region_mapped
    ),
    medians AS (
        SELECT DISTINCT ON (region, bedroom)
            region,
            bedroom,
            price as volume_weighted_median
        FROM ranked
        WHERE cumsum >= total_weight * 0.5
        ORDER BY region, bedroom, price
    )
    SELECT
        m.region,
        m.bedroom,
        m.volume_weighted_median,
        COUNT(r.id) as transaction_count,
        SUM(r.price) as total_value
    FROM region_mapped r
    JOIN medians m ON r.region = m.region AND r.bedroom = m.bedroom
    GROUP BY m.region, m.bedroom, m.volume_weighted_median
    ORDER BY
        CASE m.region WHEN 'CCR' THEN 1 WHEN 'RCR' THEN 2 ELSE 3 END,
        m.bedroom
    """)

    try:
        result = db.session.execute(sql, params).fetchall()
    except Exception as e:
        logger.error(f"Beads chart weighted median query failed: {e}")
        return []

    if not result:
        return []

    return [
        {
            'region': row.region,
            'bedroom': row.bedroom,
            'volumeWeightedMedian': float(row.volume_weighted_median),
            'transactionCount': row.transaction_count,
            'totalValue': float(row.total_value)
        }
        for row in result
    ]


def query_beads_chart(filters: Dict[str, Any], options: Dict[str, Any]) -> List[Dict]:
    """
    Query volume-weighted median prices by region and bedroom type.

    Automatically selects between fast and precise query paths based on
    date range span:
    - > 2 years (or unbounded): Fast path using PERCENTILE_CONT
    - <= 2 years: Precise path using volume-weighted median

    Args:
        filters: Dict with date_from, date_to, districts, segments, bedrooms, etc.
        options: Dict with query options (currently unused)

    Returns:
        List of dicts with:
        - region: 'CCR', 'RCR', or 'OCR'
        - bedroom: 1-5 (5 represents 5+)
        - volumeWeightedMedian: Median price (float)
        - transactionCount: Number of transactions (int)
        - totalValue: Sum of all transaction prices (float)
    """
    # Determine date range span to choose query path
    span_months = _calculate_date_span_months(filters)

    # Use fast path for large/unbounded ranges, precise path for recent data
    use_fast_path = span_months is None or span_months > FAST_QUERY_THRESHOLD_MONTHS

    if use_fast_path:
        logger.debug(f"Using fast query path (span: {span_months} months)")
        result = _query_fast_median(filters)
    else:
        logger.debug(f"Using precise query path (span: {span_months} months)")
        result = _query_weighted_median(filters)

    if not result:
        logger.warning(f"Beads chart query returned no results. Filters: {filters}")

    return result
