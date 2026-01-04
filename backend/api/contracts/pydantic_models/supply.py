"""
Pydantic model for /supply/* endpoints.

Endpoints:
- supply/summary
"""

from typing import Optional

from pydantic import Field

from api.contracts.contract_schema import BaseParamsModel
from .types import CoercedInt, CoercedBool


class SupplySummaryParams(BaseParamsModel):
    """Params for /supply/summary."""

    include_gls: CoercedBool = Field(
        default=True,
        alias='includeGls',
        description="Include GLS pipeline in totals"
    )
    launch_year: CoercedInt = Field(
        default=2026,
        alias='launchYear',
        description="Year filter for upcoming launches (2020-2035)"
    )
