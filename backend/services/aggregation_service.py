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
    # Preserve existing validation counts from metadata
    existing_metadata = get_metadata()
    validation_results = {
        'invalid_removed': existing_metadata.get('invalid_removed', 0),
        'duplicates_removed': existing_metadata.get('duplicates_removed', 0),
        'outliers_removed': existing_metadata.get('outliers_excluded', 0)
    }
    recompute_all_stats(validation_results)
