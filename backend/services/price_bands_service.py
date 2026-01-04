"""
Price Bands Service - Historical Downside Protection Analysis

Computes percentile bands (P25/P50/P75) for project resale transactions
to help buyers assess downside risk. Includes fallback to district/segment
proxies when project data is insufficient.

Key Features:
- SQL-only aggregation with PostgreSQL PERCENTILE_CONT
- 3-month rolling median smoothing
- Automatic fallback hierarchy (project -> district+segment+tenure -> district -> segment)
- Verdict computation (Protected/Watch/Exposed)

Usage:
    from services.price_bands_service import get_project_price_bands

    result = get_project_price_bands(
        project_name="The Continuum",
        window_months=24,
        unit_psf=2100
    )
"""

import logging
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from typing import Dict, Any, List, Optional, Tuple

from sqlalchemy import text

from models.database import db
from api.contracts.contract_schema import SaleType
from constants import (
    get_region_for_district, get_districts_for_region,
    normalize_tenure, TENURE_TYPE_LABELS_SHORT,
    TENURE_FREEHOLD, TENURE_99_YEAR, TENURE_999_YEAR
)
from services.price_bands_compute import (
    apply_rolling_median_smoothing,
    get_latest_values,
    compute_floor_trend,
    compute_verdict,
    FloorDirection,
    TREND_RISING_THRESHOLD,
    TREND_WEAKENING_THRESHOLD,
)

logger = logging.getLogger('price_bands')

# =============================================================================
# CONFIGURATION
# =============================================================================

# Thresholds for project validity
MIN_TOTAL_TRADES = 20  # Minimum resale trades in window
MIN_MONTHS_WITH_DATA = 8  # Minimum months with >= MIN_TRADES_PER_BUCKET
MIN_TRADES_PER_BUCKET = 3  # Minimum trades per month to compute percentiles

# Relaxed thresholds for fallback (documented rationale):
# Proxies aggregate more data, so fewer strict requirements.
# Still need meaningful sample size for reliable percentiles.
MIN_FALLBACK_TRADES = 10
MIN_FALLBACK_MONTHS = 4

# PSF guardrails (additional to is_outlier filter)
PSF_MIN = 300
PSF_MAX = 10000

# Smoothing window
SMOOTHING_WINDOW = 3  # 3-month rolling median

# Trend calculation
TREND_MONTHS = 6  # Look back 6 months for floor trend


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

def get_project_price_bands(
    project_name: str,
    window_months: int = 24,
    unit_psf: Optional[float] = None
) -> Dict[str, Any]:
    """
    Get historical price bands for a project with optional verdict.

    Args:
        project_name: The project name to analyze
        window_months: Analysis window in months (default 24)
        unit_psf: Optional user's unit PSF for verdict calculation

    Returns:
        Dict with bands, latest, trend, verdict (if unit_psf), and data_quality
    """
    # Get project info (district, tenure)
    project_info = _get_project_info(project_name)
    if not project_info:
        return _empty_response(project_name, "Project not found")

    district = project_info['district']
    tenure = project_info['tenure']
    segment = get_region_for_district(district) if district else None

    # Calculate date range
    date_to = date.today()
    date_from = date_to - relativedelta(months=window_months)

    # Check project validity and get bands
    is_valid, validity_reason, bands_raw = _check_and_get_project_bands(
        project_name, date_from, date_to
    )

    data_source = "project"
    proxy_label = None

    # If project data is insufficient, try fallback hierarchy
    if not is_valid:
        logger.info(
            f"Project '{project_name}' failed validity: {validity_reason}. "
            f"Attempting fallback (district={district}, segment={segment}, tenure={tenure})"
        )
        bands_raw, data_source, proxy_label = _get_fallback_bands(
            district, segment, tenure, date_from, date_to
        )

        if not bands_raw:
            logger.warning(
                f"All fallback paths failed for project '{project_name}'"
            )
            return _empty_response(
                project_name,
                "Insufficient data for analysis",
                data_quality={
                    "total_trades": 0,
                    "months_with_data": 0,
                    "is_valid": False,
                    "fallback_reason": validity_reason,
                    "window_months": window_months
                }
            )
        else:
            logger.info(
                f"Fallback successful for '{project_name}': {data_source} -> {proxy_label}"
            )

    # Apply 3-month rolling median smoothing
    bands = apply_rolling_median_smoothing(bands_raw, SMOOTHING_WINDOW)

    # Get latest values
    latest = get_latest_values(bands)

    # Calculate floor trend
    trend = compute_floor_trend(
        bands, TREND_MONTHS,
        rising_threshold=TREND_RISING_THRESHOLD,
        weakening_threshold=TREND_WEAKENING_THRESHOLD
    )

    # Calculate verdict if unit_psf provided
    verdict = None
    if unit_psf is not None and latest:
        verdict = compute_verdict(unit_psf, latest, trend)

    # Build data quality summary
    total_trades = sum(b.get('count', 0) for b in bands_raw if b.get('count'))
    months_with_data = len([b for b in bands_raw if b.get('p25') is not None])

    return {
        "project_name": project_name,
        "data_source": data_source,
        "proxy_label": proxy_label,
        "bands": bands,
        "latest": latest,
        "trend": trend,
        "verdict": verdict,
        "data_quality": {
            "total_trades": total_trades,
            "months_with_data": months_with_data,
            "is_valid": is_valid,
            "fallback_reason": validity_reason if not is_valid else None,
            "window_months": window_months,
            "smoothing": f"rolling_median_{SMOOTHING_WINDOW}"
        }
    }


# =============================================================================
# PROJECT INFO
# =============================================================================

def _get_project_info(project_name: str) -> Optional[Dict[str, Any]]:
    """Get project's district and tenure from most recent transaction."""
    result = db.session.execute(
        text("""
            SELECT district, tenure
            FROM transactions
            WHERE project_name = :project_name
              AND COALESCE(is_outlier, false) = false
            ORDER BY transaction_date DESC
            LIMIT 1
        """),
        {"project_name": project_name}
    ).fetchone()

    if result:
        return {
            "district": result[0],
            "tenure": normalize_tenure(result[1]) if result[1] else None
        }
    return None


# =============================================================================
# PROJECT VALIDITY CHECK
# =============================================================================

def _check_and_get_project_bands(
    project_name: str,
    date_from: date,
    date_to: date
) -> Tuple[bool, Optional[str], List[Dict]]:
    """
    Check if project meets validity thresholds and return raw bands.

    Returns:
        Tuple of (is_valid, validity_reason, bands_raw)
    """
    # Get raw percentile bands
    bands_raw = _compute_monthly_percentiles(
        project_name=project_name,
        date_from=date_from,
        date_to=date_to
    )

    # Calculate validity metrics
    total_trades = sum(b.get('count', 0) for b in bands_raw if b.get('count'))
    months_with_data = len([b for b in bands_raw if b.get('p25') is not None])

    # Check thresholds
    if total_trades < MIN_TOTAL_TRADES:
        return False, f"Only {total_trades} resale trades (need {MIN_TOTAL_TRADES}+)", bands_raw

    if months_with_data < MIN_MONTHS_WITH_DATA:
        return False, f"Only {months_with_data} months with data (need {MIN_MONTHS_WITH_DATA}+)", bands_raw

    return True, None, bands_raw


# =============================================================================
# PERCENTILE COMPUTATION
# =============================================================================

def _compute_monthly_percentiles(
    project_name: Optional[str] = None,
    district: Optional[str] = None,
    districts: Optional[List[str]] = None,
    segment: Optional[str] = None,
    tenure: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None
) -> List[Dict[str, Any]]:
    """
    Compute P25/P50/P75 per month using PostgreSQL PERCENTILE_CONT.

    Filters by project OR district/segment/tenure for fallback.
    Only includes months with >= MIN_TRADES_PER_BUCKET trades.

    SQL Correctness:
    - Uses SaleType.API_TO_DB for sale_type normalization
    - Uses COALESCE(is_outlier, false) = false for outlier exclusion
    - Uses parameterized queries for all dynamic values
    - Explicitly casts date comparisons
    """
    # Build WHERE conditions with parameterized values
    conditions = []
    params = {}

    # Sale type: Use DB constant directly
    from constants import SALE_TYPE_RESALE as DB_SALE_TYPE_RESALE
    conditions.append("sale_type = :sale_type")
    params["sale_type"] = DB_SALE_TYPE_RESALE

    # Outlier exclusion: Use COALESCE for NULL handling
    conditions.append("COALESCE(is_outlier, false) = false")

    # PSF guardrails
    conditions.append("psf > :psf_min AND psf < :psf_max")
    params["psf_min"] = PSF_MIN
    params["psf_max"] = PSF_MAX

    if project_name:
        conditions.append("project_name = :project_name")
        params["project_name"] = project_name

    if district:
        conditions.append("district = :district")
        params["district"] = district

    if districts:
        conditions.append("district = ANY(:districts)")
        params["districts"] = districts

    if segment and not district and not districts:
        # Get all districts for segment
        segment_districts = get_districts_for_region(segment)
        if segment_districts:
            conditions.append("district = ANY(:segment_districts)")
            params["segment_districts"] = segment_districts

    if tenure:
        # Normalize tenure first, then match
        normalized = normalize_tenure(tenure)
        if normalized == TENURE_FREEHOLD:
            conditions.append("LOWER(tenure) LIKE '%freehold%'")
        elif normalized == TENURE_999_YEAR:
            conditions.append("tenure LIKE '%999%'")
        elif normalized == TENURE_99_YEAR:
            conditions.append("tenure LIKE '%99%' AND tenure NOT LIKE '%999%'")
        # 'Unknown' tenure doesn't add a filter

    if date_from:
        conditions.append("transaction_date >= :date_from")
        params["date_from"] = date_from  # Pass Python date object directly

    if date_to:
        # Use < next_day instead of <= date_to to include all transactions on date_to
        # PostgreSQL treats date as midnight, so <= 2025-12-27 means <= 2025-12-27 00:00:00
        conditions.append("transaction_date < :date_to_exclusive")
        params["date_to_exclusive"] = date_to + timedelta(days=1)

    where_clause = " AND ".join(conditions)

    # Execute query with PERCENTILE_CONT
    query = text(f"""
        SELECT
            TO_CHAR(transaction_date, 'YYYY-MM') as month,
            COUNT(*) as trade_count,
            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY psf) as p25,
            PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY psf) as p50,
            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY psf) as p75
        FROM transactions
        WHERE {where_clause}
        GROUP BY TO_CHAR(transaction_date, 'YYYY-MM')
        HAVING COUNT(*) >= :min_trades
        ORDER BY month
    """)
    params["min_trades"] = MIN_TRADES_PER_BUCKET

    result = db.session.execute(query, params).fetchall()

    bands = []
    for row in result:
        bands.append({
            "month": row[0],
            "count": int(row[1]),
            "p25": round(float(row[2]), 0) if row[2] else None,
            "p50": round(float(row[3]), 0) if row[3] else None,
            "p75": round(float(row[4]), 0) if row[4] else None
        })

    return bands


# =============================================================================
# FALLBACK HIERARCHY
# =============================================================================

def _get_fallback_bands(
    district: Optional[str],
    segment: Optional[str],
    tenure: Optional[str],
    date_from: date,
    date_to: date
) -> Tuple[List[Dict], str, str]:
    """
    Try fallback hierarchy when project data is insufficient.

    Hierarchy:
    1. District + Tenure (same district, same tenure type)
    2. District only (same district, all tenures)
    3. Segment only (same region, all districts)

    Returns:
        Tuple of (bands, data_source, proxy_label)
    """
    # Try 1: District + Tenure (if both available and tenure is known)
    if district and tenure and tenure != 'Unknown':
        bands = _compute_monthly_percentiles(
            district=district,
            tenure=tenure,
            date_from=date_from,
            date_to=date_to
        )
        if _is_fallback_valid(bands):
            tenure_short = TENURE_TYPE_LABELS_SHORT.get(tenure, tenure)
            return bands, "district_proxy", f"{district} {tenure_short} proxy"

    # Try 2: District only
    if district:
        bands = _compute_monthly_percentiles(
            district=district,
            date_from=date_from,
            date_to=date_to
        )
        if _is_fallback_valid(bands):
            return bands, "district_proxy", f"{district} proxy"

    # Try 3: Segment only
    if segment:
        bands = _compute_monthly_percentiles(
            segment=segment,
            date_from=date_from,
            date_to=date_to
        )
        if _is_fallback_valid(bands):
            return bands, "segment_proxy", f"{segment} segment proxy"

    return [], "none", None


def _is_fallback_valid(bands: List[Dict]) -> bool:
    """
    Check if fallback bands meet minimum thresholds.

    Uses relaxed thresholds compared to project-level because:
    - Fallback aggregates multiple projects, so individual project sparsity is mitigated
    - Still requires meaningful sample for reliable percentiles
    """
    total_trades = sum(b.get('count', 0) for b in bands if b.get('count'))
    months_with_data = len([b for b in bands if b.get('p25') is not None])

    return total_trades >= MIN_FALLBACK_TRADES and months_with_data >= MIN_FALLBACK_MONTHS


# =============================================================================
# HELPERS
# =============================================================================

def _empty_response(
    project_name: str,
    message: str,
    data_quality: Optional[Dict] = None
) -> Dict[str, Any]:
    """Return empty response structure with error message."""
    return {
        "project_name": project_name,
        "data_source": "none",
        "proxy_label": None,
        "bands": [],
        "latest": None,
        "trend": {
            "floor_direction": FloorDirection.UNKNOWN,
            "floor_slope_pct": None,
            "observation_months": 0
        },
        "verdict": None,
        "data_quality": data_quality or {
            "total_trades": 0,
            "months_with_data": 0,
            "is_valid": False,
            "fallback_reason": message,
            "window_months": 24
        },
        "error": message
    }
