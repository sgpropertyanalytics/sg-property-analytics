"""
Base Pydantic model for all API param schemas.

Key features:
- frozen=True: Immutable after normalization (prevents downstream mutation)
- populate_by_name=True: Accept both alias and field name
- extra='ignore': Ignore undeclared fields (safe)
- sale_type, tenure, floor_level normalized to DB format at boundary
"""

from pydantic import BaseModel, ConfigDict, field_validator


# =============================================================================
# DB FORMAT CONSTANTS (use these directly in SQL queries)
# =============================================================================

# Sale type DB values
DB_SALE_TYPE_NEW = 'New Sale'
DB_SALE_TYPE_RESALE = 'Resale'
DB_SALE_TYPE_SUB = 'Sub Sale'

# Tenure DB values
DB_TENURE_FREEHOLD = 'Freehold'
DB_TENURE_99_YEAR = '99-year'
DB_TENURE_999_YEAR = '999-year'

# Floor level DB values
DB_FLOOR_LOW = 'Low'
DB_FLOOR_MID_LOW = 'Mid-Low'
DB_FLOOR_MID = 'Mid'
DB_FLOOR_MID_HIGH = 'Mid-High'
DB_FLOOR_HIGH = 'High'
DB_FLOOR_LUXURY = 'Luxury'
DB_FLOOR_UNKNOWN = 'Unknown'

# =============================================================================
# API to DB mappings for boundary normalization
# Invariant: After validation, these fields are ALWAYS in DB format (or None)
# =============================================================================

SALE_TYPE_TO_DB = {
    'new_sale': DB_SALE_TYPE_NEW,
    'resale': DB_SALE_TYPE_RESALE,
    'sub_sale': DB_SALE_TYPE_SUB,
}

TENURE_TO_DB = {
    'freehold': DB_TENURE_FREEHOLD,
    '99_year': DB_TENURE_99_YEAR,
    '999_year': DB_TENURE_999_YEAR,
}

FLOOR_LEVEL_TO_DB = {
    'low': DB_FLOOR_LOW,
    'mid_low': DB_FLOOR_MID_LOW,
    'mid': DB_FLOOR_MID,
    'mid_high': DB_FLOOR_MID_HIGH,
    'high': DB_FLOOR_HIGH,
    'luxury': DB_FLOOR_LUXURY,
    'unknown': DB_FLOOR_UNKNOWN,
}


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
        Raises: ValueError for invalid values.
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
            # Invalid value - reject at boundary
            valid = list(SALE_TYPE_TO_DB.keys()) + list(SALE_TYPE_TO_DB.values()) + ['all']
            raise ValueError(f"Invalid sale_type: {v!r}. Valid values: {valid}")
        raise ValueError(f"sale_type must be a string, got {type(v).__name__}")

    @field_validator('tenure', mode='before', check_fields=False)
    @classmethod
    def normalize_tenure_to_db(cls, v):
        """Normalize tenure to DB format at validation boundary.

        Accepts: 'freehold', '99_year', '999_year', or already-normalized DB values.
        Returns: DB format ('Freehold', '99-year', '999-year') or None.
        Raises: ValueError for invalid values.
        """
        if v is None:
            return None
        if isinstance(v, str):
            key = v.strip()
            if key == '' or key.lower() == 'all':
                return None
            if key in TENURE_TO_DB:
                return TENURE_TO_DB[key]
            if key in TENURE_TO_DB.values():
                return key
            # Invalid value - reject at boundary
            valid = list(TENURE_TO_DB.keys()) + list(TENURE_TO_DB.values()) + ['all']
            raise ValueError(f"Invalid tenure: {v!r}. Valid values: {valid}")
        raise ValueError(f"tenure must be a string, got {type(v).__name__}")

    @field_validator('floor_level', mode='before', check_fields=False)
    @classmethod
    def normalize_floor_level_to_db(cls, v):
        """Normalize floor_level to DB format at validation boundary.

        Accepts: 'low', 'mid_low', 'mid', etc., or already-normalized DB values.
        Returns: DB format ('Low', 'Mid-Low', 'Mid', etc.) or None.
        Raises: ValueError for invalid values.
        """
        if v is None:
            return None
        if isinstance(v, str):
            key = v.strip()
            if key == '' or key.lower() == 'all':
                return None
            if key in FLOOR_LEVEL_TO_DB:
                return FLOOR_LEVEL_TO_DB[key]
            if key in FLOOR_LEVEL_TO_DB.values():
                return key
            # Invalid value - reject at boundary
            valid = list(FLOOR_LEVEL_TO_DB.keys()) + list(FLOOR_LEVEL_TO_DB.values()) + ['all']
            raise ValueError(f"Invalid floor_level: {v!r}. Valid values: {valid}")
        raise ValueError(f"floor_level must be a string, got {type(v).__name__}")
