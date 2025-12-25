"""
Price Bands Service - Historical Downside Protection Analysis

Computes percentile bands (P25/P50/P75) for project resale transactions
to help buyers assess downside risk. Includes fallback to district/segment
proxies when project data is insufficient.

Key Features:
- SQL-only aggregation with PostgreSQL PERCENTILE_CONT
- 3-month rolling median smoothing
- Automatic fallback hierarchy (project → district+segment+tenure → district → segment)
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
from statistics import median

from sqlalchemy import text, func, and_, or_, extract
from sqlalchemy.orm import Session

from models.database import db
from models.transaction import Transaction
from constants import (
    get_region_for_district, get_districts_for_region,
    normalize_tenure
)

logger = logging.getLogger('price_bands')

# =============================================================================
# CONFIGURATION
# =============================================================================

# Thresholds for project validity
MIN_TOTAL_TRADES = 20  # Minimum resale trades in window
MIN_MONTHS_WITH_DATA = 8  # Minimum months with >= MIN_TRADES_PER_BUCKET
MIN_TRADES_PER_BUCKET = 3  # Minimum trades per month to compute percentiles

# PSF guardrails (additional to is_outlier filter)
PSF_MIN = 300
PSF_MAX = 10000

# Smoothing window
SMOOTHING_WINDOW = 3  # 3-month rolling median

# Trend calculation
TREND_MONTHS = 6  # Look back 6 months for floor trend
TREND_RISING_THRESHOLD = 0.015  # +1.5%
TREND_WEAKENING_THRESHOLD = -0.015  # -1.5%


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
        bands_raw, data_source, proxy_label = _get_fallback_bands(
            district, segment, tenure, date_from, date_to
        )

        if not bands_raw:
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

    # Apply 3-month rolling median smoothing
    bands = _apply_rolling_median_smoothing(bands_raw, SMOOTHING_WINDOW)

    # Get latest values
    latest = _get_latest_values(bands)

    # Calculate floor trend
    trend = _compute_floor_trend(bands, TREND_MONTHS)

    # Calculate verdict if unit_psf provided
    verdict = None
    if unit_psf is not None and latest:
        verdict = _compute_verdict(unit_psf, latest, trend)

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
              AND (is_outlier = false OR is_outlier IS NULL)
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
    """
    # Build WHERE conditions
    conditions = [
        "sale_type = 'Resale'",
        "(is_outlier = false OR is_outlier IS NULL)",
        f"psf > {PSF_MIN}",
        f"psf < {PSF_MAX}"
    ]
    params = {}

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
        # Handle tenure matching (Freehold, 99-year, 999-year)
        if tenure == 'Freehold':
            conditions.append("LOWER(tenure) LIKE '%freehold%'")
        elif tenure == '999-year':
            conditions.append("tenure LIKE '%999%'")
        elif tenure == '99-year':
            conditions.append("tenure LIKE '%99%' AND tenure NOT LIKE '%999%'")

    if date_from:
        conditions.append("transaction_date >= :date_from")
        params["date_from"] = date_from

    if date_to:
        conditions.append("transaction_date <= :date_to")
        params["date_to"] = date_to

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
        HAVING COUNT(*) >= {MIN_TRADES_PER_BUCKET}
        ORDER BY month
    """)

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
    1. District + Segment + Tenure
    2. District only
    3. Segment only

    Returns:
        Tuple of (bands, data_source, proxy_label)
    """
    # Try 1: District + Segment + Tenure (if all available)
    if district and tenure and tenure != 'Unknown':
        bands = _compute_monthly_percentiles(
            district=district,
            tenure=tenure,
            date_from=date_from,
            date_to=date_to
        )
        if _is_fallback_valid(bands):
            tenure_short = tenure.replace('-year', 'yr') if '-year' in tenure else tenure
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
    """Check if fallback bands meet minimum thresholds."""
    total_trades = sum(b.get('count', 0) for b in bands if b.get('count'))
    months_with_data = len([b for b in bands if b.get('p25') is not None])

    # More relaxed thresholds for fallback
    return total_trades >= 10 and months_with_data >= 4


# =============================================================================
# SMOOTHING
# =============================================================================

def _apply_rolling_median_smoothing(
    bands: List[Dict],
    window: int = 3
) -> List[Dict]:
    """
    Apply rolling median smoothing to percentile series.

    Adds p25_s, p50_s, p75_s (smoothed values) to each band.
    Preserves gaps (null values stay null).
    """
    if not bands:
        return bands

    n = len(bands)

    # Extract series
    p25_vals = [b.get('p25') for b in bands]
    p50_vals = [b.get('p50') for b in bands]
    p75_vals = [b.get('p75') for b in bands]

    # Apply rolling median to each series
    p25_smooth = _rolling_median(p25_vals, window)
    p50_smooth = _rolling_median(p50_vals, window)
    p75_smooth = _rolling_median(p75_vals, window)

    # Add smoothed values to bands
    result = []
    for i, band in enumerate(bands):
        smoothed = {**band}
        smoothed['p25_s'] = round(p25_smooth[i], 0) if p25_smooth[i] is not None else None
        smoothed['p50_s'] = round(p50_smooth[i], 0) if p50_smooth[i] is not None else None
        smoothed['p75_s'] = round(p75_smooth[i], 0) if p75_smooth[i] is not None else None
        result.append(smoothed)

    return result


def _rolling_median(values: List[Optional[float]], window: int) -> List[Optional[float]]:
    """
    Compute rolling median, handling None values.

    Uses centered window where possible, otherwise asymmetric.
    """
    n = len(values)
    result = []
    half = window // 2

    for i in range(n):
        # Collect window values (excluding None)
        window_vals = []
        for j in range(max(0, i - half), min(n, i + half + 1)):
            if values[j] is not None:
                window_vals.append(values[j])

        if window_vals:
            result.append(median(window_vals))
        else:
            result.append(None)

    return result


# =============================================================================
# LATEST VALUES
# =============================================================================

def _get_latest_values(bands: List[Dict]) -> Optional[Dict]:
    """Get the most recent non-null smoothed values."""
    for band in reversed(bands):
        if band.get('p25_s') is not None:
            return {
                "month": band['month'],
                "p25_s": band['p25_s'],
                "p50_s": band['p50_s'],
                "p75_s": band['p75_s']
            }
    return None


# =============================================================================
# TREND CALCULATION
# =============================================================================

def _compute_floor_trend(
    bands: List[Dict],
    lookback_months: int = 6
) -> Dict[str, Any]:
    """
    Compute floor (P25) trend over the last N months.

    Returns direction (rising/flat/weakening) and slope percentage.
    """
    if not bands or len(bands) < 2:
        return {
            "floor_direction": "unknown",
            "floor_slope_pct": None,
            "observation_months": 0
        }

    # Get P25 values for last N months (using smoothed values)
    recent_bands = bands[-lookback_months:] if len(bands) >= lookback_months else bands
    p25_values = [b.get('p25_s') for b in recent_bands if b.get('p25_s') is not None]

    if len(p25_values) < 2:
        return {
            "floor_direction": "unknown",
            "floor_slope_pct": None,
            "observation_months": len(p25_values)
        }

    # Calculate slope as percentage change
    first_val = p25_values[0]
    last_val = p25_values[-1]

    if first_val == 0:
        slope_pct = 0
    else:
        slope_pct = ((last_val - first_val) / first_val) * 100

    # Classify direction
    if slope_pct >= TREND_RISING_THRESHOLD * 100:
        direction = "rising"
    elif slope_pct <= TREND_WEAKENING_THRESHOLD * 100:
        direction = "weakening"
    else:
        direction = "flat"

    return {
        "floor_direction": direction,
        "floor_slope_pct": round(slope_pct, 2),
        "observation_months": len(p25_values)
    }


# =============================================================================
# VERDICT COMPUTATION
# =============================================================================

def _compute_verdict(
    unit_psf: float,
    latest: Dict,
    trend: Dict
) -> Dict[str, Any]:
    """
    Compute verdict badge based on unit position and floor trend.

    Verdict Logic:
    - Protected (green): unit >= P25 AND floor rising/flat
    - Watch (yellow): unit near floor (P25-P50) OR floor weakening
    - Exposed (red): unit < P25 OR (premium zone AND floor weakening)
    """
    p25 = latest['p25_s']
    p50 = latest['p50_s']
    p75 = latest['p75_s']
    floor_direction = trend.get('floor_direction', 'unknown')

    # Determine position
    if unit_psf < p25:
        position = "below_floor"
        position_label = "Below Floor"
        vs_floor_pct = round(((unit_psf - p25) / p25) * 100, 1)
    elif unit_psf < p50:
        position = "near_floor"
        position_label = "Near Floor"
        vs_floor_pct = round(((unit_psf - p25) / p25) * 100, 1)
    elif unit_psf < p75:
        position = "above_median"
        position_label = "Above Median"
        vs_floor_pct = round(((unit_psf - p25) / p25) * 100, 1)
    else:
        position = "premium_zone"
        position_label = "Premium Zone"
        vs_floor_pct = round(((unit_psf - p25) / p25) * 100, 1)

    # Determine badge
    if position == "below_floor":
        badge = "exposed"
        badge_label = "Exposed"
        explanation = f"Unit PSF is {abs(vs_floor_pct):.1f}% below the historical floor (P25)."
    elif position == "near_floor":
        badge = "watch"
        badge_label = "Watch Zone"
        if floor_direction == "weakening":
            explanation = f"Unit is near the floor with a weakening trend. Monitor closely."
        else:
            explanation = f"Unit is {vs_floor_pct:.1f}% above floor but in the lower half of the range."
    elif position == "premium_zone" and floor_direction == "weakening":
        badge = "watch"
        badge_label = "Watch Zone"
        explanation = f"Unit is in premium zone but floor trend is weakening."
    elif floor_direction == "weakening" and position != "premium_zone":
        badge = "watch"
        badge_label = "Watch Zone"
        explanation = f"Floor trend is weakening. Unit is {vs_floor_pct:.1f}% above floor."
    else:
        badge = "protected"
        badge_label = "Protected"
        if floor_direction == "rising":
            explanation = f"Unit is {vs_floor_pct:.1f}% above a rising floor."
        else:
            explanation = f"Unit is {vs_floor_pct:.1f}% above a stable floor."

    return {
        "unit_psf": unit_psf,
        "position": position,
        "position_label": position_label,
        "vs_floor_pct": vs_floor_pct,
        "badge": badge,
        "badge_label": badge_label,
        "explanation": explanation
    }


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
            "floor_direction": "unknown",
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
