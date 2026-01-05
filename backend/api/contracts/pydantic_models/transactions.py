"""
Pydantic models for /transactions/* endpoint params and responses.

Covers:
- /transactions/price-growth
- /transactions/price-growth/segments
"""

from datetime import date, timedelta
from typing import Optional, List, Any, Dict

from pydantic import BaseModel, ConfigDict, Field, model_validator

from api.contracts.contract_schema import BaseParamsModel
from .types import (
    IntList,
    DistrictList,
    CoercedDate,
    CoercedInt,
)

# Import resolve_timeframe for date resolution
from constants import resolve_timeframe


# =============================================================================
# RESPONSE MODELS (for serialization)
# =============================================================================

class PriceGrowthItem(BaseModel):
    """
    Response model for a single price growth transaction.

    Serializes backend snake_case to frontend camelCase via Field aliases.
    """
    model_config = ConfigDict(
        populate_by_name=True,
    )

    # Map: backend id → frontend transactionId
    transaction_id: int = Field(alias='transactionId', validation_alias='id')
    # Map: backend project_name → frontend project
    project: str = Field(alias='project', validation_alias='project_name')
    bedroom_count: int = Field(alias='bedroomCount')
    floor_level: str = Field(alias='floorLevel')
    transaction_date: str = Field(alias='transactionDate')
    psf: Optional[float] = Field(default=None)
    txn_sequence: int = Field(alias='txnSequence')
    cumulative_growth_pct: Optional[float] = Field(default=None, alias='cumulativeGrowthPct')
    incremental_growth_pct: Optional[float] = Field(default=None, alias='incrementalGrowthPct')
    days_since_previous: Optional[int] = Field(default=None, alias='daysSincePrevious', validation_alias='days_since_prev')
    annualized_growth_pct: Optional[float] = Field(default=None, alias='annualizedGrowthPct')


class PriceGrowthPagination(BaseModel):
    """Pagination metadata for price growth response."""
    model_config = ConfigDict(populate_by_name=True)

    page: int
    per_page: int = Field(alias='perPage')
    total_records: int = Field(alias='totalRecords', validation_alias='total_count')
    total_pages: int = Field(alias='totalPages')
    has_next: bool = Field(alias='hasNext')
    has_prev: bool = Field(alias='hasPrev')


class PriceGrowthResponse(BaseModel):
    """
    Full response model for /transactions/price-growth.

    Use: PriceGrowthResponse.from_service(service_result).model_dump(by_alias=True)
    """
    model_config = ConfigDict(populate_by_name=True)

    data: List[PriceGrowthItem]
    meta: PriceGrowthPagination
    filters_applied: Dict[str, Any] = Field(alias='filtersApplied')

    @classmethod
    def from_service(cls, service_result: Dict[str, Any]) -> 'PriceGrowthResponse':
        """Factory method to create response from service result."""
        return cls(
            data=[PriceGrowthItem.model_validate(row) for row in service_result['data']],
            meta=PriceGrowthPagination.model_validate(service_result['pagination']),
            filters_applied=service_result['filters_applied'],
        )


class SegmentSummaryItem(BaseModel):
    """
    Response model for a single segment summary row.

    Serializes backend snake_case to frontend camelCase via Field aliases.
    """
    model_config = ConfigDict(populate_by_name=True)

    # Map: backend project_name → frontend project
    project: str = Field(alias='project', validation_alias='project_name')
    bedroom_count: int = Field(alias='bedroomCount')
    floor_level: str = Field(alias='floorLevel')
    # Map: backend total_transactions → frontend transactionCount
    transaction_count: int = Field(alias='transactionCount', validation_alias='total_transactions')
    avg_cumulative_growth_pct: Optional[float] = Field(
        default=None, alias='avgCumulativeGrowthPct', validation_alias='avg_cumulative_growth'
    )
    avg_incremental_growth_pct: Optional[float] = Field(
        default=None, alias='avgIncrementalGrowthPct', validation_alias='avg_incremental_growth'
    )
    avg_days_between_txn: Optional[int] = Field(
        default=None, alias='avgDaysBetweenTxn'
    )
    min_cumulative_growth_pct: Optional[float] = Field(
        default=None, alias='minCumulativeGrowthPct', validation_alias='min_cumulative_growth'
    )
    max_cumulative_growth_pct: Optional[float] = Field(
        default=None, alias='maxCumulativeGrowthPct', validation_alias='max_cumulative_growth'
    )


class SegmentSummaryResponse(BaseModel):
    """
    Full response model for /transactions/price-growth/segments.

    Use: SegmentSummaryResponse.from_service(segments).model_dump(by_alias=True)
    """
    model_config = ConfigDict(populate_by_name=True)

    data: List[SegmentSummaryItem]

    @classmethod
    def from_service(cls, segments: List[Dict[str, Any]]) -> 'SegmentSummaryResponse':
        """Factory method to create response from service result."""
        return cls(
            data=[SegmentSummaryItem.model_validate(row) for row in segments],
        )


# =============================================================================
# REQUEST PARAM MODELS
# =============================================================================


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
    # sale_type normalized to DB format by BaseParamsModel validator
    sale_type: Optional[str] = Field(
        default=None,
        alias='saleType',
        description="Sale type filter (normalized to DB format)"
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
    # sale_type normalized to DB format by BaseParamsModel validator
    sale_type: Optional[str] = Field(
        default=None,
        alias='saleType',
        description="Sale type filter (normalized to DB format)"
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
