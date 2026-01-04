"""
Pydantic models for /upcoming-launches/* endpoints.

Endpoints:
- upcoming-launches/all
- upcoming-launches/needs-review
"""

from typing import Optional

from pydantic import Field

from api.contracts.contract_schema import BaseParamsModel
from .types import CoercedInt


class UpcomingLaunchesAllParams(BaseParamsModel):
    """Params for /upcoming-launches/all."""

    market_segment: Optional[str] = Field(
        default=None,
        description="Filter by market segment (CCR, RCR, OCR)"
    )
    district: Optional[str] = Field(
        default=None,
        description="Filter by district"
    )
    launch_year: CoercedInt = Field(
        default=None,
        description="Filter by launch year"
    )
    needs_review: Optional[str] = Field(
        default=None,
        description="true/false for review items"
    )
    limit: CoercedInt = Field(
        default=100,
        description="Max results"
    )
    sort: Optional[str] = Field(
        default="project_name",
        description="Field to sort by"
    )
    order: Optional[str] = Field(
        default="asc",
        description="Sort order (asc, desc)"
    )


class UpcomingNeedsReviewParams(BaseParamsModel):
    """Params for /upcoming-launches/needs-review. No params needed."""
    pass
