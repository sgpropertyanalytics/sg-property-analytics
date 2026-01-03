"""
Pydantic model for /filter-options endpoint params.

This endpoint has no input params - it returns available filter values
for frontend dropdowns (districts, regions, bedrooms, sale types, etc.).

Endpoint: GET /api/filter-options
"""

from .base import BaseParamsModel


class FilterOptionsParams(BaseParamsModel):
    """
    Pydantic model for /filter-options endpoint params.

    This endpoint accepts no params - it returns all available filter values.
    The model exists for consistency with the api_contract pattern and to
    enable future param additions if needed.

    Usage:
        params = FilterOptionsParams(**raw_params)  # raw_params typically {}
        normalized = params.model_dump()
    """
    # No fields - endpoint accepts no params
    pass
