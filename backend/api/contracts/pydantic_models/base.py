"""
Base Pydantic model for all API param schemas.

Key features:
- frozen=True: Immutable after normalization (prevents downstream mutation)
- populate_by_name=True: Accept both alias and field name
- extra='ignore': Ignore undeclared fields (safe)
- sale_type auto-normalization: Derives sale_type_db from sale_type
"""

from typing import Optional
from pydantic import BaseModel, ConfigDict


# API to DB mapping for sale_type normalization
SALE_TYPE_API_TO_DB = {
    'new_sale': 'New Sale',
    'resale': 'Resale',
    'sub_sale': 'Sub Sale',
}


def derive_sale_type_db(sale_type: Optional[str]) -> Optional[str]:
    """Convert API sale_type value to DB value."""
    if sale_type is None:
        return None
    return SALE_TYPE_API_TO_DB.get(sale_type, sale_type)


class BaseParamsModel(BaseModel):
    """
    Base model for all API param schemas.

    All param models inherit from this to ensure consistent behavior:
    - Frozen after creation (immutable)
    - Whitespace stripped from strings
    - Both alias and field name accepted
    - Unknown fields ignored
    - sale_type_db auto-derived from sale_type

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
