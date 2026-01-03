"""
Pydantic models for API param validation.

This module provides Pydantic-based validation for API params, replacing
the custom dataclass-based validation in registry.py.

Key features:
- Frozen models (immutable after normalization)
- Auto type coercion with clear error messages
- IDE autocompletion and type hints
- Parallel validation with feature flags

Usage:
    from api.contracts.pydantic_models.aggregate import AggregateParams

    # Validate params
    params = AggregateParams(**raw_params)

    # Get dict for service layer
    normalized = params.model_dump()
"""

from .base import BaseParamsModel
from .aggregate import AggregateParams
from .dashboard import DashboardParams
from .kpi_summary import KPISummaryParams, KPISingleParams, KPISummaryLegacyParams
from .transactions import PriceGrowthParams, SegmentsParams
from .insights import DistrictPsfParams, DistrictLiquidityParams

__all__ = [
    'BaseParamsModel',
    'AggregateParams',
    'DashboardParams',
    'KPISummaryParams',
    'KPISingleParams',
    'KPISummaryLegacyParams',
    'PriceGrowthParams',
    'SegmentsParams',
    'DistrictPsfParams',
    'DistrictLiquidityParams',
]
