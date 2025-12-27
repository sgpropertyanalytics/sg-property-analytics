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
from db.sql import OUTLIER_FILTER
from constants import CCR_DISTRICTS, RCR_DISTRICTS, get_districts_for_region

logger = logging.getLogger('beads_chart')


def _build_where_clause(filters: Dict[str, Any]) -> tuple:
    """
    Build WHERE clause parts and params dict for the query.

    Returns:
        tuple: (where_parts list, params dict)
    """
    where_parts = []
    params = {}

    # Date range
    if filters.get('date_from'):
        where_parts.append("transaction_date >= :date_from")
        params['date_from'] = filters['date_from']
    if filters.get('date_to'):
        where_parts.append("transaction_date <= :date_to")
        params['date_to'] = filters['date_to']

    # Districts (explicit) - accept both 'district' and 'districts' keys
    districts = filters.get('districts') or filters.get('district', [])
    if districts:
        if isinstance(districts, str):
            districts = [d.strip() for d in districts.split(',')]
        placeholders = ','.join([f":district_{i}" for i in range(len(districts))])
        where_parts.append(f"district IN ({placeholders})")
        for i, d in enumerate(districts):
            params[f'district_{i}'] = d.upper().strip()
    else:
        # Handle segments (convert to districts)
        segments = filters.get('segments', [])
        if not segments:
            single_segment = filters.get('segment')
            if single_segment:
                segments = [single_segment]

        if segments:
            all_segment_districts = []
            for seg in segments:
                seg_districts = get_districts_for_region(seg)
                if seg_districts:
                    all_segment_districts.extend(seg_districts)
            if all_segment_districts:
                placeholders = ','.join([f":seg_district_{i}" for i in range(len(all_segment_districts))])
                where_parts.append(f"district IN ({placeholders})")
                for i, d in enumerate(all_segment_districts):
                    params[f'seg_district_{i}'] = d

    # Bedrooms filter - accept both 'bedroom' and 'bedrooms' keys
    bedrooms = filters.get('bedrooms') or filters.get('bedroom', [])
    if bedrooms:
        if isinstance(bedrooms, str):
            bedrooms = [int(b.strip()) for b in bedrooms.split(',')]
        placeholders = ','.join([f":bedroom_{i}" for i in range(len(bedrooms))])
        where_parts.append(f"bedroom_count IN ({placeholders})")
        for i, b in enumerate(bedrooms):
            params[f'bedroom_{i}'] = b

    # Sale type
    if filters.get('sale_type'):
        where_parts.append("LOWER(sale_type) = LOWER(:sale_type)")
        params['sale_type'] = filters['sale_type']

    # PSF range
    if filters.get('psf_min') is not None:
        where_parts.append("psf >= :psf_min")
        params['psf_min'] = float(filters['psf_min'])
    if filters.get('psf_max') is not None:
        where_parts.append("psf <= :psf_max")
        params['psf_max'] = float(filters['psf_max'])

    # Price range
    if filters.get('price_min') is not None:
        where_parts.append("price >= :price_min")
        params['price_min'] = float(filters['price_min'])
    if filters.get('price_max') is not None:
        where_parts.append("price <= :price_max")
        params['price_max'] = float(filters['price_max'])

    # Size range
    if filters.get('size_min') is not None:
        where_parts.append("area_sqft >= :size_min")
        params['size_min'] = float(filters['size_min'])
    if filters.get('size_max') is not None:
        where_parts.append("area_sqft <= :size_max")
        params['size_max'] = float(filters['size_max'])

    # Tenure filter
    if filters.get('tenure'):
        where_parts.append("LOWER(tenure) = LOWER(:tenure)")
        params['tenure'] = filters['tenure']

    # Project filter
    if filters.get('project'):
        where_parts.append("project_name ILIKE :project")
        params['project'] = f"%{filters['project']}%"

    return where_parts, params


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
    where_parts, params = _build_where_clause(filters)
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
        FROM transactions
        WHERE {OUTLIER_FILTER}
          AND price IS NOT NULL
          AND price > 0
          AND bedroom_count IS NOT NULL
          AND bedroom_count > 0
          AND {where_clause}
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
