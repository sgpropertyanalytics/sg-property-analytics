"""
Base Pydantic model for all API param schemas.

Key features:
- frozen=True: Immutable after normalization (prevents downstream mutation)
- populate_by_name=True: Accept both alias and field name
- extra='ignore': Ignore undeclared fields (safe)
- sale_type normalized to DB format at boundary
"""

from pydantic import BaseModel, ConfigDict, field_validator


# API to DB mapping for sale_type normalization
# Invariant: After validation, sale_type is ALWAYS in DB format (or None)
SALE_TYPE_TO_DB = {
    'new_sale': 'New Sale',
    'resale': 'Resale',
    'sub_sale': 'Sub Sale',
}


class BaseParamsModel(BaseModel):
    """
    Base model for all API param schemas.

    All param models inherit from this to ensure consistent behavior:
    - Frozen after creation (immutable)
    - Whitespace stripped from strings
    - Both alias and field name accepted
    - Unknown fields ignored
    - sale_type normalized to DB format at boundary (not API format)

    Invariant: Inside backend (after validation), sale_type is always
    in DB format ("New Sale", "Resale", "Sub Sale") or None.
    API format is only for input + output serialization.
    """
    model_config = ConfigDict(
        frozen=True,  # Immutable after normalization
        str_strip_whitespace=True,  # Strip whitespace from strings
        populate_by_name=True,  # Accept both alias and field name
        extra='ignore',  # Ignore undeclared fields
    )

    @field_validator('sale_type', mode='before', check_fields=False)
    @classmethod
    def normalize_sale_type_to_db(cls, v):
        """Normalize sale_type to DB format at validation boundary.

        Accepts: 'new_sale', 'resale', 'sub_sale', 'all', or already-normalized DB values.
        Returns: DB format ('New Sale', 'Resale', 'Sub Sale') or None.
        """
        if v is None:
            return None
        if isinstance(v, str):
            key = v.strip()
            if key == '' or key.lower() == 'all':
                return None
            # Accept API token -> convert to DB format
            if key in SALE_TYPE_TO_DB:
                return SALE_TYPE_TO_DB[key]
            # Already DB format -> pass through
            if key in SALE_TYPE_TO_DB.values():
                return key
        return v
