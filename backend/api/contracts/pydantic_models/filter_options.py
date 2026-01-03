"""
Pydantic model for /filter-options endpoint params.

This endpoint has no input params - it returns available filter values
for frontend dropdowns (districts, regions, bedrooms, sale types, etc.).

The old normalize_params applies timeframe resolution (defaults to Y1)
even for this endpoint, so we replicate that behavior.

Endpoint: GET /api/filter-options
"""

from datetime import date
from typing import Optional

from pydantic import model_validator

from .base import BaseParamsModel

# Import resolve_timeframe for date resolution
from constants import resolve_timeframe


class FilterOptionsParams(BaseParamsModel):
    """
    Pydantic model for /filter-options endpoint params.

    This endpoint accepts no input params - it returns all available filter values.
    However, old normalize_params applies timeframe resolution (defaults to Y1),
    so we replicate that behavior for parity.

    Usage:
        params = FilterOptionsParams(**raw_params)  # raw_params typically {}
        normalized = params.model_dump()
    """
    # NOTE: These fields are NOT used by the /filter-options endpoint.
    # They exist for parity with old normalize_params which applies timeframe
    # resolution to ALL endpoints unconditionally.
    # After Pydantic migration is complete (Phase 7), consider removing if
    # old normalize_params behavior is also cleaned up.
    date_from: Optional[date] = None
    date_to_exclusive: Optional[date] = None
    months_in_period: Optional[int] = None

    @model_validator(mode='after')
    def apply_defaults(self) -> 'FilterOptionsParams':
        """Apply Y1 default timeframe (same as old normalize_params)."""
        # Old normalize_params calls resolve_timeframe(None) which defaults to Y1
        bounds = resolve_timeframe(None)

        if bounds['date_from'] is not None:
            object.__setattr__(self, 'date_from', bounds['date_from'])
            object.__setattr__(self, 'date_to_exclusive', bounds['date_to_exclusive'])
            object.__setattr__(self, 'months_in_period', bounds['months_in_period'])

        return self
