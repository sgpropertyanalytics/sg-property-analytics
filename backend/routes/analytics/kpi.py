"""
KPI Summary Endpoint (DEPRECATED)

This endpoint has been deprecated in favor of /kpi-summary-v2.
Returns 410 Gone with migration guidance.

Migration: Use /api/kpi-summary-v2 instead.
"""

import logging
from flask import request, jsonify
from routes.analytics import analytics_bp


@analytics_bp.route("/kpi-summary", methods=["GET"])
def kpi_summary_deprecated():
    """
    DEPRECATED: Legacy KPI endpoint.
    Use /kpi-summary-v2 for the registry-based implementation.
    """
    logging.warning(f"Deprecated /kpi-summary called from {request.remote_addr}")
    return jsonify({
        "error": "This endpoint has been deprecated",
        "message": "Use /kpi-summary-v2 for KPI metrics",
        "migration_guide": {
            "replacement": "/api/kpi-summary-v2",
            "changes": [
                "Response uses standardized KPIResult format",
                "Supports individual KPI fetching via /kpi-summary-v2/<kpi_id>",
                "Registry-based architecture for extensibility"
            ]
        },
        "reason": "Consolidated to registry-based v2 endpoint"
    }), 410
