"""
Analytics API Routes - Split into domain-specific modules

This package organizes the analytics endpoints into logical domains:
- dashboard.py: Unified dashboard endpoint
- aggregate.py: Flexible aggregation (THE STANDARD)
- filters.py: Filter options endpoint
- kpi.py: KPI summary endpoint
- admin.py: Health, debug, admin endpoints
- deprecated.py: Deprecated 410 endpoints
- trends.py: Trend endpoints (candidates for /aggregate consolidation)
- charts.py: Specialized chart data endpoints
- transactions.py: Transaction list and growth endpoints
- projects_analytics.py: Project-specific analytics

All modules share the same blueprint (analytics_bp) registered at /api.
"""

from flask import Blueprint
from services.analytics_reader import get_reader
from api.contracts.contract_schema import API_CONTRACT_HEADER, CURRENT_API_CONTRACT_VERSION

# Create the shared blueprint
analytics_bp = Blueprint('analytics', __name__)

# Shared reader instance
reader = get_reader()


@analytics_bp.after_request
def add_contract_version_header(response):
    """Add X-API-Contract-Version header to all analytics responses."""
    response.headers[API_CONTRACT_HEADER] = CURRENT_API_CONTRACT_VERSION
    return response


# Import all route modules to register their routes with the blueprint
# Order doesn't matter since Flask routes are matched by specificity
from routes.analytics import dashboard
from routes.analytics import aggregate
from routes.analytics import filters
from routes.analytics import kpi
from routes.analytics import kpi_v2
from routes.analytics import admin
from routes.analytics import deprecated
from routes.analytics import trends
from routes.analytics import charts
from routes.analytics import transactions
from routes.analytics import projects_analytics
