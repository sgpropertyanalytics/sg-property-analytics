"""
Landing Page Endpoints

Public endpoints for the landing page live feed.
These return curated, limited data for preview purposes.

Endpoints:
- /landing/recent-activity - Latest 30 transactions for signal feed
"""

import logging
from flask import jsonify
from routes.analytics import analytics_bp
from models.database import db
from sqlalchemy import text
from db.sql import OUTLIER_FILTER

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
            FROM transactions
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
