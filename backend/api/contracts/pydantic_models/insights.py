"""
Pydantic models for /insights/* endpoint params.

Endpoints:
- /api/insights/district-psf
- /api/insights/district-liquidity
"""

from datetime import date
from typing import Optional, Literal

from pydantic import Field, model_validator

from .base import BaseParamsModel
from constants import resolve_timeframe


# Timeframe values accepted by insights endpoints
TimeframeType = Literal[
    "all", "M3", "M6", "Y1", "Y3", "Y5",
    "3m", "6m", "12m", "1y", "2y", "3y", "5y"
]


class DistrictPsfParams(BaseParamsModel):
    """
    Pydantic model for /insights/district-psf endpoint params.

    Provides median PSF by district for the Visual Analytics Map.
    """

    # === Timeframe (resolved to date bounds) ===
    timeframe: Optional[TimeframeType] = Field(
        default="Y1",
        description="Time period filter (default: Y1 = last 12 months)"
    )
    period: Optional[str] = Field(
        default=None,
        description="[DEPRECATED] Use 'timeframe' instead"
    )

    # === Filters ===
    bed: Optional[str] = Field(
        default="all",
        alias="bedroom",  # Frontend sends 'bedroom', backend uses 'bed'
        description="Bedroom filter (all, 1, 2, 3, 4, 4+, 5)"
    )
    age: Optional[str] = Field(
        default="all",
        description="Property age filter (deprecated - use sale_type)"
    )
    # sale_type normalized to DB format by BaseParamsModel validator
    # "all" -> None, "new_sale" -> "New Sale", etc.
    sale_type: Optional[str] = Field(
        default=None,
        alias='saleType',
        description="Sale type filter (normalized to DB format)"
    )

    # === Resolved date bounds (computed from timeframe) ===
    date_from: Optional[date] = Field(default=None)
    date_to_exclusive: Optional[date] = Field(default=None)
    months_in_period: Optional[int] = Field(default=None)

    @model_validator(mode='after')
    def apply_normalizations(self) -> 'DistrictPsfParams':
        """Apply domain-specific normalizations."""
        self._resolve_timeframe()
        return self

    def _resolve_timeframe(self) -> None:
        """Resolve timeframe/period to date bounds."""
        # Use timeframe if provided, fall back to period, default to Y1
        tf = self.timeframe or self.period or 'Y1'
        bounds = resolve_timeframe(tf)
        if bounds['date_from']:
            object.__setattr__(self, 'date_from', bounds['date_from'])
            object.__setattr__(self, 'date_to_exclusive', bounds['date_to_exclusive'])
            object.__setattr__(self, 'months_in_period', bounds['months_in_period'])
            # Normalize timeframe to uppercase format
            object.__setattr__(self, 'timeframe', tf.upper() if tf else 'Y1')


class DistrictLiquidityParams(BaseParamsModel):
    """
    Pydantic model for /insights/district-liquidity endpoint params.

    Provides liquidity metrics by district for market analysis.
    """

    # === Timeframe (resolved to date bounds) ===
    timeframe: Optional[TimeframeType] = Field(
        default="Y1",
        description="Time period filter (default: Y1 = last 12 months)"
    )
    period: Optional[str] = Field(
        default=None,
        description="[DEPRECATED] Use 'timeframe' instead"
    )

    # === Filters ===
    bed: Optional[str] = Field(
        default="all",
        alias="bedroom",  # Frontend sends 'bedroom', backend uses 'bed'
        description="Bedroom filter (all, 1, 2, 3, 4, 5)"
    )
    # sale_type normalized to DB format by BaseParamsModel validator
    sale_type: Optional[str] = Field(
        default=None,
        alias='saleType',
        description="Sale type filter (normalized to DB format)"
    )

    # === Resolved date bounds (computed from timeframe) ===
    date_from: Optional[date] = Field(default=None)
    date_to_exclusive: Optional[date] = Field(default=None)
    months_in_period: Optional[int] = Field(default=None)

    @model_validator(mode='after')
    def apply_normalizations(self) -> 'DistrictLiquidityParams':
        """Apply domain-specific normalizations."""
        self._resolve_timeframe()
        return self

    def _resolve_timeframe(self) -> None:
        """Resolve timeframe/period to date bounds."""
        # Use timeframe if provided, fall back to period, default to Y1
        tf = self.timeframe or self.period or 'Y1'
        bounds = resolve_timeframe(tf)
        if bounds['date_from']:
            object.__setattr__(self, 'date_from', bounds['date_from'])
            object.__setattr__(self, 'date_to_exclusive', bounds['date_to_exclusive'])
            object.__setattr__(self, 'months_in_period', bounds['months_in_period'])
            # Normalize timeframe to uppercase format
            object.__setattr__(self, 'timeframe', tf.upper() if tf else 'Y1')
