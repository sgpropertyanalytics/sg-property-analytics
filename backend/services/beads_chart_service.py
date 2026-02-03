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
"""

import logging
from typing import Dict, Any, List

from sqlalchemy import text

from models.database import db
from constants import CCR_DISTRICTS, RCR_DISTRICTS
from utils.filter_builder import build_sql_where

logger = logging.getLogger('beads_chart')


def query_beads_chart(filters: Dict[str, Any], options: Dict[str, Any]) -> List[Dict]:
    """
    Query volume-weighted median prices by region and bedroom type.

    Uses PostgreSQL window functions to calculate weighted median where
    the weight is the transaction price (representing capital volume).

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
    where_parts, params = build_sql_where(filters)
    where_clause = " AND ".join(where_parts) if where_parts else "1=1"

    # Build CCR/RCR district lists for the CASE expression
    ccr_list = ", ".join([f"'{d}'" for d in CCR_DISTRICTS])
    rcr_list = ", ".join([f"'{d}'" for d in RCR_DISTRICTS])

    # Volume-Weighted Median Query
    #
    # Algorithm:
    # 1. Map districts to regions and cap bedroom at 5+
    # 2. For each (region, bedroom) group, calculate cumulative price sum
    # 3. Find the first price where cumsum >= 50% of total (this is the weighted median)
    # 4. Aggregate counts and totals
    #
    # Note: This uses DISTINCT ON which is PostgreSQL-specific
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
        FROM transactions_primary
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
        logger.error(f"Beads chart query failed: {e}")
        return []

    if not result:
        logger.warning(f"Beads chart query returned no results. Filters: {filters}")
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
