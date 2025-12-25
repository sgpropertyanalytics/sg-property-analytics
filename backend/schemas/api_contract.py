"""
API Contract Schema v2 - Single Source of Truth

Defines the stable API interface between backend and frontend.
- Enums: lowercase snake_case (new_sale, resale, sub_sale)
- Response fields: camelCase (projectName, bedroomCount)
- Supports dual-mode output for backwards compatibility during migration
"""

from typing import Any, Dict, Optional
from datetime import datetime

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
        - date_from: Python date object (not string)
        - date_to: Python date object (not string)
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

    # Date range - parse to Python date objects (not strings)
    date_from = request_args.get('date_from')
    date_to = request_args.get('date_to')
    if date_from:
        try:
            params['date_from'] = datetime.strptime(date_from, "%Y-%m-%d").date()
        except ValueError:
            pass  # Invalid format, skip
    if date_to:
        try:
            params['date_to'] = datetime.strptime(date_to, "%Y-%m-%d").date()
        except ValueError:
            pass  # Invalid format, skip

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
    # Time dimension fields (unified)
    PERIOD = 'period'               # Unified time bucket (v2 canonical)
    PERIOD_GRAIN = 'periodGrain'    # Time granularity: 'year', 'quarter', 'month'
    # Legacy time fields (v1 compatibility)
    MONTH = 'month'
    QUARTER = 'quarter'
    YEAR = 'year'

    # Dimension fields
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


# Time field keys for normalization
TIME_BUCKET_FIELDS = ('month', 'quarter', 'year')


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
    - Time buckets (month, quarter, year) → unified 'period' + 'periodGrain' fields

    Args:
        row: Dict from SQL query result
        include_deprecated: If True, include old snake_case fields

    Returns:
        Transformed dict with v2 schema
    """
    result = {}

    # First pass: detect time bucket field and extract period value
    period_value = None
    period_grain = None
    for time_field in TIME_BUCKET_FIELDS:
        if time_field in row and row[time_field] is not None:
            period_value = row[time_field]
            period_grain = time_field
            break

    # Add unified period fields if time data exists
    if period_value is not None:
        result[AggregateFields.PERIOD] = period_value
        result[AggregateFields.PERIOD_GRAIN] = period_grain

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
        elif key in TIME_BUCKET_FIELDS:
            # Keep legacy time fields for backwards compatibility
            if include_deprecated:
                result[key] = value
        else:
            # Pass through unchanged (district, project, count)
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


# =============================================================================
# DASHBOARD PANEL SERIALIZATION
# =============================================================================

class DashboardFields:
    """Field names for dashboard API response (camelCase for v2)."""
    # Time series / aggregate fields
    PERIOD = 'period'
    COUNT = 'count'
    AVG_PSF = 'avgPsf'              # v1: avg_psf
    MEDIAN_PSF = 'medianPsf'        # v1: median_psf
    TOTAL_VALUE = 'totalValue'      # v1: total_value
    AVG_PRICE = 'avgPrice'          # v1: avg_price

    # Location fields
    LOCATION = 'location'

    # Bedroom mix fields
    BEDROOM_COUNT = 'bedroomCount'  # v1: bedroom
    SALE_TYPE = 'saleType'          # v1: sale_type

    # Summary fields
    TOTAL_COUNT = 'totalCount'      # v1: total_count
    MEDIAN_PRICE = 'medianPrice'    # v1: median_price
    DATE_MIN = 'dateMin'            # v1: date_min
    DATE_MAX = 'dateMax'            # v1: date_max
    PSF_RANGE = 'psfRange'          # v1: psf_range
    PRICE_RANGE = 'priceRange'      # v1: price_range


def serialize_time_series_panel(data: list, include_deprecated: bool = True) -> list:
    """Serialize time_series panel data to v2 schema.

    v1 format: { period, count, avg_psf, median_psf, total_value, avg_price }
    v2 format: { period, count, avgPsf, medianPsf, totalValue, avgPrice }
    """
    result = []
    for row in data:
        v2_row = {
            DashboardFields.PERIOD: row.get('period'),
            DashboardFields.COUNT: row.get('count'),
            DashboardFields.AVG_PSF: row.get('avg_psf'),
            DashboardFields.MEDIAN_PSF: row.get('median_psf'),
            DashboardFields.TOTAL_VALUE: row.get('total_value'),
            DashboardFields.AVG_PRICE: row.get('avg_price'),
        }
        if include_deprecated:
            v2_row.update({
                'avg_psf': row.get('avg_psf'),
                'median_psf': row.get('median_psf'),
                'total_value': row.get('total_value'),
                'avg_price': row.get('avg_price'),
            })
        result.append(v2_row)
    return result


def serialize_volume_by_location_panel(data: list, include_deprecated: bool = True) -> list:
    """Serialize volume_by_location panel data to v2 schema.

    v1 format: { location, count, total_value, avg_psf }
    v2 format: { location, count, totalValue, avgPsf }
    """
    result = []
    for row in data:
        v2_row = {
            DashboardFields.LOCATION: row.get('location'),
            DashboardFields.COUNT: row.get('count'),
            DashboardFields.TOTAL_VALUE: row.get('total_value'),
            DashboardFields.AVG_PSF: row.get('avg_psf'),
        }
        if include_deprecated:
            v2_row.update({
                'total_value': row.get('total_value'),
                'avg_psf': row.get('avg_psf'),
            })
        result.append(v2_row)
    return result


def serialize_price_histogram_panel(data: dict, include_deprecated: bool = True) -> dict:
    """Serialize price_histogram panel data to v2 schema.

    Histogram structure is complex - keep bins as-is, transform stats fields.
    """
    if not data or 'error' in data:
        return data

    result = {
        'bins': data.get('bins', []),
        'percentiles': data.get('percentiles', {}),
    }

    # Transform stats if present
    stats = data.get('stats', {})
    if stats:
        result['stats'] = {
            DashboardFields.AVG_PSF: stats.get('avg_psf'),
            DashboardFields.COUNT: stats.get('count'),
        }
        if include_deprecated:
            result['stats']['avg_psf'] = stats.get('avg_psf')
            result['stats']['count'] = stats.get('count')

    # Pass through other fields
    for key in ['range', 'effective_range', 'excluded_tail_count']:
        if key in data:
            result[key] = data[key]

    return result


def serialize_bedroom_mix_panel(data: list, include_deprecated: bool = True) -> list:
    """Serialize bedroom_mix panel data to v2 schema.

    v1 format: { period, bedroom, sale_type, count }
    v2 format: { period, bedroomCount, saleType, count }

    sale_type is transformed to lowercase enum (New Sale → new_sale)
    """
    result = []
    for row in data:
        sale_type_v2 = SaleType.from_db(row.get('sale_type'))
        v2_row = {
            DashboardFields.PERIOD: row.get('period'),
            DashboardFields.BEDROOM_COUNT: row.get('bedroom'),
            DashboardFields.SALE_TYPE: sale_type_v2,
            DashboardFields.COUNT: row.get('count'),
        }
        if include_deprecated:
            v2_row.update({
                'bedroom': row.get('bedroom'),
                'sale_type': row.get('sale_type'),  # Original DB value
            })
        result.append(v2_row)
    return result


def serialize_sale_type_breakdown_panel(data: list, include_deprecated: bool = True) -> list:
    """Serialize sale_type_breakdown panel data to v2 schema.

    v1 format: { period, sale_type, count, total_value }
    v2 format: { period, saleType, count, totalValue }

    sale_type is transformed to lowercase enum (New Sale → new_sale)
    """
    result = []
    for row in data:
        sale_type_v2 = SaleType.from_db(row.get('sale_type'))
        v2_row = {
            DashboardFields.PERIOD: row.get('period'),
            DashboardFields.SALE_TYPE: sale_type_v2,
            DashboardFields.COUNT: row.get('count'),
            DashboardFields.TOTAL_VALUE: row.get('total_value'),
        }
        if include_deprecated:
            v2_row.update({
                'sale_type': row.get('sale_type'),  # Original DB value
                'total_value': row.get('total_value'),
            })
        result.append(v2_row)
    return result


def serialize_summary_panel(data: dict, include_deprecated: bool = True) -> dict:
    """Serialize summary panel data to v2 schema.

    v1 format: { total_count, avg_psf, median_psf, avg_price, median_price,
                 total_value, date_min, date_max, psf_range, price_range }
    v2 format: { totalCount, avgPsf, medianPsf, avgPrice, medianPrice,
                 totalValue, dateMin, dateMax, psfRange, priceRange }
    """
    if not data or 'error' in data:
        return data

    result = {
        DashboardFields.TOTAL_COUNT: data.get('total_count', 0),
        DashboardFields.AVG_PSF: data.get('avg_psf'),
        DashboardFields.MEDIAN_PSF: data.get('median_psf'),
        DashboardFields.AVG_PRICE: data.get('avg_price'),
        DashboardFields.MEDIAN_PRICE: data.get('median_price'),
        DashboardFields.TOTAL_VALUE: data.get('total_value', 0),
        DashboardFields.DATE_MIN: data.get('date_min'),
        DashboardFields.DATE_MAX: data.get('date_max'),
        DashboardFields.PSF_RANGE: data.get('psf_range'),
        DashboardFields.PRICE_RANGE: data.get('price_range'),
    }

    if include_deprecated:
        result.update({
            'total_count': data.get('total_count', 0),
            'avg_psf': data.get('avg_psf'),
            'median_psf': data.get('median_psf'),
            'avg_price': data.get('avg_price'),
            'median_price': data.get('median_price'),
            'total_value': data.get('total_value', 0),
            'date_min': data.get('date_min'),
            'date_max': data.get('date_max'),
            'psf_range': data.get('psf_range'),
            'price_range': data.get('price_range'),
        })

    return result


# Panel serializer registry
_DASHBOARD_PANEL_SERIALIZERS = {
    'time_series': serialize_time_series_panel,
    'volume_by_location': serialize_volume_by_location_panel,
    'price_histogram': serialize_price_histogram_panel,
    'bedroom_mix': serialize_bedroom_mix_panel,
    'sale_type_breakdown': serialize_sale_type_breakdown_panel,
    'summary': serialize_summary_panel,
}


def serialize_dashboard_panel(panel_name: str, data: Any, include_deprecated: bool = True) -> Any:
    """Serialize a single dashboard panel to v2 schema.

    Args:
        panel_name: Name of the panel (e.g., 'time_series', 'summary')
        data: Raw panel data from dashboard service
        include_deprecated: If True, include v1 snake_case fields

    Returns:
        Serialized panel data
    """
    serializer = _DASHBOARD_PANEL_SERIALIZERS.get(panel_name)
    if serializer:
        return serializer(data, include_deprecated=include_deprecated)
    # Unknown panel - return as-is
    return data


def serialize_dashboard_response(
    data: Dict[str, Any],
    meta: Dict[str, Any],
    include_deprecated: bool = True
) -> Dict[str, Any]:
    """Serialize full dashboard response to v2 schema.

    Args:
        data: Dict of panel_name → panel_data
        meta: Metadata dict from dashboard service
        include_deprecated: If True, include v1 snake_case fields

    Returns:
        Complete response dict with serialized panels and meta
    """
    serialized_data = {}
    for panel_name, panel_data in data.items():
        if panel_data is None or (isinstance(panel_data, dict) and 'error' in panel_data):
            serialized_data[panel_name] = panel_data
        else:
            serialized_data[panel_name] = serialize_dashboard_panel(
                panel_name, panel_data, include_deprecated=include_deprecated
            )

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
# EXIT QUEUE SERIALIZATION
# =============================================================================

class ExitQueueFields:
    """Field names for exit queue API response (camelCase for v2)."""
    # Top-level
    PROJECT_NAME = 'projectName'
    DATA_QUALITY = 'dataQuality'
    FUNDAMENTALS = 'fundamentals'
    RESALE_METRICS = 'resaleMetrics'
    RISK_ASSESSMENT = 'riskAssessment'
    GATING_FLAGS = 'gatingFlags'

    # Data Quality
    HAS_TOP_YEAR = 'hasTopYear'
    HAS_TOTAL_UNITS = 'hasTotalUnits'
    COMPLETENESS = 'completeness'
    SAMPLE_WINDOW_MONTHS = 'sampleWindowMonths'
    WARNINGS = 'warnings'

    # Fundamentals
    TOTAL_UNITS = 'totalUnits'
    TOP_YEAR = 'topYear'
    PROPERTY_AGE_YEARS = 'propertyAgeYears'
    AGE_SOURCE = 'ageSource'
    TENURE = 'tenure'
    DISTRICT = 'district'
    DEVELOPER = 'developer'
    FIRST_RESALE_DATE = 'firstResaleDate'

    # Resale Metrics
    UNIQUE_RESALE_UNITS_TOTAL = 'uniqueResaleUnitsTotal'
    UNIQUE_RESALE_UNITS_12M = 'uniqueResaleUnits12m'
    TOTAL_RESALE_TRANSACTIONS = 'totalResaleTransactions'
    RESALE_MATURITY_PCT = 'resaleMaturityPct'
    ACTIVE_EXIT_PRESSURE_PCT = 'activeExitPressurePct'
    ABSORPTION_SPEED_DAYS = 'absorptionSpeedDays'
    TRANSACTIONS_PER_100_UNITS = 'transactionsPer100Units'
    RESALES_LAST_24M = 'resalesLast24m'

    # Risk Assessment
    MATURITY_ZONE = 'maturityZone'
    PRESSURE_ZONE = 'pressureZone'
    QUADRANT = 'quadrant'
    OVERALL_RISK = 'overallRisk'
    INTERPRETATION = 'interpretation'

    # Gating Flags
    IS_BOUTIQUE = 'isBoutique'
    IS_BRAND_NEW = 'isBrandNew'
    IS_ULTRA_LUXURY = 'isUltraLuxury'
    IS_THIN_DATA = 'isThinData'
    UNIT_TYPE_MIXED = 'unitTypeMixed'


class RiskZone:
    """Risk zone enum values for v2 API."""
    LOW = 'low'
    MODERATE = 'moderate'
    HIGH = 'high'
    UNKNOWN = 'unknown'

    # Mapping from internal zone colors to API enum
    COLOR_TO_API = {
        'green': LOW,
        'yellow': MODERATE,
        'red': HIGH,
        'unknown': UNKNOWN
    }

    @classmethod
    def from_color(cls, color: str) -> str:
        """Convert internal zone color to API enum."""
        return cls.COLOR_TO_API.get(color, cls.UNKNOWN)


class OverallRisk:
    """Overall risk enum values for v2 API."""
    LOW = 'low'
    MODERATE = 'moderate'
    ELEVATED = 'elevated'
    UNKNOWN = 'unknown'

    INTERNAL_TO_API = {
        'low': LOW,
        'moderate': MODERATE,
        'elevated': ELEVATED,
        'unknown': UNKNOWN
    }

    @classmethod
    def from_internal(cls, value: str) -> str:
        """Convert internal risk level to API enum."""
        return cls.INTERNAL_TO_API.get(value, cls.UNKNOWN)


class Completeness:
    """Data completeness enum values for v2 API."""
    COMPLETE = 'complete'
    PARTIAL = 'partial'
    NO_RESALES = 'no_resales'


class AgeSource:
    """Age source enum values for v2 API."""
    TOP_DATE = 'top_date'
    FIRST_RESALE = 'first_resale'
    NOT_TOPPED_YET = 'not_topped_yet'
    INSUFFICIENT_DATA = 'insufficient_data'


def serialize_exit_queue_v1(result) -> Dict[str, Any]:
    """
    Serialize ExitQueueResult to v1 schema (snake_case keys).
    This is the current production format for backwards compatibility.
    """
    return {
        "project_name": result.project_name,
        "data_quality": {
            "has_top_year": result.data_quality.has_top_year,
            "has_total_units": result.data_quality.has_total_units,
            "completeness": result.data_quality.completeness,
            "sample_window_months": result.data_quality.sample_window_months,
            "warnings": result.data_quality.warnings
        },
        "fundamentals": {
            "total_units": result.fundamentals.total_units,
            "top_year": result.fundamentals.top_year,
            "property_age_years": result.fundamentals.property_age_years,
            "age_source": result.fundamentals.age_source,
            "tenure": result.fundamentals.tenure,
            "district": result.fundamentals.district,
            "developer": result.fundamentals.developer,
            "first_resale_date": result.fundamentals.first_resale_date.isoformat() if result.fundamentals.first_resale_date else None
        },
        "resale_metrics": {
            "unique_resale_units_total": result.resale_metrics.unique_resale_units_total,
            "unique_resale_units_12m": result.resale_metrics.unique_resale_units_12m,
            "total_resale_transactions": result.resale_metrics.total_resale_transactions,
            "resale_maturity_pct": result.resale_metrics.resale_maturity_pct,
            "active_exit_pressure_pct": result.resale_metrics.active_exit_pressure_pct,
            "absorption_speed_days": result.resale_metrics.absorption_speed_days,
            "transactions_per_100_units": result.resale_metrics.transactions_per_100_units,
            "resales_last_24m": result.resale_metrics.resales_last_24m
        },
        "risk_assessment": {
            "maturity_zone": result.risk_assessment.maturity_zone,
            "pressure_zone": result.risk_assessment.pressure_zone,
            "quadrant": result.risk_assessment.quadrant,
            "overall_risk": result.risk_assessment.overall_risk,
            "interpretation": result.risk_assessment.interpretation
        },
        "gating_flags": {
            "is_boutique": result.gating_flags.is_boutique,
            "is_brand_new": result.gating_flags.is_brand_new,
            "is_ultra_luxury": result.gating_flags.is_ultra_luxury,
            "is_thin_data": result.gating_flags.is_thin_data,
            "unit_type_mixed": result.gating_flags.unit_type_mixed
        }
    }


def serialize_exit_queue_v2(result) -> Dict[str, Any]:
    """
    Serialize ExitQueueResult to v2 schema (camelCase keys + enum values).
    """
    return {
        ExitQueueFields.PROJECT_NAME: result.project_name,
        ExitQueueFields.DATA_QUALITY: {
            ExitQueueFields.HAS_TOP_YEAR: result.data_quality.has_top_year,
            ExitQueueFields.HAS_TOTAL_UNITS: result.data_quality.has_total_units,
            ExitQueueFields.COMPLETENESS: result.data_quality.completeness,
            ExitQueueFields.SAMPLE_WINDOW_MONTHS: result.data_quality.sample_window_months,
            ExitQueueFields.WARNINGS: result.data_quality.warnings
        },
        ExitQueueFields.FUNDAMENTALS: {
            ExitQueueFields.TOTAL_UNITS: result.fundamentals.total_units,
            ExitQueueFields.TOP_YEAR: result.fundamentals.top_year,
            ExitQueueFields.PROPERTY_AGE_YEARS: result.fundamentals.property_age_years,
            ExitQueueFields.AGE_SOURCE: result.fundamentals.age_source,
            ExitQueueFields.TENURE: result.fundamentals.tenure,
            ExitQueueFields.DISTRICT: result.fundamentals.district,
            ExitQueueFields.DEVELOPER: result.fundamentals.developer,
            ExitQueueFields.FIRST_RESALE_DATE: result.fundamentals.first_resale_date.isoformat() if result.fundamentals.first_resale_date else None
        },
        ExitQueueFields.RESALE_METRICS: {
            ExitQueueFields.UNIQUE_RESALE_UNITS_TOTAL: result.resale_metrics.unique_resale_units_total,
            ExitQueueFields.UNIQUE_RESALE_UNITS_12M: result.resale_metrics.unique_resale_units_12m,
            ExitQueueFields.TOTAL_RESALE_TRANSACTIONS: result.resale_metrics.total_resale_transactions,
            ExitQueueFields.RESALE_MATURITY_PCT: result.resale_metrics.resale_maturity_pct,
            ExitQueueFields.ACTIVE_EXIT_PRESSURE_PCT: result.resale_metrics.active_exit_pressure_pct,
            ExitQueueFields.ABSORPTION_SPEED_DAYS: result.resale_metrics.absorption_speed_days,
            ExitQueueFields.TRANSACTIONS_PER_100_UNITS: result.resale_metrics.transactions_per_100_units,
            ExitQueueFields.RESALES_LAST_24M: result.resale_metrics.resales_last_24m
        },
        ExitQueueFields.RISK_ASSESSMENT: {
            ExitQueueFields.MATURITY_ZONE: RiskZone.from_color(result.risk_assessment.maturity_zone),
            ExitQueueFields.PRESSURE_ZONE: RiskZone.from_color(result.risk_assessment.pressure_zone),
            ExitQueueFields.QUADRANT: result.risk_assessment.quadrant,
            ExitQueueFields.OVERALL_RISK: OverallRisk.from_internal(result.risk_assessment.overall_risk),
            ExitQueueFields.INTERPRETATION: result.risk_assessment.interpretation
        },
        ExitQueueFields.GATING_FLAGS: {
            ExitQueueFields.IS_BOUTIQUE: result.gating_flags.is_boutique,
            ExitQueueFields.IS_BRAND_NEW: result.gating_flags.is_brand_new,
            ExitQueueFields.IS_ULTRA_LUXURY: result.gating_flags.is_ultra_luxury,
            ExitQueueFields.IS_THIN_DATA: result.gating_flags.is_thin_data,
            ExitQueueFields.UNIT_TYPE_MIXED: result.gating_flags.unit_type_mixed
        }
    }


def serialize_exit_queue_dual(result, include_v2: bool = True) -> Dict[str, Any]:
    """
    Serialize ExitQueueResult with dual-mode support.
    Returns v1 schema with optional _v2 nested object for new consumers.

    Args:
        result: ExitQueueResult from exit_queue_service
        include_v2: If True, include _v2 nested object with camelCase schema
    """
    response = serialize_exit_queue_v1(result)

    if include_v2:
        response["_v2"] = serialize_exit_queue_v2(result)

    return response


# =============================================================================
# PRICE BANDS ENUMS
# =============================================================================

class DataSource:
    """Data source for price bands analysis."""
    PROJECT = 'project'
    DISTRICT_PROXY = 'district_proxy'
    SEGMENT_PROXY = 'segment_proxy'
    NONE = 'none'

    ALL = [PROJECT, DISTRICT_PROXY, SEGMENT_PROXY, NONE]


class FloorDirection:
    """Floor trend direction values for API responses."""
    RISING = 'rising'
    FLAT = 'flat'
    WEAKENING = 'weakening'
    UNKNOWN = 'unknown'

    ALL = [RISING, FLAT, WEAKENING, UNKNOWN]


class PricePosition:
    """Unit price position relative to percentile bands."""
    BELOW_FLOOR = 'below_floor'
    NEAR_FLOOR = 'near_floor'
    ABOVE_MEDIAN = 'above_median'
    PREMIUM_ZONE = 'premium_zone'

    ALL = [BELOW_FLOOR, NEAR_FLOOR, ABOVE_MEDIAN, PREMIUM_ZONE]


class VerdictBadge:
    """Verdict badge values for downside protection assessment."""
    PROTECTED = 'protected'
    WATCH = 'watch'
    EXPOSED = 'exposed'

    ALL = [PROTECTED, WATCH, EXPOSED]


# =============================================================================
# PRICE BANDS FIELD NAMES
# =============================================================================

class PriceBandsFields:
    """Field names for price bands API response (camelCase for v2)."""
    # Top-level
    PROJECT_NAME = 'projectName'
    DATA_SOURCE = 'dataSource'
    PROXY_LABEL = 'proxyLabel'
    BANDS = 'bands'
    LATEST = 'latest'
    TREND = 'trend'
    VERDICT = 'verdict'
    DATA_QUALITY = 'dataQuality'
    ERROR = 'error'

    # Band fields
    MONTH = 'month'
    COUNT = 'count'
    P25 = 'p25'
    P50 = 'p50'
    P75 = 'p75'
    P25_S = 'p25S'  # smoothed
    P50_S = 'p50S'
    P75_S = 'p75S'

    # Trend fields
    FLOOR_DIRECTION = 'floorDirection'
    FLOOR_SLOPE_PCT = 'floorSlopePct'
    OBSERVATION_MONTHS = 'observationMonths'

    # Verdict fields
    UNIT_PSF = 'unitPsf'
    POSITION = 'position'
    POSITION_LABEL = 'positionLabel'
    VS_FLOOR_PCT = 'vsFloorPct'
    BADGE = 'badge'
    BADGE_LABEL = 'badgeLabel'
    EXPLANATION = 'explanation'

    # Data quality fields
    TOTAL_TRADES = 'totalTrades'
    MONTHS_WITH_DATA = 'monthsWithData'
    IS_VALID = 'isValid'
    FALLBACK_REASON = 'fallbackReason'
    WINDOW_MONTHS = 'windowMonths'
    SMOOTHING = 'smoothing'


# =============================================================================
# PRICE BANDS SERIALIZERS
# =============================================================================

def _serialize_band_v1(band: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize a single band to v1 schema (snake_case)."""
    return {
        'month': band.get('month'),
        'count': band.get('count'),
        'p25': band.get('p25'),
        'p50': band.get('p50'),
        'p75': band.get('p75'),
        'p25_s': band.get('p25_s'),
        'p50_s': band.get('p50_s'),
        'p75_s': band.get('p75_s'),
    }


def _serialize_band_v2(band: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize a single band to v2 schema (camelCase)."""
    return {
        PriceBandsFields.MONTH: band.get('month'),
        PriceBandsFields.COUNT: band.get('count'),
        PriceBandsFields.P25: band.get('p25'),
        PriceBandsFields.P50: band.get('p50'),
        PriceBandsFields.P75: band.get('p75'),
        PriceBandsFields.P25_S: band.get('p25_s'),
        PriceBandsFields.P50_S: band.get('p50_s'),
        PriceBandsFields.P75_S: band.get('p75_s'),
    }


def _serialize_latest_v1(latest: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Serialize latest values to v1 schema."""
    if not latest:
        return None
    return {
        'month': latest.get('month'),
        'p25_s': latest.get('p25_s'),
        'p50_s': latest.get('p50_s'),
        'p75_s': latest.get('p75_s'),
    }


def _serialize_latest_v2(latest: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Serialize latest values to v2 schema."""
    if not latest:
        return None
    return {
        PriceBandsFields.MONTH: latest.get('month'),
        PriceBandsFields.P25_S: latest.get('p25_s'),
        PriceBandsFields.P50_S: latest.get('p50_s'),
        PriceBandsFields.P75_S: latest.get('p75_s'),
    }


def _serialize_trend_v1(trend: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize trend to v1 schema."""
    return {
        'floor_direction': trend.get('floor_direction'),
        'floor_slope_pct': trend.get('floor_slope_pct'),
        'observation_months': trend.get('observation_months'),
    }


def _serialize_trend_v2(trend: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize trend to v2 schema."""
    return {
        PriceBandsFields.FLOOR_DIRECTION: trend.get('floor_direction'),
        PriceBandsFields.FLOOR_SLOPE_PCT: trend.get('floor_slope_pct'),
        PriceBandsFields.OBSERVATION_MONTHS: trend.get('observation_months'),
    }


def _serialize_verdict_v1(verdict: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Serialize verdict to v1 schema."""
    if not verdict:
        return None
    return {
        'unit_psf': verdict.get('unit_psf'),
        'position': verdict.get('position'),
        'position_label': verdict.get('position_label'),
        'vs_floor_pct': verdict.get('vs_floor_pct'),
        'badge': verdict.get('badge'),
        'badge_label': verdict.get('badge_label'),
        'explanation': verdict.get('explanation'),
    }


def _serialize_verdict_v2(verdict: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Serialize verdict to v2 schema."""
    if not verdict:
        return None
    return {
        PriceBandsFields.UNIT_PSF: verdict.get('unit_psf'),
        PriceBandsFields.POSITION: verdict.get('position'),
        PriceBandsFields.POSITION_LABEL: verdict.get('position_label'),
        PriceBandsFields.VS_FLOOR_PCT: verdict.get('vs_floor_pct'),
        PriceBandsFields.BADGE: verdict.get('badge'),
        PriceBandsFields.BADGE_LABEL: verdict.get('badge_label'),
        PriceBandsFields.EXPLANATION: verdict.get('explanation'),
    }


def _serialize_data_quality_v1(dq: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize data quality to v1 schema."""
    return {
        'total_trades': dq.get('total_trades'),
        'months_with_data': dq.get('months_with_data'),
        'is_valid': dq.get('is_valid'),
        'fallback_reason': dq.get('fallback_reason'),
        'window_months': dq.get('window_months'),
        'smoothing': dq.get('smoothing'),
    }


def _serialize_data_quality_v2(dq: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize data quality to v2 schema."""
    return {
        PriceBandsFields.TOTAL_TRADES: dq.get('total_trades'),
        PriceBandsFields.MONTHS_WITH_DATA: dq.get('months_with_data'),
        PriceBandsFields.IS_VALID: dq.get('is_valid'),
        PriceBandsFields.FALLBACK_REASON: dq.get('fallback_reason'),
        PriceBandsFields.WINDOW_MONTHS: dq.get('window_months'),
        PriceBandsFields.SMOOTHING: dq.get('smoothing'),
    }


def serialize_price_bands_v1(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Serialize price bands result to v1 schema (snake_case keys).
    This is the current production format for backwards compatibility.
    """
    return {
        'project_name': result.get('project_name'),
        'data_source': result.get('data_source'),
        'proxy_label': result.get('proxy_label'),
        'bands': [_serialize_band_v1(b) for b in result.get('bands', [])],
        'latest': _serialize_latest_v1(result.get('latest')),
        'trend': _serialize_trend_v1(result.get('trend', {})),
        'verdict': _serialize_verdict_v1(result.get('verdict')),
        'data_quality': _serialize_data_quality_v1(result.get('data_quality', {})),
        'error': result.get('error'),
    }


def serialize_price_bands_v2(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Serialize price bands result to v2 schema (camelCase keys + enum values).
    """
    response = {
        PriceBandsFields.PROJECT_NAME: result.get('project_name'),
        PriceBandsFields.DATA_SOURCE: result.get('data_source'),
        PriceBandsFields.PROXY_LABEL: result.get('proxy_label'),
        PriceBandsFields.BANDS: [_serialize_band_v2(b) for b in result.get('bands', [])],
        PriceBandsFields.LATEST: _serialize_latest_v2(result.get('latest')),
        PriceBandsFields.TREND: _serialize_trend_v2(result.get('trend', {})),
        PriceBandsFields.VERDICT: _serialize_verdict_v2(result.get('verdict')),
        PriceBandsFields.DATA_QUALITY: _serialize_data_quality_v2(result.get('data_quality', {})),
    }

    # Only include error if present
    if result.get('error'):
        response[PriceBandsFields.ERROR] = result.get('error')

    return response


def serialize_price_bands_dual(
    result: Dict[str, Any],
    include_deprecated: bool = True
) -> Dict[str, Any]:
    """
    Serialize price bands result with dual-mode support.

    Args:
        result: Raw result from get_project_price_bands()
        include_deprecated: If True, include v1 snake_case fields (default True)

    Returns:
        Dict with v2 camelCase fields, and optionally v1 snake_case fields
    """
    if include_deprecated:
        # Return v1 format with _v2 nested
        response = serialize_price_bands_v1(result)
        response['_v2'] = serialize_price_bands_v2(result)
        response['apiContractVersion'] = API_CONTRACT_VERSION
        return response
    else:
        # Strict v2 only
        response = serialize_price_bands_v2(result)
        response['apiContractVersion'] = API_CONTRACT_VERSION
        return response
