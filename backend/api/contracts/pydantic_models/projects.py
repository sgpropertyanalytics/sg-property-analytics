"""
Pydantic models for /projects/* endpoints.

Endpoints:
- projects/locations
- projects/hot
- projects/inventory-status
"""

from typing import Optional

from pydantic import Field

from .base import BaseParamsModel
from .types import DistrictList, WrapList, CoercedInt, CoercedBool


class ProjectsLocationsParams(BaseParamsModel):
    """Params for /projects/locations."""

    status: Optional[str] = Field(
        default=None,
        description="Geocode status"
    )
    districts: DistrictList = Field(
        default=None,
        validation_alias='district',
        description="Comma-separated districts"
    )
    segment: Optional[str] = Field(
        default=None,
        description="Market segment filter"
    )
    has_school: Optional[str] = Field(
        default=None,
        description="true/false"
    )
    search: Optional[str] = Field(
        default=None,
        description="Project name search"
    )
    limit: CoercedInt = Field(
        default=100,
        description="Max results"
    )
    offset: CoercedInt = Field(
        default=0,
        description="Pagination offset"
    )


class ProjectsHotParams(BaseParamsModel):
    """Params for /projects/hot."""

    market_segment: Optional[str] = Field(
        default=None,
        alias='region',
        description="Market segment filter"
    )
    districts: DistrictList = Field(
        default=None,
        validation_alias='district',
        description="Comma-separated districts"
    )
    bedrooms: WrapList = Field(
        default=None,
        validation_alias='bedroom',
        description="Bedroom count"
    )
    price_min: Optional[str] = Field(
        default=None,
        description="Minimum median price"
    )
    price_max: Optional[str] = Field(
        default=None,
        description="Maximum median price"
    )
    limit: CoercedInt = Field(
        default=100,
        description="Max results"
    )


class ProjectsInventoryStatusParams(BaseParamsModel):
    """Params for /projects/inventory/status. No params needed."""
    pass
