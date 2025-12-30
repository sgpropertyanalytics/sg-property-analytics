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
from . import projects
from . import projects_analytics
from . import deal_checker
from . import upcoming_launches
from . import auth
from . import gls
from . import new_launch_timeline
from . import new_launch_absorption

__all__ = [
    'aggregate', 'kpi_summary', 'dashboard', 'filter_options',
    'transactions', 'insights', 'supply',
    'charts', 'trends',
    'projects', 'projects_analytics', 'deal_checker',
    'upcoming_launches', 'auth', 'gls', 'new_launch_timeline',
    'new_launch_absorption',
]
