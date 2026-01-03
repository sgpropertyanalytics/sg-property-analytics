"""
Pydantic models for /transactions/* endpoint params.

Covers:
- /transactions/price-growth
- /transactions/price-growth/segments
"""

from datetime import date, timedelta
from typing import Optional, List

from pydantic import Field, model_validator

from .base import BaseParamsModel
from .types import (
    IntList,
    DistrictList,
    CoercedDate,
    CoercedInt,
)

# Import resolve_timeframe for date resolution
from constants import resolve_timeframe


class PriceGrowthParams(BaseParamsModel):
    """
    Pydantic model for /transactions/price-growth endpoint params.
    """

    # === Filters ===
    project: Optional[str] = Field(
        default=None,
        description="Project name (partial match)"
    )
    bedrooms: IntList = Field(
        default=None,
        validation_alias='bedroom',
        description="Bedroom filter"
    )
    floor_level: Optional[str] = Field(
        default=None,
        alias='floorLevel',
        description="Floor tier filter"
    )
    districts: DistrictList = Field(
        default=None,
        validation_alias='district',
        description="District filter"
    )
    sale_type: Optional[str] = Field(
        default=None,
        alias='saleType',
        description="Sale type filter"
    )

    # === Date Filters ===
    date_from: CoercedDate = Field(
        default=None,
        alias='dateFrom',
        description="Start date"
    )
    date_to: CoercedDate = Field(
        default=None,
        alias='dateTo',
        description="End date"
    )
    date_to_exclusive: Optional[date] = Field(
        default=None,
        description="Exclusive end date (computed)"
    )
    months_in_period: Optional[int] = Field(
        default=None,
        description="Months in period"
    )

    # === Pagination ===
    page: CoercedInt = Field(
        default=1,
        description="Page number"
    )
    per_page: CoercedInt = Field(
        default=50,
        alias='perPage',
        description="Records per page"
    )

    @model_validator(mode='after')
    def apply_normalizations(self) -> 'PriceGrowthParams':
        """Apply domain-specific normalizations."""
        self._resolve_timeframe()
        self._normalize_date_bounds()
        self._align_month_boundaries()
        return self

    def _resolve_timeframe(self) -> None:
        """Resolve default timeframe to date bounds."""
        if self.date_from and (self.date_to_exclusive or self.date_to):
            return

        # Default to Y1 like other endpoints
        bounds = resolve_timeframe(None)
        if bounds['date_from'] is not None:
            object.__setattr__(self, 'date_from', bounds['date_from'])
            object.__setattr__(self, 'date_to_exclusive', bounds['date_to_exclusive'])
            object.__setattr__(self, 'months_in_period', bounds['months_in_period'])

    def _normalize_date_bounds(self) -> None:
        """Convert date_to to date_to_exclusive and clear date_to."""
        if self.date_to_exclusive:
            if self.date_to:
                object.__setattr__(self, 'date_to', None)
            return

        if self.date_to and isinstance(self.date_to, date):
            object.__setattr__(self, 'date_to_exclusive', self.date_to + timedelta(days=1))
            object.__setattr__(self, 'date_to', None)

    def _align_month_boundaries(self) -> None:
        """Align dates to month boundaries for URA data."""
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


class SegmentsParams(BaseParamsModel):
    """
    Pydantic model for /transactions/price-growth/segments endpoint params.
    """

    # === Filters ===
    project: Optional[str] = Field(
        default=None,
        description="Project name (partial match)"
    )
    districts: DistrictList = Field(
        default=None,
        validation_alias='district',
        description="District filter"
    )
    sale_type: Optional[str] = Field(
        default=None,
        alias='saleType',
        description="Sale type filter"
    )

    # === Date Filters ===
    date_from: CoercedDate = Field(
        default=None,
        alias='dateFrom',
        description="Start date"
    )
    date_to: CoercedDate = Field(
        default=None,
        alias='dateTo',
        description="End date"
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
    def apply_normalizations(self) -> 'SegmentsParams':
        """Apply domain-specific normalizations."""
        self._resolve_timeframe()
        self._normalize_date_bounds()
        self._align_month_boundaries()
        return self

    def _resolve_timeframe(self) -> None:
        """Resolve default timeframe to date bounds."""
        if self.date_from and (self.date_to_exclusive or self.date_to):
            return

        bounds = resolve_timeframe(None)
        if bounds['date_from'] is not None:
            object.__setattr__(self, 'date_from', bounds['date_from'])
            object.__setattr__(self, 'date_to_exclusive', bounds['date_to_exclusive'])
            object.__setattr__(self, 'months_in_period', bounds['months_in_period'])

    def _normalize_date_bounds(self) -> None:
        """Convert date_to to date_to_exclusive and clear date_to."""
        if self.date_to_exclusive:
            if self.date_to:
                object.__setattr__(self, 'date_to', None)
            return

        if self.date_to and isinstance(self.date_to, date):
            object.__setattr__(self, 'date_to_exclusive', self.date_to + timedelta(days=1))
            object.__setattr__(self, 'date_to', None)

    def _align_month_boundaries(self) -> None:
        """Align dates to month boundaries for URA data."""
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
