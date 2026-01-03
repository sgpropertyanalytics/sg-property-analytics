"""
Shared Pydantic types and validators for API params.

These replicate the normalization logic from normalize.py:
- CommaList: "a,b,c" -> ["a", "b", "c"]
- DistrictList: "9,d01,D02" -> ["D09", "D01", "D02"]
- DateCoercion: "2024-01-01" -> date(2024, 1, 1)
"""

from datetime import date, datetime
from typing import Annotated, List, Optional, Any

from pydantic import BeforeValidator, Field


def split_comma_list(v: Any) -> Optional[List[str]]:
    """
    Convert comma-separated string to list.

    Examples:
        "a,b,c" -> ["a", "b", "c"]
        ["a", "b"] -> ["a", "b"]
        None -> None
        "" -> None
    """
    if v is None or v == '':
        return None
    if isinstance(v, list):
        return [str(item).strip() for item in v if item]
    if isinstance(v, str):
        items = [item.strip() for item in v.split(',') if item.strip()]
        return items if items else None
    return [str(v)]


def normalize_districts(v: Any) -> Optional[List[str]]:
    """
    Normalize district codes: 9 -> D09, d01 -> D01.

    Handles:
    - Numeric input: 9 -> D09
    - Lowercase: d09 -> D09
    - Missing D prefix: 09 -> D09
    - Comma-separated: "9,10" -> ["D09", "D10"]

    Examples:
        "9,d01,D02" -> ["D09", "D01", "D02"]
        "9" -> ["D09"]
        9 -> ["D09"]
    """
    if v is None or v == '':
        return None

    # Convert to list
    if isinstance(v, str):
        raw_list = [d.strip() for d in v.split(',') if d.strip()]
    elif isinstance(v, list):
        raw_list = [str(item).strip() for item in v if item]
    else:
        raw_list = [str(v).strip()]

    if not raw_list:
        return None

    normalized = []
    for d in raw_list:
        d = d.upper()
        # Numeric only
        if d.isdigit():
            d = f"D{int(d):02d}"
        # Has D prefix but wrong format
        elif d.startswith('D') and d[1:].isdigit():
            d = f"D{int(d[1:]):02d}"
        # No D prefix but ends with digits
        elif not d.startswith('D'):
            try:
                d = f"D{int(d):02d}"
            except ValueError:
                pass  # Keep as-is if not convertible
        normalized.append(d)

    return normalized if normalized else None


def coerce_date(v: Any) -> Optional[date]:
    """
    Coerce value to date object.

    Handles:
    - date object: passthrough
    - string: parse as YYYY-MM-DD
    - None/empty: None

    Examples:
        "2024-01-01" -> date(2024, 1, 1)
        date(2024, 1, 1) -> date(2024, 1, 1)
        None -> None
    """
    if v is None or v == '':
        return None
    if isinstance(v, date):
        return v
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, str):
        try:
            return datetime.strptime(v, '%Y-%m-%d').date()
        except ValueError:
            # Let Pydantic validation handle the error
            return v  # type: ignore
    return v  # type: ignore


def coerce_int(v: Any) -> Optional[int]:
    """Coerce value to int."""
    if v is None or v == '':
        return None
    if isinstance(v, int):
        return v
    if isinstance(v, str):
        try:
            return int(v)
        except ValueError:
            return v  # type: ignore
    return int(v)


def coerce_float(v: Any) -> Optional[float]:
    """Coerce value to float."""
    if v is None or v == '':
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v)
        except ValueError:
            return v  # type: ignore
    return float(v)


def coerce_bool(v: Any) -> bool:
    """Coerce value to bool."""
    if v is None or v == '':
        return False
    if isinstance(v, bool):
        return v
    if isinstance(v, str):
        return v.lower() in ('true', '1', 'yes', 'on')
    return bool(v)


def wrap_in_list(v: Any) -> Optional[List[str]]:
    """
    Wrap value in a list WITHOUT splitting by comma.

    This replicates the old _singulars_to_plurals behavior where
    "2,3" becomes ["2,3"], not ["2", "3"].

    Examples:
        "2,3" -> ["2,3"]
        "CCR" -> ["CCR"]
        ["a", "b"] -> ["a", "b"]
        None -> None
    """
    if v is None or v == '':
        return None
    if isinstance(v, list):
        return [str(item).strip() for item in v if item]
    return [str(v).strip()]


def wrap_int_in_list(v: Any) -> Optional[List[int]]:
    """
    Wrap value in a list, coercing to int.

    This is for bedroom fields where the old normalize_params
    preserves int type: bedroom=3 -> [3], not ["3"].

    Examples:
        3 -> [3]
        "3" -> [3]
        [3, 4] -> [3, 4]
        None -> None
    """
    if v is None or v == '':
        return None
    if isinstance(v, list):
        result = []
        for item in v:
            if item is None or item == '':
                continue
            if isinstance(item, int):
                result.append(item)
            else:
                try:
                    result.append(int(item))
                except (ValueError, TypeError):
                    result.append(item)  # Keep as-is if not convertible
        return result if result else None
    if isinstance(v, int):
        return [v]
    try:
        return [int(v)]
    except (ValueError, TypeError):
        return [v]  # type: ignore


# Annotated types for use in Pydantic models
CommaList = Annotated[Optional[List[str]], BeforeValidator(split_comma_list)]
WrapList = Annotated[Optional[List[str]], BeforeValidator(wrap_in_list)]  # Wraps without splitting
IntList = Annotated[Optional[List[int]], BeforeValidator(wrap_int_in_list)]  # Wraps as int list
DistrictList = Annotated[Optional[List[str]], BeforeValidator(normalize_districts)]
CoercedDate = Annotated[Optional[date], BeforeValidator(coerce_date)]
CoercedInt = Annotated[Optional[int], BeforeValidator(coerce_int)]
CoercedFloat = Annotated[Optional[float], BeforeValidator(coerce_float)]
CoercedBool = Annotated[bool, BeforeValidator(coerce_bool)]
