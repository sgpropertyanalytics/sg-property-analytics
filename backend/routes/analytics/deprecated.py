"""
Deprecated Endpoints (410 Gone)

These endpoints have been deprecated for URA compliance.
They return 410 Gone status with migration guidance.

Endpoints:
- /transactions - Raw transaction data (deprecated)
- /transactions/list - Paginated transaction list (deprecated)
- /comparable_value_analysis - Raw comparison data (deprecated)
- /scatter-sample - Scatter plot sample data (deprecated)
"""

import logging
from flask import request, jsonify
from routes.analytics import analytics_bp


@analytics_bp.route("/transactions", methods=["GET"])
def transactions_deprecated():
    """
    DEPRECATED: Raw transaction endpoint removed for URA compliance.
    CRITICAL: Return 410 BEFORE any DB call - never execute queries.
    """
    logging.warning(f"Deprecated /transactions called from {request.remote_addr}")
    return jsonify({
        "error": "This endpoint has been deprecated",
        "message": "Use /aggregate for market insights",
        "migration_guide": "https://docs.sgpropertytrend.com/api/migration",
        "reason": "URA compliance - raw transaction data no longer exposed"
    }), 410


@analytics_bp.route("/transactions/list", methods=["GET"])
def transactions_list_deprecated():
    """
    DEPRECATED: Raw transaction list endpoint removed for URA compliance.
    CRITICAL: Return 410 BEFORE any DB call - never execute queries.
    """
    logging.warning(f"Deprecated /transactions/list called from {request.remote_addr}")
    return jsonify({
        "error": "This endpoint has been deprecated",
        "message": "Use /aggregate for market insights",
        "migration_guide": "https://docs.sgpropertytrend.com/api/migration",
        "reason": "URA compliance - raw transaction data no longer exposed",
        "alternatives": {
            "aggregate": "/api/aggregate - Market metrics and distributions",
            "project_summary": "/api/projects/<name>/summary - Project-level aggregates"
        }
    }), 410


@analytics_bp.route("/comparable_value_analysis", methods=["GET"])
def comparable_value_analysis_deprecated():
    """
    DEPRECATED: Comparable value analysis endpoint removed for URA compliance.
    CRITICAL: Return 410 BEFORE any DB call - never execute queries.
    """
    logging.warning(f"Deprecated /comparable_value_analysis called from {request.remote_addr}")
    return jsonify({
        "error": "This endpoint has been deprecated",
        "message": "Use /aggregate for market insights",
        "reason": "URA compliance - transaction-level comparisons no longer exposed",
        "alternatives": {
            "aggregate": "/api/aggregate - Flexible aggregation",
            "psf_by_price_band": "/api/psf-by-price-band - PSF percentiles by price band"
        }
    }), 410


@analytics_bp.route("/scatter-sample", methods=["GET"])
def scatter_sample_deprecated():
    """
    DEPRECATED: Scatter sample endpoint removed for URA compliance.
    CRITICAL: Return 410 BEFORE any DB call - never execute queries.
    """
    logging.warning(f"Deprecated /scatter-sample called from {request.remote_addr}")
    return jsonify({
        "error": "This endpoint has been deprecated",
        "message": "Use /aggregate or /psf-by-price-band for market insights",
        "reason": "URA compliance - individual transaction data no longer exposed",
        "alternatives": {
            "aggregate": "/api/aggregate - Aggregated statistics",
            "price_distribution": "/api/dashboard?panels=price_histogram"
        }
    }), 410
