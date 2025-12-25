"""
Price Bands Computation - Pure Functions for Testing

Extracted from price_bands_service.py for testability.
All functions are pure (no I/O, no database access).

Usage:
    from services.price_bands_compute import (
        rolling_median,
        compute_floor_trend,
        compute_verdict,
        apply_rolling_median_smoothing,
    )
"""

from statistics import median
from typing import Dict, Any, List, Optional


# =============================================================================
# CONFIGURATION (duplicated from service for independence)
# =============================================================================

# Trend calculation thresholds (as decimal, e.g., 0.015 = 1.5%)
TREND_RISING_THRESHOLD = 0.015      # +1.5%
TREND_WEAKENING_THRESHOLD = -0.015  # -1.5%


# =============================================================================
# ENUMS FOR VERDICT COMPUTATION
# =============================================================================

class FloorDirection:
    """Floor trend direction values."""
    RISING = 'rising'
    FLAT = 'flat'
    WEAKENING = 'weakening'
    UNKNOWN = 'unknown'

    ALL = [RISING, FLAT, WEAKENING, UNKNOWN]


class PricePosition:
    """Unit price position relative to percentile bands."""
    BELOW_FLOOR = 'below_floor'
    NEAR_FLOOR = 'near_floor'
    ABOVE_MEDIAN = 'above_median'
    PREMIUM_ZONE = 'premium_zone'

    ALL = [BELOW_FLOOR, NEAR_FLOOR, ABOVE_MEDIAN, PREMIUM_ZONE]

    LABELS = {
        BELOW_FLOOR: 'Below Floor',
        NEAR_FLOOR: 'Near Floor',
        ABOVE_MEDIAN: 'Above Median',
        PREMIUM_ZONE: 'Premium Zone',
    }


class VerdictBadge:
    """Verdict badge values for downside protection assessment."""
    PROTECTED = 'protected'
    WATCH = 'watch'
    EXPOSED = 'exposed'

    ALL = [PROTECTED, WATCH, EXPOSED]

    LABELS = {
        PROTECTED: 'Protected',
        WATCH: 'Watch Zone',
        EXPOSED: 'Exposed',
    }


# =============================================================================
# ROLLING MEDIAN SMOOTHING
# =============================================================================

def rolling_median(values: List[Optional[float]], window: int = 3) -> List[Optional[float]]:
    """
    Compute rolling median, handling None values.

    Uses centered window where possible, otherwise asymmetric at boundaries.
    None values are excluded from the median calculation but preserve their position.

    Args:
        values: List of numeric values, may contain None
        window: Window size (default 3, should be odd for centered)

    Returns:
        List of smoothed values, same length as input

    Example:
        >>> rolling_median([100, 110, 105, 120, 115], window=3)
        [105.0, 105.0, 110.0, 115.0, 117.5]
    """
    if not values:
        return []

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


def apply_rolling_median_smoothing(
    bands: List[Dict[str, Any]],
    window: int = 3
) -> List[Dict[str, Any]]:
    """
    Apply rolling median smoothing to percentile series.

    Adds p25_s, p50_s, p75_s (smoothed values) to each band.
    Preserves gaps (null values stay null).

    Args:
        bands: List of band dicts with 'p25', 'p50', 'p75' keys
        window: Smoothing window size (default 3)

    Returns:
        New list of band dicts with added smoothed values
    """
    if not bands:
        return bands

    # Extract series
    p25_vals = [b.get('p25') for b in bands]
    p50_vals = [b.get('p50') for b in bands]
    p75_vals = [b.get('p75') for b in bands]

    # Apply rolling median to each series
    p25_smooth = rolling_median(p25_vals, window)
    p50_smooth = rolling_median(p50_vals, window)
    p75_smooth = rolling_median(p75_vals, window)

    # Add smoothed values to bands
    result = []
    for i, band in enumerate(bands):
        smoothed = {**band}
        smoothed['p25_s'] = round(p25_smooth[i], 0) if p25_smooth[i] is not None else None
        smoothed['p50_s'] = round(p50_smooth[i], 0) if p50_smooth[i] is not None else None
        smoothed['p75_s'] = round(p75_smooth[i], 0) if p75_smooth[i] is not None else None
        result.append(smoothed)

    return result


# =============================================================================
# LATEST VALUES EXTRACTION
# =============================================================================

def get_latest_values(bands: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """
    Get the most recent non-null smoothed values from bands.

    Args:
        bands: List of band dicts with smoothed values

    Returns:
        Dict with month and p25_s, p50_s, p75_s, or None if no valid data
    """
    for band in reversed(bands):
        if band.get('p25_s') is not None:
            return {
                'month': band['month'],
                'p25_s': band['p25_s'],
                'p50_s': band['p50_s'],
                'p75_s': band['p75_s']
            }
    return None


# =============================================================================
# FLOOR TREND CALCULATION
# =============================================================================

def compute_floor_trend(
    bands: List[Dict[str, Any]],
    lookback_months: int = 6,
    rising_threshold: float = TREND_RISING_THRESHOLD,
    weakening_threshold: float = TREND_WEAKENING_THRESHOLD
) -> Dict[str, Any]:
    """
    Compute floor (P25) trend over the last N months.

    Calculates the percentage change in P25 (smoothed) values and classifies
    the direction as rising, flat, or weakening.

    Args:
        bands: List of band dicts with 'p25_s' smoothed values
        lookback_months: Number of months to analyze (default 6)
        rising_threshold: Minimum slope for "rising" classification (default 0.015 = 1.5%)
        weakening_threshold: Maximum slope for "weakening" classification (default -0.015 = -1.5%)

    Returns:
        Dict with:
            - floor_direction: 'rising', 'flat', 'weakening', or 'unknown'
            - floor_slope_pct: Percentage change (e.g., 2.5 means +2.5%)
            - observation_months: Number of valid data points used
    """
    if not bands or len(bands) < 2:
        return {
            'floor_direction': FloorDirection.UNKNOWN,
            'floor_slope_pct': None,
            'observation_months': 0
        }

    # Get P25 values for last N months (using smoothed values)
    recent_bands = bands[-lookback_months:] if len(bands) >= lookback_months else bands
    p25_values = [b.get('p25_s') for b in recent_bands if b.get('p25_s') is not None]

    if len(p25_values) < 2:
        return {
            'floor_direction': FloorDirection.UNKNOWN,
            'floor_slope_pct': None,
            'observation_months': len(p25_values)
        }

    # Calculate slope as percentage change
    first_val = p25_values[0]
    last_val = p25_values[-1]

    if first_val == 0:
        slope_pct = 0.0
    else:
        slope_pct = ((last_val - first_val) / first_val) * 100

    # Classify direction
    # Note: thresholds are in decimal form (0.015), slope_pct is in percentage form (1.5)
    # So we multiply threshold by 100 for comparison
    if slope_pct >= rising_threshold * 100:
        direction = FloorDirection.RISING
    elif slope_pct <= weakening_threshold * 100:
        direction = FloorDirection.WEAKENING
    else:
        direction = FloorDirection.FLAT

    return {
        'floor_direction': direction,
        'floor_slope_pct': round(slope_pct, 2),
        'observation_months': len(p25_values)
    }


# =============================================================================
# VERDICT COMPUTATION
# =============================================================================

def classify_price_position(
    unit_psf: float,
    p25: float,
    p50: float,
    p75: float
) -> tuple:
    """
    Classify unit price position relative to percentile bands.

    Args:
        unit_psf: User's unit price per square foot
        p25: 25th percentile (floor)
        p50: 50th percentile (median)
        p75: 75th percentile

    Returns:
        Tuple of (position, position_label, vs_floor_pct)
    """
    vs_floor_pct = round(((unit_psf - p25) / p25) * 100, 1)

    if unit_psf < p25:
        position = PricePosition.BELOW_FLOOR
    elif unit_psf < p50:
        position = PricePosition.NEAR_FLOOR
    elif unit_psf < p75:
        position = PricePosition.ABOVE_MEDIAN
    else:
        position = PricePosition.PREMIUM_ZONE

    position_label = PricePosition.LABELS[position]
    return position, position_label, vs_floor_pct


def compute_verdict(
    unit_psf: float,
    latest: Dict[str, Any],
    trend: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Compute verdict badge based on unit position and floor trend.

    Verdict Logic:
    - Protected (green): unit >= P25 AND floor rising/flat
    - Watch (yellow): unit near floor (P25-P50) OR floor weakening
    - Exposed (red): unit < P25 OR (premium zone AND floor weakening)

    Args:
        unit_psf: User's unit PSF for comparison
        latest: Dict with p25_s, p50_s, p75_s from get_latest_values()
        trend: Dict with floor_direction from compute_floor_trend()

    Returns:
        Dict with verdict details:
            - unit_psf: Input PSF
            - position: Position enum value
            - position_label: Human-readable position
            - vs_floor_pct: Percentage above/below floor
            - badge: Verdict badge enum value
            - badge_label: Human-readable badge
            - explanation: Text explanation
    """
    p25 = latest['p25_s']
    p50 = latest['p50_s']
    p75 = latest['p75_s']
    floor_direction = trend.get('floor_direction', FloorDirection.UNKNOWN)

    # Classify position
    position, position_label, vs_floor_pct = classify_price_position(
        unit_psf, p25, p50, p75
    )

    # Determine badge and explanation
    if position == PricePosition.BELOW_FLOOR:
        badge = VerdictBadge.EXPOSED
        badge_label = VerdictBadge.LABELS[badge]
        explanation = f"Unit PSF is {abs(vs_floor_pct):.1f}% below the historical floor (P25)."

    elif position == PricePosition.NEAR_FLOOR:
        badge = VerdictBadge.WATCH
        badge_label = VerdictBadge.LABELS[badge]
        if floor_direction == FloorDirection.WEAKENING:
            explanation = f"Unit is near the floor with a weakening trend. Monitor closely."
        else:
            explanation = f"Unit is {vs_floor_pct:.1f}% above floor but in the lower half of the range."

    elif position == PricePosition.PREMIUM_ZONE and floor_direction == FloorDirection.WEAKENING:
        badge = VerdictBadge.WATCH
        badge_label = VerdictBadge.LABELS[badge]
        explanation = f"Unit is in premium zone but floor trend is weakening."

    elif floor_direction == FloorDirection.WEAKENING and position != PricePosition.PREMIUM_ZONE:
        badge = VerdictBadge.WATCH
        badge_label = VerdictBadge.LABELS[badge]
        explanation = f"Floor trend is weakening. Unit is {vs_floor_pct:.1f}% above floor."

    else:
        badge = VerdictBadge.PROTECTED
        badge_label = VerdictBadge.LABELS[badge]
        if floor_direction == FloorDirection.RISING:
            explanation = f"Unit is {vs_floor_pct:.1f}% above a rising floor."
        else:
            explanation = f"Unit is {vs_floor_pct:.1f}% above a stable floor."

    return {
        'unit_psf': unit_psf,
        'position': position,
        'position_label': position_label,
        'vs_floor_pct': vs_floor_pct,
        'badge': badge,
        'badge_label': badge_label,
        'explanation': explanation
    }
