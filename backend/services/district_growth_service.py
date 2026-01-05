"""
District Growth Service

Calculates median PSF growth % per district by comparing the earliest
completed quarter to the latest completed quarter.

Used by the Dumbbell Chart on District Deep Dive page.
"""

import logging
from typing import Dict, Any, List, Optional
from datetime import date

from sqlalchemy import func, and_, cast, Integer, literal
from sqlalchemy.sql import extract

from models.transaction import Transaction
from models.database import db

logger = logging.getLogger('district_growth')


def get_district_growth(
    sale_type: Optional[str] = None,
    bedrooms: Optional[List[int]] = None,
    districts: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Calculate median PSF growth % per district.

    Compares the single earliest completed quarter to the single latest
    completed quarter across all districts.

    Args:
        sale_type: Filter by sale type (e.g., 'Resale', 'New Sale')
        bedrooms: Filter by bedroom counts (e.g., [2, 3])
        districts: Filter by districts (e.g., ['D01', 'D02'])

    Returns:
        {
            "data": [
                {
                    "district": "D01",
                    "startQuarter": "2020-Q4",
                    "endQuarter": "2024-Q4",
                    "startPsf": 1234.56,
                    "endPsf": 1567.89,
                    "growthPercent": 27.02
                },
                ...
            ],
            "meta": {
                "startQuarter": "2020-Q4",
                "endQuarter": "2024-Q4",
                "excludedDistricts": [{"district": "D27", "reason": "..."}]
            }
        }
    """
    # Build filter conditions
    conditions = [Transaction.outlier_filter()]

    if sale_type:
        conditions.append(func.lower(Transaction.sale_type) == sale_type.lower())

    if bedrooms:
        conditions.append(Transaction.bedroom_count.in_(bedrooms))

    if districts:
        conditions.append(Transaction.district.in_(districts))

    # Build quarter expression: "YYYY-QN"
    year_expr = cast(extract('year', Transaction.transaction_date), Integer)
    quarter_expr = cast(
        func.floor((extract('month', Transaction.transaction_date) - 1) / 3) + 1,
        Integer
    )
    period_expr = func.concat(year_expr, literal('-Q'), quarter_expr)

    # Query: Get median PSF per district per quarter
    query = db.session.query(
        Transaction.district.label('district'),
        period_expr.label('quarter'),
        func.percentile_cont(0.5).within_group(Transaction.psf).label('median_psf'),
        func.count(Transaction.id).label('txn_count')
    ).filter(
        and_(*conditions)
    ).group_by(
        Transaction.district,
        period_expr
    ).order_by(
        period_expr
    )

    results = query.all()

    if not results:
        return {
            "data": [],
            "meta": {
                "startQuarter": None,
                "endQuarter": None,
                "excludedDistricts": []
            }
        }

    # Build district -> quarter -> median_psf map
    district_quarter_map: Dict[str, Dict[str, float]] = {}
    all_quarters = set()

    for row in results:
        district = row.district
        quarter = row.quarter
        median_psf = float(row.median_psf) if row.median_psf else 0

        if median_psf > 0:
            if district not in district_quarter_map:
                district_quarter_map[district] = {}
            district_quarter_map[district][quarter] = median_psf
            all_quarters.add(quarter)

    # Sort quarters chronologically
    sorted_quarters = sorted(all_quarters)

    if len(sorted_quarters) < 2:
        logger.warning("Need at least 2 quarters for growth comparison")
        return {
            "data": [],
            "meta": {
                "startQuarter": None,
                "endQuarter": None,
                "excludedDistricts": []
            }
        }

    # Take single earliest and single latest quarter
    start_quarter = sorted_quarters[0]
    end_quarter = sorted_quarters[-1]

    # Calculate growth for each district
    data = []
    excluded_districts = []

    for district, quarter_data in district_quarter_map.items():
        start_psf = quarter_data.get(start_quarter)
        end_psf = quarter_data.get(end_quarter)

        if start_psf and start_psf > 0 and end_psf and end_psf > 0:
            growth_percent = ((end_psf - start_psf) / start_psf) * 100

            data.append({
                "district": district,
                "startQuarter": start_quarter,
                "endQuarter": end_quarter,
                "startPsf": round(start_psf, 2),
                "endPsf": round(end_psf, 2),
                "growthPercent": round(growth_percent, 2)
            })
        else:
            # Track excluded districts
            missing_start = not start_psf or start_psf <= 0
            missing_end = not end_psf or end_psf <= 0

            if missing_start and missing_end:
                reason = f"No data for {start_quarter} or {end_quarter}"
            elif missing_start:
                reason = f"No data for {start_quarter}"
            else:
                reason = f"No data for {end_quarter}"

            excluded_districts.append({
                "district": district,
                "reason": reason
            })
            logger.debug(f"Excluding {district}: {reason}")

    # Sort by growth percent descending
    data.sort(key=lambda x: x["growthPercent"], reverse=True)

    return {
        "data": data,
        "meta": {
            "startQuarter": start_quarter,
            "endQuarter": end_quarter,
            "excludedDistricts": excluded_districts
        }
    }
