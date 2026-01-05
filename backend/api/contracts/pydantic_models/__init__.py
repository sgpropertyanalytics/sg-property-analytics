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

from api.contracts.contract_schema import BaseParamsModel
from .aggregate import AggregateParams
from .dashboard import DashboardParams, DashboardMeta
from .filter_options import FilterOptionsParams
from .kpi_summary import KPISummaryParams, KPISingleParams, KPISummaryLegacyParams
from .transactions import PriceGrowthParams, SegmentsParams
from .insights import DistrictPsfParams, DistrictLiquidityParams

# New models - Phase 8 migration
from .trends import NewVsResaleParams
from .charts import (
    DistrictGrowthParams,
    ProjectsByDistrictParams,
    PriceProjectsByDistrictParams,
    FloorLiquidityHeatmapParams,
    PsfByPriceBandParams,
    BudgetHeatmapParams,
)
from .new_launch import NewLaunchTimelineParams, NewLaunchAbsorptionParams
from .projects_analytics import (
    ProjectInventoryParams,
    ProjectPriceBandsParams,
    ResaleProjectsParams,
    ProjectExitQueueParams,
)
from .projects import (
    ProjectsLocationsParams,
    ProjectsHotParams,
    ProjectsInventoryStatusParams,
)
from .supply import SupplySummaryParams
from .gls import GlsAllParams, GlsNeedsReviewParams
from .upcoming_launches import UpcomingLaunchesAllParams, UpcomingNeedsReviewParams
from .deal_checker import DealCheckerMultiScopeParams, ProjectNamesParams
from .auth import (
    RegisterParams,
    LoginParams,
    MeParams,
    FirebaseSyncParams,
    SubscriptionParams,
    DeleteAccountParams,
)

__all__ = [
    'BaseParamsModel',
    # Core endpoints (Phase 7)
    'AggregateParams',
    'DashboardParams',
    'DashboardMeta',
    'FilterOptionsParams',
    'KPISummaryParams',
    'KPISingleParams',
    'KPISummaryLegacyParams',
    'PriceGrowthParams',
    'SegmentsParams',
    'DistrictPsfParams',
    'DistrictLiquidityParams',
    # New endpoints (Phase 8)
    'NewVsResaleParams',
    'DistrictGrowthParams',
    'ProjectsByDistrictParams',
    'PriceProjectsByDistrictParams',
    'FloorLiquidityHeatmapParams',
    'PsfByPriceBandParams',
    'BudgetHeatmapParams',
    'NewLaunchTimelineParams',
    'NewLaunchAbsorptionParams',
    'ProjectInventoryParams',
    'ProjectPriceBandsParams',
    'ResaleProjectsParams',
    'ProjectExitQueueParams',
    'ProjectsLocationsParams',
    'ProjectsHotParams',
    'ProjectsInventoryStatusParams',
    'SupplySummaryParams',
    'GlsAllParams',
    'GlsNeedsReviewParams',
    'UpcomingLaunchesAllParams',
    'UpcomingNeedsReviewParams',
    'DealCheckerMultiScopeParams',
    'ProjectNamesParams',
    # Auth endpoints
    'RegisterParams',
    'LoginParams',
    'MeParams',
    'FirebaseSyncParams',
    'SubscriptionParams',
    'DeleteAccountParams',
]
