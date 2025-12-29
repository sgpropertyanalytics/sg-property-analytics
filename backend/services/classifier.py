"""
Bedroom Classifier Module - Consolidated

Estimates bedroom count based on unit area (sqft).
URA data doesn't include bedroom count directly, so we use area-based heuristics
based on typical Singapore condo unit sizes.

Three-tier classification system:
- Tier 1: New Sale (Post-Harmonization, >= June 1, 2023) - Ultra Compact sizes
- Tier 2: New Sale (Pre-Harmonization, < June 1, 2023) - Modern Compact sizes
- Tier 3: Resale (Any Date) - Legacy sizes

Note: classifier_extended.py handles TENURE/LEASE classification, not bedrooms.
"""

from datetime import date
from typing import Optional, Union
import pandas as pd

from constants import SALE_TYPE_NEW, SALE_TYPE_RESALE

# Harmonization date when AC ledge rules changed (affects unit sizes)
HARMONIZATION_DATE = pd.Timestamp('2023-06-01')

# =============================================================================
# BEDROOM CLASSIFICATION THRESHOLDS
# =============================================================================
# SYNC: These thresholds MUST match frontend/src/constants/index.js
# Last verified: 2024-12-29
#
# These thresholds define the sqft cutoffs for each bedroom type.
# Format: bedroom_count -> max_sqft (units below this are classified as this bedroom count)

TIER1_THRESHOLDS = {
    # Tier 1: New Sale Post-Harmonization (>= June 2023) - Ultra Compact
    # After AC ledge removal rules, developers build more compact units
    1: 580,   # 1-Bedroom: < 580 sqft
    2: 780,   # 2-Bedroom: 580 - 780 sqft
    3: 1150,  # 3-Bedroom: 780 - 1150 sqft
    4: 1450,  # 4-Bedroom: 1150 - 1450 sqft (compact post-harmonisation)
    5: float('inf')  # 5-Bedroom+: >= 1450 sqft
}

TIER2_THRESHOLDS = {
    # Tier 2: New Sale Pre-Harmonization (< June 2023) - Modern Compact
    # Modern units but with AC ledges still counted in floor area
    1: 600,   # 1-Bedroom: < 600 sqft
    2: 850,   # 2-Bedroom: 600 - 850 sqft
    3: 1200,  # 3-Bedroom: 850 - 1200 sqft
    4: 1500,  # 4-Bedroom: 1200 - 1500 sqft
    5: float('inf')  # 5-Bedroom+: >= 1500 sqft
}

TIER3_THRESHOLDS = {
    # Tier 3: Resale (Any Date) - Legacy Sizes
    # Older properties with larger typical unit sizes
    1: 600,   # 1-Bedroom: < 600 sqft
    2: 950,   # 2-Bedroom: 600 - 950 sqft
    3: 1350,  # 3-Bedroom: 950 - 1350 sqft
    4: 1650,  # 4-Bedroom: 1350 - 1650 sqft
    5: float('inf')  # 5-Bedroom+: >= 1650 sqft
}

# Simple fallback thresholds (used when sale_type/date unavailable)
SIMPLE_THRESHOLDS = {
    1: 580,   # 1-Bedroom: < 580 sqft
    2: 800,   # 2-Bedroom: 580 - 800 sqft
    3: 1200,  # 3-Bedroom: 800 - 1200 sqft
    4: 1500,  # 4-Bedroom: 1200 - 1500 sqft
    5: float('inf')  # 5-Bedroom+: >= 1500 sqft
}


def _classify_with_thresholds(area_sqft: float, thresholds: dict) -> int:
    """
    Internal helper: classify bedroom count using given thresholds.

    Args:
        area_sqft: Unit area in square feet
        thresholds: Dict mapping bedroom_count -> max_sqft

    Returns:
        Bedroom count (1-5)
    """
    if area_sqft < thresholds[1]:
        return 1
    elif area_sqft < thresholds[2]:
        return 2
    elif area_sqft < thresholds[3]:
        return 3
    elif area_sqft < thresholds[4]:
        return 4
    else:
        return 5


def classify_bedroom(area_sqft: float) -> int:
    """
    Simple bedroom classification based on unit area only.

    This is the fallback classifier used when sale_type and transaction_date
    are not available. Uses thresholds optimized for general market.

    Args:
        area_sqft: Unit area in square feet

    Returns:
        Estimated bedroom count (1-5)
    """
    return _classify_with_thresholds(area_sqft, SIMPLE_THRESHOLDS)


def classify_bedroom_three_tier(
    area_sqft: float,
    sale_type: Optional[str] = None,
    transaction_date: Optional[Union[pd.Timestamp, date, str]] = None
) -> int:
    """
    Three-tier bedroom classification based on sale type and date.

    This is the primary classifier that accounts for:
    - Post-harmonization new sales (smaller unit sizes after June 2023)
    - Pre-harmonization new sales (modern but with AC ledges)
    - Resale units (legacy larger sizes)

    Args:
        area_sqft: Unit area in square feet
        sale_type: 'New Sale' or 'Resale' (defaults to Resale if None)
        transaction_date: Transaction date (pd.Timestamp, date, or string)

    Returns:
        Estimated bedroom count (1-5)
    """
    # Normalize sale_type
    sale_type_str = str(sale_type).strip() if sale_type else SALE_TYPE_RESALE

    # Parse transaction_date if needed
    if transaction_date is None:
        sale_date = None
    elif isinstance(transaction_date, pd.Timestamp):
        sale_date = transaction_date
    elif isinstance(transaction_date, date):
        sale_date = pd.Timestamp(transaction_date)
    else:
        try:
            sale_date = pd.to_datetime(transaction_date, errors='coerce')
            if pd.isna(sale_date):
                sale_date = None
        except:
            sale_date = None

    # Determine which tier to use
    if sale_type_str == SALE_TYPE_NEW and sale_date is not None:
        if sale_date >= HARMONIZATION_DATE:
            # Tier 1: Post-Harmonization New Sale
            return _classify_with_thresholds(area_sqft, TIER1_THRESHOLDS)
        else:
            # Tier 2: Pre-Harmonization New Sale
            return _classify_with_thresholds(area_sqft, TIER2_THRESHOLDS)
    else:
        # Tier 3: Resale (or unknown)
        return _classify_with_thresholds(area_sqft, TIER3_THRESHOLDS)


def get_bedroom_label(bedroom_count: int) -> str:
    """
    Return human-readable bedroom label.

    Args:
        bedroom_count: Integer bedroom count (1-5)

    Returns:
        Label string like "2-Bedroom" or "5-Bedroom+"
    """
    if bedroom_count == 1:
        return "1-Bedroom"
    elif bedroom_count == 2:
        return "2-Bedroom"
    elif bedroom_count == 3:
        return "3-Bedroom"
    elif bedroom_count == 4:
        return "4-Bedroom"
    elif bedroom_count == 5:
        return "5-Bedroom+"
    else:
        return f"{bedroom_count}-Bedroom+"


def get_tier_name(sale_type: Optional[str], transaction_date: Optional[pd.Timestamp]) -> str:
    """
    Get the classification tier name for debugging/logging.

    Args:
        sale_type: 'New Sale' or 'Resale'
        transaction_date: Transaction date

    Returns:
        Tier name string
    """
    sale_type_str = str(sale_type).strip() if sale_type else SALE_TYPE_RESALE

    if sale_type_str == SALE_TYPE_NEW and transaction_date is not None:
        if transaction_date >= HARMONIZATION_DATE:
            return "Tier 1: New Sale Post-Harmonization (Ultra Compact)"
        else:
            return "Tier 2: New Sale Pre-Harmonization (Modern Compact)"
    else:
        return "Tier 3: Resale (Legacy Sizes)"
