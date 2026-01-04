"""
Pydantic model for /dashboard endpoint params.

Similar to aggregate but with additional fields for panels and display options.
"""

from datetime import date, timedelta
from typing import Optional, List

from pydantic import Field, model_validator

from .base import BaseParamsModel, derive_sale_type_db
from .types import (
    CommaList,
    WrapList,
    DistrictList,
    CoercedDate,
    CoercedInt,
    CoercedFloat,
    CoercedBool,
)

# Import resolve_timeframe for date resolution
from constants import resolve_timeframe


class DashboardParams(BaseParamsModel):
    """
    Pydantic model for /dashboard endpoint params.

    Replicates normalize_params() behavior exactly for cache key parity.
    """

    # === Time Filter ===
    timeframe: Optional[str] = Field(
        default=None,
        description="Timeframe preset (M3, M6, Y1, Y3, Y5, all)"
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
        description="Months in period (for annualization)"
    )

    # === Location Filters ===
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

    # === Property Filters ===
    bedrooms: WrapList = Field(
        default=None,
        validation_alias='bedroom',
        description="Bedroom filter"
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
    tenures: Optional[List[str]] = Field(
        default=None,
        description="Tenure filter (after normalization)"
    )
    project: Optional[str] = Field(
        default=None,
        description="Project name filter (partial match)"
    )
    project_exact: Optional[str] = Field(
        default=None,
        alias='projectExact',
        description="Project name filter (exact match)"
    )

    # === Value Range Filters ===
    psf_min: CoercedFloat = Field(
        default=None,
        alias='psfMin',
        description="Minimum PSF filter"
    )
    psf_max: CoercedFloat = Field(
        default=None,
        alias='psfMax',
        description="Maximum PSF filter"
    )
    size_min: CoercedFloat = Field(
        default=None,
        alias='sizeMin',
        description="Minimum sqft filter"
    )
    size_max: CoercedFloat = Field(
        default=None,
        alias='sizeMax',
        description="Maximum sqft filter"
    )

    # === Property Age Filters ===
    property_age_min: CoercedInt = Field(
        default=None,
        alias='propertyAgeMin',
        description="Minimum property age in years"
    )
    property_age_max: CoercedInt = Field(
        default=None,
        alias='propertyAgeMax',
        description="Maximum property age in years"
    )
    property_age_bucket: Optional[str] = Field(
        default=None,
        alias='propertyAgeBucket',
        description="Property age bucket filter"
    )

    # === Panel Selection ===
    panels: CommaList = Field(
        default=None,
        description="Comma-separated panels to return"
    )

    # === Display Options ===
    time_grain: Optional[str] = Field(
        default='month',
        alias='timeGrain',
        description="Time granularity for time_series panel"
    )
    location_grain: Optional[str] = Field(
        default='region',
        alias='locationGrain',
        description="Location granularity for volume_by_location panel"
    )
    histogram_bins: CoercedInt = Field(
        default=20,
        alias='histogramBins',
        description="Number of bins for price histogram"
    )
    show_full_range: CoercedBool = Field(
        default=False,
        alias='showFullRange',
        description="Show full date range in time_series"
    )

    # === Caching ===
    skip_cache: CoercedBool = Field(
        default=False,
        alias='skipCache',
        description="Bypass cache if true"
    )

    @model_validator(mode='after')
    def apply_normalizations(self) -> 'DashboardParams':
        """Apply domain-specific normalizations."""
        self._resolve_timeframe()
        self._normalize_date_bounds()
        self._align_month_boundaries()
        self._singular_to_plural()
        self._derive_sale_type_db()
        return self

    def _derive_sale_type_db(self) -> None:
        """Derive sale_type_db from sale_type for DB queries."""
        if self.sale_type and not self.sale_type_db:
            object.__setattr__(self, 'sale_type_db', derive_sale_type_db(self.sale_type))

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

    def _singular_to_plural(self) -> None:
        """Convert singular params to plural lists and clear singular."""
        if self.tenure and not self.tenures:
            object.__setattr__(self, 'tenures', [self.tenure])
            object.__setattr__(self, 'tenure', None)
