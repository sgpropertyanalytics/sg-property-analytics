"""
Small parameter normalization helpers shared by analytics routes.
"""

from typing import Any, Optional, Sequence


def first_or_none(value: Any) -> Optional[Any]:
    """Return first item if value is a non-empty sequence, else return value/None."""
    if isinstance(value, Sequence) and not isinstance(value, (str, bytes)):
        return value[0] if value else None
    return value


def first_int_or_none(value: Any) -> Optional[int]:
    """Return first value coerced to int if possible."""
    raw = first_or_none(value)
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None
