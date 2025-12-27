"""
KPI: Market Momentum (Volatility-Normalized, Resale-Based)

Best-practice financial momentum indicator for real estate.

Methodology:
1. PSF Change: Resale Q-o-Q median PSF % (rolling 90-day quarters)
2. Volatility: Stddev of Q-o-Q changes over last 12 quarters
3. z-score: PSF_change / volatility
4. Score: clamp(50 - z×10, 30, 70)

Confidence Levels (based on resale deals per quarter):
- High: ≥20 deals per quarter consistently
- Medium: 10-19 deals
- Low: <10 deals (fallback to rolling 180D window)

Score Interpretation:
- Score > 55: Buyer advantage (prices falling unusually fast)
- Score 45-55: Balanced market (normal movement)
- Score < 45: Seller advantage (prices rising unusually fast)

This does NOT mean cheap or expensive - only momentum relative to historical norms.
"""

from datetime import timedelta, date
from typing import Dict, Any, Optional
from db.sql import OUTLIER_FILTER
from constants import SALE_TYPE_RESALE
from services.kpi.base import (
    KPIResult, build_filter_clause
)

# Confidence thresholds (deals per quarter)
HIGH_CONFIDENCE_MIN = 20
MEDIUM_CONFIDENCE_MIN = 10

# Minimum quarters of volatility data needed
MIN_VOLATILITY_QUARTERS = 4


def build_params(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Build params for market momentum query with quarterly windows."""
    max_date = filters.get('max_date')
    if max_date is None:
        max_date = date.today()

    # Current quarter: last 90 days
    # Previous quarter: 90-180 days ago
    params = {
        'current_start': max_date - timedelta(days=90),
        'current_end': max_date + timedelta(days=1),  # Exclusive
        'prev_start': max_date - timedelta(days=180),
        'prev_end': max_date - timedelta(days=90) + timedelta(days=1),  # Exclusive
        # For volatility: 12 quarters back (3 years)
        'volatility_start': max_date - timedelta(days=365 * 3),
        'max_date': max_date,
    }

    # Fallback for low-confidence: 180-day windows
    params['fallback_current_start'] = max_date - timedelta(days=180)
    params['fallback_prev_start'] = max_date - timedelta(days=360)
    params['fallback_prev_end'] = max_date - timedelta(days=180) + timedelta(days=1)

    filter_parts, filter_params = build_filter_clause(filters)
    params.update(filter_params)
    params['_filter_parts'] = filter_parts

    return params


def get_sql(params: Dict[str, Any]) -> str:
    """
    Build SQL that computes:
    1. Current quarter median PSF (resale only)
    2. Previous quarter median PSF (resale only)
    3. Quarterly median PSF over last 12 quarters for volatility
    4. Fallback 180-day windows for low-confidence scenarios
    """
    filter_parts = params.pop('_filter_parts', [])
    base_filter = OUTLIER_FILTER
    if filter_parts:
        base_filter += " AND " + " AND ".join(filter_parts)

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
        -- Fallback: 180-day windows for low-confidence
        fallback_current AS (
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
        ),
        -- Quarterly medians over last 12 quarters (3 years) for volatility
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
            HAVING COUNT(*) >= 5  -- Minimum 5 txns per quarter for reliable median
        ),
        -- Calculate quarter-over-quarter % changes
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
        -- Volatility = standard deviation of Q-o-Q % changes
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
            fc.median_psf as fallback_current_psf,
            fc.txn_count as fallback_current_count,
            fp.median_psf as fallback_prev_psf,
            fp.txn_count as fallback_prev_count,
            v.quarterly_stddev as volatility,
            v.quarters_count as volatility_quarters,
            v.avg_deals_per_quarter,
            v.min_deals_per_quarter
        FROM current_quarter c
        CROSS JOIN previous_quarter p
        CROSS JOIN fallback_current fc
        CROSS JOIN fallback_previous fp
        CROSS JOIN volatility v
    """


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


def map_result(row: Any, filters: Dict[str, Any]) -> KPIResult:
    """
    Map query result to KPIResult using volatility-normalized momentum.

    Formula:
    1. psf_change = (current - prev) / prev × 100
    2. z = psf_change / volatility
    3. score = clamp(50 - z × 10, 30, 70)
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
    current_count = int(row.current_count or 0)
    prev_count = int(row.prev_count or 0)

    # Extract fallback (180-day) data
    fallback_current_psf = float(row.fallback_current_psf) if row.fallback_current_psf else None
    fallback_prev_psf = float(row.fallback_prev_psf) if row.fallback_prev_psf else None
    fallback_current_count = int(row.fallback_current_count or 0)
    fallback_prev_count = int(row.fallback_prev_count or 0)

    # Extract volatility data
    volatility = float(row.volatility) if row.volatility else None
    volatility_quarters = int(row.volatility_quarters or 0)
    avg_deals = float(row.avg_deals_per_quarter) if row.avg_deals_per_quarter else None
    min_deals = float(row.min_deals_per_quarter) if row.min_deals_per_quarter else None

    # Determine confidence level
    confidence = _determine_confidence(current_count, prev_count, min_deals)

    # Use fallback if low confidence on primary data
    use_fallback = False
    if confidence == "low" and fallback_current_psf and fallback_prev_psf:
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

    # Step 1: Compute Q-o-Q PSF change
    psf_change = ((current_psf - prev_psf) / prev_psf) * 100

    # Step 2 & 3: Normalize by volatility and compute score
    z_score = None
    z_score_raw = None
    if volatility and volatility > 0 and volatility_quarters >= MIN_VOLATILITY_QUARTERS:
        z_score_raw = psf_change / volatility
        # Cap extreme z-scores to prevent weird data from blowing up the score
        z_score = max(-3, min(z_score_raw, 3))
        score = 50 - (z_score * 10)
        score = max(30, min(70, score))  # Clamp to 30-70
    else:
        # Fallback if not enough volatility data
        score = 50 - (psf_change * 3)
        score = max(30, min(70, score))

    # Determine market condition
    if score > 55:
        label = "Buyer advantage"
        direction = "up"
    elif score < 45:
        label = "Seller advantage"
        direction = "down"
    else:
        label = "Balanced"
        direction = "neutral"

    # Build insight text
    if z_score is not None:
        abs_z = abs(z_score)
        if abs_z < 0.5:
            move_desc = "normal"
        elif abs_z < 1.5:
            move_desc = "moderate"
        else:
            move_desc = "strong"

        window = "180D" if use_fallback else "Q-o-Q"
        insight = f"Resale {psf_change:+.1f}% {window} ({move_desc} move)"
    else:
        window = "180D" if use_fallback else "Q-o-Q"
        insight = f"Resale {psf_change:+.1f}% {window}"

    # Add confidence indicator
    if confidence != "high":
        insight += f" [{confidence} confidence]"

    return KPIResult(
        kpi_id="market_momentum",
        title="Market Momentum",
        value=round(score),
        formatted_value=str(round(score)),
        subtitle="volatility-adjusted",
        trend={
            "value": round(score),
            "direction": direction,
            "label": label
        },
        insight=insight,
        meta={
            "psf_change_pct": round(psf_change, 1),
            "z_score": round(z_score, 2) if z_score is not None else None,
            "volatility": round(volatility, 2) if volatility else None,
            "volatility_quarters": volatility_quarters,
            "current_count": current_count,
            "prev_count": prev_count,
            "confidence": confidence,
            "used_fallback": use_fallback,
            "sale_type": "resale",
            "description": (
                "Market Momentum measures whether recent price changes are "
                "stronger or weaker than normal.\n\n"
                "Score Range:\n"
                "60-70: Buyers have leverage\n"
                "~50: Stable/balanced market\n"
                "30-40: Sellers have leverage\n\n"
                "It reflects price movement, not whether homes are cheap or expensive."
            ),
            "formula": f"z={round(z_score, 2) if z_score is not None else '—'} → 50-(z×10)"
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
