"""
Pydantic models for /gls/* endpoints.

Endpoints:
- gls/all
- gls/needs-review
"""

from typing import Optional

from pydantic import Field

from .base import BaseParamsModel
from .types import CoercedInt


class GlsAllParams(BaseParamsModel):
    """Params for /gls/all."""

    market_segment: Optional[str] = Field(
        default=None,
        description="Filter by market segment (CCR, RCR, OCR)"
    )
    status: Optional[str] = Field(
        default=None,
        description="Filter by tender status (launched, awarded)"
    )
    planning_area: Optional[str] = Field(
        default=None,
        description="Filter by planning area (partial match)"
    )
    limit: CoercedInt = Field(
        default=100,
        description="Max results to return"
    )
    sort: Optional[str] = Field(
        default="release_date",
        description="Field to sort by"
    )
    order: Optional[str] = Field(
        default="desc",
        description="Sort order (asc, desc)"
    )


class GlsNeedsReviewParams(BaseParamsModel):
    """Params for /gls/needs-review. No params needed."""
    pass
