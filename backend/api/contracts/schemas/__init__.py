"""
Contract schemas for API endpoints.

Each schema module registers its contract on import.
Import all schema modules here to auto-register contracts.
"""

# Import schema modules to auto-register contracts
from . import aggregate
from . import kpi_summary

__all__ = ['aggregate', 'kpi_summary']
