"""
KPI: Market Momentum (Volatility-Normalized, Resale-Based)

Best-practice financial momentum indicator for real estate.

Methodology:
1. PSF Change: Resale Q-o-Q median PSF % (rolling 3-month quarters)
2. Volatility: Stddev of Q-o-Q changes over last 12 quarters
3. z-score: PSF_change / volatility
4. Score: clamp(50 - z×10, 30, 70)

CRITICAL: Uses month boundaries because URA data is month-level.
All transactions within a month are dated to the 1st of that month.

PERFORMANCE OPTIMIZATION:
Fallback data (6-month windows) is fetched ONLY when primary confidence is "low".
This reduces PERCENTILE_CONT calls from 10 to 4 in the common case (high/medium confidence).

Confidence Levels (based on resale deals per quarter):
- High: ≥20 deals per quarter consistently
- Medium: 10-19 deals
- Low: <10 deals (triggers fallback to 6-month windows)

Score Interpretation:
- Score > 55: Buyer advantage (prices falling unusually fast)
- Score 45-55: Balanced market (normal movement)
- Score < 45: Seller advantage (prices rising unusually fast)

This does NOT mean cheap or expensive - only momentum relative to historical norms.
"""

from datetime import date
from typing import Dict, Any, Optional, Tuple
from sqlalchemy import text
from constants import SALE_TYPE_RESALE
from models.database import db
from services.kpi.base import (
    KPIResult, _months_back
)
from utils.filter_builder import build_sql_where

# Confidence thresholds (deals per quarter)
HIGH_CONFIDENCE_MIN = 20
MEDIUM_CONFIDENCE_MIN = 10

# Minimum quarters of volatility data needed
MIN_VOLATILITY_QUARTERS = 4


def build_params(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Build params for market momentum query with quarterly windows.

    CRITICAL: Uses MONTH boundaries because URA data is month-level.
    All transactions within a month are dated to the 1st of that month.

    RULE: Only use COMPLETE months. If today is in month M, latest complete = M-1.
    Example (Dec 27): Current = Sep,Oct,Nov | Previous = Jun,Jul,Aug
    """
    max_date = filters.get('max_date')
    if max_date is None:
        max_date = date.today()

    # max_exclusive is 1st of CURRENT month (excludes incomplete current month)
    max_exclusive = date(max_date.year, max_date.month, 1)

    # Current quarter: last 3 months (Q0)
    # Previous quarter: 3-6 months ago (Q1)
    # Older quarter: 6-9 months ago (Q2) - needed to calculate previous momentum
    current_start = _months_back(max_exclusive, 3)
    prev_start = _months_back(max_exclusive, 6)
    older_start = _months_back(max_exclusive, 9)

    params = {
        'current_start': current_start,
        'current_end': max_exclusive,  # Exclusive
        'prev_start': prev_start,
        'prev_end': current_start,  # Exclusive (ends where current starts)
        'older_start': older_start,
        'older_end': prev_start,  # Exclusive (ends where prev starts)
        # For volatility: 12 quarters back (3 years = 36 months)
        'volatility_start': _months_back(max_exclusive, 36),
        'max_date': max_date,
    }

    filter_parts, filter_params = build_sql_where(filters)
    params.update(filter_params)
    params['_filter_parts'] = filter_parts
    # Store for fallback query
    params['_max_exclusive'] = max_exclusive
    params['_base_filters'] = filters.copy()

    return params


def get_sql(params: Dict[str, Any]) -> str:
    """
    Build SQL that computes:
    1. Current quarter median PSF (resale only) - Q0
    2. Previous quarter median PSF (resale only) - Q1
    3. Older quarter median PSF (resale only) - Q2 (for previous momentum)
    4. Quarterly median PSF over last 12 quarters for volatility

    PERFORMANCE: Fallback CTEs removed - computed lazily only when needed.
    This reduces PERCENTILE_CONT from 10 to 4 in high/medium confidence cases.
    """
    filter_parts = params.pop('_filter_parts', [])
    # Remove internal params not used in SQL
    params.pop('_max_exclusive', None)
    params.pop('_base_filters', None)

    base_filter = " AND ".join(filter_parts) if filter_parts else "1=1"

    resale_filter = f"sale_type = '{SALE_TYPE_RESALE}'"

    return f"""
        WITH current_quarter AS (
            SELECT
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :current_start
              AND transaction_date < :current_end
        ),
        previous_quarter AS (
            SELECT
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :prev_start
              AND transaction_date < :prev_end
        ),
        older_quarter AS (
            SELECT
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :older_start
              AND transaction_date < :older_end
        ),
        quarterly_psf AS (
            SELECT
                DATE_TRUNC('quarter', transaction_date) as quarter,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :volatility_start
              AND transaction_date < :current_end
            GROUP BY DATE_TRUNC('quarter', transaction_date)
            HAVING COUNT(*) >= 5
        ),
        quarterly_changes AS (
            SELECT
                quarter,
                median_psf,
                txn_count,
                LAG(median_psf) OVER (ORDER BY quarter) as prev_quarter_psf,
                CASE
                    WHEN LAG(median_psf) OVER (ORDER BY quarter) > 0
                    THEN ((median_psf - LAG(median_psf) OVER (ORDER BY quarter))
                          / LAG(median_psf) OVER (ORDER BY quarter)) * 100
                    ELSE NULL
                END as pct_change
            FROM quarterly_psf
        ),
        volatility AS (
            SELECT
                STDDEV(pct_change) as quarterly_stddev,
                COUNT(pct_change) as quarters_count,
                AVG(txn_count) as avg_deals_per_quarter,
                MIN(txn_count) as min_deals_per_quarter
            FROM quarterly_changes
            WHERE pct_change IS NOT NULL
        )
        SELECT
            c.median_psf as current_psf,
            c.txn_count as current_count,
            p.median_psf as prev_psf,
            p.txn_count as prev_count,
            o.median_psf as older_psf,
            o.txn_count as older_count,
            v.quarterly_stddev as volatility,
            v.quarters_count as volatility_quarters,
            v.avg_deals_per_quarter,
            v.min_deals_per_quarter
        FROM current_quarter c
        CROSS JOIN previous_quarter p
        CROSS JOIN older_quarter o
        CROSS JOIN volatility v
    """


def _fetch_fallback_data(filters: Dict[str, Any], max_exclusive: date) -> Tuple[Optional[float], int, Optional[float], int]:
    """
    Fetch 6-month fallback data ONLY when primary confidence is low.

    This is called lazily from map_result to avoid expensive PERCENTILE_CONT
    calls when not needed.

    Returns:
        (fallback_current_psf, fallback_current_count, fallback_prev_psf, fallback_prev_count)
    """
    # Build filter clause
    filter_parts, filter_params = build_sql_where(filters)
    base_filter = " AND ".join(filter_parts) if filter_parts else "1=1"

    resale_filter = f"sale_type = '{SALE_TYPE_RESALE}'"

    # 6-month windows
    fallback_current_start = _months_back(max_exclusive, 6)
    fallback_prev_start = _months_back(max_exclusive, 12)
    fallback_prev_end = _months_back(max_exclusive, 6)

    sql = f"""
        WITH fallback_current AS (
            SELECT
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :fallback_current_start
              AND transaction_date < :current_end
        ),
        fallback_previous AS (
            SELECT
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :fallback_prev_start
              AND transaction_date < :fallback_prev_end
        )
        SELECT
            fc.median_psf as fallback_current_psf,
            fc.txn_count as fallback_current_count,
            fp.median_psf as fallback_prev_psf,
            fp.txn_count as fallback_prev_count
        FROM fallback_current fc
        CROSS JOIN fallback_previous fp
    """

    params = {
        'fallback_current_start': fallback_current_start,
        'current_end': max_exclusive,
        'fallback_prev_start': fallback_prev_start,
        'fallback_prev_end': fallback_prev_end,
        **filter_params
    }

    result = db.session.execute(text(sql), params).fetchone()

    if result:
        return (
            float(result.fallback_current_psf) if result.fallback_current_psf else None,
            int(result.fallback_current_count or 0),
            float(result.fallback_prev_psf) if result.fallback_prev_psf else None,
            int(result.fallback_prev_count or 0)
        )
    return None, 0, None, 0


def _determine_confidence(
    current_count: int,
    prev_count: int,
    min_deals_per_quarter: Optional[float]
) -> str:
    """
    Determine confidence level based on deal counts.

    High: ≥20 deals per quarter consistently
    Medium: 10-19 deals
    Low: <10 deals
    """
    min_count = min(current_count, prev_count)

    # Also check historical consistency if available
    if min_deals_per_quarter is not None:
        min_count = min(min_count, int(min_deals_per_quarter))

    if min_count >= HIGH_CONFIDENCE_MIN:
        return "high"
    elif min_count >= MEDIUM_CONFIDENCE_MIN:
        return "medium"
    else:
        return "low"


def _compute_momentum_score(psf_current: float, psf_prev: float, volatility: float, volatility_quarters: int) -> float:
    """
    Compute momentum score from PSF values.

    Formula:
    1. psf_change = (current - prev) / prev × 100
    2. z = psf_change / volatility
    3. score = clamp(50 - z × 10, 30, 70)
    """
    if not psf_current or not psf_prev or psf_prev <= 0:
        return 50  # Default neutral

    psf_change = ((psf_current - psf_prev) / psf_prev) * 100

    if volatility and volatility > 0 and volatility_quarters >= MIN_VOLATILITY_QUARTERS:
        z_score_raw = psf_change / volatility
        z_score = max(-3, min(z_score_raw, 3))
        score = 50 - (z_score * 10)
    else:
        score = 50 - (psf_change * 3)

    return max(30, min(70, score))


def map_result(row: Any, filters: Dict[str, Any]) -> KPIResult:
    """
    Map query result to KPIResult using volatility-normalized momentum.

    PERFORMANCE: Fallback data is fetched ONLY when confidence is "low".
    This avoids 2 additional PERCENTILE_CONT calls in the common case.

    Formula:
    1. psf_change = (current - prev) / prev × 100
    2. z = psf_change / volatility
    3. score = clamp(50 - z × 10, 30, 70)

    Also calculates previous quarter's momentum score for Q-o-Q comparison.
    """
    default_score = 50  # Neutral/balanced

    if not row:
        return KPIResult(
            kpi_id="market_momentum",
            title="Market Momentum",
            value=default_score,
            formatted_value=str(default_score),
            subtitle="volatility-adjusted",
            trend={"value": default_score, "direction": "neutral", "label": "Balanced"},
            insight="Insufficient data"
        )

    # Extract primary (90-day quarter) data
    current_psf = float(row.current_psf) if row.current_psf else None
    prev_psf = float(row.prev_psf) if row.prev_psf else None
    older_psf = float(row.older_psf) if row.older_psf else None
    current_count = int(row.current_count or 0)
    prev_count = int(row.prev_count or 0)
    older_count = int(row.older_count or 0)

    # Extract volatility data
    volatility = float(row.volatility) if row.volatility else None
    volatility_quarters = int(row.volatility_quarters or 0)
    avg_deals = float(row.avg_deals_per_quarter) if row.avg_deals_per_quarter else None
    min_deals = float(row.min_deals_per_quarter) if row.min_deals_per_quarter else None

    # Determine confidence level
    confidence = _determine_confidence(current_count, prev_count, min_deals)

    # LAZY FALLBACK: Only fetch 6-month data if confidence is "low"
    use_fallback = False
    if confidence == "low":
        # Get max_exclusive from filters (stored during build_params)
        max_date = filters.get('max_date') or date.today()
        max_exclusive = date(max_date.year, max_date.month, 1)

        # Fetch fallback data (2 additional PERCENTILE_CONT calls)
        fallback_current_psf, fallback_current_count, fallback_prev_psf, fallback_prev_count = \
            _fetch_fallback_data(filters, max_exclusive)

        # Use fallback if it provides better confidence
        if fallback_current_psf and fallback_prev_psf:
            if fallback_current_count >= MEDIUM_CONFIDENCE_MIN and fallback_prev_count >= MEDIUM_CONFIDENCE_MIN:
                current_psf = fallback_current_psf
                prev_psf = fallback_prev_psf
                current_count = fallback_current_count
                prev_count = fallback_prev_count
                confidence = _determine_confidence(current_count, prev_count, None)
                use_fallback = True

    # Check if we have enough data
    if not current_psf or not prev_psf or prev_psf <= 0:
        return KPIResult(
            kpi_id="market_momentum",
            title="Market Momentum",
            value=default_score,
            formatted_value=str(default_score),
            subtitle="volatility-adjusted",
            trend={"value": default_score, "direction": "neutral", "label": "Balanced"},
            insight="Insufficient data"
        )

    # Compute current momentum score (Q0 vs Q1)
    score = _compute_momentum_score(current_psf, prev_psf, volatility, volatility_quarters)

    # Compute previous momentum score (Q1 vs Q2) for comparison
    prev_score = None
    score_change = None
    if older_psf and older_psf > 0 and prev_psf:
        prev_score = _compute_momentum_score(prev_psf, older_psf, volatility, volatility_quarters)
        if prev_score:
            score_change = ((score - prev_score) / prev_score) * 100

    # Determine market condition (based on score value)
    if score > 55:
        label = "Buyer advantage"
        condition_direction = "up"
    elif score < 45:
        label = "Seller advantage"
        condition_direction = "down"
    else:
        label = "Balanced"
        condition_direction = "neutral"

    # Determine change direction (based on score change)
    if score_change is not None:
        if score_change > 0.5:
            change_direction = "up"
        elif score_change < -0.5:
            change_direction = "down"
        else:
            change_direction = "neutral"
    else:
        change_direction = "neutral"

    # Format value with Q-o-Q change if available
    if score_change is not None:
        change_str = f"+{round(score_change, 1)}%" if score_change >= 0 else f"{round(score_change, 1)}%"
        formatted_value = f"{round(score)} ({change_str} Q-o-Q)"
    else:
        formatted_value = str(round(score))

    # Build insight text - show mathematical formula (2 rows)
    insight = "Score = clamp(50 - z × 10, 30, 70)\nz = Q-o-Q PSF Growth % / Q-o-Q StdDev"

    return KPIResult(
        kpi_id="market_momentum",
        title="Market Momentum",
        value=round(score),
        formatted_value=formatted_value,
        subtitle="volatility-adjusted",
        trend={
            "value": round(score),
            "direction": condition_direction,
            "label": label
        },
        insight=insight,
        meta={
            "current_score": round(score),
            "prev_score": round(prev_score) if prev_score else None,
            "score_change_pct": round(score_change, 1) if score_change is not None else None,
            "change_direction": change_direction,  # For arrow (based on score change)
            "condition_direction": condition_direction,  # For market condition
            "label": label,
            "volatility": round(volatility, 2) if volatility else None,
            "volatility_quarters": volatility_quarters,
            "current_count": current_count,
            "prev_count": prev_count,
            "older_count": older_count,
            "confidence": confidence,
            "used_fallback": use_fallback,
            "sale_type": "resale",
            "description": (
                "Shows whether recent resale price movements favor buyers or sellers.\n\n"
                "Market Momentum\n"
                "• 60–70: Buyer advantage\n"
                "• 45–55: Balanced\n"
                "• 30–40: Seller advantage\n\n"
                "Based on Q-o-Q Resale Median PSF % growth, adjusted for market volatility. "
                "This does not indicate whether housing prices are cheap or expensive, "
                "it is a reflection of pricing pressure and direction."
            )
        }
    )


class MarketMomentumSpec:
    kpi_id = "market_momentum"
    title = "Market Momentum"
    subtitle = "volatility-adjusted"

    @staticmethod
    def build_params(filters):
        return build_params(filters)

    @staticmethod
    def get_sql(params):
        return get_sql(params)

    @staticmethod
    def map_result(row, filters):
        return map_result(row, filters)


SPEC = MarketMomentumSpec()
