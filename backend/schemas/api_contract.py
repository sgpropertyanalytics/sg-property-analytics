"""
API Contract Schema v3 - Single Source of Truth

Defines the stable API interface between backend and frontend.
- Enums: lowercase snake_case (new_sale, resale, sub_sale)
- Response fields: camelCase (projectName, bedroomCount)
 - v2+ response fields only (camelCase)

Version History:
- v1: Legacy snake_case fields only
- v2: Added camelCase fields, enum normalization
- v3: Stabilization release - no breaking changes, version flag for deprecation safety
"""

from typing import Any, Dict, Optional
from datetime import datetime
from utils.normalize import ValidationError

# =============================================================================
# API CONTRACT VERSIONING
# =============================================================================

import os

API_CONTRACT_VERSION_V1 = "v1"
API_CONTRACT_VERSION_V2 = "v2"
API_CONTRACT_VERSION_V3 = "v3"

SUPPORTED_API_CONTRACT_VERSIONS = {
    API_CONTRACT_VERSION_V1,
    API_CONTRACT_VERSION_V2,
    API_CONTRACT_VERSION_V3,
}

# Current version emitted in all API responses
# Can be overridden via env var for emergency rollback
_DEFAULT_CONTRACT_VERSION = API_CONTRACT_VERSION_V3
CURRENT_API_CONTRACT_VERSION = os.environ.get(
    'API_CONTRACT_VERSION_OVERRIDE',
    _DEFAULT_CONTRACT_VERSION
)

# Backwards compatibility alias
API_CONTRACT_VERSION = CURRENT_API_CONTRACT_VERSION

# HTTP Header name for contract version (debugging via Network tab)
API_CONTRACT_HEADER = 'X-API-Contract-Version'

# =============================================================================
# CONTRACT SCHEMA HASHES
# =============================================================================
# Stable signature strings per endpoint family for instant debugging.
# When something breaks, you know immediately if the shape changed.

CONTRACT_SCHEMA_HASHES = {
    'aggregate': 'agg:v3:period|periodGrain|saleType|count|totalValue|medianPsf',
    'transactions': 'txn:v3:projectName|district|bedroomCount|price|psf|saleType',
    'dashboard': 'dash:v3:timeSeries|volumeByLocation|priceHistogram|summary',
    'filter_options': 'fopt:v3:saleTypes|tenures|regions|districts|bedrooms',
    'price_bands': 'pb:v3:bands|latest|trend|verdict|dataQuality',
    'exit_queue': 'eq:v3:fundamentals|resaleMetrics|riskAssessment|gatingFlags',
    'psf_by_price_band': 'psfpb:v3:priceBand|bedroom|p25|p50|p75|observationCount|suppressed',
}


def get_schema_hash(endpoint_family: str) -> str:
    """Get the schema hash for an endpoint family."""
    return CONTRACT_SCHEMA_HASHES.get(endpoint_family, f'{endpoint_family}:v3:unknown')


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
    API_TO_DB = {v: k for k, v in DB_TO_API.items()}

    @classmethod
    def from_db(cls, db_value: Optional[str]) -> Optional[str]:
        """Convert DB floor_level to API enum value."""
        if db_value is None:
            return None
        return cls.DB_TO_API.get(db_value, db_value.lower().replace('-', '_') if db_value else None)

    @classmethod
    def to_db(cls, api_value: Optional[str]) -> Optional[str]:
        """Convert API floor_level enum to DB value."""
        if api_value is None:
            return None
        return cls.API_TO_DB.get(api_value, api_value)


class PropertyAgeBucket:
    """
    Property age bucket enum values for API responses.

    Age calculation: floor(EXTRACT(YEAR FROM transaction_date) - lease_start_year)
    This is "lease age" (years since lease commencement), NOT building age.

    IMPORTANT:
    - Age boundaries use exclusive upper bounds: [min, max)

    Buckets:
    - new_sale: Project has 0 resale transactions (market state, not age)
    - recently_top: 4-8 years since lease start (first resales happening)
    - young_resale: 8-15 years since lease start
    - resale: 15-25 years since lease start
    - mature_resale: 25+ years since lease start
    - freehold: Freehold properties (no lease)
    """
    NEW_SALE = 'new_sale'
    RECENTLY_TOP = 'recently_top'
    YOUNG_RESALE = 'young_resale'
    RESALE = 'resale'
    MATURE_RESALE = 'mature_resale'
    FREEHOLD = 'freehold'

    ALL = [NEW_SALE, RECENTLY_TOP, YOUNG_RESALE, RESALE, MATURE_RESALE, FREEHOLD]

    LABELS = {
        NEW_SALE: 'New Sale (No Resales Yet)',
        RECENTLY_TOP: 'Recently TOP (4-7 years)',
        YOUNG_RESALE: 'Young Resale (8-14 years)',
        RESALE: 'Resale (15-24 years)',
        MATURE_RESALE: 'Mature Resale (25+ years)',
        FREEHOLD: 'Freehold',
    }

    LABELS_SHORT = {
        NEW_SALE: 'New',
        RECENTLY_TOP: '4-7yr',
        YOUNG_RESALE: '8-14yr',
        RESALE: '15-24yr',
        MATURE_RESALE: '25yr+',
        FREEHOLD: 'FH',
    }

    # Age boundaries: (min_inclusive, max_exclusive)
    # None means unbounded
    AGE_RANGES = {
        RECENTLY_TOP: (4, 8),
        YOUNG_RESALE: (8, 15),
        RESALE: (15, 25),
        MATURE_RESALE: (25, None),
    }

    @classmethod
    def is_valid(cls, value: Optional[str]) -> bool:
        """Check if value is a valid PropertyAgeBucket enum."""
        return value in cls.ALL

    @classmethod
    def get_label(cls, value: str, short: bool = False) -> str:
        """Get display label for a bucket value."""
        labels = cls.LABELS_SHORT if short else cls.LABELS
        return labels.get(value, value)

    @classmethod
    def get_age_range(cls, value: str) -> Optional[tuple]:
        """
        Get age range for a bucket.

        Returns:
            Tuple of (min_inclusive, max_exclusive) or None for non-age buckets
        """
        return cls.AGE_RANGES.get(value)

    @classmethod
    def is_age_based(cls, value: str) -> bool:
        """Check if bucket is age-based (vs market-state like new_sale)."""
        return value in cls.AGE_RANGES

    @classmethod
    def classify(
        cls,
        age: Optional[int] = None,
        sale_type: Optional[str] = None,
        tenure: Optional[str] = None,
        strict: bool = False
    ) -> str:
        """
        CANONICAL classifier for property age buckets.

        This is the ONLY place age → bucket mapping should occur.
        All backend code must use this method.

        Args:
            age: Property age in years (lease age = as_of_year - lease_start_year)
            sale_type: Sale type string (e.g., 'New Sale', 'Resale')
            tenure: Tenure string (e.g., 'Freehold', '99-year')
            strict: If True, raise ValueError for unknown buckets (dev mode)

        Returns:
            One of PropertyAgeBucket.ALL or 'unknown'

        Raises:
            ValueError: If strict=True and result would be 'unknown'
        """
        # Priority 1: New Sale (market state, not age-based)
        if sale_type and sale_type.lower() == 'new sale':
            return cls.NEW_SALE

        # Priority 2: Freehold (no depreciation)
        if tenure and 'freehold' in tenure.lower():
            return cls.FREEHOLD

        # Priority 3: Age-based classification
        if age is None:
            if strict:
                raise ValueError("Cannot classify: age is None and not new_sale/freehold")
            return 'unknown'

        # Map age to bucket using AGE_RANGES
        for bucket, (min_age, max_age) in cls.AGE_RANGES.items():
            if max_age is None:
                # Unbounded upper (e.g., mature_resale: 25+)
                if age >= min_age:
                    return bucket
            elif age >= min_age and age < max_age:
                return bucket

        # Age doesn't fit any bucket (e.g., 0-4 years for resale)
        if strict:
            raise ValueError(f"Age {age} does not fit any canonical bucket")
        return 'unknown'

    @classmethod
    def all_keys(cls) -> list:
        """Return all valid bucket keys (for contract tests)."""
        return cls.ALL + ['unknown']  # 'unknown' is a valid fallback


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

def serialize_transaction(txn) -> Dict[str, Any]:
    """Convert DB Transaction to API v2 schema.

    Args:
        txn: Transaction ORM object

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

    return {
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


def serialize_transaction_teaser(txn) -> Dict[str, Any]:
    """Convert DB Transaction to API v2 schema with masked/teaser values.

    Used for free tier where sensitive data is hidden.

    Args:
        txn: Transaction ORM object

    Returns:
        dict with masked sensitive fields
    """
    txn_date = None
    if txn.transaction_date:
        if hasattr(txn.transaction_date, 'isoformat'):
            txn_date = txn.transaction_date.isoformat()
        else:
            txn_date = str(txn.transaction_date)

    return {
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
    """Parse and validate filter parameters (v2 enums only).

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

    # Sale type: accept v2 enum values only
    sale_type = request_args.get('saleType') or request_args.get('sale_type')
    if sale_type:
        if sale_type not in SaleType.ALL:
            raise ValidationError(
                f"Invalid sale_type: {sale_type!r}",
                field="sale_type",
                received_value=sale_type
            )
        params['sale_type_db'] = SaleType.to_db(sale_type)

    # Tenure: accept v2 enum values only
    tenure = request_args.get('tenure')
    if tenure:
        if tenure not in Tenure.ALL:
            raise ValidationError(
                f"Invalid tenure: {tenure!r}",
                field="tenure",
                received_value=tenure
            )
        params['tenure_db'] = Tenure.to_db(tenure)

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

    # Property age bucket filter: accept both v2 camelCase and v1 snake_case
    property_age_bucket = request_args.get('propertyAgeBucket') or request_args.get('property_age_bucket')
    if property_age_bucket and PropertyAgeBucket.is_valid(property_age_bucket):
        params['property_age_bucket'] = property_age_bucket

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


def serialize_aggregate_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize a single aggregate result row to API v2 schema.

    Converts:
    - sale_type values to lowercase enums (New Sale → new_sale)
    - floor_level values to lowercase enums (Mid-High → mid_high)
    - region values to lowercase (CCR → ccr)
    - Field names to camelCase (avg_psf → avgPsf)
    - Time buckets (month, quarter, year) → unified 'period' + 'periodGrain' fields

    Args:
        row: Dict from SQL query result

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
            result[AggregateFields.SALE_TYPE] = SaleType.from_db(value)
        elif key == 'floor_level' and value:
            result[AggregateFields.FLOOR_LEVEL] = FloorLevel.from_db(value)
        elif key == 'region' and value:
            result[AggregateFields.REGION] = value.lower() if isinstance(value, str) else value
        elif key == 'bedroom':
            result[AggregateFields.BEDROOM_COUNT] = value
        elif key in _AGGREGATE_FIELD_MAP:
            # Convert snake_case metric to camelCase
            result[_AGGREGATE_FIELD_MAP[key]] = value
        elif key not in TIME_BUCKET_FIELDS:
            # Pass through unchanged (district, project, count)
            result[key] = value

    return result


def serialize_aggregate_response(
    data: list,
    meta: Dict[str, Any],
) -> Dict[str, Any]:
    """Serialize full aggregate response to API v2 schema.

    Args:
        data: List of aggregate result rows
        meta: Metadata dict

    Returns:
        Complete response dict with serialized data and meta
    """
    serialized_data = [serialize_aggregate_row(row) for row in data]

    # Add API contract version and schema hash to meta
    meta_v2 = {
        **meta,
        'apiContractVersion': API_CONTRACT_VERSION,
        'contractHash': get_schema_hash('aggregate'),
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
    property_age_buckets: list = None,
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
        property_age_buckets: List of PropertyAgeBucket enum values (defaults to ALL)

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

    # Property age buckets: {value: enum, label: display}
    if property_age_buckets is None:
        property_age_buckets = PropertyAgeBucket.ALL
    property_age_buckets_v2 = [
        _make_option(bucket, PropertyAgeBucket.get_label(bucket))
        for bucket in property_age_buckets
    ]

    # Build v2 response
    return {
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
        'propertyAgeBuckets': property_age_buckets_v2,
        'apiContractVersion': API_CONTRACT_VERSION,
        'contractHash': get_schema_hash('filter_options'),
    }


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


def serialize_time_series_panel(data: list) -> list:
    """Serialize time_series panel data to v2 schema."""
    return [
        {
            DashboardFields.PERIOD: row.get('period'),
            DashboardFields.COUNT: row.get('count'),
            DashboardFields.AVG_PSF: row.get('avg_psf'),
            DashboardFields.MEDIAN_PSF: row.get('median_psf'),
            DashboardFields.TOTAL_VALUE: row.get('total_value'),
            DashboardFields.AVG_PRICE: row.get('avg_price'),
        }
        for row in data
    ]


def serialize_volume_by_location_panel(data: list) -> list:
    """Serialize volume_by_location panel data to v2 schema."""
    return [
        {
            DashboardFields.LOCATION: row.get('location'),
            DashboardFields.COUNT: row.get('count'),
            DashboardFields.TOTAL_VALUE: row.get('total_value'),
            DashboardFields.AVG_PSF: row.get('avg_psf'),
        }
        for row in data
    ]


def serialize_price_histogram_panel(data: dict) -> dict:
    """Serialize price_histogram panel data to v2 schema."""
    if not data or 'error' in data:
        return data

    result = {
        'bins': data.get('bins', []),
    }

    # Stats in v2 camelCase
    stats = data.get('stats', {})
    if stats:
        result['stats'] = {
            'totalCount': stats.get('total_count'),
            'median': stats.get('median'),
            'p5': stats.get('p5'),
            'p25': stats.get('p25'),
            'p75': stats.get('p75'),
            'p95': stats.get('p95'),
            'min': stats.get('min'),
            'max': stats.get('max'),
            'iqr': stats.get('iqr'),
        }

    # Tail info (for "N% hidden" message)
    tail = data.get('tail', {})
    if tail:
        result['tail'] = {
            'count': tail.get('count'),
            'threshold': tail.get('threshold'),
            'pct': tail.get('pct'),
        }

    return result


def serialize_bedroom_mix_panel(data: list) -> list:
    """Serialize bedroom_mix panel data to v2 schema."""
    return [
        {
            DashboardFields.PERIOD: row.get('period'),
            DashboardFields.BEDROOM_COUNT: row.get('bedroom'),
            DashboardFields.SALE_TYPE: SaleType.from_db(row.get('sale_type')),
            DashboardFields.COUNT: row.get('count'),
        }
        for row in data
    ]


def serialize_sale_type_breakdown_panel(data: list) -> list:
    """Serialize sale_type_breakdown panel data to v2 schema."""
    return [
        {
            DashboardFields.PERIOD: row.get('period'),
            DashboardFields.SALE_TYPE: SaleType.from_db(row.get('sale_type')),
            DashboardFields.COUNT: row.get('count'),
            DashboardFields.TOTAL_VALUE: row.get('total_value'),
        }
        for row in data
    ]


def serialize_summary_panel(data: dict) -> dict:
    """Serialize summary panel data to v2 schema."""
    if not data or 'error' in data:
        return data

    return {
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


# Panel serializer registry
_DASHBOARD_PANEL_SERIALIZERS = {
    'time_series': serialize_time_series_panel,
    'volume_by_location': serialize_volume_by_location_panel,
    'price_histogram': serialize_price_histogram_panel,
    'bedroom_mix': serialize_bedroom_mix_panel,
    'sale_type_breakdown': serialize_sale_type_breakdown_panel,
    'summary': serialize_summary_panel,
}


def serialize_dashboard_panel(panel_name: str, data: Any) -> Any:
    """Serialize a single dashboard panel to v2 schema.

    Args:
        panel_name: Name of the panel (e.g., 'time_series', 'summary')
        data: Raw panel data from dashboard service

    Returns:
        Serialized panel data
    """
    serializer = _DASHBOARD_PANEL_SERIALIZERS.get(panel_name)
    if serializer:
        return serializer(data)
    # Unknown panel - return as-is
    return data


def serialize_dashboard_response(
    data: Dict[str, Any],
    meta: Dict[str, Any],
) -> Dict[str, Any]:
    """Serialize full dashboard response to v2 schema.

    Args:
        data: Dict of panel_name → panel_data
        meta: Metadata dict from dashboard service

    Returns:
        Complete response dict with serialized panels and meta
    """
    serialized_data = {
        panel_name: (
            panel_data if panel_data is None or (isinstance(panel_data, dict) and 'error' in panel_data)
            else serialize_dashboard_panel(panel_name, panel_data)
        )
        for panel_name, panel_data in data.items()
    }

    # Add API contract version and schema hash to meta
    meta_v2 = {
        **meta,
        'apiContractVersion': API_CONTRACT_VERSION,
        'contractHash': get_schema_hash('dashboard'),
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
    UNIT_SOURCE = 'unitSource'           # 'csv', 'database', 'estimated', or None
    UNIT_CONFIDENCE = 'unitConfidence'   # 'high', 'medium', 'low', or None
    UNIT_NOTE = 'unitNote'               # Human-readable explanation

    # Fundamentals
    TOTAL_UNITS = 'totalUnits'
    TOP_YEAR = 'topYear'
    PROPERTY_AGE_YEARS = 'propertyAgeYears'
    AGE_SOURCE = 'ageSource'
    TENURE = 'tenure'
    DISTRICT = 'district'
    DEVELOPER = 'developer'
    FIRST_RESALE_DATE = 'firstResaleDate'

    # Resale Metrics (transaction-based, displayed as "X per 100 units")
    TOTAL_RESALE_TRANSACTIONS = 'totalResaleTransactions'
    RESALES_12M = 'resales12m'
    MARKET_TURNOVER_PCT = 'marketTurnoverPct'      # total_resale_transactions / total_units × 100
    RECENT_TURNOVER_PCT = 'recentTurnoverPct'      # resales_12m / total_units × 100

    # Risk Assessment (liquidity-based zones)
    MARKET_TURNOVER_ZONE = 'marketTurnoverZone'    # 'low', 'healthy', 'high', 'unknown'
    RECENT_TURNOVER_ZONE = 'recentTurnoverZone'    # 'low', 'healthy', 'high', 'unknown'
    OVERALL_RISK = 'overallRisk'
    INTERPRETATION = 'interpretation'

    # Gating Flags
    IS_BOUTIQUE = 'isBoutique'
    IS_BRAND_NEW = 'isBrandNew'
    IS_ULTRA_LUXURY = 'isUltraLuxury'
    IS_THIN_DATA = 'isThinData'
    UNIT_TYPE_MIXED = 'unitTypeMixed'


class LiquidityZone:
    """
    Liquidity zone enum values for v2 API.

    Zones based on turnover per 100 units:
    - 'low' (<5): Low Liquidity - harder to exit
    - 'healthy' (5-15): Healthy Liquidity - optimal for exit
    - 'high' (>15): Elevated Turnover - possible volatility
    """
    LOW = 'low'
    HEALTHY = 'healthy'
    HIGH = 'high'
    UNKNOWN = 'unknown'

    ALL = [LOW, HEALTHY, HIGH, UNKNOWN]

    @classmethod
    def is_valid(cls, value: str) -> bool:
        """Check if value is a valid liquidity zone."""
        return value in cls.ALL


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


def serialize_exit_queue_v2(result) -> Dict[str, Any]:
    """
    Serialize ExitQueueResult to v2 schema (camelCase keys + enum values).

    Note: Turnover values should be displayed as "X transactions per 100 units" in UI,
    NOT as "X%" - the *Pct suffix is internal naming only.
    """
    return {
        ExitQueueFields.PROJECT_NAME: result.project_name,
        ExitQueueFields.DATA_QUALITY: {
            ExitQueueFields.HAS_TOP_YEAR: result.data_quality.has_top_year,
            ExitQueueFields.HAS_TOTAL_UNITS: result.data_quality.has_total_units,
            ExitQueueFields.COMPLETENESS: result.data_quality.completeness,
            ExitQueueFields.SAMPLE_WINDOW_MONTHS: result.data_quality.sample_window_months,
            ExitQueueFields.WARNINGS: result.data_quality.warnings,
            ExitQueueFields.UNIT_SOURCE: result.data_quality.unit_source,
            ExitQueueFields.UNIT_CONFIDENCE: result.data_quality.unit_confidence,
            ExitQueueFields.UNIT_NOTE: result.data_quality.unit_note,
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
            ExitQueueFields.TOTAL_RESALE_TRANSACTIONS: result.resale_metrics.total_resale_transactions,
            ExitQueueFields.RESALES_12M: result.resale_metrics.resales_12m,
            ExitQueueFields.MARKET_TURNOVER_PCT: result.resale_metrics.market_turnover_pct,
            ExitQueueFields.RECENT_TURNOVER_PCT: result.resale_metrics.recent_turnover_pct
        },
        ExitQueueFields.RISK_ASSESSMENT: {
            ExitQueueFields.MARKET_TURNOVER_ZONE: result.risk_assessment.market_turnover_zone,
            ExitQueueFields.RECENT_TURNOVER_ZONE: result.risk_assessment.recent_turnover_zone,
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


def _serialize_trend_v2(trend: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize trend to v2 schema."""
    return {
        PriceBandsFields.FLOOR_DIRECTION: trend.get('floor_direction'),
        PriceBandsFields.FLOOR_SLOPE_PCT: trend.get('floor_slope_pct'),
        PriceBandsFields.OBSERVATION_MONTHS: trend.get('observation_months'),
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


def serialize_price_bands_dual(result: Dict[str, Any]) -> Dict[str, Any]:
    """
    Serialize price bands result to v2 schema.

    Args:
        result: Raw result from get_project_price_bands()

    Returns:
        Dict with v2 camelCase fields
    """
    response = serialize_price_bands_v2(result)
    response['apiContractVersion'] = API_CONTRACT_VERSION
    response['contractHash'] = get_schema_hash('price_bands')
    return response


# =============================================================================
# PSF BY PRICE BAND SERIALIZATION
# =============================================================================

class PsfByPriceBandFields:
    """Field names for PSF by price band API response (camelCase for v2)."""
    PRICE_BAND = 'priceBand'
    PRICE_BAND_MIN = 'priceBandMin'
    PRICE_BAND_MAX = 'priceBandMax'
    BEDROOM = 'bedroom'
    BEDROOM_COUNT = 'bedroomCount'
    P25 = 'p25'
    P50 = 'p50'
    P75 = 'p75'
    OBSERVATION_COUNT = 'observationCount'
    SUPPRESSED = 'suppressed'


# K-anonymity threshold for PSF by price band
PSF_BY_PRICE_BAND_K_THRESHOLD = 15


# Price band definitions (ordered)
PRICE_BANDS = [
    {'label': '$0.5M-1M', 'min': 500000, 'max': 999999, 'order': 1},
    {'label': '$1M-1.5M', 'min': 1000000, 'max': 1499999, 'order': 2},
    {'label': '$1.5M-2M', 'min': 1500000, 'max': 1999999, 'order': 3},
    {'label': '$2M-2.5M', 'min': 2000000, 'max': 2499999, 'order': 4},
    {'label': '$2.5M-3M', 'min': 2500000, 'max': 2999999, 'order': 5},
    {'label': '$3M-3.5M', 'min': 3000000, 'max': 3499999, 'order': 6},
    {'label': '$3.5M-4M', 'min': 3500000, 'max': 3999999, 'order': 7},
    {'label': '$4M-5M', 'min': 4000000, 'max': 4999999, 'order': 8},
    {'label': '$5M+', 'min': 5000000, 'max': None, 'order': 9},
]


def _bedroom_label(count: int) -> str:
    """Convert bedroom count to display label."""
    if count is None:
        return 'Unknown'
    if count >= 5:
        return '5BR'
    return f'{count}BR'


def _get_price_band_bounds(label: str) -> tuple:
    """Get min/max bounds for a price band label."""
    for band in PRICE_BANDS:
        if band['label'] == label:
            return band['min'], band['max']
    return None, None


def apply_psf_by_price_band_k_anonymity(rows: list) -> list:
    """
    Apply K-anonymity to PSF by price band data.

    Suppresses cells with fewer than K observations by setting
    p25, p50, p75 to None and suppressed to True.

    Args:
        rows: List of dicts from SQL query with keys:
              price_band, bedroom_group, observation_count, p25, p50, p75

    Returns:
        List of dicts with K-anonymity applied
    """
    result = []
    for row in rows:
        obs_count = row.get('observation_count', 0)
        price_band = row.get('price_band')
        bedroom = row.get('bedroom_group')
        band_min, band_max = _get_price_band_bounds(price_band)

        # Common fields for both suppressed and non-suppressed
        base_row = {
            'priceBand': price_band,
            'priceBandMin': band_min,
            'priceBandMax': band_max,
            'bedroom': _bedroom_label(bedroom),
            'bedroomCount': bedroom,
            'observationCount': obs_count,
            # Age and region breakdown (always include, even for suppressed)
            'avgAge': row.get('avg_age'),
            'ccrCount': row.get('ccr_count', 0),
            'rcrCount': row.get('rcr_count', 0),
            'ocrCount': row.get('ocr_count', 0),
        }

        if obs_count < PSF_BY_PRICE_BAND_K_THRESHOLD:
            result.append({
                **base_row,
                'p25': None,
                'p50': None,
                'p75': None,
                'suppressed': True
            })
        else:
            result.append({
                **base_row,
                'p25': round(row['p25'], 0) if row.get('p25') is not None else None,
                'p50': round(row['p50'], 0) if row.get('p50') is not None else None,
                'p75': round(row['p75'], 0) if row.get('p75') is not None else None,
                'suppressed': False
            })
    return result


def serialize_psf_by_price_band_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """Serialize a single PSF by price band row to API v2 schema."""
    return {
        PsfByPriceBandFields.PRICE_BAND: row['priceBand'],
        PsfByPriceBandFields.PRICE_BAND_MIN: row.get('priceBandMin'),
        PsfByPriceBandFields.PRICE_BAND_MAX: row.get('priceBandMax'),
        PsfByPriceBandFields.BEDROOM: row['bedroom'],
        PsfByPriceBandFields.BEDROOM_COUNT: row['bedroomCount'],
        PsfByPriceBandFields.P25: row['p25'],
        PsfByPriceBandFields.P50: row['p50'],
        PsfByPriceBandFields.P75: row['p75'],
        PsfByPriceBandFields.OBSERVATION_COUNT: row['observationCount'],
        PsfByPriceBandFields.SUPPRESSED: row['suppressed'],
        'avgAge': row.get('avgAge'),
        'ccrCount': row.get('ccrCount', 0),
        'rcrCount': row.get('rcrCount', 0),
        'ocrCount': row.get('ocrCount', 0),
    }


def serialize_psf_by_price_band(
    data: list,
    meta: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Serialize PSF by price band response to API v2 schema.

    Args:
        data: List of dicts (after K-anonymity applied)
        meta: Optional metadata dict

    Returns:
        Complete response dict with serialized data and meta
    """
    serialized = [serialize_psf_by_price_band_row(row) for row in data]

    response_meta = {
        'kAnonymity': {
            'threshold': PSF_BY_PRICE_BAND_K_THRESHOLD,
            'level': 'price_band_bedroom',
            'message': 'Data aggregated to protect privacy. Groups with fewer than 15 observations are suppressed.'
        },
        'apiContractVersion': API_CONTRACT_VERSION,
        'contractHash': get_schema_hash('psf_by_price_band'),
    }

    if meta:
        response_meta.update(meta)

    return {
        'data': serialized,
        'meta': response_meta,
    }
