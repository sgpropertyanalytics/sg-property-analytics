"""
Aggregation Service - DEPRECATED, use data_computation.py instead

This module is kept for backwards compatibility.
All functionality has been moved to data_computation.py.

New code should import from:
    from services.data_computation import recompute_all_stats
"""

# Re-export everything from data_computation for backwards compatibility
from services.data_computation import (
    recompute_all_stats,
    get_metadata,
    get_outliers_excluded
)


# Deprecated function - kept for backwards compatibility
def recompute_stat_for_filters(districts=None, segment=None):
    """
    DEPRECATED: This function just calls recompute_all_stats().
    Use recompute_all_stats() directly instead.
    """
    recompute_all_stats()
