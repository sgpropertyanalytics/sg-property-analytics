"""
Pydantic model for /aggregate endpoint params.

This model replicates the exact normalization logic from normalize.py to ensure
cache key parity between old and new validation systems.

Key features:
- Timeframe resolution to date bounds (via model_validator)
- District normalization (9 -> D09)
- Singular to plural conversion (bedroom -> bedrooms)
- Alias support (saleType -> sale_type)
"""

from datetime import date, timedelta
from typing import Optional, List, Literal

from pydantic import Field, model_validator

from api.contracts.contract_schema import BaseParamsModel
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


# Valid timeframe values (canonical + legacy)
TimeframeType = Literal[
    'M3', 'M6', 'Y1', 'Y3', 'Y5', 'all',
    '3m', '6m', '12m', '1y', '2y', '3y', '5y'
]


class AggregateParams(BaseParamsModel):
    """
    Pydantic model for /aggregate endpoint params.

    Replicates normalize_params() behavior exactly for cache key parity.

    Usage:
        params = AggregateParams(**raw_params)
        normalized = params.model_dump()
    """

    # === Grouping and Metrics ===
    group_by: CommaList = Field(
        default=['month'],
        validation_alias='groupBy',
        description="Comma-separated grouping dimensions"
    )
    metrics: CommaList = Field(
        default=['count', 'avg_psf'],
        description="Comma-separated metrics"
    )

    # === Filters (singular input, becomes plural after validation) ===
    # Note: We accept 'district' via alias but normalize to 'districts'
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

    # Region is alias for segment
    region: Optional[str] = Field(
        default=None,
        description="Alias for segment filter"
    )

    # Sale type (normalized to DB format by BaseParamsModel validator)
    sale_type: Optional[str] = Field(
        default=None,
        alias='saleType',
        description="Sale type filter (normalized to DB format: 'New Sale', 'Resale', 'Sub Sale')"
    )

    # Tenure (singular -> plural in model_validator)
    tenure: Optional[str] = Field(
        default=None,
        description="Tenure filter (freehold, 99_year, 999_year)"
    )
    tenures: Optional[List[str]] = Field(
        default=None,
        description="Tenure filter (after normalization)"
    )

    # Project filters
    project: Optional[str] = Field(
        default=None,
        description="Project name filter (partial match)"
    )
    project_exact: Optional[str] = Field(
        default=None,
        alias='projectExact',
        description="Project name filter (exact match)"
    )

    # === Time Filter ===
    # Timeframe preset (takes precedence over explicit dates)
    timeframe: Optional[str] = Field(
        default=None,
        description="Timeframe preset (M3, M6, Y1, Y3, Y5, all)"
    )

    # Explicit dates (used when timeframe not provided)
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

    # These are computed from timeframe or date_from/date_to
    date_to_exclusive: Optional[date] = Field(
        default=None,
        description="Exclusive end date (computed)"
    )
    months_in_period: Optional[int] = Field(
        default=None,
        description="Months in period (for annualization)"
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

    # === Pagination and Caching ===
    limit: CoercedInt = Field(
        default=1000,
        description="Max rows to return"
    )
    skip_cache: CoercedBool = Field(
        default=False,
        alias='skipCache',
        description="Bypass cache if true"
    )

    @model_validator(mode='after')
    def apply_normalizations(self) -> 'AggregateParams':
        """
        Apply domain-specific normalizations.

        Order matters - replicates normalize.py exactly:
        1. Resolve timeframe to date bounds
        2. Convert date_to to date_to_exclusive
        3. Align to month boundaries
        4. Singular to plural conversions
        5. Handle region -> segments alias
        """
        # Use object.__setattr__ since model is frozen

        # 1. Resolve timeframe to date bounds
        self._resolve_timeframe()

        # 2. Convert date_to to date_to_exclusive (if not already set)
        self._normalize_date_bounds()

        # 3. Align to month boundaries
        self._align_month_boundaries()

        # 4. Singular to plural: tenure -> tenures
        self._singular_to_plural()

        # 5. Region -> segments alias
        self._resolve_region_alias()

        return self

    def _resolve_timeframe(self) -> None:
        """Resolve timeframe preset to date bounds."""
        # Skip if explicit dates already provided
        if self.date_from and (self.date_to_exclusive or self.date_to):
            return

        # Get timeframe bounds
        bounds = resolve_timeframe(self.timeframe)

        if bounds['date_from'] is not None:
            object.__setattr__(self, 'date_from', bounds['date_from'])
            object.__setattr__(self, 'date_to_exclusive', bounds['date_to_exclusive'])
            object.__setattr__(self, 'months_in_period', bounds['months_in_period'])

    def _normalize_date_bounds(self) -> None:
        """Convert date_to to date_to_exclusive and clear date_to."""
        # Skip if date_to_exclusive already set
        if self.date_to_exclusive:
            # Still clear date_to to match old behavior
            if self.date_to:
                object.__setattr__(self, 'date_to', None)
            return

        if self.date_to and isinstance(self.date_to, date):
            # Add one day for exclusive upper bound
            object.__setattr__(self, 'date_to_exclusive', self.date_to + timedelta(days=1))
            # Clear date_to after conversion (matches old normalize_params behavior)
            object.__setattr__(self, 'date_to', None)

    def _align_month_boundaries(self) -> None:
        """Align dates to month boundaries for URA data."""
        # Align date_from to 1st of month
        if self.date_from and isinstance(self.date_from, date):
            aligned = date(self.date_from.year, self.date_from.month, 1)
            if aligned != self.date_from:
                object.__setattr__(self, 'date_from', aligned)

        # Align date_to_exclusive to 1st of next month if not on 1st
        if self.date_to_exclusive and isinstance(self.date_to_exclusive, date):
            if self.date_to_exclusive.day != 1:
                if self.date_to_exclusive.month == 12:
                    aligned = date(self.date_to_exclusive.year + 1, 1, 1)
                else:
                    aligned = date(self.date_to_exclusive.year, self.date_to_exclusive.month + 1, 1)
                object.__setattr__(self, 'date_to_exclusive', aligned)

    def _singular_to_plural(self) -> None:
        """Convert singular params to plural lists and clear singular."""
        # tenure -> tenures (then clear tenure to match old behavior)
        if self.tenure and not self.tenures:
            object.__setattr__(self, 'tenures', [self.tenure])
            object.__setattr__(self, 'tenure', None)

    def _resolve_region_alias(self) -> None:
        """Region alias handling - kept for compatibility but not converted.

        Note: Old normalize_params does NOT convert region to segments.
        Region is passed through as-is. SQL handles it directly.
        """
        # Don't convert - old behavior passes region through unchanged
        pass
