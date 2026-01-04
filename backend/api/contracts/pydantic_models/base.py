"""
Base Pydantic model for all API param schemas.

Key features:
- frozen=True: Immutable after normalization (prevents downstream mutation)
- populate_by_name=True: Accept both alias and field name
- extra='ignore': Ignore undeclared fields (safe)
- sale_type, tenure, floor_level normalized to DB format at boundary
"""

from pydantic import BaseModel, ConfigDict, field_validator

from constants import (
    normalize_sale_type_api,
    normalize_tenure_api,
    normalize_floor_level_api,
)


class BaseParamsModel(BaseModel):
    """
    Base model for all API param schemas.

    All param models inherit from this to ensure consistent behavior:
    - Frozen after creation (immutable)
    - Whitespace stripped from strings
    - Both alias and field name accepted
    - Unknown fields ignored
    - sale_type, tenure, floor_level normalized to DB format at boundary

    Invariant: Inside backend (after validation), these fields are always
    in DB format or None. API format is only for input + output serialization.
    """
    model_config = ConfigDict(
        frozen=True,
        str_strip_whitespace=True,
        populate_by_name=True,
        extra='ignore',
    )

    @field_validator('sale_type', mode='before', check_fields=False)
    @classmethod
    def normalize_sale_type_to_db(cls, v):
        return normalize_sale_type_api(v)

    @field_validator('tenure', mode='before', check_fields=False)
    @classmethod
    def normalize_tenure_to_db(cls, v):
        return normalize_tenure_api(v)

    @field_validator('floor_level', mode='before', check_fields=False)
    @classmethod
    def normalize_floor_level_to_db(cls, v):
        return normalize_floor_level_api(v)
