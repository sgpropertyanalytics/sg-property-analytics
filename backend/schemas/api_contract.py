"""
API Contract Schema v2 - Single Source of Truth

Defines the stable API interface between backend and frontend.
- Enums: lowercase snake_case (new_sale, resale, sub_sale)
- Response fields: camelCase (projectName, bedroomCount)
- Supports dual-mode output for backwards compatibility during migration
"""

from typing import Any, Dict, Optional

API_CONTRACT_VERSION = 'v2'


# =============================================================================
# ENUM VALUES (lowercase snake_case)
# =============================================================================

class SaleType:
    """Sale type enum values for API responses."""
    NEW_SALE = 'new_sale'
    RESALE = 'resale'
    SUB_SALE = 'sub_sale'

    ALL = [NEW_SALE, RESALE, SUB_SALE]

    # Mapping from DB values to API enum values
    DB_TO_API = {
        'New Sale': NEW_SALE,
        'Resale': RESALE,
        'Sub Sale': SUB_SALE,
    }

    # Reverse mapping from API enum values to DB values
    API_TO_DB = {v: k for k, v in DB_TO_API.items()}

    @classmethod
    def from_db(cls, db_value: Optional[str]) -> Optional[str]:
        """Convert DB sale_type to API enum value."""
        if db_value is None:
            return None
        return cls.DB_TO_API.get(db_value, db_value)

    @classmethod
    def to_db(cls, api_value: Optional[str]) -> Optional[str]:
        """Convert API sale_type enum to DB value."""
        if api_value is None:
            return None
        return cls.API_TO_DB.get(api_value, api_value)

    @classmethod
    def is_valid(cls, value: str) -> bool:
        """Check if value is a valid API enum."""
        return value in cls.ALL


class Tenure:
    """Tenure type enum values for API responses."""
    FREEHOLD = 'freehold'
    LEASEHOLD_99 = '99_year'
    LEASEHOLD_999 = '999_year'

    ALL = [FREEHOLD, LEASEHOLD_99, LEASEHOLD_999]

    DB_TO_API = {
        'Freehold': FREEHOLD,
        '99-year': LEASEHOLD_99,
        '999-year': LEASEHOLD_999,
    }

    API_TO_DB = {v: k for k, v in DB_TO_API.items()}

    @classmethod
    def from_db(cls, db_value: Optional[str]) -> Optional[str]:
        """Convert DB tenure to API enum value."""
        if db_value is None:
            return None
        return cls.DB_TO_API.get(db_value, db_value)

    @classmethod
    def to_db(cls, api_value: Optional[str]) -> Optional[str]:
        """Convert API tenure enum to DB value."""
        if api_value is None:
            return None
        return cls.API_TO_DB.get(api_value, api_value)


class Region:
    """Region enum values for API responses."""
    CCR = 'ccr'
    RCR = 'rcr'
    OCR = 'ocr'

    ALL = [CCR, RCR, OCR]

    DB_TO_API = {
        'CCR': CCR,
        'RCR': RCR,
        'OCR': OCR,
    }

    API_TO_DB = {v: k for k, v in DB_TO_API.items()}

    @classmethod
    def from_db(cls, db_value: Optional[str]) -> Optional[str]:
        """Convert DB region to API enum value."""
        if db_value is None:
            return None
        return cls.DB_TO_API.get(db_value, db_value)


class FloorLevel:
    """Floor level enum values for API responses."""
    LOW = 'low'
    MID_LOW = 'mid_low'
    MID = 'mid'
    MID_HIGH = 'mid_high'
    HIGH = 'high'
    LUXURY = 'luxury'
    UNKNOWN = 'unknown'

    ALL = [LOW, MID_LOW, MID, MID_HIGH, HIGH, LUXURY]

    DB_TO_API = {
        'Low': LOW,
        'Mid-Low': MID_LOW,
        'Mid': MID,
        'Mid-High': MID_HIGH,
        'High': HIGH,
        'Luxury': LUXURY,
        'Unknown': UNKNOWN,
    }

    @classmethod
    def from_db(cls, db_value: Optional[str]) -> Optional[str]:
        """Convert DB floor_level to API enum value."""
        if db_value is None:
            return None
        return cls.DB_TO_API.get(db_value, db_value.lower().replace('-', '_') if db_value else None)


# =============================================================================
# RESPONSE FIELD NAMES (camelCase)
# =============================================================================

class TransactionFields:
    """API response field names for transaction data."""
    ID = 'id'
    PROJECT_NAME = 'projectName'
    DISTRICT = 'district'
    BEDROOM_COUNT = 'bedroomCount'
    TRANSACTION_DATE = 'transactionDate'
    PRICE = 'price'
    AREA_SQFT = 'areaSqft'
    PSF = 'psf'
    SALE_TYPE = 'saleType'
    TENURE = 'tenure'
    FLOOR_LEVEL = 'floorLevel'
    REMAINING_LEASE = 'remainingLease'
    MARKET_SEGMENT = 'marketSegment'
    STREET_NAME = 'streetName'
    FLOOR_RANGE = 'floorRange'


# =============================================================================
# SERIALIZERS
# =============================================================================

def serialize_transaction(txn, include_deprecated: bool = True) -> Dict[str, Any]:
    """Convert DB Transaction to API v2 schema.

    Args:
        txn: Transaction ORM object
        include_deprecated: If True, include old snake_case fields for backwards compat

    Returns:
        dict with camelCase keys and enum values
    """
    # Format transaction_date as ISO string
    txn_date = None
    if txn.transaction_date:
        if hasattr(txn.transaction_date, 'isoformat'):
            txn_date = txn.transaction_date.isoformat()
        else:
            txn_date = str(txn.transaction_date)

    result = {
        # New v2 fields (camelCase + enum values)
        TransactionFields.ID: txn.id,
        TransactionFields.PROJECT_NAME: txn.project_name,
        TransactionFields.DISTRICT: txn.district,
        TransactionFields.BEDROOM_COUNT: txn.bedroom_count,
        TransactionFields.TRANSACTION_DATE: txn_date,
        TransactionFields.PRICE: txn.price,
        TransactionFields.AREA_SQFT: txn.area_sqft,
        TransactionFields.PSF: txn.psf,
        TransactionFields.SALE_TYPE: SaleType.from_db(txn.sale_type),
        TransactionFields.TENURE: Tenure.from_db(txn.tenure),
        TransactionFields.FLOOR_LEVEL: FloorLevel.from_db(getattr(txn, 'floor_level', None)),
        TransactionFields.REMAINING_LEASE: getattr(txn, 'remaining_lease', None),
        TransactionFields.MARKET_SEGMENT: Region.from_db(getattr(txn, 'market_segment', None)),
        TransactionFields.STREET_NAME: getattr(txn, 'street_name', None),
        TransactionFields.FLOOR_RANGE: getattr(txn, 'floor_range', None),
    }

    if include_deprecated:
        # DEPRECATED: Old snake_case fields for backwards compatibility
        # Remove after frontend migration complete
        result.update({
            'project_name': txn.project_name,
            'bedroom_count': txn.bedroom_count,
            'transaction_date': txn_date,
            'area_sqft': txn.area_sqft,
            'sale_type': txn.sale_type,  # Old DB value (e.g., 'New Sale')
            'floor_level': getattr(txn, 'floor_level', None),  # Old DB value
            'remaining_lease': getattr(txn, 'remaining_lease', None),
            'market_segment': getattr(txn, 'market_segment', None),  # Old format
            'street_name': getattr(txn, 'street_name', None),
            'floor_range': getattr(txn, 'floor_range', None),
        })

    return result


def serialize_transaction_teaser(txn, include_deprecated: bool = True) -> Dict[str, Any]:
    """Convert DB Transaction to API v2 schema with masked/teaser values.

    Used for free tier where sensitive data is hidden.

    Args:
        txn: Transaction ORM object
        include_deprecated: If True, include old snake_case fields for backwards compat

    Returns:
        dict with masked sensitive fields
    """
    txn_date = None
    if txn.transaction_date:
        if hasattr(txn.transaction_date, 'isoformat'):
            txn_date = txn.transaction_date.isoformat()
        else:
            txn_date = str(txn.transaction_date)

    result = {
        # New v2 fields (camelCase + enum values)
        TransactionFields.ID: txn.id,
        TransactionFields.PROJECT_NAME: None,  # Masked
        TransactionFields.DISTRICT: txn.district,
        TransactionFields.BEDROOM_COUNT: txn.bedroom_count,
        TransactionFields.TRANSACTION_DATE: txn_date,
        TransactionFields.PRICE: None,  # Masked
        TransactionFields.AREA_SQFT: None,  # Masked
        TransactionFields.PSF: None,  # Masked
        TransactionFields.SALE_TYPE: SaleType.from_db(txn.sale_type),
        TransactionFields.TENURE: Tenure.from_db(txn.tenure),
        TransactionFields.FLOOR_LEVEL: FloorLevel.from_db(getattr(txn, 'floor_level', None)),
        TransactionFields.REMAINING_LEASE: getattr(txn, 'remaining_lease', None),
        # Masked versions for display
        'projectNameMasked': f"{txn.district} Condo",
        'priceMasked': _mask_price(txn.price),
        'areaSqftMasked': _mask_area(txn.area_sqft),
        'psfMasked': _mask_psf(txn.psf),
    }

    if include_deprecated:
        # DEPRECATED: Old snake_case fields
        result.update({
            'project_name': None,
            'project_name_masked': f"{txn.district} Condo",
            'bedroom_count': txn.bedroom_count,
            'transaction_date': txn_date,
            'area_sqft': None,
            'area_sqft_masked': _mask_area(txn.area_sqft),
            'price': None,
            'price_masked': _mask_price(txn.price),
            'psf': None,
            'psf_masked': _mask_psf(txn.psf),
            'sale_type': txn.sale_type,
            'floor_level': getattr(txn, 'floor_level', None),
            'remaining_lease': getattr(txn, 'remaining_lease', None),
        })

    return result


def _mask_price(price: Optional[float]) -> Optional[str]:
    """Mask price to a range."""
    if price is None:
        return None
    if price < 1_000_000:
        return "<$1M"
    elif price < 2_000_000:
        return "$1M - $2M"
    elif price < 3_000_000:
        return "$2M - $3M"
    elif price < 5_000_000:
        return "$3M - $5M"
    else:
        return ">$5M"


def _mask_area(area: Optional[float]) -> Optional[str]:
    """Mask area to approximate value."""
    if area is None:
        return None
    rounded = round(area / 100) * 100
    return f"~{int(rounded)} sqft"


def _mask_psf(psf: Optional[float]) -> Optional[str]:
    """Mask PSF to a range."""
    if psf is None:
        return None
    if psf < 1500:
        return "<$1,500"
    elif psf < 2000:
        return "$1,500 - $2,000"
    elif psf < 2500:
        return "$2,000 - $2,500"
    elif psf < 3000:
        return "$2,500 - $3,000"
    else:
        return ">$3,000"


# =============================================================================
# FILTER PARAMETER PARSING
# =============================================================================

def parse_filter_params(request_args: dict) -> Dict[str, Any]:
    """Parse and validate filter parameters, accepting both v1 and v2 formats.

    Args:
        request_args: Flask request.args dict

    Returns:
        dict with normalized parameter values for DB queries
    """
    params = {}

    # Sale type: accept both saleType (v2) and sale_type (v1)
    sale_type = request_args.get('saleType') or request_args.get('sale_type')
    if sale_type:
        # If it's a v2 enum, convert to DB value
        if sale_type in SaleType.ALL:
            params['sale_type_db'] = SaleType.to_db(sale_type)
        else:
            # Assume v1 DB value (backwards compat) - also handle case-insensitive
            params['sale_type_db'] = sale_type

    # Tenure: accept both tenure (v2 enum) and tenure (v1 DB value)
    tenure = request_args.get('tenure')
    if tenure:
        if tenure in Tenure.ALL:
            params['tenure_db'] = Tenure.to_db(tenure)
        else:
            params['tenure_db'] = tenure

    # Region/segment: accept both region (v2) and segment (v1)
    region = request_args.get('region') or request_args.get('segment')
    if region:
        # Handle both lowercase enum and uppercase DB value
        region_upper = region.upper()
        if region_upper in ['CCR', 'RCR', 'OCR']:
            params['segment_db'] = region_upper
        else:
            params['segment_db'] = region

    return params
