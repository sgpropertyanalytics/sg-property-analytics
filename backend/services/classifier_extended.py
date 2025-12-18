"""
Tenure & Lease Classifier Utilities

IMPORTANT: This module handles TENURE/LEASE classification only, NOT bedrooms.
For bedroom classification, see classifier.py which contains:
- classify_bedroom() - Simple area-based classification
- classify_bedroom_three_tier() - Sale type and date aware classification

This module provides:
- Tenure classification (Freehold, 99-year, 999-year)
- Lease start year extraction from tenure strings
- Property age calculation
- Remaining lease calculation
- Floor level classification

Separated from classifier.py to maintain clear separation of concerns:
- classifier.py = Bedroom classification (based on unit area)
- classifier_extended.py = Tenure/lease classification (based on tenure strings)
"""

from datetime import datetime
import re
from typing import Optional


def classify_tenure(tenure_str: Optional[str]) -> str:
    """Classify tenure into Freehold / 99-year / 999-year / Other / Unknown."""
    if not tenure_str:
        return "Unknown"
    tenure_lower = tenure_str.lower()
    if "freehold" in tenure_lower or "estate in perpetuity" in tenure_lower:
        return "Freehold"
    if "999" in tenure_lower:
        return "999-year"
    if "99" in tenure_lower:
        return "99-year"
    return "Other"


def extract_lease_start_year(tenure_str: Optional[str]) -> Optional[int]:
    """
    Extract lease commencement year from tenure string.

    Examples:
        "99 yrs lease commencing from 2020"  -> 2020
        "Lease from 2015"                    -> 2015
    """
    if not tenure_str:
        return None

    text = str(tenure_str)

    # Look for 4-digit year after "commencing from" or "from"
    match = re.search(r"(?:commencing\\s+from|from)\\s+(\\d{4})", text, re.IGNORECASE)
    if match:
        year = int(match.group(1))
        if 1900 <= year <= 2100:
            return year

    # Fallback: first 4-digit year anywhere in the string
    match = re.search(r"(\\d{4})", text)
    if match:
        year = int(match.group(1))
        if 1900 <= year <= 2100:
            return year

    return None


def _get_reference_year(contract_or_txn_date) -> Optional[int]:
    """
    Internal helper: infer reference year from various date formats.

    Accepts:
        - pandas.Timestamp / datetime
        - "YYYY-MM-DD" / "YYYY-MM"
    """
    if contract_or_txn_date is None:
        return None

    # datetime / Timestamp
    if hasattr(contract_or_txn_date, "year"):
        try:
            return int(contract_or_txn_date.year)
        except Exception:
            return None

    # String formats
    try:
        s = str(contract_or_txn_date)
        # Expect "YYYY-..." formats – first 4 chars are year
        if len(s) >= 4 and s[:4].isdigit():
            year = int(s[:4])
            if 1900 <= year <= 2100:
                return year
    except Exception:
        return None

    return None


def calculate_property_age(tenure_str: Optional[str], contract_or_txn_date=None) -> Optional[int]:
    """
    Calculate property age in years using lease start year as proxy.

    Args:
        tenure_str: e.g., "99 yrs lease commencing from 1995"
        contract_or_txn_date: transaction date (datetime / pandas.Timestamp /
                              "YYYY-MM" / "YYYY-MM-DD")

    Returns:
        Age in years (int) or None if insufficient information.
    """
    lease_start = extract_lease_start_year(tenure_str)
    if not lease_start:
        return None

    ref_year = _get_reference_year(contract_or_txn_date) or datetime.now().year
    age = ref_year - lease_start
    return max(0, age)


def calculate_remaining_lease(tenure_str: Optional[str], contract_or_txn_date=None) -> Optional[int]:
    """
    Calculate remaining lease in years.

    NOTE: For backward compatibility with existing analytics that rely on a
    numeric `remaining_lease` (e.g. min_lease filters), Freehold is treated
    as a very long lease (999 years) instead of None.
    """
    tenure_type = classify_tenure(tenure_str)

    if tenure_type == "Freehold":
        # Treat as "effectively infinite" lease
        return 999

    if tenure_type == "99-year":
        lease_duration = 99
    elif tenure_type == "999-year":
        lease_duration = 999
    else:
        lease_duration = None

    if lease_duration is None:
        return None

    age = calculate_property_age(tenure_str, contract_or_txn_date)
    if age is None:
        return None

    remaining = lease_duration - age
    return max(0, remaining)


def classify_property_age_band(age: Optional[int]) -> str:
    """Classify property into age bands for analysis."""
    if age is None:
        return "Unknown"
    if age <= 5:
        return "New (0-5 yrs)"
    if age <= 10:
        return "Young (6-10 yrs)"
    if age <= 20:
        return "Mature (11-20 yrs)"
    if age <= 30:
        return "Old (21-30 yrs)"
    return "Very Old (30+ yrs)"


def classify_remaining_lease_band(tenure_str: Optional[str], remaining: Optional[int]) -> str:
    """
    Classify remaining lease for CPF/loan analysis.

    For Freehold tenure, returns "Freehold" regardless of remaining value.
    """
    tenure_type = classify_tenure(tenure_str)
    if tenure_type == "Freehold":
        return "Freehold"

    if remaining is None:
        return "Unknown"
    if remaining >= 75:
        return "75+ yrs (Full CPF)"
    if remaining >= 60:
        return "60-74 yrs (CPF OK)"
    if remaining >= 30:
        return "30-59 yrs (CPF Limited)"
    return "<30 yrs (Cash Only)"


def classify_floor_level(floor_range: Optional[str]) -> str:
    """
    Classify floor into Low / Mid / High based on floor range text.

    Example:
        "01 to 05" -> "Low (1-5)"
        "16 to 20" -> "High (31+)" depending on lower bound.
    """
    if not floor_range:
        return "Unknown"
    try:
        # Parse "01 to 05" style strings
        low_part = str(floor_range).split(" to ")[0]
        low_floor = int(low_part)
        if low_floor <= 5:
            return "Low (1-5)"
        if low_floor <= 10:
            return "Mid-Low (6-10)"
        if low_floor <= 20:
            return "Mid (11-20)"
        if low_floor <= 30:
            return "Mid-High (21-30)"
        return "High (31+)"
    except Exception:
        return "Unknown"


