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
# BEDROOM CLASSIFICATION
# =============================================================================

def classify_bedroom(area_sqft: float) -> int:
    """
    Simple bedroom classification based on unit size.

    NOTE: For accurate classification that accounts for sale type and date,
    use services.classifier.classify_bedroom_three_tier() instead.

    Args:
        area_sqft: Unit area in square feet

    Returns:
        Bedroom count (1-5)
    """
    if area_sqft < 580:
        return 1
    elif area_sqft < 800:
        return 2
    elif area_sqft < 1200:
        return 3
    elif area_sqft < 1500:
        return 4
    else:
        return 5


BEDROOM_LABELS = {
    1: '1-Bedroom',
    2: '2-Bedroom',
    3: '3-Bedroom',
    4: '4-Bedroom',
    5: '5+ Bedroom / Penthouse',
}


# =============================================================================
# SALE TYPE CLASSIFICATION - SINGLE SOURCE OF TRUTH
# =============================================================================

# Valid sale types from URA transaction data
SALE_TYPES = ['New Sale', 'Resale', 'Sub Sale']

SALE_TYPE_LABELS = {
    'New Sale': 'New Sale',      # Initial sale from developer
    'Resale': 'Resale',          # Secondary market sale
    'Sub Sale': 'Sub Sale',      # Subsale (before TOP)
}


def is_valid_sale_type(sale_type: str) -> bool:
    """Check if a sale type value is valid."""
    return sale_type in SALE_TYPES


# =============================================================================
# TENURE CLASSIFICATION - SINGLE SOURCE OF TRUTH
# =============================================================================

# Valid tenure types
TENURE_TYPES = ['Freehold', '99-year', '999-year']

TENURE_TYPE_LABELS = {
    'Freehold': 'Freehold',
    '99-year': '99-year Leasehold',
    '999-year': '999-year Leasehold',
}

# Short labels for compact UI
TENURE_TYPE_LABELS_SHORT = {
    'Freehold': 'FH',
    '99-year': '99yr',
    '999-year': '999yr',
}


def normalize_tenure(tenure_str: str) -> str:
    """
    Normalize tenure string to standard format.

    Args:
        tenure_str: Raw tenure string from data source

    Returns:
        Normalized tenure: 'Freehold', '99-year', '999-year', or 'Unknown'
    """
    if not tenure_str:
        return 'Unknown'

    t = tenure_str.lower().strip()

    if 'freehold' in t:
        return 'Freehold'
    elif '999' in t:
        return '999-year'
    elif '99' in t:
        return '99-year'
    else:
        return 'Unknown'


def is_valid_tenure(tenure: str) -> bool:
    """Check if a tenure value is valid."""
    return tenure in TENURE_TYPES
