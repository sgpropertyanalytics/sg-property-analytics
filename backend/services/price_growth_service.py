"""
Price Growth Service - Transaction-Level Historical Price Growth Analysis

Computes price growth metrics for individual transactions within market segments
(project + bedroom_count + floor_level). Helps buyers understand historical
appreciation patterns and identify pricing trends at granular level.

Key Features:
- Window functions with PARTITION BY for segment-level analysis
- Cumulative growth from first transaction in segment
- Incremental growth from previous transaction
- Annualized growth calculations
- Days between transactions

Usage:
    from services.price_growth_service import get_transaction_price_growth

    result = get_transaction_price_growth(
        project_name="THE ORIE",
        bedroom_count=2,
        floor_level="Mid"
    )
"""

import logging
from datetime import date
from typing import Dict, Any, List, Optional
from dataclasses import dataclass

from sqlalchemy import text

from models.database import db
from schemas.api_contract import SaleType

logger = logging.getLogger('price_growth')


# =============================================================================
# CONFIGURATION
# =============================================================================

# Default pagination
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 500


# =============================================================================
# DATA CLASSES
# =============================================================================

@dataclass
class TransactionGrowth:
    """Individual transaction with growth metrics."""
    id: int
    project_name: str
    bedroom_count: int
    floor_level: str
    transaction_date: date
    psf: float
    txn_sequence: int
    cumulative_growth_pct: Optional[float]
    incremental_growth_pct: Optional[float]
    days_since_prev: Optional[int]
    annualized_growth_pct: Optional[float]


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

def get_transaction_price_growth(
    project_name: Optional[str] = None,
    bedroom_count: Optional[int] = None,
    floor_level: Optional[str] = None,
    district: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    sale_type: Optional[str] = None,
    page: int = 1,
    per_page: int = DEFAULT_PAGE_SIZE
) -> Dict[str, Any]:
    """
    Get transaction-level price growth metrics.

    Args:
        project_name: Filter by project name (partial match)
        bedroom_count: Filter by bedroom count (1-5)
        floor_level: Filter by floor level (Low, Mid, High, etc.)
        district: Filter by district (e.g., 'D09')
        date_from: Start date for transaction filter
        date_to: End date for transaction filter
        sale_type: Filter by sale type (enum value from SaleType)
        page: Page number (1-indexed)
        per_page: Records per page (max 500)

    Returns:
        Dict with data (list of transactions), pagination metadata
    """
    # Validate pagination
    page = max(1, page)
    per_page = min(per_page, MAX_PAGE_SIZE)
    offset = (page - 1) * per_page

    # Build filter conditions
    filter_conditions = []
    params = {
        "limit": per_page,
        "offset": offset
    }

    if project_name:
        filter_conditions.append("project_name ILIKE :project_name")
        params["project_name"] = f"%{project_name}%"

    if bedroom_count is not None:
        filter_conditions.append("bedroom_count = :bedroom_count")
        params["bedroom_count"] = bedroom_count

    if floor_level:
        filter_conditions.append("COALESCE(floor_level, 'Unknown') = :floor_level")
        params["floor_level"] = floor_level

    if district:
        filter_conditions.append("district = :district")
        params["district"] = district

    if date_from:
        filter_conditions.append("transaction_date >= :date_from")
        params["date_from"] = date_from

    if date_to:
        filter_conditions.append("transaction_date <= :date_to")
        params["date_to"] = date_to

    if sale_type:
        # Normalize sale type through API contract
        sale_type_db = SaleType.to_db(sale_type)
        filter_conditions.append("sale_type = :sale_type")
        params["sale_type"] = sale_type_db

    # Build WHERE clause
    where_clause = "COALESCE(is_outlier, false) = false"
    if filter_conditions:
        where_clause += " AND " + " AND ".join(filter_conditions)

    # Execute main query
    query = text(f"""
        WITH transaction_growth AS (
            SELECT
                id,
                project_name,
                bedroom_count,
                COALESCE(floor_level, 'Unknown') as floor_level,
                transaction_date,
                psf,

                -- First PSF in this segment (project + bedroom + floor)
                FIRST_VALUE(psf) OVER (
                    PARTITION BY
                        project_name,
                        bedroom_count,
                        COALESCE(floor_level, 'Unknown')
                    ORDER BY transaction_date
                    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
                ) as first_psf,

                -- Previous transaction PSF
                LAG(psf) OVER (
                    PARTITION BY
                        project_name,
                        bedroom_count,
                        COALESCE(floor_level, 'Unknown')
                    ORDER BY transaction_date
                ) as prev_psf,

                -- Previous transaction date
                LAG(transaction_date) OVER (
                    PARTITION BY
                        project_name,
                        bedroom_count,
                        COALESCE(floor_level, 'Unknown')
                    ORDER BY transaction_date
                ) as prev_date,

                -- Row number within segment (for identifying first transaction)
                ROW_NUMBER() OVER (
                    PARTITION BY
                        project_name,
                        bedroom_count,
                        COALESCE(floor_level, 'Unknown')
                    ORDER BY transaction_date
                ) as txn_sequence

            FROM transactions
            WHERE {where_clause}
        )
        SELECT
            id,
            project_name,
            bedroom_count,
            floor_level,
            transaction_date,
            psf,
            txn_sequence,

            -- Cumulative growth % from first transaction in segment
            CASE
                WHEN first_psf > 0 AND txn_sequence > 1 THEN
                    ROUND(((psf - first_psf) / first_psf * 100)::numeric, 2)
                ELSE NULL
            END as cumulative_growth_pct,

            -- Incremental growth % from previous transaction
            CASE
                WHEN prev_psf > 0 THEN
                    ROUND(((psf - prev_psf) / prev_psf * 100)::numeric, 2)
                ELSE NULL
            END as incremental_growth_pct,

            -- Days since previous transaction
            CASE
                WHEN prev_date IS NOT NULL THEN
                    (transaction_date - prev_date)
                ELSE NULL
            END as days_since_prev,

            -- Annualized incremental growth %
            CASE
                WHEN prev_psf > 0
                 AND prev_date IS NOT NULL
                 AND (transaction_date - prev_date) > 0 THEN
                    ROUND((
                        ((psf - prev_psf) / prev_psf) *
                        (365.0 / (transaction_date - prev_date)) *
                        100
                    )::numeric, 2)
                ELSE NULL
            END as annualized_growth_pct

        FROM transaction_growth
        ORDER BY
            project_name,
            bedroom_count,
            floor_level,
            transaction_date
        LIMIT :limit OFFSET :offset
    """)

    results = db.session.execute(query, params).fetchall()

    # Get total count for pagination
    count_query = text(f"""
        SELECT COUNT(*)
        FROM transactions
        WHERE {where_clause}
    """)
    # Remove pagination params for count query
    count_params = {k: v for k, v in params.items() if k not in ['limit', 'offset']}
    total_count = db.session.execute(count_query, count_params).scalar()

    # Convert to list of dicts
    data = []
    for row in results:
        data.append({
            "id": row.id,
            "project_name": row.project_name,
            "bedroom_count": row.bedroom_count,
            "floor_level": row.floor_level,
            "transaction_date": row.transaction_date.isoformat() if row.transaction_date else None,
            "psf": float(row.psf) if row.psf else None,
            "txn_sequence": row.txn_sequence,
            "cumulative_growth_pct": float(row.cumulative_growth_pct) if row.cumulative_growth_pct is not None else None,
            "incremental_growth_pct": float(row.incremental_growth_pct) if row.incremental_growth_pct is not None else None,
            "days_since_prev": int(row.days_since_prev) if row.days_since_prev is not None else None,
            "annualized_growth_pct": float(row.annualized_growth_pct) if row.annualized_growth_pct is not None else None,
        })

    # Calculate pagination metadata
    total_pages = (total_count + per_page - 1) // per_page

    return {
        "data": data,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total_count": total_count,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1
        },
        "filters_applied": {
            "project_name": project_name,
            "bedroom_count": bedroom_count,
            "floor_level": floor_level,
            "district": district,
            "date_from": date_from.isoformat() if date_from else None,
            "date_to": date_to.isoformat() if date_to else None,
            "sale_type": sale_type
        }
    }


# =============================================================================
# SEGMENT SUMMARY (AGGREGATED VIEW)
# =============================================================================

def get_segment_summary(
    project_name: Optional[str] = None,
    district: Optional[str] = None,
    sale_type: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get aggregated summary of price growth by segment (project + bedroom + floor).

    Args:
        project_name: Filter by project name (partial match)
        district: Filter by district
        sale_type: Filter by sale type

    Returns:
        List of segment summaries with average growth metrics
    """
    # Build filter conditions
    filter_conditions = []
    params = {}

    if project_name:
        filter_conditions.append("project_name ILIKE :project_name")
        params["project_name"] = f"%{project_name}%"

    if district:
        filter_conditions.append("district = :district")
        params["district"] = district

    if sale_type:
        sale_type_db = SaleType.to_db(sale_type)
        filter_conditions.append("sale_type = :sale_type")
        params["sale_type"] = sale_type_db

    # Build WHERE clause
    where_clause = "COALESCE(is_outlier, false) = false"
    if filter_conditions:
        where_clause += " AND " + " AND ".join(filter_conditions)

    query = text(f"""
        WITH transaction_growth AS (
            SELECT
                project_name,
                bedroom_count,
                COALESCE(floor_level, 'Unknown') as floor_level,
                transaction_date,
                psf,

                FIRST_VALUE(psf) OVER (
                    PARTITION BY project_name, bedroom_count, COALESCE(floor_level, 'Unknown')
                    ORDER BY transaction_date
                    ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
                ) as first_psf,

                LAG(psf) OVER (
                    PARTITION BY project_name, bedroom_count, COALESCE(floor_level, 'Unknown')
                    ORDER BY transaction_date
                ) as prev_psf,

                LAG(transaction_date) OVER (
                    PARTITION BY project_name, bedroom_count, COALESCE(floor_level, 'Unknown')
                    ORDER BY transaction_date
                ) as prev_date,

                ROW_NUMBER() OVER (
                    PARTITION BY project_name, bedroom_count, COALESCE(floor_level, 'Unknown')
                    ORDER BY transaction_date
                ) as txn_sequence

            FROM transactions
            WHERE {where_clause}
        ),
        growth_metrics AS (
            SELECT
                project_name,
                bedroom_count,
                floor_level,

                CASE
                    WHEN first_psf > 0 AND txn_sequence > 1 THEN
                        ((psf - first_psf) / first_psf * 100)
                    ELSE NULL
                END as cumulative_growth_pct,

                CASE
                    WHEN prev_psf > 0 THEN
                        ((psf - prev_psf) / prev_psf * 100)
                    ELSE NULL
                END as incremental_growth_pct,

                CASE
                    WHEN prev_date IS NOT NULL THEN
                        (transaction_date - prev_date)
                    ELSE NULL
                END as days_since_prev

            FROM transaction_growth
        )
        SELECT
            project_name,
            bedroom_count,
            floor_level,
            COUNT(*) as total_transactions,
            ROUND(AVG(cumulative_growth_pct)::numeric, 2) as avg_cumulative_growth,
            ROUND(AVG(incremental_growth_pct)::numeric, 2) as avg_incremental_growth,
            ROUND(AVG(days_since_prev)::numeric, 0) as avg_days_between_txn,
            ROUND(MIN(cumulative_growth_pct)::numeric, 2) as min_cumulative_growth,
            ROUND(MAX(cumulative_growth_pct)::numeric, 2) as max_cumulative_growth
        FROM growth_metrics
        GROUP BY project_name, bedroom_count, floor_level
        ORDER BY project_name, bedroom_count, floor_level
    """)

    results = db.session.execute(query, params).fetchall()

    # Convert to list of dicts
    segments = []
    for row in results:
        segments.append({
            "project_name": row.project_name,
            "bedroom_count": row.bedroom_count,
            "floor_level": row.floor_level,
            "total_transactions": row.total_transactions,
            "avg_cumulative_growth": float(row.avg_cumulative_growth) if row.avg_cumulative_growth is not None else None,
            "avg_incremental_growth": float(row.avg_incremental_growth) if row.avg_incremental_growth is not None else None,
            "avg_days_between_txn": int(row.avg_days_between_txn) if row.avg_days_between_txn is not None else None,
            "min_cumulative_growth": float(row.min_cumulative_growth) if row.min_cumulative_growth is not None else None,
            "max_cumulative_growth": float(row.max_cumulative_growth) if row.max_cumulative_growth is not None else None,
        })

    return segments
