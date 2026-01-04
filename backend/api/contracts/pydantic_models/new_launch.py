"""
Pydantic models for new launch endpoints.

Endpoints:
- new-launch-timeline
- new-launch-absorption
"""

from datetime import date, timedelta
from typing import Optional, List

from pydantic import Field, model_validator

from .base import BaseParamsModel
from .types import (
    DistrictList,
    WrapList,
    CoercedDate,
)

from constants import resolve_timeframe


class NewLaunchTimelineParams(BaseParamsModel):
    """Params for /new-launch-timeline endpoint."""

    time_grain: Optional[str] = Field(
        default="quarter",
        alias='timeGrain',
        description="Time grouping (month, quarter, year)"
    )

    timeframe: Optional[str] = Field(
        default=None,
        description="Timeframe preset (M3, M6, Y1, Y3, Y5, all)"
    )

    districts: DistrictList = Field(
        default=None,
        validation_alias='district',
        description="Comma-separated district codes"
    )
    segments: WrapList = Field(
        default=None,
        validation_alias='segment',
        description="Market segment filter"
    )
    bedrooms: WrapList = Field(
        default=None,
        validation_alias='bedroom',
        description="Bedroom filter"
    )

    date_from: CoercedDate = Field(
        default=None,
        alias='dateFrom',
        description="Start date (inclusive)"
    )
    date_to: CoercedDate = Field(
        default=None,
        alias='dateTo',
        description="End date (inclusive)"
    )

    date_to_exclusive: Optional[date] = Field(
        default=None,
        description="Exclusive end date (computed)"
    )
    months_in_period: Optional[int] = Field(
        default=None,
        description="Months in period"
    )

    @model_validator(mode='after')
    def apply_normalizations(self) -> 'NewLaunchTimelineParams':
        """Apply domain-specific normalizations."""
        self._resolve_timeframe()
        self._normalize_date_bounds()
        self._align_month_boundaries()
        return self

    def _resolve_timeframe(self) -> None:
        """Resolve timeframe preset to date bounds."""
        if self.date_from and (self.date_to_exclusive or self.date_to):
            return

        bounds = resolve_timeframe(self.timeframe)
        if bounds['date_from'] is not None:
            object.__setattr__(self, 'date_from', bounds['date_from'])
            object.__setattr__(self, 'date_to_exclusive', bounds['date_to_exclusive'])
            object.__setattr__(self, 'months_in_period', bounds['months_in_period'])

    def _normalize_date_bounds(self) -> None:
        """Convert date_to to date_to_exclusive."""
        if self.date_to_exclusive:
            if self.date_to:
                object.__setattr__(self, 'date_to', None)
            return

        if self.date_to and isinstance(self.date_to, date):
            object.__setattr__(self, 'date_to_exclusive', self.date_to + timedelta(days=1))
            object.__setattr__(self, 'date_to', None)

    def _align_month_boundaries(self) -> None:
        """Align dates to month boundaries."""
        if self.date_from and isinstance(self.date_from, date):
            aligned = date(self.date_from.year, self.date_from.month, 1)
            if aligned != self.date_from:
                object.__setattr__(self, 'date_from', aligned)

        if self.date_to_exclusive and isinstance(self.date_to_exclusive, date):
            if self.date_to_exclusive.day != 1:
                if self.date_to_exclusive.month == 12:
                    aligned = date(self.date_to_exclusive.year + 1, 1, 1)
                else:
                    aligned = date(self.date_to_exclusive.year, self.date_to_exclusive.month + 1, 1)
                object.__setattr__(self, 'date_to_exclusive', aligned)


class NewLaunchAbsorptionParams(BaseParamsModel):
    """Params for /new-launch-absorption endpoint."""

    time_grain: Optional[str] = Field(
        default="quarter",
        alias='timeGrain',
        description="Time grouping (month, quarter, year)"
    )

    timeframe: Optional[str] = Field(
        default=None,
        description="Timeframe preset (M3, M6, Y1, Y3, Y5, all)"
    )

    districts: DistrictList = Field(
        default=None,
        validation_alias='district',
        description="Comma-separated district codes"
    )
    segments: WrapList = Field(
        default=None,
        validation_alias='segment',
        description="Market segment filter"
    )
    bedrooms: WrapList = Field(
        default=None,
        validation_alias='bedroom',
        description="Bedroom filter"
    )

    date_from: CoercedDate = Field(
        default=None,
        alias='dateFrom',
        description="Start date (inclusive)"
    )
    date_to: CoercedDate = Field(
        default=None,
        alias='dateTo',
        description="End date (inclusive)"
    )

    date_to_exclusive: Optional[date] = Field(
        default=None,
        description="Exclusive end date (computed)"
    )
    months_in_period: Optional[int] = Field(
        default=None,
        description="Months in period"
    )

    @model_validator(mode='after')
    def apply_normalizations(self) -> 'NewLaunchAbsorptionParams':
        """Apply domain-specific normalizations."""
        self._resolve_timeframe()
        self._normalize_date_bounds()
        self._align_month_boundaries()
        return self

    def _resolve_timeframe(self) -> None:
        """Resolve timeframe preset to date bounds."""
        if self.date_from and (self.date_to_exclusive or self.date_to):
            return

        bounds = resolve_timeframe(self.timeframe)
        if bounds['date_from'] is not None:
            object.__setattr__(self, 'date_from', bounds['date_from'])
            object.__setattr__(self, 'date_to_exclusive', bounds['date_to_exclusive'])
            object.__setattr__(self, 'months_in_period', bounds['months_in_period'])

    def _normalize_date_bounds(self) -> None:
        """Convert date_to to date_to_exclusive."""
        if self.date_to_exclusive:
            if self.date_to:
                object.__setattr__(self, 'date_to', None)
            return

        if self.date_to and isinstance(self.date_to, date):
            object.__setattr__(self, 'date_to_exclusive', self.date_to + timedelta(days=1))
            object.__setattr__(self, 'date_to', None)

    def _align_month_boundaries(self) -> None:
        """Align dates to month boundaries."""
        if self.date_from and isinstance(self.date_from, date):
            aligned = date(self.date_from.year, self.date_from.month, 1)
            if aligned != self.date_from:
                object.__setattr__(self, 'date_from', aligned)

        if self.date_to_exclusive and isinstance(self.date_to_exclusive, date):
            if self.date_to_exclusive.day != 1:
                if self.date_to_exclusive.month == 12:
                    aligned = date(self.date_to_exclusive.year + 1, 1, 1)
                else:
                    aligned = date(self.date_to_exclusive.year, self.date_to_exclusive.month + 1, 1)
                object.__setattr__(self, 'date_to_exclusive', aligned)
