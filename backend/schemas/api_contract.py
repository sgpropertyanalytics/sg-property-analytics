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

    Canonicalizes all filter inputs at the API boundary.
    Use the returned values for DB queries.

    Args:
        request_args: Flask request.args dict

    Returns:
        dict with normalized parameter values for DB queries:
        - sale_type_db: DB-format sale type (e.g., 'New Sale')
        - tenure_db: DB-format tenure (e.g., '99-year')
        - segment_db: uppercase region (e.g., 'CCR')
        - districts: list of normalized districts (e.g., ['D01', 'D02'])
        - bedrooms: list of integers (e.g., [2, 3])
        - date_from: date string (YYYY-MM-DD)
        - date_to: date string (YYYY-MM-DD)
        - psf_min, psf_max: floats
        - size_min, size_max: floats
        - project: string (partial match)
        - project_exact: string (exact match)
    """
    params = {}

    # Sale type: accept both saleType (v2) and sale_type (v1)
    sale_type = request_args.get('saleType') or request_args.get('sale_type')
    if sale_type:
        # If it's a v2 enum, convert to DB value
        if sale_type in SaleType.ALL:
            params['sale_type_db'] = SaleType.to_db(sale_type)
        else:
            # Assume v1 DB value (backwards compat)
            params['sale_type_db'] = sale_type

    # Tenure: accept both tenure (v2 enum) and tenure (v1 DB value)
    tenure = request_args.get('tenure')
    if tenure:
        if tenure in Tenure.ALL:
            params['tenure_db'] = Tenure.to_db(tenure)
        else:
            params['tenure_db'] = tenure

    # Region/segment: accept both region (v2) and segment (v1)
    # Supports comma-separated values (e.g., "CCR,RCR" or "ccr,rcr")
    region = request_args.get('region') or request_args.get('segment')
    if region:
        segments = [s.strip().upper() for s in region.split(',') if s.strip()]
        valid_segments = [s for s in segments if s in ['CCR', 'RCR', 'OCR']]
        if valid_segments:
            params['segments_db'] = valid_segments

    # District: normalize format to DXX
    district = request_args.get('district')
    if district:
        districts = [d.strip().upper() for d in district.split(',') if d.strip()]
        normalized = []
        for d in districts:
            if not d.startswith('D'):
                d = f"D{d.zfill(2)}"
            normalized.append(d)
        if normalized:
            params['districts'] = normalized

    # Bedroom: parse comma-separated integers
    bedroom = request_args.get('bedroom')
    if bedroom:
        try:
            bedrooms = [int(b.strip()) for b in bedroom.split(',') if b.strip()]
            if bedrooms:
                params['bedrooms'] = bedrooms
        except ValueError:
            pass

    # Date range
    date_from = request_args.get('date_from')
    date_to = request_args.get('date_to')
    if date_from:
        params['date_from'] = date_from
    if date_to:
        params['date_to'] = date_to

    # PSF range
    psf_min = request_args.get('psf_min')
    psf_max = request_args.get('psf_max')
    if psf_min:
        try:
            params['psf_min'] = float(psf_min)
        except ValueError:
            pass
    if psf_max:
        try:
            params['psf_max'] = float(psf_max)
        except ValueError:
            pass

    # Size range
    size_min = request_args.get('size_min')
    size_max = request_args.get('size_max')
    if size_min:
        try:
            params['size_min'] = float(size_min)
        except ValueError:
            pass
    if size_max:
        try:
            params['size_max'] = float(size_max)
        except ValueError:
            pass

    # Project filter
    project = request_args.get('project')
    project_exact = request_args.get('project_exact')
    if project_exact:
        params['project_exact'] = project_exact
    elif project:
        params['project'] = project

    return params


# =============================================================================
# AGGREGATE RESPONSE SERIALIZATION
# =============================================================================

class AggregateFields:
    """Field names for aggregate API responses (camelCase for v2)."""
    # Dimension fields
    MONTH = 'month'
    QUARTER = 'quarter'
    YEAR = 'year'
    DISTRICT = 'district'
    BEDROOM_COUNT = 'bedroomCount'  # v1: bedroom
    SALE_TYPE = 'saleType'          # v1: sale_type
    PROJECT = 'project'
    REGION = 'region'
    FLOOR_LEVEL = 'floorLevel'      # v1: floor_level

    # Metric fields (snake_case OK - they're computed, not DB columns)
    COUNT = 'count'
    AVG_PSF = 'avgPsf'              # v1: avg_psf
    MEDIAN_PSF = 'medianPsf'        # v1: median_psf
    TOTAL_VALUE = 'totalValue'      # v1: total_value
    AVG_PRICE = 'avgPrice'          # v1: avg_price
    MEDIAN_PRICE = 'medianPrice'    # v1: median_price
    MIN_PSF = 'minPsf'              # v1: min_psf
    MAX_PSF = 'maxPsf'              # v1: max_psf
    PSF_25TH = 'psf25th'            # v1: psf_25th
    PSF_75TH = 'psf75th'            # v1: psf_75th
    PRICE_25TH = 'price25th'        # v1: price_25th
    PRICE_75TH = 'price75th'        # v1: price_75th


# Mapping from v1 snake_case to v2 camelCase for aggregate fields
_AGGREGATE_FIELD_MAP = {
    # Dimension fields
    'bedroom': AggregateFields.BEDROOM_COUNT,
    'sale_type': AggregateFields.SALE_TYPE,
    'floor_level': AggregateFields.FLOOR_LEVEL,
    # Metric fields
    'avg_psf': AggregateFields.AVG_PSF,
    'median_psf': AggregateFields.MEDIAN_PSF,
    'total_value': AggregateFields.TOTAL_VALUE,
    'avg_price': AggregateFields.AVG_PRICE,
    'median_price': AggregateFields.MEDIAN_PRICE,
    'min_psf': AggregateFields.MIN_PSF,
    'max_psf': AggregateFields.MAX_PSF,
    'psf_25th': AggregateFields.PSF_25TH,
    'psf_75th': AggregateFields.PSF_75TH,
    'price_25th': AggregateFields.PRICE_25TH,
    'price_75th': AggregateFields.PRICE_75TH,
}


def serialize_aggregate_row(row: Dict[str, Any], include_deprecated: bool = True) -> Dict[str, Any]:
    """Serialize a single aggregate result row to API v2 schema.

    Converts:
    - sale_type values to lowercase enums (New Sale → new_sale)
    - floor_level values to lowercase enums (Mid-High → mid_high)
    - region values to lowercase (CCR → ccr)
    - Field names to camelCase (avg_psf → avgPsf)

    Args:
        row: Dict from SQL query result
        include_deprecated: If True, include old snake_case fields

    Returns:
        Transformed dict with v2 schema
    """
    result = {}

    for key, value in row.items():
        # Transform enum values
        if key == 'sale_type' and value:
            v2_value = SaleType.from_db(value)
            result[AggregateFields.SALE_TYPE] = v2_value
            if include_deprecated:
                result['sale_type'] = value  # Keep old format
        elif key == 'floor_level' and value:
            v2_value = FloorLevel.from_db(value)
            result[AggregateFields.FLOOR_LEVEL] = v2_value
            if include_deprecated:
                result['floor_level'] = value
        elif key == 'region' and value:
            v2_value = value.lower() if isinstance(value, str) else value
            result[AggregateFields.REGION] = v2_value
            if include_deprecated:
                result['region'] = value  # Keep uppercase
        elif key == 'bedroom':
            result[AggregateFields.BEDROOM_COUNT] = value
            if include_deprecated:
                result['bedroom'] = value
        elif key in _AGGREGATE_FIELD_MAP:
            # Convert snake_case metric to camelCase
            v2_key = _AGGREGATE_FIELD_MAP[key]
            result[v2_key] = value
            if include_deprecated:
                result[key] = value
        else:
            # Pass through unchanged (month, quarter, year, district, project, count)
            result[key] = value

    return result


def serialize_aggregate_response(
    data: list,
    meta: Dict[str, Any],
    include_deprecated: bool = True
) -> Dict[str, Any]:
    """Serialize full aggregate response to API v2 schema.

    Args:
        data: List of aggregate result rows
        meta: Metadata dict
        include_deprecated: If True, include old snake_case fields

    Returns:
        Complete response dict with serialized data and meta
    """
    serialized_data = [
        serialize_aggregate_row(row, include_deprecated=include_deprecated)
        for row in data
    ]

    # Add API contract version to meta
    meta_v2 = {
        **meta,
        'apiContractVersion': API_CONTRACT_VERSION,
    }

    return {
        'data': serialized_data,
        'meta': meta_v2,
    }


# =============================================================================
# FILTER OPTIONS SERIALIZATION
# =============================================================================

class FilterOptionsFields:
    """Field names for filter-options API response (camelCase for v2)."""
    DISTRICTS = 'districts'
    REGIONS = 'regions'
    BEDROOMS = 'bedrooms'
    SALE_TYPES = 'saleTypes'          # v1: sale_types
    PROJECTS = 'projects'
    DATE_RANGE = 'dateRange'          # v1: date_range
    PSF_RANGE = 'psfRange'            # v1: psf_range
    SIZE_RANGE = 'sizeRange'          # v1: size_range
    TENURES = 'tenures'
    MARKET_SEGMENTS = 'marketSegments'


class Bedroom:
    """Bedroom enum values for API responses."""
    ONE = 1
    TWO = 2
    THREE = 3
    FOUR = 4
    FIVE_PLUS = '5_plus'

    @classmethod
    def from_db(cls, db_value: Optional[int]) -> Any:
        """Convert DB bedroom count to API value."""
        if db_value is None:
            return None
        if db_value >= 5:
            return cls.FIVE_PLUS
        return db_value

    @classmethod
    def get_label(cls, value: Any) -> str:
        """Get display label for bedroom value."""
        if value == cls.FIVE_PLUS:
            return '5+'
        return str(value)


def _make_option(value: Any, label: str) -> Dict[str, Any]:
    """Create a {value, label} option object."""
    return {'value': value, 'label': label}


def serialize_filter_options(
    districts: list,
    regions: dict,
    bedrooms: list,
    sale_types: list,
    projects: list,
    date_range: dict,
    psf_range: dict,
    size_range: dict,
    tenures: list,
    include_deprecated: bool = True
) -> Dict[str, Any]:
    """Serialize filter options to API v2 schema.

    v2 Response Shape:
    Each option is returned as { value, label } where:
    - value = stable enum/identifier (used by logic)
    - label = UI display text only

    Args:
        districts: List of district codes
        regions: Dict of region → districts mapping
        bedrooms: List of bedroom counts (integers)
        sale_types: List of DB sale type values
        projects: List of project names
        date_range: Dict with min/max dates
        psf_range: Dict with min/max PSF
        size_range: Dict with min/max size
        tenures: List of DB tenure values
        include_deprecated: If True, include old snake_case fields

    Returns:
        Serialized filter options dict with {value, label} objects
    """
    # === Build v2 options as {value, label} objects ===

    # Sale types: DB value → {value: enum, label: display}
    sale_types_v2 = []
    for st in sale_types:
        if st:
            enum_val = SaleType.from_db(st)
            sale_types_v2.append(_make_option(enum_val, st))  # label = original DB value

    # Tenures: DB value → {value: enum, label: display}
    tenures_v2 = []
    for t in tenures:
        if t:
            enum_val = Tenure.from_db(t)
            tenures_v2.append(_make_option(enum_val, t))  # label = original DB value (e.g., "99-year")

    # Regions: uppercase → {value: lowercase, label: uppercase}
    regions_v2 = []
    for region_key in ['CCR', 'RCR', 'OCR']:
        if region_key in regions:
            regions_v2.append(_make_option(region_key.lower(), region_key))

    # Districts: {value: code, label: code}
    districts_v2 = [_make_option(d, d) for d in districts if d]

    # Bedrooms: int → {value: int or '5_plus', label: '1', '2', ... '5+'}
    bedrooms_v2 = []
    for br in bedrooms:
        if br is not None:
            enum_val = Bedroom.from_db(br)
            label = Bedroom.get_label(enum_val)
            bedrooms_v2.append(_make_option(enum_val, label))

    # Market segments (same as regions for now)
    market_segments_v2 = regions_v2.copy()

    # Build v2 response
    result = {
        FilterOptionsFields.SALE_TYPES: sale_types_v2,
        FilterOptionsFields.TENURES: tenures_v2,
        FilterOptionsFields.REGIONS: regions_v2,
        FilterOptionsFields.DISTRICTS: districts_v2,
        FilterOptionsFields.BEDROOMS: bedrooms_v2,
        FilterOptionsFields.MARKET_SEGMENTS: market_segments_v2,
        FilterOptionsFields.PROJECTS: projects,
        FilterOptionsFields.DATE_RANGE: date_range,
        FilterOptionsFields.PSF_RANGE: psf_range,
        FilterOptionsFields.SIZE_RANGE: size_range,
        'apiContractVersion': API_CONTRACT_VERSION,
    }

    if include_deprecated:
        # DEPRECATED: v1 snake_case fields with raw values (for backwards compat)
        # TODO: Remove in Phase 1c after frontend migration complete
        result.update({
            'sale_types': sale_types,          # Raw DB values ['New Sale', 'Resale']
            'tenures': tenures,                # Raw DB values ['Freehold', '99-year']
            'districts': districts,            # Raw list ['D01', 'D02', ...]
            'bedrooms': bedrooms,              # Raw integers [1, 2, 3, 4, 5]
            'regions_legacy': regions,         # Original dict format {CCR: [...], RCR: [...]}
            'date_range': date_range,
            'psf_range': psf_range,
            'size_range': size_range,
        })

    return result
