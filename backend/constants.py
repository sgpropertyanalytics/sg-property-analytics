"""
Centralized Constants - SINGLE SOURCE OF TRUTH

All district-to-region mappings, bedroom classifications, and other
standardized values should be defined here and imported elsewhere.

DO NOT duplicate these definitions in other files.

Reference: URA Market Segments
- CCR: Core Central Region (Prime districts)
- RCR: Rest of Central Region (City fringe)
- OCR: Outside Central Region (Suburban)
"""

# =============================================================================
# DISTRICT TO REGION MAPPING (URA Market Segments)
# =============================================================================

# Core Central Region - Premium/Prime districts
CCR_DISTRICTS = ['D01', 'D02', 'D06', 'D07', 'D09', 'D10', 'D11']

# Rest of Central Region - City fringe
RCR_DISTRICTS = ['D03', 'D04', 'D05', 'D08', 'D12', 'D13', 'D14', 'D15', 'D20']

# Outside Central Region - Suburban (everything else: D16-D19, D21-D28)
OCR_DISTRICTS = ['D16', 'D17', 'D18', 'D19', 'D21', 'D22', 'D23', 'D24', 'D25', 'D26', 'D27', 'D28']

# All districts for validation
ALL_DISTRICTS = CCR_DISTRICTS + RCR_DISTRICTS + OCR_DISTRICTS


def get_region_for_district(district: str) -> str:
    """
    Get the market segment/region for a given district.

    Args:
        district: District code (e.g., 'D01', 'D07', '07')

    Returns:
        'CCR', 'RCR', or 'OCR'
    """
    # Normalize district format
    d = district.upper().strip()
    if not d.startswith('D'):
        d = f'D{d.zfill(2)}'

    if d in CCR_DISTRICTS:
        return 'CCR'
    elif d in RCR_DISTRICTS:
        return 'RCR'
    else:
        return 'OCR'


def get_districts_for_region(region: str) -> list:
    """
    Get all districts for a given market segment/region.

    Args:
        region: 'CCR', 'RCR', or 'OCR'

    Returns:
        List of district codes
    """
    region = region.upper().strip()
    if region == 'CCR':
        return CCR_DISTRICTS
    elif region == 'RCR':
        return RCR_DISTRICTS
    elif region == 'OCR':
        return OCR_DISTRICTS
    else:
        return []


# =============================================================================
# DISTRICT NAMES (for display)
# =============================================================================

DISTRICT_NAMES = {
    'D01': 'Boat Quay / Raffles Place / Marina',
    'D02': 'Shenton Way / Tanjong Pagar',
    'D03': 'Queenstown / Alexandra / Tiong Bahru',
    'D04': 'Harbourfront / Keppel / Telok Blangah',
    'D05': 'Buona Vista / Dover / Pasir Panjang',
    'D06': 'City Hall / Fort Canning',
    'D07': 'Bugis / Rochor',
    'D08': 'Little India / Farrer Park',
    'D09': 'Orchard / Somerset / River Valley',
    'D10': 'Tanglin / Bukit Timah / Holland',
    'D11': 'Newton / Novena',
    'D12': 'Balestier / Toa Payoh',
    'D13': 'Potong Pasir / MacPherson',
    'D14': 'Geylang / Paya Lebar / Eunos',
    'D15': 'East Coast / Marine Parade / Katong',
    'D16': 'Bedok / Upper East Coast',
    'D17': 'Loyang / Changi',
    'D18': 'Tampines / Pasir Ris',
    'D19': 'Serangoon / Hougang / Punggol',
    'D20': 'Bishan / Ang Mo Kio',
    'D21': 'Upper Bukit Timah / Clementi',
    'D22': 'Jurong / Boon Lay',
    'D23': 'Bukit Batok / Bukit Panjang',
    'D24': 'Lim Chu Kang / Tengah',
    'D25': 'Kranji / Woodlands',
    'D26': 'Upper Thomson / Springleaf',
    'D27': 'Yishun / Sembawang',
    'D28': 'Seletar / Yio Chu Kang',
}


# =============================================================================
# POSTAL SECTOR TO DISTRICT MAPPING
# =============================================================================
# Singapore postal codes are 6 digits. First 2 digits = postal sector.
# This maps postal sector → district (authoritative mapping).
#
# Reference: Singapore Post / URA postal district boundaries
# Usage: get_district_from_postal_code("588996") → "D21"

POSTAL_SECTOR_TO_DISTRICT = {
    # D01 – Boat Quay / Raffles Place / Marina (CCR)
    "01": "D01", "02": "D01", "03": "D01", "04": "D01", "05": "D01", "06": "D01",

    # D02 – Shenton Way / Tanjong Pagar (CCR)
    "07": "D02", "08": "D02",

    # D03 – Queenstown / Alexandra / Tiong Bahru (RCR)
    "14": "D03", "15": "D03", "16": "D03",

    # D04 – Harbourfront / Keppel / Telok Blangah (RCR)
    "09": "D04", "10": "D04",

    # D05 – Buona Vista / Dover / Pasir Panjang (RCR)
    "11": "D05", "12": "D05", "13": "D05",

    # D06 – City Hall / Fort Canning (CCR)
    "17": "D06",

    # D07 – Bugis / Rochor (CCR)
    "18": "D07", "19": "D07",

    # D08 – Little India / Farrer Park (RCR)
    "20": "D08", "21": "D08",

    # D09 – Orchard / Somerset / River Valley (CCR)
    "22": "D09", "23": "D09",

    # D10 – Tanglin / Bukit Timah / Holland (CCR)
    "24": "D10", "25": "D10", "26": "D10", "27": "D10",

    # D11 – Newton / Novena (CCR)
    "28": "D11", "29": "D11", "30": "D11",

    # D12 – Balestier / Toa Payoh (RCR)
    "31": "D12", "32": "D12", "33": "D12",

    # D13 – Potong Pasir / MacPherson (RCR)
    "34": "D13", "35": "D13", "36": "D13", "37": "D13",

    # D14 – Geylang / Paya Lebar / Eunos (RCR)
    "38": "D14", "39": "D14", "40": "D14", "41": "D14",

    # D15 – East Coast / Marine Parade / Katong (RCR)
    "42": "D15", "43": "D15", "44": "D15", "45": "D15",

    # D16 – Bedok / Upper East Coast (OCR)
    "46": "D16", "47": "D16", "48": "D16",

    # D17 – Loyang / Changi (OCR)
    "49": "D17", "50": "D17", "81": "D17",

    # D18 – Tampines / Pasir Ris (OCR)
    "51": "D18", "52": "D18",

    # D19 – Serangoon / Hougang / Punggol / Sengkang (OCR)
    "53": "D19", "54": "D19", "55": "D19", "82": "D19",

    # D20 – Bishan / Ang Mo Kio (RCR)
    "56": "D20", "57": "D20",

    # D21 – Upper Bukit Timah / Clementi (OCR)
    "58": "D21", "59": "D21",

    # D22 – Jurong / Boon Lay (OCR)
    "60": "D22", "61": "D22", "62": "D22", "63": "D22", "64": "D22",

    # D23 – Bukit Batok / Bukit Panjang / Choa Chu Kang (OCR)
    "65": "D23", "66": "D23", "67": "D23", "68": "D23",

    # D24 – Lim Chu Kang / Tengah (OCR)
    "69": "D24", "70": "D24", "71": "D24",

    # D25 – Kranji / Woodlands (OCR)
    "72": "D25", "73": "D25",

    # D26 – Upper Thomson / Springleaf (OCR)
    "77": "D26", "78": "D26",

    # D27 – Yishun / Sembawang (OCR)
    "75": "D27", "76": "D27",

    # D28 – Seletar / Yio Chu Kang (OCR)
    "79": "D28", "80": "D28",
}


# =============================================================================
# PLANNING AREA TO DISTRICT MAPPING (Fallback)
# =============================================================================
# URA Planning Areas → District mapping for geocoding fallback.
# Used when postal code is unavailable.
#
# Note: Some planning areas span multiple districts. This maps to the
# PRIMARY district for that area. Edge cases may need manual review.
#
# Reference: URA Master Plan 2019 Planning Areas

PLANNING_AREA_TO_DISTRICT = {
    # CCR Districts
    "Downtown Core": "D01",
    "Marina South": "D01",
    "Marina East": "D01",
    "Straits View": "D01",
    "Outram": "D02",
    "Singapore River": "D06",
    "Museum": "D06",
    "Rochor": "D07",
    "Orchard": "D09",
    "River Valley": "D09",
    "Tanglin": "D10",
    "Newton": "D11",
    "Novena": "D11",

    # RCR Districts
    "Queenstown": "D03",
    "Bukit Merah": "D04",  # Spans D03-D04, primary is D04 (Telok Blangah)
    "Clementi": "D05",
    "Kallang": "D08",  # Little India / Farrer Park area
    "Toa Payoh": "D12",
    "Serangoon": "D13",  # Potong Pasir / MacPherson
    "Geylang": "D14",
    "Paya Lebar": "D14",
    "Marine Parade": "D15",
    "Bishan": "D20",
    "Ang Mo Kio": "D20",

    # OCR Districts
    "Bedok": "D16",
    "Changi": "D17",
    "Changi Bay": "D17",
    "Tampines": "D18",
    "Pasir Ris": "D18",
    "Hougang": "D19",
    "Punggol": "D19",
    "Sengkang": "D19",
    "Bukit Timah": "D21",  # Upper Bukit Timah
    "Jurong East": "D22",
    "Jurong West": "D22",
    "Boon Lay": "D22",
    "Pioneer": "D22",
    "Tuas": "D22",
    "Bukit Batok": "D23",
    "Bukit Panjang": "D23",
    "Choa Chu Kang": "D23",
    "Tengah": "D24",
    "Lim Chu Kang": "D24",
    "Western Water Catchment": "D24",
    "Woodlands": "D25",
    "Sungei Kadut": "D25",
    "Mandai": "D26",
    "Central Water Catchment": "D26",
    "Sembawang": "D27",
    "Yishun": "D27",
    "Simpang": "D27",
    "Seletar": "D28",
}


# =============================================================================
# GLS STREET TO DISTRICT MAPPING (Geocoding Fallback)
# =============================================================================
# For GLS locations where OneMap returns NIL postal code/planning area.
# These are manually verified mappings based on URA GLS site locations.
#
# Key: lowercase street name (partial match)
# Value: District code

GLS_STREET_TO_DISTRICT = {
    # OCR
    "bedok rise": "D16",        # Bedok area
    "punggol walk": "D19",      # Punggol area
    "woodlands drive": "D25",   # Woodlands area

    # RCR
    "dorset road": "D08",       # Little India / Farrer Park (Kallang)
    "faber walk": "D05",        # Clementi / West Coast area
    "margaret drive": "D03",    # Queenstown area
    "telok ayer": "D01",        # CBD

    # CCR / RCR boundary
    "river valley road": "D09", # River Valley (CCR)
    "bukit timah road": "D21",  # Upper Bukit Timah (OCR) - Dairy Farm area
    "de souza avenue": "D19",   # Punggol / Sengkang area
    "cross street": "D01",      # CBD / Chinatown
}


def get_district_from_street(street_name: str) -> str | None:
    """
    Derive district from street name (last resort fallback for GLS).

    Args:
        street_name: Raw street/location name from GLS data

    Returns:
        District code (e.g., "D16") or None if no match
    """
    if not street_name:
        return None

    name_lower = street_name.lower().strip()

    for street_pattern, district in GLS_STREET_TO_DISTRICT.items():
        if street_pattern in name_lower:
            return district

    return None


def get_district_from_postal_code(postal_code: str) -> str | None:
    """
    Derive district from Singapore postal code.

    Args:
        postal_code: 6-digit Singapore postal code (e.g., "588996")

    Returns:
        District code (e.g., "D21") or None if invalid/unknown

    Example:
        get_district_from_postal_code("588996") → "D21"
        get_district_from_postal_code("018989") → "D01"
    """
    if not postal_code:
        return None

    # Clean and validate
    clean = str(postal_code).strip().replace(" ", "")
    if len(clean) < 2:
        return None

    # Extract postal sector (first 2 digits)
    sector = clean[:2]

    return POSTAL_SECTOR_TO_DISTRICT.get(sector)


def get_district_from_planning_area(planning_area: str) -> str | None:
    """
    Derive district from URA planning area (fallback method).

    Args:
        planning_area: URA planning area name (e.g., "Queenstown")

    Returns:
        District code (e.g., "D03") or None if unknown

    Note:
        Some planning areas span multiple districts. This returns the
        primary district for that area.
    """
    if not planning_area:
        return None

    # Try exact match first
    area = planning_area.strip()
    if area in PLANNING_AREA_TO_DISTRICT:
        return PLANNING_AREA_TO_DISTRICT[area]

    # Try case-insensitive match
    area_lower = area.lower()
    for key, district in PLANNING_AREA_TO_DISTRICT.items():
        if key.lower() == area_lower:
            return district

    return None


def get_region_from_postal_code(postal_code: str) -> str | None:
    """
    Derive market region (CCR/RCR/OCR) from postal code.

    Args:
        postal_code: 6-digit Singapore postal code

    Returns:
        Region code ('CCR', 'RCR', 'OCR') or None if invalid

    Example:
        get_region_from_postal_code("588996") → "OCR"  # D21
        get_region_from_postal_code("238823") → "CCR"  # D09
    """
    district = get_district_from_postal_code(postal_code)
    if not district:
        return None
    return get_region_for_district(district)


# =============================================================================
# BEDROOM CLASSIFICATION - See services/classifier.py for implementation
# =============================================================================
#
# SINGLE SOURCE OF TRUTH: services/classifier.py
#
# Available functions:
#   - classify_bedroom(area_sqft) - Simple fallback classifier
#   - classify_bedroom_three_tier(area_sqft, sale_type, date) - Full 3-tier logic
#   - get_bedroom_label(bedroom_count) - Get display label
#
# Three-tier thresholds account for:
#   - Tier 1: New Sale Post-Harmonization (>= June 2023) - Ultra Compact
#   - Tier 2: New Sale Pre-Harmonization (< June 2023) - Modern Compact
#   - Tier 3: Resale (Any Date) - Legacy Sizes
#


# =============================================================================
# SALE TYPE CLASSIFICATION - SINGLE SOURCE OF TRUTH
# =============================================================================

# Individual sale type DB values (use these for comparisons)
SALE_TYPE_NEW = "New Sale"
SALE_TYPE_RESALE = "Resale"
SALE_TYPE_SUB = "Sub Sale"

# Valid sale types from URA transaction data
SALE_TYPES = [SALE_TYPE_NEW, SALE_TYPE_RESALE, SALE_TYPE_SUB]

SALE_TYPE_LABELS = {
    SALE_TYPE_NEW: 'New Sale',      # Initial sale from developer
    SALE_TYPE_RESALE: 'Resale',     # Secondary market sale
    SALE_TYPE_SUB: 'Sub Sale',      # Subsale (before TOP)
}


def is_valid_sale_type(sale_type: str) -> bool:
    """Check if a sale type value is valid."""
    return sale_type in SALE_TYPES


def normalize_sale_type(raw_value) -> str | None:
    """
    Normalize sale type variants to canonical DB labels.

    Returns exact DB values (not enum slugs):
      'New Sale', 'NEW SALE', 'new sale', 'New' → "New Sale"
      'Resale', 'RESALE', 're-sale', 'Re-Sale' → "Resale"
      'Sub Sale', 'SUB SALE', 'Subsale', 'SUBSALE', 'sub-sale' → "Sub Sale"

    Returns None if unrecognized or input is null/empty.
    """
    import pandas as pd

    # Handle null/NaN/empty
    if raw_value is None or (isinstance(raw_value, float) and pd.isna(raw_value)):
        return None
    if str(raw_value).strip() == '':
        return None

    normalized = str(raw_value).strip().lower().replace('-', ' ').replace('_', ' ')

    if normalized in ('new sale', 'new', 'newsale'):
        return SALE_TYPE_NEW  # Canonical DB label
    elif normalized in ('resale', 're sale'):
        return SALE_TYPE_RESALE  # Canonical DB label
    elif normalized in ('sub sale', 'subsale', 'sub'):
        return SALE_TYPE_SUB  # Canonical DB label
    else:
        return None  # Unrecognized - will be caught by validation


# =============================================================================
# TENURE CLASSIFICATION - SINGLE SOURCE OF TRUTH
# =============================================================================

# Individual tenure DB values (use these for comparisons)
TENURE_FREEHOLD = "Freehold"
TENURE_99_YEAR = "99-year"
TENURE_999_YEAR = "999-year"

# Valid tenure types
TENURE_TYPES = [TENURE_FREEHOLD, TENURE_99_YEAR, TENURE_999_YEAR]

TENURE_TYPE_LABELS = {
    TENURE_FREEHOLD: 'Freehold',
    TENURE_99_YEAR: '99-year Leasehold',
    TENURE_999_YEAR: '999-year Leasehold',
}

# Short labels for compact UI
TENURE_TYPE_LABELS_SHORT = {
    TENURE_FREEHOLD: 'FH',
    TENURE_99_YEAR: '99yr',
    TENURE_999_YEAR: '999yr',
}


def normalize_tenure(tenure_str: str) -> str:
    """
    Normalize tenure string to standard format.

    Args:
        tenure_str: Raw tenure string from data source

    Returns:
        Normalized tenure: TENURE_FREEHOLD, TENURE_99_YEAR, TENURE_999_YEAR, or 'Unknown'
    """
    if not tenure_str:
        return 'Unknown'

    t = tenure_str.lower().strip()

    if 'freehold' in t:
        return TENURE_FREEHOLD
    elif '999' in t:
        return TENURE_999_YEAR
    elif '99' in t:
        return TENURE_99_YEAR
    else:
        return 'Unknown'


def is_valid_tenure(tenure: str) -> bool:
    """Check if a tenure value is valid."""
    return tenure in TENURE_TYPES


# =============================================================================
# TIMEFRAME SPECIFICATION - SINGLE SOURCE OF TRUTH
# =============================================================================
#
# Canonical timeframe IDs for date range filtering.
# Backend is the SOLE source of truth for date resolution.
# Frontend passes timeframe ID → Backend resolves to dates.
#
# Usage:
#   from constants import resolve_timeframe
#   bounds = resolve_timeframe('Y1')  # {'date_from': date, 'date_to_exclusive': date, 'months_in_period': 12}
#

from datetime import date
from typing import Optional
from dateutil.relativedelta import relativedelta

# Canonical timeframe options
TIMEFRAME_OPTIONS = {
    'M3': {'months': 3, 'label': '3M'},
    'M6': {'months': 6, 'label': '6M'},
    'Y1': {'months': 12, 'label': '1Y'},
    'Y3': {'months': 36, 'label': '3Y'},
    'Y5': {'months': 60, 'label': '5Y'},
}

DEFAULT_TIMEFRAME = None  # None = 'all' (no date filter, show full database)

# Back-compat mapping for legacy frontend values
TIMEFRAME_LEGACY_MAP = {
    '3m': 'M3', '6m': 'M6', '12m': 'Y1', '1y': 'Y1',
    '2y': 'Y3', '3y': 'Y3', '5y': 'Y5',
    'all': None,  # No timeframe filter
}


def normalize_timeframe_id(tf_id: Optional[str]) -> Optional[str]:
    """
    Normalize timeframe ID with back-compat support.

    Args:
        tf_id: Timeframe ID (canonical: M3, M6, Y1, Y3, Y5 or legacy: 3m, 6m, 12m, 2y)

    Returns:
        Canonical ID (M3, M6, Y1, Y3, Y5) or None for 'all' (no filter)
    """
    if not tf_id:
        return DEFAULT_TIMEFRAME
    lower = tf_id.lower()
    upper = tf_id.upper()
    # Check legacy map first (explicit key check to handle 'all' -> None)
    if lower in TIMEFRAME_LEGACY_MAP:
        return TIMEFRAME_LEGACY_MAP[lower]
    # Check canonical IDs
    if upper in TIMEFRAME_OPTIONS:
        return upper
    return DEFAULT_TIMEFRAME


def resolve_timeframe(tf_id: Optional[str], max_date: Optional[date] = None) -> dict:
    """
    Resolve timeframe to date bounds.

    Uses month boundaries (1st of month) for URA data compatibility.
    URA transaction dates are always 1st of month.

    Exclusive end = 1st of current month (excludes incomplete current month).

    Args:
        tf_id: Timeframe ID (M3, M6, Y1, Y3, Y5 or legacy values)
        max_date: Reference date (defaults to today)

    Returns:
        {
            'date_from': date,         # Inclusive start (1st of month)
            'date_to_exclusive': date, # Exclusive end (1st of current month)
            'months_in_period': int,   # Number of months in period
        }
        All values are None if tf_id is 'all' (no date filter)

    Example:
        # From Dec 29, 2025 (max_date):
        # Y1 (12 months) → [2024-12-01, 2025-12-01)
        # M3 (3 months)  → [2025-09-01, 2025-12-01)
    """
    if max_date is None:
        max_date = date.today()

    normalized = normalize_timeframe_id(tf_id)

    # Handle "all" - no date filter
    if normalized is None:
        return {'date_from': None, 'date_to_exclusive': None, 'months_in_period': None}

    option = TIMEFRAME_OPTIONS.get(normalized)
    if not option:
        option = TIMEFRAME_OPTIONS[DEFAULT_TIMEFRAME]

    # Exclusive end = 1st of current month (excludes incomplete current month)
    date_to_exclusive = date(max_date.year, max_date.month, 1)

    # Go back N months for start date
    date_from = date_to_exclusive - relativedelta(months=option['months'])

    return {
        'date_from': date_from,
        'date_to_exclusive': date_to_exclusive,
        'months_in_period': option['months'],
    }


def is_valid_timeframe(tf_id: Optional[str]) -> bool:
    """Check if a timeframe ID is valid (canonical or legacy)."""
    if not tf_id:
        return False
    lower = tf_id.lower()
    upper = tf_id.upper()
    return lower in TIMEFRAME_LEGACY_MAP or upper in TIMEFRAME_OPTIONS
