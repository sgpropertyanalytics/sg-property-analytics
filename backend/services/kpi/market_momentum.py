"""
KPI: Market Momentum (Volatility-Normalized, Resale-Based)

A derived signal representing buyer vs seller leverage in the market.
This is NOT a valuation metric - it indicates momentum direction only.

Methodology:
1. Compute 90-day PSF change (Q-o-Q) using RESALE transactions only
2. Compute volatility = stddev of monthly PSF changes over last 12 months
3. Normalize: momentum = PSF_change / volatility (z-score)
4. Score = 50 - (normalized_momentum × 10), clamped to 30-70

Interpretation of normalized momentum:
- +1.0 = normal upward move (1 standard deviation)
- +2.0 = strong upward move (2 standard deviations)
- -2.0 = strong downward move (prices falling unusually fast)

Score interpretation:
- Score > 55: Buyer advantage (prices falling unusually fast)
- Score 45-55: Balanced market (normal movement)
- Score < 45: Seller advantage (prices rising unusually fast)

This does NOT mean cheap or expensive - only momentum relative to historical norms.
"""

from datetime import timedelta
from typing import Dict, Any
from db.sql import OUTLIER_FILTER
from constants import SALE_TYPE_RESALE
from services.kpi.base import (
    KPIResult, build_comparison_bounds, build_filter_clause
)

# Minimum sample size for reliable calculation
MIN_SAMPLE_SIZE = 20

# Minimum months of volatility data needed
MIN_VOLATILITY_MONTHS = 6


def build_params(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Build params for market momentum query with 90-day windows and 12-month volatility."""
    # 90-day comparison bounds for Q-o-Q PSF change
    params = build_comparison_bounds(
        max_date=filters.get('max_date'),
        period_days=90  # Rolling quarter
    )

    # Add 12-month lookback for volatility calculation
    max_date = filters.get('max_date')
    if max_date:
        params['volatility_start'] = max_date - timedelta(days=365)
    else:
        from datetime import date
        params['volatility_start'] = date.today() - timedelta(days=365)

    filter_parts, filter_params = build_filter_clause(filters)
    params.update(filter_params)
    params['_filter_parts'] = filter_parts

    return params


def get_sql(params: Dict[str, Any]) -> str:
    """
    Build SQL that computes:
    1. Current 90-day median PSF (resale only)
    2. Previous 90-day median PSF (resale only)
    3. Monthly median PSF over last 12 months for volatility (resale only)
    """
    filter_parts = params.pop('_filter_parts', [])
    base_filter = OUTLIER_FILTER
    if filter_parts:
        base_filter += " AND " + " AND ".join(filter_parts)

    # CRITICAL: Resale only - exclude new sale/developer sales
    resale_filter = f"sale_type = '{SALE_TYPE_RESALE}'"

    return f"""
        WITH current_period AS (
            SELECT
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :min_date
              AND transaction_date < :max_date_exclusive
        ),
        previous_period AS (
            SELECT
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                COUNT(*) as txn_count
            FROM transactions
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :prev_min_date
              AND transaction_date < :prev_max_date_exclusive
        ),
        -- Monthly medians over last 12 months for volatility calculation (resale only)
        monthly_psf AS (
            SELECT
                DATE_TRUNC('month', transaction_date) as month,
                PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
            FROM transactions
            WHERE {base_filter}
              AND {resale_filter}
              AND transaction_date >= :volatility_start
              AND transaction_date < :max_date_exclusive
            GROUP BY DATE_TRUNC('month', transaction_date)
            HAVING COUNT(*) >= 5  -- Minimum 5 txns per month for reliable median
        ),
        -- Calculate month-over-month % changes
        monthly_changes AS (
            SELECT
                month,
                median_psf,
                LAG(median_psf) OVER (ORDER BY month) as prev_month_psf,
                CASE
                    WHEN LAG(median_psf) OVER (ORDER BY month) > 0
                    THEN ((median_psf - LAG(median_psf) OVER (ORDER BY month))
                          / LAG(median_psf) OVER (ORDER BY month)) * 100
                    ELSE NULL
                END as pct_change
            FROM monthly_psf
        ),
        -- Volatility = standard deviation of monthly % changes
        volatility AS (
            SELECT
                STDDEV(pct_change) as monthly_stddev,
                COUNT(pct_change) as months_count
            FROM monthly_changes
            WHERE pct_change IS NOT NULL
        )
        SELECT
            c.median_psf as current_psf,
            c.txn_count as current_count,
            p.median_psf as prev_psf,
            p.txn_count as prev_count,
            v.monthly_stddev as volatility,
            v.months_count as volatility_months
        FROM current_period c
        CROSS JOIN previous_period p
        CROSS JOIN volatility v
    """


def map_result(row: Any, filters: Dict[str, Any]) -> KPIResult:
    """
    Map query result to KPIResult using volatility-normalized momentum.

    Formula:
    1. psf_change = (current - prev) / prev × 100
    2. normalized_momentum = psf_change / volatility (z-score)
    3. score = 50 - (normalized_momentum × 10), clamped to 30-70

    Interpretation of normalized_momentum:
    - +1.0 = normal upward move (1 standard deviation)
    - +2.0 = strong upward move (2 standard deviations)
    - -2.0 = strong downward move (prices falling unusually fast)
    """
    default_score = 50  # Neutral/balanced

    if not row or not row.current_psf:
        return KPIResult(
            kpi_id="market_momentum",
            title="Market Momentum",
            value=default_score,
            formatted_value=str(default_score),
            subtitle="volatility-adjusted",
            trend={"value": default_score, "direction": "neutral", "label": "Balanced"},
            insight="Insufficient data"
        )

    current = float(row.current_psf)
    prev = float(row.prev_psf) if row.prev_psf else None
    current_count = int(row.current_count or 0)
    prev_count = int(row.prev_count or 0)
    volatility = float(row.volatility) if row.volatility else None
    volatility_months = int(row.volatility_months or 0)

    # Check sample size
    low_confidence = current_count < MIN_SAMPLE_SIZE or prev_count < MIN_SAMPLE_SIZE

    # Calculate PSF change (90-day Q-o-Q)
    psf_change = None
    normalized_momentum = None
    score = default_score

    if prev and prev > 0 and prev_count > 0:
        # Step 1: Compute rolling PSF change
        psf_change = ((current - prev) / prev) * 100

        # Step 2 & 3: Normalize by volatility if we have enough data
        if volatility and volatility > 0 and volatility_months >= MIN_VOLATILITY_MONTHS:
            # Normalized momentum: how many std devs is this move?
            # +1.0 = normal move, +2.0 = strong move, -2.0 = strong reversal
            normalized_momentum = psf_change / volatility

            # Step 4: Convert to score
            # Score = 50 - (normalized_momentum × 10), clamped to 30-70
            # Rising prices → positive psf_change → positive normalized → lower score → seller advantage
            # Falling prices → negative psf_change → negative normalized → higher score → buyer advantage
            score = 50 - (normalized_momentum * 10)
            score = max(30, min(70, score))  # Clamp to 30-70
        else:
            # Fallback if not enough volatility data: use simple multiplier
            score = 50 - (psf_change * 3)
            score = max(30, min(70, score))

    # Determine market condition based on score thresholds
    if score > 55:
        label = "Buyer advantage"
        direction = "up"
    elif score < 45:
        label = "Seller advantage"
        direction = "down"
    else:
        label = "Balanced"
        direction = "neutral"

    # Build insight text with z-score interpretation
    if normalized_momentum is not None:
        # Show the z-score interpretation
        abs_z = abs(normalized_momentum)
        if abs_z < 0.5:
            move_desc = "normal"
        elif abs_z < 1.5:
            move_desc = "moderate"
        else:
            move_desc = "strong"
        insight = f"Resale {psf_change:+.1f}% Q-o-Q ({move_desc} move)"
    elif psf_change is not None:
        insight = f"Resale {psf_change:+.1f}% Q-o-Q"
    else:
        insight = "No trend data"

    # Add low confidence warning
    if low_confidence:
        insight += " (low confidence)"

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
            "psf_change_pct": round(psf_change, 1) if psf_change is not None else None,
            "normalized_momentum": round(normalized_momentum, 2) if normalized_momentum is not None else None,
            "volatility": round(volatility, 2) if volatility else None,
            "volatility_months": volatility_months,
            "current_count": current_count,
            "prev_count": prev_count,
            "low_confidence": low_confidence,
            "sale_type": "resale"
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
