"""
Landing Page Endpoints

Public endpoints for the landing page live feed.
These return curated, limited data for preview purposes.

Endpoints:
- /landing/recent-activity - Latest 30 transactions for signal feed
- /landing/district-stats - 3-month summary stats per district
"""

import logging
from flask import jsonify
from routes.analytics import analytics_bp
from models.database import db
from sqlalchemy import text
from db.sql import OUTLIER_FILTER
from constants import DISTRICT_NAMES

logger = logging.getLogger('landing')


@analytics_bp.route("/landing/recent-activity", methods=["GET"])
def landing_recent_activity():
    """
    Get recent transaction activity for landing page signal feed.

    Returns the latest 30 transactions with:
    - project_name: Project name
    - bedroom_count: Number of bedrooms
    - price: Total transaction value
    - district: District code (D01-D28)
    - transaction_date: Date of transaction

    This endpoint is public and designed for the landing page preview.
    Data is real but limited to recent activity only.

    Returns:
        {
            "data": [
                {
                    "project": "THE ORIE",
                    "bedroom": 2,
                    "price": 1850000,
                    "district": "D19",
                    "date": "2024-12-15"
                },
                ...
            ],
            "meta": {
                "count": 30,
                "source": "URA REALIS"
            }
        }
    """
    try:
        # Get latest 30 transactions ordered by date desc
        result = db.session.execute(text(f"""
            SELECT
                project_name,
                bedroom_count,
                price,
                district,
                transaction_date
            FROM transactions_primary
            WHERE {OUTLIER_FILTER}
              AND price IS NOT NULL
              AND bedroom_count IS NOT NULL
              AND district IS NOT NULL
            ORDER BY transaction_date DESC, id DESC
            LIMIT 30
        """)).fetchall()

        data = []
        for row in result:
            data.append({
                "project": row[0],
                "bedroom": row[1],
                "price": float(row[2]) if row[2] else None,
                "district": row[3],
                "date": row[4].isoformat() if row[4] else None
            })

        return jsonify({
            "data": data,
            "meta": {
                "count": len(data),
                "source": "URA REALIS"
            }
        })

    except Exception as e:
        logger.error(f"Error fetching recent activity: {e}")
        return jsonify({
            "error": "Failed to fetch recent activity",
            "data": [],
            "meta": {"count": 0}
        }), 500


@analytics_bp.route("/landing/district-stats", methods=["GET"])
def landing_district_stats():
    """
    Get 3-month summary stats for all districts (landing page Intel Tag).

    Returns per-district:
    - name: District name
    - txCount: Transaction count (3 months)
    - medianPsf: Median PSF
    - psfDelta: PSF change vs prior 3 months (%)
    - vol: Volume indicator (HIGH/MED/LOW)

    Returns:
        {
            "data": {
                "D01": {"name": "...", "txCount": 42, "medianPsf": 2850, "psfDelta": "+2.1%", "vol": "MED"},
                ...
            },
            "meta": {"months": 3, "source": "URA REALIS"}
        }
    """
    try:
        # Get 3-month and prior 3-month stats in one query
        result = db.session.execute(text(f"""
            WITH date_bounds AS (
                SELECT
                    MAX(transaction_date) as max_date,
                    MAX(transaction_date) - INTERVAL '3 months' as period_start,
                    MAX(transaction_date) - INTERVAL '6 months' as prior_start
                FROM transactions_primary
                WHERE {OUTLIER_FILTER}
            ),
            current_period AS (
                SELECT
                    district,
                    COUNT(*) as tx_count,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
                FROM transactions_primary, date_bounds
                WHERE {OUTLIER_FILTER}
                  AND transaction_date > date_bounds.period_start
                  AND transaction_date <= date_bounds.max_date
                  AND psf IS NOT NULL
                  AND district IS NOT NULL
                GROUP BY district
            ),
            prior_period AS (
                SELECT
                    district,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY psf) as median_psf
                FROM transactions_primary, date_bounds
                WHERE {OUTLIER_FILTER}
                  AND transaction_date > date_bounds.prior_start
                  AND transaction_date <= date_bounds.period_start
                  AND psf IS NOT NULL
                  AND district IS NOT NULL
                GROUP BY district
            )
            SELECT
                c.district,
                c.tx_count,
                c.median_psf,
                p.median_psf as prior_median_psf
            FROM current_period c
            LEFT JOIN prior_period p ON c.district = p.district
            ORDER BY c.district
        """)).fetchall()

        # Calculate volume thresholds
        tx_counts = [row[1] for row in result if row[1]]
        if tx_counts:
            high_threshold = sorted(tx_counts)[int(len(tx_counts) * 0.66)]
            low_threshold = sorted(tx_counts)[int(len(tx_counts) * 0.33)]
        else:
            high_threshold, low_threshold = 50, 20

        data = {}
        for row in result:
            district = row[0]
            tx_count = int(row[1]) if row[1] else 0
            median_psf = round(float(row[2])) if row[2] else None
            prior_psf = float(row[3]) if row[3] else None

            # Calculate PSF delta
            if median_psf and prior_psf and prior_psf > 0:
                delta_pct = ((median_psf - prior_psf) / prior_psf) * 100
                psf_delta = f"+{delta_pct:.1f}%" if delta_pct >= 0 else f"{delta_pct:.1f}%"
            else:
                psf_delta = "N/A"

            # Volume indicator
            if tx_count >= high_threshold:
                vol = "HIGH"
            elif tx_count <= low_threshold:
                vol = "LOW"
            else:
                vol = "MED"

            data[district] = {
                "name": DISTRICT_NAMES.get(district, district),
                "txCount": tx_count,
                "medianPsf": median_psf,
                "psfDelta": psf_delta,
                "vol": vol
            }

        return jsonify({
            "data": data,
            "meta": {
                "months": 3,
                "source": "URA REALIS",
                "districtCount": len(data)
            }
        })

    except Exception as e:
        logger.error(f"Error fetching district stats: {e}")
        return jsonify({
            "error": "Failed to fetch district stats",
            "data": {},
            "meta": {"months": 3}
        }), 500
