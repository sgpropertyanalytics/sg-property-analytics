"""
Pydantic models for /charts/* endpoints.

Endpoints:
- charts/projects-by-district
- charts/price-projects-by-district
- charts/floor-liquidity-heatmap
- charts/psf-by-price-band
- charts/budget-heatmap
"""

from datetime import date, timedelta
from typing import Optional, List

from pydantic import Field, model_validator

from .base import BaseParamsModel, derive_sale_type_db
from .types import (
    DistrictList,
    WrapList,
    CoercedDate,
    CoercedInt,
    CoercedFloat,
    CoercedBool,
)


class ProjectsByDistrictParams(BaseParamsModel):
    """Params for /charts/projects-by-district."""

    district: Optional[str] = Field(
        default=None,
        description="District code (e.g., D09)"
    )
    bedrooms: WrapList = Field(
        default=None,
        validation_alias='bedroom',
        description="Comma-separated bedroom counts"
    )
    segment: Optional[str] = Field(
        default=None,
        description="Market segment filter"
    )


class PriceProjectsByDistrictParams(BaseParamsModel):
    """Params for /charts/price-projects-by-district."""

    district: Optional[str] = Field(
        default=None,
        description="District code"
    )
    bedrooms: WrapList = Field(
        default=None,
        validation_alias='bedroom',
        description="Comma-separated bedroom counts"
    )
    months: CoercedInt = Field(
        default=15,
        description="Timeframe in months"
    )


class FloorLiquidityHeatmapParams(BaseParamsModel):
    """Params for /charts/floor-liquidity-heatmap."""

    window_months: CoercedInt = Field(
        default=12,
        description="Rolling window for velocity"
    )
    segment: Optional[str] = Field(
        default=None,
        description="Market segment (CCR, RCR, OCR)"
    )
    districts: DistrictList = Field(
        default=None,
        validation_alias='district',
        description="Comma-separated districts"
    )
    bedrooms: WrapList = Field(
        default=None,
        validation_alias='bedroom',
        description="Comma-separated bedroom counts"
    )
    min_transactions: CoercedInt = Field(
        default=30,
        description="Minimum transactions per project"
    )
    min_units: CoercedInt = Field(
        default=100,
        description="Minimum units per project"
    )
    limit: CoercedInt = Field(
        default=0,
        description="Max projects to return (0 = no limit)"
    )
    skip_cache: CoercedBool = Field(
        default=False,
        description="Bypass cache"
    )


class PsfByPriceBandParams(BaseParamsModel):
    """Params for /charts/psf-by-price-band."""

    date_from: CoercedDate = Field(
        default=None,
        description="Start date"
    )
    date_to: CoercedDate = Field(
        default=None,
        description="End date"
    )
    districts: DistrictList = Field(
        default=None,
        validation_alias='district',
        description="Comma-separated districts"
    )
    region: Optional[str] = Field(
        default=None,
        alias='segment',
        description="Market region (CCR, RCR, OCR)"
    )
    sale_type: Optional[str] = Field(
        default=None,
        alias='saleType',
        description="Sale type filter"
    )
    sale_type_db: Optional[str] = Field(
        default=None,
        description="Sale type in DB format (auto-derived)"
    )
    tenure: Optional[str] = Field(
        default=None,
        description="Tenure filter"
    )

    # Computed
    date_to_exclusive: Optional[date] = Field(
        default=None,
        description="Exclusive end date"
    )

    @model_validator(mode='after')
    def apply_normalizations(self) -> 'PsfByPriceBandParams':
        """Normalize date bounds and derive sale_type_db."""
        if self.date_to_exclusive:
            if self.date_to:
                object.__setattr__(self, 'date_to', None)
        elif self.date_to and isinstance(self.date_to, date):
            object.__setattr__(self, 'date_to_exclusive', self.date_to + timedelta(days=1))
            object.__setattr__(self, 'date_to', None)

        # Derive sale_type_db
        if self.sale_type and not self.sale_type_db:
            object.__setattr__(self, 'sale_type_db', derive_sale_type_db(self.sale_type))

        return self


class BudgetHeatmapParams(BaseParamsModel):
    """Params for /charts/budget-heatmap."""

    budget: CoercedInt = Field(
        default=None,
        description="Target budget in SGD"
    )
    tolerance: CoercedInt = Field(
        default=100000,
        description="+/- range for budget"
    )
    bedroom: CoercedInt = Field(
        default=None,
        description="Bedroom filter (1-5)"
    )
    segment: Optional[str] = Field(
        default=None,
        description="Market segment"
    )
    district: Optional[str] = Field(
        default=None,
        description="District code"
    )
    tenure: Optional[str] = Field(
        default=None,
        description="Tenure type"
    )
    months_lookback: CoercedInt = Field(
        default=24,
        description="Time window in months"
    )
    skip_cache: CoercedBool = Field(
        default=False,
        description="Bypass cache"
    )
