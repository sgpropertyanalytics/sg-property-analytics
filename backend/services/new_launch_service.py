"""
New Launch Service - Timeline of project launches

Provides aggregated data about new launch projects over time:
- Number of projects launched per period
- Total units launched per period

CRITICAL CORRECTNESS RULES:
1. Launch date is computed GLOBALLY (unfiltered) - first New Sale ever for each project
2. Filters are applied as COHORT MEMBERSHIP, not date shifts
3. Project key is canonical: UPPER(TRIM(project_name))
4. Join with new_launch_units CSV for total_units (loaded once, lookup by key)

Usage:
    from services.new_launch_service import get_new_launch_timeline

    result = get_new_launch_timeline(
        time_grain='quarter',
        districts=['D09', 'D10'],
        segments=['CCR'],
        bedrooms=[2, 3],
        date_from=date(2022, 1, 1),
        date_to_exclusive=date(2025, 1, 1),
    )
"""
from datetime import date
from typing import Optional, List, Dict, Any
from sqlalchemy import text
from models.database import db
from db.sql import get_outlier_filter_sql
from constants import SALE_TYPE_NEW, get_districts_for_region
from services.new_launch_units import list_all_projects

import logging

logger = logging.getLogger('new_launch_service')


# Valid time grains - validated before SQL execution
VALID_TIME_GRAINS = {'month', 'quarter', 'year'}

# Canonical project key SQL expression - single source of truth
# Normalizes: uppercase, trim whitespace
PROJECT_KEY_EXPR = "UPPER(TRIM(project_name))"


def _build_units_map() -> Dict[str, int]:
    """
    Load all project units from CSV into a map keyed by canonical project key.

    Returns:
        Dict mapping UPPER(TRIM(project_name)) → total_units
    """
    units_map = {}
    try:
        all_projects = list_all_projects()
        for proj in all_projects:
            # Normalize key the same way as SQL
            key = proj.get('project_name', '').upper().strip()
            units = proj.get('total_units')
            if key and units:
                units_map[key] = units
    except Exception as e:
        logger.warning(f"Failed to load project units map: {e}")
    return units_map


def get_new_launch_timeline(
    time_grain: str = 'quarter',
    districts: Optional[List[str]] = None,
    segments: Optional[List[str]] = None,
    bedrooms: Optional[List[int]] = None,
    date_from: Optional[date] = None,
    date_to_exclusive: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """
    Get new launch activity grouped by time period.

    CRITICAL: Launch date is computed globally (unfiltered).
    Filters are applied as cohort membership, not date shifts.

    Args:
        time_grain: 'month', 'quarter', or 'year'
        districts: List of districts to filter (e.g., ['D09', 'D10'])
        segments: List of segments to filter (e.g., ['CCR', 'RCR'])
        bedrooms: List of bedroom counts (e.g., [2, 3])
        date_from: Inclusive start date for launch_date filter
        date_to_exclusive: Exclusive end date for launch_date filter

    Returns:
        List of dicts: [
            { "periodStart": "2024-01-01", "projectCount": 5, "totalUnits": 1200 },
            ...
        ]
    """
    # Validate time_grain BEFORE SQL
    if time_grain not in VALID_TIME_GRAINS:
        raise ValueError(f"time_grain must be one of {VALID_TIME_GRAINS}, got '{time_grain}'")

    # Build outlier filter snippets with table aliases
    outlier_filter_t = get_outlier_filter_sql('t')
    outlier_filter_tx = get_outlier_filter_sql('tx')

    # Build params dict with boolean guards for optional filters
    # This avoids f-string SQL injection and keeps SQL static
    params: Dict[str, Any] = {
        "sale_type_new": SALE_TYPE_NEW,
        "time_grain": time_grain,
        # Boolean guards for optional filters
        "date_from_is_null": date_from is None,
        "date_to_is_null": date_to_exclusive is None,
        "districts_is_null": True,
        "bedrooms_is_null": bedrooms is None,
    }

    # Date range params
    if date_from:
        params["date_from"] = date_from
    else:
        params["date_from"] = date(1900, 1, 1)  # Placeholder, guarded by is_null

    if date_to_exclusive:
        params["date_to_exclusive"] = date_to_exclusive
    else:
        params["date_to_exclusive"] = date(2100, 1, 1)  # Placeholder, guarded by is_null

    # District filter - combine explicit districts + segment-derived districts
    all_filter_districts = set()

    if districts:
        all_filter_districts.update(districts)

    if segments:
        for seg in segments:
            all_filter_districts.update(get_districts_for_region(seg))

    if all_filter_districts:
        params["districts_is_null"] = False
        params["districts"] = sorted(all_filter_districts)
    else:
        params["districts"] = []  # Empty array, guarded by is_null

    # Bedroom filter
    if bedrooms:
        params["bedrooms"] = bedrooms
    else:
        params["bedrooms"] = []  # Empty array, guarded by is_null

    # Static SQL with boolean-param guards (no f-string injection of clauses)
    # Uses MIN(district) instead of MODE() for determinism and compatibility
    sql = f"""
    WITH project_launch AS (
        -- Stage 1: Global launch dates (NEVER filtered)
        -- Get first New Sale per project with deterministic district (MIN)
        SELECT
            {PROJECT_KEY_EXPR} AS project_key,
            MIN(t.transaction_date) AS launch_date,
            MIN(t.district) AS district
        FROM transactions_primary t
        WHERE t.sale_type = :sale_type_new
          AND {outlier_filter_t}
        GROUP BY {PROJECT_KEY_EXPR}
    ),

    eligible_projects AS (
        -- Stage 2: Apply filters as cohort membership (not date shifts)
        SELECT pl.project_key
        FROM project_launch pl
        WHERE 1=1
          -- Date range filter on launch_date
          AND (:date_from_is_null OR pl.launch_date >= :date_from)
          AND (:date_to_is_null OR pl.launch_date < :date_to_exclusive)
          -- District filter (includes segment-derived districts)
          AND (:districts_is_null OR pl.district = ANY(:districts))
          -- Bedroom filter: EXISTS subquery (doesn't shift launch_date)
          AND (
            :bedrooms_is_null OR EXISTS (
                SELECT 1
                FROM transactions_primary tx
                WHERE {PROJECT_KEY_EXPR} = pl.project_key
                  AND tx.sale_type = :sale_type_new
                  AND tx.bedroom_count = ANY(:bedrooms)
                  AND {outlier_filter_tx}
            )
          )
    ),

    launches AS (
        SELECT
            DATE_TRUNC(:time_grain, pl.launch_date) AS period_start,
            ep.project_key
        FROM project_launch pl
        JOIN eligible_projects ep ON ep.project_key = pl.project_key
    )

    SELECT
        l.period_start,
        COUNT(*) AS project_count,
        ARRAY_AGG(l.project_key) AS project_keys
    FROM launches l
    GROUP BY l.period_start
    ORDER BY l.period_start;
    """

    logger.debug(f"Executing new_launch_timeline SQL with params: {params}")

    # Execute query
    result = db.session.execute(text(sql), params).fetchall()

    # Load units map ONCE for efficient lookups
    units_map = _build_units_map()

    # Post-process: sum total_units using canonical keys
    timeline = []
    for row in result:
        period_start = row[0]  # datetime/date
        project_count = row[1]
        project_keys = row[2] or []

        # Sum up total units using canonical keys (O(1) lookup per project)
        total_units = sum(units_map.get(key, 0) for key in project_keys)

        timeline.append({
            "periodStart": period_start.isoformat() if hasattr(period_start, 'isoformat') else str(period_start),
            "projectCount": project_count,
            "totalUnits": total_units,
        })

    return timeline


def _canonical_period_start(dt: date, time_grain: str) -> str:
    """Return canonical grain-start string (YYYY-MM-01 format)."""
    if time_grain == 'month':
        return dt.replace(day=1).isoformat()
    elif time_grain == 'quarter':
        q_month = ((dt.month - 1) // 3) * 3 + 1
        return dt.replace(month=q_month, day=1).isoformat()
    else:  # year
        return dt.replace(month=1, day=1).isoformat()


def get_new_launch_absorption(
    time_grain: str = 'quarter',
    districts: Optional[List[str]] = None,
    segments: Optional[List[str]] = None,
    bedrooms: Optional[List[int]] = None,
    date_from: Optional[date] = None,
    date_to_exclusive: Optional[date] = None,
) -> List[Dict[str, Any]]:
    """
    Get new launch activity with launch-month absorption rates.

    Absorption = units_sold_launch_month / total_units (per project, then averaged per period).
    "Launch month" = calendar month containing the project's first New Sale.

    Args:
        time_grain: 'month', 'quarter', or 'year'
        districts: List of districts (segment conversion done here, matching existing pattern)
        segments: List of segments (converted to districts)
        bedrooms: List of bedroom counts
        date_from: Inclusive start date for launch_date
        date_to_exclusive: Exclusive end date for launch_date
    """
    from collections import defaultdict

    if time_grain not in VALID_TIME_GRAINS:
        raise ValueError(f"time_grain must be one of {VALID_TIME_GRAINS}, got '{time_grain}'")

    # Build outlier filter snippets (matches existing pattern)
    outlier_filter_t = get_outlier_filter_sql('t')
    outlier_filter_tx = get_outlier_filter_sql('tx')

    # Convert segments to districts (matches existing get_new_launch_timeline pattern)
    all_filter_districts = set()
    if districts:
        all_filter_districts.update(districts)
    if segments:
        for seg in segments:
            all_filter_districts.update(get_districts_for_region(seg))

    params: Dict[str, Any] = {
        "sale_type_new": SALE_TYPE_NEW,
        "time_grain": time_grain,
        "date_from_is_null": date_from is None,
        "date_to_is_null": date_to_exclusive is None,
        "districts_is_null": len(all_filter_districts) == 0,
        "bedrooms_is_null": not bedrooms,
        "date_from": date_from or date(1900, 1, 1),
        "date_to_exclusive": date_to_exclusive or date(2100, 1, 1),
        "districts": sorted(all_filter_districts) if all_filter_districts else [],
        "bedrooms": bedrooms or [],
    }

    # SQL uses f-string for outlier filter (matches existing pattern)
    # DISTINCT ON with id tie-breaker for determinism (URA dates are month-bucketed)
    # LEFT JOIN ensures projectCount includes projects with 0 launch-month sales
    sql = f"""
    WITH project_launch AS (
        SELECT DISTINCT ON (UPPER(TRIM(t.project_name)))
            UPPER(TRIM(t.project_name)) AS project_key,
            t.transaction_date AS launch_date,
            DATE_TRUNC('month', t.transaction_date) AS launch_month_start,
            t.district AS district
        FROM transactions_primary t
        WHERE t.sale_type = :sale_type_new
          AND {outlier_filter_t}
        ORDER BY UPPER(TRIM(t.project_name)), t.transaction_date ASC, t.id ASC
    ),

    eligible_projects AS (
        SELECT pl.project_key, pl.launch_date, pl.launch_month_start,
               DATE_TRUNC(:time_grain, pl.launch_date) AS period_start
        FROM project_launch pl
        WHERE (:date_from_is_null OR pl.launch_date >= :date_from)
          AND (:date_to_is_null OR pl.launch_date < :date_to_exclusive)
          AND (:districts_is_null OR pl.district = ANY(:districts))
          AND (
            :bedrooms_is_null OR EXISTS (
                SELECT 1 FROM transactions_primary tx
                WHERE UPPER(TRIM(tx.project_name)) = pl.project_key
                  AND tx.sale_type = :sale_type_new
                  AND tx.bedroom_count = ANY(:bedrooms)
                  AND {outlier_filter_tx}
            )
          )
    ),

    launch_month_sales AS (
        SELECT
            UPPER(TRIM(t.project_name)) AS project_key,
            COUNT(*) AS units_sold
        FROM transactions_primary t
        WHERE t.sale_type = :sale_type_new
          AND {outlier_filter_t}
          AND EXISTS (
              SELECT 1 FROM eligible_projects ep
              WHERE ep.project_key = UPPER(TRIM(t.project_name))
                AND t.transaction_date >= ep.launch_month_start
                AND t.transaction_date < ep.launch_month_start + INTERVAL '1 month'
          )
        GROUP BY UPPER(TRIM(t.project_name))
    )

    SELECT ep.period_start, ep.project_key, COALESCE(lms.units_sold, 0) AS units_sold
    FROM eligible_projects ep
    LEFT JOIN launch_month_sales lms ON lms.project_key = ep.project_key
    ORDER BY ep.period_start, ep.project_key;
    """

    logger.debug(f"Executing new_launch_absorption SQL with time_grain={time_grain}")
    result = db.session.execute(text(sql), params).fetchall()

    # Load units map ONCE - keys match SQL: UPPER(TRIM(name))
    units_map = _build_units_map()

    # Group by period
    periods: Dict[date, List[Dict[str, Any]]] = defaultdict(list)
    for row in result:
        periods[row[0]].append({
            'project_key': row[1],
            'units_sold': row[2],
            'total_units': units_map.get(row[1]),
        })

    # Aggregate per period
    output = []
    for period_start, projects in sorted(periods.items()):
        absorptions = []
        projects_with_units = 0
        projects_missing = 0

        for p in projects:
            if p['total_units'] and p['total_units'] > 0:
                absorption = min(100.0, (p['units_sold'] / p['total_units']) * 100)
                absorptions.append(absorption)
                projects_with_units += 1
            else:
                projects_missing += 1

        output.append({
            "periodStart": _canonical_period_start(period_start, time_grain),
            "projectCount": len(projects),
            "avgAbsorption": round(sum(absorptions) / len(absorptions), 1) if absorptions else None,
            "projectsWithUnits": projects_with_units,
            "projectsMissing": projects_missing,
        })

    return output
