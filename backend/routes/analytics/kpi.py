"""
KPI Summary Endpoint

Single optimized endpoint for KPI cards - returns all metrics in one call.

Endpoints:
- /kpi-summary - All KPI metrics in one call
"""

import time
from flask import request, jsonify
from routes.analytics import analytics_bp
from constants import SALE_TYPE_NEW, SALE_TYPE_RESALE


@analytics_bp.route("/kpi-summary", methods=["GET"])
def kpi_summary():
    """
    Single optimized endpoint for KPI cards - returns all metrics in one call.

    Uses a single SQL query with CTEs for maximum performance.

    Query params:
      - district: comma-separated districts
      - bedroom: comma-separated bedroom counts
      - segment: CCR, RCR, OCR

    Returns:
      {
        "medianPsf": { "current": 1842, "previous": 1798, "trend": 2.4 },
        "priceSpread": { "iqr": 485, "iqrRatio": 26.3, "label": "Stable" },
        "newLaunchPremium": { "value": 18.5, "trend": "widening" },
        "marketMomentum": { "score": 38, "label": "Seller's market" },
        "insights": {
          "psf": "Rising - sellers have leverage",
          "spread": "Normal variance",
          "premium": "High premium - consider resale",
          "momentum": "Good time to sell"
        }
      }
    """
    from datetime import datetime, timedelta
    from models.transaction import Transaction
    from models.database import db
    from sqlalchemy import func, text
    from db.sql import OUTLIER_FILTER

    start = time.time()

    try:
        # Get max date from metadata
        max_date_result = db.session.execute(text(f"""
            SELECT MAX(transaction_date) as max_date FROM transactions WHERE {OUTLIER_FILTER}
        """)).fetchone()

        if not max_date_result or not max_date_result.max_date:
            return jsonify({"error": "No data available"}), 404

        max_date = max_date_result.max_date
        thirty_days_ago = max_date - timedelta(days=30)
        sixty_days_ago = max_date - timedelta(days=60)
        # Use < next_day instead of <= max_date to include all transactions on max_date
        max_date_exclusive = max_date + timedelta(days=1)

        # Build filter conditions
        filter_sql = OUTLIER_FILTER
        params = {
            'max_date_exclusive': max_date_exclusive,
            'thirty_days_ago': thirty_days_ago,
            'sixty_days_ago': sixty_days_ago
        }

        # District filter
        district_param = request.args.get('district')
        if district_param:
            districts = [d.strip().upper() for d in district_param.split(',') if d.strip()]
            normalized = []
            for d in districts:
                if not d.startswith('D'):
                    d = f'D{d.zfill(2)}'
                normalized.append(d)
            filter_sql += f" AND district IN :districts"
            params['districts'] = tuple(normalized)

        # Bedroom filter
        bedroom_param = request.args.get('bedroom')
        if bedroom_param:
            bedrooms = [int(b.strip()) for b in bedroom_param.split(',') if b.strip().isdigit()]
            filter_sql += f" AND num_bedrooms IN :bedrooms"
            params['bedrooms'] = tuple(bedrooms)

        # Segment filter
        segment_param = request.args.get('segment')
        if segment_param:
            from constants import get_districts_for_region
            segment = segment_param.upper()
            if segment in ['CCR', 'RCR', 'OCR']:
                segment_districts = get_districts_for_region(segment)
                filter_sql += f" AND district IN :segment_districts"
                params['segment_districts'] = tuple(segment_districts)

        # Single optimized query using CTEs
        sql = text(f"""
            WITH current_period AS (
                SELECT
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                    PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY psf) as psf_25,
                    PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY psf) as psf_75,
                    COUNT(*) as txn_count
                FROM transactions
                WHERE {filter_sql}
                  AND transaction_date >= :thirty_days_ago
                  AND transaction_date < :max_date_exclusive
            ),
            previous_period AS (
                SELECT
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf,
                    COUNT(*) as txn_count
                FROM transactions
                WHERE {filter_sql}
                  AND transaction_date >= :sixty_days_ago
                  AND transaction_date < :thirty_days_ago
            ),
            new_sales AS (
                SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
                FROM transactions
                WHERE {filter_sql}
                  AND sale_type = '{SALE_TYPE_NEW}'
                  AND transaction_date > :max_date - INTERVAL '12 months'
            ),
            young_resales AS (
                SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
                FROM transactions
                WHERE {filter_sql}
                  AND sale_type = '{SALE_TYPE_RESALE}'
                  AND transaction_date > :max_date - INTERVAL '12 months'
                  AND EXTRACT(YEAR FROM transaction_date) - COALESCE(lease_start_year, EXTRACT(YEAR FROM transaction_date) - 5) BETWEEN 4 AND 9
            )
            SELECT
                c.median_psf as current_psf,
                c.psf_25,
                c.psf_75,
                c.txn_count,
                p.median_psf as prev_psf,
                p.txn_count as prev_txn_count,
                n.median_psf as new_sale_psf,
                r.median_psf as resale_psf
            FROM current_period c
            CROSS JOIN previous_period p
            CROSS JOIN new_sales n
            CROSS JOIN young_resales r
        """)

        result = db.session.execute(sql, params).fetchone()

        if not result or not result.current_psf:
            # Return defaults if no data
            elapsed = time.time() - start
            return jsonify({
                "medianPsf": {"current": 0, "previous": 0, "trend": 0},
                "priceSpread": {"iqr": 0, "iqrRatio": 0, "label": "No data"},
                "newLaunchPremium": {"value": 0, "trend": "stable"},
                "marketMomentum": {"score": 50, "label": "No data"},
                "insights": {
                    "psf": "Insufficient data",
                    "spread": "Insufficient data",
                    "premium": "Insufficient data",
                    "momentum": "Insufficient data"
                },
                "meta": {"elapsed_ms": round(elapsed * 1000, 2), "txn_count": 0}
            })

        # Calculate metrics
        current_psf = float(result.current_psf or 0)
        prev_psf = float(result.prev_psf or current_psf)
        psf_25 = float(result.psf_25 or 0)
        psf_75 = float(result.psf_75 or 0)
        new_sale_psf = float(result.new_sale_psf or 0)
        resale_psf = float(result.resale_psf or 0)
        txn_count = int(result.txn_count or 0)
        prev_txn_count = int(result.prev_txn_count or 0)

        # PSF trend (only calculate if we have previous data)
        if prev_txn_count > 0 and prev_psf > 0:
            psf_trend = ((current_psf - prev_psf) / prev_psf * 100)
        else:
            psf_trend = None  # No data to compare

        # Price spread (IQR)
        iqr = psf_75 - psf_25
        iqr_ratio = (iqr / current_psf * 100) if current_psf > 0 else 0
        iqr_ratio = min(iqr_ratio, 100)  # Cap at 100%

        spread_label = "Very Stable" if iqr_ratio < 20 else "Stable" if iqr_ratio < 30 else "Moderate" if iqr_ratio < 40 else "Volatile"

        # New launch premium
        new_premium = ((new_sale_psf - resale_psf) / resale_psf * 100) if resale_psf > 0 else 0
        premium_trend = "widening" if new_premium > 15 else "narrowing" if new_premium < 10 else "stable"

        # Market momentum (based on PSF trend, default to 50 if no trend data)
        if psf_trend is not None:
            momentum_score = 50 - (psf_trend * 5)
            momentum_score = max(20, min(80, momentum_score))
        else:
            momentum_score = 50  # Neutral when no data
        momentum_label = "Buyer's market" if momentum_score >= 55 else "Seller's market" if momentum_score <= 45 else "Balanced"

        # Generate compact insights - just the numbers, no filler words
        # PSF: show previous vs current (handle no data case)
        if prev_txn_count > 0:
            psf_insight = f"Prev ${round(prev_psf):,} → Now ${round(current_psf):,}"
        else:
            psf_insight = f"Now ${round(current_psf):,} (no prev data)"

        # Spread: show percentiles
        spread_insight = f"P25 ${round(psf_25):,} · P75 ${round(psf_75):,}"

        # Premium: show new vs resale PSF
        if new_sale_psf > 0 and resale_psf > 0:
            premium_insight = f"New ${round(new_sale_psf):,} vs Resale ${round(resale_psf):,}"
        else:
            premium_insight = "Insufficient data"

        # Momentum: show the trend driving it
        if psf_trend is not None:
            momentum_insight = f"Trend {psf_trend:+.1f}% MoM"
        else:
            momentum_insight = "No trend data"

        elapsed = time.time() - start
        print(f"GET /api/kpi-summary completed in {elapsed:.4f}s")

        return jsonify({
            "medianPsf": {
                "current": round(current_psf),
                "previous": round(prev_psf) if prev_txn_count > 0 else None,
                "trend": round(psf_trend, 1) if psf_trend is not None else None
            },
            "priceSpread": {
                "iqr": round(iqr),
                "iqrRatio": round(iqr_ratio, 1),
                "label": spread_label
            },
            "newLaunchPremium": {
                "value": round(new_premium, 1),
                "trend": premium_trend
            },
            "marketMomentum": {
                "score": round(momentum_score),
                "label": momentum_label
            },
            "insights": {
                "psf": psf_insight,
                "spread": spread_insight,
                "premium": premium_insight,
                "momentum": momentum_insight
            },
            "meta": {
                "elapsed_ms": round(elapsed * 1000, 2),
                "current_period": {
                    "from": str(thirty_days_ago),
                    "to": str(max_date),
                    "txn_count": txn_count
                },
                "previous_period": {
                    "from": str(sixty_days_ago),
                    "to": str(thirty_days_ago),
                    "txn_count": prev_txn_count
                }
            }
        })

    except Exception as e:
        elapsed = time.time() - start
        print(f"GET /api/kpi-summary ERROR (took {elapsed:.4f}s): {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
