"""
District Growth Service

Calculates median PSF growth % per district by comparing the earliest
3-month period to the latest 3 completed months (rolling).

Used by the Dumbbell Chart on District Deep Dive page.
"""

import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import date
from dateutil.relativedelta import relativedelta

from sqlalchemy import func, and_, cast, Integer
from sqlalchemy.sql import extract

from models.transaction import Transaction
from models.database import db

logger = logging.getLogger('district_growth')


def get_current_month() -> str:
    """Get the current month string (e.g., '2026-01')."""
    today = date.today()
    return f"{today.year}-{today.month:02d}"


def get_last_n_completed_months(n: int = 3) -> List[str]:
    """
    Get the last N completed months as YYYY-MM strings.

    Example: If today is Jan 12, 2026, returns ['2025-10', '2025-11', '2025-12']
    """
    today = date.today()
    # Start from last month (current month is incomplete)
    last_complete = date(today.year, today.month, 1) - relativedelta(months=1)

    months = []
    for i in range(n):
        month_date = last_complete - relativedelta(months=(n - 1 - i))
        months.append(f"{month_date.year}-{month_date.month:02d}")

    return months


def format_period_label(months: List[str]) -> str:
    """
    Format a list of months into a readable period label.

    Example: ['2025-10', '2025-11', '2025-12'] -> 'Oct-Dec 2025'
    """
    if not months:
        return ''

    month_names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                   'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    first = months[0]
    last = months[-1]

    first_year, first_month = int(first[:4]), int(first[5:])
    last_year, last_month = int(last[:4]), int(last[5:])

    if first_year == last_year:
        return f"{month_names[first_month-1]}-{month_names[last_month-1]} {last_year}"
    else:
        return f"{month_names[first_month-1]} {first_year}-{month_names[last_month-1]} {last_year}"


def get_district_growth(
    sale_type: Optional[str] = None,
    bedrooms: Optional[List[int]] = None,
    districts: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Calculate median PSF growth % per district.

    Compares the earliest 3-month period to the latest 3 completed months
    (rolling window).

    Args:
        sale_type: Filter by sale type (e.g., 'Resale', 'New Sale')
        bedrooms: Filter by bedroom counts (e.g., [2, 3])
        districts: Filter by districts (e.g., ['D01', 'D02'])

    Returns:
        {
            "data": [
                {
                    "district": "D01",
                    "startPeriod": "Oct-Dec 2020",
                    "endPeriod": "Oct-Dec 2025",
                    "startPsf": 1234.56,
                    "endPsf": 1567.89,
                    "growthPercent": 27.02
                },
                ...
            ],
            "meta": {
                "startPeriod": "Oct-Dec 2020",
                "endPeriod": "Oct-Dec 2025",
                "startMonths": ["2020-10", "2020-11", "2020-12"],
                "endMonths": ["2025-10", "2025-11", "2025-12"],
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

    # Build month expression: "YYYY-MM"
    year_expr = cast(extract('year', Transaction.transaction_date), Integer)
    month_expr = cast(extract('month', Transaction.transaction_date), Integer)
    # Use concat with lpad for proper zero-padding
    period_expr = func.concat(
        year_expr,
        '-',
        func.lpad(cast(month_expr, db.String), 2, '0')
    )

    # Query 1: get available months only (cheap), then compute start/end windows.
    month_rows = db.session.query(
        period_expr.label('month')
    ).filter(
        and_(*conditions)
    ).distinct().order_by(
        period_expr
    ).all()

    if not month_rows:
        return {
            "data": [],
            "meta": {
                "startPeriod": None,
                "endPeriod": None,
                "startMonths": [],
                "endMonths": [],
                "excludedDistricts": []
            }
        }

    # Sort months chronologically
    sorted_months = [row.month for row in month_rows if row.month]
    all_months = set(sorted_months)

    # Exclude current incomplete month
    current_month = get_current_month()
    completed_months = [m for m in sorted_months if m != current_month]

    if len(completed_months) < 6:
        # Need at least 6 months (3 for start + 3 for end, non-overlapping)
        logger.warning("Need at least 6 completed months for growth comparison")
        return {
            "data": [],
            "meta": {
                "startPeriod": None,
                "endPeriod": None,
                "startMonths": [],
                "endMonths": [],
                "excludedDistricts": []
            }
        }

    # Start period: first 3 months with data
    start_months = completed_months[:3]

    # End period: last 3 completed months (rolling)
    end_months = get_last_n_completed_months(3)

    # Ensure end months exist in data, otherwise use last 3 from completed_months
    if not all(m in all_months for m in end_months):
        end_months = completed_months[-3:]

    start_period_label = format_period_label(start_months)
    end_period_label = format_period_label(end_months)
    target_months = sorted(set(start_months + end_months))

    # Query 2: compute medians only for the 6 relevant months (not full history).
    results = db.session.query(
        Transaction.district.label('district'),
        period_expr.label('month'),
        func.percentile_cont(0.5).within_group(Transaction.psf).label('median_psf'),
    ).filter(
        and_(*conditions),
        period_expr.in_(target_months)
    ).group_by(
        Transaction.district,
        period_expr
    ).all()

    # Build district -> month -> median_psf map
    district_month_map: Dict[str, Dict[str, float]] = {}
    for row in results:
        district = row.district
        month = row.month
        median_psf = float(row.median_psf) if row.median_psf else 0
        if not district or not month or median_psf <= 0:
            continue
        district_month_map.setdefault(district, {})[month] = median_psf

    # Calculate growth for each district
    data = []
    excluded_districts = []

    for district, month_data in district_month_map.items():
        # Calculate median PSF for start period (average of medians across 3 months)
        start_psfs = [month_data.get(m) for m in start_months if month_data.get(m)]
        end_psfs = [month_data.get(m) for m in end_months if month_data.get(m)]

        # Require at least 2 months of data in each period for reliability
        has_start = len(start_psfs) >= 2
        has_end = len(end_psfs) >= 2

        if has_start and has_end:
            # Use median of medians for each period
            start_psf = sorted(start_psfs)[len(start_psfs) // 2]
            end_psf = sorted(end_psfs)[len(end_psfs) // 2]

            growth_percent = ((end_psf - start_psf) / start_psf) * 100

            data.append({
                "district": district,
                "startPeriod": start_period_label,
                "endPeriod": end_period_label,
                "startPsf": round(start_psf, 2),
                "endPsf": round(end_psf, 2),
                "growthPercent": round(growth_percent, 2)
            })
        else:
            # Track excluded districts
            if not has_start and not has_end:
                reason = f"Insufficient data for both periods"
            elif not has_start:
                reason = f"Insufficient data for {start_period_label}"
            else:
                reason = f"Insufficient data for {end_period_label}"

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
            "startPeriod": start_period_label,
            "endPeriod": end_period_label,
            "startMonths": start_months,
            "endMonths": end_months,
            # Keep legacy field names for backwards compatibility
            "startQuarter": start_period_label,
            "endQuarter": end_period_label,
            "excludedDistricts": excluded_districts
        }
    }
