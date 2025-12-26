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
