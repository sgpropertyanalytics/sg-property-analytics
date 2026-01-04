"""
Pydantic models for Deal Checker endpoints.

Endpoints:
- deal-checker/multi-scope
- deal-checker/project-names
"""

from typing import Optional, List

from pydantic import Field, model_validator

from api.contracts.contract_schema import BaseParamsModel
from .types import CoercedInt, CoercedFloat


class DealCheckerMultiScopeParams(BaseParamsModel):
    """Params for /deal-checker/multi-scope."""

    project_name: Optional[str] = Field(
        default=None,
        description="Name of the project"
    )
    bedroom: Optional[CoercedInt] = Field(
        default=None,
        description="Bedroom count (1-5, where 5 means 5+)"
    )
    price: Optional[CoercedFloat] = Field(
        default=None,
        description="Buyer's price paid"
    )
    sqft: Optional[CoercedFloat] = Field(
        default=None,
        description="Unit size in sqft"
    )

    # Normalized field (bedroom -> bedrooms)
    bedrooms: Optional[List[int]] = Field(
        default=None,
        description="Bedroom as list (normalized)"
    )

    @model_validator(mode='after')
    def normalize_bedroom(self) -> 'DealCheckerMultiScopeParams':
        """Convert bedroom to bedrooms list."""
        if self.bedroom is not None and self.bedrooms is None:
            object.__setattr__(self, 'bedrooms', [self.bedroom])
            object.__setattr__(self, 'bedroom', None)
        return self


class ProjectNamesParams(BaseParamsModel):
    """Params for /deal-checker/project-names. No params needed."""
    pass
