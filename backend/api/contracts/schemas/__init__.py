"""
Contract schemas for API endpoints.

Each schema module registers its contract on import.
Import all schema modules here to auto-register contracts.
"""

# Import schema modules to auto-register contracts
from . import aggregate
from . import kpi_summary
from . import dashboard
from . import filter_options
from . import transactions
from . import insights
from . import supply
from . import charts
from . import trends
from . import precomputed
from . import projects
from . import projects_analytics
from . import deal_checker

__all__ = [
    'aggregate', 'kpi_summary', 'dashboard', 'filter_options',
    'transactions', 'insights', 'supply',
    'charts', 'trends', 'precomputed',
    'projects', 'projects_analytics', 'deal_checker',
]
