"""
Bedroom Classifier Module

Estimates bedroom count based on unit area (sqft).
URA data doesn't include bedroom count directly, so we use area-based heuristics
based on typical Singapore condo unit sizes.
"""

def classify_bedroom(area_sqft: float) -> int:
    """
    Classify bedroom count based on unit area.
    
    Updated classification ranges based on modern Singapore condo market:
    - 1-Bedroom: < 580 sqft (Hard Floor - modern 2-Bedrooms start as low as 570-600 sqft)
    - 2-Bedroom: 580 - 800 sqft (Critical Zone - captures standard 2-Bed and 2-Bed+Study)
    - 3-Bedroom: 800 - 1,150 sqft (New Reality - 3-bedders now start at ~768 sqft)
    - 4-Bedroom+: > 1,150 sqft (Compact Luxury - new 4-bedders launching at 1,119-1,200 sqft)
    
    Args:
        area_sqft: Unit area in square feet
        
    Returns:
        Estimated bedroom count (1-4, with 4+ for larger units)
    """
    if area_sqft < 580:
        return 1  # 1-Bedroom: < 580 sqft
    elif area_sqft < 800:
        return 2  # 2-Bedroom: 580 - 800 sqft
    elif area_sqft < 1150:
        return 3  # 3-Bedroom: 800 - 1,150 sqft
    else:
        return 4  # 4-Bedroom+: > 1,150 sqft


def get_bedroom_label(bedroom_count: int) -> str:
    """Return human-readable bedroom label."""
    if bedroom_count == 1:
        return "1-Bedroom"
    elif bedroom_count == 2:
        return "2-Bedroom"
    elif bedroom_count == 3:
        return "3-Bedroom"
    elif bedroom_count == 4:
        return "4-Bedroom"  # All units > 1,150 sqft are classified as 4-Bedroom
    else:
        return "5-Bedroom+"
