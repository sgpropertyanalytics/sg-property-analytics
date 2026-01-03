"""
Pydantic model for /kpi-summary-v2 endpoint params.

Note: normalize_params() adds timeframe resolution fields (date_from, date_to_exclusive,
months_in_period) even though KPI doesn't use them. We replicate this for parity.
"""

from datetime import date
from typing import Optional, List

from pydantic import Field, model_validator

from .base import BaseParamsModel
from .types import (
    WrapList,
    DistrictList,
    CoercedDate,
)

# Import resolve_timeframe for date resolution (matches aggregate behavior)
from constants import resolve_timeframe


class KPISummaryParams(BaseParamsModel):
    """
    Pydantic model for /kpi-summary-v2 endpoint params.

    Replicates normalize_params() behavior exactly for cache key parity.
    Note: Includes timeframe resolution fields for parity even though KPI
    doesn't use them - the generic normalize_params adds them.
    """

    # === Filters (singular input, becomes plural after validation) ===
    districts: DistrictList = Field(
        default=None,
        validation_alias='district',
        description="Comma-separated district codes"
    )
    bedrooms: WrapList = Field(
        default=None,
        validation_alias='bedroom',
        description="Bedroom filter (wraps in list without splitting)"
    )
    segments: WrapList = Field(
        default=None,
        validation_alias='segment',
        description="Market segment filter (wraps in list without splitting)"
    )

    # === Date Filter ===
    max_date: CoercedDate = Field(
        default=None,
        alias='maxDate',
        description="Reference date for KPI calculations"
    )

    # === Timeframe fields (added by generic normalize_params, unused by KPI) ===
    date_from: Optional[date] = Field(default=None)
    date_to_exclusive: Optional[date] = Field(default=None)
    months_in_period: Optional[int] = Field(default=None)

    @model_validator(mode='after')
    def apply_normalizations(self) -> 'KPISummaryParams':
        """Apply domain-specific normalizations."""
        # Generic normalize_params adds timeframe resolution even for KPI
        # We replicate this for cache key parity
        self._resolve_default_timeframe()
        return self

    def _resolve_default_timeframe(self) -> None:
        """Add default Y1 timeframe resolution (matches normalize_params behavior)."""
        if not self.date_from:
            bounds = resolve_timeframe(None)  # None defaults to Y1
            if bounds['date_from']:
                object.__setattr__(self, 'date_from', bounds['date_from'])
                object.__setattr__(self, 'date_to_exclusive', bounds['date_to_exclusive'])
                object.__setattr__(self, 'months_in_period', bounds['months_in_period'])


class KPISingleParams(BaseParamsModel):
    """
    Pydantic model for /kpi-summary-v2/<kpi_id> endpoint params.
    """

    # === Filters ===
    districts: DistrictList = Field(
        default=None,
        validation_alias='district',
        description="Comma-separated district codes"
    )
    bedrooms: WrapList = Field(
        default=None,
        validation_alias='bedroom',
        description="Bedroom filter"
    )
    segments: WrapList = Field(
        default=None,
        validation_alias='segment',
        description="Market segment filter"
    )

    # === Timeframe fields (added by generic normalize_params) ===
    date_from: Optional[date] = Field(default=None)
    date_to_exclusive: Optional[date] = Field(default=None)
    months_in_period: Optional[int] = Field(default=None)

    # Note: kpi_id comes from URL path, not query params

    @model_validator(mode='after')
    def apply_normalizations(self) -> 'KPISingleParams':
        """Apply domain-specific normalizations."""
        if not self.date_from:
            bounds = resolve_timeframe(None)
            if bounds['date_from']:
                object.__setattr__(self, 'date_from', bounds['date_from'])
                object.__setattr__(self, 'date_to_exclusive', bounds['date_to_exclusive'])
                object.__setattr__(self, 'months_in_period', bounds['months_in_period'])
        return self


class KPISummaryLegacyParams(BaseParamsModel):
    """
    Pydantic model for legacy /kpi-summary endpoint params.
    """

    # === Filters ===
    districts: DistrictList = Field(
        default=None,
        validation_alias='district',
        description="Comma-separated district codes"
    )
    bedrooms: WrapList = Field(
        default=None,
        validation_alias='bedroom',
        description="Bedroom filter"
    )
    segments: WrapList = Field(
        default=None,
        validation_alias='segment',
        description="Market segment filter"
    )

    # === Timeframe fields (added by generic normalize_params) ===
    date_from: Optional[date] = Field(default=None)
    date_to_exclusive: Optional[date] = Field(default=None)
    months_in_period: Optional[int] = Field(default=None)

    @model_validator(mode='after')
    def apply_normalizations(self) -> 'KPISummaryLegacyParams':
        """Apply domain-specific normalizations."""
        if not self.date_from:
            bounds = resolve_timeframe(None)
            if bounds['date_from']:
                object.__setattr__(self, 'date_from', bounds['date_from'])
                object.__setattr__(self, 'date_to_exclusive', bounds['date_to_exclusive'])
                object.__setattr__(self, 'months_in_period', bounds['months_in_period'])
        return self
