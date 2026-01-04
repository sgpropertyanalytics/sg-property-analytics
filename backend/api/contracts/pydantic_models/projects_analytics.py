"""
Pydantic models for /projects/* analytics endpoints.

Endpoints:
- projects/inventory
- projects/price-bands
- projects/resale-projects
- projects/exit-queue
"""

from typing import Optional

from pydantic import Field

from .base import BaseParamsModel
from .types import CoercedInt, CoercedFloat


class ProjectInventoryParams(BaseParamsModel):
    """Params for /projects/<project_name>/inventory."""

    project_name: Optional[str] = Field(
        default=None,
        description="Project name from URL path"
    )


class ProjectPriceBandsParams(BaseParamsModel):
    """Params for /projects/<project_name>/price-bands."""

    project_name: Optional[str] = Field(
        default=None,
        description="Project name from URL path"
    )
    window_months: CoercedInt = Field(
        default=24,
        description="Analysis window in months (6-60)"
    )
    unit_psf: CoercedFloat = Field(
        default=None,
        description="User's unit PSF for verdict calculation"
    )


class ResaleProjectsParams(BaseParamsModel):
    """Params for /projects/resale-projects. No params needed."""
    pass


class ProjectExitQueueParams(BaseParamsModel):
    """Params for /projects/<project_name>/exit-queue."""

    project_name: Optional[str] = Field(
        default=None,
        description="Project name from URL path"
    )
