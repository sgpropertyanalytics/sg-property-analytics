"""
Base Pydantic model for all API param schemas.

Key features:
- frozen=True: Immutable after normalization (prevents downstream mutation)
- populate_by_name=True: Accept both alias and field name
- extra='ignore': Ignore undeclared fields (safe)
"""

from pydantic import BaseModel, ConfigDict


class BaseParamsModel(BaseModel):
    """
    Base model for all API param schemas.

    All param models inherit from this to ensure consistent behavior:
    - Frozen after creation (immutable)
    - Whitespace stripped from strings
    - Both alias and field name accepted
    - Unknown fields ignored

    Example:
        class AggregateParams(BaseParamsModel):
            sale_type: str | None = Field(None, alias='saleType')

        # Both work:
        AggregateParams(sale_type='Resale')
        AggregateParams(saleType='Resale')
    """
    model_config = ConfigDict(
        frozen=True,  # Immutable after normalization
        str_strip_whitespace=True,  # Strip whitespace from strings
        populate_by_name=True,  # Accept both alias and field name
        extra='ignore',  # Ignore undeclared fields
    )
